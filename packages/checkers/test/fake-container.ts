// A container modelled on the host, for RunnerHost: what a Cloudflare
// container gives a runner, and no more.
// - `start` copies a pristine image (a `tools` directory, first on PATH) into
//   a new root directory: the instance's writable filesystem. `/work` maps
//   into that root.
// - Every `exec` is its own process group; `destroy` kills every group, so
//   nothing a job started survives its container.
// - Repository URLs on the Artifacts host map to local bare repositories,
//   as the gateway would route them, with the file protocol allowed.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { ContainerLike, GatewayProps } from "../src/sandbox.ts";
import { gatewayFetch, RunnerHost } from "../src/sandbox.ts";
import { HOST } from "./support.ts";

/** A gateway as the container holds it: the job's grant and the gateway's rule. */
export interface FakeGateway {
  readonly props: GatewayProps;
  fetch(request: Request): Promise<Response>;
}

export class FakeContainer implements ContainerLike<FakeGateway> {
  running = false;
  starts = 0;
  destroys = 0;
  readonly images = { runner: "pinned-image" };
  readonly routes = new Map<string, FakeGateway>();
  /** The current instance's filesystem. */
  root: string | null = null;
  /** Make `interceptOutboundHttps` fail, as an infrastructure error would. */
  failIntercept = false;
  private readonly groups = new Set<number>();
  private readonly o: { dir: string; image: string; repos: (url: string) => string | null };

  constructor(o: { dir: string; image: string; repos: (url: string) => string | null }) {
    this.o = o;
  }

  start(): void {
    if (this.running) throw new Error("the container is already running");
    this.running = true;
    this.starts++;
    this.root = mkdtempSync(join(this.o.dir, "instance-"));
    cpSync(this.o.image, this.root, { recursive: true });
    mkdirSync(join(this.root, "work"));
    this.routes.clear();
  }

  async destroy(): Promise<void> {
    for (const g of this.groups) {
      try {
        process.kill(-g, "SIGKILL");
      } catch {
        // the group has already gone
      }
    }
    this.groups.clear();
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

  async exec(argv: string[], options: { env: Record<string, string>; signal: AbortSignal; cwd?: string }) {
    const root = this.root;
    if (!this.running || !root) throw new Error("the container is not running");
    const map = (s: string) => (s === "/work" || s.startsWith("/work/") ? root + s : (this.o.repos(s) ?? s));
    const env: Record<string, string> = Object.fromEntries(Object.entries(options.env).map(([k, v]) => [k, map(v)]));
    Object.assign(env, { PATH: `${join(root, "tools")}:${process.env["PATH"]}`, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "protocol.file.allow", GIT_CONFIG_VALUE_0: "always" });
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

/** Runners on fake containers: each `make()` is one Durable Object with its container. */
export class Fleet {
  readonly boxes: { c: FakeContainer; host: RunnerHost<FakeGateway> }[] = [];
  /** What reached the upstream through a gateway: path and Authorization header. */
  readonly upstream: string[] = [];
  private readonly image: string;
  private readonly dir: string;
  private readonly repos: (url: string) => string | null;

  constructor(dir: string, repos: Record<string, string>) {
    this.dir = dir;
    this.image = join(dir, "image");
    mkdirSync(join(this.image, "tools"), { recursive: true });
    this.repos = (url) => {
      const m = new RegExp(`^https://${HOST.replace(/\./g, "\\.")}/git/ns/([A-Za-z0-9._-]+)\\.git$`).exec(url);
      return m ? (repos[m[1]!] ?? null) : null;
    };
  }

  make() {
    const c = new FakeContainer({ dir: this.dir, image: this.image, repos: this.repos });
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

  /** Ask a container's gateway for a path on the Artifacts host. */
  static async ask(c: FakeContainer, path: string): Promise<number> {
    const gw = c.routes.get(HOST);
    if (!gw) return 0;
    return (await gw.fetch(new Request(`https://${HOST}${path}`))).status;
  }

  async dispose(): Promise<void> {
    for (const { c } of this.boxes) if (c.running) await c.destroy();
  }
}
