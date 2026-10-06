/**
 * `platform:directory@1`, as data, with its rules (authority note, sections
 * 3.8 and 12.1.2; its table of marks, section 12.1.8, rows 7 to 13, a, d, l
 * and s to u). One directory for a repository. It creates the repository's
 * scopes and its lanes, allocates numbers, and keeps one index row for each
 * lane. It orders no ordinary act of a lane.
 *
 * One member of the data is one row of the note's tables. A cell of the
 * note that begins "Code" is a mark in this data, at the place where its
 * rule is run (the scope contract, section 6.1), and the rule is in
 * `directoryRules`, below. The table of marks gives the directory these:
 *
 * | Rule | Place | Row of the table | At |
 * |---|---|---|---|
 * | `open-import` | 5, effect, in a clause | 7 | `establish`: the `applied` clause of the destination's `create` |
 * | `next-number` | 5, effect | 8 | `open-issue`, `open-pr` |
 * | `definition-active` | 4, guard | 9 | `open-issue`, `open-pr` |
 * | `worker-standing` | 4, guard | 10 | `open-task` |
 * | `reopen-import` | 5, effect | 11 | `retry-import` |
 * | `index-row` | 5, effect | 12 | `index` |
 * | `index-number` | 5, effect | 13 | `index` |
 * | `create-lane` | 6, send | a | `open-issue`, `open-pr` |
 * | `import` | 7, outcome | d | The outcomes of an `import` |
 * | `import-update` | 7, the send | l | The send of the mark of `import` |
 * | `create-rules` | 6, send, with `always` | s (P20) | `establish`: the second send |
 * | `create-destination` | 6, send, with `always` | t (P20) | `establish`: the third send |
 * | `import-spent` | 4, guard | u (P29) | `retry-import` |
 *
 * `compromised` is data, whole. The three creations of the genesis are held
 * sends of the entry, by the contract's rule for a provisional scope.
 *
 * Rows s to u, the selection of `import`, `activeKey` in
 * `worker-standing` and the second refusal of `definition-active` are of
 * the note's revision 25 ("The directory, decided in revision 25"), which
 * was filed for review, and not adopted, when they were written (I3
 * deltas, section 26).
 *
 * The data holds no mark that the table does not list, and every mark has
 * its rule here. So a runtime with this package can run
 * `platform:directory@1`.
 *
 * The two send marks of the genesis both state `always`: the scope
 * contract's revision 19 lets a written list hold several marks when at
 * most one does not state it, and adds no operand for a sibling's scope ID
 * (its section 6.1, "More than one send mark", and decision D19-7). Each
 * rule gives its request in every genesis, so the three creations are at
 * the positions of their forms. The contract states the form. The names of
 * the two rules, and how each derives its request, are the authority
 * note's revision 25's (its section 12.1.2, "The two creation rules of the
 * genesis").
 *
 * One more thing cannot be written, and no mark can stand for it. The
 * register's `create` carries `founding`, the founder's signed intent. No
 * field type holds a signed intent, and it is no field value, so no rule of
 * a marked type could be given it. The data declares no such field. The
 * founder's intent is in the claim's entry, which the creation names by
 * its fact and the genesis retains (entry EP5; the contract's revision 19
 * confirms it).
 *
 * The note's `max`, text lengths and ranges are examples that the proof
 * plan owns. They are written as the note has them.
 */

