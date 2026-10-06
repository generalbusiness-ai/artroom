import { inspect } from "node:util";
import { expect, test } from "vitest";
import { Gateway, GatewayRefusal, type GatewayReason, type GrantRequest } from "../src/index.ts";
import { MemoryRecords } from "./support/host.ts";

const TOKEN = "tok_plaintext_9c2e7b";
const REPO = "https://git.example/space/repo.git";
const [OLD, NEW, OTHER, ZERO] = ["a".repeat(40), "b".repeat(40), "c".repeat(40), "0".repeat(40)];
const REF = "refs/heads/main";

const enc = new TextEncoder();
const pkt = (line: string) => `${(line.length + 4).toString(16).padStart(4, "0")}${line}`;
/** A receive-pack body: the commands, a flush, and bytes that stand for the pack. */
const push = (...commands: string[]) => enc.encode(`${commands.map((c, i) => pkt(i === 0 ? `${c}\0report-status agent=git/2\n` : `${c}\n`)).join("")}0000PACK-bytes`);
const post = (body: Uint8Array | string, path = "/git-receive-pack", headers: Record<string, string> = {}) =>
  new Request(`${REPO}${path}`, { method: "POST", headers: { "content-type": "application/x-git-receive-pack-request", authorization: "Bearer the-client's-own", ...headers }, body: typeof body === "string" ? enc.encode(body) : body });
const get = (service: string, repo = REPO) => new Request(`${repo}/info/refs?service=${service}`);

/** The reason of a refusal by `open`, or "opened". */
const opening = (run: Promise<unknown>): Promise<string> => run.then(() => "opened", (e: unknown) => (e instanceof GatewayRefusal ? e.reason : String(e)));

