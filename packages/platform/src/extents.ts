/**
 * Extents: the named parts of a repository's tree, with what a change to
 * each must meet (authority note, revision 24, section 12.1.4a; the
 * planner's request `42de9e34`). The functions here are judgments over data
 * that their caller gives. They read no repository, no scope and no clock.
 *
 * The scope that judges is the destination, in the outcome of `judge`
 * ("How a change is judged"), under the rules that it observes for the
 * reservation. That caller is not built. Nothing in this package calls
 * these functions, no row of `platform:rules@1` holds an extent, and no mark
 * names one: the note says that the rows change only when its missing
 * forms 1 to 3 exist. So each datum that a missing form would carry is an
 * input here, and what gives it is the caller's (I3 deltas, entries EV1 to
 * EV17).
 *
 * | What | From the note | Its caller's side, not built |
 * |---|---|---|
 * | `Extent`, `firstExtents` | "An extent", "The first definition" | The slot, the field of `publish` and the member of `RulesContent`: form 2 |
 * | `holdsRulesExtent` | "Its fixed minimum" | The mark of `publish`: form 3 |
 * | `matches`, `classify` | "A pattern", "What it matches", and the planner's decision on symbolic links | The changed set and the links of the trees: form 1 |
 * | `judgeExtents` | "How a change is judged", steps 2 to 5, and "What the planner decided" | The rule of `judge`: form 3. The count of controllers: form 11. The declaration: form 14 |
 */

import type { MemberId } from "@generalbusiness/artroom-contract";
import { byteOrder } from "@generalbusiness/artroom-derive";

/** What a change to an extent does when it is published. The order is from the lowest to the highest ("How a change is judged", step 5). */
export const EXTENT_CLASSES = ["content", "deployment", "authority"] as const;
export type ExtentClass = (typeof EXTENT_CLASSES)[number];

/** An extent, member for member as the note's listing has it. */
export interface Extent {
  name: string;                      // at most 64 bytes; unique in the rules
  patterns: readonly string[];       // at most 32, each at most 256 bytes. None: the extent holds every path that no pattern of the rules matches
  approvals: number;                 // approving reviews that count for this extent
  approver: string;                  // an action: a review counts only from a member who holds it
  checks: readonly string[];         // names of checks of the rules that are required for this extent
  class: ExtentClass;
}

/** The most extents of one rules content ("How a repository changes its extents"). */
export const EXTENTS_MOST = 8;
/** The name of the extent that the note's rules for a change to the rules are about. */
export const RULES_EXTENT = "rules";
/** The action of the rules scope's controller ("Met only with the rules scope's controller"). */
export const CONTROLLER = "rules.publish";
/** The standing grant of the landing actor on the destination of a branch (the planner's second decision, the second row of its table). */
export const LANDING = "change.merge";
/** The four patterns that the `rules` extent always holds: instruction files for agents, and the definitions of continuous integration and of automation. */
export const RULES_PATTERNS: readonly string[] = ["**/AGENTS.md", "**/CLAUDE.md", ".github/workflows/**", ".github/actions/**"];

/**
 * The first definition: three extents, from the two values of the rules
 * that its table reads. `rules` asks 1 approval, which is the table's "at
 * least 1". `rules` and `infrastructure` name no check: the table gives
 * them "those that the repository names". `source` names the checks that
 * the rules mark `required`. The numbers are examples that the proof plan
 * owns (I3 deltas, entry EV12).
 */
export const firstExtents = (rules: { approvals: number; checks: readonly { name: string; required: boolean }[] }): readonly Extent[] => [
  { name: RULES_EXTENT, patterns: RULES_PATTERNS, approvals: 1, approver: CONTROLLER, checks: [], class: "authority" },
  { name: "infrastructure", patterns: ["**/.gitignore", "**/.gitattributes", ".github/**"], approvals: rules.approvals, approver: LANDING, checks: [], class: "deployment" },
  { name: "source", patterns: [], approvals: rules.approvals, approver: "change.review", checks: rules.checks.filter((check) => check.required).map((check) => check.name), class: "content" },
];

