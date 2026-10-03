/**
 * Kind, binding and body judged under the declarations in force at each
 * entry's seq (docs/protocol.md R-DECL-1, R-DECL-14 to R-DECL-17, R-DECL-21,
 * R-DECL-25; notes/2026-10-02-declared-acts.md sections 3.2, 3.9 and 5).
 *
 * The act at seq `s` was admitted under `D(s)`, the document of the last
 * `policy-activated` event before `s`. Under a `v1` document every entry is
 * judged by the legacy vocabulary `artroom-legacy-v1`: its nine kinds, in
 * envelope `v: 1`. Under a `v2` document an entry is judged by the
 * declarations, under the steps version the document names: a declared
 * kind, in `v: 2`, with the binding of that kind in `D(s)`, a target the
 * declaration accepts and a body closed against its fields and its steps'
 * fields. `renew` and `roster` keep `v: 1` and their legacy bodies, and
 * `recover` is judged by its ops.
 *
 * This is verify's own implementation of those rules, built from the
 * contract's data and the policy package's binding identity, so verify does
 * not trust the Room's code.
 *
 * Each guard is one statement marked `// V:<id>`, a row of the mutation
 * table in plans/README.md ("Declared acts stage 3").
 */

import type { ActDeclaration, AnyPolicyDocument, Binding, DeclaredField, Envelope, PolicyDocumentV2, Step, TargetShape } from "@generalbusiness/artroom-contract";
import { ARTROOM_LEGACY_V1 } from "@generalbusiness/artroom-contract";
import { PLATFORM_KINDS, bindingsOf, globProblem } from "@generalbusiness/artroom-policy";
import { declaredWho, LEGACY_WHO, type Who } from "./roster.ts";

// ------------------------------------------------------------- vocabularies

/** One field a step brings, with the rule for whether a body must carry it (R-DECL-5). */
export interface StepField {
  readonly type: FieldType;
  /**
   * `required`, `optional`, or `scope`: `scope` is required where the
   * thread's scope comes from the body (`open` with `hold.scope:
   * "body.scope"`, `take` on such a thread) and refused where it is fixed
   * (R-DECL-7).
   */
  readonly need: "required" | "optional" | "scope";
}

/** A body value's type: the declared types of R-DECL-12, and the formats the steps' own fields use. */
export type FieldType =
  | { readonly t: "text"; readonly max: number }
  | { readonly t: "int"; readonly min: number; readonly max?: number }
  | { readonly t: "bool" }
  | { readonly t: "enum"; readonly values: readonly string[] }
  | { readonly t: "globs"; readonly min: number; readonly max: number }
  | { readonly t: "member" | "act" | "segment" | "sha" | "digest" | "obligation" | "checker" | "op" | "check-input" };

/** The semantics of one steps version, as verify needs them: each step's own fields (R-DECL-5). */
export interface StepsSemantics {
  readonly version: string;
  readonly fields: Readonly<Record<Step, Readonly<Record<string, StepField>>>>;
}

const LEASE: StepField = { type: { t: "int", min: 1 }, need: "required" };
const GENERATION: StepField = { type: { t: "int", min: 0 }, need: "required" };
const HEAD: StepField = { type: { t: "sha" }, need: "required" };
const GLOBS: FieldType = { t: "globs", min: 1, max: 64 };

/** `artroom-steps-v1` (R-DECL-5): today's guards for each step, and the fields each one requires. */
export const STEPS_V1: StepsSemantics = Object.freeze({
  version: "artroom-steps-v1",
  fields: {
    open: { scope: { type: GLOBS, need: "scope" } },
    take: { expectedGeneration: GENERATION, lease: { ...LEASE, need: "optional" }, scope: { type: GLOBS, need: "scope" } },
    version: { lease: LEASE, expectedGeneration: GENERATION, head: HEAD },
    review: {
      head: HEAD,
      verdict: { type: { t: "enum", values: ["approve", "object"] }, need: "required" },
      scope: { type: GLOBS, need: "required" },
      dependsOn: { type: { t: "globs", min: 0, max: 64 }, need: "optional" },
    },
    check: {
      obligation: { type: { t: "obligation" }, need: "required" },
      check: { type: { t: "checker" }, need: "required" },
      integration: HEAD,
      input: { type: { t: "check-input" }, need: "required" },
      config: { type: { t: "digest" }, need: "required" },
      runner: { type: { t: "digest" }, need: "required" },
      volatile: { type: { t: "bool" }, need: "required" },
      ok: { type: { t: "bool" }, need: "required" },
      detail: { type: { t: "text", max: 16384 }, need: "required" },
      landOp: { type: { t: "op" }, need: "optional" },
    },
    land: { lease: LEASE, head: HEAD },
    release: { lease: LEASE, note: { type: { t: "text", max: 8192 }, need: "optional" } },
    "hand-over": { lease: LEASE, to: { type: { t: "member" }, need: "required" } },
    comment: { replyTo: { type: { t: "act" }, need: "optional" } },
  },
} as const);

