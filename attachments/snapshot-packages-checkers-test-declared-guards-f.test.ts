// Declared acts stage 2 (request fd6f00b6): a job's kind and binding are
// strings, both or neither (R-DECL-18). The guard audit's family F: each of
// the two type checks decides alone, also for a value that only prints as a
// valid kind or binding.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { Sha } from "@generalbusiness/artroom-contract";
import { checkJob, isRefusal, ownJob } from "../src/job.ts";
import { CONFIG, HOST, NS, ROOM, job } from "./support.ts";

const expected = { room: ROOM, checker: "tests", host: HOST, namespaces: [NS], now: () => Date.now() };
const sha = "a".repeat(40) as Sha;
const named = (over: Record<string, unknown>) => checkJob(job(sha, { kind: "tree", tree: sha }, over as never), expected);
const NOT_BOTH = "The job names a kind or a binding, but not both.";

function refusedAsNotBoth(what: string, over: Record<string, unknown>): void {
  const r = named(over);
  assert.ok(isRefusal(r), `${what}: the job must be refused`);
  assert.equal(r.rule, "check-binding", what);
  assert.equal(r.reason, NOT_BOTH, what);
}

test("a job's kind must be a string: with a binding and no kind, or a kind that is not a string though it prints as a valid one, the job names one without the other (R-DECL-18)", () => {
  refusedAsNotBoth("no kind", { binding: CONFIG });
  refusedAsNotBoth("a String object", { kind: new String("check"), binding: CONFIG });
  refusedAsNotBoth("null", { kind: null, binding: CONFIG });
  refusedAsNotBoth("a list of one kind", { kind: ["check"], binding: CONFIG });
  refusedAsNotBoth("a number", { kind: 7, binding: CONFIG });
});

test("a job's binding must be a string: with a kind and no binding, or a binding that is not a string though it prints as a valid one, the job names one without the other (R-DECL-18)", () => {
  refusedAsNotBoth("no binding", { kind: "check" });
  refusedAsNotBoth("a String object", { kind: "check", binding: new String(CONFIG) });
  refusedAsNotBoth("a list of one binding", { kind: "check", binding: [CONFIG] });
  refusedAsNotBoth("null", { kind: "check", binding: null });
  refusedAsNotBoth("a number", { kind: "check", binding: 7 });
});

test("a job that names both as strings binds, as one that names neither does; a String object is still refused in the service's own frozen copy of the job (R-DECL-18)", () => {
  assert.ok(!isRefusal(named({ kind: "check", binding: CONFIG })));
  assert.ok(!isRefusal(named({})));
  // `ownJob` clones the job before `checkJob` reads it, and a clone keeps a String object as one.
  const own = ownJob(job(sha, { kind: "tree", tree: sha }, { kind: new String("check"), binding: CONFIG } as never));
  assert.ok(!isRefusal(own));
  const r = checkJob(own, expected);
  assert.ok(isRefusal(r) && r.reason === NOT_BOTH);
});
