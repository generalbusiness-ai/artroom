/**
 * A read session, as a device and a scope service exchange it (authority
 * note, section 3.9). A session is a credential for reads of one repository.
 * It signs nothing, controls nothing and gets no credential.
 *
 * The authority note states what a token names and that a device asks with
 * a signed request. It states no form for either. The forms here are I3's
 * source choices (I3 deltas, entries ES1 and ES2), and no adopted text has
 * them.
 */

import type { Base64Url, KeyId, MemberId, ScopeRef, Timestamp } from "./scope.ts";

/** The tags of the bytes that a session's MAC and a session request's signature are over. Neither is a tag of `DOMAINS`, so neither is ever the bytes of an intent. */
export const SESSION_DOMAINS = { token: "artroom-session-1", request: "artroom-session-request-1" } as const;

/**
 * A device's request for a read session. It follows the one form of a
 * signed direct request (authority note, section 4.2), less the members
 * that have no meaning here: `to` is the membership scope with its
 * incarnation, which is the repository's membership reference; `actor` is
 * the device key that signs; `operation` is an operation identity, a new
 * one for each request; and `notAfter` is at most 15 minutes ahead.
 * Exactly these members.
 */
export interface SessionRequest { v: 1; to: ScopeRef; actor: KeyId; action: "read-session"; operation: string; notAfter: Timestamp }
export interface SignedSessionRequest { request: SessionRequest; sig: Base64Url }

/**
 * What a session's token names (section 3.9): the deployment; the
 * membership scope and its incarnation; the member and the key; the reads
 * that the member's role may make in that repository's scopes; and the end
 * time, which membership's clock wrote. Exactly these members.
 */
export interface SessionClaims { v: 1; deployment: string; membership: ScopeRef; member: MemberId; key: KeyId; reads: readonly string[]; ends: Timestamp }

/**
 * Why no session is issued. `sessions-unavailable`: the scope has no usable
 * session secret, and nothing else was looked at (section 5.5).
 * `bad-request`: the size, the shape, the signature, or a `notAfter` further
 * ahead than a signed request may have. `not-found`: the scope is no active
 * membership scope. `misaddressed`: the request is to another scope or
 * incarnation. `clock-behind`: the scope's clock reads earlier than its
 * previous entry's time. `expired`: the reading is at or past `notAfter`.
 * `unauthorized`: the key is not an active key of an active member.
 */
export type SessionRefusal = "sessions-unavailable" | "bad-request" | "not-found" | "misaddressed" | "clock-behind" | "expired" | "unauthorized";

/** Membership's answer to a session request. It is an answer and no entry. `token` is the credential: it is kept in memory and presented in a header. */
export type SessionAnswer = { ok: true; token: string; session: SessionClaims } | { ok: false; reason: SessionRefusal };
