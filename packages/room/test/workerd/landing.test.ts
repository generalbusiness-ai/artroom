/**
 * The Room's side of landing, with lane B's engine on the Room's SQLite and
 * a fake publisher sandbox: invalidation before reservation (R-LAND-6,
 * R-LAND-9), ordering after reservation (R-LAND-8, R-REV-7), the abort
 * attempt (R-REV-5, R-REV-6), the stage-specific land rule (R-POL-6,
 * R-LAND-4, R-LAND-7), configuration recovery and sole-admin approval
 * (R-ADMIN), recomputation after a policy activation (R-POL-9), and checks:
 * sealed carry judgments (R-CARRY-13 to R-CARRY-15), jobs over the checker's
 * service binding (R-EXEC-8 to R-EXEC-10) and advisory obligations (R-OBL-7).
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import type { Check, CheckBody, CheckerConfig, CheckerService, CheckJob, Claim, Landing, Lane, PolicyDocument, Proposal, Refusal, Review, RosterRecord, SystemEvent } from "@generalbusiness/artroom-contract";
import { policy, requireCheck, requireReview, rule } from "@generalbusiness/artroom-policy/helpers";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { encodeCommit, gitObject, verifyLog } from "@generalbusiness/artroom-log";
import type { SnapshotPort } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { obligationsFor } from "../../src/obligations.ts";
import type { ActivePolicyFull } from "../../src/core.ts";
import { snapshotCommit, snapshotMessage } from "../../src/snapshot.ts";
import { entries, events, hold, idOf, inDO, land, once, opOf as op, proposed, read } from "./core-support.ts";
import { addMember, call, Client, clock, configDigest, day, expectOk, expectRefusal, iso, makeRoom, newKeyPair, pushChange, tick, until, type TestRoom } from "./support.ts";

const reviewed = () => policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" }));

/** The reviewed policy with one land rule that blocks when `block` holds. */
const withLandRule = (block: string): PolicyDocument => ({
  ...reviewed(),
  rules: [...reviewed().rules.filter((r) => r.kind !== "land"), { id: "stage-rule", kind: "land", block, reason: "Blocked at this stage.", fix: "None." }],
});

/** `who` proposes a change under `scope`, and Bob approves it; returns what is needed to land. */
async function approvedLane(room: TestRoom, who: Client, bob: Client, area = "src") {
  const { lane, head } = await proposed(room, who, [`${area}/**`], { [`${area}/app.ts`]: "v2" });
  const review = await bob.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: [`${area}/**`], text: "ok" });
  return { lane, head, review };
}

/** A room under `doc` where Alice proposed a src change and Bob approved it. */
async function approved(doc: PolicyDocument = reviewed()) {
  const room = await makeRoom({ policy: doc });
  const alice = await addMember(room, "@alice", "member");
  const bob = await addMember(room, "@bob", "maintainer");
  return { room, alice, bob, ...(await approvedLane(room, alice, bob)) };
}

/** Activate a new policy version now, as an approved change to `.artroom/` would (R-PUB-9). */
const activate = (r: TestRoom, change: (p: ActivePolicyFull) => Pick<ActivePolicyFull, "doc" | "checkers">) =>
  inDO(r, (room) => {
    const next = change(room.core.activePolicy());
    room.core.sql.transaction(() => room.core.activate(next.doc, next.checkers, null, iso(clock.now)));
  });

describe("R-LAND-6, R-LAND-7 and R-LAND-9: a change before reservation ends the operation as retryable", () => {
  /** One room for these: no operation in it reaches reservation, so main never moves. */
  const shared = once(async () => {
    const room = await makeRoom({ policy: withLandRule("false") });
    return { room, alice: await addMember(room, "@alice", "member"), bob: await addMember(room, "@bob", "maintainer"), carol: await addMember(room, "@carol", "maintainer") };
  });
  let areas = 0;
  const lane = async (who?: Client) => {
    const s = await shared();
    const area = `src/part${++areas}`;
    return { ...s, area, ...(await approvedLane(s.room, who ?? s.alice, s.bob, area)) };
  };

  it("section 23, a release during preparation: retryable, reason released; a second land meanwhile is land-in-progress", async () => {
    const { room, alice, lane: id, head } = await lane();
    const l = await land(alice, id, head);
    expect(l.op).toMatchObject({ id: `op_land_${l.seq}`, state: "accepted" });
    expectRefusal(await alice.act("land", { lane: id, generation: 1 }, { lease: 1, head }), "land-in-progress");
    await alice.ok("release", { lane: id }, { lease: 1 });
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "released" });
    expect(events(await entries(room), "land-outcome").at(-1)!.event).toEqual({ type: "land-outcome", op: l.op.id, outcome: { state: "retryable", reason: "released" } });
  });

  it("section 23, a new generation during preparation: retryable, reason generation-moved", async () => {
    const { room, alice, area, lane: id, head } = await lane();
    const l = await land(alice, id, head);
    await tick(room);
    const head2 = pushChange(room, id, { [`${area}/app.ts`]: "v3" }, head);
    await alice.ok("propose", { lane: id }, { lease: 1, expectedGeneration: 1, head: head2, summary: "v3" });
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "generation-moved" });
  });

  it("section 23, Byte mismatch: a new objection between ready and reservation changes the land input; retryable, reason land-input-changed", async () => {
    const { room, alice, carol, lane: id, head } = await lane();
    const main = room.world.artifacts.main;
    const l = await land(alice, id, head);
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("ready");
    await carol.ok("review", { lane: id, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "land-input-changed" });
    expect(room.world.artifacts.main).toBe(main);
  });

  it("R-LAND-7: reservation judges the initiator's authority again; an initiator whose role no longer allows it is retryable, reason authority-lost", async () => {
    const { room } = await shared();
    const dave = await addMember(room, "@dave", "member");
    const { lane: id, head } = await lane(dave);
    const l = await land(dave, id, head);
    await tick(room);
    await room.admin.ok("roster", null, { op: "set-role", member: "@dave", role: "checker" });
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "authority-lost" });
  });
});

