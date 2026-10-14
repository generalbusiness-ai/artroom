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
// namespaces and delete them. The run succeeds only if every step and every
// cleanup duty succeeded (review 1b868265): an unconfirmed revocation or
// deletion, an unreadable or incomplete inventory, or a repository left over
// fails it, and the result lists what is unresolved by repository name and
// token ID.
//
// Then review and check (request 9f81f372): import a repository whose first
// commit holds a policy that requires one check (`tests`, by role:checker)
// and one review from a maintainer, invite a reviewer and the spike checker
// service's key (role checker), and work one lane: propose; the Room
// dispatches the check job to artroom-spike-checkers over CHECKER_TESTS; the
// checker's signed check is admitted; landing is refused while the review is
// open; the reviewer approves; the lane lands; attention shows each step to
// each member; and `artroom verify` replays the log. SPIKE_PHASE=checks runs
// only this phase; SPIKE_PHASE=import only the import.
//
// Rows written (request 8bd623cc, measure/rows.mjs): with
// ARTROOM_CF_ANALYTICS_TOKEN set, the run ends by asking Cloudflare's billing
// datasets for the Durable Object rows the spike Room Worker wrote from the
// run's start to two minutes after its cleanup, by namespace and object, and
// judges them against the budget. A failed or incomplete gate fails the run.
// Without the token the gate is skipped and the result says so;
// ARTROOM_ROW_GATE=1 demands it, and then a missing token fails the run
// before it starts. SPIKE_PHASE=rows runs each act once, in a room of its own,
// with a billing window for each, and writes the table of rows written and
// read per act (measure/README.md).
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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { b64url, digestBytes, newKeyPair, randomBytes, randomToken, sign } from "../src/crypto.ts";
import { iso } from "../src/ids.ts";
import { firstCommit } from "../../git/src/first-commit.ts";
import { cleanupRun, incarnationOf, isRepoRecord, isTokenRecord, readListing, REPO_PAGE, smokeOk } from "./cleanup.mjs";
import { attentionFor, CHECK, CHECKED_PATHS, checkedChange, checkProject, checksIn, checksPolicy, importDraft, loadSpikeKeys, manualCheckProject, MANUAL_PATHS, obligationOf, REVIEW_RULE, seedImportRepo } from "./checks.mjs";
import { gateOk, gateOptions, querySamples, rowGate, safeMessage, SETTLE_MS, SMOKE_BUDGET, SPIKE_WORKER, windowEndAfterSettle, windowTable, windowTableMarkdown } from "./rows.mjs";

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
const out = { run: RUN, url: BASE, namespace: NS, importNamespace: IMPORT_NS, steps: [], gaps: [], cleanup: null };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** A signed act by `kp` in the current room. */
function actAs(kp, kind, target, body) {
  const envelope = { v: 1, room, actor: kp.key, kind, target, body, idempotencyKey: randomToken().slice(0, 24) };
  return http("POST", `/${room}/acts`, { envelope, sig: sign(kp.seed, "artroom-envelope-v1", envelope) });
}
const act = (kind, target, body) => actAs(admin, kind, target, body);

/** A signed request by `kp` in the current room. */
function requestAs(kp, req) {
  const r = { v: 1, room, actor: kp.key, request: req, nonce: randomToken().slice(0, 32), notAfter: iso(Date.now() + 60_000) };
  return http("POST", `/${room}/requests`, { request: r, sig: sign(kp.seed, "artroom-request-v1", r) });
}
const request = (req) => requestAs(admin, req);

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
  // Not reached: the last answer, with its HTTP status, so a failed step says why.
  return last ? { ...(last.body ?? {}), httpStatus: last.status } : null;
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
/** Tokens this run minted and has not seen revoked, by namespace, then by ID (not a secret), with their repository. */
const minted = { [NS]: new Map(), [IMPORT_NS]: new Map() };
async function mint(repo, scope, ttl, ns = NS) {
  const r = await api("POST", "/tokens", { repo, scope, ttl }, ns);
  if (!r.result?.plaintext) throw new Error(`token for ${repo}: ${redact(JSON.stringify(r.errors ?? r))}`);
  secrets.add(r.result.plaintext);
  minted[ns].set(r.result.id, repo);
  return r.result;
}
async function revoke(id, ns = NS) {
  const ok = (await api("DELETE", `/tokens/${id}`, undefined, ns)).success === true;
  if (ok) minted[ns].delete(id);
  return ok;
}

/** Token metadata only, never the token. */
const tokenMeta = (toks) => toks.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !/plaintext|token|secret/i.test(k))));
/**
 * A repository's active tokens, or null when the listing proves nothing (refused, partial or malformed: the
 * deploy lane's `readListing`). A step that reads it reports an unknown listing as a failure, never as none.
 */
