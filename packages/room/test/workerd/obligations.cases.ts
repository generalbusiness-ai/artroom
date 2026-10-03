/**
 * Obligations and evidence (R-OBL), revocation (R-REV), carrying through the
 * policy port (R-CARRY, section 23 plan cases), and checks (R-OBL-3).
 */

import { describe, expect, it } from "vitest";
import type { Check, Claim, Landing, LogEntry, PolicyDocument, Proposal, Review, RosterRecord } from "@generalbusiness/artroom-contract";
import { policy, requireCheck, requireReview } from "@generalbusiness/artroom-policy/helpers";
import { digestJson } from "../../src/crypto.ts";
import { addMember, Client, expectOk, expectRefusal, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

const reviewPolicy = (extra: Parameters<typeof requireReview>[0] = { paths: "src/**", from: "role:maintainer", id: "code-review" }): PolicyDocument => policy(requireReview(extra));

async function proposeOn(room: TestRoom, who: Client, scope: string[], changes: Record<string, string | null>, opts: { lane?: string; gen?: number; parent?: string } = {}) {
  const lane = opts.lane ?? (await who.ok<Claim>("claim", null, { goal: "work", scope })).lane;
  const head = pushChange(room, lane as never, changes, opts.parent as never);
  const p = await who.ok<Proposal>("propose", { lane }, { lease: 1, expectedGeneration: opts.gen ?? 0, head, summary: "change" });
  return { lane: lane as Claim["lane"], head, p };
}

async function proposal(room: TestRoom, lane: string, generation: number): Promise<Proposal> {
  return (await room.admin.read({ q: "proposal", ref: { lane: lane as never, generation } }))!;
}

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

describe("R-OBL review obligations", () => {
  it("R-OBL-5: obligations come from require rules on actual changed paths; none when no path matches", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const a = await proposeOn(room, alice, ["src/**", "docs/**"], { "src/app.ts": "v2" });
    expect(a.p.obligations.map((o) => [o.id, o.state])).toEqual([["obl_code-review", "open"]]);
    const b = await proposeOn(room, alice, ["docs/**"], { "docs/a.md": "x" });
    expect(b.p.obligations).toEqual([]);
  });

  it("R-OBL-1: a review must name the generation's head (head-mismatch)", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const { lane } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    expectRefusal(await bob.act("review", { lane, generation: 1 }, { head: "f".repeat(40), verdict: "approve", scope: ["src/**"], text: "ok" }), "head-mismatch");
  });

  it("R-OBL-2: a reviewer who qualifies for nothing is not-authorized-reviewer; the author is self-review", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "maintainer");
    const carol = await addMember(room, "@carol", "member");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    expectRefusal(await carol.act("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" }), "not-authorized-reviewer");
    expectRefusal(await alice.act("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "mine" }), "self-review");
  });

  it("R-OBL-2: allowSelf takes effect only when every path is documentation", async () => {
    const room = await makeRoom({ policy: policy(requireReview({ paths: "**", from: "role:member", allowSelf: true, id: "any" })) });
    const alice = await addMember(room, "@alice", "member");
    const docs = await proposeOn(room, alice, ["docs/**"], { "docs/guide.md": "x" });
    expectOk(await alice.act("review", { lane: docs.lane, generation: 1 }, { head: docs.head, verdict: "approve", scope: ["docs/**"], text: "self, docs" }));
    const code = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "y" });
    expectRefusal(await alice.act("review", { lane: code.lane, generation: 1 }, { head: code.head, verdict: "approve", scope: ["src/**"], text: "self, code" }), "self-review");
  });

  it("R-OBL-4: count n needs n distinct members; R-OBL-6: met when enough", async () => {
    const room = await makeRoom({ policy: reviewPolicy({ paths: "src/**", from: "role:maintainer", count: 2, id: "two" }) });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const carol = await addMember(room, "@carol", "maintainer");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    const body = { head, verdict: "approve", scope: ["src/**"], text: "ok" };
    await bob.ok("review", { lane, generation: 1 }, body);
    await bob.ok("review", { lane, generation: 1 }, body);
    expect((await proposal(room, lane, 1)).obligations[0]!.state).toBe("open");
    const r = await carol.ok<Review>("review", { lane, generation: 1 }, body);
    expect(r.fulfils).toEqual([{ obligation: "obl_two", evidence: { basis: "here", act: r.id, kind: "review", generation: 1, head } }]);
    expect((await proposal(room, lane, 1)).obligations[0]!.state).toBe("met");
    expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head: "a".repeat(40) }), "head-mismatch");
  });

  it("R-LAND-1: land is refused obligation-open while a review obligation is open, naming it", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    const r = expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
    expect(r.reason).toContain("obl_code-review");
  });

  it("R-OBL-1: a review of an earlier generation is recorded as history and meets nothing on the new one", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const g1 = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    const head2 = pushChange(room, g1.lane, { "src/app.ts": "v3" }, g1.head);
    await alice.ok("propose", { lane: g1.lane }, { lease: 1, expectedGeneration: 1, head: head2, summary: "v3" });
    await bob.ok("review", { lane: g1.lane, generation: 1 }, { head: g1.head, verdict: "approve", scope: ["src/**"], text: "late" });
    expect((await proposal(room, g1.lane, 2)).obligations[0]!.state).toBe("open");
  });
});

