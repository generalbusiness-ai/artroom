/**
 * The definition validator (scope contract, sections 6.1 to 6.4). A scope
 * pins only a definition that passes, so every judge may rely on what is
 * checked here: names resolve, each form is one the contract defines, and
 * the static rules of sections 6.3 and 6.4 hold.
 *
 * The input is untrusted data. Any form or field the contract does not
 * define is refused, which refuses the forms of section 6.10.
 *
 * This file reads the definition's own members and puts the parts in
 * order. Each family of forms has its module beside it: `fields` and
 * `items` (sections 6.2 and 6.3), `operands` and `guards` (6.5), `effects`,
 * `sends` and `hold` (6.6 and 6.8), `handlers` for acts and handlers (6.4),
 * `timed` (5.2 and 6.4) and `capacity` (17.2). `shape` holds the readers and
 * the problems, `context` what the families share, and `sizes` the byte
 * bounds.
 */

import type { Bounds, DeclaredDefinition, Digest } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, own } from "../values.ts";
import { capacityOf } from "./capacity.ts";
import type { Defining, RangeIndex } from "./context.ts";
import { acts, receives } from "./handlers.ts";
import { heldUnderBytes, holdForms, holdTypes } from "./hold.ts";
import { itemTypes } from "./items.ts";
import { at, shapes, type Problem } from "./shape.ts";
import { timedEntryBytes, timedGraph, timedKinds, timedRules } from "./timed.ts";

export type { RangeIndex } from "./context.ts";
export { keptMessage } from "./sends.ts";
export type { Problem, ProblemCode } from "./shape.ts";
export { timedGraph, type TimedGraph, type TimedMove } from "./timed.ts";

/** A definition that passed, with what was derived from it. The judges and the fold take only this. */
export interface ValidDefinition {
  readonly declared: DeclaredDefinition;
  readonly digest: Digest;
  readonly timedTypes: readonly string[];   // section 5.2
  readonly holdTypes: readonly string[];    // section 6.8: the types a `hold: open` effect targets
  readonly indexes: readonly RangeIndex[];
  /**
   * Section 17.2, a chain of timed rules: for each timed item type and each
   * live state a timed rule applies in, the entries a deadline held in that
   * state reserves: one for each rule of the longest chain that starts there.
   */
  readonly deadlines: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * Section 17.2, a request's clauses: the entries a request reserves for
   * what the clause of its result or diagnosis can start. The largest, over
   * every request send of the definition and its clauses `applied`,
   * `refused`, `superseded` and `undelivered`, of the chains of the
   * deadlines that clause can create.
   */
  readonly clauseEntries: number;
}

export type Validation = { ok: true; definition: ValidDefinition } | { ok: false; problems: readonly Problem[] };

/**
 * An evaluator profile, by `name@version` (section 6.1). `admit` says why the
 * profile does not admit a rule's text, or null. It is synchronous. The
 * evaluator's own entry point, `@generalbusiness/artroom-derive/rule`, exports
 * the table that checks each rule; this one checks names and shapes only, so
 * that the judges never load the engine.
 */
export interface Profile { admit?: (source: string) => string | null }

export const PROFILES: Readonly<Record<string, Profile>> = { "restricted@1": {} };

