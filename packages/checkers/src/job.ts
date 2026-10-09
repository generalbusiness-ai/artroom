/**
 * The origin read (authority note, section 3.11, "Origin" and "How a job
 * reaches the checker"). A job is the `request-check` entry of a change
 * lane. The checker service learns of one by a notice, or by reading the
 * lane's jobs. Either is bookkeeping, and **nothing that a notice carries is
 * trusted**. Before it runs anything the service reads the job's entry from
 * the lane itself, through the scope namespace, and checks what follows.
 *
 * `originOf` is that check, as a pure function of what the service read:
 *
 * 1. The entry is the lane's entry at that position: it names that lane,
 *    with its incarnation, and that position, and its bytes hash to the hash
 *    that the lane served with it and to the hash of the fact.
 * 2. It is a `request-check` act: an act whose signed intent verifies, is
 *    addressed to that lane, and has that kind. Its own effects open one
 *    job at its position.
 * 3. The lane's definition is a `change` definition that the repository's
 *    rules scope has activated: the lane pins a digest, and the rules scope
 *    that the service is configured with holds that digest as `active`,
 *    under the name `change`.
 * 4. The tree and the name are what the service was given.
 * 5. The job's manifest is an entry of the same lane that opened a manifest
 *    with that tree. Its integration commit and its base are what the
 *    runner's checkout is held to.
 *
 * "An entry that merely looks like a job, in a lane of another definition,
 * is not run." Each failed check answers with a fixed word, and then
 * nothing is run and nothing is signed.
 *
 * The sixth check of the note, that the configuration bytes hash to the
 * digest in the job, is `readConfiguration` (`configuration.ts`). It is
 * made after this one, and its failure is signed: `check-error`,
 * `configuration-unavailable`.
 */

