/**
 * Declared acts in the UI (docs/protocol.md R-DECL-5, R-DECL-12, R-DECL-16,
 * R-DECL-23; declared acts stage 5, request a5d64b35, clarification
 * fa120186). Pure functions, with no transport and no component:
 *
 * - reading what a person typed into a typed field, a target or a whole
 *   body, with the declared limits checked before anything is sent;
 * - showing a record with the label and fields in force at its own seq,
 *   never with the active vocabulary's;
 * - saying in plain words what changed between two meanings of one kind.
 *
 * The room decides again at admission. Nothing here admits anything.
 *
 * Each guard is one statement marked `// G5U:<id>`, a row of the UI
 * mutation table in the stage 5 report.
 */

import { fieldsOf, targetsOf, type ActField, type StepFieldSpec } from "@generalbusiness/artroom-policy/declared";
import type { EntryMeaning } from "./adapter.ts";
import type { ActDeclaration, DeclaredField, DeclaredTarget, Json, RecordMeaning, TargetShape } from "./contract.ts";

export { fieldsOf, targetsOf, type ActField };

// ------------------------------------------------------------ formats

const ACT_ID = /^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$/;
const MEMBER = /^@[a-z0-9][a-z0-9-]{0,38}$/;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const OBLIGATION = /^obl_[a-z][a-z0-9-]{0,63}$/;
const CHECKER = /^[a-z][a-z0-9-]{0,63}$/;
const OP_ID = /^op_[A-Za-z0-9_-]{1,64}$/;
const GLOB_META = /[*?[\]{}!\\]/;
const WHOLE = /^-?(0|[1-9][0-9]*)$/;

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The type of any field a form shows: a declared field's, or a step's own. */
export type FieldType = DeclaredField | StepFieldSpec;

/** What a person sees a field's type as, in plain words. */
export function typeText(f: FieldType): string {
  switch (f.type) {
    case "text":
      return `text, up to ${f.max} bytes`;
    case "int":
      return "max" in f && f.max !== undefined ? `a whole number from ${f.min} to ${f.max}` : `a whole number, ${f.min} or more`;
    case "bool":
      return "yes or no";
    case "enum":
      return `one of ${f.values.join(", ")}`;
    case "globs":
      return `path patterns, one per line, up to ${f.max}`;
    case "member":
      return "a member, such as @sam";
    case "act":
      return "an entry ID";
    case "segment":
      return "one path segment, with no slash";
    case "sha":
      return "a commit, 40 hex digits";
    case "digest":
      return "a digest, sha256: and 64 hex digits";
    case "obligation":
      return "an obligation ID";
    case "checker":
      return "a checker's name";
    case "op":
      return "an operation ID";
    case "check-input":
      return "a check input, as JSON";
    default:
      return "a value";
  }
}

// ------------------------------------------------------------ reading a field

export type FieldRead = { readonly ok: true; readonly value: Json | undefined } | { readonly ok: false; readonly problem: string };

const no = (problem: string): FieldRead => ({ ok: false, problem });
const yes = (value: Json | undefined): FieldRead => ({ ok: true, value });

/**
 * Read what was typed into one field. An empty optional field is left out
 * of the body. A value outside the declared limits is a problem, in words
 * the person can act on; nothing is trimmed or corrected silently except
 * surrounding white space on single-line values.
 */
