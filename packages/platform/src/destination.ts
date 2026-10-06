/**
 * `platform:destination@1`, as data, with its rules (authority note,
 * revision 26, sections 6.1 to 6.10, 12.1.5 and 12.2; its table of marks,
 * section 12.1.8, rows 30 to 37 and the further rows b, e, m, n and z). One
 * destination scope for each published branch. It is the only writer of
 * that branch.
 *
 * Revision 26 is approved by the checker, and its adoption was not
 * recorded when this was built (I3 deltas, section 29). Section 12.1.5,
 * "The destination, decided in revision 25", is the rule wherever a row of
 * its tables differs.
 *
 * One member of the data is one row of the note's tables. A cell of the
 * note that begins "Code" is a mark in this data, at the place where its
 * rule is run (the scope contract, section 6.1), and the rule is in
 * `destinationRules`, below.
 *
 * **The rules that are written**, each from its row of the table of marks:
 *
 * | Rule | Place | Row | At |
 * |---|---|---|---|
 * | `declare-first-head` | 5, effect | 30 | `establish`: the operation, and its attempt's `mint`, both held |
 * | `open-first-head` | 5, effect | 31 | `import`: the operation, and its attempt's `mint` |
 * | `open-judge` | 5, effect | 32 | `reserve`: one `judge` at a time, by `branch.judging` |
 * | `publication-of` | 2, `also` | 34 | `withdraw`, the name `publication` |
 * | `open-withdrawn` | 5, effect | 34 | `withdraw` |
 * | `abort-if-behind` | 5, effect | 35 | `compromised` |
 * | `open-branch-read` | 5, effect | 36 | `adopt-head` |
 * | `reopen-publish` | 5, effect | 37 | `resend`: the write, and its attempt's `mint` |
 * | `resend-due` | 4, guard | z | `resend`, refused `resend-not-due` |
 * | `collect-list` | 3, type | b | `reserve`, the fields `verdicts`, `jobs` and `links`; a verdict may state `extent` |
 * | `mint` | 7, outcome | e | The kind `mint` |
 * | `revoke` | 7, outcome | e | The kind `revoke` |
 * | `push` | 7, outcome | e | The kind `push` |
 * | `deciding-read` | 7, outcome | e | The kind `read`, for the branch of a publication |
 * | `adopt-read` | 7, outcome | e | The kind `adopt-read` |
 * | `judge` | 7, outcome | 33 | The kind `judge`. See below: it reserves nothing in this runtime. |
 * | `publication-update` | 7, the send | m, n | The kinds `judge`, `push`, `mint`, `revoke`, `read` and `receipt` |
 *
 * **The rule `judge` is written, and in this runtime it reserves nothing.**
 * Its judgment, `judgeReservation`, and what its outcome yields are
 * written whole. The judge of an outcome gives the rule `observed` and the
 * entries in `uses`, and the rule reads its observations itself
 * (`reservationRead`). Two things still stand between it and a
 * reservation. No runtime reads an observation before the turn of an
 * outcome, because no form states the subjects (the contract's point
 * R1-67; I3 deltas, entry FC6). And no text states how an entry of a lane
 * is read by its bytes, so the package has no reader of the manifest, the
 * verdicts and the checks (entries FA9 and FC5). So the rule decides what
 * the evidence and this scope's own records decide: a publication that is
 * no longer `queued`, `evidence-too-large`, a head that is not the
 * recorded head, and an integration commit that is not in the repository.
 * For every other outcome it has a fault: nothing is written, and the
 * publication stays `queued`. A test gives it a stand-in reader of the
 * lane's entries (`destinationRulesWith`).
 *
 * **The marks that have NO rule here.** Two. So the version still lacks
 * rules, and by the whole-scope rule (the contract's section 6.1) nothing
 * is created under `platform:destination@1` by this package's rules.
 *
 * | Mark | Place | At | Why it has no rule |
 * |---|---|---|---|
 * | `first-head` | 7, `outcomes` | The kind `first-head` | It compares what the ref holds with the ID of the founding commit, or of the imported one. The note asks two details of the contract before that ID can be computed: the text of a fact reference in a commit message, and the byte domain of a ref's digest (section 12.1.5, "The founding commit, and the receipt"; entry ER9). |
 * | `receipt` | 7, `outcomes` | The kind `receipt` | The same two details. And its slots `token` and `receipt` are on a `published` publication, which is final and takes no effect (entry FA6). |
 *
 * Three rules that are written reach those two. The outcome of a mint of a
 * receipt's attempt opens the token's revocation at once. The outcome of a
 * `read` that was opened for a first head or for a receipt's ref is not
 * judged. And each rule that publishes opens the `receipt` operation with
 * its mint, as its row says, whose outcomes then have no rule.
 *
 * The fence of section 6.8 is not adopted (section 6.8, "The standing of
 * this section"; U2). The data names no fence: no operation, and no kind
 * of outcome.
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them.
 */

import type { FactRef, FieldValue, KeyId, Observation, OperationId, PlatformData, PlatformDefinition, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, isFactRef, isMemberRef, isScopeRef, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Item, Opening, Operation, Own, PlatformRule, RecordedRef, RuleEffect, RuleGiven, RuleRequest, Rules, StateView } from "@generalbusiness/artroom-derive";
import { isJudgeEvidence, isObjectId, judgeReservation, type ReservationRead, type Statement } from "./reservation.ts";
import { referenceOf } from "./rules-scope.ts";

/** The name and version that this data and these rules are. An operation that the destination opens states it as its owner (the contract's section 4.3). */
export const DESTINATION = "platform:destination@1" satisfies PlatformDefinition;

/**
 * The kinds of operation that the destination owns: the member `outcomes`
 * of its data. The note names two, `first-head` and `judge` (rows 30 to
 * 33). It names no kind for the others: "a push, its mint, its revocation;
 * the deciding read; the receipt", and the read that `adopt-head` opens (the
 * row of outcomes of section 12.1.5; row e). Those six names are this
 * source's (I3 deltas, entry ER1). `mint` and `revoke` are the names that
 * `hold@1` uses for the same two effects.
 */
export const DESTINATION_KINDS = { firstHead: "first-head", judge: "judge", push: "push", mint: "mint", revoke: "revoke", read: "read", receipt: "receipt", adoptRead: "adopt-read" } as const;

/**
 * The most attempts that an opening states (section 12, G3, proposed for
 * the proof plan): a creation of a ref, 3 (section 12.2); the push of one
 * publication, 3 (U5); a receipt write, 3; a credentialed read, 1. A further
 * try that an admin's `resend` opens has 1 (the row `resend`). Revision 25
 * states each in one table (section 12.1.5, "The kinds of operation, and
 * the rules of their outcomes"): `judge`, `mint`, the kind `read` and
 * `adopt-read` have 1, and `revoke` has 3.
 */
export const DESTINATION_ATTEMPTS = { firstHead: 3, judge: 1, push: 3, mint: 1, revoke: 3, read: 1, receipt: 3, adoptRead: 1, resend: 1 } as const;

/**
 * What one publication reserves, in entries, by the two rows of the
 * destination in the table of the authority note's section 5.8, counted
 * from the attempts above as that section counts them: "An operation"
 * reserves 2 entries for each attempt, and "a request" 2.
 *
 * - `queued`, 4: 1 entry for the decision to reserve or not; the final
 *   update, a request; and 1 entry for one `withdraw`.
 * - `reserved`, 68: the push, with for each attempt its mint and its
 *   token's revocation, 30; 1 entry for the read that decides; the updates
 *   `reserved` and `unresolved`, two requests; 1 entry for an abort and 1
 *   for the first `compromised` notice; and the receipt, counted as the
 *   push, with 1 entry for its read, 31.
 *
 * Both are reserved "when" the `reserve` is delivered, which "is admitted
 * only with the room of this row and the next": 72 entries, and 73 with
 * the delivery's own.
 *
 * **THIS COUNT IS NOT HELD BY ANY RUNTIME** (I3 deltas, entries FA3 and
 * FC1). The ledger counts, for a publication, only the outcome entries of
 * each operation that is open (`owed`, in derive's `reserve.ts`), and the
 * kinds of this definition state `covered`, so nothing is reserved for
 * what an outcome opens. `asked` is what the one entry of a publication
 * that is new work, the delivery of its `reserve`, is admitted with: the
 * 2 entries of the `judge` that it opens, of which the table counts 1,
 * the decision. `unreserved` is the rest of the table: the entries that a
 * publication may write, or reserve, in entries that are never asked
 * whether they fit. It is 71, and 72 where the `reserve` opened no
 * `judge`. `platform/test/definitions.test.ts` holds the numbers, and the
 * kinds that state `covered`, so that neither grows unseen.
 */
export function publicationRoom(attempts: { push: number; mint: number; revoke: number; receipt: number; judge: number } = DESTINATION_ATTEMPTS): { queued: number; reserved: number; asked: number; unreserved: number } {
  const [operation, request] = [(most: number) => 2 * most, 2];
  /** A write, with for each of its attempts a mint and the revocation of its token. */
  const write = (most: number) => operation(most) + most * (operation(attempts.mint) + operation(attempts.revoke));
  const queued = 1 + request + 1;
  const reserved = write(attempts.push) + 1 + 2 * request + 1 + 1 + write(attempts.receipt) + 1;
  return { queued, reserved, asked: operation(attempts.judge), unreserved: queued + reserved - 1 };
}

/**
 * The most records of each `collect` list of a `reserve` (row b; section
 * 12.1.5, "The three lists of `reserve`"). They are constants of version 1
 * of the rule `collect-list`. They equal the `max` of the types `review`,
 * `job` and `link` of the pinned `change` lane. The rule does not read them
 * from the sender's pinned definition: a rule is given no definition of
 * another scope. If the lane's row or a `max` changes, this changes with
 * it, in a revision of the note (entry ER3).
 */
export const COLLECT_MOST = { verdicts: 256, jobs: 64, links: 32 } as const;