/** The steps versions this verifier carries (R-DECL-14). A release adds one; it never changes one. */
export const CARRIED_STEPS: Readonly<Record<string, StepsSemantics>> = Object.freeze({ "artroom-steps-v1": STEPS_V1 });

/** The vocabulary an entry is judged under: the legacy one, or a `v2` document's declarations. */
export type Vocabulary =
  | { readonly kind: "legacy" }
  | {
      readonly kind: "declared";
      readonly doc: PolicyDocumentV2;
      readonly steps: StepsSemantics;
      /** Every declared kind's binding in this document (R-DECL-15). */
      readonly bindings: Readonly<Record<string, Binding>>;
    };

export const LEGACY: Vocabulary = Object.freeze({ kind: "legacy" });

/** The legacy vocabulary's kinds (R-DECL-1). */
export const LEGACY_KINDS: readonly string[] = ARTROOM_LEGACY_V1.envelope.kinds;

/**
 * The vocabulary a document means: `v1` the legacy one, permanently; `v2`
 * its declarations under its steps version, which the caller has already
 * found among the versions it carries.
 */
export async function vocabularyOf(doc: AnyPolicyDocument, steps: StepsSemantics): Promise<Vocabulary> {
  if (doc.format !== "artroom-policy-v2") return LEGACY;
  return { kind: "declared", doc, steps, bindings: await bindingsOf(doc) };
}

/** Who may sign what under the vocabulary (R-GEN-5 as amended, R-DECL-11). */
export function whoOf(vocab: Vocabulary): Who {
  return vocab.kind === "legacy" ? LEGACY_WHO : declaredWho(vocab.doc.acts, vocab.bindings);
}

/** The declaration of a declared kind, or undefined for a platform kind or an undeclared one. */
export function declarationOf(vocab: Vocabulary, kind: string): ActDeclaration | undefined {
  return vocab.kind === "declared" && Object.hasOwn(vocab.doc.acts, kind) ? vocab.doc.acts[kind] : undefined;
}

// ------------------------------------------------------------ kind, binding

export type Judged = { readonly reason: "kind-undeclared" | "binding-stale" | "body-invalid"; readonly detail: string };

/**
 * The envelope's kind and binding under the vocabulary in force (R-DECL-1,
 * R-DECL-16): a kind it does not declare is `kind-undeclared`; a declared
 * kind whose envelope does not carry the binding in force, including a
 * `v: 1` envelope, is `binding-stale`. Under the legacy vocabulary a `v: 2`
 * envelope is `bad-request` at admission, so it was never admitted.
 */
export function kindProblem(env: Envelope, vocab: Vocabulary): Judged | null {
  const kind = env.kind as string;
  const v = (env as { v: number }).v;
  if (vocab.kind === "legacy") {
    if (!LEGACY_KINDS.includes(kind)) return { reason: "kind-undeclared", detail: `${kind} is not a kind of the legacy vocabulary artroom-legacy-v1, which the document in force means` }; // V:legacy-kind
    if (v !== 1) return { reason: "body-invalid", detail: "a v: 2 envelope under a v1 document, which the room refuses as bad-request (R-DECL-16)" }; // V:legacy-v1
    return null;
  }
  if (PLATFORM_KINDS.includes(kind)) return null;
  const binding = vocab.bindings[kind];
  if (!Object.hasOwn(vocab.doc.acts, kind) || binding === undefined) return { reason: "kind-undeclared", detail: `${kind} is not declared in the document in force` }; // V:declared-kind
  const signed = (env as { binding?: unknown }).binding;
  if (v !== 2 || signed !== binding) return { reason: "binding-stale", detail: v !== 2 ? `a v: 1 envelope of the declared kind ${kind}` : `the envelope's binding ${String(signed)} is not ${kind}'s binding in force, ${binding}` }; // V:binding
  return null;
}

