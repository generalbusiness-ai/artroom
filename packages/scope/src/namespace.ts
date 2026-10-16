/**
 * The one scope namespace (scope contract, section 2.3): a scope's Durable
 * Object is the object named by its scope ID, and by nothing else. This file
 * holds both sides of what crosses between two scopes.
 *
 * The asking side is `namespace`: the production `Resolver`, which reads a
 * foreign entry; the `Transport`, which delivers one send; and the
 * `Definitions`, which reads a declaration from the scope that retains it.
 * `membershipIn` is the read of a membership scope, for an observation.
 * Each is one RPC call on the object the name gives.
 *
 * The answering side is what the object at a name does before any of its
 * scope's judgment: `routed`, the resolver of the name, which refuses an
 * address that is not this scope and incarnation; `sourced`, which answers
 * a read of one entry; `declaredBy`, which answers a read of one retained
 * declaration; `sentText`, which answers a read of one detached text that a
 * send of this scope names; and `observedAt`, which answers an observation
 * read of a membership scope.
 */

import type { Digest, Entry, FactRef, ObservationRequest, ObservedScope, RoutingRefusal, ScopeId, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, isDigest, isFactRef, isKeyId, isMemberId, isPlatformDefinition, isScopeId, parseStrict, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { isEntryOf, isObject, isScopeRef, type Delivered, type Fetched, type ScopeState } from "@generalbusiness/dap-derive";
import { isOf, platform, sourceName } from "@generalbusiness/dap-platform";
import type { Membership } from "./authority.ts";
import type { Pinned } from "./core.ts";
import type { Definitions, Delivery, Resolver, SentTexts, Transport } from "./ports.ts";
import { EXACT_PROOF_RECEIVER_BOUNDS, PROOF_BYTE_BOUNDS, type ProofBody, type ProofSource } from "./proof-bytes.ts";
import type { Store } from "./store.ts";
import { encodeSessionReference, sessionReferenceRequest, SESSION_REFERENCE_BOUNDS, type SessionReferenceSource } from "./session-reference.ts";
import { readNativeBirth, type NativeBirth, type NativeBirthSource } from "./native-birth.ts";
import { operational, type OperationalIdentity } from "./operational.ts";

/** What the object at a name answers to a read of one of its entries. `bytes` null: it has no entry at that sequence number. */
export interface Sourced { at: ScopeRef; under: string; bytes: string | null; origin?: readonly { fact: FactRef; under: string; bytes: string }[] }

/** The five calls one scope's object takes from another's. `observe` is asked of a membership scope or of a rules scope. */
export interface Peer {
  deliver(envelope: Delivered, identity?: OperationalIdentity): Promise<Delivery>;
  source(seq: number, origin?: boolean): Promise<Sourced | null>;
  /** Optional: unsupported native senders never fall back to source(). */
  proofSource?(fact: FactRef, maxBytes: number, milliseconds?: number): Promise<ProofBody | null>;
  /** Raw checked birth only; never a producer-selected privileged identity. */
  nativeBirth?(at: ScopeRef, milliseconds: number, maxBytes?: number): Promise<NativeBirth | null>;
  /** Optional bounded native directory witness; never fall back to summary. */
  sessionReference?(request: string): Promise<string | null>;
  declared(digest: Digest): Promise<string | null>;
  text(seq: number, digest: Digest): Promise<string | null>;
  observe(asked: ObservationRequest): Promise<unknown>;
}

/** The little of a Durable Object namespace binding this file uses. */
export interface Binding {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): unknown;
}

/** One optional native capability, addressed only by validated birth. No
 * summary/source fallback, separate timeout, peer discovery or retries. */
export function sessionReferencesIn(binding: Binding): SessionReferenceSource {
  return { async read(directory, request) {
    if (!isScopeRef(directory) || directory.kind !== "directory") return null;
    const parsed = sessionReferenceRequest(request);
    if (!parsed || canonicalize(parsed.to) !== canonicalize(directory)) return null;
    const bytes = encodeSessionReference(parsed);
    if (!bytes) return null;
    try {
      const peer = binding.get(binding.idFromName(directory.scope)) as Peer;
      if (typeof peer.sessionReference !== "function") return null;
      const reply = await peer.sessionReference(bytes), cap = Math.min(parsed.maxBytes, SESSION_REFERENCE_BOUNDS.reply);
      return typeof reply === "string" && reply.length <= cap && utf8(reply).length <= cap ? reply : null;
    } catch { return null; }
  } };
}

