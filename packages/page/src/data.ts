/**
 * The page's data functions: what it reads from a room and the one thing it
 * writes, a signed act. Each takes a `Session`, the scope service's base URL
 * and a 32-byte Ed25519 secret, and goes over the service's HTTP routes
 * through the client's transport. The view (`view.ts`) only shows what these
 * return, and a test calls them without a browser.
 *
 * The page judges nothing. What the caller may sign is listed from the
 * definition and the caller's role in membership, as `artroom acts` lists it
 * (`heldActs` of the command line). Whether an act takes effect is the
 * scope's answer, and a refusal is shown with its reason; it writes nothing,
 * and `act` reads the head before and after to show that.
 *
 * | Function | Reads |
 * |---|---|
 * | `placeOf` | Nothing: the room's directory and membership, from an invitation link or the command line's config file. |
 * | `joinRoom` | Signs membership's `join` with an invitation link, which enrols the page's key. |
 * | `openRoom` | A read session from membership; the directory's repository item, for the rules scope and the destination; the caller's standing in membership. |
 * | `listLanes` | The directory's index rows, one for each lane, with each lane's own state. |
 * | `loadIssue` | An issue lane: its intent, assignees, state and comments. |
 * | `loadChange` | A change lane: its proposal, versions (a one-file version's path, digest and size), reviews by extent, review requests, checks, links and merges, the rules it holds, and for each merge the destination's publication and its outside operations. |
 * | `loadRules` | The rules scope: the rules of the room, the active definitions, and which members may change the rules. |
 * | `loadSite` | One page of the room's published site, as the site route answers it. |
 * | `actsOn` | The acts of a scope's definition that the caller may sign now. |
 * | `act` | Signs and sends one act, with a definition's bytes beside it where a field states their place, and reads the head before and after. |
 *
 * **Who reads.** Every read presents a read session that membership
 * issued to the caller's key, renewed when it has ended. Where membership
 * refuses one (a key that is no active member's, or a deployment with no
 * session secret), each read the client can sign goes as a signed read by
 * the caller's key, and the scope decides: it answers only where that key
 * signed an entry within the window of an intent. A read that is refused
 * is shown as its reason.
 */

import type { Answer, DeclaredDefinition, Digest, Entry, FactRef, FieldValue, Head, Item, KeyId, MemberRef, ScopeId, ScopeRef, Summary, Read } from "@generalbusiness/artroom-contract";
import { LATE, b64url, isScopeId, isScopeRef as fullScopeRef, keyIdOfSecret, takeBytes, timeOf } from "@generalbusiness/artroom-bytes";
import {
  ScopeHandle, declaredHandle, httpTransport, requestSession, secretSigner, sessionRequest, signedIntent, signedReads, type Fetch, type Session as ReadSession, type Signing, type Transport,
} from "@generalbusiness/artroom-client";
import { LINK, describe, expectedOf, heldActs, linkOf, standing, valueOf, type ActShape, type DefinitionShape, type Standing } from "@generalbusiness/artroom-cli";
import { DEFINITION_DOMAIN, ROLE_LISTS, platform, type Role } from "@generalbusiness/artroom-platform";

/** Who is reading and signing, and where. `fetch` and `now` replace the runtime's, as a test does. */
export interface Session {
  service: string;
  secret: Uint8Array;
  fetch?: Fetch;
  /** The clock that intents and reads are signed by, in milliseconds. */
  now?: () => number;
}

/**
 * Where a room is: its directory, and its membership scope with the
 * incarnation that a session request names. A key that is not yet a
 * member reads neither, so the page is told both: by an invitation link,
 * or by the command line's config file.
 */
export interface Place { directory: ScopeId; membership: ScopeRef }

/** A room as the page has opened it: the four scopes it reads, and the caller's key and standing. */
export interface Room {
  session: Session;
  directory: ScopeId;
  membership: ScopeRef;
  rules: ScopeId;
  destination: ScopeId;
  /** The repository name already recorded by the directory; no claimed display name is inferred. */
  name?: string;
  key: KeyId;
  /** The caller's role and actions in membership, or null when the key is no active member's. */
  me: Standing | null;
  /** The read session the caller presents, or null when membership gave none; then reads are signed reads. */
  reader: ReadSession | null;
  /** Why membership gave no session, or null when it gave one. */
  unsessioned: string | null;
  /** Definitions read so far, by digest: a lane's definition is read once. */
  definitions: Map<string, DeclaredDefinition>;
}

/** A read that failed: the page shows this text and nothing else about the thing it could not read. */
export class Unreadable extends Error {
  override readonly name = "Unreadable";
}