describe("R-POL-7: the default land rule", () => {
  it("an open objection refuses the land act itself (objection-open)", async () => {
    // The shared room above has no default land rule: its one land rule replaces them.
    const { room, alice, lane, head } = await approved();
    const carol = await addMember(room, "@carol", "maintainer");
    await carol.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
    expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head }), "objection-open");
  });
});

describe("R-POL-9, R-LAND-5: a policy activation during preparation", () => {
  it("section 23: the operation is prepared again under the new version and still lands; the activation is sealed right after the landing that caused it (R-PUB-9)", async () => {
    const { room, alice, lane, head } = await approved();
    // The admin changes the policy on another lane; it lands first.
    const ac = await room.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
    const ph = pushChange(room, ac.lane, { ".artroom/policy.json": JSON.stringify(reviewed()) + "\n" });
    await room.admin.ok("propose", { lane: ac.lane }, { lease: 1, expectedGeneration: 0, head: ph, summary: "same rules, new file" });
    const r = await room.admin.ok<Review>("review", { lane: ac.lane, generation: 1 }, { head: ph, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
    // R-ADMIN-2: the only admin approves its own configuration change, and the approval says so.
    expect(r.flags).toContain("sole-admin-self-approval");
    const adminLand = await land(room.admin, ac.lane, ph);
    const aliceLand = await land(alice, lane, head);
    await tick(room, 2);
    expect(await op(room, adminLand.op.id)).toMatchObject({ state: "landed" });
    const log = await entries(room);
    const outcome = events(log, "land-outcome").find((e) => e.event.op === adminLand.op.id)!;
    const activated = events(log, "policy-activated").at(-1)!;
    expect(activated.seq).toBe(outcome.seq + 1);
    expect((activated.event as unknown as { recomputed: { fenced: string[] } }).recomputed.fenced).toContain(aliceLand.op.id);
    await tick(room, 4);
    const final = await op(room, aliceLand.op.id);
    expect(final.state).toBe("landed");
    expect(final.policyVersion).toBe(activated.id);
    expect(final.attempts).toBeGreaterThanOrEqual(2);
  });

  it("section 23, Recompute after activation (R-POL-9): reopened 0 at activation; land is refused until an obligations-recomputed event lists the new obligation; a require rule that fails blocks landing", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "rv", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    await addMember(r, "@carol", "maintainer");
    const { lane, head } = await proposed(r, r.admin, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const next = policy(requireReview({ id: "rv", paths: "src/**", from: "@carol" }), requireReview({ id: "extra", paths: "src/**", from: "@carol" }));
    await activate(r, () => ({ doc: next, checkers: {} }));
    const activated = events(await entries(r), "policy-activated").at(-1)!;
    expect((activated.event as unknown as { recomputed: { reopened: number; proposals: number } }).recomputed).toMatchObject({ reopened: 0, proposals: 1 });
    expectRefusal(await r.admin.act("land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
    await tick(r);
    const recomputed = events(await entries(r), "obligations-recomputed").at(-1)!;
    expect(recomputed.seq).toBeGreaterThan(activated.seq);
    expect(recomputed.event).toMatchObject({ lane, generation: 1, obligations: ["obl_rv", "obl_extra"], reopened: ["obl_rv"], policy: activated.id });
    expect((recomputed.event as unknown as { decisions: unknown[] }).decisions.length).toBeGreaterThan(0);
    // A require rule whose condition fails deterministically blocks landing.
    await activate(r, () => ({ doc: policy(requireReview({ id: "rv", paths: "src/**", from: "@carol", when: "1" })), checkers: {} }));
    await tick(r);
    expect((events(await entries(r), "obligations-recomputed").at(-1)!.event as { blocked?: { rule: string } }).blocked?.rule).toBe("policy-type-error");
    expectRefusal(await r.admin.act("land", { lane, generation: 1 }, { lease: 1, head }), "policy-type-error");
  });

  it("R-POL-9: policy-activated names the checkers as name and digest pairs, sorted by name", async () => {
    const zeta: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 10 };
    const alpha: CheckerConfig = { format: "artroom-checker-v1", volatile: true, timeoutSeconds: 20 };
    const r = await makeRoom({ files: { ".artroom/checkers/zeta.json": JSON.stringify(zeta), ".artroom/checkers/alpha.json": JSON.stringify(alpha) } });
    expect((events(await entries(r), "policy-activated")[0]!.event as unknown as { checkers: unknown }).checkers).toEqual([
      { name: "alpha", config: configDigest(digestJson(alpha)) },
      { name: "zeta", config: configDigest(digestJson(zeta)) },
    ]);
  });
});

describe("R-LAND-8 and R-REV-7: acts admitted while a reservation is held", () => {
  /** Land up to a push that the sandbox holds in flight. */
  async function publishing() {
    const s = await approved();
    const l = await land(s.alice, s.lane, s.head);
    await tick(s.room);
    expect((await op(s.room, l.op.id)).state).toBe("ready");
    s.room.world.landing.controls.pausePush = true;
    // The alarm reserves and starts the push.
    const flight = tick(s.room);
    await until(async () => (await op(s.room, l.op.id)).state === "publishing");
    const finish = async () => {
      s.room.world.landing.controls.pausePush = false;
      await flight;
      await tick(s.room);
    };
    return { ...s, l, finish };
  }

  it("section 23, Paused push; a new generation, an objection, a retired key's revocation and a release: each is admitted with after; the landing completes", async () => {
    const { room, alice, bob, lane, head, l, finish } = await publishing();
    expect(events(await entries(room), "land-reserved").at(-1)!.event).toMatchObject({ op: l.op.id, lane, generation: 1, publication: 1 });
    const head2 = pushChange(room, lane, { "src/app.ts": "v3" }, head);
    const afterActs = [
      await alice.ok("propose", { lane }, { lease: 1, expectedGeneration: 1, head: head2, summary: "v3" }),
      await bob.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "wait" }),
      await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" }),
      await alice.ok("release", { lane }, { lease: 1 }),
    ];
    for (const a of afterActs) {
      expect(a.after).toBe(l.op.id);
      expect(a.flags).toContain("after-reservation");
    }
    await finish();
    expect(await op(room, l.op.id)).toMatchObject({ state: "landed", publication: 1 });
    expect(room.world.artifacts.main).toBe(head);
    expect(events(await entries(room), "land-outcome").filter((e) => e.event.op === l.op.id).map((e) => e.event.outcome.state)).toEqual(["landed"]);
    // After the slot is free, acts carry no `after`.
    expect((await room.admin.ok("note", { act: l.id }, { text: "done" })).after).toBeUndefined();
  });

  it("section 23, Paused push; a compromised key's revocation of evidence (R-REV-5, R-REV-6): an abort attempt is recorded at once; the push still lands; a revert lane opens", async () => {
    const { room, bob, review, head, l, finish } = await publishing();
    const rev = await room.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    expect(rev.after).toBe(l.op.id);
    expect(rev.invalidated).toMatchObject({ evidence: [review.id], abortAttempt: l.op.id });
    // The abort attempt runs beside the push in flight: it revokes the publication token and is recorded.
    await until(async () => events(await entries(room), "abort-attempt").length > 0);
    expect(events(await entries(room), "abort-attempt").at(-1)!.event).toMatchObject({ op: l.op.id, attempt: { trigger: rev.id, key: bob.key, tokenRevoked: true } });
    expect((await op(room, l.op.id)).state).toBe("publishing");
    // The held push completes after all: revoking its token did not stop it, and the outcome is what happened.
    await finish();
    const done = await op(room, l.op.id);
    expect(done.state).toBe("landed");
    expect(room.world.artifacts.main).toBe(head);
    const revert = events(await entries(room), "revert-lane").at(-1)!;
    expect(revert.event).toEqual({ type: "revert-lane", of: l.op.id, scope: ["src/app.ts"], reason: "abort-after-landing" });
    expect((done as { revertLane?: string }).revertLane).toBe(revert.id);
    expect((await read(room, { q: "lane", lane: revert.id as never })) as Lane).toMatchObject({ state: "unheld", why: "opened-by-room", revertOf: l.op.id, scope: ["src/app.ts"] });
    expect((await read(room, { q: "attention" })).items.some((i) => i.why === "revert-lane")).toBe(true);
  });

  it("R-REV-5: with no push that can still land, the abort attempt ends in aborted and frees the slot", async () => {
    const { room, alice, bob, lane, head } = await approved();
    const l = await land(alice, lane, head);
    await tick(room);
    // A push that failed before anything was sent: nothing can still land.
    room.world.landing.controls.errorPushes = 1;
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("unresolved");
    expect(events(await entries(room), "publication-unresolved").length).toBe(1);
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "aborted", abort: { key: bob.key } });
    expect(room.world.artifacts.main).not.toBe(head);
  });
});

