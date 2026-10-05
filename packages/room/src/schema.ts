/**
 * Shape checks for everything a caller sends.
 *
 * - The envelope and its target are checked at admission step 1: an unknown
 *   field or a wrong type is `ArtroomError` `bad-request` (R-SIG-4).
 * - The body is checked at step 5: `invalid-body`, `body-too-large`
 *   (R-SIG-6) or `glob-invalid` (R-PATH-1), none of them recorded.
 *
 * Body checks also return the paths of fixed-format fields, which skip the
 * entropy check of the secret scan (R-SEC-4).
 */

import type { ActDeclaration, AnyPolicyDocument, DeclaredField, EnvelopeKind, PlatformRule, Step, TargetShape } from "@generalbusiness/artroom-contract";
import { DELEGABLE_PLATFORM, LEGACY_DELEGABLE, LEGACY_KINDS, TARGET_ORDER, declarationOf, isDeclared, isPlatformKind, shapeOf } from "@generalbusiness/artroom-policy";
import { RE } from "./ids.ts";
import { globProblem, pathProblem } from "./glob.ts";

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

export const LIMITS = {
  envelope: 64 * 1024,
  goal: 1024,
  long: 16 * 1024,
  medium: 8 * 1024,
  patterns: 64,
  patternChars: 256,
  reasons: 64,
} as const;

/** The legacy vocabulary's kinds and delegable kinds, from the one source (policy vocabulary.ts). */
export const KINDS: readonly EnvelopeKind[] = LEGACY_KINDS;
export const DELEGABLE = LEGACY_DELEGABLE;
export const ROLES = ["admin", "maintainer", "member", "agent", "checker"] as const;
/** A declared kind's name (R-DECL-2). */
const KIND_NAME = /^[a-z][a-z0-9-]{0,31}$/;
/** The ops of the platform kind `recover` (R-DECL-21). */
export const RECOVER_OPS = ["open", "take", "version", "approve", "land", "release", "note"] as const;

/** A shape failure: the rule to refuse with and one plain sentence. */
export class ShapeError extends Error {
  constructor(
    readonly rule: Extract<PlatformRule, "invalid-body" | "body-too-large" | "glob-invalid"> | "bad-request" | "payload-too-large",
    reason: string,
  ) {
    super(reason);
    this.name = "ShapeError";
  }
}

type Obj = Record<string, unknown>;

export function isPlainObject(v: unknown): v is Obj {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

class Checker {
  readonly fixed = new Set<string>();
  constructor(readonly fail: ShapeError["rule"]) {}

  error(path: string, what: string, rule: ShapeError["rule"] = this.fail): never {
    throw new ShapeError(rule, `${path} ${what}.`);
  }

  object<R extends string, O extends string = never>(
    v: unknown,
    path: string,
    required: readonly R[],
    optional: readonly O[] = [],
  ): { readonly [k in R]: unknown } & { readonly [k in O]?: unknown } {
    if (!isPlainObject(v)) this.error(path, "must be an object");
    for (const k of Object.keys(v)) {
      if (!(required as readonly string[]).includes(k) && !(optional as readonly string[]).includes(k)) this.error(`${path}.${k}`, "is not a field of this type");
      if (v[k] === undefined) this.error(`${path}.${k}`, "is undefined; omit absent fields");
    }
    // Own properties only: a declared field may be named like an inherited one, such as toString (R-DECL-12).
    for (const k of required) if (!Object.hasOwn(v, k)) this.error(`${path}.${k}`, "is required"); // G2:own-required
    return v as { readonly [k in R]: unknown } & { readonly [k in O]?: unknown };
  }

  string(v: unknown, path: string, max?: number): string {
    if (typeof v !== "string") this.error(path, "must be a string");
    if (max !== undefined && bytes(v) > max) this.error(path, `is longer than ${max} bytes`, "body-too-large");
    return v;
  }

  format(v: unknown, path: string, re: RegExp, what: string): string {
    if (typeof v !== "string" || !re.test(v)) this.error(path, `must be ${what}`);
    this.fixed.add(path);
    return v;
  }

  int(v: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) this.error(path, `must be an integer from ${min} to ${max}`);
    return v;
  }

  bool(v: unknown, path: string): boolean {
    if (typeof v !== "boolean") this.error(path, "must be true or false");
    return v;
  }

  oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T {
    if (typeof v !== "string" || !values.includes(v as T)) this.error(path, `must be one of ${values.join(", ")}`);
    return v as T;
  }

  array(v: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(v)) this.error(path, "must be an array");
    if (v.length > max) this.error(path, `has more than ${max} items`, "body-too-large");
    return v;
  }

  globs(v: unknown, path: string, minItems = 0): void {
    const list = this.array(v, path, LIMITS.patterns);
    if (list.length < minItems) this.error(path, `needs at least ${minItems} pattern`);
    list.forEach((g, i) => {
      const p = `${path}[${i}]`;
      if (typeof g !== "string") this.error(p, "must be a string");
      if (g.length > LIMITS.patternChars) this.error(p, `is longer than ${LIMITS.patternChars} characters`, "body-too-large");
      const problem = globProblem(g);
      if (problem) this.error(p, `is not a valid pattern: ${problem}`, "glob-invalid");
    });
  }

  reasons(v: unknown, path: string): void {
    const list = this.array(v, path, LIMITS.reasons);
    list.forEach((r, i) => {
      const p = `${path}[${i}]`;
      if (!isPlainObject(r)) this.error(p, "must be an object");
      if ("act" in r) this.format(this.object(r, p, ["act"]).act, `${p}.act`, RE.actId, "an entry ID");
      else if ("commit" in r) this.format(this.object(r, p, ["commit"]).commit, `${p}.commit`, RE.sha, "a git object name");
      else if ("url" in r) {
        const u = this.string(this.object(r, p, ["url"]).url, `${p}.url`, 2048);
        if (!RE.https.test(u)) this.error(`${p}.url`, "must be an https URL");
      } else this.error(p, "must name an act, a commit or a URL");
    });
  }
}

