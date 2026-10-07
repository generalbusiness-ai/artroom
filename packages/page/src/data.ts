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
 * | `openRoom` | The directory's repository item, for membership, the rules scope and the destination; the caller's standing in membership. |
 * | `listLanes` | The directory's index rows, one for each lane, with each lane's own state. |
 * | `loadIssue` | An issue lane: its intent, assignees, state and comments. |
 * | `loadChange` | A change lane: its proposal, versions, reviews by extent, review requests, checks, links and merges, the rules it holds, and for each merge the destination's publication and its outside operations. |
 * | `loadRules` | The rules scope: the rules of the room, the active definitions, and which members may change the rules. |
 * | `actsOn` | The acts of a scope's definition that the caller may sign now. |
 * | `act` | Signs and sends one act, and reads the head before and after. |
 */

import type { Answer, DeclaredDefinition, Digest, Entry, FactRef, FieldValue, Head, Item, KeyId, MemberRef, ScopeId, ScopeRef, Summary } from "@generalbusiness/artroom-contract";
import { b64url, keyIdOfSecret, timeOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, declaredHandle, httpTransport, requestSession, secretSigner, sessionRequest, signedIntent, type Fetch, type Signing } from "@generalbusiness/artroom-client";
import { describe, expectedOf, heldActs, standing, valueOf, type ActShape, type DefinitionShape, type Standing } from "@generalbusiness/artroom-cli";
import { ROLE_LISTS, platform, type Role } from "@generalbusiness/artroom-platform";

/** Who is reading and signing, and where. `fetch` and `now` replace the runtime's, as a test does. */
export interface Session {
  service: string;
  secret: Uint8Array;
  fetch?: Fetch;
  /** The clock that intents are signed by, in milliseconds. */
  now?: () => number;
}

/** A room as the page has opened it: the four scopes it reads, and the caller's key and standing. */
export interface Room {
  session: Session;
  directory: ScopeId;
  membership: ScopeRef;
  rules: ScopeId;
  destination: ScopeId;
  key: KeyId;
  /** The caller's role and actions in membership, or null when the key is no active member's. */
  me: Standing | null;
  /** The read session the caller presents, or null when membership gave none. */
  reader: string | null;
  /** Definitions read so far, by digest: a lane's definition is read once. */
  definitions: Map<string, DeclaredDefinition>;
}

/** A read that failed: the page shows this text and nothing else about the thing it could not read. */
export class Unreadable extends Error {
  override readonly name = "Unreadable";
}

const handleOf = (room: Pick<Room, "session" | "reader">, scope: ScopeId): ScopeHandle =>
  new ScopeHandle(httpTransport(room.session.service, room.session.fetch ? { fetch: room.session.fetch } : {}), scope, room.reader);

async function summaryOf(handle: ScopeHandle): Promise<{ summary: Summary; at: Head }> {
  const read = await handle.summary();
  if (!read.ok) throw new Unreadable(`Cannot read ${handle.scope}: ${read.reason}.`);
  return { summary: read.value, at: read.at };
}

/** Every item of one type: the live ones from the summary, and the final ones the scope retains, page by page. */
async function itemsOf(handle: ScopeHandle, summary: Summary, type: string): Promise<Item[]> {
  const items = new Map<number, Item>(summary.items.filter((item) => item.type === type).map((item) => [item.id, item]));
  for (let cursor: string | undefined, pages = 0; pages < 100; pages++) {
    const page = await handle.items(type, cursor);
    if (!page.ok) break;
    for (const item of page.value) if (!items.has(item.id)) items.set(item.id, item);
    if (page.next === undefined) break;
    cursor = page.next;
  }
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

/**
 * Opens the room that `directory` founds. The directory is read without a
 * session: membership's reference, which a session request names, is known
 * only from the directory. Then the page asks membership for a read session
 * signed by the caller's key, and presents it to every later read. With no
 * session, the page reads without one, and each scope decides.
 */
export async function openRoom(session: Session, directory: ScopeId): Promise<Room> {
  const key = keyIdOfSecret(session.secret);
  const { summary } = await summaryOf(handleOf({ session, reader: null }, directory));
  const repository = summary.items.find((item) => item.type === "repository");
  const M = repository?.refs["membership"] as ScopeRef | undefined;
  const rules = scopeOf(repository?.refs["rules"]);
  const destination = scopeOf(repository?.refs["destination"]);
  if (!repository || !M || !rules || !destination) throw new Unreadable(`The directory ${directory} names no membership, rules scope and destination yet.`);
  const room: Room = { session, directory, membership: M, rules, destination, key, me: null, reader: await readerFor(session, M), definitions: new Map() };
  room.me = standing((await summaryOf(handleOf(room, M.scope))).summary.items, key);
  return room;
}

/** A read session from membership, signed for by the caller's key, or null when membership gives none. */
async function readerFor(session: Session, membership: ScopeRef): Promise<string | null> {
  const now = session.now?.() ?? Date.now();
  const asked = sessionRequest(membership, session.secret, timeOf(Math.floor(now / 1000) * 1000 + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16))));
  try {
    const answer = await requestSession(session.service, membership.scope, asked, session.fetch ? { fetch: session.fetch } : {});
    return answer.ok ? answer.session.reader() : null;
  } catch {
    return null;
  }
}

