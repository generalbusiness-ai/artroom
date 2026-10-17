import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Seed, type ScopeId } from "@generalbusiness/dap-contract";
import { b64url, intentDigest, scopeIdOf, timeMs } from "@generalbusiness/artroom-bytes";
import { secretSigner, type Fetch } from "@generalbusiness/artroom-client";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
import { command, memoryStore, type Context } from "../../../../packages/cli/src/index.ts";
import { beginSessionFixture } from "../../../../packages/scope/test/session-settings.ts";
import { Reads } from "../../../../packages/mcp/src/reads.ts";
import { Kept, readInventory } from "../../../../packages/mcp/src/inventory.ts";
import { act, actsOn, issueCreation, openRoom, listLanes } from "../../page/src/data.ts";
import { net } from "./support/graph.ts";
import { room, rita, Platform, settle, routed } from "./support/room.ts";
import { DIGESTS, issue } from "../src/index.ts";

// Actual CLI commands, Page data and MCP inventory over the real HTTP read
// routes, session/key authority, Native factories and SQLite. Room's Git,
// clock, setup inspector and finite scheduler remain labelled stand-ins.
// No browser rendering, provider operation or automatic handoff is claimed.
test("partition consumers keep the Root stable, open through the active partition and list separate old/new heads", async () => {
  const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: "a test reader" });
  let partName: ScopeId | undefined;
  try {
    const r = await room({ partitioned: true, openPartition: false, rootBounds: { ...PROPOSED_BOUNDS, scopeEntries: 3012 }, roster: [] });
    await r.activate(issue, DIGESTS.issue);
    const repository = { directory: await r.root.at(), membership: await r.M.at(), rules: r.rules.name, destination: r.G.name };
    const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
    const now = () => timeMs(net.clock.now)!;
    const store = memoryStore(); await store.keep("rita", rita.secret);
    await store.save({ v: 1, service: "https://scopes.test", key: "rita", handle: "@rita", repository });
    const ctx: Context = { store, fetch, now, pause: async waiting => settle(...r.scopes, ...waiting.map(scope => new Platform(scope as ScopeId))) };
    const before = (await r.root.summary()).at;
    const absent = await command(ctx, ["issue", "open", "--title", "Before any partition"]);
    expect(absent).toMatchObject({ code: 1, lines: [expect.stringContaining("no-active-partition")] });
    expect((await r.root.summary()).at).toEqual(before);
    const signed = await r.root.intent(rita, "open-partition", { expected: await r.root.expected({ repository: 0 }) });
    const seed: Seed = { v: 1, kind: "directory", definition: C.partition, creator: repository.directory, cause: intentDigest(signed.intent), ordinal: 0 };
    const P = new Platform(scopeIdOf(seed)); partName = P.name;
    net.sized.set(P.name, { ...PROPOSED_BOUNDS, scopeEntries: 64 });
    expect(await r.root.stub.submit(signed, [])).toMatchObject({ answer: "accepted" });
    await settle(...r.scopes, P);
    const opened: Platform[] = [];
    for (const [number, title] of [[1, "First partition issue"], [2, "Another first partition issue"]] as const) {
      const answer = await command(ctx, ["issue", "open", "--title", title]);
      expect(answer, answer.lines.join("\n")).toMatchObject({ code: 0, lines: [expect.stringContaining(`Opened issue #${number}:`)] });
      const id = /Its lane is (sc_[a-z2-7]+)\./.exec(answer.lines[0]!)?.[1];
      if (!id) return expect.fail("actual CLI returned no created issue");
      const I = new Platform(id as ScopeId); opened.push(I);
      expect((await I.entries())[0]!.input).toMatchObject({ type: "genesis", seed: { creator: await P.at() } });
    }
    // Advance only actual existing-lane index traffic to the versioned
    // threshold. Explicitly seal: no consumer signs recovery on our behalf.
    for (let n = 0; n < 80 && (await P.summary()).at.seq + 1 < 16; n++) {
      await opened[0]!.did(rita, "edit-own", { on: 0, expected: await opened[0]!.expected({ on: 0 }), fields: { title: `Before handoff ${n}` } });
      await settle(...r.scopes, P, ...opened);
    }
    expect((await P.summary()).at.seq + 1).toBeGreaterThanOrEqual(16);
    await P.did(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) });
    await settle(...r.scopes, P, ...opened);
    const creating = (await r.root.summary()).value.items.find(item => item.type === "partition" && item.state === "creating")!;
    const Q = await r.root.created(creating.id);
    await settle(...r.scopes, P, Q, ...opened);
    const next = await command(ctx, ["issue", "open", "--title", "Successor issue"]);
    expect(next, next.lines.join("\n")).toMatchObject({ code: 0, lines: [expect.stringContaining("Opened issue #100001:")] });
    expect((await store.config())!.repository!.directory).toEqual(repository.directory);
    const page = await openRoom({ service: "https://scopes.test", secret: rita.secret, fetch, now }, { directory: r.root.name, membership: repository.membership });
    expect(page.directoryIndex).toMatchObject({ scope: repository.directory, definition: C.directory });
    expect((await listLanes(page)).issues.map(row => row.number)).toEqual([1, 2, 100001]);
    expect((await actsOn(page, page.directory)).acts.some(offered => offered.kind === "open-issue")).toBe(true);
    const pageOpening = await act(page, page.directory, "open-issue", { fields: { definition: DIGESTS.issue, title: "Page successor issue", conditions: ["Keep the actual target"] } });
    expect(pageOpening).toMatchObject({ requestedScope: r.root.name, scope: Q.name, answer: { answer: "accepted", receipt: { fact: { at: await Q.at() } } } });
    if (pageOpening.answer.answer !== "accepted") return expect.fail("actual Page opening was refused");
    const pageChild = await Q.created(pageOpening.answer.receipt.fact.seq);
    await settle(...r.scopes, P, Q, pageChild, ...opened);
    expect(await issueCreation(page, pageOpening)).toEqual({ state: "confirmed", child: await pageChild.at() });
    expect((await listLanes(page)).issues.map(row => row.number)).toEqual([1, 2, 100001, 100002]);
    const listing = await command(ctx, ["issues"]);
    expect(listing.code, listing.lines.join("\n")).toBe(0);
    expect(listing.lines.join("\n")).toContain("#100001");
    const inventory = await readInventory(new Reads({ service: "https://scopes.test", signer: secretSigner(rita.secret), fetch, now }), new Kept(), { service: "https://scopes.test", repository });
    expect(inventory.unread).toEqual([]);
    expect(inventory.room!.directory).toEqual(repository.directory);
    expect(inventory.room!.lanes.map(lane => lane.number)).toEqual([1, 2, 100001, 100002]);
    expect(inventory.inventory.scopes.filter(scope => scope.place === "directory").map(scope => scope.ref)).toEqual([repository.directory]);
    expect(inventory.inventory.scopes.filter(scope => scope.place === "partition").map(scope => scope.ref)).toEqual([await P.at(), await Q.at()]);
    expect(inventory.heads[P.name]).toBe(`${(await P.summary()).at.seq}:${(await P.summary()).at.hash}`);
    expect(inventory.heads[Q.name]).toBe(`${(await Q.summary()).at.seq}:${(await Q.summary()).at.hash}`);
  } finally { if (partName) net.sized.delete(partName); owner.close(); }
}, 60_000);
