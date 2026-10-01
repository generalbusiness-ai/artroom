/**
 * For tests and local development: an in-memory log remote with transport
 * faults, and a stand-in for lane L's `LogPublisher` with the same contract
 * (see `PublisherPort`). Phase 2 replaces the stand-in with
 * `LogPublisher.open(remote)` from `@generalbusiness/artroom-log`.
 *
 * Faults are only transport faults: a push whose reply is lost after the ref
 * moved, a read-back whose reply is lost, and another writer moving the ref.
 */

import type { Checkpoint, Digest, LogEntry, Seq, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "../canonical.ts";
import { sha256Hex } from "../crypto.ts";
import { publicationFiles } from "../log.ts";
import type { PublisherPort, RetainedFile } from "../ports.ts";

export interface LogCommit {
  readonly parent: Sha | null;
  readonly files: Readonly<Record<string, string>>;
  readonly through: Seq;
}

export class MemoryLogRemote {
  readonly commits = new Map<Sha, LogCommit>();
  ref: Sha | null = null;
  pushes = 0;
  /** Faults for the next calls: the push applies but its reply is lost; the read-back after a push is lost. */
  readonly faults = { lostPushReply: 0, lostReadReply: 0 };
  private pushedSinceRead = false;

  async push(commit: Sha, body: LogCommit, lease: Sha | null): Promise<{ readonly ok: true } | { readonly ok: false; readonly current: Sha | null }> {
    this.pushes++;
    this.pushedSinceRead = true;
    if (this.ref !== lease) return { ok: false, current: this.ref };
    this.commits.set(commit, body);
    this.ref = commit;
    if (this.faults.lostPushReply > 0) {
      this.faults.lostPushReply--;
      throw new Error("the push reply was lost");
    }
    return { ok: true };
  }

  async readRef(): Promise<Sha | null> {
    const afterPush = this.pushedSinceRead;
    this.pushedSinceRead = false;
    if (afterPush && this.faults.lostReadReply > 0) {
      this.faults.lostReadReply--;
      throw new Error("the read-back reply was lost");
    }
    return this.ref;
  }

  /** Another writer moves the ref. */
  foreignWrite(): Sha {
    const sha = sha256Hex(utf8(`foreign ${this.commits.size} ${this.ref}`)).slice(0, 40) as Sha;
    this.commits.set(sha, { parent: this.ref, files: {}, through: -1 });
    this.ref = sha;
    return sha;
  }
}

const publishError = (code: string, message: string) => Object.assign(new Error(message), { name: "PublishError", code, retryable: code === "unresolved" });

/** A stand-in with lane L's `LogPublisher` contract: deterministic commits, a lease, read-back, never forced. */
export class MemoryLogPublisher implements PublisherPort {
  private last: Sha | null = null;
  private lines: readonly string[] = [];

  private constructor(private readonly remote: MemoryLogRemote) {}

  /** Resume from the ref, as `LogPublisher.open` does after a restart. */
  static async open(remote: MemoryLogRemote): Promise<MemoryLogPublisher> {
    const p = new MemoryLogPublisher(remote);
    const head = await remote.readRef();
    const c = head ? remote.commits.get(head) : undefined;
    if (head && c) {
      p.last = head;
      p.lines = Object.keys(c.files)
        .filter((k) => k.includes("/segments/"))
        .sort()
        .flatMap((k) => c.files[k]!.split("\n"));
    }
    return p;
  }

  get publishedThrough(): Seq {
    return this.lines.length - 1;
  }

  get head(): Sha | null {
    return this.last;
  }

  async publish(entries: readonly LogEntry[], checkpoint: Checkpoint, retained: readonly RetainedFile[]) {
    const lines = entries.map((e) => canonicalize(e));
    for (let i = 0; i < this.lines.length; i++)
      if (lines[i] !== this.lines[i]) throw publishError("would-rewrite", `entry ${i} differs from the published entry`);
    const last = entries[entries.length - 1];
    if (!last || checkpoint.through !== last.seq || checkpoint.hash !== last.hash) throw publishError("invalid-input", "the checkpoint does not name the last entry");
    const done = (commit: Sha) => {
      this.last = commit;
      this.lines = lines;
      return { commit, through: last.seq, hash: last.hash as Digest, publishedThrough: last.seq };
    };
    if (last.seq === this.publishedThrough && this.last) return done(this.last);
    const genesis = (entries[0]!.entry as unknown as { event: { genesis: never } }).event.genesis;
    const files = publicationFiles(genesis, entries, retained.map((r) => ({ digest: `sha256:${sha256Hex(utf8(r.body))}`, kind: r.kind, body: r.body })), checkpoint);
    const lease = this.last;
    const commit = sha256Hex(utf8(canonicalize({ parent: lease, files }))).slice(0, 40) as Sha;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let outcome: Awaited<ReturnType<MemoryLogRemote["push"]>> | null = null;
      try {
        outcome = await this.remote.push(commit, { parent: lease, files, through: last.seq }, lease);
      } catch {
        outcome = null; // an unclear answer: read back
      }
      if (outcome && !outcome.ok) {
        if (outcome.current === commit) return done(commit);
        throw publishError("unexpected-writer", `the log ref is at ${outcome.current ?? "nothing"}, not ${lease ?? "nothing"}`);
      }
      const now = await this.remote.readRef();
      if (now === commit) return done(commit);
      if (now === lease) continue;
      throw publishError("unexpected-writer", `the log ref is at ${now ?? "nothing"}, which this publisher did not write`);
    }
    throw publishError("unresolved", "no clear answer; publish again with the same input");
  }
}
