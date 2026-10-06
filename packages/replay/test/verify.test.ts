import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type ObservationUse, type Report } from "@generalbusiness/artroom-contract";
import { canonicalize, textDigest } from "@generalbusiness/artroom-bytes";
import { grantFrom, observationOf } from "@generalbusiness/artroom-derive";
import { founded, keys, notesDefinition, on, otherLane, t, type Actor, type Ledger } from "@generalbusiness/artroom-derive/testing";
import { C, cap, clean } from "../../derive/test/fixtures-hold.ts";
import { MEMBERSHIP, RULES_SCOPE as RULES, firstExtents, platform, standingOf } from "../../platform/src/index.ts";
import { Roster } from "../../platform/test/support.ts";
import { Rulebook } from "../../platform/test/support-rules.ts";
import { MemorySource, TRUSTS, platformCode, render, verify, type MemoryScope, type Options, type Tally } from "../src/index.ts";
import { View } from "../src/view.ts";
import { Gate, Lane, OWNER, RULES_SCOPE } from "./staging.ts";
import { entryOf, histories as ledgers, rewrite, served, sourceOf, world, type World } from "./world.ts";

/**
 * The fixture histories were written under the test authority of derive's fixtures, a STAND-IN whose grants hold no freshness
 * proof. Each replay here says so (`AS_RECORDED`): such a grant is taken as recorded, and the report lists `authority` as trusted.
 */
const AS_RECORDED = { grants: "as-recorded" } as const;
const replay = (w: World, over: Partial<Options> = {}) => verify(sourceOf(w), { mode: "replay", scope: w.I.scope.scope, ...AS_RECORDED, ...over });

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
    const { report, why } = await verify(source, { mode: "replay", scope: T.at.scope, ...AS_RECORDED });
    expect([report.result, report.at, report.redacted.map((r) => r.tombstone.seq)]).toEqual(["incomplete", U.fact(1), [3]]);
    expect(why).toBe(`a retained input is missing: the detached text ${owed}, which no later entry of ${U.at.scope} redacts`);

    // The same histories, and U redacts its text at U.2, which no reference names. U is read to its head, and both tombstones answer.
    const whole = histories(true);
    const found = await verify(whole.source, { mode: "replay", scope: whole.T.at.scope, ...AS_RECORDED });
    expect([found.report.result, found.why, found.report.redacted.map((r) => r.tombstone)]).toEqual(["consistent", null, [whole.S.fact(3), whole.U.fact(2)]]);
    expect(found.report.coverage).toEqual([whole.T, whole.S, whole.U].map((L) => ({ scope: L.at, from: 0, through: L.head.seq })));

    // The limit on depth counts foreign facts from the target, also in the settlement. S is one fact from T, so U.1, which S.2 uses, is two.
    const within = async (depth: number) => { const { report, why } = await verify(histories(true).source, { mode: "replay", ...AS_RECORDED, scope: whole.T.at.scope, limits: { depth } }); return [report.result, report.at?.seq ?? null, why]; };
    expect([await within(1), await within(2)]).toEqual([["incomplete", 2, "the limit of 1 on the depth of foreign facts was reached"], ["consistent", null, null]]);
  });

  // I3 deltas, section 31, entry FD4. The work is counted, and never timed.
  test("a tombstone answers for the texts that it lists by one lookup for each: a note that held 30 texts whose bytes are gone, and its one tombstone, are 30 lookups", async () => {
    const S = founded(notesDefinition, {}, "s");
    const did = (kind: string, fields: Record<string, string> = {}, beside: object = {}) => { if (S.act(keys.rita, kind, { ...on(S, 0), fields }, beside).result !== "write") throw new Error(`${kind} was not written`); };
    for (let i = 0; i < 30; i++) did("write", { body: textDigest(`body ${i}`) }, { texts: () => 7 });
    did("strike");
    const tally = tallied();
    const { report } = await verify(new MemorySource([served(S, [S])]), { mode: "replay", scope: S.at.scope, ...AS_RECORDED }, tally);
    // The earlier code looked for each of the 30 owed texts in the list of 30, and again to remove it: 930 comparisons, counted by reading it.
    expect([report.result, report.redacted.map((r) => r.tombstone.seq), tally.owed]).toEqual(["consistent", [31], 30]);
  });
});

