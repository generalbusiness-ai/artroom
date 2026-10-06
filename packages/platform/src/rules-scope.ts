/**
 * `platform:rules@1`, as data, with its rules (authority note, revision 26,
 * sections 3.3, 3.11, 12.1.4 and 12.1.4a; its table of marks, section
 * 12.1.8, rows 1 and 27 to 29, and rows w, x and y of the further marks).
 * One rules scope for a repository. It holds the branch rules, with the
 * extents and the declaration of the single-controller exception, the
 * labels, the check configurations and the active definitions.
 *
 * Revision 26 is approved by its checker. The planner's adoption of it was
 * not recorded when the rows of revision 25 were built here (I3 deltas,
 * section 27).
 *
 * This file is named `rules-scope.ts` because `rules.ts` is the package's
 * table of rules.
 *
 * One member of the data is one row of the note's tables. A cell of the
 * note that begins "Code" is a mark in this data, at the place where its
 * rule is run (the scope contract, section 6.1), and the rule is in
 * `rulesScopeRules`, below. The table of marks gives the rules scope six
 * rules.
 *
 * | Rule | Row of the table | Place | At | Its mark's `row` |
 * |---|---|---|---|---|
 * | `checkers` | 27 | 4, a guard | `publish` | P19 |
 * | `configuration-bytes` | 28 | 4, a guard | `keep-configuration` | P18. The cell names P18 and P21, and a mark states one key. |
 * | `definition-bytes` | 29 | 4, a guard | `activate` | P21 |
 * | `extent-list` | w | 3, a type | The field `extents` of `publish`, and the slot `rules.extents` | P28 |
 * | `extents-hold` | x | 4, a guard | `publish`, after the two older guards | P28 |
 * | `rules-update` | y | 6, a send | `rules-wanted` | P28 |
 *
 * Row 1 has no mark: the membership reference of a scope that is created
 * beside membership derives nothing of an entry (`membershipId`, below).
 *
 * The data holds no mark that the table does not list, so the six rules
 * are the whole version: a runtime with this package can run
 * `platform:rules@1`.
 *
 * The extents themselves, their bounds and what a change to one must meet
 * are in `extents.ts`. Before a first `publish` a repository has the three
 * extents of the first definition (`extentsOf`, below).
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them. What the rows leave
 * unsaid, and what this file holds meanwhile, is in the I3 deltas note,
 * entries EQ1 to EQ11 and FB1 to FB5.
 */

import type { DeclaredDefinition, Digest, MemberObservation, PlatformData, PlatformDefinition, ScopeId } from "@generalbusiness/artroom-contract";
import { isDigest, isMemberRef } from "@generalbusiness/artroom-bytes";
import { byteOrder, validateDefinition } from "@generalbusiness/artroom-derive";
import type { Item, RecordedRef, Rules, StateView } from "@generalbusiness/artroom-derive";
import { firstExtents, holdsRulesExtent, isExtents } from "./extents.ts";
import type { Extent } from "./extents.ts";

/** The name and version that this data and these rules are. */
export const RULES_SCOPE = "platform:rules@1" satisfies PlatformDefinition;

/**
 * The byte domain of a check's configuration (section 3.11). This
 * definition declares it, as the contract lets the owner of a retained
 * value do (the contract's sections 2.1 and 6.2; section 12.1.4, "Byte
 * domain").
 */
export const CONFIGURATION_DOMAIN = "artroom-check-configuration-1";
/** The byte domain of a declared definition, which the contract names (its section 2.1). */
export const DEFINITION_DOMAIN = "artroom-definition-1";
/**
 * The most canonical bytes of one check configuration. The owner of a
 * domain states the bound on one value (the contract's section 6.2), and no
 * adopted text gives this one a number: it is the proof plan's. 32 KiB is
 * the made-up figure of the contract's witness 18.35, held here as a
 * temporary value (I3 deltas, entry EQ2).
 */
