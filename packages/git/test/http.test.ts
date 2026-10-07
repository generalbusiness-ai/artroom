import { afterAll, expect, test } from "vitest";
import { SmartHttpGit, buildPack, type RawGitObject } from "../src/http.ts";
import { READ_BOUNDS } from "../src/reader.ts";
import { attemptOutcome, classifySend } from "../src/push-outcome.ts";
import { Host } from "./support/host.ts";
import { bare, blob, cleanup, commit, commitText, git, put, refAt, setRef, tree } from "./support/repo.ts";

afterAll(cleanup);
const REF = "refs/heads/main";
const TOKEN = "http-private-token-1";
const one = { state: "closed", forwarded: 1 } as const;

// Invariant: Web pack bytes reach real local Git as the exact supplied
// objects; its CAS/report and the existing classifier distinguish success,
// a writer racing after discovery, and a lost reply without a second POST.
// Host is a labelled local HTTP stand-in, backed by real git http-backend.
// This proves no hosted service, deployed Worker, credential custody or grant.
test("Web smart HTTP initializes and deletes exact refs on local Git; a racing CAS is refused and a lost reply stays unknown", async () => {
  const remote = bare();
  const source = bare();
  const baseTree = tree(remote, [`100644 blob ${blob(remote, "base\n")}\tfile`]);
  const base = commit(remote, baseTree, [], "base");
  const other = commit(remote, baseTree, [base], "another writer");
  setRef(remote, REF, base);

  // Two independently named binary blobs each fit the blob limit. Their
  // aggregate exceeds it: a one-blob bound must never become a pack quota.
  const objects: RawGitObject[] = [];
  for (const byte of [0, 255]) {
    const data = new Uint8Array(20_000).fill(byte);
    objects.push({ id: put(source, "blob", data), type: "blob", data });
  }
  const treeData = Buffer.concat(objects.map((o, i) => Buffer.concat([Buffer.from(`100644 file${i}\0`), Buffer.from(o.id, "hex")])));
  const treeId = put(source, "tree", treeData);
  objects.push({ id: treeId, type: "tree", data: treeData });
  const commitData = Buffer.from(commitText(treeId, [base], "reviewed"));
  const target = put(source, "commit", commitData);
  objects.push({ id: target, type: "commit", data: commitData });

  // A branchless local Git repository advertises the zero-ID capability
  // sentinel. An explicit old=null creates its exact parentless first head;
  // this is positive empty-Git evidence, not an empty-GitHub-repo claim.
  const empty = bare();
  const emptyHost = new Host(empty, TOKEN);
  const emptyClient = new SmartHttpGit({ remote: "http://127.0.0.1/repo.git", transport: "local", authorization: `Bearer ${TOKEN}`, maxBytes: 100_000, fetch: emptyHost.upstream });
  const before = await emptyClient.discover();
  expect(before.refs).toEqual([]);
  expect(before.capabilities).toContain("report-status");
  const firstData = Buffer.from(commitText(treeId, [], "first head"));
  const first = put(source, "commit", firstData);
  const firstObjects = [...objects.slice(0, -1).map((o) => ({ ...o, data: Buffer.from(o.data) })), { id: first, type: "commit" as const, data: firstData }];
  const firstUpdate = { ref: REF, old: null, new: first, objects: firstObjects };
  const initializing = emptyClient.send(firstUpdate);
  // The transport privately snapshots the exact ref command and all raw
  // bytes before its first await, including Buffer subclasses of Uint8Array.
  firstUpdate.new = "3".repeat(40);
  for (const o of firstObjects) o.data.fill(0);
  const initialized = await initializing;
  const firstRead = await emptyClient.readRef(REF);
  expect([initialized.reported, emptyHost.updates, firstRead.value]).toEqual(["created", 1, first]);
  expect(attemptOutcome({ ref: REF, new: first }, classifySend(initialized, one), firstRead).result).toBe("confirmed");
  expect(git(empty, ["cat-file", "--batch-check"], [...objects.slice(0, -1), { id: first, type: "commit", data: commitText(treeId, [], "first head") }].map((o) => `${o.id}\n`).join("")))
    .toBe([...objects.slice(0, -1).map((o) => `${o.id} ${o.type} ${o.data.length}`), `${first} commit ${Buffer.byteLength(commitText(treeId, [], "first head"))}`].join("\n"));
  expect(git(empty, ["cat-file", "commit", first])).toBe(commitText(treeId, [], "first head").trim());

  const host = new Host(remote, TOKEN);
  let posts = 0;
  let lose = false;
  const requests: { method: string; redirect: string; credentials: string; url: string }[] = [];
  const client = new SmartHttpGit({
    remote: "http://127.0.0.1/repo.git/", transport: "local", authorization: `Bearer ${TOKEN}`,
    maxBytes: 100_000, bounds: { ...READ_BOUNDS, blobBytes: 30_000 },
    fetch: async (request) => {
      requests.push({ method: request.method, redirect: request.redirect, credentials: request.credentials, url: request.url });
      if (request.method === "POST") posts++;
      const response = await host.upstream(request);
      if (lose && request.method === "POST") throw new Error(TOKEN);
      return response;
    },
  });
  const update = { ref: REF, old: base, new: target, objects };
  const applied = await client.send(update);
  const read = await client.readRef(REF);
  expect(applied).toMatchObject({ reported: "updated", exit: 0 });
  expect(attemptOutcome(update, classifySend(applied, one), read).result).toBe("confirmed");
  expect([posts, host.updates, read.value]).toEqual([1, 1, target]);
  // Git itself reads packed types, lengths and exact bytes; neither oracle
  // reconstructs the pack with the implementation's encoder.
  expect(git(remote, ["cat-file", "--batch-check"], objects.map((o) => `${o.id}\n`).join("")))
    .toBe(objects.map((o) => `${o.id} ${o.type} ${o.data.length}`).join("\n"));
  expect(git(remote, ["cat-file", "commit", target])).toBe(commitData.toString().trim());

  // Control: stale at discovery sends no POST. Then the host changes after
  // discovery, so the unchanged exact-old command is rejected by real Git.
  const stale = await client.send(update);
  expect([stale.reported, posts]).toEqual(["stale", 1]);
  setRef(remote, REF, base);
  host.fault = { kind: "moved", ref: REF, to: other };
  const raced = await client.send(update);
  expect([classifySend(raced, one), refAt(remote, REF), posts, host.updates])
    .toEqual([{ class: "refused", why: "rejected" }, other, 2, 2]);

  // Control: the real local server applies it and the reply is lost. A read
  // sees the new ref, but the attempt remains unknown and does not retry.
  setRef(remote, REF, base);
  lose = true;
  const lost = await client.send(update);
  const afterLoss = await client.readRef(REF);
  expect([lost.reported, attemptOutcome(update, classifySend(lost, one), afterLoss).result, afterLoss.value, posts, host.updates])
    .toEqual([null, "unknown", target, 3, 3]);

  // A separate exact-old deletion is negotiated through delete-refs and
  // confirmed only by its own complete status plus an absent read-back.
  lose = false;
  expect((await client.discover()).capabilities).toContain("delete-refs");
  const deletion = { ref: REF, old: target, new: null };
  const deleted = await client.send(deletion);
  const absent = await client.readRef(REF);
  expect([deleted.reported, posts, host.updates, absent.value]).toEqual(["deleted", 4, 4, null]);
  expect(attemptOutcome(deletion, classifySend(deleted, one), absent).result).toBe("confirmed");
  expect(requests.every((r) => r.redirect === "error" && r.credentials === "omit" && !r.url.includes(TOKEN))).toBe(true);
  expect(new Set(host.credentials)).toEqual(new Set([`Bearer ${TOKEN}`]));
  expect(JSON.stringify([client, requests, applied, raced, lost]).includes(TOKEN)).toBe(false);
});

