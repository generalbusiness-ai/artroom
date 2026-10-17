/** Native Page Start through production HTTP/Register@8/directory@7/enrollment, plus exact retained Register@7 offer.
 * STAND-INs: OwnGit/provider, scripted clock, bounded dispatcher scheduler,
 * private storage/Web Locks, accepted-reply loss and native Response URL metadata.
 * No installer key is passed to Page. No browser/provider/deployment runs here. */
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import type { Seed, SignedIntent, ScopeId } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, unb64url } from "@generalbusiness/artroom-bytes";
import { agentKeyInvitationOf, creationOffer, secretSigner, signedIntent, type Fetch, type CreationOfferFetch } from "@generalbusiness/artroom-client";
import { DEMO_REGISTER, WEB_DEMO_REGISTER, WEB_DEMO_COHORT, DEMO_PURPOSE } from "@generalbusiness/dap-platform";
import worker from "../../worker.ts";
import { beginSessionFixture } from "../../../../packages/scope/test/session-settings.ts";
import { nativeFixtureLifetime, driveFixture } from "../../../../packages/scope/test/support/native-fixture-lifetime.ts";
import { TEST_DEPLOYMENT } from "../../../../packages/scope/test/worker.ts";
import { reader } from "../../../../packages/scope/test/support.ts";
import { ownHost } from "../../../../packages/scope/test/hosts.ts";
import { originalStart, startRoom } from "../src/start-custody.ts";
import { connectInvitation, creatorConnectionFiles, originalConnection, saveCreatorRecoveryOnce } from "../src/connection-custody.ts";
import { command, enrolAgentKey, linkOf, memoryStore, type Config, type Context } from "@generalbusiness/dap-cli";
import { openRoom } from "../src/data.ts";
import type { ClaimLocks, ClaimStorage } from "../src/claim.ts";

// The same named FIFO lock stand-in used by the existing native claim journey.
function locksOf(): ClaimLocks {
  const queues = new Map<string, Promise<unknown>>();
  return { request: async (name, run) => {
    const prior = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    queues.set(name, prior.then(() => held));
    await prior;
    try { return await run(); } finally { release(); }
  } };
}

