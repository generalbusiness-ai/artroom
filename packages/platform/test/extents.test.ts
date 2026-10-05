import { expect, test } from "vitest";
import type { MemberId } from "@generalbusiness/artroom-contract";
import { RULES_PATTERNS, actionsIn, classify, firstExtents, holdsRulesExtent, judgeExtents, matches } from "../src/index.ts";
import type { Extent, ExtentsAsked, Holder, Role, TreeLink } from "../src/index.ts";

// Judgments over data that each test writes by hand (authority note, revision 24, section 12.1.4a; the planner's request `42de9e34`).
// No scope ran here, and no destination called these functions: the reservation that will is not built. A member's actions are those
// that the role table of section 3.2 gives the role, so "who holds what" is the platform package's own table and no stand-in.

const holder = (handle: string, role: Role): Holder => ({ member: handle as MemberId, holds: actionsIn(role) });
// Two admins, who are the controllers of the rules scope; a maintainer; two members; and an agent, whose controller is `ada`.
const [ada, ann, max, mel, art] = [holder("@ada", "admin"), holder("@ann", "admin"), holder("@max", "maintainer"), holder("@mel", "member"), holder("@art", "member")];
const bot = "@bot" as MemberId;

/** The first definition, for a repository whose rules ask 1 approval and one required check. */
const FIRST = firstExtents({ approvals: 1, checks: [{ name: "unit", required: true }, { name: "lint", required: false }] });
/** Plan 016's mixed change: source, infrastructure and rules in one change. */
const MIXED = ["src/app.ts", ".gitignore", "AGENTS.md"];
const names = (extents: readonly Extent[], paths: readonly string[], links: readonly TreeLink[] = []) => classify(extents, paths, links).touched.map((row) => row.extent);

/** A reservation of the mixed change by `art`, which `max` merges, with the check passed. Each test states what it changes. */
const asked = (over: Partial<ExtentsAsked> = {}): ExtentsAsked => ({
  extents: FIRST, ownerMayReview: false, singleControllerException: false, touched: classify(FIRST, MIXED, []),
  authors: [art.member], controllersOfAuthors: [], reviews: [], passed: ["unit"], merger: max, controllers: [ada.member, ann.member], ...over,
});
/** What a judgment says: whether it is met, the unmet extents, and for each touched extent who counted and what it lacks. */
const said = (over: Partial<ExtentsAsked> = {}) => {
  const judged = judgeExtents(asked(over));
  return [judged.met, judged.unmet, Object.fromEntries(judged.extents.map((extent) => [extent.extent, [extent.counted, extent.lacks]]))];
};

test("the first definition names rules, infrastructure and source; an agent instruction file and a CI definition are in the rules extent; a path may be in two extents, and every other path is source", () => {
  expect(FIRST.map((extent) => [extent.name, extent.approvals, extent.approver, extent.checks, extent.class])).toEqual([
    ["rules", 1, "rules.publish", [], "authority"], ["infrastructure", 1, "change.merge", [], "deployment"], ["source", 1, "change.review", ["unit"], "content"],
  ]);
  // Condition (3) of the request: instruction files for agents at any depth, and the definitions of CI and of automation.
  expect(["AGENTS.md", "packages/git/CLAUDE.md", ".github/workflows/ci.yml", ".github/actions/setup/action.yml"].map((path) => names(FIRST, [path]))).toEqual([
    ["rules"], ["rules"], ["rules", "infrastructure"], ["rules", "infrastructure"],
  ]);
  expect([".gitignore", "docs/.gitattributes", ".github/CODEOWNERS", "src/app.ts", "docs/AGENTS.md.txt"].map((path) => names(FIRST, [path]))).toEqual([
    ["infrastructure"], ["infrastructure"], ["infrastructure"], ["source"], ["source"],
  ]);
  // A pattern: an ASCII letter matches in either case and nothing else is folded; `*` stays inside one name; `**` is any number of names, also none.
  expect([matches("**/AGENTS.md", "docs/agents.MD"), matches("**/AGENTS.md", "docs/ÄGENTS.md"), matches("**/ÄGENTS.md", "docs/äGENTS.md"), matches("src/*.ts", "src/a.ts"), matches("src/*.ts", "src/lib/a.ts"), matches(".github/**", ".github"), matches("a/**/b", "a/x/y/b"), matches("*", "a/b")])
    .toEqual([true, false, false, true, false, true, true, false]);

  // The fixed minimum of the rules extent: a repository may add a pattern. It may not remove one, lower the approvals, or change the approver or the class.
  const [rules, ...rest] = FIRST as [Extent, ...Extent[]];
  const minimum = (over: Partial<Extent>) => holdsRulesExtent([{ ...rules, ...over }, ...rest]);
  expect([holdsRulesExtent(FIRST), minimum({ patterns: [...RULES_PATTERNS, "policy/**"] }), minimum({ patterns: RULES_PATTERNS.slice(1) }), minimum({ approvals: 0 }), minimum({ approver: "change.merge" }), minimum({ class: "deployment" }), holdsRulesExtent(rest)])
    .toEqual([true, true, false, false, false, false, false]);
});

