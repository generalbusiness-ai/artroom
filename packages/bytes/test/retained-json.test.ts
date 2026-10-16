import { expect, test } from "vitest";
import { DOMAINS } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, domainBytes, domainRetainedJSON, rawRetainedJSON, utf8 } from "../src/index.ts";

const hash = (text: string) => digestBytes(utf8(text));
test("raw retained JSON validates actual bytes before returning even null; malformed or changed bytes refuse", () => {
  for (const text of ["null", "{ \"a\": 1 }", '"é"']) expect(rawRetainedJSON(hash(text), text)).toEqual(JSON.parse(text));
  expect(rawRetainedJSON(hash('{"a":1}'), '{ "a":1 }')).toBeUndefined();
  for (const text of ['{"a":1,"a":2}', '"\\ud800"', "undefined"]) expect(rawRetainedJSON(hash(text), text)).toBeUndefined();
});

test("domain validation preserves ordinary replay's spelling behavior while archive canonical selection is explicit", () => {
  const value = { a: 1 }, bytes = canonicalize(value), digest = digestBytes(domainBytes(DOMAINS.definition, value));
  expect(domainRetainedJSON(DOMAINS.definition, digest, bytes)).toEqual(value);
  expect(domainRetainedJSON(DOMAINS.definition, digest, '{ "a":1 }')).toEqual(value);
  expect(domainRetainedJSON(DOMAINS.definition, digest, '{ "a":1 }', { canonical: true })).toBeUndefined();
  expect(domainRetainedJSON(DOMAINS.text, digest, bytes)).toBeUndefined();
  expect(domainRetainedJSON(DOMAINS.definition, digest, '{"a":2}')).toBeUndefined();
});

test("explicit maxima count UTF8 bytes and invalid limits refuse; JSON null remains distinct from invalid", () => {
  const value = "é", bytes = canonicalize(value), digest = digestBytes(domainBytes(DOMAINS.text, value));
  expect(bytes.length).toBe(3); expect(utf8(bytes).length).toBe(4);
  expect(domainRetainedJSON(DOMAINS.text, digest, bytes, { canonical: true, max: 4 })).toBe(value);
  for (const max of [3, -1, 0.5, Infinity, NaN]) expect(domainRetainedJSON(DOMAINS.text, digest, bytes, { max })).toBeUndefined();
  const nil = digestBytes(domainBytes(DOMAINS.text, null));
  expect(domainRetainedJSON(DOMAINS.text, nil, "null")).toBeNull();
});
