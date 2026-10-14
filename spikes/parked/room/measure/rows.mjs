#!/usr/bin/env node
// Durable Object rows written and read, from Cloudflare's billing datasets
// (request 8bd623cc, part 2). Ported from woo's scripts/cloudflare-do-storage.ts
// and net-storage-gate.ts (woo commits 6d2c425a and 50163fc1).
//
// The billing API is the only authority for physical rows: a SQLite write
// costs its base-table row plus one row for each secondary index it touches,
// and no application counter sees that. So the gate asks Cloudflare.
//
// How it attributes rows. For a Worker and a window [from, to):
//   1. List the account's Durable Object namespaces and keep the ones this
//      Worker owns, by script name, on every run (a redeploy can make new
//      namespace IDs; a checked-in ID would watch a retired copy).
//   2. For each namespace, one GraphQL query: durableObjectsPeriodicGroups
//      (sum rowsWritten, rowsRead) and durableObjectsInvocationsAdaptiveGroups
//      (sum requests), both grouped by objectId.
//   3. Sum by object. Each object keeps its namespace, class and name (the
//      name given to idFromName: a room ID, "registry").
//
// It fails closed: no token, a namespace a Worker must have and does not,
// an API or GraphQL error, a missing dataset, a result at the row limit
// (truncation), no invocations in the window, or an object with invocations
// but no periodic sample is never read as "zero rows". Only then are the
// budgets applied: a total for the Worker and a ceiling for each object.
//
// The scheduled check (see measure/README.md and
// .github/workflows/row-writes.yml):
//
//   ARTROOM_CF_ANALYTICS_TOKEN=... node packages/room/measure/rows.mjs \
//     [--worker artroom-spike-room] [--from ISO] [--to ISO] \
//     [--max-rows-written N] [--max-rows-written-per-object N]
//
// The window defaults to the hour ending ten minutes ago (billing data lags).
// Exit 0 pass, 1 error (no evidence), 2 over budget, 3 incomplete. On any
// failure it posts the report to ARTROOM_ROW_ALERT_WEBHOOK_URL, if set.
// No import here needs npm ci: it runs on plain Node.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The spike's account (wrangler.spike.jsonc's ARTIFACTS_HOST); CF_ACCOUNT_ID overrides it. */
export const SPIKE_ACCOUNT = "6e953d231f1c9aadffbf59537a82e13a";
export const SPIKE_WORKER = "artroom-spike-room";
/** The Durable Object classes each Worker must own (wrangler.spike.jsonc files). A missing one fails the gate. */
export const REQUIRED_CLASSES = {
  "artroom-spike-room": ["Room", "Registry", "Publisher"],
  "artroom-spike-checkers": ["RunnerBox"],
};

/**
 * Ceilings grounded on the spike after the idle-write fix (request 3da1d82b),
 * 2026-10-03 (measure/README.md, "Ceilings"). Each is the measured value
 * times a headroom factor, rounded up to two significant figures.
 *
 * SMOKE_BUDGET is for one full smoke run, from its start to two minutes
 * after its cleanup. The clean run spike-smoke-2026-10-03T00-54-30-069Z
 * wrote 1,270 rows in total: 1,258 by its own three rooms and 12 by the
 * registry (idle rooms now write nothing), and at most 489 in one object.
 * The totals assume storage samples cover at most 120 s (the lookback, an
 * assumption about the provider). Headroom 4: 5,080 -> 5,100
 * and 1,956 -> 2,000. (Before the fix: 2,284 and 508, of which 983 were the
 * idle rooms' background; the ceilings were 9,200 and 2,100.)
 *
 * HOURLY_BUDGET is for the scheduled check's hour. The busiest hour measured
 * after the fix, 2026-10-02T23:50 to 00:50 (the activation measurement: six
 * landings and three open lanes in one room), wrote 2,514 rows in total and
 * 1,780 in one object. Headroom 2: 5,028 -> 5,100 and 3,560 -> 3,600.
 * (Before: 23,000 and 2,100, grounded on an hour with the idle storm.)
 */
