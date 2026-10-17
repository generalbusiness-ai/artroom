/**
 * The inventory: which scopes the server lists acts for, and the caller's
 * standing on each membership they use (plan 031, section 6). It is durable
 * and configured, never a memory of a connection:
 *
 * - the repository of the configuration, when there is one: its register,
 *   directory, membership, rules scope, destination and the caller's inbox,
 *   every lane the directory lists, and every application the directory's
 *   application factory created (an `application` item in state `created`
 *   whose `scope` is set), each under the directory's membership;
 * - the configuration's standalone roots: `{ scope, membership }` entries,
 *   each a scope outside the repository and the membership scope that
 *   standing for it is read from. A root that is also one of the
 *   directory's applications is held once, as the application.
 *
 * Reads: the membership, directory and rules summaries, one summary per
 * root and per further membership. A scope's pinned definition never
 * changes, and a definition's bytes never change for a digest, so each is
 * read once per process and kept by scope and by digest.
 */

import type { DeclaredDefinition, Digest, Head, Item, PlatformDefinition, Read, ScopeId, ScopeRef, Summary } from "@generalbusiness/dap-contract";
import { definitionDigest, isDigest, isPlatformDefinition, parseStrict } from "@generalbusiness/artroom-bytes";
import { ROLE_LISTS, SIBLINGS_OF, platform, type Role } from "@generalbusiness/dap-platform";
import { ScopeHandle, partitionIndexes } from "@generalbusiness/artroom-client";
import type { Held, Inventory, Place, Standing } from "./catalogue.ts";
import type { DefinitionLike } from "./describe.ts";
import type { Reads } from "./reads.ts";

/** What the server reads of the configuration. The command line's `config.json` holds these members, and more. */
export interface McpConfig {
  /** The scope service; empty for a configuration that has joined nothing yet. */
  service: string;
  handle?: string;
  register?: ScopeRef;
  repository?: { directory: ScopeRef; membership: ScopeRef; rules: ScopeId; destination: ScopeId; inbox?: ScopeId };
  roots?: readonly Root[];
  /**
   * The pinned definitions of scopes the caller cannot read yet, by scope ID, as an invitation link records membership's
   * version: a key that is no member's reads nothing before it joins, and its list still offers `room.join`.
   */
  pins?: Readonly<Record<string, Digest | PlatformDefinition>>;
}
export interface Root { scope: ScopeId; membership: ScopeRef | null }

/** The configuration, as the command line owns it: read on each list, and a root appended after an accepted `create`. */
export interface ConfigPort {
  read(): Promise<McpConfig>;
  addRoot(root: Root): Promise<void>;
  /** Record the repository that the caller's own claim created, or the caller's inbox, as `dap create` and `join` record them. */
  setRepository?(repository: NonNullable<McpConfig["repository"]>): Promise<void>;
  /** Record a room the caller joined, as `dap join` records it: the service, the repository's scopes with the inbox, and the handle. */
  joined?(room: { service: string; repository: NonNullable<McpConfig["repository"]>; handle: string }): Promise<void>;
}

/** What the process keeps, none of it authority: pins by scope and definitions by digest, which never change. */
export class Kept {
  readonly pins = new Map<ScopeId, { ref: ScopeRef; pinned: Digest | PlatformDefinition }>();
  readonly definitions = new Map<string, DeclaredDefinition>();
}

/** The heads last read of the scopes whose change could change the list: the signal to recompute, never part of the generation. */
export type Heads = Record<string, string>;

export interface Read_ {
  inventory: Inventory;
  heads: Heads;
  /** Scopes that could not be read, and why. */
  unread: { scope: string; reason: string }[];
  /** The repository's references as read, for resolving a target. */
  room: Room | null;
}

/** The repository's scopes, with full references where a read gave them. */
export interface Room {
  register: ScopeRef | null;
  directory: ScopeRef;
  membership: ScopeRef;
  rules: ScopeRef | null;
  destination: ScopeRef | null;
  inbox: ScopeRef | null;
  /** The directory's lane rows: number, kind, title, state and the lane's reference. */
  lanes: { ref: ScopeRef; number: number | null; kind: string | null; title: string | null; state: string | null }[];
  /** The directory's application rows: the definition's digest, the item's state, and the created scope once it is set. */
  applications: { digest: string | null; state: string; ref: ScopeRef | null }[];
  membershipItems: readonly Item[];
  directoryHead: Head;
}

const headText = (at: Head): string => `${at.seq}:${at.hash}`;
export const readPartitionIndexes = (reads: Reads, root: ScopeRef, membership: ScopeRef) => partitionIndexes({
  summary: scope => reads.read(membership, (transport, reader) => transport.summary(scope, reader)),
  query: (scope, query) => reads.read(membership, (transport, reader) => new ScopeHandle(transport, scope, reader).queryItems(query)),
}, root, membership);
const isRef = (v: unknown): v is ScopeRef => typeof v === "object" && v !== null && typeof (v as ScopeRef).scope === "string" && typeof (v as ScopeRef).inc === "string";

