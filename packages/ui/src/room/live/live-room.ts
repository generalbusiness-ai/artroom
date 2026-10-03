/**
 * The live adapter: a stub over the contract's `HttpRoom` (HTTPS reads and
 * acts) and its browser WebSocket `watch`. The client package that
 * implements `connect()` does not exist yet, so the caller passes in an
 * `HttpRoom`. Everything the contract has no read for is reported as
 * unavailable rather than guessed (README.md, "Contract gaps").
 *
 * It never asks for a workspace token (R-WS-2) and keeps nothing secret.
 *
 * Declared acts (stage 5, request a5d64b35): it reads the active
 * declarations for preparing an act, and for each record the declarations
 * that governed its own seq, `D(s)` (R-DECL-23). A record is never read
 * through the active declarations. It sends a generic act once, with the
 * binding it was given, and never rereads, rebinds or resends on its own.
 *
 * Each guard is one statement marked `// G5U:<id>`.
 */

import { builtForBinding, governs, meaningOf } from "@generalbusiness/artroom-policy/declared";
import type {
  ActId,
  Binding,
  Catalogue,
  Check,
  Cursor,
  DeclaredRecord,
  DeclaredTarget,
  Json,
  KindName,
  Page,
  HttpRoom,
  Lane,
  LandOp,
  LogEntry,
  MemberId,
  Note,
  NoteAnchor,
  Proposal,
  ProposalAt,
  ProposalRef,
  PublicationSlot,
  RecordMeaning,
  Result,
  Review,
  Seq,
  Step,
  Subscription,
} from "../contract.ts";
import { holdsSlot } from "../contract.ts";
import type { CheckCarry, DraftRule, DryRunResult, FileDiff, Person, PolicyOutcome, ReviewDraft, RoomAdapter, RoomSnapshot, Why } from "../adapter.ts";
import { entryMeaning, shapeOfTarget } from "../acts.ts";
import { describeEntry, entryId, withRecovery, type Under } from "./describe.ts";

/** How a `LiveRoom` presents itself. The declared demo room is a `LiveRoom` over an in-memory room. */
export interface LiveOptions {
  readonly source?: "mock" | "live";
  /** Members the viewer may switch to, and what switching does. One identity when absent. */
  readonly viewers?: readonly MemberId[];
  readonly onViewer?: (member: MemberId) => void;
}

