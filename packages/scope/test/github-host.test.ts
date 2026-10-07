import { expect, test } from "vitest";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { valueDigest } from "@generalbusiness/artroom-derive";
import { Reader, idOf, snapshotCommit, type GitSource, type SnapshotFile } from "@generalbusiness/artroom-git";
import { DESTINATION_CHANGED_SET, isJudgeChanges } from "@generalbusiness/artroom-platform";
import { GitHubProvider, inspectGit } from "../src/github-host.ts";
import type { DestinationBinding, DestinationInspection } from "../src/destination-host.ts";

const repository = { host: "github.com", namespace: "demo", name: "repo", id: "71" };
// A scripted in-memory object store, containing real Git object bytes checked
// by Reader. No provider, HTTP server, credential or scope history runs here.
function fixture() {
  const objects = new Map<string, { type: "commit" | "tree" | "blob"; data: Uint8Array }>();
  const put = (type: "commit" | "tree" | "blob", data: Uint8Array): string => { const id = idOf(type, data); objects.set(id, { type, data }); return id; };
  const blob = (text: string): string => put("blob", utf8(text));
  const tree = (files: SnapshotFile[]): string => {
    const built = snapshotCommit(files, "fixture\n");
    for (const object of built.objects) objects.set(object.id, { type: object.type, data: object.data });
    return built.tree;
  };
  const commit = (tree: string, parents: string[]) => put("commit", utf8(`tree ${tree}\n${parents.map((id) => `parent ${id}\n`).join("")}author Fixture <fixture@artroom.invalid> 0 +0000\ncommitter Fixture <fixture@artroom.invalid> 0 +0000\n\nfixture\n`));
  const source = (head: string): GitSource => ({
    object: async (id) => { const object = objects.get(id); return object ? { type: object.type, size: object.data.length, data: object.data } : null; },
    ref: async () => head, refs: async () => [{ ref: "refs/heads/main", target: head }],
  });
  return { objects, put, blob, tree, commit, source };
}

// Invariant: inspection derives actual closure, parent, ancestry and changes;
// link chains include directory substitution and keep old-only broken links.
test("scripted object store inspection derives verified ancestry and complete old/new symbolic-link chains", async () => {
  const f = fixture();
  const unchanged: SnapshotFile[] = [
    { path: "alias", mode: "120000", id: f.blob("dir") },
    { path: "chain", mode: "120000", id: f.blob("alias/file.txt") },
    { path: "repeat", mode: "120000", id: f.blob("alias/../alias/file.txt") },
    { path: "self", mode: "120000", id: f.blob("self/file.txt") },
    { path: "root", mode: "120000", id: f.blob("dir/..") },
    { path: "absolute", mode: "120000", id: f.blob("/dir/file.txt") },
    { path: "cycle-a", mode: "120000", id: f.blob("cycle-b") },
    { path: "cycle-b", mode: "120000", id: f.blob("cycle-a") },
  ];
  const baseTree = f.tree([...unchanged, { path: "dir/file.txt", mode: "100644", id: f.blob("before\n") }, { path: "outside", mode: "120000", id: f.blob("../escape") }]);
  const nextBlob = f.blob("after\n");
  const nextTree = f.tree([...unchanged, { path: "dir/file.txt", mode: "100755", id: nextBlob }]);
  const base = f.commit(baseTree, []);
  const integration = f.commit(nextTree, [base]);
  const other = f.commit(f.tree([]), []);
  const context: DestinationInspection = { repository, ref: "refs/heads/main", recorded: base, base, integration, tree: nextTree, reports: [base, integration, other] };
  const result = await inspectGit(new Reader(f.source(base)), context);
  expect(result.evidence).toMatchObject({ head: base, present: true, tree: nextTree, firstParent: base, ancestors: [base, integration] });
  const retained = result.retain?.[0];
  expect(retained?.domain).toBe(DESTINATION_CHANGED_SET.domain);
  const changes = JSON.parse(retained!.bytes);
  expect(isJudgeChanges(changes)).toBe(true);
  expect(changes).toEqual({ paths: ["dir/file.txt", "outside"], unreadable: 0, links: [
    { path: "absolute", tree: "both", resolves: null },
    { path: "alias", tree: "both", resolves: ["dir"] },
    { path: "chain", tree: "both", resolves: ["alias", "dir/file.txt"] },
    { path: "cycle-a", tree: "both", resolves: null },
    { path: "cycle-b", tree: "both", resolves: null },
    { path: "outside", tree: "old", resolves: null },
    { path: "repeat", tree: "both", resolves: ["alias", "alias", "dir/file.txt"] },
    { path: "root", tree: "both", resolves: [""] },
    { path: "self", tree: "both", resolves: null },
  ] });
  expect(retained!.bytes).toBe(canonicalize(changes));
  expect(result.evidence.changes).toBe(valueDigest(DESTINATION_CHANGED_SET.domain, changes));
  f.objects.delete(nextBlob);
  const incomplete = await inspectGit(new Reader(f.source(base)), context).then(() => "answered", () => "pending");
  expect(incomplete).toBe("pending"); // Never count a named but missing blob as a complete present closure.
});

