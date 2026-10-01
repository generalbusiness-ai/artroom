/** Helpers shared by the tamper and review tests: a base room, resealing, and publishing a log as one commit. */

import { expect } from "vitest";
import type { LogEntry } from "@generalbusiness/artroom-contract";
import { MemoryGit, buildTree, encodeCommit, gitObject } from "../../src/git.ts";
import { LOG_REF, ROOT, contentOf, entryId, logFiles, makeCheckpoint, retainedPath, seal, segmentPath, type Retained } from "../../src/entries.ts";
import { canonicalize, utf8 } from "../../src/canonical.ts";
import { b64url, sha256Hex } from "../../src/crypto.ts";
import { verifyLog, type VerifyReason } from "../../src/verify.ts";
import { keys, memberAuthority, RoomSim } from "./room-sim.ts";

export const alice = memberAuthority("@alice", keys.alice.key);
export const bobAuth = memberAuthority("@bob", keys.bob.key, "member");

/** A room with @bob joined as a member: entries 0..5. */
export async function base() {
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
export function reseal(entries: LogEntry[], from: number): LogEntry[] {
  const out = entries.slice(0, from);
  for (let i = from; i < entries.length; i++) {
    const c = contentOf(entries[i]!);
    out.push(seal({ ...c, seq: i, prev: i === 0 ? null : out[i - 1]!.hash }, keys.room.seed));
  }
  return out;
}

/** Push `files` (path to bytes or text) as one root log commit. */
export async function publishFiles(files: Record<string, string | Uint8Array>, git = new MemoryGit()) {
  const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, typeof t === "string" ? utf8(t) : t])));
  const commit = gitObject("commit", encodeCommit({ tree: root, parents: [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "tampered\n" }));
  await git.push([...objects, commit], LOG_REF, commit.sha, null);
  return git;
}

/** Publish `entries` as one commit, with a valid checkpoint on the last entry. */
export async function publishAs(sim: RoomSim, entries: LogEntry[], retained: Retained[] = sim.retained) {
  const last = entries.at(-1)!;
  const cp = makeCheckpoint(sim.room, keys.room.key, keys.room.seed, last, sim.at(99));
  return publishFiles(logFiles(entries, retained, { ...cp, through: last.seq, hash: last.hash }));
}

/** Verify, and expect the named reason; with `seq`, at that entry, and the verified prefix just before it. */
export async function expectReason(git: MemoryGit, reason: VerifyReason, seq?: number) {
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

/** Publish raw segment lines (and optional extra files) with the base room's genesis and a checkpoint on its last entry. */
export async function publishLines(sim: RoomSim, lines: (string | Uint8Array)[], extra: Record<string, string | Uint8Array> = {}, checkpoint: string = canonicalize(sim.checkpoint())) {
  const parts = lines.map((l) => (typeof l === "string" ? utf8(l) : l));
  const segment = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, -1));
  let at = 0;
  for (const [i, p] of parts.entries()) {
    if (i) segment[at++] = 0x0a;
    segment.set(p, at);
    at += p.length;
  }
  const files: Record<string, string | Uint8Array> = {
    [`${ROOT}/genesis.json`]: canonicalize(sim.genesis),
    [segmentPath(0)]: segment,
    [`${ROOT}/checkpoint.json`]: checkpoint,
    ...Object.fromEntries(sim.retained.map((r) => [retainedPath(r), r.body])),
    ...extra,
  };
  return publishFiles(files);
}

export const lines = (entries: readonly LogEntry[]) => entries.map((e) => canonicalize(e));
