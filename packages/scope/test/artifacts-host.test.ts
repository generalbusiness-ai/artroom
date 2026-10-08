import { expect, test } from "vitest";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { idOf, snapshotCommit } from "@generalbusiness/artroom-git";
import { buildPack, type RawGitObject } from "@generalbusiness/artroom-git/http";
import { ArtifactsProvider, READ_TTL, WRITE_TTL, type ArtifactsNamespace, type CreationCustody } from "../src/artifacts-host.ts";
import type { DestinationBinding } from "../src/destination-host.ts";

// Every reply here is SCRIPTED: a binding double stands for the hosting's
// own Git service, and a scripted fetch for its smart-HTTP endpoint. No
// repository, token or remote exists. These tests show what the provider
// sends and how it reads the answers, and nothing about the real service.

const SERVICE = "service.invalid";
const NAMESPACE = "artroom-demo";
const repository = { host: "artifacts", namespace: NAMESPACE, name: "repo-1", id: "repo-1" };
const REMOTE = `https://${SERVICE}/git/${NAMESPACE}/repo-1.git`;
const binding: DestinationBinding = { scope: { scope: "sc_scripted", inc: "in_scripted", kind: "destination" }, mint: "1:0", attempt: 1, write: "2:0", writeAttempt: 1, ref: "refs/heads/main" };
const refused = (code: string) => Object.assign(new Error(code), { code, numericCode: 10000 });

/** A scripted binding: every call is logged; each answer is what the test sets. */
function service() {
  const calls: string[] = [];
  let tokens = 0;
  const script = {
    create: (name: string): unknown => ({ name, remote: `https://${SERVICE}/git/${NAMESPACE}/${name}.git`, token: "creation-plaintext" }),
    revoke: (_token: string): unknown => true,
    delete: (_name: string): unknown => true,
    token: (scope: "read" | "write", _ttl: number): unknown => ({ id: `tok_${++tokens}`, plaintext: `${scope}-plaintext-${tokens}`, scope, expiresAt: "2026-10-07T13:15:00.000Z" }),
    remote: (name: string) => `https://${SERVICE}/git/${NAMESPACE}/${name}.git`,
  };
  const call = <T>(text: string, answer: () => T): Promise<T> => { calls.push(text); try { return Promise.resolve(answer()); } catch (e) { return Promise.reject(e); } };
  const ns: ArtifactsNamespace = {
    get: (name) => call(`get ${name}`, () => ({
      createToken: (scope, ttl) => call(`createToken ${name} ${scope} ${ttl}`, () => script.token(scope, ttl)),
      revokeToken: (token) => call(`revokeToken ${name} ${token}`, () => script.revoke(token)),
      info: () => call(`info ${name}`, () => ({ name, remote: script.remote(name) })),
    })),
    create: (name) => call(`create ${name}`, () => script.create(name)),
    delete: (name) => call(`delete ${name}`, () => script.delete(name)),
  };
  const held = new Map<string, { name: string; plaintext: string | null }>();
  const custody: CreationCustody = {
    hold: (handle, name, plaintext) => { if (!held.has(handle)) held.set(handle, { name, plaintext }); },
    take: (handle) => { const row = held.get(handle); return row?.plaintext ? { name: row.name, plaintext: row.plaintext } : null; },
    revoked: (handle) => { const row = held.get(handle); if (row) row.plaintext = null; },
  };
  return { calls, script, ns, held, custody };
}

const pkt = (text: string) => `${(utf8(text).length + 4).toString(16).padStart(4, "0")}${text}`;
const response = (body: string | Uint8Array, media: string) => new Response(body, { status: 200, headers: { "content-type": media } });
const uploadAdvertisement = (refs: Record<string, string>) => {
  const lines = Object.entries(refs).map(([ref, id], i) => pkt(`${id} ${ref}${i === 0 ? "\0ofs-delta allow-reachable-sha1-in-want\n" : "\n"}`));
  return response(`${pkt("# service=git-upload-pack\n")}0000${lines.length ? lines.join("") : pkt(`${"0".repeat(40)} capabilities^{}\0ofs-delta\n`)}0000`, "application/x-git-upload-pack-advertisement");
};
const receiveAdvertisement = (refs: Record<string, string>) => {
  const lines = Object.entries(refs).map(([ref, id], i) => pkt(`${id} ${ref}${i === 0 ? "\0report-status delete-refs\n" : "\n"}`));
  return response(`${pkt("# service=git-receive-pack\n")}0000${lines.length ? lines.join("") : pkt(`${"0".repeat(40)} capabilities^{}\0report-status delete-refs\n`)}0000`, "application/x-git-receive-pack-advertisement");
};