// ------------------------------------------------------------ envelopes (step 1)

/**
 * Check a signed envelope's outer shape against the active document's
 * vocabulary (R-ADM-1 step 1 as amended). Absent, or a `v1` document: the
 * legacy vocabulary's fixed list and `v: 1` only. A `v2` document: any kind
 * of the grammar, `v: 2` with `binding` for a declared kind, `v: 1` for the
 * platform kinds; whether the kind is declared and its binding current is
 * step 4a's. Throws `ShapeError` with `bad-request` or `payload-too-large`.
 */
export function checkSignedEnvelope(v: unknown, doc?: AnyPolicyDocument): void {
  const c = new Checker("bad-request");
  const signed = c.object(v, "act", ["envelope", "sig"]);
  c.format(signed.sig, "act.sig", RE.sig, "an Ed25519 signature in base64url");
  const declared = doc !== undefined && isDeclared(doc);
  const e = c.object(signed.envelope, "envelope", ["v", "room", "actor", "kind", "target", "body", "idempotencyKey"], declared ? ["delegation", "binding"] : ["delegation"]); // G2:binding-field
  if (!declared && e.v !== 1) c.error("envelope.v", "must be 1"); // G2:v1-version
  if (declared && e.v !== 1 && e.v !== 2) c.error("envelope.v", "must be 1 or 2"); // G2:v2-version
  c.format(e.room, "envelope.room", RE.roomId, "a room ID");
  c.format(e.actor, "envelope.actor", RE.keyId, "a key ID");
  if (!declared) {
    const kind = c.oneOf(e.kind, "envelope.kind", KINDS);
    c.format(e.idempotencyKey, "envelope.idempotencyKey", RE.idempotencyKey, "1 to 64 characters from A-Z, a-z, 0-9, _ and -");
    if (e.delegation !== undefined) c.format(e.delegation, "envelope.delegation", RE.actId, "an entry ID");
    checkTarget(c, kind, e.target, e.body);
    return;
  }
  if (typeof e.kind !== "string" || !KIND_NAME.test(e.kind)) c.error("envelope.kind", "must be a kind name, [a-z][a-z0-9-]{0,31}"); // G2:kind-grammar
  const kind = e.kind as string;
  c.format(e.idempotencyKey, "envelope.idempotencyKey", RE.idempotencyKey, "1 to 64 characters from A-Z, a-z, 0-9, _ and -");
  if (e.delegation !== undefined) c.format(e.delegation, "envelope.delegation", RE.actId, "an entry ID");
  // R-DECL-16: a binding exactly on v: 2; platform kinds are v: 1.
  if (e.v === 2) {
    if (isPlatformKind(kind)) c.error("envelope.v", `must be 1 for the platform kind ${kind}`); // G2:platform-v1
    c.format(e.binding, "envelope.binding", RE.digest, "a binding: sha256: and 64 lowercase hex digits"); // G2:binding-format
  } else if (e.binding !== undefined) c.error("envelope.binding", "is only for an envelope of v: 2"); // G2:binding-v1
  if (kind === "renew" || kind === "roster") return checkTarget(c, kind, e.target, e.body);
  if (kind === "recover") return recoverTarget(c, e.target, e.body);
  // A declared kind's target is not judged here. Which shapes the kind's declaration accepts is judged after step 4a
  // (`checkDeclaredTarget`), in the same words, so an act signed for an earlier meaning is answered binding-stale and an
  // exact retry is answered before either. Nothing before that point reads more of a target than a string `lane`.
}

/**
 * A declared act's target against its active declaration (R-DECL-4), after
 * step 4a has shown the envelope carries that declaration's binding. Throws
 * `ShapeError` with `bad-request`, in the words step 1 used for the legacy
 * kinds.
 */
