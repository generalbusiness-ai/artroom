import { expect, test } from "vitest";
import type { ItemQuery, ItemQueryRead, SessionAnswer, SessionClaims } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryParameter, itemQueryArgument } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedReader, sessionRequest, ScopeHandle, httpTransport, bindingTransport, signedReads } from "@generalbusiness/artroom-client";
import type { NativeItemQuery } from "../src/item-queries.ts";
import { sessionRoom } from "./support/session-room.ts";
import { mintSession, readerOf } from "../src/sessions.ts";
import { command, memoryStore } from "../../cli/src/index.ts";
import { api } from "../src/worker.ts";
import { env } from "cloudflare:workers";
import { net, soon } from "./net.ts";
import { rita as memberRita, routed } from "./repository.ts";
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
  scope.c.clock.now = at(-1);
  expect(await read(scope, absent, await header(scope, absent, una))).toEqual({ ok: false, reason: "forbidden" });
  scope.c.clock.now = "SCRIPTED invalid clock" as typeof scope.c.clock.now;
  expect(await read(scope, query, await header(scope, query))).toEqual({ ok: false, reason: "forbidden" });
  scope.c.clock.now = at(0);
  const cursor = queryOf(scope, { cursor: "not-a-cursor" });
  expect(await read(scope, cursor, await header(scope, cursor))).toEqual({ ok: false, reason: "invalid-cursor" });
});

// Native membership issues the unrestricted token. Restricted tokens below are
// deliberately minted policy-boundary inputs, not claims about issuance.
test("native query accepts an issued session across birth references and enforces restricted final, mixed and empty claims", async () => {
  const f = await sessionRoom();
  try {
    const issuer = f.children[0]!;
    const seat = await f.life.wait(async () => issuer.did(memberRita, "seat", { expected: await issuer.expected({ roster: 0 }) }));
    await f.life.wait(async () => issuer.did(memberRita, "first-key", { fields: { member: seat }, expected: await issuer.expected({ roster: 0, member: seat }) }));
    const signed = sessionRequest(f.membership, memberRita.secret, soon(60), "native-item-query-session");
    const answer = await f.life.wait(() => (issuer.object as unknown as { session(asked: unknown): Promise<SessionAnswer> }).session(signed));
    if (!answer.ok) return expect.fail(`native issuance refused: ${answer.reason}`);
    const child = f.children[1]!, scope = f.rules;
    const query = (states: string[], ids: number[] | null = null): ItemQuery => ({ v: 1, scope, type: "rules", states, ids, limit: 100, cursor: null });
    const ask = (selected: ItemQuery, reader: string) => f.life.wait(() => (child.object as unknown as { queryItems(encoded: unknown, reader: unknown): Promise<NativeItemQuery> }).queryItems(encodeItemQueryParameter(selected), reader));
    const issued = readerOf(answer.token);
    const first = await ask(query(["current"]), issued);
    expect(first.ok).toBe(true);
    if (first.ok) expect(JSON.parse(first.serialized).value.items.map((item: { state: string }) => item.state)).toEqual(["current"]);
    const service = "https://scopes.test";
    const handle = new ScopeHandle(httpTransport(service, { fetch: routed }), scope.scope, issued);
    expect(await f.life.wait(() => handle.queryItems(query(["current"])))).toEqual(JSON.parse(first.ok ? first.serialized : "null"));
    const binding = new ScopeHandle(bindingTransport(api(env.PLATFORM)), scope.scope, issued);
    expect(await f.life.wait(() => binding.queryItems(query(["current"])))).toEqual(JSON.parse(first.ok ? first.serialized : "null"));
    const bootstrap = new ScopeHandle(signedReads(httpTransport(service, { fetch: routed }), secretSigner(memberRita.secret), { now: () => Date.parse(net.clock.now) }), scope.scope);
    expect((await f.life.wait(() => bootstrap.queryItems(query(["current"])))).ok).toBe(true);
    const response = await f.life.wait(() => routed(`${service}/v1/scopes/${scope.scope}/query-items?q=${encodeItemQueryParameter(query(["current"]))}`, { headers: { authorization: issued } }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(first.ok ? first.serialized : "");
    const store = memoryStore();
    await store.keep("query-founder", memberRita.secret);
    await store.save({ v: 1, service, key: "query-founder", repository: { directory: f.directory, membership: f.membership, rules: f.rules.scope, destination: f.children[2]!.name } });
    const requests: string[] = [];
    const cli = await f.life.wait(() => command({ store, now: () => Date.parse(net.clock.now), fetch: async (url, init) => { requests.push(url); return routed(url, init); } }, ["items", scope.scope, "--query", canonicalize(query(["current"]))]));
    expect(cli.code, cli.lines.join("\n")).toBe(0);
    expect(cli.lines[0]).toContain("selected suffix complete");
    expect(requests.filter(url => url.includes("/query-items?"))).toHaveLength(1);
    expect(requests.some(url => /\/items\/|\/entries\//.test(url))).toBe(false);
    const restricted = (reads: SessionClaims["reads"]) => readerOf(mintSession(f.sessions, { ...answer.session, reads }));
    // `retired` is a final state of the genuine definition item. An empty
    // ID selection still owes that declared visibility's ordinary authority.
    expect(await ask({ ...query(["retired"], []), type: "definition" }, restricted(["summary"]))).toEqual({ ok: false, reason: "forbidden" });
    expect(await ask({ ...query(["active", "retired"], []), type: "definition" }, restricted(["items"]))).toEqual({ ok: false, reason: "forbidden" });
    const empty = await ask(query([]), restricted(["items"]));
    // This child's unresolved birth additionally requires summary authority.
    expect(empty).toEqual({ ok: false, reason: "forbidden" });
    expect((await ask(query([]), issued)).ok).toBe(true);
    expect(await ask(query([]), restricted([]))).toEqual({ ok: false, reason: "forbidden" });
    const expired = readerOf(mintSession(f.sessions, { ...answer.session, ends: net.clock.now }));
    expect(await ask(query(["current"]), expired)).toEqual({ ok: false, reason: "forbidden" });
    expect(await ask(query(["current"]), issued + "!")).toEqual({ ok: false, reason: "forbidden" });
    const current = net.clock.now;
    try {
      net.clock.now = "SCRIPTED invalid clock" as typeof net.clock.now;
      expect(await ask(query(["current"]), issued)).toEqual({ ok: false, reason: "forbidden" });
    } finally { net.clock.now = current; }
  } finally { f.life.release(); }
});
