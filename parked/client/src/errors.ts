/**
 * `ArtroomError` values (R-API-1). They are plain objects, not class
 * instances, so they survive every transport; callers test them with
 * `isArtroomError()`, never with `instanceof`.
 */

import type { ArtroomError, ErrorCode, Refusal } from "@generalbusiness/artroom-contract";

const RETRYABLE: Readonly<Record<ErrorCode, boolean>> = {
  "bad-request": false,
  unauthenticated: false,
  forbidden: false,
  "not-found": false,
  "payload-too-large": false,
  "rate-limited": true,
  timeout: true,
  unavailable: true,
  "policy-runtime": true,
  internal: true,
};

/** The HTTPS status for each code (R-API-1). */
export const STATUS: Readonly<Record<ErrorCode, number>> = {
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

/** The code to use when a response carries no `ArtroomError` body. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "bad-request";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not-found";
    case 413:
      return "payload-too-large";
    case 429:
      return "rate-limited";
    case 503:
      return "unavailable";
    case 504:
      return "timeout";
    default:
      return status >= 500 ? "internal" : "bad-request";
  }
}

export function artroomError(
  code: ErrorCode,
  message: string,
  extra: { readonly retryAfterMs?: number; readonly maybeRecorded?: boolean } = {},
): ArtroomError {
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
 * Removes known secrets from text before it reaches a caller (R-WS-4). The
 * room should never put a token in a message; this is the client's second
 * line of defence.
 */
export class Redactor {
  readonly #secrets = new Set<string>();

  add(secret: string | undefined): void {
    if (secret !== undefined && secret.length >= 8) this.#secrets.add(secret);
  }

  text(value: string): string {
    let out = value;
    for (const s of this.#secrets) out = out.split(s).join("[redacted]");
    return out;
  }

  error(e: ArtroomError): ArtroomError {
    const message = this.text(e.message);
    return message === e.message ? e : { ...e, message };
  }

  refusal(r: Refusal): Refusal {
    const reason = this.text(r.reason);
    const fix = r.fix === undefined ? undefined : this.text(r.fix);
    if (reason === r.reason && fix === r.fix) return r;
    return { ...r, reason, ...(fix !== undefined ? { fix } : {}) };
  }
}
