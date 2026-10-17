import { expect, test } from "vitest";
import type { OutboxItem, Read, Summary } from "@generalbusiness/dap-contract";
import type { OperationalApi, Transport } from "@generalbusiness/artroom-client";
import { newIncarnation, textDigest } from "@generalbusiness/artroom-bytes";
import { statusReport, STATUS_PAGES } from "../src/status-report.ts";
const at = { scope: `sc_${"a".repeat(52)}` as const, kind: "membership" as const, inc: newIncarnation(new Uint8Array(16).fill(1)) };
const head = { seq: 9, hash: textDigest("head") }, time = "2099-01-01T00:00:00Z";
const summary: Read<Summary> = { ok: true, at: head, complete: true, value: { scope: at, definition: "platform:membership@2", status: "active", time, items: [], counts: [["member", "active", 2]] } };
const outboxId: OutboxItem = { outboxId: "7.0", to: at, class: "request", held: false, attempts: [], acknowledged: null, result: null, diagnosis: null };
const page = <T>(value: readonly T[]): Read<readonly T[]> => ({ ok: true, at: head, complete: true, value });
function fixture() {
  let requests = 0;
  const http = { summary: async () => summary, outbox: async () => page([outboxId]), waiting: async () => page([]), incidents: async () => page([{ n: 1, time, scope: at, kind: "bad-input" as const, refs: [] }]), requests: async () => { requests++; return { ok: true as const, at: head, complete: true, value: { rows: [], window: null } }; }, history: async () => page([]) } as unknown as Transport & OperationalApi;
  return { http, requests: () => requests };
}
// These are scripted read-port witnesses, not native creation/authority proof.
// Invariant: each column preserves its own head and distinguishes denial,
// unknown data and bounded partial counts from a genuine zero.
test("status states column heads, admin/member permissions and an explicit request selector without leaking failures", async () => {
  const f = fixture();
  const lines = await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], true, undefined, false);
  expect(lines.join("\n")).toContain("outbox: 1 requests without a result, 0 diagnosed sends; at entry 9");
  expect(lines.join("\n")).toContain("incidents: 1; at entry 9"); expect(f.requests()).toBe(0);
  const member = await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], false, "abcdef0123456789", false);
  expect(member).toContain("  incidents: denied."); expect(member).toContain("  request abcdef0123456789: denied."); expect(f.requests()).toBe(0);
  await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], true, "abcdef0123456789", false);
  expect(f.requests()).toBe(1);
  f.http.summary = async () => ({ ...summary, complete: false });
  expect((await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], true, undefined, false)).join("\n")).toContain('counts [["member","active",2]] (more; partial)');
  f.http.outbox = async () => ({ ok: false, reason: "forbidden" });
  f.http.incidents = async () => { throw Error("private provider text"); };
  const bad = await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], true, undefined, false);
  expect(bad.join("\n")).toContain("outbox: denied; head unknown"); expect(bad.join("\n")).toContain("incidents: unknown; head unknown"); expect(bad.join("\n")).not.toContain("private provider text");
});

test("status stops at the page bound, rejects nonprogress and head drift and never labels those counts total", async () => {
  const f = fixture(); let calls = 0;
  f.http.outbox = async () => ({ ...page([outboxId]), complete: false, next: `page-${calls++}` });
  const bounded = await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], false, undefined, false);
  expect(calls).toBe(STATUS_PAGES);
  expect(bounded.join("\n")).toContain(`${STATUS_PAGES} requests without a result, 0 diagnosed sends (more; partial)`);
  calls = 0; f.http.outbox = async () => { calls++; return { ...page([outboxId]), complete: false, next: "same" }; };
  const repeat = await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], false, undefined, false);
  expect(calls).toBe(2); expect(repeat.join("\n")).toContain("outbox: unknown;");
  calls = 0; f.http.outbox = async () => ++calls === 1 ? { ...page([outboxId]), complete: false, next: "next" } : { ...page([outboxId]), at: { ...head, seq: head.seq + 1 } };
  const moved = await statusReport(f.http, "Session fixture", [{ kind: "membership", scope: at.scope }], false, undefined, false);
  expect(moved.join("\n")).toContain("outbox: unknown;");
});
