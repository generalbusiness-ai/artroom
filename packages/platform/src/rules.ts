/**
 * The table of platform rules, as a type (I3 plan, sections 3.1 and 4.2). A
 * rule is what an entry of a platform definition does that no form of the
 * contract says: a cell of the authority note's section 12.1 that begins
 * "Code", with its row P1 to P25 of section 12.1.8.
 *
 * The data of a definition says where each rule stands: it holds a mark,
 * `{ code, row }`, at that place, and `code` names the rule (the contract's
 * revision 15, section 6.1). No table beside the data says which entries
 * are code. The validator lists the marks of the data, and a runtime or a
 * verifier runs a definition only with a rule for every mark of that list.
 * Without one it answers `unsupported-definition` for the whole scope:
 * nothing is founded under the definition, and a scope that exists under it
 * admits nothing (I3 deltas, entry EC4).
 *
 * What a rule may do, which the types below hold:
 *
 * - It is a pure function of the folded state, the one input and the
 *   entry's retained inputs. It reads no clock but the commit's reading, no
 *   storage and no network.
 * - It may refuse. It may add effects and sends. Each effect is a member of
 *   the contract's `Effect`, and each send a member of `Send`. It adds no
 *   member to an entry, an input, a message or an envelope.
 * - An entry that it writes is checked by the same checks as any other.
 *
 * The validator does not read this table. The table is empty: no rule is
 * written yet. The inbox marks one, `notice-source`, so no scope is founded
 * under it yet.
 */

import type { Effect, FactUse, Input, Reason, Send, Timestamp } from "@generalbusiness/artroom-contract";
import type { StateView } from "@generalbusiness/artroom-derive";

/** The platform definitions that this package holds, by name without the version (section 12.1). `platform:task` is not here: it is IA's. */
export type PlatformName = "platform:register" | "platform:directory" | "platform:membership" | "platform:rules" | "platform:destination" | "platform:inbox";

/** What a rule is given. Nothing else reaches it. */
export interface RuleGiven {
  readonly state: StateView;                  // the folded state, before the entry
  readonly input: Input;                      // the one input of the entry
  readonly time: Timestamp;                   // the commit's clock reading
  readonly uses: readonly FactUse[];          // the foreign entries retained for the judgment
}

/** What a rule answers: a refusal, or what it adds to the entry. */
export type RuleResult =
  | { result: "refused"; reason: Reason }
  | { result: "applied"; effects: readonly Effect[]; sends: readonly Send[] };

export type PlatformRule = (given: RuleGiven) => RuleResult;

/** The rules of one definition, by the name that a mark of its data states in `code`. */
export type Rules = Readonly<Record<string, PlatformRule>>;

/** Every rule: by definition, then by the rule's name. */
export type RuleTable = { readonly [name in PlatformName]?: Rules };

/** No rule is written yet. */
export const RULES: RuleTable = {};
