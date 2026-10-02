/**
 * The deterministic mock room. It replays the scripted scenario up to the
 * timeline's step, then any actions the viewer took, in order. The same step
 * and the same actions always give the same snapshot.
 */

import type { ActId, MemberId, Note, NoteAnchor, ProposalAt, ProposalRef, Result, Review } from "../contract.ts";
import type { ChangeHistory, DraftRule, DryRunResult, FileDiff, ReviewDraft, RoomAdapter, RoomSnapshot, Timeline, Why } from "../adapter.ts";
import { dryRun } from "../dryrun.ts";
import { DIFFS, parseDiff } from "./diffs.ts";
import { changeHistory } from "../changes.ts";
import { SCENARIO_COMMITS } from "./commits.ts";
import { POLICY } from "./policy.ts";
import { STEPS } from "./scenario.ts";
import { PEOPLE, World } from "./world.ts";

interface ViewerAction {
  readonly afterStep: number;
  readonly by: MemberId;
  run(w: World, by: MemberId): unknown;
}

export interface MockOptions {
  readonly step?: number;
  readonly viewer?: MemberId;
}

export class MockRoom implements RoomAdapter {
  readonly kind = "mock" as const;
  readonly viewers: readonly MemberId[] = PEOPLE.filter((p) => p.kind !== "service").map((p) => p.handle);
  readonly timeline: Timeline;

  private step: number;
  private viewer: MemberId;
  private actions: ViewerAction[] = [];
  private world: World;
  private snap: RoomSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MockOptions = {}) {
    this.step = clamp(opts.step ?? STEPS.length - 1);
    this.viewer = opts.viewer && this.viewers.includes(opts.viewer) ? opts.viewer : "@maya";
    this.world = this.replay();
    this.snap = this.world.snapshot(this.viewer);
    // `this` is captured so the timeline always reflects the current state.
    const room = this;
    this.timeline = {
      get step() {
        return room.step;
      },
      get steps() {
        return STEPS.length;
      },
      get playing() {
        return room.timer !== null;
      },
      label: (i) => {
        const s = STEPS[clamp(i)]!;
        return s.label;
      },
      go: (i) => room.go(i),
      play: (ms = 1600) => room.play(ms),
      pause: () => room.pause(),
    };
  }

  private replay(): World {
    const w = new World();
    for (let i = 0; i <= this.step; i++) {
      const s = STEPS[i]!;
      w.t = s.minute;
      s.run(w);
      this.actions
        .filter((a) => a.afterStep === i)
        .forEach((a, n) => {
          w.t = s.minute + 0.2 * (n + 1);
          a.run(w, a.by);
        });
    }
    return w;
  }

  private emit() {
    this.snap = this.world.snapshot(this.viewer);
    for (const l of this.listeners) l();
  }

  private go(i: number) {
    this.step = clamp(i);
    this.actions = this.actions.filter((a) => a.afterStep <= this.step);
    this.world = this.replay();
    this.emit();
  }

  private play(ms: number) {
    this.pause();
    if (this.step >= STEPS.length - 1) this.go(0);
    this.timer = setInterval(() => {
      if (this.step >= STEPS.length - 1) this.pause();
      else this.go(this.step + 1);
    }, ms);
    this.emit();
  }

  private pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit();
  }

  /** Run a viewer action now, and remember it so later replays include it. */
  private act<T>(run: (w: World, by: MemberId) => T): T {
    const action: ViewerAction = { afterStep: this.step, by: this.viewer, run };
    this.actions.push(action);
    const n = this.actions.filter((a) => a.afterStep === this.step).length;
    this.world.t = STEPS[this.step]!.minute + 0.2 * n;
    const result = run(this.world, this.viewer);
    this.emit();
    return result;
  }

  snapshot(): RoomSnapshot {
    return this.snap;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async diff(ref: ProposalRef): Promise<readonly FileDiff[] | null> {
    const tag = this.world.tagOf(ref.lane);
    const text = tag ? DIFFS[`${tag}/${ref.generation}`] : undefined;
    return text ? parseDiff(text) : null;
  }

  async changeHistory(ref: ProposalRef): Promise<ChangeHistory | null> {
    const tag = this.world.tagOf(ref.lane);
    const prev = tag ? SCENARIO_COMMITS.commits[`${tag}/${ref.generation - 1}`] : undefined;
    const next = tag ? SCENARIO_COMMITS.commits[`${tag}/${ref.generation}`] : undefined;
    if (!prev || !next) return null;
    return changeHistory(SCENARIO_COMMITS.repo, { generation: ref.generation - 1, commits: prev }, { generation: ref.generation, commits: next });
  }

  changedSince(ref: ProposalRef) {
    return this.world.changedSince(ref.lane, ref.generation);
  }

  async explain(act: ActId): Promise<Why | null> {
    return this.world.whyOf(act);
  }

  async review(at: ProposalAt, draft: ReviewDraft): Promise<Result<Review>> {
    const tag = this.world.tagOf(at.lane);
    if (!tag) return { refused: true, rule: "lane-unknown", reason: "That lane does not exist.", fix: "Open a lane from the Room screen." };
    return this.act((w, by) => w.review(by, tag, at.generation, { verdict: draft.verdict, scope: [...draft.scope], dependsOn: [...draft.dependsOn], text: draft.text }, at.head));
  }

  async note(anchor: NoteAnchor, text: string, replyTo?: ActId): Promise<Result<Note>> {
    if (!text.trim()) return { refused: true, rule: "invalid-body", reason: "The note is empty.", fix: "Write the note, then send it." };
    return this.act((w, by) => w.note(by, anchor, text.trim(), replyTo));
  }

  async dryRun(draft: DraftRule): Promise<Result<DryRunResult>> {
    if ("paths" in draft && draft.paths.length === 0) {
      return { refused: true, rule: "glob-invalid", reason: "The draft names no paths.", fix: "Add at least one path pattern, such as src/lib/**." };
    }
    return dryRun(this.world.history, draft, POLICY, this.world.policyVersion);
  }

  setViewer(member: MemberId) {
    if (!this.viewers.includes(member)) return;
    this.viewer = member;
    this.emit();
  }
}

function clamp(i: number) {
  return Math.max(0, Math.min(STEPS.length - 1, Math.floor(i)));
}
