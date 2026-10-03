import { describe, expect, it } from "vitest";
import {
  HOURLY_BUDGET,
  SMOKE_BUDGET,
  ROW_LIMIT,
  check,
  checkOptions,
  evaluateRows,
  gateOk,
  gateOptions,
  queryWorkerRows,
  rowGate,
  querySamples,
  morePages,
  safeMessage,
  sampleQueryStart,
  windowEndAfterSettle,
  windowTable,
  windowTableMarkdown,
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
    // Two GraphQL queries per namespace, one per dataset, each with its own window.
    const gql = fake.calls.filter((c) => c.url.endsWith("/graphql"));
    const periodic = gql.filter((c) => /durableObjectsPeriodicGroups/.test(c.body?.query ?? ""));
    const invocations = gql.filter((c) => /durableObjectsInvocationsAdaptiveGroups/.test(c.body?.query ?? ""));
    expect(periodic.map((c) => c.body?.variables?.["namespaceId"]).sort()).toEqual(["ns-publisher", "ns-registry", "ns-room"]);
    expect(invocations.map((c) => c.body?.variables?.["namespaceId"]).sort()).toEqual(["ns-publisher", "ns-registry", "ns-room"]);
    expect(gql).toHaveLength(6);
    for (const c of periodic) {
      // Storage samples are start-stamped: the query starts SAMPLE_LOOKBACK_MS (two minutes) early.
      expect(c.body?.variables).toMatchObject({ accountTag: "acct", start: "2026-10-02T11:58:00.000Z", end: WINDOW.to });
      expect(c.body?.query).toMatch(/sum \{ rowsWritten rowsRead \}/);
      expect(c.body?.query).not.toMatch(/durableObjectsInvocationsAdaptiveGroups/);
      expect(c.body?.query).toMatch(/datetime_geq: \$start, datetime_lt: \$end/);
    }
    for (const c of invocations) {
      // Invocations are stamped with their own time: the exact window.
      expect(c.body?.variables).toMatchObject({ accountTag: "acct", start: WINDOW.from, end: WINDOW.to });
      expect(c.body?.query).toMatch(/sum \{ requests \}/);
      expect(c.body?.query).not.toMatch(/durableObjectsPeriodicGroups/);
    }
  });

});