// --------------------------------------------------------------- targets

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ACT_ID = /^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$/;
const MEMBER = /^@[a-z0-9][a-z0-9-]{0,38}$/;
const OP_ID = /^op_[A-Za-z0-9_-]{1,64}$/;
const OBLIGATION = /^obl_[a-z][a-z0-9-]{0,63}$/;
const CHECKER = /^[a-z][a-z0-9-]{0,63}$/;
const GLOB_META = /[*?[\]{}!\\]/;

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const keysAre = (o: Obj, required: readonly string[], optional: readonly string[] = []) =>
  required.every((k) => k in o) && Object.keys(o).every((k) => required.includes(k) || optional.includes(k));
const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** A repository path (R-PATH): no leading `/`, no empty, `.` or `..` segment. */
function isPath(v: unknown): boolean {
  return typeof v === "string" && v !== "" && bytes(v) <= 4096 && !v.startsWith("/") && v.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** The shape of a target (R-DECL-4), or null when it is none of them. */
export function targetShape(target: unknown): TargetShape | null {
  if (target === null) return "none";
  if (!isObj(target)) return null;
  if (keysAre(target, ["lane"]) && ACT_ID.test(String(target["lane"]))) return "thread";
  if (keysAre(target, ["lane", "generation"]) && ACT_ID.test(String(target["lane"])) && isInt(target["generation"], 1)) return "version";
  if (keysAre(target, ["act"]) && ACT_ID.test(String(target["act"]))) return "entry";
  if (
    keysAre(target, ["lane", "generation", "head", "path", "line"], ["endLine"]) &&
    ACT_ID.test(String(target["lane"])) &&
    isInt(target["generation"], 1) &&
    SHA.test(String(target["head"])) &&
    isPath(target["path"]) &&
    isInt(target["line"], 1) &&
    (target["endLine"] === undefined || isInt(target["endLine"], target["line"] as number))
  )
    return "line";
  return null;
}

// --------------------------------------------------------------- values

/** Why `v` is not a value of `type`, or null (R-DECL-12, R-SIG-6). */
function valueProblem(v: unknown, type: FieldType): string | null {
  switch (type.t) {
    case "text":
      return typeof v === "string" && bytes(v) <= type.max ? null : `must be text of at most ${type.max} bytes`;
    case "int":
      return isInt(v, type.min, type.max) ? null : `must be an integer from ${type.min}${type.max !== undefined ? ` to ${type.max}` : ""}`;
    case "bool":
      return typeof v === "boolean" ? null : "must be true or false";
    case "enum":
      return typeof v === "string" && type.values.includes(v) ? null : `must be one of ${type.values.join(", ")}`;
    case "globs": {
      if (!Array.isArray(v) || v.length < type.min || v.length > type.max) return `must be ${type.min} to ${type.max} globs`;
      const bad = v.find((g) => typeof g !== "string" || g.length > 256 || globProblem(g) !== null);
      return bad === undefined ? null : `${JSON.stringify(bad)} is not a glob (R-PATH-1)`;
    }
    case "member":
      return typeof v === "string" && MEMBER.test(v) ? null : "must be a member handle";
    case "act":
      return typeof v === "string" && ACT_ID.test(v) ? null : "must be an entry ID";
    case "segment":
      return typeof v === "string" && v !== "" && bytes(v) <= 255 && v !== "." && v !== ".." && !v.includes("/") && !GLOB_META.test(v) ? null : "must be one path segment";
    case "sha":
      return typeof v === "string" && SHA.test(v) ? null : "must be a git object name";
    case "digest":
      return typeof v === "string" && DIGEST.test(v) ? null : "must be a digest";
    case "obligation":
      return typeof v === "string" && OBLIGATION.test(v) ? null : "must be an obligation ID";
    case "checker":
      return typeof v === "string" && CHECKER.test(v) ? null : "must be a checker name";
    case "op":
      return typeof v === "string" && OP_ID.test(v) ? null : "must be an operation ID";
    case "check-input": {
      if (!isObj(v)) return "must be a check input";
      if (v["kind"] === "tree") return keysAre(v, ["kind", "tree"]) && SHA.test(String(v["tree"])) ? null : "must be { kind: tree, tree }";
      if (v["kind"] === "filtered") return keysAre(v, ["kind", "snapshot", "paths"]) && DIGEST.test(String(v["snapshot"])) && valueProblem(v["paths"], { t: "globs", min: 0, max: 64 }) === null ? null : "must be { kind: filtered, snapshot, paths }";
      return "must be a tree or filtered snapshot input";
    }
  }
}

/** `because` (R-SIG-6): at most 64 reasons, each an act, a commit or an https URL. */
function becauseProblem(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 64) return "because must be at most 64 reasons";
  for (const r of v) {
    const ok =
      isObj(r) &&
      ((keysAre(r, ["act"]) && ACT_ID.test(String(r["act"]))) ||
        (keysAre(r, ["commit"]) && SHA.test(String(r["commit"]))) ||
        (keysAre(r, ["url"]) && typeof r["url"] === "string" && r["url"].length <= 2048 && /^https:\/\/[^\s]+$/.test(r["url"])));
    if (!ok) return `${JSON.stringify(r)} is not a reason`;
  }
  return null;
}

