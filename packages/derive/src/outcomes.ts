/**
 * The outcome entries of an operation that a platform definition owns
 * (scope contract, revision 15, section 6.1, place 7; section 4.3). The
 * data names each kind of operation that the definition owns, in
 * `outcomes`, with the mark of its rule. The rule decides each thing that
 * section 4.3 leaves to the owner: whether the kind selects, the owner's
 * local guard, whether another attempt is allowed, whether the evidence is
 * well formed, and the entry's effects and requests, as places 5 and 6.
 * The mark of a kind may hold one `send`, a send mark: its rule gives the
 * one request that has clauses, and it may give a `create` (revision 17,
 * section 6.1; row I3-23).
 *
 * The ledger (`ledger.ts`) asks an owner's rules as `Owners`, for a
 * capability and for a platform definition alike. `ownersOf` answers for
 * the platform definition that a scope pins, from the rules of its marks,
 * and for every other owner as the given owners do.
 */

import type { Digest, EffectForm, OutcomeMark, PlatformData, Send, SendForm } from "@generalbusiness/artroom-contract";
import { intentDigest } from "@generalbusiness/artroom-bytes";
import { deriveEffects } from "./effects.ts";
import type { Reading } from "./fields.ts";
import type { Fetched, Judging } from "./guards.ts";
import { overMax } from "./handlers.ts";
import type { EvidenceValueDomain, OperationRules, OutcomeDerived, OutcomeInput, Owner, Owners } from "./ledger.ts";
import { RuleFault, givenTo, outside, ruleAt, run, type AtHand, type OutcomeGives, type PlatformRules, type Rules } from "./marks.ts";
import { deriveSends } from "./sends.ts";
import type { Operation, StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isFactRef, isLocalId, isObject, own, same } from "./values.ts";

/**
 * What the judge of an outcome reads beside the state: the one reading, the
 * bounds, the scope's own history, and whether a rule that reads the clock
 * was run. `facts`: the foreign entries at hand for this outcome, which a
 * rule is given as the entries in `uses` (section 6.1, item 4). `beside`:
 * the further observations at hand, and what the rules read of them
 * (sections 4.1 and 16.1). An outcome has no intent, so no value came
 * beside one.
 */
export type OutcomeReading = Pick<Reading, "clock" | "bounds" | "own"> & { ran: { clock: boolean }; facts?: readonly Fetched[] | undefined; beside?: AtHand | undefined };

/**
 * The owners' rules, with those of the platform definition that the scope
 * pins. `reading`: what the judge of an outcome gives a rule. Without it
 * the answer serves only what reads no outcome: whether an owner has rules
 * for a kind, and the closure that it declares (section 17.2, row 5).
 */
