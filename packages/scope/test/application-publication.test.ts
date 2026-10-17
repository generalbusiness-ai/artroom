import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { DeclaredDefinition, FactRef, Intent, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, definitionDigest, factRefOf, intentDigest, scopeIdOf, signIntent, textDigest, timeOf } from "@generalbusiness/artroom-bytes";
import { applicationPublicationOrigin, FILE_PUBLICATION_COHORT, fileReceiptRef, platform } from "@generalbusiness/dap-platform";
import { Reader } from "@generalbusiness/artroom-git";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { SqliteStore } from "../src/index.ts";
import type { EffectAnswer, EffectRequest, LateAnswers } from "../src/operations.ts";
import { namespace } from "../src/namespace.ts";
import { site } from "../src/site/route.ts";
import { ownHost } from "./hosts.ts";
import { soon } from "./net.ts";
import { Platform, rita, routed, sam } from "./repository.ts";
import { reader } from "./support.ts";
import { beginSessionFixture } from "./session-settings.ts";
import { dispatchFixture, driveFixture, nativeFixtureLifetime } from "./support/native-fixture-lifetime.ts";

// A made-up declared publisher deliberately uses the reserved word change.
// Its acts and native factory are real; no change-lane role is granted.
const publisher: DeclaredDefinition = {
  format: "artroom-definition-1", name: "change", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "establish",
  items: { library: { many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: {},
    refs: { destination: { fixed: true, required: true, to: { type: "scope", kind: "destination" } }, other: { fixed: true, required: false, to: { type: "scope", kind: "destination" } } }, values: {} } },
  acts: {
    establish: { step: "open", on: "library", grant: "application.establish", also: {}, fields: { destination: { type: "scope", kind: "destination", required: true }, other: { type: "scope", kind: "destination", required: false } }, guards: [],
      effects: [{ ref: { slot: "destination", from: { field: "destination" } } }, { ref: { slot: "other", from: { field: "other" } } }], sends: [], attention: [] },
    write: { step: "transition", on: "library", grant: "application.establish", also: {},
      fields: { path: { type: "text", max: 1024, required: true }, content: { type: "text", max: 65536, required: true } }, guards: [], effects: [],
      sends: [{ tell: { to: { slot: "destination" }, message: "publish-file", fields: { path: { field: "path" }, content: { field: "content" } }, result: {} } }], attention: [] },
    elsewhere: { step: "transition", on: "library", grant: "application.establish", also: {},
      fields: { path: { type: "text", max: 1024, required: true }, content: { type: "text", max: 65536, required: true } }, guards: [], effects: [],
      sends: [{ tell: { to: { slot: "other" }, message: "publish-file", fields: { path: { field: "path" }, content: { field: "content" } }, result: {} } }], attention: [] },
    pair: { step: "transition", on: "library", grant: "application.establish", also: {},
      fields: { first: { type: "text", max: 1024, required: true }, second: { type: "text", max: 1024, required: true }, content: { type: "text", max: 4096, required: true } }, guards: [], effects: [],
      sends: ["first", "second"].map(path => ({ tell: { to: { slot: "destination" }, message: "publish-file", fields: { path: { field: path }, content: { field: "content" } }, result: {} } })), attention: [] },
  }, receives: {}, timed: {}, rules: {},
};
const bytes = canonicalize(publisher), digest = definitionDigest(publisher);
const SERVICE = "https://scopes.test";

