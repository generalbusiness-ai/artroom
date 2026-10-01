// The publisher's git sequences, run against real git and local bare repos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { Fixture, edit, lines, localExec, sh } from "./support.ts";
import { type Exec, GitOps, HARDENING, LOG_REF, integrationRef, objectsRef, pinnedRef } from "../src/publisher/gitops.ts";
import { decodeLogPush, toB64url, toLogOutcome } from "../src/publisher/log-push.ts";
import { createHash } from "node:crypto";

const lane = "act_1001_abcdef01";

test("integrate: a head that fast-forwards main is its own integration", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const head = await f.propose(lane, 1, f.main, { "src/c.txt": "new\n" });
  const r = await f.ops.integrate({
    canonical: f.canonical, expectedMain: f.main, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), lane, generation: 1,
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
    storeRef: integrationRef("op_1", 1), lane, generation: 1 };
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
  // Every input is fixed by (base, head, lane, generation): the message, and both dates at the later parent's commit time.
  const ct = Math.max(...(await sh(f.root, "--git-dir", f.canonical, "show", "-s", "--format=%ct", other, head)).split("\n").map(Number));
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "show", "-s", "--format=%B|%at %ad|%ct %cd", "--date=raw", r.integration),
    `Land ${lane} generation 1\n|${ct} ${ct} +0000|${ct} ${ct} +0000`);
});

test("integrate: a conflict lists the paths and pushes nothing", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const other = await f.propose("act_1002_abcdef02", 1, f.main, { "src/a.txt": edit(lines("a"), 3, "main side") });
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
  const head = await f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  const r = await f.ops.integrate({ canonical: f.canonical, expectedMain: other, head, headRef: pinnedRef(lane, 1),
    storeRef: integrationRef("op_1", 1), lane, generation: 1 });
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
    storeRef: integrationRef("op_1", 1), lane, generation: 1 });
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
    storeRef: integrationRef("op_1", 1), lane, generation: 1 });
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
  assert.deepEqual(await f.ops.preview(f.canonical, clash, pinnedRef(lane, 1), lane, 1), { kind: "conflict", base: other, paths: ["src/a.txt"] });
  const ok = await f.ops.preview(f.canonical, fine, pinnedRef(lane, 2), lane, 2);
  assert.equal(ok.kind, "clean");
});

// ------------------------------------------------------------------ request 090a0eca: the preview's integration

test("a clean preview carries its integration commit: the merge commit the landing builds on the same main, stored in the canonical repo", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const other = await f.propose("act_1002_abcdef02", 1, f.main, { "src/b.txt": edit(lines("b"), 3, "main side") });
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
  const head = await f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  const p = await f.ops.preview(f.canonical, head, pinnedRef(lane, 1), lane, 1);
  assert.ok(p.kind === "clean" && !p.fastForward);
  if (p.kind !== "clean") return;
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", objectsRef(p.integration)), p.integration, "stored for checkers");
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${p.integration}^{tree}`), p.tree);
  // A landing on the same main, in a fresh sandbox, builds exactly the previewed commit.
  mkdirSync(join(f.root, "publisher-land"));
  const lander = new GitOps({ exec: localExec, workdir: join(f.root, "publisher-land"), config: ["protocol.file.allow=always"] });
  const built = await lander.integrate({ canonical: f.canonical, expectedMain: other, head, headRef: pinnedRef(lane, 1), storeRef: integrationRef("op_9", 1), lane, generation: 1 });
  assert.deepEqual(built.kind === "clean" && built.integration, p.integration);
  assert.equal((await lander.pushMain(f.canonical, p.integration, other, integrationRef("op_9", 1))).outcome, "landed");
  assert.equal(await f.canonicalMain(), p.integration);
});

test("a clean fast-forward preview's integration is the head itself, and nothing is stored", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const head = await f.propose(lane, 1, f.main, { "src/c.txt": "c\n" });
  const p = await f.ops.preview(f.canonical, head, pinnedRef(lane, 1), lane, 1);
  assert.ok(p.kind === "clean" && p.fastForward && p.integration === head);
  const stored = await localExec(["git", "--git-dir", f.canonical, "for-each-ref", "refs/artroom/objects/"], { env: {} });
  assert.equal(stored.stdout.trim(), "");
});

// ------------------------------------------------------------------ request 090a0eca: pushLog

/** Git object bytes, as lane L builds them. */
function object(type: "blob" | "tree" | "commit", body: Uint8Array): { type: "blob" | "tree" | "commit"; data: Uint8Array; sha: string } {
  const header = new TextEncoder().encode(`${type} ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return { type, data: body, sha: createHash("sha1").update(all).digest("hex") };
}
function logCommit(text: string, parent: string | null) {
  const blob = object("blob", new TextEncoder().encode(text));
  const raw = Buffer.from(blob.sha, "hex");
  const tree = object("tree", new Uint8Array([...new TextEncoder().encode("100644 log.txt\0"), ...raw]));
  const body = `tree ${tree.sha}\n${parent ? `parent ${parent}\n` : ""}author room <r@x> 0 +0000\ncommitter room <r@x> 0 +0000\n\nlog\n`;
  const commit = object("commit", new TextEncoder().encode(body));
  return { commit: commit.sha, objects: [blob, tree, commit].map(({ type, data }) => ({ type, data })) };
}

