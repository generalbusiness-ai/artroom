/**
 * The subjects that an entry observes (scope contract, revisions 20 and 21,
 * section 16.1, "The subjects that an entry observes", "Rows that give one
 * subject, and a subject that the signer gives", "A second step, in an
 * outcome" and "A value that a row may retain"; source rows I3-39, I3-40,
 * I3-53 and I3-56). Pure functions: nothing here reads a clock, a scope or
 * a store. The judges call them in the commit, and a verifier calls the
 * same functions over the entry and the state before it.
 *
 * The data of a platform definition states rows of `observes` on an act, on
 * a kind of `outcomes` and on a clause of a result. From the rows and the
 * input the judge derives the **subject list**: what the scope reads before
 * the turn. It then needs, for each subject, one observation at hand that
 * passes the six guards with the row's window and use. The entry retains
 * exactly the observations of the subjects that a whole row gives, read by
 * a rule or not.
 *
 * - A row is **over** when its distinct subjects are more than its `max`,
 *   whatever another row gives.
 * - A row that is not over is **whole** when every one of its subjects has
 *   such an observation. A row with no subject is whole.
 * - Otherwise it is **absent**.
 *
 * **The stand-in.** A definition whose data states no row and no `origin`
 * anywhere (`ValidDefinition.observing` is false) is judged by the older
 * rule, as a STAND-IN: an entry retains each observation that a rule of it
 * read, on the window that a constant gives (`marks.ts`, `AtHand`). The
 * contract names that stand-in for an outcome and for a delivery of a
 * result, "until a definition's data states the rows". It is kept for an
 * act too, because the rules scope's `publish` reads its checkers so, and
 * its row is the authority note's revision 28, which is not adopted (I3
 * deltas, entries GA1 and GA2).
 */

