/**
 * The Room's side of landing, with the in-memory engine standing in for lane
 * B's: admission of `land` (R-LAND-1), invalidation before reservation
 * (R-LAND-6, R-LAND-9), ordering after reservation (R-LAND-8, R-REV-7), the
 * abort attempt (R-REV-5, R-REV-6), the stage-specific land rule (R-POL-6,
 * R-LAND-7), configuration recovery (R-ADMIN-5 to 9) and sole-admin
 * approval (R-ADMIN-2).
 */

import { describe, expect, it } from "vitest";
import type { Claim, Landing, LandOp, Lane, LogEntry, PolicyDocument, Proposal, Review, RosterRecord, SystemEvent } from "@generalbusiness/artroom-contract";
import { policy, requireReview, rule } from "@generalbusiness/artroom-policy/helpers";
import { addMember, Client, expectOk, expectRefusal, makeRoom, newKeyPair, pushChange, tick, iso, clock, day, type TestRoom } from "./support.ts";

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

function events(log: LogEntry[], type: SystemEvent["type"]): (LogEntry & { entry: { type: "system"; event: SystemEvent } })[] {
  return log.filter((e) => e.entry.type === "system" && e.entry.event.type === type) as never;
}

async function op(room: TestRoom, id: string): Promise<LandOp> {
  return (await room.admin.read({ q: "op", op: id as never })) as LandOp;
}

const reviewed = () => policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" }));

/** Alice proposes a src change, Bob approves it; returns what is needed to land. */
async function approved(room: TestRoom) {
  const alice = await addMember(room, "@alice", "member");
  const bob = await addMember(room, "@bob", "maintainer");
  const claim = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
  await alice.ok<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "v2" });
  const review = await bob.ok<Review>("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
  return { alice, bob, lane: claim.lane, head, review };
}

describe("R-LAND-6 and R-LAND-9: changes before reservation invalidate the operation", () => {
  it("section 23, a release during preparation: retryable, reason released", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    expect(l.op).toMatchObject({ id: `op_land_${l.seq}`, state: "accepted" });
    expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head }), "land-in-progress");
    await alice.ok("release", { lane }, { lease: 1 });
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "released" });
    const outcome = events(await entries(room), "land-outcome").at(-1)!;
    expect(outcome.entry.event).toEqual({ type: "land-outcome", op: l.op.id, outcome: { state: "retryable", reason: "released" } });
  });

  it("section 23, a new generation during preparation: retryable, reason generation-moved", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    const head2 = pushChange(room, lane, { "src/app.ts": "v3" }, head);
    await alice.ok("propose", { lane }, { lease: 1, expectedGeneration: 1, head: head2, summary: "v3" });
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "generation-moved" });
  });

  it("section 23, a policy activation during preparation: the operation re-prepares under the new version and still lands (R-POL-9, R-LAND-5)", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, lane, head } = await approved(room);
    // The admin changes the policy on another lane; it lands first.
    const ac = await room.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
    const ph = pushChange(room, ac.lane, { ".artroom/policy.json": JSON.stringify(reviewed()) + "\n" });
    await room.admin.ok("propose", { lane: ac.lane }, { lease: 1, expectedGeneration: 0, head: ph, summary: "same rules, new file" });
    await room.admin.ok("review", { lane: ac.lane, generation: 1 }, { head: ph, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
    const adminLand = await room.admin.ok<Landing>("land", { lane: ac.lane, generation: 1 }, { lease: 1, head: ph });
    const aliceLand = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room, 2);
    expect(await op(room, adminLand.op.id)).toMatchObject({ state: "landed" });
    const log = await entries(room);
    const outcome = events(log, "land-outcome").find((e) => (e.entry.event as unknown as { op: string }).op === adminLand.op.id)!;
    const activated = events(log, "policy-activated").at(-1)!;
    // R-PUB-9: the activation is at the seq right after the landing outcome.
    expect(activated.seq).toBe(outcome.seq + 1);
    expect((activated.entry.event as unknown as { recomputed: { fenced: string[] } }).recomputed.fenced).toContain(aliceLand.op.id);
    await tick(room, 4);
    const final = await op(room, aliceLand.op.id);
    expect(final.state).toBe("landed");
    expect(final.policyVersion).toBe(`act_${activated.seq}_${activated.hash.slice(7, 15)}`);
    expect(final.attempts).toBeGreaterThanOrEqual(2);
  });
});