describe("rows per act: per-minute samples", () => {
  // The shape of the samples query: periodic groups by datetime and object, invocations by minute and object.
  const SAMPLES: Record<string, unknown> = {
    "ns-room": {
      durableObjectsPeriodicGroups: [
        // The act at 12:00:10 is in the sample whose interval starts at 11:59:39.
        { dimensions: { datetime: "2026-10-02T11:59:39Z", objectId: "o-room", name: "room_aaaa" }, sum: { rowsWritten: 16, rowsRead: 250 } },
        { dimensions: { datetime: "2026-10-02T12:00:39Z", objectId: "o-room", name: "room_aaaa" }, sum: { rowsWritten: 7, rowsRead: 240 } },
        // An empty interval after an eviction is not a quiet minute.
        { dimensions: { datetime: "2026-10-02T12:01:30Z", objectId: "o-room", name: "room_aaaa" }, sum: { rowsWritten: 0, rowsRead: 0 } },
        // The next act's window.
        { dimensions: { datetime: "2026-10-02T12:02:39Z", objectId: "o-room", name: "room_aaaa" }, sum: { rowsWritten: 40, rowsRead: 900 } },
        { dimensions: { datetime: "2026-10-02T12:03:39Z", objectId: "o-room", name: "room_aaaa" }, sum: { rowsWritten: 8, rowsRead: 260 } },
        // Another room's background in the same minutes.
        { dimensions: { datetime: "2026-10-02T12:00:05Z", objectId: "o-other", name: "room_bbbb" }, sum: { rowsWritten: 7, rowsRead: 100 } },
      ],
      durableObjectsInvocationsAdaptiveGroups: [
        { dimensions: { datetimeMinute: "2026-10-02T12:00:00Z", objectId: "o-room" }, sum: { requests: 14 } },
        { dimensions: { datetimeMinute: "2026-10-02T12:01:00Z", objectId: "o-room" }, sum: { requests: 12 } },
        { dimensions: { datetimeMinute: "2026-10-02T12:01:00Z", objectId: "o-other" }, sum: { requests: 12 } },
      ],
    },
    "ns-registry": {
      durableObjectsPeriodicGroups: [{ dimensions: { datetime: "2026-10-02T11:59:50Z", objectId: "o-reg", name: "registry" }, sum: { rowsWritten: 4, rowsRead: 9 } }],
      durableObjectsInvocationsAdaptiveGroups: [],
    },
    "ns-publisher": { durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [] },
  };
  const samplesFake = () => fakeCloudflare({ graphql: (ns) => json({ data: { viewer: { accounts: [SAMPLES[ns] ?? {}] } }, errors: null }) });
  const W = [
    { name: "claim", kind: "act" as const, from: "2026-10-02T12:00:00.000Z", to: "2026-10-02T12:02:30.000Z" },
    { name: "propose", kind: "act" as const, from: "2026-10-02T12:02:30.000Z", to: "2026-10-02T12:05:00.000Z" },
    { name: "note", kind: "act" as const, from: "2026-10-02T12:05:00.000Z", to: "2026-10-02T12:07:30.000Z" },
  ];

  it("asks for samples by interval start and invocations by minute, failing closed like the gate", async () => {
    const fake = samplesFake();
    const r = await querySamples({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
    expect(r.samples).toHaveLength(7);
    expect(r.invocations).toHaveLength(3);
    expect(r.sampledFrom).toBe("2026-10-02T11:58:00.000Z");
    // The report records which namespaces it queried.
    expect(r.namespaces.map((n) => n.id)).toEqual(["ns-publisher", "ns-registry", "ns-room"]);
    const gql = fake.calls.filter((x) => x.url.endsWith("/graphql"));
    const periodic = gql.filter((c) => /durableObjectsPeriodicGroups/.test(c.body?.query ?? ""));
    const minutes = gql.filter((c) => /durableObjectsInvocationsAdaptiveGroups/.test(c.body?.query ?? ""));
    expect([periodic.length, minutes.length, gql.length]).toEqual([3, 3, 6]);
    for (const c of periodic) {
      expect(c.body?.variables).toMatchObject({ start: "2026-10-02T11:58:00.000Z", end: WINDOW.to });
      expect(c.body?.query).toMatch(/dimensions \{ datetime objectId name \}/);
    }
    for (const c of minutes) {
      expect(c.body?.variables).toMatchObject({ start: WINDOW.from, end: WINDOW.to });
      expect(c.body?.query).toMatch(/dimensions \{ datetimeMinute objectId \}/);
    }
    await expect(querySamples({ accountId: "acct", token: null, worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl })).rejects.toThrow("ARTROOM_CF_ANALYTICS_TOKEN is not set");
    const bad = fakeCloudflare({ graphql: () => json({ data: { viewer: { accounts: [{ durableObjectsPeriodicGroups: [] }] } }, errors: null }) });
    await expect(querySamples({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: bad.fetchImpl })).rejects.toThrow("omitted a required dataset");
    const none = fakeCloudflare({ namespaces: NAMESPACES.filter((n) => n.class !== "Room") });
    await expect(querySamples({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: none.fetchImpl })).rejects.toThrow("missing Durable Object namespaces: Room");
  });

  it("attributes each sample to the window holding its interval's end, and subtracts the quiet baseline", async () => {
    const r = await querySamples({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: samplesFake().fetchImpl });
    const [claim, propose, note] = windowTable(W, r, "room_aaaa");
    // claim: samples ending 12:00:39 (16) and 12:01:39 (7); the empty 12:01:30 sample ends 12:02:30, in claim too.
    expect(claim).toMatchObject({ samples: 3, roomWritten: 23, baselineWritten: 7, actWritten: 9, roomRead: 490, baselineRead: 240, actRead: 10, roomInvocationsPerMinute: 12, registryWritten: 4, otherWritten: 7 });
    expect(claim!.caution).toBeUndefined();
    // propose: 40 and 8, so the act is 40 - 8.
    expect(propose).toMatchObject({ samples: 2, roomWritten: 48, baselineWritten: 8, actWritten: 32, actRead: 640 });
    // A window with no sample of the room has no baseline and says so; never zero rows.
    expect(note).toMatchObject({ samples: 0, actWritten: null, baselineWritten: null, roomInvocationsPerMinute: null });
    expect(note!.caution).toContain("no quiet baseline");
    const md = windowTableMarkdown([claim!, note!]);
    expect(md).toContain("| claim | act | 3 | 9 | 10 | 23 | 7 | 240 | 12 | 4 | 9 | 0 | 0 | 7 |");
    expect(md).toContain("| note (caution) | act | 0 | n/a | n/a | 0 | n/a | n/a | n/a |");
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
    await expect(query(fakeCloudflare({ list: () => json({ success: false, errors: [{ code: 10000, message: "Authentication error" }], result: null }) }))).rejects.toThrow("namespace list was unsuccessful: 1 error (codes 10000)");
    await expect(query(fakeCloudflare({ list: () => json({ success: false, errors: [{ code: 9109, message: "Unauthorized" }] }, 403) }))).rejects.toThrow("HTTP 403");
    await expect(query(fakeCloudflare({ list: () => new Response("<html>bad gateway</html>", { status: 502 }) }))).rejects.toThrow("non-JSON HTTP 502");
  });

  it("a namespace list that never ends is truncation", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, name: "x", class: "X", script: "other" }));
    const fake = fakeCloudflare({ list: (p) => json({ success: true, result: page, result_info: { page: p, total_pages: 1_000 } }) });
    await expect(query(fake)).rejects.toThrow("truncated");
  });

  it("GraphQL errors, a missing account or dataset, and a result at the row limit", async () => {
    // A fresh response for every query: each namespace is now asked twice, once per dataset.
    const answer = (ns: string, r: () => Response) => fakeCloudflare({ graphql: (n) => (n === ns ? r() : undefined) });
    await expect(query(answer("ns-room", () => json({ data: null, errors: [{ message: "unknown field rowsRead", path: ["viewer"] }] })))).rejects.toThrow("GraphQL 1 error");
    await expect(query(answer("ns-room", () => json({ data: { viewer: { accounts: [] } }, errors: null })))).rejects.toThrow("returned no account");
    await expect(query(answer("ns-registry", () => json({ data: { viewer: { accounts: [{ durableObjectsPeriodicGroups: [] }] } }, errors: null })))).rejects.toThrow("omitted a required dataset");
    await expect(query(answer("ns-room", () => json({ errors: [{ message: "rate limited" }] }, 429)))).rejects.toThrow("HTTP 429");
    const full = Array.from({ length: ROW_LIMIT }, (_, i) => ({ dimensions: { objectId: `o${i}`, namespaceId: "ns-room" }, sum: { rowsWritten: 1, rowsRead: 0 } }));
    await expect(query(answer("ns-room", () => json({ data: { viewer: { accounts: [{ durableObjectsPeriodicGroups: full, durableObjectsInvocationsAdaptiveGroups: [] }] } }, errors: null })))).rejects.toThrow("truncated");
    // rowGate turns each into an incomplete gate with its reason, never a pass.
    const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: answer("ns-room", () => json({ data: { viewer: { accounts: [] } }, errors: null })).fetchImpl });
    expect(g.state).toBe("incomplete");
    expect(g.failures[0]).toContain("returned no account");
  });

  it("no invocation evidence, or invocations with no periodic sample, is incomplete, not zero rows", async () => {
    const empty = { durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [] };
    const quiet = await query(fakeCloudflare({ rows: { "ns-room": empty, "ns-registry": empty, "ns-publisher": empty } }));
    expect(evaluateRows(quiet, SMOKE_BUDGET)).toEqual({ state: "incomplete", failures: ["no Durable Object invocations were visible in the window"] });
    const lagging = await query(fakeCloudflare({ rows: { ...ROWS, "ns-registry": { ...ROWS["ns-registry"], durableObjectsPeriodicGroups: [] } } }));
    expect(evaluateRows(lagging, SMOKE_BUDGET)).toEqual({ state: "incomplete", failures: ["artroom-spike-room_Registry/o-reg had invocations but no periodic storage sample"] });
  });
});

