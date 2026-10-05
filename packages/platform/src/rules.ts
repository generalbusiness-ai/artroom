/**
 * The table of platform rules, as a type (I3 plan, sections 3.1 and 4.2). A
 * rule is what an entry of a platform definition does that no form of the
 * contract says: a cell of the authority note's section 12.1 that begins
 * "Code", with its row P1 to P25 of section 12.1.8.
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
 * The validator does not read this table. A test lists it, so that a rule
 * cannot be added without its row. The table is empty: no rule is written
 * yet, and `inbox` needs none.
 */

import type { Effect, FactUse, Input, Reason, Send, Timestamp } from "@generalbusiness/artroom-contract";
import type { StateView } from "@generalbusiness/artroom-derive";

/** The platform definitions that this package holds, by name without the version (section 12.1). `platform:task` is not here: it is IA's. */
export type PlatformName = "platform:register" | "platform:directory" | "platform:membership" | "platform:rules" | "platform:destination" | "platform:inbox";

/**
 * The rows of section 12.1.8 that the plan's section 4 marks "platform code", whole or in the part that it names: P13 to P18, P22, P24
 * and P25 whole; and the platform-code part of P19 (an outcome entry), P20 (the rules scope and the destination) and P21 (a `create`
 * under a named digest).
 */
export type PlatformRow = "P13" | "P14" | "P15" | "P16" | "P17" | "P18" | "P19" | "P20" | "P21" | "P22" | "P24" | "P25";

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

/** The rules of one entry of one definition, by the row that each answers. */
export type EntryRules = { readonly [row in PlatformRow]?: PlatformRule };

/** Every rule: by definition, then by the entry's act kind or message name, then by row. */
export type RuleTable = { readonly [name in PlatformName]?: { readonly [entry: string]: EntryRules } };

/** No rule is written yet. */
export const RULES: RuleTable = {};