test("plan 016's mixed change touches three extents and needs each obligation; a reviewer outside an extent does not meet it, and nothing is averaged", () => {
  const touched = classify(FIRST, MIXED, []);
  expect([touched.touched, touched.class, touched.unclassified, touched.refused]).toEqual([
    [{ extent: "rules", path: "AGENTS.md" }, { extent: "infrastructure", path: ".gitignore" }, { extent: "source", path: "src/app.ts" }], "authority", [], [],
  ]);
  expect([classify(FIRST, ["src/app.ts"], []).class, classify(FIRST, ["src/app.ts", ".gitignore"], []).class, classify(FIRST, [], []).class]).toEqual(["content", "deployment", null]);

  // A source reviewer meets source alone. Two of them are still no infrastructure reviewer.
  expect(said({ reviews: [mel] })).toEqual([false, ["rules", "infrastructure"], { rules: [[], ["approvals"]], infrastructure: [[], ["approvals"]], source: [["@mel"], []] }]);
  expect(said({ reviews: [mel, holder("@moe", "member")] })[1]).toEqual(["rules", "infrastructure"]);
  // A maintainer meets infrastructure and source. A feature reviewer never meets rules.
  expect(said({ reviews: [mel, max] })).toEqual([false, ["rules"], { rules: [[], ["approvals"]], infrastructure: [["@max"], []], source: [["@max", "@mel"], []] }]);
  // The rules scope's controller meets rules, and one review may count for several extents.
  expect(said({ reviews: [mel, max, ada] })[0]).toBe(true);
  expect(said({ reviews: [ada] })).toEqual([true, [], { rules: [["@ada"], []], infrastructure: [["@ada"], []], source: [["@ada"], []] }]);
  // Two reviews of one member are one reviewer.
  expect(said({ extents: FIRST.map((extent) => ({ ...extent, approvals: 2 })), reviews: [ada, ada] })[1]).toEqual(["rules", "infrastructure", "source"]);

  // Each extent asks its own checks, and a class beyond `content` asks the landing actor's standing grant.
  expect(said({ reviews: [ada], passed: [] })).toEqual([false, ["source"], { rules: [["@ada"], []], infrastructure: [["@ada"], []], source: [["@ada"], ["checks"]] }]);
  expect(said({ reviews: [ada], merger: mel })[1]).toEqual(["rules", "infrastructure"]);
  expect(said({ reviews: [ada], merger: mel, touched: classify(FIRST, ["src/app.ts"], []) })[0]).toBe(true);
});

