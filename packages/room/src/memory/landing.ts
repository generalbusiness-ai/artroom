/**
 * An in-memory `LandingPort` for tests and local development. It follows
 * lane B's landing state machine (R-LAND, R-PUB, R-REV-5) closely enough to
 * exercise the Room's side: admission of `land`, the `LandingHost`
 * callbacks, `after` stamping (R-LAND-8), invalidation before reservation
 * (R-LAND-9), and abort attempts (R-REV-5). Lane B's `Landing` replaces it in
 * production; it keeps the same interface.
 *
 * Tests steer the publisher with `controls`: pause a push in flight, make
 * pushes fail, then let the paused push complete.
 */

import type {
  ActId,
  Digest,
  FailReason,
  KeyId,
  LandOp,
  LaneId,
  OpId,
  PolicyVersion,
  PublicationSlot,
  Refusal,
  RetryReason,
  Seq,
  Sha,
} from "@generalbusiness/artroom-contract";
import { iso } from "../ids.ts";
import type { AcceptInput, LandingHost, LandingPort, LandRecordLike, Sql } from "../ports.ts";
import type { MemoryArtifacts } from "./artifacts.ts";

type State = LandOp["state"];

interface Rec {
  readonly id: OpId;
  readonly lane: LaneId;
  readonly generation: number;
  readonly head: Sha;
  readonly act: ActId;
  readonly leaseGeneration: number;
  readonly order: number;
  state: State;
  expectedMain: Sha;
  policyVersion: PolicyVersion;
  attempts: number;
  updatedAt: number;
  integration?: Sha;
  evidence?: ActId[];
  landInput?: Digest | null;
  waiting?: string[];
  publication?: number;
  reservedAt?: Seq;
  pushes: { n: number; outcome: "applied" | "not-applied" | "failed" | "in-flight" }[];
  since?: number;
  readBack?: { main: "expected-main" } | { main: "unexpected"; observed: Sha };
  unresolvedRecorded?: boolean;
  abort?: { trigger: ActId; key: KeyId; at: Seq; tokenRevoked: boolean; recorded: boolean };
  receipt?: ActId;
  reason?: RetryReason | FailReason;
  fix?: string;
  revertLane?: LaneId;
}

const PRE = new Set<State>(["accepted", "preparing", "ready"]);
const ACTIVE = new Set<State>(["accepted", "preparing", "ready", "publishing", "unresolved"]);

const FIX: Record<RetryReason, string> = {
  "generation-moved": "A newer generation was proposed on this lane. Land that generation instead.",
  "lease-changed": "The lease ended or changed hands. Claim the lane, then land again.",
  released: "The lane was released. Claim it, then land again.",
  "authority-lost": "Your authority to land is no longer current. Ask an admin, then land again.",
  "evidence-invalid": "Evidence this landing relied on no longer counts. Get a new review or check, then land again.",
  "obligation-open": "An obligation reopened. Meet it, then land again.",
};

export interface LandingControls {
  /** While true, a push starts but does not reach main (the "paused push" of plan section 8). */
  pausePush: boolean;
  /** The next n pushes fail without reaching main (Artifacts unavailable). */
  failPushes: number;
}

export class MemoryLanding implements LandingPort {
  readonly ops = new Map<OpId, Rec>();
  readonly controls: LandingControls = { pausePush: false, failPushes: 0 };
  private slotState: { state: "free"; last: number } | { state: "held"; op: OpId; publication: number; reservedAt: Seq; last: number } = { state: "free", last: 0 };
  private mainSha: Sha | null = null;
  private order = 0;

  constructor(
    private readonly sql: Sql,
    private readonly host: LandingHost,
    private readonly artifacts: MemoryArtifacts,
    private readonly now: () => number,
  ) {}

  private tx<T>(fn: () => T): T {
    return this.sql.transaction(fn);
  }

  private save(op: Rec): void {
    op.updatedAt = this.now();
  }

  // ------------------------------------------------------------ synchronous

  accept(input: AcceptInput): LandRecordLike | Refusal {
    if (this.mainSha === null) throw new Error("main is not known yet: call refreshMain first");
    const inFlight = [...this.ops.values()].find((o) => o.lane === input.lane && ACTIVE.has(o.state));
    if (inFlight)
      return { refused: true, rule: "land-in-progress", reason: "This lane already has a landing operation in flight.", fix: "Wait for it to finish.", current: { op: inFlight.id } };
    const op: Rec = { ...input, order: ++this.order, state: "accepted", expectedMain: this.mainSha, attempts: 0, updatedAt: this.now(), pushes: [] };
    this.ops.set(op.id, op);
    return op;
  }

