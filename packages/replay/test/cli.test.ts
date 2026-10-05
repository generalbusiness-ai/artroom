import { expect, test } from "vitest";
import type { Digest, ScopeId } from "@generalbusiness/artroom-contract";
import { main, type Fetch, type MemorySource } from "../src/index.ts";
import { rewrite, sourceOf, world } from "./world.ts";

/** A scope service's two verifier routes, answered from histories in memory, in the form the Worker answers them. */
function service(source: MemorySource): Fetch {
  return async (url) => {
    const [, scope, what, kind, digest] = /^https:\/\/scopes\.test\/v1\/scopes\/([^/?]+)\/(log|retained)(?:\/([^/]+)\/([^/?]+))?/.exec(url)!;
    const body = async () => {
      if (what === "retained") {
        const got = await source.retained(scope as ScopeId, kind as "entry", decodeURIComponent(digest!) as Digest);
        return got.ok ? { ok: true, value: got.input, complete: true } : got;
      }
      const got = await source.page(scope as ScopeId, Number(new URL(url).searchParams.get("cursor")));
      if (!got.ok) return got;
      const { head, next, ...value } = got.page;
      return { ok: true, at: head, value, complete: next === null, ...(next === null ? {} : { next: String(next) }) };
    };
    const answer = await body();
    return { status: answer.ok ? 200 : 404, text: () => Promise.resolve(JSON.stringify(answer)) };
  };
}

async function run(source: MemorySource, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (text) => out.push(text), err: (text) => err.push(text), fetch: service(source) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("the command prints the report of a consistent history in plain English and exits 0; a command it cannot read as one exits 2 with the usage", async () => {
  const w = world();
  const good = await run(sourceOf(w), "https://scopes.test/", w.I.scope.scope, "--head", `2:${w.I.entries[2]!.hash}`);
  expect([good.code, good.err]).toEqual([0, ""]);
  expect(good.out).toMatch(/^Result: consistent, for the mode, target, coverage and trusts stated below\.\nMode: replay\./);
  expect(good.out).toContain(`Target: ${w.I.scope.scope}, incarnation ${w.I.scope.inc}, lane, through entry 2 (${w.I.entries[2]!.hash}).`);
  expect(good.out).toContain("Foreign facts: 7 shown by replay of their source scope, 0 taken from an anchor, 0 missing.");
  expect(await run(sourceOf(w), "https://scopes.test/", "not a scope")).toMatchObject({ code: 2, out: "", err: expect.stringMatching(/^the second argument is not a scope ID\nusage: artroom-replay /) });
});

test("the command exits 1 for a history that is not consistent, and with --json prints the report as data, with the entry it names", async () => {
  const w = world();
  rewrite(w.I, 2, (entry) => { entry.effects[0].state = "removed"; });
  const bad = await run(sourceOf(w), "https://scopes.test", w.I.scope.scope, "--mode", "replay", "--json");
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.out)).toMatchObject({ report: { mode: "replay", result: "mismatch", at: { at: w.I.scope, seq: 2 } }, why: "the recorded effects are not the ones derived again" });
});
