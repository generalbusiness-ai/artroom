/**
 * The judgment of one reservation (authority note, revision 26, section
 * 6.5; section 12.1.5, "The evidence of `judge`, and what the rule reads";
 * section 12.1.4a, "How the rule `judge` judges extents"). It is the part
 * of the rule `judge` of `platform:destination@1` that says whether a
 * publication is reserved, and with which reason it is not. It is a plain
 * function of what its caller gives. It reads no scope, no repository and
 * no clock.
 *
 * **What is given, and from where.** The rule reads four things. Two of
 * them every outcome entry has: the evidence, and this scope's own records
 * (the recorded head, and the `reserve` message). The judgment needs
 * nothing else for four answers: `evidence-too-large`; `out-of-date`, where
 * the head that was read is not the recorded head; `integration-invalid`,
 * where the integration commit is not in the repository; and what an
 * outcome yields for a publication that is no longer `queued`.
 *
 * The other two are `observed` and the entries in `uses`. The judge of an
 * outcome gives a rule neither today (I3 deltas, entries EM3 and EU4), and
 * no text states how an entry of a lane is read by its bytes: the note
 * says that a rule reads "the input, the intent and the effects of a
 * fetched entry as they are sealed", and names no member of them. So what
 * the two would say is one explicit input here, `ReservationRead`. The
 * judgment of each check from it is written. The reading of it from
 * `observed` and `uses` is not (entry FA9). Without it this function
 * answers that it cannot judge, and the rule then writes nothing.
 *
 * **The inputs that no form supplies yet, and the value each is filled
 * with where it is absent.** Each fails closed.
 *
 * | Input | The missing form | Where absent |
 * |---|---|---|
 * | `extents` | The member `extents` of a `RulesContent` (the contract's part of form 2) | Null: the rules hold no extent. The approvals and the required checks of the rules are asked, and an unmet one is `rules-not-met`, alone. |
 * | `singleControllerException` | The same observation | False: no exception is declared. |
 * | `controllers` | Form 11, the count of the holders of `rules.publish` | Null: no exception is judged. |
 * | `controllersOfAuthors` | Form 15, the controller of an authoring agent | Null. No exception is shown by its second clause. And no review is shown to be independent by the second point of section 3.10: where that point is asked, which is when `ownerMayReview` is false and for the extent `rules` always, no review counts. |
 */

