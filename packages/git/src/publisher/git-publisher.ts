/**
 * `PublisherPort` over `GitOps`, for one canonical repository. The publisher
 * sandbox runs this inside the container; Node tests run it against local
 * bare repositories. Tokens are not handled here: in the container the
 * gateway adds them (publisher/gateway.ts).
 */

import type { OpId, Sha } from "@generalbusiness/artroom-contract";
import type { IntegrateResult } from "../landing/core.ts";
import type { PublisherPort } from "../landing/engine.ts";
import type { PushOutcome } from "./push-outcome.ts";
import { GitError, type GitOps, integrationRef, pinnedRef } from "./gitops.ts";

export function landMessage(lane: string, generation: number, op: OpId): string {
  return `Land ${lane} generation ${generation}\n\nArtroom-Op: ${op}\n`;
}

export class GitPublisher implements PublisherPort {
  private readonly git: GitOps;
  private readonly canonical: string;
  constructor(git: GitOps, canonical: string) {
    this.git = git;
    this.canonical = canonical;
  }

  async integrate(req: Parameters<PublisherPort["integrate"]>[0]): Promise<IntegrateResult> {
    try {
      const r = await this.git.integrate({
        canonical: this.canonical,
        expectedMain: req.expectedMain,
        head: req.head,
        headRef: pinnedRef(req.lane, req.generation),
        storeRef: integrationRef(req.op, req.attempt),
        message: landMessage(req.lane, req.generation, req.op),
        committedAt: req.committedAt,
      });
      return r.kind === "clean" ? { kind: "clean", integration: r.integration as Sha, ref: r.ref } : { kind: "conflict", paths: r.paths };
    } catch (e) {
      return { kind: "error", detail: e instanceof GitError ? e.message : String(e) };
    }
  }

  push(req: Parameters<PublisherPort["push"]>[0]): Promise<PushOutcome> {
    return this.git.pushMain(this.canonical, req.integration, req.expectedMain, req.integrationRef);
  }

  async readMain(): Promise<Sha> {
    const main = await this.git.lsRemote(this.canonical, "refs/heads/main");
    if (!main) throw new Error("canonical main is missing");
    return main as Sha;
  }
}