export const CONFIGURATION_BYTES = 32 * 1024;

const DIGEST = { type: "digest" } as const;
const LABELS = { type: "list", of: { type: "text", max: 64 }, max: 32 } as const;
/** One check of the rules (section 3.11): its name, its configuration's digest, whether it is required, and its checker. */
const CHECKS = {
  type: "list", max: 32,
  of: {
    type: "record",
    of: {
      name: { type: "text", max: 128, required: true },
      configuration: { type: "digest", required: true },
      required: { type: "bool", required: true },
      checker: { type: "member", required: true },
    },
  },
} as const;
const APPROVALS = { type: "int", min: 0, max: 64 } as const;
/**
 * The type of a list of extents: a mark at place 3 (section 12.1.4, "The
 * rows of the rules scope, changed in revision 25"; row w of the table of
 * further marks, P28). An extent is a record that holds two lists, and its
 * name has a stated set of characters. No written type says either.
 */
const EXTENT_LIST = { code: "extent-list", row: "P28", type: "code" } as const;
const RULES = { rules: { item: "rules", one: true } } as const;

export const rulesScope: PlatformData = {
  format: "artroom-definition-1",
  name: "platform:rules",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    // Section 12.1.4, the first row of the item table. `membership` is the membership scope's ID, and no reference: the directory
    // creates the two scopes in one genesis and knows no incarnation of membership then (section 12.1, "The membership reference").
    rules: {
      many: false, max: 1, initial: "current",
      states: { current: { final: false } },
      parties: {},
      refs: { directory: { fixed: true, required: true, to: { type: "scope", kind: "directory" } } },
      values: {
        branch: { fixed: true, required: true, of: { type: "text", max: 256 } },
        membership: { fixed: true, required: true, of: { type: "text", max: 64 } },
        approvals: { fixed: false, required: true, of: APPROVALS, default: 1 },
        ownerMayReview: { fixed: false, required: true, of: { type: "bool" }, default: false },
        checks: { fixed: false, required: false, of: CHECKS },
        labels: { fixed: false, required: false, of: LABELS },
        // From revision 25: the extents that the last `publish` stated, whole. Unset until the first `publish`, and a slot whose
        // type is a mark takes no default: `extentsOf`, below, gives the first definition meanwhile.
        extents: { fixed: false, required: false, of: EXTENT_LIST },
        // From revision 25: the declaration of the single-controller exception (section 12.1.4a). False from the genesis.
        singleControllerException: { fixed: false, required: true, of: { type: "bool" }, default: false },
      },
    },
    // The second row. A lane is created only under a digest that an item of this type holds as `active` (section 12.1.2).
    definition: {
      many: true, max: 16, initial: "active",
      states: { active: { final: false }, retired: { final: true } },
      parties: { activator: { fixed: true, required: true, list: false, author: false } },
      refs: {},
      values: {
        digest: { fixed: true, required: true, of: DIGEST },
        name: { fixed: true, required: true, of: { type: "text", max: 64 } },
      },
    },
    // The third row. A configuration is never edited: a change is new bytes, a new digest and a new item (section 3.11).
    configuration: {
      many: true, max: 1000, initial: "kept",
      states: { kept: { final: false } },
      parties: { keeper: { fixed: true, required: true, list: false, author: false } },
      refs: {},
      values: {
        digest: { fixed: true, required: true, of: DIGEST },
        name: { fixed: true, required: true, of: { type: "text", max: 128 } },
      },
    },
  },
  acts: {
    // `establish`: genesis, by the directory's `create` (fields `branch`, `directory` and `membership`, section 12.1). It opens
    // `rules`, with the branch, the directory and membership's scope ID. The other values take their defaults. The note states no
    // grant for it: a genesis is judged by no signer, so nothing reads this one.
    establish: {
      step: "open", on: "rules", grant: "rules.establish",
      also: {},
      fields: {
        branch: { type: "text", max: 256, required: true },
        directory: { type: "scope", kind: "directory", required: true },
        membership: { type: "text", max: 64, required: true },
      },
      guards: [],
      effects: [
        { value: { slot: "branch", from: { field: "branch" } } },
        { ref: { slot: "directory", from: { field: "directory" } } },
        { value: { slot: "membership", from: { field: "membership" } } },
      ],
      sends: [],
      attention: [],
    },
    // `publish`: an act. Grant `rules.publish`. It sets the rule values from the fields, each of which but the declaration is
    // required: every `publish` states the rules whole. The revision of the rules is this entry's position. No update is sent to
    // any lane (G11): a lane asks, by `rules-wanted`.
    publish: {
      step: "transition", on: "rules", grant: "rules.publish",
      also: {},
      fields: {
        approvals: { ...APPROVALS, required: true },
        ownerMayReview: { type: "bool", required: true },
        checks: { ...CHECKS, required: true },
        labels: { ...LABELS, required: true },
        extents: { ...EXTENT_LIST, required: true },
        // Optional, with the default false: a `publish` that does not state the declaration withdraws it. That fails closed.
        singleControllerException: { type: "bool", required: false, default: false },
      },
      guards: [
        // Each check's `configuration` is kept.
        {
          each: { list: { field: "checks" }, as: "k", guards: [{ some: { type: "configuration", states: ["kept"], where: [{ equals: { a: { slot: "digest" }, b: { element: "k.configuration" } } }] } }] },
          reason: "configuration-unknown",
        },
        // Each check's `checker` is a member with the role `checker`, by an observation of membership that the entry retains (Code P19).
        { code: "checkers", row: "P19" },
        // From revision 25: the fixed minimum of the `rules` extent, the one extent with no pattern, and the checks that an extent
        // names (row x of the further marks, P28). After the two older guards.
        { code: "extents-hold", row: "P28" },
      ],
      effects: [
        { value: { slot: "approvals", from: { field: "approvals" } } },
        { value: { slot: "ownerMayReview", from: { field: "ownerMayReview" } } },
        { value: { slot: "checks", from: { field: "checks" } } },
        { value: { slot: "labels", from: { field: "labels" } } },
        // A written effect: a value of a marked type is assignable to a slot of the same mark (the contract's section 6.1).
        { value: { slot: "extents", from: { field: "extents" } } },
        { value: { slot: "singleControllerException", from: { field: "singleControllerException" } } },
      ],
      sends: [],
      attention: [],
    },
    // `keep-configuration`: an act. Grant `rules.publish`. It opens `configuration`. The bytes come beside the intent, and the
    // scope retains them under the digest, in the byte domain `artroom-check-configuration-1` (Code P18 and P21).
    "keep-configuration": {
      step: "open", on: "configuration", grant: "rules.publish",
      also: {},
      fields: { digest: { ...DIGEST, required: true }, name: { type: "text", max: 128, required: true } },
      guards: [{ code: "configuration-bytes", row: "P18" }],
      effects: [
        { value: { slot: "digest", from: { field: "digest" } } },
        { value: { slot: "name", from: { field: "name" } } },
        // The note's table gives the item a required party and states no effect for it. It is the signer (I3 deltas, entry EQ5).
        { party: { slot: "keeper", from: { signer: true } } },
      ],
      sends: [],
      attention: [],
    },
    // `activate`: an act. Grant `rules.activate`. It opens `definition`, `active`. The definition's bytes and their named closure
    // come beside the intent, and the scope retains each under its digest (Code P21).
    activate: {
      step: "open", on: "definition", grant: "rules.activate",
      also: {},
      fields: { digest: { ...DIGEST, required: true }, name: { type: "text", max: 64, required: true } },
      guards: [
        { code: "definition-bytes", row: "P21" },
        { none: { type: "definition", states: ["active"], where: [{ equals: { a: { slot: "digest" }, b: { field: "digest" } } }] } },
      ],
      effects: [
        { value: { slot: "digest", from: { field: "digest" } } },
        { value: { slot: "name", from: { field: "name" } } },
        // As for `keeper`: the signer (entry EQ5).
        { party: { slot: "activator", from: { signer: true } } },
      ],
      sends: [],
      attention: [],
    },
    // `retire-definition`: an act. Grant `rules.activate`.
    "retire-definition": {
      step: "transition", on: "definition", grant: "rules.activate",
      also: {},
      fields: {},
      // The note's row states no guard. A `state` effect to a final state needs one that lists no final state, and the item has one
      // such state (I3 deltas, entry EQ6, as entry EM15 for membership).
      guards: [{ state: ["active"] }],
      effects: [{ state: "retired" }],
      sends: [],
      attention: [],
    },
  },
  receives: {
    // `rules-wanted`: a delivery of a `tell`, from a lane. It changes nothing, and sends the lane one `rules` update. A lane of
    // another repository is answered too (the limit of G7): the values carry no private text.
    // From revision 25 the one send is the mark `rules-update`, with empty clauses, in place of the written `relate` of the row
    // (row y of the further marks, P28): the update carries a projection of the extents, which no operand makes, and a value of
    // a marked type is assignable to no written type. Its rule gives one request in every entry of the row, so the mark states
    // `always` (I3 deltas, entry FB5).
    "rules-wanted": {
      message: "rules-wanted", class: "tell", from: { kind: "lane" }, opens: null,
      also: RULES,
      fields: {},
      guards: [],
      effects: [],
      sends: [{ code: "rules-update", row: "P28", result: {}, always: true }],
      attention: [],
    },
  },
  // No timed rule exists. No entry starts a duty beyond its own request and result.
  timed: {},
  rules: {},
  // The rules scope opens no operation.
  outcomes: {},
};

