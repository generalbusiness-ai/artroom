/**
 * Request df6ff8d3: every propose failed live with 503 `unavailable` after
 * mint lanes B and C.
 *
 * Artifacts sets a token's expiry by its own clock. On the spike its expiry
 * for a 600 s pinning token was 67 ms later than the Room's arrival time plus
 * 600 s, so the mint ledger's check refused every canonical token as "an
 * expiry later than the lifetime asked". Pinning, previews, integration,
 * publication and log pushes all failed. The fix allows a reported expiry
 * `MINT_CLOCK_ALLOWANCE_MS` past that bound.
 *
 * Here the in-memory Artifacts runs its clock 67 ms ahead of the Room's,
 * the value measured live. Everything else is the same code a deployment
 * runs: the Room's adapters, lane B's pinning and landing, and the ledger.
 * The bound itself (exactly the allowance passes, 1 ms more is refused) is
 * pinned in packages/git/test/mints.test.ts.
 */

import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Claim, Landing, LandOp } from "@generalbusiness/artroom-contract";
import type { Room } from "../../src/index.ts";
import { call, clock, failure, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

/** Artifacts' clock ahead of the Room's, as measured on the spike (request df6ff8d3). */
const LIVE_SKEW_MS = 67;

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

/** Run Artifacts' clock `ms` ahead of the Room's: token expiries and expiry states are Artifacts' own. */
function artifactsAhead(r: TestRoom, ms: number): void {
  (r.world.artifacts as unknown as { now: () => number }).now = () => clock.now + ms;
}

describe("request df6ff8d3: a propose with Artifacts' clock ahead of the Room's", () => {
  it("67 ms ahead, as live: two proposes are admitted, both lanes land, the log publishes, and no canonical token is left active or owed", async () => {
    const r = await makeRoom();
    artifactsAhead(r, LIVE_SKEW_MS);
    const a = await r.admin.ok<Claim>("claim", null, { goal: "first", scope: ["docs/a/**"] });
    const b = await r.admin.ok<Claim>("claim", null, { goal: "second", scope: ["docs/b/**"] });
    const ha = pushChange(r, a.lane, { "docs/a/one.md": "one" });
    const hb = pushChange(r, b.lane, { "docs/b/two.md": "two" });
    // Before the fix, each propose was `unavailable` at propose.pinObjects.
    await r.admin.ok("propose", { lane: a.lane }, { lease: 1, expectedGeneration: 0, head: ha, summary: "first" });
    await r.admin.ok("propose", { lane: b.lane }, { lease: 1, expectedGeneration: 0, head: hb, summary: "second" });
    const la = await r.admin.ok<Landing>("land", { lane: a.lane, generation: 1 }, { lease: 1, head: ha });
    await tick(r, 3);
    expect(r.world.artifacts.main).toBe(ha);
    // The second lane is no longer a fast-forward of main: its integration is a merge the sandbox builds.
    const lb = await r.admin.ok<Landing>("land", { lane: b.lane, generation: 1 }, { lease: 1, head: hb });
    await tick(r, 3);
    expect([ha, hb]).not.toContain(r.world.artifacts.main);
    for (const l of [la, lb]) expect(((await r.admin.read({ q: "op", op: l.op.id })) as LandOp).state).toBe("landed");
    const published = await call<{ through: number } | null>(r.stub.publishLog());
    expect(published?.through).toBeGreaterThan(0);
    const duties = await inDO(r, (room) => room.core.mints.duties({ limit: 1000 }));
    expect({ records: duties.records, owed: duties.owed, unknown: duties.unknown }).toEqual({ records: [], owed: 0, unknown: 0 });
    expect(r.world.artifacts.canonicalRepo().activeTokens()).toEqual([]);
  });

  it("an expiry a minute past the lifetime asked is still refused: the propose is unavailable and its token is owed revocation", async () => {
    const r = await makeRoom();
    artifactsAhead(r, 60_000);
    const a = await r.admin.ok<Claim>("claim", null, { goal: "first", scope: ["docs/a/**"] });
    const ha = pushChange(r, a.lane, { "docs/a/one.md": "one" });
    const err = await failure(r.stub.submit(r.admin.signed("propose", { lane: a.lane }, { lease: 1, expectedGeneration: 0, head: ha, summary: "first" })));
    expect(err).toMatchObject({ code: "unavailable", maybeRecorded: false });
    const diag = r.world.diagnoses.filter((d) => d.event === "pre-admission-failed");
    expect(diag.map((d) => [d.step, d.message])).toEqual([["propose.pinObjects", expect.stringContaining("an expiry later than the lifetime asked")]]);
    // Since mint lane F (request 02836f9a), pinning mints the fork's read token first, through the fork's own ledger, with
    // the same bound and allowance (R-MINT-3): that token is the one refused and owed, and the canonical half is never sent.
    const fork = await inDO(r, (room) => room.core.workspaces.forkTokens.duties({ limit: 1000 }));
    expect(fork.records.map((x) => [x.purpose.split(":")[0], x.state])).toEqual([["pin-objects", "owed"]]);
    const duties = await inDO(r, (room) => room.core.mints.duties({ limit: 1000 }));
    expect(duties.records).toEqual([]);
  });
});
