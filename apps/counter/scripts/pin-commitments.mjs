// Byte authoring only. This does not validate a declaration or run its rules.
// The literal TypeScript value is JSON; no TS/compiler/config import is needed.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("commitments.ts", root), "utf8");
const prefix = "export const countingCommitments: DeclaredDefinition = ";
const end = ";\n\n/** No create sends:";
const start = source.indexOf(prefix);
const finish = source.indexOf(end, start);
if (start < 0 || finish < 0) throw new Error("Expected the counting commitments JSON literal");
const value = JSON.parse(source.slice(start + prefix.length, finish));
function canonical(value, depth = 0) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("Expected safe integer");
    return String(value);
  }
  // This authoring tool deliberately supports only the declaration's ASCII text.
  if (typeof value === "string") {
    if (/[^\x00-\x7f]/.test(value)) throw new Error("Non-ASCII source needs the shared canonical implementation");
    return JSON.stringify(value);
  }
  if (depth >= 64) throw new Error("Nesting exceeds the canonical profile");
  if (Array.isArray(value)) return `[${value.map(v => canonical(v, depth + 1)).join(",")}]`;
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Expected a plain JSON object");
  return `{${Object.keys(value).sort().map(k => `${canonical(k)}:${canonical(value[k], depth + 1)}`).join(",")}}`;
}
const bytes = canonical(value);
const pin = `sha256:${createHash("sha256").update("artroom-definition-1\n").update(bytes, "utf8").digest("hex")}`;
writeFileSync(new URL("commitments.json", root), `${bytes}\n`);
writeFileSync(new URL("commitments-pin.ts", root), `/** Authored canonical-byte digest; validation and source acceptance are still owed. */\nexport const COUNTING_COMMITMENTS_DEFINITION = "${pin}" as const;\n`);
process.stdout.write(`${pin}\n`);
