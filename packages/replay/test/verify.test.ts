import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Report } from "@generalbusiness/artroom-contract";
import { TRUSTS, render, verify, type Options } from "../src/index.ts";
import { entryOf, rewrite, sourceOf, world, type World } from "./world.ts";

const replay = (w: World, over: Partial<Options> = {}) => verify(sourceOf(w), { mode: "replay", scope: w.I.scope.scope, ...over });

describe("replay of a good history (sections 9.3 to 9.5)", () => {
  test("a child's history is consistent only with the histories it used: each scope is covered once, as far as the highest entry needed, and every foreign fact is shown by replay of its source", async () => {
    const w = world();
    const { report, why } = await replay(w);
    expect([report.result, why, report.target]).toEqual(["consistent", null, { at: w.I.scope, seq: 2, hash: w.I.entries[2]!.hash }]);
    // I.0 used D.4, I.1 used D.5, I.2 used P.2. D.5 used I.0, D.2 used P.0, P.1 used D.2: each prefix advanced as needed, and no further.
    expect(report.coverage).toEqual([{ scope: w.I.scope, from: 0, through: 2 }, { scope: w.D.scope, from: 0, through: 5 }, { scope: w.P.scope, from: 0, through: 2 }]);
    // Seven distinct foreign facts: D.1, D.2, D.4, D.5, P.0, P.2 and I.0, which D.5 used and which was already checked.
    expect([report.dependencies, report.anchors]).toEqual([{ verified: 7, anchored: 0, missing: [] }, []]);
    expect(report.trusts).toEqual([TRUSTS.clock, TRUSTS.head, TRUSTS.sources, TRUSTS.minted, TRUSTS.held, TRUSTS.delivered, TRUSTS.authority, TRUSTS.bounds]);
  });

  test("an anchor that names a used entry exactly is taken on the caller's word: its source is not read, and the report says so", async () => {
    const w = world();
    const anchors = [4, 5].map((seq) => ({ scope: w.D.scope.scope, seq, hash: w.D.entries[seq]!.hash }));
    w.P.entries.length = 0;   // P cannot be read; D is not needed
    const { report } = await replay(w, { anchors, head: { seq: 1, hash: w.I.entries[1]!.hash } });
    // I.2 used P.2, which no anchor names: the replay stops there, having covered I.0 and I.1 on the anchors alone.
    expect(report).toMatchObject({ result: "missing-dependency", at: { seq: 2 }, coverage: [{ scope: w.I.scope, from: 0, through: 1 }], dependencies: { verified: 0, anchored: 2 } });
    expect([report.anchors.map((a) => a.seq), report.trusts.includes(TRUSTS.anchors), report.trusts.includes(TRUSTS.head)]).toEqual([[4, 5], true, false]);
  });
});

/** The first `relation` effect of I.2 says the link is removed. The chain is sealed again, so only the judgment is wrong. */
const altered = (w: World) => rewrite(w.I, 2, (entry) => { entry.effects[0].state = "removed"; });

