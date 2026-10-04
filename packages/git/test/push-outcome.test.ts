// A failed push is not necessarily a refusal (spike review 5fc820a6). Checks
// the classifier, carried over from the spike, against real git output
// captured there (spikes/sandbox-git/test/capture_push_samples.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artifactsRefusal, classifyGitPush, definitelyNotApplied, type PushOutcome } from "../src/publisher/push-outcome.ts";

interface Sample { case: string; expected: string; exitCode: number; stdout: string; stderr: string; refChanged?: boolean }
const samples = JSON.parse(readFileSync(new URL("./push-samples.json", import.meta.url), "utf8")) as Sample[];
const TARGET = "refs/heads/main";
const label = (o: PushOutcome) => (o.outcome === "rejected" ? `rejected:${o.reason}` : o.outcome);

test("git's recorded push outputs are classified as landed, a lease refusal, another refusal, an error before anything was sent, or unknown; the samples cover every outcome", () => {
  const seen = new Set(samples.map((s) => s.expected));
  for (const want of ["landed", "rejected:lease", "rejected:remote-rejected", "error", "unknown"]) assert.ok(seen.has(want), want);
  for (const s of samples) {
    assert.equal(label(classifyGitPush(s.exitCode, s.stdout, s.stderr, TARGET)), s.expected, `sample ${s.case}`);
    assert.equal(label(classifyGitPush(s.exitCode, s.stdout.trim(), s.stderr.trim(), TARGET)), s.expected, `sample ${s.case}, trimmed`);
  }
});

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

// Contract amendment 4 (R-LOG-20): Artifacts refuses a pack holding an object over its limit before it
// updates any ref. The responses recorded by the live probes of 2026-10-02.
const LOGBIG = new URL("../../room/measure/logbig/results/logbig-2026-10-02T02-52-36-597Z.json", import.meta.url);
const OBJECT_LIMIT = new URL("../../room/measure/logbig/results/object-limit-2026-10-02T02-55-14-470Z.json", import.meta.url);

/** The recorded answers: the log publication's (stdout and stderr as lane B joined them) and each refused probe push's stderr. */
function recorded(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string" && v.includes("artifacts_git_receive_pack_object_too_large")) out.push(v.replace(/^no clear answer: /, ""));
    else if (Array.isArray(v) && v.every((x) => typeof x === "string") && v.some((x) => x.includes("artifacts_git_receive_pack_object_too_large"))) out.push(v.join("\n"));
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(JSON.parse(readFileSync(LOGBIG, "utf8")));
  walk(JSON.parse(readFileSync(OBJECT_LIMIT, "utf8")));
  return out;
}

test("Artifacts' recorded refusal of an object over its limit is rejected (remote-rejected), not unknown", () => {
  const answers = recorded();
  assert.ok(answers.length >= 5, `${answers.length} recorded answers`);
  for (const text of answers) {
    assert.match(text, /remote end hung up unexpectedly/); // which alone would be unknown
    for (const code of [1, 128]) {
      const o = classifyGitPush(code, "", text, "refs/artroom/log");
      assert.equal(label(o), "rejected:remote-rejected", text);
      assert.equal(definitelyNotApplied(o.outcome), true);
    }
    assert.equal(artifactsRefusal(text), "artifacts_git_receive_pack_object_too_large");
  }
});

test("only a known Artifacts code before any ref update is a refusal: a status line for the ref, an unknown code, and a zero exit still decide as before", () => {
  const text = recorded()[0]!;
  const landed = samples.find((x) => x.case === "landed")!;
  // A status line for the ref wins: the ref moved.
  assert.equal(classifyGitPush(0, landed.stdout, `${landed.stderr}\n${text}`, TARGET).outcome, "landed");
  // Another code, or the code inside other text, is not known to come before a ref update.
  const other = text.replace("artifacts_git_receive_pack_object_too_large", "artifacts_git_receive_pack_something_else");
  assert.equal(classifyGitPush(128, "", other, "refs/artroom/log").outcome, "unknown");
  assert.equal(classifyGitPush(128, "", text.replace("remote: artifacts_", "remote: note artifacts_"), "refs/artroom/log").outcome, "unknown");
  assert.equal(classifyGitPush(0, "", text, "refs/artroom/log").outcome, "unknown");
});
