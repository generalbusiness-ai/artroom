// The landing engine's publisher over real git (`GitPublisher` on `GitOps`).
//
// The engine's own tests (landing.test.ts) run against the canonical
// repository in memory. The first test here is what makes that fair: one
// script runs through the git publisher, on a repository on disk, and through
// the memory repository, built from the same commits, and every answer must
// be the same, the integration commit included. The second lands two lanes
// through the engine and real git, across a restart.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpId, Sha } from "@generalbusiness/artroom-contract";
import { Landing, type PublisherPort } from "../src/landing/engine.ts";
import { GitPublisher } from "../src/publisher/git-publisher.ts";
import { integrationRef, objectsRef, pinnedRef } from "../src/publisher/gitops.ts";
import { outcomeNote, type PushOutcome } from "../src/publisher/push-outcome.ts";
import { Clock, FakeRoom, FakeTokens, Fixture, MemoryCanonical, actId, edit, laneId, lines, localExec, nodeSql, objectsIn, opId } from "./support.ts";

const lane = laneId(1);

/** What the engine reads of a push's answer: the outcome, and the kind of refusal. Git's own text differs. */
const told = (o: PushOutcome) => outcomeNote(o);

/**
 * One history in either repository: main has moved to a commit dated after
 * the lane's heads. Generation 1 is ahead of the new main, generation 2
 * edits another file on the old main, and generation 3 edits the line main
 * edited. The repository's attributes ask for a union merge of that file.
 */