describe("rows per act: quiet control windows", () => {
  it("with quiet controls, the baseline is the room's mean per sample in them, and the act is the rest of its window", () => {
    const S = (t: string, w: number, r: number) => ({ className: "Room", objectId: "o", name: "room_q", t, rowsWritten: w, rowsRead: r });
    const samples = [S("2026-10-02T12:00:00Z", 0, 0), S("2026-10-02T12:01:00Z", 0, 0), S("2026-10-02T12:02:00Z", 34, 553), S("2026-10-02T12:03:00Z", 7, 233), S("2026-10-02T12:04:00Z", 0, 10)];
    const W = [
      { name: "quiet", kind: "quiet" as const, from: "2026-10-02T12:00:30Z", to: "2026-10-02T12:02:30Z" },
      { name: "propose", kind: "act" as const, from: "2026-10-02T12:02:30Z", to: "2026-10-02T12:04:30Z" },
      { name: "after", kind: "quiet" as const, from: "2026-10-02T12:04:30Z", to: "2026-10-02T12:05:30Z" },
    ];
    const [, propose] = windowTable(W, { samples, invocations: [] }, "room_q");
    // Controls: (0 + 0 + 0) written over three samples, (0 + 0 + 10) read: the propose's own publication minute is not subtracted.
    expect(propose).toMatchObject({ baseline: "quiet controls", baselineWritten: 0, actWritten: 41, roomWritten: 41, actRead: 786 - 2 * (10 / 3) });
    expect(propose!.caution).toBeUndefined();
  });
});