export function checkDeclaredTarget(doc: AnyPolicyDocument, kind: string, target: unknown): void {
  declaredTarget(new Checker("bad-request"), declarationOf(doc, kind), target); // G2:declared-target
}

/**
 * A declared act's target: one of the shapes its declaration accepts, or any
 * shape for a kind the document does not declare, which step 4a refuses.
 * With one shape besides `none` and `entry`, as every code-review act has,
 * the checks and wording are the legacy ones.
 */
function declaredTarget(c: Checker, d: ActDeclaration | null, t: unknown): void {
  const path = "envelope.target";
  const shapes = d ? TARGET_ORDER.filter((s) => d.targets[s] !== undefined) : TARGET_ORDER;
  if (t === null && shapes.includes("none")) return;
  if (shapes.includes("entry") && isPlainObject(t) && "act" in t) return entryTarget(c, t, path);
  const named = shapeOf(t);
  const shape = shapes.find((s) => s === named && s !== "none" && s !== "entry") ?? shapes.find((s) => s !== "none" && s !== "entry");
  if (!shape) return shapes.includes("entry") ? entryTarget(c, t, path) : c.error(path, "must be null for this act");
  shapeTarget(c, shape, t, path);
}

function shapeTarget(c: Checker, shape: TargetShape, t: unknown, path: string): void {
  if (shape === "thread") laneTarget(c, t, path);
  else if (shape === "version") proposalTarget(c, t, path);
  else if (shape === "line") lineTarget(c, t, path);
  else if (shape === "entry") entryTarget(c, t, path);
  else if (t !== null) c.error(path, "must be null");
}

/** The target of each `recover` op (R-DECL-21, `RecoverTargets`). An unknown op is step 5's to refuse. */
const RECOVER_TARGETS: Readonly<Record<(typeof RECOVER_OPS)[number], readonly TargetShape[]>> = {
  open: ["none"],
  take: ["thread"],
  version: ["thread"],
  approve: ["version"],
  land: ["version"],
  release: ["thread"],
  note: ["entry", "line"],
};

function recoverTarget(c: Checker, t: unknown, body: unknown): void {
  const op = isPlainObject(body) ? body["op"] : undefined;
  const shapes = typeof op === "string" && Object.hasOwn(RECOVER_TARGETS, op) ? RECOVER_TARGETS[op as keyof typeof RECOVER_TARGETS] : null;
  if (!shapes) return declaredTarget(c, null, t);
  const path = "envelope.target";
  if (shapes.includes("none")) {
    if (t !== null) c.error(path, `must be null for recover ${String(op)}`); // G2:recover-target
    return;
  }
  if (shapes.includes("entry") && isPlainObject(t) && "act" in t) return entryTarget(c, t, path);
  shapeTarget(c, shapes.find((s) => s !== "entry")!, t, path);
}

function laneTarget(c: Checker, t: unknown, path: string): void {
  c.format(c.object(t, path, ["lane"]).lane, `${path}.lane`, RE.actId, "a lane ID");
}

function proposalTarget(c: Checker, t: unknown, path: string): void {
  const o = c.object(t, path, ["lane", "generation"]);
  c.format(o.lane, `${path}.lane`, RE.actId, "a lane ID");
  c.int(o.generation, `${path}.generation`, 1);
}

function entryTarget(c: Checker, t: unknown, path: string): void {
  c.format(c.object(t, path, ["act"]).act, `${path}.act`, RE.actId, "an entry ID");
}

function lineTarget(c: Checker, t: unknown, path: string): void {
  const o = c.object(t, path, ["lane", "generation", "head", "path", "line"], ["endLine"]);
  c.format(o.lane, `${path}.lane`, RE.actId, "a lane ID");
  c.int(o.generation, `${path}.generation`, 1);
  c.format(o.head, `${path}.head`, RE.sha, "a git object name");
  const p = c.string(o.path, `${path}.path`, 4096);
  if (pathProblem(p)) c.error(`${path}.path`, "must be a repository path");
  const line = c.int(o.line, `${path}.line`, 1);
  if (o.endLine !== undefined) c.int(o.endLine, `${path}.endLine`, line);
}

function checkTarget(c: Checker, kind: EnvelopeKind, t: unknown, body: unknown): void {
  const path = "envelope.target";
  switch (kind) {
    case "claim":
      if (t !== null) laneTarget(c, t, path);
      return;
    case "roster":
      if (t !== null) c.error(path, "must be null for roster acts");
      // Every roster op is an object. Admission reads `body.op` before the signature, so the shape is settled here (review L2).
      if (!isPlainObject(body)) c.error("envelope.body", "must be an object for roster acts");
      return;
    case "propose":
    case "release":
    case "renew":
      laneTarget(c, t, path);
      return;
    case "review":
    case "check":
    case "land":
      proposalTarget(c, t, path);
      return;
    case "note":
      if (isPlainObject(t) && "act" in t) return entryTarget(c, t, path);
      return lineTarget(c, t, path);
  }
}

