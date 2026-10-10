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
  const both: Item = { ...item(8, "reservation-token-unknown"), values: { ...item(8, "reservation-token-unknown").values, cleanupReason: { refReason: "reservation-stage-unknown", tokenReason: "reservation-token-unknown", tokenAttempts: 1, refRemoved: false }, cleanupAttempts: 1 } };
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
  const tokenOnly: Item = { ...both, values: { ...both.values, cleanupReason: { tokenReason: "reservation-token-unknown", refRemoved: true, tokenAttempts: 2 } } };
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

test("a write-free expiry projection reports pending cleanup before the next turn and never invents expiry without its clock", async () => {
  const reservation: Item = { ...item(5, "reservation-ref"), state: "reserved", values: { checkDeadline: "2099-01-01T00:00:10Z" } };
  const read = (expiry: Summary["reservationExpiry"]): Read<Summary> => { const got = summary(); return got.ok ? { ...got, value: { ...got.value, items: [reservation], ...(expiry ? { reservationExpiry: expiry } : {}) } } : got; };
  for (const expiry of [{ clock: "available" as const, time: "2099-01-01T00:00:11Z" as const, expired: [5] }, { clock: "unavailable" as const }, undefined]) {
    const result = await observeCleanup({ summary: async () => read(expiry), items: async () => ({ ok: true, complete: true, at: head, value: [] }) }, target);
    if (expiry?.clock === "available") {
      expect(result.lines[0]).toContain("Cleanup pending:"); expect(result.lines[0]).toContain("waits for the next act or alarm");
      expect(result.finding).toContain("Cleanup pending");
    } else {
      expect(result.lines[0]).toContain("Cleanup clock unavailable:"); expect(result.lines[0]).toContain("recorded state reserved; no expiry claim");
      expect(result.lines.join("\n")).not.toContain("expired by deadline");
    }
    expect(result.lines.join("\n")).not.toContain("Owed cleanup:");
  }
  const beforeDeadline = await observeCleanup({ summary: async () => read({ clock: "available", time: "2099-01-01T00:00:09Z", expired: [] }), items: async () => ({ ok: true, complete: true, at: head, value: [] }) }, target);
  expect(beforeDeadline.finding).toBeNull();
  expect(beforeDeadline.lines.join("\n")).not.toContain("Cleanup pending:");
});
