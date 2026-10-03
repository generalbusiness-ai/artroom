/**
 * Writes test/fixtures/v1-log-815e3383.json: a v1 log as main 815e3383's
 * test room wrote it, and the report main 815e3383's verifier gave it. Run
 * once, at 815e3383, before declared acts stage 3 changed verify; the file
 * is committed and never regenerated, so the stage-3 test "an old v1 log
 * verifies unchanged" compares today's verifier with that report.
 *
 *   node scripts/v1-fixture.ts
 *
 * The log: the golden walk-through of protocol section 20 (genesis, policy,
 * claims and their notifications, an invitation and a join, a recorded
 * refusal, three publications), then a policy with require, land and carry
 * rules, an obligations-recomputed event, a land-evaluated event, a check
 * and its check-carried event, and a fourth publication. It covers every
 * entry that carries decisions under a v1 document.
 */

import { writeFileSync } from "node:fs";
import { carry, policy, requireReview, rule } from "@generalbusiness/artroom-policy";
import { b64url } from "../src/crypto.ts";
import { entryId } from "../src/entries.ts";
import { MemoryGit } from "../src/git.ts";
import { verifyLog } from "../src/verify.ts";
import { DEMO_CHECKERS, DEMO_POLICY, checkBody, goldenLog, keys, memberAuthority } from "../test/support/room-sim.ts";

const { sim, publisher, remote, lanes } = await goldenLog();
const alice = memberAuthority("@alice", keys.alice.key);
sim.activate(
  policy(
    ...DEMO_POLICY.rules.map((r) => rule(r)),
    requireReview({ paths: "src/**", from: "@alice" }),
    rule({ id: "freeze", kind: "land", block: "false", reason: "Not on a freeze.", fix: "Wait for the freeze to end." }),
    carry({ allow: [{ id: "checks-carry", evidence: "check", allow: "true" }] }),
  ),
  DEMO_CHECKERS,
);
await sim.recomputed(lanes[0]!, ["src/a.ts"]);
await sim.landEvaluated(lanes[0]!, ["src/a.ts"]);
const check = sim.accept(sim.envelope(keys.alice, "check", { lane: lanes[0]!, generation: 1 }, checkBody()), alice);
await sim.checkCarried(entryId(check.seq, check.hash), lanes[0]!);
await sim.publish(publisher);
await sim.publish(publisher);

const git = remote as MemoryGit;
const report = await verifyLog(git);
if (!report.ok) throw new Error(`the fixture does not verify: ${JSON.stringify(report.failures)}`);
const objects = Object.fromEntries([...git.objects].map(([sha, o]) => [sha, { type: o.type, data: b64url(o.data) }]));
const out = {
  about: "A v1 log and the report main 815e3383's verifier gave it. Written once by scripts/v1-fixture.ts; never regenerated.",
  ref: "refs/artroom/log",
  head: await git.readRef("refs/artroom/log"),
  objects,
  report: {
    ok: report.ok,
    room: report.room,
    commits: report.commits,
    verifiedThrough: report.verifiedThrough,
    publishedThrough: report.publishedThrough,
    decisionsReplayed: report.decisionsReplayed,
    last: report.last,
    failures: report.failures,
  },
};
writeFileSync(new URL("../test/fixtures/v1-log-815e3383.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out.report));
