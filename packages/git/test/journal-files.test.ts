import { expect, test } from "vitest";
import type { Digest } from "@generalbusiness/dap-contract";
import { ArchiveBudget } from "../../scope/src/archive-budget.ts";
import { journalPhysicalFiles } from "../src/journal-files.ts";
import { JournalWork } from "../src/journal-work.ts";

// Mechanical logical-name fixture only. The initial full native selector
// caps retained attempts at 512 and cannot reach this directory threshold.
// These independent file-planning calls do not claim a supported 4097-input
// native archive, a single combined budget or any payload validation.
test("crossing the fan-out threshold relocates physical leaves while preserving every old logical name and exact byte object", () => {
  const data = new Uint8Array([42]), files = Array.from({ length: 4097 }, (_, n) => ({ key: { kind: "rule" as const, digest: `sha256:${n.toString(16).padStart(64, "0")}` as Digest }, data }));
  const metadata = new Uint8Array([123, 125]);
  const before = journalPhysicalFiles([], files.slice(0, 4096), metadata, metadata, new JournalWork(new ArchiveBudget({}, () => 0)));
  const after = journalPhysicalFiles([], files, metadata, metadata, new JournalWork(new ArchiveBudget({}, () => 0)));
  const logical = (path: string) => path.split("/").at(-1)!;
  const next = new Map(after.map(file => [logical(file.path), file]));
  for (const file of before.filter(row => row.path.includes("/retained/"))) {
    const moved = next.get(logical(file.path))!;
    expect(moved.data).toBe(file.data); expect(moved.path.endsWith("/" + logical(file.path))).toBe(true);
    expect(moved.path).not.toBe(file.path);
  }
  expect(after.length).toBe(4099);
  expect(new Set(after.map(file => file.path)).size).toBe(after.length);
});
