/**
 * The ancestry walk (authority note, section 6.2, "Work that no recorded
 * fact names"; scope contract, section 16.4). It answers one question for
 * one commit: is an unpublished commit that was staged for other work
 * carried in by its ID, as the commit itself or as an ancestor of it? Its
 * result is the ancestry record, which the check entry holds as evidence.
 *
 * `walk` is a pure function of what was read and of the staging lane's own
 * history. The lane's runtime calls it before it writes the check entry,
 * and a replay calls it again, from the retained snapshot and from commits
 * read by ID. It never reads the staged refs or the branch as they are now.
 *
 * What is read, and how it is checked here:
 *
 * - **Object IDs.** Every ID is checked before it is used: lower-case hex,
 *   of 40 characters or of 64. The texts fix no hash function for a commit
 *   ID, and a `commit` value has either length (section 6.2). One walk has
 *   one length: that of its start. An ID of the other length is refused
 *   (I3 deltas, entry EF12).
 * - **Objects.** Each object is asked for by its ID, and is given with its
 *   type. Only a `commit` is taken. Its header is parsed strictly: one
 *   `tree` line first, then the `parent` lines, each a full object ID, then
 *   one `author` and one `committer` line. A missing object, another type
 *   and a malformed header are each refused by name, and the walk gives no
 *   record. That an object's bytes hash to its ID is the reader's check
 *   (plan row T16), which this package cannot make: it has no SHA-1.
 * - **The snapshot.** The staged refs as the host returned them: pairs of a
 *   ref under `refs/artroom/staged/` and its target. Its digest is in the
 *   byte domain `artroom-snapshot-1`, over the pairs in byte order of ref.
 *
 * What is bounded, and what is not. The parent walk visits at most
 * `bounds.visited` commits, and the record holds at most `bounds.stops`
 * stops and `bounds.F` listed commits. Past any of them the result is
 * `too-large`, and no judgment. `visited` counts the commits of the parent
 * walk and nothing else. It is no bound on the whole work: each question
 * "is this commit reachable from the head" reads commits of the branch's
 * history, and the texts propose no bound on that (section 6.2, "Work, and
 * what counts it"). A caller may set `bounds.reads`, a limit on the commits
 * read in all. It is the caller's own limit and no number of the texts.
 */

import type { Digest, FactRef, RetainedInput, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, isFactRef, isLocalId, isRecord, isScopeRef, parseStrict, snapshotDigest } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "../values.ts";

/** The ancestry record (authority note, section 6.2, "The record"; scope contract, section 16.4), member for member. */
export interface AncestryCheck {
  commit: string;                                // the commit judged: the start
  root: { number: number; state: "live" };       // the staging lane's root for it, as its records held it at the check
  head: string;                                  // the destination branch's head, as read for this check
  snapshot: { digest: Digest; count: number };   // the staged refs as returned, in the domain `artroom-snapshot-1`
  start:
    | { foreign: null }
    | { foreign: string; published: true }
    | { foreign: string; basis: { kind: "own-check"; checked: FactRef } | { kind: "input"; input: FactRef } | { kind: "row" } };
  stops: readonly (
    | { kind: "own-root"; commit: string; root: number; state: "live" | "retiring" | "retired"; checked: FactRef }
    | { kind: "selected-report"; commit: string; input: FactRef })[];
  F: readonly (
    | { commit: string; ref: string }
    | { commit: string; ref: string; start: true }
    | { commit: string; via: string })[];
  visited: number;
}

/** One staged ref of the snapshot, with its target. */
export interface StagedRef { ref: string; target: string }

/** The proposed bounds of one walk (authority note, section 6.2, "Bounds"; section 12, U17). The numbers are the proof plan's to measure. */
export const ANCESTRY_BOUNDS = { visited: 4096, stops: 64, F: 64 } as const;
export interface WalkBounds { visited: number; stops: number; F: number; reads?: number }

const STAGED = "refs/artroom/staged/";