export function ownersOf(definition: ValidDefinition, platform: PlatformRules | null | undefined, owners: Owners | null | undefined, reading?: OutcomeReading): Owners | undefined {
  if (!platform) return owners ?? undefined;
  const kinds: Readonly<Record<string, OutcomeMark>> = (definition.declared as unknown as PlatformData).outcomes ?? {};
  return {
    rules(owner: Owner, kind: string): OperationRules | null {
      if (owner !== platform.named) return owners?.rules(owner, kind) ?? null;
      const mark = own(kinds, kind);
      const rule = mark ? ruleAt(platform.rules, mark.code, "outcome") : null;
      if (!mark || !rule) return null;
      const r = rule.rules;
      /** What a rule of this outcome entry is given: no field, no subject and no signer. */
      const judging = (view: StateView, outcome: OutcomeInput, resolved?: { selected: boolean | null; further: boolean }): Judging => {
        const scope = view.scope();
        if (!reading || !scope) throw new RuleFault(`the rule ${mark.code} is asked for an outcome that no judge is deriving`);
        if (rule.clock === true) reading.ran.clock = true;
        return {
          view, definition, bounds: reading.bounds, clock: reading.clock, scope, self: scope.head.seq + 1, kind, fields: {}, fieldTypes: {}, subjects: new Map(), signer: null,
          facts: new Map((reading.facts ?? []).map((fact) => [fact.fact.hash, fact])), prepared: [], used: [], own: reading.own, platform, judged: { type: "outcome", operation: outcome.operation, attempt: outcome.attempt, owner: outcome.owner, kind: outcome.kind, result: outcome.result, evidence: outcome.evidence }, ran: reading.ran,
          // Item 2 and item 4 of what a rule is given: `observed`, and each entry in `uses`. Every rule of the one entry reads through
          // the one `beside`, so the entry retains each observation that any of them read, once.
          beside: reading.beside,
          // Revision 20, "What the judge resolved, for an outcome": the rule of the effects and the rule of the `send` are given
          // what the ledger derived, and derive neither again.
          ...(resolved ? { outcome: resolved } : {}),
        };
      };
      const answer = (given: unknown): boolean => {
        if (typeof given !== "boolean") throw outside(mark, "no answer on an outcome");
        return given;
      };
      return {
        ...(r.valueDomains ? { valueDomains: r.valueDomains } : {}),
        ...(r.values ? { values: (evidence) => run(mark, () => r.values!(evidence)) } : {}),
        selects: r.selects === true, read: r.read === true, ...(r.closure === undefined ? {} : { closure: r.closure }), ...(r.most === undefined ? {} : { most: r.most }),
        // The driver asks this outside a commit, as it asks `unknown`: the rule reads the state only.
        ...(r.ready ? { ready: (view: StateView, operation: Operation, attempt: number) => answer(run(mark, () => r.ready!(view, operation, attempt))) } : {}),
        // Revision 19, section 6.1 (row I3-35): the rule that decides a further attempt is given what every rule is given.
        retries: (result, operation, view, outcome) => answer(run(mark, () => r.retries(result, operation, givenTo(judging(view, outcome))))),
        ...(r.holds ? { holds: (view: StateView, operation: Operation, outcome: OutcomeInput) => answer(run(mark, () => r.holds!(givenTo(judging(view, outcome)), operation))) } : {}),
        ...(r.wellFormed ? { wellFormed: (result, evidence, view: StateView, outcome: OutcomeInput) => answer(run(mark, () => r.wellFormed!(result, evidence, givenTo(judging(view, outcome))))) } : {}),
        // The driver asks this outside a commit, so no judge is deriving: the rule reads the state and the scope's own entries only.
        ...(r.unknown ? { unknown: (view: StateView, operation: Operation, attempt: number, own) => run(mark, () => r.unknown!(view, operation, attempt, own)) } : {}),
        // The send of the mark is derived with the entry, whether the rule of the kind derives anything beside it or not.
        // Revision 20: the two functions that say what is to be read. Each is given the state, the outcome as it is offered and the
        // scope's own entries; the second also each entry in the outcome's `uses`. Neither is given an observation: before the rows of
        // the entry are settled nothing is at hand.
        ...(r.origin ? { origin: (view: StateView, operation: Operation, outcome: OutcomeInput) => run(mark, () => r.origin!(givenTo(judging(view, outcome)), operation)) } : {}),
        ...(r.subjects ? { subjects: (view: StateView, operation: Operation, outcome: OutcomeInput, row: number, first) => run(mark, () => r.subjects!(givenTo(judging(view, outcome)), operation, row, first)) } : {}),
        ...(r.derives || mark.send ? { derives: (view: StateView, operation: Operation, outcome: OutcomeInput, selected: boolean | null, at) => { const j = judging(view, outcome, { selected, further: at.opens !== null }); return given(mark, j, kinds, r.derives ? run(mark, () => r.derives!(givenTo(j), operation, selected)) : { effects: [], sends: [], opens: [] }); } } : {}),
      };
    },
    ...(owners?.reserves ? { reserves: (view: StateView, pinned: ValidDefinition) => owners.reserves!(view, pinned) } : {}),
  };
}

/**
 * What an outcome's rule gave, checked as the effects and the requests of
 * a mark are (section 6.1, places 5 and 6): each effect by the checks of the
 * joined list, and each request in the contract's form. An outcome entry is
 * never refused, so an effect that a check would refuse is a fault of the
 * rule, as every other value outside what a rule returns is.
 *
 * An operation that the outcome opens is stated in `opens`, with an owner
 * and a kind that `outcomes` lists. The ledger numbers it, so the effects
 * hold no `operation` and no `attempt`.
 *
 * **The one request of the mark's `send`** (revision 17, section 6.1, "A
 * request of an outcome's rule, and its clauses"; the authority note's
 * section 12.1.1, "The rule `create-repository`, whole"). When the mark of
 * the kind holds a `send`, its rule is run after the effects, as a send
 * mark of a written list is, and gives no request or one, at ordinal 0. It
 * may give a `create`. The rule of the kind then returns no request of its
 * own: an outcome entry sends at most one request, and the clause of its
 * result is found by that. A creation among the requests that `derives`
 * returns is still a fault: they have no clause and no cause.
 *
 * **The cause of a scope that an outcome entry creates** is the fourth row
 * of section 7.2's table: the digest of the intent of the act that opened
 * the outcome's operation. An operation that no act opened gives no cause,
 * so a `create` from its outcome is a fault of the rule. The child reads
 * the opening entry as a fetched fact that a field of the `create` names,
 * and checks four things of it (section 7.2, "How the child reads the entry
 * that opened the operation", revision 19; I3 delta EP1). The sending side
 * makes the same four checks here, on this scope's own history, so that no
 * creation is sealed which its child would answer `source-unverified`: the
 * entry is of this scope; it is at the position that the operation's ID
 * states, before this entry; its input is an act whose intent has the
 * digest that is the seed's cause; and it holds the `operation` effect of
 * that ordinal. And a fact among the fields of the `create` names it. A
 * creation that fails one of them is a fault, and nothing is written.
 */
