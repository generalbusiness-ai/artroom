/**
 * `platform:register@1`, as data, with its rules (authority note, revision
 * 24, sections 3.8 and 12.1.1; its table of marks, section 12.1.8, rows 2 to
 * 6, c and r). One register for a deployment. It holds founding claims, and it
 * owns one kind of outside effect: creating the repository at the Git host.
 * It is the one scope with no creator (the scope contract, section 7.1).
 *
 * One member of the data is one row of the note's tables. A cell of the
 * note that begins "Code" is a mark in this data, at the place where its
 * rule is run (the scope contract, section 6.1), and the rule is in
 * `registerRules`, below. The table of marks gives the register these:
 *
 * | Rule | Place | Row of the table | At |
 * |---|---|---|---|
 * | `install` | 1, `grant` | 2 | `install`, the genesis |
 * | `founding-policy` | 1, `grant` | 3 | `found` |
 * | `founder-key` | 5, effect | 4 | `found` |
 * | `claim-seed` | 5, effect | 5 | `found` |
 * | `open-create-repository` | 5, effect | 6 | `found` |
 * | `handle-form` | 4, guard | r (P27) | `found`, on the field `founderHandle` |
 * | `create-repository` | 7, outcome | c | The outcomes of that kind of operation |
 * | `revoke-credential` | 7, outcome | c | The same |
 * | `delete-repository` | 7, outcome | c | The same |
 *
 * **One rule is not written: `create-repository`.** Its selecting outcome
 * sends the `create` of the directory, and the result of that `create`
 * runs clauses (section 12.1.1, the last row of the table of entries). The
 * adopted texts give an outcome's mark no clauses, and the judge of an
 * outcome lets its rule send no creation (I3 deltas, entry EJ1). The mark
 * stands in `outcomes`, and `registerRules` has no rule of that name: none
 * is invented. So the version lacks one rule, and by the whole-scope rule
 * (the contract's section 6.1) no register is founded under
 * `platform:register@1`. The clauses of that `create` are data all the
 * same, and they are kept here as `DIRECTORY_CLAUSES`, for the rule that
 * will send it.
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them.
 */

import type { PlatformData, PlatformDefinition, PlatformEffect, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest, seedDigest } from "@generalbusiness/artroom-bytes";
import type { RuleGiven, Rules, StateView } from "@generalbusiness/artroom-derive";
import { handleForm } from "./membership.ts";

/** The name and version that this data and these rules are. The `operation` effects of its rules state it as their owner. */
export const REGISTER = "platform:register@1" satisfies PlatformDefinition;
/** The definition under which the register's `create` makes a directory (section 12.1, "Names, creation and activation"). */
export const DIRECTORY = "platform:directory@1" satisfies PlatformDefinition;

/** The bound on the creation attempts of one founding claim, and on the attempts of each cleanup (section 3.8; U9). */
export const CREATION_ATTEMPTS = 3;

const KEY = { type: "text", max: 64 } as const;
const NAME = { type: "text", max: 256 } as const;
const POLICY = { type: "enum", of: ["keys", "open"] } as const;
const FOUNDERS = { type: "list", of: KEY, max: 32 } as const;

/** The record of a repository at the Git host: its host, namespace, name and ID (section 12.1.1, the slot `claim.repository`). The directory and the destination hold the same record. */
export const REPOSITORY = {
  type: "record",
  of: { host: { ...NAME, required: true }, namespace: { ...NAME, required: true }, name: { ...NAME, required: true }, id: { ...NAME, required: true } },
} as const;

/**
 * The clauses of the `create` of a directory (section 12.1.1, the row "The
 * result of the `create`"). `applied`: the claim is `active`, with the
 * directory's reference and its genesis. `conflict` and `refused`: no
 * effect. The incident that the row states for `refused` is no effect of
 * an entry. No row of this data holds them yet: the request is sent by the
 * rule of `create-repository`, which is not written (entry EJ1).
 */
export const DIRECTORY_CLAUSES: { readonly [clause in "applied" | "refused" | "conflict"]: readonly PlatformEffect[] } = {
  applied: [{ state: "active" }, { ref: { slot: "directory", from: { sender: true } } }, { ref: { slot: "genesis", from: { source: "ref" } } }],
  refused: [],
  conflict: [],
};

