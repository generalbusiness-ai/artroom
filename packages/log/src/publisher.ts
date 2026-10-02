/**
 * Publication of the log (R-LOG-8, R-LOG-11). The Room calls
 * `publish(entries, checkpoint, retained)`; the publisher builds one log
 * commit whose parent is the previous log commit, pushes it to
 * `refs/artroom/log` with a lease on that parent, reads the ref back, and
 * returns the commit for the Room's `checkpoint` event.
 *
 * Published history is never rewritten:
 * - an entry already published must be byte-identical in every later call;
 * - the push is fast-forward only, under a lease, and never forced;
 * - after any answer but a lease refusal, the publisher reads the ref back
 *   and either confirms, retries the same commit, stops on a refusal, or
 *   stops on an unexpected writer (R-LOG-20).
 *
 * The checkpoint names the commit's layout (R-LOG-16). Layout 1 is R-LOG-9
 * as first written. Layout 2 (contract amendment 4) closes a segment at the
 * object bound B as well as at 1,000 entries, chunks any file over B, and
 * fans out every directory (R-LOG-17 to R-LOG-19, `layout.ts`); every object
 * it would write is checked against B before anything is sent.
 *
 * Memory is bounded (request 5a7290b9). The entries come from an
 * `EntrySource` in batches (`READ_LIMITS`); a segment blob is never held
 * whole. Its size is counted first, then its ID is hashed, then its bytes
 * are read again for each staged part. A large line or retained file may be
 * given in parts (`EntryLine`, `RetainedRef.read`), and is then hashed and
 * sent in parts. Closed segments, files and shard directories of the parent
 * are reused by ID and not read. Trees, the checkpoint and the commit are
 * small and built in memory.
 */

import type { Checkpoint, Digest, LogEntry, LogLayout, Seq, Sha } from "@generalbusiness/artroom-contract";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalize, parseStrict, utf8 } from "./canonical.ts";
import { hex, verifySig } from "./crypto.ts";
import { parseTime } from "./time.ts";
import { Malformed, decodeCheckpoint, decodeLayout } from "./decode.ts";
import { LOG_REF, ROOT, SEGMENT_SIZE, type Retained } from "./entries.ts";
import { CHUNKS, OBJECT_BOUND, Placement, chunkedLine, eachChunk, fanTrees, isChunked, placedBytes, twelve, type Leaf } from "./layout.ts";
import { SETS, walkSet, type ListTree, type SetName } from "./tree.ts";
import { encodeCommit, encodeTree, gitObject, parseCommit, parseTree, type GitObject, type GitReader, type GitRemote, type ObjectType, type StageOutcome, type StagePart, type StageWant, type TreeEntry } from "./git.ts";

export { readLogFiles, readPublishedEntries } from "./tree.ts";

export type PublishErrorCode =
  /** The call would change an entry already published. Nothing was pushed. */
  | "would-rewrite"
  /** The entries or checkpoint are malformed: wrong order, wrong `through`, bad signature, a layout that does not follow the parent's, or a source that changed while it was read. */
  | "invalid-input"
  /** The ref holds a commit this publisher did not write. It stops; `current` names the commit, so the Room can match it against its own. */
  | "unexpected-writer"
  /** Retries ran out with no clear answer. Call `publish` again with the same input: it completes forward. */
  | "unresolved"
  /**
   * The objects this publication adds exceed one transfer
   * (`PublisherOptions.maxTransfer`) and the remote cannot stage them
   * (`GitRemote.stage`). Nothing was pushed. A remote that stages never
   * gives this error.
   */
  | "cohort-too-large"
  /**
   * Layout 2: an object the commit would write is over the object bound B
   * (R-LOG-19), which means a fault in the publisher. Nothing was stored or
   * pushed. Not retryable.
   */
  | "object-too-large"
  /**
   * The remote refused the push, and the ref reads back at the lease
   * (R-LOG-20). The commit is not pushed again. Not retryable: `refusal`
   * gives the remote's code and answer. An earlier attempt whose answer was
   * lost may still apply, so the commit stays outstanding.
   */
  | "refused";

export class PublishError extends Error {
  override readonly name = "PublishError";
  readonly code: PublishErrorCode;
  readonly retryable: boolean;
  /** `unexpected-writer`: the commit the ref holds (null: no ref). */
  readonly current?: Sha | null;
  /** `refused`: what the remote answered. */
  readonly refusal?: { readonly code: string; readonly detail: string };
  constructor(code: PublishErrorCode, message: string, extra: { readonly current?: Sha | null; readonly refusal?: { readonly code: string; readonly detail: string } } = {}) {
    super(message);
    this.code = code;
    this.retryable = code === "unresolved";
    if (extra.current !== undefined) this.current = extra.current;
    if (extra.refusal !== undefined) this.refusal = extra.refusal;
  }
}

export interface PublishResult {
  /** The new log commit. The Room records it in a `checkpoint` event (R-LOG-8 step 5). */
  readonly commit: Sha;
  readonly through: Seq;
  readonly hash: Digest;
  readonly publishedThrough: Seq;
  /** Push attempts this call made. */
  readonly attempts: number;
}

export interface PublisherOptions {
  readonly ref?: string;
  /** Attempts per call before `unresolved`. Default 5. */
  readonly attempts?: number;
  /** Waits between attempts. Default: none (tests); the Room passes a backoff. */
  readonly sleep?: (attempt: number) => Promise<void>;
  /** The most one push may send. Default `LOG_TRANSFER_LIMITS`, the publisher sandbox's bound (lane B, `LOG_PUSH_LIMITS`). */
  readonly maxTransfer?: { readonly objects: number; readonly bytes: number };
  /** How much is read from an `EntrySource` at a time, and the largest part read of one line or file. Default `READ_LIMITS`. */
  readonly read?: { readonly entries: number; readonly bytes: number };
}

/**
 * One transfer's bound: objects and decoded bytes, the same as the
 * publisher sandbox's (lane B, `LOG_PUSH_LIMITS`). A publication over it is
 * staged in parts. 8 MiB is about 11 MiB as base64url. Measured live
 * (2026-10-01): parts of 6, 8 and 12 MiB crossed the Durable Object RPC;
 * 16 MiB parts exhausted a Durable Object's 128 MB memory.
 */
export const LOG_TRANSFER_LIMITS = { objects: 100_000, bytes: 8 * 1024 * 1024 } as const;

/**
 * How much the publisher reads from an `EntrySource` at once. The first
 * read of a segment, which measures each line, takes one entry at a time.
 * Later reads take at most `entries` entries and at most `bytes` of them,
 * by the measured lengths, and always at least one entry. A line or file
 * given in parts is read at most `bytes` at a time.
 */
export const READ_LIMITS = { entries: 64, bytes: 1024 * 1024 } as const;

/**
 * An entry's canonical line as bytes, read in parts. An `EntrySource` may
 * return one in place of the entry, so that a large entry is never held
 * whole: the publisher hashes it and sends it part by part (R-LOG-18).
 */
export interface EntryLine {
  readonly seq: Seq;
  /** The line's length in bytes (UTF-8). */
  readonly bytes: number;
  /** Bytes `offset` to `offset + length` of the line. */
  read(offset: number, length: number): Uint8Array;
}

