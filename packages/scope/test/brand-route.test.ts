import { expect, test } from "vitest";
import worker, { type Env } from "../../../apps/room/worker.ts";
import { BRAND_ASSETS } from "../../../apps/room/brand/assets.ts";

// Invariant: public binary files survive Worker GET/HEAD without opening a private path.
test("the Worker serves only allowlisted public brand bytes and refuses URL credentials before dispatch", async () => {
  const get = (path: string, method = "GET") => worker.fetch(new Request(`https://scopes.test${path}`, { method }), {} as Env);
  for (const [name, asset] of Object.entries(BRAND_ASSETS)) {
    const response = await get(`/brand/${name}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(asset.type);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0)));
    const head = await get(`/brand/${name}`, "HEAD");
    expect([head.status, head.headers.get("content-type"), (await head.arrayBuffer()).byteLength]).toEqual([200, asset.type, 0]);
  }
  for (const path of ["/brand/fonts/narrow_teletype.py", "/brand/keys.json", "/brand/fonts/unknown.ttf", "/brand/favicon.svg/extra", "/brand/toString", "/brand/__proto__"]) {
    expect((await get(path)).status).toBe(404);
    const head = await get(path, "HEAD");
    expect([head.status, (await head.arrayBuffer()).byteLength]).toEqual([404, 0]);
  }
  const posted = await get("/brand/favicon.ico", "POST");
  expect([posted.status, posted.headers.get("allow")]).toEqual([405, "GET, HEAD"]);
  const credential = await get("/brand/favicon.ico?token=STATIC-URL-SENTINEL");
  expect([credential.status, await credential.json()]).toEqual([400, { error: "credential-in-url" }]);
});