export const HEADROOM = Object.freeze({ smoke: 4, hourly: 2 });
export const SMOKE_BUDGET = Object.freeze({ maxRowsWritten: 5_100, maxRowsWrittenPerObject: 2_000 });
export const HOURLY_BUDGET = Object.freeze({ maxRowsWritten: 5_100, maxRowsWrittenPerObject: 3_600 });
/** Wait this long after the last act before closing a billing window: samples are stamped when emitted, after the writes. */
export const SETTLE_MS = 120_000;
/** GraphQL's per-query row limit; a result this long may be truncated. */
export const ROW_LIMIT = 10_000;

const API = "https://api.cloudflare.com/client/v4";

/**
 * A billed quantity (rows written or read, requests) as the provider gave it.
 * Missing, null, negative or not a number is missing evidence, never zero:
 * it throws, and the gate is incomplete.
 */
function billed(v, field, label) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`${label}: a ${field} value is missing or not a non-negative number`);
  return v;
}

/** A provider error, as safe metadata only: its numeric codes or short code classes. Never its text, which can echo the request. */
function errorCodes(errors) {
  const list = Array.isArray(errors) ? errors : [];
  const safe = (c) => (typeof c === "number" && Number.isSafeInteger(c)) || (typeof c === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(c));
  const codes = list.map((e) => e?.code ?? e?.extensions?.code).filter(safe);
  return `${list.length} error${list.length === 1 ? "" : "s"}${codes.length ? ` (codes ${[...new Set(codes)].join(", ")})` : ""}`;
}

async function json(response, label) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(`${label} failed HTTP ${response.status}: ${errorCodes(body?.errors)}`);
  return body;
}

/**
 * A failure's message for a report that is printed and posted: never the
 * token. Messages made here hold only metadata; this also covers an
 * exception from the transport.
 */
export function safeMessage(e, token, limit = 1_000) {
  // Redact the whole text first, then bound it: a bound taken first could cut a credential and keep its prefix.
  let m = String(e?.message ?? e);
  if (token) m = m.split(token).join("<redacted>");
  m = m.replace(/Bearer\s+\S+/gi, "Bearer <redacted>").replace(/art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g, "<token>");
  if (m.length <= limit) return m;
  m = m.slice(0, limit);
  // Fail closed at the cut: drop a tail that could be the start of the token (a prefix of 4 or more characters). Bearer
  // and Artifacts tokens were already replaced whole, so a cut can leave only their harmless labels.
  if (token) for (let k = Math.min(token.length - 1, m.length); k >= 4; k--) if (m.endsWith(token.slice(0, k))) return `${m.slice(0, -k)}…`;
  return `${m}…`;
}

/**
 * How far before `from` the storage-sample query starts. Cloudflare stamps a
 * periodic sample with the START of its interval. Every interval measured
 * was 60 s or shorter, but that is an assumption about the provider, not a
 * guarantee (measure/README.md, "The sample-interval assumption"). Looking
 * back two nominal intervals counts any sample whose interval is up to
 * 120 s long and overlaps the window; the cost is over-counting at most one
 * extra sample per object at the start of a window.
 */
export const SAMPLE_LOOKBACK_MS = 120_000;

/** The first storage-sample start a window must query. One helper for the gate and the per-act driver. */
export function sampleQueryStart(from) {
  return new Date(Date.parse(from) - SAMPLE_LOOKBACK_MS).toISOString();
}

/** Whether the namespace list has another page: by its metadata when it has any, else while pages come back full. */
export function morePages(page, result, info, perPage = 100) {
  if (result.length < perPage) return false;
  const total = info?.total_pages;
  return typeof total === "number" && Number.isFinite(total) ? page < total : true;
}

