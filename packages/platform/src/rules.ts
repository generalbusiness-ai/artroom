/**
 * The table of platform rules (I3 plan, sections 3.1 and 4.2). A rule is
 * what an entry of a platform definition does that no form of the contract
 * says: a cell of the authority note's section 12.1 that begins "Code",
 * with its row P1 to P25 of section 12.1.8.
 *
 * The data of a definition says where each rule stands: it holds a mark,
 * `{ code, row }`, at that place, and `code` names the rule (the contract's
 * revision 15, section 6.1). So the table is keyed by definition and then
 * by the rule's name, and a rule has the kind of the place of its mark. No
 * table beside the data says which entries are code. The validator lists
 * the marks of the data, and a runtime or a verifier runs a definition only
 * with a rule of the right kind for every mark of that list. Without one it
 * answers `unsupported-definition` for the whole scope: nothing is founded
 * under the definition, and a scope that exists under it admits nothing (I3
 * deltas, entry EC4).
 *
 * The kinds of rule, what a rule is given and what it returns are derive's
 * types (`marks.ts`), because the judges run the rules:
 *
 * - A rule is a pure function of six things: the folded state before the
 *   entry, the entry's input, the entry's time, the entry's retained
 *   inputs, the scope's own earlier entries, and what the judge resolved
 *   before the rule's place. It is given no storage, no network and no
 *   clock but the entry's time.
 * - What it returns is in the contract's forms. It adds no member to an
 *   entry, an input, a message or an envelope.
 * - An entry that it joins is checked by the same checks as any other.
 *
 * The validator does not read this table. Each definition's rules are
 * written beside its data, in the definition's own file.
 */

import type { Rules } from "@generalbusiness/artroom-derive";
import { destinationRules } from "./destination.ts";
import { inboxRules } from "./inbox.ts";
import { membershipRules } from "./membership.ts";
import { registerRules } from "./register.ts";
import { directoryRules } from "./directory.ts";
import { rulesScopeRules } from "./rules-scope.ts";

/** The platform definitions that this package holds, by name without the version (section 12.1). `platform:task` is not here: it is IA's. */
export type PlatformName = "platform:register" | "platform:directory" | "platform:membership" | "platform:rules" | "platform:destination" | "platform:inbox";

/** Every rule: by definition, then by the name that a mark of its data states. */
export type RuleTable = { readonly [name in PlatformName]?: Rules };

/**
 * The rules that are written: those of the inbox, and the ten of membership
 * that the authority note's table of marks names (revision 24). They are
 * the whole of membership's version, so `platform:membership@1` is
 * runnable (`membership.ts`). The three rules of the rules scope are the
 * whole of its version (`rules-scope.ts`).
 */
export const RULES: RuleTable = {
  "platform:inbox": inboxRules, "platform:membership": membershipRules,
  // The register lacks the rule of one mark, `create-repository`, and the directory's data holds three marks that the note's table
  // does not list (`register.ts`, `directory.ts`). So this table makes neither runnable.
  "platform:register": registerRules, "platform:directory": directoryRules,
  // The three rules of the rules scope are the whole of its version, so `platform:rules@1` is runnable (`rules-scope.ts`).
  "platform:rules": rulesScopeRules,
  // The destination's data holds ten marks with no rule: `abort-if-behind`, `resend-due` and the eight rules of its `outcomes`
  // (`destination.ts`). So this table does not make `platform:destination@1` runnable.
  "platform:destination": destinationRules,
};
