/**
 * Reads, attention, explain, the log and live updates (R-API-5 to R-API-8,
 * R-LOG-11). Every page carries a cursor (R-API-6). Nothing returned here
 * holds a credential (R-WS-1, R-WS-4).
 */

import type {
  ActId,
  AnyPolicyDocument,
  AttentionItem,
  Binding,
  Catalogue,
  CatalogueAct,
  PolicyVersion,
  AttentionPage,
  Cursor,
  EntrySummary,
  Explanation,
  Lane,
  LaneFilter,
  LaneId,
  LogEntry,
  LogPage,
  MemberId,
  OpByKind,
  OpKind,
  Page,
  PageRequest,
  Proposal,
  ProposalRef,
  ReadQuery,
  ReadResults,
  Seq,
  Update,
} from "@generalbusiness/artroom-contract";
import type { RoomCore } from "./core.ts";
import { bindingSubject, declarationOf, isDeclared, meaningOf } from "@generalbusiness/artroom-policy";
import { b64url, digestJson, unb64url } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { globsOverlap } from "./glob.ts";
import { entriesAfter, entryById, idOf } from "./log.ts";
import { allLaneIds, generationRow, laneRow, laneView } from "./model.ts";
import { obligationsFor, publicObligation } from "./obligations.ts";
import { proposalRecord } from "./admission.ts";
import { memberRow, rosterView, teamsOf } from "./roster.ts";
import { getMeta, num, one, str } from "./store.ts";
import { utf8 } from "./canonical.ts";

// ------------------------------------------------------------ cursors

/** Opaque cursors: they encode a position, and stay valid as long as the room (R-API-6). */
export function cursor(kind: string, n: number, extra: Record<string, number> = {}): Cursor {
  return `c1.${b64url(utf8(JSON.stringify({ k: kind, n, ...extra })))}` as Cursor;
}

function decodeCursor(c: string, kind: string): Record<string, number> {
  if (!c.startsWith("c1.")) throw artroomError("bad-request", "The cursor is not valid.");
  const raw = unb64url(c.slice(3));
  try {
    const v = JSON.parse(new TextDecoder().decode(raw ?? new Uint8Array())) as Record<string, unknown>;
    if (v["k"] !== kind) throw new Error("kind");
    const out: Record<string, number> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "k") continue;
      if (typeof x !== "number" || !Number.isSafeInteger(x)) throw new Error("field");
      out[k] = x;
    }
    if (out["n"] === undefined) throw new Error("n");
    return out;
  } catch {
    throw artroomError("bad-request", "The cursor is not valid for this read.");
  }
}

export function fromCursor(c: string | undefined, kind: string): number | null {
  return c ? decodeCursor(c, kind)["n"]! : null;
}

const END = Number.MAX_SAFE_INTEGER;

/**
 * An attention position: `pos`, which increases with every item made (review
 * 8faa2ef9). An earlier cursor carries (seq, n), or only a seq. It is read as
 * the position just before the first item after that point, so no item after
 * it is skipped; an item made later about an earlier entry may come again.
 */
function attentionPos(core: RoomCore, v: Record<string, number>, seqField: string, nField: string): number {
  if (v["p"] !== undefined) return v["p"];
  const seq = v[seqField] ?? v["n"]!;
  const n = v[nField] ?? END;
  const first = num(one(core.sql, "SELECT MIN(pos) AS p FROM attention WHERE seq > ? OR (seq = ? AND n > ?)", seq, seq, n), "p");
  if (first !== null) return first - 1;
  return num(one(core.sql, "SELECT MAX(pos) AS p FROM attention"), "p") ?? 0;
}

function limitOf(page: PageRequest | undefined): number {
  const l = page?.limit ?? 50;
  if (!Number.isSafeInteger(l) || l < 1 || l > 500) throw artroomError("bad-request", "The limit must be from 1 to 500.");
  return l;
}

export function publishedThrough(core: RoomCore): Seq {
  return Number(getMeta(core.sql, "published_through") ?? "-1");
}

// ------------------------------------------------------------ the read queries

