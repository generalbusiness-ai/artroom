/**
 * The fold: how one sealed entry changes the state (scope contract, sections
 * 4.1 to 4.3, 6.3 and 7.2 to 7.4). `applyEntry` is the only code that changes
 * state. The runtime runs it against storage inside the commit and a
 * verifier runs it in memory, so the two cannot drift.
 *
 * It applies the entry's recorded effects and the bookkeeping that its input
 * and sends imply. It judges nothing: whether the effects are the right ones
 * is the judges' question.
 */

import type { Digest, Effect, Entry, ItemType, MemberRef, OperationId } from "@generalbusiness/artroom-contract";
import { intentDigest, seedDigest } from "@generalbusiness/artroom-bytes";
import { UNDER, historyOf, withActing, withMembers, withPrincipal, type Signer } from "./attribution.ts";
import { drawsOf, released } from "./draws.ts";
import { indexRows } from "./binding.ts";
import { HOLDER, changeHold } from "./hold.ts";
import { attemptedBy, openedBy, operationId } from "./ledger.ts";
import type { Item, ObservedHead, Party, StateWriter, Status } from "./state.ts";
import { isLocalId, isObject, isScopeRef, own, same } from "./values.ts";
import type { ValidDefinition } from "./validate/index.ts";

/** An entry that this state cannot take: out of sequence, or with an effect on nothing. */
export class FoldError extends Error {
  override readonly name = "FoldError";
}

/** The effects that change one item. */
export type ItemEffect = Extract<Effect, { effect: "state" | "party" | "ref" | "value" | "list" | "hold" }>;

/** The slot of a hold type whose member is the holder (section 6.8). */
export { HOLDER };

/** Section 6.3: a new item is in its initial state, each slot takes its default or is empty, and its revision is 1. */
export function newItem(effect: Extract<Effect, { effect: "open" }>, type: ItemType, opened: Digest | null): Item {
  const each = <T, V>(slots: Record<string, T>, value: (slot: T) => V) => Object.fromEntries(Object.entries(slots).map(([name, slot]) => [name, value(slot)]));
  return {
    id: effect.item, type: effect.type, state: effect.state, revision: 1, opened,
    parties: each(type.parties, (s): Party => (s.list ? [] : null)), refs: each(type.refs, () => null), values: each(type.values, (s) => s.default ?? null),
    attributed: [],
  };
}

/** The signer of an act entry, as the grant it was judged on states it. The judge records exactly that one grant. */
export function signerOf(entry: Entry): Signer | null {
  const grant = entry.input.type === "act" ? entry.input.authority[0] : undefined;
  return grant ? { member: grant.subject, principal: grant.principal } : null;
}

/**
 * One effect on one item. The judges use it on their working copy and the
 * fold on the state, so both see the same item afterwards. A member put in an
 * `author` slot, or made the holder of a hold, joins the item's attribution
 * history, with the signer's principal when that member is the signer. And
 * whenever a member of that history signs an entry that changes the item,
 * the principal of the grant judged for that entry joins it (section 6.7).
 */
export function changeItem(item: Item, effect: ItemEffect, definition: ValidDefinition, signer: Signer | null): Item {
  const changed = changeSlots(item, effect, definition, signer);
  const attributed = withActing(changed.attributed, signer);
  return attributed === changed.attributed ? changed : { ...changed, attributed };
}

// A slot is set by a spread with a computed key, which defines an own property whatever the slot is named (`own`, in values.ts).
function changeSlots(item: Item, effect: ItemEffect, definition: ValidDefinition, signer: Signer | null): Item {
  const type = own(definition.declared.items, item.type)!;
  const attributes = (slot: string) => own(type.parties, slot)?.author === true || (slot === HOLDER && definition.holdTypes.includes(item.type));
  const noted = (slot: string, member: MemberRef) => (attributes(slot) ? withMembers(item.attributed, withPrincipal(member, signer)) : item.attributed);
  switch (effect.effect) {
    case "state": return { ...item, state: effect.state };
    case "party": {
      const value: Party = effect.member ?? (own(type.parties, effect.slot)?.list ? [] : null);
      return { ...item, parties: { ...item.parties, [effect.slot]: value }, attributed: effect.member ? noted(effect.slot, effect.member) : item.attributed };
    }
    case "list": {
      const held = own(item.parties, effect.slot);
      const list = Array.isArray(held) ? (held as readonly MemberRef[]) : [];
      const next = effect.change === "add" ? withMembers(list, [effect.member]) : list.filter((m) => !same(m, effect.member));
      return { ...item, parties: { ...item.parties, [effect.slot]: next }, attributed: effect.change === "add" ? noted(effect.slot, effect.member) : item.attributed };
    }
    case "ref": return { ...item, refs: { ...item.refs, [effect.slot]: effect.to } };
    case "value": return { ...item, values: { ...item.values, [effect.slot]: effect.value } };
    case "hold": return changeHold(item, effect, definition, signer);
  }
}