import type { Bounds, ClauseObserves, Digest, KeyId, MemberId, MemberRef, Observe, ObservationUse, ObservingClause, Operand, PlatformData, PlatformDefinition, Retained, RulesObservation, SendForm } from "@generalbusiness/artroom-contract";
import { canonicalize, isKeyId, isMemberId, isMemberRef, isObservationUse, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { headsOf } from "./fold.ts";
import { observedOf, type Discarded, type RecordedRef, type Retains, type Window } from "./grant.ts";
import { operand, type Judging } from "./guards.ts";
import { RuleFault, valueDigest, type ValueRead } from "./marks.ts";
import type { Item, StateView } from "./state.ts";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { observationBytes } from "./validate/observes.ts";
import { byteOrder, isObject, own, same } from "./values.ts";

export { OBSERVES_ROWS, observationBytes } from "./validate/observes.ts";

/**
 * One subject of an observation: one key, one member, what the rules scope
 * holds by what is asked of it, or the holders of one action. `most`, of
 * the holders: how many IDs the answer may list, which is the row's.
 */
export type Subject = { key: KeyId } | { member: MemberId } | { asked: "rules" | "definitions" } | { holders: string; most: number };

/** One name for one subject. Two rows that give the same name give one subject, which is read once and retained once. */
export const subjectName = (subject: Subject | { holders: string }): string =>
  ("key" in subject ? `key:${subject.key}` : "member" in subject ? `member:${subject.member}` : "asked" in subject ? subject.asked : `holders:${subject.holders}`);

/** The name of the subject that an observation is of. An observation of a key has no member `subject`. */
export const observedName = (o: ObservationUse["observation"]): string =>
  (!("subject" in o) ? `key:${o.key}` : o.subject === "member" ? `member:${o.member}` : o.subject === "rules" ? o.content.asked : `holders:${o.action}`);

/** The status of one row in one entry. */
export type RowStatus = "whole" | "over" | "absent";

/** One row of a form with the distinct subjects that its source gives in one entry, in the order given. */
export interface Listed { n: number; row: Observe; subjects: readonly Subject[]; over: boolean }

/** A subject that has no observation at hand which passes the guards, and that the scope can still read: what it asks, and within what. */
export interface Needed {
  subject: Subject;
  /** The shortest window of the rows that give the subject, in seconds, and `once` where one of them states it. */
  window: Window;
  /** For the rules: the byte domains in which the answer may name a value, each with the most bytes of one. */
  retains: readonly Retained[];
}

/**
 * What a rules definition states of the two members that an observation of
 * the rules holds only under such a definition (section 16.1, "Two fixed
 * records, in one type"; row I3-43): the value `singleControllerException`
 * and the slot `extents`, of its item `rules`.
 */
export interface ContentStates { singleControllerException: boolean; extents: boolean }

/** What the data of a rules definition states of the two members. */
export function contentStates(data: Pick<PlatformData, "items">): ContentStates {
  const rules = own(data.items, "rules");
  const states = (name: string): boolean => rules !== undefined && own(rules.values, name) !== undefined;
  return { singleControllerException: states("singleControllerException"), extents: states("extents") };
}

/**
 * The check of the record of a rules observation that only the data of its
 * `definition` can make (row I3-43): the record that was asked as "rules"
 * holds `extents` and `singleControllerException` exactly when that data
 * states them. `states`: null when this runtime has no data of that
 * version, and then the record cannot be checked and is no observation.
 */
export function contentChecked(o: RulesObservation, states: ContentStates | null | undefined): boolean {
  if (!states) return false;
  if (o.content.asked !== "rules") return true;
  return ("extents" in o.content) === states.extents && ("singleControllerException" in o.content) === states.singleControllerException;
}

/** The digests of the values that an observation names, which are kept apart from the entry (section 16.1, "The extents, in an observation of the rules"). */
export const namedBy = (o: ObservationUse["observation"]): Digest[] =>
  ("subject" in o && o.subject === "rules" && o.content.asked === "rules" && o.content.extents !== undefined ? [o.content.extents] : []);

/**
 * What the commit holds for the rows of one input, beside the observations
 * and the values at hand.
 *
 * `membership` and `rules`: the two references that the scope records, for
 * guard 1. An incarnation of null: the scope records the ID alone, and the
 * first entry that retains an observation of it fixes the incarnation.
 * `last`: the latest earlier entry of the scope that retains that read, in
 * a grant or in `observed`; null when none does. Absent: none does.
 * `unread`: true when no observation of that subject can be had now. The
 * scope read it for this input and got no answer, or it reads no more. A
 * row that lacks it is then absent. False: the scope has not read it, or
 * can read it again. The commit then stops, and the subject is `missing`.
 * Absent: none can be had, as for a verifier, which reads nothing.
 * `content`: what the data of a rules definition states, by its name and
 * version. Absent: none is known, and no observation of the rules is at
 * hand under a row.
 */
export interface Observing {
  membership?: RecordedRef | null | undefined;
  rules?: RecordedRef | null | undefined;
  last?(use: ObservationUse): Retains | null;
  unread?(subject: Subject): boolean;
  content?(named: PlatformDefinition): ContentStates | null;
}

/** The rows of an act, of a kind of `outcomes` and of a clause of a request's send, as the pinned data states them. None: the form states none. */
export const rowsOfAct = (act: unknown): readonly Observe[] => (isObject(act) && Array.isArray(act["observes"]) ? (act["observes"] as Observe[]) : []);
export const rowsOfKind = (data: unknown, kind: string): readonly Observe[] => rowsOfAct(own((data as PlatformData).outcomes ?? {}, kind));
export function rowsOfClause(form: SendForm | null | undefined, clause: string): readonly Observe[] {
  const sent: unknown = form;
  const written = isObject(sent) ? (sent["create"] ?? sent["tell"] ?? sent["relate"]) : undefined;
  const rows = isObject(written) && isObject(written["observes"]) ? own(written["observes"] as ClauseObserves, clause as ObservingClause) : undefined;
  return rows ?? [];
}

/** The row with the subjects that it gives: distinct, in the order given. It is over when they are more than its `max`. */
function listed(n: number, row: Observe, given: readonly Subject[]): Listed {
  const seen = new Set<string>();
  const subjects = given.filter((subject) => !seen.has(subjectName(subject)) && seen.add(subjectName(subject)));
  return { n, row, subjects, over: "max" in row && subjects.length > row.max };
}

/** A row with one subject: what the rules scope holds, or the holders of one action. Null: a row with a source. */
const single = (n: number, row: Observe): Listed | null =>
  (row.of === "rules" || row.of === "definitions" ? listed(n, row, [{ asked: row.of }]) : row.of === "holders" ? listed(n, row, [{ holders: row.action, most: row.most }]) : null);

/** True when a member reference names a member of the repository whose membership scope this scope records. */
const ofRepository = (ref: MemberRef, recorded: RecordedRef | null | undefined): boolean =>
  !!recorded && ref.membership.scope === recorded.scope && ref.membership.kind === recorded.kind && (recorded.inc === null || ref.membership.inc === recorded.inc);

/**
 * The subject list of an act or of a clause of a result: the subjects of
 * each row, from the operands of section 6.5 (section 16.1, "The order
 * before the turn", part 3). It judges nothing. It says what to read.
 *
 * `foreign`: a source gave a member of another repository, or a value that
 * is no member. Such a value names no subject of this scope. An act that
 * gives one is refused `bad-field`. In a clause the subject is left out.
 */
export function listedBy(j: Judging, rows: readonly Observe[], recorded: RecordedRef | null | undefined): { rows: Listed[]; foreign: boolean } {
  let foreign = false;
  const primary: Item | null = j.subjects.get("on") ?? null;
  const members = (value: unknown): Subject[] => (value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]).flatMap((ref): Subject[] => {
    if (isMemberRef(ref) && ofRepository(ref, recorded)) return [{ member: ref.member }];
    foreign = true;
    return [];
  });
  const out = rows.map((row, n): Listed => {
    const one = single(n, row);
    if (one) return one;
    const from = (row as Extract<Observe, { from: unknown }>).from;
    if (from === "rule") throw new RuleFault("a row of an act or of a clause states no rule as its source");
    if (isObject(from) && "each" in from) {
      const { each, as, value } = from as { each: Operand; as: string; value: Operand };
      const list = operand(j, each, primary);
      const given = (Array.isArray(list) ? list : []).flatMap((element) => members(operand({ ...j, elements: new Map([[as, element as unknown]]) }, value, primary)));
      return listed(n, row, given);
    }
    return listed(n, row, members(operand(j, from as Operand, primary)));
  });
  return { rows: out, foreign };
}