// Invariant: a finite expansion beyond the work bound supplies no broken-link
// fact or retained changed-set value. The object store is scripted, as above.
test("scripted object store inspection leaves finite symbolic-link work exhaustion pending", async () => {
  const f = fixture();
  const base = f.commit(f.tree([]), []);
  const tree = f.tree([
    { path: "a0", mode: "120000", id: f.blob("dir") },
    { path: "a1", mode: "120000", id: f.blob("a0/../".repeat(600) + "a0") },
    { path: "a2", mode: "120000", id: f.blob("a1/../".repeat(600) + "a1") },
    { path: "dir/file.txt", mode: "100644", id: f.blob("present\n") },
  ]);
  const integration = f.commit(tree, [base]);
  const result = await inspectGit(new Reader(f.source(base)), { repository, ref: "refs/heads/main", recorded: base, base, integration, tree, reports: [] })
    .then((result) => ({ state: "answered", result }), () => ({ state: "pending" }));
  expect(result).toEqual({ state: "pending" });
}, 30_000);

// Invariant: changed raw paths that are not text are counted, not discarded.
test("scripted object store inspection counts a changed non-UTF8 path", async () => {
  const f = fixture();
  const base = f.commit(f.tree([]), []);
  const blob = f.blob("bytes\n");
  const prefix = utf8("100644 ");
  const raw = new Uint8Array(prefix.length + 2 + 20);
  raw.set(prefix);
  raw[prefix.length] = 255;
  raw.set(Uint8Array.from(blob.match(/../g)!, (byte) => parseInt(byte, 16)), prefix.length + 2);
  const tree = f.put("tree", raw);
  const integration = f.commit(tree, [base]);
  const result = await inspectGit(new Reader(f.source(base)), { repository, ref: "refs/heads/main", recorded: base, base, integration, tree, reports: [] });
  expect(JSON.parse(result.retain![0]!.bytes)).toEqual({ paths: [], links: [], unreadable: 1 });
});

