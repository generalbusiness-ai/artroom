import { expect, test } from "vitest";
import { CONFIGURATION_DOMAIN, firstExtents, platform } from "@generalbusiness/artroom-platform";
import { canonicalize, textDigest } from "@generalbusiness/artroom-bytes";
import { valueDigest } from "@generalbusiness/artroom-derive";
import { MemorySource, httpSource, verify, type HistorySource, type MemoryScope } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { DIGESTS, change, issue } from "../src/index.ts";
import type { Node } from "./support/graph.ts";
import { Platform, copied, merged, oid, paul, proposed, publicationOf, reported, rewritten, rita, room, routed, checkerKey, soon, una, vic, type Room } from "./support/room.ts";

// The lanes against the real rules scope and the real destination (plan 024, gate 2; request i5). Every platform scope is a Durable
// Object of the namespace `PLATFORM` under the deployed class, the production authority and the platform package's own data and
// rules. Every lane is created by the real directory under its pinned digest, after the real rules scope activated it, and its
// grants are read from the real membership scope. No entry of any scope is written by hand, and none is anchored for replay.
//
// | Part | Is |
// |---|---|
// | The Git host | A STAND-IN. The destination's: `OutsideDouble`, answering each recorded attempt from the actual SQLite records (`Room.drive`). A lane's: `Host` of `graph.ts`, answering the attempts that the code of `hold@1` opens. No repository exists. |
// | The changed set of a publication | SCRIPTED: `Room.changes`, the paths that the host's judge read answers with. The destination classifies them against the extents that it observes in the real rules scope. |
// | The commits | Named by the test. The judge read answers with the manifest's own tree and base, and with each selected report's commit as an ancestor. |
// | Runner | None. The rules here require no check. |

type Issue = Node<typeof issue>;

/** The time a scenario on a room may take: a founding and a few publications take some seconds, more under a loaded run. */
const ROOM_MS = 60_000;

/** The extents of the first definition, with 1 approval for `source` and `infrastructure`, no check, and the declaration of the exception. */
const rulesWith = (singleControllerException = false) => ({ approvals: 1, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 1, checks: [] }), singleControllerException });

/** Rules published, both lane definitions active, and an issue that rita files. */
async function opened(r: Room): Promise<Issue> {
  expect(await r.publishRules(rulesWith())).toMatchObject({ answer: "accepted" });
  await r.activate(issue, DIGESTS.issue);
  await r.activate(change, DIGESTS.change);
  return r.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "A bug", conditions: ["it works"] });
}

test("W1, a source-only change with one approving reviewer for the source extent: the real destination reserves and publishes the real lane's merge, whose reserve names the selected report; the lane records it, and the linked issue closes once (STAND-IN: the Git host; SCRIPTED: the changed set)", async () => {
  const r = await room();
  const I = await opened(r);
  const selection = await reported(r, I);
  const { C, manifest } = await proposed(r, I, una, "@una", [selection]);
  // The lane holds the extents that the real rules scope sent, by name and with what each asks, without patterns.
  const rules = (await C.state()).page("rules", ["current"], null, 1).items[0]!;
  expect([(rules.values["extents"] as { name: string }[]).map((extent) => extent.name), rules.refs["source"]]).toMatchObject([["rules", "infrastructure", "source"], { at: { scope: r.rules.name } }]);
  // The control: with no approval the lane refuses the merge, and nothing reaches the destination.
  expect(await C.asks(rita, "merge", { fields: { manifest, reports: [selection.report] } })).toBe("guard-failed: approvals-needed");
  const review = (await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } })).fact;
  r.changes = { paths: ["src/a.ts"], links: [], unreadable: 0 };
  const merge = (await C.did(rita, "merge", { fields: { manifest, reports: [selection.report] } })).fact;
  // The reserve that the lane sends is the statement that the destination judges: the verdict with its extent, no job, and the report.
  const [send] = (await C.entry(merge.seq)).sends;
  expect(send).toMatchObject({ to: { scope: r.G.name }, message: { body: { message: "reserve", fields: { verdicts: [{ review, reviewer: { member: "@paul" }, verdict: "approve", extent: "source" }], jobs: [], reports: [selection.report] } } } });
  expect((await I.item(0)).state).toBe("open");
  await r.publish();
  const publication = await publicationOf(r, C, merge.seq);
  expect([publication?.state, (await r.G.item(0)).values["head"], (await C.item(merge.seq)).state, (await C.item(0)).state]).toEqual(["published", oid("c"), "published", "merged"]);
  // The issue closes once: one entry closed it, the delivery of the lane's `closes` update in the state `merged`.
  await r.settle();
  const closing = (await I.entries()).filter((entry) => entry.effects.some((effect) => effect.effect === "state" && effect.item === 0 && effect.state === "closed"));
  expect([(await I.item(0)).state, (await I.item(0)).values["closeReason"], closing.length, closing[0]?.input.type]).toEqual(["closed", "completed", 1, "delivery"]);
}, ROOM_MS);

