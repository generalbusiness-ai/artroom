#!/usr/bin/env node
// Request 5a7290b9's live matrix, through the deployed `artroom-lb-logbig`
// (worker.ts): a real Room on Artifacts namespace gitseq-spike, entries
// near the 2 MB row bound in the active segment, and a restart in the
// middle of a publication.
//
//   MODE=under32 LB_KEY_FILE=<file> node measure/logbig/run.mjs
//   MODE=over64  LB_KEY_FILE=<file> node measure/logbig/run.mjs
//
// 1. Found a room (public founding: the Room creates its repository).
// 2. Admit claims whose envelopes are near the 64 KiB bound (R-SIG-6)
//    through the Room's admission, and seal three `notified` events near
//    the 2 MB row bound, until the active segment reaches the mode's size:
//    31.5 MiB (under32), the most Artifacts accepts as one object, or
//    64.5 MiB (over64). Artifacts refuses any object over 32 MiB
//    (object-limit.mjs), so over64 stages the whole segment through the
//    Room and then records the refusal.
// 3. Start a publication of the whole active segment and reset the Room's
//    instance during it; publish again and check the Room resumes the same
//    pending commit.
// 4. under32: publish once more, then fetch refs/artroom/log under a read
//    token and run `artroom verify`. over64: verify what was published.
// 5. Revoke every token on the repository and delete it.
// Results go to measure/logbig/results/, with tokens redacted.

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ACCT = "6e953d231f1c9aadffbf59537a82e13a";
const NS = "gitseq-spike";
const URL_ = process.env.LB_URL ?? "https://artroom-lb-logbig.inguz.workers.dev";
const KEY = readFileSync(process.env.LB_KEY_FILE, "utf8").trim();
const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_PKG = join(HERE, "../../../log");
const TOKEN_RE = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s) => String(s).replace(TOKEN_RE, "<token>");
const MiB = 1024 * 1024;
// under32: the largest active segment Artifacts accepts, published end to end. over64: an active
// segment over 64 MiB, staged through the Room in full; Artifacts then refuses the push.
const MODE = process.env.MODE ?? "under32";
const TARGET = Number(process.env.TARGET_MIB ?? (MODE === "under32" ? 31.5 : 64.5)) * MiB;
const t0 = Date.now();
const out = { date: new Date().toISOString(), mode: MODE, targetMiB: TARGET / MiB, worker: "artroom-lb-logbig", namespace: NS, steps: [], publications: [] };
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
const save = () => {
  mkdirSync(join(HERE, "results"), { recursive: true });
  writeFileSync(join(HERE, "results", `logbig-${MODE}-${out.date.replace(/[:.]/g, "-")}.json`), redact(JSON.stringify(out, null, 2)) + "\n");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lb(route, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${URL_}/lb/${route}`, { method: "POST", headers: { "x-lb-key": KEY, "content-type": "application/json", "user-agent": "artroom-lb-logbig/1.0" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.status !== 200) throw new Error(`${route}: ${r.status} ${JSON.stringify(j)}`);
      return j;
    } catch (e) {
      if (attempt >= 5 || route === "claims") throw e;
      log(`retry ${route}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}
function oauth() {
  return /^oauth_token = "([^"]+)"/m.exec(readFileSync(join(homedir(), "Library/Preferences/.wrangler/config/default.toml"), "utf8"))[1];
}
async function api(method, path, body) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/artifacts/namespaces/${NS}${path}`, { method, headers: { authorization: `Bearer ${oauth()}`, "content-type": "application/json", "user-agent": "artroom-lb-logbig/1.0" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => ({}));
    if (JSON.stringify(j.errors ?? []).includes("10400") && attempt < 6) {
      await sleep(attempt * 2000);
      continue;
    }
    return j;
  }
}

const status = (room) => lb("status", { room });

/**
 * Publish as the Room's alarm would: a failed publication is retried with the same cohort, up to
 * three times, each attempt recorded. Then a failure ends the run, unless `allowError`, when the
 * last attempt is returned.
 */
async function publish(room, label, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await publishOnce(room, attempt === 1 ? label : `${label} (retry ${attempt - 1})`, { ...opts, allowError: true, abortMs: attempt === 1 ? opts.abortMs : undefined, abortStages: attempt === 1 ? opts.abortStages : undefined });
    if (r.reset || !r.rec.error) return r;
    if (attempt >= 4) {
      if (opts.allowError) return r;
      r.rec.probe = await lb("pushprobe", { room });
      log("push probe", r.rec.probe);
      save();
      throw new Error(`publication failed: ${r.rec.error}`);
    }
    await sleep(3000);
  }
}

/** Start a publication and wait for its outcome (polling keeps the instance busy). */
async function publishOnce(room, label, opts = {}) {
  const before = await status(room);
  if (opts.abortStages !== undefined) await lb("abortstages", { room, k: opts.abortStages });
  const started = await lb("publish", { room });
  if (opts.abortMs !== undefined) await lb("abort", { room, ms: opts.abortMs });
  let s;
  for (;;) {
    await sleep(2000);
    s = await status(room);
    if (!s.last || s.last.startedAt !== started.startedAt) {
      // A new instance: the old one was reset during the publication.
      const rec = { label, reset: true, before: { head: before.head, publishedThrough: before.publishedThrough }, after: { publishedThrough: s.publishedThrough, pending: s.pending, publicationError: s.publicationError, heap: s.heap }, ms: Date.now() - started.startedAt };
      out.publications.push(rec);
      log(label, "instance reset", { publishedThrough: s.publishedThrough, pendingThrough: s.pending?.through, expected: s.pending?.expected });
      return { reset: true, status: s, rec };
    }
    if (s.last.finishedAt) break;
  }
  const rec = {
    label,
    before: { head: before.head, publishedThrough: before.publishedThrough, activeSegment: before.activeSegment, pending: before.pending },
    result: s.last.result ?? null,
    error: s.last.error ?? null,
    ms: s.last.finishedAt - s.last.startedAt,
    after: { publishedThrough: s.publishedThrough, logCommit: s.logCommit, activeSegment: s.activeSegment, publicationError: s.publicationError },
    publisher: s.publisher,
    heap: s.heap,
  };
  out.publications.push(rec);
  log(label, { through: rec.result?.through, ms: rec.ms, error: rec.error, segmentMiB: (s.activeSegment.bytes / MiB).toFixed(2), stats: s.publisher?.stats });
  save();
  return { reset: false, status: s, rec };
}

try {
  const adminSeed = randomBytes(32).toString("hex");
  const recoverySeed = randomBytes(32).toString("hex");
  const f = await lb("found", { name: `lb-logbig-${Date.now().toString(36)}`, adminSeed, recoverySeed });
  out.room = f.room;
  out.repo = f.repo;
  log("founded", f);
  save();

  // Load: claims near the envelope bound and three entries near the row bound, until the active
  // segment reaches the mode's size. `under32` publishes every ~100 entries; `over64` publishes
  // once early, so that its large publication has a parent, and then not until the segment is full size.
  const big = new Set(MODE === "under32" ? [100, 200, 300] : [300, 600, 850]);
  const every = MODE === "under32" ? 100 : Infinity;
  let claims = 0;
  let lastPublishedHead = 1;
  let s = await status(f.room);
  const loadStart = Date.now();
  while (s.activeSegment.bytes < TARGET) {
    const n = 10;
    const r = await lb("claims", { room: f.room, adminSeed, start: claims, count: n, target: 65_200 });
    claims += n;
    for (const b of [...big]) {
      if (claims >= b) {
        big.delete(b);
        const nb = await lb("notified", { room: f.room, acts: [r.last.id], bytes: 1_950_000 });
        out.steps.push({ step: "notified", at: claims, ...nb });
        log("near-bound entry", nb);
      }
    }
    s = await status(f.room);
    if (s.head >= 990) throw new Error(`segment 0 is nearly full at ${(s.activeSegment.bytes / MiB).toFixed(1)} MiB; the matrix needs it active`);
    if (s.head - lastPublishedHead >= every || (MODE === "over64" && lastPublishedHead === 1 && s.head >= 100)) {
      await publish(f.room, `load through ${s.head}`);
      lastPublishedHead = s.head;
      s = await status(f.room);
    }
  }
  out.steps.push({ step: "load", claims, ms: Date.now() - loadStart, head: s.head, activeSegment: s.activeSegment });
  log("loaded", { claims, head: s.head, segmentMiB: (s.activeSegment.bytes / MiB).toFixed(2), largest: s.activeSegment.largestEntry });
  save();

  // The whole active segment in one publication, the instance reset part-way, then published again.
  const over = MODE === "over64"; // Artifacts refuses the push of an object over 32 MiB (object-limit.mjs)
  // Reset just after the second staging call that carries parts: the segment is part-staged.
  const abortStages = Number(process.env.ABORT_STAGES ?? 2);
  const label = `${(s.activeSegment.bytes / MiB).toFixed(1)} MiB active segment`;
  const aborted = await publish(f.room, `${label}, reset mid-publication`, { abortStages, allowError: over });
  out.steps.push({ step: "reset", abortStages, reset: aborted.reset });
  const pending = aborted.status.pending;
  const resumed = await publish(f.room, `${label}, after the reset`, { allowError: over });
  if (over) {
    resumed.rec.probe = await lb("pushprobe", { room: f.room });
    log("push probe", resumed.rec.probe);
  }
  const stats = resumed.status.publisher?.stats ?? {};
  out.checks = {
    resetHappened: aborted.reset,
    pendingStoredBeforeReset: pending !== null,
    sameCohortAfterReset: pending ? resumed.status.pending === null || resumed.status.pending.expected === pending.expected : null,
    resumedSameCommit: pending ? resumed.rec.result?.commit === pending.expected : null,
    resumedThrough: resumed.rec.result?.through ?? null,
    resumedError: resumed.rec.error ?? null,
    segmentBytes: stats.largestSegment ?? null,
    sentAfterReset: stats.sentSegmentBytes ?? null,
    resumedFromStaged: stats.sentSegmentBytes !== undefined ? stats.sentSegmentBytes < stats.largestSegment : null,
    activeSegmentMiB: resumed.status.activeSegment.bytes / MiB,
    largestEntry: resumed.status.activeSegment.largestEntry,
  };
  log("checks", out.checks);
  const last = over ? null : await publish(f.room, "one more cohort: the checkpoint event, over the same segment");
  save();

  // Verify the published log from a fresh fetch, under a read token minted and revoked here.
  const name = f.repo.split("/")[1];
  const info = await api("GET", `/repos/${name}`);
  const remote = info.result?.remote;
  const t = (await api("POST", "/tokens", { repo: name, scope: "read", ttl: 900 })).result;
  try {
    const dir = mkdtempSync(join(tmpdir(), "logbounded-verify-"));
    const env = { ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${t.plaintext}` };
    const ls = execFileSync("git", ["-c", "credential.helper=", "ls-remote", remote, "refs/artroom/log"], { env, encoding: "utf8" }).trim().split(/\s+/)[0];
    const v0 = Date.now();
    const v = spawnSync("node", [join(LOG_PKG, "src/cli.ts"), "verify", remote, "--json"], { env, encoding: "utf8", maxBuffer: 64 * MiB });
    let report = null;
    try {
      report = JSON.parse(v.stdout);
    } catch {
      report = { stdout: redact(v.stdout).slice(0, 2000) };
    }
    out.verify = { ref: ls, refIsLast: last ? ls === last.rec.result?.commit : ls === out.publications.filter((p) => p.result).at(-1)?.result.commit, exit: v.status, ms: Date.now() - v0, ok: report.ok, verifiedThrough: report.verifiedThrough, publishedThrough: report.publishedThrough, commits: report.commits, failures: report.failures, stderr: redact(v.stderr).slice(0, 2000) };
    log("verify", out.verify);
  } finally {
    await api("DELETE", `/tokens/${t.id}`);
  }
} catch (e) {
  out.error = redact(e instanceof Error ? e.stack : String(e));
  log("error", out.error);
} finally {
  if (out.repo) {
    const name = out.repo.split("/")[1];
    const toks = (await api("GET", `/repos/${name}/tokens?state=active&per_page=100`)).result ?? [];
    const revoked = [];
    for (const tok of toks) revoked.push((await api("DELETE", `/tokens/${tok.id}`)).success === true);
    const del = await api("DELETE", `/repos/${name}`);
    out.cleanup = { activeTokensFound: toks.length, revoked: revoked.filter(Boolean).length, repoDeleted: del.success === true };
    log("cleanup", out.cleanup);
  }
  out.totalMs = Date.now() - t0;
  save();
}