export function validateDefinition(input: unknown, bounds: Bounds, profiles: Readonly<Record<string, Profile>> = PROFILES): Validation {
  const read = shapes(bounds);
  const { problems, bad, rec, entries, list, str } = read;

  const top = rec(input, "", ["format", "name", "profile", "capabilities", "genesis", "items", "acts", "receives", "timed", "rules"]);
  if (!top) return { ok: false, problems };
  // Section 6.1: the bound on a definition's canonical bytes limits the validator's work, so it is checked before anything is read.
  // A value with no canonical bytes is refused at the end, as before.
  let size: number | null = null;
  try { size = utf8(canonicalize(input)).length; } catch { /* refused below */ }
  if (size !== null && size > bounds.definitionBytes) return { ok: false, problems: [{ code: "bound", path: "", message: `has ${size} canonical bytes; at most ${bounds.definitionBytes}` }] };
  if (top["format"] !== "artroom-definition-1") bad("shape", "format", "must be artroom-definition-1");
  // Section 6.1: a definition states its own name, which `under` is compared with. A name that begins `platform:` is the name of a
  // platform definition, which the platform supplies in code, so no declared definition takes one.
  if (str(top["name"], "name")?.startsWith("platform:")) bad("shape", "name", "a declared definition's name does not begin with platform:");

  const d: Defining = {
    ...read, bounds, name: typeof top["name"] === "string" ? top["name"] : null, typeNames: new Set(isObject(top["items"]) ? Object.keys(top["items"]) : []), types: new Map(), rules: new Set(), holds: false, holdTypes: new Set(),
    indexes: [], clauseSets: [], clause: null,
  };

  const profile = rec(top["profile"], "profile", ["name", "version"]);
  const evaluator = (profile && own(profiles, `${String(profile["name"])}@${String(profile["version"])}`)) || null;
  if (profile && !evaluator) bad("profile", "profile", "is not a profile this runtime implements");
  // Section 6.5: a rule is a named expression in the profile's language.
  for (const [name, source] of entries(top["rules"], "rules", bounds.rules)) {
    const text = str(source, at("rules", name));
    const refusal = text === null ? null : (evaluator?.admit?.(text) ?? null);
    if (refusal !== null) bad("rule", at("rules", name), refusal);
    d.rules.add(name);
  }

  list(top["capabilities"], "capabilities", 2).forEach((c, i) => {
    const o = rec(c, at("capabilities", i), ["name", "version"]);
    if (!o) return;
    if (o["name"] === "hold" && o["version"] === 1) d.holds = true;
    else bad("capability", at("capabilities", i), "is not a capability this runtime implements");
  });

  // Fields and items (sections 6.2 and 6.3).
  itemTypes(d, top["items"]);
  // Every later check resolves names against the item types, so a problem above would only repeat itself below.
  if (problems.length > 0) return { ok: false, problems };

  // Acts, handlers and timed rules (sections 6.4 and 5.2).
  const written = isObject(top["acts"]) ? top["acts"] : {};
  const timed = isObject(top["timed"]) ? top["timed"] : {};
  // The hold types are needed before any effect is read: a `hold: open` effect on the primary item of an `open` act.
  holdTypes(d, written);
  acts(d, top["acts"], timed);
  receives(d, top["receives"]);
  timedKinds(d, top["acts"], top["receives"]);
  const timedTypes = new Set<string>(d.holdTypes);
  /** Each timed rule that was read whole: its type, the states it applies in, and the state it leaves its item in. */
  const moves = timedRules(d, top["timed"], timedTypes);

  // Section 17.2, a chain of timed rules. A timed entry is never refused, so the room for every rule of a chain is reserved with
  // the first deadline. When the rules of one type lead to one another in a cycle no chain is finite, and the drain of such an
  // item need never end.
  const graph = timedGraph(moves);
  for (const rule of moves) {
    if (graph.cyclic.has(rule.name)) bad("reserve-unbounded", at("timed", rule.name), "the timed rules of its type lead back to this rule, so no reservation covers what its deadline can start");
  }

  holdForms(d, top);

  // Section 6.4: a genesis opens no timed item.
  const genesis = typeof top["genesis"] === "string" ? own(written, top["genesis"]) : undefined;
  if (!isObject(genesis) || genesis["step"] !== "open") bad("genesis", "genesis", "names no open act");
  else if (timedTypes.has(genesis["on"] as string) || (Array.isArray(genesis["effects"]) && genesis["effects"].some((e) => isObject(e) && "hold" in e))) {
    bad("genesis-timed", "genesis", "the genesis act opens a timed item type or has a hold effect");
  }

  if (problems.length > 0) return { ok: false, problems };
  const declared = input as DeclaredDefinition;
  // Section 5.2: a due transition is always written, so its entry must fit whatever its item holds by then.
  for (const [name, rule] of Object.entries(declared.timed)) {
    const most = timedEntryBytes(name, rule, d.types.get(rule.on)!, bounds) + heldUnderBytes(declared, d.holdTypes, rule);
    if (most > bounds.entryBytes) bad("bound", at("timed", name), `its entry could take ${most} bytes; at most ${bounds.entryBytes}`);
  }
  if (problems.length > 0) return { ok: false, problems };
  const { deadlines, clauseEntries } = capacityOf(graph, d.clauseSets);
  try {
    return { ok: true, definition: { declared, digest: definitionDigest(declared), timedTypes: [...timedTypes].sort(), holdTypes: [...d.holdTypes].sort(), indexes: d.indexes, deadlines, clauseEntries } };
  } catch {
    return { ok: false, problems: [{ code: "shape", path: "", message: "has no canonical bytes" }] };
  }
}
