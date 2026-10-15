import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { afterAll, expect, test, vi } from "vitest";
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


const pkt = (line: string) => Buffer.concat([Buffer.from((Buffer.byteLength(line) + 4).toString(16).padStart(4, "0")), Buffer.from(line)]);
const isolatedAnswer = (pack: Uint8Array, before = Buffer.from("0000")) => new Response(Buffer.concat([before, pkt("NAK\n"), pack]), { headers: { "content-type": "application/x-git-upload-pack-result" } });
const onePack = (remote: string, id: string) => new Uint8Array(execFileSync("git", ["-C", remote, "pack-objects", "--stdout"], {
  input: `${id}\n`, maxBuffer: maxBytes,
  env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
}));
const isolatedWire = 64 * 1024;
const isolatedOptions = { remote: "http://127.0.0.1/repo.git", transport: "local" as const, authorization: `Bearer ${TOKEN}`, maxBytes: isolatedWire, isolateObjects: { ownedBytes: 32 * isolatedWire } };
const allowIsolation = (remote: string) => {
  git(remote, ["config", "uploadpack.allowFilter", "true"]);
  git(remote, ["config", "uploadpack.allowReachableSHA1InWant", "true"]);
};

// The HTTP adapter is a stand-in backed by real local git http-backend.
// Invariant: explicit isolated reads transfer only the wanted verified object,
// including nonadvertised tree/blob and empty shallow phases, never ancestry.
test("isolated upload-pack reads one commit, root and blob without unrelated history or a large sibling", async () => {
  const remote = bare(); allowIsolation(remote);
  const content = put(remote, "blob", "selected\n");
  const large = put(remote, "blob", "large unrelated body\n".repeat(100_000));
  const root = put(remote, "tree", Buffer.concat([Buffer.from("100644 other\0"), Buffer.from(large, "hex"), Buffer.from("100755 selected\0"), Buffer.from(content, "hex")]));
  const first = put(remote, "commit", commitText(root, [], "root"));
  let head = first;
  for (let n = 0; n < 40; n++) head = put(remote, "commit", commitText(root, [head], `history ${n}`));
  setRef(remote, REF, head);
  const host = new Host(remote, TOKEN), seen: { body: string; bytes: number; objects: number; prefix: string }[] = [];
  const source = new SmartHttpSource({ ...isolatedOptions, fetch: async request => {
    const body = await request.clone().text();
    const response = await host.upstream(request);
    if (request.method !== "POST") return response;
    const raw = Buffer.from(await response.arrayBuffer()), start = raw.indexOf("PACK");
    seen.push({ body, bytes: raw.length, objects: start < 0 ? -1 : raw.readUInt32BE(start + 8), prefix: raw.subarray(0, start).toString("ascii") });
    return new Response(raw, { status: response.status, headers: response.headers });
  } });
  const reader = new Reader(source);
  expect(await reader.commit(head)).toMatchObject({ id: head, tree: root });
  expect((await reader.tree(root)).map(row => [new TextDecoder().decode(row.name), row.mode, row.id])).toEqual([["other", "100644", large], ["selected", "100755", content]]);
  expect(new TextDecoder().decode(await reader.blob(content))).toBe("selected\n");
  expect((await reader.commit(first)).parents).toEqual([]);
  expect(seen).toHaveLength(4);
  expect(seen.every(read => read.objects === 1 && read.body.includes("deepen 1\n") && read.body.includes("filter tree:0\n"))).toBe(true);
  expect(seen.reduce((n, read) => n + read.bytes, 0)).toBeLessThan(5000);
  expect(seen.slice(1, 3).every(read => read.prefix.startsWith("0000"))).toBe(true);
  // This unchanged full-mode request needs the large sibling and fails its
  // own byte allowance. Isolation does not turn the head into a closure.
  const { isolateObjects: _isolated, ...fullOptions } = isolatedOptions;
  const full = new SmartHttpSource({ ...fullOptions, fetch: host.upstream });
  await expect(new Reader(full).commit(head)).rejects.toMatchObject({ reason: "too-large" });
});

test("isolation refuses absent capabilities and tip-only permission before a POST", async () => {
  const { remote, tree2, head } = repository();
  const host = new Host(remote, TOKEN); let posts = 0;
  const fetch = async (request: Request) => { if (request.method === "POST") posts++; return host.upstream(request); };
  await expect(new Reader(new SmartHttpSource({ ...isolatedOptions, fetch })).commit(head)).rejects.toMatchObject({ reason: "unreadable", what: "isolated object capabilities" });
  expect(posts).toBe(0);
  git(remote, ["config", "uploadpack.allowFilter", "true"]);
  git(remote, ["config", "uploadpack.allowTipSHA1InWant", "true"]);
  await expect(new Reader(new SmartHttpSource({ ...isolatedOptions, fetch })).tree(tree2)).rejects.toMatchObject({ reason: "unreadable", what: "unadvertised want" });
  expect(posts).toBe(0);
});

