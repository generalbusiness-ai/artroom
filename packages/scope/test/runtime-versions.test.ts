import { expect, inject, test } from "vitest";
import { b64url, canonicalize, intentDigest, scopeIdOf, seedDigest, signIntent, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { Intent, Seed } from "@generalbusiness/artroom-contract";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { readCredential, requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { repositoryName } from "@generalbusiness/artroom-platform";
// Test-only orchestration import; the scope production package has no CLI dependency.
import { command, memoryStore, type Context } from "../../cli/src/index.ts";
import { net } from "../src/testing.ts";
import { artifactsOutside } from "../src/artifacts-wiring.ts";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { knownPlatform } from "../src/platform-version.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam, settle } from "./repository.ts";
import { platformNet, platformOutside } from "./worker.ts";
import { localClone } from "./support/local-clone.ts";

// Invariant: known @2 observations and strict aged birth-session preparation
// use the exact supplied implementation, without broad unknown-family lookup.
// These are real PLATFORM scopes/rules/current sessions. The register's Git
// host identity/mint binding and clock are STAND-INS. A fixed Node bridge
// runs production nodeGit and real git http-backend over a local repository.
// This proves local clone composition, not a live provider or provenance.
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
  const directoryAt = await D.at();
  const membershipAt = await M.at();
  const standing = await M.stub.observe({ of: await M.at(), key: rita.key });
  expect(standing).toMatchObject({ definition: "platform:membership@2", key: rita.key, actions: expect.arrayContaining(["destination.read-token"]) });
  try {
    // Real host wiring/private SQLite and real Git objects/HTTP transfer;
    // Artifacts identity/mint/revoke answers are an explicit local STAND-IN.
    const repository = repositoryName(seedDigest(seed), 1);
    const address = inject("localClone");
    const bridge = localClone(address);
    const { remote, directory } = await bridge.configure(repository);
    let readMints = 0;
    let callerToken = "";
    const binding: ArtifactsNamespace = {
      get: async (name) => {
        if (name !== repository) throw new Error("local repository mismatch");
        return {
          info: async () => ({ name: repository, remote }),
          createToken: async (scope, ttl) => {
            const token = await bridge.mint(repository, scope, ttl);
            if (scope === "read" && ttl === 3600) { readMints++; callerToken = token.plaintext; }
            return { ...token, expiresAt: timeOf(timeMs(net.clock.now)! + ttl * 1000) };
          },
          revokeToken: async (plaintext) => bridge.revoke(repository, plaintext),
        };
      }, create: async () => { throw new Error("not used"); }, delete: async () => true,
    };
    platformOutside.set(G.name, (given, sql) => {
      return artifactsOutside(given, sql, { ARTIFACTS: binding, ARTIFACTS_CONFIG: canonicalize({ registerScope: R.name, namespace: "artroom-demo", host: "service.invalid", maxBytes: 1024 * 1024, credentialIdentity: "adapter-attempt" }) }, bridge.forward);
    });
    await G.restart();
    // Actual production first-head and receipt writes reach git http-backend.
    // The scheduler remains a stand-in; no founding outcome is scripted here.
    for (let pass = 0; pass < 32; pass++) if (await (G.stub as unknown as { effect(): Promise<number> }).effect() === 0) break;
    const published = (await G.summary()).value.items.find((item) => item.type === "branch")!;
    const foundingEvidence = (await G.entries()).filter((entry) => entry.input.type === "outcome").map((entry) => ({ seq: entry.seq, input: entry.input, effects: entry.effects }));
    expect(published.state, canonicalize({ foundingEvidence, local: await bridge.status() })).toBe("ready");
    const firstHead = published.values["head"];
    expect((await G.entries()).some((entry) => entry.input.type === "outcome" && entry.input.kind === "receipt" && entry.input.result === "confirmed" && entry.effects.some((effect) => effect.effect === "state" && effect.state === "written"))).toBe(true);
    net.clock.now = soon(901);
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    const session = await requestSession("https://scopes.test", M.name, sessionRequest(await M.at(), rita.secret, soon(60), "runtime-known-v2"), { fetch: routed as unknown as Fetch });
    expect(session.ok).toBe(true);
    if (!session.ok) return expect.fail(session.reason);
    for (const node of [rules, G]) {
      const response = await routed(`https://scopes.test/v1/scopes/${node.name}`, { headers: { authorization: session.session.reader() } });
      expect([response.status, await response.json()]).toMatchObject([200, { ok: true, value: { definition: `platform:${node === G ? "destination" : "rules"}@2` } }]);
    }
    const store = memoryStore();
    await store.keep("device", rita.secret);
    await store.save({ v: 1, service: "https://scopes.test", key: "device", register: await R.at(), repository: { directory: directoryAt, membership: membershipAt, rules: rules.name, destination: G.name }, handle: "@rita" });
    let gitCalls = 0;
    const context: Context = {
      store, fetch: routed as unknown as Fetch, now: () => timeMs(net.clock.now)!,
      pause: async () => { await (G.stub as unknown as { effect(): Promise<number> }).effect(); },
      // The fixed bridge validates the exact argv/environment, then its Node
      // child runs actual nodeGit. Captured output never returns raw text.
      git: { run: async (args, env) => {
        gitCalls++;
        if (args[0] === "--version") { expect(canonicalize(args) === canonicalize(["--version"]) && canonicalize(env) === "{}").toBe(true); }
        else {
          expect(canonicalize(args) === canonicalize(["clone", "--", remote, directory])).toBe(true);
          expect(args.join(" ").includes(callerToken)).toBe(false);
          // Boolean assertion avoids printing the private test token on failure.
          expect(callerToken.length > 0 && canonicalize(env) === canonicalize({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${callerToken}` })).toBe(true);
        }
        const ran = await bridge.run(args, env);
        expect(ran.outputClean).toBe(true);
        return ran.code;
      } },
    };
    const cloned = await command(context, ["clone", directory]);
    expect(cloned.code, cloned.lines.join("\n")).toBe(0);
    expect(gitCalls).toBe(2);
    expect(readMints).toBe(1);
    expect(cloned.lines).toContain(`Remote URL: ${remote}`);
    expect(cloned.lines).toContain(`Cloned into ${directory}.`);
    expect(cloned.lines.join(" ").includes(callerToken)).toBe(false);
    expect(await store.config()).toHaveProperty("remote", remote);
    expect(JSON.stringify(await store.config()).includes(callerToken)).toBe(false);
    const actual = await bridge.inspect();
    expect(actual).toMatchObject({ head: firstHead, paths: "README.md", readme: `# ${repository}\n\nFounded by @rita through the room ${D.name}.\n`, origin: remote, tokenInConfig: false, tokenInOutput: false });
    expect(actual.tree).toBe(actual.expectedTree);
    expect(actual.readRequests).toBeGreaterThan(0);
    // Inspector-only history read; the CLI above presented actual sessions and
    // used real HTTP admission, bounded outcome/receipt proof and private take.
    platformNet.sessions = false;
    const entries = await G.entries();
    const minted = entries.find((entry) => entry.input.type === "outcome" && entry.input.kind === "mint-read");
    expect(minted?.input).toMatchObject({ type: "outcome", owner: "platform:destination@2", kind: "mint-read", result: "confirmed" });
    if (minted?.input.type !== "outcome") return expect.fail("confirmed outcome is required");
    const handle = (minted.input.evidence.body as { token: string }).token;
    expect(JSON.stringify(entries).includes(callerToken)).toBe(false);
    platformNet.sessions = true;
    expect(await readCredential("https://scopes.test", G.name, session.session.reader(), handle, { fetch: routed as unknown as Fetch })).toEqual({ ok: false, reason: "forbidden" });
  } finally { platformNet.sessions = false; platformNet.secret = null; wired.delete(R.name); platformOutside.delete(G.name); }
});
