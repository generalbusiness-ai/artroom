import { expect, test } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { SessionClaims } from "@generalbusiness/dap-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { SqliteStore } from "../src/sqlite.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { sessionReferenceReply } from "../src/session-reference.ts";
import type { QueryVisibility } from "../src/session-preparation.ts";
import { PreparationBudget, type PreparationCost } from "../src/preparation-budget.ts";
import { net } from "./net.ts";
import { sessionCohorts, sessionRoom } from "./support/session-room.ts";
import { TEST_DEPLOYMENT, type PlatformScope } from "./worker.ts";

/** Native register/directory/membership/rules/destination judgments and RPC.
 * Host is OutsideDouble, clock scripted, setup reader is a test inspector.
 * The final token is deliberately restricted/minted, not an issuance claim. */
test.each(sessionCohorts)("native %s session composition and directory RPC stay bounded without legacy bodies or activation", async (registerPin, directoryPin) => {
  const { life, D, children, membership, rules, directory, claims, secret } = await sessionRoom(registerPin);
  try {
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
    // The reference method is the new object's first call after activation;
    // it must not turn that cold read into the legacy activation driver.
    await life.wait(() => D.restart());
    const direct = await life.wait(() => runInDurableObject(D.object, (instance, state) => {
      const snapshot = () => canonicalize([state.storage.sql.exec("SELECT * FROM meta ORDER BY k").toArray(), state.storage.sql.exec("SELECT seq,hash FROM entry ORDER BY seq").toArray(), state.storage.sql.exec("SELECT id,record FROM item ORDER BY id").toArray(), state.storage.sql.exec("SELECT * FROM outbox ORDER BY seq,n").toArray(), state.storage.sql.exec("SELECT * FROM operation ORDER BY seq,k").toArray()]);
      const before = snapshot(), old = { scope: SqliteStore.prototype.scope, stored: SqliteStore.prototype.stored, retained: SqliteStore.prototype.retained, page: SqliteStore.prototype.page, parked: SqliteStore.prototype.parked };
      let forbiddenCalls = 0;
      const forbidden = () => { forbiddenCalls++; throw new Error("legacy reader/activation forbidden"); };
      Object.assign(SqliteStore.prototype, { scope: forbidden, stored: forbidden, retained: forbidden, page: forbidden, parked: forbidden });
      try {
        let answer: string | null = null;
        try { answer = (instance as PlatformScope).sessionReference(request); }
        catch (error) { if (!(error instanceof Error) || error.message !== "legacy reader/activation forbidden") throw error; }
        return { answer, unchanged: snapshot() === before, forbiddenCalls };
      }
      finally { Object.assign(SqliteStore.prototype, old); }
    }));
    expect(sessionReferenceReply(direct.answer)).toEqual({ v: 1, directory, definition: directoryPin, membership, rules });
    expect(direct.unchanged).toBe(true);
    expect(direct.forbiddenCalls).toBe(0);
    const remote = D.object as unknown as { sessionReference(request: string): Promise<string | null> };
    expect(sessionReferenceReply(await life.wait(() => remote.sessionReference(request)))).toEqual(sessionReferenceReply(direct.answer));
    life.active(); net.clock.now = claims.ends;
    expect(await life.wait(() => remote.sessionReference(request))).toBeNull();
  } finally { life.release(); }
});
