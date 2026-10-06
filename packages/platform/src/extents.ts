/**
 * Extents: the named parts of a repository's tree, with what a change to
 * each must meet (authority note, revision 26, section 12.1.4a; the
 * planner's request `42de9e34`). The functions here are judgments over data
 * that their caller gives. They read no repository, no scope and no clock.
 *
 * The rules scope holds a repository's extents (`rules-scope.ts`): its
 * rule `extents-hold` runs `holdsRulesExtent`, and before a first `publish`
 * its extents are `firstExtents`. The scope that judges a change is the
 * destination, in the outcome of `judge` ("How the rule `judge` judges
 * extents"), under the rules that it observes for the reservation. That
 * caller is the destination's (`destination.ts`). Each datum that no
 * retained form supplies yet is an explicit input here, and each fails
 * closed when it is not given (I3 deltas, section 23 and entries FB6 to
 * FB9).
 *
 * | What | From the note | The input that no retained form supplies |
 * |---|---|---|
 * | `Extent`, `firstExtents` | "An extent", "The first definition", and section 12.1.4, "Before the first `publish`" | None |
 * | `holdsRulesExtent` | "Its fixed minimum" | None: the rule `extents-hold` of `publish` runs it |
 * | `matches`, `classify` | "A pattern", "A pattern, in two cases", "A symbolic link" | The changed set, the link rows and the count of paths that are no text: the missing form 1. Null, or none: `rules` is unmet |
 * | `judgeExtents` | "How the rule `judge` judges extents", steps 2 to 7; "Which reviews count for an extent"; "The exception, in the planner's words" | The extents of the observed rules: the contract owes `RulesContent.extents`. The count of controllers: the missing form 11; null, no exception. The controllers of the authoring agents: the missing form 15; null, no exception by the second clause, and no review where a controller's is refused |
 */

import type { MemberId } from "@generalbusiness/artroom-contract";
import { utf8 } from "@generalbusiness/artroom-bytes";
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

/** The most extents of one rules content ("How a repository changes its extents"; section 12.1.4, the rule `extent-list`). */
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

// ---------------------------------------------------------------- the bounds of a list of extents

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
/** A text of 1 to `most` bytes, each of which `allowed` takes. */
const textOf = (value: unknown, most: number, allowed: (byte: number) => boolean = () => true): value is string => {
  if (typeof value !== "string") return false;
  const bytes = utf8(value);
  return bytes.length >= 1 && bytes.length <= most && bytes.every(allowed);
};
/** A list of at most `most` values, each of which `each` takes. */
const listOf = <T>(value: unknown, most: number, each: (element: unknown) => element is T): value is T[] => Array.isArray(value) && value.length <= most && value.every(each);
const distinct = (values: readonly string[]): boolean => new Set(values).size === values.length;
/** A lowercase ASCII letter, a digit or a hyphen: the bytes of an extent's name, which a publication's `reason` then holds with no escape. */
const nameByte = (byte: number): boolean => (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x30 && byte <= 0x39) || byte === 0x2d;
/** A pattern: no byte below 0x20 and none that is 0x7F; it does not begin or end with `/` and holds no `//`, so no name of it is empty. */
const isPattern = (value: unknown): value is string =>
  textOf(value, 256, (byte) => byte >= 0x20 && byte !== 0x7f) && !value.startsWith("/") && !value.endsWith("/") && !value.includes("//");
const MEMBERS = ["name", "patterns", "approvals", "approver", "checks", "class"] as const;

/**
 * Whether a value is a list of extents, inside the bounds of section
 * 12.1.4, "An extent, with its bounds": what the rule `extent-list` asks of
 * the field `extents` of `publish` and of the slot. A list of 1 to 8
 * records, each with exactly the six members, and no name twice.
 *
 * | Member | Bound |
 * |---|---|
 * | `name` | A text of 1 to 64 bytes: lowercase ASCII letters, digits and hyphens |
 * | `patterns` | 0 to 32 texts of 1 to 256 bytes, each a pattern as above |
 * | `approvals` | An integer from 0 to 64 |
 * | `approver` | A text of 1 to 64 bytes: lowercase ASCII letters, digits, hyphens and full stops. It is not compared with the role table: no member holds an unknown action, so such an extent is never met |
 * | `checks` | 0 to 32 texts of 1 to 128 bytes, with no name twice |
 * | `class` | `content`, `deployment` or `authority` |
 *
 * The numbers are examples that the proof plan owns, as the note has them.
 */
