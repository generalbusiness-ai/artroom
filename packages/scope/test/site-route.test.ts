import { env } from "cloudflare:workers";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { Intent, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, scopeIdOf, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER } from "@generalbusiness/artroom-platform";
import { idOf, snapshotCommit, type SnapshotFile } from "@generalbusiness/artroom-git";
import { buildPack, type RawGitObject } from "@generalbusiness/artroom-git/http";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { artifactsOutside } from "../src/artifacts-wiring.ts";
import type { SiteEnv } from "../src/site/host.ts";
import { FILE_BYTES, redacted, site } from "../src/site/route.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { Platform, rita, sam, settle } from "./repository.ts";
import { platformOutside } from "./worker.ts";

// The site route on a real register and directory, under the deployed class in the namespace `PLATFORM`, with the platform
// package's rules. The register's claim creates the repository through the production wiring of the hosting's own Git service,
// and the directory records it.
//
// | Part | Is |
// |---|---|
// | The register and the directory | Real scopes. The directory's children are created and have no Git host. |
// | The hosting's own Git service | A STAND-IN: `Scripted`, a binding double whose every answer the test writes, and a scripted fetch for its smart-HTTP upload-pack. Its refs and objects are a map; no repository exists. |
// | The clock and the readers | The namespace's scripted clock and the test readers, as in every test of `PLATFORM`. The site route reads no session. |
//
// Tests that only read share the one founding. The cache test moves one branch of the stand-in host, which no other test reads.

const NAMESPACE = "artroom-demo";
const SERVICE = "service.invalid";
const MAX_BYTES = 8 * 1024 * 1024;
const { paul } = keys;

const pkt = (text: string) => `${(utf8(text).length + 4).toString(16).padStart(4, "0")}${text}`;
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** STAND-IN for the hosting's own Git service: the binding and its smart-HTTP upload-pack, over a map of refs and objects. */
class Scripted {
  name: string | null = null;
  readonly refs = new Map<string, string>();
  readonly objects = new Map<string, RawGitObject>();
  readonly minted: string[] = [];
  readonly revoked = new Set<string>();
  packs = 0;
  /** What the service is scripted to answer: the field that holds a minted token, the remote that `info` reports, and a failure. */
  tokenField: "plaintext" | "token" = "plaintext";
  reported: ((name: string) => string) | null = null;
  failing: "get" | "info" | "token" | "refs" | "pack" | null = null;
  readonly remote = (name: string) => `https://${SERVICE}/git/${NAMESPACE}/${name}.git`;
  readonly ns: ArtifactsNamespace = {
    get: async (name) => {
      if (this.failing === "get") throw new TypeError("scripted: no such binding method");
      return {
        createToken: async (scope, ttl) => {
          expect([scope, ttl]).toEqual(["read", 120]);
          if (this.failing === "token") throw new Error("scripted: createToken refused");
          const plaintext = `read-plaintext-${this.minted.length + 1}`;
          this.minted.push(plaintext);
          return { id: `tok-${this.minted.length}`, [this.tokenField]: plaintext, scope, expiresAt: "2026-10-07T13:15:00Z" };
        },
        revokeToken: async (token) => { this.revoked.add(token); return true; },
        info: async () => {
          if (this.failing === "info") throw new Error("scripted: info failed");
          return { name, remote: (this.reported ?? this.remote)(name) };
        },
      };
    },
    create: async (name) => {
      expect(this.name).toBeNull();
      this.name = name;
      return { name, remote: this.remote(name), token: "creation-plaintext" };
    },
    delete: async () => false,
  };

  /** A commit of these files, its objects added; the answer is its ID. */
  commit(files: Record<string, string | Uint8Array>, message: string): string {
    const listed: SnapshotFile[] = [];
    for (const [path, content] of Object.entries(files)) {
      const data = typeof content === "string" ? utf8(content) : content;
      const id = idOf("blob", data);
      this.objects.set(id, { id, type: "blob", data });
      listed.push({ path, mode: "100644", id });
    }
    const built = snapshotCommit(listed, message);
    for (const object of built.objects) this.objects.set(object.id, { id: object.id, type: object.type, data: object.data });
    return built.commit;
  }

