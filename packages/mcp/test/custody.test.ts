import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Answer, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, timeOf } from "@generalbusiness/artroom-bytes";
import { Custody, CustodyError, Lost, RECORD_BYTES, identityId, meaningOf, UNRESOLVED_MOST, type CustodyRecord, type Envelope } from "../src/index.ts";
import { fileStore } from "../src/node.ts";
import { T0, accepted, build, identity, notAfter, receiptOf, refused, resource } from "./support/custody.ts";

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
  const process_ = spawn(process.execPath, ["--import", "tsx", new URL("./support/custody-child.ts", import.meta.url).pathname, JSON.stringify(asked)], { cwd: new URL("../../..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] });
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
});
