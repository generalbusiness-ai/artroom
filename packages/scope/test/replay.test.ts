import { describe, expect, test } from "vitest";
import type { Entry } from "@generalbusiness/artroom-contract";
import { TRUSTS, httpSource, verify } from "@generalbusiness/artroom-replay";
import type { Checkpointed } from "../src/index.ts";
import { HOLD, definition } from "./support.ts";
import { Node, desk, founding, later, net, rita, routed, settle, ticket, una } from "./net.ts";

/**
 * Replay agrees with the runtime. Each history below was written by real
 * scopes, on Durable Object storage, through the turn and the dispatchers.
 * The verifier reads it through the Worker's own read routes, as bytes, and
 * derives every entry again with derive's judges. It shares no code with
 * the runtime but those judges and the fold.
 */
const source = httpSource("https://scopes.test", { fetch: routed });
const kinds = (entries: readonly Entry[]) => entries.map((e) => (e.input.type === "delivery" ? e.input.message.class : e.input.type));

describe("replay of histories the runtime wrote, read through the Worker's read routes (sections 9.3 to 9.5)", () => {
  test("one scope: acts, one under a rule, a timed expiry and a checkpoint are each derived again as recorded, and the report states its coverage and trusts", async () => {
    net.hold = net.deaf = null;
    const { signed, name } = founding(definition, { title: "A lane", opener: rita.member });
    const L = new Node(name, definition.declared);
    expect(await L.stub.found(signed, definition.declared)).toMatchObject({ answer: "accepted" });
    const commitment = (await L.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } })).fact.seq;
    const assigned = (await L.did(rita, "assign", { on: commitment, expected: { on: 1 }, fields: { performer: una.member } })).fact;   // under the rule `not-self`
    await L.did(una, "take-hold", { fields: { commitment }, expected: { commitment: 2 } });
    await later(HOLD, L);
    expect(await L.alarm()).toBe(true);                         // the hold's end, by the drain
    expect(await (L.stub as unknown as { checkpoint(): Promise<Checkpointed> }).checkpoint()).toMatchObject({ answer: "written" });
    // The remark names this scope's own `assign` entry as a fact. It is a local fact: the scope checks it against its own history,
    // fetches nothing and records no use, and the verifier checks it against the entries it has replayed.
    await L.did(rita, "remark", { on: 0, fields: { text: "after the checkpoint", proof: assigned } });
    const head = (await L.summary()).at;
    expect(kinds(await L.entries())).toEqual(["genesis", "act", "act", "act", "timed", "checkpoint", "act"]);
    expect((await L.entries()).at(-1)!.uses).toEqual([]);
    expect(await L.act(rita, "remark", { on: 0, fields: { text: "another hash", proof: { ...assigned, hash: head.hash } } })).toMatchObject({ answer: "refused", reason: "fact-mismatch" });

    const { report, why } = await verify(source, { mode: "replay", scope: name, head, grants: "as-recorded" });
    expect([report.result, why, report.target]).toEqual(["consistent", null, { at: await L.at(), ...head }]);
    expect([report.coverage, report.dependencies]).toEqual([[{ scope: await L.at(), from: 0, through: 6 }], { verified: 0, anchored: 0, missing: [] }]);
    // The caller held the head, so the head is not on trust. What stays on trust is what no history shows.
    expect(report.trusts).toEqual([TRUSTS.clock, TRUSTS.minted, TRUSTS.authority, TRUSTS.bounds]);
  });

  test("a parent and two children: creation, confirmation and a relationship update; each scope's replay covers the scopes it used, as far as it used them", async () => {
    const D = await desk();
    const P = await ticket(D, "P");
    const I = await ticket(D, "I");
    await P.did(rita, "link", { fields: { target: await I.at(), about: 0 } });
    await settle(D, P, I);
    expect([kinds(await D.entries()).slice(0, 3), kinds(await P.entries()), kinds(await I.entries())]).toEqual([["genesis", "act", "result"], ["genesis", "control", "act", "result"], ["genesis", "control", "request"]]);

    const [d, p, i] = [await D.at(), await P.at(), await I.at()];
    const replayed = async (node: Node) => (await verify(source, { mode: "replay", scope: node.name, head: (await node.summary()).at, grants: "as-recorded" })).report;
    const through = (report: Awaited<ReturnType<typeof replayed>>) => report.coverage.map((c) => [c.scope, c.through]);
    const [desks, links, linked] = [await replayed(D), await replayed(P), await replayed(I)];
    expect([desks.result, links.result, linked.result]).toEqual(["consistent", "consistent", "consistent"]);
    // The child's genesis needs its creator's history up to the act that created it, and the update needs the owner's up to the link.
    // The creator's entry that recorded a child's result needed that child's genesis, and so on: each prefix once, as far as needed.
    const created = (await I.entries())[0]!.input as Extract<Entry["input"], { type: "genesis" }>;
    const confirmed = (await I.entries())[1]!.input as Extract<Entry["input"], { type: "delivery" }>;
    expect(through(linked)).toEqual([[i, 2], [d, confirmed.from.seq], [p, 2]]);
    expect(created.source!.seq).toBeLessThan(confirmed.from.seq);
    // The owner's entry that recorded the update's result needed the child through the update, and so the creator through the child's confirmation.
    expect(through(links)).toEqual([[p, 3], [d, confirmed.from.seq], [i, 2]]);
    expect(through(desks)).toEqual([[d, (await D.summary()).at.seq], [p, 0], [i, 0]]);
    expect(linked.trusts).toEqual([TRUSTS.clock, TRUSTS.sources, TRUSTS.minted, TRUSTS.held, TRUSTS.delivered, TRUSTS.authority, TRUSTS.bounds]);
    expect([linked.dependencies.verified, linked.dependencies.anchored, linked.anchors]).toEqual([7, 0, []]);
  });
});
