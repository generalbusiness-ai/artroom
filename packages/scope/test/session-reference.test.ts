import { expect, test } from "vitest";
import type { Entry, PlatformDefinition, ScopeRef, SessionClaims } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, newIncarnation, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { SIBLINGS_OF } from "@generalbusiness/dap-platform";
import { Scope } from "../src/core.ts";
import { production } from "../src/ports.ts";
import { ReadPreparation } from "../src/read-preparation.ts";
import { SessionReferences, SESSION_REFERENCE_BOUNDS as B, sessionReferenceReply } from "../src/session-reference.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { testPorts } from "../src/testing.ts";
import { at, found, rita, type Lane } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
const sessions = sessionsOf("a synthetic bounded reference test secret", "bounded-reference-test")!;
/** Synthetic canonical native storage layout and actual platform validation,
 * not a judged directory creation, confirmation, or membership issuance. */
function fixture(scope: Lane, state: DurableObjectState, named: PlatformDefinition = "platform:directory@8") {
  const actual = sqlOf(state), store = new SqliteStore(actual), old = store.scope()!, sample = store.item(0)!;
  const source = JSON.parse(store.stored(0)!.bytes) as Entry;
  if (source.input.type !== "genesis") return expect.fail("missing native sample genesis");
  const seed = { ...source.input.seed, kind: "directory" as const, definition: named };
  const directory: ScopeRef = { ...source.at, kind: "directory", scope: scopeIdOf(seed) };
  const membership: ScopeRef = { scope: scopeIdOf({ ...seed, kind: "membership", ordinal: 100 }), inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "membership" };
  const rules: ScopeRef = { scope: scopeIdOf({ ...seed, kind: "rules", ordinal: 101 }), inc: newIncarnation(new Uint8Array(16).fill(2)), kind: "rules" };
  const entry: Entry = { ...source, at: directory, input: { ...source.input, seed } }, bytes = canonicalize(entry), hash = entryHash(entry);
  state.storage.sql.exec("DELETE FROM entry"); state.storage.sql.exec("INSERT INTO entry(seq,hash,time,bytes,size) VALUES(0,?,?,?,?)", hash, entry.time, bytes, utf8(bytes).length);
  store.setScope({ ...old, at: directory, head: { seq: 0, hash }, genesis: { hash, source: null, n: 0 }, status: "active" });
  const repository = { ...sample, id: 10, type: "repository", state: "open", refs: { membership, rules } }; store.putItem(repository);
  const core = new Scope(scope.name, store, { ...production(), ...testPorts(scope.c) }, scope.c.bounds);
  const queries: string[] = []; let now = 0, queryHook: ((query: string) => void) | null = null;
  const loader = new ReadPreparation({ exec(query, ...args) { queries.push(query); queryHook?.(query); return actual.exec(query, ...args); } }, {
    policy: () => "native-session-support-v1", declared: raw => core.validate(raw), platform: pin => core.platform(pin),
  });
  let clock = at(1);
  const receiver = new SessionReferences(loader, () => sessions, { read: () => clock }, () => now);
  const claims: SessionClaims = { v: 1, deployment: sessions.deployment, membership, member: rita.member.member, key: rita.key, reads: ["summary", "items"], ends: at(60) };
  const token = (over: Partial<SessionClaims> = {}) => readerOf(mintSession(sessions, { ...claims, ...over }));
  const request = (reader = token(), to = directory, maxBytes: number = B.reply) => canonicalize({ v: 1, to, reader, maxBytes });
  return { receiver, store, queries, repository, directory, membership, rules, claims, token, request, hook: (work: (query: string) => void) => { queryHook = work; }, clock: (value: ReturnType<typeof at>) => { clock = value; }, now: (value: number) => { now = value; } };
}

