/**
 * `artroom verify`: offline verification of the published log (R-LOG-10).
 *
 * It reads every commit on `refs/artroom/log`, oldest first, and checks:
 * - each commit: one parent, the previous log commit; its checkpoint is
 *   signed by the room key and names the last entry it publishes; full
 *   segments and every earlier entry are byte-identical to earlier commits;
 * - each entry: seq, prev, hash, entry ID, room signature; the genesis and
 *   its admin signature; each act's envelope signature, room and recorded
 *   authority, judged by replaying the roster from earlier entries
 *   (R-ADM-3, R-REV); idempotency; `notified`, `check-carried` and
 *   `checkpoint` events; no self-reference (R-LOG-12);
 * - each recorded policy decision: it replays, with its retained context and
 *   the policy version it names, to the same decision (R-EVAL-6). The version
 *   must be the one in force when the act was admitted; for a `notified`
 *   event, when the act it names was admitted; for a `check-carried` event,
 *   the version the event names (R-CARRY-13).
 *
 * Declared acts (R-DECL-25, stage 3). Each act and recorded refusal is
 * judged under `D(s)`, the document in force at its seq: under a `v1`
 * document by the legacy vocabulary `artroom-legacy-v1`, exactly as before;
 * under a `v2` document by its declarations and the steps version it names
 * (declared.ts): kind (`kind-undeclared`), binding (`binding-stale`), body
 * and target (`body-invalid`) and who may sign. For entries judged under a
 * `v2` document verify derives the evaluation calls the room had to make and
 * rebuilds their inputs from the fold (calls.ts, fold.ts, obligations.ts):
 * `decision-missing`, `decision-extra`, `context-mismatch`. The fold keeps
 * each version's obligations, evidence and carried verdicts through `v1`
 * intervals too, by making the same calls without comparing them. A document
 * naming a steps version or evaluator profile this verifier does not carry
 * stops verification at the first entry that needs it (`steps-unsupported`,
 * `profile-unsupported`): a limit of the verifier, reported, not a failure.
 *
 * Untrusted content is decoded at one boundary (`decode.ts`) before any field
 * is read. Malformed content is a named failure, `malformed`, and the
 * verified prefix ends before it. Only reading the repository can throw.
 *
 * It proves the integrity of the published prefix. It cannot prove whether
 * acts after the last checkpoint exist.
 */

import type {
  ActId,
  CheckBody,
  KeyId,
  Checkpoint,
  LogLayout,
  Decision,
  Digest,
  Genesis,
  LogEntry,
  PolicyDocument,
  PolicyVersion,
  ReplayContext,
  RoomId,
  Seq,
  Sha,
  SystemEvent,
} from "@generalbusiness/artroom-contract";
import type {
  AnyPolicyDocument,
  Authority,
  Carried,
  CheckerConfig,
  DeclaredVerifyFailure,
  Envelope,
  Flag,
  LaneId,
  ObligationId,
  PathChange,
  RepoPath,
  ReviewBody,
  Step,
  Verdict,
  VerifyProofLimit,
  VerifyUnsupported,
} from "@generalbusiness/artroom-contract";
import { STEPS_VERSIONS, checkerInputs, replay, validatePolicyV2, type InputOf } from "@generalbusiness/artroom-policy";
import { canonicalize } from "./canonical.ts";
import { digestJson, sha256Hex, verifySig } from "./crypto.ts";
import { LOG_REF, ROOT, contentOf, entryId, roomIdOf } from "./entries.ts";
import { parseCommit, type GitReader } from "./git.ts";
import { Unsupported, decodeCheckpoint, decodeEntry, decodeRetained, textOf } from "./decode.ts";
import { CHUNK_MISMATCH, commitLines, readLogCommit } from "./tree.ts";
import { OBJECT_BOUND } from "./layout.ts";
import { checkedTime } from "./time.ts";
import { RosterReplay, type AuthorityFailure } from "./roster.ts";
import { CARRIED_STEPS, LEGACY, bodyProblem, kindProblem, stepsOf, vocabularyOf, whoOf, type StepsSemantics, type Vocabulary } from "./declared.ts";
import { Fold, carryKey, changedPaths, gitChanges, missingChanges, treeOf, type EvidenceRow, type Made as VersionMade, type Thread, type Version, type Witness } from "./fold.ts";
import { CallSession, actorOf, landInput, memberActor, refuseInput, requireInput, stoppedAt, type CallFailure, type World } from "./calls.ts";
import {
  carryCandidates,
  checkEvidence,
  invalidity,
  landEvidence,
  patchLand,
  reviewersOf,
  revokedFact,
  specsOf,
  verdictEvidence,
  withAdvisory,
  type Judging,
} from "./obligations.ts";

export type VerifyReason =
  // the ref and its commits
  | "no-log"
  | "commit-shape"
  | "history-rewritten"
  | "segment-changed"
  | "checkpoint-missing"
  | "checkpoint-signature"
  | "checkpoint-mismatch"
  | "checkpoint-not-advancing"
  | "genesis-mismatch"
  | "retained-digest"
  | "malformed"
  // layout 2 (contract amendment 4, section 30.6)
  | "layout-changed"
  | "segment-bound"
  | "chunk-mismatch"
  | "object-too-large"
  | "fan-out"
  // entries
  | "seq-gap"
  | "entry-order"
  | "prev-mismatch"
  | "hash-mismatch"
  | "room-signature"
  | "genesis-invalid"
  | "genesis-signature"
  | "wrong-room"
  | "actor-signature"
  | AuthorityFailure
  | "authority-mismatch"
  | "flag-missing"
  | "idempotency-duplicate"
  | "self-reference"
  | "notified-unknown"
  | "notified-twice"
  | "carried-unknown"
  | "carried-mismatch"
  | "carried-outcome-mismatch"
  | "checkpoint-event-mismatch"
  | "policy-missing"
  | "checker-missing"
  | "check-config-mismatch"
  | "onboarding-invalid"
  // policy decisions
  | "input-missing"
  | "policy-version-mismatch"
  | "stamp-mismatch"
  | "policy-decision-mismatch"
  // declared acts (R-DECL-25)
  | DeclaredVerifyFailure;

export interface VerifyFailure {
  readonly reason: VerifyReason;
  /** The entry, when an entry failed. */
  readonly seq?: Seq;
  /** The log commit, when a commit failed. */
  readonly commit?: Sha;
  readonly detail: string;
}

export interface VerifyReport {
  readonly ok: boolean;
  readonly ref: string;
  readonly head: Sha | null;
  readonly room: RoomId | null;
  /**
   * For a room founded on an imported repository, the operator key that
   * signed its onboarding grant (R-GEN-12); null otherwise. Verify checks the
   * signature; whether to trust the key is the reader's decision.
   */
  readonly operator: KeyId | null;
  readonly commits: number;
  /** The last entry of the verified prefix; -1 when nothing could be verified. */
  readonly verifiedThrough: Seq;
  readonly last: { readonly id: ActId; readonly hash: Digest } | null;
  /** The head commit's checkpoint `through`: what the room has published. */
  readonly publishedThrough: Seq;
  readonly decisionsReplayed: number;
  readonly failures: readonly VerifyFailure[];
  /**
   * Set when a document names a steps version or evaluator profile this
   * verifier does not carry (R-DECL-14, R-DECL-22): verification stopped at
   * `seq`, and `verifiedThrough` is the entry before it. A limit of this
   * verifier, not a finding against the log; `ok` is false, because the log
   * was not verified to its end.
   */
  readonly unsupported: { readonly reason: VerifyUnsupported; readonly seq: Seq; readonly detail: string } | null;
  /** Proof limits met at named entries (R-DECL-25): reported, not failures. */
  readonly limits: readonly { readonly reason: VerifyProofLimit; readonly seq: Seq; readonly detail: string }[];
  /** Plain statements of what this verification cannot prove. */
  readonly cannotProve: readonly string[];
  /**
   * How far this report accounts for check carry judgments (R-CARRY-13).
   * `partial`: recorded judgments are replayed, and three omissions are
   * detected (a duplicate, a newer check skipped on the way to a carry, a
   * land evaluation with a blocking obligation open); the judgments the
   * room owed are not derived as a whole. `cannotProve` says what that
   * leaves out. No log yet records carry passes, so a full run answers
   * `partial` for every log. `none`: the run did not replay decisions
   * (`mode` is `integrity`), so no carry judgement was checked at all.
   */
  readonly carryAccounting: "partial" | "none";
  /**
   * What this run checked. `full`: everything this verifier checks.
   * `integrity`: the caller turned replay off (`replayDecisions: false`,
   * `--no-replay`). No policy was evaluated: no decision was replayed, no
   * required call derived, no input rebuilt, and no carry judgement or land
   * input checked. The checks that need no policy evaluation still ran:
   * decoding, hashes, seals, order, publication history, each act's
   * authority, and the guard that refuses a land evaluation while the
   * admin-approval obligation is open, for which Git objects are read where
   * present. `cannotProve` says what that guard does and does not show. A
   * log that passes in this mode may fail in `full`.
   */
  readonly mode: "full" | "integrity";
}

const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);

interface CommitView {
  readonly sha: Sha;
  readonly files: Map<string, Uint8Array>;
  readonly lines: string[];
  readonly checkpoint: Checkpoint | null;
  readonly layout: LogLayout | undefined;
  /** Each segment's first seq and logical path, in order. */
  readonly segments: readonly { readonly first: Seq; readonly path: string }[];
}

export interface VerifyOptions {
  readonly ref?: string;
  /** Replay recorded policy decisions with the policy package. Default true. */
  readonly replayDecisions?: boolean;
  /**
   * The steps versions this verifier carries, by name (R-DECL-14). Default:
   * this platform's (`CARRIED_STEPS`). A platform release adds a version; a
   * test may register one to show a log judged across two.
   */
  readonly steps?: Readonly<Record<string, StepsSemantics>>;
  /** The evaluator profiles this verifier carries (R-DECL-22). Default: `artroom-jsonata-v1`. */
  readonly profiles?: readonly string[];
}

/**
 * Why a `check-carried` event's outcome disagrees with its decisions, or
 * null (R-CARRY-13). Verify replays the decisions first, so these are the
 * replayed decisions. Every decision that names evidence names the event's
 * `act`. `carried` needs every decision to allow the carry; it may have
 * none, when only platform conditions applied. `notCarried` needs a
 * decision that does not allow it, or none, and names the same `act`.
 */
