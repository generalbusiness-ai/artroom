// The gateway's ref fence: it reads receive-pack commands and refuses any
// update the operation did not allow, replaying allowed bodies unchanged.
// The gateway itself is a Workers entrypoint (container.ts) that calls
// `gatewayFetch`; the tests at the end drive that function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUpdates, gatewayFetch, readCommands, repoPathOf, FenceError, ZERO, type GatewayProps } from "../src/publisher/ref-fence.ts";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
const enc = new TextEncoder();
const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, "0") + s;

function body(lines: string[], pack = "PACK\0\0\0\x02rest-of-pack"): Uint8Array {
  const text = lines.map(pkt).join("") + "0000";
  return new Uint8Array([...enc.encode(text), ...enc.encode(pack)]);
}

/** A stream that delivers `bytes` in chunks of `size`. */
function stream(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + size));
      i += size;
    },
  });
}

async function all(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const p of s as unknown as AsyncIterable<Uint8Array>) parts.push(p);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
}

const mainUpdate = `${A} ${B} refs/heads/main\0 report-status side-band-64k quiet object-format=sha1 agent=git/2.54.0`;

test("reads the commands at any chunking and replays the body byte for byte", async () => {
  const b = body([mainUpdate]);
  for (const size of [1, 2, 3, 7, 64, 100000]) {
    const { commands, replay } = await readCommands(stream(b, size));
    assert.deepEqual(commands, [{ old: A, new: B, ref: "refs/heads/main" }]);
    assert.deepEqual(await all(replay), b);
  }
});

test("a publication token may move main from expectedMain to the integration, and nothing else", () => {
  const allowed = { "refs/heads/main": { old: A, new: B } };
  checkUpdates([{ old: A, new: B, ref: "refs/heads/main" }], allowed);
  const refuse = (c: { old: string; new: string; ref: string }[]) => assert.throws(() => checkUpdates(c, allowed), FenceError);
  refuse([{ old: C, new: B, ref: "refs/heads/main" }]); //            another expected main (a force push)
  refuse([{ old: A, new: C, ref: "refs/heads/main" }]); //            another commit
  refuse([{ old: A, new: ZERO, ref: "refs/heads/main" }]); //         deleting main
  refuse([{ old: ZERO, new: B, ref: "refs/heads/other" }]); //        another ref
  refuse([{ old: A, new: B, ref: "refs/heads/main" }, { old: ZERO, new: B, ref: "refs/tags/x" }]);
});

test("a pinning token may only create its refs; the auth probe (no commands) passes", async () => {
  const pin = `refs/artroom/heads/act_1_abcdef01/1`;
  checkUpdates([{ old: ZERO, new: B, ref: pin }], { [pin]: { old: ZERO, new: B } });
  assert.throws(() => checkUpdates([{ old: A, new: B, ref: pin }], { [pin]: { old: ZERO, new: B } }), FenceError);
  const probe = await readCommands(stream(enc.encode("0000"), 4));
  assert.deepEqual(probe.commands, []);
  checkUpdates(probe.commands, {});
});

test("anything the fence cannot read is refused", async () => {
  const bad = [
    enc.encode("zzzz"),
    enc.encode(pkt(`${A} ${B} refs/heads/main`)), // no flush: ends inside the commands
    body([`shallow ${A}`]),
    body([`${A} ${B} main`]), //                  not a full ref name
    enc.encode("0003"),
  ];
  for (const b of bad) await assert.rejects(readCommands(stream(b, 5)), FenceError);
  const huge = body(Array.from({ length: 1000 }, (_, i) => `${A} ${B} refs/heads/${"x".repeat(60)}${i}`));
  await assert.rejects(readCommands(stream(huge, 4096)), FenceError);
});

test("the sandbox reaches the public namespace and, in a deployment that imports, the import namespace; nothing else (request b6b51de7)", () => {
  const host = "acct.artifacts.cloudflare.net";
  assert.equal(repoPathOf(`https://${host}/git/pub/r.git`, host, ["pub", undefined]), "/git/pub/r.git");
  assert.throws(() => repoPathOf(`https://${host}/git/imp/r.git`, host, ["pub", undefined]), /not allowed/);
  assert.equal(repoPathOf(`https://${host}/git/imp/r.git`, host, ["pub", "imp"]), "/git/imp/r.git");
  for (const bad of [`https://${host}/git/other/r.git`, `https://${host}/git/pubx/r.git`, `http://${host}/git/pub/r.git`, `https://evil.example/git/pub/r.git`, `https://u:p@${host}/git/pub/r.git`, `https://${host}/git/pub/r.git?x=1`, `https://${host}/git/pub/r`])
    assert.throws(() => repoPathOf(bad, host, ["pub", "imp"]), /not allowed/, bad);
});

