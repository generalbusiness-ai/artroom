/**
 * The binding identity of a declared kind (docs/protocol.md R-DECL-15). A
 * signed act carries its kind's binding, so a declaration change can never
 * give an old signature a new meaning. Stage 1: nothing at runtime calls it.
 */

import type {
  ActDeclaration,
  Binding,
  BindingField,
  BindingHold,
  BindingSubject,
  DeclaredField,
  Json,
  KindName,
  PolicyDocumentV2,
  TargetShape,
} from "@generalbusiness/artroom-contract";
import { digestJson } from "./integrity.ts";

/** Target shapes in their fixed order; `required` lists follow it. */
export const TARGET_ORDER: readonly TargetShape[] = ["none", "thread", "version", "entry", "line"];

/** The targets a field is required on: none if optional, `requiredFor` if given, otherwise all of the act's. */
function required(field: DeclaredField, targets: readonly TargetShape[]): TargetShape[] {
  if (field.optional) return [];
  const on = field.requiredFor ?? targets;
  return TARGET_ORDER.filter((t) => targets.includes(t) && on.includes(t));
}

function bindingField(field: DeclaredField, targets: readonly TargetShape[]): BindingField {
  const req = required(field, targets);
  switch (field.type) {
    case "text":
    case "globs":
      return { type: field.type, max: field.max, required: req };
    case "int":
      return { type: "int", min: field.min, max: field.max, required: req };
    case "enum":
      return { type: "enum", values: [...field.values], required: req };
    default:
      return { type: field.type, required: req };
  }
}

/**
 * The binding subject of one kind in a document: `{ steps, kind, targets,
 * threads, body, hold }`, every default resolved. It leaves out `label`,
 * `help`, `refusals` and `who`.
 */
export function bindingSubject(doc: PolicyDocumentV2, kind: KindName): BindingSubject {
  const d: ActDeclaration | undefined = Object.hasOwn(doc.acts, kind) ? doc.acts[kind] : undefined;
  if (!d) throw new Error(`${kind} is not declared`);
  const targets = TARGET_ORDER.filter((t) => d.targets[t] !== undefined);
  const body: Record<string, BindingField> = {};
  for (const [name, field] of Object.entries(d.body ?? {})) body[name] = bindingField(field, targets);
  let hold: BindingHold | null = null;
  if (d.hold) {
    hold = {
      scope: d.hold.scope === "body.scope" ? "body.scope" : [...d.hold.scope],
      conflict: d.hold.conflict ?? doc.lanes,
      leaseSeconds: d.hold.leaseSeconds ?? "room",
      reserveSeconds: d.hold.reserveSeconds ?? null,
      workspace: d.hold.workspace ?? false,
    };
  }
  const steps: Record<string, readonly string[]> = {};
  for (const t of targets) steps[t] = [...d.targets[t]!];
  return {
    steps: doc.steps,
    kind,
    targets: steps as BindingSubject["targets"],
    threads: [...(d.threads ?? [])],
    body,
    hold,
  };
}

/** `sha256:` and the hex SHA-256 of the binding subject's RFC 8785 canonical JSON. */
export function bindingOf(doc: PolicyDocumentV2, kind: KindName): Promise<Binding> {
  return digestJson(bindingSubject(doc, kind) as unknown as Json);
}

/** Every declared kind's binding, keyed by kind. */
export async function bindingsOf(doc: PolicyDocumentV2): Promise<Readonly<Record<KindName, Binding>>> {
  const out: Record<KindName, Binding> = {};
  for (const kind of Object.keys(doc.acts)) out[kind] = await bindingOf(doc, kind);
  return out;
}