function carryOutcomeProblem(ev: Extract<SystemEvent, { readonly type: "check-carried" }>): string | null {
  const stray = ev.decisions.find((d) => "evidence" in d.outcome && d.outcome.evidence !== ev.act);
  if (stray) return `decision ${stray.rule} names evidence ${String((stray.outcome as { evidence: unknown }).evidence)}`;
  if (ev.outcome.carried) {
    const refusing = ev.decisions.find((d) => d.outcome.result !== "carry");
    return refusing ? `the outcome is carried, but ${refusing.rule} decided ${String(refusing.outcome.result)}` : null;
  }
  if (ev.decisions.length > 0 && ev.decisions.every((d) => d.outcome.result === "carry")) return "the outcome is not carried, but every carry rule decision allows it";
  if (ev.outcome.notCarried.act !== ev.act) return `notCarried names ${ev.outcome.notCarried.act}`;
  return null;
}

export async function verifyLog(reader: GitReader, opts: VerifyOptions = {}): Promise<VerifyReport> {
  const ref = opts.ref ?? LOG_REF;
  const failures: VerifyFailure[] = [];
  const fail = (f: VerifyFailure) => failures.push(f);
  const head = await reader.readRef(ref);
  // What the report says it checked must be what this run checked: with replay off, the statements that describe
  // replay are replaced by one that says it was not done.
  const replaying = opts.replayDecisions !== false;
  const cannotProve = [
    "Whether any act was admitted after the last published entry: unpublished acts cannot be proven to exist or not to exist.",
    replaying
      ? "Lanes, leases, obligations and landings (R-LOG-15): verify checks each act's authority and replays every policy decision, but does not re-derive lane, lease, obligation or landing transitions, or the effects in receipts."
      : "Lanes, leases, obligations and landings (R-LOG-15): this run checked each act's authority. It does not re-derive lane, lease, obligation or landing transitions, or the effects in receipts.",
    "The room clock: expiry checks use each entry's recorded `at`, which only the room key vouches for.",
    "Refusals that are never recorded (R-ADM-8): kind-undeclared, binding-stale and the other refusals of admission steps 1 to 6 leave no entry, so verify can neither see nor prove them.",
    ...(replaying
      ? [
          "Under a v1 document, entries are judged by the legacy vocabulary as before declared acts: the decisions present are replayed, but the calls the room had to make are not derived (R-DECL-1).",
          "Under a v2 document, the required evaluation calls are derived and their inputs rebuilt from the thread, roster, obligation and evidence fold, which takes receipt effects as recorded: lane, lease and landing transitions, the obligations effects, and the platform guards behind a recorded refusal are not re-derived (stage 6).",
          "A version's changed paths are checked against Git objects, from the base its context names to its head, when the objects are present; without them they are the retained context's, reported as git-unwitnessed. That the base is the merge base of main and the head needs main's history, which the log does not carry.",
          "The paths changed since an earlier verdict's head, which decide whether it carries, are read from Git objects. Without them they are the retained carry context's, where one is recorded; where none is, whether the verdict carried is undecided, and so is each land input that depends on it. Each is reported as git-unwitnessed.",
          "Whether the room prepared a check's integration, for a version or landing with no prepared event: rooms seal prepared events from stage 4 (R-DECL-20); verify checks a check against them where they are present. Until then a check on a filtered snapshot does not name the integration it counts for, and a check carry's new tree and snapshot are not in the log: verify takes them from the retained context and reports git-unwitnessed.",
          "Carry judgements are accounted for in part (R-CARRY-13). Verify replays each check-carried judgement that is recorded, and a carry that is not recorded meets no obligation. It detects a second judgement of the same check, a carry that skipped a newer passing check, and a land evaluation made while a blocking obligation was open. It does not derive the whole list of judgements the room owed. So it cannot show that a judgement which did not carry is missing when no later judgement carried; that a whole carry pass is missing, as for an advisory obligation; that the recorded judgements are all of them, in the room's order, with the inputs and the evaluation budget the room used; or that an extra judgement belongs to no pass. The log does not record when the room started or ended a pass, waited, was cancelled, prepared a landing again, or skipped carrying for a recovery landing.",
        ]
      : [
          "Policy was not replayed in this run, because the caller turned replay off. No policy decision was evaluated again. The calls the room had to make, their inputs and their evaluation budget were not checked. No carry judgement was replayed or accounted for, and no land input was rebuilt. A log with a wrong decision, a missing or extra call, a substituted context, or a second judgement of one check passes this run. Run without --no-replay to make those checks.",
          "Checks that need no policy evaluation still ran in this run, and a log can fail them. Besides decoding, hashes, seals, order, publication history and each act's authority, one guard on landings ran: under a v2 document, a land evaluation is refused while the admin-approval obligation is open on its integration. That obligation is derived from the policy document and the version's changed paths, which this run read from Git objects where they were present and otherwise took from the retained context. The guard reads approvals as the log records them. It is not a replay of the land input. Obligations that rules open are known only by replay, so this run did not see them: a land evaluation recorded with one of those open passes this run. This run compared no recorded context with Git objects, so it claims no Git witness.",
        ]),
    "What a verified prefix means: every check this run makes passed for the entries it names. It does not mean that every duty of the room was done, that publication is complete, or that each transition of the room's state was derived again.",
  ];
  const empty = (extra: Partial<VerifyReport> = {}): VerifyReport => ({
    ok: false,
    ref,
    head,
    room: null,
    operator: null,
    commits: 0,
    verifiedThrough: -1,
    last: null,
    publishedThrough: -1,
    decisionsReplayed: 0,
    failures,
    unsupported: null,
    limits: [],
    cannotProve,
    carryAccounting: replaying ? "partial" : "none",
    mode: replaying ? "full" : "integrity",
    ...extra,
  });
  if (!head) {
    fail({ reason: "no-log", detail: `${ref} does not exist` });
    return empty();
  }

  // ---------------------------------------------------------- the commits
  const chain: Sha[] = [];
  for (let at: Sha | undefined = head; at; ) {
    const c = await reader.readObject(at);
    const fields = parseCommit(c.data);
    if (fields.parents.length > 1) fail({ reason: "commit-shape", commit: at, detail: "a log commit has more than one parent" });
    chain.push(at);
    at = fields.parents[0];
  }
  chain.reverse();

  // Each commit is read in the layout its checkpoint names (R-LOG-16): in layout 2, shard
  // directories are followed and chunked files reassembled, and their shape is checked (30.6).
  const views: CommitView[] = [];
  for (const sha of chain) {
    const { files, layout, problems } = await readLogCommit(reader, sha);
    for (const p of problems) fail({ reason: p.reason, commit: sha, detail: p.detail });
    const read = commitLines(files, layout);
    for (const p of read.problems) fail({ reason: p.reason, commit: sha, ...(p.seq !== undefined ? { seq: p.seq } : {}), detail: p.detail });
    const cpBytes = files.get(`${ROOT}/checkpoint.json`);
    let checkpoint: Checkpoint | null = null;
    try {
      checkpoint = cpBytes ? decodeCheckpoint(cpBytes) : null;
    } catch (e) {
      fail({ reason: "malformed", commit: sha, detail: (e as Error).message });
    }
    if (!checkpoint && !cpBytes) fail({ reason: "checkpoint-missing", commit: sha, detail: "the commit has no checkpoint.json" });
    views.push({ sha, files, lines: read.lines, checkpoint, layout, segments: read.segments });
  }
  // The layout (R-LOG-16): a log's first layout 2 commit has `from` one past its parent's `through`
  // (0 with no parent); every later commit is layout 2 with the same `from`.
  const layoutProblem = (v: CommitView, prev: CommitView | undefined): string | null => {
    if (prev?.layout) return v.layout?.from === prev.layout.from ? null : `the commit is ${v.layout ? `layout 2 from ${v.layout.from}` : "layout 1"} after a layout 2 commit from ${prev.layout.from}`;
    if (!v.layout) return null;
    const from = prev ? (prev.checkpoint?.through ?? -1) + 1 : 0;
    return v.layout.from === from ? null : `the first layout 2 commit has from ${v.layout.from}, not ${from}`;
  };
  if (views[0] && layoutProblem(views[0], undefined)) fail({ reason: "layout-changed", commit: views[0].sha, detail: layoutProblem(views[0], undefined)! });

  // Each commit extends the previous one: earlier lines and closed segments unchanged (R-LOG-9, 30.6).
  // The entries verified are those of the last commit before the first break.
  let basis = 0;
  for (let i = 1; i < views.length; i++) {
    const v = views[i]!;
    const prev = views[i - 1]!;
    let ok = true;
    const changed = layoutProblem(v, prev);
    if (changed) {
      fail({ reason: "layout-changed", commit: v.sha, detail: changed });
      ok = false;
    }
    for (let n = 0; n < prev.lines.length; n++)
      if (v.lines[n] !== prev.lines[n]) {
        fail({ reason: "history-rewritten", commit: v.sha, seq: n, detail: `entry ${n} differs from the earlier log commit ${prev.sha}` });
        ok = false;
        break;
      }
    for (const [k, s] of prev.segments.entries()) {
      const a = prev.files.get(s.path)!;
      const b = v.files.get(s.path);
      // Every segment but the last never changes; the last stays where it starts, and only grows.
      const last = k === prev.segments.length - 1;
      if (!b || (!last && (a.length !== b.length || a.some((x, j) => x !== b[j]))) || !v.segments.some((x) => x.first === s.first)) {
        fail({ reason: "segment-changed", commit: v.sha, detail: `${last ? "the last" : "closed"} segment ${s.first} changed after ${prev.sha}` });
        ok = false;
      }
    }
    if (v.checkpoint && prev.checkpoint && v.checkpoint.through <= prev.checkpoint.through) {
      fail({ reason: "checkpoint-not-advancing", commit: v.sha, detail: `through ${v.checkpoint.through} after ${prev.checkpoint.through}` });
      ok = false;
    }
    if (!ok) break;
    basis = i;
  }

  // Decode the entries at the boundary: verification covers the prefix before the first malformed line.
  const top = views[basis]!;
  const entries: LogEntry[] = [];
  let firstBad = Number.POSITIVE_INFINITY;
  for (const [i, line] of top.lines.entries()) {
    if (line.startsWith(CHUNK_MISMATCH)) {
      firstBad = i; // already reported as chunk-mismatch
      break;
    }
    try {
      entries.push(decodeEntry(line));
    } catch (e) {
      fail({ reason: "malformed", seq: i, commit: top.sha, detail: `entry ${i}: ${(e as Error).message}` });
      firstBad = i;
      break;
    }
  }

  // --------------------------------------------------------- genesis first
  const g0 = entries[0];
  if (!g0 || g0.entry.type !== "system" || g0.entry.event.type !== "genesis" || g0.seq !== 0 || g0.prev !== null) {
    if (firstBad !== 0) fail({ reason: "genesis-invalid", seq: 0, detail: "entry 0 is not a genesis system entry with prev null" });
    return empty({ commits: views.length });
  }
  const genesis: Genesis = g0.entry.event.genesis;
  const room = roomIdOf(genesis);
  const roomKey = genesis.roomKey;

  for (const v of views.slice(0, basis + 1)) {
    const gj = v.files.get(`${ROOT}/genesis.json`);
    if (!gj || textOf(gj) !== canonicalize(genesis)) fail({ reason: "genesis-mismatch", commit: v.sha, detail: "genesis.json is not entry 0's genesis" });
    const cp = v.checkpoint;
    if (!cp) continue;
    const { sig, ...unsigned } = cp;
    if (cp.room !== room || cp.roomKey !== roomKey || !verifySig(roomKey, sig, "artroom-checkpoint-v1", unsigned))
      fail({ reason: "checkpoint-signature", commit: v.sha, detail: "the checkpoint is not signed by this room's key" });
    const lastLine = v.lines.at(-1);
    let last: LogEntry | null = null;
    try {
      last = lastLine ? decodeEntry(lastLine) : null;
    } catch {
      last = null;
    }
    if (!last || last.seq !== cp.through || last.hash !== cp.hash || v.lines.length !== cp.through + 1)
      fail({ reason: "checkpoint-mismatch", commit: v.sha, detail: `the checkpoint names ${cp.through} but the segments end at ${last?.seq ?? "nothing"}` });
  }

  // Retained files are named by their digest (R-LOG-7), and decoded at the boundary.
  // Every inspected commit is checked, not only the one whose entries are verified:
  // each file's digest, and its decoding, in each commit that publishes it.
  // The same bytes have a different contract in each place: a replay context under
  // inputs/; a policy document or a checker configuration under policies/, as the
  // policy-activated event that names it says. So a decoding, good or bad, is reused
  // only for the same contract and digest, never across contracts.
  const RETAINED = /^artroom-log\/v1\/(inputs|policies)\/([0-9a-f]{64})\.json$/;
  const inputPath = (digest: Digest) => `${ROOT}/inputs/${digest.slice(7)}.json`;
  const policyPath = (digest: Digest) => `${ROOT}/policies/${digest.slice(7)}.json`;
  /** Whether commit `v` publishes the retained file at `path` with the content its name gives. */
  const holds = (v: CommitView, path: string): boolean => {
    const bytes = v.files.get(path);
    return bytes !== undefined && sha256Hex(bytes) === RETAINED.exec(path)?.[2];
  };
  type Contract = "input" | "json" | "policy" | "checker";
  type Decoded = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly detail: string; readonly unsupported?: VerifyUnsupported };
  const stepsCarried = opts.steps ?? CARRIED_STEPS;
  const carried = { steps: Object.keys(stepsCarried), profiles: opts.profiles ?? ["artroom-jsonata-v1"] };
  const decodings = new Map<`${Contract} ${Digest}`, Decoded>();
  /** `bytes`, named by `digest`, decoded under `contract`; once per contract and digest. */
  const decodeAs = (contract: Contract, digest: Digest, bytes: Uint8Array): Decoded => {
    const key = `${contract} ${digest}` as const;
    let d = decodings.get(key);
    if (!d) {
      try {
        d = { ok: true, value: contract === "input" ? decodeRetained("input", bytes) : contract === "json" ? decodeRetained("json", bytes) : contract === "policy" ? decodeRetained("policy", bytes, carried) : decodeRetained("checker", bytes) };
      } catch (e) {
        d = { ok: false, detail: (e as Error).message, ...(e instanceof Unsupported ? { unsupported: e.reason } : {}) };
      }
      decodings.set(key, d);
    }
    return d;
  };
  /** Retained files that do not decode under their directory's contract, by path. */
  const malformed = new Map<string, string>();
  for (const v of views)
    for (const [path, bytes] of v.files) {
      const m = RETAINED.exec(path);
      if (!m) continue;
      if (!holds(v, path)) {
        // A file over B in layout 2 was reassembled from chunks (R-LOG-18): a changed chunk is chunk-mismatch.
        const chunked = v.layout !== undefined && bytes.length > OBJECT_BOUND;
        fail({ reason: chunked ? "chunk-mismatch" : "retained-digest", commit: v.sha, detail: `${path}${chunked ? ", reassembled from its chunks," : ""} does not match its digest` });
        continue;
      }
      const d = decodeAs(m[1] === "inputs" ? "input" : "json", `sha256:${m[2]}`, bytes);
      if (!d.ok) malformed.set(path, d.detail);
    }
  /**
   * The retained files each verified entry needed. Each earlier commit must
   * publish those its own entries need, so that every published prefix is
   * replayable on its own (R-LOG-9).
   */
  const needs: { seq: Seq; path: string; reason: "input-missing" | "policy-missing" | "checker-missing" }[] = [];
  /**
   * The retained file an entry needs, from the latest consistent commit only,
   * decoded under `contract`; or the failure: missing or malformed.
   */
  const lookup = (contract: "input" | "policy" | "checker", digest: Digest, missing: "input-missing" | "policy-missing" | "checker-missing"):
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly reason: VerifyReason | VerifyUnsupported; readonly detail: string } => {
    const path = contract === "input" ? inputPath(digest) : policyPath(digest);
    const what = contract === "input" ? "the replay context" : contract === "policy" ? "policy" : "checker configuration";
    if (!holds(top, path)) return { ok: false, reason: missing, detail: `${what} ${digest} is not published` };
    const d = decodeAs(contract, digest, top.files.get(path)!);
    return d.ok ? d : { ok: false, reason: d.unsupported ?? "malformed", detail: `${path}: ${d.detail}` };
  };

  // -------------------------------------------------------------- entries
  const roster = new RosterReplay(genesis);
  const fold = new Fold();
  let operator: KeyId | null = null;
  const idem = new Map<string, Seq>();
  /** The accepted acts that ran the step `check` under the vocabulary in force at their own seq (R-DECL-18): `check` itself under the legacy vocabulary. */
  const checkActs = new Set<Seq>();
  const notified = new Set<string>();
  type Lacking = { readonly unsupported: VerifyUnsupported; readonly detail: string };
  /**
   * Each activated version: its document, its checker configurations'
   * digests by checker name (R-POL-9), and the vocabulary it means
   * (R-DECL-1), or the version this verifier lacks (R-DECL-14, R-DECL-22).
   */
  const policyByVersion = new Map<
    PolicyVersion,
    { doc: AnyPolicyDocument | null; digest: Digest; checkers: ReadonlyMap<string, Digest>; configs: ReadonlyMap<string, CheckerConfig>; vocab: Vocabulary | Lacking }
  >();
  let activePolicy: PolicyVersion | null = null;
  /** The policy in force when each entry was admitted, by seq. */
  const policyAt: (PolicyVersion | null)[] = [];
  let decisionsReplayed = 0;
  let unsupported: VerifyReport["unsupported"] = null;
  const limits: { reason: VerifyProofLimit; seq: Seq; detail: string }[] = [];
  const checkpointsByCommit = new Map(views.slice(0, basis + 1).map((v) => [v.sha, v.checkpoint] as const));

  /** The vocabulary of a version: the legacy one before any activation (R-POL-7 as amended). */
  const vocabAt = (version: PolicyVersion | null): Vocabulary | Lacking => (version === null ? LEGACY : policyByVersion.get(version)!.vocab);
  const lacking = (v: Vocabulary | Lacking): v is Lacking => "unsupported" in v; // V:unsupported

  /**
   * Replay `decisions` under `version`, the one policy they must name. The
   * caller picks it per event kind:
   * - an act's or refusal's: the policy in force at its admission;
   * - a `notified` event's: the policy in force when the act it names was
   *   sealed, which the room pinned when it queued the notification, however
   *   many activations came after (R-LOG-13);
   * - an `obligations-recomputed` event's: the policy it names, which must be
   *   the active one (R-POL-9);
   * - a `check-carried` event's: the policy it names, which an earlier
   *   `policy-activated` event activated (R-CARRY-13);
   * - a `land-evaluated` event's: the active policy (R-LAND-4).
   */
  const replayDecisions = async (seq: Seq, decisions: readonly Decision[], version: PolicyVersion | null, why: string): Promise<boolean> => {
    if (opts.replayDecisions === false) return true;
    const groups = new Map<Digest, Decision[]>();
    for (const d of decisions) groups.set(d.input, [...(groups.get(d.input) ?? []), d]);
    for (const [digest, recorded] of groups) {
      for (const d of recorded) {
        if (d.stamp.profile !== genesis.profile.policy || d.stamp.jsonata !== genesis.profile.jsonata) {
          fail({ reason: "stamp-mismatch", seq, detail: `${d.rule}: stamp ${d.stamp.profile} ${d.stamp.jsonata} is not the genesis profile` });
          return false;
        }
        if (d.policy !== version) {
          fail({ reason: "policy-version-mismatch", seq, detail: `${d.rule} names policy ${d.policy}; ${why} is ${version ?? "none"}` });
          return false;
        }
      }
      const context = lookup("input", digest, "input-missing");
      if (!context.ok) {
        fail({ seq, reason: context.reason as VerifyReason, detail: context.detail });
        return false;
      }
      needs.push({ seq, path: inputPath(digest), reason: "input-missing" });
      const policy = policyByVersion.get(version!)!;
      let replayed: readonly Decision[];
      try {
        const result = await replay({ doc: policy.doc as PolicyDocument, version: version! }, context.value as ReplayContext);
        replayed = result.evaluations.map((e) => e.decision);
      } catch (e) {
        fail({ reason: "policy-decision-mismatch", seq, detail: `replay failed: ${(e as Error).message}` });
        return false;
      }
      if (!same(replayed, recorded)) {
        fail({ reason: "policy-decision-mismatch", seq, detail: `recorded ${canonicalize(recorded.map((d) => [d.rule, d.outcome]))}, replayed ${canonicalize(replayed.map((d) => [d.rule, d.outcome]))}` });
        return false;
      }
      decisionsReplayed += recorded.length;
    }
    return true;
  };

  /** The retained replay context for a digest, recording that entry `seq` needs it (R-LOG-9). */
  const retainedFor = (seq: Seq) => (digest: Digest) => {
    const c = lookup("input", digest, "input-missing");
    if (c.ok) needs.push({ seq, path: inputPath(digest), reason: "input-missing" });
    return c.ok ? c : { ok: false as const, reason: c.reason as "input-missing" | "malformed", detail: c.detail };
  };

  /** What judging obligations reads under `version` (obligations.ts). */
  const judgingAt = (version: PolicyVersion): Judging => {
    const p = policyByVersion.get(version)!;
    return { fold, roster, doc: p.doc as PolicyDocument, version, checkers: p.checkers };
  };

  /**
   * Open the call session of an entry judged under `version` (calls.ts).
   * Under a `v2` document its calls are compared with the entry's
   * decisions. Under a `v1` document they are only made, so the fold keeps
   * each version's obligations and carried verdicts (R-DECL-1).
   */
  const openSession = (seq: Seq, recorded: readonly Decision[], version: PolicyVersion, compare: boolean) => {
    const doc = policyByVersion.get(version)!.doc as PolicyDocument;
    return CallSession.open(recorded, {
      policy: { doc, version },
      retained: retainedFor(seq),
      // R-DECL-22: the stamp names the profile of the document in force, with the genesis's pinned jsonata.
      stampOk: (d) => d.stamp.profile === doc.profile && d.stamp.jsonata === genesis.profile.jsonata,
      compare,
    });
  };

  /** Report a proof limit once per entry and detail. */
  const reported = new Set<string>();
  const limit = (seq: Seq, detail: string) => {
    const k = `${seq}\u0000${detail}`;
    if (reported.has(k)) return;
    reported.add(k);
    limits.push({ reason: "git-unwitnessed", seq, detail });
  };

  /**
   * A version's witness (note 4.3): the base and changed paths of the first
   * retained context in `recorded` that carries a proposal, checked against
   * Git objects when they are present. Changes Git shows that the context
   * leaves out make the witness Git's, so that context fails as
   * `context-mismatch`. Without the objects the context's are taken, and the
   * entry is reported `git-unwitnessed`, unless `quiet` (a `v1` entry, which
   * reports as it did before declared acts).
   */
  const witnessOf = async (seq: Seq, recorded: readonly Decision[], head: Sha, quiet = false): Promise<Witness | null> => {
    let from: { base: Sha; changed: readonly PathChange[] } | null = null;
    for (const d of recorded) {
      const c = lookup("input", d.input, "input-missing");
      const p = c.ok ? (c.value as { input?: { proposal?: { base?: unknown; changed?: unknown } | null } }).input?.proposal : null;
      if (p && typeof p.base === "string" && Array.isArray(p.changed)) {
        from = { base: p.base as Sha, changed: p.changed as PathChange[] };
        break;
      }
    }
    if (!from) return null;
    const git = await gitChanges(reader, from.base, head);
    if (git === null) {
      if (!quiet) limit(seq, `the Git objects of ${from.base} and ${head} are not present, so the version's changed paths are the retained context's`);
      return from;
    }
    const missing = missingChanges(from.changed, git);
    return missing.length ? { base: from.base, changed: git } : from; // V:git-witness
  };

  /** Find a version's witness, from its own act's decisions or else from `recorded`, if it has none yet. */
  const resolve = async (seq: Seq, v: Version, recorded: readonly Decision[]): Promise<void> => {
    if (v.witness) return;
    const own = entries[Number(v.act.split("_")[1])];
    const first = own && own.entry.type === "act" ? own.entry.receipt.decisions : [];
    v.witness = (await witnessOf(seq, first, v.head)) ?? (await witnessOf(seq, recorded, v.head));
  };

  /**
   * The paths changed between two heads (the room's `changedBetween`), which
   * decide whether a verdict on the first carries to the second (R-CARRY-1
   * to 3); or null when the Git objects are absent.
   */
  const sinceOf = async (from: Sha, to: Sha): Promise<RepoPath[] | null> => {
    if (from === to) return [];
    const git = await gitChanges(reader, from, to);
    return git === null ? null : changedPaths(git);
  };

  /** The thread an act names, by its target (R-DECL-4): none for `none`, the anchored entry's for `entry`. */
  const threadOf = (env: Envelope): Thread | null | undefined => {
    const t = env.target as { lane?: unknown; act?: unknown } | null;
    if (t === null) return null;
    if (typeof t.lane === "string") return fold.thread(t.lane) ?? undefined;
    if (typeof t.act === "string") return fold.entryLane.has(t.act as ActId) ? fold.thread(fold.entryLane.get(t.act as ActId)) : undefined;
    return undefined;
  };

  type Failed = { readonly ok: false; readonly reason: VerifyReason; readonly detail: string };
  const failed = (f: CallFailure): Failed => ({ ok: false, reason: f.reason, detail: f.detail });
  const NOTHING_MADE: VersionMade = { policy: null, required: [], carried: [], maybe: [] };

  /**
   * The `carry` calls owed when a version is made from `previous`, or when
   * `previous` itself is recomputed (R-CARRY-1 to 5, R-POL-9): one for each
   * verdict in `owed`, in order, with the paths changed since its head. A
   * verdict that carries does so for each of its obligations that the new
   * obligations still hold. When the paths changed cannot be read and no
   * call is recorded for a verdict, its carry is undecided (`maybe`).
   */
  const carryCalls = async (
    seq: Seq,
    session: CallSession,
    thread: Thread,
    owed: readonly { readonly row: EvidenceRow; readonly obligations: readonly ObligationId[]; readonly from: Carried["from"]; readonly maybe: boolean }[],
    head: Sha,
    proposal: InputOf<"carry">["proposal"],
    same: (row: EvidenceRow) => boolean,
    holds: (o: ObligationId) => boolean,
    quiet: boolean,
  ): Promise<{ readonly ok: true; readonly carried: VersionMade["carried"]; readonly maybe: VersionMade["maybe"] } | Failed> => {
    const carried: { obligation: ObligationId; evidence: Carried }[] = [];
    const maybe: { obligation: ObligationId; act: ActId }[] = [];
    for (const c of owed) {
      const since = await sinceOf(c.from.head, head);
      const revoked = revokedFact(roster, c.row);
      const r = await session.carry({
        act: c.row.act,
        purpose: thread.purpose,
        optional: c.maybe,
        input: (from) => {
          const changedSince = since ?? from?.input.changedSince;
          return changedSince ? { kind: "carry", evidence: verdictEvidence(roster, c.row, c.from), changedSince: [...changedSince], proposal, policy: { same: same(c.row) } } : null;
        },
        facts: () => (revoked ? { revoked } : {}),
      });
      if (!r.ok) return failed(r.failure);
      if (since === null && !quiet) limit(seq, `the Git objects of ${c.from.head} and ${head} are not present, so the paths changed since ${c.row.act} are the retained context's${r.result ? "" : ", and no carry call is recorded for it: whether it carried is undecided"}`);
      for (const o of c.obligations) {
        if (!holds(o)) continue; // V:carry-holds
        if (r.result === null) maybe.push({ obligation: o, act: c.row.act });
        else if (r.result.carried) carried.push({ obligation: o, evidence: r.result.carried });
      }
    }
    return { ok: true, carried, maybe };
  };

  /**
   * The calls admission had to make for an act (R-ADM-1 steps 8 and 9 as
   * amended; note 4.4), made in order and stopped where admission stops:
   * `cut` is `none` for a recorded platform refusal decided before any
   * policy call, `refuse` for one decided after a version's `refuse` rules,
   * and `policy` otherwise, where the calls run until one refuses. `made`
   * is what a version the act makes keeps: its obligations and the verdicts
   * carried onto it. An act that names a thread or entry the log never had
   * is `guard-failed`: the room refuses it `lane-unknown`.
   */
  const actCalls = async (
    seq: Seq,
    env: Envelope,
    by: Authority,
    steps: readonly Step[],
    version: PolicyVersion,
    declared: boolean,
    recorded: readonly Decision[],
    cut: "none" | "refuse" | "policy",
    witness: Witness | null,
    adminOpened: boolean,
  ): Promise<{ readonly ok: true; readonly refusal: CallSession["refusal"]; readonly made: VersionMade } | Failed> => {
    const opened = openSession(seq, recorded, version, declared);
    if (!opened.ok) return failed(opened.failure);
    const session = opened.result;
    const p = policyByVersion.get(version)!;
    const doc = p.doc as PolicyDocument;
    const w: World = { fold, roster, declared };
    const j = judgingAt(version);
    let made = NOTHING_MADE;
    const done = () => {
      const extra = session.finish();
      if (extra) return failed(extra);
      decisionsReplayed += session.replayed;
      return { ok: true as const, refusal: session.refusal, made };
    };
    const recoveryKey = by.via === "recovery";
    if (cut === "none" || (env.kind as string) === "recover") return done(); // R-DECL-21: no policy rules on configuration recovery
    if (env.kind === "roster") {
      const r = await session.refuse(refuseInput(w, env, by, null, null), recoveryKey);
      return r.ok ? done() : failed(r.failure);
    }
    const thread = threadOf(env);
    const unknown: Failed = { ok: false, reason: "guard-failed", detail: "the act names a thread or entry the log never had, which the room refuses as lane-unknown" };
    if (thread === undefined) return unknown; // V:thread-known
    if (steps.includes("version")) {
      if (!thread) return unknown;
      const head = (env.body as { head: Sha }).head;
      const generation = thread.generation + 1;
      const proposal = Fold.proposal(doc, { generation, head, witness });
      const refuse = await session.refuse(refuseInput(w, env, by, thread, proposal), recoveryKey);
      if (!refuse.ok) return failed(refuse.failure);
      if (refuse.result.refusal || cut === "refuse") return done();
      const require = await session.require(requireInput(w, actorOf(roster, by), thread, proposal));
      if (!require.ok) return failed(require.failure);
      if (require.result.refusal) return done();
      const required = withAdvisory(require.result.obligations, p.configs);
      const specs = specsOf({ witness, required, specPolicy: version, adminOpened });
      // Carrying earlier verdicts (R-CARRY): none on a configuration-recovery thread, or for a first version.
      const previous = thread.purpose !== "config-recovery" && thread.generation > 0 ? fold.version(thread.id, thread.generation) : null;
      const owed = previous ? carryCandidates(j, previous).map((c) => ({ ...c, from: { generation: c.row.generation, head: c.row.head } })) : [];
      const carries = await carryCalls(
        seq,
        session,
        thread,
        owed,
        head,
        proposal,
        (row) => fold.version(thread.id, row.generation)?.policy === version,
        (o) => specs.some((s) => s.id === o),
        !declared,
      );
      if (!carries.ok) return carries;
      made = { policy: version, required, carried: carries.carried, maybe: carries.maybe };
      if (steps.includes("land")) {
        // `version` then `land` in one act (R-DECL-4): land rules at stage `land`, on the version just made.
        const provisional: Version = { lane: thread.id, generation, head, witness, proposer: by.member!, act: "act_0_00000000" as ActId, blocked: null, policy: version, required, specPolicy: version, adminOpened, carried: carries.carried, maybe: carries.maybe };
        const evidence = landEvidence(j, provisional, null);
        const land = await session.land((from) => landInput(w, actorOf(roster, by), thread, proposal, patchLand(evidence, from?.input ?? null), "land"));
        if (!land.ok) return failed(land.failure);
      }
      return done();
    }
    if (steps.includes("land")) {
      const target = env.target as { lane: LaneId; generation: number };
      const v = fold.version(target.lane, target.generation);
      if (!thread || !v) return unknown;
      const refuse = await session.refuse(refuseInput(w, env, by, thread, null), recoveryKey);
      if (!refuse.ok) return failed(refuse.failure);
      if (refuse.result.refusal) return done();
      const evidence = landEvidence(j, v, null);
      if (evidence.unwitnessed.length || evidence.maybeReviews.length) limit(seq, `whether an earlier verdict carried onto ${v.lane} generation ${v.generation} is undecided without Git objects, so that part of the land input is the retained context's`);
      const land = await session.land((from) => landInput(w, actorOf(roster, by), thread, Fold.proposal(doc, v), patchLand(evidence, from?.input ?? null), "land"));
      return land.ok ? done() : failed(land.failure);
    }
    const r = await session.refuse(refuseInput(w, env, by, thread, null), recoveryKey);
    return r.ok ? done() : failed(r.failure);
  };

  /** Close a session: a recorded call left over is `decision-extra`; otherwise its decisions count as replayed. */
  const closed = (session: CallSession): Failed | null => {
    const extra = session.finish();
    if (extra) return failed(extra);
    decisionsReplayed += session.replayed;
    return null;
  };

  /**
   * An `obligations-recomputed` event's calls (R-POL-9, the room's
   * `recomputeOne`): `require` for the version, by its proposer, under the
   * new document; then a `carry` call for each verdict carried onto it,
   * with `policy.same` false, whose obligation the new obligations still
   * hold. A failed `require` keeps the earlier obligations and blocks
   * landing; the carry calls follow it all the same. The version then keeps
   * the new obligations and carries.
   */
  const recompute = async (seq: Seq, ev: Extract<SystemEvent, { readonly type: "obligations-recomputed" }>, t: Thread, v: Version, declared: boolean): Promise<{ readonly ok: true } | Failed> => {
    if (declared) await resolve(seq, v, ev.decisions);
    // A v1 entry reports as it did before declared acts: its witness is read quietly, and not kept.
    const witness = v.witness ?? (declared ? null : await witnessOf(seq, ev.decisions, v.head, true));
    const p = policyByVersion.get(ev.policy)!;
    const doc = p.doc as PolicyDocument;
    const w: World = { fold, roster, declared };
    const proposal = Fold.proposal(doc, { generation: v.generation, head: v.head, witness });
    const opened = openSession(seq, ev.decisions, ev.policy, declared);
    if (!opened.ok) return failed(opened.failure);
    const session = opened.result;
    const require = await session.require(requireInput(w, memberActor(roster, v.proposer), t, proposal));
    if (!require.ok) return failed(require.failure);
    const blocked = require.result.refusal !== null;
    const required = blocked ? v.required : withAdvisory(require.result.obligations, p.configs); // V:recompute-keeps
    const specPolicy = blocked ? v.specPolicy : ev.policy;
    const specs = specsOf({ witness, required, specPolicy, adminOpened: v.adminOpened });
    const owed: { row: EvidenceRow; obligations: ObligationId[]; from: Carried["from"]; maybe: boolean }[] = [];
    if (t.purpose !== "config-recovery")
      for (const c of [...v.carried.map((x) => ({ obligation: x.obligation, act: x.evidence.act, from: x.evidence.from as Carried["from"] | null, maybe: false })), ...v.maybe.map((x) => ({ ...x, from: null, maybe: true }))]) {
        if (!specs.some((s) => s.id === c.obligation)) continue;
        const row = fold.evidenceByAct(c.act);
        if (row) owed.push({ row, obligations: [c.obligation], from: c.from ?? { generation: row.generation, head: row.head }, maybe: c.maybe });
      }
    const carries = await carryCalls(seq, session, t, owed, v.head, proposal, () => false, () => true, !declared);
    if (!carries.ok) return carries;
    const extra = closed(session);
    if (extra) return extra;
    if (declared && (session.refusal?.rule ?? null) !== (ev.blocked?.rule ?? null))
      return { ok: false, reason: "refusal-mismatch", detail: `the require call ${session.refusal ? `refuses with ${session.refusal.rule}` : "refuses nothing"}, and the event records ${ev.blocked ? `blocked ${ev.blocked.rule}` : "no block"}` }; // V:recompute-blocked
    v.required = required;
    v.specPolicy = specPolicy;
    v.carried = carries.carried;
    v.maybe = carries.maybe;
    return { ok: true };
  };

  /**
   * The integration a check counts for (R-CARRY-15 step 5, fold.ts
   * `EvidenceRow.canonical`): its own for a whole-tree check; for a check on
   * a filtered snapshot, the integration whose `prepared` event names the
   * snapshot commit it ran on, or its own when a `prepared` event names it
   * as an integration. Undefined when no `prepared` event says.
   */
  const canonicalOf = (lane: LaneId, generation: number, b: CheckBody): Sha | undefined => {
    if (b.input.kind === "tree") return b.integration;
    const events = fold.prepared.filter((p) => {
      const mine = "preview" in p.owner ? p.owner.preview.lane === lane && p.owner.preview.generation === generation : p.owner.lane === lane && p.owner.generation === generation;
      return mine && (b.landOp === undefined || ("op" in p.owner && p.owner.op === b.landOp));
    });
    const bySnapshot = [...new Set(events.filter((p) => p.snapshots.some((x) => x.check === b.check && x.commit === b.integration)).map((p) => p.integration))];
    if (bySnapshot.length === 1) return bySnapshot[0]; // V:canonical-snapshot
    return events.some((p) => p.integration === b.integration) ? b.integration : undefined;
  };

  /**
   * A `check-carried` event under a `v2` document (R-CARRY-6 to 14, the
   * room's `carryChecks`): the judgement is owed only for an earlier passing
   * check of the obligation and its checker on this thread, on another
   * integration, not judged before under this policy; the call's evidence,
   * policy comparison and facts are rebuilt; and the outcome recorded is the
   * one the evaluator gives. The new integration's tree comes from a
   * `prepared` event or its Git commit, and its filtered snapshot from a
   * `prepared` event; without them they are the retained context's.
   */
  /**
   * The earlier passing checks a carry pass for this operation could see and has no judgement for: checks of the
   * obligation and its checker on the thread, on another integration, admitted before the operation's land act
   * (the room's `carryChecks` lists them after it), newest first. `after` leaves out a check and all older ones.
   * See notes/2026-10-03-carry-accounting.md.
   */
  const unjudged = (op: { readonly act: ActId }, lane: LaneId, generation: number, integration: Sha, obligation: ObligationId, checker: string, policy: PolicyVersion, after: Seq): ActId[] => {
    const started = Number(/^act_(0|[1-9][0-9]*)_/.exec(op.act)?.[1] ?? Number.NaN);
    const out: { readonly act: ActId; readonly seq: number }[] = [];
    for (let g = 1; g <= generation; g++)
      for (const e of fold.evidenceOn(lane, g)) {
        const b = e.body as CheckBody;
        if (e.kind !== "check" || !b.ok || b.obligation !== obligation || b.check !== checker) continue;
        if (!(e.seq > after && e.seq < started) || e.canonical === undefined || e.canonical === integration) continue;
        if (!fold.checkJudged.has(`${carryKey(lane, generation, integration, obligation)}/${e.act}/${policy}`)) out.push({ act: e.act, seq: e.seq });
      }
    return out.sort((a, b) => b.seq - a.seq).map((e) => e.act);
  };

  const checkCarry = async (seq: Seq, ev: Extract<SystemEvent, { readonly type: "check-carried" }>, judgedKey: string): Promise<{ readonly ok: true } | Failed> => {
    const extra = (detail: string): Failed => ({ ok: false, reason: "decision-extra", detail: `no carry judgement is owed for ${ev.act}: ${detail}` });
    const op = fold.landOps.get(ev.op);
    const t = fold.thread(ev.lane);
    const v = fold.version(ev.lane, ev.generation);
    const row = fold.evidenceByAct(ev.act);
    if (!op || op.lane !== ev.lane || op.generation !== ev.generation || !t || !v || !row) return extra(`${ev.op} is not a landing of ${ev.lane} generation ${ev.generation}`); // V:carried-op
    const p = policyByVersion.get(ev.policy)!;
    const doc = p.doc as PolicyDocument;
    await resolve(seq, v, ev.decisions);
    const spec = specsOf(v).find((s) => s.id === ev.obligation);
    const b = row.body as CheckBody;
    const cfg = spec && spec.kind === "check" ? p.configs.get(spec.check) : undefined;
    if (!spec || spec.kind !== "check" || !cfg) return extra(`${ev.obligation} is not a check obligation of the version with a configured checker`); // V:carried-obligation
    if (b.check !== spec.check || !b.ok || row.generation > ev.generation) return extra("it is not a passing check of the obligation's checker on this or an earlier version"); // V:carried-passing
    if (row.canonical === ev.integration) return extra("it already counts for this integration"); // V:carried-other-integration
    if (fold.checkJudged.has(judgedKey)) return extra("it was already judged for this integration under this policy"); // V:carried-once
    const opened = openSession(seq, ev.decisions, ev.policy, true);
    if (!opened.ok) return failed(opened.failure);
    const session = opened.result;
    let expected: Extract<SystemEvent, { readonly type: "check-carried" }>["outcome"] | null;
    const runner = cfg.runner;
    if (!runner) {
      // R-CARRY-14: a checker with no pinned runner never carries, and no rule is asked.
      expected = { carried: false, notCarried: { act: ev.act, code: "runner-changed", text: "No runner environment is pinned" } };
    } else {
      const prepared = fold.prepared.find((x) => "op" in x.owner && x.owner.op === ev.op && x.integration === ev.integration) ?? fold.prepared.find((x) => x.integration === ev.integration);
      const tree = prepared?.tree ?? (await treeOf(reader, ev.integration));
      const inputs = checkerInputs(cfg.inputs, doc.carry);
      const snapshot = inputs === null ? null : (prepared?.snapshots.find((x) => x.check === spec.check)?.digest as Digest | undefined);
      if (tree === null || snapshot === undefined) limit(seq, `no prepared event or Git object gives the new integration ${ev.integration}'s ${tree === null ? "tree" : "filtered snapshot"}, so it is the retained context's`);
      const from = fold.version(ev.lane, row.generation);
      const revoked = invalidity(roster, row, doc.retiredEvidence);
      const r = await session.carry({
        act: row.act,
        purpose: t.purpose,
        ownBudget: true,
        input: () => ({ kind: "carry", evidence: checkEvidence(roster, row, from?.head ?? v.head), changedSince: [], proposal: Fold.proposal(doc, v), policy: { same: from?.policy === ev.policy } }),
        facts: (recorded) => {
          const now = recorded?.facts.check?.now;
          const newTree = tree ?? now?.tree;
          const newSnapshot = snapshot !== undefined ? snapshot : now?.snapshot;
          if (!newTree || newSnapshot === undefined) return null;
          return {
            ...(revoked ? { revoked } : {}),
            check: { before: { integration: b.integration, config: b.config, runner: b.runner, input: b.input }, now: { integration: ev.integration, tree: newTree, snapshot: newSnapshot, config: p.checkers.get(spec.check)!, runner }, volatile: cfg.volatile },
          };
        },
      });
      if (!r.ok) return failed(r.failure);
      expected = r.result === null ? null : r.result.carried ? { carried: true, reason: r.result.carried.reason } : { carried: false, notCarried: r.result.notCarried! };
    }
    const left = closed(session);
    if (left) return left;
    if (expected && !same(expected, ev.outcome)) return { ok: false, reason: "carried-outcome-mismatch", detail: `check-carried for ${ev.act}: recorded ${canonicalize(ev.outcome)}, rebuilt ${canonicalize(expected)}` }; // V:carried-outcome
    if (ev.outcome.carried) {
      // The pass that carried this check went newest first and sealed each judgement before the next: every newer
      // check it could see was judged before this one.
      const skipped = unjudged(op, ev.lane, ev.generation, ev.integration, ev.obligation, spec.check, ev.policy, row.seq);
      if (skipped.length)
        return { ok: false, reason: "decision-missing", detail: `check-carried for ${ev.act}: the newer passing check ${skipped[0]} of ${ev.obligation} has no carry judgement for ${ev.integration} under ${ev.policy}, and the room judges newest first` }; // V:carried-newest-first
    }
    return { ok: true };
  };

  /**
   * The notify input the room builds when it seals an act (R-LOG-13): after
   * the act's own effects, on its thread, with the version it made or acts
   * on. The proposal is resolved when the `notified` event is read, once the
   * version's witness is known. The directory's reviewers are those of the
   * thread's latest version as it stood then (obligations.ts `reviewersOf`):
   * its obligations are kept here, and its evidence is the rows up to this
   * seq.
   */
  const notifySnapshot = (seq: Seq, id: ActId, env: Envelope, by: Authority, steps: readonly Step[]) => {
    const t = env.target as { lane?: unknown; generation?: unknown } | null;
    const lane = fold.threads.get(id) ?? threadOf(env) ?? null;
    const op = (env.kind as string) === "recover" ? (env.body as { op?: unknown }).op : null;
    let version: { lane: string; generation: number } | null = null;
    if ((steps.includes("version") || op === "version") && lane) version = { lane: lane.id, generation: lane.generation };
    else if ((steps.some((s) => s === "review" || s === "check" || s === "land") || op === "approve" || op === "land") && typeof t?.lane === "string" && typeof t.generation === "number")
      version = { lane: t.lane, generation: t.generation };
    const input: InputOf<"notify"> = {
      kind: "notify",
      act: { id, kind: env.kind as never, target: env.target as never, body: env.body as never },
      actor: actorOf(roster, by),
      lane: lane ? fold.policyLane(lane, true) : null,
      proposal: null,
    };
    const latest = lane && lane.generation > 0 ? fold.version(lane.id, lane.generation) : null;
    const reviewed = latest ? { version: latest, required: latest.required, specPolicy: latest.specPolicy, seq } : null;
    return { input, roles: roster.roles(), version, reviewed };
  };
  /** For each accepted act under a v2 document, the notify input the room built when it sealed it (R-LOG-13). */
  const notifyInputs = new Map<string, ReturnType<typeof notifySnapshot>>();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const bad = (reason: VerifyReason, detail: string) => {
      fail({ reason, seq: i, detail });
      firstBad = Math.min(firstBad, i);
    };
    /** Stop at an entry that needs a version this verifier lacks: a limit, not a failure (R-DECL-25). */
    const stop = (v: Lacking) => {
      unsupported = { reason: v.unsupported, seq: i, detail: v.detail };
      firstBad = Math.min(firstBad, i);
    };
    policyAt[i] = activePolicy;
    if (e.seq !== i) {
      // A later position holding seq i means the entries were reordered; none means one was dropped.
      if (entries.some((x) => x.seq === i)) bad("entry-order", `entry at position ${i} has seq ${e.seq}; seq ${i} appears later`);
      else bad("seq-gap", `entry ${i} is missing; the next entry has seq ${e.seq}`);
      break;
    }
    if (e.prev !== (i === 0 ? null : entries[i - 1]!.hash)) {
      bad("prev-mismatch", `prev does not name entry ${i - 1}'s hash`);
      break;
    }
    if (digestJson(contentOf(e)) !== e.hash) {
      bad("hash-mismatch", "the hash is not the digest of the entry's content");
      break;
    }
    if (!verifySig(roomKey, e.roomSig, "artroom-entry-v1", e.hash)) {
      bad("room-signature", "roomSig is not the room key's signature over the hash");
      break;
    }
    const id = entryId(e.seq, e.hash);
    const body = e.entry;

    if (body.type === "system") {
      const ev = body.event;
      if (ev.type === "genesis") {
        if (i !== 0) {
          bad("genesis-invalid", "a second genesis");
          break;
        }
        if (!verifySig(genesis.admin.key, ev.sig, "artroom-genesis-v1", ev.genesis)) {
          bad("genesis-signature", "the genesis is not signed by its first admin key");
          break;
        }
        // An imported repository: the operator's grant names this repository and this first admin (R-GEN-12).
        const onboarding = ev.genesis.onboarding;
        if (onboarding) {
          const { grant, sig } = onboarding;
          if (!verifySig(grant.operator, sig, "artroom-onboarding-v1", grant)) {
            bad("onboarding-invalid", `the onboarding grant is not signed by its operator key ${grant.operator}`);
            break;
          }
          if (grant.repo !== ev.genesis.repo || grant.admin !== ev.genesis.admin.key) {
            bad("onboarding-invalid", `the onboarding grant names ${grant.repo} and ${grant.admin}, not the genesis's repository and first admin`);
            break;
          }
          operator = grant.operator;
        }
      } else if (ev.type === "policy-activated") {
        const doc = lookup("policy", ev.policy, "policy-missing");
        if (!doc.ok && (doc.reason === "steps-unsupported" || doc.reason === "profile-unsupported")) {
          // A document this verifier cannot read: entries under it stop verification (R-DECL-14, R-DECL-22).
          needs.push({ seq: i, path: policyPath(ev.policy), reason: "policy-missing" });
          policyByVersion.set(id, { doc: null, digest: ev.policy, checkers: new Map(), configs: new Map(), vocab: { unsupported: doc.reason, detail: `policy ${ev.policy}, activated at ${i}: ${doc.detail}` } });
          activePolicy = id;
          fold.applySystem(id, ev);
          continue;
        }
        if (!doc.ok) {
          bad(doc.reason as VerifyReason, doc.detail);
          break;
        }
        // Every checker configuration it names is published, and is one (R-POL-9, R-LOG-9).
        const configs = ev.checkers.map((c) => ({ c, r: lookup("checker", c.config, "checker-missing") }));
        const missing = configs.find((x) => !x.r.ok);
        if (missing && !missing.r.ok) {
          bad(missing.r.reason as VerifyReason, `checker ${missing.c.name}: ${missing.r.detail}`);
          break;
        }
        const d = doc.value as AnyPolicyDocument;
        let vocab: Vocabulary = LEGACY;
        if (d.format === "artroom-policy-v2") {
          // R-DECL-8, R-DECL-18, R-DECL-24: valid in this room, with its historical opening kinds and its checkers.
          const named = STEPS_VERSIONS.includes(d.steps) ? d : { ...d, steps: STEPS_VERSIONS[0]! };
          const checked = validatePolicyV2(named, { historicalOpeningKinds: [...fold.openingKinds], checkers: Object.fromEntries(configs.map(({ c, r }) => [c.name, (r as { value: unknown }).value])) });
          if (!checked.ok) {
            bad("malformed", `the activated document is not valid in this room: ${checked.problems[0]}`); // V:activation-valid
            break;
          }
          vocab = await vocabularyOf(d, stepsCarried[d.steps]!);
        } else {
          // A v1 document's checkers are artroom-checker-v1, as R-POL-1 has always required.
          const v2 = configs.find(({ r }) => (r as { value: { format?: unknown } }).value.format !== "artroom-checker-v1");
          if (v2) {
            bad("malformed", `checker ${v2.c.name}: a v1 document's checker configuration must be artroom-checker-v1`); // V:checker-format-v1
            break;
          }
        }
        needs.push({ seq: i, path: policyPath(ev.policy), reason: "policy-missing" });
        for (const c of ev.checkers) needs.push({ seq: i, path: policyPath(c.config), reason: "checker-missing" });
        policyByVersion.set(id, {
          doc: d,
          digest: ev.policy,
          checkers: new Map(ev.checkers.map((c) => [c.name, c.config])),
          configs: new Map(configs.map(({ c, r }) => [c.name, (r as { value: CheckerConfig }).value])),
          vocab,
        });
        activePolicy = id;
      } else if (ev.type === "obligations-recomputed") {
        if (ev.policy !== activePolicy) {
          bad("policy-version-mismatch", `obligations-recomputed names policy ${ev.policy}; the active policy is ${activePolicy ?? "none"}`);
          break;
        }
        const vocab = vocabAt(ev.policy);
        if (lacking(vocab)) {
          stop(vocab);
          break;
        }
        const declared = vocab.kind === "declared";
        if (!declared && !(await replayDecisions(i, ev.decisions, ev.policy, "the policy it was recomputed under"))) {
          firstBad = Math.min(firstBad, i);
          break;
        }
        const t = fold.thread(ev.lane);
        const v = fold.version(ev.lane, ev.generation);
        if (declared && (!t || !v)) {
          bad("guard-failed", `obligations-recomputed names ${ev.lane} generation ${ev.generation}, which the log never proposed`); // V:recompute-version
          break;
        }
        if (t && v && opts.replayDecisions !== false) {
          // Under a v1 document the calls are made, not judged: the fold follows the recomputation (R-DECL-1).
          const r = declared ? await recompute(i, ev, t, v, true) : await recompute(i, ev, t, v, false).catch(() => null);
          if (declared && r && !r.ok) {
            bad(r.reason, r.detail);
            break;
          }
        }
      } else if (ev.type === "land-evaluated") {
        const vocab = vocabAt(activePolicy);
        if (lacking(vocab)) {
          stop(vocab);
          break;
        }
        if (vocab.kind === "legacy") {
          if (!(await replayDecisions(i, ev.decisions, activePolicy, "the active policy"))) {
            firstBad = Math.min(firstBad, i);
            break;
          }
        } else {
          // R-LAND-4: land rules at stage reservation, for the operation's version, as its initiator.
          const op = fold.landOps.get(ev.op);
          const t = op ? fold.thread(op.lane) : null;
          const v = op ? fold.version(op.lane, op.generation) : null;
          if (!op || !t || !v) {
            bad("guard-failed", `land-evaluated names ${ev.op}, which no land act on a known version started`); // V:land-op
            break;
          }
          await resolve(i, v, ev.decisions);
          // The obligations count for the integration the landing built (R-OBL-3); the reviews are the version's.
          const evidence = landEvidence(judgingAt(activePolicy!), v, ev.integration);
          // R-LAND-4: the room evaluates the land rules only once no blocking obligation is open on the integration.
          // A carry that the log does not show leaves its obligation open here, whatever the land input says.
          const open = evidence.obligations.find((o) => !o.met && !evidence.unwitnessed.includes(o.id));
          if (open) {
            const spec = specsOf(v).find((x) => x.id === open.id);
            const owed = spec?.kind === "check" ? unjudged(op, op.lane, op.generation, ev.integration, open.id, spec.check, activePolicy!, -1) : [];
            if (owed.length) bad("decision-missing", `land-evaluated for ${ev.op}: ${open.id} is open on ${ev.integration}, and the earlier passing check ${owed[0]} has no carry judgement for it under ${activePolicy}`); // V:land-carry-owed
            else bad("guard-failed", `land-evaluated for ${ev.op}: the obligation ${open.id} is not met on ${ev.integration}, and the room evaluates a landing only when every blocking obligation is met`); // V:land-open-obligation
            break;
          }
          if (opts.replayDecisions !== false) {
            const opened = openSession(i, ev.decisions, activePolicy!, true);
            if (!opened.ok) {
              bad(opened.failure.reason, opened.failure.detail);
              break;
            }
            if (evidence.unwitnessed.length || evidence.maybeReviews.length)
              limit(i, `the log does not say whether ${evidence.unwitnessed.join(", ") || "a carried verdict"} counts for ${ev.integration}: a check on a filtered snapshot with no prepared event, or a verdict whose carry is undecided without Git objects; that part of the land input is the retained context's`);
            const w: World = { fold, roster, declared: true };
            const land = await opened.result.land((from) => landInput(w, actorOf(roster, op.authority), t, Fold.proposal(vocab.doc as unknown as PolicyDocument, v), patchLand(evidence, from?.input ?? null), "reservation"));
            const left = land.ok ? closed(opened.result) : failed(land.failure);
            if (left) {
              bad(left.reason, left.detail);
              break;
            }
          }
        }
      } else if (ev.type === "check-carried") {
        // R-CARRY-13: `act` is an earlier accepted check of the same lane and obligation.
        const m = /^act_(0|[1-9][0-9]*)_([0-9a-f]{8})$/.exec(ev.act);
        const check = m ? entries[Number(m[1])] : undefined;
        if (!m || !check || check.seq >= i || check.hash.slice(7, 15) !== m[2] || check.entry.type !== "act" || !checkActs.has(check.seq)) {
          bad("carried-unknown", `check-carried names ${ev.act}, which is not an earlier accepted check`);
          break;
        }
        const { target, body } = check.entry.act.envelope;
        const lane = (target as { readonly lane?: unknown } | null)?.lane;
        const obligation = (body as CheckBody).obligation;
        if (lane !== ev.lane || obligation !== ev.obligation) {
          bad("carried-mismatch", `${ev.act} is a check of lane ${String(lane)} for ${obligation}; check-carried names lane ${ev.lane} for ${ev.obligation}`);
          break;
        }
        if (!policyByVersion.has(ev.policy)) {
          bad("policy-version-mismatch", `check-carried names policy ${ev.policy}, which no earlier policy-activated event activated`);
          break;
        }
        const vocab = vocabAt(ev.policy);
        if (lacking(vocab)) {
          stop(vocab);
          break;
        }
        const judgedKey = `${carryKey(ev.lane, ev.generation, ev.integration, ev.obligation)}/${ev.act}/${ev.policy}`;
        if (vocab.kind === "legacy" || opts.replayDecisions === false) {
          if (!(await replayDecisions(i, ev.decisions, ev.policy, "the policy the check-carried event names"))) {
            firstBad = Math.min(firstBad, i);
            break;
          }
        } else {
          const r = await checkCarry(i, ev, judgedKey);
          if (!r.ok) {
            bad(r.reason, r.detail);
            break;
          }
        }
        const problem = carryOutcomeProblem(ev);
        if (problem) {
          bad("carried-outcome-mismatch", `check-carried for ${ev.act}: ${problem}`);
          break;
        }
        // The judgement is made once; a carry counts on its integration, under the policy that judged it (R-CARRY-13).
        fold.checkJudged.add(judgedKey);
        if (ev.outcome.carried) {
          const row = fold.evidenceByAct(ev.act);
          const head = fold.version(ev.lane, row?.generation ?? ev.generation)?.head ?? (body as CheckBody).integration;
          fold.addCheckCarry({
            lane: ev.lane,
            generation: ev.generation,
            integration: ev.integration,
            obligation: ev.obligation,
            act: ev.act,
            evidence: { basis: "carried", act: ev.act, kind: "check", from: { generation: row?.generation ?? ev.generation, head }, reason: ev.outcome.reason, rules: ev.decisions.map((d) => d.rule) },
            policy: ev.policy,
          });
        }
      } else if (ev.type === "notified") {
        const m = /^act_(0|[1-9][0-9]*)_([0-9a-f]{8})$/.exec(ev.entry);
        const target = m ? entries[Number(m[1])] : undefined;
        if (!m || !target || target.seq >= i || target.hash.slice(7, 15) !== m[2] || target.entry.type !== "act") {
          bad("notified-unknown", `notified names ${ev.entry}, which is not an earlier accepted act`);
          break;
        }
        if (notified.has(ev.entry)) {
          bad("notified-twice", `${ev.entry} is notified twice`);
          break;
        }
        notified.add(ev.entry);
        const pinned = policyAt[target.seq] ?? null;
        const vocab = vocabAt(pinned);
        if (lacking(vocab)) {
          stop(vocab);
          break;
        }
        const snap = notifyInputs.get(ev.entry);
        if (vocab.kind === "legacy") {
          if (!(await replayDecisions(i, ev.decisions, pinned, `the policy pinned when ${ev.entry} was admitted`))) {
            firstBad = Math.min(firstBad, i);
            break;
          }
        } else {
          // R-POL-5, R-LOG-13: notify rules on the act, with the input the room built when it sealed it; none for a roster act.
          const v = snap?.version ? fold.version(snap.version.lane as LaneId, snap.version.generation) : null;
          if (v) await resolve(i, v, ev.decisions);
          if (opts.replayDecisions !== false) {
            const opened = openSession(i, ev.decisions, pinned!, true);
            if (!opened.ok) {
              bad(opened.failure.reason, opened.failure.detail);
              break;
            }
            let left: Failed | null = null;
            if (snap) {
              const doc = vocab.doc as unknown as PolicyDocument;
              // The reviewers of the thread's latest version when the act was sealed: its obligations then, its evidence up to then.
              const rv = snap.reviewed;
              const reviewers = rv
                ? reviewersOf(
                    doc,
                    specsOf({ witness: rv.version.witness, required: rv.required, specPolicy: rv.specPolicy, adminOpened: rv.version.adminOpened }),
                    fold.evidenceOn(rv.version.lane, rv.version.generation).filter((e) => e.seq <= rv.seq), // V:reviewers-then
                  )
                : [];
              const r = await opened.result.notify({ ...snap.input, proposal: v ? Fold.proposal(doc, v) : null }, { roles: snap.roles, reviewers });
              if (!r.ok) left = failed(r.failure);
            }
            left ??= closed(opened.result);
            if (left) {
              bad(left.reason, left.detail);
              break;
            }
          }
        }
      } else if (ev.type === "checkpoint") {
        const cp = checkpointsByCommit.get(ev.commit);
        if (!cp || cp.through !== ev.through || cp.hash !== ev.hash || cp.through >= i) {
          bad("checkpoint-event-mismatch", `checkpoint event names ${ev.commit}, which is not an earlier log commit with through ${ev.through}`);
          break;
        }
      } else if (ev.type === "revert-lane" && "lane" in ev) {
        bad("self-reference", "a revert-lane event names its own lane");
        break;
      }
      fold.applySystem(id, ev);
      continue;
    }

    // An act or a recorded refusal.
    const signed = body.act;
    const env = signed.envelope;
    if (env.room !== room) {
      bad("wrong-room", `the envelope names ${env.room}`);
      break;
    }
    if (!verifySig(env.actor, signed.sig, "artroom-envelope-v1", env)) {
      bad("actor-signature", `the envelope is not signed by ${env.actor}`);
      break;
    }
    // R-DECL-1, R-DECL-16: the kind, its binding and its body, under the document in force at this seq.
    const vocab = vocabAt(activePolicy);
    if (lacking(vocab)) {
      stop(vocab);
      break;
    }
    const kind = kindProblem(env, vocab);
    if (kind) {
      bad(kind.reason, kind.detail);
      break;
    }
    const shape = bodyProblem(env, vocab, (lane) => fold.thread(lane)?.scopeSource);
    if (shape) {
      bad("body-invalid", shape);
      break;
    }
    const judged = roster.judge(env, checkedTime(e.at, "at"), whoOf(vocab));
    if (!judged.ok) {
      bad(judged.reason, judged.detail);
      break;
    }
    if (!same(judged.authority, body.receipt.authority)) {
      bad("authority-mismatch", `recorded ${canonicalize(body.receipt.authority)}, replayed ${canonicalize(judged.authority)}`);
      break;
    }
    // R-DECL-21, R-ADMIN-5: the room accepts a recover op only from an active admin's own key. Any other signer its
    // role table lets through is refused `admin-required`, and that refusal is recorded.
    if (body.type === "act" && (env.kind as string) === "recover" && !(judged.authority.via === "member" && judged.authority.role === "admin")) {
      bad("admin-required", `an accepted recover op is signed by ${judged.authority.member ?? judged.authority.key}, who is not an admin signing with an own key`); // V:recover-admin
      break;
    }
    if (body.type === "act" && judged.authority.via === "recovery" && !body.receipt.flags.includes("recovery-key")) {
      bad("flag-missing", "a recovery-key act lacks the recovery-key flag");
      break;
    }
    const key = `${env.actor}\u0000${env.idempotencyKey}`;
    if (idem.has(key)) {
      bad("idempotency-duplicate", `${env.actor} reused idempotency key ${env.idempotencyKey} from entry ${idem.get(key)}`);
      break;
    }
    idem.set(key, i);
    const steps = stepsOf(env, vocab);
    if (body.type === "act" && (vocab.kind === "legacy" ? env.kind === "check" : steps.includes("check"))) {
      checkActs.add(i); // V:check-step
      // R-OBL-3: an accepted check names its checker's configuration digest in the active version.
      const { check, config, integration, input, landOp } = env.body as CheckBody;
      const expected = activePolicy === null ? undefined : policyByVersion.get(activePolicy)!.checkers.get(check);
      if (config !== expected) {
        bad("check-config-mismatch", `the check names config ${config} for ${check}; the active policy ${activePolicy ?? "none"} names ${expected ?? "no such checker"}`);
        break;
      }
      // R-DECL-20, where the log has them: the room prepared the integration the check names.
      const t = env.target as { lane?: unknown; generation?: unknown } | null;
      const prepared = typeof t?.lane === "string" && typeof t.generation === "number" ? fold.preparedFor(t.lane as LaneId, t.generation, landOp) : [];
      // A whole-tree check names the integration and its tree. A check on a filtered snapshot names the checker's
      // snapshot digest, and either the snapshot commit the event records or the integration itself (R-CARRY-15).
      const bound = (p: (typeof prepared)[number]) =>
        input?.kind === "filtered"
          ? p.snapshots.some((x) => x.check === check && x.digest === input.snapshot && (x.commit === integration || p.integration === integration))
          : p.integration === integration && p.tree === (input as { tree?: unknown } | undefined)?.tree;
      if (prepared.length && !prepared.some(bound)) {
        bad("guard-failed", `the check names integration ${integration}, which no prepared event for its ${landOp ? `operation ${landOp}` : "version"} names with its input`); // V:prepared
        break;
      }
    }
    if (body.type === "act" && body.receipt.effects.some((x) => x.type === "opened" && "lane" in x)) {
      bad("self-reference", "an opened effect names its own lane");
      break;
    }
    let witness: Witness | null = null;
    let made: VersionMade = NOTHING_MADE;
    const adminOpened = body.type === "act" && body.receipt.effects.some((x) => x.type === "obligations" && x.opened.includes("obl_admin-approval" as ObligationId));
    if (vocab.kind === "legacy") {
      if (!(await replayDecisions(i, body.receipt.decisions, activePolicy, "the active policy"))) {
        firstBad = Math.min(firstBad, i);
        break;
      }
      // Under a v1 document a proposal's calls are made, not judged, so the fold keeps the version's obligations and
      // carried verdicts for a later v2 document to read (R-DECL-1). Its witness is read quietly, and not kept.
      if (body.type === "act" && env.kind === "propose" && activePolicy !== null && opts.replayDecisions !== false) {
        try {
          const quiet = await witnessOf(i, body.receipt.decisions, (env.body as { head: Sha }).head, true);
          const r = await actCalls(i, env, judged.authority, ["version"], activePolicy, false, body.receipt.decisions, "policy", quiet, adminOpened);
          if (r.ok) made = r.made;
        } catch {
          // A v1 entry is judged by replay alone.
        }
      }
    } else {
      // Note 4.4: the calls admission had to make, rebuilt from the fold, against the decisions recorded.
      const target = env.target as { lane?: unknown; generation?: unknown } | null;
      if (steps.includes("version")) witness = await witnessOf(i, body.receipt.decisions, (env.body as { head: Sha }).head);
      else if (steps.includes("land") && typeof target?.lane === "string" && typeof target.generation === "number") {
        const v = fold.version(target.lane as LaneId, target.generation);
        if (v) await resolve(i, v, body.receipt.decisions);
      }
      const refusal = body.type === "refusal" ? body.receipt.refusal : null;
      const blocked = typeof target?.lane === "string" && typeof target.generation === "number" ? (fold.version(target.lane as LaneId, target.generation)?.blocked?.rule ?? null) : null;
      const cut = refusal ? stoppedAt(refusal.rule, steps, blocked) : "policy";
      if (opts.replayDecisions !== false) {
        const r = await actCalls(i, env, judged.authority, steps, activePolicy!, true, body.receipt.decisions, cut, witness, adminOpened);
        if (!r.ok) {
          bad(r.reason, r.detail);
          break;
        }
        made = r.made;
        if (!refusal && r.refusal) {
          bad("guard-failed", `the act was accepted, but the rule ${r.refusal.rule} refuses it`); // V:accepted-refused
          break;
        }
        if (refusal && cut === "policy" && r.refusal?.rule !== refusal.rule) {
          bad("refusal-mismatch", `the recorded refusal is ${refusal.rule}, but the rules ${r.refusal ? `refuse with ${r.refusal.rule}` : "refuse nothing"}`); // V:refusal-rule
          break;
        }
        if (refusal && cut === "refuse" && r.refusal) {
          bad("refusal-mismatch", `the recorded refusal is ${refusal.rule}, decided after the refuse rules, but the rule ${r.refusal.rule} refuses it first`); // V:refusal-after
          break;
        }
      }
    }
    if (body.type === "act") {
      // An accepted review or check is evidence, with the facts fixed at its admission (R-REV-1): the member's teams,
      // and whether the member was the version's proposer or the thread's holder.
      const recoverOp = (env.kind as string) === "recover" ? (env.body as { op?: unknown }).op : null;
      const evidenceKind =
        vocab.kind === "legacy" ? (env.kind === "review" || env.kind === "check" ? env.kind : null) : steps.includes("review") || recoverOp === "approve" ? "review" : steps.includes("check") ? "check" : null;
      const at = env.target as { lane?: unknown; generation?: unknown } | null;
      const member = judged.authority.member;
      if (evidenceKind && member && typeof at?.lane === "string" && typeof at.generation === "number") {
        const thread = fold.thread(at.lane);
        const v = fold.version(at.lane as LaneId, at.generation);
        if (thread && v)
          fold.addEvidence({
            act: id,
            seq: i,
            kind: evidenceKind,
            lane: v.lane,
            generation: v.generation,
            head: v.head,
            member,
            key: env.actor,
            grantor: judged.authority.via === "delegation" ? judged.authority.grantor : null,
            verdict: evidenceKind === "review" ? ((env.body as ReviewBody).verdict as Verdict) : null,
            flags: body.receipt.flags as readonly Flag[],
            authority: judged.authority,
            teams: roster.teamsOf(member),
            author: member === v.proposer || (thread.state === "held" && thread.holder === member), // V:evidence-author
            body: env.body as ReviewBody | CheckBody,
            canonical: evidenceKind === "check" ? canonicalOf(v.lane, v.generation, env.body as CheckBody) : null,
          });
      }
      roster.apply(env, id, judged.authority);
      fold.applyAct(id, env, body.receipt, vocab, witness, made);
      if (vocab.kind === "declared" && env.kind !== "roster") notifyInputs.set(id, notifySnapshot(i, id, env, judged.authority, steps));
    } else fold.applyRefusal(id, env);
  }

  const verifiedThrough = Math.min(entries.length - 1, firstBad - 1);

  // An unused malformed file fails each commit that publishes it, not the prefix.
  // A retained file that does not decode under its directory's contract fails each
  // commit that publishes it, whether or not an entry needs it.
  for (const [path, detail] of malformed) for (const v of views) if (holds(v, path)) fail({ reason: "malformed", commit: v.sha, detail: `${path}: ${detail}` });

  // Each earlier commit must publish the evidence its own verified entries need.
  // The entries themselves verify against the latest consistent commit, so this
  // fails the earlier commit (named by `commit`, with the entry that needed the
  // file as `seq`) and leaves the verified prefix as it is.
  for (const v of views.slice(0, basis)) {
    const reported = new Set<string>();
    for (const n of needs)
      if (n.seq <= verifiedThrough && n.seq < v.lines.length && !reported.has(n.path) && !holds(v, n.path)) {
        reported.add(n.path);
        fail({ reason: n.reason, commit: v.sha, seq: n.seq, detail: `${n.path}, which entry ${n.seq} needs, is not published in this commit` });
      }
  }
  const lastEntry = verifiedThrough >= 0 ? entries[verifiedThrough]! : null;
  return {
    ok: failures.length === 0 && unsupported === null,
    ref,
    head,
    room,
    operator,
    commits: views.length,
    verifiedThrough,
    last: lastEntry ? { id: entryId(lastEntry.seq, lastEntry.hash), hash: lastEntry.hash } : null,
    publishedThrough: views.at(-1)!.checkpoint?.through ?? -1,
    decisionsReplayed,
    failures,
    unsupported,
    limits,
    cannotProve,
    carryAccounting: replaying ? "partial" : "none",
    mode: replaying ? "full" : "integrity",
  };
}
