/**
 * Tamper cases. Each changes a log and checks that `verify` names the
 * reason and stops the verified prefix before the change. Cases marked
 * "resealed" re-hash and re-sign entries with the room key, as a faulty or
 * compromised Room would, so only the semantic check can catch them.
 */

import { describe, expect, test } from "vitest";
import type { LogEntry } from "@generalbusiness/artroom-contract";
import { MemoryGit, buildTree, encodeCommit, gitObject } from "../src/git.ts";
import { LOG_REF, contentOf, entryId, logFiles, makeCheckpoint, seal, type Retained } from "../src/entries.ts";
import { LogPublisher } from "../src/publisher.ts";
import { utf8 } from "../src/canonical.ts";
import { b64url, sha256Hex, sign } from "../src/crypto.ts";
import { verifyLog, type VerifyReason } from "../src/verify.ts";
import { keys, memberAuthority, RoomSim, seed } from "./support/room-sim.ts";
import { keyPairFromSeed } from "../src/crypto.ts";

const alice = memberAuthority("@alice", keys.alice.key);
const bobAuth = memberAuthority("@bob", keys.bob.key, "member");

/** A room with @bob joined: entries 0..5. */
async function base() {
  const sim = new RoomSim();
  await sim.claim(keys.alice, alice, ["src/**"]); // 2
  const secret = new Uint8Array(32).fill(7);
  const inv = sim.accept(sim.envelope(keys.alice, "roster", null, { op: "invite", member: "@bob", role: "member", custody: "client", expiresAt: sim.at(5000), secretHash: `sha256:${sha256Hex(secret)}` }), alice); // 3
  const invId = entryId(inv.seq, inv.hash);
  sim.accept(sim.envelope(keys.bob, "roster", null, { op: "join", invitation: invId, secret: b64url(secret) }), { via: "join", member: "@bob", role: "member", key: keys.bob.key, invitation: invId, custody: "client" }); // 4
  await sim.claim(keys.bob, bobAuth, ["docs/**"]); // 5
  return sim;
}

/** Re-seal entries from `from` onwards with the room key, fixing prev and hash. */
function reseal(entries: LogEntry[], from: number): LogEntry[] {
  const out = entries.slice(0, from);
  for (let i = from; i < entries.length; i++) {
    const c = contentOf(entries[i]!);
    out.push(seal({ ...c, seq: i, prev: i === 0 ? null : out[i - 1]!.hash }, keys.room.seed));
  }
  return out;
}