// ---------------------------------------------------------------- reading the rules scope's state

const rulesOf = (state: Pick<StateView, "page">): Item | null => state.page("rules", ["current"], null, 1).items[0] ?? null;

/**
 * Where a rules scope records its membership reference (section 3.3, "Where
 * it records its membership reference"; section 12.1, "The membership
 * reference"; row 1 of the table of marks, which has no mark): the
 * membership scope's ID, in the value `membership` of its item `rules`,
 * which the genesis sets from the creation's fields and no entry changes.
 * Null: the state holds no such item.
 *
 * The incarnation is not here. The first entry that retains an observation
 * fixes it, and every later observation must name the same one. That is
 * guard 1 of an observation, which the scope makes before a rule is run.
 * `rulesMembership`, below, reads the ID with that incarnation from the
 * folded state.
 */
export const membershipId = (state: Pick<StateView, "page">): ScopeId | null => {
  const id = rulesOf(state)?.values["membership"];
  return typeof id === "string" ? (id as ScopeId) : null;
};

/**
 * A reference that a scope holds as a scope ID alone, with the incarnation
 * that its entries have fixed (section 12.1, "Where the rules scope and the
 * destination record their membership reference", decided in revision 25).
 * The incarnation is no slot: it is the incarnation in `of` of the
 * observations of that scope ID that the scope's entries retain, which the
 * folded state holds. Before any entry retains one, the scope records the
 * ID and no incarnation. Null: it holds no ID. Guard 1 lets an entry
 * retain an observation of one incarnation only, so the state holds at most
 * one. With more than one the history is not a valid one, and no reference
 * is read from it: null.
 */
