#!/usr/bin/env node
// Does revoking, or letting expire, an Artifacts repo token stop a git push
// that is already in flight? (Plan section 8, acceptance case "token
// revocation or expiry during an in-flight push"; protocol R-PUB-2, R-PUB-6.)
//
// git pushes through a local proxy that we control. The proxy adds the token
// (git never sees it), and can hold a request before forwarding it and
// throttle its body, so a push can be made to authenticate and then take a
// long time. Each case pushes a new branch carrying a 2 MiB random blob, then
// reads the remote's refs with a fresh read token to see whether the ref
// update was accepted.
//
//   node measure/token-inflight.mjs            # all cases
//   node measure/token-inflight.mjs A C        # some cases
//
// Needs: git, Node 22+, and `npx wrangler whoami` run first (OAuth token).
// Prints and saves no token: every string is redacted. Revokes every token it
// mints and deletes its repo at the end (unless KEEP_REPO=1).

import http from "node:http";
import https from "node:https";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const HOST = `${ACCT}.artifacts.cloudflare.net`;
const UA = "artroom-lb-measure/1.0";
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s) => String(s).replace(TOKEN_RE, "<token>");
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ Cloudflare REST
function oauth() {
  const toml = readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8");
  const m = /^oauth_token = "([^"]+)"/m.exec(toml);
  if (!m) throw new Error("no oauth token: run npx wrangler whoami");
  return m[1];
}
async function api(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, {
    method,
    headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": UA },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json().catch(() => ({}));
  return j;
}
async function createRepo(name) {
  for (let i = 1; i <= 6; i++) {
    const r = await api("POST", "/repos", { name, default_branch: "main" });
    if (r.success) return r.result;
    log(`create attempt ${i}:`, r.errors);
    await sleep(2000 * i);
  }
  throw new Error("create failed");
}
const minted = [];
async function mint(repo, scope, ttl) {
  const r = await api("POST", "/tokens", { repo, scope, ttl });
  if (!r.success) throw new Error(`mint failed: ${JSON.stringify(r.errors)}`);
  minted.push(r.result.id);
  return { id: r.result.id, plaintext: r.result.plaintext, at: Date.now(), ttl };
}
async function revoke(id) {
  const r = await api("DELETE", `/tokens/${id}`);
  return r.success === true;
}
async function revokeAll(repo) {
  const r = await api("GET", `/repos/${repo}/tokens?state=active&per_page=100`);
  let n = 0;
  for (const t of r.result ?? []) if (await revoke(t.id)) n++;
  return n;
}

// ------------------------------------------------------------ git
function git(args, { cwd, token, timeoutMs = 600_000 } = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: cwd ?? tmpdir(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/bin/false",
    GIT_AUTHOR_NAME: "measure",
    GIT_AUTHOR_EMAIL: "m@invalid",
    GIT_COMMITTER_NAME: "measure",
    GIT_COMMITTER_EMAIL: "m@invalid",
    ...(token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` } : {}),
  };
  return new Promise((resolve) => {
    const start = Date.now();
    execFile("git", ["-c", "credential.helper=", ...args], { cwd, env, timeout: timeoutMs, maxBuffer: 1 << 26 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: redact(stdout), stderr: redact(stderr).slice(-1500), ms: Date.now() - start });
    });
  });
}
async function refsOf(remote, repo) {
  const t = await mint(repo, "read", 60);
  const r = await git(["ls-remote", remote], { token: t.plaintext });
  await revoke(t.id);
  const refs = {};
  for (const line of r.stdout.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split("\t");
    refs[ref] = sha;
  }
  return refs;
}

// ------------------------------------------------------------ the proxy
// One proxy per case. `token` is read at each request. `holdPostUntil(ms)` holds
// the big POST (not git's 4-byte auth probe) before forwarding anything;
// `rate` throttles its body in bytes per second.
function startProxy(state, events) {
  const server = http.createServer(async (req, res) => {
    const id = events.length;
    const ev = { id, method: req.method, path: req.url.replace(/\?.*$/, ""), service: /service=([a-z-]+)/.exec(req.url)?.[1] ?? null, start: Date.now() };
    events.push(ev);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.expect;
    delete headers.connection;
    delete headers.authorization;
    headers.authorization = `Bearer ${state.token}`;
    // Read the first chunk to tell the probe (a 4-byte body) from the real push.
    const it = req[Symbol.asyncIterator]();
    let first = null;
    if (req.method === "POST") {
      const n = await it.next();
      first = n.done ? Buffer.alloc(0) : n.value;
      ev.firstChunk = first.length;
      const big = first.length > 4;
      ev.kind = big ? "push-body" : "probe";
      if (big && state.holdUntil) {
        const wait = state.holdUntil() - Date.now();
        if (wait > 0) {
          log(`proxy: holding the push POST for ${(wait / 1000).toFixed(1)}s`);
          await sleep(wait);
        }
      }
      if (big && state.beforePost) await state.beforePost();
    }
    ev.forwarded = Date.now();
    const up = https.request({ host: HOST, path: req.url, method: req.method, headers }, (ur) => {
      ev.status = ur.statusCode;
      ev.responseAt = Date.now();
      res.writeHead(ur.statusCode, ur.headers);
      ur.on("data", (d) => {
        ev.responseBytes = (ev.responseBytes ?? 0) + d.length;
      });
      ur.pipe(res);
      ur.on("end", () => (ev.end = Date.now()));
    });
    up.on("error", (e) => {
      ev.error = String(e);
      res.destroy();
    });
    if (req.method !== "POST") return up.end();
    const rate = ev.kind === "push-body" ? state.rate : 0;
    let sent = 0;
    const write = async (buf) => {
      for (let i = 0; i < buf.length; i += 8192) {
        const slice = buf.subarray(i, i + 8192);
        if (!up.write(slice)) await new Promise((r) => up.once("drain", r));
        sent += slice.length;
        if (rate) await sleep((slice.length / rate) * 1000);
      }
    };
    await write(first);
    for (let n = await it.next(); !n.done; n = await it.next()) await write(n.value);
    ev.bodyBytes = sent;
    ev.bodyDone = Date.now();
    up.end();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

// ------------------------------------------------------------ cases
const CASES = {
  A0: { what: "control: token revoked after discovery, before the push POST starts", ttl: 600, rate: 0, holdMs: 8000, revokeAt: "hold" },
  A: { what: "token revoked while the push body is uploading (POST authenticated ~10 s earlier)", ttl: 600, rate: 40_000, revokeAt: "mid-body", revokeAfterMs: 10_000 },
  B: { what: "token expires while the push body is uploading (POST started ~5 s after minting; 60 s token)", ttl: 60, rate: 25_000, revokeAt: null },
  C: { what: "POST authenticates ~5 s before the 60 s token expires and ends ~30 s after", ttl: 60, rate: 70_000, holdUntilAge: 55_000, revokeAt: null },
  D: { what: "control: the same push with a live token and the same throttle", ttl: 600, rate: 70_000, revokeAt: null },
};

async function runCase(name, c, repo, remote, work) {
  log(`case ${name}: ${c.what}`);
  const branch = `refs/heads/case-${name.toLowerCase()}-${Date.now().toString(36)}`;
  writeFileSync(join(work, `blob-${name}.bin`), randomBytes(2 << 20));
  await git(["add", "-A"], { cwd: work });
  await git(["commit", "-q", "-m", `case ${name}`], { cwd: work });
  const head = (await git(["rev-parse", "HEAD"], { cwd: work })).stdout.trim();
  const tok = await mint(repo, "write", c.ttl);
  const expiresAt = tok.at + c.ttl * 1000;
  const events = [];
  const state = { token: tok.plaintext, rate: c.rate, holdUntil: null, beforePost: null };
  let revokedAt = null;
  if (c.revokeAt === "hold") {
    state.holdUntil = () => Date.now() + c.holdMs;
    state.beforePost = async () => {
      revokedAt = Date.now();
      log(`revoke during hold: ${await revoke(tok.id)}`);
      await sleep(2000); // let revocation settle before the POST goes out
    };
  }
  if (c.holdUntilAge) state.holdUntil = () => tok.at + c.holdUntilAge;
  const { server, port } = await startProxy(state, events);
  const url = `http://127.0.0.1:${port}/git/${NS}/${repo}.git`;
  let timer = null;
  if (c.revokeAt === "mid-body") {
    const poll = setInterval(() => {
      const post = events.find((e) => e.kind === "push-body" && e.forwarded);
      if (post && !timer) {
        timer = setTimeout(async () => {
          revokedAt = Date.now();
          log(`revoke mid-body: ${await revoke(tok.id)}`);
        }, c.revokeAfterMs);
        clearInterval(poll);
      }
    }, 100);
  }
  const push = await git(["push", "--porcelain", url, `HEAD:${branch}`], { cwd: work });
  server.close();
  const refs = await refsOf(remote, repo);
  const accepted = refs[branch] === head;
  const post = events.find((e) => e.kind === "push-body");
  const rel = (t) => (t == null ? null : +((t - tok.at) / 1000).toFixed(1));
  const result = {
    case: name,
    what: c.what,
    tokenTtlS: c.ttl,
    pushExit: push.code,
    pushStdout: push.stdout.trim(),
    pushStderr: push.stderr.trim(),
    refAccepted: accepted,
    timesSinceMintS: {
      expiresAt: rel(expiresAt),
      revokedAt: rel(revokedAt),
      postForwarded: rel(post?.forwarded),
      postBodyDone: rel(post?.bodyDone),
      postResponse: rel(post?.responseAt),
      pushDone: rel(Date.now()),
    },
    postStatus: post?.status ?? null,
    postBodyBytes: post?.bodyBytes ?? null,
    requests: events.map((e) => ({ method: e.method, service: e.service, kind: e.kind ?? null, status: e.status ?? null, at: rel(e.start), error: e.error ?? null })),
  };
  log(`case ${name}: ref ${accepted ? "ACCEPTED" : "not accepted"}; push exit ${push.code}; POST ${post?.status}`, result.timesSinceMintS);
  await revoke(tok.id).catch(() => false);
  return result;
}

async function main() {
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(CASES);
  const repo = `artroom-lb-tok-${Date.now().toString(36)}`;
  log(`repo ${repo}`);
  const made = await createRepo(repo);
  const remote = made.remote;
  const work = mkdtempSync(join(tmpdir(), "lb-measure-"));
  await git(["init", "-q", "-b", "main"], { cwd: work });
  writeFileSync(join(work, "README.md"), "measurement repo\n");
  await git(["add", "-A"], { cwd: work });
  await git(["commit", "-q", "-m", "seed"], { cwd: work });
  const seed = await git(["push", "-q", remote, "HEAD:refs/heads/main"], { cwd: work, token: made.token });
  if (seed.code !== 0) throw new Error(`seed push failed: ${seed.stderr}`);
  log(`seed tokens revoked: ${await revokeAll(repo)}`);
  const results = [];
  try {
    for (const n of names) results.push(await runCase(n, CASES[n], repo, remote, work));
  } finally {
    for (const id of minted) await revoke(id).catch(() => false);
    log(`tokens still active on the repo after cleanup: ${(await api("GET", `/repos/${repo}/tokens?state=active&per_page=100`)).result?.length ?? "?"}`);
    if (!process.env.KEEP_REPO) log(`repo deleted: ${(await api("DELETE", `/repos/${repo}`)).success}`);
    rmSync(work, { recursive: true, force: true });
  }
  const out = join(HERE, "results", `token-inflight-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, redact(JSON.stringify({ repo, git: (await git(["--version"])).stdout.trim(), results }, null, 2)) + "\n");
  log(`saved ${out}`);
}

main().catch((e) => {
  console.error(redact(e?.stack ?? e));
  process.exit(1);
});
