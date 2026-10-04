/**
 * The same signing vectors inside workerd: WebCrypto Ed25519 and the
 * canonical bytes behave the same in the Workers runtime (R-SIG-1, R-SIG-2).
 */

import { expect, test } from "vitest";
import { buildEnvelope, generateSigner, signEnvelope, signerFromJwk, toBase64Url, verifyValue } from "../../src/index.ts";

const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));

test("RFC 8032 test 1 and the envelope vector", async () => {
  const signer = await signerFromJwk({
    kty: "OKP",
    crv: "Ed25519",
    d: toBase64Url(hex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")),
    x: toBase64Url(hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")),
  });
  expect(signer.key).toBe("key_11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo");
  const sig = Array.from(await signer.sign(new Uint8Array()), (b) => b.toString(16).padStart(2, "0")).join("");
  expect(sig).toBe("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b");
  const env = buildEnvelope("room_0123456789abcdef0123456789abcdef", { signer }, "claim", null, { goal: "Rate-limit /api/login", scope: ["src/api/login.ts", "src/lib/ratelimit/**"] }, "k1");
  const signed = await signEnvelope(env, signer);
  expect(signed.sig).toBe("mNrC0_n6LIg76ddZKb68cM5FF4QDPXZzPg3nUE5sThOxYnD8S8Eyy5u8d8zillth0M_ildhmL9sbIcZtY5LXDQ");
  expect(await verifyValue("artroom-envelope-v1", env, signed.sig, signer.key)).toBe(true);
});

test("a generated key signs and verifies", async () => {
  const { signer } = await generateSigner();
  const env = buildEnvelope("room_0123456789abcdef0123456789abcdef", { signer }, "renew", { lane: "act_7_0c1d2e3f" }, { lease: 1 }, "k");
  const { sig } = await signEnvelope(env, signer);
  expect(await verifyValue("artroom-envelope-v1", env, sig, signer.key)).toBe(true);
});
