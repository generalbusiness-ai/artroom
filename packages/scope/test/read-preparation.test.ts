import { expect, test } from "vitest";
import type { Entry, PlatformDefinition } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, isScopeKind, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { platform, VERSIONS } from "@generalbusiness/dap-platform";
import { Scope } from "../src/core.ts";
import { production } from "../src/ports.ts";
import { PREPARATION_BOUNDS as B, PreparationBudget } from "../src/preparation-budget.ts";
import { preparationScope } from "../src/preparation-scope.ts";
import { ReadPreparation, type PreparationSupport } from "../src/read-preparation.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { testPorts } from "../src/testing.ts";
import { create, type Lane } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
function support(scope: Lane, store: SqliteStore): PreparationSupport {
  const core = new Scope(scope.name, store, { ...production(), ...testPorts(scope.c) }, scope.c.bounds);
  return { policy: () => "native-support-v1", declared: bytes => core.validate(bytes), platform: named => core.platform(named) };
}

test("preparation reads genuine native pinned content without legacy Store readers and caches only successful raw content", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const actual = sqlOf(state), store = new SqliteStore(actual), native = support(scope, store);
    store.scope = () => { throw new Error("legacy scope reader forbidden"); };
    store.stored = () => { throw new Error("legacy history reader forbidden"); };
    store.retained = () => { throw new Error("legacy retained reader forbidden"); };
    let declarations = 0, geneses = 0; const queries: string[] = [];
    const sql: Pick<Sql, "exec"> = { exec(query, ...args) {
      queries.push(query);
      if (query.startsWith("SELECT bytes FROM retained_input")) declarations++;
      if (query.startsWith("SELECT bytes FROM entry")) geneses++;
      return actual.exec(query, ...args);
    } };
    const loader = new ReadPreparation(sql, native), first = loader.capture();
    const before = declarations, current = first?.current() ?? false;
    const second = loader.capture();
    return { first: first?.pinned.named, second: second?.pinned.named, before, declarations, geneses, current, readsOnly: queries.every(query => query.startsWith("SELECT")) };
  });
  expect(got.first).toMatch(/^sha256:/); expect(got.second).toBe(got.first);
  expect(got).toMatchObject({ before: 1, declarations: 1, geneses: 2, current: true, readsOnly: true });
});

test("missing declarations can arrive later and cached content rechecks current whole-runtime support", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const sql = sqlOf(state), store = new SqliteStore(sql), entry = JSON.parse(store.stored(0)!.bytes), named = entry.input.seed.definition;
    const kept = store.retained("definition", named)!; store.forget("definition", named);
    const native = support(scope, store); let runnable = true, declarations = 0;
    const loader = new ReadPreparation({ exec(query, ...args) { if (query.startsWith("SELECT bytes FROM retained_input")) declarations++; return sql.exec(query, ...args); } }, { ...native, declared: bytes => runnable ? native.declared(bytes) : null });
    const absent = loader.capture(); store.retain(kept);
    const arrived = loader.capture(); runnable = false;
    const unsupported = loader.capture(); runnable = true;
    const restored = loader.capture();
    return { absent: absent === null, arrived: arrived !== null, unsupported: unsupported === null, restored: restored !== null, declarations };
  });
  expect(got).toEqual({ absent: true, arrived: true, unsupported: true, restored: true, declarations: 1 });
});

test("an elapsed preparation latches unavailable and installs no late immutable declaration cache", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const actual = sqlOf(state), store = new SqliteStore(actual), native = support(scope, store);
    let active = true, expire = true, bodies = 0;
    const loader = new ReadPreparation({ exec(query, ...args) { if (query.startsWith("SELECT bytes FROM retained_input")) bodies++; return actual.exec(query, ...args); } }, {
      ...native, declared: bytes => { const definition = native.declared(bytes); if (expire) active = false; return definition; },
    });
    const budget = new PreparationBudget(B, () => active), overdue = loader.capture(budget);
    const ended = budget.available; active = true; expire = false;
    const latched = budget.available, fresh = loader.capture();
    return { overdue: overdue !== null, ended, latched, fresh: fresh !== null, bodies };
  });
  expect(got).toEqual({ overdue: false, ended: false, latched: false, fresh: true, bodies: 2 });
});