describe("row gate: review of caefe17d (checker controls)", () => {
  const gate = (fake: Fake) => rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
  const roomRows = (sum: Record<string, unknown>, dims: Record<string, unknown> = { objectId: "o-room", name: "room_aaaa", namespaceId: "ns-room" }) => ({
    rows: { ...ROWS, "ns-room": { ...ROWS["ns-room"], durableObjectsPeriodicGroups: [{ dimensions: dims, sum }] } as unknown as Account },
  });

  it("1. a missing, null, negative or non-numeric billed value is incomplete, never zero", async () => {
    for (const sum of [{ rowsRead: 0 }, { rowsWritten: null, rowsRead: 0 }, { rowsWritten: -1, rowsRead: 0 }, { rowsWritten: "unavailable", rowsRead: 0 }, { rowsWritten: "12", rowsRead: 0 }, { rowsWritten: 5 }, { rowsWritten: 5, rowsRead: Number.NaN }]) {
      const g = await gate(fakeCloudflare(roomRows(sum)));
      expect(g.state, JSON.stringify(sum)).toBe("incomplete");
      expect(g.failures[0]).toMatch(/rows(Written|Read) value is missing or not a non-negative number/);
    }
    // A row that names no object cannot be attributed.
    expect((await gate(fakeCloudflare(roomRows({ rowsWritten: 5, rowsRead: 0 }, { name: "room_aaaa" })))).failures[0]).toContain("no objectId");
    // Requests too.
    const badRequests = { rows: { ...ROWS, "ns-registry": { ...ROWS["ns-registry"], durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { objectId: "o-reg", namespaceId: "ns-registry" }, sum: {} }] } as unknown as Account } };
    expect((await gate(fakeCloudflare(badRequests))).failures[0]).toContain("a requests value is missing");
    const noObject = { rows: { ...ROWS, "ns-registry": { ...ROWS["ns-registry"], durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { namespaceId: "ns-registry" }, sum: { requests: 3 } }] } as unknown as Account } };
    expect((await gate(fakeCloudflare(noObject))).failures[0]).toContain("an invocations row has no objectId");
  });

  it("1. the samples query fails closed the same way", async () => {
    const answer = (account: unknown) => fakeCloudflare({ graphql: (ns) => json({ data: { viewer: { accounts: [ns === "ns-room" ? account : { durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [] }] } }, errors: null }) });
    const q = (f: Fake) => querySamples({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: f.fetchImpl });
    await expect(q(answer({ durableObjectsPeriodicGroups: [{ dimensions: { datetime: "2026-10-02T12:00:00Z", objectId: "o" }, sum: { rowsRead: 1 } }], durableObjectsInvocationsAdaptiveGroups: [] }))).rejects.toThrow("rowsWritten value is missing");
    await expect(q(answer({ durableObjectsPeriodicGroups: [{ dimensions: { objectId: "o" }, sum: { rowsWritten: 1, rowsRead: 1 } }], durableObjectsInvocationsAdaptiveGroups: [] }))).rejects.toThrow("no objectId or datetime");
    await expect(q(answer({ durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { datetimeMinute: "2026-10-02T12:00:00Z", objectId: "o" }, sum: { requests: "x" } }] }))).rejects.toThrow("requests value is missing");
  });

  it("2. without pagination metadata, pages are read while they come back full", async () => {
    const others = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: "x", class: "X", script: "other" }));
    const later = { id: "ns-later", name: "later", class: "Room", script: "artroom-spike-room" };
    const pages: number[] = [];
    const fake = fakeCloudflare({ list: (p) => (pages.push(p), json({ success: true, result: p === 1 ? [...NAMESPACES.slice(0, 3), ...others(97)] : [later] })) });
    const ns = await workerNamespaces({ accountId: "acct", token: "tok", worker: "artroom-spike-room", fetchImpl: fake.fetchImpl });
    expect(ns.map((n) => n.id)).toContain("ns-later");
    expect(pages).toEqual([1, 2]);
    // An empty page ends it; metadata, when present, is used; a full page past 100 pages is truncation.
    expect(morePages(2, [], undefined)).toBe(false);
    expect(morePages(1, others(100), undefined)).toBe(true);
    expect(morePages(1, others(100), { total_pages: 1 })).toBe(false);
    expect(morePages(1, others(100), { total_pages: 3 })).toBe(true);
    expect(morePages(1, others(100), { total_pages: "3" })).toBe(true);
    expect(morePages(1, others(99), { total_pages: 3 })).toBe(false);
    const endless = fakeCloudflare({ list: () => json({ success: true, result: others(100) }) });
    await expect(workerNamespaces({ accountId: "acct", token: "tok", worker: "artroom-spike-room", fetchImpl: endless.fetchImpl })).rejects.toThrow("truncated");
  });

  it("3. a provider error that echoes the token reaches neither the report nor the webhook: metadata only", async () => {
    const TOKEN = "cf-analytics-secret-0123456789";
    const echo = { success: false, errors: [{ code: 10000, message: `Authentication error for Authorization: Bearer ${TOKEN}` }], result: null };
    const HOOK = "https://alerts.example.invalid/hook";
    const cases: [string, Fake][] = [
      ["unsuccessful list", fakeCloudflare({ list: () => json(echo) })],
      ["HTTP 403 list", fakeCloudflare({ list: () => json(echo, 403) })],
      ["HTTP 400 GraphQL", fakeCloudflare({ graphql: () => json({ errors: [{ message: `bad token ${TOKEN}`, extensions: { code: "authz" } }] }, 400) })],
      ["GraphQL errors", fakeCloudflare({ graphql: () => json({ data: null, errors: [{ message: `token ${TOKEN} has no access`, extensions: { code: "authz" } }] }) })],
    ];
    const quietLog = console.log;
    console.log = () => {};
    try {
      for (const [label, fake] of cases) {
        const g = await rowGate({ accountId: "acct", token: TOKEN, worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
        expect(g.state, label).toBe("incomplete");
        expect(JSON.stringify(g), label).not.toContain(TOKEN);
        expect(JSON.stringify(g), label).not.toContain("Authentication error");
        expect(g.failures[0], label).toMatch(/\(codes (10000|authz)\)/);
        const code = await check(["--from", WINDOW.from, "--to", WINDOW.to], { ARTROOM_CF_ANALYTICS_TOKEN: TOKEN, ARTROOM_ROW_ALERT_WEBHOOK_URL: HOOK }, fake.fetchImpl);
        expect(code, label).toBe(3);
        const posted = fake.calls.filter((c) => c.url === HOOK);
        expect(posted, label).toHaveLength(1);
        expect(JSON.stringify(posted[0]!.body), label).not.toContain(TOKEN);
      }
    } finally {
      console.log = quietLog;
    }
    // A transport exception that echoes the token is scrubbed before it reaches the report.
    const thrown = (async () => {
      throw new Error(`connect failed with header Authorization: Bearer ${TOKEN}`);
    }) as unknown as typeof fetch;
    const t = await rowGate({ accountId: "acct", token: TOKEN, worker: "artroom-spike-room", ...WINDOW, fetchImpl: thrown });
    expect(t.state).toBe("incomplete");
    expect(JSON.stringify(t)).not.toContain(TOKEN);
    // A transport exception's text is scrubbed of the token and of bearer and Artifacts token patterns.
    expect(safeMessage(new Error(`fetch failed: Bearer ${TOKEN} art_v2_abc_def?expires=1`), TOKEN)).toBe("fetch failed: Bearer <redacted> <token>");
    expect(safeMessage(new Error(`x ${TOKEN} y`), TOKEN)).toBe("x <redacted> y");
  });

  it("4. a sample stamped before `from` whose minute overlaps the window is counted; one stamped at `to` is not", async () => {
    expect(sampleQueryStart("2026-10-02T12:00:00Z")).toBe("2026-10-02T11:58:00.000Z");
    // Start-stamped samples of the room object; the fake applies the query's datetime filter, as the API does.
    const stamped = [
      { t: "2026-10-02T11:59:01Z", rowsWritten: 5_000 }, // holds a write at 12:00:00.5, inside the window
      { t: "2026-10-02T11:58:59Z", rowsWritten: 300 }, // a 63-second interval (the checker's stress case): counted too
      { t: "2026-10-02T12:30:00Z", rowsWritten: 1 },
      { t: "2026-10-02T13:00:00Z", rowsWritten: 9_999 }, // starts at `to`: after the window
    ];
    const fake = fakeCloudflare({
      graphql: (ns) => {
        if (ns !== "ns-room") return json({ data: { viewer: { accounts: [{ durableObjectsPeriodicGroups: [], durableObjectsInvocationsAdaptiveGroups: [] }] } }, errors: null });
        const v = fake.calls.at(-1)!.body!.variables!;
        const inQuery = stamped.filter((x) => Date.parse(x.t) >= Date.parse(String(v["start"])) && Date.parse(x.t) < Date.parse(String(v["end"])));
        return json({ data: { viewer: { accounts: [{
          durableObjectsPeriodicGroups: inQuery.map((x) => ({ dimensions: { objectId: "o-room", name: "room_aaaa", namespaceId: "ns-room" }, sum: { rowsWritten: x.rowsWritten, rowsRead: 0 } })),
          durableObjectsInvocationsAdaptiveGroups: [{ dimensions: { objectId: "o-room", namespaceId: "ns-room" }, sum: { requests: 2 } }],
        }] } }, errors: null });
      },
    });
    const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
    expect(g).toMatchObject({ state: "violation", totalRowsWritten: 5_301, sampledFrom: "2026-10-02T11:58:00.000Z" });
    expect(g.failures).toContain("artroom-spike-room_Room/room_aaaa rows written 5301 > 2000");
  });
});

