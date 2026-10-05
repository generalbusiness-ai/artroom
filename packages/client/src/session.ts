/**
 * A read session, as a device holds one (authority note, sections 3.9 and
 * 5.3). A session is a credential for the reads of one repository. It
 * signs nothing and controls nothing: every act is signed by the device's
 * key, and a session is never presented with one.
 *
 * - **Asking.** The device signs a session request with its own key, to the
 *   repository's membership scope with its incarnation, and sends it in a
 *   request's body. A key that is revoked is refused a new session. A
 *   request is answered with a session once: after a lost reply the device
 *   signs a new request, with a new operation identity.
 * - **Holding.** The token is kept in memory, in a `Session`. Nothing here
 *   writes it to storage, to a URL, to an error or to a log. `toJSON` and
 *   the text form of a `Session` leave it out.
 * - **Presenting.** `reader()` is the value of the `Authorization` header,
 *   which a transport sets from memory. It is what a `ScopeHandle` is given
 *   as its reader.
 * - **Ending.** `ends` is the end time that membership's clock wrote. A
 *   scope judges it on its own clock, so this device's clock decides
 *   nothing: `endedBy` says only whether to ask again. A session is not
 *   renewed: a new one needs a new signed request.
 *
 * Reading a stream, and its cleanup in the client, is the client pages'
 * (I5), by the proof plan's key O12.
 */

import type { ScopeId, ScopeRef, SessionAnswer, SessionClaims, SessionRefusal, SessionRequest, SignedSessionRequest, Timestamp } from "@generalbusiness/artroom-contract";
import { LATE, isKeyId, isMemberId, keyIdOfSecret, signSessionRequest, takeBytes, timeMs, within } from "@generalbusiness/artroom-bytes";
import { TransportError } from "./handle.ts";
import { REPLY_SECONDS, type Fetch } from "./http.ts";

/** A signed request for a read session of the repository whose membership scope is `to`. `operation`: a new identity for each request. */
export function sessionRequest(to: ScopeRef, secret: Uint8Array, notAfter: Timestamp, operation: string): SignedSessionRequest {
  const request: SessionRequest = { v: 1, to, actor: keyIdOfSecret(secret), action: "read-session", operation, notAfter };
  return signSessionRequest(request, secret);
}

/** A read session in memory. */
export class Session {
  readonly #token: string;
  /** What the token names: the repository, the member and key, the reads, and the end time. No part of it is a credential. */
  readonly claims: SessionClaims;

  constructor(token: string, claims: SessionClaims) {
    this.#token = token;
    this.claims = claims;
  }

  /** The value of the `Authorization` header: what a transport presents to the read port. */
  reader(): string { return `Session ${this.#token}`; }
  /** Whether this clock's reading is at or past the end time. A scope decides on its own clock; this says only when to ask again. */
  endedBy(now: Timestamp): boolean { return (timeMs(now) ?? Infinity) >= (timeMs(this.claims.ends) ?? 0); }
  /** The claims only: the token is never part of a session's JSON or text. */
  toJSON(): { claims: SessionClaims } { return { claims: this.claims }; }
  toString(): string { return `Session of ${this.claims.member} until ${this.claims.ends}`; }
}

const REFUSALS: Record<SessionRefusal, true> = { "sessions-unavailable": true, "bad-request": true, "not-found": true, misaddressed: true, "clock-behind": true, expired: true, unauthorized: true, replayed: true, "rate-limited": true };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether a reply is an answer to a session request, with what that answer must carry. A reply is untrusted until this has passed. */
export function isSessionAnswer(v: unknown): v is SessionAnswer {
  if (!isObject(v)) return false;
  if (v["ok"] === false) return Object.keys(v).length === 2 && typeof v["reason"] === "string" && Object.hasOwn(REFUSALS, v["reason"]);
  const claims = v["session"];
  return v["ok"] === true && Object.keys(v).length === 3 && typeof v["token"] === "string" && v["token"].length <= 4096 && isObject(claims) && claims["v"] === 1
    && isObject(claims["membership"]) && isMemberId(claims["member"]) && isKeyId(claims["key"]) && Array.isArray(claims["reads"]) && claims["reads"].every((read) => typeof read === "string")
    && timeMs(claims["ends"]) !== null;
}

/** The most raw bytes of an answer to a session request. */
const ANSWER_BYTES = 16 * 1024;

/**
 * Ask a membership scope for a read session over the scope service's HTTP
 * route. The signed request travels in the body, and the token comes back
 * in the answer's body: neither is ever in a URL.
 *
 * A session, or the reason that membership gave none. A reply that is no
 * answer, that names another repository, member key or a later end than the
 * request allows for, or that does not come in time is a `TransportError`,
 * whose text holds nothing of the reply.
 */
export async function requestSession(service: string, membership: ScopeId, signed: SignedSessionRequest, options: { fetch?: Fetch; seconds?: number } = {}): Promise<{ ok: true; session: Session } | { ok: false; reason: SessionRefusal }> {
  const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  if (!send) throw new TransportError("this runtime has no fetch; nothing was sent");
  const seconds = options.seconds ?? REPLY_SECONDS;
  const failed = (what: string) => new TransportError(`${what}. No session was taken; a new signed request may be sent.`);
  let got: { bytes: Uint8Array | null | typeof LATE } | typeof LATE;
  try {
    got = await within(seconds, async (signal) => {
      const response = await send(`${service.replace(/\/+$/, "")}/v1/scopes/${encodeURIComponent(membership)}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signed), signal: signal as never });
      return { bytes: response.body ? await takeBytes(response.body, ANSWER_BYTES, signal) : new Uint8Array(0) };
    });
  } catch {
    throw failed("no reply");
  }
  if (got === LATE || got.bytes === LATE) throw failed(`no whole reply within ${seconds} seconds`);
  if (got.bytes === null) throw failed("the reply is too long and was not read");
  let answer: unknown;
  try {
    answer = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(got.bytes));
  } catch {
    answer = null;
  }
  if (!isSessionAnswer(answer)) throw failed("the reply is not an answer to a session request");
  if (!answer.ok) return answer;
  // The session must be the one that was asked for: of that membership scope and incarnation, and for the key that signed.
  const { membership: of, key } = answer.session;
  if (of.scope !== signed.request.to.scope || of.inc !== signed.request.to.inc || key !== signed.request.actor) throw failed("the reply is a session of another repository or key");
  return { ok: true, session: new Session(answer.token, answer.session) };
}
