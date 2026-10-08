import { describe, expect, test } from "vitest";
import { abortAllDurableObjects } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Entry, OperationId, Read } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { snapshotCommit, ZERO_ID } from "@generalbusiness/artroom-git";
import { sendOnce } from "../src/github-host.ts";
import type { DestinationProvider } from "../src/destination-host.ts";
import { checkpointOf, operationId, operationOpening, snapshotInput, snapshotRead, stagedRefName, timeMs, type Opening } from "@generalbusiness/artroom-derive";
import { isAnswer } from "../src/operations.ts";
import { ScopeObject, SqliteStore, Turns, Wakes, production, type EffectAnswer, type EffectRequest, type OperationStatus, type OutcomeRecorded, type Outside, type Wiring } from "../src/index.ts";
import { variant } from "@generalbusiness/artroom-derive/testing";
import { controls, testPorts } from "../src/testing.ts";
import { FENCE, MINT, mint, outsideOf, owners, pushOf, wired, type OutsideDouble } from "./outside.ts";
import { HOLD, Lane, START, at, definition, found, founding, reader, rita, stubOf } from "./support.ts";

/** The delay before the second attempt of an operation. */
const RETRY = PROPOSED_BOUNDS.dispatchRetrySeconds;
type Surface = { effect(): Promise<number>; operation(reader: unknown, id: OperationId): Promise<Read<OperationStatus>>; operations(reader: unknown, cursor?: string, open?: boolean): Promise<Read<readonly OperationStatus[]>> };
const surface = (s: Lane) => s.object as unknown as Surface;

/**
 * A stand-in for the entry that opens an operation: no form of this step
 * opens one. The entry is made by hand, as a checkpoint input with the
 * ledger's own opening effects at the ordinals 0, 1 and so on. It is written
 * through a turn of the real commit protocol, on the object's own storage,
 * with the real alarm. The IDs of the operations, or `scope-full` when the
 * entry and what it reserves do not fit.
 */
function open(s: Lane, ...opens: Opening[]): Promise<OperationId[] | "scope-full"> {
  return s.inside(async (state) => {
    const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
    const wakes = new Wakes(store, { set: (time) => (time === null ? state.storage.deleteAlarm() : state.storage.setAlarm(timeMs(time)!)) }, false);
    const turns = new Turns(store, { clock: s.c.clock, rules: production().rules, alarm: wakes.deadline, capabilities: null }, s.c.bounds, () => definition, () => owners);
    const end = await turns.run<OperationId[] | "scope-full">({
      asks: () => [],
      judge: (view) => ({
        verdict: "write", retain: [],
        draft: { input: { type: "checkpoint", ...checkpointOf(view) }, uses: [], prepared: [], effects: opens.flatMap((o, k) => operationOpening(k, o)), sends: [], judgesTime: false },
        sealed: ({ entry }) => opens.map((_, k) => operationId(entry.seq, k)), unfit: () => "scope-full", full: () => "scope-full",
      }),
    });
    if (end.end !== "answer") throw new Error(`the opening entry was not judged: ${end.end}`);
    return end.answer;
  });
}
/** What a reader sees of one operation. */
async function seen(s: Lane, id: OperationId): Promise<OperationStatus> {
  const read = await surface(s).operation(reader, id);
  if (!read.ok) throw new Error(`no operation ${id}: ${read.reason}`);
  return read.value;
}
/** An answer that arrives by itself, after its request: given to the driver of the object in memory, inside the object. */
const late = (s: Lane, out: OutsideDouble, id: OperationId, attempt: number, answer: EffectAnswer): Promise<OutcomeRecorded> => s.inside(() => out.deliver!(id, attempt, answer));
/** One turn of the event loop, so that what is already due can happen. It waits for no time to pass. */
const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });
const own = (commit: string): EffectAnswer => ({ result: "confirmed", evidence: { basis: "own-answer", body: { commit } } });
/** Each attempt's outcomes, as `result at seq`. */
const outcomes = (status: OperationStatus) => status.operation.attempts.map((a) => a.outcomes.map((o) => `${o.result} at ${o.seq}`));