describe("R-POL-6, R-LAND-4: the stage-specific land rule, and its sealed land-evaluated event", () => {
  /** The one land-evaluated event of an operation, with the land-outcome that follows it. */
  async function evaluated(room: TestRoom, l: Landing) {
    const log = await entries(room);
    const evs = events(log, "land-evaluated");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.event).toMatchObject({ op: l.op.id, decisions: [expect.objectContaining({ rule: "stage-rule", kind: "land" })] });
    expect((evs[0]!.event as unknown as { landInput: string }).landInput).toMatch(/^sha256:[0-9a-f]{64}$/);
    const outcome = events(log, "land-outcome").at(-1)!;
    expect(outcome.seq).toBeGreaterThan(evs[0]!.seq);
    return outcome.event.outcome.state;
  }

  it("section 23: a rule that blocks only at stage reservation passes at admission, then fails preparation; the operation is never ready", async () => {
    const { room, alice, lane, head } = await approved(withLandRule('stage = "reservation"'));
    const l = await land(alice, lane, head);
    const decisions = ((await entries(room)).find((e) => e.seq === l.seq)!.entry as unknown as { receipt: { decisions: { rule: string; kind: string; outcome: { result: string } }[] } }).receipt.decisions;
    expect(decisions.find((d) => d.rule === "stage-rule")).toMatchObject({ kind: "land", outcome: { result: "pass" } });
    await tick(room, 3);
    expect(await op(room, l.op.id)).toMatchObject({ state: "failed", reason: { code: "refused", refusal: { rule: "stage-rule" } } });
    expect(room.world.artifacts.main).not.toBe(head);
    expect(await evaluated(room, l)).toBe("failed");
  });

  it("section 23: a rule that passes at both stages: ready with a land input digest, and unchanged state builds the same bytes at reservation and lands", async () => {
    const { room, alice, lane, head } = await approved(withLandRule("false"));
    const l = await land(alice, lane, head);
    await tick(room);
    const ready = await op(room, l.op.id);
    expect(ready.state).toBe("ready");
    expect((ready as { landInput?: string }).landInput).toMatch(/^sha256:[0-9a-f]{64}$/);
    await tick(room, 2);
    expect((await op(room, l.op.id)).state).toBe("landed");
    expect(await evaluated(room, l)).toBe("landed");
  });
});

