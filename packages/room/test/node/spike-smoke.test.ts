import { describe, expect, it } from "vitest";
import { cleanupRun, combineCleanups, incarnationOf, isRepoRecord, isTokenRecord, outcomeOf, readListing, smokeOk, type Answer, type Api } from "../../measure/spike-smoke.mjs";

/**
 * Review 1b868265: the smoke run's cleanup has one explicit outcome, and it
 * takes part in the run's success. These run cleanupRun against a fake
 * Artifacts REST API (no live calls), including the checker's five
 * diagnostics: clean, delete refused, revoke refused, inventory refused and
 * a cleanup that throws.
 */

const CANON = "0123456789abcdef0123456789abcdef";
const FORK = `${CANON}--act_5_a8503d4b`;

type Fault = (method: string, path: string) => Answer | undefined | "throw" | null;

/** A fake Artifacts namespace: repositories with active tokens, and a fault hook that may answer first. */
function fakeArtifacts(opts: { repos?: Record<string, { id: string; scope: string; plaintext?: string }[]>; fault?: Fault; others?: string[] } = {}) {
  const repos = new Map(Object.entries(opts.repos ?? { [CANON]: [{ id: "tok-canonical", scope: "write", plaintext: "art_v2_x_canonicalsecret" }], [FORK]: [] }));
  for (const o of opts.others ?? []) repos.set(o, [{ id: `tok-${o}`, scope: "write" }]);
  const calls: string[] = [];
  const revoked = new Set<string>();
  const api: Api = async (method, path) => {
    calls.push(`${method} ${path}`);
    const f = opts.fault?.(method, path);
    if (f === "throw") throw new Error("inventory transport failure");
    if (f !== null && f !== undefined) return f;
    if (method === "GET" && path.startsWith("/repos?")) {
      const search = new URL(`https://x${path}`).searchParams.get("search") ?? "";
      return { success: true, result: [...repos.keys()].filter((n) => n.includes(search)).map((name) => ({ name })) };
    }
    const tokens = /^\/repos\/([^/]+)\/tokens\?/.exec(path);
    if (method === "GET" && tokens) return { success: true, result: (repos.get(tokens[1]!) ?? []).filter((t) => !revoked.has(t.id)) };
    const tok = /^\/tokens\/(.+)$/.exec(path);
    if (method === "DELETE" && tok) {
      revoked.add(tok[1]!);
      return { success: true };
    }
    const repo = /^\/repos\/([^/?]+)$/.exec(path);
    if (method === "DELETE" && repo) return repos.delete(repo[1]!) ? { success: true } : { success: false, errors: [{ code: 404, message: "not found" }] };
    return { success: false, errors: [{ message: `unexpected ${method} ${path}` }] };
  };
  return { api, calls, repos, revoked };
}

const run = (fake: ReturnType<typeof fakeArtifacts>, minted = new Map<string, string>()) => cleanupRun({ api: fake.api, canonical: CANON, expected: [CANON, FORK], minted });

