// The publisher's git sequences, run against real git and local bare repos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { Fixture, edit, lines, localExec, sh } from "./support.ts";
import { GitOps, HARDENING, integrationRef, objectsRef, pinnedRef } from "../src/publisher/gitops.ts";

const lane = "act_1001_abcdef01";

test("integrate: a head that fast-forwards main is its own integration", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const head = await f.propose(lane, 1, f.main, { "src/c.txt": "new\n" });
  const r = await f.ops.integrate({
    canonical: f.canonical, expectedMain: f.main, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), message: "m", committedAt: 1,
  });
  assert.deepEqual(r, { kind: "clean", integration: head, ref: pinnedRef(lane, 1), fastForward: true });
});

test("integrate: a merge commit with parents (expectedMain, head), deterministic, stored in the canonical repo", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const other = await f.propose("act_1002_abcdef02", 1, f.main, { "src/b.txt": edit(lines("b"), 3, "main side") });
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
  const head = await f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  const req = { canonical: f.canonical, expectedMain: other, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), message: "Land\n", committedAt: 1_700_000_100 };
  const r = await f.ops.integrate(req);
  assert.equal(r.kind, "clean");
  if (r.kind !== "clean") return;
  assert.equal(r.fastForward, false);
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", integrationRef("op_1", 1)), r.integration);
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${r.integration}^1`), other);
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${r.integration}^2`), head);
  assert.match(await f.show(r.integration, "src/a.txt"), /lane side/);
  assert.match(await f.show(r.integration, "src/b.txt"), /main side/);
  // A fresh sandbox rebuilds the same commit, so a retry never lands a different one.
  const fresh = new GitOps({ exec: localExec, workdir: join(f.root, "publisher2"), config: ["protocol.file.allow=always"] });
  mkdirSync(join(f.root, "publisher2"));
  const again = await fresh.integrate({ ...req, storeRef: integrationRef("op_1", 2) });
  assert.equal(again.kind === "clean" && again.integration, r.integration);
});

test("integrate: a conflict lists the paths and pushes nothing", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const other = await f.propose("act_1002_abcdef02", 1, f.main, { "src/a.txt": edit(lines("a"), 3, "main side") });
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
  const head = await f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  const r = await f.ops.integrate({ canonical: f.canonical, expectedMain: other, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), message: "m", committedAt: 1 });
  assert.deepEqual(r, { kind: "conflict", paths: ["src/a.txt"] });
  const stored = await localExec(["git", "--git-dir", f.canonical, "rev-parse", "--verify", "-q", integrationRef("op_1", 1)], { env: {} });
  assert.notEqual(stored.code, 0);
});

test("the repository's own attributes cannot change a merge (merge=union is ignored)", async (t) => {
  const f = await new Fixture().init({ ".gitattributes": "src/*.txt merge=union\n", "src/a.txt": lines("a") });
  t.after(() => f.dispose());
  const other = await f.propose("act_1002_abcdef02", 1, f.main, { "src/a.txt": edit(lines("a"), 3, "main side") });
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
  const head = await f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  // Plain git, told to read attributes from the head's tree, merges cleanly with union.
  const dir = await f.ops.repo(f.canonical);
  await f.ops.fetch(dir, f.canonical, [`+${pinnedRef(lane, 1)}:${pinnedRef(lane, 1)}`, "+refs/heads/main:refs/remotes/canonical/main"]);
  const plain = await localExec(["git", "-C", dir, "-c", `attr.tree=${head}`, "merge-tree", "--write-tree", "--name-only", other, head], { env: {} });
  assert.equal(plain.code, 0, "control: the union driver applies when attributes are read");
  // The publisher's hardened merge does not read them.
  const r = await f.ops.integrate({ canonical: f.canonical, expectedMain: other, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), message: "m", committedAt: 1 });
  assert.deepEqual(r, { kind: "conflict", paths: ["src/a.txt"] });
});

test("hooks never run, even if one is placed in the publisher's repo", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const dir = await f.ops.repo(f.canonical);
  const marker = join(f.root, "hook-ran");
  for (const hook of ["reference-transaction", "pre-push", "post-update", "pre-auto-gc"]) {
    const p = join(dir, "hooks", hook);
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(p, `#!/bin/sh\necho ${hook} >> ${marker}\n`);
    chmodSync(p, 0o755);
  }
  const head = await f.propose(lane, 1, f.main, { "src/c.txt": "c\n" });
  const r = await f.ops.integrate({ canonical: f.canonical, expectedMain: f.main, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), message: "m", committedAt: 1 });
  assert.equal(r.kind, "clean");
  const out = await f.ops.pushMain(f.canonical, head, f.main, pinnedRef(lane, 1));
  assert.equal(out.outcome, "landed");
  assert.equal(existsSync(marker), false, "a hook ran");
  assert.ok(HARDENING.includes("core.hooksPath=/dev/null"));
  // Control: the same hooks do run under plain git.
  await localExec(["git", "-C", dir, "update-ref", "refs/x", head], { env: {} });
  assert.equal(existsSync(marker), true, "control: plain git runs the reference-transaction hook");
});

