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
} from "@generalbusiness/artroom-contract";
import { replay } from "@generalbusiness/artroom-policy";
import { canonicalize } from "./canonical.ts";
import { digestJson, sha256Hex, verifySig } from "./crypto.ts";
import { LOG_REF, ROOT, SEGMENT_SIZE, contentOf, entryId, roomIdOf, segmentPath } from "./entries.ts";
import { parseCommit, type GitReader } from "./git.ts";
import { decodeCheckpoint, decodeEntry, decodeRetained, segmentLines, textOf } from "./decode.ts";
import { readLogFiles } from "./publisher.ts";
import { checkedTime } from "./time.ts";
import { RosterReplay, type AuthorityFailure } from "./roster.ts";

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
  | "checkpoint-event-mismatch"
  | "policy-missing"
  | "checker-missing"
  | "check-config-mismatch"
  | "onboarding-invalid"
  // policy decisions
  | "input-missing"
  | "policy-version-mismatch"
  | "stamp-mismatch"
  | "policy-decision-mismatch";

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
  /** Plain statements of what this verification cannot prove. */
  readonly cannotProve: readonly string[];
}

const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);

interface CommitView {
  readonly sha: Sha;
  readonly files: Map<string, Uint8Array>;
  readonly lines: string[];
  readonly checkpoint: Checkpoint | null;
}

export interface VerifyOptions {
  readonly ref?: string;
  /** Replay recorded policy decisions with the policy package. Default true. */
  readonly replayDecisions?: boolean;
}

