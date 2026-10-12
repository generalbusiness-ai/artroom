import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Answer, Receipt, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, timeOf } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedIntent } from "@generalbusiness/artroom-client";
import { Custody, CustodyError, Lost, identityId, meaningOf, UNRESOLVED_MOST, type Envelope, type Identity } from "../src/index.ts";
import { fileStore } from "../src/node.ts";

// The scope's answers here are scripted: `deliver` and `settle` are STAND-INs for a scope's submit and settlement. What a real
// scope answers to a replay is shown in room.scope.test.ts; these cases show what the server keeps and sends.
const signer = secretSigner(new Uint8Array(32).fill(7));
const lane: ScopeRef = { scope: "sc_lane", inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa", kind: "lane" } as ScopeRef;
const resource: ScopeRef = { scope: "sc_other", inc: "in_bbbbbbbbbbbbbbbbbbbbbbbbbb", kind: "lane" } as ScopeRef;
const T0 = Date.parse("2099-01-01T00:00:00Z");

function setup(bounds?: Parameters<typeof fileStore>[1]) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-custody-"));
  let now = T0;
  const clock = { at: () => now, advance: (ms: number) => { now += ms; } };
  const make = () => new Custody(fileStore(dir, bounds, clock.at), () => timeOf(clock.at()));
  return { dir, clock, make, custody: make() };
}

const identity = (key: string): Identity => ({ service: "https://scopes.test", membership: null, signer: signer.key, target: lane, key });
const build = (key: string, comment = "hello") => async (): Promise<{ binding: { definition: string; kind: string; declaration: null; pinned: "platform:inbox@1" }; envelope: Envelope }> => ({
  binding: { definition: "issue", kind: "comment", declaration: null, pinned: "platform:inbox@1" },
  envelope: { signed: await signedIntent(signer, { to: lane, kind: "comment", fields: { body: comment } }, { idempotencyKey: key, now: T0 }), beside: {} },
});
const receiptOf = (signed: SignedIntent, seq: number): Receipt => ({ fact: { at: lane, seq, hash: `sha256:${"a".repeat(64)}` }, definition: "platform:inbox@1", intent: intentDigest(signed.intent), effects: [], sends: [], epoch: 0 });
const accepted = (signed: SignedIntent, seq = 3): Answer => ({ answer: "accepted", receipt: receiptOf(signed, seq) });
const refused: Answer = { answer: "refused", reason: "guard-failed", name: "nope", judgedAt: { seq: 2, hash: `sha256:${"b".repeat(64)}` } };
const notAfter = timeOf(T0 + 15 * 60_000);