const nowOf = (session: Session): number => session.now?.() ?? Date.now();
const transportOf = (session: Session): Transport =>
  signedReads(httpTransport(session.service, session.fetch ? { fetch: session.fetch } : {}), secretSigner(session.secret), session.now ? { now: session.now } : {});

/** A handle on one scope that presents the caller's session, or signs each read where there is none. */
const handleOf = (room: Pick<Room, "session" | "reader">, scope: ScopeId): ScopeHandle => new ScopeHandle(transportOf(room.session), scope, room.reader?.reader() ?? null);

/** Renews the caller's session when it has ended, or will within ten seconds. A room that membership gave no session stays on signed reads. */
async function fresh(room: Room): Promise<void> {
  if (!room.reader || !room.reader.endedBy(timeOf(nowOf(room.session) + 10_000))) return;
  const asked = await readerFor(room.session, room.membership);
  room.reader = asked.session;
  room.unsessioned = asked.why;
}

async function summaryOf(handle: ScopeHandle): Promise<{ summary: Summary; at: Head }> {
  const read = await handle.summary();
  if (!read.ok) throw new Unreadable(`Cannot read ${handle.scope}: ${read.reason}.`);
  if (!read.complete || read.next !== undefined) throw new Unreadable(`Cannot read ${handle.scope}: incomplete summary.`);
  return { summary: read.value, at: read.at };
}

/** Collect only a complete enumeration. Existing caller budgets stay unchanged. */
async function pagesOf<T>(request: (cursor?: string) => Promise<Read<readonly T[]>>, what: string, budget: number, at: Head): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (let pages = 0; pages < budget; pages++) {
    const page = await request(cursor);
    if (!page.ok) throw new Unreadable(`${what}: ${page.reason}.`);
    if (page.at.seq !== at.seq || page.at.hash !== at.hash) throw new Unreadable(`${what}: head changed; enumeration incomplete.`);
    rows.push(...page.value);
    if (page.next === undefined) {
      if (!page.complete) throw new Unreadable(`${what}: incomplete enumeration.`);
      return rows;
    }
    cursor = page.next;
  }
  throw new Unreadable(`${what}: page budget exhausted; enumeration incomplete.`);
}

/** Every item of one type, only when retained-item enumeration completes. */
async function itemsOf(handle: ScopeHandle, summary: Summary, type: string, at: Head): Promise<Item[]> {
  const items = new Map<number, Item>(summary.items.filter((item) => item.type === type).map((item) => [item.id, item]));
  for (const item of await pagesOf((cursor) => handle.items(type, cursor), `Cannot read ${type} items of ${handle.scope}`, 100, at)) if (!items.has(item.id)) items.set(item.id, item);
  return [...items.values()].sort((a, b) => a.id - b.id);
}

/** A detached text by its digest, or null when the scope holds none (as after a redaction) or the slot is empty. */
async function textOf(handle: ScopeHandle, digest: FieldValue | null | undefined): Promise<string | null> {
  if (typeof digest !== "string") return null;
  const read = await handle.text(digest as Digest);
  return read.ok ? read.value : null;
}

const memberOf = (party: unknown): string | null => (party && typeof party === "object" && "member" in party ? String((party as MemberRef).member) : null);
const membersOf = (party: unknown): string[] => (Array.isArray(party) ? party.map(memberOf).filter((m): m is string => m !== null) : []);
const text = (value: FieldValue | null | undefined): string | null => (typeof value === "string" ? value : null);
const scopeOf = (ref: FieldValue | null | undefined): ScopeId | null => (ref && typeof ref === "object" && "scope" in ref ? (ref as { scope: ScopeId }).scope : null);

// ---------------------------------------------------------------- the room

const isScopeRef = (v: unknown): v is ScopeRef =>
  typeof v === "object" && v !== null && typeof (v as ScopeRef).scope === "string" && typeof (v as ScopeRef).inc === "string" && typeof (v as ScopeRef).kind === "string";

/**
 * The room that a text names: an invitation link from `artroom invite`, or
 * the command line's config file (`config.json`), whose `repository` names
 * the directory and membership. Null when the text is neither. The link's
 * secret is not kept here: `joinRoom` reads it from the link.
 */
export function placeOf(typed: string): Place | null {
  const trimmed = typed.trim();
  try {
    const parsed = (trimmed.startsWith(LINK) ? linkOf(trimmed) : JSON.parse(trimmed)) as { repository?: { directory?: unknown; membership?: unknown }; directory?: unknown; membership?: unknown } | null;
    const repository = parsed?.repository ?? parsed;
    // Encoding only: a syntactically valid Place proves no birth or authority.
    if (!fullScopeRef(repository?.directory) || repository.directory.kind !== "directory"
      || !fullScopeRef(repository?.membership) || repository.membership.kind !== "membership") return null;
    return { directory: repository.directory.scope, membership: repository.membership };
  } catch {
    return null;
  }
}

