// Test support: SQLite through node:sqlite, real git through child_process,
// a fake Room, fake publication tokens, and a canonical repository, on disk
// for real git (`Fixture`) or in memory for the landing engine
// (`MemoryCanonical`). Both are built from the same git objects, written
// here without a subprocess (`GitObjects`).
import { DatabaseSync } from "node:sqlite";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import type { ActId, LaneId, OpId, PolicyVersion, RetainedLandInput, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import type { Sql, SqlValue, SqlRow } from "../src/sql.ts";
import type { Exec } from "../src/publisher/gitops.ts";
import { GitOps, integrationMessage, integrationRef, pinnedRef } from "../src/publisher/gitops.ts";
import type { LaneFacts, LandRecord, LandingRoom, Readiness } from "../src/landing/types.ts";
import { publicationTokens, type PublicationToken, type PublicationTokens, type PublisherPort } from "../src/landing/engine.ts";
import type { PushOutcome } from "../src/publisher/push-outcome.ts";
import { MintLedger, type MintRepo, errorNote } from "../src/mints.ts";
import type { IntegrateResult } from "../src/landing/core.ts";
import type { TreeEntry, TreeReader } from "../src/diff/treediff.ts";
import type { MintedToken, TokenInfo } from "../src/artifacts.ts";

/** node:sqlite as `Sql`. Nested transactions use savepoints, like a Durable Object's transactionSync. */
export function nodeSql(path = ":memory:"): Sql & { db: DatabaseSync } {
  const db = new DatabaseSync(path);
  let depth = 0;
  return {
    db,
    all(query: string, ...bindings: SqlValue[]): SqlRow[] {
      return db.prepare(query).all(...bindings) as SqlRow[];
    },
    transaction<T>(fn: () => T): T {
      const name = `sp${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const out = fn();
        db.exec(`RELEASE ${name}`);
        return out;
      } catch (e) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/**
 * The PATH test processes run with. Git's own directory of programs comes
 * first, so `git` is the program itself and not a launcher that finds it on
 * every call (on macOS, /usr/bin/git is one, and doubles the cost of a call).
 */
const PATH = (() => {
  const path = process.env["PATH"] ?? "/usr/bin:/bin";
  try {
    const core = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    return core && existsSync(join(core, "git")) ? `${core}${delimiter}${path}` : path;
  } catch {
    return path;
  }
})();

/** Runs a process with exactly the given environment plus PATH. */
export const localExec: Exec = (argv, opts) =>
  new Promise((resolve) => {
    const [cmd, ...args] = argv;
    const child = execFile(
      cmd!,
      args,
      { cwd: opts.cwd, env: { ...opts.env, PATH }, timeout: opts.timeoutMs, maxBuffer: 64 << 20 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    child.stdin?.end(opts.stdin ? Buffer.from(opts.stdin) : undefined);
  });

export function tmp(prefix = "artroom-git-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** A plain git helper for building test repositories (not hardened; test data only). */
export async function sh(cwd: string, ...args: string[]): Promise<string> {
  const r = await localExec(["git", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    env: {
      HOME: cwd,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@invalid",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@invalid",
      GIT_AUTHOR_DATE: "@1700000000 +0000",
      GIT_COMMITTER_DATE: "@1700000000 +0000",
    },
  });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// ------------------------------------------------------------ git objects, built without a subprocess

type ObjectType = "blob" | "tree" | "commit";
interface GitObject {
  readonly type: ObjectType;
  readonly body: Uint8Array;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** What a commit object says. */
export interface CommitFacts {
  readonly tree: string;
  readonly parents: readonly string[];
  /** The committer's time, in seconds. */
  readonly at: number;
  /** The object's bytes as text, exactly as git stores them. */
  readonly raw: string;
}

/** How a test commit differs from the default one. */
export interface CommitOptions {
  /** Author and committer time, in seconds. */
  readonly at?: number;
  readonly message?: string;
  /** Author and committer, as `name <email>`. */
  readonly who?: string;
  /** Extra header lines after `committer`, each ending in a newline (jj's `change-id`, for example). */
  readonly headers?: string;
  /** The whole tree is `files`: nothing is taken from the first parent. */
  readonly exact?: boolean;
}

/**
 * Git blobs, trees and commits, built and hashed here as git does. A test
 * repository costs no subprocess, and real git reads the same objects once
 * they are written into a repository (`writeInto`).
 */
export class GitObjects {
  private readonly objects = new Map<string, GitObject>();
  private readonly written = new Map<string, Set<string>>();
  /** Reads an object this store did not build (one real git made). */
  private readonly load: (sha: string) => GitObject | null;

  constructor(load: (sha: string) => GitObject | null = () => null) {
    this.load = load;
  }

  private put(type: ObjectType, body: Uint8Array): string {
    const sha = createHash("sha1").update(`${type} ${body.length}\0`).update(body).digest("hex");
    if (!this.objects.has(sha)) this.objects.set(sha, { type, body });
    return sha;
  }

  private get(sha: string, type: ObjectType): Uint8Array {
    const o = this.objects.get(sha) ?? this.load(sha);
    if (!o) throw new Error(`no git object ${sha}`);
    if (o.type !== type) throw new Error(`${sha} is a ${o.type}, not a ${type}`);
    return o.body;
  }

  has(sha: string): boolean {
    return this.objects.has(sha) || this.load(sha) !== null;
  }

  blob(content: string | Uint8Array): string {
    return this.put("blob", typeof content === "string" ? utf8.encode(content) : content);
  }

  /** The tree of regular files `files` (path to blob), with a tree for each directory. */
  tree(files: ReadonlyMap<string, string>): string {
    const here: { name: string; mode: string; sha: string }[] = [];
    const dirs = new Map<string, Map<string, string>>();
    for (const [path, blob] of files) {
      const slash = path.indexOf("/");
      if (slash < 0) here.push({ name: path, mode: "100644", sha: blob });
      else {
        const dir = path.slice(0, slash);
        if (!dirs.has(dir)) dirs.set(dir, new Map());
        dirs.get(dir)!.set(path.slice(slash + 1), blob);
      }
    }
    for (const [name, inside] of dirs) here.push({ name, mode: "40000", sha: this.tree(inside) });
    // Git's order: by name as bytes, a directory's name ending in "/".
    const key = (e: { name: string; mode: string }) => Buffer.from(e.mode === "40000" ? `${e.name}/` : e.name);
    here.sort((a, b) => Buffer.compare(key(a), key(b)));
    return this.put("tree", Buffer.concat(here.map((e) => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.sha, "hex")]))));
  }

  /** A commit of `files` (path to text; null removes the path) on top of its first parent's files. */
  commit(parents: readonly string[], files: Readonly<Record<string, string | null>>, o: CommitOptions = {}): string {
    const all = new Map<string, string>(parents[0] && !o.exact ? this.files(parents[0]) : []);
    for (const [path, body] of Object.entries(files)) {
      // A file where a directory was, or a directory where a file was, replaces it.
      for (const p of [...all.keys()]) if (p === path || p.startsWith(`${path}/`) || path.startsWith(`${p}/`)) all.delete(p);
      if (body !== null) all.set(path, this.blob(body));
    }
    return this.commitTree(this.tree(all), parents, o);
  }

  commitTree(tree: string, parents: readonly string[], o: CommitOptions = {}): string {
    const who = `${o.who ?? "test <test@invalid>"} ${o.at ?? 1_700_000_000} +0000`;
    const head = [`tree ${tree}`, ...parents.map((p) => `parent ${p}`), `author ${who}`, `committer ${who}`].join("\n");
    return this.put("commit", utf8.encode(`${head}\n${o.headers ?? ""}\n${o.message ?? "c\n"}`));
  }

  commitFacts(sha: string): CommitFacts {
    const raw = fromUtf8.decode(this.get(sha, "commit"));
    const head = raw.slice(0, raw.indexOf("\n\n"));
    return {
      tree: /^tree ([0-9a-f]{40})$/m.exec(head)![1]!,
      parents: [...head.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]!),
      at: Number(/^committer .* (\d+) [+-]\d{4}$/m.exec(head)![1]),
      raw,
    };
  }

  /** A tree's entries, as the Artifacts binding's `readTree` gives them. */
  entries(tree: string): TreeEntry[] {
    const body = Buffer.from(this.get(tree, "tree"));
    const out: TreeEntry[] = [];
    for (let i = 0; i < body.length; ) {
      const space = body.indexOf(0x20, i);
      const nul = body.indexOf(0, space);
      const mode = body.toString("utf8", i, space);
      const type: TreeEntry["type"] = mode === "40000" ? "tree" : mode === "100755" ? "exec" : mode === "120000" ? "symlink" : mode === "160000" ? "gitlink" : "blob";
      out.push({ name: body.toString("utf8", space + 1, nul), mode, hash: body.toString("hex", nul + 1, nul + 21), type });
      i = nul + 21;
    }
    return out;
  }

  /** Every file of a commit: path to blob. */
  files(commit: string): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (tree: string, prefix: string) => {
      for (const e of this.entries(tree)) {
        if (e.type === "tree") walk(e.hash, `${prefix}${e.name}/`);
        else out.set(`${prefix}${e.name}`, e.hash);
      }
    };
    walk(this.commitFacts(commit).tree, "");
    return out;
  }

  /** The tree at a directory of a commit (`""` is the root). */
  treeAt(commit: string, dir: string): string {
    let tree = this.commitFacts(commit).tree;
    for (const name of dir.split("/").filter(Boolean)) {
      const e = this.entries(tree).find((x) => x.name === name && x.type === "tree");
      if (!e) throw new Error(`${commit} has no directory ${dir}`);
      tree = e.hash;
    }
    return tree;
  }

  /** The text of one file of a commit. */
  text(commit: string, path: string): string {
    const blob = this.files(commit).get(path);
    if (!blob) throw new Error(`${commit} has no file ${path}`);
    return fromUtf8.decode(this.get(blob, "blob"));
  }

  /** True if `a` is `b` or one of its ancestors. */
  isAncestor(a: string, b: string): boolean {
    const seen = new Set<string>();
    const todo = [b];
    while (todo.length > 0) {
      const c = todo.pop()!;
      if (c === a) return true;
      if (seen.has(c)) continue;
      seen.add(c);
      todo.push(...this.commitFacts(c).parents);
    }
    return false;
  }

  /** A tree reader over these objects, shaped like the Artifacts binding, that counts its reads. */
  reader(): TreeReader & { treeReads: number; commitReads: number } {
    const r = {
      treeReads: 0,
      commitReads: 0,
      readTree: async (hash: string) => {
        r.treeReads++;
        return this.entries(hash);
      },
      readCommit: async (hash: string) => {
        r.commitReads++;
        const c = this.commitFacts(hash);
        return { treeHash: c.tree, parents: c.parents, committedAt: c.at };
      },
    };
    return r;
  }

  /** Write every object not yet there into a repository, as loose objects. */
  writeInto(gitDir: string): void {
    let done = this.written.get(gitDir);
    if (!done) this.written.set(gitDir, (done = new Set()));
    for (const [sha, o] of this.objects) {
      if (done.has(sha)) continue;
      done.add(sha);
      writeLoose(gitDir, o.type, o.body);
    }
  }
}

/** Write one object into a repository on disk as a loose object, and return its ID. */
export function writeLoose(gitDir: string, type: ObjectType, body: Uint8Array): string {
  const all = Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body]);
  const sha = createHash("sha1").update(all).digest("hex");
  const dir = join(gitDir, "objects", sha.slice(0, 2));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, sha.slice(2)), deflateSync(all));
  return sha;
}

/** The IDs of every loose object in a repository on disk, sorted; fails if the repository also holds a pack. */
export function looseIds(gitDir: string): string[] {
  const objects = join(gitDir, "objects");
  const ids: string[] = [];
  for (const dir of readdirSync(objects)) {
    if (dir === "pack") {
      if (readdirSync(join(objects, dir)).length > 0) throw new Error(`${gitDir} holds a pack: its objects are not all loose`);
    } else if (/^[0-9a-f]{2}$/.test(dir)) for (const file of readdirSync(join(objects, dir))) ids.push(dir + file);
  }
  return ids.sort();
}

/** The objects of a repository on disk, read from its loose objects. */
export function objectsIn(gitDir: string): GitObjects {
  return new GitObjects((sha) => looseObject(gitDir, sha));
}

/** An empty bare repository, as `git init --bare` leaves it for these tests. */
export function bareRepo(dir: string): string {
  mkdirSync(join(dir, "objects"), { recursive: true });
  mkdirSync(join(dir, "refs", "heads"), { recursive: true });
  writeFileSync(join(dir, "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(dir, "config"), "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = true\n");
  return dir;
}

/** Where a ref of a repository on disk is, or null. Read from the files git keeps. */
export function readRef(gitDir: string, ref: string): string | null {
  const loose = join(gitDir, ref);
  if (existsSync(loose)) return readFileSync(loose, "utf8").trim();
  const packed = join(gitDir, "packed-refs");
  if (!existsSync(packed)) return null;
  const line = readFileSync(packed, "utf8").split("\n").find((l) => l.endsWith(` ${ref}`));
  return line ? line.slice(0, 40) : null;
}

/** Set a ref of a repository on disk, as `git update-ref` would; null deletes it. */
export function writeRef(gitDir: string, ref: string, sha: string | null): void {
  const file = join(gitDir, ref);
  if (sha === null) return rmSync(file, { force: true });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${sha}\n`);
}

/** A loose object of a repository on disk, or null. Small pushes and git's own commits are stored loose. */
export function looseObject(gitDir: string, sha: string): GitObject | null {
  const file = join(gitDir, "objects", sha.slice(0, 2), sha.slice(2));
  if (!existsSync(file)) return null;
  const all = inflateSync(readFileSync(file));
  const nul = all.indexOf(0);
  return { type: all.toString("utf8", 0, all.indexOf(0x20)) as ObjectType, body: all.subarray(nul + 1) };
}

const BASE_FILES = { "README.md": "hello\n", "src/a.txt": lines("a"), "src/b.txt": lines("b") };

/** A canonical repository with one commit on main, and what a test does to it. */
abstract class CanonicalModel {
  abstract readonly git: GitObjects;
  /** The first commit on main. */
  main!: Sha;

  abstract ref(ref: string): string | null;
  abstract setRef(ref: string, sha: string | null): void;
  /** Called when new objects must reach the repository. */
  protected stored(): void {}

  init(files: Record<string, string> = BASE_FILES): this {
    this.main = this.commit([], files, { message: "base\n" });
    this.setRef("refs/heads/main", this.main);
    return this;
  }

  /** Commit `files` on top of `parents` (the first parent's files are the base) into the repository. No ref names it. */
  commit(parents: string | readonly string[], files: Record<string, string | null>, o: CommitOptions = {}): Sha {
    const sha = this.git.commit(typeof parents === "string" ? [parents] : parents, files, o) as Sha;
    this.stored();
    return sha;
  }

  /** Commit `files` on top of `base` and pin it as (lane, generation) in the canonical repo. */
  propose(lane: string, generation: number, base: string, files: Record<string, string | null>, message = `${lane} g${generation}\n`): Sha {
    const head = this.commit(base, files, { message });
    this.setRef(pinnedRef(lane, generation), head);
    return head;
  }

  /** Move main, as another writer would. */
  setMain(sha: string): void {
    this.setRef("refs/heads/main", sha);
  }

  canonicalMain(): string {
    const main = this.ref("refs/heads/main");
    if (!main) throw new Error("canonical main is missing");
    return main;
  }

  show(rev: string, path: string): string {
    return this.git.text(rev, path);
  }

  parents(rev: string): readonly string[] {
    return this.git.commitFacts(rev).parents;
  }
}

/**
 * A canonical bare repository on disk, for real git: one commit on main, and
 * GitOps for the "publisher". The fixture writes its commits and refs as
 * files, and reads refs and objects back from the files git keeps, so only
 * the commands under test start a process.
 */
export class Fixture extends CanonicalModel {
  readonly root = tmp();
  readonly canonical = bareRepo(join(this.root, "canonical.git"));
  readonly git = new GitObjects((sha) => looseObject(this.canonical, sha));
  readonly ops: GitOps;

  constructor(exec: Exec = localExec) {
    super();
    this.ops = this.sandbox("publisher", exec);
  }

  /** Another publisher sandbox on this fixture's disk: empty, as after a restart, unless `name` was used before. */
  sandbox(name: string, exec: Exec = localExec): GitOps {
    mkdirSync(join(this.root, name), { recursive: true });
    return new GitOps({ exec, workdir: join(this.root, name), config: ["protocol.file.allow=always"] });
  }

  /** Another empty bare repository under this fixture's root. */
  bare(name: string): string {
    return bareRepo(join(this.root, name));
  }

  protected override stored(): void {
    this.git.writeInto(this.canonical);
  }
  ref(ref: string): string | null {
    return readRef(this.canonical, ref);
  }
  setRef(ref: string, sha: string | null): void {
    writeRef(this.canonical, ref, sha);
  }

  dispose(): void {
    cleanup(this.root);
  }
}

/**
 * The canonical repository in memory, for the landing engine's tests: the
 * same commits as `Fixture`, and a publisher that answers as `GitPublisher`
 * does over real git. `test/landing-git.test.ts` runs one script through
 * both and compares every answer, the integration commit included.
 *
 * It merges by whole files: a path changed on both sides is a conflict.
 */
export class MemoryCanonical extends CanonicalModel {
  readonly git = new GitObjects();
  private readonly refs = new Map<string, string>();

  ref(ref: string): string | null {
    return this.refs.get(ref) ?? null;
  }
  setRef(ref: string, sha: string | null): void {
    if (sha === null) this.refs.delete(ref);
    else this.refs.set(ref, sha);
  }

  /** The nearest commit that both `a` and `b` descend from. */
  private mergeBase(a: string, b: string): string | null {
    const todo = [b];
    const seen = new Set<string>();
    while (todo.length > 0) {
      const c = todo.shift()!;
      if (seen.has(c)) continue;
      seen.add(c);
      if (this.git.isAncestor(c, a)) return c;
      todo.push(...this.git.commitFacts(c).parents);
    }
    return null;
  }

  readonly publisher: PublisherPort = {
    integrate: async (req): Promise<IntegrateResult> => {
      const headRef = pinnedRef(req.lane, req.generation);
      const failed = (): IntegrateResult => ({ kind: "error", detail: errorNote("integration failed", new Error("the head or the expected main is not in the canonical repository")) });
      if (!this.git.has(req.expectedMain) || this.ref(headRef) !== req.head) return failed();
      if (this.git.isAncestor(req.expectedMain, req.head)) return { kind: "clean", integration: req.head, ref: headRef };
      const base = this.mergeBase(req.expectedMain, req.head);
      if (base === null) return failed();
      const [from, ours, theirs] = [base, req.expectedMain, req.head].map((c) => this.git.files(c)) as [Map<string, string>, Map<string, string>, Map<string, string>];
      const merged: Record<string, string | null> = {};
      const conflicts: string[] = [];
      for (const path of new Set([...ours.keys(), ...theirs.keys()])) {
        const [b, o, t] = [from.get(path), ours.get(path), theirs.get(path)];
        if (o === t || t === b) continue; // as on main
        if (o !== b) conflicts.push(path);
        else merged[path] = t === undefined ? null : this.git.text(req.head, path);
      }
      if (conflicts.length > 0) return { kind: "conflict", paths: conflicts.sort() };
      // The commit GitOps.integrate builds: parents (main, head), dated at the later parent, in the Room's name.
      const at = Math.max(this.git.commitFacts(req.expectedMain).at, this.git.commitFacts(req.head).at);
      const integration = this.git.commit([req.expectedMain, req.head], merged, { at, who: "artroom <room@artroom.invalid>", message: integrationMessage(req.lane, req.generation) }) as Sha;
      const ref = integrationRef(req.op, req.attempt);
      this.setRef(ref, integration);
      return { kind: "clean", integration, ref };
    },
    push: async (req): Promise<PushOutcome> => {
      const main = this.ref("refs/heads/main");
      // As a sandbox that has nothing: the integration is fetched from the ref the engine names, or nothing is sent.
      if (this.ref(req.integrationRef) !== req.integration) return { outcome: "error", detail: `before the push: integration ${req.integration} not found at ${req.integrationRef}` };
      // Git checks no lease when nothing would change.
      if (main === req.integration) return { outcome: "landed", detail: "=\trefs/heads/main\t[up to date]" };
      if (main !== req.expectedMain) return { outcome: "rejected", reason: "lease", detail: "!\trefs/heads/main\t[rejected] (stale info)" };
      this.setMain(req.integration);
      return { outcome: "landed", detail: " \trefs/heads/main\tupdated" };
    },
    readMain: async (): Promise<Sha> => this.canonicalMain() as Sha,
  };

  dispose(): void {}
}

export function lines(tag: string, n = 20): string {
  return Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}\n`).join("");
}

export function edit(text: string, line: number, replacement: string): string {
  const ls = text.split("\n");
  ls[line - 1] = replacement;
  return ls.join("\n");
}

const hex8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
export const actId = (seq: number): ActId => `act_${seq}_${hex8(String(seq))}`;
export const laneId = (n: number): LaneId => actId(1000 + n);

/** The Room's side, with every fact a test may change. */
export class FakeRoom implements LandingRoom {
  seq = 100;
  readonly log: { seq: number; act: ActId; event: SystemEvent }[] = [];
  readonly lanes = new Map<LaneId, LaneFacts>();
  policy: PolicyVersion = actId(1);
  /** Per-operation re-validation failures (authority, evidence, land input). */
  readonly invalid = new Map<OpId, { reason: "authority-lost" | "evidence-invalid" | "obligation-open"; fix: string }>();
  /** Per-operation readiness; default: ready with one approval and a retained reservation input. */
  readonly readinessOf = new Map<OpId, (integration: Sha) => Readiness | Promise<Readiness>>();
  readinessCalls = 0;
  /** What rebuilding the reservation-stage land input gives now, per operation (default: a fixed text). */
  readonly inputNow = new Map<OpId, string>();
  /** The `retained` each reservation was asked to compare. */
  readonly compared: (RetainedLandInput | null)[] = [];

  inputOf(op: OpId): string {
    return this.inputNow.get(op) ?? `{"op":"${op}","reviews":["approve"],"stage":"reservation"}`;
  }

  lane(lane: LaneId): LaneFacts | null {
    return this.lanes.get(lane) ?? null;
  }
  policyVersion(): PolicyVersion {
    return this.policy;
  }
  /** Synchronous, like the Room's: compares bytes, never hashes (R-LAND-7). */
  revalidate(op: LandRecord, retained: RetainedLandInput | null) {
    this.compared.push(retained);
    const invalid = this.invalid.get(op.id);
    if (invalid) return invalid;
    if (retained && retained.canonical !== this.inputOf(op.id)) {
      return { reason: "obligation-open" as const, fix: "The land rules' input changed since preparation. Land again." };
    }
    return null;
  }
  async readiness(op: LandRecord, integration: Sha): Promise<Readiness> {
    this.readinessCalls++;
    const f = this.readinessOf.get(op.id);
    if (f) return f(integration);
    const canonical = this.inputOf(op.id);
    return { kind: "ready", evidence: [actId(50)], retained: { stage: "reservation", canonical, digest: `sha256:${createHash("sha256").update(canonical).digest("hex")}` } };
  }
  revertScope(): readonly string[] {
    return ["src/**"];
  }
  record(event: SystemEvent): { seq: number; act: ActId } {
    const seq = ++this.seq;
    const act = actId(seq);
    this.log.push({ seq, act, event });
    return { seq, act };
  }
  /** Events of one type, optionally for one operation. */
  events<T extends SystemEvent["type"]>(type: T, op?: OpId): Extract<SystemEvent, { type: T }>[] {
    return this.log
      .map((e) => e.event)
      .filter((e): e is Extract<SystemEvent, { type: T }> => e.type === type && (op === undefined || (e as { op?: OpId }).op === op));
  }
  hold(lane: LaneId, generation: number, head: Sha, leaseGeneration = 1): void {
    this.lanes.set(lane, { generation, head, leaseGeneration, holder: "held" });
  }
}

/** Publication tokens that only count. `live` is every minted, unrevoked token. No ledger: `claim` does nothing. */
export class FakeTokens implements PublicationTokens {
  minted = 0;
  readonly live = new Set<string>();
  readonly revoked: string[] = [];
  /** The owner each mint was asked for, in order. */
  readonly owners: string[] = [];
  failMint = false;
  async mint(owner = "test"): Promise<PublicationToken> {
    this.owners.push(owner);
    if (this.failMint) throw new Error("Artifacts unavailable (mint)");
    const id = `tok_${++this.minted}`;
    this.live.add(id);
    return { id, plaintext: `art_v1_${"f".repeat(40)}${this.minted}?expires=1`, expiresAt: null, claim: () => {}, release: async () => void (await this.revoke(id)) };
  }
  async revoke(id: string) {
    if (this.failRevoke) throw new Error("Artifacts unavailable (revoke)");
    this.revoked.push(id);
    return this.live.delete(id);
  }
  failRevoke = false;
  /** True if this plaintext belongs to a minted, unrevoked token. */
  isLive(plaintext: string): boolean {
    const n = /f{40}(\d+)\?/.exec(plaintext)?.[1];
    return n !== undefined && this.live.has(`tok_${n}`);
  }
}

/** A deferred promise. */
export function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

/**
 * Wraps a publisher so a test can:
 * - hold any push before it reaches the remote (`pausePushes`), then release
 *   it, or make the engine stop waiting for it (`abandon`) while the push
 *   itself still runs later, as a push that outlives its caller would;
 * - make pushes, integrations or reads of main fail (`pushDown`, `down`,
 *   `readMainDown`);
 * - check the push's token when it reaches the remote (`authAtRemote`):
 *   a revoked token is refused before anything is sent (`error`).
 */
export class ControlledPublisher implements PublisherPort {
  readonly inner: PublisherPort;
  pausePushes = false;
  pauseIntegrations = false;
  down = false;
  pushDown = false;
  readMainDown = false;
  authAtRemote: { isLive(plaintext: string): boolean } | null = null;
  pushes = 0;
  integrations = 0;
  readonly paused: { n: number; release: () => void; abandon: () => void; done: Promise<unknown> }[] = [];
  readonly pausedIntegrations: { release: () => void }[] = [];
  /** Every push that reached the remote, settled or not. */
  readonly inFlight: Promise<unknown>[] = [];
  private waiters: (() => void)[] = [];

  constructor(inner: PublisherPort) {
    this.inner = inner;
  }

  async integrate(req: Parameters<PublisherPort["integrate"]>[0]) {
    this.integrations++;
    if (this.down) throw new Error("publisher sandbox unavailable");
    if (this.pauseIntegrations) {
      const gate = deferred();
      this.pausedIntegrations.push({ release: () => gate.resolve() });
      for (const w of this.waiters.splice(0)) w();
      await gate.promise;
    }
    return this.inner.integrate(req);
  }

  private remote(req: Parameters<PublisherPort["push"]>[0]): Promise<PushOutcome> {
    if (this.authAtRemote && !this.authAtRemote.isLive(req.token)) {
      return Promise.resolve({ outcome: "error", detail: "HTTP 401 at discovery: token revoked" });
    }
    return this.inner.push(req);
  }

  push(req: Parameters<PublisherPort["push"]>[0]): Promise<PushOutcome> {
    this.pushes++;
    if (this.down || this.pushDown) return Promise.reject(new Error("publisher sandbox unavailable"));
    if (!this.pausePushes) {
      const p = this.remote(req);
      this.inFlight.push(p);
      return p;
    }
    const gate = deferred();
    const answer = deferred<PushOutcome>();
    const done = (async () => {
      await gate.promise;
      return this.remote(req);
    })();
    this.inFlight.push(done);
    done.then((o) => answer.resolve(o), (e) => answer.reject(e));
    this.paused.push({
      n: req.n,
      release: () => gate.resolve(),
      abandon: () => answer.resolve({ outcome: "unknown", detail: "no answer before the deadline" }),
      done,
    });
    for (const w of this.waiters.splice(0)) w();
    return answer.promise;
  }

  async readMain() {
    if (this.down || this.readMainDown) throw new Error("Artifacts unavailable (read main)");
    return this.inner.readMain();
  }

  /** Resolves when `count` pushes (or integrations) are paused. */
  async waitPaused(count: number, what: "push" | "integration" = "push"): Promise<void> {
    const list = () => (what === "push" ? this.paused.length : this.pausedIntegrations.length);
    while (list() < count) await new Promise<void>((r) => this.waiters.push(r));
  }

  /** Wait for every push that reached the remote to finish. */
  async drain(): Promise<void> {
    await Promise.allSettled(this.inFlight);
  }
}

/** A clock tests move by hand. */
export class Clock {
  t = 1_800_000_000_000;
  now = () => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export const opId = (n: number): OpId => `op_land_${n}`;

// ------------------------------------------------------------ the canonical mint ledger (mint lane B)

/** An Artifacts error, as the binding throws it. */
export class ArtifactsError extends Error {
  readonly code: string;
  readonly numericCode: number;
  constructor(code: string, numericCode: number, text = `${code} (${numericCode})`) {
    super(text);
    this.code = code;
    this.numericCode = numericCode;
  }
}

/** What one `createToken` call does. */
export type CreatePlan =
  | "ok" //          applies and answers
  | "apply-throw" // applies, then INTERNAL_ERROR (retriable)
  | "lose" //        applies, then a transport failure: the answer is lost
  | "drop" //        a transport failure; nothing applies
  | "hold"; //       applies; the answer waits for the test (`held`)

interface CanonicalToken {
  readonly id: string;
  readonly plaintext: string;
  readonly scope: "read" | "write";
  state: TokenInfo["state"];
  readonly expiresAt: number;
}

/**
 * The canonical repository's tokens, as the ledger and publication tokens
 * see them: creates can apply and fail, lose their answer, or be held;
 * revocations can fail or be held. Tokens' text has the Artifacts shape,
 * so `noTokens` finds any that leaks.
 */
export class FakeCanonical implements MintRepo {
  readonly clock: Clock;
  readonly tokens: CanonicalToken[] = [];
  plans: CreatePlan[] = [];
  /** Every create asked: scope and lifetime (s). */
  readonly creates: { scope: string; ttl: number }[] = [];
  readonly held: { tok: CanonicalToken; answer: () => void }[] = [];
  /** Every revocation asked, by ID, in order. */
  readonly revokes: string[] = [];
  /** While set, every revocation fails. */
  revokeDown = false;
  /** While set, revocations wait for the test: `heldRevokes` answers or fails each. */
  holdRevokes = false;
  readonly heldRevokes: { id: string; answer: () => void; fail: (e: Error) => void }[] = [];
  /** Provider text a failure carries: it must never be stored. */
  failureText = "Artifacts: internal error";
  constructor(clock: Clock) {
    this.clock = clock;
  }
  private apply(scope: "read" | "write", ttl: number): CanonicalToken {
    const id = `tok_c${this.tokens.length + 1}`;
    const t: CanonicalToken = { id, plaintext: `art_v1_${"c".repeat(40)}${this.tokens.length + 1}?expires=${ttl}`, scope, state: "active", expiresAt: this.clock.t + ttl * 1000 };
    this.tokens.push(t);
    return t;
  }
  private answer(t: CanonicalToken): MintedToken {
    return { id: t.id, plaintext: t.plaintext, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() };
  }
  async createToken(scope: "write" | "read" = "write", ttl = 86_400): Promise<MintedToken> {
    this.creates.push({ scope, ttl });
    const plan = this.plans.shift() ?? "ok";
    if (plan === "drop") throw new Error(`the connection was reset: ${this.failureText}`);
    const t = this.apply(scope, ttl);
    if (plan === "apply-throw") throw new ArtifactsError("INTERNAL_ERROR", 10400, this.failureText);
    if (plan === "lose") throw new Error(`the connection was reset: ${this.failureText}`);
    if (plan === "hold") {
      const gate = deferred<void>();
      this.held.push({ tok: t, answer: () => gate.resolve() });
      await gate.promise;
    }
    return this.answer(t);
  }
  async revokeToken(id: string): Promise<boolean> {
    this.revokes.push(id);
    if (this.holdRevokes) {
      const gate = deferred<void>();
      this.heldRevokes.push({ id, answer: () => gate.resolve(), fail: (e) => gate.reject(e) });
      await gate.promise;
    }
    if (this.revokeDown) throw new ArtifactsError("INTERNAL_ERROR", 10400, this.failureText);
    const t = this.tokens.find((x) => x.id === id);
    if (!t || t.state !== "active") return false;
    t.state = "revoked";
    return true;
  }
  async listTokens() {
    const tokens: TokenInfo[] = this.tokens.map((t) => ({
      id: t.id,
      scope: t.scope,
      state: t.state === "active" && t.expiresAt <= this.clock.t ? "expired" : t.state,
      expiresAt: new Date(t.expiresAt).toISOString(),
    }));
    return { tokens, total: tokens.length };
  }
  /** Active and unexpired, by ID. */
  live(id: string): boolean {
    const t = this.tokens.find((x) => x.id === id);
    return !!t && t.state === "active" && t.expiresAt > this.clock.t;
  }
  /** True if this plaintext is a live token's: what the remote checks at a push. */
  isLive(plaintext: string): boolean {
    const t = this.tokens.find((x) => x.plaintext === plaintext);
    return !!t && this.live(t.id);
  }
  liveIds(): string[] {
    return this.tokens.filter((t) => this.live(t.id)).map((t) => t.id);
  }
}

/**
 * The Room's side of the ledger for landing tests: one `MintLedger` per
 * host start on the room's SQLite (its constructor takes over), the
 * production `publicationTokens`, a stored alarm that a wake only moves
 * earlier, and `known` from the landing's token rows.
 */
export class LedgerHost {
  readonly repo: FakeCanonical;
  readonly sql: Sql;
  readonly clock: Clock;
  mints!: MintLedger;
  tokens!: PublicationTokens;
  alarm: number | null = null;
  readonly wakes: number[] = [];
  /** Repository lookups on the publication tokens' revocation path, numbered from 1; `holdLookup` holds chosen ones until the test answers them. */
  lookups = 0;
  holdLookup: ((n: number) => boolean) | null = null;
  readonly heldLookups: (() => void)[] = [];
  /** The publication tokens' sleep between retries; `holdSleep` holds each until the test ends it. */
  holdSleep = false;
  readonly heldSleeps: (() => void)[] = [];
  wakeFails = false;
  known: (tokenId: string) => boolean = () => false;
  private readonly waitMs: number;
  constructor(sql: Sql, clock: Clock, waitMs = 30_000) {
    this.sql = sql;
    this.clock = clock;
    this.waitMs = waitMs;
    this.repo = new FakeCanonical(clock);
    this.start();
  }
  /** A new host: a new ledger, which takes over what the last one left. */
  start(): void {
    this.mints = new MintLedger({
      sql: this.sql,
      repo: async () => this.repo,
      now: this.clock.now,
      wake: async (at) => {
        if (this.wakeFails) throw new Error("storage refused the alarm");
        this.wakes.push(at);
        if (this.alarm === null || at < this.alarm) this.alarm = at;
      },
      known: (id) => this.known(id),
      waitMs: this.waitMs,
      sleep: async () => {},
    });
    this.tokens = publicationTokens({
      mints: this.mints,
      repo: async () => {
        const n = ++this.lookups;
        if (this.holdLookup?.(n)) {
          const gate = deferred<void>();
          this.heldLookups.push(() => gate.resolve());
          await gate.promise;
        }
        return this.repo;
      },
      waitMs: this.waitMs,
      sleep: async () => {
        if (!this.holdSleep) return;
        const gate = deferred<void>();
        this.heldSleeps.push(() => gate.resolve());
        await gate.promise;
      },
    });
  }
  /** The alarm's ledger work, waited on to the end of its revocation pass. */
  async reconcile(): Promise<void> {
    await this.mints.reconcile();
    await this.mints.idle();
  }
  isLive(plaintext: string): boolean {
    return this.repo.isLive(plaintext);
  }
}

// ------------------------------------------------------------ request d29c09fa: provider text at durable sinks

/** Assembled at runtime, so the source holds no credential-shaped literal (push protection scans it). */
const glue = (...parts: string[]) => parts.join("");
/** What a provider error may echo: a token, an Authorization header's credential, and a URL query's secret. */
export const ECHOED: readonly string[] = [glue("art_", "v1_", "leakTOKEN", "0123456789abcdef"), glue("opaque", "Bearer", "Credential42"), glue("query", "Secret", "Q9z")];

/**
 * A provider error whose message echoes a token, an `Authorization: Bearer`
 * header and a URL query. By default it also has a known code, numeric code
 * and status, which the stored metadata keeps.
 */
export function echoing(fields: { readonly name?: string; readonly code?: string; readonly numericCode?: number; readonly status?: number } = { code: "INTERNAL_ERROR", numericCode: 10400, status: 503 }): Error {
  const e = new Error(
    `request failed with token ${ECHOED[0]}; Authorization: Bearer ${ECHOED[1]}; at https://acct.artifacts.cloudflare.net/git/ns/canon.git/info/refs?service=git-receive-pack&token=${ECHOED[2]}`,
  );
  return Object.assign(e, fields);
}

/** The metadata `echoing()` leaves at a sink whose stage is `stage`. */
export const echoNote = (stage: string) => `${stage}: Error INTERNAL_ERROR (10400) status 503`;

/** Every row of every table, as text. */
export function everyRow(sql: Sql): string {
  const tables = sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => String(r["name"]));
  return JSON.stringify(tables.map((t) => [t, sql.all(`SELECT * FROM "${t}"`)]));
}

/** Throw if any of `ECHOED` appears in `values` (rows, views, logs). */
export function noEcho(what: string, ...values: unknown[]): void {
  const text = values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("\n");
  for (const s of ECHOED) if (text.includes(s)) throw new Error(`${what} holds provider text (${s.slice(0, 8)}…)`);
}
