#!/usr/bin/env node
// MCP plan stage 0 (request 8ae3b2dc): drive the deployed spike Room through
// its MCP endpoint, POST /v1/rooms/:room/mcp, with a bearer session, and
// optionally hand a second bearer to a cold Claude Code agent.
//
//   node packages/room/measure/mcp-stage0.mjs            # the scripted drive
//   node packages/room/measure/mcp-stage0.mjs --claude   # and the cold agent
//   node packages/room/measure/mcp-stage0.mjs --checks   # review and check, instead
//
// With --checks (request 9f81f372), the room is an import in
// gitseq-spike-import whose first commit requires one check (`tests`, by
// role:checker) and one review from a maintainer. The spike checker
// service's key joins as the checker; an MCP agent (role agent) claims,
// pushes, proposes and lands; a second MCP agent (role maintainer) reviews.
// Steps: propose; the reviewer's attention asks for the review; landing is
// refused while the review is open; the Room dispatches the check job to
// artroom-spike-checkers and the checker's check is admitted; the reviewer
// approves through MCP; the author lands; its attention shows the outcome;
// `artroom verify` replays the published log. Cleanup is the same, in the
// import namespace.
//
// Steps: found a room (public founding); invite and redeem room-custody
// agents (R-CRED-3); with the official MCP client, pinned to 2026-07-28, and
// once in legacy mode: list the tools, claim, get the workspace, push a
// one-line commit with git, propose, check that a refusal conforms to the
// advertised schema, land, read attention with its cursor, explain, release.
// With --claude: write an MCP config that names the URL and reads the bearer
// from the environment, run `claude -p` on a short task in an empty
// directory, and check that its lane landed. Then clean up with the shared
// rules of cleanup.mjs (review 66fec276): end every bearer session (revoke
// the agent's key and see its bearer refused), revoke every token the run
// minted, revoke every active Artifacts token on the run's repositories and
// delete them. Every duty is recorded; the run exits nonzero unless every
// duty is done and the final inventory proves nothing is left.
//
// It needs hugh's wrangler OAuth login (Artifacts REST). It prints no token
// and saves redacted results in measure/results/: the run as JSON, and the
// Claude Code transcript as JSON lines.

