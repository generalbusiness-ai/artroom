import { expect, test } from "vitest";
import type { ItemQuery, ItemQueryRead } from "@generalbusiness/dap-contract";
import { encodeItemQueryParameter, itemQueryArgument } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedReader } from "@generalbusiness/artroom-client";
import type { NativeItemQuery } from "../src/item-queries.ts";
import { at, found, rita, una, type Lane } from "./support.ts";

const queryOf = (scope: Lane, over: Partial<ItemQuery> = {}): ItemQuery => ({ v: 1, scope: scope.at, type: "commitment", states: ["accepted"], ids: null, limit: 100, cursor: null, ...over });
const read = (scope: Lane, query: ItemQuery, reader: unknown) => (scope.object as unknown as {
  queryItems(encoded: unknown, reader: unknown): Promise<NativeItemQuery>;
}).queryItems(encodeItemQueryParameter(query), reader);
const header = (scope: Lane, query: ItemQuery, who = rita, arg = itemQueryArgument(query)!) => signedReader(secretSigner(who.secret), scope.name, "query-items", arg, { now: () => Date.parse(at(0)) });

// The actual native object owns decoding, proof/preparation and the synchronous page.
// The lane's existing creator/authority ports remain the labelled fixture stand-ins.
test("native owned signed query binds its exact page, permits live and empty, and refuses final or mixed even for empty IDs", async () => {
  const scope = await found(); await scope.commitment();
  const query = queryOf(scope), success = await read(scope, query, await header(scope, query));
  expect(success.ok).toBe(true);
  if (!success.ok) return;
  const page = JSON.parse(success.serialized) as Extract<ItemQueryRead, { ok: true }>;
  expect(page.value.scope).toEqual(scope.at);
  expect(page.value.argument).toBe(itemQueryArgument(query));
  expect(page.value.items.map(item => [item.type, item.state])).toEqual([["commitment", "accepted"]]);
  expect(page.complete).toBe(true);
  for (const states of [["done"], ["accepted", "done"]]) {
    const selected = queryOf(scope, { states, ids: [] });
    expect(await read(scope, selected, await header(scope, selected))).toEqual({ ok: false, reason: "forbidden" });
  }
  const empty = queryOf(scope, { states: [] });
  const zero = await read(scope, empty, await header(scope, empty));
  expect(zero.ok && JSON.parse(zero.serialized).value.items).toEqual([]);
  expect(await read(scope, empty, null)).toEqual({ ok: false, reason: "forbidden" });
});

test("native owned query refuses substituted arguments and exposes selection errors only to scoped authority", async () => {
  const scope = await found();
  const query = queryOf(scope);
  expect(await read(scope, query, await header(scope, query, rita, "summary"))).toEqual({ ok: false, reason: "forbidden" });
  const absent = queryOf(scope, { type: "not-a-declared-type" });
  expect(await read(scope, absent, await header(scope, absent, una))).toEqual({ ok: false, reason: "forbidden" });
  expect(await read(scope, absent, await header(scope, absent))).toEqual({ ok: false, reason: "unknown-type" });
  const cursor = queryOf(scope, { cursor: "not-a-cursor" });
  expect(await read(scope, cursor, await header(scope, cursor))).toEqual({ ok: false, reason: "invalid-cursor" });
});
