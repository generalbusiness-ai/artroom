import { expect, test } from "vitest";
import type { Digest, FactRef, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, digestBytes, keyIdOfSecret, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "@generalbusiness/artroom-lanes";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";

/** A W2 marker: this story exercises the act with that beside input (inventory.test.ts reads these). */
export const exercises = (_definition: string, _kind: string, _input: "presented" | "values"): void => {};

/** One act, as a recipe step: by its tool in the default mode, by actions and act in --generic mode. The tool must be listed. */
export async function step(agent: Agent, mode: "default" | "generic", at: { tool: string; scope: string | number; kind: string }, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const names = await agent.names();
  if (mode === "default") {
    expect(names, `${agent.name} sees ${at.tool} listed`).toContain(at.tool);
    return agent.ok(at.tool, { ...(typeof at.scope === "number" || at.scope.startsWith("sc_") ? { target: at.scope } : {}), ...args });
  }
  expect(names).toEqual(expect.arrayContaining(["actions", "act"]));
  expect(names).not.toContain(at.tool);
  const acts = await agent.ok("actions", { scope: at.scope });
  const offered = (acts["acts"] as { kind: string }[]).map((a) => a.kind);
  expect(offered, `${agent.name} is offered ${at.kind} on ${at.scope}`).toContain(at.kind);
  return agent.ok("act", { target: at.scope, kind: at.kind, digest: acts["digest"], ...args });
}

/** Create the register and claim a room through the tools: create, room.create, wait, room.seat, room.first-key, wait. */
export async function founded(room: Room, rita: Agent, mode: "default" | "generic" = "default"): Promise<{ register: ScopeId }> {
  const installed = await rita.ok("create", { definition: "platform:register@3", kind: "install", fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", founders: [rita.key] }, idempotencyKey: "install" });
  expect(installed["answer"]).toBe("accepted");
  const register = installed["scope"] as ScopeId;
  await room.wireRegister(register);
  const recovery = keyIdOfSecret(crypto.getRandomValues(new Uint8Array(32)));
  const claimed = await step(rita, mode, { tool: "room.create", scope: register, kind: "found" }, { fields: { branch: "main", founderHandle: "@rita", recoveryKey: recovery }, idempotencyKey: "claim" });
  expect(claimed["answer"], JSON.stringify(claimed)).toBe("accepted");
  const created = await rita.ok("wait", { scope: register, entry: (claimed["fact"] as { seq: number }).seq });
  expect([created["timedOut"], (created["created"] as { kind: string }[]).map((c) => c.kind).sort()]).toEqual([false, ["destination", "directory", "membership", "rules"]]);
  expect(rita.config.repository).toBeDefined();
  const seat = await step(rita, mode, { tool: "room.seat", scope: "membership", kind: "seat" }, { idempotencyKey: "seat" });
  const member = (seat["fact"] as { seq: number }).seq;
  await step(rita, mode, { tool: "room.first-key", scope: "membership", kind: "first-key" }, { fields: { member }, idempotencyKey: "first-key" });
  const inbox = await rita.ok("wait", { scope: "membership", entry: member });
  expect([inbox["timedOut"], rita.config.repository?.inbox]).toEqual([false, expect.stringMatching(/^sc_/)]);
  return { register };
}

/**
 * The room story. Returns the number of list changes each agent was told, step by step, for the delivery note.
 */
async function story(mode: "default" | "generic"): Promise<{ told: Record<string, number>; requests: number }> {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita", { subscribe: true, mode });
    await founded(room, rita, mode);
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
    const atFounding = rita.told;
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
    const paul = room.agent("paul", { subscribe: true, mode, config: { service: rita.config.service, repository: { ...rita.config.repository!, inbox: undefined as never }, pins: { [rita.config.repository!.membership.scope]: "platform:membership@2" } } });
    delete paul.config.repository!.inbox;
    expect(await paul.names()).not.toContain("issue.create");
    await paul.tick(); seen.set(paul, paul.told);
    expect(paul.told).toBe(0);
    await settled(paul, 0, "paul's first list, before he joins");
    const joined = await step(paul, mode, { tool: "room.join", scope: "membership", kind: "join" }, { fields: { invitation, secret }, idempotencyKey: "join" });
    expect(joined["answer"], JSON.stringify(joined)).toBe("accepted");
    await settled(paul, 1, "joining gives paul a role");
    expect(await paul.names()).toContain("issue.create");
    await step(rita, mode, { tool: "member.role", scope: "membership", kind: "set-role" }, { on: invitation, fields: { role: "maintainer" }, idempotencyKey: "paul-maintainer" });
    await settled(paul, 1, "a role change changes paul's list");
    await settled(rita, 0, "rita's list does not change with paul's role");
    // The same platform tools, now described for his role.
    const described = (await room.wait(() => paul.service.page())).tools.find((t) => t.name === "issue.create")!.description;
    if (mode === "default") expect(described).toContain("which your role (maintainer) holds");

    // paul opens an issue with the definition's bytes and a detached body; the first lane of the issue declaration is a change.
    exercises("platform:directory", "open-issue", "values");
    const opened = await step(paul, mode, { tool: "issue.create", scope: "directory", kind: "open-issue" }, { fields: { definition: DEMO_DIGESTS.issue, title: "The handbook is empty", body: "Write README.md.", conditions: ["README.md says what the room is for"] }, values: [canonicalize(issueDemo)], idempotencyKey: "issue-1" });
    const lane = await paul.ok("wait", { scope: "directory", entry: (opened["fact"] as { seq: number }).seq });
    expect(lane["timedOut"]).toBe(false);
    await settled(paul, 1, "the first issue lane brings the issue declaration's tools");
    await settled(rita, 1, "and rita's");
    expect(await paul.names()).toEqual(expect.arrayContaining(["issue.comment", "issue.close-own"]));
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
    await step(paul, mode, { tool: "issue.work", scope: 1, kind: "take-hold" }, { fields: { commitment }, idempotencyKey: "work-1" });
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
    const handIn = await step(paul, mode, { tool: "issue.hand-in", scope: 1, kind: "report" }, { fields: report.fields, idempotencyKey: report.idempotencyKey });
    const settledHandIn = await paul.ok("settle", { target: 1, idempotencyKey: report.idempotencyKey });
    expect(settledHandIn["answer"]).toBe(handIn["answer"]);
    const steps = settledHandIn["steps"] as { step: string; phase: string }[];
    expect(steps.map((s) => [s.step, s.phase]).sort()).toEqual([["check", "answered"], ["stage", "answered"]]);
    // A step's answer is never the act's receipt: the act's fact, if any, is the target's own entry.
    if (handIn["answer"] === "accepted") expect((handIn["fact"] as FactRef).at.scope).not.toBe((stage["step"] as { resource: string }).resource);

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
    const merged = await step(rita, mode, { tool: "change.merge", scope: number, kind: "merge" }, { fields: { manifest, reports: [] }, idempotencyKey: "merge-1" });
    expect(merged["answer"], JSON.stringify(merged)).toBe("accepted");
    const published = await rita.ok("wait", { scope: number, item: (merged["fact"] as FactRef).seq, states: ["published", "refused", "aborted"] });
    expect((published["item"] as { state: string }).state).toBe("published");

    // The issue closes; a read token and its credential, once, for Git.
    await step(rita, mode, { tool: "issue.close-any", scope: 1, kind: "close-any" }, { on: 0, fields: { reason: "completed" }, idempotencyKey: "close-1" });
    const token = await step(paul, mode, { tool: "repository.read-token", scope: "destination", kind: "read-token" }, { on: 0, fields: { hours: 1 }, idempotencyKey: "token-1" });
    const seq = (token["fact"] as FactRef).seq;
    await paul.ok("wait", { scope: "destination", seq: seq + 1 });
    const credential = await paul.ok("credential", { entry: seq });
    expect(credential).toMatchObject({ credential: expect.any(String), remote: expect.stringMatching(/^https:/) });
    await settled(paul, 0, "the end of the story");
    return { told: { founding: atFounding, rita: rita.told, paul: paul.told }, requests: rita.requests.length + paul.requests.length };
  } finally { room.done(); }
}

// Invariant: through the act tools alone, agents of two roles create a room and do the whole demo story, every tool they call
// was listed for their role at that moment, and a list change is told after an activation, a role change and the first lane of
// a new declaration, and at no other step.
test("the room story, through the act tools", async () => {
  const { told } = await story("default");
  console.log(`room story, default mode: list changes told: rita ${told["rita"]} (${told["founding"]} while founding), paul ${told["paul"]}`);
}, 600_000);

// Invariant: the same story through actions and act alone, in --generic mode.
test("the room story, through actions and act", async () => {
  const { told } = await story("generic");
  console.log(`room story, --generic mode: list changes told: rita ${told["rita"]} (${told["founding"]} while founding), paul ${told["paul"]}`);
}, 600_000);
