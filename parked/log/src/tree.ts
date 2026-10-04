/**
 * Reading a log commit's tree in either layout (R-LOG-9, R-LOG-16 to
 * R-LOG-19). One walker follows shard directories and checks them against
 * R-LOG-19 (`walkSet`); the publisher's index uses it on trees alone, and
 * `verify` uses it with `readLogCommit`, which also reassembles chunked
 * files and checks every blob against the object bound. Files are returned
 * by their logical path, the path R-LOG-9 gives them in layout 1, so the
 * rest of `verify` reads both layouts the same way.
 */

import type { ChunkedLine, LogEntry, LogLayout, Seq, Sha } from "@generalbusiness/artroom-contract";
import { ROOT, SEGMENT_SIZE, segmentPath } from "./entries.ts";
import { CHUNKS, DIGEST_FILES, OBJECT_BOUND, SEQ_FILES, chunks, segmentStarts, shardPaths, twelve, type NameSet } from "./layout.ts";
import { decodeCheckpoint, decodeChunkedLine, decodeEntry, segmentLines, textOf } from "./decode.ts";
import { digestBytes } from "./crypto.ts";
import { parseCommit, parseTree, type GitReader, type TreeEntry } from "./git.ts";

/** The four directory sets of `artroom-log/v1/`, and how each names its members. */
export const SETS = { segments: SEQ_FILES, entries: SEQ_FILES, inputs: DIGEST_FILES, policies: DIGEST_FILES } as const satisfies Record<string, NameSet>;
export type SetName = keyof typeof SETS;

/** The logical path of a chunked entry file (R-LOG-18). */
export const entryPath = (seq: Seq): string => `${ROOT}/entries/${twelve(seq)}.jsonl`;

export type ListTree = (sha: Sha) => Promise<readonly TreeEntry[]>;

export interface SetMembers {
  /** Each member by name. */
  readonly leaves: ReadonlyMap<string, TreeEntry>;
  /** Each tree by its path below the set's directory ("" for the directory). */
  readonly trees: ReadonlyMap<string, Sha>;
  /** What does not follow R-LOG-19 (or, `flat`, R-LOG-9's single directory). */
  readonly problems: readonly string[];
}

const prefixes = (path: string): string[] => {
  const parts = path ? path.split("/") : [];
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
};

/**
 * The members of one directory set, following its shard directories, and
 * whether each is where R-LOG-19 puts it among them all. `flat` reads
 * layout 1's single directory.
 */
export async function walkSet(list: ListTree, root: Sha, set: NameSet, flat: boolean): Promise<SetMembers> {
  const leaves = new Map<string, TreeEntry>();
  const at = new Map<string, string>();
  const trees = new Map<string, Sha>([["", root]]);
  const problems: string[] = [];
  const walk = async (sha: Sha, path: string): Promise<void> => {
    for (const e of await list(sha)) {
      const where = path ? `${path}/${e.name}` : e.name;
      if (set.name.test(e.name)) {
        if (leaves.has(e.name)) problems.push(`${e.name} appears twice`);
        leaves.set(e.name, e);
        at.set(e.name, path);
      } else if (!flat && e.mode === "40000" && set.shard.test(e.name)) {
        trees.set(where, e.sha);
        await walk(e.sha, where);
      } else problems.push(`${where} is neither a member nor a shard directory`);
    }
  };
  await walk(root, "");
  const expected = shardPaths([...leaves.keys()], set, flat);
  for (const [name, path] of at) if (expected.get(name) !== path) problems.push(`${name} is in ${path || "the top directory"}, not ${expected.get(name) || "the top directory"}`);
  const dirs = new Set<string>([""]);
  for (const p of expected.values()) for (const d of prefixes(p)) dirs.add(d);
  for (const p of trees.keys()) if (!dirs.has(p)) problems.push(`${p} is not a shard directory R-LOG-19 makes for these names`);
  return { leaves, trees, problems };
}

