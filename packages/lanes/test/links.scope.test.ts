import { expect, test } from "vitest";
import type { Entry, Input, ScopeRef } from "@generalbusiness/artroom-contract";
import type { Delivered } from "@generalbusiness/artroom-derive";
import { graph, net, onCode, rita, una } from "./support/graph.ts";

type Decided = Extract<Input, { type: "delivery"; decision: string }>;
type Recorded = Extract<Input, { type: "delivery"; clause: string }>;
/** The requests a history decided, in the order of arrival: the position of the sender's entry, the update's state and the decision. `from`: those of one sender. */
const decided = (entries: readonly Entry[], from?: ScopeRef) => entries.flatMap((e) =>
  (e.input.type === "delivery" && "decision" in e.input && (!from || e.input.from.at.scope === from.scope) ? [[(e.input as Decided).from.seq, ((e.input as Decided).message.body as { state?: string }).state, (e.input as Decided).decision]] : []));
/** The results a history recorded, by the position of the entry that sent each request. */
const results = (entries: readonly Entry[]) => entries.flatMap((e) => (e.input.type === "delivery" && "clause" in e.input ? [[(e.input as Recorded).message.of.from.seq, (e.input as Recorded).clause]] : [])).sort((a, b) => Number(a[0]) - Number(b[0]));
/** An update of the relationship `closes` in that state. */
const update = (state: string) => (e: Delivered) => e.message.class === "request" && (e.message.body as { name?: string; state?: string }).name === "closes" && (e.message.body as { state?: string }).state === state;
const oid = (c: string) => c.repeat(40);

test("T5a, a link is the change lane's and the issue keeps a copy of it: set then removed, and removed then set, end the same; the older update that arrives late is recorded superseded, each request has one result, and the issue does not move", async () => {
  // Real scopes: one issue lane and two change lanes, one for each order, with real delivery between them, and transport held to swap the order. No peer is
  // used and no capability guard is asked: the scripted test capability, a STAND-IN, is present only because no scope runs under a
  // lane definition without one. Not proved: anything about a merge. That is T5b.
  const g = await graph();
  const G = await g.goal();
  for (const late of [false, true]) {
    const C = await g.change();
    // Late: the update "set" is held back until the update "removed" has arrived.
    net.hold = late ? update("set") : null;
    const set = (await C.did(rita, "link-own", { fields: { issue: G.at, how: "manual" } })).fact.seq;
    await g.settle();
    const removed = (await C.did(rita, "unlink-own", { on: set })).fact.seq;
    await g.settle();
    net.hold = null;
    await g.later(1);
    // In the issue: one deciding entry for each update, in the order of arrival. The copy is the link at its higher revision.
    expect(decided(await G.entries(), C.at)).toEqual(late ? [[removed, "removed", "applied"], [set, "set", "superseded"]] : [[set, "set", "applied"], [removed, "removed", "applied"]]);
    expect([(await G.state()).relation(C.at, "closes", set), (await G.item(0)).state]).toEqual([{ owner: C.at, name: "closes", item: set, state: "removed", revision: removed }, "open"]);
    // In the change lane: one result for each request, by the request it names. It says how the update was decided, and no more.
    expect(results(await C.entries())).toEqual([[set, late ? "superseded" : "applied"], [removed, "applied"]]);
  }
});

