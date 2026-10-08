import { expect, test } from "vitest";
import worker, { type Env } from "../src/worker.ts";
import { PAGE_HTML, PAGE_JS } from "../src/page-assets.ts";

// Invariant: the deployed Worker's one entry serves the room's page at `/page/`, its HTML and its one script, from the module that
// the page's build writes, each under a policy that runs this origin's scripts only; any other path under `/page/` is not found,
// a write is refused, and a path outside it still reaches the scope routes. The page route reads no scope, so no binding is given.
test("the Worker serves the page at /page/: its HTML and script under a same-origin script policy; /page redirects; another file is not-found; a POST is refused; /v1 is not the page's", async () => {
  const get = (path: string, method = "GET") => worker.fetch(new Request(`https://scopes.test${path}`, { method }), {} as Env);

  const html = await get("/page/");
  expect([html.status, html.headers.get("content-type"), await html.text()]).toEqual([200, "text/html; charset=utf-8", PAGE_HTML]);
  expect(PAGE_HTML).toContain('<script type="module" src="page.js"></script>');
  const policy = html.headers.get("content-security-policy") ?? "";
  expect(policy.split("; ")).toEqual(expect.arrayContaining(["default-src 'none'", "script-src 'self'", "connect-src 'self'", "frame-ancestors 'none'"]));
  expect(policy).not.toContain("unsafe-eval");
  expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);

  const js = await get("/page/page.js");
  expect([js.status, js.headers.get("content-type"), js.headers.get("x-content-type-options"), (await js.text()).length]).toEqual([200, "text/javascript; charset=utf-8", "nosniff", PAGE_JS.length]);

  const bare = await get("/page");
  expect([bare.status, bare.headers.get("location")]).toEqual([301, "/page/"]);
  expect((await get("/page/keys.json")).status).toBe(404);
  const posted = await get("/page/", "POST");
  expect([posted.status, posted.headers.get("allow")]).toEqual([405, "GET, HEAD"]);
  // A scope route is no page: its answer is the routes' own JSON refusal for a name that is no scope ID.
  const routed = await get("/v1/scopes/not-a-scope");
  expect([routed.status, routed.headers.get("content-type"), await routed.text()]).toEqual([404, "application/json", JSON.stringify({ ok: false, reason: "not-found" })]);
});
