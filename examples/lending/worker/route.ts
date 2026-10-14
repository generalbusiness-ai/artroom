/** Same-origin public lending library interface. No scope, session or credential is served by this route. */
import { LENDING_ASSETS } from "./assets.ts";
const POLICY = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const headers = (type: string): Record<string, string> => ({ "content-type": type, "content-security-policy": POLICY, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache" });
export const isLending = (request: Request): boolean => { const path = new URL(request.url).pathname; return path === "/lending" || path.startsWith("/lending/"); };
export function lendingPage(request: Request): Response {
  const path = new URL(request.url).pathname;
  const body = (text: string) => request.method === "HEAD" ? null : text;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("method-not-allowed: The lending library is read with GET or HEAD.\n", { status: 405, headers: { ...headers("text/plain; charset=utf-8"), allow: "GET, HEAD" } });
  if (path === "/lending") return new Response(null, { status: 301, headers: { ...headers("text/plain; charset=utf-8"), location: "/lending/" } });
  const name = path === "/lending/" ? "index.html" : path.slice("/lending/".length);
  if (name !== "index.html" && name !== "lending.js" && name !== "lending.css") return new Response(body("not-found: The lending library has no such public file.\n"), { status: 404, headers: headers("text/plain; charset=utf-8") });
  const asset = LENDING_ASSETS[name];
  return new Response(body(asset.body), { status: 200, headers: headers(asset.type) });
}