/** A declared field's type, as a value type. */
function declaredType(f: DeclaredField): FieldType {
  switch (f.type) {
    case "text":
      return { t: "text", max: f.max };
    case "int":
      return { t: "int", min: f.min, max: f.max };
    case "enum":
      return { t: "enum", values: f.values };
    case "globs":
      return { t: "globs", min: 1, max: f.max };
    default:
      return { t: f.type };
  }
}

/** Whether a declared field is required on a target shape (R-DECL-12). */
function requiredOn(f: DeclaredField, shape: TargetShape): boolean {
  if (f.optional) return false;
  return f.requiredFor === undefined || f.requiredFor.includes(shape);
}

// ----------------------------------------------------------------- bodies

/** What the body check needs to know about the thread an act targets: where its scope comes from. */
export type ThreadScope = (lane: string) => "body.scope" | "fixed" | undefined;

/**
 * Why the body or target does not fit the vocabulary in force, or null
 * (`body-invalid`, R-DECL-4, R-DECL-5, R-DECL-12, R-DECL-17, R-DECL-21).
 * Under the legacy vocabulary, bodies keep the checks verify has always
 * made (decode.ts), and a grant or session must have the legacy shape.
 */
export function bodyProblem(env: Envelope, vocab: Vocabulary, scopeOf: ThreadScope): string | null {
  const kind = env.kind as string;
  const body = env.body as unknown;
  if (kind === "roster") return grantShapeProblem(body as Obj, vocab);
  if (vocab.kind === "legacy" || kind === "renew") return null;
  if (kind === "recover") return recoverProblem(env.target, body);
  const decl = vocab.doc.acts[kind]!;
  const shape = targetShape(env.target);
  if (shape === null || decl.targets[shape] === undefined) return `the target ${JSON.stringify(env.target)} is not one of ${kind}'s targets (${Object.keys(decl.targets).join(", ")})`; // V:target
  if (!isObj(body)) return "the body is not an object"; // V:body-object
  const steps = decl.targets[shape]! as readonly Step[];
  // The fields the act may carry: its own, its steps', and because (R-DECL-12).
  const stepFields = new Map<string, StepField>();
  for (const s of steps) for (const [name, f] of Object.entries(vocab.steps.fields[s])) stepFields.set(name, f);
  const own = decl.body ?? {};
  for (const name of Object.keys(body))
    if (!Object.hasOwn(own, name) && !stepFields.has(name) && name !== "because") return `${name} is not a field of ${kind} on target ${shape}`; // V:body-closed
  if (Object.hasOwn(body, "because")) {
    const b = becauseProblem(body["because"]);
    if (b) return b; // V:because
  }
  for (const [name, f] of Object.entries(own)) {
    // A field is present only as the body's own field: a declared name may also be a name every object inherits, such as toString (R-DECL-12).
    const present = Object.hasOwn(body, name); // V:own-field
    if (!present) {
      if (requiredOn(f, shape)) return `${name} is required on target ${shape}`; // V:declared-required
      continue;
    }
    const p = valueProblem(body[name], declaredType(f));
    if (p) return `${name} ${p}`; // V:declared-type
  }
  for (const [name, f] of stepFields) {
    let required = f.need === "required";
    if (f.need === "scope") {
      // Where the scope comes from is fixed at open (R-DECL-7): the opening declaration's hold, or the thread's.
      const source = steps.includes("open") ? (decl.hold?.scope === "body.scope" ? "body.scope" : "fixed") : scopeOf(String((env.target as Obj | null)?.["lane"]));
      if (source === "fixed") {
        if (Object.hasOwn(body, name)) return `${name} is not allowed: the thread's scope is fixed (R-DECL-7)`; // V:scope-fixed
        continue;
      }
      required = true;
    }
    if (!Object.hasOwn(body, name)) {
      if (required) return `${name} is required by step ${steps.join(" then ")}`; // V:step-required
      continue;
    }
    const p = valueProblem(body[name], f.type);
    if (p) return `${name} ${p}`; // V:step-type
  }
  return null;
}

