/**
 * `platform:register@1`, as data, with its rules (authority note, sections
 * 3.8 and 12.1.1; its table of marks, section 12.1.8, rows 2 to 6, c, k, r
 * and v). One register for a deployment. It holds founding claims, and it
 * owns one kind of outside effect: creating the repository at the Git host.
 * It is the one scope with no creator (the scope contract, section 7.1).
 *
 * The rows of `install`, `found` and `handle-form` are as the note's
 * adopted revision 24 has them. **The outcomes of the three kinds of
 * operation, the send `create-directory` and the effect mark
 * `claim-active` are as the note's revision 25 states them** ("The rule
 * `create-repository`, whole", and the three blocks after it). That
 * revision was filed for review, and not adopted, when this was written
 * (I3 deltas, section 26).
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
 * | `create-directory` | 7, the send | k | The send of the mark of `create-repository` |
 * | `claim-active` | 5, effect, in a clause | v | The clause `applied` of that send |
 * | `revoke-credential` | 7, outcome | c | The outcomes of that kind of operation |
 * | `delete-repository` | 7, outcome | c | The same |
 *
 * The data holds no mark that the table does not list, and every mark has
 * its rule here. So a runtime with this package can run
 * `platform:register@1`.
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them.
 */

import type { Digest, FieldValue, OperationId, PlatformData, PlatformDefinition, ScopeId, Seed } from "@generalbusiness/artroom-contract";
import { base32, intentDigest, isDigest, seedDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, type Item, type Opening, type OutcomeRule, type Own, type RuleGiven, type Rules, type StateView } from "@generalbusiness/artroom-derive";
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
    // Its `send` is the one request of the selecting outcome: the `create` of the directory (row k). The clause `applied` holds one
    // effect mark, `claim-active` (row v). `refused` and `conflict`: no effect. Each is an incident, which is no effect of an entry.
    "create-repository": { code: "create-repository", row: "P16", send: { code: "create-directory", row: "P16", result: { applied: [{ code: "claim-active", row: "P16" }], refused: [], conflict: [] } } },
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

// ---------------------------------------------------------------- the outcomes of the register's operations

/** The bound on each text of the evidence of the register's operations (section 12.1.1: "each a text of at most 256 bytes"). */
const EVIDENCE_TEXT = 256;
const isText = (value: unknown): value is string => typeof value === "string" && utf8(value).length <= EVIDENCE_TEXT;
/** The body of an outcome's evidence, when it is a record with each of `needs`, and with no member outside `needs` and `may`. Null: "a body with another member or a missing one". */
const bodyOf = (body: unknown, needs: readonly string[], may: readonly string[] = []): Readonly<Record<string, unknown>> | null =>
  (isObject(body) && needs.every((name) => Object.hasOwn(body, name)) && Object.keys(body).every((name) => needs.includes(name) || may.includes(name)) ? body : null);

/** The position of the entry that opened an operation, which its ID states (the contract's section 4.1). */
const openedAt = (operation: OperationId): number => Number(operation.split(":")[0]);

/**
 * The claim that an operation `create-repository` is for (section 12.1.1,
 * "The owner's local guard"): the item that the opening entry opened, the
 * `found` entry at the position that the operation's ID states. An item's
 * ID is the position of the entry that opened it. Null: no claim is there.
 */
const claimOf = (state: Pick<StateView, "item">, operation: OperationId): Item | null => {
  const item = state.item(openedAt(operation));
  return item?.type === "claim" ? item : null;
};

/**
 * The attempt's own name (section 12.1.1): the 52 characters of the
 * directory's scope ID after its prefix `sc_`, a hyphen, and the attempt's
 * number in decimal. The scope ID is that of the seed whose digest the
 * claim holds as `seed`: a scope ID is `sc_` and the 52 base32 characters
 * of the 32 bytes of its seed's digest. So the name is a function of the
 * claim and the number, and a replay derives it.
 */