/**
 * A log's entries, read in batches (the Room reads them from its SQLite).
 * Every call returns the same entries for the same seqs: sealed entries are
 * never rewritten (R-LOG-2). The publisher checks the order and length of
 * what it reads, and fails with `invalid-input` if a second read differs
 * in length from the first.
 */
export interface EntrySource {
  /** The last entry's seq: the checkpoint's `through`. */
  readonly through: Seq;
  /** At most `limit` entries from seq `from`, in seq order; any of them may be an `EntryLine`. */
  read(from: Seq, limit: number): readonly (LogEntry | EntryLine)[];
}

/**
 * A retained file named by its digest (R-LOG-7). Its body is read only when
 * the commit needs its bytes: when the parent does not already hold it. With
 * `bytes` and `read`, it is read in parts and never loaded whole.
 */
export interface RetainedRef {
  readonly kind: Retained["kind"];
  /** `sha256:` and the hex SHA-256 of the body, which names the file. */
  readonly digest: Digest;
  readonly load: () => string;
  /** The body's length in bytes (UTF-8), with `read`. */
  readonly bytes?: number;
  /** Bytes `offset` to `offset + length` of the body. */
  readonly read?: (offset: number, length: number) => Uint8Array;
}

/**
 * What the publisher held in memory, in bytes, since it was made or since
 * `resetStats`. These are the buffers of its own code: the JavaScript
 * objects an `EntrySource` returns and the strings made from them are not
 * counted.
 */
export interface PublicationStats {
  /** The most canonical entry bytes read in one batch, or in one part of a line or file read in parts. */
  peakBatchBytes: number;
  /** The most bytes sent in one call: one stage call's parts, or one push's objects. */
  peakSendBytes: number;
  /** The largest object built whole: a tree, the commit, the checkpoint, the genesis, a retained file loaded whole. */
  peakObjectBytes: number;
  /** The largest segment blob, which is never built whole. */
  largestSegment: number;
  /** Segment bytes hashed (twice when a published prefix is checked). */
  hashedBytes: number;
  /** Segment bytes read again to stage or push them. */
  sentSegmentBytes: number;
  /** Trees encoded. A tree reused from the parent by ID is not. */
  treesBuilt: number;
}

const freshStats = (): PublicationStats => ({ peakBatchBytes: 0, peakSendBytes: 0, peakObjectBytes: 0, largestSegment: 0, hashedBytes: 0, sentSegmentBytes: 0, treesBuilt: 0 });

/** Seconds since the epoch for an RFC 3339 time, for the commit's author line. */
function epoch(at: string): number {
  const ms = parseTime(at);
  if (ms === null) throw new PublishError("invalid-input", `checkpoint time ${at} is not RFC 3339`);
  return Math.floor(ms / 1000);
}

/** The commit's identity line. Fixed, so the same input always gives the same commit. */
function identity(at: string): string {
  return `Artroom Room <room@artroom.invalid> ${epoch(at)} +0000`;
}

/** Canonical lines by seq, read in batches: text, or an `EntryLine` read in parts. */
interface Lines {
  readonly through: Seq;
  read(from: Seq, limit: number): readonly (string | EntryLine)[];
}

/** A line as the publisher reads it: its bytes, or a reader of its parts. */
type Line = Uint8Array | EntryLine;
const sizeOf = (l: Line): number => (l instanceof Uint8Array ? l.length : l.bytes);
const isEntryLine = (x: unknown): x is EntryLine => typeof x === "object" && x !== null && typeof (x as EntryLine).read === "function";

/** A retained file the caller passed: its bytes, or a reference to load them. */
type RetainedIn = { readonly kind: Retained["kind"]; readonly body: string } | RetainedRef;

/**
 * One publication, owned by the publisher. Arrays are copied from the
 * caller's arguments synchronously, before the first await, so nothing the
 * caller does to its arrays or objects during the push or the read-back can
 * reach the commit or the publisher's state. An `EntrySource` is read
 * through its `read`, which returns sealed entries that never change.
 */
interface Cohort {
  readonly lines: Lines;
  readonly through: Seq;
  readonly hash: Digest;
  /** The checkpoint's canonical text. */
  readonly checkpoint: string;
  readonly at: string;
  /** The layout the checkpoint names; undefined for layout 1 (R-LOG-16). */
  readonly layout: LogLayout | undefined;
  readonly retained: readonly RetainedIn[];
}

/** What a tree lists for a file: a blob, or (layout 2, over B) a directory of chunks. */
interface Node {
  readonly mode: TreeEntry["mode"];
  readonly sha: Sha;
}

/**
 * What a log commit holds, by ID: enough to build its child without
 * reading its closed segments, files or shard directories again.
 */
interface Index {
  readonly through: Seq;
  readonly hash: Digest | null;
  readonly layout: LogLayout | undefined;
  readonly genesis: Node | null;
  /** Each segment's first seq and blob, in order. */
  readonly segments: readonly { readonly first: Seq; readonly sha: Sha }[];
  /** Layout 2: each chunked entry file, by its name in `entries/`. */
  readonly entries: ReadonlyMap<string, Node>;
  /** Every retained file, by its logical path (`artroom-log/v1/inputs/<hex>.json`). */
  readonly retained: ReadonlyMap<string, Node>;
  /** Every tree of the four directory sets, by path below `artroom-log/v1/` (`segments`, `segments/000`, ...). */
  readonly trees: ReadonlyMap<string, Sha>;
  /** Every tree and blob of the commit's tree that the index knows by ID: the remote holds them. */
  readonly present: ReadonlySet<string>;
}

const EMPTY: Index = { through: -1, hash: null, layout: undefined, genesis: null, segments: [], entries: new Map(), retained: new Map(), trees: new Map(), present: new Set() };

/** How to produce an object's bytes when they are sent. */
type Body =
  | { readonly kind: "bytes"; readonly data: Uint8Array }
  /**
   * A segment: `lens` are the lines' lengths, as exact numbers (a line given in parts may be 4 GiB
   * or more, so never a 32-bit array); `stubs` the `ChunkedLine` that stands for each chunked one, by index.
   */
  | { readonly kind: "segment"; readonly first: Seq; readonly count: number; readonly lens: Float64Array; readonly stubs: ReadonlyMap<number, Uint8Array> }
  /** A file, or one chunk of it, read again from its source. */
  | { readonly kind: "range"; readonly read: (offset: number, length: number) => Uint8Array };

interface Planned {
  readonly sha: Sha;
  readonly type: ObjectType;
  readonly size: number;
  readonly body: Body;
}

interface Plan {
  readonly commit: GitObject;
  /** The objects the parent's tree does not hold, the commit last. */
  readonly send: readonly Planned[];
  /** The new commit's index, kept once it is confirmed. */
  readonly index: Index;
}

type Reader = (offset: number, length: number) => Uint8Array;

const NL = new Uint8Array([0x0a]);