  readonly fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    expect(url.origin + url.pathname.replace(/\/(info\/refs|git-upload-pack)$/, "")).toBe(this.remote(this.name!));
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!this.minted.includes(token) || this.revoked.has(token)) return new Response("no", { status: 401 });
    if (this.failing === "refs" && url.pathname.endsWith("/info/refs")) return new Response("scripted", { status: 500 });
    if (this.failing === "pack" && url.pathname.endsWith("/git-upload-pack")) return new Response("scripted", { status: 403, headers: { "content-type": "text/plain" } });
    if (request.method === "GET" && url.pathname.endsWith("/info/refs") && url.searchParams.get("service") === "git-upload-pack") {
      const lines = [...this.refs].map(([ref, id], i) => pkt(`${id} ${ref}${i === 0 ? "\0ofs-delta allow-reachable-sha1-in-want\n" : "\n"}`));
      return new Response(`${pkt("# service=git-upload-pack\n")}0000${lines.join("")}0000`, { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
    }
    if (request.method === "POST" && url.pathname.endsWith("/git-upload-pack")) {
      this.packs++;
      // Every object, whatever is wanted: the source keeps what it was sent and checks each object it reads.
      const pack = await buildPack([...this.objects.values()], { maxBytes: MAX_BYTES });
      return new Response(join(utf8(pkt("NAK\n")), pack), { headers: { "content-type": "application/x-git-upload-pack-result" } });
    }
    return new Response("unscripted", { status: 404 });
  };
}

const host = new Scripted();
let D: Platform;
let R: Platform;
let siteEnv: SiteEnv;
const get = (path: string, init?: RequestInit, environment: SiteEnv = siteEnv) => site(new Request(`https://scopes.test${path}`, init), environment, host.fetch);
const prior = { hold: net.hold, deaf: net.deaf };

beforeAll(async () => {
  net.hold = net.deaf = null;
  const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "artifacts", namespace: NAMESPACE, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const registerSeed: Seed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 };
  R = new Platform(scopeIdOf(registerSeed));
  siteEnv = { SCOPES: env.PLATFORM, ARTIFACTS: host.ns, ARTIFACTS_CONFIG: canonicalize({ registerScope: R.name, namespace: NAMESPACE, host: SERVICE, maxBytes: MAX_BYTES, credentialIdentity: "adapter-attempt" }) };
  platformOutside.set(R.name, (given, sql) => artifactsOutside(given, sql, siteEnv, host.fetch));
  expect(await R.stub.found(signIntent(install, paul.secret), REGISTER)).toMatchObject({ answer: "accepted" });
  const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
  D = new Platform(scopeIdOf({ v: 1, kind: "directory", definition: DIRECTORY, creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 }));
  expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted" });
  await (R.stub as unknown as { effect(): Promise<number> }).effect();
  await settle(R, D);
  expect(await D.item(0)).toMatchObject({ values: { repository: { host: "artifacts", namespace: NAMESPACE, name: host.name, id: host.name }, branch: "main" } });

  const first = host.commit({
    "README.md": "# Handbook\n\nRead [the guide](docs/guide.md), <b onclick=\"alert(1)\">inline</b>.\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n",
    "docs/index.md": "# Docs\n\nThe [guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\n## Setup\n\n## Setup\n\nBack [home](../README.md), [the top](/README.md), [elsewhere](https://example.com/x), [setup](#setup).\n\n![A diagram](diagram.png)\n\n| a | b |\n| - | :-: |\n| 1 | ~~2~~ |\n\n- [x] done\n- [ ] not yet\n",
    "docs/diagram.png": PNG,
    "notes/a.txt": "plain\n",
    "notes/b.md": "b\n",
    "big.md": "a".repeat(FILE_BYTES + 1),
  }, "first\n");
  host.refs.set("refs/heads/main", first);
  host.refs.set("refs/heads/moving", first);
  host.refs.set("refs/tags/v1", first);
  host.refs.set("refs/tags/empty", host.commit({}, "empty\n"));
});