const NAME = { type: "text", max: 256 } as const;
const SCOPE_ID = { type: "text", max: 64 } as const;
/** The ID of an operation of this scope, as the two slots `token` hold the ID of a `mint`. */
const TOKEN = { type: "text", max: 32 } as const;
/** The record of section 12.1.1, the value `repository` of a claim. */
const REPOSITORY = { type: "record", of: { host: { ...NAME, required: true }, namespace: { ...NAME, required: true }, name: { ...NAME, required: true }, id: { ...NAME, required: true } } } as const;
const OPERATION = { type: "fact", kind: ["merge"], under: "change" } as const;
const MANIFEST = { type: "fact", kind: ["propose-manifest"], under: "change" } as const;
const CLAIM = { type: "fact", kind: ["found"], under: "platform:register" } as const;
const BRANCH = { branch: { item: "branch", one: true } } as const;
const FROM_LANE = { kind: "lane", under: "change" } as const;
const FROM_DIRECTORY = { kind: "directory", under: "platform:directory" } as const;
/** The states in which a publication holds the slot (section 6.6, "What is never done"). */
const HELD: readonly string[] = ["reserved", "publishing", "unresolved"];
/** Every state of a publication, final or not: a publication that exists for an operation, whatever became of it. */
const EVERY = ["queued", "reserved", "publishing", "unresolved", "published", "aborted", "not-reserved"] as const;
/** The type of a `collect` list of a `reserve` (Code P25; row b). */
const COLLECTED = { code: "collect-list", row: "P25", type: "code", required: true } as const;
/** The send of the mark of an outcome's kind: the `relate`, `publication`, to the lane. Its clauses are empty (rows m and n). */
const UPDATE = { code: "publication-update", row: "P16", result: {} } as const;
/** The sender is the scope that the operation's fact is in (section 6.4). */
const OWNER = { equals: { a: { field: "operation", part: "scope" }, b: { sender: true } }, reason: "not-owner" } as const;

export const destination: PlatformData = {
  format: "artroom-definition-1",
  name: "platform:destination",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    // Section 12.1.5, the first row of the item table. The slot of section 6.1 is `slot`: empty, or the one publication that holds it.
    branch: {
      many: false, max: 1, initial: "empty",
      states: { empty: { final: false }, ready: { final: false } },
      parties: {},
      refs: {
        directory: { fixed: true, required: true, to: { type: "scope", kind: "directory" } },
        claim: { fixed: true, required: true, to: CLAIM },
        slot: { fixed: false, required: false, to: { type: "item", of: "publication" } },
        // "Six more slots" (revision 25; entry ER6). The one publication whose `judge` is open. Empty when none is.
        judging: { fixed: false, required: false, to: { type: "item", of: "publication" } },
      },
      values: {
        repository: { fixed: true, required: true, of: REPOSITORY },
        name: { fixed: true, required: true, of: NAME },
        import: { fixed: true, required: true, of: { type: "bool" } },
        membership: { fixed: true, required: true, of: SCOPE_ID },
        rules: { fixed: true, required: true, of: SCOPE_ID },
        head: { fixed: false, required: false, of: { type: "commit" } },
        // The ID of the `mint` operation of a `first-head` attempt whose token is live and has no revocation yet.
        token: { fixed: false, required: false, of: TOKEN },
      },
    },
    // The second row. The eligibility statement is not copied into an item: it is the `reserve` message, which the deciding entry holds.
    publication: {
      many: true, max: 64, initial: "queued",
      states: {
        queued: { final: false }, reserved: { final: false }, publishing: { final: false }, unresolved: { final: false },
        published: { final: true }, aborted: { final: true }, "not-reserved": { final: true },
      },
      parties: {},
      refs: {
        operation: { fixed: true, required: true, to: OPERATION },
        lane: { fixed: true, required: true, to: { type: "scope", kind: "lane" } },
        manifest: { fixed: true, required: false, to: MANIFEST },
      },
      values: {
        integration: { fixed: false, required: false, of: { type: "commit" } },
        reason: { fixed: false, required: false, of: { type: "text", max: 1024 } },
        withdrawDecided: { fixed: false, required: true, of: { type: "bool" }, default: false },
        // The position, in this scope's history, of the entry that reserved it.
        reservedAt: { fixed: false, required: false, of: { type: "int", min: 0, max: 1000000000 } },
        // That a `compromised` notice named a key behind it. No further attempt of its push is opened.
        aborting: { fixed: false, required: true, of: { type: "bool" }, default: false },
        // As `branch.token`, for an attempt of its push or of its receipt.
        token: { fixed: false, required: false, of: TOKEN },
        // Where its receipt stands. Unset before `published`.
        receipt: { fixed: false, required: false, of: { type: "enum", of: ["owed", "written", "conflict"] } },
      },
    },
  },
  acts: {
    // `establish`: genesis, by the directory's `create` (fields `repository`, `branch`, `import`, `claim`, `directory`, `membership` and
    // `rules`, section 12.1). It opens `branch`, `empty`. The note states no grant for it: a genesis is judged by no signer, so
    // nothing reads this one. `membership` and `rules` are the scope IDs alone: both scopes are created beside this one (P20).
    establish: {
      step: "open", on: "branch", grant: "destination.establish",
      also: {},
      fields: {
        repository: { ...REPOSITORY, required: true },
        branch: { ...NAME, required: true },
        import: { type: "bool", required: true },
        claim: { ...CLAIM, required: true },
        directory: { type: "scope", kind: "directory", required: true },
        membership: { ...SCOPE_ID, required: true },
        rules: { ...SCOPE_ID, required: true },
      },
      guards: [],
      effects: [
        { value: { slot: "repository", from: { field: "repository" } } },
        { value: { slot: "name", from: { field: "branch" } } },
        { value: { slot: "import", from: { field: "import" } } },
        { ref: { slot: "claim", from: { field: "claim" } } },
        { ref: { slot: "directory", from: { field: "directory" } } },
        { value: { slot: "membership", from: { field: "membership" } } },
        { value: { slot: "rules", from: { field: "rules" } } },
        // Code P16: when `import` is false, the genesis declares the operation `first-head`, held, with that attempt's `mint`. The
        // entry that records the `confirm` opens attempt 1 of both (section 12.2; the contract's section 4.3, item 1).
        { code: "declare-first-head", row: "P16" },
      ],
      sends: [],
      attention: [],
    },
    // `adopt-head`: an act. Grant `destination.adopt` (section 6.9). The outcome of the read that this act opens sets `branch.head`,
    // and `ready`, only when it shows the commit that the act names. Its two fields are of revision 25 (entry ER13): section 6.9
    // says that the act "records who adopted what and why".
    "adopt-head": {
      step: "transition", on: "branch", grant: "destination.adopt",
      also: {},
      fields: { commit: { type: "commit", required: true }, why: { type: "text", max: 1024, required: true } },
      guards: [{ none: { type: "publication", states: ["reserved", "publishing", "unresolved"] } }, { unset: "slot" }],
      // Code P16: opens one read of the branch.
      effects: [{ code: "open-branch-read", row: "P16" }],
      sends: [],
      attention: [],
    },
    // `resend`: an act. Grant `ledger.retry`. The publication is `unresolved`, or it is `published` with a receipt that is not
    // written; and the stated attempts of that operation are used. The state is a written guard. The rest reads the operations
    // of the publication, which no form reads: the rule `resend-due`, refused `resend-not-due` (row z, P29; entry ER4).
    resend: {
      step: "transition", on: "publication", grant: "ledger.retry",
      also: {},
      fields: {},
      guards: [{ state: ["unresolved", "published"] }, { code: "resend-due", row: "P29" }],
      // Code P16: opens one new operation, the same compare-and-swap, with 1 attempt (G3), and that attempt's `mint`.
      effects: [{ code: "reopen-publish", row: "P16" }],
      sends: [],
      attention: [],
    },
  },
  receives: {
    // `import`: a delivery of a `relate`, from the directory, `copies` 1. None of its own. On the state `done` it opens the operation
    // `first-head` with the update's `commit`. On `failed`: nothing, and the branch stays `empty`.
    import: {
      message: "import", class: "relate", from: FROM_DIRECTORY, opens: null, copies: 1,
      also: BRANCH,
      fields: { commit: { type: "commit", required: false } },
      guards: [
        { equals: { a: { sender: true }, b: { slot: "directory", of: "also.branch" } }, reason: "not-the-directory" },
        { state: ["empty"], of: "also.branch" },
        // `import` is true. Named in revision 25 (entry ER13).
        { equals: { a: { slot: "import", of: "also.branch" }, b: { const: true } }, reason: "not-importing" },
      ],
      effects: [{ code: "open-first-head", row: "P16" }],
      sends: [],
      attention: [],
    },
    // `reserve`: a delivery of a `tell`, from a lane under `change`. It opens `publication`, `queued`, with `operation`, `lane` from
    // the sender and `manifest`. The platform's result is the one send. The lists are `collect` lists, whose type is a mark (P25).
    reserve: {
      message: "reserve", class: "tell", from: FROM_LANE, opens: "publication",
      also: BRANCH,
      fields: {
        operation: { ...OPERATION, required: true },
        manifest: { ...MANIFEST, required: true },
        verdicts: COLLECTED,
        jobs: COLLECTED,
        // The third list, with the same mark (revision 25, "The three lists of `reserve`"; entry ER3).
        links: COLLECTED,
      },
      guards: [
        OWNER,
        // No publication exists for that operation. One that a `withdraw` opened before this `reserve` is `not-reserved`, "withdrawn".
        { none: { type: "publication", states: EVERY, where: [{ equals: { a: { slot: "operation" }, b: { field: "operation" } } }] }, reason: "withdrawn" },
      ],
      effects: [
        { ref: { slot: "operation", from: { field: "operation" } } },
        { ref: { slot: "lane", from: { sender: true } } },
        { ref: { slot: "manifest", from: { field: "manifest" } } },
        // Code P16: when the slot is empty, no `judge` is open and the branch is `ready`, opens the operation `judge` for the oldest
        // queued publication, and sets `branch.judging` to it (revision 25; entry ER2).
        { code: "open-judge", row: "P16" },
      ],
      sends: [],
      attention: [],
    },
    // `withdraw`: a delivery of a `tell`, from a lane under `change`. The publication is selected by the operation that the message
    // names (Code P15), and one is opened only when none exists for it, so `opens` is null and the rule opens it. The guards and the
    // effects are the table of section 6.4, "G's answer to `withdraw`". A guard whose subject is unbound is not evaluated.
    withdraw: {
      message: "withdraw", class: "tell", from: FROM_LANE, opens: null,
      also: { publication: { code: "publication-of", row: "P15", item: "publication" } },
      fields: { operation: { ...OPERATION, required: true } },
      guards: [
        OWNER,
        // `reserved`, `publishing` or `unresolved`: refused, `reserved`. The publication goes on.
        { state: ["queued", "published", "aborted", "not-reserved"], of: "also.publication", reason: "reserved" },
        // A final state: refused, `ended`. The final update that was sent stands.
        { state: ["queued"], of: "also.publication", reason: "ended" },
      ],
      effects: [
        // While `queued`: the bound `withdraw` that is applied. A refused deciding entry applies no effect of its handler, so a
        // refused `withdraw` sets nothing (revision 25, "A refused `withdraw` sets nothing"; entry ER10). It is then new work.
        { value: { slot: "withdrawDecided", from: { const: true } }, of: "also.publication" },
        { state: "not-reserved", of: "also.publication" },
        { value: { slot: "reason", from: { const: "withdrawn" } }, of: "also.publication" },
        // Not yet known: opens the publication as `not-reserved`, "withdrawn" (Code P15).
        { code: "open-withdrawn", row: "P15" },
      ],
      sends: [
        // While `queued`: the final `publication` update, `outcome` `aborted` (section 6.4, "How each state of G's publication reaches P").
        {
          relate: {
            to: { slot: "lane", of: "also.publication" }, name: "publication", item: { item: "also.publication" }, state: "not-reserved",
            if: [{ state: ["queued"], of: "also.publication" }],
            detail: { operation: { slot: "operation", of: "also.publication" }, outcome: { const: "aborted" } }, result: {},
          },
        },
      ],
      attention: [],
    },
    // `compromised`: a delivery of a `tell`, from the directory, with the fields of membership's notice (section 12.1, "Messages
    // between scopes"). Section 6.8, when the key is behind the publication that holds the slot (Code P19): the rule
    // `abort-if-behind`.
    compromised: {
      message: "compromised", class: "tell", from: FROM_DIRECTORY, opens: null,
      also: BRANCH,
      fields: {
        key: { type: "text", max: 64, required: true },
        member: { type: "member", required: true },
        entry: { type: "fact", kind: ["revoke-key"], under: "platform:membership", required: true },
      },
      // The sender is the directory. Named in revision 25, as the row `import` writes it (entry ER13).
      guards: [{ equals: { a: { sender: true }, b: { slot: "directory", of: "also.branch" } }, reason: "not-the-directory" }],
      effects: [{ code: "abort-if-behind", row: "P19" }],
      sends: [],
      attention: [],
    },
  },
  // No timed rule exists (section 12.1.5, "Reservations").
  timed: {},
  rules: {},
  // The kinds of operation that this definition owns, each with the mark of the rule for its outcome entries (rows 33 and e;
  // revision 25 confirms the eight names, entry ER1). The mark of a kind holds the send mark `publication-update` where rows m and
  // n of the table of further marks name the kind: `judge`, and a push, its mint, its revocation, the deciding read and the receipt.
  outcomes: {
    [DESTINATION_KINDS.firstHead]: { code: "first-head", row: "P16" },
    [DESTINATION_KINDS.judge]: { code: "judge", row: "P19", send: UPDATE },
    [DESTINATION_KINDS.push]: { code: "push", row: "P16", send: UPDATE },
    [DESTINATION_KINDS.mint]: { code: "mint", row: "P16", send: UPDATE },
    [DESTINATION_KINDS.revoke]: { code: "revoke", row: "P16", send: UPDATE },
    [DESTINATION_KINDS.read]: { code: "deciding-read", row: "P16", send: UPDATE },
    [DESTINATION_KINDS.receipt]: { code: "receipt", row: "P16", send: UPDATE },
    [DESTINATION_KINDS.adoptRead]: { code: "adopt-read", row: "P16" },
  },
};