/** Encoding checks before signing, not provenance or server authority.
 * Routing stays on the configured service; normalization matches httpTransport. */
function admittedInvitation(session: Session, link: NonNullable<ReturnType<typeof linkOf>>): boolean {
  return typeof session.service === "string" && typeof link.service === "string"
    && session.service.replace(/\/+$/, "").length > 0
    && link.service.replace(/\/+$/, "") === session.service.replace(/\/+$/, "")
    && typeof link.handle === "string" && link.invitation > 0
    && fullScopeRef(link.repository?.directory) && link.repository.directory.kind === "directory"
    && fullScopeRef(link.repository?.membership) && link.repository.membership.kind === "membership"
    && isScopeId(link.repository?.rules) && isScopeId(link.repository?.destination)
    && (link.definition === "platform:membership@1" || link.definition === "platform:membership@2")
    && platform(link.definition)?.data.name === "platform:membership";
}

/**
 * Attempts to enrol the page's key in the room an invitation link names: membership's
 * `join`, with the invitation's number and secret, signed by the key. Its
 * fields are read from the exact supported membership hint the link names.
 * The hint is not proven provenance; the answer is membership's. This direct
 * request has no CLI-style saved enrollment envelope or durable recovery.
 */
export async function joinRoom(session: Session, typed: string): Promise<{ place: Place; answer: Answer }> {
  const link = linkOf(typed.trim());
  if (!link) throw new Unreadable("That is not an invitation link from artroom invite.");
  if (!admittedInvitation(session, link)) throw new Unreadable("The invitation does not match this configured service, complete repository references and an explicit supported membership version.");
  const supplied = platform(link.definition!)!;
  const shape = supplied.data as unknown as DefinitionShape;
  const fields = { invitation: link.invitation, secret: link.secret };
  const signing: Signing = session.now ? { now: session.now() } : {};
  // A new key reads nothing in membership before the join, and `join` names its member by a mark, which has no key in `expected`.
  const signed = await signedIntent(secretSigner(session.secret), { to: link.repository.membership, kind: "join", fields, expected: expectedOf(shape.acts["join"]!, [], null, fields) }, signing);
  const answer = await new ScopeHandle(transportOf(session), link.repository.membership.scope, null).submit(signed);
  return { place: { directory: link.repository.directory.scope, membership: link.repository.membership }, answer };
}

/**
 * Opens the room at `place`. The page asks membership for a read session
 * signed for by the caller's key, and presents it to every read; where
 * membership refuses one, the reads are signed reads. Then it reads the
 * directory's repository item for the rules scope and the destination, and
 * the caller's standing in membership.
 */
export async function openRoom(session: Session, place: Place): Promise<Room> {
  const key = keyIdOfSecret(session.secret);
  const asked = await readerFor(session, place.membership);
  const room: Room = { session, directory: place.directory, membership: place.membership, rules: "" as ScopeId, destination: "" as ScopeId, key, me: null, reader: asked.session, unsessioned: asked.why, definitions: new Map() };
  const { summary } = await summaryOf(handleOf(room, place.directory));
  const repository = summary.items.find((item) => item.type === "repository");
  const M = repository?.refs["membership"];
  const rules = scopeOf(repository?.refs["rules"]);
  const destination = scopeOf(repository?.refs["destination"]);
  if (!repository || !isScopeRef(M) || !rules || !destination) throw new Unreadable(`The directory ${place.directory} names no membership, rules scope and destination yet.`);
  if (M.scope !== place.membership.scope || M.inc !== place.membership.inc) throw new Unreadable(`The directory ${place.directory} names another membership scope than ${place.membership.scope}.`);
  room.rules = rules;
  room.destination = destination;
  const recordedRepository = repository.values["repository"];
  if (recordedRepository && typeof recordedRepository === "object" && !Array.isArray(recordedRepository) && "name" in recordedRepository && typeof recordedRepository.name === "string") room.name = recordedRepository.name;
  room.me = standing((await summaryOf(handleOf(room, place.membership.scope))).summary.items, key);
  return room;
}

/** A read session from membership, signed for by the caller's key, or why membership gave none. A request that got no reply is `no-reply`. */
async function readerFor(session: Session, membership: ScopeRef): Promise<{ session: ReadSession | null; why: string | null }> {
  const asked = sessionRequest(membership, session.secret, timeOf(Math.floor(nowOf(session) / 1000) * 1000 + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16))));
  try {
    const answer = await requestSession(session.service, membership.scope, asked, session.fetch ? { fetch: session.fetch } : {});
    return answer.ok ? { session: answer.session, why: null } : { session: null, why: answer.reason };
  } catch {
    return { session: null, why: "no-reply" };
  }
}

