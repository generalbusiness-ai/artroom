import { expect, test, vi } from "vitest";
import type { Digest, Entry, ScopeId } from "@generalbusiness/artroom-contract";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SourceError, httpSource, main, verify, type Fetch, type MemoryScope, type MemorySource } from "../src/index.ts";
import { rewrite, sourceOf, world } from "./world.ts";

/** A scope service's two verifier routes, answered from histories in memory, in the form the Worker answers them. */
function service(source: MemorySource): Fetch {
  return async (url) => {
    const [, scope, what, kind, digest] = /^https:\/\/scopes\.test\/v1\/scopes\/([^/?]+)\/(log|retained)(?:\/([^/]+)\/([^/?]+))?/.exec(url)!;
    const body = async () => {
      if (what === "retained") {
        const got = await source.retained(scope as ScopeId, kind as "entry", decodeURIComponent(digest!) as Digest, { bytes: Infinity });
        return got.ok ? { ok: true, value: got.input, complete: true } : got;
      }
      const got = await source.page(scope as ScopeId, Number(new URL(url).searchParams.get("cursor")), { bytes: Infinity, entries: Infinity });
      if (!got.ok) return got;
      const { head, next, ...value } = got.page;
      return { ok: true, at: head, value, complete: next === null, ...(next === null ? {} : { next: String(next) }) };
    };
    const answer = await body();
    return { status: answer.ok ? 200 : 404, body: new Response(JSON.stringify(answer)).body };
  };
}

async function run(source: MemorySource, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (text) => out.push(text), err: (text) => err.push(text), fetch: service(source) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/**
 * An `--anchor` for each foreign fact that the entries of one scope use. The fixture histories were written under the test
 * authority of derive's fixtures, a STAND-IN whose grants hold no freshness proof. The command never reads such a grant as one.
 * The scope I holds no act, so with every fact that it uses anchored, no entry with such a grant is derived again.
 */
function anchored(scope: MemoryScope): string[] {
  const facts = scope.entries.flatMap(({ bytes }) => {
    const { input, uses } = JSON.parse(bytes) as Entry;
    return [...uses.map((use) => use.fact), ...(input.type === "delivery" ? [input.from] : []), ...(input.type === "genesis" && input.source ? [input.source] : [])];
  });
  return [...new Set(facts.map((fact) => `${fact.at.scope}:${fact.seq}:${fact.hash}`))].flatMap((anchor) => ["--anchor", anchor]);
}

test("the command prints the report of a consistent history in plain English and exits 0; a command it cannot read as one exits 2 with the usage; and it reads no grant that holds no freshness proof as a grant", async () => {
  const w = world();
  const good = await run(sourceOf(w), "https://scopes.test/", w.I.scope.scope, "--head", `2:${w.I.entries[2]!.hash}`, ...anchored(w.I));
  expect([good.code, good.err]).toEqual([0, ""]);
  expect(good.out).toMatch(/^Result: consistent, for the mode, target, coverage and trusts stated below\.\nMode: replay\./);
  expect(good.out).toContain(`Target: ${w.I.scope.scope}, incarnation ${w.I.scope.inc}, lane, through entry 2 (${w.I.entries[2]!.hash}).`);
  expect(good.out).toContain("Foreign facts: 0 shown by replay of their source scope, 3 taken from an anchor, 0 missing.");
  // The scope contract, section 15.6n, on the I3 delta E8: a grant without a freshness proof is no grant. Without the anchors the
  // replay reaches the desk's first act, which the fixture's stand-in authority granted. The command reports it, and exits 1.
  const unproven = await run(sourceOf(w), "https://scopes.test/", w.I.scope.scope, "--json");
  expect([unproven.code, JSON.parse(unproven.out)]).toMatchObject([1, { report: { result: "mismatch", at: { at: w.D.scope, seq: 1 } }, why: "the recorded grant holds no freshness proof of a key's standing: it is no grant" }]);
  expect(await run(sourceOf(w), "https://scopes.test/", "not a scope")).toMatchObject({ code: 2, out: "", err: expect.stringMatching(/^the second argument is not a scope ID\nusage: artroom-replay /) });
});

test("the command exits 1 for a history that is not consistent, and with --json prints the report as data, with the entry it names", async () => {
  const w = world();
  rewrite(w.I, 2, (entry) => { entry.effects[0].state = "removed"; });
  const bad = await run(sourceOf(w), "https://scopes.test", w.I.scope.scope, "--mode", "replay", "--json", ...anchored(w.I));
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.out)).toMatchObject({ report: { mode: "replay", result: "mismatch", at: { at: w.I.scope, seq: 2 } }, why: "the recorded effects are not the ones derived again" });
});