export function referenceOf(state: Pick<StateView, "incarnations">, id: ScopeId | null, kind: "membership" | "rules"): RecordedRef | null {
  const fixed = id === null ? [] : state.incarnations(id);
  return id === null || fixed.length > 1 ? null : { scope: id, kind, inc: fixed[0] ?? null };
}

/**
 * Where a scope under `platform:rules@1` records its membership reference:
 * code of the version, beside its rules, as the production authority and a
 * replay read it (I3 deltas, entries EM21, EQ7 and EU6).
 */
export const rulesMembership = (state: Pick<StateView, "page" | "incarnations">): RecordedRef | null => referenceOf(state, membershipId(state), "membership");

/**
 * The extents of a repository, from its rules scope's folded state (section
 * 12.1.4, "Before the first `publish`: the first definition is the
 * default"). The slot `extents` holds what the last `publish` stated,
 * whole. Until a `publish` sets it, a repository has the three extents of
 * the first definition all the same, computed from the values `approvals`
 * and `checks` as they then are (`firstExtents`). So no repository is
 * judged by one bar, and the `rules` extent holds from the first entry on.
 * Null: the state holds no item `rules`.
 *
 * The `rules` update reads it, below. An observation of the rules will,
 * when it carries extents: no rules scope answers an observation yet (I3
 * deltas, entry EQ8), and the contract's `RulesContent` has no member
 * `extents` (entry FB2).
 */
