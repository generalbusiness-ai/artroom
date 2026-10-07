import { runInDurableObject } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Intent, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, scopeIdOf, seedDigest, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { requestSession, secretSigner, sessionRequest, signedLogReader, type Fetch } from "@generalbusiness/artroom-client";
import { timeMs } from "@generalbusiness/artroom-derive";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { httpSource, render, verify, type HistorySource } from "@generalbusiness/artroom-replay";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { artifactsOutside } from "../src/artifacts-wiring.ts";
import type { Outside } from "../src/index.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam, settle, una, vic } from "./repository.ts";
import { reader } from "./support.ts";
import { platformNet, platformOutside } from "./worker.ts";

const { paul } = keys;
const SERVICE = "https://scopes.test";
const NAMESPACE = "artroom-demo";
const HOST = "service.invalid";

/**
 * STAND-IN: the binding of the hosting's own Git service, as `artifacts-wiring.test.ts` scripts it. Each read token it mints has a
 * new plaintext and ends `ttl` seconds after the scripted clock's reading. No repository or token exists.
 */
function binding() {
  const minted: { name: string; scope: string; ttl: number; plaintext: string }[] = [];
  const ns: ArtifactsNamespace = {
    get: async (name) => ({
      createToken: async (scope, ttl) => {
        const plaintext = `read-plaintext-${minted.length + 1}`;
        minted.push({ name, scope, ttl, plaintext });
        return { id: `tok-${minted.length}`, plaintext, scope, expiresAt: soon(ttl) };
      },
      revokeToken: async () => true,
      info: async () => ({ name, remote: `https://${HOST}/git/${NAMESPACE}/${name}.git` }),
    }),
    create: async () => { throw new Error("no creation in this test"); },
    delete: async () => false,
  };
  return { minted, ns };
}

/** Only the host operation this test is about reaches the scripted host: the destination's first head and its mint stay recorded and unsent. */
const onlyMintRead = (port: Outside): Outside => ({ ...port, accepts: (owner, kind) => kind === "mint-read" && port.accepts(owner, kind), send: (request) => (request.kind === "mint-read" ? port.send(request) : Promise.resolve(null)) });