/** The Durable Object namespaces `worker` owns now, sorted by class. */
export async function workerNamespaces({ accountId, token, worker, fetchImpl = fetch }) {
  const out = [];
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error("Durable Object namespace list did not end within 100 pages (truncated)");
    const url = `${API}/accounts/${accountId}/workers/durable_objects/namespaces?page=${page}&per_page=100`;
    const body = await json(await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }), "Durable Object namespace list");
    if (body.success !== true || !Array.isArray(body.result)) throw new Error(`Durable Object namespace list was unsuccessful: ${errorCodes(body.errors)}`);
    for (const row of body.result) {
      if (row?.script !== worker) continue;
      const id = typeof row.id === "string" ? row.id : "";
      const className = typeof row.class === "string" ? row.class : "";
      // A namespace this Worker owns that cannot be queried is missing evidence, not a namespace to skip.
      if (!id || !className) throw new Error(`Durable Object namespace list: a namespace of ${worker} has no id or class`);
      out.push({ id, name: typeof row.name === "string" ? row.name : `${worker}/${className}`, className, script: worker });
    }
    if (!morePages(page, body.result, body.result_info)) break;
  }
  return out.sort((a, b) => a.className.localeCompare(b.className));
}

/**
 * One query per dataset, each with its own window. Storage (periodic)
 * samples are stamped with the start of their interval, so their query
 * starts at `sampleQueryStart(from)`. Invocations are stamped with each
 * request's own time (measured 2026-10-02: `datetime` values at single
 * seconds, 17:36:50, :51, :52 ...), so their query is the exact window.
 */
export const PERIODIC_QUERY = `
query DurableObjectRows($accountTag: String!, $start: Time!, $end: Time!, $namespaceId: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsPeriodicGroups(limit: ${ROW_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end, namespaceId: $namespaceId }) {
        dimensions { objectId name namespaceId }
        sum { rowsWritten rowsRead }
      }
    }
  }
}`;

export const INVOCATIONS_QUERY = `
query DurableObjectInvocations($accountTag: String!, $start: Time!, $end: Time!, $namespaceId: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsInvocationsAdaptiveGroups(limit: ${ROW_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end, namespaceId: $namespaceId }) {
        dimensions { objectId namespaceId }
        sum { requests }
      }
    }
  }
}`;

/** One dataset's rows for one namespace and window, failing closed: errors, no account, no dataset, truncation. */
async function datasetRows({ accountId, token, query, dataset, namespace, start, end, label, fetchImpl }) {
  const body = await json(
    await fetchImpl(`${API}/graphql`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { accountTag: accountId, start, end, namespaceId: namespace.id } }),
    }),
    label,
  );
  if (body.errors?.length) throw new Error(`${label}: GraphQL ${errorCodes(body.errors)}`);
  const account = body.data?.viewer?.accounts?.[0];
  if (!account) throw new Error(`${label} returned no account`);
  const rows = account[dataset];
  if (!Array.isArray(rows)) throw new Error(`${label} omitted a required dataset`);
  if (rows.length >= ROW_LIMIT) throw new Error(`${label} reached its ${ROW_LIMIT}-row limit (truncated)`);
  return rows;
}

/** One namespace's objects in the window, by rows written (most first). */
async function namespaceRows({ accountId, token, namespace, from, sampledFrom, to, fetchImpl }) {
  const label = `Durable Object rows query for ${namespace.name}`;
  const common = { accountId, token, namespace, end: to, label, fetchImpl };
  const periodic = await datasetRows({ ...common, query: PERIODIC_QUERY, dataset: "durableObjectsPeriodicGroups", start: sampledFrom });
  const invocations = await datasetRows({ ...common, query: INVOCATIONS_QUERY, dataset: "durableObjectsInvocationsAdaptiveGroups", start: from });
  const objects = new Map();
  const at = (objectId) => {
    let o = objects.get(objectId);
    if (!o) {
      o = { namespaceId: namespace.id, namespace: namespace.name, className: namespace.className, objectId, name: "", rowsWritten: 0, rowsRead: 0, requests: 0, periodicSamples: 0 };
      objects.set(objectId, o);
    }
    return o;
  };
  for (const row of periodic) {
    const id = row?.dimensions?.objectId;
    // A row with no object cannot be attributed: missing evidence, not nothing.
    if (typeof id !== "string" || !id) throw new Error(`${label}: a periodic row has no objectId`);
    const o = at(id);
    o.name = row.dimensions.name ?? o.name;
    o.rowsWritten += billed(row.sum?.rowsWritten, "rowsWritten", label);
    o.rowsRead += billed(row.sum?.rowsRead, "rowsRead", label);
    // Grouped by object with no time dimension, so this is a 0-or-more evidence marker, not a sample count.
    o.periodicSamples += 1;
  }
  for (const row of invocations) {
    const id = row?.dimensions?.objectId;
    if (typeof id !== "string" || !id) throw new Error(`${label}: an invocations row has no objectId`);
    at(id).requests += billed(row.sum?.requests, "requests", label);
  }
  return [...objects.values()].sort((a, b) => b.rowsWritten - a.rowsWritten || a.objectId.localeCompare(b.objectId));
}

