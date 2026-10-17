import { runInDurableObject } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { ReceiverReads } from "../../../../packages/scope/src/receiver-reads.ts";
import { ReadPreparation } from "../../../../packages/scope/src/read-preparation.ts";
import { expect, test } from "vitest";
import type { Seed } from "@generalbusiness/dap-contract";
import { canonicalize, factRefOf, scopeIdOf, seedDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C, partitionSourceName, partitionReceiverPolicy, partitionDeclaredCreationPolicy, platform } from "@generalbusiness/dap-platform";
import { proofEntry, PROOF_BYTE_BOUNDS } from "../../../../packages/scope/src/proof-bytes.ts";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { env } from "cloudflare:workers";
import { PartitionProofOperation } from "../../../../packages/scope/src/partition-proof.ts";
import { sessionRoom, sessionRepository } from "../../../../packages/scope/test/support/session-room.ts";
import { dispatchFixture } from "../../../../packages/scope/test/support/native-fixture-lifetime.ts";
import { httpSource, verify, type HistorySource } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { routed, rita, type Platform } from "../../../../packages/scope/test/repository.ts";
import { reader } from "../../../../packages/scope/test/support.ts";
import { DIGESTS, issue } from "../src/index.ts";

// Actual pinned issue code, native factories, Authority, SQLite and act
// judgment. sessionRoom's Git host, clock, finite scheduler and inspected
// setup reads are stand-ins. No publication, hosted capacity or replay claim.
test("partition issue facts and bounded concern births use receiver lineage while producer identities stay declared", async () => {
  const { life, D, children } = await sessionRoom(C.register);
  try {
    const [M, rules] = children;
    const seated = await M!.did(rita, "seat", { expected: await M!.expected({ roster: 0 }) });
    await M!.did(rita, "first-key", { fields: { member: seated }, expected: await M!.expected({ roster: 0, member: seated }) });
    const bytes = canonicalize(issue);
    expect(await rules!.stub.submit(await rules!.intent(rita, "activate", { fields: { digest: DIGESTS.issue, name: issue.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    const opening = await D.did(rita, "open-partition", { expected: await D.expected({ repository: 0 }) });
    const create = (await D.entries())[opening]!.sends.find(send => (send.to as Seed).definition === C.partition);
    if (!create) return expect.fail("actual root emitted no partition create");
    const P = life.platform(scopeIdOf(create.to as Seed));
    await dispatchFixture([D, P, ...children], life.wait);
    const lanes: Platform[] = [];
    for (const title of ["First issue", "Second issue"]) {
      const opened = await P.stub.submit(await P.intent(rita, "open-issue", { expected: await P.expected({ repository: 0 }), fields: { definition: DIGESTS.issue, title, conditions: ["Keep the existing behavior"] } }), [], { values: [bytes] });
      expect(opened).toMatchObject({ answer: "accepted" });
      if (opened.answer !== "accepted") return;
      const entry = (await P.entries())[opened.receipt.fact.seq]!;
      const send = entry.sends.find(send => (send.to as Seed).kind === "lane");
      if (!send) return expect.fail("actual partition emitted no issue create");
      const lane = life.platform(scopeIdOf(send.to as Seed));
      await dispatchFixture([P, lane, ...children], life.wait);
      expect((await lane.summary()).value.status, canonicalize((await lane.entries())[0])).toBe("active");
      lanes.push(lane);
    }
    // An invalid domain value still writes the real child's refused genesis.
    // Its result must settle the parent, without conferring any issue role.
    const refusedOpening = await P.stub.submit(await P.intent(rita, "open-issue", { expected: await P.expected({ repository: 0 }), fields: { definition: DIGESTS.issue, title: "Refused issue", conditions: [] } }), [], { values: [bytes] });
    expect(refusedOpening).toMatchObject({ answer: "accepted" });
    if (refusedOpening.answer !== "accepted") return;
    const refusedCreate = (await P.entries())[refusedOpening.receipt.fact.seq]!.sends.find(send => (send.to as Seed).kind === "lane");
    if (!refusedCreate) return expect.fail("actual refused issue has no create");
    const refused = life.platform(scopeIdOf(refusedCreate.to as Seed));
    life.setHold(envelope => envelope.from.at.scope === refused.name && envelope.message.class === "result");
    await dispatchFixture([P, refused, ...children], life.wait);
    await P.restart();
    life.setHold(() => false);
    life.advance(PROPOSED_BOUNDS.dispatchRetryMaxSeconds * 1000 + 1);
    await dispatchFixture([P, refused, ...children], life.wait);
    expect((await refused.entries())[0]!.input).toMatchObject({ type: "genesis", decision: "refused" });
    expect((await P.entries()).some(entry => entry.input.type === "delivery" && entry.input.message.class === "result" && entry.input.message.of.from.hash === refusedOpening.receipt.fact.hash && entry.input.message.outcome === "refused")).toBe(true);
    expect((await P.item(refusedOpening.receipt.fact.seq)).refs["scope"] ?? null).toBeNull();
    expect(await refused.stub.outbox(reader)).toMatchObject({ ok: true, value: [{ duty: "0.0", acknowledged: { at: await P.at() } }] });
    const refusedAt = await refused.at(), birth = await namespace(env.PLATFORM).births.read(refusedAt, 10000);
    const raw = birth && proofEntry(birth.proof, birth.proof.fact, PROOF_BYTE_BOUNDS.body);
    expect(raw?.input).toMatchObject({ type: "genesis", decision: "refused" });
    if (!birth || !raw) return expect.fail("refused immutable birth is unavailable");
    const frame = { fact: birth.proof.fact, entry: raw, named: birth.named, declarationName: birth.declarationName, native: birth.native };
    expect(partitionReceiverPolicy(refusedAt, [frame])).toBeNull();
    expect(partitionSourceName(DIGESTS.issue, issue.name, refusedAt, [frame])).toBe("declared:issue");
    const receiver = await ReceiverReads.open(namespace(env.PLATFORM), await P.at());
    expect(receiver).not.toBeNull();
    expect(await receiver!.read(frame.fact, 10)).toBeNull();
    if (raw.input.type !== "genesis") return expect.fail("refused source is not genesis");
    const fakeSeed: Seed = { v: 1, kind: "lane", definition: DIGESTS.issue, creator: refusedAt, cause: seedDigest(raw.input.seed), ordinal: 0 };
    expect(partitionDeclaredCreationPolicy({ seed: fakeSeed, source: frame.fact, n: 0, message: { class: "request", type: "create", body: { directory: await P.at(), membership: await M!.at(), fields: { title: "No positive birth" } } } }, issue, [frame])).toBeNull();
    const valid = validateDefinition(issue, PROPOSED_BOUNDS);
    if (!valid.ok) return expect.fail("actual issue definition did not validate");
    await runInDurableObject(refused.object, (_instance, state) => {
      const loader = new ReadPreparation({ exec: (query, ...args) => state.storage.sql.exec(query, ...args) }, { policy: () => "refused-native-witness", declared: () => valid.definition, platform: () => null });
      expect(loader.birth()).not.toBeNull();
      expect(loader.capture() === null).toBe(true);
    });
    const [A, B] = lanes as [Platform, Platform];
    const asked = await A.did(rita, "ask", { fields: { addressee: { membership: await M!.at(), member: "@rita" }, question: "Can this concern proceed?" } });
    const foreign = factRefOf((await A.entries())[asked]!);
    expect(await namespace(env.PLATFORM).resolver.read(foreign, 10)).toMatchObject({ under: "declared:issue" });
    const offer = await B.did(rita, "offer", { expected: await B.expected({ goal: 0 }) });
    await B.did(rita, "accept", { on: offer, expected: await B.expected({ on: offer }), fields: { terms: factRefOf((await B.entries())[0]!) } });
    const blocked = await B.act(rita, "block", { expected: await B.expected({ commitment: offer }), fields: { commitment: offer, on: foreign } });
    expect(blocked).toMatchObject({ answer: "accepted" });
    if (blocked.answer !== "accepted") return;
    const blockedEntry = (await B.entries())[blocked.receipt.fact.seq]!, use = blockedEntry.uses.find(use => use.fact.hash === foreign.hash);
    if (!use) return expect.fail("accepted native block retained no foreign ask");
    expect(await B.stub.retained(reader, "entry", use.content)).toMatchObject({ ok: true, value: { under: "declared:issue", bytes: canonicalize((await A.entries())[asked]!) } });
    expect((await B.item(blocked.receipt.fact.seq)).refs["on"]).toEqual(foreign);
    await B.restart();
    const answered = await A.did(rita, "answer", { on: asked, expected: await A.expected({ on: asked }), fields: { answer: "Yes" } });
    const answer = factRefOf((await A.entries())[answered]!);
    expect(await B.act(rita, "release-block", { on: blocked.receipt.fact.seq, expected: await B.expected({ on: blocked.receipt.fact.seq, commitment: offer }), fields: { commitment: offer, answer } })).toMatchObject({ answer: "accepted" });
    expect(await namespace(env.PLATFORM).resolver.read(foreign, 10)).toMatchObject({ under: "declared:issue" });
    let parent = A;
    const nodes = [D, P, ...children, A, B];
    for (let depth = 1; depth <= 4; depth++) {
      const plan = await parent.did(rita, "open-plan", { expected: await parent.expected({ goal: 0 }) });
      const concern = await parent.did(rita, "add-concern", { expected: await parent.expected({ plan }), fields: { plan, purpose: "Bounded native lineage", role: "required", title: `Concern ${depth}`, conditions: ["Keep the existing behavior"] } });
      const created = (await parent.entries())[concern]!.sends.find(send => (send.to as Seed).kind === "lane");
      if (!created) return expect.fail("actual concern emitted no child create");
      const child = life.platform(scopeIdOf(created.to as Seed));
      nodes.push(child);
      await dispatchFixture(nodes, life.wait);
      if (depth === 4) {
        expect(await child.stub.history(reader)).toMatchObject({ ok: false, reason: "not-found" });
        expect((await parent.item(concern)).state).toBe("creating");
        break;
      }
      expect((await child.summary()).value.status).toBe("active");
      const birth = (await child.entries())[0]!;
      expect(birth.input).toMatchObject({ type: "genesis", decision: "applied", source: factRefOf((await parent.entries())[concern]!), message: { body: { directory: await P.at(), membership: await M!.at() } } });
      expect(await namespace(env.PLATFORM).resolver.read(factRefOf(birth), 10)).toMatchObject({ under: "declared:issue" });
      expect((await parent.item(concern)).state).toBe("created");
      parent = child;
    }
    // Deep receiver and an unrelated current source share only six base
    // frames. The whole operation is seventeen; each identity view is small.
    const extraAsk = await B.did(rita, "ask", { fields: { addressee: { membership: await M!.at(), member: "@rita" }, question: "A separate lineage" } });
    const combined = new PartitionProofOperation(namespace(env.PLATFORM));
    const deep = await combined.receiver(await parent.at());
    expect(deep?.proof.frames).toHaveLength(14);
    const other = await combined.source(factRefOf((await B.entries())[extraAsk]!));
    expect(other).toMatchObject({ under: "issue", producer: "declared:issue", proof: { calls: 17, reads: 17, totalFrames: 17, pending: 0 } });
    expect(other?.proof.frames).toHaveLength(9);
    const negativeReplay = await verify(httpSource("https://scopes.test", { fetch: routed, reader }), { mode: "replay", scope: P.name, head: (await P.summary()).at, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
    expect(negativeReplay, canonicalize(negativeReplay)).toMatchObject({ report: { result: "consistent" } });
  } finally { life.release(); }
});


async function preparedIssue(life: Awaited<ReturnType<typeof sessionRoom>>["life"], { D, children }: { D: Platform; children: Platform[] }) {
  const [M, rules] = children;
  const seat = await M!.did(rita, "seat", { expected: await M!.expected({ roster: 0 }) });
  await M!.did(rita, "first-key", { fields: { member: seat }, expected: await M!.expected({ roster: 0, member: seat }) });
  const bytes = canonicalize(issue);
  expect(await rules!.stub.submit(await rules!.intent(rita, "activate", { fields: { digest: DIGESTS.issue, name: issue.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
  let P = D;
  const pin = (await D.summary()).value.definition;
  if (pin === C.directory) {
    const opened = await D.did(rita, "open-partition", { expected: await D.expected({ repository: 0 }) });
    const create = (await D.entries())[opened]!.sends.find(send => (send.to as Seed).definition === C.partition);
    if (!create) return expect.fail("actual root emitted no partition");
    P = life.platform(scopeIdOf(create.to as Seed));
    await dispatchFixture([D, P, ...children], life.wait);
  } else expect(pin).toBe("platform:directory@9");
  const openedIssue = await P.stub.submit(await P.intent(rita, "open-issue", { expected: await P.expected({ repository: 0 }), fields: { definition: DIGESTS.issue, title: "Cross-root issue", conditions: ["Keep the existing relationship"] } }), [], { values: [bytes] });
  expect(openedIssue).toMatchObject({ answer: "accepted" });
  if (openedIssue.answer !== "accepted") return expect.fail("actual issue was not opened");
  const send = (await P.entries())[openedIssue.receipt.fact.seq]!.sends.find(send => (send.to as Seed).kind === "lane");
  if (!send) return expect.fail("actual partition emitted no issue");
  const I = life.platform(scopeIdOf(send.to as Seed));
  await dispatchFixture([D, P, I, ...children], life.wait);
  expect((await I.summary()).value.status).toBe("active");
  return { D, P, I, M: M! };
}

// Both repositories and lanes are real and use the same native namespace.
// The shared fixture owns the clock, scheduler, setup inspector and register
// Git stand-in. The counters below forward every actual bounded RPC unchanged.
test("two native partition roots keep cross-room block and restart release with one seventeen-frame admission", async () => {
  const first = await sessionRoom(C.register), { life } = first;
  try {
    const second = await sessionRepository(life, C.register);
    const A = await preparedIssue(life, first), B = await preparedIssue(life, second);
    const asked = await A.I.did(rita, "ask", { fields: { addressee: { membership: await A.M.at(), member: "@rita" }, question: "May another room depend on this answer?" } });
    const foreign = factRefOf((await A.I.entries())[asked]!);
    const offered = await B.I.did(rita, "offer", { expected: await B.I.expected({ goal: 0 }) });
    await B.I.did(rita, "accept", { on: offered, expected: await B.I.expected({ on: offered }), fields: { terms: factRefOf((await B.I.entries())[0]!) } });
    const actual = namespace(env.PLATFORM), calls: string[] = [];
    life.wire(B.I.name, () => ({
      births: { read: (at, ms, max) => { calls.push(`birth:${canonicalize(at)}`); return actual.births.read(at, ms, max); } },
      proofs: { read: (fact, max, ms) => { calls.push(`fact:${canonicalize(fact)}`); return actual.proofs.read(fact, max, ms); } },
    }));
    await B.I.restart();
    calls.length = 0;
    const blocked = await B.I.act(rita, "block", { expected: await B.I.expected({ commitment: offered }), fields: { commitment: offered, on: foreign } });
    expect(blocked).toMatchObject({ answer: "accepted" });
    if (blocked.answer !== "accepted") return;
    expect(calls).toHaveLength(17); expect(new Set(calls).size).toBe(17);
    const entry = (await B.I.entries())[blocked.receipt.fact.seq]!, use = entry.uses.find(use => use.fact.hash === foreign.hash);
    if (!use) return expect.fail("cross-root block retained no source");
    expect(await B.I.stub.retained(reader, "entry", use.content)).toMatchObject({ ok: true, value: { under: "declared:issue" } });
    await B.I.restart();
    const answered = await A.I.did(rita, "answer", { on: asked, expected: await A.I.expected({ on: asked }), fields: { answer: "Yes" } });
    calls.length = 0;
    expect(await B.I.act(rita, "release-block", { on: blocked.receipt.fact.seq, expected: await B.I.expected({ on: blocked.receipt.fact.seq, commitment: offered }), fields: { commitment: offered, answer: factRefOf((await A.I.entries())[answered]!) } })).toMatchObject({ answer: "accepted" });
    expect(calls).toHaveLength(17);
    expect(await actual.resolver.read(foreign, 10)).toMatchObject({ under: "declared:issue" });
    const replayed = await verify(httpSource("https://scopes.test", { fetch: routed, reader }), { mode: "replay", scope: B.I.name, head: (await B.I.summary()).at, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
    expect(replayed, canonicalize(replayed)).toMatchObject({ report: { result: "consistent" } });
    // Only retained metadata is altered by this transport stand-in. Neither
    // native history nor hashed entry bytes change; an alias cannot select
    // receiver meaning or replace the unchanged producer identity.
    const source = httpSource("https://scopes.test", { fetch: routed, reader });
    const wrongAlias: HistorySource = { page: (...args) => source.page(...args), retained: async (...args) => {
      const got = await source.retained(...args);
      return got.ok && args[0] === B.I.name && args[2] === use.content ? { ...got, input: { ...got.input, under: "issue" } } : got;
    } };
    const aliasReplay = await verify(wrongAlias, { mode: "replay", scope: B.I.name, head: (await B.I.summary()).at, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
    expect(aliasReplay).toMatchObject({ report: { result: "mismatch" }, why: "the retained source alias differs from its unchanged producer policy" });
    const roots = await B.D.entries();
    const hiddenRoot: HistorySource = { page: (scope, from, allow) => scope === B.D.name ? Promise.resolve({ ok: false, reason: "native root withheld by fixture" }) : source.page(scope, from, allow), retained: (...args) => source.retained(...args) };
    const anchoredRoot = await verify(hiddenRoot, { mode: "replay", scope: B.I.name, head: (await B.I.summary()).at, platform, grants: "proven", anchors: roots.map(entry => ({ scope: B.D.name, seq: entry.seq, hash: factRefOf(entry).hash })), capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
    expect(anchoredRoot, canonicalize(anchoredRoot)).toMatchObject({ report: { result: "incomplete" } });
    expect(anchoredRoot.report.dependencies.anchored).toBeGreaterThan(0);
    expect(anchoredRoot.report.coverage.some(covered => covered.scope.scope === B.D.name)).toBe(false);
    const deepen = async (room: typeof A) => {
      let current = room.I;
      const nodes = [room.D, room.P, room.M, current];
      for (let depth = 1; depth <= 3; depth++) {
        const plan = await current.did(rita, "open-plan", { expected: await current.expected({ goal: 0 }) });
        const concern = await current.did(rita, "add-concern", { expected: await current.expected({ plan }), fields: { plan, purpose: "Two independent bounded lineages", role: "required", title: `Disjoint concern ${depth}`, conditions: ["Preserve native identity"] } });
        const send = (await current.entries())[concern]!.sends.find(send => (send.to as Seed).kind === "lane");
        if (!send) return expect.fail("native concern emitted no child");
        current = life.platform(scopeIdOf(send.to as Seed)); nodes.push(current);
        await dispatchFixture(nodes, life.wait);
        expect((await current.summary()).value.status).toBe("active");
      }
      return current;
    };
    const deepestA = await deepen(A), deepestB = await deepen(B);
    const deepAsk = await deepestA.did(rita, "ask", { fields: { addressee: { membership: await A.M.at(), member: "@rita" }, question: "Two disjoint depth-four lineages" } });
    const physical: string[] = [], operation = new PartitionProofOperation({
      births: { read: (at, ms, max) => { physical.push(`birth:${canonicalize(at)}`); return actual.births.read(at, ms, max); } },
      proofs: { read: (fact, max, ms) => { physical.push(`fact:${canonicalize(fact)}`); return actual.proofs.read(fact, max, ms); } },
    });
    expect((await operation.receiver(await deepestB.at()))?.proof.frames).toHaveLength(14);
    const separate = await operation.source(factRefOf((await deepestA.entries())[deepAsk]!));
    expect(separate).toMatchObject({ under: "issue", producer: "declared:issue", proof: { calls: 29, reads: 29, totalFrames: 29, pending: 0 } });
    expect(separate?.proof.frames).toHaveLength(15);
    expect(physical).toHaveLength(29); expect(new Set(physical).size).toBe(29);
    const deepOffer = await deepestB.did(rita, "offer", { expected: await deepestB.expected({ goal: 0 }) });
    await deepestB.did(rita, "accept", { on: deepOffer, expected: await deepestB.expected({ on: deepOffer }), fields: { terms: factRefOf((await deepestB.entries())[0]!) } });
    life.wire(deepestB.name, () => ({
      births: { read: (at, ms, max) => { physical.push(`birth:${canonicalize(at)}`); return actual.births.read(at, ms, max); } },
      proofs: { read: (fact, max, ms) => { physical.push(`fact:${canonicalize(fact)}`); return actual.proofs.read(fact, max, ms); } },
    }));
    await deepestB.restart(); physical.length = 0;
    expect(await deepestB.act(rita, "block", { expected: await deepestB.expected({ commitment: deepOffer }), fields: { commitment: deepOffer, on: factRefOf((await deepestA.entries())[deepAsk]!) } })).toMatchObject({ answer: "accepted" });
    expect(physical).toHaveLength(29); expect(new Set(physical).size).toBe(29);
    const deepReplay = await verify(httpSource("https://scopes.test", { fetch: routed, reader }), { mode: "replay", scope: deepestB.name, head: (await deepestB.summary()).at, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
    expect(deepReplay, canonicalize(deepReplay)).toMatchObject({ report: { result: "consistent" } });
  } finally { life.release(); }
// This owns two repositories, six concern creates and several full causal
// replays. Its fixture deadline is separate from each ten-second admission.
}, 60_000);


test("mixed native cohorts keep old receiver meaning and replay each target from its own pin", async () => {
  const current = await sessionRoom(C.register), { life } = current;
  try {
    const previous = await sessionRepository(life, "platform:register@10");
    const fresh = await preparedIssue(life, current), old = await preparedIssue(life, previous);
    const ask = async (room: typeof fresh) => {
      const seq = await room.I.did(rita, "ask", { fields: { addressee: { membership: await room.M.at(), member: "@rita" }, question: "Mixed native cohorts" } });
      return factRefOf((await room.I.entries())[seq]!);
    };
    const freshFact = await ask(fresh), oldFact = await ask(old);
    const ready = async (room: typeof fresh) => {
      const offer = await room.I.did(rita, "offer", { expected: await room.I.expected({ goal: 0 }) });
      await room.I.did(rita, "accept", { on: offer, expected: await room.I.expected({ on: offer }), fields: { terms: factRefOf((await room.I.entries())[0]!) } });
      return offer;
    };
    const freshOffer = await ready(fresh), oldOffer = await ready(old);
    const raw = namespace(env.PLATFORM);
    expect(await raw.resolver.read(freshFact, 10)).toMatchObject({ under: "declared:issue" });
    expect(await raw.resolver.read(oldFact, 10)).toMatchObject({ under: "issue" });
    const freshReader = await ReceiverReads.open(raw, await fresh.I.at()), oldReader = await ReceiverReads.open(raw, await old.I.at());
    expect(freshReader?.mode).toBe("partition-v1"); expect(oldReader?.mode).toBe("legacy");
    expect(await freshReader!.read(oldFact, 10)).toMatchObject({ under: "issue" });
    expect(await oldReader!.read(freshFact, 10)).toMatchObject({ under: "declared:issue" });
    expect(await fresh.I.act(rita, "block", { expected: await fresh.I.expected({ commitment: freshOffer }), fields: { commitment: freshOffer, on: oldFact } })).toMatchObject({ answer: "accepted" });
    const denied = await old.I.act(rita, "block", { expected: await old.I.expected({ commitment: oldOffer }), fields: { commitment: oldOffer, on: freshFact } });
    expect(denied, canonicalize(denied)).toMatchObject({ answer: "refused" });
    // Starting at either cohort loads native code in a different order. The
    // same pure identity capability is available beside every supplied pin;
    // the actual receiving birth, not that order, selects its interpretation.
    for (const node of [old.I, fresh.I]) {
      const replayed = await verify(httpSource("https://scopes.test", { fetch: routed, reader }), { mode: "replay", scope: node.name, head: (await node.summary()).at, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE });
      expect(replayed, canonicalize(replayed)).toMatchObject({ report: { result: "consistent" } });
    }
  } finally { life.release(); }
});


// A native residency exercise. Only a local inspector may set pause/release;
// ordinary runs keep three short checkpoints without an attached inspector.
// Heap samples are diagnostic observations, not a worst-case heap bound.
test("native raw proof residency stays at thirty-two dense frames with one physical read", async () => {
  type MemoryMarker = { phase: string; pause: boolean; resume: boolean; live: unknown; summary?: Record<string, number> };
  const diagnostic = globalThis as typeof globalThis & { __ARTROOM_PARTITION_MEMORY__?: MemoryMarker };
  const marker: MemoryMarker = { phase: "setup", pause: false, resume: false, live: null };
  diagnostic.__ARTROOM_PARTITION_MEMORY__ = marker;
  const checkpoint = async (phase: string) => {
    marker.phase = phase; marker.resume = false;
    await new Promise(resolve => setTimeout(resolve, 100));
    if (marker.pause) {
      for (let n = 0; n < 50 && !marker.resume; n++) await new Promise(resolve => setTimeout(resolve, 100));
      if (!marker.resume) throw new Error("local memory inspector did not release its checkpoint");
    }
  };
  const room = await sessionRoom(C.register), { life } = room;
  try {
    const { P } = await preparedIssue(life, room), facts = [];
    const conditions = Array.from({ length: 16 }, () => "z".repeat(4096));
    let expectedBytes = 0;
    for (let n = 0; n < 33; n++) {
      const accepted = await P.stub.submit(await P.intent(rita, "open-issue", { expected: await P.expected({ repository: 0 }), fields: { definition: DIGESTS.issue, title: `Dense proof ${n}`, conditions } }), [], { values: [canonicalize(issue)] });
      expect(accepted).toMatchObject({ answer: "accepted" });
      if (accepted.answer !== "accepted") return;
      const created = await P.stub.entry(reader, accepted.receipt.fact.seq);
      if (!created.ok) return expect.fail("native dense creation entry is unavailable");
      const send = created.value.entry.sends.find(send => (send.to as Seed).kind === "lane");
      if (!send) return expect.fail("native dense issue has no creation");
      const I = life.platform(scopeIdOf(send.to as Seed));
      await dispatchFixture([P, I, ...room.children], life.wait);
      const birth = (await I.entries())[0]!;
      expect(birth.input).toMatchObject({ type: "genesis", decision: "applied" });
      const bytes = utf8(canonicalize(birth)).length;
      expect(bytes).toBeGreaterThan(128 * 1024); expect(bytes).toBeLessThan(256 * 1024);
      if (n < 32) expectedBytes += bytes;
      facts.push(factRefOf(birth));
    }
    const actual = namespace(env.PLATFORM); let physical = 0, pending = 0, peak = 0;
    let operation: PartitionProofOperation | null = new PartitionProofOperation({
      births: { read: async (at, ms, max) => {
        physical++; pending++; peak = Math.max(peak, pending);
        try { return await actual.births.read(at, ms, max); } finally { pending--; }
      } }, proofs: actual.proofs,
    });
    marker.live = operation; await checkpoint("before");
    const got = await Promise.all(facts.slice(0, 32).map(fact => operation!.raw(fact).then(frame => frame?.fact.hash === fact.hash)));
    expect(got.every(Boolean)).toBe(true);
    expect(operation.stats()).toMatchObject({ calls: 32, reads: 32, totalFrames: 32, actualBytes: expectedBytes, pending: 0 });
    expect(physical).toBe(32); expect(peak).toBe(1);
    expect(expectedBytes).toBeGreaterThan(4 * 1024 * 1024);
    expect(await operation.raw(facts[32]!)).toBeNull(); expect(physical).toBe(32);
    marker.summary = { ...operation.stats(), physical, peak };
    await checkpoint("collected");
    marker.live = null; operation = null;
    await checkpoint("released");
  } finally { delete diagnostic.__ARTROOM_PARTITION_MEMORY__; life.release(); }
}, 60_000);
