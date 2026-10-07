/**
 * platform:destination@1 is the single writer of one published branch.
 * Its rows implement adopted authority revision 28 (8b1c3c9d7), sections
 * 3.3, 5.8, 6.1–6.10, 12.1.5 and 12.2, under scope contract revision 23.
 *
 * A branch and each publication hold the counts that their operations
 * draw. Recovery acts add room explicitly. A withdraw finds its publication
 * through the declared operation index and draws its one deciding entry.
 *
 * The judge copies the facts retained by reserve, derives two lists of
 * observation subjects, and judges from those records and retained values.
 * Its lane reader is destination-reading.ts. The single-controller record
 * names the membership head that answered the holders observation.
 *
 * First-head and receipt rules compare the commit IDs built by
 * destination-objects.ts from the contract's fact text and ref names. The
 * port must supply the repository's object format before writing.
 * The scope package's configured GitHub port writes these operations outside
 * the commit. In-memory tests use labelled host answers; object witnesses
 * also use real local Git. A deployed provider run remains unverified.
 *
 * Section 6.8's proposed fence has no operation here. The bounds are the
 * authority's proposals, to be measured by the proof plan.
 */

import type { FactRef, FieldValue, KeyId, Observation, OperationId, PlatformData, PlatformDefinition, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf, isDigest, isFactRef, isScopeRef, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Item, Opening, Operation, Own, PlatformRule, RecordedRef, RuleEffect, RuleGiven, RuleRequest, Rules, StateView } from "@generalbusiness/artroom-derive";
import { DESTINATION_CHANGED_SET, isJudgeChanges, isRecordedJudgeEvidence, isObjectId, judgeReservation, type ReservationRead, type Statement } from "./reservation.ts";
import { referenceOf } from "./rules-scope.ts";
import { isExtents } from "./extents.ts";
import { decidingKeys, manifestAuthors, readLane } from "./destination-reading.ts";
import { foundingObjects, receiptObjects, receiptRef, type DestinationCommit, type ObjectFormat } from "./destination-objects.ts";

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
 * The most records of the `collect` list of a `reserve` that keeps the
 * mark `collect-list` (row b; section 12.1.5, "The three lists of
 * `reserve`"): `links`. It is a constant of version 1 of the rule. It
 * equals the `max` of the type `link` of the pinned `change` lane. The
 * rule does not read it from the sender's pinned definition: a rule is
 * given no definition of another scope. If the lane's row or its `max`
 * changes, this changes with it, in a revision of the note (entry ER3).
 * From the note's revision 28 the lists `verdicts` and `jobs` have written
 * types, with at most 64 records each (section 6.5, "The fields of
 * `reserve`").
 */
export const COLLECT_MOST = { links: 32 } as const;

/**
 * The most reports that a `reserve` names: the `max` of its field `reports`,
 * which is the `max` of the field `selected` of the pinned `change` lane's
 * `propose-manifest` (section 6.5, "`reserve` names each selected report").
 */
export const REPORTS_MOST = 32;

/**
 * The most records of each of the two lists of a `reserve` that name
 * facts: the contract's bound on the elements of a written list (section
 * 6.5, "A list of at most 64 verdicts").
 */
export const NAMED_MOST = 64;

/**
 * The most receipts that may be `owed` when a `reserve` is admitted: the
 * number of the written guard `receipts-owed` (section 12.1.5, "A place
 * under `max`"). The entry that opens a receipt cannot be refused, so its
 * place is kept by an entry that can. The number is an example. What is
 * fixed is the relation: the `max` of `receipt` is at least the `max` of
 * `publication`, plus this number, plus 1.
 */
export const RECEIPTS_OWED = 64;

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
/**
 * The written types of the two lists of a `reserve` that name facts, and of
 * its field `reports` (authority note, revision 28, section 6.5, "The
 * fields of `reserve`" and "`reserve` names each selected report"). The
 * kinds are those of the pinned `change` lane, and of the pinned `issue`
 * lane for a report: the act that opens a `review`, the act that opens a
 * `job`, the three kinds of a job's reference `decidedBy`, and the act
 * that opens a `report`. If a row of a lane changes, these change with it,
 * in a revision of the note. A list has at most 64 records, which is the
 * contract's bound on the elements of a written list.
 */
const VERDICTS = {
  type: "list", max: NAMED_MOST, required: true,
  of: {
    type: "record",
    of: {
      review: { type: "fact", kind: ["review-verdict"], under: "change", required: true },
      reviewer: { type: "member", required: true },
      verdict: { type: "enum", of: ["approve", "request-changes"], required: true },
      // The one extent that the verdict counts for. A name that is no extent of the observed rules counts for none (section 12.1.4a).
      extent: { type: "text", max: 64, required: false },
    },
  },
} as const;
const JOBS = {
  type: "list", max: NAMED_MOST, required: true,
  of: {
    type: "record",
    of: {
      job: { type: "fact", kind: ["request-check"], under: "change", required: true },
      name: { type: "text", max: 128, required: true },
      state: { type: "enum", of: ["requested", "passed", "failed", "errored", "timed-out"], required: true },
      // A job that is `requested` has no deciding entry, and names one entry.
      decidedBy: { type: "fact", kind: ["check", "check-error", "timed:job-deadline"], under: "change", required: false },
    },
  },
} as const;
/** A `report` entry of an issue lane: the act of the pinned `issue` lane that opens a `report`, whose item type has that name too. */
const REPORT = { kind: "report", under: "issue" } as const;
const REPORTS = { type: "list", max: REPORTS_MOST, required: true, of: { type: "fact", kind: [REPORT.kind], under: REPORT.under } } as const;
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
      holds: { operations: { "first-head": 1, mint: 6, revoke: 6, read: 2, receipt: 1 }, items: 1 },
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
      indexes: ["operation"],
      holds: { operations: { judge: 1, push: 1, mint: 6, revoke: 6, read: 3, receipt: 1 }, requests: 3, items: 1, decisions: { withdraw: 1 } },
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
        // As `branch.token`, for an attempt of its push. From revision 28 it serves a push alone: a receipt has its own item, below.
        token: { fixed: false, required: false, of: TOKEN },
      },
    },
    // "Where a receipt's records stand" (revision 28, which holds revision 27's row; I3 deltas, entry FA6): an item of its own. A
    // `published` publication is final and takes no effect, so the slot `publication.receipt` of revision 25 is withdrawn, and the
    // state of this item says what it said. The entry that makes a publication `published` opens it, and so does the entry that
    // makes the branch `ready` by a first head. Its ID is the position of that entry. `max` is the `max` of `publication`, plus the
    // number of the guard `receipts-owed`, plus 1 for the first head: 64 + 64 + 1.
    receipt: {
      many: true, max: RECEIPTS_OWED + 64 + 1, initial: "owed",
      states: { owed: { final: false }, written: { final: true }, conflict: { final: true } },
      parties: {},
      // Set for the receipt of a publication. Unset for the receipt of the first head.
      refs: { publication: { fixed: true, required: false, to: { type: "item", of: "publication" } } },
      values: {
        // The commit that the branch held when the item was opened.
        commit: { fixed: true, required: true, of: { type: "commit" } },
        // For the receipt of the first head: the position of the entry that opened the `first-head` operation. Unset for a publication's.
        opening: { fixed: true, required: false, of: { type: "int", min: 0, max: 1000000000 } },
        // As `branch.token`, for an attempt of this receipt's write.
        token: { fixed: false, required: false, of: TOKEN },
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
      adds: { operations: { "adopt-read": 1 } },
      also: {},
      fields: { commit: { type: "commit", required: true }, why: { type: "text", max: 1024, required: true } },
      guards: [{ none: { type: "publication", states: ["reserved", "publishing", "unresolved"] } }, { unset: "slot" }],
      // Code P16: opens one read of the branch.
      effects: [{ code: "open-branch-read", row: "P16" }],
      sends: [],
      attention: [],
    },
    // `resend`: an act on a publication. Grant `ledger.retry`. The publication is `unresolved`, and the stated attempts of its push
    // are used. The state is a written guard. The rest reads the operations of the publication, which no form reads: the rule
    // `resend-due`, refused `resend-not-due` (row z, P29; entry ER4). From revision 28 the act is on an `unresolved` publication
    // alone: a `published` one is final, and an act on a final item is refused `final` (entry FA6).
    resend: {
      step: "transition", on: "publication", grant: "ledger.retry",
      adds: { operations: { push: 1, mint: 1, revoke: 1, read: 1 } },
      also: {},
      fields: {},
      guards: [{ state: ["unresolved"] }, { code: "resend-due", row: "P29" }],
      // Code P16: opens one new operation, the same compare-and-swap, with 1 attempt (G3), and that attempt's `mint`.
      effects: [{ code: "reopen-publish", row: "P16" }],
      sends: [],
      attention: [],
    },
    // `resend-receipt`: an act on the branch, for the receipt that its field names (revision 28, "The rows that change, and three
    // new acts"). Grant `ledger.retry`. The receipt is `owed`, or the act is refused `receipt-not-owed`; and the stated attempts of
    // its `receipt` operations are used, by the same rule `resend-due`. It is on the branch because a receipt's publication is
    // final, and the branch is never final.
    "resend-receipt": {
      step: "transition", on: "branch", grant: "ledger.retry",
      adds: { operations: { receipt: 1, mint: 1, revoke: 1, read: 1 } },
      also: { receipt: { item: "receipt", by: "receipt" } },
      fields: { receipt: { type: "item", of: "receipt", required: true } },
      guards: [{ state: ["owed"], of: "also.receipt", reason: "receipt-not-owed" }, { code: "resend-due", row: "P29" }],
      // Code P16: opens one new `receipt` operation with 1 attempt, and that attempt's `mint`.
      effects: [{ code: "reopen-publish", row: "P16" }],
      sends: [],
      attention: [],
    },
    "add-room": {
      step: "transition", on: "publication", grant: "ledger.retry", also: {}, fields: {},
      guards: [{ state: ["queued", "reserved", "publishing", "unresolved"] }], effects: [], sends: [], attention: [],
      adds: { operations: { judge: 1, push: 1, mint: 1, revoke: 1, read: 1, receipt: 1 }, requests: 1, items: 1 },
    },
    "add-branch-room": {
      step: "transition", on: "branch", grant: "ledger.retry", also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [],
      adds: { operations: { "first-head": 1, mint: 1, revoke: 1, read: 1, receipt: 1, "adopt-read": 1 }, items: 1 },
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
        // From revision 28 (section 6.5, "The fields of `reserve`"): the two lists that name facts have written types, so that
        // each entry that they name is fetched at the delivery, counted against the bound on the foreign entries of one entry, and
        // retained with the entry that records the message.
        verdicts: VERDICTS,
        jobs: JOBS,
        // The third list keeps the mark (revision 25, "The three lists of `reserve`"; entry ER3). It names no fact to fetch.
        links: COLLECTED,
        // The sixth field (section 6.5, "`reserve` names each selected report"): the `report` entry of each selected report, in the
        // order of the manifest's selections. The list may be empty, and is still present.
        reports: REPORTS,
      },
      guards: [
        OWNER,
        // No publication exists for that operation. One that a `withdraw` opened before this `reserve` is `not-reserved`, "withdrawn".
        { none: { type: "publication", states: EVERY, where: [{ equals: { a: { slot: "operation" }, b: { field: "operation" } } }] }, reason: "withdrawn" },
        // A place for each receipt under `max` (revision 28; the planner's act `53ecfb42`, answer b): with 65 receipts owed the
        // `reserve` is refused by this name, and is not queued. An admin's `resend-receipt` is the way forward.
        { count: { type: "receipt", states: ["owed"], max: RECEIPTS_OWED }, reason: "receipts-owed" },
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
      // The fixed operation index gives the pending publication without scanning the history.
      also: { publication: { code: "publication-of", row: "P15", item: "publication", index: "operation", key: "operation" } },
      bound: { of: "also.publication", where: [{ equals: { a: { sender: true }, b: { slot: "lane", of: "also.publication" } } }] },
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
    [DESTINATION_KINDS.firstHead]: { code: "first-head", row: "P16", attempts: 3, most: { effects: 15, operations: ["revoke", "receipt", "mint", "judge", "read"], opens: "receipt" } },
    [DESTINATION_KINDS.judge]: { code: "judge", row: "P19", send: UPDATE, attempts: 1, origin: "rule", most: { effects: 10, operations: ["push", "mint", "judge"] }, observes: [
      { of: "rules", window: 10, use: "once", without: "wait", retains: [{ domain: "artroom-rules-extents-1", max: 262144 }] },
      { of: "key", from: "rule", max: 1, window: 10, use: "once", without: "wait" },
      { of: "holders", action: "rules.publish", most: 1, window: 10, use: "once", without: "wait" },
      { of: "member", from: "rule", max: 65, window: 10, use: "once", without: "wait" },
      { of: "key", from: "rule", second: true, max: 8, window: 10, use: "once", without: "wait" },
    ] },
    [DESTINATION_KINDS.push]: { code: "push", row: "P16", send: UPDATE, attempts: DESTINATION_ATTEMPTS.push, most: { effects: 16, operations: ["revoke", "receipt", "mint", "judge", "read"], opens: "receipt" } },
    [DESTINATION_KINDS.mint]: { code: "mint", row: "P16", send: UPDATE, attempts: DESTINATION_ATTEMPTS.mint, most: { effects: 2, operations: ["revoke"] } },
    [DESTINATION_KINDS.revoke]: { code: "revoke", row: "P16", send: UPDATE, attempts: DESTINATION_ATTEMPTS.revoke, most: { effects: 0, operations: [] } },
    [DESTINATION_KINDS.read]: { code: "deciding-read", row: "P16", send: UPDATE, attempts: DESTINATION_ATTEMPTS.read, most: { effects: 13, operations: ["receipt", "mint", "judge"], opens: "receipt" } },
    [DESTINATION_KINDS.receipt]: { code: "receipt", row: "P16", send: UPDATE, attempts: DESTINATION_ATTEMPTS.receipt, most: { effects: 5, operations: ["revoke", "mint", "read"] } },
    [DESTINATION_KINDS.adoptRead]: { code: "adopt-read", row: "P16", attempts: DESTINATION_ATTEMPTS.adoptRead, most: { effects: 5, operations: ["judge"] } },
  },
};

