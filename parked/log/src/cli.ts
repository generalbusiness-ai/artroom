#!/usr/bin/env node
/**
 * artroom verify <remote> [--ref <ref>] [--json] [--no-replay]
 *
 * Fetch refs/artroom/log from a git remote and verify it offline
 * (R-LOG-10). Exit status: 0 verified, 1 a check failed or the log names a
 * version this verifier does not carry (R-DECL-25), 2 usage or fetch error.
 */

import { GitCli, redact } from "./gitcli.ts";
import { verifyLog } from "./verify.ts";
import { LOG_REF } from "./entries.ts";

const args = process.argv.slice(2);
if (args[0] === "verify") args.shift();
const json = args.includes("--json");
const replay = !args.includes("--no-replay");
const refAt = args.indexOf("--ref");
const ref = refAt >= 0 ? args[refAt + 1] : LOG_REF;
const remote = args.find((a, i) => !a.startsWith("--") && (refAt < 0 || i !== refAt + 1));

if (!remote || !ref) {
  console.error("usage: artroom verify <remote> [--ref <ref>] [--json] [--no-replay]");
  process.exit(2);
}

try {
  const git = GitCli.open(remote);
  await git.fetch(ref);
  await git.fetchPins();
  const report = await verifyLog(git, { ref, replayDecisions: replay });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    const full = report.mode === "full";
    console.log(report.ok ? `Verified${full ? "" : ", integrity only"}. Every check this run makes passed; what it cannot prove is listed below.` : "Verification failed.");
    console.log(full ? "Mode: full." : "Mode: integrity only (--no-replay). Policy was not replayed: decisions, required calls, carry judgements and land inputs were not checked. The checks that still ran are named below.");
    console.log(`Room: ${report.room ?? "unknown"}`);
    console.log(`Log commit: ${report.head ?? "none"} (${report.commits} commits)`);
    console.log(`Published through entry ${report.publishedThrough}; verified through entry ${report.verifiedThrough}${report.last ? ` (${report.last.id})` : ""}.`);
    console.log(`Policy decisions replayed: ${report.decisionsReplayed}.`);
    for (const f of report.failures)
      console.log(`  ${f.reason}${f.seq !== undefined ? ` at entry ${f.seq}` : ""}${f.commit ? ` in ${f.commit}` : ""}: ${f.detail}`);
    if (report.unsupported)
      console.log(`Not verified from entry ${report.unsupported.seq}: ${report.unsupported.reason}, a limit of this verifier, not a finding against the log. ${report.unsupported.detail}`);
    for (const l of report.limits) console.log(`  ${l.reason} at entry ${l.seq}: ${l.detail}`);
    console.log(`Carry accounting: ${report.carryAccounting}.`);
    for (const c of report.cannotProve) console.log(`Cannot prove: ${c}`);
  }
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  console.error(`artroom verify: ${redact((e as Error).message)}`);
  process.exit(2);
}
