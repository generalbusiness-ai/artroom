/**
 * The Room's side of the publisher sandbox. It owns the tokens: each
 * operation gets fresh tokens, minted here and revoked when the operation
 * ends, and the sandbox's gateway allows only that operation's ref
 * updates. The publication token is the exception: the landing engine mints
 * and revokes it, so it can record the token's ID before the push (R-PUB-3).
 *
 * Every token on the canonical repository is minted and revoked through the
 * Room's mint ledger (protocol section 32, R-MINT-1): its record and
 * wake-up are stored before the request, a lost answer stays an unknown
 * record, and a revocation that fails stays owed. The lane fork's read
 * token for pinning is not a canonical mint; it waits for the fork's own
 * ledger (request 02836f9a).
 */

import type { Sha } from "@generalbusiness/artroom-contract";
import type { IntegrateResult } from "../landing/core.ts";
import type { PublisherPort } from "../landing/engine.ts";
import { type ArtifactsNamespace, type RepoHandle, readMainVia, withRetry } from "../artifacts.ts";
import { type MintLedger, type MintScope, errorNote } from "../mints.ts";
import type { BuildResult, PinResult, PreviewResult } from "./gitops.ts";
import { integrationRef, pinnedRef } from "./gitops.ts";
import type { PushOutcome } from "./push-outcome.ts";

interface RemoteAccess {
  readonly remote: string;
  readonly token: string;
}

/** The Publisher Durable Object's RPC methods (container.ts), as a structural type. */
export interface PublisherStub {
  pinObjects(req: { fork: RemoteAccess; canonical: RemoteAccess; head: string }): Promise<PinResult>;
  pinRef(req: { canonical: RemoteAccess; ref: string; head: string }): Promise<PinResult>;
  preview(req: { canonical: RemoteAccess; head: string; headRef: string; lane: string; generation: number }): Promise<PreviewResult>;
  integrate(req: {
    canonical: RemoteAccess;
    expectedMain: string;
    head: string;
    headRef: string;
    storeRef: string;
    lane: string;
    generation: number;
  }): Promise<BuildResult>;
  push(req: { canonical: RemoteAccess; integration: string; expectedMain: string; integrationRef: string }): Promise<PushOutcome>;
}

/**
 * The sandbox's log remote (R-LOG-8), as lane A's log remote calls it. For
 * each call the caller mints a token of at most 60 s on the canonical repo
 * (write for `pushLog`, read for `readLogRef`) and revokes it afterwards.
 * Separate from `PublisherStub`, which is what the landing and pinning
 * clients call.
 */
export interface LogRemoteStub {
  pushLog(req: LogPushRequest & { canonical: RemoteAccess }): Promise<LogPushOutcome>;
  /** Stage objects for `cohort` in bounded parts (lane L's `GitRemote.stage`); no token. */
  stageLog(req: LogStageRequest & { canonical: { remote: string } }): Promise<StageResult>;
  /** `refs/artroom/log`'s commit, or null if it does not exist; throws if it cannot be read. */
  readLogRef(req: { canonical: RemoteAccess; ref: string }): Promise<Sha | null>;
}

export interface PublisherClientOptions {
  readonly stub: PublisherStub;
  readonly artifacts: ArtifactsNamespace;
  /** The canonical repo's name and remote. */
  readonly canonical: { readonly name: string; readonly remote: string };
  /** The Room's canonical mint ledger: every canonical token is minted and revoked through it (R-MINT-1). */
  readonly mints: Pick<MintLedger, "withToken">;
  readonly sleep?: (ms: number) => Promise<void>;
}

import type { LogPushOutcome, LogPushRequest, LogStageRequest } from "./log-push.ts";
import type { StageResult } from "./gitops.ts";

/** Token lifetimes, in seconds. A token that expires during an upload refuses it (notes/2026-10-01-laneB-token-inflight.md). */
export const TOKEN_TTL = {
  /** Staging an integration and publishing: the pushes carry one commit and its new trees. */
  short: 60,
  /** Pinning copies a lane's objects, which can be large. The gateway still allows only the pin's own refs. */
  pin: 600,
} as const;

/**
 * A canonical token through the mint ledger (R-MINT-2 to R-MINT-4): `fn`
 * gets its text, and the ledger revokes it by its ID however `fn` ends. A
 * revocation that fails stays owed, never dropped.
 */
function withCanonicalToken<T>(mints: Pick<MintLedger, "withToken">, purpose: string, scope: MintScope, ttl: number, fn: (token: string) => Promise<T>): Promise<T> {
  return mints.withToken(purpose, scope, () => ttl, (t) => fn(t.plaintext));
}

