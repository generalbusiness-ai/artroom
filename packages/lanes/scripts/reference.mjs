#!/usr/bin/env node
// Write docs/lanes-reference.md: one table of every item type, act, handler
// and timed rule of the two lane definitions, from the values in src/.
//
//   node packages/lanes/scripts/reference.mjs           write the file
//   node packages/lanes/scripts/reference.mjs --check   exit 1 if the file is not what this writes
//
// A person runs it after scripts/pin.mjs, when a row of a definition changes.
// The file is stamped with the two pinned digests, and nothing in it is
// written by hand. docs/lanes.md is the guide that says how to read a row.
//
// The column "Needs" comes from the validator: it names the capability
// versions whose code a row needs, which `validateDefinition` lists in
// `underived`. A row with a name there runs under no production wiring yet.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { validateDefinition } from "@generalbusiness/artroom-derive";
import { change } from "../src/change.ts";
import { DIGESTS, LANE_FORMS } from "../src/digests.ts";
import { issue } from "../src/issue.ts";

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "lanes-reference.md");

const code = (text) => `\`${text}\``;
const cell = (text) => String(text).replaceAll("|", "\\|");
const table = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n");
const list = (parts) => (parts.length === 0 ? "None" : parts.join("; "));

/** A field type in words, as the contract's section 6.2 names its members. */
function type(t) {
  switch (t.type) {
    case "text": return `text, at most ${t.max} bytes${t.detached ? ", detached" : ""}`;
    case "int": return `int, ${t.min} to ${t.max}`;
    case "enum": return `enum: ${t.of.map(code).join(", ")}`;
    case "item": return `item of type ${code(t.of)}`;
    case "fact": return `fact of kind ${t.kind.map(code).join(", ")} under ${code(t.under)}`;
    case "scope": return `scope of kind ${code(t.kind)}`;
    case "record": return `record of ${Object.entries(t.of).map(([name, member]) => `${code(name + (member.required ? "" : "?"))} (${type(member)})`).join(", ")}`;
    case "list": return `list of at most ${t.max}, each a ${type(t.of)}`;
    default: return t.type;
  }
}

const flags = (slot) => [slot.fixed && "fixed", slot.required && "required", slot.list && `list of at most ${slot.max}`, slot.author && "author"].filter(Boolean);
const slotLine = (name, what, slot) => `${code(name)}: ${what}${flags(slot).length > 0 ? ` (${flags(slot).join(", ")})` : ""}`;
const fields = (record) => list(Object.entries(record).map(([name, field]) => `${code(name + (field.required ? "" : "?"))}: ${type(field)}`));
const also = (record) => list(Object.entries(record).map(([name, rule]) =>
  `${code(name)}: ${code(rule.item)} ${"by" in rule ? `by the field ${code(rule.by)}` : "via" in rule ? `through the slot ${code(rule.via.slot)} of ${code(rule.via.of)}` : "the one item of its type"}`));
const settles = (s) => (s === undefined ? "" : "copy" in s ? `a copy in ${s.copy.map(code).join(", ")}` : `${code(s.of)} in ${s.in.map(code).join(", ")}`);
const counts = (form) => `${form.guards.length}, ${form.effects.length}, ${form.sends.length}, ${form.attention.length}`;

