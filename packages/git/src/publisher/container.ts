/**
 * The publisher sandbox (plan sections 6 and 9; R-EXEC-1, R-EXEC-2): a
 * Durable Object that owns one container with git and nothing else.
 *
 * - The container runs `git` only, through `GitOps` (hooks off, no
 *   repository attributes, bare repositories). There is no route that runs
 *   an arbitrary command.
 * - It starts with `enableInternet: false`. Its only way out is HTTPS to the
 *   Artifacts host, which `ArtifactsGateway` intercepts.
 * - No token enters the container. Each operation hands the gateway the
 *   tokens it needs, with the exact ref updates allowed (ref-fence.ts). A
 *   canonical write token is held only for the one operation that needs it.
 * - Operations run one at a time: they share the git directory and the
 *   gateway's per-host route.
 *
 * Lane A's Room reaches this through `ContainerPublisher` and `Pinning`
 * (client.ts). The Room owns tokens: it mints them per operation and
 * revokes them after.
 */

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { type BuildResult, type Exec, GitOps, LOG_REF, type PinResult, type StageResult, type PreviewResult, SNAPSHOT_REF, type SnapshotFile, objectsRef } from "./gitops.ts";
import { decodeLogPush, decodeLogStage, toLogOutcome, type LogPushOutcome, type LogStageRequest } from "./log-push.ts";
import { type AllowedUpdates, type GatewayProps, type RepoGrant, ZERO, gatewayFetch, repoPathOf } from "./ref-fence.ts";
import type { PushOutcome } from "./push-outcome.ts";

export interface PublisherEnv {
  readonly ARTIFACTS_HOST: string;
  readonly ARTIFACTS_NAMESPACE: string;
  /** A deployment that also imports: the import namespace's repositories are reachable too (R-GEN-12). */
  readonly IMPORT_NAMESPACE?: string;
}

export type { GatewayProps, RepoGrant } from "./ref-fence.ts";

/** A remote and the token for it, as the Room passes them. */
export interface RemoteAccess {
  readonly remote: string;
  readonly token: string;
}

const CA = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";
const INACTIVITY_MS = 15 * 60 * 1000;
const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;
export const redact = (s: string): string => s.replace(TOKEN, "<token>");

/**
 * Receives every HTTPS request the container makes to the Artifacts host.
 * Adds the token for that repository, and fences pushes (`gatewayFetch`).
 */
export class ArtifactsGateway extends WorkerEntrypoint<PublisherEnv, GatewayProps> {
  override fetch(request: Request): Promise<Response> {
    return gatewayFetch(this.ctx.props, request);
  }
}

type GatewayFactory = { ArtifactsGateway(opts: { props: GatewayProps }): Fetcher };

export class Publisher extends DurableObject<PublisherEnv> {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly ops: GitOps;

  constructor(ctx: DurableObjectState, env: PublisherEnv) {
    super(ctx, env);
    this.ops = new GitOps({
      exec: this.exec,
      workdir: "/work",
      env: { GIT_SSL_CAINFO: CA },
      config: ["protocol.allow=never", "protocol.https.allow=always", "http.sslVerify=true"],
    });
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private readonly exec: Exec = async (argv, opts) => {
    const c = this.container();
    await this.ensure();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 120_000);
    try {
      const input = opts.stdin;
      const proc = await c.exec([...argv], {
        env: { ...opts.env, PATH: "/usr/local/bin:/usr/bin:/bin" },
        signal: ac.signal,
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
        ...(input
          ? {
              stdin: new ReadableStream<Uint8Array>({
                start(ctrl) {
                  ctrl.enqueue(input);
                  ctrl.close();
                },
              }),
            }
          : {}),
      });
      const out = await proc.output();
      const dec = new TextDecoder();
      return { code: out.exitCode, stdout: dec.decode(out.stdout), stderr: redact(dec.decode(out.stderr)).slice(-4000) };
    } finally {
      clearTimeout(timer);
    }
  };

  private container(): Container {
    const c = this.ctx.container;
    if (!c) throw new Error("no container binding");
    return c;
  }

  private async ensure(): Promise<void> {
    const c = this.container();
    if (c.running) return;
    const image = c.images["git"];
    if (!image) throw new Error("no git image");
    c.start({ image, entrypoint: ["sleep", "infinity"], enableInternet: false });
    await c.setInactivityTimeout(INACTIVITY_MS);
    const ready = await (await c.exec(["mkdir", "-p", "/work"])).output();
    if (ready.exitCode !== 0) throw new Error("container not ready");
  }