/**
 * The lane fork's read token for pinning (R-PROP-1). Not a canonical mint
 * (R-MINT-1): still a hidden retry and a dropped revocation, until request
 * 02836f9a gives the fork its own ledger. The only `createToken` call in
 * this file.
 */
async function withForkToken<T>(repo: RepoHandle, fn: (token: string) => Promise<T>, sleep?: (ms: number) => Promise<void>): Promise<T> {
  const opts = sleep ? { sleep } : {};
  const t = await withRetry(() => repo.createToken("read", TOKEN_TTL.pin), opts);
  try {
    return await fn(t.plaintext);
  } finally {
    await withRetry(() => repo.revokeToken(t.id), opts).catch(() => false);
  }
}

/** `PublisherPort` for the landing engine, over the publisher sandbox. */
export class ContainerPublisher implements PublisherPort {
  private readonly o: PublisherClientOptions;
  constructor(opts: PublisherClientOptions) {
    this.o = opts;
  }

  private repo(): Promise<RepoHandle> {
    return withRetry(() => this.o.artifacts.get(this.o.canonical.name), this.o.sleep ? { sleep: this.o.sleep } : {});
  }

  async integrate(req: Parameters<PublisherPort["integrate"]>[0]): Promise<IntegrateResult> {
    try {
      const r = await withCanonicalToken(
        this.o.mints,
        `integrate:${req.op}:${req.attempt}`,
        "write",
        TOKEN_TTL.short,
        (token) =>
          this.o.stub.integrate({
            canonical: { remote: this.o.canonical.remote, token },
            expectedMain: req.expectedMain,
            head: req.head,
            headRef: pinnedRef(req.lane, req.generation),
            storeRef: integrationRef(req.op, req.attempt),
            lane: req.lane,
            generation: req.generation,
          }),
      );
      return r.kind === "clean" ? { kind: "clean", integration: r.integration as Sha, ref: r.ref } : { kind: "conflict", paths: r.paths };
    } catch (e) {
      return { kind: "error", detail: errorNote("integration failed", e) }; // safe metadata only (request d29c09fa)
    }
  }

  push(req: Parameters<PublisherPort["push"]>[0]): Promise<PushOutcome> {
    return this.o.stub.push({
      canonical: { remote: this.o.canonical.remote, token: req.token },
      integration: req.integration,
      expectedMain: req.expectedMain,
      integrationRef: req.integrationRef,
    });
  }

  async readMain(): Promise<Sha> {
    return (await readMainVia(await this.repo())) as Sha;
  }
}

/** Pinning proposed heads (R-PROP-1, R-PROP-2) and previews (R-PROP-7). */
export class Pinning {
  private readonly o: PublisherClientOptions;
  constructor(opts: PublisherClientOptions) {
    this.o = opts;
  }

  private get(name: string): Promise<RepoHandle> {
    return withRetry(() => this.o.artifacts.get(name), this.o.sleep ? { sleep: this.o.sleep } : {});
  }

  /** Step 1, before admission: copy the head's objects from the lane's fork. */
  async pinObjects(fork: { readonly name: string; readonly remote: string }, head: Sha): Promise<PinResult> {
    const forkRepo = await this.get(fork.name);
    return withForkToken(
      forkRepo,
      (forkToken) =>
        withCanonicalToken(this.o.mints, `pin-objects:${head}`, "write", TOKEN_TTL.pin, (canonToken) =>
          this.o.stub.pinObjects({
            fork: { remote: fork.remote, token: forkToken },
            canonical: { remote: this.o.canonical.remote, token: canonToken },
            head,
          }),
        ),
      this.o.sleep,
    );
  }

  /** Step 2, after admission: the pinned ref, which never moves. */
  async pinRef(lane: string, generation: number, head: Sha): Promise<PinResult> {
    return withCanonicalToken(this.o.mints, `pin-ref:${lane}:${generation}`, "write", TOKEN_TTL.short, (token) =>
      this.o.stub.pinRef({ canonical: { remote: this.o.canonical.remote, token }, ref: pinnedRef(lane, generation), head }),
    );
  }

  /**
   * A merge preview of a pinned generation against main, with its
   * integration commit (stored in the canonical repo when it is a merge), the
   * same commit a landing on that main builds.
   */
  async preview(lane: string, generation: number, head: Sha): Promise<PreviewResult> {
    return withCanonicalToken(this.o.mints, `preview:${lane}:${generation}`, "write", TOKEN_TTL.short, (token) =>
      this.o.stub.preview({ canonical: { remote: this.o.canonical.remote, token }, head, headRef: pinnedRef(lane, generation), lane, generation }),
    );
  }
}