/** One lane as the directory's index row has it, with the state its own main item is in now. */
export interface LaneRow { scope: ScopeId; number: number | null; kind: "issue" | "pr" | null; title: string | null; state: string | null; draft: boolean | null }

/** The room's issues and changes: the directory's index rows, in number order, each with its lane's own state. */
export async function listLanes(room: Room): Promise<{ issues: LaneRow[]; changes: LaneRow[] }> {
  const { summary } = await summaryOf(handleOf(room, room.directory));
  const rows: LaneRow[] = [];
  for (const item of summary.items.filter((i) => i.type === "lane")) {
    const scope = scopeOf(item.refs["scope"]);
    if (!scope) continue;
    // The lane's own state, read from it; the index row is the lane's advisory copy.
    const lane = await handleOf(room, scope).summary();
    const main = lane.ok ? lane.value.items.find((i) => i.type === "intent" || i.type === "proposal") : undefined;
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
  room.definitions.set(summary.definition, read.value);
  return read.value;
}

export interface Comment { id: number; author: string | null; state: string; body: string | null }

const commentsOf = async (handle: ScopeHandle, summary: Summary): Promise<Comment[]> =>
  Promise.all((await itemsOf(handle, summary, "comment")).map(async (c) => ({ id: c.id, author: memberOf(c.parties["author"]), state: c.state, body: await textOf(handle, c.values["body"]) })));

export interface IssueView {
  scope: ScopeId; definition: string; head: Head;
  number: number | null; title: string | null; body: string | null; state: string; closeReason: string | null;
  requester: string | null; assignees: string[]; conditions: string[]; comments: Comment[];
}

/** An issue lane: its intent item, its comments, and the head it was read at. */
export async function loadIssue(room: Room, scope: ScopeId): Promise<IssueView> {
  const handle = handleOf(room, scope);
  const { summary, at } = await summaryOf(handle);
  const definition = await laneDefinition(room, handle, summary);
  if (definition.name !== "issue") throw new Unreadable(`${scope} is a lane under ${definition.name}, not an issue.`);
  const intent = summary.items.find((item) => item.type === "intent") ?? (await itemsOf(handle, summary, "intent"))[0];
  if (!intent) throw new Unreadable(`${scope} holds no issue.`);
  return {
    scope, definition: summary.definition, head: at,
    number: typeof intent.values["number"] === "number" ? intent.values["number"] : null, title: text(intent.values["title"]), body: await textOf(handle, intent.values["body"]),
    state: intent.state, closeReason: text(intent.values["closeReason"]), requester: memberOf(intent.parties["requester"]), assignees: membersOf(intent.parties["assignees"]),
    conditions: Array.isArray(intent.values["conditions"]) ? (intent.values["conditions"] as string[]) : [], comments: await commentsOf(handle, summary),
  };
}

export interface Manifest { id: number; state: string; integrator: string | null; authors: string[]; base: string | null; integration: string | null; tree: string | null; complete: boolean | null }
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
  const handle = handleOf(room, scope);
  const { summary, at } = await summaryOf(handle);
  const definition = await laneDefinition(room, handle, summary);
  if (definition.name !== "change") throw new Unreadable(`${scope} is a lane under ${definition.name}, not a change.`);
  const all = (type: string) => itemsOf(handle, summary, type);
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
    comments: await commentsOf(handle, summary),
  };
}

