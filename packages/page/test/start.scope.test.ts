/** Native Page Start through production HTTP/Register@7/directory@3/enrollment.
 * STAND-INs: OwnGit/provider, scripted clock, bounded dispatcher scheduler,
 * private storage/Web Locks, accepted-reply loss and native Response URL metadata.
 * No installer key is passed to Page. No browser/provider/deployment runs here. */
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import type { Seed, SignedIntent, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, keyIdOfSecret, scopeIdOf, unb64url } from "@generalbusiness/artroom-bytes";
import { foundingOffer, secretSigner, signedIntent, type Fetch, type FoundingOfferFetch } from "@generalbusiness/artroom-client";
import { DEMO_REGISTER, DEMO_PURPOSE } from "@generalbusiness/artroom-platform";
import worker from "../../scope/src/worker.ts";
import { beginSessionFixture } from "../../scope/test/session-settings.ts";
import { nativeFixtureLifetime, driveFixture } from "../../scope/test/support/native-fixture-lifetime.ts";
import { TEST_DEPLOYMENT } from "../../scope/test/worker.ts";
import { reader } from "../../scope/test/support.ts";
import { ownHost } from "../../scope/test/hosts.ts";
import { originalStart, startRoom } from "../src/start-custody.ts";
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

test("fresh Page Start discovers native demo register@7, retains before dispatch, Checks a lost accepted reply without mutation and explicitly Continues the original through enrolled room recovery (host, scheduler, storage and loss STAND-INs)", async () => {
  const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
  const lifetime = nativeFixtureLifetime(owner);
  let recovered: Uint8Array | undefined;
  try {
    const origin = "https://artroom-rehearsal.inguz.workers.dev";
    const host = ownHost();
    // Installer is solely native register setup; Start generates another key.
    const installer = secretSigner(crypto.getRandomValues(new Uint8Array(32)));
    const install = await signedIntent(installer, { to: null, kind: "install", fields: { host: host.host, namespace: host.namespace, policy: "open", purpose: DEMO_PURPOSE } }, { now: lifetime.now() });
    const seed: Seed = { v: 1, kind: "register", definition: DEMO_REGISTER, creator: null, cause: intentDigest(install.intent), ordinal: 0 };
    const R = lifetime.platform(scopeIdOf(seed));
    expect((await lifetime.wait(() => R.stub.found(install, DEMO_REGISTER))).answer).toBe("accepted");
    const register = await lifetime.wait(() => R.at());
    const wire = (name: ScopeId) => lifetime.outside(name, (given, sql) => host.outside(given, sql, host.bindings(R.name)));
    wire(R.name);
    await lifetime.wait(() => R.restart());
    lifetime.setHold(envelope => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; });
    const bindings = { SCOPES: env.PLATFORM, DEPLOYMENT: TEST_DEPLOYMENT, DEMO_START_CONFIG: canonicalize({ v: 1, origin, deployment: TEST_DEPLOYMENT, register, definition: DEMO_REGISTER }) };
    const native: Fetch = (url, init) => lifetime.wait(() => worker.fetch(new Request(url, init), bindings));
    const anonymous = await native(`${origin}/v1/scopes/${register.scope}`);
    expect(anonymous.status).toBe(403);
    await anonymous.body?.getReader().cancel();
    let offerStatus: number | null = null, offerTransportError: string | null = null;
    const offerFetch: FoundingOfferFetch = async (url, init) => {
      let response: Awaited<ReturnType<Fetch>>;
      // workerd Request accepts only follow/manual; the SDK requests browser
      // redirect:error. Direct Worker.fetch has no network redirect to follow.
      // Manual preserves no-follow; SDK still checks exact URL/status/bounds.
      expect(init.redirect).toBe("error");
      try { response = await native(url, { ...init, redirect: "manual" }); }
      catch (error) { offerTransportError = error instanceof Error ? error.name : "non-error"; throw error; }
      offerStatus = response.status;
      // In-process Worker responses have no network URL; only this metadata is
      // adapted. Real response status/body and native policy are unchanged.
      return { status: response.status, url, redirected: false, body: response.body };
    };
    let offer: Awaited<ReturnType<typeof foundingOffer>> | undefined;
    let offerFailed = false;
    try { offer = await lifetime.wait(() => foundingOffer(origin, { fetch: offerFetch })); }
    catch { offerFailed = true; }
    expect([offerStatus, offerTransportError], "native offer HTTP response before codec acceptance").toEqual([200, null]);
    expect(offerFailed, "bounded SDK acceptance of the actual native offer").toBe(false);
    if (!offer) throw new Error("The actual native offer was not decoded.");
    expect([offer.definition, offer.register, offer.at.seq, offer.registerItem.revision, offer.registerItem.purpose]).toEqual([DEMO_REGISTER, register, 0, 1, DEMO_PURPOSE]);
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
        const founder = unb64url(descriptor.secret)!;
        try { expect([founder.length, keyIdOfSecret(founder) === installer.key, signed.intent.actor === keyIdOfSecret(founder)]).toEqual([32, false, true]); } finally { founder.fill(0); }
        const journalKey = [...values.keys()].find(key => key.startsWith("artroom-page-claim:"))!;
        const journalBytes = values.get(journalKey)!, journal = JSON.parse(journalBytes);
        const kept = JSON.parse(journal.claims[descriptor.operation]);
        expect([journal.active === descriptor.operation, readbacks.get(descriptorKey) === descriptorBytes, readbacks.get(journalKey) === journalBytes]).toEqual([true, true, true]);
        if (signed.intent.kind === "found") {
          expect(signed.intent.fields["recoveryKey"]).not.toBe(installer.key);
          expect(signed.intent.fields["recoveryKey"]).not.toBe(signed.intent.actor);
        }
        const stage = signed.intent.kind === "found" ? kept.config.claim.found : signed.intent.kind === "seat" ? kept.config.claim.seat : kept.config.claim.firstKey;
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
    const fresh = await lifetime.wait(() => startRoom(origin, storage, { mode: "new", label: "My new room", offer, foundingOffer: async () => foundingOffer(origin, { fetch: offerFetch }), fetch, now: lifetime.now, pause, tries: 16, locks }));
    expect([fresh.pending, fresh.repository, sent.map(s => s.intent.kind)]).toEqual([true, null, ["found"]]);
    const original = sent[0]!, status = originalStart(origin, storage)!;
    expect([status.key === original.intent.actor, status.operation === fresh.operation, status.label]).toEqual([true, true, "My new room"]);
    const before = canonicalize([...values]);
    let checkPauses = 0, checkOfferReads = 0;
    const reload: ClaimStorage = { getItem: storage.getItem, setItem: storage.setItem };
    checkMode = true;
    const checked = await lifetime.wait(() => startRoom(origin, reload, { mode: "check", fetch, now: lifetime.now, locks, pause: async () => { checkPauses++; }, foundingOffer: async () => { checkOfferReads++; throw new Error("Check must not discover another offer"); } }));
    expect([checked.pending, checked.repository, sent.length, mutationPaths.length, checkPauses, checkOfferReads, checked.operation]).toEqual([true, null, 1, 1, 0, 0, fresh.operation]);
    checkMode = false;
    expect(originalStart(origin, storage)!.key).toBe(status.key);
    expect(canonicalize([...values]) === before).toBe(true); // Unconfirmed Check preserves the exact private checkpoint.
    const completed = await lifetime.wait(() => startRoom(origin, reload, { mode: "continue", label: "Ignored replacement label", fetch, now: lifetime.now, locks, pause, tries: 16, foundingOffer: async () => { throw new Error("Continue must not rediscover"); } }));
    expect([completed.outcome.code, completed.pending, completed.operation, completed.label, completed.key]).toEqual([0, false, fresh.operation, "My new room", status.key]);
    expect(completed.repository).not.toBeNull();
    expect(sent.map(s => s.intent.kind)).toEqual(["found", "found", "seat", "first-key"]);
    expect(sent.filter(s => s.intent.kind === "found")).toEqual([original, original]);
    const descriptor = JSON.parse(values.get(`artroom-page-start:${origin}`)!) as { secret: string; operation: string };
    const journal = JSON.parse(values.get([...values.keys()].find(key => key.startsWith("artroom-page-claim:"))!)!);
    const kept = JSON.parse(journal.claims[descriptor.operation]);
    expect(canonicalize(kept.completed.found.signed) === canonicalize(original)).toBe(true);
    expect([kept.completed.found.signed.intent.idempotencyKey, kept.completed.found.signed.intent.notAfter]).toEqual([original.intent.idempotencyKey, original.intent.notAfter]);
    const O = lifetime.platform(completed.repository!.directory.scope), M = lifetime.platform(completed.repository!.membership.scope);
    expect((await lifetime.wait(() => O.summary())).value.definition).toBe("platform:directory@3");
    expect((await lifetime.wait(() => R.entries())).filter(e => e.input.type === "act" && e.input.signed.intent.kind === "found")).toHaveLength(1);
    expect((await lifetime.wait(() => M.entries())).filter(e => e.input.type === "act" && e.input.signed.intent.kind === "seat")).toHaveLength(1);
    expect((await lifetime.wait(() => M.entries())).filter(e => e.input.type === "act" && e.input.signed.intent.kind === "first-key")).toHaveLength(1);
    recovered = completed.secret;
    expect(recovered?.length).toBe(32);
    const room = await lifetime.wait(() => openRoom({ service: origin, secret: recovered!, fetch, now: lifetime.now }, { directory: O.name, membership: completed.repository!.membership }));
    expect([room.directory, room.membership, room.key, room.me?.handle, room.reader !== null]).toEqual([O.name, completed.repository!.membership, status.key, "@founder", true]);
    expect(originalStart(origin, reload)?.state).toBe("complete");
  } finally { recovered?.fill(0); lifetime.release(); }
});
