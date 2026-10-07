import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { decodePack, SmartHttpSource } from "../src/http-read.ts";
import { GitRefusal } from "../src/names.ts";
import { Reader } from "../src/reader.ts";

// The answers of the hosting's own Git service, captured live by the planner (fixtures/own-host/README.md): its ref
// advertisement, the request body our client sent, and its upload-pack answer, which is NAK, a pack, and then one flush packet
// after the pack's trailer. The fetch below replays those bytes; no service runs.

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/own-host/${name}`, import.meta.url)));
const REMOTE = "https://service.invalid/git/artroom-demo/repo-1.git";
const HEAD = "517e108199a4c292e6f7e2457493828600ae0986";
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const maxBytes = 1_000_000; // this fixture's caller allowance, not a platform quota
const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const refusal = (e: unknown) => (e instanceof GitRefusal ? { reason: e.reason, what: e.what } : { unexpected: String(e) });

function replay() {
  const sent: string[] = [];
  const fetch = async (request: Request): Promise<Response> => {
    if (request.method === "GET" && request.url === `${REMOTE}/info/refs?service=git-upload-pack`) {
      return new Response(fixture("info-refs.bin"), { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
    }
    if (request.method === "POST" && request.url === `${REMOTE}/git-upload-pack`) {
      sent.push(ascii(new Uint8Array(await request.arrayBuffer())));
      return new Response(fixture("upload-pack.bin"), { headers: { "content-type": "application/x-git-upload-pack-result" } });
    }
    return new Response("unscripted", { status: 404 });
  };
  return { sent, source: new SmartHttpSource({ remote: REMOTE, maxBytes, authorization: "Bearer replayed", fetch }) };
}

// Invariant: a pack is read by its own structure, so the flush packet that the service sends after the trailer is no pack
// byte, and the commit and its tree are read.
test("own host, captured answers: the founding commit 517e108 and its empty tree are read, though the upload-pack answer ends with a flush packet after the pack", async () => {
  const { sent, source } = replay();
  const reader = new Reader(source);
  expect(await reader.ref("refs/heads/main")).toBe(HEAD);
  // A refusal is an asserted value here, so that a refused pack fails this test by its assertion.
  expect(await reader.commit(HEAD).catch(refusal)).toEqual({ id: HEAD, tree: EMPTY_TREE, parents: [] });
  expect(await reader.tree(EMPTY_TREE).catch(refusal)).toEqual([]);
  // The request asked for no capability: no side-band was asked, so none is read.
  expect(sent).toEqual([ascii(fixture("request-v0.bin"))]);
});

// Invariant: only one flush packet may follow the trailer, and only where the caller allows it; a short or corrupt pack is
// still refused by name.
test("pack structure: one flush packet after the trailer is read only where allowed; other trailing bytes, a short pack and a bad trailer are refused by name", async () => {
  const answer = fixture("upload-pack.bin");
  const withFlush = answer.subarray(8);                // after `0008NAK\n`
  const pack = withFlush.subarray(0, withFlush.length - 4);
  expect(ascii(withFlush.subarray(withFlush.length - 4))).toBe("0000");
  expect((await decodePack(pack, { maxBytes })).map((o) => o.id).sort()).toEqual([EMPTY_TREE, HEAD].sort());
  expect((await decodePack(withFlush, { maxBytes, flushAfter: true })).length).toBe(2);
  const cases: [Uint8Array, boolean, { reason: string; what: string }][] = [
    [withFlush, false, { reason: "unreadable", what: "pack trailing data" }],
    [Uint8Array.from([...pack, 0x30, 0x30, 0x30, 0x31]), true, { reason: "unreadable", what: "pack trailing data" }],
    [Uint8Array.from([...withFlush, 0x30, 0x30, 0x30, 0x30]), true, { reason: "unreadable", what: "pack trailing data" }],
    [pack.subarray(0, pack.length - 1), false, { reason: "unreadable", what: "pack trailer" }],
    [Uint8Array.from(pack, (b, i) => (i === pack.length - 1 ? b ^ 1 : b)), false, { reason: "hash-mismatch", what: "pack trailer" }],
  ];
  for (const [bytes, flushAfter, expected] of cases) {
    expect(await decodePack(bytes, { maxBytes, flushAfter }).then(() => null, refusal)).toEqual(expected);
  }
});