/** One lane as the directory's index row has it, with the state its own main item is in now. */
export interface LaneRow { scope: ScopeId; number: number | null; kind: "issue" | "pr" | null; title: string | null; state: string | null; draft: boolean | null }

/** The room's issues and changes: the directory's index rows, in number order, each with its lane's own state. */
export async function listLanes(room: Room): Promise<{ issues: LaneRow[]; changes: LaneRow[] }> {
  await fresh(room);
  const { summary } = await summaryOf(handleOf(room, room.directory));
  const rows: LaneRow[] = [];
  for (const item of summary.items.filter((i) => i.type === "lane")) {
    const scope = scopeOf(item.refs["scope"]);
    if (!scope) continue;
    // The lane's own state, read from it; the index row is the lane's advisory copy. A final main item (a merged change, say)
    // is no longer in the summary: it is read from the scope's retained final items.
    const handle = handleOf(room, scope);
    const { summary: lane, at } = await summaryOf(handle);
    const type = item.values["kind"] === "issue" ? "intent" : "proposal";
    const main = lane.items.find((i) => i.type === type) ?? (await itemsOf(handle, lane, type, at))[0];
    rows.push({
      scope, number: typeof item.values["number"] === "number" ? item.values["number"] : null, kind: (text(item.values["kind"]) as LaneRow["kind"]) ?? null,
      title: text(main?.values["title"]) ?? text(item.values["title"]), state: main?.state ?? text(item.values["state"]), draft: typeof item.values["draft"] === "boolean" ? item.values["draft"] : null,
    });
  }
  rows.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return { issues: rows.filter((r) => r.kind === "issue"), changes: rows.filter((r) => r.kind === "pr") };
}

// ---------------------------------------------------------------- one lane

/** A lane's definition, as the scope retains it under the digest its summary names. */
async function laneDefinition(room: Room, handle: ScopeHandle, summary: Summary): Promise<DeclaredDefinition> {
  const kept = room.definitions.get(summary.definition);
  if (kept) return kept;
  const read = await handle.definition();
  if (!read.ok) throw new Unreadable(`Cannot read the definition of ${handle.scope}: ${read.reason}.`);
  if (!read.complete || read.next !== undefined) throw new Unreadable(`Cannot read the definition of ${handle.scope}: incomplete.`);
  room.definitions.set(summary.definition, read.value);
  return read.value;
}

export interface Comment { id: number; author: string | null; state: string; body: string | null }

const commentsOf = async (handle: ScopeHandle, summary: Summary, at: Head): Promise<Comment[]> =>
  Promise.all((await itemsOf(handle, summary, "comment", at)).map(async (c) => ({ id: c.id, author: memberOf(c.parties["author"]), state: c.state, body: await textOf(handle, c.values["body"]) })));

export interface IssueView {
  scope: ScopeId; definition: string; head: Head;
  number: number | null; title: string | null; body: string | null; state: string; closeReason: string | null;
  requester: string | null; assignees: string[]; conditions: string[]; comments: Comment[];
}

/** An issue lane: its intent item, its comments, and the head it was read at. */
export async function loadIssue(room: Room, scope: ScopeId): Promise<IssueView> {
  await fresh(room);
  const handle = handleOf(room, scope);
  const { summary, at } = await summaryOf(handle);
  const definition = await laneDefinition(room, handle, summary);
  if (definition.name !== "issue") throw new Unreadable(`${scope} is a lane under ${definition.name}, not an issue.`);
  const intent = summary.items.find((item) => item.type === "intent") ?? (await itemsOf(handle, summary, "intent", at))[0];
  if (!intent) throw new Unreadable(`${scope} holds no issue.`);
  return {
    scope, definition: summary.definition, head: at,
    number: typeof intent.values["number"] === "number" ? intent.values["number"] : null, title: text(intent.values["title"]), body: await textOf(handle, intent.values["body"]),
    state: intent.state, closeReason: text(intent.values["closeReason"]), requester: memberOf(intent.parties["requester"]), assignees: membersOf(intent.parties["assignees"]),
    conditions: Array.isArray(intent.values["conditions"]) ? (intent.values["conditions"] as string[]) : [], comments: await commentsOf(handle, summary, at),
  };
}

/**
 * One version of a change. A one-file version (`propose-file`) names its
 * `file`: the path, the digest and size of its bytes. Its legacy `page`
 * address points at the latest published branch, not this immutable version;
 * the Version screen does not offer it as a rendered-page link.
 */
