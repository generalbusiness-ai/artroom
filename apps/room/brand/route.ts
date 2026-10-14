/** Same-origin public brand files. This route reads no scope, session or credential. */
import { BRAND_ASSETS } from "./assets.ts";
const headers = (type: string): Record<string, string> => ({
  "content-type": type, "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache",
});
export const isBrand = (request: Request): boolean => new URL(request.url).pathname.startsWith("/brand/");
export function brand(request: Request): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("method-not-allowed: brand files are read with GET or HEAD.\n", { status: 405, headers: { ...headers("text/plain; charset=utf-8"), allow: "GET, HEAD" } });
  const name = new URL(request.url).pathname.slice("/brand/".length);
  if (!Object.hasOwn(BRAND_ASSETS, name)) return new Response(request.method === "HEAD" ? null : "not-found: no such public brand file.\n", { status: 404, headers: headers("text/plain; charset=utf-8") });
  const asset = BRAND_ASSETS[name as keyof typeof BRAND_ASSETS];
  const bytes = request.method === "HEAD" ? null : Uint8Array.from(atob(asset.base64), character => character.charCodeAt(0));
  return new Response(bytes, { status: 200, headers: headers(asset.type) });
}
