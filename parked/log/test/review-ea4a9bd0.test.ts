/**
 * Checker review ea4a9bd0. One describe block per finding:
 * 1. a publication owns its cohort before any await;
 * 2. R-ADM-5 is judged when a delegation is granted;
 * 3. malformed log content is a named failure, not a throw;
 * 4. later publications keep earlier retained replay evidence;
 * 5. a `notified` event replays under the policy pinned with its act.
 */

import { describe, expect, test } from "vitest";
import type { Authority, Checkpoint, LogEntry, PolicyVersion } from "@generalbusiness/artroom-contract";
import { policy, rule } from "@generalbusiness/artroom-policy";
import { MemoryGit, type GitObject, type PushOutcome } from "../src/git.ts";
import { ROOT, contentOf, entryId, makeCheckpoint, retain, retainedPath, type Retained } from "../src/entries.ts";
import { LogPublisher, readLogFiles, readPublishedEntries } from "../src/publisher.ts";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { digestJson, keyPairFromSeed, sha256Hex } from "../src/crypto.ts";
import { verifyLog } from "../src/verify.ts";
import { DEMO_POLICY, RoomSim, checkBody, keys, memberAuthority, seed } from "./support/room-sim.ts";
import { alice, base, bobAuth, expectReason, lines, publishAs, publishLines, reseal } from "./support/logs.ts";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ----------------------------------------------------------------- finding 1

/** A MemoryGit whose push or read-back waits until the test releases it. */
class GatedGit extends MemoryGit {
  hold: "push" | "read" | null = null;
  private release: (() => void) | null = null;
  private entered: (() => void) | null = null;
  /** Resolves once the publisher is waiting at the held step. */
  waiting = new Promise<void>((r) => (this.entered = r));

  private async gate(step: "push" | "read") {
    if (this.hold !== step) return;
    this.hold = null;
    const go = new Promise<void>((r) => (this.release = r));
    this.entered!();
    await go;
  }

  open() {
    this.release!();
  }

  override async push(objects: readonly GitObject[], ref: string, next: string, lease: string | null): Promise<PushOutcome> {
    await this.gate("push");
    return super.push(objects, ref, next as never, lease as never);
  }

  override async readRef(ref: string) {
    await this.gate("read");
    return super.readRef(ref);
  }
}

describe("finding 1: a publication owns its cohort before asynchronous I/O", () => {
  for (const step of ["push", "read"] as const) {
    test(`appending and mutating the caller's objects during the ${step} changes neither the commit nor the state`, async () => {
      const sim = new RoomSim();
      await sim.claim(keys.alice, alice, ["src/**"]); // 2
      const original = clone(sim.entries);
      const git = new GatedGit();
      const p = new LogPublisher(git);

      // The caller's own arrays and objects, which it changes while the publisher waits.
      const entries: LogEntry[] = clone(sim.entries);
      const checkpoint: Checkpoint = clone(sim.checkpoint());
      const retained: Retained[] = clone(sim.retained);
      git.hold = step;
      const pending = p.publish(entries, checkpoint, retained);
      await git.waiting;

      await sim.claim(keys.alice, alice, ["docs/**"]); // 3, appended while the push is in flight
      entries.push(clone(sim.entries[3]!));
      (entries[2] as { at: string }).at = "2030-01-01T00:00:00.000Z";
      (checkpoint as { through: number }).through = 3;
      retained.length = 0;
      retained.push(retain("input", { junk: true }));
      git.open();

      const r = await pending;
      expect(r).toMatchObject({ through: 2, hash: original[2]!.hash, publishedThrough: 2, attempts: 1 });
      expect(p.publishedThrough).toBe(2);
      expect(await readPublishedEntries(git, r.commit)).toEqual(original);
      const files = await readLogFiles(git, r.commit);
      expect(files.has(retainedPath(retain("input", { junk: true })))).toBe(false);
      expect(JSON.parse(new TextDecoder().decode(files.get(`${ROOT}/checkpoint.json`)!))).toMatchObject({ through: 2 });
      expect(await verifyLog(git)).toMatchObject({ ok: true, verifiedThrough: 2, publishedThrough: 2 });

      // The next cohort publishes its new entry: a new commit, not a stale answer.
      const next = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
      expect(next.commit).not.toBe(r.commit);
      expect(next).toMatchObject({ through: 3, publishedThrough: 3, attempts: 1 });
      expect(await readPublishedEntries(git, next.commit)).toHaveLength(4);
      expect(await verifyLog(git)).toMatchObject({ ok: true, verifiedThrough: 3, publishedThrough: 3 });
    });
  }
});