/** Canonical size of the whole envelope (R-SIG-6, R-ADM-1 step 1). */
export function checkEnvelopeSize(canonicalLength: number): void {
  if (canonicalLength > LIMITS.envelope) throw new ShapeError("payload-too-large", `The signed envelope is ${canonicalLength} bytes; the limit is ${LIMITS.envelope}.`);
}

// ------------------------------------------------------------ bodies (step 5)

export interface BodyCheck {
  /** Paths of fixed-format fields: the entropy check skips them (R-SEC-4). */
  readonly fixed: ReadonlySet<string>;
  /** Paths not scanned at all: a `join` act's `secret` (R-SEC-4). */
  readonly exempt: ReadonlySet<string>;
}

/**
 * Check a body against its kind and target (R-SIG-4, R-SIG-6). Absent, or a
 * `v1` document: the legacy vocabulary's bodies. A `v2` document: a
 * declared kind's body is closed against its declared fields, its steps'
 * fields and `because` (R-DECL-12); `recover` and the `v2` roster grant
 * shapes are the platform's. Throws `ShapeError` (`invalid-body`,
 * `body-too-large`, `glob-invalid`).
 */
export function checkBody(kind: string, target: unknown, body: unknown, doc?: AnyPolicyDocument): BodyCheck {
  const c = new Checker("invalid-body");
  const exempt = new Set<string>();
  const p = "body";
  if (doc !== undefined && isDeclared(doc) && kind !== "renew") {
    if (kind === "roster") checkRosterOp(c, body, exempt, true);
    else if (kind === "recover") recoverBody(c, body);
    else declaredBody(c, declarationOf(doc, kind)!, target, body);
    return { fixed: c.fixed, exempt };
  }
  switch (kind as EnvelopeKind) {
    case "claim": {
      if (target === null) {
        const b = c.object(body, p, ["goal", "scope"], ["purpose", "plan", "because"]);
        c.string(b.goal, "body.goal", LIMITS.goal);
        c.globs(b.scope, "body.scope", 1);
        if (b.purpose !== undefined) c.oneOf(b.purpose, "body.purpose", ["config-recovery"] as const);
        if (b.plan !== undefined) c.string(b.plan, "body.plan", LIMITS.long);
        if (b.because !== undefined) c.reasons(b.because, "body.because");
      } else {
        const b = c.object(body, p, ["scope", "expectedGeneration"], ["goal", "plan", "because", "lease"]);
        c.globs(b.scope, "body.scope", 1);
        if (b.goal !== undefined) c.string(b.goal, "body.goal", LIMITS.goal);
        if (b.plan !== undefined) c.string(b.plan, "body.plan", LIMITS.long);
        if (b.because !== undefined) c.reasons(b.because, "body.because");
        c.int(b.expectedGeneration, "body.expectedGeneration", 0);
        if (b.lease !== undefined) c.int(b.lease, "body.lease", 1);
      }
      break;
    }
    case "propose": {
      const b = c.object(body, p, ["lease", "expectedGeneration", "head", "summary"], ["because"]);
      c.int(b.lease, "body.lease", 1);
      c.int(b.expectedGeneration, "body.expectedGeneration", 0);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      c.string(b.summary, "body.summary", LIMITS.medium);
      if (b.because !== undefined) c.reasons(b.because, "body.because");
      break;
    }
    case "note": {
      const b = c.object(body, p, ["text"], ["replyTo"]);
      c.string(b.text, "body.text", LIMITS.long);
      if (b.replyTo !== undefined) c.format(b.replyTo, "body.replyTo", RE.actId, "an entry ID");
      break;
    }
    case "review": {
      const b = c.object(body, p, ["head", "verdict", "scope", "text"], ["dependsOn"]);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      c.oneOf(b.verdict, "body.verdict", ["approve", "object"] as const);
      c.globs(b.scope, "body.scope", 1);
      if (b.dependsOn !== undefined) c.globs(b.dependsOn, "body.dependsOn");
      c.string(b.text, "body.text", LIMITS.long);
      break;
    }
    case "check": {
      const b = c.object(body, p, ["obligation", "check", "integration", "input", "config", "runner", "volatile", "ok", "detail"], ["landOp"]);
      c.format(b.obligation, "body.obligation", RE.obligationId, "an obligation ID");
      c.format(b.check, "body.check", RE.ruleId, "a checker name");
      c.format(b.integration, "body.integration", RE.sha, "a git object name");
      const input = b.input;
      if (isPlainObject(input) && input["kind"] === "filtered") {
        const i = c.object(input, "body.input", ["kind", "snapshot", "paths"]);
        c.format(i.snapshot, "body.input.snapshot", RE.digest, "a digest");
        c.globs(i.paths, "body.input.paths");
      } else {
        const i = c.object(input, "body.input", ["kind", "tree"]);
        c.oneOf(i.kind, "body.input.kind", ["tree"] as const);
        c.format(i.tree, "body.input.tree", RE.sha, "a git object name");
      }
      c.format(b.config, "body.config", RE.digest, "a digest");
      c.format(b.runner, "body.runner", RE.digest, "a digest");
      c.bool(b.volatile, "body.volatile");
      c.bool(b.ok, "body.ok");
      c.string(b.detail, "body.detail", LIMITS.long);
      if (b.landOp !== undefined) c.format(b.landOp, "body.landOp", RE.opId, "an operation ID");
      break;
    }
    case "land": {
      const b = c.object(body, p, ["lease", "head"]);
      c.int(b.lease, "body.lease", 1);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      break;
    }
    case "release": {
      const b = c.object(body, p, ["lease"], ["note"]);
      c.int(b.lease, "body.lease", 1);
      if (b.note !== undefined) c.string(b.note, "body.note", LIMITS.medium);
      break;
    }
    case "renew": {
      const b = c.object(body, p, ["lease"]);
      c.int(b.lease, "body.lease", 1);
      break;
    }
    case "roster":
      checkRosterOp(c, body, exempt, false);
      break;
  }
  return { fixed: c.fixed, exempt };
}

