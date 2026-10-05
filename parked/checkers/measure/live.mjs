#!/usr/bin/env node
// Live runs of the checkers against a small Artifacts repo, through the
// harness Worker `artroom-lg-checkers` (measure/harness/, deployed only for a
// run: see the README, "Live runs").
//
//   LG_KEY_FILE=~/.artroom-lg-key node measure/live.mjs
//
// Shows: pass, fail, a changed test with unchanged source rerunning, a type
// error, a scoped checker unable to read an excluded file, a runner that
// cannot push or reach the internet, and the advisory LLM reviewer. Also
// (review c46a4491): a job that replaces npm in the image and leaves a
// process running, then the same failing commit again; two checks of one
// checker at once; and a scoped snapshot whose listing is over 64 KiB with
// a credential-shaped file name. Every job runs in a new container, so every
// timing is a cold start. Also (review bdcc7cc9): every snapshot has its own
// repository, retired when its job ends; a scoped job cannot read an older,
// wider snapshot of the same commit (which holds the excluded file) by known
// ID while that snapshot's repository is still in use. Deletes its repos at
// the end. Prints no token.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const URL_ = process.env.LG_URL ?? "https://artroom-lg-checkers.inguz.workers.dev";
const KEY = readFileSync(process.env.LG_KEY_FILE ?? join(homedir(), ".artroom-lg-key"), "utf8").trim();
const HERE = dirname(fileURLToPath(import.meta.url));
const RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s) => String(s).replace(RE, "<token>");
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const RUN = Date.now().toString(36);
const REPO = `artroom-lg-live-${RUN}`;
const out = { repo: REPO, runs: [] };

async function h(route, body = {}) {
  const s = Date.now();
  const r = await fetch(`${URL_}/h/${route}`, { method: "POST", headers: { "x-lg-key": KEY, "content-type": "application/json", "user-agent": "artroom-lg-live/1.0" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (r.status !== 200) throw new Error(`${route}: ${r.status} ${redact(JSON.stringify(j))}`);
  return { ...j, clientMs: Date.now() - s };
}
function oauth() {
  return /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))[1];
}
async function api(method, path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/gitseq-spike${path}`, { method, headers: { authorization: `Bearer ${oauth()}`, "user-agent": "artroom-lg-live/1.0" } });
  return r.json().catch(() => ({}));
}
function git(args, cwd, token) {
  return execFileSync("git", ["-c", "credential.helper=", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    env: { PATH: process.env.PATH, HOME: cwd, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "agent", GIT_AUTHOR_EMAIL: "a@i", GIT_COMMITTER_NAME: "agent", GIT_COMMITTER_EMAIL: "a@i", ...(token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` } : {}) },
    stdio: ["ignore", "pipe", "pipe"],
  }).toString().trim();
}
function write(dir, files) {
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    if (t === null) rmSync(join(dir, p), { force: true });
    else writeFileSync(join(dir, p), t);
  }
}

const PROJECT = {
  "package.json": JSON.stringify({ name: "demo", version: "1.0.0", private: true, type: "module", scripts: { test: "node --test" }, devDependencies: { typescript: "5.9.3" } }, null, 2) + "\n",
  "tsconfig.json": JSON.stringify({ compilerOptions: { noEmit: true, strict: true, allowJs: true, checkJs: true, module: "nodenext", target: "es2022", skipLibCheck: true }, include: ["src"] }, null, 2) + "\n",
  "src/add.js": "/** @param {number} a @param {number} b */\nexport function add(a, b) {\n  return a + b;\n}\n",
  "src/units.ts": "export const metresPerKm: number = 1000;\n",
  "src/secret.txt": "data a scoped checker must not see\n",
  "test/add.test.js": 'import { test } from "node:test";\nimport assert from "node:assert";\nimport { add } from "../src/add.js";\ntest("adds", () => assert.equal(add(2, 2), 4));\n',
};