  private retryable(op: Rec, reason: RetryReason, fix: string): void {
    const { act } = this.host.record({ type: "land-outcome", op: op.id, outcome: { state: "retryable", reason } });
    op.state = "retryable";
    op.reason = reason;
    op.fix = fix;
    op.receipt = act;
    this.save(op);
  }

  private fail(op: Rec, reason: FailReason): void {
    const { act } = this.host.record({ type: "land-outcome", op: op.id, outcome: { state: "failed", reason } });
    op.state = "failed";
    op.reason = reason;
    op.receipt = act;
    this.save(op);
  }

  laneChanged(lane: LaneId, reason: RetryReason, fix: string = FIX[reason]): readonly LandRecordLike[] {
    return this.tx(() => {
      const hit: Rec[] = [];
      for (const op of this.ops.values()) {
        if (op.lane !== lane || !PRE.has(op.state)) continue;
        this.retryable(op, reason, fix);
        hit.push(op);
      }
      return hit;
    });
  }

  private rePrepare(op: Rec, main: Sha): void {
    op.state = "preparing";
    op.expectedMain = main;
    op.attempts += 1;
    delete op.integration;
    delete op.evidence;
    delete op.landInput;
    op.waiting = [];
    this.save(op);
  }

  policyActivated(version: PolicyVersion): readonly OpId[] {
    return this.tx(() => {
      const fenced: OpId[] = [];
      for (const op of this.ops.values()) {
        if (!PRE.has(op.state)) continue;
        op.policyVersion = version;
        if (op.state !== "accepted") this.rePrepare(op, this.mainSha ?? op.expectedMain);
        fenced.push(op.id);
      }
      return fenced;
    });
  }

  abort(trigger: ActId, key: KeyId, at: Seq): LandRecordLike | null {
    const held = this.slotState.state === "held" ? this.ops.get(this.slotState.op) : undefined;
    if (!held || held.abort) return held ?? null;
    held.abort = { trigger, key, at, tokenRevoked: false, recorded: false };
    this.save(held);
    return held;
  }

  private laneMismatch(op: Rec): RetryReason | null {
    const lane = this.host.lane(op.lane);
    if (!lane) return "lease-changed";
    if (lane.generation !== op.generation || lane.head !== op.head) return "generation-moved";
    if (lane.holder === "released") return "released";
    if (lane.holder === "expired" || lane.leaseGeneration !== op.leaseGeneration) return "lease-changed";
    return null;
  }

  private applyReadiness(op: Rec): void {
    const r = this.host.readiness(op, op.integration!);
    switch (r.kind) {
      case "ready":
        op.state = "ready";
        op.evidence = [...r.evidence];
        op.landInput = r.landInput;
        op.waiting = [];
        break;
      case "waiting":
        op.state = "preparing";
        op.waiting = [...r.obligations];
        break;
      case "failed":
        this.fail(op, r.reason);
        return;
      case "retry":
        this.retryable(op, r.reason, r.fix);
        return;
    }
    this.save(op);
  }

  evaluate(id: OpId): LandRecordLike | null {
    return this.tx(() => {
      const op = this.ops.get(id);
      if (!op || (op.state !== "preparing" && op.state !== "ready") || op.integration === undefined) return op ?? null;
      const mismatch = this.laneMismatch(op);
      if (mismatch) this.retryable(op, mismatch, FIX[mismatch]);
      else this.applyReadiness(op);
      return op;
    });
  }

  after(): { readonly op: OpId; readonly reservedAt: Seq } | null {
    return this.slotState.state === "held" ? { op: this.slotState.op, reservedAt: this.slotState.reservedAt } : null;
  }

  view(id: OpId): LandOp | null {
    const op = this.ops.get(id);
    return op ? toView(op) : null;
  }

  slot(): PublicationSlot {
    const s = this.slotState;
    if (s.state === "free") return { state: "free", last: s.last };
    const op = this.ops.get(s.op);
    return { state: "held", op: s.op, publication: s.publication, reservedAt: s.reservedAt, ...(op?.since !== undefined ? { unresolvedSince: iso(op.since) } : {}) };
  }

  activeViews(): readonly LandOp[] {
    return [...this.ops.values()].filter((o) => ACTIVE.has(o.state)).map(toView);
  }

