/**
 * The rules of `hold@1` over its records (scope contract, sections 6.11,
 * 16.3 and 17.2; authority note, sections 4.2, 5.1 to 5.8, 6.2 and 13.7).
 * This is the capability's code: pure functions of the folded state, the
 * pinned definition, the one input and the commit's reading. The judges run
 * them in the commit, and a replay runs the same functions again and
 * compares. Nothing here reads a clock, storage, the network or the scope's
 * free room.
 *
 * - `hasWorkspace`: the predicate of section 5.7, one function of the
 *   definition.
 * - `holdCapability`: the four guards and the four effects, the steps
 *   `stage`, `check`, `instance` and `token`, the rules of the operations
 *   that those steps open, and what each pending record reserves.
 * - `workspaceEffects`: what an entry with a `hold` effect also derives when
 *   the definition's holds have a workspace.
 * - `boundLicense` and `licenseRefused`: the reserved license decision of
 *   section 4.2.
 *
 * A record's key and the names of its values are stated in prose by the
 * texts. The names used here are in the I3 deltas note, entries EF4 and
 * EF5. Each `record` effect states its record's state and values whole.
 *
 * The item form of the capability, the `hold` effect, is `../hold.ts`
 * (section 6.8). Nothing here changes it.
 */

import type { CapabilityName, Digest, Effect, Evidence, FieldValue, Intent, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { isDigest, isFactRef, isLocalId, isRecord, isScopeRef } from "@generalbusiness/artroom-bytes";
import type { Capabilities, CapabilityGiven, Recorded } from "../capability.ts";
import { WINDOWS, type Window } from "../grant.ts";
import { EPOCH, HOLDER, holdStates, type HoldEffect } from "../hold.ts";
import { UNDER } from "../attribution.ts";
import { operationId, operationOpening, type OperationRules, type Opening, type OutcomeDerived, type OutcomeInput, type Owners } from "../ledger.ts";
import { recordEffects, type StepDerived, type StepGiven, type StepRefusal, type Steps } from "../prepare.ts";
import type { Item, Operation, RecordState, StateView } from "../state.ts";
import { timeMs, type Clock } from "../time.ts";
import type { ValidDefinition } from "../validate/index.ts";
import { own, same } from "../values.ts";
import { isAncestryCheck } from "./ancestry.ts";

export const HOLD: CapabilityName = "hold@1";

/**
 * The kinds of the operations that `hold@1` opens. The contract names
 * `stage` and `check` (section 6.11). The others have no name in the texts
 * (I3 deltas, entry EF4).
 */
export const HOLD_KINDS = { stage: "stage", check: "check", fork: "fork", head: "head", mint: "mint", revoke: "revoke" } as const;

/** The most attempts of each operation (authority note, sections 5.1 and 5.8; section 12, G3 and U9). Proposals of the note, and the proof plan's numbers. */
export const HOLD_ATTEMPTS = { stage: 3, check: 1, fork: 3, head: 1, mint: 1, revoke: 3, deletion: 3 } as const;

/** The highest number that a license request may carry (section 6.11, "The license requests of a receiver pin"). */
export const LICENSE_BOUND = 3;

// ---------------------------------------------------------------- the predicate

/**
 * When a hold has a workspace (authority note, sections 5.7 and 13.7,
 * decided in revision 17). The holds of a definition have a fork, tokens
 * and instances exactly when the definition lists `hold@1` and uses at
 * least one `capability` guard or effect whose name is `hold`. The `hold`
 * effect is the item form and does not count. A form of `git-read@1` does
 * not count. A `carried` part and a step's kind are no guard and no effect.
 *
 * It is a fact of the definition's bytes: the validator's list of capability
 * forms holds a guard or an effect of `hold@1`. It reads no state, no clock
 * and no option. The validator's list, the commit and a replay all use this
 * one function, and no entry records its answer.
 */
export const hasWorkspace = (definition: Pick<ValidDefinition, "declared" | "underived">): boolean =>
  definition.declared.capabilities.some((c) => c.name === "hold" && c.version === 1)
  && definition.underived.some((u) => u.capability === HOLD && (u.form === "guard" || u.form === "effect"));

// ---------------------------------------------------------------- what the rules read

const record = (view: StateView, kind: string, key: readonly FieldValue[]): RecordState | null => view.record(HOLD, kind, key);
const records = (view: StateView, kind: string, states: readonly string[], member?: string, value?: unknown): readonly RecordState[] =>
  view.records(HOLD, kind, member === undefined ? { states } : { states, member, value });
/** A record as an effect states it after a change: its state, and its values whole. */
const moved = (r: Pick<RecordState, "kind" | "key" | "values">, state: string, values: Readonly<Record<string, unknown>> = {}): Recorded => ({ kind: r.kind, key: r.key, state, values: { ...r.values, ...values } });

/** A hold item, as the capability reads it (section 6.8): whether it is held, its holder, its epoch, what it is under and its end time. */
interface Hold { item: Item; held: boolean; epoch: number; under: number | null; ends: Timestamp | null }

function holdOf(view: StateView, definition: ValidDefinition, id: unknown): Hold | null {
  const item = isLocalId(id) ? view.item(id) : null;
  const type = item ? own(definition.declared.items, item.type) : undefined;
  if (!item || !type || !definition.holdTypes.includes(item.type)) return null;
  // The hold's end time is the deadline of the timed rule that ends holds of its type (section 6.8). A type with no such rule has none.
  const rule = Object.values(definition.declared.timed).find((r) => r.on === item.type && r.effects.some((e) => "hold" in e && e.hold.do === "end"));
  const ends = rule ? own(item.values, rule.deadline) : null;
  const under = own(item.refs, UNDER);
  return { item, held: item.state === holdStates(type).held, epoch: (own(item.values, EPOCH) as number | null | undefined) ?? 0, under: isLocalId(under) ? under : null, ends: typeof ends === "string" ? ends : null };
}

/**
 * The lane's own answer to "is this hold held now" (authority note, section
 * 5.2): the hold is `held`, its end time is later than the reading, and the
 * clock is not behind. So a lost timer does not extend the lease.
 */
const heldNow = (hold: Hold, clock: Clock): boolean => hold.held && !clock.behind && (hold.ends === null || timeMs(hold.ends)! > timeMs(clock.reading)!);

/** The instance of a hold that is `current`, if it has one. */
const currentInstance = (view: StateView, hold: number): RecordState | null => records(view, "instance", ["current"], "hold", hold)[0] ?? null;

/** The next number of a capability's counter (section 6.11): a key is never reused and a record is never removed, so it is the count of the kind. */
const nextNumber = (view: StateView, kind: string): number => view.recordCount(HOLD, kind) + 1;

/**
 * When a token's use has ended (authority note, section 5.7, "A mint that is
 * answered after its use has ended"). The rule is for a token that is for a
 * hold. Its use has ended when the hold is `ended`, or the hold's epoch is
 * above 1, or the instance that the token's request named is `past`.
 */
export function useEnded(view: StateView, definition: ValidDefinition, token: Pick<RecordState, "values">): boolean {
  const hold = holdOf(view, definition, token.values["hold"]);
  if (!hold) return true;   // Fail closed: a token that names no hold of this scope is given to nobody.
  const instance = record(view, "instance", [hold.item.id, token.values["instance"] as FieldValue]);
  return !hold.held || hold.epoch > 1 || instance?.state !== "current";
}

// ---------------------------------------------------------------- what the steps read of a request

/** What `stage` and `check` read of the signed intent: the commit, the commitment that the source hold is under, and for a new staging the hold and its instance. */
export interface StagedSource { commit: string; under: number; hold: number | null; instance: string | null }

/**
 * How a step reads its request from the signed intent. The texts give a
 * `source` field with three parts (authority note, section 6.2), and the
 * two pinned lane rows write other fields, so no one reading is stated
 * (I3 deltas, entry EF2). The reader is given, and there is no default. Null:
 * the intent names no such request, and the step is refused.
 */
export interface HoldReads {
  staged(intent: Intent): StagedSource | null;
  instance(intent: Intent): { hold: number; task: ScopeRef; instance: string } | null;
  token(intent: Intent): { hold: number; instance: string } | null;
}

export interface HoldOptions {
  reads: HoldReads;
  /**
   * The most tokens of one hold that may be `minting` or `live` at once. The
   * entry that ends a hold changes each of them and opens a revocation for
   * each, and it cannot be refused. The texts ask for this bound and propose
   * no number (authority note, section 5.7, "The fan-out of one entry"; I3
   * deltas, entry EF7). A renewal of a credential needs two (section 5.3,
   * rule 4).
   */
  tokensPerHold: number;
}

// ---------------------------------------------------------------- guards and effects

const refusal = (name: string): StepRefusal => ({ reason: "capability-refused", name });
const failed = (detail: string): StepRefusal => ({ reason: "guard-failed", detail });

/** The pin of one consumer for one intent (section 6.11): its key is the consumer's scope reference and the intent's digest. */
const pinOf = (view: StateView, consumer: unknown, intent: unknown): RecordState | null => (isScopeRef(consumer) && isDigest(intent) ? record(view, "pin", [consumer, intent]) : null);

/**
 * The guard `staged` (section 6.11). With a presented `pin` nothing local is
 * required: the definition's own guards tie the presented entry to the
 * intent. With none, this scope holds a `live` root for the commit, staged
 * under that commitment, with a `provisional` pin whose key is this scope
 * and this intent, and a `check` record for this intent and that root.
 */
function staged(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string {
  if (args["pin"] !== null && args["pin"] !== undefined) return isFactRef(args["pin"]) ? true : "not-staged";
  const pin = pinOf(given.view, given.scope.at, given.intent);
  const root = pin?.state === "provisional" ? record(given.view, "root", [pin.values["root"] as number]) : null;
  if (!pin || !root || root.state !== "live" || pin.values["commit"] !== args["commit"] || root.values["commit"] !== args["commit"] || root.values["under"] !== args["under"]) return "not-staged";
  return record(given.view, "check", [given.intent as Digest, root.key[0]!]) ? true : "not-staged";
}

/** The guard `pin` (section 6.11): a pin with that key exists and names that commit, and it was not released as `never-admitted`. */
function pinned(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string {
  const pin = pinOf(given.view, args["consumer"], args["intent"]);
  if (!pin) return "no-pin";
  if (pin.values["commit"] !== args["commit"]) return "pin-mismatch";
  return pin.state === "released" && pin.values["released"] === "never-admitted" ? "never-admitted" : true;
}

/** The task scope that an ended hold records (authority note, section 5.7): the task of its latest instance. */
function taskOf(view: StateView, hold: number): ScopeRef | null {
  const latest = [...records(view, "instance", ["current", "past"], "hold", hold)].sort((a, b) => b.seq - a.seq)[0];
  return latest && isScopeRef(latest.values["task"]) ? latest.values["task"] : null;
}

/** The ended hold that an `export` item names: its one reference to an item of a hold type. Null: it has none, or more than one. */
function exportedHold(view: StateView, definition: ValidDefinition, exported: unknown): Hold | null {
  const item = isLocalId(exported) ? view.item(exported) : null;
  const holds = item ? Object.values(item.refs).flatMap((ref) => { const hold = holdOf(view, definition, ref); return hold ? [hold] : []; }) : [];
  return holds.length === 1 ? holds[0]! : null;
}

/**
 * The guard `license` (section 6.11; authority note, section 4.2, the row
 * `export-license`). `from` is the task scope that the ended hold of the
 * export records. `instance` is the receiving hold's present instance. No
 * `receiver-pin` exists for the export, or the one that exists is
 * `standing` and names this hold and this instance.
 */
function license(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string {
  const { view, definition } = given;
  const source = exportedHold(view, definition, args["export"]);
  const task = source && !source.held ? taskOf(view, source.item.id) : null;
  if (!task || !isScopeRef(args["from"]) || !same(task, args["from"])) return "export-not-authorized";
  const pin = record(view, "receiver-pin", [args["export"] as number]);
  if (pin && pin.state !== "standing") return "export-not-authorized";   // the release of this export is settled
  const target = holdOf(view, definition, args["hold"]);
  const instance = target ? currentInstance(view, target.item.id) : null;
  if (!target || !heldNow(target, given.clock) || !instance || instance.key[1] !== args["instance"]) return "target-not-held";
  return !pin || (pin.values["hold"] === target.item.id && pin.values["instance"] === args["instance"]) ? true : "target-fixed";
}

/**
 * The guard `settled` (section 6.11; authority note, section 4.2, the row
 * `export-settled`). `from` is the task scope that the `receiver-pin`
 * names, and the pin is `standing`; or no pin exists, `final` is `withheld`,
 * and `from` is the task scope that the ended hold records. And the source
 * entry, as fetched, is an entry of that scope whose own effects set an item
 * to that final state. That this item is the release of this export rests
 * on the entry holding the send, which the delivery's source check has
 * shown (I3 deltas, entry EF11).
 */
function settled(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string {
  const { view, definition, source } = given;
  const pin = record(view, "receiver-pin", [args["export"] as number]);
  const hold = exportedHold(view, definition, args["export"]);
  const task = pin ? (pin.state === "standing" ? pin.values["task"] : null) : args["final"] === "withheld" && hold ? taskOf(view, hold.item.id) : null;
  if (!isScopeRef(task) || !same(task, args["from"])) return "export-not-authorized";
  const final = args["final"] === "confirmed" || args["final"] === "withheld" ? args["final"] : null;
  const by = source && isFactRef(args["by"]) && same(source.fact, args["by"]) && same(source.entry.at, task) ? source.entry : null;
  return final !== null && by?.effects.some((e) => e.effect === "state" && e.state === final) ? true : "not-final";
}

/**
 * The effect `pin-hold` (section 6.11; authority note, section 6.2, "The
 * pin's states"). With `commit`: this scope's own pin for this intent
 * becomes `held`, with the admitting entry, which is the entry being
 * written. With `consumer`, `intent` and `manifest`: that consumer's pin
 * becomes `held`, with the manifest's fact. On a pin that is `held` or
 * `released` the confirmation is recorded and the state stays: a late
 * confirmation restores nothing.
 */
function pinHold(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): readonly Recorded[] {
  const local = !("consumer" in args);
  const pin = local ? pinOf(given.view, given.scope.at, given.intent) : pinOf(given.view, args["consumer"], args["intent"]);
  if (!pin || (local && (pin.state !== "provisional" || pin.values["commit"] !== args["commit"]))) return [];
  const admitted = pin.values["admitted"] ?? (local ? given.self : (args["manifest"] ?? null));
  return [moved(pin, pin.state === "provisional" ? "held" : pin.state, { admitted })];
}

/**
 * The effect `pin-release` (section 6.11). With `consumer`, `intent`,
 * `manifest` and `by`: that consumer's pin, `provisional` or `held`, becomes
 * `released`, `unpinned`, with the entry that showed it. With `commit`
 * alone: this scope's own pin that is `held` on that commit. The form names
 * no intent, so it releases only when exactly one such pin exists (I3
 * deltas, entry EF9).
 */
function pinRelease(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): readonly Recorded[] {
  if ("consumer" in args) {
    const pin = pinOf(given.view, args["consumer"], args["intent"]);
    return pin && pin.state !== "released" ? [moved(pin, "released", { admitted: pin.values["admitted"] ?? args["manifest"] ?? null, released: "unpinned", by: args["by"] ?? null })] : [];
  }
  const mine = records(given.view, "pin", ["held"], "commit", args["commit"]).filter((pin) => same(pin.key[0], given.scope.at));
  return mine.length === 1 ? [moved(mine[0]!, "released", { released: "unpinned", by: given.self })] : [];
}

/**
 * The effect `license` (section 6.11): the `receiver-pin` becomes
 * `standing`, or stays standing, with `k`. `decided` is raised to `k` when
 * `k` is higher, and is never lowered. The target is fixed by the first
 * request applied and never changes. The entry that holds this effect is
 * the license entry.
 */
function licensed(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): readonly Recorded[] {
  const k = args["k"] as number;
  const pin = record(given.view, "receiver-pin", [args["export"] as number]);
  if (pin) return pin.state === "standing" ? [moved(pin, "standing", { k, decided: Math.max(pin.values["decided"] as number, k) })] : [];
  const target = holdOf(given.view, given.definition, args["hold"]);
  return [{ kind: "receiver-pin", key: [args["export"] as number], state: "standing", values: {
    checkpoint: args["checkpoint"], hold: args["hold"], instance: args["instance"], holder: (target && own(target.item.parties, HOLDER)) ?? null, task: args["from"], k, decided: k, by: null,
  } }];
}

/** The effect `settle` (section 6.11): the `receiver-pin` becomes `released`, with the entry that made the release final. With no pin, nothing changes. */
function settle(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): readonly Recorded[] {
  const pin = record(given.view, "receiver-pin", [args["export"] as number]);
  return pin?.state === "standing" ? [moved(pin, "released", { by: args["by"] ?? null })] : [];
}

const GUARDS: Readonly<Record<string, (args: Readonly<Record<string, unknown>>, given: CapabilityGiven) => true | string>> = { staged, pin: pinned, license, settled };
const EFFECTS: Readonly<Record<string, (args: Readonly<Record<string, unknown>>, given: CapabilityGiven) => readonly Recorded[]>> = { "pin-hold": pinHold, "pin-release": pinRelease, license: licensed, settle };

// ---------------------------------------------------------------- the reserved license decision

/**
 * Whether a license request is bound to a standing receiver pin (authority
 * note, section 4.2, "A reserved license decision", decided in revision 17;
 * section 6.11, "Bound means covered"). The binding is by source, export
 * and number alone. `from` is the envelope's source scope, as verified, and
 * `fields` the message's own fields, read by themselves: `export` names the
 * `export` item that is the pin's key, as a fact of this scope or as its
 * local ID, and `k` is higher than `decided` and at most 3. A message in
 * which either is absent or ill-typed is not bound.
 *
 * The first delivery of an envelope is the judge's to know: a repeat is
 * answered from the index of decided deliveries before anything is judged.
 *
 * The deciding entry of a bound request is a settling entry, whatever it
 * decides. Applied, the `license` effect raises `decided`. Refused, the
 * entry holds the one record of `licenseRefused` and no other effect.
 */
export function boundLicense(view: StateView, at: Pick<ScopeRef, "scope" | "inc">, from: unknown, fields: unknown): { pin: RecordState; k: number } | null {
  if (!isRecord(fields)) return null;
  const named = own(fields, "export");
  const exported = isLocalId(named) ? named : isFactRef(named) && named.at.scope === at.scope && named.at.inc === at.inc ? named.seq : null;
  const k = own(fields, "k");
  const pin = exported === null ? null : record(view, "receiver-pin", [exported]);
  if (!pin || pin.state !== "standing" || !isScopeRef(from) || !same(pin.values["task"], from)) return null;
  return typeof k === "number" && Number.isSafeInteger(k) && k > (pin.values["decided"] as number) && k <= LICENSE_BOUND ? { pin, k } : null;
}

/** The one record of a bound request that is refused (section 6.11, the effect with no form): `decided` becomes the request's number, and nothing else of the pin changes. */
export const licenseRefused = (bound: { pin: RecordState; k: number }): Recorded => moved(bound.pin, bound.pin.state, { decided: bound.k });

// ---------------------------------------------------------------- an entry with a `hold` effect

/**
 * The seed of a new hold's fork (authority note, section 5.2): the commit of
 * the latest act of this scope that was admitted on a `live` root staged
 * under the hold's own commitment and still holds its pin; or the
 * destination branch's head, which is read by an operation. A report or a
 * manifest of another commitment is never a seed, and neither is a commit
 * that was pushed and never reported.
 *
 * `from` is `report` or `manifest`: the type of the item that the admitting
 * entry opened. An admitting entry that opened neither is no seed (I3
 * deltas, entry EF8).
 */
function seedOf(view: StateView, at: ScopeRef, under: number | null): { commit: string | null; from: string; fact: number | null; under: number | null } {
  const seeds = records(view, "pin", ["held"]).flatMap((pin) => {
    const root = same(pin.key[0], at) ? record(view, "root", [pin.values["root"] as number]) : null;
    const admitted = pin.values["admitted"];
    const from = isLocalId(admitted) ? view.item(admitted)?.type : undefined;
    return root?.state === "live" && under !== null && root.values["under"] === under && isLocalId(admitted) && (from === "report" || from === "manifest") ? [{ commit: root.values["commit"] as string, from, fact: admitted, under }] : [];
  });
  return seeds.sort((a, b) => b.fact - a.fact)[0] ?? { commit: null, from: "destination-head", fact: null, under };
}

/**
 * What an entry with `hold` effects also derives when the definition's
 * holds have a workspace (authority note, section 5.7, "What is derived, and
 * at which entry"). It runs after the entry's declared effects. `holds` are
 * the entry's `hold` effects, with those of holds that end with what they
 * are under. `working` gives a hold as the entry's written effects left it,
 * for the one that the entry opens. `k` is the ordinal of the first
 * operation that this function may open in the entry.
 *
 * - Opening: a `fork` record, `creating`, with its seed, and one operation:
 *   the fork's creation, or the read of the head when the seed is the
 *   destination's head.
 * - Renewal by the holder: nothing.
 * - A renewal that changes the holder, an end and an expiry: the instance
 *   that is `current` becomes `past`, and each `live` token of the hold
 *   becomes `revoking`, with its revocation operation. A token that is
 *   `minting` stays so: `mint`, below. The fork does not move.
 *
 * When the predicate is false, nothing: the item form only. The effects are
 * total, as the `hold` effects are. Each change is a `record` effect and
 * each opening an `operation` effect.
 */
export function workspaceEffects(view: StateView, definition: ValidDefinition, self: number, k: number, holds: readonly HoldEffect[], working: (id: number) => Item | null = () => null): Effect[] {
  const scope = view.scope();
  if (!scope || !hasWorkspace(definition)) return [];
  const made: Recorded[] = [];
  const opens: Opening[] = [];
  for (const effect of holds) {
    const before = holdOf(view, definition, effect.item);
    if (effect.change === "open") {
      const under = own((working(effect.item) ?? before?.item)?.refs, UNDER);
      const seed = seedOf(view, scope.at, isLocalId(under) ? under : null);
      const head = seed.commit === null;
      made.push({ kind: "fork", key: [effect.item], state: "creating", values: { seed, operation: operationId(self, k + opens.length), id: null, name: null } });
      opens.push({ owner: HOLD, kind: head ? HOLD_KINDS.head : HOLD_KINDS.fork, attempts: head ? HOLD_ATTEMPTS.head : HOLD_ATTEMPTS.fork });
    } else if (effect.change === "end" || (before !== null && effect.epoch > before.epoch)) {
      const instance = currentInstance(view, effect.item);
      if (instance) made.push(moved(instance, "past"));
      for (const token of records(view, "token", ["live"], "hold", effect.item)) {
        made.push(moved(token, "revoking", { revocation: operationId(self, k + opens.length) }));
        opens.push({ owner: HOLD, kind: HOLD_KINDS.revoke, attempts: HOLD_ATTEMPTS.revoke });
      }
    }
  }
  return [...recordEffects(HOLD, made), ...opens.flatMap((open, i) => operationOpening(k + i, open))];
}

// ---------------------------------------------------------------- the steps

/**
 * The action whose grant every step of a hold is judged on: the grant of the
 * act that opens the hold's type (section 6.11, the step `stage`). Null:
 * no act opens that type, or two acts with different grants do.
 */
function openingGrant(definition: ValidDefinition, type: string | undefined): string | null {
  const types = type === undefined ? definition.holdTypes : [type];
  const grants = new Set(Object.values(definition.declared.acts).filter((act) => act.step === "open" && act.on !== null && types.includes(act.on) && act.effects.some((e) => "hold" in e && e.hold.do === "open")).map((act) => act.grant));
  return grants.size === 1 ? [...grants][0]! : null;
}

function stepGrant(reads: HoldReads, step: string, { view, definition, scope, intent }: Omit<StepGiven, "signer">): { action: string; window: Window } | null {
  // The step `check` reuses a root and writes nothing outside: the act's own grant, in its ordinary window (section 6.11; authority
  // note, section 6.2, "A new staging, and the reuse of a completed one"). For an intent that is addressed to another scope the
  // act is not this scope's, and the grant is the one that this scope judges staging on (I3 deltas, entry EF3).
  const act = step === "check" && same(intent.to, scope.at) ? own(definition.declared.acts, intent.kind) : undefined;
  if (act) return { action: act.grant, window: WINDOWS.ordinary };
  const hold = step === "instance" ? reads.instance(intent)?.hold : step === "token" ? reads.token(intent)?.hold : reads.staged(intent)?.hold;
  const action = openingGrant(definition, isLocalId(hold) ? view.item(hold)?.type : undefined);
  return action === null ? null : { action, window: step === "check" ? WINDOWS.ordinary : WINDOWS.once };
}

/** A hold that the signer's member holds now, or the refusal. */
function ownHeld(given: StepGiven, id: number): Hold | null {
  const hold = holdOf(given.view, given.definition, id);
  return hold && heldNow(hold, given.clock) && same(own(hold.item.parties, HOLDER) ?? null, given.signer.member) ? hold : null;
}

/**
 * The step `stage` (section 6.11; authority note, section 6.2, "The order of
 * steps", steps 1 and 2): a new staging. The signer's own hold is `held`,
 * its end time has not passed on this scope's clock, it is under the
 * commitment named, and the instance named is its current one. This scope
 * holds no `live` root for the commit under that commitment. It derives a
 * `root`, `creating`, and the operation `stage`, whose attempts create the
 * ref. A signer with no held hold is refused `not-staged`.
 */
function stage(reads: HoldReads, given: StepGiven): StepDerived | { refused: StepRefusal } {
  const source = reads.staged(given.intent);
  if (!source) return { refused: failed("the intent names no commit to stage") };
  const hold = source.hold === null ? null : ownHeld(given, source.hold);
  if (!hold || hold.under !== source.under || source.instance === null || record(given.view, "instance", [hold.item.id, source.instance])?.state !== "current") return { refused: refusal("not-staged") };
  if (records(given.view, "root", ["live"], "commit", source.commit).some((root) => root.values["under"] === source.under)) return { refused: failed("a live root holds this commit under this commitment: the step `check` reuses it") };
  const number = nextNumber(given.view, "root");
  return {
    records: [{ kind: "root", key: [number], state: "creating", values: {
      commit: source.commit, hold: hold.item.id, instance: source.instance, under: source.under, intent: given.digest, consumer: given.intent.to, operation: operationId(given.self, 0),
    } }],
    opens: [{ owner: HOLD, kind: HOLD_KINDS.stage, attempts: HOLD_ATTEMPTS.stage }],
  };
}

/**
 * The step `check` (section 6.11): the reuse of a completed staging. A
 * `live` root for the commit must exist, staged under the commitment named,
 * from a hold whose holder was the signer's member. The hold may have
 * ended. It derives the `provisional` pin, if there is none, and the
 * operation `check`: one read of the canonical repository.
 */
function check(reads: HoldReads, given: StepGiven): StepDerived | { refused: StepRefusal } {
  const source = reads.staged(given.intent);
  if (!source) return { refused: failed("the intent names no commit to check") };
  const { view, definition, digest, intent, self } = given;
  const root = [...records(view, "root", ["live"], "commit", source.commit)].filter((r) => r.values["under"] === source.under).sort((a, b) => (b.key[0] as number) - (a.key[0] as number))[0];
  const staged = root ? holdOf(view, definition, root.values["hold"]) : null;
  if (!root || !staged || !same(own(staged.item.parties, HOLDER) ?? null, given.signer.member)) return { refused: refusal("not-staged") };
  const pin = record(view, "pin", [intent.to as ScopeRef, digest]);
  // A pin that is `held` or `released` belongs to an intent that was admitted or settled. Nothing is prepared for it again.
  if (pin && pin.state !== "provisional") return { refused: refusal("not-staged") };
  const values = { root: root.key[0]!, commit: source.commit, admitted: null, released: null, by: null, check: operationId(self, 0) };
  return { records: [pin ? moved(pin, "provisional", values) : { kind: "pin", key: [intent.to as ScopeRef, digest], state: "provisional", values }], opens: [{ owner: HOLD, kind: HOLD_KINDS.check, attempts: HOLD_ATTEMPTS.check }] };
}

/** The two conditions of revision 17 on the steps `instance` and `token`, then the hold itself (authority note, section 5.7, the table of steps). */
function workspaceOf(given: StepGiven, id: number): Hold | { refused: StepRefusal } {
  if (!hasWorkspace(given.definition)) return { refused: refusal("no-workspace") };
  const hold = ownHeld(given, id);
  if (!hold) return { refused: failed("the hold is not held by the signer's member now") };
  // A hold is opened at epoch 1, and while it is `held` its epoch is above 1 exactly when a renewal changed its holder.
  return hold.epoch === 1 ? hold : { refused: refusal("holder-changed") };
}

/** The step `instance` (authority note, section 5.7): the `instance` record, `current`, with the task scope and the hold's epoch, and the earlier one, `past`. */
function instance(reads: HoldReads, given: StepGiven): StepDerived | { refused: StepRefusal } {
  const asked = reads.instance(given.intent);
  if (!asked) return { refused: failed("the intent names no hold, task scope and instance") };
  const hold = workspaceOf(given, asked.hold);
  if ("refused" in hold) return hold;
  if (record(given.view, "instance", [asked.hold, asked.instance])) return { refused: failed("the instance ID is not new") };
  const earlier = currentInstance(given.view, asked.hold);
  return { records: [...(earlier ? [moved(earlier, "past")] : []), { kind: "instance", key: [asked.hold, asked.instance], state: "current", values: { hold: asked.hold, task: asked.task, epoch: hold.epoch } }], opens: [] };
}

/**
 * The step `token` (authority note, section 5.7): the instance named is
 * `current` and the `fork` is `selected`. It derives a `token` record,
 * `minting`, and its mint operation with its one attempt.
 */
function token(options: HoldOptions, given: StepGiven): StepDerived | { refused: StepRefusal } {
  const asked = options.reads.token(given.intent);
  if (!asked) return { refused: failed("the intent names no hold and instance") };
  const hold = workspaceOf(given, asked.hold);
  if ("refused" in hold) return hold;
  if (record(given.view, "instance", [asked.hold, asked.instance])?.state !== "current") return { refused: failed("the instance named is not the hold's current one") };
  if (record(given.view, "fork", [asked.hold])?.state !== "selected") return { refused: failed("the hold's fork is not selected") };
  if (records(given.view, "token", ["minting", "live"], "hold", asked.hold).length >= options.tokensPerHold) return { refused: failed(`the hold has ${options.tokensPerHold} tokens that are minting or live`) };
  return {
    records: [{ kind: "token", key: [nextNumber(given.view, "token")], state: "minting", values: { purpose: "workspace", hold: asked.hold, instance: asked.instance, mint: operationId(given.self, 0), id: null, ends: null, revocation: null } }],
    opens: [{ owner: HOLD, kind: HOLD_KINDS.mint, attempts: HOLD_ATTEMPTS.mint }],
  };
}

// ---------------------------------------------------------------- the operations

const NOTHING: OutcomeDerived = { effects: [], sends: [], opens: [] };
const recorded = (made: readonly Recorded[], opens: readonly Opening[] = []): OutcomeDerived => ({ effects: recordEffects(HOLD, made), sends: [], opens });
/** The record that names an operation in one of its values. */
const namedBy = (view: StateView, kind: string, states: readonly string[], member: string, operation: Operation): RecordState | null => records(view, kind, states, member, operation.id)[0] ?? null;
/** The entry that an outcome is being written as: the next one. Operation `k` that it opens has the ID `operationId(next, k)`. */
const next = (view: StateView): number => view.scope()!.head.seq + 1;

const basis = (confirmed: Evidence["basis"]) => (result: OutcomeInput["result"], evidence: Evidence): boolean => result === "unknown" || evidence.basis === (result === "confirmed" ? confirmed : "own-answer");

/**
 * The body of the evidence of a `confirmed` check (section 6.11, the step
 * `check`): the ancestry record, or null for a read that was cut short or a
 * walk that passed a bound, which gives a record that is `too-large` and no
 * judgment (I3 deltas, entry EF5).
 */
const isCheckEvidence = (body: unknown): body is { record: unknown } => isRecord(body) && Object.keys(body).length === 1 && (body["record"] === null || isAncestryCheck(body["record"]));

/** The body of the evidence of a `confirmed` mint: the host's token ID and end time (authority note, section 5.7, "Evidence of each outside effect"; I3 deltas, entry EF5). */
const minted = (body: unknown): { token: string; ends: Timestamp } | null => (isRecord(body) && typeof body["token"] === "string" && body["token"] !== "" && timeMs(body["ends"]) !== null ? { token: body["token"], ends: body["ends"] as Timestamp } : null);

function operationRules(definition: (view: StateView) => ValidDefinition | null): Readonly<Record<string, OperationRules>> {
  return {
    // Section 6.11, the step `stage`: its outcome `confirmed`, on a read that shows the ref, makes the root `live`, records the
    // `provisional` pin and opens the operation `check`. An attempt that is refused or unknown leaves the root `creating`.
    [HOLD_KINDS.stage]: {
      selects: false, read: true, retries: () => true, closure: 2 * HOLD_ATTEMPTS.check, wellFormed: basis("read"),
      derives: (view, operation, outcome) => {
        const root = outcome.result === "confirmed" ? namedBy(view, "root", ["creating"], "operation", operation) : null;
        if (!root) return NOTHING;
        const key = [root.values["consumer"] as ScopeRef, root.values["intent"] as Digest];
        const pin = record(view, "pin", key);
        // A pin that is `held` or `released` is of an intent that was admitted or settled: it does not move, and no check is opened for it.
        if (pin && pin.state !== "provisional") return recorded([moved(root, "live")]);
        const values = { root: root.key[0]!, commit: root.values["commit"], admitted: null, released: null, by: null, check: operationId(next(view), 0) };
        return recorded([moved(root, "live"), pin ? moved(pin, "provisional", values) : { kind: "pin", key, state: "provisional", values }], [{ owner: HOLD, kind: HOLD_KINDS.check, attempts: HOLD_ATTEMPTS.check }]);
      },
    },
    // Section 6.11, the step `check`: its outcome entry is the check entry. It records the `check` record, `recorded`, or
    // `too-large` when the walk passed a bound (`gitread.ts` has the evidence's form). Authority note, section 5.7, "Evidence of
    // each outside effect", the row of the ancestry read: it is shown by that read's own answer, and the evidence is the ancestry
    // record. So the basis is `own-answer`, as a first outcome and as the late answer after an `unknown` (section 5.4, rule 2). No
    // other read is decisive for it. The operation has one attempt: a check that stays `unknown` is read again as a new operation.
    [HOLD_KINDS.check]: {
      selects: false, read: false, retries: () => false, wellFormed: (result, evidence) => basis("own-answer")(result, evidence) && (result !== "confirmed" || isCheckEvidence(evidence.body)),
      derives: (view, operation, outcome) => {
        const pin = outcome.result === "confirmed" ? namedBy(view, "pin", ["provisional"], "check", operation) : null;
        const root = pin ? record(view, "root", [pin.values["root"] as number]) : null;
        if (!pin || !root) return NOTHING;
        const found = (outcome.evidence.body as { record: unknown }).record;
        return recorded([{ kind: "check", key: [pin.key[1]!, root.key[0]!], state: found === null ? "too-large" : "recorded", values: {
          intent: pin.key[1], commit: pin.values["commit"], consumer: pin.key[0], lane: view.scope()!.at, hold: root.values["hold"], instance: root.values["instance"], root: root.key[0],
          // Section 16.3: the attribution list of the source commitment, as it is at the check entry.
          attribution: view.item(root.values["under"] as number)?.attributed ?? [], record: found,
        } }]);
      },
    },
    // Authority note, section 5.7, "A mint that is answered after its use has ended". The answer is the attempt's own, as a first
    // outcome or as a late answer after an `unknown`. Confirmed while the use has not ended: `live`. Confirmed after it ended:
    // `revoking`, straight from `minting`, with the revocation by that ID. The token is never `live`. Refused: `ended`, and nothing
    // is revoked because nothing was minted. Unknown: it stays `minting`, and nothing is minted again for that operation.
    [HOLD_KINDS.mint]: {
      selects: false, read: false, retries: () => false, closure: 2 * HOLD_ATTEMPTS.revoke,
      wellFormed: (result, evidence) => basis("own-answer")(result, evidence) && (result !== "confirmed" || minted(evidence.body) !== null),
      derives: (view, operation, outcome) => {
        const token = namedBy(view, "token", ["minting"], "mint", operation);
        const pinned = definition(view);
        if (!token || outcome.result === "unknown") return NOTHING;
        if (outcome.result === "refused") return recorded([moved(token, "ended")]);
        const { token: id, ends } = minted(outcome.evidence.body)!;
        if (pinned && !useEnded(view, pinned, token)) return recorded([moved(token, "live", { id, ends })]);
        return recorded([moved(token, "revoking", { id, ends, revocation: operationId(next(view), 0) })], [{ owner: HOLD, kind: HOLD_KINDS.revoke, attempts: HOLD_ATTEMPTS.revoke }]);
      },
    },
    // A revocation by the token's ID: its `confirmed` outcome makes the token `ended` (authority note, section 5.7, the record `token`).
    [HOLD_KINDS.revoke]: {
      selects: false, read: false, retries: () => true, wellFormed: basis("own-answer"),
      derives: (view, operation, outcome) => {
        const token = outcome.result === "confirmed" ? namedBy(view, "token", ["revoking"], "revocation", operation) : null;
        return token ? recorded([moved(token, "ended")]) : NOTHING;
      },
    },
  };
}

// ---------------------------------------------------------------- capacity

/**
 * The entries that the pending records of `hold@1` reserve, beside their
 * open operations, which `owed` counts by row 5 (section 17.2, row 6;
 * authority note, section 5.8). It counts entries only: the other four
 * dimensions are request `cc570904`'s, so evidence that rests on it is
 * partial. A runtime may reserve more than a closure and never less.
 *
 * | Record, while | Entries | For |
 * |---|---|---|
 * | `pin`, `provisional` or `held` | 3 | A `pin-confirm`, an `unpin` and a `settlement`. |
 * | `receiver-pin`, `standing` | 3 less `decided` | One for each license number that may still come. |
 * | `root`, `creating` | 3 | The pin that follows. The check is in the closure of `stage`. |
 * | `root`, `retiring` | 1 | The read that shows the ref absent. |
 * | `token`, `live` | 6 | Its revocation, with at most 3 attempts. While `minting`, the closure of its mint holds the same. |
 * | `fork`, `creating` | 42 | The creation, with at most 3 attempts, and for each a revocation and a deletion with at most 3. |
 * | `fork`, `selected` | 6 | Its deletion. |
 */
export function holdReserves(view: StateView, definition: ValidDefinition): number {
  if (!hasWorkspace(definition)) return 0;
  const count = (kind: string, ...states: string[]) => states.reduce((n, state) => n + view.recordCount(HOLD, kind, state), 0);
  const licenses = records(view, "receiver-pin", ["standing"]).reduce((n, pin) => n + Math.max(0, LICENSE_BOUND - (pin.values["decided"] as number)), 0);
  return 3 * count("pin", "provisional", "held") + licenses + 3 * count("root", "creating") + count("root", "retiring")
    + 2 * HOLD_ATTEMPTS.revoke * count("token", "live") + (2 * HOLD_ATTEMPTS.fork * (1 + 2 * HOLD_ATTEMPTS.revoke)) * count("fork", "creating") + 2 * HOLD_ATTEMPTS.deletion * count("fork", "selected");
}

// ---------------------------------------------------------------- the capability

/**
 * The code of `hold@1`, as one value for the three places that ask it: the
 * guards and effects of a definition's forms (`Capabilities`), the steps of
 * a preparation (`Steps`), and the operations that those steps open with
 * what the pending records reserve (`Owners`).
 *
 * `definition` gives the pinned definition of a state, for the rule of a
 * mint, which reads the hold's state. A runtime gives the one its scope
 * pins.
 *
 * `implements` answers for each form (section 6.1). The four guards, the
 * four effects and a `carried` part are derived. The kind of a step's
 * entries is not. `kindOf` gives a preparation entry its kind, and gives an
 * outcome entry none: the kind is not in an outcome entry's bytes (I3
 * deltas, entry EH3). A definition that names such a kind names a check
 * entry, which is an outcome entry, so the form stays without code.
 * The steps `retry` and `job-read`, and the operations of a fork, are not
 * built here: with no rules for them, nothing of them is judged or sent.
 */
// I3 merge: step 16 gives the production ports this value, with `gitRead` beside it. The judges call `workspaceEffects`, `boundLicense`
// and `licenseRefused` when they are given it. Step 18 adds the rules of the fork's creation, the head's read and the deletion.
export function holdCapability(options: HoldOptions, definition: (view: StateView) => ValidDefinition | null): Capabilities & Steps & Owners {
  if (!Number.isSafeInteger(options.tokensPerHold) || options.tokensPerHold < 1) throw new Error("a hold may have at least one token");
  const rules = operationRules(definition);
  const steps: Readonly<Record<string, (given: StepGiven) => StepDerived | { refused: StepRefusal }>> = {
    stage: (given) => stage(options.reads, given), check: (given) => check(options.reads, given), instance: (given) => instance(options.reads, given), token: (given) => token(options, given),
  };
  return {
    implements: (form: unknown, step?: string) => (typeof form === "string"
      ? form === HOLD && step !== undefined && own(steps, step) !== undefined
      : isRecord(form) && form["capability"] === HOLD && (form["form"] === "listed" || form["form"] === "carried" || (form["form"] === "guard" && own(GUARDS, form["name"] as string) !== undefined) || (form["form"] === "effect" && own(EFFECTS, form["name"] as string) !== undefined))),
    guard: (capability, guard, args, given) => {
      const rule = capability === HOLD ? own(GUARDS, guard) : undefined;
      if (!rule) throw new Error(`${capability} has no code for the guard ${guard}`);
      return rule(args, given);
    },
    effect: (capability, effect, args, given) => {
      const rule = capability === HOLD ? own(EFFECTS, effect) : undefined;
      if (!rule) throw new Error(`${capability} has no code for the effect ${effect}`);
      return rule(args, given);
    },
    grant: (_capability, step, given) => stepGrant(options.reads, step, given),
    derive: (capability, step, given) => {
      const rule = capability === HOLD ? own(steps, step) : undefined;
      if (!rule) throw new Error(`${capability} has no code for the step ${step}`);
      return rule(given);
    },
    workspace: workspaceEffects,
    bound: (capability, view, at, from, fields) => {
      const found = capability === HOLD ? boundLicense(view, at, from, fields) : null;
      return found && licenseRefused(found);
    },
    rules: (owner, kind) => (owner === HOLD ? (own(rules, kind) ?? null) : null),
    reserves: holdReserves,
  };
}
