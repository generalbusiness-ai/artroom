import { runInDurableObject } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { ReceiverReads } from "../../../../packages/scope/src/receiver-reads.ts";
import { ReadPreparation } from "../../../../packages/scope/src/read-preparation.ts";
import { expect, test } from "vitest";
import type { Seed } from "@generalbusiness/dap-contract";
import { canonicalize, factRefOf, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C, partitionSourceName, partitionReceiverPolicy, partitionDeclaredCreationPolicy } from "@generalbusiness/dap-platform";
import { proofEntry, PROOF_BYTE_BOUNDS } from "../../../../packages/scope/src/proof-bytes.ts";
import { namespace } from "../../../../packages/scope/src/namespace.ts";
import { env } from "cloudflare:workers";
import { sessionRoom } from "../../../../packages/scope/test/support/session-room.ts";
import { dispatchFixture } from "../../../../packages/scope/test/support/native-fixture-lifetime.ts";
import { rita, type Platform } from "../../../../packages/scope/test/repository.ts";
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
  } finally { life.release(); }
});