// The plan's T27 (authority note, sections 5.3, 5.7, 6.1 and 6.6, step 3). Pure: the host is a function in the test, a stand-in that
// records what reached it. It shows the gateway's side only.
test("the gateway holds one grant for an attempt, records that it is forwarding before it forwards, forwards one update and closes; the plaintext is in the one header and in no record, log, error, URL or response", async () => {
  const order: string[] = [];
  const reached: { url: string; headers: [string, string][]; body: string }[] = [];
  const logged: string[] = [];
  const records = new MemoryRecords();
  const write = records.write.bind(records);
  records.write = (record) => { order.push(`record ${(record as { state: string }).state}`); return write(record); };
  let fail = false;
  const gateway = new Gateway({
    records,
    credential: (t) => ["authorization", `Bearer ${t}`],
    log: (e) => logged.push(JSON.stringify(e)),
    upstream: async (request) => {
      order.push(`host ${new URL(request.url).pathname.slice("/space/repo.git".length)}`);
      reached.push({ url: request.url, headers: [...request.headers], body: await request.text() });
      // A provider's error that repeats the request it was given, with its header (the proof plan's key O3).
      if (fail) throw new Error(`upstream 500 for ${request.url} with Authorization: Bearer ${TOKEN}`);
      return new Response("ok");
    },
  });
  const grant = (attempt: string, more: Partial<GrantRequest> = {}): GrantRequest =>
    ({ attempt, repository: REPO, update: { ref: REF, old: OLD, new: NEW }, token: { id: "token-1", state: "live", plaintext: TOKEN }, ...more });
  /** Whatever a forward ends with, as text: the status and the body, or a thrown error's text. */
  const forwarded = (request: Request): Promise<string> => gateway.forward(request).then(async (r) => `${r.status} ${(await r.text()).trim()}`, (e: unknown) => `threw ${String(e)}`);
  const refused = (reason: GatewayReason) => `403 Refused by the gateway: ${reason}`;

  // Opening. The plaintext is taken only for a token that its sealed outcome entry made `live` (section 5.7).
  expect(await Promise.all([
    opening(gateway.open(grant("d:7:1#1", { token: { id: "token-0", state: "minting", plaintext: TOKEN } }))),
    opening(gateway.open(grant("d:7:1#1", { token: { id: "token-0", state: "revoking", plaintext: TOKEN } }))),
    opening(gateway.open(grant("d:7:1#1", { repository: `https://user:${TOKEN}@git.example/space/repo.git` }))),
    opening(gateway.open(grant("d:7:1#1", { repository: `${REPO}?token=${TOKEN}` }))),
    opening(gateway.open(grant("d:7:1#1", { update: { ref: "--receive-pack=x", old: OLD, new: NEW } }))),
    opening(gateway.open(grant("d:7:1#1", { update: { ref: REF, old: OLD, new: "f".repeat(64) } }))),
  ])).toEqual(["token-not-live", "token-not-live", "credential-in-url", "bad-grant", "bad-grant", "bad-grant"]);
  expect([records.written.length, await forwarded(get("git-receive-pack"))]).toEqual([0, refused("no-grant")]);

  expect(await gateway.open(grant("d:7:1#1"))).toEqual({ attempt: "d:7:1#1", repository: REPO, update: { ref: REF, old: OLD, new: NEW }, token: "token-1", state: "open", forwarded: 0, reads: 0 });
  // One grant for a repository at a time, and one grant for an attempt in the gateway's life.
  expect(await Promise.all([opening(gateway.open(grant("d:7:1#2"))), opening(gateway.open(grant("d:7:1#1")))])).toEqual(["grant-open", "attempt-used"]);

  // What is refused before anything reaches the host. Only the three smart-HTTP paths pass, and only the one granted update.
  const update = `${OLD} ${NEW} ${REF}`;
  expect(await Promise.all([
    forwarded(new Request(`${REPO}/objects/info/packs`)),
    forwarded(new Request(`${REPO}/info/refs?service=git-receive-pack&token=${TOKEN}`)),
    forwarded(get("git-upload-pack", "https://git.example/space/other.git")),
    forwarded(post(push(`${OLD} ${OTHER} ${REF}`))),                                   // another new value
    forwarded(post(push(`${OTHER} ${NEW} ${REF}`))),                                   // another old value
    forwarded(post(push(`${OLD} ${NEW} refs/heads/other`))),                           // another ref
    forwarded(post(push(update, `${ZERO} ${NEW} refs/heads/second`))),                 // a second update beside the granted one
    forwarded(post(push(`${OLD} ${ZERO} ${REF}`))),                                    // a delete, which this grant does not allow
    forwarded(post(push(update).fill(0x41, 2, 3))),                                    // a length in upper-case hex
    forwarded(post(`0x${pkt(`${update}\n`).slice(2)}0000`)),                           // a length that `parseInt` would read
    forwarded(post(`${pkt(`${"f".repeat(64)} ${"e".repeat(64)} ${REF}\0object-format=sha256\n`)}0000`)),   // SHA-256 object IDs
    forwarded(post(`${pkt("push-cert\0report-status\n")}0000`)),
    forwarded(post(pkt(`${update}\n`))),                                               // the body ends inside the commands
    forwarded(post(push(update), "/git-receive-pack", { "content-encoding": "gzip" })),
  ])).toEqual([
    refused("not-git"), refused("not-git"), refused("no-grant"),
    refused("not-granted"), refused("not-granted"), refused("not-granted"), refused("not-granted"), refused("not-granted"),
    refused("bad-commands"), refused("bad-commands"), refused("bad-commands"), refused("bad-commands"), refused("bad-commands"), refused("compressed"),
  ]);
  expect(reached).toEqual([]);

  // Reads pass with the credential and are not counted as the update: discovery, a fetch, and Git's empty probe before a large push.
  expect(await Promise.all([forwarded(get("git-receive-pack")), forwarded(post("0000", "/git-upload-pack")), forwarded(post("0000"))])).toEqual(["200 ok", "200 ok", "200 ok"]);

  // The one update. "Forwarding" is recorded before the host is called. The body reaches the host unchanged. Then the grant is closed.
  order.length = 0;
  expect(await forwarded(post(push(update)))).toBe("200 ok");
  expect(order).toEqual(["record forwarding", "host /git-receive-pack", "record closed"]);
  expect(reached.at(-1)!.body).toBe(new TextDecoder().decode(push(update)));
  // A second copy of the same update, and anything else, is refused: a closed grant forwards nothing, whatever asks.
  const calls = reached.length;
  expect(await Promise.all([forwarded(post(push(update))), forwarded(get("git-receive-pack"))])).toEqual([refused("no-grant"), refused("no-grant")]);
  expect(reached.length).toBe(calls);
  const closed = { attempt: "d:7:1#1", repository: REPO, update: { ref: REF, old: OLD, new: NEW }, token: "token-1", state: "closed", forwarded: 1, reads: 3 };
  expect([await gateway.close("d:7:1#1"), await gateway.close("d:7:1#1"), await gateway.close("d:7:9#9")]).toEqual([closed, closed, null]);

  // The host fails, and its error repeats the request with its header. What comes back to the client holds none of it, and the
  // record still shows one forward: the send is unknown, and not "not sent".
  fail = true;
  await gateway.open(grant("d:7:2#1", { token: { id: "token-2", state: "live", plaintext: TOKEN } }));
  const failed = await forwarded(post(push(update)));
  expect(failed).not.toContain(TOKEN);
  expect(failed).toBe("502 The gateway had no answer from the host");
  expect(await gateway.close("d:7:2#1")).toMatchObject({ state: "closed", forwarded: 1 });
  fail = false;

  // The token's use ends (section 5.7: the entry that makes it `revoking`): its grants close with nothing forwarded, and the plaintext is dropped.
  await gateway.open(grant("d:7:3#1", { token: { id: "token-3", state: "live", plaintext: TOKEN } }));
  expect(await gateway.ended("token-3")).toMatchObject([{ attempt: "d:7:3#1", state: "closed", forwarded: 0 }]);
  expect(await forwarded(post(push(update)))).toBe(refused("no-grant"));

  // A record that cannot be written stops the forward: nothing reaches the host, and the grant is closed with nothing forwarded.
  await gateway.open(grant("d:7:4#1", { token: { id: "token-4", state: "live", plaintext: TOKEN } }));
  records.write = () => Promise.reject(new Error(`storage failed while writing ${TOKEN}`));
  const before = reached.length;
  expect([await forwarded(post(push(update))), reached.length - before, await gateway.close("d:7:4#1")]).toEqual([refused("record-failed"), 0, expect.objectContaining({ state: "closed", forwarded: 0 })]);

  // Custody (section 5.3). At the host the plaintext was in the one header of each request, the client's own header was not passed
  // on, and no URL held it. Nowhere else does the plaintext appear: no record, no log line, no rendering of the gateway itself.
  expect(reached.length).toBeGreaterThan(3);
  expect(reached.map((r) => r.headers.filter(([, value]) => value.includes(TOKEN)))).toEqual(reached.map(() => [["authorization", `Bearer ${TOKEN}`]]));
  expect(reached.some((r) => r.url.includes(TOKEN) || r.headers.some(([, value]) => value.includes("the-client's-own")))).toBe(false);
  expect([records.written.join("\n"), logged.join("\n"), JSON.stringify(gateway), inspect(gateway, { depth: 8, showHidden: true })].map((kept) => kept.includes(TOKEN))).toEqual([false, false, false, false]);
  expect(records.written.length).toBeGreaterThan(5);
});

