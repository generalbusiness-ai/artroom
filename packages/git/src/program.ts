/**
 * The `git` program, as this package runs it, and a repository on disk as a
 * source for the reader. It is the reviewed successor of the earlier
 * publisher's command runner and of the earlier log's command-line reader
 * (`notes/2026-10-05-i3-git-review.md`).
 *
 * Every invocation:
 *
 * - is an argument array, never a shell string;
 * - has a complete environment, stated here. The caller's own environment
 *   is not added to it, and no credential is in it or in an argument
 *   (authority note, section 5.3): the gateway holds every token;
 * - reads no system, global or repository-supplied configuration that runs
 *   anything: no hooks, no attributes, no credential helper, no replace
 *   objects, no submodule, no prompt;
 * - reaches a remote over the allowed transports only, and follows no
 *   redirect;
 * - checks every object that a fetch receives (`transfer.fsckObjects`), so
 *   an object whose bytes do not match its ID never enters the repository;
 * - has a deadline.
 *
 * A failure carries the step's name and the exit code. It never carries the
 * program's output, which can repeat a URL, a header or a host's text.
 */

import { GitRefusal, objectId, refName, type ObjectId, type Transport } from "./names.ts";
import type { GitSource, StoredObject } from "./reader.ts";

export interface ExecResult { code: number; stdout: Uint8Array; stderr: Uint8Array; timedOut: boolean }

/**
 * Runs one process and waits for it. `env` is the complete environment: an
 * implementation adds nothing to it but a `PATH` of its own choosing.
 * `timedOut`: the deadline passed and the process was stopped.
 */
export type Exec = (argv: readonly string[], opts: { env: Readonly<Record<string, string>>; timeoutMs: number; stdin?: Uint8Array }) => Promise<ExecResult>;

export interface ProgramOptions {
  exec: Exec;
  /** Which remotes Git may reach. `https` unless the caller says `local`. */
  transport?: Transport;
  /** More environment, such as the path of a certificate bundle. Never a credential. */
  env?: Readonly<Record<string, string>>;
  /** The deadline of one command, in milliseconds. */
  timeoutMs?: number;
}

/** The deadline of one command unless the caller sets one: the earlier publisher's 120 seconds. */
export const COMMAND_MS = 120_000;

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** The settings of every command. */
export const HARDENING: readonly string[] = [
  "core.hooksPath=/dev/null",
  "core.fsmonitor=false",
  "core.attributesFile=/dev/null",
  `attr.tree=${EMPTY_TREE}`,
  "core.symlinks=false",
  "credential.helper=",
  "core.askPass=",
  "gc.auto=0",
  "maintenance.auto=false",
  "fetch.recurseSubmodules=false",
  "submodule.recurse=false",
  "transfer.fsckObjects=true",
  "http.followRedirects=false",
  "protocol.allow=never",
  "protocol.https.allow=always",
];
/** What `local` adds: a repository on this machine, by path or over the loopback address. */
const LOCAL: readonly string[] = ["protocol.file.allow=always", "protocol.http.allow=always"];

/** A command that failed. `step` is a fixed word of this package. */
export class GitFailure extends Error {
  readonly step: string;
  readonly code: number;
  readonly timedOut: boolean;
  constructor(step: string, result: Pick<ExecResult, "code" | "timedOut">) {
    super(`git ${step} failed${result.timedOut ? ": deadline passed" : ` (exit ${result.code})`}`);
    this.name = "GitFailure";
    this.step = step;
    this.code = result.code;
    this.timedOut = result.timedOut;
  }
}

const text = new TextDecoder();
const bytes = new TextEncoder();

export class GitProgram {
  readonly transport: Transport;
  readonly #exec: Exec;
  readonly #env: Record<string, string>;
  readonly #timeoutMs: number;

  constructor(options: ProgramOptions) {
    this.transport = options.transport ?? "https";
    this.#exec = options.exec;
    this.#timeoutMs = options.timeoutMs ?? COMMAND_MS;
    this.#env = {
      ...options.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_NO_LAZY_FETCH: "1",
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "/bin/false",
      HOME: "/nonexistent",
      LC_ALL: "C",
    };
  }

  /** Run git with the settings above. The result is the caller's to judge. */
  run(args: readonly string[], stdin?: Uint8Array): Promise<ExecResult> {
    const config = [...HARDENING, ...(this.transport === "local" ? LOCAL : [])].flatMap((c) => ["-c", c]);
    return this.#exec(["git", ...config, ...args], { env: this.#env, timeoutMs: this.#timeoutMs, ...(stdin === undefined ? {} : { stdin }) });
  }

  /** Run git, and take its output as text when it exits 0. Any other end is a `GitFailure` with no output in it. */
  async ok(step: string, args: readonly string[], stdin?: Uint8Array): Promise<string> {
    const r = await this.run(args, stdin);
    if (r.code !== 0 || r.timedOut) throw new GitFailure(step, r);
    return text.decode(r.stdout);
  }
}

/** A directory that this package made or was given: an absolute path, so it is never read as an option. */
export function directory(dir: string): string {
  if (!dir.startsWith("/") || /[\u0000-\u001f]/.test(dir)) throw new GitRefusal("bad-remote", "directory");
  return dir;
}

const TYPES: readonly string[] = ["commit", "tree", "blob", "tag"];

/**
 * A repository on disk as the reader's source: objects by `cat-file`, refs by
 * `for-each-ref`. An ID and a ref name are checked here once more, because
 * here they become input to a command. Git does not check an object's hash
 * when it reads one. The reader does.
 */
export function repositorySource(git: GitProgram, dir: string): GitSource {
  const at = ["-C", directory(dir)];
  return {
    async object(id: ObjectId, limit: number): Promise<StoredObject | null> {
      const [name, type, size, ...more] = (await git.ok("cat-file", [...at, "cat-file", "--batch-check"], bytes.encode(`${objectId(id, "object")}\n`))).trimEnd().split(" ");
      if (name !== id || more.length > 0) throw new GitFailure("cat-file", { code: 0, timedOut: false });
      if (type === "missing" && size === undefined) return null;
      if (type === undefined || !TYPES.includes(type) || size === undefined || !/^(0|[1-9][0-9]{0,15})$/.test(size)) throw new GitFailure("cat-file", { code: 0, timedOut: false });
      if (Number(size) > limit) return { type, size: Number(size), data: null };
      const r = await git.run([...at, "cat-file", type, id]);
      if (r.code !== 0 || r.timedOut) throw new GitFailure("cat-file", r);
      return { type, size: Number(size), data: r.stdout };
    },
    async ref(name: string): Promise<string | null> {
      const lines = (await git.ok("for-each-ref", [...at, "for-each-ref", "--format=%(objectname) %(refname)", refName(name, "ref")])).split("\n");
      const line = lines.find((l) => l.endsWith(` ${name}`));
      return line === undefined ? null : line.slice(0, line.length - name.length - 1);
    },
    async refs(prefix: string, limit: number) {
      refName(`${prefix}x`, "prefix");
      const out = await git.ok("for-each-ref", [...at, "for-each-ref", `--count=${Math.max(1, Math.floor(limit)) + 1}`, "--format=%(objectname) %(refname)", prefix]);
      return out.split("\n").filter((l) => l !== "").map((l) => ({ target: l.slice(0, l.indexOf(" ")), ref: l.slice(l.indexOf(" ") + 1) }));
    },
  };
}
