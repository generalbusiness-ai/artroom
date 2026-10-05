/**
 * The one scope namespace (scope contract, section 2.3): a scope's Durable
 * Object is the object named by its scope ID, and by nothing else. This file
 * holds both sides of what crosses between two scopes.
 *
 * The asking side is `namespace`: the production `Resolver`, which reads a
 * foreign entry, and the `Transport`, which delivers one send. Each is one
 * RPC call on the object the name gives.
 *
 * The answering side is what the object at a name does before any of its
 * scope's judgment: `routed`, the resolver of the name, which refuses an
 * address that is not this scope and incarnation; and `sourced`, which
 * answers a read of one entry.
 */

import type { Entry, RoutingRefusal, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { parseStrict, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { isObject, isScopeRef, type Delivered, type ScopeState } from "@generalbusiness/artroom-derive";
import type { Pinned } from "./core.ts";
import type { Delivery, Resolver, Transport } from "./ports.ts";
import type { Store } from "./store.ts";

/** What the object at a name answers to a read of one of its entries. `bytes` null: it has no entry at that sequence number. */
export interface Sourced { at: ScopeRef; under: string; bytes: string | null }

/** The two calls one scope's object takes from another's. */
export interface Peer {
  deliver(envelope: Delivered): Promise<Delivery>;
  source(seq: number): Promise<Sourced | null>;
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

/** One entry of this scope as another scope reads it, with the name of the definition this scope pins: its digest, or its platform name. */
export function sourced(store: Store, pinned: Pinned | null, seq: number): Sourced | null {
  const scope = store.scope();
  if (!scope || !pinned) return null;
  return { at: scope.at, under: pinned.named, bytes: (Number.isSafeInteger(seq) ? store.stored(seq) : null)?.bytes ?? null };
}

/**
 * The resolver and the transport over one namespace binding. A call that
 * fails is no answer: the entry cannot be read now, or the attempt is
 * unanswered.
 */
export function namespace(binding: Binding): { resolver: Resolver; transport: Transport } {
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
  };
}
