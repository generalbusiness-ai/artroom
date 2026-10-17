/** Native admission-index prerequisite. Platform data, grants and rule are
 * stand-ins; genesis/turn/transaction/SQLite/restart behavior is native. */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Intent, PlatformDefinition, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { grantOf } from "@generalbusiness/dap-derive/testing";
import { standingData } from "../../derive/test/fixtures-standing.ts";
import { ARCHIVE_PIN_BYTES, ARCHIVE_PIN_KEY, ARCHIVE_SCOPE_METADATA_BYTES, readArchivePin } from "../src/archive-pin.ts";
import { controls } from "../src/testing.ts";
import { wired } from "./outside.ts";
import { START, at, objectOf, rita, stubOf } from "./support.ts";

async function fixture(entries = 8) {
  const named = "platform:task@1" as PlatformDefinition, data = standingData();
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { source: "archive admission fixture" }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: named, creator: null, cause: intentDigest(founding), ordinal: 0 }, name = scopeIdOf(seed);
  controls(name, START).bounds = { ...PROPOSED_BOUNDS, scopeEntries: entries };
  wired.set(name, () => ({ definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: version => version === named ? { data, rules: { "settle-counter": { place: "effect", most: 1, run: () => [] } } } : null } }));
  return { name, seed, answer: await stubOf(name).create(signIntent(founding, rita.secret), named), close: () => wired.delete(name) };
}
const metadata = (name: string) => runInDurableObject(objectOf(name), (_instance, state) => state.storage.sql.exec<{ k: string; v: string }>("SELECT k, v FROM meta ORDER BY k").toArray());
const put = (name: string, key: string, value: string | null) => runInDurableObject(objectOf(name), (_instance, state) => {
  if (value === null) state.storage.sql.exec("DELETE FROM meta WHERE k = ?", key);
  else state.storage.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", key, value);
});
const read = (name: string, scope: ScopeRef, noOctets = false) => runInDurableObject(objectOf(name), (_instance, state) => {
  const queries: string[] = [], forbidden: string[] = [];
  const pin = readArchivePin({ exec(query, ...args) {
    queries.push(query);
    if (!query.startsWith("SELECT ") || /FROM entry/.test(query) && query !== "SELECT hash FROM entry WHERE seq = 0 AND typeof(hash) = 'text' AND octet_length(hash) = 71 LIMIT 1") {
      forbidden.push(query); throw new Error("fixture blocks a non-metadata read/write");
    }
    if (noOctets && /octet_length/.test(query)) throw new Error("scripted missing SQLite support");
    return state.storage.sql.exec(query, ...args);
  } }, scope);
  // This assertion must be outside readArchivePin's fail-closed catch.
  expect(forbidden).toEqual([]);
  return { pin, queries };
});

test("a native genesis writes bound seed/pin metadata atomically; four bounded metadata-only reads survive restart and never read genesis bytes", async () => {
  const f = await fixture();
  try {
    if (f.answer.answer !== "accepted") return expect.fail(JSON.stringify(f.answer));
    const scope = f.answer.receipt.fact.at, before = await metadata(f.name), result = await read(f.name, scope);
    expect(result.pin).toEqual({ format: "artroom-archive-pin-1", at: scope, seed: f.seed, genesis: f.answer.receipt.fact.hash });
    expect(result.queries).toHaveLength(4);
    expect(result.queries[0]).toContain("octet_length(v)");
    expect(await metadata(f.name)).toEqual(before);
    await evictDurableObject(objectOf(f.name));
    expect(await read(f.name, scope)).toEqual(result);
    expect(await metadata(f.name)).toEqual(before);
  } finally { f.close(); }
});

