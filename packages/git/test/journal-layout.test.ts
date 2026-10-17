import { afterAll, expect, test } from "vitest";
import { DOMAINS } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, domainBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { ArchiveBudget } from "../../scope/src/archive-budget.ts";
import { buildJournalArchive, type JournalArchive, type JournalLayoutResult, type JournalLayoutOptions } from "../src/journal-layout.ts";
import { journalKeyName } from "../src/journal-selection.ts";
import { JournalObjectReader, type JournalFormat } from "../src/journal-objects.ts";
import { JournalWork } from "../src/journal-work.ts";
import { journalTreeFiles } from "../src/journal-files.ts";
import { journalManifest } from "../src/journal-manifest.ts";
import { archiveObjectSource, archiveRepository, described, selectedInput, syntheticJournal, writeArchiveObjects, rewriteArchiveFile, invalidArchiveLeaf, retimedSyntheticRoot } from "./support/journal.ts";
import { cleanup, git } from "./support/repo.ts";

afterAll(cleanup);
const formats: readonly JournalFormat[] = ["sha1", "sha256"];
function complete(result: JournalLayoutResult): JournalArchive {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("test cannot continue without a complete archive");
  return result.archive;
}

test("a cumulative selected prefix gives deterministic complete archive trees in both Git formats, with explicit text omissions and no later or bookkeeping bytes", async () => {
  for (const format of formats) {
    const fixture = syntheticJournal(3), calls: string[] = [], input = selectedInput(fixture, calls);
    const first = complete(await buildJournalArchive({ format, ...described(fixture), input, parent: null }));
    const shuffled = structuredClone(fixture);
    shuffled.description.entries.reverse(); shuffled.description.objects.reverse();
    shuffled.description.objects.push(structuredClone(shuffled.description.objects[0]!));
    // The fixture reservation is synthetic, not a native policy verdict.
    const again = complete(await buildJournalArchive({ format, ...described(shuffled), input, parent: null }));
    expect([again.commit, again.tree, again.manifestBytes]).toEqual([first.commit, first.tree, first.manifestBytes]);
    expect(first.newInterval).toEqual([0, 2]);
    expect(first.manifest.through).toEqual(fixture.description.through);
    expect(first.manifest.entries).toEqual([0, 2]);
    expect(first.manifest.omitted).toEqual([{ kind: "text", digest: fixture.description.omittedTexts[0]!.key.digest, reason: "detached-text" }]);
    expect(first.selection.objects[0]!.consumers.length).toBe(1);
    const dir = archiveRepository(format);
    expect(writeArchiveObjects(dir, first.objects)).toEqual(first.objects.map(o => o.id));
    expect(git(dir, ["fsck", "--strict", "--no-dangling", first.commit])).toBe("");
    const work = new JournalWork(new ArchiveBudget({}, () => 0)), source = archiveObjectSource(dir), reader = new JournalObjectReader(format, source, work);
    const commit = reader.commit(await reader.read(first.commit, "commit")), files = await journalTreeFiles(reader, commit.tree, work);
    expect(commit.seconds).toBe(1_700_000_002); // floor of the recorded .900 second, not wall clock.
    expect(journalManifest(await reader.read(files.get("journal/v1/manifest.json")!, "blob"), format, work)).toEqual(first.manifest);
    expect([...files.keys()].some(path => path.includes("text") || path.includes("cost") || path.includes("bookkeeping"))).toBe(false);
    expect(JSON.parse(first.manifestBytes)).not.toHaveProperty("cost");
    expect(JSON.parse(first.manifestBytes)).not.toHaveProperty("consumers");
    expect(calls.filter(c => c.startsWith("entry:"))).toEqual(["entry:0", "entry:1", "entry:2", "entry:0", "entry:1", "entry:2"]);
    // A later turn's input is present in this scripted store, but is not
    // named by the fixed selection. It must never be read or alter a rebuild.
    const later = canonicalize({ privateBookkeeping: "TEST unselected later bytes" }), key = { kind: "rule" as const, digest: digestBytes(utf8(later)) };
    fixture.retained.set(journalKeyName(key), later);
    const rebuilt = complete(await buildJournalArchive({ format, ...described(fixture), input, parent: null }));
    expect(rebuilt.commit).toBe(first.commit); expect(calls).not.toContain(journalKeyName(key));
  }
});

