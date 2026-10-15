import { expect, test } from "vitest";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { ARCHIVE_OBJECT_BYTES as B, archiveSegments, archiveShards } from "../src/journal-segments.ts";

// Synthetic canonical objects test grouping, not native entries or archive authority.
test("archive segments close at1000 lines and preserve canonical bytes and contiguous sequence", () => {
  const lines = Array.from({ length: 1001 }, (_, seq) => ({ seq, bytes: canonicalize({ seq }) }));
  const segments = archiveSegments(lines, 100_000);
  expect(segments.map(({ first, last, path }) => ({ first, last, path }))).toEqual([
    { first: 0, last: 999, path: "journal/v1/segments/000000000000.jsonl" },
    { first: 1000, last: 1000, path: "journal/v1/segments/000000001000.jsonl" },
  ]);
  const decoded = segments.flatMap(s => new TextDecoder().decode(s.bytes).split("\n"));
  expect(decoded).toEqual(lines.map(line => line.bytes));
  expect(segments.every(s => s.bytes.at(-1) === 125)).toBe(true); // final }, no trailing LF
  expect(archiveSegments(lines.slice(0, 1000), 100_000)).toHaveLength(1);
  expect(archiveSegments([], 0)).toEqual([]);
  for (const seq of [-1, 0.5, 1_000_000_000_000]) expect(() => archiveSegments([{ seq, bytes: "{}" }], 10)).toThrow("bad-path");
  for (const seq of [0, 2]) expect(() => archiveSegments([{ seq: 0, bytes: "{}" }, { seq, bytes: "{}" }], 10)).toThrow("journal entry sequence");
  expect(archiveSegments([{ seq: 999_999_999_999, bytes: "{}" }], 2)[0]?.last).toBe(999_999_999_999);
});

test("archive byte boundaries include only separating LF, stop oversized lines and enforce the caller total", () => {
  const exact = canonicalize({ x: "x".repeat(B - 8) });
  expect(utf8(exact)).toHaveLength(B);
  const segments = archiveSegments([{ seq: 0, bytes: exact }, { seq: 1, bytes: "{}" }], B + 2);
  expect(segments.map(s => s.bytes.length)).toEqual([B, 2]);
  expect(segments[0]?.bytes.at(-1)).toBe(125);
  const almost = canonicalize({ x: "x".repeat(B - 11) });
  const joined = archiveSegments([{ seq: 0, bytes: almost }, { seq: 1, bytes: "{}" }, { seq: 2, bytes: "{}" }], B + 2);
  expect(joined.map(s => s.bytes.length)).toEqual([B, 2]);
  expect(new TextDecoder().decode(joined[0]?.bytes)).toBe(almost + "\n{}");
  expect(() => archiveSegments([{ seq: 0, bytes: exact + " " }], B + 1)).toThrow("journal entry line");
  expect(() => archiveSegments([{ seq: 0, bytes: canonicalize({ x: "é".repeat(B / 2) }) }], 2 * B)).toThrow("journal entry line");
  expect(() => archiveSegments([{ seq: 0, bytes: exact }, { seq: 1, bytes: "{}" }], B + 1)).toThrow("journal segment allowance");
  expect(archiveSegments([{ seq: 0, bytes: canonicalize({ x: "雪🙂" }) }], 15)[0]?.bytes).toEqual(utf8('{"x":"雪🙂"}'));
  for (const bytes of ['{ "x":1}', '{"x":1,"x":1}', '{}\n{}', '"text"', '[]']) expect(() => archiveSegments([{ seq: 0, bytes }], 100)).toThrow("journal entry bytes");
});

test("archive sharding splits only above4096 and bounds every directory for clustered decimal and hex keys", () => {
  for (const kind of ["segment", "retained"] as const) {
    const name = (i: number) => kind === "segment" ? i.toString().padStart(12, "0") + ".jsonl" : i.toString(16).padStart(64, "0");
    const names = Array.from({ length: 4097 }, (_, i) => name(i));
    expect(archiveShards(names.slice(0, 4096), kind).every(row => row.path === row.name)).toBe(true);
    const rows = archiveShards(names, kind);
    expect(rows).toEqual(archiveShards([...names].reverse(), kind));
    expect(rows.map(row => row.name)).toEqual(names);
    expect(rows.every(row => row.path.includes("/") && row.path.endsWith("/" + row.name))).toBe(true);
    if (kind === "segment") expect(rows[0]?.path).toBe("000/000/000/000000000000.jsonl");
    const children = new Map<string, Set<string>>();
    for (const row of rows) {
      const parts = row.path.split("/");
      for (let i = 0; i < parts.length; i++) {
        const parent = parts.slice(0, i).join("/");
        if (!children.has(parent)) children.set(parent, new Set());
        children.get(parent)!.add(parts[i]!);
        if (i < parts.length - 1) expect(parts[i]).toMatch(kind === "segment" ? /^\d{3}$/ : /^[0-9a-f]{2}$/);
      }
    }
    expect(Math.max(...[...children.values()].map(set => set.size))).toBeLessThanOrEqual(4096);
  }
});

test("archive shard names cannot inject paths, collide or use alternate key spellings", () => {
  for (const [kind, names] of [
    ["segment", ["000000000000.jsonl", "000000000000.jsonl"]],
    ["segment", ["0000000000000.jsonl"]], ["segment", ["../000000000000.jsonl"]],
    ["retained", ["a".repeat(64), "a".repeat(64)]], ["retained", ["A".repeat(64)]], ["retained", ["a/" + "a".repeat(62)]],
  ] as const) expect(() => archiveShards(names, kind)).toThrow("bad-path");
  expect(archiveShards([], "retained")).toEqual([]);
});