afterAll(() => {
  net.hold = prior.hold;
  net.deaf = prior.deaf;
  platformOutside.delete(R.name);
});

const page = async (response: Response) => ({ status: response.status, type: response.headers.get("content-type"), body: await response.text() });

// Invariant: a markdown file at a ref of the room's repository answers as HTML, its relative links and images under the same
// prefix, raw HTML and a javascript: address made inert; every read token minted for it is revoked.
test("a page: a markdown file at HEAD, at its branch and at a tag renders as HTML with relative links under /site, headings with GitHub's ids, and raw HTML escaped (STAND-IN host)", async () => {
  const at = `/site/${D.name}/HEAD/docs/guide.md`;
  const response = await get(at);
  expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  const guide = await page(response);
  expect(guide).toMatchObject({ status: 200, type: "text/html; charset=utf-8" });
  const prefix = `/site/${D.name}/HEAD/`;
  for (const part of [
    "<title>Guide</title>",
    '<h1 id="guide">Guide</h1>', '<h2 id="setup">Setup</h2>', '<h2 id="setup-1">Setup</h2>',
    `<a href="${prefix}README.md">home</a>`, `<a href="${prefix}README.md">the top</a>`,
    '<a href="https://example.com/x">elsewhere</a>', '<a href="#setup">setup</a>',
    `<img src="${prefix}docs/diagram.png" alt="A diagram" />`,
    '<th align="center">b</th>', '<td align="center"><del>2</del></td>',
    '<li><input checked="" disabled="" type="checkbox"> done</li>',
  ]) expect(guide.body).toContain(part);

  const readme = await page(await get(`/site/${D.name}/HEAD/README.md`));
  expect(readme.body).toContain(`<a href="${prefix}docs/guide.md">the guide</a>`);
  expect(readme.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(readme.body).toContain("&lt;b onclick=&quot;alert(1)&quot;&gt;inline&lt;/b&gt;");
  expect(readme.body).not.toMatch(/<script|<b /);
  expect(readme.body).toContain('<a href="">x</a>');

  // The same file at the branch by name and at a tag: the same content, under that ref's own prefix.
  for (const ref of ["main", "v1"]) {
    const named = await page(await get(`/site/${D.name}/${ref}/docs/guide.md`));
    expect(named.status).toBe(200);
    expect(named.body).toContain(`<a href="/site/${D.name}/${ref}/README.md">home</a>`);
  }
  expect(host.minted.length).toBeGreaterThan(0);
  expect(host.minted.filter((token) => !host.revoked.has(token))).toEqual([]);
});

// Invariant: a directory answers its index page if it has one, else a listing of its entries.
test("an index: the root answers its README, a directory its index.md, and a directory with neither a listing of its files (STAND-IN host)", async () => {
  const root = await page(await get(`/site/${D.name}/HEAD/`));
  expect(root.status).toBe(200);
  expect(root.body).toContain('<h1 id="handbook">Handbook</h1>');
  // The README is resolved from the root, with or without the trailing slash.
  expect((await page(await get(`/site/${D.name}/HEAD`))).body).toBe(root.body);
  const docs = await page(await get(`/site/${D.name}/HEAD/docs/`));
  expect(docs.body).toContain('<h1 id="docs">Docs</h1>');
  expect(docs.body).toContain(`<a href="/site/${D.name}/HEAD/docs/guide.md">guide</a>`);
  const notes = await page(await get(`/site/${D.name}/HEAD/notes`));
  expect(notes.status).toBe(200);
  expect(notes.body).toContain(`<li><a href="/site/${D.name}/HEAD/notes/a.txt">a.txt</a></li>`);
  expect(notes.body).toContain(`<li><a href="/site/${D.name}/HEAD/notes/b.md">b.md</a></li>`);
});

// Invariant: an image that a page names answers as its bytes, with its type, and runs nothing.
test("a relative image: the address a page writes answers the image's bytes with its type (STAND-IN host)", async () => {
  const guide = await page(await get(`/site/${D.name}/HEAD/docs/guide.md`));
  const src = /<img src="([^"]+)"/.exec(guide.body)![1]!;
  const image = await get(src);
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/png");
  expect(image.headers.get("content-security-policy")).toContain("sandbox");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  const text = await get(`/site/${D.name}/HEAD/notes/a.txt`);
  expect([text.headers.get("content-type"), text.headers.get("content-disposition")]).toEqual(["application/octet-stream", "attachment"]);
});