/** Publish `entries` as one commit, with a valid checkpoint on the last entry. */
async function publishAs(sim: RoomSim, entries: LogEntry[], retained: Retained[] = sim.retained) {
  const git = new MemoryGit();
  const last = entries.at(-1)!;
  const cp = makeCheckpoint(sim.room, keys.room.key, keys.room.seed, last, sim.at(99));
  const files = logFiles(entries, retained, { ...cp, through: last.seq, hash: last.hash });
  const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
  const commit = gitObject("commit", encodeCommit({ tree: root, parents: [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "tampered\n" }));
  await git.push([...objects, commit], LOG_REF, commit.sha, null);
  return git;
}

async function expectReason(git: MemoryGit, reason: VerifyReason, seq?: number) {
  const r = await verifyLog(git);
  expect(r.ok).toBe(false);
  const f = r.failures.find((x) => x.reason === reason);
  expect(f, `reasons: ${r.failures.map((x) => `${x.reason}@${x.seq}`).join(", ")}`).toBeDefined();
  if (seq !== undefined) {
    expect(f!.seq).toBe(seq);
    expect(r.verifiedThrough).toBe(seq - 1);
  }
  return r;
}

describe("tamper cases, each with a named reason", () => {
  test("the untampered base log verifies", async () => {
    const sim = await base();
    const r = await verifyLog(await publishAs(sim, sim.entries));
    expect(r.failures).toEqual([]);
    expect(r.verifiedThrough).toBe(5);
  });

  test("reordered entries: entry-order", async () => {
    const sim = await base();
    const e = [...sim.entries];
    [e[3], e[4]] = [e[4]!, e[3]!];
    await expectReason(await publishAs(sim, e), "entry-order", 3);
  });

  test("a dropped entry: seq-gap", async () => {
    const sim = await base();
    const e = sim.entries.filter((x) => x.seq !== 3);
    await expectReason(await publishAs(sim, e), "seq-gap", 3);
  });

  test("an altered entry: hash-mismatch", async () => {
    const sim = await base();
    const e = [...sim.entries];
    e[2] = { ...e[2]!, at: "2027-01-01T00:00:00.000Z" };
    await expectReason(await publishAs(sim, e), "hash-mismatch", 2);
  });

  test("an altered entry re-hashed without the room key: room-signature", async () => {
    const sim = await base();
    const e = [...sim.entries];
    const forged = seal({ ...contentOf(e[2]!), at: "2027-01-01T00:00:00.000Z" }, seed(66));
    e[2] = forged;
    await expectReason(await publishAs(sim, e), "room-signature", 2);
  });

  test("a changed envelope (resealed): actor-signature", async () => {
    const sim = await base();
    const e = [...sim.entries];
    const c = contentOf(e[5]!);
    if (c.entry.type !== "act") throw new Error("expected an act");
    const env = { ...c.entry.act.envelope, body: { goal: "Something else", scope: ["docs/**"] } } as typeof c.entry.act.envelope;
    e[5] = { ...e[5]!, entry: { ...c.entry, act: { ...c.entry.act, envelope: env } } };
    await expectReason(await publishAs(sim, reseal(e, 5)), "actor-signature", 5);
  });

  test("a bad genesis admin signature: genesis-signature", async () => {
    const sim = await base();
    const e = [...sim.entries];
    const g = contentOf(e[0]!);
    if (g.entry.type !== "system" || g.entry.event.type !== "genesis") throw new Error("expected genesis");
    e[0] = { ...g, entry: { type: "system", event: { ...g.entry.event, sig: sign(seed(66), "artroom-genesis-v1", g.entry.event.genesis) } } } as LogEntry;
    await expectReason(await publishAs(sim, reseal(e, 0)), "genesis-signature", 0);
  });

  test("a revoked key admitted after its revocation (resealed by a faulty room): key-revoked", async () => {
    const sim = await base();
    sim.accept(sim.envelope(keys.alice, "roster", null, { op: "revoke-key", key: keys.bob.key, reason: "retired" }), alice); // 6
    const late = sim.envelope(keys.bob, "note", { act: entryId(2, sim.entries[2]!.hash) }, { text: "signed before the revocation" });
    sim.accept(late, bobAuth); // 7: should have been refused key-revoked (R-ADM-4)
    await expectReason(await publishAs(sim, sim.entries), "key-revoked", 7);
  });

  test("a wrong policy decision (resealed): policy-decision-mismatch", async () => {
    const sim = await base();
    const e = [...sim.entries];
    const c = contentOf(e[5]!);
    if (c.entry.type !== "act") throw new Error("expected an act");
    const [d] = c.entry.receipt.decisions;
    const wrong = { ...d!, outcome: { result: "refuse" as const, reason: "x", fix: "y" } };
    e[5] = { ...e[5]!, entry: { ...c.entry, receipt: { ...c.entry.receipt, decisions: [wrong] } } };
    await expectReason(await publishAs(sim, reseal(e, 5)), "policy-decision-mismatch", 5);
  });

  test("a decision whose replay context is not published: input-missing", async () => {
    const sim = await base();
    await expectReason(await publishAs(sim, sim.entries, sim.retained.filter((r) => r.kind === "policy")), "input-missing", 2);
  });

  test("a recorded authority that differs from the roster (resealed): authority-mismatch", async () => {
    const sim = await base();
    const e = [...sim.entries];
    const c = contentOf(e[5]!);
    if (c.entry.type !== "act") throw new Error("expected an act");
    e[5] = { ...e[5]!, entry: { ...c.entry, receipt: { ...c.entry.receipt, authority: { ...bobAuth, role: "admin" } as never } } };
    await expectReason(await publishAs(sim, reseal(e, 5)), "authority-mismatch", 5);
  });

  test("an act by a key that never joined: not-member", async () => {
    const sim = await base();
    const carol = keyPairFromSeed(seed(5));
    sim.accept(sim.envelope(carol, "note", { act: entryId(2, sim.entries[2]!.hash) }, { text: "hi" }), memberAuthority("@carol", carol.key, "member"));
    await expectReason(await publishAs(sim, sim.entries), "not-member", 6);
  });

  test("a reused idempotency key: idempotency-duplicate", async () => {
    const sim = await base();
    const first = sim.entries[5]!;
    if (first.entry.type !== "act") throw new Error("expected an act");
    const env = { ...first.entry.act.envelope, body: { goal: "again", scope: ["docs/**"] } } as typeof first.entry.act.envelope;
    sim.accept({ envelope: env, sig: sign(keys.bob.seed, "artroom-envelope-v1", env) }, bobAuth, first.entry.receipt.decisions);
    await expectReason(await publishAs(sim, sim.entries), "idempotency-duplicate", 6);
  });

  test("an opened effect that names its own lane: self-reference", async () => {
    const sim = await base();
    const e = [...sim.entries];
    const c = contentOf(e[5]!);
    if (c.entry.type !== "act") throw new Error("expected an act");
    const effects = c.entry.receipt.effects.map((x) => ({ ...x, lane: "act_5_00000000" }));
    e[5] = { ...e[5]!, entry: { ...c.entry, receipt: { ...c.entry.receipt, effects: effects as never } } };
    await expectReason(await publishAs(sim, reseal(e, 5)), "self-reference", 5);
  });

  test("an entry notified twice: notified-twice", async () => {
    const sim = await base();
    const lane = entryId(5, sim.entries[5]!.hash);
    await sim.notified(lane, "claim", "@bob");
    await sim.notified(lane, "claim", "@bob");
    await expectReason(await publishAs(sim, sim.entries), "notified-twice", 7);
  });

  test("a checkpoint event naming a commit that is not an earlier log commit: checkpoint-event-mismatch", async () => {
    const sim = await base();
    sim.system({ type: "checkpoint", through: 5, hash: sim.entries[5]!.hash, commit: "a".repeat(40) as never });
    await expectReason(await publishAs(sim, sim.entries), "checkpoint-event-mismatch", 6);
  });

  test("a checkpoint signed by another key: checkpoint-signature", async () => {
    const sim = await base();
    const git = new MemoryGit();
    const last = sim.last;
    const cp = makeCheckpoint(sim.room, keys.room.key, seed(66), last, sim.at(99));
    const files = logFiles(sim.entries, sim.retained, cp);
    const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
    const commit = gitObject("commit", encodeCommit({ tree: root, parents: [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "x\n" }));
    await git.push([...objects, commit], LOG_REF, commit.sha, null);
    await expectReason(git, "checkpoint-signature");
  });

  test("a later log commit that changes a published entry: history-rewritten", async () => {
    const sim = await base();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const first = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    // A second commit, written past the publisher, with entry 2 changed and everything after resealed.
    const e = [...sim.entries];
    e[2] = { ...e[2]!, at: "2027-01-01T00:00:00.000Z" };
    const rewritten = reseal(e, 2);
    const cp = makeCheckpoint(sim.room, keys.room.key, keys.room.seed, rewritten.at(-1)!, sim.at(99));
    const files = logFiles(rewritten, sim.retained, cp);
    const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p2, t]) => [p2, utf8(t)])));
    const commit = gitObject("commit", encodeCommit({ tree: root, parents: [first.commit], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "x\n" }));
    await git.push([...objects, commit], LOG_REF, commit.sha, first.commit);
    const r = await expectReason(git, "history-rewritten");
    // Only commit-level reasons: the entries verified are the first commit's, which are intact.
    expect(r.failures.map((f) => f.reason).sort()).toEqual(["checkpoint-not-advancing", "history-rewritten"]);
    expect(r.verifiedThrough).toBe(5);
  });
});
