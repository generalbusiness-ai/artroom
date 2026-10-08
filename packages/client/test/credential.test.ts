import { expect, test } from "vitest";
import { readCredential } from "../src/credential.ts";

// Invariant: the one-time reader bounds untrusted bytes and validates its whole
// answer, presents the session unchanged, and never retries a consumed token.
test("credential read checks the bounded reply and keeps uncertain custody distinct from an ordinary retryable read", async () => {
  const scope = `sc_${"a".repeat(52)}` as const;
  const value = { token: "plaintext", ends: "2026-10-07T12:00:00Z", remote: "https://service.test/git/n/r.git" };
  const answer = { ok: true, at: { seq: 2, hash: `sha256:${"a".repeat(64)}` }, complete: true, value };
  let calls = 0;
  const fetched = (body: unknown) => async (url: string, init?: { headers?: Record<string, string> }) => {
    calls++;
    expect(url).toBe(`https://service.test/v1/scopes/${scope}/credential/read%3Aabc`);
    expect(init?.headers).toEqual({ authorization: "Session test" });
    return new Response(JSON.stringify(body));
  };
  expect(await readCredential("https://service.test/", scope, "Session test", "read:abc", { fetch: fetched(answer) })).toEqual(answer);
  expect(await readCredential("https://service.test/", scope, "Session test", "read:abc", { fetch: fetched({ ok: false, reason: "forbidden" }) })).toEqual({ ok: false, reason: "forbidden" });
  await expect(readCredential("https://service.test/", scope, "Session test", "read:abc", { fetch: fetched({ ...answer, value: { ...value, ends: "tomorrow" } }) })).rejects.toThrow("may have been consumed");
  expect(calls).toBe(3);
  let cancelled = false;
  let chunks = 0;
  const body = new ReadableStream<Uint8Array>({ pull(c) { chunks++; c.enqueue(new Uint8Array(9)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await expect(readCredential("https://service.test", scope, "Session test", "h", { bytes: 8, fetch: async () => ({ status: 200, body }) })).rejects.toThrow("may have been consumed");
  expect([chunks, cancelled]).toEqual([1, true]);
});

// Invariant: malformed host metadata never reaches a Git environment or URL;
// every failure reports only custody uncertainty and makes one request.
test("credential refuses unsafe token and remote metadata without disclosure or a retry", async () => {
  const scope = `sc_${"a".repeat(52)}` as const;
  const value = { token: "secret-sentinel", ends: "2026-10-07T12:00:00Z", remote: "https://service.test/git/n/r.git" };
  const answer = { ok: true, at: { seq: 2, hash: `sha256:${"a".repeat(64)}` }, complete: true, value };
  const read = async (metadata: typeof value) => {
    let calls = 0;
    const fetch = async () => { calls++; return new Response(JSON.stringify({ ...answer, value: metadata })); };
    const outcome = await readCredential("https://service.test", scope, "Session test", "read:one", { fetch }).then(
      (result) => ({ result, error: null }),
      (error: Error) => ({ result: null, error: error.message }),
    );
    expect(calls).toBe(1);
    return outcome;
  };
  const unsafe = [
    { ...value, token: "secret-sentinel\u0000" },
    { ...value, token: "secret-sentinel\t" },
    { ...value, token: "secret-sentinel-é" },
    { ...value, token: "x".repeat(4097) },
    { ...value, remote: "https://secret-sentinel:password@service.test/git/n/r.git" },
    { ...value, remote: "https://service.test/secret-sentinel\n/git/n/r.git" },
    { ...value, remote: "/secret-sentinel/r.git" },
    { ...value, remote: "http://service.test/secret-sentinel/r.git" },
  ];
  for (const metadata of unsafe) {
    expect(await read(metadata)).toEqual({ result: null, error: "The credential reply is unavailable or invalid; the one-time credential may have been consumed." });
  }
  // The actual maximum is accepted, including printable punctuation used by
  // host tokens; rejecting unsafe metadata does not disable normal custody.
  const bounded = { ...value, token: "!".repeat(4095) + "~" };
  expect(await read(bounded)).toEqual({ result: { ...answer, value: bounded }, error: null });
});