/**
 * A grant's and a room-custody session's shape under the vocabulary in
 * force (R-DECL-17): under a `v2` document they carry a signed map,
 * `acts`, and name only platform kinds plainly; under a `v1` document they
 * have the legacy shape, with no map.
 */
function grantShapeProblem(op: Obj, vocab: Vocabulary): string | null {
  const grant = op["op"] === "delegate" ? op : op["op"] === "invite" && isObj(op["session"]) ? op["session"] : null;
  if (grant === null) return null;
  const v2 = "acts" in grant;
  if (vocab.kind === "legacy" && v2) return `a ${op["op"]} with a signed map from kind to binding, under a v1 document`; // V:grant-shape-legacy
  if (vocab.kind === "declared" && !v2) return `a ${op["op"]} without a signed map from kind to binding, under a v2 document (R-DECL-17)`; // V:grant-shape-declared
  return null;
}

/** The fields, target shapes and types of each `recover` op (R-DECL-21). */
const RECOVER: Readonly<Record<string, { readonly targets: readonly TargetShape[]; readonly fields: Readonly<Record<string, StepField>> }>> = {
  open: {
    targets: ["none"],
    fields: { goal: { type: { t: "text", max: 1024 }, need: "required" }, scope: { type: GLOBS, need: "required" }, plan: { type: { t: "text", max: 16384 }, need: "optional" } },
  },
  take: {
    targets: ["thread"],
    fields: {
      scope: { type: GLOBS, need: "required" },
      expectedGeneration: GENERATION,
      lease: { ...LEASE, need: "optional" },
      goal: { type: { t: "text", max: 1024 }, need: "optional" },
      plan: { type: { t: "text", max: 16384 }, need: "optional" },
    },
  },
  version: { targets: ["thread"], fields: { lease: LEASE, expectedGeneration: GENERATION, head: HEAD, summary: { type: { t: "text", max: 8192 }, need: "required" } } },
  approve: { targets: ["version"], fields: { ...STEPS_V1.fields.review, text: { type: { t: "text", max: 16384 }, need: "required" } } },
  land: { targets: ["version"], fields: STEPS_V1.fields.land },
  release: { targets: ["thread"], fields: STEPS_V1.fields.release },
  note: { targets: ["entry", "line"], fields: { text: { type: { t: "text", max: 16384 }, need: "required" }, replyTo: { type: { t: "act" }, need: "optional" } } },
};
const RECOVER_BECAUSE = ["open", "take", "version"];

function recoverProblem(target: unknown, body: unknown): string | null {
  if (!isObj(body)) return "the body is not an object";
  const op = String(body["op"]);
  const spec = RECOVER[op]!;
  const shape = targetShape(target);
  if (shape === null || !spec.targets.includes(shape)) return `recover ${op} takes target ${spec.targets.join(" or ")}`; // V:recover-target
  for (const name of Object.keys(body))
    if (name !== "op" && !Object.hasOwn(spec.fields, name) && !(name === "because" && RECOVER_BECAUSE.includes(op))) return `${name} is not a field of recover ${op}`; // V:recover-closed
  if (Object.hasOwn(body, "because")) {
    const b = becauseProblem(body["because"]);
    if (b) return b;
  }
  for (const [name, f] of Object.entries(spec.fields)) {
    if (!Object.hasOwn(body, name)) {
      if (f.need === "required") return `${name} is required by recover ${op}`; // V:recover-required
      continue;
    }
    const p = valueProblem(body[name], f.type);
    if (p) return `${name} ${p}`; // V:recover-type
  }
  return null;
}

/** The steps an act runs on its target under the vocabulary in force: none for a platform kind (R-DECL-4). */
export function stepsOf(env: Envelope, vocab: Vocabulary): readonly Step[] {
  const decl = declarationOf(vocab, env.kind as string);
  const shape = targetShape(env.target);
  return decl && shape ? ((decl.targets[shape] ?? []) as readonly Step[]) : [];
}
