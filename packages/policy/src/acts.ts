/**
 * The acts validator (docs/protocol.md R-DECL-24; notes/2026-10-02-declared-acts.md
 * section 3.4). It checks a candidate `artroom-policy-v2` document and its
 * checker configurations. An invalid one is refused with `policy-invalid`,
 * so an invalid declaration can never activate (R-POL-1).
 *
 * Stage 1: it is exported, and nothing at runtime calls it yet.
 *
 * Each guard is one `if` marked `// G:<id>`. The ids are the rows of the
 * mutation table in plans/README.md ("Declared acts stage 1"): each guard,
 * disabled, turns a named test red.
 */

import type { CheckerConfigV2, PlatformRule, PolicyDocumentV2, Step, TargetShape } from "@generalbusiness/artroom-contract";
import { globProblem } from "./glob.ts";
import { Problems, checkerFields, documentFields, isObj, result, type Obj, type Validation } from "./validate.ts";
import { safeName } from "./values.ts";

/** The platform's bounds on declarations (R-DECL-26). */
export const DECLARATION_BOUNDS = {
  kinds: 64,
  label: 128,
  help: 4096,
  wording: 512,
  fields: 32,
  text: 16384,
  globs: 64,
  enumValues: 64,
  threads: 64,
  templateGlobs: 64,
  templateChars: 256,
  leaseSeconds: { min: 10, max: 86400 },
  reserveSeconds: { min: 1, max: 600 },
  /** The whole document's canonical JSON, in bytes: what a room stores in one row, with room to spare. */
  documentBytes: 1048576,
} as const;

/** The steps versions this platform carries (R-DECL-14). */
export const STEPS_VERSIONS: readonly string[] = ["artroom-steps-v1"];

/** The platform kinds (R-DECL-2). */
export const PLATFORM_KINDS: readonly string[] = ["renew", "roster", "recover"];

/** Names no document may declare: platform kinds, `room` and the system event names (R-DECL-2). */
export const RESERVED_KINDS: readonly string[] = [
  ...PLATFORM_KINDS,
  "room",
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
  "prepared",
  "reservation-ended",
];

/** The steps each target shape allows (R-DECL-4). */
export const STEPS_FOR_TARGET: Readonly<Record<TargetShape, readonly Step[]>> = {
  none: ["open", "comment"],
  thread: ["take", "version", "release", "hand-over"],
  version: ["review", "check", "land"],
  entry: ["comment"],
  line: ["comment"],
};

/** The body fields each step itself requires or allows (R-DECL-5). A declaration may not reuse them. */
export const STEP_FIELDS: Readonly<Record<Step, readonly string[]>> = {
  open: ["scope"],
  take: ["scope", "expectedGeneration", "lease"],
  version: ["lease", "expectedGeneration", "head"],
  review: ["head", "verdict", "scope", "dependsOn"],
  check: ["obligation", "check", "integration", "input", "config", "runner", "volatile", "ok", "detail", "landOp"],
  land: ["lease", "head"],
  release: ["lease", "note"],
  "hand-over": ["lease", "to"],
  comment: ["replyTo"],
};

/** The slots a refusal template may use (R-DECL-13). */
export const REFUSAL_SLOTS: readonly string[] = ["holder", "lane", "generation", "obligation", "path", "reservedFor", "until", "kind"];

/** Every platform refusal code. `satisfies` keeps it complete as `PlatformRule` grows. */
const PLATFORM_RULES = {
  "invalid-body": true,
  "body-too-large": true,
  "not-member": true,
  "key-revoked": true,
  "delegation-invalid": true,
  "role-forbids": true,
  "idempotency-mismatch": true,
  "secret-detected": true,
  "invitation-invalid": true,
  "key-in-use": true,
  "custody-mismatch": true,
  "lane-unknown": true,
  "lane-held": true,
  "not-holder": true,
  "lease-fenced": true,
  "generation-moved": true,
  "scope-overlap": true,
  "glob-invalid": true,
  "head-unknown": true,
  "head-mismatch": true,
  "outside-claim": true,
  "diff-too-large": true,
  "policy-invalid": true,
  "land-in-progress": true,
  "recovery-scope": true,
  "workspace-not-ready": true,
  "not-authorized-reviewer": true,
  "self-review": true,
  "not-authorized-checker": true,
  "check-binding": true,
  "obligation-unknown": true,
  "obligation-open": true,
  "objection-open": true,
  "admin-required": true,
  "last-admin": true,
  "recovery-only": true,
  "policy-budget-exceeded": true,
  "policy-type-error": true,
  "kind-undeclared": true,
  "binding-stale": true,
  "wrong-thread": true,
  "scope-fixed": true,
  reserved: true,
} as const satisfies Record<PlatformRule, true>;