describe("outside operations at a real scope (scope contract, section 4.3; authority note, section 5.4). The outside system and the opening entry are stand-ins", () => {
  // Invariant: local denial after the actual durable sent mark is unknown,
  // retaining the original request bindings/reservation without another ask.
  // Opening/owner rules, live authorization, producer conversion and finite
  // HTTP upstream are STAND-INS. Scope, SQLite, mark readback, Operations,
  // sendOnce and smart Git validation/transport are actual. No host or mint
  // revocation/expiry authority is claimed; no executor design is involved.
  test("post-sent local denial keeps unknown and original bindings; unmarked standalone classification remains not-sent", async () => {
    const s = await found();
    const built = snapshotCommit([], "post-sent denial fixture\n");
    const remote = "https://git.example/artroom/denial.git";
    let liveAuthorization = true;
    let posts = 0;
    let release!: () => void;
    let reached!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    let holdDiscovery = true;
    const requests: EffectRequest[] = [];
    const packet = (text: string) => `${(utf8(text).length + 4).toString(16).padStart(4, "0")}${text}`;
    const fetch = async (request: Request): Promise<Response> => {
      if (request.method === "POST") { posts++; return new Response(null, { status: 500 }); }
      expect(request.url).toBe(`${remote}/info/refs?service=git-receive-pack`);
      if (holdDiscovery) { reached(); await held; }
      return new Response(packet("# service=git-receive-pack\n") + "0000" + packet(`${ZERO_ID} capabilities^{}\0report-status object-format=sha1\n`) + "0000", { headers: { "content-type": "application/x-git-receive-pack-advertisement" } });
    };
    const transport = { remote, maxBytes: 1024 * 1024, fetch };
    const argumentsOf = (request: EffectRequest): Parameters<DestinationProvider["send"]>[0] => ({
      repository: { host: "git.example", namespace: "artroom", name: "denial", id: "scripted-71" }, ref: "refs/heads/main", old: null, commit: built.commit,
      objects: built.objects.map(({ id, type, data }) => ({ id, kind: type, body: data })), requireParentless: true, token: "scripted_private_token",
      binding: { scope: request.scope, mint: request.operation, attempt: 1, write: request.operation, writeAttempt: request.attempt, ref: "refs/heads/main" },
      ...(request.sentAt === undefined ? {} : { sentAt: request.sentAt }), allowed: () => liveAuthorization,
    });
    wired.set(s.name, () => ({ outside: { accepts: () => true, send: async (request) => {
      requests.push(request);
      const reply = await sendOnce(argumentsOf(request), transport, async () => null);
      // Stand-in conversion exposes the same decisive/non-answer distinction
      // consumed by the production destination adapter and Operations.
      return reply === null ? null : { result: "refused", evidence: { basis: "own-answer", body: reply as { send: string } } };
    } } }));
    try {
      await s.restart(); // Construct wired port before opening the one attempt.
      const [op] = await open(s, pushOf(1)) as [OperationId];
      const opening = (await s.sealed(1))[0]!;
      const inspect = () => s.inside((state) => {
        const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
        const status = store.operationStatus(op);
        const outcome = status?.operation.attempts[0]?.outcomes[0];
        const entry = outcome ? JSON.parse(store.stored(outcome.seq)!.bytes) as Entry : null;
        return { row: store.sending(op, 1), status, outcome: entry?.input ?? null, outstanding: store.outstanding() };
      });
      const pass = surface(s).effect();
      expect(await Promise.race([ready.then(() => true), pass.then(() => false)])).toBe(true);
      const marked = await inspect();
      expect(marked.row).toMatchObject({ operation: op, attempt: 1, sent: START });
      expect(requests).toEqual([{ scope: s.at, operation: op, attempt: 1, owner: "platform:destination@1", kind: "push", origin: opening, sentAt: marked.row!.sent }]);
      const bindings = canonicalize(requests);
      liveAuthorization = false;
      release();
      await pass;
      const denied = await inspect();
      expect([requests.length, posts, denied.row]).toEqual([1, 0, marked.row]);
      expect(canonicalize(requests)).toBe(bindings);
      expect(denied.outcome).toMatchObject({ type: "outcome", operation: op, attempt: 1, result: "unknown", evidence: { basis: "none" } });
      expect([denied.status?.state, denied.outstanding.unknown]).toEqual(["unknown", 1]);
      expect((await s.sealed(1))[0]).toEqual(opening);
      holdDiscovery = false;
      // Independent low-level standalone invocation, not another request of
      // the Scope attempt; explicitly omit internal sent bookkeeping.
      const { sentAt: _sentAt, ...unmarked } = argumentsOf(requests[0]!);
      expect(await sendOnce(unmarked, transport, async () => null)).toEqual({ send: "not-sent" });
      expect([requests.length, posts, (await inspect()).row]).toEqual([1, 0, marked.row]);
    } finally { release(); wired.delete(s.name); }
  });

  test("T19: an attempt is recorded before it is sent, and sent at most once; a stop between the send and the outcome leaves `unknown`, which a restart, elapsed time, a later attempt that succeeds, a new ref and a listing do not settle, and its own late answer does", async () => {
    const s = await found();
    const out = outsideOf(s.name);
    const [op] = await open(s, pushOf(3)) as [OperationId];
    const opening = (await s.sealed(1))[0]!;
    // Recorded and not sent: entry 1 is sealed, with the attempt's row and a wake-up at its time. Nothing has reached the outside system.
    expect([op, out.sent.length, await s.alarmAt(), await seen(s, op)]).toMatchObject(["1:0", 0, timeMs(START), { state: "pending", sends: [{ attempt: 1, next: timeMs(START), sent: null }] }]);
    // The record is in storage. After a restart the alarm alone sends the one request, which names the sealed entry.
    await s.restart();
    const pass = s.alarm();
    await out.reached(1);
    expect(out.sent[0]).toMatchObject({ scope: s.at, operation: op, attempt: 1, kind: "push", origin: { hash: opening.hash } });

    // The process stops between the send and the outcome. No answer was recorded, and the attempt is marked as perhaps sent.
    await abortAllDurableObjects();
    await pass.catch(() => null);
    expect([(await s.head()).seq, await seen(s, op)]).toMatchObject([1, { state: "pending", sends: [{ attempt: 1, sent: START }] }]);
    // It is never sent again. When the time to wait for an answer has passed, its outcome is `unknown`, with no evidence. That entry opens attempt 2.
    s.c.clock.now = at(PROPOSED_BOUNDS.dispatchSeconds);
    expect(await s.alarm()).toBe(true);
    const unknown = (await s.sealed(2))[0]!;
    expect([out.attempts, unknown.entry.input, unknown.entry.effects]).toEqual([
      [`${op}#1`], { type: "outcome", operation: op, attempt: 1, owner: "platform:destination@1", kind: "push", result: "unknown", evidence: { basis: "none", body: null } },
      [{ effect: "attempt", operation: op, attempt: 1, result: "unknown", selected: null }, { effect: "attempt", operation: op, attempt: 2, result: "opened", selected: null }],
    ]);

    // A later attempt succeeds, by a read of the ref. A restart follows, and a day passes. The ledger is idle: it asks for no wake-up.
    out.answer(op, 2, { result: "confirmed", evidence: { basis: "read", body: { ref: "refs/heads/main", commit: "c2" } } });
    s.c.clock.now = at(PROPOSED_BOUNDS.dispatchSeconds + RETRY);
    expect([await s.alarm(), out.attempts]).toEqual([true, [`${op}#1`, `${op}#2`]]);
    await s.restart();
    s.c.clock.now = at(86_400);
    expect([await s.alarm(), await surface(s).effect()]).toEqual([false, 0]);
    // A listing that shows the commit, offered as attempt 1's answer, is not that attempt's own answer.
    expect(await late(s, out, op, 1, { result: "confirmed", evidence: { basis: "read", body: { listed: ["c2"] } } })).toEqual({ recorded: "refused", detail: "only that attempt's own answer follows an unknown outcome" });
    // None of these settled attempt 1: the operation is not settled, and it is in the list of the duties this scope holds.
    const held = await surface(s).operations(reader, undefined, true);
    expect([(await s.head()).seq, out.sent.length, held.ok && held.value.map((o) => [o.operation.id, o.state, outcomes(o)])]).toEqual([3, 2, [[op, "unknown", [["unknown at 2"], ["confirmed at 3"]]]]]);

    // That request's own late answer settles it: one more outcome. The `unknown` entry stays as it was written.
    expect(await late(s, out, op, 1, own("c1"))).toMatchObject({ recorded: "written", fact: { seq: 4 } });
    const settled = await seen(s, op);
    expect([settled.state, outcomes(settled), (await s.sealed(2))[0]]).toEqual(["settled", [["unknown at 2", "confirmed at 4"], ["confirmed at 3"]], unknown]);
    // The same answer again, another answer of that attempt, and an answer to an attempt that was never sent: each writes nothing.
    expect([await late(s, out, op, 1, own("c1")), await late(s, out, op, 1, own("c9")), await late(s, out, op, 3, own("c3")), (await s.head()).seq]).toEqual([
      { recorded: "repeat", seq: 4 }, { recorded: "conflict", seq: 4 }, { recorded: "refused", detail: "no request of that attempt was sent" }, 4,
    ]);
    // The plan's T41: the contradiction is an incident (authority note, section 12, G13). It wrote no entry, so it is kept in the operator's
    // record alone, by the runtime that found it: the scope, the kind, and references to the attempt and to the entry that it contradicts.
    const incidents = await (s.object as unknown as { incidents(reader: unknown): Promise<Read<readonly { kind: string; scope: unknown; refs: unknown }[]>> }).incidents(reader);
    expect(incidents.ok && incidents.value.map(({ kind, scope, refs }) => ({ kind, scope, refs }))).toEqual([{ kind: "outcome-conflict", scope: s.at, refs: [{ operation: op, attempt: 1 }, { entry: 4 }] }]);
  });

  test("T20: an idle ledger writes nothing; a port that sends nothing leaves the attempt recorded and visible; an outcome is written at a scope with no free room; an operation opens at most its stated attempts and then none by itself; a retry is a new operation; an outside factory reads the committed opening from the current record", async () => {
    // A budget in which the entry that opens two attempts, and what it reserves, exactly fit: 2 entries written, 4 for the attempts and 1 for the closing checkpoint.
    const s = await found({ scopeEntries: 7 });
    const out = outsideOf(s.name);
    expect([await s.alarmAt(), await surface(s).effect(), (await s.head()).seq]).toEqual([null, 0, 0]);
    // Three attempts would reserve two entries more, so that opening is refused, and nothing of it is recorded.
    expect([await open(s, pushOf(3)), (await s.head()).seq, await s.alarmAt()]).toEqual(["scope-full", 0, null]);

    // The port sends nothing, as the production default does. The attempt stays recorded and not sent, and no wake-up is kept for it.
    out.accepting = false;
    const [op] = await open(s, pushOf(2)) as [OperationId];
    expect(await s.alarm()).toBe(true);
    expect([out.sent.length, await s.alarmAt(), await seen(s, op)]).toMatchObject([0, null, { state: "pending", sends: [{ attempt: 1, next: null, sent: null }] }]);
    // The scope has no free room: new work is refused.
    expect(await s.act(rita, "remark", { on: 0, fields: { text: "no room" } })).toMatchObject({ answer: "refused", reason: "scope-full" });

    // A runtime that can send finds the recorded attempt after a restart. Its refusal is written, with no free room, and opens attempt 2 after a delay.
    out.accepting = true;
    out.answer(op, 1, { result: "refused", evidence: { basis: "own-answer", body: { status: 409 } } });
    await s.restart();
    expect([await surface(s).effect(), out.attempts, (await s.head()).seq, await s.alarmAt()]).toEqual([1, [`${op}#1`], 2, timeMs(START)! + RETRY * 1000]);
    // Attempt 2 gets no answer. The stated attempts are used: no attempt is opened, no wake-up is asked for, and the duty stays visible.
    out.answer(op, 2, null);
    s.c.clock.now = at(RETRY);
    expect(await s.alarm()).toBe(true);
    expect([out.attempts, (await s.head()).seq, await s.alarmAt(), outcomes(await seen(s, op))]).toEqual([[`${op}#1`, `${op}#2`], 3, null, [["refused at 2"], ["unknown at 3"]]]);
    s.c.clock.now = at(86_400);
    s.c.bounds = { ...s.c.bounds, scopeEntries: 20 };
    await s.restart();
    expect([await s.alarm(), await surface(s).effect(), out.sent.length, (await s.head()).seq]).toEqual([false, 0, 2, 3]);

    // A retry is a new operation, opened by an entry that is new work. It has its own identity, and its success settles nothing earlier.
    const [retry] = await open(s, pushOf(1)) as [OperationId];
    out.answer(retry, 1, { result: "confirmed", evidence: { basis: "read", body: { commit: "c1" } } });
    expect(await s.alarm()).toBe(true);
    expect([retry, out.attempts.at(-1), (await seen(s, retry)).state, (await seen(s, op)).state, outcomes(await seen(s, op))]).toEqual(["4:0", "4:0#1", "settled", "unknown", [["refused at 2"], ["unknown at 3"]]]);

    // The factory is made before the next opening. Its reads must stay live, and its port replaces the wired port that now refuses.
    // The local object uses the same real SQLite storage; the opening and the owner and host rules remain the stand-ins above.
    out.accepting = false;
    const next = (await s.head()).seq + 1;
    let derived: EffectRequest | null = null;
    let factory: ScopeObject;
    class FactoryScope extends ScopeObject {
      protected override wiring(): Wiring {
        return {
          ports: { ...testPorts(s.c), outside: out, owners }, bounds: s.c.bounds,
          outside: (given) => {
            expect([given.scope()?.head.seq, given.state.operation(operationId(next, 0)), given.own(next)]).toEqual([next - 1, null, null]);
            // A StateView type over a raw SqliteStore would still expose these storage writes at runtime.
            expect("putOperation" in given.state || "append" in given.state || "retain" in given.state).toBe(false);
            return {
              accepts: () => true,
              send: async (request) => {
                const scope = given.scope()!;
                const operation = given.state.operation(request.operation)!;
                const origin = given.own(operation.attempts[0]!.opened)!;
                expect([given.state.scope(), scope.head, given.genesis()]).toEqual([scope, { seq: next, hash: origin.hash }, given.own(0)!.entry.input]);
                derived = { scope: scope.at, operation: operation.id, attempt: operation.attempts[0]!.attempt, owner: operation.owner, kind: operation.kind, origin };
                expect(derived).toEqual(request);
                return own(origin.hash);
              },
            };
          },
        };
      }
    }
    await s.inside((state) => { factory = new FactoryScope(state, {}); });
    const [fresh] = await open(s, pushOf(1)) as [OperationId];
    expect(await s.inside(() => factory.effect())).toBe(1);
    expect([derived, (await seen(s, fresh)).state, out.sent.length]).toEqual([
      { scope: s.at, operation: fresh, attempt: 1, owner: "platform:destination@1", kind: "push", origin: (await s.sealed(next))[0] }, "settled", 3,
    ]);

    // Recovery is a trusted port boundary, not another send. This made-up
    // read owner rejects unknown outcomes, as the destination's real read
    // owner does. Its host and rules are stand-ins; the operation rows,
    // send mark, alarm clock and restart below are real SQLite/runtime.
    const recovering = await found({ deliveryBatch: 1 });
    const originals: EffectRequest[] = [];
    const reads: EffectRequest[] = [];
    const diagnoses: string[] = [];
    let recovered: EffectAnswer | null = null;
    const recoveryOwners: typeof owners = {
      rules: (owner, kind) => kind === "read" ? { selects: false, read: true, retries: () => false, wellFormed: (result) => result === "confirmed" } : owners.rules(owner, kind),
    };
    const recoveryPort: Outside = {
      accepts: () => true,
      send: async (request) => { originals.push(request); return null; },
      recovery: {
        accepts: (owner, kind) => owner === "platform:destination@1" && kind === "read",
        read: async (request) => { reads.push(request); return recovered; },
      },
    };
    wired.set(recovering.name, () => ({ outside: recoveryPort, owners: recoveryOwners, diagnoses: (d) => { diagnoses.push(JSON.stringify(d)); } }));
    await recovering.restart();
    const [safe, mutation] = await open(recovering, { owner: "platform:destination@1", kind: "read", attempts: 1 }, pushOf(1)) as [OperationId, OperationId];
    expect([await surface(recovering).effect(), await surface(recovering).effect(), originals.map((r) => r.kind), reads]).toEqual([1, 1, ["read", "push"], []]);
    const delay = recovering.c.bounds.drainRetrySeconds;
    expect([await seen(recovering, safe), outcomes(await seen(recovering, mutation)), await recovering.alarmAt()]).toMatchObject([
      { state: "pending", sends: [{ attempt: 1, sent: START, next: timeMs(at(delay)) }] }, [["unknown at 2"]], timeMs(at(delay)),
    ]);
    // No immediate polling, even when another caller asks for a pass.
    expect([await surface(recovering).effect(), reads.length, originals.length]).toEqual([0, 0, 2]);
    recovering.c.clock.now = at(delay);
    expect(await recovering.alarm()).toBe(true);
    expect([reads, originals.length, await recovering.alarmAt(), outcomes(await seen(recovering, safe))])
      .toEqual([[originals[0]], 2, timeMs(at(2 * delay)), [[]]]);
    // The unresolved safe read's delayed row survives a restart. A failed
    // recovery writes no outcome and never rewrites the original sent mark.
    await recovering.restart();
    expect([await surface(recovering).effect(), reads.length, await recovering.alarmAt()]).toEqual([0, 1, timeMs(at(2 * delay))]);
    recovered = { result: "confirmed", evidence: { basis: "read", body: { commit: "read-later" } } };
    recovering.c.clock.now = at(2 * delay);
    expect(await recovering.alarm()).toBe(true);
    expect([reads, originals.length, await seen(recovering, safe), outcomes(await seen(recovering, mutation)), await recovering.alarmAt()]).toMatchObject([
      [originals[0], originals[0]], 2, { state: "settled", sends: [{ attempt: 1, sent: START }], operation: { attempts: [{ attempt: 1, outcomes: [{ result: "confirmed", seq: 3 }] }] } }, [["unknown at 2"]], null,
    ]);
    expect([await surface(recovering).effect(), originals.filter((r) => r.kind === "read").length, originals.filter((r) => r.kind === "push").length, reads.every((r) => r.operation === safe && r.kind === "read")]).toEqual([0, 1, 1, true]);

    // Two original mutations now lose their replies and record unknown.
    // The trusted custody reader below scripts durably retained public
    // reply metadata only; it proves the driver's boundary, not custody or
    // a provider. Scope eviction loses the driver, not this outside script.
    const [lateFirst, lateSecond] = await open(recovering, pushOf(1), pushOf(1)) as [OperationId, OperationId];
    expect([await surface(recovering).effect(), await surface(recovering).effect(), originals.length]).toEqual([1, 1, 4]);
    const unknowns = (await recovering.sealed(5)).slice(0, 2);
    expect([outcomes(await seen(recovering, lateFirst)), outcomes(await seen(recovering, lateSecond)), await recovering.alarmAt()]).toEqual([[["unknown at 5"]], [["unknown at 6"]], null]);
    const pending = [
      { operation: lateFirst, attempt: 1, answer: own("reply-first") },
      { operation: lateSecond, attempt: 1, answer: own("reply-second") },
    ];
    const pages: number[] = [];
    let cursor = 0;
    recoveryPort.replies = (limit) => {
      pages.push(limit);
      const answers = pending.slice(cursor, cursor + limit);
      cursor += answers.length;
      return { answers, more: cursor < pending.length };
    };
    await recovering.restart();
    expect([await surface(recovering).effect(), pages, originals.length, outcomes(await seen(recovering, lateFirst)), outcomes(await seen(recovering, lateSecond)), await recovering.alarmAt()]).toEqual([
      1, [1], 4, [["unknown at 5", "confirmed at 7"]], [["unknown at 6"]], timeMs(at(2 * delay)),
    ]);
    // `more` wakes the next bounded page immediately. Only the already
    // received own replies follow unknown; no mutation is sent or marked
    // again, and both unknown entries keep their exact original bytes.
    expect(await recovering.alarm()).toBe(true);
    expect([pages, originals.length, outcomes(await seen(recovering, lateSecond)), (await recovering.sealed(5)).slice(0, 2), await recovering.alarmAt()]).toEqual([
      [1, 1], 4, [["unknown at 6", "confirmed at 8"]], unknowns, null,
    ]);
    expect([await seen(recovering, lateFirst), await seen(recovering, lateSecond), outcomes(await seen(recovering, mutation))]).toMatchObject([
      { state: "settled", sends: [{ attempt: 1, sent: at(2 * delay) }] }, { state: "settled", sends: [{ attempt: 1, sent: at(2 * delay) }] }, [["unknown at 2"]],
    ]);
    recoveryPort.replies = () => { throw new Error("private-retained-reply-secret"); };
    expect([await surface(recovering).effect(), originals.length, (await recovering.head()).seq, await recovering.alarmAt()]).toEqual([0, 4, 8, null]);
    expect(diagnoses.some((d) => d.includes("outside-replies-failed"))).toBe(true);
    expect(diagnoses.join("").includes("private-retained-reply-secret")).toBe(false);
  });

  test("a late answer that arrives while the scope's turn is unavailable is kept in hand, and the driver writes it at the next wake-up, after the attempt's row is closed; the request is not sent again", async () => {
    // A turn writes one timed entry. Two holds end at one time, so a turn at that time leaves one due and is `busy`.
    const s = await found({ timedAttemptsPerTurn: 1 });
    const out = outsideOf(s.name);
    await s.holds(2);
    const [op] = await open(s, pushOf(1)) as [OperationId];
    // The request gets no answer. Its outcome is `unknown`, in entry 8, and that entry closes the driver's row.
    out.answer(op, 1, null);
    expect([await s.alarm(), outcomes(await seen(s, op))]).toEqual([true, [["unknown at 8"]]]);

    // The request's own answer arrives when both holds are due. The turn writes one end and is spent: the answer cannot be written.
    s.c.clock.now = at(HOLD);
    const retry = timeMs(at(HOLD + PROPOSED_BOUNDS.drainRetrySeconds));
    expect([await late(s, out, op, 1, own("c1")), (await s.head()).seq, outcomes(await seen(s, op)), await s.alarmAt()]).toEqual([{ recorded: "unavailable" }, 9, [["unknown at 8"]], retry]);
    // The wake-up's turn writes the other end. The driver then offers the answer it kept: the late answer, of that operation and attempt, with its evidence.
    expect([await s.alarm(), (await s.sealed(11))[0]?.entry.input, (await seen(s, op)).state, out.attempts, await s.alarmAt()]).toEqual([
      true, { type: "outcome", operation: op, attempt: 1, owner: "platform:destination@1", kind: "push", result: "confirmed", evidence: { basis: "own-answer", body: { commit: "c1" } } }, "settled", [`${op}#1`], null,
    ]);
    // Nothing is in hand any more: a pass offers nothing, and the same answer again is a copy.
    expect([await surface(s).effect(), await late(s, out, op, 1, own("c1")), (await s.head()).seq]).toEqual([0, { recorded: "repeat", seq: 11 }, 11]);
  });

  test("an answer in hand that stays unavailable for a reason of its own owner holds back no other: with a batch of 1 the answer behind it is written at the second pass, and the first stays in hand, of its attempt and with its evidence, and its operation stays a duty", async () => {
    // Three holds end at one time, and a turn writes one timed entry. The owner of a mint declares no cleanup, and a confirmed mint would open one.
    const s = await found({ timedAttemptsPerTurn: 1, deliveryBatch: 1 });
    const out = outsideOf(s.name);
    mint.closure = 0;
    await s.holds(3);
    const [older, later] = await open(s, MINT, pushOf(1)) as [OperationId, OperationId];
    // Neither request gets an answer. Each outcome is `unknown`, and those entries close the driver's rows.
    for (const id of [older, later]) out.answer(id, 1, null);
    expect([await s.alarm(), await s.alarm(), outcomes(await seen(s, older)), outcomes(await seen(s, later))]).toEqual([true, true, [["unknown at 11"]], [["unknown at 12"]]]);

    // Both late answers arrive while the turn is spent on the ends of the holds: both are kept in hand, the mint's first.
    s.c.clock.now = at(HOLD);
    const minted: EffectAnswer = { result: "confirmed", evidence: { basis: "own-answer", body: { token: "t1" } } };
    expect([await late(s, out, older, 1, minted), await late(s, out, later, 1, own("c1")), (await s.head()).seq]).toEqual([{ recorded: "unavailable" }, { recorded: "unavailable" }, 14]);
    // The first pass offers the mint's answer. The turn is free, and the answer is still not written: its owner's fault. It goes behind the other.
    expect([await s.alarm(), (await s.head()).seq]).toEqual([true, 15]);
    // The second pass, after the delay, writes the push's answer. The mint's is in hand: the driver asks for the next wake-up, and the operation is a duty with what it reserved.
    s.c.clock.now = at(HOLD + PROPOSED_BOUNDS.drainRetrySeconds);
    expect([await s.alarm(), (await s.sealed(16))[0]?.entry.input, (await seen(s, later)).state, await seen(s, older), await s.alarmAt()]).toMatchObject([
      true, { type: "outcome", operation: later, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: { commit: "c1" } } }, "settled",
      { state: "unknown", operation: { attempts: [{ outcomes: [{ result: "unknown", seq: 11 }] }] } }, timeMs(at(HOLD + 2 * PROPOSED_BOUNDS.drainRetrySeconds)),
    ]);
    // Once the owner declares the cleanup, the answer that was kept is written as it arrived, and opens the cleanup. No request was sent again.
    mint.closure = 2;
    s.c.clock.now = at(HOLD + 2 * PROPOSED_BOUNDS.drainRetrySeconds);
    expect([await s.alarm(), (await s.sealed(17))[0]?.entry, out.attempts.slice(0, 2)]).toMatchObject([
      true, { input: { type: "outcome", operation: older, attempt: 1, result: "confirmed", evidence: minted.evidence }, effects: [{ effect: "attempt", operation: older, attempt: 1, result: "confirmed" }, { effect: "operation", kind: "push" }, { effect: "attempt", attempt: 1, result: "opened" }] },
      [`${older}#1`, `${later}#1`],
    ]);
  });

  test("after a restart the driver walks every attempt that nothing could send, one page at a pass: an attempt that still cannot be sent holds back none after it, and what is due does not use the page up", async () => {
    const s = await found({ deliveryBatch: 1 });
    const out = outsideOf(s.name);
    // Three attempts that the port does not send. A pass looks at one, and leaves it recorded with no wake-up.
    out.accepting = false;
    const [fence, first, second] = await open(s, FENCE, pushOf(1), pushOf(1)) as [OperationId, OperationId, OperationId];
    expect([await s.alarm(), await s.alarm(), await s.alarm(), out.sent.length, await s.alarmAt()]).toEqual([true, true, true, 0, null]);

    // A runtime that sends a push, and has no rules for the fence. After its restart a new attempt is due.
    out.accepting = true;
    await s.restart();
    const [due] = await open(s, pushOf(1)) as [OperationId];
    for (const id of [first, second, due]) out.answer(id, 1, own("c1"));
    // The first pass sends what is due, and looks at the first page: the fence, which stays as it is. Pages remain, so it asks to be woken at once.
    expect([await surface(s).effect(), out.attempts, await s.alarmAt()]).toEqual([1, [`${due}#1`], timeMs(START)]);
    // Each wake-up takes the next page. The walk ends at a page that is not full, and asks for nothing more.
    expect([await s.alarm(), await s.alarm(), await s.alarmAt(), await s.alarm(), await s.alarmAt()]).toEqual([true, true, timeMs(START), true, null]);
    expect([out.attempts, await seen(s, fence), (await seen(s, second)).state, await s.alarm(), await surface(s).effect()]).toMatchObject([
      [`${due}#1`, `${first}#1`, `${second}#1`], { state: "pending", sends: [{ attempt: 1, next: null, sent: null }] }, "settled", false, 0,
    ]);
  });

  // Invariant: after a restart, the object's first call sends an attempt that was recorded and not sent, with no further commit
  // and no alarm, and the sent mark keeps it from being sent again. This is the register whose create-repository attempt was
  // recorded before the Git host's settings existed: the settings are added and the Worker restarted.
  test("an attempt recorded while the outside port refused is sent after a restart with a port that accepts, at the first call, which is a read: no commit and no alarm come before it, and it is sent exactly once", async () => {
    const s = await found();
    const out = outsideOf(s.name);
    out.accepting = false;
    const [op] = await open(s, pushOf(1)) as [OperationId];
    // The port refuses: the attempt stays recorded and not sent, and asks for no wake-up.
    expect([await surface(s).effect(), out.sent.length, await s.alarmAt()]).toEqual([0, 0, null]);
    const head = await s.head();

    // The settings change, and the object restarts. Its first call is a read of the operation.
    out.accepting = true;
    await s.restart();
    expect((await seen(s, op)).state).toBe("pending");
    // The pass runs after the read's answer, which does not wait for it. A bounded number of turns of the event loop, and no time.
    for (let turn = 0; turn < 200 && out.sent.length === 0; turn++) await tick();
    expect([out.attempts, await s.head()]).toEqual([[`${op}#1`], head]);
    out.answer(op, 1, own("c1"));
    while ((await seen(s, op)).state !== "settled") await tick();

    // Another restart and every way a pass starts: nothing is sent again.
    await s.restart();
    expect([(await seen(s, op)).state, await surface(s).effect(), await s.alarm(), out.attempts]).toEqual(["settled", 0, false, [`${op}#1`]]);
  });

  // Invariant: bounded same-life acceptance detection advances past an
  // unsupported prefix; only the later enabled attempt leaves, once.
  // Generic owner/kind acceptance is scripted, not a native host policy.
  test("an attempt recorded while the outside port refused is sent, with no restart, after bounded reads find its later accepted kind beyond an unsupported prefix; it is sent exactly once", async () => {
    const s = await found({ deliveryBatch: 1 });
    const out = outsideOf(s.name);
    let enabled = false;
    let asked = 0;
    wired.set(s.name, () => ({ outside: {
      accepts: (_owner, kind) => { asked++; return enabled && kind === "push"; },
      send: (request) => out.send(request),
      late: (answer) => out.late(answer),
    } }));
    try {
      await s.restart(); // Construct the scripted generic port before opening.
      const [first, second, op] = await open(s, MINT, MINT, pushOf(1)) as [OperationId, OperationId, OperationId];
      for (let pass = 0; pass < 4; pass++) expect(await surface(s).effect()).toBe(0);
      expect([out.sent.length, await s.alarmAt()]).toEqual([0, null]);
      const head = await s.head();

      // While no kind is accepted, ordinary reads inspect at most one batch
      // without another pass, request, entry or alarm.
      for (let read = 0; read < 3; read++) {
        const before = asked;
        expect((await seen(s, op)).state).toBe("pending");
        expect(asked - before).toBeLessThanOrEqual(1);
      }
      expect([out.sent.length, await s.alarmAt()]).toEqual([0, null]);

      // Only the later kind becomes accepted. The two prefix rows stay
      // unsupported; repeated reads must reach the later row in this life.
      out.answer(op, 1, own("c1"));
      enabled = true;
      let detected = false;
      for (let read = 0; read < 3 && !detected; read++) {
        await seen(s, op);
        detected = out.sent.length > 0 || await s.alarmAt() !== null;
      }
      expect(detected).toBe(true);
      // Detection restarts the original bounded parked walk. Its immediate
      // alarms, not event-loop ticks, advance past the two unsupported rows.
      for (let pass = 0; pass < 3 && out.sent.length === 0; pass++) {
        expect(await s.alarmAt()).toBe(timeMs(START));
        expect(await s.alarm()).toBe(true);
      }
      expect([out.attempts, out.sent[0]?.origin.hash, out.sent[0]?.origin.entry.seq]).toEqual([[`${op}#1`], head.hash, head.seq]);
      expect((await seen(s, op)).state).toBe("settled");

      // Unsupported prefix rows remain durable, unsent and pending. Further
      // reads/passes/alarms cannot resend the accepted attempt's original.
      for (const id of [first, second]) expect(await seen(s, id)).toMatchObject({ state: "pending", sends: [{ attempt: 1, next: null, sent: null }] });
      for (let read = 0; read < 3; read++) await seen(s, op);
      expect([await surface(s).effect(), await s.alarm(), out.attempts, await s.alarmAt()]).toEqual([0, false, [`${op}#1`], null]);
    } finally { wired.delete(s.name); }
  });

  test("a scope whose pinned definition the runtime cannot run sends nothing outside the service: the attempt stays recorded, with no wake-up, and is sent once the runtime can run the definition. The capability is the scripted stand-in", async () => {
    // The lane of the other tests, with one capability guard. The scripted test capability, a stand-in, is the code for it.
    const staged = variant(definition.declared, (def) => { def.acts.report.guards.push({ capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } }); def.acts.report.fields.commit = { type: "commit", required: true }; });
    const { signed, name } = founding(at(60), staged);
    const c = controls(name, START);
    c.capability = {};
    const founded = await stubOf(name).found(signed, staged.declared);
    if (founded.answer !== "accepted") throw new Error(`not founded: ${JSON.stringify(founded)}`);
    const s = new Lane(name, c, founded.receipt.fact.at, founded.receipt, signed);
    const out = outsideOf(name);
    const [op] = await open(s, pushOf(1)) as [OperationId];

    // The outside system would answer. The runtime loses the code: section 6.1, the scope admits nothing. So no outcome could be
    // written, and no request leaves.
    out.answer(op, 1, { result: "confirmed", evidence: { basis: "read", body: { commit: "c1" } } });
    c.capability = null;
    await s.restart();
    expect([await s.alarm(), out.sent.length, await s.alarmAt()]).toEqual([true, 0, null]);
    // With the code again, the first pass after a restart finds the recorded attempt and sends it.
    c.capability = {};
    await s.restart();
    expect([await surface(s).effect(), out.attempts, (await seen(s, op)).state]).toEqual([1, [`${op}#1`], "settled"]);
  });

  test("a stream that waits is sent the head of an entry that a late answer wrote, when it is committed: no caller's request, no further write and no alarm follows that entry; and the head of a checkpoint in the same way. The test readers, the outside system and the opening entry are stand-ins", async () => {
    const s = await found();
    const out = outsideOf(s.name);
    const [op] = await open(s, pushOf(1)) as [OperationId];
    // The one attempt is sent and gets no answer: its outcome is `unknown`, in entry 2. It was the last attempt, so nothing is left to send.
    out.answer(op, 1, null);
    expect([await s.alarm(), (await s.head()).seq, outcomes(await seen(s, op)), await s.alarmAt()]).toEqual([true, 2, [["unknown at 2"]], null]);

    const text = new TextDecoder();
    const line = (read: ReadableStreamReadResult<Uint8Array> | null) => (read === null ? "nothing was sent" : read.done ? "the stream ended" : JSON.parse(text.decode(read.value)) as unknown);
    const stream = await s.inside(async (_state, instance) => {
      const opened = await (instance as { stream(reader: unknown): Promise<{ id: string; body: ReadableStream<Uint8Array> }> }).stream(reader);
      const from = opened.body.getReader();
      // The stream begins with the head, entry 2. The next read waits: the reader has been sent that head, and there is no other.
      const first = line(await from.read());
      const waiting = from.read();
      const idle = await Promise.race([waiting, tick().then(() => null)]);
      // That request's own answer arrives by itself. The driver writes it as entry 3, in a turn that no caller asked for.
      const recorded = await out.deliver!(op, 1, own("c1"));
      // Nothing else happens: no call, no write and no alarm. The read that waited has the new head.
      const sent = await Promise.race([waiting, tick().then(() => null)]);
      // A checkpoint is the one writer among the object's calls that follows nothing itself. Its entry is told to the stream in the same way.
      const next = from.read();
      const checkpoint = await (instance as { checkpoint(): Promise<{ answer: string }> }).checkpoint();
      const after = await Promise.race([next, tick().then(() => null)]);
      await from.cancel();
      return { first, idle: line(idle), recorded: recorded.recorded, sent: line(sent), checkpoint: checkpoint.answer, after: line(after) };
    });
    const [second, third, fourth] = (await s.sealed(2)).map((e) => ({ at: { seq: e.entry.seq, hash: e.hash } }));
    expect([stream, (await s.head()).seq, outcomes(await seen(s, op)), await s.alarmAt()]).toEqual([{ first: second, idle: "nothing was sent", recorded: "written", sent: third, checkpoint: "written", after: fourth }, 4, [["unknown at 2", "confirmed at 3"]], null]);
  });

  test("a snapshot that comes with an answer is stored only as its canonical bytes: the same pairs in another order, or with other spacing, have the same digest and are no answer. A plain function, and no scope", () => {
    const lane = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}` } as never;
    const pairs = [1, 2].map((root) => ({ ref: stagedRefName(lane, "c".repeat(40), root), target: "c".repeat(40) }));
    const snapshot = snapshotInput(pairs)!;
    const answer = (bytes: string) => ({ result: "confirmed", evidence: { basis: "own-answer", body: { read: true } }, retain: [{ ...snapshot, bytes }] });
    // Each of the three has the pairs of the snapshot. Only the first is its bytes, and only that one is read as the snapshot: by
    // the driver, and by every reader of a retained input (the contract's revision 20, point EZ5; row I3-48).
    const given = [snapshot.bytes, ` ${snapshot.bytes}`, canonicalize([...pairs].reverse())];
    expect([given.map((bytes) => snapshotRead(snapshot.digest, bytes) !== null), given.map((bytes) => isAnswer(answer(bytes)))]).toEqual([[true, false, false], [true, false, false]]);
  });
});
