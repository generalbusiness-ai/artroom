/**
 * The founding commit and a receipt's commit, byte for byte (authority
 * revision 28, section 12.1.5). Pure: the port gives the repository's
 * object format before writing; the destination's rule reads it from a
 * commit ID in `seen` before comparing. A caller supplies only verified
 * facts: the scope's own history, or facts retained in its entries.
 */

import type { FactRef, ScopeId, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefName, factText, hex, sha1, sha256, timeMs, utf8 } from "@generalbusiness/artroom-bytes";

export type ObjectFormat = "sha1" | "sha256";
export interface DestinationObject { kind: "blob" | "tree" | "commit"; body: Uint8Array; id: string }
export interface DestinationCommit { commit: string; objects: readonly DestinationObject[] }

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  return bytes;
};

const object = (format: ObjectFormat, kind: DestinationObject["kind"], body: Uint8Array): DestinationObject => ({
  kind, body, id: hex((format === "sha1" ? sha1 : sha256)(concat(utf8(`${kind} ${body.length}\0`), body))),
});

function commitObject(format: ObjectFormat, scope: ScopeId, time: Timestamp, tree: string, sentence: string, word: string, fact: FactRef): DestinationObject {
  const [millis, text] = [timeMs(time), factText(fact)];
  if (millis === null || text === null) throw new Error("a destination commit needs its recorded time and a verified fact reference");
  const identity = `artroom <${scope}@artroom.invalid> ${Math.floor(millis / 1000)} +0000`;
  return object(format, "commit", utf8(`tree ${tree}\nauthor ${identity}\ncommitter ${identity}\n\n${sentence}\n\n${word} ${text}\n`));
}

/** The empty tree and the parentless founding commit. The time is the destination's genesis entry's. */
export function foundingObjects(format: ObjectFormat, scope: ScopeId, time: Timestamp, claim: FactRef): DestinationCommit {
  const tree = object(format, "tree", new Uint8Array());
  const commit = commitObject(format, scope, time, tree.id, "Found this repository.", "claim", claim);
  return { commit: commit.id, objects: [tree, commit] };
}

/** The canonical receipt file, its tree and its parentless commit. The time is the entry that opened the receipt item. */
export function receiptObjects(format: ObjectFormat, scope: ScopeId, time: Timestamp, operation: FactRef, receipt: unknown): DestinationCommit {
  const blob = object(format, "blob", utf8(canonicalize(receipt)));
  const rawId = Uint8Array.from(blob.id.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  const tree = object(format, "tree", concat(utf8("100644 receipt.json\0"), rawId));
  const commit = commitObject(format, scope, time, tree.id, "Receipt.", "operation", operation);
  return { commit: commit.id, objects: [blob, tree, commit] };
}

/** The two public ref names: the fact's entry hash, with no additional domain. */
export const receiptRef = (operation: FactRef): string | null => factRefName("refs/artroom/receipts/", operation.hash);
export const importRef = (claim: FactRef): string | null => factRefName("refs/artroom/import/", claim.hash);
