/**
 * Read sessions, and the streams that a session opens (authority note,
 * sections 3.9, 3.12 row W6, 5.3 and 5.5). A read session is a credential:
 * whoever holds the token reads. This file is everything that makes one,
 * checks one, and sends on a stream under one.
 *
 * **What a session binds.** The token is its claims and a MAC over them.
 * The claims are exactly these seven members:
 *
 * | Claim | Is | Checked by a reading scope against |
 * |---|---|---|
 * | `v` | 1 | The constant. |
 * | `deployment` | The deployment's name. | Its own configured name. |
 * | `membership` | The membership scope that issued it, with its incarnation. That is the repository. | The membership reference that the scope itself records. A membership scope: itself. |
 * | `member`, `key` | The member, and the device key that signed the request. | Nothing: they say whose session it is. |
 * | `reads` | The reads that the member's role had when the session was issued. | The name of the read that is asked. |
 * | `ends` | The end time, at most 600 seconds after membership's reading at issue. Membership's clock wrote it. | The reading scope's own clock, at every read and before every send on a stream. Those are two clocks (W6; assumption H6). |
 *
 * **How it is verified.** By HMAC-SHA-256 under the deployment's session
 * secret, over a domain tag and the exact claim bytes that were presented.
 * The MAC is compared in constant time, before the claims are parsed. A
 * scope checks a session with no call to membership. So a scope with the
 * secret can also make a session: the secret is one boundary of trust for
 * every repository of the deployment (section 5.5).
 *
 * **The order of a scope's check**, in `sessionReaders`:
 *
 * 1. Nothing that has the form of a session is presented: `forbidden`.
 * 2. The scope has no usable secret or no deployment name:
 *    `sessions-unavailable`. Nothing is checked and nothing is read.
 * 3. The MAC, then the form of the claims: `forbidden`.
 * 4. The deployment, then the membership reference: `forbidden`. A token
 *    for one repository is refused by every scope of another, and by a
 *    scope that records no membership reference.
 * 5. The scope's clock reads earlier than its previous entry's time:
 *    `clock-behind`. Only an authentic session of this repository learns it.
 * 6. The reading is at or past `ends`: `forbidden`. A time at the bound is
 *    past it (section 12, G14).
 * 7. The read is not one of `reads`: `forbidden`.
 *
 * **After a revocation.** A reading scope checks nothing of the key or the
 * member. A session that was issued is accepted until `ends`: at most 600
 * seconds on membership's clock, plus the difference between the reading
 * scope's clock and membership's. Membership issues no new session to a key
 * that is not active or to a member that is removed. So a revoked device
 * stops reading within that window, and not before. What changes a role
 * takes effect in a session the same way: at the next session. Replacing
 * the secret ends every session at once.
 *
 * **A reader with no session** gets `forbidden` from every read, and no
 * stream.
 *
 * **What a session cannot do.** It signs nothing, controls nothing and gets
 * no credential. Nothing here takes a session as authority for an act.
 *
 * Nothing here logs, stores or returns the secret, and no refusal holds a
 * token or a part of one.
 */

import { SESSION_DOMAINS } from "@generalbusiness/artroom-contract";
import type { Head, ScopeRef, SessionAnswer, SessionClaims, SessionRefusal, SignedSessionRequest } from "@generalbusiness/artroom-contract";
import { hex } from "@generalbusiness/artroom-bytes";
import { b64url, canonicalBytes, canonicalize, hmacSha256, isKeyId, isMemberId, isSignature, parseStrict, taggedBytes, unb64url, utf8, verifySessionRequest } from "@generalbusiness/artroom-bytes";
import { isObject, isScopeRef, timeMs, timeOf, type ScopeState, type StateView } from "@generalbusiness/artroom-derive";
import { MEMBERSHIP, standingOf } from "@generalbusiness/artroom-platform";
import type { Clock, ReadName, Readers } from "./ports.ts";

// ---------------------------------------------------------------- the secret

/** The least a session secret may be: 32 bytes (section 5.5). The check shows length, not randomness. */
export const SECRET_BYTES = 32;
/** The most seconds from membership's reading at issue to a session's end (section 3.9; W6). */
export const SESSION_SECONDS = 600;
/** The most seconds ahead that a session request's `notAfter` may be: the bound of a signed request (section 3.12, W8). */
export const REQUEST_SECONDS = 900;
/** The most streams one scope's object holds open. Configuration: no text states a number (I3 deltas, entry ES8). */
export const STREAMS = 64;

/** What a deployment gives its scopes to check sessions with. The secret's bytes stay in this value and are given to the MAC only. */
export interface Sessions { readonly secret: Uint8Array; readonly deployment: string }

