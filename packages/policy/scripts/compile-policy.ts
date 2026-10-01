/**
 * Compile a `.artroom/policy.ts` to `.artroom/policy.json`, validated.
 *
 * Usage, from the repository root:
 *   npm run compile-policy --workspace @generalbusiness/artroom-policy -- examples/demo-repo/.artroom
 *
 * The directory is resolved against the directory npm was run from
 * (`INIT_CWD`), or the current directory when run with node directly. It
 * defaults to `.artroom`. The compiler refuses a policy that fails
 * validation (R-POL-1) or owner coverage (`ownerCoverage` in src/pack.ts).
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validatePolicy } from "../src/validate.ts";
import { ownerCoverage } from "../src/pack.ts";

const from = process.env["INIT_CWD"] || process.cwd();
const dir = resolve(from, process.argv[2] ?? ".artroom");
const mod = (await import(pathToFileURL(resolve(dir, "policy.ts")).href)) as { default: unknown };
const checked = validatePolicy(mod.default);
const problems = checked.ok ? ownerCoverage(checked.value) : checked.problems;
if (!checked.ok || problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync(resolve(dir, "policy.json"), JSON.stringify(checked.value, null, 2) + "\n");
console.log(`wrote ${resolve(dir, "policy.json")}`);