export function readField(f: ActField, raw: string): FieldRead {
  const spec: FieldType = f.field;
  const text = spec.type === "text" || spec.type === "globs" || spec.type === "check-input" ? raw : raw.trim();
  if (text.trim() === "") {
    if (f.required) return no(`${f.name} is required.`); // G5U:required
    return yes(undefined); // G5U:optional-absent
  }
  switch (spec.type) {
    case "text":
      if (bytes(text) > spec.max) return no(`${f.name} is ${bytes(text)} bytes; the limit is ${spec.max}.`); // G5U:text-max
      return yes(text);
    case "int": {
      if (!WHOLE.test(text) || !Number.isSafeInteger(Number(text))) return no(`${f.name} must be a whole number.`); // G5U:int-whole
      const n = Number(text);
      if (n < spec.min) return no(`${f.name} must be ${spec.min} or more.`); // G5U:int-min
      if ("max" in spec && spec.max !== undefined && n > spec.max) return no(`${f.name} must be ${spec.max} or less.`); // G5U:int-max
      return yes(n);
    }
    case "bool":
      if (text !== "true" && text !== "false") return no(`${f.name} must be yes or no.`); // G5U:bool
      return yes(text === "true");
    case "enum":
      if (!spec.values.includes(text)) return no(`${f.name} must be one of ${spec.values.join(", ")}.`); // G5U:enum
      return yes(text);
    case "globs": {
      const globs = text
        .split("\n")
        .map((g) => g.trim())
        .filter((g) => g !== "");
      const min = "min" in spec ? spec.min : 1;
      if (globs.length < min) return no(`${f.name} needs at least ${min} path pattern${min === 1 ? "" : "s"}.`);
      if (globs.length > spec.max) return no(`${f.name} has ${globs.length} path patterns; the limit is ${spec.max}.`); // G5U:globs-max
      const long = globs.find((g) => g.length > 256);
      if (long !== undefined) return no(`A path pattern in ${f.name} is longer than 256 characters.`);
      return yes(globs);
    }
    case "member":
      if (!MEMBER.test(text)) return no(`${f.name} must be a member's handle, such as @sam.`); // G5U:member
      return yes(text);
    case "act":
      if (!ACT_ID.test(text)) return no(`${f.name} must be an entry ID, such as act_12_0a1b2c3d.`); // G5U:act
      return yes(text);
    case "segment":
      if (bytes(text) > 255 || text === "." || text === ".." || text.includes("/") || GLOB_META.test(text)) return no(`${f.name} must be one path segment, with no slash and no pattern character.`); // G5U:segment
      return yes(text);
    case "sha":
      if (!SHA.test(text)) return no(`${f.name} must be a commit: 40 hex digits.`); // G5U:sha
      return yes(text);
    case "digest":
      if (!DIGEST.test(text)) return no(`${f.name} must be a digest: sha256: and 64 hex digits.`);
      return yes(text);
    case "obligation":
      if (!OBLIGATION.test(text)) return no(`${f.name} must be an obligation ID, such as obl_tests.`);
      return yes(text);
    case "checker":
      if (!CHECKER.test(text)) return no(`${f.name} must be a checker's name.`);
      return yes(text);
    case "op":
      if (!OP_ID.test(text)) return no(`${f.name} must be an operation ID, such as op_land_3.`);
      return yes(text);
    case "check-input": {
      let v: unknown;
      try {
        v = JSON.parse(text);
      } catch {
        return no(`${f.name} must be JSON.`);
      }
      if (typeof v !== "object" || v === null || Array.isArray(v)) return no(`${f.name} must be a JSON object.`);
      return yes(v as Json);
    }
    default:
      // A field type this build does not know: never guessed at.
      return no(`${f.name} has a type this page cannot fill in.`); // G5U:unknown-type
  }
}

/** A body read from a form: the fields by name, or the problems by field name. */
export type BodyRead = { readonly ok: true; readonly body: { readonly [field: string]: Json } } | { readonly ok: false; readonly problems: Readonly<Record<string, string>> };

/**
 * The value kept under one of an application's names, never one inherited
 * from `Object.prototype`: a field may be named `constructor` or `toString`
 * (R-DECL-12).
 */
export const own = <T>(o: Readonly<Record<string, T>>, name: string): T | undefined => (Object.hasOwn(o, name) ? o[name] : undefined); // G5U:own-name