// ---------------------------------------------------------------- reading the destination's state

const PAGE = 100;

/** The one branch item of a destination scope. */
const branchOf = (state: Pick<StateView, "page">): Item | null => state.page("branch", ["empty", "ready"], null, 1).items[0] ?? null;

/** The scope ID that the item `branch` holds in that value: a text that the genesis set from the creation's fields, and that no entry changes. */
const heldId = (state: Pick<StateView, "page">, slot: "membership" | "rules"): ScopeId | null => {
  const id = branchOf(state)?.values[slot];
  return typeof id === "string" ? (id as ScopeId) : null;
};

/**
 * Where a scope under `platform:destination@1` records its membership
 * reference (authority note, section 12.1, "Where the rules scope and the
 * destination record their membership reference", decided in revision 25;
 * I3 deltas, entries EM21 and EU6): the scope ID is the value
 * `branch.membership`, and the incarnation is that of the observations of
 * that ID which its entries retain (`referenceOf`, in `rules-scope.ts`).
 * It is code of the version, as the production authority and a replay
 * read it.
 */
export const destinationMembership = (state: Pick<StateView, "page" | "incarnations">): RecordedRef | null => referenceOf(state, heldId(state, "membership"), "membership");
/** The same, for the rules scope that a destination observes: the value `branch.rules` (the same table). Guard 1 of an observation of the rules reads it, in a replay (`Platform.rulesScope`). No runtime reads the rules scope before a turn yet. */
export const destinationRulesScope = (state: Pick<StateView, "page" | "incarnations">): RecordedRef | null => referenceOf(state, heldId(state, "rules"), "rules");

/** Every publication, lowest ID first. No index is by a value, so a search for an operation reads each page, retained final items too (entry ER11). */
function* publications(state: Pick<StateView, "page">): Generator<Item> {
  for (let after: number | null = null; ;) {
    const page = state.page("publication", EVERY, after, PAGE);
    yield* page.items;
    const last = page.items.at(-1);
    if (!page.more || !last) return;
    after = last.id;
  }
}

/**
 * "The next `judge`" (section 12.1.5, "The rule `open-judge`, and one `judge`
 * at a time"; entry ER2). A `judge` is opened when all of these hold after
 * the entry's other effects: `branch.slot` is empty; `branch.judging` is
 * empty; the branch is `ready`; and a publication is `queued`. It is for
 * the `queued` publication with the lowest item ID, which may be the one
 * that the entry itself opens.
 *
 * A rule is given the state before its entry. So the caller says what the
 * entry's other effects change of the four: `slot` and `judging`, whether
 * each is empty after them; `ready`, whether the branch is `ready` after
 * them; `ended`, a publication that they take out of `queued`; and `opens`,
 * a publication that the entry opens as `queued`. Absent: as the state has
 * it. It gives the publication to judge, or null when no `judge` is opened.
 */
function nextJudge(state: Pick<StateView, "page">, after: { slot?: boolean; judging?: boolean; ready?: boolean; ended?: number; opens?: number } = {}): number | null {
  const branch = branchOf(state);
  if (!branch) return null;
  const empty = (slot: "slot" | "judging") => after[slot] ?? (branch.refs[slot] ?? null) === null;
  if (!empty("slot") || !empty("judging") || !(after.ready ?? branch.state === "ready")) return null;
  // The lowest ID of those that are still `queued`: one more than the one that the entry ends is enough to read.
  const queued = state.page("publication", ["queued"], null, 2).items.find((item) => item.id !== after.ended);
  return queued?.id ?? after.opens ?? null;
}

/** The position of the entry that opened an operation: the first part of its ID (the contract's section 4.3, item 1). */
const seqOf = (id: OperationId): number => Number(id.slice(0, id.indexOf(":")));

/** The operations that the entry at that position opened, in the order of their records there. Their IDs are that position and an ordinal from 0. */
function openedIn(state: Pick<StateView, "operation">, seq: number): Operation[] {
  const found: Operation[] = [];
  for (let k = 0; ; k += 1) {
    const operation = state.operation(`${seq}:${k}` as OperationId);
    if (!operation) return found;
    found.push(operation);
  }
}

/** The publication with that item ID, or none. */
const publicationAt = (state: Pick<StateView, "item">, id: unknown): Item | null => {
  const item = typeof id === "number" ? state.item(id) : null;
  return item?.type === "publication" ? item : null;
};

/** This scope's own entry at a position before the one that is written. A rule that needs one and is given none has a fault: nothing is judged from a history that is not at hand. */
const ownEntry = (own: Own, seq: number) => {
  const kept = own(seq);
  if (!kept) throw new Error(`this scope's own entry ${seq} is not at hand`);
  return kept.entry;
};

/**
 * The operations of one kind of write that were opened for a publication,
 * in the order of their opening (section 12.1.5, "What an operation is
 * for"; entry ER6). No slot lists them, and the folded state gives an
 * operation by its ID alone. So they are found from the entries that open
 * one: the entry at `reservedAt`, whose outcome of `judge` opened the first
 * push; an act `resend` on the publication; and the entry that made it
 * `published`, which opened the first receipt. The search reads this
 * scope's own entries from `reservedAt` to the entry that is written (I3
 * deltas, entry FA5).
 */
function writesOf(state: Pick<StateView, "operation">, own: Own, publication: Item, kind: "push" | "receipt", before: number): Operation[] {
  const from = publication.values["reservedAt"];
  if (typeof from !== "number") return [];
  const found: Operation[] = [];
  for (let seq = from; seq < before; seq += 1) {
    const { input, effects } = ownEntry(own, seq);
    const about = seq === from
      || (input.type === "act" && input.signed.intent.kind === "resend" && input.signed.intent.on === publication.id)
      || effects.some((effect) => effect.effect === "state" && effect.item === publication.id && effect.state === "published");
    if (about) found.push(...openedIn(state, seq).filter((operation) => operation.owner === DESTINATION && operation.kind === kind));
  }
  return found;
}

/** An operation that this entry opens, at its ordinal among the operations of the entry, with its attempt 1 (the contract's section 4.3, items 1 and 2). */
const opened = (k: number, kind: string, attempts: number): RuleEffect[] => [
  { effect: "operation", k, owner: DESTINATION, kind, attempts },
  { effect: "attempt", operation: { k }, attempt: 1, result: "opened", selected: null },
];

const isObject = (value: unknown): value is Record<string, FieldValue> => typeof value === "object" && value !== null && !Array.isArray(value);
/** True when the record has each required member, no member that is not named, and each member that it has is of its kind. */
const record = (value: unknown, required: Readonly<Record<string, (member: unknown) => boolean>>, optional: Readonly<Record<string, (member: unknown) => boolean>> = {}): boolean =>
  isObject(value) && Object.keys(required).every((name) => Object.hasOwn(value, name)) && Object.entries(value).every(([name, member]) => (required[name] ?? optional[name])?.(member) === true);
const oneOf = (names: readonly string[]) => (value: unknown): boolean => typeof value === "string" && names.includes(value);

/** The name of one extent, as a verdict states it: lowercase letters, digits and hyphens, at most 64 bytes (section 12.1.4a, "The exact text of `reason`"). */
const isExtentName = (value: unknown): boolean => typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);

