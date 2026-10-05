/**
 * The runner's boundary (authority note, sections 3.11, 5.3 and 5.5): what
 * one runner is, what goes into it, and the one way out of it. It is the
 * reviewed successor of the earlier sandbox
 * (`notes/2026-10-05-i3-checkers-review.md`, section 3).
 *
 * **One job, one runner.** A runner is a new container, started from the
 * image that the configuration names by its content digest, with exactly
 * the configuration's variables. It runs one job and is then destroyed. No
 * runner runs a second job.
 *
 * **What a job's input is.** `RunAsk`, of `service.ts`: the run's name, the
 * job as the service read it from the lane, and the configuration. The tree
 * is untrusted: its files run inside the runner.
 *
 * **What a runner never holds.**
 *
 * - The checker's signing key. Results are signed in the service's process,
 *   after the run (`signing.ts`).
 * - The read token. The gateway adds it to the requests that it forwards.
 *   It is not in Git's arguments or configuration, not in the container's
 *   environment, and not in a URL (section 5.3).
 * - A write token, the host account's credential, a session secret, or an
 *   address of a scope.
 *
 * **What a runner may read.** One repository at the Git host, read only,
 * through its gateway, for as long as the job's read token is `live`. And
 * its own container's files. It has no other network: no registry and no
 * other host. A check that needs a package from a registry needs an image
 * that holds it (I3 deltas, entry EW16).
 *
 * **What a runner may write.** Its own container's files. Nothing leaves
 * the container but what it returns to the service, which is data.
 *
 * **The gateway matches the path exactly.** The runner's gateway is the
 * gateway of `packages/git`, with one grant that only reads: `update` is
 * null. That gateway forwards a request only when its URL is the granted
 * repository's URL with one of the two read suffixes of Git's smart HTTP
 * protocol, and nothing more:
 *
 * | Request | Forwarded |
 * |---|---|
 * | `GET <repository>/info/refs?service=git-upload-pack` | Yes |
 * | `POST <repository>/git-upload-pack`, with no query | Yes |
 * | `GET <repository>/info/refs?service=git-receive-pack`, or `POST <repository>/git-receive-pack` | No: `reads-only` |
 * | Another path under the repository, another query, another method | No: `not-git` |
 * | A repository whose path only begins with the granted one, or another host | No: `no-grant` |
 * | A URL with a user or a password | No: `credential-in-url` |
 *
 * A prefix match is not enough: the path after the repository is compared
 * whole, as the URL's own form has it. The request that is forwarded is
 * never followed to another place: the gateway asks for no redirect.
 *
 * One gateway serves one run: it is made for the run, opens its one grant
 * when the token is `live`, and is closed with the run. The grant is opened
 * only for a token that its sealed outcome entry made `live` (section 5.7).
 */

import type { FactRef, ScopeRef } from "@generalbusiness/artroom-contract";
import { Gateway, type GatewayOptions, type GrantRecord, type GrantRequest, type LiveToken } from "@generalbusiness/artroom-git";

/** The purpose of a job's read token, as its record states it (`derive/src/capability/gitread.ts`, `CHECK_READ`). */
export const CHECK_READ = "check-read";

const sameFact = (a: FactRef, b: FactRef): boolean => a.at.scope === b.at.scope && a.at.inc === b.at.inc && a.seq === b.seq && a.hash === b.hash;

/**
 * The one grant of a run's gateway: the job's repository, for reads only,
 * with the job's read token. Null: the token is not the read token of this
 * job in this lane, and no grant is made for it.
 *
 * The attempt's name is made from the lane, its incarnation and the job's
 * position, so one job has one grant in a gateway's life.
 */
export function readGrant(job: { lane: ScopeRef; fact: FactRef }, repository: string, token: LiveToken): GrantRequest | null {
  if (token.purpose !== CHECK_READ || !("job" in token.for) || !sameFact(token.for.job, job.fact) || token.scope.scope !== job.lane.scope || token.scope.inc !== job.lane.inc) return null;
  return { attempt: `${job.lane.scope}.${job.lane.inc}.${job.fact.seq}`, repository, update: null, token: { id: token.id, state: token.state, plaintext: token.plaintext } };
}

/**
 * The gateway of one run, with its one read grant open. The plaintext is
 * the gateway's from here: this function keeps nothing of the token. It
 * rejects with the gateway's own refusal when the grant is not opened.
 */
// I3 merge: nothing routes a `live` read token from the token driver's `Custody` to the run that waits for it. That is the
// deployment's wiring of the checker service, with a real runner (plan question Q8).
export async function runnerGateway(options: GatewayOptions, grant: GrantRequest): Promise<{ gateway: Gateway; record: GrantRecord }> {
  const gateway = new Gateway(options);
  return { gateway, record: await gateway.open(grant) };
}
