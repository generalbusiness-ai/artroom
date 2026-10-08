import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { route } from "../src/worker.ts";
import type { ScopeObject } from "../src/object.ts";
import { wired } from "./outside.ts";
import { rita } from "./support.ts";

// Invariant: the object waits for session preparation before consulting the
// holder. These readers are a STAND-IN; the object and its empty SQLite store
// are real. No platform minting, membership or credential custody is shown.
test("credential waits for session preparation before checking its holder and the route marks even refusals no-store", async () => {
  const name = `sc_${"c".repeat(51)}a`;
  let release!: () => void;
  let reached!: () => void;
  const prepared = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  let holders = 0;
  wired.set(name, () => ({ readers: {
    allows: () => true,
    prepare: async (reader, read) => { expect([reader, read]).toEqual(["Session boundary", "credential"]); reached(); await prepared; },
    holder: () => { holders++; return rita.key; },
  } }));
  const object = env.SCOPES.get(env.SCOPES.idFromName(name)) as unknown as ScopeObject;
  const pending = object.credential("Session boundary", "read:one");
  await entered;
  expect(holders).toBe(0);
  release();
  expect(await pending).toEqual({ ok: false, reason: "forbidden" });
  expect(holders).toBe(1);
  const reply = await route(new Request(`https://service.test/v1/scopes/${name}/credential/read%3Aone`, { headers: { authorization: "Session boundary" } }), env.SCOPES);
  expect([reply.status, reply.headers.get("cache-control"), await reply.json()]).toEqual([403, "no-store", { ok: false, reason: "forbidden" }]);
});