test("pushLog writes lane L's commit with its parent to refs/artroom/log under the lease, then the next one on top", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const c1 = logCommit("first", null);
  const r1 = await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
  assert.equal(r1.outcome.outcome, "landed");
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", LOG_REF), c1.commit);
  // A fresh sandbox: the parent comes from the canonical repo, only the new objects are sent.
  mkdirSync(join(f.root, "publisher-2"));
  const fresh = new GitOps({ exec: localExec, workdir: join(f.root, "publisher-2"), config: ["protocol.file.allow=always"] });
  const c2 = logCommit("second", c1.commit);
  assert.equal((await fresh.pushLog(f.canonical, c2.objects, c2.commit, c1.commit)).outcome.outcome, "landed");
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", LOG_REF), c2.commit);
  assert.equal((await localExec(["git", "--git-dir", f.canonical, "fsck", "--no-dangling"], { env: {} })).code, 0);
  assert.deepEqual(toLogOutcome(r1), { ok: true });
});

test("pushLog refuses by lease when another writer moved the ref, and says where it is; lane L sees lease-mismatch", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const c1 = logCommit("first", null);
  await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
  const intruder = logCommit("intruder", c1.commit);
  await f.ops.pushLog(f.canonical, intruder.objects, intruder.commit, c1.commit);
  const c2 = logCommit("second", c1.commit);
  const r = await f.ops.pushLog(f.canonical, c2.objects, c2.commit, c1.commit);
  assert.deepEqual([r.outcome.outcome, r.current], ["rejected", intruder.commit]);
  assert.deepEqual(toLogOutcome(r), { ok: false, reason: "lease-mismatch", current: intruder.commit });
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", LOG_REF), intruder.commit);
  // A first publication (no lease) onto a ref that exists is refused the same way.
  const fresh = logCommit("again", null);
  const r0 = await f.ops.pushLog(f.canonical, fresh.objects, fresh.commit, null);
  assert.deepEqual(toLogOutcome(r0), { ok: false, reason: "lease-mismatch", current: intruder.commit });
  // A lease onto a ref that is gone: lease-mismatch, at nothing.
  await sh(f.root, "--git-dir", f.canonical, "update-ref", "-d", LOG_REF);
  const r3 = await f.ops.pushLog(f.canonical, c2.objects, c2.commit, c1.commit);
  assert.deepEqual(toLogOutcome(r3), { ok: false, reason: "lease-mismatch", current: null });
});