/** Rows written and read by every object of `worker`'s namespaces in [from, to). Throws when the evidence is missing. */
export async function queryWorkerRows({ accountId, token, worker, from, to, required = REQUIRED_CLASSES[worker] ?? [], fetchImpl = fetch }) {
  if (!token) throw new Error("ARTROOM_CF_ANALYTICS_TOKEN is not set");
  if (!accountId) throw new Error("no Cloudflare account ID");
  const namespaces = await workerNamespaces({ accountId, token, worker, fetchImpl });
  if (namespaces.length === 0) throw new Error(`worker ${worker} owns no Durable Object namespace`);
  const missing = required.filter((c) => !namespaces.some((n) => n.className === c));
  if (missing.length) throw new Error(`worker ${worker} is missing required Durable Object namespaces: ${missing.join(", ")}`);
  // Storage samples are stamped with their interval's start, so their query starts earlier (sampleQueryStart);
  // invocations are stamped with their own time, so their query is the exact window [from, to).
  const sampledFrom = sampleQueryStart(from);
  const objects = (await Promise.all(namespaces.map((namespace) => namespaceRows({ accountId, token, namespace, from, sampledFrom, to, fetchImpl })))).flat();
  const total = (k) => objects.reduce((s, o) => s + o[k], 0);
  return { worker, from, to, sampledFrom, namespaces, objects, totalRowsWritten: total("rowsWritten"), totalRowsRead: total("rowsRead"), totalRequests: total("requests") };
}

const objectLabel = (o) => `${o.namespace}/${o.name || o.objectId}`;

/** pass, violation (over a budget) or incomplete (the evidence cannot show the rows). */
export function evaluateRows(report, budget) {
  if (report.totalRequests <= 0) return { state: "incomplete", failures: ["no Durable Object invocations were visible in the window"] };
  const unsampled = report.objects.filter((o) => o.requests > 0 && o.periodicSamples <= 0);
  if (unsampled.length) return { state: "incomplete", failures: unsampled.map((o) => `${objectLabel(o)} had invocations but no periodic storage sample`) };
  const failures = [];
  if (report.totalRowsWritten > budget.maxRowsWritten) failures.push(`worker ${report.worker} rows written ${report.totalRowsWritten} > ${budget.maxRowsWritten}`);
  for (const o of report.objects) if (o.rowsWritten > budget.maxRowsWrittenPerObject) failures.push(`${objectLabel(o)} rows written ${o.rowsWritten} > ${budget.maxRowsWrittenPerObject}`);
  return { state: failures.length ? "violation" : "pass", failures };
}

/** The report as saved and posted: bounded, no token. */
export function reportForOutput(report) {
  return {
    worker: report.worker,
    from: report.from,
    to: report.to,
    sampledFrom: report.sampledFrom,
    totalRowsWritten: report.totalRowsWritten,
    totalRowsRead: report.totalRowsRead,
    totalRequests: report.totalRequests,
    namespaces: report.namespaces.map(({ id, name, className }) => ({ id, name, className })),
    objects: report.objects.slice(0, 50).map((o) => ({ className: o.className, object: o.name || o.objectId, objectId: o.objectId, rowsWritten: o.rowsWritten, rowsRead: o.rowsRead, requests: o.requests, periodicSamples: o.periodicSamples })),
  };
}

/** Query and judge one window. Never throws: a query failure is an incomplete gate, with its reason. */
export async function rowGate({ accountId, token, worker, from, to, budget = SMOKE_BUDGET, fetchImpl = fetch }) {
  try {
    const report = await queryWorkerRows({ accountId, token, worker, from, to, fetchImpl });
    const decision = evaluateRows(report, budget);
    return { ...reportForOutput(report), budget, ...decision };
  } catch (e) {
    return { worker, from, to, budget, state: "incomplete", failures: [safeMessage(e, token)] };
  }
}

