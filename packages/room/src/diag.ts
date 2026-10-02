/**
 * Diagnoses: one JSON line in the Worker's log for a failure the client sees
 * only as a fixed message (request d268d249). The record names the step and
 * the error's name, with its message redacted and bounded, so no token,
 * credential or URL query reaches the log (R-WS-4, R-SEC-3).
 */

import { DETECTORS, highEntropy, TOKEN } from "./secrets.ts";

export interface Diagnosis {
  /** What failed, for example `pre-admission-failed`. */
  readonly event: string;
  /** The step that threw, for example `propose.pinObjects`. */
  readonly step: string;
  /** The error's name, or the type of a thrown value that is not an error. */
  readonly name: string;
  /** The error's message, redacted, at most `MAX_MESSAGE` characters. */
  readonly message: string;
}

/** Where diagnoses go. The Worker's log by default; tests capture them. */
export type DiagnosisSink = (d: Diagnosis) => void;

export const MAX_MESSAGE = 300;
/** Text read before redaction; a longer message is cut at a space first, so no part of a token is left at the cut. */
const MAX_INPUT = 4096;

export const toConsole: DiagnosisSink = (d) => console.error(JSON.stringify(d));

const DETECT = DETECTORS.map((d) => new RegExp(d.re.source, d.re.flags.includes("g") ? d.re.flags : `${d.re.flags}g`));

/**
 * The text with anything that may be a credential replaced, at most
 * `MAX_MESSAGE` characters: Artifacts tokens (`art_v<n>_…`, with any
 * `?expires=`), URL userinfo and query strings, Authorization and Cookie
 * values, Bearer and Basic credentials, `name=value` pairs whose name says
 * token, secret, password, key, signature or credential, the secret scan's
 * format detectors, and long random-looking tokens.
 */
export function redact(text: string): string {
  let s = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT).replace(/\S*$/, "") : text;
  s = s
    .replace(/art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g, "<token>")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]*@/gi, "$1<credentials>@")
    .replace(/\?[^\s"'<>#]+/g, "?<query>")
    .replace(/\b((?:proxy-)?authorization|(?:set-)?cookie)(["']?\s*[:=]\s*)[^\r\n]*/gi, "$1$2<redacted>")
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 <redacted>")
    .replace(/\b([A-Za-z_-]*(?:token|secret|password|passwd|pwd|key|signature|sig|credential)s?)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, "$1$2<redacted>");
  for (const re of DETECT) s = s.replace(re, "<secret>");
  s = s.replace(TOKEN, (m) => (highEntropy(m.replace(/^[+/=_-]+|[+/=_-]+$/g, "")) ? "<secret>" : m));
  return s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s;
}

/** The diagnosis of a thrown value: its name and its redacted message. */
export function diagnosis(event: string, step: string, e: unknown): Diagnosis {
  const o = typeof e === "object" && e !== null ? (e as { name?: unknown; message?: unknown }) : null;
  const name = o && typeof o.name === "string" ? redact(o.name).slice(0, 100) : e === null ? "null" : typeof e;
  const message = redact(o && typeof o.message === "string" ? o.message : String(e));
  return { event, step, name, message };
}

/** Send a diagnosis to the sink. Never throws: a log that fails never changes the response. */
export function report(sink: DiagnosisSink, event: string, step: string, e: unknown): void {
  try {
    sink(diagnosis(event, step, e));
  } catch {
    // the response is the same with or without the log line
  }
}