async function activeTokens(repo, ns = NS) {
  const { outcome, items } = readListing(await api("GET", `/repos/${repo}/tokens?state=active&per_page=100`, undefined, ns), 100, isTokenRecord);
  return outcome === "done" ? items : null;
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

async function lane(n, files) {
  const res = await openLane(n, files);
  return res.proposal ? landLane(res) : res;
}

/** Claim, open the workspace, push `files` to the fork, and propose; wait for the preview. */
async function openLane(n, files, scope = ["docs/**", "README.md"]) {
  const res = await claimLane(n, scope);
  if (res.lane && (await pushLane(res, files))) await proposeLane(res);
  return res;
}

/** Claim a lane on `scope`. */
async function claimLane(n, scope) {
  const res = { n };
  const c = await act("claim", null, { goal: `spike smoke lane ${n}`, scope });
  step(`lane ${n}: claim`, c.status === 200, { status: c.status, ms: c.ms, lane: c.body.lane, seq: c.body.seq, refused: c.body.rule });
  if (c.status === 200) res.lane = c.body.lane;
  return res;
}

/** Open the lane's workspace, get its token, and push `files` to the fork. True when pushed. */
async function pushLane(res, files) {
  const n = res.n;
  const w = await request({ kind: "workspace", lane: res.lane, lease: 1 });
  step(`lane ${n}: workspace requested`, w.status === 200, { status: w.status, ms: w.ms, op: w.body.id, state: w.body.state, error: w.body.code });
  if (w.status !== 200) return false;
  const ws = w.body.state === "ready" ? w.body : await waitOp(w.body.id, ["ready", "failed"], 180_000);
  step(`lane ${n}: workspace ready`, ws?.state === "ready", { state: ws?.state, remote: ws?.detail?.remote, leaseGeneration: ws?.detail?.leaseGeneration, error: ws?.error });
  if (ws?.state !== "ready") return false;
  res.fork = ws.detail.remote;

  const g = await request({ kind: "workspace-token", lane: res.lane, lease: 1 });
  if (g.body?.token) secrets.add(g.body.token);
  step(`lane ${n}: workspace token`, g.status === 200 && !!g.body.token, { status: g.status, remote: g.body.remote, expiresAt: g.body.expiresAt, token: g.body.token ? "<token>" : undefined, refused: g.body.rule });
  if (g.status !== 200) return false;
  res.token = g.body.token;

  const dir = mkdtempSync(join(tmpdir(), `deploy-spike-lane${n}-`));
  const cl = await git(["clone", "-q", g.body.remote, dir], { token: g.body.token });
  step(`lane ${n}: clone fork`, cl.code === 0, { code: cl.code, stderr: cl.stderr || undefined });
  if (cl.code !== 0) return false;
  for (const [p, t] of Object.entries(files)) write(dir, p, t);
  await must(["add", "-A"], { cwd: dir });
  await must(["commit", "-q", "-m", `spike smoke lane ${n}`], { cwd: dir });
  res.head = await must(["rev-parse", "HEAD"], { cwd: dir });
  res.tree = await must(["rev-parse", "HEAD^{tree}"], { cwd: dir });
  const p = await git(["push", "-q", "origin", "HEAD:refs/heads/work"], { cwd: dir, token: g.body.token });
  step(`lane ${n}: push to fork`, p.code === 0, { head: res.head, code: p.code, stderr: p.stderr || undefined });
  if (p.code !== 0) return false;
  return true;
}

/** Propose the pushed head; wait for the preview. */
async function proposeLane(res) {
  const n = res.n;
  const pr = await act("propose", { lane: res.lane }, { lease: 1, expectedGeneration: 0, head: res.head, summary: `spike smoke lane ${n}` });
  step(`lane ${n}: propose`, pr.status === 200, { status: pr.status, ms: pr.ms, generation: pr.body.generation, preview: pr.body.preview, changed: pr.body.changed, obligations: pr.body.obligations, refused: pr.body.rule, reason: pr.body.reason, error: pr.body.code, message: pr.body.message });
  if (pr.status !== 200) return res;
  res.proposal = pr.body;
  if (pr.body.preview?.id) {
    const pv = await waitOp(pr.body.preview.id, ["clean", "conflict", "failed"], 120_000);
    res.preview = pv;
    step(`lane ${n}: preview`, pv?.state === "clean", { state: pv?.state, integration: pv?.integration, base: pv?.base, paths: pv?.paths, error: pv?.error });
  }
  return res;
}

/** Land the lane's generation 1 and wait for the operation to end. */
async function landLane(res) {
  const n = res.n;
  const l = await act("land", { lane: res.lane, generation: 1 }, { lease: 1, head: res.head });
  const landOk = l.status === 200;
  step(`lane ${n}: land accepted`, landOk, { status: l.status, ms: l.ms, op: l.body.op?.id, state: l.body.op?.state, refused: l.body.rule, reason: l.body.reason, error: l.body.code, message: l.body.message });
  res.landResponse = { status: l.status, body: l.body };
  if (!landOk) return res;
  const op = await waitOp(l.body.op.id, ["landed", "failed", "aborted", "retryable", "unresolved"], 300_000);
  res.op = op;
  step(`lane ${n}: landed`, op?.state === "landed", { op: op?.id, state: op?.state, integration: op?.integration, reason: op?.reason, error: op?.error, httpStatus: op?.httpStatus, code: op?.code, message: op?.message });
  return res;
}

// ------------------------------------------------------------ the spike operator key

/** The spike operator's key pair, from the env file. The seed stays in this process; it is never printed. */
const operatorKey = () => loadSpikeKeys(secrets).operator;
/** The spike checker service's key pair (ARTROOM_CHECKER_SEED): the key CHECKER_KEY holds, which each checked room invites. */
const checkerKey = () => loadSpikeKeys(secrets).checker;

// ------------------------------------------------------------ the run

/** The public room's identity name (`genesis.repo` without its namespace): the base of its repository's names. */
let publicBase = null;
/** The public room's repository: the incarnation `<base>-<step>` it was sealed on (review 3eb7bc44), never the base name. */
let canonical = null;
let canonicalRemote = null;
const lanes = [];

/** The row gate's switch (rows.mjs `gateOptions`), and the start of the run's billing window. */
let rowsGate = null;
let rowsFrom = null;

async function main() {
  log(`smoke run ${RUN} against ${BASE}`);
  // First, before anything is made: a demanded gate with no token fails here.
  rowsGate = gateOptions(process.env);
  // The analytics token is never printed or saved: redact() removes it from anything that echoes it.
  if (rowsGate.run) secrets.add(rowsGate.token);
  rowsFrom = new Date().toISOString();
  // SPIKE_PHASE=import runs only the import, for a rerun of that part.
  if (["import", "checks", "rows"].includes(process.env.SPIKE_PHASE)) {
    const op = operatorKey();
    if (!op) throw new Error("no spike operator key");
    if (process.env.SPIKE_PHASE === "import") return importPhase(op);
    if (process.env.SPIKE_PHASE === "rows") {
      if (!rowsGate.run) throw new Error("SPIKE_PHASE=rows needs ARTROOM_CF_ANALYTICS_TOKEN: the table comes only from the billing datasets");
      const ck = checkerKey();
      if (!ck) throw new Error("no spike checker key (ARTROOM_CHECKER_SEED)");
      return rowsPhase(op, ck);
    }
    const ck = checkerKey();
    if (!ck) throw new Error("no spike checker key (ARTROOM_CHECKER_SEED)");
    return checksPhase(op, ck);
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
  // The identity names the room's repository; the repository itself is an incarnation of it, found after founding.
  publicBase = genesis.repo.split("/")[1];
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

  // The room's repository: the identity's incarnation (`<base>-<step>`, the latest one made), not the base name.
  const listed = readListing(await api("GET", `/repos?limit=${REPO_PAGE}&search=${publicBase}`), REPO_PAGE, isRepoRecord);
  canonical = listed.outcome === "done" ? incarnationOf(publicBase, listed.items.map((r) => r.name)) : null;
  out.canonical = canonical;
  step("found: the room's repository is an incarnation of its identity", canonical !== null, { base: publicBase, incarnation: canonical, listing: listed.outcome, names: listed.items?.map((r) => r.name) });
  if (!canonical) throw new Error("no incarnation of the room's identity was found");
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
  step("found: no active token on the new repository", left !== null && left.length === 0, { active: left?.length ?? "unknown", tokens: left ? tokenMeta(left) : undefined });

  // 2. A read session (R-CRED-5).
  const s = await request({ kind: "session", ttlSeconds: 900 });
  if (s.body?.token) secrets.add(s.body.token);
  session = s.body.token;
  step("session", s.status === 200 && !!session, { status: s.status, member: s.body.member, expiresAt: s.body.expiresAt });
  const lg = await read("/log?limit=10");
  step("read: log after founding", lg.status === 200, { status: lg.status, head: lg.body.head, kinds: lg.body.acts?.map((e) => (e.entry.type === "system" ? e.entry.event.type : e.entry.act?.envelope?.kind)) });

  // 3. A first lane on the fresh repository: it must land (request b6b51de7, gap 1).
  const first = await lane(1, { "README.md": "# spike smoke\n", "docs/first.md": "first lane, fresh repository\n" });
  lanes.push({ ...first, room, admin, ns: NS });
  step("lane 1: the fork is of the room's incarnation", !!first.fork && basename(first.fork, ".git").startsWith(`${canonical}--`), { fork: first.fork ? basename(first.fork, ".git") : null, incarnation: canonical });
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
  lanes.push({ ...second, room, admin, ns: NS });
  const main2 = await canonicalRef(canonicalRemote, canonical, "refs/heads/main");
  step("main is the landed integration", !!second.op?.integration && main2 === second.op.integration, { main: main2, integration: second.op?.integration, head: second.head });
  // PIN_DELAY_MS is unset (request 8bd623cc, assert 66a41558): the propose itself wrote the pinned ref; nothing read
  // the proposal, which would write it too. After a measurement window, this is the evidence the switch is off.
  if (second.lane && second.head) {
    const pin = await canonicalRef(canonicalRemote, canonical, `refs/artroom/heads/${second.lane}/1`);
    step("the propose wrote its pinned ref itself (PIN_DELAY_MS unset)", pin === second.head, { pin, head: second.head });
  }

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

  // 8. Review and check (request 9f81f372).
  const checker = checkerKey();
  if (operator && checker) await checksPhase(operator, checker);
  else step("checks: the spike checker key", false, { error: "ARTROOM_CHECKER_SEED is not in the env file" });
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

/** The run's imported repositories in gitseq-spike-import, each retained before it is created, for cleanup. */
const importRepos = [];

/**
 * Create a throwaway repository in the import namespace with one commit of
 * `files` (hugh's OAuth; the creation token pushes the commit, then every
 * token on it is revoked before the Room sees it).
 */
async function seedImport(label, files) {
  const name = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  importRepos.push(name);
  const r = await seedImportRepo({ api: (m, p, b) => api(m, p, b, IMPORT_NS), git, dir: mkdtempSync(join(tmpdir(), "deploy-spike-import-")), name, files, onSecret: (t) => secrets.add(t) });
  step(`${label}: throwaway repository created in gitseq-spike-import`, r.created, { name, remote: r.remote, errors: r.errors });
  if (!r.created) throw new Error("the import repository could not be created");
  step(`${label}: one commit pushed; its creation token revoked`, r.pushed === true && r.active === 0, { main: r.seeded, stderr: r.stderr, revoked: r.revoked, active: r.active ?? "unknown" });
  if (!r.pushed) throw new Error("the import repository could not be seeded");
  return r;
}

/** Have the spike operator grant `repo` to a fresh admin key, draft and found a room on it, and open the admin's session. */
async function foundImport(label, operator, repo, handle) {
  admin = newKeyPair();
  const name = `deploy-spike-${label}-${Date.now().toString(36)}`;
  const body = importDraft({ operator, admin, recovery: newKeyPair(), ns: IMPORT_NS, repo: repo.name, handle, name });
  const g = body.repo.grant.grant;
  const d = await http("POST", "", body);
  if (d.body?.draft) secrets.add(d.body.draft);
  const genesis = d.body.genesis;
  step(`${label}: draft`, d.status === 200 && genesis?.repo === g.repo && genesis?.onboarding?.grant?.operator === operator.key, { status: d.status, repo: genesis?.repo, operator: genesis?.onboarding?.grant?.operator, error: d.body.code, message: d.body.message });
  if (d.status !== 200) throw new Error(`${label} draft failed`);
  const f = await http("POST", "/found", { genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft: d.body.draft });
  step(`${label}: found`, f.status === 200, { status: f.status, ms: f.ms, room: f.body.room, error: f.body.code, message: f.body.message });
  if (f.status !== 200) throw new Error(`${label} found failed`);
  room = f.body.room;
  const main0 = await canonicalRef(repo.remote, repo.name, "refs/heads/main", IMPORT_NS);
  step(`${label}: main is the imported commit; the Room wrote nothing`, main0 === repo.seeded, { main: main0, imported: repo.seeded });
  const s = await request({ kind: "session", ttlSeconds: 1800 });
  if (s.body?.token) secrets.add(s.body.token);
  session = s.body.token;
  step(`${label}: session`, s.status === 200 && !!session, { status: s.status, member: s.body.member });
  return { repo: g.repo, room, name };
}

/** Import a throwaway repository, found a room on it, land a lane, and verify the room's log, which carries the grant. */
async function importPhase(operator) {
  const repo = await seedImport("import", { "README.md": "# imported\n\nA throwaway repository for the spike's live import.\n" });
  const out_ = (out.import = await foundImport("import", operator, repo, "@importer"));

  // A lane, landed on the imported main.
  const l = await lane(3, { "docs/imported.md": `landed by the spike smoke run ${RUN}\n` });
  lanes.push({ ...l, room, admin, ns: IMPORT_NS });
  const main1 = await canonicalRef(repo.remote, repo.name, "refs/heads/main", IMPORT_NS);
  step("import: main is the landed integration", !!l.op?.integration && main1 === l.op.integration, { main: main1, integration: l.op?.integration, base: repo.seeded });
  if (l.lane) {
    const r = await act("release", { lane: l.lane }, { lease: 1, note: "spike smoke: import lane done" });
    lanes[lanes.length - 1].released = r.status === 200;
  }
  out_.verify = await publishAndVerify("import", repo.remote, repo.name, IMPORT_NS);
  step("import: verify reports the operator key", out_.verify.report?.operator === operator.key, { operator: out_.verify.report?.operator });
  out_.log = await logSummary();
}

// ------------------------------------------------------------ review and check (request 9f81f372)

/** Invite `handle` with `role` (client custody) and have `kp` join; returns the member's own read session. */
async function joinAs(label, kp, handle, role) {
  const secret = randomBytes(32);
  const inv = await act("roster", null, { op: "invite", member: handle, role, custody: "client", expiresAt: iso(Date.now() + 3600_000), secretHash: digestBytes(secret) });
  const j = inv.status === 200 ? await actAs(kp, "roster", null, { op: "join", invitation: inv.body.id, secret: b64url(secret) }) : inv;
  const s = j.status === 200 ? await requestAs(kp, { kind: "session", ttlSeconds: 1800 }) : j;
  if (s.body?.token) secrets.add(s.body.token);
  step(`${label}: ${handle} joins as ${role}`, inv.status === 200 && j.status === 200 && s.status === 200, { key: kp.key, invite: inv.status, join: j.status, session: s.status, refused: j.body?.rule ?? inv.body?.rule, reason: j.body?.reason ?? inv.body?.reason });
  return s.body?.token ?? null;
}

/** One member's attention page in the current room. */
const attentionOf = async (token) => (await http("GET", `/${room}/attention?limit=100`, undefined, token)).body;

/**
 * A room under a policy that requires one check and one independent review:
 * the Room dispatches the check job to the bound checker service, its check
 * is admitted, a second member reviews, and the lane lands.
 */
async function checksPhase(operator, checker) {
  const L = "checks";
  const repo = await seedImport(L, checkProject(RUN));
  const out_ = (out.checks = await foundImport(L, operator, repo, "@author"));
  const reviewer = newKeyPair();
  const reviewerSession = await joinAs(L, reviewer, "@reviewer", "maintainer");
  const checkerSession = await joinAs(L, checker, "@checker", "checker");

  // Propose: the generation owes the check and the review.
  const l = await openLane(4, checkedChange(RUN), CHECKED_PATHS);
  lanes.push({ ...l, room, admin, ns: IMPORT_NS });
  if (!l.proposal) throw new Error("the checked lane was not proposed");
  const integration = l.preview?.integration ?? null;
  step(`${L}: the proposal owes one check and one review`, obligationOf(l.proposal, "check")?.state === "open" && obligationOf(l.proposal, "review")?.state === "open", { obligations: l.proposal.obligations });
  const asked = { review: attentionFor(await attentionOf(reviewerSession), "review-requested", l.lane), check: attentionFor(await attentionOf(checkerSession), "check-requested", l.lane) };
  step(`${L}: attention asks the reviewer to review and the checker to check`, asked.review?.open === true && asked.check?.open === true, asked);

  // Landing is refused while the review is open (the check is waited for by the landing itself).
  const early = await act("land", { lane: l.lane, generation: 1 }, { lease: 1, head: l.head });
  step(`${L}: land before the review is refused (obligation-open)`, early.status === 409 && early.body.rule === "obligation-open", { status: early.status, rule: early.body.rule, reason: early.body.reason });

  // The Room dispatches the job over CHECKER_TESTS; the checker runs it in a runner and submits its signed check.
  let found = { accepted: [], refused: [] };
  const t = Date.now();
  while (Date.now() - t < 15 * 60_000) {
    found = checksIn((await read("/log?limit=500")).body?.acts, checker.key);
    if (found.accepted.length || found.refused.length) break;
    await sleep(10_000);
  }
  const check = found.accepted[0] ?? null;
  step(`${L}: the Room dispatched the job, and the checker's signed check was admitted`, check?.ok === true && check?.check === CHECK && (integration === null || check.integration === integration), { waitedMs: Date.now() - t, check, refused: found.refused, integration });
  const afterCheck = (await read(`/lanes/${l.lane}/1`)).body;
  step(`${L}: the check obligation is met`, obligationOf(afterCheck, "check")?.state === "met", { check: obligationOf(afterCheck, "check"), review: obligationOf(afterCheck, "review") });
  const checkItem = attentionFor(await attentionOf(checkerSession), "check-requested", l.lane);
  step(`${L}: attention: the checker's request is closed`, checkItem?.open === false, { item: checkItem });

  // A second member, a maintainer, reviews.
  const rv = await actAs(reviewer, "review", { lane: l.lane, generation: 1 }, { head: l.head, verdict: "approve", scope: CHECKED_PATHS, text: "Reviewed for the spike smoke run: the function and its test are right." });
  step(`${L}: the reviewer approves`, rv.status === 200, { status: rv.status, fulfils: rv.body.fulfils, refused: rv.body.rule, reason: rv.body.reason });
  const afterReview = (await read(`/lanes/${l.lane}/1`)).body;
  step(`${L}: the review obligation is met`, obligationOf(afterReview, "review")?.state === "met", { review: obligationOf(afterReview, "review") });
  const reviewItem = attentionFor(await attentionOf(reviewerSession), "review-requested", l.lane);
  step(`${L}: attention: the reviewer's request is closed`, reviewItem?.open === false, { item: reviewItem });

  // Land.
  const landed = await landLane(l);
  Object.assign(lanes[lanes.length - 1], { op: landed.op });
  const main1 = await canonicalRef(repo.remote, repo.name, "refs/heads/main", IMPORT_NS);
  step(`${L}: main is the landed integration`, !!landed.op?.integration && main1 === landed.op.integration, { main: main1, integration: landed.op?.integration });
  const outcome = attentionFor(await read("/attention?limit=100").then((r) => r.body), "land-outcome", l.lane);
  step(`${L}: attention tells the author the landing's outcome`, !!outcome, { item: outcome });
  if (l.lane) {
    const r = await act("release", { lane: l.lane }, { lease: 1, note: "spike smoke: checked lane done" });
    lanes[lanes.length - 1].released = r.status === 200;
  }
  out_.verify = await publishAndVerify(L, repo.remote, repo.name, IMPORT_NS);
  out_.log = await logSummary();
  const kinds = (out_.log ?? []).map((e) => e.kind);
  step(`${L}: the verified log holds the check, the review and the landing`, ["check", "review", "land", "land-outcome"].every((k) => kinds.includes(k)), { kinds });
}

// ------------------------------------------------------------ rows per act (request 8bd623cc, part 1)

/**
 * After an act, the window stays open this long with nothing sent: the act's
 * own deferred work finishes, and at least one quiet per-minute sample of the
 * room falls in the window (rows.mjs `windowTable`). Setup windows use a
 * shorter tail; they need only to keep their work out of the next act's.
 */
const ACT_TAIL_MS = 150_000;
const SETUP_TAIL_MS = 90_000;
/** How long the idle window lasts: lanes held, nothing pending. */
const IDLE_MS = 300_000;
/** A read session is renewed when older than this (sessions last 30 minutes). */
const SESSION_RENEW_MS = 20 * 60_000;

/** The billing windows of SPIKE_PHASE=rows, in order. They are contiguous: every request of the phase falls in one. */
const windows = [];
let sessionAt = 0;

/** A fresh admin read session when the current one is near its end; inside the window that is open. */
async function freshSession() {
  if (Date.now() - sessionAt < SESSION_RENEW_MS) return;
  const s = await request({ kind: "session", ttlSeconds: 1800 });
  if (s.body?.token) {
    secrets.add(s.body.token);
    session = s.body.token;
    sessionAt = Date.now();
  }
  step("rows: admin read session renewed", s.status === 200 && !!s.body?.token, { status: s.status });
}

/** Run `fn` in its own billing window, then keep the window open for its quiet tail. */
async function measured(name, fn, { kind = "act", tail = kind === "act" ? ACT_TAIL_MS : SETUP_TAIL_MS } = {}) {
  const from = new Date().toISOString();
  if (session) await freshSession();
  const r = await fn();
  await sleep(tail);
  const to = new Date().toISOString();
  windows.push({ name, kind, from, to, room });
  log(`window ${kind} ${name}: ${from} .. ${to}`);
  return r;
}

/**
 * Each act once, in one imported room under the checks policy, each in its
 * own billing window; then the rows written and read in each window, from
 * the billing datasets' per-minute samples, as a table (measure/README.md).
 * ROWS_OPEN (default 3) is N, the open proposals at a landing and at a
 * policy activation. ROWS_ONLY=policy measures only the policy activation
 * (founding, then the N lanes and the policy landing).
 */
async function rowsPhase(operator, checker) {
  const mode = process.env.ROWS_ONLY ?? "";
  out.rows = { mode: mode || "all", rooms: [], windows };
  if (mode === "pin") return pinPhase(operator);
  if (mode === "check") return checkPhase(operator);
  if (mode === "activation") return activationPhase(operator);
  if (mode) throw new Error(`ROWS_ONLY must be pin, check or activation, not ${mode}`);
  const L = "rows";
  const N = Number(process.env.ROWS_OPEN ?? 3);
  if (!Number.isSafeInteger(N) || N < 1) throw new Error("ROWS_OPEN must be a positive integer");
  const repo = await seedImport(L, checkProject(RUN));
  const founded = await measured("found one room (draft, found, first session)", async () => {
    const f = await foundImport(L, operator, repo, "@author");
    sessionAt = Date.now();
    return f;
  });
  const measuredRoom = founded.room;
  Object.assign(out.rows, { room: measuredRoom, open: N });
  out.rows.rooms.push(measuredRoom);
  const onlyPolicy = false;
  // A change to .artroom/ owes an approval from an admin other than its author (obl_admin-approval).
  const admin2 = newKeyPair();
  const reviewer = newKeyPair();
  const secret = randomBytes(32);
  const listed = (res) => (lanes.push(Object.assign(res, { room, admin, ns: IMPORT_NS })), res);
  if (!onlyPolicy) await openActs();
  else await measured("setup: a second admin joins", () => joinAs(L, admin2, "@admin2", "admin"), { kind: "setup" });
  await policyActivation();
  if (!onlyPolicy) await checkedActs();

  // Idle: lanes held, nothing pending: the room's background alone.
  await measured("idle: lanes held, nothing pending", () => sleep(IDLE_MS), { kind: "idle", tail: 0 });
  await measured("setup: release every lane", async () => {
    for (const l of lanes) {
      if (!l.lane || l.released || l.room !== measuredRoom) continue;
      const r = await act("release", { lane: l.lane }, { lease: 1, note: "measured" });
      l.released = r.status === 200;
    }
  }, { kind: "setup", tail: 0 });

  async function openActs() {
    // Join: the invitation and the join are two acts, each in its own window.
    const inv = await measured("invite", () => act("roster", null, { op: "invite", member: "@reviewer", role: "maintainer", custody: "client", expiresAt: iso(Date.now() + 3 * 3600_000), secretHash: digestBytes(secret) }));
    step(`${L}: invite`, inv.status === 200, { status: inv.status, refused: inv.body.rule });
    const j = await measured("join", () => actAs(reviewer, "roster", null, { op: "join", invitation: inv.body.id, secret: b64url(secret) }));
    step(`${L}: join`, j.status === 200, { status: j.status, refused: j.body.rule, reason: j.body.reason });
    await measured("setup: the checker and a second admin join", async () => {
      await joinAs(L, checker, "@checker", "checker");
      await joinAs(L, admin2, "@admin2", "admin");
    }, { kind: "setup" });

    // One lane outside the checked paths: claim, propose, note, land, release.
    const d = listed(await measured("claim", () => claimLane(10, ["docs/d0/**"])));
    if (!d.lane) throw new Error("the measured claim was refused");
    await measured("setup: workspace, workspace token, push", () => pushLane(d, { "docs/d0/a.md": `rows ${RUN}\n` }), { kind: "setup" });
    await measured("propose (with its pin and preview)", () => proposeLane(d));
    const note = await measured("note", () => act("note", { act: d.lane }, { text: "a note, measured" }));
    step(`${L}: note`, note.status === 200, { status: note.status, refused: note.body.rule, reason: note.body.reason });
    await measured("land (no other open preview)", () => landLane(d));
    const rel = await measured("release", () => act("release", { lane: d.lane }, { lease: 1, note: "measured" }));
    d.released = rel.status === 200;
  }

  async function policyActivation() {
    // N open proposals, and one more lane to land among them.
    const open = [];
    let lander = null;
    await measured(`setup: ${N + 1} lanes claimed, pushed and proposed`, async () => {
      for (let i = 1; i <= N + 1; i++) {
        const res = listed(await openLane(10 + i, { [`docs/d${i}/a.md`]: `rows ${RUN} ${i}\n` }, [`docs/d${i}/**`]));
        if (!res.proposal) throw new Error(`lane ${10 + i} was not proposed`);
        if (i === 1) lander = res;
        else open.push(res);
      }
    }, { kind: "setup" });
    await measured(`land with ${N} open previews`, () => landLane(lander));
    await measured("setup: release the landed lane", async () => {
      const r = await act("release", { lane: lander.lane }, { lease: 1, note: "measured" });
      lander.released = r.status === 200;
    }, { kind: "setup" });

    // A landing that changes the policy: activation recomputes the N open proposals and resets their previews.
    const changed = { ...checksPolicy(), rules: checksPolicy().rules.map((r) => (r.id === REVIEW_RULE ? { ...r, id: `${REVIEW_RULE}-2` } : r)) };
    let pol = null;
    await measured("setup: a policy lane claimed, pushed, proposed and approved by the second admin", async () => {
      pol = listed(await openLane(30, { ".artroom/policy.json": JSON.stringify(changed, null, 2) + "\n" }, [".artroom/**"]));
      if (!pol.proposal) throw new Error("the policy lane was not proposed");
      const a = await actAs(admin2, "review", { lane: pol.lane, generation: 1 }, { head: pol.head, verdict: "approve", scope: [".artroom/**"], text: "Approved for the measurement." });
      step(`${L}: the second admin approves the policy lane`, a.status === 200, { status: a.status, fulfils: a.body.fulfils, refused: a.body.rule, reason: a.body.reason });
    }, { kind: "setup" });
    await measured(`land that activates a policy, with ${N} open proposals`, () => landLane(pol));
    await measured("setup: release the policy lane", async () => {
      const r = await act("release", { lane: pol.lane }, { lease: 1, note: "measured" });
      pol.released = r.status === 200;
    }, { kind: "setup" });
  }

  async function checkedActs() {

    // A checked lane: propose owes the check and the review; the checker service's check; the review.
    let c = null;
    await measured("setup: a checked lane claimed and pushed", async () => {
      c = listed(await claimLane(40, CHECKED_PATHS));
      if (!c.lane || !(await pushLane(c, checkedChange(RUN)))) throw new Error("the checked lane was not pushed");
    }, { kind: "setup" });
    await measured("propose (owes a check and a review; the check job is dispatched)", () => proposeLane(c));
    const check = await measured("check (the checker service's signed check, admitted)", async () => {
      const t = Date.now();
      while (Date.now() - t < 15 * 60_000) {
        const found = checksIn((await read("/log?limit=500")).body?.acts, checker.key);
        if (found.accepted.length || found.refused.length) return found;
        await sleep(10_000);
      }
      return { accepted: [], refused: [] };
    });
    step(`${L}: the check was admitted`, check.accepted[0]?.ok === true, { check: check.accepted[0] ?? null, refused: check.refused });
    const rv = await measured("review", () => actAs(reviewer, "review", { lane: c.lane, generation: 1 }, { head: c.head, verdict: "approve", scope: CHECKED_PATHS, text: "Measured review." }));
    step(`${L}: review`, rv.status === 200, { status: rv.status, refused: rv.body.rule, reason: rv.body.reason });
  }
}

/** The samples of the phase, from the billing datasets, and the table; saved beside the run's result. */
async function rowsReport() {
  // querySamples starts a minute early (sampleQueryStart), so the first window's first sample is in.
  const samples = await querySamples({ accountId: rowsGate.accountId, token: rowsGate.token, worker: SPIKE_WORKER, from: windows[0].from, to: windows.at(-1).to });
  // Each window belongs to the room it measured; each room's windows are tabled against that room's samples.
  const rooms = out.rows.rooms;
  const table = rooms.flatMap((r) => windowTable(windows.filter((w) => w.room === r), samples, r).map((row) => ({ room: r, ...row })));
  out.rows.table = table;
  out.rows.namespaces = samples.namespaces;
  out.rows.samples = samples.samples.filter((s) => rooms.includes(s.name) || s.className !== "Room");
  const file = join(HERE, "results", `row-costs-${RUN}.md`);
  mkdirSync(dirname(file), { recursive: true });
  const sections = rooms.map((r) => `## Room \`${r}\`\n\n${windowTableMarkdown(table.filter((row) => row.room === r))}`).join("\n");
  writeFileSync(file, `# Rows per act, ${RUN} (${out.rows.mode})\n\nFrom Cloudflare's per-minute durableObjectsPeriodicGroups samples (rowsWritten, rowsRead), by window (measure/README.md). Namespaces queried: ${samples.namespaces.map((n) => `${n.className} \`${n.id}\``).join(", ")}.\n\n${sections}`);
  log(`rows table ${file}`);
}

// ------------------------------------------------------------ isolated measurements (review 28615b74)

/** A quiet window: nothing is sent. It is the control for the windows on either side. */
const QUIET_MS = 300_000;
const quiet = (name, ms) => measured(name, () => sleep(Math.max(0, ms)), { kind: "quiet", tail: 0 });

/** Found a dedicated room for one isolated measurement; its founding is a setup window. */
async function dedicatedRoom(L, operator, files) {
  const repo = await seedImport(L, files);
  const f = await measured(`${L}: found a dedicated room`, async () => {
    const r = await foundImport(L, operator, repo, "@author");
    sessionAt = Date.now();
    return r;
  }, { kind: "setup" });
  out.rows.rooms.push(f.room);
  return { repo, room: f.room };
}

const listedLane = (res) => (lanes.push(Object.assign(res, { room, admin, ns: IMPORT_NS })), res);

/**
 * ROWS_ONLY=pin, on a Room deployed with PIN_DELAY_MS (assert 66a41558),
 * ROWS_PIN_DELAY_MS the same value. Two isolated alarm ticks in one dedicated
 * room, each against quiet controls:
 *   1. A pending pin: the propose leaves its pin (and writes the switch's due
 *      time, 2 rows), and the alarm at the due time completes it.
 *   2. Nothing pending: a second propose's pin is completed early by a read of
 *      the proposal (a setup window); the alarm stored for its due time then
 *      fires with nothing to do.
 * The pinned refs are read from the repository (not the Room) before and
 * after each tick, as evidence.
 */
async function pinPhase(operator) {
  const L = "rows-pin";
  const delay = Number(process.env.ROWS_PIN_DELAY_MS ?? 0);
  if (!Number.isSafeInteger(delay) || delay < 360_000) throw new Error("ROWS_ONLY=pin needs ROWS_PIN_DELAY_MS, the PIN_DELAY_MS the Room was deployed with, of at least 360000");
  const { repo } = await dedicatedRoom(L, operator, checkProject(RUN));
  const pinned = (l) => canonicalRef(repo.remote, repo.name, `refs/artroom/heads/${l.lane}/1`, IMPORT_NS);
  const prepare = async (n, path) => {
    const l = listedLane(await claimLane(n, [`${path}/**`]));
    if (!l.lane || !(await pushLane(l, { [`${path}/a.md`]: `rows ${RUN} ${n}\n` }))) throw new Error(`lane ${n} was not pushed`);
    return l;
  };
  const a = await measured("pin: setup, lane A claimed and pushed", () => prepare(50, "docs/pa"), { kind: "setup" });
  await quiet("pin: quiet before (control)", QUIET_MS);
  const ta = Date.now();
  await measured("pin: propose under the switch, its pin left pending (includes the switch's due time, 2 rows)", () => proposeLane(a));
  const beforeA = await pinned(a);
  step(`${L}: lane A's pinned ref is not written before its due time`, beforeA !== a.head, { pinned: beforeA, head: a.head });
  await quiet("pin: quiet, the pin pending (control)", ta + delay - 90_000 - Date.now());
  await measured("pin: the alarm tick that completes the pending pin (includes deleting the switch's due time, 2 rows)", () => sleep(Math.max(0, ta + delay + 15_000 - Date.now())));
  const afterA = await pinned(a);
  step(`${L}: the alarm wrote lane A's pinned ref`, afterA === a.head, { pinned: afterA, head: a.head });
  await measured("pin: setup, release lane A", async () => void (a.released = (await act("release", { lane: a.lane }, { lease: 1, note: "measured" })).status === 200), { kind: "setup" });

  const b = await measured("pin: setup, lane B claimed and pushed", () => prepare(51, "docs/pb"), { kind: "setup" });
  const tb = Date.now();
  await measured("pin: setup, propose B under the switch", () => proposeLane(b), { kind: "setup" });
  // The read completes B's pin now (R-PROP-1); the alarm stored for B's due time stays, with nothing left to do.
  await measured("pin: setup, a read of proposal B completes its pin early", () => read(`/lanes/${b.lane}/1`), { kind: "setup" });
  const afterRead = await pinned(b);
  step(`${L}: the read wrote lane B's pinned ref before its due time`, afterRead === b.head, { pinned: afterRead, head: b.head });
  await quiet("idle: quiet before the empty tick (control)", tb + delay - 90_000 - Date.now());
  await measured("idle: the alarm tick at B's old due time, nothing pending", () => sleep(Math.max(0, tb + delay + 15_000 - Date.now())));
  await quiet("idle: quiet after (control)", QUIET_MS);
  await measured("pin: setup, release lane B", async () => void (b.released = (await act("release", { lane: b.lane }, { lease: 1, note: "measured" })).status === 200), { kind: "setup", tail: 0 });
}

/**
 * ROWS_ONLY=check: one check, admitted 5 minutes after its propose, in a
 * dedicated room. The policy requires the `manual` check on lib/**, which no
 * service is bound for (CHECKER_MANUAL does not exist), so no job is sent;
 * the driver signs the check itself with a fresh member key of role checker.
 */
async function checkPhase(operator) {
  const L = "rows-check";
  await dedicatedRoom(L, operator, manualCheckProject(RUN));
  const checker = newKeyPair();
  await measured("check: setup, a checker member joins", () => joinAs(L, checker, "@manual-checker", "checker"), { kind: "setup" });
  const l = await measured("check: setup, a lane on lib/** claimed and pushed", async () => {
    const r = listedLane(await claimLane(60, MANUAL_PATHS));
    if (!r.lane || !(await pushLane(r, { "lib/x.js": `export const x = "${RUN}";\n` }))) throw new Error("the checked lane was not pushed");
    return r;
  }, { kind: "setup" });
  await measured("check: setup, propose (owes the manual check; no job is sent)", () => proposeLane(l), { kind: "setup" });
  const obligation = obligationOf(l.proposal, "check");
  const integration = l.preview?.integration ?? null;
  step(`${L}: the proposal owes the manual check, on a clean fast-forward preview`, obligation?.state === "open" && integration === l.head, { obligation, integration, head: l.head });
  const activated = ((await read("/log?limit=5")).body?.acts ?? []).find((e) => e.entry?.type === "system" && e.entry.event?.type === "policy-activated");
  const config = activated?.entry.event.checkers?.find((c) => c.name === "manual")?.config ?? null;
  step(`${L}: the manual checker's configuration digest, from policy-activated`, !!config, { config });
  await quiet("check: quiet before (control)", QUIET_MS);
  const body = { obligation: obligation?.id, check: "manual", integration: l.head, input: { kind: "tree", tree: l.tree }, config, runner: digestBytes(new TextEncoder().encode(`rows-${RUN}`)), volatile: false, ok: true, detail: "Measured check (request 8bd623cc): signed by the driver." };
  const c = await measured("check: the check, admitted", () => actAs(checker, "check", { lane: l.lane, generation: 1 }, body));
  step(`${L}: the check was admitted`, c.status === 200, { status: c.status, refused: c.body.rule, reason: c.body.reason });
  await quiet("check: quiet after (control)", QUIET_MS);
}

/**
 * ROWS_ONLY=activation: policy activation with N open proposals, separated
 * from its landing by difference. Two dedicated rooms, with N = 0 and with
 * N = ROWS_OPEN open proposals. In each, three times: land a plain change,
 * then land a change to .artroom/policy.json (approved by a second admin).
 * activation(N) = policy landing - plain landing, in the same room, at
 * nearly the same log length; the N = 0 room gives the fixed part.
 */
async function activationPhase(operator) {
  const N = Number(process.env.ROWS_OPEN ?? 3);
  if (!Number.isSafeInteger(N) || N < 1) throw new Error("ROWS_OPEN must be a positive integer");
  for (const n of [0, N]) {
    const L = `rows-activation-${n}`;
    await dedicatedRoom(L, operator, checkProject(RUN));
    const admin2 = newKeyPair();
    await measured(`activation N=${n}: setup, a second admin joins`, () => joinAs(L, admin2, "@admin2", "admin"), { kind: "setup" });
    if (n > 0)
      await measured(`activation N=${n}: setup, ${n} lanes proposed and left open`, async () => {
        for (let i = 1; i <= n; i++) if (!listedLane(await openLane(70 + i, { [`docs/o${i}/a.md`]: `rows ${RUN} ${i}\n` }, [`docs/o${i}/**`])).proposal) throw new Error("an open lane was not proposed");
      }, { kind: "setup" });
    for (let rep = 1; rep <= 3; rep++) {
      const plain = await measured(`activation N=${n}: setup, plain lane ${rep} proposed`, async () => listedLane(await openLane(80 + rep, { [`docs/p${rep}/a.md`]: `plain ${RUN} ${rep}\n` }, [`docs/p${rep}/**`])), { kind: "setup" });
      await measured(`activation N=${n}, rep ${rep}: land a plain change`, () => landLane(plain));
      await measured(`activation N=${n}: setup, release plain lane ${rep}`, async () => void (plain.released = (await act("release", { lane: plain.lane }, { lease: 1, note: "measured" })).status === 200), { kind: "setup" });
      const changed = { ...checksPolicy(), rules: checksPolicy().rules.map((r) => (r.id === REVIEW_RULE ? { ...r, id: `${REVIEW_RULE}-${n}-${rep}` } : r)) };
      const pol = await measured(`activation N=${n}: setup, policy lane ${rep} proposed and approved`, async () => {
        const p = listedLane(await openLane(90 + rep, { ".artroom/policy.json": JSON.stringify(changed, null, 2) + "\n" }, [".artroom/**"]));
        if (!p.proposal) throw new Error("the policy lane was not proposed");
        const a = await actAs(admin2, "review", { lane: p.lane, generation: 1 }, { head: p.head, verdict: "approve", scope: [".artroom/**"], text: "Approved for the measurement." });
        step(`${L}: the second admin approves policy lane ${rep}`, a.status === 200, { status: a.status, refused: a.body.rule });
        return p;
      }, { kind: "setup" });
      await measured(`activation N=${n}, rep ${rep}: land a policy change (activation)`, () => landLane(pol));
      await measured(`activation N=${n}: setup, release policy lane ${rep}`, async () => void (pol.released = (await act("release", { lane: pol.lane }, { lease: 1, note: "measured" })).status === 200), { kind: "setup" });
    }
    await measured(`activation N=${n}: setup, release the open lanes`, async () => {
      for (const l of lanes) if (l.lane && !l.released && l.room === room) l.released = (await act("release", { lane: l.lane }, { lease: 1, note: "measured" })).status === 200;
    }, { kind: "setup", tail: 0 });
  }
}

// ------------------------------------------------------------ cleanup (review 1b868265)

// The rules live in cleanup.mjs, shared with mcp-stage0.mjs (review 66fec276).
export { cleanupRun, incarnationOf, isRepoRecord, isTokenRecord, outcomeOf, readListing, smokeOk } from "./cleanup.mjs";

/**
 * One cleanup outcome from several (each `cleanupRun`'s, with its namespace):
 * ok only if every part is; the remainder is unknown (null) if any part's is.
 */
export function combineCleanups(releases, parts) {
  const tag = (ns, list) => list.map((d) => ({ namespace: ns, ...d }));
  return {
    releases,
    ok: parts.length > 0 && parts.every(([, c]) => c.ok === true),
    duties: parts.flatMap(([ns, c]) => tag(ns, c.duties ?? [])),
    unresolved: parts.flatMap(([ns, c]) => tag(ns, c.unresolved ?? [])),
    reposLeft: parts.every(([, c]) => Array.isArray(c.reposLeft)) ? parts.flatMap(([ns, c]) => c.reposLeft.map((r) => `${ns}/${r}`)) : null,
  };
}

/** Have wrangler refresh hugh's OAuth token (it lasts an hour), as deploy-spike.sh's `whoami` does. Never prints it. */
function refreshOauth() {
  return new Promise((done) => {
    const env = { ...process.env };
    delete env.CLOUDFLARE_API_TOKEN;
    execFile("npx", ["-y", "wrangler@latest", "whoami"], { env, maxBuffer: 1 << 22 }, (err) => done(!err));
  });
}

async function cleanup() {
  // A long run (SPIKE_PHASE=rows) outlives the OAuth token it started with.
  if (Date.now() - t0 > 45 * 60_000) log(`cleanup: OAuth refreshed ${await refreshOauth()}`);
  // Release a lane still held (the landed lane may already be done; a refusal is fine: the token duties below cover access).
  const releases = {};
  for (const l of lanes) {
    if (!l.lane || !l.room || l.released) continue;
    room = l.room;
    admin = l.admin;
    const r = await act("release", { lane: l.lane }, { lease: 1, note: "spike smoke cleanup" }).catch((e) => ({ status: 0, body: { message: e.message } }));
    releases[`lane ${l.n}`] = { status: r.status, rule: r.body?.rule };
  }
  // The deploy lane's cleanup, once per namespace: the public room's repositories, then the import's.
  const run = async (ns, base, repo, incarnations, prefix = null) => {
    const forks = lanes.filter((l) => l.fork && l.ns === ns && (!prefix || basename(l.fork, ".git").startsWith(`${prefix}--`))).map((l) => basename(l.fork, ".git"));
    return cleanupRun({ api: (m, p, b) => api(m, p, b, ns), canonical: base, expected: base ? [repo ?? base, ...forks] : [], minted: minted[ns], incarnations });
  };
  // The public room: every repository named from its identity's base (incarnations, forks, and the base name if present).
  const parts = [[NS, await run(NS, publicBase, canonical, true)]];
  // Each imported repository: its own name and its forks (`<name>--<lane>`).
  for (const repo of importRepos) parts.push([IMPORT_NS, await run(IMPORT_NS, repo, repo, false, repo)]);
  return combineCleanups(releases, parts);
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let failed = false;
  try {
    await main();
  } catch (e) {
    failed = true;
    out.error = redact(e.stack ?? e.message);
    log("error:", e.message);
  } finally {
    try {
      out.cleanup = await cleanup();
    } catch (e) {
      out.cleanup = { ok: false, error: redact(e.message), unresolved: [], reposLeft: null };
    }
    for (const d of out.cleanup.duties ?? []) log(`cleanup ${d.namespace ?? ""} ${d.duty}${d.repo ? ` ${d.repo}` : ""}${d.token ? ` token ${d.token}` : ""}: ${d.outcome}${d.detail ? ` (${d.detail})` : ""}`);
    log(`cleanup ok ${out.cleanup.ok}; repositories left ${JSON.stringify(out.cleanup.reposLeft)}; unresolved ${out.cleanup.unresolved?.length ?? "?"}`);
    // The row gate (rows.mjs), after cleanup, with the window's end read after the settle wait.
    if (rowsGate?.run) {
      log(`row gate: waiting ${SETTLE_MS} ms for the billing datasets`);
      const to = await windowEndAfterSettle(SETTLE_MS);
      if (out.rows) await rowsReport().catch((e) => void (out.rows.error = redact(safeMessage(e, rowsGate.token))));
      out.rowGate = await rowGate({ accountId: rowsGate.accountId, token: rowsGate.token, worker: SPIKE_WORKER, from: rowsFrom, to, budget: SMOKE_BUDGET });
    } else out.rowGate = rowsGate ? { state: "skipped", reason: rowsGate.reason } : { state: "incomplete", failures: ["the row gate did not start (see error)"] };
    log(`row gate ${out.rowGate.state}${out.rowGate.totalRowsWritten !== undefined ? `: ${out.rowGate.totalRowsWritten} rows written` : ""}`, out.rowGate.failures ?? out.rowGate.reason ?? "");
    out.ok = smokeOk(out, failed) && gateOk(out.rowGate);
    out.ms = Date.now() - t0;
    const dir = join(HERE, "results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `spike-smoke-${RUN}.json`);
    writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
    log(`ok ${out.ok}; result ${file}`);
    process.exit(out.ok ? 0 : 1);
  }
}
