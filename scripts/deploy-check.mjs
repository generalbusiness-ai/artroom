/** Read-only SQL/health client. Operational invocation and calibration are separate. */
import { evaluateDeployment } from "./deploy-check-evaluate.mjs";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROWS = 50_000, QUERY_BYTES = 16 * 1024 * 1024, HEALTH_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uint = value => {
  const n = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || Object.is(n, -0) || n < 0) throw new Error("number");
  return n;
};
function validHealthUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.pathname === "/health";
  } catch { return false; }
}

// One fixed window and one query; no offset walk can quietly omit later rows.
function sql(version, now) {
  return `SELECT toUnixTimestamp(timestamp) AS epochSeconds, _sample_interval,
blob1, blob2, blob3, blob4, blob5, blob6, blob9,
double1, double2, double3, double4, double5, double6
FROM artroom_metrics_v1
WHERE blob3 = '${version}'
AND timestamp >= toDateTime(${now / 1000 - 900})
AND timestamp <= toDateTime(${now / 1000})
AND blob9 != 'mcp-metrics-v1'
LIMIT ${ROWS + 1} FORMAT JSON`;
}

async function jsonReply(fetcher, url, init, byteLimit) {
  const controller = new AbortController();
  let timer;
  const work = async () => {
    const response = await fetcher(url, { ...init, redirect: "error", credentials: "omit", signal: controller.signal });
    if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error("deadline"); }
    if (response.status !== 200 || !response.body) { void response.body?.cancel().catch(() => {}); throw new Error("status"); }
    const reader = response.body.getReader(), chunks = [];
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    let bytes = 0, pieces = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (controller.signal.aborted) throw new Error("deadline");
        if (part.done) break;
        if (++pieces > 65_536) throw new Error("fragmentation");
        bytes += part.value.byteLength;
        if (bytes > byteLimit) throw new Error("size");
        chunks.push(part.value);
      }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
    } finally { controller.signal.removeEventListener("abort", cancel); cancel(); reader.releaseLock(); }
  };
  try {
    return await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, 10_000);
    })]);
  } finally { clearTimeout(timer); controller.abort(); }
}

function points(answer) {
  if (!answer || !Array.isArray(answer.data) || answer.data.length > ROWS || uint(answer.rows) !== answer.data.length
      || (Object.hasOwn(answer, "rows_before_limit_at_least") && uint(answer.rows_before_limit_at_least) > answer.data.length)) throw new Error("rows");
  return answer.data.map(row => {
    if (!row || typeof row !== "object") throw new Error("row");
    const timeMs = uint(row.epochSeconds) * 1000;
    if (!Number.isSafeInteger(timeMs)) throw new Error("time");
    const blobs = [row.blob1, row.blob2, row.blob3, row.blob4, row.blob5, row.blob6, "none", "none", row.blob9];
    if (!blobs.every(s => typeof s === "string" && new TextEncoder().encode(s).length <= 128)) throw new Error("blob");
    return { timeMs, _sample_interval: uint(row._sample_interval), blobs,
      doubles: Array.from({ length: 6 }, (_, i) => uint(row[`double${i + 1}`])) };
  });
}

/**
 * The caller must supply an actual deployment identity and observed bound.
 * This interface does not certify either provenance. No token, raw response,
 * scope index, request ID or trace ID is returned or logged.
 */
