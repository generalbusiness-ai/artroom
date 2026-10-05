/**
 * Declared acts in the CLI (docs/protocol.md R-DECL-16, R-DECL-23, section
 * 33.10; declared acts stage 5): how a catalogue is printed, how a typed
 * field is read from the command line, and how a change of meaning is
 * described. Pure functions; main.ts does the reading and sending.
 */

import type { ActDeclaration, ActsCatalogue, Catalogue, Json, RecordMeaning, TargetShape } from "@generalbusiness/artroom-contract";
import { fieldsOf, targetsOf, type ActField } from "@generalbusiness/artroom-client";

const TARGET_HINT: Readonly<Record<TargetShape, string>> = {
  none: "no target",
  thread: "--lane LANE",
  version: "--lane LANE --generation N",
  entry: "--entry ACT",
  line: `--target '{"lane":…,"generation":…,"head":…,"path":…,"line":…}'`,
};

/** A field's type in a few words, with its limits. */
export function typeText(f: ActField): string {
  const t = f.field;
  switch (t.type) {
    case "text":
      return `text, up to ${t.max} bytes`;
    case "int":
      return "max" in t ? `whole number, ${t.min} to ${t.max}` : `whole number, from ${t.min}`;
    case "bool":
      return "true or false";
    case "enum":
      return `one of ${t.values.join(", ")}`;
    case "globs":
      return `globs, comma-separated, up to ${t.max}`;
    case "member":
      return "a member handle, such as @alice";
    case "act":
      return "an entry ID";
    case "segment":
      return "one path segment";
    case "sha":
      return "a full commit SHA";
    case "check-input":
      return "JSON: a check input";
    default:
      return `a ${t.type}`;
  }
}

const targetsText = (d: ActDeclaration) =>
  targetsOf(d)
    .map((shape) => `${shape}: ${d.targets[shape]!.join(" then ")}`)
    .join("; ");

/** `acts`: one line per declared kind, then how to see one and how to act. */
export function actsText(c: Catalogue): string[] {
  if (c.vocabulary !== "declared") {
    return [
      `Policy version ${c.policy} is the legacy vocabulary: this room declares no acts of its own.`,
      "Use the named commands: claim, propose, note, review, land, release, renew.",
    ];
  }
  const kinds = Object.keys(c.acts);
  const width = Math.max(...kinds.map((k) => k.length), 4);
  const lines = [`Policy version ${c.policy}${c.until === null ? ", active" : `, in force for seq ${c.since} to ${c.until - 1}`}, declares ${kinds.length} ${kinds.length === 1 ? "act" : "acts"}:`];
  for (const kind of kinds) {
    const a = c.acts[kind]!;
    lines.push(`  ${kind.padEnd(width)}  ${a.declaration.label}${a.retired !== undefined ? ` (retired at seq ${a.retired})` : ""}  [${targetsText(a.declaration)}]`);
  }
  lines.push("For one act's fields and binding: artroom acts KIND");
  return lines;
}