function history(c: Fixture | MemoryCanonical) {
  c.init({ ".gitattributes": "src/*.txt merge=union\n", "src/a.txt": lines("a"), "src/b.txt": lines("b") });
  const main = c.commit(c.main, { "src/b.txt": edit(lines("b"), 3, "main side") }, { at: 1_800_000_000 });
  c.setMain(main);
  const ahead = c.propose(lane, 1, main, { "src/c.txt": "new\n" });
  const apart = c.propose(lane, 2, c.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  const clash = c.propose(lane, 3, c.main, { "src/b.txt": edit(lines("b"), 3, "lane side") });
  return { first: c.main, main, ahead, apart, clash };
}

/** Every call the engine makes of a publisher, in one script. */
async function script(p: PublisherPort, h: ReturnType<typeof history>) {
  const op = opId(1);
  const build = (generation: number, head: Sha, attempt: number) => p.integrate({ op, attempt, lane, generation, head, expectedMain: h.main });
  const forward = await build(1, h.ahead, 1);
  const merge = await build(2, h.apart, 2);
  const conflict = await build(3, h.clash, 3);
  const notPinned = await build(1, h.apart, 4); // generation 1 is pinned at another head
  assert.ok(merge.kind === "clean");
  const push = (integration: Sha, expectedMain: Sha, ref: string) => p.push({ op, n: 1, integration, integrationRef: ref, expectedMain, token: "unused" });
  const stale = await push(merge.integration, h.first, merge.ref);
  const landed = await push(merge.integration, h.main, merge.ref);
  const again = await push(merge.integration, h.main, merge.ref);
  const late = await push(h.ahead, h.main, pinnedRef(lane, 1)); // main has moved since this one was prepared
  return { forward, merge, conflict, notPinned, stale: told(stale), landed: told(landed), again: told(again), late: told(late), main: await p.readMain(), upToDate: again.detail };
}

test("the memory repository answers the engine as the git publisher does over real git: a fast-forward, a merge (the same commit), a conflict, a head that is not the pinned one, and each push under the lease", async (t) => {
  const f = new Fixture();
  t.after(() => f.dispose());
  const h = history(f);
  const real = await script(new GitPublisher(f.ops, f.canonical), h);
  const memory = new MemoryCanonical();
  assert.deepEqual(history(memory), h, "the same commits in both");
  const { upToDate: _, ...model } = await script(memory.publisher, h);
  const { upToDate, ...git } = real;
  assert.deepEqual(model, git);
  assert.equal(memory.canonicalMain(), f.canonicalMain());

  // What git answered, in its own terms.
  assert.deepEqual(real.forward, { kind: "clean", integration: h.ahead, ref: pinnedRef(lane, 1) });
  assert.ok(real.merge.kind === "clean");
  const merged = real.merge.integration;
  assert.equal(real.merge.ref, integrationRef(opId(1), 2));
  assert.equal(f.ref(integrationRef(opId(1), 2)), merged, "stored in the canonical repo, for checkers and for the push");
  assert.match(f.show(merged, "src/a.txt"), /lane side/);
  assert.match(f.show(merged, "src/b.txt"), /main side/);
  // Every input of the merge commit is fixed by (main, head, lane, generation): the parents, the Room's name,
  // the message, and both dates at the later parent's commit time, here main's. A rebuild is the same commit.
  const c = f.git.commitFacts(merged);
  const who = "artroom <room@artroom.invalid> 1800000000 +0000";
  assert.equal(c.raw, `tree ${c.tree}\nparent ${h.main}\nparent ${h.apart}\nauthor ${who}\ncommitter ${who}\n\nLand ${lane} generation 2\n`);
  // A conflict lists the paths and stores nothing. The repository's attributes cannot change a merge.
  assert.deepEqual(real.conflict, { kind: "conflict", paths: ["src/b.txt"] });
  assert.equal(f.ref(integrationRef(opId(1), 3)), null);
  const plain = await localExec(["git", "--git-dir", f.canonical, "-c", `attr.tree=${h.clash}`, "merge-tree", "--write-tree", "--name-only", h.main, h.clash], { env: {} });
  assert.equal(plain.code, 0, "control: plain git, reading the attributes, merges the same two commits with union");
  assert.deepEqual(real.notPinned, { kind: "error", detail: "integration failed: Error" });
  // Compare-and-swap on main. Repeating a push that landed is "up to date": git checks no lease when nothing would change.
  assert.deepEqual([real.stale, real.landed, real.again, real.late], ["push answered: rejected (lease)", "push answered: landed", "push answered: landed", "push answered: rejected (lease)"]);
  assert.match(upToDate, /up to date/);
  assert.equal(real.main, merged);
  assert.equal(f.canonicalMain(), merged);
});

test("landing over real git: one lane lands by fast-forward and the next by a merge that a fresh sandbox pushes after a restart; main is the commit the preview showed, and each lane's commit is in main's history byte for byte (R-LAND-4, R-PROP-7; contract gap 7)", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const room = new FakeRoom();
  const tokens = new FakeTokens();
  const sql = nodeSql();
  const now = new Clock().now;
  // Each lane's head carries a jj change-id header, where jj writes it: after `committer`.
  const propose = (n: number, files: Record<string, string>) => {
    const head = f.commit(f.main, files, { message: "lane work\n", headers: `change-id ${"klmnopqrstuvwxyz".repeat(2)}\n` });
    f.setRef(pinnedRef(laneId(n), 1), head);
    room.hold(laneId(n), 1, head);
    return { id: opId(n), lane: laneId(n), head, raw: f.git.commitFacts(head).raw };
  };
  const accept = (e: Landing, o: { id: OpId; lane: ReturnType<typeof laneId>; head: Sha }, n: number) =>
    assert.ok(!("refused" in e.accept({ id: o.id, lane: o.lane, generation: 1, head: o.head, act: actId(500 + n), leaseGeneration: 1, policyVersion: room.policy })), "accepted");
  const a = propose(1, { "src/a.txt": edit(lines("a"), 2, "from lane a") });
  const b = propose(2, { "src/b.txt": edit(lines("b"), 2, "from lane b") });
  assert.match(a.raw, /\ncommitter [^\n]+\nchange-id [k-z]{32}\n\nlane work\n$/);

  const engine = new Landing({ sql, room, publisher: new GitPublisher(f.ops, f.canonical), tokens, now });
  await engine.refreshMain();
  accept(engine, a, 1);
  await engine.settle();
  assert.equal(engine.view(a.id)?.state, "landed");
  assert.equal(f.canonicalMain(), a.head, "a fast-forward: main is the lane's commit itself");

  // Lane b was written on the old main. Its preview runs in another sandbox, before its landing is accepted.
  const p = await f.sandbox("previewer").preview(f.canonical, b.head, pinnedRef(b.lane, 1), b.lane, 1);
  assert.ok(p.kind === "clean" && !p.fastForward, "a clean preview that is not a fast-forward");
  assert.equal(p.base, a.head);
  assert.equal(f.ref(objectsRef(p.integration)), p.integration, "the previewed commit is stored for checkers");
  accept(engine, b, 2);
  await engine.prepare(b.id);
  const ready = engine.view(b.id);
  assert.equal(ready?.state, "ready");
  assert.equal(ready?.state === "ready" ? ready.integration : null, p.integration, "the landing builds the previewed commit");

  // The Room restarts, and so does the publisher's sandbox: it has none of the objects, and fetches the stored integration.
  engine.kill();
  const restarted = new Landing({ sql, room, publisher: new GitPublisher(f.sandbox("after-restart"), f.canonical), tokens, now });
  await restarted.settle();
  assert.equal(restarted.view(b.id)?.state, "landed");
  const main = f.canonicalMain();
  assert.equal(main, p.integration, "main is the previewed integration");
  const onDisk = objectsIn(f.canonical);
  const merge = onDisk.commitFacts(main);
  assert.equal(merge.tree, p.tree);
  assert.deepEqual(merge.parents, [a.head, b.head], "the second parent is the lane's head, not a copy");
  assert.doesNotMatch(merge.raw, /change-id/, "the merge commit is Artroom's own");
  assert.equal(onDisk.commitFacts(merge.parents[0]!).raw, a.raw);
  assert.equal(onDisk.commitFacts(merge.parents[1]!).raw, b.raw);
  assert.match(f.show(main, "src/a.txt"), /from lane a/);
  assert.match(f.show(main, "src/b.txt"), /from lane b/);
  assert.equal(room.events("land-outcome").filter((e) => e.outcome.state === "landed").length, 2);
  assert.equal(tokens.live.size, 0, "every publication token is revoked");
});