describe("row gate: review of 487edd74 (checker extra controls)", () => {
  it("a credential crossing the message bound is redacted before the cut, and a partial one at the cut is dropped", () => {
    const token = "synthetic-credential-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    // The token straddles character 1,000: redaction first means no prefix of it survives.
    const m = safeMessage(new Error("x".repeat(985) + token + " tail"), token);
    expect(m).not.toContain(token.slice(0, 4));
    expect(m).toContain("<redacted>");
    // Text that is not the token but starts like it at the cut (an echo split across two errors) is dropped too.
    const cut = safeMessage(new Error("y".repeat(995) + token.slice(0, 10)), token, 1_000);
    expect(cut).not.toContain(token.slice(0, 4));
    expect(cut.endsWith("…")).toBe(true);
    // A partial Bearer or Artifacts token at the cut is dropped.
    expect(safeMessage(new Error("z".repeat(995) + " Bearer"), null, 1_000)).not.toMatch(/Bearer/);
    expect(safeMessage(new Error("z".repeat(990) + " art_v2_abcdefgh"), null, 1_000)).not.toMatch(/art_v/);
    // Short messages are unchanged apart from redaction.
    expect(safeMessage(new Error("plain"), token)).toBe("plain");
  });

  it("an invocation before `from` cannot make an empty requested window complete", async () => {
    // The fake applies each query's own window: one invocation at 11:59:30, and a storage sample stamped 11:59:30.
    const fake = fakeCloudflare({
      graphql: (ns) => {
        const v = fake.calls.at(-1)!.body!.variables!;
        const q = String(fake.calls.at(-1)!.body!.query);
        const inWindow = Date.parse("2026-10-02T11:59:30Z") >= Date.parse(String(v["start"]));
        const account = /durableObjectsPeriodicGroups/.test(q)
          ? { durableObjectsPeriodicGroups: ns === "ns-room" && inWindow ? [{ dimensions: { objectId: "o-room", name: "room_aaaa", namespaceId: ns }, sum: { rowsWritten: 1, rowsRead: 0 } }] : [] }
          : { durableObjectsInvocationsAdaptiveGroups: ns === "ns-room" && inWindow ? [{ dimensions: { objectId: "o-room", namespaceId: ns }, sum: { requests: 1 } }] : [] };
        return json({ data: { viewer: { accounts: [account] } }, errors: null });
      },
    });
    const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
    expect(g).toMatchObject({ state: "incomplete", totalRequests: 0, totalRowsWritten: 1 });
    expect(g.failures).toEqual(["no Durable Object invocations were visible in the window"]);
  });

  it("an owned namespace without an id or class makes the gate incomplete, even with the required classes present", async () => {
    for (const bad of [{ class: "Room", script: "artroom-spike-room", name: "unattributable" }, { id: "ns-x", script: "artroom-spike-room" }, { id: "", class: "Room", script: "artroom-spike-room" }]) {
      const fake = fakeCloudflare({ namespaces: [...NAMESPACES, bad] });
      const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl });
      expect(g.state, JSON.stringify(bad)).toBe("incomplete");
      expect(g.failures[0]).toBe("Durable Object namespace list: a namespace of artroom-spike-room has no id or class");
      await expect(querySamples({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fake.fetchImpl })).rejects.toThrow("has no id or class");
    }
    // Another Worker's malformed entry is not ours and is ignored.
    const other = fakeCloudflare({ namespaces: [...NAMESPACES, { class: "X", script: "someone-else" }] });
    expect((await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: other.fetchImpl })).state).toBe("pass");
  });
});

