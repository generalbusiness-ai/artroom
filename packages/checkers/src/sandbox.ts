/**
 * The runner sandbox's life cycle (R-EXEC-1, R-EXEC-3), without Cloudflare
 * types. container.ts binds it to a Durable Object and its container.
 *
 * One job, one container:
 * - Every job opens a new runner: a new Durable Object (`newUniqueId`), so a
 *   new container started from the pinned image. When the job ends the
 *   container is destroyed. Nothing a job does — files written anywhere in
 *   the image, tools replaced, processes left running — can reach another
 *   job, because no container ever runs a second job.
 * - A runner has at most one owner. `open` returns an owner token, and
 *   `exec` and `close` need it. A second `open` while a job holds the runner
 *   is refused; a `close` with any other token changes nothing.
 * - The container has no internet. Its outbound HTTPS goes to one gateway,
 *   made for this job's grant: its one repository, read only, and GET access
 *   to the npm registry.
 * - The runner digest is measured in the new container before any job code
 *   runs.
 * - `exec` returns a command's output whole, byte for byte, up to
 *   `OUTPUT_LIMIT`. Over that it throws an output-limit error: it never
 *   truncates or rewrites output. Cutting and redacting text for display is
 *   the checker's job (`clip`, `step`).
 */

import type { Digest, ExecResult, Runner } from "@generalbusiness/artroom-contract";
import type { RunnerProvider, RunnerSession } from "./checker.ts";

/** The certificate authority of the container's outbound HTTPS interception. */
export const CA = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";
const PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/** The most output one command may return, stdout and stderr together. */
export const OUTPUT_LIMIT = 8 * 1024 * 1024;
const LIMIT_MARK = "runner output limit:";

/** True for the error `exec` throws when a command's output is over `OUTPUT_LIMIT` (it survives RPC as a message). */
export function isOutputLimit(e: unknown): boolean {
  return e instanceof Error && e.message.includes(LIMIT_MARK);
}

export interface RunnerGrant {
  /** `/git/<namespace>/<repo>.git`: the only repository the job may read. */
  readonly repoPath: string;
  readonly token: string;
  /** Registry hosts reachable with GET and HEAD. */
  readonly registry: readonly string[];
}

export interface GatewayProps extends RunnerGrant {
  readonly host: string;
}

export interface ExecOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

const forbidden = (why: string) => new Response(`Forbidden by the runner gateway: ${why}\n`, { status: 403 });

