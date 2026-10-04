// Two containers for RunnerHost, each what a Cloudflare container gives a
// runner and no more, and a fleet of runners over either.
//
// - `MemoryContainer` runs no process. It answers the commands the service
//   sends (git, npm, tsc) from a model repository, and keeps every command
//   it was given. Tests of what the service decides, signs and sends use it:
//   the provider, the RunnerHost and the checkout are the real ones.
// - `ProcessContainer` runs real processes on the host. Tests of what only a
//   real file system, a real process or real git can show use it.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { SnapshotEntry } from "@generalbusiness/artroom-policy";
import type { ContainerLike, GatewayProps } from "../src/sandbox.ts";
import { gatewayFetch, RunnerHost } from "../src/sandbox.ts";
import { HOST } from "./support.ts";

/** A gateway as the container holds it: the job's grant and the gateway's rule. */
export interface FakeGateway {
  readonly props: GatewayProps;
  fetch(request: Request): Promise<Response>;
}

/** What both containers share: the life cycle, and the outbound routes of the running instance. */
abstract class Container implements ContainerLike<FakeGateway> {
  running = false;
  starts = 0;
  destroys = 0;
  readonly images = { runner: "pinned-image" };
  readonly routes = new Map<string, FakeGateway>();
  /** Make `interceptOutboundHttps` fail, as an infrastructure error would. */
  failIntercept = false;

  start(): void {
    if (this.running) throw new Error("the container is already running");
    this.running = true;
    this.starts++;
    this.routes.clear();
    this.started();
  }

  async destroy(): Promise<void> {
    this.destroyed();
    this.running = false;
    this.destroys++;
    this.routes.clear();
  }

  async setInactivityTimeout(): Promise<void> {}

  async interceptOutboundHttps(host: string, gateway: FakeGateway): Promise<void> {
    if (!this.running) throw new Error("the container is not running");
    if (this.failIntercept) throw new Error("intercept failed");
    this.routes.set(host, gateway);
  }

  protected abstract started(): void;
  protected abstract destroyed(): void;
  abstract exec(argv: string[], options: { env: Record<string, string>; signal: AbortSignal; cwd?: string }): Promise<{ output(): Promise<{ exitCode: number; stdout: ArrayBuffer; stderr: ArrayBuffer }> }>;
}

// ------------------------------------------------------------------ in memory

/** What a command answers. */
export interface Out {
  readonly exitCode: number;
  readonly stdout?: string | Uint8Array<ArrayBuffer>;
  readonly stderr?: string;
}

/** One commit of the model repository: what git says of it, and what its project's tools do. */
export interface ModelCommit {
  readonly tree: string;
  /** A filtered snapshot's files, as `git ls-tree` lists them. */
  readonly files?: readonly SnapshotEntry[];
  /** False when the commit has no package-lock.json. */
  readonly lock?: boolean;
  /** `npm ci`. Exit 0 if absent. */
  readonly ci?: Out;
  /** `npm test`: the project's own test script. Exit 0 if absent. */
  readonly test?: () => Out | Promise<Out>;
  /** `tsc --noEmit`. Exit 0 if absent. */
  readonly tsc?: Out;
  /** `git diff <base> HEAD`. */
  readonly diff?: string;
  /** The remote answers a fetch of this commit with another one, as a misbehaving remote would. */
  readonly sends?: string;
}

const OK: Out = { exitCode: 0 };
const bytes = (v: string | Uint8Array<ArrayBuffer> | undefined): ArrayBuffer => (typeof v === "string" || v === undefined ? new TextEncoder().encode(v ?? "") : v).buffer;

export class MemoryContainer extends Container {
  /** Every command this container was given, with its environment: all that a job's sandbox ever receives. */
  readonly received: { readonly argv: readonly string[]; readonly env: Readonly<Record<string, string>>; readonly cwd?: string }[] = [];
  private readonly commits: ReadonlyMap<string, ModelCommit>;
  private fetched: string | null = null;
  private head: string | null = null;

  constructor(commits: ReadonlyMap<string, ModelCommit>) {
    super();
    this.commits = commits;
  }

  protected started(): void {
    this.fetched = this.head = null;
  }
  protected destroyed(): void {}