/** The destination's publications for one lane, by the lane's merge entry, each with the operations opened for it. */
async function publicationsOf(room: Room, lane: ScopeId): Promise<Map<number, Publication>> {
  const G = handleOf(room, room.destination);
  const read = await G.summary();
  if (!read.ok) return new Map();
  const items = (await itemsOf(G, read.value, "publication")).filter((item) => (item.refs["operation"] as FactRef | undefined)?.at.scope === lane);
  if (items.length === 0) return new Map();
  const operations = operationsOf(await historyOf(G));
  return new Map(items.map((item) => [
    (item.refs["operation"] as FactRef).seq,
    { id: item.id, state: item.state, reason: text(item.values["reason"]), operations: operations.filter((o) => o.for === item.id).map(({ for: _for, ...o }) => o) },
  ]));
}

async function historyOf(handle: ScopeHandle): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (let cursor: string | undefined, pages = 0; pages < 1000; pages++) {
    const page = await handle.history(cursor);
    if (!page.ok) throw new Unreadable(`Cannot read the history of ${handle.scope}: ${page.reason}.`);
    entries.push(...page.value.map((sealed) => sealed.entry));
    if (page.next === undefined) break;
    cursor = page.next;
  }
  return entries;
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
    definitions: (await itemsOf(handle, summary, "definition")).map((d) => ({ name: String(d.values["name"]), digest: String(d.values["digest"]), state: d.state })),
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
export interface Offered { kind: string; step: ActShape["step"]; on: string | null; line: string; fields: { name: string; type: string; required: boolean }[] }

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
  const handle = handleOf(room, scope);
  const { shape } = await shapeOf(room, handle, (await summaryOf(handle)).summary);
  const { acts, hidden } = heldActs(shape, room.me);
  return {
    acts: acts.map(([kind, a]) => ({
      kind, step: a.step, on: a.on, line: describe(kind, a),
      fields: Object.entries(a.fields).map(([name, f]) => ({ name, type: f.type ?? f.code ?? "code", required: f.required === true })),
    })),
    hidden,
  };
}

/** Reads a field's value from the text a person typed, by the field's declared type, as `artroom act --set` does. */
export function fieldValue(room: Room, type: string, typed: string): FieldValue {
  return valueOf({ repository: { membership: room.membership } as never }, { type }, typed);
}

/** What an act came to: the scope's answer, and the scope's head before and after. A refusal leaves the head where it was. */
export interface Acted { answer: Answer; before: Head; after: Head }

/**
 * Signs and sends one act. The expected revision of each item the act
 * names is read from the summary, and the scope checks each again. A lane's
 * act goes through the client's declared handle, which checks each field's
 * shape before it signs and carries detached texts beside the intent.
 */
export async function act(room: Room, scope: ScopeId, kind: string, asked: { on?: number | null; fields?: Record<string, FieldValue> } = {}): Promise<Acted> {
  const handle = handleOf(room, scope);
  const { summary, at: before } = await summaryOf(handle);
  const { shape, declared } = await shapeOf(room, handle, summary);
  const declaration = shape.acts[kind];
  if (!declaration || kind === shape.genesis) throw new Unreadable(`${kind} is not an act of ${shape.name}.`);
  const fields = asked.fields ?? {};
  const on = asked.on ?? null;
  const expected = expectedOf(declaration, summary.items, on, fields);
  const signer = secretSigner(room.session.secret);
  const signing: Signing = room.session.now ? { now: room.session.now() } : {};
  let answer: Answer;
  if (declared) {
    const typed = await declaredHandle(handle, declared);
    if (!typed.ok) throw new Unreadable(`Cannot act on ${scope}: ${typed.reason}.`);
    const { signed, beside } = await typed.handle.intent(signer, kind as never, { on, fields, expected } as never, signing);
    answer = await typed.handle.submit(signed, [], beside);
  } else {
    answer = await handle.submit(await signedIntent(signer, { to: summary.scope, kind, on, fields, expected }, signing));
  }
  return { answer, before, after: (await summaryOf(handle)).at };
}
