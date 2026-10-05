import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Receipt } from "@generalbusiness/artroom-contract";
import { MemoryState, applyEntry, stateDigest, timeMs } from "@generalbusiness/artroom-derive";
import { HOLD, at, definition, found, rita, una, vic } from "./support.ts";

describe("the head check (section 5.2, steps 4 to 6)", () => {
  test("a second act commits while the first is in preparation; the first starts again from step 3 and is prepared and judged on the new head", async () => {
    const s = await found();
    const commitment = await s.commitment();                  // entries 1 and 2: assigned to una, revision 2
    const assign = (to: typeof una, revision: number) => s.intent(rita, "assign", { on: commitment, expected: { on: revision }, fields: { performer: to.member } });
    /** Submit `first`, wait until it is in step 5, at the gate before its rule is evaluated, then commit `second` and let the first go on. */
    const race = async (first: ReturnType<typeof assign>, second: () => Promise<Receipt>) => {
      s.c.gate.hold();
      const waiting = s.submit(first).then((answer) => answer);
      await s.c.gate.held();
      const committed = await second();
      s.c.gate.release();
      return { answer: await waiting, committed };
    };

    // The second act is una's hold under the commitment. It leaves the commitment's revision at 2 and adds to its attribution history,
    // which the first act's rule reads. The first act's commit finds another head and writes nothing. From step 3 its rule is prepared
    // over the new head, and it is accepted as the next entry. Without the restart its prepared result would not fit, and it could not be judged.
    const held = await race(assign(vic, 2), () => s.did(una, "take-hold", { fields: { commitment }, expected: { commitment: 2 } }));
    expect([held.committed.fact.seq, held.answer]).toMatchObject([3, { answer: "accepted", receipt: { fact: { seq: 4 } } }]);
    expect((await s.entries(4))[0]!.prev).toBe(held.committed.fact.hash);

    // The second act moves the revision the first expects. The first is refused, and the refusal is a statement about the new head.
    const moved = await race(assign(una, 3), () => s.did(rita, "assign", { on: commitment, expected: { on: 3 }, fields: { performer: vic.member } }));
    const { seq, hash } = moved.committed.fact;
    expect([seq, moved.answer, await s.head()]).toEqual([5, { answer: "refused", reason: "revision-moved", judgedAt: { seq, hash } }, { seq, hash }]);
  });
});

describe("a due expiry is written before any other input (section 5.2, steps 3 and 6.3)", () => {
  test("an act whose commit reading is at two holds' deadline stops; the drain writes both ends, the lower item first, and then the act", async () => {
    const s = await found();
    const [low, high] = await s.holds(2);                     // entries 1 to 6; both holds end at the same time
    expect(await s.alarmAt()).toBe(timeMs(at(HOLD)));         // after a commit, the alarm is at the earliest deadline
    // Step 3 reads one second before the deadline and finds nothing due. Every later reading is the deadline.
    s.c.clock.now = at(HOLD);
    const remark = s.remark();
    s.c.clock.script.push(at(HOLD - 1));
    expect(await s.submit(remark)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 9 } } });
    const timed = (item: number) => ({ type: "timed", item, rule: "hold-end", due: at(HOLD) });
    expect((await s.entries(7)).map((e) => [e.time, e.input.type === "act" ? "act" : e.input])).toEqual([[at(HOLD), timed(low!)], [at(HOLD), timed(high!)], [at(HOLD), "act"]]);
    expect(await s.alarmAt()).toBeNull();
  });
});

