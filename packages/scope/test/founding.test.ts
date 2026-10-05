import { env } from "cloudflare:workers";
import { SELF, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Entry, Intent, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { definitionDigest, intentDigest, isIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { timeOf, type Delivered } from "@generalbusiness/artroom-derive";
import { Scope, grantOf, laneDefinition, variant } from "@generalbusiness/artroom-derive/testing";
import { inbox } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import type { Delivery } from "../src/index.ts";
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
    // A platform definition is supplied in code, and this one is not delivered.
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

  test("a scope is founded under platform:inbox@1 by the production wiring: the runtime's code supplies the definition, the genesis is written and retains no declaration, and a row that is data is judged, also after a restart; the row whose code is not written answers unsupported-definition and writes nothing; and the same data, given by an input, founds nothing", async () => {
    const soon = () => timeOf(Date.now() + 60_000);
    const asked = (): Intent => ({ v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { owner: rita.member, membership: rita.member.membership }, idempotencyKey: crypto.randomUUID(), notAfter: soon() });
    const seedOf = (intent: Intent, definition: Seed["definition"]): Seed => ({ v: 1, kind: "directory", definition, creator: null, cause: intentDigest(intent), ordinal: 0 });
    const stored = (name: string, query: string) => runInDurableObject(env.AS_DEPLOYED.get(env.AS_DEPLOYED.idFromName(name)), (_instance, state) => state.storage.sql.exec(query).toArray());

    // `AS_DEPLOYED` has every production default: no test authority, and the definitions port of `production()`. The founding names
    // the platform definition. The seed holds that name, and the object's name is the seed's digest.
    const intent = asked();
    const name = scopeIdOf(seedOf(intent, "platform:inbox@1"));
    const deployed = stubOf(name, env.AS_DEPLOYED);
    const founded = await deployed.found(signIntent(intent, rita.secret), "platform:inbox@1");
    if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
    const at: ScopeRef = founded.receipt.fact.at;
    expect([at.scope, founded.receipt.fact.seq, founded.receipt.definition]).toEqual([name, 0, "platform:inbox@1"]);

    // The genesis entry: the genesis act of section 12.1.6, `establish`, with the two effects that the definition's data writes.
    // A platform definition is pinned by its name and version, so no declaration is retained for it.
    const [genesis] = await stored(name, "SELECT bytes FROM entry WHERE seq = 0");
    expect(JSON.parse(genesis!["bytes"] as string) as Entry).toMatchObject({
      seq: 0, input: { type: "genesis", seed: { definition: "platform:inbox@1" }, kind: "establish", decision: "applied" },
      effects: [{ effect: "open", item: 0, type: "inbox", state: "open" }, { effect: "party", slot: "owner" }, { effect: "ref", slot: "membership" }],
    });
    expect(await stored(name, "SELECT COUNT(*) AS n FROM retained_input WHERE kind = 'definition'")).toEqual([{ n: 0 }]);

    // After a restart the definition is the code's again. A row that is data is judged: `mark-read` names no notice, which is check
    // 8 of section 4.2. No act of this definition reaches check 9 without a notice, and a notice needs the row below.
    await evictDurableObject(env.AS_DEPLOYED.get(env.AS_DEPLOYED.idFromName(name)));
    const head = { seq: 0, hash: founded.receipt.fact.hash };
    const read = signIntent({ v: 1, to: at, actor: rita.key, kind: "mark-read", on: 7, expected: { on: 1, inbox: 1 }, fields: {}, idempotencyKey: "k", notAfter: soon() }, rita.secret);
    expect(await deployed.submit(read, [grantOf(rita, at, ["inbox.own"])])).toEqual({ answer: "refused", reason: "no-item", judgedAt: head });

    // `notify` is marked as code, row P22, and no rule is written (I3 deltas, entry E10). The scope derives nothing of that row: the
    // delivery is not decided, and the sender keeps the duty. The control is an advisory of a row that is not marked: it goes on to
    // the read of its source entry, which the production resolver cannot make.
    const from = { at: { ...at, kind: "lane" as const }, seq: 3, hash: founded.receipt.fact.hash };
    const advisory = (type: "notify" | "index"): Delivered => ({ to: at, from, n: 0, message: { class: "advisory", type, body: { fields: { reason: "review" } } } });
    const object = env.AS_DEPLOYED.get(env.AS_DEPLOYED.idFromName(name)) as unknown as { deliver(envelope: Delivered): Promise<Delivery> };
    expect([await object.deliver(advisory("notify")), await object.deliver(advisory("index"))]).toEqual([{ answer: "retry", reason: "unsupported-definition" }, { answer: "retry", reason: "dependency-unavailable" }]);
    expect(await stored(name, "SELECT COUNT(*) AS n FROM entry")).toEqual([{ n: 1 }]);

    // The validator's platform option is reached by the name alone. The same data, given by an input as a declaration, is validated
    // without it: a declared definition does not take a platform name, and nothing is founded.
    const other = asked();
    const declared = scopeIdOf(seedOf(other, definitionDigest(inbox)));
    expect(await stubOf(declared, env.AS_DEPLOYED).found(signIntent(other, rita.secret), inbox)).toEqual({ answer: "refused", reason: "unsupported-definition" });
    expect(await stored(declared, "SELECT COUNT(*) AS n FROM entry")).toEqual([{ n: 0 }]);
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
