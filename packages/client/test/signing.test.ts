/**
 * Canonical bytes and signing vectors (R-SIG-1, R-SIG-2, R-SIG-3, R-ID-4,
 * R-ID-10). The Ed25519 vector is RFC 8032 section 7.1, test 1; the
 * canonical JSON vectors are from RFC 8785. Signatures are checked again
 * with node:crypto, which shares no code with the client.
 */

import { createPublicKey, verify as nodeVerify } from "node:crypto";
import { describe, expect, test } from "vitest";
import { isArtroomError, type Binding } from "@generalbusiness/artroom-contract";
import {
  buildDeclaredEnvelope,
  buildEnvelope,
  canonicalize,
  checkBinding,
  fromBase64Url,
  generateSigner,
  keyIdOf,
  newIdempotencyKey,
  signEnvelope,
  signerFromJwk,
  signingBytes,
  signRequest,
  toBase64Url,
  verifyValue,
} from "../src/index.ts";

const ROOM = "room_0123456789abcdef0123456789abcdef";
const B = (c: string) => `sha256:${c.repeat(64)}` as Binding;
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// RFC 8032, section 7.1, TEST 1.
const SECRET = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PUBLIC = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const EMPTY_SIG =
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

const rfcSigner = () => signerFromJwk({ kty: "OKP", crv: "Ed25519", d: toBase64Url(hex(SECRET)), x: toBase64Url(hex(PUBLIC)) });

function nodeCheck(bytes: Uint8Array, sig: string, publicHex: string): boolean {
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: toBase64Url(hex(publicHex)) }, format: "jwk" });
  return nodeVerify(null, bytes, key, fromBase64Url(sig));
}

describe("canonical bytes (R-SIG-2: RFC 8785)", () => {
  // Characters are built from code points so the source holds no escapes.
  const ch = (...points: number[]) => String.fromCodePoint(...points);
  const BS = ch(0x5c);
  const DQ = ch(0x22);

  test("sorts keys by UTF-16 code units (RFC 8785 section 3.2.3)", () => {
    const input = {
      [ch(0x20ac)]: "Euro Sign",
      [ch(0x0d)]: "Carriage Return",
      [ch(0xfb33)]: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      [ch(0x1f600)]: "Emoji: Grinning Face",
      [ch(0x80)]: "Control",
      [ch(0xf6)]: "Latin Small Letter O With Diaeresis",
    };
    const order = [ch(0x0d), "1", ch(0x80), ch(0xf6), ch(0x20ac), ch(0x1f600), ch(0xfb33)];
    const text = (k: string) => (k === ch(0x0d) ? `${BS}r` : k);
    const expected = `{${order.map((k) => `${DQ}${text(k)}${DQ}:${DQ}${input[k]}${DQ}`).join(",")}}`;
    // The carriage return is escaped as \r; U+0080 and the rest are written as themselves.
    expect(canonicalize(input)).toBe(expected);
  });

  test("escapes strings as RFC 8785 does (Appendix B, the string and literal parts)", () => {
    // Input string: euro, dollar, U+000F, newline, A, quote ', B, double quote, backslash, backslash, double quote, slash.
    const value = `${ch(0x20ac)}$${ch(0x0f)}${ch(0x0a)}A'B${DQ}${BS}${BS}${DQ}/`;
    const input = { string: value, literals: [null, true, false] };
    // Expected: control characters as lowercase escapes, newline as \n, quote and backslash escaped, slash plain.
    const expected = `{${DQ}literals${DQ}:[null,true,false],${DQ}string${DQ}:${DQ}${ch(0x20ac)}$${BS}u000f${BS}nA'B${BS}${DQ}${BS}${BS}${BS}${BS}${BS}${DQ}/${DQ}}`;
    expect(canonicalize(input)).toBe(expected);
  });

  test("writes integers plainly and nests in order", () => {
    expect(canonicalize({ b: [3, -2, 0, { z: 1, a: 9007199254740991 }], a: "" })).toBe('{"a":"","b":[3,-2,0,{"a":9007199254740991,"z":1}]}');
  });

  test("omits absent optional fields, never writing null (R-SIG-3)", () => {
    expect(canonicalize({ a: 1, plan: undefined, note: null })).toBe('{"a":1,"note":null}');
  });

  test("refuses what has no canonical form with bad-request (R-SIG-3)", () => {
    const refused: readonly (readonly [string, unknown])[] = [
      ["a fraction", { n: 1.5 }],
      ["an unsafe integer", { n: 2 ** 53 }],
      ["negative zero", { n: -0 }],
      ["NaN", { n: Number.NaN }],
      ["a lone high surrogate", { s: `a${String.fromCharCode(0xd800)}b` }],
      ["a lone low surrogate in a key", { [String.fromCharCode(0xdc00)]: 1 }],
      ["a Date", { d: new Date(0) }],
      ["a bigint", { n: 1n }],
      ["undefined in an array", { a: [undefined] }],
    ];
    for (const [what, value] of refused) {
      let thrown: unknown;
      try {
        canonicalize(value);
      } catch (e) {
        thrown = e;
      }
      expect(isArtroomError(thrown), what).toBe(true);
      expect((thrown as { code: string }).code, what).toBe("bad-request");
    }
  });
});

