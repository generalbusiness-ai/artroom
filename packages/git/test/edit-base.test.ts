import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { afterAll, expect, test, vi } from "vitest";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { editTree } from "../../platform/src/destination-objects.ts";
import { readEditBase, type EditBaseAllowance } from "../src/edit-base.ts";
import { SmartHttpSource } from "../src/http-read.ts";
import { Host } from "./support/host.ts";
import { bare, cleanup, commitText, git, put, setRef } from "./support/repo.ts";

afterAll(cleanup);
const wire = 64 * 1024, sourceBytes = 64 * wire;
const transport = { remote: "http://127.0.0.1/repo.git", transport: "local" as const, maxBytes: wire, authorization: "Bearer fixture", isolateObjects: { ownedBytes: sourceBytes } };
const allowance = (change: Partial<EditBaseAllowance> = {}): EditBaseAllowance => {
  const a = { objects: 32, bytes: wire, pathBytes: wire, depth: 64, ...change };
  return { ...a, ownedBytes: change.ownedBytes ?? sourceBytes + 5 * a.bytes + 8 * a.pathBytes };
};
const raw = (repo: string, kind: string, id: string) => new Uint8Array(execFileSync("git", ["-C", repo, "cat-file", kind, id], { env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }));

function fixture() {
  const repo = bare();
  const blob = put(repo, "blob", "old\n"), big = put(repo, "blob", "unrelated\n".repeat(300_000));
  const tree = (rows: readonly [string, string, string | Uint8Array][]) => git(repo, ["mktree", "-z"], Buffer.concat(rows.map(([mode, id, name]) => Buffer.concat([
    Buffer.from(`${mode} ${mode === "040000" ? "tree" : mode === "160000" ? "commit" : "blob"} ${id}\t`), typeof name === "string" ? Buffer.from(name) : name, Buffer.from([0]),
  ]))));
  const nested = tree([["100644", blob, "page"]]);
  const dir = tree([["040000", nested, "nested"], ["100755", blob, "run"]]);
  const unrelated = tree([["100644", big, "huge"]]);
  const origin = put(repo, "commit", commitText(unrelated, [], "origin"));
  const root = tree([["040000", dir, "dir"], ["100644", blob, "file"], ["120000", blob, "link"], ["160000", origin, "module"], ["040000", unrelated, "unrelated"], ["100644", blob, new Uint8Array([255])]]);
  let head = origin;
  for (let i = 0; i < 30; i++) head = put(repo, "commit", commitText(root, [head], `history${i}`));
  setRef(repo, "refs/heads/main", head);
  git(repo, ["config", "uploadpack.allowFilter", "true"]);
  git(repo, ["config", "uploadpack.allowReachableSHA1InWant", "true"]);
  const wanted = [head, root, dir, nested];
  const paths = ["dir/run", "dir/nested/page", "new/deep/file"];
  const open = () => {
    const requests: string[] = [], host = new Host(repo, "fixture");
    const source = new SmartHttpSource({ ...transport, fetch: async request => {
      if (request.method === "POST") requests.push(/want ([0-9a-f]{40})/.exec(await request.clone().text())![1]!);
      return host.upstream(request);
    } });
    return { source, requests };
  };
  return { repo, head, root, dir, nested, blob, big, unrelated, origin, wanted, paths, open };
}

// Real local git http-backend, through a labelled HTTP adapter stand-in.
// The platform import is test-only: production Git has no platform dependency.
test("partial edit base requests exactly shared ancestor trees and existing editor output reads back in real Git", async () => {
  const f = fixture(), { source, requests } = f.open();
  const payload = f.wanted.reduce((sum, id, i) => sum + raw(f.repo, i === 0 ? "commit" : "tree", id).length, 0);
  const partial = await readEditBase(source, "sha1", f.head, f.paths, allowance({ bytes: payload, objects: 4 }));
  expect(partial.coverage).toBe("edit-paths");
  expect(partial.tree).toBe(f.root);
  expect(requests).toEqual(f.wanted);
  expect(partial.objects.map(o => o.id)).toEqual(f.wanted);
  expect(requests).not.toContain(f.blob);
  expect(requests).not.toContain(f.big);
  expect(requests).not.toContain(f.unrelated);
  expect(requests).not.toContain(f.origin);
  const files = f.paths.map(path => ({ path, bytes: utf8("new:" + path + "\n") }));
  const held = new Map(partial.objects.map(o => [o.id, o]));
  const built = editTree("sha1", id => held.get(id) ?? null, f.head, files)!;
  const all = editTree("sha1", id => {
    const kind = git(f.repo, ["cat-file", "-t", id]) as "commit" | "tree" | "blob";
    return { id, kind, body: raw(f.repo, kind, id) };
  }, f.head, files)!;
  expect(built.tree).toBe(all.tree);
  for (const object of built.objects) expect(put(f.repo, object.kind, object.body)).toBe(object.id);
  expect(git(f.repo, ["ls-tree", built.tree, "dir"])).toContain("040000 tree");
  expect(git(f.repo, ["ls-tree", "-r", built.tree, "dir/run"])).toContain("100755 blob");
  for (const file of files) expect(git(f.repo, ["show", `${built.tree}:${file.path}`])).toBe("new:" + file.path);
  expect(git(f.repo, ["rev-parse", `${built.tree}:unrelated`])).toBe(f.unrelated);
  const rootBody = raw(f.repo, "tree", built.tree);
  expect(Buffer.from(rootBody).includes(Buffer.concat([Buffer.from("100644 "), Buffer.from([255, 0]), Buffer.from(f.blob, "hex")]))).toBe(true);
});

