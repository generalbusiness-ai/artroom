/**
 * The rows of `observes`, and the origin of an outcome (scope contract,
 * revisions 20 and 21, sections 6.1 and 16.1, "The subjects that an entry
 * observes": the ten checks of "What the validator checks"; source rows
 * I3-39, I3-41, I3-53 and I3-56). The rows are platform data: a caller asks
 * this only with the platform option, and without it the member is refused
 * where it stands, as any member that the contract does not define there.
 *
 * A definition that fails a check does not validate, and a scope under it
 * is `unsupported-definition`. The contract names no problem for a check,
 * so each is reported under the code of its kind: `shape` for a member that
 * is not of its form, `name` for a source that the form may not read or
 * whose type is no member, and `bound` for a count or a size.
 */

import type { Bounds, Observe } from "@generalbusiness/artroom-contract";
import { RETAINED_INPUT_BYTES } from "@generalbusiness/artroom-contract";
import { isMemberRef } from "@generalbusiness/artroom-bytes";
import { isObject } from "../values.ts";
import type { Ctx, Defining } from "./context.ts";
import { operand } from "./operands.ts";
import { at, type Rec } from "./shape.ts";
import { ENTRY_BYTES, SCOPE_BYTES } from "./sizes.ts";

/**
 * The most rows of one form, and the most records of one `retains` (section
 * 16.1, checks 2 and 8). The 8 is a labelled proposal of the contract, as
 * the other bounds of its section 6.1 are. It is one number for both.
 */
export const OBSERVES_ROWS = 8;

/**
 * The largest canonical size of one retained observation, by its kind, with
 * its read, its use and its `prior` (section 16.1, check 7: "each
 * observation at the largest size of its kind").
 *
 * Authority revision 28 fixes the supported membership handle grammar to
 * ASCII letters, digits and hyphens, and action names to ASCII letters,
 * digits, hyphens and full stops. Neither needs JSON escaping. A handle
 * still takes at most `memberBytes`; a role takes at most 64 bytes and an
 * action list at most `listElements` names of 64 bytes. These size caps
 * are checked again for each observation before it serves a row.
 *
 * The rules content ceiling is 49,571 bytes at a 256-byte handle (authority
 * revision 28, section 3.3). The earlier 48,931 used 236-byte handles.
 * This counts observations and the fixed entry frame, not the outcome's
 * copied uses or effects; their separate whole-entry check remains owed.
 */
export function observationBytes(of: Observe["of"], bounds: Bounds, most = 0): number {
  const id = 2 + bounds.memberBytes;
  // `of`, `head`, `definition` and `at`, with the read, the use and `prior`.
  const common = SCOPE_BYTES + 128 + 96 + 40 + 320;
  switch (of) {
    case "key": return common + 96 + 2 * id + 2 * 96 + SCOPE_BYTES + 128 + bounds.listElements * 67;
    case "member": return common + 2 * id + 2 * 96 + 64;
    case "rules": case "definitions": return common + 32 + 49_571;
    case "holders": return common + 96 + 32 + most * (id + 1);
  }
}

/** The names of `also` that a source reads, at any depth: a slot `of` one, and an `item` of one. */
function alsoNames(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(alsoNames);
  if (!isObject(v)) return [];
  return Object.entries(v).flatMap(([k, x]) => ((k === "of" || k === "item") && typeof x === "string" && x.startsWith("also.") ? [x.slice(5)] : alsoNames(x)));
}

/** Each operand of that word that a source holds, at any depth, with its value. */
function reads(v: unknown, word: string): unknown[] {
  if (Array.isArray(v)) return v.flatMap((x) => reads(x, word));
  if (!isObject(v)) return [];
  return Object.entries(v).flatMap(([k, x]) => [...(k === word ? [x] : []), ...reads(x, word)]);
}

/**
 * Where a list of rows stands. `act` and `clause`: with the names that the
 * form's operands may read. `selected`: the names of `also` that a mark
 * binds, which no source of an act reads (check 10).
 */
export type Standing = { where: "act" | "clause"; ctx: Ctx; selected: ReadonlySet<string> } | { where: "outcome" };

/**
 * The rows of one form, by checks 2 to 10. Check 1, where a form may state
 * rows at all, is the caller's: it asks this for an act, for a kind of
 * `outcomes`, and for a clause that is not `undelivered`.
 */