import type { Digest, FactRef, FieldValue, Grant, MemberObservation, MemberRef, PlatformData, RulesObservation, ScopeId, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest, isDigest, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { PROFILES, isObject, isScopeRef, same, validateDefinition, type Item, type Operation, type RuleEffect, type RuleGiven, type Rules, type StateView } from "@generalbusiness/artroom-derive";
import { CREATION_ATTEMPTS, DIRECTORY, REPOSITORY } from "./register.ts";

export { DIRECTORY };

/** The bound on the attempts of the import that a founding opens (section 12.1.2, the row `establish`; U9). */
export const IMPORT_ATTEMPTS = CREATION_ATTEMPTS;
/** The byte domain of a definition's bytes, which the directory reads from the rules scope by their digest (section 12.1.2, "Activation and the creator's read"). */
export const DEFINITION_DOMAIN = "artroom-definition-1";

const KEY = { type: "text", max: 64 } as const;
const NAME = { type: "text", max: 256 } as const;
const COUNT = { type: "int", min: 0, max: 1000000000 } as const;
const NUMBER = { type: "int", min: 1, max: 1000000000 } as const;
const LABELS = { type: "list", of: { type: "text", max: 64 }, max: 20 } as const;
const LANE_KIND = { type: "enum", of: ["issue", "pr"] } as const;
const LANE_STATE = { type: "enum", of: ["open", "closed"] } as const;
const MERGE = { type: "enum", of: ["committed", "unknown", "published", "refused", "aborted"] } as const;
const CLAIM = { type: "fact", kind: ["found"], under: "platform:register" } as const;
const REPOSITORY_ITEM = { repository: { item: "repository", one: true } } as const;

/**
 * The fields of an index row whose latest source position the row keeps in
 * `seen` (section 12.1.2, the item `lane`). A field is kept only from a
 * source entry at a higher position than the one in `seen` for it.
 */
export const SEEN = ["title", "state", "draft", "merge", "labels", "assignees"] as const;

/** The fields of the two acts that open a lane, beside those of the lane's own genesis. */
const opening = {
  // The definition under which the lane is created: a digest that the rules scope holds as `active`.
  definition: { type: "digest", required: true },
  title: { ...NAME, required: true },
  // A detached text, which travels beside the intent and reaches the lane by its digest.
  body: { type: "text", max: 65536, detached: true, required: false },
} as const;

/** `open-issue` and `open-pr`: an act that opens a `lane` row and sends the one `create` of a lane under the digest that the field `definition` names. */
const opens = (kind: "issue" | "pr"): PlatformData["acts"][string] => ({
  step: "open", on: "lane", grant: kind === "issue" ? "issue.open" : "change.open",
  also: REPOSITORY_ITEM,
  // The fields that the lane's genesis takes from the act are those of the two pinned lane definitions (I3 deltas, entry EP8).
  fields: kind === "issue"
    ? { ...opening, conditions: { type: "list", of: { type: "text", max: 4096 }, max: 16, required: true } }
    : { ...opening, draft: { type: "bool", required: true } },
  guards: [
    // For `open-pr`: the repository has its destination and its rules scope (case b).
    ...(kind === "pr" ? [{ set: "destination", of: "also.repository" }, { set: "rules", of: "also.repository" }] as const : []),
    // The definition is `active` in the rules scope, by an observation of the rules that this entry retains; and its bytes, with
    // their named closure, are retained (Code P19 and P21). Otherwise `not-activated`, or `dependency-unavailable`.
    { code: "definition-active", row: "P19" },
  ],
  effects: [
    { party: { slot: "author", from: { signer: true } } },
    { value: { slot: "kind", from: { const: kind } } },
    { value: { slot: "title", from: { field: "title" } } },
    { value: { slot: "state", from: { const: "open" } } },
    // `number` is `lastNumber` plus 1, and `lastNumber` rises (Code P17).
    { code: "next-number", row: "P17" },
  ],
  // One `create` of a lane under that digest (row a of the further marks). Its clauses are data. `refused` and `conflict`: the row
  // keeps no scope, and is shown as not created.
  sends: [{ code: "create-lane", row: "P21", result: { applied: [{ ref: { slot: "scope", from: { sender: true } } }], refused: [], conflict: [] } }],
  attention: [],
});

export const directory: PlatformData = {
  format: "artroom-definition-1",
  name: "platform:directory",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    // Section 12.1.2, the first row of the item table.
    repository: {
      many: false, max: 1, initial: "open",
      states: { open: { final: false } },
      parties: {},
      refs: {
        register: { fixed: true, required: true, to: { type: "scope", kind: "register" } },
        claim: { fixed: true, required: true, to: CLAIM },
        // Each is set by the `applied` clause of that child's `create`. `membership` is where a directory records its membership
        // reference (section 3.3, "Where it records its membership reference").
        membership: { fixed: false, required: false, to: { type: "scope", kind: "membership" } },
        rules: { fixed: false, required: false, to: { type: "scope", kind: "rules" } },
        destination: { fixed: false, required: false, to: { type: "scope", kind: "destination" } },
      },
      values: {
        repository: { fixed: true, required: true, of: REPOSITORY },
        branch: { fixed: true, required: true, of: NAME },
        founder: { fixed: true, required: true, of: KEY },
        founderHandle: { fixed: true, required: true, of: NAME },
        recoveryKey: { fixed: true, required: true, of: KEY },
        import: { fixed: true, required: false, of: { type: "text", max: 2048 } },
        imported: { fixed: false, required: false, of: { type: "commit" } },
        lastNumber: { fixed: false, required: true, of: COUNT, default: 0 },
      },
    },
    // The second row: one index row for each lane.
    lane: {
      many: true, max: 100000, initial: "listed",
      states: { listed: { final: false } },
      parties: {
        author: { fixed: false, required: false, list: false, author: false },
        assignees: { fixed: false, required: false, list: true, max: 10, author: false },
      },
      refs: { scope: { fixed: false, required: false, to: { type: "scope", kind: "lane" } } },
      values: {
        number: { fixed: false, required: false, of: NUMBER },
        kind: { fixed: false, required: false, of: LANE_KIND },
        title: { fixed: false, required: false, of: NAME },
        state: { fixed: false, required: false, of: LANE_STATE },
        draft: { fixed: false, required: false, of: { type: "bool" } },
        merge: { fixed: false, required: false, of: MERGE },
        labels: { fixed: false, required: false, of: LABELS },
        first: { fixed: false, required: false, of: { type: "time" } },
        latest: { fixed: false, required: false, of: { type: "time" } },
        seen: { fixed: false, required: false, of: { type: "record", of: Object.fromEntries(SEEN.map((field) => [field, { ...COUNT, required: false }])) } },
      },
    },
    // The third row. A `task` row that is `creating` is settled by its creation's result.
    task: {
      many: true, max: 1000, initial: "creating",
      states: { creating: { final: false }, created: { final: false }, refused: { final: true }, conflict: { final: true } },
      parties: {
        worker: { fixed: true, required: true, list: false, author: false },
        controller: { fixed: true, required: true, list: false, author: false },
      },
      refs: {
        scope: { fixed: false, required: false, to: { type: "scope", kind: "task" } },
        lane: { fixed: true, required: true, to: { type: "scope", kind: "lane" } },
      },
      values: {},
    },
  },
  acts: {
    // `establish`: genesis, by the register's `create` (fields `claim`, `repository`, `branch`, `founderHandle`, `recoveryKey` and
    // `import`, section 12.1, "Messages between scopes"; the field `founding` of that table is not declared, entry EP5). It opens
    // `repository`, with its fixed slots from the creation's fields. The note states no grant for it: a genesis of a child is
    // judged by no signer, so nothing reads this one.
    establish: {
      step: "open", on: "repository", grant: "directory.establish",
      also: {},
      fields: {
        claim: { ...CLAIM, required: true },
        repository: { ...REPOSITORY, required: true },
        branch: { ...NAME, required: true },
        founderHandle: { ...NAME, required: true },
        recoveryKey: { ...KEY, required: true },
        import: { type: "text", max: 2048, required: false },
      },
      guards: [],
      effects: [
        // The register is the scope of the claim's entry, read from the reference.
        { ref: { slot: "register", from: { field: "claim", part: "scope" } } },
        { ref: { slot: "claim", from: { field: "claim" } } },
        { value: { slot: "repository", from: { field: "repository" } } },
        { value: { slot: "branch", from: { field: "branch" } } },
        // The founder's key: the value that the claim's entry set as the claim's `founder`, which is the key that signed it.
        { value: { slot: "founder", from: { field: "claim", part: { set: { item: { field: "claim", part: "seq" }, slot: "founder" } } } } },
        { value: { slot: "founderHandle", from: { field: "founderHandle" } } },
        { value: { slot: "recoveryKey", from: { field: "recoveryKey" } } },
        { value: { slot: "import", from: { field: "import" } } },
      ],
      // Three `create` sends, held until the register's `confirm`: membership, rules, destination, in that order. Each `applied`
      // clause sets the child's reference.
      sends: [
        {
          create: {
            kind: "membership", definition: "platform:membership@1",
            fields: { founder: { slot: "founder" }, founderHandle: { field: "founderHandle" }, recoveryKey: { field: "recoveryKey" }, directory: { scope: true } },
            result: { applied: [{ ref: { slot: "membership", from: { sender: true } } }] },
          },
        },
        // The rules scope's creation: `branch`, `directory` and `membership`, which is membership's scope ID. No form of a send says
        // the third, and the contract adds no operand for it: the rule of a send mark gives it (row s of the table of marks, key
        // P20; the contract's revision 19, section 6.1). The mark states `always`: every genesis creates the rules scope. Its
        // clauses are data.
        { code: "create-rules", row: "P20", always: true, result: { applied: [{ ref: { slot: "rules", from: { sender: true } } }] } },
        // The destination's creation: `repository`, `branch`, `import`, `claim`, `directory`, `membership` and `rules`. Three of
        // them no form of a send says: the rule of the send mark gives the request (row t of the table of marks, key P20). Its
        // clauses are data. When `import` is set, the entry that records its applied result opens the operation `import` (Code
        // P16, row 7). The mark states `always`, as the other does, so the list holds two marks and each creation is at the
        // position of its form.
        { code: "create-destination", row: "P20", always: true, result: { applied: [{ ref: { slot: "destination", from: { sender: true } } }, { code: "open-import", row: "P16" }] } },
      ],
      attention: [],
    },
    // `open-issue` and `open-pr`: an act. Grant `issue.open` or `change.open`. It opens `lane`.
    "open-issue": opens("issue"),
    "open-pr": opens("pr"),
    // `open-task`: an act. Grant `task.control`, as the task's controller or as an admin. It opens `task`, `creating`. The task
    // definition is IA's, so this package cannot run a scope under it: the row is built, and its scope is not.
    "open-task": {
      step: "open", on: "task", grant: "task.control",
      also: REPOSITORY_ITEM,
      fields: {
        worker: { type: "member", required: true },
        controller: { type: "member", required: true },
        lane: { type: "scope", kind: "lane", required: true },
      },
      // The worker is an active member. For an agent, its controller is the signer, or the signer is an admin. Both from the
      // observation (Code P19).
      guards: [{ code: "worker-standing", row: "P19" }],
      effects: [
        { party: { slot: "worker", from: { field: "worker" } } },
        { party: { slot: "controller", from: { field: "controller" } } },
        { ref: { slot: "lane", from: { field: "lane" } } },
      ],
      sends: [{
        create: {
          kind: "task", definition: "platform:task@1",
          fields: { worker: { field: "worker" }, controller: { field: "controller" }, lane: { field: "lane" }, membership: { slot: "membership", of: "also.repository" }, directory: { scope: true } },
          result: { applied: [{ state: "created" }, { ref: { slot: "scope", from: { sender: true } } }], refused: [{ state: "refused" }], conflict: [{ state: "conflict" }] },
        },
      }],
      attention: [],
    },
    // `retry-import`: an act. Grant `ledger.retry`. It opens one new `import` operation, with 1 attempt (Code P16; G3).
    "retry-import": {
      step: "transition", on: "repository", grant: "ledger.retry",
      also: {},
      fields: {},
      // "The import's stated attempts are used, and none is `confirmed`." No guard form reads an operation: the guard is a rule
      // (row u of the table of marks, key P29).
      guards: [{ code: "import-spent", row: "P29" }],
      effects: [{ code: "reopen-import", row: "P16" }],
      sends: [],
      attention: [],
    },
  },
  receives: {
    // `index`: a delivery of an advisory, from a lane. It selects the row whose `scope` is the sender, or opens one (Code P15), and
    // a row that is opened here, for a concern, takes the next number (Code P17). A handler of class `advisory` sends nothing. The
    // fields are those of the row that the two pinned lanes send. `number` is the lane's own statement, and no row takes it.
    index: {
      message: "index", class: "advisory", from: { kind: "lane" }, opens: null,
      also: REPOSITORY_ITEM,
      fields: {
        author: { type: "member", required: false },
        number: { ...NUMBER, required: false },
        kind: { ...LANE_KIND, required: false },
        title: { ...NAME, required: false },
        state: { ...LANE_STATE, required: false },
        draft: { type: "bool", required: false },
        merge: { ...MERGE, required: false },
        labels: { ...LABELS, required: false },
        assignees: { type: "list", of: { type: "member" }, max: 10, required: false },
      },
      guards: [],
      effects: [{ code: "index-row", row: "P15" }, { code: "index-number", row: "P17" }],
      sends: [],
      attention: [],
    },
    // `compromised`: a delivery of a `tell`, from this repository's membership scope. The directory sends it on to the destination.
    compromised: {
      message: "compromised", class: "tell", from: { kind: "membership", under: "platform:membership" }, opens: null,
      also: REPOSITORY_ITEM,
      fields: {
        key: { ...KEY, required: true },
        member: { type: "member", required: true },
        entry: { type: "fact", kind: ["revoke-key"], under: "platform:membership", required: true },
      },
      guards: [{ equals: { a: { sender: true }, b: { slot: "membership", of: "also.repository" } }, reason: "not-the-membership" }],
      effects: [],
      sends: [{
        tell: {
          to: { slot: "destination", of: "also.repository" }, message: "compromised",
          fields: { key: { field: "key" }, member: { field: "member" }, entry: { field: "entry" } }, result: {},
        },
      }],
      attention: [],
    },
  },
  timed: {},
  rules: {},
  // The operation kind that this definition owns, with the mark of the rule for its outcome entries (row d of the further marks),
  // and its `send`: the update `import` to the destination (row l). Its clauses are empty.
  outcomes: { import: { code: "import", row: "P16", send: { code: "import-update", row: "P16", result: {} } } },
};

