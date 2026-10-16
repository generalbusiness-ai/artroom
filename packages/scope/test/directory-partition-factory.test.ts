import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Seed } from "@generalbusiness/dap-contract";
import { canonicalize, factRefOf, isPlatformDefinition, platformName, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C, partitionReceiverPolicy, type PartitionNativeFrame } from "@generalbusiness/dap-platform";
import { applicationPublicationOrigin } from "@generalbusiness/dap-platform";
import { recordedMembership, recordedRules } from "../src/authority.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { namespace } from "../src/namespace.ts";
import { partitionProof, receiverPolicyProof, partitionCreationProof } from "../src/partition-proof.ts";
import { PROOF_BYTE_BOUNDS, proofEntry } from "../src/proof-bytes.ts";
import { partitionApplicationPublicationOrigin } from "../../platform/src/partition-provenance.ts";
import { counting } from "../../../apps/counter/definition.ts";
import { COUNTING_DEFINITION } from "../../../apps/counter/pin.ts";
import { rita, una } from "./repository.ts";
import { sessionRoom } from "./support/session-room.ts";
import { dispatchFixture } from "./support/native-fixture-lifetime.ts";

// Actual register11/root10/M6/R3/D6/partition1 scopes, production Authority,
// data, rules, SQLite, dispatch and restart. Existing sessionRoom's register
// Git host, clock, scheduler and inspected setup reads are labelled stand-ins.
// Counting is created natively; its controller/Initialize flow is not run.
// No new receiver identity policy or provider/deployment claim yet.
test("native root creates its partition with exact confirmed refs and real membership authority survives the partition restart", async () => {
  const room = await sessionRoom(C.register), { life, D, children } = room;
  try {
    const [M, rules, destination] = children;
    expect((await D.summary()).value).toMatchObject({ definition: C.directory, status: "active" });
    expect(await Promise.all(children.map(async child => (await child.summary()).value.definition))).toEqual([C.membership, C.rules, C.destination]);
    const seat = await M!.did(rita, "seat", { expected: await M!.expected({ roster: 0 }) });
    await M!.did(rita, "first-key", { fields: { member: seat }, expected: await M!.expected({ roster: 0, member: seat }) });
    const inboxCreate = (await M!.entries())[seat]!.sends.find(send => (send.to as Seed).kind === "inbox");
    if (!inboxCreate) return expect.fail("native seated member has no inbox create");
    const inbox = life.platform(scopeIdOf(inboxCreate.to as Seed));
    await dispatchFixture([M!, inbox], life.wait);
    const refs = { root: await D.at(), membership: await M!.at(), rules: await rules!.at(), destination: await destination!.at() };
    const standing = await M!.stub.observe({ of: refs.membership, key: rita.key });
    expect(standing).toMatchObject({ keyState: "active", memberState: "active", actions: expect.arrayContaining(["issue.open"]) });
    const before = (await D.summary()).at;
    expect(await D.act(una, "open-partition", { expected: await D.expected({ repository: 0 }) })).toMatchObject({ answer: "refused", reason: "unauthorized" });
    expect((await D.summary()).at).toEqual(before);
    const opened = await D.did(rita, "open-partition", { expected: await D.expected({ repository: 0 }) });
    const creating = (await D.entries())[opened]!, send = creating.sends.find(row => (row.to as Seed).definition === C.partition);
    if (!send) return expect.fail("native root opening emitted no partition create");
    const P = life.platform(scopeIdOf(send.to as Seed));
    // The receiver is still empty: this checks the actual native Root send,
    // not a retained Part genesis or a supplied directory hint.
    if (send.message.class !== "request") return expect.fail("partition creation is not a request");
    const partitionCreate = { seed: send.to as Seed, source: factRefOf(creating), n: send.n, message: send.message };
    const bootstrap = await life.wait(() => partitionCreationProof(namespace(env.PLATFORM), partitionCreate));
    expect(bootstrap?.policy).toMatchObject({ mode: "partition-v1", root: refs.root, creation: partitionCreate });
    expect(bootstrap?.proof.calls).toBe(5);
    expect(bootstrap?.proof.frames).toHaveLength(5);
    expect(bootstrap?.proof.frames.some(frame => frame.fact.at.scope === scopeIdOf(partitionCreate.seed))).toBe(false);
    expect(await life.wait(() => partitionCreationProof(namespace(env.PLATFORM), { ...partitionCreate, n: send.n + 100 }))).toBeNull();
    await dispatchFixture([D, P, ...children], life.wait);
    expect((await P.summary()).value).toMatchObject({ definition: C.partition, status: "active" });
    expect(await P.item(0)).toMatchObject({ state: "open", refs, values: { generation: 1, base: 1, lastNumber: 0, sealed: false } });
    expect((await D.item(opened)).refs["scope"]).toEqual(await P.at());
    await P.restart();
    const recorded = await life.wait(() => runInDurableObject(P.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
      const scope = store.scope()!, first = JSON.parse(store.stored(0)!.bytes);
      return { membership: recordedMembership({ genesis: () => first.input, state: store }, scope.at), rules: recordedRules({ genesis: () => first.input, state: store }) };
    }));
    expect(recorded).toEqual({ membership: refs.membership, rules: refs.rules });
    expect(await P.act(una, "seal", { on: 0, expected: await P.expected({ on: 0 }) })).toMatchObject({ answer: "refused", reason: "unauthorized" });
    expect(await P.act(rita, "seal", { on: 0, expected: await P.expected({ on: 0 }) })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "partition-not-full" });
    const bytes = canonicalize(counting);
    expect(await rules!.stub.submit(await rules!.intent(rita, "activate", { fields: { digest: COUNTING_DEFINITION, name: counting.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    const ask = await P.intent(rita, "establish-application", { expected: await P.expected({ repository: 0 }), fields: { definition: COUNTING_DEFINITION, values: '{"target":7}', execution: "recorded-do" } });
    const accepted = await P.stub.submit(ask, [], { values: [bytes] });
    expect(accepted).toMatchObject({ answer: "accepted" });
    if (accepted.answer !== "accepted") return;
    const creation = (await P.entries())[accepted.receipt.fact.seq]!, create = creation.sends.find(row => row.message.class === "request" && row.message.type === "create");
    if (!create) return expect.fail("native partition emitted no application create");
    const A = life.platform(scopeIdOf(create.to as Seed));
    await dispatchFixture([P, A, ...children], life.wait);
    const genesis = (await A.entries())[0]!;
    expect((await A.summary()).value).toMatchObject({ definition: COUNTING_DEFINITION, status: "active" });
    const proof = await life.wait(() => partitionProof(namespace(env.PLATFORM), factRefOf(genesis)));
    expect(proof).toMatchObject({ calls: 8, reservedBytes: 8 * 1024 * 1024 });
    expect(proof?.frames).toHaveLength(8);
    for (const node of [D, P, ...children, A]) {
      expect(partitionReceiverPolicy(await node.at(), proof!.frames)).toMatchObject({ mode: "partition-v1", lineage: { at: await node.at(), root: refs.root } });
      const at = await node.at(), selected = await life.wait(() => receiverPolicyProof(namespace(env.PLATFORM), at));
      expect(selected?.policy).toMatchObject({ mode: "partition-v1", lineage: { at, root: refs.root } });
      expect(selected?.proof.calls).toBeLessThanOrEqual(8);
    }
    const inboxAt = await inbox.at(), inboxPolicy = await life.wait(() => receiverPolicyProof(namespace(env.PLATFORM), inboxAt));
    const inboxBirth = await life.wait(() => namespace(env.PLATFORM).births.read(inboxAt, 10000));
    const inboxEntry = inboxBirth && proofEntry(inboxBirth.proof, inboxBirth.proof.fact, PROOF_BYTE_BOUNDS.body);
    expect(inboxEntry?.input.type === "genesis" ? inboxEntry.input.message?.body : null).toMatchObject({ membership: refs.membership, fields: { membership: refs.membership } });
    expect(inboxPolicy?.policy).toMatchObject({ mode: "partition-v1", lineage: { at: inboxAt, root: refs.root } });
    expect(inboxPolicy?.proof.calls).toBe(4);
    const frames = proof!.frames.map(frame => ({ fact: frame.fact, entry: frame.entry, under: isPlatformDefinition(frame.named) ? platformName(frame.named) : frame.declarationName }));
    expect(partitionApplicationPublicationOrigin(factRefOf(genesis), refs.root, refs.destination, frames)).toBe(true);
    expect(applicationPublicationOrigin(factRefOf(genesis), refs.root, refs.destination, frames)).toBe(false);
    const confirmed = (await A.entries()).at(-1)!;
    expect(confirmed.seq).toBeGreaterThan(0);
    const current = await life.wait(() => partitionProof(namespace(env.PLATFORM), factRefOf(confirmed)));
    expect(current?.source.fact).toEqual(factRefOf(confirmed));
    expect(current?.frames).toHaveLength(8); expect(current?.calls).toBe(9);
  } finally { life.release(); }
});

test("the shared membership6 pin keeps legacy receiver policy when its actual native parent is directory9", async () => {
  const { life, D, children } = await sessionRoom("platform:register@10");
  try {
    const M = children[0]!, frames: PartitionNativeFrame[] = [];
    const births = namespace(env.PLATFORM).births;
    for (const node of [D, M]) {
      const at = await node.at(), birth = await life.wait(() => births.read(at, 10000));
      if (!birth) return expect.fail("actual legacy native birth unavailable");
      const entry = proofEntry(birth.proof, birth.proof.fact, PROOF_BYTE_BOUNDS.body);
      if (!entry) return expect.fail("actual native birth does not verify");
      frames.push({ fact: birth.proof.fact, entry, named: birth.named, declarationName: birth.declarationName, native: birth.native });
    }
    expect((await M.summary()).value.definition).toBe(C.membership);
    expect(partitionReceiverPolicy(await M.at(), frames)).toEqual({ mode: "legacy" });
    const at = await M.at(), selected = await life.wait(() => receiverPolicyProof(namespace(env.PLATFORM), at));
    expect(selected?.policy).toEqual({ mode: "legacy" }); expect(selected?.proof.calls).toBe(2);
    const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
    const create = (await M.entries())[seat]!.sends.find(send => (send.to as Seed).kind === "inbox");
    if (!create) return expect.fail("actual legacy member has no inbox create");
    const inbox = life.platform(scopeIdOf(create.to as Seed));
    await dispatchFixture([M, inbox], life.wait);
    const inboxAt = await inbox.at(), oldInbox = await life.wait(() => receiverPolicyProof(namespace(env.PLATFORM), inboxAt));
    expect(oldInbox?.policy).toEqual({ mode: "legacy" }); expect(oldInbox?.proof.calls).toBe(3);
  } finally { life.release(); }
});
