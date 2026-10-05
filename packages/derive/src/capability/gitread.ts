/**
 * The rules of `git-read@1` (scope contract, sections 6.11 and 16.4;
 * authority note, sections 3.11 and 6.2): one guard, `ancestry`. It reads
 * the `check` record that the capability `hold@1` keeps for an intent and a
 * root, whose member `record` is the ancestry record of `ancestry.ts`.
 *
 * - `ledgerOf`: the staging lane's own history as the walk and the guard
 *   read it: its roots under the source commitment, and its prior checks.
 * - `gitRead`: the guard, as a `Capabilities` value.
 *
 * What the guard judges in the commit, and what the walk and a replay judge
 * (authority note, section 6.2, "How the guard finds a selected input, and
 * where reachability is judged", decided in revision 21). In the commit it
 * has the folded state, this scope's own entries and the retained snapshot.
 * It has no commit object: none is retained, and a commit is read by its ID
 * from the repository. So it judges the left column of that section's
 * table: guards 1, 2, 6 and 7 in full, and guards 3 to 5 as far as they
 * read the lane's state and the snapshot. That `published` is recorded
 * exactly when the commit is reachable from the recorded head, that no
 * stop is reachable from it, that every commit of a prior check's F is
 * carried unless it is, and that a `selected-report` stop's commit is the
 * commit of its input's report, are derived from commits. The runtime's
 * `walk` derived them when it built the record, and a replay derives them
 * again (section 9.3, "An ancestry record").
 *
 * The step `job-read` is not built here (plan step 24).
 */

import type { Digest, FactRef, FieldValue, ScopeRef } from "@generalbusiness/artroom-contract";
import { isDigest, isFactRef, isLocalId } from "@generalbusiness/artroom-bytes";
import type { Capabilities, CapabilityGiven } from "../capability.ts";
import { isLocalFact, type Own } from "../fields.ts";
import type { RecordState, StateView } from "../state.ts";
import { own as slotOf, same } from "../values.ts";
import { foreignOn, isAncestryCheck, snapshotOf, snapshotRead, type AncestryCheck, type OwnRoot, type PriorCheck } from "./ancestry.ts";
import { HOLD } from "./hold.ts";

export const GIT_READ = "git-read@1" as const;

/**
 * The staging lane's history, as the ancestry check reads it (section 6.2):
 * its roots under the source commitment, and its prior checks under it.
 *
 * A prior check is a `check` record that is `recorded`, for a root under
 * the source commitment, whose pin shows that the act was admitted: the pin
 * holds the admitting entry. For an act of this lane the prior check is the
 * entry that admitted the act. For a consumer in another lane it is the
 * check entry itself, once the lane has recorded a `pin-confirm` for the
 * pin, or an `unpin` with the manifest's fact. A root whose act was refused
 * or never admitted, and a pin that is still `provisional`, give none.
 *
 * `own` reads this scope's sealed entries, for the hash of each prior
 * check's entry. `before`: only entries earlier than that position count.
 */
export function ledgerOf(view: StateView, own: Own | undefined, at: ScopeRef, under: unknown, before: number): { roots: OwnRoot[]; checks: PriorCheck[] } {
  const roots = view.records(HOLD, "root", { member: "under", value: under }).map((r) => ({ number: r.key[0] as number, commit: r.values["commit"] as string, state: r.state }));
  const checks = view.records(HOLD, "check", { states: ["recorded"] }).flatMap((check): PriorCheck[] => {
    const consumer = check.values["consumer"];
    const pin = view.record(HOLD, "pin", [consumer as FieldValue, check.values["intent"] as FieldValue]);
    const record = check.values["record"];
    const admitted = pin?.values["admitted"];
    const seq = same(consumer, at) ? admitted : admitted === null || admitted === undefined ? null : check.seq;
    const sealed = isLocalId(seq) && seq < before ? own?.(seq) : null;
    if (!roots.some((r) => r.number === check.values["root"]) || !sealed || !isAncestryCheck(record)) return [];
    return [{ commit: record.commit, root: check.values["root"] as number, checked: { at, seq: sealed.entry.seq, hash: sealed.hash }, foreign: record.start.foreign, F: record.F.map((f) => f.commit) }];
  });
  return { roots, checks };
}

