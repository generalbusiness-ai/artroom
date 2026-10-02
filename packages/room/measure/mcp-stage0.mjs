#!/usr/bin/env node
// MCP plan stage 0 (request 8ae3b2dc): drive the deployed spike Room through
// its MCP endpoint, POST /v1/rooms/:room/mcp, with a bearer session, and
// optionally hand a second bearer to a cold Claude Code agent.
//
//   node packages/room/measure/mcp-stage0.mjs            # the scripted drive
//   node packages/room/measure/mcp-stage0.mjs --claude   # and the cold agent
//
// Steps: found a room (public founding); invite and redeem room-custody
// agents (R-CRED-3); with the official MCP client, pinned to 2026-07-28, and
// once in legacy mode: list the tools, claim, get the workspace, push a
// one-line commit with git, propose, check that a refusal conforms to the
// advertised schema, land, read attention with its cursor, explain, release.
// With --claude: write an MCP config that names the URL and reads the bearer
// from the environment, run `claude -p` on a short task in an empty
// directory, and check that its lane landed. Then clean up: revoke the
// agents' keys (ending their bearer sessions), revoke every active
// Artifacts token on the test repositories and delete them.
//
// It needs hugh's wrangler OAuth login (Artifacts REST). It prints no token
// and saves redacted results in measure/results/: the run as JSON, and the
// Claude Code transcript as JSON lines.

import { execFile, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { b64url, digestBytes, newKeyPair, randomBytes, randomToken, sign } from "../src/crypto.ts";
import { iso } from "../src/ids.ts";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const BASE = process.env.SPIKE_URL ?? "https://artroom-spike-room.inguz.workers.dev";
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MCP0_SCRATCH ?? tmpdir();
const WITH_CLAUDE = process.argv.includes("--claude");
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
const out = { run: RUN, url: BASE, namespace: NS, steps: [], cleanup: {} };
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
function act(kind, target, body) {
  const envelope = { v: 1, room, actor: admin.key, kind, target, body, idempotencyKey: randomToken().slice(0, 24) };
  return http("POST", `/${room}/acts`, { envelope, sig: sign(admin.seed, "artroom-envelope-v1", envelope) });
}

/** Invite and redeem a room-custody agent (R-CRED-3). The bearer is kept in `secrets`, never printed. */
async function agent(handle) {
  const bytes = randomBytes(32);
  const inv = await act("roster", null, { op: "invite", member: handle, role: "agent", custody: "room", expiresAt: iso(Date.now() + 3600_000), secretHash: digestBytes(bytes), session: { kinds: KINDS, lanes: "*", ttlSeconds: 3600 } });
  if (inv.status !== 200) throw new Error(`invite ${handle}: ${JSON.stringify(inv.body)}`);
  const secret = b64url(bytes);
  secrets.add(secret);
  const r = await http("POST", `/${room}/redeem`, { custody: "room", invitation: inv.body.id, secret });
  if (r.body?.bearer) secrets.add(r.body.bearer);
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
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, {
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
  return r.result;
}
const revoke = async (id) => (await api("DELETE", `/tokens/${id}`)).success === true;

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

let canonical = null;
let canonicalRemote = null;
const agents = [];
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
  // Any token the agent saw in a tool result is a secret too.
  for (const l of lines) for (const m of l.matchAll(/"token"\s*:\s*"([^"]+)"/g)) secrets.add(m[1]);
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
  admin = newKeyPair();
  const recovery = newKeyPair();
  const name = `mcp-stage0-${Date.now().toString(36)}`;
  const d = await http("POST", "", { name, repo: { kind: "new" }, admin: { handle: "@mcp0-admin", key: admin.key }, recovery: recovery.key });
  if (d.body?.draft) secrets.add(d.body.draft);
  step("found: draft", d.status === 200, { status: d.status, repo: d.body.genesis?.repo, error: d.body.code, message: d.body.message });
  if (d.status !== 200) throw new Error("draft failed");
  const genesis = d.body.genesis;
  canonical = genesis.repo.split("/")[1];
  out.repo = genesis.repo;
  const f = await http("POST", "/found", { genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft: d.body.draft });
  step("found: found", f.status === 200, { status: f.status, room: f.body.room, error: f.body.code, message: f.body.message });
  if (f.status !== 200) throw new Error("found failed");
  room = f.body.room;
  out.room = room;
  out.name = name;
  canonicalRemote = (await api("GET", `/repos/${canonical}`)).result?.remote ?? null;

  // Route guards on the deployed Worker.
  const mcpUrl = `${BASE}/v1/rooms/${room}/mcp`;
  const probe = (h) => fetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...h }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  const none = await probe({});
  step("route: no bearer is 401 with WWW-Authenticate", none.status === 401 && /Bearer realm="artroom"/.test(none.headers.get("www-authenticate") ?? ""), { status: none.status, wwwAuthenticate: none.headers.get("www-authenticate") });
  const wrong = await probe({ authorization: "Bearer arb_not-a-token" });
  step("route: an unknown bearer is 401 invalid_token", wrong.status === 401 && /invalid_token/.test(wrong.headers.get("www-authenticate") ?? ""), { status: wrong.status, wwwAuthenticate: wrong.headers.get("www-authenticate") });

  const driver = await agent("@mcp-driver");
  agents.push(driver);
  await drive(driver);

  if (WITH_CLAUDE) {
    const cold = await agent("@claude-code");
    agents.push(cold);
    await claudeRun(cold);
    const lanes = await http("GET", `/${room}/lanes?limit=50`, undefined, cold.bearer);
    const theirs = (lanes.body.items ?? []).filter((l) => l.claim?.by?.member === "@claude-code" || l.holder === "@claude-code" || JSON.stringify(l).includes("@claude-code"));
    step("the cold agent's lanes, read with its bearer", lanes.status === 200, { lanes: theirs.map((l) => ({ lane: l.lane, state: l.state, generation: l.generation, landing: l.landing })) });
  }
  if (canonicalRemote) {
    const main = await canonicalMain(canonicalRemote, canonical);
    out.main = main;
    step("canonical main after the run", /^[0-9a-f]{40}$/.test(main ?? ""), { main, landed: landedLanes });
  }
}

