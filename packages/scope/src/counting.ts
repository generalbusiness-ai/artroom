/** Same-origin public Counting stage. No scope, session, credential or fake preview is served by this route. */
import { COUNTING_ASSETS } from "./counting-assets.ts";
const POLICY = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const headers = (type: string): Record<string, string> => ({ "content-type": type, "content-security-policy": POLICY, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache" });
export const isCounting = (request: Request): boolean => { const path = new URL(request.url).pathname; return path === "/counting" || path.startsWith("/counting/"); };
export function countingPage(request: Request): Response {
  const path = new URL(request.url).pathname;
  const body = (text: string) => request.method === "HEAD" ? null : text;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("method-not-allowed: Counting is read with GET or HEAD.\n", { status: 405, headers: { ...headers("text/plain; charset=utf-8"), allow: "GET, HEAD" } });
  if (path === "/counting") return new Response(null, { status: 301, headers: { ...headers("text/plain; charset=utf-8"), location: "/counting/" } });
  const name = path === "/counting/" ? "index.html" : path.slice("/counting/".length);
  if (name !== "index.html" && name !== "counting.js" && name !== "counting.css") return new Response(body("not-found: Counting has no such public file.\n"), { status: 404, headers: headers("text/plain; charset=utf-8") });
  const asset = COUNTING_ASSETS[name];
  return new Response(body(asset.body), { status: 200, headers: headers(asset.type) });
}
