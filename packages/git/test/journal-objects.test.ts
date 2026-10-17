import { execFileSync } from "node:child_process";
import { afterAll, expect, test } from "vitest";
import { ArchiveBudget, ArchiveStopped } from "../../scope/src/archive-budget.ts";
import { isObjectId } from "../src/names.ts";
import { JournalLayoutRefusal, JournalWork } from "../src/journal-work.ts";
import { JOURNAL_LAST_SECOND, JournalObjectReader, JournalObjects, journalId, type JournalFormat, type JournalObjectSource } from "../src/journal-objects.ts";
import { cleanup, git, scratch } from "./support/repo.ts";

afterAll(cleanup);
const utf8 = new TextEncoder();
const formats: readonly JournalFormat[] = ["sha1", "sha256"];
const env = { PATH: process.env["PATH"] ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
const rawGit = (dir: string, args: string[]): Uint8Array => new Uint8Array(execFileSync("git", ["-C", dir, ...args], { env }));
function repository(format: JournalFormat): string {
  const dir = scratch();
  git(dir, ["init", "-q", "--bare", `--object-format=${format}`]);
  return dir;
}
function localObjects(dir: string): JournalObjectSource {
  return { object: async (id, limit) => {
    const stated = git(dir, ["cat-file", "--batch-check"], id + "\n").split(" ");
    if (stated[1] === "missing") return null;
    const size = Number(stated[2]);
    return { type: stated[1]!, size, data: size > limit ? null : rawGit(dir, ["cat-file", stated[1]!, id]) };
  } };
}
const work = (budget = new ArchiveBudget({}, () => 0)) => new JournalWork(budget);

// These are mechanical Git fixtures, not selected native journal entries,
// admission certificates, exporters or evidence about a provider. The real
// existing native budget class is used through the structural port; its
// type-only Sql import adds no production Git-to-Scope runtime dependency.
test("explicit SHA-1 and SHA-256 archive objects have deterministic Git ordering and bytes, and real local Git reads their exact types, trees and bounded commit timestamps", async () => {
  for (const format of formats) {
    const dir = repository(format), maker = new JournalObjects(format, work());
    const payload = Buffer.from("mechanical fixture, not journal data\n");
    const blob = maker.make("blob", payload);
    payload[0] = 0; // caller ownership cannot rewrite an already made object.
    const sub = maker.tree([{ name: "leaf", mode: "100644", id: blob.id }]);
    const rows = [{ name: "a", mode: "40000", id: sub.id }, { name: "a.b", mode: "100644", id: blob.id }, { name: "a-b", mode: "100644", id: blob.id }] as const;
    const tree = maker.tree(rows);
    expect(maker.tree([...rows].reverse()).id).toBe(tree.id);
    const commits = [0, 2_147_483_648, JOURNAL_LAST_SECOND].map(seconds => maker.commit(tree.id, null, seconds));
    const child = maker.commit(tree.id, commits[0]!.id, 1_700_000_000);
    for (const object of maker.objects()) {
      expect(git(dir, ["hash-object", "-w", "-t", object.type, "--stdin"], object.data)).toBe(object.id);
      expect(rawGit(dir, ["cat-file", object.type, object.id])).toEqual(object.data);
    }
    expect(git(dir, ["ls-tree", tree.id]).split("\n").map(line => line.split("\t")[1])).toEqual(["a-b", "a.b", "a"]);
    for (const commit of [...commits, child]) expect(git(dir, ["fsck", "--strict", "--no-dangling", commit.id])).toBe("");
    const reader = new JournalObjectReader(format, localObjects(dir), work());
    expect(reader.tree(await reader.read(tree.id, "tree"))).toEqual([rows[2], rows[1], rows[0]]);
    expect(reader.commit(await reader.read(child.id, "commit"))).toEqual({ tree: tree.id, parent: commits[0]!.id, seconds: 1_700_000_000 });
    expect(reader.commit(await reader.read(commits[2]!.id, "commit")).seconds).toBe(JOURNAL_LAST_SECOND);
    expect(blob.data[0]).toBe("m".charCodeAt(0));
    expect(blob.id.length).toBe(format === "sha1" ? 40 : 64);
  }
  // The existing provider-side contract remains SHA-1, including refusal
  // of a caller's 64-digit ID without an explicit archive format.
  expect(isObjectId("a".repeat(64))).toBe(false);
  expect(() => journalId("sha1", "a".repeat(64))).toThrow("journal-layout-object-id");
  expect(() => journalId("sha1", "a".repeat(39) + "\n")).toThrow("journal-layout-object-id");
});

test("archive primitives refuse executable, symlink and gitlink modes, duplicate names, noncanonical tree order and unrepresentable commit times", () => {
  const maker = new JournalObjects("sha1", work()), blob = maker.make("blob", utf8.encode("fixture"));
  for (const mode of ["100755", "120000", "160000"]) expect(() => maker.tree([{ name: "a", id: blob.id, mode } as never])).toThrow("journal-layout-tree");
  expect(() => maker.tree([{ name: "a", id: blob.id, mode: "100644" }, { name: "a", id: blob.id, mode: "40000" }])).toThrow("journal-layout-tree");
  for (const name of [".", "..", "a/b", "a\u0000b", "a\n", "x".repeat(256)]) expect(() => maker.tree([{ name, id: blob.id, mode: "100644" }])).toThrow("journal-layout-tree");
  const valid = maker.tree([{ name: "a", id: blob.id, mode: "100644" }]);
  const reader = new JournalObjectReader("sha1", { object: async () => null }, work());
  for (const mode of ["100755", "120000", "160000"]) {
    const changed = valid.data.slice(); changed.set(utf8.encode(mode));
    expect(() => reader.tree(changed)).toThrow("journal-layout-tree");
  }
  const reversed = new Uint8Array(valid.data.length * 2);
  reversed.set(valid.data); reversed[7] = "b".charCodeAt(0); reversed.set(valid.data, valid.data.length);
  expect(() => reader.tree(reversed)).toThrow("journal-layout-tree");
  const noncanonicalTime = new TextDecoder().decode(maker.commit(valid.id, null, 0).data).replaceAll("+0000\n", "+0000\r\n");
  expect(() => reader.commit(utf8.encode(noncanonicalTime))).toThrow("journal-layout-timestamp");
  for (const seconds of [-1, -0, NaN, Infinity, 0.5, JOURNAL_LAST_SECOND + 1]) expect(() => maker.commit(valid.id, null, seconds)).toThrow("journal-layout-timestamp");
  const directory = new JournalObjects("sha1", work());
  const rows = Array.from({ length: 4096 }, (_, n) => ({ mode: "100644" as const, name: `f${String(n).padStart(4, "0")}`, id: blob.id }));
  const full = directory.tree(rows);
  expect(full.type).toBe("tree");
  expect(() => directory.tree([...rows, { mode: "100644", name: "overflow", id: blob.id }])).toThrow("journal-layout-limit");
  expect(() => directory.objects()).toThrow("journal-layout-limit");
  const shared = work(), prior = new JournalObjects("sha1", shared);
  prior.make("blob", utf8.encode("prior partial object"));
  const parser = new JournalObjectReader("sha1", { object: async () => null }, shared);
  const tooMany = Buffer.concat([full.data, Buffer.from("100644 overflow\0"), Buffer.from(blob.id, "hex")]);
  expect(() => parser.tree(tooMany)).toThrow("journal-layout-limit");
  expect(() => prior.objects()).toThrow("journal-layout-limit");
  const bounded = new JournalObjects("sha256", work());
  expect(bounded.make("blob", new Uint8Array(8 * 1024 * 1024)).data.length).toBe(8 * 1024 * 1024);
  expect(() => bounded.make("blob", new Uint8Array(8 * 1024 * 1024 + 1))).toThrow("journal-layout-limit");
});

test("the original native allowance is not reset, object metadata precedes body work, corrupt bytes cannot pass, and cached construction still spends work", async () => {
  const budget = new ArchiveBudget({}, () => 0);
  budget.spend({ entries: 7, attempts: 2, inputWork: 100 }); // preceding inventory work, not a new pass.
  const shared = work(budget), maker = new JournalObjects("sha256", shared), bytes = Buffer.from("named immutable bytes");
  const blob = maker.make("blob", bytes), before = budget.admitted().inputWork;
  expect(maker.make("blob", bytes)).toBe(blob);
  expect(budget.admitted().inputWork).toBeGreaterThan(before);
  expect(budget.admitted()).toMatchObject({ entries: 7, attempts: 2 });
  const calls: number[] = [];
  const reader = new JournalObjectReader("sha256", { object: async (_id, limit) => {
    calls.push(limit);
    if (limit > 0) expect(budget.admitted().inputWork).toBeGreaterThanOrEqual(before + bytes.length * 4);
    return { type: "blob", size: bytes.length, data: limit === 0 ? null : bytes };
  } }, shared);
  const owned = await reader.read(blob.id, "blob");
  expect([...owned]).toEqual([...bytes]);
  bytes[0] = 0;
  expect(owned[0]).toBe("n".charCodeAt(0));
  expect(calls).toEqual([0, bytes.length]);
  expect(budget.admitted()).toMatchObject({ entries: 7, attempts: 3, calls: 2 });
  for (const corrupt of [bytes.slice(1), new Uint8Array(bytes.length)]) {
    const bad = new JournalObjectReader("sha256", { object: async (_id, limit) => ({ type: "blob", size: bytes.length, data: limit === 0 ? null : corrupt }) }, work());
    const outcome = await bad.read(blob.id, "blob").then(() => "accepted", error => error instanceof JournalLayoutRefusal ? error.reason : "unexpected-error");
    expect(outcome).toBe("object-mismatch");
  }
  let transfers = 0;
  const exhausted = new JournalObjectReader("sha256", { object: async (_id, limit) => { transfers++; expect(limit).toBe(0); return { type: "blob", size: bytes.length, data: null }; } }, work(new ArchiveBudget({ inputWork: 128 }, () => 0)));
  await expect(exhausted.read(blob.id, "blob")).rejects.toBeInstanceOf(ArchiveStopped);
  expect(transfers).toBe(1); // budget refuses before the nonempty body call.
  // Untrusted source envelopes are reusable/mutable objects. A later
  // callback must not change the already validated primitive reservation.
  const big = new Uint8Array(17).fill(3), bigId = new JournalObjects("sha256", work()).make("blob", big).id;
  const probe = { type: "blob", size: 1, data: null };
  const allowance = new ArchiveBudget({ inputWork: 280 }, () => 0);
  const changing = new JournalObjectReader("sha256", { object: async (_id, limit) => {
    if (limit === 0) return probe;
    expect(limit).toBe(1); probe.size = 17;
    return { type: "blob", size: 17, data: big };
  } }, new JournalWork(allowance, { objectBytes: 16 }));
  const changed = await changing.read(bigId, "blob").then(() => "accepted", error => error instanceof JournalLayoutRefusal ? error.reason : "unexpected-error");
  expect(changed).toBe("object-mismatch"); expect(allowance.admitted().inputWork).toBeLessThanOrEqual(280);
  let dataReads = 0;
  const getters = new JournalObjectReader("sha256", { object: async (_id, limit) => limit === 0 ? { type: "blob", size: 1, data: null } : {
    type: "blob", size: 1, get data() { return ++dataReads <= 2 ? new Uint8Array([3]) : big; },
  } }, new JournalWork(new ArchiveBudget({}, () => 0), { objectBytes: 16 }));
  const captured = await getters.read(bigId, "blob").then(() => "accepted", error => error instanceof JournalLayoutRefusal ? error.reason : "unexpected-error");
  expect(captured).toBe("object-mismatch"); expect(dataReads).toBe(1);
  const limited = new JournalWork(new ArchiveBudget({}, () => 0), { outputWork: 7 });
  const tiny = new JournalObjects("sha1", limited);
  expect(tiny.make("blob", new Uint8Array()).data.length).toBe(0); // seven header bytes.
  expect(() => tiny.make("blob", new Uint8Array())).toThrow("journal-layout-limit");
  expect(() => tiny.objects()).toThrow("journal-layout-limit");
});

test("a delayed object body cannot pass the original inventory deadline or enable another read", async () => {
  let now = 0, calls = 0, resolve!: (value: { type: string; size: number; data: Uint8Array }) => void, started!: () => void;
  const ready = new Promise<void>(done => { started = done; });
  const budget = new ArchiveBudget({}, () => now, 1000), bytes = utf8.encode("late fixture");
  const blob = new JournalObjects("sha1", work()).make("blob", bytes);
  const reader = new JournalObjectReader("sha1", { object: async (_id, limit) => {
    calls++;
    if (limit === 0) return { type: "blob", size: bytes.length, data: null };
    return new Promise(done => { resolve = done; started(); });
  } }, work(budget));
  let returned = false;
  const pending = reader.read(blob.id, "blob").then(() => { returned = true; });
  await ready; now = 1000; resolve({ type: "blob", size: bytes.length, data: bytes });
  await expect(pending).rejects.toThrow("archive-timeout");
  await expect(reader.read(blob.id, "blob")).rejects.toThrow("archive-timeout");
  expect(returned).toBe(false); expect(calls).toBe(2);
});