/**
 * One record of each `collect` list of a `reserve`, as the lane's `merge`
 * row sends it (R2 section 4.2; the eligibility statement of section 6.3).
 * An item of the lane is named by the fact of the entry that opened it,
 * which is how a send carries a local item. A job that is `requested` has
 * no deciding entry, so `decidedBy` may be absent. A verdict may state the
 * one extent that it counts for (the lane forms' revision 15; section
 * 12.1.4a, "Which reviews count for an extent"). The pinned lane of today
 * sends none.
 */
const COLLECTED_RECORD: Readonly<Record<keyof typeof COLLECT_MOST, (value: unknown) => boolean>> = {
  verdicts: (value) => record(value, { review: isFactRef, reviewer: isMemberRef, verdict: oneOf(["approve", "request-changes"]) }, { extent: isExtentName }),
  jobs: (value) => record(value, { job: isFactRef, name: (name) => typeof name === "string" && utf8(name).length <= 128, state: oneOf(["requested", "passed", "failed", "errored", "timed-out"]) }, { decidedBy: isFactRef }),
  links: (value) => record(value, { link: isFactRef, issue: (issue) => isScopeRef(issue) && issue.kind === "lane" }),
};

// ---------------------------------------------------------------- what an operation is for

/** A write: an operation of the kind `first-head`, `push` or `receipt` (section 12.1.5, "The kinds of operation"). */
const WRITES: readonly string[] = [DESTINATION_KINDS.firstHead, DESTINATION_KINDS.push, DESTINATION_KINDS.receipt];
const ours = (operation: Operation, ...kinds: readonly string[]): boolean => operation.owner === DESTINATION && kinds.includes(operation.kind);
/** An operation that the outcome entry opens. The ledger numbers it and opens its attempt 1. */
const opening = (kind: string, attempts: number): Opening => ({ owner: DESTINATION, kind, attempts });
/** The body of an outcome's evidence, when it is a record with exactly those members. */
const bodyOf = (body: unknown, names: readonly string[]): Record<string, FieldValue> | null =>
  (isObject(body) && Object.keys(body).length === names.length && names.every((name) => Object.hasOwn(body, name)) ? body : null);

/**
 * The `mint` operation of one attempt of a write (section 12.1.5, "What an
 * operation is for", the row `mint`; entry ER6). The entry that opens an
 * attempt of a write opens one `mint` with it: with attempt 1, the entry
 * that opens the operation; with attempt n + 1, the outcome entry of
 * attempt n. An entry opens at most one attempt of a write, so it opens at
 * most one `mint`.
 */
function mintOf(state: Pick<StateView, "operation">, write: Operation, attempt: number): Operation | null {
  const at = attempt === 1 ? seqOf(write.id) : write.attempts[attempt - 1]?.opened;
  return at === undefined ? null : openedIn(state, at).find((operation) => ours(operation, DESTINATION_KINDS.mint)) ?? null;
}

/** The attempt of a write that a `mint` serves: the same row, read from the mint. Null: the entry that opened the mint opened no attempt of a write. */
function servedBy(state: Pick<StateView, "operation">, own: Own, mint: Operation): { write: Operation; attempt: number } | null {
  const seq = seqOf(mint.id);
  const here = openedIn(state, seq).find((operation) => ours(operation, ...WRITES));
  if (here) return { write: here, attempt: 1 };
  const input = ownEntry(own, seq).input;
  const write = input.type === "outcome" ? state.operation(input.operation) : null;
  return input.type === "outcome" && write && ours(write, ...WRITES) && write.attempts[input.attempt]?.opened === seq ? { write, attempt: input.attempt + 1 } : null;
}

/**
 * The item that a write is for (the rows `first-head`, `push` and
 * `receipt` of the same table): the branch, for a first head; the
 * publication that the opening entry made `reserved`, or `published`, or
 * that the act `resend` is on. Null: the receipt of the first head, which
 * is for no item.
 */
function subjectOf(state: Pick<StateView, "item" | "page">, own: Own, write: Operation): Item | null {
  if (write.kind === DESTINATION_KINDS.firstHead) return branchOf(state);
  const { input, effects } = ownEntry(own, seqOf(write.id));
  if (input.type === "act") return publicationAt(state, input.signed.intent.on);
  const made = write.kind === DESTINATION_KINDS.push ? "reserved" : "published";
  const change = effects.find((effect) => effect.effect === "state" && effect.state === made);
  return change?.effect === "state" ? publicationAt(state, change.item) : null;
}

/**
 * The `mint` whose token a `revoke` operation revokes (the row `revoke` of
 * the same table): "the token of the mint that the slot `token` named
 * before the entry, or of the mint whose outcome the entry is". It is read
 * from the entry that opened the revocation.
 *
 * - The outcome entry of a mint: that mint.
 * - The first outcome entry of a write attempt: the mint of that attempt,
 *   which the slot named.
 * - The entry of `compromised`: the mint that the last entry before it
 *   wrote into the publication's slot `token`. The search reads this
 *   scope's own entries back to `reservedAt` (I3 deltas, entry FA5).
 */
function mintRevoked(state: Pick<StateView, "operation" | "item">, own: Own, revoke: Operation): Operation | null {
  const seq = seqOf(revoke.id);
  const { input, effects } = ownEntry(own, seq);
  if (input.type === "outcome") {
    const of = state.operation(input.operation);
    if (of && ours(of, DESTINATION_KINDS.mint)) return of;
    return of && ours(of, ...WRITES) ? mintOf(state, of, input.attempt) : null;
  }
  const emptied = effects.find((effect) => effect.effect === "value" && effect.slot === "token" && effect.value === null);
  const publication = emptied?.effect === "value" ? publicationAt(state, emptied.item) : null;
  const from = publication?.values["reservedAt"];
  if (!publication || typeof from !== "number") return null;
  for (let at = seq - 1; at >= from; at -= 1) {
    const set = ownEntry(own, at).effects.find((effect) => effect.effect === "value" && effect.item === publication.id && effect.slot === "token");
    if (set?.effect === "value") return typeof set.value === "string" ? state.operation(set.value as OperationId) : null;
  }
  return null;
}

/**
 * The context of the request of a revocation: the host's ID of the
 * credential that it revokes. It is the `token` of the body of the
 * `confirmed` outcome of the revocation's mint, read from this scope's own
 * entries and from nothing else. The rule `revoke` checks the body of each
 * outcome against it, and states it as the body of an outcome that is not
 * known. A port that sends the request reads the same function, so the
 * request, the evidence check and the body of an `unknown` outcome name
 * one ID (authority note, revision 26, "What revision 26 changes for the
 * I3 source", the row on the body of an outcome's evidence). Null: the
 * mint has no `confirmed` outcome, and then no outcome of the revocation
 * is well formed.
 */
export function revokedToken(state: Pick<StateView, "operation" | "item">, own: Own, revoke: Operation): string | null {
  const mint = mintRevoked(state, own, revoke);
  const confirmed = mint?.attempts[0]?.outcomes.find((outcome) => outcome.result === "confirmed");
  const input = confirmed ? ownEntry(own, confirmed.seq).input : null;
  const token = input?.type === "outcome" ? bodyOf(input.evidence.body, ["token", "ends"])?.["token"] : null;
  return typeof token === "string" ? token : null;
}

// ---------------------------------------------------------------- what an outcome decides

/**
 * The request of the send mark `publication-update` (rows m and n; section
 * 12.1.5, "The send `publication-update`"): one `relate`, named
 * `publication`, to the publication's `lane`, of the publication item. Its
 * relationship state is the publication's state, as the written update of
 * a `withdraw` has it. Its detail is `operation`, `outcome`, `commit`,
 * `reason` and `rules`.
 *
 * `rules` is the revision of the rules that the destination observed for
 * the reservation (section 12.1.4a, "`rules` in the update"). It is read
 * from the reservation's retained observation. An entry that retains none
 * gives none, and the update then holds no member `rules` (I3 deltas,
 * entry FA8).
 */
interface Update { publication: Item; state: string; outcome: "committed" | "unknown" | "published" | "refused" | "aborted"; commit?: string; reason?: string; rules?: number | null }

/** What the rule of an outcome yields: the effects, the operations that the entry opens, and the update, when the table says "the update". */
interface Decided { effects: readonly RuleEffect[]; opens: readonly Opening[]; update: Update | null }
const NOTHING: Decided = { effects: [], opens: [], update: null };
type Decides = (given: RuleGiven, operation: Operation) => Decided;

/** The revision of the rules in the retained observations of one of this scope's own entries, or null. */
const rulesObserved = (own: Own, at: unknown): number | null => {
  const input = typeof at === "number" ? ownEntry(own, at).input : null;
  const observed = input?.type === "outcome" ? (input.observed ?? []).map((use) => use.observation).find((observation) => "subject" in observation && observation.subject === "rules") : undefined;
  return observed && "revision" in observed ? observed.revision : null;
};

function updateRequest({ own, resolved }: RuleGiven, update: Update): RuleRequest {
  const { publication, state, outcome, commit, reason } = update;
  const [lane, operation] = [publication.refs["lane"], publication.refs["operation"]];
  if (!isScopeRef(lane) || !isFactRef(operation) || publication.opened === null) throw new Error("an update is of a publication that holds its lane and its operation");
  const rules = update.rules === undefined ? rulesObserved(own, publication.values["reservedAt"]) : update.rules;
  const detail: Record<string, FieldValue> = { operation: operation as FactRef & FieldValue, outcome, ...(commit === undefined ? {} : { commit }), ...(reason === undefined ? {} : { reason }), ...(rules === null ? {} : { rules }) };
  return { to: lane, message: { class: "request", type: "relate", body: { name: "publication", item: { at: resolved.at, seq: publication.id, hash: publication.opened }, state, detail } } };
}

/** "The next `judge`", as an outcome's rule yields it: the reference `branch.judging` and the operation. `emptied`: the entry empties `judging`, so it is emptied where no `judge` follows. */
function andNext(state: Pick<StateView, "page">, after: Parameters<typeof nextJudge>[1], emptied = false): Pick<Decided, "effects" | "opens"> {
  const [branch, publication] = [branchOf(state), nextJudge(state, after)];
  if (!branch) throw new Error("a destination holds its branch item");
  if (publication === null) return { effects: emptied ? [{ effect: "ref", item: branch.id, slot: "judging", to: null }] : [], opens: [] };
  return { effects: [{ effect: "ref", item: branch.id, slot: "judging", to: publication }], opens: [opening(DESTINATION_KINDS.judge, DESTINATION_ATTEMPTS.judge)] };
}

