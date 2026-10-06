import { describe, expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/artroom-contract";
import { FACT_TEXT_MOST, SCOPE_KINDS, factHex, factOfRefName, factOfText, factRefName, factText, isFactRefParts, utf8 } from "../src/index.ts";

// Witness 18.48, cases 1 to 3 and 5 (scope contract, section 3). F is the fact of an entry of a lane at position 41. Made up.
const HEX = "0123456789abcdef".repeat(4);
const F: FactRef = { at: { scope: `sc_${"b".repeat(51)}a`, inc: `in_${"c".repeat(25)}a`, kind: "lane" }, seq: 41, hash: `sha256:${HEX}` };
// Written by hand, member by member in the order of RFC 8785, not by this package.
const TEXT = `{"at":{"inc":"in_${"c".repeat(25)}a","kind":"lane","scope":"sc_${"b".repeat(51)}a"},"hash":"sha256:${HEX}","seq":41}`;
const RECEIPTS = "refs/artroom/receipts/";

describe("a fact reference as text", () => {
  test("18.48 case 1: the text of a fact is its canonical JSON on one line, and it is read back only from those bytes", () => {
    expect(factText(F)).toBe(TEXT);
    expect(/[ \n]/.test(TEXT)).toBe(false);
    // The members may be given in any order: the text is one.
    expect(factText({ seq: 41, hash: F.hash, at: { kind: "lane", inc: F.at.inc, scope: F.at.scope } })).toBe(TEXT);
    expect(factOfText(TEXT)).toEqual(F);
  });

  test("18.48 case 2: the longest text is 237 bytes, with the kind `destination` at the largest position", () => {
    const longest = factText({ ...F, at: { ...F.at, kind: "destination" }, seq: Number.MAX_SAFE_INTEGER })!;
    expect(utf8(longest).byteLength).toBe(237);
    expect(FACT_TEXT_MOST).toBe(237);
    expect(factOfText(longest)?.seq).toBe(9_007_199_254_740_991);
    // No kind and no position gives a longer one, and every byte is printable ASCII.
    for (const kind of SCOPE_KINDS) expect(factText({ ...F, at: { ...F.at, kind }, seq: Number.MAX_SAFE_INTEGER })!.length, kind).toBeLessThanOrEqual(237);
    expect(/^[\x20-\x7e]+$/.test(longest)).toBe(true);
  });

  test.each([
    ["a hash in upper case", { ...F, hash: `sha256:${HEX.toUpperCase()}` }],
    ["a hash without its prefix", { ...F, hash: HEX }],
    ["a position past the safe integers", { ...F, seq: 2 ** 53 }],
    ["a negative position", { ...F, seq: -1 }],
    ["a position with a fraction", { ...F, seq: 1.5 }],
    ["a kind that is no scope kind", { ...F, at: { ...F.at, kind: "room" } }],
    ["a scope ID of another length", { ...F, at: { ...F.at, scope: "sc_b" } }],
    ["a member more", { ...F, host: "example.invalid" }],
    ["a member less", { at: F.at, hash: F.hash }],
    ["a scope reference", F.at],
    ["a text", TEXT],
    ["null", null],
  ])("no text is written for %s", (_, value) => {
    expect(factText(value)).toBeNull();
  });

  test.each([
    ["a space after a colon", TEXT.replace('"seq":', '"seq": ')],
    ["a line feed after it", `${TEXT}\n`],
    ["a word before it", `receipt ${TEXT}`],
    ["another order of members", TEXT.replace(/^\{(.*),"seq":41\}$/, '{"seq":41,$1}')],
    ["a position with a leading zero", TEXT.replace('"seq":41', '"seq":041')],
    ["a position with an exponent", TEXT.replace('"seq":41', '"seq":4e1')],
    ["a position as a text", TEXT.replace('"seq":41', '"seq":"41"')],
    ["a position of 17 digits", TEXT.replace('"seq":41', '"seq":90071992547409920')],
    ["a hash in upper case", TEXT.replace(HEX, HEX.toUpperCase())],
    ["a member more", TEXT.replace('"seq":41', '"seq":41,"x":1')],
    ["a member twice", TEXT.replace('"seq":41', '"seq":41,"seq":41')],
    ["an escaped letter in a name", TEXT.replace('"seq"', '"\\u0073eq"')],
    ["a text that is cut", TEXT.slice(0, -1)],
    ["a text longer than the longest", `${" ".repeat(FACT_TEXT_MOST)}${TEXT}`],
    ["the empty text", ""],
    ["bytes, not a text", utf8(TEXT)],
  ])("no fact is read from %s", (_, text) => {
    expect(factOfText(text)).toBeNull();
  });
});

describe("a fact in a public ref's name", () => {
  test("18.48 case 3: the name is the fixed part and the 64 characters of the hash, 86 bytes, with no colon", () => {
    const name = factRefName(RECEIPTS, F.hash)!;
    expect(name).toBe(`refs/artroom/receipts/${HEX}`);
    expect([name.length, name.includes(":")]).toEqual([86, false]);
    expect(factOfRefName(name, RECEIPTS)).toBe(F.hash);
    // With a second fixed part the 64 characters are still one whole component.
    const headed = factRefName("refs/artroom/", F.hash, "/head")!;
    expect(headed.split("/")).toEqual(["refs", "artroom", HEX, "head"]);
    expect(factOfRefName(headed, "refs/artroom/", "/head")).toBe(F.hash);
    expect(factHex(F.hash)).toBe(HEX);
  });

  test("18.48 case 5: a reference with the same hash and another `at` has the same name and another text", () => {
    const other: FactRef = { ...F, at: { ...F.at, scope: `sc_${"d".repeat(51)}a` } };
    expect(factRefName(RECEIPTS, other.hash)).toBe(factRefName(RECEIPTS, F.hash));
    expect(factText(other)).not.toBe(factText(F));
  });

  test.each([
    ["a first part that does not begin with refs/", "heads/receipts/", ""],
    ["a first part that does not end with a slash", "refs/artroom/receipts", ""],
    ["a first part with an empty component", "refs//receipts/", ""],
    ["a first part with a capital", "refs/Artroom/", ""],
    ["a first part with a dot", "refs/art.room/", ""],
    ["a first part with a component that begins with a hyphen", "refs/-artroom/", ""],
    ["a first part with a colon", "refs/art:room/", ""],
    ["a first part with a component of 64 hexadecimal characters", `refs/${HEX}/`, ""],
    ["a second part that does not begin with a slash", RECEIPTS, "head"],
    ["a second part that ends with a slash", RECEIPTS, "/head/"],
    ["a second part with an empty component", RECEIPTS, "//head"],
    ["a second part with a component that begins with a hyphen", RECEIPTS, "/-head"],
    ["a second part with a component of 64 hexadecimal characters", RECEIPTS, `/${"f".repeat(64)}`],
  ])("no name is built or read under %s", (_, before, after) => {
    expect(isFactRefParts(before, after)).toBe(false);
    expect(factRefName(before, F.hash, after)).toBeNull();
    expect(factOfRefName(`${before}${HEX}${after}`, before, after)).toBeNull();
  });

  test.each([
    ["a hash with its prefix in the name", `${RECEIPTS}sha256:${HEX}`],
    ["63 characters", `${RECEIPTS}${HEX.slice(1)}`],
    ["65 characters", `${RECEIPTS}${HEX}0`],
    ["a capital digit", `${RECEIPTS}${HEX.replace("a", "A")}`],
    ["a letter past f", `${RECEIPTS}${HEX.replace("a", "g")}`],
    ["another first part", `refs/artroom/receipt-/${HEX}`.slice(0, 86)],
    ["a component after the characters", `${RECEIPTS}${HEX}/x`],
    ["the first part alone", RECEIPTS],
  ])("no fact is read from a name with %s", (_, name) => {
    expect(factOfRefName(name, RECEIPTS)).toBeNull();
  });

  test("no name is built from a value that is no digest", () => {
    for (const hash of [HEX, `sha256:${HEX.toUpperCase()}`, `sha256:${HEX.slice(1)}`, F, null]) {
      expect(factRefName(RECEIPTS, hash)).toBeNull();
      expect(factHex(hash)).toBeNull();
    }
  });
});