test("a change to the rules extent is not met by its author's review, whatever `ownerMayReview` says, and with no declared exception one controller alone changes nothing", () => {
  // The author is the only controller, and the only reviewer.
  const own = { authors: [ada.member], reviews: [ada], merger: ada, controllers: [ada.member] };
  expect(said(own)).toEqual([false, ["rules", "infrastructure", "source"], { rules: [[], ["approvals"]], infrastructure: [[], ["approvals"]], source: [[], ["approvals"]] }]);
  // The controller of an agent among the authors: `ownerMayReview` lets that review count for the other extents, and never for rules.
  const agent = { authors: [bot], controllersOfAuthors: [ada.member], reviews: [ada], controllers: [ada.member] };
  expect([said({ ...agent, ownerMayReview: true })[1], said({ ...agent, ownerMayReview: false })[1]]).toEqual([["rules"], ["rules", "infrastructure", "source"]]);
  // A second controller, independent of the authors, meets it.
  expect(said({ ...own, reviews: [ada, ann], controllers: [ada.member, ann.member] })[0]).toBe(true);
});

test("the single-controller exception holds only when it is declared, membership shows one controller, and that controller is an author or controls one; then the controller's `merge` meets the rules extent and every other obligation stands", () => {
  // `ada` wrote the change, is the one controller, and signs the `merge`. `max` reviews the other extents.
  const use = { singleControllerException: true, authors: [ada.member], reviews: [max], merger: ada, controllers: [ada.member] };
  const exception = (over: Partial<ExtentsAsked>) => { const judged = judgeExtents(asked({ ...use, ...over })); return [judged.met, judged.unmet, judged.extents[0]!.exception]; };
  // 1. Not declared.
  expect(exception({ singleControllerException: false })).toEqual([false, ["rules"], null]);
  // 2. Two controllers, and no count at all (the observation that gives it is not built).
  expect([exception({ controllers: [ada.member, ann.member] }), exception({ controllers: null }), exception({ controllers: [] })]).toEqual([[false, ["rules"], null], [false, ["rules"], null], [false, ["rules"], null]]);
  // 3. The one controller is independent of the authors: that member's review is asked, and no exception is used with or without it.
  expect([exception({ authors: [art.member] }), exception({ authors: [art.member], reviews: [max, ada] })]).toEqual([[false, ["rules"], null], [true, [], null]]);
  // All three hold, for an author and for the controller of an agent among the authors.
  expect([exception({}), exception({ authors: [bot], controllersOfAuthors: [ada.member] })]).toEqual([[true, [], "@ada"], [true, [], "@ada"]]);
  // Another member signed the `merge`.
  expect(exception({ merger: max })).toEqual([false, ["rules"], null]);
  // It meets the reviews of the rules extent and nothing else: the other extents' reviews, and each check, stand.
  expect([exception({ reviews: [] })[1], exception({ reviews: [ada] })[1]]).toEqual([["infrastructure", "source"], ["infrastructure", "source"]]);
  const checked = FIRST.map((extent) => (extent.name === "rules" ? { ...extent, checks: ["policy"] } : extent));
  expect([exception({ extents: checked })[1], exception({ extents: checked, passed: ["unit", "policy"] })[1]]).toEqual([["rules"], []]);
});

