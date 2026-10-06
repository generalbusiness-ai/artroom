/**
 * The operations of a scope service (scope contract, sections 4.2, 7.1 and
 * 9.1), as one interface. The service's entrypoint implements it, and a
 * client's transport is a value of it, so the two cannot drift: a type
 * check holds both to this declaration.
 *
 * Every operation but a founding names its scope by ID. `reader` is whatever
 * the caller presents to the read port; what it must be is the authority
 * note's. Every list is a page with a cursor (section 9.1).
 */

import type { Answer, DeliveryRefusal, RefusalReason, UnavailableReason } from "./result.ts";
import type { DeclaredDefinition } from "./definition.ts";
import type { DutyId, Receipt } from "./entry.ts";
import type { FactRef, Grant, Digest, PlatformDefinition } from "./scope.ts";
import type { SignedIntent } from "./intent.ts";
import type { Cursor, Duty, Item, LogPage, Read, RetainedInput, Sealed, Settlement, Summary } from "./read.ts";

/**
 * How a founding is answered (section 7.1). `accepted`: the genesis entry is
 * sealed, now or by an earlier call with the same intent, and its act
 * applied. `scope-refused`: the genesis entry is sealed and its act refused;
 * the scope is terminal. Every other refusal wrote nothing.
 */
export type Founded =
  | { answer: "accepted"; receipt: Receipt }
  | { answer: "refused"; reason: RefusalReason | DeliveryRefusal | "unsupported-definition" }
  | { answer: "unavailable"; reason: UnavailableReason };

/**
 * What travels beside a signed intent, and is not signed (sections 6.2 and
 * 6.4). `texts`: each detached text that a field of the intent names by its
 * digest. The scope computes each digest itself, so a text needs no name. A
 * text that no field names is not kept. `presented`: the facts presented
 * beside the intent, by the names the act declares in `presents`.
 *
 * `values`: each value beside the intent that is no text (section 6.2, "A
 * value beside an intent"), as its canonical bytes, with no name and no
 * domain tag. A value is one JSON value in one byte domain. A place of the
 * act, which the specification of a platform definition states with its one
 * domain, names it by digest, and the scope computes the digest itself. A
 * value that no place names is not kept. An act of a declared definition
 * has no such place, and a founding takes `texts` only.
 */
export interface Beside { texts?: readonly string[]; presented?: Record<string, FactRef>; values?: readonly string[] }

export interface ScopeApi {
  /**
   * Found a repository's directory. `definition` is a declaration, or the
   * digest or platform name of one. `definitions`: the declarations it names
   * in `create` sends, which the directory retains for its children.
   * `beside`: the detached texts that the founding intent's fields name.
   */
  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions?: readonly DeclaredDefinition[], beside?: Beside): Promise<Founded>;
  /**
   * Submit an act (section 4.2). A caller with no answer, or an unavailable
   * one, sends the same signed intent again, with the same `beside`.
   */
  submit(scope: string, signed: SignedIntent, grants: readonly Grant[], beside?: Beside): Promise<Answer>;
  /**
   * Ask for one step of a capability (section 5.5), with the signed intent
   * that the step prepares for. The answer has the forms of an act's. A
   * caller with no answer, or an unavailable one, sends the same request
   * again: the same intent, capability and step are answered with the first
   * entry.
   */
  prepare(scope: string, signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer>;
  /** The receipt of an accepted act, for its exact signed intent (section 4.2). */
  settle(scope: string, signed: SignedIntent): Promise<Settlement>;

  summary(scope: string, reader: unknown): Promise<Read<Summary>>;
  /** A page of the retained final items of one type. */
  items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>>;
  history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>>;
  entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>>;
  outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>>;
  /** The outbox status of one send. */
  duty(scope: string, reader: unknown, duty: DutyId): Promise<Read<Duty>>;
  /** A page of the history as stored: each entry's canonical bytes. */
  log(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<LogPage>>;
  /** One retained input, by kind and digest. */
  retained(scope: string, reader: unknown, kind: RetainedInput["kind"], digest: Digest): Promise<Read<RetainedInput>>;
}