/**
 * The session configuration from the two bindings of a deployment: the
 * secret as text, whose UTF-8 bytes are the key, and the deployment's name.
 * Null: one is absent, the secret is shorter than 32 bytes, or the name is
 * empty or longer than 128 bytes. Then no session is issued and none is
 * accepted (section 5.5).
 */
export function sessionsOf(secret: unknown, deployment: unknown): Sessions | null {
  if (typeof secret !== "string" || typeof deployment !== "string") return null;
  const key = utf8(secret);
  if (key.length < SECRET_BYTES || deployment.length === 0 || utf8(deployment).length > 128) return null;
  return { secret: key, deployment };
}

// ---------------------------------------------------------------- the token

/** The reads of the contract's section 9.1, which every session is given. */
const MEMBER_READS: readonly ReadName[] = ["summary", "items", "history", "entry", "outbox", "operations", "log", "retained"];
/** The reads of the repository's admin page (section 12, G13 and G17). */
const ADMIN_READS: readonly ReadName[] = ["incidents", "waiting"];
const READ_NAMES: ReadonlySet<string> = new Set<string>([...MEMBER_READS, ...ADMIN_READS]);

/** How a token begins. A value in a URL that begins so is a credential in a URL. */
const TOKEN_PREFIX = "ars1";
/** The most characters of a token that are looked at. A longer value is no token. */
const TOKEN_CHARS = 4096;
/** A token: the prefix, the claim bytes and the 32 bytes of the MAC, each in unpadded base64url. */
const TOKEN = /^ars1\.[A-Za-z0-9_-]{1,3900}\.[A-Za-z0-9_-]{43}$/;
/** How a reader presents a token: the `Authorization` header's value, set from memory (section 5.3). */
const SCHEME = "Session ";

/** Equal bytes, in time that depends on the lengths only. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) differ |= a[i]! ^ b[i]!;
  return differ === 0;
}

const only = (v: Record<string, unknown>, ...members: string[]): boolean => Object.keys(v).length === members.length && members.every((m) => Object.hasOwn(v, m));

function isClaims(v: unknown): v is SessionClaims {
  return isObject(v) && only(v, "v", "deployment", "membership", "member", "key", "reads", "ends") && v["v"] === 1 && typeof v["deployment"] === "string"
    && isScopeRef(v["membership"]) && v["membership"].kind === "membership" && isMemberId(v["member"]) && isKeyId(v["key"])
    && Array.isArray(v["reads"]) && v["reads"].length <= READ_NAMES.size && v["reads"].every((read) => typeof read === "string" && READ_NAMES.has(read))
    && timeMs(v["ends"]) !== null;
}

/** The token of these claims, under that secret. */
export function mintSession(sessions: Sessions, claims: SessionClaims): string {
  const bytes = canonicalBytes(claims);
  return `${TOKEN_PREFIX}.${b64url(bytes)}.${b64url(hmacSha256(sessions.secret, taggedBytes(SESSION_DOMAINS.token, bytes)))}`;
}

/**
 * The claims of an authentic token, or null. The MAC is checked first, over
 * the claim bytes as they were presented, and in constant time. Only then
 * are the bytes parsed, and they must be the canonical bytes of claims of
 * exactly the form above. It says nothing about why a token is refused.
 */
export function openSession(sessions: Sessions, token: unknown): SessionClaims | null {
  if (typeof token !== "string" || token.length > TOKEN_CHARS || !TOKEN.test(token)) return null;
  const [, body, mac] = token.split(".") as [string, string, string];
  const [bytes, given] = [unb64url(body), unb64url(mac)];
  if (!bytes || !given || !sameBytes(given, hmacSha256(sessions.secret, taggedBytes(SESSION_DOMAINS.token, bytes)))) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    const claims: unknown = parseStrict(text);
    return isClaims(claims) && canonicalize(claims) === text ? claims : null;
  } catch {
    return null;
  }
}

/** What a reader presents for a token: the value of the `Authorization` header. */
export const readerOf = (token: string): string => `${SCHEME}${token}`;
/** The token that a reader presents, or null: it presents nothing of a session's form. */
const presented = (reader: unknown): string | null => (typeof reader === "string" && reader.startsWith(SCHEME) ? reader.slice(SCHEME.length) : null);

/**
 * Whether a URL carries a credential in its path or its query (section 5.3,
 * "No credential in a process argument or in a URL"): a value of a token's
 * form, or a query parameter with the name of a credential. Such a request
 * is refused `credential-in-url`, and the credential is not used. An
 * invitation's secret has no form to know it by; the routes read one from
 * a request's body only, so one in a URL is never used.
 */
