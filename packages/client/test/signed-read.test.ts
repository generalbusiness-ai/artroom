import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { SignedRead } from "@generalbusiness/artroom-contract";
import { canonicalize, keyIdOfSecret, parseStrict, unb64url, verifySignedRead } from "@generalbusiness/artroom-bytes";
import { httpTransport, secretSigner, signedLogReader, signedReader, signedReads, type Fetch } from "../src/index.ts";

const secret = new Uint8Array(32).fill(7);
const scope = `sc_${"a".repeat(52)}` as const;
const now = () => Date.parse("2026-10-07T12:00:00.400Z");
/** The signed read that a header carries: the canonical JSON of one, in unpadded base64url, after `Signed `. */
const opened = (header: string): SignedRead => {
  expect(header.startsWith("Signed ")).toBe(true);
  const text = new TextDecoder().decode(unb64url(header.slice("Signed ".length))!);
  const signed = parseStrict(text) as SignedRead;
  expect(canonicalize(signed)).toBe(text);
  return signed;
};

// Invariant: a signed read names the scope, the read, its argument and a notAfter within the intent bound, signed by the device key
// over exactly those bytes, so a scope that checks it with the bytes package accepts it, and accepts no other read under it.
test("a signed read is the scope, the read, its argument and a notAfter, signed by the key it names; the bytes package verifies it, and a change of any member is not that signature", async () => {
  const signer = secretSigner(secret);
  const signed = opened(await signedReader(signer, scope, "entry", "3", { now }));
  expect(signed.request).toEqual({ v: 1, to: scope, actor: keyIdOfSecret(secret), read: "entry", arg: "3", notAfter: "2026-10-07T12:01:00Z" });
  expect(verifySignedRead(signed)).toBe(true);
  expect([verifySignedRead({ ...signed, request: { ...signed.request, arg: "4" } }), verifySignedRead({ ...signed, request: { ...signed.request, read: "history" } })]).toEqual([false, false]);
  // The intent's bound is the latest a notAfter may be, and nothing later is signed.
  expect(opened(await signedReader(signer, scope, "summary", "summary", { now, lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds })).request.notAfter).toBe("2026-10-07T12:15:00Z");
  await expect(signedReader(signer, scope, "summary", "summary", { now, lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds + 1 })).rejects.toThrow(RangeError);
});

// Invariant: with no reader, the four reads go out signed, each naming its own read and argument; a session's reader goes out as it is.
test("a transport with signed reads signs summary, history, entry and log with their arguments when no reader is presented, and sends a presented session unchanged", async () => {
  const sent: { path: string; authorization: string | undefined }[] = [];
  const fetch: Fetch = (url, init) => {
    sent.push({ path: url.replace(`https://scopes.test/v1/scopes/${scope}`, ""), authorization: init?.headers?.["authorization"] });
    return Promise.resolve({ status: 403, body: new Response(JSON.stringify({ ok: false, reason: "forbidden" })).body });
  };
  const reads = signedReads(httpTransport("https://scopes.test", { fetch }), secretSigner(secret), { now });
  await reads.summary(scope, null);
  await reads.history(scope, null);
  await reads.history(scope, null, "200");
  await reads.entry(scope, null, 0);
  await reads.log(scope, null, "5");
  await reads.summary(scope, "Session ars1.x.y");
  const named = sent.map(({ path, authorization }) => [path, authorization?.startsWith("Signed ") ? [opened(authorization).request.read, opened(authorization).request.arg] : authorization]);
  expect(named).toEqual([
    ["", ["summary", "summary"]], ["/history", ["history", "0"]], ["/history?cursor=200", ["history", "200"]], ["/entries/0", ["entry", "0"]], ["/log?cursor=5", ["log", "5"]], ["", "Session ars1.x.y"],
  ]);
  // The replay source's reader: a signed read for a page of the log, and no header for a retained input.
  const log = signedLogReader(secretSigner(secret), { now });
  expect([opened((await log(scope, "log", "0"))!).request.read, await log(scope, "retained", `sha256:${"b".repeat(64)}`)]).toEqual(["log", undefined]);
});
