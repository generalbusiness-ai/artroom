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
import { LOG_REF, SEGMENT_SIZE, logFiles, segmentPath, type Retained } from "./entries.ts";
import { buildTree, encodeCommit, gitObject, parseCommit, parseTree, type GitObject, type GitReader, type GitRemote } from "./git.ts";

export type PublishErrorCode =
  /** The call would change an entry already published. Nothing was pushed. */
  | "would-rewrite"
  /** The entries or checkpoint are malformed: wrong order, wrong `through`, bad signature. */
  | "invalid-input"
  /** The ref holds a commit this publisher did not write. It stops; an admin must look. */
  | "unexpected-writer"
  /** Retries ran out with no clear answer. Call `publish` again with the same input: it completes forward. */
  | "unresolved";

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
}

/** Seconds since the epoch for an RFC 3339 time, for the commit's author line. */
function epoch(at: string): number {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) throw new PublishError("invalid-input", `checkpoint time ${at} is not RFC 3339`);
  return Math.floor(ms / 1000);
}

/** The commit's identity line. Fixed, so the same input always gives the same commit. */
function identity(at: string): string {
  return `Artroom Room <room@artroom.invalid> ${epoch(at)} +0000`;
}

export class LogPublisher {
  readonly remote: GitRemote;
  readonly ref: string;
  private readonly attempts: number;
  private readonly sleep: (attempt: number) => Promise<void>;
  private lastCommit: Sha | null = null;
  /** The canonical line of every published entry, by seq. */
  private published: string[] = [];

  constructor(remote: GitRemote, opts: PublisherOptions = {}) {
    this.remote = remote;
    this.ref = opts.ref ?? LOG_REF;
    this.attempts = opts.attempts ?? 5;
    this.sleep = opts.sleep ?? (async () => {});
  }

  /** Resume from the ref: read the last log commit and the hashes it published. */
  static async open(remote: GitRemote, opts: PublisherOptions = {}): Promise<LogPublisher> {
    const p = new LogPublisher(remote, opts);
    const head = await remote.readRef(p.ref);
    if (head) {
      p.lastCommit = head;
      p.published = (await readPublishedEntries(remote, head)).map((e) => canonicalize(e));
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
   * the retained replay contexts and policies. Returns once the ref has been
   * read back at the new commit.
   */
  async publish(entries: readonly LogEntry[], checkpoint: Checkpoint, retained: readonly Retained[] = []): Promise<PublishResult> {
    const last = entries.at(-1);
    if (!last) throw new PublishError("invalid-input", "there are no entries to publish");
    entries.forEach((e, i) => {
      if (e.seq !== i) throw new PublishError("invalid-input", `entry ${i} has seq ${e.seq}`);
    });
    if (checkpoint.through !== last.seq || checkpoint.hash !== last.hash)
      throw new PublishError("invalid-input", `the checkpoint names ${checkpoint.through} ${checkpoint.hash}, not the last entry`);
    const { sig, ...unsigned } = checkpoint;
    if (!verifySig(checkpoint.roomKey, sig, "artroom-checkpoint-v1", unsigned))
      throw new PublishError("invalid-input", "the checkpoint's signature is not valid");
    for (let seq = 0; seq < this.published.length; seq++)
      if (!entries[seq] || canonicalize(entries[seq]) !== this.published[seq])
        throw new PublishError("would-rewrite", `entry ${seq} differs from the published entry; published history is never rewritten`);
    if (last.seq === this.publishedThrough && this.lastCommit)
      return { commit: this.lastCommit, through: last.seq, hash: last.hash, publishedThrough: last.seq, attempts: 0 };

    const files = logFiles(entries, retained, checkpoint);
    const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
    const who = identity(checkpoint.at);
    const commit = gitObject(
      "commit",
      encodeCommit({
        tree: root,
        parents: this.lastCommit ? [this.lastCommit] : [],
        author: who,
        committer: who,
        message: `artroom log through ${last.seq}\n\nhash ${last.hash}\n`,
      }),
    );
    const all: GitObject[] = [...objects, commit];
    const lease = this.lastCommit;

    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      if (attempt > 1) await this.sleep(attempt);
      const outcome = await this.remote.push(all, this.ref, commit.sha, lease);
      if (outcome.ok || outcome.reason !== "lease-mismatch") {
        // Read back: the only proof of where the ref is (R-LOG-8 step 5).
        const now = await this.remote.readRef(this.ref);
        if (now === commit.sha) return this.done(entries, commit.sha, last, attempt);
        if (now === lease) continue; // not applied: push the same commit again
        throw new PublishError("unexpected-writer", `${this.ref} is at ${now ?? "nothing"}, which this publisher did not write`);
      }
      if (outcome.current === commit.sha) return this.done(entries, commit.sha, last, attempt);
      throw new PublishError("unexpected-writer", `${this.ref} is at ${outcome.current ?? "nothing"}, not the lease ${lease ?? "nothing"}`);
    }
    throw new PublishError("unresolved", `no clear answer after ${this.attempts} attempts; publish again with the same entries`);
  }

  private done(entries: readonly LogEntry[], commit: Sha, last: LogEntry, attempts: number): PublishResult {
    this.lastCommit = commit;
    this.published = entries.map((e) => canonicalize(e));
    return { commit, through: last.seq, hash: last.hash, publishedThrough: last.seq, attempts };
  }
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

/** The entries a log commit publishes, in order. */
export async function readPublishedEntries(reader: GitReader, commit: Sha): Promise<LogEntry[]> {
  const files = await readLogFiles(reader, commit);
  const entries: LogEntry[] = [];
  for (let first = 0; files.has(segmentPath(first)); first += SEGMENT_SIZE)
    for (const line of fromUtf8(files.get(segmentPath(first))!).split("\n")) entries.push(parseStrict(line) as LogEntry);
  return entries;
}

