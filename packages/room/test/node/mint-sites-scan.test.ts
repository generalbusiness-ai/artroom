/**
 * Mint lane C (request 5ff58c9a), test 6 of notes/2026-10-02-canonical-mint-ownership.md:
 * a source scan. Outside the harnesses, `measure/` and tests, only the files
 * below name Artifacts' token creation at all (R-MINT-1). Every canonical
 * mint goes through the mint ledger (`mints.ts`); the others mint on
 * repositories that are not the canonical one.
 *
 * The rule is the identifier, not a call shape: any occurrence of
 * `createToken` in production source fails, whether a call, an optional
 * call, an index, an alias, a destructuring or a comment, except in the
 * allowed files (each with its exact number of occurrences) and in three
 * exempt places checked separately: generated `.d.ts` files, the `RepoHandle`
 * declaration in `packages/git/src/artifacts.ts`, and the in-memory Artifacts
 * fake (`packages/room/src/memory/`), which defines the method for tests and
 * never reaches one. A name built at runtime (`"create" + "Token"`) is out of
 * reach of any scan.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = decodeURIComponent(new URL("../../../../", import.meta.url).pathname);

/** The allowed files: occurrences of the identifier (calls, types and comments), and why. */
const ALLOWED: Readonly<Record<string, { readonly occurrences: number; readonly why: string }>> = {
  "packages/git/src/mints.ts": { occurrences: 2, why: "the canonical mint ledger: every canonical mint (R-MINT-1); its repository type and its one call" },
  "packages/git/src/workspace/workspaces.ts": { occurrences: 2, why: "a lane fork's workspace lease token (R-CRED-8), not a canonical mint; a type and one call" },
  "packages/git/src/snapshot/repos.ts": { occurrences: 1, why: "a snapshot repository's job token (R-CARRY-16), not a canonical mint; one call" },
  "packages/git/src/publisher/client.ts": {
    occurrences: 2,
    why: "pending exception, request 02836f9a: the lane fork's read token for pinning (`withForkToken`: a comment and one call), until the fork has its own ledger; never a canonical token",
  },
};
const DECLARATION = "packages/git/src/artifacts.ts";
const FAKE = "packages/room/src/memory/";

const NAME = /\bcreateToken\b/g;
/** Reaching the method: a property access (`.`, `?.`), an index by its name, or a destructuring that takes it. */
const REACH = /(?:\?\.|\.)\s*createToken\b|\[\s*["'`]createToken["'`]\s*\]|\{[^{}]*\bcreateToken\b[^{}]*\}\s*=/g;

const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;

/** What breaks the rule in these files: one line each, or none. */
function violations(files: readonly { readonly path: string; readonly text: string }[]): string[] {
  const out: string[] = [];
  for (const { path, text } of files) {
    const n = count(text, NAME);
    const allowed = ALLOWED[path];
    if (path.endsWith(".d.ts")) continue; // generated declarations
    if (path === DECLARATION) {
      const lines = text.split("\n").filter((l) => /\bcreateToken\b/.test(l));
      if (n !== 1 || !/^\s*createToken\(scope\?: "write" \| "read", ttl\?: number\): Promise<MintedToken>;\s*$/.test(lines[0] ?? "")) out.push(`${path}: only the RepoHandle declaration may name createToken (found ${n})`);
    } else if (path.startsWith(FAKE)) {
      if (count(text, REACH) > 0) out.push(`${path}: the in-memory fake reaches createToken`);
    } else if (allowed) {
      if (n !== allowed.occurrences) out.push(`${path}: ${n} occurrences of createToken, allowed ${allowed.occurrences}`);
    } else if (n > 0) out.push(`${path}: ${n} occurrence(s) of createToken outside the allowed files`);
  }
  return out;
}

/** Every production source file: `packages/*\/src`, never `measure/`, `test/` or `test-workers/`. */
function sources(): { path: string; text: string }[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.(ts|tsx|js|mjs|cjs|jsx)$/.test(e.name)) out.push(relative(ROOT, p).split("\\").join("/"));
    }
  };
  for (const pkg of readdirSync(join(ROOT, "packages"), { withFileTypes: true }))
    if (pkg.isDirectory()) {
      try {
        walk(join(ROOT, "packages", pkg.name, "src"));
      } catch {
        // a package without `src`
      }
    }
  return out.sort().map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}