describe("spike smoke cleanup (review 1b868265)", () => {
  it("clean: every token revoked, every repository deleted, the final inventory empty: ok", async () => {
    // Names the inventory's substring search also returns, which are not this run's.
    const fake = fakeArtifacts({ others: [`${CANON}-copy`, `old-${CANON}`] });
    const c = await run(fake);
    expect(c.ok).toBe(true);
    expect(c.unresolved).toEqual([]);
    expect(c.reposLeft).toEqual([]);
    expect(c.duties.map((d) => [d.duty, d.repo ?? null, d.outcome])).toEqual([
      ["inventory", null, "done"],
      ["list-tokens", CANON, "done"],
      ["revoke-token", CANON, "done"],
      ["delete-repo", CANON, "done"],
      ["list-tokens", FORK, "done"],
      ["delete-repo", FORK, "done"],
      ["final-inventory", null, "done"],
    ]);
    // Another run's repository is never touched, and no token value is kept.
    expect([...fake.repos.keys()]).toEqual([`${CANON}-copy`, `old-${CANON}`]);
    expect(JSON.stringify(c)).not.toContain("art_v2");
    expect(c.duties.find((d) => d.duty === "revoke-token")).toMatchObject({ token: "tok-canonical", meta: { id: "tok-canonical", scope: "write" } });
  });

  it("delete refused: not ok; the refusal names the repository, and the final inventory shows it left", async () => {
    const c = await run(fakeArtifacts({ fault: (m, p) => (m === "DELETE" && p === `/repos/${CANON}` ? { success: false, errors: [{ code: 403, message: "forbidden" }] } : undefined) }));
    expect(c.ok).toBe(false);
    expect(c.unresolved).toEqual([{ duty: "delete-repo", repo: CANON, outcome: "refused", detail: "403 forbidden" }]);
    expect(c.reposLeft).toEqual([CANON]);
    expect(smokeOk({ steps: [{ ok: true }], cleanup: c }, false)).toBe(false);
  });

  it("revoke refused: not ok, even though the repository was then deleted; the token ID is kept for the operator", async () => {
    const c = await run(fakeArtifacts({ fault: (m, p) => (m === "DELETE" && p.startsWith("/tokens/") ? { success: false, errors: [{ message: "refused" }] } : undefined) }));
    expect(c.ok).toBe(false);
    expect(c.reposLeft).toEqual([]);
    expect(c.unresolved).toEqual([expect.objectContaining({ duty: "revoke-token", repo: CANON, token: "tok-canonical", outcome: "refused" })]);
  });

  it("inventory refused: not ok, the remainder is unknown (null), not empty; the repositories the run knows it made are still cleaned", async () => {
    const fake = fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith("/repos?") ? { success: false, errors: [{ message: "forbidden" }] } : undefined) });
    const c = await run(fake);
    expect(c.ok).toBe(false);
    expect(c.reposLeft).toBeNull();
    expect(c.unresolved.map((d) => [d.duty, d.outcome])).toEqual([
      ["inventory", "refused"],
      ["final-inventory", "refused"],
    ]);
    expect(c.unresolved[0]).toMatchObject({ repos: [CANON, FORK] });
    expect(fake.repos.size).toBe(0);
  });

  it("cleanup throws (a transport failure on every call): not ok, recorded as unknown duties, and cleanupRun itself does not throw", async () => {
    const c = await run(fakeArtifacts({ fault: () => "throw" }), new Map([["tok-minted", CANON]]));
    expect(c.ok).toBe(false);
    expect(c.reposLeft).toBeNull();
    expect(c.unresolved.every((d) => d.outcome === "unknown" && d.detail === "inventory transport failure")).toBe(true);
    expect(c.unresolved.map((d) => d.duty)).toEqual(["revoke-minted-token", "inventory", "list-tokens", "delete-repo", "list-tokens", "delete-repo", "final-inventory"]);
  });

  it("an inventory that fills its page proves nothing, even if everything it listed is then cleaned", async () => {
    const forks = Array.from({ length: 199 }, (_, i) => `${CANON}--act_${i}_x`);
    const fake = fakeArtifacts({ repos: Object.fromEntries([CANON, ...forks].map((n) => [n, []])) });
    const c = await cleanupRun({ api: fake.api, canonical: CANON, expected: [CANON] });
    expect(c.ok).toBe(false);
    expect(c.duties[0]).toMatchObject({ duty: "inventory", outcome: "unknown", detail: "incomplete listing" });
  });

  it("an inventory that fills its page, or reports a larger total, proves nothing: not ok", async () => {
    const full = { success: true, result: Array.from({ length: 200 }, (_, i) => ({ name: `${CANON}--act_${i}_x` })) };
    expect((await run(fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith("/repos?") ? full : undefined) }))).ok).toBe(false);
    const partial = { success: true, result: [], result_info: { total_count: 3 } };
    const c = await run(fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith("/repos?") ? partial : undefined) }));
    expect(c.ok).toBe(false);
    expect(c.reposLeft).toBeNull();
    expect(c.unresolved[0]).toMatchObject({ duty: "inventory", outcome: "unknown", detail: "incomplete listing" });
  });

  it("a token listing refused or answered without a success field: not ok, and the repository is still deleted", async () => {
    for (const answer of [{ success: false, errors: [{ message: "no" }] }, {}]) {
      const fake = fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith(`/repos/${CANON}/tokens`) ? answer : undefined) });
      const c = await run(fake);
      expect(c.ok).toBe(false);
      expect(c.unresolved).toEqual([expect.objectContaining({ duty: "list-tokens", repo: CANON, outcome: answer.success === false ? "refused" : "unknown" })]);
      expect(fake.repos.has(CANON)).toBe(false);
    }
  });

  it("a deletion answered as success but still listed by the final inventory: not ok, with the repository named", async () => {
    const fake = fakeArtifacts();
    const api: Api = async (m, p) => (m === "DELETE" && p === `/repos/${FORK}` ? { success: true } : fake.api(m, p));
    const c = await cleanupRun({ api, canonical: CANON, expected: [CANON, FORK] });
    expect(c.ok).toBe(false);
    expect(c.unresolved).toEqual([]);
    expect(c.reposLeft).toEqual([FORK]);
  });

  it("a token the run minted and did not see revoked is revoked again; refused, it stays unresolved by ID", async () => {
    const minted = new Map([["tok-minted", CANON]]);
    const ok = await run(fakeArtifacts(), minted);
    expect(ok.ok).toBe(true);
    expect(minted.size).toBe(0);
    const again = new Map([["tok-minted", CANON]]);
    const c = await run(fakeArtifacts({ fault: (m, p) => (m === "DELETE" && p === "/tokens/tok-minted" ? { success: false, errors: [{ message: "nope" }] } : undefined) }), again);
    expect(c.ok).toBe(false);
    expect(c.unresolved).toEqual([expect.objectContaining({ duty: "revoke-minted-token", repo: CANON, token: "tok-minted", outcome: "refused" })]);
    expect(again.has("tok-minted")).toBe(true);
  });

  it("no canonical repository (the draft failed): nothing to clean, ok", async () => {
    const fake = fakeArtifacts();
    const c = await cleanupRun({ api: fake.api, canonical: null });
    expect(c).toMatchObject({ ok: true, duties: [], reposLeft: [] });
    expect(fake.calls).toEqual([]);
  });

  it("smokeOk: the run succeeds only with every step passed, main finished, and cleanup all done", () => {
    const done = { ok: true };
    expect(smokeOk({ steps: [{ ok: true }], cleanup: done }, false)).toBe(true);
    expect(smokeOk({ steps: [{ ok: true }], cleanup: { ok: false } }, false)).toBe(false);
    expect(smokeOk({ steps: [{ ok: true }], cleanup: null }, false)).toBe(false);
    expect(smokeOk({ steps: [{ ok: true }], cleanup: done }, true)).toBe(false);
    expect(smokeOk({ steps: [{ ok: true }, { ok: false }], cleanup: done }, false)).toBe(false);
    expect(smokeOk({ steps: [], cleanup: done }, false)).toBe(false);
  });

  // Review 2485e992: a record without a usable identity makes its listing unknown; it is never filtered into apparent absence.
  const malformed: unknown[] = [{}, null, 7, "x", [], { name: "" }, { name: 5 }, { name: null }, { name: "a/b" }];

  it("2485e992: the checker's case: both inventories answer [{}] while the canonical repository is present: not ok, reposLeft null, and the known repositories are still deleted", async () => {
    const fake = fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith("/repos?") ? { success: true, result: [{}] } : undefined) });
    const c = await run(fake);
    expect(c.ok).toBe(false);
    expect(c.reposLeft).toBeNull();
    expect(c.unresolved.map((d) => [d.duty, d.outcome, d.detail])).toEqual([
      ["inventory", "unknown", "a record without a usable identity"],
      ["final-inventory", "unknown", "a record without a usable identity"],
    ]);
    expect(fake.calls.filter((x) => x.startsWith("DELETE /repos/"))).toEqual([`DELETE /repos/${CANON}`, `DELETE /repos/${FORK}`]);
    expect(smokeOk({ steps: [{ ok: true }], cleanup: c }, false)).toBe(false);
  });

  it("2485e992: every kind of malformed repository record, alone or mixed with valid ones, makes the inventory unknown and the run not ok", async () => {
    for (const bad of malformed) {
      for (const result of [[bad], [{ name: CANON }, bad], [bad, { name: FORK }]]) {
        const fake = fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith("/repos?") ? { success: true, result } : undefined) });
        const c = await run(fake);
        expect(c.ok, JSON.stringify(result)).toBe(false);
        expect(c.reposLeft).toBeNull();
        expect(c.duties[0]).toMatchObject({ duty: "inventory", outcome: "unknown" });
        // The fallback cleans the known repositories, not what the malformed listing named.
        expect(fake.repos.has(CANON) || fake.repos.has(FORK)).toBe(false);
      }
    }
  });

  it("2485e992: a malformed token record, alone or mixed, makes the token listing unknown; no listed token ID is revoked from it, and the repository is still deleted", async () => {
    const tokenBad: unknown[] = [{}, null, 7, "x", { id: "" }, { id: 5 }, { id: null }, { id: "../repos/x" }, { id: "a b" }];
    for (const bad of tokenBad) {
      for (const result of [[bad], [{ id: "tok-ok", scope: "write" }, bad]]) {
        const fake = fakeArtifacts({ fault: (m, p) => (m === "GET" && p.startsWith(`/repos/${CANON}/tokens`) ? { success: true, result } : undefined) });
        const c = await run(fake);
        expect(c.ok, JSON.stringify(result)).toBe(false);
        expect(c.unresolved).toEqual([expect.objectContaining({ duty: "list-tokens", repo: CANON, outcome: "unknown", detail: "a record without a usable identity" })]);
        expect(fake.calls.filter((x) => x.startsWith("DELETE /tokens/"))).toEqual([]);
        expect(fake.repos.has(CANON)).toBe(false);
      }
    }
  });

  it("isRepoRecord and isTokenRecord need a usable identity", () => {
    expect(isRepoRecord({ name: CANON })).toBe(true);
    expect(isRepoRecord({ name: FORK, remote: "https://x" })).toBe(true);
    for (const bad of malformed) expect(isRepoRecord(bad)).toBe(false);
    expect(isTokenRecord({ id: "vld1c20kwx4mwnlv", scope: "write" })).toBe(true);
    for (const bad of [{}, null, 7, { id: "" }, { id: 5 }, { id: "a/b" }]) expect(isTokenRecord(bad)).toBe(false);
  });

  it("outcomeOf and readListing classify answers strictly", () => {
    expect(outcomeOf({ success: true })).toBe("done");
    expect(outcomeOf({ success: false })).toBe("refused");
    expect(outcomeOf({})).toBe("unknown");
    expect(outcomeOf(undefined)).toBe("unknown");
    expect(outcomeOf({ success: "true" })).toBe("unknown");
    const any = () => true;
    expect(readListing({ success: true, result: [1] }, 10, any)).toEqual({ outcome: "done", items: [1] });
    expect(readListing({ success: true, result: [] }, 10, isRepoRecord)).toEqual({ outcome: "done", items: [] });
    expect(readListing({ success: true }, 10, any)).toMatchObject({ outcome: "unknown", items: null });
    expect(readListing({ success: false, result: [] }, 10, any)).toMatchObject({ outcome: "refused", items: null });
    expect(readListing({ success: true, result: [{ name: "a" }, {}] }, 10, isRepoRecord)).toMatchObject({ outcome: "unknown", items: null });
  });
});

