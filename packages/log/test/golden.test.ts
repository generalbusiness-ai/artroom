/** Golden logs built through the contract's sealing order, published and verified (R-LOG-2, R-LOG-8 to 11). */

import { describe, expect, test } from "vitest";
import { MemoryGit, parseCommit } from "../src/git.ts";
import { LOG_REF, entryId } from "../src/entries.ts";
import { LogPublisher, PublishError, publicationDue, readLogFiles, readPublishedEntries } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { goldenLog, keys, memberAuthority, RoomSim } from "./support/room-sim.ts";

describe("protocol section 20: a claim, its notification and two publications", () => {
  test("every value is computed from earlier values, and the log verifies", async () => {
    const { sim, remote, c1, c2, c3, lanes } = await goldenLog();
    const e = sim.entries;
    expect(e[0]!.entry.type === "system" && e[0]!.entry.event.type).toBe("genesis");
    expect(e[1]!.entry.type === "system" && e[1]!.entry.event.type).toBe("policy-activated");
    // Entry 2: the claim's opened effect names no lane; the lane is derived from h(2).
    const claim = e[2]!;
    expect(claim.entry.type === "act" && claim.entry.receipt.effects[0]).not.toHaveProperty("lane");
    expect(lanes[0]).toBe(entryId(2, claim.hash));
    // Entry 3: notified names L.
    expect(e[3]!.entry.type === "system" && e[3]!.entry.event).toMatchObject({ type: "notified", entry: lanes[0] });
    // C1 publishes 0..3; entry 4 names C1; C2 publishes 0..9 with C1 as parent; entry 10 names C2.
    expect(c1).toMatchObject({ through: 3, hash: e[3]!.hash, publishedThrough: 3 });
    expect(e[4]!.entry.type === "system" && e[4]!.entry.event).toEqual({ type: "checkpoint", through: 3, hash: e[3]!.hash, commit: c1.commit });
    expect(c2.through).toBe(9);
    expect(e[10]!.entry.type === "system" && e[10]!.entry.event).toEqual({ type: "checkpoint", through: 9, hash: e[9]!.hash, commit: c2.commit });
    const git = remote as MemoryGit;
    expect(parseCommit((await git.readObject(c1.commit)).data).parents).toEqual([]);
    expect(parseCommit((await git.readObject(c2.commit)).data).parents).toEqual([c1.commit]);
    expect(parseCommit((await git.readObject(c3.commit)).data).parents).toEqual([c2.commit]);
    expect((await readPublishedEntries(git, c2.commit)).slice(0, 4)).toEqual(e.slice(0, 4));
    expect(await git.readRef(LOG_REF)).toBe(c3.commit);

    const report = await verifyLog(git);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, room: sim.room, commits: 3, verifiedThrough: 10, publishedThrough: 10, last: { id: entryId(10, e[10]!.hash) } });
    expect(report.cannotProve[0]).toMatch(/unpublished acts/);
  });

  test("every recorded policy decision replays from its retained context", async () => {
    const { sim, remote } = await goldenLog();
    const recorded = sim.entries.flatMap((e) =>
      e.entry.type === "system" ? (e.entry.event.type === "notified" ? e.entry.event.decisions : []) : e.entry.receipt.decisions,
    );
    expect(recorded.length).toBeGreaterThanOrEqual(5);
    const report = await verifyLog(remote);
    expect(report.decisionsReplayed).toBe(recorded.length);
  });

  test("the published tree has the R-LOG-9 layout", async () => {
    const { remote, c3 } = await goldenLog();
    const paths = [...(await readLogFiles(remote, c3.commit)).keys()].sort();
    expect(paths.filter((p) => !/\/(inputs|policies)\//.test(p))).toEqual([
      "artroom-log/v1/checkpoint.json",
      "artroom-log/v1/genesis.json",
      "artroom-log/v1/segments/000000000000.jsonl",
    ]);
    expect(paths.some((p) => p.startsWith("artroom-log/v1/inputs/"))).toBe(true);
    expect(paths.filter((p) => p.startsWith("artroom-log/v1/policies/"))).toHaveLength(1);
  });
});

describe("publication", () => {
  async function small() {
    const sim = new RoomSim();
    await sim.claim(keys.alice, memberAuthority("@alice", keys.alice.key), ["src/**"]);
    return sim;
  }

  test("records publishedThrough and the lag; publishing the same prefix again changes nothing", async () => {
    const sim = await small();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    expect(p.publishedThrough).toBe(-1);
    expect(p.lag(2)).toBe(3);
    const r = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(p.publishedThrough).toBe(2);
    expect(p.lag(5)).toBe(3);
    const again = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(again).toMatchObject({ commit: r.commit, attempts: 0 });
    expect(git.pushes).toBe(1);
  });

  test("an unclear answer before the update retries the same commit; after it, read-back confirms", async () => {
    const sim = await small();
    const git = new MemoryGit();
    git.failNext = ["before", "after"];
    const p = new LogPublisher(git);
    const r = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(r.attempts).toBe(2);
    expect(await git.readRef(LOG_REF)).toBe(r.commit);
    expect(git.pushes).toBe(2);
  });

  test("retries run out as unresolved; publishing again completes forward with the same commit", async () => {
    const sim = await small();
    const git = new MemoryGit();
    git.failNext = ["before", "before"];
    const p = new LogPublisher(git, { attempts: 2 });
    const err = await p.publish(sim.entries, sim.checkpoint(), sim.retained).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err).toMatchObject({ code: "unresolved", retryable: true });
    expect(await git.readRef(LOG_REF)).toBeNull();
    const r = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(await git.readRef(LOG_REF)).toBe(r.commit);
  });

  test("an unexpected writer stops the publisher; it never forces", async () => {
    const sim = await small();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    const theirs = "f".repeat(40) as never;
    git.refs.set(LOG_REF, theirs);
    await sim.claim(keys.alice, memberAuthority("@alice", keys.alice.key), ["docs/**"]);
    const err = await p.publish(sim.entries, sim.checkpoint(), sim.retained).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "unexpected-writer" });
    expect(await git.readRef(LOG_REF)).toBe(theirs);
  });

  test("published history is never rewritten", async () => {
    const sim = await small();
    const p = new LogPublisher(new MemoryGit());
    await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    const changed = [...sim.entries];
    changed[2] = { ...changed[2]!, at: "2026-10-02T00:00:00.000Z" };
    const err = await p.publish(changed, sim.checkpoint(), sim.retained).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "would-rewrite" });
  });

  test("a restarted publisher resumes from the ref", async () => {
    const { remote, c3 } = await goldenLog();
    const p = await LogPublisher.open(remote);
    expect(p.head).toBe(c3.commit);
    expect(p.publishedThrough).toBe(10);
  });

  test("batching: publish when the lag or the delay reaches its limit", () => {
    const policy = { maxLag: 50, maxDelayMs: 5000 };
    expect(publicationDue(policy, 0, null, 0)).toBe(false);
    expect(publicationDue(policy, 10, 1000, 2000)).toBe(false);
    expect(publicationDue(policy, 10, 1000, 6000)).toBe(true);
    expect(publicationDue(policy, 50, 1000, 1000)).toBe(true);
  });
});

test("the run uses the runtime its config names", () => {
  const agent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
  if (__ARTROOM_RUNTIME__ === "workerd") expect(agent).toBe("Cloudflare-Workers");
  else expect(agent).toMatch(/^Node\.js\//);
});
