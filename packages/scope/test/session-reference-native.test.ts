import { expect, test } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Intent, OperationId, Seed, SessionClaims } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { DIRECTORY, REGISTER, repositoryName } from "@generalbusiness/dap-platform";
import { SqliteStore } from "../src/sqlite.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { sessionReferenceReply } from "../src/session-reference.ts";
import { net, soon } from "./net.ts";
import { outsideOf } from "./outside.ts";
import { rita, sam } from "./repository.ts";
import { beginSessionFixture } from "./session-settings.ts";
import { nativeFixtureLifetime, dispatchFixture, effectFixture } from "./support/native-fixture-lifetime.ts";
import { TEST_DEPLOYMENT, type PlatformScope } from "./worker.ts";

/** Native register/directory/membership/rules/destination judgments and RPC.
 * Host is OutsideDouble, clock scripted, setup reader is a test inspector.
 * The final token is deliberately restricted/minted, not an issuance claim. */
test("native directory reference RPC reads no legacy bodies or activation turn and preserves its recorded state", async () => {
  const secret = "a synthetic native reference test secret", owner = beginSessionFixture({ secret, sessions: false, inspector: null });
  const life = nativeFixtureLifetime(owner, { required: false });
  try {
    const install: Intent = { v: 1, to: null, actor: rita.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "bounded-reference", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = life.platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
    const host = outsideOf(R.name); life.wire(R.name, () => ({ outside: host }));
    expect(await life.wait(() => R.stub.found(signIntent(install, rita.secret), REGISTER))).toMatchObject({ answer: "accepted" });
    const register = await life.wait(() => R.at());
    const found = await life.wait(() => R.intent(rita, "found", { expected: { register: 1 }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } }));
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: register, cause: intentDigest(found.intent), ordinal: 0 };
    const D = life.platform(scopeIdOf(seed));
    host.answer("1:0" as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: "bounded-reference-repo" } } });
    expect(await life.wait(() => R.stub.submit(found, []))).toMatchObject({ answer: "accepted" });
    await effectFixture([R], life.wait); await dispatchFixture([R, D], life.wait);
    const entries = await life.wait(() => D.entries());
    const children = [1, 2, 3].map(n => life.platform(scopeIdOf(entries[0]!.sends.find(send => send.n === n)!.to as Seed)));
    await dispatchFixture([R, D, ...children], life.wait);
    const membership = await life.wait(() => children[0]!.at()), rules = await life.wait(() => children[1]!.at()), directory = await life.wait(() => D.at());
    const claims: SessionClaims = { v: 1, deployment: TEST_DEPLOYMENT, membership, member: rita.member.member, key: rita.key, reads: ["summary"], ends: soon(60) };
    const reader = readerOf(mintSession(sessionsOf(secret, TEST_DEPLOYMENT)!, claims));
    const request = canonicalize({ v: 1, to: directory, reader, maxBytes: 2048, milliseconds: 10_000 });
    const direct = await life.wait(() => runInDurableObject(D.object, (instance, state) => {
      const snapshot = () => canonicalize([state.storage.sql.exec("SELECT * FROM meta ORDER BY k").toArray(), state.storage.sql.exec("SELECT seq,hash FROM entry ORDER BY seq").toArray(), state.storage.sql.exec("SELECT id,record FROM item ORDER BY id").toArray(), state.storage.sql.exec("SELECT * FROM outbox ORDER BY seq,n").toArray(), state.storage.sql.exec("SELECT * FROM operation ORDER BY seq,k").toArray()]);
      const before = snapshot(), old = { scope: SqliteStore.prototype.scope, stored: SqliteStore.prototype.stored, retained: SqliteStore.prototype.retained, page: SqliteStore.prototype.page };
      const forbidden = () => { throw new Error("legacy reader/activation forbidden"); };
      Object.assign(SqliteStore.prototype, { scope: forbidden, stored: forbidden, retained: forbidden, page: forbidden });
      try { return { answer: (instance as PlatformScope).sessionReference(request), unchanged: snapshot() === before }; }
      finally { Object.assign(SqliteStore.prototype, old); }
    }));
    expect(sessionReferenceReply(direct.answer)).toEqual({ v: 1, directory, definition: DIRECTORY, membership, rules });
    expect(direct.unchanged).toBe(true);
    const remote = D.object as unknown as { sessionReference(request: string): Promise<string | null> };
    expect(sessionReferenceReply(await life.wait(() => remote.sessionReference(request)))).toEqual(sessionReferenceReply(direct.answer));
    life.active(); net.clock.now = claims.ends;
    expect(await life.wait(() => remote.sessionReference(request))).toBeNull();
  } finally { life.release(); }
});
