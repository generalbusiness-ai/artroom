/**
 * `platform:destination@1`, as data, with its rules at acts and handlers
 * (authority note, revision 21, sections 6.1 to 6.10, 12.1.5 and 12.2; its
 * table of marks, section 12.1.8, rows 30 to 37 and the further rows b and
 * e). One destination scope for each published branch. It is the only
 * writer of that branch.
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
 * | `declare-first-head` | 5, effect | 30 | `establish` |
 * | `open-first-head` | 5, effect | 31 | `import` |
 * | `open-judge` | 5, effect | 32 | `reserve`: one `judge` at a time, by `branch.judging` |
 * | `publication-of` | 2, `also` | 34 | `withdraw`, the name `publication` |
 * | `open-withdrawn` | 5, effect | 34 | `withdraw` |
 * | `open-branch-read` | 5, effect | 36 | `adopt-head` |
 * | `reopen-publish` | 5, effect | 37 | `resend` |
 * | `collect-list` | 3, type | b | `reserve`, the fields `verdicts`, `jobs` and `links`; a verdict may state `extent` |
 *
 * **The marks that have NO rule here.** The adopted texts do not let any of
 * them be written whole, and none is invented. So the version lacks rules,
 * and by the whole-scope rule (the contract's section 6.1) nothing is
 * created under `platform:destination@1` by this package's rules. The I3
 * deltas note, section 18, has each in full.
 *
 * | Mark | Place | At | Why it has no rule (deltas entry) |
 * |---|---|---|---|
 * | `abort-if-behind` | 5, effect | `compromised` | Row 35. No record names the live token, no text names the kind of "the abort attempt", and a retry rule is not given the state, so it cannot stop a further attempt (ER5). |
 * | `resend-due` | 4, guard | `resend` | The row's guard reads the receipt's and the push's operations. No form reads an operation, the table of marks lists no rule for it, and no slot names a publication's operations (ER4). |
 * | `first-head`, `judge`, `push`, `mint`, `revoke`, `deciding-read`, `receipt`, `adopt-read` | 7, `outcomes` | Each kind of operation | Rows 33 and e, which are plan step 9f. No text says which publication, which token or which commit an operation is for, and the read that ends a publication is the note's open point O11 (ER6 to ER9). |
 *
 * The fence of section 6.8 is not adopted (section 6.8, "The standing of
 * this section"; U2). The data names no fence: no operation, and no kind
 * of outcome.
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them.
 */

import type { FactRef, FieldValue, OperationId, PlatformData, PlatformDefinition, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, isFactRef, isMemberRef, isScopeRef, utf8 } from "@generalbusiness/artroom-bytes";
import type { Item, Operation, Own, RecordedRef, RuleEffect, RuleGiven, Rules, StateView } from "@generalbusiness/artroom-derive";
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
        // Code P16: when `import` is false, the genesis declares the operation `first-head`, held. The entry that records the
        // `confirm` opens its attempt 1 (section 12.2; the contract's section 4.3, item 1).
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
      // Code P16: opens one new operation, the same compare-and-swap, with 1 attempt (G3).
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
  // The kinds of operation that this definition owns, each with the mark of the rule for its outcome entries (rows 33 and e).
  // Row 33 names the rule `judge`. The names of the other seven are this source's (entry ER1). None of the eight is written.
  outcomes: {
    [DESTINATION_KINDS.firstHead]: { code: "first-head", row: "P16" },
    [DESTINATION_KINDS.judge]: { code: "judge", row: "P19" },
    [DESTINATION_KINDS.push]: { code: "push", row: "P16" },
    [DESTINATION_KINDS.mint]: { code: "mint", row: "P16" },
    [DESTINATION_KINDS.revoke]: { code: "revoke", row: "P16" },
    [DESTINATION_KINDS.read]: { code: "deciding-read", row: "P16" },
    [DESTINATION_KINDS.receipt]: { code: "receipt", row: "P16" },
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
/** The same, for the rules scope that a destination observes: the value `branch.rules`. No runtime reads the rules scope before a turn yet, so nothing calls this but a test. */
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

// ---------------------------------------------------------------- the rules

/**
 * The rules of `platform:destination@1` that are written, by the name that
 * a mark states (section 12.1.8, the table of marks). Each is a pure
 * function of what a rule is given. None reads the clock, and none
 * refuses.
 */
export const destinationRules: Rules = {
  /**
   * Row 30, among the effects of `establish` (P16). It reads the creation's
   * `import`. When it is false: one `operation` effect, `first-head`, held,
   * with no attempt. The entry that records the `confirm` opens its attempt
   * 1, by the contract's own rule (its section 4.3, item 1). With an import
   * the first head is the imported history's, and `import` opens the write.
   */
  "declare-first-head": {
    place: "effect", most: 1,
    run: ({ resolved }) => (resolved.fields["import"] === false ? [{ effect: "operation", k: 0, owner: DESTINATION, kind: DESTINATION_KINDS.firstHead, attempts: DESTINATION_ATTEMPTS.firstHead }] : []),
  },
  /**
   * Row 31, among the effects of `import` (P16). It reads the update's
   * state and `commit`. On `done`: an `operation` effect, `first-head`, and
   * its attempt 1. On `failed`, and on any other state: nothing. A `done`
   * that names no commit names no first head, and opens nothing.
   */
  "open-first-head": {
    place: "effect", most: 2,
    run: ({ input, resolved }) => {
      if (input.type !== "delivery" || input.message.class !== "request" || input.message.type !== "relate") throw new Error("open-first-head stands in a `relate` handler, and reads its update");
      const state = isObject(input.message.body) ? input.message.body["state"] : null;
      return state === "done" && typeof resolved.fields["commit"] === "string" ? opened(0, DESTINATION_KINDS.firstHead, DESTINATION_ATTEMPTS.firstHead) : [];
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
   * Row 37, among the effects of `resend` (P16). An `operation` effect: the
   * same compare-and-swap, with 1 attempt, and its attempt 1. Which
   * operation is "the same" follows from the publication's state, as the
   * row's guard has it: the push while the publication is `unresolved`, and
   * the receipt's write when it is `published`. In any other state the
   * written guard has refused the act before this place.
   */
  "reopen-publish": {
    place: "effect", most: 2,
    run: ({ resolved }) => {
      const publication = resolved.subjects.get("on");
      if (publication?.type !== "publication") throw new Error("reopen-publish stands in a row whose primary item is a publication");
      const kind = publication.state === "unresolved" ? DESTINATION_KINDS.push : publication.state === "published" ? DESTINATION_KINDS.receipt : null;
      return kind === null ? [] : opened(0, kind, DESTINATION_ATTEMPTS.resend);
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
};
