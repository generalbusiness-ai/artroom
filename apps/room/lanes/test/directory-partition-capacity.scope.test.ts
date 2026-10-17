import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry } from "@generalbusiness/dap-contract";
import { keyIdOfSecret, signInvitationProof } from "@generalbusiness/artroom-bytes";
import { owed, PROFILES, standingEntries, validateDefinition } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as C, platform } from "@generalbusiness/dap-platform";
import { partitionGeneration } from "../../../../packages/platform/src/directory-partitions.ts";
import { SqliteStore } from "../../../../packages/scope/src/sqlite.ts";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { env } from "cloudflare:workers";
import { wired } from "../../../../packages/scope/test/outside.ts";
import { net, soon } from "./support/graph.ts";
import { room, rita } from "./support/room.ts";

// Actual versioned root, C1 accounting, authority, SQLite and dispatch.
// Only the root has a small explicit fixture bound. Native siblings retain
// their defaults. The transport refuses every actual partition create before
// routing it, so this proves the 1,000-generation ROUTING-FAILURE path, not
// successful partition birth, seal or a completion-time guarantee. Git,
// clock, setup inspector and scheduler retain the Room fixture's stand-ins.
test("native full root preserves three thousand standing entries through one thousand undelivered generations", async () => {
  const originalClock = net.clock.now;
  const bounds = { ...PROPOSED_BOUNDS, scopeEntries: 3012 };
  const r = await room({ partitioned: true, openPartition: false, rootBounds: bounds, roster: [] });
  const root = r.root, checked = validateDefinition(platform(C.directory)!.data, bounds, PROFILES, { platform: true });
  if (!checked.ok) return expect.fail("native root definition does not validate");
  const definition = checked.definition;
  const snapshot = (generation = 0) => runInDurableObject(root.object, (_instance, state) => {
    const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
    const scope = store.scope()!, last = JSON.parse(store.stored(scope.head.seq)!.bytes) as Entry;
    const row = generation > 0 ? partitionGeneration(store, generation) : undefined;
    return { written: scope.head.seq + 1, reserved: owed(store, definition, last.input), standing: standingEntries(store, definition), generation: store.item(0)!.values["generations"], row: row ? { id: row.id, state: row.state, generation: row.values["generation"], base: row.values["base"] } : null };
  });
  let routes = 0;
  const actual = namespace(env.PLATFORM).transport;
  wired.set(root.name, () => ({ transport: { send: async envelope => {
    if ("definition" in envelope.to && envelope.to.definition === C.partition) { routes++; return { answer: "routing", reason: "not-found" }; }
    return actual.send(envelope);
  } } }));
  try {
    expect((await snapshot()).standing).toBe(3000);
    // Real M6 key invitations, enrollment and revocation generate unrelated
    // compromised relays. The controller's original key remains active.
    let full = false;
    for (let n = 0; n < Math.ceil(bounds.scopeEntries / 2) + 8; n++) {
      const before = await snapshot();
      const invitationSeed = crypto.getRandomValues(new Uint8Array(32)), keySeed = crypto.getRandomValues(new Uint8Array(32));
      const key = keyIdOfSecret(keySeed), actor = { ...rita, key, secret: keySeed, principal: null };
      const member = r.members["@rita"]!;
      const invitation = await r.M.did(rita, "invite-key", { expected: await r.M.expected({ member }), fields: { member, kind: "agent", inviteKey: keyIdOfSecret(invitationSeed), inviteEnds: soon(3600) } });
      await r.M.did(actor, "enrol", { on: 0, expected: await r.M.expected({ on: 0, member }), fields: { invitation, proof: signInvitationProof(invitationSeed, await r.M.at(), invitation, key) } });
      await r.M.did(rita, "revoke-key", { on: invitation, expected: await r.M.expected({ on: invitation, roster: 0, member }), fields: { as: "compromised" } });
      await r.settle();
      const after = await snapshot();
      if (after.written === before.written) { full = true; break; }
    }
    expect(full).toBe(true);
    const baseline = await snapshot();
    expect(baseline.standing).toBe(3000);
    expect(baseline.written + baseline.reserved).toBeLessThanOrEqual(bounds.scopeEntries);
    expect(bounds.scopeEntries - baseline.written - baseline.reserved).toBeLessThan(3);
    await root.restart();
    for (let generation = 1; generation <= 1000; generation++) {
      const opened = await root.act(rita, "open-partition", { expected: await root.expected({ repository: 0 }) });
      expect(opened).toMatchObject({ answer: "accepted" });
      for (let attempt = 0; attempt < 4; attempt++) {
        await root.stub.dispatch();
        if ((await snapshot(generation)).row?.state === "undelivered") break;
        net.clock.now = soon(PROPOSED_BOUNDS.dispatchRetryMaxSeconds + 1);
      }
      const done = await snapshot(generation);
      expect(done).toMatchObject({ generation, standing: 3 * (1000 - generation), row: { state: "undelivered", generation, base: (generation - 1) * 100000 + 1 } });
      expect(done.written).toBe(baseline.written + 2 * generation);
      expect(done.written + done.reserved).toBeLessThanOrEqual(bounds.scopeEntries);
      if (generation % 100 === 0) await root.restart();
    }
    expect(routes).toBe(3000);
    const before = await snapshot();
    expect(await root.act(rita, "open-partition", { expected: await root.expected({ repository: 0 }) })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "root-exhausted" });
    expect(await snapshot()).toEqual(before);
  } finally { wired.delete(root.name); net.sized.delete(root.name); net.clock.now = originalClock; }
}, 600_000);