// ------------------------------------------------------------------ the gateway's decision for one request

const HOST = "acct.artifacts.cloudflare.net";
const GRANTS: GatewayProps = {
  host: HOST,
  repos: {
    "/git/ns/canon.git": { token: "art_v1_secret", updates: { "refs/heads/main": { old: A, new: B } } },
    "/git/ns/fork.git": { token: "art_v1_secret2", updates: null },
  },
};

/** What reached Artifacts: every request the gateway let through, with its body. */
function upstream() {
  const sent: { url: string; method: string; auth: string | null; body: Uint8Array }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, { ...init, duplex: "half" } as RequestInit);
    sent.push({ url: req.url, method: req.method, auth: req.headers.get("authorization"), body: new Uint8Array(await req.arrayBuffer()) });
    return new Response("from Artifacts");
  }) as typeof fetch;
  return { sent, fetcher };
}

const push = (path: string, bytes: Uint8Array, headers: Record<string, string> = {}) =>
  new Request(`https://${HOST}${path}/git-receive-pack`, {
    method: "POST",
    body: stream(bytes, 3), // tiny chunks
    headers: { "content-type": "application/x-git-receive-pack-request", ...headers },
    duplex: "half",
  } as RequestInit);

test("the gateway lets through the one update the operation allows, with the repository's token added and the body unchanged; fetches get the token too", async () => {
  const up = upstream();
  const bytes = body([`${A} ${B} refs/heads/main\0 report-status`]);
  const r = await gatewayFetch(GRANTS, push("/git/ns/canon.git", bytes), up.fetcher);
  assert.equal(await r.text(), "from Artifacts");
  assert.equal(up.sent.length, 1);
  assert.deepEqual([up.sent[0]!.url, up.sent[0]!.method, up.sent[0]!.auth], [`https://${HOST}/git/ns/canon.git/git-receive-pack`, "POST", "Bearer art_v1_secret"]);
  assert.deepEqual(up.sent[0]!.body, bytes);
  // A fetch from a repository with a read-only grant goes through, with that repository's token.
  await gatewayFetch(GRANTS, new Request(`https://${HOST}/git/ns/fork.git/info/refs?service=git-upload-pack`), up.fetcher);
  assert.deepEqual([up.sent[1]!.method, up.sent[1]!.auth], ["GET", "Bearer art_v1_secret2"]);
});

test("the gateway refuses, before any request leaves: a push that would move main anywhere but the allowed update, another ref, a read-only grant, a compressed push, another repository, and another host", async () => {
  const up = upstream();
  const refused = async (what: string, request: Request, why: RegExp) => {
    const r = await gatewayFetch(GRANTS, request, up.fetcher);
    assert.equal(r.status, 403, what);
    assert.match(await r.text(), why, what);
  };
  const allowed = body([`${A} ${B} refs/heads/main\0 report-status`]);
  await refused("another expected main", push("/git/ns/canon.git", body([`${C} ${B} refs/heads/main\0 report-status`])), /does not match/);
  await refused("another ref", push("/git/ns/canon.git", body([`${ZERO} ${B} refs/heads/other\0 report-status`])), /not allowed/);
  await refused("a read-only grant", push("/git/ns/fork.git", allowed), /may not push/);
  await refused("a compressed push", push("/git/ns/canon.git", allowed, { "content-encoding": "gzip" }), /compressed/);
  await refused("another repository", push("/git/ns/elsewhere.git", allowed), /repository/);
  await refused("a repository whose name starts with a granted one", push("/git/ns/canon.git.evil", allowed), /repository/);
  await refused("another host", new Request("https://example.com/git/ns/canon.git/info/refs"), /host/);
  await refused("plain http", new Request(`http://${HOST}/git/ns/canon.git/info/refs`), /host/);
  assert.deepEqual(up.sent, [], "nothing reached Artifacts");
});
