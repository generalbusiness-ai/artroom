import { describe, expect, test } from "vitest";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, hex, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { CheckerService, Outcomes, REPORT_BOUNDS, configurationDigest, detailsDigest, environmentDigest, judge, readConfiguration, readReport, type Configuration, type Delivered, type JobRecord, type Notice, type RunReport } from "../src/index.ts";
import { Lane, MemoryDurable, ScriptedRunner, T0, configuration, digest, lane, newKey, otherLane, refusedFor, report, world } from "./support.ts";

/**
 * T35. The lane, the rules scope, the storage and the runner are STAND-INS
 * of test support, and the lane's entries are made by hand. So these tests
 * show the checker service's own side: what it reads before it runs, what
 * it starts, what it keeps and what it signs. They show nothing about a
 * lane's judgment, a real runner or a container. The lane's side of a
 * result is `packages/lanes/test/checks.scope.test.ts`, on real scopes.
 */
function made(w = world()) {
  const key = newKey();
  const scopes = new Lane(w);
  const runner = new ScriptedRunner();
  const durable = new MemoryDurable();
  const log: string[] = [];
  let n = 0;
  const service = new CheckerService({ signer: key.signer, scopes, runner, outcomes: new Outcomes(durable), clock: () => T0, random: (length) => new Uint8Array(length).fill(++n), log: (e) => log.push(`${e.step} ${e.event}`) });
  const said = (d: Delivered) => (d.did === "submitted" ? `${d.outcome.act} ${d.outcome.act === "check" ? d.outcome.outcome : d.outcome.reason}, ${d.lane}${d.ran ? ", ran" : ""}` : d.did === "nothing" ? `nothing: ${d.why}` : d.did);
  return { w, key, scopes, runner, durable, log, service, said, deliver: async (notice: Notice = w.notice) => said(await service.deliver(notice)) };
}

