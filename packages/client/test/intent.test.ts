import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { publicKeyOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { TransportError, httpTransport, signedIntent, webCryptoSigner } from "../src/index.ts";

test("an intent signed by a WebCrypto key that cannot be read is one the bytes package verifies; each intent has a fresh idempotency key and a notAfter within the lifetime bound", async () => {
  const signer = await webCryptoSigner();
  // All a signer gives out is its key ID, which names a 32-byte public key, and signatures.
  expect([Object.keys(signer), publicKeyOf(signer.key)?.length]).toEqual([["key", "sign"], 32]);
  const now = Date.parse("2026-10-04T12:00:00.250Z");
  const asked = { to: null, kind: "found", fields: { source: "a repository" } };
  const [first, second] = [await signedIntent(signer, asked, { now }), await signedIntent(signer, asked, { now })];
  expect([verifySignedIntent(first), verifySignedIntent(second)]).toEqual([true, true]);
  // A signature over other bytes is not that intent's: the check is of these bytes, by this key.
  expect(verifySignedIntent({ intent: { ...first.intent, kind: "other" }, sig: first.sig })).toBe(false);
  expect(first.intent).toMatchObject({ v: 1, actor: signer.key, on: null, expected: {}, notAfter: "2026-10-04T12:05:00Z" });
  expect(first.intent.idempotencyKey).not.toBe(second.intent.idempotencyKey);
  // The bound is the latest a notAfter may be, and nothing later is signed.
  const longest = await signedIntent(signer, asked, { now, lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds });
  expect(longest.intent.notAfter).toBe("2026-10-04T12:15:00Z");
  await expect(signedIntent(signer, asked, { now, lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds + 1 })).rejects.toThrow(RangeError);
});

test("a reply is an outcome only when it is an answer of its operation: a discriminant the contract names, with what that answer must carry; anything else is a TransportError", async () => {
  const d = `sha256:${"a".repeat(64)}`;
  const fact = { at: { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" }, seq: 1, hash: d };
  const receipt = { fact, definition: d, intent: d, effects: [], sends: ["1.0"], epoch: 0 };
  const replying = (reply: unknown) => httpTransport("https://scopes.test", { fetch: () => Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(reply)) }) });
  const submit = (reply: unknown) => replying(reply).submit(fact.at.scope, {} as never, []);
  const settle = (reply: unknown) => replying(reply).settle(fact.at.scope, {} as never);
  // Each has the member its route's answers have, and is not one of them.
  for (const reply of [{ answer: null }, { answer: "accepted" }, { answer: "accepted", receipt: {} }, { answer: "refused", reason: "guard-failed" }, { answer: "refused", reason: "no", judgedAt: fact }, { answer: "done" }]) {
    await expect(submit(reply)).rejects.toThrow(TransportError);
  }
  for (const reply of [{ ok: "yes" }, { ok: true }, { ok: true, at: fact, value: {}, complete: true }, { ok: false }, { ok: false, reason: "gone" }]) await expect(settle(reply)).rejects.toThrow(TransportError);
  // An answer of the route is returned as it came.
  const answers = [{ answer: "accepted", receipt }, { answer: "refused", reason: "guard-failed", judgedAt: { seq: 1, hash: d } }, { answer: "unavailable", reason: "busy" }, { answer: "mismatch", reason: "idempotency-mismatch" }];
  for (const answer of answers) expect(await submit(answer)).toEqual(answer);
  expect(await settle({ ok: true, at: { seq: 1, hash: d }, value: receipt, complete: true })).toMatchObject({ ok: true, value: receipt });
  expect(await settle({ ok: false, reason: "not-found" })).toEqual({ ok: false, reason: "not-found" });
});

test("the intent that is signed is a detached copy: what the caller changes while the signer works, or afterwards, is not in the returned intent, which still verifies", async () => {
  const signer = await webCryptoSigner();
  let release = (): void => undefined;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  // A signer that answers only when released, as one that asks a person does.
  const slow = { key: signer.key, sign: async (bytes: Uint8Array) => { await waiting; return signer.sign(bytes); } };
  const form = { to: null, kind: "found", expected: { on: 1 }, fields: { source: "a repository", tags: ["a"] } };
  const pending = signedIntent(slow, form);
  form.fields.source = "another";
  form.fields.tags.push("b");
  form.expected.on = 2;
  release();
  const signed = await pending;
  expect([verifySignedIntent(signed), signed.intent.fields, signed.intent.expected]).toEqual([true, { source: "a repository", tags: ["a"] }, { on: 1 }]);
});