  nextDue(): number | null {
    return [...this.ops.values()].some((o) => ACTIVE.has(o.state)) ? this.now() + 1_000 : null;
  }

  main(): Sha | null {
    return this.mainSha;
  }

  async refreshMain(): Promise<Sha> {
    const main = await this.artifacts.readMain();
    if (main === null) throw new Error("the canonical repository has no main");
    this.tx(() => this.observeMain(main));
    return main;
  }

  private observeMain(main: Sha): void {
    if (this.mainSha === main || this.slotState.state === "held") return;
    const known = this.mainSha;
    this.mainSha = main;
    if (known === null) return;
    for (const op of this.ops.values()) {
      if (op.state === "accepted") op.expectedMain = main;
      else if ((op.state === "preparing" || op.state === "ready") && op.expectedMain !== main) this.rePrepare(op, main);
    }
  }

  // ------------------------------------------------------------ the driver

  private prepare(op: Rec): void {
    this.tx(() => {
      if (op.state === "accepted") {
        const mismatch = this.laneMismatch(op);
        if (mismatch) return this.retryable(op, mismatch, FIX[mismatch]);
        op.state = "preparing";
        op.attempts = 1;
        op.expectedMain = this.mainSha ?? op.expectedMain;
      }
      if (op.state !== "preparing" || op.integration !== undefined) return;
      const r = this.artifacts.integrate(op.head, op.expectedMain);
      const mismatch = this.laneMismatch(op);
      if (mismatch) return this.retryable(op, mismatch, FIX[mismatch]);
      if (r.kind === "conflict") return this.fail(op, { code: "conflict", paths: [...r.paths] });
      op.integration = r.integration;
      this.applyReadiness(op);
    });
  }

  private reserve(op: Rec): boolean {
    return this.tx(() => {
      if (op.state !== "ready" || this.slotState.state === "held") return false;
      const mismatch = this.laneMismatch(op);
      if (mismatch) {
        this.retryable(op, mismatch, FIX[mismatch]);
        return false;
      }
      const policy = this.host.policyVersion();
      if (op.policyVersion !== policy || op.expectedMain !== this.mainSha) {
        op.policyVersion = policy;
        this.rePrepare(op, this.mainSha!);
        return false;
      }
      const bad = this.host.revalidate(op);
      if (bad) {
        this.retryable(op, bad.reason, bad.fix);
        return false;
      }
      const publication = this.slotState.last + 1;
      const { seq } = this.host.record({
        type: "land-reserved",
        op: op.id,
        lane: op.lane,
        generation: op.generation,
        integration: op.integration!,
        expectedMain: op.expectedMain,
        evidence: op.evidence ?? [],
        publication,
      });
      op.state = "publishing";
      op.publication = publication;
      op.reservedAt = seq;
      this.save(op);
      this.slotState = { state: "held", op: op.id, publication, reservedAt: seq, last: this.slotState.last };
      return true;
    });
  }

  /** One publication step for the held operation (R-PUB-5, R-REV-5). */
  private publishStep(op: Rec): void {
    this.tx(() => {
      if (op.abort && !op.abort.recorded) {
        op.abort.tokenRevoked = true;
        op.abort.recorded = true;
        const { trigger, key, at, tokenRevoked } = op.abort;
        this.host.record({ type: "abort-attempt", op: op.id, attempt: { trigger, key, at, tokenRevoked } });
      }
      const inFlight = op.pushes.find((p) => p.outcome === "in-flight");
      if (inFlight && !this.controls.pausePush) {
        // The paused push completes now: it reaches main only if main is still expectedMain.
        if (this.artifacts.main === op.expectedMain) {
          this.artifacts.main = op.integration!;
          inFlight.outcome = "applied";
        } else inFlight.outcome = "not-applied";
      }
      if (!op.abort && !inFlight) {
        const n = op.pushes.length + 1;
        if (this.controls.pausePush) op.pushes.push({ n, outcome: "in-flight" });
        else if (this.controls.failPushes > 0) {
          this.controls.failPushes--;
          op.pushes.push({ n, outcome: "failed" });
        } else if (this.artifacts.main === op.expectedMain) {
          this.artifacts.main = op.integration!;
          op.pushes.push({ n, outcome: "applied" });
        } else op.pushes.push({ n, outcome: "not-applied" });
      }
      this.readBack(op);
    });
  }