test("W2, a mixed change touching the source and the rules extents: the source reviewer's approval meets the source extent, the rules extent stays unmet and the merge is refused with that extent named; once the rules scope's controller approves for the rules extent the publication is judged and published; every history then replays as the runtime wrote it, with no mismatch and only the ancestry walk not derived (STAND-IN: the Git host; SCRIPTED: the changed set)", async () => {
  const r = await room();
  const I = await opened(r);
  const { C, manifest } = await proposed(r, I, una, "@una", []);
  await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["AGENTS.md", "src/a.ts"], links: [], unreadable: 0 };
  const first = await merged(r, C, manifest, []);
  expect([first.state, first.values["reason"], (await publicationOf(r, C, first.id))?.state, (await r.G.item(0)).values["head"], (await I.item(0)).state])
    .toEqual(["refused", "rules-not-met:rules", "not-reserved", r.firstHead, "open"]);
  // rita holds `rules.publish`, the approver of the rules extent, and is no author of the change.
  await C.did(rita, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } });
  const second = await merged(r, C, manifest, []);
  const publication = await publicationOf(r, C, second.id);
  expect([second.state, publication?.state, publication?.values["reason"] ?? null, (await r.G.item(0)).values["head"], (await I.item(0)).state]).toEqual(["published", "published", null, oid("c"), "closed"]);

  // Replay: a verifier reads each history over HTTP and derives every entry again, with the platform package's data and rules and
  // the lane definitions that each lane retains. Nothing is anchored, and each grant is derived from the observation it retains.
  const scopes = [r.R, r.D, r.M, r.rules, r.G, new Platform(I.name), new Platform(C.name)];
  // The capability code is the production ports' own: the code of `hold@1` and `git-read@1`, and the same value as their owner.
  const options = { mode: "replay", platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE } as const;
  // The one thing not derived is said last, after every other entry is derived with no mismatch: the walk of the ancestry record
  // of the change lane's check entry, for this verifier reads no commit (section 16.4). So the histories that reach that lane, its
  // own, the issue's, the directory's and the destination's, are `incomplete` for that reason only, and the other three consistent.
  const unwalked = `the walk of the ancestry record in entry ${(await C.entries()).findIndex((entry) => entry.input.type === "outcome" && entry.input.kind === "check")} of ${C.name} was not derived`;
  const results = [];
  for (const node of scopes) {
    const { report, why } = await verify(httpSource("https://scopes.test", { fetch: routed }), { ...options, scope: node.name, head: (await node.summary()).at });
    results.push([(await node.at()).kind, report.result, why?.split(":")[0] ?? null]);
  }
  expect(results).toEqual([
    ["register", "consistent", null], ["directory", "incomplete", unwalked], ["membership", "consistent", null], ["rules", "consistent", null],
    ["destination", "incomplete", unwalked], ["lane", "incomplete", unwalked], ["lane", "incomplete", unwalked],
  ]);
  // The control: the lane's history read from a copy in memory, every other read over HTTP. The copy as it is replays as the
  // runtime's does. With the merger of the second merge changed in it, sealed again so that the chain is intact, the lane's
  // replay is a mismatch at that entry.
  const http = httpSource("https://scopes.test", { fetch: routed });
  const through = (lane: MemoryScope): HistorySource => {
    const memory = new MemorySource([lane]);
    return { page: (scope, from, allow) => (scope === C.name ? memory.page(scope, from, allow) : http.page(scope, from, allow)), retained: (...asked) => http.retained(...asked) };
  };
  const lane = await copied(new Platform(C.name));
  const plain = await verify(through(lane), { ...options, scope: C.name });
  expect([plain.report.result, plain.why?.split(":")[0]]).toEqual(["incomplete", unwalked]);
  rewritten(lane, second.id, (entry: { effects: { effect: string; member?: { member: string } }[] }) => { entry.effects.find((effect) => effect.effect === "party")!.member!.member = "@vic"; });
  const tampered = await verify(through(lane), { ...options, scope: C.name });
  expect([tampered.report.result, tampered.report.at?.seq]).toEqual(["mismatch", second.id]);
}, ROOM_MS);

test("W3, a reviewer outside an extent counts for nothing there: an approval that names the rules extent from a member without rules.publish, and one that names no extent, leave the source extent unmet; the same reviewer's later approval for the source extent meets it (STAND-IN: the Git host; SCRIPTED: the changed set)", async () => {
  const r = await room();
  const I = await opened(r);
  const { C, manifest } = await proposed(r, I, una, "@una", []);
  r.changes = { paths: ["src/a.ts"], links: [], unreadable: 0 };
  // paul names the wrong extent, and vic names none. The lane counts two approvals; the destination counts neither for `source`.
  const wrong = (await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } })).fact.seq;
  await C.did(vic, "review-verdict", { fields: { manifest, verdict: "approve" } });
  const first = await merged(r, C, manifest, []);
  expect([first.state, first.values["reason"]]).toEqual(["refused", "rules-not-met:source"]);
  // The control: paul's verdict again, superseding the first, for the source extent.
  await C.did(paul, "review-verdict", { fields: { manifest, earlier: wrong, verdict: "approve", extent: "source" } });
  const second = await merged(r, C, manifest, []);
  expect([second.state, (await publicationOf(r, C, second.id))?.state]).toEqual(["published", "published"]);
}, ROOM_MS);

