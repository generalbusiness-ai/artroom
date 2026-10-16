/** Real @5 birth, turns, SQLite, observation guards and operation driver.
 * Membership is a real scope. Creator/lane histories, rules answers and
 * Git replies are scripted stand-ins. No provider or partition activates. */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, onTestFinished, test } from "vitest";
import type { Entry, FieldValue, OperationId, Request, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, factRefOf, intentDigest, isRecord, newIncarnation, scopeIdOf, timeMs, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { contentStates, owed, PROFILES, validateDefinition, valueDigest, type Fetched } from "@generalbusiness/dap-derive";
import { keys } from "@generalbusiness/dap-derive/testing";
import { DESTINATION_5, destination5, destinationRules5, firstExtents, PUBLISHING_LANE_DIGESTS, platform } from "@generalbusiness/dap-platform";
import { publicationJourney } from "../../platform/test/support-publication-journey.ts";
import { handMade, HEAD, RULES, rulesObserved } from "../../platform/test/support-destination.ts";
import { observing } from "../src/authority.ts";
import type { Delivery, EffectAnswer, EffectRequest, Sealed } from "../src/index.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { controls, net } from "../src/testing.ts";
import { wired } from "./outside.ts";
import { repository, rita, una } from "./repository.ts";
import { objectOf, reader, stubOf } from "./support.ts";
import { room as realRoom } from "../../../apps/room/lanes/test/support/room.ts";

test.each(["effective", "absent", "unavailable", "active", "root-full"] as const)("D1 native standing at capacity after restart: %s (compromise relay delayed)", async seen => {
  const fullRoot = seen === "root-full" ? await realRoom({ roster: ["@una"] }) : null;
  const room = fullRoot ? { M: fullRoot.M, una: fullRoot.members["@una"]!, unasKey: (await fullRoot.M.entries()).find(entry => entry.input.type === "act" && entry.input.signed.intent.kind === "join" && entry.input.signed.intent.actor === una.key)!.seq } : await repository();
  const membership = await room.M.at();
  await room.M.did(rita, "set-role", { on: room.una, expected: await room.M.expected({ on: room.una }), fields: { role: "maintainer" } });
  const journey = publicationJourney(destination5, DESTINATION_5, destinationRules5);
  const birth = journey.birth(true, membership, fullRoot ? await fullRoot.D.at() : undefined), name = scopeIdOf(birth.asked.to), control = controls(name, net.clock.now);
  control.clock = net.clock;
  const foreign = new Map<string, { entry: Entry; under: string; origin?: readonly Fetched[] }>();
  const remember = (entry: Entry, under: string, origin?: readonly Fetched[]) => { foreign.set(factRefOf(entry).hash, { entry, under, ...(origin ? { origin } : {}) }); };
  remember(birth.source, "platform:directory"); remember(birth.claim, "platform:register");
  let driving = "none", keyReads: string[] = [], unreadable = false;
  const answers = new Map<string, EffectAnswer>(), sent: EffectRequest[] = [];
  // Scripted custody of exact already-received replies, across object lives.
  const replies = new Map<OperationId, { operation: OperationId; attempt: number; answer: EffectAnswer }>();
  wired.set(name, () => ({
    owners: null, transport: null,
    resolver: { read: async fact => foreign.get(fact.hash) ?? null },
    authority: observing({ clock: control.clock, random: { bytes: n => crypto.getRandomValues(new Uint8Array(n)) }, membership: () => membership, rules: () => RULES,
      content: named => { const data = platform(named)?.data; return data ? contentStates(data) : null; },
      reader: { observe: async asked => {
        if (asked.of.kind === "rules") {
          const { at: _at, ...answer } = rulesObserved(control.clock.now);
          if (answer.content.asked !== "rules") throw Error("Scripted rules have fixed content");
          const extents = firstExtents(answer.content);
          return { answer: { ...answer, content: { ...answer.content, singleControllerException: false, extents: valueDigest("artroom-rules-extents-1", extents) } }, values: [{ domain: "artroom-rules-extents-1", bytes: canonicalize(extents) }] };
        }
        if ("key" in asked) keyReads.push(asked.key);
        if (unreadable && "key" in asked && asked.key === una.key) return null;
        return room.M.stub.observe(asked);
      } },
    }),
    outside: { accepts: (_owner, kind) => kind === driving, send: async request => {
      sent.push(request);
      const answer = answers.get(request.operation);
      if (!answer) throw Error(`No scripted answer for ${request.kind} ${request.operation}`);
      replies.set(request.operation, { operation: request.operation, attempt: request.attempt, answer });
      return answer;
    }, replies: limit => ({ answers: [...replies.values()].slice(0, limit), more: replies.size > limit }), judged: (at, sealed) => { if (sealed) replies.delete(at.operation); } },
  }));
  onTestFinished(() => { wired.delete(name); });
  const object = objectOf(name), surface = object as unknown as { deliver(input: unknown): Promise<Delivery>; effect(): Promise<number> };
  const history = async () => { const got = await stubOf(name).history(reader); if (!got.ok) throw Error("Native history unavailable"); return got.value; };
  const snapshot = () => runInDurableObject(object, (_instance, state) => {
    const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
    return store.all();
  });
  const drive = async (kind: string, operation: string, body: EffectAnswer["evidence"]["body"], retain?: EffectAnswer["retain"]) => {
    answers.set(operation, { result: "confirmed", evidence: { basis: "own-answer", body }, ...(retain ? { retain } : {}) });
    driving = kind;
    await evictDurableObject(object);
    await surface.effect();
    driving = "none";
  };
  expect(await surface.deliver({ to: birth.asked.to, from: factRefOf(birth.source), n: 0, message: birth.asked.message })).toMatchObject({ answer: "recorded" });
  const genesis = (await history())[0]!.entry, destination = genesis.at;
  const returned = genesis.sends.find(send => send.message.class === "result")!;
  if (returned.message.class !== "result") throw Error("Native birth returned no result");
  const confirm = { class: "control", type: "confirm", genesis: factRefOf(genesis) } as const;
  const confirmation = { ...handMade(birth.directory, "confirm", [{ n: 0, to: destination, message: confirm }]), input: { type: "delivery", from: factRefOf(genesis), n: returned.n, message: returned.message, clause: "applied" } as const };
  remember(confirmation, "platform:directory");
  expect(await surface.deliver({ to: destination, from: factRefOf(confirmation), n: 0, message: confirm })).toMatchObject({ answer: "recorded" });
  const adopt = await stubOf(name).submit(await room.M.intent(rita, "adopt-head", { to: destination, on: 0, expected: { on: 1 }, fields: { commit: HEAD, why: "scripted host base" } }), []);
  expect(adopt.answer).toBe("accepted");
  const adoptSeq = (await history()).at(-1)!.entry.seq;
  await drive("adopt-read", `${adoptSeq}:0`, { seen: HEAD });

  // Immutable source affiliation is complete but explicitly scripted.
  const creator = handMade(birth.directory, "open-pr", [], keys.rita, { definition: PUBLISHING_LANE_DIGESTS[0] });
  if (creator.input.type !== "act") throw Error("Scripted creator is an act");
  const seed: Seed = { v: 1, kind: "lane", definition: PUBLISHING_LANE_DIGESTS[0], creator: birth.directory, cause: intentDigest(creator.input.signed.intent), ordinal: 0 };
  const lane: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(83)), kind: "lane" };
  const creation: Request = { class: "request", type: "create", body: { kind: "open", directory: birth.directory as unknown as FieldValue, fields: { destination: destination as unknown as FieldValue } } };
  const maker = { ...creator, sends: [{ n: 0, to: seed, message: creation }] };
  const sourceGenesis: Entry = { ...handMade(lane, "unused"), seq: 0, prev: null, input: { type: "genesis", seed, inc: lane.inc, founding: null, source: factRefOf(maker), n: 0, message: creation, kind: "open", decision: "applied" }, effects: [], sends: [] };
  const origin: Fetched[] = [{ fact: factRefOf(sourceGenesis), entry: sourceGenesis, under: "change" }, { fact: factRefOf(maker), entry: maker, under: "platform:directory" }];
  const content = "D1 native standing witness\n", manifest = handMade(lane, "propose-file", [], una, { path: "standing.md", content, size: utf8(content).length, digest: digestBytes(utf8(content)), base: HEAD });
  const reserve: Request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest) as unknown as FieldValue, verdicts: [], jobs: [], links: [], reports: [] } } };
  const merge = handMade(lane, "merge", [{ n: 0, to: destination, message: reserve }], una, { manifest: manifest.seq });
  remember(manifest, "change", origin); remember(merge, "change", origin);
  expect(await surface.deliver({ to: destination, from: factRefOf(merge), n: 0, message: reserve })).toMatchObject({ answer: "recorded" });
  const publication = (await history()).at(-1)!.entry.seq;
  const changes = { paths: ["standing.md"], links: [], unreadable: 0 }, changed = valueDigest("artroom-changed-set-1", changes);
  await drive("judge", `${publication}:0`, { head: HEAD, present: true, tree: "d".repeat(40), firstParent: HEAD, ancestors: [], changes: changed }, [{ kind: "value", domain: "artroom-changed-set-1", digest: changed, bytes: canonicalize(changes) }]);
  const reserved = await snapshot();
  const summary = await stubOf(name).summary(reader);
  expect(summary.ok).toBe(true);
  if (!summary.ok) throw Error("Native D1 summary unavailable");
  expect(summary.value.reservationExpiry).toBeDefined();
  expect(reserved.items.find(item => item.id === publication)?.state, JSON.stringify({ sent: sent.map(request => [request.kind, request.operation]), keyReads, operations: reserved.operations, last: (await history()).at(-1)?.entry.input.type })).toBe("reserved");
  const mint = reserved.operations.find(operation => operation.kind === "mint" && operation.for === publication)!;
  expect(mint).toBeDefined();
  const capacity = await runInDurableObject(object, (_instance, state) => {
    const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
    const scope = store.scope()!, last = JSON.parse(store.stored(scope.head.seq)!.bytes) as Entry;
    return { written: scope.head.seq + 1, reserved: owed(store, journey.definition, last.input) };
  });
  control.bounds = { ...control.bounds, scopeEntries: capacity.written + capacity.reserved };
  await evictDurableObject(object);
  const beforeFull = await snapshot();
  expect(await stubOf(name).submit(await room.M.intent(rita, "add-branch-room", { to: destination, on: 0, expected: { on: beforeFull.items.find(item => item.id === 0)!.revision } }), [])).toMatchObject({ answer: "refused", reason: "scope-full" });
  expect(await snapshot()).toEqual(beforeFull);
  let rootBefore: readonly Sealed[] = [];
  if (fullRoot) {
    // Actual legacy root + membership; the extra @5 child creation above
    // is still scripted, not a new directory cohort or partition rollout.
    const checked = validateDefinition(platform((await fullRoot.D.summary()).value.definition)!.data, PROPOSED_BOUNDS, PROFILES, { platform: true });
    if (!checked.ok) throw Error("Native root definition unavailable");
    const limit = await runInDurableObject(fullRoot.D.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
      const scope = store.scope()!, last = JSON.parse(store.stored(scope.head.seq)!.bytes) as Entry;
      return scope.head.seq + 1 + owed(store, checked.definition, last.input);
    });
    net.sized.set(fullRoot.D.name, { ...net.bounds, scopeEntries: limit });
    onTestFinished(() => { net.sized.delete(fullRoot.D.name); });
    await fullRoot.D.restart();
    rootBefore = await fullRoot.D.sealed();
  }
  // The real revocation is recorded while its creator cannot relay it.
  const revocationSeq = seen === "active" ? null : await room.M.did(rita, "revoke-key", { on: room.unasKey, expected: await room.M.expected({ on: room.unasKey, member: room.una, roster: 0 }), fields: { as: "compromised" } });
  if (fullRoot) {
    const revocation = (await room.M.entries())[revocationSeq!]!;
    const relay = revocation.sends.find(send => send.message.class === "request" && send.message.type === "tell" && isRecord(send.message.body) && send.message.body["message"] === "compromised")!;
    expect(relay.to).toEqual(await fullRoot.D.at());
    expect(await fullRoot.D.stub.deliver({ to: relay.to, from: factRefOf(revocation), n: relay.n, message: relay.message })).toMatchObject({ answer: "retry", reason: "scope-full" });
    expect(await fullRoot.D.sealed()).toEqual(rootBefore);
  }
  expect((await room.M.stub.outbox(reader)).ok).toBe(true);
  keyReads = [];
  unreadable = seen === "unavailable";
  await drive("mint", mint.id, { token: "native-scripted-mint", ends: timeOf(timeMs(control.clock.now)! + 60_000) });
  if (unreadable) {
    const waiting = await snapshot();
    expect(waiting.items.find(item => item.id === publication)).toMatchObject({ state: "reserved", values: { aborting: false, token: null } });
    expect(waiting.operations.find(operation => operation.id === mint.id)?.attempts[0]?.outcomes).toEqual([]);
    expect(replies.has(mint.id)).toBe(true);
    expect(sent.filter(request => request.operation === mint.id)).toHaveLength(1);
    unreadable = false; keyReads = [];
    await evictDurableObject(object);
    await surface.effect(); // retained own reply; mint is never sent again
    expect(sent.filter(request => request.operation === mint.id)).toHaveLength(1);
  }
  const aborted = await snapshot(), item = aborted.items.find(item => item.id === publication)!;
  expect(keyReads).toEqual([una.key]);
  if (seen === "active") {
    expect(item).toMatchObject({ state: "publishing", values: { aborting: false, token: mint.id } });
    expect(aborted.operations.filter(operation => operation.for === publication && ["revoke", "read"].includes(operation.kind))).toEqual([]);
    expect(replies.has(mint.id)).toBe(false);
    const message: Request = { class: "request", type: "tell", body: { message: "publish-file", fields: { path: "unproven.md", content: "Unproven application" } } };
    const unproven = handMade(lane, "donate", [{ n: 0, to: destination, message }]);
    remember(unproven, "lending"); // deliberately lacks immutable factory proof
    expect(await surface.deliver({ to: destination, from: factRefOf(unproven), n: 0, message })).toMatchObject({ answer: "retry", reason: "dependency-unavailable" });
    expect(await snapshot()).toEqual(aborted);
    await evictDurableObject(object);
    expect(await snapshot()).toEqual(aborted);
    return;
  }
  expect(item).toMatchObject({ state: "reserved", values: { aborting: true, token: null } });
  expect(aborted.operations.filter(operation => operation.for === publication && ["revoke", "read"].includes(operation.kind)).map(operation => operation.kind)).toEqual(["revoke", "read"]);
  expect(sent.filter(request => request.kind === "push")).toEqual([]);
  const recorded: Sealed = (await history()).at(-1)!;
  expect(recorded.entry.input).toMatchObject({ type: "outcome", operation: mint.id, observed: [{ observation: { key: una.key, keyState: "compromised", of: membership }, use: "fresh" }] });
  await evictDurableObject(object);
  expect(await snapshot()).toEqual(aborted);
  const revoke = aborted.operations.find(operation => operation.for === publication && operation.kind === "revoke")!;
  const read = aborted.operations.find(operation => operation.for === publication && operation.kind === "read")!;
  const holder = aborted.holders!.find(holder => holder.item === publication)!;
  expect(holder.held.operations).toMatchObject({ read: 3, revoke: 9 });
  keyReads = [];
  await drive("revoke", revoke.id, { token: "native-scripted-mint" });
  const integration = item.values["integration"]!;
  await drive("read", read.id, { seen: seen === "effective" ? integration : "absent" });
  const decided = await snapshot();
  expect(decided.items.find(item => item.id === publication)?.state).toBe(seen === "effective" ? "published" : "unresolved");
  expect(keyReads).toEqual([]);
  expect(sent.filter(request => request.kind === "push")).toEqual([]);
  await evictDurableObject(object);
  expect(await snapshot()).toEqual(decided);
}, 30_000);