/** A chunk directory's bytes (R-LOG-18), or why it is not one: chunks from 0, each B bytes but the last, for a file over B. */
export async function readChunks(list: ListTree, blob: (sha: Sha) => Promise<Uint8Array>, root: Sha): Promise<{ readonly bytes: Uint8Array } | { readonly problem: string }> {
  const m = await walkSet(list, root, CHUNKS, false);
  if (m.problems.length) return { problem: m.problems[0]! };
  const names = [...m.leaves.keys()].sort();
  const parts: Uint8Array[] = [];
  for (const [k, name] of names.entries()) {
    const e = m.leaves.get(name)!;
    if (name !== twelve(k)) return { problem: `chunk ${name} is not chunk ${twelve(k)}` };
    if (e.mode !== "100644") return { problem: `chunk ${name} is not a file` };
    parts.push(await blob(e.sha));
  }
  const size = parts.reduce((n, p) => n + p.length, 0);
  const want = chunks(size);
  if (size <= OBJECT_BOUND || want.length !== parts.length || want.some((c, k) => c.bytes !== parts[k]!.length))
    return { problem: `${parts.length} chunks of ${parts.map((p) => p.length).join(", ")} bytes are not the chunks of a ${size}-byte file over ${OBJECT_BOUND}` };
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return { bytes: out };
}

export type TreeProblem = { readonly reason: "fan-out" | "chunk-mismatch" | "object-too-large"; readonly detail: string };

export interface LogCommit {
  /** Every file by its logical path: shard directories followed, chunked files reassembled. */
  readonly files: Map<string, Uint8Array>;
  /** The layout its checkpoint names, when the checkpoint decodes; undefined for layout 1. */
  readonly layout: LogLayout | undefined;
  /** Layout 2 only: what does not follow R-LOG-18 and R-LOG-19. Segments are left to the caller, which knows their entries. */
  readonly problems: readonly TreeProblem[];
}

/**
 * Read every file of a log commit: for verification, not for the Room. A
 * layout 1 commit is read as R-LOG-9's files, path by path. A layout 2 commit
 * is read through its directory sets, reassembling chunked files, and every
 * blob outside `segments/` is checked against B.
 */
export async function readLogCommit(reader: GitReader, commit: Sha): Promise<LogCommit> {
  const c = await reader.readObject(commit);
  if (c.type !== "commit") throw new Error(`${commit} is not a commit`);
  const blobs = new Map<string, Uint8Array>();
  const blob = async (sha: Sha): Promise<Uint8Array> => {
    let data = blobs.get(sha);
    if (!data) blobs.set(sha, (data = (await reader.readObject(sha)).data));
    return data;
  };
  const list: ListTree = async (sha) => {
    const t = await reader.readObject(sha);
    if (t.type !== "tree") throw new Error(`${sha} is not a tree`);
    return parseTree(t.data);
  };
  // Every file at its path, as R-LOG-9 reads it.
  const raw = new Map<string, { readonly sha: Sha; readonly data: Uint8Array }>();
  const walk = async (tree: Sha, prefix: string) => {
    for (const e of await list(tree)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.mode === "40000") await walk(e.sha, path);
      else raw.set(path, { sha: e.sha, data: await blob(e.sha) });
    }
  };
  const root = parseCommit(c.data).tree;
  await walk(root, "");
  let layout: LogLayout | undefined;
  const cp = raw.get(`${ROOT}/checkpoint.json`);
  try {
    layout = cp ? decodeCheckpoint(cp.data).layout : undefined;
  } catch {
    layout = undefined; // verify reports the malformed checkpoint
  }
  if (!layout) return { files: new Map([...raw].map(([p, f]) => [p, f.data])), layout, problems: [] };

  // Layout 2.
  const problems: TreeProblem[] = [];
  const files = new Map<string, Uint8Array>();
  const meaningful = /^artroom-log\/v1\/(genesis\.json\/|segments\/|entries\/|inputs\/|policies\/)/;
  for (const [path, f] of raw) {
    if (!path.startsWith(`${ROOT}/segments/`) && f.data.length > OBJECT_BOUND) problems.push({ reason: "object-too-large", detail: `${path} is ${f.data.length} bytes, over ${OBJECT_BOUND}` });
    if (!meaningful.test(path)) files.set(path, f.data); // the genesis and checkpoint blobs, and files that carry no meaning
  }
  const log = await find(list, root, "artroom-log");
  const v1 = log && (await find(list, log, "v1"));
  const top = v1 ? await list(v1) : [];
  const file = async (path: string, e: TreeEntry): Promise<void> => {
    if (e.mode === "100644") {
      files.set(path, await blob(e.sha));
      return;
    }
    const r = await readChunks(list, blob, e.sha);
    if ("problem" in r) problems.push({ reason: "chunk-mismatch", detail: `${path}: ${r.problem}` });
    else files.set(path, r.bytes);
  };
  const genesis = top.find((e) => e.name === "genesis.json");
  if (genesis?.mode === "40000") await file(`${ROOT}/genesis.json`, genesis);
  for (const [name, set] of Object.entries(SETS) as [SetName, NameSet][]) {
    const dir = top.find((e) => e.name === name);
    if (!dir) continue;
    if (dir.mode !== "40000") {
      problems.push({ reason: "fan-out", detail: `${ROOT}/${name} is not a directory` });
      continue;
    }
    const m = await walkSet(list, dir.sha, set, false);
    for (const p of m.problems) problems.push({ reason: "fan-out", detail: `${ROOT}/${name}: ${p}` });
    for (const [leaf, e] of m.leaves) {
      const path = `${ROOT}/${name}/${leaf}`;
      if (name === "segments" && e.mode !== "100644") problems.push({ reason: "chunk-mismatch", detail: `${path}: a segment is never chunked` });
      else await file(path, e);
    }
  }
  return { files, layout, problems };
}

