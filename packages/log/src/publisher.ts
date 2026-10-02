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
 * - after an unclear answer, the publisher reads the ref back and either
 *   confirms, retries the same commit, or stops on an unexpected writer.
 *
 * Memory is bounded (request 5a7290b9). The entries come from an
 * `EntrySource` in batches of `readBatch`; a segment blob is never held
 * whole. Its size is counted first, then its ID is hashed, then its bytes
 * are read again for each staged part. Full segments of the parent are
 * reused by ID and not read at all. Retained files are read one at a time,
 * and only when the parent does not already hold them. Trees, the
 * checkpoint and the commit are small and built in memory.
 */

import type { Checkpoint, Digest, LogEntry, Seq, Sha } from "@generalbusiness/artroom-contract";
import { sha1 } from "@noble/hashes/legacy.js";
import { canonicalize, parseStrict, utf8 } from "./canonical.ts";
import { hex, verifySig } from "./crypto.ts";
import { parseTime } from "./time.ts";
import { Malformed, decodeCheckpoint, decodeEntry, segmentLines } from "./decode.ts";
import { LOG_REF, ROOT, SEGMENT_SIZE, isRetainedPath, retainedPath, segmentPath, type Retained } from "./entries.ts";
import { encodeCommit, encodeTree, gitObject, parseCommit, parseTree, type GitObject, type GitReader, type GitRemote, type ObjectType, type StageOutcome, type StagePart, type StageWant, type TreeEntry } from "./git.ts";

export type PublishErrorCode =
  /** The call would change an entry already published. Nothing was pushed. */
  | "would-rewrite"
  /** The entries or checkpoint are malformed: wrong order, wrong `through`, bad signature, or a source that changed while it was read. */
  | "invalid-input"
  /** The ref holds a commit this publisher did not write. It stops; an admin must look. */
  | "unexpected-writer"
  /** Retries ran out with no clear answer. Call `publish` again with the same input: it completes forward. */
  | "unresolved"
  /**
   * The objects this publication adds exceed one transfer
   * (`PublisherOptions.maxTransfer`) and the remote cannot stage them
   * (`GitRemote.stage`). Nothing was pushed. A remote that stages never
   * gives this error.
   */
  | "cohort-too-large";

export class PublishError extends Error {
  override readonly name = "PublishError";
  readonly code: PublishErrorCode;
  readonly retryable: boolean;
  constructor(code: PublishErrorCode, message: string) {
    super(message);
    this.code = code;
    this.retryable = code === "unresolved";
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
  /** Entries read from an `EntrySource` at a time. Default `READ_BATCH`. */
  readonly readBatch?: number;
}

/**
 * One transfer's bound: objects and decoded bytes, the same as the
 * publisher sandbox's (lane B, `LOG_PUSH_LIMITS`). A publication over it is
 * staged in parts. 8 MiB is about 11 MiB as base64url. Measured live
 * (2026-10-01): parts of 6, 8 and 12 MiB crossed the Durable Object RPC;
 * 16 MiB parts exhausted a Durable Object's 128 MB memory.
 */
export const LOG_TRANSFER_LIMITS = { objects: 100_000, bytes: 8 * 1024 * 1024 } as const;

/** Entries read from an `EntrySource` at a time. A signed envelope is at most 64 KiB (R-SIG-6). */
export const READ_BATCH = 16;

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
  /** At most `limit` entries from seq `from`, in seq order. */
  read(from: Seq, limit: number): readonly LogEntry[];
}

/**
 * A retained file named by its digest (R-LOG-7). Its body is read only when
 * the commit needs its bytes: when the parent does not already hold it.
 */
export interface RetainedRef {
  readonly kind: Retained["kind"];
  /** `sha256:` and the hex SHA-256 of the body, which names the file. */
  readonly digest: Digest;
  readonly load: () => string;
}

