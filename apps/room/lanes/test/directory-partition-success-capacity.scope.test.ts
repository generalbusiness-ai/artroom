import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type ScopeId } from "@generalbusiness/dap-contract";
import { keyIdOfSecret, scopeIdOf, signInvitationProof } from "@generalbusiness/artroom-bytes";
import { owed, PROFILES, standingEntries, validateDefinition } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as C, platform } from "@generalbusiness/dap-platform";
import { partitionGeneration } from "../../../../packages/platform/src/directory-partitions.ts";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { SqliteStore } from "../../../../packages/scope/src/sqlite.ts";
import { wired } from "../../../../packages/scope/test/outside.ts";
import { net } from "./support/graph.ts";
import { room, rita, Platform, settle, soon } from "./support/room.ts";

// Native successful births/seals to the production generation cap, with
// all 3,000 standing entries. Explicit fixture bounds: Root 3,012; each
// partition 8, whose quarter threshold is reached by birth+confirmation.
// This does not claim ordinary lane capacity at that tiny partition bound,
// provider execution, peak heap or a completion-time guarantee. The separate
// full-partition case supplies sustained native lane-index traffic. Git,
// clock, setup inspector and finite scheduler retain Room's stand-ins.
test("native initially full Root completes one thousand successful partition births and cap-limited seals", async () => {
  const bounds = { ...PROPOSED_BOUNDS, scopeEntries: 3012 };
  const r = await room({ partitioned: true, openPartition: false, rootBounds: bounds, roster: [] });
  const D = r.root, code = platform(C.directory)!, checked = validateDefinition(code.data, bounds, PROFILES, { platform: true });
  if (!checked.ok) return expect.fail("native Root data is invalid");
  const definition = checked.definition;
  const snapshot = (generation = 0) => runInDurableObject(D.object, (_instance, storage) => {
    const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
    const scope = store.scope()!, last = JSON.parse(store.stored(scope.head.seq)!.bytes) as Entry;
    return { written: scope.head.seq + 1, reserved: owed(store, definition, last.input), standing: standingEntries(store, definition), generations: store.item(0)!.values["generations"], row: generation ? partitionGeneration(store, generation) : undefined };
  });
  const actual = namespace(env.PLATFORM).transport, parts = new Set<ScopeId>();
  // Exact entry reads: the fixture's created()/last() convenience methods
  // use a first history page and cannot locate later long-lived Root turns.
  const createdAt = async (seq: number) => {
    const read = await D.stub.entry("a test reader", seq);
    if (!read.ok) throw new Error("actual Root creation entry unavailable");
    const send = read.value.entry.sends.find(send => "definition" in send.to && send.to.definition === C.partition);
    if (!send || !("definition" in send.to)) throw new Error("actual Root entry has no partition create");
    return new Platform(scopeIdOf(send.to));
  };
  const answers: unknown[] = [];
  let creates = 0;
  wired.set(D.name, () => ({ transport: { send: async envelope => {
    if ("definition" in envelope.to && envelope.to.definition === C.partition) {
      const name = scopeIdOf(envelope.to); parts.add(name); creates++;
      net.sized.set(name, { ...PROPOSED_BOUNDS, scopeEntries: 8 });
    }
    const answer = await actual.send(envelope);
    answers.push({ from: envelope.from.seq, n: envelope.n, class: envelope.message.class, answer });
    if (answers.length > 8) answers.shift();
    return answer;
  } } }));
  try {
    // Real membership relays fill ordinary Root admission. The controller's
    // original key remains active and still signs each actual native seal.
    let full = false;
    for (let n = 0; n < Math.ceil(bounds.scopeEntries / 2) + 8; n++) {
      const before = await snapshot(), member = r.members["@rita"]!;
      const invitationSeed = crypto.getRandomValues(new Uint8Array(32)), keySeed = crypto.getRandomValues(new Uint8Array(32));
      const actor = { ...rita, key: keyIdOfSecret(keySeed), secret: keySeed, principal: null };
      const invitation = await r.M.did(rita, "invite-key", { expected: await r.M.expected({ member }), fields: { member, kind: "agent", inviteKey: keyIdOfSecret(invitationSeed), inviteEnds: soon(3600) } });
      await r.M.did(actor, "enrol", { on: 0, expected: await r.M.expected({ on: 0, member }), fields: { invitation, proof: signInvitationProof(invitationSeed, await r.M.at(), invitation, actor.key) } });
      await r.M.did(rita, "revoke-key", { on: invitation, expected: await r.M.expected({ on: invitation, roster: 0, member }), fields: { as: "compromised" } });
      await r.settle();
      if ((await snapshot()).written === before.written) { full = true; break; }
    }
    expect(full).toBe(true);
    const baseline = await snapshot();
    expect(baseline.standing).toBe(3000);
    expect(baseline.written + baseline.reserved).toBeLessThanOrEqual(bounds.scopeEntries);
    expect(bounds.scopeEntries - baseline.written - baseline.reserved).toBeLessThan(3);
    await D.restart();
    const opened = await D.did(rita, "open-partition", { expected: await D.expected({ repository: 0 }) });
    let P = await createdAt(opened);
    for (let generation = 1; generation <= 1000; generation++) {
      await settle(...r.scopes, P);
      const active = await snapshot(generation);
      expect(active).toMatchObject({ generations: generation, standing: 3 * (1000 - generation), row: { state: "active", values: { generation, base: (generation - 1) * 100000 + 1 }, refs: { scope: await P.at() } } });
      expect(active.written).toBe(baseline.written + 2 * generation);
      expect(active.written + active.reserved).toBeLessThanOrEqual(bounds.scopeEntries);
      expect((await P.summary()).value).toMatchObject({ definition: C.partition, status: "active" });
      expect(await P.item(0)).toMatchObject({ state: "open", values: { sealed: false, generation }, refs: { root: await D.at(), membership: await r.M.at() } });
      if (generation % 100 === 0) { await D.restart(); await P.restart(); }
      await P.did(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) });
      await settle(...r.scopes, P);
      if (generation < 1000) {
        const next = await snapshot(generation + 1);
        expect(next.row).toMatchObject({ state: "creating", values: { generation: generation + 1 } });
        const Q = await createdAt(next.row!.id);
        // Register and run the actual successor before claiming that this
        // handoff has completed, just as the ordinary native handoff fixture.
        await settle(...r.scopes, P, Q);
        const sealed = await P.item(0);
        expect(sealed, sealed.values["handedOff"] ? undefined : JSON.stringify({ generation, root: await snapshot(generation + 1), answers, outbox: await D.stub.outbox("a test reader") })).toMatchObject({ state: "open", values: { sealed: true, handedOff: true, sealRefused: false } });
        P = Q;
      } else {
        // The final authentic tell reaches Root's exhaustion guard. Its
        // recorded refusal returns to this original partition; no child1001.
        for (let pass = 0; pass < 64; pass++) {
          let joined = 0;
          for (const node of [D, P]) joined += (await (node.stub as unknown as { awaitScheduledCallbacks(): Promise<{ callbacks: number }> }).awaitScheduledCallbacks()).callbacks;
          await settle(...r.scopes, P);
          if (joined === 0) break;
          if (pass === 63) throw new Error("native final refusal exceeded its callback bound");
        }
        expect(await P.item(0)).toMatchObject({ state: "open", values: { sealed: true, handedOff: false, sealRefused: true } });
        const last = await D.stub.entry("a test reader", (await D.summary()).at.seq);
        expect(last).toMatchObject({ ok: true, value: { entry: { input: { type: "delivery", decision: "refused", reason: { code: "guard-failed", name: "root-exhausted" } } } } });
      }
    }
    const final = await snapshot(1000);
    expect(final).toMatchObject({ generations: 1000, standing: 0, written: baseline.written + 2001, row: { state: "active", refs: { scope: await P.at() } } });
    expect(final.written + final.reserved).toBeLessThanOrEqual(bounds.scopeEntries);
    expect([parts.size, creates]).toEqual([1000, 1000]);
  } finally { wired.delete(D.name); for (const name of parts) net.sized.delete(name); }
}, 600_000);