/** A promise that the test resolves, and nothing else does. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// Authority note, sections 5.3, 6.1 and 6.6, step 3. The calls overlap for real: each waits on a promise that the test resolves, and
// no timer is used. The host and the records are stand-ins, as above.
test("a grant has one lifecycle across calls that overlap: of two forwards of the granted update one is sent; a grant closed while it opens gets no plaintext; one closed before \"forwarding\" is durable sends nothing; one closed after its request left keeps its forward", async () => {
  const records = new MemoryRecords();
  const write = records.write.bind(records);
  /** `hold(state)`: the next write of a record in that state waits. `asked` resolves when the gateway asks for it, and `release` lets it be written. */
  let held: { state: string; asked: () => void; release: Promise<void> } | null = null;
  records.write = async (record) => {
    const waits = held?.state === (record as { state: string }).state ? held : null;
    if (waits) { held = null; waits.asked(); await waits.release; }
    return write(record);
  };
  const hold = (state: string) => { const asked = deferred(), release = deferred(); held = { state, asked: asked.resolve, release: release.promise }; return { asked: asked.promise, release: release.resolve }; };
  /** Each request that reached the host, by its credential. While `host` is set, the next one waits there for its answer. */
  const reached: (string | null)[] = [];
  let host: { arrived: () => void; answer: Promise<void> } | null = null;
  const gateway = new Gateway({
    records, credential: (t) => ["authorization", `Bearer ${t}`],
    upstream: async (request) => { reached.push(request.headers.get("authorization")); const waits = host; host = null; waits?.arrived(); await waits?.answer; return new Response("ok"); },
  });
  const grant = (attempt: string): GrantRequest => ({ attempt, repository: REPO, update: { ref: REF, old: OLD, new: NEW }, token: { id: "token-1", state: "live", plaintext: TOKEN } });
  const forwarded = (request: Request): Promise<string> => gateway.forward(request).then(async (r) => `${r.status} ${(await r.text()).trim()}`);
  const refused = (reason: GatewayReason) => `403 Refused by the gateway: ${reason}`;
  const update = push(`${OLD} ${NEW} ${REF}`);
  /** What was written for an attempt, in order: each record's state and its count of forwards. */
  const written = (attempt: string) => records.written.map((r) => JSON.parse(r) as { attempt: string; state: string; forwarded: number }).filter((r) => r.attempt === attempt).map((r) => `${r.state} ${r.forwarded}`);

  // Two forwards of the one granted update, both valid. Each passes the first check and waits for its body. The bodies then arrive.
  await gateway.open(grant("d:8:1#1"));
  const bodies = [0, 1].map(() => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
    return { request: new Request(`${REPO}/git-receive-pack`, { method: "POST", body: stream, duplex: "half" } as RequestInit), arrive: () => { controller.enqueue(update); controller.close(); } };
  });
  const both = bodies.map((b) => forwarded(b.request));
  for (const b of bodies) b.arrive();
  // One holds the claim and is sent. The other is refused, and the record's one forward is the one that reached the host.
  expect([await Promise.all(both), reached.length, written("d:8:1#1")]).toEqual([["200 ok", refused("grant-used")], 1, ["open 0", "forwarding 1", "closed 1"]]);

  // A close while `open` waits on the write of its record. The grant is closed: `open` is refused, and a request finds no grant.
  const opens = hold("open");
  const opened = opening(gateway.open(grant("d:8:2#1")));
  await opens.asked;
  const closed = gateway.close("d:8:2#1");
  opens.release();
  expect([await opened, await closed, await forwarded(get("git-upload-pack")), reached.length, written("d:8:2#1")]).toEqual([
    "grant-closed", expect.objectContaining({ state: "closed", forwarded: 0, reads: 0 }), refused("no-grant"), 1, ["open 0", "closed 0"],
  ]);

  // A close while the forward waits on the write of "forwarding". Nothing was sent and nothing is: the record says so.
  await gateway.open(grant("d:8:3#1"));
  const forwards = hold("forwarding");
  const stopped = forwarded(post(update));
  await forwards.asked;
  const closing = gateway.close("d:8:3#1");
  forwards.release();
  expect([await stopped, await closing, reached.length, written("d:8:3#1")]).toEqual([
    refused("grant-used"), expect.objectContaining({ state: "closed", forwarded: 0 }), 1, ["open 0", "forwarding 1", "closed 0"],
  ]);

  // A close after the request has left, before its answer. The record keeps its forward: the send is unknown, and is not "not sent".
  await gateway.open(grant("d:8:4#1"));
  const arrived = deferred(), answer = deferred();
  host = { arrived: arrived.resolve, answer: answer.promise };
  const sent = forwarded(post(update));
  await arrived.promise;
  expect(await gateway.close("d:8:4#1")).toMatchObject({ state: "closed", forwarded: 1 });
  answer.resolve();
  expect([await sent, reached, written("d:8:4#1")]).toEqual(["200 ok", [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`], ["open 0", "forwarding 1", "closed 1"]]);
  expect(records.written.join("\n")).not.toContain(TOKEN);
});
