/**
 * The site route (plan 025, section 6): `GET /site/:directory/:ref/*path`,
 * a page of a room's repository, rendered.
 *
 * - `:directory` is the room's directory scope ID (`host.ts`, `roomOf`).
 * - `:ref` is a branch or a tag, one path segment, percent-encoded where it
 *   holds a `/`. `HEAD` is the published branch that the directory records.
 *   A branch is looked for first, then a tag; an annotated tag is followed
 *   to its commit.
 * - `*path` is a file or a directory at that commit. A markdown file
 *   (`.md`, `.markdown`) answers as a page of HTML. A directory answers its
 *   `index.md`, else its `README.md` (either name in any case, or with
 *   `.markdown`), else a listing of its entries. An image answers its bytes
 *   with its type, and any other file its bytes as a download.
 *
 * A page's relative links and images are written as addresses under the
 * same `/site/:directory/:ref/` prefix, resolved against the page's own
 * path; an address that starts with `/` is taken from the repository's
 * root. An absolute address, and a link to a place in the page, is left as
 * it is.
 *
 * Every answer of a file carries an `ETag` of the commit and the path, and
 * `Cache-Control`. A request whose `If-None-Match` names that tag is
 * answered 304 once the ref is read, and nothing more is read.
 *
 * A refusal is plain text: the reason, a colon and a sentence, with the
 * status that says the same, and `Cache-Control: no-store`. Its body holds
 * nothing of the repository. No session is read: every site is public to
 * whoever has the room's directory scope ID.
 */
import { GitRefusal, READ_BOUNDS, Reader, refName, type ObjectId, type TreeEntry } from "@generalbusiness/artroom-git";
import { credentialInUrl } from "../sessions.ts";
import { StepError, readerOf, roomOf, type Opened, type SiteEnv, type SiteStep } from "./host.ts";
import { renderMarkdown } from "./markdown.ts";
import { escapeHtml } from "./node.ts";

/** The most bytes of one file that the route reads and answers. */
export const FILE_BYTES = 1024 * 1024;
/** How long a cache may keep an answer before it asks again, in seconds. A branch can move, so this is short. */
export const MAX_AGE = 60;
/** Changes when the HTML of the same file at the same commit would change: it is part of every `ETag`. */
const RENDERER = "site-1";
/** How many annotated tags one ref may be followed through to its commit. */
const TAG_DEPTH = 4;

export type SiteRefusal = "bad-request" | "method-not-allowed" | "not-found" | "ref-not-found" | "too-large" | "host-not-configured" | "unreadable";
const STATUS: Record<SiteRefusal, number> = { "bad-request": 400, "method-not-allowed": 405, "not-found": 404, "ref-not-found": 404, "too-large": 413, "host-not-configured": 503, unreadable: 502 };

/** A refusal. `step`: the step of the read that failed, as the header `x-site-step`; the body does not say it. */
export function refused(reason: SiteRefusal, sentence: string, step?: SiteStep): Response {
  return new Response(`${reason}: ${sentence}\n`, { status: STATUS[reason], headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...(step ? { "x-site-step": step } : {}) } });
}

