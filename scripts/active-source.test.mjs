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
