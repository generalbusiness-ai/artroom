/**
 * The runner sandbox (R-EXEC-1, R-EXEC-3): a Durable Object that owns a
 * container with Node.js and git, for running untrusted repository code.
 *
 * - It is a different class, image and container from the publisher. It
 *   never receives a write token, a signing key, or the canonical remote.
 * - The container starts with `enableInternet: false`. It can reach exactly
 *   two kinds of host, both through `RunnerGateway`:
 *   - the job's one repository on the Artifacts host, read only: the gateway
 *     adds the job's read token and refuses every push (`git-receive-pack`);
 *   - the npm registry, for `npm ci`, with GET and HEAD only.
 * - Commands are argument arrays. Each gets exactly the environment it is
 *   given plus `PATH`, a deadline, and its exit code back.
 * - A scoped job (filtered snapshot) gets a fresh container that is
 *   destroyed afterwards. Whole-tree jobs of one checker reuse a warm
 *   container, each in its own directory, removed afterwards.
 */

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export interface RunnerEnv {
  readonly ARTIFACTS_HOST: string;
  /** The runner image reference, recorded in the runner digest. */
  readonly RUNNER_IMAGE: string;
}

export interface RunnerGrant {
  /** `/git/<namespace>/<repo>.git`: the only repository the job may read. */
  readonly repoPath: string;
  readonly token: string;
  /** Registry hosts reachable with GET and HEAD. */
  readonly registry: readonly string[];
}

interface GatewayProps extends RunnerGrant {
  readonly host: string;
}

export const CA = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";
const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
const redact = (s: string) => s.replace(TOKEN, "<token>");
const forbidden = (why: string) => new Response(`Forbidden by the runner gateway: ${why}\n`, { status: 403 });

export class RunnerGateway extends WorkerEntrypoint<RunnerEnv, GatewayProps> {
  override async fetch(request: Request): Promise<Response> {
    const p = this.ctx.props;
    const url = new URL(request.url);
    if (url.protocol !== "https:") return forbidden("not https");
    if (url.hostname === p.host) {
      if (!p.token || !url.pathname.startsWith(`${p.repoPath}/`)) return forbidden("not this job's repository");
      if (url.pathname.endsWith("/git-receive-pack") || url.searchParams.get("service") === "git-receive-pack") {
        return forbidden("runners may not push");
      }
      if (request.method !== "GET" && request.method !== "POST") return forbidden("method");
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${p.token}`);
      return fetch(new Request(request, { headers }));
    }
    if (p.registry.includes(url.hostname)) {
      if (request.method !== "GET" && request.method !== "HEAD") return forbidden("the registry is read only");
      const headers = new Headers(request.headers);
      headers.delete("Authorization");
      headers.delete("Cookie");
      return fetch(url.toString(), { method: request.method, headers });
    }
    return forbidden("host");
  }
}

type GatewayFactory = { RunnerGateway(opts: { props: GatewayProps }): Fetcher };

export class RunnerBox extends DurableObject<RunnerEnv> {
  private digestCache: string | null = null;
  private grantedHosts = new Set<string>();

  private container(): Container {
    const c = this.ctx.container;
    if (!c) throw new Error("no container binding");
    return c;
  }

  private async ensure(): Promise<void> {
    const c = this.container();
    if (c.running) return;
    const image = c.images["runner"];
    if (!image) throw new Error("no runner image");
    c.start({ image, entrypoint: ["sleep", "infinity"], enableInternet: false, instance: "standard-1" });
    await c.setInactivityTimeout(15 * 60 * 1000);
    this.grantedHosts.clear();
  }

  private async route(props: GatewayProps): Promise<void> {
    await this.ensure();
    const gw = (this.ctx.exports as unknown as GatewayFactory).RunnerGateway({ props });
    const c = this.container();
    for (const host of new Set([props.host, ...props.registry, ...this.grantedHosts])) await c.interceptOutboundHttps(host, gw);
    for (const h of [props.host, ...props.registry]) this.grantedHosts.add(h);
  }

  /** Start (or reuse) the container and grant it one job's read access. Returns the runner digest. */
  async open(grant: RunnerGrant): Promise<string> {
    await this.route({ ...grant, host: this.env.ARTIFACTS_HOST });
    return this.digest();
  }

  /** End the job: revoke its grant, delete its directory, and stop a single-use container. */
  async close(req: { readonly jobDir: string; readonly destroy: boolean }): Promise<void> {
    await this.route({ host: this.env.ARTIFACTS_HOST, repoPath: "/none", token: "", registry: [] }).catch(() => undefined);
    if (req.destroy) {
      const c = this.container();
      if (c.running) await c.destroy("job done");
      return;
    }
    if (/^\/work\/job_[A-Za-z0-9_-]+$/.test(req.jobDir)) await this.exec(["rm", "-rf", req.jobDir], {});
  }

  async exec(
    argv: readonly [string, ...string[]],
    opts: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>>; readonly timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    await this.ensure();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 600_000);
    try {
      const proc = await this.container().exec([...argv], {
        env: { ...opts.env, PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
        signal: ac.signal,
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
      });
      const out = await proc.output();
      const dec = new TextDecoder();
      return { exitCode: out.exitCode, stdout: redact(dec.decode(out.stdout)).slice(-65536), stderr: redact(dec.decode(out.stderr)).slice(-65536) };
    } catch (e) {
      if (ac.signal.aborted) return { exitCode: 124, stdout: "", stderr: `timed out after ${opts.timeoutMs ?? 600_000} ms` };
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The runner environment digest: the image and the toolchain versions (R-CARRY-6). */
  async digest(): Promise<string> {
    if (this.digestCache) return this.digestCache;
    const v = async (argv: [string, ...string[]]) => (await this.exec(argv, {})).stdout.trim();
    const facts = { git: await v(["git", "--version"]), image: this.env.RUNNER_IMAGE, node: await v(["node", "--version"]), npm: await v(["npm", "--version"]) };
    const bytes = new TextEncoder().encode(JSON.stringify(facts));
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    this.digestCache = `sha256:${hex}`;
    return this.digestCache;
  }

  /** Stop the container. */
  async reset(): Promise<boolean> {
    const c = this.container();
    const was = c.running;
    if (was) await c.destroy("reset");
    this.digestCache = null;
    return was;
  }
}