export const repositoryName = (seed: Digest, attempt: number): string =>
  `${base32(Uint8Array.from(seed.slice(seed.indexOf(":") + 1).match(/../g) ?? [], (byte) => Number.parseInt(byte, 16)))}-${attempt}`;

/** The scope ID of the directory whose seed has that digest, which a claim holds as `seed`. */
export const directoryIdOf = (seed: Digest): ScopeId => `sc_${repositoryName(seed, 0).slice(0, 52)}` as ScopeId;

/** The own name of the attempt of an outcome of `create-repository`, from the claim of its operation. Null: the operation has no claim. */
const ownName = (state: Pick<StateView, "item">, operation: OperationId, attempt: number): string | null => {
  const seed = claimOf(state, operation)?.values["seed"];
  return isDigest(seed) ? repositoryName(seed, attempt) : null;
};

/** One cleanup that an outcome of `create-repository` opens: 3 attempts (section 12.1.1; U9). */
const cleanup = (kind: "revoke-credential" | "delete-repository"): Opening => ({ owner: REGISTER, kind, attempts: CREATION_ATTEMPTS });
/** The entries that the two cleanups of one outcome entry reserve: two operations of three attempts each, with a first outcome and a late answer for each attempt (the contract's section 17.2, row 5). */
const CLEANUPS = 2 * (2 * CREATION_ATTEMPTS);

/** The body of the evidence of the outcome entry that opened a cleanup: a `confirmed` outcome of `create-repository`, at the position that the cleanup's ID states. */
const openingBody = (own: Own, operation: OperationId): Readonly<Record<string, unknown>> | null => {
  const input = own(openedAt(operation))?.entry.input;
  return input?.type === "outcome" && input.kind === "create-repository" && isObject(input.evidence.body) ? input.evidence.body : null;
};

/**
 * The rule of the outcomes of one cleanup (section 12.1.1, the table of
 * the two kinds): every body is one member, which is the one that the
 * opening entry's body holds under that name.
 */
const ofCleanup = (member: "credential" | "id"): OutcomeRule => ({
  selects: false, read: false,
  retries: () => true,
  wellFormed: (_result, evidence, given) => {
    const named = given.input.type === "outcome" ? openingBody(given.own, given.input.operation)?.[member] : undefined;
    return typeof named === "string" && bodyOf(evidence.body, [member])?.[member] === named;
  },
  unknown: (_state, operation, _attempt, own) => ({ [member]: openingBody(own, operation.id)?.[member] ?? null }),
});