async function check(name, checker, commit, extra = {}) {
  const r = await h("check", { repo: REPO, checker, commit, ...extra });
  const res = r.result;
  const row = {
    name,
    checker,
    commit: commit.slice(0, 8),
    ok: res.refused ? null : res.ok,
    refused: res.refused ? res.rule : null,
    volatile: res.volatile ?? null,
    input: res.input?.kind ?? null,
    detail: (res.detail ?? res.reason ?? "").split("\n").slice(0, 3).join(" | ").slice(0, 300),
    note: r.note ? r.note.text.split("\n")[0] : null,
    ms: r.ms,
    clientMs: r.clientMs,
    runner: res.runner ?? null,
  };
  out.runs.push({ ...row, detailFull: res.detail ?? null, noteFull: r.note?.text ?? null, snapshot: r.snapshot ?? null });
  log(`${name}: ${checker} on ${row.commit} -> ${row.refused ? `refused ${row.refused}` : row.ok ? "PASS" : "FAIL"}; ${row.ms.check} ms in the check (${row.ms.jobAndSnapshot} ms to build the job)`);
  log(`   ${row.detail}`);
  if (row.note) log(`   note: ${row.note}`);
  return res;
}

async function main() {
  log(`repo ${REPO}`);
  const made = await h("create", { repo: REPO });
  const w = mkdtempSync(join(tmpdir(), "lg-live-"));
  git(["init", "-q"], w);
  write(w, PROJECT);
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: w, stdio: "ignore" });
  const commitAll = (msg) => {
    git(["add", "-A"], w);
    git(["commit", "-q", "-m", msg], w);
    return git(["rev-parse", "HEAD"], w);
  };
  const c1 = commitAll("base: passing tests and types");
  git(["checkout", "-q", "-b", "broken"], w);
  write(w, { "src/add.js": PROJECT["src/add.js"].replace("a + b", "a - b") });
  const c2 = commitAll("break add");
  git(["checkout", "-q", "--detach", c1], w);
  write(w, { "test/add.test.js": PROJECT["test/add.test.js"].replace("add(2, 2), 4", "add(2, 2), 5") });
  const c3 = commitAll("change only the test");
  git(["checkout", "-q", "--detach", c1], w);
  write(w, { "src/units.ts": "export const metresPerKm: number = '1000';\n" });
  const c4 = commitAll("type error");
  git(["checkout", "-q", "--detach", c1], w);
  write(w, { "test/secret.test.js": 'import { test } from "node:test";\nimport { readFileSync } from "node:fs";\ntest("reads an undeclared file", () => readFileSync(new URL("../src/secret.txt", import.meta.url), "utf8"));\n' });
  const c5 = commitAll("a test that reads an undeclared file");
  git(["checkout", "-q", "--detach", c1], w);
  // A job that replaces npm in the image and leaves a process running that keeps replacing it.
  write(w, {
    "package.json": PROJECT["package.json"].replace('"test": "node --test"', '"test": "node poison.mjs"'),
    "poison.mjs": [
      'import { writeFileSync, realpathSync } from "node:fs";',
      'import { spawn } from "node:child_process";',
      'const npm = realpathSync("/usr/local/bin/npm");',
      'const fake = "#!/bin/sh\\nexit 0\\n";',
      'try { writeFileSync(npm, fake, { mode: 0o755 }); console.log("replaced", npm); } catch (e) { console.log("could not replace npm:", e.code); }',
      'spawn("sh", ["-c", `while true; do printf "${fake}" > ${npm}; sleep 1; done`], { detached: true, stdio: "ignore" }).unref();',
      'console.log("left a process running");',
    ].join("\n") + "\n",
  });
  const c6 = commitAll("poison the runner image");
  git(["checkout", "-q", "--detach", c1], w);
  // A scoped snapshot listing over 64 KiB, with a credential-shaped (but legal) file name.
  const odd = `src/${["art", "v1", "notatoken0123456789"].join("_")}.js`;
  const many = { [odd]: "export const odd = 1;\n" };
  for (let i = 0; i < 1800; i++) many[`src/gen/file-${String(i).padStart(4, "0")}.js`] = "export const n = 1;\n";
  write(w, many);
  const c7 = commitAll("1,800 small files and a credential-shaped name");
  for (const [c, ref] of [[c1, "main"], [c2, "refs/artroom/integration/op_2/1"], [c3, "refs/artroom/integration/op_3/1"], [c4, "refs/artroom/integration/op_4/1"], [c5, "refs/artroom/integration/op_5/1"], [c6, "refs/artroom/integration/op_6/1"], [c7, "refs/artroom/integration/op_7/1"]]) {
    git(["push", "-q", made.remote, `${c}:${ref.startsWith("refs/") ? ref : `refs/heads/${ref}`}`], w, made.seedToken);
  }
  const sealed = await h("seal", { repo: REPO });
  log(`seeded 7 commits; seed token revoked: ${sealed.revoked}`);
  const secretBlob = git(["rev-parse", `${c1}:src/secret.txt`], w);

  await check("pass", "tests", c1);
  await check("pass, again", "tests", c1);
  const failed = await check("fail", "tests", c2);
  await check("changed test, unchanged source", "tests", c3);
  await check("types pass", "types", c1);
  await check("types fail", "types", c4);
  await check("scoped: a test reads an excluded file", "tests", c5, { scoped: ["src/add.js"] });
  await check("llm review", "llm-review", c2);
  // G1: a job poisons its container; the next check of the failing commit must still fail, with the same runner digest.
  await check("poison: replace npm and leave a process running", "tests", c6);
  const again = await check("fail, after the poison job", "tests", c2);
  out.poison = { stillFails: again.ok === false, sameRunnerDigest: again.runner === failed.runner };
  log("after the poison job:", out.poison);
  // G2: two checks of one checker at once.
  const [ca, cb] = await Promise.all([check("concurrent: pass", "tests", c1), check("concurrent: fail", "tests", c2)]);
  out.concurrent = { passStillPasses: ca.ok === true, failStillFails: cb.ok === false };
  log("concurrent:", out.concurrent);
  // G4: a scoped listing over 64 KiB with a credential-shaped file name. It declares src/**, so this
  // snapshot holds src/secret.txt; it has its own repository, which the scoped probes below cannot read.
  const big = await check("scoped: 1,800 files and a credential-shaped name", "tests", c7, { scoped: ["src/**"] });
  out.bigScoped = { ok: big.ok, files: out.runs.at(-1).snapshot?.files?.length ?? null, holdsSecret: out.runs.at(-1).snapshot?.files?.includes("src/secret.txt") ?? null };
  log("big scoped:", out.bigScoped);

  const p1 = await h("probe", { repo: REPO, checker: "tests", commit: c1 });
  out.probeTree = p1;
  log("probe, whole-tree job:");
  for (const r of p1.results) log(`   ${r.argv.slice(0, 80)} -> exit ${r.exit}: ${r.out.split("\n").slice(-1)[0]}`);
  // Review bdcc7cc9: an older, wider snapshot (src/**, with src/secret.txt) is built first and kept in use while
  // the current src/add.js job runs; the current job tries its commit, tree and the excluded blob by known ID.
  const p2 = await h("probe", { repo: REPO, checker: "tests", commit: c1, older: ["src/**"], scoped: ["src/add.js"], excludedPath: "src/secret.txt", excludedBlob: secretBlob, other: made.remote });
  out.probeScoped = p2;
  log(`probe, scoped job (snapshot files: ${p2.snapshot?.files?.join(", ")}; older snapshot ${p2.older?.commit?.slice(0, 8)} with ${p2.older?.files} files, secret included: ${p2.older?.hasSecret}):`);
  for (const r of p2.results) log(`   ${r.argv.length > 90 ? `${r.argv.slice(0, 40)} … ${r.argv.slice(-46)}` : r.argv} -> exit ${r.exit}: ${r.out.split("\n").slice(-1)[0]}`);

  // Retirement: each snapshot repository is deleted when its job ends; nothing is owed.
  const duties = await h("snapshots");
  const left = ((await api("GET", `/repos?limit=200&search=artroom-lg--snap-`)).result ?? []).map((r) => r.name);
  out.retirement = { pending: duties.pending, duties: duties.duties.length, done: duties.duties.filter((d) => d.state === "done").length, snapshotReposLeft: left };
  log("snapshot repositories:", out.retirement);

  // Cleanup. Runner containers were destroyed at the end of each job.
  const repos = [...((await api("GET", `/repos?limit=200&search=${REPO}`)).result ?? []), ...((await api("GET", `/repos?limit=200&search=artroom-lg--snap-`)).result ?? [])];
  for (const r of repos) {
    const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
    for (const t of toks) await api("DELETE", `/tokens/${t.id}`);
    log(`deleted ${r.name}: ${(await api("DELETE", `/repos/${r.name}`)).success} (revoked ${toks.length} active tokens first)`);
  }
  rmSync(w, { recursive: true, force: true });
  const file = join(HERE, "results", `live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`saved ${file}`);
}

main().catch((e) => {
  console.error(redact(e?.stack ?? e));
  process.exit(1);
});