/**
 * A new idempotency key for one act a person sends: 1 to 64 characters of
 * `A-Z`, `a-z`, `0-9`, `_` and `-` (R-IDEM-1). The form keeps it with the
 * act, so that asking again after a lost answer is the same act.
 */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `ui-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Read every field of a form. One problem per field; the body is built only when there are none. */
export function readBody(fields: readonly ActField[], raw: Readonly<Record<string, string>>): BodyRead {
  const body: Record<string, Json> = {};
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const r = readField(f, own(raw, f.name) ?? "");
    if (!r.ok) problems[f.name] = r.problem;
    else if (r.value !== undefined) body[f.name] = r.value;
  }
  return Object.keys(problems).length ? { ok: false, problems } : { ok: true, body }; // G5U:body-problems
}

// ------------------------------------------------------------ targets

/** One input of a target, by shape (R-DECL-4). */
export interface TargetInput {
  readonly name: "lane" | "generation" | "act" | "head" | "path" | "line" | "endLine";
  readonly label: string;
  readonly optional?: true;
}

export const TARGET_INPUTS: Readonly<Record<TargetShape, readonly TargetInput[]>> = {
  none: [],
  thread: [{ name: "lane", label: "Thread" }],
  version: [
    { name: "lane", label: "Thread" },
    { name: "generation", label: "Version" },
  ],
  entry: [{ name: "act", label: "Entry" }],
  line: [
    { name: "lane", label: "Thread" },
    { name: "generation", label: "Version" },
    { name: "head", label: "Commit" },
    { name: "path", label: "File" },
    { name: "line", label: "Line" },
    { name: "endLine", label: "Last line", optional: true },
  ],
};

/** What a person calls each target shape. */
export const SHAPE_TEXT: Readonly<Record<TargetShape, string>> = {
  none: "Nothing: it starts something new",
  thread: "A thread",
  version: "A version of a thread",
  entry: "An entry in the log",
  line: "A line of a file in a version",
};

/** The same, as a short tag in the list of acts. */
export const SHAPE_TAG: Readonly<Record<TargetShape, string>> = {
  none: "Starts something new",
  thread: "On a thread",
  version: "On a version of a thread",
  entry: "On an entry in the log",
  line: "On a line of a file",
};

export type TargetRead = { readonly ok: true; readonly target: DeclaredTarget } | { readonly ok: false; readonly problems: Readonly<Record<string, string>> };

const positive = (s: string) => WHOLE.test(s) && Number(s) >= 1 && Number.isSafeInteger(Number(s));

/** Read a target of a shape from what was typed. */
export function readTarget(shape: TargetShape, raw: Readonly<Record<string, string>>): TargetRead {
  const v = (n: string) => (raw[n] ?? "").trim();
  const problems: Record<string, string> = {};
  const lane = () => {
    if (!ACT_ID.test(v("lane"))) problems["lane"] = "Choose a thread."; // G5U:target-lane
  };
  const generation = () => {
    if (!positive(v("generation"))) problems["generation"] = "The version is a whole number, 1 or more."; // G5U:target-generation
  };
  let target: DeclaredTarget = null;
  switch (shape) {
    case "none":
      break;
    case "thread":
      lane();
      target = { lane: v("lane") } as DeclaredTarget;
      break;
    case "version":
      lane();
      generation();
      target = { lane: v("lane"), generation: Number(v("generation")) } as DeclaredTarget;
      break;
    case "entry":
      if (!ACT_ID.test(v("act"))) problems["act"] = "Give an entry ID, such as act_12_0a1b2c3d."; // G5U:target-entry
      target = { act: v("act") } as DeclaredTarget;
      break;
    case "line": {
      lane();
      generation();
      if (!SHA.test(v("head"))) problems["head"] = "The commit is 40 hex digits.";
      const path = v("path");
      if (path === "" || path.startsWith("/") || path.split("/").some((s) => s === "" || s === "." || s === "..")) problems["path"] = "Give the file's path in the repository.";
      if (!positive(v("line"))) problems["line"] = "The line is a whole number, 1 or more.";
      const end = v("endLine");
      if (end !== "" && (!positive(end) || Number(end) < Number(v("line")))) problems["endLine"] = "The last line is a whole number, not before the first.";
      target = { lane: v("lane"), generation: Number(v("generation")), head: v("head"), path, line: Number(v("line")), ...(end !== "" ? { endLine: Number(end) } : {}) } as DeclaredTarget;
      break;
    }
  }
  return Object.keys(problems).length ? { ok: false, problems } : { ok: true, target };
}

// ------------------------------------------------------------ showing a record

/** The shape of a target value, or null when it fits none (R-DECL-4). */
export function shapeOfTarget(target: unknown): TargetShape | null {
  if (target === null) return "none";
  if (typeof target !== "object" || Array.isArray(target)) return null;
  const t = target as Record<string, unknown>;
  if ("act" in t) return "entry";
  if ("path" in t || "line" in t || "head" in t) return "line";
  if ("generation" in t) return "version";
  if ("lane" in t) return "thread";
  return null;
}

/** A target in plain words, or null for an act with no target. */
export function targetText(target: unknown): string | null {
  const shape = shapeOfTarget(target);
  const t = (target ?? {}) as Record<string, unknown>;
  switch (shape) {
    case "none":
      return null;
    case "thread":
      return `Thread ${String(t["lane"])}`;
    case "version":
      return `Version ${String(t["generation"])} of thread ${String(t["lane"])}`;
    case "entry":
      return `Entry ${String(t["act"])}`;
    case "line":
      return `${String(t["path"])}, line ${String(t["line"])}${t["endLine"] !== undefined ? ` to ${String(t["endLine"])}` : ""}, in version ${String(t["generation"])} of thread ${String(t["lane"])}`;
    default:
      return JSON.stringify(target);
  }
}

/** A recorded value as text: never dropped, never reinterpreted. */
export function valueText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join(", ");
  return JSON.stringify(v);
}

/**
 * A record as a reader sees it under `D(s)` (R-DECL-23): the label in force
 * at its own seq, its target and each body field by name, with when the
 * kind was retired. `because` is shown with the entry's reasons, not here.
 */
export function entryMeaning(env: { readonly kind: string; readonly target: unknown; readonly body: unknown }, meaning: RecordMeaning): EntryMeaning {
  const body = typeof env.body === "object" && env.body !== null && !Array.isArray(env.body) ? (env.body as Record<string, unknown>) : {};
  const fields = Object.entries(body)
    .filter(([name]) => name !== "because")
    .map(([name, value]) => ({ name, value: valueText(value) })); // G5U:record-fields
  return {
    vocabulary: meaning.vocabulary,
    kind: meaning.kind,
    label: meaning.label, // G5U:record-label
    policy: meaning.policy,
    ...(meaning.vocabulary === "declared" ? { binding: meaning.binding, declaration: meaning.declaration, ...(meaning.declaration.help !== undefined ? { help: meaning.declaration.help } : {}) } : {}), // G5U:record-declaration
    ...("retired" in meaning && meaning.retired !== undefined ? { retired: meaning.retired } : {}), // G5U:record-retired
    target: targetText(env.target),
    fields,
  };
}

// ------------------------------------------------------------ what changed

const fieldLine = (name: string, f: FieldType, required: boolean) => `${name} (${typeText(f)}, ${required ? "required" : "optional"})`;

/**
 * What differs between two meanings of one kind, as short sentences, for
 * the `binding-stale` notice. It compares what a person fills in and what
 * the act does: targets and their steps, fields, the threads it acts on and
 * the hold it opens. An empty list means the difference is elsewhere: the
 * room's steps version or lane mode.
 */
export function declarationChanges(was: ActDeclaration, now: ActDeclaration): string[] {
  const out: string[] = [];
  if (was.label !== now.label) out.push(`It was called “${was.label}” and is now “${now.label}”.`);
  const shapes = new Set<TargetShape>([...targetsOf(was), ...targetsOf(now)]);
  for (const shape of shapes) {
    const a = was.targets[shape] as readonly string[] | undefined;
    const b = now.targets[shape] as readonly string[] | undefined;
    const what = SHAPE_TEXT[shape].toLowerCase();
    if (a && !b) out.push(`It no longer acts on ${what}.`);
    else if (!a && b) out.push(`It can now act on ${what}: ${b.join(" then ")}.`);
    else if (a && b && a.join() !== b.join()) out.push(`On ${what} it now does ${b.join(" then ")}; it did ${a.join(" then ")}.`); // G5U:changes-steps
    if (!a || !b) continue;
    const before = new Map((fieldsOf(was, shape) ?? []).map((f) => [f.name, f]));
    const after = new Map((fieldsOf(now, shape) ?? []).map((f) => [f.name, f]));
    for (const [name, f] of after) {
      const old = before.get(name);
      const line = fieldLine(name, f.field, f.required);
      if (!old) out.push(`New field: ${line}.`); // G5U:changes-added
      else if (fieldLine(name, old.field, old.required) !== line) out.push(`Changed field: ${line}; it was ${fieldLine(name, old.field, old.required)}.`); // G5U:changes-field
    }
    for (const name of before.keys()) if (!after.has(name)) out.push(`The field ${name} is gone.`); // G5U:changes-removed
  }
  const threads = (d: ActDeclaration) => (d.threads ?? []).join(", ");
  if (threads(was) !== threads(now)) out.push(`It acts on these kinds of thread: ${threads(now) || "none"}; it was ${threads(was) || "none"}.`);
  if (JSON.stringify(was.hold ?? null) !== JSON.stringify(now.hold ?? null)) out.push("What it holds when it opens a thread changed: its scope, lease or workspace.");
  return [...new Set(out)];
}