const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const FIELD = /^[a-z][A-Za-z0-9]{0,31}$/;
const ENUM_VALUE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SLOT = /\{([^{}]*)\}/g;
const TARGETS: readonly TargetShape[] = ["none", "thread", "version", "entry", "line"];
const THREADED: readonly TargetShape[] = ["thread", "version", "line"];
const ROLES: readonly string[] = ["maintainer", "member", "agent", "checker"];
const CHECKER_STEPS: readonly string[] = ["check", "comment"];
const FIELD_KEYS: Readonly<Record<string, readonly string[]>> = {
  text: ["max"],
  int: ["min", "max"],
  bool: [],
  enum: ["values"],
  globs: ["max"],
  member: [],
  act: [],
  segment: [],
};

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const isString = (v: unknown): v is string => typeof v === "string";
const distinct = (list: readonly unknown[]) => new Set(list).size === list.length;

/** What the room knows that the document cannot say. */
export interface PolicyV2Context {
  /** Kinds that opened at least one thread in this room before validation (R-DECL-8). */
  readonly historicalOpeningKinds?: readonly string[];
  /** The proposed head's checker configurations, by checker name (R-DECL-18). */
  readonly checkers?: Readonly<Record<string, unknown>>;
}

/** A validation, with warnings that never refuse (R-DECL-24: `hold-unending`). */
export type PolicyV2Validation = Validation<PolicyDocumentV2> & { readonly warnings: readonly string[] };

interface Act {
  readonly kind: string;
  readonly at: string;
  readonly d: Obj;
  /** Target shape to its steps, for the shapes that are valid. */
  readonly targets: ReadonlyMap<TargetShape, readonly string[]>;
  readonly threads: readonly string[];
  readonly fields: Obj;
}

const stepsOf = (a: Act) => [...a.targets.values()].flat();

/** Check a candidate `v2` `.artroom/policy.json` and its checker configurations (R-DECL-24). */
export function validatePolicyV2(doc: unknown, ctx: PolicyV2Context = {}): PolicyV2Validation {
  const p = new Problems();
  const warnings: string[] = [];
  const done = () => ({ ...result<PolicyDocumentV2>(p, doc, "policy"), warnings });
  if (!isObj(doc)) {
    p.add("policy", "must be a JSON object"); // G:doc-object
    return done();
  }
  p.keys("policy", doc, ["format", "profile", "steps", "owners", "carry", "lanes", "retiredEvidence", "rules", "acts"]); // G:doc-keys
  if (doc["format"] !== "artroom-policy-v2") p.add("format", "must be artroom-policy-v2"); // G:doc-format
  if (doc["profile"] !== "artroom-jsonata-v1") p.add("profile", "must be artroom-jsonata-v1"); // G:doc-profile
  if (!isString(doc["steps"]) || !STEPS_VERSIONS.includes(doc["steps"])) p.add("steps", `must be a steps version this platform carries: ${STEPS_VERSIONS.join(", ")}`); // G:doc-steps

  const raw = isObj(doc["acts"]) ? doc["acts"] : null;
  if (!raw) p.add("acts", "must be an object"); // G:acts-object
  const kinds = raw ? Object.keys(raw) : [];
  if (kinds.length > DECLARATION_BOUNDS.kinds) p.add("acts", `declares more than ${DECLARATION_BOUNDS.kinds} kinds`); // G:acts-count
  const declared = new Set(kinds);
  documentFields(p, doc, (k) => isString(k) && (declared.has(k) || PLATFORM_KINDS.includes(k))); // G:rule-on (the predicate)

  const acts: Act[] = [];
  for (const kind of kinds) {
    const at = `acts.${kind}`;
    if (!KIND.test(kind)) p.add(at, "a kind must match [a-z][a-z0-9-]{0,31}"); // G:kind-grammar
    if (RESERVED_KINDS.includes(kind)) p.add(at, `${kind} is reserved by the platform`); // G:kind-reserved
    // A kind is a key of every grant map, which a rule input carries, and the evaluator's value profile (values.ts,
    // `safeName`) admits no key so named. Of the kind grammar that is `constructor` and `prototype` only.
    if (!safeName(kind)) p.add(at, `${kind} is a key name the evaluator's value profile reserves`); // G2:kind-profile
    const d = raw![kind];
    if (!isObj(d)) {
      p.add(at, "must be an object"); // G:decl-object
      continue;
    }
    acts.push(declaration(p, kind, at, d));
  }

  const openers = new Set(acts.filter((a) => stepsOf(a).includes("open")).map((a) => a.kind));
  const historical = new Set(ctx.historicalOpeningKinds ?? []);
  for (const a of acts) {
    a.threads.forEach((name, i) => {
      const ok = name === "room" || openers.has(name) || historical.has(name);
      if (!ok) p.add(`${a.at}.threads[${i}]`, `${name} is not room, a kind declared here with step open, or a kind that has opened a thread in this room`); // G:threads-known
    });
    if (stepsOf(a).includes("hand-over")) {
      for (const name of a.threads) {
        const opener = acts.find((o) => o.kind === name && openers.has(name));
        if (opener && !(isObj(opener.d["hold"]) && opener.d["hold"]["reserveSeconds"] !== undefined)) p.add(`${a.at}.threads`, `${name} has no reserveSeconds, so its threads cannot be handed over`); // G:handover-reserve
      }
    }
  }

  soundness(p, acts, warnings, openers);
  checkers(p, ctx.checkers ?? {}, acts);
  // R-DECL-26: the bounds above still allow a document of several megabytes, more than a room can store in one row.
  const size = canonicalBytes(doc);
  if (size === null) p.add("policy", "must be plain JSON"); // G2:doc-plain
  else if (size > DECLARATION_BOUNDS.documentBytes) p.add("policy", `the document's canonical JSON must be at most ${DECLARATION_BOUNDS.documentBytes} bytes`); // G2:doc-bytes
  return done();
}