/** The length of a Git object ID that is well formed: 40 for SHA-1, 64 for SHA-256. Null: it is no object ID. */
export const objectIdLength = (id: unknown): 40 | 64 | null => (typeof id === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(id) ? (id.length as 40 | 64) : null);

/** The name of a staged ref (authority note, section 6.2, "The root"): the lane, its incarnation, the commit and the root number. Null: the name has another form. */
export function stagedRef(ref: string): { scope: string; inc: string; commit: string; root: number } | null {
  const parts = ref.startsWith(STAGED) ? ref.slice(STAGED.length).split("/") : [];
  const [scope, inc, commit, number] = parts;
  if (parts.length !== 4 || !isScopeRef({ scope, inc, kind: "lane" }) || objectIdLength(commit) === null || !/^[1-9][0-9]*$/.test(number!) || !Number.isSafeInteger(Number(number))) return null;
  return { scope: scope!, inc: inc!, commit: commit!, root: Number(number) };
}

/** The ref name of a lane's root for a commit. */
export const stagedRefName = (lane: Pick<ScopeRef, "scope" | "inc">, commit: string, root: number): string => `${STAGED}${lane.scope}/${lane.inc}/${commit}/${root}`;

/**
 * A snapshot as the record names it: the pairs in byte order of ref, their
 * count, and their digest. Null: it is no list of staged refs. A pair
 * outside `refs/artroom/staged/`, a target that is no object ID, and a ref
 * that is listed twice are each no snapshot.
 */
export function snapshotOf(pairs: readonly StagedRef[]): { pairs: readonly StagedRef[]; digest: Digest; count: number } | null {
  if (!Array.isArray(pairs) || pairs.some((p: unknown) => !isRecord(p) || typeof p["ref"] !== "string" || !p["ref"].startsWith(STAGED) || objectIdLength(p["target"]) === null)) return null;
  const sorted = pairs.map(({ ref, target }) => ({ ref, target })).sort((a, b) => byteOrder(a.ref, b.ref));
  if (sorted.some((p, i) => i > 0 && p.ref === sorted[i - 1]!.ref)) return null;
  return { pairs: sorted, digest: snapshotDigest(sorted), count: sorted.length };
}

/**
 * A snapshot as a scope retains it (scope contract, sections 9.2 and 16.4):
 * the kind `snapshot`, the digest in the domain `artroom-snapshot-1`, and
 * the pairs in byte order of ref as canonical JSON text. Null: it is no
 * snapshot. The scope stores it before the entry that names the digest.
 */
export function snapshotInput(pairs: readonly StagedRef[]): RetainedInput | null {
  const snapshot = snapshotOf(pairs);
  return snapshot && { kind: "snapshot", digest: snapshot.digest, bytes: canonicalize(snapshot.pairs) };
}

/** The pairs of a retained snapshot, read from its bytes and checked against the digest that it is kept under. Null: the bytes are no snapshot with that digest. */
export function snapshotRead(digest: Digest, bytes: string): readonly StagedRef[] | null {
  let pairs: unknown;
  try {
    pairs = parseStrict(bytes);
  } catch {
    return null;
  }
  const snapshot = Array.isArray(pairs) ? snapshotOf(pairs as StagedRef[]) : null;
  return snapshot?.digest === digest ? snapshot.pairs : null;
}

/** One of the lane's own roots under the source commitment, as its records hold it. */
export interface OwnRoot { number: number; commit: string; state: string }

/**
 * A prior check (section 6.2, "The walk"): an earlier entry of the staging
 * lane that admitted an act for that commit under the source commitment, or
 * a check entry whose pin was later confirmed. `checked` is that entry.
 * `foreign` and `F` are its record's: whether it had a foreign start, and
 * the commits that it listed.
 */
export interface PriorCheck { commit: string; root: number; checked: FactRef; foreign: string | null; F: readonly string[] }

