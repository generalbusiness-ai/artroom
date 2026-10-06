/**
 * Build, sign and send a request for one step of a capability (scope
 * contract, section 5.5). A step is asked for with the signed intent that
 * it prepares for: the request is that signed intent, the capability and
 * the step. The scope that owns the resource records it as a `preparation`
 * entry, before anything outside the service is caused.
 *
 * The intent is the one that the act will be submitted with afterwards, so
 * a caller keeps the request and submits `request.signed` as the act. The
 * preparation does not consume the intent's idempotency key.
 *
 * **Retrying.** A request with no answer, or with an unavailable one, is
 * sent again as the same request. The scope answers the same intent,
 * capability and step with its first entry, and writes nothing.
 */

import type { Answer, CapabilityName, Grant, SignedIntent } from "@generalbusiness/artroom-contract";
import type { Transport } from "./handle.ts";
import { signedIntent, type Asked, type Signer, type Signing } from "./intent.ts";

/** One request for a step: the signed intent that it prepares for, the capability and the step. Only the intent is signed. */
export interface Preparation { signed: SignedIntent; capability: CapabilityName; step: string }

/** A request for `step` of `capability`, for an intent that already exists: the one that the act will be submitted with. */
export const preparationOf = (signed: SignedIntent, capability: CapabilityName, step: string): Preparation => ({ signed, capability, step });

/**
 * A request for `step` of `capability`, with a new intent by `signer`. The
 * intent is built and signed as `signedIntent` does. Keep the request: the
 * act that it prepares is `request.signed`, and a retry is the same request.
 */
export async function preparation(signer: Signer, asked: Asked, capability: CapabilityName, step: string, signing: Signing = {}): Promise<Preparation> {
  return preparationOf(await signedIntent(signer, asked, signing), capability, step);
}

/**
 * Send one request to the scope that owns the resource, through a
 * transport: the operation `prepare` of the contract's `ScopeApi`. The
 * transport reads the reply as it reads an act's. A `TransportError` says
 * that the outcome is unknown, and the same request may be sent again.
 */
export function sendPreparation(transport: Transport, scope: string, request: Preparation, grants: readonly Grant[] = []): Promise<Answer> {
  return transport.prepare(scope, request.signed, grants, request.capability, request.step);
}