export function observes(d: Defining, v: unknown, path: string, standing: Standing): void {
  const { bounds, bad, rec, list, int, str } = d;
  d.observing = true;
  // Check 2: a form has at most 8 rows.
  const rows = list(v, path, OBSERVES_ROWS);
  let subjects = 0;
  let bytes = ENTRY_BYTES;
  rows.forEach((row, i) => {
    const p = at(path, i);
    if (!isObject(row)) { bad("shape", p, "must be an object"); return; }
    const of = row["of"];
    const more = of === "member" || of === "key" ? ["from", "max"] : of === "holders" ? ["action", "most"] : of === "rules" || of === "definitions" ? [] : null;
    if (more === null) { bad("shape", at(p, "of"), "is key, member, rules, definitions or holders"); return; }
    // Checks 8 and 9: `retains` stands only on a row of the rules, and `second` only on a row of an outcome that states `from: "rule"`.
    const r = rec(row, p, ["of", "window", "use", ...more], ["without", ...(of === "rules" ? ["retains"] : []), ...(standing.where === "outcome" && row["from"] === "rule" ? ["second"] : [])]);
    if (!r) return;
    // Check 2: a whole number of seconds, at least 1, and one of the two words.
    int(r["window"], at(p, "window"), 1);
    if (r["use"] !== "once" && r["use"] !== "reuse") bad("shape", at(p, "use"), "is once or reuse");
    // Check 5: a row of an outcome or of a clause states `without`, and a row of an act does not.
    if (standing.where === "act" ? "without" in r : r["without"] !== "wait" && r["without"] !== "write") {
      bad("shape", at(p, "without"), standing.where === "act" ? "a row of an act states none: an act with no observation is answered authority-unavailable" : "is wait or write: a row of an outcome and of a clause states what follows when no observation can be had");
    }
    if ("second" in r && r["second"] !== true) bad("shape", at(p, "second"), "is true");
    let most = 1;
    let listed = 0;
    if (of === "holders") {
      str(r["action"], at(p, "action"));
      // Check 2: `most` is at most the bound on the elements of a list.
      const n = int(r["most"], at(p, "most"), 1);
      if (n !== null && n > bounds.listElements) bad("bound", at(p, "most"), `is ${n}; at most ${bounds.listElements}`);
      listed = n ?? 0;
    } else if (of === "member" || of === "key") {
      most = int(r["max"], at(p, "max"), 1) ?? 1;
      if (standing.where === "outcome") {
        // Check 4: in an outcome, a row with subjects states `from: "rule"`. An outcome binds no subject, so no operand names one.
        if (r["from"] !== "rule") bad("name", at(p, "from"), "a row of an outcome that has subjects states from: rule");
      } else source(d, r, p, standing);
    } else if ("retains" in r) retains(d, r["retains"], at(p, "retains"));
    subjects += most;
    bytes += most * observationBytes(of as Observe["of"], bounds, listed);
  });
  // Check 6: the sum of `max`, with 1 for each row that has one subject, is at most the ceiling on the observations of one entry,
  // which is the bound on the foreign entries of one entry (section 16.1, "Bytes, and capacity").
  if (subjects > bounds.usesPerEntry) bad("bound", path, `its rows could give ${subjects} subjects; one entry retains at most ${bounds.usesPerEntry} observations`);
  // Check 7: an outcome and a delivery of a result cannot be refused, so each row at its `max`, each observation at the largest size
  // of its kind, must fit the entry size. An act that would pass it is refused `entry-too-large`.
  // I3 merge: "with the rest of the entry" (section 6.1, "A declared maximum for everything that derives") is counted as the fixed
  // members of an entry only. No source counts the effects that a rule of an outcome derives in bytes: a mark states no `most` in
  // this data (I3 deltas, entries EJ6 and GA4), and that count is the capacity work's.
  if (standing.where !== "act" && bytes > bounds.entryBytes) bad("bound", path, `its entry could take ${bytes} bytes for its observations; at most ${bounds.entryBytes}`);
}

