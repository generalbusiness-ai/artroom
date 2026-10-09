// Fake-only custody witnesses: no browser speech, provider, microphone, Worker, or native scope.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createVoiceController, type ActorIdentity, type Completion, type CustodyLock, type PendingReport,
  type PreparedEnvelope, type ReportOutcome, type SpeechPort, type TurnToken } from "./voice-controller.ts";
import { activeAttempt, actURL, contextKey, envelopeKey, markActive, type RefusalJudgment } from "./journal.ts";

const scope = { scope: "sc_counting", inc: "in_one", kind: "task" } as const;
const membership = { scope: "sc_members", inc: "in_members", kind: "membership" } as const;
const identity: ActorIdentity = { origin: "https://example.invalid", deployment: "test-deployment", scope,
  definition: "sha256:435d", membership, member: { membership, member: "@alice" }, publicKey: "key_alice" };
const turn = (over: Partial<TurnToken> = {}): TurnToken => ({ ...identity, generation: 0, serial: 1, N: 1, expiresAt: 10_000, ...over });
const envelope = (n: number): PreparedEnvelope => ({ signed: { sig: `fake-signature-${n}`, intent: {
  v: 1, to: scope, actor: identity.publicKey, kind: "spoken", on: 1, expected: { on: n },
  fields: { n: 1 }, idempotencyKey: `fake-${n}`, notAfter: "2099-01-01T00:00:00Z",
} }, grants: [], beside: { values: [`retained-${n}`] } });
const drain = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
function fixture(saved: PendingReport | null = null, shared?: { saved: PendingReport | null; lock: CustodyLock }, playedTokenLimit?: number) {
  const calls: { text: string; voiceId: string; end(): void; error(): void; canceled: boolean }[] = [];
  const prepared: Completion[] = [];
  const submitted: PreparedEnvelope[] = [];
  const reconciled: PreparedEnvelope[] = [];
  let lockTail = Promise.resolve();
  const lock: CustodyLock = { run<T>(work: () => Promise<T>): Promise<T> {
    const run = lockTail.then(work);
    lockTail = run.then(() => undefined, () => undefined);
    return run;
  } };
  const custody = shared ?? { saved, lock };
  let result: ReportOutcome = { status: "recorded" };
  let failSave = false;
  let owned = true;
  let clock = 100;
  let prepareWait: Promise<void> | null = null;
  let duringSubmit: (() => void) | null = null;
  let duringReconcile: (() => void) | null = null;
  let roomReserved = true;
  let preparedBytes: string | null = null;
  let retainRefusalProof = true;
  let refreshObservation: (() => void) | null = null;
  const syntheticRefusal = (e: PreparedEnvelope): RefusalJudgment => ({
    answer: { answer: "refused", reason: "revision-moved", name: "synthetic fake service judgment",
      judgedAt: { seq: 1, hash: "sha256:fake-head" } },
    origin: identity.origin, url: actURL(identity), request: envelopeKey(e), context: contextKey(identity),
  });
  const persistOutcome = (e: PreparedEnvelope): void => {
    const saved = custody.saved;
    if (!saved?.journal) return;
    const phase = activeAttempt(saved.journal).phase;
    let journal = saved.journal;
    if (phase === "inflight") {
      const phase = result.status === "refused" && !retainRefusalProof ? "unknown" : result.status;
      journal = markActive(journal, phase, phase === "refused" ? syntheticRefusal(e) : undefined);
    }
    else if (phase === "unknown" && result.status === "recorded") journal = markActive(journal, "recorded");
    custody.saved = { ...saved, journal, outcome: activeAttempt(journal).phase === "refused" ? "refused" : "unknown" };
  };
  const speech: SpeechPort = {
    voices: () => [{ id: "fake", name: "Fake voice" }, { id: "second", name: "Second fake" }],
    play(text, voiceId, callbacks) {
      const call = { text, voiceId, ...callbacks, canceled: false };
      calls.push(call);
      return () => { call.canceled = true; call.end(); call.error(); };
    },
  };
  const controller = createVoiceController({ identity, speech, lock: custody.lock, now: () => clock,
    ...(playedTokenLimit === undefined ? {} : { playedTokenLimit }),
    current: () => owned,
    store: {
      load: async () => custody.saved,
      save: async p => { if (failSave) throw new Error("fake private storage failure"); custody.saved = p; },
      clear: async () => { custody.saved = null; },
    },
    reporter: {
      prepare: async c => { prepared.push(c); if (prepareWait) await prepareWait;
        const e = envelope(prepared.length); return preparedBytes === null ? e : { ...e, beside: { values: [preparedBytes] } }; },
      submit: async e => custody.lock.run(async () => {
        assert.deepEqual(custody.saved?.envelope, e, "exact envelope is saved before POST"); submitted.push(e);
        const saved = custody.saved!;
        assert.ok(saved.journal, "newly prepared reports have a journal");
        custody.saved = { ...saved, journal: markActive(saved.journal, "inflight") };
        duringSubmit?.(); persistOutcome(e); return result;
      }),
      reconcile: async e => custody.lock.run(async () => { reconciled.push(e); duringReconcile?.(); persistOutcome(e); return result; }),
      correctionReady: p => roomReserved && !!p.journal && p.journal.attempts.length < 8,
      refresh: async () => { refreshObservation?.(); },
    },
  });
  const observe = (t: TurnToken = turn()) => controller.observe({ fresh: true, authorized: true, turn: t });
  return { controller, observe, calls, prepared, submitted, reconciled, custody,
    result: (r: ReportOutcome) => { result = r; }, saveFails: () => { failSave = true; },
    loseView: () => { owned = false; }, time: (n: number) => { clock = n; },
    waitPrepare: (p: Promise<void>) => { prepareWait = p; },
    duringSubmit: (work: () => void) => { duringSubmit = work; },
    duringReconcile: (work: () => void) => { duringReconcile = work; },
    reserveRoom: (available: boolean) => { roomReserved = available; },
    preparedBytes: (bytes: string) => { preparedBytes = bytes; },
    retainRefusalProof: (retain: boolean) => { retainRefusalProof = retain; },
    refreshObservation: (refresh: () => void) => { refreshObservation = refresh; } };
}

