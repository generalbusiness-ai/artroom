/**
 * Lane L's git remote for `refs/artroom/log`, in a Worker, over the
 * Artifacts binding and lane B's publisher sandbox (`LogRemoteStub`).
 *
 * - The ref is read by the sandbox (`readLogRef`, `git ls-remote`) under a
 *   read token of at most 60 seconds, revoked afterwards: the binding's
 *   `log({ ref })` resolves branches, tags and commit IDs, and returns
 *   nothing for `refs/artroom/log`. A ref that cannot be read throws; it is
 *   never taken to be absent.
 * - Objects are read by ID through the binding, re-encoded, and accepted
 *   only if they hash to the ID asked for. The binding's `readCommit` and
 *   `readTree` throw for an object of another type, and `readBlob` returns
 *   null, so each kind is tried in turn; the hash check keeps that safe.
 * - Pushes go to the sandbox (`pushLog`) under a write token of at most 60
 *   seconds, revoked afterwards. The answer is lane L's `PushOutcome`.
 * - A publication larger than one transfer is staged first, in bounded
 *   parts, through the sandbox (`stageLog`, no token: the sandbox stages
 *   locally), and then pushed with no objects. The answer is lane L's
 *   `StageOutcome`, returned as the sandbox gives it.
 */

import type { Sha } from "@generalbusiness/artroom-contract";
import type { LogRemoteStub } from "@generalbusiness/artroom-git";
import { encodeCommit, encodeTree, gitObject, type GitObject, type ObjectType, type PushOutcome, type StageOutcome, type StagePart, type StageWant, type TreeEntry } from "@generalbusiness/artroom-log";
import { b64url } from "./crypto.ts";
import type { ArtifactsBinding, RepoLocation } from "./artifacts.ts";
import type { StagingRemote } from "./ports.ts";

export type { LogRemoteStub };

export function artifactsLogRemote(binding: ArtifactsBinding, stub: LogRemoteStub, repo: RepoLocation): StagingRemote {
  const handle = () => binding.get(repo.name);
  const exact = (type: ObjectType, data: Uint8Array, sha: string) => {
    const o = gitObject(type, data);
    if (o.sha !== sha) throw new Error(`object ${sha} could not be read exactly`);
    return { type, data };
  };
  /** Run `fn` with a token of at most 60 seconds on the canonical repository, revoked afterwards. */
  const withToken = async <T>(scope: "read" | "write", fn: (canonical: { remote: string; token: string }) => Promise<T>): Promise<T> => {
    const r = await handle();
    const t = await r.createToken(scope, 60);
    try {
      return await fn({ remote: (await r.info()).remote, token: t.plaintext });
    } finally {
      await r.revokeToken(t.id).catch(() => false);
    }
  };
  /** A read of one kind: null when the object is not of that kind (a throw or null from the binding). */
  const attempt = async <T>(read: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await read();
    } catch {
      return null;
    }
  };
  return {
    async readRef(ref: string): Promise<Sha | null> {
      return withToken("read", (canonical) => stub.readLogRef({ canonical, ref }));
    },
    async readObject(sha: Sha) {
      const r = await handle();
      const c = (await attempt(() => r.readCommit(sha))) as
        | (Awaited<ReturnType<typeof r.readCommit>> & { message?: string; author?: { name: string; email: string }; committer?: { name: string; email: string }; authoredAt?: number })
        | null;
      if (c && c.author && c.committer) {
        const who = (p: { name: string; email: string }, at: number) => `${p.name} <${p.email}> ${at} +0000`;
        const data = encodeCommit({
          tree: c.treeHash as Sha,
          parents: c.parents as Sha[],
          author: who(c.author, c.authoredAt ?? c.committedAt),
          committer: who(c.committer, c.committedAt),
          message: `${c.message ?? ""}\n`,
        });
        return exact("commit", data, sha);
      }
      const t = await attempt(() => r.readTree(sha));
      if (t) return exact("tree", encodeTree(t.map((e) => ({ name: e.name, mode: e.mode as TreeEntry["mode"], sha: e.hash as Sha }))), sha);
      const b = await attempt(() => r.readBlob(sha));
      if (b) return exact("blob", new Uint8Array(await b.arrayBuffer()), sha);
      throw new Error(`object ${sha} could not be read`);
    },
    async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
      return withToken("write", (canonical) =>
        stub.pushLog({ canonical, objects: objects.map((o) => ({ type: o.type, data: b64url(o.data) })), ref, next, lease }) as Promise<PushOutcome>,
      );
    },
    async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
      const remote = (await (await handle()).info()).remote;
      return stub.stageLog({
        canonical: { remote },
        cohort,
        want,
        parts: parts.map((p) => ({ sha: p.sha, type: p.type, size: p.size, offset: p.offset, data: b64url(p.data) })),
      }) as Promise<StageOutcome>;
    },
  };
}
