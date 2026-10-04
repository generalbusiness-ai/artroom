/**
 * Review aabda1ed. The checker's eight reproductions asserted the defective
 * outcomes; each test here asserts the correct one, with the further cases
 * the review asked for.
 */

import { afterEach, describe, expect, it } from "vitest";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type { CheckerConfig, Claim, Landing, LogEntry, PolicyDocument, Proposal, Redeemed, Refusal, RosterRecord, Update, WorkspaceGrant } from "@generalbusiness/artroom-contract";
import { forkName } from "@generalbusiness/artroom-git";
import { policy, requireCheck, requireReview, rule } from "@generalbusiness/artroom-policy/helpers";
import { setFault, type Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import {
  addMember,
  advance,
  b64url,
  call,
  clock,
  Client,
  day,
  digestBytes,
  expectOk,
  expectRefusal,
  failure,
  iso,
  isRefusal,
  makeRoom,
  newKeyPair,
  pushChange,
  randomBytes,
  openedWorkspace,
  runtimeFailure,
  tick,
  type TestRoom,
} from "./support.ts";

afterEach(() => setFault(null));

const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const stub = (r: TestRoom) => r.stub as unknown as DurableObjectStub<Room>;
const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(stub(r), fn);
const count = (r: TestRoom, sql: string) => inDO(r, (room) => Number(room.core.sql.all(sql)[0]!["n"]));
const invitationUsed = (r: TestRoom, id: string) => inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", id)[0]!["used"] !== null);

/** Activate a policy directly, as a landed `.artroom/` change would (R-POL-9), then run the recomputation. */
async function activate(r: TestRoom, doc: PolicyDocument, checkers: Record<string, { config: CheckerConfig; digest: `sha256:${string}` }> = {}): Promise<void> {
  await inDO(r, (room) => room.core.sql.transaction(() => room.core.activate(doc, checkers, null, iso(clock.now))));
  await tick(r);
}

async function proposeSrc(r: TestRoom, who: Client, files: Record<string, string> = { "src/app.ts": "v2" }, scope = ["src/**", "docs/**"]) {
  const c = await who.ok<Claim>("claim", null, { goal: "g", scope });
  const head = pushChange(r, c.lane, files);
  const p = await who.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
  return { lane: c.lane, head, p };
}

const proposal = async (r: TestRoom, lane: string, generation = 1) => (await r.admin.read({ q: "proposal", ref: { lane: lane as never, generation } }))!;

// ------------------------------------------------------------------ P1.1

describe("P1.1: a room-custody redemption is all or nothing (R-CRED-9, R-CRED-3, R-ADM-12)", () => {
  async function roomInvite(r: TestRoom, member: `@${string}` = "@new", extra: Record<string, unknown> = { role: "agent" }) {
    const bytes = randomBytes(32);
    const inv = await r.admin.ok<RosterRecord>("roster", null, {
      op: "invite",
      member,
      ...extra,
      custody: "room",
      expiresAt: iso(clock.now + day),
      secretHash: digestBytes(bytes),
      session: { kinds: ["claim", "note"], lanes: "*", ttlSeconds: 3600 },
    });
    return { id: inv.id, input: { custody: "room", invitation: inv.id, secret: b64url(bytes) } };
  }

  it("a policy refusal of the session grant records nothing, makes no key, leaves the invitation unused; a retry is refused the same way", async () => {
    const r = await makeRoom({ policy: policy(rule({ id: "no-delegate", kind: "refuse", on: ["roster"], refuse: 'act.body.op = "delegate"', reason: "Delegation blocked", fix: "Ask admin" })) });
    const inv = await roomInvite(r);
    const before = (await entries(r)).length;
    const held = await count(r, "SELECT COUNT(*) AS n FROM held_keys");
    expect(await call(r.stub.redeem(inv.input, "checker"))).toMatchObject({ refused: true, rule: "no-delegate" });
    expect((await entries(r)).length).toBe(before);
    expect(await count(r, "SELECT COUNT(*) AS n FROM held_keys")).toBe(held);
    expect(await invitationUsed(r, inv.id)).toBe(false);
    expect(await call(r.stub.redeem(inv.input, "checker"))).toMatchObject({ refused: true, rule: "no-delegate" });
  });

  it("a policy runtime failure during the session grant's evaluation records nothing; the retry succeeds", async () => {
    const r = await makeRoom();
    const inv = await roomInvite(r);
    const before = (await entries(r)).length;
    let failed = false;
    r.world.policy.refuseHook = (input) => {
      if ((input.act.body as { op?: string }).op === "delegate" && !failed) {
        failed = true;
        throw runtimeFailure();
      }
    };
    expect((await failure(r.stub.redeem(inv.input, "x"))).code).toBe("policy-runtime");
    expect((await entries(r)).length).toBe(before);
    expect(await invitationUsed(r, inv.id)).toBe(false);
    const ok = await call<Redeemed>(r.stub.redeem(inv.input, "x"));
    expect(ok.custody).toBe("room");
    expect((await entries(r)).length).toBe(before + 2);
  });

  // The later of the two fault points: by then the join and the grant are both written, so one rollback shows both gone.
  it("an interruption at redemption:after-delegate rolls back the join, the grant, the keys and the bearer", async () => {
    const r = await makeRoom();
    const inv = await roomInvite(r);
    const before = (await entries(r)).length;
    const held = await count(r, "SELECT COUNT(*) AS n FROM held_keys");
    setFault((p) => {
      if (p === "redemption:after-delegate") throw new Error(`crash at ${p}`);
    });
    expect((await failure(r.stub.redeem(inv.input, "x"))).code).toBe("internal");
    setFault(null);
    expect((await entries(r)).length).toBe(before);
    expect(await count(r, "SELECT COUNT(*) AS n FROM held_keys")).toBe(held);
    expect(await count(r, "SELECT COUNT(*) AS n FROM bearers")).toBe(0);
    expect(await invitationUsed(r, inv.id)).toBe(false);
    expect((await call<Redeemed>(r.stub.redeem(inv.input, "x"))).custody).toBe("room");
  });

  it("response-loss recovery: a retry is invitation-invalid and exposes no bearer or held key; a new invitation and retiring the stranded key recover", async () => {
    const r = await makeRoom();
    const inv = await roomInvite(r, "@agent");
    const lost = await call<Redeemed>(r.stub.redeem(inv.input, "x"));
    const retry = await call<Refusal>(r.stub.redeem(inv.input, "x"));
    expect(retry).toMatchObject({ refused: true, rule: "invitation-invalid" });
    const seeds = await inDO(r, (room) => room.core.sql.all("SELECT seed FROM held_keys").map((x) => x["seed"] as string));
    for (const secret of [lost.bearer, ...seeds]) expect(JSON.stringify(retry)).not.toContain(secret);
    for (const seed of seeds) expect(JSON.stringify(await entries(r))).not.toContain(seed);
    // Open point 29: the admin issues a new room-custody invitation for the same member.
    const again = await roomInvite(r, "@agent", {});
    const fresh = await call<Redeemed>(r.stub.redeem(again.input, "x"));
    expect(fresh.member).toBe("@agent");
    expect(fresh.key).not.toBe(lost.key);
    await r.admin.ok("roster", null, { op: "revoke-key", key: lost.key, reason: "retired" });
    // The stranded session ended with its grantor's key: its token is judged as a read judges it (R-CRED-10).
    expect((await failure(r.stub.bearerAct(lost.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "lost-1" }))).code).toBe("unauthenticated");
    expectOk(await call(r.stub.bearerAct(fresh.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "fresh-1" })));
  });

  it("a client-custody redemption refused by policy records nothing either", async () => {
    const r = await makeRoom({ policy: policy(rule({ id: "no-join", kind: "refuse", on: ["roster"], refuse: 'act.body.op = "join"', reason: "No joins", fix: "Later" })) });
    const bytes = randomBytes(32);
    const inv = await r.admin.ok<RosterRecord>("roster", null, { op: "invite", member: "@web", role: "member", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes) });
    const before = (await entries(r)).length;
    const join = new Client(r, newKeyPair()).signed("roster", null, { op: "join", invitation: inv.id, secret: b64url(bytes) });
    expectRefusal(await call(r.stub.redeem({ custody: "client", join }, "x")), "no-join");
    expect((await entries(r)).length).toBe(before);
    expect(await invitationUsed(r, inv.id)).toBe(false);
  });
});

