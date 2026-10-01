// Live: lane L's real LogPublisher and verifyLog against a real Artifacts
// repo, through the deployed Worker artroom-lb-git, with the read and
// write paths lane A's log remote uses:
//   push       → the sandbox's pushLog   (60 s write token, revoked)
//   readRef    → the sandbox's readLogRef (60 s read token, revoked)
//   readObject → the binding's readCommit / readTree / readBlob by ID,
//                re-encoded exactly as packages/room/src/logremote.ts does
//                and accepted only if it hashes to the ID.
// Then the repo is deleted. Prints no token.
//
//   LB_LIVE=1 npx vitest run --config vitest.live.config.ts

import { afterAll, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sha } from "@generalbusiness/artroom-contract";
import { encodeCommit, encodeTree, gitObject, type GitObject, type GitRemote, type ObjectType, type PushOutcome, type TreeEntry } from "../../log/src/git.ts";
import { LOG_REF } from "../../log/src/entries.ts";
import { verifyLog } from "../../log/src/verify.ts";
import { goldenLog } from "../../log/test/support/room-sim.ts";

const LIVE = process.env["LB_LIVE"] === "1";
const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const URL_ = process.env["LB_URL"] ?? "https://artroom-lb-git.inguz.workers.dev";
const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN_RE, "<token>");
const RUN = Date.now().toString(36);
const ROOM = `lb-loglive-${RUN}`;
const REPO = `artroom-lb-loglive-${RUN}`;
const out: { calls: Record<string, number>; tokens: { revoked: number; notRevoked: number; activeAfter: number[] }; laneAReadFailures: string[]; [k: string]: unknown } = {
  calls: {}, tokens: { revoked: 0, notRevoked: 0, activeAfter: [] }, laneAReadFailures: [],
};

async function h(route: string, body: Record<string, unknown>): Promise<any> {
  out.calls[route] = (out.calls[route] ?? 0) + 1;
  const key = readFileSync(process.env["LB_KEY_FILE"] ?? join(homedir(), ".artroom-lb-key"), "utf8").trim();
  const r = await fetch(`${URL_}/h/${route}`, { method: "POST", headers: { "x-lb-key": key, "content-type": "application/json", "user-agent": "artroom-lb-live/1.0" }, body: JSON.stringify({ room: ROOM, ...body }) });
  const j = (await r.json()) as any;
  if (r.status !== 200) throw new Error(`${route}: ${r.status} ${redact(JSON.stringify(j))}`);
  if ("revoked" in j) {
    if (j.revoked === true) out.tokens.revoked++;
    else out.tokens.notRevoked++;
    out.tokens.activeAfter.push(j.activeTokens);
  }
  return j;
}
function oauth(): string {
  return /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))![1]!;
}
async function api(method: string, path: string): Promise<any> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, { method, headers: { authorization: `Bearer ${oauth()}`, "user-agent": "artroom-lb-live/1.0" } });
  return r.json().catch(() => ({}));
}
const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

/** The binding's raw reads, re-encoded in lane A's order (readCommit, then readTree, then readBlob). */
function laneARead(sha: string, raw: any): { type: ObjectType; data: Uint8Array } {
  const exact = (type: ObjectType, data: Uint8Array) => {
    if (gitObject(type, data).sha !== sha) throw new Error(`object ${sha} could not be read exactly as ${type}`);
    return { type, data };
  };
  if (raw.commit.error) throw new Error(`readCommit threw: ${raw.commit.error}`);
  const c = raw.commit.value;
  if (c && c.author && c.committer) {
    const who = (p: { name: string; email: string }, at: number) => `${p.name} <${p.email}> ${at} +0000`;
    return exact("commit", encodeCommit({ tree: c.treeHash, parents: c.parents, author: who(c.author, c.authoredAt ?? c.committedAt), committer: who(c.committer, c.committedAt), message: `${c.message ?? ""}\n` }));
  }
  if (raw.tree.error) throw new Error(`readTree threw: ${raw.tree.error}`);
  const t = raw.tree.value;
  if (t) return exact("tree", encodeTree(t.map((e: any) => ({ name: e.name, mode: e.mode as TreeEntry["mode"], sha: e.hash as Sha }))));
  if (raw.blob.error) throw new Error(`readBlob threw: ${raw.blob.error}`);
  if (raw.blob.value !== null) return exact("blob", new Uint8Array(Buffer.from(raw.blob.value, "base64")));
  throw new Error(`object ${sha} not found`);
}

