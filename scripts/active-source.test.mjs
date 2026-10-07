// What the removal of the earlier model must keep true (scope contract, section 11.6):
// no active file imports from parked/, and no active file names a format, binding or
// variable that was deleted. Active: the packages, the root scripts and configuration,
// and the guides that describe what is built. Not active, and not read here: parked/,
// the dated notes and plans, the three guides marked inactive, and examples/, spikes/
// and .github/, which later deliveries own (parked/README.md lists them). Only tracked
// files are read: a checkout that once built the parked packages keeps their generated
// output under the old paths, untracked, and that output is not source.
//
//   node --test scripts/active-source.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INACTIVE = /^(parked|notes|plans|examples|spikes|\.github)\/|^docs\/(protocol|policy-pack|release)\.md$|^scripts\/active-source\.test\.mjs$/;
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter((f) => f !== "" && !INACTIVE.test(f));
const text = (file) => { try { return readFileSync(join(root, file), "utf8"); } catch { return ""; } };   // a file deleted and not yet committed

const REMOVED = /artroom-log-v1|artroom-policy-v[12]|artroom-steps-v1|artroom-legacy-v1|artroom\.v1|\bROOMS\b|\bREGISTRY\b|LEASE_SECONDS/;
// An import, a re-export, a dynamic import or a configuration path that reaches into parked/.
const REACHES = /(?:from|import|require|extends|include|"path"|workspaces)[^\n]*["'][^"'\n]*\bparked\//;

test("no active file names a removed format, binding or variable", () => {
  assert.ok(files.length > 50, "the active files were listed");
  assert.deepEqual(files.filter((f) => REMOVED.test(text(f))), []);
});

test("no active source or configuration file reaches into parked/, and parked/ is in no workspace", () => {
  assert.deepEqual(files.filter((f) => !f.endsWith(".md") && REACHES.test(text(f))), []);
  const lock = JSON.parse(text("package-lock.json"));
  assert.deepEqual(Object.keys(lock.packages).filter((p) => p.startsWith("parked/")), []);
});

// A lane is a definition, and the platform holds no lane (I2 plan, section 4.1). The lanes
// package may depend on any platform package. No platform package names it or reaches into it.
// The page is a client, not a platform package: its story test runs on the lanes' room fixture
// and demo definitions, so its tests and its development dependency may name the lanes package,
// and its source may not.
test("no platform package depends on the lanes package or imports from it", () => {
  assert.ok(files.includes("packages/lanes/package.json"), "the lanes package was listed");
  const pageTests = (f) => f.startsWith("packages/page/test/") || f === "packages/page/package.json";
  const platform = files.filter((f) => f.startsWith("packages/") && !f.startsWith("packages/lanes/") && !pageTests(f) && !f.endsWith(".md"));
  assert.deepEqual(platform.filter((f) => /artroom-lanes|[.\/]\/lanes\//.test(text(f))), []);
  const page = JSON.parse(text("packages/page/package.json") || "{}");
  assert.equal(page.dependencies?.["@generalbusiness/artroom-lanes"], undefined, "the page depends on the lanes package for its tests only");
});

// The platform package is pure data and rules over the contract, the bytes and the derivation (I3 plan, section 3.1). It names no
// package above them, and only the packages that run or check its definitions name it: the runtime, the verifier, the lanes' tests,
// and the command line, which reads a platform definition's acts (no scope retains a platform definition's declaration to read) and
// runs the verifier with the platform's rules; and the page, which reads a platform definition's acts as the command line does.
test("the platform package depends only on contract, bytes and derive, and only scope, replay, lanes, cli and page name it", () => {
  assert.ok(files.includes("packages/platform/package.json"), "the platform package was listed");
  const source = (f) => f.startsWith("packages/") && !f.endsWith(".md");
  const inside = files.filter((f) => source(f) && f.startsWith("packages/platform/"));
  assert.deepEqual(inside.filter((f) => /artroom-(scope|replay|client|lanes)/.test(text(f))), []);
  const named = files.filter((f) => source(f) && !/^packages\/(platform|scope|replay|lanes|cli|page)\//.test(f));
  assert.deepEqual(named.filter((f) => /artroom-platform/.test(text(f))), []);
});

// The git package is the one place that touches a Git repository or a Git host (I3 plan, section 3.1). It depends only on contract and
// bytes. The runtime and the checker service name it. The platform package may name it in its tests only, where the host stand-in runs
// the same table of sends as the real repository does: no rule of a platform definition reads a repository.
test("the git package depends only on contract and bytes, and only scope, checkers and the platform's tests name it", () => {
  assert.ok(files.includes("packages/git/package.json"), "the git package was listed");
  const source = (f) => f.startsWith("packages/") && !f.endsWith(".md");
  const inside = files.filter((f) => source(f) && f.startsWith("packages/git/"));
  assert.deepEqual(inside.filter((f) => /artroom-(derive|platform|scope|replay|client|lanes|checkers)/.test(text(f))), []);
  const named = files.filter((f) => source(f) && !/^packages\/(git|scope|checkers)\/|^packages\/platform\/test\//.test(f));
  assert.deepEqual(named.filter((f) => /artroom-git/.test(text(f))), []);
});

// The checkers package is the checker service: a separate service with its own key, and not a scope (I3 plan, section 3.1). It
// depends only on contract, bytes and git. No package names it. The lanes' scenario of a check reads its origin read and its signer
// by path, in a test, and no source file of any package does.
test("the checkers package depends only on contract, bytes and git, and no package names it", () => {
  assert.ok(files.includes("packages/checkers/package.json"), "the checkers package was listed");
  const source = (f) => f.startsWith("packages/") && !f.endsWith(".md");
  const inside = files.filter((f) => source(f) && f.startsWith("packages/checkers/"));
  assert.deepEqual(inside.filter((f) => /artroom-(derive|platform|scope|replay|client|lanes)/.test(text(f))), []);
  const named = files.filter((f) => source(f) && !f.startsWith("packages/checkers/"));
  assert.deepEqual(named.filter((f) => /artroom-checkers/.test(text(f))), []);
  const reaches = files.filter((f) => source(f) && !f.startsWith("packages/checkers/") && /[.\/]\/checkers\//.test(text(f)));
  assert.deepEqual(reaches, ["packages/lanes/test/checks.scope.test.ts"]);
});