function provider(s: ReturnType<typeof service>, fetch: (request: Request) => Promise<Response> = async () => { throw new Error("no fetch scripted"); }, repositoryOf: () => typeof repository | null = () => repository, creation = s.custody) {
  return new ArtifactsProvider({ binding: s.ns, host: "artifacts", namespace: NAMESPACE, service: SERVICE, maxBytes: 1024 * 1024, fetch, credentialHandle: async () => "adapter:local-handle", creation, repositoryOf });
}

// Invariant: a creation is one call; its write token is revoked at once, and
// reported as owed only when that revocation is not confirmed. A stated
// refusal is the answer; any other failure is no answer, and nothing is
// sent twice. A deletion names exactly the recorded repository.
test("scripted binding: a creation revokes its write token at once or reports it owed; a refusal is the answer; delete names the exact repository", async () => {
  const s = service();
  const p = provider(s);
  expect(await p.createRepository("repo-1")).toEqual({ created: true, name: "repo-1", id: "repo-1" });
  expect(s.calls).toEqual(["create repo-1", "get repo-1", "revokeToken repo-1 creation-plaintext"]);
  expect(s.held.get("creation:repo-1")).toEqual({ name: "repo-1", plaintext: null });

  // Control: the same creation whose revocation is refused is owed, by a nonsecret handle.
  s.calls.length = 0;
  s.script.revoke = () => false;
  expect(await p.createRepository("repo-2")).toEqual({ created: true, name: "repo-2", id: "repo-2", credential: "creation:repo-2" });
  s.script.revoke = () => { throw new Error("connection reset"); };
  expect(await p.createRepository("repo-3")).toEqual({ created: true, name: "repo-3", id: "repo-3", credential: "creation:repo-3" });
  expect(s.calls.filter((call) => call.startsWith("create"))).toEqual(["create repo-2", "create repo-3"]);
  // The owed revocation sends the held plaintext once, and drops it when confirmed.
  s.calls.length = 0;
  s.script.revoke = () => true;
  expect(await p.revokeCredential("creation:repo-2")).toEqual({ revoked: true, credential: "creation:repo-2" });
  expect(s.calls).toEqual(["get repo-2", "revokeToken repo-2 creation-plaintext"]);
  expect(await p.revokeCredential("creation:repo-2")).toBeNull();
  expect(s.calls).toHaveLength(2);
  s.script.revoke = () => false;
  expect(await p.revokeCredential("creation:repo-3")).toEqual({ revoked: false, credential: "creation:repo-3" });
  expect(s.held.get("creation:repo-3")?.plaintext).toBe("creation-plaintext");
  s.script.revoke = () => { throw new Error("connection reset"); };
  expect(await p.revokeCredential("creation:repo-3")).toBeNull();
  expect(s.held.get("creation:repo-3")?.plaintext).toBe("creation-plaintext");

  // Refusals: a taken name, a refused name; an unknown failure and an
  // unstated code are no answer. One call each.
  s.calls.length = 0;
  s.script.create = () => { throw refused("ALREADY_EXISTS"); };
  expect(await p.createRepository("taken-1")).toEqual({ created: false, name: "taken-1", nameExists: true });
  s.script.create = () => { throw refused("INVALID_REPO_NAME"); };
  expect(await p.createRepository("bad-1")).toEqual({ created: false, name: "bad-1", nameExists: false });
  s.script.create = () => { throw Object.assign(new Error("internal"), { code: "INTERNAL_ERROR", numericCode: 10400 }); };
  expect(await p.createRepository("lost-1")).toBeNull();
  s.script.create = () => { throw Object.assign(new Error("taken"), { code: "ALREADY_EXISTS" }); };
  expect(await p.createRepository("lost-2")).toBeNull();
  s.script.create = (name) => ({ name: `${name}-other`, remote: "", token: "creation-plaintext" });
  expect(await p.createRepository("lost-3")).toBeNull();
  expect(s.calls).toEqual(["create taken-1", "create bad-1", "create lost-1", "create lost-2", "create lost-3"]);

  // Wrong remote: revoke the returned token, but record no confirmed metadata.
  s.calls.length = 0;
  s.script.create = (name) => ({ name, remote: "https://elsewhere.invalid/repo.git", token: "creation-plaintext" });
  s.script.revoke = () => true;
  expect(await p.createRepository("wrong-remote")).toBeNull();
  expect(s.calls).toEqual(["create wrong-remote", "get wrong-remote", "revokeToken wrong-remote creation-plaintext"]);

  // Failed durable custody cannot produce a cleanup handle with no secret.
  s.calls.length = 0;
  s.script.create = (name) => ({ name, remote: `https://${SERVICE}/git/${NAMESPACE}/${name}.git`, token: "creation-plaintext" });
  const failedCustody = provider(s, undefined, undefined, { ...s.custody, hold: () => { throw new Error("storage failed"); } });
  s.script.revoke = () => false;
  expect(await failedCustody.createRepository("custody-failed")).toBeNull();
  expect(s.held.has("creation:custody-failed")).toBe(false);
  // A silent failed hold or a conflicting retained token is no custody
  // for this creation, even though hold did not throw.
  const noCustody = provider(s, undefined, undefined, { ...s.custody, hold: () => {} });
  expect(await noCustody.createRepository("custody-missing")).toBeNull();
  s.held.set("creation:custody-conflict", { name: "custody-conflict", plaintext: "another-token" });
  expect(await p.createRepository("custody-conflict")).toBeNull();
  // Immediate confirmed revocation needs no retained cleanup handle.
  s.script.revoke = () => true;
  expect(await failedCustody.createRepository("custody-revoked")).toEqual({ created: true, name: "custody-revoked", id: "custody-revoked" });

  s.calls.length = 0;
  expect(await p.deleteRepository("repo-1", "repo-1")).toEqual({ deleted: true, id: "repo-1" });
  s.script.delete = () => false;
  expect(await p.deleteRepository("repo-2", "repo-2")).toEqual({ deleted: false, id: "repo-2" });
  expect(await p.deleteRepository("repo-1", "repo-2")).toBeNull();
  s.script.delete = () => { throw refused("NOT_FOUND"); };
  expect(await p.deleteRepository("repo-4", "repo-4")).toEqual({ deleted: false, id: "repo-4" });
  s.script.delete = () => { throw new Error("connection reset"); };
  expect(await p.deleteRepository("repo-5", "repo-5")).toBeNull();
  expect(s.calls).toEqual(["delete repo-1", "delete repo-2", "delete repo-4", "delete repo-5"]);
});