/** The gateway's rule: one job's repository, read only, plus GET on the registry. */
export function gatewayFetch(p: GatewayProps, request: Request, upstream: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.protocol !== "https:") return Promise.resolve(forbidden("not https"));
  if (url.hostname === p.host) {
    if (!p.token || !url.pathname.startsWith(`${p.repoPath}/`)) return Promise.resolve(forbidden("not this job's repository"));
    if (url.pathname.endsWith("/git-receive-pack") || url.searchParams.get("service") === "git-receive-pack") {
      return Promise.resolve(forbidden("runners may not push"));
    }
    if (request.method !== "GET" && request.method !== "POST") return Promise.resolve(forbidden("method"));
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${p.token}`);
    return upstream(new Request(request, { headers }));
  }
  if (p.registry.includes(url.hostname)) {
    if (request.method !== "GET" && request.method !== "HEAD") return Promise.resolve(forbidden("the registry is read only"));
    const headers = new Headers(request.headers);
    headers.delete("Authorization");
    headers.delete("Cookie");
    return upstream(url.toString(), { method: request.method, headers });
  }
  return Promise.resolve(forbidden("host"));
}

/** The part of Cloudflare's `Container` the runner uses. */
export interface ContainerLike<G = unknown> {
  readonly running: boolean;
  readonly images: Record<string, string>;
  start(options: { image: string; entrypoint: string[]; enableInternet: false; instance: "standard-1" }): void;
  destroy(reason?: unknown): Promise<void>;
  setInactivityTimeout(ms: number): Promise<void>;
  interceptOutboundHttps(host: string, gateway: G): Promise<void>;
  exec(
    argv: string[],
    options: { env: Record<string, string>; signal: AbortSignal; cwd?: string },
  ): Promise<{ output(): Promise<{ exitCode: number; stdout: ArrayBuffer; stderr: ArrayBuffer }> }>;
}

export interface RunnerHostOptions<G> {
  readonly container: () => ContainerLike<G>;
  /** Makes the gateway for one job's grant. */
  readonly gateway: (props: GatewayProps) => G;
  /** The Artifacts host. */
  readonly host: string;
  /** The pinned image reference, recorded in the runner digest. */
  readonly image: string;
}

/** What a runner's owner holds: its token, and whether it may still run commands. */
interface Holder {
  readonly owner: string;
  live: boolean;
}

/** One runner: a container for one job at a time, never reused. */
export class RunnerHost<G = unknown> {
  private readonly o: RunnerHostOptions<G>;
  private holder: Holder | null = null;

  constructor(o: RunnerHostOptions<G>) {
    this.o = o;
  }

  /** Start a new container for one job and grant it the job's read access. Returns the owner token and the runner digest. */
  async open(grant: RunnerGrant): Promise<{ owner: string; digest: string }> {
    // Taken before the first await, so two opens cannot both pass.
    if (this.holder) throw new Error("This runner already has a job. Each job opens its own runner.");
    const holder: Holder = { owner: crypto.randomUUID(), live: true };
    this.holder = holder;
    try {
      const c = this.o.container();
      // A container left by anything earlier is never reused.
      if (c.running) await c.destroy("a runner starts every job from the image");
      const image = c.images["runner"];
      if (!image) throw new Error("no runner image");
      c.start({ image, entrypoint: ["sleep", "infinity"], enableInternet: false, instance: "standard-1" });
      await c.setInactivityTimeout(15 * 60 * 1000);
      const gw = this.o.gateway({ ...grant, host: this.o.host });
      for (const host of new Set([this.o.host, ...grant.registry])) await c.interceptOutboundHttps(host, gw);
      return { owner: holder.owner, digest: await this.digest(c) };
    } catch (e) {
      await this.end(holder).catch(() => undefined);
      throw e;
    }
  }

  /** Run one command for the owner. A non-zero exit resolves normally. */
  async exec(owner: string, argv: readonly [string, ...string[]], opts: ExecOptions = {}): Promise<ExecResult> {
    const h = this.holder;
    if (!h || h.owner !== owner || !h.live) throw new Error("This runner is not held by the caller.");
    return run(this.o.container(), argv, opts);
  }

  /** End the owner's job: destroy its container. Returns false, and changes nothing, for any other token. */
  async close(owner: string): Promise<boolean> {
    const h = this.holder;
    if (!h || h.owner !== owner) return false;
    await this.end(h);
    return true;
  }

  private async end(h: Holder): Promise<void> {
    if (this.holder !== h) return;
    h.live = false;
    try {
      const c = this.o.container();
      if (c.running) await c.destroy("job done");
    } finally {
      if (this.holder === h) this.holder = null;
    }
  }

  /** The runner environment digest: the image and its toolchain versions, measured before any job code runs (R-CARRY-6). */
  private async digest(c: ContainerLike<G>): Promise<string> {
    const v = async (argv: [string, ...string[]]) => (await run(c, argv, { timeoutMs: 60_000 })).stdout.trim();
    const facts = { git: await v(["git", "--version"]), image: this.o.image, node: await v(["node", "--version"]), npm: await v(["npm", "--version"]) };
    const bytes = new TextEncoder().encode(JSON.stringify(facts));
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  }
}

async function run(c: ContainerLike<unknown>, argv: readonly [string, ...string[]], opts: ExecOptions): Promise<ExecResult> {
  const ms = opts.timeoutMs ?? 600_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const proc = await c.exec([...argv], { env: { ...opts.env, PATH }, signal: ac.signal, ...(opts.cwd ? { cwd: opts.cwd } : {}) });
    const out = await proc.output();
    const bytes = out.stdout.byteLength + out.stderr.byteLength;
    if (bytes > OUTPUT_LIMIT) throw new Error(`${LIMIT_MARK} \`${argv[0]}\` wrote ${bytes} bytes; a runner command may return at most ${OUTPUT_LIMIT}.`);
    const dec = new TextDecoder();
    return { exitCode: out.exitCode, stdout: dec.decode(out.stdout), stderr: dec.decode(out.stderr) };
  } catch (e) {
    if (ac.signal.aborted && !isOutputLimit(e)) return { exitCode: 124, stdout: "", stderr: `timed out after ${ms} ms` };
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** A runner as the service sees it: a `RunnerHost` behind a Durable Object stub. */
export interface RunnerStub {
  open(grant: RunnerGrant): Promise<{ owner: string; digest: string }>;
  exec(owner: string, argv: readonly [string, ...string[]], opts: ExecOptions): Promise<ExecResult>;
  close(owner: string): Promise<boolean>;
}

export interface RunnerProviderOptions {
  /** A runner no other job has used: in the Worker, `RUNNER.get(RUNNER.newUniqueId())`. */
  readonly fresh: () => RunnerStub;
  readonly registry: readonly string[];
}

/** Runner sessions for jobs: a new runner for each job, closed once. */
export function runnerProvider(o: RunnerProviderOptions): RunnerProvider {
  return {
    async open(bound): Promise<RunnerSession> {
      const stub = o.fresh();
      const { owner, digest } = await stub.open({ repoPath: bound.repoPath, token: bound.token, registry: o.registry });
      const runner: Runner = { digest: digest as Digest, exec: (argv, opts) => stub.exec(owner, argv, opts ?? {}) };
      let closing: Promise<void> | null = null;
      return {
        runner,
        remote: bound.job.readUrl,
        root: "/work",
        env: { GIT_SSL_CAINFO: CA, NODE_EXTRA_CA_CERTS: CA },
        close: () => (closing ??= stub.close(owner).then(() => undefined)),
      };
    },
  };
}
