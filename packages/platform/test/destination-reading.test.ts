import { expect, test } from "vitest";
import type { Entry, FactRef, Grant, RulesObservation } from "@generalbusiness/artroom-contract";
import { factRefOf, isFactRef } from "@generalbusiness/artroom-bytes";
import type { RuleGiven, StateView } from "@generalbusiness/artroom-derive";
import { d, keys, otherLane, t } from "@generalbusiness/artroom-derive/testing";
import { decidingKeys, manifestAuthors, readLane } from "../src/destination-reading.ts";
import { DESTINATION_CHANGED_SET, isJudgeChanges, isRecordedJudgeEvidence, type Statement } from "../src/reservation.ts";
import { RULES_SCOPE, rulesAnswer } from "../src/rules-scope.ts";

// STAND-INS: recorded lane facts, authority and observations made by hand. These tests show the destination's pure reader,
// rather than a lane's admission or a membership read. Every subject and provenance check is derived from the records below.
const member = keys.rita.member;
const lane = otherLane;
const grant = (actor = keys.rita, actions = ["change.check"]): Grant => ({ issued: { at: lane, seq: 0, hash: d("a") }, subject: actor.member, key: actor.key, principal: null, actions, within: lane, notAfter: null, fresh: { observation: { of: actor.member.membership, head: { seq: 4, hash: d("b") }, key: actor.key, keyState: "active", member: actor.member.member, memberState: "active", role: "maintainer", actions, within: { membership: actor.member.membership }, controller: null, controllerActive: null, notAfter: null, definition: "platform:membership@1", at: t(0) }, read: { run: "run_test" as never, n: 1 }, use: "fresh", prior: null } });
const made = (seq: number, kind: string, fields: Record<string, unknown>, effects: Entry["effects"] = [], actor = keys.rita): Entry => ({ v: 1, at: lane, seq, prev: d("c"), time: t(0), input: { type: "act", signed: { intent: { v: 1, to: lane, actor: actor.key, kind, on: null, expected: {}, idempotencyKey: `entry-${seq}`, notAfter: t(100), fields }, signature: "fake" }, authority: [grant(actor)], presented: {} }, uses: [], prepared: [], effects, sends: [] } as unknown as Entry);
const manifest = made(2, "propose-manifest", { base: "a".repeat(40), integration: "b".repeat(40), tree: "c".repeat(40), complete: true, selected: [] }, [
  { effect: "list", item: 2, slot: "authors", change: "add", member: keys.una.member },
  { effect: "party", item: 2, slot: "integrator", member },
]);
const merge = made(3, "merge", { manifest: 2 });
const review = made(4, "review-verdict", { manifest: 2, verdict: "approve" }, [], keys.una);
const job = made(5, "request-check", { manifest: 2, name: "verify", configuration: d("d") }, [{ effect: "value", item: 5, slot: "tree", value: "c".repeat(40) }]);
const check = made(6, "check", { job: 5, tree: "c".repeat(40), configuration: d("d"), outcome: "passed" }, [{ effect: "state", item: 5, state: "passed" }]);
const statement: Statement = { operation: factRefOf(merge), manifest: factRefOf(manifest), verdicts: [{ review: factRefOf(review), reviewer: keys.una.member, verdict: "approve" }], jobs: [{ job: factRefOf(job), name: "verify", state: "passed", decidedBy: factRefOf(check) }], reports: [], links: [] };
// The state is made by hand; its answer is the platform's actual projection of the stored checker MemberRef to a MemberId.
const rulebook = { ...lane, kind: "rules" as const };
const rulesState = { scope: () => ({ at: rulebook, status: "active", head: { seq: 0, hash: d("a") } }), page: () => ({ items: [{ type: "rules", state: "current", refs: { published: null }, values: { approvals: 1, ownerMayReview: false, labels: [], singleControllerException: false, checks: [{ name: "verify", configuration: d("d"), checker: member, required: true }] } }], more: false }) } as unknown as Pick<StateView, "scope" | "page">;
const rules: RulesObservation = { ...rulesAnswer(rulesState, { of: rulebook, asked: "rules" }, RULES_SCOPE)!, at: t(0) };
const given = (entries: readonly Entry[]): Pick<RuleGiven, "uses" | "observed"> => ({ uses: entries.map((entry) => ({ fact: factRefOf(entry), entry, under: "change" })), observed: (asked) => "key" in asked ? grant(asked.key === keys.una.key ? keys.una : keys.rita).fresh : null });
const records = [manifest, merge, review, job, check];