test("isolated framing and pack guards refuse before inflation or cache retention", async () => {
  const { remote, head, blob2 } = repository(); allowIsolation(remote);
  const host = new Host(remote, TOKEN), single = onePack(remote, head), blobPack = onePack(remote, blob2);
  const readerFor = (answer: () => Response) => new Reader(new SmartHttpSource({ ...isolatedOptions, fetch: request => request.method === "POST" ? Promise.resolve(answer()) : host.upstream(request) }));
  for (const before of [pkt(`shallow ${"f".repeat(40)}\n`), Buffer.concat([pkt(`shallow ${head}\n`), pkt(`shallow ${head}\n`), Buffer.from("0000")]), Buffer.concat([pkt(`unshallow ${head}\n`), Buffer.from("0000")])]) {
    await expect(readerFor(() => isolatedAnswer(single, before)).commit(head)).rejects.toBeInstanceOf(GitRefusal);
  }
  // Missing shallow flush and a host ignoring filters both refuse. The
  // multiple-object pack's invalid body cannot reach an inflater.
  await expect(readerFor(() => isolatedAnswer(single, Buffer.alloc(0))).commit(head)).rejects.toMatchObject({ reason: "unreadable" });
  const extra = Buffer.alloc(32); extra.write("PACK"); extra.writeUInt32BE(2, 4); extra.writeUInt32BE(2, 8);
  await expect(readerFor(() => isolatedAnswer(extra)).commit(head)).rejects.toMatchObject({ reason: "too-large", what: "pack objects" });
  await expect(readerFor(() => isolatedAnswer(blobPack)).commit(head)).rejects.toMatchObject({ reason: "unreadable", what: "wanted object omitted" });
  await expect(readerFor(() => isolatedAnswer(blobPack)).commit(blob2)).rejects.toMatchObject({ reason: "wrong-type" });
  await expect(readerFor(() => new Response(new Uint8Array(isolatedWire + 1), { headers: { "content-type": "application/x-git-upload-pack-result" } })).commit(head)).rejects.toMatchObject({ reason: "too-large", what: "read bytes" });
  await expect(readerFor(() => isolatedAnswer(blobPack, Buffer.concat([pkt(`shallow ${blob2}\n`), Buffer.from("0000")]))).blob(blob2)).rejects.toMatchObject({ reason: "unreadable", what: "isolated shallow object" });
  // The caller's allowance is tested before even malformed zlib bytes are
  // examined, using the real Git header's declared inflated size.
  const damaged = new Uint8Array(blobPack); damaged[16] = damaged[16]! ^ 255;
  await expect(decodePack(damaged, { maxBytes, singleObjectBytes: 1 })).rejects.toMatchObject({ reason: "too-large", what: "isolated object allowance" });
  const tag = put(remote, "tag", `object ${head}\ntype commit\ntag example\ntagger Test <test@artroom.invalid> 1700000000 +0000\n\nTag.\n`);
  const tagPack = onePack(remote, tag);
  expect((await decodePack(tagPack, { maxBytes }))[0]?.type).toBe("tag");
  await expect(decodePack(tagPack, { maxBytes, singleObjectBytes: maxBytes })).rejects.toMatchObject({ reason: "wrong-type", what: "isolated pack entry" });
});

