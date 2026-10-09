import { expect, test } from "vitest";
import type { FactRef, Item, Read, Summary } from "@generalbusiness/artroom-contract";
import { newIncarnation, textDigest } from "@generalbusiness/artroom-bytes";
import { observeCleanup } from "../src/verify-cleanup.ts";

const at: FactRef["at"] = { scope: `sc_${"a".repeat(52)}`, kind: "destination", inc: newIncarnation(new Uint8Array(16).fill(1)) };
const target: FactRef = { at, seq: 9, hash: textDigest("head") };
const head = { seq: target.seq, hash: target.hash };
const summary = (definition: Summary["definition"] = "platform:destination@3"): Read<Summary> => ({ ok: true, complete: true, at: head, value: { scope: at, definition, status: "active", time: "2099-01-01T00:00:00Z", items: [], counts: [] } });
const item = (id: number, reason: string): Item => ({ id, type: "publication", state: "cleanup-owed", revision: 3, opened: textDigest("opened"), parties: {}, refs: {}, values: { cleanupReason: reason, cleanupAttempts: 3, integration: `git:sha1:${"a".repeat(40)}`, token: "private-token-must-not-print" }, attributed: [] });

// Scripted read-port boundary: no native destination or external cleanup runs.
test("complete same-head cleanup observations name every owed reservation and retain unknown custody without exposing token values", async () => {
  const cursors: (string | undefined)[] = [];
  const both: Item = { ...item(8, "reservation-token-unknown"), values: { ...item(8, "reservation-token-unknown").values, cleanupRefReason: "reservation-stage-unknown", cleanupAttempts: 1, cleanupTokenReason: "reservation-token-unknown", cleanupTokenAttempts: 1 } };
  const liveSummary = (): Read<Summary> => { const read = summary(); return read.ok ? { ...read, value: { ...read.value, items: [item(4, "reservation-ref"), both] } } : read; };
  const final = { ...item(12, "reservation-ref"), state: "cleaned" };
  const result = await observeCleanup({ summary: async () => liveSummary(), items: async (_type, cursor) => {
    cursors.push(cursor);
    return cursor === undefined ? { ok: true, complete: false, at: head, value: [final], next: "second" } : { ok: true, complete: true, at: head, value: [] };
  } }, target);
  expect(cursors).toEqual([undefined, "second"]);
  expect(result.finding).toEqual(expect.stringContaining("2 reservation(s)"));
  expect(result.lines[0]).toContain("reservation 4");
  expect(result.lines.filter((line) => line.includes("reservation 8"))).toHaveLength(2);
  expect(result.lines[1]).toContain("reservation-stage-unknown; attempts 1");
  expect(result.lines[2]).toContain("reservation-token-unknown; attempts 1");
  expect(result.lines[1]).toContain("custody remains unknown");
  expect(result.lines.join("\n")).not.toContain("private-token");
  expect(result.lines.join("\n")).not.toContain("cleaned");
  expect(result.lines.join("\n")).not.toContain("reservation 12");
  const tokenOnly: Item = { ...both, values: { ...both.values, cleanupReason: "reservation-ref-unknown", cleanupRefReason: null, cleanupRefRemoved: true, cleanupTokenAttempts: 2 } };
  const tokenSummary = (): Read<Summary> => { const read = summary(); return read.ok ? { ...read, value: { ...read.value, items: [tokenOnly] } } : read; };
  const remaining = await observeCleanup({ summary: async () => tokenSummary(), items: async () => ({ ok: true, complete: true, at: head, value: [] }) }, target);
  expect(remaining.lines).toHaveLength(1);
  expect(remaining.lines[0]).toContain("reservation-token-unknown; attempts 2");
  expect(remaining.lines[0]).not.toContain("reservation-ref-unknown");
});

test("head movement or incomplete pagination yields no cleanup absence claim, while old pins make no cleanup claim", async () => {
  const moved = { ...head, seq: head.seq + 1 };
  for (const read of [
    { ok: true as const, complete: true, at: moved, value: [] },
    { ok: true as const, complete: false, at: head, value: [] },
    { ok: true as const, complete: false, at: head, value: [], next: "more" },
  ]) {
    const result = await observeCleanup({ summary: async () => summary(), items: async () => read }, target, 1);
    expect(result.finding).toEqual(expect.stringContaining("Cleanup status not read"));
    expect(result.lines.join("\n")).not.toContain("no reservation");
  }
  let summaries = 0;
  const movedAfterPage = await observeCleanup({ summary: async () => { const read = summary(); return ++summaries === 1 ? read : { ...read, at: moved }; }, items: async () => ({ ok: true, complete: true, at: head, value: [] }) }, target);
  expect(movedAfterPage.finding).toContain("changed before cleanup enumeration completed");
  expect(movedAfterPage.lines.join("\n")).not.toContain("no reservation");
  const old = await observeCleanup({ summary: async () => summary("platform:destination@2"), items: async () => { throw new Error("No @3 scan under old pin"); } }, target);
  expect(old.finding).toBeNull();
  expect(old.lines).toEqual([]);
});
