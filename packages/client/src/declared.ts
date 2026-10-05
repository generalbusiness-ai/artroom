/**
 * A handle that is built from a declared definition (scope contract,
 * sections 6.2 and 6.4). A caller that holds a definition's value, such as
 * one of the two lane definitions, gets act kinds and fields that are typed
 * from that value's own data, and knows that the scope runs exactly that
 * definition.
 *
 * - `declaredHandle(scope, definition)` reads the digest of the definition
 *   that the scope publishes, and refuses unless it is the digest of the
 *   value given.
 * - `intent(signer, kind, asked)` builds and signs one intent. Before it
 *   signs, it checks the shape of each field against the type the act
 *   declares, and replaces each detached text by its digest. It returns the
 *   signed intent with what travels beside it: the texts, and the facts the
 *   act is presented.
 * - `submit(signed, grants, beside)` sends both.
 *
 * It names no lane and holds no rule. It checks no guard, no grant and no
 * state: whether the act takes effect is the scope's judgment, and the
 * answer says so. A shape that passes here may still be refused there: the
 * scope checks every field again, with its own bounds.
 */

import type {
  Answer, Beside, DeclaredDefinition, Digest, FactRef, FieldType, FieldValue, Grant, MemberRef, PlatformDefinition, ReadRefusal, ScopeRef, SignedIntent, Timestamp,
} from "@generalbusiness/artroom-contract";
import { definitionDigest, isDigest, isFactRef, isLocalId, isMemberRef, isRecord, isScopeRef, textDigest, timeMs, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import type { ScopeHandle } from "./handle.ts";
import { signedIntent, type Signer, type Signing } from "./intent.ts";

// ---------------------------------------------------------------- the types, from the definition's data

/** The value a caller gives for a field of that type. A detached text is given as the text: the handle signs its digest. */
export type ValueOf<T> =
  T extends { type: "text" } ? string
  : T extends { type: "int" } ? number
  : T extends { type: "bool" } ? boolean
  : T extends { type: "time" } ? Timestamp
  : T extends { type: "enum"; of: readonly (infer V)[] } ? V
  : T extends { type: "member" } ? MemberRef
  : T extends { type: "item" } ? number
  : T extends { type: "fact" } ? FactRef
  : T extends { type: "scope" } ? ScopeRef
  : T extends { type: "digest" } ? Digest
  : T extends { type: "commit" | "tree" } ? string
  : T extends { type: "list"; of: infer E } ? readonly ValueOf<E>[]
  : T extends { type: "record"; of: infer M } ? Members<M>
  : FieldValue;

/** Named values: each that its declaration requires, and each other one when the caller gives it. */
export type Members<M> =
  { -readonly [N in keyof M as M[N] extends { required: true } ? N : never]: ValueOf<M[N]> }
  & { -readonly [N in keyof M as M[N] extends { required: true } ? never : N]?: ValueOf<M[N]> };

/** The act kinds of a definition that a handle signs: every act but the genesis act, which no intent to an existing scope names. */
export type Kind<D extends DeclaredDefinition> = string extends D["genesis"] ? keyof D["acts"] & string : Exclude<keyof D["acts"] & string, D["genesis"]>;

type Act<D extends DeclaredDefinition, K extends string> = D["acts"][K];
/** The item an act is on: none for an act that opens one, one for a transition, and as the act says for a comment. */
type On<S> = [S] extends ["open"] ? { on?: null } : [S] extends ["transition"] ? { on: number } : { on?: number | null };
type Given<F> = object extends Members<F> ? { fields?: Members<F> } : { fields: Members<F> };
type Shown<A> = A extends { presents: infer P } ? { presented?: { -readonly [N in keyof P]?: FactRef } } : { presented?: Record<string, FactRef> };

/** What a caller asks of one act kind: its item, the revision of each item it names, its fields, and the facts it is presented. */
export type AskedOf<D extends DeclaredDefinition, K extends string> =
  On<Act<D, K>["step"]> & Given<Act<D, K>["fields"]> & Shown<Act<D, K>> & { expected?: Record<string, number> };

/** A signed intent, with what travels beside it and is not signed: each detached text, and each presented fact. */
export interface Signed { signed: SignedIntent; beside: Beside }

/** A value that is not of the shape its act declares. Nothing was signed. `path` names the field. */
export class ShapeError extends Error {
  override readonly name = "ShapeError";
  constructor(readonly path: string, what: string) { super(`${path} ${what}`); }
}

// ---------------------------------------------------------------- the shape of a value

const own = <T>(record: Readonly<Record<string, T>> | undefined, name: string): T | undefined => (record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined);

/**
 * Checks `value` against `type`, and returns it as the intent holds it: the
 * same value, or for a detached text its digest, with the text added to
 * `texts`. It reads the type's own bounds. The scope's bounds on a member's
 * handle and on a list are the scope's to check.
 */
function shaped(type: FieldType, value: unknown, path: string, texts: Set<string>): FieldValue {
  const not = (what: string): never => { throw new ShapeError(path, what); };
  switch (type.type) {
    case "text": {
      if (typeof value !== "string" || !wellFormed(value)) return not("is not a text");
      if (utf8(value).length > type.max) return not(`is longer than ${type.max} bytes`);
      if (!type.detached) return value;
      texts.add(value);
      return textDigest(value);
    }
    case "int": return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= type.min && value <= type.max ? value : not(`is not an integer from ${type.min} to ${type.max}`);
    case "bool": return typeof value === "boolean" ? value : not("is not true or false");
    case "time": return timeMs(value) !== null ? (value as Timestamp) : not("is not a timestamp");
    case "enum": return typeof value === "string" && type.of.includes(value) ? value : not(`is not one of: ${type.of.join(", ")}`);
    case "member": return isMemberRef(value) ? value : not("is not a member reference");
    case "item": return isLocalId(value) ? value : not("is not a local item ID");
    case "fact": return isFactRef(value) ? value : not("is not a fact reference");
    case "scope": return isScopeRef(value) && value.kind === type.kind ? value : not(`is not a reference to a scope of kind ${type.kind}`);
    case "digest": return isDigest(value) ? value : not("is not a digest");
    case "commit": case "tree": return typeof value === "string" && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(value) ? value : not("is not a Git object ID");
    case "list": {
      if (!Array.isArray(value)) return not("is not a list");
      if (value.length > type.max) return not(`has more than ${type.max} elements`);
      return value.map((element, i) => shaped(type.of, element, `${path}.${i}`, texts));
    }
    case "record": {
      if (!isRecord(value)) return not("is not a record");
      return named(type.of, value, path, texts);
    }
  }
}

/** Named values against their declarations: no name that is not declared, and every required one. A name that is absent stays absent. */
function named(types: Readonly<Record<string, FieldType & { required: boolean }>>, given: Readonly<Record<string, unknown>>, path: string, texts: Set<string>): Record<string, FieldValue> {
  for (const name of Object.keys(given)) if (own(types, name) === undefined) throw new ShapeError(`${path}.${name}`, "is not declared");
  const out: [string, FieldValue][] = [];
  for (const [name, type] of Object.entries(types)) {
    const value = own(given, name);
    if (value === undefined && type.required) throw new ShapeError(`${path}.${name}`, "is required");
    if (value !== undefined) out.push([name, shaped(type, value, `${path}.${name}`, texts)]);
  }
  return Object.fromEntries(out);
}

// ---------------------------------------------------------------- the handle

export class DeclaredHandle<D extends DeclaredDefinition> {
  /**
   * `scope`: the handle whose published definition was checked. `at`: the
   * scope's reference, which every intent is addressed to. `definition`: the
   * value the caller holds, and `digest` its digest, which the scope pins.
   */
  constructor(readonly scope: ScopeHandle, readonly at: ScopeRef, readonly definition: D, readonly digest: Digest) {}

  /**
   * One signed intent of that act kind. Each field is checked against its
   * declared type first, and a `ShapeError` is thrown before anything is
   * signed. A detached text is given as the text: the intent holds its
   * digest, and `beside.texts` the text. `beside.presented` holds the facts
   * the act is presented. No guard is checked.
   */
  async intent<K extends Kind<D>>(signer: Signer, kind: K, asked: AskedOf<D, K>, signing: Signing = {}): Promise<Signed> {
    const act = own(this.definition.acts, kind);
    if (!act || kind === this.definition.genesis) throw new ShapeError(kind, "is not an act kind that an intent to this scope may name");
    const given = asked as { on?: number | null; expected?: Record<string, number>; fields?: Record<string, unknown>; presented?: Record<string, unknown> };
    // Section 6.4: an act that opens an item, and a comment on no item, name none. Every other act is on one item.
    const on = given.on ?? null;
    const needs = act.step !== "open" && act.on !== null;
    if (needs ? !isLocalId(on) : on !== null) throw new ShapeError("on", needs ? "is the local ID of the item this act is on" : "is not given: this act is on no existing item");
    const texts = new Set<string>();
    const fields = named(act.fields, given.fields ?? {}, "fields", texts);
    const presents = Object.fromEntries(Object.entries(act.presents ?? {}).map(([name, p]) => [name, { type: "fact", kind: p.kind, under: p.under, required: p.required } as const]));
    const presented = named(presents, given.presented ?? {}, "presented", texts) as Record<string, FactRef>;
    const signed = await signedIntent(signer, { to: this.at, kind, on, expected: given.expected ?? {}, fields }, signing);
    return { signed, beside: { ...(texts.size > 0 ? { texts: [...texts] } : {}), ...(Object.keys(presented).length > 0 ? { presented } : {}) } };
  }

  /** Submit a signed intent with the grants it is presented under and what travels beside it. A retry sends all three again, unchanged. */
  submit(signed: SignedIntent, grants: readonly Grant[] = [], beside: Beside = {}): Promise<Answer> {
    return this.scope.submit(signed, grants, beside);
  }
}

/**
 * How `declaredHandle` answers. `definition-mismatch`: the scope publishes
 * another definition than the value given; `published` is what it names.
 * Any other reason is the reason of the read that failed.
 */
export type Declared<D extends DeclaredDefinition> =
  | { ok: true; handle: DeclaredHandle<D> }
  | { ok: false; reason: ReadRefusal | "definition-mismatch"; published?: Digest | PlatformDefinition };

/**
 * A handle on `scope` that is typed from `definition`. It reads the scope's
 * summary, which names the definition the scope pins, and refuses unless
 * that is the digest of the value given. So a caller that holds a
 * definition's value knows that the scope runs exactly that definition. A
 * value that has no canonical bytes has no digest, and is refused as a
 * mismatch.
 */
export async function declaredHandle<const D extends DeclaredDefinition>(scope: ScopeHandle, definition: D): Promise<Declared<D>> {
  const summary = await scope.summary();
  if (!summary.ok) return { ok: false, reason: summary.reason };
  const published = summary.value.definition;
  let digest: Digest | null = null;
  try {
    digest = definitionDigest(definition);
  } catch { /* not canonical values */ }
  if (digest === null || published !== digest) return { ok: false, reason: "definition-mismatch", published };
  return { ok: true, handle: new DeclaredHandle(scope, summary.value.scope, definition, digest) };
}