describe("R-ADMIN configuration recovery and sole-admin approval", () => {
  const lockout = policy(
    rule({ id: "freeze", on: ["claim", "propose", "note", "review", "land", "release", "renew"], refuse: "true", fix: "Nothing can be done." }),
    rule({ id: "never-land", kind: "land", block: "true", reason: "Frozen.", fix: "None." }),
  );
  /** The lockout, plus a require rule nobody can meet: neither may apply on a recovery lane. */
  const strict: PolicyDocument = { ...lockout, rules: [...lockout.rules, ...policy(requireReview({ paths: ".artroom/**", from: "@nobody", id: "impossible" })).rules.filter((r) => r.kind === "require")] };

  async function recoveryLane(room: TestRoom, admin: Client) {
    const claim = await admin.ok<Claim>("claim", null, { goal: "Restore a working policy", scope: [".artroom/policy.json"], purpose: "config-recovery" });
    expectOk(await admin.request<{ id: string }>({ kind: "workspace", lane: claim.lane, lease: 1 }));
    await tick(room);
    expectOk(await admin.request({ kind: "workspace-token", lane: claim.lane, lease: 1 }));
    return claim;
  }

  it("section 23, Policy lockout (R-ADMIN-5 to R-ADMIN-9): the sole admin repairs the policy through a configuration-recovery lane that no policy rule judges, whatever the policy port does with the lane's purpose; policy-activated follows", async () => {
    const room = await makeRoom({ policy: strict });
    // A port that ignores the purpose: only the Room's own rule keeps policy off the recovery lane.
    room.world.policy.ignorePurpose = true;
    const bob = await addMember(room, "@bob", "member");
    // The lockout holds for ordinary work.
    expectRefusal(await bob.act("claim", null, { goal: "g", scope: ["src/**"] }), "freeze");
    // A recovery claim needs an admin's own key: not a member's, and not a key an admin delegated to.
    expectRefusal(await bob.act("claim", null, { goal: "g", scope: [".artroom/policy.json"], purpose: "config-recovery" }), "admin-required");
    const dk = newKeyPair();
    const grant = await room.admin.ok<RosterRecord>("roster", null, { op: "delegate", to: dk.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
    expectRefusal(await new Client(room, dk, grant.id).act("claim", null, { goal: "g", scope: [".artroom/policy.json"], purpose: "config-recovery" }), "admin-required");

    const claim = await recoveryLane(room, room.admin);
    expect(claim.flags).toContain("config-recovery");
    expect(claim.purpose).toBe("config-recovery");
    // A recovery proposal that also changes src/x.ts is refused recovery-scope.
    const bad = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()), "src/x.ts": "x" });
    expectRefusal(await room.admin.act("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head: bad, summary: "too much" }), "recovery-scope");
    const head = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()) });
    const p = await room.admin.ok<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "Replace the frozen policy." });
    expect(p.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
    const review = await room.admin.ok<Review>("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "Restores the default rules." });
    expect(review.flags).toEqual(expect.arrayContaining(["config-recovery", "sole-admin-self-approval"]));
    const l = await land(room.admin, claim.lane, head);
    expect(l.flags).toContain("config-recovery");
    // No policy decision is recorded for the recovery-lane acts.
    const log = await entries(room);
    for (const id of [claim.id, p.id, review.id, l.id]) expect((log.find((x) => idOf(x) === id)!.entry as unknown as { receipt: { decisions: unknown[] } }).receipt.decisions).toEqual([]);
    await tick(room, 3);
    expect(await op(room, l.op.id)).toMatchObject({ state: "landed" });
    const after = await entries(room);
    const activated = events(after, "policy-activated").at(-1)!;
    expect(activated.seq).toBe(events(after, "land-outcome").at(-1)!.seq + 1);
    expect((activated.event as unknown as { commit: string }).commit).toBe(head);
    // The frozen policy is gone.
    expectOk(await bob.act("claim", null, { goal: "back to work", scope: ["src/**"] }));
  });

  it("section 23, Same lockout, two admins (R-ADMIN-5, R-ADMIN-7): the author's own approval is self-review, and the other admin's meets obl_admin-approval; a non-admin can neither act on the recovery lane nor take it over", async () => {
    const room = await makeRoom({ policy: lockout });
    const admin2 = await addMember(room, "@admin2", "admin");
    const bob = await addMember(room, "@bob", "member");
    const claim = await recoveryLane(room, room.admin);
    expectRefusal(await bob.act("note", { act: claim.id }, { text: "hi" }), "admin-required");
    const head = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()) });
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "repair" });
    expectRefusal(await room.admin.act("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "mine" }), "self-review");
    const r = await admin2.ok<Review>("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    expect(r.flags).not.toContain("sole-admin-self-approval");
    expect((await read(room, { q: "proposal", ref: { lane: claim.lane, generation: 1 } }))!.obligations[0]).toMatchObject({ id: "obl_admin-approval", state: "met" });
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    expectRefusal(await bob.act("claim", { lane: claim.lane }, { scope: [".artroom/policy.json"], expectedGeneration: 1 }), "admin-required");
  });

  it("section 23, Sole admin changes policy (R-ADMIN-2): if a second admin joins before reservation, the flagged self-approval stops counting", async () => {
    const room = await makeRoom();
    const { lane, head } = await proposed(room, room.admin, [".artroom/**"], { ".artroom/policy.json": JSON.stringify(reviewed()) });
    const r = await room.admin.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
    expect(r.flags).toContain("sole-admin-self-approval");
    const l = await land(room.admin, lane, head);
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("ready");
    await addMember(room, "@second", "admin");
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "obligation-open" });
  });
});

// ------------------------------------------------------------------ checks (contract amendment 3, section 29)

type CheckCarried = Extract<SystemEvent, { type: "check-carried" }>;
const carriedEvents = async (r: TestRoom) => events(await entries(r), "check-carried").map((e) => ({ seq: e.seq, id: e.id, ...(e.event as CheckCarried) }));

const R = `sha256:${"0".repeat(64)}` as const;
const S = `sha256:${"9".repeat(64)}` as const;
/** Scoped, non-volatile, pinned to R. */
const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60, runner: R };
/** Whole tree, non-volatile, pinned to R. */
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const advisory: CheckerConfig = { ...whole, advisory: true };
const allowChecks = (allow: string) => ({ id: "checks", kind: "carry" as const, evidence: "check" as const, allow });