/**
 * The rows of one step of an outcome with their subjects (section 16.1, "A
 * second step, in an outcome"): the rows that do not state `second`, or
 * those that do. `named`: what the rule of the kind names for a row that
 * states `from: "rule"`, a list of key IDs or of member IDs. Anything else
 * is a fault of the rule.
 */
export function listedByRule(rows: readonly Observe[], second: boolean, named: (n: number, row: Observe) => unknown): Listed[] {
  return rows.flatMap((row, n): Listed[] => {
    if (("second" in row && row.second === true) !== second) return [];
    const one = single(n, row);
    if (one) return [one];
    const given = named(n, row);
    const id = row.of === "key" ? isKeyId : isMemberId;
    if (!Array.isArray(given) || !given.every((subject) => id(subject))) throw new RuleFault(`the rule of an outcome named no list of ${row.of} IDs for row ${n}`);
    return [listed(n, row, (given as string[]).map((subject): Subject => (row.of === "key" ? { key: subject as KeyId } : { member: subject as MemberId })))];
  });
}

/** What one guard of an observation outside a grant is asked. */
export interface ObservedAsked {
  /** The reference that the scope records for the observed scope: its membership reference, or its rules reference. Null: it records none. */
  recorded: RecordedRef | null | undefined;
  window: Window;
  clock: Clock;
  last: Retains | null;
  view: Pick<StateView, "observed">;
}

