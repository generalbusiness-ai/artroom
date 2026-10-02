import { describe, expect, it } from "vitest";
import {
  PROVISIONAL_BUDGET,
  ROW_LIMIT,
  check,
  checkOptions,
  evaluateRows,
  gateOk,
  gateOptions,
  queryWorkerRows,
  rowGate,
  rowTable,
  rowTableMarkdown,
  windowEndAfterSettle,
  workerNamespaces,
  type WorkerRows,
} from "../../measure/rows.mjs";

/**
 * Request 8bd623cc, part 2: the Durable Object row gate, against recorded
 * responses in the shapes Cloudflare's REST namespace list and GraphQL
 * analytics API return (the shapes woo's gate handled, woo 6d2c425a). No
 * live call is made.
 */

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const NAMESPACES = [
  { id: "ns-room", name: "artroom-spike-room_Room", class: "Room", script: "artroom-spike-room" },
  { id: "ns-registry", name: "artroom-spike-room_Registry", class: "Registry", script: "artroom-spike-room" },
  { id: "ns-publisher", name: "artroom-spike-room_Publisher", class: "Publisher", script: "artroom-spike-room" },
  { id: "ns-runner", name: "artroom-spike-checkers_RunnerBox", class: "RunnerBox", script: "artroom-spike-checkers" },
  { id: "ns-prod", name: "artroom-room_Room", class: "Room", script: "artroom-room" },
];

type Periodic = { dimensions: { objectId: string; name?: string; namespaceId: string }; sum: { rowsWritten: number; rowsRead: number } };
type Invocation = { dimensions: { objectId: string; namespaceId: string }; sum: { requests: number } };
type Account = { durableObjectsPeriodicGroups?: Periodic[]; durableObjectsInvocationsAdaptiveGroups?: Invocation[] };

/** One room object, the registry and one publisher, each with rows and invocations. */
const ROWS: Record<string, Account> = {
  "ns-room": {
    durableObjectsPeriodicGroups: [
      { dimensions: { objectId: "o-room", name: "room_aaaa", namespaceId: "ns-room" }, sum: { rowsWritten: 90, rowsRead: 400 } },
      { dimensions: { objectId: "o-room", name: "room_aaaa", namespaceId: "ns-room" }, sum: { rowsWritten: 10, rowsRead: 100 } },
      { dimensions: { objectId: "o-other", name: "room_bbbb", namespaceId: "ns-room" }, sum: { rowsWritten: 7, rowsRead: 3 } },
    ],
    durableObjectsInvocationsAdaptiveGroups: [
      { dimensions: { objectId: "o-room", namespaceId: "ns-room" }, sum: { requests: 12 } },
      { dimensions: { objectId: "o-other", namespaceId: "ns-room" }, sum: { requests: 1 } },
    ],
  },
  "ns-registry": {
    durableObjectsPeriodicGroups: [{ dimensions: { objectId: "o-reg", name: "registry", namespaceId: "ns-registry" }, sum: { rowsWritten: 4, rowsRead: 9 } }],
    durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { objectId: "o-reg", namespaceId: "ns-registry" }, sum: { requests: 2 } }],
  },
  "ns-publisher": {
    durableObjectsPeriodicGroups: [{ dimensions: { objectId: "o-pub", namespaceId: "ns-publisher" }, sum: { rowsWritten: 2, rowsRead: 1 } }],
    durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { objectId: "o-pub", namespaceId: "ns-publisher" }, sum: { requests: 1 } }],
  },
};

interface Fake {
  readonly fetchImpl: typeof fetch;
  readonly calls: { url: string; auth: string | null; body: { query?: string; variables?: Record<string, unknown> } | null }[];
}

