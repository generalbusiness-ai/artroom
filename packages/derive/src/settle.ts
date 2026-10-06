/**
 * The judges of the entries a scope writes about its own duties (scope
 * contract, sections 4.3, 7.4 and 9.2): a diagnosis of a request that could
 * not be delivered, the outcome of an attempt of an outside operation, and a
 * checkpoint. None has a caller outside the scope: one that is not written
 * is offered again, or is not an input the scope can write.
 */

import type { Attempt, Digest, Entry, FactUse, ObservationUse, PlatformData } from "@generalbusiness/artroom-contract";
import { evidenceValues } from "./evidence-values.ts";
import { useOf, type Reading } from "./fields.ts";
import type { Fetched } from "./guards.ts";
import { runClause } from "./handlers.ts";
import { namesOwn, outcomeOf, recordedOutcome, type OutcomeInput, type OutcomeOffered, type Owners } from "./ledger.ts";
import { ownersOf, type OutcomeReading } from "./outcomes.ts";
import type { Judgment } from "./judge.ts";
import { withinCounts } from "./draws.ts";
import { RuleFault, atHand, atHandByRows, placeWithoutValue, retainedOf, unjudged, type FirstStep, type PlatformRules } from "./marks.ts";
import { listedByRule, observedName, rowsOfKind, settle, subjectName, waits, type Observing, type Settling as RowsGiven } from "./observes.ts";
import { stateDigest, type ScopeState, type StateView } from "./state.ts";
import { nextDue } from "./timed.ts";
import { timeMs } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isLocalId, own } from "./values.ts";

type Settling = Pick<Reading, "clock" | "bounds">;
const invalid = (detail: string): Judgment => ({ result: "refused", reason: "bad-input", detail });

/**
 * What every one of these inputs meets first: the due check of section 5.2,
 * step 6.3, and the rule of section 7.2 that a provisional scope writes only
 * its confirmation and a refused one nothing.
 */
function admitted(view: StateView, definition: ValidDefinition, context: Settling): { scope: ScopeState } | Judgment {
  const scope = view.scope();
  if (!scope) return { result: "unavailable", reason: "unavailable" };
  const next = nextDue(view, definition, context.clock.asOf);
  if (next) return { result: "due", next };
  if (scope.status === "provisional") return { result: "unavailable", reason: "scope-provisional" };
  if (scope.status === "refused") return { result: "refused", reason: "scope-refused", detail: "the scope's genesis was refused" };
  return { scope };
}

const ROUTING: readonly Attempt["answer"][] = ["wrong-incarnation", "not-found"];
const ANSWERS: readonly Attempt["answer"][] = ["none", "retry", ...ROUTING];

/**
 * Section 7.4, "When a request cannot be delivered". The finding follows
 * from the attempt log and from nothing else: `undelivered` only when every
 * attempt was answered by a routing refusal and none went unanswered. Then
 * the send's `undelivered` clause runs. Otherwise the finding is
 * `delivery-unavailable`: no clause runs, the request stays pending, and a
 * later authentic result may still be recorded.
 */
export function judgeDiagnosis(view: StateView, definition: ValidDefinition, diagnosis: { of: { seq: number; n: number }; attempts: readonly Attempt[] }, context: Reading & { origin?: Entry | null | undefined }): Judgment {
  const { of, attempts } = diagnosis;
  const request = isLocalId(of.seq) && isLocalId(of.n) ? view.request(of.seq, of.n) : null;
  // A request has one diagnosis: retransmission stopped when it was written.
  if (request?.diagnosis) return { result: "repeat", seq: request.diagnosis.seq };
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  if (!request) return invalid("names no request send of this scope");
  if (request.result) return invalid("the request has a recorded result");
  if (attempts.length === 0 || attempts.some((a) => timeMs(a.at) === null || !ANSWERS.includes(a.answer))) return invalid("the log holds at least one attempt, each with a time and an answer");

  const finding = attempts.every((a) => ROUTING.includes(a.answer)) ? "undelivered" : "delivery-unavailable";
  // Platform data: a mark among the effects of the `undelivered` clause is run when the clause runs, and a fault of its rule leaves
  // the diagnosis not written now (section 6.1).
  const ran = finding === "undelivered" ? unjudged(() => runClause(view, definition, context, admit.scope, request, "undelivered", undefined, { type: "diagnosis", of: { seq: of.seq, n: of.n }, attempts })) : { result: "ran", effects: [], uses: [], judgesTime: false } as const;
  if (ran.result === "unavailable") return ran;
  if (ran.judgesTime && context.clock.behind) return { result: "unavailable", reason: "clock-behind" };
  return withinCounts(view, definition, { result: "write", draft: { input: { type: "diagnosis", of: { seq: of.seq, n: of.n }, finding, attempts }, uses: ran.uses, prepared: [], effects: ran.effects, sends: [], judgesTime: ran.judgesTime } } satisfies Judgment);
}