async function find(list: ListTree, tree: Sha, name: string): Promise<Sha | null> {
  return (await list(tree)).find((e) => e.name === name && e.mode === "40000")?.sha ?? null;
}

/** The files under `artroom-log/v1/` in a log commit, by logical path. Reads every file: for verification, not for the Room. */
export async function readLogFiles(reader: GitReader, commit: Sha): Promise<Map<string, Uint8Array>> {
  return (await readLogCommit(reader, commit)).files;
}

/** The entries a log commit publishes, in order, chunked entries reassembled. Throws `Malformed` on content that is not a log entry. */
export async function readPublishedEntries(reader: GitReader, commit: Sha): Promise<LogEntry[]> {
  const { files, layout } = await readLogCommit(reader, commit);
  return commitLines(files, layout).lines.map(decodeEntry);
}

// ------------------------------------------------------------------ lines

/** A line that stands for an entry whose chunked file did not check out: it never decodes, and verify has already said why. */
export const CHUNK_MISMATCH = "\u0000chunk-mismatch:";

export interface CommitLines {
  /** Each entry's canonical line, chunked entries reassembled, in segment order. */
  readonly lines: string[];
  /** The UTF-8 length of each line. */
  readonly lineBytes: number[];
  /** Each segment: its first seq, its logical path and its line count, in order. */
  readonly segments: { readonly first: Seq; readonly path: string; readonly count: number }[];
  readonly problems: { readonly reason: "malformed" | "segment-bound" | "chunk-mismatch" | "object-too-large"; readonly seq?: Seq; readonly detail: string }[];
}

/** Byte length of each newline-separated line. */
function lengths(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++)
    if (i === bytes.length || bytes[i] === 0x0a) {
      out.push(i - start);
      start = i + 1;
    }
  return out;
}

/**
 * The entry lines of a log commit's files. Layout 1: segments every 1,000
 * entries from 0, as R-LOG-9 was first written. Layout 2: every segment,
 * which must follow on from the last and start where R-LOG-17 says; each
 * `ChunkedLine` is replaced by its entry file's bytes once they have its
 * length, digest and seq (R-LOG-18); a segment over B must hold only entries
 * before `from` (R-LOG-19).
 */
