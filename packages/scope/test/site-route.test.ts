import { env } from "cloudflare:workers";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { Intent, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, scopeIdOf, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, receiptObjects } from "@generalbusiness/artroom-platform";
import { idOf, snapshotCommit, type SnapshotFile } from "@generalbusiness/artroom-git";
import { buildPack, type RawGitObject } from "@generalbusiness/artroom-git/http";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { artifactsOutside } from "../src/artifacts-wiring.ts";
import type { Binding } from "../src/namespace.ts";
import type { SiteEnv } from "../src/site/host.ts";
import { FILE_BYTES, redacted, site } from "../src/site/route.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { Platform, rita, sam, settle } from "./repository.ts";
import { platformOutside } from "./worker.ts";
import completeness from "./site/completeness/fixture.md?raw";
import companion from "./site/completeness/companion.md?raw";
import diagram from "./site/completeness/diagram.svg?raw";

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

/** An annotated tag object, which the stand-in host holds beside the objects a push sends. */
interface TagObject { id: string; type: "tag"; data: Uint8Array }

/**
 * A pack with these tag objects added after its own: `buildPack` writes commits, trees and blobs only, which is all a push
 * sends. Each tag is an undeltified entry of type 4, its data deflated; the count and the trailer are written again.
 */
async function withTags(pack: Uint8Array, tags: readonly TagObject[]): Promise<Uint8Array> {
  if (tags.length === 0) return pack;
  const entries: Uint8Array[] = [];
  for (const tag of tags) {
    const head = [(4 << 4) | (tag.data.length & 15)];
    for (let size = tag.data.length >>> 4; size > 0; size >>>= 7) {
      head[head.length - 1]! |= 0x80;
      head.push(size & 0x7f);
    }
    const deflated = new Uint8Array(await new Response(new Blob([tag.data]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    entries.push(Uint8Array.from(head), deflated);
  }
  const body = join(pack.subarray(0, pack.length - 20), ...entries);
  new DataView(body.buffer).setUint32(8, new DataView(pack.buffer, pack.byteOffset).getUint32(8) + tags.length);
  return join(body, new Uint8Array(await crypto.subtle.digest("SHA-1", body)));
}

/** STAND-IN for the hosting's own Git service: the binding and its smart-HTTP upload-pack, over a map of refs and objects. */
class Scripted {
  name: string | null = null;
  readonly refs = new Map<string, string>();
  readonly objects = new Map<string, RawGitObject | TagObject>();
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
      const all = [...this.objects.values()];
      const pack = await withTags(await buildPack(all.filter((o): o is RawGitObject => o.type !== "tag"), { maxBytes: MAX_BYTES }), all.filter((o): o is TagObject => o.type === "tag"));
      return new Response(join(utf8(pkt("NAK\n")), pack), { headers: { "content-type": "application/x-git-upload-pack-result" } });
    }
    return new Response("unscripted", { status: 404 });
  };
}

const host = new Scripted();
// SCRIPTED publication boundary for these renderer/HTTP witnesses. The
// selected-publication test separately exercises actual destination records.
const publishedScopes: Binding = {
  idFromName: (name) => env.PLATFORM.idFromName(name),
  get: (id) => {
    const object = env.PLATFORM.get(id) as unknown as import("../src/site/publication.ts").SitePublicationPeer & { siteRoom(): Promise<import("../src/namespace.ts").Sourced | null> };
    return {
      siteRoom: () => object.siteRoom(),
      siteDestination: () => object.siteDestination(),
      // SCRIPTED proof and matching Git receipt objects; not native publication evidence.
      sitePublishedCommit: async (directory: import("@generalbusiness/artroom-contract").ScopeRef, repository: import("../src/destination-host.ts").DestinationRepository, commit: string) => {
        const actual = await object.sitePublication(directory, repository);
        if (!actual) return { ok: false, reason: "not-published" };
        const fact = { at: actual.at, seq: 1, hash: `sha256:${"a".repeat(64)}` } as const;
        const file = canonicalize({ v: 1, scripted: true, commit });
        const receipt = receiptObjects("sha1", actual.at.scope, "2099-01-01T00:00:00Z", fact, JSON.parse(file));
        const ref = `refs/artroom/receipts/${commit}`;
        host.refs.set(ref, receipt.commit);
        for (const o of receipt.objects) host.objects.set(o.id, { id: o.id, type: o.kind, data: o.body });
        return { ok: true, proof: { at: actual.at, head: actual.head, directory, repository, commit, publication: fact, written: fact,
          receipt: { ref, commit: receipt.commit, tree: receipt.objects.find(o => o.kind === "tree")!.id, blob: receipt.objects.find(o => o.kind === "blob")!.id, file } } };
      },
      sitePublication: async (directory: import("@generalbusiness/artroom-contract").ScopeRef, repository: import("../src/destination-host.ts").DestinationRepository) => {
        const actual = await object.sitePublication(directory, repository);
        return actual && { ...actual, refs: [...host.refs].filter(([ref]) => !ref.startsWith("refs/artroom/receipts/")).map(([ref, target]) => ({ ref, target: ref === "refs/tags/release" ? nav : target })) };
      },
    };
  },
};
let D: Platform;
let R: Platform;
let siteEnv: SiteEnv;
let nav: string;
const get = (path: string, init?: RequestInit, environment: SiteEnv = siteEnv) => site(new Request(`https://scopes.test${path}`, init), environment, host.fetch);
const prior = { hold: net.hold, deaf: net.deaf };

beforeAll(async () => {
  net.hold = net.deaf = null;
  const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "artifacts", namespace: NAMESPACE, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const registerSeed: Seed = { v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 };
  R = new Platform(scopeIdOf(registerSeed));
  siteEnv = { SCOPES: publishedScopes, ARTIFACTS: host.ns, ARTIFACTS_CONFIG: canonicalize({ registerScope: R.name, namespace: NAMESPACE, host: SERVICE, maxBytes: MAX_BYTES, credentialIdentity: "adapter-attempt" }) };
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
    "docs/completeness/fixture.md": completeness,
    "docs/completeness/companion.md": companion,
    "docs/completeness/diagram.svg": diagram,
    "notes/a.txt": "plain\n",
    "notes/b.md": "b\n",
    "big.md": "a".repeat(FILE_BYTES + 1),
  }, "first\n");
  host.refs.set("refs/heads/main", first);
  host.refs.set("refs/heads/moving", first);
  host.refs.set("refs/tags/v1", first);
  host.refs.set("refs/tags/empty", host.commit({}, "empty\n"));

  // The navigation's room: two folders, one with no index page, dot-files, and the tag `nav`; and an annotated tag `release` of it.
  nav = host.commit({
    "README.md": "# Handbook\n\nThe [guide folder](guide), [the notes](notes/) and [the notes again](guide/../notes).\n",
    "guide/start.md": "# Getting *started*\n\nBack to [this folder](./) and [the top](../).\n",
    "guide/plain.md": "No heading here.\n",
    "guide/.hidden.md": "# Hidden\n",
    "guide/.config/x.md": "# X\n",
    "guide/deep/index.md": "# Deep\n",
    "guide/logo.png": PNG,
    "notes/index.md": "# Notes index\n",
  }, "nav\n");
  host.refs.set("refs/tags/nav", nav);
  const tag = utf8(`object ${nav}\ntype commit\ntag release\ntagger Rita <rita@example.invalid> 1791000000 +0000\n\nrelease\n`);
  const tagId = idOf("tag", tag);
  host.objects.set(tagId, { id: tagId, type: "tag", data: tag });
  host.refs.set("refs/tags/release", tagId);
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

// Invariant: one checked-in document renders the supported GFM constructs through Site; its repository links and image
// remain at the requested ref and serve the companion bytes, while the documented safety differences and unsupported syntax
// remain visible. The register/directory are real scopes; the Git host is the labelled stand-in above.
test("GFM completeness fixture: constructs render through Site, relative page and image addresses serve their repository bytes, and documented differences stay visible (STAND-IN host)", async () => {
  const prefix = `/site/${D.name}/HEAD/`;
  const response = await get(`${prefix}docs/completeness/fixture.md`);
  expect([response.status, response.headers.get("content-type")]).toEqual([200, "text/html; charset=utf-8"]);
  const body = await response.text();
  for (const construct of [
    '<h1 id="site-completeness">Site completeness</h1>',
    '<h2 id="getting-started">Getting <em>started</em></h2>',
    '<h2 id="getting-started-1">Getting <em>started</em></h2>',
    '<a href="#getting-started">the first section</a>',
    '<a href="#getting-started-1">the repeated section</a>',
    '<em>Emphasis</em>', '<strong>strong emphasis</strong>', '<del>strikethrough</del>', '<code>inline code</code>',
    '<ul>\n<li>First bullet</li>', '<li>Nested bullet</li>', '<ol>\n<li>First ordered item</li>',
    '<li><input checked="" disabled="" type="checkbox"> Finished task</li>',
    '<li><input disabled="" type="checkbox"> Open task</li>',
    '<th align="left">Feature</th>', '<th align="right">State</th>', '<td align="right">working</td>',
    '<pre><code class="language-ts">const answer = 42;\n</code></pre>',
    '<blockquote>\n<p>A quoted paragraph.</p>\n<p>With another paragraph.</p>\n</blockquote>',
    '<a href="https://example.com/guide">https://example.com/guide</a>',
    '<a href="http://www.example.com">www.example.com</a>',
    '<a href="mailto:reader@example.com">reader@example.com</a>',
    `<a href="${prefix}docs/completeness/companion.md#linked-section">the companion page</a>`,
    `<a href="${prefix}README.md">the repository root</a>`, `<a href="${prefix}docs/index.md">the parent page</a>`,
    `<img src="${prefix}docs/completeness/diagram.svg" alt="Repository diagram" title="A repository image" />`,
    'Inline HTML &lt;em&gt;stays text&lt;/em&gt;.',
    '<pre class="raw-html">&lt;div&gt;Block HTML stays text.&lt;/div&gt;</pre>',
    '<a href="">An unsafe link</a>',
    'a note[^note].', '[^note]: This is ordinary text, not a footnote.', '[[Companion]]',
  ]) expect(body, construct).toContain(construct);
  expect(body).not.toMatch(/<sup|<div>|<em>stays text|href="javascript:/);

  // Follow the addresses written by Site, rather than rebuilding the next requests from the fixture paths.
  const linked = /<a href="([^"]+)">the companion page<\/a>/.exec(body)![1]!;
  const linkedResponse = await get(linked);
  expect(linkedResponse.status).toBe(200);
  expect(await linkedResponse.text()).toContain('<h2 id="linked-section">Linked section</h2>');
  const src = /<img src="([^"]+)" alt="Repository diagram"/.exec(body)![1]!;
  const image = await get(src);
  expect([image.status, image.headers.get("content-type")]).toEqual([200, "image/svg+xml"]);
  expect(image.headers.get("content-security-policy")).toContain("sandbox");
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(utf8(diagram));
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
    [`/site/${D.name}/no-such-branch/README.md`, 404, "not-published"],
    [`/site/${D.name}/bad..ref/README.md`, 404, "not-published"],
    [`/site/${D.name}/HEAD/big.md`, 413, "too-large"],
    [`/site/${R.name}/HEAD/README.md`, 404, "not-found"],
    [`/site/not-a-scope/HEAD/README.md`, 404, "not-found"],
    [`/site/${D.name}/HEAD/docs%2Fguide.md`, 400, "bad-request"],
    [`/site/${D.name}/HEAD/%E0%A4%A`, 400, "bad-request"],
    [`/site/${D.name}/HEAD/README.md`, 503, "host-not-configured", { SCOPES: publishedScopes }],
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
// and a conditional request answers 304 only after the requested representation is validated as servable.
test("cache: same commit, same ETag, and If-None-Match answers 304 only for a servable path; a new commit, a new ETag (STAND-IN host)", async () => {
  const at = `/site/${D.name}/moving/docs/guide.md`;
  const first = await get(at);
  const etag = first.headers.get("etag")!;
  expect(first.headers.get("cache-control")).toBe("public, max-age=60");
  expect(etag).toMatch(new RegExp(`^"${host.refs.get("refs/heads/moving")}\\.[0-9a-f]{24}"$`));
  expect((await get(at)).headers.get("etag")).toBe(etag);
  expect((await get(`/site/${D.name}/moving/docs/index.md`)).headers.get("etag")).not.toBe(etag);
  const unchanged = await get(at, { headers: { "if-none-match": etag } });
  expect([unchanged.status, await unchanged.text(), unchanged.headers.get("etag")]).toEqual([304, "", etag]);
  const conditional = { headers: { "if-none-match": "*" } };
  for (const path of ["docs/guide.md", "docs/diagram.png", "docs/", "notes/"]) {
    expect((await get(`/site/${D.name}/moving/${path}`, conditional)).status).toBe(304);
  }
  expect((await get(`/site/${D.name}/moving/missing.md`, conditional)).status).toBe(404);
  expect((await get(`/site/${D.name}/moving/big.md`, conditional)).status).toBe(413);

  // Real Git object parsing and symlink refusal, with bytes supplied by the same stand-in host.
  const target = utf8("README.md");
  const blob = idOf("blob", target);
  host.objects.set(blob, { id: blob, type: "blob", data: target });
  const unserved = snapshotCommit([{ path: "link", mode: "120000", id: blob }], "unserved\n");
  for (const object of unserved.objects) host.objects.set(object.id, object);
  host.refs.set("refs/heads/unserved", unserved.commit);
  const address = `/site/${D.name}/unserved/link`;
  expect((await get(address)).status).toBe(404);
  expect((await get(address, conditional)).status).toBe(404);

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

// Invariant: every page labels the recorded repository and links to the root at the same ref, shows the branch or tag, links to the versions,
// has a breadcrumb of its path, and a footer that names the commit it was rendered from and links to the room's page.
test("navigation: the header labels the repository and the branch or tag, the breadcrumb links each folder of the path, and the footer names the commit and links to /page/ (STAND-IN host)", async () => {
  const at = (ref: string) => `/site/${D.name}/${ref}/`;
  const start = await page(await get(`${at("nav")}guide/start.md`));
  expect(start.status).toBe(200);
  expect(start.body).toContain(`<header><a class="room" href="${at("nav")}">Repository: ${host.name}</a> <span class="version">tag nav</span> <a href="/site/${D.name}/versions/">versions</a></header>`);
  expect(start.body).toContain(`<nav aria-label="Breadcrumb"><a href="${at("nav")}">nav</a> / <a href="${at("nav")}guide/">guide</a> / <a href="${at("nav")}guide/start.md">start.md</a></nav>`);
  expect(start.body).toContain(`<footer>Rendered from commit <code>${nav}</code>. <a href="/page/">The room's page</a>.</footer>`);
  // The published branch, by HEAD and by its name; the footer names the commit that the branch names.
  const head = await page(await get(`${at("HEAD")}docs/guide.md`));
  expect(head.body).toContain(`<span class="version">branch main (HEAD)</span>`);
  expect(head.body).toContain(`Rendered from commit <code>${host.refs.get("refs/heads/main")}</code>.`);
  expect((await page(await get(`${at("main")}docs/guide.md`))).body).toContain(`<span class="version">branch main</span>`);
  // SCRIPTED publication names the annotated tag's already-recorded commit.
  expect((await page(await get(`${at("release")}README.md`))).body).toContain(`Rendered from commit <code>${nav}</code>.`);
});

// Invariant: a folder with no index page lists its sub-folders, then its markdown files by title (else by name), then its other
// files, and no name that starts with "."; a relative link to a folder answers that folder's index.
test("a folder: its listing gives sub-folders, markdown files by their first heading else their name, and other files, hiding dot-files; a link to a folder, with or without a slash, answers its index (STAND-IN host)", async () => {
  const prefix = `/site/${D.name}/nav/`;
  const guide = await page(await get(`${prefix}guide/`));
  expect(guide.status).toBe(200);
  expect(guide.body).toContain([
    "<ul>",
    `<li><a href="${prefix}guide/deep/">deep/</a></li>`,
    `<li><a href="${prefix}guide/plain.md">plain.md</a></li>`,
    `<li><a href="${prefix}guide/start.md">Getting started <small>start.md</small></a></li>`,
    `<li><a href="${prefix}guide/logo.png">logo.png</a></li>`,
    "</ul>",
  ].join("\n"));
  expect(guide.body).not.toMatch(/hidden|\.config/i);
  // A dot-file is not listed, and is still served at its own address.
  expect((await get(`${prefix}guide/.hidden.md`)).status).toBe(200);

  // The links of a page to folders, each resolved under the same ref, answer the folder's index or listing.
  const readme = await page(await get(prefix));
  const links = [...readme.body.matchAll(/<a href="([^"]+)">(?:the |guide)/g)].map((m) => m[1]!);
  expect(links).toEqual([`${prefix}guide`, `${prefix}notes/`, `${prefix}notes`]);
  expect((await page(await get(links[0]!))).body).toBe(guide.body);
  for (const link of links.slice(1)) expect((await page(await get(link))).body).toContain('<h1 id="notes-index">Notes index</h1>');
  const start = await page(await get(`${prefix}guide/start.md`));
  expect(start.body).toContain(`<a href="${prefix}guide/">this folder</a>`);
  expect(start.body).toContain(`<a href="${prefix}">the top</a>`);
  expect((await page(await get(`${prefix}guide/deep`))).body).toContain('<h1 id="deep">Deep</h1>');
});

// Invariant: the versions page renders the SCRIPTED publication record, marks
// its published branch, and validates recorded commit targets before 304.
// This fixture scripts additional named versions that today's real room has no registry for.
test("versions: recorded version rows and their commits render, changed publication gives a new ETag, invalid targets fail before 304 (SCRIPTED publication, STAND-IN host)", async () => {
  const at = `/site/${D.name}/versions/`;
  const response = await get(at);
  const versions = await page(response);
  expect([versions.status, versions.type]).toEqual([200, "text/html; charset=utf-8"]);
  const rows = [...versions.body.matchAll(/<tr><td>(branch|tag)<\/td><td><a href="([^"]+)">([^<]+)<\/a>([^<]*)<\/td><td><code>([0-9a-f]{40})<\/code><\/td><\/tr>/g)].map((m) => m.slice(1));
  const expected = [...host.refs].filter(([ref]) => !ref.startsWith("refs/artroom/receipts/")).sort(([a], [b]) => (a < b ? -1 : 1)).map(([ref, id]) => {
    const tag = ref.startsWith("refs/tags/");
    const name = ref.replace(/^refs\/(heads|tags)\//, "");
    return [tag ? "tag" : "branch", `/site/${D.name}/${name}/`, name, name === "main" && !tag ? " (HEAD, the published branch)" : "", name === "release" ? nav : id];
  });
  // Branches first, then tags.
  expect(rows).toEqual([...expected.filter((r) => r[0] === "branch"), ...expected.filter((r) => r[0] === "tag")]);
  expect(rows.find((r) => r[2] === "release")![4]).not.toBe(host.refs.get("refs/tags/release"));
  expect(versions.body).toContain(`<a class="room" href="/site/${D.name}/HEAD/">Repository: ${host.name}</a>`);
  expect(versions.body).not.toContain("Rendered from commit");

  const etag = response.headers.get("etag")!;
  expect((await get(at, { headers: { "if-none-match": etag } })).status).toBe(304);
  expect((await get(at, { headers: { "if-none-match": "*" } })).status).toBe(304);
  // An invalid publication target: a blob rather than a recorded commit.
  const wrong = utf8("not a commit\n");
  const wrongId = idOf("blob", wrong);
  host.objects.set(wrongId, { id: wrongId, type: "blob", data: wrong });
  const tag = utf8(`object ${wrongId}\ntype blob\ntag wrong-target\ntagger Rita <rita@example.invalid> 0 +0000\n\nwrong target\n`);
  const tagId = idOf("tag", tag);
  host.objects.set(tagId, { id: tagId, type: "tag", data: tag });
  host.refs.set("refs/tags/wrong-target", wrongId);
  try {
    const ordinary = await get(at);
    const conditional = await get(at, { headers: { "if-none-match": "*" } });
    for (const answer of [ordinary, conditional]) {
      expect([answer.status, answer.headers.get("cache-control"), answer.headers.get("x-site-step")]).toEqual([502, "no-store", "objects"]);
    }
  } finally {
    host.refs.delete("refs/tags/wrong-target");
    host.objects.delete(tagId);
    host.objects.delete(wrongId);
  }
  host.refs.set("refs/tags/later", nav);
  try {
    const later = await get(at, { headers: { "if-none-match": etag } });
    expect(later.status).toBe(200);
    expect(later.headers.get("etag")).not.toBe(etag);
  } finally {
    host.refs.delete("refs/tags/later");
  }
});

// Invariant: the ETag covers what the header shows: the same file at the same commit under HEAD, the branch's name and a tag
// gives three tags, as the three pages differ.
test("cache: the same commit and path under HEAD, its branch and a tag give three ETags, as each page's header differs (STAND-IN host)", async () => {
  const tags = await Promise.all(["HEAD", "main", "v1"].map(async (ref) => (await get(`/site/${D.name}/${ref}/docs/guide.md`)).headers.get("etag")));
  expect(new Set(tags).size).toBe(3);
  for (const tag of tags) expect(tag).toMatch(new RegExp(`^"${host.refs.get("refs/heads/main")}\\.[0-9a-f]{24}"$`));
});

// Invariant: a site address with no ref redirects to the published branch, and reads nothing.
test("no ref: /site/<directory> and /site/<directory>/ redirect to HEAD/ (STAND-IN host)", async () => {
  const packs = host.packs;
  for (const path of [`/site/${D.name}`, `/site/${D.name}/`]) {
    const response = await get(path);
    expect([response.status, response.headers.get("location")]).toEqual([302, `/site/${D.name}/HEAD/`]);
  }
  expect(host.packs).toBe(packs);
  expect((await get(`/site//`)).status).toBe(400);
});