describe("custody keeps the exact envelope under the caller's key", () => {
  // Invariant: after a lost first reply, settle with the caller's key finds the receipt of the exact envelope, also after the
  // intent's notAfter has passed; nothing is signed again.
  test("a lost reply, then settle finds the receipt, also after notAfter", async () => {
    const { custody, clock } = setup();
    const sent: SignedIntent[] = [];
    const lost = await custody.send(identity("k1"), meaningOf("m"), build("k1"), async (e) => { sent.push(e.signed); throw new Lost(); }, { notAfter });
    expect("lost" in lost && lost.record.phase).toBe("unknown");
    clock.advance(20 * 60_000);
    const settled = await custody.settle(identity("k1"), async (e) => receiptOf(e.signed, 3));
    expect([settled!.record.phase, settled!.receipt?.fact.seq]).toEqual(["accepted", 3]);
    expect(settled!.record.envelope.signed).toEqual(sent[0]);
    expect(sent[0]!.intent.idempotencyKey).toBe("k1");
  });

  // Invariant: an unavailable resend and a not-found settlement resolve nothing; the record stays unknown and is never evicted.
  test("unavailable and not-found leave the record unknown", async () => {
    const { custody } = setup();
    await custody.send(identity("k2"), meaningOf("m"), build("k2"), async () => { throw new Lost(); }, { notAfter });
    const again = await custody.send(identity("k2"), meaningOf("m"), build("k2"), async () => ({ answer: "unavailable", reason: "busy" }), { notAfter });
    expect("answer" in again && again.record.phase).toBe("unknown");
    const settled = await custody.settle(identity("k2"), async () => null);
    expect([settled!.record.phase, settled!.receipt]).toEqual(["unknown", null]);
    expect((await custody.store.unresolved()).map((u) => u.key)).toEqual(["k2"]);
  });

  // Invariant: a refused record returns its kept refusal and sends nothing; only resubmit: true sends the same envelope again, and
  // both outcomes stay in the record.
  test("a terminal refusal is kept; resubmit sends the same bytes and keeps both outcomes", async () => {
    const { custody } = setup();
    const sent: SignedIntent[] = [];
    const deliver = (answer: (s: SignedIntent) => Answer) => async (e: Envelope) => { sent.push(e.signed); return answer(e.signed); };
    await custody.send(identity("k3"), meaningOf("m"), build("k3"), deliver(() => refused), { notAfter });
    const kept = await custody.send(identity("k3"), meaningOf("m"), build("k3"), deliver(() => { throw new Error("must not send"); }), { notAfter });
    expect("answer" in kept && [kept.retained, kept.answer.answer]).toEqual([true, "refused"]);
    const again = await custody.send(identity("k3"), meaningOf("m"), build("k3"), deliver((s) => accepted(s)), { notAfter, resubmit: true });
    expect("answer" in again && [again.retained, again.answer.answer, again.record.phase]).toEqual([false, "accepted", "accepted"]);
    expect(sent).toHaveLength(2);
    expect(canonicalize(sent[1])).toBe(canonicalize(sent[0]));
    expect(again.record.outcomes.map((o) => ("answer" in o ? o.answer.answer : "other"))).toEqual(["refused", "accepted"]);
  });

  // Invariant: the same key with another meaning is refused as conflicting, and nothing is sent.
  test("the same key with another meaning is refused without sending", async () => {
    const { custody } = setup();
    await custody.send(identity("k4"), meaningOf("first"), build("k4"), async (e) => accepted(e.signed), { notAfter });
    await expect(custody.send(identity("k4"), meaningOf("second"), build("k4", "other"), async () => { throw new Error("must not send"); }, { notAfter }))
      .rejects.toMatchObject({ why: { held: "conflicting" } });
  });

  // Invariant: two processes sharing the store cannot prepare one identity at once: the second is told the identity is locked.
  test("a second process is locked out while the first holds the identity", async () => {
    const { make } = setup();
    const [a, b] = [make(), make()];
    let release!: () => void;
    const first = a.send(identity("k5"), meaningOf("m"), build("k5"), (e) => new Promise((resolve) => { release = () => resolve(accepted(e.signed)); }), { notAfter });
    await new Promise((r) => setTimeout(r, 20));
    await expect(b.send(identity("k5"), meaningOf("m"), build("k5"), async () => { throw new Error("must not send"); }, { notAfter })).rejects.toMatchObject({ why: { held: "locked" } });
    release();
    expect(((await first) as { answer: Answer }).answer.answer).toBe("accepted");
  });

  // Invariant: a restart between keeping and sending resends the bytes kept before it, with no new signature.
  test("a restart between prepare and send resends the same bytes", async () => {
    const { make, clock } = setup();
    const kept = await make().keep(identity("k6"), meaningOf("m"), build("k6"), notAfter);
    clock.advance(60_000);
    let delivered: SignedIntent | null = null;
    await make().send(identity("k6"), meaningOf("m"), async () => { throw new Error("must not build again"); }, async (e) => { delivered = e.signed; return accepted(e.signed); }, { notAfter });
    expect(canonicalize(delivered)).toBe(canonicalize(kept.envelope.signed));
  });

  // Invariant: an accepted preparation step and a lost step reply are recorded apart from the act; the act's phase does not move,
  // the same step is asked again with the same intent, and the act's own submission is its own outcome.
  test("preparation steps live apart from the act's phase", async () => {
    const { custody } = setup();
    await custody.keep(identity("k7"), meaningOf("m"), build("k7"), notAfter);
    const asked: string[] = [];
    const stage = await custody.step(identity("k7"), resource, "hold@1", "stage", async (s) => { asked.push(`stage ${intentDigest(s.intent)}`); return accepted(s, 9); });
    const lost = await custody.step(identity("k7"), resource, "hold@1", "check", async () => { throw new Lost(); });
    expect([stage.step.phase, lost.step.phase, lost.record.phase]).toEqual(["answered", "unknown", "prepared"]);
    const retried = await custody.step(identity("k7"), resource, "hold@1", "check", async (s) => { asked.push(`check ${intentDigest(s.intent)}`); return accepted(s, 10); });
    expect([retried.step.phase, retried.record.phase, Object.keys(retried.record.steps).length]).toEqual(["answered", "prepared", 2]);
    const act = await custody.send(identity("k7"), meaningOf("m"), build("k7"), async (e) => accepted(e.signed, 11), { notAfter });
    expect("answer" in act && act.answer.answer === "accepted" && act.answer.receipt.fact.seq).toBe(11);
    expect(new Set(asked.map((a) => a.split(" ")[1])).size).toBe(1);
  });

  // Invariant: a full store refuses a new preparation and names at most eight of the oldest unresolved keys; nothing is evicted.
  test("a full store refuses a new preparation and names eight keys", async () => {
    const { custody, clock } = setup();
    for (let i = 0; i < UNRESOLVED_MOST; i++) { clock.advance(1000); await custody.keep(identity(`open-${i}`), meaningOf(i), build(`open-${i}`), notAfter); }
    const refusal = await custody.keep(identity("one-more"), meaningOf("x"), build("one-more"), notAfter).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(CustodyError);
    expect((refusal as CustodyError).why).toEqual({ held: "full", keys: Array.from({ length: 8 }, (_, i) => `open-${i}`) });
    expect((await custody.store.unresolved()).length).toBe(UNRESOLVED_MOST);
  }, 60_000);

  // Invariant: outcomes past 64 move to the record's segment, and every outcome stays readable in order.
  test("repeated resubmissions past 64 outcomes keep every outcome", async () => {
    const { custody } = setup();
    for (let i = 0; i < 70; i++) await custody.send(identity("k8"), meaningOf("m"), build("k8"), async () => refused, { notAfter, resubmit: i > 0 });
    const record = (await custody.find(identity("k8")))!;
    expect([record.count, record.outcomes.length]).toEqual([70, 64]);
    expect((await custody.outcomes(identityId(identity("k8")), record)).length).toBe(70);
  });

  // Invariant: archive rotation moves terminal records into append-only files with an index, and a terminal record stays findable
  // by its identity; unresolved records are never archived.
  test("archived terminal records stay findable through the index", async () => {
    const { custody, dir } = setup({ terminalMost: 2, ageDays: 30, archiveBytes: 4096 });
    await custody.keep(identity("open"), meaningOf("o"), build("open"), notAfter);
    for (let i = 0; i < 6; i++) await custody.send(identity(`t${i}`), meaningOf(i), build(`t${i}`), async (e) => accepted(e.signed, i), { notAfter });
    const archives = readdirSync(join(dir, "archive")).filter((f) => f.endsWith(".jsonl"));
    expect(archives.length).toBeGreaterThan(1);
    for (const f of archives) expect(statSync(join(dir, "archive", f)).size).toBeLessThanOrEqual(4096);
    const index = JSON.parse(readFileSync(join(dir, "archive", "index.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(index)).toHaveLength(4);
    for (let i = 0; i < 6; i++) expect((await custody.find(identity(`t${i}`)))?.phase).toBe("accepted");
    expect((await custody.find(identity("open")))?.phase).toBe("prepared");
    const kept = await custody.send(identity("t0"), meaningOf(0), build("t0"), async () => { throw new Error("must not send"); }, { notAfter });
    expect("answer" in kept && kept.retained).toBe(true);
  });

  // Invariant: no case makes a key: every envelope kept carries the caller's key.
  test("every kept envelope carries the caller's key", async () => {
    const { custody, dir } = setup();
    await custody.keep(identity("caller-key"), meaningOf("m"), build("caller-key"), notAfter);
    const files = readdirSync(join(dir, "records"));
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, "records", files[0]!), "utf8")).envelope.signed.intent.idempotencyKey).toBe("caller-key");
    expect(statSync(join(dir, "records")).mode & 0o777).toBe(0o700);
  });
});