// ----------------------------------------------------------------- finding 2

const carol = keyPairFromSeed(seed(5));

/** Entries 6..: @bob (a member) delegates `kinds` to carol's key, which never joined. Returns the delegation's ID. */
function delegate(sim: RoomSim, kinds: readonly string[] | "*", expiresAt = sim.at(5000)) {
  const e = sim.accept(sim.envelope(keys.bob, "roster", null, { op: "delegate", to: carol.key, kinds, lanes: "*", expiresAt }), bobAuth);
  return entryId(e.seq, e.hash);
}

function setRole(sim: RoomSim, role: Authority["role"]) {
  sim.accept(sim.envelope(keys.alice, "roster", null, { op: "set-role", member: "@bob", role }), alice);
}

function underDelegation(sim: RoomSim, delegation: string, kind: "check" | "note" | "claim", role: Authority["role"]) {
  const target = kind === "claim" ? null : { act: entryId(5, sim.entries[5]!.hash) };
  const body = kind === "claim" ? { goal: "Work on it", scope: ["lib/**"] } : kind === "check" ? checkBody() : { text: "hi" };
  const act = sim.envelope(carol, kind, target, body, delegation as never);
  return sim.accept(act, { via: "delegation", member: "@bob", role, key: carol.key, delegation, grantor: keys.bob.key } as Authority);
}

describe("finding 2: R-ADM-5 is judged when the delegation is granted", () => {
  test("a member grants check, is promoted to checker, the grantee checks: delegation-invalid at the grant", async () => {
    const sim = await base();
    const d = delegate(sim, ["check"]); // 6: invalid, a member may not sign check
    setRole(sim, "checker"); // 7
    underDelegation(sim, d, "check", "checker"); // 8
    const r = await expectReason(await publishAs(sim, sim.entries), "delegation-invalid", 6);
    expect(r.failures[0]!.detail).toMatch(/may not grant check \(R-ADM-5\)/);
  });

  test("a member's * covers only the member's kinds: after promotion to checker, check is delegation-invalid at the use", async () => {
    const sim = await base();
    const d = delegate(sim, "*"); // 6: valid; * is the member's kinds, fixed now
    setRole(sim, "checker"); // 7
    underDelegation(sim, d, "check", "checker"); // 8
    await expectReason(await publishAs(sim, sim.entries), "delegation-invalid", 8);
  });

  test("a valid grant used within its kinds verifies", async () => {
    const sim = await base();
    const d = delegate(sim, "*"); // 6
    underDelegation(sim, d, "note", "member"); // 7
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r.verifiedThrough).toBe(7);
  });

  test("an admin may grant check, and a later demotion still stops it at the use (current role)", async () => {
    const sim = await base();
    setRole(sim, "admin"); // 6
    const adminBob = memberAuthority("@bob", keys.bob.key, "admin");
    const e = sim.accept(sim.envelope(keys.bob, "roster", null, { op: "delegate", to: carol.key, kinds: ["check", "note"], lanes: "*", expiresAt: sim.at(5000) }), adminBob); // 7
    const d = entryId(e.seq, e.hash);
    underDelegation(sim, d, "check", "admin"); // 8: valid
    setRole(sim, "member"); // 9
    underDelegation(sim, d, "check", "member"); // 10: the grantor's role no longer signs check
    await expectReason(await publishAs(sim, sim.entries), "delegation-invalid", 10);
  });

  test("expiry and revocation are still judged at the use", async () => {
    const expired = await base();
    const d1 = delegate(expired, ["note"], expired.at(7)); // 6, expires at entry 7's time
    expired.system({ type: "lease-expired", lane: entryId(5, expired.entries[5]!.hash), holder: "@bob", leaseGeneration: 1 } as never); // 7
    underDelegation(expired, d1, "note", "member"); // 8
    await expectReason(await publishAs(expired, expired.entries), "delegation-invalid", 8);

    const revoked = await base();
    const d2 = delegate(revoked, ["note"]); // 6
    revoked.accept(revoked.envelope(keys.bob, "roster", null, { op: "undelegate", delegation: d2 }), bobAuth); // 7
    underDelegation(revoked, d2, "note", "member"); // 8
    await expectReason(await publishAs(revoked, revoked.entries), "delegation-invalid", 8);
  });
});

