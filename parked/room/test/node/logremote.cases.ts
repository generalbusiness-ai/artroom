/** The log remote's base64url for object bytes (request 5a7290b9): the same text as `b64url`, built in one buffer. */
import { describe, expect, it } from "vitest";
import { b64url, randomBytes, unb64url } from "../../src/crypto.ts";
import { partB64url } from "../../src/logremote.ts";
import { utf8 } from "../../src/canonical.ts";

describe("partB64url", () => {
  it("matches the RFC test vectors and b64url for every length from 0 to 300, and for 1 MiB", () => {
    const cases: [string, string][] = [["", ""], ["f", "Zg"], ["fo", "Zm8"], ["foo", "Zm9v"], ["foob", "Zm9vYg"], ["fooba", "Zm9vYmE"], ["foobar", "Zm9vYmFy"]];
    for (const [plain, enc] of cases) expect(partB64url(utf8(plain))).toBe(enc);
    for (let n = 0; n <= 300; n++) {
      const bytes = randomBytes(n);
      expect(partB64url(bytes)).toBe(b64url(bytes));
      expect(unb64url(partB64url(bytes))).toEqual(bytes);
    }
    const big = new Uint8Array(1024 * 1024).map((_, i) => (i * 2654435761) >>> 24);
    expect(partB64url(big)).toBe(b64url(big));
  });
});