test("a validated parent extends only its final segment and cumulative input set; retrying the same manifest on the original parent gives the same commit", async () => {
  for (const format of formats) {
    const old = syntheticJournal(), first = complete(await buildJournalArchive({ format, ...described(old), input: selectedInput(old), parent: null }));
    const dir = archiveRepository(format); writeArchiveObjects(dir, first.objects);
    const fixture = syntheticJournal(3), parent = { id: first.commit, source: archiveObjectSource(dir) };
    const next = complete(await buildJournalArchive({ format, ...described(fixture), input: selectedInput(fixture), parent }));
    const retry = complete(await buildJournalArchive({ format, ...described(fixture), input: selectedInput(fixture), parent }));
    expect(next.commit).toBe(retry.commit); expect(next.manifest.parent).toBe(first.commit); expect(next.newInterval).toEqual([1, 2]);
    writeArchiveObjects(dir, next.objects);
    expect(git(dir, ["rev-list", "--parents", "-1", next.commit])).toBe(`${next.commit} ${first.commit}`);
    expect(git(dir, ["fsck", "--strict", "--no-dangling", next.commit])).toBe("");
    const oldFiles = git(dir, ["ls-tree", "-r", first.commit]).split("\n"), newFiles = git(dir, ["ls-tree", "-r", next.commit]).split("\n");
    for (const line of oldFiles.filter(line => line.includes("/retained/"))) expect(newFiles).toContain(line);
    const oldSegment = git(dir, ["show", `${first.commit}:journal/v1/segments/000000000000.jsonl`]);
    const extended = git(dir, ["show", `${next.commit}:journal/v1/segments/000000000000.jsonl`]);
    expect(extended.startsWith(oldSegment + "\n")).toBe(true);
    const sameCutoff = await buildJournalArchive({ format, ...described(old), input: selectedInput(old), parent });
    expect(sameCutoff).toEqual({ ok: false, reason: "parent" });
  }
});

test("wrong scope, incarnation, format or cutoff cannot extend a parent, and a Git-valid corrupt retained file is refused rather than repaired", async () => {
  const format = "sha256", old = syntheticJournal(), first = complete(await buildJournalArchive({ format, ...described(old), input: selectedInput(old), parent: null }));
  const dir = archiveRepository(format); writeArchiveObjects(dir, first.objects);
  for (const fixture of [syntheticJournal(3, 2), syntheticJournal(3, 1, 2), syntheticJournal()]) {
    const result = await buildJournalArchive({ format, ...described(fixture), input: selectedInput(fixture), parent: { id: first.commit, source: archiveObjectSource(dir) } });
    expect(result.ok ? "accepted" : result.reason).toBe("parent");
  }
  const current = syntheticJournal(3);
  const wrongFormat = await buildJournalArchive({ format: "sha1", ...described(current), input: selectedInput(current), parent: { id: first.commit, source: archiveObjectSource(dir) } });
  expect(wrongFormat.ok ? "accepted" : wrongFormat.reason).toBe("parent");
  const rootKey = old.description.objects[0]!.key;
  const path = `journal/v1/retained/rule/${rootKey.digest.slice(7)}`;
  const broken = rewriteArchiveFile(dir, first.commit, path, old.retained.get(journalKeyName(rootKey))!.replace("selected-0", "selected-X"));
  expect(git(dir, ["fsck", "--strict", "--no-dangling", broken])).toBe("");
  const corrupt = await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent: { id: broken, source: archiveObjectSource(dir) } });
  expect(corrupt.ok ? "accepted" : corrupt.reason).toBe("parent");
  if (!corrupt.ok) expect(corrupt.where).toBe(path);
});