// Actual native R9/D8/M4/Q3/G4, application authority, factory, delivery,
// SQLite, restart, Git object building and Site selection. OwnGit is a
// LABELLED host stand-in using maps and decoded wire packs. The clock,
// inspector readers and finite driver are fixture controls, not a provider.
test("a native application publishes once after missing proof, keeps later source order across restart, and cannot publish into another room", async () => {
  const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
  const life = nativeFixtureLifetime(owner, { required: false });
  const cohort = FILE_PUBLICATION_COHORT;
  const rooms: Platform[] = [];
  const pause = async (nodes: readonly Platform[]) => {
    const callbacks = async () => {
      let joined = 0;
      for (const node of nodes) {
        const read = await life.wait(() => (node.stub as unknown as { awaitScheduledCallbacks(): Promise<{ callbacks: number }> }).awaitScheduledCallbacks());
        if (!Number.isSafeInteger(read.callbacks) || read.callbacks < 0) throw new Error("The fixture callback count is invalid");
        joined += read.callbacks;
      }
      return joined;
    };
    for (let pass = 0; pass < 64; pass++) {
      await callbacks();
      await driveFixture(nodes, life.wait);
      if (await callbacks() === 0) return;
    }
    throw new Error("The fixture exceeded 64 callback and driver rounds");
  };
  const setup = async () => {
    const host = ownHost();
    const control: { allowPush: boolean; allowRead: boolean; losePushReply: boolean; pushes: string[];
      original: { request: EffectRequest; answer: EffectAnswer } | null; late: LateAnswers | null } = {
      allowPush: true, allowRead: true, losePushReply: false, pushes: [], original: null, late: null,
    };
    const install: Intent = { v: 1, to: null, actor: rita.key, kind: "install", on: null, expected: {}, fields: { host: host.host, namespace: host.namespace, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = life.platform(scopeIdOf({ v: 1, kind: "register", definition: cohort.register, creator: null, cause: intentDigest(install), ordinal: 0 }));
    const bindings = host.bindings(R.name);
    const wire = (node: Platform) => life.outside(node.name, (given, sql) => {
      const actual = host.outside(given, sql, bindings);
      return { ...actual,
        accepts: (owner, kind) => !(kind === "push" && !control.allowPush || kind === "read" && !control.allowRead) && actual.accepts(owner, kind),
        send: async request => {
          const answer = await actual.send(request);
          if (request.kind === "push") {
            control.pushes.push(request.operation);
            if (control.losePushReply && control.original === null && answer) { control.original = { request, answer }; return null; }
          }
          return answer;
        },
        late: deliver => { control.late = deliver; },
      };
    });
    wire(R);
    expect(await R.stub.create(signIntent(install, rita.secret), cohort.register)).toMatchObject({ answer: "accepted" });
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    const seed: Seed = { v: 1, kind: "directory", definition: cohort.directory, creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 };
    const D = life.platform(scopeIdOf(seed));
    expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted" });
    await pause([R, D]);
    const initial = (await D.entries())[0]!;
    const sibling = (kind: ScopeRef["kind"]) => {
      const send = initial.sends.find(row => "definition" in row.to && row.to.kind === kind);
      if (!send || !("definition" in send.to)) throw new Error("the actual Directory creates each sibling");
      return life.platform(scopeIdOf(send.to));
    };
    const M = sibling("membership"), Q = sibling("rules"), G = sibling("destination");
    wire(G);
    await pause([R, D, M, Q, G]);
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    expect(await Q.stub.submit(await Q.intent(rita, "activate", { fields: { digest, name: publisher.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    const signed = await D.intent(rita, "establish-application", { expected: await D.expected({ repository: 0 }), fields: { definition: digest, values: "{}", execution: "recorded-do" } });
    const child = await D.stub.submit(signed, [], { values: [bytes] });
    expect(child.answer).toBe("accepted");
    if (child.answer !== "accepted") throw new Error("the native application creation is accepted");
    const C = await D.created(child.receipt.fact.seq);
    await pause([R, D, M, Q, G, C]);
    // The test's per-name outside factory is selected at object start. The
    // Directory delivered G's genesis before this fixture installed its host
    // factory. Restart with that factory and finish the native founding first.
    await G.restart();
    await pause([R, D, M, Q, G, C]);
    expect((await G.item(0)).state).toBe("ready");
    expect((await C.item(0)).refs["destination"]).toEqual(await G.at());
    const genesis = factRefOf((await C.entries())[0]!);
    const peer = await life.wait(() => namespace(env.PLATFORM).resolver.read(genesis, 30, true));
    expect(peer && "entry" in peer ? peer.origin?.length : null).toBe(3);
    expect(peer && "entry" in peer ? peer.under : null).toBe("declared:change");
    rooms.push(R, D, M, Q, G, C);
    return { host, bindings, control, R, D, M, Q, G, C };
  };
  const state = (G: Platform) => life.wait(() => runInDurableObject(G.object, (_object, storage) => {
    const store = new SqliteStore({ exec: (sql, ...args) => storage.storage.sql.exec(sql, ...args), transaction: run => storage.storage.transactionSync(run) });
    return store.all();
  }));
  const envelope = async (C: Platform, seq: number) => {
    const entry = (await C.entries())[seq]!, send = entry.sends[0]!;
    return { from: factRefOf(entry), n: send.n, to: send.to, message: send.message };
  };
  const readReceipt = async (host: ReturnType<typeof ownHost>, from: FactRef, n: number) => {
    const ref = fileReceiptRef({ from, n });
    // Read actual public objects decoded from the production port's push.
    // Reader checks their hashes, types, sizes and commit/tree linkage.
    const reader = new Reader({
      object: async id => { const object = host.stand.objects.get(id); return object ? { type: object.type, size: object.data.length, data: object.data } : null; },
      ref: async name => host.stand.refs.get(name) ?? null,
      refs: async (prefix, limit) => [...host.stand.refs].filter(([name]) => name.startsWith(prefix)).slice(0, limit + 1).map(([ref, target]) => ({ ref, target })),
    });
    const target = await reader.ref(ref);
    expect(target).not.toBeNull();
    if (!target) throw new Error("the exact send has a public receipt ref");
    const commit = await reader.linked(target), tree = await reader.tree(commit.tree);
    const file = tree.find(entry => new TextDecoder().decode(entry.name) === "receipt.json");
    if (!file) throw new Error("the receipt commit has its JSON file");
    return { ref, target, file: JSON.parse(new TextDecoder().decode(await reader.object(file.id, "blob"))) as Record<string, unknown> };
  };
  try {
    const a = await setup();
    let proofAvailable = false;
    const actual = namespace(env.PLATFORM).resolver;
    life.wire(a.G.name, () => ({ resolver: { read: async (fact, seconds, origin) => {
      const found = await life.wait(() => actual.read(fact, seconds, origin));
      return found && "entry" in found && origin && !proofAvailable ? { ...found, origin: found.origin?.slice(0, 2) ?? [] } : found;
    } } }));
    await a.G.restart();
    const beforeRead = await a.G.summary();
    const before = beforeRead.at;
    expect(beforeRead.value.reservationExpiry).toEqual({ clock: "available", time: timeOf(life.now()), expired: [] });
    const first = await a.C.did(rita, "write", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { path: "shelf/native.md", content: "# First shelf\n" } });
    await dispatchFixture([a.C, a.G], life.wait);
    expect((await a.G.summary()).at).toEqual(before);
    expect((await state(a.G)).items.filter(item => item.type === "file-publication")).toHaveLength(0);
    proofAvailable = true;
    const firstCause = factRefOf((await a.C.entries())[first]!);
    const proof = await life.wait(() => actual.read(firstCause, 30, true));
    expect(proof && "entry" in proof ? applicationPublicationOrigin(firstCause, (await a.D.at()), (await a.G.at()), proof.origin ?? []) : null).toBe(true);
    life.advance(2000);
    await pause(rooms);
    let written = (await state(a.G)).items.filter(item => item.type === "file-publication");
    expect(written).toHaveLength(1);
    const inspection = await state(a.G);
    const sending = await life.wait(() => runInDurableObject(a.G.object, (_object, storage) => {
      const store = new SqliteStore({ exec: (sql, ...args) => storage.storage.sql.exec(sql, ...args), transaction: run => storage.storage.transactionSync(run) });
      return inspection.operations.filter(operation => operation.for === written[0]!.id).map(operation => ({ id: operation.id, sending: store.sending(operation.id, 1) }));
    }));
    expect(written[0], canonicalize({ items: inspection.items.map(item => ({ id: item.id, type: item.type, state: item.state,
      ...(item.type === "branch" ? { slot: item.values["slot"], judging: item.values["judging"] } : {}) })),
      sending, operations: inspection.operations.map(operation => ({ id: operation.id, kind: operation.kind, for: operation.for,
        outcomes: operation.attempts.map(attempt => attempt.outcomes.map(outcome => outcome.result)) })) })).toMatchObject({ state: "published", values: { sourceSeq: first, sourceOrdinal: 0, path: "shelf/native.md" } });
    const once = a.host.stand.pushes.filter(push => push.ref === "refs/heads/main").length;
    const finalHead = (await a.G.summary()).at;
    proofAvailable = false;
    expect(await a.G.stub.deliver(await envelope(a.C, first))).toMatchObject({ answer: "recorded" });
    expect((await a.G.summary()).at).toEqual(finalHead);
    expect(a.host.stand.pushes.filter(push => push.ref === "refs/heads/main")).toHaveLength(once);
    proofAvailable = true;
    // Already admitted and reserved work can become stale while its original
    // push remains unsent. The new native outcome records no sent mark.
    a.control.allowPush = false;
    await a.G.restart();
    const stale = await a.C.did(rita, "write", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { path: "shelf/queued.md", content: "# Queued older page\n" } });
    await pause(rooms);
    const staleItem = (await state(a.G)).items.find(item => item.type === "file-publication" && item.values["sourceSeq"] === stale)!;
    const stalePush = (await state(a.G)).operations.find(operation => operation.kind === "push" && operation.for === staleItem.id)!;
    expect(stalePush.attempts[0]!.outcomes).toEqual([]);
    const queuedNewer = await a.C.did(rita, "write", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { path: "shelf/queued.md", content: "# Queued newer page\n" } });
    await pause(rooms);
    const pushCount = a.control.pushes.length;
    a.control.allowPush = true;
    await a.G.restart();
    await pause(rooms);
    const staleAfter = await state(a.G);
    expect(staleAfter.items.find(item => item.id === staleItem.id)?.state).toBe("superseded");
    expect(staleAfter.items.find(item => item.type === "file-publication" && item.values["sourceSeq"] === queuedNewer)?.state).toBe("published");
    expect(a.control.pushes).not.toContain(stalePush.id);
    expect(a.control.pushes).toHaveLength(pushCount + 1);
    const notSent = await life.wait(() => runInDurableObject(a.G.object, (_object, storage) => {
      const store = new SqliteStore({ exec: (sql, ...args) => storage.storage.sql.exec(sql, ...args), transaction: run => storage.storage.transactionSync(run) });
      return store.sending(stalePush.id, 1)?.sent;
    }));
    expect(notSent).toBeNull();
    // The host applies the original push, but its reply is withheld. Its
    // deciding reads are held, so an actual unknown survives a restart.
    a.control.losePushReply = true; a.control.allowRead = false;
    const unknown = await a.C.did(rita, "write", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { path: "shelf/unknown.md", content: "# Original unknown page\n" } });
    await pause(rooms);
    const unknownItem = (await state(a.G)).items.find(item => item.type === "file-publication" && item.values["sourceSeq"] === unknown)!;
    expect(unknownItem.state).toBe("unresolved");
    const original = a.control.original;
    if (!original) throw new Error("the real original host answer is held");
    expect(a.control.pushes.filter(id => id === original.request.operation)).toHaveLength(1);
    await a.G.restart();
    await pause(rooms);
    expect((await state(a.G)).items.find(item => item.id === unknownItem.id)?.state).toBe("unresolved");
    expect((await a.G.item(0)).values["slot"]).toBe(unknownItem.id);
    expect(a.control.pushes.filter(id => id === original.request.operation)).toHaveLength(1);
    proofAvailable = false;
    if (!a.control.late) throw new Error("the restarted driver has its late-answer channel");
    const late = a.control.late;
    expect(await life.wait(() => runInDurableObject(a.G.object, () => late(original.request.operation, 1, original.answer)))).toEqual({ recorded: "unavailable" });
    proofAvailable = true;
    await pause(rooms);
    expect((await state(a.G)).items.find(item => item.id === unknownItem.id)?.state).toBe("published");
    const unknownPush = (await state(a.G)).operations.find(operation => operation.id === original.request.operation)!;
    expect(unknownPush.attempts[0]!.outcomes.map(outcome => outcome.result)).toEqual(["unknown", "confirmed"]);
    expect(a.control.pushes.filter(id => id === original.request.operation)).toHaveLength(1);
    a.control.losePushReply = false; a.control.allowRead = true;
    // Hold the earlier actual tell while admitting and publishing the later
    // actual entry. No source fact is scripted or re-signed at release.
    let held: FactRef | null = null;
    life.setHold(delivery => !!held && canonicalize(delivery.from) === canonicalize(held));
    const oldIntent = await a.C.intent(rita, "write", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { path: "shelf/native.md", content: "# Older delayed shelf\n" } });
    // Hold every send from this scope until its accepted immutable cause is
    // known. Then keep only that original send behind the transport gate.
    life.setHold(delivery => delivery.from.at.scope === a.C.name);
    const old = await a.C.stub.submit(oldIntent, []);
    if (old.answer !== "accepted") throw new Error("the older actual entry is accepted");
    held = old.receipt.fact;
    life.setHold(delivery => canonicalize(delivery.from) === canonicalize(held));
    const later = await a.C.did(rita, "write", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { path: "shelf/native.md", content: "# Later shelf wins\n" } });
    await pause(rooms);
    await a.G.restart();
    const newerMain = a.host.stand.refs.get("refs/heads/main");
    const beforeRelease = a.host.stand.pushes.filter(push => push.ref === "refs/heads/main").length;
    life.setHold(() => false);
    life.advance(2000);
    await pause(rooms);
    written = (await state(a.G)).items.filter(item => item.type === "file-publication");
    expect(written.find(item => item.values["sourceSeq"] === old.receipt.fact.seq)?.state).toBe("superseded");
    expect(written.find(item => item.values["sourceSeq"] === later)?.state).toBe("published");
    expect(a.host.stand.refs.get("refs/heads/main")).toBe(newerMain);
    expect(a.host.stand.pushes.filter(push => push.ref === "refs/heads/main")).toHaveLength(beforeRelease);
    const oldReceipt = await readReceipt(a.host, old.receipt.fact, 0);
    const laterCause = factRefOf((await a.C.entries())[later]!);
    expect(oldReceipt.file).toMatchObject({ cause: { from: old.receipt.fact, n: 0 }, supersededBy: { from: laterCause, n: 0 },
      path: "shelf/native.md", contentDigest: textDigest("# Older delayed shelf\n"), commit: newerMain });
    const pair = await a.C.did(rita, "pair", { on: 0, expected: await a.C.expected({ on: 0 }), fields: { first: "shelf/ordinal-0.md", second: "shelf/ordinal-1.md", content: "# Both actual sends\n" } });
    await pause(rooms);
    const pairCause = factRefOf((await a.C.entries())[pair]!);
    const receipts = await Promise.all([0, 1].map(n => readReceipt(a.host, pairCause, n)));
    expect(receipts[0]!.ref).not.toBe(receipts[1]!.ref);
    expect(receipts[0]!.target).not.toBe(receipts[1]!.target);
    for (const [n, receipt] of receipts.entries()) expect(receipt.file).toMatchObject({ cause: { from: pairCause, n }, path: `shelf/ordinal-${n}.md`, contentDigest: textDigest("# Both actual sends\n") });
    // An actual nested child has room membership and a usable destination,
    // but its creator is an application, not the native Directory factory.
    const container: DeclaredDefinition = { ...publisher, name: "publisher-container", acts: {
      establish: { ...publisher.acts["establish"]!, sends: [{ create: { kind: "lane", definition: digest,
        fields: { destination: { field: "destination" } }, result: {} } }] },
    } };
    const containerDigest = definitionDigest(container), containerBytes = canonicalize(container);
    expect(await a.Q.stub.submit(await a.Q.intent(rita, "activate", { fields: { digest: containerDigest, name: container.name, dependency1: digest } }), [], { values: [containerBytes, bytes] })).toMatchObject({ answer: "accepted" });
    life.advance(301000); // End the factory's documented 300-second definition observation reuse window.
    const parentIntent = await a.D.intent(rita, "establish-application", { expected: await a.D.expected({ repository: 0 }), fields: { definition: containerDigest, dependency1: digest, values: "{}", execution: "recorded-do" } });
    const made = await a.D.stub.submit(parentIntent, [], { values: [containerBytes, bytes] });
    expect(made.answer, canonicalize(made)).toBe("accepted");
    if (made.answer !== "accepted") throw new Error("the native container is created with its real named dependency");
    const parent = await a.D.created(made.receipt.fact.seq);
    await pause([a.D, parent]);
    const nested = await parent.created(0, 1);
    await pause([a.D, parent, nested]);
    const nestedWrite = await nested.did(rita, "write", { on: 0, expected: await nested.expected({ on: 0 }), fields: { path: "README.md", content: "# Not a native Directory application\n" } });
    const noAppHead = (await a.G.summary()).at;
    expect(await a.G.stub.deliver(await envelope(nested, nestedWrite))).toEqual({ answer: "source-unverified" });
    expect((await a.G.summary()).at).toEqual(noAppHead);
    const response = await life.wait(() => site(new Request(`${SERVICE}/site/${a.D.name}/${newerMain}/shelf/native.md`), { SCOPES: env.PLATFORM, ...a.bindings }, a.host.stand.fetch));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Later shelf wins");
    const checkedHead = (await a.G.summary()).at;
    const replay = await life.wait(() => verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", platform, grants: "proven", scope: a.G.name, head: checkedHead }));
    expect([replay.report.result, replay.why]).toEqual(["consistent", null]);
    const b = await setup();
    const signed = await a.D.intent(rita, "establish-application", { expected: await a.D.expected({ repository: 0 }), fields: { definition: digest, values: canonicalize({ other: await b.G.at() }), execution: "recorded-do" } });
    const creation = await a.D.stub.submit(signed, [], { values: [bytes] });
    if (creation.answer !== "accepted") throw new Error("a real own-room app can declare an arbitrary outside destination");
    const crossApp = await a.D.created(creation.receipt.fact.seq);
    await pause([a.D, crossApp]);
    const cross = await crossApp.did(rita, "elsewhere", { on: 0, expected: await crossApp.expected({ on: 0 }), fields: { path: "README.md", content: "# Foreign room\n" } });
    const foreignHead = (await b.G.summary()).at;
    expect(await b.G.stub.deliver(await envelope(crossApp, cross))).toEqual({ answer: "source-unverified" });
    expect((await b.G.summary()).at).toEqual(foreignHead);
  } finally { life.release(); }
});
