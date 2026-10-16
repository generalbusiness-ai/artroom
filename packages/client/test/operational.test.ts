import { expect, test } from "vitest";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { httpTransport, TransportError, type Fetch } from "../src/index.ts";
const scope = `sc_${"a".repeat(52)}` as const;
const head = { seq: 7, hash: `sha256:${"a".repeat(64)}` };
const request = "abcdef0123456789", time = "2099-01-01T00:00:00Z";
const correlations = { ok: true, at: head, complete: false, next: "4070908800000.1", value: { rows: [{ n: 1, request, trace: null, time, seq: 7, duty: null }], window: { oldest: time, newest: time } } };

// Invariant: operational reads use the existing finite HTTP transport,
// validate their complete typed envelope and never put a session in the URL.
test("operational reads preserve heads, partial pages and refusals; malformed or mismatched replies remain unknown", async () => {
  let answer: unknown = correlations;
  const sent: { url: string; method: string | undefined; reader: string | undefined }[] = [];
  const fetch: Fetch = async (url, init) => { sent.push({ url, method: init?.method, reader: init?.headers?.["authorization"] }); return { status: 200, body: new Response(canonicalize(answer)).body }; };
  const http = httpTransport("https://scope.test", { fetch });
  expect(await http.requests(scope, "Session fixture", request, "4070908800000.2")).toEqual(correlations);
  expect(sent).toEqual([{ url: `https://scope.test/v1/scopes/${scope}/requests?request=${request}&cursor=4070908800000.2`, method: "GET", reader: "Session fixture" }]);
  answer = { ok: false, reason: "forbidden" };
  expect(await http.waiting(scope, "Session fixture", "diagnosed")).toEqual(answer);
  answer = { ok: true, at: head, complete: true, value: [{ n: 1, time, scope: null, kind: "outcome-conflict", refs: [{ operation: "1:0", attempt: 1 }] }] };
  expect(await http.incidents(scope, "Session fixture")).toEqual(answer);
  for (const wrong of [
    { ...correlations, at: { seq: -1, hash: head.hash } },
    { ...correlations, complete: "yes" },
    { ...correlations, value: { ...correlations.value, window: null } },
    { ...correlations, value: { ...correlations.value, rows: [{ ...correlations.value.rows[0], request: "1111111111111111" }] } },
    { ...correlations, value: { ...correlations.value, rows: [{ ...correlations.value.rows[0], duty: "not-a-duty" }] } },
    { ok: false, reason: "provider-private-error" },
  ]) {
    answer = wrong;
    await expect(http.requests(scope, "Session fixture", request)).rejects.toThrow(TransportError);
  }
  const before = sent.length;
  await expect(http.requests(scope, "Session fixture", "not-an-id")).rejects.toThrow(TransportError);
  expect(sent).toHaveLength(before);
});

test("operational reads share the HTTP raw byte cap and cancel an oversized reply before decoding", async () => {
  let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65)); }, cancel() { cancelled++; } });
  const http = httpTransport("https://scope.test", { bytes: 64, fetch: async () => ({ status: 200, body }) });
  await expect(http.incidents(scope, "Session fixture")).rejects.toThrow(/longer than 64 bytes/);
  expect(cancelled).toBe(1);
});