/**
 * What the publisher held in memory, in bytes, since it was made or since
 * `resetStats`. These are the buffers of its own code: the JavaScript
 * objects an `EntrySource` returns and the strings made from them are not
 * counted.
 */
export interface PublicationStats {
  /** The most canonical entry bytes read in one batch. */
  peakBatchBytes: number;
  /** The most bytes sent in one call: one stage call's parts, or one push's objects. */
  peakSendBytes: number;
  /** The largest object built whole: a tree, the commit, the checkpoint, the genesis, a retained file. */
  peakObjectBytes: number;
  /** The largest segment blob, which is never built whole. */
  largestSegment: number;
  /** Segment bytes hashed (twice when a published prefix is checked). */
  hashedBytes: number;
  /** Segment bytes read again to stage or push them. */
  sentSegmentBytes: number;
}

const freshStats = (): PublicationStats => ({ peakBatchBytes: 0, peakSendBytes: 0, peakObjectBytes: 0, largestSegment: 0, hashedBytes: 0, sentSegmentBytes: 0 });

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

/** Canonical lines by seq, read in batches. */
interface Lines {
  readonly through: Seq;
  read(from: Seq, limit: number): readonly string[];
}

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
  readonly retained: readonly RetainedIn[];
}

/**
 * What a log commit holds, by ID: enough to build its child without
 * reading its segments or retained files again.
 */
interface Index {
  readonly through: Seq;
  readonly hash: Digest | null;
  readonly genesis: Sha | null;
  /** The blob of each segment, in order. */
  readonly segments: readonly Sha[];
  /** Every retained file's blob, by path. */
  readonly retained: ReadonlyMap<string, Sha>;
  /** Every tree and blob of the commit's tree: the remote holds them. */
  readonly present: ReadonlySet<string>;
}

const EMPTY: Index = { through: -1, hash: null, genesis: null, segments: [], retained: new Map(), present: new Set() };

/** How to produce an object's bytes when they are sent. */
type Body =
  | { readonly kind: "bytes"; readonly data: Uint8Array }
  | { readonly kind: "segment"; readonly first: Seq; readonly count: number; readonly lens: Uint32Array }
  | { readonly kind: "retained"; readonly load: () => string };

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

const NL = new Uint8Array([0x0a]);

export class LogPublisher {
  readonly remote: GitRemote;
  readonly ref: string;
  private readonly attempts: number;
  private readonly sleep: (attempt: number) => Promise<void>;
  private readonly maxTransfer: { readonly objects: number; readonly bytes: number };
  private readonly readBatch: number;
  private lastCommit: Sha | null = null;
  /** `lastCommit`'s index; `EMPTY` before the first publication. */
  private index: Index = EMPTY;
  private counters: PublicationStats = freshStats();

  constructor(remote: GitRemote, opts: PublisherOptions = {}) {
    this.remote = remote;
    this.ref = opts.ref ?? LOG_REF;
    this.attempts = opts.attempts ?? 5;
    this.sleep = opts.sleep ?? (async () => {});
    this.maxTransfer = opts.maxTransfer ?? LOG_TRANSFER_LIMITS;
    this.readBatch = Math.max(1, opts.readBatch ?? READ_BATCH);
  }

