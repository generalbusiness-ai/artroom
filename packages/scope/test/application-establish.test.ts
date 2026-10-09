import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { DeclaredDefinition, Intent, Seed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, definitionDigest, intentDigest, scopeIdOf, seedDigest, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { APPLICATION_COHORT, APPLICATION_VALUES_BYTES, FIRST_ACTIONS_OF, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { counting } from "../../../examples/counting/definition.ts";
import { COUNTING_DEFINITION } from "../../../examples/counting/pin.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam, settle } from "./repository.ts";
import { reader } from "./support.ts";
import { platformNet, platformOutside } from "./worker.ts";

const SERVICE = "https://scopes.test";

// One real native graph and real production membership/creation/replay. Git host,
// clock and read inspector are labelled stand-ins. The SQL trigger is an explicit
// retention-fault control; it writes no invented native entry or authority.
test("explicit supporting cohort establishes Counting with native authority and atomic retained provenance; unknown creation recovers once and Initialize requires an explicit domain grant", async () => {
  const prior = { hold: net.hold, deaf: net.deaf, clock: net.clock.now, secret: platformNet.secret, sessions: platformNet.sessions, inspector: platformNet.inspector };
  const install: Intent = { v: 1, to: null, actor: keys.paul.key, kind: "install", on: null, expected: {},
    fields: { host: "git.example", namespace: "application", policy: "keys", founders: [rita.key] },
    idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: APPLICATION_COHORT.register, creator: null, cause: intentDigest(install), ordinal: 0 }));
  let D: Platform | undefined, C: Platform | undefined;
  try {
    net.hold = net.deaf = null;
    const host = outsideOf(R.name);
    wired.set(R.name, () => ({ outside: host }));
    expect(await R.stub.found(signIntent(install, keys.paul.secret), APPLICATION_COHORT.register)).toMatchObject({ answer: "accepted" });
    const claim = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    const directorySeed: Seed = { v: 1, kind: "directory", definition: APPLICATION_COHORT.directory, creator: await R.at(), cause: intentDigest(claim.intent), ordinal: 0 };
    D = new Platform(scopeIdOf(directorySeed));
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(directorySeed), 1), id: "application-fixture" } } });
    expect(await R.stub.submit(claim, [])).toMatchObject({ answer: "accepted" });
    await (R.stub as unknown as { effect(): Promise<number> }).effect();
    await settle(R, D);
    const children = (await D.entries())[0]!.sends.map((send) => new Platform(scopeIdOf(send.to as Seed)));
    const [M, Q, G] = children as [Platform, Platform, Platform];
    await settle(R, D, M, Q, G);
    expect((await D.summary()).value.definition).toBe(APPLICATION_COHORT.directory);
    expect([(await M.summary()).value.definition, (await Q.summary()).value.definition, (await G.summary()).value.definition]).toEqual([APPLICATION_COHORT.membership, APPLICATION_COHORT.rules, APPLICATION_COHORT.destination]);
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const membership = await M.at();

    // Actual authenticated birth-session reads must select directory@5 even
    // though its destination@2 pin is also used by the legacy directory@2.
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    const issued = await requestSession(SERVICE, M.name, sessionRequest(membership, rita.secret, soon(60), crypto.randomUUID()), { fetch: routed as unknown as Fetch });
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error("the actual admin receives a read session");
    expect((await routed(`${SERVICE}/v1/scopes/${G.name}`, { headers: { authorization: issued.session.reader() } })).status).toBe(200);

    const secret = "native-member-invitation";
    const invitation = await M.did(rita, "invite-member", { fields: { handle: "@sam", role: "member", inviteHash: textDigest(secret), inviteEnds: soon(60) } });
    await M.did(sam, "join", { fields: { invitation, secret } });
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
    expect(await D.stub.submit(await ask(fields, sam), [], { values: [bytes] })).toMatchObject({ answer: "refused", reason: "unauthorized" });
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
    const counts = () => runInDurableObject(D!.object, (_instance, state) => state.storage.sql.exec("SELECT (SELECT COUNT(*) FROM entry) AS entries, (SELECT COUNT(*) FROM outbox) AS duties, (SELECT COUNT(*) FROM retained_input) AS inputs").one());
    const beforeFailure = await counts();
    await runInDurableObject(D.object, (_instance, state) => state.storage.sql.exec("CREATE TRIGGER application_retention_fault BEFORE INSERT ON retained_input WHEN NEW.kind = 'definition' BEGIN SELECT RAISE(ABORT, 'fixture retention fault'); END"));
    try { await expect(D.stub.submit(failed, [], { values: [bytes] })).rejects.toThrow(); }
    finally { await runInDurableObject(D.object, (_instance, state) => state.storage.sql.exec("DROP TRIGGER application_retention_fault")); }
    expect(await counts()).toEqual(beforeFailure);
    expect((await new Platform(scopeIdOf(failedSeed)).stub.summary(reader)).ok).toBe(false);

    const signed = await ask(fields);
    const childSeed: Seed = { v: 1, kind: "lane", definition: COUNTING_DEFINITION, creator: await D.at(), cause: intentDigest(signed.intent), ordinal: 0 };
    C = new Platform(scopeIdOf(childSeed));
    platformOutside.set(C.name, () => NO_OUTSIDE);
    net.hold = (envelope) => "definition" in envelope.to && envelope.to.definition === COUNTING_DEFINITION;
    const accepted = await D.stub.submit(signed, [], { values: [bytes] });
    expect(accepted.answer).toBe("accepted");
    if (accepted.answer !== "accepted") throw new Error("the authorized native application entry is recorded");
    const parent = (await D.entries())[accepted.receipt.fact.seq]!;
    expect(parent.sends).toHaveLength(1);
    expect(parent.sends[0]!.to).toEqual(childSeed);
    expect(parent.sends[0]!.message).toMatchObject({ class: "request", type: "create", body: { membership, directory: await D.at(), fields: { opener: { membership, member: "@rita" }, target: 7 } } });
    expect(await D.stub.retained(reader, "definition", COUNTING_DEFINITION)).toMatchObject({ ok: true, value: { bytes } });
    expect((await D.item(accepted.receipt.fact.seq)).state).toBe("creating");
    expect((await C.stub.summary(reader)).ok).toBe(false);
    await settle(D, C);
    await D.restart();
    expect(await D.stub.submit(signed, [], { values: [bytes] })).toEqual(accepted);
    expect((await D.stub.outbox(reader)).ok).toBe(true);
    net.hold = null;
    net.clock.now = soon(2);
    await settle(D, C);
    expect(await D.item(accepted.receipt.fact.seq)).toMatchObject({ state: "created", refs: { scope: await C.at() } });
    expect((await C.summary()).value).toMatchObject({ definition: COUNTING_DEFINITION, status: "active", items: [{ type: "configuration", state: "ready", values: { target: 7 }, parties: { controller: { membership, member: "@rita" } } }] });
    expect(await C.stub.retained(reader, "definition", COUNTING_DEFINITION)).toMatchObject({ ok: true, value: { bytes } });
    expect((await C.entries())[0]!.input).toMatchObject({ type: "genesis", seed: childSeed, source: accepted.receipt.fact });
    expect((await C.act(rita, "initialize", { expected: await C.expected({ configuration: 0 }) })).answer).toBe("refused");
    await M.did(rita, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role: "admin", actions: [...FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!.admin, "counting.control"] } });
    net.clock.now = soon(301); // The old grant reuse window must end; no immediate-revocation claim.
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
    const nested = await A.created(0);
    await settle(D, A, nested);
    expect((await A.entries())[0]!.input).toMatchObject({ type: "genesis", message: { body: { fields: { peer: { membership, member: "@sam" } } } } });
    for (const [digest, value] of [[containerDigest, containerBytes], [COUNTING_DEFINITION, bytes]] as const) {
      expect(await D.stub.retained(reader, "definition", digest)).toMatchObject({ ok: true, value: { bytes: value } });
      expect(await A.stub.retained(reader, "definition", digest)).toMatchObject({ ok: true, value: { bytes: value } });
    }
    const replay = await verify(httpSource(SERVICE, { fetch: routed }), { mode: "replay", platform, grants: "proven", scope: C.name, head: (await C.summary()).at });
    expect([replay.report.result, replay.why]).toEqual(["consistent", null]);
  } finally {
    net.hold = prior.hold; net.deaf = prior.deaf; net.clock.now = prior.clock;
    platformNet.secret = prior.secret; platformNet.sessions = prior.sessions; platformNet.inspector = prior.inspector;
    wired.delete(R.name);
    if (C) platformOutside.delete(C.name);
  }
});
