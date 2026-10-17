/**
 * The catalogue: one act tool per act declaration of each definition the
 * inventory holds, bound to exact declarations, named by the words table,
 * with collisions resolved across the whole catalogue, and listed for the
 * caller's standing (plan 031, section 3).
 *
 * - **Binding identity.** The definition's name, the native kind, and the
 *   digest of the canonical bytes of the act's declaration with the item
 *   types it names. Rows with one identity under several definition digests
 *   are one tool that serves every such digest.
 * - **Names.** The words table gives each identity a surface name. A name
 *   that exactly one identity carries is used as it is. A name that two or
 *   more carry is given to none of them: each becomes `<name>@<variant>`,
 *   the first eight hex characters of a digest over its binding identity,
 *   extended by eights until the variants differ. No name is privileged.
 * - **Generation.** The digest of the semantic inputs only: the bindings with
 *   the digests they serve, the standing per membership, the configured
 *   roots, the active definitions, the words table and the launch options.
 *   No head is in it, and no count of lanes: another lane under a known
 *   declaration changes nothing an agent reads in the list.
 */

import type { Digest, PlatformDefinition, ScopeId, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, hex, isPlatformDefinition, sha256, utf8 } from "@generalbusiness/artroom-bytes";
import { actInputSchema, describeAct, grantAction, type ActLike, type DefinitionLike, type Described, type Who } from "./describe.ts";
import { surfaceOf, wordsDigest, type Words } from "./words.ts";
import { markRefusals, markText } from "./marks.ts";

/** Where a scope of the inventory sits. */
export type Place = "register" | "directory" | "partition" | "membership" | "rules" | "destination" | "inbox" | "lane" | "application" | "root";

/** One scope of the inventory, with the definition it pins. */
export interface Held {
  scope: ScopeId;
  ref: ScopeRef;
  place: Place;
  pinned: Digest | PlatformDefinition;
  definition: DefinitionLike;
  /** The membership scope that standing for this scope is read from, or null when none is known. */
  membership: ScopeId | null;
  /** For a lane: what the directory lists. */
  lane?: { number: number | null; kind: string | null; title: string | null; state: string | null };
}

/** The caller's standing on one membership: known (and then a role and its actions, or none), or unknown. */
export type Standing =
  | { known: true; role: string | null; actions: readonly string[]; handle: string | null; key: string }
  | { known: false; reason: string };

export interface Inventory {
  scopes: readonly Held[];
  standing: Readonly<Record<string, Standing>>;
  roots: readonly { scope: ScopeId; membership: ScopeRef | null }[];
  active: readonly { name: string; digest: string }[];
}

export type Mode = "default" | "generic" | "add";
export interface Options { mode: Mode; tools: readonly string[] | null; words: Words }

/** One binding: an act declaration, the digests it serves, and the scopes of the inventory that pin one of them. */
export interface Binding {
  definition: string;
  kind: string;
  declaration: Digest;
  digests: string[];
  act: ActLike;
  /** One definition that holds the act, to render it with: every one that does holds the same row and items. */
  holder: DefinitionLike;
  /** The pinned name or digest it is rendered under. */
  pinned: string;
  scopes: Held[];
  /** Before collisions are resolved. */
  base: string;
  /** After. */
  name: string;
  /** Whether the target is optional: the room's own scope of a singleton platform kind. */
  singleton: boolean;
}

/** An MCP tool as `tools/list` sends it. */
export interface Tool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

const SINGLETONS: ReadonlySet<Place> = new Set(["register", "directory", "membership", "rules", "destination", "inbox"]);

/** The item types an act names: every string of its declaration that is an item type of the definition. */
function itemsNamed(act: unknown, items: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const named = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") { if (Object.hasOwn(items, v)) named.add(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) { walk(k); walk(x); }
  };
  walk(act);
  return Object.fromEntries([...named].sort().map((name) => [name, items[name]]));
}

/** The names of the rules an act's guards name, and the platform marks (`{ code, row }`) they carry, anywhere in them. */
function rendered(act: unknown): { rules: Set<string>; marks: Map<string, { code: string; row: string }> } {
  const rules = new Set<string>();
  const marks = new Map<string, { code: string; row: string }>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v !== "object" || v === null) return;
    const o = v as Record<string, unknown>;
    if (typeof o["rule"] === "string") rules.add(o["rule"]);
    if (typeof o["code"] === "string") marks.set(`${o["code"]} ${String(o["row"] ?? "")}`, { code: o["code"], row: String(o["row"] ?? "") });
    for (const x of Object.values(o)) walk(x);
  };
  walk(act);
  return { rules, marks };
}