export function credentialInUrl(url: URL): boolean {
  const named = new Set(["session", "token", "secret", "authorization", "access_token"]);
  const tokenLike = (value: string): boolean => value.includes(`${TOKEN_PREFIX}.`);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  if (tokenLike(path)) return true;
  for (const [name, value] of url.searchParams) if (named.has(name.toLowerCase()) || tokenLike(value)) return true;
  return false;
}

// ---------------------------------------------------------------- a scope's check

/** What a scope's check of a session is given. Each is read at every check. */
export interface SessionReading {
  /** The deployment's session configuration. Null: this scope accepts no session. */
  sessions(): Sessions | null;
  /** The scope's own clock (the contract's section 5.3). */
  clock: Clock;
  /** The scope's record: its reference, and the time of its previous entry. Null: it has no genesis. */
  scope(): ScopeState | null;
  /** The membership scope that this scope records, with its incarnation (authority note, section 3.3). Null: it records none. A membership scope is not asked. */
  membership(scope: ScopeRef): ScopeRef | null;
}

/**
 * One check of what a reader presents, in the order at the head of this
 * file. `claims`: the session is authentic, of this repository, and has not
 * ended on this scope's clock at this reading.
 */
export function checkSession(config: SessionReading, reader: unknown): { claims: SessionClaims } | { refused: false | "sessions-unavailable" | "clock-behind" } {
  const token = presented(reader);
  if (token === null) return { refused: false };
  const sessions = config.sessions();
  if (!sessions) return { refused: "sessions-unavailable" };
  const claims = openSession(sessions, token);
  if (!claims || claims.deployment !== sessions.deployment) return { refused: false };
  const scope = config.scope();
  const own = !scope ? null : scope.at.kind === "membership" ? scope.at : config.membership(scope.at);
  // A scope accepts a session only when the membership reference in the token is the scope's own: the scope ID and the incarnation.
  if (!scope || !own || own.scope !== claims.membership.scope || own.inc !== claims.membership.inc || own.kind !== claims.membership.kind) return { refused: false };
  const [reading, previous, ends] = [timeMs(config.clock.read()), timeMs(scope.time), timeMs(claims.ends)];
  // A clock that is behind judges no end time: the read is answered `clock-behind`, and no stream byte is sent (section 3.12, W6).
  if (reading === null || previous === null || reading < previous) return { refused: "clock-behind" };
  if (ends === null || reading >= ends) return { refused: false };
  return { claims };
}

/**
 * The readers port over read sessions: the production port of a scope of a
 * repository. With no session configuration every presented session is
 * answered `sessions-unavailable`, and a reader that presents none is
 * answered `forbidden`. So a deployment with no secret bound serves no
 * read.
 */
export function sessionReaders(config: SessionReading): Readers {
  return {
    allows(reader, read) {
      const checked = checkSession(config, reader);
      return "claims" in checked ? checked.claims.reads.includes(read) : checked.refused;
    },
  };
}

// ---------------------------------------------------------------- membership issues a session

/** The form of a signed session request (the contract package's `session.ts`): exactly its members, each of its type. */
function isSessionRequest(v: unknown): v is SignedSessionRequest {
  if (!isObject(v) || !only(v, "request", "sig") || !isSignature(v["sig"])) return false;
  const r = v["request"];
  return isObject(r) && only(r, "v", "to", "actor", "action", "operation", "notAfter") && r["v"] === 1 && isScopeRef(r["to"]) && isKeyId(r["actor"]) && r["action"] === "read-session"
    && typeof r["operation"] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(r["operation"]) && timeMs(r["notAfter"]) !== null;
}

/** What a session reads, by the actions that the member's role holds at membership's head (I3 deltas, entry ES4). */
export function readsOf(actions: readonly string[]): readonly ReadName[] {
  // Section 12, G13: the admin page is shown to a member whose role holds `membership.*`, which is each action of that prefix (section 3.2).
  const admin = actions.includes("membership.invite") && actions.includes("membership.manage");
  return admin ? [...MEMBER_READS, ...ADMIN_READS] : MEMBER_READS;
}