// ---------------------------------------------------------------- reading the directory's state

const PAGE = 100;

/** The one `repository` item. A directory has it from its genesis. */
const repositoryOf = (state: Pick<StateView, "page">): Item | null => state.page("repository", ["open"], null, 1).items[0] ?? null;

/**
 * Where a directory records its membership reference (section 3.3, the
 * table of four rows): the slot `repository.membership`, which the `applied`
 * clause of its own `create` sets, with the incarnation that the directory
 * confirmed. Null: the slot is not set yet, and then the directory admits
 * no act that needs a grant (section 12.1.2, "What the directory admits").
 */
export function directoryMembership(state: Pick<StateView, "page">): ScopeRef | null {
  // The slot's type is a scope of the kind `membership`, which the commit checked when the clause set it.
  const held: unknown = repositoryOf(state)?.refs["membership"];
  return isScopeRef(held) ? held : null;
}

/**
 * The row whose `scope` is that lane. No index is by a value, so the search
 * reads each page of the rows (I3 deltas, entry EP10).
 */
function rowOf(state: Pick<StateView, "page">, lane: ScopeRef): Item | null {
  for (let after: number | null = null; ;) {
    const page = state.page("lane", ["listed"], after, PAGE);
    for (const item of page.items) if (same(item.refs["scope"], lane)) return item;
    const last = page.items.at(-1);
    if (!page.more || !last) return null;
    after = last.id;
  }
}

