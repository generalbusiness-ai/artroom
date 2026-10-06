import { expect, test } from "vitest";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { sign, textDigest, timeMs, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { capable, graph, net, paul, sam, una, rita } from "./support/graph.ts";
// The checker service's own origin read and signer, by path: the lanes package states no dependency on that package.
import { originOf, signResult, type Job, type Outcome, type ResultSigner } from "../../checkers/src/index.ts";

/** A Git object ID. Nothing reads a repository here. */
const oid = (c: string) => c.repeat(40);

test("T34, the check results table on a real change lane: a judged pass and a judged fail are kept apart from an error, a wait that ended and a retry; the first authentic answer on a timed-out job that no retry superseded decides it, and a later answer changes nothing (the checker's results are signed by the checker service's own signer; SCRIPTED: a rules peer and the test capability; no runner)", async () => {
  // One real change lane. STAND-INS: the rules are one handwritten entry of a scripted rules peer, and the scripted test capability
  // answers the manifest's guards. `paul` is the checker that the rules name for every check, and his results are built and signed
  // by the checker service's signer, from a job that its origin read took from this lane's own entries. Not proved: a run, a read
  // token, what a real rules scope requires, or the destination's checks of a deciding entry at a reservation.
  const g = await graph();
  net.capability = capable;
  const C = await g.change();
  net.hold = () => true;
  const configuration = textDigest("ci.yml");
  const checks = ["ci", "lint", "types", "slow"].map((name) => ({ name, configuration, required: true, checker: paul.member }));
  expect(await C.stub.deliver(g.rules.relate(C.at, "rules", "published", { approvals: 0, checks, ownerMayReview: true }))).toMatchObject({ answer: "recorded" });
  const offer = (await C.did(rita, "offer", { fields: { offeree: una.member, terms: "Integrate." } })).fact;
  await C.did(una, "accept", { on: offer.seq, fields: { terms: offer } });
  const hold = (await C.did(una, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  const manifest = (await C.did(una, "propose-manifest", { fields: { hold, instance: "i-1", base: oid("b"), integration: oid("c"), tree: oid("3"), complete: true, selected: [], decisions: [] } })).fact.seq;
  const request = async (name: string, earlier?: number) => (await C.did(una, "request-check", { fields: { manifest, name, configuration, ...(earlier === undefined ? {} : { earlier }) } })).fact;
  /** A job's state, and the position of the entry that decided it: the slot holds a fact of this lane as its position. */
  const job = async (seq: number) => { const item = await C.item(seq); return [item.state, item.refs["decidedBy"] ?? null]; };

  // The checker service's side. Its origin read takes the job from the lane's own sealed entries, and its signer signs the result.
  const checker: ResultSigner = { key: paul.key, sign: (bytes) => sign(paul.secret, bytes) };
  let nonce = 0;
  const result = async (fact: Awaited<ReturnType<typeof request>>, name: string, outcome: Outcome, by: ResultSigner = checker): Promise<SignedIntent> => {
    const sealed = await C.sealed();
    const origin = originOf({ lane: C.at, job: fact, name, tree: oid("3") }, { entry: sealed[fact.seq]!, pinned: C.valid.digest, activated: { name: "change", state: "active" }, manifest: sealed[manifest]! });
    if ("not" in origin) throw new Error(`the origin read refused a real job: ${origin.not}`);
    const read: Job = origin.job;
    expect([read.tree, read.configuration, read.commit, read.base, read.deadline]).toEqual([oid("3"), configuration, oid("c"), oid("b"), (await C.item(fact.seq)).values["deadline"]]);
    // The revisions that the act states, read from the lane now, as the fixture reads them for any act.
    const act = outcome.act === "check" ? { fields: { job: fact.seq, tree: oid("3"), configuration, outcome: outcome.outcome } } as const : { fields: { job: fact.seq, tree: oid("3"), configuration, reason: outcome.reason } } as const;
    const { expected } = (await C.signed(paul, outcome.act, act as never)).signed.intent;
    return signResult(by, read, outcome, null, expected, { now: timeMs(net.clock.now)!, nonce: new Uint8Array(16).fill(++nonce) });
  };
  const submit = async (signed: SignedIntent) => { const a = await C.submit({ signed } as never); return a.answer === "accepted" ? a.receipt.fact.seq : a.answer === "refused" ? `${a.reason}${a.name ? `: ${a.name}` : ""}` : a.answer; };
  const passed: Outcome = { act: "check", outcome: "passed" };
  const failed: Outcome = { act: "check", outcome: "failed" };
  const errored: Outcome = { act: "check-error", reason: "step-failed:1" };

  // A judged pass, a judged fail and an error of the run: three states, each decided by the entry of its own answer.
  const [ci, lint, types, slow] = [await request("ci"), await request("lint"), await request("types"), await request("slow")];
  const signedCi = await result(ci, "ci", passed);
  expect(verifySignedIntent(signedCi)).toBe(true);
  const [ciBy, lintBy, typesBy] = [await submit(signedCi), await submit(await result(lint, "lint", failed)), await submit(await result(types, "types", errored))];
  expect([await job(ci.seq), await job(lint.seq), await job(types.seq), await job(slow.seq)]).toEqual([["passed", ciBy], ["failed", lintBy], ["errored", typesBy], ["requested", null]]);
  // An answer names its job: one that states another tree, or that is signed by a member whom the rules do not name for the check, is refused, and nothing is recorded.
  const entries = (await C.entries()).length;
  const notMine = await C.signed(sam, "check", { fields: { job: slow.seq, tree: oid("3"), configuration, outcome: "passed" } });
  expect([await C.asks(paul, "check", { fields: { job: slow.seq, tree: oid("9"), configuration, outcome: "passed" } }), await submit(notMine.signed), (await C.entries()).length]).toEqual(["guard-failed: not-this-job", "guard-failed: not-the-checker", entries]);

  // A wait that ended: the deadline's timed entry sets the job to `timed-out`, which is not a pass and not a failure, and is its deciding entry.
  await g.later(1800);
  await C.alarm();
  await g.settle();
  const [, timedBy] = await job(slow.seq);
  expect([await job(slow.seq), (await C.entry(timedBy as number)).input]).toMatchObject([["timed-out", timedBy], { type: "timed", item: slow.seq, rule: "job-deadline" }]);
  // The first authentic answer on that job, late: it decides the job, and its entry is the deciding entry in place of the timed entry.
  const late = await result(slow, "slow", passed);
  const lateBy = await submit(late);
  expect([await job(slow.seq), typeof lateBy === "number" && lateBy > (timedBy as number)]).toEqual([["passed", lateBy], true]);
  // A second answer on the decided job, as a new signed intent, is history only: one more result, and the job and its deciding entry as they were.
  const second = await submit(await result(slow, "slow", failed));
  expect([typeof second, await job(slow.seq)]).toEqual(["number", ["passed", lateBy]]);
  // The exact signed bytes of the answer that was admitted return its receipt and write nothing.
  const before = (await C.entries()).length;
  expect([await submit(late), (await C.entries()).length]).toEqual([lateBy, before]);

  // A retry is a new job, and the earlier job is superseded. A late answer on the superseded job decides nothing, for it or for the new job.
  const retry = await request("types", types.seq);
  const stale = await submit(await result(types, "types", passed));
  expect([await job(types.seq), await job(retry.seq), typeof stale]).toEqual([["superseded", typesBy], ["requested", null], "number"]);
});
