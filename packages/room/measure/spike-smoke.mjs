#!/usr/bin/env node
// End-to-end smoke run against the deployed spike Room, artroom-spike-room
// (request 25ecefb8). It drives the Room's HTTPS API directly, as a client
// would: no client package is on main yet.
//
//   node packages/room/measure/spike-smoke.mjs
//
// Steps: found a room (public founding), read it back, open a session; a
// first lane on the fresh, empty repository (claim, workspace, push,
// propose, land) to see how far it gets; seed main if the room cannot land
// on an empty repository; a second lane (claim, workspace, token, push,
// propose, land) that must land; check main; wait for the log to publish;
// run `artroom verify` against the published log. Then clean up: release
// the lanes, revoke every active token on the test repositories and delete
// them.
//
// It needs hugh's wrangler OAuth login (Artifacts REST: repository tokens,
// listing and deletion). It prints no token and saves a redacted result in
// measure/results/. The admin and recovery keys are made fresh and never
// saved.

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newKeyPair, randomToken, sign } from "../src/crypto.ts";
import { iso } from "../src/ids.ts";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const BASE = process.env.SPIKE_URL ?? "https://artroom-spike-room.inguz.workers.dev";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");

// ------------------------------------------------------------ redaction

const secrets = new Set();
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
function redact(s) {
  let t = String(s).replace(TOKEN_RE, "<token>");
  for (const x of secrets) if (x) t = t.split(x).join("<redacted>");
  return t;
}
const clean = (v) => JSON.parse(redact(JSON.stringify(v ?? null)));

const t0 = Date.now();
const RUN = new Date(t0).toISOString().replace(/[:.]/g, "-");
const out = { run: RUN, url: BASE, namespace: NS, steps: [], gaps: [], cleanup: {} };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const outer = step;
function step(name, ok, detail) {
  out.steps.push({ step: name, ok, atMs: Date.now() - t0, detail: clean(detail) });
  log(`${ok ? "ok  " : "FAIL"} ${name}`, detail ?? "");
}

// ------------------------------------------------------------ the Room's HTTPS API