/**
 * The UTF-8 size of a JSON value's canonical form (RFC 8785), or null if
 * it has none. Sorting keys does not change a size, and RFC 8785 writes
 * strings and safe integers as `JSON.stringify` does, so this is the size
 * of the compact JSON text. It is counted here, not by the evaluator's
 * canonical writer: that one refuses the key names it reserves, which a
 * legal owner path such as `constructor` is, before it has counted what
 * follows them.
 */
function canonicalBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return null;
  }
}

function declaration(p: Problems, kind: string, at: string, d: Obj): Act {
  p.keys(at, d, ["label", "targets", "threads", "body", "who", "hold", "refusals", "help"]); // G:decl-keys
  const label = d["label"];
  if (!isString(label) || label.trim() === "" || label.length > DECLARATION_BOUNDS.label) p.add(`${at}.label`, `must be 1 to ${DECLARATION_BOUNDS.label} characters`); // G:label
  const help = d["help"];
  if (help !== undefined && (!isString(help) || bytes(help) > DECLARATION_BOUNDS.help)) p.add(`${at}.help`, `must be a string of at most ${DECLARATION_BOUNDS.help} bytes`); // G:help

  // Targets and steps (R-DECL-4).
  const targets = new Map<TargetShape, readonly string[]>();
  const t = d["targets"];
  if (!isObj(t) || Object.keys(t).length === 0) p.add(`${at}.targets`, "must name at least one target shape"); // G:targets-nonempty
  else
    for (const [shape, steps] of Object.entries(t)) {
      const where = `${at}.targets.${shape}`;
      if (!TARGETS.includes(shape as TargetShape)) {
        p.add(where, `${shape} is not a target shape`); // G:target-shape
        continue;
      }
      const s = shape as TargetShape;
      const pair = s === "thread" && Array.isArray(steps) && steps.length === 2 && steps[0] === "version" && steps[1] === "land";
      const one = Array.isArray(steps) && steps.length === 1 && STEPS_FOR_TARGET[s].includes(steps[0] as Step);
      if (!pair && !one) p.add(where, `must be one step that ${shape} allows (${STEPS_FOR_TARGET[s].join(", ")})${s === "thread" ? ", or version then land" : ""}`); // G:target-steps
      else targets.set(s, steps as readonly string[]);
    }
  const steps = [...targets.values()].flat();

  // Threads (R-DECL-8).
  const threaded = [...targets.keys()].some((s) => THREADED.includes(s));
  const th = d["threads"];
  let threads: readonly string[] = [];
  if (threaded && th === undefined) p.add(`${at}.threads`, "is required for an act with a thread, version or line target"); // G:threads-required
  if (!threaded && th !== undefined) p.add(`${at}.threads`, "is only for an act with a thread, version or line target"); // G:threads-unused
  if (th !== undefined) {
    if (!Array.isArray(th) || th.length < 1 || th.length > DECLARATION_BOUNDS.threads || !th.every(isString) || !distinct(th)) p.add(`${at}.threads`, `must be 1 to ${DECLARATION_BOUNDS.threads} distinct kind names`); // G:threads-list
    else threads = th as string[];
  }

  // Body fields (R-DECL-12).
  const fields = isObj(d["body"]) ? d["body"] : {};
  if (d["body"] !== undefined && !isObj(d["body"])) p.add(`${at}.body`, "must be an object"); // G:body-object
  if (Object.keys(fields).length > DECLARATION_BOUNDS.fields) p.add(`${at}.body`, `has more than ${DECLARATION_BOUNDS.fields} fields`); // G:body-count
  const taken = new Set(["because", ...steps.flatMap((s) => STEP_FIELDS[s as Step] ?? [])]);
  for (const [name, f] of Object.entries(fields)) field(p, `${at}.body.${name}`, name, f, taken, [...targets.keys()]);

  // Who (R-DECL-11).
  const who = d["who"];
  if (!isObj(who)) p.add(`${at}.who`, "must be an object"); // G:who-object
  else {
    p.keys(`${at}.who`, who, ["roles", "delegable"]); // G:who-keys
    const roles = who["roles"];
    if (!Array.isArray(roles) || !distinct(roles)) p.add(`${at}.who.roles`, "must be a list of distinct roles"); // G:roles-list
    else {
      for (const r of roles) {
        if (r === "admin") p.add(`${at}.who.roles`, "must not list admin: an admin may always sign a declared act"); // G:roles-admin
        else if (!ROLES.includes(r as string)) p.add(`${at}.who.roles`, `${JSON.stringify(r)} is not a role`); // G:roles-known
      }
      if (roles.includes("checker") && !steps.every((s) => CHECKER_STEPS.includes(s))) p.add(`${at}.who.roles`, "may list checker only for an act whose steps are check or comment"); // G:roles-checker
    }
    if (who["delegable"] !== undefined && typeof who["delegable"] !== "boolean") p.add(`${at}.who.delegable`, "must be true or false"); // G:delegable
  }

  // Hold (R-DECL-7, R-DECL-9, R-DECL-10).
  const opens = steps.includes("open");
  if (opens && d["hold"] === undefined) p.add(`${at}.hold`, "is required for an act with step open"); // G:hold-required
  if (!opens && d["hold"] !== undefined) p.add(`${at}.hold`, "is only for an act with step open"); // G:hold-unused
  if (d["hold"] !== undefined) hold(p, `${at}.hold`, d["hold"], fields);

  // Refusal wording (R-DECL-13).
  const refusals = d["refusals"];
  if (refusals !== undefined) {
    if (!isObj(refusals)) p.add(`${at}.refusals`, "must be an object"); // G:refusals-object
    else
      for (const [code, w] of Object.entries(refusals)) {
        const where = `${at}.refusals.${code}`;
        if (!Object.hasOwn(PLATFORM_RULES, code)) p.add(where, `${code} is not a platform refusal code`); // G:refusal-code
        if (!isObj(w)) {
          p.add(where, "must be an object with reason and fix"); // G:wording-object
          continue;
        }
        p.keys(where, w, ["reason", "fix"]); // G:refusal-keys
        for (const part of ["reason", "fix"]) wording(p, `${where}.${part}`, w[part]);
      }
  }

  return { kind, at, d, targets, threads, fields };
}