test("Explicit Arm starts local speech once; duplicate end and snapshots cannot replay the same turn", async () => {
  const f = fixture(); await f.controller.ready; f.observe();
  assert.equal(f.calls.length, 0);
  assert.equal(f.controller.arm("missing"), false);
  assert.equal(f.controller.arm("fake"), true);
  f.controller.arm("fake"); f.observe(); assert.equal(f.calls.length, 1);
  f.calls[0]!.end(); f.calls[0]!.end(); f.calls[0]!.error(); await drain();
  assert.equal(f.submitted.length, 1); assert.equal(f.prepared.length, 1);
  f.observe(); f.controller.arm("fake"); assert.equal(f.calls.length, 1);
  assert.equal(f.controller.state().phase, "recorded");
});

test("Arm while paused or waiting retains the selected voice until a fresh own assignment", async () => {
  const f = fixture(); await f.controller.ready;
  f.controller.observe({ fresh: true, authorized: true });
  assert.equal(f.controller.arm("fake"), true); assert.equal(f.calls.length, 0);
  f.controller.observe({ fresh: true, authorized: true }); assert.equal(f.calls.length, 0);
  f.observe(); assert.equal(f.calls.length, 1);
});

test("A single arm permits fresh subsequent own turns, while Pause/Start fences the old callbacks", async () => {
  const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake");
  f.controller.invalidate(); assert.equal(f.calls[0]!.canceled, true);
  f.calls[0]!.end(); await drain(); assert.equal(f.submitted.length, 0);
  f.observe(turn({ serial: 2 })); assert.equal(f.calls.length, 2);
  f.calls[0]!.end(); assert.equal(f.submitted.length, 0);
  f.calls[1]!.end(); await drain(); f.observe(turn({ serial: 3, N: 2 }));
  assert.deepEqual(f.calls.map(c => c.text), ["1", "1", "2"]);
  f.controller.disarm(); f.observe(turn({ serial: 4, N: 3 })); assert.equal(f.calls.length, 3);
});

test("Complete context binding rejects key, full scope, membership, deployment, member, definition and origin changes", async () => {
  const wrong: Partial<TurnToken>[] = [
    { publicKey: "key_other" }, { scope: { ...scope, inc: "in_other" } },
    { scope: { ...scope, kind: "lane" } }, { membership: { ...membership, inc: "in_other" } },
    { deployment: "another-deployment" }, { member: { membership, member: "@bob" } },
    { definition: "sha256:other" }, { origin: "https://other.invalid" },
  ];
  for (const change of wrong) {
    const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake");
    f.observe(turn(change)); f.calls[0]!.end(); await drain();
    assert.equal(f.calls[0]!.canceled, true); assert.equal(f.submitted.length, 0);
    assert.equal(f.controller.state().armed, false);
  }
});