/** A room whose policy requires the `unit` check of `cfg` by @ci on src changes. */
async function checkRoom(cfg: CheckerConfig, rules: PolicyDocument["rules"] = []) {
  const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
  const doc: PolicyDocument = { ...base, rules: [...base.rules, ...rules] };
  // package.json is a global input: a scoped runner always receives it (R-CARRY-8).
  const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
  return { r, doc, alice: await addMember(r, "@alice", "member"), bob: await addMember(r, "@bob", "member"), ci: await addMember(r, "@ci", "checker") };
}

const srcChange = (r: TestRoom, who: Client) => proposed(r, who, ["src/**"], { "src/app.ts": "v2" });

function entriesOf(r: TestRoom, integration: string): SnapshotEntry[] {
  return [...r.world.artifacts.blobs(integration as never)].map(([p, b]) => [p, "100644", b] as const);
}

/** The check body a checker signs: its input is the integration's tree, or the scoped snapshot of it. */
async function bodyFor(r: TestRoom, cfg: CheckerConfig, doc: PolicyDocument, integration: string, extra: Partial<CheckBody> = {}) {
  const paths = checkerInputs(cfg.inputs, doc.carry);
  const input = paths ? { kind: "filtered", snapshot: await snapshotDigest(filterSnapshot(entriesOf(r, integration), paths)), paths } : { kind: "tree", tree: r.world.artifacts.treeOf(integration as never) };
  return { obligation: "obl_unit-tests", check: "unit", integration, input, config: digestJson(cfg), runner: cfg.runner ?? R, volatile: cfg.volatile, ok: true, detail: "42 passed", ...extra };
}

/**
 * Bob's docs landing moves main after Alice's check passed on her first integration I1; her landing is prepared
 * again on I2, and the Room judges carrying her check onto it. `setup` runs once the room has its members.
 */
async function carryCase(cfg: CheckerConfig, rules: PolicyDocument["rules"] = [], setup?: (t: Awaited<ReturnType<typeof checkRoom>>) => void) {
  const t = await checkRoom(cfg, rules);
  setup?.(t);
  const { r, doc, alice, bob, ci } = t;
  const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more docs" });
  const first = await land(bob, other.lane, other.head);
  const mine = await srcChange(r, alice);
  const l = await land(alice, mine.lane, mine.head);
  await tick(r);
  const i1 = (await op(r, l.op.id)).integration!;
  const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, cfg, doc, i1));
  await tick(r, 4);
  expect(await op(r, first.op.id)).toMatchObject({ state: "landed" });
  return { ...t, l, mine, i1, check, after: await op(r, l.op.id) };
}

/**
 * Like `carryCase`, but the engine is driven step by step, so Alice's landing stops at ready, unreserved, with
 * her check carried onto I2. `beforeI2` runs after main moved, before her landing is prepared on I2.
 */
async function carriedAndReady(beforeI2?: (r: TestRoom) => Promise<void>) {
  const t = await checkRoom(scoped);
  const { r, doc, alice, bob, ci } = t;
  await hold(r, "landing", "recompute");
  const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
  const first = await land(bob, other.lane, other.head);
  const mine = await srcChange(r, alice);
  const l = await land(alice, mine.lane, mine.head);
  await inDO(r, async (room) => {
    await room.core.landing.prepare(first.op.id);
    await room.core.landing.prepare(l.op.id);
  });
  const i1 = (await op(r, l.op.id)).integration!;
  const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, scoped, doc, i1));
  await inDO(r, async (room) => {
    room.core.sql.transaction(() => room.core.landing.reserve(first.op.id));
    await room.core.landing.publish();
    await room.core.landing.refreshMain();
  });
  await beforeI2?.(r);
  await inDO(r, (room) => room.core.landing.prepare(l.op.id));
  const ready = await op(r, l.op.id);
  if (!beforeI2) expect(ready.state).toBe("ready");
  return { ...t, l, mine, i1, check, ready };
}

const statusOn = (r: TestRoom, lane: string, integration: string) =>
  inDO(r, (room) => {
    const p = room.core.activePolicy();
    return obligationsFor(room.core.sql, lane, 1, { doc: p.doc, checkers: p.checkers, integration: integration as never })[0]!;
  });

/** Let the work a commit started finish, such as the proposal's preview. */
const settled = (r: TestRoom) => inDO(r, (room) => room.core.idle());

/** A checker service as a service binding gives it (R-EXEC-8). It records each job and answers as told. */
function checkerService(r: TestRoom, ci: Client, answer: (job: CheckJob) => Partial<CheckBody> | "refuse" = () => ({})) {
  const seen: { job: CheckJob; tokenLive: boolean }[] = [];
  const service: CheckerService = {
    async handle(job) {
      const token = /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
      seen.push({ job, tokenLive: r.world.artifacts.canonicalRepo().admits(token, "read") });
      const a = answer(job);
      if (a === "refuse") return { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" } satisfies Refusal;
      // The service signs the check outside the runner and submits it to the room (lane G's Checker does the same).
      const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never;
      const signer = new Client({ id: r.id, stub }, ci.keys);
      const body = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}), ...a };
      return signer.act<Check>("check", { lane: job.lane, generation: job.generation }, body);
    },
  };
  r.world.checkers["unit"] = service;
  return seen;
}

/** Snapshot repositories in place of the Room's own, to steer the commit written; `wrong` makes the publisher write another identity. */
function snapshotRepos(r: TestRoom, mode: { wrong: boolean }) {
  const prepared: string[] = [];
  const repos: SnapshotPort = {
    async prepare(s) {
      prepared.push(s.commit);
      const files = filterSnapshot(entriesOf(r, s.integration), s.paths);
      const right = snapshotCommit(files, s.checker, s.digest);
      const tree = right.objects.at(-2)!.sha;
      const who = "Sandbox Git <git@sandbox.invalid> 1700000000 +0000";
      const commit = mode.wrong ? gitObject("commit", encodeCommit({ tree, parents: [], author: who, committer: who, message: snapshotMessage(s.checker, s.digest) })).sha : right.commit;
      return { commit, remote: `https://artifacts.test/artroom-public/snap-${commit}.git` };
    },
    async mint(_commit, _job, deadline) {
      return { token: "art_v1_snapshotjobtoken0000", expiresAt: deadline };
    },
    async end() {
      return 0;
    },
  };
  r.world.snapshots = repos;
  return prepared;
}