export class LiveRoom implements RoomAdapter {
  readonly kind: "mock" | "live";
  readonly viewers: readonly MemberId[];
  private snap: RoomSnapshot | null = null;
  /** The catalogues read for the active policy version `key`. A new activation can retire a kind of an earlier version, so they are dropped then. */
  private catalogues: { key: string | null; list: Catalogue[] } = { key: null, list: [] };
  /** The code-review bindings under each catalogue read, by kind. */
  private readonly builtFor = new WeakMap<Catalogue, Promise<ReadonlyMap<string, Binding>>>();
  private readonly listeners = new Set<() => void>();
  private watching: Subscription | null = null;
  private refreshing: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly room: HttpRoom,
    private me: MemberId,
    private readonly clock: () => Date = () => new Date(),
    private readonly opts: LiveOptions = {},
  ) {
    this.kind = opts.source ?? "live";
    this.viewers = opts.viewers ?? [me];
  }

  /** Load once, then follow the room's WebSocket. */
  async start(): Promise<void> {
    await this.refresh();
    const cursor = undefined;
    this.watching = this.room.watch(cursor, () => void this.refresh());
  }

  stop() {
    this.watching?.close();
    this.watching = null;
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) {
      // A change that arrives while a load is running is not lost: one more load follows it.
      this.again = true; // G5U:refresh-again
      return this.refreshing;
    }
    this.refreshing = this.load()
      .then((snap) => {
        this.snap = snap;
      })
      .catch((err: unknown) => {
        const note = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "The room did not answer.";
        if (this.snap) this.snap = { ...this.snap, source: { kind: this.kind, status: "offline", note } };
      })
      .finally(() => {
        this.refreshing = null;
        for (const l of this.listeners) l();
        if (this.again) {
          this.again = false;
          void this.refresh();
        }
      });
    return this.refreshing;
  }

  /** The active declarations, or null when this room or transport cannot give them. Never guessed. */
  private async activeCatalogue(): Promise<Catalogue | null> {
    try {
      return await this.room.acts();
    } catch {
      return null; // G5U:catalogue-unavailable
    }
  }

  /** `D(s)`: the catalogue that governs the entry at `seq`, read once per policy version. */
  private async governing(seq: Seq): Promise<Catalogue | null> {
    const hit = this.catalogues.list.find((c) => governs(c, seq)); // G5U:governs
    if (hit) return hit;
    let c: Catalogue | null;
    try {
      c = await this.room.actsAt({ seq });
    } catch {
      return null;
    }
    if (c) this.catalogues.list.push(c);
    return c;
  }

  /** The binding each code-review sentence was written for, under one catalogue. */
  private codeReviewBindings(c: Catalogue): Promise<ReadonlyMap<string, Binding>> {
    let known = this.builtFor.get(c);
    if (!known) {
      known = (async () => {
        const out = new Map<string, Binding>();
        if (c.vocabulary !== "declared") return out;
        for (const kind of Object.keys(c.acts)) {
          const b = await builtForBinding(c, kind);
          if (b !== null) out.set(kind, b);
        }
        return out;
      })();
      this.builtFor.set(c, known);
    }
    return known;
  }

  /** How one entry's kind is read: under the catalogue of its own seq. */
  private async under(e: LogEntry): Promise<Under> {
    if (e.entry.type === "system") return { meaning: null };
    const env = e.entry.act.envelope as unknown as { kind: string; binding?: string };
    const c = await this.governing(e.seq);
    if (!c) return { meaning: null };
    const meaning = meaningOf(c, env.kind); // G5U:meaning-at-seq
    const builtFor = meaning.vocabulary === "declared" && (await this.codeReviewBindings(c)).get(env.kind) === env.binding && env.binding !== undefined; // G5U:built-for-binding
    return { meaning, builtFor };
  }

  private async load(): Promise<RoomSnapshot> {
    const [roster, lanePage, attention, log, catalogue] = await Promise.all([
      this.room.members(),
      readAll((cursor) => this.room.lanes({ limit: 500, ...(cursor ? { cursor } : {}) })),
      readAll((cursor) => this.room.attention({ limit: 200, ...(cursor ? { cursor } : {}) })),
      this.readLog(),
      this.activeCatalogue(),
    ]);
    // A new activation may retire a kind of an earlier version, so earlier catalogues are read again after one.
    if ((catalogue?.policy ?? null) !== this.catalogues.key) this.catalogues = { key: catalogue?.policy ?? null, list: [] }; // G5U:catalogue-refresh
    const lanes: Lane[] = [...lanePage.items];
    const proposals: Proposal[] = [];
    for (const lane of lanes) {
      for (const g of lane.generations) {
        const p = await this.room.proposal({ lane: lane.lane, generation: g.generation });
        if (p) proposals.push(p);
      }
    }
    const landOps: LandOp[] = [];
    for (const lane of lanes) if (lane.landing) landOps.push(await this.room.op({ id: lane.landing, kind: "land" }));

    const people: Person[] = roster.members
      .filter((m) => m.state === "active")
      .map((m) => ({
        handle: m.handle,
        name: m.handle.slice(1),
        role: m.role,
        kind: m.role === "agent" ? "agent" : m.role === "checker" ? "service" : "person",
        teams: m.teams,
      }));

    const entries = log.acts;
    const unders: Under[] = [];
    for (const e of entries) unders.push(await this.under(e));
    const feed = entries.map((e, i) => withRecovery(describeEntry(e, unders[i]!), landOps));
    const records = recordsFromLog(entries, unders);
    const checkCarries: CheckCarry[] = entries.flatMap((e) =>
      e.entry.type === "system" && e.entry.event.type === "check-carried" ? [{ id: entryId(e), seq: e.seq, at: e.at, event: e.entry.event }] : [],
    );
    const outcomes: PolicyOutcome[] = entries.flatMap((e) => {
      const r = e.entry.type === "system" ? null : e.entry.receipt;
      if (!r || e.entry.type === "system") return [];
      const by = r.authority.member;
      return r.decisions
        .filter((d) => d.outcome.result !== "pass")
        .map((d) => ({ seq: e.seq, at: e.at, act: entryId(e), actKind: e.entry.type === "system" ? "system" : e.entry.act.envelope.kind, by, decision: d, text: `${d.rule}: ${d.outcome.result}` }));
    });

    // The contract has no read for the slot. A loaded landing that holds it
    // proves it is held; nothing here can prove it is free.
    const held = landOps.find(holdsSlot);
    const slot: PublicationSlot | null =
      held && holdsSlot(held)
        ? { state: "held", op: held.id, publication: held.publication, reservedAt: held.reservedAt, ...(held.state === "unresolved" ? { unresolvedSince: held.since } : {}) }
        : null;

    return {
      room: { id: this.room.id, name: this.room.name },
      now: this.clock().toISOString(),
      viewer: this.me,
      people,
      main: { head: null, movedAt: null },
      lanes,
      proposals,
      ...records,
      checkCarries,
      landOps,
      slot,
      coverage: { lanes: lanePage.complete, attention: attention.complete, feed: { from: log.from, complete: log.complete } },
      attention: attention.items,
      feed,
      log: { head: log.head, publishedThrough: log.publishedThrough },
      policy: { version: catalogue?.policy ?? null, activatedAt: catalogue?.since ?? null, document: null, outcomes },
      catalogue,
      source: { kind: this.kind, status: "live" },
    };
  }

  /**
   * The newest log window: up to WINDOW entries before the head, following
   * the cursor. The counters come from the room's last page, not from how many
   * entries arrived.
   */
  private async readLog(): Promise<{ acts: LogEntry[]; head: number; publishedThrough: number; from: number; complete: boolean }> {
    const probe = await this.room.log({ after: -1, limit: 1 });
    const after = Math.max(-1, probe.head - WINDOW);
    const acts: LogEntry[] = [];
    let page = await this.room.log({ after, limit: 500 });
    let complete = !page.more;
    acts.push(...page.acts);
    const seen = new Set<string>([page.cursor]);
    for (let i = 1; i < MAX_PAGES && page.more; i++) {
      const next = await this.room.log({ after, limit: 500, cursor: page.cursor });
      if (seen.has(next.cursor) && next.more) break; // the cursor did not advance
      seen.add(next.cursor);
      page = next;
      acts.push(...page.acts);
      complete = !page.more;
    }
    return { acts, head: page.head, publishedThrough: page.publishedThrough, from: after + 1, complete };
  }

  snapshot(): RoomSnapshot | null {
    return this.snap;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async diff(_ref: ProposalRef): Promise<readonly FileDiff[] | null> {
    return null; // No diff read in the contract yet.
  }

  changedSince(_ref: ProposalRef) {
    return null; // No interdiff read in the contract yet.
  }

  async explain(act: ActId): Promise<Why | null> {
    const x = await this.room.explain(act);
    if (!x) return null;
    const e = x.entry.entry;
    const by = e.type === "system" ? null : e.receipt.authority.member;
    const body = e.type === "system" ? null : (e.act.envelope.body as { because?: Why["reasons"] });
    // The room computes the meaning under D(s); where an older room does not, it is read the same way as the feed's.
    const read = await this.under(x.entry);
    const under: Under = x.meaning ? { ...read, meaning: x.meaning } : read; // G5U:explain-meaning
    return {
      act: x.act,
      title: withRecovery(describeEntry(x.entry, under), this.snap?.landOps ?? []).text,
      by,
      seq: x.entry.seq,
      outcome: x.outcome,
      decisions: x.decisions,
      invariants: x.invariants,
      reasons: body?.because ?? [],
      published: x.published,
      ...(e.type !== "system" && under.meaning ? { meaning: entryMeaning(e.act.envelope, under.meaning) } : {}),
    };
  }

  async readCatalogue(): Promise<Catalogue | null> {
    const catalogue = await this.activeCatalogue();
    if (this.snap) {
      this.snap = { ...this.snap, catalogue, policy: { ...this.snap.policy, version: catalogue?.policy ?? null, activatedAt: catalogue?.since ?? null } };
      for (const l of this.listeners) l();
    }
    return catalogue;
  }

  async catalogueAt(seq: Seq): Promise<Catalogue | null> {
    return this.governing(seq);
  }

  async act(kind: KindName, target: DeclaredTarget, body: { readonly [field: string]: Json }, binding: Binding): Promise<Result<DeclaredRecord>> {
    // Exactly this kind, target, body and binding, once (R-DECL-16).
    const r = await this.room.act(kind, target, body, { binding }); // G5U:act-binding
    void this.refresh();
    return r;
  }

  async review(at: ProposalAt, draft: ReviewDraft): Promise<Result<Review>> {
    const r = await this.room.review(at, { verdict: draft.verdict, scope: draft.scope, dependsOn: draft.dependsOn, text: draft.text });
    void this.refresh();
    return r;
  }

  async note(anchor: NoteAnchor, text: string, replyTo?: ActId): Promise<Result<Note>> {
    const r = await this.room.note(anchor, { text, ...(replyTo ? { replyTo } : {}) });
    void this.refresh();
    return r;
  }

  async dryRun(_draft: DraftRule): Promise<Result<DryRunResult>> {
    return {
      refused: true,
      rule: "dry-run-unavailable",
      reason: "The live room has no dry-run endpoint in the contract yet.",
      fix: "Try the draft in the demo room, or run it with the policy package's evaluator.",
    };
  }

  setViewer(member: MemberId) {
    // One identity, the credential's, unless the room behind this adapter lets the viewer change.
    if (!this.opts.onViewer || !this.viewers.includes(member)) return;
    this.me = member;
    this.opts.onViewer(member);
    void this.refresh();
  }
}

