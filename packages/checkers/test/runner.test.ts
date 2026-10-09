import { existsSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { GitProgram, READ_BOUNDS, Reader, repositorySource, type LiveToken } from "@generalbusiness/artroom-git";
import { checkout, readGrant, runSteps, runnerGateway, type CheckoutAsk, type StepExec } from "../src/index.ts";
import { checkoutObjects, type CheckoutObjectsAsk } from "../src/runner.ts";
// The git package's own test support: real local repositories, made with the `git` program. A local repository is not a host.
import { bare, blob, cleanup, commit, commitText, confirm, git, program, rawCommit, scratch, setRef, tag, tree } from "../../git/test/support/repo.ts";
import { nodeExec } from "../../git/src/node.ts";
import { configuration, digest, lane } from "./support.ts";

afterAll(cleanup);

// One bare repository for the file, built once. Each checkout is made in a directory of its own. The last test removes one loose
// blob, which no test before it needs. The tests run in file order.
let remote: string;
let f: Record<"file" | "cut" | "root" | "baseTree" | "base" | "head" | "other" | "merge" | "tagged" | "cutTree" | "cutHead" | "treeAsParent", string>;
beforeAll(() => {
  remote = bare();
  const [file, cut] = [blob(remote, "one\n"), blob(remote, "cut\n")];
  const sub = tree(remote, [`100755 blob ${file}\trun.sh`]);
  const root = tree(remote, [`100644 blob ${file}\tfile`, `040000 tree ${sub}\tbin`]);
  const baseTree = tree(remote, [`100644 blob ${file}\tfile`]);
  const base = commit(remote, baseTree, []);
  const other = commit(remote, tree(remote, [`100644 blob ${file}\telse`]), []);
  const head = commit(remote, root, [base]);
  const merge = commit(remote, root, [base, other], "merge");
  const tagged = tag(remote, head, "v1");
  const cutTree = tree(remote, [`100644 blob ${cut}\tcut`]);
  const cutHead = commit(remote, cutTree, [base]);
  const treeAsParent = rawCommit(remote, commitText(root, [root]));
  f = { file, cut, root, baseTree, base, head, other, merge, tagged, cutTree, cutHead, treeAsParent };
  expect(confirm(remote)).toEqual([]);
  for (const [name, id] of Object.entries({ head, merge, cut: cutHead, bad: treeAsParent, other })) setRef(remote, `refs/heads/${name}`, id);
  setRef(remote, "refs/tags/v1", tagged);
});

const ask = (over: Partial<CheckoutAsk> = {}): CheckoutAsk => ({ remote, dir: join(scratch(), "work"), commit: f.head, tree: f.root, base: f.base, ...over });
const said = async (over: Partial<CheckoutAsk> = {}, seen?: { argv: string[]; env: string[] }) => { const c = await checkout(program(seen), ask(over)); return c.confirmed ? "confirmed" : c.reason; };

const objectAsk = async (): Promise<CheckoutObjectsAsk> => {
  const source = repositorySource(program(), remote);
  const sub = (await new Reader(source).tree(f.root)).find((entry) => entry.kind === "tree")!.id;
  const objects = await Promise.all([f.head, f.root, sub, f.base, f.baseTree, f.file].map(async (id) => {
    const stored = (await source.object(id, READ_BOUNDS.blobBytes))!;
    return { id, type: stored.type as "blob" | "tree" | "commit", data: stored.data! };
  }));
  return { dir: join(scratch(), "reserved"), commit: f.head, tree: f.root, base: f.base, objects };
};

// Invariant: the runner can execute precisely the immutable reservation's two
// files without contacting a canonical repository or writing any public ref.
test("reservation objects produce a private exact two-file Git checkout without fetch or public refs, and later caller mutation cannot replace its bytes", async () => {
  const seen = { argv: [] as string[], env: [] as string[] };
  const snapshot = await objectAsk();
  const pending = checkoutObjects(program(seen), snapshot);
  snapshot.objects.find((object) => object.type === "blob")!.data.fill(0);
  expect(await pending).toEqual({ confirmed: true, commit: f.head, tree: f.root, parents: [f.base] });
  expect([readFileSync(join(snapshot.dir, "file"), "utf8"), readFileSync(join(snapshot.dir, "bin/run.sh"), "utf8")]).toEqual(["one\n", "one\n"]);
  expect(git(snapshot.dir, ["ls-files"])).toBe("bin/run.sh\nfile");
  expect(git(snapshot.dir, ["for-each-ref"])).toBe("");
  expect(git(snapshot.dir, ["remote"])).toBe("");
  expect(statSync(snapshot.dir).mode & 0o077).toBe(0);
  expect(seen.argv.some((argv) => / fetch | update-ref | push /.test(argv))).toBe(false);
  // The configured step actually executes in this checkout. This is a local
  // Node process, not a container or a hosted checker deployment.
  const exec: StepExec = (argv, options) => new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd: options.cwd, env: Object.fromEntries(options.env.map((v) => [v.name, v.value])), timeout: options.secondsLeft * 1000 });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, line: "two files checked", seconds: 0, outputBytes: 0 }));
  });
  const step = [process.execPath, "-e", "const fs = require('node:fs'); process.exit(['file', 'bin/run.sh'].every(p => fs.readFileSync(p, 'utf8') === 'one\\n') ? 0 : 1)"];
  expect(await runSteps(exec, { ...configuration, steps: [step] }, snapshot.dir)).toEqual({ steps: [{ status: 0, line: "two files checked" }], end: "complete" });
});