async function http(method, path, body, bearer) {
  const s = Date.now();
  const r = await fetch(`${BASE}/v1/rooms${path}`, {
    method,
    headers: { "content-type": "application/json", "user-agent": "artroom-spike-smoke/1.0", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text: text.slice(0, 500) };
  }
  return { status: r.status, ms: Date.now() - s, body: json };
}

let room = null;
let admin = null;

function act(kind, target, body) {
  const envelope = { v: 1, room, actor: admin.key, kind, target, body, idempotencyKey: randomToken().slice(0, 24) };
  return http("POST", `/${room}/acts`, { envelope, sig: sign(admin.seed, "artroom-envelope-v1", envelope) });
}

function request(req) {
  const r = { v: 1, room, actor: admin.key, request: req, nonce: randomToken().slice(0, 32), notAfter: iso(Date.now() + 60_000) };
  return http("POST", `/${room}/requests`, { request: r, sig: sign(admin.seed, "artroom-request-v1", r) });
}

let session = null;
const read = (path) => http("GET", `/${room}${path}`, undefined, session);

/** Wait for an operation to reach one of `states`, by the Room's own wait (R-API-5), up to `totalMs`. */
async function waitOp(id, states, totalMs) {
  const end = Date.now() + totalMs;
  let last;
  while (Date.now() < end) {
    last = await read(`/ops/${id}?until=${states.join(",")}&timeoutMs=${Math.min(60_000, Math.max(1_000, end - Date.now()))}`);
    if (last.status === 200 && states.includes(last.body.state)) return last.body;
    if (last.status !== 200 && last.status !== 504) await sleep(2_000);
  }
  return last?.body ?? null;
}

// ------------------------------------------------------------ Artifacts REST (hugh's OAuth) and git

function oauth() {
  const m = /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"));
  if (!m) throw new Error("no wrangler OAuth token; run wrangler whoami");
  return m[1];
}
async function api(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, {
    method,
    headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-spike-smoke/1.0" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json().catch(() => ({}));
}
async function mint(repo, scope, ttl) {
  const r = await api("POST", "/tokens", { repo, scope, ttl });
  if (!r.result?.plaintext) throw new Error(`token for ${repo}: ${redact(JSON.stringify(r.errors ?? r))}`);
  secrets.add(r.result.plaintext);
  return r.result;
}
async function revoke(id) {
  return (await api("DELETE", `/tokens/${id}`)).success === true;
}

function git(args, { cwd, token, env = {} } = {}) {
  const e = {
    PATH: process.env.PATH,
    HOME: cwd ?? tmpdir(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/bin/false",
    GIT_AUTHOR_NAME: "spike smoke",
    GIT_AUTHOR_EMAIL: "smoke@artroom.invalid",
    GIT_COMMITTER_NAME: "spike smoke",
    GIT_COMMITTER_EMAIL: "smoke@artroom.invalid",
    ...(token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` } : {}),
    ...env,
  };
  return new Promise((resolve) =>
    execFile(args[0] === "node" ? "node" : "git", args[0] === "node" ? args.slice(1) : ["-c", "credential.helper=", "-c", "init.defaultBranch=main", ...args], { cwd, env: e, maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout.trim(), stderr: redact(stderr).trim().slice(-800) }),
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

/** Read one ref of the canonical repository with a 60-second read token, revoked after. */
async function canonicalRef(remote, repo, ref) {
  const t = await mint(repo, "read", 60);
  try {
    const r = await git(["ls-remote", remote, ref], { token: t.plaintext });
    return r.code === 0 ? (r.stdout.split(/\s+/)[0] || null) : `error: ${r.stderr}`;
  } finally {
    await revoke(t.id);
  }
}

// ------------------------------------------------------------ one lane, as an agent works it

async function lane(n, files, opts = {}) {
  const res = { n };
  // A probe lane's steps are recorded as they happened, but do not fail the run.
  const step = (name, ok, detail) => outer(name, ok || !!opts.mayFail, opts.mayFail ? { probe: true, passed: ok, ...detail } : detail);
  const c = await act("claim", null, { goal: `spike smoke lane ${n}`, scope: ["docs/**", "README.md"] });
  step(`lane ${n}: claim`, c.status === 200, { status: c.status, ms: c.ms, lane: c.body.lane, seq: c.body.seq, refused: c.body.rule });
  if (c.status !== 200) return res;
  res.lane = c.body.lane;

  const w = await request({ kind: "workspace", lane: res.lane, lease: 1 });
  step(`lane ${n}: workspace requested`, w.status === 200, { status: w.status, ms: w.ms, op: w.body.id, state: w.body.state, error: w.body.code });
  if (w.status !== 200) return res;
  const ws = w.body.state === "ready" ? w.body : await waitOp(w.body.id, ["ready", "failed"], 180_000);
  step(`lane ${n}: workspace ready`, ws?.state === "ready", { state: ws?.state, remote: ws?.detail?.remote, leaseGeneration: ws?.detail?.leaseGeneration, error: ws?.error });
  if (ws?.state !== "ready") return res;
  res.fork = ws.detail.remote;

  const g = await request({ kind: "workspace-token", lane: res.lane, lease: 1 });
  if (g.body?.token) secrets.add(g.body.token);
  step(`lane ${n}: workspace token`, g.status === 200 && !!g.body.token, { status: g.status, remote: g.body.remote, expiresAt: g.body.expiresAt, token: g.body.token ? "<token>" : undefined, refused: g.body.rule });
  if (g.status !== 200) return res;
  res.token = g.body.token;

  const dir = mkdtempSync(join(tmpdir(), `deploy-spike-lane${n}-`));
  const cl = await git(["clone", "-q", g.body.remote, dir], { token: g.body.token });
  step(`lane ${n}: clone fork`, cl.code === 0, { code: cl.code, stderr: cl.stderr || undefined });
  if (cl.code !== 0) return res;
  for (const [p, t] of Object.entries(files)) write(dir, p, t);
  await must(["add", "-A"], { cwd: dir });
  await must(["commit", "-q", "-m", `spike smoke lane ${n}`], { cwd: dir });
  res.head = await must(["rev-parse", "HEAD"], { cwd: dir });
  const p = await git(["push", "-q", "origin", "HEAD:refs/heads/work"], { cwd: dir, token: g.body.token });
  step(`lane ${n}: push to fork`, p.code === 0, { head: res.head, code: p.code, stderr: p.stderr || undefined });
  if (p.code !== 0) return res;

  const pr = await act("propose", { lane: res.lane }, { lease: 1, expectedGeneration: 0, head: res.head, summary: `spike smoke lane ${n}` });
  step(`lane ${n}: propose`, pr.status === 200, { status: pr.status, ms: pr.ms, generation: pr.body.generation, preview: pr.body.preview, changed: pr.body.changed, obligations: pr.body.obligations, refused: pr.body.rule, reason: pr.body.reason, error: pr.body.code, message: pr.body.message });
  if (pr.status !== 200) return res;
  if (pr.body.preview?.id) {
    const pv = await waitOp(pr.body.preview.id, ["clean", "conflict", "failed"], 120_000);
    step(`lane ${n}: preview`, pv?.state === "clean", { state: pv?.state, integration: pv?.integration, base: pv?.base, paths: pv?.paths, error: pv?.error });
  }

  const l = await act("land", { lane: res.lane, generation: 1 }, { lease: 1, head: res.head });
  const landOk = l.status === 200;
  step(`lane ${n}: land accepted`, landOk, { status: l.status, ms: l.ms, op: l.body.op?.id, state: l.body.op?.state, refused: l.body.rule, reason: l.body.reason, error: l.body.code, message: l.body.message });
  res.landResponse = { status: l.status, body: l.body };
  if (!landOk) return res;
  const op = await waitOp(l.body.op.id, ["landed", "failed", "aborted", "retryable", "unresolved"], 300_000);
  res.op = op;
  step(`lane ${n}: landed`, op?.state === "landed", { op: op?.id, state: op?.state, integration: op?.integration, reason: op?.reason, error: op?.error });
  return res;
}

// ------------------------------------------------------------ the run

let canonical = null;
let canonicalRemote = null;
const lanes = [];

async function main() {
  log(`smoke run ${RUN} against ${BASE}`);
  admin = newKeyPair();
  const recovery = newKeyPair();
  const name = `deploy-spike-smoke-${Date.now().toString(36)}`;

  // 1. Founding (R-GEN-10): draft, sign the genesis, found.
  const d = await http("POST", "", { name, repo: { kind: "new" }, admin: { handle: "@smoke", key: admin.key }, recovery: recovery.key });
  if (d.body?.draft) secrets.add(d.body.draft);
  step("found: draft", d.status === 200, { status: d.status, ms: d.ms, repo: d.body.genesis?.repo, roomKey: d.body.genesis?.roomKey, profile: d.body.genesis?.profile, error: d.body.code, message: d.body.message });
  if (d.status !== 200) throw new Error("draft failed");
  const genesis = d.body.genesis;
  canonical = genesis.repo.split("/")[1];
  out.repo = genesis.repo;
  const f = await http("POST", "/found", { genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft: d.body.draft });
  step("found: found", f.status === 200, { status: f.status, ms: f.ms, room: f.body.room, error: f.body.code, message: f.body.message });
  if (f.status !== 200) throw new Error("found failed");
  room = f.body.room;
  out.room = room;
  out.name = name;

  const again = await http("POST", "/found", { genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft: d.body.draft });
  step("found: the same found again returns the same room", again.status === 200 && again.body.room === room, { status: again.status, room: again.body.room });
  const ref = await http("GET", `/${encodeURIComponent(name)}`);
  step("found: GET /v1/rooms/:name (no credential)", ref.status === 200 && ref.body.room === room, { status: ref.status, body: ref.body });

  const info = await api("GET", `/repos/${canonical}`);
  canonicalRemote = info.result?.remote ?? null;
  step("found: repository created in gitseq-spike", !!canonicalRemote, { name: info.result?.name, remote: canonicalRemote, source: info.result?.source ?? null });

  // 2. A read session (R-CRED-5).
  const s = await request({ kind: "session", ttlSeconds: 900 });
  if (s.body?.token) secrets.add(s.body.token);
  session = s.body.token;
  step("session", s.status === 200 && !!session, { status: s.status, member: s.body.member, expiresAt: s.body.expiresAt });
  const lg = await read("/log?limit=10");
  step("read: log after founding", lg.status === 200, { status: lg.status, head: lg.body.head, kinds: lg.body.acts?.map((e) => (e.entry.type === "system" ? e.entry.event.type : e.entry.act?.envelope?.kind)) });

  // 3. A first lane on the fresh, empty repository.
  const first = await lane(1, { "README.md": "# spike smoke\n", "docs/first.md": "first lane, empty repository\n" }, { mayFail: true });
  lanes.push(first);
  const mainAfterFirst = await canonicalRef(canonicalRemote, canonical, "refs/heads/main");
  out.firstLaneOnEmptyRepo = { landed: first.op?.state === "landed", landResponse: clean(first.landResponse ?? null), main: mainAfterFirst };
  if (first.op?.state !== "landed") {
    out.gaps.push(
      `A room founded with { kind: "new" } has an empty repository, and its first lane cannot land: ${redact(JSON.stringify(first.landResponse?.body ?? first.op ?? "no land response")).slice(0, 400)}`,
    );
    // Release the first lane (R-WS-3: its workspace token is revoked).
    if (first.lane) {
      const r = await act("release", { lane: first.lane }, { lease: 1, note: "spike smoke: the empty-repository lane is abandoned" });
      first.released = r.status === 200;
      step("lane 1: release", r.status === 200, { status: r.status, refused: r.body.rule, reason: r.body.reason });
      // R-WS-3: release ends the lease's access. The token may take a moment to be revoked by the room's durable step.
      if (first.token && first.fork) {
        let code = 0;
        for (let i = 0; i < 10 && code === 0; i++) {
          code = (await git(["ls-remote", first.fork], { token: first.token })).code;
          if (code === 0) await sleep(2_000);
        }
        step("lane 1: the released lane's workspace token no longer reads the fork", code !== 0, { lsRemoteExit: code });
      }
    }
    // Seed main out of band, as an operator would, with a 60-second write token revoked after.
    if (!/^[0-9a-f]{40}$/.test(mainAfterFirst ?? "")) {
      const seed = mkdtempSync(join(tmpdir(), "deploy-spike-seed-"));
      await must(["init", "-q"], { cwd: seed });
      write(seed, "README.md", "# spike smoke\n\nSeeded out of band: a fresh public room cannot land its first commit.\n");
      await must(["add", "-A"], { cwd: seed });
      await must(["commit", "-q", "-m", "seed"], { cwd: seed });
      const t = await mint(canonical, "write", 60);
      const p = await git(["push", "-q", canonicalRemote, "HEAD:refs/heads/main"], { cwd: seed, token: t.plaintext });
      const revoked = await revoke(t.id);
      step("seed main out of band (write token, revoked after)", p.code === 0, { code: p.code, stderr: p.stderr || undefined, main: await must(["rev-parse", "HEAD"], { cwd: seed }), tokenRevoked: revoked });
    }
  }

  // 4. A second lane that must land.
  const second = await lane(2, { "docs/smoke.md": `spike smoke ${RUN}\n` });
  lanes.push(second);
  const main2 = await canonicalRef(canonicalRemote, canonical, "refs/heads/main");
  step("main is the landed integration", !!second.op?.integration && main2 === second.op.integration, { main: main2, integration: second.op?.integration, head: second.head });

  // 5. The log publishes (R-LOG-8): a minute after the oldest unpublished entry, by the alarm.
  const head = (await read("/log?limit=1")).body.head;
  let published = -1;
  const end = Date.now() + 5 * 60_000;
  while (Date.now() < end) {
    const a = await read("/log?limit=1");
    published = a.body?.publishedThrough ?? -1;
    if (published >= head) break;
    await sleep(10_000);
  }
  const logRef = await canonicalRef(canonicalRemote, canonical, "refs/artroom/log");
  step("log published to refs/artroom/log", published >= head && /^[0-9a-f]{40}$/.test(logRef ?? ""), { logHead: head, publishedThrough: published, ref: logRef });

  // 6. artroom verify (lane L's CLI) against the canonical repository, with a read token in git's environment.
  const t = await mint(canonical, "read", 300);
  const v = await git(["node", join(ROOT, "packages/log/src/cli.ts"), "verify", canonicalRemote, "--json"], {
    token: t.plaintext,
    env: { HOME: tmpdir() },
  });
  await revoke(t.id);
  let report = null;
  try {
    report = JSON.parse(v.stdout);
  } catch {}
  out.verify = { exit: v.code, report: clean(report), stderr: v.stderr || undefined };
  step("artroom verify", v.code === 0 && report?.ok === true, {
    exit: v.code,
    ok: report?.ok,
    room: report?.room,
    head: report?.head,
    commits: report?.commits,
    publishedThrough: report?.publishedThrough,
    verifiedThrough: report?.verifiedThrough,
    decisionsReplayed: report?.decisionsReplayed,
    failures: report?.failures,
    stderr: v.stderr || undefined,
  });

  // The whole log, for the record (entries hold no token).
  const full = await read("/log?limit=200");
  out.log = clean(
    full.body.acts?.map((e) => ({
      seq: e.seq,
      at: e.at,
      type: e.entry.type,
      kind: e.entry.type === "system" ? e.entry.event.type : e.entry.act?.envelope?.kind,
      rule: e.entry.type === "refusal" ? e.entry.receipt?.rule ?? e.entry.receipt?.refusal?.rule : undefined,
    })),
  );
}

async function cleanup() {
  // Release a lane still held (the landed lane may already be done; a refusal is fine).
  for (const l of lanes) {
    if (!l.lane || !room || l.released) continue;
    const r = await act("release", { lane: l.lane }, { lease: 1, note: "spike smoke cleanup" }).catch((e) => ({ status: 0, body: { message: e.message } }));
    out.cleanup[`release lane ${l.n}`] = { status: r.status, rule: r.body?.rule };
  }
  if (!canonical) return;
  // Every repository of this run: the canonical one and its lane forks (`<canonical>--<lane>`).
  const repos = ((await api("GET", `/repos?limit=200&search=${canonical}`)).result ?? []).filter((r) => r.name === canonical || r.name.startsWith(`${canonical}--`));
  out.cleanup.repos = [];
  for (const r of repos) {
    const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
    let revoked = 0;
    for (const t of toks) if (await revoke(t.id)) revoked++;
    const d = await api("DELETE", `/repos/${r.name}`);
    // Token metadata only (never the token): which tokens were still live at cleanup, and from when.
    const meta = toks.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !/plaintext|token|secret/i.test(k))));
    out.cleanup.repos.push({ repo: r.name, activeTokens: toks.length, tokens: meta, revoked, deleted: d.success === true });
    log(`cleanup ${r.name}: ${toks.length} active tokens, ${revoked} revoked, deleted ${d.success === true}`);
  }
  const left = ((await api("GET", `/repos?limit=200&search=${canonical}`)).result ?? []).filter((r) => r.name === canonical || r.name.startsWith(`${canonical}--`));
  out.cleanup.reposLeft = left.map((r) => r.name);
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  out.error = redact(e.stack ?? e.message);
  log("error:", e.message);
} finally {
  try {
    await cleanup();
  } catch (e) {
    out.cleanup.error = redact(e.message);
  }
  out.ok = !failed && out.steps.every((s) => s.ok);
  out.ms = Date.now() - t0;
  const dir = join(HERE, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `spike-smoke-${RUN}.json`);
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`ok ${out.ok}; result ${file}`);
  process.exit(out.ok ? 0 : 1);
}