describe("row gate: budgets", () => {
  const report: WorkerRows = {
    worker: "artroom-spike-room",
    ...WINDOW,
    sampledFrom: "2026-10-02T11:59:00.000Z",
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

  it("the ceilings are the measured runs times their headroom, rounded up to two significant figures", async () => {
    const up2 = (n: number) => {
      const p = 10 ** (Math.floor(Math.log10(n)) - 1);
      return Math.ceil(n / p) * p;
    };
    // spike-smoke-2026-10-03T00-54-30-069Z, after the idle-write fix: 1,270 in total, 489 in one object; headroom 4.
    expect(SMOKE_BUDGET).toEqual({ maxRowsWritten: up2(1_270 * 4), maxRowsWrittenPerObject: up2(489 * 4) });
    // The busiest hour after the fix, 23:50-00:50: 2,514 in total, 1,780 in one object; headroom 2.
    expect(HOURLY_BUDGET).toEqual({ maxRowsWritten: up2(2_514 * 2), maxRowsWrittenPerObject: up2(1_780 * 2) });
    const g = await rowGate({ accountId: "acct", token: "tok", worker: "artroom-spike-room", ...WINDOW, fetchImpl: fakeCloudflare().fetchImpl });
    expect(g).toMatchObject({ state: "pass", budget: SMOKE_BUDGET, totalRowsWritten: 113 });
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

  it("defaults to the hour ending ten minutes ago, the spike Room Worker and the hourly budget", () => {
    const o = checkOptions([], Date.parse("2026-10-02T13:10:00.000Z"));
    expect(o).toEqual({ worker: "artroom-spike-room", from: "2026-10-02T12:00:00.000Z", to: "2026-10-02T13:00:00.000Z", budget: HOURLY_BUDGET });
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
