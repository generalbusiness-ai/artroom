/**
 * Checker review a454cbaf (lane L revision 3):
 * 1. a retained file's decoding is reused only for the same contract and
 *    digest, never across inputs/, policies/ and checker configurations;
 * and lane A's request: `commitFor` gives the exact commit `publish` writes.
 */

import { describe, expect, test } from "vitest";
import type { LogEntry, PolicyDocument } from "@generalbusiness/artroom-contract";
import { policy, rule } from "@generalbusiness/artroom-policy";
import { LOG_REF, logFiles, retain, retainedPath, type Retained } from "../src/entries.ts";
import { MemoryGit, buildTree, encodeCommit, gitObject } from "../src/git.ts";
import { utf8 } from "../src/canonical.ts";
import { decodeRetained } from "../src/decode.ts";
import { digestJson } from "../src/crypto.ts";
import { LogPublisher } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { DEMO_CHECKERS, DEMO_POLICY, RoomSim, keys } from "./support/room-sim.ts";
import { alice, expectReason } from "./support/logs.ts";

async function commit(git: MemoryGit, files: Record<string, string>, parent: string | null) {
  const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
  const c = gitObject("commit", encodeCommit({ tree: root, parents: parent ? [parent as never] : [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "fixture\n" }));
  await git.push([...objects, c], LOG_REF, c.sha, parent as never);
  return c.sha;
}

const leaseExpired = (sim: RoomSim) => sim.system({ type: "lease-expired", lane: "act_99_00000000", holder: "@alice", leaseGeneration: 1 } as never);

/** A file with these exact bytes under another directory. */
const as = (kind: Retained["kind"], r: Retained): Retained => ({ kind, body: r.body });

const POLICY_B: PolicyDocument = policy(rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', fix: "Claim less.", reason: "Too wide." }));

/** A policy-activated event naming `doc` (by digest) and `checkers`, without retaining anything. */
function activation(sim: RoomSim, digest: string, checkers: { name: string; config: string }[] = []) {
  return sim.system({ type: "policy-activated", policy: digest, checkers, commit: null, previous: sim.policy.version, recomputed: { proposals: 0, reopened: 0, fenced: [] } } as never);
}

describe("finding: retained decoding is keyed by contract and digest", () => {
  test("a policy's bytes added under inputs/ by a child are a malformed input at that commit", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), null);
    expect(await verifyLog(git)).toMatchObject({ ok: true });
    const bad = as("input", retain("policy", DEMO_POLICY));
    expect(() => decodeRetained("input", utf8(bad.body))).toThrow();
    leaseExpired(sim); // 2
    const second = await commit(git, { ...logFiles(sim.entries, sim.retained, sim.checkpoint()), [retainedPath(bad)]: bad.body }, first);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([expect.objectContaining({ reason: "malformed", commit: second, detail: expect.stringContaining(retainedPath(bad)) })]);
    expect(r.verifiedThrough).toBe(2);
  });

  test("the same bytes as a malformed input and a valid policy, in one commit: the input fails, the policy still activates", async () => {
    const sim = new RoomSim();
    const bad = as("input", retain("policy", DEMO_POLICY));
    const git = new MemoryGit();
    const root = await commit(git, { ...logFiles(sim.entries, sim.retained, sim.checkpoint()), [retainedPath(bad)]: bad.body }, null);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([expect.objectContaining({ reason: "malformed", commit: root, detail: expect.stringContaining("inputs/") })]);
    expect(r.verifiedThrough).toBe(1);
  });

  test("a malformed input in a parent does not poison the same bytes as a policy a child activates", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const bad = as("input", retain("policy", POLICY_B));
    const first = await commit(git, { ...logFiles(sim.entries, sim.retained, sim.checkpoint()), [retainedPath(bad)]: bad.body }, null);
    sim.activate(POLICY_B); // 2: retains POLICY_B under policies/
    const second = await commit(git, { ...logFiles(sim.entries, sim.retained, sim.checkpoint()), [retainedPath(bad)]: bad.body }, first);
    const r = await verifyLog(git);
    expect(r.verifiedThrough).toBe(2);
    expect(r.failures.map((f) => [f.reason, f.commit])).toEqual([
      ["malformed", first],
      ["malformed", second],
    ]);
  });

  test("a valid replay context in a parent does not stand for the same bytes named as a policy: malformed at the activation", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const context = sim.retained.find((x) => x.kind === "input")!;
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), null);
    activation(sim, digestJson(JSON.parse(context.body))); // 3: names the context's digest as a policy
    await commit(git, logFiles(sim.entries, [...sim.retained, as("policy", context)], sim.checkpoint()), first);
    const r = await expectReason(git, "malformed", 3);
    expect(r.failures.find((f) => f.seq === 3)!.detail).toMatch(/policies\/.*not a policy document/);
  });

  test("a policy document decoded as a policy does not stand for the same bytes named as a checker: malformed at the activation", async () => {
    const sim = new RoomSim();
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), null);
    const d = digestJson(DEMO_POLICY);
    activation(sim, d, [{ name: "odd", config: d }]); // 2: the policy's bytes as a checker configuration
    await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), first);
    const r = await expectReason(git, "malformed", 2);
    expect(r.failures.find((f) => f.seq === 2)!.detail).toMatch(/checker odd: .*not one/);
  });

  test("positives: the same bytes under inputs/ and policies/ where each contract allows them", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const context = sim.retained.find((x) => x.kind === "input")!;
    // An unnamed file under policies/ need only be JSON; the same bytes are a valid replay context under inputs/.
    const r = await verifyLog(await publishWith(sim, [...sim.retained, as("policy", context)]));
    expect(r).toMatchObject({ ok: true, verifiedThrough: 2 });
  });

  test("positives: repeated identical content where each contract allows it", async () => {
    const sim = new RoomSim();
    // One checker configuration named by two checkers, and the same policy activated again.
    sim.activate(DEMO_POLICY, { again: DEMO_CHECKERS["test"]!, test: DEMO_CHECKERS["test"]! }); // 2
    const ev = sim.entries[2]!.entry;
    expect(ev.type === "system" && ev.event.type === "policy-activated" && new Set(ev.event.checkers.map((c) => c.config)).size).toBe(1);
    // Two identical claims share one replay context.
    await sim.claim(keys.alice, alice, ["src/**"]); // 3
    await sim.claim(keys.alice, alice, ["src/**"]); // 4
    const inputs = (n: number) => (sim.entries[n]!.entry as Extract<LogEntry["entry"], { type: "act" }>).receipt.decisions.map((d) => d.input);
    expect(inputs(3)).toEqual(inputs(4));
    const git = new MemoryGit();
    const first = await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), null);
    leaseExpired(sim); // 5
    await commit(git, logFiles(sim.entries, sim.retained, sim.checkpoint()), first);
    const r = await verifyLog(git);
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, commits: 2, verifiedThrough: 5 });
  });
});