export interface Manifest {
  id: number; state: string; integrator: string | null; authors: string[]; base: string | null; integration: string | null; tree: string | null; complete: boolean | null;
  file: { path: string; digest: string | null; size: number | null; page: string } | null;
}
export interface Review { id: number; state: string; reviewer: string | null; manifest: number | null; verdict: string | null; extent: string | null }
export interface ReviewRequest { id: number; state: string; requested: string | null; requester: string | null }
export interface Job { id: number; state: string; name: string | null; manifest: number | null }
export interface Link { id: number; state: string; issue: ScopeId | null; how: string | null }
export interface Extent { name: string; approvals: number; approver: string; checks: string[]; class: string; patterns?: string[] }
/** The rules a change lane holds, as the rules scope last sent them. `revision`: the update's revision, which the relation counts. */
export interface LaneRules { approvals: number | null; revision: number | null; ownerMayReview: boolean | null; extents: Extent[]; checks: { name: string; required: boolean }[] }
/** One outside operation of the destination, for one publication: its kind, and the result of each of its attempts in order. */
export interface Operation { id: string; kind: string; attempts: ("opened" | "confirmed" | "refused" | "unknown")[] }
export interface Publication { id: number; state: string; reason: string | null; operations: Operation[] }
export interface Merge { id: number; state: string; manifest: number | null; reason: string | null; commit: string | null; publication: Publication | null }

export interface ChangeView {
  scope: ScopeId; definition: string; head: Head;
  number: number | null; title: string | null; body: string | null; state: string; author: string | null;
  manifests: Manifest[]; reviews: Review[]; requests: ReviewRequest[]; jobs: Job[]; links: Link[]; merges: Merge[]; rules: LaneRules | null; comments: Comment[];
}

const localId = (value: FieldValue | null | undefined): number | null => (typeof value === "number" ? value : null);

/**
 * A change lane, and for each of its merges the destination's publication
 * and that publication's outside operations, read from the destination's
 * history: an operation is opened `for` the publication, and each attempt
 * records its result.
 */
export async function loadChange(room: Room, scope: ScopeId): Promise<ChangeView> {
  await fresh(room);
  const handle = handleOf(room, scope);
  const { summary, at } = await summaryOf(handle);
  const definition = await laneDefinition(room, handle, summary);
  if (definition.name !== "change") throw new Unreadable(`${scope} is a lane under ${definition.name}, not a change.`);
  const all = (type: string) => itemsOf(handle, summary, type, at);
  const proposal = summary.items.find((item) => item.type === "proposal") ?? (await all("proposal"))[0];
  if (!proposal) throw new Unreadable(`${scope} holds no proposal.`);
  const rulesItem = summary.items.find((item) => item.type === "rules");
  const publications = await publicationsOf(room, scope);
  return {
    scope, definition: summary.definition, head: at,
    number: localId(proposal.values["number"]), title: text(proposal.values["title"]), body: await textOf(handle, proposal.values["body"]), state: proposal.state, author: memberOf(proposal.parties["author"]),
    manifests: (await all("manifest")).map((m) => ({
      id: m.id, state: m.state, integrator: memberOf(m.parties["integrator"]), authors: membersOf(m.parties["authors"]),
      base: text(m.values["base"]), integration: text(m.values["integration"]), tree: text(m.values["tree"]), complete: typeof m.values["complete"] === "boolean" ? m.values["complete"] : null,
      file: typeof m.values["path"] === "string" ? {
        path: m.values["path"], digest: text(m.values["digest"]), size: typeof m.values["size"] === "number" ? m.values["size"] : null, page: siteAddress(room, m.values["path"]),
      } : null,
    })),
    reviews: (await all("review")).map((r) => ({ id: r.id, state: r.state, reviewer: memberOf(r.parties["reviewer"]), manifest: localId(r.refs["manifest"]), verdict: text(r.values["verdict"]), extent: text(r.values["extent"]) })),
    requests: (await all("review-request")).map((r) => ({ id: r.id, state: r.state, requested: memberOf(r.parties["requested"]), requester: memberOf(r.parties["requester"]) })),
    jobs: (await all("job")).map((j) => ({ id: j.id, state: j.state, name: text(j.values["name"]), manifest: localId(j.refs["manifest"]) })),
    links: (await all("link")).map((l) => ({ id: l.id, state: l.state, issue: scopeOf(l.refs["issue"]), how: text(l.values["how"]) })),
    merges: (await all("merge")).map((m) => ({
      id: m.id, state: m.state, manifest: localId(m.refs["manifest"]), reason: text(m.values["reason"]), commit: text(m.values["commit"]), publication: publications.get(m.id) ?? null,
    })),
    rules: rulesItem ? {
      approvals: localId(rulesItem.values["approvals"]), revision: localId(rulesItem.values["revision"]), ownerMayReview: typeof rulesItem.values["ownerMayReview"] === "boolean" ? rulesItem.values["ownerMayReview"] : null,
      extents: Array.isArray(rulesItem.values["extents"]) ? (rulesItem.values["extents"] as unknown as Extent[]) : [],
      checks: Array.isArray(rulesItem.values["checks"]) ? (rulesItem.values["checks"] as unknown as { name: string; required: boolean }[]) : [],
    } : null,
    comments: await commentsOf(handle, summary, at),
  };
}