import type { FactRef, MemberId, MemberRef, Observation, RulesObservation, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { timeMs } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "@generalbusiness/artroom-derive";
import { LANDING, RULES_EXTENT, classify, judgeExtents, type Extent, type ExtentsAsked, type Holder, type Touched, type TreeLink } from "./extents.ts";

/** The member `changes` of the evidence of `judge` (section 12.1.4a): facts of the repository, and no judgment. */
export interface JudgeChanges {
  paths: readonly string[];                 // the changed set, each path once, in byte order
  links: readonly TreeLink[];               // each link that the rule of "A symbolic link" needs
  unreadable: number;                       // changed paths that are no text
}

/** The body of the evidence of `judge` (section 12.1.5). Basis `own-answer`: the answers of the host to this attempt's reads. */
export type JudgeEvidence =
  | { over: "entries" }                     // the count of entries to fetch is over the bound: nothing was fetched or read (G5)
  | {
    head: string | null;                    // the branch ref at the host: a commit ID, or null when the ref is absent
    present: boolean;                       // the integration commit and its whole closure are in the canonical repository
    tree: string | null;                    // the tree of the integration commit; null when `present` is false
    firstParent: string | null;             // its first parent; null when it has none, or when `present` is false
    ancestors: readonly string[];           // the commits of the selected reports that are its ancestors
    changes: JudgeChanges | { over: "paths" | "links" | "bytes" } | null;   // null when `present` is false
  };

/** The eligibility statement, as the message of the publication's `reserve` holds it (section 6.3): the three lists that `collect-list` checked. */
export interface Statement {
  verdicts: readonly { review: FactRef; reviewer: MemberRef; verdict: "approve" | "request-changes"; extent?: string }[];
  jobs: readonly { job: FactRef; name: string; state: "requested" | "passed" | "failed" | "errored" | "timed-out"; decidedBy?: FactRef }[];
  links: readonly { link: FactRef; issue: ScopeRef }[];
}

/**
 * What `observed` and the entries in `uses` say for one reservation
 * (section 12.1.5, the table "The rule reads"). Each member names the row
 * of that table, or the check of section 6.5, that it is read for.
 */
export interface ReservationRead {
  /** `observed`: the observation of the key that signed P's `merge` entry. Null: none is at hand. */
  merger: Observation | null;
  /** `observed`: the one observation of the rules scope, asked as "rules". Null: none is at hand. */
  rules: RulesObservation | null;
  /** The extents of the observed rules. Null: the observation carries none. */
  extents: readonly Extent[] | null;
  /** The observed rules' declaration of the single-controller exception. */
  singleControllerException: boolean;
  /** The manifest's entry, in `uses`: its base, integration commit and tree; the commits of its selected reports; its authors (section 3.10); and whether it is complete (R2 section 5.2). */
  manifest: { base: string; integration: string; tree: string; reports: readonly string[]; authors: readonly MemberId[]; complete: boolean };
  /** The controller of each agent among the authors. Null: no retained input says (the missing form 15). */
  controllersOfAuthors: readonly MemberId[] | null;
  /** Every active member with an active key who holds `rules.publish`. Null: no observation says (the missing form 11). */
  controllers: readonly MemberId[] | null;
  /**
   * One for each verdict of the statement, in its order. `sound`: the
   * verdict's entry, in `uses`, is a verdict of that reviewer on this
   * manifest, as the statement says. `key`: the observation of the key
   * that signed it. Null: none is at hand, and the verdict is not counted.
   */
  verdicts: readonly { sound: boolean; key: Observation | null }[];
  /**
   * For a check, by its name: what the opening and the deciding entry of
   * its one live job show (section 6.5, the second table). `opening`,
   * check 3: `other-configuration` when the configuration is not the one
   * that the observed rules hold now, `unsound` when the entry is not that
   * job's. `deciding`: checks 4 to 7 hold. `key`: the observation of the
   * signer's key, for check 8.
   */
  checks: Readonly<Record<string, { opening: "sound" | "other-configuration" | "unsound"; deciding: boolean; key: Observation | null }>>;
}

export interface ReservationAsked {
  /** G's recorded head: `branch.head`. */
  recorded: string | null;
  evidence: JudgeEvidence;
  statement: Statement;
  /** Null: the caller has not read `observed` and `uses`, or cannot. */
  read: ReservationRead | null;
  /** The time of the entry: the one clock reading of its commit. */
  time: Timestamp;
}

/**
 * Reserved, with the integration commit, and with the text of `reason`
 * when the exception was used. Or not reserved, with the reason. Or not
 * judged: the answer needs what `observed` and `uses` say, and none was
 * given.
 */
export type Reservation = { reserved: true; integration: string; reason: string | null } | { reserved: false; reason: string } | { reserved: null };

/** The seven reasons of section 6.5, as the slot `reason` holds them. With extents, `rules-not-met` is followed by the names (section 12.1.4a). */
export const NOT_RESERVED = ["out-of-date", "integration-invalid", "authority-lost", "evidence-invalid", "rules-not-met", "incomplete", "evidence-too-large"] as const;

/** Section 6.5: "by an observation within ten seconds". It is ten seconds on G's clock (section 3.12). */
const WINDOW_MS = 10_000;

/**
 * Section 6.5, in the order of its first table. The first check that fails
 * gives the reason. Within the fourth row, evidence that is not what the
 * statement says is `evidence-invalid`, and it is said before a rule that
 * is not met (I3 deltas, entry FA10).
 */
export function judgeReservation({ recorded, evidence, statement, read, time }: ReservationAsked): Reservation {
  const no = (reason: string): Reservation => ({ reserved: false, reason });
  // G5: the count of entries to fetch, or the member `changes`, is over its bound. Nothing more is judged.
  if ("over" in evidence || (evidence.changes !== null && "over" in evidence.changes)) return no("evidence-too-large");
  // Check 1, as far as this scope's own records say: the head just read is G's recorded head. Where the two differ another
  // writer moved the branch (section 6.9), and nothing is reserved.
  if (evidence.head === null || evidence.head !== recorded) return no("out-of-date");
  // Check 2, as far as the evidence alone says: the integration commit and its whole closure are in the canonical repository.
  if (!evidence.present || evidence.changes === null) return no("integration-invalid");
  if (read === null || read.rules === null || read.rules.content.asked !== "rules") return { reserved: null };

  const { manifest } = read;
  const rules = read.rules.content;
  // Check 1: the manifest's base equals the head just read.
  if (manifest.base !== evidence.head) return no("out-of-date");
  // Check 2: its tree is the one named; the base is its first parent; each selected report's commit is its ancestor.
  if (evidence.tree !== manifest.tree || evidence.firstParent !== manifest.base || !manifest.reports.every((commit) => evidence.ancestors.includes(commit))) return no("integration-invalid");
  // Check 3: the merger's key holds `change.merge`, by an observation within ten seconds.
  const merger = read.merger;
  const [at, now] = [merger ? timeMs(merger.at) : null, timeMs(time)];
  const within = at !== null && now !== null && now >= at && now - at <= WINDOW_MS;
  if (!merger || !within || merger.keyState !== "active" || merger.memberState !== "active" || !merger.actions.includes(LANDING)) return no("authority-lost");

  // Check 4, from the complete statement. A verdict whose entry is not what the statement says is invalid evidence. An approval
  // counts from a key that is observed and is not compromised, whose member is the reviewer.
  let invalid = statement.verdicts.some((_, n) => read.verdicts[n]?.sound !== true);
  const changesAsked = statement.verdicts.some((verdict) => verdict.verdict === "request-changes");
  const approvals = statement.verdicts.flatMap((verdict, n) => {
    const key = read.verdicts[n]?.key ?? null;
    return verdict.verdict === "approve" && key !== null && key.keyState !== "compromised" && key.member === verdict.reviewer.member ? [{ extent: verdict.extent ?? null, member: key.member, holds: key.actions }] : [];
  });
  /** One required check, by the second table of section 6.5. */
  const check = (name: string): "met" | "unmet" | "invalid" => {
    const jobs = statement.jobs.filter((job) => job.name === name);
    // Checks 1 and 2: exactly one live job with that name, and it is `passed`.
    if (jobs.length !== 1 || jobs[0]!.state !== "passed") return "unmet";
    const shown = Object.hasOwn(read.checks, name) ? read.checks[name]! : null;
    // Check 3: the opening entry is that job's; another configuration than the rules hold now does not meet the rule.
    if (shown === null || shown.opening === "unsound") return "invalid";
    if (shown.opening === "other-configuration") return "unmet";
    // Checks 4 to 8.
    return shown.deciding && shown.key !== null && shown.key.keyState !== "compromised" ? "met" : "invalid";
  };
  const authors = new Set(manifest.authors);

  if (read.extents === null) {
    // The rules hold no extent: their one number of approvals and their required checks.
    const checks = rules.checks.filter((required) => required.required).map((required) => check(required.name));
    // Section 3.10: a reviewer is not among the authors and, when `ownerMayReview` is false, is not the controller of an agent among them.
    const independent = (member: MemberId) => !authors.has(member) && (rules.ownerMayReview || (read.controllersOfAuthors !== null && !read.controllersOfAuthors.includes(member)));
    invalid ||= checks.includes("invalid");
    if (invalid) return no("evidence-invalid");
    if (changesAsked || checks.includes("unmet") || new Set(approvals.map((approval) => approval.member).filter(independent)).size < rules.approvals) return no("rules-not-met");
    return manifest.complete ? { reserved: true, integration: manifest.integration, reason: null } : no("incomplete");
  }

  // Section 12.1.4a, "How the rule `judge` judges extents", steps 1 to 7.
  const extents = read.extents;
  const classified = classify(extents, evidence.changes.paths, evidence.changes.links);
  // Step 6: an unreadable path makes the extent `rules` unmet, as a refused link does. Its class is `authority`.
  const touched: Touched = evidence.changes.unreadable > 0 ? { ...classified, refused: [...classified.refused, ""], class: "authority" } : classified;
  const names = new Set(touched.touched.map((row) => row.extent));
  // Step 3: a passed job for each check that a touched extent names, as section 6.5 checks a required check.
  const asked = [...new Set(extents.filter((extent) => names.has(extent.name)).flatMap((extent) => extent.checks))].sort(byteOrder);
  const checked = asked.map((name) => [name, check(name)] as const);
  invalid ||= checked.some(([, result]) => result === "invalid");
  if (invalid) return no("evidence-invalid");
  if (changesAsked) return no("rules-not-met");
  const reviewers = [...new Set(approvals.map((approval) => approval.member))];
  const common: Omit<ExtentsAsked, "reviews" | "controllersOfAuthors" | "singleControllerException"> = {
    extents, ownerMayReview: rules.ownerMayReview, touched, authors: manifest.authors,
    passed: checked.filter(([, result]) => result === "met").map(([name]) => name),
    merger: { member: merger.member, holds: merger.actions }, controllers: read.controllers,
  };
  // Step 5: the exception, for the extent `rules`. Its third condition is judged by its first clause where the controllers of
  // the authoring agents are not known.
  const excepted = judgeExtents({ ...common, reviews: [], controllersOfAuthors: read.controllersOfAuthors ?? [], singleControllerException: read.singleControllerException })
    .extents.find((extent) => extent.extent === RULES_EXTENT)?.exception ?? null;
  // Step 2: a review counts for the one extent that it states. Each touched extent is judged with the reviews that state it.
  // Where the controllers of the authoring agents are not known, every reviewer is taken as one of them: no review is then
  // counted where the second point of independence is asked.
  const judged = touched.touched.map((row) => {
    const reviews: Holder[] = approvals.filter((approval) => approval.extent === row.extent).map(({ member, holds }) => ({ member, holds }));
    return judgeExtents({ ...common, reviews, controllersOfAuthors: read.controllersOfAuthors ?? reviewers, singleControllerException: false }).extents.find((extent) => extent.extent === row.extent)!;
  });
  let used = false;
  const unmet = judged.filter((extent) => {
    if (extent.met) return false;
    const byException = extent.extent === RULES_EXTENT && excepted !== null && touched.refused.length === 0 && extent.lacks.length === 1 && extent.lacks[0] === "approvals";
    used ||= byException;
    return !byException;
  }).map((extent) => extent.extent);
  if (touched.refused.length > 0 && !unmet.includes(RULES_EXTENT)) unmet.push(RULES_EXTENT);
  // "The exact text of `reason`": the names of the unmet extents, in the order of the observed rules.
  const ordered = [...extents.map((extent) => extent.name).filter((name) => unmet.includes(name)), ...unmet.filter((name) => !extents.some((extent) => extent.name === name))];
  if (ordered.length > 0) return no(`rules-not-met:${ordered.join(",")}`);
  if (touched.unclassified.length > 0) return no("rules-not-met");
  if (!manifest.complete) return no("incomplete");
  return { reserved: true, integration: manifest.integration, reason: used ? `single-controller:${RULES_EXTENT}:${excepted}:m${merger.head.seq}:r${read.rules.revision}:h${read.rules.head.seq}` : null };
}

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** A commit or a tree, as text: the ID of a Git object in one of the two object formats. */
export const isObjectId = (value: unknown): value is string => typeof value === "string" && OBJECT_ID.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const members = (value: Record<string, unknown>, names: readonly string[]): boolean => Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const isPath = (value: unknown): boolean => typeof value === "string";

/**
 * Whether a value is the body of the evidence of `judge`, member for
 * member (section 12.1.5). The bounds of `changes` are examples that the
 * proof plan owns, and are not checked here: a change that passes one is
 * given as `over`, by the runtime that counted it.
 */
export function isJudgeEvidence(value: unknown): value is JudgeEvidence {
  if (!isRecord(value)) return false;
  if (Object.hasOwn(value, "over")) return members(value, ["over"]) && value["over"] === "entries";
  if (!members(value, ["head", "present", "tree", "firstParent", "ancestors", "changes"])) return false;
  const { head, present, tree, firstParent, ancestors, changes } = value;
  if (!(head === null || isObjectId(head)) || typeof present !== "boolean" || !Array.isArray(ancestors) || !ancestors.every(isObjectId)) return false;
  // Where the commit is not present, nothing of it is read.
  if (!present) return tree === null && firstParent === null && changes === null;
  if (!isObjectId(tree) || !(firstParent === null || isObjectId(firstParent)) || !isRecord(changes)) return false;
  if (Object.hasOwn(changes, "over")) return members(changes, ["over"]) && ["paths", "links", "bytes"].includes(changes["over"] as string);
  const { paths, links, unreadable } = changes;
  return members(changes, ["paths", "links", "unreadable"]) && Array.isArray(paths) && paths.every(isPath) && typeof unreadable === "number" && Number.isSafeInteger(unreadable) && unreadable >= 0
    && Array.isArray(links) && links.every((link) => isRecord(link) && members(link, ["path", "tree", "resolves"]) && isPath(link["path"]) && ["old", "new", "both"].includes(link["tree"] as string)
      && (link["resolves"] === null || (Array.isArray(link["resolves"]) && link["resolves"].every(isPath))));
}