// Invariant: missing, substituted, excessive or unrelated snapshot objects
// never reach a Git write or create the runner's directory.
test("reservation validation refuses corrupt IDs, types, closure, base, tree, paths and read limits before any write; SHA-256 is explicitly unsupported", async () => {
  const snapshot = await objectAsk();
  const badPathTree = tree(remote, [`100644 blob ${f.file}\t.Git`]);
  const badPathCommit = commit(remote, badPathTree, [f.base]);
  const source = repositorySource(program(), remote);
  const badPathObjects = await Promise.all([badPathCommit, badPathTree].map(async (id) => {
    const stored = (await source.object(id, READ_BOUNDS.blobBytes))!;
    return { id, type: stored.type as "commit" | "tree", data: stored.data! };
  }));
  const cases: { over: Partial<CheckoutObjectsAsk>; reason: string; bounds?: typeof READ_BOUNDS }[] = [
    { over: { commit: "--help" }, reason: "bad-object-id" },
    { over: { commit: "a".repeat(64) }, reason: "unsupported-object-format" },
    { over: { objects: snapshot.objects.map((o) => o.id === f.file ? { ...o, data: new Uint8Array([1]) } : o) }, reason: "hash-mismatch" },
    { over: { objects: snapshot.objects.map((o) => o.id === f.file ? { ...o, type: "tree" } : o) }, reason: "hash-mismatch" },
    { over: { commit: f.file }, reason: "wrong-type" },
    { over: { objects: snapshot.objects.filter((o) => o.id !== f.file) }, reason: "missing-object" },
    { over: { objects: snapshot.objects.filter((o) => o.id !== f.baseTree) }, reason: "missing-object" },
    { over: { base: f.other }, reason: "parent-mismatch" },
    { over: { tree: f.baseTree }, reason: "tree-mismatch" },
    { over: { objects: [...snapshot.objects, snapshot.objects[0]!] }, reason: "incomplete" },
    { over: { objects: snapshot.objects }, bounds: { ...READ_BOUNDS, closureObjects: snapshot.objects.length - 1 }, reason: "too-large" },
    { over: {}, bounds: { ...READ_BOUNDS, blobBytes: 3 }, reason: "too-large" },
    { over: {}, bounds: { ...READ_BOUNDS, commitBytes: 0 }, reason: "too-large" },
    { over: { commit: badPathCommit, tree: badPathTree, objects: [...snapshot.objects.filter((o) => [f.file, f.base, f.baseTree].includes(o.id)), ...badPathObjects] }, reason: "bad-path" },
  ];
  for (const { over, bounds, reason } of cases) {
    const seen = { argv: [] as string[], env: [] as string[] };
    const candidate = { ...snapshot, ...over, dir: join(scratch(), "refused") };
    expect(await checkoutObjects(program(seen), candidate, bounds)).toEqual({ confirmed: false, reason });
    expect([seen.argv.length, existsSync(candidate.dir)]).toEqual([0, false]);
  }
  // An extra valid object outside the commit's closure also refuses the set.
  const stored = (await source.object(f.other, READ_BOUNDS.commitBytes))!;
  const candidate = { ...snapshot, dir: join(scratch(), "extra"), objects: [...snapshot.objects, { id: f.other, type: "commit" as const, data: stored.data! }] };
  expect(await checkoutObjects(program(), candidate)).toEqual({ confirmed: false, reason: "incomplete" });
  expect(existsSync(candidate.dir)).toBe(false);
});

