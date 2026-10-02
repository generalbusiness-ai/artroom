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
 * PROVISIONAL ceilings: woo's load-gate values, not yet grounded for
 * Artroom. Part 1 of request 8bd623cc replaces them with ceilings from a
 * clean measured run (measure/README.md, "What remains").
 */
export const PROVISIONAL_BUDGET = Object.freeze({ maxRowsWritten: 250_000, maxRowsWrittenPerObject: 50_000 });
/** Wait this long after the last act before closing a billing window: samples are stamped when emitted, after the writes. */
export const SETTLE_MS = 120_000;
/** GraphQL's per-query row limit; a result this long may be truncated. */
export const ROW_LIMIT = 10_000;

const API = "https://api.cloudflare.com/client/v4";

const nonNegative = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

async function json(response, label) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(`${label} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

/** The Durable Object namespaces `worker` owns now, sorted by class. */
export async function workerNamespaces({ accountId, token, worker, fetchImpl = fetch }) {
  const out = [];
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error("Durable Object namespace list did not end within 100 pages (truncated)");
    const url = `${API}/accounts/${accountId}/workers/durable_objects/namespaces?page=${page}&per_page=100`;
    const body = await json(await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }), "Durable Object namespace list");
    if (body.success !== true || !Array.isArray(body.result)) throw new Error(`Durable Object namespace list was unsuccessful: ${JSON.stringify(body.errors ?? [])}`);
    for (const row of body.result) {
      if (row?.script !== worker) continue;
      const id = typeof row.id === "string" ? row.id : "";
      const className = typeof row.class === "string" ? row.class : "";
      if (id && className) out.push({ id, name: typeof row.name === "string" ? row.name : `${worker}/${className}`, className, script: worker });
    }
    if (page >= Number(body.result_info?.total_pages ?? page) || body.result.length < 100) break;
  }
  return out.sort((a, b) => a.className.localeCompare(b.className));
}

export const STORAGE_QUERY = `
query DurableObjectRows($accountTag: String!, $start: Time!, $end: Time!, $namespaceId: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsPeriodicGroups(limit: ${ROW_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end, namespaceId: $namespaceId }) {
        dimensions { objectId name namespaceId }
        sum { rowsWritten rowsRead }
      }
      durableObjectsInvocationsAdaptiveGroups(limit: ${ROW_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end, namespaceId: $namespaceId }) {
        dimensions { objectId namespaceId }
        sum { requests }
      }
    }
  }
}`;

/** One namespace's objects in the window, by rows written (most first). */
async function namespaceRows({ accountId, token, namespace, from, to, fetchImpl }) {
  const label = `Durable Object rows query for ${namespace.name}`;
  const body = await json(
    await fetchImpl(`${API}/graphql`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: STORAGE_QUERY, variables: { accountTag: accountId, start: from, end: to, namespaceId: namespace.id } }),
    }),
    label,
  );
  if (body.errors?.length) throw new Error(`${label}: GraphQL errors ${JSON.stringify(body.errors).slice(0, 500)}`);
  const account = body.data?.viewer?.accounts?.[0];
  if (!account) throw new Error(`${label} returned no account`);
  const periodic = account.durableObjectsPeriodicGroups;
  const invocations = account.durableObjectsInvocationsAdaptiveGroups;
  if (!Array.isArray(periodic) || !Array.isArray(invocations)) throw new Error(`${label} omitted a required dataset`);
  if (periodic.length >= ROW_LIMIT || invocations.length >= ROW_LIMIT) throw new Error(`${label} reached its ${ROW_LIMIT}-row limit (truncated)`);
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
    if (!id) continue;
    const o = at(id);
    o.name = row.dimensions.name ?? o.name;
    o.rowsWritten += nonNegative(row.sum?.rowsWritten);
    o.rowsRead += nonNegative(row.sum?.rowsRead);
    // Grouped by object with no time dimension, so this is a 0-or-more evidence marker, not a sample count.
    o.periodicSamples += 1;
  }
  for (const row of invocations) {
    const id = row?.dimensions?.objectId;
    if (id) at(id).requests += nonNegative(row.sum?.requests);
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
  const objects = (await Promise.all(namespaces.map((namespace) => namespaceRows({ accountId, token, namespace, from, to, fetchImpl })))).flat();
  const total = (k) => objects.reduce((s, o) => s + o[k], 0);
  return { worker, from, to, namespaces, objects, totalRowsWritten: total("rowsWritten"), totalRowsRead: total("rowsRead"), totalRequests: total("requests") };
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
    totalRowsWritten: report.totalRowsWritten,
    totalRowsRead: report.totalRowsRead,
    totalRequests: report.totalRequests,
    namespaces: report.namespaces.map(({ id, name, className }) => ({ id, name, className })),
    objects: report.objects.slice(0, 50).map((o) => ({ className: o.className, object: o.name || o.objectId, objectId: o.objectId, rowsWritten: o.rowsWritten, rowsRead: o.rowsRead, requests: o.requests, periodicSamples: o.periodicSamples })),
  };
}

/** Query and judge one window. Never throws: a query failure is an incomplete gate, with its reason. */
export async function rowGate({ accountId, token, worker, from, to, budget = PROVISIONAL_BUDGET, fetchImpl = fetch }) {
  try {
    const report = await queryWorkerRows({ accountId, token, worker, from, to, fetchImpl });
    const decision = evaluateRows(report, budget);
    return { ...reportForOutput(report), budget, provisional: budget === PROVISIONAL_BUDGET, ...decision };
  } catch (e) {
    return { worker, from, to, budget, state: "incomplete", failures: [String(e?.message ?? e).slice(0, 1_000)] };
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
 * The table of the measured windows: for each, the rows of this room's own
 * Room object, of the registry, of Publisher objects, and of any other
 * object (another run's traffic in the same window: a sign the window is
 * not clean). `reports` holds one rowGate result per window, by index.
 */
export function rowTable(windows, reports, room) {
  return windows.map((w, i) => {
    const r = reports[i] ?? {};
    const objects = Array.isArray(r.objects) ? r.objects : [];
    const sum = (pred, k) => objects.filter(pred).reduce((s, o) => s + o[k], 0);
    const own = (o) => o.className === "Room" && o.object === room;
    const registry = (o) => o.className === "Registry";
    const publisher = (o) => o.className === "Publisher";
    const other = (o) => !own(o) && !registry(o) && !publisher(o);
    return {
      window: w.name,
      kind: w.kind,
      from: w.from,
      to: w.to,
      state: r.state ?? "missing",
      roomWritten: sum(own, "rowsWritten"),
      roomRead: sum(own, "rowsRead"),
      registryWritten: sum(registry, "rowsWritten"),
      registryRead: sum(registry, "rowsRead"),
      publisherWritten: sum(publisher, "rowsWritten"),
      publisherRead: sum(publisher, "rowsRead"),
      otherWritten: sum(other, "rowsWritten"),
      ...(w.note ? { note: w.note } : {}),
      ...(r.failures?.length ? { failures: r.failures } : {}),
    };
  });
}

/** The table as Markdown, for notes/deploy-spike.md. */
export function rowTableMarkdown(rows) {
  const head = "| Window | Kind | Room written | Room read | Registry written | Registry read | Publisher written | Publisher read | Other written | State |\n|---|---|---|---|---|---|---|---|---|---|";
  const line = (r) => `| ${r.window} | ${r.kind} | ${r.roomWritten} | ${r.roomRead} | ${r.registryWritten} | ${r.registryRead} | ${r.publisherWritten} | ${r.publisherRead} | ${r.otherWritten} | ${r.state} |`;
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

/** The scheduled check's options from its arguments: the hour ending ten minutes ago, the provisional budget. */
export function checkOptions(args, now = Date.now()) {
  const to = flag(args, "--to") ?? new Date(now - 10 * 60_000).toISOString();
  const from = flag(args, "--from") ?? new Date(Date.parse(to) - 60 * 60_000).toISOString();
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) throw new Error("--from and --to must be ISO times, from before to");
  const maxRowsWritten = count(flag(args, "--max-rows-written"), "--max-rows-written", PROVISIONAL_BUDGET.maxRowsWritten);
  const maxRowsWrittenPerObject = count(flag(args, "--max-rows-written-per-object"), "--max-rows-written-per-object", PROVISIONAL_BUDGET.maxRowsWrittenPerObject);
  const same = maxRowsWritten === PROVISIONAL_BUDGET.maxRowsWritten && maxRowsWrittenPerObject === PROVISIONAL_BUDGET.maxRowsWrittenPerObject;
  return { worker: flag(args, "--worker") ?? SPIKE_WORKER, from, to, budget: same ? PROVISIONAL_BUDGET : { maxRowsWritten, maxRowsWrittenPerObject } };
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
      console.error(String(e?.message ?? e));
      process.exit(1);
    },
  );
}