test("Reset generation, serial and N changes fence late callbacks before starting a new assignment", async () => {
  for (const changed of [{ generation: 1 }, { serial: 2 }, { N: 2 }]) {
    const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake");
    f.observe(turn(changed)); f.calls[0]!.end(); f.calls[0]!.error(); await drain();
    assert.equal(f.calls[0]!.canceled, true); assert.equal(f.submitted.length, 0);
    assert.equal(f.calls.length, 2);
  }
});

test("Ordinary refresh holds a completion until a fresh exact token; forbidden or expired turns cancel it", async () => {
  const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake");
  f.controller.observe({ fresh: false, authorized: true }); f.calls[0]!.end(); await drain();
  assert.equal(f.prepared.length, 0); assert.equal(f.controller.state().phase, "completed");
  f.observe(); await drain(); assert.equal(f.submitted.length, 1);
  for (const forbidden of [true, false]) {
    const g = fixture(); await g.controller.ready; g.observe(); g.controller.arm("fake");
    if (forbidden) g.controller.observe({ fresh: false, authorized: false });
    else { g.time(10_000); g.observe(); }
    g.calls[0]!.end(); await drain(); assert.equal(g.submitted.length, 0); assert.equal(g.calls[0]!.canceled, true);
  }
});

test("Private persistence failure blocks POST", async () => {
  const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake"); f.saveFails();
  f.calls[0]!.end(); await drain();
  assert.equal(f.prepared.length, 1); assert.equal(f.submitted.length, 0);
  assert.equal(f.custody.saved, null); assert.equal(f.controller.state().phase, "blocked");
});

test("Unknown retains the exact signed envelope, fences signatures and playback, and observations cannot settle it", async () => {
  const f = fixture(); f.result({ status: "unknown" }); await f.controller.ready; f.observe(); f.controller.arm("fake");
  f.calls[0]!.end(); await drain(); const exact = JSON.stringify(f.custody.saved?.envelope);
  f.observe(turn({ serial: 2, N: 2 })); f.controller.arm("fake"); await f.controller.correctReport();
  await f.controller.checkPending();
  assert.equal(f.calls.length, 1); assert.equal(f.prepared.length, 1); assert.equal(f.submitted.length, 1);
  assert.equal(JSON.stringify(f.reconciled[0]), exact); assert.equal(JSON.stringify(f.custody.saved?.envelope), exact);
  f.result({ status: "recorded" }); await f.controller.checkPending(); assert.equal(f.custody.saved, null);
});

test("Known refusal can prepare a corrected successor using the same completion without speech replay", async () => {
  const f = fixture(); f.result({ status: "refused", reason: "fake native refusal" }); await f.controller.ready;
  f.observe(); f.controller.arm("fake"); f.calls[0]!.end(); await drain();
  const original = f.custody.saved; assert.equal(original?.outcome, "refused");
  assert.equal(activeAttempt(original!.journal!).phase, "refused");
  await f.controller.correctReport(); assert.equal(f.prepared.length, 1, "the pre-POST observation cannot authorize a correction");
  f.controller.observe({ fresh: false, authorized: true }); await f.controller.correctReport(); assert.equal(f.prepared.length, 1);
  f.observe(); f.result({ status: "unknown" }); await f.controller.correctReport();
  assert.deepEqual(f.prepared[1], f.prepared[0]); assert.equal(f.calls.length, 1);
  assert.notDeepEqual(f.custody.saved?.envelope, original?.envelope); assert.equal(f.submitted.length, 2);
  assert.equal(f.custody.saved?.journal?.attempts.length, 2);
  assert.deepEqual(f.custody.saved?.journal?.attempts[0], original?.journal?.attempts[0]);
  assert.equal(activeAttempt(f.custody.saved!.journal!).phase, "unknown", "the dispatcher-owned unknown phase survives controller settlement");
});