async function publishWith(sim: RoomSim, retained: Retained[]) {
  const git = new MemoryGit();
  await commit(git, logFiles(sim.entries, retained, sim.checkpoint()), null);
  return git;
}

describe("commitFor: the exact commit publish writes, without pushing", () => {
  test("a root commit, then a child with retained files, then after a restart", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]); // 2
    const git = new MemoryGit();
    const p = new LogPublisher(git);

    const cp1 = sim.checkpoint();
    const expected1 = p.commitFor(null, sim.entries, cp1, sim.retained);
    expect(git.pushes).toBe(0);
    expect(await git.readRef(LOG_REF)).toBeNull();
    const r1 = await p.publish(sim.entries, cp1, sim.retained);
    expect(r1.commit).toBe(expected1);

    // A non-root parent, with every retained file passed, as the Room does.
    await sim.claim(keys.alice, alice, ["docs/**"]); // 3
    const cp2 = sim.checkpoint();
    const expected2 = p.commitFor(p.head, sim.entries, cp2, sim.retained);
    expect(git.pushes).toBe(1);
    const r2 = await p.publish(sim.entries, cp2, sim.retained);
    expect(r2.commit).toBe(expected2);

    // Only the new retained file: the publisher keeps the parent's, in both.
    await sim.claim(keys.alice, alice, ["lib/**"]); // 4
    const cp3 = sim.checkpoint();
    const fresh = [sim.retained.at(-1)!];
    const expected3 = p.commitFor(p.head, sim.entries, cp3, fresh);
    expect((await p.publish(sim.entries, cp3, fresh)).commit).toBe(expected3);

    // After a restart, from the ref.
    const resumed = await LogPublisher.open(git);
    leaseExpired(sim); // 5
    const cp4 = sim.checkpoint();
    const expected4 = resumed.commitFor(resumed.head, sim.entries, cp4, []);
    expect((await resumed.publish(sim.entries, cp4, [])).commit).toBe(expected4);
    expect(await verifyLog(git)).toMatchObject({ ok: true, commits: 4, verifiedThrough: 5 });
  });

  test("the parent is part of the commit", () => {
    const sim = new RoomSim();
    const p = new LogPublisher(new MemoryGit());
    const cp = sim.checkpoint();
    expect(p.commitFor(null, sim.entries, cp, sim.retained)).not.toBe(p.commitFor("f".repeat(40) as never, sim.entries, cp, sim.retained));
  });
});
