import { expect, test } from "vitest";
import type { ScopeRef, SessionClaims } from "@generalbusiness/dap-contract";
import { newIncarnation } from "@generalbusiness/artroom-bytes";
import { Scope } from "../src/core.ts";
import { production } from "../src/ports.ts";
import { ReadPreparation } from "../src/read-preparation.ts";
import { preparedSessionAllows, type QueryVisibility } from "../src/session-preparation.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { testPorts } from "../src/testing.ts";
import { at, create, rita } from "./support.ts";

test("bounded session policy preserves manually restricted live/final/mixed and unresolved-birth summary claims with fresh MAC and clock", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const sql: Sql = { exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) };
    const store = new SqliteStore(sql), core = new Scope(scope.name, store, { ...production(), ...testPorts(scope.c) }, scope.c.bounds);
    const loader = new ReadPreparation(sql, { policy: () => "native-session-policy-v1", declared: bytes => core.validate(bytes), platform: named => core.platform(named) });
    const frame = loader.capture(); if (!frame || !frame.current()) return expect.fail("native frame unavailable");
    const membership: ScopeRef = { ...scope.at, kind: "membership" }; // explicit policy-boundary reference, not native repository discovery
    const configured = sessionsOf("a synthetic restricted session test secret", "bounded-session-test")!;
    let sessions: typeof configured | null = configured, now = at(1), secretsRead = 0;
    const config = { sessions: () => { secretsRead++; return sessions; }, clock: { read: () => now } };
    const claims: SessionClaims = { v: 1, deployment: configured.deployment, membership, member: rita.member.member, key: rita.key, reads: [], ends: at(60) };
    const token = (over: Partial<SessionClaims> = {}) => readerOf(mintSession(configured, { ...claims, ...over }));
    const matrix = ([[], ["summary"], ["items"], ["summary", "items"]] as SessionClaims["reads"][]).map(reads => {
      const reader = token({ reads });
      return (["live", "final", "mixed"] as QueryVisibility[]).map(visibility => [preparedSessionAllows(config, frame, reader, visibility, membership), preparedSessionAllows(config, frame, reader, visibility, membership, true)]);
    });
    const valid = token({ reads: ["summary", "items"] });
    const wrong = preparedSessionAllows(config, frame, token({ reads: ["summary"], membership: { ...membership, inc: newIncarnation(new Uint8Array(16).fill(9)) } }), "live", membership);
    now = claims.ends; const expired = preparedSessionAllows(config, frame, valid, "mixed", membership);
    now = at(-1); const behind = preparedSessionAllows(config, frame, valid, "mixed", membership);
    now = at(1); sessions = null; const changedSecret = preparedSessionAllows(config, frame, valid, "mixed", membership);
    sessions = configured; const restored = preparedSessionAllows(config, frame, valid, "mixed", membership);
    frame.budget.invalidate(); const before = secretsRead, stopped = preparedSessionAllows(config, frame, valid, "mixed", membership);
    return { matrix, wrong, expired, behind, changedSecret, restored, stopped, stoppedBeforeAuth: before === secretsRead };
  });
  expect(got.matrix).toEqual([
    [[false, false], [false, false], [false, false]],
    [[true, true], [false, false], [false, false]],
    [[false, false], [true, false], [false, false]],
    [[true, true], [true, true], [true, true]],
  ]);
  expect(got).toMatchObject({ wrong: false, expired: false, behind: false, changedSecret: false, restored: true, stopped: false, stoppedBeforeAuth: true });
});
