/** Unsealed, untrusted correlation. These identifiers confer no authority. */
export interface Correlation { request: string; trace: string | null; traceparent: string | null }
export const isRequestId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
export const isTraceId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v) && v !== "0".repeat(32);
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  // A zero parent ID is forbidden by Trace Context.
  if (bytes.every(n => n === 0)) bytes[0] = 1;
  return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
}
/** Only the reviewed version00 framing and sampled bit are propagated. */
export function correlation(traceparent: string | null): Correlation {
  const request = randomId();
  const match = traceparent?.length === 55 ? traceparent.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/) : null;
  if (!match || !isTraceId(match[1]) || match[2] === "0".repeat(16)) return { request, trace: null, traceparent: null };
  const sampled = parseInt(match[3]!, 16) & 1;
  return { request, trace: match[1], traceparent: `00-${match[1]}-${randomId()}-0${sampled}` };
}
/** No native body bytes change, and a vendor tracestate is never echoed. */
export function correlated(response: Response, context: Correlation): Response {
  const headers = new Headers(response.headers);
  headers.set("dap-request-id", context.request);
  headers.delete("tracestate");
  if (context.traceparent) headers.set("traceparent", context.traceparent); else headers.delete("traceparent");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
