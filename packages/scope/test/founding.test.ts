import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { DeclaredDefinition, Entry, Intent, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { definitionDigest, factRefOf, intentDigest, isIncarnation, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { timeOf, type Delivered } from "@generalbusiness/artroom-derive";
import { Scope, forged, grantOf, laneDefinition, variant } from "@generalbusiness/artroom-derive/testing";
import { inbox, platform } from "@generalbusiness/artroom-platform";
import { httpSource, platformCode, verify } from "@generalbusiness/artroom-replay";
import { controls, scriptedCapability, type CapabilityScript } from "../src/testing.ts";
import { Node, founding as foundingIn, net, routed, soon } from "./net.ts";
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
    // A platform definition is supplied in code. The package holds the data of this one and no rule for three of its marks, so it runs nothing.
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

  test("the object with no wiring has every production default: it records a founding on the real clock, calls no grant current and lets no reader read", async () => {
    const soon = () => timeOf(Date.now() + 60_000);
    const { signed, name } = founding(soon());
    // The namespace `AS_DEPLOYED` is the class `ScopeObject`, with the ports of `production()` and nothing else. It is not the class that
    // `wrangler.jsonc` names: that is `DeployedScope`, which adds the namespace, the authority of a repository and read sessions.
    const deployed = stubOf(name, env.AS_DEPLOYED);
    const founded = await deployed.found(signed, definition.declared);
    if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
    const { at, seq, hash } = founded.receipt.fact;
    expect([at.scope, seq]).toEqual([name, 0]);
    const offer = signIntent({ v: 1, to: at, actor: rita.key, kind: "offer", on: null, expected: { intent: 1 }, fields: { intent: 0 }, idempotencyKey: "k", notAfter: soon() }, rita.secret);
    expect(await deployed.submit(offer, [grantOf(rita, at, ["offer"])])).toEqual({ answer: "refused", reason: "unauthorized", judgedAt: { seq, hash } });
    expect(await deployed.summary(reader)).toEqual({ ok: false, reason: "forbidden" });
  });

  test("platform:inbox@1 has one mark, `notice-source`, and the platform package has its rule. The production wiring founds a scope under it, which retains no declaration and judges its acts, also after a restart; a `notify` writes a notice whose `source` the rule set; a runtime that has lost the rule admits nothing to that scope and founds none; and the same data, given by an input, founds nothing", async () => {
    const NAMED = "platform:inbox@1";
    const asked = (notAfter: Intent["notAfter"]): Intent => ({ v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { owner: rita.member, membership: rita.member.membership }, idempotencyKey: crypto.randomUUID(), notAfter });
    const seedOf = (intent: Intent, definition: Seed["definition"]): Seed => ({ v: 1, kind: "directory", definition, creator: null, cause: intentDigest(intent), ordinal: 0 });
    const stored = (name: string, query: string, namespace = env.NET) => runInDurableObject(namespace.get(namespace.idFromName(name)), (_instance, state) => state.storage.sql.exec(query).toArray());

    // `AS_DEPLOYED` has every production default: the definitions port of `production()`, which supplies the inbox's data with its
    // rule. Every mark has its rule, so the definition is one that this runtime can run, and the scope is founded.
    const first = asked(timeOf(Date.now() + 60_000));
    const deployed = scopeIdOf(seedOf(first, NAMED));
    expect(await stubOf(deployed, env.AS_DEPLOYED).found(signIntent(first, rita.secret), NAMED)).toMatchObject({ answer: "accepted", receipt: { definition: NAMED, fact: { at: { scope: deployed }, seq: 0 } } });
    expect(await stored(deployed, "SELECT COUNT(*) AS n FROM entry", env.AS_DEPLOYED)).toEqual([{ n: 1 }]);

    // The rest is in the namespace `NET`: the deployed class and its definitions port, with the test clock, authority and readers.
    try {
      net.hold = net.deaf = null;
      const intent = asked(soon(60));
      const name = scopeIdOf(seedOf(intent, NAMED));
      const I = new Node(name, inbox as unknown as DeclaredDefinition);
      // The founding names the platform definition: the seed holds that name, and the object's name is the seed's digest.
      const founded = await I.stub.found(signIntent(intent, rita.secret), NAMED);
      if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
      const ref: ScopeRef = founded.receipt.fact.at;
      expect([ref.scope, founded.receipt.fact.seq, founded.receipt.definition]).toEqual([name, 0, NAMED]);

      // The genesis entry: the genesis act of section 12.1.6, `establish`, with the two effects that the definition's data writes.
      // A platform definition is pinned by its name and version, so no declaration is retained for it.
      const [genesis] = await stored(name, "SELECT bytes FROM entry WHERE seq = 0");
      expect(JSON.parse(genesis!["bytes"] as string) as Entry).toMatchObject({
        seq: 0, input: { type: "genesis", seed: { definition: NAMED }, kind: "establish", decision: "applied" },
        effects: [{ effect: "open", item: 0, type: "inbox", state: "open" }, { effect: "party", slot: "owner" }, { effect: "ref", slot: "membership" }],
      });
      expect(await stored(name, "SELECT COUNT(*) AS n FROM retained_input WHERE kind = 'definition'")).toEqual([{ n: 0 }]);

      // After a restart the definition is the code's again, and the scope runs: an act is judged. `mark-read` names no notice, which
      // is check 8 of section 4.2.
      await I.restart();
      const head = { seq: 0, hash: founded.receipt.fact.hash };
      const read = (on: number) => I.act(rita, "mark-read", { on, expected: { on: 1, inbox: 1 } });
      expect(await read(7)).toEqual({ answer: "refused", reason: "no-item", judgedAt: head });

      // A `notify` from a lane. A scripted peer, a STAND-IN: the lane's entry is written by hand, and nothing judged it, so this shows
      // the inbox's side of the delivery and nothing about a lane. The handler's written effects set `reason`, `item` and `at`.
      // The mark `notice-source` stands after them, and its rule, the platform package's own, sets `source`: the record of the source
      // fact's scope ID, incarnation, position and hash (authority note, section 12.1.6, case a).
      const lane: ScopeRef = { scope: scopeIdOf(seedOf(asked(soon(60)), NAMED)), inc: newIncarnation(new Uint8Array(16).fill(7)), kind: "lane" };
      const message = { class: "advisory", type: "notify", body: { fields: { reason: "review", item: 4 } } } as const;
      const source = forged(lane, 3, { type: "checkpoint", through: 2, state: `sha256:${"0".repeat(64)}` }, [{ n: 0, to: ref, message }]);
      const from = factRefOf(source.entry);
      net.peers.set(from.hash, { entry: source.entry, under: "issue" });
      const notified: Delivered = { to: ref, from, n: 0, message };
      const recorded = await I.stub.deliver(notified);
      expect(recorded).toMatchObject({ answer: "recorded", fact: { at: ref, seq: 1 } });
      expect((await I.entries())[1]).toMatchObject({
        input: { type: "delivery", from, n: 0, message },
        effects: [
          { effect: "open", item: 1, type: "notice", state: "unread" }, { effect: "value", item: 1, slot: "reason", value: "review" }, { effect: "value", item: 1, slot: "item", value: 4 },
          { effect: "value", item: 1, slot: "at", value: net.clock.now }, { effect: "value", item: 1, slot: "source", value: { scope: lane.scope, incarnation: lane.inc, seq: 3, hash: from.hash } },
        ],
        sends: [],
      });
      // Case b: the same advisory again writes nothing. The owner then marks the notice read, on a grant that the test authority calls current.
      expect(await I.stub.deliver(notified)).toEqual(recorded);
      await I.did(rita, "mark-read", { on: 1, expected: { on: 1, inbox: 1 } });
      expect([(await I.item(1))?.state, (await I.entries()).length]).toEqual(["read", 3]);

      // A replay runs the same rules. Given the platform package's data and rules, it derives every entry again, and its report
      // lists the trust `platform-code` with the name and the version: it shows that these rules derive the same bytes, and not that
      // they are the ones the runtime ran. Given none, or the data without the rule, it cannot derive under the definition at all:
      // `unsupported-definition`, at the genesis. The lane's entry is the scripted peer's, so an anchor names it.
      const replayed = async (code?: (named: string) => ReturnType<typeof platform>) =>
        (await verify(httpSource("https://scopes.test", { fetch: routed }), { mode: "replay", scope: name, grants: "as-recorded", platform: code, anchors: [{ scope: lane.scope, seq: 3, hash: from.hash }] })).report;
      const [same, none, ruleless] = [await replayed(platform), await replayed(), await replayed((named) => { const supplied = platform(named); return supplied && { ...supplied, rules: {} }; })];
      expect([same, none, ruleless]).toMatchObject([{ result: "consistent", target: { seq: 2 } }, { result: "unsupported-definition", at: { seq: 0 } }, { result: "unsupported-definition", at: { seq: 0 } }]);
      expect([same.trusts.includes(platformCode(NAMED)), none.trusts.some((trust) => trust.startsWith("platform-code")), same.coverage]).toEqual([true, false, [{ scope: ref, from: 0, through: 2 }]]);

      // The same scope, in a runtime that has lost the rule: test support supplies the data with no rule. Section 6.1, "A mark with
      // no rule: the whole scope": the scope admits nothing, whatever the row. The act that was judged above is now not judged, and
      // nothing is founded under the definition.
      net.platformCode = false;
      await I.restart();
      expect([await I.stub.summary(reader), await read(7), await I.stub.deliver({ ...notified, n: 1 })]).toEqual([{ ok: false, reason: "unsupported-definition" }, { answer: "unavailable", reason: "unavailable" }, { answer: "retry", reason: "unavailable" }]);
      expect(await stored(name, "SELECT COUNT(*) AS n FROM entry")).toEqual([{ n: 3 }]);
      const lost = asked(soon(60));
      expect(await new Node(scopeIdOf(seedOf(lost, NAMED)), I.declared).stub.found(signIntent(lost, rita.secret), NAMED)).toEqual({ answer: "refused", reason: "unsupported-definition" });
      expect(await stored(scopeIdOf(seedOf(lost, NAMED)), "SELECT COUNT(*) AS n FROM entry")).toEqual([{ n: 0 }]);
      net.platformCode = true;

      // The validator's platform option is reached by the name alone. The same data, given by an input as a declaration, is validated
      // without it: a declared definition holds no mark, and nothing is founded.
      const other = asked(soon(60));
      const declared = scopeIdOf(seedOf(other, definitionDigest(I.declared)));
      expect(await new Node(declared, I.declared).stub.found(signIntent(other, rita.secret), I.declared)).toEqual({ answer: "refused", reason: "unsupported-definition" });
      expect(await stored(declared, "SELECT COUNT(*) AS n FROM entry")).toEqual([{ n: 0 }]);
    } finally {
      net.platformCode = true;
    }
  });

  test("a definition that needs a capability record: the production wiring has the capability's code and founds a scope under it, which admits no act and no step and sends nothing; a runtime that lacks the code founds none; the scripted test capability, a stand-in that shows nothing about a real hold, runs it in a test; a replay with no code for the capability answers unsupported-definition", async () => {
    // The lane of the other tests, whose `report` now asks the hold capability whether the commit is staged, and pins it.
    const staged = variant(definition.declared, (def) => {
      def.acts.report.fields.commit = { type: "commit", required: true };
      def.acts.report.guards.push({ capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } });
      def.acts.report.effects.push({ capability: { name: "hold", do: "pin-hold", with: { commit: { field: "commit" } } } });
    });
    const fields = { title: "A lane", opener: rita.member };
    const commit = "c".repeat(40);

    // With the production defaults, the runtime has the code of `hold@1` and of `git-read@1`, so the definition is one that it can pin
    // (section 6.1): the rule is on the code of the forms that a definition uses, and asks for no peer. The founding is written. That is
    // all the scope does with those defaults. No grant is read, so its acts and its steps are refused `unauthorized`: no hold is opened, and so no
    // operation, and nothing is sent outside. No reader may read it.
    const asked: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields, idempotencyKey: crypto.randomUUID(), notAfter: timeOf(Date.now() + 60_000) };
    const seed: Seed = { v: 1, kind: "directory", definition: staged.digest, creator: null, cause: intentDigest(asked), ordinal: 0 };
    const deployed = stubOf(scopeIdOf(seed), env.AS_DEPLOYED);
    const founded = await deployed.found(signIntent(asked, rita.secret), staged.declared);
    if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
    const at = founded.receipt.fact.at;
    const intent = (kind: string, more: Partial<Intent>): Intent => ({ v: 1, to: at, actor: rita.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: crypto.randomUUID(), notAfter: timeOf(Date.now() + 60_000), ...more });
    const offer = signIntent(intent("offer", { expected: { intent: 1 }, fields: { intent: 0 } }), rita.secret);
    const step = signIntent(intent("hold@1:instance", { fields: { hold: 2, task: { ...at, kind: "task" }, instance: "i1" } }), rita.secret);
    const all = [grantOf(rita, at, [...new Set(Object.values(staged.declared.acts).map((act) => act.grant as string))])];
    const entries = () => runInDurableObject(env.AS_DEPLOYED.get(env.AS_DEPLOYED.idFromName(scopeIdOf(seed))), (_instance, state) => state.storage.sql.exec("SELECT (SELECT COUNT(*) FROM entry) AS entries, (SELECT COUNT(*) FROM operation) AS operations").toArray());
    expect([await deployed.submit(offer, all), await deployed.prepare(step, all, "hold@1", "instance"), await (deployed as unknown as { effect(): Promise<number> }).effect(), await deployed.summary(reader), await entries()]).toMatchObject([
      { answer: "refused", reason: "unauthorized" }, { answer: "refused", reason: "unauthorized" }, 0, { ok: false, reason: "forbidden" }, [{ entries: 1, operations: 0 }],
    ]);

    // A runtime that lacks the code founds no scope under the definition, and writes nothing: the namespace `NET` with no capability.
    net.capability = null;
    const lacking = foundingIn(staged, fields);
    expect(await new Node(lacking.name, staged.declared).stub.found(lacking.signed, staged.declared)).toEqual({ answer: "refused", reason: "unsupported-definition" });

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
      const source = httpSource("https://scopes.test", { fetch: routed });
      const replayed = async (capabilities?: ReturnType<typeof scriptedCapability>) => (await verify(source, { mode: "replay", grants: "as-recorded", scope: name, capabilities })).report;
      expect([await replayed(scriptedCapability(() => net.capability as CapabilityScript)), await replayed()]).toMatchObject([{ result: "consistent" }, { result: "unsupported-definition", at: { seq: 0 } }]);

      // The scope's own runtime answers the same once it has no capability: it reads its pinned definition again after a restart.
      net.capability = null;
      await L.restart();
      expect([await L.stub.summary(reader), await L.act(una, "report", report)]).toEqual([{ ok: false, reason: "unsupported-definition" }, { answer: "unavailable", reason: "unavailable" }]);
    } finally {
      net.capability = null;
    }
  });
});
