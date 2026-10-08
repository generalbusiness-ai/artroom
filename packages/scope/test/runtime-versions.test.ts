import { expect, test } from "vitest";
import { b64url, canonicalize, intentDigest, scopeIdOf, seedDigest, signIntent, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { Intent, Seed } from "@generalbusiness/artroom-contract";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { readCredential, requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "../src/testing.ts";
import { artifactsOutside } from "../src/artifacts-wiring.ts";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { knownPlatform } from "../src/platform-version.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam, settle } from "./repository.ts";
import { platformNet, platformOutside } from "./worker.ts";

// Invariant: known @2 observations and strict aged birth-session preparation
// use the exact supplied implementation, without broad unknown-family lookup.
// These are real PLATFORM scopes/rules/current sessions. The register's Git
// host and clock are STAND-INS. This is not activation/provenance or a clone.
test("runtime exact @2 membership observations and aged destination/rules reads retain full birth references; unknown code is unavailable", async () => {
  expect([knownPlatform("platform:membership@1", "platform:membership"), knownPlatform("platform:membership@2", "platform:membership"), knownPlatform("platform:membership@99", "platform:membership"), knownPlatform("platform:directory@2", "platform:membership")]).toEqual([true, true, false, false]);
  net.hold = net.deaf = null;
  platformNet.sessions = false;
  const install: Intent = { v: 1, to: null, actor: keys.paul.key, kind: "install", on: null, expected: {}, fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: "platform:register@2", creator: null, cause: intentDigest(install), ordinal: 0 }));
  const host = outsideOf(R.name);
  wired.set(R.name, () => ({ outside: host }));
  expect((await R.stub.found(signIntent(install, keys.paul.secret), "platform:register@2")).answer).toBe("accepted");
  const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
  const seed: Seed = { v: 1, kind: "directory", definition: "platform:directory@2", creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 };
  const D = new Platform(scopeIdOf(seed));
  host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: repositoryName(seedDigest(seed), 1) } } });
  expect((await R.stub.submit(found, [])).answer).toBe("accepted");
  await (R.stub as unknown as { effect(): Promise<number> }).effect();
  await settle(R, D);
  const children = (await D.entries())[0]!.sends.filter((send) => "creator" in send.to && ["membership", "rules", "destination"].includes(send.to.kind));
  const child = (kind: string) => new Platform(scopeIdOf(children.find((send) => "kind" in send.to && send.to.kind === kind)!.to as Seed));
  const [M, rules, G] = [child("membership"), child("rules"), child("destination")];
  await settle(R, D, M, rules, G);
  const seat = await M.did(rita, "seat", { expected: await M.expected({ roster: 0 }) });
  await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
  const standing = await M.stub.observe({ of: await M.at(), key: rita.key });
  expect(standing).toMatchObject({ definition: "platform:membership@2", key: rita.key, actions: expect.arrayContaining(["destination.read-token"]) });
  net.clock.now = soon(901);
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true;
  try {
    const session = await requestSession("https://scopes.test", M.name, sessionRequest(await M.at(), rita.secret, soon(60), "runtime-known-v2"), { fetch: routed as unknown as Fetch });
    expect(session.ok).toBe(true);
    if (!session.ok) return expect.fail(session.reason);
    for (const node of [rules, G]) {
      const response = await routed(`https://scopes.test/v1/scopes/${node.name}`, { headers: { authorization: session.session.reader() } });
      expect([response.status, await response.json()]).toMatchObject([200, { ok: true, value: { definition: `platform:${node === G ? "destination" : "rules"}@2` } }]);
    }
    // Concrete provider boundary through real host wiring and private SQLite.
    // ARTIFACTS is a SCRIPTED binding: no live repository/token/Git transfer.
    const repository = repositoryName(seedDigest(seed), 1);
    let readMints = 0;
    const binding: ArtifactsNamespace = {
      get: async () => ({
        info: async () => ({ name: repository, remote: `https://service.invalid/git/artroom-demo/${repository}.git` }),
        createToken: async (scope, ttl) => { if (scope === "read" && ttl === 3600) readMints++; return { id: "scripted-provider-id", scope, plaintext: "scripted-private-read", expiresAt: timeOf(timeMs(net.clock.now)! + ttl * 1000) }; },
        revokeToken: async () => true,
      }), create: async () => { throw new Error("not used"); }, delete: async () => true,
    };
    platformOutside.set(G.name, (given, sql) => {
      const outside = artifactsOutside(given, sql, { ARTIFACTS: binding, ARTIFACTS_CONFIG: canonicalize({ registerScope: R.name, namespace: "artroom-demo", host: "service.invalid", maxBytes: 1024 * 1024, credentialIdentity: "adapter-attempt" }) }, async () => new Response("scripted unavailable Git", { status: 503 }));
      // Fixture control: keep unrelated founding writes held while observing
      // the read-mint boundary, so no scripted write can race its revision.
      return { ...outside, accepts: (owner, kind) => kind === "mint-read" && outside.accepts(owner, kind) };
    });
    await G.restart();
    platformNet.sessions = false;
    const token = await G.act(rita, "read-token", { on: 0, fields: { hours: 1 }, expected: await G.expected({ on: 0 }) });
    expect(token.answer, JSON.stringify(token)).toBe("accepted");
    if (token.answer !== "accepted") return expect.fail("read-token must be admitted by real @2 rules");
    await (G.stub as unknown as { effect(): Promise<number> }).effect();
    const minted = (await G.entries()).find((entry) => entry.input.type === "outcome" && entry.input.operation === `${token.receipt.fact.seq}:0`);
    expect(minted?.input).toMatchObject({ type: "outcome", owner: "platform:destination@2", kind: "mint-read", result: "confirmed" });
    if (minted?.input.type !== "outcome") return expect.fail("confirmed outcome is required");
    const handle = (minted.input.evidence.body as { token: string }).token;
    expect(readMints).toBe(1);
    expect(JSON.stringify(await G.entries())).not.toContain("scripted-private-read");
    platformNet.sessions = true;
    const credential = await readCredential("https://scopes.test", G.name, session.session.reader(), handle, { fetch: routed as unknown as Fetch });
    expect(credential).toMatchObject({ ok: true, value: { token: "scripted-private-read", remote: `https://service.invalid/git/artroom-demo/${repository}.git` } });
    expect(await readCredential("https://scopes.test", G.name, session.session.reader(), handle, { fetch: routed as unknown as Fetch })).toEqual({ ok: false, reason: "forbidden" });
  } finally { platformNet.sessions = false; platformNet.secret = null; wired.delete(R.name); platformOutside.delete(G.name); }
});