// Invariant: the rule reads the lane's recorded attribution and provenance; a required configured check contributes its
// passed deciding key, and another job, checker, configuration, extra passed target or wrong reference cannot substitute.
test("the destination derives authors and second-step keys from retained entries and verifies each passed check against the observed configuration and checker", () => {
  const read = readLane(given(records), statement, rules)!;
  expect(rules.content.asked === "rules" && rules.content.checks[0]!.checker).toBe(member.member);
  expect(manifestAuthors(manifest)).toEqual([keys.una.member.member, member.member]);
  expect([read.sound, read.verdicts, read.checks["verify"]]).toEqual([true, [{ sound: true, key: keys.una.key }], { opening: "sound", deciding: true, key: keys.rita.key }]);
  expect(decidingKeys(given(records), statement, rules)).toEqual([keys.una.key, keys.rita.key]);
  const changed = (entry: Entry, change: (entry: Entry) => void) => { const copy = structuredClone(entry); change(copy); const named = JSON.parse(JSON.stringify(statement), (_key, value) => isFactRef(value) && value.seq === entry.seq ? factRefOf(copy) : value) as Statement; return readLane(given(records.map((existing) => existing.seq === entry.seq ? copy : existing)), named, rules)!; };
  const field = (entry: Entry, name: string, value: unknown) => { if (entry.input.type === "act") (entry.input.signed.intent.fields as Record<string, unknown>)[name] = value; };
  expect(changed(merge, (entry) => field(entry, "manifest", 99)).sound).toBe(false);
  expect(changed(review, (entry) => field(entry, "manifest", 99)).verdicts[0]?.sound).toBe(false);
  expect(changed(job, (entry) => field(entry, "configuration", d("e"))).checks["verify"]?.opening).toBe("other-configuration");
  expect(changed(check, (entry) => field(entry, "job", 99)).checks["verify"]?.deciding).toBe(false);
  expect(changed(check, (entry) => { (entry.effects as Entry["effects"][number][]).push({ effect: "state", item: 99, state: "passed" }); }).checks["verify"]?.deciding).toBe(false);
  expect(changed(check, (entry) => { if (entry.input.type === "act") (entry.input.authority as Grant[])[0] = grant(keys.una); }).checks["verify"]?.deciding).toBe(false);
  // The member ID alone never binds the signer: the membership scope and its incarnation must match the current read.
  for (const membership of [{ ...member.membership, scope: lane.scope }, { ...member.membership, inc: lane.inc }]) {
    expect(changed(check, (entry) => {
      if (entry.input.type !== "act") return;
      const authority = entry.input.authority[0]!;
      (authority.subject as { membership: typeof membership }).membership = membership;
      (authority.fresh!.observation as { of: typeof membership }).of = membership;
    }).checks["verify"]?.deciding).toBe(false);
  }
  expect(changed(check, (entry) => { if (entry.input.type === "act") (entry.input.authority[0]! as { key: typeof keys.una.key }).key = keys.una.key; }).checks["verify"]?.deciding).toBe(false);
  expect(changed(check, (entry) => { if (entry.input.type === "act") (entry.input.authority[0]! as { fresh: Grant["fresh"] | null }).fresh = null; }).checks["verify"]?.deciding).toBe(false);
  const altered = { ...statement, manifest: { ...statement.manifest, seq: 99 } as FactRef };
  expect(readLane(given(records), altered, rules)).toBeNull();
  expect(decidingKeys(given(records), { ...statement, jobs: [statement.jobs[0]!, statement.jobs[0]!] }, rules)).toEqual([keys.una.key]);
  const noCheckRead = { ...given(records), observed: (): never => { expect.fail("an uncounted check's key is no subject of the row"); } };
  expect(readLane(noCheckRead, { ...statement, jobs: [{ ...statement.jobs[0]!, state: "failed" }] }, rules)!.checks["verify"]?.deciding).toBe(false);
  expect(readLane(noCheckRead, { ...statement, jobs: [statement.jobs[0]!, statement.jobs[0]!] }, rules)!.checks["verify"]?.deciding).toBe(false);
});

// Invariant: the outcome records a digest for the changed set; the retained domain bounds its contents separately.
test("judge evidence names its changed set by digest and refuses an inline or oversized set", () => {
  const evidence = { head: "a".repeat(40), present: true, tree: "c".repeat(40), firstParent: "a".repeat(40), ancestors: [], changes: d("f") };
  expect(isRecordedJudgeEvidence(evidence)).toBe(true);
  expect(isRecordedJudgeEvidence({ ...evidence, changes: { paths: [], links: [], unreadable: 0 } })).toBe(false);
  expect(isJudgeChanges({ paths: ["src/a.ts"], links: [], unreadable: 0 })).toBe(true);
  expect(isJudgeChanges({ paths: ["b", "a"], links: [], unreadable: 0 })).toBe(false);
  expect(isJudgeChanges({ paths: ["a", "a"], links: [], unreadable: 0 })).toBe(false);
  expect(isJudgeChanges({ paths: Array(DESTINATION_CHANGED_SET.paths + 1).fill("a"), links: [], unreadable: 0 })).toBe(false);
  expect(isRecordedJudgeEvidence({ ...evidence, present: false, changes: d("f") })).toBe(false);
});
