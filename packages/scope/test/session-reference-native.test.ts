import { expect, test } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Intent, OperationId, PlatformDefinition, Seed, SessionClaims } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { DEMO_PURPOSE, DIRECTORY_OF, repositoryName } from "@generalbusiness/dap-platform";
import { SqliteStore } from "../src/sqlite.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { sessionReferenceReply } from "../src/session-reference.ts";
import type { QueryVisibility } from "../src/session-preparation.ts";
import { PreparationBudget, type PreparationCost } from "../src/preparation-budget.ts";
import { net, soon } from "./net.ts";
import { outsideOf } from "./outside.ts";
import { rita, sam } from "./repository.ts";
import { beginSessionFixture } from "./session-settings.ts";
import { nativeFixtureLifetime, dispatchFixture, effectFixture } from "./support/native-fixture-lifetime.ts";
import { TEST_DEPLOYMENT, type PlatformScope } from "./worker.ts";

/** Native register/directory/membership/rules/destination judgments and RPC.
 * Host is OutsideDouble, clock scripted, setup reader is a test inspector.
 * The final token is deliberately restricted/minted, not an issuance claim. */
const cohorts = Object.entries(DIRECTORY_OF).filter(([, directory], index, entries) => entries.findIndex(([, pin]) => pin === directory) === index).map(([register, directory]) => [register as PlatformDefinition, directory] as const);
test.each(cohorts)("native %s session composition and directory RPC stay bounded without legacy bodies or activation", async (registerPin, directoryPin) => {
  const secret = "a synthetic native reference test secret", owner = beginSessionFixture({ secret, sessions: false, inspector: null });
  const life = nativeFixtureLifetime(owner, { required: false });
  try {
    const demo = registerPin === "platform:register@8";
    const install: Intent = { v: 1, to: null, actor: rita.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "bounded-reference", ...(demo ? { policy: "open", purpose: DEMO_PURPOSE } : { policy: "keys", founders: [rita.key] }) }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = life.platform(scopeIdOf({ v: 1, kind: "register", definition: registerPin, creator: null, cause: intentDigest(install), ordinal: 0 }));
    const host = outsideOf(R.name); life.wire(R.name, () => ({ outside: host }));
    expect(await life.wait(() => R.stub.found(signIntent(install, rita.secret), registerPin))).toMatchObject({ answer: "accepted" });
    const register = await life.wait(() => R.at());
    const found = await life.wait(() => R.intent(rita, "found", { expected: { register: 1 }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } }));
    const seed: Seed = { v: 1, kind: "directory", definition: directoryPin, creator: register, cause: intentDigest(found.intent), ordinal: 0 };
    const D = life.platform(scopeIdOf(seed));
    host.answer("1:0" as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: "bounded-reference-repo" } } });
    expect(await life.wait(() => R.stub.submit(found, []))).toMatchObject({ answer: "accepted" });
    await effectFixture([R], life.wait); await dispatchFixture([R, D], life.wait);
    const entries = await life.wait(() => D.entries());
    const children = [1, 2, 3].map(n => life.platform(scopeIdOf(entries[0]!.sends.find(send => send.n === n)!.to as Seed)));
    await dispatchFixture([R, D, ...children], life.wait);
    const membership = await life.wait(() => children[0]!.at()), rules = await life.wait(() => children[1]!.at()), directory = await life.wait(() => D.at());
    const claims: SessionClaims = { v: 1, deployment: TEST_DEPLOYMENT, membership, member: rita.member.member, key: rita.key, reads: ["summary"], ends: soon(60) };
    const restricted = await life.wait(() => runInDurableObject(children[0]!.object, async instance => {
      // Test invokes the protected support entry directly. There is no public
      // query route or RPC authorization result in the production surface.
      const local = instance as unknown as { sessionEligibility(reader: unknown, visibility: QueryVisibility): Promise<boolean> };
      const matrix: boolean[][] = [];
      for (const reads of [["summary"], ["items"], ["summary", "items"]] as SessionClaims["reads"][]) {
        const token = readerOf(mintSession(sessionsOf(secret, TEST_DEPLOYMENT)!, { ...claims, reads }));
        const row = [];
        for (const visibility of ["live", "final", "mixed"] as const) row.push(await local.sessionEligibility(token, visibility));
        matrix.push(row);
      }
      return matrix;
    }));
    expect(restricted).toEqual([[true, false, false], [false, true, false], [true, true, true]]);
    const birthPaths = [];
    for (const child of children.slice(1)) {
      birthPaths.push(await life.wait(() => runInDurableObject(child.object, async instance => {
        const local = instance as unknown as { sessionEligibility(reader: unknown, visibility: QueryVisibility): Promise<boolean> };
        const rows: boolean[][] = [];
        for (const reads of [["summary"], ["items"], ["summary", "items"]] as SessionClaims["reads"][]) {
          const token = readerOf(mintSession(sessionsOf(secret, TEST_DEPLOYMENT)!, { ...claims, reads }));
          const row = [];
          for (const visibility of ["live", "final", "mixed"] as const) row.push(await local.sessionEligibility(token, visibility));
          rows.push(row);
        }
        return rows;
      })));
    }
    expect(birthPaths).toEqual(Array(2).fill([[true, false, false], [false, false, false], [true, true, true]]));
    const composedCosts = [];
    for (const child of children) {
      composedCosts.push(await life.wait(() => runInDurableObject(child.object, async instance => {
        // Test-only passive ledger around the actual object and receiver.
        // It changes no allowance, query, callback result or production API.
        const costs = new Map<PreparationBudget, PreparationCost>(), original = PreparationBudget.prototype.spend;
        PreparationBudget.prototype.spend = function (cost) {
          original.call(this, cost);
          let total = costs.get(this);
          if (!total) { if (costs.size >= 2) return expect.fail("third preparation participant"); total = { calls: 0, candidates: 0, bytes: 0, metadata: 0, genesis: 0, definition: 0 }; costs.set(this, total); }
          for (const key of ["calls", "candidates", "bytes", "metadata", "genesis", "definition"] as const) total[key] += cost[key] ?? 0;
        };
        try {
          const token = readerOf(mintSession(sessionsOf(secret, TEST_DEPLOYMENT)!, { ...claims, reads: ["summary", "items"] }));
          const local = instance as unknown as { sessionEligibility(reader: unknown, visibility: QueryVisibility): Promise<boolean> };
          return { allowed: await local.sessionEligibility(token, "mixed"), costs: [...costs.values()] };
        } finally { PreparationBudget.prototype.spend = original; }
      })));
    }
    expect(composedCosts.map(result => result.allowed)).toEqual([true, true, true]);
    expect(composedCosts.map(result => result.costs.map(cost => cost.calls))).toEqual([[9], [15, 12], [16, 12]]);
    expect(composedCosts.every(result => result.costs.every(cost => cost.calls <= 16 && cost.candidates <= 16 && cost.bytes <= 256 * 1024 && cost.metadata <= 64 * 1024 && cost.genesis === 1024 * 1024 && cost.definition === 0))).toBe(true);
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
    expect(sessionReferenceReply(direct.answer)).toEqual({ v: 1, directory, definition: directoryPin, membership, rules });
    expect(direct.unchanged).toBe(true);
    const remote = D.object as unknown as { sessionReference(request: string): Promise<string | null> };
    expect(sessionReferenceReply(await life.wait(() => remote.sessionReference(request)))).toEqual(sessionReferenceReply(direct.answer));
    life.active(); net.clock.now = claims.ends;
    expect(await life.wait(() => remote.sessionReference(request))).toBeNull();
  } finally { life.release(); }
});