function given(mark: OutcomeMark, j: Judging, kinds: Readonly<Record<string, OutcomeMark>>, gives: OutcomeGives): OutcomeDerived {
  if (!isObject(gives) || !Array.isArray(gives.effects) || !Array.isArray(gives.sends) || !Array.isArray(gives.opens)) throw outside(mark, "no effects, requests and openings");
  const { effects, sends, opens } = gives;
  if (effects.some((effect) => isObject(effect) && (effect["effect"] === "operation" || effect["effect"] === "attempt"))) throw outside(mark, "an operation among its effects: an outcome states the operations that it opens");
  if (sends.some((request) => isObject(request) && isObject(request["message"]) && request["message"]["type"] === "create")) throw outside(mark, "a creation, which only the send of its mark gives");
  // I3 merge: a kind whose mark holds no `send` may still return requests of its own, with no clause, as the stand-in rules of the
  // destination's outcomes do. When each of those kinds has its send mark (plan step 9f), `derives` returns no request at all.
  if (mark.send && sends.length > 0) throw outside(mark, "a request of its own, where its mark holds a send: an outcome entry sends at most one request");
  // Section 7.5: the bound on every send of one entry. The validator counts it for a row. An outcome entry has no row, and none of its rule's requests is cut off.
  if (sends.length > j.bounds.sendsPerEntry) throw outside(mark, "more requests than one entry sends");
  for (const open of opens) {
    const { owner, kind, attempts, for: holder }: { owner?: unknown; kind?: unknown; attempts?: unknown; for?: unknown } = isObject(open) ? open : {};
    if (owner !== j.platform?.named || typeof kind !== "string" || own(kinds, kind) === undefined || typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 1) throw outside(mark, "an operation that its definition does not own");
    // Section 17.2a, "`for`": the local ID of a holder. An outcome entry opens no holder, so it never names its own item.
    if (holder !== undefined && !isLocalId(holder)) throw outside(mark, "an operation for a holder that is no local item");
    // Revision 17: the data states the most attempts of a kind. An opening states no more.
    const stated = own(kinds, kind)?.attempts;
    if (stated !== undefined && attempts > stated) throw outside(mark, `an operation of the kind ${kind} with more attempts than its data states`);
  }
  // Section 17.2, "What a mark may start": where the data of the kind states its attempts, one outcome entry opens one operation of
  // each kind that its `most` lists, and no other (witness 18.49, case 8). The reservation counted exactly that.
  if (mark.attempts !== undefined) {
    // Section 17.2, "A request that an outcome sends": the one request of such a kind is the request of its `send`, which its
    // operation or its holder reserved. A request of the rule's own would be reserved by nobody.
    if (sends.length > 0) throw outside(mark, "a request of its own: a kind that is counted by its data sends only the request of its send");
    const listed = mark.most?.operations ?? [];
    const opened = opens.map((open) => open.kind);
    if (opened.some((kind, i) => !listed.includes(kind) || opened.indexOf(kind) !== i)) throw outside(mark, "an operation of a kind that its mark does not list, or two of one kind");
  }
  // The same derivation that a mark in a written list meets: one rule for the effects, and one for each request, in their order.
  const rules: [string, Rules[string]][] = [["effects", { place: "effect", most: effects.length, run: () => effects }], ...sends.map((request, n): [string, Rules[string]] => [`send.${n}`, { place: "send", run: () => request }])];
  const joining: Judging = { ...j, platform: { named: j.platform!.named, rules: Object.fromEntries(rules) } };
  const joined = deriveEffects(joining, [{ code: "effects", row: mark.row } as unknown as EffectForm], [], null);
  if (!joined.ok) throw outside(mark, `effects that the entry cannot hold: ${"reason" in joined ? joined.reason : joined.unavailable}`);
  // Section 6.3: `max` bounds the live items of a type, whatever opens the item. An act or a handler is refused `type-full`.
  if (joined.opened && overMax(j.view, j.definition, joined.opened.type, joined.opened.state) !== null) throw outside(mark, "effects that the entry cannot hold: type-full");
  const requests = deriveSends(joining, sends.map((_, n) => ({ code: `send.${n}`, row: mark.row }) as unknown as SendForm), joined.working, NO_CAUSE, 0, undefined, joined.opened !== null);
  if (!requests.ok) throw outside(mark, `requests that the entry cannot hold: ${"reason" in requests ? requests.reason : requests.unavailable}`);
  if (!mark.send) return { effects: joined.effects, sends: requests.sends satisfies Send[], opens };

  // The send of the mark: its own rule, of the scope's pinned version, at ordinal 0. It reads the state before the entry, as every rule does.
  const opener = openerOf(j);
  const made = deriveSends(j, [mark.send as unknown as SendForm], joined.working, opener?.cause ?? NO_CAUSE, 0, undefined, joined.opened !== null);
  if (!made.ok) throw outside(mark.send, `a request that the entry cannot hold: ${"reason" in made ? made.reason : made.unavailable}`);
  // Section 17.2, "A request that an outcome sends": where the send states `once`, at most one outcome entry of one operation makes
  // the request, and a second is a fault of the rule. The operation reserved the request once.
  if (mark.send.once === true && made.sends.some((send) => send.message.class === "request") && j.judged?.type === "outcome" && j.view.operation(j.judged.operation)?.sent === true) throw outside(mark.send, "a second request of an operation whose send states once");
  for (const { message } of made.sends) {
    if (message.class !== "request" || message.type !== "create") continue;
    const fields = isObject(message.body) && isObject(message.body["fields"]) ? Object.values(message.body["fields"]) : [];
    if (!opener) throw outside(mark.send, "a creation from the outcome of an operation that no act opened: no cause is stated for it");
    if (!fields.some((value) => isFactRef(value) && same(value, opener.fact))) throw outside(mark.send, "a creation that names no fact of the entry that opened its operation: its child could not verify its cause");
  }
  return { effects: joined.effects, sends: made.sends satisfies Send[], opens };
}