// ---------------------------------------------------------------- reading the destination's state


/** The one branch item of a destination scope. */
export const branchOf = (state: Pick<StateView, "page">): Item | null => state.page("branch", ["empty", "ready"], null, 1).items[0] ?? null;

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
/** The same, for the rules scope that a destination observes: the value `branch.rules` (the same table). Guard 1 of an observation of the rules reads it, in a replay (`Platform.rulesScope`). The outcome rows read this reference before their turn. */
export const destinationRulesScope = (state: Pick<StateView, "page" | "incarnations">): RecordedRef | null => referenceOf(state, heldId(state, "rules"), "rules");

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

/** The receipt with that item ID, or none. */
const receiptAt = (state: Pick<StateView, "item">, id: unknown): Item | null => {
  const item = typeof id === "number" ? state.item(id) : null;
  return item?.type === "receipt" ? item : null;
};

/** This scope's own entry at a position before the one that is written. A rule that needs one and is given none has a fault: nothing is judged from a history that is not at hand. */
const ownEntry = (own: Own, seq: number) => {
  const kept = own(seq);
  if (!kept) throw new Error(`this scope's own entry ${seq} is not at hand`);
  return kept.entry;
};

/**
 * The push operations that were opened for a publication, in the order of
 * their opening (section 12.1.5, "What an operation is for"; entry ER6). No
 * slot lists them, and the folded state gives an operation by its ID
 * alone. So they are found from the entries that open one: the entry at
 * `reservedAt`, whose outcome of `judge` opened the first push; and an act
 * `resend` on the publication. The search reads this scope's own entries
 * from `reservedAt` to the entry that is written (I3 deltas, entry FA5).
 */
function pushesOf(state: Pick<StateView, "operation">, own: Own, publication: Item, before: number): Operation[] {
  const from = publication.values["reservedAt"];
  if (typeof from !== "number") return [];
  const found: Operation[] = [];
  for (let seq = from; seq < before; seq += 1) {
    const { input } = ownEntry(own, seq);
    const about = seq === from || (input.type === "act" && input.signed.intent.kind === "resend" && input.signed.intent.on === publication.id);
    if (about) found.push(...openedIn(state, seq).filter((operation) => operation.owner === DESTINATION && operation.kind === DESTINATION_KINDS.push));
  }
  return found;
}

