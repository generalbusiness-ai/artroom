// The landing engine's publisher over real git (`GitPublisher` on `GitOps`).
//
// The engine's own tests (landing.test.ts) run against the canonical
// repository in memory. The first test here is what makes that fair: one
// script runs through the git publisher, on a repository on disk, and through
// the memory repository, built from the same commits, and every answer must
// be the same, the integration commit included. The second lands a lane
// through the engine and real git, across a restart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sha } from "@generalbusiness/artroom-contract";
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
  return { forward, merge, conflict, notPinned, stale: told(stale), landed: told(landed), again: told(again), main: await p.readMain(), upToDate: again.detail };
}

test("the memory repository answers the engine as the git publisher does over real git: a fast-forward, a merge (the same commit), a conflict, a head that is not the pinned one, and each push under the lease", async (t) => {
  const f = new Fixture();
  t.after(() => f.dispose());
  const h = history(f);
  // The publisher's own repository has a HEAD whose tree holds those attributes. (Git 2.43 read a bare
  // repository's attributes from HEAD unless told otherwise; later versions read them only when told.)
  const sandbox = await f.ops.repo(f.canonical);
  f.git.writeInto(sandbox);
  writeFileSync(join(sandbox, "HEAD"), `${h.main}\n`);
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
  const plain = await localExec(["git", "--git-dir", sandbox, "-c", "attr.tree=HEAD", "merge-tree", "--write-tree", "--name-only", h.main, h.clash], { env: {} });
  assert.equal(plain.code, 0, "control: plain git in the same repository, reading the attributes, merges the same two commits with union");
  assert.deepEqual(real.notPinned, { kind: "error", detail: "integration failed: Error" });
  // Compare-and-swap on main. Repeating a push that landed is "up to date": git checks no lease when nothing would change.
  assert.deepEqual([real.stale, real.landed, real.again], ["push answered: rejected (lease)", "push answered: landed", "push answered: landed"]);
  assert.match(upToDate, /up to date/);
  assert.equal(real.main, merged);
  assert.equal(f.canonicalMain(), merged);
});

test("landing over real git: a lane written on an older main lands as a merge that a fresh sandbox pushes after a restart; main is the commit the preview showed, and the lane's commit is in main's history byte for byte, its jj change-id header included (R-LAND-4, R-PROP-7; contract gap 7)", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const room = new FakeRoom();
  const tokens = new FakeTokens();
  const sql = nodeSql();
  const now = new Clock().now;
  // Main has moved since the lane's head was written. jj writes its change-id as a commit header after `committer`.
  const moved = f.commit(f.main, { "src/a.txt": edit(lines("a"), 2, "from main") });
  f.setMain(moved);
  const id = opId(1);
  const head = f.commit(f.main, { "src/b.txt": edit(lines("b"), 2, "from the lane") }, { message: "lane work\n", headers: `change-id ${"klmnopqrstuvwxyz".repeat(2)}\n` });
  const written = f.git.commitFacts(head).raw;
  assert.match(written, /\ncommitter [^\n]+\nchange-id [k-z]{32}\n\nlane work\n$/);
  f.setRef(pinnedRef(lane, 1), head);
  room.hold(lane, 1, head);

  // The preview runs in another sandbox, before the landing is accepted.
  const p = await f.sandbox("previewer").preview(f.canonical, head, pinnedRef(lane, 1), lane, 1);
  assert.ok(p.kind === "clean" && !p.fastForward, "a clean preview that is not a fast-forward");
  assert.equal(p.base, moved);
  assert.equal(f.ref(objectsRef(p.integration)), p.integration, "the previewed commit is stored for checkers");

  const engine = new Landing({ sql, room, publisher: new GitPublisher(f.ops, f.canonical), tokens, now });
  await engine.refreshMain();
  assert.ok(!("refused" in engine.accept({ id, lane, generation: 1, head, act: actId(501), leaseGeneration: 1, policyVersion: room.policy })), "accepted");
  await engine.prepare(id);
  const ready = engine.view(id);
  assert.equal(ready?.state, "ready");
  assert.equal(ready?.state === "ready" ? ready.integration : null, p.integration, "the landing builds the previewed commit");

  // The Room restarts, and so does the publisher's sandbox: it has none of the objects, and fetches the stored integration.
  engine.kill();
  const restarted = new Landing({ sql, room, publisher: new GitPublisher(f.sandbox("after-restart"), f.canonical), tokens, now });
  await restarted.settle();
  assert.equal(restarted.view(id)?.state, "landed");
  const main = f.canonicalMain();
  assert.equal(main, p.integration, "main is the previewed integration");
  const onDisk = objectsIn(f.canonical);
  const merge = onDisk.commitFacts(main);
  assert.equal(merge.tree, p.tree);
  assert.deepEqual(merge.parents, [moved, head], "the second parent is the lane's head, not a copy");
  assert.doesNotMatch(merge.raw, /change-id/, "the merge commit is Artroom's own");
  assert.equal(onDisk.commitFacts(merge.parents[1]!).raw, written);
  assert.match(f.show(main, "src/a.txt"), /from main/);
  assert.match(f.show(main, "src/b.txt"), /from the lane/);
  assert.equal(room.events("land-outcome").filter((e) => e.outcome.state === "landed").length, 1);
  assert.equal(tokens.live.size, 0, "the publication token is revoked");
});
