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
 * **The cause chain** (decision 70a0680e, extended from scopes to
 * entries), in `rootOf`. It is followed from an entry, one cause at a time,
 * until it reaches an entry that has a signer, which is its root:
 *
 * - a genesis of a child: it names its creator's entry as its source and
 *   retains it, and its seed's cause names what asked for it (scope
 *   contract, section 7.2). When the source is a genesis whose seed digest
 *   is the cause, the chain goes on from that genesis (membership, the
 *   rules scope and the destination are caused by the directory's
 *   genesis). Otherwise the cause is an act's intent: the source, or, when
 *   the source is an outcome, the act that opened its operation, which the
 *   genesis retains (a directory's genesis retains the claim's entry);
 * - an outcome: the entry of the same scope that opened its operation;
 * - a diagnosis: the entry of the same scope whose send it diagnoses;
 * - a delivery: the entry that made the send, which the delivery retains;
 * - any other entry, and an outcome or a diagnosis of another scope than
 *   the one read, ends the chain with no root.
 *
 * Each cause followed is one step, and at most `CHAIN_STEPS` are followed:
 * a chain that needs more has no root. Each entry of the chain is read
 * from this scope's own entries or its retained entries, or else from its
 * own scope through the resolver port, and is the entry that the fact
 * names, by its hash. The roots are fixed by the history, so a scope finds
 * each once (`Chains`), before a signed read, and keeps it. The window is
 * measured at the root entry's time.
 *
 * **What it reads.** The summary; the genesis; the entries that the key
 * signed; the entries whose chain leads to an entry that the key signed,
 * within the window of the reading at that entry's time; and the retained
 * inputs that those entries name by digest. `entry` for one of those
 * entries, `retained` for one of those inputs, and `history` and `log`
 * pages that hold only those entries. A page's `next` and `complete` are
 * those of the page that was filtered, so a reader that follows `next`
 * meets each entry once. Every other read is `forbidden`, and so is a
 * stream: a stream is opened by a session only.
 *
 * A session of a membership scope reads a register in the same way
 * (`sessions.ts`, `chainedSession`): the genesis, the register's entries
 * whose chain leads to the claim that caused the directory which created
 * that membership scope, and the retained inputs they name. So the
 * founder's command, with a signed read or with its session, verifies the
 * register, the directory and its children.
 *
 * A signed read is no credential beyond itself: whoever holds one can make
 * that one read, with that argument, until its `notAfter`, and nothing
 * else. It travels in a header, never in a URL.
 */

import type { Entry, FactUse, KeyId, ScopeId, Seed, SignedRead, SignedReadName, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, isKeyId, isScopeId, isSignature, parseStrict, scopeIdOf, seedDigest, unb64url, verifySignedRead } from "@generalbusiness/artroom-bytes";
import { isObject, same, timeMs, type ScopeState } from "@generalbusiness/artroom-derive";
import type { Clock, ReadName } from "./ports.ts";
import type { Store } from "./store.ts";

/** How a reader presents a signed read: the `Authorization` header's value. */
const SCHEME = "Signed ";
/** The most characters of a presented value that are looked at. */
const SIGNED_CHARS = 2048;
/** The reads that a signed read may name. */
export const SIGNED_READS: readonly SignedReadName[] = ["summary", "history", "entry", "log", "retained"];
/** The most characters of a signed read's argument: a digest, the longest argument, is 71. */
const ARG_CHARS = 128;

const only = (v: Record<string, unknown>, ...members: string[]): boolean => Object.keys(v).length === members.length && members.every((m) => Object.hasOwn(v, m));