/**
 * The `receipt` operations that were opened for one receipt, in the order
 * of their opening (the same table, the row `receipt`). The first is opened
 * by the entry that opened the item, whose position is the item's ID. Each
 * further one is opened by an act `resend-receipt` whose field `receipt`
 * names the item. The search reads this scope's own entries from the item's
 * ID to the entry that is written (I3 deltas, entry FA5).
 */
function receiptWrites(state: Pick<StateView, "operation">, own: Own, receipt: Item, before: number): Operation[] {
  const found: Operation[] = [];
  for (let seq = receipt.id; seq < before; seq += 1) {
    const { input } = ownEntry(own, seq);
    const about = seq === receipt.id || (input.type === "act" && input.signed.intent.kind === "resend-receipt" && input.signed.intent.fields["receipt"] === receipt.id);
    if (about) found.push(...openedIn(state, seq).filter((operation) => operation.owner === DESTINATION && operation.kind === DESTINATION_KINDS.receipt));
  }
  return found;
}

/** An operation that this entry opens, at its ordinal among the operations of the entry, with its attempt 1 (the contract's section 4.3, items 1 and 2). */
const opened = (k: number, kind: string, attempts: number, holder: number): RuleEffect[] => [
  { effect: "operation", k, owner: DESTINATION, kind, attempts, for: holder },
  { effect: "attempt", operation: { k }, attempt: 1, result: "opened", selected: null },
];

const isObject = (value: unknown): value is Record<string, FieldValue> => typeof value === "object" && value !== null && !Array.isArray(value);
/** True when the record has each required member, no member that is not named, and each member that it has is of its kind. */
const record = (value: unknown, required: Readonly<Record<string, (member: unknown) => boolean>>, optional: Readonly<Record<string, (member: unknown) => boolean>> = {}): boolean =>
  isObject(value) && Object.keys(required).every((name) => Object.hasOwn(value, name)) && Object.entries(value).every(([name, member]) => {
    const check = Object.hasOwn(required, name) ? required[name] : Object.hasOwn(optional, name) ? optional[name] : undefined;
    return check?.(member) === true;
  });

/**
 * One record of the `collect` list `links` of a `reserve`, as the lane's
 * `merge` row sends it (R2 section 4.2). An item of the lane is named by
 * the fact of the entry that opened it, which is how a send carries a
 * local item. The rule fetches nothing for it, and the rule `judge` reads
 * nothing of a link's entry.
 */
const COLLECTED_RECORD: Readonly<Record<keyof typeof COLLECT_MOST, (value: unknown) => boolean>> = {
  links: (value) => record(value, { link: isFactRef, issue: (issue) => isScopeRef(issue) && issue.kind === "lane" }),
};

// ---------------------------------------------------------------- what an operation is for

/** A write: an operation of the kind `first-head`, `push` or `receipt` (section 12.1.5, "The kinds of operation"). */
const WRITES: readonly string[] = [DESTINATION_KINDS.firstHead, DESTINATION_KINDS.push, DESTINATION_KINDS.receipt];
const ours = (operation: Operation, ...kinds: readonly string[]): boolean => operation.owner === DESTINATION && kinds.includes(operation.kind);
/** An operation that the outcome entry opens. The ledger numbers it and opens its attempt 1. */
const opening = (kind: string, attempts: number, holder: number): Opening => ({ owner: DESTINATION, kind, attempts, for: holder });
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
export function mintOf(state: Pick<StateView, "operation">, write: Operation, attempt: number): Operation | null {
  const at = attempt === 1 ? seqOf(write.id) : write.attempts[attempt - 1]?.opened;
  return at === undefined ? null : openedIn(state, at).find((operation) => ours(operation, DESTINATION_KINDS.mint)) ?? null;
}

/** The attempt of a write that a `mint` serves: the same row, read from the mint. Null: the entry that opened the mint opened no attempt of a write. */
export function servedBy(state: Pick<StateView, "operation">, own: Own, mint: Operation): { write: Operation; attempt: number } | null {
  const seq = seqOf(mint.id);
  const here = openedIn(state, seq).find((operation) => ours(operation, ...WRITES));
  if (here) return { write: here, attempt: 1 };
  const input = ownEntry(own, seq).input;
  const write = input.type === "outcome" ? state.operation(input.operation) : null;
  return input.type === "outcome" && write && ours(write, ...WRITES) && write.attempts[input.attempt]?.opened === seq ? { write, attempt: input.attempt + 1 } : null;
}

/**
 * The target of a write: the item whose slot `token` the write uses
 * (section 12.1.5, "A token whose write can no longer act, and who cleans
 * it up", decided in revision 28; the rows `first-head`, `push` and
 * `receipt` of "What an operation is for"). It is found from the entry that
 * opened the operation.
 *
 * | The write | Its target | Found from |
 * |---|---|---|
 * | `first-head` | The branch | The one branch item |
 * | `push` | The publication | The publication that the opening entry made `reserved`, or that the act `resend` is on |
 * | `receipt` | The item `receipt` | The item at the position of the opening entry, which that entry opened; or the item that the field `receipt` of a `resend-receipt` names |
 *
 * Null: no such item. That is a receipt's write whose opening entry opened
 * no receipt and names none.
 */
export function targetOf(state: Pick<StateView, "item" | "page">, own: Own, write: Operation): Item | null {
  if (write.kind === DESTINATION_KINDS.firstHead) return branchOf(state);
  const at = seqOf(write.id);
  const { input, effects } = ownEntry(own, at);
  if (write.kind === DESTINATION_KINDS.receipt) return receiptAt(state, input.type === "act" ? input.signed.intent.fields["receipt"] : at);
  if (input.type === "act") return publicationAt(state, input.signed.intent.on);
  const change = effects.find((effect) => effect.effect === "state" && effect.state === "reserved");
  return change?.effect === "state" ? publicationAt(state, change.item) : null;
}

/**
 * Whether the target of a write is closed: that write can no longer act on
 * it (the same block, its first table).
 *
 * | The write | The target is closed when |
 * |---|---|
 * | `first-head` | The branch is not `empty`: a first head, a read or an `adopt-head` made it `ready` |
 * | `push` | The publication is final, which is `published`, `aborted` or `not-reserved`; or `aborting` is set |
 * | `receipt` | The receipt is final: `written` or `conflict` |
 *
 * A write with no target is closed: nothing takes its token.
 */
export function closed(target: Item | null): boolean {
  if (target === null) return true;
  if (target.type === "branch") return target.state !== "empty";
  if (target.type === "publication") return !HELD.includes(target.state) || target.values["aborting"] === true;
  return target.state !== "owed";
}

/** Whether an item is in a final state of its type, as the data states it. No effect changes such an item (the contract's section 6.6). */
const isFinal = (item: Item): boolean => destination.items[item.type]?.states[item.state]?.final === true;

/**
 * Rule T4 of a token, for one outcome entry of an attempt of a write (the
 * same block, "The rules of a token"). In the first outcome entry of the
 * attempt, where the slot `token` of the target names that attempt's own
 * mint: the token's `revoke` operation, which the ledger opens with its
 * attempt 1. Where the target was not final before the entry, the slot is
 * emptied. Where it was final before the entry, nothing is set on it: no
 * effect changes an item that was final before the entry, and from the rule
 * of an outcome such an effect is a fault (the contract's sections 6.6 and
 * 6.1). In every other outcome entry: nothing.
 *
 * The rule of each kind of write runs it first: `push` here, and the rules
 * `first-head` and `receipt`.
 *
 * The revocation is for the holder of the write, which is also the holder
 * of the mint ("One holder for each cleanup").
 */