/**
 * What the judge of an outcome is given beside the reading: the rules of
 * the owners this runtime has code for (`ledger.ts`); and, in a scope under
 * a platform definition, that definition's rules and the scope's own
 * history, which a rule of an outcome entry is given (section 6.1, place 7).
 */
export type OutcomeContext = Settling & {
  owners?: Owners | undefined; platform?: PlatformRules | undefined; own?: Reading["own"];
  /**
   * The further observations at hand for this outcome (sections 4.1 and
   * 16.1): what the scope read before the turn, each judged by the guards
   * of an observation before the judge is given it. A verifier gives the
   * records of the entry's own `observed`. Only a rule of a platform
   * definition reads one, and the entry retains exactly those that its
   * rules read. Absent: none is at hand.
   */
  observed?: readonly ObservationUse[] | undefined;
  /**
   * The foreign entries at hand for this outcome, fetched before the turn,
   * each already checked against its hash. A rule is given them as the
   * entries in `uses` (section 6.1, item 4), and the entry names every one
   * in `uses`, as a written entry names every foreign entry that was
   * fetched for its input (section 17.3). A verifier gives the retained
   * copy of each entry that the recorded `uses` name. Absent: none.
   */
  facts?: readonly Fetched[] | undefined;
  /**
   * Revision 20, under a definition whose data states rows or an `origin`
   * (`ValidDefinition.observing`). `retained`: the scope's retained copy of
   * one foreign entry that an entry of it names in `uses`, with the name of
   * the definition that its scope pins. The judge asks it for each entry
   * in the `uses` of the outcome's origin: nothing is fetched (section 6.1,
   * "The origin of an outcome"). Absent: `facts` is searched. `observing`:
   * what the commit holds for the rows of the kind, beside `observed`,
   * whose records the judge then judges itself, by the six guards with the
   * window and the use of each row. `values`: canonical bytes beside an
   * observation or named by evidence in an owner-declared domain.
   */
  retained?: ((use: FactUse) => Fetched | null) | undefined;
  observing?: Observing | undefined;
  values?: readonly string[] | undefined;
};

/** `conflict`: the outcome contradicts a recorded `confirmed` or `refused` of the same attempt. It writes nothing, and is answered `outcome-conflict` with the entry it contradicts (section 4.3, item 6). */
export type OutcomeJudgment = Judgment | { result: "conflict"; seq: number };

/**
 * The outcome of one attempt of an outside operation (section 4.3). The
 * rules are the ledger's (`ledger.ts`), in this order. A second copy of a
 * recorded answer, and an answer that contradicts a recorded one, are
 * answered from the history and write nothing. Then the outcome meets what
 * every input of this file meets. Then the ledger derives its entry: the
 * attempt's record with `selected`, the next attempt when one follows, and
 * what the owner derives. The evidence is carried, and its truth is not
 * judged. An outcome judges no time, so it may be written clamped (section
 * 5.3), unless a rule of it read the clock or the entry retains an
 * observation.
 *
 * In a scope under a platform definition, a rule of the outcome is given
 * `observed` and the entries in `uses`, as a rule of an act is (section 6.1,
 * "What a rule is given"). The entry's input holds each observation that a
 * rule read, and its `uses` each foreign entry at hand.
 */