/** Whether a gate result lets a smoke run pass: a pass, or a skip (no token, and the gate was not demanded). */
export const gateOk = (gate) => gate?.state === "pass" || gate?.state === "skipped";

/**
 * Whether a smoke run gates its rows. The token present turns the gate on;
 * ARTROOM_ROW_GATE=1 demands it, so a missing token then fails the run
 * before it starts instead of skipping the gate.
 */
export function gateOptions(env = process.env) {
  const token = env.ARTROOM_CF_ANALYTICS_TOKEN || null;
  const demanded = env.ARTROOM_ROW_GATE === "1";
  if (demanded && !token) throw new Error("ARTROOM_ROW_GATE=1 but ARTROOM_CF_ANALYTICS_TOKEN is not set: the row gate cannot run");
  if (!token) return { run: false, reason: "ARTROOM_CF_ANALYTICS_TOKEN is not set" };
  return { run: true, token, accountId: env.CF_ACCOUNT_ID || SPIKE_ACCOUNT };
}

/**
 * The window's exclusive end, read only after the settle wait: periodic
 * samples are stamped when emitted, which can be after the last write, so a
 * bound read earlier could leave out the run's last rows (woo 50163fc1).
 */
export async function windowEndAfterSettle(ms, wait = (t) => new Promise((r) => setTimeout(r, t)), now = () => new Date()) {
  if (ms > 0) await wait(ms);
  return now().toISOString();
}

// ------------------------------------------------------------ the per-act table (part 1)

/**
 * Cloudflare emits one periodic sample per active object per minute,
 * stamped with the START of its interval (measured 2026-10-02: an act at
 * 16:39:15 is in the sample stamped 16:38:39, not 16:39:39). An eviction
 * restarts the cadence, so a short interval can occur. Acts are therefore
 * attributed by sample, not by the sum over a window: see `windowTable`.
 */
export const SAMPLES_QUERY = `
query DurableObjectSamples($accountTag: String!, $start: Time!, $end: Time!, $namespaceId: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsPeriodicGroups(limit: ${ROW_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end, namespaceId: $namespaceId }, orderBy: [datetime_ASC]) {
        dimensions { datetime objectId name }
        sum { rowsWritten rowsRead }
      }
    }
  }
}`;

export const MINUTE_INVOCATIONS_QUERY = `
query DurableObjectMinuteInvocations($accountTag: String!, $start: Time!, $end: Time!, $namespaceId: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsInvocationsAdaptiveGroups(limit: ${ROW_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end, namespaceId: $namespaceId }, orderBy: [datetimeMinute_ASC]) {
        dimensions { datetimeMinute objectId }
        sum { requests }
      }
    }
  }
}`;

/**
 * Every periodic sample of `worker`'s objects whose interval overlaps
 * [from, to) (stamped from `sampleQueryStart(from)`), and invocations by
 * minute in exactly [from, to), with the same fail-closed rules as
 * `queryWorkerRows`.
 */
