#!/usr/bin/env node
// Does a jj `change-id` commit header survive real Artifacts? Through the
// Worker `artroom-lb-git` (measure/harness/, deployed only for a run), as in
// live.mjs:
//
//   LB_KEY_FILE=~/.artroom-lb-key node measure/jj-change-id.mjs
//
// Two lanes each clone their Artifacts fork with jj, describe one change and
// `jj git push` it. Both are proposed (pinned at refs/artroom/heads/<lane>/1)
// and landed: lane 1 fast-forwards main, lane 2 lands by a merge commit. The
// script compares each raw commit object, as jj wrote it, with the fork, the
// pinned ref and main's history read back from Artifacts. It revokes every
// token, deletes its repos, and saves a redacted result. Prints no token.

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
const out = { script: "jj-change-id", lanes: {}, steps: [] };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const lane = (n) => `act_${1000 + n}_${(0xabcdef00 + n).toString(16)}`;

const RUN = Date.now().toString(36);
const ROOM = `lb-jj-${RUN}`;
const REPO = `artroom-lb-jj-${RUN}`;
const temps = [];
const temp = (p) => {
  const d = mkdtempSync(join(tmpdir(), p));
  temps.push(d);
  return d;
};

async function h(route, body) {
  const r = await fetch(`${URL_}/h/${route}`, { method: "POST", headers: { "x-lb-key": KEY, "content-type": "application/json", "user-agent": "artroom-lb-live/1.0" }, body: JSON.stringify({ room: ROOM, ...body }) });
  const j = await r.json();
  out.steps.push({ route, status: r.status, result: JSON.parse(redact(JSON.stringify({ ...j, grant: j.grant ? { ...j.grant, token: "<token>" } : undefined, seedToken: undefined }))) });
  if (r.status !== 200) throw new Error(`${route}: ${r.status} ${redact(JSON.stringify(j))}`);
  return j;
}