/**
 * The guards of one record of `observed`, in the commit (section 16.1, "The
 * guards, in the commit"), with the window and the use of one row. Null:
 * each holds. Guard 2, that the read is of the scope's present run, is the
 * runtime's, which holds no read of another run, and in a history the
 * verifier's rule `run-returned`.
 *
 * 1. `of` is the scope's own membership reference, or its rules reference.
 * 3. Where the row states `use: "once"`, `use` is `fresh`.
 * 4. If an earlier entry retains this read, `use` is `reused`, `prior` is
 *    the latest such entry, the bytes are the ones that entry retains, and
 *    the reading is later than that entry's time. Otherwise it is `fresh`.
 * 5. The age is inside the row's window. An age that equals it is outside.
 * 6. Its head is not lower than the highest head that an earlier entry
 *    retains for one of its subjects, from the folded state.
 *
 * With the clock behind, guards 4 and 5 are not judged on the reading: an
 * entry that retains an observation is not written then (section 5.3).
 */
export function judgeObserved(use: ObservationUse, asked: ObservedAsked): Discarded | null {
  const { clock, window, last } = asked;
  const o = use.observation;
  if (!asked.recorded || !observedOf(o.of, asked.recorded)) return "of";
  if (window.once && use.use !== "fresh") return "once";
  const reading = timeMs(clock.reading)!;
  if (last === null) {
    if (use.use !== "fresh" || use.prior !== null) return "use";
  } else {
    if (use.use !== "reused" || !same(use.prior, last.entry) || !same(o, last.observation)) return "use";
    if (!clock.behind && reading <= timeMs(last.time)!) return "moved";
  }
  const began = timeMs(o.at);
  if (began === null) return "age";
  const age = reading - began;
  if (!clock.behind && (age < 0 || age >= window.seconds * 1000)) return "age";
  for (const head of headsOf(use)) {
    const held = asked.view.observed(head.of, head.subject);
    if (held !== null && head.seq < held) return "older";
  }
  return null;
}

/** Why an observation at hand does not serve a row: a guard that failed, a record that is not of the row's kind or is past its size, or a value that it names and that is not at hand. */
export type Unserved = Discarded | "record" | "value";

/** What the rows of one entry come to. */
export interface Settled {
  /** The status of each row that was listed, by its position among the rows of the form. */
  status: ReadonlyMap<number, RowStatus>;
  /** One record for each subject that at least one whole row gives, and no other, in ascending order of `read.n`. */
  retained: readonly ObservationUse[];
  /** Each value that a retained observation names, in a domain that its whole row states: kept apart from the entry, once for a domain and a digest. */
  values: readonly ValueRead[];
  /** The subjects with no such observation that the scope can still read. With one, the commit stops, the scope reads, and the turn starts again. */
  missing: readonly Needed[];
  /** The name of every subject that a row gives, whole, over or absent. A rule reads an observation only of one of these. */
  listed: ReadonlySet<string>;
  /** The subjects that the grant's observation serves: the row has each, and `observed` holds no record of it. */
  served: ReadonlySet<string>;
  /** For each observation at hand that is of a listed subject and serves no row: why, under the row that it came nearest to serving. */
  unserved: ReadonlyMap<ObservationUse, Unserved>;
}

/** What `settle` is given beside the rows. */
export interface Settling {
  view: Pick<StateView, "observed">;
  bounds: Bounds;
  clock: Clock;
  /** The observations at hand, and the canonical bytes of each value that came beside one. */
  observed: readonly ObservationUse[];
  values: readonly string[];
  observing: Observing | undefined;
  /**
   * An act only: the observation in the act's grant (section 16.1, "A
   * subject that is the signer's own member"). Where a member on the list
   * is its `member`, its age is inside the row's window and its `use` is
   * `fresh` where the row states `once`, the grant serves the subject.
   */
  grant?: ObservationUse | null | undefined;
}