// ------------------------------------------------------------------ P1.2

describe("P1.2: a revoked key never becomes, or acts as, the recovery key (R-ADM-3)", () => {
  it("rotation to a revoked key is refused, whether the key was unbound (compromised) or a member's (retired)", async () => {
    const r = await makeRoom();
    const next = newKeyPair();
    await r.admin.ok("roster", null, { op: "revoke-key", key: next.key, reason: "compromised" });
    expectRefusal(await r.recovery.act("roster", null, { op: "rotate-recovery", key: next.key }), "invalid-body");
    expectRefusal(await new Client(r, next).act("roster", null, { op: "set-role", member: "@admin", role: "admin" }), "key-revoked");
    const bob = await addMember(r, "@bob", "member");
    await r.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    expectRefusal(await r.recovery.act("roster", null, { op: "rotate-recovery", key: bob.key }), "invalid-body");
  });

  it("a fresh key still becomes the recovery key and acts", async () => {
    const r = await makeRoom();
    const next = newKeyPair();
    await r.recovery.ok("roster", null, { op: "rotate-recovery", key: next.key });
    expect(await new Client(r, next).ok("roster", null, { op: "set-role", member: "@admin", role: "admin" })).toMatchObject({ by: { via: "recovery", key: next.key } });
  });

  it("backstop: a recovery key that is revoked cannot act", async () => {
    const r = await makeRoom();
    await inDO(r, (room) => room.core.sql.all("INSERT INTO revoked_keys (key, reason, revoked_at, revoked_by) VALUES (?, 'compromised', 1, 'act_1_00000000')", r.recovery.key));
    expectRefusal(await r.recovery.act("roster", null, { op: "set-role", member: "@admin", role: "admin" }), "key-revoked");
  });
});

