import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Answer, SignedIntent } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, timeOf } from "@generalbusiness/artroom-bytes";
import { signedIntent } from "@generalbusiness/artroom-client";
import { Custody, CustodyError, Lost, RECORD_BYTES, identityId, meaningOf, memoryStore, UNRESOLVED_MOST, type CustodyRecord, type Envelope } from "../src/index.ts";
import { blockedBy, fileStore, releaseLock, takeLock } from "../src/node.ts";
import { McpMetrics, type McpMetricPoint } from "../src/metrics.ts";
import { T0, accepted, build, identity, lane, notAfter, receiptOf, refused, resource, signer } from "./support/custody.ts";

// The scope's answers here are scripted: `deliver` and `settle` are STAND-INs for a scope's submit and settlement. What a real
// scope answers to a replay is shown in room.scope.test.ts; these cases show what the server keeps and sends.

function setup(bounds?: Parameters<typeof fileStore>[1]) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-custody-"));
  let now = T0;
  const clock = { at: () => now, advance: (ms: number) => { now += ms; } };
  const make = () => new Custody(fileStore(dir, bounds, clock.at), () => timeOf(clock.at()));
  return { dir, clock, make, custody: make() };
}

/** A second process on the same store: `support/custody-child.ts`, under the repository's pinned TypeScript loader. */
function child(asked: Record<string, unknown>): { done: Promise<{ code: number | null; out: string }>; line: (text: string) => Promise<void>; kill: () => void } {
  const process_ = spawn(process.execPath, ["--import", "tsx", "--disable-warning=DEP0205", new URL("./support/custody-child.ts", import.meta.url).pathname, JSON.stringify(asked)], { cwd: new URL("../../..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  const waiting: { text: string; resolve: () => void }[] = [];
  process_.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); for (const w of waiting.splice(0)) { if (out.includes(w.text)) w.resolve(); else waiting.push(w); } });
  let err = "";
  process_.stderr.on("data", (chunk: Buffer) => { err += chunk.toString("utf8"); });
  return {
    done: new Promise((resolve) => { process_.on("exit", (code) => resolve({ code, out: out + err })); }),
    line: (text) => new Promise((resolve) => { if (out.includes(text)) resolve(); else waiting.push({ text, resolve }); }),
    kill: () => { process_.kill("SIGKILL"); },
  };
}

/**
 * What several children of the lease operation did: how many were refused, and when each that entered was inside. A child that
 * starts late, under load, may lawfully enter after another has left; what must never happen is two inside at once.
 */
function holdings(results: readonly { out: string }[]): { refused: number; inside: [number, number][] } {
  const lines = results.map((r) => r.out.trim());
  const inside = lines.filter((l) => l.startsWith("entered ")).map((l) => l.split(" ").slice(1).map(Number) as [number, number]).sort((a, b) => a[0] - b[0]);
  return { refused: lines.filter((l) => l === "refused").length, inside };
}
const overlapping = (inside: readonly [number, number][]): number => inside.filter((h, i) => i > 0 && h[0] < inside[i - 1]![1]).length;

