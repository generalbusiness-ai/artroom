// The publisher's git sequences, run against real git and local bare repos.
// The test repositories are written as files (support.ts), so the processes
// a test starts are the publisher's own commands, a few of git's answers
// used as an oracle, and the controls. Integration and the push to main are
// in git-publisher.test.ts, with the landing engine over them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync, chmodSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOG_TRANSFER_LIMITS, MemoryGit, type StagePart as TheirPart, type StageWant as TheirWant } from "@generalbusiness/artroom-log";
import type { Sha } from "@generalbusiness/artroom-contract";
import { Fixture, GitObjects, edit, lines, localExec, looseIds, looseObject, objectsIn, sh, writeLoose, writeRef } from "./support.ts";
import { type Exec, HARDENING, LOG_REF, objectsRef, pinnedRef } from "../src/publisher/gitops.ts";
import { LOG_PUSH_LIMITS, decodeLogPush, decodeLogStage, toB64url, toLogOutcome } from "../src/publisher/log-push.ts";
import { createHash } from "node:crypto";

const lane = "act_1001_abcdef01";
const other = "act_1002_abcdef02";

test("lease race: two fresh sandboxes fetch their stored heads and push different ones on the same main; exactly one wins; no hook in a sandbox's repository runs; a missing repository is an error", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const a = f.propose(lane, 1, f.main, { "race/a.txt": "a\n" });
  const b = f.propose(other, 1, f.main, { "race/b.txt": "b\n" });
  // Hooks, placed in one sandbox's repository, for the ref updates of a fetch and for a push.
  const dir = await f.ops.repo(f.canonical);
  const marker = join(f.root, "hook-ran");
  mkdirSync(join(dir, "hooks"), { recursive: true });
  for (const hook of ["reference-transaction", "pre-push", "post-update", "pre-auto-gc"]) {
    writeFileSync(join(dir, "hooks", hook), `#!/bin/sh\necho ${hook} >> ${marker}\n`);
    chmodSync(join(dir, "hooks", hook), 0o755);
  }
  // Neither sandbox has its head yet: each fetches it from the pinned ref first. The loser's lease is stale, whichever push git takes first.
  const [ra, rb] = await Promise.all([
    f.ops.pushMain(f.canonical, a, f.main, pinnedRef(lane, 1)),
    f.sandbox("pb").pushMain(f.canonical, b, f.main, pinnedRef(other, 1)),
  ]);
  assert.deepEqual([ra.outcome, rb.outcome].sort(), ["landed", "rejected"]);
  assert.equal(f.canonicalMain(), ra.outcome === "landed" ? a : b);
  assert.equal(existsSync(marker), false, "a hook ran");
  assert.ok(HARDENING.includes("core.hooksPath=/dev/null"));
  // Control: the same hooks do run under plain git.
  await localExec(["git", "-C", dir, "update-ref", "refs/x", a], { env: {} });
  assert.equal(existsSync(marker), true, "control: plain git runs the reference-transaction hook");
  // Nothing was sent to a repository that is not there: an error, never unknown.
  assert.equal((await f.ops.pushMain(join(f.root, "nope.git"), a, f.main, pinnedRef(lane, 1))).outcome, "error");
});

test("pinning: objects ref, then a pinned ref that never moves; the head is the lane's commit itself, a jj change-id header included (R-PROP-1)", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  // The lane's fork: main, then the lane's work on a branch.
  const fork = f.bare("fork.git");
  f.git.writeInto(fork);
  writeRef(fork, "refs/heads/main", f.main);
  // jj writes its change-id as a commit header after `committer`. Pinning copies the commit; it never rewrites it.
  const head = f.git.commit([f.main], { "src/c.txt": "c\n" }, { message: "lane work\n", headers: `change-id ${"zyxwvutsrqponmlk".repeat(2)}\n` });
  const written = f.git.commitFacts(head).raw;
  assert.match(written, /\ncommitter [^\n]+\nchange-id [k-z]{32}\n\nlane work\n$/);
  // Not yet pushed to the fork: refused.
  assert.deepEqual(await f.ops.pinObjects(fork, f.canonical, head), { kind: "head-unknown" });
  f.git.writeInto(fork);
  writeRef(fork, "refs/heads/work", head);
  assert.equal(looseObject(f.canonical, head), null, "the canonical repo does not have the head yet");
  assert.deepEqual(await f.ops.pinObjects(fork, f.canonical, head), { kind: "pinned", already: false });
  assert.equal(f.ref(objectsRef(head)), head);
  assert.equal(f.show(head, "src/c.txt"), "c\n", "the head's objects were copied from the fork");
  assert.equal(objectsIn(f.canonical).commitFacts(head).raw, written, "the commit in the canonical repo is byte for byte the one written");
  assert.deepEqual(await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), head), { kind: "pinned", already: false });
  assert.deepEqual(await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), head), { kind: "pinned", already: true });
  // A different head for the same generation is a conflict, and the ref stays.
  const r = await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), f.main);
  assert.deepEqual(r, { kind: "conflict", observed: head });
  assert.equal(f.ref(pinnedRef(lane, 1)), head);
});