test("Loaded pending custody must match the complete context and blocks replay after restart", async () => {
  const saved: PendingReport = { completion: { turn: turn(), voiceId: "fake", completedAt: 100 }, envelope: envelope(1), outcome: "unknown" };
  const f = fixture(saved); await f.controller.ready; f.observe(); f.controller.arm("fake");
  assert.equal(f.calls.length, 0); assert.equal(f.prepared.length, 0);
  const wrong = fixture({ ...saved, completion: { ...saved.completion, turn: turn({ deployment: "other" }) } });
  await wrong.controller.ready; wrong.observe(); assert.equal(wrong.controller.arm("fake"), false);
  await wrong.controller.checkPending(); assert.equal(wrong.reconciled.length, 0); assert.equal(wrong.custody.saved?.envelope, saved.envelope);
  const otherEnvelope = { ...saved.envelope, signed: { ...saved.envelope.signed,
    intent: { ...saved.envelope.signed.intent, actor: "key_other" as const } } };
  const wrongKey = fixture({ ...saved, envelope: otherEnvelope }); await wrongKey.controller.ready;
  await wrongKey.controller.checkPending(); assert.equal(wrongKey.reconciled.length, 0);
});

test("An old controller cannot paint, prepare, or report after losing the shared view", async () => {
  const f = fixture(); await f.controller.ready; f.observe(); const painted: string[] = [];
  f.controller.subscribe(s => painted.push(s.phase)); f.controller.arm("fake"); const count = painted.length;
  f.loseView(); f.calls[0]!.end(); f.calls[0]!.error(); f.controller.invalidate(); f.observe(); await drain();
  assert.equal(painted.length, count); assert.equal(f.prepared.length, 0); assert.equal(f.submitted.length, 0);
  f.controller.dispose(); assert.equal(f.calls[0]!.canceled, true);
});

test("Invalidation while prepare is in flight prevents even a same-token later observation from reviving that attempt", async () => {
  const f = fixture(); let release!: () => void; f.waitPrepare(new Promise(resolve => { release = resolve; }));
  await f.controller.ready; f.observe(); f.controller.arm("fake"); f.calls[0]!.end(); await drain();
  f.controller.invalidate(); f.observe(); release(); await drain();
  assert.equal(f.prepared.length, 1); assert.equal(f.submitted.length, 0); assert.equal(f.custody.saved, null);
});

test("A fresh next own assignment arriving during submit or reconciliation starts after custody work releases busy", async () => {
  for (const boundary of ["submit", "reconcile"] as const) {
    const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake");
    const publishNext = () => {
      f.observe(turn({ serial: 2, N: 2 }));
      assert.equal(f.calls.length, 1, "pending report fences playback while the operation is busy");
    };
    if (boundary === "submit") f.duringSubmit(publishNext);
    else f.result({ status: "unknown" });
    f.calls[0]!.end(); await drain();
    if (boundary === "reconcile") {
      f.duringReconcile(publishNext); f.result({ status: "recorded" }); await f.controller.checkPending();
    }
    assert.deepEqual(f.calls.map(c => c.text), ["1", "2"]);
    assert.equal(f.prepared.length, 1, "the second speech has not completed or been reported");
  }
});

test("The played-token ceiling disarms new speech without discarding unresolved exact custody", async () => {
  const f = fixture(null, undefined, 2); await f.controller.ready; f.observe(); f.controller.arm("fake");
  f.calls[0]!.end(); await drain(); f.observe(turn({ generation: 1, serial: 1 }));
  f.result({ status: "unknown" }); f.calls[1]!.end(); await drain();
  const exact = JSON.stringify(f.custody.saved);
  f.observe(turn({ generation: 2, serial: 1 })); await f.controller.checkPending();
  assert.equal(f.calls.length, 2); assert.equal(f.prepared.length, 2);
  assert.equal(JSON.stringify(f.custody.saved), exact, "capacity cannot drop an unknown attempt");
  f.result({ status: "recorded" }); await f.controller.checkPending();
  assert.equal(f.controller.state().phase, "blocked"); assert.equal(f.controller.state().armed, false);
  assert.equal(f.controller.arm("fake"), false); assert.equal(f.calls.length, 2);
});