describe("the checker service (authority note, section 3.11; I3 plan, T35). The lane, the rules scope, the storage and the runner are stand-ins", () => {
  test("the service reads the job's entry from the lane before any run, and an entry that only looks like a job is not run: nothing is started, kept or signed for it", async () => {
    // What is read, and in which order, before the one run: the job's entry, the lane's definition, the rules scope's item for it, the manifest's entry; then the configuration and the read token.
    const ok = made();
    expect([await ok.deliver(), ok.scopes.calls.slice(0, 6), ok.runner.asked.length]).toEqual(["check passed, admitted, ran", ["entry 7", "pinned", "activated", "entry 5", "configuration", "prepare git-read@1 job-read"], 1]);

    const not = async (change: (m: ReturnType<typeof made>) => Notice | void, w = world()) => {
      const m = made(w);
      const notice = change(m) ?? m.w.notice;
      const answer = await m.deliver(notice);
      // Nothing was started, kept or signed, and the lane was asked for nothing but reads.
      return [answer, m.runner.asked.length + m.durable.kept.size + m.key.signed.length + m.scopes.calls.filter((c) => c.startsWith("prepare") || c.startsWith("submit")).length];
    };
    const forged = world();
    expect(await Promise.all([
      not((m) => ({ ...m.w.notice, job: { ...m.w.fact, hash: digest("e") } })),                 // the fact names another entry than the lane holds there
      not((m) => { m.scopes.entries.set(7, { ...m.w.job, hash: digest("e") }); }),               // the lane serves a hash that its entry's bytes do not have
      not((m) => { m.scopes.entries.set(7, forged.job); }),                                      // another entry at that position
      not((m) => { m.scopes.entries.delete(7); }),                                               // no entry there
      not(() => undefined, world({ kind: "comment" })),                                          // an act of another kind, with a job's effects
      not((m) => { m.scopes.definition = { name: "issue", state: "active" }; }),                 // a lane of another definition
      not((m) => { m.scopes.definition = null; }),                                               // a definition that the rules scope does not hold
      not((m) => { m.scopes.definition = { name: "change", state: "retired" }; }),               // a `change` definition that is not active
      not((m) => { m.scopes.pins = "platform:rules@1"; }),                                       // no lane at all
      not((m) => ({ ...m.w.notice, tree: "9".repeat(40) })),                                     // not the tree that was given
      not((m) => ({ ...m.w.notice, name: "lint" })),                                             // not the name that was given
      not((m) => ({ ...m.w.notice, lane: otherLane })),                                          // a notice whose fact is of another lane
      not((m) => { m.scopes.entries.delete(5); }),                                               // the manifest that the job names is not there
      not((m) => { m.scopes.entry = () => Promise.reject(new Error("the lane cannot be read")); }),
    ])).toEqual([
      ["nothing: not-this-entry", 0], ["nothing: not-this-entry", 0], ["nothing: not-this-entry", 0], ["nothing: no-entry", 0], ["nothing: not-a-request-check", 0],
      ["nothing: not-a-change-lane", 0], ["nothing: not-a-change-lane", 0], ["nothing: not-activated", 0], ["nothing: not-a-change-lane", 0],
      ["nothing: not-as-given", 0], ["nothing: not-as-given", 0], ["nothing: bad-notice", 0], ["nothing: no-manifest", 0], ["nothing: unreadable", 0],
    ]);
  });

  test("at most one run for a job: of two deliveries that overlap one starts the runner and the other starts none; a later delivery starts none; a run whose end cannot be found is signed `run-lost`, and no second run starts", async () => {
    const m = made();
    m.runner.gate();
    const first = m.deliver();
    // The second delivery arrives while the first one's runner is running: it finds the record, and waits.
    await expect.poll(() => m.runner.asked.length).toBe(1);
    expect([await m.deliver(), m.runner.asked.length]).toEqual(["waiting", 1]);
    m.runner.hold!.release();
    expect([await first, await m.deliver(), m.runner.asked.length, m.scopes.submitted.length]).toEqual(["check passed, admitted, ran", "nothing: closed", 1, 1]);

    // Two deliveries that start together: both find no record, and one write creates it. The other starts no runner and concludes nothing.
    const pair = made();
    expect([(await Promise.all([pair.deliver(), pair.deliver()])).sort(), pair.runner.asked.length, pair.runner.looked, pair.scopes.submitted.length]).toEqual([["check passed, admitted, ran", "waiting"], 1, [], 1]);

    // The runner is lost with its own record: the end of the run cannot be found. `run-lost` is signed and submitted, and nothing runs again, now or at a later delivery.
    const lost = made();
    lost.runner.ends = "lost";
    lost.scopes.answers = [refusedFor("merge-in-progress")];
    expect([await lost.deliver(), await lost.deliver(), lost.runner.asked.length, lost.scopes.submitted.map((s) => s.intent.fields["reason"])]).toEqual(["check-error run-lost, kept, ran", "check-error run-lost, admitted", 1, ["run-lost", "run-lost"]]);
    // What a lost runner threw, with the whole of its input, is in no log line: the log holds fixed words.
    expect(lost.log).toEqual(["run lost", "submit refused guard-failed"]);

    // A record that was made by a delivery whose process then ended: its runner never started. That is `run-lost` too, and this delivery starts none.
    // While the runner's own record says that the run is going on, nothing is concluded.
    const dead = made();
    await new Outcomes(dead.durable).start(dead.w.fact, "a-run", null);
    dead.runner.records.set("a-run", "running");
    expect([await dead.deliver(), dead.scopes.submitted.length]).toEqual(["waiting", 0]);
    dead.runner.records.delete("a-run");
    expect([await dead.deliver(), dead.runner.asked.length, dead.runner.looked]).toEqual(["check-error run-lost, admitted", 0, ["a-run", "a-run"]]);
    // A run that ended while no delivery waited for it: its end is read from the runner's own record and judged, and nothing runs.
    const ended = made();
    await new Outcomes(ended.durable).start(ended.w.fact, "b-run", null);
    ended.runner.records.set("b-run", report({ steps: [{ status: 0, line: "x" }, { status: 1, line: "not ok" }] }));
    expect([await ended.deliver(), ended.runner.asked.length]).toEqual(["check failed, admitted", 0]);
    // With no read token no runner starts. The lane refused the step, as it does for a signer that its rules do not name.
    const none = made();
    none.scopes.token = refusedFor("");
    expect([await none.deliver(), none.runner.asked.length]).toEqual(["check-error run-lost, admitted", 0]);
    // The lane's answer to that request is data too. A value that is no answer is no token: the delivery does not fail between the record
    // of the run and the kept outcome, no runner starts, and the log holds a fixed word and nothing of the value.
    for (const value of [undefined, "accepted", { answer: "a token: ghp_0123456789" }]) {
      const odd = made();
      odd.scopes.prepare = () => Promise.resolve(value as never);
      expect([await odd.deliver().catch(() => "the delivery failed"), odd.runner.asked.length, odd.log]).toEqual(["check-error run-lost, admitted", 0, ["job-read no-answer"]]);
    }
  });

  test("the result is signed outside the runner, by the checker's key, after the outcome is kept: the runner is given the job and the configuration and no key or token; the signed intent names the job, its tree, its configuration and the digest of what ran", async () => {
    const m = made();
    const order: string[] = [];
    const run = m.runner.run.bind(m.runner);
    m.runner.run = async (ask) => { order.push(`run, with ${m.key.signed.length} signed and the record ${JSON.parse([...m.durable.kept.values()][0]!).state}`); return run(ask); };
    const submit = m.scopes.submit.bind(m.scopes);
    m.scopes.submit = (at, signed) => { order.push(`submit, with the record ${JSON.parse([...m.durable.kept.values()][0]!).state}`); return submit(at, signed); };
    expect([await m.deliver(), order]).toEqual(["check passed, admitted, ran", ["run, with 1 signed and the record started", "submit, with the record kept"]]);

    // The runner's whole input: the run's name, the job as read from the lane, and the configuration.
    const ask = m.runner.asked[0]!;
    expect([Object.keys(ask), ask.job, ask.configuration]).toEqual([["run", "job", "configuration"], { lane, fact: m.w.fact, name: "ci", tree: m.w.tree, configuration: configurationDigest(configuration), deadline: m.w.deadline, commit: "c".repeat(40), base: "b".repeat(40) }, configuration]);
    const [asked, signed] = [m.scopes.prepared[0]!, m.scopes.submitted[0]!];
    const record = JSON.parse([...m.durable.kept.values()][0]!);
    // The two signed intents verify as the checker's. The request for the read token names the job's fact. The result has the fields of the lane's `check`.
    expect([verifySignedIntent(asked), asked.intent.actor, asked.intent.kind, asked.intent.fields, verifySignedIntent(signed), signed.intent.actor, signed.intent.kind, signed.intent.to, signed.intent.expected, signed.intent.fields]).toEqual([
      true, m.key.signer.key, "git-read@1:job-read", { job: m.w.fact },
      true, m.key.signer.key, "check", lane, { job: 1, rules: 1, proposal: 4 }, { job: 7, tree: m.w.tree, configuration: configurationDigest(configuration), outcome: "passed", details: detailsDigest(record.details) },
    ]);
    // What ran, as the key signs it through that digest.
    expect(record.details.provenance).toMatchObject({ job: m.w.fact, tree: m.w.tree, configuration: configurationDigest(configuration), image: { declared: configuration.image, resolved: configuration.image }, steps: [{ name: "1", status: 0 }, { name: "2", status: 0 }], run: ask.run });
    // The key is nowhere but in the signer: not in the runner's input, the store, or what was sent.
    const written = JSON.stringify([m.runner.asked, [...m.durable.kept], m.scopes.submitted, m.scopes.prepared, m.log]);
    for (const form of [b64url(m.key.secret), hex(m.key.secret), Buffer.from(m.key.secret).toString("base64")]) expect(written).not.toContain(form);
  });

  test("another image or another environment gives an error and no result: a `check` is signed only for the image and the variables that the configuration names, and every other end of a run is a `check-error` with its reason", async () => {
    const end = async (ends: unknown) => { const m = made(); m.runner.ends = ends; return [await m.deliver(), (m.scopes.submitted[0] as SignedIntent).intent.kind]; };
    expect(await Promise.all([
      end(report({ image: digest("2") })), end(report({ image: null })),
      end(report({ environment: [...configuration.environment, { name: "NPM_TOKEN", value: "x" }] })), end(report({ environment: configuration.environment.slice(0, 1) })),
    ])).toEqual([
      ["check-error image-mismatch, admitted, ran", "check-error"], ["check-error image-unresolved, admitted, ran", "check-error"],
      ["check-error environment-mismatch, admitted, ran", "check-error"], ["check-error environment-mismatch, admitted, ran", "check-error"],
    ]);
    // The table "What the checker signs", as the pure function that the service signs from. A judged pass and a judged fail come only from a judging step that ended with its status and its last line.
    const of = (over: Partial<RunReport> | string) => { const o = judge(configuration, typeof over === "string" ? over : report(over)); return o.act === "check" ? o.outcome : `error ${o.reason}`; };
    const steps = (...s: [number | null, string | null][]) => ({ steps: s.map(([status, line]) => ({ status, line })) });
    expect([
      of({}), of(steps([0, "x"], [1, "not ok"])),
      of(steps([1, "npm error"], [0, "ok"])), of(steps([1, "npm error"])), of(steps([null, null])),      // a step before the judging step: an install that fails
      of(steps([0, "x"], [0, "not ok"])), of(steps([0, "x"], [2, "ok"])), of(steps([0, "x"], [0, null])), of(steps([0, "x"])), of(steps([0, "x"], [0, "ok"], [0, "ok"])),
      of({ checkout: false }), of({ started: false }), of({ end: "lost" }), of({ end: "limits" }), of("PASSED"), of({ steps: "ok" as never }),
      of({ image: digest("2"), ...steps([0, "x"], [0, "ok"]) }),                                         // the guard: a pass is not signed for another image
    ]).toEqual([
      "passed", "failed",
      "error step-failed:1", "error step-failed:1", "error step-failed:1",
      "error judgment-unreadable", "error judgment-unreadable", "error judgment-unreadable", "error judgment-unreadable", "error judgment-unreadable",
      "error checkout-unconfirmed", "error runner-not-started", "error runner-lost", "error limits-passed", "error report-malformed", "error report-malformed",
      "error image-mismatch",
    ]);
  });

  test("a report that is not in form is a kept and signed `check-error`, `report-malformed`: the delivery that ran it, a later delivery that finds the same report, and a submit that is sent again all give that answer, with the same record of what ran, and no second run starts", async () => {
    // Each report has the configuration's image, a confirmed checkout and a complete end, so nothing but its form stands between it and a judgment.
    const throwing = { ...report() };
    Object.defineProperty(throwing, "checkout", { enumerable: true, get() { throw new Error("a member that fails when it is read"); } });
    const sparse: unknown[] = [];
    sparse.length = 2;
    const bad: Record<string, unknown> = {
      "a lone surrogate in a variable": report({ environment: [{ name: "HOME", value: "/work/\ud800" }, configuration.environment[1]!] }),
      "a lone surrogate in a line": report({ steps: [{ status: 0, line: "\udc00" }, { status: 0, line: "ok" }] }),
      "a status of negative zero": report({ steps: [{ status: -0, line: "x" }, { status: 0, line: "ok" }] }),
      "a status that is no integer": report({ steps: [{ status: 0.5, line: "x" }, { status: 0, line: "ok" }] }),
      "a hole in the variables": report({ environment: sparse as never }),
      "a member that the form does not have": { ...report(), note: "ok" },
      "a variable with a third member": report({ environment: configuration.environment.map((v) => ({ ...v, secret: 1 })) as never }),
      "a step with a third member": report({ steps: [{ status: 0, line: "x" }, { status: 0, line: "ok", passed: true } as never] }),
      "more steps than a report may hold": report({ steps: Array(REPORT_BOUNDS.steps + 1).fill({ status: 0, line: "ok" }) }),
      "more variables than a report may hold": report({ environment: Array(REPORT_BOUNDS.variables + 1).fill({ name: "A", value: "" }) }),
      "a line longer than a report may hold": report({ steps: [{ status: 0, line: "x".repeat(REPORT_BOUNDS.textBytes + 1) }, { status: 0, line: "ok" }] }),
      "a member that fails when it is read": throwing,
    };
    // The record of what ran for such a report: the declared image and nothing of the report.
    const safe = (m: ReturnType<typeof made>, run: string) => ({ job: m.w.fact, tree: m.w.tree, configuration: configurationDigest(configuration), image: { declared: configuration.image, resolved: null }, environment: environmentDigest([]), steps: [{ name: "1", status: null }, { name: "2", status: null }], run });
    const kept = (m: ReturnType<typeof made>) => JSON.parse([...m.durable.kept.values()][0]!) as JobRecord;
    // A delivery that fails is told from one that answers: the service never rejects for what a runner returned.
    const told = (m: ReturnType<typeof made>) => m.deliver().catch(() => "the delivery failed");
    for (const [name, value] of Object.entries(bad)) {
      // The delivery that ran it. The lane refuses the first submit for now, so the kept outcome is sent again at the next delivery.
      // Both deliveries are of one job, so the two records of what ran can be compared.
      const w = world();
      const first = made(w);
      first.runner.ends = value;
      first.scopes.answers = [refusedFor("merge-in-progress"), refusedFor("merge-in-progress")];
      const answers = [await told(first), kept(first).state, await told(first)];
      const sent = first.scopes.submitted.map((s) => [verifySignedIntent(s), s.intent.kind, s.intent.fields["reason"], s.intent.fields["details"]]);
      // A later delivery, after the process that ran it ended: the record says `started`, and the runner's own record holds the same report.
      const later = made(w);
      await new Outcomes(later.durable).start(later.w.fact, "a-run", null);
      later.runner.records.set("a-run", value);
      const found = [await told(later), await told(later), later.runner.asked.length];
      // The run's name is the one thing that the two records of what ran do not share.
      const run = first.runner.asked[0]?.run ?? "no run";
      const again = kept(later).details;
      expect({ answers, runs: first.runner.asked.length, sent, record: kept(first).details, found, again, same: again === null ? null : { ...again.provenance, run } }, name).toEqual({
        answers: ["check-error report-malformed, kept, ran", "kept", "check-error report-malformed, admitted"], runs: 1,
        sent: Array(3).fill([true, "check-error", "report-malformed", detailsDigest({ provenance: safe(first, run) })]),
        record: { provenance: safe(first, run) },
        found: ["check-error report-malformed, admitted", "nothing: closed", 0], again: { provenance: safe(later, "a-run") }, same: safe(first, run),
      });
    }
    // One reading: a report whose member gives another value at each read is judged and recorded from the same reading. Here the image is
    // the configuration's at the first read and another afterwards, and the record of what ran names the image that was judged.
    const turning = made();
    let reads = 0;
    turning.runner.ends = Object.defineProperty({ ...report() }, "image", { enumerable: true, get: () => (reads++ === 0 ? configuration.image : digest("2")) });
    expect([await told(turning), kept(turning).details!.provenance.image]).toEqual(["check passed, admitted, ran", { declared: configuration.image, resolved: configuration.image }]);
    // The pure reading: a report in form is read as a new value with the same members, and each of these is no report.
    const whole = report();
    expect([readReport(whole), readReport(whole) === whole, Object.values(bad).map((value) => readReport(value)), judge(configuration, bad["a lone surrogate in a variable"])]).toEqual([whole, false, Array(Object.keys(bad).length).fill(null), { act: "check-error", reason: "report-malformed" }]);
  });

  test("the configuration is the rules scope's bytes under the job's digest, or nothing runs: bytes that are absent, that hash to another digest, or that are no configuration give `check-error`, `configuration-unavailable`, with no read token and no runner", async () => {
    const other: Configuration = { ...configuration, steps: [["true"]] };
    const tag = { ...configuration, image: "node:22" };
    const none = async (change: (m: ReturnType<typeof made>) => void, w = world()) => { const m = made(w); change(m); return [await m.deliver(), m.runner.asked.length, m.scopes.prepared.length, m.scopes.submitted[0]!.intent.fields["details"]]; };
    expect(await Promise.all([
      none((m) => m.scopes.configurations.clear()),
      none((m) => m.scopes.configurations.set(configurationDigest(configuration), canonicalize(other))),          // the lane's digest, and other bytes
      none((m) => m.scopes.configurations.set(configurationDigest(configuration), ` ${canonicalize(configuration)}`)),   // not the canonical bytes
      none(() => undefined, world({ config: tag as never })),                                                      // the bytes hash to the digest, and `image` is a tag
    ])).toEqual(Array(4).fill(["check-error configuration-unavailable, admitted", 0, 0, undefined]));
    expect([readConfiguration(canonicalize(configuration), configurationDigest(configuration)), readConfiguration(canonicalize({ ...configuration, extra: 1 }), configurationDigest({ ...configuration, extra: 1 }))]).toEqual([configuration, null]);
  });

  test("an outcome is kept until the lane admits it, and the computation is not run again: a result that the lane refuses for now is signed and submitted again at a later delivery; after a lost answer the same bytes are sent first; a superseded job is submitted no more", async () => {
    const m = made();
    m.scopes.answers = [refusedFor("merge-in-progress"), refusedFor("merge-in-progress")];
    // Refused during a merge: kept. At the next delivery the same bytes are refused again, and the outcome is signed anew, with the revisions read then, and admitted.
    expect([await m.deliver(), await m.deliver(), m.runner.asked.length, m.key.signed.length, m.scopes.submitted.map((s) => s.intent.fields["outcome"])]).toEqual(["check passed, kept, ran", "check passed, admitted", 1, 3, ["passed", "passed", "passed"]]);
    expect([m.scopes.submitted[0]!.sig === m.scopes.submitted[1]!.sig, m.scopes.submitted[1]!.sig === m.scopes.submitted[2]!.sig, await m.deliver(), m.runner.asked.length]).toEqual([true, false, "nothing: closed", 1]);

    // The lane admitted the result and its answer was lost: the outcome is still kept, as far as the service knows. The next delivery
    // sends the exact bytes of that submit. The lane answers with their receipt, and nothing new is signed or run.
    const l = made();
    l.scopes.answers = ["lost"];
    expect([await l.deliver(), await l.deliver(), l.scopes.submitted.length, l.scopes.submitted[0]!.sig === l.scopes.submitted[1]!.sig, l.key.signed.length, l.runner.asked.length, l.log]).toEqual(["check passed, kept, ran", "check passed, admitted", 2, true, 2, 1, ["submit no-answer"]]);

    // A retry superseded the job while its outcome was kept: nothing more is signed or submitted for it. A retry is a new job, with its own record.
    const s = made();
    s.scopes.answers = [refusedFor("merge-in-progress"), refusedFor("not-this-job")];
    await s.deliver();
    s.scopes.state = "superseded";
    const signed = s.key.signed.length;
    expect([await s.deliver(), s.key.signed.length - signed, await s.deliver()]).toEqual(["check passed, superseded", 0, "nothing: closed"]);
  });
});