export async function read<Q extends ReadQuery>(core: RoomCore, member: MemberId, q: Q): Promise<ReadResults[Q["q"]]> {
  const out = await readAny(core, member, q);
  return out as ReadResults[Q["q"]];
}

async function readAny(core: RoomCore, member: MemberId, q: ReadQuery): Promise<unknown> {
  switch (q.q) {
    case "lane":
      return laneOf(core, q.lane);
    case "lanes":
      return lanes(core, q.filter);
    case "proposal":
      return proposal(core, q.ref);
    case "op":
      return q.until && q.until.length ? waitOp(core, q.op, q.until, q.timeoutMs) : opById(core, q.op);
    case "attention":
      return attention(core, member, q.page);
    case "log":
      return logPage(core, q.req ?? {});
    case "explain":
      return explain(core, q.act);
    case "members":
      return rosterView(core.sql, core.headSeq());
    case "acts":
      return catalogue(core, q);
  }
}

// ------------------------------------------------------------ declarations (R-API-9 as amended, R-DECL-23)

const POLICY_VERSION = /^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$/;

/**
 * The declarations of one policy version, with each kind's binding
 * (`Catalogue`). With neither `at` nor `policy`: the active version. `at`
 * is an entry's seq, and the answer is the version in force there, `D(s)`.
 * `policy` names a version. Null when the room retains no such version: a
 * seq before the first activation, or an unknown version.
 *
 * A `v1` version answers with the legacy catalogue: it has no declarations
 * and no bindings (R-DECL-1). For a `v2` version, each kind carries the seq
 * of the first later activation that dropped it (R-DECL-23), whether or not
 * a still later document declares the name again.
 */
export function catalogue(core: RoomCore, q: { readonly at?: unknown; readonly policy?: unknown }): Catalogue | null {
  if (q.at !== undefined && q.policy !== undefined) throw artroomError("bad-request", "Give at or policy, not both."); // G5:read-one-selector
  let row: ReturnType<typeof one>;
  if (q.policy !== undefined) {
    if (typeof q.policy !== "string" || !POLICY_VERSION.test(q.policy)) throw artroomError("bad-request", "policy must be a policy version, the ID of a policy-activated entry."); // G5:read-policy-format
    row = one(core.sql, "SELECT version, seq, doc FROM policies WHERE version = ?", q.policy);
  } else if (q.at !== undefined) {
    if (typeof q.at !== "number" || !Number.isSafeInteger(q.at) || q.at < 0) throw artroomError("bad-request", "at must be an entry's seq, a whole number from 0."); // G5:read-at-format
    row = one(core.sql, "SELECT version, seq, doc FROM policies WHERE seq <= ? ORDER BY seq DESC LIMIT 1", q.at); // G5:read-at
  } else {
    row = one(core.sql, "SELECT version, seq, doc FROM policies WHERE version = ?", getMeta(core.sql, "policy"));
  }
  if (!row) return null;
  const policy = str(row, "version") as PolicyVersion;
  const since = num(row, "seq")!;
  const until = num(one(core.sql, "SELECT MIN(seq) AS s FROM policies WHERE seq > ?", since), "s"); // G5:read-until
  const doc = JSON.parse(str(row, "doc")!) as AnyPolicyDocument;
  if (!isDeclared(doc)) return { vocabulary: "artroom-legacy-v1", policy, since, until }; // G5:read-legacy
  // The first later version that does not declare each kind. Later documents are read in order, and only until every kind has one.
  const retired = new Map<string, number>();
  const kinds = Object.keys(doc.acts);
  if (until !== null) {
    for (const later of core.sql.all("SELECT seq, doc FROM policies WHERE seq > ? ORDER BY seq ASC", since)) {
      const d = JSON.parse(str(later, "doc")!) as AnyPolicyDocument;
      for (const kind of kinds) if (!retired.has(kind) && declarationOf(d, kind) === null) retired.set(kind, num(later, "seq")!); // G5:read-retired
      if (retired.size === kinds.length) break;
    }
  }
  const acts: Record<string, CatalogueAct> = {};
  for (const kind of kinds) {
    const r = retired.get(kind);
    acts[kind] = { declaration: doc.acts[kind]!, binding: digestJson(bindingSubject(doc, kind)) as Binding, ...(r !== undefined ? { retired: r } : {}) }; // G5:read-binding
  }
  return { vocabulary: "declared", policy, since, until, steps: doc.steps, lanes: doc.lanes, acts };
}

