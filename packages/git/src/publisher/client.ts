/**
 * The Room's side of the publisher sandbox. It owns the tokens: each
 * operation gets fresh 60 s tokens, minted here and revoked when the
 * operation ends, and the sandbox's gateway allows only that operation's ref
 * updates. The publication token is the exception: the landing engine mints
 * and revokes it, so it can record the token's ID before the push (R-PUB-3).
 */

import type { Sha } from "@generalbusiness/artroom-contract";
import type { IntegrateResult } from "../landing/core.ts";
import type { PublisherPort } from "../landing/engine.ts";
import { type ArtifactsNamespace, type RepoHandle, readMainVia, withRetry } from "../artifacts.ts";
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

export interface PublisherClientOptions {
  readonly stub: PublisherStub;
  readonly artifacts: ArtifactsNamespace;
  /** The canonical repo's name and remote. */
  readonly canonical: { readonly name: string; readonly remote: string };
  readonly sleep?: (ms: number) => Promise<void>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Token lifetimes, in seconds. A token that expires during an upload refuses it (notes/2026-10-01-laneB-token-inflight.md). */
export const TOKEN_TTL = {
  /** Staging an integration and publishing: the pushes carry one commit and its new trees. */
  short: 60,
  /** Pinning copies a lane's objects, which can be large. The gateway still allows only the pin's own refs. */
  pin: 600,
} as const;

/** Mint a token on a repo, run `fn` with it, and revoke it whatever happens. */
async function withToken<T>(
  repo: RepoHandle,
  scope: "read" | "write",
  fn: (token: string) => Promise<T>,
  sleep?: (ms: number) => Promise<void>,
  ttl: number = TOKEN_TTL.short,
): Promise<T> {
  const opts = sleep ? { sleep } : {};
  const t = await withRetry(() => repo.createToken(scope, ttl), opts);
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
      const repo = await this.repo();
      const r = await withToken(
        repo,
        "write",
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
        this.o.sleep,
      );
      return r.kind === "clean" ? { kind: "clean", integration: r.integration as Sha, ref: r.ref } : { kind: "conflict", paths: r.paths };
    } catch (e) {
      return { kind: "error", detail: message(e) };
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
    const [forkRepo, canonical] = await Promise.all([this.get(fork.name), this.get(this.o.canonical.name)]);
    return withToken(
      forkRepo,
      "read",
      (forkToken) =>
        withToken(
          canonical,
          "write",
          (canonToken) =>
            this.o.stub.pinObjects({
              fork: { remote: fork.remote, token: forkToken },
              canonical: { remote: this.o.canonical.remote, token: canonToken },
              head,
            }),
          this.o.sleep,
          TOKEN_TTL.pin,
        ),
      this.o.sleep,
      TOKEN_TTL.pin,
    );
  }

  /** Step 2, after admission: the pinned ref, which never moves. */
  async pinRef(lane: string, generation: number, head: Sha): Promise<PinResult> {
    const canonical = await this.get(this.o.canonical.name);
    return withToken(canonical, "write", (token) =>
      this.o.stub.pinRef({ canonical: { remote: this.o.canonical.remote, token }, ref: pinnedRef(lane, generation), head }),
    );
  }

  /**
   * A merge preview of a pinned generation against main, with its
   * integration commit (stored in the canonical repo when it is a merge), the
   * same commit a landing on that main builds.
   */
  async preview(lane: string, generation: number, head: Sha): Promise<PreviewResult> {
    const canonical = await this.get(this.o.canonical.name);
    return withToken(canonical, "write", (token) =>
      this.o.stub.preview({ canonical: { remote: this.o.canonical.remote, token }, head, headRef: pinnedRef(lane, generation), lane, generation }),
    );
  }
}