test("partial edit path cohort, ownership, Unicode, format and work bounds refuse before I/O", async () => {
  let fetches = 0;
  const source = new SmartHttpSource({ ...transport, fetch: async () => { fetches++; throw new Error("must not fetch"); } });
  const base = "a".repeat(40);
  for (const paths of [[""], ["a//b"], [".Git/x"], ["x/\0y"], ["x/\uD800"], ["é".repeat(513)], ["x", "x"], ["x", "x/y"], ["x/y", "x"], Array.from({ length: 65 }, (_, i) => String(i))]) {
    const outcome = await readEditBase(source, "sha1", base, paths, allowance()).then(() => "unexpected success", error => error);
    expect(fetches).toBe(0);
    expect(outcome).toMatchObject({ reason: expect.stringMatching(/bad-path|path-conflict/) });
  }
  await expect(readEditBase(source, "sha256", base, ["x"], allowance())).rejects.toMatchObject({ reason: "unsupported-object-format" });
  await expect(readEditBase(source, "sha1", base, ["a/b"], allowance({ depth: 1 }))).rejects.toMatchObject({ what: "edit path depth" });
  await expect(readEditBase(source, "sha1", base, ["é"], allowance({ pathBytes: 1 }))).rejects.toMatchObject({ what: "edit path bytes" });
  const a = allowance();
  await expect(readEditBase(source, "sha1", base, ["x"], { ...a, ownedBytes: a.ownedBytes - 1 })).rejects.toMatchObject({ what: "edit base owned payload" });
  const { isolateObjects: _mode, ...full } = transport;
  await expect(readEditBase(new SmartHttpSource({ ...full, fetch: async () => { fetches++; throw new Error("must not fetch"); } }), "sha1", base, ["x"], a)).rejects.toMatchObject({ what: "isolated edit source required" });
  expect(fetches).toBe(0);
});

test("partial edit traversal refuses symlinks, gitlinks and file-folder conflicts without reading leaf bodies", async () => {
  const f = fixture();
  for (const path of ["link/x", "module/x", "file/x", "dir", "link", "module"]) {
    const { source, requests } = f.open();
    await expect(readEditBase(source, "sha1", f.head, [path], allowance())).rejects.toMatchObject({ reason: "path-conflict" });
    expect(requests).toEqual([f.head, f.root]);
  }
});

test("partial edit object and payload exhaustion refuse whole before an extra request or success", async () => {
  const f = fixture();
  const counted = f.open();
  await expect(readEditBase(counted.source, "sha1", f.head, f.paths, allowance({ objects: 3 }))).rejects.toMatchObject({ what: "edit base objects" });
  expect(counted.requests).toEqual(f.wanted.slice(0, 3));
  const payload = f.wanted.reduce((sum, id, i) => sum + raw(f.repo, i === 0 ? "commit" : "tree", id).length, 0);
  const sized = f.open();
  await expect(readEditBase(sized.source, "sha1", f.head, f.paths, allowance({ bytes: payload - 1 }))).rejects.toMatchObject({ reason: "too-large" });
  expect(sized.requests).toEqual(f.wanted);
});