test("reservation checkout refuses an existing repository and a symlink without modifying either, and verifies Git's returned object ID before checkout", async () => {
  const snapshot = await objectAsk();
  const seen = { argv: [] as string[], env: [] as string[] };
  expect(await checkoutObjects(program(seen), { ...snapshot, dir: remote })).toEqual({ confirmed: false, reason: "bad-directory" });
  symlinkSync(remote, snapshot.dir);
  expect(await checkoutObjects(program(seen), snapshot)).toEqual({ confirmed: false, reason: "bad-directory" });
  expect(seen.argv).toEqual([]);
  expect(confirm(remote)).toEqual([]);
  const ran: string[][] = [];
  const liar = new GitProgram({ transport: "local", exec: async (argv, options) => {
    ran.push([...argv]);
    const result = await nodeExec(argv, options);
    return argv.includes("hash-object") ? { ...result, stdout: new TextEncoder().encode(`${f.other}\n`) } : result;
  } });
  expect(await checkoutObjects(liar, { ...snapshot, dir: join(scratch(), "lie") })).toEqual({ confirmed: false, reason: "hash-mismatch" });
  expect(ran.some((argv) => argv.includes("checkout"))).toBe(false);
});

test("T36, the runner's checkout checks the commit, its tree and its parents against the job, on a real repository: the job's commit with its tree and its base is checked out; another tree, another first parent, no parent, a tag in the commit's place and a parent that is no commit are each not confirmed, and nothing is checked out for them", async () => {
  const seen = { argv: [] as string[], env: [] as string[] };
  const work = ask();
  const done = await checkout(program(seen), work);
  expect(done).toEqual({ confirmed: true, commit: f.head, tree: f.root, parents: [f.base] });
  expect([readFileSync(join(work.dir, "file"), "utf8"), existsSync(join(work.dir, "bin", "run.sh"))]).toEqual(["one\n", true]);
  // A merge commit: every parent is read as a commit, and the first is the base.
  expect(await checkout(program(), ask({ commit: f.merge }))).toEqual({ confirmed: true, commit: f.merge, tree: f.root, parents: [f.base, f.other] });
  // No credential and no caller's environment reaches the program, and every remote and revision stands after an end-of-options mark.
  expect([seen.env.some((e) => /TOKEN|AUTH|SECRET/i.test(e)), seen.argv.filter((a) => a.includes(" fetch ")).every((a) => a.includes(` -- ${remote} ${f.head}`))]).toEqual([false, true]);

  const refused = ask({ tree: f.file });
  expect([
    await checkout(program(), refused).then((c) => (c.confirmed ? "confirmed" : c.reason)),   // the job states another tree
    existsSync(join(refused.dir, "file")),                                                     // and nothing of the tree is checked out
    await said({ base: f.other }),                                                             // the job states another base than the first parent
    await said({ commit: f.merge, base: f.other }),                                            // the base is a parent, and not the first
    await said({ commit: f.base, tree: f.baseTree }),                                          // a commit with no parent, where the job states a base
    await said({ commit: f.tagged }),                                                          // a tag of the commit is not the commit
    await said({ commit: f.treeAsParent, base: f.root }),                                      // a parent line that names a tree
  ]).toEqual(["tree-mismatch", false, "parent-mismatch", "parent-mismatch", "parent-mismatch", "wrong-type", expect.stringMatching(/^(wrong-type|fetch-failed)$/)]);
});

test("every value is checked inside the checkout before it is an argument, and a commit whose closure is not whole is not confirmed: no command runs for a remote, a directory or an ID that is not in form", async () => {
  const seen = { argv: [] as string[], env: [] as string[] };
  expect([
    await said({ commit: "--upload-pack=touch /tmp/x" }, seen), await said({ commit: "HEAD" }, seen), await said({ tree: f.root.toUpperCase() }, seen), await said({ base: "0".repeat(40) }, seen),
    await said({ commit: "a".repeat(64) }, seen),
    await said({ remote: "ext::sh -c touch% /tmp/x" }, seen), await said({ remote: "-u" }, seen), await said({ remote: "https://user:pw@host.example/r.git" }, seen),
    await said({ dir: "relative/dir" }, seen), await said({ dir: "--work-tree=/" }, seen), await said({ dir: "/tmp/../etc" }, seen),
    seen.argv.length,
  ]).toEqual(["bad-object-id", "bad-object-id", "bad-object-id", "bad-object-id", "unsupported-object-format", "bad-remote", "bad-remote", "credential-in-url", "bad-directory", "bad-directory", "bad-directory", 0]);
  // The remote cannot send one blob of the commit's tree: the fetch does not complete, and nothing is confirmed.
  rmSync(join(remote, "objects", f.cut.slice(0, 2), f.cut.slice(2)));
  expect(await said({ commit: f.cutHead, tree: f.cutTree })).toMatch(/^(fetch-failed|missing-object)$/);
});