// Invariant: a lost creation answer stays unknown and cleanup cannot use broad
// or wrong-repository authority. A real Worker RSA key signs a restricted mint.
// HTTP, custody mapping and the binding's operation/scope are stand-ins.
test("scripted GitHub provider creation loss and mismatched cleanup stay pending without a second mutation; Worker RSA signs a restricted mint", async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey) as ArrayBuffer);
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(Array.from(privateBytes, (byte) => String.fromCharCode(byte)).join(""))}\n-----END PRIVATE KEY-----\n`;
  const token = "ghs_scripted-private";
  let calls = 0;
  let lost = true;
  let readToken: string | undefined = token;
  let repositoryId = 71;
  let cleanupId = 72;
  let mintRequest: Request | undefined;
  const requests: { url: string; authorization: string | null; redirect: string }[] = [];
  const pkt = (text: string) => `${(text.length + 4).toString(16).padStart(4, "0")}${text}`;
  const scriptedRepository = () => ({ id: repositoryId, name: "repo", owner: { id: 17, login: "demo", type: "Organization" }, private: false, full_name: "demo/repo", html_url: "https://github.com/demo/repo", clone_url: "https://github.com/demo/repo.git" });
  const provider = new GitHubProvider({
    host: "github.com", namespace: "demo", maxBytes: 4096,
    app: { issuer: "fixture", privateKey, installationId: 99, account: { id: 17, login: "demo", type: "Organization" }, now: () => Date.parse("2026-10-06T12:00:00Z"), fetch: async (request) => {
      calls++;
      requests.push({ url: request.url, authorization: request.headers.get("authorization"), redirect: request.redirect });
      if (lost) throw new Error(token);
      if (request.url.endsWith("/app/installations/99/access_tokens")) {
        mintRequest = request;
        return new Response(JSON.stringify({ token, expires_at: "2026-10-06T13:00:00Z", repository_selection: "selected", permissions: { contents: "write", metadata: "read" }, repositories: [scriptedRepository()] }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (new URL(request.url).hostname === "api.github.com") return new Response(JSON.stringify(scriptedRepository()), { headers: { "content-type": "application/json" } });
      return new Response(`${pkt("# service=git-upload-pack\n")}0000${pkt(`${"1".repeat(40)} refs/heads/main\0ofs-delta\n`)}0000`, { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
    } },
    creation: { plaintext: token, private: true },
    readCredential: async () => readToken,
    credentialHandle: async () => "caller-owned-local-handle",
    cleanupRepository: async () => ({ name: "repo", token: { plaintext: token, expiresAt: "2026-10-06T13:00:00Z", repositoryIds: [cleanupId], permissions: { administration: "write" } } }),
  });
  expect(await provider.createRepository("repo")).toBeNull();
  expect(calls).toBe(1);
  expect(await provider.deleteRepository("71", "repo")).toBeNull();
  expect(calls).toBe(1);
  cleanupId = 71;
  expect(await provider.deleteRepository("71", "other-sealed-name")).toBeNull();
  expect(calls).toBe(1);
  lost = false;
  expect(await provider.ref(repository, "refs/heads/main")).toBe("1".repeat(40));
  expect(requests[1]!.authorization).toBe(`Bearer ${token}`);
  expect(requests[2]!.authorization).toBe(`Basic ${btoa(`x-access-token:${token}`)}`);
  expect(requests.every((request) => request.redirect === "manual" && !request.url.includes(token))).toBe(true);
  const format = await provider.format(repository).then((value) => value, () => "pending");
  expect(format).toBe("sha1");
  expect(requests.slice(-2).map((request) => request.authorization)).toEqual([`Bearer ${token}`, `Basic ${btoa(`x-access-token:${token}`)}`]);
  readToken = undefined;
  expect(await provider.ref(repository, "refs/heads/main")).toBe("1".repeat(40));
  expect(requests.slice(-2).map((request) => request.authorization)).toEqual([null, null]);
  const beforeReplacement = calls;
  repositoryId = 72;
  const replacement = await provider.ref(repository, "refs/heads/main").then(() => "answered", () => "pending");
  expect(replacement).toBe("pending");
  expect(calls).toBe(beforeReplacement + 1); // ID mismatch never asks Git at the replacement's name.
  repositoryId = 71;
  const binding: DestinationBinding = { scope: { scope: "sc_scripted", inc: "in_scripted", kind: "destination" }, mint: "1:0", attempt: 1, write: "2:0", writeAttempt: 1, ref: "refs/heads/main" };
  expect(await provider.mint(repository, binding)).toEqual({ id: "caller-owned-local-handle", ends: "2026-10-06T13:00:00Z", plaintext: token });
  expect(calls).toBe(beforeReplacement + 2); // Exactly one POST; no bootstrap GET hidden in mint.
  expect(mintRequest?.method).toBe("POST");
  expect(mintRequest?.url).toBe("https://api.github.com/app/installations/99/access_tokens");
  expect(await mintRequest!.json()).toEqual({ repository_ids: [71], permissions: { contents: "write" } });
  const jwt = mintRequest!.headers.get("authorization")!.slice("Bearer ".length).split(".");
  const decode = (part: string) => atob(part.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
  expect(JSON.parse(decode(jwt[0]!))).toEqual({ alg: "RS256", typ: "JWT" });
  const now = Date.parse("2026-10-06T12:00:00Z") / 1000;
  expect(JSON.parse(decode(jwt[1]!))).toEqual({ iat: now - 60, exp: now + 540, iss: "fixture" });
  expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, Uint8Array.from(decode(jwt[2]!), (byte) => byte.charCodeAt(0)), utf8(`${jwt[0]}.${jwt[1]}`))).toBe(true);
  expect(JSON.stringify(provider)).not.toContain(token);
});