import type { ReservationSnapshot, Digest, Effect, FactRef, PlatformDefinition, ScopeRef, Sealed, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, utf8, entryHash, isDigest, isEntry, isFactRef, isLocalId, isScopeRef, timeMs, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { idOf, READ_BOUNDS, parseCommit, isObjectId, type ObjectId } from "@generalbusiness/artroom-git";

/** The name that the rules scope holds an activated `change` definition under (section 3.11: "a `change` definition"). */
export const CHANGE = "change";
/** The kind of the act that opens a job, and the item types and slots that its entry and its manifest's entry write (the `change` lane's forms). */
const REQUEST_CHECK = "request-check";

/** What a notice says of a job. Bookkeeping: each member is compared with what the service reads, and none is used. */
export interface Notice { lane: ScopeRef; job: FactRef; name: string; tree: string }

/**
 * What the service read for one notice, by its own reads of the lane and of
 * the rules scope. Each member is as the scope served it.
 *
 * - `entry`: the lane's entry at the job's position. Null: the lane has none.
 * - `pinned`: the definition that the lane pins.
 * - `activated`: the rules scope's item for that digest: its name and its
 *   state. Null: the rules scope holds no such definition.
 * - `manifest`: the lane's entry at the position that the job's entry names
 *   as its manifest. Null: not read, or the lane has none.
 */
export interface OriginRead {
  entry: Sealed | null;
  pinned: Digest | PlatformDefinition | null;
  activated: { name: string; state: string } | null;
  manifest: Sealed | null;
  reservation?: ReservationSnapshot;
}

/** A job, as the service read it from the lane. Every member is from the lane's own entries. */
export interface Job {
  lane: ScopeRef;
  /** The fact of the `request-check` entry: the job's identity. */
  fact: FactRef;
  name: string;
  tree: ObjectId;
  /** The digest of the check's configuration, as the job's entry holds it. */
  configuration: Digest;
  deadline: Timestamp;
  /** The manifest's integration commit and its base, which is that commit's first parent (section 12.2). */
  commit: ObjectId;
  base: ObjectId;
  snapshot?: ReservationSnapshot;
  ref?: string;
  remote?: string;
}

export type NotAJob =
  | "bad-notice" | "no-entry" | "not-this-entry" | "not-a-request-check" | "not-a-change-lane" | "not-activated" | "not-as-given" | "no-manifest" | "reservation-stage-missing" | "reservation-stage-mismatch";

export type Origin = { job: Job } | { not: NotAJob };

const sameScope = (a: ScopeRef, b: ScopeRef): boolean => a.scope === b.scope && a.inc === b.inc && a.kind === b.kind;
const valueOf = (effects: readonly Effect[], item: number, slot: string): unknown => {
  const found = effects.filter((e) => e.effect === "value" && e.item === item && e.slot === slot);
  return found.length === 1 && found[0]!.effect === "value" ? found[0]!.value : undefined;
};
const opens = (effects: readonly Effect[], item: number, type: string): boolean => effects.filter((e) => e.effect === "open").length === 1 && effects.some((e) => e.effect === "open" && e.item === item && e.type === type);
/** The entry as the lane served it, when it is the lane's entry at that position and its bytes hash to the served hash. */
const ownEntry = (sealed: Sealed | null, lane: ScopeRef, seq: number): Sealed["entry"] | null =>
  sealed !== null && isEntry(sealed.entry) && sameScope(sealed.entry.at, lane) && sealed.entry.seq === seq && entryHash(sealed.entry) === sealed.hash ? sealed.entry : null;

export function originOf(notice: Notice, read: OriginRead): Origin {
  const { lane, job: fact } = notice;
  if (!isScopeRef(lane) || lane.kind !== "lane" || !isFactRef(fact) || !sameScope(fact.at, lane) || typeof notice.name !== "string" || !isObjectId(notice.tree)) return { not: "bad-notice" };
  if (read.entry === null) return { not: "no-entry" };
  const entry = ownEntry(read.entry, lane, fact.seq);
  if (!entry || read.entry.hash !== fact.hash) return { not: "not-this-entry" };
  const input = entry.input;
  if (input.type !== "act" || !verifySignedIntent(input.signed) || input.signed.intent.kind !== REQUEST_CHECK || input.signed.intent.to === null || !sameScope(input.signed.intent.to, lane) || !opens(entry.effects, fact.seq, "job")) return { not: "not-a-request-check" };
  if (!isDigest(read.pinned)) return { not: "not-a-change-lane" };
  if (read.activated === null || read.activated.name !== CHANGE) return { not: "not-a-change-lane" };
  if (read.activated.state !== "active") return { not: "not-activated" };
  const [name, tree, configuration, deadline] = ["name", "tree", "configuration", "deadline"].map((slot) => valueOf(entry.effects, fact.seq, slot));
  if (typeof name !== "string" || !isObjectId(tree) || !isDigest(configuration) || timeMs(deadline) === null) return { not: "not-a-request-check" };
  if (name !== notice.name || tree !== notice.tree) return { not: "not-as-given" };
  // The manifest that the job is on: the item that the job's entry names, opened by an entry of this lane, with the job's tree.
  const named = entry.effects.filter((e) => e.effect === "ref" && e.item === fact.seq && e.slot === "manifest");
  const at = named.length === 1 && named[0]!.effect === "ref" ? named[0]!.to : null;
  const manifest = isLocalId(at) ? ownEntry(read.manifest, lane, at) : null;
  if (!manifest || !isLocalId(at) || !opens(manifest.effects, at, "manifest")) return { not: "no-manifest" };
  if (read.reservation) return reservationOrigin(notice, entry, manifest, read.reservation, configuration as Digest, deadline as Timestamp);
  const [commit, base, of] = ["integration", "base", "tree"].map((slot) => valueOf(manifest.effects, at, slot));
  if (!isObjectId(commit) || !isObjectId(base) || of !== tree) return { not: "no-manifest" };
  return { job: { lane, fact, name, tree, configuration, deadline: deadline as Timestamp, commit, base } };
}

/** The position of the manifest that a job's entry names, for the service's second read. Null: the entry names none. */
export function manifestOf(sealed: Sealed | null, job: FactRef): number | null {
  const named = (sealed?.entry?.effects ?? []).filter((e) => e.effect === "ref" && e.item === job.seq && e.slot === "manifest");
  const at = named.length === 1 && named[0]!.effect === "ref" ? named[0]!.to : null;
  return isLocalId(at) ? at : null;
}

function reservationOrigin(notice: Notice, job: Sealed["entry"], manifest: Sealed["entry"], snapshot: ReservationSnapshot, configuration: Digest, deadline: Timestamp): Origin {
  const reservation = ownEntry(snapshot.reservation, snapshot.destination, snapshot.reservation.entry.seq);
  if (!reservation || snapshot.destination.kind !== "destination" || reservation.input.type !== "outcome" || reservation.input.owner !== "platform:destination@3" || reservation.input.kind !== "judge" || reservation.input.result !== "confirmed"
    || entryHash(snapshot.job.entry) !== snapshot.job.hash || snapshot.job.hash !== notice.job.hash || canonicalize(snapshot.job.entry) !== canonicalize(job)
    || entryHash(snapshot.manifest.entry) !== snapshot.manifest.hash || canonicalize(snapshot.manifest.entry) !== canonicalize(manifest)) return { not: "no-manifest" };
  if (!reservation.uses.some((use) => use.fact.hash === snapshot.manifest.hash && sameScope(use.fact.at, notice.lane))) return { not: "no-manifest" };
  const objectIds = new Set<string>();
  let bytes = 0;
  for (const object of snapshot.objects) {
    if (objectIds.has(object.id) || !["blob", "tree", "commit"].includes(object.type) || !(object.data instanceof Uint8Array)) return { not: "no-manifest" };
    const limit = object.type === "blob" ? READ_BOUNDS.blobBytes : object.type === "tree" ? READ_BOUNDS.treeBytes : READ_BOUNDS.commitBytes;
    if (object.data.length > limit || idOf(object.type, object.data) !== object.id) return { not: "no-manifest" };
    objectIds.add(object.id); bytes += object.data.length;
  }
  if (objectIds.size > READ_BOUNDS.closureObjects || bytes > READ_BOUNDS.closureObjects * READ_BOUNDS.blobBytes) return { not: "no-manifest" };
  const integrationObject = snapshot.objects.find((object) => object.id === snapshot.commit && object.type === "commit");
  if (!integrationObject) return { not: "no-manifest" };
  try { const read = parseCommit(integrationObject.data); if (read.tree !== snapshot.tree || read.parents[0] !== snapshot.base) return { not: "no-manifest" }; } catch { return { not: "no-manifest" }; }
  const publication = reservation.effects.find((effect) => effect.effect === "state" && effect.state === "reserved");
  if (publication?.effect !== "state") return { not: "no-manifest" };
  const commit = valueOf(reservation.effects, publication.item, "integration"), tree = valueOf(reservation.effects, publication.item, "tree");
  const base = manifest.input.type === "act" ? manifest.input.signed.intent.fields["base"] : null;
  if (!isObjectId(commit) || !isObjectId(base) || tree !== notice.tree || snapshot.commit !== commit || snapshot.base !== base || snapshot.tree !== tree) return { not: "no-manifest" };
  const files = manifest.input.type === "act" ? manifest.input.signed.intent.fields["files"] : null;
  if (!Array.isArray(files) || files.length === 0 || files.length > 64 || snapshot.sources.length !== files.length) return { not: "no-manifest" };
  for (const row of files) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { not: "no-manifest" };
    const file = row as { entry?: unknown; path?: unknown; digest?: unknown };
    if (!isFactRef(file.entry)) return { not: "no-manifest" };
    const sourceFact = file.entry;
    if (!reservation.uses.some((use) => use.fact.hash === sourceFact.hash && sameScope(use.fact.at, sourceFact.at))) return { not: "no-manifest" };
    const source = snapshot.sources.find((source) => source.hash === sourceFact.hash);
    if (!source || !sameScope(source.entry.at, notice.lane) || source.entry.seq !== file.entry.seq || entryHash(source.entry) !== source.hash || source.entry.input.type !== "act" || !verifySignedIntent(source.entry.input.signed) || source.entry.input.signed.intent.kind !== "propose-file") return { not: "no-manifest" };
    const fields = source.entry.input.signed.intent.fields;
    if (fields["base"] !== base || fields["path"] !== file.path || fields["digest"] !== file.digest || typeof fields["content"] !== "string") return { not: "no-manifest" };
    const bytes = utf8(fields["content"]);
    if (bytes.length !== fields["size"] || digestBytes(bytes) !== file.digest) return { not: "no-manifest" };
  }
  return { job: { lane: notice.lane, fact: notice.job, name: notice.name, tree: notice.tree, configuration, deadline, commit, base, snapshot, ref: snapshot.ref, remote: snapshot.remote } };
}
