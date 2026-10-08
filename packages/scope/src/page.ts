/**
 * The page route: `GET /page/`, the room's page (`packages/page`), served
 * by this Worker so that the page and the routes it reads share one
 * origin. No second deployment serves it, and no cross-origin header is
 * needed.
 *
 * | Path | Answer |
 * |---|---|
 * | `/page` | A redirect to `/page/`, so that the page's relative script address resolves under it. |
 * | `/page/` | The page's HTML. |
 * | `/page/page.js` | The page's one script. |
 * | any other path under `/page/` | `not-found`. |
 *
 * The two files are `page-assets.ts`, which the page package's build
 * writes from its source; the page's test fails while the module is older
 * than that source. The route reads no scope, no session and no secret:
 * the page itself asks for a session, with the key that the browser keeps.
 *
 * The page keeps that key in the browser's storage for this origin, which
 * any script of the origin can read. So every answer here names its
 * script by a policy that allows this origin's scripts only. A separate site
 * integration must preserve its own reviewed same-origin script boundary.
 */
import { PAGE_HTML, PAGE_JS } from "./page-assets.ts";

/** Scripts of this origin only; reads and acts to this origin only; no frame, no form sent elsewhere, no base address. */
const PAGE_POLICY = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const headers = (type: string): Record<string, string> => ({
  "content-type": type, "content-security-policy": PAGE_POLICY, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache",
});

/** Whether a request is for the page route. */
export const isPage = (request: Request): boolean => {
  const path = new URL(request.url).pathname;
  return path === "/page" || path.startsWith("/page/");
};

/** The page route's answer. A refusal is plain text: the reason, a colon and a sentence. */
export function page(request: Request): Response {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method-not-allowed: the page is read with GET.\n", { status: 405, headers: { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" } });
  }
  const body = (text: string) => (request.method === "HEAD" ? null : text);
  switch (url.pathname) {
    case "/page": return new Response(null, { status: 301, headers: { location: "/page/" } });
    case "/page/": return new Response(body(PAGE_HTML), { status: 200, headers: headers("text/html; charset=utf-8") });
    case "/page/page.js": return new Response(body(PAGE_JS), { status: 200, headers: headers("text/javascript; charset=utf-8") });
    default: return new Response("not-found: the page has no such file.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });
  }
}
