import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { intentDigest, isIncarnation, signIntent } from "@generalbusiness/artroom-bytes";
import { timeOf } from "@generalbusiness/artroom-derive";
import { grantOf, variant } from "@generalbusiness/artroom-derive/testing";
import { HOLD, at, definition, found, founding, reader, rita, stubOf, una } from "./support.ts";

describe("founding a directory (sections 2.2, 2.3 and 7.1)", () => {
  test("entry 0 holds the seed, the signed intent and a minted incarnation, and the scope answers under its own name only", async () => {
    const s = await found();
    expect(await s.stub.entry(reader, 0)).toMatchObject({
      ok: true, at: { seq: 0, hash: s.genesis.fact.hash },
      value: { entry: { seq: 0, prev: null, at: { scope: s.name, inc: s.at.inc, kind: "directory" }, input: { type: "genesis", inc: s.at.inc, founding: s.signed, decision: "applied" } } },
    });
    expect([isIncarnation(s.at.inc), s.genesis.intent, s.genesis.definition]).toEqual([true, intentDigest(s.signed.intent), definition.digest]);
    // The same founding again is answered from the genesis: the same receipt, with the incarnation minted the first time.
    expect(await s.stub.found(s.signed, definition.declared)).toEqual({ answer: "accepted", receipt: s.genesis });
    expect(await s.head()).toEqual({ seq: 0, hash: s.genesis.fact.hash });

    // Another founding intent asks for another seed. Its digest is not this object's name, nor the name of an object with no entry.
    const other = founding();
    const empty = stubOf(founding().name);
    const unverified = { answer: "refused", reason: "source-unverified" };
    expect([await s.stub.found(other.signed, definition.declared), await empty.found(other.signed, definition.declared)]).toEqual([unverified, unverified]);
    expect(await empty.summary(reader)).toEqual({ ok: false, reason: "not-found" });
    // A platform definition is supplied in code, and none is yet.
    expect(await stubOf(other.name).found(other.signed, "platform:directory@1")).toEqual({ answer: "refused", reason: "unsupported-definition" });
  });

  test("once a scope has a genesis it runs under its pinned definition and no other", async () => {
    const s = await found();
    const [hold] = await s.holds(1);
    // The same lane, but the end of a hold tells nobody. A founding under it reaches the scope when the hold is due.
    const other = variant(definition.declared, (def) => { def.timed["hold-end"].attention = []; });
    s.c.clock.now = at(HOLD);
    expect(await s.stub.found(founding(at(HOLD + 60)).signed, other.declared)).toEqual({ answer: "refused", reason: "source-unverified" });
    // The turn drained first, as every turn does, and the end it wrote is the pinned definition's.
    expect((await s.entries(4)).map((e) => e.effects)).toEqual([[{ effect: "hold", item: hold, change: "end", epoch: 2 }, { effect: "attention", item: hold, members: [una.member], reason: "hold ended" }]]);
  });

  test("the object as deployed has every production default: it records a founding on the real clock, calls no grant current and lets no reader read", async () => {
    const soon = () => timeOf(Date.now() + 60_000);
    const { signed, name } = founding(soon());
    const deployed = stubOf(name, env.AS_DEPLOYED);
    const founded = await deployed.found(signed, definition.declared);
    if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
    const { at, seq, hash } = founded.receipt.fact;
    expect([at.scope, seq]).toEqual([name, 0]);
    const offer = signIntent({ v: 1, to: at, actor: rita.key, kind: "offer", on: null, expected: { intent: 1 }, fields: { intent: 0 }, idempotencyKey: "k", notAfter: soon() }, rita.secret);
    expect(await deployed.submit(offer, [grantOf(rita, at, ["offer"])])).toEqual({ answer: "refused", reason: "unauthorized", judgedAt: { seq, hash } });
    expect(await deployed.summary(reader)).toEqual({ ok: false, reason: "forbidden" });
  });
});
