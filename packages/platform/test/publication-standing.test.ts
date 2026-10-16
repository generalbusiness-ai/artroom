/** Synthetic native-shaped own records, folded operation metadata and
 * historical observations. This witnesses provenance selection only, not
 * real @5 admission, fresh standing or a provider send. */
import { expect, test } from "vitest";
import type { Entry, FactRef, FieldValue, Input, KeyId } from "@generalbusiness/dap-contract";
import { entryHash, keyIdOfSecret, newIncarnation } from "@generalbusiness/artroom-bytes";
import type { Item, Operation } from "@generalbusiness/dap-derive";
import { d, directory, otherLane, t } from "@generalbusiness/dap-derive/testing";
import { MEMBERSHIP, keyObserved, retained, rita } from "./support-destination.ts";
import { publicationStandingKeys, publicationStandingRecord, type PublicationStandingContext, type PublicationStandingRecord, type StandingCheck } from "../src/publication-standing.ts";

const at = { ...directory, kind: "destination" as const }, from = (seq: number): FactRef => ({ at: otherLane, seq, hash: d("a") });
const owner = "platform:destination@5" as const, item = 2;
const copy = <T>(value: T): T => structuredClone(value);
function fixture(count = 1) {
  const entries = new Map<number, { entry: Entry; hash: ReturnType<typeof entryHash> }>(), operations = new Map<Operation["id"], Operation>(), calls: number[] = [];
  const seal = (seq: number, input: Input, effects: Entry["effects"], uses: Entry["uses"] = []) => {
    const entry: Entry = { v: 1, at, seq, prev: d("0"), time: t(seq), clamped: false, epoch: 0, input, effects, uses, sends: [], prepared: [] };
    entries.set(seq, { entry, hash: entryHash(entry) });
  };
  const accepted = (seq: number, opening: number, kind: string, record: PublicationStandingRecord, keys: readonly KeyId[], result?: FactRef) => {
    const input: Input = { type: "outcome", owner, kind, operation: `${opening}:0`, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: result ? { result } : {} }, observed: keys.map((key, n) => retained(keyObserved(rita, t(seq), { key }), n)) };
    seal(seq, input, [
      { effect: "value", item, slot: "passes", value: copy(record) as unknown as FieldValue },
      ...(kind === "judge" ? [{ effect: "value" as const, item, slot: "reservedAt", value: seq }] : []),
    ], record.base.map(base => ({ fact: base.from, content: base.from.hash })));
    operations.set(input.operation, { id: input.operation, owner, kind, most: 1, for: item, selected: null, attempts: [{ attempt: 1, opened: opening, outcomes: [{ seq, result: "confirmed", evidence: d("b"), selected: null }] }] });
  };
  let record: PublicationStandingRecord = { reservation: 5, base: [{ key: rita.key, from: from(100) }], checks: [] };
  accepted(5, 3, "judge", record, [rita.key]);
  const add = (name: string, n: number, key = keyIdOfSecret(new Uint8Array(32).fill(n + 10))) => {
    const opening = 10 + n * 2, decided = opening + 1, job = from(200 + n), result = from(300 + n);
    seal(opening, { type: "delivery", from: result, n: 0, message: { class: "request", type: "tell", body: { message: "checked", fields: { job, result } } }, decision: "applied" }, [{ effect: "operation", k: 0, owner, kind: "check-judge", attempts: 1, for: item }]);
    const row: StandingCheck = { name, job, passed: true, proof: { key, result, decided } };
    record = { ...record, checks: [...record.checks.filter(check => check.name !== name), row] };
    accepted(decided, opening, "check-judge", record, [key], result);
    return row;
  };
  for (let n = 0; n < count; n++) add(`check-${n}`, n);
  const publication = (): Item => ({ id: item, type: "publication", state: "reserved", revision: 4, opened: d("2"), parties: {}, refs: { lane: otherLane }, values: { reservedAt: 5, passes: copy(record) as unknown as FieldValue, requiredChecks: record.checks.map(check => check.name) }, attributed: [] });
  const context: PublicationStandingContext = { at, membership: MEMBERSHIP, owner, before: 100, own: seq => { calls.push(seq); return entries.get(seq) ?? null; }, operation: id => operations.get(id) ?? null };
  const read = (over: Partial<PublicationStandingContext> = {}, pub = publication()) => publicationStandingKeys({ ...context, ...over }, pub);
  return { entries, operations, calls, add, read, publication, record: () => record };
}

