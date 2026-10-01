/**
 * Reads, attention, explain, the log and live updates (R-API-5 to R-API-8,
 * R-LOG-11). Every page carries a cursor (R-API-6). Nothing returned here
 * holds a credential (R-WS-1, R-WS-4).
 */

import type {
  ActId,
  AttentionItem,
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
import { b64url, unb64url } from "./crypto.ts";
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
export function cursor(kind: string, n: number): Cursor {
  return `c1.${b64url(utf8(JSON.stringify({ k: kind, n })))}` as Cursor;
}

export function fromCursor(c: string | undefined, kind: string): number | null {
  if (!c) return null;
  if (!c.startsWith("c1.")) throw artroomError("bad-request", "The cursor is not valid.");
  const raw = unb64url(c.slice(3));
  try {
    const v = JSON.parse(new TextDecoder().decode(raw ?? new Uint8Array())) as { k: string; n: number };
    if (v.k !== kind || !Number.isSafeInteger(v.n)) throw new Error("kind");
    return v.n;
  } catch {
    throw artroomError("bad-request", "The cursor is not valid for this read.");
  }
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
  }
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
      await core.completePins();
    } catch {
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
    const r = one(core.sql, "SELECT body FROM workspaces WHERE id = ?", id);
    if (r) return JSON.parse(str(r, "body")!) as OpByKind["workspace"];
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
  return item.open;
}

export function attentionItems(core: RoomCore, member: MemberId, afterSeq: Seq, limit: number): AttentionItem[] {
  const ps = principalsOf(core, member);
  const marks = ps.map(() => "?").join(", ");
  return core.sql
    .all(`SELECT id, seq, lane, item, open FROM attention WHERE principal IN (${marks}) AND seq > ? ORDER BY seq, id LIMIT ?`, ...ps, afterSeq, limit)
    .map((r) => {
      const item = { ...(JSON.parse(str(r, "item")!) as object), id: str(r, "id")!, seq: num(r, "seq")!, ...(str(r, "lane") ? { lane: str(r, "lane") } : {}), open: num(r, "open") === 1 } as AttentionItem;
      return { ...item, open: stillOpen(core, item) };
    });
}

function attention(core: RoomCore, member: MemberId, page: PageRequest | undefined): Page<AttentionItem> {
  const start = fromCursor(page?.cursor, "attention") ?? -1;
  const limit = limitOf(page);
  const items = attentionItems(core, member, start, limit + 1);
  const more = items.length > limit;
  const shown = items.slice(0, limit);
  const last = shown.length ? shown[shown.length - 1]!.seq : start;
  return { items: shown, cursor: cursor("attention", last), more };
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
  if (e.type === "act" && e.act.envelope.kind === "propose") {
    const t = e.act.envelope.target as { lane: LaneId };
    const g = one(core.sql, "SELECT generation FROM generations WHERE act = ?", act);
    if (g) {
      const gen = generationRow(core.sql, t.lane, num(g, "generation")!)!;
      evidence = obligationsFor(core.sql, t.lane, gen.generation, { doc: core.activePolicy().doc })
        .map(publicObligation)
        .map((o) => ({ obligation: o.id, evidence: o.evidence, notCarried: gen.notCarried }));
    }
  }
  return {
    act,
    kind: e.type === "system" ? "system" : e.act.envelope.kind,
    outcome: e.type === "act" ? "accepted" : e.type === "refusal" ? "refused" : "system",
    entry,
    decisions,
    invariants,
    ...(evidence ? { evidence } : {}),
    published: entry.seq <= publishedThrough(core),
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
  const lane = t?.lane ?? (env.kind === "claim" && env.target === null && x.type === "act" ? idOf(e) : undefined);
  return { id: idOf(e), seq: e.seq, type: x.type, kind: env.kind, ...(lane ? { lane } : {}), by: x.receipt.authority.member, at: e.at };
}

/** A cursor at the live tail: the current head. A subscription fixes it once, when it starts. */
export function liveCursor(core: RoomCore): Cursor {
  return cursor("updates", core.headSeq());
}

/** The next update after a cursor: new entries and new attention items. No cursor means the live tail now. */
export function updateAfter(core: RoomCore, member: MemberId, c: string | undefined): Update {
  const from = fromCursor(c, "updates") ?? core.headSeq();
  const entries = entriesAfter(core.sql, from, 100);
  const last = entries.length ? entries[entries.length - 1]!.seq : from;
  const attention = attentionItems(core, member, from, 100).filter((a) => a.seq <= last);
  return { cursor: cursor("updates", last), entries: entries.map(summary), attention, publishedThrough: publishedThrough(core) };
}

export { memberRow };
