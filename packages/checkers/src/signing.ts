/**
 * The signer (authority note, sections 3.11 and 5.5). A checker is a member
 * with the role `checker` and its own key, which the checker service holds.
 * The service signs three intents with it, and nothing else:
 *
 * - `check`: a judged pass or a judged fail of one job;
 * - `check-error`: an error of the run, with its reason;
 * - `git-read@1:job-read`: the request for the job's read token.
 *
 * **Which key, and where it is.** The checker's signing key: one key pair,
 * made for that one member, never derived from another secret, and held in
 * the deployment's secret store (section 5.5). It is given to this module as
 * a `ResultSigner`, which gives out the key's ID and signatures and never
 * the private key. The signer is used in the service's own process. **It is
 * never given to a runner**: no member of a job, a grant, a run's input or a
 * run's environment holds it, and a configuration's variables hold no
 * credential. What one leak of it reaches is section 5.5's row: results
 * signed as that checker, each of which must still name a job that exists,
 * with its tree and its configuration digest.
 *
 * **What a result names.** The job's fact, as the item that the lane holds;
 * the tree; the configuration's digest; the outcome or the reason; and the
 * digest of the details, which holds the record of what ran. So the key
 * signs that record, and a result can count for no other job.
 *
 * **The byte domain.** `artroom-intent-1`, the contract's one domain for a
 * signed intent. The earlier envelope domain is not carried.
 *
 * The signer is the last step. `signResult` signs only an outcome that
 * `judge` answered: its type has no other member.
 */

import { DOMAINS, PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Base64Url, FieldValue, Intent, KeyId, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { b64url, canonicalBytes, domainBytes, parseStrictBytes, timeOf } from "@generalbusiness/artroom-bytes";
import type { Job } from "./job.ts";
import { detailsDigest, type Details, type Outcome } from "./outcome.ts";

/** Signs bytes as the checker's one key. It gives out the key's ID and signatures, and never the private key. */
export interface ResultSigner {
  readonly key: KeyId;
  sign(bytes: Uint8Array): Base64Url | Promise<Base64Url>;
}

export interface Signing {
  /** The signing time, in milliseconds: the service's own clock. */
  now: number;
  /** Sixteen random bytes, for the intent's idempotency key. The caller draws them. */
  nonce: Uint8Array;
  /** How long the intent stays admissible. The default is five minutes, inside the contract's bound. */
  lifetimeSeconds?: number;
}

async function signed(signer: ResultSigner, asked: Pick<Intent, "to" | "kind" | "expected" | "fields">, signing: Signing): Promise<SignedIntent> {
  const lifetime = signing.lifetimeSeconds ?? 300;
  if (!(lifetime > 0 && lifetime <= PROPOSED_BOUNDS.intentLifetimeSeconds) || signing.nonce.length !== 16) throw new RangeError("an intent lives at most the contract's bound, and its key is made from 16 random bytes");
  const notAfter: Timestamp = timeOf(Math.floor(signing.now / 1000) * 1000 + lifetime * 1000);
  // A detached, canonical copy is what is signed and what is returned, as the client's `signedIntent` does.
  const intent = parseStrictBytes(canonicalBytes({ v: 1, to: asked.to, actor: signer.key, kind: asked.kind, on: null, expected: asked.expected, fields: asked.fields, idempotencyKey: b64url(signing.nonce), notAfter } satisfies Intent)) as Intent;
  return { intent, sig: await signer.sign(domainBytes(DOMAINS.intent, intent)) };
}

/**
 * The signed result of one job: `check` with its outcome, or `check-error`
 * with its reason. `expected` is the revision of each item that the act
 * names, as the service read them from the lane just before it signs.
 *
 * The fields are the lane's own for the two acts (`change`, section 4.2):
 * `job`, the job's item, which is the position of its `request-check`
 * entry; `tree`; `configuration`; `outcome` or `reason`; and `details`,
 * when there are any.
 */
export function signResult(signer: ResultSigner, job: Job, outcome: Outcome, details: Details | null, expected: Record<string, number>, signing: Signing): Promise<SignedIntent> {
  const fields: Record<string, FieldValue> = {
    job: job.fact.seq, tree: job.tree, configuration: job.configuration,
    ...(outcome.act === "check" ? { outcome: outcome.outcome } : { reason: outcome.reason }),
    ...(details === null ? {} : { details: detailsDigest(details) }),
  };
  return signed(signer, { to: job.lane, kind: outcome.act, expected, fields }, signing);
}

/** The capability and the step that the request for a read token names beside its intent (section 3.11). */
export const JOB_READ = { capability: "git-read@1", step: "job-read" } as const;

/** The signed request for the job's read token: the step `job-read` of `git-read@1`, which names the job's fact (I3 deltas, entry EW1). */
export function signJobRead(signer: ResultSigner, job: Pick<Job, "lane" | "fact">, signing: Signing): Promise<SignedIntent> {
  return signed(signer, { to: job.lane, kind: `${JOB_READ.capability}:${JOB_READ.step}`, expected: {}, fields: { job: job.fact } }, signing);
}
