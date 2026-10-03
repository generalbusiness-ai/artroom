/**
 * The decoding boundary for untrusted log content. Everything `verify`
 * reads from a log commit, and everything a restarted publisher reads back,
 * passes through here before any field is dereferenced:
 * - segment lines and log entries, with their envelopes, receipts,
 *   decisions and roster bodies;
 * - checkpoints;
 * - retained replay contexts and policy documents.
 *
 * Kinds are decoded by grammar (R-SIG-4 as amended by R-DECL-2): any name
 * of `[a-z][a-z0-9-]{0,31}` decodes, in envelope `v: 1` or, with a
 * `binding`, `v: 2` (R-DECL-16). Whether the kind, its binding and its body
 * fit the declarations in force at the entry's seq is verify's judgement
 * (declared.ts), not this boundary's.
 *
 * Each function either returns a value of the contract's shape, or throws
 * `Malformed` naming the first bad field. It checks the fields that verify
 * reads, and the type of every closed union it branches on. It does not
 * check signatures or digests: verify does that on the decoded value.
 */

import type { AnyPolicyDocument, CheckerConfig, CheckerConfigV2, Checkpoint, ChunkedLine, LogEntry, LogLayout, ReplayContext } from "@generalbusiness/artroom-contract";
import { ARTROOM_LEGACY_V1 } from "@generalbusiness/artroom-contract";
import { PLATFORM_KINDS, STEPS_VERSIONS, validateCheckerConfig, validateCheckerConfigV2, validatePolicy, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { canonicalize, fromUtf8, parseStrict } from "./canonical.ts";
import { hex } from "./crypto.ts";
import { parseTime } from "./time.ts";

export class Malformed extends Error {
  override readonly name = "Malformed";
}

/**
 * A retained policy document names a steps version or an evaluator profile
 * this verifier does not carry (R-DECL-14, R-DECL-22). A limit of the
 * verifier, not a finding against the log.
 */
export class Unsupported extends Error {
  override readonly name = "Unsupported";
  readonly reason: "steps-unsupported" | "profile-unsupported";
  readonly version: string;
  constructor(reason: "steps-unsupported" | "profile-unsupported", version: string) {
    super(`${reason === "steps-unsupported" ? "the steps version" : "the evaluator profile"} ${version} is not one this verifier carries`);
    this.reason = reason;
    this.version = version;
  }
}

/** The versions a verifier carries (R-DECL-14, R-DECL-22): by default, this platform's. */
export interface Carried {
  readonly steps: readonly string[];
  readonly profiles: readonly string[];
}

export const CARRIED: Carried = { steps: STEPS_VERSIONS, profiles: ["artroom-jsonata-v1"] };

/** A line that was not UTF-8. It keeps the bytes, so two different bad lines never compare equal. */
const NOT_UTF8 = "\u0000not-utf8:";

/** The lines of a segment. Bytes that are not UTF-8 give a marked line that `decodeEntry` rejects. */
export function segmentLines(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length && bytes[i] !== 0x0a) continue;
    const line = bytes.subarray(start, i);
    try {
      out.push(fromUtf8(line));
    } catch {
      out.push(NOT_UTF8 + hex(line));
    }
    start = i + 1;
  }
  return out;
}