/** The name a send is addressed to: a reference's scope ID, or for a creation the digest of its seed. Null: it names nothing. */
export function nameOf(to: unknown): ScopeId | null {
  try {
    return isScopeRef(to) ? to.scope : isObject(to) ? scopeIdOf(to as never) : null;
  } catch {
    return null;
  }
}

/**
 * The resolver of a name (sections 2.3 and 7.4). It answers before the
 * delivery reaches the scope's judgment, from the scope's own record and
 * nothing else, so a refusal here recorded nothing.
 *
 * - A reference to another scope ID or another kind, or to an empty store:
 *   `not-found`. Another incarnation: `wrong-incarnation`.
 * - A reference to a scope whose genesis was refused: `not-found`. That
 *   scope admits nothing but a repeat of its creation request, which is
 *   addressed by its seed.
 * - A seed whose digest is not this name: `not-found`. A seed to an empty
 *   store passes only with a `create`, which that store may record.
 */
export function routed(name: ScopeId | null, scope: ScopeState | null, delivered: Delivered): RoutingRefusal | null {
  const to: unknown = isObject(delivered) ? delivered.to : null;
  if (!name || nameOf(to) !== name) return "not-found";
  if (isScopeRef(to)) {
    if (!scope || to.kind !== scope.at.kind || scope.status === "refused") return "not-found";
    return to.inc === scope.at.inc ? null : "wrong-incarnation";
  }
  const message: unknown = delivered.message;
  return scope || (isObject(message) && message["class"] === "request" && message["type"] === "create") ? null : "not-found";
}

/**
 * The name of the definition a scope pins, which a `fact` type's `under` and
 * a handler's `from.under` are compared with (section 6.1): the name a
 * declared definition states, or a platform definition's name without its
 * version. Null: the scope pins a declaration that it cannot read now, so
 * it cannot say.
 */
export function nameUnder(pinned: Pinned, origin: readonly Fetched[] = []): string | null {
  if (isPlatformDefinition(pinned.named)) return sourceName(pinned.named, "");
  const name = pinned.definition?.declared.name;
  if (name === undefined) return null;
  // A declaration may use these words without acquiring the native identity
  // that privileged handlers and fact types select. Existing lane bytes stay
  // exact; authenticated native factory facts establish the role.
  return sourceName(pinned.named, name, origin);
}

/** Immutable copies only; a historical retained name is not an authenticated identity. */
export function sourceOrigin(store: Store, pinned: Pinned): readonly Fetched[] {
  const at = store.scope()?.at;
  if (!at) return [];
  const first = store.stored(0);
  if (!first) return [];
  const genesis = parseStrict(first.bytes) as Entry;
  const source = genesis.input.type === "genesis" ? genesis.input.source : null;
  const use = source ? genesis.uses.find(row => canonicalize(row.fact) === canonicalize(source)) : undefined;
  const creation = use ? store.retained("entry", use.content) : null;
  const own: Fetched = { fact: { at, seq: 0, hash: first.hash }, entry: genesis, under: pinned.definition?.declared.name ?? "" };
  return source && creation ? [own, { fact: source, entry: parseStrict(creation.bytes) as Entry, under: creation.under ?? "" }] : [own];
}

/**
 * One entry of this scope as another scope reads it, with the name of the
 * definition this scope pins. A scope that cannot state that name gives no
 * answer: the call fails, and the reader's entry cannot be read now.
 */
export function sourced(store: Store, pinned: Pinned | null, seq: number, origin = false, authenticatedOrigin?: readonly Fetched[]): Sourced | null {
  const scope = store.scope();
  if (!scope || !pinned) return null;
  const proof = authenticatedOrigin ?? [];
  const under = nameUnder(pinned, proof);
  if (under === null) throw new Error("the pinned definition or native origin cannot be read, so its identity cannot be stated");
  const answer: Sourced = { at: scope.at, under, bytes: (Number.isSafeInteger(seq) ? store.stored(seq) : null)?.bytes ?? null };
  if (origin) {
    answer.origin = proof.map((copy, index) => ({ fact: copy.fact, under: index === 0 ? under : copy.under, bytes: canonicalize(copy.entry) }));
  }
  return answer;
}