test("preview: a conflict gives the paths; a fast-forward gives the head itself and stores nothing", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const main = f.commit(f.main, { "src/a.txt": edit(lines("a"), 3, "main side") });
  f.setMain(main);
  const clash = f.propose(lane, 1, f.main, { "src/a.txt": edit(lines("a"), 3, "lane side") });
  assert.deepEqual(await f.ops.preview(f.canonical, clash, pinnedRef(lane, 1), lane, 1), { kind: "conflict", base: main, paths: ["src/a.txt"] });
  const ahead = f.propose(lane, 2, main, { "src/c.txt": "c\n" });
  const p = await f.ops.preview(f.canonical, ahead, pinnedRef(lane, 2), lane, 2);
  assert.deepEqual(p, { kind: "clean", base: main, tree: f.git.commitFacts(ahead).tree, integration: ahead, fastForward: true });
  assert.equal(existsSync(join(f.canonical, "refs", "artroom", "objects")), false, "nothing was stored");
});

test("filtered snapshot: the fixed commit of R-CARRY-15, written into an empty repository at refs/artroom/snapshot only (R-CARRY-16)", async (t) => {
  const f = new Fixture().init({ "src/a.ts": "a\n", "src/secret.ts": "s\n", "package.json": "{}\n", "tests/a.test.ts": "t\n" });
  t.after(() => f.dispose());
  const files = await f.ops.listTree(f.canonical, f.main);
  assert.deepEqual(files.map((x) => x[0]).sort(), ["package.json", "src/a.ts", "src/secret.ts", "tests/a.test.ts"]);
  const chosen = files.filter(([p]) => p !== "src/secret.ts");
  const secretBlob = files.find(([p]) => p === "src/secret.ts")![2];
  const git = (dir: string, ...args: string[]) => sh(f.root, "--git-dir", dir, ...args);
  const message = `Artroom filtered snapshot for tests\n\nDigest: sha256:${"d".repeat(64)}\n`;
  const s1 = f.bare("s1.git");
  const commit = await f.ops.writeSnapshot({ canonical: f.canonical, store: s1, files: chosen, message });
  // Exactly this commit object: no parent, the fixed identity at time 0, the Room's message.
  const stored = objectsIn(s1);
  const facts = stored.commitFacts(commit);
  assert.equal(
    facts.raw,
    `tree ${facts.tree}\nauthor Artroom Snapshot <snapshot@artroom.invalid> 0 +0000\ncommitter Artroom Snapshot <snapshot@artroom.invalid> 0 +0000\n\n${message}`,
  );
  // One ref, and nothing but the commit's closure.
  assert.equal(await git(s1, "for-each-ref", "--format=%(refname) %(objectname)"), `refs/artroom/snapshot ${commit}`);
  const reachable = (await git(s1, "rev-list", "--objects", "--all")).split("\n").map((l) => l.slice(0, 40)).sort();
  assert.deepEqual(looseIds(s1), reachable, "the repository holds exactly the snapshot's commit, trees and blobs");
  assert.deepEqual([...stored.files(commit).keys()].sort(), ["package.json", "src/a.ts", "tests/a.test.ts"]);
  assert.ok(!looseIds(s1).includes(secretBlob), "the file left out is not in the repository");
  // Anyone computes the same commit from the same files, in any order: here, without git.
  const mine = new GitObjects();
  const tree = mine.tree(new Map([...chosen].reverse().map(([path, , blob]) => [path, blob])));
  assert.equal(mine.commitTree(tree, [], { who: "Artroom Snapshot <snapshot@artroom.invalid>", at: 0, message }), commit);
  // A repository is never given a second snapshot.
  const before = looseIds(s1);
  await assert.rejects(f.ops.writeSnapshot({ canonical: f.canonical, store: s1, files, message }), /not empty/);
  assert.deepEqual(looseIds(s1), before, "nothing was added");
  // Nor anything else: a store with any ref at all, even with no snapshot ref, is refused and nothing is pushed.
  const s3 = f.bare("s3.git");
  f.git.writeInto(s3);
  writeRef(s3, "refs/heads/main", f.main);
  const held = looseIds(s3);
  await assert.rejects(f.ops.writeSnapshot({ canonical: f.canonical, store: s3, files: chosen, message }), /not empty/);
  assert.deepEqual(looseIds(s3), held);
  assert.equal(existsSync(join(s3, "refs", "artroom")), false, "no snapshot ref was written");
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

/** Put a log commit's objects into a repository on disk, as an earlier publication left them. */
function seed(gitDir: string, c: ReturnType<typeof logCommit>): string {
  for (const o of c.objects) writeLoose(gitDir, o.type, o.data);
  return c.commit;
}

test("pushLog writes lane L's commit with its parent to refs/artroom/log under the lease, then the next one on top; readLogRef reads the ref, null when it does not exist, and fails (never null) when the remote cannot be read", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  assert.equal(await f.ops.readLogRef(f.canonical), null);
  // A first publication: no lease, and the objects come with the call.
  const c1 = logCommit("first", null);
  const r1 = await f.ops.pushLog(f.canonical, c1.objects, c1.commit, null);
  assert.equal(r1.outcome.outcome, "landed");
  assert.deepEqual(toLogOutcome(r1), { ok: true });
  assert.equal(f.ref(LOG_REF), c1.commit);
  // A fresh sandbox reads it: ls-remote sees refs outside refs/heads/. The parent comes from the canonical repo, and only the new objects are sent.
  const fresh = f.sandbox("publisher-2");
  assert.equal(await fresh.readLogRef(f.canonical, LOG_REF), c1.commit);
  const c2 = logCommit("second", c1.commit);
  assert.equal((await fresh.pushLog(f.canonical, c2.objects, c2.commit, c1.commit)).outcome.outcome, "landed");
  assert.equal(f.ref(LOG_REF), c2.commit);
  assert.deepEqual(objectsIn(f.canonical).commitFacts(c2.commit).parents, [c1.commit]);
  assert.equal((await localExec(["git", "--git-dir", f.canonical, "fsck", "--no-dangling"], { env: {} })).code, 0);
  await assert.rejects(f.ops.readLogRef(f.canonical, "refs/heads/main"), /only refs\/artroom\/log/);
  await assert.rejects(f.ops.readLogRef(join(f.root, "no-such-repo.git")));
});

test("pushLog refuses by lease when another writer moved the ref, and says where it is; lane L sees lease-mismatch", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const c1 = logCommit("first", null);
  const intruder = logCommit("intruder", seed(f.canonical, c1));
  f.setRef(LOG_REF, seed(f.canonical, intruder));
  const c2 = logCommit("second", c1.commit);
  const r = await f.ops.pushLog(f.canonical, c2.objects, c2.commit, c1.commit);
  assert.deepEqual([r.outcome.outcome, r.current], ["rejected", intruder.commit]);
  assert.deepEqual(toLogOutcome(r), { ok: false, reason: "lease-mismatch", current: intruder.commit });
  assert.equal(f.ref(LOG_REF), intruder.commit);
  // A first publication (no lease) onto a ref that exists is refused the same way.
  const fresh = logCommit("again", null);
  const r0 = await f.ops.pushLog(f.canonical, fresh.objects, fresh.commit, null);
  assert.deepEqual(toLogOutcome(r0), { ok: false, reason: "lease-mismatch", current: intruder.commit });
  // A lease onto a ref that is gone: lease-mismatch, at nothing.
  f.setRef(LOG_REF, null);
  const r3 = await f.ops.pushLog(f.canonical, c2.objects, c2.commit, c1.commit);
  assert.deepEqual(toLogOutcome(r3), { ok: false, reason: "lease-mismatch", current: null });
});