/** UTF-8 text, or null when the bytes are not UTF-8. */
export function textOf(bytes: Uint8Array): string | null {
  try {
    return fromUtf8(bytes);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- primitives

/** The field names this boundary reads, so they can be read with dot access. */
type Field =
  // entries and system events
  | "format" | "seq" | "prev" | "at" | "hash" | "roomSig" | "entry" | "type" | "event" | "act" | "receipt"
  | "genesis" | "sig" | "admin" | "handle" | "key" | "recovery" | "roomKey" | "profile" | "policy" | "jsonata"
  | "decisions" | "to" | "through" | "commit" | "room"
  // decisions and replay contexts
  | "rule" | "kind" | "input" | "stamp" | "outcome" | "budget"
  // envelopes and receipts
  | "envelope" | "v" | "actor" | "idempotencyKey" | "body" | "authority" | "effects" | "flags" | "refusal"
  // roster ops
  | "op" | "member" | "role" | "custody" | "expiresAt" | "secretHash" | "invitation" | "secret" | "reason"
  | "team" | "members" | "kinds" | "lanes" | "delegation"
  // amendment 2: checker configurations, checks and onboarding grants
  | "createdAt" | "checkers" | "name" | "config" | "check" | "onboarding" | "grant" | "repo" | "operator" | "notAfter"
  // amendment 3: check carry
  | "lane" | "obligation" | "carried" | "notCarried"
  // amendment 6: declared acts (R-DECL-16, R-DECL-17, R-DECL-20, R-DECL-21)
  | "binding" | "acts" | "session" | "owner" | "preview" | "integration" | "base" | "tree" | "snapshots" | "digest"
  | "generation" | "reservedFor" | "leaseGeneration";
type Obj = { readonly [K in Field]?: unknown } & Readonly<Record<string, unknown>>;

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === "object" && v !== null && !Array.isArray(v);
const bad = (path: string, what: string): never => {
  throw new Malformed(`${path} ${what}`);
};
const obj = (v: unknown, path: string): Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : bad(path, "is not an object");
const str = (v: unknown, path: string): string => (typeof v === "string" ? v : bad(path, "is not a string"));
const time = (v: unknown, path: string): string => (parseTime(v) !== null ? (v as string) : bad(path, "is not an RFC 3339 UTC time"));
const seqOf = (v: unknown, path: string): number => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : bad(path, "is not a sequence number"));
const oneOf = <T extends string>(v: unknown, path: string, allowed: readonly T[]): T =>
  allowed.includes(v as T) ? (v as T) : bad(path, `is not one of ${allowed.join(", ")}`);
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : bad(path, "is not an array"));
const strs = (v: unknown, path: string): string[] => arr(v, path).map((x, i) => str(x, `${path}[${i}]`));
const optional = <T>(o: Obj, k: string, check: (v: unknown, path: string) => T, path: string): T | undefined =>
  k in o ? check(o[k], `${path}.${k}`) : undefined;
const starOr = (v: unknown, path: string, item: (v: unknown, path: string) => unknown) =>
  v === "*" ? v : arr(v, path).forEach((x, i) => item(x, `${path}[${i}]`));

// ------------------------------------------------------------ the contract

const FORMAT = ["artroom-log-v1"] as const;
/** The legacy vocabulary's kinds: what a `v1`-shape grant may name (R-ADM-5, R-DECL-1). */
const ENVELOPE_KINDS = ARTROOM_LEGACY_V1.envelope.kinds as readonly string[];
/** A kind's name (R-SIG-4 as amended, R-DECL-2). */
export const KIND_GRAMMAR = /^[a-z][a-z0-9-]{0,31}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
/** Platform kinds a grant may name plainly; `roster` and `recover` never (R-DECL-17). */
const DELEGABLE_PLATFORM = ["renew"] as const;
const RECOVER_OPS = ["open", "take", "version", "approve", "land", "release", "note"] as const;
const ROLES = ["admin", "maintainer", "member", "agent", "checker"] as const;
const CUSTODY = ["client", "room"] as const;
const REVOCATION = ["retired", "compromised"] as const;
const RULE_KINDS = ["refuse", "require", "carry", "land", "notify"] as const;
const CONTEXT_KINDS = RULE_KINDS;
const SYSTEM_EVENTS = [
  "genesis",
  "lease-expired",
  "policy-activated",
  "obligations-recomputed",
  "check-carried",
  "land-evaluated",
  "land-reserved",
  "abort-attempt",
  "publication-unresolved",
  "land-outcome",
  "revert-lane",
  "notified",
  "checkpoint",
  // R-LOG-5 as amended (R-DECL-10, R-DECL-20)
  "prepared",
  "reservation-ended",
] as const;

function decision(v: unknown, path: string): void {
  const d = obj(v, path);
  str(d.rule, `${path}.rule`);
  oneOf(d.kind, `${path}.kind`, RULE_KINDS);
  str(d.policy, `${path}.policy`);
  str(d.input, `${path}.input`);
  const s = obj(d.stamp, `${path}.stamp`);
  str(s.profile, `${path}.stamp.profile`);
  str(s.jsonata, `${path}.stamp.jsonata`);
  obj(d.outcome, `${path}.outcome`);
}

const decisions = (v: unknown, path: string) => arr(v, path).forEach((d, i) => decision(d, `${path}[${i}]`));