export const isExtents = (value: unknown): value is Extent[] =>
  Array.isArray(value) && value.length >= 1 && value.length <= EXTENTS_MOST
  && value.every((extent: unknown) =>
    isRecord(extent) && Object.keys(extent).length === MEMBERS.length && MEMBERS.every((member) => Object.hasOwn(extent, member))
    && textOf(extent["name"], 64, nameByte)
    && listOf(extent["patterns"], 32, isPattern)
    && typeof extent["approvals"] === "number" && Number.isSafeInteger(extent["approvals"]) && extent["approvals"] >= 0 && extent["approvals"] <= 64
    && textOf(extent["approver"], 64, (byte) => nameByte(byte) || byte === 0x2e)
    && listOf(extent["checks"], 32, (check): check is string => textOf(check, 128)) && distinct(extent["checks"])
    && (EXTENT_CLASSES as readonly unknown[]).includes(extent["class"]))
  && distinct(value.map((extent: Extent) => extent.name));

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
  /**
   * The changed paths that are no text, by their count ("A path that is no
   * text"; the member `unreadable` of the evidence of `judge`). Null: the
   * caller did not state the count, the changed set or the links, so
   * nothing says that the whole change was judged. Any value but 0 makes
   * `rules` unmet, as a refused link does.
   */
  unreadable: number | null;
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
 *
 * *What is assumed of the extents.* Exactly one has no pattern, and one is
 * named `rules`: `publish` refuses every other list (the rule
 * `extents-hold` of `rules-scope.ts`), and the first definition is such a
 * list. So under the rules of a rules scope every judged path is in an
 * extent. For a list that is no such list this function still fails
 * closed: with no extent without a pattern, a judged path that no extent
 * holds makes its changed path unclassified, and the change is not met.
 *
 * *The three inputs of the missing form 1.* No retained input holds a
 * changed set yet, so the caller gives each datum, as the member `changes`
 * of the evidence of `judge` will ("The evidence of `judge`, for extents").
 *
 * | Input | What a caller gives | With null, or with none |
 * |---|---|---|
 * | `changed` | The changed set, each path that is a text | Nothing is touched, and `unreadable` is null: `rules` is unmet |
 * | `links` | Each link row that the rule needs. An empty list says that no link is at, or resolves to, a changed path | No link is followed, and `unreadable` is null: `rules` is unmet |
 * | `unreadable` | The count of changed paths that are no text: 0 when every path is a text | `unreadable` is null: `rules` is unmet |
 *
 * So a caller that has no changed set gives null and the change is not
 * met. An empty changed set that is given says that the change touches no
 * path, and then nothing is asked.
 */
