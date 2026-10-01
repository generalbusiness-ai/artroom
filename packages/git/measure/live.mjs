#!/usr/bin/env node
// Live smoke of lane B against real Artifacts repos, through the deployed
// Worker `artroom-lb-git` (the publisher container and the harness Room).
//
//   LB_KEY_FILE=~/.artroom-lb-key node measure/live.mjs
//
// It creates a canonical repo, two lane forks with lease-bound tokens, pushes
// lane work as an agent would, proposes (pin, bounded diff, preview plan),
// lands both lanes (one by the alarm alone), shows a conflicting lane failing
// with its paths, revokes a lane's token on release, and cleans up. Saves a
// redacted result file. Prints no token.

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const URL_ = process.env.LB_URL ?? "https://artroom-lb-git.inguz.workers.dev";
const KEY = readFileSync(process.env.LB_KEY_FILE ?? join(homedir(), ".artroom-lb-key"), "utf8").trim();
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s) => String(s).replace(TOKEN_RE, "<token>");
const t0 = Date.now();
const out = { steps: [] };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lane = (n) => `act_${1000 + n}_${(0xabcdef00 + n).toString(16)}`;

async function h(route, body) {
  const s = Date.now();
  const r = await fetch(`${URL_}/h/${route}`, { method: "POST", headers: { "x-lb-key": KEY, "content-type": "application/json", "user-agent": "artroom-lb-live/1.0" }, body: JSON.stringify({ room: ROOM, ...body }) });
  const j = await r.json();
  const ms = Date.now() - s;
  out.steps.push({ route, status: r.status, clientMs: ms, result: JSON.parse(redact(JSON.stringify({ ...j, grant: j.grant ? { ...j.grant, token: "<token>" } : undefined, seedToken: undefined }))) });
  if (r.status !== 200) throw new Error(`${route}: ${r.status} ${redact(JSON.stringify(j))}`);
  return j;
}