test("missing or mismatched named bytes and conflicting descriptions stop without a partial archive, and a replacement budget cannot erase the selected inventory cost", async () => {
  const fixture = syntheticJournal(2), format = "sha1", ordinary = selectedInput(fixture);
  const missingName = journalKeyName(fixture.description.objects[0]!.key);
  const missing = await buildJournalArchive({ format, ...described(fixture), input: { ...ordinary, retained: async (key, limit) => journalKeyName(key) === missingName ? null : ordinary.retained(key, limit) }, parent: null });
  expect(missing).toEqual({ ok: false, reason: "missing-input", where: journalKeyName(fixture.description.objects[0]!.key) });
  const corrupt = await buildJournalArchive({ format, ...described(fixture), input: { ...ordinary, retained: async (_key, limit) => "x".repeat(limit) }, parent: null });
  expect(corrupt.ok ? "accepted" : corrupt.reason).toBe("input-mismatch");
  const conflict = structuredClone(fixture), duplicate = structuredClone(conflict.description.objects[0]!); duplicate.bytes++;
  conflict.description.objects.push(duplicate);
  let reads = 0;
  const refused = await buildJournalArchive({ format, ...described(conflict), input: { entry: async () => { reads++; return null; }, retained: async () => { reads++; return null; } }, parent: null });
  expect(refused).toEqual({ ok: false, reason: "input" }); expect(reads).toBe(0);
  const base = JSON.parse(described(fixture).selection) as Record<string, unknown>;
  const extra = structuredClone(base); extra["certificate"] = "TEST caller claim";
  const omission = structuredClone(base);
  (omission["omittedTexts"] as Record<string, unknown>[])[0]!["archive"] = "include";
  const unknown = structuredClone(base);
  const firstObject = (unknown["objects"] as { consumers: Record<string, unknown>[] }[])[0]!;
  firstObject.consumers[0]!["consumer"] = "unreviewed-consumer";
  for (const description of [extra, omission, unknown]) {
    const result = await buildJournalArchive({ format, ...described(fixture), selection: canonicalize(description), input: { entry: async () => { reads++; return null; }, retained: async () => { reads++; return null; } }, parent: null });
    expect(result).toEqual({ ok: false, reason: "input" });
  }
  const tooLarge = await buildJournalArchive({ format, ...described(fixture), selection: " ".repeat(1024 * 1024 + 1), input: { entry: async () => { reads++; return null; }, retained: async () => { reads++; return null; } }, parent: null });
  expect(tooLarge).toEqual({ ok: false, reason: "limit" }); expect(reads).toBe(0);
  const selected = described(fixture);
  const replacement = await buildJournalArchive({ format, selection: selected.selection, budget: new ArchiveBudget({}, () => 0), input: ordinary, parent: null });
  expect(replacement).toEqual({ ok: false, reason: "input" });
  const limited = await buildJournalArchive({ format, ...described(fixture), limits: { outputWork: 0 }, input: ordinary, parent: null });
  expect(limited).toEqual({ ok: false, reason: "limit" }); expect(limited).not.toHaveProperty("archive");
  const shallow = await buildJournalArchive({ format, ...described(fixture), limits: { depth: 2 }, input: ordinary, parent: null });
  expect(shallow).toEqual({ ok: false, reason: "limit" });
});

test("a complete thousand-line segment keeps its exact blob on extension, while the next segment and interval start after it", async () => {
  const format = "sha256", old = syntheticJournal(1000), first = complete(await buildJournalArchive({ format, ...described(old), input: selectedInput(old), parent: null }));
  const dir = archiveRepository(format); writeArchiveObjects(dir, first.objects);
  const current = syntheticJournal(1002), next = complete(await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent: { id: first.commit, source: archiveObjectSource(dir) } }));
  writeArchiveObjects(dir, next.objects);
  const name = "journal/v1/segments/000000000000.jsonl";
  expect(git(dir, ["rev-parse", `${first.commit}:${name}`])).toBe(git(dir, ["rev-parse", `${next.commit}:${name}`]));
  expect(git(dir, ["ls-tree", "--name-only", `${next.commit}:journal/v1/segments`]).split("\n")).toEqual(["000000000000.jsonl", "000000001000.jsonl"]);
  expect(next.newInterval).toEqual([1000, 1001]);
  expect(git(dir, ["show", `${next.commit}:journal/v1/segments/000000001000.jsonl`])).toBe(current.bodies.slice(1000).join("\n"));
});