test("a reply from a service is taken in as raw bytes, only as far as the read allows; a budget that does not allow the first read leaves nothing to report on", async () => {
  const w = world();
  const id = w.I.scope.scope;
  // A body with no end: it is cancelled at the chunk that passes what the read allows, and nothing of it is parsed or kept.
  let sent = 0;
  const endless: Fetch = () => Promise.resolve({ status: 200, body: new ReadableStream<Uint8Array>({ pull(c) { sent += 1024; c.enqueue(new Uint8Array(1024).fill(32)); } }, { highWaterMark: 0 }) });
  expect([await httpSource("https://scopes.test", { fetch: endless }).page(id, 0, { bytes: 4096, entries: 10 }), sent]).toEqual([{ ok: false, reason: "too-large" }, 5120]);
  // A page with more entries than the read allows is not kept either.
  expect(await httpSource("https://scopes.test", { fetch: service(sourceOf(w, 3)) }).page(id, 0, { bytes: 1e6, entries: 2 })).toEqual({ ok: false, reason: "too-large" });
  await expect(verify(sourceOf(w), { mode: "integrity", scope: id, limits: { scopes: 0 } })).rejects.toThrow(SourceError);
});

// The deadline is driven with fake timers: the test advances it by hand and resolves the pending read itself, and nothing waits on the clock.
test("a read of a service is given up at its deadline: it is a read error and no report, and what a read answers after the deadline is not taken, decoded or parsed, and no other read follows", async () => {
  vi.useFakeTimers();
  try {
    const w = world();
    const id = w.I.scope.scope;
    // A service that never answers: the read is given up after its deadline, here 10 milliseconds.
    const silent: Fetch = () => new Promise(() => undefined);
    const verifying = expect(verify(httpSource("https://scopes.test", { fetch: silent, seconds: 0.01 }), { mode: "integrity", scope: id })).rejects.toThrow(SourceError);
    await vi.advanceTimersByTimeAsync(10);
    await verifying;
    // A fetch that ignores the abort signal, with a read that answers after the deadline: the read is `timeout`, what came late is not taken, and no other read follows.
    let reads = 0;
    let cancels = 0;
    let answer = (_chunk: { done: boolean; value?: Uint8Array }): void => undefined;
    const deaf: Fetch = () => Promise.resolve({ status: 200, body: { getReader: () => ({ read: () => { reads++; return new Promise((resolve) => { answer = resolve; }); }, cancel: () => { cancels++; return new Promise(() => undefined); } }) } });
    const paging = httpSource("https://scopes.test", { fetch: deaf, seconds: 0.01 }).page(id, 0, { bytes: 4096, entries: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await paging).toEqual({ ok: false, reason: "timeout" });
    answer({ done: false, value: new TextEncoder().encode("{") });
    await vi.advanceTimersByTimeAsync(0);
    expect([reads, cancels]).toEqual([1, 1]);
  } finally {
    vi.useRealTimers();
  }
});

test("the executable runs under the Node that runs these tests: with no argument it prints the usage and exits 2", () => {
  const ran = spawnSync(process.execPath, [fileURLToPath(new URL("../src/bin.ts", import.meta.url))], { encoding: "utf8" });
  expect([ran.status, ran.stdout, ran.stderr]).toEqual([2, "", expect.stringMatching(/^give the service URL and the scope ID\nusage: artroom-replay /)]);
});

// Invariant: a target whose history the service refuses is no crash and no report: the read error says "cannot be read" and the
// service's own reason, and the command exits 2. A reader given as a function is asked for each read, by scope, read and argument.
test("a history the service refuses to read is a read error that names the service's reason, and the command exits 2 with it; a reader function gives the header of each read", async () => {
  const w = world();
  const id = w.I.scope.scope;
  const asked: string[] = [];
  const forbidding: Fetch = (url, init) => {
    asked.push(`${url.replace("https://scopes.test", "")} ${init?.headers?.["authorization"] ?? "-"}`);
    return Promise.resolve({ status: 403, body: new Response(JSON.stringify({ ok: false, reason: "forbidden" })).body });
  };
  const reader = (scope: ScopeId, read: "log" | "retained", arg: string) => `Signed ${scope}:${read}:${arg}`;
  const refused: unknown = await verify(httpSource("https://scopes.test", { fetch: forbidding, reader }), { mode: "integrity", scope: id }).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(SourceError);
  expect([(refused as SourceError).reason, (refused as SourceError).message]).toEqual(["forbidden", `the history of ${id} cannot be read: forbidden`]);
  expect(asked).toEqual([`/v1/scopes/${id}/log?cursor=0 Signed ${id}:log:0`]);
  const err: string[] = [];
  const code = await main(["https://scopes.test", id], { out: () => undefined, err: (text) => err.push(text), fetch: forbidding });
  expect([code, err]).toEqual([2, [`read error: the history of ${id} cannot be read: forbidden`]]);
});