function field(p: Problems, at: string, name: string, f: unknown, taken: ReadonlySet<string>, targets: readonly TargetShape[]): void {
  if (!FIELD.test(name)) p.add(at, "a field name must match [a-z][A-Za-z0-9]{0,31}"); // G:field-name
  if (taken.has(name)) p.add(at, `${name} is a field of this act's steps, or because`); // G:field-reserved
  // A field is a key of the binding subject and of every rule input that carries the body, and the evaluator's value
  // profile, under which both are made canonical, admits no key so named: `constructor` and `prototype` only.
  if (!safeName(name)) p.add(at, `${name} is a key name the evaluator's value profile reserves`); // G2:field-profile
  if (!isObj(f)) return p.add(at, "must be an object"); // G:field-object
  const type = f["type"];
  if (!isString(type) || !Object.hasOwn(FIELD_KEYS, type)) return p.add(at, "type must be text, int, bool, enum, globs, member, act or segment"); // G:field-type
  p.keys(at, f, ["type", ...FIELD_KEYS[type]!, "optional", "requiredFor"]); // G:field-keys
  if (type === "text" && !isInt(f["max"], 1, DECLARATION_BOUNDS.text)) p.add(`${at}.max`, `must be an integer from 1 to ${DECLARATION_BOUNDS.text}`); // G:text-max
  if (type === "globs" && !isInt(f["max"], 1, DECLARATION_BOUNDS.globs)) p.add(`${at}.max`, `must be an integer from 1 to ${DECLARATION_BOUNDS.globs}`); // G:globs-max
  if (type === "int" && !(Number.isSafeInteger(f["min"]) && Number.isSafeInteger(f["max"]) && (f["min"] as number) <= (f["max"] as number))) p.add(at, "min and max must be safe integers, min at most max"); // G:int-range
  if (type === "enum") {
    const v = f["values"];
    if (!Array.isArray(v) || v.length < 1 || v.length > DECLARATION_BOUNDS.enumValues || !distinct(v) || !v.every((x) => isString(x) && ENUM_VALUE.test(x))) p.add(`${at}.values`, `must be 1 to ${DECLARATION_BOUNDS.enumValues} distinct values matching [a-z0-9][a-z0-9-]{0,63}`); // G:enum-values
  }
  if (f["optional"] !== undefined && typeof f["optional"] !== "boolean") p.add(`${at}.optional`, "must be true or false"); // G:optional-bool
  const rf = f["requiredFor"];
  if (rf !== undefined && f["optional"] !== undefined) p.add(at, "may say optional or requiredFor, not both"); // G:optional-and-requiredfor
  if (rf !== undefined && (!Array.isArray(rf) || rf.length === 0 || !distinct(rf) || !rf.every((x) => targets.includes(x as TargetShape)))) p.add(`${at}.requiredFor`, "must be a non-empty list of distinct target shapes of this act"); // G:requiredfor-targets
}