export function tokenStep(given: Pick<RuleGiven, "state" | "own" | "input">, write: Operation): Pick<Decided, "effects" | "opens"> {
  const { state, own, input } = given;
  if (input.type !== "outcome") throw new Error("a write is judged in its outcome entry");
  const [target, mint] = [targetOf(state, own, write), mintOf(state, write, input.attempt)];
  const first = write.attempts.find((opened) => opened.attempt === input.attempt)?.outcomes.length === 0;
  if (!first || target === null || mint === null || target.values["token"] !== mint.id) return { effects: [], opens: [] };
  return {
    effects: isFinal(target) ? [] : [{ effect: "value", item: target.id, slot: "token", value: null }],
    opens: [opening(DESTINATION_KINDS.revoke, DESTINATION_ATTEMPTS.revoke, write.for!)],
  };
}

/**
 * Rule T7 of a token: whether the gateway sends the request of that attempt
 * of a write, as the folded state has it when it sends. It sends only where
 * the slot `token` of the target names that attempt's own mint and the
 * target is not closed. An attempt whose request it does not send gets the
 * outcome `refused`, with `{ send: "not-sent", seen }`, and that answer is
 * written only for a request that was not sent.
 *
 * I3 merge: no port sends a request of the destination, so nothing calls
 * this yet. The host port reads it before each send (I3 deltas, entry GD8).
 */
export function writeSends(state: Pick<StateView, "operation" | "item" | "page">, own: Own, write: Operation, attempt: number): boolean {
  const [target, mint] = [targetOf(state, own, write), mintOf(state, write, attempt)];
  return target !== null && mint !== null && !closed(target) && target.values["token"] === mint.id;
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
export function mintRevoked(state: Pick<StateView, "operation" | "item">, own: Own, revoke: Operation): Operation | null {
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
  return { effects: [{ effect: "ref", item: branch.id, slot: "judging", to: publication }], opens: [opening(DESTINATION_KINDS.judge, DESTINATION_ATTEMPTS.judge, publication)] };
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
  return pushesOf(state, own, publication, resolved.self).every((push) => push.attempts.every((attempt) => refused(push, attempt)));
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
  const { state, resolved } = given;
  const branch = branchOf(state);
  if (!branch) throw new Error("a destination holds its branch item");
  if (!HELD.includes(publication.state)) return NOTHING;
  const [base, integration, id] = [branch.values["head"], publication.values["integration"], publication.id];
  /** `{ state: "unresolved" }`, when the state was another, with the update `unknown`. */
  const unresolved = (opens: readonly Opening[]): Decided => (publication.state === "unresolved"
    ? { effects: [], opens, update: null }
    : { effects: [{ effect: "state", item: id, state: "unresolved" }], opens, update: { publication, state: "unresolved", outcome: "unknown" } });

  // The publication's `integration`: `published`. The entry opens the item `receipt`, `owed`, with the publication and the commit,
  // and its first `receipt` operation with that attempt's `mint`. So the receipt's ID is the position of this entry.
  if (isObjectId(seen) && seen === integration) {
    const next = andNext(state, { slot: true });
    return {
      effects: [
        { effect: "state", item: id, state: "published" }, { effect: "ref", item: branch.id, slot: "slot", to: null }, { effect: "value", item: branch.id, slot: "head", value: seen },
        { effect: "open", item: resolved.self, type: "receipt", state: "owed" }, { effect: "ref", item: resolved.self, slot: "publication", to: id }, { effect: "value", item: resolved.self, slot: "commit", value: seen },
        ...next.effects,
      ],
      opens: [opening(DESTINATION_KINDS.receipt, DESTINATION_ATTEMPTS.receipt, id), opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, id), ...next.opens],
      update: { publication, state: "published", outcome: "published", commit: seen },
    };
  }
  if (isObjectId(seen) && seen === base) {
    // The base, and the ledger opens a further attempt in this entry: `unresolved`, and the `mint` of attempt n + 1.
    if (at?.next) return unresolved([opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, id)]);
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
  // branch is opened, where no attempt of that push is open after this entry (section 12.1.5, "The deciding read"), and only
  // when no outcome of this push operation has opened one.
  if (seen === "failed" || (isObjectId(seen) && seen === base)) {
    const open = at !== null && at.push.attempts.some((attempt) => attempt.attempt !== at.attempt && attempt.outcomes.length === 0);
    // One read for an operation: none is opened where an outcome of this push has opened one (entry FA14).
    return unresolved(at !== null && !open && !readOpened(state, at.push) ? [opening(DESTINATION_KINDS.read, DESTINATION_ATTEMPTS.read, id)] : []);
  }
  // Any other commit, or a ref that is absent: another writer (section 6.9). The slot stays held. No attempt and no read is opened.
  return unresolved([]);
}

/**
 * The publication of a push, and whether its rule allows another attempt
 * (section 12.1.5, "Whether another attempt of a push is allowed", and rule
 * T8 of a token): only while the target is not closed, which is while the
 * publication is not final and `aborting` is not set, and only when `seen`
 * is the base.
 */
function pushOf({ state, own, input }: RuleGiven, push: Operation): { publication: Item; seen: unknown; allows: boolean } {
  const publication = targetOf(state, own, push);
  if (input.type !== "outcome" || publication?.type !== "publication") throw new Error("a push is of one publication");
  const seen = isObject(input.evidence.body) ? input.evidence.body["seen"] : null;
  return { publication, seen, allows: !closed(publication) && isObjectId(seen) && seen === branchOf(state)?.values["head"] };
}

/** True when an outcome entry of that write has opened a `read`: a write opens at most one (section 12.1.5, "Why one read for an operation"; I3 deltas, entry FA14). */
const readOpened = (state: Pick<StateView, "operation">, write: Operation): boolean =>
  write.attempts.some((attempt) => attempt.outcomes.some((outcome) => openedIn(state, outcome.seq).some((operation) => ours(operation, DESTINATION_KINDS.read))));

/**
 * The outcome entry of one attempt of a push (the row `push` of "What each
 * rule of an outcome yields"). First the token, by rule T4 (`tokenStep`):
 * in the first outcome of an attempt, when the slot `token` names that
 * attempt's own mint, the token's `revoke` and its attempt 1, and `token`
 * emptied only where the publication was not final before the entry. Then
 * the table of `seenDecides`.
 *
 * Where another entry made the publication final first, the slot still
 * names the mint (rule T6), and this entry opens the revocation and sets
 * nothing on the publication.
 */
const pushDecides: Decides = (given, push) => {
  const { input } = given;
  const { publication, seen, allows } = pushOf(given, push);
  if (input.type !== "outcome") throw new Error("a push is judged in its outcome entry");
  const token = tokenStep(given, push);
  // The ledger's own conditions for attempt n + 1, made again on the same state (the contract's section 4.3, item 2).
  const next = input.result !== "confirmed" && input.attempt === push.attempts.length && push.attempts.length < push.most && push.selected === null && allows;
  const table = seenDecides(given, publication, seen, { push, attempt: input.attempt, result: input.result, next });
  return { effects: [...token.effects, ...table.effects], opens: [...token.opens, ...table.opens], update: table.update };
};

/** The first head an operation writes: its import's recorded commit, or the computed founding commit. */
export function firstHeadCommit(state: Pick<StateView, "page">, own: Own, write: Operation, format: ObjectFormat): string {
  const branch = branchOf(state);
  if (!branch) throw new Error("a first head belongs to the destination's branch");
  const opened = ownEntry(own, seqOf(write.id));
  if (opened.input.type === "delivery" && opened.input.message.class === "request" && opened.input.message.type === "relate") {
    const commit = (opened.input.message.body as { detail?: Record<string, unknown> }).detail?.["commit"];
    if (!isObjectId(commit)) throw new Error("an imported first head names its commit in the update");
    return commit;
  }
  const claim = branch.refs["claim"];
  if (!isFactRef(claim)) throw new Error("a founding first head holds its verified claim");
  const genesis = ownEntry(own, 0);
  return foundingObjects(format, genesis.at.scope, genesis.time, claim).commit;
}