import { execFile, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { b64url, digestBytes, newKeyPair, randomBytes, randomToken, sign } from "../src/crypto.ts";
import { iso } from "../src/ids.ts";
import { cleanupRun, incarnationOf, isRepoRecord, readListing, REPO_PAGE, smokeOk } from "./cleanup.mjs";
import { attentionFor, CHECK, CHECKED_PATHS, checkedChange, checkProject, checksIn, importDraft, loadSpikeKeys, obligationOf, seedImportRepo } from "./checks.mjs";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const BASE = process.env.SPIKE_URL ?? "https://artroom-spike-room.inguz.workers.dev";
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MCP0_SCRATCH ?? tmpdir();
const WITH_CLAUDE = process.argv.includes("--claude");
const WITH_CHECKS = process.argv.includes("--checks");
const IMPORT_NS = "gitseq-spike-import";
/** The namespace every Artifacts REST call of this run reaches: the import namespace for --checks. */
const REST_NS = WITH_CHECKS ? IMPORT_NS : NS;
const KINDS = ["claim", "propose", "note", "land", "release", "renew"];

// ------------------------------------------------------------ redaction

const secrets = new Set();
const TOKEN_RES = [/art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g, /\barb_[A-Za-z0-9_-]+/g, /\bses_[A-Za-z0-9_-]+/g];
function redact(s) {
  let t = String(s);
  for (const re of TOKEN_RES) t = t.replace(re, "<token>");
  for (const x of secrets) if (x) t = t.split(x).join("<redacted>");
  return t;
}
const clean = (v) => JSON.parse(redact(JSON.stringify(v ?? null)));

const t0 = Date.now();
const RUN = new Date(t0).toISOString().replace(/[:.]/g, "-");
const out = { run: RUN, url: BASE, namespace: REST_NS, mode: WITH_CHECKS ? "checks" : "drive", steps: [], cleanup: {} };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function step(name, ok, detail) {
  out.steps.push({ step: name, ok, atMs: Date.now() - t0, detail: clean(detail) });
  log(`${ok ? "ok  " : "FAIL"} ${name}`, detail ?? "");
  return ok;
}

// ------------------------------------------------------------ the Room's HTTPS API, as the admin

async function http(method, path, body, bearer) {
  const r = await fetch(`${BASE}/v1/rooms${path}`, {
    method,
    headers: { "content-type": "application/json", "user-agent": "artroom-mcp-stage0/1.0", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text: text.slice(0, 500) };
  }
  return { status: r.status, body: json, headers: r.headers };
}

let room = null;
let admin = null;
function actAs(kp, kind, target, body) {
  const envelope = { v: 1, room, actor: kp.key, kind, target, body, idempotencyKey: randomToken().slice(0, 24) };
  return http("POST", `/${room}/acts`, { envelope, sig: sign(kp.seed, "artroom-envelope-v1", envelope) });
}
const act = (kind, target, body) => actAs(admin, kind, target, body);
function requestAs(kp, req) {
  const r = { v: 1, room, actor: kp.key, request: req, nonce: randomToken().slice(0, 32), notAfter: iso(Date.now() + 60_000) };
  return http("POST", `/${room}/requests`, { request: r, sig: sign(kp.seed, "artroom-request-v1", r) });
}

/** Invite and redeem a room-custody agent (R-CRED-3). The bearer is kept in `secrets`, never printed. */
async function agent(handle, role = "agent", kinds = KINDS) {
  const bytes = randomBytes(32);
  // Retained before any effect, so cleanup knows this agent even if a call below fails or its answer is lost.
  const a = { member: handle, invitation: null, redeemed: "not-sent", key: null, bearer: null };
  agents.push(a);
  const inv = await act("roster", null, { op: "invite", member: handle, role, custody: "room", expiresAt: iso(Date.now() + 3600_000), secretHash: digestBytes(bytes), session: { kinds, lanes: "*", ttlSeconds: 3600 } });
  if (inv.status !== 200) throw new Error(`invite ${handle}: ${JSON.stringify(inv.body)}`);
  a.invitation = inv.body.id;
  const secret = b64url(bytes);
  secrets.add(secret);
  a.redeemed = "unknown";
  const r = await http("POST", `/${room}/redeem`, { custody: "room", invitation: inv.body.id, secret }).catch((e) => ({ status: 0, body: { message: e.message } }));
  if (r.body?.bearer) secrets.add(r.body.bearer);
  if (r.status === 200 && r.body?.key && r.body?.bearer) Object.assign(a, { redeemed: "done", key: r.body.key, bearer: r.body.bearer });
  else if (r.status >= 400 && r.status < 500) a.redeemed = "refused"; // nothing was redeemed, so there is no session to end
  step(`redeem ${handle}`, r.status === 200 && !!r.body.bearer, { status: r.status, member: r.body.member, role: r.body.role, delegation: r.body.delegation, mcp: r.body.mcp, expiresAt: r.body.expiresAt });
  if (r.status !== 200) throw new Error(`redeem ${handle} failed`);
  return r.body;
}

// ------------------------------------------------------------ Artifacts REST (hugh's OAuth) and git

function oauth() {
  const m = /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"));
  if (!m) throw new Error("no wrangler OAuth token; run wrangler whoami");
  return m[1];
}
async function api(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${REST_NS}${path}`, {
    method,
    headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-mcp-stage0/1.0" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json().catch(() => ({}));
}
async function mint(repo, scope, ttl) {
  const r = await api("POST", "/tokens", { repo, scope, ttl });
  if (!r.result?.plaintext) throw new Error(`token for ${repo}: ${redact(JSON.stringify(r.errors ?? r))}`);
  secrets.add(r.result.plaintext);
  minted.set(r.result.id, repo);
  return r.result;
}
/** Revoke a token this run minted; until a revocation is seen to succeed, cleanup still owes it. */
async function revoke(id) {
  const ok = (await api("DELETE", `/tokens/${id}`)).success === true;
  if (ok) minted.delete(id);
  return ok;
}

function git(args, { cwd, token } = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: cwd ?? tmpdir(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/bin/false",
    GIT_AUTHOR_NAME: "mcp stage 0",
    GIT_AUTHOR_EMAIL: "mcp0@artroom.invalid",
    GIT_COMMITTER_NAME: "mcp stage 0",
    GIT_COMMITTER_EMAIL: "mcp0@artroom.invalid",
    ...(token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}` } : {}),
  };
  return new Promise((resolve) =>
    execFile("git", ["-c", "credential.helper=", "-c", "init.defaultBranch=main", ...args], { cwd, env, maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout.trim(), stderr: redact(stderr).trim().slice(-800) }),
    ),
  );
}

async function canonicalMain(remote, repo) {
  const t = await mint(repo, "read", 60);
  try {
    const r = await git(["ls-remote", remote, "refs/heads/main"], { token: t.plaintext });
    return r.code === 0 ? r.stdout.split(/\s+/)[0] || null : `error: ${r.stderr}`;
  } finally {
    await revoke(t.id);
  }
}

// ------------------------------------------------------------ MCP

async function mcpClient(redeemed, mode) {
  const c = new Client({ name: "artroom-mcp-stage0", version: "1.0.0" }, { versionNegotiation: { mode } });
  await c.connect(new StreamableHTTPClientTransport(new URL(redeemed.mcp), { requestInit: { headers: { authorization: `Bearer ${redeemed.bearer}` } } }));
  return c;
}

async function tool(c, name, args, timeout = 120_000) {
  const s = Date.now();
  try {
    const r = await c.callTool({ name, arguments: args }, { timeout });
    if (r.structuredContent?.grant?.token) secrets.add(r.structuredContent.grant.token);
    return { ms: Date.now() - s, isError: r.isError, sc: r.structuredContent, text: r.content?.[0]?.text?.split("\n")[0] };
  } catch (e) {
    return { ms: Date.now() - s, thrown: redact(e.message) };
  }
}

