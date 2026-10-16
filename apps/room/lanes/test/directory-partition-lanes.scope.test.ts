import { expect, test } from "vitest";
import type { Seed } from "@generalbusiness/dap-contract";
import { canonicalize, factRefOf, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { PARTITION_COHORT as C } from "@generalbusiness/dap-platform";
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
test("partition issue facts satisfy real block guards while retained producer identities survive a receiver restart", async () => {
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
  } finally { life.release(); }
});
