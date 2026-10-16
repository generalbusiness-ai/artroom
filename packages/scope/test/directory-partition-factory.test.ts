import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Seed } from "@generalbusiness/dap-contract";
import { canonicalize, factRefOf, isPlatformDefinition, platformName, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
import { applicationPublicationOrigin } from "@generalbusiness/dap-platform";
import { recordedMembership, recordedRules } from "../src/authority.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { namespace } from "../src/namespace.ts";
import { partitionProof } from "../src/partition-proof.ts";
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
