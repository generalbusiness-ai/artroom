/**
 * Checker review 07d3150e (lane L revision 2):
 * 1. a time that bounds authority must be a valid RFC 3339 UTC time;
 * 2. every inspected commit's retained evidence is checked, not only the
 *    latest commit's.
 */

import { describe, expect, test } from "vitest";
import type { Authority, Envelope } from "@generalbusiness/artroom-contract";
import { LOG_REF, contentOf, entryId, logFiles, makeCheckpoint, retain, retainedPath, seal } from "../src/entries.ts";
import { MemoryGit, buildTree, encodeCommit, gitObject } from "../src/git.ts";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { b64url, keyPairFromSeed, sha256Hex } from "../src/crypto.ts";
import { LogPublisher, PublishError } from "../src/publisher.ts";
import { RosterReplay } from "../src/roster.ts";
import { parseTime } from "../src/time.ts";
import { verifyLog } from "../src/verify.ts";
import { alice, base, bobAuth, expectReason, lines, publishAs, publishLines } from "./support/logs.ts";
import { RoomSim, keys, memberAuthority, seed } from "./support/room-sim.ts";

// ----------------------------------------------------------------- finding 1

const grantee = keyPairFromSeed(seed(13));

/** Entry 6: @bob delegates `note` to the grantee until `expiresAt`. */
function grant(sim: RoomSim, expiresAt: string) {
  const e = sim.accept(sim.envelope(keys.bob, "roster", null, { op: "delegate", to: grantee.key, kinds: ["note"], lanes: "*", expiresAt }), bobAuth);
  return entryId(e.seq, e.hash);
}

/** The grantee's note under `delegation`, as the next entry. */
function use(sim: RoomSim, delegation: string) {
  const act = sim.envelope(grantee, "note", { act: entryId(5, sim.entries[5]!.hash) }, { text: "delegated note" }, delegation as never);
  return sim.accept(act, { via: "delegation", member: "@bob", role: "member", key: grantee.key, delegation, grantor: keys.bob.key } as Authority);
}

/** Entry `seq` resealed with a different `at`, and everything after it. */
function retime(sim: RoomSim, seq: number, at: string) {
  const out = sim.entries.slice(0, seq);
  for (let i = seq; i < sim.entries.length; i++) {
    const c = contentOf(sim.entries[i]!);
    out.push(seal({ ...c, prev: out[i - 1]!.hash, ...(i === seq ? { at } : {}) }, keys.room.seed));
  }
  return out;
}

