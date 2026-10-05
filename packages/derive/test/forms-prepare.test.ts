import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { intentDigest, isSealed } from "@generalbusiness/artroom-bytes";
import { JOB_READ_ACTION, WINDOWS, capabilitiesOf, clockOf, gitRead, holdCapability, judgePreparation, preparationStatus, settleOutcome } from "../src/index.ts";
import type { GrantDecision, Steps, Window } from "../src/index.ts";
import { kindOf } from "../src/operand.ts";
import { Scope, grantOf, keys, lane, laneDefinition, on, otherLane, t, variant } from "./fixtures.ts";

const { una, vic, paul, sam } = keys;

/**
 * Made-up step rules, for this test only: a stand-in for the rules of
 * `hold@1`, which `forms-records.test.ts` tests. `instance` makes one record
 * and opens one operation. `stage` is refused by a named guard. `token`
 * names no action. `retry` has no code. It shows the judge of a preparation
 * and nothing about a real step.
 */
const steps: Steps = {
  implements: (_capability, step) => step !== "retry",
  grant: (_capability, step) => (step === "token" ? null : { action: "hold", window: step === "check" ? WINDOWS.ordinary : WINDOWS.once }),
  derive: (_capability, step, given) => (step === "stage"
    ? { refused: { reason: "capability-refused", name: "not-staged" } }
    : { records: [{ kind: "instance", key: [0, "i1"], state: "current", values: { by: given.signer.member } }], opens: [{ owner: "hold@1", kind: "mint", attempts: 1 }] }),
};