const pkt = (s: string) => Buffer.concat([Buffer.from((Buffer.byteLength(s) + 4).toString(16).padStart(4, "0")), Buffer.from(s)]);
// Independent Node pack encoder for explicitly synthetic malformed-object cases.
function response(kind: "commit" | "tree", body: Uint8Array) {
  let size = body.length;
  const header = [((kind === "commit" ? 1 : 2) << 4) | (size & 15)]; size = Math.floor(size / 16);
  while (size > 0) { header[header.length - 1]! |= 128; header.push(size & 127); size = Math.floor(size / 128); }
  const pack = Buffer.concat([Buffer.from("5041434b0000000200000001", "hex"), Buffer.from(header), deflateSync(body)]);
  return new Response(Buffer.concat([Buffer.from("0000"), pkt("NAK\n"), pack, createHash("sha1").update(pack).digest()]), { headers: { "content-type": "application/x-git-upload-pack-result" } });
}
const idOf = (kind: string, body: Uint8Array) => createHash("sha1").update(Buffer.concat([Buffer.from(`${kind} ${body.length}\0`), body])).digest("hex");
const ad = (head: string) => new Response(Buffer.concat([pkt("# service=git-upload-pack\n"), Buffer.from("0000"), pkt(`${head} refs/heads/main\0shallow filter allow-reachable-sha1-in-want\n`), Buffer.from("0000")]), { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });

test("partial edit cannot treat corrupt, malformed, missing or denied selected objects as absent paths", async () => {
  const row = (name: string) => Buffer.concat([Buffer.from(`100644 ${name}\0`), Buffer.alloc(20, 1)]);
  for (const fault of ["duplicate", "out-of-order", "malformed", "denied", "missing", "wrong-type", "corrupt"] as const) {
    const tree = fault === "duplicate" ? Buffer.concat([row("x"), row("x")]) : fault === "out-of-order" ? Buffer.concat([row("z"), row("a")]) : fault === "malformed" ? Buffer.from("bad tree") : Buffer.concat([row("x")]);
    const root = idOf("tree", tree), commit = utf8(commitText(root, [], "synthetic"));
    const head = fault === "wrong-type" ? root : idOf("commit", commit);
    const source = new SmartHttpSource({ ...transport, fetch: async request => {
      if (request.method === "GET") return ad(head);
      const want = /want ([0-9a-f]{40})/.exec(await request.text())![1]!;
      if (fault === "wrong-type") return response("tree", tree);
      if (want === head) return response("commit", commit);
      if (fault === "denied") return new Response(null, { status: 403 });
      if (fault === "missing") return response("commit", commit);
      if (fault === "corrupt") { const result = new Uint8Array(await response("tree", tree).arrayBuffer()); result[result.length - 1]! ^= 1; return new Response(result, { headers: { "content-type": "application/x-git-upload-pack-result" } }); }
      return response("tree", tree);
    } });
    await expect(readEditBase(source, "sha1", head, ["x"], allowance())).rejects.toMatchObject({ reason: expect.stringMatching(/malformed-tree|unreadable|wrong-type|hash-mismatch/) });
  }
});

test("partial edit timeout and concurrent acquisition return no partial base and source stays terminal", async () => {
  const tree = utf8(""), root = idOf("tree", tree), commit = utf8(commitText(root, [], "synthetic")), head = idOf("commit", commit);
  let treeRequests = 0, posted!: () => void;
  const began = new Promise<void>(resolve => { posted = resolve; });
  const never = new Promise<void>(() => undefined);
  const source = new SmartHttpSource({ ...transport, timeoutMs: 100, fetch: async request => {
    if (request.method === "GET") return ad(head);
    if (/want ([0-9a-f]{40})/.exec(await request.text())![1] === head) return response("commit", commit);
    treeRequests++; posted();
    return new Response(new ReadableStream({ pull: () => never, cancel: () => never }), { headers: { "content-type": "application/x-git-upload-pack-result" } });
  } });
  vi.useFakeTimers();
  try {
    let settled = false;
    const outcome = readEditBase(source, "sha1", head, ["x"], allowance()).then(() => "unexpected success", error => error).finally(() => { settled = true; });
    await began;
    await expect(readEditBase(source, "sha1", head, ["y"], allowance())).rejects.toMatchObject({ what: "concurrent edit base" });
    await vi.advanceTimersByTimeAsync(101);
    expect(settled).toBe(true);
    expect(await outcome).toMatchObject({ what: "isolated read deadline" });
    await expect(readEditBase(source, "sha1", head, ["x"], allowance())).rejects.toMatchObject({ what: "isolated source abandoned" });
    expect(treeRequests).toBe(1);
  } finally { vi.useRealTimers(); }
});