/**
 * The rules of `platform:register@1`, by the name that a mark states
 * (section 12.1.8, the table of marks). Each is a pure function of what a
 * rule is given. None reads the clock.
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
   * Row c, for the outcomes of `create-repository` (P16), as the note's
   * revision 25 states it whole (section 12.1.1, "The rule
   * `create-repository`, whole").
   *
   * - The kind selects one result. The owner's local guard: the claim's
   *   `repository` is unset. The claim is the item that the opening entry
   *   opened.
   * - A read is never decisive: only the request's own answer settles an
   *   attempt. A listing of the namespace decides nothing (section 3.8).
   * - Another attempt follows a `refused` or an `unknown`. The ledger checks
   *   that fewer than 3 are opened and that nothing is selected.
   * - The evidence. `confirmed`, basis `own-answer`: `{ name, id }`, or
   *   `{ name, id, credential }`, each a text of at most 256 bytes.
   *   `credential` is the host's ID of a credential, and never its secret.
   *   `refused`, basis `own-answer`: `{ name, nameExists }`, with a truth
   *   value. `unknown`, basis `none`: `{ name }`. In each, `name` is the
   *   attempt's own name (`repositoryName`). Any other body is `bad-input`.
   * - On the selecting outcome: one `value` effect, the claim's
   *   `repository`, with `host` and `namespace` from the register item and
   *   `name` and `id` from the body. The `create` of the directory is the
   *   request of the mark's `send`, the rule `create-directory`.
   * - On each `confirmed` outcome whose body holds `credential`: the
   *   operation `revoke-credential`, with 3 attempts. On each `confirmed`
   *   outcome that is not selected: the operation `delete-repository`, with
   *   3 attempts. The ledger numbers each and opens its attempt 1.
   * - A `refused` outcome with `nameExists` derives nothing of an entry: the
   *   incident of section 3.8 is the operators' record.
   * - `most`: 5 effects, one `value` and two operations with one attempt
   *   each; one request; two operations.
   */
  "create-repository": {
    place: "outcome",
    rules: {
      selects: true, read: false, closure: CLEANUPS, most: { effects: 5, requests: 1, operations: 2 },
      retries: () => true,
      holds: (given, operation) => { const claim = claimOf(given.state, operation.id); return claim !== null && (claim.values["repository"] ?? null) === null; },
      wellFormed: (result, evidence, given) => {
        if (given.input.type !== "outcome") return false;
        const name = ownName(given.state, given.input.operation, given.input.attempt);
        const body = result === "confirmed" ? bodyOf(evidence.body, ["name", "id"], ["credential"]) : result === "refused" ? bodyOf(evidence.body, ["name", "nameExists"]) : bodyOf(evidence.body, ["name"]);
        if (name === null || !body || body["name"] !== name) return false;
        return result === "confirmed" ? isText(body["id"]) && (body["credential"] === undefined || isText(body["credential"])) : result !== "refused" || typeof body["nameExists"] === "boolean";
      },
      unknown: (state, operation, attempt) => ({ name: ownName(state, operation.id, attempt) }),
      derives: (given, operation, selected) => {
        const body = given.input.type === "outcome" && isObject(given.input.evidence.body) ? given.input.evidence.body : {};
        const claim = claimOf(given.state, operation.id);
        const held = registerOf(given.state);
        if (!claim || !held) throw new Error("an operation create-repository is of a claim of a register");
        const repository = { host: held.values["host"]!, namespace: held.values["namespace"]!, name: body["name"] as string, id: body["id"] as string };
        return {
          effects: selected === true ? [{ effect: "value", item: claim.id, slot: "repository", value: repository }] : [],
          sends: [],
          // `selected` is null for an outcome that is not `confirmed`, which opens neither.
          opens: [...(selected !== null && body["credential"] !== undefined ? [cleanup("revoke-credential")] : []), ...(selected === false ? [cleanup("delete-repository")] : [])],
        };
      },
    },
  },
  /**
   * Row k, the `send` of the mark of `create-repository` (P16), as the
   * note's revision 25 makes it exact (section 12.1.1, "The send
   * `create-directory`, and its clause"). It gives a request on the
   * selecting outcome, and on no other: a `confirmed` outcome of an
   * operation that has selected nothing, for a claim whose `repository` is
   * unset. That is the judgment that the ledger makes of `selected`, on the
   * same state.
   *
   * The request is the `create` of the directory. Its seed names this
   * register as creator, and its cause is the digest of the founder's
   * `found` intent, which the opening entry holds: the contract's fourth
   * cause. It is the seed whose digest the rule `claim-seed` gave the claim.
   * The fields: `claim`, the fact of the `found` entry, which is the opening
   * entry; `repository`, the record that the same outcome sets; and
   * `branch`, `founderHandle`, `recoveryKey` and, when the intent holds it,
   * `import`, from the fields of the `found` intent. It carries no signed
   * intent: the claim's entry holds it, and the directory retains that
   * entry from its genesis on.
   */
  "create-directory": {
    place: "send",
    run: (given) => {
      const input = given.input;
      if (input.type !== "outcome" || input.result !== "confirmed") return null;
      const operation = given.state.operation(input.operation);
      const claim = claimOf(given.state, input.operation);
      if (!operation || operation.selected !== null || !claim || (claim.values["repository"] ?? null) !== null) return null;
      const opening = given.own(openedAt(input.operation));
      const held = registerOf(given.state);
      const body = isObject(input.evidence.body) ? input.evidence.body : {};
      if (!opening || opening.entry.input.type !== "act" || !held) throw new Error("the operation create-repository was opened by a found entry of a register");
      const { intent } = opening.entry.input.signed;
      const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: given.resolved.at, cause: intentDigest(intent), ordinal: 0 };
      const { branch, founderHandle, recoveryKey } = intent.fields;
      const fields = {
        claim: { at: given.resolved.at, seq: opening.entry.seq, hash: opening.hash },
        repository: { host: held.values["host"]!, namespace: held.values["namespace"]!, name: body["name"] as string, id: body["id"] as string },
        branch, founderHandle, recoveryKey, ...(intent.fields["import"] === undefined ? {} : { import: intent.fields["import"] }),
      };
      return { to: seed, message: { class: "request", type: "create", body: { fields } } };
    },
  },
  /**
   * Row v, the effect mark in the clause `applied` of the send
   * `create-directory` (P16), as the note's revision 25 states it (section
   * 12.1.1, "The effect mark `claim-active`"). A clause of a request that an
   * outcome sent has no subject, so the rule finds the item. It reads the
   * result's `of`, which names the request by the outcome entry that sent
   * it; that outcome entry, by its position, for the operation that it
   * belongs to; and the claim that the operation's opening entry opened.
   *
   * Three effects on that claim: `active`; the reference `directory`, which
   * is the result's sender; and the reference `genesis`, which is the
   * result's source entry. It names no refusal. Where the claim is not
   * `pending` the state effect is one that the checks on effects refuse, so
   * the clause changes nothing, and the result is recorded.
   */
  "claim-active": {
    place: "effect", most: 3,
    run: (given) => {
      const input = given.input;
      if (input.type !== "delivery" || input.message.class !== "result") throw new Error("claim-active stands in the clause of a result");
      const sent = given.own(input.message.of.from.seq)?.entry.input;
      const claim = sent?.type === "outcome" ? claimOf(given.state, sent.operation) : null;
      if (!claim) throw new Error("the request was sent by an outcome of an operation create-repository, which is of a claim");
      return [
        { effect: "state", item: claim.id, state: "active" },
        { effect: "ref", item: claim.id, slot: "directory", to: input.from.at as unknown as FieldValue },
        { effect: "ref", item: claim.id, slot: "genesis", to: input.from as unknown as FieldValue },
      ];
    },
  },
  /**
   * Row c, for the outcomes of `revoke-credential`: the revocation of a
   * credential that the host returned with a repository, by its ID (section
   * 3.8), as the note's revision 25 decides it (section 12.1.1, "The
   * outcomes of `revoke-credential` and `delete-repository`"; I3 delta EP4).
   *
   * The operation is for the credential that the body of its opening entry
   * names. The opening entry is a `confirmed` outcome of
   * `create-repository`. A read is not decisive: only the request's own
   * answer settles an attempt. The body of every result is
   * `{ credential }`: for `confirmed`, the ID that the host answered as
   * revoked. A body with another member, or a `credential` that is not the
   * opening entry's, is `bad-input`. The rule selects nothing and derives
   * nothing. Another attempt follows a `refused` or an `unknown`, to 3.
   */
  "revoke-credential": { place: "outcome", rules: ofCleanup("credential") },
  /**
   * Row c, for the outcomes of `delete-repository`: the deletion of a
   * repository that was not selected, by the ID that its own answer gave
   * (section 3.8, "What stays owed"). As `revoke-credential`, with the body
   * `{ id }`: the repository that the body of its opening entry names by
   * `id`.
   */
  "delete-repository": { place: "outcome", rules: ofCleanup("id") },
};
