#!/usr/bin/env node
// Request 5a7290b9: the largest git object an Artifacts repository accepts
// in a push. The live matrix (run.mjs) found the log push refused with
// `artifacts_git_receive_pack_object_too_large` once the active segment
// blob reached 32.57 MiB, while 26.44 MiB was accepted. This script pushes
// one blob per ref, of sizes around 32 MiB, both incompressible and highly
// compressible, and records which are accepted. Then it revokes its token
// and deletes the repository.
//
//   node measure/logbig/object-limit.mjs

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s) => String(s).replace(TOKEN_RE, "<token>");
const MiB = 1024 * 1024;
const REPO = `artroom-lb-objlimit-${Date.now().toString(36)}`;
const out = { date: new Date().toISOString(), namespace: NS, repo: REPO, pushes: [] };

function oauth() {
  return /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))[1];
}
async function api(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, { method, headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-lb-logbig/1.0" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return r.json().catch(() => ({}));
}

const sizes = [
  ["random", 30 * MiB],
  ["random", 32 * MiB - 1024],
  ["random", 32 * MiB],
  ["random", 32 * MiB + 1],
  ["random", 33 * MiB],
  ["text", 32 * MiB + 1],
  ["text", 40 * MiB],
];

let tokenId = null;
try {
  const created = await api("POST", "/repos", { name: REPO, default_branch: "main" });
  if (!created.success) throw new Error(`create: ${JSON.stringify(created.errors)}`);
  const remote = created.result.remote;
  const tok = (await api("POST", "/tokens", { repo: REPO, scope: "write", ttl: 900 })).result;
  tokenId = tok.id;
  const dir = mkdtempSync(join(tmpdir(), "logbounded-objlimit-"));
  const env = { ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "lb", GIT_AUTHOR_EMAIL: "lb@invalid", GIT_COMMITTER_NAME: "lb", GIT_COMMITTER_EMAIL: "lb@invalid", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${tok.plaintext}` };
  const git = (args, input) => execFileSync("git", ["-C", dir, ...args], { env, input, encoding: input ? undefined : "utf8", maxBuffer: 64 * MiB });
  git(["init", "-q"]);
  for (const [kind, size] of sizes) {
    const data = kind === "random" ? randomBytes(size) : Buffer.from("A line of an Artroom log segment, compressible.\n".repeat(Math.ceil(size / 48))).subarray(0, size);
    const blob = git(["hash-object", "-w", "--stdin"], data).toString().trim();
    const tree = git(["mktree"], Buffer.from(`100644 blob ${blob}\tsegment\n`)).toString().trim();
    const commit = git(["commit-tree", tree, "-m", `${kind} ${size}`]).trim();
    const ref = `refs/heads/${kind}-${size}`;
    const t = Date.now();
    const p = spawnSync("git", ["-C", dir, "-c", "credential.helper=", "push", remote, `${commit}:${ref}`], { env, encoding: "utf8" });
    const rec = { kind, bytes: size, mib: size / MiB, accepted: p.status === 0, ms: Date.now() - t, stderr: redact(p.stderr).split("\n").filter((l) => /remote:|error|fatal|too_large/.test(l)).slice(0, 4) };
    out.pushes.push(rec);
    console.log(JSON.stringify(rec));
  }
} catch (e) {
  out.error = redact(e instanceof Error ? e.stack : String(e));
  console.log(out.error);
} finally {
  if (tokenId) out.revoked = (await api("DELETE", `/tokens/${tokenId}`)).success === true;
  out.repoDeleted = (await api("DELETE", `/repos/${REPO}`)).success === true;
  console.log(JSON.stringify({ revoked: out.revoked, repoDeleted: out.repoDeleted }));
  mkdirSync(join(HERE, "results"), { recursive: true });
  writeFileSync(join(HERE, "results", `object-limit-${out.date.replace(/[:.]/g, "-")}.json`), redact(JSON.stringify(out, null, 2)) + "\n");
}