// ------------------------------------------------------------ the scripted drive

/** The room's identity name (`genesis.repo` without its namespace): the base of its repositories' names, known at draft. */
let publicBase = null;
/** The room's repository: the incarnation `<base>-<step>` it was sealed on (founding revision 3), never the base name. */
let canonical = null;
let canonicalRemote = null;
/** What the run made, retained before each effect: agents (bearer sessions), tokens it minted (ID to repository), and lane forks. */
const agents = [];
const minted = new Map();
const forks = new Set();
const landedLanes = [];

async function drive(driver) {
  // Legacy stateless mode, as Codex and pi speak it: connect and list.
  const legacy = await mcpClient(driver, "legacy");
  const legacyTools = (await legacy.listTools()).tools;
  step("legacy mode: connect and tools/list", legacyTools.length === 10 && legacyTools.every((t) => t.outputSchema?.type === "object"), { protocol: legacy.getNegotiatedProtocolVersion(), era: legacy.getProtocolEra(), tools: legacyTools.map((t) => t.name) });
  await legacy.close();

  const c = await mcpClient(driver, { pin: "2026-07-28" });
  const instructions = c.getInstructions() ?? "";
  const { tools } = await c.listTools();
  step("2026-07-28: connect, instructions and tools/list", tools.length === 10 && instructions.length <= 512, {
    protocol: c.getNegotiatedProtocolVersion(),
    instructionsLength: instructions.length,
    instructions,
    tools: tools.map((t) => ({ name: t.name, outputSchemaRoot: t.outputSchema?.type, refusalForm: (t.outputSchema?.oneOf ?? []).some((f) => f.required?.includes("refused")) })),
  });

  const claim = await tool(c, "claim", { goal: "MCP stage 0: a one-line change", scope: ["mcp0/**"], idempotencyKey: "mcp0-claim" });
  step("claim", claim.isError === false && !!claim.sc?.lane, { ms: claim.ms, lane: claim.sc?.lane, lease: claim.sc?.lease, by: claim.sc?.by, text: claim.text, thrown: claim.thrown });
  if (!claim.sc?.lane) return;
  const held = { lane: claim.sc.lane, lease: claim.sc.lease.generation };
  const again = await tool(c, "claim", { goal: "MCP stage 0: a one-line change", scope: ["mcp0/**"], idempotencyKey: "mcp0-claim" });
  step("claim retried with the same idempotencyKey returns the same act", again.sc?.id === claim.sc.id, { first: claim.sc.id, retry: again.sc?.id });

  let ws;
  for (let i = 0; i < 9; i++) {
    ws = await tool(c, "workspace", { ...held, waitMs: 20_000 });
    if (ws.sc?.grant || ws.sc?.refused || ws.sc?.op?.state === "failed" || ws.isError) break;
  }
  step("workspace: ready, with a grant", !!ws.sc?.grant?.token, { ms: ws.ms, op: ws.sc?.op, remote: ws.sc?.grant?.remote, expiresAt: ws.sc?.grant?.expiresAt, refused: ws.sc?.rule, text: ws.text, thrown: ws.thrown });
  if (!ws.sc?.grant?.token) return;
  const { remote, token } = ws.sc.grant;
  forks.add(basename(new URL(remote).pathname, ".git"));

  const dir = mkdtempSync(join(SCRATCH, "mcp0-drive-"));
  const cl = await git(["clone", "-q", remote, dir], { token });
  step("git clone the fork", cl.code === 0, { code: cl.code, stderr: cl.stderr || undefined });
  if (cl.code !== 0) return;
  mkdirSync(join(dir, "mcp0"), { recursive: true });
  writeFileSync(join(dir, "mcp0/driver.md"), `MCP stage 0, scripted drive ${RUN}\n`);
  await git(["add", "-A"], { cwd: dir });
  await git(["commit", "-q", "-m", "MCP stage 0: one line from the scripted drive"], { cwd: dir });
  const head = (await git(["rev-parse", "HEAD"], { cwd: dir })).stdout;
  const p = await git(["push", "-q", "origin", "HEAD:refs/heads/work"], { cwd: dir, token });
  step("git push to the fork", p.code === 0, { head, code: p.code, stderr: p.stderr || undefined });
  if (p.code !== 0) return;

  const pr = await tool(c, "propose", { ...held, head, expectedGeneration: 0, summary: "One line from the MCP stage 0 drive.", idempotencyKey: "mcp0-propose" });
  step("propose", pr.isError === false && pr.sc?.generation === 1, { ms: pr.ms, generation: pr.sc?.generation, changed: pr.sc?.changed, obligations: pr.sc?.obligations, preview: pr.sc?.preview, text: pr.text, refused: pr.sc?.rule, reason: pr.sc?.reason, thrown: pr.thrown });
  if (pr.sc?.generation !== 1) return;

  // A refusal over the wire: the client validates it against the advertised oneOf(result, Refusal).
  const rf = await tool(c, "propose", { ...held, head, expectedGeneration: 0, summary: "again", idempotencyKey: "mcp0-propose-again" });
  step("a refusal conforms to the advertised outputSchema (validated by the MCP client)", rf.isError === false && rf.sc?.refused === true, { rule: rf.sc?.rule, reason: rf.sc?.reason, fix: rf.sc?.fix, text: rf.text, thrown: rf.thrown });

  const cursor0 = (await tool(c, "attention", {})).sc?.cursor;
  let land = await tool(c, "land", { ...held, generation: 1, head, waitMs: 45_000, idempotencyKey: "mcp0-land" });
  // The same call with the same key replays the landing and waits again (R-IDEM-2, R-API-9).
  for (let i = 0; i < 6 && land.sc?.op && !["landed", "failed", "aborted", "retryable", "unresolved"].includes(land.sc.op.state); i++) {
    land = await tool(c, "land", { ...held, generation: 1, head, waitMs: 45_000, idempotencyKey: "mcp0-land" });
  }
  step("land", land.sc?.op?.state === "landed", { ms: land.ms, op: land.sc?.op, refused: land.sc?.rule, reason: land.sc?.reason, text: land.text, thrown: land.thrown });
  if (land.sc?.op?.state === "landed") landedLanes.push({ who: "driver", lane: held.lane, integration: land.sc.op.integration });

  const att = await tool(c, "attention", { cursor: cursor0 });
  step("attention after the cursor: the room's updates for this agent", att.isError === false && Array.isArray(att.sc?.items), { items: att.sc?.items?.map((i) => ({ kind: i.kind, text: i.text, open: i.open })), cursor: att.sc?.cursor, publishedThrough: att.sc?.publishedThrough });
  const ex = await tool(c, "explain", { act: land.sc?.id ?? claim.sc.id });
  step("explain the landing act", ex.isError === false && ex.sc?.act === (land.sc?.id ?? claim.sc.id), { act: ex.sc?.act, kind: ex.sc?.kind, outcome: ex.sc?.outcome, decisions: ex.sc?.decisions?.length });
  const rel = await tool(c, "release", { ...held, note: "MCP stage 0 drive: done", idempotencyKey: "mcp0-release" });
  step("release", rel.sc?.kind === "release", { refused: rel.sc?.rule, text: rel.text });
  await c.close();
}