/** The `check` record that the guard reads: this scope's own, for this intent, or the one that a presented check entry carries. */
function checked(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): { state: string; values: Readonly<Record<string, unknown>>; local: { pin: RecordState; root: RecordState } | null } | null {
  const presented = args["pin"];
  if (presented !== null && presented !== undefined) {
    // Section 16.3: another lane's check entry, presented beside the intent and retained in `uses`. The record is what that one
    // sealed entry recorded, and not the record's present state.
    const carried = isFactRef(presented) ? (given.facts.get(presented.hash)?.entry.effects ?? []).filter((e) => e.effect === "record" && e.capability === HOLD && e.kind === "check") : [];
    const only = carried.length === 1 ? carried[0]! : null;
    return only && only.effect === "record" ? { state: only.state, values: only.values, local: null } : null;
  }
  const pin = isDigest(given.intent) ? given.view.record(HOLD, "pin", [given.scope.at, given.intent]) : null;
  const root = pin ? given.view.record(HOLD, "root", [pin.values["root"] as number]) : null;
  const check = pin && root ? given.view.record(HOLD, "check", [given.intent as Digest, root.key[0]!]) : null;
  return pin && root && check ? { state: check.state, values: check.values, local: { pin, root } } : null;
}

/** The state and the reference slot that version 1 of `git-read` reads of a selected input, as `hold@1` reads `holder` and `under` of a hold. */
const SELECTED = "selected";
const FOR = "for";

/**
 * Whether a fact names a selected input of the source commitment at this
 * commit (authority note, section 6.2, "By which names the guard finds an
 * input"). The fact is a local fact of the staging lane: it names this
 * scope, with its incarnation, and the hash of this scope's entry at that
 * position. The input is the item that this entry opened, whose ID is the
 * fact's position. It holds when the item exists, its state is the state
 * named `selected`, and its reference slot named `for` holds the source
 * commitment. The item's type is not named. A fact of another scope fails,
 * and so does every fact in a definition with no such state or slot.
 */
function selectedInput(given: CapabilityGiven, fact: FactRef, under: unknown): boolean {
  if (!isLocalFact(fact, given.scope.at)) return false;
  const item = given.view.item(fact.seq);
  return item !== null && item.opened === fact.hash && item.state === SELECTED && isLocalId(under) && slotOf(item.refs, FOR) === under;
}

/**
 * Guards 2 to 6 of section 6.2, for a record that is this scope's own,
 * against this scope's records and items at this commit: the left column of
 * the table of that section. False: what was read no longer fits the lane's
 * state, and the act is refused `ancestry-stale`.
 */
function fits(record: AncestryCheck, { pin, root }: { pin: RecordState; root: RecordState }, given: CapabilityGiven): boolean {
  // Guard 2: the root is the one that the entry relies on, and it is `live`.
  if (record.root.number !== root.key[0] || pin.values["root"] !== root.key[0] || root.state !== "live") return false;
  const { roots, checks } = ledgerOf(given.view, given.own, given.scope.at, root.values["under"], given.self);
  const prior = (commit: string, fact: FactRef): PriorCheck | undefined => checks.find((c) => c.commit === commit && same(c.checked, fact));
  // Guard 3: sorted at this commit, the staged refs of the snapshot on the commit give the same `foreign`, and the basis stands.
  // The snapshot's bytes are a retained input of this scope, stored before the check entry that names their digest (section 16.4).
  const kept = given.snapshot?.(record.snapshot.digest) ?? null;
  const pairs = kept === null ? null : snapshotRead(record.snapshot.digest, kept);
  const snapshot = pairs ? snapshotOf(pairs) : null;
  if (!snapshot || snapshot.digest !== record.snapshot.digest || snapshot.count !== record.snapshot.count) return false;
  const { start } = record;
  if (foreignOn(snapshot.pairs, record.commit, given.scope.at, roots) !== start.foreign) return false;
  const row = record.F.some((f) => "start" in f);
  if ("basis" in start) {
    if (start.basis.kind === "input" && !selectedInput(given, start.basis.input, root.values["under"])) return false;
    if (start.basis.kind === "own-check" && prior(record.commit, start.basis.checked)?.foreign !== null) return false;
    if (start.basis.kind === "row" && !record.F.some((f) => "start" in f && f.commit === record.commit && f.ref === start.foreign)) return false;
  }
  if (row !== ("basis" in start && start.basis.kind === "row")) return false;
  for (const stop of record.stops) {
    // Guard 6, in full: the stop names an input that is `selected` under the source commitment at this commit.
    if (stop.kind === "selected-report") {
      if (!selectedInput(given, stop.input, root.values["under"])) return false;
      continue;
    }
    // Guard 4: the root, with that number and state, under the source commitment; an earlier prior check of that commit; and the
    // stop is not the act's commit.
    if (stop.commit === record.commit || !prior(stop.commit, stop.checked)) return false;
    if (!roots.some((r) => r.number === stop.root && r.commit === stop.commit && r.state === stop.state)) return false;
  }
  // Guard 5: each carried commit is in the F of the prior check that its `via` stop names.
  return record.F.every((f) => {
    if (!("via" in f)) return true;
    const stop = record.stops.find((s) => s.kind === "own-root" && s.commit === f.via);
    return stop?.kind === "own-root" && prior(stop.commit, stop.checked)?.F.includes(f.commit) === true;
  });
}

