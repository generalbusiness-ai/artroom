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
 * - `stagedSource`: what the steps `stage` and `check` read of a signed
 *   intent, by the fields that the lane rows carry.
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

import type { CapabilityName, Digest, Effect, Evidence, FieldValue, Intent, OperationId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { isDigest, isFactRef, isLocalId, isRecord, isScopeRef, utf8 } from "@generalbusiness/artroom-bytes";
import type { Capabilities, CapabilityGiven, Maximum, Recorded } from "../capability.ts";
import { WINDOWS, type Window } from "../grant.ts";
import { EPOCH, HOLDER, holdStates, type HoldEffect } from "../hold.ts";
import { UNDER } from "../attribution.ts";
import { operationId, operationOpening, type OperationRules, type Opening, type OutcomeAt, type OutcomeDerived, type OutcomeInput, type Owners } from "../ledger.ts";
import { recordEffects, type StepDerived, type StepGiven, type StepRefusal, type Steps } from "../prepare.ts";
import type { Item, Operation, RecordState, StateView } from "../state.ts";
import { timeMs, type Clock } from "../time.ts";
import type { ValidDefinition } from "../validate/index.ts";
import { own, same } from "../values.ts";
import { isAncestryCheck, objectIdLength } from "./ancestry.ts";

export const HOLD: CapabilityName = "hold@1";

/**
 * The kinds of the operations that `hold@1` opens. The contract names
 * `stage` and `check` (section 6.11). The others have no name in the texts
 * (I3 deltas, entry EF4).
 */
export const HOLD_KINDS = { stage: "stage", check: "check", fork: "fork", head: "head", mint: "mint", revoke: "revoke", delete: "delete", deletion: "deletion" } as const;

/** The most attempts of each operation (authority note, sections 5.1, 5.7 and 5.8; section 12, G3 and U9). Proposals of the note, and the proof plan's numbers. `delete` is the delete of a staged ref, and `deletion` that of a fork. */
export const HOLD_ATTEMPTS = { stage: 3, check: 1, fork: 3, head: 1, mint: 1, revoke: 3, delete: 3, deletion: 3 } as const;

/**
 * The tokens of one attempt, by the kind of its operation (authority note,
 * section 5.7, "Which entry makes a token, a retirement and a deletion").
 * An attempt of a staging has two: one that reads the fork, and one that
 * writes the staged ref. An attempt of a staged ref's delete has one.
 */
const ATTEMPT_TOKENS: Readonly<Record<string, readonly string[]>> = { [HOLD_KINDS.stage]: ["fork-read", "staging"], [HOLD_KINDS.delete]: ["staging"] };

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

/** What `stage` and `check` read of the signed intent: the commit, the commitment, and for a new staging the hold and its instance. Null: none is read. */
export interface StagedSource { commit: string; under: number; hold: number | null; instance: string | null }

type Asking = Pick<StepGiven, "view" | "definition" | "scope" | "intent">;

/** The one hold of this scope that is `held` and whose `under` is that commitment. Null: none, or more than one. */
function heldUnder(view: StateView, definition: ValidDefinition, commitment: number): Hold | null {
  const found: Hold[] = [];
  for (const type of definition.holdTypes) {
    const declared = own(definition.declared.items, type);
    if (!declared) continue;
    // A held hold is live, so the type's `max` bounds how many there are (section 6.3): one page holds them all.
    const page = view.page(type, [holdStates(declared).held], null, declared.max);
    if (page.more) return null;
    for (const item of page.items) if (own(item.refs, UNDER) === commitment) found.push(holdOf(view, definition, item.id)!);
  }
  return found.length === 1 ? found[0]! : null;
}

/**
 * What the steps `stage` and `check` read of the signed intent (authority
 * note, section 5.7, "What a step reads of its signed intent", decided in
 * revision 21). It is a rule of `hold@1`, and it reads names of fields, as
 * the capability reads the names `holder` and `under` of a hold. The first
 * row that fits is read, in this order.
 *
 * 1. Addressed to this scope, with the field `integration`: a manifest from
 *    a hold of this lane. The commit is `integration`, the hold the field
 *    `hold`, the instance the field `instance`, and the commitment the
 *    hold's `under`.
 * 2. Addressed to another scope, with the field `integration`: a manifest
 *    from a hold of this lane, proposed elsewhere. The field `lane` must be
 *    this scope's reference, with its incarnation. The hold is the field
 *    `foreignHold`, an item ID of this scope.
 * 3. Addressed to this scope, with the fields `commit` and `commitment` and
 *    no field `integration`: a report. The hold is the one hold of this
 *    scope that is `held` under that commitment, and the instance is that
 *    hold's `current` one. The hold is found by the commitment and not by
 *    the signer: `stage` uses it only when its holder is the signer's
 *    member.
 * 4. Any other intent: nothing, and the step is refused `not-staged`.
 *
 * A field of another type than the row states is no such field: nothing is
 * read. A commit is an object ID of 40 or 64 lower-case hex characters.
 */
export function stagedSource({ view, definition, scope, intent }: Asking): StagedSource | null {
  const { fields } = intent;
  const here = isScopeRef(intent.to) && same(intent.to, scope.at);
  const integration = own(fields, "integration");
  if (integration !== undefined) {
    const lane = own(fields, "lane");
    const named = here ? own(fields, "hold") : isScopeRef(lane) && same(lane, scope.at) ? own(fields, "foreignHold") : undefined;
    const hold = holdOf(view, definition, named);
    const instance = own(fields, "instance");
    return objectIdLength(integration) !== null && hold && hold.under !== null && typeof instance === "string" ? { commit: integration as string, under: hold.under, hold: hold.item.id, instance } : null;
  }
  const [commit, commitment] = [own(fields, "commit"), own(fields, "commitment")];
  if (!here || objectIdLength(commit) === null || !isLocalId(commitment) || !view.item(commitment)) return null;
  const hold = heldUnder(view, definition, commitment);
  const instance = hold ? currentInstance(view, hold.item.id) : null;
  return { commit: commit as string, under: commitment, hold: hold?.item.id ?? null, instance: instance ? (instance.key[1] as string) : null };
}

/** The most bytes of an instance ID (section 5.7, the intent of the step `instance`). */
const INSTANCE_BYTES = 128;
const isInstanceId = (v: unknown): v is string => typeof v === "string" && v !== "" && utf8(v).length <= INSTANCE_BYTES;

/**
 * The fields of the signed intent that asks for a step with no act (section
 * 5.7, "The steps with no act"): the steps `instance`, `token` and `retire`.
 * Its `kind` is the step's kind, `hold@1:instance`, which no act of a
 * definition may have, so such an intent is never admitted as an act. Its
 * `to` is the lane that holds the hold: the judge of a preparation has
 * checked it, because none of these steps is `foreign`. `on` is null and
 * `expected` is empty. Null: the intent is not of that form, or it has a
 * field that `names` does not hold, and the step is refused `bad-field`.
 */
function ownFields(intent: Intent, step: string, names: readonly string[]): Readonly<Record<string, FieldValue>> | null {
  const whole = intent.kind === `${HOLD}:${step}` && intent.on === null && Object.keys(intent.expected).length === 0 && Object.keys(intent.fields).every((name) => names.includes(name));
  return whole ? intent.fields : null;
}

/** The intent of the step `instance`: `hold`, the hold's item ID; `task`, the task scope's reference with its incarnation; `instance`, the new instance ID, a text of at most 128 bytes. */
function instanceAsked(intent: Intent): { hold: number; task: ScopeRef; instance: string } | null {
  const fields = ownFields(intent, "instance", ["hold", "task", "instance"]);
  const [hold, task, instance] = fields ? [own(fields, "hold"), own(fields, "task"), own(fields, "instance")] : [];
  return isLocalId(hold) && isScopeRef(task) && isInstanceId(instance) ? { hold, task, instance } : null;
}

/** The intent of the step `token`: `hold`, the hold's item ID; `instance`, the hold's `current` instance. */
function tokenAsked(intent: Intent): { hold: number; instance: string } | null {
  const fields = ownFields(intent, "token", ["hold", "instance"]);
  const [hold, instance] = fields ? [own(fields, "hold"), own(fields, "instance")] : [];
  return isLocalId(hold) && isInstanceId(instance) ? { hold, instance } : null;
}

/** The intent of the step `retire`: exactly one of `root`, a root's number, and `fork`, a hold's item ID. */
function retireAsked(intent: Intent): { root: number } | { fork: number } | null {
  const fields = ownFields(intent, "retire", ["root", "fork"]);
  const [root, fork] = fields ? [own(fields, "root"), own(fields, "fork")] : [];
  if ((root === undefined) === (fork === undefined)) return null;
  return isLocalId(root) ? { root } : isLocalId(fork) ? { fork } : null;
}

/** The floor of `tokensPerHold` (authority note, section 5.7, "The bound on the tokens of one hold"): the old and the new workspace token stand side by side while a credential is renewed. */
export const TOKENS_FLOOR = 2;

export interface HoldOptions {
  /**
   * The state bound of this version (authority note, section 5.7, "The
   * bound on the tokens of one hold", stated in revision 21): the most
   * tokens of one hold that may be `minting` or `live` at once. The step
   * `token` is the opening, and it is refused `tokens-full` at the bound.
   * So the entry that ends a hold, which cannot be refused, derives at most
   * 1 + 3 times this number of effects. The floor is 2. The number is the
   * proof plan's, and none is proposed: it is required, with no default.
   * A staging's tokens are not counted here.
   */
  tokensPerHold: number;
  /**
   * The retention that must have passed since the entry that made a root
   * `live`, before the step `retire` may retire it (authority note, section
   * 6.2, "Retiring a root"). The number is the proof plan's, and none is
   * proposed. Null: none is set, and no root is retired.
   */
  rootRetentionSeconds: number | null;
}

// ---------------------------------------------------------------- guards and effects

const refusal = (name: string): StepRefusal => ({ reason: "capability-refused", name });
const failed = (detail: string): StepRefusal => ({ reason: "guard-failed", detail });
/** Section 5.7, "The steps with no act": a field that the table does not name, or a missing one. */
const badField = (detail: string): StepRefusal => ({ reason: "bad-field", detail });

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
 * `released`, `unpinned`, with the entry that showed it.
 *
 * With `commit` alone (authority note, section 5.7, "Which pin a commit
 * alone releases", decided in revision 21): the argument is a slot of an
 * item, and that item was opened by the entry that admitted its act. The
 * pin that is released is this scope's own pin that is `held`, whose
 * `commit` is that value and whose `admitted` is that entry: the item's ID.
 * One entry admits one act, and one act has one pin, so at most one
 * matches. With none, nothing is released, and the entry is written as its
 * row has it: an effect has no refusal. An argument that is no slot of an
 * item names no pin. A pin of another intent is never released: its
 * `admitted` is another entry.
 */
function pinRelease(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): readonly Recorded[] {
  if ("consumer" in args) {
    const pin = pinOf(given.view, args["consumer"], args["intent"]);
    return pin && pin.state !== "released" ? [moved(pin, "released", { admitted: pin.values["admitted"] ?? args["manifest"] ?? null, released: "unpinned", by: args["by"] ?? null })] : [];
  }
  const item = own(given.from ?? {}, "commit");
  const mine = item === undefined ? [] : records(given.view, "pin", ["held"], "commit", args["commit"]).filter((pin) => same(pin.key[0], given.scope.at) && pin.values["admitted"] === item);
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

function stepGrant(step: string, given: Omit<StepGiven, "signer">): { action: string; window: Window } | null {
  const { view, definition, scope, intent } = given;
  // The step `check` reuses a root and writes nothing outside: the act's own grant, in its ordinary window (section 6.11; authority
  // note, section 6.2, "A new staging, and the reuse of a completed one"). For an intent that is addressed to another scope the
  // act is not this scope's, and the grant is the one that this scope judges staging on (I3 deltas, entry EF3).
  if (step === "retire") return { action: RETIRE_ACTION, window: WINDOWS.once };
  const act = step === "check" && same(intent.to, scope.at) ? own(definition.declared.acts, intent.kind) : undefined;
  if (act) return { action: act.grant, window: WINDOWS.ordinary };
  const hold = step === "instance" ? instanceAsked(intent)?.hold : step === "token" ? tokenAsked(intent)?.hold : stagedSource(given)?.hold;
  const action = openingGrant(definition, isLocalId(hold) ? view.item(hold)?.type : undefined);
  return action === null ? null : { action, window: step === "check" ? WINDOWS.ordinary : WINDOWS.once };
}

const MINT: Opening = { owner: HOLD, kind: HOLD_KINDS.mint, attempts: HOLD_ATTEMPTS.mint };
const REVOKE: Opening = { owner: HOLD, kind: HOLD_KINDS.revoke, attempts: HOLD_ATTEMPTS.revoke };

/**
 * The tokens of one attempt of a staging or of a staged ref's delete
 * (authority note, section 5.7, "Which entry makes a token, a retirement
 * and a deletion", decided in revision 21). The entry that opens the
 * attempt makes them: each `minting`, with its mint, an operation with 1
 * attempt. Each is for the root, and not for the hold: its values name the
 * root, the operation and the attempt, and no hold. So it is not counted in
 * the bound on a hold's tokens, and the end of the hold does not revoke it.
 *
 * `self` is the entry being written, `k` the ordinal of the first operation
 * that these mints take there, and `numbered` how many token records the
 * entry has made before them.
 */
function attemptTokens(view: StateView, kind: string, root: number, operation: OperationId, attempt: number, self: number, k: number, numbered: number): { made: Recorded[]; opens: Opening[] } {
  const purposes = own(ATTEMPT_TOKENS, kind) ?? [];
  return {
    made: purposes.map((purpose, i) => ({ kind: "token", key: [nextNumber(view, "token") + numbered + i], state: "minting", values: { purpose, root, operation, attempt, mint: operationId(self, k + i), id: null, ends: null, revocation: null } })),
    opens: purposes.map(() => MINT),
  };
}

/**
 * The end of the tokens of one attempt (section 5.7, the same table): the
 * outcome entry that records the attempt `confirmed` or `refused` makes each
 * `live` token of it `revoking`, with its revocation. A token that is still
 * `minting` does not move: the entry that records its mint's own answer
 * revokes it, because its use has ended (`attemptEnded`).
 */
function endTokens(view: StateView, operation: OperationId, attempt: number, self: number, k: number): { made: Recorded[]; opens: Opening[] } {
  const live = records(view, "token", ["live"], "operation", operation).filter((token) => token.values["attempt"] === attempt);
  return { made: live.map((token, i) => moved(token, "revoking", { revocation: operationId(self, k + i) })), opens: live.map(() => REVOKE) };
}

/** When the use of an attempt's token has ended: the attempt has a `confirmed` or a `refused` outcome. An attempt that is `unknown` leaves its tokens. */
function attemptEnded(view: StateView, token: Pick<RecordState, "values">): boolean {
  const attempt = view.operation(token.values["operation"] as OperationId)?.attempts.find((a) => a.attempt === token.values["attempt"]);
  const last = attempt?.outcomes.at(-1);
  return !attempt || (last !== undefined && last.result !== "unknown");   // Fail closed: a token of no attempt is given to nobody.
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
 * ref. With no such hold, with a hold that another member holds, or with no
 * `current` instance, the step is refused `not-staged`: so is an intent of
 * which nothing is read (authority note, section 5.7, "What `stage` then
 * judges" and "The signer's own hold, and no other").
 */
function stage(given: StepGiven): StepDerived | { refused: StepRefusal } {
  const source = stagedSource(given);
  if (!source) return { refused: refusal("not-staged") };
  const hold = source.hold === null ? null : ownHeld(given, source.hold);
  if (!hold || hold.under !== source.under || source.instance === null || record(given.view, "instance", [hold.item.id, source.instance])?.state !== "current") return { refused: refusal("not-staged") };
  if (records(given.view, "root", ["live"], "commit", source.commit).some((root) => root.values["under"] === source.under)) return { refused: failed("a live root holds this commit under this commitment: the step `check` reuses it") };
  const number = nextNumber(given.view, "root");
  // Section 5.7, "Which entry makes a token": this entry opens attempt 1 of the staging, so it makes that attempt's two tokens.
  const tokens = attemptTokens(given.view, HOLD_KINDS.stage, number, operationId(given.self, 0), 1, given.self, 1, 0);
  return {
    records: [{ kind: "root", key: [number], state: "creating", values: {
      commit: source.commit, hold: hold.item.id, instance: source.instance, under: source.under, intent: given.digest, consumer: given.intent.to, operation: operationId(given.self, 0),
    } }, ...tokens.made],
    opens: [{ owner: HOLD, kind: HOLD_KINDS.stage, attempts: HOLD_ATTEMPTS.stage }, ...tokens.opens],
  };
}

/**
 * The step `check` (section 6.11): the reuse of a completed staging. A
 * `live` root for the commit must exist, staged under the commitment named,
 * from a hold whose holder was the signer's member. The hold may have
 * ended. It derives the `provisional` pin, if there is none, and the
 * operation `check`: one read of the canonical repository.
 */
function check(given: StepGiven): StepDerived | { refused: StepRefusal } {
  // Section 5.7, "What `check` reads": the commit and the commitment, by the same table. It needs no hold that is `held`.
  const source = stagedSource(given);
  if (!source) return { refused: refusal("not-staged") };
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
function instance(given: StepGiven): StepDerived | { refused: StepRefusal } {
  const asked = instanceAsked(given.intent);
  if (!asked) return { refused: badField("the intent is not the one of the step instance: the hold, the task scope and a new instance ID") };
  const hold = workspaceOf(given, asked.hold);
  if ("refused" in hold) return hold;
  if (record(given.view, "instance", [asked.hold, asked.instance])) return { refused: failed("the instance ID is not new") };
  const earlier = currentInstance(given.view, asked.hold);
  return { records: [...(earlier ? [moved(earlier, "past")] : []), { kind: "instance", key: [asked.hold, asked.instance], state: "current", values: { hold: asked.hold, task: asked.task, epoch: hold.epoch } }], opens: [] };
}

/**
 * The step `token` (authority note, section 5.7): the instance named is
 * `current` and the `fork` is `selected`. It derives a `token` record,
 * `minting`, and its mint operation with its one attempt. At the bound on
 * the tokens of one hold it is refused `tokens-full`.
 */
function token(options: HoldOptions, given: StepGiven): StepDerived | { refused: StepRefusal } {
  const asked = tokenAsked(given.intent);
  if (!asked) return { refused: badField("the intent is not the one of the step token: the hold and its current instance") };
  const hold = workspaceOf(given, asked.hold);
  if ("refused" in hold) return hold;
  if (record(given.view, "instance", [asked.hold, asked.instance])?.state !== "current") return { refused: failed("the instance named is not the hold's current one") };
  if (record(given.view, "fork", [asked.hold])?.state !== "selected") return { refused: failed("the hold's fork is not selected") };
  // Section 5.7, "The judges refuse at the bound". This step is the one opening that raises the count, so the entry that ends the
  // hold never holds more than the bound allows (scope contract, section 6.1, "An entry that cannot be refused").
  if (records(given.view, "token", ["minting", "live"], "hold", asked.hold).length >= options.tokensPerHold) return { refused: refusal("tokens-full") };
  return {
    records: [{ kind: "token", key: [nextNumber(given.view, "token")], state: "minting", values: { purpose: "workspace", hold: asked.hold, instance: asked.instance, mint: operationId(given.self, 0), id: null, ends: null, revocation: null } }],
    opens: [{ owner: HOLD, kind: HOLD_KINDS.mint, attempts: HOLD_ATTEMPTS.mint }],
  };
}

/** The action of the step `retire` (authority note, section 5.7, the row `retire`): the grant of the act `retry`, which is an admin's (section 3.2). */
export const RETIRE_ACTION = "ledger.retry";

/**
 * The step `retire` (authority note, section 5.7, new in revision 21). It
 * names one root by its number, or one fork by its hold. Each refusal is
 * `not-retirable`.
 *
 * - A root: it is `live`, no pin on it is `provisional` or `held`, and the
 *   retention has passed since the entry that made it `live`. It derives the
 *   root, `retiring`, and its delete, an operation with at most 3 attempts,
 *   with the one staging token of attempt 1. From this entry on no pin is
 *   accepted on the root.
 * - A fork: its hold is `ended`; the fork is `selected`; no token of that
 *   hold is `minting`, `live` or `revoking`; no instance of it is `current`;
 *   no root that was staged from it is `creating`; and no `receiver-pin`
 *   that is `standing` names it. It derives the fork, `deleting`, and its
 *   deletion, an operation with at most 3 attempts.
 *
 * No entry that ends a hold makes either state, and no timed rule and no
 * outcome retires a root or deletes a fork.
 */
function retire(options: HoldOptions, given: StepGiven): StepDerived | { refused: StepRefusal } {
  const asked = retireAsked(given.intent);
  if (!asked) return { refused: badField("the intent is not the one of the step retire: exactly one of a root and a fork") };
  const { view, definition, self, clock } = given;
  const no = { refused: refusal("not-retirable") };
  if ("root" in asked) {
    const root = record(view, "root", [asked.root]);
    if (root?.state !== "live" || records(view, "pin", ["provisional", "held"], "root", asked.root).length > 0) return no;
    // The fold keeps the entry that last recorded a record. A root is recorded `live` once, so that is the entry that made it live.
    const since = timeMs(given.own?.(root.seq)?.entry.time);
    if (options.rootRetentionSeconds === null || since === null || clock.behind || timeMs(clock.reading)! < since + options.rootRetentionSeconds * 1000) return no;
    const operation = operationId(self, 0);
    const tokens = attemptTokens(view, HOLD_KINDS.delete, asked.root, operation, 1, self, 1, 0);
    return { records: [moved(root, "retiring", { retirement: operation }), ...tokens.made], opens: [{ owner: HOLD, kind: HOLD_KINDS.delete, attempts: HOLD_ATTEMPTS.delete }, ...tokens.opens] };
  }
  const hold = holdOf(view, definition, asked.fork);
  const fork = record(view, "fork", [asked.fork]);
  if (!hold || hold.held || fork?.state !== "selected") return no;
  if (records(view, "token", ["minting", "live", "revoking"], "hold", asked.fork).length > 0 || currentInstance(view, asked.fork) !== null) return no;
  if (records(view, "root", ["creating"], "hold", asked.fork).length > 0 || records(view, "receiver-pin", ["standing"], "hold", asked.fork).length > 0) return no;
  return { records: [moved(fork, "deleting", { deletion: operationId(self, 0) })], opens: [{ owner: HOLD, kind: HOLD_KINDS.deletion, attempts: HOLD_ATTEMPTS.deletion }] };
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

/** The entries that one revocation, and one mint with the revocation that its answer may open, reserve when they are opened (section 17.2, row 5). */
const REVOKED = 2 * HOLD_ATTEMPTS.revoke;
const MINTED = 2 * HOLD_ATTEMPTS.mint * (1 + REVOKED);

/** What the outcome entry of one attempt of a staging or of a delete derives for the attempt's tokens: the end of this attempt's, and the tokens of the attempt that the entry opens. */
function tokensAt(view: StateView, operation: Operation, root: number, outcome: OutcomeInput, at: OutcomeAt, self: number, k: number): { made: Recorded[]; opens: Opening[] } {
  const ended = outcome.result === "unknown" ? { made: [], opens: [] } : endTokens(view, operation.id, outcome.attempt, self, k);
  const next = at.opens === null ? { made: [], opens: [] } : attemptTokens(view, operation.kind, root, operation.id, at.opens, self, k + ended.opens.length, 0);
  return { made: [...ended.made, ...next.made], opens: [...ended.opens, ...next.opens] };
}

/**
 * Authority note, section 5.7, "Which entry makes a token": the request of an
 * attempt of a staging is sent only when both of its tokens are `live`, and
 * each attempt of a staged ref's delete has one staging token, "made as the
 * tokens of a staging are". So the driver sends the request of an attempt
 * only while every token that the attempt's opening made is `live`. A token
 * whose mint was refused or is not answered leaves the attempt recorded and
 * not sent: no text says what then ends it (I3 deltas, entry ET7).
 */
const tokensLive = (view: StateView, operation: Operation, attempt: number): boolean => {
  const made = records(view, "token", ["minting", "live", "revoking", "ended"], "operation", operation.id).filter((token) => token.values["attempt"] === attempt);
  return made.length === (own(ATTEMPT_TOKENS, operation.kind) ?? []).length && made.every((token) => token.state === "live");
};

const OPERATION_RULES: Readonly<Record<string, OperationRules>> = {
  // Section 6.11, the step `stage`: its outcome `confirmed`, on a read that shows the ref, makes the root `live`, records the
  // `provisional` pin and opens the operation `check`. An attempt that is refused or unknown leaves the root `creating`.
  // Authority note, section 5.7, "Which entry makes a token": the entry that records an attempt `confirmed` or `refused` ends
  // that attempt's two tokens, and the entry that opens the next attempt makes its two.
  [HOLD_KINDS.stage]: {
    selects: false, read: true, retries: () => true, wellFormed: basis("read"), ready: tokensLive,
    // The most that one outcome entry opens: two revocations, and the check or the two mints of the next attempt.
    closure: 2 * REVOKED + Math.max(2 * HOLD_ATTEMPTS.check, 2 * MINTED),
    // A confirmed attempt: the root, the pin, the check and two revocations, 2 + 2 + 2 * 3. A refused one: two revocations and the two tokens of the next attempt, 2 * 3 + 2 * 3.
    most: { effects: 12, requests: 0, operations: 4 },
    derives: (view, operation, outcome, _selected, at) => {
      const root = records(view, "root", ["creating", "live", "retiring", "retired"], "operation", operation.id)[0];
      if (!root) return NOTHING;
      const self = next(view);
      const made: Recorded[] = [];
      const opens: Opening[] = [];
      if (outcome.result === "confirmed" && root.state === "creating") {
        made.push(moved(root, "live"));
        const key = [root.values["consumer"] as ScopeRef, root.values["intent"] as Digest];
        const pin = record(view, "pin", key);
        // A pin that is `held` or `released` is of an intent that was admitted or settled: it does not move, and no check is opened for it.
        if (!pin || pin.state === "provisional") {
          const values = { root: root.key[0]!, commit: root.values["commit"], admitted: null, released: null, by: null, check: operationId(self, 0) };
          made.push(pin ? moved(pin, "provisional", values) : { kind: "pin", key, state: "provisional", values });
          opens.push({ owner: HOLD, kind: HOLD_KINDS.check, attempts: HOLD_ATTEMPTS.check });
        }
      }
      const tokens = tokensAt(view, operation, root.key[0] as number, outcome, at, self, opens.length);
      return recorded([...made, ...tokens.made], [...opens, ...tokens.opens]);
    },
  },
  // Section 6.11, the step `check`: its outcome entry is the check entry. It records the `check` record, `recorded`, or
  // `too-large` when the walk passed a bound (`gitread.ts` has the evidence's form). Authority note, section 5.7, "Evidence of
  // each outside effect", the row of the ancestry read: it is shown by that read's own answer, and the evidence is the ancestry
  // record. So the basis is `own-answer`, as a first outcome and as the late answer after an `unknown` (section 5.4, rule 2). No
  // other read is decisive for it. The operation has one attempt: a check that stays `unknown` is read again as a new operation.
  [HOLD_KINDS.check]: {
    selects: false, read: false, retries: () => false, wellFormed: (result, evidence) => basis("own-answer")(result, evidence) && (result !== "confirmed" || isCheckEvidence(evidence.body)),
    most: { effects: 1, requests: 0, operations: 0 },
    // Section 16.4: the record names its snapshot by digest, and the bytes are stored before the check entry.
    retains: (evidence) => (isCheckEvidence(evidence.body) && isAncestryCheck(evidence.body.record) ? [evidence.body.record.snapshot.digest] : []),
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
  // is revoked because nothing was minted. Unknown: it stays `minting`, and nothing is minted again for that operation. The use
  // of a hold's token ends with the hold, a changed holder or a past instance. The use of an attempt's token ends with a
  // `confirmed` or a `refused` outcome of its attempt.
  [HOLD_KINDS.mint]: {
    selects: false, read: false, retries: () => false, closure: REVOKED, most: { effects: 3, requests: 0, operations: 1 },
    wellFormed: (result, evidence) => basis("own-answer")(result, evidence) && (result !== "confirmed" || minted(evidence.body) !== null),
    derives: (view, operation, outcome, _selected, at) => {
      const token = namedBy(view, "token", ["minting"], "mint", operation);
      if (!token || outcome.result === "unknown") return NOTHING;
      if (outcome.result === "refused") return recorded([moved(token, "ended")]);
      const { token: id, ends } = minted(outcome.evidence.body)!;
      const ended = "hold" in token.values ? useEnded(view, at.definition, token) : attemptEnded(view, token);
      if (!ended) return recorded([moved(token, "live", { id, ends })]);
      return recorded([moved(token, "revoking", { id, ends, revocation: operationId(next(view), 0) })], [REVOKE]);
    },
  },
  // A revocation by the token's ID: its `confirmed` outcome makes the token `ended` (authority note, section 5.7, the record `token`).
  [HOLD_KINDS.revoke]: {
    selects: false, read: false, retries: () => true, wellFormed: basis("own-answer"), most: { effects: 1, requests: 0, operations: 0 },
    derives: (view, operation, outcome) => {
      const token = outcome.result === "confirmed" ? namedBy(view, "token", ["revoking"], "revocation", operation) : null;
      return token ? recorded([moved(token, "ended")]) : NOTHING;
    },
  },
  // The delete of a staged ref (authority note, section 6.2, "Retiring a root"; section 5.7, the row of a root that is
  // `retiring`). A read that shows the ref absent makes the root `retired`. A delete whose answer was lost stays `unknown`,
  // whatever a read shows later. Each attempt has one staging token, made and ended as the tokens of a staging are.
  [HOLD_KINDS.delete]: {
    selects: false, read: true, retries: () => true, wellFormed: basis("read"), ready: tokensLive, closure: REVOKED + MINTED, most: { effects: 6, requests: 0, operations: 2 },
    derives: (view, operation, outcome, _selected, at) => {
      const root = records(view, "root", ["retiring", "retired"], "retirement", operation.id)[0];
      if (!root) return NOTHING;
      const tokens = tokensAt(view, operation, root.key[0] as number, outcome, at, next(view), 0);
      return recorded([...(outcome.result === "confirmed" && root.state === "retiring" ? [moved(root, "retired")] : []), ...tokens.made], tokens.opens);
    },
  },
  // The deletion of a fork (section 5.7, the row of a fork that is `deleting`): its `confirmed` outcome, by that request's own
  // answer, makes the fork `deleted`.
  [HOLD_KINDS.deletion]: {
    selects: false, read: false, retries: () => true, wellFormed: basis("own-answer"), most: { effects: 1, requests: 0, operations: 0 },
    derives: (view, operation, outcome) => {
      const fork = outcome.result === "confirmed" ? namedBy(view, "fork", ["deleting"], "deletion", operation) : null;
      return fork ? recorded([moved(fork, "deleted")]) : NOTHING;
    },
  },
};

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
 * The value holds no state and reads no port. Its two options are numbers
 * of the version that the texts leave to the proof plan. `maxima` declares
 * the most that each piece of this code derives in one entry.
 *
 * `implements` answers for each form (section 6.1). The four guards, the
 * four effects and a `carried` part are derived. So is the kind of a step's
 * entries, for a step that has code here: `kindOf` reads the kind of a
 * preparation entry and of an outcome entry from the entry's own input, and
 * only this code writes an entry of such a kind (section 6.2; source row
 * I3-13).
 * The steps `retry` and `job-read`, and the creation of a fork with the
 * read of a head, are not built here: with no rules for them, nothing of
 * them is judged or sent.
 */
// I3 merge: step 18 adds the rules of the fork's creation and of the head's read. The step `retry` and the step `job-read` have no
// code here. The driver's rule that the request of an attempt is sent only when its tokens are `live` is `tokensLive`, above.
export function holdCapability(options: HoldOptions): Capabilities & Steps & Owners {
  const { tokensPerHold: tokens, rootRetentionSeconds: retention } = options;
  if (!Number.isSafeInteger(tokens) || tokens < TOKENS_FLOOR) throw new Error(`a hold may have at least ${TOKENS_FLOOR} tokens at once`);
  if (retention !== null && (!Number.isSafeInteger(retention) || retention < 0)) throw new Error("the retention of a root is a number of seconds, or none");
  const steps: Readonly<Record<string, (given: StepGiven) => StepDerived | { refused: StepRefusal }>> = {
    stage, check, instance, token: (given) => token(options, given), retire: (given) => retire(options, given),
  };
  const most = (form: Maximum["form"], name: string, effects: number, operations = 0): Maximum => ({ form, capability: HOLD, name, effects, requests: 0, operations });
  return {
    implements: (form: unknown, step?: string) => (typeof form === "string"
      ? form === HOLD && step !== undefined && own(steps, step) !== undefined
      : isRecord(form) && form["capability"] === HOLD && (form["form"] === "listed" || form["form"] === "carried" || (form["form"] === "guard" && own(GUARDS, form["name"] as string) !== undefined) || (form["form"] === "effect" && own(EFFECTS, form["name"] as string) !== undefined)
        || (form["form"] === "kind" && typeof form["name"] === "string" && form["name"].startsWith(`${HOLD}:`) && own(steps, form["name"].slice(HOLD.length + 1)) !== undefined))),
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
    grant: (_capability, step, given) => stepGrant(step, given),
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
    rules: (owner, kind) => (owner === HOLD ? (own(OPERATION_RULES, kind) ?? null) : null),
    reserves: holdReserves,
    // Section 6.1, "A declared maximum for everything that derives". Each written effect changes at most one record. A step: its
    // records, and two effects for each operation that it opens. An outcome: what its rule states above. One hold of an entry: an
    // opening derives the fork and one operation, 3; an end derives the instance and, for each live token, its record and its
    // revocation, 1 + 3 times the state bound (authority note, section 5.7, "What one ending entry then holds").
    maxima: [
      ...Object.keys(EFFECTS).map((name) => most("effect", name, 1)),
      most("step", "stage", 9, 3), most("step", "check", 3, 1), most("step", "instance", 2), most("step", "token", 3, 1), most("step", "retire", 6, 2),
      ...Object.entries(OPERATION_RULES).map(([kind, rules]) => ({ ...most("outcome", kind, 0), ...rules.most! })),
      most("bound", "export-license", 1),
      most("workspace", "hold", 1 + 3 * tokens, tokens),
    ],
  };
}
