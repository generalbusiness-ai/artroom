/**
 * The default policy pack (lane D), run through the real runtime. Each rule
 * has a pass case and a refuse (or apply) case. Then the carry defaults the
 * pack adds, and owner coverage. The platform's carry conditions are in
 * carry.test.ts, policy lockout in admin.test.ts, and the pack's measured
 * budget in budgets.test.ts.
 */

import { describe, expect, test } from "vitest";
import type { PathChange, PolicyDocument, RepoPath } from "@generalbusiness/artroom-contract";
import demo from "../../../examples/demo-repo/.artroom/policy.ts";
import demoJson from "../../../examples/demo-repo/.artroom/policy.json" with { type: "json" };
import { PACK, checkTests, ownerCoverage, ownerReview, starterPolicy } from "../src/pack.ts";
import { OBJECTION_OPEN, owners, policy, requireReview } from "../src/helpers.ts";
import { validatePolicy } from "../src/validate.ts";
import { evaluateCarry, evaluateLand, evaluateNotify, evaluateRefuse, evaluateRequire, ownersFor, type ObligationSpec } from "../src/rules.ts";
import { globCovers, matchesAny } from "../src/glob.ts";
import { act, active, actor, carryInput, lane, landInput, notifyInput, refuseInput, requireInput } from "./support/fixtures.ts";

const P: PolicyDocument = demo;
const A = active(P);
const approve = (n: number, basis: "here" | "carried" = "here", who: `@${string}` = "@security") => ({ act: act(n), verdict: "approve" as const, by: actor(who), basis });
const objection = (n: number, who: `@${string}` = "@security") => ({ act: act(n), verdict: "object" as const, by: actor(who), basis: "here" as const });

describe("the pack compiles to the committed demo policy", () => {
  test("policy.ts, policy.json and starterPolicy() agree, and the document is valid", () => {
    expect(JSON.parse(JSON.stringify(demo))).toEqual(demoJson);
    expect(validatePolicy(demoJson).ok).toBe(true);
    const starter = starterPolicy({ owners: { "**": "@maintainers", "src/api/**": "@security", "src/**": "@app", "docs/**": "@docs" } });
    expect(JSON.parse(JSON.stringify(starter))).toEqual(demoJson);
  });

  test("the pack has 12 named rules, each documented with what it replaces", () => {
    const ids = P.rules.map((r) => r.id).sort();
    expect(ids).toEqual(PACK.map((e) => e.id).sort());
    expect(ids).toHaveLength(12);
    expect(ids).toContain(OBJECTION_OPEN.id);
  });
});