export function extentsOf(state: Pick<StateView, "page">): readonly Extent[] | null {
  const rules = rulesOf(state);
  if (!rules) return null;
  const held = rules.values["extents"] ?? null;
  if (held !== null) {
    // The type of the slot is the rule `extent-list`, so the scope set no other value.
    if (!isExtents(held)) throw new Error("the slot `extents` holds a value that is no list of extents");
    return held;
  }
  const { approvals, checks } = rules.values;
  if (typeof approvals !== "number") throw new Error("the item `rules` has its approvals from the genesis");
  return firstExtents({ approvals, checks: Array.isArray(checks) ? (checks as unknown as { name: string; required: boolean }[]) : [] });
}

// ---------------------------------------------------------------- the rules

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The digests that a declaration names in its `create` sends, once each, in byte order: the first step of its named closure (the contract's section 7.2). */
const creates = (declared: DeclaredDefinition): Digest[] => {
  const named = new Set<Digest>();
  for (const from of [...Object.values(declared.acts), ...Object.values(declared.receives)]) {
    for (const send of from.sends) if ("create" in send && isDigest(send.create.definition)) named.add(send.create.definition);
  }
  return [...named].sort(byteOrder);
};

/**
 * The rules of `platform:rules@1`, by the name that a mark states (section
 * 12.1.8, the table of marks, rows 27 to 29). Each is a pure function of
 * what a rule is given, at place 4: a guard, at its position in the written
 * list. None reads the clock.
 */
export const rulesScopeRules: Rules = {
  /**
   * Row y, the one send of `rules-wanted` (P28): the `rules` update of
   * section 12.1.4. Exactly one request, in every entry of the row: one
   * `relate` to the sender, named `rules`, of the item `rules`, in the
   * state `current`. Its `detail` has at most six members.
   *
   * | Member | From |
   * |---|---|
   * | `approvals`, `ownerMayReview`, `singleControllerException` | The slots of those names |
   * | `labels`, `checks` | The slot, when it is set. Before the first `publish` neither is, and the member is left out, as an absent value is left out of every message |
   * | `extents` | For each extent of the rules, in their order: `name`, `approvals`, `approver`, `checks` and `class`. The patterns are left out: a lane reads no path. Before the first `publish`: the extents of the first definition (`extentsOf`) |
   *
   * It reads the item `rules` and the delivery's `from`. It never refuses.
   */
  "rules-update": {
    place: "send",
    run: (given) => {
      const [rules, extents] = [rulesOf(given.state), extentsOf(given.state)];
      if (given.input.type !== "delivery" || !rules || !extents) throw new Error("rules-update stands in the handler `rules-wanted`, in a scope that has its rules");
      const { approvals, ownerMayReview, labels, checks, singleControllerException } = rules.values;
      const detail = {
        approvals, ownerMayReview, labels, checks, singleControllerException,
        extents: extents.map(({ name, approvals, approver, checks, class: of }) => ({ name, approvals, approver, checks, class: of })),
      };
      // An absent value is left out of a message, as an absent field is left out of an intent.
      const carried = Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== undefined && value !== null));
      return { to: given.input.from.at, message: { class: "request", type: "relate", body: { name: "rules", item: { at: given.resolved.at, seq: rules.id, hash: rules.opened }, state: "current", detail: carried } } };
    },
  },
  /**
   * Row w, the type of the field `extents` of `publish` and of the slot
   * `rules.extents` (P28). The value is of the type when it is a list of 1
   * to 8 extents, each inside its bounds (`isExtents`). Otherwise the act
   * is `bad-field` (case i of section 12.1.4). It reads the value alone.
   */
  "extent-list": { place: "type", run: (_given, value) => isExtents(value) },
  /**
   * Row x, the third guard of `publish` (P28): the three checks of section
   * 12.1.4, in this order. The first that fails gives its name, under
   * `guard-failed`.
   *
   * 1. `rules-extent-required` (case f). The fixed minimum of the `rules`
   *    extent: `extents` holds an extent named `rules` with the four
   *    patterns of the first definition, at least 1 approval, the approver
   *    `rules.publish` and the class `authority` (`holdsRulesExtent`).
   * 2. `catch-all-required` (case g). Exactly one extent has no pattern:
   *    the one that holds every path that no pattern matches. So no path
   *    is unclassified.
   * 3. `extent-check-unknown` (case h). Each name in an extent's `checks`
   *    is the `name` of a check in the field `checks` of the same act.
   *
   * It reads the fields `extents` and `checks`, as read, and nothing else:
   * no state, no observation and no value. So it is always completed.
   */
  "extents-hold": {
    place: "guard", refusals: ["rules-extent-required", "catch-all-required", "extent-check-unknown"],
    run: (given) => {
      const { extents, checks } = given.resolved.fields;
      if (!isExtents(extents) || !Array.isArray(checks)) throw new Error("this rule stands in `publish`, whose field `extents` is of the type `extent-list` and which names its checks");
      if (!holdsRulesExtent(extents)) return { holds: false, name: "rules-extent-required" };
      if (extents.filter((extent) => extent.patterns.length === 0).length !== 1) return { holds: false, name: "catch-all-required" };
      const named = new Set(checks.map((check) => (isRecord(check) ? check["name"] : null)));
      return extents.every((extent) => extent.checks.every((check) => named.has(check))) ? { holds: true } : { holds: false, name: "extent-check-unknown" };
    },
  },
  /**
   * Row 27, among the guards of `publish` (P19). It reads `observed`: one
   * `MemberObservation` for each check's `checker`, of the membership scope
   * whose ID the scope records. It holds when each is an active member with
   * the role `checker`. Otherwise `not-a-checker` (case a of section
   * 12.1.4). It is not completed when an observation is missing.
   *
   * The checks are read in the order of the list, and the first that does
   * not pass decides. A checker that the field names in another membership
   * scope, or in another incarnation than the one observed, is no checker
   * here. An observation of another scope than the recorded one is no
   * observation of the checker: it is missing (I3 deltas, entry EQ7). The
   * entry retains each observation that was read, which is at most one for
   * each of the 32 checks (section 3.3, the table of entries).
   */
  checkers: {
    place: "guard", refusals: ["not-a-checker"],
    run: (given) => {
      const recorded = membershipId(given.state);
      const checks = given.resolved.fields["checks"];
      if (recorded === null || !Array.isArray(checks)) throw new Error("this rule stands in `publish`, which names its checks, in a scope that has its rules");
      for (const check of checks) {
        const checker = isRecord(check) ? check["checker"] : null;
        if (!isMemberRef(checker)) throw new Error("a check names its checker as a member");
        if (checker.membership.kind !== "membership" || checker.membership.scope !== recorded) return { holds: false, name: "not-a-checker" };
        const observation = given.observed({ member: checker.member })?.observation as MemberObservation | undefined;
        if (!observation || observation.of.kind !== "membership" || observation.of.scope !== recorded) return { holds: null, reason: "dependency-unavailable" };
        if (observation.of.inc !== checker.membership.inc || observation.memberState !== "active" || observation.role !== "checker") return { holds: false, name: "not-a-checker" };
      }
      return { holds: true };
    },
  },
  /**
   * Row 28, among the guards of `keep-configuration` (P18, P21). It reads
   * the value beside the intent whose digest, in the domain
   * `artroom-check-configuration-1`, is the field `digest`. It holds when
   * such a value is at hand and its `image` is a content digest (section
   * 3.11). Otherwise `configuration-mismatch`.
   *
   * With no such value at hand the code is `bad-field`, as the contract's
   * section 6.2 states for a place that requires a value and has none: no
   * value came under the digest, the bytes are not canonical, or the value
   * is longer than the bound of its domain. With an `image` that is no
   * digest the code is `guard-failed` (I3 deltas, entries EQ1 and EQ4).
   */
  "configuration-bytes": {
    place: "guard", refusals: ["configuration-mismatch"],
    run: (given) => {
      const digest = given.resolved.fields["digest"];
      if (!isDigest(digest)) throw new Error("this rule stands in `keep-configuration`, which names a digest");
      const value = given.value(CONFIGURATION_DOMAIN, digest, CONFIGURATION_BYTES);
      if (value === undefined) return { holds: false, name: "configuration-mismatch", code: "bad-field" };
      return isRecord(value) && isDigest(value["image"]) ? { holds: true } : { holds: false, name: "configuration-mismatch" };
    },
  },
  /**
   * Row 29, among the guards of `activate` (P21). It reads the values
   * beside the intent: the definition's bytes, by the field `digest` in the
   * domain `artroom-definition-1`, and the bytes of each definition of its
   * named closure, by the digest that a `create` send names (the contract's
   * section 7.2). It reads the judge's bounds: the bytes of one definition,
   * and the definitions of one closure. It holds when the bytes hash to the
   * digest, validate as a declared definition, without the platform option,
   * and state the `name` given, and each definition of the closure is
   * supplied and validates.
   *
   * - Not completed, `dependency-unavailable`: the definition, or one of
   *   its closure, is not supplied. Bytes that do not hash to a digest are
   *   bytes of no definition that is named, so they are not supplied.
   * - Refused `unsupported-definition` (case c of section 12.1.4): the
   *   bytes of the definition, or of one of its closure, do not validate;
   *   the closure names more definitions than the bound; or the definition
   *   states another name than the field `name`. The row states that one
   *   refusal, and no other name is used (I3 deltas, entry EQ3).
   *
   * The closure is walked in byte order of the digests, breadth first, so a
   * runtime and a verifier read the same values in the same order.
   */
  "definition-bytes": {
    place: "guard", refusals: ["unsupported-definition"],
    run: (given) => {
      const { digest, name } = given.resolved.fields;
      const { bounds } = given.resolved;
      if (!isDigest(digest) || typeof name !== "string") throw new Error("this rule stands in `activate`, which names a digest and a name");
      const unsupported = { holds: false, name: "unsupported-definition", code: "unsupported-definition" } as const;
      const seen = new Set<Digest>();
      const queue: Digest[] = [digest];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        if (seen.has(next)) continue;
        // The definition itself is not counted among those that it names, as for the closure that a scope retains at its genesis.
        if (seen.size > bounds.namedDefinitions) return unsupported;
        seen.add(next);
        const value = given.value(DEFINITION_DOMAIN, next, bounds.definitionBytes);
        if (value === undefined) return { holds: null, reason: "dependency-unavailable" };
        const checked = validateDefinition(value, bounds);
        if (!checked.ok || checked.definition.digest !== next) return unsupported;
        if (next === digest && checked.definition.declared.name !== name) return unsupported;
        queue.push(...creates(checked.definition.declared));
      }
      return { holds: true };
    },
  },
};