/**
 * The first foreign ref of the snapshot that targets the start, or null
 * (section 6.2, "The start"). Each ref is sorted by itself: it is own when
 * its name is of this lane and this incarnation, for this commit, with the
 * number of a root that the lane's records hold for this commit under the
 * source commitment. Every other ref is foreign: of another lane, of
 * another incarnation, of this lane under another commitment, or with a
 * name of another form. An own ref never hides a foreign one.
 */
export function foreignOn(pairs: readonly StagedRef[], commit: string, lane: Pick<ScopeRef, "scope" | "inc">, roots: readonly OwnRoot[]): string | null {
  for (const { ref, target } of pairs) {
    if (target !== commit) continue;
    const named = stagedRef(ref);
    if (!named || named.scope !== lane.scope || named.inc !== lane.inc || named.commit !== commit || !roots.some((r) => r.number === named.root && r.commit === commit)) return ref;
  }
  return null;
}

/** A Git object as it was read by its ID: its type and its bytes. The reader has checked the bytes against the ID. */
export interface GitObject { type: string; body: Uint8Array }

/** Why a walk gave no record: an ID, an object or a snapshot that is not what it must be. `object` is the ID in question. */
export type Unreadable = "bad-object-id" | "mixed-hash" | "missing-object" | "not-a-commit" | "malformed-commit" | "bad-snapshot" | "no-live-root";

export type Walked =
  | { result: "recorded"; record: AncestryCheck }
  | { result: "too-large"; bound: "visited" | "stops" | "F" | "reads" }   // a bound was passed: no judgment (section 16.4, "Completeness")
  | { result: "unreadable"; reason: Unreadable; object: string | null };  // nothing rests on it: it is read again as a new attempt

/**
 * The parents of a commit, from its bytes. The header is read strictly, and
 * nothing of the message is read: the first line is `tree` with a full
 * object ID; each `parent` line follows directly, with a full object ID of
 * the walk's length; then one `author` line and one `committer` line. A
 * `tree` or a `parent` line anywhere else is refused, so no header is read
 * twice. Null: the commit is malformed.
 */
export function commitParents(body: Uint8Array, length: 40 | 64): readonly string[] | null {
  // The header is ASCII. Each byte is read as one character, so no decoding can change what a line holds.
  let end = -1;
  for (let i = 0; i + 1 < body.length; i++) if (body[i] === 10 && body[i + 1] === 10) { end = i; break; }
  if (end < 0) return null;
  const lines = Array.from(body.subarray(0, end), (byte) => String.fromCharCode(byte)).join("").split("\n");
  const id = (line: string | undefined, name: string): string | null => (line?.startsWith(`${name} `) && objectIdLength(line.slice(name.length + 1)) === length ? line.slice(name.length + 1) : null);
  if (id(lines[0], "tree") === null) return null;
  const parents: string[] = [];
  let at = 1;
  for (; lines[at]?.startsWith("parent "); at++) {
    const parent = id(lines[at], "parent");
    if (parent === null) return null;
    parents.push(parent);
  }
  if (!lines[at]?.startsWith("author ") || !lines[at + 1]?.startsWith("committer ")) return null;
  // What follows the committer is another header or a continuation line. None of them may be a header that was already read.
  return lines.slice(at + 2).some((line) => /^(?:tree|parent|author|committer) /.test(line)) ? null : parents;
}

export interface WalkInput {
  commit: string;                                  // the start: the commit that the act names
  head: string;                                    // the destination branch's head, as read for this check
  snapshot: readonly StagedRef[];                  // the staged refs, as the host returned them then
  lane: Pick<ScopeRef, "scope" | "inc">;           // the staging lane
  root: number;                                    // the lane's `live` root for the commit, which the act relies on
  roots: readonly OwnRoot[];                       // the lane's roots under the source commitment
  checks: readonly PriorCheck[];                   // the prior checks under the source commitment, each an earlier entry
  inputs: readonly { commit: string; input: FactRef }[];   // in an issue lane: the `selected` inputs of the source commitment, each with its report's commit
  read(id: string): GitObject | null;              // one object of the canonical repository, by its ID
  bounds: WalkBounds;
}