// ----------------------------------------------------------------- finding 3

describe("finding 3: malformed log content is a named failure with the last valid prefix", () => {
  test('a first entry {"seq":0} is malformed at entry 0; verify does not throw', async () => {
    const sim = await base();
    const r = await expectReason(await publishLines(sim, ['{"seq":0}', ...lines(sim.entries).slice(1)]), "malformed", 0);
    expect(r).toMatchObject({ verifiedThrough: -1, last: null });
  });

  test("a malformed later entry stops the prefix before it", async () => {
    const sim = await base();
    const l = lines(sim.entries);
    l[3] = canonicalize({ ...sim.entries[3]!, entry: { type: "act", act: null, receipt: {} } });
    const r = await expectReason(await publishLines(sim, l), "malformed", 3);
    expect(r.failures.find((f) => f.reason === "malformed")!.detail).toMatch(/entry\.act is not an object/);
  });

  test("a line that is not JSON, and one that is not UTF-8, are malformed", async () => {
    const sim = await base();
    const l: (string | Uint8Array)[] = lines(sim.entries);
    l[4] = "not json";
    await expectReason(await publishLines(sim, l), "malformed", 4);
    l[4] = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    await expectReason(await publishLines(sim, l), "malformed", 4);
  });

  test("malformed signatures: entry, envelope and genesis signatures that are not strings", async () => {
    const sim = await base();
    const l = lines(sim.entries);
    l[2] = canonicalize({ ...sim.entries[2]!, roomSig: 7 });
    await expectReason(await publishLines(sim, l), "malformed", 2);

    const e5 = sim.entries[5]!;
    if (e5.entry.type !== "act") throw new Error("expected an act");
    const l2 = lines(sim.entries);
    l2[5] = canonicalize({ ...e5, entry: { ...e5.entry, act: { ...e5.entry.act, sig: { forged: true } } } });
    await expectReason(await publishLines(sim, l2), "malformed", 5);

    const g = sim.entries[0]!;
    if (g.entry.type !== "system" || g.entry.event.type !== "genesis") throw new Error("expected genesis");
    const l3 = lines(sim.entries);
    l3[0] = canonicalize({ ...g, entry: { type: "system", event: { ...g.entry.event, sig: [1, 2] } } });
    await expectReason(await publishLines(sim, l3), "malformed", 0);
  });

  test("a checkpoint whose signature is not a string is malformed, not a throw", async () => {
    const sim = await base();
    const cp = canonicalize({ ...sim.checkpoint(), sig: 42 });
    const r = await verifyLog(await publishLines(sim, lines(sim.entries), {}, cp));
    expect(r.failures.map((f) => f.reason)).toContain("malformed");
    expect(r.ok).toBe(false);
  });

  test("a roster body outside the contract is malformed", async () => {
    const sim = await base();
    sim.accept(sim.envelope(keys.bob, "roster", null, { op: "delegate", to: carol.key, kinds: ["bogus"], lanes: "*", expiresAt: sim.at(5000) }), bobAuth); // 6
    await expectReason(await publishLines(sim, lines(sim.entries)), "malformed", 6);
  });

  test("malformed retained data: a replay context and a policy document, each where an entry needs it", async () => {
    // A replay context that is not JSON, named by a resealed decision at entry 2.
    const sim = await base();
    const junk = utf8("{not json");
    const digest = `sha256:${sha256Hex(junk)}` as const;
    const e = [...sim.entries];
    const c = contentOf(e[2]!);
    if (c.entry.type !== "act") throw new Error("expected an act");
    e[2] = { ...e[2]!, entry: { ...c.entry, receipt: { ...c.entry.receipt, decisions: c.entry.receipt.decisions.map((d) => ({ ...d, input: digest })) } } };
    const resealed = reseal(e, 2);
    const ctx = await publishLines(sim, lines(resealed), { [`${ROOT}/inputs/${sha256Hex(junk)}.json`]: junk }, canonicalize(makeCheckpoint(sim.room, keys.room.key, keys.room.seed, resealed[5]!, sim.at(99))));
    const r1 = await expectReason(ctx, "malformed", 2);
    expect(r1.failures.find((f) => f.reason === "malformed")!.detail).toMatch(/inputs\/.*not strict JSON/);

    // A policy document that is not a policy, named by a resealed policy-activated at entry 1.
    const notPolicy = { format: "artroom-policy-v1", rules: 5 };
    const p = [...sim.entries];
    const pc = contentOf(p[1]!);
    if (pc.entry.type !== "system" || pc.entry.event.type !== "policy-activated") throw new Error("expected policy-activated");
    p[1] = { ...p[1]!, entry: { type: "system", event: { ...pc.entry.event, policy: digestJson(notPolicy) } } };
    const pol = await publishLines(sim, lines(reseal(p, 1)), { [retainedPath(retain("policy", notPolicy))]: canonicalize(notPolicy) });
    const r2 = await expectReason(pol, "malformed", 1);
    expect(r2.failures.find((f) => f.reason === "malformed")!.detail).toMatch(/not a policy document/);
  });

  test("a malformed retained file no entry needs fails the commit but not the prefix", async () => {
    const sim = await base();
    const junk = utf8("[1,2");
    const r = await verifyLog(await publishLines(sim, lines(sim.entries), { [`${ROOT}/inputs/${sha256Hex(junk)}.json`]: junk }));
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([expect.objectContaining({ reason: "malformed", commit: r.head })]);
    expect(r.verifiedThrough).toBe(5);
  });

  test("a genuine read error still throws, so the CLI reports it apart from a failed check", async () => {
    const git = new MemoryGit();
    git.refs.set("refs/artroom/log", "e".repeat(40) as never);
    await expect(verifyLog(git)).rejects.toThrow(/not found/);
  });
});

