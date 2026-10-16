import { env } from "cloudflare:workers";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { ReceiverReads } from "../../../../packages/scope/src/receiver-reads.ts";
import { expect, test } from "vitest";
import { firstExtents, PARTITION_COHORT as P, platform } from "@generalbusiness/dap-platform";
import { canonicalize, factRefOf, intentDigest, newIncarnation, isMemberRef } from "@generalbusiness/artroom-bytes";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { DIGESTS, change, issue } from "../src/index.ts";
import { nativelyCreatedChild, settleNativeChildren } from "./support/natively-created-child.ts";
import { net, soon } from "./support/graph.ts";
import { experimentalForeignHoldChange as foreignChange, EXPERIMENTAL_FOREIGN_HOLD_DIGEST as FOREIGN_DIGEST } from "./support/foreign-hold-change.ts";
import { byMember } from "@generalbusiness/dap-derive";
import { PROPOSED_BOUNDS, type MemberRef } from "@generalbusiness/dap-contract";
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

  const head = (await new Platform(I.name).summary()).at;
  const replay = await verify(httpSource("https://scopes.test", { fetch: routed }), { mode: "replay", scope: I.name, head, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
  // The existing verifier does not derive the staged Git ancestry walk.
  expect(replay, canonicalize(replay)).toMatchObject({ report: { result: "incomplete" } });
  expect(replay.why).toContain("the walk of the ancestry record");
  expect(replay.report.coverage.find(coverage => coverage.scope.scope === I.name)?.through).toBe(head.seq);
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


// Only the one fixture attribution route differs from the canonical change.
// Every pin permission and issue handler remains actual and unchanged.
test.each([true, false])("activated experimental change pin consumer keeps receiver policy across restart (partitioned=%s)", async partitioned => {
  const r = await room({ partitioned: true, roster: ["@vic"] });
  try {
    const staging = partitioned ? r : await room({ roster: ["@vic"] });
    await staging.activate(issue, DIGESTS.issue); await r.activate(foreignChange, FOREIGN_DIGEST);
    const I = await staging.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Native pin consumer", conditions: ["Keep authenticated authors and pin permissions"] });
    const selection = await reported(staging, I), reporter = await staging.member("@vic");
    const hold = (await I.state()).page("hold", ["held", "ended"], null, 16).items.find(item => canonicalize(item.parties["holder"] ?? null) === canonicalize(reporter));
    if (!hold) return expect.fail("actual native issue has no reporter hold");
    const C = await r.lane(vic, "open-pr", foreignChange, FOREIGN_DIGEST, { title: "Experimental foreign attribution", draft: false });
    expect((await C.entry(0)).input).toMatchObject({ type: "genesis", decision: "applied", seed: { definition: FOREIGN_DIGEST, creator: await r.D.at() } });
    await C.did(vic, "ask-rules", { on: 0 }); await r.settle();
    const submitManifest = async (commit: string, previous?: number) => {
      const signed = await C.signed(vic, "propose-manifest", { fields: { ...(previous === undefined ? {} : { previous }), lane: I.at, foreignHold: hold.id, instance: "i-1", base: r.firstHead, integration: commit, tree: oid("3"), complete: true, selected: [selection], decisions: [] } });
      expect(await I.prepare(signed.signed, "stage")).toMatchObject({ answer: "accepted" });
      await I.effects();
      const checked = [...await I.entries()].reverse().find(entry => entry.input.type === "outcome" && entry.input.owner === "hold@1" && entry.input.kind === "check");
      if (!checked) return expect.fail("actual issue has no native check");
      const pin = factRefOf(checked);
      const admitted = await C.submit({ ...signed, beside: { ...signed.beside, presented: { pin } } });
      expect(admitted, canonicalize(admitted)).toMatchObject({ answer: "accepted" });
      if (admitted.answer !== "accepted") return expect.fail("experimental manifest was refused");
      const entry = await C.entry(admitted.receipt.fact.seq);
      if (entry.input.type !== "act" || entry.input.authority.length !== 1) return expect.fail("native manifest has no exact signer grant");
      const grant = entry.input.authority[0]!;
      const carried = checked.effects.find(effect => effect.effect === "record" && effect.capability === "hold@1" && effect.kind === "check");
      const pinAuthors = carried?.effect === "record" ? carried.values["attribution"] : null;
      const reportAuthors = (await I.item(selection.report.seq)).parties["authors"];
      const previousAuthors = previous === undefined ? [] : (await C.item(previous)).parties["authors"];
      const members = (value: unknown): readonly MemberRef[] => {
        if (!Array.isArray(value) || !value.every(isMemberRef)) return expect.fail("authenticated attribution source is not a member list");
        return value;
      };
      const expected = [...new Map([...members(pinAuthors), ...members(reportAuthors), ...members(previousAuthors), grant.subject, ...(grant.principal ? [grant.principal] : [])].map(member => [canonicalize(member), member])).values()].sort(byMember);
      expect((await C.item(admitted.receipt.fact.seq)).parties["authors"]).toEqual(expected);
      return { signed, checked, pin, fact: admitted.receipt.fact };
    };
    net.hold = envelope => envelope.from.at.scope === C.name && envelope.to.kind === "lane";
    const first = await submitManifest(oid("c"));
    const readers = namespace(env.PLATFORM), own = await ReceiverReads.open(readers, I.at);
    expect(own?.mode).toBe(partitioned ? "partition-v1" : "legacy");
    expect(await readers.resolver.read(first.fact, 10)).toMatchObject({ under: "declared:change" });
    if (!partitioned) expect(await own!.read(first.fact, 10)).toMatchObject({ under: "declared:change" });
    const key = [C.at, intentDigest(first.signed.signed.intent)] as const;
    const record = async () => (await I.state()).record("hold@1", "pin", key);
    expect(await record()).toMatchObject({ state: "provisional", values: { commit: oid("c"), admitted: null } });
    const firstEntry = await C.entry(first.fact.seq), send = firstEntry.sends.find(send => send.message.class === "request" && send.message.type === "tell" && (send.message.body as { message?: string }).message === "pin-confirm");
    if (!send) return expect.fail("actual experimental manifest emitted no pin-confirm");
    const envelope = await C.envelope(first.fact.seq, send.n);
    await new Platform(I.name).restart();
    const wrongInc = { ...envelope, from: { ...envelope.from, at: { ...envelope.from.at, inc: newIncarnation(new Uint8Array(16).fill(240)) } } };
    expect(await I.stub.deliver(wrongInc)).toMatchObject(partitioned ? { answer: "retry", reason: "dependency-unavailable" } : { answer: "source-unverified" });
    expect((await record())?.state).toBe("provisional");
    // A current manifest did not emit this premature unpin. Its valid
    // sender identity cannot replace the exact immutable send permission.
    const premature = { ...envelope, message: { class: "request" as const, type: "tell" as const, body: { message: "unpin", fields: { manifest: first.fact, commit: oid("c"), because: "superseded" } } } };
    expect(await I.stub.deliver(premature)).toMatchObject({ answer: "source-unverified" });
    expect((await record())?.state).toBe("provisional");
    const delivered = await I.stub.deliver(envelope);
    expect(delivered).toMatchObject({ answer: "recorded" });
    if (delivered.answer !== "recorded") return expect.fail("actual pin confirmation was not recorded");
    if (!partitioned) {
      expect((await I.entry(delivered.fact.seq)).input).toMatchObject({ type: "delivery", from: first.fact, decision: "refused", reason: { code: "unknown-message" } });
      expect((await record())?.state).toBe("provisional");
      const head = (await new Platform(I.name).summary()).at;
      const replayed = await verify(httpSource("https://scopes.test", { fetch: routed }), { mode: "replay", scope: I.name, head, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
      expect(replayed, canonicalize(replayed)).toMatchObject({ report: { result: "incomplete" } });
      expect(replayed.why).toContain("the walk of the ancestry record");
      expect(replayed.report.coverage.find(coverage => coverage.scope.scope === I.name)?.through).toBe(head.seq);
      return;
    }
    expect(await record()).toMatchObject({ state: "held", values: { admitted: first.fact } });
    // Another fully native, eligible change cannot reuse this check: its
    // consumer and intent differ. The unchanged pin-mismatch guard refuses.
    const other = await r.lane(vic, "open-pr", foreignChange, FOREIGN_DIGEST, { title: "Wrong pin consumer", draft: false });
    const wrong = await other.signed(vic, "propose-manifest", { fields: { lane: I.at, foreignHold: hold.id, instance: "i-1", base: r.firstHead, integration: oid("c"), tree: oid("3"), complete: true, selected: [selection], decisions: [] } });
    expect(await other.submit({ ...wrong, beside: { ...wrong.beside, presented: { pin: first.pin } } })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "pin-mismatch" });
    expect((await record())?.state).toBe("held");
    await new Platform(I.name).restart();
    expect((await record())?.state).toBe("held");
    net.hold = null; net.clock.now = soon(PROPOSED_BOUNDS.dispatchRetryMaxSeconds + 1); await r.settle();
    net.hold = envelope => envelope.from.at.scope === C.name && envelope.to.kind === "lane";
    const second = await submitManifest(oid("d"), first.fact.seq);
    const superseding = await C.entry(second.fact.seq), unpin = superseding.sends.find(send => send.message.class === "request" && send.message.type === "tell" && (send.message.body as { message?: string }).message === "unpin");
    if (!unpin) return expect.fail("actual superseding manifest emitted no unpin");
    expect(await C.item(first.fact.seq)).toMatchObject({ state: "superseded" });
    await new Platform(I.name).restart();
    expect(await I.stub.deliver(await C.envelope(second.fact.seq, unpin.n))).toMatchObject({ answer: "recorded" });
    expect(await record()).toMatchObject({ state: "released", values: { admitted: first.fact, released: "unpinned", by: second.fact } });
    await new Platform(I.name).restart();
    expect((await record())?.state).toBe("released");
    const head = (await new Platform(I.name).summary()).at;
    const replayed = await verify(httpSource("https://scopes.test", { fetch: routed }), { mode: "replay", scope: I.name, head, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
    expect(replayed, canonicalize(replayed)).toMatchObject({ report: { result: "incomplete" } });
    expect(replayed.why).toContain("the walk of the ancestry record");
    expect(replayed.report.coverage.find(coverage => coverage.scope.scope === I.name)?.through).toBe(head.seq);
  } finally { net.hold = null; }
}, 60_000);


// Native concern creation, authority, accepted report and actual fulfilment;
// the same Room Git host/clock/scheduler stand-ins remain explicit.
test("partition issue concern fulfils its actual parent across restart", async () => {
  const r = await room({ partitioned: true, roster: ["@vic"] });
  await r.activate(issue, DIGESTS.issue);
  const parent = await r.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "Partition concern parent", conditions: ["Keep the child relationship"] });
  const plan = (await parent.did(rita, "open-plan", {})).fact.seq;
  const created = await nativelyCreatedChild(r, parent, await parent.signed(rita, "add-concern", { fields: { plan, purpose: "A real deliverable", role: "required", title: "Partition concern child", conditions: ["Complete its native report"] } }));
  const { child } = created;
  expect((await child.entry(0)).input).toMatchObject({ type: "genesis", decision: "applied", source: created.receipt.fact, seed: { definition: DIGESTS.issue, creator: parent.at }, message: { body: { directory: await r.D.at(), membership: await r.M.at() } } });
  const terms = await child.fact(0);
  const offer = (await child.did(rita, "offer", { fields: { offeree: await r.member("@vic") } })).fact;
  await child.did(vic, "accept", { on: offer.seq, fields: { terms } });
  const hold = (await child.did(vic, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  await child.instance(vic, hold);
  const report = (await child.stagedDid(vic, "report", { fields: { commitment: offer.seq, terms, commit: oid("a"), tree: oid("1"), claims: ["Native concern complete"] } })).fact;
  await child.did(rita, "accept-report", { on: report.seq, fields: { commitment: offer.seq, terms } });
  await new Platform(parent.name).restart();
  await child.did(rita, "fulfil", { on: offer.seq, fields: { report: report.seq } });
  await settleNativeChildren(r);
  expect(await parent.item(created.receipt.fact.seq)).toMatchObject({ state: "delivered", refs: { child: child.at, result: offer } });
  await new Platform(parent.name).restart();
  expect(await parent.item(created.receipt.fact.seq)).toMatchObject({ state: "delivered", refs: { child: child.at, result: offer } });
  const head = (await new Platform(parent.name).summary()).at;
  const replayed = await verify(httpSource("https://scopes.test", { fetch: routed }), { mode: "replay", scope: parent.name, head, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
  expect(replayed, canonicalize(replayed)).toMatchObject({ report: { result: "incomplete" } });
  expect(replayed.why).toContain("the walk of the ancestry record");
  expect(replayed.report.coverage.find(coverage => coverage.scope.scope === parent.name)?.through).toBe(head.seq);
}, 60_000);