test("a symbolic link is judged at its path and at every path that it resolves to; a change of its target is a change in the old and the new target's extents; a link that leaves the tree is refused as a change to the rules extent", () => {
  // A link into another extent: a source path that resolves to a CI definition.
  expect([names(FIRST, ["docs/ci.yml"]), names(FIRST, ["docs/ci.yml"], [{ path: "docs/ci.yml", resolves: [".github/workflows/ci.yml"] }])]).toEqual([["source"], ["rules", "infrastructure", "source"]]);
  // A target change: the old target is an instruction file and the new one is infrastructure. Both rows are given.
  const moved = [{ path: "docs/notes.md", resolves: ["AGENTS.md"] }, { path: "docs/notes.md", resolves: [".gitignore"] }];
  expect([names(FIRST, ["docs/notes.md"], moved.slice(1)), names(FIRST, ["docs/notes.md"], moved)]).toEqual([["infrastructure", "source"], ["rules", "infrastructure", "source"]]);
  // A link of another path changes nothing here.
  expect(names(FIRST, ["src/app.ts"], moved)).toEqual(["source"]);

  // The other direction: `AGENTS.md` is a link, and what it resolves to changes. A directory that a link resolves to carries the paths below it.
  expect(names(FIRST, ["docs/instructions.md"], [{ path: "AGENTS.md", resolves: ["docs/instructions.md"] }])).toEqual(["rules", "source"]);
  expect(names(FIRST, ["ci/build.yml"], [{ path: ".github/workflows", resolves: ["ci"] }])).toEqual(["rules", "infrastructure", "source"]);
  // A link below a link is followed, and a link that leads up into its own directory ends by a refusal.
  expect(names(FIRST, ["text/guide.md"], [{ path: "tools/AGENTS.md", resolves: ["text/guide.md"] }, { path: "kit", resolves: ["tools"] }])).toEqual(["rules", "source"]);
  expect(classify(FIRST, ["a/x"], [{ path: "a/b", resolves: ["a"] }]).refused).toEqual(["a/x"]);

  // Outside the tree, or not resolvable: refused. No review meets it, and the class is `authority`.
  const outside = classify(FIRST, ["src/app.ts", "docs/secrets"], [{ path: "docs/secrets", resolves: null }]);
  expect([outside.touched, outside.refused, outside.class]).toEqual([[{ extent: "source", path: "docs/secrets" }], ["docs/secrets"], "authority"]);
  expect(said({ touched: outside, reviews: [ada, ann] })).toEqual([false, ["rules"], { source: [["@ada", "@ann"], []] }]);
  // Where the change also touches the rules extent, that extent is the one that is not met.
  const both = judgeExtents(asked({ touched: classify(FIRST, ["AGENTS.md", "docs/secrets"], [{ path: "docs/secrets", resolves: null }]), reviews: [ada] }));
  expect([both.met, both.unmet, both.extents[0]!.met, both.extents[0]!.lacks]).toEqual([false, ["rules"], false, []]);
});

test("the extents are a repository's own: a second rules content with other patterns classifies the same paths differently, and a path that no extent holds is not met", () => {
  const SECOND: readonly Extent[] = [
    { name: "rules", patterns: [...RULES_PATTERNS, "policy/**"], approvals: 1, approver: "rules.publish", checks: [], class: "authority" },
    { name: "infrastructure", patterns: ["deploy/**", "**/*.tf"], approvals: 2, approver: "change.merge", checks: ["plan"], class: "deployment" },
    { name: "docs", patterns: ["docs/**", "**/*.md"], approvals: 1, approver: "change.review", checks: [], class: "content" },
    { name: "source", patterns: [], approvals: 1, approver: "change.review", checks: ["unit"], class: "content" },
  ];
  expect(holdsRulesExtent(SECOND)).toBe(true);
  const paths = [".gitignore", "deploy/prod.toml", "policy/owners.txt", "docs/guide.md", "AGENTS.md", "src/app.ts"];
  expect(paths.map((path) => [names(FIRST, [path]), names(SECOND, [path])])).toEqual([
    [["infrastructure"], ["source"]], [["source"], ["infrastructure"]], [["source"], ["rules"]], [["source"], ["docs"]], [["rules"], ["rules", "docs"]], [["source"], ["source"]],
  ]);
  // The same change under the two contents: the second asks two infrastructure reviewers and its own check.
  const change = ["deploy/prod.toml", "src/app.ts"];
  const under = (extents: readonly Extent[]) => said({ extents, touched: classify(extents, change, []), reviews: [max] });
  expect([under(FIRST), under(SECOND)]).toEqual([
    [true, [], { source: [["@max"], []] }],
    [false, ["infrastructure"], { infrastructure: [["@max"], ["approvals", "checks"]], source: [["@max"], []] }],
  ]);

  // With no extent that has no pattern, a path that no pattern matches is held by nothing, and the change is not met.
  const closed = SECOND.slice(0, 3);
  const touched = classify(closed, ["docs/guide.md", "src/app.ts"], []);
  expect([touched.touched, touched.unclassified, said({ extents: closed, touched, reviews: [ada] }).slice(0, 2)]).toEqual([[{ extent: "docs", path: "docs/guide.md" }], ["src/app.ts"], [false, []]]);
});
