import { expect, test } from "vitest";
import type { MemberRef } from "@generalbusiness/artroom-contract";
import { timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/artroom-lanes";
import { paul, proposed, rita, room, routed, una } from "../../lanes/test/support/room.ts";
import { act, actsOn, changeStates, listLanes, loadChange, loadIssue, loadRules, openRoom, type Session } from "../src/index.ts";

const SERVICE = "https://scopes.test";

// Invariant: the page's own data functions, over the Worker's HTTP routes and a member's key, show plan 019's story as the room
// records it: the issue with its comment, assignment and state; the change with its reviews by extent, its merges and the
// destination's publication; the acts each member may sign now, from the definition and their role; an act that takes effect,
// and a refusal shown by its reason with the head unmoved; and plan 016's states of the change as the story reaches them.
//
// The room is the lanes package's `room()` on the demo profile, as in `packages/lanes/test/story.scope.test.ts`: real platform
// scopes under the deployed class and the production authority, lanes created by the real directory, grants read from the real
// membership scope. Every read and act of the page goes through `routed`, the Worker's HTTP routes, called in the test's isolate.
//
// | Part | Is |
// |---|---|
// | The page's reads and acts | Real: `src/data.ts`, over the client's HTTP transport. No DOM. |
// | The setup the page cannot do | The fixture: the founding, the rules, the two activations, filing the issue and opening the change with its version (a hold under the stand-in host). The directory refuses `open-issue` from a client that sends no definition bytes. |
// | The Git host | A STAND-IN: `OutsideDouble` for the destination, `Host` for each lane. No repository exists. |
// | The changed set of a publication | SCRIPTED: `Room.changes`. |
// | The scheduler | The fixture's `publish`, which drives the destination's dispatchers and answers each host request. |
// | The readers | The test readers, which let every reader read: membership gives no read session here, and the page reads without one. |
test("the page's data functions on the demo story: the issue, the change, the acts each member may sign, an act that takes effect, a refusal by its reason with nothing written, and the states of the change from waiting for a reviewer to publication confirmed (STAND-IN: the Git host; SCRIPTED: the changed set)", async () => {
  const r = await room();
  expect(await r.publishRules({ approvals: 1, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 1, checks: [] }) })).toMatchObject({ answer: "accepted" });
  await r.activate(issueDemo, DEMO_DIGESTS.issue);
  await r.activate(changeDemo, DEMO_DIGESTS.change);
  const I = await r.lane(rita, "open-issue", issueDemo, DEMO_DIGESTS.issue, { title: "The parser drops comments", conditions: ["comments survive a round trip"] });

  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const as = (who: { secret: Uint8Array }): Session => ({ service: SERVICE, secret: who.secret, fetch, now: () => timeMs(net.clock.now)! });
  const member = async (handle: string): Promise<MemberRef> => r.member(handle);

  // Opening the room: the directory names membership, the rules scope and the destination; the caller's standing is read.
  const forPaul = await openRoom(as(paul), r.D.name);
  expect([forPaul.membership.scope, forPaul.rules, forPaul.destination, forPaul.me?.handle, forPaul.me?.role]).toEqual([r.M.name, r.rules.name, r.G.name, "@paul", "member"]);
  const forRita = await openRoom(as(rita), r.D.name);
  const forUna = await openRoom(as(una), r.D.name);
  expect(forRita.me?.role).toBe("admin");

  // The room's issues: the directory's index row, with the lane's own state.
  expect((await listLanes(forPaul)).issues).toEqual([{ scope: I.name, number: 1, kind: "issue", title: "The parser drops comments", state: "open", draft: null }]);

  // The acts on the issue come from its definition and the caller's role: a member may comment and may not assign.
  const paulsOnIssue = (await actsOn(forPaul, I.name)).acts.map((a) => a.kind);
  expect(paulsOnIssue).toContain("comment");
  expect(paulsOnIssue).not.toContain("assign");
  expect((await actsOn(forRita, I.name)).acts.map((a) => a.kind)).toContain("assign");
  // Only the profile's acts are offered: `label` is a row of the full definition, not of `issue-demo`.
  expect((await actsOn(forRita, I.name)).acts.map((a) => a.kind)).not.toContain("label");

  // Two acts take effect through the page: paul comments, and rita assigns vic.
  const commented = await act(forPaul, I.name, "comment", { fields: { body: "I see it too, on every file with a trailing comment." } });
  expect(commented.answer.answer).toBe("accepted");
  expect(commented.after.seq).toBeGreaterThan(commented.before.seq);
  expect((await act(forRita, I.name, "assign", { on: 0, fields: { assignees: [await member("@vic")] as never } })).answer.answer).toBe("accepted");
  expect(await loadIssue(forPaul, I.name)).toMatchObject({
    number: 1, title: "The parser drops comments", state: "open", requester: "@rita", assignees: ["@vic"], conditions: ["comments survive a round trip"],
    comments: [{ author: "@paul", state: "visible", body: "I see it too, on every file with a trailing comment." }],
  });

  // A pull request that closes the issue, opened with its version by the fixture. una asks paul to review it, through the page.
  const { C, manifest } = await proposed(r, I, una, "@una", [], changeDemo, DEMO_DIGESTS.change);
  expect((await act(forUna, C.name, "request-review-own", { fields: { requested: await member("@paul") } })).answer.answer).toBe("accepted");
  let change = await loadChange(forUna, C.name);
  expect(changeStates(change)).toEqual([{ state: "waiting for a reviewer", detail: expect.stringMatching(/^@paul is asked to review, by @una/) }]);
  expect((await listLanes(forUna)).changes.map((row) => [row.scope, row.kind, row.state])).toEqual([[C.name, "pr", "open"]]);

  // A refusal: una's role holds `change.review`, so the page offers her `review-verdict`; the lane refuses it by its guard, because
  // she is an author of the version. The answer is the reason, and the lane's head does not move.
  expect((await actsOn(forUna, C.name)).acts.map((a) => a.kind)).toContain("review-verdict");
  const refused = await act(forUna, C.name, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } });
  expect(refused.answer).toMatchObject({ answer: "refused", reason: "guard-failed", name: "author-cannot-review" });
  expect(refused.after).toEqual(refused.before);

  // paul approves for the source extent, answering the request, which the lane then records as met. Merging is offered to rita, an
  // admin, and not to paul, a member.
  const request = change.requests[0]!.id;
  expect((await act(forPaul, C.name, "review-verdict", { fields: { manifest, request, verdict: "approve", extent: "source" } })).answer.answer).toBe("accepted");
  expect((await loadChange(forPaul, C.name)).requests.map((rq) => [rq.requested, rq.state])).toEqual([["@paul", "met"]]);
  expect((await actsOn(forPaul, C.name)).acts.map((a) => a.kind)).not.toContain("merge");
  expect((await actsOn(forRita, C.name)).acts.map((a) => a.kind)).toContain("merge");

  // The change touches an instruction file for agents and a source file. rita's merge takes effect in the lane; the destination
  // does not reserve it, and the page names the rules extent that is not met. Before the stand-in host answers, the destination's
  // first operation for the publication, its judge read, is queued.
  r.changes = { paths: ["AGENTS.md", "src/parser.ts"], links: [], unreadable: 0 };
  expect((await act(forRita, C.name, "merge", { fields: { manifest, reports: [] } })).answer.answer).toBe("accepted");
  await r.settle();
  change = await loadChange(forRita, C.name);
  expect(changeStates(change)).toEqual([
    { state: "publication in progress", detail: expect.stringMatching(/^Merge \d+ is intended; the destination's publication \d+ is queued\.$/) },
    { state: "effect queued", detail: expect.stringMatching(/^judge, operation \d+:0, attempt 1: opened\.$/) },
  ]);
  await r.publish();
  change = await loadChange(forRita, C.name);
  expect(change.merges.map((m) => [m.state, m.reason, m.publication?.state])).toEqual([["refused", "rules-not-met:rules", "not-reserved"]]);
  expect(change.reviews.map((rv) => [rv.reviewer, rv.verdict, rv.extent])).toEqual([["@paul", "approve", "source"]]);
  expect(change.rules?.extents.map((e) => e.name)).toEqual(["rules", "infrastructure", "source"]);
  // The destination's judge read was confirmed by the stand-in host; what it read did not meet the rules.
  expect(changeStates(change)).toEqual([
    { state: "policy not met", detail: expect.stringMatching(/^Merge \d+ was not reserved: the rules are not met for the extent rules\.$/) },
    { state: "effect confirmed", detail: expect.stringMatching(/^judge, operation \d+:0, attempt 1: confirmed\.$/) },
  ]);
  expect((await loadIssue(forRita, I.name)).state).toBe("open");

  // rita, the rules scope's controller, approves for the rules extent and merges again. The destination publishes; each of its
  // outside operations for the publication is confirmed by the stand-in host; the merge closes the issue.
  expect((await act(forRita, C.name, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } })).answer.answer).toBe("accepted");
  expect((await act(forRita, C.name, "merge", { fields: { manifest, reports: [] } })).answer.answer).toBe("accepted");
  await r.publish();
  change = await loadChange(forPaul, C.name);
  expect([change.state, change.merges.map((m) => m.state)]).toEqual(["merged", ["refused", "published"]]);
  const landed = change.merges[1]!;
  expect(landed.publication?.state).toBe("published");
  const operations = landed.publication?.operations ?? [];
  expect(new Set(operations.map((o) => o.kind))).toEqual(new Set(["judge", "mint", "push", "receipt", "revoke"]));
  expect(changeStates(change).map((s) => s.state)).toEqual(["publication confirmed", ...operations.map(() => "effect confirmed")]);
  expect(await loadIssue(forPaul, I.name)).toMatchObject({ state: "closed", closeReason: "completed", assignees: ["@vic"] });

  // The rules of the room, read from the rules scope; rita is the one member whose role holds `rules.publish`.
  const rules = await loadRules(forPaul);
  expect(rules).toMatchObject({ approvals: 1, ownerMayReview: false, singleControllerException: false, controllers: ["@rita"] });
  // The revision is the position of the last publish, as the rules scope's own item records it.
  expect(rules.revision).toBe((await r.rules.item(0)).refs["published"]);
  expect(typeof rules.revision).toBe("number");
  expect(rules.extents?.map((e) => [e.name, e.approvals, e.approver, e.class])).toEqual([["rules", 1, "rules.publish", "authority"], ["infrastructure", 1, "change.merge", "deployment"], ["source", 1, "change.review", "content"]]);
  expect(rules.definitions.map((d) => [d.name, d.digest, d.state])).toEqual([["issue", DEMO_DIGESTS.issue, "active"], ["change", DEMO_DIGESTS.change, "active"]]);
  // The rules scope's acts: rita may publish the rules; paul may not.
  expect((await actsOn(forRita, r.rules.name)).acts.map((a) => a.kind)).toContain("publish");
  expect((await actsOn(forPaul, r.rules.name)).acts.map((a) => a.kind)).not.toContain("publish");
}, 120_000);