function isSignedRead(v: unknown): v is SignedRead {
  if (!isObject(v) || !only(v, "request", "sig") || !isSignature(v["sig"])) return false;
  const r = v["request"];
  return isObject(r) && only(r, "v", "to", "actor", "read", "arg", "notAfter") && r["v"] === 1 && isScopeId(r["to"]) && isKeyId(r["actor"])
    && typeof r["read"] === "string" && (SIGNED_READS as readonly string[]).includes(r["read"]) && typeof r["arg"] === "string" && r["arg"].length <= ARG_CHARS
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

/** The signed entry at the root of a cause chain: its signer, its time, and where it is. */
export interface Root { actor: KeyId; time: Timestamp; scope: ScopeId; seq: number }

/** What a scope's check of a signed read is given. Each is read at every check. */
export interface SignedReading {
  /** The scope's own clock. */
  clock: Clock;
  /** The authority window of an intent, in seconds: the scope's `intentLifetimeSeconds`. */
  window: number;
  /** The roots of this scope's cause chains, as the scope found them before the read. Absent: none is known. */
  chains?: Pick<Chains, "at" | "claimOf">;
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
 * The root of an entry's cause chain (see the head of this file), or null:
 * it has none within `steps` causes. `read` gives an entry that an entry of
 * the chain names by a fact, or null when it cannot be read now; then the
 * answer is `unavailable`, and may be another later. Each `read` is of an
 * entry that an entry of the chain retains. `own` gives an entry of this
 * scope by its position, for the cause of an outcome or a diagnosis; such a
 * cause of an entry of another scope ends the chain with no root.
 */
export async function rootOf(start: Entry, read: (use: FactUse) => Promise<Entry | null>, steps = CHAIN_STEPS, own?: { scope: ScopeId; entry(seq: number): Entry | null }): Promise<Root | null | "unavailable"> {
  let entry = start;
  for (let step = 0; ; step++) {
    const actor = signerOf(entry);
    if (actor) return { actor, time: entry.time, scope: entry.at.scope, seq: entry.seq };
    if (step === steps) return null;
    const input = entry.input;
    if (input.type === "outcome" || input.type === "diagnosis") {
      // The entry that opened the operation, or that made the send which was diagnosed: an entry of the same scope.
      const seq = input.type === "outcome" ? Number(input.operation.split(":")[0]) : input.of.seq;
      const local = own && own.scope === entry.at.scope && seq < entry.seq ? own.entry(seq) : null;
      if (!local) return null;
      entry = local;
      continue;
    }
    if (input.type === "delivery") {
      // The entry that made the send, which a delivery retains.
      const use = entry.uses.find((u) => same(u.fact, input.from));
      if (!use) return null;
      const source = await read(use);
      if (!source) return "unavailable";
      entry = source;
      continue;
    }
    if (input.type !== "genesis" || input.decision !== "applied") return null;
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
    let act: Entry | null = null;
    for (const u of entry.uses) {
      const used = u === use ? source : await read(u);
      if (!used) return "unavailable";
      if (used.input.type === "act" && intentDigest(used.input.signed.intent) === input.seed.cause) { act = used; break; }
    }
    if (!act) return null;
    entry = act;
  }
}

/**
 * The roots of one scope's cause chains, by the position of each entry,
 * found once each and kept: the history fixes them (see the head of this
 * file). `update` finds those of the entries that are new since it last
 * ran. For a register it also keeps, for each membership scope that a
 * directory it created created, the position of the claim that caused that
 * directory: a delivery from the directory's genesis retains that genesis,
 * whose sends name the membership scope's seed.
 */
export class Chains {
  readonly #store: Pick<Store, "scope" | "stored">;
  readonly #read: (use: FactUse) => Promise<Entry | null>;
  readonly #roots: (Root | null)[] = [];
  readonly #claims = new Map<ScopeId, number>();

  constructor(store: Pick<Store, "scope" | "stored">, read: (use: FactUse) => Promise<Entry | null>) {
    this.#store = store;
    this.#read = read;
  }

  /** The root of the entry at `seq`. Undefined: not found yet, and the entry is read by nobody but a reader of the whole scope. */
  at(seq: number): Root | null | undefined { return this.#roots[seq]; }
  /** The position of the register's claim that caused the directory which created that membership scope, or null. */
  claimOf(membership: ScopeId): number | null { return this.#claims.get(membership) ?? null; }

  /** Find the roots of the entries up to the head. An entry whose chain cannot be read now stops it; the next call goes on from there. */
  async update(): Promise<void> {
    const scope = this.#store.scope();
    if (!scope) return;
    const entryAt = (seq: number): Entry | null => { const row = this.#store.stored(seq); return row ? (JSON.parse(row.bytes) as Entry) : null; };
    const own = { scope: scope.at.scope, entry: entryAt };
    for (let seq = this.#roots.length; seq <= scope.head.seq; seq++) {
      const entry = entryAt(seq);
      if (!entry) return;
      const root = await rootOf(entry, this.#read, CHAIN_STEPS, own);
      if (root === "unavailable") return;
      if (scope.at.kind === "register" && root && root.scope === scope.at.scope) for (const membership of await this.#memberships(entry)) this.#claims.set(membership, root.seq);
      this.#roots[seq] = root;
    }
  }

  /** The membership scopes whose seeds the directory's genesis that a delivery came from names, or none. */
  async #memberships(entry: Entry): Promise<ScopeId[]> {
    const input = entry.input;
    if (input.type !== "delivery" || input.from.seq !== 0 || input.from.at.kind !== "directory") return [];
    const use = entry.uses.find((u) => same(u.fact, input.from));
    const genesis = use ? await this.#read(use) : null;
    if (!genesis || genesis.input.type !== "genesis") return [];
    return genesis.sends.flatMap((send) => (isObject(send.to) && (send.to as { kind?: unknown }).kind === "membership" && "cause" in send.to ? [scopeIdOf(send.to as Seed)] : []));
  }
}

/**
 * One check of a signed read, in the order at the head of this file.
 * `key`: the read may be made, by that key, and `since` is the earliest
 * time of a root that leads it to an entry (the reading less the window).
 * `read` and `arg` are the read that is asked and its argument, as the
 * request must name them.
 */
export function checkSignedRead(config: SignedReading, store: Pick<Store, "scope" | "stored">, reader: string, read: ReadName, arg: string): { key: KeyId; since: number } | { refused: false | "clock-behind" } {
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
  const since = reading - window;
  // The entries within the window of the reading, from the head back. A key that signed one of them may read.
  for (let seq = scope.head.seq; seq >= 0; seq--) {
    const row = store.stored(seq);
    if (!row) break;
    const entry = JSON.parse(row.bytes) as Entry;
    if ((timeMs(entry.time) ?? -Infinity) < since) break;
    if (signerOf(entry) === actor) return { key: actor, since };
  }
  // The root of the genesis's cause chain, measured at its own time.
  const root = config.chains?.at(0) ?? null;
  return root && leads(root, actor, since) ? { key: actor, since } : { refused: false };
}

/** Whether a root is an entry that `key` signed, at `since` or later. */
export const leads = (root: Root | null | undefined, key: KeyId, since: number): boolean => !!root && root.actor === key && (timeMs(root.time) ?? -Infinity) >= since;
