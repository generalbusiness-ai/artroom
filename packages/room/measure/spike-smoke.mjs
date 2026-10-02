#!/usr/bin/env node
// End-to-end smoke run against the deployed spike Room, artroom-spike-room
// (request 25ecefb8). It drives the Room's HTTPS API directly, as a client
// would: no client package is on main yet.
//
//   node packages/room/measure/spike-smoke.mjs
//
// Steps: found a room (public founding), read it back, check that the new
// repository's main is the Room's first commit (no files) and that no token
// is left on it, open a session; a first lane on the fresh repository
// (claim, workspace, push, propose, land) that must land; release it and
// check its token no longer works; a second lane (claim, workspace, token,
// push, propose, land) that must land; check main; two import drafts that
// must be refused with their reason (a grant for the public namespace, and
// one for a namespace the deployment does not bind); wait for the log to
// publish; run `artroom verify` against the published log.
//
// Then, on the same deployment, an import (request b6b51de7, revision 2):
// create a throwaway repository with one commit in gitseq-spike-import,
// sign an onboarding grant with the spike operator key, draft and found a
// room on it, land a lane, and verify its log. Then clean up: release the
// lanes, revoke every active token on the test repositories in both
// namespaces and delete them.
//
// Request b6b51de7 changed the first lane from a probe (it could not land:
// founding left the repository with no main) to a step that must pass, and
// removed the out-of-band seeding of main.
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
import { keyPairFromSeed, newKeyPair, randomToken, sign, unb64url } from "../src/crypto.ts";
import { iso } from "../src/ids.ts";
import { firstCommit } from "../../git/src/first-commit.ts";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
/** The import namespace: the spike's IMPORT_ARTIFACTS binding reaches it (request b6b51de7, revision 2). */
const IMPORT_NS = "gitseq-spike-import";
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
async function api(method, path, body, ns = NS) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${ns}${path}`, {
    method,
    headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-spike-smoke/1.0" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json().catch(() => ({}));
}
async function mint(repo, scope, ttl, ns = NS) {
  const r = await api("POST", "/tokens", { repo, scope, ttl }, ns);
  if (!r.result?.plaintext) throw new Error(`token for ${repo}: ${redact(JSON.stringify(r.errors ?? r))}`);
  secrets.add(r.result.plaintext);
  return r.result;
}
async function revoke(id, ns = NS) {
  return (await api("DELETE", `/tokens/${id}`, undefined, ns)).success === true;
}

/** Token metadata only, never the token. */
const tokenMeta = (toks) => toks.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !/plaintext|token|secret/i.test(k))));
async function activeTokens(repo, ns = NS) {
  return (await api("GET", `/repos/${repo}/tokens?state=active&per_page=100`, undefined, ns)).result ?? [];
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
async function canonicalRef(remote, repo, ref, ns = NS) {
  const t = await mint(repo, "read", 60, ns);
  try {
    const r = await git(["ls-remote", remote, ref], { token: t.plaintext });
    return r.code === 0 ? (r.stdout.split(/\s+/)[0] || null) : `error: ${r.stderr}`;
  } finally {
    await revoke(t.id, ns);
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

// ------------------------------------------------------------ the spike operator key

/** The spike operator's key pair, from the env file. The seed stays in this process; it is never printed. */
function operatorKey() {
  const file = process.env.ARTROOM_SPIKE_ENV ?? join(homedir(), ".config/generalbusiness/artroom-spike.env");
  const text = readFileSync(file, "utf8");
  const value = (k) => new RegExp(`^${k}=["']?([^"'\n]*)["']?$`, "m").exec(text)?.[1] ?? null;
  const seed = value("ARTROOM_OPERATOR_SEED");
  const raw = seed ? unb64url(seed) : null;
  if (!raw || raw.length !== 32) return null;
  secrets.add(seed);
  const kp = keyPairFromSeed(raw);
  return kp.key === value("OPERATOR_KEYS") ? kp : null;
}

// ------------------------------------------------------------ the run

let canonical = null;
let canonicalRemote = null;
const lanes = [];

async function main() {
  log(`smoke run ${RUN} against ${BASE}`);
  // SPIKE_PHASE=import runs only the import, for a rerun of that part.
  if (process.env.SPIKE_PHASE === "import") {
    const op = operatorKey();
    if (!op) throw new Error("no spike operator key");
    return importPhase(op);
  }
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

  // Request b6b51de7, gap 1: main is the Room's first commit, with no files, fixed by the genesis's time.
  const expectedFirst = (await firstCommit(Date.parse(genesis.createdAt))).commit;
  const mainAtFounding = await canonicalRef(canonicalRemote, canonical, "refs/heads/main");
  step("found: main is the Room's first commit (no files)", mainAtFounding === expectedFirst, { main: mainAtFounding, expected: expectedFirst });
  // Gap 2: no token is left on the new repository (the create's 24-hour token and the first commit's are revoked).
  // Read before this script mints its own read tokens, and after the one canonicalRef minted is revoked.
  const left = await activeTokens(canonical);
  step("found: no active token on the new repository", left.length === 0, { active: left.length, tokens: tokenMeta(left) });

  // 2. A read session (R-CRED-5).
  const s = await request({ kind: "session", ttlSeconds: 900 });
  if (s.body?.token) secrets.add(s.body.token);
  session = s.body.token;
  step("session", s.status === 200 && !!session, { status: s.status, member: s.body.member, expiresAt: s.body.expiresAt });
  const lg = await read("/log?limit=10");
  step("read: log after founding", lg.status === 200, { status: lg.status, head: lg.body.head, kinds: lg.body.acts?.map((e) => (e.entry.type === "system" ? e.entry.event.type : e.entry.act?.envelope?.kind)) });

  // 3. A first lane on the fresh repository: it must land (request b6b51de7, gap 1).
  const first = await lane(1, { "README.md": "# spike smoke\n", "docs/first.md": "first lane, fresh repository\n" });
  lanes.push({ ...first, room, admin });
  const mainAfterFirst = await canonicalRef(canonicalRemote, canonical, "refs/heads/main");
  out.firstLaneOnFreshRepo = { landed: first.op?.state === "landed", main: mainAfterFirst, integration: first.op?.integration ?? null };
  step("lane 1: main is lane 1's integration, on the first commit", !!first.op?.integration && mainAfterFirst === first.op.integration, { main: mainAfterFirst, integration: first.op?.integration });
  // Release the first lane (R-WS-3: its workspace token is revoked).
  if (first.lane) {
    const r = await act("release", { lane: first.lane }, { lease: 1, note: "spike smoke: lane 1 is done" });
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

  // 4. A second lane that must land.
  const second = await lane(2, { "docs/smoke.md": `spike smoke ${RUN}\n` });
  lanes.push({ ...second, room, admin });
  const main2 = await canonicalRef(canonicalRemote, canonical, "refs/heads/main");
  step("main is the landed integration", !!second.op?.integration && main2 === second.op.integration, { main: main2, integration: second.op?.integration, head: second.head });

  // Gap 3: imports are allowed only in the import namespace. A grant signed by the spike operator key
  // for the public namespace, or for a namespace the deployment does not bind, is refused at draft with
  // its reason; nothing is created, read or bound.
  const operator = operatorKey();
  if (operator) {
    for (const [label, repo, want] of [
      ["a grant for the public namespace", `${NS}/${"0".repeat(32)}`, /public founding namespace/],
      ["a grant for a namespace with no binding", `gitseq-spike-other/${"0".repeat(32)}`, new RegExp(`imports only repositories in the namespace ${IMPORT_NS}`)],
    ]) {
      const importer = newKeyPair();
      const g = { v: 1, repo, admin: importer.key, operator: operator.key, notAfter: iso(Date.now() + 10 * 60_000) };
      const r = await http("POST", "", { name: `deploy-spike-import-${Date.now().toString(36)}`, repo: { kind: "import", grant: { grant: g, sig: sign(operator.seed, "artroom-onboarding-v1", g) } }, admin: { handle: "@importer", key: importer.key }, recovery: newKeyPair().key });
      step(`import: ${label} is refused with its reason`, r.status === 403 && want.test(r.body.message ?? ""), { status: r.status, code: r.body.code, message: r.body.message });
    }
  } else step("import: the spike operator key", false, { error: "ARTROOM_OPERATOR_SEED is not in the env file, or does not match OPERATOR_KEYS" });

  // 5 and 6. The log publishes, and artroom verify passes.
  out.verify = await publishAndVerify("public", canonicalRemote, canonical, NS);
  out.log = await logSummary();

  // 7. An import on the same deployment (request b6b51de7, revision 2).
  if (operator) await importPhase(operator);
}

/** Wait for the current room's log to publish (R-LOG-8), then run artroom verify (lane L's CLI) against the remote. */
async function publishAndVerify(label, remote, repo, ns) {
  const head = (await read("/log?limit=1")).body.head;
  let published = -1;
  const end = Date.now() + 5 * 60_000;
  while (Date.now() < end) {
    const a = await read("/log?limit=1");
    published = a.body?.publishedThrough ?? -1;
    if (published >= head) break;
    await sleep(10_000);
  }
  const logRef = await canonicalRef(remote, repo, "refs/artroom/log", ns);
  step(`${label}: log published to refs/artroom/log`, published >= head && /^[0-9a-f]{40}$/.test(logRef ?? ""), { logHead: head, publishedThrough: published, ref: logRef });
  // A read token in git's environment, revoked after.
  const t = await mint(repo, "read", 300, ns);
  const v = await git(["node", join(ROOT, "packages/log/src/cli.ts"), "verify", remote, "--json"], { token: t.plaintext, env: { HOME: tmpdir() } });
  await revoke(t.id, ns);
  let report = null;
  try {
    report = JSON.parse(v.stdout);
  } catch {}
  step(`${label}: artroom verify`, v.code === 0 && report?.ok === true, {
    exit: v.code,
    ok: report?.ok,
    room: report?.room,
    head: report?.head,
    commits: report?.commits,
    publishedThrough: report?.publishedThrough,
    verifiedThrough: report?.verifiedThrough,
    decisionsReplayed: report?.decisionsReplayed,
    operator: report?.operator,
    failures: report?.failures,
    stderr: v.stderr || undefined,
  });
  return { exit: v.code, report: clean(report), stderr: v.stderr || undefined };
}

/** The current room's whole log, for the record (entries hold no token). */
async function logSummary() {
  const full = await read("/log?limit=200");
  return clean(
    full.body.acts?.map((e) => ({
      seq: e.seq,
      at: e.at,
      type: e.entry.type,
      kind: e.entry.type === "system" ? e.entry.event.type : e.entry.act?.envelope?.kind,
      rule: e.entry.type === "refusal" ? e.entry.receipt?.rule ?? e.entry.receipt?.refusal?.rule : undefined,
    })),
  );
}

let importRepo = null;

/**
 * Import a throwaway repository: create it with one commit in the import namespace (hugh's OAuth; the
 * creation token pushes the commit and is then revoked), have the spike operator grant it to a fresh
 * admin key, draft and found a room on it, land a lane, and verify the room's log, which carries the grant.
 */
async function importPhase(operator) {
  const out_ = (out.import = {});
  importRepo = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const c = await api("POST", "/repos", { name: importRepo }, IMPORT_NS);
  if (c.result?.token) secrets.add(c.result.token);
  step("import: throwaway repository created in gitseq-spike-import", c.success === true && !!c.result?.remote, { name: importRepo, remote: c.result?.remote, errors: c.errors });
  if (!c.success) throw new Error("the import repository could not be created");
  const remote = c.result.remote;
  const seed = mkdtempSync(join(tmpdir(), "deploy-spike-import-"));
  await must(["init", "-q"], { cwd: seed });
  write(seed, "README.md", "# imported\n\nA throwaway repository for the spike's live import.\n");
  await must(["add", "-A"], { cwd: seed });
  await must(["commit", "-q", "-m", "the imported repository's one commit"], { cwd: seed });
  const seeded = await must(["rev-parse", "HEAD"], { cwd: seed });
  const p = await git(["push", "-q", remote, "HEAD:refs/heads/main"], { cwd: seed, token: c.result.token });
  // Every token on it is revoked before the Room sees it: the creation token is spent.
  let revoked = 0;
  for (const t of await activeTokens(importRepo, IMPORT_NS)) if (await revoke(t.id, IMPORT_NS)) revoked++;
  const leftover = await activeTokens(importRepo, IMPORT_NS);
  step("import: one commit pushed; its creation token revoked", p.code === 0 && leftover.length === 0, { main: seeded, code: p.code, stderr: p.stderr || undefined, revoked, active: leftover.length });
  if (p.code !== 0) throw new Error("the import repository could not be seeded");

  // The grant, signed with the operator seed in this process, and the founding.
  admin = newKeyPair();
  const recovery = newKeyPair();
  const name = `deploy-spike-import-${Date.now().toString(36)}`;
  const g = { v: 1, repo: `${IMPORT_NS}/${importRepo}`, admin: admin.key, operator: operator.key, notAfter: iso(Date.now() + 15 * 60_000) };
  const d = await http("POST", "", { name, repo: { kind: "import", grant: { grant: g, sig: sign(operator.seed, "artroom-onboarding-v1", g) } }, admin: { handle: "@importer", key: admin.key }, recovery: recovery.key });
  if (d.body?.draft) secrets.add(d.body.draft);
  const genesis = d.body.genesis;
  step("import: draft", d.status === 200 && genesis?.repo === g.repo && genesis?.onboarding?.grant?.operator === operator.key, { status: d.status, repo: genesis?.repo, operator: genesis?.onboarding?.grant?.operator, error: d.body.code, message: d.body.message });
  if (d.status !== 200) throw new Error("import draft failed");
  const f = await http("POST", "/found", { genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft: d.body.draft });
  step("import: found", f.status === 200, { status: f.status, ms: f.ms, room: f.body.room, error: f.body.code, message: f.body.message });
  if (f.status !== 200) throw new Error("import found failed");
  room = f.body.room;
  Object.assign(out_, { repo: g.repo, room, name });
  const main0 = await canonicalRef(remote, importRepo, "refs/heads/main", IMPORT_NS);
  step("import: main is the imported commit; the Room wrote nothing", main0 === seeded, { main: main0, imported: seeded });
  const s = await request({ kind: "session", ttlSeconds: 900 });
  if (s.body?.token) secrets.add(s.body.token);
  session = s.body.token;
  step("import: session", s.status === 200 && !!session, { status: s.status, member: s.body.member });

  // A lane, landed on the imported main.
  const l = await lane(3, { "docs/imported.md": `landed by the spike smoke run ${RUN}\n` });
  lanes.push({ ...l, room, admin });
  const main1 = await canonicalRef(remote, importRepo, "refs/heads/main", IMPORT_NS);
  step("import: main is the landed integration", !!l.op?.integration && main1 === l.op.integration, { main: main1, integration: l.op?.integration, base: seeded });
  if (l.lane) {
    const r = await act("release", { lane: l.lane }, { lease: 1, note: "spike smoke: import lane done" });
    lanes[lanes.length - 1].released = r.status === 200;
  }
  out_.verify = await publishAndVerify("import", remote, importRepo, IMPORT_NS);
  step("import: verify reports the operator key", out_.verify.report?.operator === operator.key, { operator: out_.verify.report?.operator });
  out_.log = await logSummary();
}

async function cleanup() {
  // Release a lane still held (the landed lane may already be done; a refusal is fine).
  for (const l of lanes) {
    if (!l.lane || !l.room || l.released) continue;
    room = l.room;
    admin = l.admin;
    const r = await act("release", { lane: l.lane }, { lease: 1, note: "spike smoke cleanup" }).catch((e) => ({ status: 0, body: { message: e.message } }));
    out.cleanup[`release lane ${l.n}`] = { status: r.status, rule: r.body?.rule };
  }
  out.cleanup.repos = [];
  out.cleanup.reposLeft = [];
  // Every repository of this run, in both namespaces: each canonical one and its lane forks (`<canonical>--<lane>`).
  for (const [ns, base] of [[NS, canonical], [IMPORT_NS, importRepo]]) {
    if (!base) continue;
    const ours = async () => ((await api("GET", `/repos?limit=200&search=${base}`, undefined, ns)).result ?? []).filter((r) => r.name === base || r.name.startsWith(`${base}--`));
    for (const r of await ours()) {
      const toks = await activeTokens(r.name, ns);
      let revoked = 0;
      for (const t of toks) if (await revoke(t.id, ns)) revoked++;
      const d = await api("DELETE", `/repos/${r.name}`, undefined, ns);
      out.cleanup.repos.push({ namespace: ns, repo: r.name, activeTokens: toks.length, tokens: tokenMeta(toks), revoked, deleted: d.success === true });
      log(`cleanup ${ns}/${r.name}: ${toks.length} active tokens, ${revoked} revoked, deleted ${d.success === true}`);
    }
    out.cleanup.reposLeft.push(...(await ours()).map((r) => `${ns}/${r.name}`));
  }
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
