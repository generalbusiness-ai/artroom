import { describe, expect, test } from "vitest";
import { CanonicalError, MAX_DEPTH, b64url, base32, canonicalize, parseStrict, parseStrictBytes, unb64url, unbase32, utf8 } from "../src/index.ts";

describe("canonical JSON", () => {
  test.each([
    // The key-sorting example of RFC 8785 section 3.2.3: order is by UTF-16 code units, not code points.
    ["keys", { "\u20ac": 1, "\r": 2, "\ufb33": 3, "1": 4, "\ud83d\ude00": 5, "\u0080": 6, "\u00f6": 7 },
      '{"\\r":2,"1":4,"\u0080":6,"\u00f6":7,"\u20ac":1,"\ud83d\ude00":5,"\ufb33":3}'],
    ["numbers", [0, -1, 9007199254740991, 1e15], "[0,-1,9007199254740991,1000000000000000]"],
    // Only the escapes RFC 8785 section 3.2.2.2 names; everything else is written as itself.
    ["escapes", "\u0000\b\t\n\f\r\"\\\u001f/\u007f\u20ac\u2028", '"\\u0000\\b\\t\\n\\f\\r\\"\\\\\\u001f/\u007f\u20ac\u2028"'],
    ["nesting", { b: [1, { d: null, c: true }], a: "x" }, '{"a":"x","b":[1,{"c":true,"d":null}]}'],
  ])("one value has one byte form, the RFC 8785 one: %s", (_, value, text) => {
    expect(canonicalize(value)).toBe(text);
  });

  test("a value with no single byte form in the profile is refused, never written", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const refused = [1.5, -0, NaN, Infinity, 2 ** 53, "\ud800", { "\udc00": 1 }, { a: undefined }, [1, , 2], undefined, 1n, new Date(0), new Map(), cyclic];
    for (const value of refused) expect(() => canonicalize(value), String(value)).toThrow(CanonicalError);
  });

  test("the strict parser refuses text that is not exactly one value of the profile", () => {
    const refused = [
      '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', // duplicate keys, however they are spelled
      '"\\ud800"', `"${"\ud800"}"`, // a lone surrogate, escaped or not
      "{} x", "1 2", '{"a":1}{"a":1}', // trailing characters
      "1.0", "1e2", "-0", "9007199254740992", "01", // numbers outside the profile
      '{"a":1,}', "[1,]", '"\\x"', '"\n"', "", "\ufeff1",
      "[".repeat(MAX_DEPTH + 1) + "]".repeat(MAX_DEPTH + 1), "[".repeat(100_000),
    ];
    for (const text of refused) expect(() => parseStrict(text), JSON.stringify(text.slice(0, 20))).toThrow(CanonicalError);
    // As bytes: malformed UTF-8, and a byte order mark, which a lenient decoder would drop.
    for (const bytes of [[0x22, 0xff, 0x22], [0xef, 0xbb, 0xbf, 0x31]]) expect(() => parseStrictBytes(new Uint8Array(bytes))).toThrow(CanonicalError);
  });

  test("canonical bytes survive a parse and a rewrite unchanged, with `__proto__` as an ordinary key", () => {
    const text = '{"__proto__":{"x":1},"a":[[],{}],"b":"\u20ac\\n"}';
    const value = parseStrictBytes(utf8(text));
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(canonicalize(value)).toBe(text);
  });
});

describe("encodings", () => {
  test("a byte string has one text form: known vectors round-trip, and text the encoder would not write is refused", () => {
    // RFC 4648 section 10, lowercase and unpadded.
    for (const [ascii, text] of [["", ""], ["f", "my"], ["fo", "mzxq"], ["foobar", "mzxw6ytboi"]] as const) {
      expect(base32(utf8(ascii))).toBe(text);
      expect(unbase32(text)).toEqual(utf8(ascii));
    }
    expect(b64url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(b64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(unb64url("-_8")).toEqual(new Uint8Array([0xfb, 0xff]));
    // Set trailing bits, a spare character, padding, the wrong case or alphabet.
    for (const text of ["mz", "m", "my======", "MY", "m1"]) expect(unbase32(text), text).toBeNull();
    for (const text of ["-_9", "A", "-_8=", "+/8"]) expect(unb64url(text), text).toBeNull();
  });
});