function hold(p: Problems, at: string, h: unknown, fields: Obj): void {
  if (!isObj(h)) return p.add(at, "must be an object"); // G:hold-object
  p.keys(at, h, ["scope", "conflict", "leaseSeconds", "reserveSeconds", "workspace"]); // G:hold-keys
  if (h["conflict"] !== undefined && h["conflict"] !== "exclusive" && h["conflict"] !== "by-scope") p.add(`${at}.conflict`, "must be exclusive or by-scope"); // G:hold-conflict
  const { leaseSeconds: l, reserveSeconds: r } = DECLARATION_BOUNDS;
  if (h["leaseSeconds"] !== undefined && !isInt(h["leaseSeconds"], l.min, l.max)) p.add(`${at}.leaseSeconds`, `must be an integer from ${l.min} to ${l.max}`); // G:hold-lease
  if (h["reserveSeconds"] !== undefined && !isInt(h["reserveSeconds"], r.min, r.max)) p.add(`${at}.reserveSeconds`, `must be an integer from ${r.min} to ${r.max}`); // G:hold-reserve
  if (h["workspace"] !== undefined && typeof h["workspace"] !== "boolean") p.add(`${at}.workspace`, "must be true or false"); // G:hold-workspace
  const scope = h["scope"];
  if (scope === "body.scope") return;
  if (!Array.isArray(scope) || scope.length < 1 || scope.length > DECLARATION_BOUNDS.templateGlobs) return p.add(`${at}.scope`, `must be body.scope or 1 to ${DECLARATION_BOUNDS.templateGlobs} globs`); // G:hold-scope
  scope.forEach((g, i) => {
    const where = `${at}.scope[${i}]`;
    if (!isString(g) || g.length > DECLARATION_BOUNDS.templateChars) return p.add(where, `must be a glob of at most ${DECLARATION_BOUNDS.templateChars} characters`); // G:template-chars
    for (const [, name] of g.matchAll(SLOT)) {
      const f = isObj(fields[name!]) ? (fields[name!] as Obj) : null;
      const usable = f !== null && (f["type"] === "segment" || f["type"] === "enum");
      const onOpen = f !== null && f["optional"] !== true && (f["requiredFor"] === undefined || (Array.isArray(f["requiredFor"]) && f["requiredFor"].includes("none")));
      if (!usable || !onOpen) p.add(where, `{${name}} must name a segment or enum field of this act that is required on target none`); // G:slot-field
    }
    const problem = globProblem(g.replace(SLOT, "x"));
    if (problem) p.add(where, `is not a valid glob once its slots are filled: ${problem}`); // G:template-glob
  });
}

