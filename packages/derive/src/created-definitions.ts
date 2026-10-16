/** Native static create-definition edges, shared by founding and archive closure. */
import type { DeclaredDefinition, Digest } from "@generalbusiness/dap-contract";
import { isDigest } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "./values.ts";

/** The digests a declaration names in its `create` sends, once each, in byte order. A platform definition is supplied in code and is not among them. */
export function creates(declared: DeclaredDefinition): Digest[] {
  const named = new Set<Digest>();
  for (const from of [...Object.values(declared.acts), ...Object.values(declared.receives)]) {
    for (const send of from.sends) if ("create" in send && isDigest(send.create.definition)) named.add(send.create.definition);
  }
  return [...named].sort(byteOrder);
}