/**
 * The bytes of a declaration this scope retains, by digest: its own, or one
 * it retains for its children (section 9.2). Null: it retains none under
 * that digest. The bytes are immutable and the reader checks their digest,
 * so the answer says nothing else about this scope.
 */
export function declaredBy(store: Store, digest: Digest): string | null {
  return typeof digest === "string" ? (store.retained("definition", digest)?.bytes ?? null) : null;
}

/**
 * A detached text that a send of this scope's entry at `seq` names by
 * digest, as the scope retains it: one JSON string (section 6.2). The
 * bytes travel beside the message, so the receiver of that send asks for
 * them. Null: this scope has no such entry, no send of that entry names
 * that digest, or the scope holds no bytes under it, as after a redaction.
 * A text that no send names is not answered: a reader asks the read port
 * for it.
 */
export function sentText(store: Store, seq: number, digest: Digest): string | null {
  const kept = Number.isSafeInteger(seq) && isDigest(digest) ? store.stored(seq) : null;
  if (!kept || !canonicalize((JSON.parse(kept.bytes) as Entry).sends).includes(`"${digest}"`)) return null;
  return store.retained("text", digest)?.bytes ?? null;
}

/**
 * What a scope answers to an observation read (authority note, section
 * 3.3, step 3; section 12.1.3, "Two things that are answers and no
 * entries"; section 12.1.4, "The revision of the rules, and the answer to
 * an observation"): from its folded state at its head, by the function
 * `observed` of its pinned platform version. A membership scope answers the
 * standing of one key or of one member (`standingOf`). A rules scope
 * answers what it holds, asked as "rules" or as "definitions"
 * (`rulesAnswer`). The scope writes no entry for a read, and the answer
 * names the scope, the incarnation and the head that gave it.
 *
 * Null: no answer. The scope is under no platform version that this
 * runtime can run, or under one that answers no observation; it is
 * provisional or refused; it is asked as another scope or incarnation; or
 * the request is none of the forms that the contract's section 16.1 gives
 * for a scope of its kind, with exactly its members. The request names no
 * asker, and the answer is the same for every scope that asks.
 */
export function observedAt(store: Store, pinned: Pinned | null, asked: unknown): unknown {
  const kind = isOf(pinned?.named, "platform:membership") ? "membership" : isOf(pinned?.named, "platform:rules") ? "rules" : null;
  const supplied = pinned?.definition ? platform(pinned.named) : null;
  const answers = supplied?.observed;
  if (kind === null || !answers) return null;
  // Revision 20 (the contract's section 16.1, "An observation of the holders of one action"): the fourth request, `{ of, holders, most }`.
  const holders = isObject(asked) && Object.keys(asked).length === 3 && typeof asked["holders"] === "string" && asked["holders"] !== "" && typeof asked["most"] === "number" && Number.isSafeInteger(asked["most"]) && asked["most"] >= 1;
  if (!isObject(asked) || (Object.keys(asked).length !== 2 && !holders)) return null;
  // `of` is a full reference, or the scope ID and the kind alone: the first read of a scope that records no incarnation yet
  // (authority note, section 12.1, "The first read").
  const named: unknown = asked["of"];
  const byId = isObject(named) && Object.keys(named).length === 2 && isScopeId(named["scope"]) && named["kind"] === kind;
  if (!isScopeRef(named) && !byId) return null;
  const of = named as ObservedScope;
  if (kind === "rules") {
    if (asked["asked"] !== "rules" && asked["asked"] !== "definitions") return null;
    const request = { of, asked: asked["asked"] } as const;
    const answer = answers(store, request);
    if (answer === null) return null;
    const values = supplied?.observedValues?.(store, request) ?? [];
    return values.length > 0 ? { answer, values } : answer;
  }
  if (holders) return answers(store, { of, holders: asked["holders"] as string, most: asked["most"] as number });
  if (isKeyId(asked["key"])) return answers(store, { of, key: asked["key"] });
  return isMemberId(asked["member"]) ? answers(store, { of, member: asked["member"] }) : null;
}

/**
 * The resolver, the transport, the definitions and the sent texts over one
 * namespace binding. A call that fails is no answer: the entry cannot be
 * read now, or the attempt is unanswered.
 */