test("Eight refused attempts retain the original history and prevent a ninth signature or speech replay", async () => {
  const f = fixture(); f.result({ status: "refused" }); await f.controller.ready;
  f.observe(); f.controller.arm("fake"); f.calls[0]!.end(); await drain();
  const original = f.custody.saved!.journal!.attempts[0];
  for (let attempt = 2; attempt <= 8; attempt++) {
    f.observe(); assert.equal(f.controller.state().correctionReady, true);
    await f.controller.correctReport();
  }
  const retained = JSON.stringify(f.custody.saved);
  f.observe(); assert.equal(f.controller.state().correctionReady, false);
  await f.controller.correctReport();
  assert.equal(f.prepared.length, 8); assert.equal(f.submitted.length, 8); assert.equal(f.calls.length, 1);
  assert.equal(f.custody.saved!.journal!.attempts.length, 8);
  assert.deepEqual(f.custody.saved!.journal!.attempts[0], original);
  assert.equal(JSON.stringify(f.custody.saved), retained);
  assert.ok(f.custody.saved!.journal!.attempts.every(a => a.phase === "refused" && a.refusal));
});

test("Unavailable correction room blocks signing and an oversized prepared successor cannot replace refused history", async () => {
  const f = fixture(); f.result({ status: "refused" }); await f.controller.ready;
  f.observe(); f.controller.arm("fake"); f.calls[0]!.end(); await drain();
  const retained = JSON.stringify(f.custody.saved);
  f.reserveRoom(false); f.observe(); assert.equal(f.controller.state().correctionReady, false);
  await f.controller.correctReport(); assert.equal(f.prepared.length, 1);
  f.reserveRoom(true); f.observe(); assert.equal(f.controller.state().correctionReady, true);
  f.preparedBytes("x".repeat(64 * 1024)); await f.controller.correctReport();
  assert.equal(f.prepared.length, 2); assert.equal(f.submitted.length, 1);
  assert.equal(JSON.stringify(f.custody.saved), retained); assert.equal(f.calls.length, 1);
});

test("A returned refused enum without retained service proof and a legacy refused slot stay unknown", async () => {
  const f = fixture(); f.result({ status: "refused" }); f.retainRefusalProof(false);
  await f.controller.ready; f.observe(); f.controller.arm("fake"); f.calls[0]!.end(); await drain();
  f.observe(); assert.equal(f.controller.state().pending, "unknown"); assert.equal(f.controller.state().correctionReady, false);
  await f.controller.correctReport(); assert.equal(f.prepared.length, 1);
  const legacy = fixture({ completion: { turn: turn(), voiceId: "fake", completedAt: 100 },
    envelope: envelope(1), outcome: "refused" });
  legacy.result({ status: "refused" }); await legacy.controller.ready; legacy.observe();
  await legacy.controller.checkPending(); await legacy.controller.correctReport();
  assert.equal(legacy.controller.state().pending, "unknown"); assert.equal(legacy.controller.state().correctionReady, false);
  assert.equal(legacy.prepared.length, 0); assert.equal(legacy.calls.length, 0);
});

test("Refusal refresh runs after stale fencing even when CURRENT arrived before the reporter returned", async () => {
  const f = fixture(); f.result({ status: "refused" }); await f.controller.ready;
  let refreshes = 0;
  f.duringSubmit(() => f.observe());
  f.refreshObservation(() => { refreshes++; f.observe(); });
  f.observe(); f.controller.arm("fake"); f.calls[0]!.end(); await drain();
  assert.equal(refreshes, 1); assert.equal(f.controller.state().correctionReady, true);
  f.result({ status: "unknown" }); await f.controller.correctReport();
  assert.equal(f.prepared.length, 2); assert.equal(f.calls.length, 1);
});

test("A same-envelope handoff cannot reparent the report to another retained completion", async () => {
  const f = fixture(); await f.controller.ready; f.observe(); f.controller.arm("fake");
  let submittedEnvelope: PreparedEnvelope | null = null;
  f.duringSubmit(() => {
    const saved = f.custody.saved!;
    submittedEnvelope = saved.envelope;
    f.custody.saved = { ...saved, completion: { ...saved.completion,
      turn: { ...saved.completion.turn, generation: 1, serial: 2, N: 2 },
      voiceId: "second", completedAt: saved.completion.completedAt + 1 } };
  });
  f.calls[0]!.end(); await drain();
  assert.deepEqual(f.custody.saved?.envelope, submittedEnvelope);
  assert.equal(f.controller.state().phase, "blocked");
  assert.ok(f.custody.saved, "the returned recorded enum cannot clear reparented custody");
  f.observe(turn({ generation: 1, serial: 2, N: 2 }));
  await f.controller.correctReport(); await f.controller.checkPending();
  assert.equal(f.prepared.length, 1); assert.equal(f.calls.length, 1); assert.equal(f.reconciled.length, 0);
});