export function commitLines(files: ReadonlyMap<string, Uint8Array>, layout: LogLayout | undefined): CommitLines {
  const out: CommitLines = { lines: [], lineBytes: [], segments: [], problems: [] };
  if (!layout) {
    for (let first = 0; files.has(segmentPath(first)); first += SEGMENT_SIZE) {
      const bytes = files.get(segmentPath(first))!;
      const seg = segmentLines(bytes);
      out.lines.push(...seg);
      out.lineBytes.push(...lengths(bytes));
      out.segments.push({ first, path: segmentPath(first), count: seg.length });
      if (seg.length !== SEGMENT_SIZE && files.has(segmentPath(first + SEGMENT_SIZE))) out.problems.push({ reason: "malformed", detail: `segment ${first} is not full but a later one exists` });
    }
    return out;
  }
  const paths = [...files.keys()].filter((p) => /^artroom-log\/v1\/segments\/[0-9]{12}\.jsonl$/.test(p)).sort();
  for (const path of paths) {
    const first = Number(path.slice(-18, -6));
    const bytes = files.get(path)!;
    if (first !== out.lines.length) {
      out.problems.push({ reason: "segment-bound", seq: out.lines.length, detail: `segment ${first} does not follow on from the entries before it, which end at ${out.lines.length - 1}` });
      break;
    }
    const seg = segmentLines(bytes);
    const lens = lengths(bytes);
    if (bytes.length > OBJECT_BOUND && first + seg.length - 1 >= layout.from)
      out.problems.push({ reason: "object-too-large", seq: first, detail: `segment ${first} is ${bytes.length} bytes, over ${OBJECT_BOUND}, and holds entries from ${layout.from} on` });
    out.segments.push({ first, path, count: seg.length });
    for (const [i, line] of seg.entries()) {
      const seq = first + i;
      let stub: ChunkedLine | null;
      try {
        stub = decodeChunkedLine(line);
      } catch (e) {
        stub = null;
        out.problems.push({ reason: "chunk-mismatch", seq, detail: (e as Error).message });
        out.lines.push(`${CHUNK_MISMATCH}${seq}`);
        out.lineBytes.push(lens[i]!);
        continue;
      }
      if (!stub) {
        out.lines.push(line);
        out.lineBytes.push(lens[i]!);
        continue;
      }
      const file = files.get(entryPath(stub.seq));
      const text = file && textOf(file);
      const why =
        seq < layout.from ? `entry ${seq} is before from ${layout.from}, so it is never chunked`
        : stub.seq !== seq ? `the chunked line names entry ${stub.seq}`
        : stub.chunked.bytes <= OBJECT_BOUND ? `a line of ${stub.chunked.bytes} bytes is not over ${OBJECT_BOUND}, so it is never chunked`
        : !file ? `${entryPath(seq)} is not published`
        : file.length !== stub.chunked.bytes ? `${entryPath(seq)} is ${file.length} bytes, not ${stub.chunked.bytes}`
        : digestBytes(file) !== stub.chunked.digest ? `${entryPath(seq)} does not have the digest ${stub.chunked.digest}`
        : text === null || !text!.endsWith(`"seq":${seq}}`) ? `${entryPath(seq)} is not entry ${seq}`
        : null;
      if (why) {
        out.problems.push({ reason: "chunk-mismatch", seq, detail: why });
        out.lines.push(`${CHUNK_MISMATCH}${seq}`);
        out.lineBytes.push(stub.chunked.bytes);
      } else {
        out.lines.push(text!);
        out.lineBytes.push(file!.length);
      }
    }
  }
  if (!out.problems.some((p) => p.reason === "segment-bound")) {
    const want = segmentStarts(out.lineBytes, { layout });
    const have = out.segments.map((s) => s.first);
    const at = want.findIndex((w, k) => have[k] !== w);
    if (at >= 0 || want.length !== have.length) {
      const k = at >= 0 ? at : Math.min(want.length, have.length);
      out.problems.push({ reason: "segment-bound", seq: want[k] ?? have[k] ?? 0, detail: `segment ${k} starts at ${have[k] ?? "nothing"}; R-LOG-17 starts it at ${want[k] ?? "nothing"}` });
    }
  }
  return out;
}
