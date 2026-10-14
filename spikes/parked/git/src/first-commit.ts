/**
 * The first commit on a new canonical repository's `main` (R-GEN-12): one
 * commit with no files, made at public founding so that the room's first
 * landing has a main to land on (R-LAND-2, R-PUB-4).
 *
 * Artifacts has no call that writes a commit, and two fixed objects need no
 * sandbox, so the Room pushes them itself over git's smart HTTP protocol:
 * one `git-receive-pack` request that creates `refs/heads/main` only if it
 * does not exist (old value all zeros), with a pack of the empty tree and the
 * commit. The commit is fixed by its time (the genesis's `createdAt`), so a
 * retried founding pushes the same commit.
 */

/** The empty tree's SHA-1. */
export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ZERO = "0000000000000000000000000000000000000000";
const MAIN = "refs/heads/main";

/** Author and committer of the first commit. */
export const FIRST_COMMIT_IDENTITY = "Artroom <room@artroom.invalid>";
export const FIRST_COMMIT_MESSAGE = "Artroom: the first commit on main, with no files (public founding)\n";

const enc = new TextEncoder();

export interface LooseObject {
  readonly type: "commit" | "tree";
  readonly sha: string;
  readonly data: Uint8Array;
}

async function sha1(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes as Uint8Array<ArrayBuffer>));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function loose(type: LooseObject["type"], data: Uint8Array): Promise<LooseObject> {
  return { type, data, sha: await sha1(concat([enc.encode(`${type} ${data.length}\0`), data])) };
}

/** The first commit and its objects, for a founding at `at` (milliseconds). */
export async function firstCommit(at: number): Promise<{ readonly commit: string; readonly objects: readonly LooseObject[] }> {
  if (!Number.isFinite(at)) throw new Error("the first commit needs a time");
  const when = `${Math.floor(at / 1000)} +0000`;
  const tree = await loose("tree", new Uint8Array());
  const body = `tree ${tree.sha}\nauthor ${FIRST_COMMIT_IDENTITY} ${when}\ncommitter ${FIRST_COMMIT_IDENTITY} ${when}\n\n${FIRST_COMMIT_MESSAGE}`;
  const commit = await loose("commit", enc.encode(body));
  return { commit: commit.sha, objects: [tree, commit] };
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  // "deflate" is the zlib format, which git's pack entries use.
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A version 2 pack of whole (undeltified) objects. */
export async function packOf(objects: readonly LooseObject[]): Promise<Uint8Array> {
  const header = new Uint8Array(12);
  header.set(enc.encode("PACK"));
  const view = new DataView(header.buffer);
  view.setUint32(4, 2);
  view.setUint32(8, objects.length);
  const parts: Uint8Array[] = [header];
  for (const o of objects) {
    // Type and size: 3 type bits and the size's low 4 bits, then 7 bits a byte, low first.
    let size = o.data.length;
    const head = [((o.type === "commit" ? 1 : 2) << 4) | (size & 0x0f)];
    size >>>= 4;
    while (size > 0) {
      head[head.length - 1]! |= 0x80;
      head.push(size & 0x7f);
      size >>>= 7;
    }
    parts.push(new Uint8Array(head), await deflate(o.data));
  }
  const body = concat(parts);
  const trailer = (await sha1(body)).match(/../g)!.map((h) => parseInt(h, 16));
  return concat([body, new Uint8Array(trailer)]);
}

function pktLine(text: string): Uint8Array {
  const data = enc.encode(text);
  return concat([enc.encode((data.length + 4).toString(16).padStart(4, "0")), data]);
}

/** The body of a receive-pack request that creates `refs/heads/main` at `commit`, only if main does not exist. */
export async function firstCommitRequest(commit: string, objects: readonly LooseObject[]): Promise<Uint8Array> {
  return concat([pktLine(`${ZERO} ${commit} ${MAIN}\0report-status agent=artroom\n`), enc.encode("0000"), await packOf(objects)]);
}

/** The pkt-lines of a receive-pack report (no side band). */
export function reportLines(bytes: Uint8Array): string[] {
  const text = new TextDecoder().decode(bytes);
  const out: string[] = [];
  for (let at = 0; at + 4 <= text.length; ) {
    const n = parseInt(text.slice(at, at + 4), 16);
    if (!Number.isInteger(n)) break;
    if (n === 0) {
      at += 4;
      continue;
    }
    out.push(text.slice(at + 4, at + n).replace(/\n$/, ""));
    at += n;
  }
  return out;
}

export type FirstCommitOutcome =
  /** Main now holds the first commit. */
  | { readonly kind: "created"; readonly commit: string }
  /** The push did not apply; main may already exist. Read main to know. */
  | { readonly kind: "refused"; readonly commit: string; readonly detail: string };

/**
 * Push the first commit to `remote` (an Artifacts git remote) with a write
 * token. Any answer other than a clear "ok" is `refused`, and a transport
 * failure throws: in both cases the caller reads main to learn what holds.
 */
export async function pushFirstCommit(remote: string, token: string, at: number, fetcher: typeof fetch = fetch): Promise<FirstCommitOutcome> {
  const { commit, objects } = await firstCommit(at);
  const res = await fetcher(`${remote.replace(/\/$/, "")}/git-receive-pack`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/x-git-receive-pack-request",
      accept: "application/x-git-receive-pack-result",
    },
    body: (await firstCommitRequest(commit, objects)) as Uint8Array<ArrayBuffer>,
  });
  const lines = reportLines(new Uint8Array(await res.arrayBuffer()));
  if (res.ok && lines.includes("unpack ok") && lines.includes(`ok ${MAIN}`)) return { kind: "created", commit };
  // Never the token: only the status and git's own report.
  return { kind: "refused", commit, detail: `HTTP ${res.status}: ${lines.join("; ").slice(0, 300)}` };
}