export function classify(extents: readonly Extent[], changed: readonly string[] | null | undefined, links: readonly TreeLink[] | null | undefined, unreadable?: number | null): Touched {
  const shown = new Map<string, string>();
  const [unclassified, refused] = [new Set<string>(), new Set<string>()];
  const stated = Array.isArray(changed) && Array.isArray(links) && typeof unreadable === "number" && Number.isSafeInteger(unreadable) && unreadable >= 0;
  [changed, links] = [changed ?? [], links ?? []];
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
  // A refused path, and a path that is no text or was not stated, is a change to the `rules` extent, whose class is `authority`.
  const unread = stated ? unreadable! : null;
  if (refused.size > 0 || unread !== 0) classes.push(EXTENT_CLASSES.indexOf("authority"));
  return { touched, unclassified: [...unclassified], refused: [...refused], unreadable: unread, class: classes.length > 0 ? EXTENT_CLASSES[Math.max(...classes)]! : null };
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
  /** The rules' declaration of the single-controller exception, from the same observation: `content.singleControllerException` (the contract's revision 19, section 16.1). Anything but true is no declaration. */
  singleControllerException: boolean;
  /** What the change touches under those extents: `classify`, of the changed set that the runtime computed (the missing form 1). */
  touched: Touched;
  /** The manifest's authors, as section 3.10 lists them. */
  authors: readonly MemberId[];
  /**
   * The controller of each agent among the authors, from an observation of
   * each authoring agent that the reservation's entry retains. No row
   * retains one yet (the missing form 15), so until it does the caller
   * gives null: nothing says who controls an author. An empty list is a
   * statement that no author is an agent with a controller, and only a
   * caller that holds those observations may make it.
   */
  controllersOfAuthors: readonly MemberId[] | null;
  /** The approving verdicts that count for the manifest by the first three rules of section 3.10, each by its reviewer, with the extent that it states. Independence is judged here. */
  reviews: readonly Review[];
  /** The names of the checks with a passed job on the manifest, as section 6.5 counts a required check. */
  passed: readonly string[];
  /** The member who signed the `merge`: the landing actor. */
  merger: Holder;
  /** Every active member with an active key who holds `rules.publish`, at the head of membership that was observed. No observation counts the holders of an action yet (the missing form 11), so until one does the caller gives null, and then no exception is judged. */
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
  /** Every touched extent is met, no path is unclassified or refused, and every changed path was a text that was judged. Otherwise the publication is `not-reserved`, `rules-not-met`. */
  met: boolean;
  /** The names of the extents that are not met, in the order of the rules, for the publication's `reason`. `rules` is among them when a path was refused, was no text or was not stated. */
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
 * - *Its one exception* ("The exception, in the planner's words", as
 *   revision 26 restores it). Three things must all hold: the observed
 *   rules declare it; exactly one member is a controller; and that member
 *   is among the authors, or controls an agent among them. Then the
 *   reviews of the `rules` extent are met when that member signed the
 *   `merge`. Its checks stand, as every other obligation does. Where the
 *   one controller is independent of the authors no exception is used:
 *   that member's review is asked.
 * - *With no controllers of the authors* (`controllersOfAuthors` is null:
 *   the missing form 15). Nothing shows the second clause of the third
 *   condition, so an agent's change gets no exception. And nothing shows
 *   that a reviewer is not the controller of an authoring agent, so no
 *   review counts where that relation would refuse one: for the `rules`
 *   extent always, and for every other extent unless `ownerMayReview` is
 *   true. The first clause needs no such input: it reads the authors and
 *   the merger. Revision 26 lists as open from which retained record the
 *   relation is read for a review (its section 13.16); this is the side
 *   that fails closed (I3 deltas, entry FB7).
 * - *With no count of controllers* (`controllers` is null: the missing
 *   form 11). No exception is judged.
 * - *A class beyond `content`.* The landing actor holds `change.merge`: the
 *   standing grant on the destination, which a grant over the whole
 *   repository satisfies until a grant can name one destination. The three
 *   other obligations of the planner's second decision are records of the
 *   destination itself, and nothing here judges them (I3 deltas, entry
 *   EV9).
 * - *A path that no extent holds, a path that a link refused, and a path
 *   that is no text.* The change is not met. A refused path and a path
 *   that is no text each make `rules` unmet, also where the change touches
 *   no path of that extent. Neither a review nor the exception meets it:
 *   the way forward is to change the link or the path (decided by the
 *   planner, revision 26). The same holds where `touched.unreadable` is
 *   null, or is no member: the caller did not state the whole changed set.
 */
export function judgeExtents(asked: ExtentsAsked): ExtentsJudged {
  const authors = new Set(asked.authors);
  // Null: nothing says who controls an agent among the authors (the missing form 15).
  const owners = Array.isArray(asked.controllersOfAuthors) ? new Set(asked.controllersOfAuthors) : null;
  const passed = new Set(asked.passed);
  const refused = asked.touched.refused.length > 0 || asked.touched.unreadable !== 0;
  const controllers = Array.isArray(asked.controllers) ? [...new Set(asked.controllers)] : null;
  const one = asked.singleControllerException === true && controllers?.length === 1 ? controllers[0]! : null;
  const excepted = one !== null && (authors.has(one) || owners?.has(one) === true) && asked.merger.member === one ? one : null;
  const touched = new Set(asked.touched.touched.map((row) => row.extent));

  const extents = asked.extents.filter((extent) => touched.has(extent.name)).map((extent): ExtentJudged => {
    const rules = extent.name === RULES_EXTENT;
    const counts = (review: Review) =>
      review.extent === extent.name && review.holds.includes(extent.approver) && (!rules || review.holds.includes(CONTROLLER))
      && !authors.has(review.member) && ((asked.ownerMayReview === true && !rules) || (owners !== null && !owners.has(review.member)));
    const counted = [...new Set(asked.reviews.filter(counts).map((review) => review.member))].sort(byteOrder);
    // A refused path is never met, by a review or by the exception.
    const exception = rules && !refused && counted.length < extent.approvals ? excepted : null;
    const lacks: Lack[] = [];
    if (counted.length < extent.approvals && exception === null) lacks.push("approvals");
    if (!extent.checks.every((check) => passed.has(check))) lacks.push("checks");
    if (extent.class !== "content" && !asked.merger.holds.includes(LANDING)) lacks.push("grant");
    return { extent: extent.name, class: extent.class, met: lacks.length === 0 && !(rules && refused), counted, lacks, exception };
  });
  // In the order of the rules ("The exact text of `reason`"). `rules` is unmet for a refused path also where no path of it is touched.
  const lacking = new Set(extents.filter((extent) => !extent.met).map((extent) => extent.extent));
  if (refused) lacking.add(RULES_EXTENT);
  const unmet = asked.extents.map((extent) => extent.name).filter((name) => lacking.delete(name));
  unmet.push(...lacking);
  return { met: unmet.length === 0 && asked.touched.unclassified.length === 0, unmet, class: asked.touched.class, extents };
}