// ------------------------------------------------------------------ P1.3

describe("P1.3: time-sensitive authority is judged again at the final boundary (R-ADM-6, R-ADM-4)", () => {
  async function held<T>(r: TestRoom, act: () => Promise<T>, during: () => void): Promise<T> {
    let open!: () => void;
    r.world.policy.gate = new Promise<void>((resolve) => (open = resolve));
    const calls = r.world.policy.calls.refuse;
    const pending = act();
    while (r.world.policy.calls.refuse === calls) await new Promise((x) => setTimeout(x, 5));
    during();
    r.world.policy.gate = null;
    open();
    return pending;
  }

  it("a delegation that expires while policy is evaluated: delegation-invalid, nothing recorded, the idempotency key not consumed", async () => {
    const r = await makeRoom();
    const key = newKeyPair();
    const grant = await r.admin.ok<RosterRecord>("roster", null, { op: "delegate", to: key.key, kinds: ["claim"], lanes: "*", expiresAt: iso(clock.now + 1000) });
    const before = (await entries(r)).length;
    const result = await held(r, () => new Client(r, key, grant.id).act("claim", null, { goal: "slow claim", scope: ["src/**"] }, "slow-1"), () => advance(2000));
    expect(expectRefusal(result, "delegation-invalid").act).toBeUndefined();
    expect((await entries(r)).length).toBe(before);
    expect(await count(r, `SELECT COUNT(*) AS n FROM idem WHERE ikey = 'slow-1'`)).toBe(0);
  });

  it("an invitation that expires while policy is evaluated: invitation-invalid, nothing recorded, the invitation unused", async () => {
    const r = await makeRoom();
    const bytes = randomBytes(32);
    const inv = await r.admin.ok<RosterRecord>("roster", null, { op: "invite", member: "@late", role: "member", custody: "client", expiresAt: iso(clock.now + 1000), secretHash: digestBytes(bytes) });
    const before = (await entries(r)).length;
    const result = await held(r, () => new Client(r, newKeyPair()).act("roster", null, { op: "join", invitation: inv.id, secret: b64url(bytes) }), () => advance(2000));
    expectRefusal(result, "invitation-invalid");
    expect((await entries(r)).length).toBe(before);
    expect(await invitationUsed(r, inv.id)).toBe(false);
  });

  it("a lease that runs out while policy is evaluated: the expiry is sealed first, then the act is refused not-holder", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const result = await held(r, () => r.admin.act("renew", { lane: c.lane }, { lease: 1 }), () => advance(1800 * 1000 + 1));
    const refused = expectRefusal(result, "not-holder");
    const log = await entries(r);
    const expired = log.findIndex((e) => e.entry.type === "system" && e.entry.event.type === "lease-expired");
    expect(expired).toBeGreaterThan(0);
    expect(log.findIndex((e) => `act_${e.seq}_${e.hash.slice(7, 15)}` === refused.act)).toBeGreaterThan(expired);
  });

  it("time passing without any log change is still seen: a delegation expired before admission is refused even with no new entry", async () => {
    const r = await makeRoom();
    const key = newKeyPair();
    const grant = await r.admin.ok<RosterRecord>("roster", null, { op: "delegate", to: key.key, kinds: ["claim"], lanes: "*", expiresAt: iso(clock.now + 1000) });
    advance(2000);
    expectRefusal(await new Client(r, key, grant.id).act("claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid");
  });
});

