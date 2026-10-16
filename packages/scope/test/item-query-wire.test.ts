import { expect, test } from "vitest";
import type { ItemQuery } from "@generalbusiness/dap-contract";
import { b64url, encodeItemQuery, newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { admittedRequestUrl, decodeItemQueryWire, itemQueryWire } from "../src/item-query-wire.ts";

const scope = { scope: scopeIdOf({ v: 1, kind: "lane", creator: null, definition: textDigest("SCRIPTED query wire definition"), cause: textDigest("SCRIPTED cause"), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(4)), kind: "lane" as const };
const query: ItemQuery = { v: 1, scope, type: "task", states: ["open"], ids: null, limit: 100, cursor: null };
const encoded = b64url(utf8(encodeItemQuery(query)!));
const base = `https://scopes.test/v1/scopes/${scope.scope}/query-items`;

// Invariant: only the exact canonical URL spelling can reach operation decoding;
// routing retains bounded encoded bytes and leaves semantic parsing to the owner.
test("query routing refuses aliases and retains the exact bounded encoded argument", () => {
  expect(itemQueryWire(new Request(`${base}?q=${encoded}`), scope.scope)).toEqual({ ok: true, encoded });
  expect(decodeItemQueryWire(encoded)).toEqual(query);
  for (const suffix of [`?q=${encoded}=`, `?q=${encoded}&q=${encoded}`, `?q=${encoded}&x=1`, `?%71=${encoded}`, `?q=${encoded}#fragment`, `?q=${encoded}%0A`]) {
    expect(itemQueryWire(new Request(base + suffix), scope.scope), suffix.slice(0, 30)).toEqual({ ok: false, reason: "invalid-query" });
  }
  expect(itemQueryWire(new Request(`${base.replace(scope.scope, "%73" + scope.scope.slice(1))}?q=${encoded}`), scope.scope)).toEqual({ ok: false, reason: "invalid-query" });
  expect(itemQueryWire(new Request(`${base}?q=eA`), scope.scope)).toEqual({ ok: true, encoded: "eA" });
  expect(decodeItemQueryWire("eA")).toBeNull();
});

// Invariant: admission bounds characters before UTF-8/decode and keeps a distinct
// common URL ceiling for pre-existing routes. No namespace or storage participates.
test("query and common URL byte ceilings reject oversized input before operation decoding", () => {
  expect(itemQueryWire(new Request(`${base}?q=${"A".repeat(10924)}`), scope.scope)).toEqual({ ok: false, reason: "too-large" });
  const prefix = "https://scopes.test/other?x=";
  expect(admittedRequestUrl(prefix + "a".repeat(16384 - prefix.length))).toBe(true);
  expect(admittedRequestUrl(prefix + "a".repeat(16385 - prefix.length))).toBe(false);
  expect(admittedRequestUrl(prefix + "雪".repeat(6000))).toBe(false);
  expect(decodeItemQueryWire("A".repeat(10924))).toBeNull();
});