describe("finding 1: a time that bounds authority must be a valid RFC 3339 UTC time", () => {
  test("one checked representation: RFC 3339 in UTC with Z, and no rollover", () => {
    expect(parseTime("2026-10-01T12:00:00Z")).toBe(Date.parse("2026-10-01T12:00:00Z"));
    expect(parseTime("2026-10-01T12:00:00.123Z")).toBe(Date.parse("2026-10-01T12:00:00.123Z"));
    for (const bad of ["not-a-time", "2026-10-01", "2026-10-01T12:00:00+01:00", "2026-10-01T12:00:00", "2026-02-30T00:00:00Z", "2026-13-01T00:00:00Z", "2026-10-01T24:00:00Z", 1_700_000_000_000])
      expect(parseTime(bad), String(bad)).toBeNull();
  });

  test("a use at the delegation's expiry is delegation-invalid; before it, it verifies", async () => {
    const atExpiry = await base();
    use(atExpiry, grant(atExpiry, atExpiry.at(7))); // 7, at exactly the expiry
    await expectReason(await publishAs(atExpiry, atExpiry.entries), "delegation-invalid", 7);

    const before = await base();
    use(before, grant(before, before.at(8))); // 7
    expect(await verifyLog(await publishAs(before, before.entries))).toMatchObject({ ok: true, verifiedThrough: 7 });
  });

  test("an entry time that is not a time: malformed, and the prefix ends before it (the expired grant cannot be revived)", async () => {
    const sim = await base();
    use(sim, grant(sim, sim.at(7))); // 7, expired
    const r = await expectReason(await publishAs(sim, retime(sim, 7, "not-a-time")), "malformed", 7);
    expect(r.failures.find((f) => f.reason === "malformed")!.detail).toMatch(/at is not an RFC 3339 UTC time/);
    // A time with an offset is refused too: the contract's form is UTC with Z.
    await expectReason(await publishAs(sim, retime(sim, 7, "2026-10-01T13:00:07+01:00")), "malformed", 7);
  });

  test("a delegation expiry that is not a time: malformed at the grant, so no later use is admitted", async () => {
    const sim = await base();
    use(sim, grant(sim, "not-a-time")); // 6, 7
    await expectReason(await publishAs(sim, sim.entries), "malformed", 6);
  });

  test("an invitation expiry: malformed when not a time; a join at the expiry is invitation-invalid", async () => {
    const secret = new Uint8Array(32).fill(8);
    const invite = (sim: RoomSim, expiresAt: string) => {
      const e = sim.accept(sim.envelope(keys.alice, "roster", null, { op: "invite", member: "@carol", role: "member", custody: "client", expiresAt, secretHash: `sha256:${sha256Hex(secret)}` }), alice);
      return entryId(e.seq, e.hash);
    };
    const join = (sim: RoomSim, invitation: string) =>
      sim.accept(sim.envelope(keys.carol, "roster", null, { op: "join", invitation, secret: b64url(secret) }), { via: "join", member: "@carol", role: "member", key: keys.carol.key, invitation, custody: "client" } as Authority);

    const invalid = await base();
    join(invalid, invite(invalid, "2026-02-30T00:00:00Z")); // 6, 7
    await expectReason(await publishAs(invalid, invalid.entries), "malformed", 6);

    const atExpiry = await base();
    join(atExpiry, invite(atExpiry, atExpiry.at(7))); // 6, 7 at exactly the expiry
    await expectReason(await publishAs(atExpiry, atExpiry.entries), "invitation-invalid", 7);

    const before = await base();
    join(before, invite(before, before.at(8))); // 6, 7
    expect(await verifyLog(await publishAs(before, before.entries))).toMatchObject({ ok: true, verifiedThrough: 7 });
  });

  test("every other log time uses the same check: genesis createdAt, grant notAfter, checkpoint at", async () => {
    const operator = keyPairFromSeed(seed(40));
    const sim = new RoomSim(keys.alice, "@alice", { onboarding: { operator } });
    const g = sim.entries[0]!;
    if (g.entry.type !== "system" || g.entry.event.type !== "genesis") throw new Error("expected genesis");
    const ev = g.entry.event;
    const withGenesis = (genesis: object) => {
      const l = lines(sim.entries);
      l[0] = canonicalize({ ...g, entry: { type: "system", event: { ...ev, genesis } } });
      return l;
    };
    await expectReason(await publishLines(sim, withGenesis({ ...ev.genesis, createdAt: "yesterday" })), "malformed", 0);
    await expectReason(await publishLines(sim, withGenesis({ ...ev.genesis, onboarding: { ...ev.genesis.onboarding!, grant: { ...ev.genesis.onboarding!.grant, notAfter: "2026-10-01T25:00:00Z" } } })), "malformed", 0);
    const r = await verifyLog(await publishLines(sim, lines(sim.entries), {}, canonicalize({ ...sim.checkpoint(), at: "soon" })));
    expect(r.failures).toContainEqual(expect.objectContaining({ reason: "malformed", detail: expect.stringMatching(/checkpoint\.at is not an RFC 3339 UTC time/) }));
  });

  test("the roster replay refuses a non-finite admission time instead of treating it as unlimited", () => {
    const sim = new RoomSim();
    const roster = new RosterReplay(sim.genesis);
    const env = sim.envelope(keys.alice, "note", null, { text: "x" }).envelope as Envelope;
    expect(roster.judge(env, Date.parse(sim.at(2)))).toMatchObject({ ok: true });
    expect(() => roster.judge(env, Number.NaN)).toThrow(RangeError);
    expect(() => roster.judge(env, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test("the publisher refuses a checkpoint whose time is not RFC 3339 UTC", async () => {
    const sim = new RoomSim();
    const cp = makeCheckpoint(sim.room, keys.room.key, keys.room.seed, sim.last, "2026-10-01");
    const err = await new LogPublisher(new MemoryGit()).publish(sim.entries, cp, sim.retained).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err).toMatchObject({ code: "invalid-input" });
  });
});

// ----------------------------------------------------------------- finding 2

/** Push `files` as a log commit on `parent`. */
async function commit(git: MemoryGit, files: Record<string, string>, parent: string | null) {
  const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
  const c = gitObject("commit", encodeCommit({ tree: root, parents: parent ? [parent as never] : [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "fixture\n" }));
  await git.push([...objects, c], LOG_REF, c.sha, parent as never);
  return c.sha;
}

const leaseExpired = (sim: RoomSim) => sim.system({ type: "lease-expired", lane: "act_99_00000000", holder: "@alice", leaseGeneration: 1 } as never);

describe("finding 2: every inspected commit's retained evidence is checked", () => {
  test("a later commit cannot supply a policy its parent's entries needed: policy-missing names the parent", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const first = await p.publish(sim.entries, sim.checkpoint()); // entries 0..1, no retained files
    leaseExpired(sim); // 2
    await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    const r = await verifyLog(git);
    expect(r.ok).toBe(false);
    expect(r.failures).toContainEqual(expect.objectContaining({ reason: "policy-missing", commit: first.commit, seq: 1 }));
    expect(r.failures.find((f) => f.reason === "checker-missing")).toMatchObject({ commit: first.commit, seq: 1 });
    // The entries verify against the head's evidence; only the earlier commit fails.
    expect(r.verifiedThrough).toBe(2);
  });

  test("a later commit cannot supply a replay context its parent's entries needed: input-missing names the parent", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2, with refuse decisions
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained.filter((x) => x.kind === "policy"), sim.checkpoint()), null);
    leaseExpired(sim); // 3
    await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), first);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([expect.objectContaining({ reason: "input-missing", commit: first, seq: 2 })]);
    expect(r.verifiedThrough).toBe(3);
  });

  test("evidence for entries an earlier commit does not publish is not required of it", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), null); // 0..1
    await sim.claim(keys.alice, memberAuthority("@alice", keys.alice.key), ["src/**"]); // 2
    await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), first);
    expect(await verifyLog(git)).toMatchObject({ ok: true, commits: 2, verifiedThrough: 2, failures: [] });
  });

  test("evidence an earlier commit published does not stand in for the head's: a child that drops it fails at the entry", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), null);
    leaseExpired(sim); // 3
    await commit(git, logFiles(sim.entries, sim.retained.filter((x) => x.kind === "policy"), sim.checkpoint()), first);
    await expectReason(git, "input-missing", 2);

    const p = new RoomSim();
    const git2 = new MemoryGit();
    const first2 = await commit(git2, logFiles(p.entries, p.retained, p.checkpoint()), null);
    leaseExpired(p); // 2
    await commit(git2, logFiles(p.entries, p.retained.filter((x) => x.kind === "input"), p.checkpoint()), first2);
    await expectReason(git2, "policy-missing", 1);
  });

  test("a bad retained digest in an earlier commit is reported even after a child removes it", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const bogus = `artroom-log/v1/inputs/${"0".repeat(64)}.json`;
    const first = await commit(git, { ...logFiles(sim.entries, sim.retained, sim.checkpoint()), [bogus]: "{}" }, null);
    leaseExpired(sim); // 2
    await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), first);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([expect.objectContaining({ reason: "retained-digest", commit: first })]);
    expect(r.verifiedThrough).toBe(2);
  });

  test("a malformed retained file in an earlier commit is reported even after a child removes it", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const junk = retain("input", { kind: "nothing" });
    const first = await commit(git, { ...logFiles(sim.entries, sim.retained, sim.checkpoint()), [retainedPath(junk)]: junk.body }, null);
    leaseExpired(sim); // 2
    const second = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), first);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([expect.objectContaining({ reason: "malformed", commit: first })]);
    expect(r.failures.some((f) => f.commit === second)).toBe(false);
  });
});