const tallied = (): Tally => ({ folds: 0, values: 0, states: 0, runs: 0, owed: 0 });

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
    // Section 9.3, point E13: a verifier that is given no code for the step of a preparation entry says so, and never reports `consistent`. The same entry without its step is no entry.
    { name: "a well-formed preparation entry in a history, for a verifier with no rules for its step: `unsupported-definition`, at that entry",
      change: (w) => rewrite(w.I, 2, (entry) => { entry.input = { ...preparing(w), step: "check" }; }), result: "unsupported-definition", at: ["I", 2], why: /a preparation, and this replay has no rules/ },
    // Section 9.3, point E13: the same for an outcome entry, for a verifier that is given the rules of no owner of an operation.
    { name: "a well-formed outcome entry in a history, for a verifier with no owner rules: `unsupported-definition`, at that entry",
      change: (w) => rewrite(w.I, 2, (entry) => { entry.input = { type: "outcome", operation: "1:0", attempt: 1, owner: "hold@1", kind: "mint", result: "unknown", evidence: { basis: "none", body: null } }; }), result: "unsupported-definition", at: ["I", 2], why: /an outcome, and this replay has no rules/ },
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
    // Section 9.5 (row I3-57): the report's `name` is there exactly for a mismatch that the contract names, and is the name that the finding begins with.
    expect(found.report.name).toBe(/^genesis-kind: /.test(found.why ?? "") ? "genesis-kind" : undefined);
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

/**
 * The histories of `staging.ts`: a staging lane and a scope under made-up platform data, each written by derive's judges with
 * the capability code or with made-up rules. Their creator, their membership and every outside answer are STAND-INS, which
 * that file labels. The grants hold a freshness proof, so each replay here reads them as `proven`, the default.
 */
