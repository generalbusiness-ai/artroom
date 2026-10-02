/**
 * The runner sandbox on Cloudflare (R-EXEC-1, R-EXEC-3): a Durable Object
 * that owns one container with Node.js and git, for running untrusted
 * repository code. The life cycle and its rules are in sandbox.ts:
 *
 * - Every job gets a new `RunnerBox` (`RUNNER.newUniqueId()`), so a new
 *   container from the pinned image, destroyed when the job ends. No
 *   container runs two jobs.
 * - One owner at a time: `open` returns an owner token that `exec` and
 *   `close` need.
 * - It is a different class, image and container from the publisher. It
 *   never receives a write token, a signing key, or the canonical remote.
 * - The container starts with `enableInternet: false`. Its only way out is
 *   `RunnerGateway`, made for this job's grant: the job's one repository on
 *   the Artifacts host, read only, and the npm registry, GET and HEAD only.
 */

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import type { ExecResult } from "@generalbusiness/artroom-contract";
import { gatewayFetch, RunnerHost, type ContainerLike, type ExecOptions, type GatewayProps, type RunnerGrant } from "./sandbox.ts";

export { CA } from "./sandbox.ts";

export interface RunnerEnv {
  readonly ARTIFACTS_HOST: string;
  /** The runner image reference, recorded in the runner digest. */
  readonly RUNNER_IMAGE: string;
}

export class RunnerGateway extends WorkerEntrypoint<RunnerEnv, GatewayProps> {
  override fetch(request: Request): Promise<Response> {
    return gatewayFetch(this.ctx.props, request);
  }
}

type GatewayFactory = { RunnerGateway(opts: { props: GatewayProps }): Fetcher };

export class RunnerBox extends DurableObject<RunnerEnv> {
  private readonly host = new RunnerHost<Fetcher>({
    container: () => {
      const c = this.ctx.container;
      if (!c) throw new Error("no container binding");
      return c as unknown as ContainerLike<Fetcher>;
    },
    gateway: (props) => (this.ctx.exports as unknown as GatewayFactory).RunnerGateway({ props }),
    host: this.env.ARTIFACTS_HOST,
    image: this.env.RUNNER_IMAGE,
  });

  open(grant: RunnerGrant): Promise<{ owner: string; digest: string }> {
    return this.host.open(grant);
  }

  exec(owner: string, argv: readonly [string, ...string[]], opts: ExecOptions): Promise<ExecResult> {
    return this.host.exec(owner, argv, opts);
  }

  close(owner: string): Promise<boolean> {
    return this.host.close(owner);
  }
}
