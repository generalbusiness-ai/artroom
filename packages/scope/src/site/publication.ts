/** Public Site selection reads current names and native immutable publication proof.
 * There is one published branch in today's destination model and no tag registry.
 * These reads do not start dispatchers, operations, sessions or provider calls.
 */
import type { Head, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, isScopeRef } from "@generalbusiness/artroom-bytes";
import { isOf, destinationReceipt, foundingOf } from "@generalbusiness/artroom-platform";
import { isObjectId, refName } from "@generalbusiness/artroom-git";
import type { DestinationRepository } from "../destination-host.ts";

export interface Publication {
  at: ScopeRef;
  head: Head;
  refs: readonly { ref: string; target: string }[];
}

/** A confirmed directory's destination reference, from its folded record. */
export function siteDestination(store: import("../sqlite.ts").SqliteStore, definition: string | undefined): ScopeRef | null {
  const scopeSize = store.scopeBytes();
  if (scopeSize !== null && scopeSize > 1024 * 1024) throw new Error("publication-history-limit");
  const scope = store.scope();
  if (scope?.status !== "active" || !isOf(definition, "platform:directory")) return null;
  const positions = store.itemPositions("repository", null, 2);
  if (positions.length !== 1) return null;
  if (positions[0]!.size > 1024 * 1024) throw new Error("publication-history-limit");
  const repository = store.item(positions[0]!.id);
  const destination = repository?.refs["destination"];
  return isScopeRef(destination) && destination.kind === "destination" ? destination : null;
}

/** A confirmed destination's exact branch head, bound to the asking directory and repository. */
export function sitePublication(store: import("../sqlite.ts").SqliteStore, definition: string | undefined, directory: unknown, repository: unknown): Publication | null {
  const scopeSize = store.scopeBytes();
  if (scopeSize !== null && scopeSize > 1024 * 1024) throw new Error("publication-history-limit");
  const scope = store.scope();
  if (scope?.status !== "active" || !isOf(definition, "platform:destination") || !isScopeRef(directory)) return null;
  const positions = store.itemPositions("branch", null, 2);
  if (positions.length !== 1) return null;
  if (positions[0]!.size > 1024 * 1024) throw new Error("publication-history-limit");
  const branch = store.item(positions[0]!.id);
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
  sitePublishedCommit(directory: ScopeRef, repository: DestinationRepository, commit: string): Promise<PublishedCommitSelection>;
}

/** Finite work and allocation allowance for the internal native proof read. */
export const PUBLICATION_PROOF_BOUNDS = { pages: 16, pageItems: 16, items: 256, entries: 16, historyEntries: 4096, historyBytes: 16 * 1024 * 1024, bytes: 1024 * 1024 } as const;
export interface PublishedCommitProof {
  at: ScopeRef;
  head: Head;
  directory: ScopeRef;
  repository: DestinationRepository;
  commit: string;
  publication: import("@generalbusiness/artroom-contract").FactRef;
  written: import("@generalbusiness/artroom-contract").FactRef;
  receipt: { ref: string; commit: string; tree: string; blob: string; file: string };
}
export type PublishedCommitSelection = { ok: true; proof: PublishedCommitProof } | { ok: false; reason: "not-published" | "publication-history-limit" };

/** A storage-only projection: authority comes from judged native publication,
 * never imported ancestry or the provider's refs. Size probes precede payload reads. */