export async function checkDeployment(options, { fetch: fetcher = globalThis.fetch, now: clock = Date.now } = {}) {
  const { account, token, deployment, version, p95BoundMs, healthUrl } = options;
  if (typeof account !== "string" || !/^[0-9a-f]{32}$/.test(account) || typeof token !== "string" || !token || token.length > 4096 || /[\r\n]/.test(token)
      || typeof deployment !== "string" || !deployment || new TextEncoder().encode(deployment).length > 128
      || typeof version !== "string" || !UUID.test(version) || !Number.isSafeInteger(p95BoundMs) || p95BoundMs < 0 || !validHealthUrl(healthUrl)) {
    return { pass: false, failures: ["input"], message: "Invalid deployment check inputs or missing calibration." };
  }
  const now = Math.floor(clock() / 1000) * 1000;
  if (!Number.isSafeInteger(now) || now < 900_000) return { pass: false, failures: ["input"], message: "Invalid observation time." };
  const [query, health] = await Promise.allSettled([
    jsonReply(fetcher, `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain;charset=UTF-8" }, body: sql(version, now),
    }, QUERY_BYTES).then(points),
    jsonReply(fetcher, healthUrl, { method: "GET" }, HEALTH_BYTES),
  ]);
  return evaluateDeployment({ deployment, version, now, p95BoundMs,
    rows: query.status === "fulfilled" ? query.value : null,
    health: health.status === "fulfilled" ? { status: 200, body: health.value } : null });
}

export function deploymentVersion(text) {
  const rows = text.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
  if (rows.length > 128 || rows.some(row => !row || typeof row !== "object" || row.type === "command-failed")) throw new Error("deploy");
  const sessions = rows.filter(row => row.type === "wrangler-session"), deployed = rows.filter(row => row.type === "deploy");
  if (sessions.length !== 1 || deployed.length !== 1 || sessions[0].version !== 1 || sessions[0].wrangler_version !== "4.147.0"
      || !Array.isArray(sessions[0].command_line_args) || sessions[0].command_line_args[0] !== "deploy" || deployed[0].version !== 1
      || typeof deployed[0].worker_name !== "string" || !deployed[0].worker_name || typeof deployed[0].version_id !== "string" || !UUID.test(deployed[0].version_id)) throw new Error("deploy");
  return deployed[0].version_id;
}

function calibrationOf(value, deployment, now) {
  const keys = ["format", "deployment", "version", "from", "through", "routeCount", "p95Ms", "boundMs", "recordingSha256"];
  if (!value || typeof value !== "object" || Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))
      || value.format !== "dap-metric-calibration-1" || value.deployment !== deployment || typeof value.version !== "string" || !UUID.test(value.version)
      || typeof value.recordingSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.recordingSha256)) throw new Error("calibration");
  const from = Date.parse(value.from), through = Date.parse(value.through);
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(through) || through <= from || through > now || through - from > 900_000
      || new Date(from).toISOString() !== value.from || new Date(through).toISOString() !== value.through
      || uint(value.routeCount) !== value.routeCount || value.routeCount < 100 || uint(value.p95Ms) !== value.p95Ms
      || uint(value.boundMs) !== value.boundMs || value.boundMs < value.p95Ms) throw new Error("calibration");
  return value;
}

async function inputFile(path) {
  const limit = 256 * 1024, fd = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await fd.stat();
    if (!info.isFile() || info.size > limit) throw new Error("input");
    const bytes = Buffer.alloc(limit + 1);
    let at = 0;
    while (at < bytes.length) {
      const read = await fd.read(bytes, at, bytes.length - at, at);
      if (!read.bytesRead) break;
      at += read.bytesRead;
    }
    if (at > limit) throw new Error("input");
    const data = bytes.subarray(0, at);
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(data), sha256: createHash("sha256").update(data).digest("hex") };
  } finally { await fd.close(); }
}

/** CLI inputs assert observation provenance; review of the actual recording remains separate. */
export async function deploymentCheckMain(argv, { env = process.env, fetch: fetcher = globalThis.fetch, now = Date.now, write = line => process.stdout.write(line) } = {}) {
  if (argv.length === 1 && argv[0] === "--help") {
    write("Usage: node scripts/deploy-check.mjs --deploy-output <fresh Wrangler NDJSON> --calibration <observed JSON> --deployment <name> --health <https://host/health>\nEnvironment: CLOUDFLARE_ACCOUNT_ID and DAP_ANALYTICS_READ_TOKEN (Account Analytics Read).\n");
    return 0;
  }
  let args, deploymentOutput, calibrationInput, version, calibration;
  try {
    const allowed = new Set(["--deploy-output", "--calibration", "--deployment", "--health"]);
    args = {};
    for (let i = 0; i < argv.length; i += 2) {
      const key = argv[i], value = argv[i + 1];
      if (!allowed.has(key) || Object.hasOwn(args, key) || typeof value !== "string" || !value) throw new Error("input");
      args[key] = value;
    }
    if (Object.keys(args).length !== allowed.size || !validHealthUrl(args["--health"])) throw new Error("input");
    [deploymentOutput, calibrationInput] = await Promise.all([inputFile(args["--deploy-output"]), inputFile(args["--calibration"])]);
    version = deploymentVersion(deploymentOutput.text);
    calibration = calibrationOf(JSON.parse(calibrationInput.text), args["--deployment"], now());
  } catch {
    write(`${JSON.stringify({ pass: false, failures: ["input"], message: "A single completed deployment and a valid observed calibration are required." })}\n`);
    return 2;
  }
  const result = await checkDeployment({ account: env.CLOUDFLARE_ACCOUNT_ID, token: env.DAP_ANALYTICS_READ_TOKEN,
    deployment: args["--deployment"], version, p95BoundMs: calibration.boundMs, healthUrl: args["--health"] }, { fetch: fetcher, now });
  write(`${JSON.stringify({ ...result, calibration, inputs: { deploymentOutputSha256: deploymentOutput.sha256, calibrationSha256: calibrationInput.sha256 } })}\n`);
  return result.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await deploymentCheckMain(process.argv.slice(2)); }
  catch { console.error("Deployment check failed without a complete observation."); process.exitCode = 1; }
}