const commits = (list: unknown): string[] => (Array.isArray(list) ? list.filter((c): c is string => typeof c === "string") : []);

/**
 * The guard `ancestry` (section 6.11). A `check` record for this intent and
 * commit exists: local, or carried by `pin`. Its state is `recorded`. Its
 * ancestry record names `commit`. When the record is local, guards 2 to 6
 * hold against this scope's records at this commit. And the list F passes
 * the row: for `report`, F is empty; for `manifest`, each commit of F is in
 * `selected` or `earlier`, or is carried through a stop at such a commit.
 *
 * When the record is carried by another lane's entry, that lane judged
 * guards 2 to 6 in the commit of its check entry, and only the commit and
 * the row are judged here.
 *
 * The refusal `unnamed-work` is "with the commit" in the texts. A guard
 * answers with a name alone, so the commit is not carried (I3 deltas, entry
 * EF13).
 */
function ancestry(args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string {
  const check = checked(args, given);
  if (!check) return "ancestry-stale";
  if (check.state === "too-large") return "ancestry-too-large";
  const record = check.values["record"];
  if (check.state !== "recorded" || !isAncestryCheck(record) || record.commit !== args["commit"] || check.values["commit"] !== args["commit"]) return "ancestry-stale";
  if (check.local && !fits(record, check.local, given)) return "ancestry-stale";
  const named = new Set([...commits(args["selected"]), ...commits(args["earlier"])]);
  const passes = args["row"] === "report" ? record.F.length === 0 : args["row"] === "manifest" && record.F.every((f) => named.has(f.commit) || ("via" in f && named.has(f.via)));
  return passes ? true : "unnamed-work";
}

/**
 * The code of `git-read@1`: the guard `ancestry`. The version declares no
 * effect and no record of its own, and its guard derives no effect, so it
 * declares no maximum above zero. The value holds no state and reads no
 * port: the judge gives the guard the snapshots that the scope retains.
 */
export function gitRead(): Capabilities {
  return {
    maxima: [],
    implements: (form) => form.capability === GIT_READ && (form.form === "listed" || (form.form === "guard" && form.name === "ancestry")),
    guard: (capability, guard, args, given) => {
      if (capability !== GIT_READ || guard !== "ancestry") throw new Error(`${capability} has no code for the guard ${guard}`);
      return ancestry(args, given);
    },
    effect: (capability, effect) => { throw new Error(`${capability} has no code for the effect ${effect}`); },
  };
}

/**
 * One value for the forms of several capability versions: each form is
 * asked of the part that has its code. `first` may hold more than the
 * guards and effects, such as the steps and the operations of `hold@1`, and
 * those members are kept.
 */
export function capabilitiesOf<T extends Capabilities>(first: T, ...others: readonly Capabilities[]): T {
  const parts: readonly Capabilities[] = [first, ...others];
  const by = (capability: string, form: "guard" | "effect", name: string) => parts.find((p) => p.implements({ capability: capability as never, form, name })) ?? first;
  const implemented = first.implements.bind(first) as (...asked: unknown[]) => boolean;
  return {
    ...first,
    // The declared maxima of every part. A part that declares none leaves the whole value with none, and nothing is counted.
    ...(parts.every((p) => p.maxima) ? { maxima: parts.flatMap((p) => p.maxima!) } : { maxima: undefined }),
    // A step is asked of `first` with two arguments: a capability and a step. A form is asked of every part.
    implements: ((...asked: unknown[]) => implemented(...asked) || (asked.length === 1 && others.some((p) => p.implements(asked[0] as never)))) as T["implements"],
    guard: (capability, guard, args, given) => by(capability, "guard", guard).guard(capability, guard, args, given),
    effect: (capability, effect, args, given) => by(capability, "effect", effect).effect(capability, effect, args, given),
  };
}
