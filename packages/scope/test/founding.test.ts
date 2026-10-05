import { env } from "cloudflare:workers";
import { SELF, runInDurableObject } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Intent, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest, isIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { timeOf } from "@generalbusiness/artroom-derive";
import { Scope, grantOf, laneDefinition, variant } from "@generalbusiness/artroom-derive/testing";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { controls, scriptedCapability } from "../src/testing.ts";
import { Node, founding as foundingIn, net } from "./net.ts";
import { HOLD, START, at, definition, found, founding, reader, rita, stubOf, una } from "./support.ts";

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

  test("a founding that names a foreign fact waits for it the first time; asked again, once the fact cannot be read, it is answered with its receipt and writes nothing", async () => {
    // Another scope's entry from derive's fixture lane, which the founding names in an optional field of its genesis act.
    const l = new Scope(laneDefinition);
    l.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
    const entry = l.did(rita, "assign", { on: 2, expected: { on: 1 }, fields: { performer: una.member } });
    const proof = l.fact(entry.seq);
    const naming = variant(definition.declared, (def) => {
      def.acts[def.genesis].fields.proof = { type: "fact", kind: ["assign"], under: "lane", required: false };
    });
    const signed = signIntent({ v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { title: "A lane", opener: rita.member, proof }, idempotencyKey: "k", notAfter: at(60) }, rita.secret);
    const name = scopeIdOf({ v: 1, kind: "directory", definition: naming.digest, creator: null, cause: intentDigest(signed.intent), ordinal: 0 });
    const c = controls(name, START);
    const stub = stubOf(name);
    // The first founding reads the fact. Unread, it waits and records nothing.
    expect(await stub.found(signed, naming.declared)).toEqual({ answer: "unavailable", reason: "dependency-unavailable" });
    expect(await stub.summary(reader)).toEqual({ ok: false, reason: "not-found" });
    c.foreign.set(proof.hash, { entry, under: "lane" });
    const first = await stub.found(signed, naming.declared);
    expect(first).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 0 } } });
    // The fact is lost. The same founding again is a repeat: it reads no fact, and is answered from the genesis.
    c.foreign.clear();
    expect(await stub.found(signed, naming.declared)).toEqual(first);
    expect(await stub.summary(reader)).toMatchObject({ ok: true, at: { seq: 0 } });
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

  test("a definition that needs a capability record: the production wiring founds no scope under it; the scripted test capability, a stand-in that shows nothing about a real hold, runs it in a test; a replay with no code for the capability answers unsupported-definition", async () => {
    // The lane of the other tests, whose `report` now asks the hold capability whether the commit is staged, and pins it.
    const staged = variant(definition.declared, (def) => {
      def.acts.report.fields.commit = { type: "commit", required: true };
      def.acts.report.guards.push({ capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } });
      def.acts.report.effects.push({ capability: { name: "hold", do: "pin-hold", with: { commit: { field: "commit" } } } });
    });
    const fields = { title: "A lane", opener: rita.member };
    const commit = "c".repeat(40);

    // As deployed, there is no code for a capability record. The founding is refused before anything is written, whatever else
    // it holds: the same class founds a scope under the definition without the capability forms, in the test above.
    const asked: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields, idempotencyKey: crypto.randomUUID(), notAfter: timeOf(Date.now() + 60_000) };
    const seed: Seed = { v: 1, kind: "directory", definition: staged.digest, creator: null, cause: intentDigest(asked), ordinal: 0 };
    const deployed = stubOf(scopeIdOf(seed), env.AS_DEPLOYED);
    expect(await deployed.found(signIntent(asked, rita.secret), staged.declared)).toEqual({ answer: "refused", reason: "unsupported-definition" });
    const entries = await runInDurableObject(env.AS_DEPLOYED.get(env.AS_DEPLOYED.idFromName(scopeIdOf(seed))), (_instance, state) => state.storage.sql.exec("SELECT COUNT(*) AS n FROM entry").toArray());
    expect(entries).toEqual([{ n: 0 }]);

    // A STAND-IN from here on: the scripted test capability answers from the table below. It reads no hold and no repository.
    try {
      net.hold = net.deaf = null;
      net.capability = {};
      const { signed, name } = foundingIn(staged, fields);
      const L = new Node(name, staged.declared);
      expect(await L.stub.found(signed, staged.declared)).toMatchObject({ answer: "accepted" });
      const commitment = (await L.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } })).fact.seq;
      await L.did(rita, "assign", { on: commitment, expected: { on: 1 }, fields: { performer: una.member } });
      const report = { fields: { commitment, commit }, expected: { commitment: 2 } };
      // A guard that the table does not script does not hold, and the refusal has the name its capability declares.
      expect(await L.act(una, "report", report)).toMatchObject({ answer: "refused", reason: "capability-refused", name: "not-staged" });
      net.capability = {
        guards: { "hold@1:staged": (args) => (args["commit"] === commit && args["under"] === commitment ? true : "not-staged") },
        effects: { "hold@1:pin-hold": (args) => [{ kind: "pin", key: [String(args["commit"])], state: "held", values: { commit: args["commit"] } }] },
      };
      const reported = await L.did(una, "report", report);
      expect(reported.effects.at(-1)).toEqual({ effect: "record", capability: "hold@1", kind: "pin", key: [commit], state: "held", values: { commit } });

      // A verifier derives the entry again only with the same rules. With none, it cannot derive under the definition at all.
      const source = httpSource("https://scopes.test", { fetch: (url, init) => SELF.fetch(url, init) });
      const replayed = async (capabilities?: ReturnType<typeof scriptedCapability>) => (await verify(source, { mode: "replay", scope: name, capabilities })).report;
      expect([await replayed(scriptedCapability(() => net.capability)), await replayed()]).toMatchObject([{ result: "consistent" }, { result: "unsupported-definition", at: { seq: 0 } }]);

      // The scope's own runtime answers the same once it has no capability: it reads its pinned definition again after a restart.
      net.capability = null;
      await L.restart();
      expect([await L.stub.summary(reader), await L.act(una, "report", report)]).toEqual([{ ok: false, reason: "unsupported-definition" }, { answer: "unavailable", reason: "unavailable" }]);
    } finally {
      net.capability = null;
    }
  });
});
