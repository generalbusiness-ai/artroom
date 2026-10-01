/**
 * Review 4df45987: owner coverage of the default policy pack. `owner-review`
 * applies to every path and asks for a review from `owners`. Under R-OBL-2
 * only the owners of the obligation's paths can meet it, so a path with no
 * owner would open an obligation nobody can meet. These tests run the demo
 * policy through the real runtime and show who can actually qualify; then
 * they show that a partial owner map is refused before it can be compiled.
 */

import { describe, expect, test } from "vitest";
import type { PolicyDocument, RepoPath } from "@generalbusiness/artroom-contract";
import demo from "../../../examples/demo-repo/.artroom/policy.ts";
import { owners, policy, requireReview } from "../src/helpers.ts";
import { checkTests, ownerCoverage, ownerReview, starterPolicy } from "../src/pack.ts";
import { evaluateRequire, type ObligationSpec } from "../src/rules.ts";
import { globCovers } from "../src/glob.ts";
import { active, requireInput } from "./support/fixtures.ts";

const P: PolicyDocument = demo;

/** The obligations a proposal of `paths` gets, each with who can qualify for it by R-OBL-2. */
async function obligations(doc: PolicyDocument, paths: RepoPath[]) {
  const input = requireInput(doc, paths);
  const r = await evaluateRequire(active(doc), input);
  expect(r.refusal).toBeNull();
  const qualifiers = (o: ObligationSpec): string[] => {
    if (o.kind !== "review") return [...o.by];
    const who = new Set<string>();
    for (const from of o.from) {
      if (from !== "owners") who.add(from);
      else for (const e of input.proposal.owners) if (o.paths.includes(e.path)) e.owners.forEach((p) => who.add(p));
    }
    return [...who].sort();
  };
  return { owners: input.proposal.owners, list: r.obligations, who: Object.fromEntries(r.obligations.map((o) => [o.id, qualifiers(o)])) };
}

describe("the demo policy gives every path an owner", () => {
  test("root files, tests, deploy configuration and .artroom files: @maintainers can meet owner-review", async () => {
    for (const path of ["README.md", "package.json", "tests/login.test.ts", "wrangler.jsonc", ".github/workflows/ci.yml", "config/flags.yaml", "scripts/release.sh", ".artroom/policy.json", ".artroom/policy.ts"]) {
      const r = await obligations(P, [path]);
      expect(r.owners, path).toEqual([{ path, owners: ["@maintainers"] }]);
      const owner = r.list.find((o) => o.id === "obl_owner-review");
      expect(owner, path).toMatchObject({ kind: "review", paths: [path], from: ["owners"], count: 1, allowSelf: false });
      expect(r.who["obl_owner-review"], path).toEqual(["@maintainers"]);
    }
  });

  test("an admin obligation is extra protection, never a substitute for owners", async () => {
    const config = await obligations(P, [".artroom/policy.json"]);
    expect(config.list.map((o) => o.id)).toEqual(["obl_admin-approval", "obl_owner-review"]);
    expect(config.who).toEqual({ "obl_admin-approval": ["role:admin"], "obl_owner-review": ["@maintainers"] });
    const deploy = await obligations(P, ["wrangler.jsonc"]);
    expect(deploy.who).toEqual({ "obl_owner-review": ["@maintainers"], "obl_deploy-config-review": ["role:admin"] });
  });

  test("a mixed proposal: every path has owners, and the obligation names them all", async () => {
    const paths = ["src/api/login.ts", "README.md", "tests/login.test.ts", "docs/intro.md", "wrangler.jsonc"];
    const r = await obligations(P, paths);
    for (const e of r.owners) expect(e.owners.length, e.path).toBeGreaterThan(0);
    expect(r.owners.find((e) => e.path === "src/api/login.ts")!.owners).toEqual(["@maintainers", "@security", "@app"]);
    expect(r.list.find((o) => o.id === "obl_owner-review")!.paths).toEqual(paths);
    expect(r.who["obl_owner-review"]).toEqual(["@app", "@docs", "@maintainers", "@security"]);
  });

  test("the demo policy and starterPolicy() have complete owner coverage", () => {
    expect(ownerCoverage(P)).toEqual([]);
    expect(Object.keys(P.owners)).toContain("**");
  });
});