function wording(p: Problems, at: string, text: unknown): void {
  if (!isString(text) || text.trim() === "" || bytes(text) > DECLARATION_BOUNDS.wording) return p.add(at, `must be 1 to ${DECLARATION_BOUNDS.wording} bytes`); // G:wording-length
  for (const [, name] of text.matchAll(SLOT)) if (!REFUSAL_SLOTS.includes(name!)) p.add(at, `{${name}} is not a refusal slot; use ${REFUSAL_SLOTS.map((s) => `{${s}}`).join(", ")}`); // G:wording-slot
  if (/[{}]/.test(text.replace(SLOT, ""))) p.add(at, "a brace must open a slot such as {holder}"); // G:wording-brace
}

function soundness(p: Problems, acts: readonly Act[], warnings: string[], openers: ReadonlySet<string>): void {
  const shares = (a: Act, b: Act) => a.threads.some((k) => b.threads.includes(k));
  const versioners = acts.filter((a) => stepsOf(a).includes("version"));
  for (const a of acts) {
    if ((a.targets.has("version") || a.targets.has("line")) && !versioners.some((v) => shares(v, a))) p.add(a.at, "acts on versions, but no declared act with step version acts on the same kinds of thread"); // G:sound-version
    if (stepsOf(a).includes("hand-over"))
      for (const k of a.threads)
        if (!acts.some((t) => stepsOf(t).includes("take") && t.threads.includes(k))) p.add(a.at, `hands ${k} threads over, but no declared act with step take acts on ${k}`); // G:sound-handover
  }
  for (const k of openers)
    if (!acts.some((e) => (stepsOf(e).includes("release") || stepsOf(e).includes("hand-over")) && e.threads.includes(k))) warnings.push(`hold-unending: no declared act can release or hand over a ${k} thread; only lease expiry ends it`); // G:warn-unending
}

function checkers(p: Problems, configs: Readonly<Record<string, unknown>>, acts: readonly Act[]): void {
  for (const [name, config] of Object.entries(configs)) {
    const at = `checkers.${name}`;
    const v = validateCheckerConfigV2(config);
    if (!v.ok) for (const problem of v.problems) p.add(at, problem); // G:checker-shape
    const act = isObj(config) ? config["act"] : undefined;
    if (!isString(act)) continue;
    const a = acts.find((x) => x.kind === act);
    if (!a) {
      p.add(`${at}.act`, `${act} is not declared in this document`); // G:checker-declared
      continue;
    }
    const version = a.targets.get("version");
    if (!(version && version.length === 1 && version[0] === "check")) p.add(`${at}.act`, `${act} must run only the step check on its version target`); // G:checker-step
    const who = isObj(a.d["who"]) ? a.d["who"] : {};
    if (!(Array.isArray(who["roles"]) && who["roles"].includes("checker"))) p.add(`${at}.act`, `${act} must list checker in who.roles`); // G:checker-role
    const required = Object.entries(a.fields).filter(([, f]) => isObj(f) && f["optional"] !== true && !(Array.isArray(f["requiredFor"]) && !f["requiredFor"].includes("version")));
    if (required.length) p.add(`${at}.act`, `${act} requires body field ${required[0]![0]}, which the checker service cannot fill`); // G:checker-body
  }
}

/** Check a candidate `artroom-checker-v2` configuration: the v1 fields and `act` (R-DECL-18). */
export function validateCheckerConfigV2(config: unknown): Validation<CheckerConfigV2> {
  const p = new Problems();
  if (!isObj(config)) {
    p.add("checker", "must be a JSON object"); // G:checker-object
    return result(p, config, "checker configuration");
  }
  p.keys("checker", config, ["format", "act", "inputs", "volatile", "timeoutSeconds", "advisory", "runner"]); // G:checker-keys
  if (config["format"] !== "artroom-checker-v2") p.add("format", "must be artroom-checker-v2"); // G:checker-format
  if (!isString(config["act"]) || !KIND.test(config["act"])) p.add("act", "must name the declared kind its checks are signed as"); // G:checker-act
  checkerFields(p, config);
  return result(p, config, "checker configuration");
}