  /** Check a remote is an Artifacts repo in one of our namespaces, and return its path. */
  private repoPath(remote: string): string {
    return repoPathOf(remote, this.env.ARTIFACTS_HOST, [this.env.ARTIFACTS_NAMESPACE, this.env.IMPORT_NAMESPACE]);
  }

  /** Point the container's HTTPS route for the Artifacts host at a gateway with these grants. */
  private async route(grants: ReadonlyArray<readonly [RemoteAccess, AllowedUpdates | null]>): Promise<void> {
    const repos: Record<string, RepoGrant> = {};
    for (const [access, updates] of grants) repos[this.repoPath(access.remote)] = { token: access.token, updates };
    const gw = (this.ctx.exports as unknown as GatewayFactory).ArtifactsGateway({ props: { host: this.env.ARTIFACTS_HOST, repos } });
    await this.ensure();
    await this.container().interceptOutboundHttps(this.env.ARTIFACTS_HOST, gw);
  }

  /** Remove every grant: later git requests from the container are refused. */
  private async closeRoute(): Promise<void> {
    await this.route([]).catch(() => undefined);
  }

  private async withRoute<T>(grants: ReadonlyArray<readonly [RemoteAccess, AllowedUpdates | null]>, fn: () => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.route(grants);
      try {
        return await fn();
      } finally {
        await this.closeRoute();
      }
    });
  }

  // ---------------------------------------------------------------- RPC

  /** R-PROP-1 step 1. `fork` needs a read token; `canonical` a write token for the objects ref. */
  pinObjects(req: { readonly fork: RemoteAccess; readonly canonical: RemoteAccess; readonly head: string }): Promise<PinResult> {
    return this.withRoute(
      [
        [req.fork, null],
        [req.canonical, { [objectsRef(req.head)]: { old: ZERO, new: req.head } }],
      ],
      () => this.ops.pinObjects(req.fork.remote, req.canonical.remote, req.head),
    );
  }

  /** R-PROP-1 step 2: create the pinned ref. */
  pinRef(req: { readonly canonical: RemoteAccess; readonly ref: string; readonly head: string }): Promise<PinResult> {
    return this.withRoute([[req.canonical, { [req.ref]: { old: ZERO, new: req.head } }]], () =>
      this.ops.pinRef(req.canonical.remote, req.ref, req.head),
    );
  }

  /** The files of a commit, for building a filtered snapshot. Read only. */
  listTree(req: { readonly canonical: RemoteAccess; readonly commit: string }): Promise<SnapshotFile[]> {
    return this.withRoute([[req.canonical, null]], () => this.ops.listTree(req.canonical.remote, req.commit));
  }

  /**
   * Write a filtered snapshot into its own new, empty repository
   * (R-CARRY-15, R-CARRY-16). The canonical repo is read only; the store's
   * token may only create `SNAPSHOT_REF`, at the commit just built.
   */
  writeSnapshot(req: {
    readonly canonical: RemoteAccess;
    readonly store: RemoteAccess;
    readonly files: readonly SnapshotFile[];
    readonly message: string;
  }): Promise<string> {
    return this.withRoute(
      [
        [req.canonical, null],
        [req.store, null],
      ],
      () =>
        this.ops.writeSnapshot(
          { canonical: req.canonical.remote, store: req.store.remote, files: req.files, message: req.message },
          {
            beforeStore: (sha) =>
              this.route([
                [req.canonical, null],
                [req.store, { [SNAPSHOT_REF]: { old: ZERO, new: sha } }],
              ]),
          },
        ),
    );
  }

  /**
   * R-PROP-7: a merge preview with its integration commit. The token may
   * only create `refs/artroom/objects/<integration>`, for a merge commit just
   * built; a fast-forward stores nothing.
   */
  preview(req: { readonly canonical: RemoteAccess; readonly head: string; readonly headRef: string; readonly lane: string; readonly generation: number }): Promise<PreviewResult> {
    return this.withRoute([[req.canonical, null]], () =>
      this.ops.preview(req.canonical.remote, req.head, req.headRef, req.lane, req.generation, {
        beforeStore: (sha) => this.route([[req.canonical, { [objectsRef(sha)]: { old: ZERO, new: sha } }]]),
      }),
    );
  }

  /**
   * Lane L's log push (R-LOG-8): write the log commit's objects and move
   * `refs/artroom/log` from `lease` to `next`. The caller's per-push token
   * (at most 60 s, revoked by the caller after) lives only in the gateway,
   * which allows exactly that one ref update. Answers with lane L's
   * `PushOutcome`: `ok`, `lease-mismatch` with where the ref is, or
   * `unknown`. A push whose outcome is unknown may still have landed; the
   * publisher reads the ref back, and neither revocation nor elapsed time
   * proves it did not (R-PUB-2).
   */
  pushLog(req: {
    readonly canonical: RemoteAccess;
    readonly objects: readonly { readonly type: string; readonly data: string }[];
    readonly ref: string;
    readonly next: string;
    readonly lease: string | null;
  }): Promise<LogPushOutcome> {
    const d = decodeLogPush(req);
    if ("refused" in d) return Promise.resolve(d.refused);
    const objects = d.objects;
    return this.withRoute([[req.canonical, { [LOG_REF]: { old: req.lease ?? ZERO, new: req.next } }]], async () =>
      toLogOutcome(await this.ops.pushLog(req.canonical.remote, objects, req.next, req.lease)),
    );
  }

  /**
   * Lane L's staging (`GitRemote.stage`): store a publication's objects in
   * bounded parts ahead of `pushLog`, chunks of an object larger than one
   * transfer included. Local to the sandbox: no token, no network. Answers
   * which wanted objects are still missing (lane L's `StageOutcome`).
   */
  stageLog(req: LogStageRequest & { readonly canonical: { readonly remote: string } }): Promise<StageResult> {
    const d = decodeLogStage(req);
    if ("refused" in d) return Promise.resolve(d.refused);
    return this.withRoute([], () => this.ops.stageLog(req.canonical.remote, d.cohort, d.want, d.parts));
  }

  /**
   * Lane L's log read-back: where `refs/artroom/log` is, or null when it does
   * not exist (lane L's `GitReader.readRef`). `canonical.token` is a read
   * token of at most 60 s that the caller revokes; the gateway allows no ref
   * update. Throws when the ref cannot be read, so lane L never takes
   * "unreadable" for "absent".
   */
  readLogRef(req: { readonly canonical: RemoteAccess; readonly ref: string }): Promise<string | null> {
    return this.withRoute([[req.canonical, null]], () => this.ops.readLogRef(req.canonical.remote, req.ref));
  }

  /** R-LAND-4 step 1. The write token may only create `storeRef`, at the commit just built. */
  integrate(req: {
    readonly canonical: RemoteAccess;
    readonly expectedMain: string;
    readonly head: string;
    readonly headRef: string;
    readonly storeRef: string;
    readonly lane: string;
    readonly generation: number;
  }): Promise<BuildResult> {
    return this.withRoute([[req.canonical, null]], () =>
      this.ops.integrate(
        { canonical: req.canonical.remote, expectedMain: req.expectedMain, head: req.head, headRef: req.headRef, storeRef: req.storeRef, lane: req.lane, generation: req.generation },
        { beforeStore: (sha) => this.route([[req.canonical, { [req.storeRef]: { old: ZERO, new: sha } }]]) },
      ),
    );
  }

  /** R-PUB-4. The publication token may only move main from `expectedMain` to `integration`. */
  push(req: { readonly canonical: RemoteAccess; readonly integration: string; readonly expectedMain: string; readonly integrationRef: string }): Promise<PushOutcome> {
    return this.withRoute([[req.canonical, { "refs/heads/main": { old: req.expectedMain, new: req.integration } }]], () =>
      this.ops.pushMain(req.canonical.remote, req.integration, req.expectedMain, req.integrationRef),
    );
  }

  /** Git and container facts, for the harness. */
  info(): Promise<{ readonly git: string; readonly running: boolean }> {
    return this.serial(async () => {
      const v = await this.exec(["git", "--version"], { env: {} });
      return { git: v.stdout.trim(), running: this.container().running };
    });
  }

  /** Stop the container. Its git directory is lost; nothing durable lives there. */
  async reset(): Promise<boolean> {
    const c = this.container();
    const was = c.running;
    if (was) await c.destroy("reset");
    return was;
  }
}
