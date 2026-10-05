/**
 * What the families of the validator share while one definition is read
 * (scope contract, sections 6.3 and 6.4): the item types as they were read,
 * what the forms of one act, handler or timed rule may name, and how a
 * subject is resolved.
 */

import type { Bounds, FieldType } from "@generalbusiness/artroom-contract";
import type { Shapes } from "./shape.ts";

export interface Slot { kind: "party" | "ref" | "value"; fixed: boolean; required: boolean; list: boolean; type: FieldType; hasDefault: boolean }
export interface Type { name: string; states: Map<string, boolean>; initial: string; slots: Map<string, Slot> }

/** What the forms of one act, handler or timed rule may name. */
export interface Ctx {
  on: Type | null;
  also: Map<string, Type>;
  nascent: boolean;                       // `on` is opened by this entry
  fields: Map<string, FieldType> | null;  // null: a handler, whose message fields the contract does not declare
  signer: boolean;
  timed: boolean;
  live: Set<string>;                      // subjects under a `state` guard that lists no final state
}

/** What a `where` of one range guard reads: the slots an index on that type must cover (section 6.5). */
export interface RangeIndex { path: string; type: string; slots: readonly string[] }

/** What one result clause can change that a timed rule reads: for each effect, the subject, its item type, and the state or the value slot it sets. */
export type ClauseSet = { subject: string; type: string; state?: string; slot?: string }[];

/**
 * One definition while it is validated: the readers and their problems, the
 * bounds, and what each family leaves for the others. The item types are
 * read first, so every later form resolves its names against `types`.
 */
export interface Defining extends Shapes {
  readonly bounds: Bounds;
  readonly typeNames: ReadonlySet<string>;  // every key of `items`, known before any item type is read
  readonly types: Map<string, Type>;        // the item types that were read whole
  readonly rules: Set<string>;              // the names of the declared rule expressions
  holds: boolean;                           // the definition lists `hold@1`
  readonly holdTypes: Set<string>;          // section 6.8: the types a `hold: open` effect targets
  readonly indexes: RangeIndex[];
  readonly clauseSets: ClauseSet[];         // one for each result clause that is reserved for (section 17.2)
  clause: ClauseSet | null;                 // the clause whose effects are being read, if it is one that is reserved for
}

export const onSubject = (of: unknown) => of === undefined || of === "on";

/** The item type a subject names, or `scope`. Null: it names nothing here, which is reported. */
export function subject(d: Defining, of: unknown, path: string, ctx: Ctx, scopeToo: boolean): Type | "scope" | null {
  if (onSubject(of)) return ctx.on ?? d.bad("name", path, "there is no primary item here; name a subject with `of`");
  if (of === "scope") return scopeToo ? "scope" : d.bad("name", path, "the scope is not an item");
  const named = typeof of === "string" && of.startsWith("also.") ? ctx.also.get(of.slice(5)) : undefined;
  return named ?? d.bad("name", path, "names no subject");
}
