/**
 * Tagged agent-key issuance and enrolment on the current application cohorts (request 53850986): the Counting cohort, whose
 * membership is pinned to platform:membership@5, and the application cohort, pinned to platform:membership@4. The command's
 * functions run over the Worker's real routes on real scopes of the namespace PLATFORM, with the real read sessions under a
 * TEST SECRET; the Git host and the scheduler are STAND-INs, as in story.scope.test.ts.
 *
 * Witnesses: issuance and enrolment of two separate agent configurations with real membership@5 receipts and the agent role's
 * acts; the same on membership@4, with a kept person invitation whose answer is lost, checked and joined; and three refusals: an invitation whose pin names another definition than the membership's
 * receipt, a counting invitation presented to the library's membership, and an issuance by an admin who names another member
 * as the controller. No link is relabelled into acceptance, no directory allowlist is widened, no person is substituted, and no
 * key is transplanted between rooms.
 */
import { describe, expect, test } from "vitest";
import type { Digest, Item, OperationId, Read, Receipt, ScopeRef, Seed, SignedIntent } from "@generalbusiness/dap-contract";
import { b64url, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { AGENT_KEY_LINK, agentKeyInvitationOf, encodeAgentKeyInvitation, type AgentKeyInvitation, type Fetch } from "@generalbusiness/artroom-client";
import { APPLICATION_COHORT, COUNTING_COHORT, repositoryName } from "@generalbusiness/dap-platform";
import { beginSessionFixture } from "../../scope/test/session-settings.ts";
import { Platform, routed } from "../../scope/test/repository.ts";
import { outsideOf } from "../../scope/test/outside.ts";
import { dispatchFixture, effectFixture, nativeFixtureLifetime } from "../../scope/test/support/native-fixture-lifetime.ts";
import { command, enrolAgentKey, issueInvitation, linkOf, memoryStore, type Config, type Context, type Outcome, type Store } from "../src/index.ts";

const SERVICE = "https://scopes.test";
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

describe("tagged agent-key enrolment on the Counting and application cohorts, over the Worker's routes on real scopes", () => {
  test("membership@5: two agents enrolled with real receipts and the agent role's acts; membership@4: one more, and a kept person invitation checked after a lost answer and joined; a relabelled pin, a link presented to another room and a foreign controller are each refused with nothing replaced", async () => {
    const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
    const lifetime = nativeFixtureLifetime(owner);
    try { await story(lifetime); } finally { lifetime.release(); }
  }, 180_000);
});

type Lifetime = ReturnType<typeof nativeFixtureLifetime>;

async function story(lifetime: Lifetime): Promise<void> {
  const now = lifetime.now;
  const node = lifetime.platform;
  const registers: Platform[] = [];
  const memberships: Platform[] = [];
  /** The inbox scopes a membership's entries created: what each add-member sent. */
  const inboxesOf = async (M: Platform): Promise<Platform[]> => (await M.entries()).flatMap((entry) => entry.sends.flatMap((send) => "creator" in send.to && (send.to as Seed).kind === "inbox" ? [node(scopeIdOf(send.to as Seed))] : []));
  /** STAND-IN for the scheduler: the memberships' dispatchers and the inboxes they created, as a deployment's alarms would run. */
  const settle = async (): Promise<void> => {
    for (const M of memberships) await dispatchFixture([M, ...(await inboxesOf(M))], lifetime.wait);
  };
  // Each request goes through the Worker's routes; after an act is answered the scheduler stand-in runs, so an issuance's add-member
  // has its inbox created before the issuance verifies it, as a deployment's alarm would have.
  let actSubmits = 0, forbidActSubmit = false;
  const fetch = (async (url: string, init?: RequestInit) => {
    if (new URL(url).pathname.endsWith("/acts")) {
      actSubmits++;
      if (forbidActSubmit) throw Error("SUBMIT TRIPWIRE: retained or locally refused work must not submit an act");
    }
    const response = await lifetime.wait(() => routed(url, init));
    if (new URL(url).pathname.endsWith("/acts")) await settle();
    return response;
  }) as unknown as Fetch;
  const withoutActSubmission = async <T>(work: () => Promise<T>): Promise<T> => {
    const before = actSubmits, previous = forbidActSubmit;
    forbidActSubmit = true;
    try { return await work(); }
    finally { forbidActSubmit = previous; expect(actSubmits, "observed act-submit tripwire, independently of unchanged heads").toBe(before); }
  };
  // STAND-IN for the scheduler while a command waits: each register's creation request gets the host's answer the test writes.
  const pause = async (waiting: readonly string[]) => {
    lifetime.active();
    for (const register of registers) {
      const claims = await (register.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "claim");
      for (const claim of (await register.summary()).value.items.filter((item) => item.type === "claim").concat(claims.ok ? claims.value : [])) {
        lifetime.active();
        outsideOf(register.name).answer(`${claim.id}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(claim.values["seed"] as Digest, 1), id: `repo-${claim.id}` } } });
      }
      await effectFixture([register], lifetime.wait);
    }
    await dispatchFixture([...registers, ...waiting.filter((scope) => !registers.some((r) => r.name === scope)).map((scope) => node(scope as never))], lifetime.wait);
  };
  // A selected-cohort install creates a register by its planned identity, which the command accepts only from a configured service
  // it trusts: the test names the routed transport as that service.
  const person = (): Context => ({ store: memoryStore(), fetch, now, pause, trustedCreationService: { service: SERVICE, fetch } });
  const run = async (who: Context, ...argv: string[]): Promise<Outcome> => lifetime.wait(() => command(who, argv));

  /** A room of one cohort, created by its admin through the command: install with the cohort, wire the host stand-in, create. */
  const create = async (admin: Context, cohort: "counting-commitments" | "application", namespace: string, name: string, handle: string) => {
    const installed = await run(admin, "install", SERVICE, "--host", "git.example", "--namespace", namespace, "--cohort", cohort);
    expect(installed.code, installed.lines.join("\n")).toBe(0);
    const R = node((await admin.store.config())!.register!.scope);
    lifetime.wire(R.name, () => {
      const host = outsideOf(R.name);
      return { outside: {
        accepts: () => { lifetime.active(); return host.accepts(); },
        send: (request) => lifetime.wait(() => host.send(request)),
        late: (deliver) => { lifetime.active(); host.late(deliver); },
      } };
    });
    await R.restart();
    registers.push(R);
    const claimed = await run(admin, "create", name, "--handle", handle);
    expect(claimed.code, claimed.lines.join("\n")).toBe(0);
    lifetime.unWire(R.name);
    const repository = (await admin.store.config())!.repository!;
    const M = node(repository.membership.scope);
    memberships.push(M);
    return { repository, M, membership: repository.membership, handle };
  };

  /**
   * One issuance's view of the admin's store, as the page's connection custody keeps one: the admin's configuration without any
   * other issuance's pointer, the admin's signing key, and this issuance's own private snapshots. Each issuance is its own
   * operation; a refused one stays retained in its own row and blocks no other.
   */
  const issuanceStore = (admin: Context): Store => {
    let config: Config | null = null;
    const privates = new Map<string, Uint8Array>();
    return {
      config: async () => { if (!config) { const { invitationIssue: _pointer, ...base } = (await admin.store.config())!; config = base; } return structuredClone(config); },
      save: async (next) => { config = structuredClone(next); },
      secret: (name) => admin.store.secret(name),
      keep: async () => { throw new Error("An issuance never replaces the admin's signing key."); },
      private: async (name) => privates.get(name)?.slice() ?? null,
      keepPrivate: async (name, bytes) => { privates.set(name, bytes.slice()); },
    };
  };
  /** The admin issues an agent-key invitation and returns the result; its link, when verified, is private. */
  const issue = async (admin: Context, membership: ScopeRef, handle: string, controller: string) => {
    const operation = crypto.randomUUID();
    return lifetime.wait(() => issueInvitation({ ...admin, store: issuanceStore(admin) }, { kind: "agent-key", handle, hours: 1, controller: { membership, member: controller as never } }, { privateRequests: [], mode: "new", operation }));
  };
  const link = async (admin: Context, membership: ScopeRef, handle: string, controller: string): Promise<string> => {
    const result = await issue(admin, membership, handle, controller);
    expect([result.state, result.kind, result.reason], JSON.stringify({ ...result, link: result.link ? "<private>" : undefined })).toEqual(["verified", "agent-key", undefined]);
    expect(result.link!.startsWith(AGENT_KEY_LINK)).toBe(true);
    return result.link!;
  };
  /** The retained enrol envelope of an enrolled agent: the one signed intent its config points at. */
  const retained = async (agent: Context): Promise<SignedIntent> => {
    const config = (await agent.store.config())!;
    const bytes = (await agent.store.private(config.join!.request))!;
    return (JSON.parse(new TextDecoder().decode(bytes)) as { signed: SignedIntent }).signed;
  };
  /** Enrol one agent by the command's `join`, and witness the receipt, the member and key items, and the role's acts. */
  const enrol = async (room: Awaited<ReturnType<typeof create>>, agent: Context, text: string, handle: string, definition: string) => {
    expect(agentKeyInvitationOf(text)?.definition, "the link carries the membership's exact pin").toBe(definition);
    const enrolled = await run(agent, "join", text);
    expect(enrolled, enrolled.lines.join("\n")).toEqual({ code: 0, lines: [`Enrolled independent agent ${handle}. Native agent and controller bindings verified.`] });
    const config = (await agent.store.config())!;
    expect([config.handle, config.join?.kind, typeof config.join?.accepted?.seq, config.repository?.membership]).toEqual([handle, "enrol", "number", room.membership]);
    // The receipt the scope holds for the retained enrol, read back through the scope: it names the membership's definition.
    const envelope = await retained(agent);
    const settled = await lifetime.wait(() => (room.M.stub as unknown as { settle(signed: SignedIntent): Promise<{ ok: true; value: Receipt } | { ok: false }> }).settle(envelope));
    expect(settled.ok && settled.value.definition, "the enrolment's receipt is under the exact pin").toBe(definition);
    expect(settled.ok && settled.value.fact).toEqual(config.join!.accepted);
    // What the enrol wrote: the member is an active agent with the admin as its controller, and its key is active under this key.
    const items = (await room.M.summary()).value.items;
    const member = items.find((item) => item.type === "member" && item.values["handle"] === handle)!;
    expect([member.state, member.values["kind"], member.values["role"], member.parties["controller"]]).toEqual(["active", "agent", "agent", { membership: room.membership, member: room.handle }]);
    const key = items.find((item) => item.type === "key" && item.refs["member"] === member.id)!;
    expect([key.state, key.values["kind"]]).toEqual(["active", "agent"]);
    expect((await node(config.repository!.inbox!).summary()).value.status).toBe("active");
    // The agent's role on this membership, read with the agent's own session: the acts the role holds, under the pinned definition.
    const acts = await run(agent, "acts", "membership");
    expect([acts.code, acts.lines[0]], acts.lines.join("\n")).toEqual([0, `Acts on ${room.M.name} (${definition}) for ${handle} (agent):`]);
    expect(acts.lines.at(-1)).toMatch(/^Not shown: \d+ that need an action your role does not hold\.$/);
    const onDirectory = await run(agent, "acts", "directory");
    expect(onDirectory.code, onDirectory.lines.join("\n")).toBe(0);
    expect(onDirectory.lines.some((line) => /^  open-issue: .*needs issue\.open\./.test(line)), "the agent role holds issue.open on the directory").toBe(true);
    return { member, key: String(key.values["id"]) };
  };

  // ---- The Counting cohort: membership@5. Two agents, each its own configuration and key.
  const rita = person();
  const counter = await create(rita, "counting-commitments", "artroom", "counter", "@rita");
  expect([(await counter.M.summary()).value.definition, COUNTING_COHORT.membership]).toEqual(["platform:membership@5", "platform:membership@5"]);
  expect((await node(counter.repository.directory.scope).summary()).value.definition).toBe(COUNTING_COHORT.directory);
  const bots = [person(), person()];
  const links = [await link(rita, counter.membership, "@bot1", "@rita"), await link(rita, counter.membership, "@bot2", "@rita")];
  const first = await enrol(counter, bots[0]!, links[0]!, "@bot1", "platform:membership@5");
  const second = await enrol(counter, bots[1]!, links[1]!, "@bot2", "platform:membership@5");
  expect(first.key).not.toBe(second.key);
  expect(first.member.id).not.toBe(second.member.id);
  // No line printed to either agent holds its signing key or the link's secret.
  for (const [i, bot] of bots.entries()) {
    const config = (await bot.store.config())!;
    const secret = b64url((await bot.store.secret(config.key))!);
    const invitation = agentKeyInvitationOf(links[i]!)!;
    for (const line of (await run(bot, "acts", "membership")).lines) { expect(line).not.toContain(secret); expect(line).not.toContain(invitation.secret); }
  }

  // ---- The application cohort: membership@4, in another register. One agent.
  const lia = person();
  const library = await create(lia, "application", "elsewhere", "library", "@lia");
  expect([(await library.M.summary()).value.definition, APPLICATION_COHORT.membership]).toEqual(["platform:membership@4", "platform:membership@4"]);
  const third = await enrol(library, person(), await link(lia, library.membership, "@bot3", "@lia"), "@bot3", "platform:membership@4");
  expect([first.key, second.key]).not.toContain(third.key);

  // A kept person invitation on membership@4, the library's: `dap invite --keep` keeps the secret and the exact signed request
  // before it is sent, so a lost answer is checked and never replaced. STAND-IN: the answer to the first invite-member is lost on
  // its way back, after the scope has recorded it.
  let lose = true;
  const losing = (async (url: string, init?: RequestInit) => {
    const response = await (fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    if (lose && new URL(url).pathname.endsWith("/acts") && typeof init?.body === "string" && init.body.includes('"invite-member"')) { lose = false; throw new Error("the answer was lost"); }
    return response;
  }) as unknown as Fetch;
  const lost = await run({ ...lia, fetch: losing }, "invite", "@pat", "--role", "member", "--keep");
  expect(lost.code, lost.lines.join("\n")).toBe(1);
  expect(lose, "the invite-member was sent once and its answer lost").toBe(false);
  // While its outcome is unknown, the retained invitation blocks a new one: nothing new is signed or sent.
  const blocked = await withoutActSubmission(() => run(lia, "invite", "@quin", "--role", "member", "--keep"));
  expect(blocked).toEqual({ code: 1, lines: ["An invitation of @pat is retained. Run dap invite --check, or dap invite --continue. Nothing new was signed."] });
  const recorded = (await library.M.summary()).at;
  const checked = await run(lia, "invite", "--check");
  expect([checked.code, checked.lines[0]], checked.lines.join("\n")).toEqual([0, "Invited @pat: the invitation is recorded and verified."]);
  expect((await library.M.summary()).at, "--check sends nothing").toEqual(recorded);
  expect((await library.M.summary()).value.items.filter((item) => item.type === "member" && item.values["handle"] === "@pat"), "one invitation of @pat").toHaveLength(1);
  const personLink = checked.lines[1]!.split(": ")[1]!;
  expect(linkOf(personLink)?.definition, "the person link carries the library membership's pin").toBe("platform:membership@4");
  const pat = person();
  const joined = await run(pat, "join", personLink);
  expect(joined.code, joined.lines.join("\n")).toBe(0);
  expect((await pat.store.config())!.repository?.membership).toEqual(library.membership);
  // The finished invitation was released when it was verified, so the next one starts.
  const next = await run(lia, "invite", "@quin", "--role", "member", "--keep");
  expect([next.code, next.lines[0]], next.lines.join("\n")).toEqual([0, "Invited @quin: the invitation is recorded and verified."]);

  // Twenty Continues whose answers are all lost: each resends the same signed invite-member and keeps no new snapshot, so the
  // retained record stays readable. Then a Check whose directory read is interrupted stays unknown, and a second Check settles
  // the original: one native invitation of @rex, signed once.
  const dropping = (match: (url: string, body: string) => boolean) => (async (url: string, init?: RequestInit) => {
    const response = await (fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
    if (match(url, typeof init?.body === "string" ? init.body : "")) throw new Error("the answer was lost");
    return response;
  }) as unknown as Fetch;
  const invites = dropping((url, body) => new URL(url).pathname.endsWith("/acts") && body.includes('"invite-member"'));
  expect((await run({ ...lia, fetch: invites }, "invite", "@rex", "--role", "member", "--keep")).code).toBe(1);
  for (let i = 0; i < 20; i++) {
    const again = await run({ ...lia, fetch: invites }, "invite", "--continue");
    expect([again.code, again.lines[0]], again.lines.join("\n")).toEqual([1, expect.stringMatching(/^The invitation of @rex is unknown\./)]);
  }
  const signedOnce = (await library.M.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "invite-member" && (entry.input.signed.intent.fields as { handle?: string }).handle === "@rex");
  expect(signedOnce, "one invite-member of @rex, however often it was continued").toHaveLength(1);
  const headBefore = (await library.M.summary()).at;
  const directoryScope = library.repository.directory.scope;
  const interrupted = await withoutActSubmission(() => run({ ...lia, fetch: dropping((url) => url.includes(directoryScope)) }, "invite", "--check"));
  expect([interrupted.code, interrupted.lines[0]], interrupted.lines.join("\n")).toEqual([1, expect.stringMatching(/Nothing was read; the read may be made again\. The original invitation is retained/)]);
  const settled = await withoutActSubmission(() => run(lia, "invite", "--check"));
  expect([settled.code, settled.lines[0]], settled.lines.join("\n")).toEqual([0, "Invited @rex: the invitation is recorded and verified."]);
  expect((await library.M.summary()).at, "Check admits no new invitation").toEqual(headBefore);
  expect((await library.M.summary()).value.items.filter((item) => item.type === "member" && item.values["handle"] === "@rex")).toHaveLength(1);
  // The three modes stay distinct on the command line.
  expect((await run(lia, "invite", "--check", "--continue")).code).toBe(2);
  expect((await run(lia, "invite", "--check", "--hours", "2")).code).toBe(2);
  expect((await run(lia, "invite", "@sam", "--role", "member", "--keep", "--acts", "x")).code).toBe(2);

  // ---- Refusals. Each leaves the receiving configuration without a repository and the rooms' heads unchanged by the refusal.
  const relabel = (text: string, over: Partial<AgentKeyInvitation>): string => encodeAgentKeyInvitation({ ...agentKeyInvitationOf(text)!, ...over });
  /**
   * A link's facts presented as another room's: the repository, the controller's membership and both fact references name that
   * room's membership, while the secret, sequence numbers, hashes and revisions are the original room's. This is the shape a link
   * must have to be addressed to the other room at all.
   */
  const retarget = (text: string, room: typeof counter, over: Partial<AgentKeyInvitation> = {}): string => {
    const { directory, membership, rules, destination } = room.repository;
    const value = agentKeyInvitationOf(text)!;
    return encodeAgentKeyInvitation({ ...value, repository: { directory, membership, rules, destination }, controller: { ...value.controller, membership }, member: { ...value.member, at: membership }, invitation: { ...value.invitation, at: membership }, ...over });
  };

  // A link whose pin names another definition than the membership's receipt: the native enrol is admitted, but the configuration
  // does not take it up. The exact original is retained unverified; nothing is replaced.
  const spare = await link(rita, counter.membership, "@bot4", "@rita");
  const mislabelled = person();
  const wrongPin = await run(mislabelled, "join", relabel(spare, { definition: "platform:membership@4" }));
  expect(wrongPin).toEqual({ code: 1, lines: ["The invitation names platform:membership@4, and the membership's receipt names platform:membership@5. The exact original enrolment is retained unverified; nothing was replaced."] });
  const mislabelledConfig = (await mislabelled.store.config())!;
  expect([mislabelledConfig.repository, mislabelledConfig.handle, mislabelledConfig.join?.accepted]).toEqual([undefined, undefined, undefined]);
  // The same link, relabelled, checked again: the same refusal, and nothing further is sent.
  const headAfterWrongPin = (await counter.M.summary()).at;
  expect(await withoutActSubmission(() => lifetime.wait(() => enrolAgentKey(mislabelled, relabel(spare, { definition: "platform:membership@4" }), { mode: "check" })))).toEqual(wrongPin);
  expect((await counter.M.summary()).at).toEqual(headAfterWrongPin);

  // A counting invitation presented to the library's membership: the library refuses the enrol natively, since it holds no such
  // invitation, and the receiving configuration keeps the refusal, not a repository.
  const presentedElsewhere = person();
  const libraryHead = (await library.M.summary()).at;
  const crossRoom = await run(presentedElsewhere, "join", retarget(spare, library, { definition: "platform:membership@4" }));
  expect([crossRoom.code, crossRoom.lines[0]], crossRoom.lines.join("\n")).toEqual([1, expect.stringMatching(/^Agent enrollment refused: .*\. The exact original remains retained\.$/)]);
  expect((await library.M.summary()).at).toEqual(libraryHead);
  expect((await presentedElsewhere.store.config())!.repository).toBeUndefined();
  // Retried, the same configuration reports the retained refusal and submits no act.
  expect(await withoutActSubmission(() => run(presentedElsewhere, "join", retarget(spare, library, { definition: "platform:membership@4" })))).toEqual({ code: 1, lines: [expect.stringMatching(/^The original agent enrollment was refused: .*\. Nothing was replaced\.$/)] });
  expect((await library.M.summary()).at).toEqual(libraryHead);

  // A key of one room presented as an invitation of the other: the library membership refuses a counting agent's enrol too, under
  // the counting room's own link with its pin. The counting room's head is untouched by either.
  const counterHead = (await counter.M.summary()).at;
  const transplanted = await run(person(), "join", retarget(spare, library));
  expect(transplanted.code).toBe(1);
  expect([(await counter.M.summary()).at, (await library.M.summary()).at]).toEqual([counterHead, libraryHead]);

  // What the relabelled link did consume: the counting membership admitted that enrol natively, under its own definition, so
  // @bot4's key is active there, and no configuration holds it. Only the link's holder can relabel a private link, and the
  // issuer's pin was read from the membership itself, so a mismatch is the holder's own doing; the configuration never takes
  // up an enrolment under a definition the link did not name.
  const bot4 = (await counter.M.summary()).value.items.find((item) => item.type === "member" && item.values["handle"] === "@bot4")!;
  expect([bot4.state, (await counter.M.summary()).value.items.find((item) => item.type === "key" && item.refs["member"] === bot4.id)?.state]).toEqual(["active", "active"]);
  expect(((await counter.M.summary()).value.items.find((item) => item.type === "key" && item.refs["member"] === bot4.id)!.values["id"])).toBe((await retained(mislabelled)).intent.actor);

  // The issuer names another member as controller: no invitation act is
  // submitted. Read-session authentication may still sign and send.
  const before = (await counter.M.summary()).at;
  await expect(withoutActSubmission(() => issue(rita, counter.membership, "@bot5", "@bot1"))).rejects.toThrow("The original invitation custody or context is unavailable. Nothing was replaced.");
  expect((await counter.M.summary()).at).toEqual(before);
  expect((await counter.M.summary()).value.items.some((item) => item.type === "member" && item.values["handle"] === "@bot5")).toBe(false);
}