const WINDOW = 500;
const MAX_PAGES = 20;

/** Follow a paginated read to its end, or stop and say it is incomplete (a cap, or a cursor that does not advance). */
async function readAll<T>(read: (cursor?: Cursor) => Promise<Page<T>>): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: Cursor | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await read(cursor);
    items.push(...page.items);
    if (!page.more) return { items, complete: true };
    if (seen.has(page.cursor)) break;
    seen.add(page.cursor);
    cursor = page.cursor;
  }
  return { items, complete: false };
}

/**
 * The step a record ran that the review screens read: `review`, `check` or
 * `comment`. For a declared record it comes from the declaration in force at
 * the record's seq, by the target's shape, so an application's own name for
 * a review or a check is still evidence. Otherwise it is the legacy kind.
 */
function evidenceStep(kind: string, target: unknown, meaning: RecordMeaning | null): Step | null {
  if (meaning?.vocabulary === "declared") {
    const shape = shapeOfTarget(target);
    const steps = (shape ? meaning.declaration.targets[shape] : undefined) as readonly Step[] | undefined;
    return steps?.find((s) => s === "review" || s === "check" || s === "comment") ?? null; // G5U:evidence-by-step
  }
  if (meaning !== null && meaning.vocabulary !== "artroom-legacy-v1") return null;
  return kind === "review" ? "review" : kind === "check" ? "check" : kind === "note" ? "comment" : null;
}