test("retained definitions, snapshots, values and raw rule inputs keep their native hash domains, and the wrong domain or an unsupported cohort cannot supply bytes", async () => {
  const fixture = syntheticJournal(2);
  const origin = (seq: number) => ({ at: { at: fixture.at, seq, hash: fixture.description.entries[seq]!.hash }, input: seq === 0 ? "genesis" : "outcome" });
  const definitionBody = { fixture: "declaration metadata stand-in" }, snapshotBody: unknown[] = [], valueBody = { fixture: "native domain stand-in" };
  const rows = [
    { key: { kind: "definition" as const, digest: digestBytes(domainBytes(DOMAINS.definition, definitionBody)) }, bytes: canonicalize(definitionBody), consumer: "definition-child", seq: 0 },
    { key: { kind: "snapshot" as const, digest: digestBytes(domainBytes(DOMAINS.snapshot, snapshotBody)) }, bytes: canonicalize(snapshotBody), consumer: "outcome-snapshot", seq: 1 },
    { key: { kind: "value" as const, domain: DOMAINS.snapshot, digest: digestBytes(domainBytes(DOMAINS.snapshot, valueBody)) }, bytes: canonicalize(valueBody), consumer: "outcome-value", seq: 1 },
  ];
  for (const row of rows) {
    fixture.description.objects.push({ key: row.key, bytes: utf8(row.bytes).length, consumers: [{ mode: "required", origin: origin(row.seq), consumer: row.consumer, purpose: row.consumer === "definition-child" ? "archive-closure" : "replay-required", key: row.key }] });
    fixture.retained.set(journalKeyName(row.key), row.bytes);
  }
  const built = complete(await buildJournalArchive({ format: "sha256", ...described(fixture), input: selectedInput(fixture), parent: null }));
  expect(new Set(built.manifest.retained.map(key => key.kind))).toEqual(new Set(["definition", "rule", "snapshot", "value"]));
  const broken = structuredClone(fixture), selected = broken.description.objects.find(row => row.key.kind === "value")!;
  if (selected.key.kind !== "value") throw new Error("fixture needs its value key");
  selected.key.domain = DOMAINS.intent;
  const ordinary = selectedInput(broken);
  const wrongDomain = await buildJournalArchive({ format: "sha256", ...described(broken), parent: null, input: { ...ordinary, retained: async (key, limit) => key.kind === "value" ? rows[2]!.bytes : ordinary.retained(key, limit) } });
  expect(wrongDomain.ok ? "accepted" : wrongDomain.reason).toBe("input-mismatch");
  for (const key of [{ kind: "entry" as const, digest: rows[0]!.key.digest }, { kind: "value" as const, domain: "unreviewed-private-domain", digest: rows[0]!.key.digest }]) {
    const unsupported = structuredClone(fixture); unsupported.description.objects[0]!.key = key;
    let calls = 0;
    const result = await buildJournalArchive({ format: "sha256", ...described(unsupported), parent: null, input: { entry: async () => { calls++; return null; }, retained: async () => { calls++; return null; } } });
    expect(result).toEqual({ ok: false, reason: "input" }); expect(calls).toBe(0);
  }
});

test("late selected bytes stop under the original deadline, and entry/object/call bounds refuse before another read or a successful partial result", async () => {
  const fixture = syntheticJournal(), format = "sha1";
  let now = 0, resolve!: (value: string) => void, started!: () => void, calls = 0;
  const ready = new Promise<void>(done => { started = done; });
  const admitted = described(fixture, new ArchiveBudget({}, () => now, 1000));
  const pending = buildJournalArchive({ format, ...admitted, parent: null, input: { entry: async () => { calls++; return new Promise(done => { resolve = done; started(); }); }, retained: async () => { calls++; return null; } } });
  await ready; now = 1000; resolve(fixture.bodies[0]!);
  expect(await pending).toEqual({ ok: false, reason: "timeout" }); expect(calls).toBe(1);
  for (const options of [{ limits: { objects: 0 } }, { limits: { objectBytes: fixture.description.entries[0]!.bytes - 1 } }]) {
    const result = await buildJournalArchive({ format, ...described(fixture), parent: null, input: selectedInput(fixture), ...options });
    expect(result.ok).toBe(false); expect(result).not.toHaveProperty("archive");
  }
  let reads = 0;
  const noCalls = await buildJournalArchive({ format, ...described(fixture, new ArchiveBudget({ calls: 0 }, () => 0)), parent: null, input: { entry: async () => { reads++; return null; }, retained: async () => { reads++; return null; } } });
  expect(noCalls).toEqual({ ok: false, reason: "limit" }); expect(reads).toBe(0);
});