/** A receipt's recorded file, commit objects and public ref. Every fact is an own entry or a verified reference held by an item. */
export function destinationReceipt(state: Pick<StateView, "item" | "page">, own: Own, receipt: Item, format: ObjectFormat): DestinationCommit & { ref: string; file: unknown } {
  const entry = ownEntry(own, receipt.id);
  const commit = receipt.values["commit"];
  if (!isObjectId(commit)) throw new Error("a receipt holds the published commit");
  const publication = publicationAt(state, receipt.refs["publication"]);
  let operation: FactRef;
  let file: unknown;
  if (publication) {
    const [heldOperation, manifest, reason] = [publication.refs["operation"], publication.refs["manifest"], publication.values["reason"]];
    if (!isFactRef(heldOperation) || !isFactRef(manifest)) throw new Error("a publication's receipt holds its operation and manifest");
    operation = heldOperation;
    file = { v: 1, publication: factRefOf(entry), operation, manifest, commit, ...(typeof reason === "string" && reason.startsWith("single-controller:") ? { reason } : {}) };
  } else {
    const [branch, opening] = [branchOf(state), receipt.values["opening"]];
    const claim = branch?.refs["claim"];
    if (!isFactRef(claim) || typeof opening !== "number") throw new Error("a first head's receipt holds the claim and its opening position");
    operation = factRefOf(ownEntry(own, opening));
    file = { v: 1, first: factRefOf(entry), claim, commit };
  }
  const ref = receiptRef(operation);
  if (ref === null) throw new Error("a verified operation's fact gives its receipt ref");
  return { ...receiptObjects(format, entry.at.scope, entry.time, operation, file), ref, file };
}

/** The commit ID in `seen` alone states an object format. `absent` and `failed` never compute a commit. */
const formatOf = (seen: unknown): ObjectFormat | null => isObjectId(seen) ? (seen.length === 40 ? "sha1" : "sha256") : null;

/** A write's ledger condition for a further attempt, beside its rule's condition. A late answer can open none. */
const nextWrite = ({ input }: RuleGiven, write: Operation, allows: boolean): boolean => input.type === "outcome" && input.result !== "confirmed" && input.attempt === write.attempts.length && write.attempts.length < write.most && write.selected === null && allows;

/** The first-head column, from the table of revision 28. A deciding read runs only this column, with no token step and no further attempt. */
function firstHeadSeen(given: RuleGiven, write: Operation, seen: unknown, fromRead: boolean): Decided {
  const { state, own, resolved } = given;
  const branch = branchOf(state);
  if (!branch) throw new Error("a destination holds its branch");
  if (closed(branch)) return NOTHING;
  const format = formatOf(seen);
  if (format !== null && seen === firstHeadCommit(state, own, write, format)) {
    const next = andNext(state, { ready: true });
    return {
      effects: [
        { effect: "state", item: branch.id, state: "ready" }, { effect: "value", item: branch.id, slot: "head", value: seen as string },
        { effect: "open", item: resolved.self, type: "receipt", state: "owed" }, { effect: "value", item: resolved.self, slot: "commit", value: seen as string },
        { effect: "value", item: resolved.self, slot: "opening", value: seqOf(write.id) }, ...next.effects,
      ],
      opens: [opening(DESTINATION_KINDS.receipt, DESTINATION_ATTEMPTS.receipt, write.for!), opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, write.for!), ...next.opens], update: null,
    };
  }
  if (fromRead) return NOTHING;
  if (seen === "absent" && nextWrite(given, write, true)) return { effects: [], opens: [opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, write.for!)], update: null };
  return seen === "failed" && !readOpened(state, write) ? { effects: [], opens: [opening(DESTINATION_KINDS.read, DESTINATION_ATTEMPTS.read, write.for!)], update: null } : NOTHING;
}

/** The receipt column. Its read never touches a token; its write runs T4 before this function. */
function receiptSeen(given: RuleGiven, write: Operation, seen: unknown, fromRead: boolean): Decided {
  const { state, own } = given;
  const receipt = targetOf(state, own, write);
  if (receipt?.type !== "receipt") throw new Error("a receipt write belongs to one receipt");
  if (closed(receipt)) return NOTHING;
  const format = formatOf(seen);
  if (format !== null) return { effects: [{ effect: "state", item: receipt.id, state: seen === destinationReceipt(state, own, receipt, format).commit ? "written" : "conflict" }], opens: [], update: null };
  if (fromRead) return NOTHING;
  if (seen === "absent" && nextWrite(given, write, true)) return { effects: [], opens: [opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, write.for!)], update: null };
  const last = given.input.type === "outcome" && given.input.attempt === write.most;
  return (seen === "failed" || (seen === "absent" && last)) && !readOpened(state, write) ? { effects: [], opens: [opening(DESTINATION_KINDS.read, DESTINATION_ATTEMPTS.read, write.for!)], update: null } : NOTHING;
}

const createDecides = (column: typeof firstHeadSeen): Decides => (given, write) => {
  const token = tokenStep(given, write);
  const seen = given.input.type === "outcome" && isObject(given.input.evidence.body) ? given.input.evidence.body["seen"] : null;
  const table = column(given, write, seen, false);
  return { effects: [...token.effects, ...table.effects], opens: [...token.opens, ...table.opens], update: null };
};

/**
 * What a `read` is for (the row `read` of "What an operation is for"): the
 * ref of the write after which it was opened, or the branch, for the
 * publication that `abort-if-behind` set `aborting`. It is read from the
 * entry that opened the read.
 */
export function readFor(state: Pick<StateView, "operation" | "item" | "page">, own: Own, read: Operation): Item | "first-head" | "receipt" | null {
  const { input, effects } = ownEntry(own, seqOf(read.id));
  if (input.type === "delivery") {
    const set = effects.find((effect) => effect.effect === "value" && effect.slot === "aborting" && effect.value === true);
    return set?.effect === "value" ? publicationAt(state, set.item) : null;
  }
  const of = input.type === "outcome" ? state.operation(input.operation) : null;
  if (!of || !ours(of, ...WRITES)) return null;
  return of.kind === DESTINATION_KINDS.push ? targetOf(state, own, of) : (of.kind as "first-head" | "receipt");
}

/**
 * The outcome of a `read` of the branch, where its opening entry is of a
 * push or of `compromised`: the same table as a push. A read never settles
 * an attempt: what it saw moves the publication's state, the branch's head
 * and the slot, and gives no attempt an outcome.
 */
const readDecides: Decides = (given, read) => {
  const [of, seen] = [readFor(given.state, given.own, read), given.input.type === "outcome" && isObject(given.input.evidence.body) ? given.input.evidence.body["seen"] : null];
  if (of === null) throw new Error("a deciding read belongs to one write or abort");
  if (typeof of === "string") {
    const opened = ownEntry(given.own, seqOf(read.id)).input;
    const write = opened.type === "outcome" ? given.state.operation(opened.operation) : null;
    if (!write) throw new Error("a first-head or receipt read was opened by its write's outcome");
    return (of === "first-head" ? firstHeadSeen : receiptSeen)(given, write, seen, true);
  }
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
  sound?: boolean;
  /** As `ReservationRead.manifest`, but for the commits of the selected reports, which the rule derives itself (`reportCommits`). */
  manifest: Omit<ReservationRead["manifest"], "reports">;
  /** One for each verdict of the statement, in its order: whether its entry is that verdict, and the key that signed it. Null: no entry says. */
  verdicts: readonly { sound: boolean; key: KeyId | null }[];
  /** For a check, by its name: as `ReservationRead.checks`, with the key that signed the deciding entry. */
  checks: Readonly<Record<string, { opening: "sound" | "other-configuration" | "unsound"; deciding: boolean; key: KeyId | null }>>;
}

/** The reader of a lane's entries for one reservation. Null: they are not at hand, or no reader is written. */
export type Reads = (given: RuleGiven, publication: Item, statement: Statement) => LaneRead | null;