export function laneOf(core: RoomCore, id: LaneId): Lane | null {
  const row = laneRow(core.sql, id);
  return row ? laneView(core.sql, row, core.activeLandOp(id) ?? undefined) : null;
}

function lanes(core: RoomCore, filter: (LaneFilter & PageRequest) | undefined): Page<Lane> {
  const start = fromCursor(filter?.cursor, "lanes") ?? -1;
  const limit = limitOf(filter);
  const out: Lane[] = [];
  let last = start;
  let more = false;
  for (const id of allLaneIds(core.sql)) {
    const row = laneRow(core.sql, id)!;
    if (row.seq <= start) continue;
    if (filter?.state && row.state !== filter.state) continue;
    if (filter?.holder && row.holder !== filter.holder) continue;
    if (filter?.touches && !row.scope.some((g) => globsOverlap(g, filter.touches!))) continue;
    if (out.length === limit) {
      more = true;
      break;
    }
    out.push(laneView(core.sql, row, core.activeLandOp(id) ?? undefined));
    last = row.seq;
  }
  return { items: out, cursor: cursor("lanes", last), more };
}

/** A proposal, with its obligations and preview as they are now. Completes its pinned ref first (R-PROP-1 step 2). */
export async function proposal(core: RoomCore, ref: ProposalRef): Promise<Proposal | null> {
  const g = generationRow(core.sql, ref.lane, ref.generation);
  if (!g) return null;
  const pin = one(core.sql, "SELECT ref, done FROM pins WHERE ref = ?", `refs/artroom/heads/${ref.lane}/${ref.generation}`);
  if (pin && num(pin, "done") === 0) {
    try {
      await core.completePins(true);
    } catch (e) {
      core.diagnose("read-failed", "completePins", e);
      throw artroomError("unavailable", "The proposal's pinned ref is not written yet. Retry.");
    }
  }
  const stored = JSON.parse(str(one(core.sql, "SELECT body FROM records WHERE id = ?", g.act), "body")!) as Proposal;
  const { lane, generation, head, base, pinnedRef, summary, changed, obligations, notCarried, preview, ...rest } = stored;
  void lane, generation, head, base, pinnedRef, summary, changed, obligations, notCarried, preview;
  return proposalRecord(core, rest as never, ref.lane, ref.generation, core.activePolicy());
}

export function opById(core: RoomCore, id: string): OpByKind[OpKind] {
  if (id.startsWith("op_land_")) {
    const v = core.landing.view(id as `op_${string}`);
    if (v) return v;
  } else if (id.startsWith("op_preview_")) {
    const r = one(core.sql, "SELECT body FROM previews WHERE id = ?", id);
    if (r) return JSON.parse(str(r, "body")!) as OpByKind["preview"];
  } else if (id.startsWith("op_ws_")) {
    // Lane B's workspace operation IDs: `op_ws_<lane>_<lease generation>`; only the lane's current one is shown.
    const m = /^op_ws_(act_\d+_[0-9a-f]{8})_\d+$/.exec(id);
    if (m && core.founded) {
      const v = core.workspaces.view(m[1] as LaneId);
      if (v && v.id === id) return v;
    }
  }
  throw artroomError("not-found", `There is no operation ${id}.`);
}

/** Resolve when the operation reaches one of `until` (R-API-5). Default 30 s, at most 300 s. */
export async function waitOp(core: RoomCore, id: string, until: readonly string[], timeoutMs = 30_000): Promise<OpByKind[OpKind]> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300_000) throw artroomError("bad-request", "timeoutMs must be from 0 to 300000.");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const op = opById(core, id);
    if (until.includes(op.state)) return op;
    const left = deadline - Date.now();
    if (left <= 0) throw artroomError("timeout", `The operation is still ${op.state}.`, { maybeRecorded: false });
    await core.changed(Math.min(left, 1000));
  }
}

