/**
 * The ten MCP tools (R-API-9), as `McpToolDescriptor` values (section 22,
 * point 21). Each input schema has exactly the properties of the
 * contract's `McpInput<T>`; test/schema.test.ts checks that at compile time.
 *
 * The descriptions are an agent's user interface: each says what the tool
 * is for, what to keep from its result, and what to do on each likely
 * refusal.
 */

import type { JsonSchema, McpToolDescriptor, McpToolName } from "@generalbusiness/artroom-contract";

// ------------------------------------------------------------ shared parts

const id = (what: string): JsonSchema => ({ type: "string", pattern: "^act_(0|[1-9][0-9]{0,15})_[0-9a-f]{8}$", description: what });
const lane = id("The lane ID: the ID of the claim that opened it, `act_<seq>_<hash>`.");
const lease: JsonSchema = { type: "integer", minimum: 1, description: "Your lease generation, from the claim's `lease.generation`." };
const generation: JsonSchema = { type: "integer", minimum: 1, description: "The proposal generation." };
const expectedGeneration: JsonSchema = {
  type: "integer",
  minimum: 0,
  description: "The lane's current generation as you last saw it: 0 before the first proposal.",
};
const sha: JsonSchema = { type: "string", pattern: "^[0-9a-f]{40}$", description: "A full 40-character commit SHA." };
const globs = (what: string): JsonSchema => ({ type: "array", items: { type: "string", description: "A glob such as `src/api/**` or `src/*.ts`." }, description: what });
const text = (what: string): JsonSchema => ({ type: "string", description: what });
const idempotencyKey: JsonSchema = {
  type: "string",
  pattern: "^[A-Za-z0-9_-]{1,64}$",
  description: "Optional. After a timeout, call again with the same key: the act happens at most once.",
};
const waitMs = (dflt: number): JsonSchema => ({ type: "integer", minimum: 0, maximum: 300000, description: `How long to wait, in milliseconds. Default ${dflt}.` });
const because: JsonSchema = {
  type: "array",
  description: "Optional. What this work rests on: earlier acts, commits or https links.",
  items: {
    oneOf: [
      { type: "object", properties: { act: id("An act ID.") }, required: ["act"], additionalProperties: false },
      { type: "object", properties: { commit: sha }, required: ["commit"], additionalProperties: false },
      { type: "object", properties: { url: { type: "string", pattern: "^https://" } }, required: ["url"], additionalProperties: false },
    ],
  },
};
const anchor: JsonSchema = {
  description: "Where the note goes: `{ act }` for an act, or `{ lane, generation, head, path, line, endLine? }` for lines of a proposal.",
  oneOf: [
    { type: "object", properties: { act: id("The act to annotate.") }, required: ["act"], additionalProperties: false },
    {
      type: "object",
      properties: {
        lane,
        generation,
        head: sha,
        path: text("A repository path, such as `src/api/login.ts`."),
        line: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
      },
      required: ["lane", "generation", "head", "path", "line"],
      additionalProperties: false,
    },
  ],
};

const refusal: JsonSchema = {
  type: "object",
  description: "A refusal: the act was not done. Read `rule`, `reason` and `fix`, then do the fix.",
  properties: {
    refused: { type: "boolean", description: "Always true for a refusal." },
    rule: { type: "string" },
    reason: { type: "string" },
    fix: { type: "string" },
    act: id("The recorded refusal's entry, when it was recorded."),
    current: { type: "object", description: "The lane's current generation, lease generation or operation." },
  },
  required: ["refused", "rule", "reason"],
};

const record = (what: string, required: readonly string[]): JsonSchema => ({
  oneOf: [{ type: "object", description: what, required: ["id", "seq", "kind", "by", "at", ...required] }, refusal],
});

// --------------------------------------------------------------- the tools

const claim = {
  name: "claim",
  method: "claim",
  description: [
    "Claim paths before you change them. This opens a lane that you hold under a lease.",
    "New lane: give `goal` and `scope` (globs such as `src/api/**`).",
    "Change the scope of a lane you hold: give `lane`, `lease`, `expectedGeneration` and the new `scope`.",
    "Take over an unheld lane: give `lane`, `expectedGeneration` and `scope`, and no `lease`.",
    "Keep `lane` and `lease.generation` from the result: every other tool needs them.",
    "`overlaps` lists lanes that may touch the same paths; write them a `note` before you start.",
    "On refusal: `glob-invalid`: use plain globs. `lane-held`: choose other paths, or write a note to the holder.",
    "`scope-overlap`: narrow the scope. `generation-moved`: use `current.generation` as `expectedGeneration`.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      goal: text("New lane: what you will do, in one sentence. Optional when changing a lane."),
      scope: globs("The paths you will change, as globs. Proposals may change only these paths."),
      plan: text("Optional. How you will do it."),
      because,
      lane: id("Only to change or take over an existing lane: its ID."),
      lease: { ...lease, description: "Only to change a lane you hold: your lease generation." },
      expectedGeneration: { ...expectedGeneration, description: "Only with `lane`: the lane's current generation." },
      idempotencyKey,
    },
    required: ["scope"],
    additionalProperties: false,
  },
  outputSchema: record("The Claim: `lane`, `lease` (`holder`, `generation`, `expiresAt`), `scope`, `overlaps`.", ["lane", "lease", "scope", "overlaps"]),
} as const satisfies McpToolDescriptor<"claim">;