// ------------------------------------------------------------ the cold agent

const TASK = [
  "You are connected to an Artroom room through the MCP server named artroom.",
  "Claim a lane, make a one-line change to the repository (add a file named claude/hello.md containing one line of your choice), propose it, and land it.",
  "Use plain git in this directory for cloning and pushing, as the artroom tools describe. Finish by releasing the lane, then report what you did in two sentences.",
].join(" ");

async function claudeRun(redeemed) {
  const dir = mkdtempSync(join(SCRATCH, "mcp0-cold-agent-"));
  // The exact config an agent's operator writes: the URL, and the bearer read from the environment, never in the file.
  const config = { mcpServers: { artroom: { type: "http", url: redeemed.mcp, headers: { Authorization: "Bearer ${ARTROOM_BEARER}" } } } };
  const configPath = join(dir, ".mcp0-artroom.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  chmodSync(configPath, 0o600);
  out.claude = { config, task: TASK };
  const args = [
    "-p",
    TASK,
    "--mcp-config",
    configPath,
    "--strict-mcp-config",
    "--setting-sources",
    "project,local",
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    "60",
    "--no-session-persistence",
    "--allowedTools",
    "mcp__artroom",
    "Bash(git:*)",
    "Bash(cd:*)",
    "Bash(ls:*)",
    "Bash(mkdir:*)",
    "Bash(cat:*)",
    "Bash(echo:*)",
    "Write",
    "Edit",
    "Read",
  ];
  const s = Date.now();
  const lines = [];
  const code = await new Promise((resolve) => {
    const child = spawn("claude", args, { cwd: dir, env: { ...process.env, ARTROOM_BEARER: redeemed.bearer, CLOUDFLARE_API_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const l of parts) if (l.trim()) lines.push(l);
    });
    child.stderr.on("data", (d) => log("claude stderr:", d.toString().slice(0, 300)));
    const timer = setTimeout(() => child.kill("SIGTERM"), 20 * 60_000);
    child.on("close", (c) => {
      clearTimeout(timer);
      if (buf.trim()) lines.push(buf);
      resolve(c);
    });
  });
  const events = lines.map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { unparsed: l.slice(0, 500) };
    }
  });
  // Any token the agent saw in a tool result is a secret too, and any fork it was given is the run's to clean.
  for (const l of lines) for (const m of l.matchAll(/"token\\?"\s*:\s*\\?"([^"\\]+)/g)) secrets.add(m[1]);
  for (const l of lines) for (const m of l.matchAll(/\/git\/[A-Za-z0-9._-]+\/([A-Za-z0-9._-]+)\.git/g)) forks.add(m[1]);
  const file = join(HERE, "results", `mcp-stage0-claude-${RUN}.jsonl`);
  writeFileSync(file, events.map((e) => redact(JSON.stringify(e))).join("\n") + "\n");
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  const result = events.find((e) => e.type === "result");
  const toolUses = events.flatMap((e) => (e.type === "assistant" ? (e.message?.content ?? []).filter((b) => b.type === "tool_use").map((b) => b.name) : []));
  const toolResults = events.flatMap((e) => (e.type === "user" ? (e.message?.content ?? []).filter((b) => b.type === "tool_result") : []));
  const refusals = toolResults.map((b) => JSON.stringify(b.content)).filter((t) => t.includes("Refused ("));
  out.claude.run = {
    exit: code,
    ms: Date.now() - s,
    transcript: `measure/results/mcp-stage0-claude-${RUN}.jsonl`,
    model: init?.model,
    claudeCodeVersion: init?.claude_code_version,
    mcpServers: init?.mcp_servers,
    artroomTools: init?.tools?.filter((t) => t.startsWith("mcp__artroom")),
    turns: result?.num_turns,
    costUsd: result?.total_cost_usd,
    usage: result?.usage,
    toolCalls: toolUses,
    refusals: refusals.map((t) => redact(t).slice(0, 300)),
    toolErrors: toolResults.filter((b) => b.is_error).length,
    result: result?.result,
    isError: result?.is_error,
  };
  step("claude -p: the cold agent's run", code === 0 && result?.is_error === false, clean(out.claude.run));
}