/** One attempt of a push, as the outcome entry that is written leaves it: the operation, the attempt, the result, and whether the ledger opens the next attempt in the entry. */
interface PushAt { push: Operation; attempt: number; result: "confirmed" | "refused" | "unknown"; next: boolean }

/**
 * "Every attempt of every push operation of this publication has a
 * `refused` outcome", with the outcome that is being written counted. Then
 * no attempt is open, and nothing that was sent can still land (section
 * 6.8).
 */
function everyRefused({ state, own, resolved }: RuleGiven, publication: Item, at: PushAt | null): boolean {
  const refused = (push: Operation, attempt: Operation["attempts"][number]) =>
    attempt.outcomes.some((outcome) => outcome.result === "refused") || (at !== null && push.id === at.push.id && attempt.attempt === at.attempt && at.result === "refused");
  return writesOf(state, own, publication, "push", resolved.self).every((push) => push.attempts.every((attempt) => refused(push, attempt)));
}

/**
 * "What `seen` decides for a push" (section 12.1.5). The rule runs this
 * table in every outcome entry of a push attempt, the first and a late
 * answer alike, and in the outcome of a `read` of the branch. `at`: the
 * attempt, in an outcome of a push; null, in an outcome of a read. Where
 * the publication does not hold the slot it is final, and nothing follows.
 *
 * `seen` is what the ref held when it was read: a commit ID; the text
 * `absent`; or the text `failed`, when the read did not finish.
 */
function seenDecides(given: RuleGiven, publication: Item, seen: unknown, at: PushAt | null): Decided {
  const { state } = given;
  const branch = branchOf(state);
  if (!branch) throw new Error("a destination holds its branch item");
  if (!HELD.includes(publication.state)) return NOTHING;
  const [base, integration, id] = [branch.values["head"], publication.values["integration"], publication.id];
  /** `{ state: "unresolved" }`, when the state was another, with the update `unknown`. */
  const unresolved = (opens: readonly Opening[]): Decided => (publication.state === "unresolved"
    ? { effects: [], opens, update: null }
    : { effects: [{ effect: "state", item: id, state: "unresolved" }], opens, update: { publication, state: "unresolved", outcome: "unknown" } });

  // The publication's `integration`: `published`.
  if (isObjectId(seen) && seen === integration) {
    const next = andNext(state, { slot: true });
    return {
      effects: [
        { effect: "state", item: id, state: "published" }, { effect: "ref", item: branch.id, slot: "slot", to: null }, { effect: "value", item: branch.id, slot: "head", value: seen },
        { effect: "value", item: id, slot: "receipt", value: "owed" }, ...next.effects,
      ],
      opens: [opening(DESTINATION_KINDS.receipt, DESTINATION_ATTEMPTS.receipt), opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint), ...next.opens],
      update: { publication, state: "published", outcome: "published", commit: seen },
    };
  }
  if (isObjectId(seen) && seen === base) {
    // The base, and the ledger opens a further attempt in this entry: `unresolved`, and the `mint` of attempt n + 1.
    if (at?.next) return unresolved([opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint)]);
    // The base; no attempt is open; and every attempt has a `refused` outcome: `aborted`.
    if (everyRefused(given, publication, at)) {
      const [compromised, next] = [publication.values["aborting"] === true, andNext(state, { slot: true })];
      const reason = compromised ? "compromised" : "host-refused";
      return {
        effects: [{ effect: "state", item: id, state: "aborted" }, { effect: "ref", item: branch.id, slot: "slot", to: null }, { effect: "value", item: id, slot: "reason", value: reason }, ...next.effects],
        opens: next.opens,
        update: { publication, state: "aborted", outcome: compromised ? "aborted" : "refused", reason },
      };
    }
  }
  // The base, otherwise: not provable. `failed`: nothing is decided. The slot stays held. In an outcome of a push, a `read` of the
  // branch is opened, where no attempt of that push is open after this entry (section 12.1.5, "The deciding read").
  if (seen === "failed" || (isObjectId(seen) && seen === base)) {
    const open = at !== null && at.push.attempts.some((attempt) => attempt.attempt !== at.attempt && attempt.outcomes.length === 0);
    return unresolved(at !== null && !open ? [opening(DESTINATION_KINDS.read, DESTINATION_ATTEMPTS.read)] : []);
  }
  // Any other commit, or a ref that is absent: another writer (section 6.9). The slot stays held. No attempt and no read is opened.
  return unresolved([]);
}

/** The publication of a push, and whether its rule allows another attempt: only when `seen` is the base and `aborting` is not set (section 12.1.5, "Whether another attempt of a push is allowed"). */
function pushOf({ state, own, input }: RuleGiven, push: Operation): { publication: Item; seen: unknown; allows: boolean } {
  const publication = subjectOf(state, own, push);
  if (input.type !== "outcome" || publication?.type !== "publication") throw new Error("a push is of one publication");
  const seen = isObject(input.evidence.body) ? input.evidence.body["seen"] : null;
  return { publication, seen, allows: isObjectId(seen) && seen === branchOf(state)?.values["head"] && publication.values["aborting"] !== true };
}

/**
 * The outcome entry of one attempt of a push (the row `push` of "What each
 * rule of an outcome yields"). First, in the first outcome of an attempt:
 * when the slot `token` names its mint, the token's `revoke` and its
 * attempt 1, and `token` emptied. Then the table of `seenDecides`.
 *
 * Where the publication is final when the first outcome of an attempt
 * comes, the slot cannot be emptied: no effect changes an item that was
 * final before the entry. The revocation is still opened. No other entry
 * opens one for that token: a mint sets the slot only on a publication
 * that holds the branch's slot, and `abort-if-behind` acts only on one (I3
 * deltas, entry FA6).
 */
const pushDecides: Decides = (given, push) => {
  const { state, input } = given;
  const { publication, seen, allows } = pushOf(given, push);
  if (input.type !== "outcome") throw new Error("a push is judged in its outcome entry");
  const attempt = push.attempts.find((opened) => opened.attempt === input.attempt);
  const mint = mintOf(state, push, input.attempt);
  const revokes = attempt?.outcomes.length === 0 && mint !== null && publication.values["token"] === mint.id;
  // The ledger's own conditions for attempt n + 1, made again on the same state (the contract's section 4.3, item 2).
  const next = input.result !== "confirmed" && input.attempt === push.attempts.length && push.attempts.length < push.most && push.selected === null && allows;
  const table = seenDecides(given, publication, seen, { push, attempt: input.attempt, result: input.result, next });
  return {
    effects: [...(revokes && HELD.includes(publication.state) ? [{ effect: "value", item: publication.id, slot: "token", value: null } as const] : []), ...table.effects],
    opens: [...(revokes ? [opening(DESTINATION_KINDS.revoke, DESTINATION_ATTEMPTS.revoke)] : []), ...table.opens],
    update: table.update,
  };
};

/**
 * What a `read` is for (the row `read` of "What an operation is for"): the
 * ref of the write after which it was opened, or the branch, for the
 * publication that `abort-if-behind` set `aborting`. It is read from the
 * entry that opened the read.
 */
function readFor(state: Pick<StateView, "operation" | "item" | "page">, own: Own, read: Operation): Item | "first-head" | "receipt" | null {
  const { input, effects } = ownEntry(own, seqOf(read.id));
  if (input.type === "delivery") {
    const set = effects.find((effect) => effect.effect === "value" && effect.slot === "aborting" && effect.value === true);
    return set?.effect === "value" ? publicationAt(state, set.item) : null;
  }
  const of = input.type === "outcome" ? state.operation(input.operation) : null;
  if (!of || !ours(of, ...WRITES)) return null;
  return of.kind === DESTINATION_KINDS.push ? subjectOf(state, own, of) : (of.kind as "first-head" | "receipt");
}

/**
 * The outcome of a `read` of the branch, where its opening entry is of a
 * push or of `compromised`: the same table as a push. A read never settles
 * an attempt: what it saw moves the publication's state, the branch's head
 * and the slot, and gives no attempt an outcome.
 */
const readDecides: Decides = (given, read) => {
  const [of, seen] = [readFor(given.state, given.own, read), given.input.type === "outcome" && isObject(given.input.evidence.body) ? given.input.evidence.body["seen"] : null];
  // I3 merge: the read of a first head and of a receipt's ref is judged by the rows `first-head` and `receipt`, which wait (entry ER9).
  if (of === null || typeof of === "string") throw new Error("the read of a first head, or of a receipt's ref, waits for the rules first-head and receipt");
  return seenDecides(given, of, seen, null);
};

/**
 * What the entries in `uses` say for the reservation of one publication:
 * the last row of the table "The rule reads" (section 12.1.5), but for the
 * key that signed P's `merge` entry, which the rule reads itself. It is the
 * manifest's entry, each verdict's entry, and the opening and the deciding
 * entry of each required check, read as a lane's entries. A key is named
 * by its ID: the rule reads each observation itself, through the judge.
 */
export interface LaneRead {
  /** As `ReservationRead.manifest`. */
  manifest: ReservationRead["manifest"];
  /** One for each verdict of the statement, in its order: whether its entry is that verdict, and the key that signed it. Null: no entry says. */
  verdicts: readonly { sound: boolean; key: KeyId | null }[];
  /** For a check, by its name: as `ReservationRead.checks`, with the key that signed the deciding entry. */
  checks: Readonly<Record<string, { opening: "sound" | "other-configuration" | "unsound"; deciding: boolean; key: KeyId | null }>>;
}

/** The reader of a lane's entries for one reservation. Null: they are not at hand, or no reader is written. */
export type Reads = (given: RuleGiven, publication: Item, statement: Statement) => LaneRead | null;

// I3 merge: no text states how an entry of a lane is read by its bytes: which field of a `propose-manifest` intent is the base, how
// the authors of section 3.10 and the completeness of R2's section 5.2 are read, and which entry is a verdict's (I3 deltas, entries
// FA9 and FC5). So the package's own rule `judge` is given no reader of them. It then judges what the evidence and this scope's
// own records decide, and writes nothing for the rest: the outcome stays offered, the publication stays `queued`, and
// `branch.judging` stays set. What the rule reads of `observed` it reads itself, below.
const NOT_AT_HAND: Reads = () => null;