test("a current accepted post-reservation checker is included and a fenced replacement cannot reuse its older key", () => {
  const f = fixture(), old = f.record().checks[0]!;
  expect(f.read()).toEqual({ ok: true, keys: [rita.key, old.proof!.key] });
  const next = f.add("check-0", 1);
  expect(f.read()).toEqual({ ok: true, keys: [rita.key, next.proof!.key] });
  const stale: Item = { ...f.publication(), values: { ...f.publication().values, passes: { ...f.record(), checks: [{ ...next, proof: old.proof }] } as unknown as FieldValue } };
  expect(f.read({}, stale)).toEqual({ ok: false, reason: "unavailable" });
  expect(new Set(f.calls)).toEqual(new Set([5, 10, 11, 12, 13]));
});

test("exactly nine distinct provenance keys are complete; ten refuse rather than truncating, with only bounded own-record lookups", () => {
  const nine = fixture(8), ten = fixture(9);
  const exact = nine.read();
  expect(exact.ok).toBe(true); if (exact.ok) expect(exact.keys).toHaveLength(9);
  expect(ten.read()).toEqual({ ok: false, reason: "limit" });
  expect(nine.calls).toHaveLength(17); expect(ten.calls).toHaveLength(19);
  expect(nine.calls.every(seq => seq === 5 || seq >= 10 && seq <= 25)).toBe(true);
  const maximum = fixture(0), shared = keyIdOfSecret(new Uint8Array(32).fill(99));
  for (let n = 0; n < 32; n++) maximum.add(`check-${n}`, n, shared);
  expect(maximum.read()).toEqual({ ok: true, keys: [rita.key, shared] });
  expect(maximum.calls).toHaveLength(65); // bounded own decisions + openings, not a range
  const over = fixture(0);
  for (let n = 0; n < 33; n++) over.add(`check-${n}`, n, shared);
  expect(over.read()).toEqual({ ok: false, reason: "unavailable" });
  expect(over.calls).toEqual([]);
});

test("wrong frame, holder, attempt, accepted effect and missing or ambiguous metadata are unavailable, never an empty active set", () => {
  const frame = fixture();
  expect(frame.read({ membership: { ...MEMBERSHIP, inc: newIncarnation(new Uint8Array(16).fill(45)) } })).toEqual({ ok: false, reason: "unavailable" });
  const holder = fixture(), op = holder.operations.get("10:0")!;
  holder.operations.set("10:0", { ...op, for: 99 });
  expect(holder.read()).toEqual({ ok: false, reason: "unavailable" });
  const attempt = fixture(), original = attempt.operations.get("10:0")!;
  attempt.operations.set("10:0", { ...original, attempts: [{ ...original.attempts[0]!, attempt: 2 }] });
  expect(attempt.read()).toEqual({ ok: false, reason: "unavailable" });
  const body = fixture(), got = body.entries.get(11)!, changed = { ...got.entry, effects: [] };
  body.entries.set(11, { entry: changed, hash: entryHash(changed) });
  expect(body.read()).toEqual({ ok: false, reason: "unavailable" });
  const missing = fixture(), pub = missing.publication();
  expect(missing.read({}, { ...pub, values: { ...pub.values, passes: null } })).toEqual({ ok: false, reason: "unavailable" });
  const duplicate = { ...missing.record(), checks: [missing.record().checks[0]!, missing.record().checks[0]!] };
  expect(publicationStandingRecord(duplicate)).toBeNull();
});
