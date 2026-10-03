/**
 * Reading a room's declarations as a client does (docs/protocol.md R-DECL-15
 * to R-DECL-17, R-DECL-23, R-API-9 as amended; declared acts stage 5).
 *
 * A `Catalogue` is what the `acts` read returns for one policy version. The
 * functions here are pure: the meaning of a record under the catalogue of
 * its own seq, the fields an act takes on a target, the binding each named
 * code-review method was built for, and a grant expanded into a signed map.
 * They decide nothing the room does not decide again at admission.
 *
 * This module imports no evaluator, so clients can load it without the
 * expression engine.
 */

import type {
  ActDeclaration,
  ActsCatalogue,
  Binding,
  Catalogue,
  DeclaredField,
  DelegablePlatformKind,
  GrantMap,
  KindName,
  PolicyDocumentV2,
  RecordMeaning,
  Role,
  Seq,
  Step,
  TargetShape,
} from "@generalbusiness/artroom-contract";
import { ARTROOM_LEGACY_V1 } from "@generalbusiness/artroom-contract";
import { TARGET_ORDER, bindingOf } from "./binding.ts";
import { CODE_REVIEW_ACTS } from "./codereview.ts";
import { STEP_FIELD_SPECS, type StepFieldSpec } from "./steps.ts";
import { delegableBy, isPlatformKind } from "./vocabulary.ts";

/** The part of a `v2` document the vocabulary functions read, rebuilt from a catalogue. */
function documentOf(c: ActsCatalogue, acts: Readonly<Record<KindName, ActDeclaration>>): PolicyDocumentV2 {
  return { format: "artroom-policy-v2", steps: c.steps, lanes: c.lanes, acts } as unknown as PolicyDocumentV2;
}

const declarationsOf = (c: ActsCatalogue): Record<KindName, ActDeclaration> => Object.fromEntries(Object.entries(c.acts).map(([k, a]) => [k, a.declaration]));

// ------------------------------------------------------------ meaning

const capital = (s: string) => (s === "" ? s : s[0]!.toUpperCase() + s.slice(1));

/** The meaning of `kind` under the catalogue of the record's own seq. */
export function meaningOf(catalogue: Catalogue, kind: string): RecordMeaning {
  const policy = catalogue.policy;
  if (catalogue.vocabulary === "artroom-legacy-v1") {
    if ((ARTROOM_LEGACY_V1.envelope.kinds as readonly string[]).includes(kind))
      return { vocabulary: "artroom-legacy-v1", policy, kind, label: capital(kind), ...(catalogue.until !== null ? { retired: catalogue.until } : {}) }; // G5:meaning-legacy
    return { vocabulary: "unknown", policy, kind, label: kind };
  }
  if (isPlatformKind(kind)) return { vocabulary: "platform", policy, kind, label: capital(kind) }; // G5:meaning-platform
  const a = Object.hasOwn(catalogue.acts, kind) ? catalogue.acts[kind] : undefined; // G5:meaning-own
  if (!a) return { vocabulary: "unknown", policy, kind, label: kind };
  return {
    vocabulary: "declared",
    policy,
    kind,
    label: a.declaration.label, // G5:meaning-label
    declaration: a.declaration,
    binding: a.binding,
    ...(a.retired !== undefined ? { retired: a.retired } : {}), // G5:meaning-retired
  };
}

/** Whether a catalogue governs the entry at `seq`: `since <= seq`, and `seq < until` when the version has ended. */
export function governs(catalogue: Catalogue, seq: Seq): boolean {
  return catalogue.since <= seq && (catalogue.until === null || seq < catalogue.until); // G5:governs
}

/** A recorded value as a reader shows it: text as it is, yes or no, a number, a list of text joined, anything else as JSON. */
function valueText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no"; // G5:title-bool
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join(", ");
  return JSON.stringify(v);
}

/** The names of the body fields a declaration types as text. Own names only: a field may be named `toString`. */
function textFields(declaration: ActDeclaration): ReadonlySet<string> {
  const out = new Set<string>();
  for (const [name, field] of Object.entries(declaration.body ?? {})) if (field.type === "text") out.add(name); // G5:title-text-type
  return out;
}

/**
 * A short title for the record of an act that opened a thread: its label at
 * its own seq, then the value of one body field, when it has one.
 * `Start a song: Blue Bossa`.
 *
 * Which field: the first by name that the act's own declaration, as it was
 * at the record's seq, types as text. A text field is what a person wrote
 * to be read; an enum, a number or an ID seldom names anything. "Text" is
 * the declared type, not the type of the value: an enum's value is a string
 * too. With no such field present, or with no declaration at hand (a legacy,
 * platform or unknown kind, or a caller that has only the label), it is the
 * first field by name. `scope` and `because` never name a thread, and
 * `scope` is all that the `open` step itself brings, so no step field is
 * considered.
 *
 * "First" is by name, which is the order the room records a body in: the
 * log keeps canonical JSON, whose keys are sorted. Sorting here gives the
 * same title from the body a caller typed and from the record a reader
 * reads back.
 */
