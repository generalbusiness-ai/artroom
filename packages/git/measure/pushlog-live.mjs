#!/usr/bin/env node
// Live run of the publisher sandbox's pushLog (request 090a0eca) against a
// real Artifacts repo, through the deployed Worker `artroom-lb-git`. The
// harness route calls pushLog the way lane A's log remote does: a 60 s
// write token, the call, then revoke.
//
//   LB_KEY_FILE=~/.artroom-lb-key node measure/pushlog-live.mjs
//
// It publishes two log commits (no lease, then on the first), shows a lease
// mismatch both ways, a commit that is not the next one, and a ref other
// than refs/artroom/log; after every push it checks the token was revoked
// and reads the ref back through the binding. Then it deletes the repo and
// saves a redacted result. Prints no token.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
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
const out = { steps: [], checks: {} };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const RUN = Date.now().toString(36);
const ROOM = `lb-pushlog-${RUN}`;
const REPO = `artroom-lb-pushlog-${RUN}`;
const LOG_REF = "refs/artroom/log";

async function h(route, body) {
  const s = Date.now();
  const r = await fetch(`${URL_}/h/${route}`, { method: "POST", headers: { "x-lb-key": KEY, "content-type": "application/json", "user-agent": "artroom-lb-live/1.0" }, body: JSON.stringify({ room: ROOM, ...body }) });
  const j = await r.json();
  out.steps.push({ route, status: r.status, clientMs: Date.now() - s, result: JSON.parse(redact(JSON.stringify({ ...j, seedToken: undefined, ...(route === "logpush" ? { sent: { objects: body.objects.length, next: body.next, lease: body.lease, ref: body.ref ?? LOG_REF } } : {}) }))) });
  if (r.status !== 200) throw new Error(`${route}: ${r.status} ${redact(JSON.stringify(j))}`);
  return j;
}
function oauth() {
  return /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))[1];
}
async function api(method, path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, { method, headers: { authorization: `Bearer ${oauth()}`, "user-agent": "artroom-lb-live/1.0" } });
  return r.json().catch(() => ({}));
}

// Git objects as lane L builds them, sent as unpadded base64url (lane A's b64url).
const b64url = (b) => Buffer.from(b).toString("base64url");
function object(type, body) {
  const sha = createHash("sha1").update(Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body])).digest("hex");
  return { type, data: body, sha };
}
function logCommit(text, parent) {
  const blob = object("blob", Buffer.from(text));
  const tree = object("tree", Buffer.concat([Buffer.from("100644 entries.jsonl\0"), Buffer.from(blob.sha, "hex")]));
  const commit = object("commit", Buffer.from(`tree ${tree.sha}\n${parent ? `parent ${parent}\n` : ""}author artroom <room@invalid> 1790000000 +0000\ncommitter artroom <room@invalid> 1790000000 +0000\n\n${text}\n`));
  return { commit: commit.sha, objects: [blob, tree, commit].map((o) => ({ type: o.type, data: b64url(o.data) })) };
}
async function push(name, c, lease, extra = {}) {
  const r = await h("logpush", { objects: c.objects, next: c.commit, lease, ...extra });
  log(`${name}: ${JSON.stringify(r.outcome)} revoked=${r.revoked} activeTokens=${r.activeTokens} readBack=${r.readBack} push=${r.ms.push}ms`);
  return r;
}

async function main() {
  try {
    await run();
  } finally {
    await cleanup();
  }
  if (!Object.values(out.checks).every(Boolean) || Object.keys(out.checks).length === 0) process.exit(2);
}

async function run() {
  await h("create", { repo: REPO });
  const init = await h("init", { repo: REPO });
  log(`canonical ${REPO} sealed (revoked ${init.revoked}); main ${init.main}`);
  const c1 = logCommit("one", null);
  const c2 = logCommit("two", c1.commit);
  const stale = logCommit("stale", c1.commit);
  const orphan = logCommit("orphan", null);
  const c3 = logCommit("three", c2.commit);

  const p1 = await push("first publication, no lease", c1, null);
  const p2 = await push("second, on the first", c2, c1.commit);
  const p3 = await push("stale lease (another writer moved the ref)", stale, c1.commit);
  const p4 = await push("no lease onto an existing log", orphan, null);
  const p5 = await push("not the next commit (parent is not the lease)", orphan, c2.commit);
  const p6 = await push("another ref", c3, c2.commit, { ref: "refs/heads/main" });
  const p7 = await push("third, on the second", c3, c2.commit);
  const all = [p1, p2, p3, p4, p5, p6, p7];
  out.checks = {
    landed: p1.outcome.ok === true && p1.readBack === c1.commit && p2.outcome.ok === true && p2.readBack === c2.commit && p7.outcome.ok === true && p7.readBack === c3.commit,
    leaseMismatch: p3.outcome.reason === "lease-mismatch" && p3.outcome.current === c2.commit && p4.outcome.reason === "lease-mismatch" && p4.outcome.current === c2.commit,
    notNextSendsNothing: p5.outcome.reason === "unknown" && /nothing was sent/.test(p5.outcome.detail) && p5.readBack === c2.commit,
    otherRefRefused: p6.outcome.reason === "unknown" && p6.readBack === c2.commit,
    everyTokenRevoked: all.every((p) => p.revoked === true && p.activeTokens === 0),
  };
  log("checks", out.checks);
}

async function cleanup() {
  // The container, every token and the repo, even after a failure.
  await h("reset", {}).catch((e) => log(`reset: ${e.message}`));
  const repos = (await api("GET", `/repos?limit=200&search=${REPO}`)).result ?? [];
  for (const r of repos) {
    const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
    for (const t of toks) await api("DELETE", `/tokens/${t.id}`);
    const d = await api("DELETE", `/repos/${r.name}`);
    log(`deleted ${r.name}: ${d.success} (revoked ${toks.length} tokens first)`);
    out.deleted = [...(out.deleted ?? []), { name: r.name, deleted: d.success, tokensRevoked: toks.length }];
  }
  const file = join(HERE, "results", `pushlog-live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
  log(`saved ${file}`);
}

main().catch((e) => {
  console.error(redact(e?.stack ?? e));
  process.exit(1);
});