export class LogPublisher {
  readonly remote: GitRemote;
  readonly ref: string;
  private readonly attempts: number;
  private readonly sleep: (attempt: number) => Promise<void>;
  private readonly maxTransfer: { readonly objects: number; readonly bytes: number };
  private readonly readLimits: { readonly entries: number; readonly bytes: number };
  private lastCommit: Sha | null = null;
  /** `lastCommit`'s index; `EMPTY` before the first publication. */
  private index: Index = EMPTY;
  /** The size of each blob this publisher has hashed, by ID: so the switch to layout 2 knows which kept files are over B. */
  private readonly sizes = new Map<string, number>();
  private counters: PublicationStats = freshStats();

  constructor(remote: GitRemote, opts: PublisherOptions = {}) {
    this.remote = remote;
    this.ref = opts.ref ?? LOG_REF;
    this.attempts = opts.attempts ?? 5;
    this.sleep = opts.sleep ?? (async () => {});
    this.maxTransfer = opts.maxTransfer ?? LOG_TRANSFER_LIMITS;
    const read = opts.read ?? READ_LIMITS;
    this.readLimits = { entries: Math.max(1, read.entries), bytes: Math.max(1, read.bytes) };
  }

  /**
   * Resume from a log commit: read its trees and checkpoint, not its
   * segments or files. By default the commit is the ref's; `head` names
   * another commit the caller wrote, such as an outstanding commit that the
   * ref reads back at late, to build on it (R-LOG-20), or null for none. A
   * head that is not a log commit is `unexpected-writer`.
   */
  static async open(remote: GitRemote, opts: PublisherOptions = {}, head?: Sha | null): Promise<LogPublisher> {
    const p = new LogPublisher(remote, opts);
    const at = head === undefined ? await remote.readRef(p.ref) : head;
    if (at) {
      p.index = await readIndex(remote, at);
      p.lastCommit = at;
    }
    return p;
  }

  /** The last entry published, or -1 before the first publication (R-LOG-11). */
  get publishedThrough(): Seq {
    return this.index.through;
  }

  get head(): Sha | null {
    return this.lastCommit;
  }

  /** What this publisher has held in memory (see `PublicationStats`). */
  get stats(): Readonly<PublicationStats> {
    return { ...this.counters };
  }

  resetStats(): void {
    this.counters = freshStats();
  }

  /** The publication lag for a room whose head is `head` (R-LOG-11). */
  lag(head: Seq): number {
    return head - this.publishedThrough;
  }