test("W4, the single-controller exception: rita, the one holder of rules.publish, authors a change to the rules extent; with the exception not declared it is refused, rules-not-met:rules; once the rules declare it the same change is reserved under the exception, and the publication's reason records it (STAND-IN: the Git host; SCRIPTED: the changed set)", async () => {
  const r = await room();
  const I = await opened(r);
  const { C, manifest } = await proposed(r, I, rita, "@rita", []);
  // rita may not review her own change. paul's approval for the source extent meets the lane's count and nothing of `rules`.
  expect(await C.asks(rita, "review-verdict", { fields: { manifest, verdict: "approve", extent: "rules" } })).toBe("guard-failed: author-cannot-review");
  await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["AGENTS.md"], links: [], unreadable: 0 };
  const first = await merged(r, C, manifest, []);
  expect([first.state, first.values["reason"]]).toEqual(["refused", "rules-not-met:rules"]);
  // The rules scope's controller declares the exception. The destination reads it in its next observation of the rules.
  expect(await r.publishRules(rulesWith(true))).toMatchObject({ answer: "accepted" });
  const second = await merged(r, C, manifest, []);
  const publication = await publicationOf(r, C, second.id);
  expect([second.state, publication?.state, String(publication?.values["reason"]).split(":").slice(0, 3)]).toEqual(["published", "published", ["single-controller", "rules", "@rita"]]);
}, ROOM_MS);

test("W5, a required check: the rules require the check `unit`, run by a checker member of the real membership scope; the real lane opens the job and the checker's key decides it passed; the destination judges the merge with the retained job opening and decision and the checker key's current standing, and publishes; with the job only requested it refuses (STAND-IN: the Git host; SCRIPTED: the changed set; no runner: the checker's answer is signed by the test)", async () => {
  const r = await room();
  // A checker member, @check, with a key enrolled by an invitation of rita's; a configuration that the rules scope keeps.
  const checker = await r.M.did(rita, "add-member", { fields: { handle: "@check", kind: "checker" } });
  const secret = "the invitation of the required checker key";
  const invitation = await r.M.did(rita, "invite-key", { fields: { member: checker, kind: "checker", inviteHash: textDigest(secret), inviteEnds: soon(3600) }, expected: await r.M.expected({ member: checker }) });
  await r.M.did(checkerKey, "enrol", { on: 0, fields: { invitation, secret }, expected: await r.M.expected({ on: 0, member: checker }) });
  const configuration = { name: "unit", image: `sha256:${"e".repeat(64)}`, environment: {}, steps: [["npm", "test"]], judged: { passed: { exit: 0, line: "ok" }, failed: { exit: 1, line: "not ok" } }, limits: { seconds: 600, bytes: 65536 } };
  const digest = valueDigest(CONFIGURATION_DOMAIN, configuration);
  expect(await r.rules.stub.submit(await r.rules.intent(rita, "keep-configuration", { fields: { digest, name: "unit" } }), [], { values: [canonicalize(configuration)] })).toMatchObject({ answer: "accepted" });
  const checks = [{ name: "unit", configuration: digest, required: true, checker: await r.member("@check") }];
  expect(await r.publishRules({ approvals: 1, ownerMayReview: false, checks, labels: [], extents: firstExtents({ approvals: 1, checks: [{ name: "unit", required: true }] }) })).toMatchObject({ answer: "accepted" });
  await r.activate(issue, DIGESTS.issue);
  await r.activate(change, DIGESTS.change);
  const I = await r.lane(rita, "open-issue", issue, DIGESTS.issue, { title: "A bug", conditions: ["it works"] });
  const { C, manifest } = await proposed(r, I, una, "@una", []);
  await C.did(paul, "review-verdict", { fields: { manifest, verdict: "approve", extent: "source" } });
  r.changes = { paths: ["src/a.ts"], links: [], unreadable: 0 };
  const job = (await C.did(una, "request-check", { fields: { manifest, name: "unit", configuration: digest } })).fact.seq;
  // The control: the lane refuses a merge while the job is only requested.
  expect(await C.asks(rita, "merge", { fields: { manifest, reports: [] } })).toBe("guard-failed: required-check-not-passed");
  // Only a key that holds `change.check` answers it: paul, a member, is refused by the real membership standing; the key of @check is admitted.
  expect(await C.asks(paul, "check", { fields: { job, tree: oid("3"), configuration: digest, outcome: "passed" } })).toBe("unauthorized");
  const decided = (await C.did(checkerKey, "check", { fields: { job, tree: oid("3"), configuration: digest, outcome: "passed" } })).fact.seq;
  const done = await merged(r, C, manifest, []);
  const publication = await publicationOf(r, C, done.id);
  expect([done.state, publication?.state, (await C.item(job)).state, (await C.item(job)).refs["decidedBy"], (await I.item(0)).state]).toEqual(["published", "published", "passed", decided, "closed"]);
}, ROOM_MS);