/** The body fields each step requires and allows (R-DECL-5), with the legacy limits. */
const STEP_BODY: Readonly<Record<Step, { readonly required: readonly string[]; readonly optional: readonly string[] }>> = {
  open: { required: ["scope"], optional: [] },
  take: { required: ["scope", "expectedGeneration"], optional: ["lease"] },
  version: { required: ["lease", "expectedGeneration", "head"], optional: [] },
  review: { required: ["head", "verdict", "scope"], optional: ["dependsOn"] },
  check: { required: ["obligation", "check", "integration", "input", "config", "runner", "volatile", "ok", "detail"], optional: ["landOp"] },
  land: { required: ["lease", "head"], optional: [] },
  release: { required: ["lease"], optional: ["note"] },
  "hand-over": { required: ["lease", "to"], optional: [] },
  comment: { required: [], optional: ["replyTo"] },
};

/** Is a declared field required on this target shape (R-DECL-12)? */
export function requiredOn(field: DeclaredField, shape: TargetShape): boolean {
  if (field.optional) return false;
  return field.requiredFor ? field.requiredFor.includes(shape) : true; // G2:required-on
}

/** A declared act's body: closed against its declared fields, its steps' fields and `because` (R-DECL-12). */
function declaredBody(c: Checker, d: ActDeclaration, target: unknown, body: unknown): void {
  const shape = shapeOf(target)!;
  const steps = d.targets[shape] ?? [];
  const fields = Object.entries(d.body ?? {});
  const required = [...steps.flatMap((s) => STEP_BODY[s].required), ...fields.filter(([, f]) => requiredOn(f, shape)).map(([n]) => n)];
  const optional = [...steps.flatMap((s) => STEP_BODY[s].optional), ...fields.filter(([, f]) => !requiredOn(f, shape)).map(([n]) => n), "because"];
  const b = c.object(body, "body", [...new Set(required)], [...new Set(optional)]) as Readonly<Record<string, unknown>>;
  for (const [name, field] of fields) if (Object.hasOwn(b, name)) declaredField(c, field, b[name], `body.${name}`); // G2:declared-fields
  for (const step of steps) stepFields(c, step, b); // G2:step-fields
  if (b["because"] !== undefined) c.reasons(b["because"], "body.because"); // G2:because
}