/**
 * What `observed` and the entries in `uses` say for one reservation
 * (`ReservationRead`), as the rule `judge` reads it (section 12.1.5, the
 * table "The rule reads"). The judge of the outcome gives the rule both
 * (the contract's section 6.1, items 2 and 4), and the entry retains each
 * observation that is read here.
 *
 * - The merger's key is the key that signed P's `merge` entry: the entry
 *   that the publication's `operation` names, in `uses`. Its `Observation`
 *   is read by that key.
 * - One `RulesObservation`, asked as "rules". The declaration of the
 *   single-controller exception is its member (the missing form 14, which
 *   is given).
 * - The `Observation` of the key behind each approval, and behind the
 *   deciding result of each check that the observed rules require. A key
 *   whose observation is not at hand gives null, and its verdict or its
 *   result is then not counted.
 *
 * **Three inputs are filled with the value that fails closed**, because no
 * form supplies them (I3 deltas, entry FC5): `extents`, null, since a
 * `RulesContent` has no such member (the contract's part of the missing
 * form 2); `controllers`, null (the missing form 11); and
 * `controllersOfAuthors`, null (the missing form 15).
 *
 * Null: the lane's entries are not read, or the `merge` entry is not at
 * hand. The rule then has a fault, and nothing is written.
 */
function reservationRead(given: RuleGiven, publication: Item, statement: Statement, lane: LaneRead | null): ReservationRead | null {
  const operation = publication.refs["operation"];
  const merge = isFactRef(operation) ? given.uses.find((used) => used.fact.hash === operation.hash)?.entry : undefined;
  if (lane === null || merge?.input.type !== "act") return null;
  /** The observation of one key, as the entry will retain it. An observation of a key has no member `subject`. */
  const keyOf = (key: KeyId | null): Observation | null => {
    const seen = key === null ? null : given.observed({ key })?.observation;
    return seen && !("subject" in seen) ? seen : null;
  };
  const seen = given.observed({ asked: "rules" })?.observation;
  const rules = seen && "subject" in seen && seen.subject === "rules" ? seen : null;
  const required = rules?.content.asked === "rules" ? rules.content.checks.filter((check) => check.required).map((check) => check.name) : [];
  return {
    merger: keyOf(merge.input.signed.intent.actor), rules,
    extents: null, singleControllerException: rules?.content.asked === "rules" && rules.content.singleControllerException === true,
    manifest: lane.manifest, controllersOfAuthors: null, controllers: null,
    // Only an approval is counted, and only a required check's result decides: no other key is read, so no other is retained.
    verdicts: statement.verdicts.map((verdict, n) => ({ sound: lane.verdicts[n]?.sound === true, key: verdict.verdict === "approve" ? keyOf(lane.verdicts[n]?.key ?? null) : null })),
    checks: Object.fromEntries(Object.entries(lane.checks).map(([name, check]) => [name, { opening: check.opening, deciding: check.deciding, key: required.includes(name) ? keyOf(check.key) : null }])),
  };
}

/** The eligibility statement of a publication: the three lists of its `reserve`, in this scope's own entry that recorded the message and opened the item. The rule `collect-list` checked each record when it was delivered. */
function statementOf(own: Own, publication: Item): Statement {
  const input = ownEntry(own, publication.id).input;
  const body = input.type === "delivery" && input.message.class === "request" && isObject(input.message.body) ? input.message.body : null;
  const fields = body !== null && body["message"] === "reserve" && isObject(body["fields"]) ? body["fields"] : null;
  if (fields === null) throw new Error("a queued publication was opened by the delivery of its reserve");
  return { verdicts: fields["verdicts"], jobs: fields["jobs"], links: fields["links"] } as unknown as Statement;
}

/**
 * The outcome of `judge` (row 33; the row `judge` of "What each rule of an
 * outcome yields"). It is for the publication that `branch.judging` names.
 *
 * - The publication is not `queued`, because a `withdraw` ended it while
 *   its `judge` was open: nothing of it changes and nothing is sent.
 *   `judging` is emptied, and the next `judge` is opened.
 * - Not reserved: `not-reserved`, with `reason`; `judging` emptied; the next
 *   `judge`; and the update `refused`.
 * - Reserved: `reserved`; `branch.slot`; `judging` emptied; `integration`;
 *   `reservedAt`, which is this entry's position; `reason`, when the
 *   exception was used; the `push` operation with 3 attempts, its attempt
 *   1, and that attempt's `mint`; and the update `committed`.
 */
const judgeDecides = (reads: Reads): Decides => (given) => {
  const { state, own, input, resolved, time } = given;
  const branch = branchOf(state);
  const publication = publicationAt(state, branch?.refs["judging"]);
  if (!branch || !publication || input.type !== "outcome") throw new Error("a judge is of the publication that branch.judging names");
  if (publication.state !== "queued") return { ...andNext(state, { judging: true }, true), update: null };
  const evidence = input.evidence.body;
  if (!isJudgeEvidence(evidence)) throw new Error("the evidence of a judge is not well formed");
  const head = branch.values["head"];
  const asked = { recorded: typeof head === "string" ? head : null, evidence, statement: statementOf(own, publication), time };
  // First from the evidence and this scope's own records. Only where that does not decide are `observed` and `uses` read.
  let [read, judged] = [null as ReservationRead | null, judgeReservation({ ...asked, read: null })];
  if (judged.reserved === null) {
    read = reservationRead(given, publication, asked.statement, reads(given, publication, asked.statement));
    judged = judgeReservation({ ...asked, read });
  }
  if (judged.reserved === null) throw new Error("what observed and uses say of this reservation is not at hand");
  const rules = read?.rules?.revision ?? null;
  if (!judged.reserved) {
    const next = andNext(state, { judging: true, ended: publication.id }, true);
    return {
      effects: [{ effect: "state", item: publication.id, state: "not-reserved" }, { effect: "value", item: publication.id, slot: "reason", value: judged.reason }, ...next.effects],
      opens: next.opens,
      update: { publication, state: "not-reserved", outcome: "refused", reason: judged.reason, rules },
    };
  }
  return {
    effects: [
      { effect: "state", item: publication.id, state: "reserved" }, { effect: "ref", item: branch.id, slot: "slot", to: publication.id }, { effect: "ref", item: branch.id, slot: "judging", to: null },
      { effect: "value", item: publication.id, slot: "integration", value: judged.integration }, { effect: "value", item: publication.id, slot: "reservedAt", value: resolved.self },
      ...(judged.reason === null ? [] : [{ effect: "value", item: publication.id, slot: "reason", value: judged.reason } as const]),
    ],
    opens: [opening(DESTINATION_KINDS.push, DESTINATION_ATTEMPTS.push), opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint)],
    update: { publication, state: "reserved", outcome: "committed", ...(judged.reason === null ? {} : { reason: judged.reason }), rules },
  };
};

/** What the rule of each kind decides for the outcome entry that is written, for the send mark that its kind holds. `judge` is added with its reader. */
const DECIDES: Readonly<Record<string, Decides>> = { [DESTINATION_KINDS.push]: pushDecides, [DESTINATION_KINDS.read]: readDecides };

/**
 * Row 33, the outcome entries of `judge` (P19; section 12.1.5, "The rule
 * `open-judge`, and one `judge` at a time", and "The evidence of `judge`,
 * and what the rule reads"; entries ER2 and ER8).
 *
 * - A `judge` writes nothing outside the service, and has 1 attempt. Its
 *   one outcome is `confirmed`, with its evidence. An outcome that is
 *   offered as `refused` or `unknown` is `bad-input`. When a read of the
 *   host fails, the runtime reads again under the same attempt.
 * - It judges time, by the ten seconds of the merger's observation, and is
 *   never written clamped.
 * - `most`: 10 effects, with the operations `push` and `mint`, for the
 *   outcome that reserves.
 *
 * The judgment is `judgeReservation`, and what the outcome yields is
 * `judgeDecides`. The rule reads `observed` itself (`reservationRead`).
 * `reads` gives what the lane's entries in `uses` say. The package's own
 * rule is given none (`NOT_AT_HAND`).
 */
const judgeRule = (decides: Decides): PlatformRule => ({
  place: "outcome", clock: true,
  rules: {
    selects: false, read: false, covered: true, most: { effects: 10, requests: 1, operations: 2 },
    retries: () => false,
    wellFormed: (result, evidence) => result === "confirmed" && isJudgeEvidence(evidence.body),
    derives: (given, judge) => { const { effects, opens } = decides(given, judge); return { effects, sends: [], opens }; },
  },
});

/**
 * Rows m and n, the `send` of the mark of an outcome's kind (P16): the one
 * `relate`, `publication`, to the lane. Its clauses are empty. One rule
 * stands at each kind. It gives the update only where the rule of the kind
 * says "the update": it makes that rule's judgment again, on the same
 * state and the same outcome, as every rule reads the state before its
 * entry. No update is sent for `publishing`, so the kinds `mint`, `revoke`
 * and `receipt` give none.
 */
const updateRule = (decides: Readonly<Record<string, Decides>>): PlatformRule => ({
  place: "send",
  run: (given) => {
    const operation = given.input.type === "outcome" ? given.state.operation(given.input.operation) : null;
    if (!operation) throw new Error("publication-update stands at the kind of an outcome");
    const update = Object.hasOwn(decides, operation.kind) ? decides[operation.kind]!(given, operation).update : null;
    return update === null ? null : updateRequest(given, update);
  },
});

/** The body of an outcome of a write: `{ send, seen }`, with a `send` that fits the result (section 12.1.5, "The evidence of a write"). */
const SENDS: Readonly<Record<string, readonly string[]>> = { confirmed: ["accepted"], refused: ["refused", "not-sent"], unknown: ["unknown"] };
const isSeen = (seen: unknown): boolean => seen === "absent" || seen === "failed" || isObjectId(seen);

// ---------------------------------------------------------------- the rules

/**
 * The rules of `platform:destination@1` that are written, by the name that
 * a mark states (section 12.1.8, the table of marks), but for `judge` and
 * `publication-update`, which are made with a reader (below). Each is a
 * pure function of what a rule is given. One refuses: the guard
 * `resend-due`.
 */