/** Thrown inside the walk to end it with no record. Its field is written out, because this package also runs where types are only stripped. */
class Stop extends Error {
  readonly walked: Exclude<Walked, { result: "recorded" }>;
  constructor(walked: Exclude<Walked, { result: "recorded" }>) {
    super(walked.result);
    this.walked = walked;
  }
}

/**
 * The walk (section 6.2). The start is never a stop. Every parent of the
 * start is visited, and the walk goes on through parents, breadth first, in
 * the order of the parent lines. It stops at three kinds of commit, tried in
 * this order:
 *
 * 1. the branch: a commit that is reachable from the head as read;
 * 2. a checked own root: a commit with a prior check under the source
 *    commitment. The commits of that check's F are carried through the
 *    stop, less those reachable from the head;
 * 3. a selected report: the commit of a report that a `selected` input of
 *    the source commitment names.
 *
 * Of the other commits it visits, each one that is the target of a staged
 * ref goes into F, with the first ref of the snapshot that targets it, and
 * the walk does not go past it. A root is no stop because the lane's
 * records hold it or because it is `live`: only a prior check makes one.
 *
 * Then the start: the staged refs on it are sorted, each by itself. With a
 * foreign ref, a start that is reachable from the head is published and
 * needs no basis. Otherwise one basis answers, tried in this order:
 * `own-check`, `input`, `row`. On the basis `row` the start is in F.
 */
export function walk(input: WalkInput): Walked {
  try {
    return { result: "recorded", record: walked(input) };
  } catch (error) {
    if (error instanceof Stop) return error.walked;
    throw error;
  }
}

function walked({ commit, head, lane, root, roots, checks, inputs, read, bounds, ...given }: WalkInput): AncestryCheck {
  const unreadable = (reason: Unreadable, object: string | null = null): never => { throw new Stop({ result: "unreadable", reason, object }); };
  const tooLarge = (bound: "visited" | "stops" | "F" | "reads"): never => { throw new Stop({ result: "too-large", bound }); };
  const length = objectIdLength(commit) ?? unreadable("bad-object-id", String(commit));
  const snapshot = snapshotOf(given.snapshot) ?? unreadable("bad-snapshot");
  if (!roots.some((r) => r.number === root && r.commit === commit && r.state === "live")) unreadable("no-live-root");

  // Every object that the walk uses is read here, once: its ID is checked first, then its type, then its header.
  const known = new Map<string, readonly string[]>();
  const parentsOf = (id: string): readonly string[] => {
    const had = known.get(id);
    if (had) return had;
    const size = objectIdLength(id) ?? unreadable("bad-object-id", String(id));
    if (size !== length) unreadable("mixed-hash", id);
    if (bounds.reads !== undefined && known.size >= bounds.reads) tooLarge("reads");
    const object = read(id) ?? unreadable("missing-object", id);
    if (object.type !== "commit") unreadable("not-a-commit", id);
    const parents = commitParents(object.body, length) ?? unreadable("malformed-commit", id);
    known.set(id, parents);
    return parents;
  };

  // The branch: the commits reachable from the head as read. The set is grown only as far as a question needs.
  const branch = new Set<string>();
  const frontier = [head];
  const published = (id: string): boolean => {
    while (!branch.has(id) && frontier.length > 0) {
      const next = frontier.shift()!;
      if (branch.has(next)) continue;
      branch.add(next);
      frontier.push(...parentsOf(next));
    }
    return branch.has(id);
  };
  /** The latest prior check of a commit: the one whose entry is last in the lane's history. */
  const priorOf = (id: string, clean = false): PriorCheck | null => checks.filter((c) => c.commit === id && (!clean || c.foreign === null)).sort((a, b) => b.checked.seq - a.checked.seq)[0] ?? null;

  const stops: AncestryCheck["stops"][number][] = [];
  const found: AncestryCheck["F"][number][] = [];
  const visited = new Set<string>();
  const queue = [...parentsOf(commit)];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (visited.has(at)) continue;
    visited.add(at);
    if (visited.size > bounds.visited) tooLarge("visited");
    parentsOf(at);                                      // a visited commit is read, and is a commit
    if (published(at)) continue;                        // the branch is tried first, and nothing is carried through it
    const prior = priorOf(at);
    const own = prior ? roots.find((r) => r.number === prior.root && r.commit === at) : undefined;
    if (prior && own && (own.state === "live" || own.state === "retiring" || own.state === "retired")) {
      stops.push({ kind: "own-root", commit: at, root: own.number, state: own.state, checked: prior.checked });
      // A stop at a checked own root does not hide what lay under it: what was named for the earlier act must be named again.
      for (const carried of prior.F) if (!published(carried) && !found.some((f) => "via" in f && f.commit === carried && f.via === at)) found.push({ commit: carried, via: at });
    } else {
      const selected = inputs.find((i) => i.commit === at);
      const staged = snapshot.pairs.find((p) => p.target === at);
      if (selected) stops.push({ kind: "selected-report", commit: at, input: selected.input });
      else if (staged) found.push({ commit: at, ref: staged.ref });
      else queue.push(...parentsOf(at));
    }
    if (stops.length > bounds.stops) tooLarge("stops");
    if (found.length > bounds.F) tooLarge("F");
  }

  const foreign = foreignOn(snapshot.pairs, commit, lane, roots);
  let start: AncestryCheck["start"] = { foreign: null };
  if (foreign !== null && published(commit)) start = { foreign, published: true };
  else if (foreign !== null) {
    const earlier = priorOf(commit, true);
    const selected = inputs.find((i) => i.commit === commit);
    start = { foreign, basis: earlier ? { kind: "own-check", checked: earlier.checked } : selected ? { kind: "input", input: selected.input } : { kind: "row" } };
    if (!earlier && !selected) found.unshift({ commit, ref: foreign, start: true });
    if (found.length > bounds.F) tooLarge("F");
  }
  return { commit, root: { number: root, state: "live" }, head, snapshot: { digest: snapshot.digest, count: snapshot.count }, start, stops, F: found, visited: visited.size };
}

