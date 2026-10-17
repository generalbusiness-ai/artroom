import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type Seed } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { owed, PROFILES, validateDefinition } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as C, platform } from "@generalbusiness/dap-platform";
import { partitionLane, partitionGeneration } from "../../../../packages/platform/src/directory-partitions.ts";
import { SqliteStore } from "../../../../packages/scope/src/sqlite.ts";
import { net } from "./support/graph.ts";
import { room, rita, Platform, Room, settle, soon } from "./support/room.ts";
import { nativelyCreatedChild, settleNativeChildren } from "./support/natively-created-child.ts";
import { DIGESTS, issue } from "../src/index.ts";

// Native factories, authority, C1, index traffic, seal and handoff. Root and
// first partition have explicit fixture bounds; other native scopes retain
// defaults. Git, clock, setup inspector and scheduler remain stand-ins.
test.each(["full", "threshold"] as const)("native partition seal at %s keeps control readable and makes one successor", async mode => {
  const r = await room({ partitioned: true, openPartition: false, rootBounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 }, roster: [] });
  let partName: string | undefined;
  const originalClock = net.clock.now;
  try {
    await r.activate(issue, DIGESTS.issue);
    const signed = await r.root.intent(rita, "open-partition", { expected: await r.root.expected({ repository: 0 }) });
    const seed: Seed = { v: 1, kind: "directory", definition: C.partition, creator: await r.root.at(), cause: intentDigest(signed.intent), ordinal: 0 };
    const P = new Platform(scopeIdOf(seed)); partName = P.name;
    const bounds = { ...PROPOSED_BOUNDS, scopeEntries: 64 };
    net.sized.set(P.name, bounds);
    expect(await r.root.stub.submit(signed, [])).toMatchObject({ answer: "accepted" });
    await settle(...r.scopes, P);
    expect((await P.summary()).value).toMatchObject({ status: "active", definition: C.partition });
    const data = platform(C.partition)!.data, checked = validateDefinition(data, bounds, PROFILES, { platform: true });
    if (!checked.ok) return expect.fail("native partition data does not validate");
    const definition = checked.definition;
    const state = () => runInDurableObject(P.object, (_instance, storage) => {
      const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
      const scope = store.scope()!, last = JSON.parse(store.stored(scope.head.seq)!.bytes) as Entry;
      return { written: scope.head.seq + 1, reserved: owed(store, definition, last.input), control: store.item(0) };
    });
    const laneRoom = new Room(r.R, P, r.M, r.rules, r.G, r.firstHead, r.members, r.root);
    const parent = await laneRoom.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Sustained native index", conditions: ["Seal remains possible"] });
    const I = new Platform(parent.name);
    await settle(...r.scopes, P, I);
    // Hold the real child's genesis result before sealing. Its actual birth
    // still runs; only the reply to its creator is delayed by test transport.
    let late: Platform | undefined;
    let lateDuty: string | undefined;
    if (mode === "threshold") {
      net.hold = envelope => "scope" in envelope.to && envelope.to.scope === P.name && envelope.from.at.kind === "lane" && envelope.from.at.scope !== I.name && envelope.message.class === "result";
      const lane = await laneRoom.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Delayed child result", conditions: ["Settle after seal"] });
      late = new Platform(lane.name);
      const pending = (await P.summary()).value.items.find(item => item.type === "lane" && item.values["number"] === 2);
      expect(pending).toMatchObject({ values: { number: 2, title: "Delayed child result" } });
      const outbox = await P.stub.outbox("a test reader");
      if (!outbox.ok) return expect.fail("actual partition outbox is unavailable");
      const create = outbox.value.find(duty => "definition" in duty.to && scopeIdOf(duty.to) === late!.name);
      expect(create).toMatchObject({ result: null, acknowledged: { at: await late.at(), seq: 0 } });
      lateDuty = create!.duty;
    }
    let full = false;
    for (let n = 0; n < 80; n++) {
      const before = await state();
      if (mode === "threshold" && before.written >= Math.floor(bounds.scopeEntries / 4)) break;
      await I.did(rita, "edit-own", { on: 0, expected: await I.expected({ on: 0 }), fields: { title: `Native index ${n}` } });
      await settle(...r.scopes, P, I);
      const after = await state();
      if (after.written === before.written) { full = true; break; }
    }
    if (mode === "full") {
      expect(full).toBe(true);
      const before = await state();
      expect(before.written + before.reserved).toBe(bounds.scopeEntries);
    }
    const sealed = await P.act(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) });
    expect(sealed).toMatchObject({ answer: "accepted" });
    if (sealed.answer !== "accepted") return expect.fail("native seal was refused");
    await settle(...r.scopes, P, I);
    const active = (await r.root.summary()).value.items.filter(item => item.type === "partition" && ["active", "creating"].includes(item.state));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ values: { generation: 2, base: 100001 } });
    // A creator's deciding entry precedes the child's result. Register the
    // actual successor from that exact entry before draining its dispatcher.
    const creation = await r.root.stub.entry("a test reader", active[0]!.id);
    if (!creation.ok) return expect.fail("actual successor creation entry is unavailable");
    const next = creation.value.entry.sends.find(send => (send.to as Seed).definition === C.partition);
    if (!next) return expect.fail("actual root emitted no successor create");
    const Q = new Platform(scopeIdOf(next.to as Seed));
    await settle(...r.scopes, P, Q, I);
    expect((await r.root.summary()).value.items.filter(item => item.type === "partition" && ["active", "creating"].includes(item.state))).toMatchObject([{ state: "active", values: { generation: 2, base: 100001 }, refs: { scope: await Q.at() } }]);
    expect((await Q.summary()).value).toMatchObject({ status: "active", definition: C.partition });
    expect((await state()).control).toMatchObject({ state: "open", values: { sealed: true, handedOff: true }, refs: { root: await r.root.at(), membership: await r.M.at() } });
    await P.restart();
    expect(await P.stub.submit(await P.intent(rita, "open-issue", { expected: await P.expected({ repository: 0 }), fields: { definition: DIGESTS.issue, title: "After seal", conditions: ["No new lane"] } }), [], { values: [canonicalize(issue)] })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "partition-sealed" });
    const history = (await r.root.entries()).filter(entry => entry.input.type === "delivery" && entry.input.message.class === "request" && entry.input.message.type === "tell" && (entry.input.message.body as { message?: string }).message === "seal");
    expect(history).toHaveLength(1);
    if (mode === "threshold") {
      net.hold = null;
      net.clock.now = soon(PROPOSED_BOUNDS.dispatchRetryMaxSeconds + 1);
      await settle(...r.scopes, P, Q, I, late!);
      const delivered = await runInDurableObject(P.object, (_instance, storage) => {
        const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
        return partitionLane(store, late!.name);
      });
      expect(delivered).toMatchObject({ state: "listed", values: { number: 2, title: "Delayed child result" }, refs: { scope: await late!.at() } });
      const settledOutbox = await P.stub.outbox("a test reader");
      if (!settledOutbox.ok) return expect.fail("actual settled outbox is unavailable");
      const result = settledOutbox.value.find(duty => duty.duty === lateDuty)!.result;
      expect(result).toMatchObject({ clause: "applied" });
      expect(result!.seq).toBeGreaterThan(sealed.receipt.fact.seq);
      await I.did(rita, "edit-own", { on: 0, expected: await I.expected({ on: 0 }), fields: { title: "Existing lane after seal" } });
      await settle(...r.scopes, P, Q, I);
      const old = await runInDurableObject(P.object, (_instance, storage) => {
        const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
        return partitionLane(store, I.name);
      });
      expect(old).toMatchObject({ values: { title: "Existing lane after seal", number: 1 } });
      // The room owns the actual parent dispatcher and the helper owns
      // its child's prebirth Git stand-in; neither source is fabricated.
      const plan = (await parent.did(rita, "open-plan", {})).fact.seq;
      const child = await nativelyCreatedChild(laneRoom, parent, await parent.signed(rita, "add-concern", { fields: { plan, purpose: "Post-seal concern", role: "required", title: "Concern after seal", conditions: ["Keep old partition numbering"] } }));
      await settleNativeChildren(laneRoom);
      const row = await runInDurableObject(P.object, (_instance, storage) => {
        const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
        return partitionLane(store, child.child.name);
      });
      expect(row).toMatchObject({ values: { number: 3, title: "Concern after seal" } });
    }
    const nextRoom = new Room(r.R, Q, r.M, r.rules, r.G, r.firstHead, r.members, r.root);
    const nextLane = await nextRoom.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Successor numbering", conditions: ["Keep generation ranges disjoint"] });
    const numbered = await runInDurableObject(Q.object, (_instance, storage) => {
      const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
      return partitionLane(store, nextLane.name);
    });
    expect(numbered).toMatchObject({ state: "listed", values: { number: 100001, title: "Successor numbering" } });
    const first = await runInDurableObject(r.root.object, (_instance, storage) => {
      const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
      return partitionGeneration(store, 1);
    });
    expect(first).toMatchObject({ state: "sealed", refs: { scope: await P.at() } });
  } finally { net.hold = null; net.clock.now = originalClock; if (partName) net.sized.delete(partName); }
}, 60_000);