// ------------------------------------------------------------ the run

async function main() {
  log(`MCP stage 0 run ${RUN} against ${BASE}`);
  if (WITH_CHECKS) return checksMain();
  admin = newKeyPair();
  const recovery = newKeyPair();
  const name = `mcp-stage0-${Date.now().toString(36)}`;
  const d = await http("POST", "", { name, repo: { kind: "new" }, admin: { handle: "@mcp0-admin", key: admin.key }, recovery: recovery.key });
  if (d.body?.draft) secrets.add(d.body.draft);
  step("found: draft", d.status === 200, { status: d.status, repo: d.body.genesis?.repo, error: d.body.code, message: d.body.message });
  if (d.status !== 200) throw new Error("draft failed");
  const genesis = d.body.genesis;
  // Retained before `found` makes anything: every repository the room gets is named from this base.
  publicBase = genesis.repo.split("/")[1];
  out.repo = genesis.repo;
  const f = await http("POST", "/found", { genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft: d.body.draft });
  step("found: found", f.status === 200, { status: f.status, room: f.body.room, error: f.body.code, message: f.body.message });
  if (f.status !== 200) throw new Error("found failed");
  room = f.body.room;
  out.room = room;
  out.name = name;
  // The room's repository is the identity's incarnation `<base>-<step>`, the latest made, not the base name.
  const listed = readListing(await api("GET", `/repos?limit=${REPO_PAGE}&search=${publicBase}`), REPO_PAGE, isRepoRecord);
  canonical = listed.outcome === "done" ? incarnationOf(publicBase, listed.items.map((r) => r.name)) : null;
  out.canonical = canonical;
  step("found: the room's repository is an incarnation of its identity", canonical !== null, { base: publicBase, incarnation: canonical, listing: listed.outcome });
  if (!canonical) throw new Error("no incarnation of the room's identity was found");
  canonicalRemote = (await api("GET", `/repos/${canonical}`)).result?.remote ?? null;

  // Route guards on the deployed Worker.
  const mcpUrl = `${BASE}/v1/rooms/${room}/mcp`;
  const probe = (h) => fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...h }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  const none = await probe({});
  step("route: no bearer is 401 with WWW-Authenticate", none.status === 401 && /Bearer realm="artroom"/.test(none.headers.get("www-authenticate") ?? ""), { status: none.status, wwwAuthenticate: none.headers.get("www-authenticate") });
  const wrong = await probe({ authorization: "Bearer arb_not-a-token" });
  step("route: an unknown bearer is 401 invalid_token", wrong.status === 401 && /invalid_token/.test(wrong.headers.get("www-authenticate") ?? ""), { status: wrong.status, wwwAuthenticate: wrong.headers.get("www-authenticate") });

  const driver = await agent("@mcp-driver");
  await drive(driver);

  if (WITH_CLAUDE) {
    const cold = await agent("@claude-code");
    await claudeRun(cold);
  }
  if (canonicalRemote) {
    const main = await canonicalMain(canonicalRemote, canonical);
    out.main = main;
    step("canonical main after the run", /^[0-9a-f]{40}$/.test(main ?? ""), { main, landed: landedLanes });
  }
}

// ------------------------------------------------------------ review and check (request 9f81f372)

/** The imported repository of a --checks run: retained before it is created, for cleanup. */
let importName = null;

