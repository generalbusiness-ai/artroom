import { expect, test } from "vitest";
import { firstExtents, PARTITION_COHORT as P, platform } from "@generalbusiness/dap-platform";
import { canonicalize, factRefOf } from "@generalbusiness/artroom-bytes";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { DIGESTS, change, issue } from "../src/index.ts";
import { room, rita, una, paul, vic, reported, proposed, publicationOf, oid, routed, Platform } from "./support/room.ts";

// Native factories, membership, lane acts, rules, SQLite, transport, pinning
// and publication decisions. The existing Room Git hosts, commits, changed
// set, scheduler and clock are stand-ins. No provider or Git push occurs.
test("partition change publishes and closes its native issue under receiver identity", async () => {
  const r = await room({ partitioned: true });
  expect((await r.root.summary()).value.definition).toBe(P.directory);
  expect((await r.D.summary()).value.definition).toBe(P.partition);
  expect((await r.D.item(0)).refs["membership"]).toEqual(await r.M.at());
  expect(platform(P.directory)!.data.acts["open-pr"]).toBeUndefined();
  expect(platform(P.partition)!.data.acts["open-pr"]).toBeDefined();
  expect(await r.publishRules({ approvals: 1, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 1, checks: [] }), singleControllerException: false })).toMatchObject({ answer: "accepted" });
  await r.activate(issue, DIGESTS.issue); await r.activate(change, DIGESTS.change);
  const I = await r.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Partition relationship", conditions: ["Keep all native relations"] });
  const selection = await reported(r, I);
  const { C, manifest } = await proposed(r, I, una, "@una", [selection]);
  await r.settle();
  expect(await C.asks(rita, "merge", { fields: { manifest, reports: [selection.report] } })).toBe("guard-failed: approvals-needed");
  await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["src/a.ts"], links: [], unreadable: 0 };
  const merge = (await C.did(rita, "merge", { fields: { manifest, reports: [selection.report] } })).fact;
  await r.publish(); await r.settle();
  expect([(await publicationOf(r, C, merge.seq))?.state, (await r.G.item(0)).values["head"], (await C.item(merge.seq)).state]).toEqual(["cleaned", oid("c"), "published"]);
  const closing = (await I.entries()).filter(entry => entry.effects.some(effect => effect.effect === "state" && effect.item === 0 && effect.state === "closed"));
  expect([(await I.item(0)).state, (await I.item(0)).values["closeReason"], closing.length]).toEqual(["closed", "completed", 1]);

  const replay = await verify(httpSource("https://scopes.test", { fetch: routed }), { mode: "replay", scope: I.name, head: (await new Platform(I.name).summary()).at, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
  // The existing verifier does not derive the staged Git ancestry walk.
  expect(replay, canonicalize(replay)).toMatchObject({ report: { result: "incomplete" } });
  expect(replay.why).toContain("the walk of the ancestry record");
}, 60_000);


// This preserves a newly observed limitation of the pinned declaration. It
// does not manufacture pin-confirm or claim the canonical path works.
test.each([false, true])("canonical foreign-hold manifest stays refused before admission (partitioned=%s)", async partitioned => {
  const r = await room({ partitioned });
  await r.activate(issue, DIGESTS.issue); await r.activate(change, DIGESTS.change);
  const I = await r.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Foreign hold comparison", conditions: ["Preserve pinned behavior"] });
  const selection = await reported(r, I);
  const C = await r.lane(vic, "open-pr", change, DIGESTS.change, { title: "A change staged in its issue", draft: false });
  await C.did(vic, "ask-rules", { on: 0 }); await r.settle();
  const reporter = await r.member("@vic");
  const hold = (await I.state()).page("hold", ["held", "ended"], null, 16).items.find(item => item.parties["holder"] && canonicalize(item.parties["holder"]) === canonicalize(reporter));
  if (!hold) return expect.fail("actual reporter has no issue hold");
  const signed = await C.signed(vic, "propose-manifest", { fields: { lane: I.at, foreignHold: hold.id, instance: "i-1", base: r.firstHead, integration: oid("c"), tree: oid("3"), complete: true, selected: [selection], decisions: [] } });
  expect(await I.prepare(signed.signed, "stage")).toMatchObject({ answer: "accepted" });
  await I.effects();
  const checked = [...(await I.entries())].reverse().find(entry => entry.input.type === "outcome" && entry.input.owner === "hold@1" && entry.input.kind === "check");
  if (!checked) return expect.fail("actual issue wrote no capability check");
  const admitted = await C.submit({ ...signed, beside: { ...signed.beside, presented: { pin: factRefOf(checked) } } });
  expect(admitted, canonicalize(admitted)).toMatchObject({ answer: "refused", reason: "required-unset" });
  expect((await C.state()).count("manifest", "current")).toBe(0);
}, 60_000);