  /** True if the container was given a command that starts with these words. */
  ran(...words: string[]): boolean {
    return this.received.some((r) => words.every((w, i) => r.argv[i] === w));
  }

  async exec(argv: string[], options: { env: Record<string, string>; cwd?: string }) {
    if (!this.running) throw new Error("the container is not running");
    this.received.push({ argv: [...argv], env: { ...options.env }, ...(options.cwd ? { cwd: options.cwd } : {}) });
    const out = this.answer(argv);
    return { output: async () => (({ exitCode, stdout, stderr }) => ({ exitCode, stdout: bytes(stdout), stderr: bytes(stderr) }))(await out) };
  }

  private at(): ModelCommit {
    const c = this.head === null ? undefined : this.commits.get(this.head);
    if (!c) throw new Error("the model container has checked nothing out");
    return c;
  }

  private async answer(argv: readonly string[]): Promise<Out> {
    const [tool, ...rest] = argv;
    if (tool === "rm" || tool === "mkdir") return OK;
    if (tool === "test") return { exitCode: this.at().lock === false ? 1 : 0 };
    if (tool === "node" && rest[0] === "--version") return { exitCode: 0, stdout: "v22.0.0\n" };
    if (tool === "npm" && rest[0] === "--version") return { exitCode: 0, stdout: "10.0.0\n" };
    if (tool === "npm" && rest[0] === "ci") return this.at().ci ?? OK;
    if (tool === "npm" && rest[0] === "test") return (await this.at().test?.()) ?? OK;
    if (tool === "npx" && rest.includes("tsc")) return this.at().tsc ?? OK;
    if (tool === "git" && rest[0] === "--version") return { exitCode: 0, stdout: "git version 2.50.0\n" };
    if (tool === "git") {
      // After the `-c <setting>` and `-C <dir>` pairs: the subcommand and its arguments.
      let i = 0;
      while (rest[i] === "-c" || rest[i] === "-C") i += 2;
      const [sub, ...args] = rest.slice(i);
      if (sub === "init") return OK;
      if (sub === "fetch") {
        const id = args.at(-1)!;
        const wanted = this.commits.get(id);
        if (!wanted) return { exitCode: 128, stderr: `fatal: remote error: upload-pack: not our ref ${id}` };
        this.fetched = wanted.sends ?? id;
        return OK;
      }
      if (sub === "checkout") return ((this.head = this.fetched), OK);
      if (sub === "rev-parse") return { exitCode: 0, stdout: `${args[0] === "HEAD" ? this.head : this.at().tree}\n` };
      if (sub === "ls-tree") return { exitCode: 0, stdout: (this.at().files ?? []).map(([path, mode, sha]) => `${mode} blob ${sha}\t${path}\0`).join("") };
      if (sub === "diff") return { exitCode: 0, stdout: args.includes("--stat") ? " 1 file changed\n" : (this.at().diff ?? "") };
    }
    throw new Error(`the model container has no answer for: ${argv.join(" ")}`);
  }
}

// ------------------------------------------------------------------ real processes

/** A runner image for process containers: its tools, and the files every new container starts with. */
export interface ModelImage {
  /** `node` and `npm`, read-only and shared by every container. */
  readonly bin: string;
  /** The writable file system a container starts with: an empty `tools` directory, first on PATH. */
  readonly layer: string;
}

/**
 * Build the image under `dir`. Its `node` and `npm` are links to `echo`:
 * asked for `--version` they say it back, which is all the runner digest
 * needs. Nothing new is made executable, because the first run of a new
 * executable file costs about 50 ms on macOS. Git is the host's.
 */
export function modelImage(dir: string): ModelImage {
  const image = { bin: join(dir, "image-bin"), layer: join(dir, "image-layer") };
  mkdirSync(image.bin);
  mkdirSync(join(image.layer, "tools"), { recursive: true });
  for (const tool of ["node", "npm"]) symlinkSync("/bin/echo", join(image.bin, tool));
  return image;
}

/**
 * A container modelled on the host.
 * - `start` copies the image's layer into a new root directory: the
 *   instance's writable file system. `/work` maps into that root.
 * - Every `exec` is its own process group; `destroy` kills every group, so
 *   nothing a job started survives its container.
 * - Repository URLs on the Artifacts host map to local repositories, as the
 *   gateway would route them, with the file protocol allowed.
 */