// ------------------------------------------------------------ attention

function principalsOf(core: RoomCore, member: MemberId): string[] {
  const m = memberRow(core.sql, member);
  return [member, ...teamsOf(core.sql, member), ...(m ? [`role:${m.role}`] : [])];
}

/** Is a stored item still open? Review and check requests close when met or superseded. */
function stillOpen(core: RoomCore, item: AttentionItem): boolean {
  if (item.why === "review-requested" || item.why === "check-requested") {
    const lane = laneRow(core.sql, item.proposal.lane);
    if (!lane || lane.generation !== item.proposal.generation) return false;
    const o = obligationsFor(core.sql, item.proposal.lane, item.proposal.generation, { doc: core.activePolicy().doc }).find((x) => x.id === item.obligation);
    return !!o && o.state !== "met";
  }
  // Open while the repository is still gone, as recorded when this item was made (request 3da1d82b).
  if (item.why === "log-publication-stalled" && item.reason === "repository-gone") return core.canonicalGone()?.since === item.since;
  return item.open;
}

/** Items for a member after a position, in the order they were made, up to `maxSeq`. */
export function attentionItems(core: RoomCore, member: MemberId, afterPos: number, limit: number, maxSeq: Seq = END): (AttentionItem & { readonly pos: number })[] {
  const ps = principalsOf(core, member);
  const marks = ps.map(() => "?").join(", ");
  return core.sql
    .all(`SELECT id, seq, pos, lane, item, open FROM attention WHERE principal IN (${marks}) AND pos > ? AND seq <= ? ORDER BY pos LIMIT ?`, ...ps, afterPos, maxSeq, limit)
    .map((r) => {
      const item = { ...(JSON.parse(str(r, "item")!) as object), id: str(r, "id")!, seq: num(r, "seq")!, ...(str(r, "lane") ? { lane: str(r, "lane") } : {}), open: num(r, "open") === 1 } as AttentionItem;
      return Object.assign({ ...item, open: stillOpen(core, item) }, { pos: num(r, "pos")! });
    });
}

/** Strip the internal position from items before they are returned. */
function shown(items: readonly (AttentionItem & { readonly pos: number })[]): AttentionItem[] {
  return items.map(({ pos, ...item }) => (void pos, item as AttentionItem));
}

function attention(core: RoomCore, member: MemberId, page: PageRequest | undefined): AttentionPage {
  const start = page?.cursor ? attentionPos(core, decodeCursor(page.cursor, "attention"), "n", "i") : 0;
  const limit = limitOf(page);
  const items = attentionItems(core, member, start, limit + 1);
  const more = items.length > limit;
  const page1 = items.slice(0, limit);
  const last = page1.length ? page1[page1.length - 1]! : null;
  // R-API-9: the page carries publishedThrough from the same read.
  return { items: shown(page1), cursor: cursor("attention", last ? last.seq : -1, { p: last ? last.pos : start }), more, publishedThrough: publishedThrough(core) };
}

// ------------------------------------------------------------ the log (R-API-7, R-LOG-11)

function logPage(core: RoomCore, req: { after?: Seq; cursor?: Cursor; limit?: number }): LogPage {
  const fromC = fromCursor(req.cursor, "log");
  const after = fromC ?? req.after ?? -1;
  const limit = limitOf(req);
  const acts = entriesAfter(core.sql, after, limit + 1);
  const more = acts.length > limit;
  const shown = acts.slice(0, limit);
  const last = shown.length ? shown[shown.length - 1]!.seq : after;
  return { acts: shown, cursor: cursor("log", last), more, publishedThrough: publishedThrough(core), head: core.headSeq() };
}

// ------------------------------------------------------------ explain

