import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { afterAll, expect, test } from "vitest";
import { decodePack, SmartHttpSource } from "../src/http-read.ts";
import { GitRefusal } from "../src/names.ts";
import { Reader } from "../src/reader.ts";
import { Host } from "./support/host.ts";
import { bare, cleanup, commitText, git, put, setRef } from "./support/repo.ts";

afterAll(cleanup);
const TOKEN = "read-private-token";
const REF = "refs/heads/main";
const maxBytes = 1_000_000; // this fixture's caller allowance, not a platform quota
const options = { maxBytes };

function repository() {
  const remote = bare();
  const expected = new Map<string, { type: "commit" | "tree" | "blob"; data: Uint8Array }>();
  const write = (type: "commit" | "tree" | "blob", data: Uint8Array): string => {
    const id = put(remote, type, data); // independent Node SHA-1 fixture names
    expected.set(id, { type, data: new Uint8Array(data) });
    return id;
  };
  const common = Array.from({ length: 1000 }, (_, i) => `line-${i.toString().padStart(4, "0")} predictable material for Git delta compression\n`).join("");
  const blob1 = write("blob", Buffer.from(common));
  const blob2 = write("blob", Buffer.from(common.replace("line-0500", "edit-0500")));
  const tree1 = write("tree", Buffer.concat([Buffer.from("100644 file\0"), Buffer.from(blob1, "hex")]));
  const tree2 = write("tree", Buffer.concat([Buffer.from("100644 file\0"), Buffer.from(blob2, "hex")]));
  const base = write("commit", Buffer.from(commitText(tree1, [], "base")));
  const head = write("commit", Buffer.from(commitText(tree2, [base], "head")));
  setRef(remote, REF, head);
  return { remote, expected, head, tree2, blob2 };
}

function pack(remote: string, head: string, ofs: boolean): Uint8Array {
  return new Uint8Array(execFileSync("git", ["-C", remote, "pack-objects", "--stdout", "--revs", "--window=10", "--depth=10", ...(ofs ? ["--delta-base-offset"] : [])], {
    input: `${head}\n`, maxBuffer: maxBytes,
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }));
}

/** Independent Node zlib boundary oracle confirms the real Git pack kinds. */
function kinds(pack: Uint8Array): number[] {
  const found: number[] = [];
  let at = 12;
  const count = new DataView(pack.buffer, pack.byteOffset).getUint32(8);
  for (let i = 0; i < count; i++) {
    let b = pack[at++]!;
    const kind = (b >>> 4) & 7;
    while ((b & 128) !== 0) b = pack[at++]!;
    if (kind === 7) at += 20;
    if (kind === 6) { do { b = pack[at++]!; } while ((b & 128) !== 0); }
    // Node's typings omit the info:true overload that returns its engine.
    const raw = inflateSync(pack.subarray(at), { info: true }) as unknown as { engine: { bytesWritten: number } };
    at += raw.engine.bytesWritten;
    found.push(kind);
  }
  return found;
}