// Invariant: each read uses a read token minted for it and revoked after,
// only at the remote that the service itself reports for the recorded name.
test("scripted smart HTTP: ref, format and objects read with a read token minted for the read and revoked after, at the service's own remote", async () => {
  const s = service();
  const blob = { id: idOf("blob", utf8("hello\n")), type: "blob" as const, data: utf8("hello\n") };
  const built = snapshotCommit([{ path: "hello.txt", mode: "100644", id: blob.id }], "first\n");
  const objects: RawGitObject[] = [blob, ...built.objects.map((object) => ({ id: object.id, type: object.type, data: object.data }))];
  const requests: { url: string; authorization: string | null }[] = [];
  const pack = await buildPack(objects, { maxBytes: 1024 * 1024 });
  const p = provider(s, async (request) => {
    requests.push({ url: request.url, authorization: request.headers.get("authorization") });
    if (request.url.endsWith("/info/refs?service=git-upload-pack")) return uploadAdvertisement({ "refs/heads/main": built.commit });
    if (request.url.endsWith("/git-upload-pack")) {
      const answer = new Uint8Array(8 + pack.length);
      answer.set(utf8(pkt("NAK\n")));
      answer.set(pack, 8);
      return response(answer, "application/x-git-upload-pack-result");
    }
    throw new Error("unscripted");
  });
  expect(await p.ref(repository, "refs/heads/main")).toBe(built.commit);
  expect(s.calls).toEqual(["get repo-1", "info repo-1", `createToken repo-1 read ${READ_TTL}`, "revokeToken repo-1 read-plaintext-1"]);
  expect(requests).toEqual([{ url: `${REMOTE}/info/refs?service=git-upload-pack`, authorization: "Bearer read-plaintext-1" }]);
  expect(await p.format(repository)).toBe("sha1");
  const read = await p.objects(repository, built.commit);
  expect(new Set(read.map((object) => object.id))).toEqual(new Set([built.commit, built.tree, blob.id]));
  expect(s.calls.filter((call) => call.startsWith("revokeToken"))).toEqual(["revokeToken repo-1 read-plaintext-1", "revokeToken repo-1 read-plaintext-2", "revokeToken repo-1 read-plaintext-3"]);
  expect(requests.every((request) => request.url.startsWith(`${REMOTE}/`) && request.authorization?.startsWith("Bearer read-plaintext-"))).toBe(true);

  // A failed read still revokes its token.
  const before = requests.length;
  const missing = await p.objects(repository, "1".repeat(40)).then(() => "answered", () => "failed");
  expect(missing).toBe("failed");
  expect(s.calls.at(-1)).toBe("revokeToken repo-1 read-plaintext-4");
  // Controls: another remote reported by the service, another namespace, an
  // ID that is not the name. Nothing is minted and nothing is fetched.
  s.calls.length = 0;
  const atRequests = requests.length;
  s.script.remote = (name) => `https://elsewhere.invalid/git/${NAMESPACE}/${name}.git`;
  expect(await p.ref(repository, "refs/heads/main").then(() => "answered", () => "failed")).toBe("failed");
  expect(s.calls).toEqual(["get repo-1", "info repo-1"]);
  s.calls.length = 0;
  expect(await p.ref({ ...repository, namespace: "other" }, "refs/heads/main").then(() => "answered", () => "failed")).toBe("failed");
  expect(await p.ref({ ...repository, id: "7" }, "refs/heads/main").then(() => "answered", () => "failed")).toBe("failed");
  expect(s.calls).toEqual([]);
  expect(requests.length).toBe(atRequests);
  expect(atRequests).toBeGreaterThan(before);

  // A malformed token reply sends no HTTP, and its usable plaintext is
  // revoked even when its scope or reported expiry is unacceptable.
  s.script.remote = (name) => `https://${SERVICE}/git/${NAMESPACE}/${name}.git`;
  for (const token of [
    { plaintext: "bad-read-token", scope: "write", expiresAt: "2026-10-07T13:15:00Z" },
    { plaintext: "bad-read-token", expiresAt: "2026-10-07T13:15:00Z" },
    { plaintext: "bad-read-token", scope: "read" },
    { plaintext: "bad-read-token", scope: "read", expiresAt: "2026-02-30T13:15:00Z" },
  ]) {
    s.script.token = () => token;
    expect(await p.ref(repository, "refs/heads/main").then(() => "answered", () => "failed")).toBe("failed");
    expect(s.calls.at(-1)).toBe("revokeToken repo-1 bad-read-token");
  }
  expect(requests.length).toBe(atRequests);
});