const windowOf = (row: Observe): Window => ({ seconds: row.window, once: row.use === "once" });

/** The value that an observation names, at hand in one of the domains that the row states and within its `max`: its domain, digest and bytes. Null: none. */
function valueAt(values: readonly string[], digest: Digest, retains: readonly Retained[]): ValueRead | null {
  for (const bytes of values) {
    if (typeof bytes !== "string") continue;
    const size = utf8(bytes).length;
    let value: unknown;
    try {
      value = parseStrict(bytes);
      if (canonicalize(value) !== bytes) continue;
    } catch {
      continue;
    }
    for (const { domain, max } of retains) if (size <= max && valueDigest(domain, value) === digest) return { domain, digest, bytes };
  }
  return null;
}

/**
 * Whether one observation at hand serves one subject of one row: it is a
 * record of the row's kind, no longer than the largest size of that kind;
 * for the rules, its record is the one that the data of its `definition`
 * states, and each value that it names is at hand in a domain that the row
 * states, within that `max`; and it passes the guards with the row's window
 * and use. An answer that names a value in a domain that the row does not
 * state, whose bytes are over the `max`, or whose bytes are missing, is no
 * answer (section 16.1, "A value that a row may retain").
 */
function serves(use: ObservationUse, row: Observe, g: Settling, recorded: RecordedRef | null | undefined): { values: ValueRead[] } | Unserved {
  const o = use.observation;
  const kind = !("subject" in o) ? "key" : o.subject === "rules" ? o.content.asked : o.subject;
  if (!isObservationUse(use) || kind !== row.of || utf8(canonicalize(use)).length > observationBytes(row.of, g.bounds, row.of === "holders" ? row.most : 0)) return "record";
  if ("subject" in o && o.subject === "holders" && o.holders.length !== Math.min(o.count, (row as Extract<Observe, { of: "holders" }>).most)) return "record";
  if ("subject" in o && o.subject === "rules" && !contentChecked(o, g.observing?.content?.(o.definition))) return "record";
  const values: ValueRead[] = [];
  for (const digest of namedBy(o)) {
    const value = valueAt(g.values, digest, row.of === "rules" ? (row.retains ?? []) : []);
    if (!value) return "value";
    values.push(value);
  }
  const failed = judgeObserved(use, { recorded, window: windowOf(row), clock: g.clock, last: g.observing?.last?.(use) ?? null, view: g.view });
  return failed ?? { values };
}

/**
 * The reference that the scope records for one kind of observed scope, with
 * the incarnation that this entry fixes where none is recorded yet (section
 * 16.1, "The first read of a scope names no incarnation"): every
 * observation that one entry retains of one scope states one incarnation.
 * It is the one of the grant's observation, or else of the observation at
 * hand of that scope ID with the lowest `read.n`.
 */
function fixed(recorded: RecordedRef | null | undefined, g: Settling): RecordedRef | null | undefined {
  if (!recorded || recorded.inc !== null) return recorded;
  const first = [...(g.grant ? [g.grant] : []), ...[...g.observed].sort((a, b) => a.read.n - b.read.n)].find((use) => observedOf(use.observation.of, recorded));
  return first ? { ...recorded, inc: first.observation.of.inc } : recorded;
}

/**
 * The rows of one entry, settled (section 16.1, "Rows that give one
 * subject, and a subject that the signer gives"). Each row is whole, over
 * or absent for itself. A subject is read once and retained once, however
 * many rows give it, and it is retained when a whole row gives it.
 */
