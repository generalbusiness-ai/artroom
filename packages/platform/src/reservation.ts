/**
 * The destination's pure reservation judgment, under adopted authority
 * revision 28, sections 6.5, 12.1.5 and 12.1.4a.
 *
 * destination.ts builds ReservationRead from the five observation rows,
 * retained lane entries, the retained extents and the changed-set value.
 * This function checks the statement against those facts and decides the
 * reason, the integration commit and any single-controller exception.
 *
 * RecordedJudgeEvidence is the outcome's wire body. JudgeEvidence is its
 * resolved view, after the declared changed-set domain has been read.
 * The observation of the holders supplies the membership head recorded
 * by an exception. Nothing here reads a scope, a store or a host.
 */

import type { Digest, FactRef, MemberId, MemberRef, Observation, RulesObservation, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, isDigest, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "@generalbusiness/artroom-derive";
import { editPath } from "./destination-objects.ts";
import { LANDING, RULES_EXTENT, classify, judgeExtents, type Extent, type ExtentsAsked, type Review, type TreeLink } from "./extents.ts";

/** What a one-file manifest states (i5 edit): the path, the digest and size of the bytes, and the bytes as a text. */
export interface EditFile { path: string; digest: string; size: number; content: string }

/** True when the text's bytes have the digest and the size that the manifest states: the bytes package's SHA-256 digest of the UTF-8 bytes. */
export const fileSound = (file: EditFile): boolean => { const bytes = utf8(file.content); return bytes.length === file.size && digestBytes(bytes) === file.digest; };

/** The member `changes` of the evidence of `judge` (section 12.1.4a): facts of the repository, and no judgment. */
export interface JudgeChanges {
  paths: readonly string[];                 // the changed set, each path once, in byte order
  links: readonly TreeLink[];               // each link that the rule of "A symbolic link" needs
  unreadable: number;                       // changed paths that are no text
}

/**
 * The resolved evidence of `judge` (section 12.1.5). Basis `own-answer`:
 * the answers of the host to this attempt's reads. From the note's revision
 * 28 it has no member `{ over: "entries" }`: the count of the entries that a
 * `reserve` names is made when the message is delivered, and a message
 * over the bound is refused `bad-field` there (section 6.5, "The count,
 * with reports").
 */
export interface JudgeEvidence {
  head: string | null;                    // the branch ref at the host: a commit ID, or null when the ref is absent
  present: boolean;                       // the integration commit and its whole closure are in the canonical repository
  tree: string | null;                    // the tree of the integration commit; null when `present` is false
  firstParent: string | null;             // its first parent; null when it has none, or when `present` is false
  ancestors: readonly string[];           // those of the selected reports' commits that the host showed to be its ancestors, and no other commit
  changes: JudgeChanges | { over: "paths" | "links" | "bytes" } | null;   // null when `present` is false
}

/** The host's changed set is retained separately; the outcome records only its digest (authority revision 28). */
export const DESTINATION_CHANGED_SET = { domain: "artroom-changed-set-1", max: 262144, paths: 2048, links: 256 } as const;
export type RecordedJudgeEvidence = Omit<JudgeEvidence, "changes"> & { changes: Digest | { over: "paths" | "links" | "bytes" } | null };

/** The recorded body is checked before the separate bytes are read. A present integration names a digest or an explicit bound failure. */
export function isRecordedJudgeEvidence(value: unknown): value is RecordedJudgeEvidence {
  if (!isRecord(value)) return false;
  const changes = value["changes"];
  if (isDigest(changes)) return isJudgeEvidence({ ...value, changes: { paths: [], links: [], unreadable: 0 } });
  return (changes === null || (isRecord(changes) && Object.hasOwn(changes, "over"))) && isJudgeEvidence(value);
}

/** The resolved changed set, within the domain's path and link bounds. Byte size and digest are checked by the generic value read. */
export function isJudgeChanges(changes: unknown): changes is JudgeChanges {
  if (!isRecord(changes) || Object.hasOwn(changes, "over")) return false;
  return isJudgeEvidence({ head: null, present: true, tree: "a".repeat(40), firstParent: null, ancestors: [], changes })
    && (changes["paths"] as string[]).length <= DESTINATION_CHANGED_SET.paths && (changes["links"] as unknown[]).length <= DESTINATION_CHANGED_SET.links
    && (changes["paths"] as string[]).every((path, n, paths) => n === 0 || byteOrder(paths[n - 1]!, path) < 0);
}

/**
 * The eligibility statement, as the message of the publication's `reserve`
 * holds it (section 6.3): its six fields. `operation` is P's `merge` entry,
 * which is the source entry of the delivery. `reports` names the `report`
 * entry of each selected report, in the order of the manifest's selections
 * (the note's revision 28, section 6.5).
 */
export interface Statement {
  operation: FactRef;
  manifest: FactRef;
  verdicts: readonly { review: FactRef; reviewer: MemberRef; verdict: "approve" | "request-changes"; extent?: string }[];
  jobs: readonly { job: FactRef; name: string; state: "requested" | "passed" | "failed" | "errored" | "timed-out"; decidedBy?: FactRef }[];
  links: readonly { link: FactRef; issue: ScopeRef }[];
  reports: readonly FactRef[];
}

/**
 * What `observed` and the entries in `uses` say for one reservation
 * (section 12.1.5, the table "The rule reads"). Each member names the row
 * of that table, or the check of section 6.5, that it is read for.
 */
export interface ReservationRead {
  /** The merge names the manifest that the statement names. */
  sound?: boolean;
  /** Membership head that showed the holders of rules.publish, for the exception record. */
  controllersHead?: number | undefined;
  /** `observed`: the observation of the key that signed P's `merge` entry. Null: none is at hand. */
  merger: Observation | null;
  /** `observed`: the one observation of the rules scope, asked as "rules". Null: none is at hand. */
  rules: RulesObservation | null;
  /** The extents of the observed rules. Null: the observation carries none. */
  extents: readonly Extent[] | null;
  /** The observed rules' declaration of the single-controller exception. */
  singleControllerException: boolean;
  /**
   * The manifest's entry, in `uses`: its base, integration commit and tree;
   * its authors (section 3.10); and whether it is complete (R2 section
   * 5.2). A one-file manifest (i5 edit) names no integration commit and no
   * tree: `file` holds what it states, and the caller gives the tree of the
   * host's evidence and the commit that the destination writes for it.
   * `reports`: the commit of each selected report, from the `report`
   * entry that the statement names for it, in `uses`. Null: the named
   * reports are not the manifest's selections, place for place, or an
   * entry that one names opened no report or set no commit.
   */
  manifest: { base: string; integration: string | null; tree: string | null; file?: EditFile | null; reports: readonly string[] | null; authors: readonly MemberId[]; complete: boolean };
  /** The controller of each agent among the authors, from their member observations. Null: no retained input says. */
  controllersOfAuthors: readonly MemberId[] | null;
  /** The sole active holder of rules.publish, or an empty list when its count differs from one. Null: no holders observation says. */
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
  /** The one-file manifest that the statement names, read from its entry in `uses`; null for any other manifest. */
  file?: EditFile | null;
}

/**
 * Reserved, with the integration commit, and with the text of `reason`
 * when the exception was used. Or not reserved, with the reason. Or not
 * judged: the answer needs what `observed` and `uses` say, and none was
 * given.
 */
export type Reservation = { reserved: true; integration: string; reason: string | null } | { reserved: false; reason: string } | { reserved: null };

/**
 * The seven reasons of section 6.5, as the slot `reason` holds them. With extents, `rules-not-met` is followed by the names (section
 * 12.1.4a). The eighth, `path-invalid`, is i5's, not the note's: a one-file manifest whose path no published tree may hold.
 */
export const NOT_RESERVED = ["out-of-date", "integration-invalid", "authority-lost", "evidence-invalid", "rules-not-met", "incomplete", "evidence-too-large", "path-invalid"] as const;

/** Section 6.5: "by an observation within ten seconds". It is ten seconds on G's clock (section 3.12). */
const WINDOW_MS = 10_000;

/**
 * Section 6.5, in the order of its first table. The first check that fails
 * gives the reason. Within the fourth row, evidence that is not what the
 * statement says is `evidence-invalid`, and it is said before a rule that
 * is not met (I3 deltas, entry FA10).
 */
export function judgeReservation({ recorded, evidence, statement, read, time, file = null }: ReservationAsked): Reservation {
  const no = (reason: string): Reservation => ({ reserved: false, reason });
  // G5: the member `changes` is over its bound. Nothing more is judged.
  if (evidence.changes !== null && "over" in evidence.changes) return no("evidence-too-large");
  // Check 1, as far as this scope's own records say: the head just read is G's recorded head. Where the two differ another
  // writer moved the branch (section 6.9), and nothing is reserved.
  if (evidence.head === null || evidence.head !== recorded) return no("out-of-date");
  // i5 edit: a one-file manifest's path is one that a published tree may hold, or nothing is reserved, by that name. The host
  // writes no object for such a path, so this is said before what the evidence lacks.
  if (file !== null && editPath(file.path) === null) return no("path-invalid");
  // Check 2, as far as the evidence alone says: the integration commit and its whole closure are in the canonical repository.
  if (!evidence.present || evidence.changes === null) return no("integration-invalid");
  if (read === null || read.rules === null || read.rules.content.asked !== "rules") return { reserved: null };

  const { manifest } = read;
  const rules = read.rules.content;
  // Check 1: the manifest's base equals the head just read.
  if (manifest.base !== evidence.head) return no("out-of-date");
  // Check 2: its tree is the one named; the base is its first parent; each selected report's commit is its ancestor.
  // The commits of the reports are read from their entries. Where the named reports are not the manifest's selections no commit
  // is read, and the statement is invalid evidence, below.
  // i5 edit: for a one-file manifest the bytes are the ones it states, and the host changed that path and no other.
  const edited = manifest.file ?? null;
  if (edited !== null && (!fileSound(edited) || !evidence.changes.paths.every((path) => path === edited.path))) return no("integration-invalid");
  if (manifest.tree === null || manifest.integration === null || evidence.tree !== manifest.tree || evidence.firstParent !== manifest.base || (manifest.reports !== null && !manifest.reports.every((commit) => evidence.ancestors.includes(commit)))) return no("integration-invalid");
  const integration = manifest.integration;
  // Check 3: the merger currently holds `change.merge`, including an active controller where one is recorded, by an
  // observation within ten seconds. Approval and check-result evidence below retains its historical noncompromise rules.
  const merger = read.merger;
  const [at, now] = [merger ? timeMs(merger.at) : null, timeMs(time)];
  const within = at !== null && now !== null && now >= at && now - at <= WINDOW_MS;
  if (!merger || !within || merger.keyState !== "active" || merger.memberState !== "active" || !merger.actions.includes(LANDING)) return no("authority-lost");
  if ((merger.controller !== null || merger.controllerActive !== null) && merger.controllerActive !== true) return no("authority-lost");

  // Check 4, from the complete statement. A verdict whose entry is not what the statement says is invalid evidence. An approval
  // counts from a key that is observed and is not compromised, whose member is the reviewer.
  // The statement is not the lane's, and so invalid evidence, in three more cases (section 6.5, "`reserve` names each selected
  // report"). The named reports are not the manifest's selections. An entry that the statement names is not P's, in P's
  // incarnation, which is the scope of `operation`. Or two records of `verdicts` name one `review`, or two records of `jobs` name
  // one `job` or one `decidedBy`: the lane's `collect` gives one record for an item, and a deciding entry sets one job.
  const [own, twice] = [(fact: FactRef) => fact.at.scope === statement.operation.at.scope && fact.at.inc === statement.operation.at.inc, (facts: readonly FactRef[]) => new Set(facts.map((fact) => canonicalize(fact))).size !== facts.length];
  const [reviews, jobs, deciding] = [statement.verdicts.map((verdict) => verdict.review), statement.jobs.map((job) => job.job), statement.jobs.flatMap((job) => (job.decidedBy ? [job.decidedBy] : []))];
  let invalid = read.sound === false || manifest.reports === null || ![statement.manifest, ...reviews, ...jobs, ...deciding].every(own) || twice(reviews) || twice(jobs) || twice(deciding)
    || statement.verdicts.some((_, n) => read.verdicts[n]?.sound !== true);
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
    return manifest.complete ? { reserved: true, integration, reason: null } : no("incomplete");
  }

  // Section 12.1.4a, "How the rule `judge` judges extents", steps 1 to 7.
  const extents = read.extents;
  // Step 6: the count of paths that are no text is stated to `classify`. Any count but 0 makes the extent `rules` unmet, as a
  // refused link does, and its class is `authority`. A count that is no count is read as not stated, which is unmet too.
  const touched = classify(extents, evidence.changes.paths, evidence.changes.links, evidence.changes.unreadable);
  const refused = touched.refused.length > 0 || touched.unreadable !== 0;
  const names = new Set(touched.touched.map((row) => row.extent));
  // Step 3: a passed job for each check that a touched extent names, as section 6.5 checks a required check.
  const asked = [...new Set(extents.filter((extent) => names.has(extent.name)).flatMap((extent) => extent.checks))].sort(byteOrder);
  const checked = asked.map((name) => [name, check(name)] as const);
  invalid ||= checked.some(([, result]) => result === "invalid");
  if (invalid) return no("evidence-invalid");
  if (changesAsked) return no("rules-not-met");
  const common: Omit<ExtentsAsked, "reviews" | "controllersOfAuthors" | "singleControllerException"> = {
    extents, ownerMayReview: rules.ownerMayReview, touched, authors: manifest.authors,
    passed: checked.filter(([, result]) => result === "met").map(([name]) => name),
    merger: { member: merger.member, holds: merger.actions }, controllers: read.controllers,
  };
  // Step 5: the exception, for the extent `rules`. Its third condition is judged by its first clause where the controllers of
  // the authoring agents are not known: `judgeExtents` reads null so.
  const excepted = judgeExtents({ ...common, reviews: [], controllersOfAuthors: read.controllersOfAuthors, singleControllerException: read.singleControllerException })
    .extents.find((extent) => extent.extent === RULES_EXTENT)?.exception ?? null;
  // Step 2: a review counts for the one extent that it states. Each touched extent is judged with the reviews that state it.
  // Each review is given with the extent that it states. Where the controllers of the authoring agents are not known the
  // caller gives null, and `judgeExtents` then counts no review where the second point of independence is asked.
  const judged = touched.touched.map((row) => {
    const reviews: Review[] = approvals.filter((approval) => approval.extent === row.extent);
    return judgeExtents({ ...common, reviews, controllersOfAuthors: read.controllersOfAuthors, singleControllerException: false }).extents.find((extent) => extent.extent === row.extent)!;
  });
  let used = false;
  const unmet = judged.filter((extent) => {
    if (extent.met) return false;
    const byException = extent.extent === RULES_EXTENT && excepted !== null && !refused && extent.lacks.length === 1 && extent.lacks[0] === "approvals";
    used ||= byException;
    return !byException;
  }).map((extent) => extent.extent);
  if (refused && !unmet.includes(RULES_EXTENT)) unmet.push(RULES_EXTENT);
  // "The exact text of `reason`": the names of the unmet extents, in the order of the observed rules.
  const ordered = [...extents.map((extent) => extent.name).filter((name) => unmet.includes(name)), ...unmet.filter((name) => !extents.some((extent) => extent.name === name))];
  if (ordered.length > 0) return no(`rules-not-met:${ordered.join(",")}`);
  if (touched.unclassified.length > 0) return no("rules-not-met");
  if (!manifest.complete) return no("incomplete");
  return { reserved: true, integration, reason: used ? `single-controller:${RULES_EXTENT}:${excepted}:m${read.controllersHead ?? merger.head.seq}:r${read.rules.revision}:h${read.rules.head.seq}` : null };
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