describe("R-LAND-8 and R-REV-7: acts admitted while a reservation is held", () => {
  it("section 23, Paused push; release, new generation, objection, retired revocation: each admitted with after; the landing completes", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, bob, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("ready");
    room.world.landing!.controls.pausePush = true;
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("publishing");
    const reserved = events(await entries(room), "land-reserved").at(-1)!;
    expect(reserved.entry.event).toMatchObject({ op: l.op.id, lane, generation: 1, publication: 1 });
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
    room.world.landing!.controls.pausePush = false;
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "landed", publication: 1 });
    expect(room.world.artifacts.main).toBe(head);
    const outcomes = events(await entries(room), "land-outcome").filter((e) => (e.entry.event as unknown as { op: string }).op === l.op.id);
    expect(outcomes.map((e) => (e.entry.event as unknown as { outcome: { state: string } }).outcome.state)).toEqual(["landed"]);
    // After the slot is free, acts carry no `after`.
    expect((await room.admin.ok("note", { act: l.id }, { text: "done" })).after).toBeUndefined();
  });

  it("section 23, Paused push; compromised revocation of evidence (R-REV-5, R-REV-6): an abort attempt is recorded; the push lands; a revert lane opens", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, bob, lane, head, review } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    room.world.landing!.controls.pausePush = true;
    await tick(room);
    const rev = await room.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    expect(rev.after).toBe(l.op.id);
    expect(rev.invalidated).toMatchObject({ evidence: [review.id], abortAttempt: l.op.id });
    await tick(room);
    let log = await entries(room);
    expect(events(log, "abort-attempt").at(-1)!.entry.event).toMatchObject({ op: l.op.id, attempt: { trigger: rev.id, key: bob.key, tokenRevoked: true } });
    expect((await op(room, l.op.id)).state).toBe("unresolved");
    // The paused push completes after all: the outcome is decided by what happened.
    room.world.landing!.controls.pausePush = false;
    await tick(room);
    const done = await op(room, l.op.id);
    expect(done.state).toBe("landed");
    log = await entries(room);
    const revert = events(log, "revert-lane").at(-1)!;
    expect(revert.entry.event).toEqual({ type: "revert-lane", of: l.op.id, scope: ["src/app.ts"], reason: "compromised-evidence" });
    const revertId = `act_${revert.seq}_${revert.hash.slice(7, 15)}`;
    expect((done as { revertLane?: string }).revertLane).toBe(revertId);
    const lane2 = (await room.admin.read({ q: "lane", lane: revertId as never })) as Lane;
    expect(lane2).toMatchObject({ state: "unheld", why: "opened-by-room", revertOf: l.op.id, scope: ["src/app.ts"] });
    const att = await room.admin.read({ q: "attention" });
    expect(att.items.some((i) => i.why === "revert-lane")).toBe(true);
  });

  it("R-REV-5: with no push that can still land, the abort attempt ends in aborted and frees the slot", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, bob, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    room.world.landing!.controls.failPushes = 1;
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("unresolved");
    expect(events(await entries(room), "publication-unresolved").length).toBe(1);
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "aborted" });
    expect(room.world.artifacts.main).not.toBe(head);
    expect((await room.admin.read({ q: "op", op: l.op.id })) as LandOp).toMatchObject({ abort: { key: bob.key } });
  });

  it("R-LAND-7: reservation re-judges the initiator's authority; a removed initiator's landing is retryable authority-lost", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    await room.admin.ok("roster", null, { op: "set-role", member: "@alice", role: "checker" });
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "authority-lost" });
  });
});