/** The destination's publications for one lane, by the lane's merge entry, each with the operations opened for it. */
async function publicationsOf(room: Room, lane: ScopeId): Promise<Map<number, Publication>> {
  const G = handleOf(room, room.destination);
  const { summary, at } = await summaryOf(G);
  const items = (await itemsOf(G, summary, "publication", at)).filter((item) => (item.refs["operation"] as FactRef | undefined)?.at.scope === lane);
  if (items.length === 0) return new Map();
  const operations = operationsOf(await historyOf(G, at));
  return new Map(items.map((item) => [
    (item.refs["operation"] as FactRef).seq,
    { id: item.id, state: item.state, reason: text(item.values["reason"]), operations: operations.filter((o) => o.for === item.id).map(({ for: _for, ...o }) => o) },
  ]));
}

async function historyOf(handle: ScopeHandle, at: Head): Promise<Entry[]> {
  return (await pagesOf((cursor) => handle.history(cursor), `Cannot read the history of ${handle.scope}`, 1000, at)).map((sealed) => sealed.entry);
}

/**
 * The outside operations a history records, with the item each is for. An
 * operation is named `seq:k`, by the entry that opened it and its ordinal
 * there; an attempt in that same entry names it `{ k }`. `for: "self"` is
 * the item the same entry opens.
 */
export function operationsOf(entries: readonly Entry[]): (Operation & { for: number | null })[] {
  const found = new Map<string, Operation & { for: number | null }>();
  for (const entry of entries) {
    const opened = entry.effects.find((effect) => effect.effect === "open");
    for (const effect of entry.effects) {
      if (effect.effect === "operation") {
        const item = effect.for === "self" ? (opened && "item" in opened ? opened.item : null) : (effect.for ?? null);
        found.set(`${entry.seq}:${effect.k}`, { id: `${entry.seq}:${effect.k}`, kind: effect.kind, attempts: [], for: item });
      } else if (effect.effect === "attempt") {
        const id = typeof effect.operation === "string" ? effect.operation : `${entry.seq}:${effect.operation.k}`;
        const operation = found.get(id);
        if (!operation) continue;
        if (effect.result === "opened") operation.attempts.push("opened");
        else operation.attempts[effect.attempt - 1] = effect.result;
      }
    }
  }
  return [...found.values()];
}

// ---------------------------------------------------------------- the published site

/** The address of a path on the room's published site: the site route, on the published branch (`HEAD`). */
export function siteAddress(room: Pick<Room, "session" | "directory">, path: string): string {
  return `${room.session.service.replace(/\/+$/, "")}/site/${room.directory}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** What the site route answered for one path: its status and its text. A refusal's text is its reason and a sentence. */
export interface SitePage { address: string; status: number; text: string }

/** The most bytes of a site page that the page reads: the site route's own bound on one file. */
const SITE_BYTES = 1024 * 1024 + 64 * 1024;

/** One page of the room's published site, as the site route answers it. No session is presented by this client; site eligibility remains the site owner's policy. */
export async function loadSite(room: Pick<Room, "session" | "directory">, path: string): Promise<SitePage> {
  const address = siteAddress(room, path);
  const send = room.session.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  if (!send) throw new Unreadable("This runtime has no fetch.");
  const response = await send(address, { method: "GET" });
  const bytes = response.body ? await takeBytes(response.body, SITE_BYTES, AbortSignal.timeout(30_000)) : new Uint8Array(0);
  if (bytes === null || bytes === LATE) throw new Unreadable(`The site's answer for ${path} is longer than this page reads, or did not come within 30 seconds.`);
  return { address, status: response.status, text: new TextDecoder().decode(bytes) };
}

// ---------------------------------------------------------------- the rules

export interface RulesView {
  scope: ScopeId; head: Head;
  /** The position of the last `publish` in the rules scope's history: the revision of the rules. Null before the first. */
  revision: number | null;
  approvals: number | null; ownerMayReview: boolean | null; singleControllerException: boolean | null;
  checks: { name: string; required: boolean; checker?: unknown }[]; labels: string[]; extents: Extent[] | null;
  definitions: { name: string; digest: string; state: string }[];
  /** The members whose role holds `rules.publish`, the action a change of the rules needs. */
  controllers: string[];
}

