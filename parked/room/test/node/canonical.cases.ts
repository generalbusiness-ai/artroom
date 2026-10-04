/** Canonical bytes (R-SIG-2, R-SIG-3) and the strict parser. */
import { describe, expect, it } from "vitest";
import { CanonicalError, canonicalize, parseStrict, wellFormed } from "../../src/canonical.ts";

describe("R-SIG-2 canonicalize (RFC 8785)", () => {
  it("sorts keys by UTF-16 code units (RFC 8785 section 3.2.3 example)", () => {
    const obj = { "\u20ac": "Euro Sign", "\r": "Carriage Return", "\ufb33": "Hebrew Letter Dalet With Dagesh", "1": "One", "\ud83d\ude00": "Emoji: Grinning Face", "\u0080": "Control", "\u00f6": "Latin Small Letter O With Diaeresis" };
    const order = ["\r", "1", "\u0080", "\u00f6", "\u20ac", "\ud83d\ude00", "\ufb33"];
    const expected = `{${order.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k as keyof typeof obj])}`).join(",")}}`;
    expect(canonicalize(obj)).toBe(expected);
  });

  it("writes no whitespace and escapes strings as JSON.stringify does", () => {
    expect(canonicalize({ b: [1, true, null], a: "x\n\"\u000f" })).toBe('{"a":"x\\n\\"\\u000f","b":[1,true,null]}');
  });

  it("R-SIG-3: refuses non-integers, unsafe integers, negative zero, NaN, undefined fields, lone surrogates and class instances", () => {
    for (const bad of [1.5, 2 ** 53, -0, Number.NaN, { a: undefined }, "\ud800", new Date(0), () => 1]) expect(() => canonicalize(bad)).toThrow(CanonicalError);
    expect(canonicalize(-(2 ** 53 - 1))).toBe("-9007199254740991");
  });

  it("wellFormed detects lone surrogates", () => {
    expect(wellFormed("a\ud83d\ude00b")).toBe(true);
    expect(wellFormed("a\ud83d")).toBe(false);
    expect(wellFormed("\ude00")).toBe(false);
  });
});

describe("R-SIG-3 parseStrict", () => {
  it("refuses duplicate keys", () => {
    expect(() => parseStrict('{"a":1,"a":2}')).toThrow(/duplicate key/);
    expect(() => parseStrict('{"x":{"b":1,"b":1}}')).toThrow(/duplicate key/);
  });

  it("refuses fractions, exponents, unsafe integers and negative zero", () => {
    for (const bad of ["1.5", "1e3", "9007199254740992", "-0"]) expect(() => parseStrict(bad)).toThrow(CanonicalError);
    expect(parseStrict("-12")).toBe(-12);
  });

  it("refuses lone surrogate escapes, control characters, trailing text and deep nesting", () => {
    expect(() => parseStrict('"\\ud800"')).toThrow(/surrogate/);
    expect(() => parseStrict('"a\u0001"')).toThrow(/control/);
    expect(() => parseStrict("{} x")).toThrow(/trailing/);
    expect(() => parseStrict("[".repeat(70) + "]".repeat(70))).toThrow(/deep/);
  });

  it("keeps __proto__ as an ordinary key, never a prototype", () => {
    const v = parseStrict('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
  });

  it("round-trips canonical text", () => {
    const text = '{"a":[1,{"b":"c"}],"d":null}';
    expect(canonicalize(parseStrict(text))).toBe(text);
  });
});