export function settleOutcome(view: StateView, definition: ValidDefinition, outcome: OutcomeOffered, context: OutcomeContext): OutcomeJudgment {
  // Section 4.1: an outcome that is offered with another owner or kind than its operation has is `bad-input`, also when it would
  // be a copy of a recorded answer. Nothing is written.
  const operation = view.operation(outcome.operation);
  if (operation && !namesOwn(operation, outcome)) return invalid("the outcome names another owner or kind than its operation has");
  const known = recordedOutcome(view, outcome);
  if (known) return known;
  // New evidence values are matched before any rule reads them, and kept even when no rule reads one.
  const valueOwner = operation ? ownersOf(definition, context.platform, context.owners)?.rules(operation.owner, operation.kind) : null;
  if (valueOwner?.values !== undefined && valueOwner.valueDomains === undefined) return { result: "unavailable", reason: "unavailable" };
  const names = unjudged(() => evidenceValues(valueOwner, outcome.evidence));
  if (names === null) return invalid("the evidence names a value outside its owner declaration");
  if ("result" in names) return names;
  const places = names.map((value, n) => ({ ...value, field: `evidence:${n}` }));
  const values = atHand(undefined, context.values, places);
  if (placeWithoutValue(values) !== null) return invalid("the evidence names a value whose canonical bytes were not given under its digest and bound");
  const kept = retainedOf(values).values;
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  // The owner of the operation may be the platform definition that this scope pins. Its rule for outcome entries of this kind is
  // the one that `outcomes` names. A fault of the rule leaves the outcome not judged, and nothing is written (section 6.1).
  const ran = { clock: false };
  // Revision 20: under a definition whose data states rows or an origin, the entry retains what its rows give and copies the `uses`
  // of its origin. Under any other, the older rule below stands, as a stand-in.
  if (definition.observing) {
    const judged = unjudged(() => byRows(view, definition, outcome, context, ran));
    return withinCounts(view, definition, judged.result === "write" ? { ...judged, draft: { ...judged.draft, values: [...kept, ...(judged.draft.values ?? []).filter((value) => !kept.some((read) => read.domain === value.domain && read.digest === value.digest))] } } : judged);
  }
  const facts = context.facts ?? [];
  // Sections 4.1 and 16.1: what a rule of this outcome reads of the observations at hand is noted, and the entry retains it.
  const beside = atHand(context.observed, context.values);
  const judged = unjudged(() => outcomeOf(view, definition, outcome, ownersOf(definition, context.platform, context.owners, { clock: context.clock, bounds: context.bounds, own: context.own, ran, facts, beside })));
  if (judged.result !== "write") return judged;
  const retained = retainedOf(beside).observed;
  // Section 7.5: one entry names no more foreign entries than the bound. An outcome is never refused, so more at hand than that
  // leaves it not written: the caller fetched what no entry can hold.
  if (facts.length > context.bounds.usesPerEntry) return { result: "unavailable", reason: "unavailable" };
  // An outcome judges no time. An entry for which a rule read the clock does, and so does one that retains an observation,
  // wherever the observation stands: neither is written clamped (sections 6.1 and 16.1).
  const judgesTime = ran.clock || retained.length > 0;
  if (judgesTime && context.clock.behind) return { result: "unavailable", reason: "clock-behind" };
  // Section 4.1, "An input may retain observations": each one that a rule read, in ascending order of `read.n`, and no member when
  // none was read. So an outcome whose rules read none has the bytes it had.
  const input = retained.length > 0 ? { ...judged.draft.input, observed: retained } : judged.draft.input;
  // Section 17.2a, "Past a count": an outcome whose entry would draw past a count of a holder is not judged. It stays offered.
  return withinCounts(view, definition, { result: "write", draft: { ...judged.draft, input, uses: facts.map((fact) => useOf(fact.fact, fact.entry)), judgesTime, values: [...kept, ...retainedOf(beside).values.filter((value) => !kept.some((read) => read.domain === value.domain && read.digest === value.digest))] } } satisfies Judgment);
}

