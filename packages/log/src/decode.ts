/**
 * The decoding boundary for untrusted log content. Everything `verify`
 * reads from a log commit, and everything a restarted publisher reads back,
 * passes through here before any field is dereferenced:
 * - segment lines and log entries, with their envelopes, receipts,
 *   decisions and roster bodies;
 * - checkpoints;
 * - retained replay contexts and policy documents.
 *
 * Each function either returns a value of the contract's shape, or throws
 * `Malformed` naming the first bad field. It checks the fields that verify
 * reads, and the type of every closed union it branches on. It does not
 * check signatures or digests: verify does that on the decoded value.
 */

import type { CheckerConfig, Checkpoint, LogEntry, PolicyDocument, ReplayContext } from "@generalbusiness/artroom-contract";
import { validateCheckerConfig, validatePolicy } from "@generalbusiness/artroom-policy";
import { fromUtf8, parseStrict } from "./canonical.ts";
import { hex } from "./crypto.ts";
import { parseTime } from "./time.ts";

export class Malformed extends Error {
  override readonly name = "Malformed";
}

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
  | "lane" | "obligation";
type Obj = { readonly [K in Field]?: unknown } & Readonly<Record<string, unknown>>;

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
const ENVELOPE_KINDS = ["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"] as const;
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
    default:
      // The other events carry nothing verify reads.
      break;
  }
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
      // Any kind is well formed here; R-ADM-5 (roster, or beyond the role) is judged by the roster replay.
      starOr(b.kinds, p("kinds"), (x, q) => oneOf(x, q, ENVELOPE_KINDS));
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
  if (env.v !== 1) bad(p("v"), "is not 1");
  str(env.room, p("room"));
  str(env.actor, p("actor"));
  const kind = oneOf(env.kind, p("kind"), ENVELOPE_KINDS);
  if (!("target" in env)) bad(p("target"), "is missing");
  if (!("body" in env)) bad(p("body"), "is missing");
  str(env.idempotencyKey, p("idempotencyKey"));
  optional(env, "delegation", str, `${path}.envelope`);
  if (kind === "roster") rosterOp(env.body, p("body"));
  if (kind === "check") {
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
  str(c.sig, "checkpoint.sig");
  return v as Checkpoint;
}

export function decodeRetained(kind: "json", bytes: Uint8Array): unknown;
export function decodeRetained(kind: "input", bytes: Uint8Array): ReplayContext;
export function decodeRetained(kind: "policy", bytes: Uint8Array): PolicyDocument;
export function decodeRetained(kind: "checker", bytes: Uint8Array): CheckerConfig;
/**
 * A retained file. Under `inputs/` it is a replay context. Under
 * `policies/` it is a policy document or a checker configuration, which
 * only the `policy-activated` event naming it tells apart; `json` checks
 * only that it is strict JSON.
 */
export function decodeRetained(kind: "json" | "input" | "policy" | "checker", bytes: Uint8Array): unknown {
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
      const checked = validatePolicy(v);
      if (!checked.ok) throw new Malformed(`the retained policy is not a policy document: ${checked.problems[0]}`);
      return checked.value;
    }
    case "checker": {
      const checked = validateCheckerConfig(v);
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