/**
 * The fixed minimum of the `rules` extent, which a `publish` without it is
 * refused for, named `rules-extent-required`: the extents hold one named
 * `rules` with the four patterns, at least 1 approval, the approver
 * `rules.publish` and the class `authority`. A repository may add patterns.
 * No mark of `publish` runs this yet (the missing form 3).
 */
export const holdsRulesExtent = (extents: readonly Extent[]): boolean =>
  extents.some((extent) => extent.name === RULES_EXTENT && RULES_PATTERNS.every((pattern) => extent.patterns.includes(pattern)) && extent.approvals >= 1 && extent.approver === CONTROLLER && extent.class === "authority");

// ---------------------------------------------------------------- a pattern

/** An ASCII letter in its lower case, and every other code unit as it is: nothing else is folded. */
const folded = (unit: number): number => (unit >= 65 && unit <= 90 ? unit + 32 : unit);

/** One name against one name of a pattern: `*` matches any bytes of the name, and every other byte matches itself, an ASCII letter in either case. */
const nameMatches = (pattern: string, name: string): boolean => {
  let [p, n, star, mark] = [0, 0, -1, 0];
  while (n < name.length) {
    if (p < pattern.length && pattern[p] !== "*" && folded(pattern.charCodeAt(p)) === folded(name.charCodeAt(n))) { p += 1; n += 1; }
    else if (p < pattern.length && pattern[p] === "*") { star = p; mark = n; p += 1; }
    else if (star >= 0) { p = star + 1; mark += 1; n = mark; }
    else return false;
  }
  while (p < pattern.length && pattern[p] === "*") p += 1;
  return p === pattern.length;
};

/**
 * Whether a pattern matches a whole path from the root of the tree ("A
 * pattern"). A path is the names of its tree entries, joined by `/`. A name
 * of the pattern that is `**` matches any number of names, also none. In
 * any other name each `*` matches any bytes of one name (I3 deltas, entry
 * EV13).
 *
 * The two are strings. For well-formed text a match by code units is the
 * match by bytes, since `/`, `*` and the ASCII letters are one byte each.
 * A path whose bytes are no text has no string, and is the caller's to
 * refuse (entry EV13).
 */
export const matches = (pattern: string, path: string): boolean => {
  const [want, names] = [pattern.split("/"), path.split("/")];
  // reach[n]: the names before `n` are matched by the pattern's names so far.
  let reach = names.map(() => false).concat(false);
  reach[0] = true;
  for (const part of want) {
    const next = reach.map(() => false);
    for (let n = 0; n <= names.length; n += 1) {
      if (!reach[n]) continue;
      if (part === "**") for (let more = n; more <= names.length; more += 1) next[more] = true;
      else if (n < names.length && nameMatches(part, names[n]!)) next[n + 1] = true;
    }
    reach = next;
  }
  return reach[names.length]!;
};

// ---------------------------------------------------------------- the touched extents

/**
 * A symbolic link of a tree that the changed set was computed from, as the
 * caller resolved it. `resolves` is every path within the tree that the
 * link at `path` resolves to: each step of a chain of links, and its end.
 * Null: the link resolves outside the tree, or cannot be resolved.
 *
 * `tree` says which tree holds the link: `old`, the tree that the change
 * starts from; `new`, the tree that it makes; or `both`, for a link that
 * the change leaves as it is. A link whose target differs between the two
 * trees is two rows, one `old` and one `new`. A link that the change
 * removes, or replaces with a regular file, is one `old` row. The member
 * is what tells the creation of a link from its removal: without it the
 * planner's rule for a link that leaves the tree cannot be judged.
 */
export interface TreeLink { path: string; tree: "old" | "new" | "both"; resolves: readonly string[] | null }