// Invariant: actual local Git's upload response becomes exact objects for
// the production Reader, including real OFS/REF deltas; refs establish
// absence, but denied, corrupt or failed object reads never imply absence.
// Host is a local HTTP stand-in backed by real git http-backend. No deployed
// Worker or hosted provider runs here.
test("Web upload-pack reads exact local Git closure and empty refs, and decodes both real Git delta encodings", async () => {
  const { remote, expected, head, tree2, blob2 } = repository();
  const host = new Host(remote, TOKEN);
  const requests: { method: string; url: string; redirect: string; credentials: string; body: string }[] = [];
  let posts = 0;
  const source = new SmartHttpSource({ remote: "http://127.0.0.1/repo.git", transport: "local", authorization: `Bearer ${TOKEN}`, maxBytes, fetch: async (request) => {
    requests.push({ method: request.method, url: request.url, redirect: request.redirect, credentials: request.credentials, body: await request.clone().text() });
    if (request.method === "POST") posts++;
    return host.upstream(request);
  } });
  const reader = new Reader(source);
  expect(await reader.snapshot("refs/heads/")).toEqual([{ ref: REF, target: head }]);
  expect(await reader.ref("refs/heads/absent")).toBeNull();
  expect(await reader.closure(head)).toEqual({ complete: true, objects: expected.size });
  expect(posts).toBe(1); // trees, blobs and ancestors come from the verified pack
  for (const [id, object] of expected) expect(await reader.object(id, object.type)).toEqual(object.data);
  const owned = await source.object(blob2, maxBytes);
  owned.data!.fill(0);
  expect(await reader.blob(blob2)).toEqual(expected.get(blob2)!.data);
  expect(await source.object(blob2, 0)).toEqual({ type: "blob", size: expected.get(blob2)!.data.length, data: null });
  expect(requests.filter((r) => r.method === "POST").map((r) => r.body)).toEqual([`003cwant ${head} ofs-delta\n00000009done\n`]);
  expect(requests.every((r) => r.redirect === "manual" && r.credentials === "omit" && !r.url.includes(TOKEN) && !r.body.includes(TOKEN))).toBe(true);
  expect(JSON.stringify(source).includes(TOKEN)).toBe(false);

  // A fresh reader wants a nonadvertised exact tree/blob only when real Git
  // advertises its reachable-object allowance; no ref or ID is substituted.
  git(remote, ["config", "uploadpack.allowReachableSHA1InWant", "true"]);
  const exact = () => new Reader(new SmartHttpSource({ remote: "http://127.0.0.1/repo.git", transport: "local", authorization: `Bearer ${TOKEN}`, maxBytes, fetch: host.upstream }));
  expect(await exact().object(tree2, "tree")).toEqual(expected.get(tree2)!.data);
  expect(await exact().blob(blob2)).toEqual(expected.get(blob2)!.data);
  await expect(exact().blob("f".repeat(40))).rejects.toMatchObject({ reason: "unreadable" });
  const empty = new Host(bare(), TOKEN);
  const emptySource = new SmartHttpSource({ remote: "http://127.0.0.1/repo.git", transport: "local", authorization: `Bearer ${TOKEN}`, maxBytes, fetch: empty.upstream });
  expect(await emptySource.ref(REF)).toBeNull();
  expect(await emptySource.refs("refs/heads/", 1)).toEqual([]);
  await expect(emptySource.object(head, maxBytes)).rejects.toMatchObject({ reason: "unreadable" });

  // The decoder boundary gets two packs made by actual Git, not by our
  // encoder. Node zlib independently confirms that each contains a delta.
  for (const ofs of [true, false]) {
    const bytes = pack(remote, head, ofs);
    expect(kinds(bytes)).toContain(ofs ? 6 : 7);
    const decoded = await decodePack(bytes, options);
    expect(new Map(decoded.map((o) => [o.id, { type: o.type, data: o.data }]))).toEqual(expected);
    const local = bare();
    git(local, ["index-pack", "--stdin"], bytes);
    expect(git(local, ["cat-file", "--batch-check"], [...expected.keys()].map((id) => `${id}\n`).join("")))
      .toBe([...expected].map(([id, o]) => `${id} ${o.type} ${o.data.length}`).join("\n"));
  }
});

// Invariant: a bad pack checksum or exhausted byte allowance cannot enter
// the source's cache or count as missing. This also supplies one checksum
// control at the cheapest pack boundary, using actual Git's bytes.
test("Web pack reads reject corruption and bounds, and HTTP failures keep no guessed absence or partial cache", async () => {
  const { remote, head, expected } = repository();
  const bytes = pack(remote, head, true);
  const corrupt = new Uint8Array(bytes);
  corrupt[corrupt.length - 1]! ^= 1;
  const refused = await decodePack(corrupt, options).then(() => null, (e: unknown) => e instanceof GitRefusal ? { reason: e.reason, what: e.what } : { unexpected: true });
  expect(refused).toEqual({ reason: "hash-mismatch", what: "pack trailer" });
  await expect(decodePack(bytes, { maxBytes: 32 })).rejects.toMatchObject({ reason: "too-large" });
  const host = new Host(remote, TOKEN);
  let broken = true;
  let posts = 0;
  const source = new SmartHttpSource({ remote: "http://127.0.0.1/repo.git", transport: "local", authorization: `Bearer ${TOKEN}`, maxBytes, fetch: async (request) => {
    const response = await host.upstream(request);
    if (request.method !== "POST") return response;
    posts++;
    const data = new Uint8Array(await response.arrayBuffer());
    if (broken) data[data.length - 1]! ^= 1;
    return new Response(data, { status: response.status, headers: response.headers });
  } });
  await expect(source.object(head, maxBytes)).rejects.toMatchObject({ reason: "hash-mismatch" });
  broken = false;
  expect((await source.object(head, maxBytes)).data).toEqual(expected.get(head)!.data);
  expect(posts).toBe(2); // explicit second read, no internal retry or partial cache
  const failed = new SmartHttpSource({ remote: "https://git.example.invalid/repo.git", maxBytes, fetch: () => Promise.reject(new Error(TOKEN)) });
  await expect(failed.object(head, maxBytes)).rejects.toMatchObject({ reason: "unreadable", message: "unreadable: HTTP read request" });
  await expect(failed.ref(REF)).rejects.toMatchObject({ reason: "unreadable" });
});