/** No cause: the cause that is given where an entry may create nothing. No seed states it, so a creation there is a fault of its rule. */
const NO_CAUSE = "sha256:" as Digest;

/**
 * The entry that opened the operation of the outcome that is judged, when
 * it gives a cause to what the outcome creates (section 7.2, the fourth
 * cause, with the four checks of revision 19): this scope's own entry at
 * the position that the operation's ID states, before the entry being
 * written, whose input is an act and which holds the `operation` effect of
 * the ID's ordinal. `cause`: the digest of that act's intent. `fact`: the
 * fact that a creation names it by. Null: no such entry, and so no cause.
 */
function openerOf(j: Judging): { cause: Digest; fact: { at: Judging["scope"]["at"]; seq: number; hash: Digest } } | null {
  if (j.judged?.type !== "outcome") return null;
  const [seq, k] = j.judged.operation.split(":").map(Number);
  const kept = seq !== undefined && Number.isSafeInteger(seq) && seq < j.self ? j.own?.(seq) : null;
  if (!kept || kept.entry.input.type !== "act" || !kept.entry.effects.some((effect) => effect.effect === "operation" && effect.k === k)) return null;
  return { cause: intentDigest(kept.entry.input.signed.intent), fact: { at: j.scope.at, seq: kept.entry.seq, hash: kept.hash } };
}

/** Evidence domains come from the rules of the pinned version, beside its data. No untrusted JSON member declares them. */
export function outcomeValueDomains(data: PlatformData, rules: Rules): Readonly<Record<string, readonly EvidenceValueDomain[]>> | null {
  if (Object.values(data.outcomes ?? {}).some((mark) => { const rule = ruleAt(rules, mark.code, "outcome")?.rules; return rule?.values !== undefined && rule.valueDomains === undefined; })) return null;
  return Object.fromEntries(Object.entries(data.outcomes ?? {}).flatMap(([kind, mark]) => {
    const domains = ruleAt(rules, mark.code, "outcome")?.rules.valueDomains;
    return domains ? [[kind, domains]] : [];
  }));
}
