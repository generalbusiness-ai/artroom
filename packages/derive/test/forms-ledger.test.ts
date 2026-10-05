import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Entry, Evidence, OperationId } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import { FoldError, applyEntry, checkpointOf, clockOf, operationId, operationOpening, operationStanding, owed, settleOutcome, tokenPast } from "../src/index.ts";
import type { Opening, OperationRules, Owners } from "../src/index.ts";
import { Scope, t, ticketDefinition } from "./fixtures.ts";

/**
 * Made-up owner rules, one for each kind the cases use. They stand in for
 * the rules of a capability or a platform definition, which later steps
 * deliver. A create selects one result, is never shown by a read, and opens
 * a deletion for a result that is not selected. A mint is never tried again.
 * A push is decided by a read, and its rule always asks for another attempt.
 */
const again = { retries: () => true };
const kinds: Record<string, OperationRules> = {
  create: { selects: true, read: false, ...again, derives: (_view, _operation, _outcome, selected) => ({ effects: [], sends: [], opens: selected === false ? [{ owner: "hold@1", kind: "delete", attempts: 3 }] : [] }) },
  delete: { selects: false, read: false, ...again },
  mint: { selects: false, read: false, retries: () => false },
  push: { selects: false, read: true, ...again },
};
const owners: Owners = { rules: (_owner, kind) => kinds[kind] ?? null };
const create: Opening = { owner: "hold@1", kind: "create", attempts: 3 };

/**
 * The entry that opens operations, made by hand: no form of this step opens
 * one. Its effects are the ledger's own, at the ordinals 0, 1 and so on.
 */
function open(s: Scope, ...opens: Opening[]): OperationId[] {
  const seq = s.head.seq + 1;
  s.fold({
    v: 1, at: s.at, seq, prev: s.head.hash, time: s.now, clamped: false, epoch: 0, input: { type: "checkpoint", ...checkpointOf(s.state) }, uses: [], prepared: [],
    effects: opens.flatMap((o, k) => operationOpening(k, o)), sends: [],
  });
  return opens.map((_, k) => operationId(seq, k));
}

type Basis = Evidence["basis"];
/** Offer one outcome, and seal it when it writes. The answer in short: `write`, a refusal's detail, or the entry that a repeat or a conflict names. */
function answer(s: Scope, operation: OperationId, attempt: number, result: "confirmed" | "refused" | "unknown", basis: Basis = result === "unknown" ? "none" : "own-answer", body: unknown = {}, given: Owners | null = owners) {
  const j = settleOutcome(s.state, ticketDefinition, { type: "outcome", operation, attempt, result, evidence: { basis, body } }, { clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, owners: given ?? undefined });
  if (j.result === "write") s.seal(j.draft);
  return j.result === "repeat" || j.result === "conflict" ? [j.result, j.seq] : j.result === "refused" ? j.detail : j.result;
}
/** Each attempt's outcomes in order, with `selected` where it is not null. */
const shape = (s: Scope, id: OperationId) => s.state.operation(id)!.attempts.map((a) => a.outcomes.map((o) => (o.selected === null ? o.result : `${o.result}, selected ${o.selected}`)));
/** The entries that the pending duties reserve. */
const reserved = (s: Scope) => owed(s.state, ticketDefinition, s.last.input);
/** The last entry with one effect changed, folded into a copy of the state before it. */
function forged(s: Scope, change: (entry: Entry) => Entry): () => void {
  const entry = change(s.last);
  return () => applyEntry(s.replay(s.entries.length - 1), ticketDefinition, entry, entryHash(entry));
}