function explain(core: RoomCore, act: ActId): Explanation | null {
  const entry = entryById(core.sql, act);
  if (!entry) return null;
  const invariants = JSON.parse(str(one(core.sql, "SELECT invariants FROM explain WHERE seq = ?", entry.seq), "invariants") ?? "[]") as Explanation["invariants"];
  const e = entry.entry;
  const decisions = e.type === "system" ? (e.event.type === "notified" ? e.event.decisions : []) : e.receipt.decisions;
  let evidence: Explanation["evidence"];
  // An act with step `version`, whatever its kind is called: the version row names the act that made it.
  if (e.type === "act") {
    const t = e.act.envelope.target as { lane: LaneId } | null;
    const g = t && typeof t.lane === "string" ? one(core.sql, "SELECT generation FROM generations WHERE act = ?", act) : undefined; // G2:explain-version
    if (g && t) {
      const gen = generationRow(core.sql, t.lane, num(g, "generation")!)!;
      evidence = obligationsFor(core.sql, t.lane, gen.generation, { doc: core.activePolicy().doc })
        .map(publicObligation)
        .map((o) => ({ obligation: o.id, evidence: o.evidence, notCarried: gen.notCarried }));
    }
  }
  // What the kind meant at this entry's own seq, D(s), never under the active document (R-DECL-23).
  const at = e.type === "system" ? null : catalogue(core, { at: entry.seq }); // G5:explain-at-seq
  return {
    act,
    kind: e.type === "system" ? "system" : e.act.envelope.kind,
    outcome: e.type === "act" ? "accepted" : e.type === "refusal" ? "refused" : "system",
    entry,
    decisions,
    invariants,
    ...(evidence ? { evidence } : {}),
    published: entry.seq <= publishedThrough(core),
    ...(at !== null && e.type !== "system" ? { meaning: meaningOf(at, e.act.envelope.kind) } : {}),
  };
}

// ------------------------------------------------------------ live updates (R-API-8)

export function summary(e: LogEntry): EntrySummary {
  const x = e.entry;
  if (x.type === "system") {
    const lane = "lane" in x.event && typeof x.event.lane === "string" ? (x.event.lane as LaneId) : x.event.type === "revert-lane" ? idOf(e) : undefined;
    return { id: idOf(e), seq: e.seq, type: "system", kind: x.event.type, ...(lane ? { lane } : {}), by: null, at: e.at };
  }
  const env = x.act.envelope;
  const t = env.target as { lane?: LaneId } | null;
  // An act that opened a thread, whatever its kind is called: its receipt has the `opened` effect, and the thread's ID is its own.
  const lane = t?.lane ?? (x.type === "act" && x.receipt.effects.some((f) => f.type === "opened") ? idOf(e) : undefined); // G2:summary-opened
  return { id: idOf(e), seq: e.seq, type: x.type, kind: env.kind, ...(lane ? { lane } : {}), by: x.receipt.authority.member, at: e.at };
}

/** A cursor at the live tail: the current head and the latest attention position. A subscription fixes it once, when it starts. */
export function liveCursor(core: RoomCore): Cursor {
  return cursor("updates", core.headSeq(), { p: num(one(core.sql, "SELECT MAX(pos) AS p FROM attention"), "p") ?? 0 });
}

/** At most this many entries, and this many attention items, per update. */
export const UPDATE_LIMIT = 100;

/**
 * The next update after a cursor. Entries and attention items each keep
 * their own position, so a full page of either never moves the cursor past
 * an item the reader has not seen; an item made later, even about an entry
 * already delivered, comes after the cursor (reviews aabda1ed and 8faa2ef9).
 */
export function updateAfter(core: RoomCore, member: MemberId, c: string | undefined): Update {
  const v = decodeCursor(c ?? liveCursor(core), "updates");
  const after = v["n"]!;
  const att = attentionPos(core, v, "as", "an");
  const entries = entriesAfter(core.sql, after, UPDATE_LIMIT);
  const last = entries.length ? entries[entries.length - 1]!.seq : after;
  // In position order, up to the first item whose entry this update does not deliver yet.
  const all = attentionItems(core, member, att, UPDATE_LIMIT);
  const stop = all.findIndex((a) => a.seq > last);
  const items = stop < 0 ? all : all.slice(0, stop);
  const lastPos = items.length ? items[items.length - 1]!.pos : att;
  return { cursor: cursor("updates", last, { p: lastPos }), entries: entries.map(summary), attention: shown(items), publishedThrough: publishedThrough(core) };
}

export { memberRow };