/** What a changed set touches under one rules content. */
export interface Touched {
  /** The touched extents, in the order of the rules, each with one changed path that shows it: the first in byte order. */
  touched: readonly { extent: string; path: string }[];
  /** The changed paths that no extent holds. A change with one is not met. */
  unclassified: readonly string[];
  /** The changed paths that are refused as a change to the `rules` extent, by a link. A change with one is not met. */
  refused: readonly string[];
  /** The highest class that the change touches: `authority`, then `deployment`, then `content`. Null: nothing is touched. */
  class: ExtentClass | null;
}

/**
 * The extents that a changed set touches ("How a change is judged", step
 * 1), with the planner's decision on symbolic links, which is later than
 * the note's "its target is not followed" and replaces it.
 *
 * A changed path is judged at each of these paths:
 *
 * 1. the path itself;
 * 2. every path that a link at it resolves to, in either tree. So a
 *    link into another extent touches that extent too, and a change of a
 *    link's target is a change in every extent that the old and the new
 *    target fall in;
 * 3. the path of a link, with the rest of the changed path, when the
 *    changed path is what the link resolves to, or is below it. So a change
 *    to the file that `AGENTS.md` is a link to is a change at `AGENTS.md`.
 *    The planner confirmed this direction on 2026-10-05 (I3 deltas, entry
 *    EV7).
 *
 * Steps 2 and 3 are taken again from each path that they give, at most
 * once for each link: links below links are followed, and a link that
 * leads up into its own directory ends. A change that still gives new
 * paths then is refused.
 *
 * A link that resolves outside the tree, or cannot be resolved, is never
 * followed. What a change does with one decides (the planner's decision of
 * 2026-10-05 on entry EV7):
 *
 * - The new tree holds one at a judged path: the change creates it, or
 *   gives a link that target. It is refused as a change to the `rules`
 *   extent.
 * - Only the old tree holds one at a judged path: the change removes it,
 *   or replaces it with a regular file or with a link inside the tree. It
 *   is allowed, and is judged in the `rules` extent, in the extents of the
 *   link's own path and, for a new link, in those of its target by step 2.
 *   Rules that name no extent `rules` hold no such change: the path is
 *   unclassified.
 * - Both trees hold it and the change is elsewhere: no judged path is the
 *   link's, so it blocks nothing.
 *
 * An extent with patterns holds a judged path that one of them matches. A
 * path may match several, and then the change touches each. An extent with
 * no pattern holds every judged path that no pattern of the rules matches.
 * A judged path that no extent holds makes its changed path unclassified
 * (entry EV14).
 */
export function classify(extents: readonly Extent[], changed: readonly string[], links: readonly TreeLink[]): Touched {
  const shown = new Map<string, string>();
  const [unclassified, refused] = [new Set<string>(), new Set<string>()];
  const patterned = extents.filter((extent) => extent.patterns.length > 0);
  const open = extents.filter((extent) => extent.patterns.length === 0);
  for (const path of [...new Set(changed)].sort(byteOrder)) {
    const judged = new Set([path]);
    const left = new Set<string>();
    let fresh = [path];
    for (let pass = 0; fresh.length > 0; pass += 1) {
      if (pass > links.length) { refused.add(path); break; }
      const found: string[] = [];
      for (const at of fresh) {
        for (const link of links) {
          // A link that leaves the tree is refused where the new tree holds it. Where only the old tree did, the change is one of the rules extent.
          if (link.path === at && link.resolves === null && link.tree !== "old") refused.add(path);
          if (link.path === at && link.resolves === null && link.tree === "old") left.add(path);
          const reached = link.path === at ? (link.resolves ?? []) : [];
          const through = (link.resolves ?? []).filter((to) => at === to || at.startsWith(`${to}/`)).map((to) => link.path + at.slice(to.length));
          for (const other of [...reached, ...through]) if (!judged.has(other)) { judged.add(other); found.push(other); }
        }
      }
      fresh = found;
    }
    for (const at of judged) {
      const holding = patterned.filter((extent) => extent.patterns.some((pattern) => matches(pattern, at)));
      if (holding.length === 0 && open.length === 0) unclassified.add(path);
      for (const extent of holding.length > 0 ? holding : open) if (!shown.has(extent.name)) shown.set(extent.name, path);
    }
    // The removal or the replacement of a link that left the tree: a change in the `rules` extent, whatever its path matches.
    if (left.has(path)) {
      if (!extents.some((extent) => extent.name === RULES_EXTENT)) unclassified.add(path);
      else if (!shown.has(RULES_EXTENT)) shown.set(RULES_EXTENT, path);
    }
  }
  const touched = extents.filter((extent) => shown.has(extent.name)).map((extent) => ({ extent: extent.name, path: shown.get(extent.name)! }));
  const classes = extents.filter((extent) => shown.has(extent.name)).map((extent) => EXTENT_CLASSES.indexOf(extent.class));
  // A refused path is a change to the `rules` extent, whose class is `authority`.
  if (refused.size > 0) classes.push(EXTENT_CLASSES.indexOf("authority"));
  return { touched, unclassified: [...unclassified], refused: [...refused], class: classes.length > 0 ? EXTENT_CLASSES[Math.max(...classes)]! : null };
}

