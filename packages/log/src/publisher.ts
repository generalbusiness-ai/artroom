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
 */

import type { Checkpoint, Digest, LogEntry, Seq, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize, fromUtf8, parseStrict, utf8 } from "./canonical.ts";
import { verifySig } from "./crypto.ts";
import { parseTime } from "./time.ts";
import { decodeEntry, segmentLines } from "./decode.ts";
import { LOG_REF, SEGMENT_SIZE, isRetainedPath, layout, retainedPath, segmentPath, type Retained } from "./entries.ts";
import { buildTree, encodeCommit, gitObject, parseCommit, parseTree, type GitObject, type GitReader, type GitRemote } from "./git.ts";

export type PublishErrorCode =
  /** The call would change an entry already published. Nothing was pushed. */
  | "would-rewrite"
  /** The entries or checkpoint are malformed: wrong order, wrong `through`, bad signature. */
  | "invalid-input"
  /** The ref holds a commit this publisher did not write. It stops; an admin must look. */
  | "unexpected-writer"
  /** Retries ran out with no clear answer. Call `publish` again with the same input: it completes forward. */
  | "unresolved"
  /**
   * The objects this publication adds exceed one transfer
   * (`PublisherOptions.maxTransfer`). Nothing was pushed. Publish a smaller
   * cohort: fewer new entries, or fewer new retained files.
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
}

/** One push's bound: objects and decoded bytes. The publisher sandbox refuses more. */
export const LOG_TRANSFER_LIMITS = { objects: 100_000, bytes: 64 * 1024 * 1024 } as const;

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

/**
 * One publication, owned by the publisher. It is copied from the caller's
 * arguments synchronously, before the first await, so nothing the caller
 * does to its arrays or objects during the push or the read-back can reach
 * the commit or the publisher's state.
 */
interface Cohort {
  /** The canonical line of every entry, from seq 0. */
  readonly lines: readonly string[];
  readonly through: Seq;
  readonly hash: Digest;
  /** The checkpoint's canonical text. */
  readonly checkpoint: string;
  readonly at: string;
  /** Every retained file by path: the earlier publications' and this call's (R-LOG-7). */
  readonly retained: ReadonlyMap<string, string>;
}

export class LogPublisher {
  readonly remote: GitRemote;
  readonly ref: string;
  private readonly attempts: number;
  private readonly sleep: (attempt: number) => Promise<void>;
  private readonly maxTransfer: { readonly objects: number; readonly bytes: number };
  private lastCommit: Sha | null = null;
  /**
   * The tree and blob objects of `lastCommit`'s tree. The remote has them
   * (they are reachable from the lease), so a push sends only the others.
   * Empty when unknown: then everything is sent.
   */
  private present: ReadonlySet<string> = new Set();
  /** The canonical line of every published entry, by seq. */
  private published: readonly string[] = [];
  /** The retained files of the last log commit, by path. Content-addressed, so never changed. */
  private retained: ReadonlyMap<string, string> = new Map();

  constructor(remote: GitRemote, opts: PublisherOptions = {}) {
    this.remote = remote;
    this.ref = opts.ref ?? LOG_REF;
    this.attempts = opts.attempts ?? 5;
    this.sleep = opts.sleep ?? (async () => {});
    this.maxTransfer = opts.maxTransfer ?? LOG_TRANSFER_LIMITS;
  }

  /** Resume from the ref: read the last log commit, the entries it published and its retained files. */
  static async open(remote: GitRemote, opts: PublisherOptions = {}): Promise<LogPublisher> {
    const p = new LogPublisher(remote, opts);
    const head = await remote.readRef(p.ref);
    if (head) {
      const files = await readLogFiles(remote, head);
      p.lastCommit = head;
      p.published = publishedLines(files);
      p.retained = new Map([...files].filter(([path]) => isRetainedPath(path)).map(([path, bytes]) => [path, fromUtf8(bytes)]));
      // The head's tree objects, rebuilt from its files; used only if they rebuild exactly that tree.
      const rebuilt = buildTree(Object.fromEntries(files));
      if (rebuilt.root === parseCommit((await remote.readObject(head)).data).tree) p.present = new Set(rebuilt.objects.map((o) => o.sha));
    }
    return p;
  }

  /** The last entry published, or -1 before the first publication (R-LOG-11). */
  get publishedThrough(): Seq {
    return this.published.length - 1;
  }

  get head(): Sha | null {
    return this.lastCommit;
  }

  /** The publication lag for a room whose head is `head` (R-LOG-11). */
  lag(head: Seq): number {
    return head - this.publishedThrough;
  }

