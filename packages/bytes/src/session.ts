/**
 * The bytes of a session request, and its signature (authority note,
 * section 3.9; the contract package's `session.ts`). The bytes are the
 * request's own tag, one newline byte, and the canonical JSON of the
 * request, as every signature's bytes are built (`domains.ts`). The tag is
 * no tag of an intent, so a signed session request is never a signed
 * intent, and a signed intent is never a session request.
 *
 * A signed read is built the same way under its own tag, `artroom-read-1`.
 */

import { SESSION_DOMAINS } from "@generalbusiness/artroom-contract";
import type { Digest, ReadRequest, RetainedInput, SessionRequest, SignedRead, SignedSessionRequest } from "@generalbusiness/artroom-contract";
import { canonicalBytes, utf8 } from "./canonical.ts";
import { sign, verify } from "./sign.ts";
import { digestBytes } from "./hash.ts";

/** A tag, one newline byte, then the bytes. */
export function taggedBytes(tag: string, bytes: Uint8Array): Uint8Array {
  const head = utf8(`${tag}\n`);
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head, 0);
  out.set(bytes, head.length);
  return out;
}

/** A retained read's exact kind, digest and domain, under one fixed-width argument. */
export function retainedReadArgument(kind: RetainedInput["kind"], digest: Digest, domain?: string): Digest {
  return digestBytes(taggedBytes(SESSION_DOMAINS.readResource, canonicalBytes([kind, digest, domain ?? null])));
}

const requestBytes = (request: SessionRequest): Uint8Array => taggedBytes(SESSION_DOMAINS.request, canonicalBytes(request));

/** Sign a session request with the device's own key. */
export function signSessionRequest(request: SessionRequest, secret: Uint8Array): SignedSessionRequest {
  return { request, sig: sign(secret, requestBytes(request)) };
}

/** True when the signature is by the request's `actor` over the request's bytes. Malformed input is false. Never throws. */
export function verifySessionRequest(signed: SignedSessionRequest): boolean {
  try {
    return verify(signed.request.actor, signed.sig, requestBytes(signed.request));
  } catch {
    return false;
  }
}

const readBytes = (request: ReadRequest): Uint8Array => taggedBytes(SESSION_DOMAINS.read, canonicalBytes(request));

/** Sign a read request with the device's own key. */
export function signRead(request: ReadRequest, secret: Uint8Array): SignedRead {
  return { request, sig: sign(secret, readBytes(request)) };
}

/** True when the signature is by the request's `actor` over the request's bytes. Malformed input is false. Never throws. */
export function verifySignedRead(signed: SignedRead): boolean {
  try {
    return verify(signed.request.actor, signed.sig, readBytes(signed.request));
  } catch {
    return false;
  }
}