/** A fake Cloudflare API: the namespace list, GraphQL answers by namespace, and a webhook. `graphql` may replace an answer. */
function fakeCloudflare(opts: { namespaces?: unknown[]; list?: (page: number) => Response; graphql?: (ns: string) => Response | undefined; rows?: Record<string, Account> } = {}): Fake {
  const calls: Fake["calls"] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Fake["calls"][number]["body"]) : null;
    calls.push({ url, auth: new Headers(init?.headers).get("authorization"), body });
    if (url.includes("/workers/durable_objects/namespaces")) {
      const page = Number(new URL(url).searchParams.get("page"));
      return opts.list?.(page) ?? json({ success: true, errors: [], messages: [], result: opts.namespaces ?? NAMESPACES, result_info: { page, per_page: 100, count: 5, total_count: 5, total_pages: 1 } });
    }
    if (url.endsWith("/graphql")) {
      const ns = String(body?.variables?.["namespaceId"]);
      return opts.graphql?.(ns) ?? json({ data: { viewer: { accounts: [(opts.rows ?? ROWS)[ns] ?? { durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [] }] } }, errors: null });
    }
    if (url.startsWith("https://alerts.example.invalid/")) return new Response(null, { status: 204 });
    return json({ success: false, errors: [{ message: `unexpected ${url}` }] }, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const WINDOW = { from: "2026-10-02T12:00:00.000Z", to: "2026-10-02T13:00:00.000Z" };
const query = (fake: Fake, extra: Partial<Parameters<typeof queryWorkerRows>[0]> = {}) =>
  queryWorkerRows({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl, ...extra });

describe("row gate: attribution", () => {
  it("resolves the Worker's namespaces by script name on every run, ignoring other Workers'", async () => {
    const fake = fakeCloudflare();
    const ns = await workerNamespaces({ accountId: "acct", token: "tok", worker: "artroom-spike-room", fetchImpl: fake.fetchImpl });
    expect(ns.map((n) => [n.id, n.className])).toEqual([
      ["ns-publisher", "Publisher"],
      ["ns-registry", "Registry"],
      ["ns-room", "Room"],
    ]);
    expect(fake.calls[0]!.auth).toBe("Bearer tok");
    expect(fake.calls[0]!.url).toContain("/accounts/acct/workers/durable_objects/namespaces?page=1&per_page=100");
  });

  it("reads every page of the namespace list", async () => {
    const page = (n: number) => Array.from({ length: 100 }, (_, i) => ({ id: `x${n}-${i}`, name: "x", class: "X", script: "other" }));
    const fake = fakeCloudflare({
      list: (p) => json({ success: true, result: p === 1 ? page(1) : NAMESPACES, result_info: { page: p, total_pages: 2 } }),
    });
    const ns = await workerNamespaces({ accountId: "acct", token: "tok", worker: "artroom-spike-room", fetchImpl: fake.fetchImpl });
    expect(ns).toHaveLength(3);
    expect(fake.calls.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["1", "2"]);
  });

  it("sums rows written, rows read and requests by namespace and object for the window", async () => {
    const fake = fakeCloudflare();
    const r = await query(fake);
    expect(r.totalRowsWritten).toBe(113);
    expect(r.totalRowsRead).toBe(513);
    expect(r.totalRequests).toBe(16);
    expect(r.objects.map((o) => [o.className, o.name || o.objectId, o.rowsWritten, o.rowsRead, o.requests, o.periodicSamples])).toEqual([
      ["Publisher", "o-pub", 2, 1, 1, 1],
      ["Registry", "registry", 4, 9, 2, 1],
      ["Room", "room_aaaa", 100, 500, 12, 2],
      ["Room", "room_bbbb", 7, 3, 1, 1],
    ]);
    // One GraphQL query per namespace, bounded by the window, asking both datasets for rows written and read.
    const gql = fake.calls.filter((c) => c.url.endsWith("/graphql"));
    expect(gql.map((c) => c.body?.variables?.["namespaceId"]).sort()).toEqual(["ns-publisher", "ns-registry", "ns-room"]);
    for (const c of gql) {
      expect(c.body?.variables).toMatchObject({ accountTag: "acct", start: WINDOW.from, end: WINDOW.to });
      expect(c.body?.query).toMatch(/durableObjectsPeriodicGroups[\s\S]*sum \{ rowsWritten rowsRead \}/);
      expect(c.body?.query).toMatch(/durableObjectsInvocationsAdaptiveGroups[\s\S]*sum \{ requests \}/);
      expect(c.body?.query).toMatch(/datetime_geq: \$start, datetime_lt: \$end/);
    }
  });

  it("tables a measured window by this room, the registry, publishers and anything else", async () => {
    const result = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fakeCloudflare().fetchImpl });
    const rows = rowTable([{ name: "claim", kind: "act", ...WINDOW }, { name: "land", kind: "act", ...WINDOW }], [result], "room_aaaa");
    expect(rows[0]).toMatchObject({ window: "claim", state: "pass", roomWritten: 100, roomRead: 500, registryWritten: 4, registryRead: 9, publisherWritten: 2, publisherRead: 1, otherWritten: 7 });
    // A window with no report is shown as missing, never as zero rows that passed.
    expect(rows[1]).toMatchObject({ window: "land", state: "missing" });
    expect(rowTableMarkdown(rows)).toContain("| claim | act | 100 | 500 | 4 | 9 | 2 | 1 | 7 | pass |");
  });
});