/** True when a value has the members of an ancestry record, each of its type. It says nothing of whether the record is right. */
export function isAncestryCheck(v: unknown): v is AncestryCheck {
  const id = (x: unknown): boolean => objectIdLength(x) !== null;
  if (!isRecord(v) || !id(v["commit"]) || !id(v["head"]) || !isLocalId(v["visited"])) return false;
  const { root, snapshot, start, stops, F } = v;
  if (!isRecord(root) || !isLocalId(root["number"]) || root["state"] !== "live" || !isRecord(snapshot) || !isDigest(snapshot["digest"]) || !isLocalId(snapshot["count"])) return false;
  if (!isRecord(start) || !Array.isArray(stops) || !Array.isArray(F)) return false;
  const basis = start["basis"];
  const started = start["foreign"] === null ? Object.keys(start).length === 1
    : typeof start["foreign"] === "string" && (start["published"] === true ? Object.keys(start).length === 2
      : isRecord(basis) && Object.keys(start).length === 2 && (basis["kind"] === "row" || (basis["kind"] === "own-check" && isFactRef(basis["checked"])) || (basis["kind"] === "input" && isFactRef(basis["input"]))));
  return started
    && stops.every((s) => isRecord(s) && id(s["commit"]) && (s["kind"] === "selected-report" ? isFactRef(s["input"]) : s["kind"] === "own-root" && isLocalId(s["root"]) && ["live", "retiring", "retired"].includes(s["state"] as string) && isFactRef(s["checked"])))
    && F.every((f) => isRecord(f) && id(f["commit"]) && ("via" in f ? id(f["via"]) && Object.keys(f).length === 2 : typeof f["ref"] === "string" && (f["start"] === undefined || f["start"] === true)));
}
