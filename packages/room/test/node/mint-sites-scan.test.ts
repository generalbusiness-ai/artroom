/**
 * Mint lane C (request 5ff58c9a), test 6 of notes/2026-10-02-canonical-mint-ownership.md:
 * a source scan. Outside the harnesses, `measure/` and tests, only the files
 * below call Artifacts' token creation, each the stated number of times
 * (R-MINT-1). Every canonical mint goes through the mint ledger (`mints.ts`);
 * the others mint on repositories that are not the canonical one.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = decodeURIComponent(new URL("../../../../", import.meta.url).pathname);

/** The allowed callers: production source path, number of calls, and why. */
const ALLOWED: Readonly<Record<string, { readonly calls: number; readonly why: string }>> = {
  "packages/git/src/mints.ts": { calls: 1, why: "the canonical mint ledger: every canonical mint (R-MINT-1)" },
  "packages/git/src/workspace/workspaces.ts": { calls: 1, why: "a lane fork's workspace lease token (R-CRED-8), not a canonical mint" },
  "packages/git/src/snapshot/repos.ts": { calls: 1, why: "a snapshot repository's job token (R-CARRY-16), not a canonical mint" },
  "packages/git/src/publisher/client.ts": {
    calls: 1,
    why: "pending exception, request 02836f9a: the lane fork's read token for pinning (`withForkToken`), until the fork has its own ledger; never a canonical token",
  },
};

/**
 * A call of `createToken`: a property call, or an index of a value by the
 * name. Declarations (`createToken(scope?: …)`) and type references
 * (`RepoHandle["createToken"]`, a capitalized type name) are not calls.
 */
const CALL = /(?:\.|\?\.)\s*createToken\s*\(|(?:^|[^\w$])[a-z_$][\w$]*\s*\[\s*["'`]createToken["'`]\s*\]/g;

/** Every production source file: `packages/*\/src`, never `measure/`, `test/` or `test-workers/`. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(relative(ROOT, p).split("\\").join("/"));
    }
  };
  for (const pkg of readdirSync(join(ROOT, "packages"), { withFileTypes: true })) if (pkg.isDirectory()) {
    const src = join(ROOT, "packages", pkg.name, "src");
    try {
      walk(src);
    } catch {
      // a package without `src`
    }
  }
  return out.sort();
}

const callsIn = (text: string) => [...text.matchAll(CALL)].length;

describe("mint lane C (6): who calls createToken", () => {
  it("outside the harnesses, measure/ and tests, only the ledger, workspaces, snapshot repositories and the fork token in publisher/client.ts call createToken", () => {
    const files = sources();
    // The scan reaches the former canonical sites, and every package's source.
    for (const f of ["packages/room/src/core.ts", "packages/room/src/logremote.ts", "packages/room/src/jobs.ts", "packages/git/src/publisher/client.ts", "packages/git/src/landing/engine.ts"])
      expect(files).toContain(f);
    expect(files.length).toBeGreaterThan(100);
    const found: Record<string, number> = {};
    for (const f of files) {
      const n = callsIn(readFileSync(join(ROOT, f), "utf8"));
      if (n > 0) found[f] = n;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([f, a]) => [f, a.calls])));
  });

  it("publisher/client.ts: its one call is the fork token's (`withForkToken`), used once, for the lane's fork; its canonical tokens go through the ledger", () => {
    const text = readFileSync(join(ROOT, "packages/git/src/publisher/client.ts"), "utf8");
    const fork = /async function withForkToken[\s\S]*?\n}\n/.exec(text)?.[0] ?? "";
    expect(callsIn(fork)).toBe(1);
    expect(callsIn(text.replace(fork, ""))).toBe(0);
    expect([...text.matchAll(/withForkToken\s*(?:<[^>]*>)?\(/g)]).toHaveLength(2); // its definition and one use
    expect(text).toMatch(/withForkToken\(\s*forkRepo,/);
    for (const purpose of ["integrate:", "pin-objects:", "pin-ref:", "preview:"]) expect(text).toContain(`\`${purpose}`);
  });

  it("the scan's pattern finds the call shapes it names, and not a declaration", () => {
    expect(callsIn("await repo.createToken('read', 60)")).toBe(1);
    expect(callsIn("await repo?.createToken('read', 60)")).toBe(1);
    expect(callsIn("const f = repo['createToken']")).toBe(1);
    expect(callsIn("createToken(scope?: 'write' | 'read', ttl?: number): Promise<MintedToken>;")).toBe(0);
    expect(callsIn("let token: Awaited<ReturnType<RepoHandle[\"createToken\"]>>;")).toBe(0);
    expect(callsIn("async createToken(scope = 'write', ttl = 86400) {")).toBe(0);
  });
});