describe("custody keeps the exact envelope under the caller's key", () => {
  // Invariant: after a lost first reply, settle with the caller's key finds the receipt of the exact envelope, also after the
  // intent's notAfter has passed; nothing is signed again.
  test("a lost reply, then settle finds the receipt, also after notAfter", async () => {
    const { custody, clock } = setup();
    const points: McpMetricPoint[] = [], metrics = new McpMetrics({ report: p => { points.push(p); } });
    const sent: SignedIntent[] = [];
    const lost = await metrics.call("act", () => custody.send(identity("k1"), meaningOf("m"), build("k1"), async (e) => { sent.push(e.signed); throw new Lost(); }, { notAfter }), () => ({ end: "unavailable", bytes: 0 }));
    expect("lost" in lost && lost.record.phase).toBe("unknown");
    clock.advance(20 * 60_000);
    // A real file-store write is held back once. An observed settlement
    // answer alone cannot emit a persisted accepted transition.
    const write = custody.store.write;
    custody.store.write = async (id, record, options) => { if (record.phase === "accepted") throw new Error("scripted storage failure"); return write(id, record, options); };
    try {
      await expect(metrics.call("settle", () => custody.settle(identity("k1"), async e => receiptOf(e.signed, 3)), () => ({ end: "ok", bytes: 0 }))).rejects.toMatchObject({ why: { held: "unreadable" } });
    } finally { custody.store.write = write; }
    expect((await custody.store.read(identityId(identity("k1"))))?.phase).toBe("unknown");
    expect(points.filter(p => p.blobs[0] === "custody").map(p => p.blobs[5])).toEqual(["prepared", "sent", "unknown"]);
    const settled = await metrics.call("settle", () => custody.settle(identity("k1"), async (e) => receiptOf(e.signed, 3)), () => ({ end: "ok", bytes: 0 }));
    expect([settled!.record.phase, settled!.receipt?.fact.seq]).toEqual(["accepted", 3]);
    expect(settled!.record.envelope.signed).toEqual(sent[0]);
    expect(sent[0]!.intent.idempotencyKey).toBe("k1");
    expect(points.filter(p => p.blobs[0] === "custody").map(p => p.blobs[5])).toEqual(["prepared", "sent", "unknown", "accepted"]);
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
    expect(again.record.outcomes.map((o) => ["answer" in o ? o.answer.answer : "other", o.attempt])).toEqual([["refused", 1], ["accepted", 2]]);
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
    expect((refusal as CustodyError).why).toEqual({ held: "full", reason: "count", keys: Array.from({ length: 8 }, (_, i) => `open-${i}`) });
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
  // Invariant: a resubmission of a refusal is kept as a new unresolved attempt before it is sent, with the refusal kept as
  // history: a lost reply leaves the record unknown, and settle then asks the scope and resolves it, with the same envelope and
  // the same key. An accepted record is never sent again, even with resubmit.
  test("a resubmitted refusal whose reply is lost stays unresolved, and settle asks the scope", async () => {
    const { custody } = setup();
    const sent: SignedIntent[] = [];
    await custody.send(identity("r1"), meaningOf("m"), build("r1"), async (e) => { sent.push(e.signed); return refused; }, { notAfter });
    const lost = await custody.send(identity("r1"), meaningOf("m"), build("r1"), async (e) => { sent.push(e.signed); throw new Lost(); }, { notAfter, resubmit: true });
    expect(["lost" in lost, lost.record.phase, lost.record.attempt]).toEqual([true, "unknown", 2]);
    expect((await custody.store.unresolved()).map((u) => u.key)).toEqual(["r1"]);
    let asked = 0;
    const settled = await custody.settle(identity("r1"), async (e) => { asked++; return receiptOf(e.signed, 8); });
    expect([asked, settled!.record.phase, settled!.decided?.answer.answer]).toEqual([1, "accepted", "accepted"]);
    expect(settled!.record.outcomes.map((o) => [Object.keys(o).find((k) => k !== "at" && k !== "attempt"), o.attempt])).toEqual([["answer", 1], ["lost", 2], ["settled", 2]]);
    expect(sent.map((x) => canonicalize(x))).toEqual([canonicalize(sent[0]), canonicalize(sent[0])]);
    // Accepted is terminal: resubmit sends nothing, and the kept acceptance is returned.
    const again = await custody.send(identity("r1"), meaningOf("m"), build("r1"), async () => { throw new Error("must not send"); }, { notAfter, resubmit: true });
    expect("answer" in again && [again.retained, again.answer.answer]).toEqual([true, "accepted"]);
  });

  // Invariant: the outcome given is the newest decisive one: attempts lost, then unavailable, then a settlement that found the
  // receipt, answer accepted on every later send and settle, never the stale unavailable.
  test("lost, then unavailable, then a settlement: accepted, never unavailable", async () => {
    const { custody } = setup();
    await custody.send(identity("r2"), meaningOf("m"), build("r2"), async () => { throw new Lost(); }, { notAfter });
    const unavailable = await custody.send(identity("r2"), meaningOf("m"), build("r2"), async () => ({ answer: "unavailable", reason: "busy" }), { notAfter });
    expect("answer" in unavailable && [unavailable.answer.answer, unavailable.record.phase]).toEqual(["unavailable", "unknown"]);
    const settled = await custody.settle(identity("r2"), async (e) => receiptOf(e.signed, 4));
    expect(settled!.decided?.answer.answer).toBe("accepted");
    const later = await custody.send(identity("r2"), meaningOf("m"), build("r2"), async () => { throw new Error("must not send"); }, { notAfter });
    expect("answer" in later && [later.retained, later.answer.answer]).toEqual([true, "accepted"]);
    expect((await custody.settle(identity("r2"), async () => { throw new Error("must not read"); }))!.decided?.answer.answer).toBe("accepted");
  });

  // Invariant: a mismatch is terminal and is never sent again, even with resubmit.
  test("a mismatch is never resent", async () => {
    const { custody } = setup();
    await custody.send(identity("r3"), meaningOf("m"), build("r3"), async () => ({ answer: "mismatch", reason: "idempotency-mismatch" }), { notAfter });
    const again = await custody.send(identity("r3"), meaningOf("m"), build("r3"), async () => { throw new Error("must not send"); }, { notAfter, resubmit: true });
    expect("answer" in again && [again.retained, again.answer.answer]).toEqual([true, "mismatch"]);
  });

  // Invariant: an envelope that would not fit a record with its outcomes is refused as full, for bytes, before it is signed; a
  // large envelope that fits is kept with its receipt, and outcomes that would push the record past 2 MiB move to the segment.
  test("byte budget: refused before signing; a large allowed envelope with its receipt; outcomes spilled, none lost", async () => {
    const { custody } = setup();
    let built = 0;
    const counting = (key: string, body: string) => { const b = build(key, body); return async () => { built++; return b(); }; };
    const huge = await custody.keep(identity("big"), meaningOf("big"), counting("big", "x"), notAfter, RECORD_BYTES).catch((e: unknown) => e);
    expect([(huge as CustodyError).why.held, (huge as { why: { reason: string } }).why.reason, built]).toEqual(["full", "bytes", 0]);
    const body = "y".repeat(1_900_000);
    const large = await custody.send(identity("large"), meaningOf("large"), counting("large", body), async (e) => accepted(e.signed, 5), { notAfter, bytes: body.length });
    expect("answer" in large && large.answer.answer).toBe("accepted");
    const record = (await custody.find(identity("large")))!;
    expect(canonicalize(record).length).toBeLessThanOrEqual(RECORD_BYTES);
    // Refusals with a long name each, resubmitted until they no longer fit inline: every one stays readable.
    const long: Answer = { answer: "refused", reason: "guard-failed", name: "n".repeat(60_000), judgedAt: { seq: 2, hash: `sha256:${"b".repeat(64)}` } };
    for (let i = 0; i < 12; i++) await custody.send(identity("spill"), meaningOf("s"), build("spill", "z".repeat(1_500_000)), async () => long, { notAfter, resubmit: i > 0, bytes: 1_500_000 });
    const spilled = (await custody.find(identity("spill")))!;
    expect(canonicalize(spilled).length).toBeLessThanOrEqual(RECORD_BYTES);
    expect(spilled.outcomes.length).toBeLessThan(12);
    expect((await custody.outcomes(identityId(identity("spill")), spilled)).length).toBe(12);
  });

  // Invariant: two processes archiving distinct identities at once leave every record findable, with one consistent index.
  test("two processes archive distinct identities concurrently", async () => {
    const { dir, make } = setup();
    const keys = (p: string) => Array.from({ length: 12 }, (_, i) => `${p}-${i}`);
    const [a, b] = [child({ op: "archive", dir, keys: keys("a") }), child({ op: "archive", dir, keys: keys("b") })];
    const done = await Promise.all([a.done, b.done]);
    expect(done.map((d) => d.code), done.map((d) => d.out).join("\n")).toEqual([0, 0]);
    const custody = make();
    for (const key of [...keys("a"), ...keys("b")]) expect((await custody.find(identity(key)))?.phase, key).toBe("accepted");
    expect(() => JSON.parse(readFileSync(join(dir, "archive", "index.json"), "utf8"))).not.toThrow();
  }, 60_000);

  // Invariant: a crash between the archive file and the index, or between the index and the removal of the live records, loses
  // nothing: every record is findable afterwards, and the next archival completes and clears what the crash left.
  test("a crash inside an archival loses no record", async () => {
    for (const point of ["archive-written", "index-published"] as const) {
      const { dir, make } = setup();
      const keys = Array.from({ length: 3 }, (_, i) => `${point}-${i}`);
      const crashed = await child({ op: "crash", dir, keys, point }).done;
      expect(crashed.code, crashed.out).toBe(70);
      const custody = make();
      expect((await custody.find(identity(keys[0]!)))?.phase, point).toBe("accepted");
      const after = await child({ op: "archive", dir, keys }).done;
      expect(after.code, after.out).toBe(0);
      for (const key of keys) expect((await custody.find(identity(key)))?.phase, `${point} ${key}`).toBe("accepted");
      expect(readdirSync(join(dir, "archive")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
      expect(existsSync(join(dir, "archive", "archive.lease"))).toBe(false);
    }
  }, 60_000);

  // Invariant: two processes admitting distinct keys at 255 unresolved records cannot both be admitted.
  test("capacity: two processes at the bound admit one key", async () => {
    const { dir, custody, clock } = setup();
    const first = await custody.keep(identity("seed"), meaningOf("seed"), build("seed"), notAfter);
    for (let i = 1; i < UNRESOLVED_MOST - 1; i++) {
      clock.advance(1);
      const record: CustodyRecord = { ...first, identity: identity(`seed-${i}`), created: timeOf(clock.at()) };
      writeFileSync(join(dir, "records", `${identityId(record.identity)}.json`), canonicalize(record));
    }
    expect((await custody.store.unresolved()).length).toBe(UNRESOLVED_MOST - 1);
    const results = await Promise.all([child({ op: "admit", dir, key: "left" }).done, child({ op: "admit", dir, key: "right" }).done]);
    expect(results.map((r) => r.out.trim()).sort(), results.map((r) => r.out).join("\n")).toEqual(["admitted", "full"]);
    expect((await custody.store.unresolved()).length).toBe(UNRESOLVED_MOST);
  }, 60_000);

  // Invariant: a process that dies holding an identity's lock during a settlement after the intent's notAfter leaves a lock that
  // is broken once its process is gone; the next settlement reaches the scope. Expiry is never an outcome.
  test("a lock left by a dead process after notAfter is recovered", async () => {
    const { dir, make, clock } = setup();
    await make().send(identity("dies"), meaningOf("m"), build("dies"), async () => { throw new Lost(); }, { notAfter });
    const later = T0 + 60 * 60_000;
    clock.advance(later - T0);
    const hanging = child({ op: "settle-hang", dir, key: "dies", now: later });
    await hanging.line("reading");
    expect(readdirSync(join(dir, "locks"))).toHaveLength(1);
    hanging.kill();
    await hanging.done;
    const settled = await make().settle(identity("dies"), async (e) => receiptOf(e.signed, 6));
    expect([settled!.record.phase, settled!.decided?.answer.answer]).toEqual(["accepted", "accepted"]);
  }, 60_000);

  // Invariant: a resubmitted refusal is admitted against the capacity like a new record: two processes resubmitting distinct
  // refusals at 255 unresolved admit one; the other is held back as full, and its refusal stays as it was.
  test("capacity: two processes resubmitting refusals at the bound admit one", async () => {
    const { dir, custody, clock } = setup();
    for (const key of ["left", "right"]) await custody.send(identity(key), meaningOf(key), build(key), async () => refused, { notAfter });
    const first = await custody.keep(identity("seed"), meaningOf("seed"), build("seed"), notAfter);
    for (let i = 1; i < UNRESOLVED_MOST - 1; i++) {
      clock.advance(1);
      const record: CustodyRecord = { ...first, identity: identity(`seed-${i}`), created: timeOf(clock.at()) };
      writeFileSync(join(dir, "records", `${identityId(record.identity)}.json`), canonicalize(record));
    }
    expect((await custody.store.unresolved()).length).toBe(UNRESOLVED_MOST - 1);
    const results = await Promise.all([child({ op: "resubmit", dir, key: "left" }).done, child({ op: "resubmit", dir, key: "right" }).done]);
    expect(results.map((r) => r.out.trim()).sort(), results.map((r) => r.out).join("\n")).toEqual(["admitted", "full"]);
    expect((await custody.store.unresolved()).length).toBe(UNRESOLVED_MOST);
    const held = (await Promise.all(["left", "right"].map((k) => custody.find(identity(k))))).find((r) => r!.phase === "refused")!;
    expect([held.attempt, held.outcomes.map((o) => "answer" in o && o.answer.answer)]).toEqual([1, ["refused"]]);
  }, 60_000);

  // Invariant: when every outcome moved to the segment to keep a record within 2 MiB, the decisive outcome is still found: a
  // later send returns it with no delivery and no new signature, and settle reads it.
  test("an accepted outcome found in the segment when none is inline", async () => {
    const { custody } = setup();
    const body = "y".repeat(2_000_000);
    let delivered = 0;
    const big = (signed: SignedIntent): Answer => ({ answer: "accepted", receipt: { ...receiptOf(signed, 9), effects: Array.from({ length: 400 }, (_, i) => ({ effect: "value", item: i, slot: "s", value: "v".repeat(400) })) as never } });
    const first = await custody.send(identity("spilled"), meaningOf("s"), build("spilled", body), async (e) => { delivered++; return big(e.signed); }, { notAfter, bytes: body.length });
    expect("answer" in first && first.answer.answer).toBe("accepted");
    const record = (await custody.find(identity("spilled")))!;
    expect([record.outcomes.length, record.count, record.phase]).toEqual([0, 1, "accepted"]);
    const again = await custody.send(identity("spilled"), meaningOf("s"), async () => { throw new Error("must not sign"); }, async () => { throw new Error("must not send"); }, { notAfter, resubmit: true });
    expect("answer" in again && [again.retained, again.answer.answer, again.answer.answer === "accepted" && again.answer.receipt.fact.seq]).toEqual([true, "accepted", 9]);
    expect((await custody.settle(identity("spilled"), async () => { throw new Error("must not read"); }))!.decided?.answer.answer).toBe("accepted");
    expect(delivered).toBe(1);
  });

  // Invariant: the search for a record's decisive outcome holds one slice of its segment at a time, at most 64 outcomes, newest
  // first, and stops at the older attempt's boundary; the whole history stays in the segment.
  test("the decisive outcome is searched slice by slice, newest first, within the attempt", async () => {
    const store = memoryStore();
    const reads: { from: number; limit: number }[] = [];
    const segmented = store.segmented;
    store.segmented = async (id, from, limit) => { reads.push({ from, limit }); return segmented(id, from, limit); };
    const custody = new Custody(store, () => timeOf(T0));
    // 300 lost replies in one attempt: unresolved, so the search reads back to the start and finds nothing decisive.
    for (let i = 0; i < 300; i++) await custody.send(identity("long"), meaningOf("l"), build("long"), async () => { throw new Lost(); }, { notAfter });
    const long = (await custody.find(identity("long")))!;
    reads.length = 0;
    expect(await custody.decided(identityId(identity("long")), long)).toBeNull();
    expect([Math.max(...reads.map((r) => r.limit)), reads.map((r) => r.from)]).toEqual([64, [172, 108, 44, 0]]);
    expect((await custody.outcomes(identityId(identity("long")), long)).length).toBe(300);
    // A refusal, then a resubmission whose replies are lost 100 times: the search stops at the refusal's attempt.
    await custody.send(identity("again"), meaningOf("a"), build("again"), async () => refused, { notAfter });
    for (let i = 0; i < 100; i++) await custody.send(identity("again"), meaningOf("a"), build("again"), async () => { throw new Lost(); }, { notAfter, resubmit: i === 0 });
    const again = (await custody.find(identity("again")))!;
    reads.length = 0;
    expect([await custody.decided(identityId(identity("again")), again), again.attempt]).toEqual([null, 2]);
    expect(reads.every((r) => r.limit <= 64)).toBe(true);
    // Every outcome spilled to keep the record within 2 MiB, the accepted one at the segment's end: one slice is read.
    const body = "y".repeat(2_000_000);
    const big = (signed: SignedIntent): Answer => ({ answer: "accepted", receipt: { ...receiptOf(signed, 12), effects: Array.from({ length: 400 }, (_, i) => ({ effect: "value", item: i, slot: "s", value: "v".repeat(400) })) as never } });
    await custody.send(identity("found"), meaningOf("f"), build("found", body), async (e) => big(e.signed), { notAfter, bytes: body.length });
    const matched = (await custody.find(identity("found")))!;
    reads.length = 0;
    expect([matched.outcomes.length, (await custody.decided(identityId(identity("found")), matched))?.answer.answer]).toEqual([0, "accepted"]);
    expect(reads).toEqual([{ from: 0, limit: 1 }]);
  });

  // Invariant: a dead owner's lock is reclaimed one process at a time: of several trying at once, at least one enters, no two
  // are ever inside together, and the rest are refused; a release removes only the releaser's own holding, never a newer owner's.
  test("lock reclamation: simultaneous reclaimers, one enters; release is the owner's", async () => {
    const { dir } = setup();
    const dead = spawn(process.execPath, ["-e", ""]);
    const pid = await new Promise<number>((resolve) => dead.on("exit", () => resolve(dead.pid!)));
    const path = join(dir, "contended.lease");
    writeFileSync(path, JSON.stringify({ pid, token: "dead-owner" }));
    const results = await Promise.all(Array.from({ length: 4 }, () => child({ op: "lease", dir, path }).done));
    const seen = holdings(results);
    expect([seen.inside.length >= 1, overlapping(seen.inside), seen.refused + seen.inside.length], results.map((r) => r.out).join("\n")).toEqual([true, 0, 4]);
    const mine = takeLock(path, {})!;
    expect(mine).not.toBeNull();
    releaseLock({ path, token: "someone-else" });
    expect(existsSync(path), "another holding's release leaves this lock").toBe(true);
    releaseLock(mine);
    expect(existsSync(path)).toBe(false);
  }, 60_000);

  // Invariant: a reclaimer that died inside the reclaim section leaves recovery blocked, never raced: no process enters the lock,
  // the refusal names the reclaim file, and once an operator removes it exactly one of several processes enters.
  test("a reclaimer that died inside the reclaim section blocks recovery until an operator clears it", async () => {
    const { dir, custody } = setup();
    const deadPid = async () => { const p = spawn(process.execPath, ["-e", ""]); return new Promise<number>((resolve) => p.on("exit", () => resolve(p.pid!))); };
    const path = join(dir, "contended.lease");
    writeFileSync(path, JSON.stringify({ pid: await deadPid(), token: "dead-owner" }));
    writeFileSync(`${path}.reclaim`, JSON.stringify({ pid: await deadPid(), token: "dead-reclaimer" }));
    const blocked = await Promise.all(Array.from({ length: 4 }, () => child({ op: "lease", dir, path }).done));
    expect(blocked.map((r) => r.out.trim()), blocked.map((r) => r.out).join("\n")).toEqual(["refused", "refused", "refused", "refused"]);
    expect([takeLock(path, {}), blockedBy(path)]).toEqual([null, `${path}.reclaim`]);
    // The same through custody: an identity whose lock is blocked so is refused as locked, naming the reclaim file.
    mkdirSync(join(dir, "locks"), { recursive: true });
    const lock = join(dir, "locks", `${identityId(identity("blocked"))}.lock`);
    writeFileSync(lock, JSON.stringify({ pid: await deadPid(), token: "dead-owner" }));
    writeFileSync(`${lock}.reclaim`, JSON.stringify({ pid: await deadPid(), token: "dead-reclaimer" }));
    const refusal = await custody.keep(identity("blocked"), meaningOf("b"), build("blocked"), notAfter).catch((e: unknown) => e);
    expect((refusal as CustodyError).why).toEqual({ held: "locked", stale: `locks/${identityId(identity("blocked"))}.lock.reclaim` });
    // An operator removes the dead reclaimer's file: recovery goes on, one process at a time.
    unlinkSync(`${path}.reclaim`);
    const cleared = await Promise.all(Array.from({ length: 4 }, () => child({ op: "lease", dir, path }).done));
    const seen = holdings(cleared);
    expect([seen.inside.length >= 1, overlapping(seen.inside), seen.refused + seen.inside.length], cleared.map((r) => r.out).join("\n")).toEqual([true, 0, 4]);
  }, 60_000);

  // Invariant: archival re-reads each candidate under its lock: a refusal resubmitted between selection and lock is unresolved,
  // stays live and counted, and is not archived.
  test("archival skips a candidate resubmitted after it was selected", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-custody-"));
    let interleave: (() => void) | null = null;
    const store = fileStore(dir, { terminalMost: 0, ageDays: 30, archiveBytes: 4096, fault: (point) => { if (point === "candidates-selected" && interleave) { const run = interleave; interleave = null; run(); } } }, () => T0);
    const custody = new Custody(store, () => timeOf(T0));
    await custody.keep(identity("refused-one"), meaningOf("r"), build("refused-one"), notAfter);
    const id = identityId(identity("refused-one"));
    const path = join(dir, "records", `${id}.json`);
    // The record is refused; as archival selects it, another process resubmits it: its file now says sent.
    const record = JSON.parse(readFileSync(path, "utf8")) as CustodyRecord;
    interleave = () => writeFileSync(path, canonicalize({ ...record, phase: "sent", attempt: 2 }));
    await store.write(id, { ...record, phase: "refused", count: 1, outcomes: [{ at: timeOf(T0), answer: refused, attempt: 1 }] });
    expect(existsSync(path)).toBe(true);
    expect((await store.read(id))!.phase).toBe("sent");
    expect((await store.unresolved()).map((u) => u.key)).toEqual(["refused-one"]);
    expect(store.archived()).toBe(0);
  });

  // Invariant: a standalone capability step (a step with no act) has its own lifecycle: a decisive answer makes it terminal and
  // replayable with nothing sent, and its record settled, never accepted; a lost answer keeps it unresolved and counted, and a
  // retry, also after a restart between sending and the answer, sends the exact signed step again.
  describe("standalone steps", () => {
    const standalone = (key: string) => async () => ({
      binding: { definition: "hold@1", kind: "hold@1:instance", declaration: null, pinned: "platform:inbox@1" as const },
      envelope: { signed: await signedIntent(signer, { to: lane, kind: "hold@1:instance", on: null, fields: { hold: 3, instance: key }, expected: {} }, { idempotencyKey: key, now: T0 }), beside: {} },
    });
    const keepStep = (custody: Custody, key: string) => custody.keep(identity(key), meaningOf({ standalone: key }), standalone(key), notAfter, 0, { standalone: true });

    test("a decisive step is terminal, replayed with nothing sent, and its record settled", async () => {
      const { custody } = setup();
      await keepStep(custody, "s1");
      const first = await custody.step(identity("s1"), lane, "hold@1", "instance", async (signed) => accepted(signed, 4));
      expect([first.step.phase, first.record.phase, first.retained]).toEqual(["answered", "settled", false]);
      expect((await custody.store.unresolved()).length).toBe(0);
      const again = await custody.step(identity("s1"), lane, "hold@1", "instance", async () => { throw new Error("must not send"); });
      expect([again.retained, again.answer?.answer, again.answer?.answer === "accepted" && again.answer.receipt.fact.seq]).toEqual([true, "accepted", 4]);
      expect(again.record.phase).not.toBe("accepted");
      expect(again.record.outcomes).toEqual([]);
    });

    test("a restart between sending a step and its answer resends the exact step", async () => {
      const { make } = setup();
      const kept = await keepStep(make(), "s2");
      await expect(make().step(identity("s2"), lane, "hold@1", "instance", async () => { throw new Error("the process ends here"); })).rejects.toThrow("the process ends here");
      const after = (await make().find(identity("s2")))!;
      expect([Object.values(after.steps)[0]!.phase, after.phase]).toEqual(["sent", "sent"]);
      let resent: SignedIntent | null = null;
      const retried = await make().step(identity("s2"), lane, "hold@1", "instance", async (signed) => { resent = signed; return refused; });
      expect(canonicalize(resent)).toBe(canonicalize(kept.envelope.signed));
      expect([retried.step.phase, retried.record.phase, retried.answer?.answer]).toEqual(["answered", "settled", "refused"]);
    });

    test("a lost step stays unresolved and counted, and its retry sends the same signed step", async () => {
      const { custody } = setup();
      const kept = await keepStep(custody, "s3");
      const lost = await custody.step(identity("s3"), lane, "hold@1", "instance", async () => { throw new Lost(); });
      expect([lost.step.phase, lost.record.phase, lost.answer]).toEqual(["unknown", "unknown", null]);
      expect((await custody.store.unresolved()).map((u) => u.key)).toEqual(["s3"]);
      const unavailable = await custody.step(identity("s3"), lane, "hold@1", "instance", async () => ({ answer: "unavailable", reason: "busy" }));
      expect([unavailable.step.phase, unavailable.record.phase]).toEqual(["unknown", "unknown"]);
      const sent: SignedIntent[] = [];
      const done = await custody.step(identity("s3"), lane, "hold@1", "instance", async (signed) => { sent.push(signed); return accepted(signed, 5); });
      expect(canonicalize(sent[0])).toBe(canonicalize(kept.envelope.signed));
      expect([done.record.phase, (await custody.store.unresolved()).length]).toEqual(["settled", 0]);
    });

    test("new work is admitted after more than 256 completed standalone steps", async () => {
      const { custody } = setup();
      for (let i = 0; i < UNRESOLVED_MOST + 4; i++) {
        await keepStep(custody, `done-${i}`);
        await custody.step(identity(`done-${i}`), lane, "hold@1", "instance", async (signed) => accepted(signed, i));
      }
      expect((await custody.store.unresolved()).length).toBe(0);
      const admitted = await custody.keep(identity("after"), meaningOf("after"), build("after"), notAfter);
      expect(admitted.phase).toBe("prepared");
    }, 120_000);
  });
});
