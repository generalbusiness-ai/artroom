/**
 * Thrown failures (R-API-1). Refusals are values; these are exceptions.
 * Messages never contain a credential or a secret (R-WS-4, R-SEC-3).
 */

import type { ArtroomError, ErrorCode } from "@generalbusiness/artroom-contract";
import { isArtroomError } from "@generalbusiness/artroom-contract";

const RETRYABLE: Readonly<Record<ErrorCode, boolean>> = {
  "bad-request": false,
  unauthenticated: false,
  forbidden: false,
  "not-found": false,
  "payload-too-large": false,
  "rate-limited": true,
  internal: true,
  unavailable: true,
  "policy-runtime": true,
  timeout: true,
};

export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  "bad-request": 400,
  unauthenticated: 401,
  forbidden: 403,
  "not-found": 404,
  "payload-too-large": 413,
  "rate-limited": 429,
  internal: 500,
  unavailable: 503,
  "policy-runtime": 503,
  timeout: 504,
};

export function artroomError(code: ErrorCode, message: string, extra: { retryAfterMs?: number; maybeRecorded?: boolean } = {}): ArtroomError {
  return {
    name: "ArtroomError",
    code,
    message,
    retryable: RETRYABLE[code],
    ...(extra.retryAfterMs !== undefined ? { retryAfterMs: extra.retryAfterMs } : {}),
    ...(extra.maybeRecorded !== undefined ? { maybeRecorded: extra.maybeRecorded } : {}),
  };
}

/**
 * Any failure as a plain `ArtroomError`. An unknown error becomes a retryable
 * `internal` with a fixed message, so nothing from inside leaks (R-ADM-9).
 */
export function toArtroomError(e: unknown): ArtroomError {
  if (isArtroomError(e)) {
    const x = e as ArtroomError;
    return artroomError(x.code, x.message, {
      ...(x.retryAfterMs !== undefined ? { retryAfterMs: x.retryAfterMs } : {}),
      ...(x.maybeRecorded !== undefined ? { maybeRecorded: x.maybeRecorded } : {}),
    });
  }
  return artroomError("internal", "The room failed while handling this request. Nothing was recorded; retry with the same idempotency key.", { maybeRecorded: false });
}

/** A value or a thrown failure, as it crosses the Durable Object boundary. */
export type Wire<T> = { readonly ok: T } | { readonly error: ArtroomError };

/** `unknown` is told of a failure that is not an `ArtroomError`, which the caller sees only as `internal`. */
export async function wire<T>(fn: () => Promise<T>, unknown?: (e: unknown) => void): Promise<Wire<T>> {
  try {
    return { ok: await fn() };
  } catch (e) {
    if (!isArtroomError(e)) unknown?.(e);
    return { error: toArtroomError(e) };
  }
}

export function unwire<T>(w: Wire<T>): T {
  if ("error" in w) throw Object.assign(new Error(w.error.message), w.error);
  return w.ok;
}