describe("a history that is not consistent is reported with the right result, at the entry that shows it", () => {
  const cases: { name: string; change: (w: World) => Partial<Options> | void; result: Report["result"]; at?: ["D" | "P" | "I", number]; why: RegExp; covered?: ["D" | "P" | "I", number][] }[] = [
    { name: "a changed byte in an entry: its bytes no longer hash to its hash",
      change: (w) => { w.I.entries[1]!.bytes = w.I.entries[1]!.bytes.replace('"clamped":false', '"clamped":true'); }, result: "mismatch", at: ["I", 1], why: /do not hash/ },
    { name: "a send removed from a source entry: the child's genesis names an entry its creator's history does not have",
      change: (w) => rewrite(w.D, 4, (entry) => { entry.sends = []; }), result: "mismatch", at: ["I", 0], why: /another entry than the source scope has/ },
    { name: "a changed recorded effect: the entry is not what replay derives", change: altered, result: "mismatch", at: ["I", 2], why: /recorded effects are not the ones derived/ },
    { name: "a changed recorded decision: the entry is not what replay derives",
      change: (w) => rewrite(w.I, 2, (entry) => { entry.input.decision = "superseded"; }), result: "mismatch", at: ["I", 2], why: /recorded input, with its decision/ },
    // Witness 18.26, case 6. P.3 used I.2, so I is replayed as a source, and its genesis is checked against the definition that I pins.
    { name: "a source's genesis that records another kind than the genesis act of the definition it pins: `genesis-kind`, at that genesis",
      change: (w) => { rewrite(w.I, 0, (entry) => { entry.input.kind = "link"; }); return { scope: w.P.scope.scope }; }, result: "mismatch", at: ["I", 0], why: /^genesis-kind: / },
    // The member is always present, and is never the empty text (section 4.1). Without it, the bytes are no entry of the contract.
    { name: "a genesis whose kind is the empty text: its bytes are not an entry", change: (w) => rewrite(w.I, 0, (entry) => { entry.input.kind = ""; }), result: "mismatch", at: ["I", 0], why: /bytes are not an entry/ },
    // I.0 used D.4, and D.2, on the way to it, used P.0: the entry named is the one that used the history that cannot be read.
    { name: "a source history that cannot be read", change: (w) => { w.P.entries.length = 0; }, result: "missing-dependency", at: ["D", 2], why: /cannot be read, and no anchor/ },
    { name: "a wrong incarnation in a reference: the source scope's genesis minted another",
      change: (w) => rewrite(w.I, 1, (entry) => { entry.input.from.at.inc = w.P.scope.inc; entry.uses[0].fact.at.inc = w.P.scope.inc; }), result: "mismatch", at: ["I", 1], why: /wrong incarnation/ },
    { name: "a history cut short of the head the caller holds", change: (w) => { const head = w.I.entries.pop()!; return { head: { seq: head.seq, hash: head.hash } }; }, result: "mismatch", at: ["I", 1], why: /does not reach the expected head/ },
    { name: "a history that forks from the head the caller holds: sealed again, and consistent with itself",
      change: (w) => { const head = w.I.entries[2]!; rewrite(w.I, 2, (entry) => { entry.time = "2026-10-04T12:00:01Z"; }); return { head: { seq: 2, hash: head.hash } }; }, result: "mismatch", at: ["I", 2], why: /forks from the expected head/ },
    { name: "a missing retained input: the bytes of a used foreign entry", change: (w) => { w.I.retained = w.I.retained.filter((r) => r.digest !== entryOf(w.I, 1).uses[0]!.content); }, result: "incomplete", at: ["I", 1], why: /retained input is missing/ },
    // The source scope's own definition states its name. A copy kept beside another name is not what that scope would have answered.
    { name: "a retained copy of a used entry, kept with another definition name than its source's definition states",
      change: (w) => { w.I.retained.find((r) => r.kind === "entry")!.under = "another"; }, result: "mismatch", at: ["I", 0], why: /names another definition than that scope pins/ },
    // The four entries read were I.0, D.0, D.1 and D.2. D.2 needed P.0, the fifth. Only D.0 and D.1 were checked to their end:
    // I.0 waits on D.4 and D.2 on P.0, and an entry is not covered until every fact it used is shown.
    // The runtime seals no entry over the entry size bound, so a history with one was not written under these bounds, though it derives.
    { name: "an entry over the entry size bound the replay was given", change: () => ({ bounds: { ...PROPOSED_BOUNDS, entryBytes: 1000 } }), result: "mismatch", at: ["I", 0], why: /seals none over 1000/ },
    // The bytes are counted as each reply arrives: the page that would pass the limit is not taken in.
    { name: "the byte limit reached: the reply that would pass it is not taken in", change: () => ({ limits: { bytes: 12_000 } }), result: "incomplete", why: /limit of 12000 bytes/ },
    { name: "a limit reached: the report states what was covered before it", change: () => ({ limits: { entries: 4 } }), result: "incomplete", why: /limit of 4 entries/, covered: [["D", 1]] },
  ];
  test.each(cases)("$name", async ({ change, result, at, why, covered: stated }) => {
    const w = world();
    const over = change(w) ?? {};
    const found = await replay(w, over);
    expect([found.report.result, found.report.at && [found.report.at.at.scope, found.report.at.seq]]).toEqual([result, at && [w[at[0]].scope.scope, at[1]]]);
    expect(found.why).toMatch(why);
    // Whatever stopped it, the report claims only what it covered: in the scope of the entry it names, nothing at or after that entry.
    const covered = found.report.coverage.find((c) => c.scope.scope === found.report.at?.at.scope)?.through ?? -1;
    expect(covered).toBeLessThan(found.report.at?.seq ?? 0);
    if (stated) expect(found.report.coverage).toEqual(stated.map(([scope, through]) => ({ scope: w[scope].scope, from: 0, through })));
  });
});

describe("integrity mode (section 9.5)", () => {
  test("a history whose judgment was altered and whose chain is intact passes, and the report says in words that no judgment was derived again; replay of the same history does not pass", async () => {
    const w = world();
    altered(w);
    const { report, why } = await replay(w, { mode: "integrity" });
    expect([report.result, report.coverage, report.dependencies.verified]).toEqual(["consistent", [{ scope: w.I.scope, from: 0, through: 2 }], 0]);
    expect(report.trusts).toEqual([TRUSTS.judgments, TRUSTS.facts, TRUSTS.clock, TRUSTS.head]);
    const text = render(report, why);
    expect(text).toMatch(/Mode: integrity\..* No judgment was derived again\./);
    expect(text).toMatch(/^Result: consistent, for the mode, target, coverage and trusts stated below\./);
    // Section 9.5: the word is not used alone. This rendering does not use it at all.
    expect(text).not.toMatch(/verified/i);
    expect((await replay(w)).report.result).toBe("mismatch");
    // Integrity mode reads no definition, so it does not check the kind that a genesis records (section 4.1).
    const k = world();
    rewrite(k.I, 0, (entry) => { entry.input.kind = "link"; });
    expect((await replay(k, { mode: "integrity" })).report.result).toBe("consistent");
  });
});