// Invariant: a mint is one write token with the service's expiry; the one
// push carries it; accepted, refused and not-sent stay distinct; a
// revocation names the recorded repository.
test("scripted mint and send: one write token with the service's expiry, one push with it, refused and not-sent distinct, revoke at the recorded repository", async () => {
  const s = service();
  const built = snapshotCommit([], "first\n");
  const objects = built.objects.map((object) => ({ id: object.id, kind: object.type, body: object.data }));
  let head: string | null = null;
  let report = "ok refs/heads/main\n";
  const requests: { method: string; url: string; authorization: string | null }[] = [];
  let recorded: typeof repository | null = repository;
  const p = provider(s, async (request) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.get("authorization") });
    if (request.url.endsWith("/info/refs?service=git-receive-pack")) return receiveAdvertisement(head === null ? {} : { "refs/heads/main": head });
    if (request.url.endsWith("/git-receive-pack")) {
      if (report.startsWith("ok ")) head = built.commit;
      return response(`${pkt("unpack ok\n")}${pkt(report)}0000`, "application/x-git-receive-pack-result");
    }
    if (request.url.endsWith("/info/refs?service=git-upload-pack")) return uploadAdvertisement(head === null ? {} : { "refs/heads/main": head });
    throw new Error("unscripted");
  }, () => recorded);
  const minted = await p.mint(repository, binding) as { id: string; ends: string; plaintext: string };
  expect(minted).toEqual({ id: "adapter:local-handle", ends: "2026-10-07T13:15:00Z", plaintext: "write-plaintext-1" });
  expect(s.calls).toEqual(["get repo-1", `createToken repo-1 write ${WRITE_TTL}`]);
  const push = (allowed = true) => p.send({ repository, ref: "refs/heads/main", old: null, commit: built.commit, objects, expectedTree: built.tree, requireParentless: true, token: minted.plaintext, binding, allowed: () => allowed });

  // Not sent: the live check fails just before the POST.
  expect(await push(false)).toEqual({ send: "not-sent" });
  expect(requests.some((request) => request.method === "POST")).toBe(false);
  // Refused: the service's whole answer refuses the update.
  report = "ng refs/heads/main denied\n";
  expect(await push()).toEqual({ send: "refused" });
  // Accepted: the update applies and the read-back shows it.
  report = "ok refs/heads/main\n";
  expect(await push()).toEqual({ send: "accepted" });
  const posts = requests.filter((request) => request.method === "POST");
  expect(posts).toEqual([
    { method: "POST", url: `${REMOTE}/git-receive-pack`, authorization: "Bearer write-plaintext-1" },
    { method: "POST", url: `${REMOTE}/git-receive-pack`, authorization: "Bearer write-plaintext-1" },
  ]);
  // Not sent: the ref has moved since; compare-and-swap is never forced.
  expect(await push()).toEqual({ send: "not-sent" });
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(2);

  s.calls.length = 0;
  expect(await p.revoke("adapter:local-handle", minted.plaintext)).toEqual({ revoked: true, id: "adapter:local-handle" });
  expect(s.calls).toEqual(["get repo-1", "revokeToken repo-1 write-plaintext-1"]);
  recorded = null;
  expect(await p.revoke("adapter:local-handle", minted.plaintext).then(() => "answered", () => "failed")).toBe("failed");
  // A stated refusal of the mint is the answer; an unknown failure is none.
  s.script.token = () => { throw refused("INVALID_TTL"); };
  expect(await p.mint(repository, binding)).toEqual({ minted: false });
  s.script.token = () => { throw new Error("connection reset"); };
  expect(await p.mint(repository, binding).then(() => "answered", () => "failed")).toBe("failed");
  for (const token of [
    { plaintext: "bad-write-token", scope: "read", expiresAt: "2026-10-07T13:15:00Z" },
    { plaintext: "bad-write-token", expiresAt: "2026-10-07T13:15:00Z" },
    { plaintext: "bad-write-token", scope: "write", expiresAt: "2026-02-30T13:15:00Z" },
    { plaintext: "bad-write-token", scope: "write" },
  ]) {
    s.script.token = () => token;
    expect(await p.mint(repository, binding).then(() => "answered", () => "failed")).toBe("failed");
  }
});