test("pushMain: compare-and-swap on main, with the four outcomes classified", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const head = await f.propose(lane, 1, f.main, { "src/c.txt": "c\n" });
  const stale = await f.ops.pushMain(f.canonical, head, "1".repeat(40), pinnedRef(lane, 1));
  assert.equal(stale.outcome, "rejected");
  assert.equal(await f.canonicalMain(), f.main);
  const ok = await f.ops.pushMain(f.canonical, head, f.main, pinnedRef(lane, 1));
  assert.equal(ok.outcome, "landed");
  assert.equal(await f.canonicalMain(), head);
  // Repeating the same push after it landed is "up to date": git checks no lease when
  // nothing would change. Main is unchanged. (The engine decides by reading main back.)
  const again = await f.ops.pushMain(f.canonical, head, f.main, pinnedRef(lane, 1));
  assert.equal(again.outcome, "landed");
  assert.match(again.detail, /up to date/);
  assert.equal(await f.canonicalMain(), head);
  const missing = await f.ops.pushMain(join(f.root, "nope.git"), head, f.main, pinnedRef(lane, 1));
  assert.equal(missing.outcome, "error");
});

test("pushMain from a fresh sandbox fetches the stored integration first", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const head = await f.propose(lane, 1, f.main, { "src/c.txt": "c\n" });
  mkdirSync(join(f.root, "fresh"));
  const fresh = new GitOps({ exec: localExec, workdir: join(f.root, "fresh"), config: ["protocol.file.allow=always"] });
  const r = await fresh.pushMain(f.canonical, head, f.main, pinnedRef(lane, 1));
  assert.equal(r.outcome, "landed");
});

test("lease race: of two publishers pushing different integrations on the same main, exactly one wins", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  for (let round = 0; round < 5; round++) {
    const base = await f.canonicalMain();
    const a = await f.propose("act_1001_abcdef01", 10 + round, base, { [`race/a${round}.txt`]: "a\n" });
    const b = await f.propose("act_1002_abcdef02", 10 + round, base, { [`race/b${round}.txt`]: "b\n" });
    const pubs = ["pa", "pb"].map((d) => {
      mkdirSync(join(f.root, `${d}${round}`));
      return new GitOps({ exec: localExec, workdir: join(f.root, `${d}${round}`), config: ["protocol.file.allow=always"] });
    });
    const [ra, rb] = await Promise.all([
      pubs[0]!.pushMain(f.canonical, a, base, pinnedRef("act_1001_abcdef01", 10 + round)),
      pubs[1]!.pushMain(f.canonical, b, base, pinnedRef("act_1002_abcdef02", 10 + round)),
    ]);
    const winners = [ra, rb].filter((r) => r.outcome === "landed").length;
    assert.equal(winners, 1, `round ${round}: ${ra.outcome} ${rb.outcome}`);
    const main = await f.canonicalMain();
    assert.equal(main, ra.outcome === "landed" ? a : b);
  }
});

test("pinning: objects ref, then a pinned ref that never moves", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const fork = join(f.root, "fork.git");
  await sh(f.root, "clone", "-q", "--bare", f.canonical, fork);
  await sh(f.work, "checkout", "-q", "--detach", f.main);
  f.write({ "src/c.txt": "c\n" });
  await sh(f.work, "add", "-A");
  await sh(f.work, "commit", "-q", "-m", "lane work");
  const head = await sh(f.work, "rev-parse", "HEAD");
  // Not yet pushed to the fork: refused.
  assert.deepEqual(await f.ops.pinObjects(fork, f.canonical, head), { kind: "head-unknown" });
  await sh(f.work, "push", "-q", fork, "HEAD:refs/heads/work");
  assert.deepEqual(await f.ops.pinObjects(fork, f.canonical, head), { kind: "pinned", already: false });
  assert.equal((await f.ops.pinObjects(fork, f.canonical, head)).kind, "pinned");
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", objectsRef(head)), head);
  assert.deepEqual(await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), head), { kind: "pinned", already: false });
  assert.deepEqual(await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), head), { kind: "pinned", already: true });
  // A different head for the same generation is a conflict, and the ref stays.
  const r = await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), f.main);
  assert.deepEqual(r, { kind: "conflict", observed: head });
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", pinnedRef(lane, 1)), head);
  // A force-push to the fork cannot erase the pinned head.
  await sh(f.work, "push", "-q", "--force", fork, `${f.main}:refs/heads/work`);
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", pinnedRef(lane, 1)), head);
});

test("preview: clean with a tree, or the conflicting paths", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const other = await f.propose("act_1002_abcdef02", 1, f.main, { "src/a.txt": edit(lines("a"), 3, "main side") });
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
  const clash = await f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  const fine = await f.propose(lane, 2, f.main, { "src/b.txt": edit(lines("b"), 3, "lane side") });
  assert.deepEqual(await f.ops.preview(f.canonical, clash, pinnedRef(lane, 1)), { kind: "conflict", base: other, paths: ["src/a.txt"] });
  const ok = await f.ops.preview(f.canonical, fine, pinnedRef(lane, 2));
  assert.equal(ok.kind, "clean");
});