export const register: PlatformData = {
  format: "artroom-definition-1",
  name: "platform:register",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "install",
  items: {
    // Section 12.1.1, the first row of the item table.
    register: {
      many: false, max: 1, initial: "open",
      states: { open: { final: false } },
      parties: {},
      refs: {},
      values: {
        host: { fixed: true, required: true, of: NAME },
        namespace: { fixed: true, required: true, of: NAME },
        policy: { fixed: true, required: true, of: POLICY },
        founders: { fixed: true, required: false, of: FOUNDERS },
      },
    },
    // The second row. A claim is `pending` until the directory's applied result is recorded.
    claim: {
      many: true, max: 64, initial: "pending",
      states: { pending: { final: false }, active: { final: true } },
      parties: {},
      refs: {
        directory: { fixed: false, required: false, to: { type: "scope", kind: "directory" } },
        genesis: { fixed: false, required: false, to: { type: "fact", kind: ["establish"], under: "platform:directory" } },
      },
      values: {
        intent: { fixed: true, required: true, of: { type: "digest" } },
        seed: { fixed: true, required: true, of: { type: "digest" } },
        founder: { fixed: true, required: true, of: KEY },
        policy: { fixed: true, required: true, of: POLICY },
        branch: { fixed: true, required: true, of: NAME },
        repository: { fixed: false, required: false, of: REPOSITORY },
      },
    },
  },
  acts: {
    // `install`: genesis. The installer's signed intent, with `to: null` (Code P13: no grant exists to judge). It opens `register`,
    // with the four values from the intent's fields.
    install: {
      step: "open", on: "register", grant: { code: "install", row: "P13" },
      also: {},
      fields: {
        host: { ...NAME, required: true },
        namespace: { ...NAME, required: true },
        policy: { ...POLICY, required: true },
        founders: { ...FOUNDERS, required: false },
      },
      guards: [],
      effects: [
        { value: { slot: "host", from: { field: "host" } } },
        { value: { slot: "namespace", from: { field: "namespace" } } },
        { value: { slot: "policy", from: { field: "policy" } } },
        { value: { slot: "founders", from: { field: "founders" } } },
      ],
      sends: [],
      attention: [],
    },
    // `found`: an act, signed by the founder's key (Code P13 and P14). It is judged by the founding policy in place of a grant: the
    // rule at `grant` is the row's guard, and it refuses `unauthorized`. It opens `claim`, `pending`. A founding intent's fields are
    // `branch`, `founderHandle`, `recoveryKey` and, for a founding by import, `import`.
    found: {
      step: "open", on: "claim", grant: { code: "founding-policy", row: "P13" },
      also: { register: { item: "register", one: true } },
      fields: {
        branch: { ...NAME, required: true },
        founderHandle: { ...NAME, required: true },
        recoveryKey: { ...KEY, required: true },
        import: { type: "text", max: 2048, required: false },
      },
      // The row's one guard (section 12.1.1, stated in revision 24): `founderHandle` is a handle, or `bad-field`, named `bad-handle`.
      guards: [{ code: "handle-form", row: "P27" }],
      effects: [
        { value: { slot: "intent", from: { intent: true } } },
        { value: { slot: "branch", from: { field: "branch" } } },
        // "The founding policy value used" (section 3.8, step 1). The row of section 12.1.1 states no source for it (I3 deltas, entry EP3).
        { value: { slot: "policy", from: { slot: "policy", of: "also.register" } } },
        // `founder` is the signing key (Code P14).
        { code: "founder-key", row: "P14" },
        // `seed` is the digest of the directory's seed (Code P16).
        { code: "claim-seed", row: "P16" },
        // It opens the operation `create-repository`, which selects one result, with at most 3 attempts (Code P16; U9).
        { code: "open-create-repository", row: "P16" },
      ],
      sends: [],
      attention: [],
    },
  },
  receives: {},
  timed: {},
  rules: {},
  // The operation kinds that this definition owns, each with the mark of the rule for its outcome entries (row c of the further marks).
  outcomes: {
    // I3 merge: this mark has no rule. It is written when the I3 deltas' entry EJ1 is answered, with `DIRECTORY_CLAUSES`.
    "create-repository": { code: "create-repository", row: "P16" },
    "revoke-credential": { code: "revoke-credential", row: "P16" },
    "delete-repository": { code: "delete-repository", row: "P16" },
  },
};

// ---------------------------------------------------------------- the rules

const registerOf = (state: Pick<StateView, "page">) => state.page("register", ["open"], null, 1).items[0] ?? null;