  /**
   * Publish `entries` (the whole log from seq 0 through the checkpoint, as
   * an array or an `EntrySource`) and the retained replay contexts and
   * policies. Retained files of earlier publications are kept, so
   * `retained` needs to list only new ones. Returns once the ref has been
   * read back at the new commit.
   */
  async publish(
    entries: readonly LogEntry[] | EntrySource,
    checkpoint: Checkpoint,
    retained: readonly (Retained | RetainedRef)[] = [],
  ): Promise<PublishResult> {
    // Synchronous, before any await: the cohort is owned and the commit is fixed.
    const cohort = this.own(entries, checkpoint, retained);
    const lease = this.lastCommit;
    const plan = this.plan(lease, cohort, this.index, true);
    if (cohort.through === this.publishedThrough && lease)
      return { commit: lease, through: cohort.through, hash: cohort.hash, publishedThrough: cohort.through, attempts: 0 };

    const { commit, send } = plan;
    const bytes = send.reduce((n, o) => n + o.size, 0);
    // Over one transfer: stage the objects in bounded parts first (chunks of any object larger than
    // one transfer), then push the commit alone. Only a remote that cannot stage refuses the cohort.
    const staged = send.length > this.maxTransfer.objects || bytes > this.maxTransfer.bytes;
    if (staged && !this.remote.stage)
      throw new PublishError(
        "cohort-too-large",
        `this publication adds ${send.length} objects, ${bytes} bytes; one push carries at most ${this.maxTransfer.objects} objects, ${this.maxTransfer.bytes} bytes, and this remote cannot stage. Nothing was pushed`,
      );

    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      if (attempt > 1) await this.sleep(attempt);
      // Staging is asked again before every attempt: a restart may have lost it.
      if (staged && !(await this.stageAll(commit.sha, cohort.lines, send))) continue;
      const outcome = await this.remote.push(staged ? [] : this.materialize(cohort.lines, send), this.ref, commit.sha, lease);
      if (!outcome.ok && outcome.reason === "lease-mismatch") {
        if (outcome.current === commit.sha) return this.done(cohort, plan, attempt);
        throw this.unexpected(outcome.current, `not the lease ${lease ?? "nothing"}`);
      }
      // Read back: the only proof of where the ref is (R-LOG-8 step 5, R-LOG-20).
      const now = await this.remote.readRef(this.ref);
      if (now === commit.sha) return this.done(cohort, plan, attempt);
      if (now !== lease) throw this.unexpected(now, "which this publisher did not write");
      if (!outcome.ok && outcome.reason === "refused")
        throw new PublishError("refused", `the remote refused ${commit.sha} (${outcome.code}) and ${this.ref} is still at the lease; it is not pushed again: ${outcome.detail}`, {
          refusal: { code: outcome.code, detail: outcome.detail },
        });
      // Not applied, and not refused: push the same commit again.
    }
    throw new PublishError("unresolved", `no clear answer after ${this.attempts} attempts; publish again with the same entries`);
  }

  /**
   * The exact commit `publish` writes for this cohort on top of `parent`,
   * without pushing: the same owned copy and the same git serialization.
   * Synchronous and deterministic. The Room stores it before any remote
   * write (lane A, `PublisherPort.commitFor`).
   *
   * `publish` keeps the retained files of the commit it last wrote, and
   * reuses its closed segments. So when `parent` is that commit, both are
   * used here too, and an entry that differs from the published one is
   * `would-rewrite`. For any other parent, every segment is placed and
   * built from `entries` and the checkpoint's layout, and only `retained`
   * is used. A Room that passes every retained file it holds gets the same
   * commit either way.
   */
  commitFor(
    parent: Sha | null,
    entries: readonly LogEntry[] | EntrySource,
    checkpoint: Checkpoint,
    retained: readonly (Retained | RetainedRef)[],
  ): Sha {
    const cohort = this.own(entries, checkpoint, retained);
    const same = parent === this.lastCommit;
    return this.plan(parent, cohort, same ? this.index : EMPTY, same).commit.sha;
  }

  /** Copy and check the caller's arguments. Synchronous. */
  private own(entries: readonly LogEntry[] | EntrySource, checkpoint: Checkpoint, retained: readonly (Retained | RetainedRef)[]): Cohort {
    const lines = Array.isArray(entries) ? ownedLines(entries as readonly LogEntry[]) : this.sourceLines(entries as EntrySource);
    if (lines.through < 0) throw new PublishError("invalid-input", "there are no entries to publish");
    const last = this.facts(lines.read(lines.through, 1)[0]);
    const text = canonicalize(checkpoint);
    const cp = parseStrict(text) as Checkpoint;
    if (cp.through !== last.seq || cp.hash !== last.hash)
      throw new PublishError("invalid-input", `the checkpoint names ${cp.through} ${cp.hash}, not the last entry`);
    let layout: LogLayout | undefined;
    try {
      layout = cp.layout === undefined ? undefined : decodeLayout(cp.layout, "checkpoint.layout");
    } catch (e) {
      if (e instanceof Malformed) throw new PublishError("invalid-input", e.message);
      throw e;
    }
    const { sig, ...unsigned } = cp;
    if (!verifySig(cp.roomKey, sig, "artroom-checkpoint-v1", unsigned))
      throw new PublishError("invalid-input", "the checkpoint's signature is not valid");
    const files: RetainedIn[] = retained.map((r) => {
      if ("body" in r) return { kind: r.kind, body: r.body };
      if ((r.read !== undefined || r.bytes !== undefined) && (typeof r.read !== "function" || !Number.isSafeInteger(r.bytes) || r.bytes! < 0))
        throw new PublishError("invalid-input", `retained file ${r.digest} is given in parts of ${String(r.bytes)} bytes, which is not a length`);
      return { ...r };
    });
    return { lines, through: last.seq, hash: last.hash, checkpoint: text, at: cp.at, layout, retained: files };
  }

  /** Lines read from a source, each checked for its seq, in batches. */
  private sourceLines(source: EntrySource): Lines {
    const through = source.through;
    if (!Number.isSafeInteger(through) || through < -1) throw new PublishError("invalid-input", `the source's last seq ${String(through)} is not a seq`);
    return {
      through,
      read: (from, limit) => {
        const n = Math.min(limit, through - from + 1);
        if (n <= 0) return [];
        const got = source.read(from, n);
        if (got.length !== n) throw new PublishError("invalid-input", `the source gave ${got.length} entries from ${from}, not ${n}`);
        return got.map((e, i) => {
          if (isEntryLine(e)) {
            if (e.seq !== from + i || !Number.isSafeInteger(e.bytes) || e.bytes < 0) throw new PublishError("invalid-input", `the line read for entry ${from + i} is for ${e.seq}, of ${e.bytes} bytes`);
            return e;
          }
          const line = canonicalize(e);
          const seq = (parseStrict(line) as LogEntry).seq;
          if (seq !== from + i) throw new PublishError("invalid-input", `entry ${from + i} has seq ${seq}`);
          return line;
        });
      },
    };
  }

  /** An entry's seq and hash: parsed from its line, or read from the fixed end of a line given in parts. */
  private facts(x: string | EntryLine | undefined): { readonly seq: Seq; readonly hash: Digest } {
    if (x === undefined) throw new PublishError("invalid-input", "an entry is missing");
    if (typeof x === "string") {
      const e = parseStrict(x) as LogEntry;
      return { seq: e.seq, hash: e.hash };
    }
    const n = Math.min(x.bytes, 512);
    const m = TAIL.exec(lenient.decode(this.part(x, x.bytes - n, n)));
    if (!m || Number(m[2]) !== x.seq) throw new PublishError("invalid-input", `the line given for entry ${x.seq} does not end as a canonical entry`);
    return { seq: x.seq, hash: m[1] as Digest };
  }

  /**
   * R-LOG-16: a log's first commit has `from` 0; a commit after a layout 2
   * commit is layout 2 with the same `from`; the first layout 2 commit after
   * layout 1 has the parent's `through` plus one. For a parent other than
   * the publisher's own, its layout is not known here.
   */
  private checkLayout(parent: Sha | null, c: Cohort, base: Index, kept: boolean): void {
    const lay = c.layout;
    if (parent === null) {
      if (lay && lay.from !== 0) throw new PublishError("invalid-input", `layout-changed: the first log commit has from 0, not ${lay.from}`);
      return;
    }
    if (!kept) return;
    if (base.layout && (!lay || lay.from !== base.layout.from))
      throw new PublishError("invalid-input", `layout-changed: the parent is layout 2 from ${base.layout.from}, so this commit must be too, not ${lay ? `from ${lay.from}` : "layout 1"}`);
    if (!base.layout && lay && lay.from !== base.through + 1)
      throw new PublishError("invalid-input", `layout-changed: the first layout 2 commit has from ${base.through + 1}, one past its parent's through, not ${lay.from}`);
  }

  /**
   * The one git serialization of a cohort on `parent`, in the layout its
   * checkpoint names, built from the parent's index and the lines that are
   * new. `kept` adds the parent's retained files, as `publish` does.
   * Synchronous.
   *
   * Checks against the parent, when it has entries: the cohort is not
   * shorter; its entry at the parent's checkpoint has the checkpoint's
   * hash; and the published part of the parent's last segment is the same
   * bytes, by ID. A closed segment never changes, so it is reused by ID.
   * In layout 2, every object to be written is checked against B.
   */
  private plan(parent: Sha | null, c: Cohort, base: Index, kept: boolean): Plan {
    const lay = c.layout;
    this.checkLayout(parent, c, base, kept);
    if (c.through < base.through) throw new PublishError("would-rewrite", `the cohort ends at ${c.through}, before the published entry ${base.through}; published history is never rewritten`);
    if (base.through >= 0 && this.facts(c.lines.read(base.through, 1)[0]).hash !== base.hash)
      throw new PublishError("would-rewrite", `entry ${base.through} differs from the published entry; published history is never rewritten`);
    /** The parent's files and trees have this commit's shape: the same layout. */
    const same = base.layout?.version === lay?.version;

    const objects = new Map<string, Planned>();
    const add = (p: Planned): Sha => {
      if (!objects.has(p.sha)) objects.set(p.sha, p);
      return p.sha;
    };
    const small = (type: ObjectType, data: Uint8Array): Sha => {
      this.counters.peakObjectBytes = Math.max(this.counters.peakObjectBytes, data.length);
      const o = gitObject(type, data);
      return add({ sha: o.sha, type, size: data.length, body: { kind: "bytes", data } });
    };
    const inMemory = (data: Uint8Array): Reader => {
      this.counters.peakObjectBytes = Math.max(this.counters.peakObjectBytes, data.length);
      return (o, l) => data.subarray(o, o + l);
    };

    // The genesis, from entry 0 (R-LOG-9); chunked if over B (R-LOG-18).
    let genesis = same ? base.genesis : null;
    if (!genesis) {
      const g = this.genesisBytes(c.lines);
      genesis = this.file(g.length, inMemory(g), inMemory(g), lay, add, base).node;
    }

    // Segments (R-LOG-17): closed segments of the parent are reused; the parent's open one is read
    // again and checked, and every new one is placed, entry by entry, by the layout's rule.
    const segments: { first: Seq; sha: Sha }[] = [];
    const entries = new Map<string, Node>(kept ? base.entries : []);
    const open = base.segments.at(-1);
    let start = 0;
    let published: { readonly count: number; readonly sha: Sha } | null = null;
    if (open) {
      segments.push(...base.segments.slice(0, -1));
      const count = base.through - open.first + 1;
      if (count === SEGMENT_SIZE) {
        segments.push(open); // closed by count in either layout
        start = base.through + 1;
      } else {
        start = open.first;
        published = { count, sha: open.sha };
      }
    }
    // An entry over B from `from` on: its line is the chunked file entries/<seq>.jsonl, and a ChunkedLine stands for it (R-LOG-18).
    const entryFile = (seq: Seq, line: Line): Uint8Array => {
      const size = sizeOf(line);
      const read: Reader = line instanceof Uint8Array ? (o, l) => line.subarray(o, o + l) : (o, l) => this.part(line, o, l);
      const f = this.file(size, read, (o, l) => this.lineRange(c.lines, seq, size, o, l), lay, add, base);
      entries.set(`${twelve(seq)}.jsonl`, f.node);
      return utf8(chunkedLine(seq, size, `sha256:${f.digest}`));
    };
    const placer = new Placement(lay);
    let first = start;
    let lens: number[] = [];
    const close = () => {
      segments.push({ first, sha: add(this.segment(c.lines, first, Float64Array.from(lens), lay, first === start ? published : null, entryFile)) });
    };
    for (let seq = start; seq <= c.through; seq++) {
      const size = sizeOf(this.batch(c.lines, seq, 0, 1)[0]!);
      if (placer.place(seq, size) && seq > first) {
        close();
        first = seq;
        lens = [];
      }
      lens.push(size);
    }
    if (lens.length) close();

    // Retained files: the parent's (when kept) and the given ones, by path. A file the parent
    // holds is not read; any other is read here to hash it, and again when it is sent.
    const files = new Map<string, Node>(kept ? base.retained : []);
    const rebuilt = new Set<string>();
    /** Whether a kept file of the parent keeps its tree entry: always in the same layout; at the switch to layout 2, a blob known to be at most B. */
    const keeps = (n: Node) => same || (n.mode === "100644" && (this.sizes.get(n.sha) ?? Infinity) <= OBJECT_BOUND);
    for (const r of c.retained) {
      if (!("body" in r)) {
        const named = digestPath(r.kind, r.digest);
        const held = named === null ? undefined : base.retained.get(named);
        if (held !== undefined && keeps(held)) {
          files.set(named!, held);
          continue;
        }
      }
      let f: { readonly node: Node; readonly digest: string };
      if ("body" in r) {
        const data = utf8(r.body);
        const read = inMemory(data);
        f = this.file(data.length, read, read, lay, add, base);
      } else f = this.retainedFile(r, lay, add, base);
      const path = `${ROOT}/${r.kind === "input" ? "inputs" : "policies"}/${f.digest}.json`;
      files.set(path, f.node);
      rebuilt.add(path);
    }
    // At the switch to layout 2, every kept file over B is chunked (R-LOG-19): one whose size is not known must be given.
    if (kept && lay && !base.layout)
      for (const [path, n] of base.retained)
        if (!rebuilt.has(path) && !keeps(n))
          throw new PublishError("invalid-input", `the switch to layout 2 needs the retained file ${path}, which the parent holds, to know whether it is over ${OBJECT_BOUND} bytes`);

    const checkpoint = small("blob", utf8(c.checkpoint));

    // Trees: each directory set fanned out in layout 2 (R-LOG-19), listed whole in layout 1. A tree
    // of the parent at the same path, with no new or changed member under it, is reused by ID.
    const trees = new Map<string, Sha>();
    const top: Sha[] = [];
    const set = (name: SetName, leaves: readonly Leaf[], old: (name: string) => Node | undefined): Sha => {
      const reuse = kept && same ? { old: (p: string) => base.trees.get(p ? `${name}/${p}` : name), changed: (l: Leaf) => old(l.name)?.sha !== l.sha || old(l.name)?.mode !== l.mode } : undefined;
      const t = fanTrees(leaves, SETS[name], lay === undefined, reuse);
      for (const x of t.trees) {
        trees.set(x.path ? `${name}/${x.path}` : name, x.sha);
        if (!x.data) continue;
        this.counters.treesBuilt++;
        this.counters.peakObjectBytes = Math.max(this.counters.peakObjectBytes, x.data.length);
        add({ sha: x.sha, type: "tree", size: x.data.length, body: { kind: "bytes", data: x.data } });
      }
      return t.root;
    };
    const tree = (list: readonly TreeEntry[]): Sha => {
      this.counters.treesBuilt++;
      const sha = small("tree", encodeTree(list));
      top.push(sha);
      return sha;
    };
    const blob = (name: string, sha: Sha): TreeEntry => ({ name, mode: "100644", sha });
    const dir = (name: string, sha: Sha): TreeEntry => ({ name, mode: "40000", sha });
    const leaf = (name: string, n: Node): Leaf => ({ name, mode: n.mode, sha: n.sha });
    const v1: TreeEntry[] = [{ name: "genesis.json", ...genesis }, blob("checkpoint.json", checkpoint)];
    const baseSegments = new Map(base.segments.map((s) => [`${twelve(s.first)}.jsonl`, { mode: "100644", sha: s.sha } as const]));
    v1.push(dir("segments", set("segments", segments.map((s) => leaf(`${twelve(s.first)}.jsonl`, { mode: "100644", sha: s.sha })), (n) => baseSegments.get(n))));
    if (entries.size) v1.push(dir("entries", set("entries", [...entries].map(([n, x]) => leaf(n, x)), (n) => base.entries.get(n))));
    for (const sub of ["inputs", "policies"] as const) {
      const prefix = `${ROOT}/${sub}/`;
      const leaves = [...files].filter(([path]) => path.startsWith(prefix)).map(([path, n]) => leaf(path.slice(prefix.length), n));
      if (leaves.length) v1.push(dir(sub, set(sub, leaves, (n) => base.retained.get(prefix + n))));
    }
    const root = tree([dir("artroom-log", tree([dir("v1", tree(v1))]))]);

    const who = identity(c.at);
    const data = encodeCommit({
      tree: root,
      parents: parent ? [parent] : [],
      author: who,
      committer: who,
      message: `artroom log through ${c.through}\n\nhash ${c.hash}\n`,
    });
    const commit = gitObject("commit", data);
    const send = [...objects.values()].filter((o) => !base.present.has(o.sha));
    send.push({ sha: commit.sha, type: "commit", size: data.length, body: { kind: "bytes", data } });
    // The guard (R-LOG-19): in layout 2 no object written is over B, except a segment of entries before `from`.
    if (lay)
      for (const o of send)
        if (o.size > OBJECT_BOUND && !(o.body.kind === "segment" && o.body.first + o.body.count - 1 < lay.from))
          throw new PublishError("object-too-large", `the ${o.type} ${o.sha} would be ${o.size} bytes, over the object bound ${OBJECT_BOUND} (R-LOG-19): a fault in the publisher. Nothing was stored or pushed`);
    const present = new Set<string>([...objects.keys(), genesis.sha, checkpoint, ...segments.map((s) => s.sha), ...[...entries.values()].map((n) => n.sha), ...[...files.values()].map((n) => n.sha), ...trees.values(), ...top]);
    return { commit, send, index: { through: c.through, hash: c.hash, layout: lay, genesis, segments, entries, retained: files, trees, present } };
  }

  /** The genesis file's bytes, from entry 0. */
  private genesisBytes(lines: Lines): Uint8Array {
    const x = lines.read(0, 1)[0];
    const text = x === undefined ? undefined : typeof x === "string" ? x : lenient.decode(this.part(x, 0, x.bytes));
    const first = text === undefined ? undefined : (parseStrict(text) as LogEntry);
    if (!first || first.seq !== 0 || first.entry?.type !== "system" || first.entry.event?.type !== "genesis") throw new Error("entry 0 must be genesis");
    return utf8(canonicalize(first.entry.event.genesis));
  }

  /** A retained file given by reference: read in parts when it can be, otherwise loaded whole. */
  private retainedFile(r: RetainedRef, lay: LogLayout | undefined, add: (p: Planned) => Sha, base: Index): { readonly node: Node; readonly digest: string } {
    if (r.read && r.bytes !== undefined) {
      const parts = { bytes: r.bytes, read: r.read };
      const read: Reader = (o, l) => this.part(parts, o, l);
      return this.file(r.bytes, read, read, lay, add, base);
    }
    const body = utf8(r.load());
    this.counters.peakObjectBytes = Math.max(this.counters.peakObjectBytes, body.length);
    const again: Reader = (o, l) => {
      const data = utf8(r.load());
      if (data.length !== body.length) throw new PublishError("invalid-input", `retained file ${r.digest} was ${body.length} bytes and is now ${data.length}`);
      return data.subarray(o, o + l);
    };
    return this.file(body.length, (o, l) => body.subarray(o, o + l), again, lay, add, base);
  }

  /**
   * Plan one file of the tree: a blob, or in layout 2 a directory of
   * chunks when it is over B (R-LOG-18, one rule for every file). Its bytes
   * are read once here, in parts, for its SHA-256 (which names a retained
   * file and a `ChunkedLine`) and for the ID of its blob or of each chunk;
   * they are read again from `again` only when sent. A chunk directory the
   * parent already holds is not planned again.
   */
  private file(size: number, read: Reader, again: Reader, lay: LogLayout | undefined, add: (p: Planned) => Sha, base: Index): { readonly node: Node; readonly digest: string } {
    const chunked = lay !== undefined && size > OBJECT_BOUND;
    const whole = sha256.create();
    const step = this.readLimits.bytes;
    // Chunk by chunk, so the list of chunks grows only as their bytes are read.
    const parts: { readonly name: string; readonly offset: number; readonly bytes: number }[] = [];
    const blobs: Planned[] = [];
    for (const p of chunked ? eachChunk(size) : [{ name: "", offset: 0, bytes: size }]) {
      parts.push(p);
      const h = sha1.create().update(utf8(`blob ${p.bytes}\0`));
      for (let at = 0; at < p.bytes; at += step) {
        const n = Math.min(step, p.bytes - at);
        const b = read(p.offset + at, n);
        if (b.length !== n) throw new PublishError("invalid-input", `a file of ${size} bytes gave ${b.length} bytes at ${p.offset + at}, not ${n}`);
        h.update(b);
        whole.update(b);
      }
      const read2: Reader = (o, l) => again(p.offset + o, l);
      blobs.push({ sha: hex(h.digest()) as Sha, type: "blob", size: p.bytes, body: { kind: "range", read: read2 } });
    }
    const digest = hex(whole.digest());
    if (!chunked) {
      this.sizes.set(blobs[0]!.sha, size);
      return { node: { mode: "100644", sha: add(blobs[0]!) }, digest };
    }
    const t = fanTrees(parts.map((p, k) => ({ name: p.name, mode: "100644" as const, sha: blobs[k]!.sha })), CHUNKS, false);
    if (!base.present.has(t.root)) {
      for (const b of blobs) add(b);
      for (const x of t.trees) {
        this.counters.treesBuilt++;
        add({ sha: x.sha, type: "tree", size: x.data!.length, body: { kind: "bytes", data: x.data! } });
      }
    }
    return { node: { mode: "40000", sha: t.root }, digest };
  }

  /** Bytes `offset` to `offset + length` of a line or file given in parts, checked for length. */
  private part(x: { readonly bytes: number; read(offset: number, length: number): Uint8Array }, offset: number, length: number): Uint8Array {
    const b = x.read(offset, length);
    if (b.length !== length) throw new PublishError("invalid-input", `a read of ${length} bytes at ${offset} gave ${b.length}`);
    this.counters.peakBatchBytes = Math.max(this.counters.peakBatchBytes, b.length);
    return b;
  }

  /** Bytes `offset` to `offset + length` of entry `seq`'s line, read again from the entries. */
  private lineRange(lines: Lines, seq: Seq, size: number, offset: number, length: number): Uint8Array {
    const x = lines.read(seq, 1)[0];
    if (x === undefined) throw new PublishError("invalid-input", `the entries ended before ${seq}`);
    const line = typeof x === "string" ? utf8(x) : x;
    if (sizeOf(line) !== size) throw new PublishError("invalid-input", `entry ${seq} was ${size} bytes and is now ${sizeOf(line)}; the source changed while it was read`);
    if (line instanceof Uint8Array) {
      this.counters.peakBatchBytes = Math.max(this.counters.peakBatchBytes, line.length);
      return line.subarray(offset, offset + length);
    }
    return this.part(line, offset, length);
  }

  /** Hash a line or stub into each of `hs`, a part at a time when it is given in parts. */
  private feed(hs: readonly { update(b: Uint8Array): unknown }[], line: Line): void {
    if (line instanceof Uint8Array) {
      for (const h of hs) h.update(line);
      return;
    }
    const step = this.readLimits.bytes;
    for (let at = 0; at < line.bytes; at += step) {
      const b = this.part(line, at, Math.min(step, line.bytes - at));
      for (const h of hs) h.update(b);
    }
  }

  /**
   * How many lines to read from line `i` of `count`: one when their lengths
   * are not yet measured; otherwise as many as fit the read limits by their
   * measured lengths, stopping before a line a `ChunkedLine` stands for, and
   * at least one.
   */
  private batchSize(i: number, count: number, lens?: Float64Array, stubs?: ReadonlyMap<number, Uint8Array>): number {
    if (!lens) return 1;
    const { entries, bytes } = this.readLimits;
    const most = Math.min(entries, count - i);
    let n = 1;
    for (let sum = lens[i]!; n < most && !stubs?.has(i + n) && sum + lens[i + n]! <= bytes; n++) sum += lens[i + n]!;
    return n;
  }

  /** Read one batch of lines from line `i` of a run that starts at seq `first`: text as UTF-8 bytes, a line in parts as it is. */
  private batch(lines: Lines, first: Seq, i: number, count: number, lens?: Float64Array, stubs?: ReadonlyMap<number, Uint8Array>): Line[] {
    const batch = lines.read(first + i, this.batchSize(i, count, lens, stubs)).map((x) => (typeof x === "string" ? utf8(x) : x));
    if (batch.length === 0) throw new PublishError("invalid-input", `the entries ended at ${first + i - 1}`);
    this.counters.peakBatchBytes = Math.max(this.counters.peakBatchBytes, batch.reduce((n, b) => n + (b instanceof Uint8Array ? b.length : 0), 0));
    return batch;
  }

  /**
   * A segment blob, never held whole. Its lines were measured as they were
   * placed, so its size, which the blob's header needs, is known; this pass
   * hashes it. A line that R-LOG-18 chunks becomes its entry file and is
   * replaced by its `ChunkedLine`. When the parent published the first
   * `published.count` of its lines, the pass also hashes that prefix and
   * requires the parent's blob ID: the published part of the last segment
   * is checked byte for byte.
   */
  private segment(lines: Lines, first: Seq, lens: Float64Array, lay: LogLayout | undefined, published: { readonly count: number; readonly sha: Sha } | null, entryFile: (seq: Seq, line: Line) => Uint8Array): Planned {
    const count = lens.length;
    const placed = (i: number) => (isChunked(lay, first + i, lens[i]!) ? placedBytes(first + i, lens[i]!) : lens[i]!);
    let size = count - 1;
    for (let i = 0; i < count; i++) size += placed(i);
    // Each length is a safe integer; their sum must be too, or the blob's header would be wrong.
    if (!Number.isSafeInteger(size)) throw new PublishError("invalid-input", `segment ${first} would be ${size} bytes, more than a safe integer counts exactly`);
    const h = sha1.create().update(utf8(`blob ${size}\0`));
    let prefix: ReturnType<typeof sha1.create> | null = null;
    if (published) {
      let n = published.count - 1;
      for (let i = 0; i < published.count; i++) n += placed(i);
      prefix = sha1.create().update(utf8(`blob ${n}\0`));
    }
    const stubs = new Map<number, Uint8Array>();
    for (let i = 0; i < count; )
      for (const b of this.batch(lines, first, i, count, lens)) {
        if (sizeOf(b) !== lens[i]) throw new PublishError("invalid-input", `entry ${first + i} was ${lens[i]} bytes and is now ${sizeOf(b)}; the source changed while it was read`);
        let data: Line = b;
        if (isChunked(lay, first + i, lens[i]!)) {
          data = entryFile(first + i, b);
          stubs.set(i, data);
        }
        const hs = prefix !== null && i < published!.count ? [h, prefix] : [h];
        if (i > 0) for (const x of hs) x.update(NL);
        this.feed(hs, data);
        i++;
      }
    if (prefix && hex(prefix.digest()) !== published!.sha)
      throw new PublishError("would-rewrite", `an entry from ${first} to ${first + published!.count - 1} differs from the published entry; published history is never rewritten`);
    this.counters.hashedBytes += size + (published ? size : 0);
    this.counters.largestSegment = Math.max(this.counters.largestSegment, size);
    return { sha: hex(h.digest()) as Sha, type: "blob", size, body: { kind: "segment", first, count, lens, stubs } };
  }

  /** Bytes `offset` to `offset + length` of a planned object, read again from its source. */
  private bytesOf(lines: Lines, o: Planned, offset: number, length: number): Uint8Array {
    const body = o.body;
    if (body.kind === "bytes") return body.data.subarray(offset, offset + length);
    if (body.kind === "range") {
      const data = body.read(offset, length);
      if (data.length !== length) throw new PublishError("invalid-input", `${o.type} ${o.sha} gave ${data.length} bytes at ${offset}, not ${length}`);
      return data;
    }
    // A segment: start at the line that holds `offset`, and read lines in batches until the part is full.
    // A line a ChunkedLine stands for is never read again: its stub is sent.
    const len = (i: number) => body.stubs.get(i)?.length ?? body.lens[i]!;
    const out = new Uint8Array(length);
    let i = 0;
    let at = 0;
    while (i < body.count - 1 && at + len(i) + 1 <= offset) at += len(i++) + 1;
    let filled = 0;
    const put = (src: Line, pos: number) => {
      const lo = Math.max(pos, offset);
      const hi = Math.min(pos + sizeOf(src), offset + length);
      if (hi > lo) {
        out.set(src instanceof Uint8Array ? src.subarray(lo - pos, hi - pos) : this.part(src, lo - pos, hi - lo), lo - offset);
        filled += hi - lo;
      }
    };
    while (filled < length && i < body.count) {
      const stub = body.stubs.get(i);
      for (const b of stub ? [stub] : this.batch(lines, body.first, i, body.count, body.lens, body.stubs)) {
        if (sizeOf(b) !== len(i)) throw new PublishError("invalid-input", `entry ${body.first + i} was ${len(i)} bytes and is now ${sizeOf(b)}; the source changed while it was read`);
        put(b, at);
        at += sizeOf(b);
        if (i < body.count - 1) put(NL, at++);
        i++;
        if (filled >= length) break;
      }
    }
    if (filled !== length) throw new PublishError("invalid-input", `segment ${body.first} has fewer than ${offset + length} bytes`);
    this.counters.sentSegmentBytes += length;
    return out;
  }

  /** Every object whole, for a push under one transfer (at most `maxTransfer.bytes` in all). */
  private materialize(lines: Lines, send: readonly Planned[]): GitObject[] {
    const out = send.map((o) => ({ type: o.type, sha: o.sha, data: this.bytesOf(lines, o, 0, o.size) }));
    this.counters.peakSendBytes = Math.max(this.counters.peakSendBytes, out.reduce((n, o) => n + o.data.length, 0));
    return out;
  }

  /**
   * Stage `objects` for commit `cohort` in parts of at most `maxTransfer`:
   * ask what is missing, read and send the next bytes of each missing
   * object from where its staging stopped, and repeat until nothing is
   * missing. False when the remote refuses or stops making progress;
   * nothing is pushed then.
   */
  private async stageAll(cohort: Sha, lines: Lines, objects: readonly Planned[]): Promise<boolean> {
    const remote = this.remote;
    const stage = async (cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> => {
      try {
        return await remote.stage!(cohort, want, parts);
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) }; // a lost answer: ask again next attempt
      }
    };
    const bySha = new Map(objects.map((o) => [o.sha, o]));
    const { objects: maxObjects, bytes: maxBytes } = this.maxTransfer;
    for (let i = 0; i < objects.length; i += maxObjects) {
      const want = objects.slice(i, i + maxObjects).map((o) => ({ sha: o.sha, type: o.type, size: o.size }));
      let r = await stage(cohort, want, []);
      while (r.ok && r.missing.length > 0) {
        const parts: StagePart[] = [];
        let room = maxBytes;
        for (const m of r.missing) {
          const o = bySha.get(m.sha);
          if (!o || parts.length >= maxObjects) break;
          const take = Math.min(o.size - m.have, room);
          if (take <= 0 && o.size > 0) break;
          parts.push({ sha: o.sha, type: o.type, size: o.size, offset: m.have, data: this.bytesOf(lines, o, m.have, Math.max(0, take)) });
          room -= take;
        }
        this.counters.peakSendBytes = Math.max(this.counters.peakSendBytes, maxBytes - room);
        const before = remaining(r.missing, bySha);
        r = await stage(cohort, want, parts);
        if (r.ok && r.missing.length > 0 && remaining(r.missing, bySha) >= before) return false; // no progress
      }
      if (!r.ok) return false;
    }
    return true;
  }

  private unexpected(current: Sha | null, why: string): PublishError {
    return new PublishError("unexpected-writer", `${this.ref} is at ${current ?? "nothing"}, ${why}`, { current });
  }

  private done(cohort: Cohort, plan: Plan, attempts: number): PublishResult {
    this.lastCommit = plan.commit.sha;
    this.index = plan.index;
    return { commit: plan.commit.sha, through: cohort.through, hash: cohort.hash, publishedThrough: cohort.through, attempts };
  }
}