describe("a partial owner map is refused before it is compiled", () => {
  const partial = { "src/api/**": "@security", "src/**": "@app", "docs/**": "@docs" } as const;

  test("what it would do: README.md alone gets an owner-review obligation nobody can meet", async () => {
    // Built without starterPolicy, as a hand-written policy.json could be.
    const doc = policy(owners(partial), ownerReview(), checkTests());
    const alone = await obligations(doc, ["README.md"]);
    expect(alone.owners).toEqual([{ path: "README.md", owners: [] }]);
    expect(alone.who["obl_owner-review"]).toEqual([]);
    // Partially owned: @app qualifies only through src/app.ts; README.md itself has no owner.
    const mixed = await obligations(doc, ["src/app.ts", "README.md"]);
    expect(mixed.owners).toEqual([{ path: "src/app.ts", owners: ["@app"] }, { path: "README.md", owners: [] }]);
    expect(mixed.who["obl_owner-review"]).toEqual(["@app"]);
    expect(ownerCoverage(doc)).toHaveLength(1);
  });

  test("starterPolicy() throws with a message that names the rule, the glob and the fix", () => {
    expect(() => starterPolicy({ owners: partial })).toThrow(
      /rule owner-review needs a review from the owners of \*\*, but no owners pattern covers all of \*\*.*owners\(\{ "\*\*": "@maintainers" \}\)/,
    );
    expect(starterPolicy({ owners: { ...partial, "**": "@maintainers" } }).owners["**"]).toEqual(["@maintainers"]);
  });

  test("ownerCoverage: an owner-review limited to owned paths passes; an owners pattern with nobody in it is already invalid", () => {
    expect(ownerCoverage(policy(owners(partial), ownerReview(["src/**", "docs/**"])))).toEqual([]);
    expect(ownerCoverage(policy(owners(partial), ownerReview(["src/**", "tests/**"])))).toHaveLength(1);
    expect(() => policy(owners({ ...partial, "**": [] }), ownerReview())).toThrow(/owners\[\*\*\]: must be a non-empty array/);
    // A review that some other principal can give is always satisfiable.
    expect(ownerCoverage(policy(owners(partial), requireReview({ id: "any-review", paths: "**", from: ["owners", "role:maintainer"] })))).toEqual([]);
  });

  test("globCovers is conservative: it never claims coverage that a path disproves", () => {
    const yes: [string, string][] = [["**", "**"], ["**", "README.md"], ["src/**", "src/api/**"], ["src/*", "src/a*"], ["*.ts", "*.ts"], ["**/*.ts", "src/**/x.ts"], ["*/**", "src/x"]];
    const no: [string, string][] = [["*", "**"], ["src/**", "**"], ["src/*", "src/**"], ["src/a*", "src/*"], ["*.ts", "*"], ["docs/**", "doc/**"]];
    for (const [outer, inner] of yes) expect(globCovers(outer, inner), `${outer} covers ${inner}`).toBe(true);
    for (const [outer, inner] of no) expect(globCovers(outer, inner), `${outer} does not cover ${inner}`).toBe(false);
  });
});

describe("the compiler refuses a partial owner map (Node: it is a Node script)", () => {
  test.runIf(__ARTROOM_RUNTIME__ === "node")("relative to INIT_CWD; refuses partial owners and writes nothing; compiles a covered map", async () => {
    // Node-only modules, loaded at run time: the test typecheck has no Node types.
    const load = (name: string): Promise<unknown> => import(/* @vite-ignore */ name);
    const fs = (await load("node:fs")) as unknown as NodeFs;
    const { tmpdir } = (await load("node:os")) as unknown as { tmpdir(): string };
    const { join } = (await load("node:path")) as unknown as { join(...parts: string[]): string };
    const { spawnSync } = (await load("node:child_process")) as unknown as { spawnSync(cmd: string, args: string[], opts: object): { status: number | null; stderr: string } };
    const proc = (globalThis as unknown as { process: { execPath: string; env: Record<string, string | undefined>; cwd(): string } }).process;
    const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } = fs;
    // vitest runs in the package directory.
    const pkg = proc.cwd();
    expect(existsSync(join(pkg, "scripts/compile-policy.ts"))).toBe(true);
    const root = mkdtempSync(join(tmpdir(), "artroom-compile-"));
    try {
      const write = (dir: string, map: string) => {
        mkdirSync(join(root, dir, ".artroom"), { recursive: true });
        const helpers = JSON.stringify(join(pkg, "src/helpers.ts"));
        const pack = JSON.stringify(join(pkg, "src/pack.ts"));
        writeFileSync(
          join(root, dir, ".artroom/policy.ts"),
          `import { owners, policy } from ${helpers};\nimport { ownerReview } from ${pack};\nexport default policy(owners(${map}), ownerReview());\n`,
        );
      };
      // npm runs the script in the package directory and sets INIT_CWD to where it was run.
      const compile = (dir: string) =>
        spawnSync(proc.execPath, ["scripts/compile-policy.ts", join(dir, ".artroom")], { cwd: pkg, env: { ...proc.env, INIT_CWD: root }, encoding: "utf8" });
      write("partial", '{ "src/**": "@app" }');
      const refused = compile("partial");
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("rule owner-review needs a review from the owners of **, but no owners pattern covers all of **");
      expect(existsSync(join(root, "partial/.artroom/policy.json"))).toBe(false);
      write("covered", '{ "**": "@maintainers", "src/**": "@app" }');
      const ok = compile("covered");
      expect(ok.status, ok.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(root, "covered/.artroom/policy.json"), "utf8")).owners).toEqual({ "**": ["@maintainers"], "src/**": ["@app"] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** The parts of node:fs the compiler test uses. */
interface NodeFs {
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, opts: { recursive: true }): void;
  writeFileSync(path: string, text: string): void;
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  rmSync(path: string, opts: { recursive: true; force: true }): void;
}
