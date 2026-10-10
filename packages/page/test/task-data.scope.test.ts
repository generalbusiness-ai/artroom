import { expect, test } from "vitest";
import { entryHash, intentDigest, isSeed, scopeIdOf, textDigest, timeMs, takeBytes } from "@generalbusiness/artroom-bytes";
import { DEMO_DIGESTS } from "@generalbusiness/artroom-lanes";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { act, actsOn, fieldValue, listLanes, loadChange, loadChangeSelection, loadIssue, loadRules, openRoom, placeOf, type Room } from "../src/index.ts";
import { demo, type Demo } from "./support/demo.ts";
import { ScopeHandle, httpTransport, secretSigner, signedReads, REPLY_BYTES, REPLY_SECONDS } from "@generalbusiness/artroom-client";
import type { ScopeId, FactRef } from "@generalbusiness/artroom-contract";
import { driveFixture } from "../../scope/test/support/native-fixture-lifetime.ts";
import { Platform } from "../../scope/test/repository.ts";
import { graph, onCode, rita, una, vic, routed, net } from "../../lanes/test/support/graph.ts";
const oid = (c: string) => c.repeat(40);

/** Scheduler provenance uses the same authenticated room transport; no inspector. */
async function completeIssue(d: Demo, room: Room, fact: FactRef): Promise<ScopeId> {
  const owner = d.sessionOwner;
  const transport = signedReads(httpTransport(room.session.service, room.session.fetch ? { fetch: room.session.fetch } : {}), secretSigner(room.session.secret), room.session.now ? { now: room.session.now } : {});
  const handle = (name: ScopeId) => new ScopeHandle(transport, name, room.reader?.reader() ?? null);
  const source = await owner.required(() => handle(d.D.name).entry(fact.seq));
  expect(source.ok, "Accepted opening must have readable immutable source bytes").toBe(true);
  if (!source.ok) throw new Error("Accepted opening source unavailable");
  const entry = source.value.entry;
  expect([entryHash(entry), entry.at]).toEqual([fact.hash, fact.at]);
  expect(entry.input.type).toBe("act");
  if (entry.input.type !== "act") throw new Error("Accepted opening is not an act");
  expect(entry.input.signed.intent.kind).toBe("open-issue");
  const creates = entry.sends.filter(send => send.message.class === "request" && send.message.type === "create" && isSeed(send.to));
  expect(creates).toHaveLength(1);
  const seed = creates[0]!.to;
  if (!isSeed(seed)) throw new Error("Recorded create has no valid seed");
  expect([seed.kind, seed.definition, seed.creator, seed.cause, seed.ordinal]).toEqual(["lane", DEMO_DIGESTS.issue, fact.at, intentDigest(entry.input.signed.intent), 0]);
  const child = scopeIdOf(seed);
  // Native effect/dispatch needs no read inspector. All parent/child reads below
  // are authenticated. The original known register/destination remain included.
  const nodes = [d.config.register!.scope, d.G.name, d.D.name, child].map(name => new Platform(name));
  // Exactly one scheduler drain has one 4096-work/64-pass budget. Once it
  // reports idle, inspect the native state once: never hammer idle passes to
  // wait for retry backoff or advance the clock to manufacture completion.
  await driveFixture(nodes, action => owner.required(action));
  const [parentRead, childRead] = await owner.required(() => Promise.all([handle(d.D.name).summary(), handle(child).summary()]));
  expect(parentRead.ok, "Directory completion must remain readable").toBe(true);
  expect(childRead.ok, childRead.ok ? undefined : `Recorded child did not complete after scheduler idle: ${childRead.reason}`).toBe(true);
  if (!parentRead.ok || !childRead.ok) throw new Error("Native creation completion unreadable");
  expect([parentRead.complete, childRead.complete, parentRead.next, childRead.next]).toEqual([true, true, undefined, undefined]);
  expect(parentRead.value.scope).toEqual(fact.at);
  expect(childRead.value.status, "Recorded child must be active after scheduler idle; pending creation needs a distinct disposition").toBe("active");
  const row = parentRead.value.items.find(item => item.type === "lane" && item.id === fact.seq);
  expect(row, "Accepted opening must retain its native directory lane row").toBeDefined();
  expect(["refused", "conflict"]).not.toContain(row?.state);
  expect(row?.refs["scope"], "Parent must have confirmed its actual child after scheduler idle").toEqual(childRead.value.scope);
  expect([childRead.value.scope.scope, childRead.value.scope.kind, childRead.value.definition]).toEqual([child, "lane", DEMO_DIGESTS.issue]);
  return child;
}