/** Retry a step the publisher container refused while starting. Proposing is idempotent: a pinned head pins again as `already`. */
async function again(fn) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 5 || !/container connection is temporarily unavailable/.test(String(e?.message))) throw e;
      log(`container starting; retry ${i}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function oauth() {
  return /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))[1];
}
async function api(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, {
    method,
    headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-lb-live/1.0" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json().catch(() => ({}));
}

/** Runs git or jj. A token goes in an environment header, never on the command line. */
function run(cmd, args, { cwd, token, jjConfig } = {}) {
  const env = {
    PATH: process.env.PATH, HOME: cwd ?? tmpdir(), GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/bin/false",
    GIT_AUTHOR_NAME: "agent", GIT_AUTHOR_EMAIL: "agent@invalid", GIT_COMMITTER_NAME: "agent", GIT_COMMITTER_EMAIL: "agent@invalid",
    ...(jjConfig ? { JJ_CONFIG: jjConfig } : {}),
    ...(token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` } : {}),
  };
  const full = cmd === "git" ? ["-c", "credential.helper=", "-c", "init.defaultBranch=main", ...args] : args;
  return new Promise((resolve) =>
    execFile(cmd, full, { cwd, env, maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr: redact(stderr).trim().slice(-600) }),
    ),
  );
}
async function must(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args[0]}: ${r.stderr}`);
  return r.stdout;
}
const raw = (gitDir, rev, opts) => must("git", ["--git-dir", gitDir, "cat-file", "commit", rev], opts);
const changeIdOf = (text) => /\nchange-id ([k-z]{32})\n/.exec(text)?.[1] ?? null;

/** The lane's agent: clone the fork with jj, describe one change, `jj git push` it. */
async function jjLane(n, file) {
  const ws = await h("workspace", { lane: lane(n), lease: 1, leaseMs: 15 * 60_000 });
  const home = temp(`lb-jj${n}-`);
  const jjConfig = join(home, "jj.toml");
  writeFileSync(jjConfig, '[user]\nname = "agent"\nemail = "agent@invalid"\n');
  const dir = join(home, "lane");
  const opts = { cwd: dir, token: ws.grant.token, jjConfig };
  await must("jj", ["git", "clone", "--colocate", ws.grant.remote, dir], { ...opts, cwd: home });
  writeFileSync(join(dir, file), `lane ${n}, written by jj\n`);
  await must("jj", ["describe", "-m", `lane ${n}`], opts);
  await must("jj", ["bookmark", "create", "work", "-r", "@"], opts);
  await must("jj", ["git", "push", "--bookmark", "work"], opts);
  const head = (await must("jj", ["log", "-r", "work", "--no-graph", "-T", "commit_id"], opts)).trim();
  const changeId = (await must("jj", ["log", "-r", "work", "--no-graph", "-T", "change_id"], opts)).trim();
  const written = await raw(join(dir, ".git"), head);
  // Read the fork back into a fresh repo.
  const back = join(home, "fork-read.git");
  await must("git", ["init", "-q", "--bare", back]);
  await must("git", ["--git-dir", back, "fetch", "-q", ws.grant.remote, "+refs/heads/work:refs/heads/work"], { token: ws.grant.token });
  const fork = await raw(back, "refs/heads/work");
  const r = { head, changeId, headerWritten: changeIdOf(written) === changeId, fork: fork === written };
  out.lanes[n] = r;
  log(`lane ${n}: jj wrote ${head.slice(0, 8)} with change-id ${changeId}; header in commit ${r.headerWritten}; fork byte-identical ${r.fork}`);
  return { head, written };
}

/** Fetch refs from the canonical repo with a short read token, revoked after. */
async function readCanonical(remote, refspecs) {
  const dir = temp("lb-jjcheck-");
  await must("git", ["init", "-q", "--bare", dir]);
  const rt = await api("POST", "/tokens", { repo: REPO, scope: "read", ttl: 60 });
  try {
    await must("git", ["--git-dir", dir, "fetch", "-q", remote, ...refspecs], { token: rt.result.plaintext });
  } finally {
    await api("DELETE", `/tokens/${rt.result.id}`);
  }
  return dir;
}

async function main() {
  log(`room ${ROOM}, repo ${REPO}; ${(await run("jj", ["--version"])).stdout.trim()}`);
  const created = await h("create", { repo: REPO });
  const seed = temp("lb-jjseed-");
  await must("git", ["init", "-q"], { cwd: seed });
  writeFileSync(join(seed, "README.md"), "jj change-id\n");
  await must("git", ["add", "-A"], { cwd: seed });
  await must("git", ["commit", "-q", "-m", "seed"], { cwd: seed });
  await must("git", ["push", "-q", created.remote, "HEAD:refs/heads/main"], { cwd: seed, token: created.seedToken });
  const init = await h("init", { repo: REPO });
  log(`init: main ${init.main.slice(0, 8)}, seed tokens revoked ${init.revoked}`);

  const l1 = await jjLane(1, "one.txt");
  const l2 = await jjLane(2, "two.txt");
  for (const n of [1, 2]) {
    const p = await again(() => h("propose", { lane: lane(n), generation: 1, head: n === 1 ? l1.head : l2.head }));
    log(`lane ${n}: propose ${p.pinned.map((x) => x.kind).join(",")}`);
  }
  const pinned = await readCanonical(created.remote, [`+refs/artroom/heads/*:refs/artroom/heads/*`]);
  for (const [n, l] of [[1, l1], [2, l2]]) {
    out.lanes[n].pinned = (await raw(pinned, `refs/artroom/heads/${lane(n)}/1`)) === l.written;
    log(`lane ${n}: pinned head byte-identical ${out.lanes[n].pinned}`);
  }

  // Lane 1 fast-forwards main; lane 2, based on the seed, lands by a merge commit.
  for (const n of [1, 2]) {
    const a = await h("land", { lane: lane(n) });
    log(`lane ${n} land: ${a.op.state}; integration ${a.op.integration?.slice(0, 8)}`);
    out.lanes[n].landed = a.op.state;
  }
  const after = await readCanonical(created.remote, ["+refs/heads/main:refs/heads/main"]);
  const main = (await must("git", ["--git-dir", after, "rev-parse", "main"])).trim();
  const parents = (await must("git", ["--git-dir", after, "rev-list", "--parents", "-n", "1", "main"])).trim().split(" ").slice(1);
  out.main = { sha: main, parents, mergeCarriesChangeId: changeIdOf(await raw(after, "main")) !== null };
  out.lanes[1].mainFastForwardParent = parents[0] === l1.head;
  out.lanes[2].mainMergeParent = parents[1] === l2.head;
  out.lanes[1].inMain = (await raw(after, "main^1")) === l1.written;
  out.lanes[2].inMain = (await raw(after, "main^2")) === l2.written;
  log(`main ${main.slice(0, 8)} parents ${parents.map((p) => p.slice(0, 8)).join(" ")}`);
  log(`main^1 is lane 1 (fast-forwarded): ${out.lanes[1].mainFastForwardParent}, byte-identical ${out.lanes[1].inMain}`);
  log(`main^2 is lane 2 (merged): ${out.lanes[2].mainMergeParent}, byte-identical ${out.lanes[2].inMain}`);
  out.survives = [1, 2].every((n) => {
    const l = out.lanes[n];
    return l.headerWritten && l.fork && l.pinned && l.inMain && l.landed === "landed";
  }) && out.lanes[1].mainFastForwardParent && out.lanes[2].mainMergeParent;
  log(`change-id header survives fork, pinning and landing: ${out.survives}`);
}

async function cleanup() {
  for (const n of [1, 2]) await h("release", { lane: lane(n) }).catch(() => undefined);
  await h("reset", {}).catch(() => undefined);
  const repos = (await api("GET", `/repos?limit=200&search=${REPO}`)).result ?? [];
  out.cleanup = [];
  for (const r of repos) {
    const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
    for (const t of toks) await api("DELETE", `/tokens/${t.id}`);
    const d = await api("DELETE", `/repos/${r.name}`);
    out.cleanup.push({ repo: r.name, tokensRevoked: toks.length, deleted: d.success === true });
    log(`deleted ${r.name}: ${d.success} (revoked ${toks.length} tokens first)`);
  }
  for (const d of temps) rmSync(d, { recursive: true, force: true });
  const file = join(HERE, "results", `jj-change-id-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`saved ${file}`);
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  out.error = redact(e?.message ?? e);
  console.error(redact(e?.stack ?? e));
}
await cleanup();
process.exit(failed || !out.survives ? 1 : 0);
