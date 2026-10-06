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

import type { Digest, Entry, ObservationRequest, ObservedScope, RoutingRefusal, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, isKeyId, isMemberId, isPlatformDefinition, isScopeId, parseStrict, platformName, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { isObject, isScopeRef, type Delivered, type ScopeState } from "@generalbusiness/artroom-derive";
import { MEMBERSHIP, RULES_SCOPE, platform } from "@generalbusiness/artroom-platform";
import type { Membership } from "./authority.ts";
import type { Pinned } from "./core.ts";
import type { Definitions, Delivery, Resolver, SentTexts, Transport } from "./ports.ts";
import type { Store } from "./store.ts";

/** What the object at a name answers to a read of one of its entries. `bytes` null: it has no entry at that sequence number. */
export interface Sourced { at: ScopeRef; under: string; bytes: string | null }

/** The five calls one scope's object takes from another's. `observe` is asked of a membership scope or of a rules scope. */
export interface Peer {
  deliver(envelope: Delivered): Promise<Delivery>;
  source(seq: number): Promise<Sourced | null>;
  declared(digest: Digest): Promise<string | null>;
  text(seq: number, digest: Digest): Promise<string | null>;
  observe(asked: ObservationRequest): Promise<unknown>;
}

/** The little of a Durable Object namespace binding this file uses. */
export interface Binding {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): unknown;
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
export function nameUnder(pinned: Pinned): string | null {
  return isPlatformDefinition(pinned.named) ? platformName(pinned.named) : (pinned.definition?.declared.name ?? null);
}

/**
 * One entry of this scope as another scope reads it, with the name of the
 * definition this scope pins. A scope that cannot state that name gives no
 * answer: the call fails, and the reader's entry cannot be read now.
 */
export function sourced(store: Store, pinned: Pinned | null, seq: number): Sourced | null {
  const scope = store.scope();
  if (!scope || !pinned) return null;
  const under = nameUnder(pinned);
  if (under === null) throw new Error("the pinned definition cannot be read, so its name cannot be stated");
  return { at: scope.at, under, bytes: (Number.isSafeInteger(seq) ? store.stored(seq) : null)?.bytes ?? null };
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
  const kind = pinned?.named === MEMBERSHIP ? "membership" : pinned?.named === RULES_SCOPE ? "rules" : null;
  const answers = pinned?.definition ? platform(pinned.named)?.observed : undefined;
  if (kind === null || !answers) return null;
  if (!isObject(asked) || Object.keys(asked).length !== 2) return null;
  // `of` is a full reference, or the scope ID and the kind alone: the first read of a scope that records no incarnation yet
  // (authority note, section 12.1, "The first read").
  const named: unknown = asked["of"];
  const byId = isObject(named) && Object.keys(named).length === 2 && isScopeId(named["scope"]) && named["kind"] === kind;
  if (!isScopeRef(named) && !byId) return null;
  const of = named as ObservedScope;
  if (kind === "rules") return asked["asked"] === "rules" || asked["asked"] === "definitions" ? answers(store, { of, asked: asked["asked"] }) : null;
  if (isKeyId(asked["key"])) return answers(store, { of, key: asked["key"] });
  return isMemberId(asked["member"]) ? answers(store, { of, member: asked["member"] }) : null;
}

/**
 * The resolver, the transport, the definitions and the sent texts over one
 * namespace binding. A call that fails is no answer: the entry cannot be
 * read now, or the attempt is unanswered.
 */
export function namespace(binding: Binding): { resolver: Resolver; transport: Transport; definitions: Definitions; texts: SentTexts } {
  const peer = (name: ScopeId): Peer => binding.get(binding.idFromName(name)) as Peer;
  return {
    resolver: {
      async read(fact) {
        let answer: Sourced | null;
        try {
          answer = await peer(fact.at.scope).source(fact.seq);
        } catch {
          return null;
        }
        // Section 7.4: the incarnation in the answer is checked against the one the fact names.
        if (!answer || answer.at.inc !== fact.at.inc || answer.bytes === null) return { absent: true };
        try {
          return { entry: parseStrict(answer.bytes) as Entry, under: answer.under };
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
          return await peer(name).deliver(envelope);
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
