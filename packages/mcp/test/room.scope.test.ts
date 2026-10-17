import { expect, test } from "vitest";
import type { Digest, FactRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, digestBytes, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/dap-platform";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/dap-lanes";
import { INVITATION_LINK } from "@generalbusiness/artroom-client";
import { GENERIC, mcpRoom, type Agent } from "./support/room.ts";
import { exercises, created, offers, step } from "./support/story.ts";

/**
 * The room story. Returns the number of list changes each agent was told, step by step, for the delivery note.
 */
async function story(mode: "default" | "generic", lines: string[] = []): Promise<{ told: Record<string, number>; requests: number }> {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita", { subscribe: true, mode, ...(mode === "generic" ? { metrics: { report: () => { throw new Error("scripted telemetry failure"); } } } : {}) });
    await created(room, rita, mode);
    if (mode === "generic") {
      // Actual native scopes, routes and sessions; the existing fixture's
      // Git host and scheduler remain its labelled stand-ins. Telemetry
      // reporters must preserve exact read results and the full story.
      const expected = canonicalize(await rita.call("room"));
      for (const report of [undefined, () => {}, () => { throw new Error("scripted telemetry failure"); },
        () => Promise.reject(new Error("scripted telemetry failure")), () => new Promise(() => {})]) {
        const shadow = room.agent("same-key-read", { mode, secret: rita.secret, config: rita.config, ...(report ? { metrics: { report } } : {}) });
        expect(canonicalize(await shadow.call("room"))).toBe(expected);
      }
    }
    // List changes are counted step by step: since the end of the agent's previous step, with the watch fired twice at the end
    // (`tick`). An ordinary head advance with no change of the catalogue is told nothing; a genuine change is told once.
    const seen = new Map<Agent, number>();
    const settled = async (agent: Agent, change: 0 | 1, why: string) => {
      await agent.tick(); await agent.tick();
      const before = seen.get(agent) ?? 0;
      seen.set(agent, agent.told);
      expect(agent.told - before, why).toBe(change);
    };
    await rita.tick();
    seen.set(rita, rita.told);
    const atCreation = rita.told;
    await settled(rita, 0, "the room as founded, once more");

    // The rules, and the two demo definitions activated with their bytes beside the act.
    const publish = await step(rita, mode, { tool: "rules.publish", scope: "rules", kind: "publish" }, { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" });
    expect(publish["answer"], JSON.stringify(publish)).toBe("accepted");
    await settled(rita, 0, "publishing the rules changes no declaration");
    exercises("platform:rules", "activate", "values");
    for (const [name, definition] of [["issue", issueDemo], ["change", changeDemo]] as const) {
      const activated = await step(rita, mode, { tool: "rules.activate", scope: "rules", kind: "activate" }, { fields: { digest: DEMO_DIGESTS[name], name }, values: [canonicalize(definition)], idempotencyKey: `activate-${name}` });
      expect(activated["answer"], JSON.stringify(activated)).toBe("accepted");
      await settled(rita, 1, `activating ${name} changes the choices of a definition field`);
    }

    // paul is invited as a member, joins with his own key through his own server, and rita makes him a maintainer.
    // An invitation secret is at least 32 bytes: membership's serving limits refuse a shorter one as bad-intent.
    const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const invited = await step(rita, mode, { tool: "member.invite", scope: "membership", kind: "invite-member" }, { fields: { handle: "@paul", role: "member", inviteHash: textDigest(secret), inviteEnds: timeOf(room.now() + 3_600_000) }, idempotencyKey: "invite-paul" });
    const invitation = (invited["fact"] as { seq: number }).seq;
    // paul starts from an empty configuration: no service, no room, no pins. The link is the one dap invite prints.
    const link = `${INVITATION_LINK}${b64url(utf8(JSON.stringify({ v: 1, service: rita.config.service, repository: (({ inbox: _inbox, ...shared }) => shared)(rita.config.repository!), invitation, secret, handle: "@paul", definition: "platform:membership@2" })))}`;
    const paul = room.agent("paul", { subscribe: true, mode, config: { service: "" } });
    const issueCreate = { tool: "issue.create", scope: "directory", kind: "open-issue" };
    expect((await paul.names()).filter((n) => !["actions", "act"].includes(n)).sort()).toEqual(GENERIC.filter((n) => !["actions", "act"].includes(n)).sort());
    await paul.tick(); seen.set(paul, paul.told);
    expect(paul.told).toBe(0);
    await settled(paul, 0, "paul's first list, before he joins");
    // A reply lost on the way back: the same link and key send the same request again, and the join is not signed twice.
    room.loseNextReply(`/${rita.config.repository!.membership.scope}/acts`);
    const lostJoin = await paul.call("join", { link, idempotencyKey: "join" });
    expect([lostJoin.isError, lostJoin.structuredContent["error"]]).toEqual([true, "transport"]);
    const joined = await paul.ok("join", { link, idempotencyKey: "join" });
    expect([joined["answer"], joined["handle"]], JSON.stringify(joined)).toEqual(["accepted", "@paul"]);
    expect(JSON.stringify(joined)).not.toContain(secret);
    expect(paul.config).toMatchObject({ service: rita.config.service, handle: "@paul", repository: { ...rita.config.repository, inbox: expect.stringMatching(/^sc_/) } });
    expect(paul.config.repository!.inbox).not.toBe(rita.config.repository!.inbox);
    expect((await paul.ok("wait", { scope: "inbox", seq: 0 }))["timedOut"]).toBe(false);
    await settled(paul, 1, "joining gives paul a role");
    expect(await offers(paul, mode, issueCreate)).toBe(true);
    await step(rita, mode, { tool: "member.role", scope: "membership", kind: "set-role" }, { on: invitation, fields: { role: "maintainer" }, idempotencyKey: "paul-maintainer" });
    await settled(paul, 1, "a role change changes paul's list");
    await settled(rita, 0, "rita's list does not change with paul's role");
    // The same platform tools, now described for his role.
    const described = mode === "default" ? (await room.wait(() => paul.service.page())).tools.find((t) => t.name === "issue.create")!.description
      : ((await paul.ok("actions", { scope: "directory" }))["acts"] as { kind: string; description: string }[]).find((a) => a.kind === "open-issue")!.description;
    expect(described).toContain("which your role (maintainer) holds");

    // paul opens an issue with the definition's bytes and a detached body; the first lane of the issue declaration is a change.
    exercises("platform:directory", "open-issue", "values");
    const opened = await step(paul, mode, { tool: "issue.create", scope: "directory", kind: "open-issue" }, { fields: { definition: DEMO_DIGESTS.issue, title: "The handbook is empty", body: "Write README.md.", conditions: ["README.md says what the room is for"] }, values: [canonicalize(issueDemo)], idempotencyKey: "issue-1" });
    const lane = await paul.ok("wait", { scope: "directory", entry: (opened["fact"] as { seq: number }).seq });
    expect(lane["timedOut"]).toBe(false);
    await settled(paul, 1, "the first issue lane brings the issue declaration's tools");
    await settled(rita, 1, "and rita's");
    expect([await offers(paul, mode, { tool: "issue.comment", scope: 1, kind: "comment" }), await offers(paul, mode, { tool: "issue.close-own", scope: 1, kind: "close-own" })]).toEqual([true, true]);
    const commented = await step(paul, mode, { tool: "issue.comment", scope: 1, kind: "comment" }, { fields: { body: "I will write it." }, idempotencyKey: "comment-1" });
    expect(commented["answer"]).toBe("accepted");
    await settled(paul, 0, "a comment advances a head and changes no declaration");
    await step(rita, mode, { tool: "issue.assign", scope: 1, kind: "assign" }, { on: 0, fields: { assignees: ["@paul"] }, idempotencyKey: "assign-1" });
    // A second issue under the same declaration changes nothing in the list.
    const second = await step(paul, mode, { tool: "issue.create", scope: "directory", kind: "open-issue" }, { fields: { definition: DEMO_DIGESTS.issue, title: "A second issue", conditions: ["done"] }, idempotencyKey: "issue-2" });
    await paul.ok("wait", { scope: "directory", entry: (second["fact"] as { seq: number }).seq });
    await settled(paul, 0, "a second lane of a known declaration");

    // The capability steps: a commitment and a hold, then two steps of hold@1 at a resource that is not the act's target, a
    // same-step retry, a lost step reply recovered by asking the same step again, then the act's own submission and settlement.
    const offer = await step(rita, mode, { tool: "issue.offer", scope: 1, kind: "offer" }, { fields: { offeree: "@paul" }, idempotencyKey: "offer-1" });
    const commitment = (offer["fact"] as FactRef).seq;
    const filed = await paul.ok("step", { scope: 1, seq: 0 });
    const terms: FactRef = { at: (offer["fact"] as FactRef).at, seq: 0, hash: filed["hash"] as Digest };
    await step(paul, mode, { tool: "issue.take", scope: 1, kind: "accept" }, { on: commitment, fields: { terms }, idempotencyKey: "take-1" });
    const held = await step(paul, mode, { tool: "issue.work", scope: 1, kind: "take-hold" }, { fields: { commitment }, idempotencyKey: "work-1" });
    const hold = (held["fact"] as FactRef).seq;
    const report = { target: 1, kind: "report", fields: { commitment, terms, commit: "c".repeat(40), tree: "d".repeat(40) }, idempotencyKey: "hand-in-1" };
    const stage = await paul.ok("prepare", { ...report, resource: 2, capability: "hold@1", step: "stage" });
    const check = await paul.ok("prepare", { ...report, resource: 2, capability: "hold@1", step: "check" });
    const again = await paul.ok("prepare", { ...report, resource: 2, capability: "hold@1", step: "stage" });
    for (const s of [stage, check, again]) expect(s["sentence"]).toMatch(/^sc_\w+ answered step (stage|check) of hold@1 for your intent: \w+.*The act is not submitted by this; its phase is prepared\.$/);
    expect(again["step"]).toEqual(stage["step"]);
    room.loseNextReply("/preparations");
    const lost = await paul.ok("prepare", { ...report, resource: 2, capability: "hold@1", step: "check" });
    expect([lost["sentence"], (lost["act"] as { phase: string }).phase]).toEqual([expect.stringMatching(/was lost; this step's outcome is unknown\. The act's phase is unchanged\./), "prepared"]);
    const recovered = await paul.ok("prepare", { ...report, resource: 2, capability: "hold@1", step: "check" });
    expect((recovered["step"] as { phase: string }).phase).toBe("answered");
    // The exact answer: refused, capability-refused, not-staged, at the foreign resource (lane 2), which holds no hold under this
    // commitment, and also at the lane itself (lane 1): hold@1 stages a report only after the holder's hold@1:instance step,
    // which is a capability step with no act, and no tool of this server sends one. A refused step writes no entry, so the retry
    // is answered with the same refusal. An accepted step, and its retry answered with its first entry, are custody.test.ts's
    // cases, against scripted answers: they show what the server keeps, and nothing about hold@1's judgment.
    for (const s of [stage, check, again, recovered]) expect((s["step"] as { answer: { answer: string; reason: string; name: string } }).answer).toMatchObject({ answer: "refused", reason: "capability-refused", name: "not-staged" });
    const own = await paul.ok("prepare", { ...report, idempotencyKey: "hand-in-own", resource: 1, capability: "hold@1", step: "stage" });
    expect((own["step"] as { answer: unknown }).answer).toMatchObject({ answer: "refused", reason: "capability-refused", name: "not-staged" });
    lines.push(`room story, ${mode}: steps at a foreign resource: ${[stage, check, again, lost, recovered].map((x) => String(x["sentence"]).replace(/^sc_\w+ /, "")).join(" | ")}`);
    const handIn = await step(paul, mode, { tool: "issue.hand-in", scope: 1, kind: "report" }, { fields: report.fields, idempotencyKey: report.idempotencyKey });
    // The act itself is refused for the same reason: nothing staged its report.
    expect([handIn["answer"], handIn["reason"], handIn["name"]]).toEqual(["refused", "capability-refused", "not-staged"]);
    lines.push(`room story, ${mode}: hand-in answered ${String(handIn["answer"])} ${String(handIn["reason"] ?? "")} ${String(handIn["name"] ?? "")}`);
    const settledHandIn = await paul.ok("settle", { target: 1, idempotencyKey: report.idempotencyKey });
    expect(settledHandIn["answer"]).toBe(handIn["answer"]);
    const steps = settledHandIn["steps"] as { step: string; phase: string }[];
    const foreign = (stage["step"] as { resource: string }).resource;
    expect(steps.filter((s) => (s as unknown as { resource: string }).resource === foreign).map((s) => [s.step, s.phase]).sort()).toEqual([["check", "answered"], ["stage", "answered"]]);
    // A step's answer is never the act's receipt: the act's fact, if any, is the target's own entry.
    if (handIn["answer"] === "accepted") expect((handIn["fact"] as FactRef).at.scope).not.toBe((stage["step"] as { resource: string }).resource);

    // The accepted workflow, under another key: the holder's instance, a step with no act; the report's stage and check; then
    // the act itself, accepted, and its own settlement. hold@1's outside operations are answered by the Host STAND-IN.
    const laneRef = (await paul.ok("inspect", { scope: 1 }))["ref"] as { scope: string; inc: string; kind: string };
    const instance = await paul.ok("prepare", { resource: 1, capability: "hold@1", step: "instance", fields: { hold, task: { ...laneRef, kind: "task" }, instance: "i-1" }, idempotencyKey: "instance-1" });
    expect((instance["step"] as { answer: { answer: string } }).answer.answer, JSON.stringify(instance)).toBe("accepted");
    const staged = { ...report, idempotencyKey: "hand-in-2" };
    const stageAccepted = await paul.ok("prepare", { ...staged, resource: 1, capability: "hold@1", step: "stage" });
    const stagedAt = (stageAccepted["step"] as { answer: { answer: string; fact: FactRef } }).answer;
    expect(stagedAt.answer, JSON.stringify(stageAccepted)).toBe("accepted");
    // The stage opened a staging and two mints; the check is accepted once their outcomes are written. Each wait lets the
    // scheduler run one entry further.
    let checked: Record<string, unknown> = {};
    for (let seq = stagedAt.fact.seq + 1, n = 0; n < 12; n++, seq++) {
      await paul.ok("wait", { scope: 1, seq });
      checked = await paul.ok("prepare", { ...staged, resource: 1, capability: "hold@1", step: "check" });
      if ((checked["step"] as { answer: { answer: string } }).answer.answer === "accepted") break;
    }
    expect((checked["step"] as { answer: { answer: string } }).answer.answer, JSON.stringify(checked)).toBe("accepted");
    const handedIn = await step(paul, mode, { tool: "issue.hand-in", scope: 1, kind: "report" }, { fields: report.fields, idempotencyKey: "hand-in-2" });
    expect(handedIn["answer"], JSON.stringify(handedIn)).toBe("accepted");
    const settledAccepted = await paul.ok("settle", { target: 1, idempotencyKey: "hand-in-2" });
    expect([settledAccepted["answer"], (settledAccepted["fact"] as FactRef).seq]).toEqual(["accepted", (handedIn["fact"] as FactRef).seq]);
    expect((settledAccepted["steps"] as { step: string; answer: string }[]).map((x) => [x.step, x.answer]).sort()).toEqual(expect.arrayContaining([["check", "accepted"], ["stage", "accepted"]]));
    lines.push(`room story, ${mode}: the accepted workflow: instance, stage and check accepted; the hand-in accepted at entry ${(handedIn["fact"] as FactRef).seq}`);

    // A change: opened with the definition's bytes, its rules asked, one file proposed, merged and published by the room.
    exercises("platform:directory", "open-pr", "values");
    const pr = await step(paul, mode, { tool: "change.create", scope: "directory", kind: "open-pr" }, { fields: { definition: DEMO_DIGESTS.change, title: "Write the handbook", draft: false }, values: [canonicalize(changeDemo)], idempotencyKey: "change-1" });
    await paul.ok("wait", { scope: "directory", entry: (pr["fact"] as { seq: number }).seq });
    await settled(paul, 1, "the first change lane brings the change declaration's tools");
    const number = 3;
    await step(paul, mode, { tool: "change.ask-rules", scope: number, kind: "ask-rules" }, { on: 0, idempotencyKey: "ask-1" });
    await paul.ok("wait", { scope: number, type: "rules" });
    const destination = await paul.ok("inspect", { scope: "destination" });
    const head = (destination["items"] as { type: string; values: { head?: string } }[]).find((i) => i.type === "branch")!.values.head!;
    const content = "# The handbook\n\nWritten by the room.\n";
    const proposed = await step(paul, mode, { tool: "change.propose-file", scope: number, kind: "propose-file" }, { fields: { base: head, path: "README.md", digest: digestBytes(utf8(content)), size: utf8(content).length, content }, idempotencyKey: "propose-1" });
    expect(proposed["answer"], JSON.stringify(proposed)).toBe("accepted");
    const manifest = (proposed["fact"] as FactRef).seq;
    // A review: rita, who is not an author, approves the version.
    const reviewed = await step(rita, mode, { tool: "change.review", scope: number, kind: "review-verdict" }, { fields: { manifest, verdict: "approve" }, idempotencyKey: "review-1" });
    expect(reviewed["answer"], JSON.stringify(reviewed)).toBe("accepted");
    const merged = await step(rita, mode, { tool: "change.merge", scope: number, kind: "merge" }, { fields: { manifest, reports: [] }, idempotencyKey: "merge-1" });
    expect(merged["answer"], JSON.stringify(merged)).toBe("accepted");
    const published = await rita.ok("wait", { scope: number, item: (merged["fact"] as FactRef).seq, type: "merge", states: ["published", "refused", "aborted"] });
    expect((published["item"] as { state: string }).state).toBe("published");

    // The issue closes; a read token and its credential, once, for Git.
    await step(rita, mode, { tool: "issue.close-any", scope: 1, kind: "close-any" }, { on: 0, fields: { reason: "completed" }, idempotencyKey: "close-1" });
    const token = await step(paul, mode, { tool: "repository.read-token", scope: "destination", kind: "read-token" }, { on: 0, fields: { hours: 1 }, idempotencyKey: "token-1" });
    const seq = (token["fact"] as FactRef).seq;
    await paul.ok("wait", { scope: "destination", seq: seq + 1 });
    const credential = await paul.ok("credential", { entry: seq });
    expect(credential).toMatchObject({ credential: expect.any(String), remote: expect.stringMatching(/^https:/) });
    await settled(paul, 0, "the end of the story");
    lines.push(`room story, ${mode}: requests to the scope service: rita ${rita.requests.length}, paul ${paul.requests.length}`);
    return { told: { creation: atCreation, rita: rita.told, paul: paul.told }, requests: rita.requests.length + paul.requests.length };
  } finally { room.done(); }
}

// Invariant: through the act tools alone, agents of two roles create a room and do the whole demo story, every tool they call
// was listed for their role at that moment, and a list change is told after an activation, a role change and the first lane of
// a new declaration, and at no other step.
test("the room story, through the act tools", async ({ annotate }) => {
  const lines: string[] = [];
  const { told } = await story("default", lines);
  for (const line of lines) await annotate(line);
  await annotate(`room story, default mode: list changes told: rita ${told["rita"]} (${told["founding"]} while founding), paul ${told["paul"]}`);
}, 600_000);

// Invariant: the same story through actions and act alone, in --generic mode.
test("the room story, through actions and act", async ({ annotate }) => {
  const lines: string[] = [];
  const { told } = await story("generic", lines);
  for (const line of lines) await annotate(line);
  await annotate(`room story, --generic mode: list changes told: rita ${told["rita"]} (${told["founding"]} while founding), paul ${told["paul"]}`);
}, 600_000);
