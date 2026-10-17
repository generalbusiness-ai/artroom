import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type Seed } from "@generalbusiness/dap-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { clockOf, judgeDelivery, PROFILES, validateDefinition, type Delivered } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as C, platform } from "@generalbusiness/dap-platform";
import type { Resent } from "@generalbusiness/artroom-scope";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { SqliteStore } from "../../../../packages/scope/src/sqlite.ts";
import { ownOf } from "../../../../packages/scope/src/core.ts";
import { wired } from "../../../../packages/scope/test/outside.ts";
import { net } from "./support/graph.ts";
import { room, rita, Platform, settle, soon } from "./support/room.ts";

// Real Native creation, diagnosis, authority, outbox and operator resend.
// Test transport discards one real acknowledgment, then refuses routing;
// the child's authentic result is held separately. Git, clock and finite
// scheduler retain the Room fixture's stand-ins. No provider is contacted.
test("native root keeps a lost create answer pending and explicitly resends its exact envelope once", async () => {
  const originalClock = net.clock.now;
  const r = await room({ partitioned: true, openPartition: false, roster: [] });
  const D = r.root, actual = namespace(env.PLATFORM).transport;
  const sent: Delivered[] = [];
  let recovering = false;
  wired.set(D.name, () => ({ transport: { send: async envelope => {
    if (!("definition" in envelope.to) || envelope.to.definition !== C.partition) return actual.send(envelope);
    sent.push(structuredClone(envelope));
    if (recovering) return actual.send(envelope);
    if (sent.length === 1) { expect((await actual.send(envelope))?.answer).toBe("recorded"); return null; }
    return { answer: "routing", reason: "not-found" };
  } } }));
  try {
    await D.restart();
    const signed = await D.intent(rita, "open-partition", { expected: await D.expected({ repository: 0 }) });
    const seed: Seed = { v: 1, kind: "directory", definition: C.partition, creator: await D.at(), cause: intentDigest(signed.intent), ordinal: 0 };
    const P = new Platform(scopeIdOf(seed));
    net.hold = envelope => envelope.from.at.scope === P.name && envelope.message.class === "result";
    const opened = await D.stub.submit(signed, []);
    expect(opened).toMatchObject({ answer: "accepted" });
    if (opened.answer !== "accepted") return expect.fail("actual root creation was refused");
    const duty = `${opened.receipt.fact.seq}.0`;
    const outbox = async () => {
      const read = await D.stub.outbox("a test reader");
      if (!read.ok) throw new Error("actual Root outbox is unavailable");
      return read.value.find(row => row.duty === duty)!;
    };
    // Dispatch the child only once while its result is held. Its later
    // retry remains due, ready for explicit release after Root recovery.
    await D.stub.dispatch();
    await P.stub.dispatch();
    for (let attempt = 0; attempt < 4 && !(await outbox()).diagnosis; attempt++) {
      net.clock.now = soon(PROPOSED_BOUNDS.dispatchRetryMaxSeconds + 1);
      await D.stub.dispatch();
    }
    expect(await outbox()).toMatchObject({ diagnosis: { finding: "delivery-unavailable" }, result: null, acknowledged: null });
    // The unanswered physical attempt is followed by the three routing
    // refusals that exhaust the native retry budget.
    expect(sent).toHaveLength(4);
    expect((await D.summary()).value.items.filter(row => row.type === "partition")).toMatchObject([{ state: "creating", values: { generation: 1, base: 1 } }]);
    expect(await D.act(rita, "open-partition", { expected: await D.expected({ repository: 0 }) })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "partition-pending" });
    const before = await D.summary();
    await D.restart();
    net.clock.now = soon(3600);
    await D.stub.dispatch();
    expect(sent).toHaveLength(4);
    expect((await D.summary()).at).toEqual(before.at);
    recovering = true;
    expect(await (D.object as unknown as { resend(duty: unknown): Promise<Resent> }).resend(duty)).toEqual({ sent: true, answer: "acknowledged" });
    expect(sent).toHaveLength(5);
    expect(sent[4]).toEqual(sent[0]);
    expect((await D.summary()).at).toEqual(before.at);
    expect(await outbox()).toMatchObject({ result: null, diagnosis: { finding: "delivery-unavailable" }, acknowledged: { at: await P.at(), seq: 0 } });
    net.hold = null;
    net.clock.now = soon(PROPOSED_BOUNDS.dispatchRetryMaxSeconds + 1);
    await settle(...r.scopes, P);
    expect(await outbox()).toMatchObject({ result: { clause: "applied" } });
    expect((await D.summary()).value.items.filter(row => row.type === "partition")).toMatchObject([{ state: "active", values: { generation: 1, base: 1, conflict: false }, refs: { scope: await P.at() } }]);
    await settle(...r.scopes, P);
    expect(sent).toHaveLength(5);
    // PURE boundary specimen: one namespace cannot actually produce a
    // second incarnation of this seed. Change only the actual G's inc in
    // memory, offer it to the real clause judge, and never write the draft.
    // This proves the conflict clause, not Native second-birth attestation.
    const born = (await P.entries())[0]!;
    if (born.input.type !== "genesis") return expect.fail("actual child has no genesis");
    const other = newIncarnation(new Uint8Array(16).fill(99));
    const synthetic: Entry = { ...born, at: { ...born.at, inc: other }, input: { ...born.input, inc: other } };
    const conflict = await runInDurableObject(D.object, (_instance, storage) => {
      const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
      const native = platform(C.directory)!;
      const checked = validateDefinition(native.data, PROPOSED_BOUNDS, PROFILES, { platform: true });
      if (!checked.ok) throw new Error("native Root definition is invalid");
      const reply = synthetic.sends.find(send => send.message.class === "result")!;
      const judged = judgeDelivery(store, checked.definition, { to: reply.to, from: factRefOf(synthetic), n: reply.n, message: reply.message }, {
        clock: clockOf(store, net.clock.now), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], own: ownOf(store),
        source: { entry: synthetic, under: "platform:directory-partition" },
        origin: JSON.parse(store.stored(opened.receipt.fact.seq)!.bytes) as Entry,
        platform: { named: C.directory, rules: native.rules },
      });
      return judged.result === "write" ? { input: judged.draft.input, effects: judged.draft.effects, sends: judged.draft.sends } : judged;
    });
    const row = (await D.summary()).value.items.find(item => item.type === "partition")!;
    expect(conflict).toMatchObject({ input: { type: "delivery", clause: "conflict" }, effects: [{ effect: "value", item: row.id, slot: "conflict", value: true }], sends: [] });
    expect("effects" in conflict && conflict.effects).toHaveLength(1);
    expect((await D.summary()).value.items.find(item => item.id === row.id)).toEqual(row);
  } finally { net.hold = null; wired.delete(D.name); net.clock.now = originalClock; }
}, 60_000);