// Invariant (the planner's decision for I5): an active member's `read-token` opens one `mint-read`; the host mints a read token
// whose outcome records only a nonsecret handle and its end; the token's plaintext is answered once, to the session of the key that
// signed the act, before its end, and then is gone from custody; every other read of it is `forbidden`; the history verifies.
//
// | Part | Is |
// |---|---|
// | The register, the directory, membership and the destination | Real scopes of the namespace `PLATFORM`: the deployed class, the production authority and the platform package's own data and rules. |
// | The register's Git host | A STAND-IN: `OutsideDouble` answers the one creation request with the name of attempt 1. |
// | The destination's Git host | The real `artifacts-wiring.ts` port and `ArtifactsProvider`, over a STAND-IN binding that the test scripts. Only `mint-read` is let through to it. |
// | The readers | The real read sessions, under a TEST SECRET that the test generates, and the real routes; the test's own reads go past them as `platformNet.inspector`. |
// | The clock | The scripted clock of the namespace. No test waits on the wall clock. |
describe("a member's read token on real scopes (the planner's decision for I5). The Git hosts are STAND-INs", () => {
  test("a member mints a read token and reads it once; a second read, another member's session, a read with no session and a read at its end are each forbidden; a key that is no member's is refused; the plaintext is in no entry and is gone from custody; the destination verifies consistent", async () => {
    net.hold = net.deaf = null;
    const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
    // A register on the hosting's own Git service, and a claim whose creation the stand-in answers.
    const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "artifacts", namespace: NAMESPACE, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
    const host = outsideOf(R.name);
    wired.set(R.name, () => ({ outside: host }));
    expect((await R.stub.found(signIntent(install, paul.secret), REGISTER)).answer).toBe("accepted");
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 };
    const D = new Platform(scopeIdOf(seed));
    const name = repositoryName(seedDigest(seed), 1);
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name, id: name } } });
    expect((await R.stub.submit(found, [])).answer).toBe("accepted");
    while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
    await settle(R, D);
    const sent = (await D.entries())[0]!.sends;
    const [M, , G] = [1, 2, 3].map((n) => new Platform(scopeIdOf(sent.find((send) => send.n === n)!.to as Seed))) as [Platform, Platform, Platform];
    await settle(R, D, M, G);
    wired.delete(R.name);

    // Membership: rita seated as the first admin, and una, a member, by an invitation.
    const seat = await M.did(rita, "seat", { expected: { roster: 1 } });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const secret = "the secret of una's invitation, of 32 bytes or more";
    const invitation = await M.did(rita, "invite-member", { fields: { handle: "@una", role: "member", inviteHash: textDigest(secret), inviteEnds: soon(3600) } });
    await M.did(una, "join", { fields: { invitation, secret } });
    await settle(M);

    // The destination's port: the real wiring of the hosting's own Git service, pinned to this register, over the scripted binding.
    const service = binding();
    platformOutside.set(G.name, (given, sql) => onlyMintRead(artifactsOutside(given, sql, { ARTIFACTS_CONFIG: canonicalize({ registerScope: R.name, namespace: NAMESPACE, host: HOST, maxBytes: 1024 * 1024, credentialIdentity: "adapter-attempt" }), ARTIFACTS: service.ns })));
    await G.restart();
    const drive = async () => { while ((await (G.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ } };

    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    try {
      const membership: ScopeRef = await M.at();
      const sessionOf = async (who: typeof una): Promise<string> => {
        const answer = await requestSession(SERVICE, membership.scope, sessionRequest(membership, who.secret, soon(60), b64url(crypto.getRandomValues(new Uint8Array(16)))), { fetch });
        if (!answer.ok) throw new Error(`no session: ${answer.reason}`);
        return answer.session.reader();
      };
      const readToken = async (who: typeof una, hours: number) => {
        const answer = await G.act(who, "read-token", { on: 0, expected: await G.expected({ on: 0 }), fields: { hours } });
        if (answer.answer !== "accepted") return answer;
        await drive();
        const outcome = (await G.entries()).find((entry) => entry.input.type === "outcome" && entry.input.operation === `${answer.receipt.fact.seq}:0`)!;
        return { answer, outcome, handle: (outcome.input as { evidence: { body: { token: string; ends: string } } }).evidence.body };
      };
      const credential = (handle: string, session: string | null) => routed(`${SERVICE}/v1/scopes/${G.name}/credential/${encodeURIComponent(handle)}`, session === null ? {} : { headers: { authorization: session } });

      // A key that is no member's signs nothing here: refused, and nothing is written.
      const before = (await G.summary()).at;
      expect(await G.act(vic, "read-token", { on: 0, expected: await G.expected({ on: 0 }), fields: { hours: 1 } })).toMatchObject({ answer: "refused", reason: "unauthorized" });
      expect((await G.summary()).at).toEqual(before);

      // una, a member, asks for a token of 2 hours: one `mint-read`, one read token of the service for 7200 seconds, and an outcome
      // that names its handle and end and no secret.
      const first = await readToken(una, 2);
      if (!("handle" in first)) throw new Error(`read-token was not accepted: ${JSON.stringify(first)}`);
      expect(first.outcome.input).toMatchObject({ type: "outcome", result: "confirmed", evidence: { basis: "own-answer", body: { token: expect.stringMatching(/^read:sha256:/), ends: soon(7200) } } });
      expect(service.minted).toEqual([{ name, scope: "read", ttl: 7200, plaintext: "read-plaintext-1" }]);
      expect(canonicalize(await G.entries())).not.toContain("read-plaintext");

      // Another member's session may not read it; with no session nothing is read either.
      const [unas, ritas] = [await sessionOf(una), await sessionOf(rita)];
      expect((await credential(first.handle.token, ritas)).status).toBe(403);
      expect((await credential(first.handle.token, null)).status).toBe(403);
      // Control: the session of the signing key reads it once, with its end and the remote URL, and the answer is not to be stored.
      const read = await credential(first.handle.token, unas);
      expect([read.status, read.headers.get("cache-control"), (await read.json() as { value: unknown }).value]).toEqual([200, "no-store", { token: "read-plaintext-1", ends: soon(7200), remote: `https://${HOST}/git/${NAMESPACE}/${name}.git` }]);
      // A second read, by the same session, is forbidden: the plaintext is gone from custody.
      expect((await credential(first.handle.token, unas)).status).toBe(403);
      const held = await runInDurableObject(G.object, (_instance, state: DurableObjectState) => state.storage.sql.exec("SELECT plaintext, state FROM private_credential WHERE id = ?", first.handle.token).toArray());
      expect(held).toEqual([{ plaintext: null, state: "live" }]);

      // The act and its outcome are ordinary entries: the destination's history replays consistent over the read routes, before the clock moves on. As the
      // command's `verify` does, a read that the session is refused goes again as a signed read by the same key: the rules scope
      // records no membership incarnation before its first act, and accepts no session yet.
      const [session, signed] = [httpSource(SERVICE, { fetch, reader: await sessionOf(rita) }), httpSource(SERVICE, { fetch, reader: signedLogReader(secretSigner(rita.secret), { now: () => timeMs(net.clock.now)! }) })];
      const source: HistorySource = {
        page: async (scope, from, allow) => { const got = await session.page(scope, from, allow); return !got.ok && got.reason === "forbidden" ? signed.page(scope, from, allow) : got; },
        retained: async (scope, kind, digest, allow, domain) => { const got = await session.retained(scope, kind, digest, allow, domain); return !got.ok && got.reason === "forbidden" ? signed.retained(scope, kind, digest, allow, domain) : got; },
      };
      const { report, why } = await verify(source, { mode: "replay", scope: G.name, platform, grants: "proven" });
      expect(report.result, render(report, why)).toBe("consistent");

      // At its end a token is not answered. Two tokens with one end: the one read a second before it is answered; the one read at
      // it is forbidden, and dropped.
      const [early, late] = [await readToken(una, 1), await readToken(una, 1)];
      if (!("handle" in early) || !("handle" in late)) throw new Error("read-token was not accepted");
      expect(early.handle.ends).toBe(late.handle.ends);
      net.clock.now = soon(3599);
      expect((await credential(early.handle.token, await sessionOf(una))).status).toBe(200);
      net.clock.now = soon(1);
      expect((await credential(late.handle.token, await sessionOf(una))).status).toBe(403);
      expect(await runInDurableObject(G.object, (_instance, state: DurableObjectState) => state.storage.sql.exec("SELECT plaintext FROM private_credential WHERE id = ?", late.handle.token).toArray())).toEqual([{ plaintext: null }]);

    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      platformNet.inspector = null;
      platformOutside.delete(G.name);
    }
  });
});

