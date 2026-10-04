// The first commit on a new canonical repository's main (R-GEN-12), pushed
// over git's smart HTTP protocol, against real git's receive-pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { EMPTY_TREE_SHA, FIRST_COMMIT_IDENTITY, FIRST_COMMIT_MESSAGE, firstCommit, pushFirstCommit } from "../src/first-commit.ts";
import { GitObjects, bareRepo, cleanup, localExec, objectsIn, readRef, sh, tmp, writeRef } from "./support.ts";

const AT = Date.UTC(2026, 9, 2, 3, 4, 5);

/** A fetch that serves `git-receive-pack` as git's HTTP backend does: `git receive-pack --stateless-rpc` on the request body. */
function gitBackend(bare: string, seen: { url?: string; auth?: string | null }[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push({ url: req.url, auth: req.headers.get("authorization") });
    const body = new Uint8Array(await req.arrayBuffer());
    const r = await localExec(["git", "receive-pack", "--stateless-rpc", bare], { cwd: bare, env: { HOME: bare, GIT_CONFIG_NOSYSTEM: "1" }, stdin: body });
    if (r.code !== 0) return new Response(r.stderr, { status: 500 });
    return new Response(r.stdout, { status: 200, headers: { "content-type": "application/x-git-receive-pack-result" } });
  }) as typeof fetch;
}

/** An empty bare repository, written as files. */
const emptyRepo = (root: string) => bareRepo(join(root, "canonical.git"));

test("the first commit is the commit git itself makes: the empty tree, the Room's identity, the founding time", async (t) => {
  const root = tmp();
  t.after(() => cleanup(root));
  const bare = emptyRepo(root);
  const { commit, objects } = await firstCommit(AT);
  assert.deepEqual(objects.map((o) => o.type), ["tree", "commit"]);
  assert.equal(objects[0]!.sha, EMPTY_TREE_SHA);
  const [name, email] = /^(.*) <(.*)>$/.exec(FIRST_COMMIT_IDENTITY)!.slice(1) as [string, string];
  const date = `@${AT / 1000} +0000`;
  const r = await localExec(["git", "--git-dir", bare, "commit-tree", EMPTY_TREE_SHA], {
    cwd: root,
    env: { HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    stdin: new TextEncoder().encode(FIRST_COMMIT_MESSAGE),
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), commit);
  // Fixed by its time: a retried founding pushes the same commit.
  assert.equal((await firstCommit(AT)).commit, commit);
  assert.notEqual((await firstCommit(AT + 1000)).commit, commit);
});

test("pushed to an empty repository, main is created at the first commit; the pack is complete and the token travels only in the header", async (t) => {
  const root = tmp();
  t.after(() => cleanup(root));
  const bare = emptyRepo(root);
  const seen: { url?: string; auth?: string | null }[] = [];
  const out = await pushFirstCommit("https://acct.artifacts.cloudflare.net/git/ns/repo.git", "art_v1_secret", AT, gitBackend(bare, seen));
  const { commit } = await firstCommit(AT);
  assert.deepEqual(out, { kind: "created", commit });
  assert.equal(readRef(bare, "refs/heads/main"), commit);
  assert.equal(objectsIn(bare).commitFacts(commit).tree, EMPTY_TREE_SHA);
  await sh(root, "--git-dir", bare, "fsck", "--strict", "--no-dangling");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, "https://acct.artifacts.cloudflare.net/git/ns/repo.git/git-receive-pack");
  assert.equal(seen[0]!.auth, "Bearer art_v1_secret");
  // The same first commit pushed again (a retried founding) is refused, and main is the first's.
  assert.equal((await pushFirstCommit("https://acct.artifacts.cloudflare.net/git/ns/repo.git", "art_v1_secret", AT, gitBackend(bare, []))).kind, "refused");
  assert.equal(readRef(bare, "refs/heads/main"), commit);
});

test("a repository whose main exists is never moved: the push is refused, and main keeps its commit", async (t) => {
  const root = tmp();
  t.after(() => cleanup(root));
  const bare = emptyRepo(root);
  const theirs = new GitObjects();
  const before = theirs.commit([], {}, { message: "someone else's main\n" });
  theirs.writeInto(bare);
  writeRef(bare, "refs/heads/main", before);
  const out = await pushFirstCommit("https://h/git/ns/repo.git", "art_v1_x", AT, gitBackend(bare, []));
  assert.equal(out.kind, "refused");
  assert.match(out.kind === "refused" ? out.detail : "", /ng refs\/heads\/main/);
  assert.equal(readRef(bare, "refs/heads/main"), before);
});

test("an answer that is not a clear ok is refused, never created", async () => {
  const fake = (status: number, text: string) => (async () => new Response(text, { status })) as unknown as typeof fetch;
  for (const [status, text] of [
    [401, "unauthorized"],
    [200, ""],
    [200, "000eunpack ok\n0000"],
    [200, "0012ok refs/heads/main\n0000"],
  ] as const) {
    const out = await pushFirstCommit("https://h/git/ns/r.git", "art_v1_x", AT, fake(status, text));
    assert.equal(out.kind, "refused", `${status} ${JSON.stringify(text)}`);
    assert.doesNotMatch(out.kind === "refused" ? out.detail : "", /art_v1_x/);
  }
});
