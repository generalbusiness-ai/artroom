import { describe, expect, test } from "vitest";
import type { Entry, FactRef } from "@generalbusiness/artroom-contract";
import { intentDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { ANCESTRY_BOUNDS, ledgerOf, recordEffects, stagedRefName, walk } from "../src/index.ts";
import type { AncestryCheck, GitObject, PriorCheck, WalkInput } from "../src/index.ts";
import { d, directory, keys, membership, otherLane } from "./fixtures.ts";
import { C, Staging, cap, clean, kept } from "./fixtures-hold.ts";

const { una } = keys;
// The commits of the witness tables of section 6.2, by their letters. `Z` is the first commit of the branch.
const [Z, D, D2, U, I, I2, X, A, B, E, R] = ["0", "d", "9", "1", "2", "4", "a", "b", "c", "e", "3"].map(C) as [string, string, string, string, string, string, string, string, string, string, string];
/** A commit object with those parents: one `tree` line, the `parent` lines, an author and a committer. */
const commit = (parents: readonly string[], header = ""): GitObject => ({ type: "commit", body: utf8(`tree ${C("7")}\n${parents.map((p) => `parent ${p}\n`).join("")}${header}author A <a@example.org> 0 +0000\ncommitter A <a@example.org> 0 +0000\n\nparent ${X}\n`) });
type Graph = Record<string, readonly string[] | GitObject>;
const reader = (graph: Graph) => (id: string): GitObject | null => { const found = { [Z]: [], [D]: [Z], ...graph }[id]; return found === undefined ? null : "type" in found ? found : commit(found); };

// S is the staging lane. L2 and L3 are other lanes: only their names in a staged ref are used.
const [S, L2, L3] = [otherLane, directory, membership];
const ref = stagedRefName;
const fact = (seq: number): FactRef => ({ at: S, seq, hash: d(String(seq % 10)) });
const prior = (commitId: string, root: number, seq: number, F: readonly string[] = [], foreign: string | null = null): PriorCheck => ({ commit: commitId, root, checked: fact(seq), foreign, F });

interface Case { name: string; graph: Graph; commit: string; root?: number; head?: string; refs: readonly [lane: typeof S, commit: string, root: number][]; own?: readonly [number, string][]; checks?: readonly PriorCheck[]; inputs?: WalkInput["inputs"]; bounds?: WalkInput["bounds"] }
function walked(c: Case) {
  const root = c.root ?? 5;
  const own = c.own ?? [[root, c.commit]];
  return walk({
    commit: c.commit, head: c.head ?? D, lane: S, root, roots: own.map(([number, at]) => ({ number, commit: at, state: "live" })), checks: c.checks ?? [], inputs: c.inputs ?? [],
    snapshot: c.refs.map(([lane, at, number]) => ({ ref: ref(lane, at, number), target: at })), read: reader(c.graph), bounds: c.bounds ?? ANCESTRY_BOUNDS,
  });
}
/** What a row expects of the record: its `start`, its F, its stops and the count of the parent walk. */
const found = (c: Case) => { const w = walked(c); return w.result === "recorded" ? [w.record.start, w.record.F, w.record.stops, w.record.visited] : w; };

describe("the ancestry walk and the guard `ancestry` (authority note, section 6.2; scope contract, section 16.4)", () => {
  test("the cases of the three witness tables, as rows of one table: the start is never a stop, an own ref never hides a foreign one, published history is never listed, and an own root is a stop only on a prior check (T23)", () => {
    const foreign = ref(L2, U, 1);
    const chain: Graph = { [I]: [D, U], [U]: [D], [I2]: [I] };
    const rows: readonly (readonly [Case, unknown])[] = [
      [{ name: "a. an own new staging", graph: { [X]: [D] }, commit: X, refs: [[S, X, 5]] }, [{ foreign: null }, [], [], 1]],
      [{ name: "e. an exact commit of other work, as the start", graph: { [U]: [D] }, commit: U, refs: [[L2, U, 1], [S, U, 5]] }, [{ foreign, basis: { kind: "row" } }, [{ commit: U, ref: foreign, start: true }], [], 1]],
      [{ name: "i. the same lane, under another commitment: its name does not make a root own", graph: { [U]: [D] }, commit: U, refs: [[S, U, 4], [S, U, 5]] }, [{ foreign: ref(S, U, 4), basis: { kind: "row" } }, [{ commit: U, ref: ref(S, U, 4), start: true }], [], 1]],
      [{ name: "k. the own ref is first in the snapshot: the record names the first foreign ref, not the first ref", graph: { [U]: [D] }, commit: U, refs: [[S, U, 5], [S, U, 9]] }, [{ foreign: ref(S, U, 9), basis: { kind: "row" } }, [{ commit: U, ref: ref(S, U, 9), start: true }], [], 1]],
      [{ name: "j. a foreign parent: the candidate does not certify its own ancestry", graph: chain, commit: I, refs: [[S, I, 5], [L2, U, 1]] }, [{ foreign: null }, [{ commit: U, ref: foreign }], [], 2]],
      [{ name: "d. an own commit that another lane staged later: the basis is the earlier check", graph: { [X]: [D] }, commit: X, refs: [[L3, X, 1], [S, X, 5]], checks: [prior(X, 5, 7)] }, [{ foreign: ref(L3, X, 1), basis: { kind: "own-check", checked: fact(7) } }, [], [], 1]],
      [{ name: "g. the same commit as a selected input", graph: { [U]: [D] }, commit: U, refs: [[L2, U, 1], [S, U, 5]], inputs: [{ commit: U, input: fact(8) }] }, [{ foreign, basis: { kind: "input", input: fact(8) } }, [], [], 1]],
      [{ name: "p. the published head, with another lane's root still on it", graph: {}, commit: D, refs: [[L2, D, 1], [S, D, 5]] }, [{ foreign: ref(L2, D, 1), published: true }, [], [], 1]],
      [{ name: "s. a clean commit on a published parent that still has a staged ref", graph: chain, commit: I2, head: I, refs: [[S, I2, 5], [L2, I, 1]] }, [{ foreign: null }, [], [], 1]],
      [{ name: "v. the head as read is behind: a commit published after the read is not published for this check", graph: { [D2]: [D] }, commit: D2, refs: [[L2, D2, 1], [S, D2, 5]] }, [{ foreign: ref(L2, D2, 1), basis: { kind: "row" } }, [{ commit: D2, ref: ref(L2, D2, 1), start: true }], [], 1]],
      [{ name: "an own ancestor that has no check is listed: whose ref it is makes no difference", graph: { [B]: [A], [A]: [D] }, commit: B, root: 6, own: [[5, A], [6, B]], refs: [[S, A, 5], [S, B, 6]] }, [{ foreign: null }, [{ commit: A, ref: ref(S, A, 5) }], [], 1]],
      [{ name: "its control: with the act for that ancestor admitted first, it is a stop", graph: { [B]: [A], [A]: [D] }, commit: B, root: 6, own: [[5, A], [6, B]], refs: [[S, A, 5], [S, B, 6]], checks: [prior(A, 5, 30)] },
        [{ foreign: null }, [], [{ kind: "own-root", commit: A, root: 5, state: "live", checked: fact(30) }], 1]],
      [{ name: "a checked own root carries what lay under it", graph: chain, commit: I2, root: 6, own: [[5, I], [6, I2]], refs: [[S, I, 5], [S, I2, 6], [L2, U, 1]], checks: [prior(I, 5, 7, [U])] },
        [{ foreign: null }, [{ commit: U, via: I }], [{ kind: "own-root", commit: I, root: 5, state: "live", checked: fact(7) }], 1]],
      [{ name: "a carried commit that is published by the head as read is not carried", graph: chain, commit: I2, head: U, root: 6, own: [[5, I], [6, I2]], refs: [[S, I, 5], [S, I2, 6], [L2, U, 1]], checks: [prior(I, 5, 7, [U])] },
        [{ foreign: null }, [], [{ kind: "own-root", commit: I, root: 5, state: "live", checked: fact(7) }], 1]],
      [{ name: "w. a checked own root that is published is a stop at the branch, and nothing is carried", graph: chain, commit: I2, head: I, root: 6, own: [[5, I], [6, I2]], refs: [[S, I, 5], [S, I2, 6], [L2, U, 1]], checks: [prior(I, 5, 7, [U])] }, [{ foreign: null }, [], [], 1]],
      [{ name: "the stated limit: a commit with no staged ref is not seen", graph: { [B]: [A], [A]: [D] }, commit: B, root: 6, refs: [[S, B, 6]] }, [{ foreign: null }, [], [], 2]],
      [{ name: "the walk does not go past a commit in F", graph: { [X]: [E], [E]: [R], [R]: [D] }, commit: X, refs: [[L2, R, 3], [S, X, 5]] }, [{ foreign: null }, [{ commit: R, ref: ref(L2, R, 3) }], [], 2]],
      // The bounds: past one, there is no judgment. `visited` counts the parent walk only.
      [{ name: "past the bound on visited commits", graph: { [B]: [A], [A]: [D] }, commit: B, root: 6, refs: [[S, B, 6]], bounds: { ...ANCESTRY_BOUNDS, visited: 1 } }, { result: "too-large", bound: "visited" }],
      [{ name: "past the bound on F", graph: chain, commit: I, refs: [[S, I, 5], [L2, U, 1]], bounds: { ...ANCESTRY_BOUNDS, F: 0 } }, { result: "too-large", bound: "F" }],
      // Git objects: every ID, every parent link and every type is checked, and a walk that cannot read gives no record.
      [{ name: "a parent that is missing", graph: { [X]: [U] }, commit: X, refs: [[S, X, 5]] }, { result: "unreadable", reason: "missing-object", object: U }],
      [{ name: "a parent that is not a commit, though its bytes read as one", graph: { [X]: [U], [U]: { ...commit([D]), type: "tree" } }, commit: X, refs: [[S, X, 5]] }, { result: "unreadable", reason: "not-a-commit", object: U }],
      [{ name: "a parent line that is no full object ID", graph: { [X]: { type: "commit", body: utf8(`tree ${C("7")}\nparent ${D.slice(1)}\nauthor a\ncommitter c\n\n`) } }, commit: X, refs: [[S, X, 5]] }, { result: "unreadable", reason: "malformed-commit", object: X }],
      [{ name: "a parent line of the other hash's length", graph: { [X]: [D.repeat(2).slice(0, 64)] }, commit: X, refs: [[S, X, 5]] }, { result: "unreadable", reason: "malformed-commit", object: X }],
      [{ name: "a parent line after another header", graph: { [X]: commit([D], `gpgsig x\nparent ${U}\n`) }, commit: X, refs: [[S, X, 5]] }, { result: "unreadable", reason: "malformed-commit", object: X }],
      [{ name: "a head of the other hash's length", graph: { [X]: [D] }, commit: X, head: "f".repeat(64), refs: [[S, X, 5]] }, { result: "unreadable", reason: "mixed-hash", object: "f".repeat(64) }],
      [{ name: "a start that is no object ID", graph: {}, commit: X.toUpperCase(), refs: [] }, { result: "unreadable", reason: "bad-object-id", object: X.toUpperCase() }],
      [{ name: "a root that the lane's records do not hold as live for the commit", graph: { [X]: [D] }, commit: X, own: [[5, U]], refs: [[S, X, 5]] }, { result: "unreadable", reason: "no-live-root", object: null }],
    ];
    expect(rows.map(([c]) => [c.name, found(c)])).toEqual(rows.map(([c, expected]) => [c.name, expected]));
  });

  test("the guard: the check record of this intent, recorded, for this commit; what was read still fits the lane's records; and F passes the row of its act", () => {
    /** A lane that staged `X` for a report, up to the check entry, with that ancestry record or with none for a read that was cut short. */
    function checked(record: (s: Staging) => AncestryCheck | null) {
      const s = new Staging();
      s.prepare(una, "instance", { hold: s.hold, task: { ...otherLane, kind: "task" }, instance: "i1" });
      const report = s.intent(una, "report", { expected: { commitment: s.item(s.commitment).revision }, fields: { commitment: s.commitment, commit: X } });
      s.asked(report, "stage");                                                // entry 7
      const before = cap.guard("git-read@1", "ancestry", { commit: X, row: "report" }, s.given({ intent: intentDigest(report.intent) }));
      s.outcome("7:0", "confirmed", {}, "read");                               // entry 8: the root is live
      const entry = s.outcome("8:0", "confirmed", { record: record(s) }) as Entry;   // the check entry: entry 9, or later when `record` wrote entries
      const asks = (args: object = {}, given: object = {}) => cap.guard("git-read@1", "ancestry", { commit: X, row: "report", ...args }, s.given({ intent: intentDigest(report.intent), ...given }));
      return { s, before, asks, entry };
    }
    /** The record that the walk gives this lane for `X`, as the lane's runtime builds it: from its own records, the snapshot and the commits. */
    const read = (graph: Graph, refs: readonly [typeof S, string, number][]) => (s: Staging): AncestryCheck => {
      const snapshot = refs.map(([lane, at, number]) => ({ ref: ref(lane === S ? s.at : lane, at, number), target: at }));
      kept(snapshot);
      const w = walk({ commit: X, head: D, lane: s.at, root: 1, ...ledgerOf(s.state, s.own, s.at, s.commitment, s.head.seq + 1), inputs: [], snapshot, read: reader(graph), bounds: ANCESTRY_BOUNDS });
      if (w.result !== "recorded") throw new Error(JSON.stringify(w));
      return w.record;
    };

    const own = checked(read({ [X]: [D] }, [[S, X, 1]]));
    // No check record yet: the act may be prepared. Then the record names the commit, fits the lane's records and lists nothing.
    expect([own.before, own.asks(), own.asks({ commit: U }), own.asks({ row: "manifest" }), own.asks({ row: "other" })]).toEqual(["ancestry-stale", true, "ancestry-stale", true, "unnamed-work"]);
    // A staged commit of other work under the start: a report names nothing, and a manifest names it by a selection, or by an
    // earlier manifest whose commit it is.
    const named = checked(read({ [X]: [D, U], [U]: [D] }, [[S, X, 1], [L2, U, 1]]));
    expect([named.asks(), named.asks({ row: "manifest" }), named.asks({ row: "manifest", selected: [U] }), named.asks({ row: "manifest", earlier: [null, U] })]).toEqual(["unnamed-work", "unnamed-work", true, true]);
    // A read that was cut short gives a record that is `too-large`, and no judgment.
    expect(checked(() => null).asks()).toBe("ancestry-too-large");

    // What was read no longer fits: the snapshot holds a foreign ref on the commit, and the record says that it has none.
    const hidden = checked((s) => ({ ...clean(s.at, X, 1), snapshot: kept([{ ref: ref(s.at, X, 1), target: X }, { ref: ref(L2, X, 1), target: X }]) }));
    // The root is no longer `live`: made by hand, as a retirement leaves it.
    own.s.hand(recordEffects("hold@1", [{ kind: "root", key: [1], state: "retiring", values: own.s.state.record("hold@1", "root", [1])!.values }]));
    expect([hidden.asks(), own.asks()]).toEqual(["ancestry-stale", "ancestry-stale"]);

    // Section 6.2, "How the guard finds a selected input". A `selected-report` stop and the basis `input` each name an input by
    // its fact. The guard finds it in the lane's own items: the item that the fact's entry opened, in the state `selected`, whose
    // slot `for` holds the source commitment. The row writes no argument for it. `under`: the commitment that the input is for.
    const second = (s: Staging) => s.did(keys.rita, "offer", { expected: { intent: s.item(0).revision }, fields: { intent: 0 } }).seq;
    const inputs: { s: Staging; fact: FactRef }[] = [];
    const using = (under: (s: Staging) => number, named: (fact: FactRef) => FactRef = (fact) => fact) => checked((s) => {
      const commitment = under(s);
      const fact = s.fact(s.did(una, "use-input", { expected: { commitment: s.item(commitment).revision }, fields: { commitment } }).seq);
      inputs.push({ s, fact });
      const foreign = ref(L2, X, 1);
      return { ...clean(s.at, X, 1), snapshot: kept([{ ref: ref(s.at, X, 1), target: X }, { ref: foreign, target: X }]), start: { foreign, basis: { kind: "input", input: named(fact) } }, stops: [{ kind: "selected-report", commit: U, input: named(fact) }] };
    });
    const selected = using((s) => s.commitment);
    // Its controls: an input of another commitment, a fact of another scope, a fact with another hash, and an input that is no
    // longer `selected`. Each is `ancestry-stale`, and the act may be prepared again.
    const others = [using(second), using((s) => s.commitment, (fact) => ({ ...fact, at: L2 })), using((s) => s.commitment, (fact) => ({ ...fact, hash: d("5") }))];
    expect([selected.asks(), ...others.map((o) => o.asks())]).toEqual([true, "ancestry-stale", "ancestry-stale", "ancestry-stale"]);
    inputs[0]!.s.hand([{ effect: "state", item: inputs[0]!.fact.seq, state: "replaced" }]);
    expect(selected.asks()).toBe("ancestry-stale");

    // Carried by another lane's check entry, presented beside the intent: that lane judged its own records in that entry, and
    // only the commit and the row are judged here.
    const pin = own.s.fact(own.entry.seq);
    const presented = { facts: new Map([[pin.hash, { fact: pin, entry: own.entry, under: "lane" }]]), intent: d("4") };
    expect([own.asks({ pin }, presented), own.asks({ pin, commit: U }, presented), own.asks({ pin }, { intent: d("4") })]).toEqual([true, "ancestry-stale", "ancestry-stale"]);
  });
});