describe("refuse rules", () => {
  const JJ = {
    refused: true,
    rule: "jj-conflicts",
    reason: "This proposal introduces or changes jj conflict data: it adds or modifies .jjconflict-base-* or .jjconflict-side-* paths at the root of its tree.",
    fix: "Resolve the jj conflicts, so the proposal no longer adds or changes .jjconflict-* paths, then propose again.",
  };
  /** A proposal with these changes; `paths` lists old and new paths, as the room builds it (R-PROP-3). */
  const changes = (changed: PathChange[]) => {
    const paths = [...new Set(changed.flatMap((c) => (c.status === "renamed" ? [c.from, c.path] : [c.path])))];
    return { ...requireInput(P, paths).proposal, changed, paths, owners: ownersFor(P, paths) };
  };
  const propose = (changed: PathChange[], over: Partial<Parameters<typeof refuseInput>[2]> = {}) =>
    evaluateRefuse(A, refuseInput(P, "propose", { proposal: changes(changed), ...over }));
  const conflictTree = [".jjconflict-base-0/src/app.ts", ".jjconflict-side-0/src/app.ts", ".jjconflict-side-1/src/app.ts"];

  test("jj-conflicts: adding new conflict directories is refused with jj-conflicts, not outside-claim", async () => {
    // The lane claims src/**, so R-PROP-4 would refuse these paths as outside-claim. For propose,
    // refuse rules run before the claim check (R-ADM-1 step 8), so the author sees the real cause.
    const claim = lane().scope;
    for (const changed of [
      [{ status: "added", path: ".jjconflict-side-0/src/app.ts" }],
      [{ status: "modified", path: "src/app.ts" }, ...conflictTree.map((path) => ({ status: "added", path }) as const)],
      [{ status: "added", path: ".jjconflict-base-12/README.md" }],
    ] satisfies PathChange[][]) {
      const label = changed.map((c) => c.path).join();
      expect(changed.some((c) => !matchesAny(c.path, claim)), label).toBe(true);
      const r = await propose(changed);
      expect(r.refusal, label).toEqual(JJ);
    }
  });

  test("jj-conflicts: modifying an existing conflict file, or renaming a file into a conflict directory, is refused", async () => {
    expect((await propose([{ status: "modified", path: ".jjconflict-side-1/src/app.ts" }])).refusal).toEqual(JJ);
    expect((await propose([{ status: "renamed", from: "src/app.ts", path: ".jjconflict-side-0/src/app.ts" }])).refusal).toEqual(JJ);
  });

  test("jj-conflicts: removing all conflict data from an imported conflict tree is accepted", async () => {
    // A clean child of a conflicted head: the conflict directories are deleted and the resolved file is written.
    const r = await propose([...conflictTree.map((path) => ({ status: "deleted", path }) as const), { status: "modified", path: "src/app.ts" }]);
    expect(r.refusal).toBeNull();
  });

  test("jj-conflicts: renaming a file out of a conflict directory is accepted", async () => {
    const r = await propose([{ status: "renamed", from: ".jjconflict-side-0/src/app.ts", path: "src/app.ts" }, { status: "deleted", path: ".jjconflict-base-0/src/app.ts" }]);
    expect(r.refusal).toBeNull();
  });

  test("jj-conflicts, known limit: an unrelated change on top of untouched conflict data is accepted", async () => {
    // The conflict directories are in the head but not in the changes, so the rule cannot see them.
    // A whole-head check needs a Room-owned fact about the head's root entries (docs/policy-pack.md).
    const r = await propose([{ status: "modified", path: "docs/guide.md" }]);
    expect(r.refusal).toBeNull();
  });

  test("jj-conflicts: fires first among the pack's refuse rules, even on an unclaimed lane", async () => {
    const r = await propose([{ status: "added", path: ".jjconflict-side-0/src/app.ts" }], { lane: lane(null, false) });
    expect(r.refusal).toEqual(JJ);
    expect(r.evaluations.map((e) => e.decision.rule)).toEqual(["jj-conflicts"]);
  });

  test("jj-conflicts: a name that merely contains jjconflict below the root, or lacks the prefix at the root, is not refused", async () => {
    for (const path of ["src/.jjconflict-side-0/app.ts", "docs/jjconflict-notes.md", "src/a.jjconflict-base-1.ts", "jjconflict-side-0/app.ts", ".jjconflict/app.ts", ".jjconflict-left-0/app.ts"]) {
      for (const status of ["added", "modified"] as const) expect((await propose([{ status, path }])).refusal, `${status} ${path}`).toBeNull();
    }
  });

  test("claim-before-propose: refuses an unclaimed lane, passes a claimed one", async () => {
    const proposal = requireInput(P, ["src/app.ts"]).proposal;
    const refused = await evaluateRefuse(A, refuseInput(P, "propose", { proposal, lane: lane(null, false) }));
    expect(refused.refusal).toEqual({
      refused: true,
      rule: "claim-before-propose",
      reason: "This lane has no claim, so nobody can see who is changing these paths.",
      fix: "Claim the paths you are changing, then propose again.",
    });
    expect((await evaluateRefuse(A, refuseInput(P, "propose", { proposal }))).refusal).toBeNull();
  });

  test("narrow-claims: refuses a member's claim on **, passes a narrow claim and an admin's", async () => {
    const claim = (scope: string[], role: "member" | "admin" = "member") =>
      refuseInput(P, "claim", { act: { kind: "claim", target: null, body: { goal: "x", scope } }, actor: actor("@alice", role) });
    expect((await evaluateRefuse(A, claim(["**"]))).refusal?.rule).toBe("narrow-claims");
    expect((await evaluateRefuse(A, claim(["src/api/**"]))).refusal).toBeNull();
    expect((await evaluateRefuse(A, claim(["**"], "admin"))).refusal).toBeNull();
  });
});

describe("require rules", () => {
  const ids = async (paths: string[]) => (await evaluateRequire(A, requireInput(P, paths))).obligations.map((o) => o.id);

  test("owner-review: CODEOWNERS-style review from the paths' owners", async () => {
    const r = await evaluateRequire(A, requireInput(P, ["src/api/login.ts"]));
    expect(r.obligations.find((o) => o.id === "obl_owner-review")).toMatchObject({ kind: "review", from: ["owners"] });
    expect(r.evaluations[0]!.context.input.kind === "require" && r.evaluations[0]!.context.input.proposal.owners).toEqual([
      { path: "src/api/login.ts", owners: ["@maintainers", "@security", "@app"] },
    ]);
  });

  test("check-tests and check-types: required by path; a docs-only change needs neither", async () => {
    expect(await ids(["src/app.ts"])).toEqual(["obl_owner-review", "obl_check-tests", "obl_check-types"]);
    expect(await ids(["tests/app.test.js"])).toEqual(["obl_owner-review", "obl_check-tests"]);
    expect(await ids(["docs/intro.md"])).toEqual(["obl_owner-review"]);
  });

  test("deploy-config-review: an admin reviews CI and deploy files; .artroom/** is the platform's own admin approval", async () => {
    expect(await ids([".github/workflows/ci.yml"])).toEqual(["obl_owner-review", "obl_deploy-config-review"]);
    expect(await ids(["wrangler.jsonc"])).toEqual(["obl_owner-review", "obl_deploy-config-review"]);
    expect(await ids([".artroom/policy.json"])).toEqual(["obl_admin-approval", "obl_owner-review"]);
  });
});