export function settle(rows: readonly Listed[], g: Settling): Settled {
  const membership = fixed(g.observing?.membership, g);
  const rules = fixed(g.observing?.rules, g);
  const status = new Map<number, RowStatus>();
  const kept = new Map<string, ObservationUse>();
  const values: ValueRead[] = [];
  const lacking = new Map<string, Needed>();
  const listedNames = new Set<string>();
  const served = new Set<string>();
  const unserved = new Map<ObservationUse, Unserved>();
  const reading = timeMs(g.clock.reading)!;
  const grantServes = (subject: Subject, row: Observe): boolean => {
    const grant = g.grant?.observation;
    if (!grant || "subject" in grant || !("member" in subject) || grant.member !== subject.member || !membership || !observedOf(grant.of, membership)) return false;
    const age = reading - (timeMs(grant.at) ?? Infinity);
    return age >= 0 && age < row.window * 1000 && (row.use !== "once" || g.grant!.use === "fresh");
  };
  // Every row must judge the same record of a shared subject. Prefer the
  // record that serves the most rows, so a fresh read inside the shortest
  // window serves both a strict and a looser row. If only a looser record
  // exists, that row may still be whole while the stricter row is absent.
  const giving = new Map<string, { subject: Subject; rows: Listed[] }>();
  for (const listed of rows) if (!listed.over) for (const subject of listed.subjects) {
    const name = subjectName(subject);
    const group = giving.get(name) ?? { subject, rows: [] };
    group.rows.push(listed);
    giving.set(name, group);
  }
  const bySubject = new Map<string, ObservationUse[]>();
  for (const use of g.observed) {
    const name = observedName(use.observation);
    const group = bySubject.get(name) ?? [];
    group.push(use);
    bySubject.set(name, group);
  }
  const answers = new Map<number, Map<ObservationUse, ReturnType<typeof serves>>>();
  const chosen = new Map<string, ObservationUse | "grant">();
  for (const [name, group] of giving) {
    let best: ObservationUse | undefined;
    let score = 0;
    for (const use of bySubject.get(name) ?? []) {
      let count = 0;
      for (const { n, row } of group.rows) {
        const recorded = row.of === "rules" || row.of === "definitions" ? rules : membership;
        const answer = serves(use, row, g, recorded);
        const rowAnswers = answers.get(n) ?? new Map();
        rowAnswers.set(use, answer);
        answers.set(n, rowAnswers);
        if (typeof answer !== "string") count += 1;
      }
      if (count > score || (count > 0 && count === score && use.read.n > (best?.read.n ?? -1))) { best = use; score = count; }
    }
    const grantRows = group.rows.filter(({ row }) => grantServes(group.subject, row)).length;
    if (grantRows > 0 && grantRows >= score) chosen.set(name, "grant");
    else if (best) chosen.set(name, best);
  }
  for (const { n, row, subjects, over } of rows) {
    for (const subject of subjects) listedNames.add(subjectName(subject));
    if (over) { status.set(n, "over"); continue; }
    const recorded = row.of === "rules" || row.of === "definitions" ? rules : membership;
    const found: { name: string; use: ObservationUse; values: ValueRead[] }[] = [];
    let whole = true;
    for (const subject of subjects) {
      const name = subjectName(subject);
      const picked = chosen.get(name);
      if (picked === "grant" && grantServes(subject, row)) { served.add(name); continue; }
      let serving: (typeof found)[number] | null = null;
      for (const use of bySubject.get(name) ?? []) {
        const answer = answers.get(n)?.get(use) ?? serves(use, row, g, recorded);
        if (typeof answer === "string") { if (!unserved.has(use)) unserved.set(use, answer); continue; }
        if (use === picked) serving = { name, use, values: answer.values };
      }
      if (serving) { found.push(serving); continue; }
      whole = false;
      // What the scope asks so that every row which gives the subject can be whole: within the shortest of their windows, and `fresh`
      // where one of them states `once`.
      if (g.observing?.unread && !g.observing.unread(subject)) {
        const held = lacking.get(name);
        const most = "holders" in subject && held && "holders" in held.subject ? Math.max(subject.most, held.subject.most) : null;
        lacking.set(name, {
          subject: most === null ? (held?.subject ?? subject) : { ...(subject as { holders: string; most: number }), most },
          window: { seconds: Math.min(row.window, held?.window.seconds ?? row.window), once: row.use === "once" || held?.window.once === true },
          retains: held && held.retains.length > 0 ? held.retains : row.of === "rules" ? (row.retains ?? []) : [],
        });
      }
    }
    status.set(n, whole ? "whole" : "absent");
    if (!whole) continue;
    for (const { name, use, values: named } of found) {
      if (!kept.has(name)) kept.set(name, use);
      for (const value of named) if (kept.get(name) === use && !values.some((held) => held.domain === value.domain && held.digest === value.digest)) values.push(value);
    }
  }
  for (const use of kept.values()) unserved.delete(use);
  return { status, retained: [...kept.values()].sort((a, b) => a.read.n - b.read.n), values, missing: [...lacking.values()], listed: listedNames, served, unserved };
}

