/**
 * One live publish/verify round trip against a git remote, normally an
 * Artifacts repository (see live-roundtrip.sh, which supplies the remote and
 * the credentials through the environment). Prints a JSON summary with no
 * credentials.
 */

import { GitCli, redact } from "../src/gitcli.ts";
import { LOG_REF } from "../src/entries.ts";
import { verifyLog } from "../src/verify.ts";
import { goldenLog } from "../test/support/room-sim.ts";

const remote = process.argv[2];
if (!remote) throw new Error("usage: node scripts/live-roundtrip.ts <remote>");

const started = Date.now();
try {
  const { c1, c2, c3 } = await goldenLog(GitCli.open(remote));
  const published = Date.now();
  const reader = GitCli.open(remote);
  await reader.fetch(LOG_REF);
  const report = await verifyLog(reader);
  console.log(
    JSON.stringify(
      {
        remote: redact(remote),
        commits: [c1.commit, c2.commit, c3.commit],
        attempts: [c1.attempts, c2.attempts, c3.attempts],
        publishMs: published - started,
        verifyMs: Date.now() - published,
        ok: report.ok,
        verifiedThrough: report.verifiedThrough,
        publishedThrough: report.publishedThrough,
        decisionsReplayed: report.decisionsReplayed,
        failures: report.failures,
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  console.error(redact(String((e as Error).stack ?? e)));
  process.exit(2);
}
