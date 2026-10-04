/**
 * The git CLI adapter (Node only): reads and pushes `refs/artroom/log` on
 * any remote git understands: a local path, `file://`, or HTTPS, including
 * an Artifacts repository with a token in the URL. Objects are written into
 * a private bare staging repository first, then pushed with
 * `--force-with-lease` on the exact previous log commit, so the ref only
 * ever moves forward from the commit this publisher expects.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sha } from "@generalbusiness/artroom-contract";
import { StagingArea, type GitObject, type GitRemote, type ObjectType, type PushOutcome, type StageOutcome, type StagePart, type StageWant } from "./git.ts";

/** Hide Artifacts tokens and URL credentials in anything shown or thrown. */
export function redact(text: string): string {
  return text.replace(/art_v[0-9]+_[A-Za-z0-9_]+(\?expires=[0-9]+)?/g, "<token>").replace(/(https?:\/\/)[^@/\s]+@/g, "$1<credentials>@");
}

interface Run {
  readonly code: number;
  readonly out: Buffer;
  readonly err: string;
}

export class GitCli implements GitRemote {
  readonly remote: string;
  readonly dir: string;
  /** Refs read so far; a missing object is fetched from them once. */
  private readonly seen = new Set<string>();

  constructor(remote: string, dir: string) {
    this.remote = remote;
    this.dir = dir;
  }

  /** A remote with a fresh bare staging repository in the system's temporary directory. */
  static open(remote: string, dir?: string): GitCli {
    const d = dir ?? mkdtempSync(join(tmpdir(), "artroom-log-"));
    const cli = new GitCli(remote, d);
    cli.must(["init", "--bare", "--quiet", d], false);
    return cli;
  }

  private run(args: readonly string[], input?: Uint8Array, inRepo = true): Run {
    const r = spawnSync("git", inRepo ? ["--git-dir", this.dir, ...args] : [...args], {
      input,
      maxBuffer: 1 << 30,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { code: r.status ?? -1, out: r.stdout ?? Buffer.alloc(0), err: redact(String(r.stderr ?? "")) };
  }

  private must(args: readonly string[], inRepo = true, input?: Uint8Array): Buffer {
    const r = this.run(args, input, inRepo);
    if (r.code !== 0) throw new Error(`git ${redact(args.join(" "))} failed: ${r.err.trim()}`);
    return r.out;
  }

  async readRef(ref: string): Promise<Sha | null> {
    this.seen.add(ref);
    const out = this.must(["ls-remote", this.remote, ref]).toString().trim();
    const line = out.split("\n").find((l) => l.endsWith(`\t${ref}`));
    return line ? (line.slice(0, 40) as Sha) : null;
  }

  /** Fetch `ref` into the staging repository so its objects can be read. Returns the commit, or null. */
  async fetch(ref: string): Promise<Sha | null> {
    const at = await this.readRef(ref);
    if (!at) return null;
    this.must(["fetch", "--quiet", "--no-tags", this.remote, `+${ref}:refs/artroom-stage/log`]);
    return at;
  }

  /**
   * Fetch the room's pinned version heads (`refs/artroom/heads/*`), if it
   * has any, so that verify can check each version's changed paths against
   * Git objects (notes/2026-10-02-declared-acts.md section 4.3). Best effort:
   * without them, versions are reported `git-unwitnessed`.
   */
  async fetchPins(): Promise<void> {
    this.run(["fetch", "--quiet", "--no-tags", this.remote, "+refs/artroom/heads/*:refs/artroom-stage/heads/*"]);
  }

  async readObject(sha: Sha): Promise<{ readonly type: ObjectType; readonly data: Uint8Array }> {
    if (this.run(["cat-file", "-e", sha]).code !== 0) for (const ref of this.seen) await this.fetch(ref);
    const type = this.must(["cat-file", "-t", sha]).toString().trim() as ObjectType;
    return { type, data: new Uint8Array(this.must(["cat-file", type, sha])) };
  }

  /** Staging into the private staging repository: a completed object is written there and pushed with `next`. */
  private readonly staging = new StagingArea(
    (sha) => this.run(["cat-file", "-e", sha]).code === 0,
    (o) => {
      const sha = this.must(["hash-object", "-w", "-t", o.type, "--stdin"], true, o.data).toString().trim();
      if (sha !== o.sha) throw new Error(`git computed ${sha} for object ${o.sha}`);
    },
  );

  async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
    try {
      return this.staging.stage(cohort, want, parts);
    } catch (e) {
      return { ok: false, detail: redact((e as Error).message) };
    }
  }

  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    try {
      if (lease) await this.fetch(ref);
      for (const o of objects) {
        const sha = this.must(["hash-object", "-w", "-t", o.type, "--stdin"], true, o.data).toString().trim();
        if (sha !== o.sha) throw new Error(`git computed ${sha} for object ${o.sha}`);
      }
    } catch (e) {
      return { ok: false, reason: "unknown", detail: redact((e as Error).message) };
    }
    const r = this.run(["push", "--porcelain", "--no-verify", `--force-with-lease=${ref}:${lease ?? ""}`, this.remote, `${next}:${ref}`]);
    if (r.code === 0) return { ok: true };
    const text = `${r.out.toString()}\n${r.err}`;
    if (/stale info|fetch first|non-fast-forward|already exists/.test(text)) {
      try {
        return { ok: false, reason: "lease-mismatch", current: await this.readRef(ref) };
      } catch {
        // fall through: no clear answer
      }
    }
    return { ok: false, reason: "unknown", detail: redact(text.trim()) };
  }
}