test("a lease refusal at the push itself (the ref moved after the check) reads back where the ref is", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const c1 = logCommit("first", null);
  const moved = logCommit("other", seed(f.canonical, c1));
  seed(f.canonical, moved);
  f.setRef(LOG_REF, c1.commit);
  // An exec that moves refs/artroom/log just before the push, as a concurrent writer would.
  const racing: Exec = (argv, opts) => {
    if (argv.includes("push")) f.setRef(LOG_REF, moved.commit);
    return localExec(argv, opts);
  };
  const c2 = logCommit("second", c1.commit);
  const r = await f.sandbox("racer", racing).pushLog(f.canonical, c2.objects, c2.commit, c1.commit);
  assert.equal(r.outcome.outcome, "rejected");
  assert.deepEqual(toLogOutcome(r), { ok: false, reason: "lease-mismatch", current: moved.commit });
  assert.equal(f.ref(LOG_REF), moved.commit);
});

test("pushLog sends nothing for what is not exactly lane L's next commit: a wrong parent, missing objects, or a tree as the log head; the ref does not move", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const c1 = logCommit("first", null);
  f.setRef(LOG_REF, seed(f.canonical, c1));
  const orphan = logCommit("orphan", null); // no parent, but the lease is c1
  const r = await f.ops.pushLog(f.canonical, orphan.objects, orphan.commit, c1.commit);
  assert.equal(r.outcome.outcome, "error");
  const missing = logCommit("missing", c1.commit);
  const r2 = await f.ops.pushLog(f.canonical, missing.objects.slice(2), missing.commit, c1.commit); // the commit alone
  assert.equal(r2.outcome.outcome, "error");
  const o = toLogOutcome(r2);
  assert.ok(!o.ok && o.reason === "unknown" && /nothing was sent/.test(o.detail), "lane L reads the ref back after an unclear answer");
  assert.equal(f.ref(LOG_REF), c1.commit, "the ref did not move");
  // A tree with no lease, on a repository with no log ref: rev-list alone would read it as a commit with no parent.
  const empty = f.bare("empty.git");
  const head = object("tree", new Uint8Array());
  const r0 = await f.ops.pushLog(empty, [{ type: "tree", data: head.data }], head.sha, null);
  assert.equal(r0.outcome.outcome, "error");
  assert.match(r0.outcome.detail, /is not a commit/);
  assert.deepEqual(toLogOutcome(r0).ok, false);
  assert.equal(existsSync(join(empty, LOG_REF)), false, "no log ref was created");
});