describe("R-POL-6, R-LAND-4, R-LAND-7: the stage-specific land rule", () => {
  const withLandRule = (block: string): PolicyDocument => ({
    ...policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" })),
    rules: [
      ...policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" })).rules.filter((r) => r.kind !== "land"),
      { id: "stage-rule", kind: "land", block, reason: "Blocked at this stage.", fix: "None." },
    ],
  });

  it("section 23, Stage-specific land rule: a rule blocking stage reservation admits the land act but fails preparation, never ready", async () => {
    const room = await makeRoom({ policy: withLandRule('stage = "reservation"') });
    const { alice, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    const landEntry = (await entries(room)).find((e) => e.seq === l.seq)!;
    const decisions = (landEntry.entry as unknown as { receipt: { decisions: { rule: string; kind: string; outcome: { result: string } }[] } }).receipt.decisions;
    expect(decisions.find((d) => d.rule === "stage-rule")).toMatchObject({ kind: "land", outcome: { result: "pass" } });
    await tick(room, 3);
    const failed = await op(room, l.op.id);
    expect(failed).toMatchObject({ state: "failed", reason: { code: "refused", refusal: { rule: "stage-rule" } } });
    expect(room.world.artifacts.main).not.toBe(head);
  });

  it("section 23, Stage-specific land rule: unchanged state rebuilds byte-equal input and lands", async () => {
    const room = await makeRoom({ policy: withLandRule("false") });
    const { alice, lane, head } = await approved(room);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    const ready = await op(room, l.op.id);
    expect(ready.state).toBe("ready");
    expect((ready as { landInput: string }).landInput).toMatch(/^sha256:[0-9a-f]{64}$/);
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("landed");
  });

  it("section 23, Stage-specific land rule and Byte mismatch: a new objection between ready and reservation changes the bytes; retryable with land-input-changed", async () => {
    const room = await makeRoom({ policy: withLandRule("false") });
    const { alice, lane, head } = await approved(room);
    const carol = await addMember(room, "@carol", "maintainer");
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("ready");
    await carol.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "land-input-changed" });
    expect(room.world.artifacts.main).not.toBe(head);
  });

  it("R-POL-7: under the default policy an objection blocks landing (objection-open)", async () => {
    const room = await makeRoom({ policy: reviewed() });
    const { alice, lane, head } = await approved(room);
    const carol = await addMember(room, "@carol", "maintainer");
    await carol.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
    expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head }), "objection-open");
  });
});

