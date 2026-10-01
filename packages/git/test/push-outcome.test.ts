// A failed push is not necessarily a refusal (spike review 5fc820a6). Checks
// the classifier, carried over from the spike, against real git output
// captured there (spikes/sandbox-git/test/capture_push_samples.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyGitPush, definitelyNotApplied, type PushOutcome } from "../src/publisher/push-outcome.ts";

interface Sample { case: string; expected: string; exitCode: number; stdout: string; stderr: string; refChanged?: boolean }
const samples = JSON.parse(readFileSync(new URL("./push-samples.json", import.meta.url), "utf8")) as Sample[];
const TARGET = "refs/heads/main";
const label = (o: PushOutcome) => (o.outcome === "rejected" ? `rejected:${o.reason}` : o.outcome);

test("the samples cover every outcome", () => {
  const seen = new Set(samples.map((s) => s.expected));
  for (const want of ["landed", "rejected:lease", "rejected:remote-rejected", "error", "unknown"]) assert.ok(seen.has(want), want);
});

for (const s of samples) {
  test(`git push sample ${s.case} is ${s.expected}`, () => {
    assert.equal(label(classifyGitPush(s.exitCode, s.stdout, s.stderr, TARGET)), s.expected);
    assert.equal(label(classifyGitPush(s.exitCode, s.stdout.trim(), s.stderr.trim(), TARGET)), s.expected);
  });
}

test("a push that changed the ref is never called error or rejected, so it is never evidence for aborted", () => {
  for (const s of samples.filter((x) => x.refChanged)) {
    const o = classifyGitPush(s.exitCode, s.stdout, s.stderr, TARGET).outcome;
    assert.ok(o === "landed" || o === "unknown", `${s.case}: ${o}`);
    assert.equal(definitelyNotApplied(o), false);
  }
});

test("a status line for another ref does not count", () => {
  const s = samples.find((x) => x.case === "landed")!;
  assert.equal(classifyGitPush(s.exitCode, s.stdout, s.stderr, "refs/heads/other").outcome, "unknown");
});