/**
 * The digest of an act declaration and everything its rendering reads (section 3, "One tool per act declaration"): the act, the
 * item types it names, the bodies of the rules its guards name, the definition's profile, and, for a platform definition, the
 * text and refusal names of each mark it carries in the pinned version. Two definitions whose rows match but whose rule bodies,
 * profile or marks differ are two declarations, so no description can speak for the other's meaning.
 */
export function declarationDigest(definition: DefinitionLike, kind: string, pinned?: string): Digest {
  const act = definition.acts[kind];
  const { rules, marks } = rendered(act);
  const bodies = Object.fromEntries([...rules].sort().map((name) => [name, definition.rules?.[name] ?? null]));
  const marked = pinned === undefined || !isPlatformDefinition(pinned) ? {} : Object.fromEntries([...marks.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, m]) => [k, [markText(pinned, m), [...markRefusals(pinned, m.code)]]]));
  const profile = (definition as { profile?: unknown }).profile ?? null;
  return digestBytes(utf8(canonicalize({ act, items: itemsNamed(act, definition.items), rules: bodies, profile, marks: marked } as never)));
}

/** The variant of a binding identity: hex of a digest over it, `chars` long. */
export function variantOf(identity: { definition: string; kind: string; declaration: string }, chars: number): string {
  return hex(sha256(utf8(canonicalize([identity.definition, identity.kind, identity.declaration])))).slice(0, chars);
}