test("pushLog sends nothing for a commit that is not exactly lane L's next commit: wrong parent, missing objects", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const c1 = logCommit("first", null);
  await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
  const orphan = logCommit("orphan", null); // no parent, but the lease is c1
  const r = await f.ops.pushLog(f.canonical, orphan.objects, orphan.commit, c1.commit);
  assert.equal(r.outcome.outcome, "error");
  const missing = logCommit("missing", c1.commit);
  const r2 = await f.ops.pushLog(f.canonical, missing.objects.slice(2), missing.commit, c1.commit); // the commit alone
  assert.equal(r2.outcome.outcome, "error");
  assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", LOG_REF), c1.commit, "the ref did not move");
  const o = toLogOutcome(r2);
  assert.ok(!o.ok && o.reason === "unknown" && /nothing was sent/.test(o.detail), "lane L reads the ref back after an unclear answer");
});

test("lane L's PushOutcome and this package's LogPushOutcome are the same type", () => {
  type Theirs = import("@generalbusiness/artroom-log").PushOutcome;
  const a: Theirs = toLogOutcome({ outcome: { outcome: "landed", detail: "" } });
  const b: ReturnType<typeof toLogOutcome> = a;
  assert.deepEqual(b, { ok: true });
});

test("only a landed push is ok, only a read-back lease refusal is lease-mismatch; everything else is unknown, with the token redacted", () => {
  const sha = "a".repeat(40);
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "lease", detail: "stale" }, current: sha }), { ok: false, reason: "lease-mismatch", current: sha });
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "lease", detail: "stale" }, current: null }), { ok: false, reason: "lease-mismatch", current: null });
  const unknown = [
    { outcome: { outcome: "rejected", reason: "lease", detail: "stale" } }, // the ref could not be read back
    { outcome: { outcome: "rejected", reason: "non-fast-forward", detail: "nff" } },
    { outcome: { outcome: "rejected", reason: "remote-rejected", detail: "hook" } },
    { outcome: { outcome: "error", detail: "auth" } },
    { outcome: { outcome: "unknown", detail: "hung up" } },
  ] as const;
  for (const r of unknown) {
    const o = toLogOutcome(r);
    assert.ok(!o.ok && o.reason === "unknown", JSON.stringify(r));
  }
  const token = ["art", "v1", "z".repeat(24)].join("_");
  const o = toLogOutcome({ outcome: { outcome: "unknown", detail: `https://x:${token}?expires=1@host ${"y".repeat(900)}` } });
  assert.ok(!o.ok && o.reason === "unknown" && !o.detail.includes(token) && o.detail.length <= 600);
});

test("a pushLog request is checked before git: only refs/artroom/log, commit ids, known types, base64url, within the limits", () => {
  const next = "b".repeat(40);
  const ok = { ref: LOG_REF, next, lease: null, objects: [{ type: "blob", data: toB64url(new Uint8Array([0, 1, 255])) }] };
  const d = decodeLogPush(ok);
  assert.ok("objects" in d);
  assert.deepEqual([...d.objects[0]!.data], [0, 1, 255]);
  const refused = (req: object) => {
    const r = decodeLogPush({ ...ok, ...req });
    assert.ok("refused" in r && !r.refused.ok && r.refused.reason === "unknown", JSON.stringify(req).slice(0, 80));
  };
  refused({ ref: "refs/heads/main" });
  refused({ next: "HEAD" });
  refused({ lease: "main" });
  refused({ objects: [{ type: "tag", data: "" }] });
  refused({ objects: [{ type: "blob", data: "a+b/" }] });
  refused({ objects: Array.from({ length: 100_001 }, () => ({ type: "blob", data: "" })) });
  const mib = toB64url(new Uint8Array(1024 * 1024));
  refused({ objects: Array.from({ length: 65 }, () => ({ type: "blob", data: mib })) });
});