/** The fixed end of every canonical entry line: its hash, prev, signature and seq. */
const TAIL = /,"format":"artroom-log-v1","hash":"(sha256:[0-9a-f]{64})","prev":(?:null|"sha256:[0-9a-f]{64}"),"roomSig":"[A-Za-z0-9_-]+","seq":(0|[1-9][0-9]*)\}$/;
/** For reading the end of a line, which may start inside a character. */
const lenient = new TextDecoder();

/** An array's canonical lines, copied and checked now. */
function ownedLines(entries: readonly LogEntry[]): Lines {
  const lines: string[] = [];
  for (const [i, e] of entries.entries()) {
    const line = canonicalize(e);
    const copy = parseStrict(line) as LogEntry;
    if (copy.seq !== i) throw new PublishError("invalid-input", `entry ${i} has seq ${copy.seq}`);
    lines.push(line);
  }
  return { through: lines.length - 1, read: (from, limit) => lines.slice(from, from + limit) };
}

/** The path a retained file has when its digest names its body; null for a digest that is not SHA-256 hex. */
function digestPath(kind: Retained["kind"], digest: Digest): string | null {
  const m = /^sha256:([0-9a-f]{64})$/.exec(digest);
  return m ? `${ROOT}/${kind === "input" ? "inputs" : "policies"}/${m[1]}.json` : null;
}

