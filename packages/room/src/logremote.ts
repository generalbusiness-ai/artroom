/**
 * Lane L's git remote for `refs/artroom/log`, in a Worker. Reads go through
 * the Artifacts binding: each object is re-encoded from what the binding
 * returns and accepted only if it hashes to the SHA asked for, so a reader
 * never trusts a decoding. Pushes go to the publisher sandbox, which holds
 * the only canonical write path (R-PUB-3); the sandbox's `pushLog` is lane
 * B's to provide.
 */

import type { Sha } from "@generalbusiness/artroom-contract";
import { encodeCommit, encodeTree, gitObject, type GitObject, type GitRemote, type ObjectType, type PushOutcome, type TreeEntry } from "@generalbusiness/artroom-log";
import { b64url } from "./crypto.ts";
import type { ArtifactsBinding, RepoLocation } from "./artifacts.ts";

/** The publisher sandbox's log push, if this deployment's sandbox has it. */
export interface LogPushStub {
  pushLog?(req: {
    readonly canonical: { readonly remote: string; readonly token: string };
    readonly objects: readonly { readonly type: ObjectType; readonly data: string }[];
    readonly ref: string;
    readonly next: Sha;
    readonly lease: Sha | null;
  }): Promise<PushOutcome>;
}

export function artifactsLogRemote(binding: ArtifactsBinding, stub: LogPushStub, repo: RepoLocation): GitRemote {
  const handle = () => binding.get(repo.name);
  const exact = (type: ObjectType, data: Uint8Array, sha: string) => {
    const o = gitObject(type, data);
    if (o.sha !== sha) throw new Error(`object ${sha} could not be read exactly`);
    return { type, data };
  };
  return {
    async readRef(ref: string): Promise<Sha | null> {
      const [top] = await (await handle()).log({ ref, limit: 1 });
      return (top?.hash as Sha | undefined) ?? null;
    },
    async readObject(sha: Sha) {
      const r = await handle();
      const c = (await r.readCommit(sha)) as (Awaited<ReturnType<typeof r.readCommit>> & { message?: string; author?: { name: string; email: string }; committer?: { name: string; email: string }; authoredAt?: number }) | null;
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
      const t = await r.readTree(sha);
      if (t) return exact("tree", encodeTree(t.map((e) => ({ name: e.name, mode: e.mode as TreeEntry["mode"], sha: e.hash as Sha }))), sha);
      const b = await r.readBlob(sha);
      if (b) return exact("blob", new Uint8Array(await b.arrayBuffer()), sha);
      throw new Error(`object ${sha} not found`);
    },
    async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
      if (!stub.pushLog) throw new Error("this deployment's publisher sandbox cannot push the log yet (lane B: pushLog)");
      const r = await handle();
      const t = await r.createToken("write", 60);
      try {
        const remote = (await r.info()).remote;
        return await stub.pushLog({ canonical: { remote, token: t.plaintext }, objects: objects.map((o) => ({ type: o.type, data: b64url(o.data) })), ref, next, lease });
      } finally {
        await r.revokeToken(t.id).catch(() => false);
      }
    },
  };
}