/** The number that the next row takes: `lastNumber` plus 1 (rows 8 and 13). */
const nextNumber = (repository: Item): number => (typeof repository.values["lastNumber"] === "number" ? repository.values["lastNumber"] : 0) + 1;

/** The two `value` effects of rows 8 and 13: `number` on the new row, and `lastNumber` on the repository. A number past the slot's range is `bad-field`, by the slot's type. */
const numbered = (row: number, repository: Item): RuleEffect[] => {
  const number = nextNumber(repository);
  return [{ effect: "value", item: row, slot: "number", value: number }, { effect: "value", item: repository.id, slot: "lastNumber", value: number }];
};

/** The repository item that the row names as `also.repository`. */
const repositoryAt = (given: RuleGiven): Item => {
  const repository = given.resolved.subjects.get("also.repository") ?? repositoryOf(given.state);
  if (!repository) throw new Error("a directory has its repository item");
  return repository;
};

/**
 * The seed of one scope that the genesis creates beside the two others
 * (section 12.1.2, "The two creation rules of the genesis"): `creator` is
 * this scope's own reference, with its incarnation; `cause` is the digest
 * of this scope's own seed, the contract's third cause; and `ordinal`
 * counts the creations of the entry from 0: membership 0, rules 1,
 * destination 2. The seed of membership that a rule builds is the one that
 * the judge builds for the written `create` of the same entry: both use the
 * ordinal 0 and the same `creator` and `cause`.
 */
