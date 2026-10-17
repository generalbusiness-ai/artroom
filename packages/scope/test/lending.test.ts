import { expect, onTestFinished, test } from "vitest";
import type { Entry, Intent, Seed } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, entryHash, intentDigest, isSeed, scopeIdOf, seedDigest, textDigest, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { INVITATION_LINK, requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { command, memoryStore, type Context } from "../../cli/src/index.ts";
import { keys, type Actor } from "@generalbusiness/dap-derive/testing";
import { FILE_PUBLICATION_COHORT, FIRST_ACTIONS_OF, platform, repositoryName } from "@generalbusiness/dap-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { lendingGateway, SETTLED_AFTER_MS } from "../../../examples/lending/browser/client.ts";
import type { Kept, KeptStore } from "../../../examples/lending/browser/custody.ts";
import { findLending, joining, newDeviceKey, readInvitation, ROOM_MEMBERSHIP, type JoinStore, type KeptJoin } from "../../../examples/lending/browser/join.ts";
import { lending } from "../../../examples/lending/definition.ts";
import { LENDING_DEFINITION } from "../../../examples/lending/pin.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { soon } from "./net.ts";
import { reader as inspector } from "./support.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam } from "./repository.ts";
import { dispatchFixture } from "./support/native-fixture-lifetime.ts";
import { siteFixtureLifetime } from "./support/site-fixture-lifetime.ts";

const SERVICE = "https://scopes.test";

// The lending library of notes/2026-10-13-lending-library.md on real scopes: the
// file-publication cohort installed by the command line, real membership, invitations,
// role lists and authority, the real application factory, SQLite and replay.
// The Git host, the clock and the local memoryStore are labelled STAND-INS. No
// Site page, provider publication, change lane or browser runs here. Signed fixture
// text is forwarded as given; the real gateway below builds its own page text.
test("the lending library on real scopes: Nasruddin and the pot, its refusals, another member's return, the 64-thing bound, and roles that keep their earlier actions", async () => {
  const lifetime = siteFixtureLifetime();
  const settle = (...nodes: readonly Platform[]) => dispatchFixture(nodes, lifetime.wait);
  let releaseRegister = () => {};
  onTestFinished(() => releaseRegister());
  class OwnedPlatform extends Platform {
    override get stub() {
      const target = super.stub;
      return new Proxy(target, { get(source, key) {
        const value: unknown = Reflect.get(source, key, source);
        return typeof value === "function" ? (...args: unknown[]) => lifetime.wait(() => Promise.resolve(Reflect.apply(value, source, args))) : value;
      } });
    }
    override async created(seq: number, n = 0): Promise<Platform> {
      const send = (await lifetime.wait(() => this.entries()))[seq]?.sends.find((candidate) => candidate.n === n);
      if (!send || send.message.class !== "request" || send.message.type !== "create" || !isSeed(send.to)) throw new Error("a created scope requires an actual create request with a validated seed");
      return new OwnedPlatform(scopeIdOf(send.to));
    }
  }
  const store = memoryStore();
  await lifetime.wait(() => store.keep("operator", rita.secret));
  const fetch: Fetch = (url, init) => lifetime.wait(() => routed(url, init));
  const context: Context = { store, fetch, trustedCreationService: { service: SERVICE, fetch },
    now: () => { lifetime.active(); return timeMs(soon(0))!; } };
  const run = (...argv: string[]) => lifetime.wait(() => command(context, argv));
  const planned = await run("install", "--plan", SERVICE, "--cohort", "application-publication", "--host", "git.example", "--namespace", "lending");
  expect(planned.code, planned.lines.join("\n")).toBe(0);
  const plan = (await lifetime.wait(() => store.config()))?.plan;
  if (!plan) throw new Error("The CLI must retain the original application install plan.");
  const R = new OwnedPlatform(plan.register);
  try {
    const host = outsideOf(R.name);
    const ports = () => { lifetime.active(); return { outside: host }; };
    wired.set(R.name, ports);
    releaseRegister = () => { if (wired.get(R.name) === ports) wired.delete(R.name); };
    const installed = await run("install", "--planned", "--cohort", "application-publication");
    expect(installed.code, installed.lines.join("\n")).toBe(0);

    // The neighbour (rita) claims the room. She is its creator and admin.
    const neighbour = rita, nasruddin = keys.una, passerby = keys.vic;
    const claim = await R.intent(neighbour, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", "founderHandle": "@neighbour", recoveryKey: sam.key } });
    const directorySeed: Seed = { v: 1, kind: "directory", definition: FILE_PUBLICATION_COHORT.directory, creator: await R.at(), cause: intentDigest(claim.intent), ordinal: 0 };
    const D = new OwnedPlatform(scopeIdOf(directorySeed));
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(directorySeed), 1), id: "lending-fixture" } } });
    expect(await R.stub.submit(claim, [])).toMatchObject({ answer: "accepted" });
    await (R.stub as unknown as { effect(): Promise<number> }).effect();
    await settle(R, D);
    const child = async (kind: Seed["kind"]) => {
      const send = (await D.entries())[0]!.sends.find((candidate) => isSeed(candidate.to) && candidate.to.kind === kind);
      if (!send || !isSeed(send.to)) throw new Error(`the directory did not create its ${kind}`);
      return new OwnedPlatform(scopeIdOf(send.to));
    };
    const M = await child("membership"), Q = await child("rules"), G = await child("destination");
    await settle(R, D, M, Q, G);
    expect([(await D.summary()).value.definition, (await M.summary()).value.definition, (await Q.summary()).value.definition, (await G.summary()).value.definition])
      .toEqual([FILE_PUBLICATION_COHORT.directory, FILE_PUBLICATION_COHORT.membership, FILE_PUBLICATION_COHORT.rules, FILE_PUBLICATION_COHORT.destination]);
    const seat = await M.did(neighbour, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(neighbour, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const membership = await M.at();
    for (const [who, handle] of [[nasruddin, "@nasruddin"], [passerby, "@passerby"]] as const) {
      const secret = `lending-${handle}-invitation-secret-of-at-least-32-bytes`;
      const invitation = await M.did(neighbour, "invite-member", { fields: { handle, role: "member", inviteHash: textDigest(secret), inviteEnds: soon(60) } });
      await M.did(who, "join", { fields: { invitation, secret } });
    }

    // Activate the exact pin. The new factory supplies opener and its own recorded
    // destination reference; the caller supplies neither reserved field.
    const bytes = canonicalize(lending);
    expect(await Q.stub.submit(await Q.intent(neighbour, "activate", { fields: { digest: LENDING_DEFINITION, name: lending.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    const ask = async (who: Actor) => D.intent(who, "establish-application", { expected: await D.expected({ repository: 0 }), fields: { definition: LENDING_DEFINITION, values: "{}", execution: "recorded-do" } });
    expect(await D.stub.submit(await ask(nasruddin), [], { values: [bytes] })).toMatchObject({ answer: "refused", reason: "unauthorized" });
    const established = await D.stub.submit(await ask(neighbour), [], { values: [bytes] });
    expect(established.answer, JSON.stringify(established)).toBe("accepted");
    if (established.answer !== "accepted") throw new Error("the application factory refused the lending definition");
    const L = await D.created(established.receipt.fact.seq);
    lifetime.wire(L.name, () => NO_OUTSIDE);
    await settle(D, L);
    expect((await L.summary()).value).toMatchObject({ definition: LENDING_DEFINITION, status: "active",
      items: [{ type: "library", state: "open", refs: { destination: await G.at() }, parties: { "founder": { membership, member: "@neighbour" } } }] });

    // Enrollment and the factory grant no lending action by implication.
    let pageOrdinal = 0;
    const fixtureContent = "Signed fixture page text. State agreement is not asserted for this stand-in text.";
    const donation = async (name: string, description: string): Promise<Partial<Intent>> => ({ expected: await L.expected({ library: 0 }), fields: { name, description, page: `shelf/${(++pageOrdinal).toString(16).padStart(16, "0")}.md`, content: fixtureContent } });
    expect(await L.act(neighbour, "donate", await donation("Big pot", "A heavy copper pot. Holds eight litres."))).toMatchObject({ answer: "refused", reason: "unauthorized" });

    // Staff is the action lending.staff on a role membership already has. set-actions
    // replaces a role's whole list, so each grant restates what the role held.
    const first = FIRST_ACTIONS_OF[FILE_PUBLICATION_COHORT.membership]!;
    const lists = { admin: [...first.admin, "lending.member", "lending.staff"], member: [...first.member, "lending.member"] };
    for (const role of ["admin", "member"] as const) await M.did(neighbour, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role, actions: lists[role] } });
    lifetime.advance(301); // The earlier grant's reuse window ends; this is no claim of immediate revocation.
    // The roles kept their earlier actions: the admin can still invite, and still administers roles.
    await M.did(neighbour, "invite-member", { fields: { handle: "@later", role: "member", inviteHash: textDigest("lending-later-invitation-secret-of-at-least-32-bytes"), inviteEnds: soon(60) } });
    await M.did(neighbour, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role: "member", actions: lists.member } });
    lifetime.advance(301);

    const on = async (thing: number): Promise<Partial<Intent>> => ({ on: thing, expected: await L.expected({ on: thing, library: 0 }), fields: { content: fixtureContent } });
    const head = async () => (await L.summary()).at;
    const refused = async (answer: () => Promise<unknown>, reason: string) => {
      await settle(L, G); // Dispatch older causal tells/results only; this starts no outside effect.
      const before = await head();
      expect(await answer()).toMatchObject({ answer: "refused", reason });
      expect(await head()).toEqual(before);
    };
    const person = (handle: string) => ({ membership, member: handle });

    // 1 to 3: the neighbour donates the big pot; Nasruddin borrows it and returns it.
    const big = await L.did(neighbour, "donate", await donation("Big pot", "A heavy copper pot. Holds eight litres."));
    await L.did(nasruddin, "borrow", await on(big));
    expect(await L.item(big)).toMatchObject({ state: "lent", parties: { donor: person("@neighbour"), borrower: person("@nasruddin") } });
    await refused(async () => L.act(passerby, "borrow", await on(big)), "guard-failed");
    await L.did(nasruddin, "return", await on(big));
    expect(await L.item(big)).toMatchObject({ state: "available", parties: { borrower: null } });

    // 4: the small pot is not a thing in the library, so a return has no item to name.
    const things = async () => (await L.summary()).value.items.filter((item) => item.type === "thing");
    expect((await things()).map((thing) => thing.values["name"])).toEqual(["Big pot"]);

    // 5: Nasruddin donates it in his own words. The scope does not judge the description.
    const small = await L.did(nasruddin, "donate", await donation("Small pot", "Baby born when the big pot was with me"));
    expect(await L.item(small)).toMatchObject({ state: "available", parties: { donor: person("@nasruddin") }, values: { description: "Baby born when the big pot was with me" } });

    // 6 to 8: he borrows the big pot again and says it died. Only staff cancel.
    await L.did(nasruddin, "borrow", await on(big));
    await refused(async () => L.act(nasruddin, "cancel", { ...await on(big), fields: { content: fixtureContent, reason: "The pot died" } }), "unauthorized");
    const lent = (await L.item(big)).revision;
    const cancelled = await L.did(neighbour, "cancel", { ...await on(big), fields: { content: fixtureContent, reason: "Nasruddin says the pot died" } });
    // A thing that is gone has left the summary, which lists live items. Its end and its reason are in the record.
    expect((await things()).map((thing) => thing.id)).toEqual([small]);
    expect((await L.entries())[cancelled]).toMatchObject({ input: { type: "act", signed: { intent: { actor: neighbour.key, kind: "cancel", on: big, fields: { content: fixtureContent, reason: "Nasruddin says the pot died" } } } } });
    expect((await L.entries())[1]!.input).toMatchObject({ type: "delivery", message: { class: "control", type: "confirm" } });

    // 9: the shelf is replenished. No act changes the thing that is gone.
    const fresh = await L.did(neighbour, "donate", await donation("New big pot", "Copper, eight litres."));
    for (const [who, kind, fields] of [[nasruddin, "borrow", {}], [passerby, "return", {}], [neighbour, "cancel", { reason: "Again" }]] as const) {
      await refused(async () => L.act(who, kind, { on: big, expected: { on: lent + 1, library: 1 }, fields: { content: fixtureContent, ...fields } }), "final");
    }
    expect((await things()).map((thing) => [thing.id, thing.state])).toEqual([[small, "available"], [fresh, "available"]]);

    // The record still has the genesis, the creator's confirmation and exactly the seven
    // original accepted acts in order. Publication now also records their causal tell results.
    const kindOf = (entry: Entry) => entry.input.type === "act" ? `${entry.input.signed.intent.kind} ${entry.input.signed.intent.actor}` : entry.input.type;
    const originalStory = await L.entries();
    expect(originalStory.filter((entry, index) => index < 2 || entry.input.type === "act").map(kindOf)).toEqual(["genesis", "delivery", `donate ${neighbour.key}`, `borrow ${nasruddin.key}`, `return ${nasruddin.key}`,
      `donate ${nasruddin.key}`, `borrow ${nasruddin.key}`, `cancel ${neighbour.key}`, `donate ${neighbour.key}`]);
    const tells = originalStory.filter(entry => entry.input.type === "act");
    const answers = originalStory.slice(2).filter(entry => entry.input.type === "delivery");
    expect(answers).toHaveLength(7);
    for (const answer of answers) {
      expect(answer.input).toMatchObject({ type: "delivery", from: { at: await G.at() }, message: { class: "result", outcome: "applied" } });
      if (answer.input.type !== "delivery" || answer.input.message.class !== "result") throw new Error("A lending publication result must name its original tell.");
      const cause = answer.input.message.of;
      expect(cause.n).toBe(0);
      expect(cause.from.at).toEqual(await L.at());
      expect(tells.some(entry => entry.seq === cause.from.seq && entryHash(entry) === cause.from.hash)).toBe(true);
    }
    expect(new Set(answers.map(entry => entry.input.type === "delivery" && entry.input.message.class === "result" ? canonicalize(entry.input.message.of) : "")).size).toBe(7);
    const outboxItems = await L.stub.outbox(inspector);
    expect(outboxItems.ok).toBe(true);
    if (!outboxItems.ok) throw new Error("The lending outbox could not be read.");
    for (const tell of tells) {
      const result = answers.find(entry => entry.input.type === "delivery" && entry.input.message.class === "result" && entry.input.message.of.from.seq === tell.seq)!;
      expect(outboxItems.value.find(outboxId => outboxId.outboxId === `${tell.seq}.0`)).toMatchObject({ held: false, to: await G.at(), acknowledged: { at: await G.at() }, result: { seq: result.seq, clause: "applied" } });
    }

    // Publish repairs a retained gone thing using the live library as primary.
    // It records one send to the actual factory-injected sibling without changing either item.
    const libraryBeforePublish = await L.item(0), gonePage = (await L.entries())[big]!.input;
    expect(gonePage.type).toBe("act");
    const path = gonePage.type === "act" ? gonePage.signed.intent.fields["page"] : null;
    await L.did(nasruddin, "publish", { on: 0, expected: { on: libraryBeforePublish.revision, thing: lent + 1 }, fields: { thing: big, content: fixtureContent } });
    expect(await L.item(0)).toEqual(libraryBeforePublish);
    expect((await things()).some(thing => thing.id === big)).toBe(false);
    expect((await L.last()).sends).toMatchObject([{ to: await G.at(), message: { class: "request", type: "tell", body: { message: "publish-file", fields: { path, content: fixtureContent } } } }]);

    // Anyone may return a lent thing: the passer-by brings back what Nasruddin borrowed.
    await refused(async () => L.act(passerby, "return", await on(small)), "guard-failed");
    await L.did(nasruddin, "borrow", await on(small));
    await L.did(passerby, "return", await on(small));
    expect(await L.item(small)).toMatchObject({ state: "available", parties: { borrower: null } });

    // The member interface's gateway, on the same real scopes. The private store and the
    // lock are in-memory STAND-INS for the browser's; the lost reply is made by the test.
    const browser = (who: Actor, handle: `@${string}`, lose: { reply: boolean } = { reply: false }, readFetch: Fetch = fetch, current: () => boolean = () => true) => {
      let slot: string | null = null, posts = 0;
      const envelopes: string[] = [];
      const store: KeptStore = { load: async () => slot === null ? null : JSON.parse(slot) as Kept, save: async (value) => { slot = JSON.stringify(value); }, clear: async () => { slot = null; } };
      let chain: Promise<unknown> = Promise.resolve();
      const lock = { run: <T>(work: () => Promise<T>): Promise<T> => { const next = chain.then(work, work); chain = next.catch(() => undefined); return next; } };
      const open = (): ReturnType<typeof lendingGateway> => lendingGateway(
        { origin: SERVICE, deployment: "lending-fixture", scope: scopeOfLending, definition: LENDING_DEFINITION, membership, member: { membership, member: handle }, publicKey: who.key },
        { key: who.key, sign: async (bytes: Uint8Array) => (await import("@generalbusiness/artroom-client")).secretSigner(who.secret).sign(bytes) },
        { current, lock, store, fetch: readFetch, now: () => timeMs(soon(0))! + skew.ms,
          actFetch: async (url, init) => { posts++; envelopes.push(String(init?.body)); const response = await fetch(url, init); if (lose.reply) throw new Error("the reply was lost"); return response as never; } });
      return { open, store, posts: () => posts, kept: () => slot, envelopes };
    };
    const scopeOfLending = await L.at(), skew = { ms: 0 };
    const countThings = async () => (await things()).length;
    const his = browser(nasruddin, "@nasruddin"), g = his.open();
    { const seen = await g.look(); if (seen.status !== "current") throw new Error(`look: ${JSON.stringify(seen).slice(0, 300)}`);
      expect(seen.actions).toContain("lending.member"); expect(seen.actions).not.toContain("lending.staff"); }
    expect(await g.look()).toMatchObject({ status: "current", view: { things: [{ id: big, state: "gone", reason: "Nasruddin says the pot died", revision: lent + 1 }, { id: small, state: "available" }, { id: fresh, state: "available" }] } });
    // A proposal the view rules out signs and sends nothing.
    expect(await g.act("return", { thing: small })).toEqual({ status: "nothing-sent", reason: "That thing is not lent." });
    expect([his.posts(), his.kept()]).toEqual([0, null]);
    // An act that takes effect: kept before it is sent, verified in the record, then released.
    expect(await g.act("donate", { name: "Kettle", description: "Whistles." })).toEqual({ status: "recorded" });
    expect([his.posts(), his.kept(), await countThings()]).toEqual([1, null, 3]);
    // A refusal is final, in plain words with the scope's reason, and changes nothing.
    await g.look();
    await settle(L, G);
    const beforeRefusal = await head();
    expect(await g.act("cancel", { thing: small, reason: "The pot died" })).toEqual({ status: "refused", reason: "Only staff can cancel a thing. (unauthorized)" });
    expect([his.kept(), await head()]).toEqual([null, beforeRefusal]);

    // A lost reply. The donation took effect, the browser does not know, and it keeps the original.
    const lossy = { reply: true }, hers = browser(passerby, "@passerby", lossy), lost = hers.open();
    await lost.look();
    expect(await lost.act("donate", { name: "Sieve", description: "Fine mesh." })).toMatchObject({ status: "unknown" });
    expect([hers.posts(), await countThings()]).toEqual([1, 4]);
    expect(await lost.pending()).toMatchObject({ kind: "donate", name: "Sieve", unsent: false });
    const retainedDonation = JSON.parse(hers.kept()!) as Kept;
    const retainedFields = retainedDonation.envelope.signed.intent.fields;
    expect(retainedFields["page"]).toMatch(/^shelf\/[0-9a-f]{16}\.md$/);
    expect(retainedFields["content"]).toContain(`lending scope ${scopeOfLending.scope}, incarnation ${scopeOfLending.inc}`);
    expect(retainedFields["content"]).not.toMatch(/entry [0-9]+, hash/);
    const originalEntries = (await L.entries()).filter(entry => entry.input.type === "act" && canonicalize(entry.input.signed) === canonicalize(retainedDonation.envelope.signed));
    expect(originalEntries).toHaveLength(1);
    expect(originalEntries[0]!.sends).toMatchObject([{ n: 0, to: await G.at(), message: { class: "request", type: "tell", body: { message: "publish-file", fields: { path: retainedFields["page"], content: retainedFields["content"] } } } }]);
    // No second act is signed while the original is kept; ordinary recovery does not send it again.
    expect(await lost.act("donate", { name: "Sieve", description: "Fine mesh." })).toMatchObject({ status: "nothing-sent" });
    expect(await lost.resume()).toMatchObject({ status: "unknown" });
    // Even long after its deadline it cannot be given up: a read finds that it took effect.
    skew.ms = 10 * SETTLED_AFTER_MS;
    expect(await lost.abandon()).toBe(false);
    skew.ms = 0;
    expect([hers.posts(), await countThings()]).toEqual([1, 4]);
    // After a reload, a new gateway over the same private store finds the original, and Check settles it by a read.
    lost.dispose();
    lossy.reply = false;
    const reloaded = hers.open();
    expect(await reloaded.pending()).toMatchObject({ kind: "donate", name: "Sieve" });
    expect(await reloaded.check()).toEqual({ status: "recorded" });
    expect([hers.posts(), hers.kept(), await countThings()]).toEqual([1, null, 4]);
    expect((await things()).filter((thing) => thing.values["name"] === "Sieve")).toHaveLength(1);
    expect(await reloaded.pending()).toBeNull();
    // The original is deliberately retained again to exercise explicit same-envelope continuation against native idempotency.
    await settle(L, G);
    const beforeContinue = await head();
    await hers.store.save(retainedDonation);
    expect(await reloaded.continueOriginal()).toEqual({ status: "recorded" });
    expect([hers.posts(), hers.kept(), await countThings()]).toEqual([2, null, 4]);
    expect(hers.envelopes[1]).toBe(hers.envelopes[0]);
    expect(await head()).toEqual(beforeContinue);
    reloaded.dispose(); g.dispose();

    // A summary reply captured before a newer confirmed view cannot roll that view back.
    let holdSummary = true, unreadableMembership = false, releaseSummary!: () => void, enteredSummary!: () => void;
    const entered = new Promise<void>(resolve => { enteredSummary = resolve; });
    const released = new Promise<void>(resolve => { releaseSummary = resolve; });
    const delayed: Fetch = async (url, init) => {
      if (unreadableMembership && new URL(url).pathname === `/v1/scopes/${encodeURIComponent(membership.scope)}`) return new Response("unavailable", { status: 503 }) as never;
      const response = await fetch(url, init);
      if (holdSummary && new URL(url).pathname === `/v1/scopes/${encodeURIComponent(L.name)}`) {
        holdSummary = false; enteredSummary(); await released;
      }
      return response;
    };
    let sameView = true;
    const fenced = browser(neighbour, "@neighbour", { reply: false }, delayed, () => sameView), reader = fenced.open();
    const older = reader.look();
    await entered;
    try {
      await L.did(neighbour, "borrow", await on(small));
      const newer = await reader.look();
      expect(newer).toMatchObject({ status: "current" });
      if (newer.status === "current") expect(newer.actions).toContain("lending.staff");
      releaseSummary();
      const late = await older;
      expect(late).toMatchObject({ status: "current" });
      if (late.status !== "current") throw Error("The older read did not preserve the newer view");
      expect(late.view.things.find(thing => thing.id === small)?.state).toBe("lent");
      // An existing session and formerly observed staff actions cannot stand in for a failed roster read.
      unreadableMembership = true;
      expect(await reader.look()).toMatchObject({ status: "current", actions: null });
      await L.did(neighbour, "return", await on(small));
      sameView = false;
      await expect(reader.act("donate", { name: "Old view", description: "Must not be sent." })).rejects.toThrow("no longer current");
      expect([fenced.posts(), fenced.kept()]).toEqual([0, null]);
    } finally { releaseSummary(); reader.dispose(); }

    // A visitor joins from a browser with an invitation link, under the application cohort's
    // membership, with a device key that WebCrypto holds. Then the visitor's own device finds
    // the room's lending scope in the directory and donates. The reply to the join is lost.
    expect(ROOM_MEMBERSHIP).toBe(FILE_PUBLICATION_COHORT.membership);
    const inviteSecret = "lending-visitor-invitation-secret-of-at-least-32-bytes";
    const invited = await M.did(neighbour, "invite-member", { fields: { handle: "@visitor", role: "member", inviteHash: textDigest(inviteSecret), inviteEnds: soon(60) } });
    const linkText = INVITATION_LINK + b64url(utf8(JSON.stringify({ v: 1, service: SERVICE, repository: { directory: await D.at(), membership, rules: Q.name, destination: G.name },
      invitation: invited, secret: inviteSecret, handle: "@visitor", definition: FILE_PUBLICATION_COHORT.membership })));
    expect(readInvitation(linkText, "https://elsewhere.test")).toEqual({ ok: false, reason: "This invitation is for another service." });
    expect(readInvitation("artroom-invite:AAAA", SERVICE)).toEqual({ ok: false, reason: "That is not an invitation link." });
    const read = readInvitation(` ${linkText}\n`, SERVICE);
    if (!read.ok) throw new Error(read.reason);
    const device = await newDeviceKey(), clock = () => timeMs(soon(0))!;
    let joinSlot: string | null = null, joinPosts = 0, loseJoin = true;
    const joinStore: JoinStore = { load: async () => joinSlot === null ? null : JSON.parse(joinSlot) as KeptJoin, save: async (value) => { joinSlot = JSON.stringify(value); }, clear: async () => { joinSlot = null; } };
    const serial = { run: <T>(work: () => Promise<T>): Promise<T> => work() };
    const door = () => joining(device, { lock: serial, store: joinStore, now: clock, fetch,
      actFetch: async (url, init) => { joinPosts++; const response = await fetch(url, init); if (loseJoin) throw new Error("the reply was lost"); return response; } });
    const membersBefore = (await M.summary()).at;
    expect(await door().join(read.link, read.seat)).toMatchObject({ status: "unknown", seat: { handle: "@visitor" } });
    expect((await M.summary()).at.seq).toBe(membersBefore.seq + 1);
    const retainedJoin = JSON.parse(joinSlot!) as KeptJoin;
    // The join is kept. A second use of the invitation signs nothing; after a reload, Check settles the original by a read.
    expect(await door().join(read.link, read.seat)).toMatchObject({ status: "nothing-sent" });
    loseJoin = false;
    const reopened = door();
    expect(await reopened.pending()).toMatchObject({ handle: "@visitor" });
    expect(await reopened.check()).toEqual({ status: "joined", seat: read.seat });
    const joinsOf = async (key: string) => (await M.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "join" && entry.input.signed.intent.actor === key).length;
    expect([joinPosts, joinSlot, await joinsOf(device.publicKey)]).toEqual([1, null, 1]);
    // Explicit Continue reuses the original M4 join after a reload, never another enrollment.
    await joinStore.save(retainedJoin);
    expect(await reopened.continueOriginal()).toEqual({ status: "joined", seat: read.seat });
    expect([joinPosts, joinSlot, await joinsOf(device.publicKey)]).toEqual([2, null, 1]);
    // A used invitation is refused in plain words, and nothing stays kept.
    const second = await newDeviceKey();
    expect(await joining(second, { lock: serial, store: joinStore, now: clock, fetch }).join(read.link, read.seat)).toMatchObject({ status: "refused" });
    expect([joinSlot, await joinsOf(second.publicKey)]).toEqual([null, 0]);
    // The advertised handle is not identity evidence. The visitor's own
    // authenticated membership read must still identify this key as @visitor.
    const matched = await findLending({ ...read.seat, handle: "@not-visitor" }, device, { now: clock, fetch });
    if (!matched.ok) throw new Error(matched.reason);
    expect(matched.identity).toMatchObject({ scope: scopeOfLending, member: { member: "@visitor" }, publicKey: device.publicKey });
    let visitorSlot: string | null = null;
    const visitor = lendingGateway(matched.identity, (await import("../../../examples/lending/browser/join.ts")).deviceSigner(device), { current: () => true, lock: serial, now: clock, fetch,
      store: { load: async () => visitorSlot === null ? null : JSON.parse(visitorSlot) as Kept, save: async (value) => { visitorSlot = JSON.stringify(value); }, clear: async () => { visitorSlot = null; } } });
    expect((await visitor.look()).status).toBe("current");
    expect(await visitor.act("donate", { name: "Whisk", description: "Balloon." })).toEqual({ status: "recorded" });
    expect((await things()).find((thing) => thing.values["name"] === "Whisk")).toMatchObject({ parties: { donor: person("@visitor") } });
    expect(await findLending(read.seat, second, { now: clock, fetch })).toMatchObject({ ok: false });
    visitor.dispose();

    // The state and the record survive a restart.
    await settle(L, G);
    const before = await L.summary();
    await lifetime.wait(() => L.restart());
    expect((await L.summary()).value).toEqual(before.value);

    // 64 live things. The gone pot does not count; the 65th donation is refused until a thing is cancelled.
    for (let n = 6; n <= 64; n++) await L.did(nasruddin, "donate", await donation(`Thing ${n}`, "One of many."));
    expect(await things()).toHaveLength(64);
    await refused(async () => L.act(nasruddin, "donate", await donation("Thing 65", "One too many.")), "type-full");
    await L.did(neighbour, "cancel", { ...await on(fresh), fields: { content: fixtureContent, reason: "Dented" } });
    await L.did(nasruddin, "donate", await donation("Thing 65", "Room again."));

    // An independent reader replays the lending scope from its record, with the grants proven from membership.
    const issued = await lifetime.wait(() => requestSession(SERVICE, M.name, sessionRequest(membership, neighbour.secret, soon(60), crypto.randomUUID()), { fetch: routed as unknown as Fetch }));
    if (!issued.ok) throw new Error(`Read session refused: ${issued.reason}`);
    const final = await head();
    const replay = await lifetime.wait(() => verify(httpSource(SERVICE, { fetch, reader: issued.session.reader() }), { mode: "replay", platform, grants: "proven", scope: L.name, head: final }));
    expect([replay.report.result, replay.why]).toEqual(["consistent", null]);
  } finally {
    lifetime.release();
    releaseRegister();
  }
});
