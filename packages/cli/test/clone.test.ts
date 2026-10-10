import { expect, test, vi } from "vitest";
import { newIncarnation, parseStrictBytes, unb64url, verifySignedRead } from "@generalbusiness/artroom-bytes";
import * as bytes from "@generalbusiness/artroom-bytes";
import type { SignedRead, SignedSessionRequest } from "@generalbusiness/artroom-contract";
import type { Fetch } from "@generalbusiness/artroom-client";
const DESTINATION = "platform:destination@1" as const;
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
  let definition: string = DESTINATION;
  let category: "unavailable" | "mismatch" = "unavailable";
  let sessionMode: "absent" | "issued" | "read-refused" = "absent";
  const readers: string[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push(url);
    if (url.endsWith("/acts")) return Response.json({ answer: category, reason: category === "unavailable" ? "busy" : "idempotency-mismatch" });
    if (url.endsWith("/sessions")) {
      if (sessionMode === "absent") return new Response(JSON.stringify({ ok: false, reason: "sessions-unavailable" }));
      const asked = JSON.parse(init!.body!) as SignedSessionRequest;
      return Response.json({ ok: true, token: "scripted-reader", session: { v: 1, deployment: "scripted", membership, member: "@operator", key: asked.request.actor, reads: ["summary"], ends: asked.request.notAfter } });
    }
    const reader = init?.headers?.["authorization"] ?? "";
    readers.push(reader);
    if (sessionMode === "read-refused" && reader === "Session scripted-reader") return Response.json({ ok: false, reason: "forbidden" }, { status: 403 });
    return new Response(JSON.stringify({ ok: true, at: { seq: 0, hash: `sha256:${"a".repeat(64)}` }, complete: true, value: { scope: at, status: "active", definition, time: "2026-10-07T12:00:00Z", counts: [], items: [{ id: 0, type: "branch", state: "ready", revision: 0, opened: null, parties: {}, refs: {}, attributed: [], values: { repository: { host: "artifacts", namespace: "demo", name: "r", id: "r" } } }] } }));
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
  // Real key derivation/signature code, SCRIPTED session and summary replies:
  // an issued session needs only its request's derivation, while a refused
  // session makes a NEW signed-read handle. Neither path loses key custody.
  const derivations = vi.spyOn(bytes, "keyIdOfSecret");
  try {
    sessionMode = "issued"; readers.length = 0;
    expect((await command(context, ["remote"])).code).toBe(0);
    expect([derivations.mock.calls.length, readers]).toEqual([1, ["Session scripted-reader"]]);
    derivations.mockClear(); sessionMode = "read-refused"; readers.length = 0;
    expect((await command(context, ["remote"])).code).toBe(0);
    expect([derivations.mock.calls.length, readers[0], readers.length]).toEqual([2, "Session scripted-reader", 2]);
    const signed = parseStrictBytes(unb64url(readers[1]!.slice("Signed ".length))!) as SignedRead;
    expect([readers[1]!.startsWith("Signed "), verifySignedRead(signed), signed.request.read]).toEqual([true, true, "summary"]);
    readers.length = 0; sessionMode = "issued";
    let keyLoads = 0;
    const missingKey = await command({ ...context, store: { ...store, secret: async name => ++keyLoads === 1 ? store.secret(name) : null } }, ["remote"]);
    expect([missingKey.code, readers]).toEqual([1, []]);
    expect(missingKey.lines.join(" ")).toContain("is missing from the config directory; nothing was signed");
  } finally {
    derivations.mockRestore(); sessionMode = "absent";
  }
  // SCRIPTED answer categories, not a timed-turn or real admission proof.
  // Both the generic act formatter and accepted-only clone helper preserve
  // unavailable versus mismatch without a no-write or fresh-command retry.
  definition = "platform:destination@2";
  const running = { ...context, git: { run: async () => 0 } };
  for (const value of ["unavailable", "mismatch"] as const) {
    category = value;
    const outcomes = [await command(running, ["clone"]), await command(running, ["act", "read-token", "--on", "destination", "--target", "0", "--set", "hours=1"])];
    for (const result of outcomes) {
      expect(result.code).toBe(1);
      expect(result.lines[0]).toMatch(value === "unavailable" ? /^Unavailable: busy\. Outcome unknown; no acceptance is confirmed\./ : /^Mismatch: idempotency-mismatch\./);
      expect(result.lines.join("\n")).toContain("before another mutation");
      expect(result.lines.join("\n")).not.toMatch(/Nothing was written|Send the same command again/);
      if (value === "unavailable") expect(result.lines.join("\n")).toContain("same original signed envelope");
    }
  }
});