// ---------------------------------------------------------------- the obligations

/** A member with the actions that the member holds, by the observation that the destination reads for the reservation. */
export interface Holder { member: MemberId; holds: readonly string[] }
/**
 * An approving verdict of `reserve`, by its reviewer, with the one extent
 * that it states ("Which reviews count for an extent", from revision 25; the
 * lane forms' revision 15, section 20.2, ask 4). Null: it states none, and
 * counts for none. A reviewer who covers two extents signs two verdicts.
 */
export interface Review extends Holder { extent: string | null }

/**
 * What the destination has at a reservation, for the judgment of the
 * extents. Each member is given: this file reads no scope.
 */
export interface ExtentsAsked {
  /** The extents of the rules that were observed for this reservation (the missing form 2). */
  extents: readonly Extent[];
  /** The rules' `ownerMayReview`, from the same observation. */
  ownerMayReview: boolean;
  /** The rules' declaration of the single-controller exception, from the same observation. False where the rules hold none (the missing form 14). */
  singleControllerException: boolean;
  /** What the change touches under those extents: `classify`, of the changed set that the runtime computed (the missing form 1). */
  touched: Touched;
  /** The manifest's authors, as section 3.10 lists them. */
  authors: readonly MemberId[];
  /** The controller of each agent among the authors. */
  controllersOfAuthors: readonly MemberId[];
  /** The approving verdicts that count for the manifest by the first three rules of section 3.10, each by its reviewer, with the extent that it states. Independence is judged here. */
  reviews: readonly Review[];
  /** The names of the checks with a passed job on the manifest, as section 6.5 counts a required check. */
  passed: readonly string[];
  /** The member who signed the `merge`: the landing actor. */
  merger: Holder;
  /** Every active member with an active key who holds `rules.publish`, at the head of membership that was observed. Null: no observation says (the missing form 11), and then no exception is judged. */
  controllers: readonly MemberId[] | null;
}

/** What one touched extent's obligation lacks. `grant` is the landing actor's standing grant, for the classes `deployment` and `authority`. */
export type Lack = "approvals" | "checks" | "grant";

export interface ExtentJudged {
  extent: string;
  class: ExtentClass;
  met: boolean;
  /** The members whose review counted for this extent, in byte order. */
  counted: readonly MemberId[];
  lacks: readonly Lack[];
  /** For the `rules` extent that was met by the single-controller exception: the one controller, who signed the `merge`. The record of the landing states it. */
  exception: MemberId | null;
}

