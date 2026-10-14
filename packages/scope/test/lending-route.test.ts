import { expect, test } from "vitest";
import worker, { type Env } from "../../../apps/room/worker.ts";
import { isLending } from "../../../examples/lending/worker/route.ts";
import { LENDING_ASSETS } from "../../../examples/lending/worker/assets.ts";

// The production Worker entry serves static generated files without a scope binding.
// This witnesses route/security behavior, not browser startup, joining or a lending act.
test("the Worker serves only the three public lending library assets under one same-origin policy and refuses URL credentials before static dispatch", async () => {
  const request = (path: string, method = "GET", headers?: HeadersInit) => new Request(`https://scopes.test${path}`, { method, ...(headers ? {headers} : {}) });
  const get = (path: string, method = "GET", headers?: HeadersInit) => worker.fetch(request(path, method, headers), {} as Env);
  const policy = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const checkHeaders = (response: Response, type: string) => {
    expect(Object.fromEntries(["content-type", "content-security-policy", "x-content-type-options", "referrer-policy", "cache-control"].map(name => [name, response.headers.get(name)]))).toEqual({
      "content-type": type, "content-security-policy": policy, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache",
    });
  };
  expect(isLending(request("/lending"))).toBe(true);expect(isLending(request("/lending/lending.js"))).toBe(true);
  expect(isLending(request("/lending-other/"))).toBe(false);expect(isLending(request("/v1/scopes/not-a-scope"))).toBe(false);
  for (const [name, asset] of Object.entries(LENDING_ASSETS)) {
    const response = await get(`/lending/${name}`);
    expect(response.status).toBe(200);checkHeaders(response, asset.type);expect(await response.text()).toBe(asset.body);
    const head = await get(`/lending/${name}`, "HEAD");expect(head.status).toBe(200);checkHeaders(head, asset.type);expect(await head.text()).toBe("");
  }
  // Neither a harmless display query nor credentials held in headers become public response data.
  const html = await get("/lending/?display=STATIC-REQUEST-SENTINEL", "GET", { authorization: "Bearer STATIC-HEADER-SENTINEL", cookie: "private=STATIC-COOKIE-SENTINEL" });
  expect(await html.text()).toBe(LENDING_ASSETS["index.html"].body);checkHeaders(html, LENDING_ASSETS["index.html"].type);
  expect(LENDING_ASSETS["index.html"].body).toContain('<script type="module" src="./lending.js"></script>');
  expect(LENDING_ASSETS["index.html"].body).toContain('<link rel="stylesheet" href="./lending.css">');
  const bare = await get("/lending");expect([bare.status, bare.headers.get("location"), await bare.text()]).toEqual([301, "/lending/", ""]);checkHeaders(bare, "text/plain; charset=utf-8");
  for (const path of ["/lending/preview.html", "/lending/preview.ts", "/lending/keys.json", "/lending/browser/main.ts", "/lending/lending.js/extra"]) {
    const missing = await get(path);expect(missing.status).toBe(404);checkHeaders(missing, "text/plain; charset=utf-8");
  }
  const missingHead = await get("/lending/preview.html", "HEAD");expect([missingHead.status, await missingHead.text()]).toEqual([404, ""]);
  const posted = await get("/lending/", "POST");expect([posted.status, posted.headers.get("allow")]).toEqual([405, "GET, HEAD"]);checkHeaders(posted, "text/plain; charset=utf-8");
  for (const path of ["/lending/?token=STATIC-URL-SENTINEL", "/lending/lending.js?secret=STATIC-URL-SENTINEL"]) {
    const refused = await get(path);expect([refused.status, await refused.json()]).toEqual([400, { error: "credential-in-url" }]);
  }
  const routed = await get("/v1/scopes/not-a-scope");
  expect([routed.status, routed.headers.get("content-type"), await routed.json()]).toEqual([404, "application/json", { ok: false, reason: "not-found" }]);
});