describe("land rules", () => {
  const land = (paths: string[], reviews: Parameters<typeof landInput>[2]) => evaluateLand(A, landInput(P, paths, reviews));

  test("objection-open: an owner's open objection blocks; approvals pass", async () => {
    expect((await land(["src/app.ts"], [approve(40, "here", "@app"), objection(41, "@app")])).refusal?.rule).toBe("objection-open");
    expect((await land(["src/app.ts"], [approve(40, "here", "@app")])).refusal).toBeNull();
  });

  test("fresh-approval: src/api/ with only carried approvals blocks; a fresh approval or another area passes", async () => {
    const blocked = await land(["src/api/login.ts"], [approve(40, "carried")]);
    expect(blocked.refusal).toEqual({
      refused: true,
      rule: "fresh-approval",
      reason: "This proposal changes src/api/ and its approvals were all carried from earlier generations.",
      fix: "Ask an owner to review this generation.",
    });
    expect((await land(["src/api/login.ts"], [approve(40, "carried"), approve(41)])).refusal).toBeNull();
    expect((await land(["src/app.ts"], [approve(40, "carried", "@app")])).refusal).toBeNull();
  });
});

describe("notify rules", () => {
  const dir = { roles: {}, reviewers: [] };

  test("notify-owners: the owners of changed paths hear about a proposal", async () => {
    const r = await evaluateNotify(A, notifyInput(P, "propose", ["src/api/login.ts", "docs/intro.md"]), dir);
    expect(r.notify.map((n) => n.to)).toEqual(["@app", "@docs", "@maintainers", "@security"]);
  });

  test("notify-holder: the holder hears about an objection or a failed check, not an approval", async () => {
    const on = (kind: "review" | "check", body: object) => evaluateNotify(A, { ...notifyInput(P, kind, ["src/app.ts"]), act: { id: act(50), kind, target: null, body: body as never } }, dir);
    expect((await on("review", { verdict: "object" })).notify.map((n) => n.to)).toEqual(["@alice"]);
    expect((await on("check", { ok: false })).notify.map((n) => n.to)).toEqual(["@alice"]);
    expect((await on("review", { verdict: "approve" })).notify).toEqual([]);
  });
});

describe("carry: the pack's defaults", () => {
  const login = { scope: ["src/api/login.ts"] };

  test("plan 7 case 2: no declaration, the pack's default for src/api/** lists src/lib/**: not carried", async () => {
    const r = await evaluateCarry(A, carryInput(P, { ...login, changedSince: ["src/lib/authz/check.ts"] }));
    expect(r.notCarried?.code).toBe("dependency-changed");
  });

  test("plan 7 cases 4 and 5: package-lock.json or .artroom/policy.json: nothing carried; the pack adds config/**", async () => {
    for (const path of ["package-lock.json", ".artroom/policy.json", "config/flags.yaml"]) {
      const r = await evaluateCarry(A, carryInput(P, { ...login, changedSince: [path] }));
      expect(r.notCarried?.code, path).toBe("global-input-changed");
    }
  });

  test("stale-approval: a rework of more than 25 paths does not keep earlier approvals", async () => {
    const many = Array.from({ length: 26 }, (_, i) => `src/ui/c${i}.ts`);
    const r = await evaluateCarry(A, carryInput(P, { ...login, changedSince: many }));
    expect(r.notCarried).toMatchObject({ code: "policy-rejected", rule: "stale-approval" });
    expect((await evaluateCarry(A, carryInput(P, { ...login, changedSince: many.slice(0, 25) }))).carried).not.toBeNull();
  });
});

// Owner coverage (review 4df45987). `owner-review` asks for a review from `owners`, and by R-OBL-2 only the owners of
// the obligation's paths can meet it, so a path with no owner would open an obligation nobody can meet.

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
    const { execFile } = (await load("node:child_process")) as unknown as { execFile(cmd: string, args: string[], opts: object, done: (error: { code?: number } | null, stdout: string, stderr: string) => void): void };
    const proc = (globalThis as unknown as { process: { execPath: string; env: Record<string, string | undefined>; cwd(): string } }).process;
    const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } = fs;
    // The package directory, from this file's own place: the tests may be run from the repository root.
    const { fileURLToPath } = (await load("node:url")) as unknown as { fileURLToPath(url: URL): string };
    const pkg = fileURLToPath(new URL("..", import.meta.url));
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
        new Promise<{ status: number; stderr: string }>((done) =>
          execFile(proc.execPath, ["scripts/compile-policy.ts", join(dir, ".artroom")], { cwd: pkg, env: { ...proc.env, INIT_CWD: root }, encoding: "utf8" }, (error, _out, stderr) => done({ status: error ? (error.code ?? -1) : 0, stderr })),
        );
      write("partial", '{ "src/**": "@app" }');
      write("covered", '{ "**": "@maintainers", "src/**": "@app" }');
      // The two runs share nothing, so they run at the same time.
      const [refused, ok] = await Promise.all([compile("partial"), compile("covered")]);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("rule owner-review needs a review from the owners of **, but no owners pattern covers all of **");
      expect(existsSync(join(root, "partial/.artroom/policy.json"))).toBe(false);
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