test("lane L's PushOutcome and this package's LogPushOutcome are the same type", () => {
  type Theirs = import("@generalbusiness/artroom-log").PushOutcome;
  const a: Theirs = toLogOutcome({ outcome: { outcome: "landed", detail: "" } });
  const b: ReturnType<typeof toLogOutcome> = a;
  assert.deepEqual(b, { ok: true });
  // Lane L bounds one transfer by the numbers the sandbox checks a request against.
  assert.deepEqual(LOG_TRANSFER_LIMITS, LOG_PUSH_LIMITS);
});

test("only a landed push is ok, only a read-back lease refusal is lease-mismatch, any other rejection is refused; everything else is unknown, with the token redacted", () => {
  const sha = "a".repeat(40);
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "lease", detail: "stale" }, current: sha }), { ok: false, reason: "lease-mismatch", current: sha });
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "lease", detail: "stale" }, current: null }), { ok: false, reason: "lease-mismatch", current: null });
  // Contract amendment 4 (R-LOG-20): a refusal other than the lease is definite. The code is Artifacts', or the kind of status.
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "non-fast-forward", detail: "nff" } }), { ok: false, reason: "refused", code: "non-fast-forward", detail: "nff" });
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "remote-rejected", detail: "hook" } }), { ok: false, reason: "refused", code: "remote-rejected", detail: "hook" });
  const big = "remote: artifacts_git_receive_pack_object_too_large\n\nfatal: the remote end hung up unexpectedly";
  assert.deepEqual(toLogOutcome({ outcome: { outcome: "rejected", reason: "remote-rejected", detail: big } }), { ok: false, reason: "refused", code: "artifacts_git_receive_pack_object_too_large", detail: big });
  const unknown = [
    { outcome: { outcome: "rejected", reason: "lease", detail: "stale" } }, // the ref could not be read back
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
  const r = toLogOutcome({ outcome: { outcome: "rejected", reason: "remote-rejected", detail: `https://x:${token}?expires=1@host ${"y".repeat(900)}` } });
  assert.ok(!r.ok && r.reason === "refused" && !r.detail.includes(token) && r.detail.length <= 600);
});