describe("keys and signatures (R-SIG-1, R-ID-4)", () => {
  test("RFC 8032 test 1: the key ID and the signature of the empty message", async () => {
    const signer = await rfcSigner();
    expect(signer.key).toBe(`key_${toBase64Url(hex(PUBLIC))}`);
    expect(signer.key).toBe("key_11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo");
    expect(keyIdOf(hex(PUBLIC))).toBe(signer.key);
    expect(toHex(await signer.sign(new Uint8Array()))).toBe(EMPTY_SIG);
  });

  test("an envelope's signing bytes and signature are fixed (vector for other implementations)", async () => {
    const signer = await rfcSigner();
    const env = buildEnvelope(
      "room_0123456789abcdef0123456789abcdef",
      { signer },
      "claim",
      null,
      { goal: "Rate-limit /api/login", scope: ["src/api/login.ts", "src/lib/ratelimit/**"] },
      "k1",
    );
    const canonical =
      '{"actor":"key_11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo","body":{"goal":"Rate-limit /api/login","scope":["src/api/login.ts","src/lib/ratelimit/**"]},"idempotencyKey":"k1","kind":"claim","room":"room_0123456789abcdef0123456789abcdef","target":null,"v":1}';
    expect(canonicalize(env)).toBe(canonical);
    const bytes = signingBytes("artroom-envelope-v1", env);
    expect(new TextDecoder().decode(bytes)).toBe(`artroom-envelope-v1\n${canonical}`);
    const signed = await signEnvelope(env, signer);
    expect(signed.sig).toBe("mNrC0_n6LIg76ddZKb68cM5FF4QDPXZzPg3nUE5sThOxYnD8S8Eyy5u8d8zillth0M_ildhmL9sbIcZtY5LXDQ");
    expect(fromBase64Url(signed.sig)).toHaveLength(64);
    expect(nodeCheck(bytes, signed.sig, PUBLIC)).toBe(true);
    expect(await verifyValue("artroom-envelope-v1", env, signed.sig, signer.key)).toBe(true);
  });

  test("the domain tag separates envelopes from requests (R-SIG-1)", async () => {
    const signer = await rfcSigner();
    const env = buildEnvelope("room_0123456789abcdef0123456789abcdef", { signer }, "renew", { lane: "act_7_0c1d2e3f" }, { lease: 1 }, "k2");
    const { sig } = await signEnvelope(env, signer);
    expect(await verifyValue("artroom-request-v1", env, sig, signer.key)).toBe(false);
    expect(await verifyValue("artroom-envelope-v1", { ...env, body: { lease: 2 } }, sig, signer.key)).toBe(false);
  });

  test("a delegated envelope names its delegation; the actor is always the signing key (R-ADM-2)", async () => {
    const signer = await rfcSigner();
    const env = buildEnvelope("room_0123456789abcdef0123456789abcdef", { signer, delegation: "act_12_9f3a01bc" }, "note", { act: "act_3_00000000" }, { text: "hi" }, "k3");
    expect(env.delegation).toBe("act_12_9f3a01bc");
    expect(env.actor).toBe(signer.key);
    const other = (await generateSigner()).signer;
    await expect(signEnvelope(env, other)).rejects.toMatchObject({ name: "ArtroomError", code: "bad-request" });
  });

  test("request envelopes carry a fresh nonce and a near notAfter (R-CRED-6)", async () => {
    const signer = await rfcSigner();
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    const a = await signRequest("room_0123456789abcdef0123456789abcdef", { signer }, { kind: "session", ttlSeconds: 3600 }, now);
    const b = await signRequest("room_0123456789abcdef0123456789abcdef", { signer }, { kind: "session", ttlSeconds: 3600 }, now);
    expect(a.request.nonce).not.toBe(b.request.nonce);
    expect(a.request.nonce).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    const ahead = Date.parse(a.request.notAfter) - now;
    expect(ahead).toBeGreaterThan(0);
    expect(ahead).toBeLessThanOrEqual(300_000);
    expect(nodeCheck(signingBytes("artroom-request-v1", a.request), a.sig, PUBLIC)).toBe(true);
  });

  test("idempotency keys are fresh and well formed (R-ID-10); bad ones are refused", async () => {
    const keys = new Set(Array.from({ length: 100 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(100);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    const signer = await rfcSigner();
    expect(() => buildEnvelope("room_0123456789abcdef0123456789abcdef", { signer }, "renew", null, {}, "has space")).toThrow();
  });

  test("a generated key signs, and its private key cannot be exported (browser default)", async () => {
    const { signer, jwk } = await generateSigner();
    expect(jwk).toBeUndefined();
    expect(signer.key).toMatch(/^key_[A-Za-z0-9_-]{43}$/);
    const sig = toBase64Url(await signer.sign(new TextEncoder().encode("x")));
    expect(nodeCheck(new TextEncoder().encode("x"), sig, toHex(fromBase64Url(signer.key.slice(4))))).toBe(true);
  });

  test("an extractable key round-trips through its JWK (the CLI key file)", async () => {
    const { signer, jwk } = await generateSigner({ extractable: true });
    const again = await signerFromJwk(jwk!);
    expect(again.key).toBe(signer.key);
    const msg = new TextEncoder().encode("same");
    expect(toHex(await again.sign(msg))).toBe(toHex(await signer.sign(msg)));
  });
});

describe("the declared envelope (R-DECL-16, R-SIG-1 as amended)", () => {
  test("v: 2 with the binding inside the signed bytes, under the same domain tag; a changed binding breaks the signature", async () => {
    const { signer } = await generateSigner();
    const env = buildDeclaredEnvelope(ROOM, { signer }, "ask", B("a"), { act: "act_1_00000000" }, { text: "x" }, "k1");
    expect(env).toEqual({ v: 2, room: ROOM, actor: signer.key, kind: "ask", binding: B("a"), target: { act: "act_1_00000000" }, body: { text: "x" }, idempotencyKey: "k1" });
    const signed = await signEnvelope(env, signer);
    expect(await verifyValue("artroom-envelope-v1", signed.envelope, signed.sig, signer.key)).toBe(true);
    expect(await verifyValue("artroom-envelope-v1", { ...signed.envelope, binding: B("b") }, signed.sig, signer.key)).toBe(false);
    expect(await verifyValue("artroom-envelope-v1", { ...signed.envelope, v: 1 }, signed.sig, signer.key)).toBe(false);
    // Under a delegation the envelope names it, as a v: 1 envelope does.
    expect(buildDeclaredEnvelope(ROOM, { signer, delegation: "act_9_00000000" }, "ask", B("a"), null, {}, "k2")).toMatchObject({ delegation: "act_9_00000000" });
  });

  test("a binding is sha256: and 64 lowercase hex digits, or the call is refused before anything is built", () => {
    expect(checkBinding(B("a"))).toBe(B("a"));
    for (const bad of [undefined, null, "", "sha256:abc", B("A"), `sha1:${"a".repeat(64)}`, 7]) expect(() => checkBinding(bad)).toThrow(/binding/);
  });
});