describe("row gate: fails closed", () => {
  it("no token: nothing is fetched, and the gate is incomplete", async () => {
    const fake = fakeCloudflare();
    await expect(query(fake, { token: null })).rejects.toThrow("ARTROOM_CF_ANALYTICS_TOKEN is not set");
    const g = await rowGate({ accountId: "acct", token: null, worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
    expect(g).toMatchObject({ state: "incomplete", failures: ["ARTROOM_CF_ANALYTICS_TOKEN is not set"] });
    expect(fake.calls).toEqual([]);
  });

  it("a required namespace missing, or none at all", async () => {
    const noPublisher = fakeCloudflare({ namespaces: NAMESPACES.filter((n) => n.class !== "Publisher") });
    await expect(query(noPublisher)).rejects.toThrow("missing required Durable Object namespaces: Publisher");
    const none = fakeCloudflare({ namespaces: [] });
    await expect(query(none, { worker: "artroom-unknown" })).rejects.toThrow("owns no Durable Object namespace");
  });

  it("an unsuccessful, failed or non-JSON namespace list", async () => {
    await expect(query(fakeCloudflare({ list: () => json({ success: false, errors: [{ code: 10000, message: "Authentication error" }], result: null }) }))).rejects.toThrow("Authentication error");
    await expect(query(fakeCloudflare({ list: () => json({ success: false, errors: [{ code: 9109, message: "Unauthorized" }] }, 403) }))).rejects.toThrow("HTTP 403");
    await expect(query(fakeCloudflare({ list: () => new Response("<html>bad gateway</html>", { status: 502 }) }))).rejects.toThrow("non-JSON HTTP 502");
  });

  it("a namespace list that never ends is truncation", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, name: "x", class: "X", script: "other" }));
    const fake = fakeCloudflare({ list: (p) => json({ success: true, result: page, result_info: { page: p, total_pages: 1_000 } }) });
    await expect(query(fake)).rejects.toThrow("truncated");
  });

  it("GraphQL errors, a missing account or dataset, and a result at the row limit", async () => {
    const answer = (ns: string, r: Response) => fakeCloudflare({ graphql: (n) => (n === ns ? r : undefined) });
    await expect(query(answer("ns-room", json({ data: null, errors: [{ message: "unknown field rowsRead", path: ["viewer"] }] })))).rejects.toThrow("GraphQL errors");
    await expect(query(answer("ns-room", json({ data: { viewer: { accounts: [] } }, errors: null })))).rejects.toThrow("returned no account");
    await expect(query(answer("ns-registry", json({ data: { viewer: { accounts: [{ durableObjectsPeriodicGroups: [] }] } }, errors: null })))).rejects.toThrow("omitted a required dataset");
    await expect(query(answer("ns-room", json({ errors: [{ message: "rate limited" }] }, 429)))).rejects.toThrow("HTTP 429");
    const full = Array.from({ length: ROW_LIMIT }, (_, i) => ({ dimensions: { objectId: `o${i}`, namespaceId: "ns-room" }, sum: { rowsWritten: 1, rowsRead: 0 } }));
    await expect(query(answer("ns-room", json({ data: { viewer: { accounts: [{ durableObjectsPeriodicGroups: full, durableObjectsInvocationsAdaptiveGroups: [] }] } }, errors: null })))).rejects.toThrow("truncated");
    // rowGate turns each into an incomplete gate with its reason, never a pass.
    const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: answer("ns-room", json({ data: { viewer: { accounts: [] } }, errors: null })).fetchImpl });
    expect(g.state).toBe("incomplete");
    expect(g.failures[0]).toContain("returned no account");
  });

  it("no invocation evidence, or invocations with no periodic sample, is incomplete, not zero rows", async () => {
    const empty = { durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [] };
    const quiet = await query(fakeCloudflare({ rows: { "ns-room": empty, "ns-registry": empty, "ns-publisher": empty } }));
    expect(evaluateRows(quiet, PROVISIONAL_BUDGET)).toEqual({ state: "incomplete", failures: ["no Durable Object invocations were visible in the window"] });
    const lagging = await query(fakeCloudflare({ rows: { ...ROWS, "ns-registry": { ...ROWS["ns-registry"], durableObjectsPeriodicGroups: [] } } }));
    expect(evaluateRows(lagging, PROVISIONAL_BUDGET)).toEqual({ state: "incomplete", failures: ["artroom-spike-room_Registry/o-reg had invocations but no periodic storage sample"] });
  });
});