const READ_LANE: Reads = (given, _publication, statement) => {
  const seen = given.observed({ asked: "rules" })?.observation;
  return readLane(given, statement, seen && "subject" in seen && seen.subject === "rules" ? seen : null);
};

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
 *   deciding result of each passed live job of a listed check. A key
 *   whose observation is not at hand gives null, and its verdict or its
 *   result is then not counted.
 *
 * The retained extents value, the holders observation and the author
 * observations supply the remaining inputs. A second-step row includes
 * every listed passed check, including a check only an extent asks for.
 *
 * The commits of the selected reports are read from the entries that the
 * field `reports` names (`reportsBound`), and no longer from a reader.
 *
 * Null: the lane's entries are not read; or the `merge` entry, the
 * manifest's entry or the entry of a named report is not at hand. The rule
 * then has a fault, and nothing is written.
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
  const required = rules?.content.asked === "rules" ? rules.content.checks.map((check) => check.name) : [];
  const reports = reportsBound(given, statement);
  if (reports === undefined) return null;
  return {
    merger: keyOf(merge.input.signed.intent.actor), rules,
    sound: lane.sound !== false,
    extents: rules?.content.asked === "rules" && rules.content.extents ? (() => { const list = given.value("artroom-rules-extents-1", rules.content.extents!, 262144); if (!isExtents(list)) throw new Error("the rules observation names no list of extents"); return list; })() : null,
    singleControllerException: rules?.content.asked === "rules" && rules.content.singleControllerException === true,
    manifest: { ...lane.manifest, reports },
    controllersOfAuthors: lane.manifest.authors.flatMap((member) => { const seen = given.observed({ member })?.observation; return seen && "subject" in seen && seen.subject === "member" && seen.controller !== null ? [seen.controller] : []; }),
    controllers: (() => { const seen = given.observed({ holders: "rules.publish" })?.observation; return seen && "subject" in seen && seen.subject === "holders" ? (seen.count === 1 ? seen.holders : []) : null; })(),
    controllersHead: (() => { const seen = given.observed({ holders: "rules.publish" })?.observation; return seen && "subject" in seen && seen.subject === "holders" ? seen.head.seq : undefined; })(),
    // Only approving verdicts and unique passed jobs of listed checks give keys to the second step.
    verdicts: statement.verdicts.map((verdict, n) => ({ sound: lane.verdicts[n]?.sound === true, key: verdict.verdict === "approve" ? keyOf(lane.verdicts[n]?.key ?? null) : null })),
    checks: Object.fromEntries(Object.entries(lane.checks).map(([name, check]) => [name, { opening: check.opening, deciding: check.deciding, key: required.includes(name) && statement.jobs.filter((job) => job.name === name).length === 1 && statement.jobs.find((job) => job.name === name)?.state === "passed" ? keyOf(check.key) : null }])),
  };
}

/**
 * The eligibility statement of a publication: the fields of its `reserve`,
 * in this scope's own entry that recorded the message and opened the item.
 * The written types of the message, and the rule `collect-list` for its
 * links, checked each record when it was delivered. `operation` and
 * `manifest` are read from the two references that the entry set from the
 * fields, where the operation is the fact of the source entry.
 */
export function statementOf(own: Own, publication: Item): Statement {
  const input = ownEntry(own, publication.id).input;
  const body = input.type === "delivery" && input.message.class === "request" && isObject(input.message.body) ? input.message.body : null;
  const fields = body !== null && body["message"] === "reserve" && isObject(body["fields"]) ? body["fields"] : null;
  const [operation, manifest] = [publication.refs["operation"], publication.refs["manifest"]];
  if (fields === null || !isFactRef(operation) || !isFactRef(manifest)) throw new Error("a queued publication was opened by the delivery of its reserve");
  return { operation, manifest, verdicts: fields["verdicts"], jobs: fields["jobs"], links: fields["links"], reports: fields["reports"] } as unknown as Statement;
}

/**
 * The commit of each report that the field `reports` of a `reserve` names,
 * in its order (authority note, revision 28, section 6.5, "`reserve` names
 * each selected report", the point "The commit of a report"). The rule
 * reads the entry that an element names, in `uses`: the commit that the
 * entry's recorded effects set in the slot `commit` of the report that the
 * entry opened. Null, for one element: the entry opened no report, or set
 * no commit. Undefined: the entry of an element is not at hand.
 *
 * An entry that is no `report` entry of a scope under `issue` opened no
 * report of an issue lane, so it gives null too. The note has the contract
 * refuse such a message at its delivery, `bad-field`, when it fetches a
 * fact under a written type. This source's delivery checks the kind and
 * the definition of a fact only where a slot or a guard reads it, and not
 * for an element of a list (I3 deltas, entry GD11). So the rule reads both
 * here, and the publication ends `not-reserved`, `evidence-invalid`.
 */
function reportCommits({ uses }: Pick<RuleGiven, "uses">, statement: Statement): readonly (string | null)[] | undefined {
  const commits: (string | null)[] = [];
  for (const named of statement.reports) {
    const used = uses.find((fetched) => fetched.fact.hash === named.hash);
    if (!used) return undefined;
    const { entry } = used;
    const opens = used.under === REPORT.under && entry.input.type === "act" && entry.input.signed.intent.kind === REPORT.kind
      && entry.effects.some((effect) => effect.effect === "open" && effect.item === entry.seq && effect.type === REPORT.kind);
    const set = entry.effects.find((effect) => effect.effect === "value" && effect.item === entry.seq && effect.slot === "commit");
    commits.push(opens && set?.effect === "value" && isObjectId(set.value) ? set.value : null);
  }
  return commits;
}

/**
 * The reports of a `reserve`, bound to the manifest's selections, exactly
 * (the same block, "The reports are bound to the manifest's selections,
 * exactly"). The rule reads the manifest's entry, in `uses`: the field
 * `selected` of its signed intent, a list of records `{ accepted, report
 * }`. It asks two things. The list `reports` has as many elements as
 * `selected` has records. And for each place, the element of `reports` is
 * the same fact as the member `report` of the record of `selected`: the
 * whole fact reference, compared by its text, byte for byte.
 *
 * It gives the commit of each report, in that order. Null: the statement
 * is not what the manifest says, or an entry that an element names opened
 * no report or set no commit. The publication then ends `not-reserved`,
 * `evidence-invalid`. Undefined: the manifest's entry, or the entry of a
 * named report, is not at hand.
 */
function reportsBound(given: Pick<RuleGiven, "uses">, statement: Statement): readonly string[] | null | undefined {
  const manifest = given.uses.find((used) => used.fact.hash === statement.manifest.hash)?.entry;
  const commits = reportCommits(given, statement);
  if (!manifest || commits === undefined) return undefined;
  const selected = manifest.input.type === "act" ? manifest.input.signed.intent.fields["selected"] : null;
  if (!Array.isArray(selected) || selected.length !== statement.reports.length) return null;
  const same = selected.every((record, place) => isObject(record) && isFactRef(record["report"]) && canonicalize(record["report"]) === canonicalize(statement.reports[place]!));
  return same && commits.every((commit): commit is string => commit !== null) ? commits : null;
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
  if (given.rows?.[3] === "over" || given.rows?.[4] === "over") {
    const next = andNext(state, { judging: true, ended: publication.id }, true);
    return { effects: [{ effect: "state", item: publication.id, state: "not-reserved" }, { effect: "value", item: publication.id, slot: "reason", value: "evidence-too-large" }, ...next.effects], opens: next.opens, update: { publication, state: "not-reserved", outcome: "refused", reason: "evidence-too-large" } };
  }
  const recorded = input.evidence.body;
  if (!isRecordedJudgeEvidence(recorded)) throw new Error("the evidence of a judge is not well formed");
  const changes = isDigest(recorded.changes) ? given.value(DESTINATION_CHANGED_SET.domain, recorded.changes, DESTINATION_CHANGED_SET.max) : recorded.changes;
  if (isDigest(recorded.changes) && !isJudgeChanges(changes)) throw new Error("the changed set is not at hand in its declared domain");
  const evidence = { ...recorded, changes } as import("./reservation.ts").JudgeEvidence;
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
    opens: [opening(DESTINATION_KINDS.push, DESTINATION_ATTEMPTS.push, publication.id), opening(DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, publication.id)],
    update: { publication, state: "reserved", outcome: "committed", ...(judged.reason === null ? {} : { reason: judged.reason }), rules },
  };
};

/** What the rule of each kind decides for the outcome entry that is written, for the send mark that its kind holds. `judge` is added with its reader. */
const DECIDES: Readonly<Record<string, Decides>> = {
  [DESTINATION_KINDS.push]: pushDecides,
  // The read of a first head, and of a receipt's ref, sends no update: neither row gives the send mark a request.
  [DESTINATION_KINDS.read]: (given, read) => (typeof readFor(given.state, given.own, read) === "string" ? NOTHING : readDecides(given, read)),
};

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
 * production rule reads each retained lane entry (`READ_LANE`).
 */
