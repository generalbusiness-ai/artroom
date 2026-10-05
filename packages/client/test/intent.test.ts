import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { publicKeyOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { signedIntent, webCryptoSigner } from "../src/index.ts";

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