/** A text with every secret it may hold taken out: the given secrets, an authorization's value, a URL's user and query. */
export function redacted(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) if (secret.length > 0) out = out.split(secret).join("[redacted]");
  return out
    .replace(/\b(Bearer|Basic|token|authorization)(\s*[:=]?\s+)[^\s,;"']+/gi, "$1$2[redacted]")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, "$1[redacted]@")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#]*)\?[^\s#]*/gi, "$1?[redacted]");
}

/**
 * The one log line of a failed read: the step, the error's class and message, and the last request the Git source sent with
 * what came back. Every secret is redacted.
 */
function logged(step: SiteStep, e: unknown, opened?: Opened): void {
  const cause = e instanceof StepError && e.cause instanceof Error ? e.cause : e;
  const name = cause instanceof Error ? cause.name : typeof cause;
  const message = e instanceof StepError ? e.message : cause instanceof Error ? cause.message : String(cause);
  const last = opened?.last() ?? "";
  console.error(redacted(`site ${step}: ${name}: ${message}${last ? `; last request: ${last}` : ""}`, opened?.secrets ?? []));
}

/** True when the request is for the site route. */
export const isSite = (request: Request): boolean => new URL(request.url).pathname.startsWith("/site/");

const IMAGES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp" };
const extension = (name: string): string => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
const isMarkdown = (name: string): boolean => /\.(?:md|markdown)$/i.test(name);
const INDEX_NAMES = ["index.md", "index.markdown", "readme.md", "readme.markdown"];
const PAGE_POLICY = "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
/** A file answered as itself runs nothing, even an SVG image opened on its own. */
const FILE_POLICY = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";

const utf8 = new TextEncoder();
const text = new TextDecoder("utf-8");
const nameOf = (entry: TreeEntry): string => text.decode(entry.name);
const sameName = (entry: TreeEntry, name: Uint8Array): boolean => entry.name.length === name.length && entry.name.every((b, i) => b === name[i]);
/** One path segment as it goes in an address. */
const segment = (part: string): string => encodeURIComponent(part);

/** The `ETag` of a path at a commit: the commit, and a digest of the renderer's version and the path. */
export async function etagOf(commit: ObjectId, path: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(`${RENDERER}\n${path}`)));
  return `"${commit}.${Array.from(digest.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

const matches = (header: string | null, etag: string): boolean =>
  header !== null && header.split(",").some((tag) => {
    const t = tag.trim();
    return t === "*" || t === etag || t === `W/${etag}`;
  });

/**
 * The address to write for a destination in the page at `page` (a path in
 * the repository), under `prefix`. An absolute address, one that starts
 * with `//`, and one that starts with `#` are kept as they are.
 */
export function resolveAddress(prefix: string, page: string, destination: string): string {
  if (destination === "" || destination.startsWith("#") || destination.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)) return destination;
  const root = "https://site.invalid/";
  let resolved: URL;
  try {
    resolved = destination.startsWith("/") ? new URL(destination.slice(1), root) : new URL(destination, root + page.split("/").map(segment).join("/"));
  } catch {
    return destination;
  }
  // A relative address cannot climb above the repository's root: the URL parser stops `..` at the root.
  return prefix + resolved.pathname.slice(1) + resolved.search + resolved.hash;
}

/** The parts of the route's path, decoded: the directory, the ref, and the path in the repository with its segments. */
function parse(url: URL): { directory: string; ref: string; path: string[]; trailing: boolean } | null {
  const raw = url.pathname.split("/").slice(2);
  if (raw.length < 2) return null;
  let parts: string[];
  try {
    parts = raw.map(decodeURIComponent);
  } catch {
    return null;
  }
  const [directory, ref, ...rest] = parts as [string, string, ...string[]];
  const trailing = rest.length === 0 || rest[rest.length - 1] === "";
  const path = trailing ? rest.slice(0, -1) : rest;
  if (directory === "" || ref === "" || path.some((p) => p === "" || p === "." || p === ".." || p.includes("/") || p.includes("\u0000"))) return null;
  return { directory, ref, path, trailing };
}