const judgeRule = (decides: Decides): PlatformRule => ({
  place: "outcome", clock: true,
  rules: {
    selects: false, read: false, most: { effects: 10, requests: 1, operations: 2 },
    valueDomains: [{ domain: DESTINATION_CHANGED_SET.domain, max: DESTINATION_CHANGED_SET.max }],
    values: (evidence) => isObject(evidence.body) && isDigest(evidence.body["changes"]) ? [{ domain: DESTINATION_CHANGED_SET.domain, digest: evidence.body["changes"], max: DESTINATION_CHANGED_SET.max }] : [],
    origin: ({ state }) => publicationAt(state, branchOf(state)?.refs["judging"])?.id ?? null,
    subjects: (given, _operation, row, first) => {
      const publication = publicationAt(given.state, branchOf(given.state)?.refs["judging"]);
      if (!publication) throw new Error("the judge has no publication");
      const statement = statementOf(given.own, publication);
      const entry = (fact: FactRef) => given.uses.find((copy) => canonicalize(copy.fact) === canonicalize(fact))?.entry;
      if (row === 1) { const merge = entry(statement.operation); return merge?.input.type === "act" ? [merge.input.signed.intent.actor] : []; }
      if (row === 3) { const manifest = entry(statement.manifest); return manifest ? manifestAuthors(manifest) : []; }
      if (row === 4) { const seen = first?.observed({ asked: "rules" })?.observation; return decidingKeys(given, statement, seen && "subject" in seen && seen.subject === "rules" ? seen : null); }
      return [];
    },
    retries: () => false,
    wellFormed: (result, evidence, given) => {
      if (result !== "confirmed" || !isRecordedJudgeEvidence(evidence.body) || evidence.body.ancestors.length > REPORTS_MOST) return false;
      // From revision 28: the member `ancestors` holds those of the reports' commits that the host showed to be ancestors, and no
      // other commit. One that no named report holds does not follow. Where the publication is not `queued` nothing of the
      // evidence is read, and where a named entry is not at hand the rule has a fault in `derives`: neither is judged here.
      const publication = publicationAt(given.state, branchOf(given.state)?.refs["judging"]);
      const commits = publication?.state === "queued" ? reportCommits(given, statementOf(given.own, publication)) : undefined;
      const held = evidence.body.ancestors;
      return commits === undefined || held.every((commit) => commits.includes(commit));
    },
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

/** The two create rules share the evidence classes and token readiness of a push. Their table decides only from `seen`. */
const createRule = (column: typeof firstHeadSeen, effects: number, operations: number): PlatformRule => ({
  place: "outcome",
  rules: {
    selects: false, read: false, most: { effects, requests: 0, operations },
    retries: (_result, write, given) => !closed(targetOf(given.state, given.own, write)) && given.input.type === "outcome" && isObject(given.input.evidence.body) && given.input.evidence.body["seen"] === "absent",
    ready: (state, write, attempt) => (mintOf(state, write, attempt)?.attempts[0]?.outcomes.length ?? 0) > 0,
    wellFormed: (result, evidence) => { const body = bodyOf(evidence.body, ["send", "seen"]); return body !== null && SENDS[result]!.includes(body["send"] as string) && isSeen(body["seen"]); },
    unknown: () => ({ send: "unknown", seen: "failed" }),
    derives: (given, write) => { const { effects, opens } = createDecides(column)(given, write); return { effects, sends: [], opens }; },
  },
});

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
      { effect: "operation", k: 0, owner: DESTINATION, kind: DESTINATION_KINDS.firstHead, attempts: DESTINATION_ATTEMPTS.firstHead, for: resolved.self },
      { effect: "operation", k: 1, owner: DESTINATION, kind: DESTINATION_KINDS.mint, attempts: DESTINATION_ATTEMPTS.mint, for: resolved.self },
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
    run: ({ state: view, own, input, resolved }) => {
      if (input.type !== "delivery" || input.message.class !== "request" || input.message.type !== "relate") throw new Error("open-first-head stands in a `relate` handler, and reads its update");
      const state = isObject(input.message.body) ? input.message.body["state"] : null;
      const branch = branchOf(view)!;
      for (let seq = branch.id; seq < resolved.self; seq += 1) {
        if (own(seq)?.entry.effects.some((effect) => effect.effect === "operation" && effect.owner === DESTINATION && effect.kind === DESTINATION_KINDS.firstHead)) return [];
      }
      return state === "done" && typeof resolved.fields["commit"] === "string" ? [...opened(0, DESTINATION_KINDS.firstHead, DESTINATION_ATTEMPTS.firstHead, branchOf(view)!.id), ...opened(1, DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, branchOf(view)!.id)] : [];
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
      return branch && publication !== null ? [...opened(0, DESTINATION_KINDS.judge, DESTINATION_ATTEMPTS.judge, publication), { effect: "ref", item: branch.id, slot: "judging", to: publication }] : [];
    },
  },
  /**
   * Row 34, at the name `publication` of `also` in `withdraw` (P15). It
   * reads the `publication` items. It gives the publication whose
   * `operation` is the field's, in any state, or none. It never refuses.
   */
  "publication-of": {
    place: "also",
    bind: (items) => items[0]?.id ?? null,
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
        ...(live ? [...opened(0, DESTINATION_KINDS.revoke, DESTINATION_ATTEMPTS.revoke, publication.id), { effect: "value", item: publication.id, slot: "token", value: null } as const] : []),
        ...opened(live ? 1 : 0, DESTINATION_KINDS.read, DESTINATION_ATTEMPTS.read, publication.id),
      ];
    },
  },
  /**
   * Row 36, among the effects of `adopt-head` (P16). It reads nothing more.
   * An `operation` effect: one read of the branch, and its attempt 1.
   */
  "open-branch-read": {
    place: "effect", most: 2,
    run: ({ resolved }) => opened(0, DESTINATION_KINDS.adoptRead, DESTINATION_ATTEMPTS.adoptRead, resolved.subjects.get("on")!.id),
  },
  /**
   * Row z, the second guard of `resend` and of `resend-receipt` (P29;
   * section 12.1.5, "The guard and the effect of `resend`", and "The rows
   * that change, and three new acts"; entry ER4). One rule stands at both
   * rows. It stands after the written guard on the state. It reads the
   * item that the act is for, and the operations of its write with their
   * attempts, in the folded state.
   *
   * - At `resend`, for an `unresolved` publication: it holds when
   *   `aborting` is not set, and every attempt that each of its push
   *   operations states is opened and has an outcome.
   * - At `resend-receipt`, for the receipt that the act names: it holds
   *   when every attempt that each `receipt` operation of that receipt
   *   states is opened and has an outcome.
   *
   * An attempt whose outcome is `unknown` has an outcome. It does not ask
   * that an earlier deciding read has answered: neither act waits for one
   * ("Neither act waits for an earlier read"). Otherwise the act is refused
   * `resend-not-due`, under `guard-failed`.
   */
  "resend-due": {
    place: "guard", refusals: ["resend-not-due"],
    run: ({ state, own, resolved }) => {
      const [on, receipt] = [resolved.subjects.get("on"), resolved.subjects.get("also.receipt")];
      const used = (writes: readonly Operation[]): boolean => writes.length > 0 && writes.every((write) => write.attempts.length === write.most && write.attempts.every((attempt) => attempt.outcomes.length > 0));
      if (receipt?.type === "receipt") return used(receiptWrites(state, own, receipt, resolved.self)) ? { holds: true } : { holds: false, name: "resend-not-due" };
      if (on?.type !== "publication") throw new Error("resend-due stands in a row whose primary item is a publication, or which names a receipt");
      return on.state === "unresolved" && on.values["aborting"] !== true && used(pushesOf(state, own, on, resolved.self)) ? { holds: true } : { holds: false, name: "resend-not-due" };
    },
  },
  /**
   * Row 37, among the effects of `resend` and of `resend-receipt` (P16;
   * the same two passages). One rule stands at both rows. At `resend`, on
   * an `unresolved` publication: a `push` operation with 1 attempt, its
   * attempt 1 and that attempt's `mint`. At `resend-receipt`, for the
   * receipt that the act names: a `receipt` operation with 1 attempt, its
   * attempt 1 and its `mint`. Every attempt of a write has its own mint, so
   * each act opens one. In any other state the written guard has refused
   * the act before this place.
   *
   * Each operation is for the publication, or for the branch at
   * resend-receipt, from what the act adds.
   */
  "reopen-publish": {
    place: "effect", most: 4,
    run: ({ resolved }) => {
      const [on, receipt] = [resolved.subjects.get("on"), resolved.subjects.get("also.receipt")];
      const kind = receipt?.type === "receipt" ? (receipt.state === "owed" ? DESTINATION_KINDS.receipt : null) : on?.type === "publication" ? (on.state === "unresolved" ? DESTINATION_KINDS.push : null) : undefined;
      if (kind === undefined) throw new Error("reopen-publish stands in a row whose primary item is a publication, or which names a receipt");
      return kind === null ? [] : [...opened(0, kind, DESTINATION_ATTEMPTS.resend, on!.id), ...opened(1, DESTINATION_KINDS.mint, DESTINATION_ATTEMPTS.mint, on!.id)];
    },
  },
  /**
   * Row b, the type of the field `links` of `reserve` (P25; section 12.1.5,
   * "The three lists of `reserve`"). From the note's revision 28 the mark
   * stands on that one field, where it stood on three: `verdicts` and
   * `jobs` have written types. A `collect` list may hold more than a
   * declared list. The value is of the type when it is a list of at most
   * 32 records, each with `link` and `issue`. A record with another member,
   * or with a required one missing, and a list with more records, make the
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
   * the mint, the revocation and the deciding read of each attempt", the
   * row `mint` of "What each rule of an outcome yields", and rules T1 to T3
   * of "A token whose write can no longer act, and who cleans it up",
   * decided in revision 28; entries ER7 and FA6). It reads the opening
   * entry; the attempt that it serves; and the target of that write, with
   * its slot `token`: the branch, the publication or the receipt.
   *
   * - T1. `confirmed`, where its attempt has no outcome and the target is
   *   not closed: the slot `token` of the target is this operation's ID,
   *   and a publication that is `reserved` becomes `publishing`. The token
   *   is in use.
   * - T2. `confirmed` otherwise, where its attempt has an outcome or the
   *   target is closed: the token's `revoke` operation and its attempt 1.
   *   No slot of any item is set. The token was minted and is never used.
   *   Its record is this outcome entry, which holds what the host answered.
   * - T3. `refused` or `unknown`: nothing. The request of the write attempt
   *   is then not sent (the rule `push`, `ready`).
   *
   * The body of a `confirmed` outcome is `{ token, ends }`: the host's ID of
   * the credential, a text of at most 256 bytes, and the time at which it
   * ends. Never the secret. Of a `refused` or an `unknown` one it is an
   * empty record. A mint has 1 attempt.
   *
   * A target is closed when the write can no longer act on it (`closed`):
   * a branch that is not `empty`, a publication that is final or
   * `aborting`, a receipt that is final. So a mint that answers after an
   * older read made its target final sets no slot of a final item, which
   * would be a fault of the rule.
   *
   * I3 merge: the revocation of T2 is `for` the holder of the mint, as
   * `tokenStep` says of T4.
   */
  mint: {
    place: "outcome",
    rules: {
      selects: false, read: false, most: { effects: 2, requests: 0, operations: 1 },
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
        const target = targetOf(state, own, served.write);
        const attempt = served.write.attempts.find((opened) => opened.attempt === served.attempt);
        if (target === null || closed(target) || (attempt?.outcomes.length ?? 0) > 0) return { effects: [], sends: [], opens: [opening(DESTINATION_KINDS.revoke, DESTINATION_ATTEMPTS.revoke, mint.for!)] };
        return {
          effects: [{ effect: "value", item: target.id, slot: "token", value: mint.id }, ...(target.type === "publication" && target.state === "reserved" ? [{ effect: "state", item: target.id, state: "publishing" } as const] : [])],
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
   * - `most`: 16 effects, as "`most`, counted again" has it (entry
   *   FA11): the first outcome of an attempt, which publishes. 3 for the
   *   token, 3 for `published`, 3 for the item `receipt`, 4 for the
   *   receipt's operation and its mint, and 3 for the next `judge`.
   * - The token of the attempt is rule T4, and no further attempt is
   *   allowed for a publication that is closed, which is rule T8.
   */
  push: {
    place: "outcome",
    rules: {
      selects: false, read: false, most: { effects: 16, requests: 1, operations: 4 },
      retries: (_result, push, given) => pushOf(given, push).allows,
      ready: (state, push, attempt) => (mintOf(state, push, attempt)?.attempts[0]?.outcomes.length ?? 0) > 0,
      wellFormed: (result, evidence) => { const body = bodyOf(evidence.body, ["send", "seen"]); return body !== null && SENDS[result]!.includes(body["send"] as string) && isSeen(body["seen"]); },
      unknown: () => ({ send: "unknown", seen: "failed" }),
      derives: (given, push) => { const { effects, opens } = pushDecides(given, push); return { effects, sends: [], opens }; },
    },
  },
  /** Authority revision 28, row e: the parentless founding commit or the imported commit, with its own receipt. */
  "first-head": createRule(firstHeadSeen, 15, 5),
  /** The same row's receipt column, including its next mint and one deciding read. */
  receipt: createRule(receiptSeen, 5, 3),
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
   *   `unknown` (section 6.6). It touches no slot `token` and opens no
   *   revocation, also where it closes the target of a write (rule T6).
   *
   * The read of a first head, and of a receipt's ref, runs the same column
   * as its write, without a token step or a further attempt.
   */
  "deciding-read": {
    place: "outcome",
    rules: {
      selects: false, read: false, most: { effects: 13, requests: 1, operations: 3 },
      retries: () => false,
      wellFormed: (result, evidence, given) => {
        const [seen, read] = [bodyOf(evidence.body, ["seen"])?.["seen"], given.input.type === "outcome" ? given.state.operation(given.input.operation) : null];
        if (result !== "confirmed" || !read || !(seen === "absent" || isObjectId(seen))) return false;
        const of = readFor(given.state, given.own, read);
        if (typeof of === "string" && seen === "absent") {
          const opened = ownEntry(given.own, seqOf(read.id)).input;
          const write = opened.type === "outcome" ? given.state.operation(opened.operation) : null;
          // An absent first head or receipt decides nothing while its target is open. The runtime keeps reading.
          if (!write || !closed(targetOf(given.state, given.own, write))) return false;
        }
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
   * From revision 28 it yields only while the two guards of its act still
   * hold, which it reads again at the outcome ("The family of this fault,
   * swept", row 16): `branch.slot` is unset, and no publication is
   * `reserved`, `publishing` or `unresolved`. The act is admitted on the
   * state then, and its read is answered later. A `judge` may reserve a
   * publication between the two, and a head that is adopted under a held
   * slot would move the base of its push. Where a guard does not hold the
   * outcome is written and yields nothing: its evidence `{ seen }` is in
   * its entry, and the admin signs `adopt-head` again when the slot is
   * free. It has no token and opens no cleanup, and it touches no slot
   * `token` (rule T6).
   */
  "adopt-read": {
    place: "outcome",
    rules: {
      selects: false, read: false, most: { effects: 5, requests: 0, operations: 1 },
      retries: () => false,
      wellFormed: (result, evidence) => { const seen = bodyOf(evidence.body, ["seen"])?.["seen"]; return result === "confirmed" && (seen === "absent" || isObjectId(seen)); },
      derives: ({ state, own, input }, read) => {
        const [branch, act] = [branchOf(state), ownEntry(own, seqOf(read.id)).input];
        if (!branch || input.type !== "outcome" || act.type !== "act") throw new Error("an adopt-read is of the act adopt-head on the branch");
        const [seen, commit] = [bodyOf(input.evidence.body, ["seen"])?.["seen"], act.signed.intent.fields["commit"]];
        const holds = (branch.refs["slot"] ?? null) === null && HELD.every((held) => state.count("publication", held) === 0);
        if (!isObjectId(seen) || seen !== commit || !holds) return { effects: [], sends: [], opens: [] };
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
export const destinationRules: Rules = destinationRulesWith(READ_LANE);