function genesis(v: unknown, path: string): void {
  const g = obj(v, path);
  oneOf(g.format, `${path}.format`, FORMAT);
  const admin = obj(g.admin, `${path}.admin`);
  str(admin.handle, `${path}.admin.handle`);
  str(admin.key, `${path}.admin.key`);
  str(g.repo, `${path}.repo`);
  if ("onboarding" in g) {
    const o = obj(g.onboarding, `${path}.onboarding`);
    str(o.sig, `${path}.onboarding.sig`);
    const grant = obj(o.grant, `${path}.onboarding.grant`);
    if (grant.v !== 1) bad(`${path}.onboarding.grant.v`, "is not 1");
    for (const k of ["repo", "admin", "operator"] as const) str(grant[k], `${path}.onboarding.grant.${k}`);
    time(grant.notAfter, `${path}.onboarding.grant.notAfter`);
  }
  str(g.recovery, `${path}.recovery`);
  time(g.createdAt, `${path}.createdAt`);
  str(g.roomKey, `${path}.roomKey`);
  const profile = obj(g.profile, `${path}.profile`);
  str(profile.policy, `${path}.profile.policy`);
  str(profile.jsonata, `${path}.profile.jsonata`);
}

function systemEvent(v: unknown, path: string): void {
  const ev = obj(v, path);
  switch (oneOf(ev.type, `${path}.type`, SYSTEM_EVENTS)) {
    case "genesis":
      genesis(ev.genesis, `${path}.genesis`);
      str(ev.sig, `${path}.sig`);
      break;
    case "policy-activated": {
      str(ev.policy, `${path}.policy`);
      let previous: string | null = null;
      arr(ev.checkers, `${path}.checkers`).forEach((c, i) => {
        const q = `${path}.checkers[${i}]`;
        const name = str(obj(c, q).name, `${q}.name`);
        str((c as Obj).config, `${q}.config`);
        if (previous !== null && !(previous < name)) bad(`${q}.name`, "is not in strictly ascending order");
        previous = name;
      });
      break;
    }
    case "obligations-recomputed":
      str(ev.policy, `${path}.policy`);
      decisions(ev.decisions, `${path}.decisions`);
      break;
    case "check-carried":
      for (const k of ["lane", "obligation", "act", "policy"] as const) str(ev[k], `${path}.${k}`);
      {
        const o = obj(ev.outcome, `${path}.outcome`);
        if (typeof o.carried !== "boolean") bad(`${path}.outcome.carried`, "is not a boolean");
        if (o.carried === false) str(obj(o.notCarried, `${path}.outcome.notCarried`).act, `${path}.outcome.notCarried.act`);
      }
      decisions(ev.decisions, `${path}.decisions`);
      break;
    case "land-evaluated":
      decisions(ev.decisions, `${path}.decisions`);
      break;
    case "notified":
      str(ev.entry, `${path}.entry`);
      decisions(ev.decisions, `${path}.decisions`);
      strs(ev.to, `${path}.to`);
      break;
    case "checkpoint":
      seqOf(ev.through, `${path}.through`);
      str(ev.hash, `${path}.hash`);
      str(ev.commit, `${path}.commit`);
      break;
    case "prepared": {
      const o = obj(ev.owner, `${path}.owner`);
      if ("preview" in o) {
        const p = obj(o.preview, `${path}.owner.preview`);
        str(p.lane, `${path}.owner.preview.lane`);
        seqOf(p.generation, `${path}.owner.preview.generation`); // V:d-prepared-owner
      } else {
        str(o.op, `${path}.owner.op`);
        str(o.lane, `${path}.owner.lane`);
        seqOf(o.generation, `${path}.owner.generation`);
      }
      for (const k of ["integration", "base", "tree"] as const) str(ev[k], `${path}.${k}`); // V:d-prepared
      arr(ev.snapshots, `${path}.snapshots`).forEach((x, i) => {
        const q = `${path}.snapshots[${i}]`;
        for (const k of ["check", "commit", "digest"] as const) str(obj(x, q)[k], `${q}.${k}`);
      });
      break;
    }
    case "reservation-ended":
      str(ev.lane, `${path}.lane`); // V:d-reservation
      break;
    default:
      // The other events carry nothing verify reads.
      break;
  }
}

