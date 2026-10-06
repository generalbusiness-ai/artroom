import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Report } from "@generalbusiness/artroom-contract";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { founded, keys, notesDefinition, on, type Ledger } from "@generalbusiness/artroom-derive/testing";
import { MemorySource, TRUSTS, render, verify, type Options } from "../src/index.ts";
import { entryOf, rewrite, served, sourceOf, world, type World } from "./world.ts";

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

describe("a detached text whose bytes are gone (section 9.3)", () => {
  /**
   * Three directories under the notes definition, each with the note of its genesis. S and U write a body, T vouches with S.1,
   * S vouches with U.1, and S strikes its note. The bytes of both texts were there when the entries were written. The source
   * now serves neither: S redacted its text, and U lost its own, unless `struck` says that U redacted it too.
   *
   *   S: 0 genesis, 1 write, 2 vouch (U.1), 3 strike      U: 0 genesis, 1 write, and 2 strike if `struck`      T: 0 genesis, 1 vouch (S.1)
   */
  const histories = (struck: boolean) => {
    const [S, U, T] = ["s", "u", "t"].map((key) => founded(notesDefinition, {}, key)) as [Ledger, Ledger, Ledger];
    /** An act of rita on the note of the genesis, with what travels beside it. It must be written. */
    const did = (L: Ledger, kind: string, fields: Record<string, string> = {}, beside: object = {}) => {
      const judgment = L.act(keys.rita, kind, { ...on(L, 0), fields }, beside);
      if (judgment.result !== "write") throw new Error(`${kind} was not written: ${JSON.stringify(judgment)}`);
      return L.last.seq;
    };
    const wrote = (L: Ledger, body: string) => did(L, "write", { body: textDigest(body) }, { texts: () => body.length });
    const vouched = (L: Ledger, from: Ledger, seq: number) => did(L, "vouch", {}, { presented: { proof: from.fact(seq) }, facts: [{ fact: from.fact(seq), entry: from.entries[seq]!.entry, under: from.under }] });
    const [s, u] = [wrote(S, "the body of S"), wrote(U, "the body of U")];
    vouched(T, S, s);
    vouched(S, U, u);
    did(S, "strike");
    if (struck) did(U, "strike");
    const all = [S, U, T];
    return { S, U, T, owed: textDigest("the body of U"), source: new MemorySource(all.map((ledger) => served(ledger, all)), 2) };
  };

  test("a source scope that is first read while another scope's missing text is settled is itself read to its head: a text it owes with no tombstone makes the replay incomplete, and with one it is reported as redacted; the depth of its chain is counted from the target", async () => {
    // T.1 needs S through 1, where S owes its text. Reading S on to its tombstone, S.3, proves U.1 at S.2: U is first read then.
    const { U, T, owed, source } = histories(false);
    const { report, why } = await verify(source, { mode: "replay", scope: T.at.scope });
    expect([report.result, report.at, report.redacted.map((r) => r.tombstone.seq)]).toEqual(["incomplete", U.fact(1), [3]]);
    expect(why).toBe(`a retained input is missing: the detached text ${owed}, which no later entry of ${U.at.scope} redacts`);

    // The same histories, and U redacts its text at U.2, which no reference names. U is read to its head, and both tombstones answer.
    const whole = histories(true);
    const found = await verify(whole.source, { mode: "replay", scope: whole.T.at.scope });
    expect([found.report.result, found.why, found.report.redacted.map((r) => r.tombstone)]).toEqual(["consistent", null, [whole.S.fact(3), whole.U.fact(2)]]);
    expect(found.report.coverage).toEqual([whole.T, whole.S, whole.U].map((L) => ({ scope: L.at, from: 0, through: L.head.seq })));

    // The limit on depth counts foreign facts from the target, also in the settlement. S is one fact from T, so U.1, which S.2 uses, is two.
    const within = async (depth: number) => { const { report, why } = await verify(histories(true).source, { mode: "replay", scope: whole.T.at.scope, limits: { depth } }); return [report.result, report.at?.seq ?? null, why]; };
    expect([await within(1), await within(2)]).toEqual([["incomplete", 2, "the limit of 1 on the depth of foreign facts was reached"], ["consistent", null, null]]);
  });
});

/** The first `relation` effect of I.2 says the link is removed. The chain is sealed again, so only the judgment is wrong. */
const altered = (w: World) => rewrite(w.I, 2, (entry) => { entry.effects[0].state = "removed"; });

describe("a history that is not consistent is reported with the right result, at the entry that shows it", () => {
  // A preparation input made from the signed intent and grant of the first act in the world's histories, with no step.
  const preparing = (w: World) => {
    const act = [w.D, w.P, w.I].flatMap((h) => h.entries.map((_, seq) => entryOf(h, seq).input)).find((i) => i.type === "act")!;
    return { type: "preparation", signed: act.signed, authority: act.authority, capability: "hold@1" } as Record<string, unknown>;
  };
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
    // Section 9.3: the preparation entry has rules that this verifier lacks (I3 step 16a), so it says so and never reports `consistent`. The same entry without its step is no entry.
    { name: "a well-formed preparation entry in a history, for a verifier with no preparation rules: `unsupported-definition`, at that entry",
      change: (w) => rewrite(w.I, 2, (entry) => { entry.input = { ...preparing(w), step: "check" }; }), result: "unsupported-definition", at: ["I", 2], why: /a preparation, and this replay has no rules/ },
    // Section 9.3, point E13: the same for an outcome entry. This verifier has the rules of no owner of an operation (I3 step 22).
    { name: "a well-formed outcome entry in a history, for a verifier with no owner rules: `unsupported-definition`, at that entry",
      change: (w) => rewrite(w.I, 2, (entry) => { entry.input = { type: "outcome", operation: "1:0", attempt: 1, result: "unknown", evidence: { basis: "none", body: null } }; }), result: "unsupported-definition", at: ["I", 2], why: /an outcome, and this replay has no rules/ },
    { name: "a preparation entry with no step: its bytes are not an entry",
      change: (w) => rewrite(w.I, 2, (entry) => { entry.input = preparing(w); }), result: "mismatch", at: ["I", 2], why: /bytes are not an entry/ },
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
