/** Synthetic selected-inventory fixtures. Entry forms, canonical bytes,
 * hashes, seeds and signatures use the real byte library. No native
 * judgment, SQL inventory, privacy admission or export is claimed. */
import { execFileSync } from "node:child_process";
import type { Entry, Intent, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, entryHash, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { ArchiveBudget } from "../../../scope/src/archive-budget.ts";
import { journalKeyName } from "../../src/journal-selection.ts";
import type { JournalFormat, JournalObject, JournalObjectSource } from "../../src/journal-objects.ts";
import type { ArchiveRetainedName } from "../../src/journal-path.ts";
import type { JournalInputSource } from "../../src/journal-layout.ts";
import { git, scratch } from "./repo.ts";

export function syntheticJournal(count = 1, incarnation = 1, salt = 1) {
  const secret = new Uint8Array(32).fill(salt), actor = keyIdOfSecret(secret);
  const intent: Intent = { v: 1, to: null, actor, kind: "install", on: null, expected: {}, fields: {}, idempotencyKey: `TEST journal-${salt}`, notAfter: "2030-01-01T00:00:00Z" };
  const seed: Seed = { v: 1, kind: "register", definition: "platform:register@1", creator: null, cause: intentDigest(intent), ordinal: 0 };
  const at = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(incarnation)), kind: "register" as const };
  const bodies: string[] = [], entries: { seq: number; hash: ReturnType<typeof entryHash>; bytes: number }[] = [];
  for (let seq = 0; seq < count; seq++) {
    const entry: Entry = {
      v: 1, at, seq, prev: entries.at(-1)?.hash ?? null, time: timeOf(1_700_000_000_900 + seq * 1000), clamped: false, epoch: 0,
      input: seq === 0 ? { type: "genesis", seed, inc: at.inc, kind: at.kind, "founding": signIntent(intent, secret), source: null, n: null, message: null, decision: "applied" }
        : seq === 1 ? { type: "outcome", operation: "0:0", attempt: 0, owner: "platform:destination@1", kind: "TEST outcome", result: "confirmed", evidence: { basis: "own-answer", body: { test: true } } }
        : { type: "checkpoint", through: seq - 1, state: digestBytes(utf8("TEST state")) },
      uses: [], prepared: [], effects: [], sends: [],
    };
    const bytes = canonicalize(entry); bodies.push(bytes); entries.push({ seq, hash: entryHash(entry), bytes: utf8(bytes).length });
  }
  const origin = (seq: number) => ({ at: { at, seq, hash: entries[seq]!.hash }, input: seq === 0 ? "genesis" : seq === 1 ? "outcome" : "checkpoint" });
  const retained = new Map<string, string>();
  const objects: { key: ArchiveRetainedName; bytes: number; consumers: unknown[] }[] = [0, ...(count > 1 ? [1] : [])].map(seq => {
    const bytes = canonicalize({ fixture: `selected-${seq}` }), key = { kind: "rule" as const, digest: digestBytes(utf8(bytes)) };
    retained.set(journalKeyName(key), bytes);
    return { key, bytes: utf8(bytes).length, consumers: [{ mode: "required", origin: origin(seq), consumer: "rule-input", purpose: "replay-required", key }] };
  });
  const omittedTexts = [{ mode: "text", origin: origin(0), consumer: "detached-text", key: { kind: "text", digest: digestBytes(utf8("TEST omitted text")) }, archive: "omit" }];
  return {
    at, bodies, retained,
    description: { format: "artroom-local-inventory-1", at, through: { seq: count - 1, hash: entries.at(-1)!.hash }, entries, objects, omittedTexts, ancestryUnwalked: [], replay: "unchecked", retention: "observed-local" },
  };
}
export function described(fixture: ReturnType<typeof syntheticJournal>, budget = new ArchiveBudget({}, () => 0)) {
  budget.spend({ entries: fixture.description.entries.length, attempts: fixture.description.objects.length });
  return { budget, selection: canonicalize({ ...fixture.description, cost: budget.admitted() }) };
}
export function selectedInput(fixture: ReturnType<typeof syntheticJournal>, calls: string[] = []): JournalInputSource {
  return {
    entry: async (seq, limit) => { calls.push(`entry:${seq}`); const bytes = fixture.bodies[seq]; return bytes !== undefined && utf8(bytes).length <= limit ? bytes : null; },
    retained: async (key, limit) => { const name = journalKeyName(key); calls.push(name); const bytes = fixture.retained.get(name); return bytes !== undefined && utf8(bytes).length <= limit ? bytes : null; },
  };
}
export function archiveRepository(format: JournalFormat): string {
  const dir = scratch(); git(dir, ["init", "-q", "--bare", `--object-format=${format}`]); return dir;
}
export function writeArchiveObjects(dir: string, objects: readonly JournalObject[]): string[] {
  return objects.map(object => git(dir, ["hash-object", "-w", "-t", object.type, "--stdin"], object.data));
}
const env = { PATH: process.env["PATH"] ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
export function archiveObjectSource(dir: string, calls: { id: string; limit: number }[] = []): JournalObjectSource {
  return { object: async (id, limit) => {
    calls.push({ id, limit });
    const fields = git(dir, ["cat-file", "--batch-check"], id + "\n").split(" ");
    if (fields[1] === "missing") return null;
    const size = Number(fields[2]), type = fields[1]!;
    return { type, size, data: size > limit ? null : new Uint8Array(execFileSync("git", ["-C", dir, "cat-file", type, id], { env, maxBuffer: 8 * 1024 * 1024 })) };
  } };
}

/** Deliberately corrupt a parent while keeping its Git hashes, modes,
 * header identity/time and all unrelated tree entries valid. This is a
 * mechanical local corruption fixture, not an archive producer. */
export function rewriteArchiveFile(dir: string, commit: string, path: string, bytes: string): string {
  const blob = git(dir, ["hash-object", "-w", "--stdin"], bytes);
  function change(tree: string, parts: readonly string[]): string {
    const rows = git(dir, ["ls-tree", tree]).split("\n").map(line => {
      const [meta, name] = line.split("\t") as [string, string];
      const [mode, type, id] = meta.split(" ") as [string, string, string];
      if (name !== parts[0]) return line;
      const next = parts.length === 1 ? blob : change(id, parts.slice(1));
      return `${mode} ${type} ${next}\t${name}`;
    });
    return git(dir, ["mktree"], rows.join("\n") + "\n");
  }
  const root = git(dir, ["rev-parse", `${commit}^{tree}`]), changed = change(root, path.split("/"));
  const body = new TextDecoder().decode(new Uint8Array(execFileSync("git", ["-C", dir, "cat-file", "commit", commit], { env })));
  return git(dir, ["hash-object", "-w", "-t", "commit", "--stdin"], body.replace(`tree ${root}\n`, `tree ${changed}\n`));
}

/** Add one invalid archive-tree leaf, preserving a valid Git object graph. */
export function invalidArchiveLeaf(dir: string, commit: string, mode: "100644" | "100755" | "120000" | "160000", blob: string): string {
  const root = git(dir, ["rev-parse", `${commit}^{tree}`]);
  const rows = git(dir, ["ls-tree", root]);
  const changed = git(dir, ["mktree"], `${rows}\n${mode} ${mode === "160000" ? "commit" : "blob"} ${mode === "160000" ? commit : blob}\tz\n`);
  const body = new TextDecoder().decode(new Uint8Array(execFileSync("git", ["-C", dir, "cat-file", "commit", commit], { env })));
  return git(dir, ["hash-object", "-w", "-t", "commit", "--stdin"], body.replace(`tree ${root}\n`, `tree ${changed}\n`));
}

export function retimedSyntheticRoot(milliseconds: number) {
  const fixture = syntheticJournal(), entry = JSON.parse(fixture.bodies[0]!) as Entry;
  entry.time = timeOf(milliseconds);
  const bytes = canonicalize(entry), hash = entryHash(entry);
  fixture.bodies[0] = bytes;
  fixture.description.entries[0] = { seq: 0, hash, bytes: utf8(bytes).length };
  fixture.description.through.hash = hash;
  for (const object of fixture.description.objects) for (const raw of object.consumers) {
    const consumer = raw as { origin: { at: { hash: typeof hash } } };
    consumer.origin.at.hash = hash;
  }
  for (const text of fixture.description.omittedTexts) text.origin.at.hash = hash;
  return fixture;
}