test("a pushLog request is checked before git: only refs/artroom/log, commit ids, known types, base64url, within the limits", () => {
  const next = "b".repeat(40);
  const ok = { ref: LOG_REF, next, lease: null, objects: [{ type: "blob", data: toB64url(new Uint8Array([0, 1, 255])) }] };
  const d = decodeLogPush(ok);
  assert.ok("objects" in d);
  assert.deepEqual([...d.objects[0]!.data], [0, 1, 255]);
  const refused = (req: object, limits?: { objects: number; bytes: number }) => {
    const r = decodeLogPush({ ...ok, ...req }, limits);
    assert.ok("refused" in r && !r.refused.ok && r.refused.reason === "unknown", JSON.stringify(req).slice(0, 80));
  };
  refused({ ref: "refs/heads/main" });
  refused({ next: "HEAD" });
  refused({ lease: "main" });
  refused({ objects: [{ type: "tag", data: "" }] });
  refused({ objects: [{ type: "blob", data: "a+b/" }] });
  // The bounds are parameters: one object, or one byte, over a small bound is refused, and at the bound it is taken.
  const three = Array.from({ length: 3 }, () => ({ type: "blob", data: toB64url(new Uint8Array(4)) }));
  assert.ok("objects" in decodeLogPush({ ...ok, objects: three }, { objects: 3, bytes: 12 }));
  refused({ objects: three }, { objects: 2, bytes: 12 });
  refused({ objects: three }, { objects: 3, bytes: 11 });
  assert.deepEqual(LOG_PUSH_LIMITS, { objects: 100_000, bytes: 8 * 1024 * 1024 });
});

// ------------------------------------------------------------------ review b618eca1: staging

function blobOf(bytes: Uint8Array) {
  return object("blob", bytes);
}
/** A log commit whose tree holds one blob `big`. */
function bigCommit(big: Uint8Array, parent: string | null) {
  const blob = blobOf(big);
  const tree = object("tree", new Uint8Array([...new TextEncoder().encode("100644 segment\0"), ...Buffer.from(blob.sha, "hex")]));
  const body = `tree ${tree.sha}\n${parent ? `parent ${parent}\n` : ""}author room <r@x> 0 +0000\ncommitter room <r@x> 0 +0000\n\nbig\n`;
  const commit = object("commit", new TextEncoder().encode(body));
  return { blob, tree, commit, all: [blob, tree, commit] };
}
const want = (o: { type: "blob" | "tree" | "commit"; data: Uint8Array; sha: string }) => ({ sha: o.sha, type: o.type, size: o.data.length });
const chunk = (o: { type: "blob" | "tree" | "commit"; data: Uint8Array; sha: string }, offset: number, n: number) => ({ ...want(o), offset, data: o.data.subarray(offset, offset + n) });