/**
 * An outcome under a definition whose data states rows of `observes`, or
 * the `origin` of an outcome (revision 20, sections 6.1 and 16.1; rows
 * I3-39, I3-41 and I3-56), in this order.
 *
 * 1. **The origin.** With `origin: "opening"` it is the entry that opened
 *    the outcome's operation, at the position that the operation's ID
 *    states. With `origin: "rule"` the rule of the kind names it by its
 *    position, or names none. With no member `origin` the outcome has none.
 *    The outcome's `uses` is a copy of its origin's, whole and in that
 *    order, and with no origin it is empty. A rule is given each of those
 *    entries by its bytes, from the copy that the scope retains.
 * 2. **The first list.** The subjects of the rows that do not state
 *    `second`. For a row that states `from: "rule"` the rule names them.
 * 3. **The second list**, from the observations of the first: the subjects
 *    of the rows that state `second`.
 * 4. **The rows, settled.** A subject of either list with no observation at
 *    hand, which the scope can still read, stops the commit. An absent row
 *    that states `wait` leaves the outcome not written: it stays offered.
 *    Every other absent row, and every row that is over, is told to the
 *    rule, and the entry is written.
 *
 * Then the ledger derives the entry. Its input holds one record of
 * `observed` for each subject that a whole row gives, and no other.
 */
function byRows(view: StateView, definition: ValidDefinition, outcome: OutcomeOffered, context: OutcomeContext, ran: { clock: boolean }): OutcomeJudgment {
  const scope = view.scope()!;
  const operation = view.operation(outcome.operation);
  const beside = atHandByRows(context.values);
  const reading: OutcomeReading = { clock: context.clock, bounds: context.bounds, own: context.own, ran, facts: [], beside };
  const owners = ownersOf(definition, context.platform, context.owners, reading);
  const kind = operation && operation.owner === context.platform?.named ? own((definition.declared as unknown as PlatformData).outcomes ?? {}, operation.kind) : undefined;
  const rules = operation && kind ? owners?.rules(operation.owner, operation.kind) : null;
  let uses: readonly FactUse[] = [];
  let settled: ReturnType<typeof settle> | null = null;
  const rows = operation && kind ? rowsOfKind(definition.declared, operation.kind) : [];
  if (operation && kind && rules) {
    const offered: OutcomeInput = { type: "outcome", operation: operation.id, attempt: outcome.attempt, owner: operation.owner, kind: operation.kind, result: outcome.result, evidence: outcome.evidence };
    // 1. The origin, and the entries that it retained.
    let at: number | null = null;
    if (kind.origin === "opening") at = Number(operation.id.split(":")[0]);
    else if (kind.origin === "rule") {
      if (!rules.origin) throw new RuleFault(`the kind ${operation.kind} states origin: rule, and its rule names no origin`);
      at = rules.origin(view, operation, offered);
    }
    if (at !== null) {
      const origin = typeof at === "number" && Number.isSafeInteger(at) && at >= 0 && at <= scope.head.seq ? (context.own?.(at) ?? null) : null;
      // A position that is no entry of the scope is a fault of the rule.
      if (!origin) throw new RuleFault(`the origin of an outcome of ${operation.kind} is no earlier entry of the scope`);
      uses = origin.entry.uses;
      const copies = uses.map((use) => context.retained?.(use) ?? (context.facts ?? []).find((fact) => fact.fact.hash === use.fact.hash) ?? null);
      // The scope retained each of those entries when it wrote the origin. One that is not at hand leaves the outcome not written now.
      if (copies.some((copy, i) => !copy || useOf(copy.fact, copy.entry).content !== uses[i]!.content)) return { result: "unavailable", reason: "dependency-unavailable" };
      reading.facts = copies as Fetched[];
    }
    if (rows.length > 0) {
      const g: RowsGiven = { view, bounds: context.bounds, clock: context.clock, observed: context.observed ?? [], values: context.values ?? [], observing: context.observing };
      const named = (first: FirstStep | null) => (n: number): unknown => {
        if (!rules.subjects) throw new RuleFault(`a row of the kind ${operation.kind} states from: rule, and its rule names no subjects`);
        return rules.subjects(view, operation, offered, n, first);
      };
      // 2. The first list, and what is at hand for it.
      const first = listedByRule(rows, false, named(null));
      settled = settle(first, g);
      if (settled.missing.length > 0) return { result: "unavailable", reason: "authority-unavailable", missing: settled.missing, rows: settled };
      if (waits(first, settled)) return { result: "unavailable", reason: "authority-unavailable", rows: settled };
      // 3. The second list, from the observations of the first: each that is at hand for a whole row, and for each other row that it
      // is over or absent. A row of the second step is given no observation of the second step.
      if (rows.some((row) => "second" in row && row.second === true)) {
        const { listed, retained, status } = settled;
        const step: FirstStep = {
          rows: rows.map((_, n) => status.get(n) ?? null),
          observed(subject) {
            if (!listed.has(subjectName(subject))) throw new RuleFault("the rule of a row of the second step reads an observation of a subject that no row of the first step gives");
            return retained.find((use) => observedName(use.observation) === subjectName(subject)) ?? null;
          },
        };
        const all = [...first, ...listedByRule(rows, true, named(step))];
        // 4. One subject of both steps is one subject.
        settled = settle(all, g);
        if (settled.missing.length > 0) return { result: "unavailable", reason: "authority-unavailable", missing: settled.missing, rows: settled };
        if (waits(all, settled)) return { result: "unavailable", reason: "authority-unavailable", rows: settled };
      }
    }
  }
  // What a rule of the entry reads: an observation only of a subject on the list. A kind that states no row has none.
  beside.rows = { status: rows.map((_, n) => settled?.status.get(n) ?? null), listed: settled?.listed ?? new Set(), retained: settled?.retained ?? [], values: settled?.values ?? [] };
  const judged = outcomeOf(view, definition, outcome, owners);
  if (judged.result !== "write") return judged;
  const retained = retainedOf(beside);
  // An entry that retains an observation judges time, wherever the observation stands, and is never written clamped (section 16.1).
  const judgesTime = ran.clock || retained.observed.length > 0;
  if (judgesTime && context.clock.behind) return { result: "unavailable", reason: "clock-behind" };
  const input = retained.observed.length > 0 ? { ...judged.draft.input, observed: retained.observed } : judged.draft.input;
  return { result: "write", draft: { ...judged.draft, input, uses, judgesTime, ...(retained.values.length > 0 ? { values: retained.values } : {}), ...(settled ? { rows: settled } : {}) } };
}