test("missing historical, malformed, forged definition/seed/incarnation/hash and oversized metadata refuse without a history-body fallback or write", async () => {
  const f = await fixture();
  try {
    if (f.answer.answer !== "accepted") return expect.fail(JSON.stringify(f.answer));
    const scope = f.answer.receipt.fact.at, original = await metadata(f.name), encoded = original.find(row => row.k === ARCHIVE_PIN_KEY)!.v, scopeBytes = original.find(row => row.k === "scope")!.v;
    const pin = JSON.parse(encoded);
    const invalid = [
      null, "not JSON", canonicalize({ ...pin, extra: true }), canonicalize({ ...pin, format: "unknown" }),
      canonicalize({ ...pin, at: { ...pin.at, inc: newIncarnation(new Uint8Array(16).fill(31)) } }),
      canonicalize({ ...pin, seed: { ...pin.seed, definition: "platform:task@2" } }),
      canonicalize({ ...pin, seed: { ...pin.seed, ordinal: 1 } }),
      canonicalize({ ...pin, genesis: "sha256:" + "f".repeat(64) }),
    ];
    for (const bytes of invalid) {
      await put(f.name, ARCHIVE_PIN_KEY, bytes);
      try { expect((await read(f.name, scope)).pin, String(bytes)).toBeNull(); }
      finally { await put(f.name, ARCHIVE_PIN_KEY, encoded); }
      expect(await metadata(f.name)).toEqual(original);
    }
    for (const [key, limit, restore] of [[ARCHIVE_PIN_KEY, ARCHIVE_PIN_BYTES, encoded], ["scope", ARCHIVE_SCOPE_METADATA_BYTES, scopeBytes]] as const) {
      await put(f.name, key, "x".repeat(limit + 1));
      try { const result = await read(f.name, scope); expect(result.pin).toBeNull(); expect(result.queries).toHaveLength(1); }
      finally { await put(f.name, key, restore); }
    }
    for (const changed of [
      { ...JSON.parse(scopeBytes), at: { ...scope, inc: newIncarnation(new Uint8Array(16).fill(33)) } },
      { ...JSON.parse(scopeBytes), genesis: { ...JSON.parse(scopeBytes).genesis, hash: "sha256:" + "d".repeat(64) } },
      { ...JSON.parse(scopeBytes), extra: "unsupported metadata" },
    ]) {
      await put(f.name, "scope", canonicalize(changed));
      try { expect((await read(f.name, scope)).pin).toBeNull(); }
      finally { await put(f.name, "scope", scopeBytes); }
    }
    const unsupported = await read(f.name, scope, true);
    expect(unsupported.pin).toBeNull(); expect(unsupported.queries).toHaveLength(1);
    const wrong = await read(f.name, { ...scope, inc: newIncarnation(new Uint8Array(16).fill(32)) });
    expect(wrong.pin).toBeNull(); expect(wrong.queries.some(query => /FROM entry/.test(query))).toBe(false);
    await runInDurableObject(objectOf(f.name), (_instance, state) => state.storage.sql.exec("UPDATE entry SET hash = ? WHERE seq = 0", "sha256:" + "e".repeat(64)).toArray());
    try { expect((await read(f.name, scope)).pin).toBeNull(); }
    finally { await runInDurableObject(objectOf(f.name), (_instance, state) => state.storage.sql.exec("UPDATE entry SET hash = ? WHERE seq = 0", f.answer.answer === "accepted" ? f.answer.receipt.fact.hash : "").toArray()); }
    expect(await metadata(f.name)).toEqual(original);
    // An ordinary accepted turn cannot silently backfill a historical
    // missing admission row. It also must not change genesis identity.
    await put(f.name, ARCHIVE_PIN_KEY, null);
    const signed = signIntent({ v: 1, to: scope, actor: rita.key, kind: "set", on: 0, expected: { on: 1 }, fields: { next: 1 }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) }, rita.secret);
    expect(await stubOf(f.name).submit(signed, [grantOf(rita, scope, ["set"])])).toMatchObject({ answer: "accepted" });
    expect((await read(f.name, scope)).pin).toBeNull();
    expect((await metadata(f.name)).some(row => row.k === ARCHIVE_PIN_KEY)).toBe(false);
    await put(f.name, ARCHIVE_PIN_KEY, encoded);
    expect((await read(f.name, scope)).pin).toEqual(pin);
  } finally { f.close(); }
});

test("B-minus-one genesis capacity rollback leaves neither entry nor admission pin; no implicit historical backfill", async () => {
  const f = await fixture(7);
  try {
    expect(f.answer).toMatchObject({ answer: "refused", reason: "scope-full" });
    const actual = await runInDurableObject(objectOf(f.name), (_instance, state) => ({ entries: state.storage.sql.exec("SELECT seq FROM entry").toArray(), pin: state.storage.sql.exec("SELECT k FROM meta WHERE k = ?", ARCHIVE_PIN_KEY).toArray() }));
    expect(actual).toEqual({ entries: [], pin: [] });
  } finally { f.close(); }
});