// Invariant: a missing page, a missing ref, a file over the bound, a scope that is no room and a host that is not configured
// each answer a plain refusal with its reason and status, and no HTML.
test("refusals: a missing page, a bad ref, a file over the size bound at the real bound, no room, a bad path and no host each answer plain text with a reason and a status (STAND-IN host)", async () => {
  const cases: [string, number, string, SiteEnv?][] = [
    [`/site/${D.name}/HEAD/docs/missing.md`, 404, "not-found"],
    [`/site/${D.name}/HEAD/docs/guide.md/`, 404, "not-found"],
    [`/site/${D.name}/no-such-branch/README.md`, 404, "ref-not-found"],
    [`/site/${D.name}/bad..ref/README.md`, 404, "ref-not-found"],
    [`/site/${D.name}/HEAD/big.md`, 413, "too-large"],
    [`/site/${R.name}/HEAD/README.md`, 404, "not-found"],
    [`/site/not-a-scope/HEAD/README.md`, 404, "not-found"],
    [`/site/${D.name}/HEAD/docs%2Fguide.md`, 400, "bad-request"],
    [`/site/${D.name}/HEAD/%E0%A4%A`, 400, "bad-request"],
    [`/site/${D.name}/HEAD/README.md`, 503, "host-not-configured", { SCOPES: env.PLATFORM }],
    // The host's setting pins another register: this room was not created by it, and its repository is not read.
    [`/site/${D.name}/HEAD/README.md`, 503, "host-not-configured", { ...siteEnv, ARTIFACTS_CONFIG: canonicalize({ registerScope: D.name, namespace: NAMESPACE, host: SERVICE, maxBytes: MAX_BYTES, credentialIdentity: "adapter-attempt" }) }],
  ];
  for (const [path, status, reason, environment] of cases) {
    const response = await get(path, undefined, environment);
    const body = await response.text();
    expect([path, response.status, response.headers.get("content-type"), response.headers.get("cache-control")]).toEqual([path, status, "text/plain; charset=utf-8", "no-store"]);
    expect(body.startsWith(`${reason}: `)).toBe(true);
    expect(body).not.toContain("<");
  }
  // The bound is the real one: a file of exactly FILE_BYTES is read; one byte more is refused above.
  const edge = host.commit({ "edge.md": "a".repeat(FILE_BYTES) }, "edge\n");
  host.refs.set("refs/tags/edge", edge);
  expect((await get(`/site/${D.name}/edge/edge.md`)).status).toBe(200);
  expect((await get(`/site/${D.name}/HEAD/README.md`, { method: "POST" })).status).toBe(405);
});

