/** Keys, digests and signatures (R-ID-4, R-ID-7, R-SIG-1). */
import { describe, expect, it } from "vitest";
import { b64url, digestBytes, digestJson, hex, keyIdOf, keyPairFromSeed, newKeyPair, publicKeyOf, sign, unb64url, verify } from "../../src/crypto.ts";
import { utf8 } from "../../src/canonical.ts";

const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));

describe("base64url (RFC 4648 section 5, unpadded)", () => {
  it("matches the RFC test vectors", () => {
    const cases: [string, string][] = [["", ""], ["f", "Zg"], ["fo", "Zm8"], ["foo", "Zm9v"], ["foob", "Zm9vYg"], ["fooba", "Zm9vYmE"], ["foobar", "Zm9vYmFy"]];
    for (const [plain, enc] of cases) {
      expect(b64url(utf8(plain))).toBe(enc);
      expect(new TextDecoder().decode(unb64url(enc)!)).toBe(plain);
    }
  });

  it("refuses padding, foreign characters and non-canonical trailing bits", () => {
    expect(unb64url("Zg==")).toBeNull();
    expect(unb64url("Z+")).toBeNull();
    expect(unb64url("Zh")).toBeNull();
    expect(unb64url("Z")).toBeNull();
  });
});

describe("R-ID-4 keys and R-ID-7 digests", () => {
  it("derives the RFC 8032 test 1 public key, as a key ID", () => {
    const k = keyPairFromSeed(fromHex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"));
    expect(hex(publicKeyOf(k.key)!)).toBe("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    expect(keyIdOf(publicKeyOf(k.key)!)).toBe(k.key);
  });

  it("digests are sha256: + hex of canonical bytes, or of raw bytes", () => {
    expect(digestJson({})).toBe("sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    expect(digestJson({ b: 1, a: 2 })).toBe(digestJson({ a: 2, b: 1 }));
    expect(digestBytes(utf8("abc"))).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("publicKeyOf refuses anything that is not a 32-byte key ID", () => {
    expect(publicKeyOf("key_short")).toBeNull();
    expect(publicKeyOf("nokey_" + "A".repeat(43))).toBeNull();
  });
});

describe("R-SIG-1 signatures with domain tags", () => {
  it("verifies its own signature, and refuses another domain, another key or a changed object", async () => {
    const k = newKeyPair();
    const obj = { v: 1, x: "y" };
    const s = sign(k.seed, "artroom-envelope-v1", obj);
    expect(s).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await verify(k.key, "artroom-envelope-v1", obj, s)).toBe(true);
    expect(await verify(k.key, "artroom-request-v1", obj, s)).toBe(false);
    expect(await verify(newKeyPair().key, "artroom-envelope-v1", obj, s)).toBe(false);
    expect(await verify(k.key, "artroom-envelope-v1", { ...obj, x: "z" }, s)).toBe(false);
    // Key order does not matter: the canonical bytes are signed.
    expect(await verify(k.key, "artroom-envelope-v1", { x: "y", v: 1 }, s)).toBe(true);
  });

  it("an entry signature covers the hash string as UTF-8", async () => {
    const k = newKeyPair();
    const hash = digestJson({ a: 1 });
    expect(await verify(k.key, "artroom-entry-v1", hash, sign(k.seed, "artroom-entry-v1", hash))).toBe(true);
  });

  it("never throws on malformed input", async () => {
    expect(await verify("key_x", "artroom-envelope-v1", {}, "AAAA")).toBe(false);
    expect(await verify(newKeyPair().key, "artroom-envelope-v1", { n: 1.5 }, "A".repeat(86))).toBe(false);
  });
});