test("stageLog: a blob larger than one part is staged in order, checked by its ID, then the commit alone is pushed and lands; each answer is the one lane L's own model of a remote gives; a restarted sandbox has lost the staging and says so", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const big = new Uint8Array(10_000).map((_, i) => (i * 7) % 251);
  const c = bigCommit(big, null);
  const cohort = c.commit.sha;
  const wants = c.all.map(want);
  // Lane L tests its publisher against MemoryGit: the sandbox must answer each call as that model does.
  const model = new MemoryGit();
  const stage = async (parts: ReturnType<typeof chunk>[]) => {
    const r = await f.ops.stageLog(f.canonical, cohort, wants, parts);
    assert.deepEqual(r, await model.stage(cohort as Sha, wants as TheirWant[], parts as TheirPart[]), "the sandbox and lane L's model answer alike");
    return r;
  };
  const after4000 = { ok: true, missing: wants.map((w) => ({ sha: w.sha, have: w.sha === c.blob.sha ? 4000 : 0 })) };
  assert.deepEqual(await stage([chunk(c.blob, 0, 4000)]), after4000);
  // The same part again is skipped; a part out of order is ignored and the answer says where to resume.
  assert.deepEqual(await stage([chunk(c.blob, 0, 4000), chunk(c.blob, 8000, 2000)]), after4000);
  const rest = [chunk(c.blob, 4000, 4000), chunk(c.blob, 8000, 2000), chunk(c.tree, 0, c.tree.data.length), chunk(c.commit, 0, c.commit.data.length)];
  assert.deepEqual(await stage(rest), { ok: true, missing: [] });
  // A restart loses the staging: pushLog on the new sandbox sends nothing and says so, and its probe asks for every object again.
  const restarted = f.sandbox("restarted");
  const lost = await restarted.pushLog(f.canonical, [], cohort, null);
  assert.equal(lost.outcome.outcome, "error");
  const o = toLogOutcome(lost);
  assert.ok(!o.ok && o.reason === "unknown" && /nothing was sent.*stage it again/.test(o.detail));
  assert.equal(f.ref(LOG_REF), null);
  assert.deepEqual(await restarted.stageLog(f.canonical, cohort, wants, []), { ok: true, missing: wants.map((w) => ({ sha: w.sha, have: 0 })) });
  // The sandbox that staged it pushes the commit alone.
  const pushed = await f.ops.pushLog(f.canonical, [], cohort, null);
  assert.equal(pushed.outcome.outcome, "landed");
  assert.deepEqual(toLogOutcome(pushed), await model.push([], LOG_REF, cohort as Sha, null));
  assert.equal(f.ref(LOG_REF), cohort);
  assert.equal(looseObject(f.canonical, c.blob.sha)?.body.length, 10_000);
});

test("stageLog: an object that does not hash to its ID is refused and its staged bytes dropped; a part that does not match what is wanted is refused", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const big = new Uint8Array(3000).fill(1);
  const c = bigCommit(big, null);
  const wants = c.all.map(want);
  // The second part's bytes are not the blob's: the complete file hashes to another ID.
  const forged = { ...chunk(c.blob, 1000, 2000), data: new Uint8Array(2000).fill(2) };
  const r = await f.ops.stageLog(f.canonical, c.commit.sha, wants, [chunk(c.blob, 0, 1000), forged]);
  assert.ok(!r.ok && /hashes to .* its bytes were discarded/.test(r.detail), r.ok ? "ok" : r.detail);
  const area = join(await f.ops.repo(f.canonical), "artroom-stage", c.commit.sha);
  assert.deepEqual(readdirSync(area), [], "the staged bytes were dropped");
  assert.equal(looseObject(await f.ops.repo(f.canonical), c.blob.sha), null, "nothing was stored under the blob's ID");
  const outside = await f.ops.stageLog(f.canonical, c.commit.sha, wants, [{ ...chunk(c.blob, 0, 1000), offset: 2500 }]);
  assert.ok(!outside.ok && /outside the object/.test(outside.detail));
  const whole = await f.ops.stageLog(f.canonical, c.commit.sha, wants, [{ ...chunk(c.tree, 0, c.tree.data.length), sha: c.blob.sha, size: c.tree.data.length }]);
  assert.ok(!whole.ok && /does not match/.test(whole.detail));
  const wrongId = await f.ops.stageLog(f.canonical, c.commit.sha, [{ ...want(c.tree), sha: c.blob.sha }], [{ ...chunk(c.tree, 0, c.tree.data.length), sha: c.blob.sha }]);
  assert.ok(!wrongId.ok && /hashes to/.test(wrongId.detail));
});

test("a stageLog request is checked before git: ids, types, sizes, offsets, base64url, within the limits", () => {
  const sha = "c".repeat(40);
  const ok = { cohort: sha, want: [{ sha, type: "blob", size: 3 }], parts: [{ sha, type: "blob", size: 3, offset: 0, data: toB64url(new Uint8Array([1, 2, 3])) }] };
  const d = decodeLogStage(ok);
  assert.ok("parts" in d && d.parts[0]!.data.length === 3);
  const refused = (req: object, limits?: { objects: number; bytes: number }) => {
    const r = decodeLogStage({ ...ok, ...req }, limits);
    assert.ok("refused" in r && !r.refused.ok, JSON.stringify(req).slice(0, 80));
  };
  refused({ cohort: "HEAD" });
  refused({ want: [{ sha, type: "tag", size: 3 }] });
  refused({ want: [{ sha, type: "blob", size: -1 }] });
  refused({ parts: [{ ...ok.parts[0], offset: 1.5 }] });
  refused({ parts: [{ ...ok.parts[0], data: "a+b" }] });
  refused({}, { objects: 0, bytes: 100 });
  refused({}, { objects: 10, bytes: 2 });
});