  /**
   * Publish `entries` (the whole log from seq 0 through the checkpoint) and
   * the retained replay contexts and policies. Retained files of earlier
   * publications are kept, so `retained` needs to list only new ones.
   * Returns once the ref has been read back at the new commit.
   */
  async publish(entries: readonly LogEntry[], checkpoint: Checkpoint, retained: readonly Retained[] = []): Promise<PublishResult> {
    // Synchronous, before any await: from here on only the owned cohort is read.
    const cohort = this.own(entries, checkpoint, retained, this.retained);
    for (let seq = 0; seq < this.published.length; seq++)
      if (cohort.lines[seq] !== this.published[seq])
        throw new PublishError("would-rewrite", `entry ${seq} differs from the published entry; published history is never rewritten`);
    if (cohort.through === this.publishedThrough && this.lastCommit)
      return { commit: this.lastCommit, through: cohort.through, hash: cohort.hash, publishedThrough: cohort.through, attempts: 0 };

    const lease = this.lastCommit;
    const { commit, all } = build(lease, cohort);
    // Send only what the lease does not already hold: the new trees and blobs, and the commit.
    const send = all.filter((o) => o === commit || !this.present.has(o.sha));
    const bytes = send.reduce((n, o) => n + o.data.length, 0);
    if (send.length > this.maxTransfer.objects || bytes > this.maxTransfer.bytes)
      throw new PublishError(
        "cohort-too-large",
        `this publication adds ${send.length} objects, ${bytes} bytes; one push carries at most ${this.maxTransfer.objects} objects, ${this.maxTransfer.bytes} bytes. Nothing was pushed; publish a smaller cohort`,
      );

    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      if (attempt > 1) await this.sleep(attempt);
      const outcome = await this.remote.push(send, this.ref, commit.sha, lease);
      if (outcome.ok || outcome.reason !== "lease-mismatch") {
        // Read back: the only proof of where the ref is (R-LOG-8 step 5).
        const now = await this.remote.readRef(this.ref);
        if (now === commit.sha) return this.done(cohort, commit, all, attempt);
        if (now === lease) continue; // not applied: push the same commit again
        throw new PublishError("unexpected-writer", `${this.ref} is at ${now ?? "nothing"}, which this publisher did not write`);
      }
      if (outcome.current === commit.sha) return this.done(cohort, commit, all, attempt);
      throw new PublishError("unexpected-writer", `${this.ref} is at ${outcome.current ?? "nothing"}, not the lease ${lease ?? "nothing"}`);
    }
    throw new PublishError("unresolved", `no clear answer after ${this.attempts} attempts; publish again with the same entries`);
  }

  /**
   * The exact commit `publish` writes for this cohort on top of `parent`,
   * without pushing: the same owned copy and the same git serialization.
   * Pure, synchronous and deterministic. The Room stores it before any
   * remote write (lane A, `PublisherPort.commitFor`).
   *
   * `publish` keeps the retained files of the commit it last wrote. So when
   * `parent` is that commit, they are included here too; for any other
   * parent, only `retained` is. A Room that passes every retained file it
   * holds gets the same commit either way.
   */
  commitFor(parent: Sha | null, entries: readonly LogEntry[], checkpoint: Checkpoint, retained: readonly Retained[]): Sha {
    const cohort = this.own(entries, checkpoint, retained, parent === this.lastCommit ? this.retained : new Map());
    return build(parent, cohort).commit.sha;
  }

  /** Copy and check the caller's arguments, adding the retained files in `kept`. Synchronous. */
  private own(entries: readonly LogEntry[], checkpoint: Checkpoint, retained: readonly Retained[], kept: ReadonlyMap<string, string>): Cohort {
    const lines: string[] = [];
    let last: { seq: Seq; hash: Digest } | null = null;
    for (const [i, e] of entries.entries()) {
      const line = canonicalize(e);
      const copy = parseStrict(line) as LogEntry;
      if (copy.seq !== i) throw new PublishError("invalid-input", `entry ${i} has seq ${copy.seq}`);
      lines.push(line);
      last = { seq: copy.seq, hash: copy.hash };
    }
    if (!last) throw new PublishError("invalid-input", "there are no entries to publish");
    const text = canonicalize(checkpoint);
    const cp = parseStrict(text) as Checkpoint;
    if (cp.through !== last.seq || cp.hash !== last.hash)
      throw new PublishError("invalid-input", `the checkpoint names ${cp.through} ${cp.hash}, not the last entry`);
    const { sig, ...unsigned } = cp;
    if (!verifySig(cp.roomKey, sig, "artroom-checkpoint-v1", unsigned))
      throw new PublishError("invalid-input", "the checkpoint's signature is not valid");
    const files = new Map(kept);
    for (const r of retained) {
      const body = r.body;
      files.set(retainedPath({ kind: r.kind, body }), body);
    }
    return { lines, through: last.seq, hash: last.hash, checkpoint: text, at: cp.at, retained: files };
  }

  private done(cohort: Cohort, commit: GitObject, all: readonly GitObject[], attempts: number): PublishResult {
    this.lastCommit = commit.sha;
    this.published = cohort.lines;
    this.retained = cohort.retained;
    this.present = new Set(all.filter((o) => o !== commit).map((o) => o.sha));
    return { commit: commit.sha, through: cohort.through, hash: cohort.hash, publishedThrough: cohort.through, attempts };
  }
}

/** The one git serialization of a cohort on `parent`: its tree's objects and its commit. */
function build(parent: Sha | null, cohort: Cohort): { commit: GitObject; all: GitObject[] } {
  const files = layout(cohort.lines, cohort.retained, cohort.checkpoint);
  const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
  const who = identity(cohort.at);
  const commit = gitObject(
    "commit",
    encodeCommit({
      tree: root,
      parents: parent ? [parent] : [],
      author: who,
      committer: who,
      message: `artroom log through ${cohort.through}\n\nhash ${cohort.hash}\n`,
    }),
  );
  return { commit, all: [...objects, commit] };
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

/** The files under `artroom-log/v1/` in a log commit, by path. */
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
