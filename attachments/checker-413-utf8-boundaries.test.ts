/** Independent UTF-8 prefix boundaries for exact 413f4527. */
import { describe, expect, it } from "vitest";
import { clipBytes, fill, WORDING_FILLED_BYTES } from "../../src/declared.ts";

const CAP = 8192;
const bytes = (s: string) => new TextEncoder().encode(s).length;
const cases = [
  ["ASCII exactly the cap", "x".repeat(CAP), "x".repeat(CAP)],
  ["ASCII one byte over", "x".repeat(CAP + 1), "x".repeat(CAP)],
  ["supplementary character fits exactly", "x".repeat(CAP - 4) + "😀", "x".repeat(CAP - 4) + "😀"],
  ["supplementary character at the cap stays when more follows", "x".repeat(CAP - 4) + "😀z", "x".repeat(CAP - 4) + "😀"],
  ["supplementary character cannot fit in three remaining bytes", "x".repeat(CAP - 3) + "😀", "x".repeat(CAP - 3)],
  ["three-byte character fits exactly", "x".repeat(CAP - 3) + "€", "x".repeat(CAP - 3) + "€"],
  ["three-byte character at the cap stays when more follows", "x".repeat(CAP - 3) + "€z", "x".repeat(CAP - 3) + "€"],
  ["three-byte character cannot fit in two remaining bytes", "x".repeat(CAP - 2) + "€", "x".repeat(CAP - 2)],
  ["leading U+FEFF stays in an over-cap prefix", "\ufeff" + "x".repeat(CAP), "\ufeff" + "x".repeat(CAP - 3)],
] as const;

describe("independent413 UTF-8 clipping boundaries", () => {
  for (const [label, text, expected] of cases) {
    it(label, () => {
      expect(WORDING_FILLED_BYTES).toBe(CAP);
      const actual = clipBytes(text, CAP);
      expect(actual).toBe(expected);
      expect(text.startsWith(actual)).toBe(true);
      expect(bytes(actual)).toBeLessThanOrEqual(CAP);
      // A short legal template exercises the same clipping path after interpolation.
      expect(fill("{path}", { path: text })).toBe(expected);
    });
  }
  it("direct helper cuts before a character at a small byte limit", () => {
    expect(clipBytes("", 0)).toBe("");
    expect(clipBytes("😀x", 0)).toBe("");
    expect(clipBytes("😀x", 3)).toBe("");
    expect(clipBytes("😀x", 4)).toBe("😀");
    expect(clipBytes("€x", 2)).toBe("");
    expect(clipBytes("€x", 3)).toBe("€");
    expect(clipBytes("\ufeffx", 3)).toBe("\ufeff");
  });
});
