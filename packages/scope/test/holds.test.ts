import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Intent, PlatformDefinition, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { MemoryState, applyEntry, owed, stateDigest, type RuleGiven } from "@generalbusiness/artroom-derive";
import { grantOf } from "@generalbusiness/artroom-derive/testing";
import { gateRules, gateWith } from "../../derive/test/fixtures-marks.ts";
import { SqliteStore } from "../src/index.ts";
import { controls } from "../src/testing.ts";
import { outsideOf, wired } from "./outside.ts";
import { START, at, objectOf, reader, rita, stubOf, una } from "./support.ts";

// Scope contract, revision 23, section 17.2a; witness 18.47, cases 4 to 6 and 14, on real storage (B2). STAND-INS: the platform
// data and its rules are derive's made-up fixture `gate`, under a name and version that no runtime holds, with one change: a ticket
// holds 2 operations of the kind `probe`. The rule `key-id` of `enter` opens one for it, and the rule of an outcome opens the other
// while the ticket holds a count. The outside system is the test's double, which answers as the test wrote. Every count is made up.
// What is real: the commit's rule of admission, the fold on SQLite, the index of operations by holder, the driver that offers an
// outcome, and the checkpoint. The other cases of witnesses 18.47 and 18.49 are witnessed in memory, in derive's
// `forms-holds.test.ts`, with the same judges and the same fold.
test("a reservation that an item holds, on real storage: the entry that opens the holder is admitted only with the whole amount; a draw moves a count to the operation that it is for; an outcome that draws is written with no free room; the store reads the operations of one holder by the holder; and a checkpoint's digest covers the counts", async () => {
  const MADE = "platform:task@1" as PlatformDefinition;
  const TICKET = 1;
  const definition = gateWith((d) => { d.name = "platform:task"; d.acts.enter.grant = "gate.enter"; d.items.ticket.holds = { operations: { probe: 2 } }; d.outcomes.probe = { ...d.outcomes.probe, attempts: 1, most: { effects: 0, operations: ["probe"] } }; });
  const opens = [{ effect: "operation", k: 0, owner: MADE, kind: "probe", attempts: 1, for: TICKET }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }];
  // The rule of an outcome reads what the ticket still holds, to stay inside it (section 6.1, "A rule may read what an item still holds").
  const again = ({ state }: RuleGiven) => ({ effects: [], sends: [], opens: (state.holder(TICKET)?.operations?.["probe"] ?? 0) > 0 ? [{ owner: MADE, kind: "probe", attempts: 1, for: TICKET }] : [] });
  const rules = gateRules({ "key-id": { place: "effect", most: 2, run: (() => opens) as never }, probe: { place: "outcome", rules: { selects: false, read: false, retries: () => false, derives: again } } }).rules;
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { opener: rita.member }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(founding), ordinal: 0 };
  const name = scopeIdOf(seed);
  const c = controls(name, START);
  wired.set(name, () => ({ definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: (named) => (named === MADE ? { data: definition.declared as never, rules } : null) } }));
  try {
    const stub = stubOf(name);
    const founded = await stub.found(signIntent(founding, rita.secret), MADE);
    if (founded.answer !== "accepted") throw new Error(`the scope was not founded: ${JSON.stringify(founded)}`);
    const scope = founded.receipt.fact.at;
    const said = (answer: Answer) => [answer.answer, "reason" in answer ? answer.reason : null];
    const act = (who: typeof rita, kind: string, over: Partial<Intent>): Promise<Answer> => {
      const intent: Intent = { v: 1, to: scope, actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: crypto.randomUUID(), notAfter: at(60), ...over };
      return stub.submit(signIntent(intent, who.secret), [grantOf(who, scope, ["gate.issue", "gate.enter"])]);
    };
    const issue = () => act(rita, "issue", { fields: { hash: textDigest("one") } });
    /** The budget of entries. A scope reads its bounds once, when its object is constructed, so the object starts again. */
    const budget = async (scopeEntries: number) => { c.bounds = { ...PROPOSED_BOUNDS, scopeEntries }; await evictDurableObject(objectOf(name)); };
    /** What the store holds, read on the object's own SQLite. */
    const stored = () => runInDurableObject(objectOf(name), (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      return { holder: store.holder(TICKET), holders: store.holders(), for: store.operationsFor(TICKET).map((operation) => [operation.id, operation.for]), none: store.operationsFor(0), outcomes: store.outstanding().outcomes, snapshot: store.all() };
    });

    // The founding is 1 entry, and reserves the closing checkpoint. The ticket's entry is 1 more, and its 2 probes are 4 entries.
    // With a budget of 6 entries the taking entry does not fit, and nothing is written. With 7 it is admitted, with the whole.
    await budget(6);
    expect([said(await issue()), (await stored()).holders]).toEqual([["refused", "scope-full"], []]);
    await budget(7);
    expect([said(await issue()), (await stored()).holders]).toEqual([["accepted", null], [{ item: TICKET, held: { operations: { probe: 2 } } }]]);

    // `enter` is new work for its own entry, and it opens a probe for the ticket. The draw moves 2 entries from the ticket to the
    // operation: what is reserved does not change, so the act needs 1 free entry and no more.
    const enter = () => act(una, "enter", { on: 0, expected: { on: 1 }, fields: { secret: "one" } });
    expect(said(await enter())).toEqual(["refused", "scope-full"]);
    await budget(8);
    const out = outsideOf(name);
    const confirmed = { result: "confirmed", evidence: { basis: "own-answer", body: {} } } as const;
    // The outside port sends nothing yet, so the attempt of the probe stays recorded and not sent.
    out.accepting = false;
    expect(said(await enter())).toEqual(["accepted", null]);
    const drawn = await stored();
    expect([drawn.holder, drawn.for, drawn.none, drawn.outcomes]).toEqual([{ operations: { probe: 1 } }, [["2:0", TICKET]], [], [{ owner: MADE, kind: "probe", entries: 2, unsent: 1 }]]);

    // Case 6. The scope has no free room now: 3 entries are written, and 5 are reserved. New work is refused. The outcome of the
    // first probe is offered by the driver, and its rule opens the second probe for the ticket: it is written, and so is the
    // outcome of the second. Neither was asked whether it fits.
    expect(said(await issue())).toEqual(["refused", "scope-full"]);
    out.answer("2:0", 1, confirmed);
    out.answer("3:0", 1, confirmed);
    // A runtime that can send finds the recorded attempt after a restart, and each later one as it is opened.
    out.accepting = true;
    await evictDurableObject(objectOf(name));
    const driver = objectOf(name) as unknown as { effect(): Promise<number> };
    while ((await driver.effect()) > 0 || (await runDurableObjectAlarm(objectOf(name)))) { /* each outcome that is due */ }
    const after = await stored();
    expect([out.attempts, after.holder, after.holders, after.for, after.outcomes]).toEqual([["2:0#1", "3:0#1"], null, [], [["2:0", TICKET], ["3:0", TICKET]], []]);

    // The same history folded in memory holds the same counts, and reserves the same: the two stores cannot drift.
    const memory = new MemoryState();
    const history = await stub.history(reader, "0");
    if (!history.ok) throw new Error(`no history: ${history.reason}`);
    for (const sealed of history.value) applyEntry(memory, definition, sealed.entry, sealed.hash);
    expect([memory.all().holders, stateDigest(memory.all()), memory.all().operations.map((operation) => operation.for), history.value.length, owed(memory, definition, history.value.at(-1)!.entry.input)]).toEqual([after.snapshot.holders, stateDigest(after.snapshot), [TICKET, TICKET], 5, 1]);
    // Case 14: a checkpoint is written on the state that the store folds, so its digest covers each count and each holder.
    expect(await stub.checkpoint()).toMatchObject({ answer: "written" });
  } finally {
    wired.delete(name);
  }
});
