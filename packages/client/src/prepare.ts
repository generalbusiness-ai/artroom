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
import { LATE, takeBytes, within } from "@generalbusiness/artroom-bytes";
import { ANSWERS } from "./answers.ts";
import { TransportError } from "./handle.ts";
import { REPLY_BYTES, REPLY_SECONDS, type Fetch } from "./http.ts";
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
 * Send one request to the scope that owns the resource, over the service's
 * HTTP route. The reply is read as `httpTransport` reads one: within
 * `seconds`, at most `bytes`, and only when it is one of the answers of an
 * act, which a preparation shares. Anything else is a `TransportError`: the
 * outcome is unknown, and the same request may be sent again.
 */
export async function sendPreparation(service: string, scope: string, request: Preparation, grants: readonly Grant[] = [], options: { fetch?: Fetch; bytes?: number; seconds?: number } = {}): Promise<Answer> {
  const failed = (what: string) => new TransportError(`${what}. The outcome of the request is unknown: it may have been recorded. The same request may be sent again.`);
  const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  if (!send) throw new TransportError("this runtime has no fetch; nothing was sent");
  const seconds = options.seconds ?? REPLY_SECONDS;
  const most = options.bytes ?? REPLY_BYTES;
  const url = `${service.replace(/\/+$/, "")}/v1/scopes/${encodeURIComponent(scope)}/preparations`;
  let got: { status: number; bytes: Uint8Array | null | typeof LATE } | typeof LATE;
  try {
    got = await within(seconds, async (signal) => {
      const response = await send(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, grants }), signal: signal as never });
      return { status: response.status, bytes: response.body ? await takeBytes(response.body, most, signal) : new Uint8Array(0) };
    });
  } catch (error) {
    throw failed(`no reply: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (got === LATE || got.bytes === LATE) throw failed(`no whole reply within ${seconds} seconds; the request was aborted`);
  if (got.bytes === null) throw failed(`the reply, status ${got.status}, is longer than ${most} bytes and was not read`);
  let answer: unknown = null;
  try {
    answer = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(got.bytes));
    if (!ANSWERS.submit(answer)) answer = null;
  } catch {
    answer = null;
  }
  if (answer === null) throw failed(`the reply, status ${got.status}, is not an answer to a preparation`);
  return answer as Answer;
}