describe("a preparation (scope contract, section 5.5), with stand-in step rules", () => {
  const s = new Scope(laneDefinition);                            // entries 0 and 1
  const grant = grantOf(una, s.at, ["hold"]);
  const windows: Window[] = [];
  const granted: GrantDecision = ({ window }) => { windows.push(window); return { result: "granted", grant }; };
  const ask = (signed: SignedIntent, step = "instance", over: { capability?: string; steps?: Steps | null; granted?: GrantDecision; reading?: string } = {}) =>
    judgePreparation(s.state, laneDefinition, { signed, capability: over.capability ?? "hold@1", step }, { clock: clockOf(s.state, over.reading ?? s.now), bounds: PROPOSED_BOUNDS, steps: over.steps === undefined ? steps : over.steps, granted: over.granted ?? granted });
  const said = (j: ReturnType<typeof ask>) => [j.result, "reason" in j ? j.reason : "", "name" in j ? j.name : ""].filter((part) => part !== "").join(" ");
  const signed = s.intent(una, "take-hold");

  test("a step is sealed as one entry with the signed intent, the one grant judged, the capability and the step; it derives records and operations and nothing else; the same three again write nothing; the act's key is not consumed", () => {
    const first = ask(signed);
    if (first.result !== "write") throw new Error(`not written: ${JSON.stringify(first)}`);
    const entry = s.seal(first.draft);
    expect([entry.input, entry.effects, entry.sends, entry.uses, isSealed(s.entries.at(-1))]).toEqual([
      { type: "preparation", signed, authority: [grant], capability: "hold@1", step: "instance" },
      [
        { effect: "record", capability: "hold@1", kind: "instance", key: [0, "i1"], state: "current", values: { by: una.member } },
        { effect: "operation", k: 0, owner: "hold@1", kind: "mint", attempts: 1 },
        { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
      ],
      [], [], true,
    ]);
    // Section 6.2: the entry's kind is its capability and its step, read from its own bytes. No act kind has that form.
    expect(kindOf(entry)).toBe("hold@1:instance");
    // Section 5.5, "A repeat": the index answers the same intent, capability and step with the first entry, also after `notAfter`.
    // Another step of the same intent is another entry's to prepare, and the intent's own turn is still to come.
    expect([ask(signed), ask(signed, "instance", { reading: t(3600) }), said(ask(signed, "stage")), s.state.accepted(una.key, signed.intent.idempotencyKey)])
      .toEqual([{ result: "repeat", seq: 2 }, { result: "repeat", seq: 2 }, "refused capability-refused not-staged", null]);
    // Section 9.1: what a settlement, a later act and a later outcome find of the intent's preparation, from the index and the state.
    expect(preparationStatus(s.state, s.own, intentDigest(signed.intent))).toEqual([{
      entry: s.fact(2), capability: "hold@1", step: "instance",
      operations: [{ operation: "2:0", kind: "mint", state: "pending" }], records: [{ kind: "instance", key: [0, "i1"], state: "current" }],
    }]);
    // The index and the record are members of the folded state. A state that holds neither has the members it had before they
    // existed, and no other, so its canonical bytes and its digest are what they were.
    expect([preparationStatus(s.state, s.own, intentDigest(s.intent(una, "take-hold").intent)), s.replay().snapshot() === s.state.snapshot(), Object.keys(s.state.all()).slice(-2), Object.keys(s.replay(2).all())])
      .toEqual([[], true, ["prepared", "records"], ["v", "scope", "items", "counts", "relations", "accepted", "requests", "decided", "creations", "operations", "texts"]]);
  });

  test("a refusal is an answer and no entry: each check, in the order of an act's, with the window that the step asks of its grant", () => {
    const elsewhere = s.intent(una, "take-hold", { to: otherLane });
    const fresh = () => s.intent(una, "take-hold");
    windows.length = 0;
    const head = s.head;
    expect([
      said(ask(fresh(), "job-read", { capability: "git-read@1" })),                 // a capability that the definition does not list
      said(ask(fresh(), "walk")),                                                    // a step that the version does not declare
      said(ask(elsewhere)),                                                          // `instance` is not `foreign`
      said(ask(elsewhere, "stage")),                                                 // `stage` is: the scope that owns the hold judges it
      said(ask(fresh(), "instance", { reading: t(60) })),                            // at `notAfter`
      said(ask(fresh(), "retry")), said(ask(fresh(), "instance", { steps: null })),  // no code for the step: nothing is judged
      said(ask(fresh(), "token")),                                                   // the rules name no action
      said(ask(fresh(), "instance", { granted: () => ({ result: "refused" }) })),
      said(ask(fresh(), "instance", { granted: () => ({ result: "unavailable" }) })),
      said(ask(fresh(), "instance", { granted: () => ({ result: "granted", grant: grantOf(vic, s.at, ["hold"]) }) })),   // a grant to another key
      said(ask(fresh(), "instance", { reading: t(-5) })),                            // a reading before the previous entry's time
    ]).toEqual([
      "refused bad-field", "refused bad-field", "refused misaddressed", "refused capability-refused not-staged", "refused expired",
      "unavailable unavailable", "unavailable unavailable", "refused unauthorized", "refused unauthorized", "unavailable authority-unavailable", "refused unauthorized",
      "unavailable clock-behind",
    ]);
    expect([windows.slice(0, 1), (ask(fresh(), "check"), windows.at(-1)), s.head]).toEqual([[WINDOWS.once], WINDOWS.ordinary, head]);
  });
});

/**
 * A made-up lane with the names that the step `job-read` reads of the
 * `change` lane: a `rules` item whose `checks` name a checker for each
 * check, and a `job` with a `name` and a `deadline`, 30 minutes after it is
 * opened. `decide` and `time-out` stand for the lane's rows `check` and
 * `job-deadline`: they move the job and nothing else.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const checking = variant(lane, (def: any) => {
  def.capabilities.push({ name: "git-read", version: 1 });
  const name = { type: "text", max: 64 };
  def.items.rules = { many: false, max: 1, states: { current: { final: false } }, initial: "current", parties: {}, refs: {}, values: { checks: { fixed: false, required: true, of: { type: "list", of: { type: "record", of: { name: { ...name, required: true }, checker: { type: "member", required: true } } }, max: 4 } } } };
  def.items.job = { many: true, max: 8, states: { requested: { final: false }, passed: { final: false }, "timed-out": { final: false } }, initial: "requested", parties: {}, refs: {}, values: { name: { fixed: true, required: true, of: name }, deadline: { fixed: true, required: true, of: { type: "time" } } } };
  const row = { also: {}, guards: [], sends: [], attention: [] };
  def.acts.publish = { ...row, step: "open", on: "rules", grant: "publish", fields: { checks: { ...def.items.rules.values.checks.of, required: true } }, effects: [{ value: { slot: "checks", from: { field: "checks" } } }] };
  def.acts["request-check"] = { ...row, step: "open", on: "job", grant: "propose", fields: { name: { ...name, required: true } }, effects: [{ value: { slot: "name", from: { field: "name" } } }, { value: { slot: "deadline", from: { time: { plusSeconds: 1800 } } } }] };
  const waiting = [{ state: ["requested", "timed-out"] }];
  def.acts.decide = { ...row, step: "transition", on: "job", grant: "check", fields: {}, guards: waiting, effects: [{ state: "passed" }] };
  def.acts["time-out"] = { ...row, step: "transition", on: "job", grant: "check", fields: {}, guards: waiting, effects: [{ state: "timed-out" }] };
});

describe("the step `job-read` of `git-read@1` (authority note, sections 3.11 and 5.7; plan step 24), on the capability's own code", () => {
  const code = capabilitiesOf(holdCapability({ tokensPerHold: 2, rootRetentionSeconds: null }), gitRead());
  const lanes = () => {
    const s = new Scope(checking);                                 // entries 0 and 1
    s.did(una, "publish", { fields: { checks: [{ name: "ci", checker: paul.member }, { name: "lint", checker: sam.member }] } });
    const job = (name: string) => s.fact(s.did(una, "request-check", { fields: { name } }).seq);
    // Every key holds the action of the step, so each refusal below is the step's own. `granted` records what the step asked of the grant.
    const asked: { action: string; window: Window }[] = [];
    const ask = (who: typeof paul, fields: Record<string, unknown>, over: { kind?: string; on?: number | null } = {}) => {
      const signed = s.intent(who, over.kind ?? "git-read@1:job-read", { fields: fields as never, ...(over.on === undefined ? {} : { on: over.on }) });
      const j = judgePreparation(s.state, checking, { signed, capability: "git-read@1", step: "job-read" }, {
        clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, steps: code, own: s.own,
        granted: ({ action, window }) => { asked.push({ action, window }); return { result: "granted", grant: grantOf(who, s.at, [JOB_READ_ACTION]) }; },
      });
      return { signed, j, said: j.result === "refused" ? `${j.reason}: ${j.detail}` : j.result === "repeat" ? `repeat ${j.seq}` : j.result };
    };
    const outcome = (operation: string, result: "confirmed" | "refused" | "unknown", body: unknown = {}) => {
      const j = settleOutcome(s.state, checking, { type: "outcome", operation: operation as never, attempt: 1, result, evidence: result === "unknown" ? { basis: "none", body } : { basis: "own-answer", body } }, { clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, owners: code });
      return j.result === "write" ? s.seal(j.draft) : j.result;
    };
    const token = (n: number): Record<string, unknown> | null => { const r = s.state.record("git-read@1", "token", [n]); return r && { state: r.state, ...r.values }; };
    return { s, job, ask, asked, outcome, token };
  };

  test("the checker that the lane's rules name is given one read token for a requested job, once: the entry holds the token `minting` with its one mint; every other request is refused and mints nothing", () => {
    const { s, job, ask, asked, token } = lanes();
    const [ci, lint] = [job("ci"), job("lint")];
    const decided = job("ci");
    s.did(paul, "decide", on(s, decided.seq));
    const head = s.head;
    // Each refusal, in the order of the note's row. No entry is written for any.
    expect([
      ask(paul, { job: ci, more: 1 }).said,                                // a field that the table does not name
      ask(paul, {}).said,                                                  // the job is not named
      ask(paul, { job: ci }, { kind: "request-check" }).said,              // an act's kind is not the step's
      ask(paul, { job: { ...ci, hash: lint.hash } }).said,                 // a fact that is not that entry's
      ask(paul, { job: s.fact(2) }).said,                                  // an entry of this lane that opened no job
      ask(sam, { job: ci }).said,                                          // a checker, and not the one that the rules name for `ci`
      ask(una, { job: ci }).said,                                          // the member who asked for the job
      ask(paul, { job: decided }).said,                                    // a job that is decided
      s.head,
    ]).toEqual([
      "bad-field: the intent is not the one of the step job-read: the job's fact, and nothing else",
      "bad-field: the intent is not the one of the step job-read: the job's fact, and nothing else",
      "bad-field: the intent is not the one of the step job-read: the job's fact, and nothing else",
      "guard-failed: the fact names no job of this lane",
      "guard-failed: the fact names no job of this lane",
      "guard-failed: the signer is not the checker that the lane's copy of the rules names for this job's check",
      "guard-failed: the signer is not the checker that the lane's copy of the rules names for this job's check",
      "guard-failed: the job is not requested",
      head,
    ]);
    // The grant: `change.check`, on an observation that serves this one commit.
    expect(new Set(asked.map((a) => `${a.action} ${a.window.seconds} ${a.window.once}`))).toEqual(new Set(["change.check 10 true"]));

    const first = ask(paul, { job: ci });
    if (first.j.result !== "write") throw new Error(`not written: ${first.said}`);
    const entry = s.seal(first.j.draft);
    const deadline = s.item(ci.seq).values["deadline"];
    expect([entry.input.type, kindOf(entry), entry.effects, entry.sends]).toEqual(["preparation", "git-read@1:job-read", [
      { effect: "record", capability: "git-read@1", kind: "token", key: [1], state: "minting", values: { purpose: "check-read", job: ci, before: deadline, mint: `${entry.seq}:0`, id: null, ends: null, revocation: null } },
      { effect: "operation", k: 0, owner: "git-read@1", kind: "mint", attempts: 1 },
      { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
    ], []]);
    // At most one read token for a job: the same signed intent is answered with the first entry, and another intent for the job is refused.
    expect([ask(paul, { job: ci }).said, judgePreparation(s.state, checking, { signed: first.signed, capability: "git-read@1", step: "job-read" }, { clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, steps: code, own: s.own, granted: () => ({ result: "refused" }) }), s.state.recordCount("git-read@1", "token")])
      .toEqual(["guard-failed: a job-read entry exists for this job", { result: "repeat", seq: entry.seq }, 1]);
    // Another job has its own token, with the next number. A token of `hold@1` is another capability's record.
    const second = ask(sam, { job: lint });
    if (second.j.result !== "write") throw new Error(`not written: ${second.said}`);
    s.seal(second.j.draft);
    expect([token(2)?.["job"], s.state.recordCount("hold@1", "token")]).toEqual([lint, 0]);
  });

  test("a job's read token is never live past its use: a mint answered in time makes it live and reserved; one answered after the job is decided, or whose end is not before the job's deadline, makes it revoking with its revocation; a lost answer leaves it minting", () => {
    const { s, job, ask, outcome, token } = lanes();
    const seal = (who: typeof paul, fact: ReturnType<typeof job>) => { const a = ask(who, { job: fact }); if (a.j.result !== "write") throw new Error(a.said); return s.seal(a.j.draft).seq; };
    const ends = (seconds: number) => ({ token: "tok_1", ends: t(seconds) });
    const reserved = () => code.reserves!(s.state, checking);

    // In time: `live`, with the host's ID and end time, and its revocation reserved (6 entries).
    const a = job("ci");
    const first = seal(paul, a);
    expect(reserved()).toBe(0);                                          // while `minting`, the closure of its mint holds the revocation
    outcome(`${first}:0`, "confirmed", ends(1700));
    expect([token(1)?.["state"], token(1)?.["id"], token(1)?.["ends"], s.last.effects.map((e) => e.effect), reserved()]).toEqual(["live", "tok_1", t(1700), ["attempt", "record"], 6]);

    // A deadline's timed entry opens nothing and ends no use: a late answer may still decide the job.
    const b = job("lint");
    const second = seal(sam, b);
    s.did(paul, "time-out", on(s, b.seq));
    outcome(`${second}:0`, "confirmed", ends(1700));
    expect(token(2)?.["state"]).toBe("live");

    // After the job is decided: never `live`. The outcome entry opens the revocation by the ID that the answer gave.
    const c = job("ci");
    const third = seal(paul, c);
    outcome(`${third}:0`, "unknown");
    expect(token(3)?.["state"]).toBe("minting");                          // a lost answer mints nothing again and settles nothing
    s.did(paul, "decide", on(s, c.seq));
    const late = outcome(`${third}:0`, "confirmed", ends(1700));
    expect([token(3)?.["state"], token(3)?.["revocation"], typeof late === "string" ? late : late.effects.slice(2)]).toEqual(["revoking", `${s.head.seq}:0`, [
      { effect: "operation", k: 0, owner: "git-read@1", kind: "revoke", attempts: 3 },
      { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
    ]]);
    outcome(`${s.head.seq}:0`, "confirmed", { token: "tok_1" });
    expect(token(3)?.["state"]).toBe("ended");

    // A token that the host would honour at the job's deadline or after it: never `live` either.
    const d4 = job("lint");
    const fourth = seal(sam, d4);
    outcome(`${fourth}:0`, "confirmed", ends(1800));
    expect(token(4)?.["state"]).toBe("revoking");
    // A refused mint minted nothing: `ended`, and nothing is revoked.
    const e = job("ci");
    const fifth = seal(paul, e);
    outcome(`${fifth}:0`, "refused", { send: "refused", why: "host-refused" });
    expect([token(5)?.["state"], s.last.effects.map((e) => e.effect)]).toEqual(["ended", ["attempt", "record"]]);
  });
});