async function checksMain() {
  const L = "checks";
  const { operator, checker } = loadSpikeKeys(secrets);
  if (!operator || !checker) throw new Error("the spike operator or checker key is missing from the env file");

  // The repository, with the policy and the checker's configuration in its first commit.
  importName = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const seeded = await seedImportRepo({ api, git, dir: mkdtempSync(join(SCRATCH, "mcp0-import-")), name: importName, files: checkProject(RUN), onSecret: (t) => secrets.add(t) });
  step(`${L}: repository seeded in gitseq-spike-import; its creation token revoked`, seeded.pushed === true && seeded.active === 0, { name: importName, main: seeded.seeded, revoked: seeded.revoked, active: seeded.active ?? "unknown", errors: seeded.errors, stderr: seeded.stderr });
  if (!seeded.pushed) throw new Error("the import repository could not be seeded");
  canonical = importName;
  canonicalRemote = seeded.remote;

  // The room.
  admin = newKeyPair();
  const name = `mcp-stage0-checks-${Date.now().toString(36)}`;
  const d = await http("POST", "", importDraft({ operator, admin, recovery: newKeyPair(), ns: IMPORT_NS, repo: importName, handle: "@mcp0-admin", name }));
  if (d.body?.draft) secrets.add(d.body.draft);
  step(`${L}: draft`, d.status === 200, { status: d.status, repo: d.body.genesis?.repo, error: d.body.code, message: d.body.message });
  if (d.status !== 200) throw new Error("draft failed");
  const f = await http("POST", "/found", { genesis: d.body.genesis, sig: sign(admin.seed, "artroom-genesis-v1", d.body.genesis), draft: d.body.draft });
  step(`${L}: found`, f.status === 200, { status: f.status, room: f.body.room, error: f.body.code, message: f.body.message });
  if (f.status !== 200) throw new Error("found failed");
  room = f.body.room;
  Object.assign(out, { room, name, repo: d.body.genesis.repo });
  const ses = await requestAs(admin, { kind: "session", ttlSeconds: 1800 });
  if (ses.body?.token) secrets.add(ses.body.token);
  const adminRead = (path) => http("GET", `/${room}${path}`, undefined, ses.body?.token);

  // The checker service's key joins as the checker (client custody: it signs its own join).
  const secret = randomBytes(32);
  const inv = await act("roster", null, { op: "invite", member: "@checker", role: "checker", custody: "client", expiresAt: iso(Date.now() + 3600_000), secretHash: digestBytes(secret) });
  const joined = inv.status === 200 ? await actAs(checker, "roster", null, { op: "join", invitation: inv.body.id, secret: b64url(secret) }) : inv;
  step(`${L}: the checker service's key joins as @checker`, joined.status === 200, { key: checker.key, status: joined.status, refused: joined.body?.rule, reason: joined.body?.reason });

  // Two MCP agents: the author (role agent) and the reviewer (role maintainer).
  const author = await agent("@mcp-author");
  const reviewer = await agent("@mcp-reviewer", "maintainer", [...KINDS, "review"]);
  const a = await mcpClient(author, { pin: "2026-07-28" });
  const r = await mcpClient(reviewer, { pin: "2026-07-28" });

  const claim = await tool(a, "claim", { goal: "MCP checks: a function and its test", scope: CHECKED_PATHS, idempotencyKey: "mcp0-checks-claim" });
  step(`${L}: claim (MCP)`, !!claim.sc?.lane, { lane: claim.sc?.lane, refused: claim.sc?.rule, thrown: claim.thrown });
  if (!claim.sc?.lane) return;
  const held = { lane: claim.sc.lane, lease: claim.sc.lease.generation };
  let ws;
  for (let i = 0; i < 9; i++) {
    ws = await tool(a, "workspace", { ...held, waitMs: 20_000 });
    if (ws.sc?.grant || ws.sc?.refused || ws.sc?.op?.state === "failed" || ws.isError) break;
  }
  step(`${L}: workspace (MCP)`, !!ws.sc?.grant?.token, { remote: ws.sc?.grant?.remote, refused: ws.sc?.rule, thrown: ws.thrown });
  if (!ws.sc?.grant?.token) return;
  forks.add(basename(new URL(ws.sc.grant.remote).pathname, ".git"));
  const dir = mkdtempSync(join(SCRATCH, "mcp0-checks-"));
  const cl = await git(["clone", "-q", ws.sc.grant.remote, dir], { token: ws.sc.grant.token });
  for (const [path, text] of Object.entries(checkedChange(RUN))) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  await git(["add", "-A"], { cwd: dir });
  await git(["commit", "-q", "-m", "MCP checks: greet and its test"], { cwd: dir });
  const head = (await git(["rev-parse", "HEAD"], { cwd: dir })).stdout;
  const p = await git(["push", "-q", "origin", "HEAD:refs/heads/work"], { cwd: dir, token: ws.sc.grant.token });
  step(`${L}: git clone and push to the fork`, cl.code === 0 && p.code === 0, { head, clone: cl.code, push: p.code, stderr: p.stderr || cl.stderr || undefined });

  const pr = await tool(a, "propose", { ...held, head, expectedGeneration: 0, summary: "greet() and its test, for review and the tests check.", idempotencyKey: "mcp0-checks-propose" });
  step(`${L}: propose (MCP); it owes one check and one review`, obligationOf(pr.sc, "check")?.state === "open" && obligationOf(pr.sc, "review")?.state === "open", { generation: pr.sc?.generation, obligations: pr.sc?.obligations, refused: pr.sc?.rule, reason: pr.sc?.reason, thrown: pr.thrown });
  if (pr.sc?.generation !== 1) return;
  const asked = attentionFor((await tool(r, "attention", {})).sc, "review-requested", held.lane);
  step(`${L}: the reviewer's attention (MCP) asks for the review`, asked?.open === true, { item: asked });

  const early = await tool(a, "land", { ...held, generation: 1, head, idempotencyKey: "mcp0-checks-land-early" });
  step(`${L}: land (MCP) before the review is refused (obligation-open)`, early.sc?.refused === true && early.sc?.rule === "obligation-open", { rule: early.sc?.rule, reason: early.sc?.reason, thrown: early.thrown });

  // The Room dispatches the job over CHECKER_TESTS; the checker's signed check is admitted.
  let found = { accepted: [], refused: [] };
  const t = Date.now();
  while (Date.now() - t < 15 * 60_000) {
    found = checksIn((await adminRead("/log?limit=500")).body?.acts, checker.key);
    if (found.accepted.length || found.refused.length) break;
    await sleep(10_000);
  }
  step(`${L}: the Room dispatched the job, and the checker's signed check was admitted`, found.accepted[0]?.ok === true && found.accepted[0]?.check === CHECK, { waitedMs: Date.now() - t, check: found.accepted[0] ?? null, refused: found.refused });

  const rv = await tool(r, "review", { lane: held.lane, generation: 1, head, verdict: "approve", scope: CHECKED_PATHS, text: "Reviewed through MCP for the spike: right, and tested.", idempotencyKey: "mcp0-checks-review" });
  step(`${L}: the reviewer approves (MCP)`, rv.sc?.verdict === "approve", { fulfils: rv.sc?.fulfils, refused: rv.sc?.rule, reason: rv.sc?.reason, thrown: rv.thrown });

  const cursor = (await tool(a, "attention", {})).sc?.cursor;
  let land = await tool(a, "land", { ...held, generation: 1, head, waitMs: 45_000, idempotencyKey: "mcp0-checks-land" });
  for (let i = 0; i < 8 && land.sc?.op && !["landed", "failed", "aborted", "retryable", "unresolved"].includes(land.sc.op.state); i++) {
    land = await tool(a, "land", { ...held, generation: 1, head, waitMs: 45_000, idempotencyKey: "mcp0-checks-land" });
  }
  step(`${L}: land (MCP)`, land.sc?.op?.state === "landed", { op: land.sc?.op, refused: land.sc?.rule, reason: land.sc?.reason, thrown: land.thrown });
  if (land.sc?.op?.state === "landed") landedLanes.push({ who: "author", lane: held.lane, integration: land.sc.op.integration });
  const outcome = attentionFor((await tool(a, "attention", cursor ? { cursor } : {})).sc, "land-outcome", held.lane);
  step(`${L}: the author's attention (MCP) shows the landing's outcome`, !!outcome, { item: outcome });
  const main = await canonicalMain(canonicalRemote, canonical);
  step(`${L}: main is the landed integration`, !!land.sc?.op?.integration && main === land.sc.op.integration, { main, integration: land.sc?.op?.integration });
  await tool(a, "release", { ...held, note: "MCP checks: done", idempotencyKey: "mcp0-checks-release" });
  await a.close();
  await r.close();

  // The log publishes (R-LOG-8), and artroom verify replays it.
  const headSeq = (await adminRead("/log?limit=1")).body?.head ?? 0;
  let published = -1;
  for (const end = Date.now() + 5 * 60_000; Date.now() < end; await sleep(10_000)) {
    published = (await adminRead("/log?limit=1")).body?.publishedThrough ?? -1;
    if (published >= headSeq) break;
  }
  const tok = await mint(canonical, "read", 300);
  const v = await new Promise((done) =>
    execFile("node", [join(HERE, "../../log/src/cli.ts"), "verify", canonicalRemote, "--json"], { env: { PATH: process.env.PATH, HOME: tmpdir(), GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${tok.plaintext}` }, maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      done({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr: redact(stderr).slice(-800) }),
    ),
  );
  await revoke(tok.id);
  let report = null;
  try {
    report = JSON.parse(v.stdout);
  } catch {}
  out.verify = clean(report);
  step(`${L}: artroom verify replays the published log`, published >= headSeq && v.code === 0 && report?.ok === true, { publishedThrough: published, logHead: headSeq, exit: v.code, verifiedThrough: report?.verifiedThrough, decisionsReplayed: report?.decisionsReplayed, operator: report?.operator, failures: report?.failures, stderr: v.stderr || undefined });
}

// ------------------------------------------------------------ cleanup (review 66fec276)

/** The outcome of one Room answer: 200 done, another 4xx refused, anything else (no answer, 5xx) unknown. */
const roomOutcome = (status) => (status === 200 ? "done" : status >= 400 && status < 500 ? "refused" : "unknown");

/**
 * How the run ends one agent's bearer session (R-CRED-3): revoke its
 * room-held key with `act`, then see its bearer refused with `read`. Each
 * duty is `done`, `refused` or `unknown`. An agent whose redemption was
 * refused, or never sent, has no session. One whose redemption answer was
 * lost has a session nobody can name, so it stays unknown until its
 * delegation expires.
 */
export function sessionEnder({ act, read }) {
  return async (a) => {
    if (a.redeemed === "not-sent" || a.redeemed === "refused") return [{ duty: "end-session", member: a.member, outcome: "done", detail: `redemption ${a.redeemed}` }];
    if (a.redeemed !== "done") return [{ duty: "end-session", member: a.member, invitation: a.invitation, outcome: "unknown", detail: "the redemption's answer was lost; its key is unknown" }];
    const r = await act("roster", null, { op: "revoke-key", key: a.key, reason: "retired" });
    const after = await read(a.bearer);
    return [
      { duty: "revoke-agent-key", member: a.member, key: a.key, outcome: roomOutcome(r.status), detail: r.body?.rule ?? r.body?.code },
      { duty: "bearer-refused", member: a.member, key: a.key, outcome: after.status === 401 ? "done" : after.status === 200 ? "refused" : "unknown", detail: `status ${after.status}` },
    ];
  };
}

/**
 * The run's whole cleanup. Each agent's session is ended independently: an
 * exception for one is an unknown duty, and the rest still run. Then the
 * Artifacts state, by the shared rules (cleanup.mjs): minted tokens, the
 * canonical repository and its forks, known before any effect, even when an
 * inventory is refused, unknown, incomplete or malformed. With
 * `incarnations`, `canonical` is the identity's base name, and the run's
 * repositories are every incarnation `<base>-<step>`, the base name, and
 * their forks. `ok` only when every duty is done and the final inventory
 * proves nothing is left.
 */
export async function cleanupMcp({ api, canonical, expected = [], minted = new Map(), agents = [], endSession, incarnations = false }) {
  const sessions = [];
  for (const a of agents) {
    try {
      sessions.push(...(await endSession(a)));
    } catch (e) {
      sessions.push({ duty: "end-session", member: a.member, key: a.key ?? undefined, outcome: "unknown", detail: e.message });
    }
  }
  let artifacts;
  try {
    artifacts = await cleanupRun({ api, canonical, expected, minted, incarnations });
  } catch (e) {
    const d = { duty: "artifacts-cleanup", outcome: "unknown", detail: e.message };
    artifacts = { ok: false, duties: [d], reposLeft: null };
  }
  const duties = [...sessions.map(({ detail, ...d }) => (d.outcome === "done" ? d : { ...d, ...(detail ? { detail } : {}) })), ...artifacts.duties];
  const unresolved = duties.filter((d) => d.outcome !== "done");
  return { ok: unresolved.length === 0 && artifacts.ok === true, duties, unresolved, reposLeft: artifacts.reposLeft };
}

/**
 * The finalizer: run the cleanup, record its outcome on `out`, and return
 * the exit code. A cleanup that throws is a failed cleanup. The run is ok
 * (exit 0) only if the drive finished, every step passed, and cleanup is all
 * done (`smokeOk`, cleanup.mjs).
 */
export async function finishRun(out, failed, cleanup) {
  try {
    out.cleanup = await cleanup();
  } catch (e) {
    const d = { duty: "cleanup", outcome: "unknown", detail: redact(e.message) };
    out.cleanup = { ok: false, error: d.detail, duties: [d], unresolved: [d], reposLeft: null };
  }
  out.ok = smokeOk(out, failed);
  return out.ok ? 0 : 1;
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
  }
  const code = await finishRun(out, failed, () =>
    cleanupMcp({
      api,
      // The public room: every repository named from its identity's base, and the incarnation and forks it knows.
      // With --checks, the imported repository (its own name) and its forks, in the import namespace.
      canonical: WITH_CHECKS ? importName : publicBase,
      expected: WITH_CHECKS ? (importName ? [importName, ...forks] : []) : publicBase ? [canonical ?? publicBase, ...forks] : [],
      incarnations: !WITH_CHECKS,
      minted,
      agents,
      endSession: sessionEnder({ act, read: (bearer) => http("GET", `/${room}/attention`, undefined, bearer) }),
    }),
  );
  for (const d of out.cleanup.duties ?? []) log(`cleanup ${d.duty}${d.member ? ` ${d.member}` : ""}${d.repo ? ` ${d.repo}` : ""}${d.token ? ` token ${d.token}` : ""}: ${d.outcome}${d.detail ? ` (${d.detail})` : ""}`);
  log(`cleanup ok ${out.cleanup.ok}; repositories left ${JSON.stringify(out.cleanup.reposLeft)}; unresolved ${out.cleanup.unresolved?.length ?? "?"}`);
  out.ms = Date.now() - t0;
  const dir = join(HERE, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `mcp-stage0-${WITH_CHECKS ? "checks-" : ""}${RUN}.json`);
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`ok ${out.ok}; result ${file}`);
  process.exit(code);
}