export async function verifyLog(reader: GitReader, opts: VerifyOptions = {}): Promise<VerifyReport> {
  const ref = opts.ref ?? LOG_REF;
  const failures: VerifyFailure[] = [];
  const fail = (f: VerifyFailure) => failures.push(f);
  const head = await reader.readRef(ref);
  const cannotProve = [
    "Whether any act was admitted after the last published entry: unpublished acts cannot be proven to exist or not to exist.",
    "Lanes, leases, obligations and landings (R-LOG-15): verify checks each act's authority and replays every policy decision, but does not re-derive lane, lease, obligation or landing transitions, or the effects in receipts.",
    "The room clock: expiry checks use each entry's recorded `at`, which only the room key vouches for.",
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
    cannotProve,
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

  const views: CommitView[] = [];
  for (const sha of chain) {
    const files = await readLogFiles(reader, sha);
    const lines: string[] = [];
    for (let first = 0; files.has(segmentPath(first)); first += SEGMENT_SIZE) {
      const seg = segmentLines(files.get(segmentPath(first))!);
      lines.push(...seg);
      if (seg.length !== SEGMENT_SIZE && files.has(segmentPath(first + SEGMENT_SIZE)))
        fail({ reason: "malformed", commit: sha, detail: `segment ${first} is not full but a later one exists` });
    }
    const cpBytes = files.get(`${ROOT}/checkpoint.json`);
    let checkpoint: Checkpoint | null = null;
    try {
      checkpoint = cpBytes ? decodeCheckpoint(cpBytes) : null;
    } catch (e) {
      fail({ reason: "malformed", commit: sha, detail: (e as Error).message });
    }
    if (!checkpoint && !cpBytes) fail({ reason: "checkpoint-missing", commit: sha, detail: "the commit has no checkpoint.json" });
    views.push({ sha, files, lines, checkpoint });
  }

  // Each commit extends the previous one: earlier lines and full segments unchanged (R-LOG-9).
  // The entries verified are those of the last commit before the first break.
  let basis = 0;
  for (let i = 1; i < views.length; i++) {
    const v = views[i]!;
    const prev = views[i - 1]!;
    let ok = true;
    for (let n = 0; n < prev.lines.length; n++)
      if (v.lines[n] !== prev.lines[n]) {
        fail({ reason: "history-rewritten", commit: v.sha, seq: n, detail: `entry ${n} differs from the earlier log commit ${prev.sha}` });
        ok = false;
        break;
      }
    for (let first = 0; prev.files.has(segmentPath(first + SEGMENT_SIZE)); first += SEGMENT_SIZE) {
      const a = prev.files.get(segmentPath(first))!;
      const b = v.files.get(segmentPath(first));
      if (!b || a.length !== b.length || a.some((x, j) => x !== b[j])) {
        fail({ reason: "segment-changed", commit: v.sha, detail: `full segment ${first} changed after ${prev.sha}` });
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
  type Decoded = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly detail: string };
  const decodings = new Map<`${Contract} ${Digest}`, Decoded>();
  /** `bytes`, named by `digest`, decoded under `contract`; once per contract and digest. */
  const decodeAs = (contract: Contract, digest: Digest, bytes: Uint8Array): Decoded => {
    const key = `${contract} ${digest}` as const;
    let d = decodings.get(key);
    if (!d) {
      try {
        d = { ok: true, value: contract === "input" ? decodeRetained("input", bytes) : contract === "json" ? decodeRetained("json", bytes) : contract === "policy" ? decodeRetained("policy", bytes) : decodeRetained("checker", bytes) };
      } catch (e) {
        d = { ok: false, detail: (e as Error).message };
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
        fail({ reason: "retained-digest", commit: v.sha, detail: `${path} does not match its digest` });
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
    | { readonly ok: false; readonly reason: VerifyReason; readonly detail: string } => {
    const path = contract === "input" ? inputPath(digest) : policyPath(digest);
    const what = contract === "input" ? "the replay context" : contract === "policy" ? "policy" : "checker configuration";
    if (!holds(top, path)) return { ok: false, reason: missing, detail: `${what} ${digest} is not published` };
    const d = decodeAs(contract, digest, top.files.get(path)!);
    return d.ok ? d : { ok: false, reason: "malformed", detail: `${path}: ${d.detail}` };
  };

  // -------------------------------------------------------------- entries
  const roster = new RosterReplay(genesis);
  let operator: KeyId | null = null;
  const idem = new Map<string, Seq>();
  const notified = new Set<string>();
  /** Each activated version: its document, and its checker configurations' digests by checker name (R-POL-9). */
  const policyByVersion = new Map<PolicyVersion, { doc: PolicyDocument; digest: Digest; checkers: ReadonlyMap<string, Digest> }>();
  let activePolicy: PolicyVersion | null = null;
  /** The policy in force when each entry was admitted, by seq. */
  const policyAt: (PolicyVersion | null)[] = [];
  let decisionsReplayed = 0;
  const checkpointsByCommit = new Map(views.slice(0, basis + 1).map((v) => [v.sha, v.checkpoint] as const));

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
        fail({ seq, reason: context.reason, detail: context.detail });
        return false;
      }
      needs.push({ seq, path: inputPath(digest), reason: "input-missing" });
      const policy = policyByVersion.get(version!)!;
      let replayed: readonly Decision[];
      try {
        const result = await replay({ doc: policy.doc, version: version! }, context.value as ReplayContext);
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

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const bad = (reason: VerifyReason, detail: string) => {
      fail({ reason, seq: i, detail });
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
        if (!doc.ok) {
          bad(doc.reason, doc.detail);
          break;
        }
        // Every checker configuration it names is published, and is one (R-POL-9, R-LOG-9).
        const missing = ev.checkers.map((c) => ({ c, r: lookup("checker", c.config, "checker-missing") })).find((x) => !x.r.ok);
        if (missing && !missing.r.ok) {
          bad(missing.r.reason, `checker ${missing.c.name}: ${missing.r.detail}`);
          break;
        }
        needs.push({ seq: i, path: policyPath(ev.policy), reason: "policy-missing" });
        for (const c of ev.checkers) needs.push({ seq: i, path: policyPath(c.config), reason: "checker-missing" });
        policyByVersion.set(id, { doc: doc.value as PolicyDocument, digest: ev.policy, checkers: new Map(ev.checkers.map((c) => [c.name, c.config])) });
        activePolicy = id;
      } else if (ev.type === "obligations-recomputed") {
        if (ev.policy !== activePolicy) {
          bad("policy-version-mismatch", `obligations-recomputed names policy ${ev.policy}; the active policy is ${activePolicy ?? "none"}`);
          break;
        }
        if (!(await replayDecisions(i, ev.decisions, ev.policy, "the policy it was recomputed under"))) {
          firstBad = Math.min(firstBad, i);
          break;
        }
      } else if (ev.type === "land-evaluated") {
        if (!(await replayDecisions(i, ev.decisions, activePolicy, "the active policy"))) {
          firstBad = Math.min(firstBad, i);
          break;
        }
      } else if (ev.type === "check-carried") {
        // R-CARRY-13: `act` is an earlier accepted check of the same lane and obligation.
        const m = /^act_(0|[1-9][0-9]*)_([0-9a-f]{8})$/.exec(ev.act);
        const check = m ? entries[Number(m[1])] : undefined;
        if (!m || !check || check.seq >= i || check.hash.slice(7, 15) !== m[2] || check.entry.type !== "act" || check.entry.act.envelope.kind !== "check") {
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
        if (!(await replayDecisions(i, ev.decisions, ev.policy, "the policy the check-carried event names"))) {
          firstBad = Math.min(firstBad, i);
          break;
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
        if (!(await replayDecisions(i, ev.decisions, policyAt[target.seq] ?? null, `the policy pinned when ${ev.entry} was admitted`))) {
          firstBad = Math.min(firstBad, i);
          break;
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
    const judged = roster.judge(env, checkedTime(e.at, "at"));
    if (!judged.ok) {
      bad(judged.reason, judged.detail);
      break;
    }
    if (!same(judged.authority, body.receipt.authority)) {
      bad("authority-mismatch", `recorded ${canonicalize(body.receipt.authority)}, replayed ${canonicalize(judged.authority)}`);
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
    if (body.type === "act" && env.kind === "check") {
      // R-OBL-3: an accepted check names its checker's configuration digest in the active version.
      const { check, config } = env.body as CheckBody;
      const expected = activePolicy === null ? undefined : policyByVersion.get(activePolicy)!.checkers.get(check);
      if (config !== expected) {
        bad("check-config-mismatch", `the check names config ${config} for ${check}; the active policy ${activePolicy ?? "none"} names ${expected ?? "no such checker"}`);
        break;
      }
    }
    if (body.type === "act" && body.receipt.effects.some((x) => x.type === "opened" && "lane" in x)) {
      bad("self-reference", "an opened effect names its own lane");
      break;
    }
    if (!(await replayDecisions(i, body.receipt.decisions, activePolicy, "the active policy"))) {
      firstBad = Math.min(firstBad, i);
      break;
    }
    if (body.type === "act") roster.apply(env, id, judged.authority);
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
    ok: failures.length === 0,
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
    cannotProve,
  };
}
