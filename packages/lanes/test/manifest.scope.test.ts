import { expect, test } from "vitest";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { answered, graph, http, onCode, paul, rita, sam, una, vic } from "./support/graph.ts";

/** A Git object ID. No repository exists here: the Git host is a stand-in. */
const oid = (c: string) => c.repeat(40);

test("T3, a manifest and its evidence: it is complete only by the plan's recorded facts, a later version in a child changes nothing in it, an author's verdict is refused, and it merges only on the approval and the passed check of its own version (on the capability's code; STAND-IN: the Git host; SCRIPTED: a rules peer; no destination exists)", async () => {
  // Real scopes: a goal, two concern lanes and a change lane, with real fetches between them, on the code of `hold@1` and
  // `git-read@1` as the production ports hold it. Every report and every version of the manifest is admitted on the lane's own
  // records: a root that was sealed before its ref, a check entry, and a pin for that one intent. STAND-INS: `Host` answers each
  // attempt that the code opened, in place of a Git host and a walk of commits; the rules are one handwritten entry of a scripted
  // rules peer; and the destination is a reference that no scope answers. So this shows what the lanes decide from recorded facts
  // and from their own capability records. It shows nothing about a real host, a walk of real commits, a real rules scope, or what
  // a destination judges and publishes.
  const g = await graph();
  const host = onCode();
  const G = await g.goal();
  // Everything below names the entry that filed the goal as the goal's conditions: the genesis of the issue lane, of the kind `file`.
  // The change lane pins another definition, and reads that kind from the entry (scope contract, sections 4.1 and 6.2).
  const goal = await G.fact(0);
  const plan = (await G.did(rita, "open-plan", {})).fact.seq;
  const a = (await G.did(rita, "add-concern", { fields: { plan, purpose: "The parser", role: "required", title: "Parse", conditions: ["it parses"] } })).fact.seq;
  const b = (await G.did(rita, "add-concern", { fields: { plan, purpose: "The printer", role: "required", title: "Print", conditions: ["it prints"] } })).fact.seq;
  const [A, B] = [await g.concern(G, a), await g.concern(G, b)];
  const sealed = (await G.did(rita, "seal-plan", { on: plan, fields: { goalAt: goal, required: [{ item: a, child: A.at }, { item: b, child: B.at }], optional: [] } })).fact;

  // Concern A is done by vic on the concern's own terms, judged by its requester, and fulfilled: the parent records the delivery.
  const filed = await A.fact(0);
  const ca = (await A.did(rita, "offer", { fields: { offeree: vic.member } })).fact;
  await A.did(vic, "accept", { on: ca.seq, fields: { terms: filed } });
  // A report is staged from the performer's own hold, with an instance: without one the lane stages nothing, and the act is refused.
  expect(await A.stagedAsks(vic, "report", { fields: { commitment: ca.seq, terms: filed, commit: oid("a"), tree: oid("1") } })).toBe("capability-refused: not-staged");
  await A.instance(vic, (await A.did(vic, "take-hold", { fields: { commitment: ca.seq } })).fact.seq);
  const ra = (await A.stagedDid(vic, "report", { fields: { commitment: ca.seq, terms: filed, commit: oid("a"), tree: oid("1"), claims: ["it parses"] } })).fact;
  // A report is judged by the requester of its commitment, and never by its author.
  expect(await A.asks(vic, "accept-report", { on: ra.seq, fields: { commitment: ca.seq, terms: filed } })).toBe("guard-failed");
  const aa = (await A.did(rita, "accept-report", { on: ra.seq, fields: { commitment: ca.seq, terms: filed } })).fact;
  await A.did(rita, "fulfil", { on: ca.seq, fields: { report: ra.seq } });
  await g.settle();
  expect(await G.item(a)).toMatchObject({ state: "delivered", refs: { child: A.at, result: ca } });
  // Concern B is done by una on terms that una proposed and the requester agreed to: changed terms, with their own terms fact.
  const cb = (await B.did(una, "propose-terms", { fields: { conditions: ["it prints", "in colour"] } })).fact;
  await B.did(rita, "agree", { on: cb.seq, fields: { terms: cb } });
  await B.instance(una, (await B.did(una, "take-hold", { fields: { commitment: cb.seq } })).fact.seq);
  const rb = (await B.stagedDid(una, "report", { fields: { commitment: cb.seq, terms: cb, commit: oid("b"), tree: oid("2") } })).fact;
  const ab = (await B.did(rita, "accept-report", { on: rb.seq, fields: { commitment: cb.seq, terms: cb } })).fact;

  // The change lane. una is responsible for the integration and holds; a manifest names exact entries of the other three lanes.
  const C = await g.change();
  const offer = (await C.did(rita, "offer", { fields: { offeree: una.member, terms: "Integrate the two concerns." } })).fact;
  await C.did(una, "accept", { on: offer.seq, fields: { terms: offer } });
  const hold = (await C.did(una, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  await C.instance(una, hold, "i-1");
  const version = { hold, instance: "i-1", goal, plan: sealed, base: oid("0"), integration: oid("c"), tree: oid("3"), complete: true } as const;
  const [fromA, fromB] = [{ accepted: aa, report: ra }, { accepted: ab, report: rb }];
  // Each version is prepared for its own intent: the first staging of the commit, and after it the reuse of the live root.
  const proposes = (selected: (typeof fromA)[], decisions: (typeof goal)[]) => C.stagedAsks(una, "propose-manifest", { fields: { ...version, selected, decisions } });
  // Completeness is derived from the facts named, in the commit. A required concern with no selection and no decision fails it.
  // So does a selection whose accepted terms are not the concern's own, until the parent has recorded that it accepts them.
  expect([await proposes([fromA], []), await proposes([fromA, fromB], [])]).toEqual(["guard-failed: not-complete", "guard-failed: not-complete"]);
  const decided = (await G.did(rita, "resolve-concern", { fields: { concern: b, kind: "accepted-as-delivered", reason: "Colour is welcome.", acceptance: ab, terms: cb } })).fact;
  // A comment is no report: an entry of another kind in the place of the accepted report is refused, whatever it says.
  const claim = (await A.did(vic, "comment", { fields: { body: "It is done, and it passes." } })).fact;
  expect(await proposes([{ accepted: aa, report: claim }, fromB], [decided])).toBe("guard-failed: selection-malformed");
  const m1 = (await C.stagedDid(una, "propose-manifest", { fields: { ...version, selected: [fromA, fromB], decisions: [decided] } })).fact.seq;
  // One root holds the commit, staged once. Each refused version left a pin that is still `provisional`, and the admitted one is `held`.
  const records = async (kind: string, state: string) => (await C.state()).recordCount("hold@1", kind, state);
  expect([await records("root", "live"), await records("pin", "provisional"), await records("pin", "held"), await records("check", "recorded"), host.asked.filter((kind) => kind === "stage").length]).toEqual([1, 3, 1, 4, 3]);
  // Its authors are derived: the integrator, the authors of each selected report, and the member each acts for.
  const manifest = await C.item(m1);
  expect(manifest.parties["authors"]).toMatchObject([{ member: "@paul" }, { member: "@quinn" }, { member: "@una" }, { member: "@vic" }]);

  // A later version in a child changes nothing in the manifest: it holds the exact entries it was proposed with.
  const later = (await B.stagedDid(una, "report", { fields: { commitment: cb.seq, terms: cb, commit: oid("e"), tree: oid("5") } })).fact;
  await B.did(rita, "accept-report", { on: later.seq, fields: { commitment: cb.seq, terms: cb } });
  expect(await C.item(m1)).toEqual(manifest);
  expect(manifest.values).toMatchObject({ selected: [fromA, fromB], decisions: [decided], complete: true, tree: oid("3") });

  // Review. An author of any selected work, the integrator, and the member an author acts for may not give a verdict.
  const verdict = { fields: { manifest: m1, verdict: "approve" } } as const;
  expect([await C.asks(vic, "review-verdict", verdict), await C.asks(una, "review-verdict", verdict), await C.asks(paul, "review-verdict", verdict)]).toEqual(Array(3).fill("guard-failed: author-cannot-review"));
  // Merge. Each refusal is named, in the order of the guards: no rules yet; then no approval; then the required check has not passed.
  const merges = (manifest = m1) => C.asks(rita, "merge", { fields: { manifest } });
  expect(await merges()).toBe("guard-failed: rules-unknown");
  // SCRIPTED: the rules, as one update from the rules peer that the change lane names. One approval, and one required check by paul.
  const configuration = textDigest("ci.yml");
  const published = g.rules.relate(C.at, "rules", "published", { approvals: 1, checks: [{ name: "ci", configuration, required: true, checker: paul.member }], ownerMayReview: false });
  expect(await C.stub.deliver(published)).toMatchObject({ answer: "recorded" });
  expect(await merges()).toBe("guard-failed: approvals-needed");
  const review = (await C.did(sam, "review-verdict", verdict)).fact;
  expect(await merges()).toBe("guard-failed: required-check-not-passed");
  // A job is a named check of the rules, on this manifest's tree, under the rules' configuration. A job that is only requested
  // meets nothing. Only the checker that the rules name answers it, and only for that tree.
  expect(await C.asks(una, "request-check", { fields: { manifest: m1, name: "ci", configuration: textDigest("other.yml") } })).toBe("guard-failed: not-a-check-of-the-rules");
  const job = (await C.did(una, "request-check", { fields: { manifest: m1, name: "ci", configuration } })).fact;
  const answer = { job: job.seq, tree: oid("3"), configuration, outcome: "passed" } as const;
  expect([await merges(), await C.asks(sam, "check", { fields: answer }), await C.asks(paul, "check", { fields: { ...answer, tree: oid("9") } })])
    .toEqual(["guard-failed: required-check-not-passed", "guard-failed: not-the-checker", "guard-failed: not-this-job"]);
  const check = (await C.did(paul, "check", { fields: answer })).fact;

  // Now the merge is admitted. Its entry carries the exact statement it rests on, to the destination: this manifest, each live
  // verdict and each job with the entry that decided it, and the links that are set.
  const merged = await C.did(rita, "merge", { fields: { manifest: m1 } });
  expect((await C.entry(merged.fact.seq)).sends).toEqual([{
    n: 0, to: g.destination.at,
    message: {
      class: "request", type: "tell",
      body: {
        message: "reserve",
        fields: {
          operation: { self: true }, manifest: await C.fact(m1), links: [],
          verdicts: [{ review, reviewer: sam.member, verdict: "approve" }],
          jobs: [{ job, name: "ci", state: "passed", decidedBy: check }],
        },
      },
    },
  }]);
  // While the merge is intended, the source is frozen: no new version.
  expect(await C.asks(una, "propose-manifest", { fields: { ...version, previous: m1, selected: [fromA, fromB], decisions: [decided] } })).toBe("guard-failed: merge-in-progress");
  // No destination receives the request. After three refused dispatches it is given up, and the lane is free again.
  await g.settle();
  for (const seconds of [1, 2, 4]) await g.later(seconds);
  expect(await C.item(merged.fact.seq)).toMatchObject({ state: "refused", values: { reason: "undelivered", commit: null } });

  // A new version of the same selection, with another tree. The approval and the passed check were of the earlier version:
  // neither counts for this one, and the earlier version can no longer merge.
  const m2 = (await C.stagedDid(una, "propose-manifest", { fields: { ...version, previous: m1, integration: oid("d"), tree: oid("4"), selected: [fromA, fromB], decisions: [decided] } })).fact.seq;
  // The entry of the new version releases the pin of the version that it supersedes, found by that manifest's item.
  expect((await C.state()).records("hold@1", "pin", { states: ["released"] }).map((pin) => [pin.values["commit"], pin.values["admitted"], pin.values["by"]])).toEqual([[oid("c"), m1, m2]]);
  expect([await merges(m1), await merges(m2)]).toEqual(["guard-failed: newer-version", "guard-failed: approvals-needed"]);
  await C.did(sam, "review-verdict", { fields: { manifest: m2, verdict: "approve" } });
  expect(await merges(m2)).toBe("guard-failed: required-check-not-passed");

  // A goal of a wrong kind is still refused: the entry that sealed the plan is an entry of the goal's lane, under the definition
  // `issue`, and its kind is neither `file` nor `revise`. And one row cannot do today what the lane forms say (delta DK6): a manifest
  // staged in another lane needs a check entry of the hold capability, which no source writes: with one presented, over the HTTP
  // route, the act gets past its shape and is refused there.
  const elsewhere = { instance: "i-1", lane: A.at, foreignHold: 7, base: oid("0"), integration: oid("f"), tree: oid("6"), complete: false, previous: m2, selected: [], decisions: [] } as const;
  expect([
    await C.stagedAsks(una, "propose-manifest", { fields: { ...version, previous: m2, goal: sealed, selected: [fromA, fromB], decisions: [decided] } }),
    await C.asks(una, "propose-manifest", { fields: elsewhere }),
    answered(await C.over(http, await C.signed(una, "propose-manifest", { fields: elsewhere, presented: { pin: ra } }))),
  ]).toEqual(["guard-failed", "guard-failed: source-shape", "guard-failed"]);
});
