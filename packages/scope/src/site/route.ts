/**
 * The site route (plan 025, section 6): `GET /site/:directory/:ref/*path`,
 * a page of a room's repository, rendered.
 *
 * - `:directory` is the room's directory scope ID (`host.ts`, `roomOf`).
 * - `:ref` is a recorded published ref, one path segment, percent-encoded where it
 *   holds a `/`. `HEAD` is the published branch that the directory records.
 *   Only refs recorded by the room are served, at their recorded commits.
 *   The current destination records one branch and no tags.
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
 * it is. A link to a folder answers the folder's index.
 *
 * Every page has a header: the room's name (the repository's name, as the
 * directory records it), linking to the root at the same ref; the branch or
 * tag shown; a link to the versions; and a breadcrumb of the path. Its
 * footer names the commit it was rendered from and links to the room's
 * page at `/page/`. A folder's listing gives each sub-folder, then each
 * markdown file by its title (its first heading, else its name), then the
 * other files; a name that starts with `.` is not listed.
 *
 * `/site/:directory` and `/site/:directory/` redirect to `HEAD/`.
 * `/site/:directory/versions/` lists only the room's recorded published refs
 * and their recorded commits, never provider-advertised branches or tags.
 * The name `versions` is reserved for this listing at the root.
 *
 * Every answer of a file carries an `ETag` of the commit, the path and what
 * the header shows, and `Cache-Control`. A request whose `If-None-Match`
 * names that tag is answered 304 only after the requested representation
 * has passed its ordinary read and servability checks. The versions page's
 * tag is of every ref it lists; its rows are validated before 304 as well.
 *
 * A refusal is plain text: the reason, a colon and a sentence, with the
 * status that says the same, and `Cache-Control: no-store`. Its body holds
 * nothing of the repository. No session is read: every site is public to
 * whoever has the room's directory scope ID.
 */
import { GitRefusal, READ_BOUNDS, Reader, type ObjectId, type TreeEntry } from "@generalbusiness/artroom-git";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { credentialInUrl } from "../sessions.ts";
import { StepError, publicationOf, publishedCommitOf, readerOf, roomOf, type Opened, type SiteEnv, type SiteStep } from "./host.ts";
import { renderMarkdown, titleOf } from "./markdown.ts";
import { escapeHtml } from "./node.ts";

/** The most bytes of one file that the route reads and answers. */
export const FILE_BYTES = 1024 * 1024;
/** How long a cache may keep an answer before it asks again, in seconds. A branch can move, so this is short. */
export const MAX_AGE = 60;
/** Changes when the HTML of the same file at the same commit would change: it is part of every `ETag`. */
const RENDERER = "site-3";
/** How many markdown files of one folder's listing are read for their titles. The rest are listed by name. */
export const LISTED_TITLES = 100;
/** The room's own page, which every page's footer links to (`page.ts`). */
const ROOM_PAGE = "/page/";

export type SiteRefusal = "bad-request" | "method-not-allowed" | "not-found" | "not-published" | "too-large" | "host-not-configured" | "unreadable";
const STATUS: Record<SiteRefusal, number> = { "bad-request": 400, "method-not-allowed": 405, "not-found": 404, "not-published": 404, "too-large": 413, "host-not-configured": 503, unreadable: 502 };

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

/**
 * The `ETag` of a path at a commit: the commit, and a digest of the
 * renderer's version, the path, and the header's inputs (the room's name,
 * the ref as asked, and the branch or tag it names).
 */
export async function etagOf(commit: ObjectId, path: string, header: readonly string[] = []): Promise<string> {
  return `"${commit}.${await digestOf([RENDERER, path, ...header])}"`;
}