/** What follows from the rows of an outcome or of a clause that are not whole: the entry is not written, because a row that states `wait` is absent; or it is written. */
export const waits = (rows: readonly Listed[], settled: Settled): boolean => rows.some(({ n, row }) => settled.status.get(n) === "absent" && row.without === "wait");

// ---------------------------------------------------------------- what a form may retain, for a reservation

/**
 * The bytes that an entry of a form may newly retain for the values that
 * its rows state under `retains`, each at its `max` (section 17.2, "A value
 * that an observation names"; row I3-53). It is a function of the rows.
 *
 * FOR THE RESERVATION. This package counts no bytes against a budget
 * (section 17.5). The worker on reservations calls this where it counts
 * what a form's entry may newly retain: with the rows of an act that
 * settles, and with the rows of a kind of `outcomes`, for each of its
 * outcome entries.
 */
export const retainable = (rows: readonly Observe[]): number =>
  rows.reduce((bytes, row) => bytes + (row.of === "rules" ? (row.retains ?? []).reduce((sum, record) => sum + record.max, 0) : 0), 0);

/**
 * The same for one request, reserved when the entry that sends it is
 * admitted: the largest, over the clauses that can still run, which are
 * `applied`, `refused` and `superseded`. A `conflict` result is new work
 * and is not reserved (section 17.2, "A `conflict` is not reserved").
 */
export const retainableByRequest = (form: SendForm | null | undefined): number =>
  Math.max(0, ...(["applied", "refused", "superseded"] as const).map((clause) => retainable(rowsOfClause(form, clause))));

/**
 * Each byte domain that a row of the pinned data states under `retains`,
 * once, in the order of the data: on an act, on a kind of `outcomes`, and
 * on a clause of a send of an act or of a handler. A verifier asks a value
 * that an observation names in each of them (section 9.2: a read of one
 * value asks by the kind, the domain and the digest).
 */
export function retainsOf(definition: Pick<ValidDefinition, "declared">): string[] {
  const data = definition.declared as unknown as PlatformData;
  const forms = [...Object.values(data.acts), ...Object.values(data.receives)];
  const rows: Observe[] = [
    ...Object.values(data.acts).flatMap((act) => rowsOfAct(act)), ...Object.keys(data.outcomes ?? {}).flatMap((kind) => rowsOfKind(data, kind)),
    ...forms.flatMap((form) => form.sends.flatMap((send) => (["applied", "refused", "superseded", "conflict"] as const).flatMap((clause) => rowsOfClause(send as SendForm, clause)))),
  ];
  return [...new Set(rows.flatMap((row) => (row.of === "rules" ? (row.retains ?? []).map((record) => record.domain) : [])))];
}

/** The holders that one answer lists: the first `most` of them, in byte order of member ID (section 16.1, "An observation of the holders of one action"). */
export const firstHolders = (holders: readonly MemberId[], most: number): MemberId[] => [...holders].sort(byteOrder).slice(0, most);