describe("spike smoke: a public room's repository is an incarnation of its identity (reviews 3eb7bc44 and 700b74ea)", () => {
  // `genesis.repo` names the identity, `<namespace>/<base>`; the repository is `<base>-<step>`.
  const SEALED = `${CANON}-7`;
  const ABANDONED = `${CANON}-3`;
  const SEALED_FORK = `${SEALED}--act_5_a8503d4b`;

  it("incarnationOf: the latest incarnation, never the base name, a fork or a lookalike", () => {
    expect(incarnationOf(CANON, [CANON, ABANDONED, SEALED, SEALED_FORK, `${CANON}-copy`, `old-${CANON}-99`])).toBe(SEALED);
    expect(incarnationOf(CANON, [CANON, FORK])).toBeNull();
    expect(incarnationOf(CANON, [`${CANON}-2`, `${CANON}-10`])).toBe(`${CANON}-10`);
  });

  it("cleanup of a public room reaches every repository named from its base: the adopted base name, each incarnation and their forks; nothing else", async () => {
    const fake = fakeArtifacts({
      repos: { [CANON]: [{ id: "tok-legacy", scope: "write" }], [ABANDONED]: [{ id: "tok-abandoned", scope: "write" }], [SEALED]: [{ id: "tok-pub", scope: "write" }], [SEALED_FORK]: [] },
      others: [`${CANON}-copy`, `old-${CANON}`],
    });
    const c = await cleanupRun({ api: fake.api, canonical: CANON, expected: [SEALED, SEALED_FORK], minted: new Map(), incarnations: true });
    expect(c.ok).toBe(true);
    expect(c.reposLeft).toEqual([]);
    expect(c.duties.filter((d) => d.duty === "delete-repo").map((d) => d.repo).sort()).toEqual([CANON, ABANDONED, SEALED, SEALED_FORK].sort());
    expect([...fake.repos.keys()].sort()).toEqual([`${CANON}-copy`, `old-${CANON}`].sort());
    expect([...fake.revoked].sort()).toEqual(["tok-abandoned", "tok-legacy", "tok-pub"]);
  });
});