test("the integration is dated at the later parent's commit time, whichever side it is on", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  const env = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
  const proposed = await f.propose("act_1002_abcdef02", 1, f.main, { "src/b.txt": edit(lines("b"), 3, "main side") });
  for (const at of [1_000_000_000, 4_000_000_000]) {
    // main moves to a commit dated far before, then far after, the lane's head
    const tree = await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${proposed}^{tree}`);
    const dated = await localExec(["git", "--git-dir", f.canonical, "commit-tree", tree, "-p", f.main, "-m", `main at ${at}`],
      { env: { ...env, GIT_AUTHOR_DATE: `@${at} +0000`, GIT_COMMITTER_DATE: `@${at} +0000` } });
    const other = dated.stdout.trim();
    await sh(f.root, "--git-dir", f.canonical, "update-ref", "refs/heads/main", other);
    const g = at === 1_000_000_000 ? 1 : 2;
    const head = await f.propose(lane, g, f.main, { "src/a.txt": edit(lines("a"), 3, `lane ${at}`) });
    const p = await f.ops.preview(f.canonical, head, pinnedRef(lane, g), lane, g);
    assert.ok(p.kind === "clean" && !p.fastForward);
    const headTime = Number(await sh(f.root, "--git-dir", f.canonical, "show", "-s", "--format=%ct", head));
    const want = Math.max(at, headTime);
    assert.equal(await sh(f.root, "--git-dir", f.canonical, "show", "-s", "--format=%at %ct", p.integration), `${want} ${want}`);
  }
});

test("a lease refusal at the push itself (the ref moved after the check) reads back where the ref is", async (t) => {
  // An exec that moves refs/artroom/log just before the push, as a concurrent writer would.
  let intruder = "";
  let canonical = "";
  const racing: Exec = async (argv, opts) => {
    if (argv.includes("push") && intruder) await localExec(["git", "--git-dir", canonical, "update-ref", LOG_REF, intruder], { env: {} });
    return localExec(argv, opts);
  };
  const f = await new Fixture(racing).init();
  t.after(() => f.dispose());
  canonical = f.canonical;
  const c1 = logCommit("first", null);
  await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
  const other = logCommit("other", c1.commit);
  await f.ops.pushLog(f.canonical, other.objects, other.commit, c1.commit);
  await sh(f.root, "--git-dir", f.canonical, "update-ref", LOG_REF, c1.commit);
  intruder = other.commit;
  const c2 = logCommit("second", c1.commit);
  const r = await f.ops.pushLog(f.canonical, c2.objects, c2.commit, c1.commit);
  assert.equal(r.outcome.outcome, "rejected");
  assert.deepEqual(toLogOutcome(r), { ok: false, reason: "lease-mismatch", current: other.commit });
});

test("readLogRef: the log ref's commit, null when it does not exist, and an error (never null) when the remote cannot be read", async (t) => {
  const f = await new Fixture().init();
  t.after(() => f.dispose());
  assert.equal(await f.ops.readLogRef(f.canonical), null);
  const c1 = logCommit("first", null);
  await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
  assert.equal(await f.ops.readLogRef(f.canonical), c1.commit);
  // A fresh sandbox reads it too: ls-remote sees refs outside refs/heads/.
  mkdirSync(join(f.root, "reader"));
  const fresh = new GitOps({ exec: localExec, workdir: join(f.root, "reader"), config: ["protocol.file.allow=always"] });
  assert.equal(await fresh.readLogRef(f.canonical, LOG_REF), c1.commit);
  await assert.rejects(f.ops.readLogRef(f.canonical, "refs/heads/main"), /only refs\/artroom\/log/);
  await assert.rejects(f.ops.readLogRef(join(f.root, "no-such-repo.git")));
});

for (const type of ["tree", "blob"] as const) {
  test(`pushLog refuses a ${type} as the log head, with or without a lease, and the ref does not move`, async (t) => {
    const f = await new Fixture().init();
    t.after(() => f.dispose());
    const empty = object(type, new Uint8Array());
    const r0 = await f.ops.pushLog(f.canonical, [{ type, data: empty.data }], empty.sha, null);
    assert.equal(r0.outcome.outcome, "error");
    assert.match(r0.outcome.detail, /is not a commit/);
    assert.deepEqual(toLogOutcome(r0).ok, false);
    assert.equal(await f.ops.readLogRef(f.canonical), null, "no log ref was created");
    const c1 = logCommit("first", null);
    await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
    const r1 = await f.ops.pushLog(f.canonical, [{ type, data: empty.data }], empty.sha, c1.commit);
    assert.equal(r1.outcome.outcome, "error");
    assert.equal(await f.ops.readLogRef(f.canonical), c1.commit, "the ref did not move");
  });
}