describe("R-CARRY-13: every check carry judgment is a sealed check-carried event", () => {
  it("R-CARRY-13, R-LOG-10 a carry rule refuses the check: a notCarried event with the decision, and a new job for I2; after an activation that allows it, a second event carries it under the new version, and the carry counts with that event; artroom verify replays every decision", async () => {
    let seen: { job: CheckJob }[] = [];
    const { r, l, mine, after, check } = await carryCase(scoped, [allowChecks("false")], ({ r, ci }) => {
      // The checker has a service and snapshot repositories; it answers no job, so only the test's check is recorded.
      snapshotRepos(r, { wrong: false });
      seen = checkerService(r, ci, () => "refuse");
    });
    expect(after).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    let evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ integration: after.integration, act: check.id, outcome: { carried: false, notCarried: { act: check.id, code: "policy-rejected", rule: "checks" } } });
    expect(evs[0]!.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["checks", "no-carry"]]);
    // The landing had one job for I1, and a new one for I2: it names the snapshot commit the Room recorded for I2, the
    // landing, and I2's base. (Its previews had jobs of their own.)
    const rec = await inDO(r, (room) => room.core.sql.all("SELECT commit_sha, digest FROM check_snapshots WHERE integration = ?", after.integration!)[0]!);
    const jobs = seen.filter((s) => s.job.landOp === after.id);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.job.base).not.toBe(after.expectedMain);
    expect(jobs[1]!.job).toMatchObject({ integration: rec["commit_sha"], landOp: after.id, base: after.expectedMain, input: { kind: "filtered", snapshot: rec["digest"] } });

    // An activation whose carry rule allows it: the check is judged again, and carried.
    await activate(r, (p) => ({ doc: { ...p.doc, rules: [...p.doc.rules.filter((x) => x.id !== "checks"), allowChecks("true")] }, checkers: p.checkers }));
    await tick(r, 4);
    const done = await op(r, l.op.id);
    expect(done).toMatchObject({ state: "landed" });
    evs = await carriedEvents(r);
    expect(evs.map((e) => [e.act, e.outcome.carried, e.lane, e.decisions.length])).toEqual([
      [check.id, false, mine.lane, 1],
      [check.id, true, mine.lane, 1],
    ]);
    const ev = evs[1]!;
    expect(ev).toMatchObject({ op: done.id, generation: 1, integration: done.integration, obligation: "obl_unit-tests", outcome: { carried: true, reason: { code: "snapshot-identical", runner: R } } });
    expect(ev.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["checks", "carry"]]);
    expect(ev.policy).not.toBe(evs[0]!.policy);
    // The stored carry names its event, and the evidence shows the rule.
    expect(await inDO(r, (room) => room.core.sql.all("SELECT event, policy FROM check_carries"))).toEqual([{ event: ev.id, policy: ev.policy }]);
    expect((await statusOn(r, mine.lane, done.integration!)).evidence).toEqual([expect.objectContaining({ basis: "carried", act: check.id, rules: ["checks"] })]);

    const p = await call<{ through: number }>(r.stub.publishLog());
    const report = await verifyLog(r.world.artifacts.canonicalRepo());
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, verifiedThrough: p.through });
    const recorded = (await entries(r)).reduce((n, e) => {
      const x = e.entry as unknown as { receipt?: { decisions?: unknown[] }; event?: { decisions?: unknown[] } };
      return n + (x.receipt?.decisions?.length ?? 0) + (x.event?.decisions?.length ?? 0);
    }, 0);
    expect(report.decisionsReplayed).toBe(recorded);
  });

  it("R-CARRY-13 a policy activation after the carry: the carry stops counting, and the next judgment is a new event under the new version; a stored carry without its sealed event never counts", async () => {
    const { r, l, mine, ready, check } = await carriedAndReady();
    const before = await carriedEvents(r);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ act: check.id, outcome: { carried: true } });
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("met");
    await activate(r, (p) => ({ doc: p.doc, checkers: p.checkers }));
    expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("open");
    await inDO(r, async (room) => {
      await room.core.recompute();
      await room.core.landing.prepare(l.op.id);
      await room.core.landing.evaluate(l.op.id);
    });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(2);
    expect(evs[1]).toMatchObject({ act: check.id, outcome: { carried: true } });
    expect(evs[1]!.policy).not.toBe(evs[0]!.policy);
    expect(evs[1]!.policy).toBe(await inDO(r, (room) => room.core.activePolicy().version));
    const integration = (await op(r, l.op.id)).integration!;
    expect((await statusOn(r, mine.lane, integration)).state).toBe("met");
    // Fail closed: as a Room that sealed no event would have stored the carry (and as rows from before this rule are).
    await inDO(r, (room) => room.core.sql.all("UPDATE check_carries SET event = NULL"));
    expect((await statusOn(r, mine.lane, integration)).state).toBe("open");
  });
});