/** Checks 3 and 10: the source of a row of an act or of a clause. */
function source(d: Defining, r: Rec, p: string, standing: Extract<Standing, { ctx: Ctx }>): void {
  const { bad, rec, str } = d;
  const from = r["from"];
  const fp = at(p, "from");
  const { ctx, selected } = standing;
  // Check 3: `of: "key"` and `from: "rule"` are refused there: no row of an act gives a key, and no rule names a subject.
  if (r["of"] !== "member") { bad("name", at(p, "of"), "a row of an act or of a clause observes a member: no operand gives a key"); return; }
  if (from === "rule") { bad("name", fp, "a row of an act or of a clause states an operand: only the rule of an outcome names subjects"); return; }
  // Check 10: a source reads no `signer` and no `intent`: the list is derived before the grant is judged. It reads no slot and no
  // item of a subject whose name of `also` a mark binds: that rule is given the grant and `observed`.
  if (reads(from, "signer").length > 0 || reads(from, "intent").some((x) => x === true)) { bad("name", fp, "a source reads no signer and no intent: the subjects are derived before the grant is judged"); return; }
  const bound = alsoNames(from).find((name) => selected.has(name));
  if (bound !== undefined) { bad("name", fp, `a source reads no slot and no item of ${bound}, which a mark binds`); return; }
  const owner = () => ctx.on ?? bad("name", fp, "there is no primary item whose slot this could be");
  const member = (type: unknown): boolean => isObject(type) && type["type"] === "member";
  if (isObject(from) && "each" in from) {
    const e = rec(from, fp, ["each", "as", "value"]);
    const as = e && str(e["as"], at(fp, "as"));
    if (!e || as === null || as === undefined) return;
    if (as.includes(".")) { bad("shape", at(fp, "as"), "a dot names a member of a record element, so the name has none"); return; }
    // Check 10: an `element` is read only in the `value` of the row's own `each`, by its `as`.
    if (reads(e["each"], "element").length > 0 || reads(e["value"], "element").some((name) => typeof name !== "string" || (name !== as && !name.startsWith(`${as}.`)))) { bad("name", fp, "an element is read only in the value of the row's own each, by its as"); return; }
    const read = operand(d, e["each"], at(fp, "each"), ctx, owner);
    if (!read) return;
    if (read.type !== null && read.type.type !== "list") { bad("name", at(fp, "each"), "names no list"); return; }
    const value = operand(d, e["value"], at(fp, "value"), { ...ctx, elements: new Map([[as, read.type?.type === "list" ? read.type.of : null]]) }, owner);
    // Check 3: with `each`, the type of `value` is `member`.
    if (value && !member(value.type) && !(value.type === null && isObject(e["value"]) && "part" in e["value"])) bad("name", at(fp, "value"), "the value of each element is of the type member");
    return;
  }
  if (reads(from, "element").length > 0) { bad("name", fp, "an element is read only in the value of the row's own each, by its as"); return; }
  const read = operand(d, from, fp, { ...ctx, elements: new Map() }, owner);
  if (!read) return;
  // Check 3: the static type is `member`, or a list of `member`. A part of an entry states no type, and the commit reads the value.
  // A constant is a member reference.
  const typed = read.type === null ? (isObject(from) && ("part" in from || ("const" in from && isMemberRef(from["const"])))) : member(read.type) || (read.type.type === "list" && member(read.type.of));
  if (!typed) bad("name", fp, "the source gives a member, or a list of members");
}

/** Check 8: at most 8 records, no two of one domain, each `max` a whole number of bytes, at least 1 and at most the bound on one retained read. */
function retains(d: Defining, v: unknown, path: string): void {
  const { bad, rec, list, int, str } = d;
  const seen = new Set<string>();
  list(v, path, OBSERVES_ROWS).forEach((record, i) => {
    const p = at(path, i);
    const r = rec(record, p, ["domain", "max"]);
    if (!r) return;
    const domain = str(r["domain"], at(p, "domain"));
    const max = int(r["max"], at(p, "max"), 1);
    if (domain !== null && seen.has(domain)) bad("shape", at(p, "domain"), `another record of this row states the domain ${domain}`);
    if (domain !== null) seen.add(domain);
    if (max !== null && max > RETAINED_INPUT_BYTES) bad("bound", at(p, "max"), `is ${max} bytes; one retained read holds at most ${RETAINED_INPUT_BYTES}`);
  });
}

/**
 * The rows of a `create`, a `tell` or a `relate`, by clause (section 16.1,
 * check 1): a clause `applied`, `refused`, `superseded` or `conflict`. Rows
 * under `undelivered` are refused: its entry is a diagnosis, whose input
 * holds no observation. A clause reads what a clause reads (section 6.6),
 * so its subjects are those that the entry which made the send settled.
 */
export function clauseObserves(d: Defining, v: unknown, path: string, ctx: Ctx, conflict: boolean): void {
  const r = d.rec(v, path, [], ["applied", "refused", "superseded", ...(conflict ? ["conflict"] : [])]);
  const settled = new Map([...ctx.also].filter(([also]) => !ctx.unsettled?.has(also)));
  for (const [clause, rows] of Object.entries(r ?? {})) observes(d, rows, at(path, clause), { where: "clause", ctx: { ...ctx, also: settled, clause: true, signer: false }, selected: new Set() });
}