describe("R-REV revocation and evidence", () => {
  it("section 23, Compromised reviewer's approval (R-REV-3): evidence stops counting, the obligation reopens, a pending landing becomes retryable", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    const review = await bob.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const landing = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    const rev = await room.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    expect(rev.invalidated).toEqual({ evidence: [review.id], reopened: [{ lane, generation: 1, obligation: "obl_code-review" }] });
    const ob = (await proposal(room, lane, 1)).obligations[0]!;
    expect(ob.state).toBe("open");
    expect(ob).toMatchObject({ reopened: { because: "key-compromised", key: bob.key, revocation: rev.id } });
    const op = await room.admin.read({ q: "op", op: landing.op.id });
    expect(op).toMatchObject({ state: "retryable", reason: "evidence-invalid" });
    expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
  });

  it("section 23, Reviewer retired after their review (R-REV-1, R-REV-2): the review still counts and the change lands", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    expect((await proposal(room, lane, 1)).obligations[0]!.state).toBe("met");
    const landing = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room, 3);
    expect(await room.admin.read({ q: "op", op: landing.op.id })).toMatchObject({ state: "landed" });
    expect(room.world.artifacts.main).toBe(head);
  });

  it("R-REV-2: under retiredEvidence reopens, a retired reviewer's approval stops counting", async () => {
    const doc = { ...reviewPolicy(), retiredEvidence: "reopens" as const };
    const room = await makeRoom({ policy: doc });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    expect((await proposal(room, lane, 1)).obligations[0]!.state).toBe("open");
  });

  it("R-REV-1: a later demotion of the reviewer does not reopen the obligation", async () => {
    const room = await makeRoom({ policy: reviewPolicy() });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    await room.admin.ok("roster", null, { op: "set-role", member: "@bob", role: "member" });
    expect((await proposal(room, lane, 1)).obligations[0]!.state).toBe("met");
  });

  it("R-REV-3: a compromised revocation revokes every delegation granted by or to the key", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const w = new Client(room, (await import("./support.ts")).newKeyPair());
    const grant = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: w.key, kinds: ["note"], lanes: "*", expiresAt: new Date(Date.UTC(2027, 0, 1)).toISOString() });
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    const roster = await room.admin.read({ q: "members" });
    expect(roster.delegations.find((d) => d.id === grant.id)!.revoked).toBeDefined();
  });
});