// ------------------------------------------------------------------ P1.4

describe("P1.4: after a policy activation, obligations are re-judged under the new requirement (R-POL-9, R-REV-1)", () => {
  async function approvedBy(r: TestRoom, reviewer: Client, files: Record<string, string> = { "src/app.ts": "v2" }) {
    const out = await proposeSrc(r, r.admin, files);
    await reviewer.ok("review", { lane: out.lane, generation: 1 }, { head: out.head, verdict: "approve", scope: ["src/**", "docs/**"], text: "ok" });
    return out;
  }

  it("the checker's case: the same requirement ID moved from @bob to @carol is open, and land is refused", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "same-id", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    await addMember(r, "@carol", "maintainer");
    const { lane, head } = await approvedBy(r, bob);
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("met");
    await activate(r, policy(requireReview({ id: "same-id", paths: "src/**", from: "@carol" })));
    expect((await proposal(r, lane)).obligations[0]).toMatchObject({ from: ["@carol"], state: "open", evidence: [] });
    expectRefusal(await r.admin.act("land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
    const recorded = await inDO(r, (room) => room.core.sql.all("SELECT body FROM recomputations").map((x) => JSON.parse(x["body"] as string) as { decisions: unknown[] }));
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.decisions.length).toBeGreaterThan(0);
  });

  it("qualification uses the role recorded at admission, not today's", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "rv", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    const { lane } = await approvedBy(r, bob);
    await r.admin.ok("roster", null, { op: "set-role", member: "@bob", role: "member" });
    await activate(r, policy(requireReview({ id: "rv", paths: "src/**", from: "role:maintainer" })));
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("met");
    await activate(r, policy(requireReview({ id: "rv", paths: "src/**", from: "role:member" })));
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("open");
  });

  it("checker configuration: a check under the old configuration does not count under a new one", async () => {
    const v1: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 };
    const v2: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 120 };
    const doc = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit" }));
    const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(v1) } });
    const ci = await addMember(r, "@ci", "checker");
    const { lane } = await proposeSrc(r, r.admin);
    await tick(r);
    const p = await proposal(r, lane);
    const integration = (p.preview as { integration: string }).integration;
    await ci.ok("check", { lane, generation: 1 }, {
      obligation: "obl_unit",
      check: "unit",
      integration,
      input: { kind: "tree", tree: r.world.artifacts.commits.get(integration as never)!.tree },
      config: digestJson(v1),
      runner: `sha256:${"0".repeat(64)}`,
      volatile: false,
      ok: true,
      detail: "ok",
    });
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("met");
    await activate(r, doc, { unit: { config: v2, digest: digestJson(v2) } });
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("open");
  });

  it("carried reviews are re-judged by carry under the new policy", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "rv", paths: "src/**", from: "role:maintainer" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const h1 = pushChange(r, c.lane, { "src/a/x.ts": "1" });
    await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: h1, summary: "g1" });
    await bob.ok("review", { lane: c.lane, generation: 1 }, { head: h1, verdict: "approve", scope: ["src/a/**"], text: "ok" });
    const h2 = pushChange(r, c.lane, { "src/b/y.ts": "2" }, h1);
    await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 1, head: h2, summary: "g2" });
    expect((await proposal(r, c.lane, 2)).obligations[0]!.evidence[0]).toMatchObject({ basis: "carried" });
    await activate(
      r,
      policy(requireReview({ id: "rv", paths: "src/**", from: "role:maintainer" }), { part: "carry", carry: {}, rules: [{ id: "never", kind: "carry", evidence: "review", allow: "false" }] }),
    );
    const p2 = await proposal(r, c.lane, 2);
    expect(p2.obligations[0]!.state).toBe("open");
    expect(p2.notCarried.some((n) => n.code === "policy-rejected")).toBe(true);
  });

  it("a landing prepared before the activation cannot land on the old evidence", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "same-id", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    await addMember(r, "@carol", "maintainer");
    const { lane, head } = await approvedBy(r, bob);
    const land = await r.admin.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r);
    expect((await r.admin.read({ q: "op", op: land.op.id })).state).toBe("ready");
    await activate(r, policy(requireReview({ id: "same-id", paths: "src/**", from: "@carol" })));
    await tick(r, 3);
    expect((await r.admin.read({ q: "op", op: land.op.id })).state).toBe("retryable");
    expect(r.world.artifacts.main).not.toBe(head);
  });
});

