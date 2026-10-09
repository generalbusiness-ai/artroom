/** Public Site selection reads only the room's current publication record.
 * There is one published branch in today's destination model and no tag registry.
 * These reads do not start dispatchers, operations, sessions or provider calls.
 */
import type { Head, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, isScopeRef } from "@generalbusiness/artroom-bytes";
import { isOf, destinationBranch } from "@generalbusiness/artroom-platform";
import { isObjectId, refName } from "@generalbusiness/artroom-git";
import type { Store } from "../store.ts";
import type { DestinationRepository } from "../destination-host.ts";

export interface Publication {
  at: ScopeRef;
  head: Head;
  refs: readonly { ref: string; target: string }[];
}

/** A confirmed directory's destination reference, from its folded record. */
export function siteDestination(store: Store, definition: string | undefined): ScopeRef | null {
  const scope = store.scope();
  if (scope?.status !== "active" || !isOf(definition, "platform:directory")) return null;
  const repository = store.page("repository", ["open"], null, 1).items[0];
  const destination = repository?.refs["destination"];
  return isScopeRef(destination) && destination.kind === "destination" ? destination : null;
}

/** A confirmed destination's exact branch head, bound to the asking directory and repository. */
export function sitePublication(store: Store, definition: string | undefined, directory: unknown, repository: unknown): Publication | null {
  const scope = store.scope();
  if (scope?.status !== "active" || !isOf(definition, "platform:destination") || !isScopeRef(directory)) return null;
  const branch = destinationBranch(store);
  if (!branch || canonicalize(branch.refs["directory"]) !== canonicalize(directory) || canonicalize(branch.values["repository"]) !== canonicalize(repository)) return null;
  const name = branch.values["name"];
  const target = branch.values["head"];
  if (typeof name !== "string") return null;
  const ref = `refs/heads/${name}`;
  try { refName(ref, "published site branch"); } catch { return null; }
  return { at: scope.at, head: scope.head, refs: isObjectId(target) ? [{ ref, target }] : [] };
}

export interface SitePublicationPeer {
  siteDestination(): Promise<ScopeRef | null>;
  sitePublication(directory: ScopeRef, repository: DestinationRepository): Promise<Publication | null>;
}
