import { expect, test } from "vitest";
import { newIncarnation } from "@generalbusiness/artroom-bytes";
import { DESTINATION } from "@generalbusiness/artroom-platform";
import { command } from "../src/line.ts";
import type { Config } from "../src/store.ts";
import { memoryStore } from "../src/store.ts";

// Invariant: remote is a read, and an unsupported pinned destination version
// never signs read-token or consumes a credential. The HTTP summary below is a
// STAND-IN; this test claims no membership, real destination or Git behavior.
test("remote reads the recorded repository; missing Git and the pinned @1 without read-token both sign nothing", async () => {
  const store = memoryStore();
  await store.keep("operator", new Uint8Array(32).fill(7));
  const at = { scope: `sc_${"a".repeat(52)}` as const, kind: "destination" as const, inc: newIncarnation(new Uint8Array(16).fill(8)) };
  const membership = { ...at, scope: `sc_${"b".repeat(52)}` as const, kind: "membership" as const };
  const config: Config = { v: 1 as const, service: "https://service.test", key: "operator", repository: { directory: { ...at, kind: "directory" }, membership, destination: at.scope, rules: `sc_${"c".repeat(52)}` as const }, remote: "https://git.test/git/demo/r.git" };
  await store.save(config);
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    if (url.endsWith("/sessions")) return new Response(JSON.stringify({ ok: false, reason: "sessions-unavailable" }));
    return new Response(JSON.stringify({ ok: true, at: { seq: 0, hash: `sha256:${"a".repeat(64)}` }, complete: true, value: { scope: at, status: "active", definition: DESTINATION, time: "2026-10-07T12:00:00Z", counts: [], items: [{ id: 0, type: "branch", state: "ready", revision: 0, opened: null, parties: {}, refs: {}, attributed: [], values: { repository: { host: "artifacts", namespace: "demo", name: "r", id: "r" } } }] } }));
  };
  const context = { store, fetch, now: () => Date.parse("2026-10-07T12:00:00Z") };
  expect((await command(context, ["remote"])).lines).toContain("Remote URL: https://git.test/git/demo/r.git");
  const missing = await command(context, ["clone", "here"]);
  expect(missing.code).toBe(1);
  expect(missing.lines[0]).toContain("nothing was signed");
  const gitCalls: string[][] = [];
  const known = await command({ ...context, git: { run: async (args) => { gitCalls.push([...args]); return 0; } } }, ["clone", "here"]);
  expect(known).toEqual({ code: 1, lines: [`The destination definition ${DESTINATION} does not support read-token. An explicitly versioned destination and membership integration is required.`] });
  expect(gitCalls).toEqual([["--version"]]);
  expect(calls.every((url) => url.endsWith("/sessions") || url.endsWith(`/${at.scope}`))).toBe(true);
  expect(await store.config()).toEqual(config);
});
