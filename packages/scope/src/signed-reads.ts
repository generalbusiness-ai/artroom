/**
 * Signed reads: the second way a reader may read a scope, beside a read
 * session (the planner's decisions 61cc5e50, c6499e91 and 70a0680e). It is
 * for a key that has no session yet: the operator key that signed
 * `install` reads the register, and the key that signed a claim's `found`
 * reads the register's summary, then the directory that the claim caused
 * and the membership, rules scope and destination that the directory's
 * genesis caused, from which it learns membership's ID and asks there for
 * a session.
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
 *    window of the reading, and it did not sign the root of this scope's
 *    cause chain within that window of the reading.
 *
 * **Who signed an entry.** The actor of the signed intent of an `act` or
 * a `preparation`, and, for a genesis that took effect with a founding
 * intent, as a register's does, the actor of that intent. No other entry
 * has a signer.
 *
 * **The cause chain** (decision 70a0680e), in `rootOf`. A child's genesis
 * names its creator's entry as its source and retains it, and its seed's
 * cause names what asked for it (scope contract, section 7.2). The chain
 * is followed from the genesis of the scope that is read, one cause at a
 * time:
 *
 * - the cause is an act's intent: the source entry, or, when the source is
 *   an outcome, the act that opened its operation, which the genesis
 *   retains (a directory's genesis retains the claim's entry). That act is
 *   the root, and its actor and time are the root's;
 * - the cause is the source's own seed: the source is its creator's
 *   genesis, and the chain goes on from there (membership, the rules scope
 *   and the destination are caused by the directory's genesis);
 * - a genesis with a founding intent is a root, with its actor;
 * - any other cause, as a delivery's, ends the chain with no root.
 *
 * Each cause followed is one step, and at most `CHAIN_STEPS` are followed:
 * a chain that needs more has no root. Each entry of the chain is read
 * from this scope's retained entries, or else from its own scope through
 * the resolver port, and is the entry that the fact names, by its hash.
 * The root is fixed by the history, so a scope finds it once when a valid
 * read needs the chain, and keeps it. Request checks and local signer
 * eligibility precede any resolver work. The window is measured at the root entry's
 * time: the key reads the chain's scopes only while its own entry there
 * is within the window of the reading.
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

import type { Entry, FactUse, KeyId, SignedRead, SignedReadName, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, isKeyId, isScopeId, isSignature, parseStrict, seedDigest, unb64url, verifySignedRead } from "@generalbusiness/artroom-bytes";
import { isObject, same, timeMs, type ScopeState } from "@generalbusiness/artroom-derive";
import type { Clock, ReadName } from "./ports.ts";
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

/** The signed entry at the root of a genesis's cause chain: its signer and its time. */
export interface Root { actor: KeyId; time: Timestamp }

/** What a scope's check of a signed read is given. Each is read at every check. */
export interface SignedReading {
  /** The scope's own clock. */
  clock: Clock;
  /** The authority window of an intent, in seconds: the scope's `intentLifetimeSeconds`. */
  window: number;
  /** The root of this scope's cause chain, as the scope found it before the read. Absent or null: none is known. */
  root?: () => Root | null;
}

/** The most causes that a cause chain is followed through (decision 70a0680e). */
export const CHAIN_STEPS = 4;

/** The key that signed an entry, or null: it has no signer (see the head of this file). */
export function signerOf(entry: Entry): KeyId | null {
  const input = entry.input;
  if (input.type === "act" || input.type === "preparation") return input.signed.intent.actor;
  return input.type === "genesis" && input.decision === "applied" && input.founding ? input.founding.intent.actor : null;
}

/**
 * The root of a genesis's cause chain (see the head of this file), or null:
 * it has none within `steps` causes. `read` gives an entry that a genesis
 * names by a fact, or null when it cannot be read now; then the answer is
 * `unavailable`, and may be another later. Each `read` is of an entry that
 * a genesis of the chain retains.
 */
export async function rootOf(genesis: Entry, read: (use: FactUse) => Promise<Entry | null>, steps = CHAIN_STEPS): Promise<Root | null | "unavailable"> {
  let entry = genesis;
  for (let step = 0; ; step++) {
    const input = entry.input;
    if (input.type !== "genesis" || input.decision !== "applied") return null;
    if (input.founding) return { actor: input.founding.intent.actor, time: entry.time };
    if (step === steps) return null;
    const use = input.source ? entry.uses.find((u) => same(u.fact, input.source)) : undefined;
    if (!use) return null;
    const source = await read(use);
    if (!source) return "unavailable";
    if (source.input.type === "genesis") {
      if (seedDigest(source.input.seed) !== input.seed.cause) return null;
      entry = source;
      continue;
    }
    // The cause is an act's intent: the source itself, or the act that opened the source outcome's operation, which the genesis retains.
    for (const u of entry.uses) {
      const used = u === use ? source : await read(u);
      if (!used) return "unavailable";
      if (used.input.type === "act" && intentDigest(used.input.signed.intent) === input.seed.cause) return { actor: used.input.signed.intent.actor, time: used.time };
    }
    return null;
  }
}

/**
 * One check of a signed read, in the order at the head of this file.
 * `key`: the read may be made, by that key. `read` and `arg` are the read
 * that is asked and its argument, as the request must name them.
 */
/**
 * Request checks and local signer eligibility, without resolving a cause.
 * `root`: only a valid request whose key has no recent local entry needs
 * the chain. Its original eligibility threshold is used by the full check.
 */
export function checkLocalSignedRead(config: SignedReading, store: Pick<Store, "scope" | "stored">, reader: string, read: ReadName, arg: string): { key: KeyId } | { refused: false | "clock-behind" } | { root: { actor: KeyId; since: number } } {
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
    if (signerOf(entry) === actor) return { key: actor };
  }
  return { root: { actor, since: reading - window } };
}

/** The full check, using a resolved root only when local eligibility needs it. */
export function checkSignedRead(config: SignedReading, store: Pick<Store, "scope" | "stored">, reader: string, read: ReadName, arg: string): { key: KeyId } | { refused: false | "clock-behind" } {
  const checked = checkLocalSignedRead(config, store, reader, read, arg);
  if (!("root" in checked)) return checked;
  // The root of the cause chain, measured at its own time.
  const root = config.root?.() ?? null;
  return root && root.actor === checked.root.actor && (timeMs(root.time) ?? -Infinity) >= checked.root.since ? { key: checked.root.actor } : { refused: false };
}