test("T5b, a merge closes a linked issue once: the issue closes by its own deciding entry, in either order of the link's updates; a close by hand is kept; a repeat of the publication or of its update, also after a reopen, changes nothing (the manifest is on the capability's code, with a STAND-IN for the Git host; SCRIPTED: a destination peer's publication and a rules peer)", async () => {
  // Real scopes: a change lane and two issue lanes, with real delivery of every update between them, on the code of `hold@1` and
  // `git-read@1` as the production ports hold it. STAND-INS: the publication is one handwritten entry of a scripted destination
  // peer, the rules are one of a scripted rules peer, and `Host` answers the attempts that the manifest's staging opened, in place
  // of a Git host. So this shows what the lanes do once a publication is recorded, and that the publication releases the pin of
  // the manifest that it merged, on the lane's own records. It shows nothing about a real destination: its reservation, its
  // commit, or when and whether it publishes. Nor about a real host.
  const g = await graph();
  onCode();
  const [G, H, C] = [await g.goal(), await g.goal(), await g.change()];
  const peer = (e: Delivered) => "scope" in e.to && (e.to.scope === g.destination.at.scope || e.to.scope === g.rules.at.scope);
  // Nothing reaches a peer: it has no object. And the update "set" to G is held back, so that "merged" arrives there first.
  net.hold = (e) => peer(e) || (update("set")(e) && "scope" in e.to && e.to.scope === G.name);
  expect(await C.stub.deliver(g.rules.relate(C.at, "rules", "published", { approvals: 0, checks: [], ownerMayReview: true }))).toMatchObject({ answer: "recorded" });
  const offer = (await C.did(rita, "offer", { fields: { offeree: una.member, terms: "Integrate." } })).fact;
  await C.did(una, "accept", { on: offer.seq, fields: { terms: offer } });
  const hold = (await C.did(una, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  await C.instance(una, hold, "i-1");
  const manifest = (await C.stagedDid(una, "propose-manifest", { fields: { hold, instance: "i-1", base: oid("0"), integration: oid("c"), tree: oid("3"), complete: true, selected: [], decisions: [] } })).fact.seq;
  // The manifest was admitted on a pin that the lane holds for it: `held`, with the entry that opened the manifest.
  const pins = async () => (await C.state()).records("hold@1", "pin").map((pin) => [pin.state, pin.values["commit"], pin.values["admitted"], pin.values["by"]]);
  expect(await pins()).toEqual([["held", oid("c"), manifest, null]]);
  const toG = (await C.did(rita, "link-own", { fields: { issue: G.at, how: "keyword" } })).fact.seq;
  const toH = (await C.did(rita, "link-own", { fields: { issue: H.at, how: "manual" } })).fact.seq;
  await g.settle();
  // H is closed by hand before the merge.
  const hand = (await H.did(rita, "close-own", { on: 0, fields: { reason: "not-planned" } })).fact.seq;
  const merge = (await C.did(rita, "merge", { fields: { manifest, reports: [] } })).fact;
  await g.settle();

  // SCRIPTED: the destination publishes. The change lane records it once, and tells each issue whose link is set.
  const publication = g.destination.relate(C.at, "publication", "published", { operation: merge, outcome: "published", commit: oid("9") });
  const recorded = await C.stub.deliver(publication);
  if (recorded.answer !== "recorded") expect.fail(`the publication was not recorded: ${JSON.stringify(recorded)}`);
  const published = recorded.fact.seq;
  await g.settle();
  expect([(await C.item(merge.seq)).state, (await C.item(merge.seq)).values["commit"], (await C.item(0)).state]).toEqual(["published", oid("9"), "merged"]);
  // The entry that records the publication releases the pin of the manifest that it merged. The row names the commit alone, and
  // the pin is found by the manifest's item: the entry that admitted it (authority note, section 5.7).
  expect(await pins()).toEqual([["released", oid("c"), manifest, published]]);
  expect((await C.entry(published)).sends.map((s) => [s.to, s.message.class, (s.message as { body?: { state?: string } }).body?.state])).toEqual([
    [G.at, "request", "merged"], [H.at, "request", "merged"], [g.office.at, "advisory", undefined], [g.destination.at, "result", undefined],
  ]);

  // G: "merged" is the first update it sees for this link. It closes, and what closed it is its own entry that decided the update.
  const closing = (await G.entries()).length - 1;
  expect(decided(await G.entries())).toEqual([[published, "merged", "applied"]]);
  expect(await G.item(0)).toMatchObject({ state: "closed", values: { closeReason: "completed" }, refs: { closedBy: closing } });
  expect((await G.entry(closing)).input).toMatchObject({ type: "delivery", from: { at: C.at, seq: published } });
  // H: the copy becomes "merged" and nothing else changes. The close by hand is kept.
  expect(decided(await H.entries())).toEqual([[toH, "set", "applied"], [published, "merged", "applied"]]);
  expect([await H.item(0), (await H.entries()).at(-1)!.effects.map((e) => e.effect)]).toMatchObject([{ state: "closed", values: { closeReason: "not-planned" }, refs: { closedBy: hand } }, ["relation"]]);

  // One close for one publication. A repeat of the publication, and a repeat of its update, are answered with the first entry.
  const heads = async () => [(await C.entries()).length, (await G.entries()).length];
  const before = await heads();
  const merged = await C.envelope(published, 0);
  expect([await C.stub.deliver(publication), await G.stub.deliver(merged)]).toEqual([recorded, { answer: "recorded", fact: await G.fact(closing) }]);
  await g.settle();
  expect(await heads()).toEqual(before);
  // The older update "set" now arrives at G. It is recorded superseded, and the issue is as it was. A close by hand is refused.
  net.hold = peer;
  await g.later(1);
  expect([decided(await G.entries()).at(-1), (await G.item(0)).refs["closedBy"], await G.asks(rita, "close-own", { on: 0, fields: {} })]).toEqual([[toG, "set", "superseded"], closing, "guard-failed"]);
  // The requester reopens the issue. The same update again changes nothing: the issue stays open.
  await G.did(rita, "reopen-own", { on: 0 });
  const reopened = (await G.entries()).length;
  expect([await G.stub.deliver(merged), (await G.entries()).length, await G.item(0)]).toMatchObject([{ answer: "recorded", fact: { seq: closing } }, reopened, { state: "open", refs: { closedBy: null } }]);
  // In the change lane each request has its one result, which says how the update was decided and not whether the issue closed.
  expect(results(await C.entries())).toEqual([[toG, "superseded"], [toH, "applied"], [published, "applied"], [published, "applied"]]);
});