test("scope metadata distinguishes missing, malformed and oversized before genesis or definition transfer", async () => {
  for (const fault of ["missing", "malformed", "oversized"] as const) {
    const scope = await create();
    const got = await scope.inside(state => {
      const actual = sqlOf(state), store = new SqliteStore(actual), native = support(scope, store), original = store.scope()!;
      if (fault === "missing") state.storage.sql.exec("DELETE FROM meta WHERE k='scope'");
      else state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", fault === "malformed" ? "{" : canonicalize({ ...original, padding: "x".repeat(4097) }));
      let bodies = 0; const transfers: (number | null)[] = [];
      const sql: Pick<Sql, "exec"> = { exec(query, ...args) {
        if (query.startsWith("SELECT bytes FROM")) bodies++;
        const rows = actual.exec(query, ...args).toArray();
        if (query.includes("FROM meta WHERE k='scope'")) transfers.push(typeof rows[0]?.["v"] === "string" ? utf8(rows[0]["v"]).length : null);
        return { toArray: () => rows };
      } };
      const budget = new PreparationBudget(), probe = preparationScope(sql, budget);
      const frame = new ReadPreparation(sql, native).capture();
      return { kind: probe.kind, available: budget.available, frame: frame === null, bodies, transfers };
    });
    expect(got.kind).toBe(fault === "missing" ? "missing" : "unavailable");
    expect(got.available).toBe(fault === "missing"); expect(got.frame).toBe(true); expect(got.bodies).toBe(0);
    expect(got.transfers).toEqual(fault === "malformed" ? [1, 1] : [null, null]);
  }
});

test("declaration admission precedes body transfer and canonical domain identity must match the genesis pin", async () => {
  for (const fault of ["oversized", "digest", "malformed"] as const) {
    const scope = await create();
    const got = await scope.inside(state => {
      const actual = sqlOf(state), store = new SqliteStore(actual), named = JSON.parse(store.stored(0)!.bytes).input.seed.definition;
      const kept = store.retained("definition", named)!, changed = JSON.parse(kept.bytes); changed.name += "-different";
      const bytes = fault === "oversized" ? "x".repeat(B.definition + 1) : fault === "malformed" ? "{" : canonicalize(changed);
      state.storage.sql.exec("UPDATE retained_input SET bytes=? WHERE kind='definition' AND digest=?", bytes, named);
      let bodies = 0;
      const sql: Pick<Sql, "exec"> = { exec(query, ...args) { if (query.startsWith("SELECT bytes FROM retained_input")) bodies++; return actual.exec(query, ...args); } };
      const loader = new ReadPreparation(sql, support(scope, store)), failed = loader.capture() === null, before = bodies;
      state.storage.sql.exec("UPDATE retained_input SET bytes=? WHERE kind='definition' AND digest=?", kept.bytes, named); const corrected = loader.capture();
      return { failed, before, corrected: corrected !== null, bodies };
    });
    expect(got.failed).toBe(true); expect(got.corrected).toBe(true);
    expect(got.before).toBe(fault === "oversized" ? 0 : 1); expect(got.bodies).toBe(got.before + 1);
  }
});

test("one operation cannot recapture a new genesis allowance and post-await changes cannot reuse its frame", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const sql = sqlOf(state), store = new SqliteStore(sql), native = support(scope, store);
    let policy = "first";
    const loader = new ReadPreparation(sql, { ...native, policy: () => policy }), budget = new PreparationBudget(), first = loader.capture(budget);
    const recaptured = loader.capture(budget);
    const policyFrame = loader.capture(); policy = "second";
    const policyChanged = policyFrame?.current() ?? true; policy = "first";
    const current = loader.capture();
    const before = store.scope()!; store.setScope({ ...before, head: { seq: before.head.seq + 1, hash: `sha256:${"0".repeat(64)}` } }); // labelled synthetic head drift
    const changed = current?.current() ?? true;
    return { first: first !== null, recaptured: recaptured === null, available: budget.available, policyChanged, changed, after: current?.budget.available };
  });
  expect(got).toEqual({ first: true, recaptured: true, available: false, policyChanged: false, changed: false, after: false });
});

/** Synthetic pin storage for actual native catalog validation. This does
 * not claim a native judged creation under the replacement platform. */
function pin(state: DurableObjectState, named: PlatformDefinition) {
  const store = new SqliteStore(sqlOf(state)), sample = JSON.parse(store.stored(0)!.bytes) as Entry, current = store.scope()!;
  if (sample.input.type !== "genesis") return expect.fail("native fixture lacks genesis");
  const kind = named.startsWith("platform:directory-partition@") ? "directory" : named.slice("platform:".length).split("@")[0];
  if (!isScopeKind(kind)) return expect.fail("fixture pin has unsupported scope kind");
  const seed = { ...sample.input.seed, kind, definition: named }, at = { ...sample.at, kind, scope: scopeIdOf(seed) };
  const entry: Entry = { ...sample, at, input: { ...sample.input, seed, "founding": null, kind: platform(named)?.data.genesis ?? "unsupported" }, effects: [], sends: [] };
  const bytes = canonicalize(entry), hash = entryHash(entry);
  state.storage.sql.exec("UPDATE entry SET hash=?,bytes=?,size=? WHERE seq=0", hash, bytes, utf8(bytes).length);
  store.setScope({ ...current, at, head: { seq: 0, hash }, genesis: { ...current.genesis, hash } });
}

test("platform preparation uses exact current catalog versions and whole native support, never a newest fallback", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state)), native = support(scope, store), loader = new ReadPreparation(sqlOf(state), native);
    const results = Object.keys(VERSIONS).map(named => {
      pin(state, named as PlatformDefinition);
      const frame = loader.capture();
      return { named, actual: frame?.pinned.named, current: frame?.current() ?? false };
    });
    pin(state, "platform:directory@9999"); const unknown = loader.capture();
    pin(state, "platform:directory@8"); scope.c.platformCode = false;
    const unavailable = loader.capture(); scope.c.platformCode = true;
    const restored = loader.capture();
    return { results, unknown: unknown === null, unavailable: unavailable === null, restored: restored?.pinned.named };
  });
  expect(got.results.length).toBeGreaterThan(10);
  expect(got.results.every(result => result.named === result.actual && result.current)).toBe(true);
  expect(got).toMatchObject({ unknown: true, unavailable: true, restored: "platform:directory@8" });
});

test("exact-catalog preparation refuses fallback to a different runnable native version", async () => {
  const scope = await create();
  const got = await scope.inside(state => {
    pin(state, "platform:directory@8");
    const store = new SqliteStore(sqlOf(state)), core = new Scope(scope.name, store, { ...production(), ...testPorts(scope.c) }, scope.c.bounds);
    const other = core.platform("platform:directory@7");
    const loader = new ReadPreparation(sqlOf(state), { policy: () => "same-test-policy", declared: bytes => core.validate(bytes), platform: () => other });
    return { other: other !== null, refused: loader.capture() === null };
  });
  expect(got).toEqual({ other: true, refused: true });
});