export function sitePublishedCommit(store: import("../sqlite.ts").SqliteStore, definition: string | undefined, directory: unknown, repository: unknown, commit: unknown): PublishedCommitSelection {
  const absent = { ok: false, reason: "not-published" } as const;
  if (!isObjectId(commit) || commit.length !== 40) return absent;
  let bytes = 0, entries = 0, items = 0;
  const exceed = () => { throw new Error("publication-history-limit"); };
  const take = (size: number | null) => {
    if (size === null) return false;
    if (!Number.isSafeInteger(size) || size < 0 || bytes + size > PUBLICATION_PROOF_BOUNDS.bytes) exceed();
    bytes += size; return true;
  };
  const item = (id: number) => {
    if (++items > PUBLICATION_PROOF_BOUNDS.items) exceed();
    return take(store.itemBytes(id)) ? store.item(id) : null;
  };
  let current: Publication;
  const own = (seq: number) => {
    if (++entries > PUBLICATION_PROOF_BOUNDS.entries) exceed();
    if (!take(store.storedBytes(seq))) return null;
    const row = store.stored(seq);
    if (!row) return null;
    const entry = JSON.parse(row.bytes) as import("@generalbusiness/artroom-contract").Entry;
    if (entry.seq !== seq || canonicalize(entry.at) !== canonicalize(current.at) || entryHash(entry) !== row.hash) return null;
    return { entry, hash: row.hash };
  };
  let after: number | null = null;
  try {
    if (!take(store.scopeBytes())) return absent;
    const scope = store.scope();
    if ((scope && scope.head.seq >= PUBLICATION_PROOF_BOUNDS.historyEntries) || store.storedTotalBytes(PUBLICATION_PROOF_BOUNDS.historyEntries) > PUBLICATION_PROOF_BOUNDS.historyBytes) exceed();
    if (scope?.status !== "active" || !isOf(definition, "platform:destination") || !isScopeRef(directory)) return absent;
    const branchPositions = store.itemPositions("branch", null, 2);
    if (branchPositions.length !== 1) return absent;
    const branch = item(branchPositions[0]!.id);
    if (!branch || branch.state !== "ready" || canonicalize(branch.refs["directory"]) !== canonicalize(directory)
      || canonicalize(branch.values["repository"]) !== canonicalize(repository)) return absent;
    current = { at: scope.at, head: scope.head, refs: [] };
    const state = { item, page: (..._args: unknown[]) => ({ items: [branch], more: false }) };
    for (let page = 0; page < PUBLICATION_PROOF_BOUNDS.pages; page++) {
      const positions = store.itemPositions("receipt", after, PUBLICATION_PROOF_BOUNDS.pageItems + 1);
      for (const position of positions.slice(0, PUBLICATION_PROOF_BOUNDS.pageItems)) {
        if (++items > PUBLICATION_PROOF_BOUNDS.items || !take(position.size)) exceed();
        const receipt = store.item(position.id);
        after = position.id;
        if (receipt?.state !== "written" || receipt.values["commit"] !== commit) continue;
        const opening = own(receipt.id);
        if (!opening || !opening.entry.effects.some(e => e.effect === "open" && e.item === receipt.id && e.type === "receipt")
          || !opening.entry.effects.some(e => e.effect === "value" && e.item === receipt.id && e.slot === "commit" && e.value === commit)) continue;
        let judged = opening;
        const publicationId = receipt.refs["publication"];
        if (typeof publicationId === "number") {
          const published = item(publicationId);
          if (published?.type !== "publication" || published.state !== "published" || published.values["integration"] !== commit
            || !opening.entry.effects.some(e => e.effect === "state" && e.item === publicationId && e.state === "published")) continue;
          const reservedAt = published.values["reservedAt"];
          if (typeof reservedAt !== "number") continue;
          const reservation = own(reservedAt);
          if (!reservation || reservation.entry.input.type !== "outcome" || reservation.entry.input.kind !== "judge"
            || !reservation.entry.effects.some(e => e.effect === "state" && e.item === publicationId && e.state === "reserved")) continue;
          judged = reservation;
        } else {
          // An imported first head is not a native founding publication.
          if (!branch || branch.values["import"] !== false || foundingOf(state, own, "sha1").commit !== commit
            || !opening.entry.effects.some(e => e.effect === "state" && e.item === branch.id && e.state === "ready")) continue;
        }
        const writtenPositions = store.statePositions(receipt.id, "written", receipt.id, PUBLICATION_PROOF_BOUNDS.historyEntries, 2);
        if (writtenPositions.length !== 1) continue;
        const written = own(writtenPositions[0]!.seq);
        if (!written || !written.entry.effects.some(e => e.effect === "state" && e.item === receipt.id && e.state === "written")) continue;
        const expected = destinationReceipt(state, own, receipt, "sha1");
        const tree = expected.objects.find(o => o.kind === "tree")?.id;
        const blob = expected.objects.find(o => o.kind === "blob")?.id;
        if (!tree || !blob) continue;
        return { ok: true, proof: { at: current.at, head: current.head, directory, repository: repository as DestinationRepository, commit,
          publication: { at: judged.entry.at, seq: judged.entry.seq, hash: judged.hash },
          written: { at: written.entry.at, seq: written.entry.seq, hash: written.hash },
          receipt: { ref: expected.ref, commit: expected.commit, tree, blob, file: canonicalize(expected.file) } } };
      }
      if (positions.length <= PUBLICATION_PROOF_BOUNDS.pageItems) return absent;
    }
    return { ok: false, reason: "publication-history-limit" };
  } catch (error) {
    if (error instanceof Error && error.message === "publication-history-limit") return { ok: false, reason: "publication-history-limit" };
    throw error;
  }
}