// Invariant: mintRead sends the requested lifetime once and accepts only an
// explicit read scope and the service's valid reported ISO expiry.
test("scripted mintRead requires explicit read scope and an actual ISO expiry, with no inferred TTL", async () => {
  const s = service();
  const p = provider(s);
  const request = { handle: "adapter:member-read", seconds: 3600 };
  expect(await p.mintRead(repository, request)).toEqual({ id: request.handle, ends: "2026-10-07T13:15:00Z", plaintext: "read-plaintext-1" });
  expect(s.calls).toEqual(["get repo-1", "createToken repo-1 read 3600"]);
  for (const token of [
    { plaintext: "bad-read-token", scope: "write", expiresAt: "2026-10-07T13:15:00Z" },
    { plaintext: "bad-read-token", expiresAt: "2026-10-07T13:15:00Z" },
    { plaintext: "bad-read-token", scope: "read" },
    { plaintext: "bad-read-token", scope: "read", expiresAt: 1791378900000 },
    { plaintext: "bad-read-token", scope: "read", expiresAt: "October 7, 2026" },
    { plaintext: "bad-read-token", scope: "read", expiresAt: "2026-02-30T13:15:00Z" },
  ]) {
    s.calls.length = 0;
    s.script.token = () => token;
    expect(await p.mintRead(repository, request).then(() => "answered", () => "failed")).toBe("failed");
    expect(s.calls).toEqual(["get repo-1", "createToken repo-1 read 3600"]);
  }
  // Stated refusal and loss remain distinct; neither is retried.
  s.script.token = () => { throw refused("INVALID_TTL"); };
  expect(await p.mintRead(repository, request)).toEqual({ minted: false });
  s.script.token = () => { throw new Error("connection reset"); };
  expect(await p.mintRead(repository, request).then(() => "answered", () => "failed")).toBe("failed");
  s.calls.length = 0;
  expect(await p.mintRead({ ...repository, namespace: "other" }, request).then(() => "answered", () => "failed")).toBe("failed");
  expect(s.calls).toEqual([]);
});