export interface ExtentsJudged {
  /** Every touched extent is met, and no path is unclassified or refused. Otherwise the publication is `not-reserved`, `rules-not-met`. */
  met: boolean;
  /** The names of the extents that are not met, in the order of the rules, for the publication's `reason`. `rules` is among them when a path was refused. */
  unmet: readonly string[];
  /** The class that is recorded for the change. */
  class: ExtentClass | null;
  extents: readonly ExtentJudged[];
}

/**
 * Which obligations of a change are met ("How a change is judged", steps 2
 * to 5, and "What the planner decided").
 *
 * - *Each touched extent is asked.* Enough approving verdicts that state
 *   the extent, from different members who hold its `approver` and are
 *   independent of the authors, and a passed job for each check that it
 *   names. The obligations of a mixed change are the union: nothing is
 *   averaged. A verdict counts for the one extent that it states, and one
 *   that states none counts for none.
 * - *Independence* (section 3.10). A reviewer is not among the authors.
 *   When `ownerMayReview` is false, a reviewer is not the controller of an
 *   agent among them.
 * - *The `rules` extent.* A review counts only from a holder of
 *   `rules.publish`, and `ownerMayReview` is read as false, whatever the
 *   repository set (I3 deltas, entry EV15).
 * - *Its one exception.* Three things must all hold: the observed rules
 *   declare it; exactly one member is a controller; and that member is
 *   among the authors, or controls an agent among them. Then the reviews of
 *   the `rules` extent are met when that member signed the `merge`. Its
 *   checks stand, as every other obligation does. Where the one controller
 *   is independent of the authors no exception is used: that member's
 *   review is asked.
 * - *A class beyond `content`.* The landing actor holds `change.merge`: the
 *   standing grant on the destination, which a grant over the whole
 *   repository satisfies until a grant can name one destination. The three
 *   other obligations of the planner's second decision are records of the
 *   destination itself, and nothing here judges them (I3 deltas, entry
 *   EV9).
 * - *A path that no extent holds, and a path that a link refused.* The
 *   change is not met. A refused path makes `rules` unmet, also where the
 *   rules name no such extent.
 */
export function judgeExtents(asked: ExtentsAsked): ExtentsJudged {
  const authors = new Set(asked.authors);
  const owners = new Set(asked.controllersOfAuthors);
  const passed = new Set(asked.passed);
  const refused = asked.touched.refused.length > 0;
  const controllers = asked.controllers === null ? null : [...new Set(asked.controllers)];
  const one = asked.singleControllerException && controllers?.length === 1 ? controllers[0]! : null;
  const excepted = one !== null && (authors.has(one) || owners.has(one)) && asked.merger.member === one ? one : null;
  const touched = new Set(asked.touched.touched.map((row) => row.extent));

  const extents = asked.extents.filter((extent) => touched.has(extent.name)).map((extent): ExtentJudged => {
    const rules = extent.name === RULES_EXTENT;
    const counts = (review: Review) =>
      review.extent === extent.name && review.holds.includes(extent.approver) && (!rules || review.holds.includes(CONTROLLER))
      && !authors.has(review.member) && ((asked.ownerMayReview && !rules) || !owners.has(review.member));
    const counted = [...new Set(asked.reviews.filter(counts).map((review) => review.member))].sort(byteOrder);
    const exception = rules && counted.length < extent.approvals ? excepted : null;
    const lacks: Lack[] = [];
    if (counted.length < extent.approvals && exception === null) lacks.push("approvals");
    if (!extent.checks.every((check) => passed.has(check))) lacks.push("checks");
    if (extent.class !== "content" && !asked.merger.holds.includes(LANDING)) lacks.push("grant");
    return { extent: extent.name, class: extent.class, met: lacks.length === 0 && !(rules && refused), counted, lacks, exception };
  });
  const unmet = extents.filter((extent) => !extent.met).map((extent) => extent.extent);
  if (refused && !unmet.includes(RULES_EXTENT)) unmet.push(RULES_EXTENT);
  return { met: unmet.length === 0 && asked.touched.unclassified.length === 0, unmet, class: asked.touched.class, extents };
}