function section(name, definition) {
  const checked = validateDefinition(definition, PROPOSED_BOUNDS);
  if (!checked.ok) throw new Error(`${name} does not pass the validator: ${JSON.stringify(checked.problems)}`);
  // The capability versions each row needs: a path of `underived` begins with the part and the row's name.
  const needs = (part, row) => [...new Set(checked.definition.underived.filter((u) => u.path.startsWith(`${part}.${row}.`) || u.path === `${part}.${row}`).map((u) => u.capability))].sort().map(code).join(", ");

  const items = Object.entries(definition.items).map(([key, item]) => [
    code(key),
    item.many ? `many, at most ${item.max} live` : "one",
    Object.entries(item.states).map(([state, s]) => (s.final ? `**${code(state)}**` : code(state)) + (state === item.initial ? " (initial)" : "")).join(", "),
    list([
      ...Object.entries(item.parties).map(([slot, s]) => slotLine(slot, "member", s)),
      ...Object.entries(item.refs).map(([slot, s]) => slotLine(slot, type(s.to), s)),
      ...Object.entries(item.values).map(([slot, s]) => slotLine(slot, type(s.of), s)),
    ]),
    needs("items", key),
  ]);
  const acts = Object.entries(definition.acts).map(([key, act]) => [
    code(key) + (key === definition.genesis ? " (genesis)" : ""),
    `${act.step} on ${act.on === null ? "no item" : code(act.on)}`,
    code(act.grant),
    also(act.also),
    fields(act.fields) + (act.presents ? `. Presented: ${list(Object.entries(act.presents).map(([n, p]) => `${code(n + (p.required ? "" : "?"))}: fact of kind ${p.kind.map(code).join(", ")} under ${code(p.under)}`))}` : ""),
    settles(act.settles),
    counts(act),
    needs("acts", key),
  ]);
  const receives = Object.entries(definition.receives).map(([key, handler]) => [
    code(key),
    `${handler.class} ${code(handler.message)}`,
    `${code(handler.from.kind)}${handler.from.under === undefined ? "" : ` under ${code(handler.from.under)}`}`,
    handler.opens === null ? "Nothing" : code(handler.opens),
    handler.copies === undefined ? "" : String(handler.copies),
    also(handler.also),
    fields(handler.fields),
    settles(handler.settles),
    counts(handler),
    needs("receives", key),
  ]);
  const timed = Object.entries(definition.timed).map(([key, rule]) => [
    code(key),
    code(rule.on),
    rule.states.map(code).join(", "),
    code(rule.deadline),
    `${rule.effects.length}, ${rule.attention.length}`,
  ]);

  return [
    `## ${code(name)}`,
    `Name ${code(definition.name)}. Genesis act ${code(definition.genesis)}. Capabilities listed: ${definition.capabilities.map((c) => code(`${c.name}@${c.version}`)).join(", ")}. Rule expressions: ${Object.keys(definition.rules).length}.`,
    `### Item types of ${code(name)}: ${items.length}`,
    table(["Type", "How many", "States", "Slots", "Needs"], items),
    `### Acts of ${code(name)}: ${acts.length}`,
    table(["Kind", "Step", "Grant", "Other items", "Fields", "Settles", "Guards, effects, sends, attention", "Needs"], acts),
    `### Handlers of ${code(name)}: ${receives.length}`,
    table(["Name", "Class and message", "From", "Opens", "Copies", "Other items", "Fields", "Settles", "Guards, effects, sends, attention", "Needs"], receives),
    `### Timed rules of ${code(name)}: ${timed.length}`,
    table(["Name", "On", "In states", "Deadline slot", "Effects, attention"], timed),
  ].join("\n\n");
}

/** The whole file, as text. */
export function reference() {
  const lanes = { issue, change };
  return [
    "# Lane reference",
    "This file is generated. Do not edit it. `packages/lanes/scripts/reference.mjs` writes it from the two lane\ndefinitions in `packages/lanes/src`. [lanes.md](lanes.md) says how to read a row.",
    "The stamp: the definitions this file was generated from, by their pinned digests.",
    table(["Definition", "Digest", "Canonical bytes"], Object.entries(lanes).map(([name, definition]) => [code(name), code(DIGESTS[name]), String(Buffer.byteLength(canonicalize(definition)))])),
    `The rows were written from Lane forms and browser flow, revision ${LANE_FORMS.revision}, at ${code(LANE_FORMS.commit)}.`,
    [
      "How to read the tables:",
      "",
      "- A final state is in bold. `?` marks a field or a member that is optional.",
      "- A slot's flags are in brackets: `fixed`, `required`, `list` and `author`. A slot with none has none.",
      "- \"Guards, effects, sends, attention\" gives the number of forms of each kind that the row writes. The forms\n  themselves are in `packages/lanes/src`.",
      "- \"Settles\" is the pending state that the row's entry ends, where the row declares one.",
      "- \"Needs\" names the capability versions whose code the row needs. The validator reads such a row and derives\n  nothing of it. The derive package holds that code as pure functions, and no production port is given it, so a scope under either definition is not founded\n  or created under the production wiring: `unsupported-definition`.",
    ].join("\n"),
    ...Object.entries(lanes).map(([name, definition]) => section(name, definition)),
  ].join("\n\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = reference();
  if (process.argv.includes("--check")) {
    let found = null;
    try { found = readFileSync(target, "utf8"); } catch { /* no file yet */ }
    if (found !== text) {
      console.error("docs/lanes-reference.md is not what packages/lanes/scripts/reference.mjs writes; run it without --check");
      process.exit(1);
    }
    console.log("docs/lanes-reference.md is current");
  } else {
    writeFileSync(target, text);
    console.log(`wrote docs/lanes-reference.md, ${Buffer.byteLength(text)} bytes`);
  }
}
