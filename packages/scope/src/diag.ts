/**
 * Diagnoses, and the redactor (authority note, section 5.3; proof plan, key
 * O3, "Safe sinks at the boundary"; I3 plan, step 20). It is the reviewed
 * successor of the earlier Room's diagnoses
 * (`notes/2026-10-05-i3-host-review.md`, section 4).
 *
 * A diagnosis is one line in the runtime's log for a failure at a port that
 * no entry and no answer describes, such as an outside call that threw. It
 * is what an operator has of that failure.
 *
 * **What a diagnosis holds, and what it never holds.** Three texts: the
 * event and the step, which are fixed words of this runtime's own source,
 * and the error's name when it is one of a fixed list. It never holds an
 * error's message, a stack, a cause or any other member of a thrown value.
 * A provider's text may hold a token, a key or a secret in a form that no
 * pattern knows, so no pattern is trusted to clean it: it is not read.
 *
 * **The redactor** is the second guard, and not the first. Each text of a
 * diagnosis passes through it, so that a caller who builds an event or a
 * step from a value does not publish a credential by that mistake. It
 * replaces what has the syntax of a credential, and cuts the result to a
 * stated length. It is incomplete by its nature: a credential in a form it
 * does not know passes. So no caller gives it a provider's text and
 * publishes the result.
 *
 * **Lengths.** Every length here is in UTF-16 code units, which is what
 * `String.prototype.length` counts. A cut never splits a surrogate pair.
 */

/** One line of the log. Each member is at most `MAX_FIELD` code units. */
export interface Diagnosis {
  /** What failed, such as `outside-call-failed`. A fixed word. */
  readonly event: string;
  /** Where, such as `hold@1:mint`. Fixed words of the source. */
  readonly step: string;
  /** The error's name when `SAFE_NAMES` has it, else `Error` for any other error, else the type of the thrown value. */
  readonly name: string;
}

/** Where diagnoses go. The runtime's log in production. A test captures them. */
export type DiagnosisSink = (d: Diagnosis) => void;

/** The most code units of a redacted text. */
export const MAX_TEXT = 300;
/** The most code units of one member of a diagnosis. */
export const MAX_FIELD = 100;
/** Text read before redaction. A longer text is cut at a space first, so no part of a token is left at the cut. */
const MAX_INPUT = 4096;

/** The names of the language's own errors, and the two that a runtime gives a cancelled or late call. Any other name is the thrower's text, and is not kept. */
export const SAFE_NAMES: ReadonlySet<string> = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "AggregateError", "AbortError", "TimeoutError"]);

export const toConsole: DiagnosisSink = (d) => console.error(JSON.stringify(d));

/** `text`, at most `max` code units, ended by an ellipsis when it was cut. The cut is never inside a surrogate pair. */
function bounded(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

// ---------------------------------------------------------------- what has the syntax of a credential

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
/**
 * `name=value`, `name: value` or `"name": value`, where the name says it is
 * a credential. The word may stand anywhere in the name, so `token2`,
 * `api_key_1` and `X-Hub-Signature-256` are names too.
 */
const PAIR = new RegExp(String.raw`\b([A-Za-z0-9_.-]*(?:token|secret|password|passwd|passphrase|pwd|auth|key|signature|sig|credential)[A-Za-z0-9_.-]*)(${SEP})(?:${VALUE})`, "gi");
/** The userinfo of a URL: everything from the scheme to the last `@` before the path. A password may itself hold an `@`. */
const USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi;

/**
 * Credentials known by a prefix or a delimiter, redacted at any length, so a
 * cut or malformed one goes too: GitHub, Slack and Stripe tokens, AWS access
 * key IDs and Google API keys by prefix, a JSON Web Token (`eyJ…` with a
 * dot), a Slack webhook's path, and a private key block to its END line or
 * the end of the text. No rule here knows the token format of the Git host
 * that a deployment uses: the installation design names the host (plan
 * question Q6).
 */
const PREFIXED: readonly RegExp[] = [
  /\b(?:gh[pousr]_|github_pat_|xox[abposr]-|[sr]k_(?:live|test)_|(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)(?=[0-9A-Z])|AIza)[A-Za-z0-9_-]*/g,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_.-]*/g,
  /https:\/\/hooks\.slack\.com\/services\/\S*/g,
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|$)/g,
];

/** A marker that a rule above has already put in place of a credential. */
const MARKER = /<(?:credentials|query|redacted|secret)>/;
/** Long runs of base64, base64url or hex characters. */
const RUN = /[A-Za-z0-9+/=_-]{32,}/g;
/** Public identifiers of this model, which are not secrets: a key ID, a scope ID, an incarnation, and an object ID or a digest's hex. */
const PUBLIC_ID = /^(?:key_[A-Za-z0-9_-]{43}|sc_[a-z2-7]{52}|in_[a-z2-7]{26}|[0-9a-f]{40}|[0-9a-f]{64})$/;

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** True for a long run that looks random: three classes of character and more than 4.2 bits a character. A threshold of the earlier secret scan, and no proof. */
function looksRandom(run: string): boolean {
  if (run.length < 32 || PUBLIC_ID.test(run)) return false;
  // A path is not a token.
  if (run.includes("/") && run.split("/").every((part) => part.length < 32)) return false;
  return [/[a-z]/, /[A-Z]/, /[0-9]/].filter((re) => re.test(run)).length >= 3 && entropy(run) > 4.2;
}

/**
 * The text with what has the syntax of a credential replaced, at most
 * `MAX_TEXT` code units: URL userinfo and query strings, Authorization and
 * Cookie headers, authentication schemes, pairs whose name says token,
 * secret, password, auth, key, signature or credential, the `PREFIXED`
 * formats, and long runs that look random. It is the second guard of a
 * diagnosis, and it is not complete: see the head of this file.
 */
export function redact(text: string): string {
  let s = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT).replace(/\S*$/, "") : text;
  s = s
    .replace(USERINFO, "$1<credentials>@")
    .replace(/\?[^\s"'<>#]+/g, "?<query>")
    .replace(HEADER, "$1$2<redacted>")
    .replace(SCHEME, "$1 <redacted>")
    .replace(PAIR, "$1$2<redacted>");
  for (const re of PREFIXED) s = s.replace(re, "<secret>");
  s = s.replace(RUN, (m) => (!MARKER.test(m) && looksRandom(m.replace(/^[+/=_-]+|[+/=_-]+$/g, "")) ? "<secret>" : m));
  return bounded(s, MAX_TEXT);
}

/**
 * The diagnosis of a thrown value. Only its name is read, and only a name of
 * `SAFE_NAMES` is kept. Nothing else of the value is read: not its message,
 * and not its text as a string. A value whose name cannot be read is named
 * by its type.
 */
export function diagnosis(event: string, step: string, thrown: unknown): Diagnosis {
  let name: string = thrown === null ? "null" : typeof thrown;
  try {
    if (thrown instanceof Error) name = SAFE_NAMES.has(thrown.name) ? thrown.name : "Error";
  } catch {
    name = "object";
  }
  const word = (text: string) => bounded(redact(String(text)), MAX_FIELD);
  return { event: word(event), step: word(step), name };
}

/** Send a diagnosis to the sink. It never throws: a log that fails changes nothing that the runtime does. */
export function report(sink: DiagnosisSink, event: string, step: string, thrown: unknown): void {
  try {
    sink(diagnosis(event, step, thrown));
  } catch {
    // the runtime does the same with or without the log line
  }
}
