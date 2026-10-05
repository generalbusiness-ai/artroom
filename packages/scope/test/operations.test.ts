import { describe, expect, test } from "vitest";
import { abortAllDurableObjects } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { OperationId, Read } from "@generalbusiness/artroom-contract";
import { checkpointOf, operationId, operationOpening, timeMs, type Opening } from "@generalbusiness/artroom-derive";
import { SqliteStore, Turns, Wakes, production, type EffectAnswer, type OperationStatus, type OutcomeRecorded } from "../src/index.ts";
import { variant } from "@generalbusiness/artroom-derive/testing";
import { controls } from "../src/testing.ts";
import { FENCE, MINT, mint, outsideOf, owners, pushOf, type OutsideDouble } from "./outside.ts";
import { HOLD, Lane, START, at, definition, found, founding, reader, rita, stubOf } from "./support.ts";

/** The delay before the second attempt of an operation. */
const RETRY = PROPOSED_BOUNDS.dispatchRetrySeconds;
type Surface = { effect(): Promise<number>; operation(reader: unknown, id: OperationId): Promise<Read<OperationStatus>>; operations(reader: unknown, cursor?: string, open?: boolean): Promise<Read<readonly OperationStatus[]>> };
const surface = (s: Lane) => s.object as unknown as Surface;

/**
 * A stand-in for the entry that opens an operation: no form of this step
 * opens one. The entry is made by hand, as a checkpoint input with the
 * ledger's own opening effects at the ordinals 0, 1 and so on. It is written
 * through a turn of the real commit protocol, on the object's own storage,
 * with the real alarm. The IDs of the operations, or `scope-full` when the
 * entry and what it reserves do not fit.
 */
function open(s: Lane, ...opens: Opening[]): Promise<OperationId[] | "scope-full"> {
  return s.inside(async (state) => {
    const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
    const wakes = new Wakes(store, { set: (time) => (time === null ? state.storage.deleteAlarm() : state.storage.setAlarm(timeMs(time)!)) }, false);
    const turns = new Turns(store, { clock: s.c.clock, rules: production().rules, alarm: wakes.deadline, capabilities: null }, s.c.bounds, () => definition, () => owners);
    const end = await turns.run<OperationId[] | "scope-full">({
      asks: () => [],
      judge: (view) => ({
        verdict: "write", retain: [],
        draft: { input: { type: "checkpoint", ...checkpointOf(view) }, uses: [], prepared: [], effects: opens.flatMap((o, k) => operationOpening(k, o)), sends: [], judgesTime: false },
        sealed: ({ entry }) => opens.map((_, k) => operationId(entry.seq, k)), unfit: () => "scope-full", full: () => "scope-full",
      }),
    });
    if (end.end !== "answer") throw new Error(`the opening entry was not judged: ${end.end}`);
    return end.answer;
  });
}
/** What a reader sees of one operation. */
async function seen(s: Lane, id: OperationId): Promise<OperationStatus> {
  const read = await surface(s).operation(reader, id);
  if (!read.ok) throw new Error(`no operation ${id}: ${read.reason}`);
  return read.value;
}
/** An answer that arrives by itself, after its request: given to the driver of the object in memory, inside the object. */
const late = (s: Lane, out: OutsideDouble, id: OperationId, attempt: number, answer: EffectAnswer): Promise<OutcomeRecorded> => s.inside(() => out.deliver!(id, attempt, answer));
const own = (commit: string): EffectAnswer => ({ result: "confirmed", evidence: { basis: "own-answer", body: { commit } } });
/** Each attempt's outcomes, as `result at seq`. */
const outcomes = (status: OperationStatus) => status.operation.attempts.map((a) => a.outcomes.map((o) => `${o.result} at ${o.seq}`));