describe("R-CARRY-14, R-CARRY-15: the runner pin, and a filtered job only for the recorded commit", () => {
  it("R-CARRY-14 the pin changes from R to S by an approved change; a check made under R is judged against the current pin and does not carry, and the judgment is not sealed twice", async () => {
    const pinS = { ...scoped, runner: S };
    const { r, ready, check } = await carriedAndReady(async (r) => {
      await activate(r, (p) => ({ doc: p.doc, checkers: { unit: { config: pinS, digest: digestJson(pinS) } } }));
      await inDO(r, (room) => room.core.recompute());
    });
    expect(ready).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ integration: ready.integration, act: check.id, outcome: { carried: false, notCarried: { code: "config-changed" } }, decisions: [] });
    expect(evs[0]!.policy).toBe(await inDO(r, (room) => room.core.activePolicy().version));
    expect(await inDO(r, (room) => room.core.sql.all("SELECT 1 FROM check_carries"))).toEqual([]);
    // Readiness again on the same integration and policy: the judgment stands, and is not sealed twice.
    await inDO(r, (room) => room.core.landing.evaluate(ready.id as never));
    expect(await carriedEvents(r)).toHaveLength(1);
  });

  it("R-CARRY-14 no runner pinned: the check never carries (runner-changed), though a carry rule allows it; a check on I2 itself meets the obligation, with any runner", async () => {
    const { runner: _pin, ...unpinned } = scoped;
    void _pin;
    const { r, doc, ci, mine, after, check } = await carryCase(unpinned, [allowChecks("true")]);
    expect(after).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    const evs = await carriedEvents(r);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ act: check.id, outcome: { carried: false, notCarried: { act: check.id, code: "runner-changed", text: "No runner environment is pinned" } }, decisions: [] });
    await ci.ok("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, unpinned, doc, after.integration!, { runner: S }));
    await tick(r, 3);
    expect(await op(r, after.id)).toMatchObject({ state: "landed" });
  });

  it("R-CARRY-15 the publisher writes the snapshot with another identity: its ID differs and no job is issued; once it writes the recorded commit, the job is issued for it (R-CARRY-16 is in snapshot-repos.test.ts)", async () => {
    const { r, alice, ci } = await checkRoom(scoped);
    const mode = { wrong: true };
    const { lane, head } = await srcChange(r, alice);
    // Bound once the preview is computed: this test follows the landing's job.
    await settled(r);
    const prepared = snapshotRepos(r, mode);
    const seen = checkerService(r, ci);
    const l = await land(alice, lane, head);
    await tick(r, 2);
    const integration = (await op(r, l.op.id)).integration!;
    const rec = await inDO(r, (room) => room.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", integration)[0]!);
    expect(prepared.length).toBeGreaterThan(0);
    expect(new Set(prepared)).toEqual(new Set([rec["commit_sha"]]));
    expect(seen).toEqual([]);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state FROM check_jobs"))).toEqual([{ state: "owed" }]);
    mode.wrong = false;
    clock.now += 600_000;
    await tick(r, 3);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.job).toMatchObject({
      integration: rec["commit_sha"],
      input: { kind: "filtered", snapshot: rec["digest"], paths: JSON.parse(rec["paths"] as string) },
      readUrl: `https://artifacts.test/artroom-public/snap-${String(rec["commit_sha"])}.git`,
      landOp: l.op.id,
    });
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed", integration });
  });
});