// ------------------------------------------------------------------ review de5289a5: staging recovery

type Fault = { when: (argv: readonly string[]) => boolean; mode: "lose" | "fail" };

/**
 * A fixture whose exec can lose the answer of, or fail, the next command
 * matching `when`: "lose" runs it and then throws (the change applied, the
 * reply was lost); "fail" answers a failure without running it.
 */
function faulty() {
  const faults: Fault[] = [];
  const exec: Exec = async (argv, opts) => {
    const i = faults.findIndex((x) => x.when(argv));
    const fault = i >= 0 ? faults.splice(i, 1)[0] : undefined;
    if (fault?.mode === "fail") return { code: 1, stdout: "", stderr: "simulated failure" };
    const r = await localExec(argv, opts);
    if (fault?.mode === "lose") throw new Error("simulated: the command ran and its answer was lost");
    return r;
  };
  return { f: new Fixture(exec).init(), faults };
}
const isAppend = (argv: readonly string[]) => argv[0] === "sh" && argv[2] === 'cat >> "$1"';
const isHashFile = (argv: readonly string[]) => argv.includes("hash-object") && argv.includes("--");
const isRemove = (argv: readonly string[]) => argv[0] === "sh" && argv[2] === 'rm "$1"';
/** The second command that matches `when`. */
const second = (when: Fault["when"]): Fault["when"] => {
  let seen = 0;
  return (argv) => when(argv) && ++seen === 2;
};


test("de5289a5: the final append applied and its answer was lost; the next call, from a restarted client with the filesystem kept, finds the complete file and stores it, and the commit lands", async (t) => {
  const { f, faults } = faulty();
  t.after(() => f.dispose());
  const c = bigCommit(new Uint8Array(6000).fill(6), null);
  const wants = c.all.map(want);
  const file = join(await f.ops.repo(f.canonical), "artroom-stage", c.commit.sha, c.blob.sha);
  faults.push({ when: second(isAppend), mode: "lose" });
  const lost = await f.ops.stageLog(f.canonical, c.commit.sha, wants, [chunk(c.blob, 0, 4000), chunk(c.blob, 4000, 2000)]);
  assert.ok(!lost.ok);
  assert.equal(statSync(file).size, 6000, "the complete file survived");
  // The probe settles it: the blob is stored and no longer missing. The client is new; its sandbox's files are not.
  const restarted = f.sandbox("publisher");
  const probe = await restarted.stageLog(f.canonical, c.commit.sha, wants, []);
  assert.ok(probe.ok);
  assert.ok(!probe.missing.some((m) => m.sha === c.blob.sha));
  assert.equal(existsSync(file), false);
  // The rest is staged whole and the commit alone is pushed: it lands as the commit lane L built.
  const rest = await restarted.stageLog(f.canonical, c.commit.sha, wants, [c.tree, c.commit].map((o) => chunk(o, 0, o.data.length)));
  assert.deepEqual(rest, { ok: true, missing: [] });
  assert.equal((await restarted.pushLog(f.canonical, [], c.commit.sha, null)).outcome.outcome, "landed");
  assert.equal(f.ref(LOG_REF), c.commit.sha);
});

/** Put `bytes` where the sandbox stages `sha` for `cohort`, as earlier calls' appends left them. */
function staged(sandbox: string, cohort: string, sha: string, bytes: Uint8Array): string {
  mkdirSync(join(sandbox, "artroom-stage", cohort), { recursive: true });
  const file = join(sandbox, "artroom-stage", cohort, sha);
  writeFileSync(file, bytes);
  return file;
}