/** The caller's standing in a membership summary: the role of the active member whose active key signs here, and that role's actions. */
export function standingIn(items: readonly Item[], key: string): Standing {
  const own = items.find((item) => item.type === "key" && item.state === "active" && item.values["id"] === key);
  const member = own && items.find((item) => item.type === "member" && item.id === own.refs["member"] && item.state === "active");
  const roster = items.find((item) => item.type === "roster");
  const role = member?.values["role"] as Role | undefined;
  if (!member || !roster || !role || !Object.hasOwn(ROLE_LISTS, role)) return { known: true, role: null, actions: [], handle: null, key };
  return { known: true, role, actions: (roster.values[ROLE_LISTS[role]] as readonly string[] | null) ?? [], handle: String(member.values["handle"]), key };
}

/** A definition by its pinned name or digest: the platform's, or one kept, or read once from a scope that retains it. */
export async function definitionOf(reads: Reads, kept: Kept, pinned: Digest | PlatformDefinition, from: { scope: ScopeId; membership: ScopeRef | null }[]): Promise<DefinitionLike | null> {
  if (isPlatformDefinition(pinned)) return (platform(pinned)?.data as unknown as DefinitionLike | undefined) ?? null;
  const known = kept.definitions.get(pinned);
  if (known) return known as unknown as DefinitionLike;
  for (const source of from) {
    const read = await reads.read(source.membership, (t, r) => t.retained(source.scope, r, "definition", pinned));
    if (!read.ok) continue;
    try {
      const declared = parseStrict(read.value.bytes) as DeclaredDefinition;
      if (definitionDigest(declared) !== pinned) continue;
      kept.definitions.set(pinned, declared);
      return declared as unknown as DefinitionLike;
    } catch { /* not that definition */ }
  }
  return null;
}

/** A scope's reference and pinned definition: kept, or read once from its summary. */
async function pinOf(reads: Reads, kept: Kept, scope: ScopeId, membership: ScopeRef | null, summary?: Summary): Promise<{ ref: ScopeRef; pinned: Digest | PlatformDefinition } | { unread: string }> {
  const known = kept.pins.get(scope);
  if (known) return known;
  let s = summary;
  if (!s) {
    const read = await reads.read(membership, (t, r) => t.summary(scope, r));
    if (!read.ok) return { unread: read.reason };
    s = read.value;
  }
  const pin = { ref: s.scope, pinned: s.definition };
  kept.pins.set(scope, pin);
  return pin;
}