test("isolated in-flight and caller-owned copies consume one source allowance without concurrent borrowing", async () => {
  const remote = bare(); allowIsolation(remote);
  const body = Buffer.from("bounded output");
  const id = put(remote, "blob", body), root = put(remote, "tree", Buffer.concat([Buffer.from("100644 file\0"), Buffer.from(id, "hex")]));
  setRef(remote, REF, put(remote, "commit", commitText(root, [], "root")));
  const host = new Host(remote, TOKEN);
  let release!: () => void, began!: () => void;
  const opened = new Promise<void>(resolve => { began = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  const source = new SmartHttpSource({ ...isolatedOptions, isolateObjects: { ownedBytes: 16 * isolatedWire + 2 * body.length }, fetch: async request => {
    requests++; if (requests === 1) { began(); await held; } return host.upstream(request);
  } });
  const first = source.object(id, body.length); await opened;
  await expect(source.object(id, body.length)).rejects.toMatchObject({ reason: "too-large", what: "concurrent isolated read" });
  expect(requests).toBe(1); release();
  const read = await first; expect(read.data).toEqual(new Uint8Array(body)); read.data!.fill(0);
  expect((await source.object(id, body.length)).data).toEqual(new Uint8Array(body));
  await expect(source.object(id, body.length)).rejects.toMatchObject({ reason: "too-large", what: "isolated working payload" });
  expect(requests).toBe(2); // one advertisement and one POST; no hidden retry
});


// No wall-clock wait: the test moves the clock at an actual response boundary.
test("an isolated operation cannot renew its deadline between advertisement and object fetch", async () => {
  const { remote, head } = repository(); allowIsolation(remote);
  const host = new Host(remote, TOKEN); let posts = 0, now = Date.now();
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const source = new SmartHttpSource({ ...isolatedOptions, timeoutMs: 10_000, fetch: async request => {
      if (request.method === "POST") posts++;
      const response = await host.upstream(request); now += 10_001; return response;
    } });
    await expect(new Reader(source).commit(head)).rejects.toMatchObject({ reason: "unreadable" });
    expect(posts).toBe(0);
  } finally { clock.mockRestore(); }
});


// Both are standard streams whose cancellation work never settles. The
// fake clock advances the deadline; no wall-clock sleep or cleanup drain
// is inferred. One source may retain one abandoned operation, never more.
test("isolated deadlines return despite pending read/refusal cancellation and permanently refuse source reuse", async () => {
  const { remote, head } = repository(); allowIsolation(remote);
  const host = new Host(remote, TOKEN);
  const ad = await host.upstream(new Request("http://127.0.0.1/repo.git/info/refs?service=git-upload-pack", { headers: { authorization: `Bearer ${TOKEN}` } }));
  const advertisement = await ad.arrayBuffer();
  vi.useFakeTimers();
  try {
    for (const status of [403, 200]) {
      let requests = 0, cancels = 0, posted!: () => void, signal: AbortSignal | undefined;
      const began = new Promise<void>(resolve => { posted = resolve; });
      const never = new Promise<void>(() => undefined);
      const body = new ReadableStream<Uint8Array>({ pull: () => never, cancel: () => { cancels++; return never; } });
      const source = new SmartHttpSource({ ...isolatedOptions, timeoutMs: 100, fetch: async request => {
        requests++;
        if (request.method === "GET") return new Response(advertisement, { headers: ad.headers });
        signal = request.signal; posted();
        return new Response(body, { status, headers: { "content-type": "application/x-git-upload-pack-result" } });
      } });
      let settled = false;
      const outcome = source.object(head, maxBytes).then(() => "unexpected success", error => error).finally(() => { settled = true; });
      await began;
      await vi.advanceTimersByTimeAsync(101);
      expect(settled).toBe(true);
      expect(await outcome).toMatchObject({ reason: "unreadable", what: "isolated read deadline" });
      expect(cancels).toBe(1);
      expect(signal?.aborted).toBe(true);
      for (const again of [() => source.object(head, maxBytes), () => source.ref(REF), () => source.refs("refs/heads/", 10)]) {
        await expect(again()).rejects.toMatchObject({ reason: "unreadable", what: "isolated source abandoned" });
      }
      expect(requests).toBe(2); // no hidden retry, cache result or new reservation
    }
  } finally { vi.useRealTimers(); }
});

// A valid response may arrive after an upstream ignored abort. Cancellation
// may also finish late. Neither continuation restores the source's capacity.
test("isolated abandonment survives late fetch and cleanup settlement without consuming the late body", async () => {
  const { remote, head } = repository(); allowIsolation(remote);
  const host = new Host(remote, TOKEN);
  const ad = await host.upstream(new Request("http://127.0.0.1/repo.git/info/refs?service=git-upload-pack", { headers: { authorization: `Bearer ${TOKEN}` } }));
  const advertisement = await ad.arrayBuffer();
  const answer = new Uint8Array(await isolatedAnswer(onePack(remote, head)).arrayBuffer());
  vi.useFakeTimers();
  try {
    for (const late of ["fetch", "cleanup"]) {
      let requests = 0, pulls = 0, cancels = 0, posted!: () => void, release!: () => void;
      const began = new Promise<void>(resolve => { posted = resolve; });
      const held = new Promise<void>(resolve => { release = resolve; });
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { pulls++; controller.enqueue(answer); controller.close(); },
        cancel() { cancels++; return held; },
      }, { highWaterMark: 0 });
      const source = new SmartHttpSource({ ...isolatedOptions, timeoutMs: 100, fetch: async request => {
        requests++;
        if (request.method === "GET") return new Response(advertisement, { headers: ad.headers });
        posted();
        if (late === "fetch") await held;
        return new Response(body, { status: late === "fetch" ? 200 : 403, headers: { "content-type": "application/x-git-upload-pack-result" } });
      } });
      let settled = false;
      const outcome = source.object(head, maxBytes).then(() => "unexpected success", error => error).finally(() => { settled = true; });
      await began;
      await vi.advanceTimersByTimeAsync(101);
      expect(settled).toBe(true);
      expect(await outcome).toMatchObject({ reason: "unreadable", what: "isolated read deadline" });
      release();
      await vi.advanceTimersByTimeAsync(0); // flush the actual late continuation
      expect(pulls).toBe(0);
      expect(cancels).toBe(1);
      for (const again of [() => source.object(head, maxBytes), () => source.ref(REF), () => source.refs("refs/heads/", 10)]) {
        await expect(again()).rejects.toMatchObject({ reason: "unreadable", what: "isolated source abandoned" });
      }
      expect(requests).toBe(2);
    }
  } finally { vi.useRealTimers(); }
});