test("de5289a5: a complete staged file whose hash-object answer was lost, whose hash-object failed, or whose cleanup failed is settled by the next call", async (t) => {
  const { f, faults } = faulty();
  t.after(() => f.dispose());
  const sandbox = await f.ops.repo(f.canonical);
  for (const [n, [what, fault]] of ([
    ["lost hash-object answer", { when: isHashFile, mode: "lose" }],
    ["failed hash-object", { when: isHashFile, mode: "fail" }],
    ["failed cleanup", { when: isRemove, mode: "fail" }],
  ] as const).entries()) {
    const c = bigCommit(new Uint8Array(6000).fill(20 + n), null); // a cohort each
    const wants = c.all.map(want);
    // The appends completed the file; the call that settles it meets the fault.
    const file = staged(sandbox, c.commit.sha, c.blob.sha, c.blob.data);
    faults.push(fault);
    const first = await f.ops.stageLog(f.canonical, c.commit.sha, wants, []);
    if (what === "failed cleanup") assert.ok(first.ok && !first.missing.some((m) => m.sha === c.blob.sha), what);
    else assert.ok(!first.ok, what);
    assert.equal(statSync(file).size, 6000, `${what}: the file is still there`);
    assert.equal(looseObject(sandbox, c.blob.sha) !== null, what !== "failed hash-object", `${what}: whether the blob was stored`);
    const probe = await f.ops.stageLog(f.canonical, c.commit.sha, wants, []);
    assert.ok(probe.ok && !probe.missing.some((m) => m.sha === c.blob.sha), what);
    assert.equal(existsSync(file), false, `${what}: the file is gone`);
    assert.equal(looseObject(sandbox, c.blob.sha)?.body.length, 6000, `${what}: the blob is stored`);
  }
});

test("de5289a5: a complete file with the wrong bytes, or too many bytes, is discarded and the call fails", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const sandbox = await f.ops.repo(f.canonical);
  for (const [n, bad] of [new Uint8Array(6000).fill(1), new Uint8Array(6001).fill(10)].entries()) {
    const c = bigCommit(new Uint8Array(6000).fill(10 + n), null); // a cohort each
    const file = staged(sandbox, c.commit.sha, c.blob.sha, bad);
    const r = await f.ops.stageLog(f.canonical, c.commit.sha, c.all.map(want), []);
    assert.ok(!r.ok && /discarded/.test(r.detail), r.ok ? "ok" : r.detail);
    assert.equal(existsSync(file), false, "staging starts again from nothing");
    assert.equal(looseObject(sandbox, c.blob.sha), null, "nothing was stored under the blob's ID");
  }
});

test("de5289a5: a call settles only the objects it asks about, and an object counts as stored only with the exact type and size wanted; staging another cohort discards the previous cohort's partial bytes", async (t) => {
  const f = new Fixture().init();
  t.after(() => f.dispose());
  const sandbox = await f.ops.repo(f.canonical);
  const a = bigCommit(new Uint8Array(3000).fill(4), null);
  // Another batch's staging, 1,000 bytes of the blob, is left as it is.
  const partial = staged(sandbox, a.commit.sha, a.blob.sha, a.blob.data.subarray(0, 1000));
  const asked = await f.ops.stageLog(f.canonical, a.commit.sha, [want(a.tree)], [chunk(a.tree, 0, a.tree.data.length)]);
  assert.deepEqual(asked, { ok: true, missing: [] });
  assert.equal(statSync(partial).size, 1000);
  // The tree is stored: asked for as another type, or another size, it does not count.
  const r = await f.ops.stageLog(f.canonical, a.commit.sha, [{ ...want(a.tree), type: "blob" }], []);
  assert.ok(!r.ok && /stored as a tree/.test(r.detail));
  const sized = await f.ops.stageLog(f.canonical, a.commit.sha, [{ ...want(a.tree), size: a.tree.data.length - 1 }], []);
  assert.ok(!sized.ok && new RegExp(`stored as a tree of ${a.tree.data.length}`).test(sized.detail));
  // Review b618eca1: one cohort's staging at a time. The same cohort again keeps its bytes; another cohort discards them.
  const same = await f.ops.stageLog(f.canonical, a.commit.sha, [want(a.blob)], []);
  assert.deepEqual(same, { ok: true, missing: [{ sha: a.blob.sha, have: 1000 }] });
  const b = bigCommit(new Uint8Array(4000).fill(5), null);
  assert.deepEqual(await f.ops.stageLog(f.canonical, b.commit.sha, [want(b.blob)], []), { ok: true, missing: [{ sha: b.blob.sha, have: 0 }] });
  assert.equal(existsSync(partial), false);
  assert.deepEqual(readdirSync(join(sandbox, "artroom-stage")), [b.commit.sha]);
});