/** Every binding of the inventory, with its resolved name. */
export function bindingsOf(inventory: Inventory, words: Words): Binding[] {
  const byIdentity = new Map<string, Binding>();
  for (const held of inventory.scopes) {
    const d = held.definition;
    for (const kind of Object.keys(d.acts).sort()) {
      if (kind === d.genesis) continue;
      const declaration = declarationDigest(d, kind, held.pinned);
      const key = `${d.name}\n${kind}\n${declaration}`;
      let binding = byIdentity.get(key);
      if (!binding) {
        binding = { definition: d.name, kind, declaration, digests: [], act: d.acts[kind]!, holder: d, pinned: held.pinned, scopes: [], base: surfaceOf(words, d.name, kind), name: "", singleton: false };
        byIdentity.set(key, binding);
      }
      if (!binding.digests.includes(held.pinned)) binding.digests.push(held.pinned);
      binding.scopes.push(held);
    }
  }
  const bindings = [...byIdentity.values()];
  for (const b of bindings) {
    b.digests.sort();
    b.pinned = b.digests[0]!;
    b.singleton = b.scopes.every((s) => SINGLETONS.has(s.place));
  }
  // Names are resolved after mapping, across the whole catalogue.
  const byName = new Map<string, Binding[]>();
  for (const b of bindings) byName.set(b.base, [...(byName.get(b.base) ?? []), b]);
  for (const [base, sharing] of byName) {
    if (sharing.length === 1) { sharing[0]!.name = base; continue; }
    for (let chars = 8; ; chars += 8) {
      const variants = sharing.map((b) => variantOf(b, chars));
      if (new Set(variants).size === variants.length || chars >= 64) {
        sharing.forEach((b, i) => { b.name = `${base}@${variants[i]}`; });
        break;
      }
    }
  }
  return bindings.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Who may sign a binding's act, for this caller, over the scopes it serves. The memberships are taken in the order of their scope
 * IDs, so the text does not depend on the order the scopes were read in. Where they give different roles, the role is a
 * per-membership account: "admin on sc_a..., member on sc_b...".
 */
export function whoOf(binding: Binding, inventory: Inventory): Who {
  const action = grantAction(binding.act);
  const memberships = [...new Set(binding.scopes.map((s) => s.membership))].sort((a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1));
  const standings = memberships.map((m) => (m === null ? undefined : inventory.standing[m]));
  if (standings.some((s) => s === undefined || !s.known)) {
    return standings.every((s) => s === undefined || !s.known) ? { standing: "unknown" } : { standing: "partly-unknown" };
  }
  const known = standings as Extract<Standing, { known: true }>[];
  const roles = [...new Set(known.map((s) => s.role ?? "none"))];
  const role = roles.length === 1 ? roles[0]! : known.map((s, i) => `${s.role ?? "none"} on ${memberships[i]}`).join(", ");
  const holds = known.map((s) => action !== null && s.actions.includes(action));
  if (holds.every(Boolean)) return { standing: "holds", role };
  if (holds.some(Boolean)) return { standing: "mixed" };
  return { standing: "lacks", role: roles.length === 1 ? known[0]!.role : role };
}

/** Whether a binding is listed for this caller: a rule decides who may sign, its standing is unknown, or the role holds the action somewhere. */
export function listed(binding: Binding, inventory: Inventory): boolean {
  if (typeof binding.act.grant !== "string") return true;
  const who = whoOf(binding, inventory);
  return who.standing !== "lacks";
}

/** Whether `--tools` selects a binding: by its definition's name, with or without `platform:`. */
export function selected(binding: Binding, tools: readonly string[] | null): boolean {
  return tools === null || tools.includes(binding.definition) || tools.includes(binding.definition.replace(/^platform:/, ""));
}

/** The text of a binding for this caller, with the pointer that its description names when it must be cut. */
export function describedOf(binding: Binding, inventory: Inventory, mode: Mode): Described {
  const pointer = mode === "generic" ? `inspect with describe: "${binding.kind}", or actions` : `inspect with describe: "${binding.kind}"`;
  return describeAct(binding.holder, binding.kind, binding.act, whoOf(binding, inventory), { pinned: binding.pinned, active: inventory.active },
    { definition: binding.definition, kind: binding.kind, declaration: binding.declaration, digests: binding.digests }, pointer);
}

/** The output of an act tool: the scope's answer, or the server's finding, with the sentence and the next step. */
export const ACT_OUTPUT: Record<string, unknown> = {
  type: "object",
  properties: {
    answer: { type: "string", description: "accepted, refused, unavailable, mismatch, or unknown when the reply was lost" },
    sentence: { type: "string" }, next: { type: "string" },
    scope: { type: "string" }, kind: { type: "string" }, tool: { type: "string" },
    fact: { type: "object" }, outboxIds: { type: "array", items: { type: "string" } },
    reason: { type: "string" }, name: { type: "string" }, judgedAt: { type: "object" },
    retained: { type: "boolean", description: "true when this is a terminal outcome kept under custody, and nothing was sent" },
  },
  required: ["answer", "sentence", "next"],
};

/** The act tool of one binding. */
export function actTool(binding: Binding, inventory: Inventory, mode: Mode): Tool {
  const text = describedOf(binding, inventory, mode);
  return {
    name: binding.name,
    title: `${binding.kind} (${binding.definition})`,
    description: text.description,
    inputSchema: actInputSchema(binding.act, { pinned: binding.pinned, active: inventory.active }, binding.singleton ? "optional" : "required"),
    outputSchema: ACT_OUTPUT,
    // Truthful annotations: an act can close, remove or redact declared state; a repeat under the required key is idempotent.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { "dap/binding": { definition: binding.definition, kind: binding.kind, declaration: binding.declaration, digests: binding.digests } },
  };
}

/** The generation: the digest of the semantic inputs of the list, and nothing else. */
export function generationOf(bindings: readonly Binding[], inventory: Inventory, options: Options): Digest {
  const standing = Object.entries(inventory.standing).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([membership, s]) => (s.known ? [membership, s.role, [...s.actions].sort()] : [membership, "unknown"]));
  return digestBytes(utf8(canonicalize({
    v: 1,
    words: wordsDigest(options.words),
    mode: options.mode,
    tools: options.tools === null ? null : [...options.tools].sort(),
    bindings: bindings.map((b) => [b.definition, b.kind, b.declaration, b.digests]),
    standing,
    roots: [...inventory.roots].map((r) => [r.scope, r.membership?.scope ?? null]).sort(),
    // The directory's created applications, each with its digest: a new one changes the list once, when it is created.
    applications: inventory.scopes.filter((s) => s.place === "application").map((s) => [s.scope, s.pinned]).sort(),
    active: [...inventory.active].map((a) => [a.name, a.digest]).sort(),
  })));
}