describe("R-ADMIN configuration recovery and sole-admin approval", () => {
  const lockout = policy(
    rule({ id: "freeze", on: ["claim", "propose", "note", "review", "land", "release", "renew"], refuse: "true", fix: "Nothing can be done." }),
    rule({ id: "never-land", kind: "land", block: "true", reason: "Frozen.", fix: "None." }),
  );

  async function recoveryLane(room: TestRoom, admin: Client) {
    const claim = await admin.ok<Claim>("claim", null, { goal: "Restore a working policy", scope: [".artroom/policy.json"], purpose: "config-recovery" });
    const ws = expectOk(await admin.request<{ id: string }>({ kind: "workspace", lane: claim.lane, lease: 1 }));
    await tick(room);
    expectOk(await admin.request({ kind: "workspace-token", lane: claim.lane, lease: 1 }));
    void ws;
    return claim;
  }

  it("section 23, Policy lockout: the sole admin repairs the policy through a configuration-recovery lane; policy-activated follows", async () => {
    const room = await makeRoom({ policy: lockout });
    const bob = await addMember(room, "@bob", "member");
    // The lockout holds for ordinary work.
    expectRefusal(await bob.act("claim", null, { goal: "g", scope: ["src/**"] }), "freeze");
    // A non-admin's recovery claim is refused admin-required.
    expectRefusal(await bob.act("claim", null, { goal: "g", scope: [".artroom/policy.json"], purpose: "config-recovery" }), "admin-required");
    // A delegated admin key is refused admin-required.
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
    const land = await room.admin.ok<Landing>("land", { lane: claim.lane, generation: 1 }, { lease: 1, head });
    expect(land.flags).toContain("config-recovery");
    // No policy decision is recorded for the recovery-lane acts.
    const log = await entries(room);
    for (const id of [claim.id, p.id, review.id, land.id]) {
      const e = log.find((x) => `act_${x.seq}_${x.hash.slice(7, 15)}` === id)!;
      expect((e.entry as unknown as { receipt: { decisions: unknown[] } }).receipt.decisions).toEqual([]);
    }
    await tick(room, 3);
    expect(await op(room, land.op.id)).toMatchObject({ state: "landed" });
    const after = await entries(room);
    const outcome = events(after, "land-outcome").at(-1)!;
    const activated = events(after, "policy-activated").at(-1)!;
    expect(activated.seq).toBe(outcome.seq + 1);
    expect((activated.entry.event as unknown as { commit: string }).commit).toBe(head);
    // The frozen policy is gone.
    expectOk(await bob.act("claim", null, { goal: "back to work", scope: ["src/**"] }));
  });

  it("R-ADMIN-5 is the Room's own rule: with a policy port that ignores the lane purpose, recovery-lane acts are still not judged by policy", async () => {
    // The lockout, plus a require rule nobody can meet: neither may apply on the recovery lane.
    const strict: PolicyDocument = { ...lockout, rules: [...lockout.rules, ...policy(requireReview({ paths: ".artroom/**", from: "@nobody", id: "impossible" })).rules.filter((r) => r.kind === "require")] };
    const room = await makeRoom({ policy: strict });
    room.world.policy.ignorePurpose = true;
    const claim = await recoveryLane(room, room.admin);
    const head = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()) });
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "repair" });
    await room.admin.ok("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    const land = await room.admin.ok<Landing>("land", { lane: claim.lane, generation: 1 }, { lease: 1, head });
    await tick(room, 3);
    expect((await op(room, land.op.id)).state).toBe("landed");
  });

  it("section 23, Same lockout, two admins (R-ADMIN-7): the author's own approval is self-review; the other admin's approval meets obl_admin-approval", async () => {
    const room = await makeRoom({ policy: lockout });
    const admin2 = await addMember(room, "@admin2", "admin");
    const claim = await recoveryLane(room, room.admin);
    const head = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()) });
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "repair" });
    expectRefusal(await room.admin.act("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "mine" }), "self-review");
    const r = await admin2.ok<Review>("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    expect(r.flags).not.toContain("sole-admin-self-approval");
    const p = (await room.admin.read({ q: "proposal", ref: { lane: claim.lane, generation: 1 } }))!;
    expect(p.obligations[0]).toMatchObject({ id: "obl_admin-approval", state: "met" });
  });

  it("section 23, Sole admin changes policy (R-ADMIN-2): the flagged self-approval lands; if a second admin joins before reservation, it stops counting", async () => {
    const room = await makeRoom();
    const lane = await room.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
    const newPolicy = reviewed();
    const head = pushChange(room, lane.lane, { ".artroom/policy.json": JSON.stringify(newPolicy) });
    await room.admin.ok("propose", { lane: lane.lane }, { lease: 1, expectedGeneration: 0, head, summary: "require reviews" });
    const r = await room.admin.ok<Review>("review", { lane: lane.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
    expect(r.flags).toContain("sole-admin-self-approval");
    const l = await room.admin.ok<Landing>("land", { lane: lane.lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    expect((await op(room, l.op.id)).state).toBe("ready");
    // Open point 14: a second admin joins before reservation.
    await addMember(room, "@second", "admin");
    await tick(room);
    expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "obligation-open" });
    // While the room has one admin, the same flow lands and activates the policy.
    const room2 = await makeRoom();
    const lane2 = await room2.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
    const head2 = pushChange(room2, lane2.lane, { ".artroom/policy.json": JSON.stringify(newPolicy) });
    await room2.admin.ok("propose", { lane: lane2.lane }, { lease: 1, expectedGeneration: 0, head: head2, summary: "require reviews" });
    await room2.admin.ok("review", { lane: lane2.lane, generation: 1 }, { head: head2, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
    const l2 = await room2.admin.ok<Landing>("land", { lane: lane2.lane, generation: 1 }, { lease: 1, head: head2 });
    await tick(room2, 3);
    expect((await op(room2, l2.op.id)).state).toBe("landed");
    expect(events(await entries(room2), "policy-activated").length).toBe(2);
  });

  it("R-ADMIN-5: every act on a recovery lane needs an active admin's own key; take-over by a non-admin is admin-required", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const claim = await recoveryLane(room, room.admin);
    expectRefusal(await bob.act("note", { act: claim.id }, { text: "hi" }), "admin-required");
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    expectRefusal(await bob.act("claim", { lane: claim.lane }, { scope: [".artroom/policy.json"], expectedGeneration: 0 }), "admin-required");
  });
});