describe("the ledger of outside effects (scope contract, section 4.3; authority note, section 5.4)", () => {
  test("a late answer after `unknown` adds one outcome and rewrites none; the first confirmed outcome entry selects, once; a copy is a repeat and a contradiction a conflict (witness 18.3)", () => {
    const s = new Scope(ticketDefinition);
    const free = reserved(s);
    const [op] = open(s, create) as [OperationId];
    // Entry 2 opened the operation at its ordinal 0, with attempt 1, and reserved two entries for each of its three attempts.
    expect([op, s.last.effects, reserved(s) - free]).toEqual(["2:0", [{ effect: "operation", k: 0, owner: "hold@1", kind: "create", attempts: 3 }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }], 6]);

    // A listing is no decisive read for a create (rule 3). Attempt 1 is unknown, and its entry opens attempt 2. Attempt 2 is confirmed, and is selected.
    expect(answer(s, op, 1, "confirmed", "read", { listed: "A" })).toBe("a read is not decisive for that kind of operation");
    expect([answer(s, op, 1, "unknown"), s.last.effects.length, answer(s, op, 2, "confirmed", "own-answer", { repository: "B" })]).toEqual(["write", 2, "write"]);
    expect([shape(s, op), s.state.operation(op)!.selected, operationStanding(s.state.operation(op)!)]).toEqual([[["unknown"], ["confirmed, selected true"]], 2, "unknown"]);
    // What stays reserved is the late answer of attempt 1: nothing more is opened after a selection.
    expect(reserved(s) - free).toBe(1);
    s.now = t(-5);
    // The late answer, written clamped while the clock is behind: an outcome judges no time. It is not selected, and its owner opens a deletion.
    expect([answer(s, op, 1, "confirmed", "own-answer", { repository: "A" }), s.last.clamped]).toEqual(["write", true]);
    const late = s.last.seq;
    expect(s.last.effects).toEqual([
      { effect: "attempt", operation: op, attempt: 1, result: "confirmed", selected: false },
      { effect: "operation", k: 0, owner: "hold@1", kind: "delete", attempts: 3 }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
    ]);
    // A second selection is no state: the fold refuses this entry if it records one.
    expect(forged(s, (e) => ({ ...e, effects: [{ effect: "attempt", operation: op, attempt: 1, result: "confirmed", selected: true }, ...e.effects.slice(1)] }))).toThrow(FoldError);
    // The `unknown` entry stays as written, and the selection did not move. The operation is settled.
    expect([shape(s, op), s.state.operation(op)!.selected, operationStanding(s.state.operation(op)!), s.entries[3]!.entry.input]).toMatchObject([
      [["unknown", "confirmed, selected false"], ["confirmed, selected true"]], 2, "settled", { type: "outcome", attempt: 1, result: "unknown", evidence: { basis: "none" } },
    ]);
    // The same answer again, another answer of the same attempt, and an `unknown` for an attempt that has an outcome: each writes nothing.
    expect([
      answer(s, op, 1, "confirmed", "own-answer", { repository: "A" }), answer(s, op, 1, "confirmed", "own-answer", { repository: "C" }), answer(s, op, 1, "refused"), answer(s, op, 2, "unknown"), s.head.seq,
    ]).toEqual([["repeat", late], ["conflict", late], ["conflict", late], ["repeat", 4], late]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });

  test("nothing but the attempt's own answer settles an unknown: not a later attempt that succeeds, a read, a second `unknown`, an outcome of an attempt that no entry opened, or a token's end time (rules 2 to 4)", () => {
    const s = new Scope(ticketDefinition);
    const [push, mint] = open(s, { owner: "platform:destination@1", kind: "push", attempts: 3 }, { owner: "hold@1", kind: "mint", attempts: 1 }) as [OperationId, OperationId];
    // A lost push answer opens the next attempt. A lost mint answer opens none: nothing is minted again for that operation.
    expect([answer(s, push, 1, "unknown"), s.last.effects.length, answer(s, mint, 1, "unknown"), s.last.effects.length]).toEqual(["write", 2, "write", 1]);
    // Attempt 2 is confirmed by a read, which is decisive for a push and is the first outcome of its own attempt.
    expect(answer(s, push, 2, "confirmed", "read", { ref: "c1" })).toBe("write");
    const head = s.head.seq;
    expect([
      answer(s, push, 1, "confirmed", "read", { ref: "c1" }), answer(s, push, 1, "unknown"), answer(s, push, 3, "confirmed"), answer(s, push, 1, "confirmed", "none"), answer(s, push, 1, "unknown", "own-answer"),
      answer(s, mint, 1, "refused", "own-answer", {}, null), s.head.seq,
    ]).toEqual([
      "only that attempt's own answer follows an unknown outcome", ["repeat", 3], "no entry opened that attempt of that operation", "a confirmed outcome has no such basis", ["repeat", 3],
      "unavailable", head,
    ]);
    expect([shape(s, push), operationStanding(s.state.operation(push)!), s.state.outstanding()]).toMatchObject([[["unknown"], ["confirmed"]], "unknown", { opened: 0, unknown: 2, unopened: 0 }]);
    // Rule 4 is a judgment about a token whose end time is known, on the commit's reading. It is the only rule that reads a time, and it settles no attempt.
    const clock = (reading: number, behind = false) => ({ reading: t(reading), behind, asOf: t(reading) });
    expect([tokenPast(t(100), clock(160), 60), tokenPast(t(100), clock(161), 60), tokenPast(t(100), clock(161, true), 60), shape(s, mint)]).toEqual([false, true, false, [["unknown"]]]);
    // The push's own late answer settles its attempt. It is not the last attempt opened, so it opens none.
    expect([answer(s, push, 1, "refused"), s.last.effects.length, operationStanding(s.state.operation(push)!), operationStanding(s.state.operation(mint)!)]).toEqual(["write", 1, "settled", "unknown"]);
  });

  test("an operation opens at most its stated attempts, whatever its retry rule says, and the room of every outcome was reserved at the opening", () => {
    const s = new Scope(ticketDefinition);
    const free = reserved(s);
    const [push] = open(s, { owner: "platform:destination@1", kind: "push", attempts: 2 }) as [OperationId];
    const room = [reserved(s) - free];
    // Used and reserved together never rise with an outcome entry, so one is never refused for want of room.
    const written = () => { const before = s.head.seq + reserved(s); return [before, s.head.seq + reserved(s)] as const; };
    for (const attempt of [1, 2]) {
      const before = written()[0];
      expect(answer(s, push, attempt, "refused")).toBe("write");
      expect(written()[1]).toBeLessThanOrEqual(before);
      room.push(reserved(s) - free);
    }
    // Attempt 1's refusal opened attempt 2. Attempt 2's opened none, though the rule asks for another. Nothing stays reserved.
    expect([s.entries.slice(-2).map((e) => e.entry.effects.length), room, operationStanding(s.state.operation(push)!)]).toEqual([[2, 1], [4, 2, 0], "settled"]);
    expect(forged(s, (e) => ({ ...e, effects: [...e.effects, { effect: "attempt", operation: push, attempt: 3, result: "opened", selected: null }] }))).toThrow(/at most 2/);
    expect(() => operationOpening(0, { ...create, attempts: 0 })).toThrow();
  });
});