describe("the budget of timed attempts, here 2 for a turn (section 5.2, step 7)", () => {
  const budget = { timedAttemptsPerTurn: 2 };

  test.each([
    { due: 1, answer: "accepted", written: 1, left: 0 },
    { due: 2, answer: "accepted", written: 2, left: 0 },
    { due: 3, answer: "busy", written: 2, left: 1 },
  ])("$due due: $written timed entries are written, $left stays due, and the waiting act is $answer", async ({ due, answer, written, left }) => {
    const s = await found(budget);
    await s.holds(due);
    const head = (await s.head()).seq;
    s.c.clock.now = at(HOLD);
    const remark = s.remark();
    const answered = await s.submit(remark);
    expect(answered.answer === "unavailable" ? answered.reason : answered.answer).toBe(answer);
    expect([(await s.head()).seq, await s.count("hold", "ended"), await s.count("hold", "held")]).toEqual([head + written + (answer === "accepted" ? 1 : 0), written, left]);
    if (answer !== "busy") return;
    // The timed entries are kept and the alarm is set again, a retry delay ahead. The act's key was not consumed: sent again, it follows the last expiry.
    expect(await s.alarmAt()).toBe(timeMs(at(HOLD + PROPOSED_BOUNDS.drainRetrySeconds)));
    expect(await s.submit(remark)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: head + due + 1 } } });
  });

  test("a selection dropped each time, the clock reading the deadline at selection and one second less at commit, ends the turn busy with nothing written", async () => {
    const s = await found(budget);
    await s.holds(1);
    const head = await s.head();
    s.c.clock.now = at(HOLD);
    const remark = s.remark();
    // Two selections and their two commits. The entry before is earlier than both readings, so the clock is not behind.
    s.c.clock.script.push(at(HOLD), at(HOLD - 1), at(HOLD), at(HOLD - 1));
    expect([await s.submit(remark), s.c.clock.script, await s.head()]).toEqual([{ answer: "unavailable", reason: "busy" }, [], head]);
    // The hold is still due and the key is not consumed. A turn whose readings are all the deadline writes the expiry, then the act.
    expect(await s.submit(remark)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: head.seq + 2 } } });
  });

  test("the restarts of one turn are bounded, here at 1: an act whose every commit finds the hold newly due ends busy with nothing written", async () => {
    const s = await found({ turnRestarts: 1 });
    await s.holds(1);
    const head = await s.head();
    s.c.clock.now = at(HOLD - 1);
    const remark = s.remark();
    // Twice: step 3 reads before the deadline and finds nothing due, and the commit reads the deadline and stops.
    s.c.clock.script.push(at(HOLD - 1), at(HOLD), at(HOLD - 1), at(HOLD));
    expect([await s.submit(remark), s.c.clock.script, await s.head()]).toEqual([{ answer: "unavailable", reason: "busy" }, [], head]);
    s.c.clock.now = at(HOLD);
    expect(await s.submit(remark)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: head.seq + 2 } } });
  });

  test("preparation has a time limit, here 10 milliseconds: an act whose rule is not evaluated in time is answered unavailable and writes nothing", async () => {
    const s = await found({ preparationSeconds: 0.01 });
    const commitment = (await s.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } })).fact.seq;
    const head = await s.head();
    s.c.gate.hold();
    expect([await s.act(rita, "assign", { on: commitment, expected: { on: 1 }, fields: { performer: una.member } }), await s.head()]).toEqual([{ answer: "unavailable", reason: "unavailable" }, head]);
    s.c.gate.release();
  });

  test("an alarm's turn has the same budget: it writes 2 of 3, leaves the third due and sets the alarm again; the next alarm writes it", async () => {
    const s = await found(budget);
    await s.holds(3);
    const head = (await s.head()).seq;
    s.c.clock.now = at(HOLD);
    expect([await s.alarm(), (await s.head()).seq, await s.count("hold", "held"), await s.alarmAt()]).toEqual([true, head + 2, 1, timeMs(at(HOLD + PROPOSED_BOUNDS.drainRetrySeconds))]);
    expect([await s.alarm(), (await s.head()).seq, await s.count("hold", "held"), await s.alarmAt()]).toEqual([true, head + 3, 0, null]);
  });
});