const WRITTEN: Rules = {
  /**
   * Row 30, among the effects of `establish` (P16). It reads the creation's
   * `import`. When it is false: two `operation` effects, held, with no
   * attempt: `first-head`, and the `mint` of its attempt 1 (section 12.1.5,
   * "Who opens the mint"; entry ER7). The entry that records the `confirm`
   * opens attempt 1 of both, by the contract's own rule (its section 4.3,
   * item 1). With an import the first head is the imported history's, and
   * `import` opens the write.
   */
  "declare-first-head": {
    place: "effect", most: 2,
    run: ({ resolved }) => (resolved.fields["import"] === false ? [
      { effect: "operation", k: 0, owner: DESTINATION, kind: DESTINATION_KINDS.firstHead, attempts: DESTINATION_ATTEMPTS.firstHead },
      { effect: "operation", k: 1, owner: DESTINATION, kind: DESTINATION_KINDS.mint, attempts: DESTINATION_ATTEMPTS.mint },
    ] : []),
  },
  /**
   * Row 31, among the effects of `import` (P16). It reads the update's
   * state and `commit`. On `done`: an `operation` effect, `first-head`, its
   * attempt 1, and that attempt's `mint` with its attempt 1 (entry ER7). On
   * `failed`, and on any other state: nothing. A `done` that names no
   * commit names no first head, and opens nothing.
   */
  "open-first-head": {
    place: "effect", most: 4,
    run: ({ input, resolved }) => {
      if (input.type !== "delivery" || input.message.class !== "request" || input.message.type !== "relate") throw new Error("open-first-head stands in a `relate` handler, and reads its update");
      const state = isObject(input.message.body) ? input.message.body["state"] : null;
      return state === "done" && typeof resolved.fields["commit"] === "string" ? [...opened(0, DESTINATION_KINDS.firstHead, DESTINATION_ATTEMPTS.firstHead), ...opened(1, DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint)] : [];
    },
  },
  /**
   * Row 32, among the effects of `reserve` (P16), as revision 25 changed it
   * (entry ER2). It runs "The next `judge`": when the slot is empty, no
   * `judge` is open and the branch is `ready`, an `operation` effect,
   * `judge`, its attempt 1, and the reference `branch.judging`, set to the
   * `queued` publication with the lowest item ID. That is the one that this
   * entry opens when no other is `queued`. While a `judge` is open a
   * further `reserve` opens none: the slot stays empty until the outcome of
   * `judge`, and `judging` is what closes that. Before the branch has a
   * head nothing is judged (section 12.2; case b).
   */
  "open-judge": {
    place: "effect", most: 3,
    run: ({ state, resolved }) => {
      const [branch, publication] = [branchOf(state), nextJudge(state, { opens: resolved.self })];
      return branch && publication !== null ? [...opened(0, DESTINATION_KINDS.judge, DESTINATION_ATTEMPTS.judge), { effect: "ref", item: branch.id, slot: "judging", to: publication }] : [];
    },
  },
  /**
   * Row 34, at the name `publication` of `also` in `withdraw` (P15). It
   * reads the `publication` items. It gives the publication whose
   * `operation` is the field's, in any state, or none. It never refuses.
   */
  "publication-of": {
    place: "also",
    run: ({ state, resolved }) => {
      const operation = resolved.fields["operation"];
      if (!isFactRef(operation)) return null;
      const named = canonicalize(operation);
      for (const item of publications(state)) if (isFactRef(item.refs["operation"]) && canonicalize(item.refs["operation"]) === named) return item.id;
      return null;
    },
  },
  /**
   * Row 34, among the effects of `withdraw` (P15). When the mark of `also`
   * bound no publication: one `open`, and the publication is `not-reserved`,
   * "withdrawn", with the operation that the message names and the sending
   * lane. A later `reserve` for that operation is then refused, "withdrawn"
   * (section 6.4). The written guard `not-owner` has passed before this
   * place, so the sender is the scope that the operation's fact is in.
   */
  "open-withdrawn": {
    place: "effect", most: 5,
    run: ({ input, resolved }) => {
      if (resolved.subjects.has("also.publication")) return [];
      const operation = resolved.fields["operation"];
      if (input.type !== "delivery" || !isFactRef(operation)) throw new Error("open-withdrawn stands in the handler of `withdraw`, and reads its operation");
      const item = resolved.self;
      return [
        { effect: "open", item, type: "publication", state: "queued" },
        { effect: "ref", item, slot: "operation", to: operation as FactRef & FieldValue },
        { effect: "ref", item, slot: "lane", to: input.from.at },
        { effect: "state", item, state: "not-reserved" },
        { effect: "value", item, slot: "reason", value: "withdrawn" },
      ];
    },
  },
  /**
   * Row 35, among the effects of `compromised` (P19), as revision 25 states
   * it whole (section 12.1.5, "The rule `abort-if-behind`"; entry ER5). It
   * reads `branch.slot`; that publication, with `reservedAt`, `aborting`
   * and `token`; this scope's own entry at `reservedAt`, with its
   * `observed`; and the field `key` of the notice.
   *
   * The key is behind the publication when it is the `key` of an
   * `Observation` in the `observed` of the reservation entry: the merger's
   * key, or a key behind a counted verdict or a deciding result. When the
   * slot is held by a publication that is `reserved`, `publishing` or
   * `unresolved`, the key is behind it and `aborting` is not set, the rule
   * yields: `aborting` is true; when `token` is set, the token's `revoke`
   * operation with its attempt 1, and `token` emptied; and a `read`
   * operation of the branch, with its attempt 1. Otherwise nothing: the
   * notice is recorded and changes nothing.
   *
   * The abort is no operation. It is this entry, which sets `aborting`. The
   * rule for a further attempt of a push reads `aborting`, and the read
   * then decides (the rules `push` and `deciding-read`).
   */
  "abort-if-behind": {
    place: "effect", most: 6,
    run: ({ state, own, resolved }) => {
      const publication = publicationAt(state, branchOf(state)?.refs["slot"]);
      const [key, at] = [resolved.fields["key"], publication?.values["reservedAt"]];
      if (!publication || !HELD.includes(publication.state) || publication.values["aborting"] === true || typeof key !== "string" || typeof at !== "number") return [];
      const reserved = ownEntry(own, at).input;
      // An observation of a key has no member `subject`. One of a member, or of the rules, names no key.
      if (reserved.type !== "outcome" || !(reserved.observed ?? []).some(({ observation }) => !("subject" in observation) && observation.key === key)) return [];
      const live = (publication.values["token"] ?? null) !== null;
      return [
        { effect: "value", item: publication.id, slot: "aborting", value: true },
        ...(live ? [...opened(0, DESTINATION_KINDS.revoke, DESTINATION_ATTEMPTS.revoke), { effect: "value", item: publication.id, slot: "token", value: null } as const] : []),
        ...opened(live ? 1 : 0, DESTINATION_KINDS.read, DESTINATION_ATTEMPTS.read),
      ];
    },
  },
  /**
   * Row 36, among the effects of `adopt-head` (P16). It reads nothing more.
   * An `operation` effect: one read of the branch, and its attempt 1.
   */
  "open-branch-read": {
    place: "effect", most: 2,
    run: () => opened(0, DESTINATION_KINDS.adoptRead, DESTINATION_ATTEMPTS.adoptRead),
  },
  /**
   * Row z, the second guard of `resend` (P29; section 12.1.5, "The guard and
   * the effect of `resend`"; entry ER4). It stands after the written guard
   * on the state. It reads the publication that the act is on; its push or
   * receipt operations and their attempts, in the folded state; `aborting`;
   * and `receipt`.
   *
   * It holds for an `unresolved` publication when `aborting` is not set, and
   * every attempt that each of its push operations states is opened and has
   * an outcome. It holds for a `published` one when `receipt` is `owed`, and
   * every attempt that each of its receipt operations states is opened and
   * has an outcome. An attempt whose outcome is `unknown` has an outcome.
   * Otherwise the act is refused `resend-not-due`, under `guard-failed`.
   */
  "resend-due": {
    place: "guard", refusals: ["resend-not-due"],
    run: ({ state, own, resolved }) => {
      const publication = resolved.subjects.get("on");
      if (publication?.type !== "publication") throw new Error("resend-due stands in a row whose primary item is a publication");
      const used = (kind: "push" | "receipt"): boolean => {
        const writes = writesOf(state, own, publication, kind, resolved.self);
        return writes.length > 0 && writes.every((write) => write.attempts.length === write.most && write.attempts.every((attempt) => attempt.outcomes.length > 0));
      };
      const due = publication.state === "unresolved" ? publication.values["aborting"] !== true && used("push") : publication.state === "published" && publication.values["receipt"] === "owed" && used("receipt");
      return due ? { holds: true } : { holds: false, name: "resend-not-due" };
    },
  },
  /**
   * Row 37, among the effects of `resend` (P16), as revision 25 changed it
   * (section 12.1.5, "The guard and the effect of `resend`"; entry ER4). It
   * reads the publication's state. `unresolved`: a `push` operation with 1
   * attempt, its attempt 1 and that attempt's `mint`. `published`: a
   * `receipt` operation with 1 attempt, its attempt 1 and its `mint`. Every
   * attempt of a write has its own mint, so a `resend` opens one. In any
   * other state the written guard has refused the act before this place.
   */
  "reopen-publish": {
    place: "effect", most: 4,
    run: ({ resolved }) => {
      const publication = resolved.subjects.get("on");
      if (publication?.type !== "publication") throw new Error("reopen-publish stands in a row whose primary item is a publication");
      const kind = publication.state === "unresolved" ? DESTINATION_KINDS.push : publication.state === "published" ? DESTINATION_KINDS.receipt : null;
      return kind === null ? [] : [...opened(0, kind, DESTINATION_ATTEMPTS.resend), ...opened(1, DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint)];
    },
  },
  /**
   * Row b, the type of the fields `verdicts`, `jobs` and `links` of
   * `reserve` (P25; section 12.1.5, "The three lists of `reserve`"). A
   * `collect` list may hold more than the 32 elements of a declared list.
   * The value is of the type when it is a list of at most the number of
   * its field, and each element is one record of that list: a verdict
   * `review`, `reviewer`, `verdict` and, when it states one, `extent`; a
   * job `job`, `name`, `state` and, when something decided it,
   * `decidedBy`; a link `link`, `issue`. A record with another member, or
   * with a required one missing, and a list with more records, make the
   * message `bad-field`.
   */
  "collect-list": {
    place: "type",
    run: (_given: RuleGiven, value, of) => {
      const list = "field" in of && Object.hasOwn(COLLECT_MOST, of.field) ? (of.field as keyof typeof COLLECT_MOST) : null;
      return list !== null && Array.isArray(value) && value.length <= COLLECT_MOST[list] && value.every(COLLECTED_RECORD[list]);
    },
  },
  /**
   * Row e, the outcome entries of a `mint` (P16; section 12.1.5, "Who opens
   * the mint, the revocation and the deciding read of each attempt", and the
   * row `mint` of "What each rule of an outcome yields"; entry ER7). It
   * reads the opening entry; the attempt that it serves; `aborting`; and
   * the slot `token`.
   *
   * - `confirmed`, and the attempt has no outcome, and the publication is
   *   not `aborting`: the slot `token` is this operation's ID, and a
   *   publication that is `reserved` becomes `publishing`.
   * - `confirmed` otherwise: the token's `revoke` operation and its attempt
   *   1. That is a token that arrived too late to be used.
   * - `refused` or `unknown`: nothing. The request of the write attempt is
   *   then not sent (the rule `push`, `ready`).
   *
   * The body of a `confirmed` outcome is `{ token, ends }`: the host's ID of
   * the credential, a text of at most 256 bytes, and the time at which it
   * ends. Never the secret. Of a `refused` or an `unknown` one it is an
   * empty record. A mint has 1 attempt.
   *
   * **A mint of a receipt's attempt is never live** (I3 deltas, entry FA6).
   * The slot `token` of a receipt's attempt is `publication.token`, and the
   * publication is `published`, which is final: no effect changes an item
   * that was final before the entry (the contract's section 6.6). The
   * receipt of the first head has no slot at all. So no slot can name such
   * a token, and the rule opens its revocation at once. The rule `receipt`
   * is not written, and waits on that too.
   */
  mint: {
    place: "outcome",
    rules: {
      selects: false, read: false, covered: true, most: { effects: 2, requests: 0, operations: 1 },
      retries: () => false,
      wellFormed: (result, evidence) => {
        const body = bodyOf(evidence.body, result === "confirmed" ? ["token", "ends"] : []);
        return body !== null && (result !== "confirmed" || (typeof body["token"] === "string" && body["token"].length > 0 && utf8(body["token"]).length <= 256 && timeMs(body["ends"]) !== null));
      },
      unknown: () => ({}),
      derives: ({ state, own, input }, mint) => {
        if (input.type !== "outcome" || input.result !== "confirmed") return { effects: [], sends: [], opens: [] };
        const served = servedBy(state, own, mint);
        if (!served) throw new Error("a mint is of one attempt of a write");
        const item = served.write.kind === DESTINATION_KINDS.receipt ? null : subjectOf(state, own, served.write);
        const attempt = served.write.attempts.find((opened) => opened.attempt === served.attempt);
        const live = item !== null && (attempt?.outcomes.length ?? 0) === 0 && (item.values["token"] ?? null) === null && item.values["aborting"] !== true
          && (item.type === "branch" || HELD.includes(item.state));
        if (!live) return { effects: [], sends: [], opens: [opening(DESTINATION_KINDS.revoke, DESTINATION_ATTEMPTS.revoke)] };
        return {
          effects: [{ effect: "value", item: item.id, slot: "token", value: mint.id }, ...(item.state === "reserved" ? [{ effect: "state", item: item.id, state: "publishing" } as const] : [])],
          sends: [], opens: [],
        };
      },
    },
  },
  /**
   * Row e, the outcome entries of a `revoke` (P16; the row `revoke` of "What
   * each rule of an outcome yields"). It yields nothing: a failed
   * revocation is a duty, and decides nothing (section 6.6, step 5).
   * Another attempt follows `refused` or `unknown`, to 3.
   *
   * The body of every outcome is `{ token }`: the same ID as its mint's. A
   * `token` that is not its mint's is `bad-input`. The ID is the context of
   * the request, `revokedToken`. The body of an outcome that is not known
   * is that record too, so it is written, and the ledger opens the next
   * attempt in its entry.
   */
  revoke: {
    place: "outcome",
    rules: {
      selects: false, read: false, most: { effects: 0, requests: 0, operations: 0 },
      retries: () => true,
      wellFormed: (_result, evidence, { state, own, input }) => {
        const [body, operation] = [bodyOf(evidence.body, ["token"]), input.type === "outcome" ? state.operation(input.operation) : null];
        const token = operation ? revokedToken(state, own, operation) : null;
        return body !== null && token !== null && body["token"] === token;
      },
      unknown: (state, operation, _attempt, own) => { const token = revokedToken(state, own, operation); return token === null ? null : { token }; },
    },
  },
  /**
   * Row e, the outcome entries of a push (P16; section 12.1.5, the row
   * `push`, and "What `seen` decides for a push"; entry ER7). It reads the
   * opening entry; the publication; `branch.head`; and the attempts of the
   * publication's push operations.
   *
   * - The body is `{ send, seen }`. `confirmed`: `send` is `accepted`.
   *   `refused`: `refused` or `not-sent`, the classes of section 6.6, step
   *   4. `unknown`: `unknown`. A read is evidence in the body, and settles
   *   no attempt: no outcome has the basis `read`.
   * - An outcome that is not known, where the driver has no read back to
   *   offer: `{ send: "unknown", seen: "failed" }`. Nothing is then
   *   decided, and the deciding read follows (I3 deltas, entry FA7).
   * - Another attempt is allowed only when `seen` is the base and
   *   `aborting` is not set. The ledger adds its own conditions.
   * - The request of an attempt is sent only after its mint has an
   *   outcome. Where the mint is `refused`, or its answer is lost, the
   *   port has no token for the attempt: nothing is sent, and the
   *   attempt's outcome is `refused`, with `send: "not-sent"`.
   * - `most`: the first outcome of an attempt that publishes holds 6
   *   effects of this rule and opens `revoke`, `receipt`, `mint` and
   *   `judge`. The note counts 10 as the largest of the table, for
   *   `judge`: this row is larger by the same table (entry FA11).
   */
  push: {
    place: "outcome",
    rules: {
      selects: false, read: false, covered: true, most: { effects: 14, requests: 1, operations: 4 },
      retries: (_result, push, given) => pushOf(given, push).allows,
      ready: (state, push, attempt) => (mintOf(state, push, attempt)?.attempts[0]?.outcomes.length ?? 0) > 0,
      wellFormed: (result, evidence) => { const body = bodyOf(evidence.body, ["send", "seen"]); return body !== null && SENDS[result]!.includes(body["send"] as string) && isSeen(body["seen"]); },
      unknown: () => ({ send: "unknown", seen: "failed" }),
      derives: (given, push) => { const { effects, opens } = pushDecides(given, push); return { effects, sends: [], opens }; },
    },
  },
  /**
   * Row e, the outcome of the kind `read` (P16; section 12.1.5, "The
   * deciding read", and the row `deciding-read`). A read is opened only
   * where a write's own outcome left nothing decided and no attempt of that
   * write is open, and by `abort-if-behind`. It has 1 attempt. The runtime
   * reads again for as long as a read fails or decides nothing, and offers
   * the one outcome when a read decides.
   *
   * - The one outcome is `confirmed`, with the body `{ seen }`: a commit
   *   ID, or the text `absent`. `failed` does not follow, and neither does
   *   `refused` or `unknown`: each is `bad-input`.
   * - For the branch of a publication that holds the slot, a `seen` that is
   *   the base, while not every attempt of its pushes has a `refused`
   *   outcome, does not follow either: nothing is provable, and the
   *   runtime keeps reading (the table, its fourth row; section 6.8, the
   *   last row).
   * - It yields what the table of `seenDecides` gives, and no attempt gains
   *   an outcome. So after `published` an attempt that was `unknown` stays
   *   `unknown` (section 6.6).
   *
   * The read of a first head, and of a receipt's ref, is judged by the rows
   * `first-head` and `receipt`. Those two rules wait, and so does this rule
   * for such a read: its outcome is not judged.
   */
  "deciding-read": {
    place: "outcome",
    rules: {
      selects: false, read: false, covered: true, most: { effects: 11, requests: 1, operations: 3 },
      retries: () => false,
      wellFormed: (result, evidence, given) => {
        const [seen, read] = [bodyOf(evidence.body, ["seen"])?.["seen"], given.input.type === "outcome" ? given.state.operation(given.input.operation) : null];
        if (result !== "confirmed" || !read || !(seen === "absent" || isObjectId(seen))) return false;
        const of = readFor(given.state, given.own, read);
        const unprovable = of !== null && typeof of !== "string" && HELD.includes(of.state) && seen === branchOf(given.state)?.values["head"] && !everyRefused(given, of, null);
        return !unprovable;
      },
      derives: (given, read) => { const { effects, opens } = readDecides(given, read); return { effects, sends: [], opens }; },
    },
  },
  /**
   * Row e, the outcome of the read that `adopt-head` opens (P16; the row
   * `adopt-read`). It reads the opening entry, with the field `commit` of
   * its act. `seen` is that commit: `branch.head` is the commit, the branch
   * is `ready`, and the next `judge`. Otherwise nothing.
   *
   * The act is admitted only while no publication holds the slot. Its read
   * is answered later. Where a publication holds the slot by then, the
   * outcome changes nothing: a head that is adopted under a reserved
   * publication would move the base of its push. The note does not state
   * that order (I3 deltas, entry FA12).
   */
  "adopt-read": {
    place: "outcome",
    rules: {
      selects: false, read: false, covered: true, most: { effects: 5, requests: 0, operations: 1 },
      retries: () => false,
      wellFormed: (result, evidence) => { const seen = bodyOf(evidence.body, ["seen"])?.["seen"]; return result === "confirmed" && (seen === "absent" || isObjectId(seen)); },
      derives: ({ state, own, input }, read) => {
        const [branch, act] = [branchOf(state), ownEntry(own, seqOf(read.id)).input];
        if (!branch || input.type !== "outcome" || act.type !== "act") throw new Error("an adopt-read is of the act adopt-head on the branch");
        const [seen, commit] = [bodyOf(input.evidence.body, ["seen"])?.["seen"], act.signed.intent.fields["commit"]];
        if (!isObjectId(seen) || seen !== commit || (branch.refs["slot"] ?? null) !== null) return { effects: [], sends: [], opens: [] };
        const next = andNext(state, { ready: true });
        return {
          effects: [{ effect: "value", item: branch.id, slot: "head", value: seen }, ...(branch.state === "ready" ? [] : [{ effect: "state", item: branch.id, state: "ready" } as const]), ...next.effects],
          sends: [], opens: next.opens,
        };
      },
    },
  },
};

/**
 * The rules of `platform:destination@1`, with a reader of what the lane's
 * entries in `uses` say for a reservation. A test gives a STAND-IN reader.
 * The production rules are `destinationRules`, below.
 */
export function destinationRulesWith(reads: Reads): Rules {
  const judge = judgeDecides(reads);
  return { ...WRITTEN, judge: judgeRule(judge), "publication-update": updateRule({ ...DECIDES, [DESTINATION_KINDS.judge]: judge }) };
}

/** The rules of `platform:destination@1` that this package holds: what a runtime and a verifier run. */
export const destinationRules: Rules = destinationRulesWith(NOT_AT_HAND);