test("fresh Page Start discovers native web register@8 and exact retained legacy7, retains before dispatch, Checks a lost accepted reply without mutation and explicitly Continues the original through enrolled room recovery (host, scheduler, storage and loss STAND-INs)", async () => {
  const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
  const lifetime = nativeFixtureLifetime(owner);
  let recovered: Uint8Array | undefined;
  try {
    const origin = "https://artroom-rehearsal.inguz.workers.dev";
    const host = ownHost();
    // Installer is solely native register setup; Start generates another key.
    const installer = secretSigner(crypto.getRandomValues(new Uint8Array(32)));
    const install = await signedIntent(installer, { to: null, kind: "install", fields: { host: host.host, namespace: host.namespace, policy: "open", purpose: DEMO_PURPOSE } }, { now: lifetime.now() });
    const seed: Seed = { v: 1, kind: "register", definition: WEB_DEMO_REGISTER, creator: null, cause: intentDigest(install.intent), ordinal: 0 };
    const R = lifetime.platform(scopeIdOf(seed));
    expect((await lifetime.wait(() => R.stub.create(install, WEB_DEMO_REGISTER))).answer).toBe("accepted");
    const register = await lifetime.wait(() => R.at());
    const wire = (name: ScopeId) => lifetime.outside(name, (given, sql) => host.outside(given, sql, host.bindings(R.name)));
    wire(R.name);
    await lifetime.wait(() => R.restart());
    lifetime.setHold(envelope => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; });
    // A separate real legacy root models a previously configured register7.
    // It is selected only by its exact retained scope+inc, never by a fresh GET.
    const legacyInstall = await signedIntent(installer, { to: null, kind: "install", fields: { host: host.host, namespace: host.namespace, policy: "open", purpose: DEMO_PURPOSE } }, { now: lifetime.now() });
    const legacySeed: Seed = { v: 1, kind: "register", definition: DEMO_REGISTER, creator: null, cause: intentDigest(legacyInstall.intent), ordinal: 0 };
    const L = lifetime.platform(scopeIdOf(legacySeed));
    expect((await lifetime.wait(() => L.stub.create(legacyInstall, DEMO_REGISTER))).answer).toBe("accepted");
    const legacyRegister = await lifetime.wait(() => L.at());
    const bindings = { SCOPES: env.PLATFORM, DEPLOYMENT: TEST_DEPLOYMENT, DEMO_START_CONFIG: canonicalize({ v: 2, origin, deployment: TEST_DEPLOYMENT, register, definition: WEB_DEMO_REGISTER, legacy: { register: legacyRegister, definition: DEMO_REGISTER } }) };
    const native: Fetch = (url, init) => lifetime.wait(() => worker.fetch(new Request(url, init), bindings));
    const anonymous = await native(`${origin}/v1/scopes/${register.scope}`);
    expect(anonymous.status).toBe(403);
    await anonymous.body?.getReader().cancel();
    let offerStatus: number | null = null, offerTransportError: string | null = null;
    const offerFetch: CreationOfferFetch = async (url, init) => {
      let response: Awaited<ReturnType<Fetch>>;
      // workerd Request accepts only follow/manual; the SDK requests browser
      // redirect:error. Direct Worker.fetch has no network redirect to follow.
      // Manual preserves no-follow; SDK still checks exact URL/status/bounds.
      expect(init.redirect).toBe("error");
      const noFollow = { ...init, redirect: "manual" as const };
      try { response = await native(url, noFollow); }
      catch (error) { offerTransportError = error instanceof Error ? error.name : "non-error"; throw error; }
      offerStatus = response.status;
      // In-process Worker responses have no network URL; only this metadata is
      // adapted. Real response status/body and native policy are unchanged.
      return { status: response.status, url, redirected: false, body: response.body };
    };
    let offer: Awaited<ReturnType<typeof creationOffer>> | undefined;
    let offerFailed = false;
    try { offer = await lifetime.wait(() => creationOffer(origin, { fetch: offerFetch })); }
    catch { offerFailed = true; }
    expect([offerStatus, offerTransportError], "native offer HTTP response before codec acceptance").toEqual([200, null]);
    expect(offerFailed, "bounded SDK acceptance of the actual native offer").toBe(false);
    if (!offer) throw new Error("The actual native offer was not decoded.");
    expect([offer.definition, offer.register, offer.at.seq, offer.registerItem.revision, offer.registerItem.purpose]).toEqual([WEB_DEMO_REGISTER, register, 0, 1, DEMO_PURPOSE]);
    const retainedOffer = await lifetime.wait(() => creationOffer(origin, { fetch: offerFetch, register: legacyRegister }));
    expect([retainedOffer.definition, retainedOffer.register]).toEqual([DEMO_REGISTER, legacyRegister]);
    const unrelatedInc = newIncarnation(new Uint8Array(16).fill(1));
    const unseenLegacy = { ...legacyRegister, inc: unrelatedInc !== legacyRegister.inc ? unrelatedInc : newIncarnation(new Uint8Array(16).fill(2)) };
    await expect(lifetime.wait(() => creationOffer(origin, { fetch: offerFetch, register: unseenLegacy }))).rejects.toThrow();
    const values = new Map<string, string>(), readbacks = new Map<string, string>();
    const storage: ClaimStorage = { setItem: (key, bytes) => { lifetime.active(); values.set(key, bytes); }, getItem: key => { const bytes = values.get(key) ?? null; if (bytes !== null) readbacks.set(key, bytes); return bytes; } };
    const sent: SignedIntent[] = [], mutationPaths: string[] = [];
    let lose = true, checkMode = false;
    const fetch: Fetch = async (url, init) => {
      lifetime.active();
      const pathname = new URL(url).pathname;
      if (init?.method === "POST" && (pathname.endsWith("/acts") || pathname.endsWith("/preparations") || pathname === "/v1/scopes")) mutationPaths.push(pathname);
      const signed = new URL(url).pathname.endsWith("/acts") && typeof init?.body === "string" ? (JSON.parse(init.body) as { signed?: SignedIntent }).signed : undefined;
      if (signed) {
        const descriptorKey = `artroom-page-start:${origin}`, descriptorBytes = values.get(descriptorKey)!;
        const descriptor = JSON.parse(descriptorBytes) as { secret: string; operation: string };
        const creator = unb64url(descriptor.secret)!;
        try { expect([creator.length, keyIdOfSecret(creator) === installer.key, signed.intent.actor === keyIdOfSecret(creator)]).toEqual([32, false, true]); } finally { creator.fill(0); }
        const journalKey = [...values.keys()].find(key => key.startsWith("artroom-page-claim:"))!;
        const journalBytes = values.get(journalKey)!, journal = JSON.parse(journalBytes);
        const kept = JSON.parse(journal.claims[descriptor.operation]);
        expect([journal.active === descriptor.operation, readbacks.get(descriptorKey) === descriptorBytes, readbacks.get(journalKey) === journalBytes]).toEqual([true, true, true]);
        if (signed.intent.kind === "found") {
          expect(signed.intent.fields["recoveryKey"]).not.toBe(installer.key);
          expect(signed.intent.fields["recoveryKey"]).not.toBe(signed.intent.actor);
        }
        const stage = signed.intent.kind === "found" ? kept.config.claim["found"] : signed.intent.kind === "seat" ? kept.config.claim.seat : kept.config.claim.firstKey;
        expect(canonicalize(stage.signed) === canonicalize(signed)).toBe(true);
        sent.push(structuredClone(signed));
      }
      const response = await native(url, init);
      if (checkMode && new URL(url).pathname.endsWith("/settle")) {
        // Native settlement ran; its answer is lost at the scripted HTTP boundary.
        await response.body?.getReader().cancel();
        throw new Error("STAND-IN lost read-only settlement reply");
      }
      if (signed?.intent.kind === "found" && lose) {
        lose = false;
        expect(response.status).toBe(200);
        await response.body?.getReader().cancel();
        throw new Error("STAND-IN lost original accepted found reply");
      }
      return response;
    };
    const pause = async (waiting: readonly ScopeId[] = []) => driveFixture([R, ...waiting.filter(name => name !== R.name).map(name => lifetime.platform(name))], lifetime.wait);
    const locks = locksOf();
    const fresh = await lifetime.wait(() => startRoom(origin, storage, { mode: "new", label: "My new room", offer, creationOffer: async register => creationOffer(origin, { fetch: offerFetch, register }), fetch, now: lifetime.now, pause, tries: 16, locks }));
    expect([fresh.pending, fresh.repository, sent.map(s => s.intent.kind)]).toEqual([true, null, ["found"]]);
    const original = sent[0]!, status = originalStart(origin, storage)!;
    expect([status.key === original.intent.actor, status.operation === fresh.operation, status.label]).toEqual([true, true, "My new room"]);
    const before = canonicalize([...values]);
    let checkPauses = 0, checkOfferReads = 0;
    const reload: ClaimStorage = { getItem: storage.getItem, setItem: storage.setItem };
    checkMode = true;
    const checked = await lifetime.wait(() => startRoom(origin, reload, { mode: "check", fetch, now: lifetime.now, locks, pause: async () => { checkPauses++; }, creationOffer: async () => { checkOfferReads++; throw new Error("Check must not discover another offer"); } }));
    expect([checked.pending, checked.repository, sent.length, mutationPaths.length, checkPauses, checkOfferReads, checked.operation]).toEqual([true, null, 1, 1, 0, 0, fresh.operation]);
    checkMode = false;
    expect(originalStart(origin, storage)!.key).toBe(status.key);
    expect(canonicalize([...values]) === before).toBe(true); // Unconfirmed Check preserves the exact private checkpoint.
    const completed = await lifetime.wait(() => startRoom(origin, reload, { mode: "continue", label: "Ignored replacement label", fetch, now: lifetime.now, locks, pause, tries: 16, creationOffer: async () => { throw new Error("Continue must not rediscover"); } }));
    expect([completed.outcome.code, completed.pending, completed.operation, completed.label, completed.key]).toEqual([0, false, fresh.operation, "My new room", status.key]);
    expect(completed.repository).not.toBeNull();
    expect(sent.map(s => s.intent.kind)).toEqual(["found", "found", "seat", "first-key"]);
    expect(sent.filter(s => s.intent.kind === "found")).toEqual([original, original]);
    const descriptor = JSON.parse(values.get(`artroom-page-start:${origin}`)!) as { secret: string; operation: string };
    const journal = JSON.parse(values.get([...values.keys()].find(key => key.startsWith("artroom-page-claim:"))!)!);
    const kept = JSON.parse(journal.claims[descriptor.operation]);
    expect(canonicalize(kept.completed["found"].signed) === canonicalize(original)).toBe(true);
    expect([kept.completed["found"].signed.intent.idempotencyKey, kept.completed["found"].signed.intent.notAfter]).toEqual([original.intent.idempotencyKey, original.intent.notAfter]);
    const O = lifetime.platform(completed.repository!.directory.scope), M = lifetime.platform(completed.repository!.membership.scope);
    expect((await lifetime.wait(() => O.summary())).value.definition).toBe(WEB_DEMO_COHORT.directory);
    const Q = lifetime.platform(completed.repository!.rules);
    const bornRules = (await lifetime.wait(() => Q.summary())).value;
    expect(bornRules.definition).toBe(WEB_DEMO_COHORT.rules);
    expect(bornRules.items.find(item => item.type === "rules")?.values["ownerMayReview"]).toBe(true);
    expect(bornRules.items.find(item => item.type === "rules")?.values["approvals"]).toBe(1);
    expect((await lifetime.wait(() => R.entries())).filter(e => e.input.type === "act" && e.input.signed.intent.kind === "found")).toHaveLength(1);
    expect((await lifetime.wait(() => M.entries())).filter(e => e.input.type === "act" && e.input.signed.intent.kind === "seat")).toHaveLength(1);
    expect((await lifetime.wait(() => M.entries())).filter(e => e.input.type === "act" && e.input.signed.intent.kind === "first-key")).toHaveLength(1);
    recovered = completed.secret;
    expect(recovered?.length).toBe(32);
    const room = await lifetime.wait(() => openRoom({ service: origin, secret: recovered!, fetch, now: lifetime.now }, { directory: O.name, membership: completed.repository!.membership }));
    expect([room.directory, room.membership, room.key, room.me?.handle, room.reader !== null]).toEqual([O.name, completed.repository!.membership, status.key, "@founder", true]);
    expect(originalStart(origin, reload)?.state).toBe("complete");
    // The SAME native room now exercises every ready connection. No installer
    // key or inspector credential is supplied to Page/CLI callers.
    const binding = { key: status.key, operation: fresh.operation, membership: completed.repository!.membership };
    const ready = { fetch: native, now: lifetime.now, locks, pause, tries: 16 };
    const files = await lifetime.wait(() => creatorConnectionFiles(origin, reload, binding, ready));
    const exportedConfig = JSON.parse(files.config) as Config, exportedSeed = unb64url(files.key.trim())!;
    try {
      expect([exportedConfig.key, keyIdOfSecret(exportedSeed) === status.key, keyIdOfSecret(exportedSeed) === installer.key]).toEqual(["device", true, false]);
      const cliCreator = memoryStore(); await cliCreator.keep("device", exportedSeed); await cliCreator.save(exportedConfig);
      expect((await lifetime.wait(() => command({ store: cliCreator, fetch: native, now: lifetime.now }, ["acts", "membership"]))).code).toBe(0);
    } finally { exportedSeed.fill(0); }
    const savedRecovery = await lifetime.wait(() => saveCreatorRecoveryOnce(origin, reload, binding, ready));
    expect(savedRecovery.trim() === files.key.trim()).toBe(true); // Native creator backup, not the internal CLI recovery key.
    await expect(lifetime.wait(() => saveCreatorRecoveryOnce(origin, reload, binding, ready))).rejects.toThrow("already offered");
    const creatorSent: SignedIntent[] = [], creatorMutationPaths: string[] = [], creatorReplies: { kind: string; answer: string; reason: string | null; name: string | null }[] = [];
    let creatorSessions = 0;
    let loseCreator: "add-member" | "invite-key" | null = "add-member", creatorCheck = false;
    const creatorFetch: Fetch = async (url, init) => {
      const path = new URL(url).pathname;
      if (init?.method === "POST" && (path.endsWith("/acts") || path.endsWith("/preparations") || path === "/v1/scopes")) creatorMutationPaths.push(path);
      const signed = typeof init?.body === "string" ? (JSON.parse(init.body) as { signed?: SignedIntent }).signed : undefined;
      if (path.endsWith("/acts") && signed) {
        const name = [...values.keys()].find(key => key.startsWith("artroom-page-connections:"))!, bytes = values.get(name)!;
        const journal = JSON.parse(bytes), row = journal.rows[journal.active], pointer = row.config.invitationIssue;
        const kept = JSON.parse(row.private[pointer.request]);
        const stage = signed.intent.kind === "add-member" ? kept.member : kept.invitation;
        expect([readbacks.get(name) === bytes, pointer.actor === status.key, stage.attempted, canonicalize(stage.signed) === canonicalize(signed), signed.intent.actor === status.key]).toEqual([true, true, true, true, true]);
        creatorSent.push(structuredClone(signed));
      }
      if (path.endsWith("/sessions")) creatorSessions++;
      // This is the same native producer, kept as its actual Response type so
      // a closed reply-category projection can inspect a clone, never a payload.
      const response = await lifetime.wait(() => worker.fetch(new Request(url, init), bindings));
      let category: string | undefined;
      if (path.endsWith("/acts") && signed) {
        const reply = await response.clone().json() as { answer?: unknown; reason?: unknown; name?: unknown };
        category = typeof reply.answer === "string" && ["accepted", "refused", "unavailable", "mismatch", "due"].includes(reply.answer) ? reply.answer : "invalid";
        const safe = (value: unknown) => typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value) ? value : null;
        creatorReplies.push({ kind: signed.intent.kind, answer: category, reason: safe(reply.reason), name: safe(reply.name) });
      }
      // Loss is only an actually accepted reply. Other native judgments return
      // unchanged to the shared helper and remain visible in the closed tuple.
      if (path.endsWith("/acts") && signed?.intent.kind === loseCreator && category === "accepted") { loseCreator = null; await response.body?.getReader().cancel(); throw new Error("STAND-IN lost accepted connection reply"); }
      if (creatorCheck && path.endsWith("/settle") && signed && ["add-member", "invite-key"].includes(signed.intent.kind)) { await response.body?.getReader().cancel(); throw new Error("STAND-IN lost original connection settlement reply"); }
      return response;
    };
    const input = { kind: "agent-key" as const, handle: "@native-agent", hours: 24 };
    const begun = await lifetime.wait(() => connectInvitation(origin, reload, binding, input, { ...ready, fetch: creatorFetch, mode: "new" }));
    expect([begun.state, begun.link === undefined, creatorSent.map(s => s.intent.kind)]).toEqual(["unknown", true, ["add-member"]]);
    const opening = creatorSent[0]!;
    let connectionPauses = 0;
    const beforeConnectionCheck = creatorMutationPaths.slice();
    creatorCheck = true;
    const checkedConnection = await lifetime.wait(() => connectInvitation(origin, reload, binding, input, { ...ready, fetch: creatorFetch, mode: "check", pause: async () => { connectionPauses++; } }));
    expect([checkedConnection.state, creatorSent.length, connectionPauses, checkedConnection.operation]).toEqual(["unknown", 1, 0, begun.operation]);
    expect(creatorMutationPaths).toEqual(beforeConnectionCheck);
    creatorCheck = false; loseCreator = "invite-key";
    const next = await lifetime.wait(() => connectInvitation(origin, reload, binding, input, { ...ready, fetch: creatorFetch, mode: "continue" }));
    expect([next.state, creatorSent.map(s => s.intent.kind)]).toEqual(["unknown", ["add-member", "add-member", "invite-key"]]);
    expect(canonicalize(creatorSent[1]) === canonicalize(opening)).toBe(true);
    const invitationEnvelope = creatorSent[2]!;
    // The bounded existing dispatcher drives only recorded creation/confirmation.
    const openingEntry = (await lifetime.wait(() => M.entries())).find(entry => entry.input.type === "act" && entry.input.signed.intent.idempotencyKey === opening.intent.idempotencyKey)!;
    const agentInbox = await lifetime.wait(() => M.created(openingEntry.seq));
    await pause([M.name, agentInbox.name, O.name]);
    creatorCheck = true;
    const beforeKeyCheck = creatorSent.length;
    const beforeKeyMutationPaths = creatorMutationPaths.slice();
    const keyChecked = await lifetime.wait(() => connectInvitation(origin, reload, binding, input, { ...ready, fetch: creatorFetch, mode: "check", pause: async () => { connectionPauses++; } }));
    expect([keyChecked.state, creatorSent.length, connectionPauses]).toEqual(["unknown", beforeKeyCheck, 0]);
    expect(creatorMutationPaths).toEqual(beforeKeyMutationPaths);
    creatorCheck = false;
    const issued = await lifetime.wait(() => connectInvitation(origin, reload, binding, input, { ...ready, fetch: creatorFetch, mode: "continue" }));
    expect([issued.state, issued.reason ?? null, issued.operation === begun.operation, originalConnection(origin, reload, binding)?.kind, creatorReplies, creatorSessions < 64]).toEqual(["verified", null, true, "agent-key", ["add-member", "add-member", "invite-key", "invite-key"].map(kind => ({ kind, answer: "accepted", reason: null, name: null })), true]);
    expect(creatorSent.filter(s => s.intent.kind === "invite-key").every(s => canonicalize(s) === canonicalize(invitationEnvelope))).toBe(true);
    const agentLink = issued.link!, tagged = agentKeyInvitationOf(agentLink)!;
    expect([tagged.controller.member, canonicalize(tagged.controller.membership) === canonicalize(binding.membership), linkOf(agentLink)]).toEqual(["@founder", true, null]);
    const receiver = memoryStore(), agentSent: SignedIntent[] = [], agentMutationPaths: string[] = [];
    let loseAgent = true, agentCheck = false, crossRoomReads = 0, ownSessionRequests = 0;
    const agentFetch: Fetch = async (url, init) => {
      const path = new URL(url).pathname;
      if (init?.method === "POST" && (path.endsWith("/acts") || path.endsWith("/preparations") || path === "/v1/scopes")) agentMutationPaths.push(path);
      const signed = path.endsWith("/acts") && typeof init?.body === "string" ? (JSON.parse(init.body) as { signed: SignedIntent }).signed : undefined;
      if (signed) {
        const config = (await receiver.config())!, raw = await receiver.private(config.join!.request);
        const capsule = JSON.parse(new TextDecoder().decode(raw!));
        expect([config.join!.kind, canonicalize(capsule.signed) === canonicalize(signed), signed.intent.actor === status.key, signed.intent.actor === installer.key]).toEqual(["enrol", true, false, false]);
        agentSent.push(structuredClone(signed));
      }
      if (path.endsWith("/sessions")) ownSessionRequests++;
      if (url.includes(O.name) || url.includes(agentInbox.name)) { expect(init?.headers?.["authorization"]?.startsWith("Session ")).toBe(true); crossRoomReads++; }
      const response = await native(url, init);
      if (signed && loseAgent) { loseAgent = false; await response.body?.getReader().cancel(); throw new Error("STAND-IN lost accepted independent agent enrollment reply"); }
      if (agentCheck && path.endsWith("/settle")) { await response.body?.getReader().cancel(); throw new Error("STAND-IN lost original agent settlement reply"); }
      return response;
    };
    const agentContext: Context = { store: receiver, fetch: agentFetch, now: lifetime.now };
    expect((await lifetime.wait(() => command(agentContext, ["join", agentLink]))).code).toBe(1);
    const agentOriginal = agentSent[0]!, beforeAgentCheck = agentSent.length;
    const beforeAgentMutationPaths = agentMutationPaths.slice();
    agentCheck = true;
    expect((await lifetime.wait(() => command(agentContext, ["join", agentLink, "--check"]))).code).toBe(1);
    expect(agentSent.length).toBe(beforeAgentCheck); agentCheck = false;
    expect(agentMutationPaths).toEqual(beforeAgentMutationPaths);
    expect((await lifetime.wait(() => enrolAgentKey(agentContext, agentLink))).code).toBe(0);
    expect(canonicalize(agentSent[1]) === canonicalize(agentOriginal)).toBe(true);
    expect((await lifetime.wait(() => M.entries())).filter(entry => entry.input.type === "act" && entry.input.signed.intent.kind === "enrol")).toHaveLength(1);
    const agentConfig = (await receiver.config())!, agentSeed = (await receiver.secret(agentConfig.key))!.slice();
    try {
      const agentRoom = await lifetime.wait(() => openRoom({ service: origin, secret: agentSeed, fetch: agentFetch, now: lifetime.now }, { directory: agentConfig.repository!.directory.scope, membership: agentConfig.repository!.membership }));
      expect([agentRoom.me?.handle, agentRoom.me?.role, agentRoom.reader !== null, agentConfig.repository?.inbox === agentInbox.name, ownSessionRequests > 0, crossRoomReads > 0]).toEqual(["@native-agent", "agent", true, true, true, true]);
      const member = (await lifetime.wait(() => M.summary())).value.items.find(item => item.type === "member" && item.values["handle"] === "@native-agent")!;
      expect([member.values["kind"], member.values["role"], canonicalize(member.parties["controller"]) === canonicalize(tagged.controller)]).toEqual(["agent", "agent", true]);
      expect((await lifetime.wait(() => M.summary())).value.items.some(item => item.type === "key" && item.state === "active" && item.values["kind"] === "agent" && item.values["id"] === keyIdOfSecret(agentSeed) && item.refs["member"] === member.id)).toBe(true);
    } finally { agentSeed.fill(0); }
    const person = await lifetime.wait(() => connectInvitation(origin, reload, binding, { kind: "person", handle: "@native-person", role: "member", hours: 24 }, { ...ready, fetch: creatorFetch, mode: "new" }));
    expect([person.state, linkOf(person.link!)?.definition, agentKeyInvitationOf(person.link!)]).toEqual(["verified", "platform:membership@2", null]);
    const personStore = memoryStore();
    expect((await lifetime.wait(() => command({ store: personStore, fetch: native, now: lifetime.now, pause, tries: 16 }, ["join", person.link!]))).code).toBe(0);
    expect((await personStore.config())?.handle).toBe("@native-person");
    expect((await lifetime.wait(() => M.summary())).value.items.find(item => item.type === "member" && item.values["handle"] === "@native-person")?.values["kind"]).toBe("person");

  } finally { recovered?.fill(0); lifetime.release(); }
});