  private readBack(op: Rec): void {
    const main = this.artifacts.main;
    const s = this.slotState;
    if (s.state !== "held") return;
    if (main === op.integration) {
      const { act } = this.host.record({ type: "land-outcome", op: op.id, outcome: { state: "landed", commit: op.integration!, publication: op.publication! } });
      op.state = "landed";
      op.receipt = act;
      if (op.abort) {
        const lane = this.host.record({ type: "revert-lane", of: op.id, scope: [...this.host.revertScope(op)], reason: "compromised-evidence" });
        op.revertLane = lane.act;
      }
      this.slotState = { state: "free", last: s.publication };
      this.mainSha = main;
      this.save(op);
      return;
    }
    const settled = op.pushes.every((p) => p.outcome === "not-applied" || p.outcome === "failed");
    if (op.abort && settled && main === op.expectedMain) {
      const { act } = this.host.record({ type: "land-outcome", op: op.id, outcome: { state: "aborted", publication: op.publication! } });
      op.state = "aborted";
      op.receipt = act;
      this.slotState = { state: "free", last: s.publication };
      this.save(op);
      return;
    }
    const readBack = main === op.expectedMain ? ({ main: "expected-main" } as const) : ({ main: "unexpected", observed: main! } as const);
    const inFlight = op.pushes.some((p) => p.outcome === "in-flight");
    if (inFlight && !op.abort) return; // still publishing: the push has not answered
    op.state = "unresolved";
    op.readBack = readBack;
    op.since ??= this.now();
    if (!op.unresolvedRecorded) {
      op.unresolvedRecorded = true;
      this.host.record({ type: "publication-unresolved", op: op.id, readBack });
    }
    this.save(op);
  }

  async reconcile(): Promise<void> {
    const s = this.slotState;
    if (s.state === "held") {
      const held = this.ops.get(s.op)!;
      this.publishStep(held);
    }
    if (this.slotState.state === "free") {
      try {
        await this.refreshMain();
      } catch {
        return;
      }
      const ready = [...this.ops.values()].filter((o) => o.state === "ready").sort((a, b) => a.order - b.order);
      for (const op of ready) {
        if (this.reserve(op)) {
          this.publishStep(op);
          break;
        }
      }
    }
    for (const op of [...this.ops.values()].sort((a, b) => a.order - b.order)) {
      if (op.state === "accepted" || (op.state === "preparing" && op.integration === undefined)) this.prepare(op);
    }
  }
}

function toView(r: Rec): LandOp {
  const base = {
    id: r.id,
    kind: "land" as const,
    updatedAt: iso(r.updatedAt),
    lane: r.lane,
    generation: r.generation,
    head: r.head,
    act: r.act,
    leaseGeneration: r.leaseGeneration,
    expectedMain: r.expectedMain,
    policyVersion: r.policyVersion,
    attempts: r.attempts,
  };
  const reserved = () => ({ integration: r.integration!, evidence: r.evidence ?? [], publication: r.publication!, reservedAt: r.reservedAt! });
  const abort = r.abort ? { trigger: r.abort.trigger, key: r.abort.key, at: r.abort.at, tokenRevoked: r.abort.tokenRevoked } : undefined;
  switch (r.state) {
    case "accepted":
      return { ...base, state: "accepted" };
    case "preparing":
      return { ...base, state: "preparing", ...(r.integration ? { integration: r.integration } : {}), waiting: (r.waiting ?? []) as `obl_${string}`[] };
    case "ready":
      return { ...base, state: "ready", integration: r.integration!, evidence: r.evidence ?? [], landInput: r.landInput ?? null };
    case "publishing":
      return { ...base, ...reserved(), state: "publishing", pushes: r.pushes.length };
    case "unresolved":
      return { ...base, ...reserved(), state: "unresolved", since: iso(r.since ?? r.updatedAt), readBack: r.readBack!, ...(abort ? { abort } : {}) };
    case "landed":
      return { ...base, ...reserved(), state: "landed", receipt: r.receipt!, ...(abort ? { abort } : {}), ...(r.revertLane ? { revertLane: r.revertLane } : {}) };
    case "aborted":
      return { ...base, ...reserved(), state: "aborted", receipt: r.receipt!, abort: abort! };
    case "retryable":
      return { ...base, state: "retryable", reason: r.reason as RetryReason, receipt: r.receipt!, fix: r.fix ?? FIX[r.reason as RetryReason] };
    case "failed":
      return { ...base, state: "failed", reason: r.reason as FailReason, receipt: r.receipt! };
  }
}
