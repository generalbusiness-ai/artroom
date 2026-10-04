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

/** A marker one of the rules below has already put in place of a credential. */
const MARKER = /<(?:token|credentials|query|redacted|secret)>/;

/**
 * A value, whole, of any length: double- or single-quoted with backslash
 * escapes inside, a value that opens with a backslash-escaped quote (JSON
 * inside a string) to the end of the line, or a bare value up to the next
 * space. It fails closed: a quoted value with no closing quote, because it
 * is malformed or was cut by the input bound, runs to the end of the text.
 */
const VALUE = String.raw`"(?:[^"\\]|\\[\s\S])*(?:"|\\?$)|'(?:[^'\\]|\\[\s\S])*(?:'|\\?$)|\\["'][^\r\n]*|\S+`;
/** A separator after a name: `=`, `:` or JSON's `":`, with an escaped closing quote allowed. */
const SEP = String.raw`\\?["']?\s*[:=]\s*`;

/** Header names whose value is a credential: the value to the end of the line. */
const HEADER = new RegExp(String.raw`\b((?:proxy-)?authorization|(?:set-)?cookie)(${SEP})[^\r\n]*`, "gi");
/**
 * HTTP authentication schemes (the IANA registry, less `token`, which is
 * common in prose and is caught as a header or a pair). The credential is
 * redacted whatever its length: a parameter list (`name=…`) to the end of the
 * line, otherwise the next run of characters to a space.
 */
const SCHEME = /\b(bearer|basic|digest|dpop|gnap|hoba|mutual|negotiate|ntlm|oauth|privatetoken|concealed|vapid|scram-sha-1|scram-sha-256|aws4-hmac-sha256)\s+(?:[A-Za-z0-9_-]+=(?:"|[^\s=,;])[^\r\n]*|[^\s,;]+)/gi;
/** `name=value`, `name: value` or `"name": value`, where the name says it is a credential. */
const PAIR = new RegExp(String.raw`\b([A-Za-z_-]*(?:token|secret|password|passwd|passphrase|pwd|auth|key|signature|sig|credential)s?)(${SEP})(?:${VALUE})`, "gi");

/**
 * Credentials known by a prefix or a delimiter, redacted at any length, so a
 * cut or malformed one goes too: GitHub, Slack and Stripe tokens, AWS access
 * key IDs and Google API keys by prefix, a JSON Web Token (`eyJ…` with a
 * dot), a Slack webhook's path, and a private key block to its END line or
 * the end of the text. The secret scan's detectors for the same formats,
 * with their length minimums, run after as a fallback.
 */
const PREFIXED: readonly RegExp[] = [
  /\b(?:gh[pousr]_|github_pat_|xox[abposr]-|[sr]k_(?:live|test)_|(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)(?=[0-9A-Z])|AIza)[A-Za-z0-9_-]*/g,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_.-]*/g,
  /https:\/\/hooks\.slack\.com\/services\/\S*/g,
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/g,
];

/**
 * The text with anything that may be a credential replaced, at most
 * `MAX_MESSAGE` characters. Rules that know a credential by its syntax
 * redact it whatever its length or entropy: Artifacts tokens (`art_v<n>_…`,
 * with any `?expires=`), URL userinfo and query strings, Authorization and
 * Cookie headers, authentication schemes, pairs whose name says token,
 * secret, password, auth, key, signature or credential, and `PREFIXED`
 * formats. The secret scan's format detectors and its check for long random
 * tokens follow, as a fallback.
 */
export function redact(text: string): string {
  let s = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT).replace(/\S*$/, "") : text;
  s = s
    .replace(/art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g, "<token>")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]*@/gi, "$1<credentials>@")
    .replace(/\?[^\s"'<>#]+/g, "?<query>")
    .replace(HEADER, "$1$2<redacted>")
    .replace(SCHEME, "$1 <redacted>")
    .replace(PAIR, "$1$2<redacted>");
  for (const re of PREFIXED) s = s.replace(re, "<secret>");
  // A detector match that holds a marker is a credential already redacted above (`password: <redacted>`).
  for (const re of DETECT) s = s.replace(re, (m) => (MARKER.test(m) ? m : "<secret>"));
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
