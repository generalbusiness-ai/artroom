import { expect, test } from "vitest";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "../src/index.ts";
import { answered } from "./support/graph.ts";
import { merged, oid, paul, proposed, publicationOf, rita, room, una, vic } from "./support/room.ts";

// Plan 019's story on the pinned demo profile, against the real rules scope and the real destination (plan 024, the spine of the
// video; request i5). The room activates the two definitions of the profile, not the full ones, so every lane here runs under
// `issue-demo` or `change-demo`. The parts are those of `wiring.scope.test.ts`: real platform scopes under the deployed class and
// the production authority, lanes created by the real directory, grants read from the real membership scope.
//
// | Part | Is |
// |---|---|
// | The Git host | A STAND-IN: `OutsideDouble` for the destination, `Host` for each lane. No repository exists. |
// | The changed set of a publication | SCRIPTED: `Room.changes`. |
// | Agents | None. vic is a member; no task and no agent key is run. The agent's narrow grant is not in this story. |
test("the story on the demo profile: an issue is filed, commented on and assigned; a pull request that closes it touches the source and the rules; the source reviewer's approval is not enough and the merge is refused with the rules extent named; the rules scope's controller approves and the merge closes the issue; an act outside the profile is refused; and the rules are the room's own: raised to two approvals, the next merge needs two (STAND-IN: the Git host; SCRIPTED: the changed set)", async () => {
  const r = await room();
  expect(await r.publishRules({ approvals: 1, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 1, checks: [] }) })).toMatchObject({ answer: "accepted" });
  await r.activate(issueDemo, DEMO_DIGESTS.issue);
  await r.activate(changeDemo, DEMO_DIGESTS.change);

  // A person opens an issue. Any member comments on it. It is assigned, optionally: no rule of the room requires it.
  const I = await r.lane(rita, "open-issue", issueDemo, DEMO_DIGESTS.issue, { title: "The parser drops comments", conditions: ["comments survive a round trip"] });
  await I.did(paul, "comment", { fields: { body: "I see it too, on every file with a trailing comment." } });
  await I.did(rita, "assign", { on: 0, fields: { assignees: [await r.member("@vic")] } });
  // An act that the full definition has and the profile does not: the lane's definition has no such act, and refuses it.
  expect(answered(await I.raw(rita, "label", { labels: ["bug"] }))).toBe("unknown-act");

  // A pull request that says it closes the issue, touching a source file and an instruction file for agents.
  const { C, manifest } = await proposed(r, I, una, "@una", [], changeDemo, DEMO_DIGESTS.change);
  await C.did(una, "request-review-own", { fields: { requested: await r.member("@paul") } });
  await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["AGENTS.md", "src/parser.ts"], links: [], unreadable: 0 };
  const refused = await merged(r, C, manifest, []);
  expect([refused.state, refused.values["reason"], (await I.item(0)).state]).toEqual(["refused", "rules-not-met:rules", "open"]);

  // The rules scope's controller lands it: rita holds `rules.publish` and approves for the rules extent.
  await C.did(rita, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } });
  const landed = await merged(r, C, manifest, []);
  expect([landed.state, (await publicationOf(r, C, landed.id))?.state, (await r.G.item(0)).values["head"]]).toEqual(["published", "published", oid("c")]);
  // The merge closed the issue, with the link recorded as a fact of the change lane; the assignment stays as it was.
  const goal = await I.item(0);
  expect([goal.state, goal.values["closeReason"], (goal.parties["assignees"] as { member: string }[]).map((m) => m.member), (await C.item(0)).state]).toEqual(["closed", "completed", ["@vic"], "merged"]);

  // The rules are the room's own. rita raises the source extent and the lane's count to two approvals; a second change on a new
  // issue asks the rules scope again and, with one approval, is refused by the lane.
  expect(await r.publishRules({ approvals: 2, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 2, checks: [] }) })).toMatchObject({ answer: "accepted" });
  const J = await r.lane(rita, "open-issue", issueDemo, DEMO_DIGESTS.issue, { title: "The printer drops blank lines", conditions: ["blank lines survive"] });
  const next = await proposed(r, J, una, "@una", [], changeDemo, DEMO_DIGESTS.change, { base: oid("c"), integration: oid("d") });
  await next.C.did(paul, "review-verdict", { fields: { manifest: next.manifest, verdict: "approve", extent: "source" } });
  expect(await next.C.asks(rita, "merge", { fields: { manifest: next.manifest, reports: [] } })).toBe("guard-failed: approvals-needed");
  await next.C.did(vic, "review-verdict", { fields: { manifest: next.manifest, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["src/printer.ts"], links: [], unreadable: 0 };
  const second = await merged(r, next.C, next.manifest, []);
  expect([second.state, (await J.item(0)).state]).toEqual(["published", "closed"]);
}, 30_000);