/** `acts KIND`: everything needed to prepare the act, and the command that does it. */
export function actText(c: ActsCatalogue, kind: string): string[] {
  const a = c.acts[kind]!;
  const d = a.declaration;
  const lines = [`${kind}: ${d.label}${a.retired !== undefined ? ` (retired at seq ${a.retired})` : ""}`];
  if (d.help) lines.push(`  ${d.help}`);
  lines.push(`  Who may sign it: admin${d.who.roles.length ? `, ${d.who.roles.join(", ")}` : ""}.${d.who.delegable === false ? " It cannot be delegated." : ""}`);
  if (d.threads) lines.push(`  Acts on threads opened by: ${d.threads.join(", ")}.`);
  if (d.hold) {
    const lease = d.hold.leaseSeconds !== undefined ? `${d.hold.leaseSeconds} seconds` : "the room's lease";
    lines.push(`  Opens a thread: scope ${d.hold.scope === "body.scope" ? "from --set scope=…" : `fixed as ${d.hold.scope.join(", ")}`}; lease ${lease}.`);
  }
  for (const shape of targetsOf(d)) {
    lines.push(`  On target ${shape} (${TARGET_HINT[shape]}): ${d.targets[shape]!.join(" then ")}`);
    for (const f of fieldsOf(d, shape) ?? []) lines.push(`    ${f.name}: ${typeText(f)}${f.required ? "" : ", optional"}${f.from === "step" ? ` (the ${f.step} step's)` : ""}`);
  }
  lines.push(`  Binding: ${a.binding}`);
  lines.push(`  Policy version: ${c.policy}`);
  if (c.until === null && a.retired === undefined) lines.push(`To do it: artroom act ${kind} --binding ${a.binding} [target] --set FIELD=VALUE …`);
  return lines;
}

/** Thrown for a value that does not fit its field. */
export class FieldError extends Error {}

/** One `--set name=value`, read by the field's type. The room checks it again. */
export function parseValue(f: ActField, raw: string): Json {
  const t = f.field;
  const bad = (): never => {
    throw new FieldError(`${f.name} takes ${typeText(f)}, not ${JSON.stringify(raw)}.`);
  };
  switch (t.type) {
    case "int": {
      if (!/^-?\d+$/.test(raw)) bad();
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || n < t.min || ("max" in t && n > t.max)) bad(); // G5:cli-int
      return n;
    }
    case "bool":
      if (raw !== "true" && raw !== "false") bad(); // G5:cli-bool
      return raw === "true";
    case "enum":
      if (!t.values.includes(raw)) bad(); // G5:cli-enum
      return raw;
    case "globs":
      return raw === "" ? [] : raw.split(",");
    case "check-input":
      try {
        return JSON.parse(raw) as Json;
      } catch {
        return bad();
      }
    default:
      return raw;
  }
}

/** The body of an act from `--body` JSON and `--set` pairs, by the fields the act takes on this target. */
export function bodyOf(fields: readonly ActField[], base: Readonly<Record<string, Json>>, sets: readonly string[]): Record<string, Json> {
  const body: Record<string, Json> = { ...base };
  const known = new Map(fields.map((f) => [f.name, f]));
  for (const pair of sets) {
    const eq = pair.indexOf("=");
    if (eq < 1) throw new FieldError(`--set takes NAME=VALUE, not ${JSON.stringify(pair)}.`);
    const name = pair.slice(0, eq);
    const f = known.get(name);
    if (!f) throw new FieldError(`${name} is not a field of this act on this target. Its fields are: ${[...known.keys()].join(", ") || "none"}.`); // G5:cli-field-unknown
    body[name] = parseValue(f, pair.slice(eq + 1));
  }
  for (const name of Object.keys(body)) {
    if (name !== "because" && !known.has(name)) throw new FieldError(`${name} is not a field of this act on this target. Its fields are: ${[...known.keys()].join(", ") || "none"}.`); // G5:cli-body-unknown
  }
  return body;
}

/** The required fields a body still lacks. */
export const missing = (fields: readonly ActField[], body: Readonly<Record<string, Json>>): string[] =>
  // Own properties only: a field may be named like an inherited one, such as constructor or toString (R-DECL-12).
  fields.filter((f) => f.required && (!Object.hasOwn(body, f.name) || body[f.name] === undefined)).map((f) => f.name); // G5:cli-missing-own

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What differs between two meanings of a kind, in the parts a binding
 * covers: targets and steps, thread kinds, body fields, the hold. One line
 * each. Empty when nothing that the binding covers differs.
 */
export function meaningChanges(before: ActDeclaration, after: ActDeclaration): string[] {
  const out: string[] = [];
  if (!same(before.targets, after.targets)) out.push(`Targets and steps: was [${targetsText(before)}], now [${targetsText(after)}].`);
  if (!same(before.threads ?? [], after.threads ?? [])) out.push(`Threads it acts on: was ${(before.threads ?? []).join(", ") || "none"}, now ${(after.threads ?? []).join(", ") || "none"}.`);
  const names = new Set([...Object.keys(before.body ?? {}), ...Object.keys(after.body ?? {})]);
  for (const name of names) {
    // Own properties only: a field may be named like an inherited one (R-DECL-12).
    const b = before.body !== undefined && Object.hasOwn(before.body, name) ? before.body[name] : undefined; // G5:cli-changes-own
    const a = after.body !== undefined && Object.hasOwn(after.body, name) ? after.body[name] : undefined;
    if (b === undefined) out.push(`Field ${name}: new.`);
    else if (a === undefined) out.push(`Field ${name}: removed.`);
    else if (!same(b, a)) out.push(`Field ${name}: was ${JSON.stringify(b)}, now ${JSON.stringify(a)}.`);
  }
  if (!same(before.hold ?? null, after.hold ?? null)) out.push(`Hold: was ${JSON.stringify(before.hold ?? null)}, now ${JSON.stringify(after.hold ?? null)}.`);
  return out;
}

/** A record's kind as the log shows it: the label in force at its own seq, and its retirement (R-DECL-23). */
export function kindText(kind: string, m: RecordMeaning | undefined): string {
  if (m === undefined || m.vocabulary !== "declared") return kind; // G5:cli-kind-label
  return `${kind} (${m.label}${m.retired !== undefined ? `, retired at seq ${m.retired}` : ""})`;
}