// Invariant: the ETag is the commit and the path: the same for the same commit and path, new for a new commit or another path,
// and a request that names it is answered 304 before any object is read.
test("cache: same commit, same ETag, and If-None-Match answers 304 without reading the pack; a new commit, a new ETag (STAND-IN host)", async () => {
  const at = `/site/${D.name}/moving/docs/guide.md`;
  const first = await get(at);
  const etag = first.headers.get("etag")!;
  expect(first.headers.get("cache-control")).toBe("public, max-age=60");
  expect(etag).toMatch(new RegExp(`^"${host.refs.get("refs/heads/moving")}\\.[0-9a-f]{24}"$`));
  expect((await get(at)).headers.get("etag")).toBe(etag);
  expect((await get(`/site/${D.name}/moving/docs/index.md`)).headers.get("etag")).not.toBe(etag);
  const packs = host.packs;
  const unchanged = await get(at, { headers: { "if-none-match": etag } });
  expect([unchanged.status, await unchanged.text(), unchanged.headers.get("etag")]).toEqual([304, "", etag]);
  expect(host.packs).toBe(packs);

  host.refs.set("refs/heads/moving", host.commit({ "docs/guide.md": "# Guide, again\n" }, "second\n"));
  const moved = await get(at, { headers: { "if-none-match": etag } });
  expect(moved.status).toBe(200);
  expect(moved.headers.get("etag")).not.toBe(etag);
  expect(await moved.text()).toContain('<h1 id="guide-again">Guide, again</h1>');
});

// Invariant: the minted token is read from `plaintext` or from `token`, and the service's reported remote is compared with no
// trailing `/` and no final `.git`; any other remote is refused before a token is minted.
test("binding answers: a token named token, and a remote reported with or without .git and a trailing slash, each read the page; another remote is refused at the step info (STAND-IN host)", async () => {
  const at = `/site/${D.name}/HEAD/README.md`;
  try {
    host.tokenField = "token";
    expect((await get(at)).status).toBe(200);
    host.tokenField = "plaintext";
    for (const form of [(n: string) => `https://${SERVICE}/git/${NAMESPACE}/${n}`, (n: string) => `https://${SERVICE}/git/${NAMESPACE}/${n}/`, (n: string) => `https://${SERVICE}/git/${NAMESPACE}/${n}.git/`]) {
      host.reported = form;
      expect((await get(at)).status).toBe(200);
    }
    host.reported = (n) => `https://elsewhere.invalid/git/${NAMESPACE}/${n}.git`;
    const minted = host.minted.length;
    const other = await get(at);
    expect([other.status, other.headers.get("x-site-step")]).toEqual([502, "info"]);
    expect(host.minted.length).toBe(minted);
  } finally {
    host.tokenField = "plaintext";
    host.reported = null;
  }
});

// Invariant: a failed read names its step in the header x-site-step and in one log line with the error's class and message,
// and neither the body nor the line holds a token or a query.
test("a failure at each step answers the same refusal with x-site-step and logs one redacted line naming the step (STAND-IN host)", async () => {
  const at = `/site/${D.name}/HEAD/README.md`;
  const lines: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
  try {
    for (const [failing, step] of [["get", "open"], ["info", "info"], ["token", "token"], ["refs", "refs"], ["pack", "objects"]] as const) {
      host.failing = failing;
      lines.length = 0;
      const response = await get(at);
      expect([failing, response.status, response.headers.get("x-site-step"), await response.text()]).toEqual([failing, 502, step, "unreadable: the repository could not be read\n"]);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.startsWith(`site ${step}: `)).toBe(true);
      expect(lines[0]).not.toMatch(/read-plaintext|\?service=/);
    }
    // The read's own steps give the last request and its answer, the query left out.
    expect(lines[0]).toMatch(/^site objects: GitRefusal: unreadable: HTTP read response; last request: POST https:\/\/service\.invalid\/git\/.*\/git-upload-pack -> 403 text\/plain$/);
  } finally {
    host.failing = null;
    spy.mockRestore();
  }
  expect(redacted("GET https://u:p@h.invalid/x?token=abc Bearer abc.def secret-1", ["secret-1"])).toBe("GET https://[redacted]@h.invalid/x?[redacted] Bearer [redacted] [redacted]");
});

// Invariant: an empty repository's root answers a plain page that says it has no files, not a refusal.
test("an empty tree: the root of a commit with no files answers a page that says so (STAND-IN host)", async () => {
  const empty = await get(`/site/${D.name}/empty/`);
  expect([empty.status, empty.headers.get("content-type")]).toEqual([200, "text/html; charset=utf-8"]);
  expect(await empty.text()).toContain("<h1>empty</h1>\n<p>The repository has no files at this commit.</p>");
});
