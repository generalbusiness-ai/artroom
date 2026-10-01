/**
 * Compile a `.artroom/policy.ts` to `.artroom/policy.json`, validated.
 * Usage: node scripts/compile-policy.ts <dir containing policy.ts>
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validatePolicy } from "../src/validate.ts";

const dir = resolve(process.cwd(), process.argv[2] ?? ".artroom");
const mod = (await import(pathToFileURL(resolve(dir, "policy.ts")).href)) as { default: unknown };
const checked = validatePolicy(mod.default);
if (!checked.ok) {
  console.error(checked.problems.join("\n"));
  process.exit(1);
}
writeFileSync(resolve(dir, "policy.json"), JSON.stringify(checked.value, null, 2) + "\n");
console.log(`wrote ${resolve(dir, "policy.json")}`);
