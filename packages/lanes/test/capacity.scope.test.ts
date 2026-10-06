import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { capable, graph, net, paul, rita, una, type Node } from "./support/graph.ts";
import type { change, issue } from "../src/index.ts";

/** A Git object ID. Nothing reads a repository here. */
const oid = (c: string) => c.repeat(40);
/** Comments, one after another, until one is not accepted: how many were accepted, and how the last was answered. */
async function fill(lane: Node<typeof issue> | Node<typeof change>): Promise<[number, string]> {
  for (let accepted = 0; ; accepted++) {
    const answer = await (lane as Node<typeof issue>).asks(rita, "comment", { fields: { body: `comment ${accepted}` } });
    if (answer !== "accepted") return [accepted, answer];
  }
}

test("T7, pending settlement at full capacity, for a copy: an issue lane that is full for new work still records the end of a link it holds a copy of; a link it holds no copy of waits; and its closing checkpoint still fits (entries only)", async () => {
  // Real scopes: an issue lane with a bound of 12 entries, and a change lane that links to it. No peer is used and no capability
  // guard is asked. The count is of entries only: items, records, bytes and pending requests are not counted yet. Not proved: any
  // of those dimensions, or the bound a deployment would configure.
  const g = await graph();
  const G = await g.goal({ ...PROPOSED_BOUNDS, scopeEntries: 12 });
  const C = await g.change();
  const set = (await C.did(rita, "link-own", { fields: { issue: G.at, how: "manual" } })).fact.seq;
  await g.settle();
  // Three entries are written: the genesis, its confirmation and the link. Two are reserved: one for the update that ends the
  // copy's wait, and one for the closing checkpoint. So seven comments fit, and the eighth is new work with no room.
  expect([await fill(G), (await G.entries()).length]).toEqual([[7, "scope-full"], 10]);

  // The link is removed. That update takes the copy out of `set`, so it is written against the copy's own reservation.
  const removed = (await C.did(rita, "unlink-own", { on: set })).fact.seq;
  await g.settle();
  expect([(await G.entries()).length, (await G.entries()).at(-1)!.input, (await G.state()).relation(C.at, "closes", set)]).toMatchObject([11, { type: "delivery", decision: "applied", from: { seq: removed } }, { state: "removed" }]);
  // It freed nothing for new work: the entry it used was the one reserved. A comment is still refused.
  expect(await G.asks(rita, "comment", { fields: { body: "one more" } })).toBe("scope-full");
  // A first update for a link that the lane holds no copy of is new work. It is not decided: the sender keeps the duty and offers it again.
  const again = (await C.did(rita, "link-own", { fields: { issue: G.at, how: "manual" } })).fact.seq;
  await g.settle();
  await g.later(1);
  expect([(await C.duties()).find((d) => d.duty === `${again}.0`), (await G.entries()).length]).toMatchObject([{ attempts: [{ answer: "retry" }, { answer: "retry" }], acknowledged: null, result: null }, 11]);
  // Nothing else is pending in the issue lane, so its last entry is the closing checkpoint, and it fits.
  expect([await G.stub.checkpoint(), (await G.entries()).length]).toMatchObject([{ answer: "written", fact: { seq: 11 } }, 12]);
});

test("T8, pending settlement at full capacity, for an item: a job reserves its deadline and its first answer, so the first check is written in a change lane that is full for new work, and a second answer is new work (entries only; SCRIPTED: a rules peer and the test capability)", async () => {
  // One real change lane with a bound of 16 entries. STAND-INS: the rules are one handwritten entry of a scripted rules peer, and
  // the scripted test capability answers the manifest's guards. Nothing is delivered out of the lane. Not proved: a real checker,
  // what a real rules scope requires, or capacity in any dimension but entries.
  // This scenario stays on the scripted capability, and the others with a manifest do not (T3 and T5b). Its bound of 16 entries
  // holds the reservations of a job and of a hold's item, which is what it states. On the capability's code the hold has a
  // workspace, and a fork that is `creating` alone reserves 42 entries (authority note, section 5.8), so `take-hold` does not fit
  // this bound. What a lane with a workspace reserves in all is the capacity composition that request `cc570904` owes.
  const g = await graph();
  net.capability = capable;
  const C = await g.change({ ...PROPOSED_BOUNDS, scopeEntries: 16 });
  net.hold = () => true;
  const configuration = textDigest("ci.yml");
  expect(await C.stub.deliver(g.rules.relate(C.at, "rules", "published", { approvals: 0, checks: [{ name: "ci", configuration, required: true, checker: paul.member }], ownerMayReview: true }))).toMatchObject({ answer: "recorded" });
  const offer = (await C.did(rita, "offer", { fields: { offeree: una.member, terms: "Integrate." } })).fact;
  await C.did(una, "accept", { on: offer.seq, fields: { terms: offer } });
  const hold = (await C.did(una, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  const manifest = (await C.did(una, "propose-manifest", { fields: { hold, instance: "i-1", base: oid("0"), integration: oid("c"), tree: oid("3"), complete: true, selected: [], decisions: [] } })).fact.seq;
  const job = (await C.did(una, "request-check", { fields: { manifest, name: "ci", configuration } })).fact.seq;
  // Eight entries are written. Four are reserved: the end of the hold, the job's deadline, the job's first answer, and the closing
  // checkpoint. So four comments fit, and the fifth is new work with no room.
  expect([(await C.entries()).length, await fill(C), (await C.entries()).length]).toEqual([8, [4, "scope-full"], 12]);

  // The checker's first answer settles the job, so it is written although the lane is full for new work.
  const answer = { fields: { job, tree: oid("3"), configuration, outcome: "passed" } } as const;
  await C.did(paul, "check", answer);
  expect([(await C.item(job)).state, (await C.entries()).length]).toEqual(["passed", 13]);
  // The job reserved two entries and its answer used one. So exactly one entry is free again for new work.
  expect(await fill(C)).toEqual([1, "scope-full"]);
  // A second answer on the same job settles nothing. It is new work, and there is no room for it.
  expect([await C.asks(paul, "check", answer), (await C.entries()).length]).toEqual(["scope-full", 14]);
});