export async function querySamples({ accountId, token, worker, from, to, required = REQUIRED_CLASSES[worker] ?? [], fetchImpl = fetch }) {
  if (!token) throw new Error("ARTROOM_CF_ANALYTICS_TOKEN is not set");
  const namespaces = await workerNamespaces({ accountId, token, worker, fetchImpl });
  const missing = required.filter((c) => !namespaces.some((n) => n.className === c));
  if (namespaces.length === 0 || missing.length) throw new Error(`worker ${worker} is missing Durable Object namespaces: ${missing.join(", ") || "all"}`);
  const samples = [];
  const invocations = [];
  const start = sampleQueryStart(from);
  for (const ns of namespaces) {
    const label = `Durable Object samples query for ${ns.name}`;
    const common = { accountId, token, namespace: ns, end: to, label, fetchImpl };
    const periodic = await datasetRows({ ...common, query: SAMPLES_QUERY, dataset: "durableObjectsPeriodicGroups", start });
    const inv = await datasetRows({ ...common, query: MINUTE_INVOCATIONS_QUERY, dataset: "durableObjectsInvocationsAdaptiveGroups", start: from });
    for (const g of periodic) {
      const d = g?.dimensions ?? {};
      if (typeof d.objectId !== "string" || !d.objectId || !Number.isFinite(Date.parse(d.datetime))) throw new Error(`${label}: a periodic row has no objectId or datetime`);
      samples.push({ className: ns.className, objectId: d.objectId, name: d.name ?? "", t: d.datetime, rowsWritten: billed(g.sum?.rowsWritten, "rowsWritten", label), rowsRead: billed(g.sum?.rowsRead, "rowsRead", label) });
    }
    for (const g of inv) {
      const d = g?.dimensions ?? {};
      if (typeof d.objectId !== "string" || !d.objectId || !Number.isFinite(Date.parse(d.datetimeMinute))) throw new Error(`${label}: an invocations row has no objectId or minute`);
      invocations.push({ className: ns.className, objectId: d.objectId, minute: d.datetimeMinute, requests: billed(g.sum?.requests, "requests", label) });
    }
  }
  return { worker, from, to, sampledFrom: start, namespaces: namespaces.map(({ id, name, className }) => ({ id, name, className })), samples, invocations };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/**
 * The table of measured windows, from samples. A sample belongs to the
 * window that holds its interval's end (start + 60 s), so an act at the
 * start of a window, and its deferred work within the window, is in that
 * window's samples. The driver leaves a quiet tail after each act so every
 * window holds at least one quiet sample.
 *
 * For the measured room's own object: `samples` is the number of samples;
 * `baseline` the smallest non-empty sample in the window (a minute with
 * nothing but the room's background: its once-a-minute checkpoint
 * publication); `act` is the window's total minus (non-empty samples x
 * baseline). Reads use the same rule.
 * The registry, publishers and other objects are shown as window totals.
 * `invocations` is the room object's requests per minute, the median over
 * the window's minutes (the alarm rate when idle).
 */
export function windowTable(windows, { samples, invocations }, room) {
  const own = samples.filter((s) => s.className === "Room" && s.name === room);
  const roomIds = new Set(own.map((s) => s.objectId));
  const endIn = (w) => (s) => {
    const end = Date.parse(s.t) + 60_000;
    return end > Date.parse(w.from) && end <= Date.parse(w.to);
  };
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  // Quiet control windows (kind "quiet"), when the run has them, give the baseline: the room's mean per sample in
  // them. Without controls (the first runs, with a background of 7 rows a minute), the smallest non-empty sample in
  // the window stands in for a quiet minute.
  const controls = own.filter((s) => windows.some((w) => w.kind === "quiet" && endIn(w)(s)));
  const mean = (k) => (controls.length ? sum(controls, k) / controls.length : null);
  const controlled = controls.length > 0 ? { w: mean("rowsWritten"), r: mean("rowsRead") } : null;
  return windows.map((w) => {
    const inW = endIn(w);
    const mine = own.filter(inW);
    const all = samples.filter(inW);
    // An empty interval (an eviction restarted the cadence) is not a quiet minute.
    const quiet = controlled ? mine : mine.filter((s) => s.rowsWritten > 0 || s.rowsRead > 0);
    const bw = controlled ? controlled.w : quiet.length ? Math.min(...quiet.map((s) => s.rowsWritten)) : null;
    const br = controlled ? controlled.r : quiet.length ? Math.min(...quiet.map((s) => s.rowsRead)) : null;
    const perMinute = invocations.filter((i) => roomIds.has(i.objectId) && Date.parse(i.minute) >= Date.parse(w.from) && Date.parse(i.minute) < Date.parse(w.to)).map((i) => i.requests);
    const other = all.filter((s) => !(s.className === "Room" && s.name === room) && s.className !== "Registry" && s.className !== "Publisher");
    return {
      window: w.name,
      kind: w.kind,
      from: w.from,
      to: w.to,
      samples: mine.length,
      roomWritten: sum(mine, "rowsWritten"),
      roomRead: sum(mine, "rowsRead"),
      baselineWritten: bw,
      baselineRead: br,
      actWritten: bw === null ? null : sum(mine, "rowsWritten") - quiet.length * bw,
      actRead: br === null ? null : sum(mine, "rowsRead") - quiet.length * br,
      roomInvocationsPerMinute: median(perMinute),
      registryWritten: sum(all.filter((s) => s.className === "Registry"), "rowsWritten"),
      registryRead: sum(all.filter((s) => s.className === "Registry"), "rowsRead"),
      publisherWritten: sum(all.filter((s) => s.className === "Publisher"), "rowsWritten"),
      publisherRead: sum(all.filter((s) => s.className === "Publisher"), "rowsRead"),
      otherWritten: sum(other, "rowsWritten"),
      ...(w.note ? { note: w.note } : {}),
      baseline: controlled ? "quiet controls" : "smallest sample in the window",
      ...(!controlled && quiet.length < 2 ? { caution: "fewer than two non-empty samples of the room: no quiet baseline in the window" } : {}),
    };
  });
}

/** The table as Markdown. */
export function windowTableMarkdown(rows) {
  const v = (x) => (x === null || x === undefined ? "n/a" : String(x));
  const head =
    "| Window | Kind | Samples | Room written (act) | Room read (act) | Room written (window) | Baseline written/min | Baseline read/min | Room invocations/min | Registry written | Registry read | Publisher written | Publisher read | Other written |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const line = (r) =>
    `| ${r.window}${r.caution ? " (caution)" : ""} | ${r.kind} | ${r.samples} | ${v(r.actWritten)} | ${v(r.actRead)} | ${r.roomWritten} | ${v(r.baselineWritten)} | ${v(r.baselineRead)} | ${v(r.roomInvocationsPerMinute)} | ${r.registryWritten} | ${r.registryRead} | ${r.publisherWritten} | ${r.publisherRead} | ${r.otherWritten} |`;
  return [head, ...rows.map(line)].join("\n") + "\n";
}

// ------------------------------------------------------------ the scheduled check

function flag(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

function count(raw, name, fallback) {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

/** The scheduled check's options from its arguments: the hour ending ten minutes ago, the hourly budget. */
export function checkOptions(args, now = Date.now()) {
  const to = flag(args, "--to") ?? new Date(now - 10 * 60_000).toISOString();
  const from = flag(args, "--from") ?? new Date(Date.parse(to) - 60 * 60_000).toISOString();
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) throw new Error("--from and --to must be ISO times, from before to");
  const maxRowsWritten = count(flag(args, "--max-rows-written"), "--max-rows-written", HOURLY_BUDGET.maxRowsWritten);
  const maxRowsWrittenPerObject = count(flag(args, "--max-rows-written-per-object"), "--max-rows-written-per-object", HOURLY_BUDGET.maxRowsWrittenPerObject);
  return { worker: flag(args, "--worker") ?? SPIKE_WORKER, from, to, budget: { maxRowsWritten, maxRowsWrittenPerObject } };
}

/** Post the report to the alert webhook. */
export async function sendAlert(webhook, payload, fetchImpl = fetch) {
  const r = await fetchImpl(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`row alert webhook failed HTTP ${r.status}`);
}

/** The scheduled check: query, judge, print, alert on failure. Returns the exit code. */
export async function check(args, env = process.env, fetchImpl = fetch) {
  const o = checkOptions(args);
  const token = env.ARTROOM_CF_ANALYTICS_TOKEN || null;
  const result = await rowGate({ accountId: env.CF_ACCOUNT_ID || SPIKE_ACCOUNT, token, worker: o.worker, from: o.from, to: o.to, budget: o.budget, fetchImpl });
  console.log(JSON.stringify(result, null, 2));
  if (result.state === "pass") return 0;
  if (env.ARTROOM_ROW_ALERT_WEBHOOK_URL) await sendAlert(env.ARTROOM_ROW_ALERT_WEBHOOK_URL, result, fetchImpl);
  if (!token) return 1;
  return result.state === "violation" ? 2 : 3;
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  check(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(safeMessage(e, process.env.ARTROOM_CF_ANALYTICS_TOKEN));
      process.exit(1);
    },
  );
}
