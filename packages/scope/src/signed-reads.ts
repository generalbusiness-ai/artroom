/**
 * Signed reads: the second way a reader may read a scope, beside a read
 * session (the planner's decisions 61cc5e50 and c6499e91). It is for a key
 * that has no session yet: the operator key that signed `install` reads
 * the register, and the key that signed a claim's `found` reads the
 * register's summary and, once the directory exists, the directory's
 * genesis and summary, from which it learns membership's ID and asks there
 * for a session.
 *
 * **The request.** The forms are the contract package's `session.ts`:
 * `ReadRequest` and `SignedRead`. A reader presents one in the
 * `Authorization` header as `Signed ` and the unpadded base64url of the
 * canonical JSON of the signed read. It names the scope, the read and its
 * argument, and a `notAfter`, and is signed by the key it names, as an
 * intent is signed.
 *
 * **The order of a scope's check**, in `checkSignedRead`. Each refusal is
 * `forbidden`, but for a clock that is behind, and writes nothing:
 *
 * 1. The value is not of the form, or the signature is not the key's.
 * 2. The scope has no genesis, or the request names another scope.
 * 3. The request names another read, or another argument, than the one
 *    asked.
 * 4. The scope's clock reads earlier than its previous entry's time:
 *    `clock-behind`.
 * 5. The reading is at or past `notAfter`, or `notAfter` is further ahead
 *    than an intent may live (`intentLifetimeSeconds`): the authority
 *    window of an intent.
 * 6. The key signed no entry of this scope whose time is within that
 *    window of the reading.
 *
 * **Who signed an entry.** The actor of the signed intent of an `act` or
 * a `preparation`. For a genesis that took effect: the actor of the
 * founding intent it holds, as a register's does; or, for a child, the
 * actor of the intent whose digest is the seed's cause, in an entry that
 * the genesis retains, as a directory's genesis retains the claim's entry.
 * No other entry has a signer.
 *
 * **What it reads.** The summary; the genesis; and the entries that the
 * key signed: `entry` for one of them, and `history` and `log` pages that
 * hold only those and the genesis. A page's `next` and `complete` are
 * those of the page that was filtered, so a reader that follows `next`
 * meets each entry once. Every other read is `forbidden`, and so is a
 * stream: a stream is opened by a session only.
 *
 * A signed read is no credential beyond itself: whoever holds one can make
 * that one read, with that argument, until its `notAfter`, and nothing
 * else. It travels in a header, never in a URL.
 */

import type { Entry, KeyId, SignedRead, SignedReadName } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, isKeyId, isScopeId, isSignature, parseStrict, unb64url, verifySignedRead } from "@generalbusiness/artroom-bytes";
import { isObject, timeMs, type ScopeState } from "@generalbusiness/artroom-derive";
import type { Clock } from "./ports.ts";
import type { Store } from "./store.ts";

/** How a reader presents a signed read: the `Authorization` header's value. */
const SCHEME = "Signed ";
/** The most characters of a presented value that are looked at. */
const SIGNED_CHARS = 2048;
/** The reads that a signed read may name. */
export const SIGNED_READS: readonly SignedReadName[] = ["summary", "history", "entry", "log"];

const only = (v: Record<string, unknown>, ...members: string[]): boolean => Object.keys(v).length === members.length && members.every((m) => Object.hasOwn(v, m));

function isSignedRead(v: unknown): v is SignedRead {
  if (!isObject(v) || !only(v, "request", "sig") || !isSignature(v["sig"])) return false;
  const r = v["request"];
  return isObject(r) && only(r, "v", "to", "actor", "read", "arg", "notAfter") && r["v"] === 1 && isScopeId(r["to"]) && isKeyId(r["actor"])
    && typeof r["read"] === "string" && (SIGNED_READS as readonly string[]).includes(r["read"]) && typeof r["arg"] === "string" && r["arg"].length <= 64
    && timeMs(r["notAfter"]) !== null;
}

/** Whether a reader presents something of a signed read's form, whatever its content. Such a reader is judged here only. */
export const presentsSignedRead = (reader: unknown): boolean => typeof reader === "string" && reader.startsWith(SCHEME);

/** The signed read that a reader presents, or null: its value is not the canonical bytes of one, in base64url. */
function openSignedRead(reader: string): SignedRead | null {
  const value = reader.slice(SCHEME.length);
  if (value.length > SIGNED_CHARS) return null;
  const bytes = unb64url(value);
  if (!bytes) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    const signed: unknown = parseStrict(text);
    return isSignedRead(signed) && canonicalize(signed) === text ? signed : null;
  } catch {
    return null;
  }
}

/** What a scope's check of a signed read is given. Each is read at every check. */
export interface SignedReading {
  /** The scope's own clock. */
  clock: Clock;
  /** The authority window of an intent, in seconds: the scope's `intentLifetimeSeconds`. */
  window: number;
}

/** The key that signed an entry, or null: it has no signer (see the head of this file). `store` gives the entries a genesis retains. */
export function signerOf(entry: Entry, store: Pick<Store, "retained">): KeyId | null {
  const input = entry.input;
  if (input.type === "act" || input.type === "preparation") return input.signed.intent.actor;
  if (input.type !== "genesis" || input.decision !== "applied") return null;
  if (input.founding) return input.founding.intent.actor;
  for (const use of entry.uses) {
    const kept = store.retained("entry", use.content);
    if (!kept) continue;
    const used = JSON.parse(kept.bytes) as Entry;
    if (used.input.type === "act" && intentDigest(used.input.signed.intent) === input.seed.cause) return used.input.signed.intent.actor;
  }
  return null;
}

/**
 * One check of a signed read, in the order at the head of this file.
 * `key`: the read may be made, by that key. `read` and `arg` are the read
 * that is asked and its argument, as the request must name them.
 */
export function checkSignedRead(config: SignedReading, store: Pick<Store, "scope" | "stored" | "retained">, reader: string, read: SignedReadName, arg: string): { key: KeyId } | { refused: false | "clock-behind" } {
  const signed = openSignedRead(reader);
  if (!signed || !verifySignedRead(signed)) return { refused: false };
  const scope: ScopeState | null = store.scope();
  const { to, actor, notAfter } = signed.request;
  if (!scope || to !== scope.at.scope) return { refused: false };
  if (signed.request.read !== read || signed.request.arg !== arg) return { refused: false };
  const [reading, previous, ends] = [timeMs(config.clock.read()), timeMs(scope.time), timeMs(notAfter)!];
  if (reading === null || previous === null || reading < previous) return { refused: "clock-behind" };
  const window = config.window * 1000;
  if (reading >= ends || ends - reading > window) return { refused: false };
  // The entries within the window of the reading, from the head back. A key that signed one of them may read.
  for (let seq = scope.head.seq; seq >= 0; seq--) {
    const row = store.stored(seq);
    if (!row) break;
    const entry = JSON.parse(row.bytes) as Entry;
    if ((timeMs(entry.time) ?? -Infinity) < reading - window) break;
    if (signerOf(entry, store) === actor) return { key: actor };
  }
  return { refused: false };
}