describe("mint lane C (6): who names createToken", () => {
  it("outside the harnesses, measure/ and tests, only the ledger, workspaces, snapshot repositories and the fork token in publisher/client.ts name createToken, each as often as allowed", () => {
    const files = sources();
    // The scan reaches the former canonical sites, every allowed and exempt file, and every package's source.
    for (const f of ["packages/room/src/core.ts", "packages/room/src/logremote.ts", "packages/room/src/jobs.ts", "packages/git/src/landing/engine.ts", DECLARATION, "packages/room/src/memory/artifacts.ts", ...Object.keys(ALLOWED)])
      expect(files.map((x) => x.path)).toContain(f);
    expect(files.length).toBeGreaterThan(100);
    expect(violations(files)).toEqual([]);
  });

  it("publisher/client.ts: its one call is the fork token's (`withForkToken`), used once, for the lane's fork; its canonical tokens go through the ledger", () => {
    const text = readFileSync(join(ROOT, "packages/git/src/publisher/client.ts"), "utf8");
    const fork = /async function withForkToken[\s\S]*?\n}\n/.exec(text)?.[0] ?? "";
    expect(count(fork, REACH)).toBe(1);
    expect(count(text.replace(fork, ""), REACH)).toBe(0);
    expect([...text.matchAll(/withForkToken\s*(?:<[^>]*>)?\(/g)]).toHaveLength(2); // its definition and one use
    expect(text).toMatch(/withForkToken\(\s*forkRepo,/);
    for (const purpose of ["integrate:", "pin-objects:", "pin-ref:", "preview:"]) expect(text).toContain(`\`${purpose}`);
  });

  const sneaky = "packages/room/src/sneaky.ts";
  for (const [form, text] of [
    ["a call", "await repo.createToken('read', 60);"],
    ["an optional call (the checker's control)", "await repo.createToken?.('read', 60);"],
    ["an optional receiver", "await repo?.createToken('read', 60);"],
    ["an index by the name", "await repo['createToken']('read', 60);"],
    ["an optional index", "await repo?.[\"createToken\"]?.('read', 60);"],
    ["an alias", "const make = repo.createToken.bind(repo);\nawait make('read', 60);"],
    ["a destructuring", "const { createToken } = repo;\nawait createToken('read', 60);"],
    ["a renaming destructuring", "const { createToken: make } = repo;"],
    ["a reflective read", "Reflect.get(repo, 'createToken');"],
    ["a type reference", "type Make = RepoHandle['createToken'];"],
    ["a comment", "// calls createToken elsewhere"],
  ] as const)
    it(`the scan catches ${form} in a new production file`, () => {
      expect(violations([{ path: sneaky, text }])).toEqual([`${sneaky}: ${count(text, NAME)} occurrence(s) of createToken outside the allowed files`]);
    });

  it("the scan catches a new occurrence in an allowed file, a second name in the declaration file, and the fake reaching the method; it passes the fake's own definition", () => {
    const client = readFileSync(join(ROOT, "packages/git/src/publisher/client.ts"), "utf8");
    expect(violations([{ path: "packages/git/src/publisher/client.ts", text: `${client}\nconst f = canonical.createToken?.("write", 60);\n` }])).toHaveLength(1);
    const decl = readFileSync(join(ROOT, DECLARATION), "utf8");
    expect(violations([{ path: DECLARATION, text: `${decl}\nexport const make = (r: RepoHandle) => r.createToken("read", 60);\n` }])).toHaveLength(1);
    expect(violations([{ path: `${FAKE}artifacts.ts`, text: "async createToken(scope = 'write', ttl = 86400) { return this.createToken(scope, ttl); }" }])).toHaveLength(1);
    expect(violations([{ path: `${FAKE}artifacts.ts`, text: "async createToken(scope = 'write', ttl = 86400) {\n  this.host.enter(\"createToken\");\n}" }])).toEqual([]);
  });
});