  /**
   * Resume from the ref: read the last log commit's trees and checkpoint,
   * not its segments or retained files. A head that is not a log commit is
   * `unexpected-writer`.
   */
  static async open(remote: GitRemote, opts: PublisherOptions = {}): Promise<LogPublisher> {
    const p = new LogPublisher(remote, opts);
    const head = await remote.readRef(p.ref);
    if (head) {
      p.index = await readIndex(remote, head);
      p.lastCommit = head;
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
      if (outcome.ok || outcome.reason !== "lease-mismatch") {
        // Read back: the only proof of where the ref is (R-LOG-8 step 5).
        const now = await this.remote.readRef(this.ref);
        if (now === commit.sha) return this.done(cohort, plan, attempt);
        if (now === lease) continue; // not applied: push the same commit again
        throw new PublishError("unexpected-writer", `${this.ref} is at ${now ?? "nothing"}, which this publisher did not write`);
      }
      if (outcome.current === commit.sha) return this.done(cohort, plan, attempt);
      throw new PublishError("unexpected-writer", `${this.ref} is at ${outcome.current ?? "nothing"}, not the lease ${lease ?? "nothing"}`);
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
   * reuses its full segments. So when `parent` is that commit, both are
   * used here too, and an entry that differs from the published one is
   * `would-rewrite`. For any other parent, every segment is built from
   * `entries` and only `retained` is used. A Room that passes every
   * retained file it holds gets the same commit either way.
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
    const last = parseStrict(lines.read(lines.through, 1)[0]!) as LogEntry;
    const text = canonicalize(checkpoint);
    const cp = parseStrict(text) as Checkpoint;
    if (cp.through !== last.seq || cp.hash !== last.hash)
      throw new PublishError("invalid-input", `the checkpoint names ${cp.through} ${cp.hash}, not the last entry`);
    const { sig, ...unsigned } = cp;
    if (!verifySig(cp.roomKey, sig, "artroom-checkpoint-v1", unsigned))
      throw new PublishError("invalid-input", "the checkpoint's signature is not valid");
    const files: RetainedIn[] = retained.map((r) => ("body" in r ? { kind: r.kind, body: r.body } : { kind: r.kind, digest: r.digest, load: r.load }));
    return { lines, through: last.seq, hash: last.hash, checkpoint: text, at: cp.at, retained: files };
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
          const line = canonicalize(e);
          const seq = (parseStrict(line) as LogEntry).seq;
          if (seq !== from + i) throw new PublishError("invalid-input", `entry ${from + i} has seq ${seq}`);
          return line;
        });
      },
    };
  }

  /**
   * The one git serialization of a cohort on `parent`: R-LOG-9's layout,
   * built from the parent's index and the lines that are new. `kept` adds
   * the parent's retained files, as `publish` does. Synchronous.
   *
   * Checks against the parent, when it has entries: the cohort is not
   * shorter; its entry at the parent's checkpoint has the checkpoint's
   * hash; and the published part of the parent's last segment is the same
   * bytes, by ID. A full segment never changes, so it is reused by ID.
   */
  private plan(parent: Sha | null, c: Cohort, base: Index, kept: boolean): Plan {
    if (c.through < base.through) throw new PublishError("would-rewrite", `the cohort ends at ${c.through}, before the published entry ${base.through}; published history is never rewritten`);
    if (base.through >= 0 && (parseStrict(c.lines.read(base.through, 1)[0]!) as LogEntry).hash !== base.hash)
      throw new PublishError("would-rewrite", `entry ${base.through} differs from the published entry; published history is never rewritten`);

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

    // The genesis, from entry 0 (R-LOG-9).
    let genesis = base.genesis;
    if (!genesis) {
      const first = parseStrict(c.lines.read(0, 1)[0]!) as LogEntry;
      if (first.seq !== 0 || first.entry?.type !== "system" || first.entry.event?.type !== "genesis") throw new Error("entry 0 must be genesis");
      genesis = small("blob", utf8(canonicalize(first.entry.event.genesis)));
    }

    // Segments: a full segment of the parent is reused; the others are streamed.
    const segments: Sha[] = [];
    for (let first = 0; first <= c.through; first += SEGMENT_SIZE) {
      const k = first / SEGMENT_SIZE;
      if (base.through >= first + SEGMENT_SIZE - 1) {
        segments.push(base.segments[k]!);
        continue;
      }
      const count = Math.min(SEGMENT_SIZE, c.through - first + 1);
      const published = base.through >= first ? { count: base.through - first + 1, sha: base.segments[k]! } : null;
      segments.push(add(this.segment(c.lines, first, count, published)));
    }

    // Retained files: the parent's (when kept) and the given ones, by path. A file the parent
    // holds is not read; any other is read once here to hash it, and again when it is sent.
    const files = new Map<string, Sha>(kept ? base.retained : []);
    for (const r of c.retained) {
      if ("body" in r) {
        const path = retainedPath(r);
        files.set(path, this.retainedBlob(add, () => r.body));
        continue;
      }
      const named = digestPath(r.kind, r.digest);
      const held = named === null ? undefined : base.retained.get(named);
      if (held !== undefined) {
        files.set(named!, held);
        continue;
      }
      const body = r.load();
      files.set(retainedPath({ kind: r.kind, body }), this.retainedBlob(add, r.load, body));
    }

    const checkpoint = small("blob", utf8(c.checkpoint));

    // Trees, as `buildTree` makes them for the same files.
    const trees: Sha[] = [];
    const tree = (entries: readonly TreeEntry[]): Sha => {
      const sha = small("tree", encodeTree(entries));
      trees.push(sha);
      return sha;
    };
    const blob = (name: string, sha: Sha): TreeEntry => ({ name, mode: "100644", sha });
    const dir = (name: string, sha: Sha): TreeEntry => ({ name, mode: "40000", sha });
    const v1: TreeEntry[] = [blob("genesis.json", genesis), blob("checkpoint.json", checkpoint)];
    v1.push(dir("segments", tree(segments.map((sha, k) => blob(segmentPath(k * SEGMENT_SIZE).slice(`${ROOT}/segments/`.length), sha)))));
    for (const sub of ["inputs", "policies"]) {
      const prefix = `${ROOT}/${sub}/`;
      const entries = [...files].filter(([path]) => path.startsWith(prefix)).map(([path, sha]) => blob(path.slice(prefix.length), sha));
      if (entries.length) v1.push(dir(sub, tree(entries)));
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
    const present = new Set<string>([genesis, checkpoint, ...segments, ...files.values(), ...trees]);
    return { commit, send, index: { through: c.through, hash: c.hash, genesis, segments, retained: files, present } };
  }

  /** Plan a retained file's blob: hash its bytes once; keep only how to read them again. */
  private retainedBlob(add: (p: Planned) => Sha, load: () => string, body = load()): Sha {
    const data = utf8(body);
    this.counters.peakObjectBytes = Math.max(this.counters.peakObjectBytes, data.length);
    return add({ sha: gitObject("blob", data).sha, type: "blob", size: data.length, body: { kind: "retained", load } });
  }

  /** Each line of `count` from `first`, as UTF-8 bytes, read in batches. */
  private eachLine(lines: Lines, first: Seq, count: number, f: (i: number, bytes: Uint8Array) => void): void {
    for (let i = 0; i < count; ) {
      const batch = lines.read(first + i, Math.min(this.readBatch, count - i)).map(utf8);
      if (batch.length === 0) throw new PublishError("invalid-input", `the entries ended at ${first + i - 1}`);
      this.counters.peakBatchBytes = Math.max(this.counters.peakBatchBytes, batch.reduce((n, b) => n + b.length, 0));
      for (const b of batch) f(i++, b);
    }
  }

  /**
   * A segment blob, never held whole: one pass counts its size, which the
   * blob's header needs; a second hashes it. When the parent published the
   * first `published.count` of its lines, the second pass also hashes that
   * prefix and requires the parent's blob ID: the published part of the
   * last segment is checked byte for byte.
   */
  private segment(lines: Lines, first: Seq, count: number, published: { readonly count: number; readonly sha: Sha } | null): Planned {
    const lens = new Uint32Array(count);
    let size = count - 1;
    this.eachLine(lines, first, count, (i, b) => {
      lens[i] = b.length;
      size += b.length;
    });
    const h = sha1.create().update(utf8(`blob ${size}\0`));
    let prefix: ReturnType<typeof sha1.create> | null = null;
    if (published) {
      let n = published.count - 1;
      for (let i = 0; i < published.count; i++) n += lens[i]!;
      prefix = sha1.create().update(utf8(`blob ${n}\0`));
    }
    let hashed = 0;
    this.eachLine(lines, first, count, (i, b) => {
      if (b.length !== lens[i]) throw new PublishError("invalid-input", `entry ${first + i} was ${lens[i]} bytes and is now ${b.length}; the source changed while it was read`);
      const inPrefix = prefix !== null && i < published!.count;
      if (i > 0) {
        h.update(NL);
        if (inPrefix) prefix!.update(NL);
      }
      h.update(b);
      if (inPrefix) prefix!.update(b);
      hashed += b.length + (i > 0 ? 1 : 0);
    });
    if (hashed !== size) throw new PublishError("invalid-input", `segment ${first} hashed ${hashed} bytes, not ${size}`);
    if (prefix && hex(prefix.digest()) !== published!.sha)
      throw new PublishError("would-rewrite", `an entry from ${first} to ${first + published!.count - 1} differs from the published entry; published history is never rewritten`);
    this.counters.hashedBytes += size + (published ? size : 0);
    this.counters.largestSegment = Math.max(this.counters.largestSegment, size);
    return { sha: hex(h.digest()) as Sha, type: "blob", size, body: { kind: "segment", first, count, lens } };
  }

  /** Bytes `offset` to `offset + length` of a planned object, read again from its source. */
  private bytesOf(lines: Lines, o: Planned, offset: number, length: number): Uint8Array {
    const body = o.body;
    if (body.kind === "bytes") return body.data.subarray(offset, offset + length);
    if (body.kind === "retained") {
      const data = utf8(body.load());
      if (data.length !== o.size) throw new PublishError("invalid-input", `retained file ${o.sha} was ${o.size} bytes and is now ${data.length}`);
      return data.subarray(offset, offset + length);
    }
    // A segment: start at the line that holds `offset`, and read lines in batches until the part is full.
    const out = new Uint8Array(length);
    let i = 0;
    let at = 0;
    while (i < body.count - 1 && at + body.lens[i]! + 1 <= offset) at += body.lens[i++]! + 1;
    let filled = 0;
    const put = (src: Uint8Array, pos: number) => {
      const lo = Math.max(pos, offset);
      const hi = Math.min(pos + src.length, offset + length);
      if (hi > lo) {
        out.set(src.subarray(lo - pos, hi - pos), lo - offset);
        filled += hi - lo;
      }
    };
    while (filled < length && i < body.count) {
      const batch = lines.read(body.first + i, Math.min(this.readBatch, body.count - i)).map(utf8);
      if (batch.length === 0) throw new PublishError("invalid-input", `the entries ended at ${body.first + i - 1}`);
      this.counters.peakBatchBytes = Math.max(this.counters.peakBatchBytes, batch.reduce((n, b) => n + b.length, 0));
      for (const b of batch) {
        if (b.length !== body.lens[i]) throw new PublishError("invalid-input", `entry ${body.first + i} was ${body.lens[i]} bytes and is now ${b.length}; the source changed while it was read`);
        put(b, at);
        at += b.length;
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

  private done(cohort: Cohort, plan: Plan, attempts: number): PublishResult {
    this.lastCommit = plan.commit.sha;
    this.index = plan.index;
    return { commit: plan.commit.sha, through: cohort.through, hash: cohort.hash, publishedThrough: cohort.through, attempts };
  }
}

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
 * A log commit's index, from its trees and checkpoint only: no segment or
 * retained file is read. A commit without R-LOG-9's layout, or whose
 * segments do not match its checkpoint, is `unexpected-writer`.
 */
async function readIndex(reader: GitReader, commit: Sha): Promise<Index> {
  const notLog = (why: string) => new PublishError("unexpected-writer", `${commit} is not a log commit this publisher can extend: ${why}`);
  const c = await reader.readObject(commit);
  if (c.type !== "commit") throw notLog("it is not a commit");
  const present = new Set<string>();
  const tree = async (sha: Sha, path: string): Promise<TreeEntry[]> => {
    const t = await reader.readObject(sha);
    if (t.type !== "tree") throw notLog(`${path} is not a tree`);
    present.add(sha);
    return parseTree(t.data);
  };
  const find = (entries: readonly TreeEntry[], name: string, mode: TreeEntry["mode"], path: string): TreeEntry => {
    const e = entries.find((x) => x.name === name && x.mode === mode);
    if (!e) throw notLog(`it has no ${path}`);
    return e;
  };
  const root = await tree(parseCommit(c.data).tree, "root");
  const top = await tree(find(root, "artroom-log", "40000", "artroom-log").sha, "artroom-log");
  const v1 = await tree(find(top, "v1", "40000", ROOT).sha, ROOT);
  const genesis = find(v1, "genesis.json", "100644", `${ROOT}/genesis.json`).sha;
  const cpSha = find(v1, "checkpoint.json", "100644", `${ROOT}/checkpoint.json`).sha;
  let cp: Checkpoint;
  try {
    cp = decodeCheckpoint((await reader.readObject(cpSha)).data);
  } catch (e) {
    if (e instanceof Malformed) throw notLog(e.message);
    throw e;
  }
  const segs = await tree(find(v1, "segments", "40000", `${ROOT}/segments`).sha, `${ROOT}/segments`);
  const segments: Sha[] = [];
  for (const e of segs) {
    if (e.mode !== "100644" || `${ROOT}/segments/${e.name}` !== segmentPath(segments.length * SEGMENT_SIZE)) throw notLog(`segment ${e.name} is out of place`);
    segments.push(e.sha);
  }
  if (segments.length !== Math.floor(cp.through / SEGMENT_SIZE) + 1) throw notLog(`it has ${segments.length} segments for entries through ${cp.through}`);
  const retained = new Map<string, Sha>();
  for (const sub of ["inputs", "policies"]) {
    const e = v1.find((x) => x.name === sub && x.mode === "40000");
    if (!e) continue;
    for (const f of await tree(e.sha, `${ROOT}/${sub}`)) {
      const path = `${ROOT}/${sub}/${f.name}`;
      if (f.mode !== "100644" || !isRetainedPath(path)) throw notLog(`${path} is not a retained file`);
      retained.set(path, f.sha);
    }
  }
  for (const sha of [genesis, cpSha, ...segments, ...retained.values()]) present.add(sha);
  return { through: cp.through, hash: cp.hash, genesis, segments, retained, present };
}

/** The files under `artroom-log/v1/` in a log commit, by path. Reads every file: for verification, not for the Room. */
export async function readLogFiles(reader: GitReader, commit: Sha): Promise<Map<string, Uint8Array>> {
  const c = await reader.readObject(commit);
  if (c.type !== "commit") throw new Error(`${commit} is not a commit`);
  const out = new Map<string, Uint8Array>();
  const walk = async (tree: Sha, prefix: string) => {
    const t = await reader.readObject(tree);
    if (t.type !== "tree") throw new Error(`${tree} is not a tree`);
    for (const e of parseTree(t.data)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.mode === "40000") await walk(e.sha, path);
      else out.set(path, (await reader.readObject(e.sha)).data);
    }
  };
  await walk(parseCommit(c.data).tree, "");
  return out;
}

/** The segment lines of a log commit's files, in order. */
function publishedLines(files: ReadonlyMap<string, Uint8Array>): string[] {
  const lines: string[] = [];
  for (let first = 0; files.has(segmentPath(first)); first += SEGMENT_SIZE) lines.push(...segmentLines(files.get(segmentPath(first))!));
  return lines;
}

/** The entries a log commit publishes, in order. Throws `Malformed` on content that is not a log entry. */
export async function readPublishedEntries(reader: GitReader, commit: Sha): Promise<LogEntry[]> {
  return publishedLines(await readLogFiles(reader, commit)).map(decodeEntry);
}