/** A signed map from declared kind to binding (R-DECL-17): grammar keys, digest values. */
function grantMap(v: unknown, path: string): void {
  for (const [k, b] of Object.entries(obj(v, path))) {
    if (!KIND_GRAMMAR.test(k)) bad(`${path}.${k}`, "is not a kind name"); // V:d-map-key
    if (!DIGEST.test(str(b, `${path}.${k}`))) bad(`${path}.${k}`, "is not a binding"); // V:d-map-value
  }
}

/**
 * The kinds a grant names. With `acts` it has the `v2` shape: platform kinds
 * by name and declared kinds by binding (R-DECL-17). Without, the legacy
 * shape: legacy kinds, or `*`.
 */
function grantKinds(b: Obj, path: string): void {
  if ("acts" in b) {
    arr(b.kinds, `${path}.kinds`).forEach((x, i) => oneOf(x, `${path}.kinds[${i}]`, DELEGABLE_PLATFORM)); // V:d-map-kinds
    grantMap(b.acts, `${path}.acts`);
  } else starOr(b.kinds, `${path}.kinds`, (x, q) => oneOf(x, q, ENVELOPE_KINDS));
}

function rosterOp(v: unknown, path: string): void {
  const b = obj(v, path);
  const op = oneOf(b.op, `${path}.op`, ["invite", "join", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate", "rotate-recovery"] as const);
  const p = (k: string) => `${path}.${k}`;
  switch (op) {
    case "invite":
      str(b.member, p("member"));
      optional(b, "role", (x, q) => oneOf(x, q, ROLES), path);
      oneOf(b.custody, p("custody"), CUSTODY);
      time(b.expiresAt, p("expiresAt"));
      str(b.secretHash, p("secretHash"));
      if ("session" in b) grantKinds(obj(b.session, p("session")), p("session")); // V:d-session
      break;
    case "join":
      str(b.invitation, p("invitation"));
      str(b.secret, p("secret"));
      break;
    case "set-role":
      str(b.member, p("member"));
      oneOf(b.role, p("role"), ROLES);
      break;
    case "remove":
      str(b.member, p("member"));
      break;
    case "revoke-key":
      str(b.key, p("key"));
      oneOf(b.reason, p("reason"), REVOCATION);
      break;
    case "team":
      str(b.team, p("team"));
      strs(b.members, p("members"));
      break;
    case "delegate":
      str(b.to, p("to"));
      // Any kind is well formed here; R-ADM-5 (roster, or beyond the role) and R-DECL-17 are judged by the roster replay.
      grantKinds(b, path);
      starOr(b.lanes, p("lanes"), str);
      time(b.expiresAt, p("expiresAt"));
      break;
    case "undelegate":
      str(b.delegation, p("delegation"));
      break;
    case "rotate-recovery":
      str(b.key, p("key"));
      break;
  }
}

function signedEnvelope(v: unknown, path: string): void {
  const s = obj(v, path);
  str(s.sig, `${path}.sig`);
  const env = obj(s.envelope, `${path}.envelope`);
  const p = (k: string) => `${path}.envelope.${k}`;
  if (env.v !== 1 && env.v !== 2) bad(p("v"), "is not 1 or 2"); // V:d-v
  str(env.room, p("room"));
  str(env.actor, p("actor"));
  const kind = str(env.kind, p("kind"));
  if (!KIND_GRAMMAR.test(kind)) bad(p("kind"), "is not a kind name: [a-z][a-z0-9-]{0,31}"); // V:d-kind
  if (env.v === 2) {
    // R-DECL-16: platform kinds are signed in v: 1; a declared kind's v: 2 envelope carries its binding.
    if (PLATFORM_KINDS.includes(kind)) bad(p("v"), `is 2, but ${kind} is a platform kind, signed in v: 1`); // V:d-platform-v2
    if (!DIGEST.test(str(env.binding, p("binding")))) bad(p("binding"), "is not a binding"); // V:d-binding
  } else if ("binding" in env) bad(p("binding"), "is only in a v: 2 envelope"); // V:d-binding-v1
  if (!("target" in env)) bad(p("target"), "is missing");
  if (!("body" in env)) bad(p("body"), "is missing");
  str(env.idempotencyKey, p("idempotencyKey"));
  optional(env, "delegation", str, `${path}.envelope`);
  if (kind === "roster") rosterOp(env.body, p("body"));
  if (kind === "recover") oneOf(obj(env.body, p("body")).op, p("body.op"), RECOVER_OPS); // V:d-recover-op
  // A legacy check's binding fields; a declared act's step fields are judged against its declaration (declared.ts).
  if (kind === "check" && env.v === 1) {
    const b = obj(env.body, p("body"));
    str(b.obligation, p("body.obligation"));
    str(b.check, p("body.check"));
    str(b.config, p("body.config"));
  }
}

/** One sealed log entry from a segment line. */
export function decodeEntry(line: string): LogEntry {
  if (line.startsWith(NOT_UTF8)) throw new Malformed("the line is not UTF-8");
  let v: unknown;
  try {
    v = parseStrict(line);
  } catch (e) {
    throw new Malformed(`the line is not strict JSON: ${(e as Error).message}`);
  }
  const e = obj(v, "entry");
  oneOf(e.format, "format", FORMAT);
  seqOf(e.seq, "seq");
  if (e.prev !== null) str(e.prev, "prev");
  time(e.at, "at");
  str(e.hash, "hash");
  str(e.roomSig, "roomSig");
  const body = obj(e.entry, "entry");
  const type = oneOf(body.type, "entry.type", ["act", "refusal", "system"] as const);
  if (type === "system") systemEvent(body.event, "entry.event");
  else {
    signedEnvelope(body.act, "entry.act");
    const r = obj(body.receipt, "entry.receipt");
    oneOf(r.outcome, "entry.receipt.outcome", [type === "act" ? "accepted" : "refused"] as const);
    obj(r.authority, "entry.receipt.authority");
    decisions(r.decisions, "entry.receipt.decisions");
    if (type === "act") {
      arr(r.effects, "entry.receipt.effects").forEach((x, i) => str(obj(x, `entry.receipt.effects[${i}]`).type, `entry.receipt.effects[${i}].type`));
      strs(r.flags, "entry.receipt.flags");
    } else obj(r.refusal, "entry.receipt.refusal");
  }
  return v as LogEntry;
}

/** A log commit's `checkpoint.json`. */
export function decodeCheckpoint(bytes: Uint8Array): Checkpoint {
  const text = textOf(bytes);
  if (text === null) throw new Malformed("checkpoint.json is not UTF-8");
  let v: unknown;
  try {
    v = parseStrict(text);
  } catch (e) {
    throw new Malformed(`checkpoint.json is not strict JSON: ${(e as Error).message}`);
  }
  const c = obj(v, "checkpoint");
  oneOf(c.format, "checkpoint.format", FORMAT);
  str(c.room, "checkpoint.room");
  seqOf(c.through, "checkpoint.through");
  str(c.hash, "checkpoint.hash");
  time(c.at, "checkpoint.at");
  str(c.roomKey, "checkpoint.roomKey");
  if ("layout" in c) decodeLayout(c["layout"], "checkpoint.layout");
  str(c.sig, "checkpoint.sig");
  return v as Checkpoint;
}

/**
 * A checkpoint's `layout` (R-LOG-16): exactly `{ version: 2, from }` with a
 * seq `from`. Any other value is malformed; an absent one is layout 1.
 */
export function decodeLayout(v: unknown, path = "layout"): LogLayout {
  const l = obj(v, path);
  if (Object.keys(l).length !== 2) bad(path, "is not { version, from }");
  if (l["version"] !== 2) bad(`${path}.version`, "is not 2");
  seqOf(l["from"], `${path}.from`);
  return l as unknown as LogLayout;
}

/** The start of every `ChunkedLine`, and of no entry: an entry's first key is `at`. */
const CHUNKED_PREFIX = '{"chunked":';

/**
 * A segment line that stands for a chunked entry file (R-LOG-18), or null
 * when the line is not one. A line that starts as one must be exactly a
 * canonical `ChunkedLine`, or it is malformed.
 */
export function decodeChunkedLine(line: string): ChunkedLine | null {
  if (!line.startsWith(CHUNKED_PREFIX)) return null;
  let v: unknown;
  try {
    v = parseStrict(line);
  } catch (e) {
    throw new Malformed(`the chunked line is not strict JSON: ${(e as Error).message}`);
  }
  const c = obj(v, "chunked line");
  const inner = obj(c["chunked"], "chunked");
  if (!Number.isSafeInteger(inner["bytes"]) || (inner["bytes"] as number) < 0) bad("chunked.bytes", "is not a length");
  if (!/^sha256:[0-9a-f]{64}$/.test(str(inner["digest"], "chunked.digest"))) bad("chunked.digest", "is not a SHA-256 digest");
  seqOf(c.seq, "seq");
  if (canonicalize(v) !== line || Object.keys(c).length !== 2 || Object.keys(inner).length !== 2) bad("chunked line", "is not exactly a canonical ChunkedLine");
  return v as ChunkedLine;
}

export function decodeRetained(kind: "json", bytes: Uint8Array): unknown;
export function decodeRetained(kind: "input", bytes: Uint8Array): ReplayContext;
export function decodeRetained(kind: "policy", bytes: Uint8Array, carried?: Carried): AnyPolicyDocument;
export function decodeRetained(kind: "checker", bytes: Uint8Array): CheckerConfig | CheckerConfigV2;
/**
 * A retained file. Under `inputs/` it is a replay context. Under
 * `policies/` it is a policy document (`v1` or `v2`) or a checker
 * configuration (`v1` or `v2`), which only the `policy-activated` event
 * naming it tells apart; `json` checks only that it is strict JSON.
 *
 * A policy document that names a steps version or evaluator profile the
 * verifier does not carry throws `Unsupported` (R-DECL-14, R-DECL-22). A
 * `v2` document is checked here as a document; what only the room knows
 * (its historical opening kinds and its checker configurations) is checked
 * when it is activated (verify.ts).
 */
export function decodeRetained(kind: "json" | "input" | "policy" | "checker", bytes: Uint8Array, carried: Carried = CARRIED): unknown {
  const text = textOf(bytes);
  if (text === null) throw new Malformed(`the retained ${kind} is not UTF-8`);
  let v: unknown;
  try {
    v = parseStrict(text);
  } catch (e) {
    throw new Malformed(`the retained file is not strict JSON: ${(e as Error).message}`);
  }
  switch (kind) {
    case "json":
      return v;
    case "policy": {
      const d: Readonly<Record<string, unknown>> = isObject(v) ? v : {};
      // The versions first: a document this verifier cannot read is a limit, not a malformed file.
      if (typeof d["profile"] === "string" && !carried.profiles.includes(d["profile"])) throw new Unsupported("profile-unsupported", d["profile"]); // V:d-profile
      if (d["format"] === "artroom-policy-v2") {
        if (typeof d["steps"] === "string" && !carried.steps.includes(d["steps"])) throw new Unsupported("steps-unsupported", d["steps"]); // V:d-steps
        // A steps version the verifier carries but the policy package does not (a registered one) validates as the first.
        const doc = typeof d["steps"] === "string" && !STEPS_VERSIONS.includes(d["steps"]) ? { ...d, steps: STEPS_VERSIONS[0] } : d;
        const names = Object.values(isObject(doc["acts"]) ? doc["acts"] : {}).flatMap((a) => (isObject(a) && Array.isArray(a["threads"]) ? a["threads"] : []));
        const checked = validatePolicyV2(doc, { historicalOpeningKinds: names.filter((n): n is string => typeof n === "string") });
        if (!checked.ok) throw new Malformed(`the retained policy is not a policy document: ${checked.problems[0]}`); // V:d-policy-v2
        return v;
      }
      const checked = validatePolicy(v);
      if (!checked.ok) throw new Malformed(`the retained policy is not a policy document: ${checked.problems[0]}`);
      return checked.value;
    }
    case "checker": {
      const checked = isObject(v) && v["format"] === "artroom-checker-v2" ? validateCheckerConfigV2(v) : validateCheckerConfig(v);
      if (!checked.ok) throw new Malformed(`the retained checker configuration is not one: ${checked.problems[0]}`);
      return checked.value;
    }
    case "input": {
      const c = obj(v, "context");
      oneOf(c.kind, "context.kind", CONTEXT_KINDS);
      obj(c.input, "context.input");
      obj(c.budget, "context.budget");
      return v;
    }
  }
}