test("small reference receiver admits every current directory cohort, authenticates before SQL and returns only the strict reference witness", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const results = [];
    for (const named of Object.keys(SIBLINGS_OF)) {
      const f = fixture(scope, state, named as PlatformDefinition);
      const altered = f.token().slice(0, -1) + "!";
      for (const bad of [altered, f.token({ deployment: "elsewhere" }), f.token({ reads: ["items"] })]) expect(f.receiver.read(f.request(bad))).toBeNull();
      expect(f.queries).toHaveLength(0);
      const raw = f.receiver.read(f.request()), reply = sessionReferenceReply(raw);
      results.push({ named, reply, bytes: typeof raw === "string" ? utf8(raw).length : null, selectsOnly: f.queries.every(q => q.startsWith("SELECT")), bodies: f.queries.filter(q => q.startsWith("SELECT record FROM")).length });
      expect(reply).toEqual({ v: 1, directory: f.directory, definition: named, membership: f.membership, rules: f.rules });
    }
    return results;
  });
  expect(got).toHaveLength(Object.keys(SIBLINGS_OF).length);
  expect(got.every(row => row.bytes !== null && row.bytes <= B.reply && row.selectsOnly && row.bodies === 1)).toBe(true);
});

test("reference receiver refuses wrong identity/repository, expiry, clock drift and duplicate open records without a second body", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const f = fixture(scope, state), otherInc = newIncarnation(new Uint8Array(16).fill(9));
    const refused = [
      f.receiver.read(f.request(f.token(), { ...f.directory, inc: otherInc })),
      f.receiver.read(f.request(f.token({ membership: { ...f.membership, inc: otherInc } }))),
      f.receiver.read(f.request(f.token({ ends: at(1) }))),
    ];
    f.clock(at(-1)); refused.push(f.receiver.read(f.request())); f.clock(at(1));
    f.store.putItem({ ...f.repository, id: 11, values: { text: "x".repeat(1024 * 1024) } });
    f.queries.length = 0; refused.push(f.receiver.read(f.request()));
    return { refused, bodies: f.queries.filter(q => q.startsWith("SELECT record FROM")).length };
  });
  expect(got.refused).toEqual(Array(5).fill(null)); expect(got.bodies).toBe(1);
});

test("reference request and reply caps, oversized metadata/body and unsupported pins fail closed before unwanted transfer", async () => {
  for (const fault of ["request", "scope", "body", "pin", "reply"] as const) {
    const scope = await found();
    const got = await scope.inside(state => {
      const f = fixture(scope, state, fault === "pin" ? "platform:directory@9999" : "platform:directory@8");
      if (fault === "scope") state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", "x".repeat(4097));
      if (fault === "body") f.store.putItem({ ...f.repository, values: { text: "x".repeat(256 * 1024) } });
      const answer = f.receiver.read(fault === "request" ? "x".repeat(B.request + 1) : f.request(f.token(), f.directory, fault === "reply" ? 1 : Number.MAX_SAFE_INTEGER));
      return { answer, queries: f.queries.length, bodies: f.queries.filter(q => q.startsWith("SELECT record FROM")).length, genesis: f.queries.filter(q => q.startsWith("SELECT bytes FROM entry")).length };
    });
    expect(got.answer).toBeNull();
    if (fault === "request") expect(got.queries).toBe(0);
    if (fault === "scope") expect(got.genesis).toBe(0);
    if (fault === "body") expect(got.bodies).toBe(0);
  }
});

test("reference completion refuses head drift, elapsed final storage and expiry after preparation", async () => {
  for (const fault of ["head", "deadline", "expiry"] as const) {
    const scope = await found();
    const got = await scope.inside(state => {
      const f = fixture(scope, state); let metadata = 0;
      f.hook(query => {
        if (!query.includes("FROM meta WHERE k='scope'")) return;
        if (++metadata !== 3) return; // final current(), after capture plus ProofBytes identity
        if (fault === "deadline") f.now(B.milliseconds);
        if (fault === "expiry") f.clock(f.claims.ends);
        if (fault === "head") { const current = f.store.scope()!; f.store.setScope({ ...current, head: { ...current.head, seq: 1 } }); }
      });
      return { answer: f.receiver.read(f.request()), metadata };
    });
    expect(got).toEqual({ answer: null, metadata: 3 });
  }
});
