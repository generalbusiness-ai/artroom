/**
 * The words table: the surface name of each act tool, as data (plan 031,
 * section 3, "Names follow the words"). It is seeded from plan 030's
 * glossary. It maps names only. It never changes a signed kind, a field,
 * a type, a target, a revision, a byte domain or the requested meaning:
 * those are the declaration's, and custody binds them by the binding
 * identity, never by a surface name.
 *
 * A kind the table does not map keeps its record word: `<noun>.<kind>`,
 * where the noun is the table's noun for the definition, or else the
 * definition's own name with `platform:` taken off.
 */

import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import type { Digest } from "@generalbusiness/dap-contract";
import seed from "./words.json" with { type: "json" };

export interface Words {
  v: 1;
  source?: string;
  nouns: Readonly<Record<string, string>>;
  acts: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** The table this server ships. */
export const WORDS: Words = seed as Words;

/** A word as a tool name may hold it: letters, digits, `-` and `_`. */
const word = (text: string): string => text.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "act";

/** The noun of a definition: the table's, or its own name without `platform:`. */
export function nounOf(words: Words, definition: string): string {
  return Object.hasOwn(words.nouns, definition) ? words.nouns[definition]! : word(definition.replace(/^platform:/, ""));
}

/** The surface name of one act kind of one definition, before collisions are resolved. */
export function surfaceOf(words: Words, definition: string, kind: string): string {
  const row = Object.hasOwn(words.acts, definition) ? words.acts[definition]! : {};
  return Object.hasOwn(row, kind) ? row[kind]! : `${nounOf(words, definition)}.${word(kind)}`;
}

/** The digest of the table: a semantic input of the list generation, so a change of words is a list change. */
export function wordsDigest(words: Words): Digest {
  return digestBytes(utf8(canonicalize(words)));
}

/**
 * Refuses a table that maps two kinds of one definition to one surface
 * name. That is a mistake in the table, not a collision: collisions across
 * definitions are resolved by variants (`catalogue.ts`).
 */
export function checkWords(words: Words, definitions: readonly { name: string; genesis: string; acts: Readonly<Record<string, unknown>> }[]): void {
  for (const definition of definitions) {
    const seen = new Map<string, string>();
    for (const kind of Object.keys(definition.acts)) {
      if (kind === definition.genesis) continue;
      const name = surfaceOf(words, definition.name, kind);
      const other = seen.get(name);
      if (other !== undefined) throw new Error(`The words table maps ${other} and ${kind} of ${definition.name} to one name, ${name}.`);
      seen.set(name, kind);
    }
  }
}