class LiveRemote implements GitRemote {
  async readRef(ref: string): Promise<Sha | null> {
    const r = await h("logref", { ref });
    if ("threw" in r) throw new Error(`readLogRef: ${r.threw}`);
    return r.ref as Sha | null;
  }
  async readObject(sha: Sha) {
    const r = await h("logobjects", { shas: [sha] });
    try {
      return laneARead(sha, r.objects[sha]);
    } catch (e) {
      out.laneAReadFailures.push(`${sha}: ${(e as Error).message}`);
      throw e;
    }
  }
  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    const r = await h("logpush", { objects: objects.map((o) => ({ type: o.type, data: b64url(o.data) })), ref, next, lease });
    if ("threw" in r.outcome) throw new Error(`pushLog: ${r.outcome.threw}`);
    return r.outcome as PushOutcome;
  }
}

describe.skipIf(!LIVE)("live: lane L's log through artroom-lb-git", () => {
  afterAll(async () => {
    await h("reset", {}).catch(() => undefined);
    const repos = (await api("GET", `/repos?limit=200&search=${REPO}`)).result ?? [];
    out["deleted"] = [];
    for (const r of repos) {
      const toks = (await api("GET", `/repos/${r.name}/tokens?state=active&per_page=100`)).result ?? [];
      for (const t of toks) await api("DELETE", `/tokens/${t.id}`);
      const d = await api("DELETE", `/repos/${r.name}`);
      (out["deleted"] as unknown[]).push({ name: r.name, deleted: d.success, tokensRevokedAtCleanup: toks.length });
    }
    const file = join(HERE, "results", `log-live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, redact(JSON.stringify(out, null, 2)) + "\n");
    console.log(redact(JSON.stringify(out)));
  });

  test("publish via pushLog, read back via readLogRef, objects by ID from the binding, and verifyLog passes", async () => {
    const created = await h("create", { repo: REPO });
    const seed = mkdtempSync(join(tmpdir(), "lb-loglive-seed-"));
    const env = { PATH: process.env["PATH"], HOME: seed, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "agent", GIT_AUTHOR_EMAIL: "agent@invalid", GIT_COMMITTER_NAME: "agent", GIT_COMMITTER_EMAIL: "agent@invalid",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${created.seedToken}` };
    try {
      for (const args of [["init", "-q", "-b", "main"], ["commit", "-q", "--allow-empty", "-m", "seed"], ["push", "-q", created.remote, "HEAD:refs/heads/main"]]) execFileSync("git", ["-c", "credential.helper=", ...args], { cwd: seed, env, stdio: "ignore" });
    } finally {
      rmSync(seed, { recursive: true, force: true });
    }
    await h("init", { repo: REPO });

    const remote = new LiveRemote();
    expect(await remote.readRef(LOG_REF)).toBe(null); // absent before the first publication
    const t0 = Date.now();
    const { c1, c2, c3 } = await goldenLog(remote);
    out["publishMs"] = Date.now() - t0;
    out["commits"] = [c1.commit, c2.commit, c3.commit];
    expect(await remote.readRef(LOG_REF)).toBe(c3.commit);
    const t1 = Date.now();
    const report = await verifyLog(remote);
    out["verifyMs"] = Date.now() - t1;
    out["verify"] = { ok: report.ok, head: report.head, commits: report.commits, verifiedThrough: report.verifiedThrough, publishedThrough: report.publishedThrough, failures: report.failures };
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, head: c3.commit, commits: 3 });
    // Refusals: another ref.
    const other = await h("logref", { ref: "refs/heads/main" });
    out["otherRefRead"] = other.threw ? "refused" : other;
    expect(other.threw).toMatch(/only refs\/artroom\/log/);
    expect(out.laneAReadFailures).toEqual([]);
    expect(out.tokens.notRevoked).toBe(0);
    expect(out.tokens.activeAfter.every((n) => n === 0)).toBe(true);
  });
});