/**
 * Membership's answer to a request for a read session (sections 3.9 and
 * 12.1.3, "Two things that are answers and no entries"). It writes nothing.
 * It answers from the scope's folded state at its head, as an observation
 * read does, and from its own clock.
 *
 * The order: the secret; the form and the signature, which need no state;
 * that this scope is an active membership scope under a version this
 * runtime runs, and is the scope that the request names; the clock; the
 * request's `notAfter`; the standing of the signing key. The end time is
 * membership's reading plus 600 seconds.
 *
 * A request is not single use: no adopted text gives membership a record
 * of the requests it has answered. The same signed bytes are answered
 * again until `notAfter`, each time with a session that ends 600 seconds
 * after that answer (I3 deltas, entry ES2). So a signed request is to be
 * kept as a credential is, in a request body and never in a URL.
 */
export function issueSession(
  config: { sessions: Sessions | null; clock: Clock }, state: Pick<StateView, "scope" | "page" | "item">, pinned: { named: unknown } | null, asked: unknown,
): SessionAnswer {
  const no = (reason: SessionRefusal): SessionAnswer => ({ ok: false, reason });
  if (!config.sessions) return no("sessions-unavailable");
  if (!isSessionRequest(asked) || !verifySessionRequest(asked)) return no("bad-request");
  const { to, actor, notAfter } = asked.request;
  const scope = state.scope();
  // A provisional membership answers no session (section 12.1.3).
  if (!scope || scope.status !== "active" || scope.at.kind !== "membership" || pinned?.named !== MEMBERSHIP) return no("not-found");
  if (to.scope !== scope.at.scope || to.inc !== scope.at.inc || to.kind !== scope.at.kind) return no("misaddressed");
  const [reading, previous, ends] = [timeMs(config.clock.read()), timeMs(scope.time), timeMs(notAfter)!];
  if (reading === null || previous === null || reading < previous) return no("clock-behind");
  if (reading >= ends) return no("expired");
  if (ends - reading > REQUEST_SECONDS * 1000) return no("bad-request");
  const standing = standingOf(state, { of: scope.at, key: actor });
  // A revoked key, a key that membership does not hold, a removed member, and an agent whose controller is not active: none is issued a session.
  if (!standing || !("key" in standing) || standing.keyState !== "active" || standing.memberState !== "active" || standing.controllerActive === false) return no("unauthorized");
  const session: SessionClaims = {
    v: 1, deployment: config.sessions.deployment, membership: scope.at, member: standing.member, key: actor, reads: readsOf(standing.actions), ends: timeOf(reading + SESSION_SECONDS * 1000),
  };
  return { ok: true, token: mintSession(config.sessions, session), session };
}

// ---------------------------------------------------------------- streams

/**
 * The streams of one scope's object (section 3.9; the proof plan's key O12,
 * table "Streams and waits"). A stream is opened by a read session that may
 * read the summary. It sends the scope's head, as one line of JSON: once
 * when it opens, and after each commit. It sends nothing that a summary
 * read does not answer in `at`. No adopted text states what a public
 * stream sends or how it is framed (I3 deltas, entry ES7).
 *
 * - **Before every send** the session is checked again, whole, on the
 *   scope's own clock. A session that has ended, or that the scope no
 *   longer accepts, closes the stream, and no byte is sent on that reading.
 *   A clock that is behind closes it too, with no byte. There is no timer:
 *   the comparison is made at each send (W6). So a stream whose session has
 *   ended sends nothing more, and is closed when the next send is due.
 * - **A reader that went away.** When the reader cancels the stream, or the
 *   transport drops it, the subscription is released at once: it does not
 *   wait for the next commit or for the session's end. The reader's pending
 *   read completes. Nothing here opens a stream again. The release is a
 *   call, `release`, with the stream's own ID: a stream's body crosses from
 *   the scope's object to the Worker's route, and in workerd a cancel of
 *   that body is not passed back to the object (observed in this package's
 *   tests; I3 deltas, entry ES7). So the route owns the reader's side: its
 *   body's cancel makes the call (`relay`, below).
 * - **A release that never comes**, as when the route's own run is cut
 *   short, leaves the subscription until its session's check fails: at the
 *   next send after the session's end, or when another stream is opened.
 *   It is sent at most one line that nobody reads.
 * - **Released once.** Each way a stream ends goes through one release,
 *   which counts a subscription once.
 * - **A restart** closes every stream: all of this is in memory. A token is
 *   unchanged by it, and is checked again at the next read.
 * - **Bounded.** A scope holds at most `max` streams, and a further one is
 *   answered `unavailable`. A reader that does not read is not sent a queue
 *   of heads: while one line waits unread, a later head replaces nothing and
 *   is sent when the reader reads next.
 */
export class Streams {
  readonly #readers: Readers;
  readonly #head: () => Head | null;
  readonly #max: number;
  readonly #open = new Map<string, Subscription>();
  #released = 0;

