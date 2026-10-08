import { expect, test } from "vitest";
import type { Entry, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { entryHash, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { command, memoryStore } from "../src/index.ts";

// Invariant: `verify --all` cannot report a whole-room result when creation discovery exhausts its page bound with a cursor left.
// STAND-IN service: typed summary/history replies and hand-made entries which no scope judged. The command and its bounded,
// signed-read HTTP transport are real. This witnesses discovery coverage, not admission, authorization or historical replay.
test("verify --all refuses incomplete room discovery at its page bound and retains the exact final cursor, after following earlier cursors", async () => {
  const seed: Seed = { v: 1, kind: "directory", definition: "platform:directory@2", creator: null, cause: textDigest("fixture directory"), ordinal: 0 };
  const directory: ScopeRef = { kind: "directory", scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(1)) };
  const membership: ScopeRef = { ...directory, kind: "membership", scope: scopeIdOf({ ...seed, kind: "membership" }) };
  const time = "2099-01-01T00:00:00Z";
  const entries: Entry[] = [0, 1, 2].map((seq) => ({ v: 1, at: directory, seq, prev: seq === 0 ? null : textDigest(`previous ${seq}`), time, clamped: false, epoch: 0, input: { type: "checkpoint", through: 0, state: textDigest("fixture state") }, uses: [], prepared: [], effects: [], sends: [] }));
  const head = { seq: 2, hash: entryHash(entries[2]!) };
  for (const limit of [1, 2]) {
    const store = memoryStore();
    await store.keep("device", new Uint8Array(32).fill(2));
    await store.save({ v: 1, service: "https://service.test", key: "device", repository: { directory, membership, rules: directory.scope, destination: directory.scope } });
    const cursors: (string | null)[] = [];
    const fetch: Fetch = async (url, init) => {
      const address = new URL(url);
      let body: unknown;
      if (address.pathname.endsWith("/sessions")) body = { ok: false, reason: "sessions-unavailable" };
      else if (address.pathname === `/v1/scopes/${directory.scope}`) body = { ok: true, at: head, complete: true, value: { scope: directory, status: "active", definition: seed.definition, time, items: [], counts: [] } };
      else if (address.pathname === `/v1/scopes/${directory.scope}/history`) {
        expect(init?.headers?.["authorization"]).toMatch(/^Signed /);
        const cursor = address.searchParams.get("cursor");
        cursors.push(cursor);
        const seq = cursor === null ? 0 : Number(cursor);
        body = { ok: true, at: head, complete: false, value: [{ entry: entries[seq], hash: entryHash(entries[seq]!) }], next: String(seq + 1) };
      } else throw new Error(`Unexpected read after incomplete discovery: ${address.pathname}`);
      return new Response(JSON.stringify(body)) as never;
    };
    const outcome = await command({ store, fetch, historyPages: limit, now: () => Date.parse(time) }, ["verify", "--all"]);
    expect(outcome).toEqual({ code: 1, lines: [`Incomplete: room discovery for ${directory.scope} reached ${limit} history pages; next cursor "${limit}". The whole room was not verified.`] });
    expect(cursors).toEqual(limit === 1 ? [null] : [null, "1"]);
  }
});
