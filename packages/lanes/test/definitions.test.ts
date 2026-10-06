import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, parseStrict } from "@generalbusiness/artroom-bytes";
import { capabilitiesOf, counted, derivable, gitRead, holdCapability, validateDefinition, type ValidDefinition } from "@generalbusiness/artroom-derive";
import { reference } from "../scripts/reference.mjs";
import { DIGESTS, LANE_FORMS, change, definitions, issue } from "../src/index.ts";

const lanes = { issue, change } as const;
const names = ["issue", "change"] as const;
const file = (name: string) => readFileSync(new URL(`../definitions/${name}.json`, import.meta.url), "utf8");
/** The definition, validated whole at the adopted bounds, or at those bounds with one change. */
const validated = (definition: DeclaredDefinition, over: Partial<Bounds> = {}) => validateDefinition(definition, { ...PROPOSED_BOUNDS, ...over });
function whole(name: (typeof names)[number]): ValidDefinition {
  const checked = validated(lanes[name]);
  if (!checked.ok) throw new Error(`${name} is refused: ${JSON.stringify(checked.problems)}`);
  return checked.definition;
}

describe("the two lane definitions, as data (lane forms, revision 14)", () => {
  test("the pins: each definition is exactly its pinned bytes and its pinned digest", () => {
    expect(LANE_FORMS).toEqual({ revision: 14, commit: "4b3bf5da" });
    expect(definitions).toEqual([issue, change]);
    for (const name of names) {
      // The byte file is the canonical JSON of the value, with nothing before or after it. A changed row with no new pin fails here.
      expect(file(name) === canonicalize(lanes[name]), `${name}: the byte file is not the canonical bytes of the value; run scripts/pin.mjs`).toBe(true);
      // The digest is of those bytes, in the definition's own domain, by the one implementation.
      expect([definitionDigest(lanes[name]), definitionDigest(parseStrict(file(name)) as DeclaredDefinition)], name).toEqual([DIGESTS[name], DIGESTS[name]]);
    }
    expect(DIGESTS.issue).not.toBe(DIGESTS.change);
    // The generated reference is exactly what its generator writes from the two values, stamp and rows. A changed row with an old guide fails here.
    expect(readFileSync(new URL("../../../docs/lanes-reference.md", import.meta.url), "utf8") === reference(), "docs/lanes-reference.md is stale; run scripts/reference.mjs").toBe(true);
  });

  test("the counts: the item types, acts, timed rules and handlers that the lane forms state, each within its adopted bound, and each bound a row meets is met exactly", () => {
    const counted = (d: DeclaredDefinition) => [d.items, d.acts, d.timed, d.receives].map((part) => Object.keys(part).length);
    expect([counted(issue), counted(change)]).toEqual([[12, 50, 1, 7], [14, 52, 2, 4]]);
    // The validator is the counter. A definition passes with a bound at the number below, and is refused with one less.
    // `propose-manifest` has 24 guards as written and 16 effects, which are the adopted bounds, and its guards are nested 8 deep, which
    // is the bound too. Counting those nested it has 73 guards. Four acts name 4 other items. `intent` has 10 values.
    const meets: Record<(typeof names)[number], Partial<Bounds>> = {
      issue: { items: 12, acts: 50, timedRules: 1, receives: 7, values: 10, also: 4 },
      change: { items: 14, acts: 52, timedRules: 2, receives: 4, also: 4, presents: 1, guards: 24, nestedGuards: 73, guardDepth: 8, effects: 16 },
    };
    const found = names.flatMap((name) => (Object.entries(meets[name]) as [keyof Bounds, number][]).map(([bound, n]) => {
      const less = validated(lanes[name], { [bound]: n - 1 });
      return [name, bound, n <= PROPOSED_BOUNDS[bound], validated(lanes[name], { [bound]: n }).ok, less.ok ? null : [...new Set(less.problems.map((p) => p.code))]];
    }));
    expect(found.filter(([, , within, at, below]) => !(within === true && at === true && JSON.stringify(below) === '["bound"]'))).toEqual([]);
  });

  test("validation: both definitions pass the validator whole at the adopted bounds; the forms that no runtime derives yet are the capability rows; neither genesis opens a timed item", () => {
    const valid = { issue: whole("issue"), change: whole("change") };
    expect([valid.issue.digest, valid.change.digest]).toEqual([DIGESTS.issue, DIGESTS.change]);
    // The scope contract's revision 19, section 6.1 (witness 18.44, case 7): the bound on a list is 64, and each list type of both
    // definitions states a `max` of at most 32. So each validates the same at the bound 32 and at 64: the same digest, the same
    // reservations, and the same static size of each timed entry, which is read here from the refusal at an entry size of 1 byte.
    const sizes = (name: (typeof names)[number], listElements: number) => { const tight = validated(lanes[name], { listElements, entryBytes: 1 }); return tight.ok ? null : tight.problems.map((p) => p.message); };
    for (const name of names) {
      const at32 = validated(lanes[name], { listElements: 32 });
      expect([PROPOSED_BOUNDS.listElements, at32.ok && at32.definition, sizes(name, 32)], name).toEqual([64, valid[name], sizes(name, 64)]);
      expect(sizes(name, 64)?.length, name).toBeGreaterThan(0);
    }

    // The scope contract's revision 21 adds a third form of `settles`, by a mark. Neither definition states it: the seven `settles`
    // of the two are six of the form `{ of, in }` and one `{ copy }`, and each reserves the entries that it did before that form
    // was read. The numbers were read from the source before the change, at `d034be890`, and are the same.
    const settles = (d: DeclaredDefinition) => [...Object.values(d.acts), ...Object.values(d.receives)].flatMap((form) => (form.settles ? [Object.keys(form.settles).sort().join(" ")] : []));
    expect([settles(issue), settles(change)]).toEqual([["in of", "copy", "in of"], ["in of", "in of", "in of", "in of"]]);
    const reserves = ({ deadlines, pending, pendingCopies, clauseEntries, markers }: ValidDefinition) => ({ deadlines, pending, pendingCopies, clauseEntries, markers });
    expect(reserves(valid.issue)).toEqual({ deadlines: { hold: { held: 1 } }, pending: { concern: { created: 1 }, export: { authorized: 1 } }, pendingCopies: [{ name: "closes", kind: "lane", states: ["set"], entries: 1 }], clauseEntries: 1, markers: undefined });
    expect(reserves(valid.change)).toEqual({ deadlines: { job: { requested: 1 }, hold: { held: 1 } }, pending: { job: { requested: 1, "timed-out": 1 }, merge: { intended: 67, committed: 67, unknown: 67 }, export: { authorized: 1 } }, pendingCopies: [], clauseEntries: 0, markers: undefined });

    // What the validator reads and derives nothing of: the rows that need the code of `hold@1` or `git-read@1`. They are 3 acts
    // and 7 handlers, with the type that names a check entry. A runtime with no such code runs neither definition.
    const rows = (definition: ValidDefinition) => [...new Set(definition.underived.map((u) => u.path.split(".").slice(0, 2).join(".")))];
    expect(rows(valid.issue)).toEqual(["capabilities.1", "acts.report", "acts.refuse-report", "receives.pin-confirm", "receives.unpin", "receives.export-license", "receives.export-settled"]);
    expect(rows(valid.change)).toEqual(["capabilities.1", "items.manifest", "acts.propose-manifest", "receives.publication", "receives.export-license", "receives.export-settled"]);
    for (const name of names) {
      expect([...new Set(valid[name].underived.map((u) => u.capability))].sort(), name).toEqual(["git-read@1", "hold@1"]);
      expect(derivable(valid[name], null), name).toBe(false);
    }
    // With the code of the two versions, as the production ports hold it, each form of both definitions has its code, the type
    // that names a check entry among them. Each entry of both, counted with the most that this code declares for a hold that may
    // have 2 tokens, fits the bound on derived effects, which is a temporary number.
    const code = capabilitiesOf(holdCapability({ tokensPerHold: 2, rootRetentionSeconds: null }), gitRead());
    expect(names.map((name) => [derivable(valid[name], code), counted(valid[name], code, PROPOSED_BOUNDS)])).toEqual([[true, null], [true, null]]);
    // Both lanes may hold 16 live holds, and an entry is counted with all of them: 16 times 7, and the capability effects of its row, which are at most 1 in `issue` and 2 in `change`.
    expect(names.map((name) => counted(valid[name], code, { ...PROPOSED_BOUNDS, derivedEffects: 112 })?.effects)).toEqual([113, 114]);

    // Section 6.4: a genesis opens no timed item. The genesis acts open `intent` and `proposal`, and the timed types are others.
    expect([[issue.genesis, issue.acts[issue.genesis].on, valid.issue.timedTypes], [change.genesis, change.acts[change.genesis].on, valid.change.timedTypes]])
      .toEqual([["file", "intent", ["hold"]], ["open", "proposal", ["hold", "job"]]]);
    // The control: the same definition with the act that opens a hold as its genesis is refused, by that rule.
    const timed = validated({ ...issue, genesis: "take-hold" });
    expect(timed.ok ? null : timed.problems.map((p) => p.code)).toEqual(["genesis-timed"]);
  });
});
