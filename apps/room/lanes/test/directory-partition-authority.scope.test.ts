import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type ScopeId, type Seed } from "@generalbusiness/dap-contract";
import { factRefOf, intentDigest, scopeIdOf } from "@generalbusiness/artroom-bytes";
import type { RuleGiven } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
import { directoryRules10 } from "../../../../packages/platform/src/directory-partitions.ts";
import { SqliteStore } from "../../../../packages/scope/src/sqlite.ts";
import { net } from "./support/graph.ts";
import { room, rita, Platform, Room, settle } from "./support/room.ts";
import { DIGESTS, issue } from "../src/index.ts";

// Two real Native rooms and an actual foreign partition seal. Rerouting
// that written send is an explicit hostile transport specimen. Git, clock,
// setup inspection and finite scheduler retain the Room stand-ins.
test("a foreign native directory-kind partition cannot redirect its seal into another Root", async () => {
  let partName: ScopeId | undefined;
  try {
    const receiving = await room({ partitioned: true, rootBounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 }, roster: [] });
    const foreign = await room({ partitioned: true, openPartition: false, rootBounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 }, roster: [] });
    await foreign.activate(issue, DIGESTS.issue);
    const signed = await foreign.root.intent(rita, "open-partition", { expected: await foreign.root.expected({ repository: 0 }) });
    const seed: Seed = { v: 1, kind: "directory", definition: C.partition, creator: await foreign.root.at(), cause: intentDigest(signed.intent), ordinal: 0 };
    const P = new Platform(scopeIdOf(seed)); partName = P.name;
    net.sized.set(P.name, { ...PROPOSED_BOUNDS, scopeEntries: 64 });
    expect(await foreign.root.stub.submit(signed, [])).toMatchObject({ answer: "accepted" });
    await settle(...foreign.scopes, P);
    const lanes = new Room(foreign.R, P, foreign.M, foreign.rules, foreign.G, foreign.firstHead, foreign.members, foreign.root);
    const child = await lanes.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Foreign native traffic", conditions: ["Reach its own seal threshold"] });
    for (let n = 0; n < 80 && (await P.summary()).at.seq + 1 < 16; n++) {
      await child.did(rita, "edit-own", { on: 0, fields: { title: `Foreign index ${n}` } });
      await lanes.settle();
    }
    expect((await P.summary()).at.seq + 1).toBeGreaterThanOrEqual(16);
    net.hold = envelope => envelope.from.at.scope === P.name && envelope.message.class === "request" && envelope.message.type === "tell";
    const sealing = await P.did(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) });
    const entry = (await P.entries())[sealing]!, send = entry.sends[0]!;
    expect(send).toMatchObject({ to: await foreign.root.at(), message: { class: "request", type: "tell", body: { message: "seal" } } });
    const from = factRefOf(entry), before = await receiving.root.summary();
    expect(await receiving.root.stub.deliver({ to: await receiving.root.at(), from, n: send.n, message: send.message })).toEqual({ answer: "source-unverified" });
    expect((await receiving.root.summary()).at).toEqual(before.at);
    expect((await receiving.root.summary()).value.items.filter(item => item.type === "partition")).toEqual(before.value.items.filter(item => item.type === "partition"));
    // PURE guard boundary using the actual stored receiving state and the
    // actual foreign source: even a trusted source hand cannot substitute
    // another directory-kind reference for the full active partition ref.
    const guarded = await runInDurableObject(receiving.root.object, (_instance, storage) => {
      const store = new SqliteStore({ exec: (query, ...args) => storage.storage.sql.exec(query, ...args), transaction: work => storage.storage.transactionSync(work) });
      const rule = directoryRules10["active-partition"]!;
      if (rule.place !== "guard") throw new Error("wrong native guard place");
      const given: RuleGiven = { state: store, input: { type: "delivery", from, n: send.n, message: send.message }, time: entry.time,
        uses: [{ fact: from, entry, under: "platform:directory-partition" }], own: () => null,
        resolved: { at: store.scope()!.at, self: store.scope()!.head.seq + 1, fields: {}, subjects: new Map(), signer: null, bounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 } },
        observed: () => null, value: () => undefined, placed: () => undefined };
      return rule.run(given);
    });
    expect(guarded).toEqual({ holds: false, name: "not-the-active-partition" });
  } finally { net.hold = null; if (partName) net.sized.delete(partName); }
}, 60_000);
