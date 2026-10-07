/**
 * Signed reads, as a device makes them (the planner's decisions 61cc5e50,
 * c6499e91 and 70a0680e; the scope package's `signed-reads.ts`). A device
 * with no read session yet reads a scope where its key signed an entry, or
 * the root of the scope's cause chain, within the authority window of an
 * intent: the scope's summary, its genesis and the entries that key
 * signed. So the operator key that signed `install` reads the register,
 * and a founder's key that signed `found` reads the register's summary,
 * the directory that the claim caused, and membership, the rules scope and
 * the destination, which the directory caused; it learns membership's ID
 * from the directory, and asks there for a session once it holds a seat.
 *
 * - `signedReader` signs one read: the scope, the read's name, its
 *   argument and a `notAfter`, with the device's key, as an intent is
 *   signed. Its value is the `Authorization` header of that one read.
 * - `signedReads` is a transport that signs each of the four reads that a
 *   signed read may name, when the caller presents no reader. A caller
 *   that presents one, such as a session, is sent as before.
 * - `signedLogReader` gives the replay package's `httpSource` the header
 *   of each `log` read.
 *
 * A signed read is no session: each one is good for its one read, with
 * its one argument, until its `notAfter`.
 */

import { PROPOSED_BOUNDS, SESSION_DOMAINS } from "@generalbusiness/artroom-contract";
import type { ReadRequest, ScopeId, SignedRead, SignedReadName, Timestamp } from "@generalbusiness/artroom-contract";
import { b64url, canonicalBytes, parseStrictBytes, taggedBytes } from "@generalbusiness/artroom-bytes";
import type { Transport } from "./handle.ts";
import type { Signer } from "./intent.ts";

/** How long a signed read stays good when the caller names no lifetime: well inside the bound, so that two clocks may differ. */
export const READ_LIFETIME_SECONDS = 60;

/** Whole seconds, in the one form a timestamp has (section 5.3). */
const timestamp = (ms: number): Timestamp => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

export interface ReadSigning {
  /** The signing time, in milliseconds. The default is the runtime's clock. */
  now?: () => number;
  /** How long the read stays good, in seconds. The default is `READ_LIFETIME_SECONDS`. */
  lifetimeSeconds?: number;
  /** The scope's intent lifetime bound, which bounds a signed read too. The default is the contract's proposed bound. */
  maxLifetimeSeconds?: number;
}

/** The argument that a signed read names: `"summary"` for the summary; a page's cursor, `"0"` for the first; an entry's position. */
export function readArgument(read: SignedReadName, at?: string | number): string {
  if (read === "summary") return "summary";
  return at === undefined ? "0" : String(at);
}

/** The signed read of one read of one scope, by `signer`. */
export async function signedRead(signer: Signer, to: ScopeId, read: SignedReadName, arg: string, signing: ReadSigning = {}): Promise<SignedRead> {
  const bound = signing.maxLifetimeSeconds ?? PROPOSED_BOUNDS.intentLifetimeSeconds;
  const lifetime = signing.lifetimeSeconds ?? Math.min(READ_LIFETIME_SECONDS, bound);
  if (!(lifetime > 0 && lifetime <= bound)) throw new RangeError(`a signed read lives more than 0 and at most ${bound} seconds`);
  // A detached copy, read once as a canonical value, so that the bytes that are signed are the request that is returned.
  const request = parseStrictBytes(canonicalBytes({ v: 1, to, actor: signer.key, read, arg, notAfter: timestamp((signing.now ?? Date.now)() + lifetime * 1000) } satisfies ReadRequest)) as ReadRequest;
  return { request, sig: await signer.sign(taggedBytes(SESSION_DOMAINS.read, canonicalBytes(request))) };
}

/** The `Authorization` header of one signed read. */
export async function signedReader(signer: Signer, to: ScopeId, read: SignedReadName, arg: string, signing: ReadSigning = {}): Promise<string> {
  return `Signed ${b64url(canonicalBytes(await signedRead(signer, to, read, arg, signing)))}`;
}

/**
 * A transport whose `summary`, `history`, `entry` and `log` are signed
 * reads by `signer` when the caller presents no reader. A reader that is a
 * text, such as a session's, is sent as it is. Every other operation is
 * the transport's own.
 */
export function signedReads(transport: Transport, signer: Signer, signing: ReadSigning = {}): Transport {
  const as = async (reader: unknown, scope: string, read: SignedReadName, at?: string | number): Promise<unknown> =>
    (typeof reader === "string" ? reader : signedReader(signer, scope as ScopeId, read, readArgument(read, at), signing));
  return {
    // Delegate with the original receiver, including prototype methods and
    // methods that read class-private fields; object spread loses those.
    found: (...args) => transport.found(...args),
    submit: (...args) => transport.submit(...args),
    prepare: (...args) => transport.prepare(...args),
    settle: (...args) => transport.settle(...args),
    items: (...args) => transport.items(...args),
    outbox: (...args) => transport.outbox(...args),
    duty: (...args) => transport.duty(...args),
    retained: (...args) => transport.retained(...args),
    summary: async (scope, reader) => transport.summary(scope, await as(reader, scope, "summary")),
    history: async (scope, reader, cursor) => transport.history(scope, await as(reader, scope, "history", cursor), cursor),
    entry: async (scope, reader, seq) => transport.entry(scope, await as(reader, scope, "entry", seq), seq),
    log: async (scope, reader, cursor) => transport.log(scope, await as(reader, scope, "log", cursor), cursor),
  };
}

/** The reader of the replay package's `httpSource`: a signed read for each `log` page, and no header for a retained input, which a signed read does not reach. */
export function signedLogReader(signer: Signer, signing: ReadSigning = {}): (scope: ScopeId, read: "log" | "retained", arg: string) => Promise<string | undefined> {
  return async (scope, read, arg) => (read === "log" ? signedReader(signer, scope, "log", arg, signing) : undefined);
}