/** 24 hex digits of the SHA-256 of these lines, each JSON-encoded so that no two lists give the same text. */
async function digestOf(lines: readonly string[]): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(lines.map((line) => JSON.stringify(line)).join("\n"))));
  return Array.from(digest.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
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

type Parsed = { directory: string; ref: string; path: string[]; trailing: boolean } | { directory: string; ref: null };

/** The parts of the route's path, decoded: the directory, the ref, and the path in the repository with its segments. A ref of null: none is named. */
function parse(url: URL): Parsed | null {
  const raw = url.pathname.split("/").slice(2);
  if (raw.length === 1 || (raw.length === 2 && raw[1] === "")) {
    let directory: string;
    try {
      directory = decodeURIComponent(raw[0]!);
    } catch {
      return null;
    }
    return directory === "" ? null : { directory, ref: null };
  }
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

/** What a ref names: the commit, and the branch or tag by its full name. */
interface Named { commit: ObjectId; name: string }

/** What a page's header and footer show. */
interface Frame {
  /** The recorded repository name, which links to `root`; not a human claim name. */
  room: string;
  root: string;
  /** The branch or tag shown, as words. */
  version: string;
  versions: string;
  crumbs: string;
  /** The commit the page was rendered from, or null for a page of no one commit. */
  commit: ObjectId | null;
}

/** The words for the branch or tag that `ref` named. */
const versionOf = (ref: string, name: string): string =>
  name === "commit" ? `commit ${ref}` : name.startsWith("refs/tags/") ? `tag ${name.slice("refs/tags/".length)}` : `branch ${name.slice("refs/heads/".length)}${ref === "HEAD" ? " (HEAD)" : ""}`;

function page(title: string, frame: Frame, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#1f2328;background:#fff}
header,nav,main,footer{max-width:52rem;margin:0 auto;padding:0 1rem}
header{padding-top:1rem;display:flex;flex-wrap:wrap;gap:.25rem 1rem;align-items:baseline}header .room{font-weight:600;color:inherit;text-decoration:none}
header .version,footer{color:#59636e}nav{font-size:.9rem}footer{padding-bottom:2rem;font-size:.8rem}
a{color:#0969da}img{max-width:100%}
pre{background:#f6f8fa;padding:.75rem;overflow:auto}code{font-family:ui-monospace,monospace;font-size:.9em}
table{border-collapse:collapse}th,td{border:1px solid #d1d9e0;padding:.3rem .6rem}
blockquote{margin-left:0;padding-left:1rem;border-left:.25rem solid #d1d9e0;color:#59636e}
@media (prefers-color-scheme:dark){body{color:#f0f6fc;background:#0d1117}a{color:#4493f8}pre{background:#151b23}th,td{border-color:#3d444d}blockquote{border-color:#3d444d;color:#9198a1}header .version,footer{color:#9198a1}}
</style>
</head>
<body>
<header><a class="room" href="${escapeHtml(frame.root)}">Repository: ${escapeHtml(frame.room)}</a> <span class="version">${escapeHtml(frame.version)}</span> <a href="${escapeHtml(frame.versions)}">versions</a></header>
<nav aria-label="Breadcrumb">${frame.crumbs}</nav>
<main>
${body}</main>
<footer>${frame.commit === null ? "" : `Rendered from commit <code>${frame.commit}</code>. `}<a href="${ROOM_PAGE}">The room's page</a>.</footer>
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
  // No ref: the published branch.
  if (parsed.ref === null) return new Response(null, { status: 302, headers: { location: `/site/${segment(parsed.directory)}/HEAD/`, "cache-control": "no-store" } });
  const { directory, ref, path, trailing } = parsed;
  if (path.length > 64 || utf8.encode(path.join("/")).length > 8192) return refused("unreadable", "publication-history-limit", "objects");
  const versions = ref === "versions" && path.length === 0;

  let room;
  try {
    room = await roomOf(env.SCOPES, directory);
  } catch (e) {
    logged("room", e);
    return refused("unreadable", e instanceof Error && e.message === "publication-history-limit" ? "publication-history-limit" : "the room could not be read", "room");
  }
  if (!room) return refused("not-found", "no room has that directory");
  let publication;
  try { publication = await publicationOf(env.SCOPES, directory, room); }
  catch (e) { logged("room", e); return refused("unreadable", e instanceof Error && e.message === "publication-history-limit" ? "publication-history-limit" : "the room could not be read", "room"); }
  if (!publication) return refused("not-published", "the room has no confirmed publication");
  // Full canonical object IDs take precedence over branch-like hash names.
  const immutable = /^[0-9a-f]{40}$/.test(ref);
  const names = ref === "HEAD" ? [`refs/heads/${room.branch}`] : [`refs/heads/${ref}`, `refs/tags/${ref}`];
  const selected = publication.refs.find((r) => names.includes(r.ref));
  if (!versions && !immutable && !selected) return refused("not-published", "the room has not published that ref");
  let proof: import("./publication.ts").PublishedCommitProof | undefined;
  if (!versions) {
    try {
      const selection = await publishedCommitOf(env.SCOPES, directory, room, immutable ? ref : selected!.target);
      if (!selection.ok) return selection.reason === "publication-history-limit"
        ? refused("unreadable", "publication-history-limit", "room")
        : refused("not-published", "the room has no written publication receipt for that commit");
      proof = selection.proof;
    } catch (e) { logged("room", e); return refused("unreadable", "the publication proof could not be read", "room"); }
  }
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
  const base = `/site/${segment(directory)}/`;
  // Conditional caching applies only after the representation has passed its ordinary read and servability checks.
  const notModified = (cached: Record<string, string>) => matches(request.headers.get("if-none-match"), cached["etag"]!)
    ? new Response(null, { status: 304, headers: cached }) : null;
  const eligible = async (answer: Response): Promise<Response> => {
    const now = await roomOf(env.SCOPES, directory);
    if (!now || canonicalize(now) !== canonicalize(room)) return refused("not-published", "the room identity changed during this read");
    if (!versions && proof) {
      const currentProof = await publishedCommitOf(env.SCOPES, directory, now, proof.commit);
      if (!currentProof.ok) return currentProof.reason === "publication-history-limit" ? refused("unreadable", "publication-history-limit", "room") : refused("not-published", "the publication is no longer eligible");
      if (!immutable) {
        const latest = await publicationOf(env.SCOPES, directory, now);
        if (latest?.refs.find(r => r.ref === selected!.ref)?.target !== proof.commit) return refused("unreadable", "the latest publication changed during this read", "room");
      }
      if (canonicalize(currentProof.proof) !== canonicalize(proof)) return refused("unreadable", "the publication record changed during this read", "room");
    } else {
      const currentPublication = await publicationOf(env.SCOPES, directory, now);
      if (canonicalize(currentPublication) !== canonicalize(publication)) return refused("unreadable", "the publication record changed during this read", "room");
    }
    return answer;
  };
  const html = (title: string, frame: Frame, body: string, cached: Record<string, string>) => notModified(cached) ?? new Response(page(title, frame, body), { status: 200, headers: { ...cached, "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_POLICY, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
  try {
    const reader = new Reader(opened.source, { ...READ_BOUNDS, blobBytes: FILE_BYTES });
    if (versions) {
      for (const row of publication.refs) {
        const selection = await publishedCommitOf(env.SCOPES, directory, room, row.target);
        if (!selection.ok) return selection.reason === "publication-history-limit" ? refused("unreadable", "publication-history-limit", "room") : refused("not-published", "the room has no written publication receipt for that commit");
        await verifiedReceipt(reader, selection.proof, at);
      }
      return await eligible(await versionsPage(reader, room.repository.name, room.branch, publication.refs, base, at, html));
    }
    await verifiedReceipt(reader, proof!, at);
    const named: Named = { commit: proof!.commit, name: immutable ? "commit" : selected!.ref };
    const { commit } = named;
    const etag = await etagOf(commit, path.join("/") + (trailing ? "/" : ""), [room.repository.name, ref, named.name]);
    const cached = { etag, "cache-control": `public, max-age=${MAX_AGE}` };
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

    const prefix = `${base}${segment(ref)}/`;
    const href = (parts: readonly string[], dir: boolean) => prefix + parts.map(segment).join("/") + (dir && parts.length > 0 ? "/" : "");
    const crumbs = [`<a href="${escapeHtml(prefix)}">${escapeHtml(ref)}</a>`, ...path.map((part, i) => `<a href="${escapeHtml(href(path.slice(0, i + 1), i < path.length - 1 || entry === null || entry.kind === "tree"))}">${escapeHtml(part)}</a>`)].join(" / ");
    const frame: Frame = { room: room.repository.name, root: prefix, version: versionOf(ref, named.name), versions: `${base}versions/`, crumbs, commit };
    const rendered = async (file: TreeEntry, where: string[]) => {
      const source = text.decode(await reader.blob(file.id, "page"));
      at("render");
      const { html: body, title } = renderMarkdown(source, { resolve: (destination) => resolveAddress(prefix, where.join("/"), destination) });
      return await eligible(html(title ?? where.join("/"), frame, body, cached));
    };

    // A directory: its index page, else a listing.
    if (entry === null || entry.kind === "tree") {
      const index = INDEX_NAMES.map((n) => tree.find((e) => e.kind === "blob" && e.mode !== "120000" && nameOf(e).toLowerCase() === n)).find((e) => e !== undefined);
      if (index) return await rendered(index, [...path, nameOf(index)]);
      const title = path.length === 0 ? ref : path.join("/");
      const shown = tree.filter((e) => !nameOf(e).startsWith("."));
      // An empty folder, or an empty repository at its root, is a page that says so.
      if (shown.length === 0) return await eligible(html(title, frame, `<h1>${escapeHtml(title)}</h1>\n<p>${path.length === 0 ? "The repository has no files at this commit." : "This folder has no files at this commit."}</p>\n`, cached));
      return await eligible(html(title, frame, `<h1>${escapeHtml(title)}</h1>\n${await listing(reader, shown, (name, dir) => href([...path, name], dir))}`, cached));
    }

    // A file.
    const name = path[path.length - 1]!;
    if (isMarkdown(name)) return await rendered(entry, path);
    const bytes = await reader.blob(entry.id, "page");
    const type = IMAGES[extension(name)];
    return await eligible(notModified(cached) ?? new Response(bytes, {
      status: 200,
      headers: { ...cached, "content-type": type ?? "application/octet-stream", ...(type ? {} : { "content-disposition": "attachment" }), "content-security-policy": FILE_POLICY, "x-content-type-options": "nosniff" },
    }));
  } catch (e) {
    logged(step, e, opened);
    if (e instanceof GitRefusal && e.reason === "too-large" && e.what === "page") return refused("too-large", `a file of more than ${FILE_BYTES} bytes is not served`, step);
    return refused("unreadable", e instanceof Error && e.message === "publication-history-limit" ? "publication-history-limit" : "the repository could not be read", step);
  } finally {
    await opened.close();
  }
}

/** Exact hash-checked Git correspondence, before any content or conditional response. */
async function verifiedReceipt(reader: Reader, proof: import("./publication.ts").PublishedCommitProof, at: (step: SiteStep) => void): Promise<void> {
  at("refs");
  if (await reader.ref(proof.receipt.ref, "publication receipt") !== proof.receipt.commit) throw new GitRefusal("unreadable", "publication receipt ref");
  at("objects");
  const receiptCommit = await reader.commit(proof.receipt.commit, "publication receipt");
  if (receiptCommit.tree !== proof.receipt.tree) throw new GitRefusal("unreadable", "publication receipt tree");
  const receiptTree = await reader.tree(receiptCommit.tree, "publication receipt");
  if (receiptTree.length !== 1 || receiptTree[0]!.mode !== "100644" || nameOf(receiptTree[0]!) !== "receipt.json" || receiptTree[0]!.id !== proof.receipt.blob
    || text.decode(await reader.blob(proof.receipt.blob, "publication receipt")) !== proof.receipt.file) throw new GitRefusal("unreadable", "publication receipt file");
}

/**
 * A folder's listing: its sub-folders, then its markdown files by title,
 * then its other files, each in the tree's order. A title is the file's
 * first heading, else its name; the first `LISTED_TITLES` markdown files
 * are read for one, and a file over the size bound keeps its name.
 */
async function listing(reader: Reader, entries: readonly TreeEntry[], href: (name: string, dir: boolean) => string): Promise<string> {
  const link = (name: string, dir: boolean, shown: string) => `<li><a href="${escapeHtml(href(name, dir))}">${shown}</a></li>`;
  const folders = entries.filter((e) => e.kind === "tree").map((e) => link(nameOf(e), true, escapeHtml(`${nameOf(e)}/`)));
  const files = entries.filter((e) => e.kind === "blob" && e.mode !== "120000");
  const pages: string[] = [];
  let read = 0;
  for (const e of files.filter((f) => isMarkdown(nameOf(f)))) {
    const name = nameOf(e);
    let title: string | null = null;
    if (read++ < LISTED_TITLES) {
      try {
        title = titleOf(text.decode(await reader.blob(e.id, "page")));
      } catch (error) {
        if (!(error instanceof GitRefusal && error.reason === "too-large")) throw error;
      }
    }
    pages.push(link(name, false, title === null || title === name ? escapeHtml(name) : `${escapeHtml(title)} <small>${escapeHtml(name)}</small>`));
  }
  const others = files.filter((f) => !isMarkdown(nameOf(f))).map((e) => link(nameOf(e), false, escapeHtml(nameOf(e))));
  // A submodule or a symbolic link is shown, not linked: it is not served.
  const unlinked = entries.filter((e) => e.kind === "gitlink" || e.mode === "120000").map((e) => `<li>${escapeHtml(nameOf(e))}</li>`);
  return `<ul>\n${[...folders, ...pages, ...others, ...unlinked].join("\n")}\n</ul>\n`;
}

/**
 * The versions page: only refs and exact commits from the room record.
 * Every recorded target is checked as a commit before a conditional response.
 */
async function versionsPage(
  reader: Reader, room: string, branch: string, refs: readonly { ref: string; target: ObjectId }[], base: string, at: (step: SiteStep) => void,
  html: (title: string, frame: Frame, body: string, cached: Record<string, string>) => Response,
): Promise<Response> {
  const etag = `"versions.${await digestOf([RENDERER, room, branch, ...refs.flatMap((r) => [r.ref, r.target])])}"`;
  const cached = { etag, "cache-control": `public, max-age=${MAX_AGE}` };
  at("objects");
  const row = async (r: { ref: string; target: ObjectId }) => {
    const tag = r.ref.startsWith("refs/tags/");
    const name = r.ref.slice(tag ? "refs/tags/".length : "refs/heads/".length);
    const commit = r.target;
    await reader.commit(commit);
    const published = !tag && name === branch ? " (HEAD, the published branch)" : "";
    return `<tr><td>${tag ? "tag" : "branch"}</td><td><a href="${escapeHtml(`${base}${segment(name)}/`)}">${escapeHtml(name)}</a>${published}</td><td><code>${commit}</code></td></tr>`;
  };
  const rows: string[] = [];
  for (const r of [...refs].sort((a, b) => a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)) rows.push(await row(r));
  const frame: Frame = { room, root: `${base}HEAD/`, version: "published versions", versions: `${base}versions/`, crumbs: `<a href="${escapeHtml(`${base}HEAD/`)}">HEAD</a> / versions`, commit: null };
  const body = rows.length === 0
    ? "<h1>Versions</h1>\n<p>The room has no published versions.</p>\n"
    : `<h1>Versions</h1>\n<table>\n<thead><tr><th>Kind</th><th>Name</th><th>Commit</th></tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>\n`;
  return html("Versions", frame, body, cached);
}