test.each(formats)("a parent with inconsistent head metadata or forbidden tree modes/paths is rejected before an unexpected blob is read (%s)", async (format) => {
  const fixture = syntheticJournal(), first = complete(await buildJournalArchive({ format, ...described(fixture), input: selectedInput(fixture), parent: null }));
  const dir = archiveRepository(format); writeArchiveObjects(dir, first.objects);
  const current = syntheticJournal(2);
  const wrong = canonicalize({ v: 1, scope: { ...fixture.at, kind: "directory" }, through: 0, hash: fixture.description.through.hash });
  const changed = rewriteArchiveFile(dir, first.commit, "journal/v1/head.json", wrong);
  const mismatch = await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent: { id: changed, source: archiveObjectSource(dir) } });
  expect(mismatch.ok ? "accepted" : mismatch.reason).toBe("parent");
  const secret = git(dir, ["hash-object", "-w", "--stdin"], "TEST private unexpected parent payload");
  for (const mode of ["100644", "100755", "120000", "160000"] as const) {
    const bad = invalidArchiveLeaf(dir, first.commit, mode, secret), calls: { id: string; limit: number }[] = [];
    const result = await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent: { id: bad, source: archiveObjectSource(dir, calls) } });
    expect(result.ok ? "accepted" : result.reason).toBe("parent");
    expect(calls.some(call => call.id === secret && call.limit > 0)).toBe(false);
  }
  // An empty directory has no flat file-map entry. It is still an
  // unexpected physical path, not a canonical archive prefix.
  const empty = git(dir, ["hash-object", "-w", "-t", "tree", "--stdin"], "");
  const bad = invalidArchiveLeaf(dir, first.commit, "40000", empty);
  const result = await buildJournalArchive({ format, ...described(current), input: selectedInput(current), parent: { id: bad, source: archiveObjectSource(dir) } });
  expect(result.ok ? "accepted" : result.reason).toBe("parent");
});

test("commit seconds come from the actual cutoff entry across subsecond boundaries and the supported UTC range", async () => {
  for (const format of formats) {
    for (const milliseconds of [0, 999, 1000, Date.UTC(9999, 11, 31, 23, 59, 59, 999)]) {
      const fixture = retimedSyntheticRoot(milliseconds);
      const built = complete(await buildJournalArchive({ format, ...described(fixture), input: selectedInput(fixture), parent: null }));
      const reader = new JournalObjectReader(format, { object: async () => null }, new JournalWork(new ArchiveBudget({}, () => 0)));
      const commit = reader.commit(built.objects.find(object => object.id === built.commit)!.data);
      expect(commit.seconds).toBe(Math.floor(milliseconds / 1000));
    }
    const beforeEpoch = retimedSyntheticRoot(-1);
    const refused = await buildJournalArchive({ format, ...described(beforeEpoch), input: selectedInput(beforeEpoch), parent: null });
    expect(refused).toEqual({ ok: false, reason: "timestamp" });
  }
});

test("source callbacks cannot replace the captured parent, selection or budget, or mutate the builder's selected key metadata", async () => {
  const format = "sha256", old = syntheticJournal(), first = complete(await buildJournalArchive({ format, ...described(old), input: selectedInput(old), parent: null }));
  const dir = archiveRepository(format); writeArchiveObjects(dir, first.objects);
  const fixture = syntheticJournal(2), admitted = described(fixture), originalBudget = admitted.budget;
  const ordinary = selectedInput(fixture), parentSource = archiveObjectSource(dir);
  const parent = { id: first.commit, source: parentSource };
  const options: { -readonly [K in keyof JournalLayoutOptions]: JournalLayoutOptions[K] } = { format, ...admitted, parent, input: ordinary };
  let changed = false;
  parent.source = { object: async (id, limit) => {
    if (!changed) { changed = true; parent.id = "f".repeat(64); options.selection = ""; options.budget = new ArchiveBudget({}, () => 0); }
    return parentSource.object(id, limit);
  } };
  options.input = { ...ordinary, retained: async (key, limit) => {
    const bytes = await ordinary.retained(key, limit);
    Object.assign(key, { digest: digestBytes(utf8("TEST changed callback argument")) });
    return bytes;
  } };
  const built = complete(await buildJournalArchive(options));
  expect(built.manifest.parent).toBe(first.commit);
  expect(built.manifest.retained.map(journalKeyName).sort()).toEqual(fixture.description.objects.map(row => journalKeyName(row.key)).sort());
  expect(built.cost.entries).toBe(originalBudget.admitted().entries); expect(built.cost.entries).toBe(2);
  expect(options.budget.admitted().entries).toBe(0);
});
