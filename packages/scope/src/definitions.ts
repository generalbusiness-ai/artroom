/**
 * The definitions a scope retains for its children (scope contract, sections
 * 5.1, 6.1, 7.2 and 9.2). No registry holds a declaration. A declaration is
 * immutable bytes named by their digest, and the scope that may create a
 * child under it retains those bytes:
 *
 * - A scope retains its own declaration, and the declaration of every
 *   definition its own names in a `create` send, and of every definition
 *   those name in turn. They are supplied when a directory is founded, and
 *   read from the creator when a child is created.
 * - A child, before its genesis turn, reads the declaration its seed names
 *   from its creator, by digest, and checks the digest.
 *
 * So a creator can always supply what its children need, for as long as its
 * history is retained.
 */

import type { DeclaredDefinition, Digest } from "@generalbusiness/artroom-contract";
import { byteOrder } from "@generalbusiness/artroom-derive";
import { canonicalize, isDigest, parseStrict } from "@generalbusiness/artroom-bytes";
import type { ValidDefinition } from "@generalbusiness/artroom-derive";
import type { DefinitionRead } from "./ports.ts";
import type { Retained } from "./store.ts";

/** The digests a declaration names in its `create` sends, once each, in byte order. A platform definition is supplied in code and is not among them. */
export function creates(declared: DeclaredDefinition): Digest[] {
  const named = new Set<Digest>();
  for (const from of [...Object.values(declared.acts), ...Object.values(declared.receives)]) {
    for (const send of from.sends) if ("create" in send && isDigest(send.create.definition)) named.add(send.create.definition);
  }
  return [...named].sort(byteOrder);
}

/**
 * What a scope under `root` retains for its children: the declaration of
 * each definition that `root` names in a `create` send, and that those name
 * in turn, as `read` supplies them.
 *
 * - `absent`: the supplier does not hold it. It is left out, and a creation
 *   under it waits (`dependency-unavailable`).
 * - Bytes that are not a valid declaration with that digest:
 *   `unsupported-definition`. Nothing is retained.
 * - Bytes that cannot be read now: `unavailable`. Nothing is retained.
 * - More than `limit` definitions named: `unsupported-definition`.
 */
export async function namedBy(root: ValidDefinition, read: (digest: Digest) => Promise<DefinitionRead>, validate: (bytes: string) => ValidDefinition | null, limit: number):
  Promise<{ ok: true; retain: Retained[] } | { ok: false; reason: "unsupported-definition" | "unavailable" }> {
  const retain: Retained[] = [];
  const asked = new Set<Digest>([root.digest]);
  const queue = creates(root.declared);
  for (let digest = queue.shift(); digest !== undefined; digest = queue.shift()) {
    if (asked.has(digest)) continue;
    if (asked.size > limit) return { ok: false, reason: "unsupported-definition" };
    asked.add(digest);
    const found = await read(digest);
    if (!found.ok) {
      if (found.reason === "unavailable") return { ok: false, reason: "unavailable" };
      continue;
    }
    const valid = validate(found.bytes);
    if (valid?.digest !== digest) return { ok: false, reason: "unsupported-definition" };
    // The retained bytes are the canonical bytes, whose digest in the definition domain is the name.
    retain.push({ kind: "definition", digest, bytes: canonicalize(parseStrict(found.bytes)) });
    queue.push(...creates(valid.declared));
  }
  return { ok: true, retain };
}