// ------------------------------------------------------------------ P1.5

describe("P1.5: a durable pending publication completes forward (R-LOG-8)", () => {
  const published = async (r: TestRoom) => (await r.admin.read({ q: "log" })).publishedThrough;

  it("a lost push reply: the publisher reads back, finds its commit, and the checkpoint is sealed", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    r.world.log.faults.lostPushReply = 1;
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p.through).toBe(2);
    expect(r.world.log.ref).toBe(p.commit);
    expect(r.world.log.pushes).toBe(1);
    expect(await published(r)).toBe(2);
  });

  it("lost push and read-back replies: nothing advances; entries appended meanwhile stay out; the retry confirms the same commit", async () => {
    const r = await makeRoom();
    const claim = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    r.world.log.faults.lostPushReply = 1;
    r.world.log.faults.lostReadReply = 1;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    const pushed = r.world.log.ref;
    expect(pushed).toBeTruthy();
    expect(await published(r)).toBe(-1);
    await r.admin.ok("note", { act: claim.id }, { text: "later" });
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p).toEqual({ through: 2, commit: pushed });
    expect(await published(r)).toBe(2);
    const p2 = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p2.through).toBe(4);
    expect(r.world.artifacts.parents(p2.commit as never)).toEqual([pushed]);
  });

  it("restart: a new instance resumes the pending cohort before choosing another", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    r.world.log.faults.lostPushReply = 1;
    r.world.log.faults.lostReadReply = 1;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    const pushed = r.world.log.ref;
    await r.admin.ok("claim", null, { goal: "h", scope: ["docs/**"] });
    await evictDurableObject(r.stub);
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p).toEqual({ through: 2, commit: pushed });
    expect(await published(r)).toBe(2);
  });

  it("an unexpected writer: publication stops, publishedThrough stays, the ref is never forced, admins are told", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await call(r.stub.publishLog());
    await r.admin.ok("claim", null, { goal: "h", scope: ["docs/**"] });
    const foreign = r.world.log.foreignWrite();
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect(r.world.log.ref).toBe(foreign);
    expect(await published(r)).toBe(2);
    const att = await r.admin.read({ q: "attention", page: { limit: 500 } });
    expect(att.items.some((i) => i.why === "publication-unresolved")).toBe(true);
  });
});