/** One declared field, by its type (R-DECL-12). `member`, `act` and `segment` are fixed-format (R-SEC-4). */
function declaredField(c: Checker, f: DeclaredField, v: unknown, path: string): void {
  switch (f.type) {
    case "text":
      c.string(v, path, f.max); // G2:field-text
      return;
    case "int":
      c.int(v, path, f.min, f.max); // G2:field-int
      return;
    case "bool":
      c.bool(v, path);
      return;
    case "enum":
      c.oneOf(v, path, f.values); // G2:field-enum
      return;
    case "globs":
      c.array(v, path, f.max); // G2:field-globs
      c.globs(v, path);
      return;
    case "member":
      c.format(v, path, RE.handle, "a member handle"); // G2:field-member
      return;
    case "act":
      c.format(v, path, RE.actId, "an entry ID"); // G2:field-act
      return;
    case "segment": {
      const s = c.string(v, path, 255);
      // The characters R-PATH-1 keeps out of a pattern, and the slash: a segment may fill a slot of a scope template.
      if (s === "" || s === "." || s === ".." || /[/*?[\]{}!\\]/.test(s)) c.error(path, "must be one path segment, with no slash or glob character"); // G2:field-segment
      c.fixed.add(path); // G2:field-fixed
      return;
    }
  }
}

/** The fields a step itself requires, with the legacy kinds' limits (R-DECL-5). */
function stepFields(c: Checker, step: Step, b: Readonly<Record<string, unknown>>): void {
  switch (step) {
    case "open":
      c.globs(b["scope"], "body.scope", 1);
      return;
    case "take":
      c.globs(b["scope"], "body.scope", 1);
      c.int(b["expectedGeneration"], "body.expectedGeneration", 0);
      if (b["lease"] !== undefined) c.int(b["lease"], "body.lease", 1);
      return;
    case "version":
      c.int(b["lease"], "body.lease", 1);
      c.int(b["expectedGeneration"], "body.expectedGeneration", 0);
      c.format(b["head"], "body.head", RE.sha, "a git object name");
      return;
    case "review":
      c.format(b["head"], "body.head", RE.sha, "a git object name");
      c.oneOf(b["verdict"], "body.verdict", ["approve", "object"] as const);
      c.globs(b["scope"], "body.scope", 1);
      if (b["dependsOn"] !== undefined) c.globs(b["dependsOn"], "body.dependsOn");
      return;
    case "check":
      checkFields(c, b);
      return;
    case "land":
      c.int(b["lease"], "body.lease", 1);
      c.format(b["head"], "body.head", RE.sha, "a git object name");
      return;
    case "release":
      c.int(b["lease"], "body.lease", 1);
      if (b["note"] !== undefined) c.string(b["note"], "body.note", LIMITS.medium);
      return;
    case "hand-over":
      c.int(b["lease"], "body.lease", 1);
      c.format(b["to"], "body.to", RE.handle, "a member handle");
      return;
    case "comment":
      if (b["replyTo"] !== undefined) c.format(b["replyTo"], "body.replyTo", RE.actId, "an entry ID");
      return;
  }
}

/** The `check` step's fields, as the legacy `check` has them. */
function checkFields(c: Checker, b: Readonly<Record<string, unknown>>): void {
  c.format(b["obligation"], "body.obligation", RE.obligationId, "an obligation ID");
  c.format(b["check"], "body.check", RE.ruleId, "a checker name");
  c.format(b["integration"], "body.integration", RE.sha, "a git object name");
  const input = b["input"];
  if (isPlainObject(input) && input["kind"] === "filtered") {
    const i = c.object(input, "body.input", ["kind", "snapshot", "paths"]);
    c.format(i.snapshot, "body.input.snapshot", RE.digest, "a digest");
    c.globs(i.paths, "body.input.paths");
  } else {
    const i = c.object(input, "body.input", ["kind", "tree"]);
    c.oneOf(i.kind, "body.input.kind", ["tree"] as const);
    c.format(i.tree, "body.input.tree", RE.sha, "a git object name");
  }
  c.format(b["config"], "body.config", RE.digest, "a digest");
  c.format(b["runner"], "body.runner", RE.digest, "a digest");
  c.bool(b["volatile"], "body.volatile");
  c.bool(b["ok"], "body.ok");
  c.string(b["detail"], "body.detail", LIMITS.long);
  if (b["landOp"] !== undefined) c.format(b["landOp"], "body.landOp", RE.opId, "an operation ID");
}

/** A `recover` op (R-DECL-21): the legacy recovery acts' fields and limits, by op. */
function recoverBody(c: Checker, body: unknown): void {
  if (!isPlainObject(body)) return c.error("body", "must be an object");
  const op = c.oneOf(body["op"], "body.op", RECOVER_OPS); // G2:recover-op
  const p = "body";
  switch (op) {
    case "open": {
      const b = c.object(body, p, ["op", "goal", "scope"], ["plan", "because"]);
      c.string(b.goal, "body.goal", LIMITS.goal);
      c.globs(b.scope, "body.scope", 1);
      if (b.plan !== undefined) c.string(b.plan, "body.plan", LIMITS.long);
      if (b.because !== undefined) c.reasons(b.because, "body.because");
      return;
    }
    case "take": {
      const b = c.object(body, p, ["op", "scope", "expectedGeneration"], ["lease", "goal", "plan", "because"]);
      c.globs(b.scope, "body.scope", 1);
      if (b.goal !== undefined) c.string(b.goal, "body.goal", LIMITS.goal);
      if (b.plan !== undefined) c.string(b.plan, "body.plan", LIMITS.long);
      if (b.because !== undefined) c.reasons(b.because, "body.because");
      c.int(b.expectedGeneration, "body.expectedGeneration", 0);
      if (b.lease !== undefined) c.int(b.lease, "body.lease", 1);
      return;
    }
    case "version": {
      const b = c.object(body, p, ["op", "lease", "expectedGeneration", "head", "summary"], ["because"]);
      c.int(b.lease, "body.lease", 1);
      c.int(b.expectedGeneration, "body.expectedGeneration", 0);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      c.string(b.summary, "body.summary", LIMITS.medium);
      if (b.because !== undefined) c.reasons(b.because, "body.because");
      return;
    }
    case "approve": {
      const b = c.object(body, p, ["op", "head", "verdict", "scope", "text"], ["dependsOn"]);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      c.oneOf(b.verdict, "body.verdict", ["approve", "object"] as const);
      c.globs(b.scope, "body.scope", 1);
      if (b.dependsOn !== undefined) c.globs(b.dependsOn, "body.dependsOn");
      c.string(b.text, "body.text", LIMITS.long);
      return;
    }
    case "land": {
      const b = c.object(body, p, ["op", "lease", "head"]);
      c.int(b.lease, "body.lease", 1);
      c.format(b.head, "body.head", RE.sha, "a git object name");
      return;
    }
    case "release": {
      const b = c.object(body, p, ["op", "lease"], ["note"]);
      c.int(b.lease, "body.lease", 1);
      if (b.note !== undefined) c.string(b.note, "body.note", LIMITS.medium);
      return;
    }
    case "note": {
      const b = c.object(body, p, ["op", "text"], ["replyTo"]);
      c.string(b.text, "body.text", LIMITS.long);
      if (b.replyTo !== undefined) c.format(b.replyTo, "body.replyTo", RE.actId, "an entry ID");
      return;
    }
  }
}

/** A `v2` grant's platform kinds: a list, never `*`, of delegable platform kinds (R-DECL-17). */
function platformKinds(c: Checker, v: unknown, path: string): void {
  const list = c.array(v, path, DELEGABLE_PLATFORM.length);
  list.forEach((k, i) => c.oneOf(k, `${path}[${i}]`, DELEGABLE_PLATFORM)); // G2:grant-kinds
  if (new Set(list).size !== list.length) c.error(path, "must not repeat a kind");
}

/** A signed grant map: declared kind to binding, at most 64 kinds (R-DECL-17, `GrantMap`). */
function grantMap(c: Checker, v: unknown, path: string): void {
  if (!isPlainObject(v)) return c.error(path, "must be an object from declared kind to binding");
  const kinds = Object.keys(v);
  if (kinds.length > 64) c.error(path, "names more than 64 kinds", "body-too-large");
  for (const k of kinds) {
    if (!KIND_NAME.test(k)) c.error(`${path}.${k}`, "is not a kind name");
    c.format(v[k], `${path}.${k}`, RE.digest, "a binding: sha256: and 64 lowercase hex digits"); // G2:grant-map
  }
}

function kindsOrStar(c: Checker, v: unknown, path: string): void {
  if (v === "*") return;
  const list = c.array(v, path, DELEGABLE.length);
  if (list.length === 0) c.error(path, "must name at least one kind");
  list.forEach((k, i) => c.oneOf(k, `${path}[${i}]`, DELEGABLE));
  if (new Set(list).size !== list.length) c.error(path, "must not repeat a kind");
}

function checkRosterOp(c: Checker, body: unknown, exempt: Set<string>, declared: boolean): void {
  if (!isPlainObject(body)) return c.error("body", "must be an object");
  const op = c.oneOf(body["op"], "body.op", ["invite", "join", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate", "rotate-recovery"] as const);
  const p = "body";
  switch (op) {
    case "invite": {
      const b = c.object(body, p, ["op", "member", "custody", "expiresAt", "secretHash"], ["role", "session"]);
      c.format(b.member, "body.member", RE.handle, "a member handle");
      if (b.role !== undefined) c.oneOf(b.role, "body.role", ROLES);
      c.oneOf(b.custody, "body.custody", ["client", "room"] as const);
      c.format(b.expiresAt, "body.expiresAt", RE.timestamp, "an RFC 3339 UTC time");
      c.format(b.secretHash, "body.secretHash", RE.digest, "a digest");
      if (b.session !== undefined) {
        if (b.custody !== "room") c.error("body.session", "is only for room-custody invitations");
        // R-DECL-17: in a v2 room a session names platform kinds and a signed grant map.
        const s = declared ? c.object(b.session, "body.session", ["kinds", "acts", "lanes", "ttlSeconds"]) : c.object(b.session, "body.session", ["kinds", "lanes", "ttlSeconds"]);
        if (declared) {
          platformKinds(c, s.kinds, "body.session.kinds");
          grantMap(c, (s as { acts?: unknown }).acts, "body.session.acts");
        } else kindsOrStar(c, s.kinds, "body.session.kinds");
        if (s.lanes !== "*") c.error("body.session.lanes", 'must be "*"');
        c.int(s.ttlSeconds, "body.session.ttlSeconds", 60, 30 * 24 * 3600);
      }
      break;
    }
    case "join": {
      const b = c.object(body, p, ["op", "invitation", "secret"]);
      c.format(b.invitation, "body.invitation", RE.actId, "an entry ID");
      const secret = c.string(b.secret, "body.secret", 1024);
      if (!RE.b64url.test(secret) || secret.length < 43) c.error("body.secret", "must be at least 32 bytes in base64url");
      exempt.add("body.secret");
      break;
    }
    case "set-role": {
      const b = c.object(body, p, ["op", "member", "role"]);
      c.format(b.member, "body.member", RE.handle, "a member handle");
      c.oneOf(b.role, "body.role", ROLES);
      break;
    }
    case "remove": {
      const b = c.object(body, p, ["op", "member"]);
      c.format(b.member, "body.member", RE.handle, "a member handle");
      break;
    }
    case "revoke-key": {
      const b = c.object(body, p, ["op", "key", "reason"]);
      c.format(b.key, "body.key", RE.keyId, "a key ID");
      c.oneOf(b.reason, "body.reason", ["retired", "compromised"] as const);
      break;
    }
    case "team": {
      const b = c.object(body, p, ["op", "team", "members"]);
      c.format(b.team, "body.team", RE.handle, "a team handle");
      const list = c.array(b.members, "body.members", 1000);
      list.forEach((m, i) => c.format(m, `body.members[${i}]`, RE.handle, "a member handle"));
      break;
    }
    case "delegate": {
      // R-DECL-17: in a v2 room a grant names platform kinds and a signed grant map, never `*`.
      const b = declared ? c.object(body, p, ["op", "to", "kinds", "acts", "lanes", "expiresAt"]) : c.object(body, p, ["op", "to", "kinds", "lanes", "expiresAt"]); // G2:grant-shape
      c.format(b.to, "body.to", RE.keyId, "a key ID");
      if (declared) {
        platformKinds(c, b.kinds, "body.kinds");
        grantMap(c, (b as { acts?: unknown }).acts, "body.acts");
      } else kindsOrStar(c, b.kinds, "body.kinds");
      if (b.lanes !== "*") {
        const list = c.array(b.lanes, "body.lanes", 256);
        if (list.length === 0) c.error("body.lanes", "must name at least one lane");
        list.forEach((l, i) => c.format(l, `body.lanes[${i}]`, RE.actId, "a lane ID"));
      }
      c.format(b.expiresAt, "body.expiresAt", RE.timestamp, "an RFC 3339 UTC time");
      break;
    }
    case "undelegate": {
      const b = c.object(body, p, ["op", "delegation"]);
      c.format(b.delegation, "body.delegation", RE.actId, "an entry ID");
      break;
    }
    case "rotate-recovery": {
      const b = c.object(body, p, ["op", "key"]);
      c.format(b.key, "body.key", RE.keyId, "a key ID");
      break;
    }
  }
}

// ------------------------------------------------------------ requests and redemption

/** Check a signed request (R-CRED-5, R-CRED-6). Throws `ShapeError` `bad-request`. */
export function checkSignedRequest(v: unknown): void {
  const c = new Checker("bad-request");
  const signed = c.object(v, "request", ["request", "sig"]);
  c.format(signed.sig, "request.sig", RE.sig, "an Ed25519 signature in base64url");
  const r = c.object(signed.request, "request.request", ["v", "room", "actor", "request", "nonce", "notAfter"], ["delegation"]);
  if (r.v !== 1) c.error("request.request.v", "must be 1");
  c.format(r.room, "request.request.room", RE.roomId, "a room ID");
  c.format(r.actor, "request.request.actor", RE.keyId, "a key ID");
  if (r.delegation !== undefined) c.format(r.delegation, "request.request.delegation", RE.actId, "an entry ID");
  c.format(r.nonce, "request.request.nonce", RE.nonce, "16 to 64 characters from A-Z, a-z, 0-9, _ and -");
  c.format(r.notAfter, "request.request.notAfter", RE.timestamp, "an RFC 3339 UTC time");
  const body = r.request;
  if (isPlainObject(body) && body["kind"] === "session") {
    const b = c.object(body, "request.request.request", ["kind", "ttlSeconds"]);
    c.int(b.ttlSeconds, "request.request.request.ttlSeconds", 1, 3600);
  } else {
    const b = c.object(body, "request.request.request", ["kind", "lane", "lease"]);
    c.oneOf(b.kind, "request.request.request.kind", ["workspace", "workspace-token"] as const);
    c.format(b.lane, "request.request.request.lane", RE.actId, "a lane ID");
    c.int(b.lease, "request.request.request.lease", 1);
  }
}

/** Check a redemption's outer shape (R-CRED-9). Throws `ShapeError` `bad-request`. */
export function checkRedemption(v: unknown, doc?: AnyPolicyDocument): void {
  const c = new Checker("bad-request");
  if (!isPlainObject(v)) return c.error("redemption", "must be an object");
  if (v["custody"] === "client") {
    const r = c.object(v, "redemption", ["custody", "join"]);
    checkSignedEnvelope(r.join, doc);
  } else {
    const r = c.object(v, "redemption", ["custody", "invitation", "secret"]);
    c.oneOf(r.custody, "redemption.custody", ["client", "room"] as const);
    c.format(r.invitation, "redemption.invitation", RE.actId, "an entry ID");
    const s = c.string(r.secret, "redemption.secret", 1024);
    if (!RE.b64url.test(s)) c.error("redemption.secret", "must be base64url");
  }
}