/** Bytes of `missing` objects not yet staged. */
function remaining(missing: readonly { readonly sha: Sha; readonly have: number }[], bySha: ReadonlyMap<string, Planned>): number {
  return missing.reduce((n, m) => n + (bySha.get(m.sha)?.size ?? 0) - m.have + 1, 0);
}

/** When to publish: once the lag reaches `maxLag` entries, or `maxDelayMs` after the oldest unpublished entry. */
export interface BatchPolicy {
  readonly maxLag: number;
  readonly maxDelayMs: number;
}

export function publicationDue(policy: BatchPolicy, lag: number, oldestUnpublishedMs: number | null, nowMs: number): boolean {
  if (lag <= 0) return false;
  if (lag >= policy.maxLag) return true;
  return oldestUnpublishedMs !== null && nowMs - oldestUnpublishedMs >= policy.maxDelayMs;
}

// ------------------------------------------------------------------ reading

/**
 * A log commit's index, from its trees and checkpoint only: no segment,
 * entry file or retained file is read. A commit without the shape of the
 * layout its checkpoint names (R-LOG-9; R-LOG-16 to R-LOG-19), or whose
 * segments do not match its checkpoint, is `unexpected-writer`. Byte bounds
 * are left to `verify`.
 */
async function readIndex(reader: GitReader, commit: Sha): Promise<Index> {
  const notLog = (why: string) => new PublishError("unexpected-writer", `${commit} is not a log commit this publisher can extend: ${why}`, { current: commit });
  const c = await reader.readObject(commit);
  if (c.type !== "commit") throw notLog("it is not a commit");
  const present = new Set<string>();
  const list: ListTree = async (sha) => {
    const t = await reader.readObject(sha);
    if (t.type !== "tree") throw notLog(`${sha} is not a tree`);
    present.add(sha);
    return parseTree(t.data);
  };
  const find = (entries: readonly TreeEntry[], name: string, mode: TreeEntry["mode"], path: string): TreeEntry => {
    const e = entries.find((x) => x.name === name && x.mode === mode);
    if (!e) throw notLog(`it has no ${path}`);
    return e;
  };
  const root = await list(parseCommit(c.data).tree);
  const top = await list(find(root, "artroom-log", "40000", "artroom-log").sha);
  const v1 = await list(find(top, "v1", "40000", ROOT).sha);
  const cpSha = find(v1, "checkpoint.json", "100644", `${ROOT}/checkpoint.json`).sha;
  let cp: Checkpoint;
  try {
    cp = decodeCheckpoint((await reader.readObject(cpSha)).data);
  } catch (e) {
    if (e instanceof Malformed) throw notLog(e.message);
    throw e;
  }
  const layout = cp.layout;
  const g = v1.find((x) => x.name === "genesis.json" && (x.mode === "100644" || layout !== undefined));
  if (!g) throw notLog(`it has no ${ROOT}/genesis.json`);

  const trees = new Map<string, Sha>();
  const members = async (name: SetName): Promise<ReadonlyMap<string, TreeEntry>> => {
    const e = v1.find((x) => x.name === name && x.mode === "40000");
    if (!e) {
      if (name === "segments") throw notLog(`it has no ${ROOT}/segments`);
      return new Map();
    }
    const m = await walkSet(list, e.sha, SETS[name], layout === undefined);
    if (m.problems.length) throw notLog(`${ROOT}/${name}: ${m.problems[0]}`);
    for (const [p, sha] of m.trees) trees.set(p ? `${name}/${p}` : name, sha);
    return m.leaves;
  };

  // Segments: layout 1 every 1,000 entries; layout 2 from 0, in order, at most 1,000 entries each.
  const segments: { first: Seq; sha: Sha }[] = [];
  for (const [name, e] of [...(await members("segments"))].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const first = Number(name.slice(0, 12));
    const prev = segments.at(-1)?.first;
    const placed = layout === undefined ? first === segments.length * SEGMENT_SIZE : prev === undefined ? first === 0 : first > prev && first - prev <= SEGMENT_SIZE;
    if (e.mode !== "100644" || !placed) throw notLog(`segment ${name} is out of place`);
    segments.push({ first, sha: e.sha });
  }
  const last = segments.at(-1)?.first ?? 0;
  if (layout === undefined ? segments.length !== Math.floor(cp.through / SEGMENT_SIZE) + 1 : cp.through < last || cp.through - last >= SEGMENT_SIZE)
    throw notLog(`it has ${segments.length} segments for entries through ${cp.through}`);

  const entries = new Map<string, Node>();
  if (layout)
    for (const [name, e] of await members("entries")) {
      if (e.mode !== "40000") throw notLog(`${ROOT}/entries/${name} is not a chunk directory`);
      entries.set(name, { mode: e.mode, sha: e.sha });
    }
  const retained = new Map<string, Node>();
  for (const sub of ["inputs", "policies"] as const)
    for (const [name, e] of await members(sub)) {
      if (layout === undefined && e.mode !== "100644") throw notLog(`${ROOT}/${sub}/${name} is not a retained file`);
      retained.set(`${ROOT}/${sub}/${name}`, { mode: e.mode, sha: e.sha });
    }
  for (const sha of [g.sha, cpSha, ...segments.map((s) => s.sha), ...[...entries.values()].map((n) => n.sha), ...[...retained.values()].map((n) => n.sha)]) present.add(sha);
  return { through: cp.through, hash: cp.hash, layout, genesis: { mode: g.mode, sha: g.sha }, segments, entries, retained, trees, present };
}