const workspace = {
  name: "workspace",
  method: "workspace",
  description: [
    "Get the git remote and write token for a lane you hold. Waits up to `waitMs` (default 20000) for the workspace to be ready.",
    "When `grant` is not null, push your commit to `grant.remote` with plain git, sending the header",
    "`Authorization: Bearer <grant.token>`, for example `git -c http.extraHeader=\"Authorization: Bearer $TOKEN\" push <remote> HEAD:refs/heads/work`.",
    "Then call `propose` with the commit SHA. Never print, log or commit the token.",
    "When `grant` is null, `op.state` says why: `pending`: call again; `failed`: read `op.error`, then call again later.",
    "On refusal: `not-holder` or `lease-fenced`: your lease ended, so claim the lane again.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: { lane, lease, waitMs: waitMs(20000) },
    required: ["lane", "lease"],
    additionalProperties: false,
  },
  outputSchema: {
    oneOf: [
      {
        type: "object",
        description: "`op` is the public workspace operation. `grant` holds `remote`, `token` and `expiresAt`, or is null until ready.",
        properties: { op: { type: "object" }, grant: { oneOf: [{ type: "object" }, { type: "null" }] } },
        required: ["op", "grant"],
      },
      refusal,
    ],
  },
} as const satisfies McpToolDescriptor<"workspace">;

const renew = {
  name: "renew",
  method: "renew",
  description: [
    "Extend your lease on a lane so you keep it while you work. Any accepted act on the lane also extends it.",
    "On refusal: `lease-fenced` or `not-holder`: the lease already ended, so claim the lane again before you continue.",
  ].join(" "),
  inputSchema: { type: "object", properties: { lane, lease, idempotencyKey }, required: ["lane", "lease"], additionalProperties: false },
  outputSchema: record("The renewal, with the new `lease.expiresAt`.", ["lane", "lease"]),
} as const satisfies McpToolDescriptor<"renew">;

const release = {
  name: "release",
  method: "release",
  description: [
    "Give up a lane you hold, with an optional handover `note` for whoever continues. Its workspace token stops working.",
    "Release when you stop working on the lane, even if the work is unfinished.",
    "On refusal: `lease-fenced` or `not-holder`: you no longer hold the lane; nothing more to do.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: { lane, lease, note: text("Optional. A handover note: what is done, what is left, what to watch."), idempotencyKey },
    required: ["lane", "lease"],
    additionalProperties: false,
  },
  outputSchema: record("The release.", ["lane"]),
} as const satisfies McpToolDescriptor<"release">;

const propose = {
  name: "propose",
  method: "propose",
  description: [
    "Propose the commit you pushed as the lane's next generation.",
    "Give `head` (the full SHA you pushed), `summary` (what changed and why) and `expectedGeneration` (0 for the first proposal).",
    "The result lists `obligations`: the reviews and checks it needs before it can land. Watch `attention` for them.",
    "On refusal: `generation-moved`: set `expectedGeneration` to `current.generation` and call again.",
    "`outside-claim`: claim the extra paths, or drop those changes. `head-unknown`: push the commit to the workspace remote first.",
    "`lease-fenced` or `not-holder`: claim the lane again.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: { lane, lease, head: sha, expectedGeneration, summary: text("What changed and why, for reviewers."), because, idempotencyKey },
    required: ["lane", "lease", "head", "expectedGeneration", "summary"],
    additionalProperties: false,
  },
  outputSchema: record("The Proposal: `generation`, `head`, `changed`, `obligations`, `preview`.", ["lane", "generation", "head", "obligations"]),
} as const satisfies McpToolDescriptor<"propose">;

const note = {
  name: "note",
  method: "note",
  description: [
    "Write a note on an act, `anchor: { act }`, or on lines of a proposal, `anchor: { lane, generation, head, path, line }`.",
    "Use notes to answer a review, to coordinate with an overlapping lane, or to ask a question. Reply to a note with `replyTo`.",
    "On refusal: `secret-detected`: remove the secret from `text` and send again.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: { anchor, text: text("The note. Plain text or Markdown."), replyTo: id("Optional. The note this replies to."), idempotencyKey },
    required: ["anchor", "text"],
    additionalProperties: false,
  },
  outputSchema: record("The note.", ["anchor", "text"]),
} as const satisfies McpToolDescriptor<"note">;

