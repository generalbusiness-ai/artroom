/** Local media custody only. Observations and media callbacks do not decide a count. */
import type { Beside, Digest, Grant, KeyId, MemberRef, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { activeAttempt, actURL, appendPrepared, contextKey, envelopeKey, fitsPending, MAX_ATTEMPTS, type AttemptJournal } from "./journal.ts";

export interface ActorIdentity {
  readonly origin: string;
  readonly deployment: string;
  readonly scope: ScopeRef;
  readonly definition: Digest;
  readonly membership: ScopeRef;
  readonly member: MemberRef;
  readonly publicKey: KeyId;
}
export interface TurnToken extends ActorIdentity {
  readonly generation: number;
  readonly serial: number;
  readonly N: number;
  /** Verified turn deadline, expressed as epoch milliseconds. */
  readonly expiresAt: number;
}
export interface SpeechPort {
  voices(): readonly { readonly id: string; readonly name: string }[];
  play(text: string, voiceId: string, callbacks: { end(): void; error(): void }): () => void;
}
export interface Completion { readonly turn: TurnToken; readonly voiceId: string; readonly completedAt: number }
export interface PreparedEnvelope { readonly signed: SignedIntent; readonly grants: readonly Grant[]; readonly beside: Beside }
export interface PendingReport {
  readonly completion: Completion;
  readonly envelope: PreparedEnvelope;
  readonly outcome: "unknown" | "refused";
  readonly journal?: AttemptJournal;
}
/** Bind this store to the frozen ActorIdentity externally. Use private durable custody.
 * save must finish before any POST. No keys or session tokens belong here. */
export interface PendingStore {
  load(): Promise<PendingReport | null>;
  save(pending: PendingReport): Promise<void>;
  clear(): Promise<void>;
}
export interface ReportOutcome { readonly status: "recorded" | "refused" | "unknown"; readonly reason?: string }
/** The caller verifies native receipts. A transport reply alone is not a known result. */
export interface Reporter {
  prepare(completion: Completion): Promise<PreparedEnvelope>;
  submit(envelope: PreparedEnvelope): Promise<ReportOutcome>;
  reconcile(envelope: PreparedEnvelope): Promise<ReportOutcome>;
  /** Reserve room for the next exact envelope before exposing or signing a correction. */
  correctionReady?(report: PendingReport): boolean;
  /** Trigger a fresh observation after the controller has fenced a known refusal. */
  refresh?(): void | Promise<void>;
}
/** Must exclude other controllers using this private pending slot, including other tabs. */
export interface CustodyLock { run<T>(work: () => Promise<T>): Promise<T> }
/** Omit turn while paused or while a different member is the speaker. */
export interface VoiceObservation { readonly fresh: boolean; readonly authorized: boolean; readonly turn?: TurnToken }
export interface VoiceState {
  readonly phase: "loading" | "idle" | "speaking" | "completed" | "reporting" | "unknown" | "refused" | "recorded" | "blocked" | "disposed";
  readonly message: string;
  readonly armed: boolean;
  readonly voiceId?: string;
  readonly turn?: TurnToken;
  readonly pending?: "unknown" | "refused";
  readonly correctionReady?: boolean;
}
export interface VoiceController {
  readonly ready: Promise<void>;
  arm(voiceId: string): boolean;
  observe(observation: VoiceObservation): void;
  invalidate(): void;
  disarm(): void;
  checkPending(): Promise<void>;
  correctReport(): Promise<void>;
  dispose(): void;
  state(): VoiceState;
  subscribe(listener: (state: VoiceState) => void): () => void;
}

const scopeKey = (s: ScopeRef): string => JSON.stringify([s.scope, s.inc, s.kind]);
const identityKey = (a: ActorIdentity): string => JSON.stringify([
  a.origin, a.deployment, scopeKey(a.scope), a.definition, scopeKey(a.membership),
  scopeKey(a.member.membership), a.member.member, a.publicKey,
]);
const turnKey = (t: TurnToken): string => JSON.stringify([identityKey(t), t.generation, t.serial, t.N, t.expiresAt]);
/** Inputs are plain native JSON values; retain a detached immutable copy through async work. */
function retained<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (v: unknown): void => {
    if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  };
  freeze(copy);
  return copy;
}

