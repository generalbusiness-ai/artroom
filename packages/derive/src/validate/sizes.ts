/**
 * Upper bounds on canonical bytes (scope contract, sections 5.2, 6.4 and
 * 7.5). The static size of a timed entry is built from these.
 */

import type { Bounds, FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { unsupported } from "../unsupported.ts";

/** The canonical bytes of a value that the definition states. */
export const stated = (v: unknown): number => utf8(canonicalize(v)).length;

/** More than the canonical bytes of a scope reference, and of a fact reference. */
export const SCOPE_BYTES = 160;
export const FACT_BYTES = SCOPE_BYTES + 128;
/** More than the bytes of one effect record without the values it carries, and of an entry without its effects and its rule's name. */
export const RECORD_BYTES = 128;
export const ENTRY_BYTES = 768;

/** The most bytes a member reference takes: each byte of a handle may be written as a six-byte escape. */
export const memberBytes = (bounds: Bounds): number => SCOPE_BYTES + 64 + 6 * bounds.memberBytes;

/** The most canonical bytes a value of that type takes. */
export function mostBytes(type: FieldType, bounds: Bounds): number {
  switch (type.type) {
    case "text": return 2 + 6 * type.max;
    case "int": return 20;
    case "bool": return 5;
    case "time": return 26;
    case "enum": return Math.max(2, ...type.of.map(stated));
    case "member": return memberBytes(bounds);
    case "item": return 20;
    case "fact": return FACT_BYTES;
    case "scope": return SCOPE_BYTES;
    case "digest": return 73;
    case "commit": case "tree": return 66;
    case "list": return 2 + Math.min(type.max, bounds.listElements) * (1 + mostBytes(type.of, bounds));
    case "record": return unsupported("a record type");
  }
}