test("the steps run in order with exactly the configuration's variables, a step that fails stops the run before the judging step, and a run that passes its limits ends there", async () => {
  const ran: string[] = [];
  const exec = (results: Record<string, number>, cost = 1): StepExec => (argv, opts) => {
    ran.push(`${argv.join(" ")} in ${opts.cwd} with ${opts.env.map((v) => v.name).join(",")}, ${opts.secondsLeft}s left`);
    return Promise.resolve({ status: results[argv.join(" ")] ?? 0, line: "ok", seconds: cost, outputBytes: 10 });
  };
  expect(await runSteps(exec({}), configuration, "/work/src")).toEqual({ steps: [{ status: 0, line: "ok" }, { status: 0, line: "ok" }], end: "complete" });
  expect(ran).toEqual(["npm ci in /work/src with HOME,CI, 900s left", "npm test in /work/src with HOME,CI, 899s left"]);
  expect([await runSteps(exec({ "npm ci": 1 }), configuration, "/work/src"), await runSteps(exec({}, 900), configuration, "/work/src"), await runSteps(exec({}, 901), configuration, "/work/src")]).toEqual([
    { steps: [{ status: 1, line: "ok" }], end: "complete" }, { steps: [{ status: 0, line: "ok" }], end: "limits" }, { steps: [{ status: 0, line: "ok" }], end: "limits" },
  ]);
});

test("the runner's gateway forwards only the two read requests of the job's own repository, with the read token in its one header: a path that only begins with the repository's, a push, another query and another host are refused, and a redirect is not followed. The host is a stand-in", async () => {
  const repository = "https://git.example/acme/app.git";
  const job = { lane, fact: { at: lane, seq: 7, hash: digest("7") } };
  const plaintext = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  const token: LiveToken = { scope: lane, token: 1, id: "tok-1", ends: "2099-01-01T00:20:00Z", purpose: "check-read", for: { job: job.fact }, state: "live", plaintext };
  // A token of another purpose, of another job, or of another lane opens no grant for this run.
  expect([readGrant(job, repository, { ...token, purpose: "staging" }), readGrant(job, repository, { ...token, for: { job: { ...job.fact, seq: 8 } } }), readGrant(job, repository, { ...token, for: { hold: 1, instance: "i" } })]).toEqual([null, null, null]);
  const grant = readGrant(job, repository, token)!;
  expect([grant.update, grant.repository, grant.attempt]).toEqual([null, repository, `${lane.scope}.${lane.inc}.7`]);

  const reached: { url: string; method: string; auth: string | null; cookie: string | null; redirect: string }[] = [];
  const records: unknown[] = [];
  const { gateway, record } = await runnerGateway({
    records: { write: (r) => { records.push(r); return Promise.resolve(); } },
    upstream: (request) => { reached.push({ url: request.url, method: request.method, auth: request.headers.get("authorization"), cookie: request.headers.get("cookie"), redirect: request.redirect }); return Promise.resolve(new Response("ok")); },
    credential: (secret) => ["authorization", `Bearer ${secret}`],
  }, grant);
  const get = (url: string, init: RequestInit = {}) => gateway.forward(new Request(url, { headers: { authorization: "Bearer the-runners-own", cookie: "a=b" }, ...init })).then((r) => r.status);
  const post = (url: string) => get(url, { method: "POST", body: "0000" });
  expect([
    await get(`${repository}/info/refs?service=git-upload-pack`), await post(`${repository}/git-upload-pack`),
    await get(`${repository}/info/refs?service=git-receive-pack`), await post(`${repository}/git-receive-pack`),           // a runner may not push
    await get(`${repository}2/info/refs?service=git-upload-pack`), await get("https://git.example/acme/app.gitx/info/refs?service=git-upload-pack"),   // a prefix match is not enough
    await get("https://git.example/acme/other.git/info/refs?service=git-upload-pack"), await get("https://registry.example/pkg"),
    await get(`${repository}/info/refs?service=git-upload-pack&x=1`), await get(`${repository}/info/refs`), await get(`${repository}/objects/info/packs`), await get(`${repository}/%69nfo/refs?service=git-upload-pack`),
    await get(`${repository}/git-upload-pack`),
  ]).toEqual([200, 200, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403]);
  // Two requests reached the host, each at the repository's own path, with the token in the one header and nothing of the runner's own credential. Neither follows a redirect.
  expect(reached).toEqual([
    { url: `${repository}/info/refs?service=git-upload-pack`, method: "GET", auth: `Bearer ${plaintext}`, cookie: null, redirect: "manual" },
    { url: `${repository}/git-upload-pack`, method: "POST", auth: `Bearer ${plaintext}`, cookie: null, redirect: "manual" },
  ]);
  // The gateway's record holds the token's ID and never its plaintext.
  expect([record.token, JSON.stringify(records).includes(plaintext)]).toEqual(["tok-1", false]);
});
