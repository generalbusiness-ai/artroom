import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, Entry, Observation, ObservationUse, Seed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, isSeed, scopeIdOf, seedDigest, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, TransportError, httpTransport, requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { keys, type Actor } from "@generalbusiness/artroom-derive/testing";
import { ROOM_NAME_COHORT, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { TRUSTS, httpSource, verify } from "@generalbusiness/artroom-replay";
import { command, memoryStore, type Context } from "../../cli/src/index.ts";
import { counting } from "../../../examples/counting/definition.ts";
import { COUNTING_DEFINITION } from "../../../examples/counting/pin.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { soon } from "./net.ts";
import { outsideOf } from "./outside.ts";
import { Platform, rita, routed } from "./repository.ts";
import { beginSessionFixture } from "./session-settings.ts";
import { dispatchFixture, effectFixture, nativeFixtureLifetime } from "./support/native-fixture-lifetime.ts";
import { reader } from "./support.ts";

const SERVICE = "https://scopes.test";
const proof = (entry: Entry): ObservationUse & { observation: Observation } => {
  if (entry.input.type !== "act" || !entry.input.authority[0]?.fresh) throw new Error("The native act must retain its actual grant proof.");
  return entry.input.authority[0].fresh as ObservationUse & { observation: Observation };
};

// Invariant: a shared name is one revisioned native profile, independent of
// repository identity, with production membership authority and original retry.
// Durable Objects, SQLite, HTTP, platform rules, enrollment and factory are real.
// OutsideDouble is a Git-host stand-in; clock, local memoryStore and inspector
// are test boundaries. The lost reply is an explicit transport fault. No native
// entry, grant, receipt, child genesis or replay anchor is written by the test.
// G3's pin is checked here; full manifest publication remains a lane witness.
test("shared names serialize first openings and frozen revisions, retain exact retries and native authority windows, and preserve the application factory and replay", async () => {
  const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
  const lifetime = nativeFixtureLifetime(owner, { required: false });
  const route = (url: string, init?: RequestInit) => lifetime.wait(() => routed(url, init));
  const fetch: Fetch = route;
  const settle = (...nodes: Platform[]) => dispatchFixture(nodes, lifetime.wait);
  const child = async (parent: Platform, seq: number, n = 0): Promise<Platform> => {
    const send = (await parent.entries())[seq]?.sends.find((candidate) => candidate.n === n);
    if (!send || send.message.class !== "request" || send.message.type !== "create" || !isSeed(send.to)) throw new Error("The native parent must supply the actual child seed.");
    return lifetime.platform(scopeIdOf(send.to));
  };
  try {
    const store = memoryStore();
    await lifetime.wait(() => store.keep("operator", rita.secret));
    const context: Context = { store, fetch, trustedFoundingService: { service: SERVICE, fetch }, now: () => lifetime.now() };
    const run = (...argv: string[]) => lifetime.wait(() => command(context, argv));
    const planned = await run("install", "--plan", SERVICE, "--cohort", "shared-name", "--host", "git.example", "--namespace", "shared-name");
    expect(planned.code, planned.lines.join("\n")).toBe(0);
    const plan = (await lifetime.wait(() => store.config()))?.plan;
    if (!plan) throw new Error("The explicit shared-name install must retain its original plan.");
    expect(plan.definition).toBe("platform:register@7");
    const R = lifetime.platform(plan.register), host = outsideOf(R.name);
    lifetime.wire(R.name, () => ({ outside: {
      accepts: () => { lifetime.active(); return host.accepts(); },
      send: (request) => lifetime.wait(() => host.send(request)),
      late: (deliver) => { lifetime.active(); host.late(deliver); },
    } }));
    const installed = await run("install", "--planned", "--cohort", "shared-name");
    expect(installed.code, installed.lines.join("\n")).toBe(0);
    expect((await lifetime.wait(() => store.config()))?.register).toEqual(await R.at());
    expect((await lifetime.wait(() => store.config()))?.plan?.founding).toEqual(plan.founding);
    const claim = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } });
    const seed: Seed = { v: 1, kind: "directory", definition: ROOM_NAME_COHORT.directory, creator: await R.at(), cause: intentDigest(claim.intent), ordinal: 0 };
    const D = lifetime.platform(scopeIdOf(seed));
    lifetime.active();
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: "shared-name-fixture" } } });
    expect(await R.stub.submit(claim, [])).toMatchObject({ answer: "accepted" });
    await effectFixture([R], lifetime.wait);
    await settle(R, D);
    const [M, Q, G] = await Promise.all([1, 2, 3].map((n) => child(D, 0, n)));
    if (!M || !Q || !G) throw new Error("The directory must create its complete native sibling cohort.");
    await settle(R, D, M, Q, G);
    expect(await Promise.all([R, D, M, Q, G].map(async (node) => (await node.summary()).value.definition))).toEqual([
      "platform:register@7", "platform:directory@7", "platform:membership@6", "platform:rules@3", "platform:destination@3",
    ]);
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const membership = await M.at(), inboxes = [await child(M, seat)];
    const memberSecret = "shared-name-person-invitation-of-at-least-32-bytes";
    const invitation = await M.did(rita, "invite-member", { fields: { handle: "@una", role: "member", inviteHash: textDigest(memberSecret), inviteEnds: soon(60) } });
    const unaKey = await M.did(keys.una, "join", { fields: { invitation, secret: memberSecret } });
    inboxes.push(await child(M, unaKey));
    for (const [who, handle, kind] of [[keys.vic, "@agent", "agent"], [keys.paul, "@checker", "checker"]] as const) {
      const fields = { handle, kind, ...(kind === "agent" ? { controller: { membership, member: "@una" } } : {}) };
      const member = await M.did(rita, "add-member", { fields });
      inboxes.push(await child(M, member));
      const secret = `shared-name-${kind}-invitation-of-at-least-32-bytes`;
      const invited = await M.did(rita, "invite-key", { fields: { member, kind, inviteHash: textDigest(secret), inviteEnds: soon(60) }, expected: await M.expected({ member }) });
      await M.did(who, "enrol", { on: 0, fields: { invitation: invited, secret }, expected: await M.expected({ on: 0, member }) });
    }
    await settle(M, ...inboxes);
    expect(await M.stub.observe({ of: membership, key: rita.key })).toMatchObject({ role: "admin", actions: expect.arrayContaining(["room.name", "site.name-publication"]) });
    const issued = await lifetime.wait(() => requestSession(SERVICE, M.name, sessionRequest(membership, rita.secret, soon(600), crypto.randomUUID()), { fetch }));
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error("The actual administrator must receive a native read session.");
    const handle = new ScopeHandle(httpTransport(SERVICE, { fetch }), D.name, issued.session.reader());
    const profile = async () => (await D.summary()).value.items.find((item) => item.type === "room-profile");
    const generated = (await D.item(0)).values["repository"];
    expect(generated).toEqual({ host: "git.example", namespace: "shared-name", name: repositoryName(seedDigest(seed), 1), id: "shared-name-fixture" });
    const repository = canonicalize(generated);
    expect(await profile()).toBeUndefined();
    expect(await handle.summary()).toMatchObject({ ok: true, value: { definition: ROOM_NAME_COHORT.directory } });
    const firstNames = await Promise.all(["Café", "Studio B"].map((name) => D.intent(rita, "name-room", { fields: { name } })));
    const openings = await Promise.all(firstNames.map((signed) => handle.submit(signed)));
    expect(openings.map((answer) => answer.answer).sort()).toEqual(["accepted", "refused"]);
    expect(openings.find((answer) => answer.answer === "refused")).toMatchObject({ reason: "guard-failed", name: "profile-exists" });
    const opened = await profile();
    if (!opened) throw new Error("One native opening must create exactly one room profile.");
    const captured = { on: opened.id, expected: { on: opened.revision } };
    lifetime.advance(1);
    const transitions = await Promise.all(["One frozen revision", "Competing revision"].map((name) => D.intent(rita, "set-room-name", { ...captured, fields: { name } })));
    const changed = await Promise.all(transitions.map((signed) => handle.submit(signed)));
    expect(changed.map((answer) => answer.answer).sort()).toEqual(["accepted", "refused"]);
    expect(changed.find((answer) => answer.answer === "refused")).toMatchObject({ reason: "revision-moved" });
    const rename = async (who: Actor, name: string) => {
      lifetime.advance(1);
      const current = await profile();
      if (!current) throw new Error("A transition must target the native profile.");
      return handle.submit(await D.intent(who, "set-room-name", { on: current.id, expected: { on: current.revision }, fields: { name } }));
    };
    const boundary = "é".repeat(128);
    expect(await rename(rita, boundary)).toMatchObject({ answer: "accepted" });
    const beforeInvalid = (await D.summary()).at;
    expect(await rename(rita, `${boundary}a`)).toMatchObject({ answer: "refused", reason: "bad-field" });
    expect(await rename(rita, "Studio\nB")).toMatchObject({ answer: "refused", reason: "bad-field" });
    expect((await D.summary()).at).toEqual(beforeInvalid);
    expect((await profile())?.values["displayName"]).toBe(boundary);

    // The server accepts, but this caller loses the response. Retry uses only
    // its exact original envelope/revision; native idempotency adds no entry.
    lifetime.advance(1);
    const current = await profile();
    if (!current) throw new Error("The original rename needs its captured native profile.");
    const original = await D.intent(rita, "set-room-name", { on: current.id, expected: { on: current.revision }, fields: { name: "Original request after reply loss" } });
    let lostAnswer: Answer | undefined;
    const loseReply: Fetch = async (url, init) => {
      const response = await route(url, init);
      lostAnswer = await lifetime.wait(() => response.json()) as Answer;
      expect(lostAnswer).toMatchObject({ answer: "accepted" });
      throw new Error("Fixture lost the native accepted reply.");
    };
    await expect(new ScopeHandle(httpTransport(SERVICE, { fetch: loseReply }), D.name).submit(original)).rejects.toThrow(TransportError);
    const afterLostReply = (await D.summary()).at;
    const recovered = await handle.submit(original);
    expect(recovered).toEqual(lostAnswer);
    expect((await D.summary()).at).toEqual(afterLostReply);
    if (recovered.answer !== "accepted") throw new Error("The exact native retry must recover its accepted receipt.");
    const followed = await handle.followReceipt(recovered.receipt);
    expect(followed.ok).toBe(true);
    if (!followed.ok || followed.entry.input.type !== "act") throw new Error("The original receipt must identify the retained native act.");
    expect(followed.entry.input.signed).toEqual(original);
    expect(await rename(rita, "")).toMatchObject({ answer: "accepted" });
    await D.restart();
    expect((await profile())?.values["displayName"]).toBe("");
    const records = await lifetime.wait(() => runInDurableObject(D.object, (_instance, state) => state.storage.sql.exec("SELECT record FROM item WHERE type = 'room-profile'").toArray()));
    expect(records).toHaveLength(1);
    expect(JSON.parse(String(records[0]!["record"]))).toEqual(await profile());
    expect(await new ScopeHandle(httpTransport(SERVICE, { fetch }), D.name, "invalid-reader").summary()).toMatchObject({ ok: false, reason: "forbidden" });
    expect((await profile())?.values["displayName"]).toBe("");
    expect(canonicalize((await D.item(0)).values["repository"])).toBe(repository);

    for (const who of [keys.una, keys.vic, keys.paul]) expect(await rename(who, "No default authority")).toMatchObject({ answer: "refused", reason: "unauthorized" });
    for (const role of ["agent", "checker"] as const) await M.did(rita, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role, actions: ["room.name"] } });
    await D.restart(); // Drop the run-local observations, then read deliberate delegation.
    expect(await rename(keys.vic, "Delegated agent")).toMatchObject({ answer: "accepted" });
    const agentProof = proof(await D.last());
    expect(agentProof).toMatchObject({ use: "fresh", observation: { key: keys.vic.key, role: "agent", controller: "@una", controllerActive: true, definition: ROOM_NAME_COHORT.membership } });
    expect(await rename(keys.paul, "Delegated checker")).toMatchObject({ answer: "accepted" });
    expect(proof(await D.last())).toMatchObject({ observation: { key: keys.paul.key, role: "checker", controller: null, controllerActive: null } });
    const retired = await M.did(rita, "revoke-key", { on: unaKey, expected: await M.expected({ on: unaKey, roster: 0, member: invitation }), fields: { as: "retired" } });
    lifetime.advance(10_000);
    expect(await rename(keys.vic, "Cached controller within window")).toMatchObject({ answer: "accepted" });
    expect(proof(await D.last())).toMatchObject({ use: "reused", observation: agentProof.observation });
    lifetime.advance(300_000 - (lifetime.now() - timeMs(agentProof.observation.at)!));
    expect(await rename(keys.vic, "Controller no longer qualifies")).toMatchObject({ answer: "refused", reason: "unauthorized" });
    expect(await M.stub.observe({ of: membership, key: keys.vic.key })).toMatchObject({ controller: "@una", controllerActive: false, head: { seq: retired } });
    await D.restart();
    expect(await rename(keys.vic, "Restart still requires controller")).toMatchObject({ answer: "refused", reason: "unauthorized" });
    expect(await rename(keys.paul, "Checker remains delegated")).toMatchObject({ answer: "accepted" });
    expect(proof(await D.last()).observation.head.seq).toBeGreaterThanOrEqual(retired);

    // Exercise the inherited F1 factory through actual retained definition
    // bytes and native create/result/confirmation, after the name changed.
    const bytes = canonicalize(counting);
    expect(await Q.stub.submit(await Q.intent(rita, "activate", { fields: { digest: COUNTING_DEFINITION, name: counting.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    const application = await D.intent(rita, "establish-application", { expected: await D.expected({ repository: 0 }), fields: { definition: COUNTING_DEFINITION, values: '{"target":7}', execution: "recorded-do" } });
    const established = await D.stub.submit(application, [], { values: [bytes] });
    expect(established.answer).toBe("accepted");
    if (established.answer !== "accepted") throw new Error("The named directory must preserve native application establishment.");
    const C = await child(D, established.receipt.fact.seq);
    lifetime.wire(C.name, () => NO_OUTSIDE);
    await settle(D, C);
    expect(await D.item(established.receipt.fact.seq)).toMatchObject({ state: "created", refs: { scope: await C.at() } });
    expect((await C.summary()).value).toMatchObject({ definition: COUNTING_DEFINITION, status: "active", items: [{ type: "configuration", values: { target: 7 }, parties: { controller: { membership, member: "@rita" } } }] });
    expect((await C.entries())[0]!.input).toMatchObject({ type: "genesis", source: established.receipt.fact, message: { body: { creationContext: { v: 1 }, membership } } });
    expect(canonicalize((await D.item(0)).values["repository"])).toBe(repository);
    const head = (await D.summary()).at;
    const replay = await lifetime.wait(() => verify(httpSource(SERVICE, { fetch, reader: issued.session.reader() }), { mode: "replay", platform, grants: "proven", scope: D.name, head }));
    expect([replay.report.result, replay.why, replay.report.target]).toEqual(["consistent", null, { at: await D.at(), ...head }]);
    expect(replay.report.coverage).toContainEqual({ scope: await D.at(), from: 0, through: head.seq });
    expect([replay.report.dependencies.anchored, replay.report.dependencies.missing, replay.report.anchors]).toEqual([0, [], []]);
    expect(replay.report.dependencies.verified).toBeGreaterThan(0);
    expect(replay.report.trusts).not.toContain(TRUSTS.authority);
  } finally { lifetime.release(); }
});