/** Reads the inventory once. Each failure leaves that scope out and is reported in `unread`; a failure of membership leaves standing unknown. */
export async function readInventory(reads: Reads, kept: Kept, config: McpConfig): Promise<Read_> {
  const scopes: Held[] = [];
  const unread: { scope: string; reason: string }[] = [];
  const heads: Heads = {};
  const standing: Record<string, Standing> = {};
  let active: { name: string; digest: string }[] = [];
  let room: Room | null = null;
  const key = reads.signer.key;

  const hold = async (place: Place, scope: ScopeId, membership: ScopeRef | null, summary?: Summary, lane?: Held["lane"]): Promise<void> => {
    const pin = await pinOf(reads, kept, scope, membership, summary);
    if ("unread" in pin) { unread.push({ scope, reason: pin.unread }); return; }
    const sources = [{ scope, membership }, ...(room?.rules ? [{ scope: room.rules.scope, membership: room.membership }] : [])];
    const definition = await definitionOf(reads, kept, pin.pinned, sources);
    if (!definition) { unread.push({ scope, reason: "definition-unavailable" }); return; }
    scopes.push({ scope, ref: pin.ref, place, pinned: pin.pinned, definition, membership: membership?.scope ?? null, ...(lane ? { lane } : {}) });
  };
  const summaryOf = async (scope: ScopeId, membership: ScopeRef | null): Promise<Read<Summary>> => reads.read(membership, (t, r) => t.summary(scope, r));

  const repository = config.repository;
  if (repository) {
    const M = repository.membership;
    const pinned = config.pins?.[M.scope];
    if (pinned && !kept.pins.has(M.scope)) kept.pins.set(M.scope, { ref: M, pinned });
    const [membershipRead, directoryRead, rulesRead] = [await summaryOf(M.scope, M), await summaryOf(repository.directory.scope, M), await summaryOf(repository.rules, M)];
    if (membershipRead.ok) {
      heads[M.scope] = headText(membershipRead.at);
      standing[M.scope] = standingIn(membershipRead.value.items, key);
    } else {
      standing[M.scope] = { known: false, reason: membershipRead.reason };
      unread.push({ scope: M.scope, reason: membershipRead.reason });
    }
    if (rulesRead.ok) {
      heads[repository.rules] = headText(rulesRead.at);
      active = rulesRead.value.items.filter((item) => item.type === "definition" && item.state === "active")
        .map((item) => ({ name: String(item.values["name"]), digest: String(item.values["digest"]) }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.digest < b.digest ? -1 : 1));
    } else unread.push({ scope: repository.rules, reason: rulesRead.reason });
    if (directoryRead.ok) {
      heads[repository.directory.scope] = headText(directoryRead.at);
      const d = directoryRead.value;
      const repo = d.items.find((item) => item.type === "repository");
      const ref = (name: string): ScopeRef | null => (isRef(repo?.refs[name]) ? repo!.refs[name] as ScopeRef : null);
      let rows = d.items;
      if (d.definition === "platform:directory@10") {
        const coverage = await readPartitionIndexes(reads, repository.directory, M);
        if (!coverage.complete) unread.push({ scope: repository.directory.scope, reason: `directory-index-incomplete:${coverage.reason}` });
        rows = coverage.indexes.flatMap(index => [...index.lanes, ...index.applications]);
        for (const index of coverage.indexes) {
          heads[index.ref.scope] = headText(index.at);
          // Partition tools are addressed by scope. They never replace the
          // Root's singleton directory name or its stable room reference.
          await hold("partition", index.ref.scope, M, index.summary);
        }
      }
      const lanes = rows.filter((item) => item.type === "lane" && isRef(item.refs["scope"])).sort((a, b) => Number(a.values["number"] ?? a.id) - Number(b.values["number"] ?? b.id)).map((item) => ({
        ref: item.refs["scope"] as ScopeRef,
        number: typeof item.values["number"] === "number" ? item.values["number"] : null,
        kind: typeof item.values["kind"] === "string" ? item.values["kind"] : null,
        title: typeof item.values["title"] === "string" ? item.values["title"] : null,
        state: typeof item.values["state"] === "string" ? item.values["state"] : null,
      }));
      const applications = rows.filter((item) => item.type === "application").sort((a, b) => a.id - b.id).map((item) => ({
        digest: typeof item.values["definition"] === "string" ? item.values["definition"] : null,
        state: item.state,
        ref: isRef(item.refs["scope"]) ? item.refs["scope"] as ScopeRef : null,
      }));
      room = {
        register: ref("register") ?? config.register ?? null, directory: d.scope, membership: M,
        rules: ref("rules") ?? (rulesRead.ok ? rulesRead.value.scope : null), destination: ref("destination"), inbox: null, lanes, applications,
        membershipItems: membershipRead.ok ? membershipRead.value.items : [], directoryHead: directoryRead.at,
      };
      await hold("directory", d.scope.scope, M, d);
      if (membershipRead.ok) await hold("membership", M.scope, M, membershipRead.value);
      if (rulesRead.ok) await hold("rules", repository.rules, M, rulesRead.value);
      // The destination's pin follows from the directory's: the directory's version creates exactly that sibling.
      const siblings = SIBLINGS_OF[d.definition];
      if (room.destination && siblings && !kept.pins.has(room.destination.scope)) kept.pins.set(room.destination.scope, { ref: room.destination, pinned: siblings.destination });
      if (room.destination) await hold("destination", room.destination.scope, M);
      if (room.register) await hold("register", room.register.scope, M);
      if (repository.inbox) {
        await hold("inbox", repository.inbox, M);
        room.inbox = kept.pins.get(repository.inbox)?.ref ?? null;
      }
      for (const lane of lanes) await hold("lane", lane.ref.scope, M, undefined, { number: lane.number, kind: lane.kind, title: lane.title, state: lane.state });
      // An application is held as a lane is, under the directory's membership, once it is created and its scope is known.
      for (const application of applications) if (application.state === "created" && application.ref) await hold("application", application.ref.scope, M);
    } else {
      unread.push({ scope: repository.directory.scope, reason: directoryRead.reason });
      // Nothing of the room is readable yet: membership is held by the pin the configuration records, so its acts that a rule
      // decides, such as join, are listed.
      if (kept.pins.has(M.scope)) await hold("membership", M.scope, M);
    }
  } else if (config.register) {
    await hold("register", config.register.scope, null);
  }

  const applicationScopes = new Set(scopes.filter((s) => s.place === "application").map((s) => s.scope));
  for (const root of config.roots ?? []) {
    if (applicationScopes.has(root.scope)) continue;
    const read = await summaryOf(root.scope, root.membership);
    if (!read.ok) { unread.push({ scope: root.scope, reason: read.reason }); continue; }
    heads[root.scope] = headText(read.at);
    await hold("root", root.scope, root.membership, read.value);
    if (root.membership && standing[root.membership.scope] === undefined) {
      const m = await summaryOf(root.membership.scope, root.membership);
      standing[root.membership.scope] = m.ok ? standingIn(m.value.items, key) : { known: false, reason: m.reason };
      if (m.ok) heads[root.membership.scope] = headText(m.at);
    }
  }

  // Each scope is held once, even when the configuration names it twice.
  const seen = new Set<string>();
  const unique = scopes.filter((s) => (seen.has(s.scope) ? false : (seen.add(s.scope), true)));
  return { inventory: { scopes: unique, standing, roots: config.roots ?? [], active }, heads, unread, room };
}

export const isDeclaredDigest = (v: unknown): v is Digest => isDigest(v);