/** The rules of the room, as the rules scope holds them, and the members who may change them. */
export async function loadRules(room: Room): Promise<RulesView> {
  await fresh(room);
  const handle = handleOf(room, room.rules);
  const { summary, at } = await summaryOf(handle);
  const rules = summary.items.find((item) => item.type === "rules");
  if (!rules) throw new Unreadable(`${room.rules} holds no rules.`);
  // The slot holds the position of the last `publish` in this scope's history: the revision of the rules (`revisionOf`).
  const published = rules.refs["published"];
  return {
    scope: room.rules, head: at, revision: typeof published === "number" ? published : null,
    approvals: localId(rules.values["approvals"]), ownerMayReview: typeof rules.values["ownerMayReview"] === "boolean" ? rules.values["ownerMayReview"] : null,
    singleControllerException: typeof rules.values["singleControllerException"] === "boolean" ? rules.values["singleControllerException"] : null,
    checks: Array.isArray(rules.values["checks"]) ? (rules.values["checks"] as unknown as RulesView["checks"]) : [],
    labels: Array.isArray(rules.values["labels"]) ? (rules.values["labels"] as string[]) : [],
    extents: Array.isArray(rules.values["extents"]) ? (rules.values["extents"] as unknown as Extent[]) : null,
    definitions: (await itemsOf(handle, summary, "definition", at)).map((d) => ({ name: String(d.values["name"]), digest: String(d.values["digest"]), state: d.state })),
    controllers: holdersOf((await summaryOf(handleOf(room, room.membership.scope))).summary.items, "rules.publish"),
  };
}

/** The handles of the active members whose role's list in the roster holds `action`. */
export function holdersOf(items: readonly Item[], action: string): string[] {
  const roster = items.find((item) => item.type === "roster");
  if (!roster) return [];
  const roles = (Object.keys(ROLE_LISTS) as Role[]).filter((role) => ((roster.values[ROLE_LISTS[role]] as readonly string[] | null) ?? []).includes(action));
  return items.filter((item) => item.type === "member" && item.state === "active" && roles.includes(item.values["role"] as Role)).map((item) => String(item.values["handle"]));
}

// ---------------------------------------------------------------- acts

/** One act the caller may sign now, as the page offers it: its fields, by declared type, and one line made from its declaration. */
/**
 * One act the caller may sign now, as the page offers it: its fields, by declared type, and one line made from its declaration. A
 * field whose value is a definition's bytes, by their digest, lists as `choices` the definitions the rules scope holds active.
 */
export interface Offered {
  kind: string; step: ActShape["step"]; on: string | null; line: string;
  fields: { name: string; type: string; required: boolean; choices?: { label: string; value: string }[] }[];
}

/** The byte domain of a field's stated value place, or null when it states none: its bytes travel beside the act, named by their digest. */
const domainOf = (field: unknown): string | null => {
  const value = (field as { value?: { domain?: unknown } } | null)?.value;
  return typeof value?.domain === "string" ? value.domain : null;
};

/** The definitions the rules scope holds active, latest first: a choice for a field that takes a definition's bytes. */
async function activeDefinitions(room: Room): Promise<{ label: string; value: string }[]> {
  const { summary } = await summaryOf(handleOf(room, room.rules));
  return summary.items.filter((item) => item.type === "definition" && item.state === "active").sort((a, b) => b.id - a.id)
    .map((item) => ({ label: `${String(item.values["name"])} (${String(item.values["digest"]).slice(0, 19)})`, value: String(item.values["digest"]) }));
}

/**
 * The bytes of each value that the act's fields name at a stated place. A
 * definition's bytes are read from the rules scope, which retains them when
 * it activates the definition, and must hash to the digest; the scope
 * checks that again. The page has no other source of bytes.
 */
async function valuesOf(room: Room, act: ActShape, fields: Record<string, FieldValue>): Promise<string[]> {
  const values: string[] = [];
  for (const [name, field] of Object.entries(act.fields)) {
    const domain = domainOf(field);
    const digest = fields[name];
    if (domain === null || typeof digest !== "string") continue;
    if (domain !== DEFINITION_DOMAIN) throw new Unreadable(`The field ${name} takes a value in ${domain}, which this page cannot supply.`);
    // A value in the domain of a definition is kept as a definition, and read by that kind (as `artroom edit` reads it).
    const kept = await transportOf(room.session).retained(room.rules, room.reader?.reader() ?? null, "definition", digest as Digest);
    if (!kept.ok) throw new Unreadable(`Cannot read the definition ${digest} from the rules scope: ${kept.reason}. Nothing was signed.`);
    values.push(kept.value.bytes);
  }
  return values;
}