export function namespace(binding: Binding): { resolver: Resolver; proofs: ProofSource; births: NativeBirthSource; transport: Transport; definitions: Definitions; texts: SentTexts } {
  const peer = (name: ScopeId): Peer => binding.get(binding.idFromName(name)) as Peer;
  return {
    proofs: {
      async read(fact, maxBytes, milliseconds) {
        if (!isFactRef(fact) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0
          || (milliseconds !== undefined && (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 10_000))) return null;
        try {
          const source = peer(fact.at.scope);
          if (typeof source.proofSource !== "function") return null;
          return milliseconds === undefined ? await source.proofSource(fact, Math.min(maxBytes, PROOF_BYTE_BOUNDS.body))
            : await source.proofSource(fact, Math.min(maxBytes, PROOF_BYTE_BOUNDS.body), milliseconds);
        } catch { return null; }
      },
    },
    births: {
      async read(at, milliseconds, maxBytes = PROOF_BYTE_BOUNDS.body) {
        if (!isScopeRef(at) || !Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > EXACT_PROOF_RECEIVER_BOUNDS.milliseconds || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > PROOF_BYTE_BOUNDS.body) return null;
        try {
          const source = peer(at.scope);
          return typeof source.nativeBirth === "function" ? readNativeBirth(await source.nativeBirth(at, milliseconds, maxBytes), at, maxBytes) : null;
        } catch { return null; }
      },
    },
    resolver: {
      async read(fact, _seconds, origin = false) {
        let answer: Sourced | null;
        try {
          answer = await peer(fact.at.scope).source(fact.seq, origin);
        } catch {
          return null;
        }
        // Section 7.4: the incarnation in the answer is checked against the one the fact names.
        if (!answer || answer.at.inc !== fact.at.inc || answer.bytes === null) return { absent: true };
        try {
          const proof: Fetched[] = [];
          if (origin && answer.origin) {
            if (!Array.isArray(answer.origin) || answer.origin.length > 3) return { absent: true };
            for (const row of answer.origin) {
              const entry = parseStrict(row.bytes) as Entry;
              if (!isEntryOf(entry, row.fact) || typeof row.under !== "string") return { absent: true };
              proof.push({ fact: row.fact, entry, under: row.under });
            }
          }
          return { entry: parseStrict(answer.bytes) as Entry, under: answer.under, ...(origin ? { origin: proof } : {}) };
        } catch {
          return { absent: true };
        }
      },
    },
    transport: {
      async send(envelope) {
        const name = nameOf(envelope.to);
        // An address that names nothing reaches no resolver, so it is no routing refusal: the attempt is unanswered.
        if (!name) return null;
        try {
          return await peer(name).deliver(envelope, operational()?.identity);
        } catch {
          return null;
        }
      },
    },
    definitions: {
      // Sections 5.1 and 9.2: a child reads its declaration from its creator, by digest, before its genesis turn.
      async read(named, holder) {
        if (!holder) return { ok: false, reason: "unavailable" };
        try {
          const bytes = await peer(holder.scope).declared(named);
          return bytes === null ? { ok: false, reason: "absent" } : { ok: true, bytes };
        } catch {
          return { ok: false, reason: "unavailable" };
        }
      },
      // Section 6.1: a platform definition is the runtime's own code. No scope retains it, so no name of this namespace is asked.
      platform,
    },
    texts: {
      // Section 6.2: the bytes of a detached text travel beside the message that names it. The receiver reads them from the sender.
      async read(from, digest) {
        try {
          const bytes = await peer(from.at.scope).text(from.seq, digest);
          const text: unknown = bytes === null ? null : parseStrict(bytes);
          return typeof text === "string" ? { ok: true, text } : { ok: false, reason: "absent" };
        } catch {
          return { ok: false, reason: "unavailable" };
        }
      },
    },
  };
}

/**
 * How a scope reads its membership scope over one namespace binding
 * (authority note, section 3.3, step 2): one call on the object that the
 * membership reference names. A call that fails is no answer, and the
 * asking scope then holds nothing new. The answer names the scope and the
 * incarnation that gave it, and the asking scope checks both.
 */
export function membershipIn(binding: Binding): Membership {
  return {
    async observe(asked) {
      try {
        // The answering side is the object's method `observe` (`observedAt`): a membership scope answers from its head, and answers
        // nothing while it is provisional. An object of another kind answers null.
        return await (binding.get(binding.idFromName(asked.of.scope)) as Peer).observe(asked);
      } catch {
        return null;
      }
    },
  };
}