describe("outside operations at a real scope (scope contract, section 4.3; authority note, section 5.4). The outside system and the opening entry are stand-ins", () => {
  test("T19: an attempt is recorded before it is sent, and sent at most once; a stop between the send and the outcome leaves `unknown`, which a restart, elapsed time, a later attempt that succeeds, a new ref and a listing do not settle, and its own late answer does", async () => {
    const s = await found();
    const out = outsideOf(s.name);
    const [op] = await open(s, pushOf(3)) as [OperationId];
    const opening = (await s.sealed(1))[0]!;
    // Recorded and not sent: entry 1 is sealed, with the attempt's row and a wake-up at its time. Nothing has reached the outside system.
    expect([op, out.sent.length, await s.alarmAt(), await seen(s, op)]).toMatchObject(["1:0", 0, timeMs(START), { state: "pending", sends: [{ attempt: 1, next: timeMs(START), sent: null }] }]);
    // The record is in storage. After a restart the alarm alone sends the one request, which names the sealed entry.
    await s.restart();
    const pass = s.alarm();
    await out.reached(1);
    expect(out.sent[0]).toMatchObject({ scope: s.at, operation: op, attempt: 1, kind: "push", origin: { hash: opening.hash } });

    // The process stops between the send and the outcome. No answer was recorded, and the attempt is marked as perhaps sent.
    await abortAllDurableObjects();
    await pass.catch(() => null);
    expect([(await s.head()).seq, await seen(s, op)]).toMatchObject([1, { state: "pending", sends: [{ attempt: 1, sent: START }] }]);
    // It is never sent again. When the time to wait for an answer has passed, its outcome is `unknown`, with no evidence. That entry opens attempt 2.
    s.c.clock.now = at(PROPOSED_BOUNDS.dispatchSeconds);
    expect(await s.alarm()).toBe(true);
    const unknown = (await s.sealed(2))[0]!;
    expect([out.attempts, unknown.entry.input, unknown.entry.effects]).toEqual([
      [`${op}#1`], { type: "outcome", operation: op, attempt: 1, owner: "platform:destination@1", kind: "push", result: "unknown", evidence: { basis: "none", body: null } },
      [{ effect: "attempt", operation: op, attempt: 1, result: "unknown", selected: null }, { effect: "attempt", operation: op, attempt: 2, result: "opened", selected: null }],
    ]);

    // A later attempt succeeds, by a read of the ref. A restart follows, and a day passes. The ledger is idle: it asks for no wake-up.
    out.answer(op, 2, { result: "confirmed", evidence: { basis: "read", body: { ref: "refs/heads/main", commit: "c2" } } });
    s.c.clock.now = at(PROPOSED_BOUNDS.dispatchSeconds + RETRY);
    expect([await s.alarm(), out.attempts]).toEqual([true, [`${op}#1`, `${op}#2`]]);
    await s.restart();
    s.c.clock.now = at(86_400);
    expect([await s.alarm(), await surface(s).effect()]).toEqual([false, 0]);
    // A listing that shows the commit, offered as attempt 1's answer, is not that attempt's own answer.
    expect(await late(s, out, op, 1, { result: "confirmed", evidence: { basis: "read", body: { listed: ["c2"] } } })).toEqual({ recorded: "refused", detail: "only that attempt's own answer follows an unknown outcome" });
    // None of these settled attempt 1: the operation is not settled, and it is in the list of the duties this scope holds.
    const held = await surface(s).operations(reader, undefined, true);
    expect([(await s.head()).seq, out.sent.length, held.ok && held.value.map((o) => [o.operation.id, o.state, outcomes(o)])]).toEqual([3, 2, [[op, "unknown", [["unknown at 2"], ["confirmed at 3"]]]]]);

    // That request's own late answer settles it: one more outcome. The `unknown` entry stays as it was written.
    expect(await late(s, out, op, 1, own("c1"))).toMatchObject({ recorded: "written", fact: { seq: 4 } });
    const settled = await seen(s, op);
    expect([settled.state, outcomes(settled), (await s.sealed(2))[0]]).toEqual(["settled", [["unknown at 2", "confirmed at 4"], ["confirmed at 3"]], unknown]);
    // The same answer again, another answer of that attempt, and an answer to an attempt that was never sent: each writes nothing.
    expect([await late(s, out, op, 1, own("c1")), await late(s, out, op, 1, own("c9")), await late(s, out, op, 3, own("c3")), (await s.head()).seq]).toEqual([
      { recorded: "repeat", seq: 4 }, { recorded: "conflict", seq: 4 }, { recorded: "refused", detail: "no request of that attempt was sent" }, 4,
    ]);
  });

  test("T20: an idle ledger writes nothing; a port that sends nothing leaves the attempt recorded and visible; an outcome is written at a scope with no free room; an operation opens at most its stated attempts and then none by itself; a retry is a new operation", async () => {
    // A budget in which the entry that opens two attempts, and what it reserves, exactly fit: 2 entries written, 4 for the attempts and 1 for the closing checkpoint.
    const s = await found({ scopeEntries: 7 });
    const out = outsideOf(s.name);
    expect([await s.alarmAt(), await surface(s).effect(), (await s.head()).seq]).toEqual([null, 0, 0]);
    // Three attempts would reserve two entries more, so that opening is refused, and nothing of it is recorded.
    expect([await open(s, pushOf(3)), (await s.head()).seq, await s.alarmAt()]).toEqual(["scope-full", 0, null]);

    // The port sends nothing, as the production default does. The attempt stays recorded and not sent, and no wake-up is kept for it.
    out.accepting = false;
    const [op] = await open(s, pushOf(2)) as [OperationId];
    expect(await s.alarm()).toBe(true);
    expect([out.sent.length, await s.alarmAt(), await seen(s, op)]).toMatchObject([0, null, { state: "pending", sends: [{ attempt: 1, next: null, sent: null }] }]);
    // The scope has no free room: new work is refused.
    expect(await s.act(rita, "remark", { on: 0, fields: { text: "no room" } })).toMatchObject({ answer: "refused", reason: "scope-full" });

    // A runtime that can send finds the recorded attempt after a restart. Its refusal is written, with no free room, and opens attempt 2 after a delay.
    out.accepting = true;
    out.answer(op, 1, { result: "refused", evidence: { basis: "own-answer", body: { status: 409 } } });
    await s.restart();
    expect([await surface(s).effect(), out.attempts, (await s.head()).seq, await s.alarmAt()]).toEqual([1, [`${op}#1`], 2, timeMs(START)! + RETRY * 1000]);
    // Attempt 2 gets no answer. The stated attempts are used: no attempt is opened, no wake-up is asked for, and the duty stays visible.
    out.answer(op, 2, null);
    s.c.clock.now = at(RETRY);
    expect(await s.alarm()).toBe(true);
    expect([out.attempts, (await s.head()).seq, await s.alarmAt(), outcomes(await seen(s, op))]).toEqual([[`${op}#1`, `${op}#2`], 3, null, [["refused at 2"], ["unknown at 3"]]]);
    s.c.clock.now = at(86_400);
    s.c.bounds = { ...s.c.bounds, scopeEntries: 20 };
    await s.restart();
    expect([await s.alarm(), await surface(s).effect(), out.sent.length, (await s.head()).seq]).toEqual([false, 0, 2, 3]);

    // A retry is a new operation, opened by an entry that is new work. It has its own identity, and its success settles nothing earlier.
    const [retry] = await open(s, pushOf(1)) as [OperationId];
    out.answer(retry, 1, { result: "confirmed", evidence: { basis: "read", body: { commit: "c1" } } });
    expect(await s.alarm()).toBe(true);
    expect([retry, out.attempts.at(-1), (await seen(s, retry)).state, (await seen(s, op)).state, outcomes(await seen(s, op))]).toEqual(["4:0", "4:0#1", "settled", "unknown", [["refused at 2"], ["unknown at 3"]]]);
  });

  test("a late answer that arrives while the scope's turn is unavailable is kept in hand, and the driver writes it at the next wake-up, after the attempt's row is closed; the request is not sent again", async () => {
    // A turn writes one timed entry. Two holds end at one time, so a turn at that time leaves one due and is `busy`.
    const s = await found({ timedAttemptsPerTurn: 1 });
    const out = outsideOf(s.name);
    await s.holds(2);
    const [op] = await open(s, pushOf(1)) as [OperationId];
    // The request gets no answer. Its outcome is `unknown`, in entry 8, and that entry closes the driver's row.
    out.answer(op, 1, null);
    expect([await s.alarm(), outcomes(await seen(s, op))]).toEqual([true, [["unknown at 8"]]]);

    // The request's own answer arrives when both holds are due. The turn writes one end and is spent: the answer cannot be written.
    s.c.clock.now = at(HOLD);
    const retry = timeMs(at(HOLD + PROPOSED_BOUNDS.drainRetrySeconds));
    expect([await late(s, out, op, 1, own("c1")), (await s.head()).seq, outcomes(await seen(s, op)), await s.alarmAt()]).toEqual([{ recorded: "unavailable" }, 9, [["unknown at 8"]], retry]);
    // The wake-up's turn writes the other end. The driver then offers the answer it kept: the late answer, of that operation and attempt, with its evidence.
    expect([await s.alarm(), (await s.sealed(11))[0]?.entry.input, (await seen(s, op)).state, out.attempts, await s.alarmAt()]).toEqual([
      true, { type: "outcome", operation: op, attempt: 1, owner: "platform:destination@1", kind: "push", result: "confirmed", evidence: { basis: "own-answer", body: { commit: "c1" } } }, "settled", [`${op}#1`], null,
    ]);
    // Nothing is in hand any more: a pass offers nothing, and the same answer again is a copy.
    expect([await surface(s).effect(), await late(s, out, op, 1, own("c1")), (await s.head()).seq]).toEqual([0, { recorded: "repeat", seq: 11 }, 11]);
  });

  test("an answer in hand that stays unavailable for a reason of its own owner holds back no other: with a batch of 1 the answer behind it is written at the second pass, and the first stays in hand, of its attempt and with its evidence, and its operation stays a duty", async () => {
    // Three holds end at one time, and a turn writes one timed entry. The owner of a mint declares no cleanup, and a confirmed mint would open one.
    const s = await found({ timedAttemptsPerTurn: 1, deliveryBatch: 1 });
    const out = outsideOf(s.name);
    mint.closure = 0;
    await s.holds(3);
    const [older, later] = await open(s, MINT, pushOf(1)) as [OperationId, OperationId];
    // Neither request gets an answer. Each outcome is `unknown`, and those entries close the driver's rows.
    for (const id of [older, later]) out.answer(id, 1, null);
    expect([await s.alarm(), await s.alarm(), outcomes(await seen(s, older)), outcomes(await seen(s, later))]).toEqual([true, true, [["unknown at 11"]], [["unknown at 12"]]]);

    // Both late answers arrive while the turn is spent on the ends of the holds: both are kept in hand, the mint's first.
    s.c.clock.now = at(HOLD);
    const minted: EffectAnswer = { result: "confirmed", evidence: { basis: "own-answer", body: { token: "t1" } } };
    expect([await late(s, out, older, 1, minted), await late(s, out, later, 1, own("c1")), (await s.head()).seq]).toEqual([{ recorded: "unavailable" }, { recorded: "unavailable" }, 14]);
    // The first pass offers the mint's answer. The turn is free, and the answer is still not written: its owner's fault. It goes behind the other.
    expect([await s.alarm(), (await s.head()).seq]).toEqual([true, 15]);
    // The second pass, after the delay, writes the push's answer. The mint's is in hand: the driver asks for the next wake-up, and the operation is a duty with what it reserved.
    s.c.clock.now = at(HOLD + PROPOSED_BOUNDS.drainRetrySeconds);
    expect([await s.alarm(), (await s.sealed(16))[0]?.entry.input, (await seen(s, later)).state, await seen(s, older), await s.alarmAt()]).toMatchObject([
      true, { type: "outcome", operation: later, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: { commit: "c1" } } }, "settled",
      { state: "unknown", operation: { attempts: [{ outcomes: [{ result: "unknown", seq: 11 }] }] } }, timeMs(at(HOLD + 2 * PROPOSED_BOUNDS.drainRetrySeconds)),
    ]);
    // Once the owner declares the cleanup, the answer that was kept is written as it arrived, and opens the cleanup. No request was sent again.
    mint.closure = 2;
    s.c.clock.now = at(HOLD + 2 * PROPOSED_BOUNDS.drainRetrySeconds);
    expect([await s.alarm(), (await s.sealed(17))[0]?.entry, out.attempts.slice(0, 2)]).toMatchObject([
      true, { input: { type: "outcome", operation: older, attempt: 1, result: "confirmed", evidence: minted.evidence }, effects: [{ effect: "attempt", operation: older, attempt: 1, result: "confirmed" }, { effect: "operation", kind: "push" }, { effect: "attempt", attempt: 1, result: "opened" }] },
      [`${older}#1`, `${later}#1`],
    ]);
  });

  test("after a restart the driver walks every attempt that nothing could send, one page at a pass: an attempt that still cannot be sent holds back none after it, and what is due does not use the page up", async () => {
    const s = await found({ deliveryBatch: 1 });
    const out = outsideOf(s.name);
    // Three attempts that the port does not send. A pass looks at one, and leaves it recorded with no wake-up.
    out.accepting = false;
    const [fence, first, second] = await open(s, FENCE, pushOf(1), pushOf(1)) as [OperationId, OperationId, OperationId];
    expect([await s.alarm(), await s.alarm(), await s.alarm(), out.sent.length, await s.alarmAt()]).toEqual([true, true, true, 0, null]);

    // A runtime that sends a push, and has no rules for the fence. After its restart a new attempt is due.
    out.accepting = true;
    await s.restart();
    const [due] = await open(s, pushOf(1)) as [OperationId];
    for (const id of [first, second, due]) out.answer(id, 1, own("c1"));
    // The first pass sends what is due, and looks at the first page: the fence, which stays as it is. Pages remain, so it asks to be woken at once.
    expect([await surface(s).effect(), out.attempts, await s.alarmAt()]).toEqual([1, [`${due}#1`], timeMs(START)]);
    // Each wake-up takes the next page. The walk ends at a page that is not full, and asks for nothing more.
    expect([await s.alarm(), await s.alarm(), await s.alarmAt(), await s.alarm(), await s.alarmAt()]).toEqual([true, true, timeMs(START), true, null]);
    expect([out.attempts, await seen(s, fence), (await seen(s, second)).state, await s.alarm(), await surface(s).effect()]).toMatchObject([
      [`${due}#1`, `${first}#1`, `${second}#1`], { state: "pending", sends: [{ attempt: 1, next: null, sent: null }] }, "settled", false, 0,
    ]);
  });

  test("a scope whose pinned definition the runtime cannot run sends nothing outside the service: the attempt stays recorded, with no wake-up, and is sent once the runtime can run the definition. The capability is the scripted stand-in", async () => {
    // The lane of the other tests, with one capability guard. The scripted test capability, a stand-in, is the code for it.
    const staged = variant(definition.declared, (def) => { def.acts.report.guards.push({ capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } }); def.acts.report.fields.commit = { type: "commit", required: true }; });
    const { signed, name } = founding(at(60), staged);
    const c = controls(name, START);
    c.capability = {};
    const founded = await stubOf(name).found(signed, staged.declared);
    if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
    const s = new Lane(name, c, founded.receipt.fact.at, founded.receipt, signed);
    const out = outsideOf(name);
    const [op] = await open(s, pushOf(1)) as [OperationId];

    // The outside system would answer. The runtime loses the code: section 6.1, the scope admits nothing. So no outcome could be
    // written, and no request leaves.
    out.answer(op, 1, { result: "confirmed", evidence: { basis: "read", body: { commit: "c1" } } });
    c.capability = null;
    await s.restart();
    expect([await s.alarm(), out.sent.length, await s.alarmAt()]).toEqual([true, 0, null]);
    // With the code again, the first pass after a restart finds the recorded attempt and sends it.
    c.capability = {};
    await s.restart();
    expect([await surface(s).effect(), out.attempts, (await seen(s, op)).state]).toEqual([1, [`${op}#1`], "settled"]);
  });
});