async function cleanup() {
  // End every bearer session: revoke the agents' room-held keys (R-CRED-3).
  out.cleanup.agents = [];
  for (const a of agents) {
    const r = await act("roster", null, { op: "revoke-key", key: a.key, reason: "retired" }).catch((e) => ({ status: 0, body: { message: e.message } }));
    const after = await http("GET", `/${room}/attention`, undefined, a.bearer);
    out.cleanup.agents.push({ member: a.member, revoked: r.status === 200, rule: r.body?.rule, bearerAfter: after.status });
  }
  if (!canonical) return;
  const repos = ((await api("GET", `/repos?limit=200&search=${canonical}`)).result ?? []).filter((r) => r.name === canonical || r.name.startsWith(`${canonical}--`));
  out.cleanup.repos = [];
  for (const r of repos) {
    const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
    let revoked = 0;
    for (const t of toks) if (await revoke(t.id)) revoked++;
    const d = await api("DELETE", `/repos/${r.name}`);
    out.cleanup.repos.push({ repo: r.name, activeTokens: toks.length, revoked, deleted: d.success === true });
    log(`cleanup ${r.name}: ${toks.length} active tokens, ${revoked} revoked, deleted ${d.success === true}`);
  }
  out.cleanup.reposLeft = ((await api("GET", `/repos?limit=200&search=${canonical}`)).result ?? []).filter((r) => r.name === canonical || r.name.startsWith(`${canonical}--`)).map((r) => r.name);
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
  out.ok = !failed && out.steps.every((s) => s.ok) && (out.cleanup.reposLeft ?? []).length === 0 && (out.cleanup.agents ?? []).every((a) => a.revoked && a.bearerAfter === 401);
  out.ms = Date.now() - t0;
  const dir = join(HERE, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `mcp-stage0-${RUN}.json`);
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`ok ${out.ok}; result ${file}`);
  process.exit(out.ok ? 0 : 1);
}