describe("row gate: budgets", () => {
  const report: WorkerRows = {
    worker: "artroom-spike-room",
    ...WINDOW,
    namespaces: [],
    totalRowsWritten: 120,
    totalRowsRead: 0,
    totalRequests: 10,
    objects: [{ namespaceId: "ns-room", namespace: "artroom-spike-room_Room", className: "Room", objectId: "o-room", name: "room_aaaa", rowsWritten: 90, rowsRead: 0, requests: 10, periodicSamples: 1 }],
  };

  it("fails the total and each hot object; passes at the ceilings", () => {
    expect(evaluateRows(report, { maxRowsWritten: 100, maxRowsWrittenPerObject: 80 })).toEqual({
      state: "violation",
      failures: ["worker artroom-spike-room rows written 120 > 100", "artroom-spike-room_Room/room_aaaa rows written 90 > 80"],
    });
    expect(evaluateRows(report, { maxRowsWritten: 120, maxRowsWrittenPerObject: 90 })).toEqual({ state: "pass", failures: [] });
  });

  it("the provisional ceilings are woo's 250,000 total and 50,000 per object, and say so", async () => {
    expect(PROVISIONAL_BUDGET).toEqual({ maxRowsWritten: 250_000, maxRowsWrittenPerObject: 50_000 });
    const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fakeCloudflare().fetchImpl });
    expect(g).toMatchObject({ state: "pass", provisional: true, totalRowsWritten: 113 });
  });
});

