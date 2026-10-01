// Review 5fc820a6, finding P2: a failed push is not necessarily a lease refusal.
// Checks the classifier against real git output captured by capture_push_samples.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyGitPush, classifyIsoPush } from "../src/push-outcome.ts";

const samples = JSON.parse(readFileSync(new URL("./push-samples.json", import.meta.url), "utf8"));
const TARGET = "refs/heads/main";
const label = (o) => (o.outcome === "rejected" ? `rejected:${o.reason}` : o.outcome);

test("the samples cover every outcome", () => {
	const seen = new Set(samples.map((s) => s.expected));
	for (const want of ["landed", "rejected:lease", "rejected:remote-rejected", "error", "unknown"]) {
		assert.ok(seen.has(want), `no sample for ${want}`);
	}
	assert.ok(samples.some((s) => s.case === "lease-server"), "no server-side stale ref sample");
});

for (const s of samples) {
	test(`git push sample ${s.case} is ${s.expected}`, () => {
		assert.equal(label(classifyGitPush(s.exitCode, s.stdout, s.stderr, TARGET)), s.expected);
		// The container Worker trims output before classifying.
		assert.equal(label(classifyGitPush(s.exitCode, s.stdout.trim(), s.stderr.trim(), TARGET)), s.expected);
	});
}

test("a push that changed the ref is never called error or rejected", () => {
	for (const s of samples.filter((x) => x.refChanged)) {
		const o = classifyGitPush(s.exitCode, s.stdout, s.stderr, TARGET).outcome;
		assert.ok(o === "landed" || o === "unknown", `${s.case}: ${o}`);
	}
});

test("a status line for another ref does not count", () => {
	const s = samples.find((x) => x.case === "landed");
	assert.equal(classifyGitPush(s.exitCode, s.stdout, s.stderr, "refs/heads/other").outcome, "unknown");
});

test("isomorphic-git outcomes", () => {
	const err = (code, data) => Object.assign(new Error(code), { code, data });
	const ok = { ok: true, refs: { [TARGET]: { ok: true } } };
	assert.equal(label(classifyIsoPush(ok, undefined, true, TARGET)), "landed");
	assert.equal(label(classifyIsoPush(undefined, err("PushRejectedError", { reason: "not-fast-forward" }), true, TARGET)),
		"rejected:non-fast-forward");
	assert.equal(label(classifyIsoPush(undefined,
		err("GitPushError", { result: { ok: true, refs: { [TARGET]: { ok: false, error: "stale ref" } } } }), true, TARGET)),
		"rejected:lease");
	assert.equal(label(classifyIsoPush(undefined,
		err("GitPushError", { result: { ok: false, error: "unpack failed", refs: {} } }), true, TARGET)),
		"rejected:remote-rejected");
	// The same HTTP failure is an error during discovery and unknown once sending began.
	const http = err("HttpError", { statusCode: 502 });
	assert.equal(classifyIsoPush(undefined, http, false, TARGET).outcome, "error");
	assert.equal(classifyIsoPush(undefined, http, true, TARGET).outcome, "unknown");
	assert.equal(classifyIsoPush(undefined, new TypeError("network connection lost"), true, TARGET).outcome, "unknown");
	assert.equal(classifyIsoPush({ ok: true, refs: {} }, undefined, true, TARGET).outcome, "unknown");
});
