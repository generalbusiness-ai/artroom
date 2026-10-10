import { expect, test } from "vitest";
import worker, { type Env } from "../src/worker.ts";
import { isCounting } from "../src/counting.ts";
import { COUNTING_ASSETS } from "../src/counting-assets.ts";

// The production Worker entry serves static generated files without a scope binding.
// This witnesses route/security behavior, not browser startup, native counting or speech.
test("the Worker serves only the three public Counting assets under one same-origin policy and refuses URL credentials before static dispatch", async () => {
  const request = (path: string, method = "GET", headers?: HeadersInit) => new Request(`https://scopes.test${path}`, { method, headers });
  const get = (path: string, method = "GET", headers?: HeadersInit) => worker.fetch(request(path, method, headers), {} as Env);
  const policy = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const checkHeaders = (response: Response, type: string) => {
    expect(Object.fromEntries(["content-type", "content-security-policy", "x-content-type-options", "referrer-policy", "cache-control"].map(name => [name, response.headers.get(name)]))).toEqual({
      "content-type": type, "content-security-policy": policy, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache",
    });
  };
  expect(isCounting(request("/counting"))).toBe(true);expect(isCounting(request("/counting/counting.js"))).toBe(true);
  expect(isCounting(request("/counting-other/"))).toBe(false);expect(isCounting(request("/v1/scopes/not-a-scope"))).toBe(false);
  for (const [name, asset] of Object.entries(COUNTING_ASSETS)) {
    const response = await get(`/counting/${name}`);
    expect(response.status).toBe(200);checkHeaders(response, asset.type);expect(await response.text()).toBe(asset.body);
    const head = await get(`/counting/${name}`, "HEAD");expect(head.status).toBe(200);checkHeaders(head, asset.type);expect(await head.text()).toBe("");
  }
  // Neither a harmless display query nor credentials held in headers become public response data.
  const html = await get("/counting/?display=STATIC-REQUEST-SENTINEL", "GET", { authorization: "Bearer STATIC-HEADER-SENTINEL", cookie: "private=STATIC-COOKIE-SENTINEL" });
  expect(await html.text()).toBe(COUNTING_ASSETS["index.html"].body);checkHeaders(html, COUNTING_ASSETS["index.html"].type);
  expect(COUNTING_ASSETS["index.html"].body).toContain('<script type="module" src="./counting.js"></script>');
  expect(COUNTING_ASSETS["index.html"].body).toContain('<link rel="stylesheet" href="./counting.css">');
  const bare = await get("/counting");expect([bare.status, bare.headers.get("location"), await bare.text()]).toEqual([301, "/counting/", ""]);checkHeaders(bare, "text/plain; charset=utf-8");
  for (const path of ["/counting/preview.html", "/counting/preview.ts", "/counting/keys.json", "/counting/browser/main.ts", "/counting/counting.js/extra"]) {
    const missing = await get(path);expect(missing.status).toBe(404);checkHeaders(missing, "text/plain; charset=utf-8");
  }
  const missingHead = await get("/counting/preview.html", "HEAD");expect([missingHead.status, await missingHead.text()]).toEqual([404, ""]);
  const posted = await get("/counting/", "POST");expect([posted.status, posted.headers.get("allow")]).toEqual([405, "GET, HEAD"]);checkHeaders(posted, "text/plain; charset=utf-8");
  for (const path of ["/counting/?token=STATIC-URL-SENTINEL", "/counting/counting.js?secret=STATIC-URL-SENTINEL"]) {
    const refused = await get(path);expect([refused.status, await refused.json()]).toEqual([400, { error: "credential-in-url" }]);
  }
  const routed = await get("/v1/scopes/not-a-scope");
  expect([routed.status, routed.headers.get("content-type"), await routed.json()]).toEqual([404, "application/json", { ok: false, reason: "not-found" }]);
});