// Real native ISSUE reports and manifest admissions. Authority/rules peers,
// Git host and clock are the graph's explicitly labelled stand-ins; the
// selection API uses the real authenticated signed-read path of the signer.
test("selected merge facts are native ISSUE reports in admitted order, independent of later reports and checker jobs", async () => {
  const g = await graph();
  onCode();
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
  const room = { session: { service: "https://scopes.test", secret: una.secret, fetch: routed, now: () => timeMs(net.clock.now)! }, directory: g.office.at.scope, membership: una.member.membership, rules: g.rules.at.scope, destination: g.destination.at.scope, key: una.key, me: null, reader: null, unsessioned: null, definitions: new Map() } as Room;
  const selected = await loadChangeSelection(room, C.at.scope);
  expect(selected.scope).toEqual(C.at);
  expect(selected.currentManifest).toBe(m1);
  expect(selected.manifests.find((m) => m.id === m1)?.selectedReports).toEqual([ra, rb]);
  const configuration = textDigest("task-data-ci");
  expect(await C.stub.deliver(g.rules.relate(C.at, "rules", "published", { approvals: 0, checks: [{ name: "ci", configuration, required: true, checker: rita.member }], ownerMayReview: false }))).toMatchObject({ answer: "recorded" });
  const checkerJob = (await C.did(una, "request-check", { fields: { manifest: m1, name: "ci", configuration } })).fact;
  const afterJob = await loadChangeSelection(room, C.at.scope);
  expect(afterJob.manifests.find((m) => m.id === m1)?.selectedReports).toEqual([ra, rb]);
  expect(afterJob.manifests.find((m) => m.id === m1)?.selectedReports).not.toContainEqual(checkerJob);
  const later = (await B.stagedDid(una, "report", { fields: { commitment: cb.seq, terms: cb, commit: oid("e"), tree: oid("5") } })).fact;
  await B.did(rita, "accept-report", { on: later.seq, fields: { commitment: cb.seq, terms: cb } });
  expect((await loadChangeSelection(room, C.at.scope)).manifests.find((m) => m.id === m1)?.selectedReports).toEqual([ra, rb]);
});