describe("R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding", () => {
  it("R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job carries base, volatile, advisory, runner and a GitAuthEnv with a read token for the canonical repository, revoked after the answer", async () => {
    const { r, alice, ci } = await checkRoom(whole);
    const { lane, head } = await srcChange(r, alice);
    await settled(r);
    const seen = checkerService(r, ci);
    const l = await land(alice, lane, head);
    await tick(r, 3);
    const done = await op(r, l.op.id);
    expect(done).toMatchObject({ state: "landed" });
    // One job, for the landing's integration, before anything else was asked of the checker.
    const jobs = seen.filter((s) => s.job.landOp === l.op.id);
    expect(jobs).toHaveLength(1);
    const { job, tokenLive } = jobs[0]!;
    const canonical = r.world.artifacts.canonicalRepo();
    expect(job).toMatchObject({
      room: r.id,
      lane,
      generation: 1,
      head,
      obligation: "obl_unit-tests",
      check: "unit",
      integration: done.integration,
      base: done.expectedMain,
      input: { kind: "tree", tree: r.world.artifacts.treeOf(done.integration as never) },
      readUrl: canonical.remote,
      config: configDigest(digestJson(whole)),
      volatile: false,
      advisory: false,
      runner: R,
    });
    expect(Object.keys(job.gitAuthEnv).sort()).toEqual(["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]);
    expect(job.gitAuthEnv).toMatchObject({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader" });
    expect(tokenLive).toBe(true);
    const token = /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
    const minted = [...canonical.tokens.values()].find((t) => t.plaintext === token)!;
    expect(minted.scope).toBe("read");
    // The token expires before the job's deadline, by Room's margin (review 90f30a3b).
    expect(minted.expiresAt).toBeLessThanOrEqual(Date.parse(job.deadline));
    expect(canonical.admits(token, "read")).toBe(false);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state, outcome FROM check_jobs WHERE id || '_' || attempt = ?", job.id))).toEqual([{ state: "done", outcome: expect.stringMatching(/^act_/) }]);
  });

  /** A landing prepared step by step, with its job owed but not yet issued: the landing and jobs steps are held. */
  async function owedJob() {
    const { r, doc, alice, ci } = await checkRoom(whole);
    await hold(r, "landing", "jobs");
    const { lane, head } = await srcChange(r, alice);
    await settled(r);
    const seen = checkerService(r, ci);
    const l = await land(alice, lane, head);
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    const waiting = await op(r, l.op.id);
    expect(waiting).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    expect(await inDO(r, (room) => room.core.sql.all("SELECT state FROM check_jobs"))).toEqual([{ state: "owed" }]);
    const issue = () =>
      inDO(r, async (room) => {
        await room.core.steps.jobs();
        await room.core.idle();
        return room.core.sql.all("SELECT state, outcome FROM check_jobs");
      });
    return { r, doc, alice, ci, seen, lane, l, waiting, issue };
  }

  it("R-EXEC-8 a job is not issued once its landing has ended", async () => {
    const { alice, seen, lane, l, r, issue } = await owedJob();
    await alice.ok("release", { lane }, { lease: 1 });
    expect((await op(r, l.op.id)).state).not.toMatch(/^(accepted|preparing|ready)$/);
    expect(await issue()).toEqual([{ state: "done", outcome: "not-needed" }]);
    expect(seen).toEqual([]);
  });

  it("R-EXEC-8 a job is not issued once its obligation is met on the integration", async () => {
    const { r, doc, ci, seen, lane, l, waiting, issue } = await owedJob();
    await ci.ok("check", { lane, generation: 1 }, { ...(await bodyFor(r, whole, doc, waiting.integration!)), landOp: l.op.id });
    expect(await issue()).toEqual([{ state: "done", outcome: "not-needed" }]);
    expect(seen).toEqual([]);
  });

  it("R-EXEC-10 the job's volatile is the configuration's; a check that says otherwise is check-binding and leaves no evidence, and one that agrees is admitted", async () => {
    const cfg: CheckerConfig = { ...whole, volatile: true };
    const { r, alice, ci } = await checkRoom(cfg);
    let flip = true;
    const { lane, head } = await srcChange(r, alice);
    await settled(r);
    const seen = checkerService(r, ci, (job) => (flip ? { volatile: !job.volatile } : {}));
    const l = await land(alice, lane, head);
    await tick(r, 2);
    const first = seen.find((s) => s.job.landOp === l.op.id)!.job;
    expect(first.volatile).toBe(true);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT outcome FROM check_jobs WHERE id || '_' || attempt = ?", first.id))).toEqual([{ outcome: "refused: check-binding" }]);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT act FROM evidence WHERE kind = 'check'"))).toEqual([]);
    flip = false;
    const integration = (await op(r, l.op.id)).integration!;
    expectOk(await ci.act("check", { lane, generation: 1 }, { ...(await bodyFor(r, cfg, policy(), integration)), landOp: l.op.id }));
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
  });
});

describe("R-OBL-7: advisory obligations never block a landing", () => {
  const obligationOf = async (r: TestRoom, lane: string) => (await read(r, { q: "proposal", ref: { lane: lane as never, generation: 1 } }))!.obligations.find((o) => o.id === "obl_unit-tests")!;

  it("R-OBL-7 the obligation is advisory by its configuration: its job is still issued, and a failing check on the landing's integration is recorded while the landing proceeds; obligation-open is never raised for it", async () => {
    const { r, alice, ci } = await checkRoom(advisory);
    const seen = checkerService(r, ci, () => ({ ok: false, detail: "3 failed" }));
    const { lane, head } = await srcChange(r, alice);
    expect(await obligationOf(r, lane)).toMatchObject({ kind: "check", advisory: true });
    const l = await land(alice, lane, head);
    await tick(r, 3);
    const done = await op(r, l.op.id);
    expect(done).toMatchObject({ state: "landed" });
    expect(r.world.artifacts.main).toBe(head);
    expect(seen.map((s) => s.job)).toContainEqual(expect.objectContaining({ landOp: l.op.id, advisory: true }));
    const log = await entries(r);
    const failing = log.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "check" && (e.entry.act.envelope.body as CheckBody).ok === false);
    expect(failing.some((e) => (e.entry as { act: { envelope: { body: CheckBody } } }).act.envelope.body.integration === done.integration)).toBe(true);
    expect(JSON.stringify(log)).not.toMatch(/obligation-open|check-failed/);
  });

  it("R-OBL-7, R-REV-3 a landing does not rely on advisory evidence: a passing advisory check between readiness and reservation leaves the land input as it was, and the checker's key compromised before reservation reopens the obligation without stopping the landing", async () => {
    const { r, doc, alice, ci } = await checkRoom(advisory);
    await hold(r, "landing");
    const { lane, head } = await srcChange(r, alice);
    const l = await land(alice, lane, head);
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    const ready = await op(r, l.op.id);
    expect(ready.state).toBe("ready");
    const retained = () => inDO(r, (room) => room.core.landing.core.get(l.op.id)!.retained!.digest);
    const input = await retained();
    // The advisory check passes and readiness is evaluated again: it is shown as met, but the landing does not rely on it.
    await ci.ok("check", { lane, generation: 1 }, await bodyFor(r, advisory, doc, ready.integration!));
    await inDO(r, (room) => room.core.landing.evaluate(l.op.id));
    expect(await obligationOf(r, lane)).toMatchObject({ advisory: true, state: "met" });
    expect(await retained()).toBe(input);
    const revoked = await r.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: ci.key, reason: "compromised" });
    expect(revoked.invalidated?.reopened).toEqual([{ lane, generation: 1, obligation: "obl_unit-tests" }]);
    expect(await op(r, l.op.id)).toMatchObject({ state: "ready" });
    expect(await inDO(r, (room) => room.core.sql.transaction(() => room.core.landing.reserve(l.op.id)))).toMatchObject({ kind: "reserved" });
  });

  it("R-EXEC-8, R-CARRY-14, R-OBL-7, R-POL-9 with no service binding no job is owed, and the landing waits for a check; a check stating another runner than the pin is check-binding; an activation that makes the checker advisory lets the waiting landing proceed", async () => {
    const { r, doc, alice, ci } = await checkRoom(whole);
    const { lane, head } = await srcChange(r, alice);
    const l = await land(alice, lane, head);
    await tick(r, 2);
    const waiting = await op(r, l.op.id);
    expect(waiting).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    expect(await inDO(r, (room) => room.core.sql.all("SELECT id FROM check_jobs"))).toEqual([]);
    expect(await obligationOf(r, lane)).not.toHaveProperty("advisory");
    expect(expectRefusal(await ci.act("check", { lane, generation: 1 }, await bodyFor(r, whole, doc, waiting.integration!, { runner: S })), "check-binding").reason).toMatch(/pins/);
    await activate(r, (p) => ({ doc: p.doc, checkers: { unit: { config: advisory, digest: digestJson(advisory) } } }));
    await tick(r, 4);
    expect(await obligationOf(r, lane)).toMatchObject({ advisory: true });
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
  });
});