describe("row gate: the smoke run's switch", () => {
  it("runs when the token is present, skips without it, and fails closed when demanded without it", () => {
    expect(gateOptions({ ARTROOM_CF_ANALYTICS_TOKEN: "tok" })).toMatchObject({ run: true, token: "tok", accountId: "6e953d231f1c9aadffbf59537a82e13a" });
    expect(gateOptions({ ARTROOM_CF_ANALYTICS_TOKEN: "tok", CF_ACCOUNT_ID: "other" })).toMatchObject({ run: true, accountId: "other" });
    expect(gateOptions({})).toEqual({ run: false, reason: "ARTROOM_CF_ANALYTICS_TOKEN is not set" });
    expect(() => gateOptions({ ARTROOM_ROW_GATE: "1" })).toThrow("ARTROOM_ROW_GATE=1 but ARTROOM_CF_ANALYTICS_TOKEN is not set");
    expect(() => gateOptions({ ARTROOM_ROW_GATE: "1", ARTROOM_CF_ANALYTICS_TOKEN: "" })).toThrow("cannot run");
  });

  it("a run passes only on a gate that passed or was skipped", () => {
    expect(gateOk({ state: "pass" })).toBe(true);
    expect(gateOk({ state: "skipped" })).toBe(true);
    for (const state of ["violation", "incomplete", "missing", undefined]) expect(gateOk({ state })).toBe(false);
    expect(gateOk(null)).toBe(false);
  });

  it("reads the window's end only after the settle wait (woo 50163fc1)", async () => {
    const order: string[] = [];
    const end = await windowEndAfterSettle(
      120_000,
      async (ms) => void order.push(`wait:${ms}`),
      () => (order.push("now"), new Date("2026-10-02T13:02:00.000Z")),
    );
    expect(order).toEqual(["wait:120000", "now"]);
    expect(end).toBe("2026-10-02T13:02:00.000Z");
  });
});

describe("row gate: the scheduled check", () => {
  const HOOK = "https://alerts.example.invalid/hook";

  it("defaults to the hour ending ten minutes ago, the spike Room Worker and the provisional budget", () => {
    const o = checkOptions([], Date.parse("2026-10-02T13:10:00.000Z"));
    expect(o).toEqual({ worker: "artroom-spike-room", from: "2026-10-02T12:00:00.000Z", to: "2026-10-02T13:00:00.000Z", budget: PROVISIONAL_BUDGET });
    expect(checkOptions(["--max-rows-written", "10", "--max-rows-written-per-object", "5", "--worker", "artroom-spike-checkers"]).budget).toEqual({ maxRowsWritten: 10, maxRowsWrittenPerObject: 5 });
    expect(() => checkOptions(["--max-rows-written", "NaN"])).toThrow("non-negative integer");
    expect(() => checkOptions(["--from", "2026-10-02T13:00:00Z", "--to", "2026-10-02T12:00:00Z"])).toThrow("from before to");
  });

  it("exit 0 on a pass and no alert; 2 over budget, 3 incomplete and 1 without a token, each alerting", async () => {
    const quietLog = console.log;
    console.log = () => {};
    try {
      const args = ["--from", WINDOW.from, "--to", WINDOW.to];
      const env = { ARTROOM_CF_ANALYTICS_TOKEN: "tok", ARTROOM_ROW_ALERT_WEBHOOK_URL: HOOK };
      const hooks = (f: Fake) => f.calls.filter((c) => c.url === HOOK);

      const pass = fakeCloudflare();
      expect(await check(args, env, pass.fetchImpl)).toBe(0);
      expect(hooks(pass)).toEqual([]);

      const over = fakeCloudflare();
      expect(await check([...args, "--max-rows-written-per-object", "50"], env, over.fetchImpl)).toBe(2);
      expect(hooks(over)).toHaveLength(1);
      expect(hooks(over)[0]!.body).toMatchObject({ state: "violation", failures: ["artroom-spike-room_Room/room_aaaa rows written 100 > 50"] });

      const missing = fakeCloudflare({ namespaces: [] });
      expect(await check(args, env, missing.fetchImpl)).toBe(3);
      expect(hooks(missing)[0]!.body).toMatchObject({ state: "incomplete" });

      const noToken = fakeCloudflare();
      expect(await check(args, { ARTROOM_ROW_ALERT_WEBHOOK_URL: HOOK }, noToken.fetchImpl)).toBe(1);
      expect(hooks(noToken)[0]!.body).toMatchObject({ state: "incomplete", failures: ["ARTROOM_CF_ANALYTICS_TOKEN is not set"] });
      expect(noToken.calls.filter((c) => c.url !== HOOK)).toEqual([]);
    } finally {
      console.log = quietLog;
    }
  });
});