// ----------------------------------------------------------------- finding 4

describe("finding 4: later publications keep earlier retained replay evidence", () => {
  const leaseExpired = (sim: RoomSim) =>
    sim.system({ type: "lease-expired", lane: entryId(2, sim.entries[2]!.hash), holder: "@alice", leaseGeneration: 1 } as never);

  test("a publication that omits earlier retained files keeps them, and every prefix stays replayable", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const first = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    const before = [...(await readLogFiles(git, first.commit)).keys()].filter((k) => /\/(inputs|policies)\//.test(k));
    expect(before.length).toBeGreaterThan(1);

    leaseExpired(sim); // 3
    const second = await p.publish(sim.entries, sim.checkpoint()); // no retained argument
    const after = [...(await readLogFiles(git, second.commit)).keys()];
    for (const path of before) expect(after).toContain(path);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 3, commits: 2 });
  });

  test("a restarted publisher reads the retained files back and keeps them", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const git = new MemoryGit();
    await new LogPublisher(git).publish(sim.entries, sim.checkpoint(), sim.retained);

    const resumed = await LogPublisher.open(git);
    leaseExpired(sim); // 3
    await resumed.publish(sim.entries, sim.checkpoint(), []);
    // New retained files still join the old ones.
    await sim.claim(keys.alice, alice, ["docs/**"]); // 4
    const fresh = sim.retained.at(-1)!;
    await resumed.publish(sim.entries, sim.checkpoint(), [fresh]);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 4, commits: 3 });
  });
});