describe("Carrying through the policy port (section 23 plan cases)", () => {
  const carryRoom = (dependsOn: Record<string, string[]> = {}) =>
    makeRoom({ policy: policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" }), { part: "carry", carry: { dependsOn }, rules: [] }) });

  async function twoGenerations(room: TestRoom, review: { scope: string[]; dependsOn?: string[] }, second: Record<string, string>, scope = ["src/**", "package-lock.json"]) {
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const g1 = await proposeOn(room, alice, scope, { "src/a/x.ts": "1", "src/lib/authz/h.ts": "h1" });
    const r = await bob.ok<Review>("review", { lane: g1.lane, generation: 1 }, { head: g1.head, verdict: "approve", text: "ok", ...review });
    const head2 = pushChange(room, g1.lane, second, g1.head);
    const p2 = await alice.ok<Proposal>("propose", { lane: g1.lane }, { lease: 1, expectedGeneration: 1, head: head2, summary: "g2" });
    return { g1, r, p2 };
  }

  it("No declaration and no default (R-CARRY-1, R-CARRY-11): the verdict carries, shown as carried from generation 1", async () => {
    const room = await carryRoom();
    const { g1, r, p2 } = await twoGenerations(room, { scope: ["src/a/**"] }, { "src/b/y.ts": "new" });
    const ob = p2.obligations[0]!;
    expect(ob.state).toBe("met");
    expect(ob.evidence[0]).toMatchObject({ basis: "carried", act: r.id, kind: "review", from: { generation: 1, head: g1.head } });
    expect((ob.evidence[0] as { reason: { text: string } }).reason.text).toMatch(/^carried/);
  });

  it("Approval with dependsOn src/lib/authz/**, helper changes (R-CARRY-2, R-CARRY-5): not carried, listed with paths, obligation reopens", async () => {
    const room = await carryRoom();
    const { r, p2 } = await twoGenerations(room, { scope: ["src/a/**"], dependsOn: ["src/lib/authz/**"] }, { "src/lib/authz/h.ts": "h2" });
    expect(p2.obligations[0]!.state).toBe("open");
    expect(p2.notCarried).toEqual([expect.objectContaining({ act: r.id, code: "dependency-changed", paths: ["src/lib/authz/h.ts"] })]);
  });

});

describe("R-OBL-3 checks", () => {
  const unit = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 };

  async function checkRoom() {
    const room = await makeRoom({ policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })), files: { ".artroom/checkers/unit.json": JSON.stringify(unit) } });
    const alice = await addMember(room, "@alice", "member");
    const ci = await addMember(room, "@ci", "checker");
    const { lane, head } = await proposeOn(room, alice, ["src/**"], { "src/app.ts": "v2" });
    await tick(room);
    const p = await proposal(room, lane, 1);
    if (p.preview.state !== "clean") throw new Error("preview not clean");
    const integration = p.preview.integration;
    const tree = room.world.artifacts.commits.get(integration)!.tree;
    const body = { obligation: "obl_unit-tests", check: "unit", integration, input: { kind: "tree", tree }, config: digestJson(unit), runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "42 passed" };
    return { room, alice, ci, lane, head, body };
  }

  it("a check binding the preview integration, the active config digest and the tree meets the obligation", async () => {
    const { room, ci, lane, body } = await checkRoom();
    const c = await ci.ok<Check>("check", { lane, generation: 1 }, body);
    expect(c.ok).toBe(true);
    expect((await proposal(room, lane, 1)).obligations[0]!.state).toBe("met");
  });

  it("check-binding for a foreign integration, a stale config or another tree; not-authorized-checker outside `by`; role-forbids for a member", async () => {
    const { room, alice, ci, lane, body } = await checkRoom();
    expectRefusal(await room.admin.act("check", { lane, generation: 1 }, body), "not-authorized-checker");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, { ...body, integration: "1".repeat(40) }), "check-binding");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, { ...body, config: `sha256:${"2".repeat(64)}` }), "check-binding");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, { ...body, input: { kind: "tree", tree: "3".repeat(40) } }), "check-binding");
    expectRefusal(await ci.act("check", { lane, generation: 1 }, { ...body, obligation: "obl_nope" }), "obligation-unknown");
    expectRefusal(await alice.act("check", { lane, generation: 1 }, body), "role-forbids");
  });

  it("R-LAND-1: land is admitted with a check obligation open; preparation waits for the check, then lands", async () => {
    const { room, alice, ci, lane, head, body } = await checkRoom();
    const landing = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room, 2);
    expect(await room.admin.read({ q: "op", op: landing.op.id })).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    await ci.ok("check", { lane, generation: 1 }, body);
    await tick(room, 3);
    expect(await room.admin.read({ q: "op", op: landing.op.id })).toMatchObject({ state: "landed" });
  });

  it("a failing required check fails the landing with check-failed", async () => {
    const { room, alice, ci, lane, head, body } = await checkRoom();
    const landing = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room, 2);
    const failed = await ci.ok<Check>("check", { lane, generation: 1 }, { ...body, ok: false, detail: "1 failed" });
    await tick(room, 2);
    expect(await room.admin.read({ q: "op", op: landing.op.id })).toMatchObject({ state: "failed", reason: { code: "check-failed", check: failed.id } });
  });
});

void entries;