describe("a preparation, its outcomes and an ancestry record are derived again (sections 5.5, 9.3 and 16.4)", () => {
  const { rita, una } = keys;
  const X = C("a");
  /**
   * A lane that stages the commit X for a report, checks it, admits the report, refuses it, and retires the root.
   *
   *   5 preparation `instance`   6 preparation `stage`   7 outcome of the staging: the root is live, and the check is opened
   *   8 outcome of the check: the check entry, with the ancestry record   9 act `report`, admitted on the guard `ancestry`
   *   10 act `refuse-report`: the pin is released   11 timed: the hold ends   12 preparation `retire`   13 outcome of the delete: the root is retired
   */
  function staged(checked = true) {
    const s = new Lane();
    s.prepare(una, "instance", { hold: s.hold, task: { ...otherLane, kind: "task" }, instance: "i1" });
    const report = s.intent(una, "report", { expected: { commitment: s.item(s.commitment).revision }, fields: { commitment: s.commitment, commit: X } });
    const stage = s.asked(report, "stage");
    const live = s.outcome(s.opened(stage.seq, "stage"), "confirmed", {}, "read");
    if (!checked) return s;
    s.outcome(s.opened(live.seq, "check"), "confirmed", { record: clean(s.at, X, 1) }, "own-answer");
    if (s.submit(report).result !== "write") throw new Error("the report was not admitted");
    s.did(rita, "refuse-report", { on: s.last.seq, expected: { on: 1 } });
    s.now = t(700);
    s.drain();
    const retiring = s.prepare(rita, "retire", { root: 1 });
    s.outcome(s.opened(retiring.seq, "delete"), "confirmed", {}, "read");
    return s;
  }
  const replayed = (s: Lane, history: MemoryScope, over: Partial<Options> = {}) => verify(new MemorySource([history]), { mode: "replay", scope: s.at.scope, anchors: s.anchors(), capabilities: cap, owners: cap, ...over });

  test("a lane's history with preparations and their outcomes, and no ancestry record, is consistent, and the report lists what of the outside is trusted (witness 18.4)", async () => {
    const s = staged(false);
    const { report, why } = await replayed(s, s.served());
    expect([s.last.input.type, report.result, why, report.coverage]).toEqual(["outcome", "consistent", null, [{ scope: s.at, from: 0, through: 7 }]]);
    // The stand-ins are anchored: the directory's two entries and the one head of membership.
    expect(report.trusts).toEqual([TRUSTS.clock, TRUSTS.head, TRUSTS.minted, TRUSTS.held, TRUSTS.delivered, TRUSTS.observed, TRUSTS.outcomes, TRUSTS.dispatched, TRUSTS.anchors, TRUSTS.bounds]);
  });

  test("a lane's history with a check entry, after the root is retired: every entry is derived, the act that the guard `ancestry` admitted among them, from the record and the retained snapshot; the walk is not derived, so the result is `incomplete` at the check entry and never `consistent` (T24; witness 18.10; I3 deltas, entry EU2)", async () => {
    const s = staged();
    expect([s.entries.map(({ entry }) => entry.input.type).slice(5), s.state.record("hold@1", "root", [1])?.state]).toEqual([["preparation", "preparation", "outcome", "outcome", "act", "act", "timed", "preparation", "outcome"], "retired"]);
    const { report, why } = await replayed(s, s.served());
    // No entry is a mismatch through the head, entry 13, which follows the retirement. The one thing not shown is the walk of the record in entry 8.
    expect([report.result, report.at, report.coverage]).toEqual(["incomplete", s.fact(8), [{ scope: s.at, from: 0, through: 13 }]]);
    expect(why).toBe(`the walk of the ancestry record in entry 8 of ${s.at.scope} was not derived: this replay reads no commit, so the stops, the basis of the start, \`published\`, the list F and the count of visited commits are not shown`);
    // Nothing of the Git host is read: that it returned the snapshot and the head is listed as trusted.
    expect(report.trusts).toEqual([TRUSTS.clock, TRUSTS.head, TRUSTS.minted, TRUSTS.held, TRUSTS.delivered, TRUSTS.observed, TRUSTS.outcomes, TRUSTS.dispatched, TRUSTS.staged, TRUSTS.anchors, TRUSTS.bounds]);
  });

  /** Both copies of the ancestry record that the check entry holds: in its evidence, and in the `check` record that its rule derives. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records = (entry: any) => [entry.input.evidence.body.record, entry.effects[1].values.record];
  const cases: { name: string; change: (history: MemoryScope) => Partial<Options> | void; result: Report["result"]; at: number; why: RegExp }[] = [
    { name: "a record that a preparation entry did not derive", change: (h) => rewrite(h, 5, (entry) => { entry.effects[0].state = "past"; }), result: "mismatch", at: 5, why: /recorded effects are not the ones derived/ },
    // The step `instance` asks its grant on an observation of ten seconds. This one began fifteen seconds before the entry.
    { name: "a preparation whose grant rests on an observation outside the window of its step",
      change: (h) => rewrite(h, 5, (entry) => { entry.input.authority[0].fresh.observation.at = "2026-10-04T11:59:45Z"; }), result: "mismatch", at: 5, why: /the retained observation does not give the grant: age/ },
    { name: "a preparation whose grant is of another key than the one that signed", change: (h) => rewrite(h, 5, (entry) => { entry.input.authority = (entryOf(h, 2).input as { authority?: unknown }).authority; }), result: "mismatch", at: 5, why: /does not give the grant: (key|use)/ },
    { name: "a preparation whose signed intent was changed, in integrity mode too",
      change: (h) => { rewrite(h, 5, (entry) => { entry.input.signed.intent.fields.instance = "i2"; }); return { mode: "integrity" }; }, result: "mismatch", at: 5, why: /the preparation's signature is not its actor's/ },
    { name: "an effect that the owner's rule does not derive from an outcome", change: (h) => rewrite(h, 7, (entry) => { entry.effects[1].state = "creating"; }), result: "mismatch", at: 7, why: /recorded effects are not the ones derived/ },
    // Witness 18.41, case 7.
    { name: "an outcome whose input names another owner than its operation has", change: (h) => rewrite(h, 8, (entry) => { entry.input.owner = "git-read@1"; }), result: "mismatch", at: 8, why: /names another owner or kind than its operation has/ },
    { name: "an outcome that the rules of its owner are not given for: `unsupported-definition`", change: () => ({ owners: undefined }), result: "unsupported-definition", at: 7, why: /an outcome, and this replay has no rules/ },
    // Witness 18.10: with the snapshot's bytes gone the replay makes no claim for that check.
    { name: "a check entry whose snapshot is no longer retained: `incomplete`", change: (h) => { h.retained = h.retained.filter((r) => r.kind !== "snapshot"); }, result: "incomplete", at: 8, why: /retained input is missing: the snapshot of staged refs/ },
    // Row I3-48 (the contract's revision 20, point EZ5): a verifier takes a retained input only as its canonical bytes. The same
    // pairs with one space before them are not the input that the digest names, so the verifier lacks it.
    { name: "a check entry whose retained snapshot is not its canonical bytes: `incomplete`", change: (h) => { h.retained = h.retained.map((r) => (r.kind === "snapshot" ? { ...r, bytes: ` ${r.bytes}` } : r)); }, result: "incomplete", at: 8, why: /a retained input is not the one named: the snapshot of staged refs/ },
    { name: "an ancestry record that states another count than its snapshot holds", change: (h) => rewrite(h, 8, (entry) => { for (const record of records(entry)) record.snapshot.count = 2; }), result: "mismatch", at: 8, why: /states 2 staged refs, and the snapshot that it names holds 1/ },
    // The check entry still derives: its rule records what the answer says. The report names nothing, so the guard refuses the act that the entry says was admitted.
    { name: "an ancestry record that lists a staged commit of other work: the act that it admitted is not derived",
      change: (h) => rewrite(h, 8, (entry) => { for (const record of records(entry)) record.F = [{ commit: C("1"), ref: "refs/artroom/staged/other" }]; }), result: "mismatch", at: 9, why: /writes no entry: refused, capability-refused/ },
  ];
  test.each(cases.map((row) => [row.name, row] as const))("a history changed in one place: %s", async (_name, { change, result, at, why }) => {
    const s = staged();
    const history = s.served();
    const found = await replayed(s, history, change(history) ?? {});
    expect([found.report.result, found.report.at?.seq, found.report.coverage[0]?.through ?? -1]).toEqual([result, at, at - 1]);
    expect(found.why).toMatch(why);
  });
});

describe("an outcome entry of a platform definition, and where a scope records its membership reference", () => {
  /** What the made-up rule `probe` derives for the outcome: a ticket that the outcome entry opens, with the hash that a ticket must hold. */
  const opens = ({ resolved }: { resolved: { self: number } }) => ({ effects: [{ effect: "open", item: resolved.self, type: "ticket", state: "open" }, { effect: "value", item: resolved.self, slot: "hash", value: textDigest("made") }], sends: [], opens: [] });
  const replayed = (g: Gate, history: MemoryScope, platform: Options["platform"]) => verify(new MemorySource([history]), { mode: "replay", scope: g.at.scope, anchors: g.anchors(), platform });

  test("the outcome is derived with the rule that the data names for its kind; a rule whose output the commit refuses as a fault writes no entry in a replay either, also when the history holds that output (I3 deltas, entries EN2 and EJ11)", async () => {
    const g = new Gate(opens as never);
    const good = await replayed(g, g.served(), g.coded());
    expect([good.report.result, good.why, good.report.trusts.includes(TRUSTS.outcomes), good.report.trusts.includes(platformCode(OWNER))]).toEqual(["consistent", null, true, true]);

    // The same rule, but it sets a fixed slot of the gate, an item that an earlier entry opened. The history holds exactly what it returns.
    const fault = { effect: "party", item: 0, slot: "opener", member: keys.una.member };
    const history = g.served();
    rewrite(history, 3, (entry) => { entry.effects = [entry.effects[0], fault]; });
    const found = await replayed(g, history, g.coded(Gate.rulesWith((() => ({ effects: [fault], sends: [], opens: [] })) as never)));
    expect([found.report.result, found.report.at?.seq, found.why]).toEqual(["mismatch", 3, "derived again, this input writes no entry: unavailable, unavailable"]);
  });

  test("each observation that an act retains in `observed` is derived again: it is of the membership scope that the scope records, and inside the window of the act (section 16.1, guards 1 and 5; I3 deltas, entries EM26 and EU4)", async () => {
    // The guard rule of `enter` reads an observation of a member, so entry 2 retains it. Its value is taken on the anchor of that head.
    const g = new Gate(opens as never, true);
    const good = await replayed(g, g.served(), g.coded());
    expect([entryOf(g.served(), 2).input, good.report.result, good.why]).toMatchObject([{ observed: [{ observation: { subject: "member" }, use: "fresh" }] }, "consistent", null]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changed = async (change: (observation: any) => void) => {
      const history = g.served();
      rewrite(history, 2, (entry) => change(entry.input.observed[0].observation));
      const found = await replayed(g, history, g.coded());
      return [found.report.result, found.report.at?.seq, found.why];
    };
    expect(await changed((o) => { o.at = "2026-10-04T11:55:00Z"; })).toEqual(["mismatch", 2, "derived again on the entry's time, a retained observation is outside its window of 300 seconds"]);
    expect(await changed((o) => { o.of.inc = otherLane.inc; })).toEqual(["mismatch", 2, "a retained observation is not of the membership scope that the scope records, with that incarnation"]);
  });

  // Sections 4.1 and 16.1; witness 18.34, cases 3, 9 and 10 (I3 deltas, entries EU4 and FC4). The rule and the observation are STAND-INS.
  test("each observation that an outcome retains in `observed` is derived again, in the ten-second window and `fresh`; the judge derives the member from what its rule read, so an outcome that holds one which no rule read, or lacks one that its rule read, is a mismatch", async () => {
    /** The rule of the probe's outcome reads the standing of one member. Without it the rule has a fault. */
    const reads = (given: Parameters<typeof opens>[0] & { observed(subject: object): unknown }) => { if (!given.observed({ member: "@paul" })) throw new Error("the standing is not at hand"); return opens(given); };
    const g = new Gate(reads as never, true);
    const good = await replayed(g, g.served(), g.coded());
    expect([entryOf(g.served(), 3).input, good.report.result, good.why, good.report.trusts.includes(TRUSTS.observed)]).toMatchObject([{ type: "outcome", observed: [{ observation: { subject: "member", member: "@paul" }, use: "fresh" }] }, "consistent", null, true]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changed = async (of: Gate, change: (input: any) => void) => {
      const history = of.served();
      rewrite(history, 3, (entry) => change(entry.input));
      const found = await replayed(of, history, of.coded());
      // Row I3-57: a named mismatch has its name in the report, and any other mismatch has none.
      return [found.report.result, found.report.at?.seq, found.why, ...(found.report.name ? [found.report.name] : [])];
    };
    // Guard 5, at ten seconds: the read began eleven seconds before the entry's time. Guard 3: a ten-second kind is `fresh`.
    const eleven = new Date(Date.parse(entryOf(g.served(), 3).time) - 11_000).toISOString().replace(".000Z", "Z");
    expect(await changed(g, (input) => { input.observed[0].observation.at = eleven; })).toEqual(["mismatch", 3, "derived again on the entry's time, a retained observation is outside its window of 10 seconds"]);
    expect(await changed(g, (input) => { input.observed[0].use = "reused"; })).toEqual(["mismatch", 3, "observation-reused: an observation of a ten-second kind serves one commit, and the entry retains it as reused", "observation-reused"]);
    // The entry lacks the observation that its rule reads: the rule has a fault, and no entry is derived.
    expect(await changed(g, (input) => { delete input.observed; })).toEqual(["mismatch", 3, "derived again, this input writes no entry: unavailable, unavailable"]);
    // The entry holds an observation that no rule of it reads: the judge derives an input without it.
    const plain = new Gate(opens as never, true);
    const one = plain.seen();
    expect("observed" in entryOf(plain.served(), 3).input).toBe(false);
    expect(await changed(plain, (input) => { input.observed = [one]; })).toEqual(["mismatch", 3, "the recorded input, with its decision, is not the one derived again"]);

    // An observation of the rules is of the rules scope that the scope records (guard 1), where its version states where: with
    // an incarnation, or with the scope ID alone, which the entry's own observation then fixes. Its value is taken on the anchor
    // of that head: no version of a rules scope answers a read yet. With no such rule the entry is `unsupported-definition`.
    const ruled = new Gate(((given: Parameters<typeof reads>[0]) => { if (!given.observed({ asked: "rules" })) throw new Error("the rules are not at hand"); return opens(given); }) as never, true);
    const under = async (rulesScope?: () => { scope: string; kind: string; inc: string | null }) => {
      const found = await replayed(ruled, ruled.served(), ruled.coded(ruled.rules, undefined, rulesScope as never));
      return [found.report.result, found.report.at?.seq ?? null, found.why];
    };
    expect(entryOf(ruled.served(), 3).input).toMatchObject({ observed: [{ observation: { subject: "rules", of: RULES_SCOPE } }] });
    expect([await under(() => RULES_SCOPE), await under(() => ({ ...RULES_SCOPE, inc: null })), await under(() => ({ ...RULES_SCOPE, inc: otherLane.inc })), await under()]).toEqual([
      ["consistent", null, null], ["consistent", null, null],
      ["mismatch", 3, "a retained observation of the rules is not of the rules scope that the scope records, with that incarnation"],
      ["unsupported-definition", 3, "the entry retains an observation of the rules, and this replay has no rule for where a scope records its rules reference"],
    ]);
  });

  // Scope contract, revision 19, sections 6.2 and 9.2; witness 18.45, case 8. The data and the rules are STAND-INS.
  test("a value that an entry names is a retained input of the kind `value`, under its domain: a replay with the bytes derives the entry again, and one without them, with other bytes, or with the bytes under another domain is `incomplete` and no mismatch", async () => {
    const g = new Gate(opens as never, false, true);
    const good = await replayed(g, g.served(), g.coded());
    expect([entryOf(g.served(), 1).input, good.report.result, good.why]).toMatchObject([{ signed: { intent: { fields: { proof: g.proof!.digest } } } }, "consistent", null]);
    const without = async (change: (retained: MemoryScope["retained"]) => MemoryScope["retained"]) => {
      const history = g.served();
      const found = await replayed(g, { ...history, retained: change(history.retained) }, g.coded());
      return [found.report.result, found.report.at?.seq, found.why];
    };
    const what = `the value that the field proof names, in the domain ${g.proof!.domain}, ${g.proof!.digest}`;
    expect(await without(() => [])).toEqual(["incomplete", 1, `a retained input is missing: ${what} (not-found)`]);
    expect(await without(([value]) => [{ ...value!, domain: "gate-other-1" }])).toEqual(["incomplete", 1, `a retained input is missing: ${what} (not-found)`]);
    expect(await without(([value]) => [{ ...value!, bytes: '{"seat":13}' }])).toEqual(["incomplete", 1, `a retained input is not the one named: ${what}`]);
  });

  test("a scope whose platform version records its membership reference in its state is replayed on that reference, as a directory's slot is read; with no such reference its grant covers nothing (I3 deltas, entry EP14)", async () => {
    // The scope was founded, so its genesis records no membership scope. Its grants are filters on the membership scope.
    const g = new Gate(opens as never);
    const [recorded, none] = [await replayed(g, g.served(), g.coded()), await replayed(g, g.served(), g.coded(g.rules, null))];
    expect([recorded.report.result, none.report.result, none.report.at?.seq, none.why]).toEqual(["consistent", "mismatch", 1, "the entry records a grant, and its row or its step names no action, its scope records no membership scope, or no window is stated for it"]);
  });
});

/**
 * The value of an observation, from the history of its source (section 16.1, "Replay"; I3 deltas, section 31). The membership scope
 * and the rules scope are the platform package's own data and rules, and derive's judges wrote every entry. Three things are
 * STAND-INS, of the platform package's test support: the office that creates the membership scope, the registrar that creates the
 * rules scope, and the reads. No scope read membership: each observation is membership's own answer (`standingOf`) from its state
 * at the head named, written into a grant by the test. So a replay reads the grants as `proven`, and derives each value again.
 */
describe("the value of an observation is derived once from the history of its source, and every entry that names it is compared with it", () => {
  const { rita, una } = keys;
  /**
   * A membership scope M with two admins, rita and una. Its head is L when una has joined, and H after 40 more entries. A rules
   * scope R that records M: `rounds` acts `publish`, as `acts` says who signs each and on which read.
   *
   *   M: 0 genesis, 1 confirmation, 2 seat, 3 first-key, 4 invitation, 5 join (L), 6 to 45 invitations (H)      R: 0 genesis, 1 confirmation, then each `publish`
   */
  function repository(acts: (at: { m: Roster; L: number; H: number; seen: (who: Actor, head: number, at: string) => ObservationUse["observation"] }, i: number, prior: (n: number) => ObservationUse["prior"]) => { who: Actor; use: ObservationUse }, rounds: number) {
    const m = new Roster().seated();
    const invite = (handle: string, role: string) => m.did(rita, "invite-member", { fields: { handle, role, inviteHash: textDigest(handle), inviteEnds: t(3600) } }).seq;
    if (m.act(una, "join", { fields: { invitation: invite("@una", "admin"), secret: "@una" } }).result !== "write") throw new Error("una did not join");
    const L = m.head.seq;
    for (let i = 0; i < 40; i++) invite(`@n${i}`, "member");
    const H = m.head.seq;
    const r = new Rulebook(true, m.at.scope);
    /** STAND-IN for a read: what M answers for that key from its state at that head, as an observation that began at `at`. */
    const seen = (who: Actor, head: number, at: string) => observationOf(standingOf(m.replay(head + 1), { of: m.at, key: who.key }), at as never)!;
    const priors = new Map<number, ObservationUse["prior"]>();
    for (let i = 0; i < rounds; i++) {
      r.now = t(i + 1);
      const { who, use } = acts({ m, L, H, seen }, i, (n) => priors.get(n) ?? null);
      const fields = { approvals: 2, ownerMayReview: true, checks: [], labels: ["bug"], extents: firstExtents({ approvals: 2, checks: [] }) };
      const judged = r.act(who, "publish", { on: 0, expected: { on: r.item(0).revision }, fields: fields as never }, { grants: [{ grant: grantFrom(use), current: true }], membership: m.at });
      if (judged.result !== "write") throw new Error(`publish ${i} was not written: ${JSON.stringify(judged)}`);
      priors.set(use.read.n, r.head);
    }
    const all = [r, r.registrar, m, m.office];
    return { m, r, L, H, scopes: () => all.map((ledger) => served(ledger, all)) };
  }
  const replayed = (scopes: MemoryScope[], target: Ledger, tally: Tally) => verify(new MemorySource(scopes, 50), { mode: "replay", scope: target.at.scope, platform }, tally);
  /** The distinct things that the grants of a history ask a source: the observed scope, its incarnation, the head and the key. */
  const asked = (history: MemoryScope) => new Set(history.entries.flatMap((_, seq) => { const input = entryOf(history, seq).input; return input.type === "act" ? input.authority.map(({ fresh }) => { const o = fresh!.observation as { of: unknown; head: unknown; key: unknown }; return canonicalize([o.of, o.head, o.key]); }) : []; }));

  /**
   * una and rita publish in turn, 20 times each, in one run: una on read 1, of head H, and rita on read 2, of head L. Each is `fresh`
   * once and `reused` after. Then una publishes on a new read, 3, of head H: R.2 to R.41 alternate, and R.42 is the last.
   */
  const alternating = () => repository(({ H, L, seen }, i, prior) => {
    if (i === 40) return { who: una, use: { observation: seen(una, H, t(41)), read: { run: "run-1", n: 3 }, use: "fresh", prior: null } };
    const [who, head, n] = i % 2 === 0 ? [una, H, 1] as const : [rita, L, 2] as const;
    return { who, use: { observation: seen(who, head, t(0)), read: { run: "run-1", n }, use: prior(n) ? "reused" : "fresh", prior: prior(n) } as ObservationUse };
  }, 41);

  test("two admins who alternate `publish` on membership heads L and H: the answer is the earlier code's, and the work is the source's history folded once and one value for each distinct head and key, whatever the number of grants", async () => {
    const { m, r, L, H, scopes } = alternating();
    const tally = tallied();
    const { report, why } = await replayed(scopes(), r, tally);
    // What the code before this change answered for this history, taken from it: the result, the coverage, the facts and the trusts.
    expect([L, H, report.result, why, report.coverage.map((covered) => [covered.scope.kind, covered.through]), report.dependencies]).toEqual([
      5, 45, "consistent", null, [["rules", 42], ["directory", 1], ["membership", 45], ["directory", 1]], { verified: 8, anchored: 0, missing: [] },
    ]);
    expect(report.trusts).toEqual([TRUSTS.clock, TRUSTS.head, TRUSTS.sources, TRUSTS.minted, TRUSTS.held, TRUSTS.delivered, TRUSTS.observed, TRUSTS.bounds, platformCode(MEMBERSHIP), platformCode(RULES)]);
    // The count: 41 grants name two distinct heads and keys. M's 46 entries are folded once, in order, and each value is derived once.
    // rita's head L is first named when the view is folded through H, so its state is built from the view's log, and no entry is folded again.
    // The two lookups of a run are R's one run and M's one run: each scope's first entry that retains an observation.
    const distinct = asked(scopes()[0]!).size;
    expect([distinct, tally.folds <= m.entries.length, tally.values <= distinct, tally]).toEqual([2, true, true, { ...tallied(), folds: 46, values: 2, states: 1, runs: 2 }]);
    // The earlier code, on this history, with a counter at the same two places (observed, at 441727709): 966 folds, 46 for each change
    // of head but the first pair's, and 41 values, one for each grant.
  });

  test("an entry that names a head and a key whose value is already derived is still compared with it: a standing that membership never gave is the mismatch that it was", async () => {
    const { m, r, scopes } = alternating();
    const changed = scopes();
    // R.42 is on a new read of una's key at H, whose value R.2 derived. It is said to hold another role, which no guard of the grant reads.
    rewrite(changed[0]!, 42, (entry: { input: { authority: { fresh: { observation: { role: string } } }[] } }) => { entry.input.authority[0]!.fresh.observation.role = "maintainer"; });
    const tally = tallied();
    const { report, why } = await replayed(changed, r, tally);
    // The earlier code's answer for the changed history, taken from it.
    expect([report.result, report.at?.seq, why, report.coverage[0]?.through, tally.values]).toEqual(["mismatch", 42, `the retained observation is not what the history of ${m.at.scope} gives that key at its entry 45`, 41, 2]);
  });

  // I3 deltas, section 31, entry FD3.
  test("40 acts, each on a read of a run of its own: each run is looked up once among the runs seen, and the value of the one head and key is derived once", async () => {
    const { r, scopes } = repository(({ L, seen }, i) => ({ who: rita, use: { observation: seen(rita, L, t(i + 1)), read: { run: `run-${i}`, n: 1 }, use: "fresh", prior: null } }), 40);
    const tally = tallied();
    const { report, why } = await replayed(scopes(), r, tally);
    // R's 40 runs, and the one run of M's own act below L. The earlier code compared each of R's runs with every run before it: 780
    // comparisons on this history (observed, with a counter, at 441727709).
    expect([report.result, why, tally]).toEqual(["consistent", null, { ...tallied(), folds: 6, values: 1, runs: 41 }]);
  });

  test("a view gives the state of a scope at every head that it was folded through, asked in any order, and it is the state that a fold from the genesis to that head gives", () => {
    const { una: performer } = keys;
    const lane = new Lane();
    lane.prepare(performer, "instance", { hold: lane.hold, task: { ...otherLane, kind: "task" }, instance: "i1" });
    const note = founded(notesDefinition, {}, "s");
    for (const [kind, over] of [["write", { fields: { body: textDigest("a body") } }], ["strike", {}]] as const) if (note.act(rita, kind, { ...on(note, 0), ...over }, { texts: () => 6 }).result !== "write") throw new Error(`${kind} was not written`);
    const { D, P, I } = ledgers();
    // Between them the histories write every table of a state but the observed heads of another scope, which R's history writes.
    for (const ledger of [new Roster().seated(), lane, note, D, P, I, alternating().r] as Ledger[]) {
      const view = new View();
      for (const { entry, hash } of ledger.entries) view.fold(ledger.definition, entry as Entry, hash);
      const last = ledger.entries.length - 1;
      // From the last head down, and then an early head after a late one.
      for (const seq of [...ledger.entries.map((_, i) => last - i), last, 0]) expect([ledger.definition.declared.name, seq, canonicalize(view.at(seq).state.all())]).toEqual([ledger.definition.declared.name, seq, ledger.replay(seq + 1).snapshot()]);
    }
  });
});