export function titleOf(meaning: { readonly label: string; readonly declaration?: ActDeclaration }, body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return meaning.label;
  const names = Object.keys(body)
    .sort() // G5:title-order
    .filter((n) => n !== "scope" && n !== "because"); // G5:title-first
  const text = meaning.declaration ? textFields(meaning.declaration) : null;
  const name = names.find((n) => text?.has(n)) ?? names[0]; // G5:title-text
  return name === undefined ? meaning.label : `${meaning.label}: ${valueText((body as Record<string, unknown>)[name])}`;
}

/**
 * What a reader calls a thread. A thread a `claim` opened has a goal. A
 * thread an application opened with its own act may have none: it is then
 * named by that act, in the words and field types in force when it opened
 * (`titleOf`), and by its ID when the opening act is not at hand.
 */
export function threadTitle(lane: { readonly lane: string; readonly goal: string }, opening?: { readonly meaning: { readonly label: string; readonly declaration?: ActDeclaration }; readonly body: unknown }): string {
  if (lane.goal !== "") return lane.goal; // G5:title-goal
  return opening ? titleOf(opening.meaning, opening.body) : lane.lane;
}

// ------------------------------------------------------------ fields of an act

/** One body field of an act on a target, as a form shows it. */
export type ActField =
  | { readonly name: string; readonly from: "declaration"; readonly required: boolean; readonly field: DeclaredField }
  | { readonly name: string; readonly from: "step"; readonly step: Step; readonly required: boolean; readonly field: StepFieldSpec };

/**
 * The body fields an act takes on a target shape (R-DECL-5, R-DECL-12): its
 * steps' fields, then its own declared fields. Null when the declaration
 * does not accept the shape. `because` may be added to any declared act.
 * A hold whose scope is a template fixes the scope, so `open` then takes no
 * `scope` field (R-DECL-7).
 */
export function fieldsOf(declaration: ActDeclaration, shape: TargetShape): readonly ActField[] | null {
  const steps = declaration.targets[shape];
  if (!steps) return null;
  const out: ActField[] = [];
  for (const step of steps as readonly Step[]) {
    for (const [name, field] of Object.entries(STEP_FIELD_SPECS[step])) {
      if (out.some((f) => f.name === name)) continue;
      if (name === "scope" && step === "open" && declaration.hold !== undefined && declaration.hold.scope !== "body.scope") continue; // G5:fields-fixed-scope
      out.push({ name, from: "step", step, required: field.optional !== true, field }); // G5:fields-step
    }
  }
  for (const [name, field] of Object.entries(declaration.body ?? {})) {
    const required = field.optional === true ? false : field.requiredFor === undefined || field.requiredFor.includes(shape); // G5:fields-required
    out.push({ name, from: "declaration", required, field });
  }
  return out;
}

/** The target shapes a declaration accepts, in the fixed order. */
export function targetsOf(declaration: ActDeclaration): readonly TargetShape[] {
  return TARGET_ORDER.filter((t) => declaration.targets[t] !== undefined);
}

// ------------------------------------------------------------ the named methods

/**
 * The binding a named code-review method or tool carries in a room with
 * this catalogue (R-API-9 as amended): the binding of the code-review
 * declaration it was built for, under the room's steps version and `lanes`.
 * It is not the room's own declaration's binding. Where the two differ, the
 * room refuses the act `binding-stale`. Null for a kind that is not one of
 * the seven.
 */
export async function builtForBinding(catalogue: ActsCatalogue, kind: string): Promise<Binding | null> {
  if (!Object.hasOwn(CODE_REVIEW_ACTS, kind)) return null;
  return bindingOf(documentOf(catalogue, CODE_REVIEW_ACTS), kind); // G5:built-for
}

// ------------------------------------------------------------ grants

/** A grant as a `v2` room takes it: platform kinds by name, declared kinds by a signed map (R-DECL-17). */
export interface ExpandedGrant {
  readonly kinds: readonly DelegablePlatformKind[];
  readonly acts: GrantMap;
}

export type GrantExpansion = { readonly ok: true; readonly grant: ExpandedGrant } | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Expand what a grantor asks to grant into the map it signs (R-DECL-17).
 * `*` means every kind the grantor's role may sign and delegate in this
 * catalogue. A list names kinds one by one. Nothing is granted that the
 * expansion does not name: a kind added by a later document is not covered.
 * A listed kind the role may not grant, or that is not declared, is a
 * problem and nothing is returned, so the grantor never signs less than
 * they asked for without being told.
 */
export function expandGrant(catalogue: ActsCatalogue, role: Role, kinds: "*" | readonly string[]): GrantExpansion {
  const may = delegableBy(documentOf(catalogue, declarationsOf(catalogue)), role);
  const wanted = kinds === "*" ? [...may.platform, ...may.declared] : [...kinds]; // G5:grant-star
  const problems: string[] = [];
  const platform: DelegablePlatformKind[] = [];
  const acts: Record<KindName, Binding> = {};
  for (const kind of wanted) {
    if (may.platform.includes(kind)) {
      if (!platform.includes(kind as DelegablePlatformKind)) platform.push(kind as DelegablePlatformKind);
    } else if (may.declared.includes(kind)) {
      acts[kind] = catalogue.acts[kind]!.binding; // G5:grant-binding
    } else {
      problems.push(Object.hasOwn(catalogue.acts, kind) || isPlatformKind(kind) ? `The role ${role} may not grant ${kind}.` : `${kind} is not declared in policy version ${catalogue.policy}.`); // G5:grant-refuse
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, grant: { kinds: platform, acts } };
}