/** The commit that a branch or tag names now, an annotated tag followed. Null when the repository has neither of that name. */
async function commitOf(reader: Reader, ref: string, branch: string, at: (step: SiteStep) => void): Promise<ObjectId | null> {
  const names = ref === "HEAD" ? [`refs/heads/${branch}`] : [`refs/heads/${ref}`, `refs/tags/${ref}`];
  for (const name of names) {
    refName(name, "site ref");
    let id = await reader.ref(name);
    if (id === null) continue;
    // A branch names a commit, and the commit's own read checks it, after the cheap answer of a cached page. A tag may name a tag.
    if (name.startsWith("refs/heads/")) return id;
    at("objects");
    for (let depth = 0; ; depth++) {
      try {
        await reader.commit(id);
        return id;
      } catch (e) {
        if (!(e instanceof GitRefusal) || e.reason !== "wrong-type" || depth >= TAG_DEPTH) throw e;
      }
      const tag = text.decode(await reader.object(id, "tag"));
      const target = /^object ([0-9a-f]{40})\n/.exec(tag);
      if (!target) throw new GitRefusal("malformed-commit", "tag");
      id = target[1]!;
    }
  }
  return null;
}

function page(title: string, crumbs: string, body: string, commit: ObjectId): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#1f2328;background:#fff}
nav,main,footer{max-width:52rem;margin:0 auto;padding:0 1rem}
nav{padding-top:1rem;font-size:.9rem}footer{padding-bottom:2rem;font-size:.8rem;color:#59636e}
a{color:#0969da}img{max-width:100%}
pre{background:#f6f8fa;padding:.75rem;overflow:auto}code{font-family:ui-monospace,monospace;font-size:.9em}
table{border-collapse:collapse}th,td{border:1px solid #d1d9e0;padding:.3rem .6rem}
blockquote{margin-left:0;padding-left:1rem;border-left:.25rem solid #d1d9e0;color:#59636e}
@media (prefers-color-scheme:dark){body{color:#f0f6fc;background:#0d1117}a{color:#4493f8}pre{background:#151b23}th,td{border-color:#3d444d}blockquote{border-color:#3d444d;color:#9198a1}footer{color:#9198a1}}
</style>
</head>
<body>
<nav>${crumbs}</nav>
<main>
${body}</main>
<footer>Commit <code>${commit}</code></footer>
</body>
</html>
`;
}

/** One request to the site route. `fetch`: the transport to the Git host, for a test's scripted host. */
export async function site(request: Request, env: SiteEnv, fetch?: (request: Request) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  if (credentialInUrl(url)) return refused("bad-request", "a credential in an address is not used");
  if (request.method !== "GET") return refused("method-not-allowed", "the site answers GET only");
  const parsed = parse(url);
  if (!parsed) return refused("bad-request", "a site address names a directory, a ref and a path, with no empty, '.' or '..' segment");
  const { directory, ref, path, trailing } = parsed;
  if (ref !== "HEAD") {
    try {
      refName(`refs/heads/${ref}`, "site ref");
    } catch (e) {
      logged("refs", e);
      return refused("ref-not-found", "no branch or tag has that name", "refs");
    }
  }

  let room;
  try {
    room = await roomOf(env.SCOPES, directory);
  } catch (e) {
    logged("room", e);
    return refused("unreadable", "the room could not be read", "room");
  }
  if (!room) return refused("not-found", "no room has that directory");
  const open = readerOf(env, room, fetch);
  if (!open) return refused("host-not-configured", "this deployment does not read that room's repository");

  let opened: Opened;
  try {
    opened = await open();
  } catch (e) {
    const failed = e instanceof StepError ? e.step : "open";
    logged(failed, e);
    return refused("unreadable", "the repository could not be read", failed);
  }
  // The step of the read in progress, which a failure names.
  let step: SiteStep = "refs";
  const at = (next: SiteStep) => { step = next; };
  try {
    const reader = new Reader(opened.source, { ...READ_BOUNDS, blobBytes: FILE_BYTES });
    const commit = await commitOf(reader, ref, room.branch, at);
    if (commit === null) return refused("ref-not-found", "no branch or tag has that name");
    const etag = await etagOf(commit, path.join("/") + (trailing ? "/" : ""));
    const cached = { etag, "cache-control": `public, max-age=${MAX_AGE}` };
    if (matches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: cached });

    // The path, segment by segment, from the commit's tree.
    at("objects");
    let tree = await reader.tree((await reader.commit(commit)).tree);
    let entry: TreeEntry | null = null;
    for (let i = 0; i < path.length; i++) {
      const name = utf8.encode(path[i]!);
      entry = tree.find((e) => sameName(e, name)) ?? null;
      if (!entry || (i < path.length - 1 && entry.kind !== "tree")) return refused("not-found", "no file is at that path");
      if (entry.kind === "tree") tree = await reader.tree(entry.id);
    }
    if (entry !== null && entry.kind !== "tree" && trailing && path.length > 0) return refused("not-found", "no directory is at that path");
    if (entry !== null && (entry.kind === "gitlink" || entry.mode === "120000")) return refused("not-found", "a submodule or a symbolic link is not served");

    const prefix = `/site/${segment(directory)}/${segment(ref)}/`;
    const href = (parts: readonly string[], dir: boolean) => prefix + parts.map(segment).join("/") + (dir && parts.length > 0 ? "/" : "");
    const crumbs = [`<a href="${escapeHtml(prefix)}">${escapeHtml(ref)}</a>`, ...path.map((part, i) => `<a href="${escapeHtml(href(path.slice(0, i + 1), i < path.length - 1 || entry === null || entry.kind === "tree"))}">${escapeHtml(part)}</a>`)].join(" / ");
    const html = (title: string, body: string) => new Response(page(title, crumbs, body, commit), { status: 200, headers: { ...cached, "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_POLICY, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
    const rendered = async (file: TreeEntry, where: string[]) => {
      const source = text.decode(await reader.blob(file.id, "page"));
      at("render");
      const { html: body, title } = renderMarkdown(source, { resolve: (destination) => resolveAddress(prefix, where.join("/"), destination) });
      return html(title ?? where.join("/"), body);
    };

    // A directory: its index page, else a listing.
    if (entry === null || entry.kind === "tree") {
      const index = INDEX_NAMES.map((n) => tree.find((e) => e.kind === "blob" && e.mode !== "120000" && nameOf(e).toLowerCase() === n)).find((e) => e !== undefined);
      if (index) return await rendered(index, [...path, nameOf(index)]);
      const items = tree.map((e) => {
        const name = nameOf(e);
        const linked = e.kind === "tree" || (e.kind === "blob" && e.mode !== "120000");
        const shown = escapeHtml(name + (e.kind === "tree" ? "/" : ""));
        return `<li>${linked ? `<a href="${escapeHtml(href([...path, name], e.kind === "tree"))}">${shown}</a>` : shown}</li>`;
      });
      const title = path.length === 0 ? ref : path.join("/");
      // An empty folder, or an empty repository at its root, is a page that says so.
      if (items.length === 0) return html(title, `<h1>${escapeHtml(title)}</h1>\n<p>${path.length === 0 ? "The repository has no files at this commit." : "This folder has no files at this commit."}</p>\n`);
      return html(title, `<h1>${escapeHtml(title)}</h1>\n<ul>\n${items.join("\n")}\n</ul>\n`);
    }

    // A file.
    const name = path[path.length - 1]!;
    if (isMarkdown(name)) return await rendered(entry, path);
    const bytes = await reader.blob(entry.id, "page");
    const type = IMAGES[extension(name)];
    return new Response(bytes, {
      status: 200,
      headers: { ...cached, "content-type": type ?? "application/octet-stream", ...(type ? {} : { "content-disposition": "attachment" }), "content-security-policy": FILE_POLICY, "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    logged(step, e, opened);
    if (e instanceof GitRefusal && e.reason === "too-large" && e.what === "page") return refused("too-large", `a file of more than ${FILE_BYTES} bytes is not served`, step);
    if (e instanceof GitRefusal && e.reason === "bad-ref-name") return refused("ref-not-found", "no branch or tag has that name", step);
    return refused("unreadable", "the repository could not be read", step);
  } finally {
    await opened.close();
  }
}