/** Rebuild review, check and note records from their log entries, each read under its own meaning. */
function recordsFromLog(entries: readonly LogEntry[], unders: readonly Under[]): { reviews: Review[]; checks: Check[]; notes: Note[] } {
  const reviews: Review[] = [];
  const checks: Check[] = [];
  const notes: Note[] = [];
  entries.forEach((e, i) => {
    if (e.entry.type !== "act") return;
    const env = e.entry.act.envelope as unknown as { kind: string; target: unknown; body: Record<string, unknown> };
    const r = e.entry.receipt;
    const base = { id: entryId(e), seq: e.seq, by: r.authority, at: e.at, flags: r.flags, ...(r.after ? { after: r.after } : {}) };
    const step = evidenceStep(env.kind, env.target, unders[i]?.meaning ?? null);
    const t = (env.target ?? {}) as { lane?: unknown; generation?: unknown };
    const b = env.body;
    if (step === "review") {
      reviews.push({ ...base, kind: "review", lane: t.lane, generation: t.generation, head: b["head"], verdict: b["verdict"], scope: b["scope"], dependsOn: b["dependsOn"] ?? [], text: b["text"] ?? "", fulfils: [] } as unknown as Review);
    } else if (step === "check") {
      const { obligation, check, integration, input, config, runner, volatile, ok, detail, landOp } = b;
      checks.push({ ...base, kind: "check", lane: t.lane, generation: t.generation, obligation, check, integration, input, config, runner, volatile, ok, detail, ...(landOp ? { landOp } : {}) } as unknown as Check);
    } else if (step === "comment" && typeof b["text"] === "string") {
      notes.push({ ...base, kind: "note", anchor: env.target, text: b["text"], ...(b["replyTo"] ? { replyTo: b["replyTo"] } : {}) } as unknown as Note);
    }
  });
  return { reviews, checks, notes };
}