/** `settleOutcome`, for a caller that only asks whether the outcome writes an entry: a contradiction is an input that the scope never writes. */
export function judgeOutcome(view: StateView, definition: ValidDefinition, outcome: OutcomeOffered, context: OutcomeContext): Judgment {
  const judged = settleOutcome(view, definition, outcome, context);
  return judged.result === "conflict" ? invalid(`outcome-conflict: entry ${judged.seq} records another answer of that attempt`) : judged;
}

/** The checkpoint a scope may write now: through its head, with the digest of its folded state (section 9.2). */
export function checkpointOf(view: StateView): { through: number; state: Digest } {
  const scope = view.scope();
  if (!scope) throw new Error("a scope with no entry has nothing to checkpoint");
  return { through: scope.head.seq, state: stateDigest(view.all()) };
}

/**
 * Section 9.2: a checkpoint names a `through` sequence and the digest of the
 * state folded through it. It is written as the next entry, so `through` is
 * the head. A wrong digest is refused.
 */
export function judgeCheckpoint(view: StateView, definition: ValidDefinition, checkpoint: { through: number; state: Digest }, context: Settling): Judgment {
  const admit = admitted(view, definition, context);
  if (!("scope" in admit)) return admit;
  if (checkpoint.through !== admit.scope.head.seq) return invalid("a checkpoint is through the head it is written on");
  if (checkpoint.state !== stateDigest(view.all())) return invalid("the digest is not the digest of the folded state");
  return { result: "write", draft: { input: { type: "checkpoint", through: checkpoint.through, state: checkpoint.state }, uses: [], prepared: [], effects: [], sends: [], judgesTime: false } };
}