const review = {
  name: "review",
  method: "review",
  description: [
    "Approve or object to a proposal you were asked to review (see `attention`).",
    "Give `lane`, `generation` and the `head` you read, `verdict` (`approve` or `object`), `scope` (the globs you actually read),",
    "optional `dependsOn` (paths the reviewed code relies on), and `text` (your reasons).",
    "On refusal: `head-mismatch`: read the proposal again and review its head. `not-authorized-reviewer`: nobody asked you for this review.",
    "`self-review`: ask another member to review it.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      lane,
      generation,
      head: sha,
      verdict: { type: "string", enum: ["approve", "object"] },
      scope: globs("The paths you reviewed. A later generation keeps your verdict only if these paths did not change."),
      dependsOn: globs("Optional. Paths the reviewed code depends on; a change there also needs a new review."),
      text: text("Your reasons."),
      idempotencyKey,
    },
    required: ["lane", "generation", "head", "verdict", "scope", "text"],
    additionalProperties: false,
  },
  outputSchema: record("The review, with the obligations it met in `fulfils`.", ["verdict", "fulfils"]),
} as const satisfies McpToolDescriptor<"review">;

const land = {
  name: "land",
  method: "land",
  description: [
    "Land the latest proposal on a lane you hold: the room merges it to main once every obligation is met.",
    "Give `lane`, `lease`, and the `generation` and `head` of the latest proposal. Waits up to `waitMs` (default 0) for the outcome.",
    "Then read `op.state`: `landed`: done, so release or renew the lane. `retryable`: read `op.fix`, then land again.",
    "`failed`: read `op.reason`; a conflict needs a new proposal. Anything else: still in progress; call `attention` later.",
    "On refusal: `obligation-open`: wait for the review or check named in `reason`. `objection-open`: answer the objection with a note or a new proposal.",
    "`land-in-progress`: wait for the current landing.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: { lane, lease, generation, head: sha, waitMs: waitMs(0), idempotencyKey },
    required: ["lane", "lease", "generation", "head"],
    additionalProperties: false,
  },
  outputSchema: record("The landing, with the landing operation in `op`.", ["lane", "generation", "op"]),
} as const satisfies McpToolDescriptor<"land">;

const attention = {
  name: "attention",
  method: "attention",
  description: [
    "List what needs you: requested reviews and checks, objections, notes, landing outcomes and expiring leases.",
    "Each item's `text` says what to do. Items with `open: false` are done.",
    "Pass the returned `cursor` next time to get only newer items; this is how you follow the room.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      cursor: { type: "string", description: "Optional. The `cursor` from your last call." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Optional. At most this many items. Default 50." },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { items: { type: "array" }, cursor: { type: "string" }, more: { type: "boolean" }, publishedThrough: { type: "integer" } },
    required: ["items", "cursor", "more", "publishedThrough"],
  },
} as const satisfies McpToolDescriptor<"attention">;

const explain = {
  name: "explain",
  method: "explain",
  description: [
    "Explain an act or a recorded refusal by its ID: the rules applied, their inputs and outcomes, and the evidence for a proposal.",
    "Use it when a refusal or an outcome surprises you. For an ID the room does not have, it returns `{ act, outcome: \"not-found\" }`: check the ID.",
  ].join(" "),
  inputSchema: { type: "object", properties: { act: id("The act or refusal ID, `act_<seq>_<hash>`.") }, required: ["act"], additionalProperties: false },
  outputSchema: {
    oneOf: [
      { type: "object", required: ["act", "kind", "outcome", "entry", "decisions", "invariants", "published"] },
      {
        type: "object",
        description: "The room has no such act.",
        properties: { act: { type: "string" }, outcome: { type: "string", enum: ["not-found"] } },
        required: ["act", "outcome"],
      },
    ],
  },
} as const satisfies McpToolDescriptor<"explain">;

/** The ten tools, in the order an agent meets them. */
export const TOOLS = { claim, workspace, propose, note, review, land, renew, release, attention, explain } as const;

export type Tools = typeof TOOLS;

/** Exactly one descriptor per contract tool name, and no other (R-API-9). */
export const TOOL_LIST: readonly McpToolDescriptor[] = Object.values(TOOLS satisfies { readonly [K in McpToolName]: McpToolDescriptor<K> });

/** Instructions an MCP server sends to the agent once, on connection. */
export const INSTRUCTIONS = [
  "Artroom coordinates changes to one repository. To change code:",
  "claim the paths, get a workspace, push with git, propose the commit, follow attention, land, then release.",
  "A refusal is an answer, not a failure: read rule, reason and fix, and do the fix.",
  "After a timeout, repeat the call with the same idempotencyKey. Never print or commit a token.",
].join(" ");