describe("9f81f372: one cleanup outcome across the public room and every imported repository", () => {
  const done = { ok: true, duties: [{ duty: "inventory", outcome: "done" as const }], unresolved: [], reposLeft: [] };
  it("ok only if every part is; duties, unresolved duties and repositories left carry their namespace", () => {
    const c = combineCleanups({}, [["gitseq-spike", done], ["gitseq-spike-import", done], ["gitseq-spike-import", done]]);
    expect(c).toMatchObject({ ok: true, reposLeft: [], unresolved: [] });
    expect(c.duties.map((d) => d.namespace)).toEqual(["gitseq-spike", "gitseq-spike-import", "gitseq-spike-import"]);
    const left = { ok: false, duties: [], unresolved: [{ duty: "delete-repo", repo: "r", outcome: "refused" as const }], reposLeft: ["r"] };
    const bad = combineCleanups({}, [["gitseq-spike", done], ["gitseq-spike-import", left]]);
    expect(bad).toMatchObject({ ok: false, reposLeft: ["gitseq-spike-import/r"], unresolved: [{ namespace: "gitseq-spike-import", duty: "delete-repo" }] });
  });
  it("one part's unknown remainder makes the whole remainder unknown, never empty; no parts is not ok", () => {
    const unknown = { ok: false, duties: [], unresolved: [{ duty: "final-inventory", outcome: "unknown" as const }], reposLeft: null };
    expect(combineCleanups({}, [["gitseq-spike", done], ["gitseq-spike-import", unknown]]).reposLeft).toBeNull();
    expect(combineCleanups({}, []).ok).toBe(false);
  });
});