// Invariant: unverified/over-bound bytes and a redirect send no update;
// an incomplete HTTP-200 status cannot count as the server's rejection.
test("smart HTTP refuses invalid pack bytes and redirects, and does not classify a truncated rejection as complete", async () => {
  const data = new Uint8Array([1, 2]);
  await expect(buildPack([{ id: "1".repeat(40), type: "blob", data }], { maxBytes: 1000 })).rejects.toMatchObject({ reason: "hash-mismatch" });
  const source = bare();
  const object = { id: put(source, "blob", data), type: "blob" as const, data };
  await expect(buildPack([object], { maxBytes: 32 })).rejects.toMatchObject({ reason: "too-large" });
  const target = "2".repeat(40);
  let calls = 0;
  const redirected = new SmartHttpGit({ remote: "https://git.example.invalid/repo.git", maxBytes: 1000, authorization: TOKEN, fetch: () => {
    calls++;
    return Promise.resolve(Response.redirect("https://other.example.invalid", 302));
  } });
  expect(await redirected.send({ ref: REF, old: null, new: target })).toMatchObject({ ran: false, refusal: "unreadable" });
  expect(calls).toBe(1);

  // A scripted response stands for HTTP only, not a real Git host.
  const pkt = (s: string) => `${(s.length + 4).toString(16).padStart(4, "0")}${s}`;
  let posts = 0;
  const partial = new SmartHttpGit({ remote: "https://git.example.invalid/repo.git", maxBytes: 1000, fetch: (request) => {
    if (request.method === "GET") return Promise.resolve(new Response(`${pkt("# service=git-receive-pack\n")}0000${pkt(`${"0".repeat(40)} capabilities^{}\0report-status\n`)}0000`, { headers: { "content-type": "application/x-git-receive-pack-advertisement" } }));
    posts++;
    return Promise.resolve(new Response(`${pkt("unpack ok\n")}${pkt(`ng ${REF} refused\n`)}`, { headers: { "content-type": "application/x-git-receive-pack-result" } }));
  } });
  const answer = await partial.send({ ref: REF, old: null, new: target });
  expect([classifySend(answer, one), posts]).toEqual([{ class: "unknown", reported: null }, 1]);
});