// ------------------------------------------------------------------ P2.6

describe("P2.6: pending workspaces are durable alarm work (R-WS), through lane B's Workspaces", () => {
  it("interrupted before provisioning: the alarm resumes the same op and lease, and creates one fork", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const id = await openedWorkspace(r, c.lane);
    expect(id).toBe(`op_ws_${c.lane}_1`);
    await tick(r);
    expect(await r.admin.read({ q: "op", op: id as never })).toMatchObject({ id, state: "ready", detail: { leaseGeneration: 1 } });
    expect(r.world.artifacts.remoteCalls.get("fork")).toBe(1);
  });

  it("the fork is created but its answer is lost: the same provision reads it back, and the fork's own token is swept", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const id = await openedWorkspace(r, c.lane);
    r.world.artifacts.loseReply("fork");
    await tick(r);
    expect(await r.admin.read({ q: "op", op: id as never })).toMatchObject({ state: "ready" });
    expect(r.world.artifacts.remoteCalls.get("fork")).toBe(1);
    // Only the lease's token is live: the 24-hour token that came with the fork was revoked by lane B's inventory.
    const grant = expectOk(await r.admin.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    const fork = r.world.artifacts.repo(forkName(r.world.artifacts.canonical, c.lane));
    expect(fork.activeTokens().length).toBe(1);
    expect(fork.admits(grant.token, "write")).toBe(true);
  });

  it("fencing: a take-over while the fork is being created ends the old lease's access; the old holder gets no token", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const id = await openedWorkspace(r, c.lane);
    const sql = await inDO(r, (room) => room.core.sql);
    // The lease ends during the remote call: a take-over moved the lease generation.
    r.world.artifacts.on("fork", () => void sql.all("UPDATE lanes SET lease_gen = lease_gen + 2 WHERE id = ?", c.lane));
    await tick(r, 2);
    expectRefusal(await r.admin.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "lease-fenced");
    const fork = r.world.artifacts.repo(forkName(r.world.artifacts.canonical, c.lane));
    expect(fork.activeTokens()).toEqual([]);
    expect((await failure(r.stub.read(await r.admin.session(), { q: "op", op: id as never }))).code).toBe("not-found");
  });

  it("fencing: a lease that ended before the resume is never provisioned; the old holder gets no token", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await openedWorkspace(r, c.lane);
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(r);
    // No fork is created for a lease that has already ended.
    expect(r.world.artifacts.remoteCalls.get("fork") ?? 0).toBe(0);
    expectRefusal(await r.admin.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "not-holder");
  });
});

// ------------------------------------------------------------------ P2.7

describe("P2.7: sealed obligation effects come from the same calculator as the projection", () => {
  it("a repeated approval seals no met effect while two distinct members are required; the second member's does", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "two", paths: "src/**", from: "role:maintainer", count: 2 })) });
    const bob = await addMember(r, "@bob", "maintainer");
    const carol = await addMember(r, "@carol", "maintainer");
    const { lane, head } = await proposeSrc(r, r.admin);
    const body = { head, verdict: "approve", scope: ["src/**"], text: "ok" };
    await bob.ok("review", { lane, generation: 1 }, body);
    const repeat = await bob.ok("review", { lane, generation: 1 }, body);
    const effectsOf = async (seq: number) => ((await entries(r)).find((e) => e.seq === seq)!.entry as unknown as { receipt: { effects: unknown[] } }).receipt.effects;
    expect(await effectsOf(repeat.seq)).toEqual([]);
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("open");
    expectRefusal(await r.admin.act("land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
    const second = await carol.ok("review", { lane, generation: 1 }, body);
    expect(await effectsOf(second.seq)).toEqual([{ type: "obligations", lane, generation: 1, opened: [], met: ["obl_two"] }]);
    expect((await proposal(r, lane)).obligations[0]!.state).toBe("met");
    const land = await r.admin.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 3);
    expect((await r.admin.read({ q: "op", op: land.op.id })).state).toBe("landed");
  });

  it("an approval after the same member's objection seals met only when the latest verdicts meet it", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "one", paths: "src/**", from: "role:maintainer" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    const { lane, head } = await proposeSrc(r, r.admin);
    const obj = await bob.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
    const ok = await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "yes" });
    const log = await entries(r);
    expect((log.find((e) => e.seq === obj.seq)!.entry as unknown as { receipt: { effects: unknown[] } }).receipt.effects).toEqual([]);
    expect((log.find((e) => e.seq === ok.seq)!.entry as unknown as { receipt: { effects: { met: string[] }[] } }).receipt.effects[0]!.met).toEqual(["obl_one"]);
  });
});

