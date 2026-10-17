import { runInDurableObject } from "cloudflare:test";
import { expect, onTestFinished, test } from "vitest";
import type { DeclaredDefinition, Intent, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, intentDigest, isSeed, scopeIdOf, seedDigest, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { command, issueInvitation, memoryStore, type Context } from "../../cli/src/index.ts";
import { keys } from "@generalbusiness/dap-derive/testing";
import { APPLICATION_COHORT, FILE_PUBLICATION_COHORT, APPLICATION_VALUES_BYTES, FIRST_ACTIONS_OF, platform, repositoryName } from "@generalbusiness/dap-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { counting } from "../../../apps/counter/definition.ts";
import { COUNTING_DEFINITION } from "../../../apps/counter/pin.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam } from "./repository.ts";
import { dispatchFixture } from "./support/native-fixture-lifetime.ts";
import { reader } from "./support.ts";
import { siteFixtureLifetime } from "./support/site-fixture-lifetime.ts";

const SERVICE = "https://scopes.test";

// Each selected cohort runs one real native graph and production membership/creation/replay. Git host,
// clock, local memoryStore and read inspector are labelled stand-ins. The CLI
// selects the explicit application cohort over the real routed transport.
// The SQL trigger is an explicit
// retention-fault control; it writes no invented native entry or authority.
test.each([{ name: "application", cohort: APPLICATION_COHORT }, { name: "application-publication", cohort: FILE_PUBLICATION_COHORT }])("$name establishes Counting with native authority and atomic retained provenance; unknown creation recovers once and Initialize requires an explicit domain grant", async ({ name, cohort }) => {
  const lifetime = siteFixtureLifetime();
  const settle = (...nodes: readonly Platform[]) => dispatchFixture(nodes, lifetime.wait);
  let releaseRegister = () => {};
  onTestFinished(() => releaseRegister());
  // Guard every actual RPC boundary, including nested Platform helpers. An
  // already-started RPC cannot be cancelled; a released continuation cannot
  // start another one or mutate the shared clock/settings.
  class OwnedPlatform extends Platform {
    override get stub() {
      const target = super.stub;
      return new Proxy(target, { get(source, key) {
        const value: unknown = Reflect.get(source, key, source);
        return typeof value === "function" ? (...args: unknown[]) => lifetime.wait(() => Promise.resolve(Reflect.apply(value, source, args))) : value;
      } });
    }
    override async created(seq: number, n = 0): Promise<Platform> {
      const entry = (await lifetime.wait(() => this.entries()))[seq];
      const send = entry?.sends.find((candidate) => candidate.n === n);
      if (!send || send.message.class !== "request" || send.message.type !== "create" || !isSeed(send.to)) {
        throw new Error("a created scope requires an actual create request with a validated seed");
      }
      return new OwnedPlatform(scopeIdOf(send.to));
    }
  }
  const store = memoryStore();
  await lifetime.wait(() => store.keep("operator", rita.secret));
  const fetch: Fetch = (url, init) => lifetime.wait(() => routed(url, init));
  const context: Context = { store, fetch, trustedCreationService: { service: SERVICE, fetch },
    now: () => { lifetime.active(); return timeMs(soon(0))!; } };
  const run = (...argv: string[]) => lifetime.wait(() => command(context, argv));
  const planned = await run("install", "--plan", SERVICE, "--cohort", name, "--host", "git.example", "--namespace", "application");
  expect(planned.code, planned.lines.join("\n")).toBe(0);
  const pending = await lifetime.wait(() => store.config());
  const plan = pending?.plan;
  if (!plan) throw new Error("The CLI must retain the original application install plan.");
  expect([pending?.register, plan.definition, plan["founding"].intent.actor]).toEqual([undefined, cohort.register, rita.key]);
  expect(plan.register).toBe(scopeIdOf({ v: 1, kind: "register", definition: cohort.register, creator: null, cause: intentDigest(plan["founding"].intent), ordinal: 0 }));
  const R = new OwnedPlatform(plan.register);
  let D: Platform | undefined, C: Platform | undefined;
  try {
    const host = outsideOf(R.name);
    const ports = () => { lifetime.active(); return { outside: host }; };
    wired.set(R.name, ports);
    releaseRegister = () => { if (wired.get(R.name) === ports) wired.delete(R.name); };
    expect((await R.stub.summary(reader)).ok).toBe(false);
    const installed = await run("install", "--planned", "--cohort", name);
    expect(installed.code, installed.lines.join("\n")).toBe(0);
    const kept = await lifetime.wait(() => store.config());
    expect(kept?.register).toEqual(await R.at());
    expect(kept?.plan).toMatchObject({ ...plan, acknowledged: { status: "service-acknowledged", service: SERVICE } });
    expect((await R.summary()).value).toMatchObject({ definition: cohort.register, status: "active" });
    const creation = (await R.entries())[0]!.input;
    if (creation.type !== "genesis") throw new Error("The CLI install must produce a native genesis.");
    expect(creation["founding"]).toEqual(plan["founding"]);
    const claim = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", "founderHandle": "@rita", recoveryKey: sam.key } });
    const directorySeed: Seed = { v: 1, kind: "directory", definition: cohort.directory, creator: await R.at(), cause: intentDigest(claim.intent), ordinal: 0 };
    D = new OwnedPlatform(scopeIdOf(directorySeed));
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(directorySeed), 1), id: "application-fixture" } } });
    expect(await R.stub.submit(claim, [])).toMatchObject({ answer: "accepted" });
    await (R.stub as unknown as { effect(): Promise<number> }).effect();
    await settle(R, D);
    const creates = (await D.entries())[0]!.sends.filter((send) => send.message.class === "request" && send.message.type === "create");
    expect(creates).toHaveLength(3);
    const creator = await D.at();
    const siblings = [
      { kind: "membership", definition: cohort.membership },
      { kind: "rules", definition: cohort.rules },
      { kind: "destination", definition: cohort.destination },
    ] as const;
    const [M, Q, G] = siblings.map(({ kind, definition }, ordinal) => {
      const selected = creates.filter((send) => isSeed(send.to) && send.to.kind === kind);
      expect(selected).toHaveLength(1);
      const send = selected[0];
      if (!send || !isSeed(send.to)) throw new Error("one actual create request supplies each validated sibling seed");
      // Native result/control fullrefs are not seeds. Send numbers are1/2/3;
      // creation ordinals are0/1/2 under this exact directory genesis cause.
      expect([send.n, send.to]).toEqual([ordinal + 1, { v: 1, kind, definition, creator, cause: seedDigest(directorySeed), ordinal }]);
      return new OwnedPlatform(scopeIdOf(send.to));
    });
    if (!M || !Q || !G) throw new Error("the complete three-child cohort is required");
    await settle(R, D, M, Q, G);
    expect((await D.summary()).value.definition).toBe(cohort.directory);
    expect([(await M.summary()).value.definition, (await Q.summary()).value.definition, (await G.summary()).value.definition]).toEqual([cohort.membership, cohort.rules, cohort.destination]);
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const membership = await M.at();

    // Actual authenticated birth-session reads must select the exact directory pin even
    // though its destination@2 pin is also used by the legacy directory@2.
    const issued = await lifetime.wait(() => requestSession(SERVICE, M.name, sessionRequest(membership, rita.secret, soon(60), crypto.randomUUID()), { fetch: routed as unknown as Fetch }));
    expect(issued.ok, issued.ok ? undefined : `Read session refused: ${issued.reason}`).toBe(true);
    if (!issued.ok) throw new Error("the actual admin receives a read session");
    expect((await lifetime.wait(() => routed(`${SERVICE}/v1/scopes/${G.name}`, { headers: { authorization: issued.session.reader() } }))).status).toBe(200);

    const secret = "native-member-invitation-fixture-32-bytes";
    const invitation = await M.did(rita, "invite-member", { fields: { handle: "@sam", role: "member", inviteHash: textDigest(secret), inviteEnds: soon(60) } });
    // This key joins the actual @sam invitation; sam stays the recovery key.
    const invitedPeer = keys.vic;
    await M.did(invitedPeer, "join", { fields: { invitation, secret } });
    const bytes = canonicalize(counting);
    expect(await Q.stub.submit(await Q.intent(rita, "activate", { fields: { digest: COUNTING_DEFINITION, name: "counting" } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    // Made-up container checks the generic native closure and a legitimate
    // non-opener MemberRef; its named child is the real exact Counting pin.
    const container: DeclaredDefinition = { format: "artroom-definition-1", name: "counting-container", profile: counting.profile,
      capabilities: [], genesis: "establish", items: { configuration: counting.items["configuration"]! },
      acts: { establish: { ...counting.acts["establish"]!, fields: { ...counting.acts["establish"]!.fields, peer: { type: "member", required: true } },
        sends: [{ create: { kind: "lane", definition: COUNTING_DEFINITION, fields: { opener: { field: "opener" }, target: { field: "target" } }, result: {} } }] } },
      receives: {}, timed: {}, rules: {} };
    const containerDigest = definitionDigest(container), containerBytes = canonicalize(container);
    expect(await Q.stub.submit(await Q.intent(rita, "activate", { fields: { digest: containerDigest, name: container.name } }), [], { values: [containerBytes] })).toMatchObject({ answer: "unavailable" });
    expect(await Q.stub.submit(await Q.intent(rita, "activate", { fields: { digest: containerDigest, name: container.name, dependency1: COUNTING_DEFINITION } }), [], { values: [containerBytes, bytes] })).toMatchObject({ answer: "accepted" });
    const ask = async (fields: Intent["fields"], who = rita) => D!.intent(who, "establish-application", { expected: await D!.expected({ repository: 0 }), fields });
    const fields = { definition: COUNTING_DEFINITION, values: '{"target":7}', execution: "recorded-do" };
    const beforeRefusal = (await D.summary()).at;
    const containerFields = { definition: containerDigest, values: canonicalize({ target: 7, peer: { membership, member: "@sam" } }), execution: "recorded-do" };
    expect(await D.stub.submit(await ask(containerFields), [], { values: [containerBytes] })).toMatchObject({ answer: "unavailable" });
    expect((await D.stub.submit(await ask({ ...containerFields, dependency1: COUNTING_DEFINITION }), [], { values: [containerBytes] })).answer).toBe("refused");
    expect(await D.stub.submit(await ask(fields, invitedPeer), [], { values: [bytes] })).toMatchObject({ answer: "refused", reason: "unauthorized" });
    expect((await D.stub.submit(await ask({ ...fields, membership: { ...membership, member: "@sam" } }), [], { values: [bytes] })).answer).toBe("refused");
    for (const values of ['{"target":0}', canonicalize({ target: 7, opener: { membership, member: "@sam" } }), "x".repeat(APPLICATION_VALUES_BYTES + 1)]) {
      expect((await D.stub.submit(await ask({ ...fields, values }), [], { values: [bytes] })).answer).toBe("refused");
    }
    expect((await D.stub.submit(await ask(fields), [], { values: [] })).answer).toBe("refused");
    expect((await D.summary()).at).toEqual(beforeRefusal);
    expect((await D.summary()).value.items.some((item) => item.type === "application")).toBe(false);

    // Atomic failure after append but during retention rolls back entry,
    // application and outbox together. No dispatcher can escape that seal.
    const failed = await ask(fields);
    const failedSeed: Seed = { v: 1, kind: "lane", definition: COUNTING_DEFINITION, creator: await D.at(), cause: intentDigest(failed.intent), ordinal: 0 };
    const counts = () => lifetime.wait(() => runInDurableObject(D!.object, (_instance, state) => state.storage.sql.exec("SELECT (SELECT COUNT(*) FROM entry) AS entries, (SELECT COUNT(*) FROM outbox) AS duties, (SELECT COUNT(*) FROM retained_input) AS inputs").one()));
    const beforeFailure = await counts();
    await lifetime.wait(() => runInDurableObject(D!.object, (_instance, state) => state.storage.sql.exec("CREATE TRIGGER application_retention_fault BEFORE INSERT ON retained_input WHEN NEW.kind = 'definition' BEGIN SELECT RAISE(ABORT, 'fixture retention fault'); END")));
    try { await expect(D.stub.submit(failed, [], { values: [bytes] })).rejects.toThrow(); }
    finally { await lifetime.wait(() => runInDurableObject(D!.object, (_instance, state) => state.storage.sql.exec("DROP TRIGGER application_retention_fault"))); }
    expect(await counts()).toEqual(beforeFailure);
    expect((await new OwnedPlatform(scopeIdOf(failedSeed)).stub.summary(reader)).ok).toBe(false);

    const signed = await ask(fields);
    const childSeed: Seed = { v: 1, kind: "lane", definition: COUNTING_DEFINITION, creator: await D.at(), cause: intentDigest(signed.intent), ordinal: 0 };
    C = new OwnedPlatform(scopeIdOf(childSeed));
    lifetime.wire(C.name, () => NO_OUTSIDE);
    lifetime.setHold((envelope) => "definition" in envelope.to && envelope.to.definition === COUNTING_DEFINITION);
    const accepted = await D.stub.submit(signed, [], { values: [bytes] });
    expect(accepted.answer).toBe("accepted");
    if (accepted.answer !== "accepted") throw new Error("the authorized native application entry is recorded");
    const parent = (await D.entries())[accepted.receipt.fact.seq]!;
    expect(parent.sends).toHaveLength(1);
    expect(parent.sends[0]!.to).toEqual(childSeed);
    expect(parent.sends[0]!.message).toMatchObject({ class: "request", type: "create", body: { membership, creationContext: { v: 1 }, directory: await D.at(), fields: { opener: { membership, member: "@rita" }, target: 7 } } });
    expect(await D.stub.retained(reader, "definition", COUNTING_DEFINITION)).toMatchObject({ ok: true, value: { bytes } });
    expect((await D.item(accepted.receipt.fact.seq)).state).toBe("creating");
    expect((await C.stub.summary(reader)).ok).toBe(false);
    await settle(D, C);
    await lifetime.wait(() => D!.restart());
    expect(await D.stub.submit(signed, [], { values: [bytes] })).toEqual(accepted);
    expect((await D.stub.outbox(reader)).ok).toBe(true);
    lifetime.setHold(() => false);
    lifetime.advance(2);
    await settle(D, C);
    expect(await D.item(accepted.receipt.fact.seq)).toMatchObject({ state: "created", refs: { scope: await C.at() } });
    expect((await C.summary()).value).toMatchObject({ definition: COUNTING_DEFINITION, status: "active", items: [{ type: "configuration", state: "ready", values: { target: 7 }, parties: { controller: { membership, member: "@rita" } } }] });
    expect(await C.stub.retained(reader, "definition", COUNTING_DEFINITION)).toMatchObject({ ok: true, value: { bytes } });
    expect((await C.entries())[0]!.input).toMatchObject({ type: "genesis", seed: childSeed, source: accepted.receipt.fact });
    expect((await C.act(rita, "initialize", { expected: await C.expected({ configuration: 0 }) })).answer).toBe("refused");
    await M.did(rita, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role: "admin", actions: [...FIRST_ACTIONS_OF[cohort.membership]!.admin, "counting.control"] } });
    lifetime.advance(301); // The old grant reuse window must end; no immediate-revocation claim.
    await C.did(rita, "initialize", { expected: await C.expected({ configuration: 0 }) });
    expect((await C.summary()).value.items.find((item) => item.type === "board")).toMatchObject({ state: "paused", values: { target: 7 } });
    expect((await C.entries()).flatMap((entry) => entry.effects.filter((effect) => effect.effect === "operation"))).toEqual([]);
    const applicationEntries = (await D.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "establish-application");
    expect(applicationEntries).toHaveLength(1);
    const contained = await D.stub.submit(await ask({ ...containerFields, dependency1: COUNTING_DEFINITION }), [], { values: [containerBytes, bytes] });
    expect(contained.answer).toBe("accepted");
    if (contained.answer !== "accepted") throw new Error("the complete bound container is admitted");
    const A = await D.created(contained.receipt.fact.seq);
    await settle(D, A);
    const nested = await A.created(0, 1);
    await settle(D, A, nested);
    const nestedCreate = (await A.entries())[0]!.sends.find((send) => send.n === 1);
    expect(nestedCreate?.message).toMatchObject({ class: "request", type: "create", body: { creationContext: { v: 1 }, membership } });
    expect((await nested.entries())[0]!.input).toMatchObject({ type: "genesis", message: { body: { creationContext: { v: 1 }, membership } } });
    expect((await lifetime.wait(() => routed(`${SERVICE}/v1/scopes/${nested.name}`, { headers: { authorization: issued.session.reader() } }))).status).toBe(200);
    await nested.did(rita, "initialize", { expected: await nested.expected({ configuration: 0 }) });
    expect((await nested.summary()).value.items.find((item) => item.type === "board")).toMatchObject({ state: "paused", values: { target: 7 } });
    expect((await A.entries())[0]!.input).toMatchObject({ type: "genesis", message: { body: { fields: { peer: { membership, member: "@sam" } } } } });
    for (const [digest, value] of [[containerDigest, containerBytes], [COUNTING_DEFINITION, bytes]] as const) {
      expect(await D.stub.retained(reader, "definition", digest)).toMatchObject({ ok: true, value: { bytes: value } });
      expect(await A.stub.retained(reader, "definition", digest)).toMatchObject({ ok: true, value: { bytes: value } });
    }
    const publicationChildren: Platform[] = [];
    if (name === "application-publication") {
      const directory = await D.at();
      await lifetime.wait(() => store.save({ ...kept!, handle: "@rita", repository: { directory, membership, rules: Q.name, destination: G.name } }));
      const invite = await lifetime.wait(() => issueInvitation(context, { kind: "person", handle: "@reader", hours: 1, role: "member" }, { privateRequests: [], mode: "new", operation: crypto.randomUUID(), current: () => { lifetime.active(); return true; } }));
      expect(invite.state).toBe("verified");
      const published: DeclaredDefinition = { ...counting,
        items: { ...counting.items, configuration: { ...counting.items["configuration"]!, refs: { ...counting.items["configuration"]!.refs, destination: { fixed: true, required: true, to: { type: "scope", kind: "destination" } } } } },
        acts: { ...counting.acts, establish: { ...counting.acts["establish"]!, fields: { ...counting.acts["establish"]!.fields, destination: { type: "scope", kind: "destination", required: true } }, effects: [...counting.acts["establish"]!.effects, { ref: { slot: "destination", from: { field: "destination" } } }] } } };
      const digest = definitionDigest(published), content = canonicalize(published), destination = await G.at();
      expect(await Q.stub.submit(await Q.intent(rita, "activate", { fields: { digest, name: published.name } }), [], { values: [content] })).toMatchObject({ answer: "accepted" });
      const values = { definition: digest, values: '{"target":7}', execution: "recorded-do" };
      const before = (await D.summary()).at;
      expect((await D.stub.submit(await ask({ ...values, values: canonicalize({ target: 7, destination }) }), [], { values: [content] })).answer).toBe("refused");
      expect((await D.summary()).at).toEqual(before);
      const original = await ask(values), accepted = await D.stub.submit(original, [], { values: [content] });
      expect(accepted.answer).toBe("accepted");
      if (accepted.answer !== "accepted") throw new Error("Native publication factory must create the application");
      const parent = (await D.entries())[accepted.receipt.fact.seq]!;
      expect(parent.sends[0]!.message).toMatchObject({ class: "request", type: "create", body: { fields: { destination }, directory: await D.at(), membership, creationContext: { v: 1 } } });
      const child = await D.created(accepted.receipt.fact.seq);
      await settle(D, child);
      expect((await child.item(0)).refs["destination"]).toEqual(destination);
      expect((await child.entries())[0]!.input).toMatchObject({ type: "genesis", source: accepted.receipt.fact, seed: { creator: await D.at(), cause: intentDigest(original.intent), ordinal: 0 } });
      await lifetime.wait(() => child.restart());
      expect((await child.item(0)).refs["destination"]).toEqual(destination);
      expect(await D.stub.submit(original, [], { values: [content] })).toEqual(accepted);
      publicationChildren.push(child);
    }
    const replayFetch: Fetch = (url, init) => lifetime.wait(() => routed(url, init));
    for (const node of [D, C, A, nested, ...publicationChildren]) {
      const head = (await node.summary()).at;
      const replay = await lifetime.wait(() => verify(httpSource(SERVICE, { fetch: replayFetch, reader: issued.session.reader() }), { mode: "replay", platform, grants: "proven", scope: node.name, head }));
      expect([replay.report.result, replay.why]).toEqual(["consistent", null]);
    }
  } finally {
    lifetime.release();
    releaseRegister();
  }
});
