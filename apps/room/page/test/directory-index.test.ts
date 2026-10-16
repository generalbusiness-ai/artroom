import { expect, test } from "vitest";
import type { Head, ScopeRef } from "@generalbusiness/dap-contract";
import { ITEM_QUERY_BOUNDS as B } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryCursor, itemQueryArgument, itemQueryDigest, newIncarnation, readItemQueryParameter, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { listLanes, Unreadable, type Room } from "../src/data.ts";

// Scripted bounded HTTP page, not native authority or freshness evidence.
// Native Page story separately proves the directory path makes no lane reads.
test("directory listing uses only advisory index rows and refuses an incomplete prefix after one page", async () => {
  const directory: ScopeRef = { scope: scopeIdOf({ v: 1, kind: "directory", creator: null, definition: "platform:directory@3", cause: textDigest("SCRIPTED directory cause"), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16)), kind: "directory" };
  const lane: ScopeRef = { ...directory, kind: "lane", scope: scopeIdOf({ v: 1, kind: "lane", creator: directory, definition: textDigest("SCRIPTED lane pin"), cause: textDigest("SCRIPTED lane cause"), ordinal: 1 }) };
  const at: Head = { seq: 15, hash: textDigest("SCRIPTED index head") };
  let complete = true;
  const calls: string[] = [];
  const room: Room = { directory: directory.scope, directoryIndex: { scope: directory, definition: "platform:directory@3" }, membership: { ...directory, kind: "membership" }, rules: directory.scope, destination: directory.scope, key: "" as Room["key"], me: null, reader: null, unsessioned: "SCRIPTED", definitions: new Map(),
    session: { service: "https://room.test", secret: new Uint8Array(32), now: () => Date.parse("2026-10-15T00:00:00Z"), fetch: async url => {
      calls.push(url);
      expect(new URL(url).pathname).toBe(`/v1/scopes/${directory.scope}/query-items`);
      const query = readItemQueryParameter(new URL(url).searchParams.get("q"))!;
      const items = [{ id: 9, type: "lane", state: "listed", revision: 1, opened: null, attributed: [], parties: {}, refs: { scope: lane }, values: { kind: "issue", number: 4, title: "Indexed title", state: "closed" } }];
      const next = encodeItemQueryCursor({ v: 1, scope: directory, head: at, query: itemQueryDigest(query)!, order: "id-ascending", bounds: B, limit: query.limit, last: 9 });
      return new Response(canonicalize({ ok: true, at, value: { v: 1, scope: directory, query: itemQueryDigest(query), argument: itemQueryArgument(query), items }, complete, ...(complete ? {} : { next }) }));
    } } };
  expect(await listLanes(room)).toEqual({ issues: [{ scope: lane.scope, number: 4, kind: "issue", title: "Indexed title", state: "closed", draft: null }], changes: [] });
  expect(calls).toHaveLength(1);
  complete = false; calls.length = 0;
  await expect(listLanes(room)).rejects.toThrow(new Unreadable("Directory index incomplete (page-budget); rows read: 1."));
  expect(calls).toHaveLength(1);
});