// ------------------------------------------------------------------ P2.8

describe("P2.8: attention and update cursors never skip an item (R-API-6, R-API-8)", () => {
  it("two items from one entry, read one per page, are both delivered", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "a", paths: "src/**", from: "@bob" }), requireReview({ id: "b", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    await proposeSrc(r, r.admin);
    const token = await bob.session();
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 4; i++) {
      const page = await call<{ items: { id: string; why: string }[]; cursor: string; more: boolean }>(r.stub.read(token, { q: "attention", page: { limit: 1, ...(cursor ? { cursor: cursor as never } : {}) } }));
      ids.push(...page.items.filter((x) => x.why === "review-requested").map((x) => x.id));
      cursor = page.cursor;
    }
    expect(new Set(ids).size).toBe(2);
  });

  it("overlapping principals: items to @bob and to role:maintainer from one entry are each delivered once", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "a", paths: "src/**", from: "@bob" }), requireReview({ id: "b", paths: "src/**", from: "role:maintainer" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    await proposeSrc(r, r.admin);
    const token = await bob.session();
    const first = await call<{ items: { id: string }[]; cursor: string }>(r.stub.read(token, { q: "attention", page: { limit: 1 } }));
    const second = await call<{ items: { id: string }[]; cursor: string }>(r.stub.read(token, { q: "attention", page: { limit: 1, cursor: first.cursor as never } }));
    const third = await call<{ items: { id: string }[] }>(r.stub.read(token, { q: "attention", page: { limit: 1, cursor: second.cursor as never } }));
    expect([...first.items, ...second.items].map((x) => x.id).length).toBe(2);
    expect(new Set([...first.items, ...second.items].map((x) => x.id)).size).toBe(2);
    expect(third.items).toEqual([]);
  });

  it("an update cursor never passes unseen attention: 120 items from one entry arrive as 100 then 20", async () => {
    const rules = Array.from({ length: 120 }, (_, i) => requireReview({ id: `r${i}`, paths: "src/**", from: "@bob" }));
    const r = await makeRoom({ policy: policy(...rules) });
    const bob = await addMember(r, "@bob", "maintainer");
    const token = await bob.session();
    const start = await call<Update>(r.stub.poll(token, undefined, 0));
    await proposeSrc(r, r.admin);
    let cursor = start.cursor as string;
    const got: string[] = [];
    for (let i = 0; i < 6; i++) {
      const u = await call<Update>(r.stub.poll(token, cursor, 0));
      got.push(...u.attention.map((a) => a.id));
      cursor = u.cursor;
    }
    expect(got.length).toBe(120);
    expect(new Set(got).size).toBe(120);
  });

  it("an earlier attention cursor (seq only) still resumes after that seq", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "a", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    const { p } = await proposeSrc(r, r.admin);
    const token = await bob.session();
    const legacy = `c1.${b64url(new TextEncoder().encode(JSON.stringify({ k: "attention", n: p.seq })))}`;
    const page = await call<{ items: unknown[] }>(r.stub.read(token, { q: "attention", page: { cursor: legacy as never } }));
    expect(page.items).toEqual([]);
  });
});

void isRefusal;