export class ProcessContainer extends Container {
  /** The current instance's file system. */
  root: string | null = null;
  private readonly groups = new Set<number>();
  private readonly o: { dir: string; image: ModelImage; repos: (url: string) => string | null };

  constructor(o: { dir: string; image: ModelImage; repos?: (name: string) => string | null }) {
    super();
    const url = new RegExp(`^https://${HOST.replace(/\./g, "\\.")}/git/ns/([A-Za-z0-9._-]+)\\.git$`);
    this.o = { dir: o.dir, image: o.image, repos: (s) => ((m) => (m ? (o.repos?.(m[1]!) ?? null) : null))(url.exec(s)) };
  }

  protected started(): void {
    this.root = mkdtempSync(join(this.o.dir, "instance-"));
    cpSync(this.o.image.layer, this.root, { recursive: true });
    mkdirSync(join(this.root, "work"));
  }

  protected destroyed(): void {
    for (const g of this.groups) {
      try {
        process.kill(-g, "SIGKILL");
      } catch {
        // the group has already gone
      }
    }
    this.groups.clear();
  }

  async exec(argv: string[], options: { env: Record<string, string>; signal: AbortSignal; cwd?: string }) {
    const root = this.root;
    if (!this.running || !root) throw new Error("the container is not running");
    const map = (s: string) => (s === "/work" || s.startsWith("/work/") ? root + s : (this.o.repos(s) ?? s));
    const env: Record<string, string> = Object.fromEntries(Object.entries(options.env).map(([k, v]) => [k, map(v)]));
    Object.assign(env, { PATH: `${join(root, "tools")}:${this.o.image.bin}:${process.env["PATH"]}`, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "protocol.file.allow", GIT_CONFIG_VALUE_0: "always" });
    const child = spawn(argv[0]!, argv.slice(1).map(map), { cwd: options.cwd ? map(options.cwd) : root, env, detached: true, signal: options.signal });
    if (child.pid) this.groups.add(child.pid);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => out.push(b));
    child.stderr.on("data", (b: Buffer) => err.push(b));
    const done = new Promise<{ exitCode: number; stdout: ArrayBuffer; stderr: ArrayBuffer }>((resolve) => {
      const buf = (bs: Buffer[]) => new Uint8Array(Buffer.concat(bs)).buffer;
      child.on("error", () => resolve({ exitCode: 127, stdout: buf(out), stderr: buf(err) }));
      child.on("close", (code) => resolve({ exitCode: code ?? 137, stdout: buf(out), stderr: buf(err) }));
    });
    return { output: () => done };
  }
}

// ------------------------------------------------------------------ the fleet

/** Runners: each `make()` is one Durable Object with its container. */
export class Fleet<C extends Container> {
  readonly boxes: { c: C; host: RunnerHost<FakeGateway> }[] = [];
  /** What reached the upstream through a gateway: path and Authorization header. */
  readonly upstream: string[] = [];
  private readonly container: () => C;

  constructor(container: () => C) {
    this.container = container;
  }

  make() {
    const c = this.container();
    const upstream = (async (input: string | URL | Request, init?: RequestInit) => {
      const r = input instanceof Request ? input : new Request(input, init);
      this.upstream.push(`${new URL(r.url).pathname} ${r.headers.get("authorization")}`);
      return new Response("objects");
    }) as typeof fetch;
    const host = new RunnerHost<FakeGateway>({
      container: () => c,
      gateway: (props) => ({ props, fetch: (r) => gatewayFetch(props, r, upstream) }),
      host: HOST,
      image: "pinned-image",
    });
    const box = { c, host };
    this.boxes.push(box);
    return box;
  }

  /** Ask a container's gateway for a path on the Artifacts host. 0 if it has no gateway. */
  static async ask(c: Container, path: string): Promise<number> {
    const gw = c.routes.get(HOST);
    if (!gw) return 0;
    return (await gw.fetch(new Request(`https://${HOST}${path}`))).status;
  }

  /** Each container's life: started, destroyed, still running. */
  lives(): [number, number, boolean][] {
    return this.boxes.map(({ c }) => [c.starts, c.destroys, c.running]);
  }

  async dispose(): Promise<void> {
    for (const { c } of this.boxes) if (c.running) await c.destroy();
  }
}