// Actual membership, sessions, rules activation and directory creation.
// The Git host, scheduler and clock are the Page demo's stand-ins.
test("native task data supplies active issue choices, detached Description, exact current manifest and eligible review choices", async () => {
  const stageOrigin = performance.now();
  let lastStarted = "none", lastCompleted = "none";
  let badSelection = false, unavailableMembers = false, unavailableExtents = false, noCurrent = false;
  let membershipPath = "";
  console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "setup", lastCompleted);
  const d = await demo((fetch, owner) => async (url, init) => {
    const response = await fetch(url, init);
    if (unavailableMembers && new URL(url).pathname === membershipPath && init?.method !== "POST") {
      await owner.required(async () => { await response.body?.getReader().cancel(); });
      return Response.json({ ok: false, reason: "forbidden" }, { status: 403 });
    }
    if ((!badSelection && !unavailableExtents && !noCurrent) || init?.method === "POST" || !new URL(url).pathname.match(/\/v1\/scopes\/[^/]+$/)) return response;
    const bytes = response.body ? await owner.required(() => takeBytes(response.body!, REPLY_BYTES, AbortSignal.timeout(REPLY_SECONDS * 1000))) : null;
    if (!(bytes instanceof Uint8Array)) throw new Error("The task-data witness received no whole summary reply.");
    const read = JSON.parse(new TextDecoder().decode(bytes)) as { ok?: boolean; value?: { items?: { type: string; values: Record<string, unknown> }[] } };
    for (const item of read.value?.items ?? []) {
      if (badSelection && item.type === "manifest") item.values["selected"] = "not a native selection";
      if (unavailableExtents && item.type === "rules") item.values["extents"] = "unavailable extents";
      if (noCurrent && item.type === "manifest") (item as unknown as { state: string }).state = "superseded";
    }
    return Response.json(read);
  }, null, { invitation: false });
  console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "setup");
  try {
    console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "rules-and-issue-choices", lastCompleted);
    const room = await openRoom(d.as(await d.secretOf(d.rita)), placeOf(JSON.stringify(d.config))!);
    membershipPath = `/v1/scopes/${d.M.name}`;
    const extents = firstExtents({ approvals: 0, checks: [] });
    const publishedRules = await act(room, room.rules, "publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, singleControllerException: false, checks: [], labels: [], extents: fieldValue(room, "code", JSON.stringify(extents)) } });
    expect(publishedRules.answer.answer, JSON.stringify(publishedRules.answer)).toBe("accepted");
    expect((await loadRules(room)).extents).toEqual(extents);
    const choices = (await actsOn(room, room.directory)).acts.find((a) => a.kind === "open-issue")!.fields.find((field) => field.name === "definition")!.choices!;
    expect(choices.map((choice) => choice.value)).toEqual([DEMO_DIGESTS.issue]);
    const created = await act(room, room.directory, "open-issue", { fields: { definition: choices[0]!.value, title: "Clear task", body: "A literal Description.", conditions: ["Clear task"] } });
    expect(created.answer.answer).toBe("accepted");
    if (created.answer.answer !== "accepted") throw new Error("Issue opening was not accepted");
    console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "rules-and-issue-choices");
    console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "accepted-entry-and-native-child", lastCompleted);
    const child = await completeIssue(d, room, created.answer.receipt.fact);
    console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "accepted-entry-and-native-child");
    console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "issue-description", lastCompleted);
    const issue = (await listLanes(room)).issues.find((row) => row.title === "Clear task")!;
    expect(issue, "Confirmed native issue must appear in the Page projection").toBeDefined();
    expect(issue.scope).toBe(child);
    expect((await loadIssue(room, issue.scope)).body).toBe("A literal Description.");
    console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "issue-description");
    console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "publication-and-review-choices", lastCompleted);
    expect((await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Task data")).code).toBe(0);
    const changeRow = (await listLanes(room)).changes.find((row) => row.title === "Task data")!;
    const change = await loadChange(room, changeRow.scope);
    expect(change.currentManifest).toBe(change.manifests.find((m) => m.state === "current")?.id);
    expect(change.manifests.find((m) => m.id === change.currentManifest)?.selectedReports).toEqual([]);
    expect(change.reviewExtents?.map((e) => e.value)).toEqual(change.rules?.extents.map((e) => e.name));
    expect(change.rules?.extents.every((extent) => !Object.hasOwn(extent, "patterns"))).toBe(true);
    expect(change.reviewMembers?.map((member) => member.value)).toContain("@paul");
    expect(change.reviewMembers?.map((member) => member.value)).not.toContain("@rita");
    expect(change.reviewMembersByExtent?.["source"]?.map((member) => member.value)).toContain("@paul");
    console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "publication-and-review-choices");
    console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "fresh-review-faults", lastCompleted);
    badSelection = true;
    const malformed = await loadChange(room, changeRow.scope);
    expect(malformed.manifests.find((m) => m.id === malformed.currentManifest)?.selectedReports).toBeNull();
    badSelection = false; unavailableMembers = true;
    expect((await loadChange(room, changeRow.scope)).reviewMembers).toBeNull();
    unavailableMembers = false; unavailableExtents = true;
    expect((await loadChange(room, changeRow.scope)).reviewExtents).toBeNull();
    unavailableExtents = false; noCurrent = true;
    expect((await loadChange(room, changeRow.scope)).currentManifest).toBeNull();
    console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "fresh-review-faults");
  } finally {
    console.info("native-stage", "task-data", "started", performance.now() - stageOrigin, lastStarted = "cleanup", lastCompleted);
    d.done();
    console.info("native-stage", "task-data", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "cleanup");
  }
});
