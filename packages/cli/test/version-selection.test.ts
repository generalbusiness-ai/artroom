import { expect, test } from "vitest";
import type { ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { b64url, newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { command, memoryStore } from "../src/index.ts";

const seed: Seed = { v: 1, kind: "directory", definition: "platform:directory@1", creator: null, cause: textDigest("version fixture"), ordinal: 0 };
const directory: ScopeRef = { kind: "directory", scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(1)) };
const membership: ScopeRef = { ...directory, kind: "membership", scope: scopeIdOf({ ...seed, kind: "membership" }) };
const link = { v: 1, service: "https://service.test", repository: { directory, membership, rules: directory.scope, destination: directory.scope }, invitation: 3, secret: "a private invitation secret of at least 32 bytes", handle: "@fixture" };

// Invariant: an invitation with no resolved version or an unsupported/wrong-family version cannot create a key, pending
// private envelope or join request. This is the command's preflight only, not a membership/provider or historical witness.
test("join holds an untagged invitation and refuses unknown or wrong-family versions before any enrollment mutation", async () => {
  for (const definition of [undefined, "platform:membership@99", "platform:register@2"]) {
    const store = memoryStore();
    let calls = 0;
    const fetch: Fetch = async () => { calls++; throw new Error("No reads or submissions are needed for this version refusal"); };
    const text = `artroom-invite:${b64url(utf8(JSON.stringify({ ...link, ...(definition === undefined ? {} : { definition }) })))}`;
    const outcome = await command({ store, fetch }, ["join", text]);
    expect(outcome).toEqual({ code: 1, lines: [definition === undefined
      ? "This invitation names no exact membership version. Enrollment is held until its version provenance is resolved; nothing was submitted."
      : "The invitation's exact membership version is not supported; nothing was submitted."] });
    expect([calls, await store.config(), await store.secret("device")]).toEqual([0, null, null]);
  }
});

test("a tagged supported membership version keeps the exact private join before its uncertain delivery, with no pre-join read", async () => {
  for (const definition of ["platform:membership@1", "platform:membership@2"]) {
    const store = memoryStore();
    let calls = 0;
    const fetch: Fetch = async (url, init) => {
      calls++;
      expect([new URL(url).pathname, init?.method]).toEqual([`/v1/scopes/${membership.scope}/acts`, "POST"]);
      return new Response(JSON.stringify({ answer: "unavailable", reason: "unavailable" })) as never;
    };
    const text = `artroom-invite:${b64url(utf8(JSON.stringify({ ...link, definition })))}`;
    expect(await command({ store, fetch }, ["join", text])).toEqual({ code: 1, lines: ["Unavailable: unavailable. Nothing was written."] });
    const config = (await store.config())!;
    const signed = JSON.parse(new TextDecoder().decode((await store.private(config.join!.request))!)) as { intent: { to: ScopeRef; kind: string; fields: unknown } };
    expect([calls, config.repository, signed.intent.to, signed.intent.kind, signed.intent.fields]).toEqual([1, undefined, membership, "join", { invitation: link.invitation, secret: link.secret }]);
    expect(JSON.stringify(config)).not.toContain(link.secret);
  }
});

// STAND-IN typed register summaries; no scope judged them. The real command and signed HTTP read reject unsupported pinned
// identities or a different full register reference before saving/submitting a claim. No newest/classification fallback.
test("claim refuses an unknown or wrong-family register definition and an incarnation substitution before signing found", async () => {
  const register: ScopeRef = { ...directory, kind: "register", scope: scopeIdOf({ ...seed, kind: "register" }) };
  for (const [definition, foreign] of [["platform:register@99", false], ["platform:membership@2", false], ["platform:register@2", true]] as const) {
    const store = memoryStore();
    const config = { v: 1 as const, service: link.service, key: "operator", register };
    await store.save(config);
    await store.keep("operator", new Uint8Array(32).fill(2));
    let posts = 0;
    const fetch: Fetch = async (_url, init) => {
      if (init?.method === "POST") posts++;
      return new Response(JSON.stringify({ ok: true, at: { seq: 0, hash: textDigest("register fixture") }, complete: true,
        value: { scope: { ...register, ...(foreign ? { inc: newIncarnation(new Uint8Array(16).fill(9)) } : {}) }, status: "active", definition, time: "2099-01-01T00:00:00Z", items: [], counts: [] } })) as never;
    };
    expect(await command({ store, fetch }, ["claim", "demo"])).toEqual({ code: 1, lines: ["The register's exact pinned definition or reference is not supported; nothing was submitted."] });
    expect([posts, await store.config(), await store.secret("recovery")]).toEqual([0, config, null]);
  }
});