/** The signed intent of the act that is judged, whose `actor` is the signing key (the contract's section 6.1, "What a rule is given", item 2). */
const signed = ({ input }: RuleGiven) => {
  if (input.type !== "act") throw new Error("this rule stands in an act, and reads its signed intent");
  return input.signed;
};

/**
 * The seed of the directory that a founding intent asks for (the contract's
 * section 7.1, step 1): its creator is the register, and its cause is the
 * digest of the founder's intent, which is the contract's fourth cause. It
 * is fixed by the `found` entry, and the directory's scope ID is its digest.
 */
export const directorySeed = (given: RuleGiven): Seed =>
  ({ v: 1, kind: "directory", definition: DIRECTORY, creator: given.resolved.at, cause: intentDigest(signed(given).intent), ordinal: 0 });

/**
 * The rules of `platform:register@1`, by the name that a mark states
 * (section 12.1.8, the table of marks). Each is a pure function of what a
 * rule is given. None reads the clock. `create-repository` is not here: see
 * the head of this file.
 */
export const registerRules: Rules = {
  /**
   * Row 2, at `grant` of `install`, the genesis (P13). It reads the seed. A
   * pass, with no member, for the intent whose digest is the seed's cause.
   * The genesis judge has checked the signature and the seed. Who may sign
   * an install is N5's, and this rule checks no more.
   */
  install: {
    place: "grant", refusals: [],
    run: ({ input }) => (input.type === "genesis" && input.founding !== null && intentDigest(input.founding.intent) === input.seed.cause ? { pass: true, member: null } : { pass: false }),
  },
  /**
   * Row 3, at `grant` of `found` (P13, P14). It reads `register.policy` and
   * `register.founders`. A pass, with no member, when the policy is `open`
   * or the signing key is one of `founders`. Otherwise `unauthorized`: no
   * claim, and no repository (section 12.1.1, case a).
   */
  "founding-policy": {
    place: "grant", refusals: [],
    run: (given) => {
      const held = registerOf(given.state);
      const founders: unknown = held?.values["founders"];
      const passes = held?.values["policy"] === "open" || (held?.values["policy"] === "keys" && Array.isArray(founders) && founders.includes(signed(given).intent.actor));
      return passes ? { pass: true, member: null } : { pass: false };
    },
  },
  /**
   * Row r, the guard of `found` (P27), on the field `founderHandle`: the
   * register's own rule of this name, with the same check as membership's
   * (section 3.1). A founding whose handle is no handle is refused
   * `bad-field`, named `bad-handle`, and no claim is opened.
   */
  "handle-form": handleForm("founderHandle"),
  /** Row 4, among the effects of `found` (P14). One `value` effect: `founder` of the claim is the signing key. */
  "founder-key": {
    place: "effect", most: 1,
    run: (given) => [{ effect: "value", item: given.resolved.self, slot: "founder", value: signed(given).intent.actor }],
  },
  /** Row 5, among the effects of `found` (P16). It reads this scope's reference. One `value` effect: `seed` of the claim is the digest of the directory's seed. */
  "claim-seed": {
    place: "effect", most: 1,
    run: (given) => [{ effect: "value", item: given.resolved.self, slot: "seed", value: seedDigest(directorySeed(given)) }],
  },
  /**
   * Row 6, among the effects of `found` (P16). An `operation` effect,
   * `create-repository`, with 3 attempts, and the `attempt` effect that
   * opens attempt 1. It is the entry's one operation, at ordinal 0.
   */
  "open-create-repository": {
    place: "effect", most: 2,
    run: () => [
      { effect: "operation", k: 0, owner: REGISTER, kind: "create-repository", attempts: CREATION_ATTEMPTS },
      { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
    ],
  },
  /**
   * Row c, for the outcomes of `revoke-credential`: the revocation of a
   * credential that the host returned with a repository, by its ID (section
   * 3.8). The tables of section 12.1.1 state its attempts, and nothing that
   * its outcome derives. So it selects nothing and derives nothing, and
   * another attempt follows a `refused` or an `unknown` while the stated
   * number allows. No text makes a read decisive for it, so only the
   * request's own answer settles an attempt (I3 deltas, entry EP4).
   */
  "revoke-credential": { place: "outcome", rules: { selects: false, read: false, retries: () => true } },
  /**
   * Row c, for the outcomes of `delete-repository`: the deletion of a
   * repository that was not selected, by the ID that its own answer gave
   * (section 3.8, "What stays owed"). As `revoke-credential`.
   */
  "delete-repository": { place: "outcome", rules: { selects: false, read: false, retries: () => true } },
};