/**
 * The heads that one retained observation states, by subject (section 16.1,
 * "How one observation follows another", rule 3, and "A key's observation
 * is also of its member"): an observation of a key counts under its key and
 * under its member, of its observed scope. An observation of a member
 * counts under its member. The rules are one subject, whichever content was
 * asked for. None: the value is no observation, as a grant with no proof
 * has.
 */
export function headsOf(proof: unknown): ObservedHead[] {
  const o = isObject(proof) ? proof["observation"] : null;
  if (!isObject(o) || !isScopeRef(o["of"]) || !isObject(o["head"]) || !isLocalId(o["head"]["seq"])) return [];
  const [of, seq] = [{ scope: o["of"].scope, inc: o["of"].inc }, o["head"]["seq"]];
  // A key is `key_` and more, and a member is `@` and more, so the one name of the rules is neither.
  if (o["subject"] === "rules") return [{ of, subject: "rules", seq }];
  return [o["key"], o["member"]].flatMap((subject) => (typeof subject === "string" ? [{ of, subject, seq }] : []));
}

export function applyEntry(writer: StateWriter, definition: ValidDefinition, entry: Entry, hash: Digest): void {
  const scope = writer.scope();
  const input = entry.input;
  if (input.type === "genesis" ? scope !== null || entry.seq !== 0 || entry.prev !== null : scope === null || entry.seq !== scope.head.seq + 1 || entry.prev !== scope.head.hash) {
    throw new FoldError(`entry ${entry.seq} does not follow the head`);
  }
  // Section 7.2: a child is provisional until its creator confirms it; a refused genesis is terminal. A directory has no creator to confirm it.
  let status: Status = scope?.status ?? (input.type === "genesis" && input.decision === "refused" ? "refused" : input.type === "genesis" && input.seed.creator === null ? "active" : "provisional");
  // Section 7.2: every send of a provisional genesis but its result, at ordinal 0, is a duty that is held until the confirmation.
  let held: readonly number[] = scope?.held ?? (status === "provisional" ? entry.sends.filter((s) => s.n !== 0).map((s) => s.n) : []);
  const signer = signerOf(entry);
  // Section 17.2a: what the entry does to the counts of the holders, on the state before it. An entry that draws past a count, or
  // that opens a held operation with no holder, is one that no judge writes.
  const drawn = drawsOf(writer, definition, entry);
  if ("fault" in drawn) throw new FoldError(`entry ${entry.seq}, ${drawn.fault}: ${drawn.detail}`);
  /** The holders whose release is asked after this entry: each whose counts, item, operation or request the entry changed. */
  const touched = new Set<number>(drawn.holders.keys());

  // Effects, in the order recorded. `before` holds each touched item as it was, or null for the one this entry opens.
  const before = new Map<number, Item | null>();
  const now = new Map<number, Item>();
  const touch = (id: number): Item => {
    const held = now.get(id) ?? writer.item(id);
    if (!held) throw new FoldError(`entry ${entry.seq} has an effect on item ${id}, which does not exist`);
    if (!before.has(id)) {
      // Section 6.6: no effect changes an item that was final before the entry.
      if (own(own(definition.declared.items, held.type)?.states, held.state)?.final) throw new FoldError(`entry ${entry.seq} has an effect on item ${id}, which was ${held.state} before it`);
      before.set(id, held);
    }
    return held;
  };
  let outcomes = 0;
  for (const effect of entry.effects) {
    switch (effect.effect) {
      case "open": {
        const type = own(definition.declared.items, effect.type);
        // Section 4.1: an entry opens at most one item, and its ID is the entry's `seq`.
        if (!type || effect.item !== entry.seq || before.has(effect.item)) throw new FoldError(`entry ${entry.seq} opens an item it cannot`);
        before.set(effect.item, null);
        now.set(effect.item, newItem(effect, type, hash));
        break;
      }
      case "state": case "party": case "list": case "ref": case "value": case "hold": {
        const item = changeItem(touch(effect.item), effect, definition, signer);
        now.set(effect.item, item);
        // Section 6.6: the scope keeps, for a slot that holds a detached text, each digest the slot has held, so that a redaction
        // can list them. The bytes are a retained input, which the fold does not keep.
        const of = effect.effect === "value" ? own(own(definition.declared.items, item.type)?.values, effect.slot)?.of : undefined;
        if (effect.effect === "value" && of?.type === "text" && of.detached && typeof effect.value === "string") {
          const held = writer.texts(effect.item, effect.slot);
          if (!held.includes(effect.value as Digest)) writer.putTexts(effect.item, effect.slot, [...held, effect.value as Digest]);
        }
        break;
      }
      case "redact":
        // The entry is the tombstone of those texts. The slot keeps its digest, and holds no text that is still to be redacted.
        now.set(effect.item, touch(effect.item));
        writer.putTexts(effect.item, effect.slot, []);
        break;
      case "relation":
        writer.putRelation({ owner: effect.owner, name: effect.name, item: effect.item, state: effect.state, revision: effect.revision });
        break;
      case "activate":
        status = "active";
        held = [];
        break;
      case "operation": {
        // Section 4.3, item 1: the operation exists from this entry, under this entry's `seq` and the record's ordinal.
        const opened = openedBy(entry.seq, effect, drawn.for.get(effect.k));
        if (typeof opened === "string" || writer.operation(opened.id)) throw new FoldError(`entry ${entry.seq} opens operation ${effect.k}, which ${typeof opened === "string" ? opened : "it has opened"}`);
        writer.putOperation(opened);
        break;
      }
      case "attempt": {
        // Section 4.3, items 2 to 7: one change of one numbered attempt. The rules are the ledger's (`ledger.ts`).
        const id: OperationId = typeof effect.operation === "string" ? effect.operation : operationId(entry.seq, effect.operation.k);
        const operation = writer.operation(id);
        const changed = operation ? attemptedBy(operation, effect, entry) : "names an operation that no entry opened";
        if (typeof changed === "string") throw new FoldError(`entry ${entry.seq}, attempt ${effect.attempt} of ${id}: it ${changed}`);
        writer.putOperation(changed);
        if (changed.for !== undefined) touched.add(changed.for);
        if (effect.result !== "opened") outcomes++;
        break;
      }
      case "record":
        // Section 6.11: a record changes only by a `record` effect of a sealed entry, which states its state and its values whole.
        // Whether the change is the right one is the capability's rule, which the judges derive: the fold judges nothing.
        writer.putRecord({ capability: effect.capability, kind: effect.kind, key: effect.key, state: effect.state, values: effect.values, seq: entry.seq });
        break;
      case "index": case "attention":
        break; // Rows and notices that no guard of this scope reads.
    }
  }

  for (const [id, item] of now) {
    const was = before.get(id) ?? null;
    // Section 6.3: an existing item that one entry changes rises by one, once, however many effects touch it.
    writer.putItem(was ? { ...item, revision: was.revision + 1 } : item);
    // Section 17.2a, "An index that an item type declares": the rows of an item are written in the transaction of the entry that
    // opens it, with the item, and by no later entry: an indexed slot is fixed. A type that declares no index has none.
    if (!was) for (const row of indexRows(definition, item, entry.at)) writer.putIndexed(item.type, row.slot, row.key, item.id);
    if (was?.state !== item.state) {
      if (was) writer.addCount(was.type, was.state, -1);
      writer.addCount(item.type, item.state, 1);
      touched.add(id);
    }
  }
  // Section 6.7: every holder of a hold is in the attribution of the item the hold is under, and so is the principal of a member of
  // that attribution who changed the hold. That item is read, not changed: its revision stays.
  for (const hold of now.values()) {
    const under = definition.holdTypes.includes(hold.type) ? own(hold.refs, UNDER) : null;
    const target = typeof under === "number" && under !== hold.id ? writer.item(under) : null;
    if (!target) continue;
    const attributed = historyOf(target, [hold], definition, signer);
    if (attributed !== target.attributed) writer.putItem({ ...target, attributed });
  }

  // Bookkeeping that the input implies.
  if (input.type === "preparation") {
    // Section 5.5, "A repeat": the scope indexes a preparation entry by its intent digest, its capability and its step. The same
    // three are sealed once. The act's idempotency key is not consumed: the intent is not admitted by this entry.
    const intent = intentDigest(input.signed.intent);
    if (writer.prepared(intent, input.capability, input.step)) throw new FoldError(`entry ${entry.seq} prepares a step that an earlier entry prepared for the same intent`);
    writer.putPrepared({ intent, capability: input.capability, step: input.step, seq: entry.seq });
  } else if (input.type === "genesis") {
    // Section 7.2: a repeat of the creation request is answered from the genesis, as a repeat of any delivery is from its entry.
    if (input.source && input.n !== null) writer.putDecided(input.source, input.n, entry.seq);
  } else if (input.type === "act") {
    // Section 4.2: the record of accepted keys is an index over the history.
    writer.putAccepted(input.signed.intent.actor, input.signed.intent.idempotencyKey, { seq: entry.seq, intent: intentDigest(input.signed.intent) });
  } else if (input.type === "delivery") {
    // Section 7.3: the owner entry this delivery consumed is recorded, and is never consumed again.
    writer.putDecided(input.from, input.n, entry.seq);
    if ("clause" in input) {
      const of = input.message.of;
      const request = writer.request(of.from.seq, of.n);
      if (!request) throw new FoldError(`entry ${entry.seq} records a result of a request this scope did not send`);
      if (drawn.account !== null) touched.add(drawn.account);
      // A request has one result. A conflict is a second incarnation's answer to a creation: it is recorded and replaces nothing.
      if (request.result === null) writer.putRequest({ ...request, result: { seq: entry.seq, clause: input.clause } });
      // Section 7.2: the first applied result of a creation is the incarnation this scope holds for that seed.
      if (input.clause === "applied" && !("scope" in request.to)) writer.putCreation(seedDigest(request.to), { inc: input.from.at.inc, seq: entry.seq });
    }
  } else if (input.type === "diagnosis") {
    const request = writer.request(input.of.seq, input.of.n);
    if (!request) throw new FoldError(`entry ${entry.seq} diagnoses a request this scope did not send`);
    if (drawn.account !== null) touched.add(drawn.account);
    writer.putRequest({ ...request, diagnosis: { seq: entry.seq, finding: input.finding } });
  }
  // Section 16.1, "The fold holds the highest head": for each subject of an observation that this entry retains, the highest
  // `head.seq` that an entry of the scope retained for it. An act and a preparation retain one in the grant that was judged. An
  // act, an outcome and a delivery of a result retain the further ones in `observed` (section 4.1).
  const proofs: unknown[] = [...(input.type === "act" || input.type === "preparation" ? [input.authority[0]?.fresh] : []), ...("observed" in input ? (input.observed ?? []) : [])];
  for (const head of proofs.flatMap(headsOf)) {
    const held = writer.observed(head.of, head.subject);
    if (held === null || head.seq > held) writer.putObserved(head);
  }

  // Section 4.3, item 5: an outcome entry records the result of its own attempt, once, and no other entry records a result.
  if (outcomes !== (input.type === "outcome" ? 1 : 0)) throw new FoldError(`entry ${entry.seq} records ${outcomes} results of attempts`);

  // Section 7.4: only a request has a result, so only a request is outstanding.
  for (const send of entry.sends) {
    if (send.message.class === "request") writer.putRequest({ seq: entry.seq, n: send.n, hash, type: send.message.type, to: send.to, result: null, diagnosis: null });
  }

  // Section 17.2, "A request that an outcome sends": where the send of the kind states `once`, the fold notes that this operation
  // made its request. A second one is a fault of the rule, and the operation reserves the request no longer.
  if (input.type === "outcome" && entry.sends.some((send) => send.message.class === "request") && own(definition.reserving?.kinds, input.kind)?.once === true) {
    const operation = writer.operation(input.operation);
    if (operation) writer.putOperation({ ...operation, sent: true });
  }
  // Section 17.2a, "What holds the count": the counts of each holder that the entry moved, and the account of each request that it
  // sent. Then "Release": a final holder keeps only what its unsettled operations and its pending requests can still reach.
  for (const [item, held] of drawn.holders) writer.putHolder(item, held);
  for (const account of drawn.accounts) writer.putAccount(account);
  for (const item of touched) {
    const [held, kept] = [writer.holder(item), released(writer, definition, item)];
    if (held !== null && !same(held, kept)) writer.putHolder(item, kept);
  }

  const genesis = scope?.genesis ?? { hash, source: input.type === "genesis" ? input.source : null, n: input.type === "genesis" ? input.n : null };
  writer.setScope({ at: entry.at, creator: scope ? scope.creator : input.type === "genesis" ? input.seed.creator : null, status, head: { seq: entry.seq, hash }, time: entry.time, genesis, held });
}
