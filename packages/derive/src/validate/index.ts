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
 * `timed` (5.2 and 6.4), `capacity` (17.2) and `capability` (6.11). `shape`
 * holds the readers and the problems, `context` what the families share,
 * and `sizes` the byte bounds.
 */

import type { Bounds, DeclaredDefinition, Digest } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, own } from "../values.ts";
import { capabilities, type Underived } from "./capability.ts";
import { capacityOf, type DutyAmounts, type PendingCopy } from "./capacity.ts";
import { mark, marked, type Defining, type MarkPlace, type RangeIndex } from "./context.ts";
import { acts, receives } from "./handlers.ts";
import { heldUnderBytes, holdForms, holdTypes } from "./hold.ts";
import { reserving, type Reserving } from "./holds.ts";
import { itemTypes } from "./items.ts";
import { observes } from "./observes.ts";
import { at, shapes, type Problem } from "./shape.ts";
import type { Markers } from "../markers.ts";
import { decisions } from "./binding.ts";
import { setOnce } from "./markers.ts";
import { timedEntryBytes, timedGraph, timedKinds, timedRules } from "./timed.ts";

export type { MarkKind, MarkPlace, RangeIndex } from "./context.ts";
export type { Problem, ProblemCode } from "./shape.ts";
export type { Underived } from "./capability.ts";
export type { KindReserved, Reserving } from "./holds.ts";
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
  /**
   * Section 17.2, row 3: for each item type and each state in which an item
   * awaits a settlement that an act or handler declares with `settles`, the
   * entries that item reserves: the settling entry and what it can start.
   */
  readonly pending: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Section 17.2, row 4: each relationship whose copies await a settlement, with the states and the entries a copy in one of them reserves. */
  readonly pendingCopies: readonly PendingCopy[];
  /** Known declared duty terms, including future requests and their result-source bytes. Other axes/retention remain partial. */
  readonly dutyAmounts: DutyAmounts;
  /**
   * Section 6.11: each form that this package reads and does not derive by
   * itself, with the capability version whose own code derives it. A runtime
   * or a verifier that has no such code answers `unsupported-definition` for
   * the whole definition (`derivable`). Empty: every form is derived here.
   */
  readonly underived: readonly Underived[];
  /**
   * Section 6.1, "Platform code: a mark, and its rule": each mark of the
   * data of a platform definition, with its place. A runtime or a verifier
   * that lacks the rule of one, of the kind of its place, answers
   * `unsupported-definition` for the whole definition (`runnable`, in
   * `marks.ts`). Empty: a declared definition, which holds no mark.
   */
  readonly marks: readonly MarkPlace[];
  /**
   * Section 17.2a: what the data of a platform definition reserves by the
   * `holds` of its item types, the `adds` of its acts and the marks of its
   * kinds of `outcomes`, as amounts in the five dimensions. Absent: a
   * declared definition, or platform data with no kind and no `holds`.
   */
  readonly reserving?: Reserving;
  /**
   * Section 17.2, "A marker duty" (revision 22): each item type that some
   * form settles by a mark, with what the amounts of its duties are derived
   * from (`markers.ts`). An item of such a type reserves by its state and
   * by the marks that are `true`, so `pending` has no row for the type.
   * Absent: no form of the definition settles by a mark.
   */
  readonly markers?: Markers;
  /**
   * Section 17.2a, "An index that an item type declares" (revision 23): for
   * each item type of platform data that states `indexes`, its indexed
   * slots. The fold writes one row for each, with the item. Absent: no type
   * declares one.
   */
  readonly keyed?: Readonly<Record<string, readonly string[]>>;
  /**
   * Section 16.1, "The subjects that an entry observes" (revision 20): the
   * data of a platform definition states rows of `observes`, or the
   * `origin` of an outcome, somewhere. Then each entry of the definition
   * retains exactly the observations of the subjects that its rows give,
   * and an outcome's `uses` is a copy of its origin's. False: no data of
   * the definition states either, as for every declared definition, and
   * the older rule stands as a stand-in (`observes.ts`, "The stand-in").
   */
  readonly observing: boolean;
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