/** A scope's definition, as the page reads it: a platform one from the platform package, a lane's as the scope retains it. */
async function shapeOf(room: Room, handle: ScopeHandle, summary: Summary): Promise<{ shape: DefinitionShape; declared: DeclaredDefinition | null }> {
  const supplied = platform(summary.definition);
  if (supplied) return { shape: supplied.data as unknown as DefinitionShape, declared: null };
  const declared = await laneDefinition(room, handle, summary);
  return { shape: declared as unknown as DefinitionShape, declared };
}

/**
 * The acts of the scope's definition that the caller may sign now, from the
 * definition and the caller's role, as `artroom acts` lists them. The scope
 * can still refuse one on its guards or its state. `hidden`: how many need
 * an action the caller's role does not hold.
 */
export async function actsOn(room: Room, scope: ScopeId): Promise<{ acts: Offered[]; hidden: number }> {
  await fresh(room);
  const handle = handleOf(room, scope);
  const { shape } = await shapeOf(room, handle, (await summaryOf(handle)).summary);
  const { acts, hidden } = heldActs(shape, room.me);
  const definitions = acts.some(([, a]) => Object.values(a.fields).some((f) => domainOf(f) === DEFINITION_DOMAIN)) ? await activeDefinitions(room) : [];
  return {
    acts: acts.map(([kind, a]) => ({
      kind, step: a.step, on: a.on, line: describe(kind, a),
      fields: Object.entries(a.fields).map(([name, f]) => ({ name, type: f.type ?? f.code ?? "code", required: f.required === true, ...(domainOf(f) === DEFINITION_DOMAIN ? { choices: definitions } : {}) })),
    })),
    hidden,
  };
}

/** Reads a field's value from the text a person typed, by the field's declared type, as `artroom act --set` does. */
export function fieldValue(room: Room, type: string, typed: string): FieldValue {
  return valueOf({ repository: { membership: room.membership } as never }, { type }, typed);
}

/** The scope's answer and independent before/after observations. A category alone proves no absence of timed entries. */
export interface Acted {
  service: string; directory: ScopeId; membership: ScopeRef; key: KeyId; scope: ScopeId; kind: string; on: number | null;
  answer: Answer; before: Head; after: Head | null; observation: string | null;
}
/** Memory-only association; contains no signing key or current permission. */
export function actAssociation(room: Pick<Room, "session" | "directory" | "membership">, scope: ScopeId): string {
  return JSON.stringify([room.session.service.replace(/\/+$/, ""), room.directory, room.membership, keyIdOfSecret(room.session.secret), scope]);
}

/**
 * Signs and sends one act. The expected revision of each item the act
 * names is read from the summary, and the scope checks each again. A lane's
 * act goes through the client's declared handle, which checks each field's
 * shape before it signs and carries detached texts beside the intent.
 */
export async function act(room: Room, scope: ScopeId, kind: string, asked: { on?: number | null; fields?: Record<string, FieldValue> } = {}, received?: (result: Acted) => void): Promise<Acted> {
  await fresh(room);
  const handle = handleOf(room, scope);
  const { summary, at: before } = await summaryOf(handle);
  const { shape, declared } = await shapeOf(room, handle, summary);
  const declaration = shape.acts[kind];
  if (!declaration || kind === shape.genesis) throw new Unreadable(`${kind} is not an act of ${shape.name}.`);
  const fields = asked.fields ?? {};
  const on = asked.on ?? null;
  const expected = expectedOf(declaration, summary.items, on, fields);
  const values = await valuesOf(room, declaration, fields);
  const signer = secretSigner(room.session.secret);
  const signing: Signing = room.session.now ? { now: room.session.now() } : {};
  let answer: Answer;
  if (declared) {
    const typed = await declaredHandle(handle, declared);
    if (!typed.ok) throw new Unreadable(`Cannot act on ${scope}: ${typed.reason}.`);
    const { signed, beside } = await typed.handle.intent(signer, kind as never, { on, fields, expected } as never, signing);
    answer = await typed.handle.submit(signed, [], values.length > 0 ? { ...beside, values } : beside);
  } else {
    answer = await handle.submit(await signedIntent(signer, { to: summary.scope, kind, on, fields, expected }, signing), [], values.length > 0 ? { values } : {});
  }
  const result: Acted = { service: room.session.service, directory: room.directory, membership: { ...room.membership }, key: signer.key, scope, kind, on, answer, before, after: null, observation: "Observation refresh pending." };
  received?.(result); // Preserve the real answer before any awaited refresh.
  try { result.after = (await summaryOf(handle)).at; result.observation = null; }
  catch (error) { result.observation = error instanceof Unreadable ? error.message : "The observation refresh failed."; }
  return result;
}