describe("the clock behind the history (section 5.3)", () => {
  test("with a transition due, nothing is written and every input is answered clock-behind", async () => {
    const s = await found({ timedAttemptsPerTurn: 1 });
    await s.holds(2);
    // An alarm's turn at the deadline writes the first end and spends its budget. The second hold is due as of that entry's time.
    s.c.clock.now = at(HOLD);
    await s.alarm();
    const head = await s.head();
    expect([head.seq, await s.count("hold", "held")]).toEqual([7, 1]);

    s.c.clock.now = at(HOLD - 10);
    const behind = { answer: "unavailable", reason: "clock-behind" };
    expect([await s.submit(s.remark()), await s.stub.checkpoint(), await s.alarm(), await s.head()]).toEqual([behind, behind, true, head]);
  });

  test("with nothing due, an act is answered clock-behind and a checkpoint, which judges no time, is written with the previous entry's time, clamped", async () => {
    const s = await found();
    s.c.clock.now = at(100);
    await s.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
    s.c.clock.now = at(70);
    expect(await s.submit(s.remark())).toEqual({ answer: "unavailable", reason: "clock-behind" });
    expect(await s.stub.checkpoint()).toMatchObject({ answer: "written", fact: { seq: 2 } });
    const sealed = await s.sealed();
    const checkpoint = sealed[2]!.entry;
    expect(checkpoint).toMatchObject({ seq: 2, time: at(100), clamped: true, input: { type: "checkpoint", through: 1 } });
    // The digest it carries is the one a verifier computes: entries 0 and 1 folded in memory by the same fold give the state the store holds.
    const memory = new MemoryState();
    for (const { entry, hash } of sealed.slice(0, 2)) applyEntry(memory, definition, entry, hash);
    expect(checkpoint.input).toMatchObject({ state: stateDigest(memory.all()) });
  });
});

describe("the scope's budget (section 9.2), here 12 entries", () => {
  test("an act is refused scope-full when the duties it would admit have no room to settle; no checkpoint takes a duty's room; every admitted hold's end and one closing checkpoint are then written", async () => {
    const s = await found({ scopeEntries: 12 });
    const holds = await s.holds(2);                           // entries 1 to 6: two holds, each owed one entry for its end
    const commitment = await s.commitment();                  // entries 7 and 8: nine entries, and three owed with the checkpoint
    const head = await s.head();
    // A third hold would be entry 9 and would owe a fourth entry: ten and four do not fit in twelve. Nothing is written.
    expect(await s.act(una, "take-hold", { fields: { commitment }, expected: { commitment: 2 } })).toEqual({ answer: "refused", reason: "scope-full", judgedAt: head });
    // A checkpoint now would be entry 9, with both ends still owed and the kept entry: no room is free, and it is not the last entry.
    // Written here, it would leave the scope no closing checkpoint after the two ends.
    expect([await s.stub.checkpoint(), await s.head()]).toEqual([{ answer: "unavailable", reason: "unavailable" }, head]);
    // Both admitted ends are written. The closing checkpoint is the last entry and uses the entry kept for it; there is no second.
    s.c.clock.now = at(HOLD);
    expect([await s.alarm(), (await s.entries(9)).map((e) => e.input.type), await s.count("hold", "ended")]).toEqual([true, ["timed", "timed"], holds.length]);
    expect(await s.stub.checkpoint()).toMatchObject({ answer: "written", fact: { seq: 11 } });
    expect(await s.stub.checkpoint()).toEqual({ answer: "unavailable", reason: "unavailable" });
    expect(await s.submit(s.remark())).toMatchObject({ answer: "refused", reason: "scope-full", judgedAt: { seq: 11 } });
  });

  test("with room free, a checkpoint is written like any other entry and the kept entry stays: a second checkpoint closes the scope", async () => {
    const s = await found({ scopeEntries: 3 });
    expect([await s.stub.checkpoint(), await s.stub.checkpoint(), await s.stub.checkpoint()]).toMatchObject([{ answer: "written", fact: { seq: 1 } }, { answer: "written", fact: { seq: 2 } }, { answer: "unavailable" }]);
  });
});
