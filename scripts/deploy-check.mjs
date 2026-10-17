/** Read-only SQL/health client. Operational invocation and calibration are separate. */
import { evaluateDeployment } from "./deploy-check-evaluate.mjs";

const ROWS = 50_000, QUERY_BYTES = 16 * 1024 * 1024, HEALTH_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uint = value => {
  const n = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || Object.is(n, -0) || n < 0) throw new Error("number");
  return n;
};
function validHealthUrl(value) {
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
  if (!/^[0-9a-f]{32}$/.test(account ?? "") || typeof token !== "string" || !token || token.length > 4096 || /[\r\n]/.test(token)
      || typeof deployment !== "string" || !deployment || new TextEncoder().encode(deployment).length > 128
      || !UUID.test(version ?? "") || !Number.isSafeInteger(p95BoundMs) || p95BoundMs < 0 || !validHealthUrl(healthUrl)) {
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