/**
 * What only a platform definition may state, and only the platform package passes (section 6.1). `platform`: the value is the data
 * of a platform definition. Its name may begin `platform:`. It has the member `outcomes`, and it may hold a mark at each of the seven
 * places. The validator checks that each mark is well formed and stands at one of them, lists it, and derives nothing from it. It
 * does not read the table of rules. A definition that came from an input is validated without the option: a mark in it is a form
 * that the contract does not define, and is refused as any such form is.
 */
export interface ValidateOptions {
  readonly platform?: boolean;
  /** Static declarations of the trusted pinned owner code, by outcome kind. */
  readonly outcomeValues?: Readonly<Record<string, readonly import("../ledger.ts").EvidenceValueDomain[]>> | null;
}

export function validateDefinition(input: unknown, bounds: Bounds, profiles: Readonly<Record<string, Profile>> = PROFILES, options: ValidateOptions = {}): Validation {
  if (options.outcomeValues === null) return { ok: false, problems: [{ code: "shape", path: "outcomes", message: "an owner with an evidence value reader has no static domain declaration for this pinned version and kind" }] };
  const read = shapes(bounds);
  const { problems, bad, rec, entries, str } = read;

  const platform = options.platform === true;
  const top = rec(input, "", ["format", "name", "profile", "capabilities", "genesis", "items", "acts", "receives", "timed", "rules", ...(platform ? ["outcomes"] : [])]);
  if (!top) return { ok: false, problems };
  // Section 6.1: the bound on a definition's canonical bytes limits the validator's work, so it is checked before anything is read.
  // A value with no canonical bytes is refused at the end, as before.
  let size: number | null = null;
  try { size = utf8(canonicalize(input)).length; } catch { /* refused below */ }
  if (size !== null && size > bounds.definitionBytes) return { ok: false, problems: [{ code: "bound", path: "", message: `has ${size} canonical bytes; at most ${bounds.definitionBytes}` }] };
  if (top["format"] !== "artroom-definition-1") bad("shape", "format", "must be artroom-definition-1");
  // Section 6.1: a definition states its own name, which `under` is compared with. A name that begins `platform:` is the name of a
  // platform definition, which the platform supplies in code, so no declared definition takes one. The platform package alone passes
  // the option `platform`, for the data of a definition that it supplies.
  const named = str(top["name"], "name");
  if (!platform && named?.startsWith("platform:")) bad("shape", "name", "a declared definition's name does not begin with platform:");

  const d: Defining = {
    ...read, bounds, name: typeof top["name"] === "string" ? top["name"] : null, typeNames: new Set(isObject(top["items"]) ? Object.keys(top["items"]) : []), types: new Map(), rules: new Set(), holds: false, holdTypes: new Set(),
    capabilities: new Map(), underived: [],
    indexes: [], clauseSets: [], clause: null, duties: [], platform, marks: [], places: new Map(), valueSets: [], bindings: [], observing: false,
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

  // Section 6.1: each capability the definition uses, by name and version. They are read first: a field type may name one.
  capabilities(d, top["capabilities"]);

  // Fields and items (sections 6.2 and 6.3).
  itemTypes(d, top["items"]);
  // Every later check resolves names against the item types, so a problem above would only repeat itself below.
  if (problems.length > 0) return { ok: false, problems };

  // Acts, handlers and timed rules (sections 6.4 and 5.2).
  const written = isObject(top["acts"]) ? top["acts"] : {};
  const timed = isObject(top["timed"]) ? top["timed"] : {};
  // The hold types are needed before any effect is read: a `hold: open` effect on the primary item of an `open` act.
  holdTypes(d, written);
  acts(d, top["acts"], timed, top);
  receives(d, top["receives"], top);
  timedKinds(d, top["acts"], top["receives"]);
  const timedTypes = new Set<string>(d.holdTypes);
  /** Each timed rule that was read whole: its type, the states it applies in, and the state it leaves its item in. */
  const moves = timedRules(d, top["timed"], timedTypes, top["outcomes"]);

  // Section 17.2, a chain of timed rules. A timed entry is never refused, so the room for every rule of a chain is reserved with
  // the first deadline. When the rules of one type lead to one another in a cycle no chain is finite, and the drain of such an
  // item need never end.
  const graph = timedGraph(moves);
  for (const rule of moves) {
    if (graph.cyclic.has(rule.name)) bad("reserve-unbounded", at("timed", rule.name), "the timed rules of its type lead back to this rule, so no reservation covers what its deadline can start");
  }

  holdForms(d, top);
  // Section 6.4, "`settles` by a mark": no written effect sets a mark but to `true`. Section 17.2a: each key of `decisions` is the
  // message of a handler that states `bound`, whose `of` names that item type.
  setOnce(d);
  decisions(d);

  // Section 6.1, place 7: the mark of the rule for the outcome entries of each kind of operation that this definition owns.
  // "A request of an outcome's rule, and its clauses" (revision 17; row I3-23): the mark may hold one `send`. It is a send mark,
  // because an outcome has no subject and no field for a written send to read, and each effect of its clauses is an effect mark.
  if (platform) {
    for (const [kind, m] of entries(top["outcomes"], "outcomes", null)) {
      // Revision 21, section 17.2: the mark may state `attempts` and `most`, and its send `once`. `holds.ts` reads the three.
      const o = mark(d, m, at("outcomes", kind), "outcome", [], ["send", "attempts", "most", "origin", "observes"]);
      // Revision 20, section 6.1, "The origin of an outcome": one of the two words. With `opening`, nothing more is checked.
      if (o && "origin" in o) {
        d.observing = true;
        if (o["origin"] !== "opening" && o["origin"] !== "rule") bad("shape", at(at("outcomes", kind), "origin"), "is opening or rule");
      }
      // Section 16.1, "The subjects that an entry observes": the rows of each outcome entry of an operation of this kind.
      if (o && "observes" in o) observes(d, o["observes"], at(at("outcomes", kind), "observes"), { where: "outcome" });
      if (!o || !("send" in o)) continue;
      const p = at(at("outcomes", kind), "send");
      const send = marked(o["send"]) ? mark(d, o["send"], p, "send", ["result"], ["once"]) : bad("shape", p, "an outcome's mark holds at most one send, and it is a mark: an outcome's row writes no send");
      const clauses = send ? rec(send["result"], at(p, "result"), [], ["applied", "refused", "superseded", "undelivered", "conflict"]) : null;
      for (const [clause, effects] of Object.entries(clauses ?? {})) {
        d.list(effects, at(at(p, "result"), clause), bounds.effects).forEach((e, i) => {
          const q = at(at(at(p, "result"), clause), i);
          if (marked(e)) mark(d, e, q, "effect", [], ["most"]);
          else bad("shape", q, "a clause of an outcome's send holds effect marks only: an outcome has no subject and no field");
        });
      }
    }
  }

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
  // Section 17.2: each reservation is derived from the definition. A closure that is not finite is refused.
  const capacity = capacityOf(d, graph, moves);
  if (problems.length > 0) return { ok: false, problems };
  // Section 17.2a: a reservation that an item holds, and what each kind of `outcomes` reserves. In platform data only.
  const reserved = reserving(d, top, capacity, options.outcomeValues);
  const { decisionEntries: _decisionEntries, ...persistedCapacity } = capacity;
  if (problems.length > 0) return { ok: false, problems };
  try {
    const keyed = [...d.types.values()].flatMap((type): [string, readonly string[]][] => (type.indexes ? [[type.name, type.indexes]] : []));
    return { ok: true, definition: { declared, digest: definitionDigest(declared), timedTypes: [...timedTypes].sort(), holdTypes: [...d.holdTypes].sort(), indexes: d.indexes, ...persistedCapacity, underived: d.underived, marks: d.marks, observing: d.observing, ...(reserved ? { reserving: reserved } : {}), ...(keyed.length > 0 ? { keyed: Object.fromEntries(keyed) } : {}) } };
  } catch {
    return { ok: false, problems: [{ code: "shape", path: "", message: "has no canonical bytes" }] };
  }
}