function oauth() {
  const m = /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"));
  return m[1];
}
async function api(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, {
    method,
    headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-lb-live/1.0" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json().catch(() => ({}));
}

function git(args, { cwd, token } = {}) {
  const env = {
    PATH: process.env.PATH, HOME: cwd ?? tmpdir(), GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/bin/false",
    GIT_AUTHOR_NAME: "agent", GIT_AUTHOR_EMAIL: "agent@invalid", GIT_COMMITTER_NAME: "agent", GIT_COMMITTER_EMAIL: "agent@invalid",
    ...(token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` } : {}),
  };
  return new Promise((resolve) =>
    execFile("git", ["-c", "credential.helper=", "-c", "init.defaultBranch=main", ...args], { cwd, env, maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout.trim(), stderr: redact(stderr).trim().slice(-600) }),
    ),
  );
}
async function must(args, opts) {
  const r = await git(args, opts);
  if (r.code !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
  return r.stdout;
}
function write(dir, path, text) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const lines = (tag, n = 30) => Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}\n`).join("");
const editLine = (text, i, rep) => text.split("\n").map((l, k) => (k === i - 1 ? rep : l)).join("\n");

const RUN = Date.now().toString(36);
const ROOM = `lb-live-${RUN}`;
const REPO = `artroom-lb-live-${RUN}`;

async function agentPush(n, edits, msg) {
  const ws = await h("workspace", { lane: lane(n), lease: 1, leaseMs: 15 * 60_000 });
  log(`lane ${n}: workspace ${ws.view.state} in ${ws.ms} ms (fork ${ws.fork}); token expires ${ws.grant.expiresAt}`);
  const dir = mkdtempSync(join(tmpdir(), `lb-lane${n}-`));
  await must(["clone", "-q", ws.grant.remote, dir], { token: ws.grant.token });
  for (const [p, t] of Object.entries(edits)) write(dir, p, t);
  await must(["add", "-A"], { cwd: dir });
  await must(["commit", "-q", "-m", msg], { cwd: dir });
  const head = await must(["rev-parse", "HEAD"], { cwd: dir });
  await must(["push", "-q", "origin", "HEAD:refs/heads/work"], { cwd: dir, token: ws.grant.token });
  return { ws, dir, head };
}

async function main() {
  log(`room ${ROOM}, repo ${REPO}`);
  const created = await h("create", { repo: REPO });
  const seed = mkdtempSync(join(tmpdir(), "lb-seed-"));
  await must(["init", "-q"], { cwd: seed });
  write(seed, "README.md", "live smoke\n");
  write(seed, "src/a.txt", lines("a"));
  write(seed, "src/b.txt", lines("b"));
  for (let d = 0; d < 20; d++) for (let i = 0; i < 25; i++) write(seed, `pkg${d}/f${i}.txt`, `${d}.${i}\n`);
  await must(["add", "-A"], { cwd: seed });
  await must(["commit", "-q", "-m", "seed"], { cwd: seed });
  await must(["push", "-q", created.remote, "HEAD:refs/heads/main"], { cwd: seed, token: created.seedToken });
  const init = await h("init", { repo: REPO });
  log(`init: main ${init.main.slice(0, 8)}, seed tokens revoked ${init.revoked}`);

  // Two lanes, disjoint paths.
  const l1 = await agentPush(1, { "src/a.txt": editLine(lines("a"), 3, "lane 1 edit") }, "lane 1");
  const l2 = await agentPush(2, { "src/b.txt": editLine(lines("b"), 3, "lane 2 edit") }, "lane 2");
  // Lane 3 forks from the same main and edits the same line as lane 1.
  const l3 = await agentPush(3, { "src/a.txt": editLine(lines("a"), 3, "lane 3 edit") }, "lane 3");
  for (const [n, l] of [[1, l1], [2, l2]]) {
    const p = await h("propose", { lane: lane(n), generation: 1, head: l.head });
    log(`lane ${n}: propose ${p.pinned.map((x) => x.kind).join(",")}; diff ${p.diff.kind} ${JSON.stringify(p.diff.changes)}; plan ${p.plan}; ms`, p.ms);
  }
  // Pin refusal: a head the fork does not have.
  const bogus = await h("propose", { lane: lane(1), generation: 9, head: "0123456789abcdef0123456789abcdef01234567" }).catch((e) => ({ error: e.message }));
  log(`propose with a head not in the fork:`, bogus.refused ?? bogus.error);

  // Land lane 1 directly; accept lane 2 and leave it to the alarm.
  const a = await h("land", { lane: lane(1) });
  log(`lane 1 land: ${a.op.state}; reserve ${a.reserve.kind}; ms`, a.ms);
  const b = await h("land", { lane: lane(2), drive: false });
  log(`lane 2 accepted (${b.op.state}); waiting for the alarm`);
  let v;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    v = await h("view", { op: b.op.id });
    if (v.op.state === "landed" || v.op.state === "failed" || v.op.state === "retryable") break;
  }
  log(`lane 2 by alarm: ${v.op.state}, attempts ${v.op.attempts}, expectedMain ${v.op.expectedMain?.slice(0, 8)}`);

  // Check main has both changes.
  const rt = await api("POST", "/tokens", { repo: REPO, scope: "read", ttl: 60 });
  const check = mkdtempSync(join(tmpdir(), "lb-check-"));
  await must(["clone", "-q", created.remote, check], { token: rt.result.plaintext });
  await api("DELETE", `/tokens/${rt.result.id}`);
  const a1 = readFileSync(join(check, "src/a.txt"), "utf8").includes("lane 1 edit");
  const b2 = readFileSync(join(check, "src/b.txt"), "utf8").includes("lane 2 edit");
  const mainLog = await must(["log", "--format=%h %p %s", "-4"], { cwd: check });
  log(`main has lane 1 edit: ${a1}; lane 2 edit: ${b2}`);
  log(`main history:\n${mainLog}`);
  out.mainHasBoth = a1 && b2;

  // A conflicting lane, based on the seed: overlap → container preview → conflict; land fails with paths.
  const p3 = await h("propose", { lane: lane(3), generation: 1, head: l3.head, forcePreview: true });
  log(`lane 3: plan ${p3.plan}; preview ${JSON.stringify(p3.preview)}; ms`, p3.ms);
  const c = await h("land", { lane: lane(3) });
  log(`lane 3 land: ${c.op.state} ${JSON.stringify(c.op.reason ?? null)}`);

  // Diff timing, cold and warm, on a 20-directory change.
  const wide = await agentPush(4, Object.fromEntries(Array.from({ length: 20 }, (_, d) => [`pkg${d}/f0.txt`, "changed\n"])), "lane 4 wide");
  await h("propose", { lane: lane(4), generation: 1, head: wide.head });
  const cold = await h("diff", { from: init.main, to: wide.head, cold: true });
  const warm = await h("diff", { from: init.main, to: wide.head });
  const bounded = await h("diff", { from: init.main, to: wide.head, cold: true, bounds: { maxEntries: 100 } });
  log(`diff of 20 changed files: cold ${cold.ms} ms (${cold.stats.treeReads} tree reads), warm ${warm.ms} ms (${warm.stats.treeReads} reads, ${warm.stats.cacheHits} hits); bound 100 entries -> ${bounded.kind} (${bounded.bound})`);

  // Release lane 1: its token is revoked; the agent can no longer push.
  const rel = await h("release", { lane: lane(1) });
  log(`release lane 1: cleanup still owed: ${rel.cleanupOwed}`);
  write(l1.dir, "src/after-release.txt", "x\n");
  await must(["add", "-A"], { cwd: l1.dir });
  await must(["commit", "-q", "-m", "after release"], { cwd: l1.dir });
  const late = await git(["push", "origin", "HEAD:refs/heads/work"], { cwd: l1.dir, token: l1.ws.grant.token });
  log(`push with the released lane's token: exit ${late.code}: ${late.stderr.split("\n").pop()}`);
  out.releasedTokenRefused = late.code !== 0;

  const logEntries = await h("log", {});
  out.log = logEntries.map((e) => ({ seq: e.seq, type: e.event.type, outcome: e.event.outcome?.state ?? null }));
  log(`log: ${out.log.map((e) => `${e.seq}:${e.type}${e.outcome ? `(${e.outcome})` : ""}`).join(" ")}`);

  // Cleanup: every repo this run made, and the container.
  await h("reset", {});
  const repos = (await api("GET", `/repos?limit=200&search=${REPO}`)).result ?? [];
  for (const r of repos) {
    const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
    for (const t of toks) await api("DELETE", `/tokens/${t.id}`);
    const d = await api("DELETE", `/repos/${r.name}`);
    log(`deleted ${r.name}: ${d.success} (revoked ${toks.length} tokens first)`);
  }
  for (const d of [seed, check, l1.dir, l2.dir, l3.dir, wide.dir]) rmSync(d, { recursive: true, force: true });
  const file = join(HERE, "results", `live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`saved ${file}`);
}

main().catch((e) => {
  console.error(redact(e?.stack ?? e));
  process.exit(1);
});
