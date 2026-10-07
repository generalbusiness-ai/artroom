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

/**
 * What the founding commit of `platform:destination@2` names in its one
 * file: the repository's name, the founder's handle and the scope ID of the
 * room's directory. None of them is a secret.
 */
export interface Readme { name: string; handle: string; directory: ScopeId }

/** The text of `README.md` in a founding commit of version 2: the repository's name as a heading, and one sentence. */
export const readmeText = (readme: Readme): string => `# ${readme.name}\n\nFounded by ${readme.handle} through the room ${readme.directory}.\n`;

/** A tree of one file, `README.md` or `receipt.json`, with that blob. */
function oneFile(format: ObjectFormat, name: string, blob: DestinationObject): DestinationObject {
  const rawId = Uint8Array.from(blob.id.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  return object(format, "tree", concat(utf8(`100644 ${name}\0`), rawId));
}

/**
 * The parentless founding commit. The time is the destination's genesis
 * entry's. Version 1 (`readme` null): the empty tree. Version 2: a tree of
 * one file, `README.md` (`readmeText`).
 */
export function foundingObjects(format: ObjectFormat, scope: ScopeId, time: Timestamp, claim: FactRef, readme: Readme | null = null): DestinationCommit {
  const blob = readme === null ? null : object(format, "blob", utf8(readmeText(readme)));
  const tree = blob === null ? object(format, "tree", new Uint8Array()) : oneFile(format, "README.md", blob);
  const commit = commitObject(format, scope, time, tree.id, "Found this repository.", "claim", claim);
  return { commit: commit.id, objects: [...(blob === null ? [] : [blob]), tree, commit] };
}

/** The canonical receipt file, its tree and its parentless commit. The time is the entry that opened the receipt item. */
export function receiptObjects(format: ObjectFormat, scope: ScopeId, time: Timestamp, operation: FactRef, receipt: unknown): DestinationCommit {
  const blob = object(format, "blob", utf8(canonicalize(receipt)));
  const tree = oneFile(format, "receipt.json", blob);
  const commit = commitObject(format, scope, time, tree.id, "Receipt.", "operation", operation);
  return { commit: commit.id, objects: [blob, tree, commit] };
}

/** The two public ref names: the fact's entry hash, with no additional domain. */
export const receiptRef = (operation: FactRef): string | null => factRefName("refs/artroom/receipts/", operation.hash);
export const importRef = (claim: FactRef): string | null => factRefName("refs/artroom/import/", claim.hash);