const SIBLINGS = { membership: 0, rules: 1, destination: 2 } as const;
const sibling = ({ input, resolved }: RuleGiven, kind: keyof typeof SIBLINGS): Seed => {
  if (input.type !== "genesis") throw new Error("a sibling is a scope that the genesis creates");
  return { v: 1, kind, definition: `platform:${kind}@1`, creator: resolved.at, cause: seedDigest(input.seed), ordinal: SIBLINGS[kind] };
};
/** A sibling's scope ID: the contract's `ScopeId` of the sibling's seed, the text `sc_` and the 52 base32 characters of the seed's digest. It is not the bare digest. */
const siblingId = (given: RuleGiven, kind: keyof typeof SIBLINGS): ScopeId => scopeIdOf(sibling(given, kind));

/** The effects that open one operation of this definition in the entry being written, at ordinal 0, with its attempt 1. */
const opened = (kind: string, attempts: number): RuleEffect[] => [
  { effect: "operation", k: 0, owner: DIRECTORY, kind, attempts },
  { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
];

/** The signed intent of the act that is judged. */
const signed = ({ input }: RuleGiven) => {
  if (input.type !== "act") throw new Error("this rule stands in an act, and reads its signed intent");
  return input.signed;
};

/** The digests that a declaration names in its `create` sends: the next step of its named closure (the contract's section 7.2). */
function namedIn(declared: { acts: Record<string, { sends: readonly unknown[] }>; receives: Record<string, { sends: readonly unknown[] }> }): Digest[] {
  const named = new Set<Digest>();
  for (const from of [...Object.values(declared.acts), ...Object.values(declared.receives)]) {
    for (const send of from.sends) {
      const definition: unknown = (send as { create?: { definition?: unknown } }).create?.definition;
      if (isDigest(definition)) named.add(definition);
    }
  }
  return [...named];
}

/** True when every stated attempt of the operation is opened and the latest outcome of each is `refused`: no answer can still confirm it. */
const spent = (operation: Operation, but: { attempt: number } | null = null): boolean =>
  operation.attempts.length === operation.most && operation.attempts.every((attempt) => attempt.attempt === but?.attempt || attempt.outcomes.at(-1)?.result === "refused");

/** The body of the evidence of a `confirmed` import: the imported head (section 12.1.2, the row "An outcome of `import`"; I3 deltas, entry EP9). */
const importedHead = (body: unknown): string | null => {
  const commit: unknown = typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 1 ? (body as { commit?: unknown }).commit : null;
  return typeof commit === "string" && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(commit) ? commit : null;
};

// ---------------------------------------------------------------- the rules

/**
 * The rules of `platform:directory@1`, by the name that a mark states
 * (section 12.1.8, the table of marks). Each is a pure function of what a
 * rule is given. None reads the clock.
 */
export const directoryRules: Rules = {
  /**
   * Row 7, in the `applied` clause of the destination's `create` (P16). It
   * reads `repository.import`. When `import` is set: an `operation` effect,
   * `import`, with 3 attempts, and its attempt 1. Otherwise nothing.
   */
  "open-import": {
    place: "effect", most: 2,
    run: (given) => (typeof repositoryOf(given.state)?.values["import"] === "string" ? opened("import", IMPORT_ATTEMPTS) : []),
  },
  /**
   * Row 8, among the effects of `open-issue` and `open-pr` (P17). It reads
   * `repository.lastNumber`. Two `value` effects: `number` on the new row,
   * and `lastNumber` on the repository.
   */
  "next-number": {
    place: "effect", most: 2,
    run: (given) => numbered(given.resolved.self, repositoryAt(given)),
  },
  /**
   * Row 9, among the guards of `open-issue` and `open-pr` (P19, P21). It
   * reads the observation of the rules with `asked: "definitions"`, which
   * the entry retains, and the bytes of the definition and of its named
   * closure, each by its digest in the domain of a definition.
   *
   * It holds when the digest that the field `definition` names is `active`
   * in that observation, and the bytes of the definition and of each
   * definition of its closure are at hand and validate. `not-activated`: the
   * digest is not `active` there, whether it never was or is `retired`.
   *
   * `unsupported-definition`, with that name, as the note's revision 25
   * decides it (section 12.1.2, "The refusals of `definition-active`"; I3
   * delta EP15): the bytes of the definition, or of one of its closure, hash
   * to their digest and do not validate in this runtime; or the closure
   * names more definitions than the bound. It does not pass with time, so
   * the signer is not told to send the act again.
   *
   * Not completed, `dependency-unavailable`: the entry would lack the
   * observation, which must be of the rules scope that `repository.rules`
   * names; or it would lack the bytes of one definition (section 12.1.2,
   * "Activation and the creator's read").
   */
  "definition-active": {
    place: "guard", refusals: ["not-activated", "unsupported-definition"],
    run: (given) => {
      const unavailable = { holds: null, reason: "dependency-unavailable" } as const;
      const unsupported = { holds: false, name: "unsupported-definition", code: "unsupported-definition" } as const;
      const digest = given.resolved.fields["definition"];
      const rules: unknown = repositoryAt(given).refs["rules"];
      const observation = given.observed({ asked: "definitions" })?.observation as RulesObservation | undefined;
      if (!isDigest(digest) || !observation || observation.content.asked !== "definitions" || !same(observation.of, rules)) return unavailable;
      if (!observation.content.active.some((active) => active.digest === digest)) return { holds: false, name: "not-activated" };
      const bounds = given.resolved.bounds;
      const read = new Set<Digest>();
      for (const queue: Digest[] = [digest]; queue.length > 0;) {
        const next = queue.shift()!;
        if (read.has(next)) continue;
        if (read.size > bounds.namedDefinitions) return unsupported;
        read.add(next);
        // A value is at hand only when its bytes hash to the digest in the domain. Without one, the bytes cannot be read now.
        const bytes = given.value(DEFINITION_DOMAIN, next, bounds.definitionBytes);
        if (bytes === undefined) return unavailable;
        const checked = validateDefinition(bytes, bounds, PROFILES);
        if (!checked.ok) return unsupported;
        if (checked.definition.digest !== next) return unavailable;
        queue.push(...namedIn(checked.definition.declared));
      }
      return { holds: true };
    },
  },
  /**
   * Row 10, among the guards of `open-task` (P19). It reads the
   * `MemberObservation` of the worker, which the entry retains, and the
   * grant that was judged. It holds when the worker is an active member of
   * this repository's membership scope, with an active key, and, for an
   * agent, its controller is the signer or the signer's role is `admin`. An agent is a member whose
   * observation has a controller (section 3.3, entry ED6). Otherwise
   * `worker-not-active`. Not completed, `dependency-unavailable`, when the
   * entry would lack the observation, or holds one of another scope than
   * `repository.membership` (I3 deltas, entry EP11, as the note's revision
   * 25 confirms it, with `activeKey` added).
   */
  "worker-standing": {
    place: "guard", refusals: ["worker-not-active"],
    run: (given) => {
      const refused = { holds: false, name: "worker-not-active" } as const;
      const worker = given.resolved.fields["worker"] as MemberRef | undefined;
      const grant = given.input.type === "act" ? given.input.grant : null;
      const membership = directoryMembership(given.state);
      if (!worker || !grant || !membership || !same(worker.membership, membership)) return refused;
      const observation = given.observed({ member: worker.member })?.observation as MemberObservation | undefined;
      if (!observation || !same(observation.of, membership)) return { holds: null, reason: "dependency-unavailable" };
      // Revision 25 (I3 delta EP11): a member whose last key is revoked cannot work (section 3.5, rule 5). So `activeKey` is read.
      if (observation.memberState !== "active" || observation.activeKey !== true) return refused;
      // The signer's role is in the observation that the grant was judged on (section 3.3). A grant that holds none shows no role.
      const judgedOn: unknown = (grant.fresh as Grant["fresh"] | null)?.observation;
      const admin = isObject(judgedOn) && judgedOn["role"] === "admin";
      return observation.controller === null || observation.controller === grant.subject.member || admin ? { holds: true } : refused;
    },
  },
  /**
   * Row 11, among the effects of `retry-import` (P16). An `operation`
   * effect, `import`, with 1 attempt, and its attempt 1 (G3).
   */
  "reopen-import": { place: "effect", most: 2, run: () => opened("import", 1) },
  /**
   * Row u, the one guard of `retry-import` (P29), as the note's revision 25
   * decides it (section 12.1.2, "The guard of `retry-import`"; I3 delta
   * EP7). It reads the `import` operations of this scope and their
   * attempts, `repository.import` and `repository.imported`.
   *
   * It holds when `repository.import` is set; `repository.imported` is
   * unset; at least one `import` operation exists; and every attempt that
   * each `import` operation states is opened and has an outcome. An attempt
   * whose outcome is `unknown` is used: its request was sent, and its
   * outcome is recorded. Otherwise `import-not-spent`. It is never not
   * completed: it reads this scope's own state only.
   *
   * The folded state has no read of the operations of one kind, so the rule
   * walks the scope's own entries for the `operation` effects of the kind.
   * A bound or an index for that read is asked of the proof plan. An entry
   * that cannot be read leaves the guard not holding.
   */
  "import-spent": {
    place: "guard", refusals: ["import-not-spent"],
    run: ({ state, own }) => {
      const refused = { holds: false, name: "import-not-spent" } as const;
      const repository = repositoryOf(state);
      const head = state.scope()?.head.seq;
      if (!repository || head === undefined || typeof repository.values["import"] !== "string" || (repository.values["imported"] ?? null) !== null) return refused;
      let imports = 0;
      for (let seq = 0; seq <= head; seq++) {
        const entry = own(seq)?.entry;
        if (!entry) return refused;
        for (const effect of entry.effects) {
          if (effect.effect !== "operation" || effect.owner !== DIRECTORY || effect.kind !== "import") continue;
          const operation = state.operation(`${seq}:${effect.k}`);
          if (!operation || operation.attempts.length < operation.most || operation.attempts.some((attempt) => attempt.outcomes.length === 0)) return refused;
          imports++;
        }
      }
      return imports > 0 ? { holds: true } : refused;
    },
  },
  /**
   * Row 12, among the effects of `index` (P15). It reads the `lane` items
   * and the delivery's `from`. When no row's `scope` is the sender: one
   * `open`, with the sender as the row's `scope`. Then one effect for each
   * field that the message carries and whose source position is higher than
   * the one in `seen` for it, with `first`, `latest` and `seen`.
   *
   * So two rows of one lane give the same row in either order: a field from
   * the lower position changes nothing that the higher one set (case d).
   * `first` and `latest` are the times of the lowest and the highest source
   * positions seen. The times of one history do not go back, so they are
   * the earliest and the latest of the source entries' times.
   *
   * `kind` and `author` have no position in `seen`: a lane states each once,
   * in its genesis. The row takes each when it holds none (entry EP12). The
   * list `assignees` is set whole, as removals and additions.
   */
  "index-row": {
    place: "effect", most: 6 + 2 * 10 + 3 + 3,
    run: (given) => {
      if (given.input.type !== "delivery") throw new Error("index-row stands in a handler, and reads a delivery");
      const from: FactRef = given.input.from;
      const source = given.uses.find((use) => use.fact.hash === from.hash)?.entry;
      if (!source) throw new Error("the source entry of an advisory is among what its entry read");
      const fields = given.resolved.fields;
      const held = rowOf(given.state, from.at);
      const row = held?.id ?? given.resolved.self;
      const effects: RuleEffect[] = held ? [] : [{ effect: "open", item: row, type: "lane", state: "listed" }, { effect: "ref", item: row, slot: "scope", to: from.at as unknown as FieldValue }];

      const kind = fields["kind"];
      if (kind !== undefined && (held?.values["kind"] ?? null) === null) effects.push({ effect: "value", item: row, slot: "kind", value: kind });
      const author = fields["author"] as MemberRef | undefined;
      if (author !== undefined && !held?.parties["author"]) effects.push({ effect: "party", item: row, slot: "author", member: author });

      const before = (held?.values["seen"] ?? {}) as Record<string, number>;
      const seen: Record<string, number> = { ...before };
      for (const field of SEEN) {
        const value = fields[field];
        if (value === undefined || (before[field] !== undefined && before[field] >= from.seq)) continue;
        seen[field] = from.seq;
        if (field !== "assignees") {
          effects.push({ effect: "value", item: row, slot: field, value });
          continue;
        }
        const now = (held?.parties["assignees"] ?? []) as readonly MemberRef[];
        const next = value as unknown as readonly MemberRef[];
        for (const member of now) if (!next.some((other) => same(other, member))) effects.push({ effect: "list", item: row, slot: "assignees", change: "remove", member });
        for (const member of next) if (!now.some((other) => same(other, member))) effects.push({ effect: "list", item: row, slot: "assignees", change: "add", member });
      }
      const [first, latest] = [held?.values["first"], held?.values["latest"]];
      if (typeof first !== "string" || source.time < first) effects.push({ effect: "value", item: row, slot: "first", value: source.time });
      if (typeof latest !== "string" || source.time > latest) effects.push({ effect: "value", item: row, slot: "latest", value: source.time });
      if (Object.keys(seen).some((field) => seen[field] !== before[field])) effects.push({ effect: "value", item: row, slot: "seen", value: seen });
      return effects;
    },
  },
  /**
   * Row 13, among the effects of `index` (P17). It reads
   * `repository.lastNumber`. For a row that this entry opens, which is the
   * first row of a concern: the two `value` effects of row 8. Otherwise
   * nothing (case e).
   */
  "index-number": {
    place: "effect", most: 2,
    run: (given) => {
      if (given.input.type !== "delivery") throw new Error("index-number stands in a handler, and reads a delivery");
      return rowOf(given.state, given.input.from.at) ? [] : numbered(given.resolved.self, repositoryAt(given));
    },
  },
  /**
   * Row a, the one send of `open-issue` and `open-pr` (P21): the `create`
   * of a lane under the digest that the field `definition` names. A written
   * `create` names a constant digest, a platform name or `self`.
   *
   * The seed names this directory as creator, the act's intent as cause,
   * and creation 0. The fields are the lane's genesis fields: the opener as
   * the directory judged it, the title, the number that the row takes, the
   * body by its digest, and for an issue its conditions; for a pull request
   * `draft`, and the repository's `destination` and `rules`. From the
   * platform: `directory`, which is this scope, and `membership`, which is
   * `repository.membership` (the contract's section 6.6).
   */
  "create-lane": {
    place: "send",
    run: (given) => {
      const { intent } = signed(given);
      const { fields, signer, at } = given.resolved;
      const repository = repositoryAt(given);
      if (!signer || !isDigest(fields["definition"])) throw new Error("a lane is created for a signer, under a digest");
      const seed: Seed = { v: 1, kind: "lane", definition: fields["definition"], creator: at, cause: intentDigest(intent), ordinal: 0 };
      const pull = intent.kind === "open-pr";
      const given_ = {
        opener: signer.member, title: fields["title"], number: nextNumber(repository), body: fields["body"],
        ...(pull ? { draft: fields["draft"], destination: repository.refs["destination"], rules: repository.refs["rules"] } : { conditions: fields["conditions"] }),
      };
      const membership = directoryMembership(given.state);
      // An absent value is left out of a message, as an absent field is left out of an intent.
      const sent = Object.fromEntries(Object.entries(given_).filter(([, value]) => value !== undefined && value !== null));
      return { to: seed, message: { class: "request", type: "create", body: { fields: sent, directory: at, ...(membership ? { membership } : {}) } } };
    },
  },
  /**
   * Row s, the second send of `establish` (P20), as the note's revision 25
   * states it (section 12.1.2, "The two creation rules of the genesis").
   * Exactly one request, in every genesis: the `create` of the rules scope,
   * to the seed of creation 1. Its fields: `branch`, the field; `directory`,
   * this scope's own reference; and `membership`, the scope ID of the
   * sibling of creation 0.
   *
   * The body holds no member `membership`: at its genesis the directory
   * records none, and the field holds the ID. The body is the one that the
   * judge builds for the written `create` of membership in the same entry,
   * which is `{ fields }` (I3 deltas, entry EY3).
   */
  "create-rules": {
    place: "send",
    run: (given) => ({ to: sibling(given, "rules"), message: { class: "request", type: "create", body: { fields: { branch: given.resolved.fields["branch"], directory: given.resolved.at, membership: siblingId(given, "membership") } } } }),
  },
  /**
   * Row t, the third send of `establish` (P20), as the note's revision 25
   * states it. Exactly one request, in every genesis: the `create` of the
   * destination, to the seed of creation 2. Its seven fields: `repository`,
   * `branch` and `claim`, each the field; `import`, a truth value, true when
   * the creation's field `import` is present; `directory`, this scope's own
   * reference; `membership`, the scope ID of the sibling of creation 0; and
   * `rules`, the scope ID of the sibling of creation 1. The body holds no
   * member `membership`, as for `create-rules`.
   */
  "create-destination": {
    place: "send",
    run: (given) => {
      const { fields, at } = given.resolved;
      return {
        to: sibling(given, "destination"),
        message: {
          class: "request", type: "create",
          body: { fields: { repository: fields["repository"], branch: fields["branch"], import: fields["import"] !== undefined, claim: fields["claim"], directory: at, membership: siblingId(given, "membership"), rules: siblingId(given, "rules") } },
        },
      };
    },
  },
  /**
   * Row d, for the outcomes of `import` (P16), as the note's revision 25
   * decides them (section 12.1.2, "The outcomes of `import`"; I3 delta EP9).
   *
   * - The kind selects one result. The owner's local guard:
   *   `repository.imported` is unset. So one import is used, also when a
   *   late answer or a retried operation is `confirmed` after another.
   * - A read is never decisive. Another attempt follows a `refused` or an
   *   `unknown`, while the stated number allows and nothing is selected.
   * - The evidence. `confirmed`, basis `own-answer`: `{ commit }`, a commit
   *   ID of 40 or 64 hexadecimal characters, the imported head. `refused`
   *   and `unknown`: an empty record. Any other body is `bad-input`.
   * - When `selected`: one `value` effect, `repository.imported` is the
   *   commit. The update to the destination is the request of the mark's
   *   `send`, the rule `import-update`.
   * - A `confirmed` outcome that is not selected derives nothing and sends
   *   nothing.
   * - `most`: 1 effect, and the one request.
   */
  import: {
    place: "outcome",
    rules: {
      selects: true, read: false, most: { effects: 1, requests: 1, operations: 0 },
      retries: () => true,
      holds: (given) => { const repository = repositoryOf(given.state); return repository !== null && (repository.values["imported"] ?? null) === null; },
      wellFormed: (result, evidence) => (result === "confirmed" ? importedHead(evidence.body) !== null : isObject(evidence.body) && Object.keys(evidence.body).length === 0),
      unknown: () => ({}),
      derives: (given, _operation, selected) => {
        const repository = repositoryOf(given.state);
        if (given.input.type !== "outcome" || !repository) throw new Error("an import is of a directory that holds its repository item");
        return { effects: selected === true ? [{ effect: "value", item: repository.id, slot: "imported", value: importedHead(given.input.evidence.body)! }] : [], sends: [], opens: [] };
      },
    },
  },
  /**
   * Row l, the `send` of the mark of `import` (P16): the `relate`, `import`,
   * of the `repository` item, to the scope that `repository.destination`
   * names. Its clauses are empty.
   *
   * On the selecting outcome: state `done`, with the detail `commit`. That
   * is a `confirmed` outcome of an operation that has selected nothing,
   * while `repository.imported` is unset: the judgment that the ledger makes
   * of `selected`, on the same state. On the last `refused`: state `failed`,
   * with no detail. "The last" is the `refused` outcome after which every
   * attempt that the operation states is opened and each has a `refused`
   * outcome. An `unknown` attempt keeps the operation open, and no `failed`
   * is sent for it. Otherwise no request.
   */
  "import-update": {
    place: "send",
    run: (given) => {
      const input = given.input;
      const repository = repositoryOf(given.state);
      const destination: unknown = repository?.refs["destination"];
      const operation = input.type === "outcome" ? given.state.operation(input.operation) : null;
      if (input.type !== "outcome" || !operation || !repository || !isScopeRef(destination)) throw new Error("an import is of a directory that holds its destination");
      const update = (state: "done" | "failed", detail: Record<string, FieldValue>) =>
        ({ to: destination, message: { class: "request", type: "relate", body: { name: "import", item: { at: given.resolved.at, seq: repository.id, hash: repository.opened }, state, detail } } }) as const;
      if (input.result === "confirmed") return operation.selected === null && (repository.values["imported"] ?? null) === null ? update("done", { commit: importedHead(input.evidence.body)! }) : null;
      return input.result === "refused" && spent(operation, { attempt: input.attempt }) ? update("failed", {}) : null;
    },
  },
};
