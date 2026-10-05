import { describe, expect, onTestFinished, test } from "vitest";
import type { Entry, ScopeId, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest, messageDigest, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { TRUSTS, httpSource, verify } from "@generalbusiness/artroom-replay";
import { scriptedCapability } from "@generalbusiness/artroom-scope/testing";
import { README, answered, graph, net, rita, routed, type Graph, type Node } from "./support/graph.ts";
import type { issue } from "../src/index.ts";

/** What each entry of a history is: its input's type, and for a delivery the message's class and the clause or decision it recorded. */
const kinds = (entries: readonly Entry[]) => entries.map((e) => (e.input.type !== "delivery" ? e.input.type : "clause" in e.input ? `result ${e.input.clause}` : e.input.message.class));

describe("a plan's concerns are lanes of their own (lane forms, sections 3.5 and 3.6)", () => {
  /** The graph that T2 leaves, which T9 reads and does not change: an office, a goal and two concerns. */
  let left: { g: Graph; G: Node<typeof issue>; K: Node<typeof issue>[] } | null = null;

  test("T2, one child for each exact cause: two add-concern acts with equal fields create two lanes; each concern is created once and names its child from the sender; a repeated creation, a repeated result and a repeated intent each add nothing", async () => {
    // Real scopes in one namespace: the goal, and two concern lanes that it creates under its own pinned definition. No peer is
    // used. No capability guard is asked, and the scripted test capability, a STAND-IN, is present only because no scope runs
    // under a lane definition without one. Not proved: a real directory, or the index rows it would keep.
    const g = await graph();
    const G = await g.goal();
    const plan = (await G.did(rita, "open-plan", {})).fact.seq;
    const concern = { fields: { plan, purpose: "The parser", role: "required", title: "Parse the file", conditions: ["it parses"] } } as const;
    // Two acts with the same fields. They differ in their idempotency keys only, so they are two intents and two causes.
    const asks = [await G.signed(rita, "add-concern", concern), await G.signed(rita, "add-concern", concern)];
    const receipts = [];
    for (const ask of asks) {
      const answer = await G.submit(ask);
      if (answer.answer !== "accepted") expect.fail(`add-concern was not accepted: ${JSON.stringify(answer)}`);
      receipts.push(answer.receipt);
    }
    const creations = await Promise.all(receipts.map((r) => G.envelope(r.fact.seq)));
    const seeds = creations.map((c) => c.to as Seed);
    // The two creation messages have the same bytes. Each seed names its own intent as its cause, so the two lanes have two names.
    expect(messageDigest(creations[0]!.message)).toBe(messageDigest(creations[1]!.message));
    expect([seeds.map((s) => s.cause), scopeIdOf(seeds[0]!) === scopeIdOf(seeds[1]!)]).toEqual([asks.map((a) => intentDigest(a.signed.intent)), false]);
    const K = [await g.concern(G, receipts[0]!.fact.seq), await g.concern(G, receipts[1]!.fact.seq)];

    // In the goal: one result for each creation, and each moves its own concern to `created` and names the child from the sender.
    const entries = await G.entries();
    expect(kinds(entries)).toEqual(["genesis", "control", "act", "act", "act", "result applied", "result applied"]);
    expect(entries.slice(-2).map((e) => e.effects)).toEqual(receipts.map((r, i) => [{ effect: "state", item: r.fact.seq, state: "created" }, { effect: "ref", item: r.fact.seq, slot: "child", to: K[i]!.at }]));
    // In each child: its goal names the parent lane and the concern, by the entry that asked for it, which is its genesis's source.
    for (const [i, child] of K.entries()) {
      const genesis = (await child.entry(0)).input as Extract<Entry["input"], { type: "genesis" }>;
      expect([(await child.item(0)).refs["parent"], (await child.item(0)).values["parentItem"], genesis.source]).toEqual([G.at, receipts[i]!.fact.seq, receipts[i]!.fact]);
    }

    // Each of the three repeats is answered with what was recorded the first time, and writes no entry in either scope.
    const heads = async () => [(await G.entries()).length, (await K[0]!.entries()).length];
    const before = await heads();
    expect(await K[0]!.stub.deliver(creations[0]!)).toEqual({ answer: "recorded", fact: await K[0]!.fact(0) });
    expect(await G.stub.deliver(await K[0]!.envelope(0))).toEqual({ answer: "recorded", fact: await G.fact(5) });
    expect(await G.submit(asks[0]!)).toEqual({ answer: "accepted", receipt: receipts[0] });
    await g.settle();
    expect([await heads(), (await G.state()).count("concern", "created"), answered(await G.submit({ signed: asks[0]!.signed, beside: {} }))]).toEqual([before, 2, "accepted"]);
    left = { g, G, K };
  });

  test("T9, replay agrees with the runtime on the graph that T2 left: the office, the goal and a concern are each derived again from the bytes the Worker's read routes serve, with the same test capability table", async () => {
    // B9 over B3. The verifier reads each history as bytes over HTTP and derives every entry again with derive's judges. It is
    // given the scripted test capability, a STAND-IN: with no rules for a capability it cannot derive under a lane definition
    // at all, and says so. No capability guard is asked in these histories. The report's own list says what stays on trust.
    if (!left) throw new Error("T2 left no graph");
    const { g, G, K } = left;
    net.capability = {};
    onTestFinished(() => { net.capability = null; });
    const source = httpSource("https://scopes.test", { fetch: routed });
    const replayed = async (node: { name: ScopeId }, rules = true) => (await verify(source, { mode: "replay", scope: node.name, ...(rules ? { capabilities: scriptedCapability(() => net.capability) } : {}) })).report;
    const [office, goal, child] = [await replayed(g.office), await replayed(G), await replayed(K[0]!)];
    expect([office.result, goal.result, child.result]).toEqual(["consistent", "consistent", "consistent"]);
    // Each replay covers its own history whole, and every scope it used as far as it used it: the goal used its creator and both children.
    const through = (report: typeof goal) => report.coverage.map((c) => [c.scope.scope, c.through]);
    expect(through(goal)).toEqual([[G.name, 6], [g.office.name, 2], [K[0]!.name, 0], [K[1]!.name, 0]]);
    expect(through(child)).toEqual([[K[0]!.name, 1], [G.name, 5], [g.office.name, 2]]);
    expect([goal.dependencies.missing, goal.redacted, goal.trusts]).toEqual([[], [], [TRUSTS.clock, TRUSTS.head, TRUSTS.sources, TRUSTS.minted, TRUSTS.held, TRUSTS.delivered, TRUSTS.authority, TRUSTS.bounds]]);
    // The office was founded with a text beside its founding intent. The scope serves it under its digest, and the replay found it.
    expect([(await g.office.handle.scope.text(textDigest(README))).ok, office.dependencies.missing]).toEqual([true, []]);
    // With no rules for the capabilities that the definition lists, nothing is derived: the limit that the report above is read with.
    expect(await replayed(G, false)).toMatchObject({ result: "unsupported-definition", at: { seq: 0 } });
  });
});