export function createVoiceController(options: {
  identity: ActorIdentity;
  speech: SpeechPort;
  reporter: Reporter;
  store: PendingStore;
  lock: CustodyLock;
  /** False as soon as this controller no longer owns the shared view. */
  current: () => boolean;
  now?: () => number;
  /** May lower the fixed replay-memory ceiling for callers or focused tests. */
  playedTokenLimit?: number;
}): VoiceController {
  const identity = retained(options.identity);
  const now = options.now ?? Date.now;
  const playedTokenLimit = options.playedTokenLimit ?? 512;
  if (!Number.isInteger(playedTokenLimit) || playedTokenLimit < 1 || playedTokenLimit > 512) {
    throw new RangeError("playedTokenLimit must be an integer from 1 through 512");
  }
  const listeners = new Set<(state: VoiceState) => void>();
  const attempted = new Set<string>();
  let view: VoiceState = { phase: "loading", message: "Checking private pending custody.", armed: false };
  let armedVoice: string | null = null;
  let observation: VoiceObservation = { fresh: false, authorized: false };
  let completion: Completion | null = null;
  let pending: PendingReport | null = null;
  let audioGeneration = 0;
  let cancel: (() => void) | null = null;
  let active: TurnToken | null = null;
  let disposed = false;
  let loaded = false;
  let busy = false;
  let custodyBlocked = false;
  let replayMemoryFull = false;
  const remember = (t: TurnToken): void => {
    const key = turnKey(t);
    if (attempted.has(key)) return;
    if (attempted.size >= playedTokenLimit) { replayMemoryFull = true; armedVoice = null; return; }
    attempted.add(key);
  };
  const current = (): boolean => !disposed && options.current();
  const sameContext = (t: TurnToken): boolean => identityKey(t) === identityKey(identity);
  const envelopeBelongs = (e: PreparedEnvelope): boolean => !!e.signed.intent.to &&
    scopeKey(e.signed.intent.to) === scopeKey(identity.scope) && e.signed.intent.actor === identity.publicKey;
  const usable = (t: TurnToken): boolean => current() && observation.fresh && observation.authorized &&
    !!observation.turn && sameContext(t) && turnKey(t) === turnKey(observation.turn) && now() < t.expiresAt;
  const knownRefusal = (report: PendingReport): boolean => {
    if (!report.journal) return false;
    const attempt = activeAttempt(report.journal);
    const refusal = attempt.refusal;
    return attempt.phase === "refused" && !!refusal && refusal.answer.answer === "refused" &&
      refusal.origin === identity.origin && refusal.url === actURL(identity) &&
      refusal.context === contextKey(identity) && refusal.request === envelopeKey(report.envelope);
  };
  const correctionReady = (): boolean => !!pending && !!pending.journal && pending.outcome === "refused" &&
    pending.journal.attempts.length < MAX_ATTEMPTS && knownRefusal(pending) &&
    usable(pending.completion.turn) && options.reporter.correctionReady?.(pending) === true;
  const emit = (phase: VoiceState["phase"], message: string, turn?: TurnToken): void => {
    if (!current()) return;
    view = retained({ phase, message, armed: armedVoice !== null, ...(armedVoice ? { voiceId: armedVoice } : {}), ...(turn ? { turn } : {}),
      ...(pending ? { pending: pending.outcome, correctionReady: correctionReady() } : {}) });
    for (const listener of listeners) { if (current()) listener(view); }
  };
  const stopAudio = (): void => {
    // cancel() is allowed to synchronously emit end or error. Fence first.
    audioGeneration += 1;
    active = null;
    const previous = cancel;
    cancel = null;
    try { previous?.(); } catch { /* Media cancellation cannot restore authority. */ }
  };
  const invalidate = (): void => {
    stopAudio();
    completion = null;
    observation = { ...observation, fresh: false };
    if (current()) emit(pending?.outcome ?? "idle", pending ? "A signed report remains in private custody." : "Arm a fresh assigned turn to speak.");
  };
  const guarded = async (work: () => Promise<void | (() => Promise<void>)>): Promise<void> => {
    if (!current() || busy || custodyBlocked) return;
    busy = true;
    try {
      const dispatch = await options.lock.run(work);
      if (typeof dispatch === "function" && current()) await dispatch();
    }
    catch { emit("blocked", "Private custody operation failed; retain and check any signed attempt before continuing."); }
    finally {
      busy = false;
      // CURRENT may have arrived during POST/reconciliation with no later notice.
      if (armedVoice) start(armedVoice);
    }
  };
  const sameEnvelope = (a: PreparedEnvelope, b: PreparedEnvelope): boolean => envelopeKey(a) === envelopeKey(b);
  const sameCompletion = (a: Completion, b: Completion): boolean => turnKey(a.turn) === turnKey(b.turn) &&
    a.voiceId === b.voiceId && a.completedAt === b.completedAt;
  const normalizedPending = (report: PendingReport): PendingReport => {
    if (!report.journal) return retained({ ...report, outcome: "unknown" });
    const attempt = activeAttempt(report.journal);
    if (!sameEnvelope(attempt.envelope, report.envelope)) throw new Error("active attempt envelope mismatch");
    return retained({ ...report, outcome: knownRefusal(report) ? "refused" : "unknown" });
  };
  const reloadReport = async (report: PendingReport): Promise<PendingReport | null> => {
    const saved = await options.store.load();
    if (!current()) return null;
    if (!saved || !sameEnvelope(saved.envelope, report.envelope) || !sameCompletion(saved.completion, report.completion) ||
        !sameContext(saved.completion.turn) ||
        !envelopeBelongs(saved.envelope) || !fitsPending(identity, saved)) {
      custodyBlocked = true;
      emit("blocked", "The exact signed attempt could not be recovered from private custody.");
      return null;
    }
    // The dispatcher owns attempt phases and service proofs. Adopt its newest journal.
    pending = normalizedPending(saved);
    return pending;
  };
  const settle = async (report: PendingReport, result: ReportOutcome): Promise<boolean> => {
    if (!current() || pending !== report) return false;
    const attempt = report.journal ? activeAttempt(report.journal) : null;
    if (attempt?.phase === "recorded") {
      // A failed clear retains the exact attempt; reconcile it again, never re-sign.
      await options.store.clear();
      if (!current()) return false;
      pending = null;
      completion = null;
      emit("recorded", "The caller verified that the native report was recorded.");
      return false;
    } else if (knownRefusal(report)) {
      // Correcting needs a new native observation, not the pre-POST snapshot.
      observation = { ...observation, fresh: false };
      emit("refused", result.reason ?? "The caller verified a refusal. Refresh before correcting the report.");
      return true;
    } else {
      emit("unknown", result.status === "refused" ?
        "The refusal has no matching retained service judgment. The exact attempt remains unresolved." :
        result.reason ?? "The signed attempt is unresolved. Check its native result before continuing.");
      return false;
    }
  };
  const finishReport = async (report: PendingReport, result: ReportOutcome): Promise<void> => {
    let refresh = false;
    await options.lock.run(async () => {
      const latest = await reloadReport(report);
      if (latest) refresh = await settle(latest, result);
    });
    // Refresh callbacks may observe CURRENT or acquire gateway custody. Release the lock first.
    if (refresh && current()) await options.reporter.refresh?.();
  };
  const reportCompletion = async (correcting = false): Promise<void> => guarded(async () => {
    const stored = await options.store.load();
    if (!current()) return;
    if (!stored && pending) {
      custodyBlocked = true;
      emit("blocked", "The retained attempt is missing from private custody; no correction was signed.");
      return;
    }
    if (stored) {
      pending = normalizedPending(stored);
      remember(stored.completion.turn);
      if (!sameContext(stored.completion.turn) || !envelopeBelongs(stored.envelope) || !fitsPending(identity, stored)) { custodyBlocked = true; emit("blocked", "Private custody belongs to another context."); return; }
    }
    const completed = correcting ? pending?.completion : completion;
    if (!current() || !loaded || !completed || !usable(completed.turn)) return;
    if (correcting ? !correctionReady() : pending !== null) return;
    const oldPending = pending;
    const generation = audioGeneration;
    emit("reporting", "Preparing the completed turn's native report.", completed.turn);
    const envelope = retained(await options.reporter.prepare(completed));
    if (!usable(completed.turn) || pending !== oldPending || generation !== audioGeneration) return;
    if (!envelopeBelongs(envelope)) {
      emit("blocked", "The prepared report does not match this scope and public key.");
      return;
    }
    const journal = appendPrepared(envelope, correcting ? oldPending?.journal : undefined);
    const report = retained<PendingReport>({ completion: completed, envelope, outcome: "unknown", journal });
    if (!fitsPending(identity, report)) { emit("blocked", "The exact pending report exceeds private custody limits."); return; }
    // Nothing may be posted unless these exact signed bytes are privately retained.
    await options.store.save(report);
    pending = report;
    completion = null;
    if (!usable(completed.turn) || generation !== audioGeneration) { emit("unknown", "The saved attempt awaits reconciliation after a context change."); return; }
    // The dispatcher owns the identity lock for its transport phase. Never nest it.
    return async () => {
      if (!usable(completed.turn) || generation !== audioGeneration) return;
      let result: ReportOutcome;
      try { result = await options.reporter.submit(report.envelope); }
      catch { result = { status: "unknown" }; }
      await finishReport(report, result);
    };
  });
  const ready = options.lock.run(async () => {
    try {
      const saved = await options.store.load();
      if (!current()) return;
      if (saved) {
        pending = normalizedPending(saved);
        remember(saved.completion.turn);
        if (!sameContext(saved.completion.turn) || !envelopeBelongs(saved.envelope) || !fitsPending(identity, saved)) {
          custodyBlocked = true;
          emit("blocked", "Private pending custody belongs to a different context; it was retained.");
          return;
        }
      }
      loaded = true;
      emit(pending?.outcome ?? "idle", pending ? "A signed report remains in private custody." : "Arm a fresh assigned turn to speak.");
    } catch {
      custodyBlocked = true;
      emit("blocked", "Private pending custody could not be read; speech and reporting are blocked.");
    }
  }).catch(() => { custodyBlocked = true; emit("blocked", "The private custody lock could not be acquired."); });

  const start = (voiceId: string): boolean => {
      const t = observation.turn;
      if (!loaded || custodyBlocked || busy || pending || completion || active || !t || !usable(t) ||
          attempted.has(turnKey(t)) || !options.speech.voices().some(v => v.id === voiceId)) return false;
      if (replayMemoryFull || attempted.size >= playedTokenLimit) {
        replayMemoryFull = true;
        armedVoice = null;
        emit("blocked", "The local played-turn memory is full. Speech is disarmed; private report custody is retained.");
        return false;
      }
      const turn = retained(t);
      remember(turn);
      const generation = ++audioGeneration;
      active = turn;
      emit("speaking", "Speaking the assigned number locally.", turn);
      const validCallback = (): boolean => current() && generation === audioGeneration && active !== null &&
        turnKey(active) === turnKey(turn) && observation.authorized && sameContext(turn) && now() < turn.expiresAt &&
        (!observation.turn || turnKey(observation.turn) === turnKey(turn));
      try {
        const stop = options.speech.play(String(turn.N), voiceId, {
          end() {
            if (!validCallback()) return;
            audioGeneration += 1;
            active = null;
            cancel = null;
            completion = retained({ turn, voiceId, completedAt: now() });
            emit("completed", "Local speech completed; waiting for a fresh matching turn.", turn);
            if (usable(turn)) void reportCompletion();
          },
          error() {
            if (!validCallback()) return;
            stopAudio();
            completion = null;
            emit("blocked", "Local speech failed. No completed turn was reported.");
          },
        });
        // Some adapters may complete synchronously during play().
        if (generation === audioGeneration && active) cancel = stop;
      } catch {
        stopAudio();
        completion = null;
        emit("blocked", "Local speech could not begin. No completed turn was reported.");
      }
      return true;
  };
  return {
    ready,
    arm(voiceId) {
      if (!current() || !observation.fresh || !observation.authorized || !loaded || custodyBlocked || replayMemoryFull || pending ||
          (observation.turn && (!sameContext(observation.turn) || now() >= observation.turn.expiresAt)) ||
          !options.speech.voices().some(v => v.id === voiceId)) return false;
      if (armedVoice !== voiceId && armedVoice !== null) {
        stopAudio(); completion = null;
        emit("idle", "Voice changed; awaiting a fresh unseen turn.");
      }
      armedVoice = voiceId;
      const began = start(voiceId);
      if (!began) emit(view.phase, view.message, view.turn);
      return armedVoice !== null;
    },
    observe(next) {
      if (!current()) return;
      observation = retained(next);
      const held = active ?? completion?.turn;
      if (!next.authorized || (next.fresh && !next.turn) ||
          (next.turn && (!sameContext(next.turn) || now() >= next.turn.expiresAt)) ||
          (held && next.turn && turnKey(held) !== turnKey(next.turn))) {
        if (!next.authorized || (next.turn && !sameContext(next.turn))) armedVoice = null;
        invalidate();
        // A fresh replacement token can start only after the old callbacks were fenced.
        observation = retained(next);
      }
      // Observations never settle a pending request, including a snapshot that advanced.
      if (completion && usable(completion.turn) && !pending) void reportCompletion();
      else if (armedVoice) start(armedVoice);
      if (pending?.outcome === "refused") emit("refused", "A known refusal is retained; correction needs a fresh matching turn and reserved custody room.", pending.completion.turn);
    },
    invalidate,
    disarm() { armedVoice = null; invalidate(); },
    checkPending: () => guarded(async () => {
      const stored = await options.store.load();
      if (!current()) return;
      if (stored) {
        pending = normalizedPending(stored);
        remember(stored.completion.turn);
        if (!sameContext(stored.completion.turn) || !envelopeBelongs(stored.envelope) || !fitsPending(identity, stored)) { custodyBlocked = true; emit("blocked", "Private custody belongs to another context."); return; }
      }
      const report = pending;
      if (!loaded || !report || !sameContext(report.completion.turn) || !current()) return;
      return async () => {
        if (!current()) return;
        let result: ReportOutcome;
        try { result = await options.reporter.reconcile(report.envelope); }
        catch { result = { status: "unknown" }; }
        await finishReport(report, result);
      };
    }),
    correctReport: () => reportCompletion(true),
    dispose() {
      if (disposed) return;
      // Mark old before cancel so synchronous callbacks and async emits cannot repaint.
      disposed = true;
      armedVoice = null;
      stopAudio();
      completion = null;
      listeners.clear();
      view = { phase: "disposed", message: "This local controller no longer owns the view.", armed: false };
    },
    state: () => view,
    subscribe(listener) {
      listeners.add(listener);
      if (current()) listener(view);
      return () => { listeners.delete(listener); };
    },
  };
}
