/**
 * The live adapter: a stub over the contract's `HttpRoom` (HTTPS reads and
 * acts) and its browser WebSocket `watch`. The client package that
 * implements `connect()` does not exist yet, so the caller passes in an
 * `HttpRoom`. Everything the contract has no read for is reported as
 * unavailable rather than guessed (README.md, "Contract gaps").
 *
 * It never asks for a workspace token (R-WS-2) and keeps nothing secret.
 */

import type {
  ActId,
  Check,
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
  Result,
  Review,
  Subscription,
} from "../contract.ts";
import { holdsSlot } from "../contract.ts";
import type { DraftRule, DryRunResult, FileDiff, Person, PolicyOutcome, ReviewDraft, RoomAdapter, RoomSnapshot, Why } from "../adapter.ts";
import { describeEntry, entryId } from "./describe.ts";

export class LiveRoom implements RoomAdapter {
  readonly kind = "live" as const;
  readonly viewers: readonly MemberId[];
  private snap: RoomSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private watching: Subscription | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly room: HttpRoom,
    private readonly me: MemberId,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.viewers = [me];
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
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.load()
      .then((snap) => {
        this.snap = snap;
      })
      .catch((err: unknown) => {
        const note = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "The room did not answer.";
        if (this.snap) this.snap = { ...this.snap, source: { kind: "live", status: "offline", note } };
      })
      .finally(() => {
        this.refreshing = null;
        for (const l of this.listeners) l();
      });
    return this.refreshing;
  }

  private async load(): Promise<RoomSnapshot> {
    const [roster, lanePage, attention, log] = await Promise.all([
      this.room.members(),
      this.room.lanes({ limit: 500 }),
      this.room.attention({ limit: 200 }),
      this.room.log({ after: -1, limit: 500 }),
    ]);
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
    const feed = entries.map(describeEntry);
    const records = recordsFromLog(entries);
    const outcomes: PolicyOutcome[] = entries.flatMap((e) => {
      const r = e.entry.type === "system" ? null : e.entry.receipt;
      if (!r || e.entry.type === "system") return [];
      const by = r.authority.member;
      return r.decisions
        .filter((d) => d.outcome.result !== "pass")
        .map((d) => ({ seq: e.seq, at: e.at, act: entryId(e), actKind: e.entry.type === "system" ? "system" : e.entry.act.envelope.kind, by, decision: d, text: `${d.rule}: ${d.outcome.result}` }));
    });

    const held = landOps.find(holdsSlot);
    const slot: PublicationSlot = held && holdsSlot(held)
      ? { state: "held", op: held.id, publication: held.publication, reservedAt: held.reservedAt, ...(held.state === "unresolved" ? { unresolvedSince: held.since } : {}) }
      : { state: "free", last: 0 };

    return {
      room: { id: this.room.id, name: this.room.name },
      now: this.clock().toISOString(),
      viewer: this.me,
      people,
      main: { head: null, movedAt: null },
      lanes,
      proposals,
      ...records,
      landOps,
      slot,
      attention: attention.items,
      feed,
      log: { head: log.head, publishedThrough: log.publishedThrough },
      policy: { version: null, activatedAt: null, document: null, outcomes },
      source: { kind: "live", status: "live" },
    };
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
    return {
      act: x.act,
      title: describeEntry(x.entry).text,
      by,
      seq: x.entry.seq,
      outcome: x.outcome,
      decisions: x.decisions,
      invariants: x.invariants,
      reasons: body?.because ?? [],
      published: x.published,
    };
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

  setViewer(_member: MemberId) {
    // One identity: the credential's.
  }
}

/** Rebuild review, check and note records from their log entries. */
function recordsFromLog(entries: readonly LogEntry[]): { reviews: Review[]; checks: Check[]; notes: Note[] } {
  const reviews: Review[] = [];
  const checks: Check[] = [];
  const notes: Note[] = [];
  for (const e of entries) {
    if (e.entry.type !== "act") continue;
    const env = e.entry.act.envelope;
    const r = e.entry.receipt;
    const base = { id: entryId(e), seq: e.seq, by: r.authority, at: e.at, flags: r.flags, ...(r.after ? { after: r.after } : {}) };
    if (env.kind === "review") {
      reviews.push({ ...base, kind: "review", lane: env.target.lane, generation: env.target.generation, head: env.body.head, verdict: env.body.verdict, scope: env.body.scope, dependsOn: env.body.dependsOn ?? [], text: env.body.text, fulfils: [] });
    } else if (env.kind === "check") {
      const { obligation, check, integration, input, config, runner, volatile, ok, detail, landOp } = env.body;
      checks.push({ ...base, kind: "check", lane: env.target.lane, generation: env.target.generation, obligation, check, integration, input, config, runner, volatile, ok, detail, ...(landOp ? { landOp } : {}) });
    } else if (env.kind === "note") {
      notes.push({ ...base, kind: "note", anchor: env.target, text: env.body.text, ...(env.body.replyTo ? { replyTo: env.body.replyTo } : {}) });
    }
  }
  return { reviews, checks, notes };
}
