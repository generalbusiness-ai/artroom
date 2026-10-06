/**
 * A check's configuration, as the checker service reads it (authority note,
 * section 3.11, "Who fixes a required check's configuration"). A
 * configuration is one value, identified by the digest of its canonical
 * bytes in the byte domain `artroom-check-configuration-1`. The rules scope
 * retains the bytes under that digest. The service fetches them from the
 * rules scope by the job's digest, and never takes them from the tree, the
 * requester or the lane.
 *
 * `readConfiguration` is a pure function of the bytes and the digest. It
 * answers a configuration only when the bytes are canonical, hash to the
 * digest, and have exactly the six members in the forms below. Anything
 * else is no configuration: the service runs nothing and signs
 * `check-error`, `configuration-unavailable`.
 *
 * The note lists the six members and says that they are "a proposal for R2
 * and R4 to agree". It states no type for any but `image`. The forms here
 * are the narrowest that the table's words fit (I3 deltas, entry EW12).
 */

import type { Digest, DomainTag } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, digestBytes, digestOfHash, domainBytes, isDigest, isRecord, parseStrict, sha256, utf8, wellFormed } from "@generalbusiness/artroom-bytes";

/** The byte domain of a configuration's digest (section 3.11). The rules definition declares it (`packages/platform/src/rules-scope.ts`). */
export const CONFIGURATION_DOMAIN = "artroom-check-configuration-1";

/** The most canonical bytes of one configuration that this service reads: the rules scope's own bound on one (I3 deltas, entry EQ2). */
export const CONFIGURATION_BYTES = 32 * 1024;

/** One variable that the runner is started with, by name and value. None holds a credential (section 3.11). */
export interface Variable { name: string; value: string }

/** What the judging step must end with, for one judgment: its exit status and its last line. */
export interface Judged { status: number; line: string }

export interface Configuration {
  /** The check's name in the rules. */
  name: string;
  /** The runner image, by its content digest. Never a tag. */
  image: Digest;
  /** Every variable that the runner is started with, in the order written. A name is there once. */
  environment: readonly Variable[];
  /** The commands, in order, each as a list of arguments. The last step judges. */
  steps: readonly (readonly string[])[];
  /** For "passed" and for "failed": the exit status and the last line that the judging step must end with. The two differ. */
  judged: { passed: Judged; failed: Judged };
  /** The time, in seconds, and the output, in bytes, that one run may use. */
  limits: { seconds: number; outputBytes: number };
}

const text = (v: unknown, max: number): v is string => typeof v === "string" && v !== "" && wellFormed(v) && utf8(v).length <= max && !v.includes("\u0000");
const whole = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
/** A record with exactly these members. `outcome.ts` reads a runner's report with it. */
export const exactly = (v: unknown, names: readonly string[]): v is Record<string, unknown> => isRecord(v) && Object.keys(v).length === names.length && names.every((name) => Object.hasOwn(v, name));
const judged = (v: unknown): v is Judged => exactly(v, ["status", "line"]) && whole(v["status"], 0, 255) && text(v["line"], 1024) && !/[\r\n]/.test(v["line"] as string);

/** The digest of a configuration value, in its domain. */
export const configurationDigest = (value: unknown): Digest => digestOfHash(sha256(domainBytes(CONFIGURATION_DOMAIN as DomainTag, value)));

/**
 * The digest of a list of variables: what `RunProvenance.environment` holds
 * (section 3.11, "What ran"). The note states no domain for it, so it is the
 * digest of the list's canonical bytes (I3 deltas, entry EW13).
 */
export const environmentDigest = (variables: readonly Variable[]): Digest => digestBytes(canonicalBytes(variables.map(({ name, value }) => ({ name, value }))));

/**
 * The configuration that `bytes` are, when they are the canonical bytes of a
 * value whose digest is `digest`, or null. `bytes` is canonical JSON text,
 * as the rules scope retains it.
 */
export function readConfiguration(bytes: unknown, digest: Digest): Configuration | null {
  if (typeof bytes !== "string" || !isDigest(digest) || utf8(bytes).length > CONFIGURATION_BYTES) return null;
  let value: unknown;
  try {
    value = parseStrict(bytes);
    // One value has one text: bytes that are not the canonical form of what they parse to are not the bytes that were hashed.
    if (canonicalize(value) !== bytes) return null;
  } catch {
    return null;
  }
  if (configurationDigest(value) !== digest) return null;
  if (!exactly(value, ["name", "image", "environment", "steps", "judged", "limits"])) return null;
  const { name, image, environment, steps, judged: by, limits } = value;
  if (!text(name, 128) || !isDigest(image)) return null;
  if (!Array.isArray(environment) || environment.length > 64 || !environment.every((v) => exactly(v, ["name", "value"]) && typeof v["name"] === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v["name"]) && typeof v["value"] === "string" && wellFormed(v["value"]) && !v["value"].includes("\u0000"))) return null;
  if (new Set(environment.map((v: Variable) => v.name)).size !== environment.length) return null;
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 32 || !steps.every((step) => Array.isArray(step) && step.length >= 1 && step.length <= 256 && step.every((arg) => typeof arg === "string" && wellFormed(arg) && !arg.includes("\u0000")) && step[0] !== "")) return null;
  if (!exactly(by, ["passed", "failed"]) || !judged(by["passed"]) || !judged(by["failed"])) return null;
  // A status and a last line that both judgments share could be read as either. Then neither is a judgment.
  if (by["passed"].status === by["failed"].status && by["passed"].line === by["failed"].line) return null;
  if (!exactly(limits, ["seconds", "outputBytes"]) || !whole(limits["seconds"], 1, 24 * 3600) || !whole(limits["outputBytes"], 1, 1 << 30)) return null;
  return value as unknown as Configuration;
}