  constructor(readers: Readers, head: () => Head | null, max: number = STREAMS) {
    this.#readers = readers;
    this.#head = head;
    this.#max = max;
  }

  /** The streams open now, and the subscriptions released so far in this run. */
  counts(): { open: number; released: number } { return { open: this.#open.size, released: this.#released }; }

  /** Open a stream for that reader, or the refusal of its session. `id` names the stream for its release, and for nothing else. */
  open(reader: unknown): Opened | StreamRefusal {
    const allowed = this.#readers.allows(reader, "summary");
    if (allowed !== true) return { ok: false, reason: allowed === false ? "forbidden" : allowed };
    // A stream whose session this scope no longer accepts is closed now, so one that was never released does not hold a place.
    for (const held of [...this.#open.values()]) if (this.#readers.allows(held.reader, "summary") !== true) this.#close(held);
    if (this.#open.size >= this.#max) return { ok: false, reason: "unavailable" };
    const id = hex(crypto.getRandomValues(new Uint8Array(16)));
    const subscription: Subscription = { id, reader, controller: null, released: false, last: null };
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => { subscription.controller = controller; },
      // The reader reads: a head that it has not been sent is sent now, after the session is checked again.
      pull: () => this.#send(subscription),
      // The reader went away. The subscription is released now, and nothing is sent to it again.
      cancel: () => this.#release(subscription),
    }, { highWaterMark: 1 });
    this.#open.set(id, subscription);
    return { id, body: stream };
  }

  /** The reader of that stream went away: its subscription is released now, once. An ID that names no open stream releases nothing. */
  release(id: unknown): void {
    const subscription = typeof id === "string" ? this.#open.get(id) : undefined;
    if (subscription) this.#close(subscription);
  }

  /** After a commit: each open stream is sent the new head, or is closed by its session's check. */
  publish(): void {
    for (const subscription of [...this.#open.values()]) this.#send(subscription);
  }

  #send(subscription: Subscription): void {
    const { controller } = subscription;
    const head = this.#head();
    const now = head ? `${head.seq}:${head.hash}` : null;
    // Nothing that this reader has not been sent: nothing is due, and nothing is checked.
    if (subscription.released || !controller || !head || now === subscription.last) return;
    // The whole check, on this scope's clock, before every send (section 3.9, "Whose clock").
    if (this.#readers.allows(subscription.reader, "summary") !== true) return this.#close(subscription);
    // One line waits unread: nothing is queued behind it. The latest head is sent when the reader reads next.
    if ((controller.desiredSize ?? 0) <= 0) return;
    subscription.last = now;
    controller.enqueue(utf8(`${JSON.stringify({ at: head })}\n`));
  }

  /** The service ends a stream: the reader's pending read completes, and the subscription is released. */
  #close(subscription: Subscription): void {
    if (subscription.released) return;
    this.#release(subscription);
    try {
      subscription.controller?.close();
    } catch { /* the reader had gone */ }
  }

  #release(subscription: Subscription): void {
    if (subscription.released) return;
    subscription.released = true;
    this.#open.delete(subscription.id);
    this.#released++;
  }
}

/** A stream that was opened: its ID, for its release, and its body. */
export interface Opened { id: string; body: ReadableStream<Uint8Array> }
/** Why no stream is opened: the session's refusal, or `unavailable` when the scope holds as many streams as it may. */
export interface StreamRefusal { ok: false; reason: "forbidden" | "sessions-unavailable" | "clock-behind" | "unavailable" }

/**
 * The reader's side of a stream, in the Worker's route: a body that passes
 * on each line of the scope's stream, and that owns the subscription. When
 * its reader cancels it, or the scope's stream ends or fails, it calls
 * `release` once. The pending read of its reader then completes, and
 * nothing here opens the stream again.
 */
export function relay(opened: Opened, release: () => unknown): ReadableStream<Uint8Array> {
  const from = opened.body.getReader();
  let released = false;
  const once = async (): Promise<void> => {
    if (released) return;
    released = true;
    try {
      await release();
    } catch { /* the scope's object had gone, and its streams with it */ }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await from.read();
        if (!done) return controller.enqueue(value);
      } catch { /* the scope's stream failed, as at a restart: the reader is told that it ended */ }
      await once();
      controller.close();
    },
    async cancel() {
      await once();
      await from.cancel().catch(() => undefined);
    },
  }, { highWaterMark: 0 });
}

/** One open stream. `last`: the head that its reader was sent last, or null. */
interface Subscription { id: string; reader: unknown; controller: ReadableStreamDefaultController<Uint8Array> | null; released: boolean; last: string | null }
