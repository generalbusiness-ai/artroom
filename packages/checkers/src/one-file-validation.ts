/** Pure byte/shape/identity validation only. No artifact acquisition, trust, ready facade or runner/service wiring. */
import type { Digest } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, digestBytes, isDigest, isFactRef, parseStrictBytes, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { isObjectId } from "@generalbusiness/artroom-git";
import { exactly } from "./configuration.ts";
import { readReport, REPORT_BOUNDS } from "./outcome.ts";
import { CONFIGURATION2_DOMAIN, ONE_FILE_CHECKOUT_REASONS, type CheckTarget, type Configuration2, type ConfigurationSelector, type OneFileCheckABI, type OneFileCheckout, type OneFileDetails, type OneFileRunReport, type OneFileTargetIdentity } from "./one-file-contract.ts";

/** Mandatory caller work allowances; no domain-2 byte default or capacity claim. */
export interface CheckReadLimits { bytes: number; records: number; tokens: number; depth: number }
export type CheckValidation<T> = { ok: true; value: T } | { ok: false; reason: "limits" | "canonical" | "schema" | "content" };
class Refused extends Error { constructor(readonly reason: "limits" | "canonical" | "schema" | "content") { super(reason); } }
const demand = (yes: unknown): void => { if (!yes) throw new Refused("schema"); };
const whole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max;
const text = (v: unknown, max: number, empty = false): v is string => typeof v === "string" && (empty || v !== "") && v["length"] <= max && wellFormed(v) && !v["includes"]("\0") && utf8(v).length <= max;
const status = (v: unknown): boolean => v === null || whole(v, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
function wire(bytes: unknown, limits: CheckReadLimits): unknown {
  if (!limits || !exactly(limits, ["bytes", "records", "tokens", "depth"]) || Object.values(limits).some((v) => !whole(v, 0, Number.MAX_SAFE_INTEGER))) throw new Refused("limits");
  if (!ArrayBuffer.isView(bytes) || !(bytes instanceof Uint8Array)) throw new Refused("schema");
  if (bytes.length > limits.bytes) throw new Refused("limits");
  let quoted = false, escaped = false, primitive = false, depth = 0, records = 0, tokens = 0;
  for (const byte of bytes) {
    if (quoted) { if (escaped) escaped = false; else if (byte === 92) escaped = true; else if (byte === 34) quoted = false; continue; }
    if (byte === 34) { quoted = true; tokens++; primitive = false; }
    else if (byte === 123 || byte === 91) { depth++; tokens++; primitive = false; if (byte === 123) records++; }
    else if (byte === 125 || byte === 93) { depth--; primitive = false; }
    else if ([44, 58, 32, 9, 10, 13]["includes"](byte)) primitive = false;
    else if (!primitive) { primitive = true; tokens++; }
    if (depth > limits.depth || records > limits.records || tokens > limits.tokens) throw new Refused("limits");
  }
  try {
    const parsed = parseStrictBytes(bytes), canonical = canonicalBytes(parsed);
    if (bytes.length !== canonical.length || !bytes.every((b, i) => b === canonical[i])) throw new Refused("canonical");
    return parsed;
  } catch { throw new Refused("canonical"); }
}
function parse<T>(bytes: unknown, limits: CheckReadLimits, shape: (v: unknown) => void): CheckValidation<T> {
  try { const value = wire(bytes, limits); shape(value); return { ok: true, value: value as T }; }
  catch (error) { return { ok: false, reason: error instanceof Refused ? error.reason : "schema" }; }
}
function selector(v: unknown): asserts v is ConfigurationSelector {
  demand(exactly(v, ["domain", "digest"])); const r = v as Record<string, unknown>;
  demand((r["domain"] === "artroom-check-configuration-1" || r["domain"] === CONFIGURATION2_DOMAIN) && isDigest(r["digest"]));
}
function identity(v: unknown): asserts v is OneFileTargetIdentity {
  demand(exactly(v, ["kind", "manifest", "base", "tree", "path", "digest", "size"])); const r = v as Record<string, unknown>;
  // Current real Git transport is SHA-1 only; no broader format readiness is inferred.
  demand(r["kind"] === "one-file" && isFactRef(r["manifest"]) && isObjectId(r["base"]) && isObjectId(r["tree"])
    && text(r["path"], 1024) && isDigest(r["digest"]) && whole(r["size"], 0, 65536));
}
function checkout(v: unknown): asserts v is OneFileCheckout {
  demand(exactly(v, ["confirmed", "reason"]) || exactly(v, ["confirmed", "head", "indexTree", "worktreeTree"]));
  const r = v as Record<string, unknown>;
  if (r["confirmed"] === false) demand(exactly(v, ["confirmed", "reason"]) && ONE_FILE_CHECKOUT_REASONS.includes(r["reason"] as never));
  else demand(r["confirmed"] === true && exactly(v, ["confirmed", "head", "indexTree", "worktreeTree"]) && isObjectId(r["head"]) && isObjectId(r["indexTree"]) && isObjectId(r["worktreeTree"]));
}
export const readSelector = (bytes: unknown, limits: CheckReadLimits): CheckValidation<ConfigurationSelector> => parse(bytes, limits, selector);
export function readCheckTarget(bytes: unknown, limits: CheckReadLimits): CheckValidation<CheckTarget> {
  return parse(bytes, limits, (v) => {
    if (exactly(v, ["kind", "manifest", "base", "commit", "tree"]) && v["kind"] === "integration") { demand(isFactRef(v["manifest"]) && isObjectId(v["base"]) && isObjectId(v["commit"]) && isObjectId(v["tree"])); return; }
    demand(exactly(v, ["kind", "manifest", "base", "tree", "path", "digest", "size", "content"]));
    const r = v as Record<string, unknown>, { content, ...target } = r; identity(target);
    demand(text(content, 65536, true));
    if (utf8(content as string).length !== target.size || digestBytes(utf8(content as string)) !== target.digest) throw new Refused("content");
  });
}
export const configuration2Digest = (value: Configuration2): Digest => digestBytes(utf8(`${CONFIGURATION2_DOMAIN}\n${canonicalize(value)}`));
export function readConfiguration2(bytes: unknown, digest: Digest, limits: CheckReadLimits): CheckValidation<Configuration2> {
  return parse(bytes, limits, (v) => {
    demand(exactly(v, ["name", "image", "environment", "steps", "judged", "limits", "checkout"])); const r = v as Record<string, unknown>;
    demand(text(r["name"], 128) && isDigest(r["image"]));
    demand(Array.isArray(r["environment"]) && r["environment"]["length"] <= 64 && r["environment"]["every"]((x) => exactly(x, ["name", "value"]) && typeof x["name"] === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(x["name"]) && typeof x["value"] === "string" && wellFormed(x["value"]) && !x["value"]["includes"]("\0")));
    demand(new Set((r["environment"] as { name: string }[]).map((x) => x["name"])).size === (r["environment"] as unknown[]).length);
    demand(Array.isArray(r["steps"]) && r["steps"]["length"] >= 1 && r["steps"]["length"] <= 32 && r["steps"]["every"]((step) => Array.isArray(step) && step["length"] >= 1 && step["length"] <= 256 && step[0] !== "" && step["every"]((arg) => typeof arg === "string" && wellFormed(arg) && !arg.includes("\0"))));
    demand(exactly(r["judged"], ["passed", "failed"])); const judged = r["judged"] as Record<string, unknown>;
    for (const side of [judged["passed"], judged["failed"]]) demand(exactly(side, ["status", "line"]) && whole(side["status"], 0, 255) && text(side["line"], 1024) && !/[\r\n]/.test(side["line"] as string));
    demand(!same(judged["passed"], judged["failed"]));
    demand(exactly(r["limits"], ["seconds", "outputBytes"]) && whole(r["limits"]["seconds"], 1, 86400) && whole(r["limits"]["outputBytes"], 1, 1 << 30));
    demand(exactly(r["checkout"], ["kind", "abi"]) && r["checkout"]["kind"] === "one-file" && isDigest(r["checkout"]["abi"]));
    if (!isDigest(digest) || configuration2Digest(v as Configuration2) !== digest) throw new Refused("content");
  });
}
export const oneFileABIDigest = (value: OneFileCheckABI): Digest => digestBytes(canonicalBytes(value));
export function readOneFileABI(bytes: unknown, limits: CheckReadLimits): CheckValidation<OneFileCheckABI> {
  return parse(bytes, limits, (v) => {
    const names = ["format", "targetInput", "jobInput", "configurationInput", "baseRead", "candidateConstruction", "checkoutVerification", "report", "details", "budgets", "images"];
    demand(exactly(v, names)); const r = v as Record<string, unknown>; demand(r["format"] === "artroom-one-file-check-abi-1");
    for (const name of names.slice(1, -1)) demand(isDigest(r[name]));
    demand(Array.isArray(r["images"])); let previous = "";
    for (const image of r["images"] as unknown[]) {
      demand(exactly(image, ["image", "adapter", "correspondence"])); const row = image as Record<string, unknown>;
      demand(isDigest(row["image"]) && isDigest(row["adapter"]) && isDigest(row["correspondence"]) && row["image"] > previous); previous = row["image"] as string;
    }
  });
}
export function readOneFileReport(bytes: unknown, limits: CheckReadLimits): CheckValidation<OneFileRunReport> {
  return parse(bytes, limits, (v) => {
    demand(exactly(v, ["format", "job", "configuration", "abi", "target", "started", "image", "environment", "checkout", "steps", "end"])); const r = v as Record<string, unknown>;
    demand(r["format"] === "artroom-one-file-check-run-1" && isFactRef(r["job"]) && isDigest(r["abi"])); selector(r["configuration"]); identity(r["target"]); checkout(r["checkout"]);
    // Reuse shipped report field constraints only, not its scalar checkout meaning or judgment.
    const common = readReport({ started: r["started"], image: r["image"], environment: r["environment"], checkout: false, steps: r["steps"], end: r["end"] }); demand(common);
    const checked = r["checkout"] as OneFileCheckout;
    if (!common!.started) demand(!checked.confirmed && checked.reason === "checkout-failed" && common!.steps.length === 0);
    if (!checked.confirmed) demand(common!.steps.length === 0);
  });
}
export const oneFileDetailsDigest = (value: OneFileDetails): Digest => digestBytes(canonicalBytes(value));
export function readOneFileDetails(bytes: unknown, limits: CheckReadLimits): CheckValidation<OneFileDetails> {
  return parse(bytes, limits, (v) => {
    demand(exactly(v, ["format", "provenance"])); const r = v as Record<string, unknown>; demand(r["format"] === "artroom-one-file-check-details-1");
    demand(exactly(r["provenance"], ["job", "configuration", "abi", "target", "image", "environment", "checkout", "steps", "run"])); const p = r["provenance"] as Record<string, unknown>;
    demand(isFactRef(p["job"]) && isDigest(p["abi"]) && isDigest(p["environment"])); selector(p["configuration"]); identity(p["target"]);
    demand(exactly(p["image"], ["declared", "resolved"]) && isDigest(p["image"]["declared"]) && (p["image"]["resolved"] === null || isDigest(p["image"]["resolved"])));
    if (p["checkout"] !== null) { checkout(p["checkout"]); demand(checkoutTargetRefusal(p["checkout"], p["target"]) === null); }
    demand(text(p["run"], REPORT_BOUNDS.textBytes, true) && Array.isArray(p["steps"]) && p["steps"]["length"] <= REPORT_BOUNDS.steps);
    for (let k = 0; k < (p["steps"] as unknown[]).length; k++) { const step = (p["steps"] as unknown[])[k]; demand(exactly(step, ["name", "status"]) && step["name"] === String(k + 1) && status(step["status"])); }
  });
}
/** Null means only this encoding has no mode mismatch, never compatibility or permission. */
export function targetSelectorRefusal(target: CheckTarget, selection: ConfigurationSelector): "target-incompatible" | null {
  return (target.kind === "one-file") !== (selection.domain === CONFIGURATION2_DOMAIN) ? "target-incompatible" : null;
}
/** Caller expected identity must come from independent job/configuration reads. Equality itself grants nothing. */
export function reportIdentityRefusal(report: OneFileRunReport, expected: Pick<OneFileRunReport, "job" | "configuration" | "abi" | "target">): "target-mismatch" | "abi-mismatch" | null {
  if (!same(report.job, expected.job) || !same(report.configuration, expected.configuration) || !same(report.target, expected.target)) return "target-mismatch";
  if (report.abi !== expected.abi) return "abi-mismatch";
  return null;
}

/** A separate checkout-phase comparison, after started/image/environment/end judgment.
 * Matching hashes still prove no filesystem verification. */
export function checkoutTargetRefusal(checkout: OneFileCheckout, target: OneFileTargetIdentity): "target-mismatch" | null {
  return checkout.confirmed && (checkout.head !== target.base || checkout.indexTree !== target.tree || checkout.worktreeTree !== target.tree) ? "target-mismatch" : null;
}