// ----------------------------------------------------------------- finding 5

const POLICY_3 = policy(
  rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', fix: "Claim only the paths you will change.", reason: "A claim on ** covers the whole repository." }),
  rule({ id: "holder-sees-claims", kind: "notify", on: ["claim"], to: ["holder"], why: "Policy 3 says you claimed this lane." }),
);
const POLICY_4 = policy(
  rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', fix: "Claim only the paths you will change.", reason: "A claim on ** covers the whole repository." }),
);

describe("finding 5: a notified event replays under the policy pinned with its act", () => {
  test("an activation between queueing and sealing: the notification keeps the act's policy", async () => {
    const sim = new RoomSim();
    const pinned = sim.policy; // policy 1
    const claim = await sim.claim(keys.alice, alice, ["src/**"]); // 2, under policy 1
    sim.activate(POLICY_3); // 3
    await sim.notified(claim.lane!, "claim", "@alice", pinned); // 4, evaluated with the queued policy 1
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 4 });
    expect(r.decisionsReplayed).toBeGreaterThanOrEqual(2);
  });

  test("a retry sealed after several activations still uses the original version", async () => {
    const sim = new RoomSim();
    const pinned = sim.policy;
    const claim = await sim.claim(keys.alice, alice, ["src/**"]); // 2
    sim.activate(POLICY_3); // 3
    sim.activate(POLICY_4); // 4
    await sim.notified(claim.lane!, "claim", "@alice", pinned); // 5
    expect(await verifyLog(await publishAs(sim, sim.entries))).toMatchObject({ ok: true, verifiedThrough: 5 });
  });

  test("substituting another policy is policy-version-mismatch: an older one, a newer one, or a version that does not exist", async () => {
    // Older: the claim is admitted under policy 3; the notification names policy 1.
    const older = new RoomSim();
    const p1 = older.policy;
    older.activate(POLICY_3); // 2
    const c1 = await older.claim(keys.alice, alice, ["src/**"]); // 3, under policy 3
    await older.notified(c1.lane!, "claim", "@alice", p1); // 4
    await expectReason(await publishAs(older, older.entries), "policy-version-mismatch", 4);

    // Newer: the claim is admitted under policy 1; the notification names policy 3, activated later.
    const newer = new RoomSim();
    const c2 = await newer.claim(keys.alice, alice, ["src/**"]); // 2
    newer.activate(POLICY_3); // 3
    await newer.notified(c2.lane!, "claim", "@alice"); // 4, under the active policy 3: wrong
    await expectReason(await publishAs(newer, newer.entries), "policy-version-mismatch", 4);

    // Nonexistent: the notification names a version no policy-activated entry has.
    const none = new RoomSim();
    const c3 = await none.claim(keys.alice, alice, ["src/**"]); // 2
    await none.notified(c3.lane!, "claim", "@alice", { doc: DEMO_POLICY, version: "act_9_00000000" as PolicyVersion }); // 3
    await expectReason(await publishAs(none, none.entries), "policy-version-mismatch", 3);
  });

  test("a notification may name only an earlier accepted act: naming a system entry is notified-unknown", async () => {
    const sim = new RoomSim();
    const activation = entryId(1, sim.entries[1]!.hash);
    await sim.notified(activation, "claim", "@alice"); // 2
    await expectReason(await publishAs(sim, sim.entries), "notified-unknown", 2);
  });

  test("an act's own decisions still use the policy active at its admission", async () => {
    const sim = new RoomSim();
    const p1 = sim.policy;
    sim.activate(POLICY_3); // 2
    sim.policy = p1; // a faulty room evaluates the claim under the superseded policy
    await sim.claim(keys.alice, alice, ["src/**"]); // 3
    await expectReason(await publishAs(sim, sim.entries), "policy-version-mismatch", 3);
  });
});
