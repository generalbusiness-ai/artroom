# Acts review for self-hosting

Started 2026-10-02. Revision 4, 2026-10-03. Request `9ea217bc`, promise
`6d0528df`; review repairs `4d82c9a8` and `b12a7797`, current direction
`2b1105bb`.
This note preserves the original five-part review and the wider question:
is Artroom a useful way to represent work as commitments about shared
artifacts? It proposes no implementation and adopts no work-tracking
extension.

The later direction changes the premise. Builder judges when Artroom,
with declared acts, can build a concrete first artroom-jam task. Jam has
its own musical and development vocabularies; the development vocabulary
may evolve during self-hosting. Acts come first, then spikes that block
the actual next task, then jam and the complete documentation plan
together. A vocabulary freeze, an empty backlog and this note's approval
are not additional start conditions.

**Evidence boundary.** The delivered source examined here is `main` at
`6ce1e3ab2be01174b00945785b95b429f9a0dc28`. Its code is unchanged from
the inventory read at `a42c4d83`; the subsequent landing adds only the
reviewed jam design note. Main includes declared-acts
types, the legacy declaration and validation from stage 1, while its
runtime still uses the legacy vocabulary. Stage-2 admission, stage-3
replay and stage-5 generic clients are separate, unfinished deliveries.
Builder's dated readiness judgment `8c87c35c` remains negative; this note
does not replace it. The MCP core contract at `1d9ac5ad` has been checked
as a contract handoff, but its runtime remains owed under `9ca1d290`.
Candidate source is identified separately below.

Labels mean:

- **[Source]** read from the exact repository source or linked primary
  source named beside the claim. Contract rules describe required
  behavior; their presence alone does not prove runtime delivery.
- **[Judgment]** a recommendation or the model defined in this note.
- **[Untested]** a proposed behavior or proof not established here.

## Summary

- The legacy vocabulary remains available. Its complete bodies, targets,
  requests and tools are listed in section 1. They are not a universal
  vocabulary that applications must use. [Source]
- The declared model gives applications names, body fields, target
  restrictions and hold settings over versioned platform steps. A signed
  binding records the meaning the actor read. Historical interpretation
  uses the declaration in force at the entry's sequence. [Source]
- The nineteen development steps have useful mappings, but the mappings
  are partial. A reusable lane, a proposed file and a landing do not by
  themselves represent a requester's acceptance of another actor's
  commitment. Section 2 keeps the losses explicit. [Judgment]
- Unheld filing, addressing, re-addressing, non-landing completion and
  closure remain owed as a complete design. The old D1 body-field sketch
  is an unadopted proposal, not a sufficient authority model or a jam
  start condition. [Source, Judgment]
- Governance can use reviewed files and declared acts. Each application
  must choose who may approve and what the approval means. The special
  sole-admin exception protects `.artroom/**`; it does not automatically
  apply to a custom decision-file obligation. [Source, Judgment]
- Keep a versioned primitive floor and bound historical meanings, rather
  than freezing application names. Changes to the primitive contract
  need their own reviewed amendment; application configuration may evolve
  within it. [Judgment]
- The formal views are tools for finding omissions. This note proves
  neither a conversation equivalence nor workflow-net soundness. The
  governing state, authority, evidence and publication boundaries must be
  modeled before either claim could be established. [Judgment, Untested]

## 1. The vocabulary and its typed inputs

### 1.1 Legacy acts, bodies and targets

The following is the complete body inventory from
`packages/contract/src/acts.ts`, not the higher-level handle inputs that
fill fields from a `Held` or proposal. `?` means optional; all other
fields are required. The target union is in
`packages/contract/src/envelope.ts`. [Source: R-LANE, R-PROP, R-OBL]

| Kind and target | Body fields and types | Meaning and signer boundary |
|---|---|---|
| `claim`, `null` | `goal: string`, `scope: Glob[]`, `purpose?: "config-recovery"`, `plan?: string`, `because?: Reason[]` | Opens a held lane. Admin, maintainer, member or agent; configuration recovery requires an admin's own key. R-LANE-1, R-ADMIN-5 |
| `claim`, `{ lane: LaneId }` | `scope: Glob[]`, `expectedGeneration: Generation`, `lease?: LeaseGeneration`, `goal?: string`, `plan?: string`, `because?: Reason[]` | With lease, holder rescope; without lease, takeover of an unheld lane. R-LANE-2, R-LANE-7 |
| `propose`, `{ lane: LaneId }` | `lease: LeaseGeneration`, `expectedGeneration: Generation`, `head: Sha`, `summary: string`, `because?: Reason[]` | Holder submits a generation at a reachable head. R-PROP-1 to R-PROP-6 |
| `note`, `NoteAnchor` | `text: string`, `replyTo?: ActId` | Any active member, including admin and checker, subject to admission and policy. R-ADM, R-API-9 |
| `review`, `{ lane: LaneId, generation: Generation }` | `head: Sha`, `verdict: "approve" or "object"`, `scope: Glob[]`, `dependsOn?: Glob[]`, `text: string` | Admin, maintainer, member or agent; the obligation must qualify the reviewer. R-GEN-5, R-OBL-2 |
| `check`, `{ lane: LaneId, generation: Generation }` | `obligation: ObligationId`, `check: CheckerName`, `integration: Sha`, `input: CheckInput`, `config: Digest`, `runner: Digest`, `volatile: boolean`, `ok: boolean`, `detail: string`, `landOp?: OpId` | Admin or checker may sign the kind; actual check authority, independent author and exact bindings are still judged. R-GEN-5, R-OBL-3, R-EXEC-8 |
| `land`, `{ lane: LaneId, generation: Generation }` | `lease: LeaseGeneration`, `head: Sha` | Holder starts an operation; the Room publishes. R-LAND, R-PUB |
| `release`, `{ lane: LaneId }` | `lease: LeaseGeneration`, `note?: string` | Holder gives up the hold. The lane remains reusable. R-LANE-8 |
| `renew`, `{ lane: LaneId }` | `lease: LeaseGeneration` | Holder renews the lease. R-LANE-5 |
| `roster`, `null` | The discriminated operation in section 1.2 | Platform membership and key authority. R-GEN-4 |

`Reason` is `{ act: ActId }`, `{ commit: Sha }` or `{ url: string }` with
an HTTPS URL (`ids.ts`, R-ID, R-SIG-6). `CheckInput` is
`{ kind: "tree", tree: Sha }` or
`{ kind: "filtered", snapshot: Digest, paths: Glob[] }`
(`evidence.ts`, R-CARRY-15). A check's optional `landOp` is an operation
binding, not permission to report any landing. [Source]

`NoteAnchor` already supports both `{ act: ActId }` and
`{ lane: LaneId, generation: Generation, head: Sha, path: RepoPath,
line: number, endLine?: number }`. The Room API, MCP schema and CLI
support the latter. Revision 2's claimed note-anchor gap was wrong.
[Source: `acts.ts`, `transports.ts`, `packages/mcp/src/tools.ts`,
`packages/cli/src/main.ts`]

Every v1 signed act is `{ envelope, sig: Base64Url }`. The envelope
contains `v: 1`, `room: RoomId`, `actor: KeyId`, `kind`, the target and
body above, `idempotencyKey: IdempotencyKey` and
`delegation?: DelegationId`. It uses the `artroom-envelope-v1` signing
domain and canonical JSON; identity comes from the verified signature.
[Source: `envelope.ts`, R-SIG-1, R-ADM-2, R-IDEM]

The typed handle removes fields it already carries: `Held` supplies lane
and lease, `ProposalAt` supplies lane, generation and head;
`ProposeInput` omits lease, `ReviewInput` omits head, and `ReleaseInput`
has only `note?`. `ClaimInput` distinguishes new claim, held rescope and
LaneId takeover. These conveniences do not remove fields from the signed
wire bodies. [Source: `acts.ts`, `lanes.ts`, `transports.ts`]

### 1.2 Roster operations and every operation field

`Role` is `admin`, `maintainer`, `member`, `agent` or `checker`.
`Principal` is a member, team or `role:<Role>`. The roster operation body
always includes `op` plus the fields below. [Source: `roster.ts`, R-GEN-4]

| Op | Remaining fields | Signer |
|---|---|---|
| `invite` | `member: MemberId`, `role?: Role`, `custody: "client" or "room"`, `expiresAt: Timestamp`, `secretHash: Digest`, `session?: { kinds: DelegableKind[] or "*", lanes: "*", ttlSeconds: number }` | Active admin or recovery key |
| `join` | `invitation: InvitationId`, `secret: Base64Url` | Invited key, once, on the correct custody path |
| `set-role` | `member: MemberId`, `role: Role` | Active admin or recovery key |
| `remove` | `member: MemberId` | Active admin or recovery key |
| `revoke-key` | `key: KeyId`, `reason: "retired" or "compromised"` | Active admin or recovery key |
| `team` | `team: TeamId`, `members: MemberId[]` | Active admin or recovery key |
| `delegate` | `to: KeyId`, `kinds: DelegableKind[] or "*"`, `lanes: LaneId[] or "*"`, `expiresAt: Timestamp` | Grantor's active member key |
| `undelegate` | `delegation: DelegationId` | Grantor's active member key |
| `rotate-recovery` | `key: KeyId` | Recovery key only |

`DelegableKind` is a legacy act kind or `renew`, never `roster`.
`role` is required on an invitation for a new member and absent when
adding a key to an existing member. A recovery key is not a member and
cannot sign ordinary work acts. An admin cannot rotate it.
[Source: `roster.ts`, R-GEN-3 to R-GEN-6, R-ADM-12]

An actor named **checker in this gitseq workroom** is a job assignment,
not Artroom's `checker` role. That role permits `check`, `note`, and
grantor delegation operations; it cannot claim, propose, review or land.
A future development reviewer needs an authorized member/agent/admin
identity and a qualifying review principal or team. Declared acts keep
the checker role limited to `check` and `comment` steps. Policy cannot
turn that role into a human reviewer. [Source: R-GEN-5, R-DECL-11]

### 1.3 Signed requests that do not create acts

`SignedRequest` is `{ request: RequestEnvelope, sig: Base64Url }`.
`RequestEnvelope` contains `v: 1`, `room: RoomId`, `actor: KeyId`,
`delegation?: DelegationId`, `request: RequestBody`, `nonce: string` and
`notAfter: Timestamp`. The signing domain is `artroom-request-v1`.
The nonce is 16–64 allowed characters, single-use; `notAfter` is bounded
to 300 seconds beyond the Room clock. [Source: `envelope.ts`, R-CRED-5/6]

| RequestBody.kind | Other required fields | Authority and result |
|---|---|---|
| `workspace` | `lane: LaneId`, `lease: LeaseGeneration` | Current holder; public WorkspaceOp, without the token |
| `workspace-token` | `lane: LaneId`, `lease: LeaseGeneration` | Current holder judged on every retrieval; WorkspaceGrant |
| `session` | `ttlSeconds: number` | Authenticated read session; Session |

The request's nonce and expiry are not an act's idempotency key or lease.
The separately typed invitation redemption and founding calls are not
additional `RequestBody` variants. [Source: `envelope.ts`, `transports.ts`,
R-WS-1/2, R-GEN-10, R-CRED-9]

### 1.4 MCP: current ten, core fourteen and planned eighteen

The runtime descriptors on main are the source for the following table.
Fields have the same types as section 1.1; `waitMs`, `limit`, `line` and
generation fields are numbers, and cursors are strings. Idempotency keys
are optional in main's descriptors, which is different from the adopted
core contract. [Source: `packages/mcp/src/tools.ts`, R-API-9]

| Tool on main | Complete input fields (`?` optional) |
|---|---|
| `claim` | `scope: Glob[]`, `goal?: string`, `plan?: string`, `because?: Reason[]`, `lane?: LaneId`, `lease?: LeaseGeneration`, `expectedGeneration?: Generation`, `idempotencyKey?: IdempotencyKey`; new claims require goal and existing claims require the appropriate generation/lease at admission |
| `workspace` | `lane: LaneId`, `lease: LeaseGeneration`, `waitMs?: number` |
| `propose` | `lane: LaneId`, `lease: LeaseGeneration`, `head: Sha`, `expectedGeneration: Generation`, `summary: string`, `because?: Reason[]`, `idempotencyKey?: IdempotencyKey` |
| `note` | `anchor: NoteAnchor`, `text: string`, `replyTo?: ActId`, `idempotencyKey?: IdempotencyKey` |
| `review` | `lane: LaneId`, `generation: Generation`, `head: Sha`, `verdict: Verdict`, `scope: Glob[]`, `dependsOn?: Glob[]`, `text: string`, `idempotencyKey?: IdempotencyKey` |
| `land` | `lane: LaneId`, `lease: LeaseGeneration`, `generation: Generation`, `head: Sha`, `waitMs?: number`, `idempotencyKey?: IdempotencyKey` |
| `renew` | `lane: LaneId`, `lease: LeaseGeneration`, `idempotencyKey?: IdempotencyKey` |
| `release` | `lane: LaneId`, `lease: LeaseGeneration`, `note?: string`, `idempotencyKey?: IdempotencyKey` |
| `attention` | `cursor?: Cursor`, `limit?: number` |
| `explain` | `act: ActId` |

The core handoff at `1d9ac5ad` adds four named reads, requires the act
tools' `idempotencyKey`, adds `attention.waitMs?`, and bounds waits to
45,000 ms. It defines object-shaped not-found results for MCP; the
underlying operation lookup throws its lookup error. [Source: that
head's `transports.ts`, protocol section 34; runtime unfinished]

| Added core read | Complete input |
|---|---|
| `lanes` | `state?: "held" or "unheld"`, `holder?: MemberId`, `touches?: Glob`, `cursor?: Cursor`, `limit?: number` |
| `lane` | `lane: LaneId` |
| `proposal` | `lane: LaneId`, `generation: Generation` |
| `operation` | `id: OpId`, `kind: "workspace" or "preview" or "land"`, `until?: string[]`, `waitMs?: number` |

The older MCP plan's section 6 described eighteen tools: these fourteen
plus `room`, `diff`, `file` and `policy`. Its inputs below are design
inputs, not implemented types or a claim that all eighteen exist.
The core contract uses `touches`, not the old plan's scope/text filter.
[Source: `request/mcp-plan:notes/2026-10-01-mcp-plan.md`, section 6]

| Later planned tool | Input in that plan | Remaining work |
|---|---|---|
| `room` | none | New RoomApi read; room/caller context and held lanes |
| `diff` | `lane`, `generation`, `path?`, `cursor?` | New bounded diff read; specify exact types/limits in its own reviewed contract |
| `file` | `path`, `at` (pinned head, commit or `main`) | New bounded file read; pagination is described but its input cursor is not specified in the table |
| `policy` | none | New active-policy read, including version and plain-English presentation |

Stage 5 adds generic tools beside the named tools. Its candidate
`477dda2f`, `transports.ts`, has `acts({ at?: Seq, policy?: PolicyVersion })`
with mutually exclusive selectors, and
`act({ kind: KindName, target: DeclaredTarget, body: Json object,
binding: Binding, idempotencyKey: IdempotencyKey })`. These compose with
the fourteen-tool core; they do not erase the four reads or make the
later eighteen-tool plan delivered. [Source: candidate, R-API-9 as amended]

Toolsets `builder`, `reviewer`, `observer` and `all` select discovery,
not authority. Generic-act eligibility uses current declarations,
current role, delegability and the exact signed grant map. Existence of
a generic tool is not a wildcard grant. An accepted exact retry still
goes to Room admission when its tool is no longer listed. [Source: core
section 34, declared-acts section 33, stage-5 clarification `fa120186`]

### 1.5 CLI commands and their actual inputs

The command table is `packages/cli/src/main.ts`; `cli.ts` only wires it
to the process. Common options are `--json`, `--room ROOM`, `--lane LANE`,
`--idempotency-key KEY`, `--verbose`, `--help`/`-h`. Numeric options are
parsed from whole-number strings. [Source]

| Command on main | Positional inputs and specific options |
|---|---|
| `login`, `redeem` | Invitation link; client key or room-custody bearer respectively |
| `claim` | Scope globs; `--goal TEXT`, `--plan TEXT`, repeated `--because REF`, `--expect N`; `--lane` selects rescope/takeover and the CLI reads whether it holds the lane |
| `workspace` | No required positional argument; `--timeout S`; current held lane; configures the remote and credential |
| `propose` | `--message`/`-m SUMMARY`, `--head SHA`, `--expect N`; defaults to local HEAD and current generation |
| `land` | `--wait`, `--timeout S`, `--generation N`; reads the held lane and proposal head |
| `wait` | Optional operation ID; `--timeout S`; otherwise follows the recorded landing |
| `renew` | No specific options; selected held lane |
| `release` | `--message`/`-m NOTE`; selected held lane |
| `note` | Act ID or `LANE#GEN:PATH:LINE[-ENDLINE]`; `--message`/`-m TEXT`, `--reply-to ACT`; line anchor's head comes from the proposal |
| `review` | `LANE#GEN`; one of `--approve`/`--object`, repeated `--scope GLOB`, repeated `--depends-on GLOB`, `--message`/`-m TEXT`, `--head SHA` |
| `attention` | `--cursor C`, `--limit N`, `--all` |
| `explain` | Act ID |
| `log` | `--after SEQ`, `--limit N`, `--cursor C` |
| `agents-md` | `--mcp`; prints the room's agent instructions |
| `mcp` | No specific options; serves stdio using the selected credentials |
| `help` | Prints usage; also `--help`/`-h` |

Main does not have standalone `lane` or `verify` commands in this table.
The log package has a verifier library (`packages/log/src/verify.ts`);
the protocol and notes describe `artroom verify` as a desired surface.
Neither makes it a delivered CLI command at this snapshot. Record that
surface gap when a concrete task needs it; do not confuse replay-library
delivery with CLI packaging. [Source, Judgment]

The stage-5 candidate adds `acts [KIND] --at SEQ|--policy VERSION` and
`act KIND --binding BINDING`, with `--target JSON`, `--generation N`,
`--entry ACT`, repeated `--set FIELD=VALUE`, `--body JSON` and repeated
`--because REF`, plus the common `--lane` and retry key. It
prints declarations and historical labels and retains the exact binding
in its retry journal. This remains candidate behavior, not a main/deploy
claim. [Source: `477dda2f`, CLI `main.ts`, `declared.ts`, README]

### 1.6 Declared acts: the versioned floor and application inputs

`declarations.ts` is delivered stage-1 contract material; section 33 of
the protocol defines its required runtime. A v1 policy uses the legacy
vocabulary. A v2 policy declares application kinds over
`artroom-steps-v1`, evaluated under `artroom-jsonata-v1`. Platform kinds
`renew`, `roster` and `recover` remain fixed. [Source: R-DECL-1/2/14/21/22]

| Primitive step | Required body fields, with optional fields marked |
|---|---|
| `open` | `scope: Glob[]` for `body.scope`; no scope field for a fixed template |
| `take` | `expectedGeneration: Generation`; `scope: Glob[]` for body-scoped threads; `lease: LeaseGeneration` for rescope, absent for takeover |
| `version` | `lease: LeaseGeneration`, `expectedGeneration: Generation`, `head: Sha` |
| `review` | `head: Sha`, `verdict: Verdict`, `scope: Glob[]`, `dependsOn?: Glob[]` |
| `check` | All nine required CheckBody fields from section 1.1, plus `landOp?: OpId` |
| `land` | `lease: LeaseGeneration`, `head: Sha` |
| `release` | `lease: LeaseGeneration`, `note?: string` |
| `hand-over` | `lease: LeaseGeneration`, `to: MemberId` |
| `comment` | `replyTo?: ActId` |

These are step fields; application fields such as goal, summary, signal
and review text come from the declaration. Every act may carry
`because?: Reason[]`. Target shapes are `none` (`null`), `thread`
(`{ lane }`), `version` (`{ lane, generation }`), `entry` (`{ act }`)
and `line` (the full line anchor above). Each accepted target runs one
step; only `version` then `land` may be combined, on `thread`.
[Source: R-DECL-4/5/12, `declarations.ts`]

An `ActDeclaration` contains `label: string`, `targets` mapping accepted
shapes to step lists, `threads?: ThreadKind[]`,
`body?: Record<string, DeclaredField>`,
`who: { roles: non-admin Role[], delegable?: boolean }`,
`hold?: HoldDeclaration`, `refusals?:` code-to-reason/fix map and
`help?: string`. Admin is implicit; checker can only run check/comment.
The opening hold contains `scope: "body.scope" or Glob[]`,
`conflict?: "exclusive" or "by-scope"`, `leaseSeconds?: number`,
`reserveSeconds?: number`, `workspace?: boolean`. Thread opening records
its kind and resolved hold for its lifetime. [Source: R-DECL-3/6–13]

The field types are `text` with byte `max`, safe `int` with `min`/`max`,
`bool`, `enum` with `values`, `globs` with `max`, `member`, `act`, and
`segment`. Each may specify `optional?: boolean` or
`requiredFor?: TargetShape[]`, never both. Bodies remain closed and
bounded; declarations cannot exempt arbitrary strings from secret
scanning. [Source: `DeclaredField`, R-DECL-12, R-SEC]

`PolicyDocumentV2` contains `format: "artroom-policy-v2"`, `profile`,
`steps`, `owners`, `carry`, `lanes`, `retiredEvidence`, `rules` and
`acts`. `CheckerConfigV2` uses `format: "artroom-checker-v2"` and adds
`act: KindName` to the checker configuration. [Source: `declarations.ts`]

A declared envelope contains `v: 2`, `room`, `actor`, `kind`, `binding`,
`target`, JSON-object `body`, `idempotencyKey`, and `delegation?`, still
signed under `artroom-envelope-v1`. A generic bearer submission carries
`kind`, `binding`, `target`, `body`, `idempotencyKey`. The client supplies
the binding; neither discovery nor Room admission silently replaces it.
[Source: `DeclaredEnvelope`, `DeclaredBearerAct`, R-DECL-16]

The binding covers steps version, kind name, targets, thread kinds,
body-field requirements and resolved hold defaults. It excludes label,
help, refusal wording and `who`. Exclusion of `who` does not mean old
delegates keep permission: current role and delegability are checked
separately. A Room-default lease appears as `"room"` in the binding;
its actual numeric value is stored at thread opening. [Source: R-DECL-15/17]

In v2, `delegate` has `op`, `to: KeyId`,
`kinds: ["renew"] or []`, `acts: Record<KindName, Binding>`,
`lanes: LaneId[] or "*"`, `expiresAt: Timestamp`. A room-custody
invitation's session has those platform `kinds`, the same `acts` map,
`lanes: "*"`, `ttlSeconds: number`. No act wildcard is signed: clients
expand it to exact kind/binding entries before signing. Roster and
recovery are never delegated. [Source: `DelegateOpV2`,
`InvitationSessionV2`, R-DECL-17]

Recovery remains a v1 platform envelope with kind `recover`, no binding
or delegation, signed by an admin's own key. Every body contains `op`:
[Source: `RecoverOp`, `RecoverTargets`, R-DECL-21]

| Recover op | Target | Other body fields |
|---|---|---|
| `open` | `null` | `goal`, `scope`, `plan?`, `because?` |
| `take` | `{ lane }` | `scope`, `expectedGeneration`, `lease?`, `goal?`, `plan?`, `because?` |
| `version` | `{ lane }` | `lease`, `expectedGeneration`, `head`, `summary`, `because?` |
| `approve` | `{ lane, generation }` | Complete ReviewBody: `head`, `verdict`, `scope`, `dependsOn?`, `text` |
| `land` | `{ lane, generation }` | `lease`, `head` |
| `release` | `{ lane }` | `lease`, `note?` |
| `note` | `NoteAnchor` | `text`, `replyTo?` |

The types in that table match section 1.1. Recovery changes only
`.artroom/**` and keeps the fixed recovery guard. An application field
called `purpose` must not acquire legacy recovery authority by name.
[Source: R-ADMIN-5–9, R-DECL-21]

Stage 2 owns recorded kinds, binding-aware admission and base lease
rules. Stage 3 owns both complete log-kind lists, replay decisions and
retained evaluation contexts, including budget failures. Stage 4 adds
fixed scopes/slots, either-side exclusive conflict checks, hand-over and
reservation expiry, workspace-free holds, unanchored comments,
compound steps, prepared events and v2 checker jobs. Stage 5 owns generic
clients and historical presentation; its v2 check transport clarification
is retained in D8 below. None of these ownership statements is a claim
that an unfinished stage is deployed. [Source: `869d9aad`, `fa120186`,
declared-acts stage requests]

### 1.7 Attention, refusals and changes over time

Main's `AttentionWhy` has thirteen discriminated variants. The complete
variant fields are in `pagination.ts`: [Source: R-API-6–9]

| why | Other fields |
|---|---|
| `review-requested` | `proposal`, `obligation`, `as: Principal or "owners"` |
| `check-requested` | `proposal`, `obligation`, `op?` |
| `objection` | `proposal`, `review` |
| `note` | `note`, `replyTo?` |
| `land-outcome` | `op`, `state: landed/aborted/retryable/failed` |
| `recut-needed` | `lane`, `op`, `unheld: boolean` |
| `lease-expiring` | `lane`, `expiresAt` |
| `lane-unheld` | `lane`, `reason: released/expired` |
| `evidence-invalidated` | `proposal`, `obligation` |
| `publication-unresolved` | `op`, `since` |
| `revert-lane` | `lane`, `of` |
| `policy` | `rule`, `act`, `text` |
| `log-publication-stalled` | `reason: refused/object-too-large/unexpected-writer/unresolved/repository-gone`, `detail`, `since` |

Each attention item also has `id`, `seq`, `lane?`, `text`, `open`.
Its page includes `items`, `cursor`, `more`, `publishedThrough`.
Stage 4's planned `check-unroutable` attention adds `proposal`,
`obligation`, `check`, `thread`, `act`. [Source: `pagination.ts`,
`declarations.ts`, R-DECL-19]

Refusal is `{ refused: true, rule, reason, fix?, act?, current? }`;
current may contain generation, lease generation or operation. `rule`
is a platform code or policy rule ID, not a permanently closed list of
all possible policy refusals. `errors.ts` lists the platform codes;
declared acts add `kind-undeclared`, `binding-stale`, `wrong-thread`,
`scope-fixed`, `reserved`. The first two are unrecorded early refusals;
authentication/transport failures use `ArtroomError`, not Refusal.
[Source: R-API-1, R-ADM, R-DECL-16, `errors.ts`]

The contract has changed shapes as well as adding fields. Protocol
section 24 split entry construction; section 27 changed subscription
bytes and WebSocket authentication; section 29 added bound checker jobs
and snapshots; sections 30/32 changed log layout and token mints;
section 33 introduces v2 declared envelopes and grants. Section 34 in
the MCP core handoff is amendment 7. Revision 2's proposed universal
freeze and its reuse of occupied amendment numbers are withdrawn.
[Source: protocol revision sections at the named heads]

## 2. The development loop, mapped without claiming equivalence

These nineteen rows preserve the original loop. **Delivered** means an
operation exists at the main snapshot; **planned** identifies the
declared model or another unfinished delivery; **partial/gap** says what
the mapping loses. This is a design mapping, not an import plan or proof
that Artroom already reproduces gitseq. [Judgment]

| # | Current gitseq step | Artroom representation | Limit or remaining design |
|---|---|---|---|
| 1 | File a request to a performer, with conditions and destination | D1 work item; could be application data/acts, with a primitive change if needed | No delivered unheld-at-filing, addressed item or requester/conditions lifecycle. A held claim is not this request |
| 2 | Promise the request | Take a hold and cite the request in `because`; a declared commitment could record acceptance | Takeover alone does not accept a particular request's conditions or retain requester authority |
| 3 | Implement on a branch/worktree | Delivered workspace and git push, then a pinned proposal head | The workspace is a hold resource; branch names are not review bindings |
| 4 | Publish artifacts at the exact head on an accountable promise | Delivered proposal pins a head and computes paths; summary reports work | It does not close a conversation or reproduce per-path promise accounting automatically |
| 5 | Ask an independent reviewer | Delivered `require` review obligation and attention to its principal/owners | A job named checker needs a review-capable identity. Explicit reviewer selection is application policy/data, not automatic `role:checker` |
| 6 | Review an exact head | Delivered review verdict, scope, dependencies and line/act notes | Signer qualification and independent author remain mandatory |
| 7 | Revise and republish | Delivered next proposal generation and carrying decisions | Carrying has explicit path/global-input rules; the previous verdict is not indiscriminately reused |
| 8 | Explain merge eligibility, then land | Holder calls delivered `land`; Room judges obligations and publishes | Planner merge authority is not copied. Requester acceptance needs a separate configured obligation or work-item transition |
| 9 | Report what tests and conditions were met | Delivered proposal summary, evidence and landing outcome | Non-artifact results and requester satisfaction are D1/conversation gaps; a landing is not every kind of completion |
| 10 | Assert a durable claim and adopt it | Reviewed decision file or a declared comment with an explicit adoption convention | Filing a claim is not adopting it; no general ratification semantics are implied |
| 11 | Offer a decision for ratification | Proposal/version of a decision file, followed by the designated review and land | Policy must choose the adopter and activation meaning |
| 12 | Dissent without blocking | Delivered note on an entry or proposal lines | A review objection can block; a note is not a policy change |
| 13 | Supersede a request with a replacement | D1 explicit closure and replacement link | Delivered release leaves a reusable lane, not a retired request |
| 14 | Reassign if unclaimed | D1 guarded change of addressee | Must refuse a race with acceptance/takeover; changing a member name is not a counter-offer |
| 15 | Wait/status/work-next | Delivered attention, Room reads and subscribe/watch; four MCP reads and generic catalogue planned | Attention reasons are not the full owed-command projection. WebSocket uses watch; subscribe is RPC bytes or HTTPS long poll |
| 16 | Verify the published record | Delivered log verifier library; declared replay stage 3 owed | Standalone CLI verify is absent at this main snapshot. Main's verifier checks published authority and policy decisions, not full lane/lease/landing effects or the absence of unpublished acts |
| 17 | Add actors and grant/revoke roles | Delivered invite/join/set-role/remove/revoke-key/team/delegate/undelegate | Signers and credential custody are constrained; rotation is recovery-only |
| 18 | Define vocabulary/admission and seal governed changes | Planned v2 declarations, reviewed policy activation and retained bindings | Application names may evolve. An admission profile and a sealed gitseq fold are not identical to a Room's policy runtime |
| 19 | Ephemeral chat and presence | An application's separate live layer, or durable comments for useful statements | Room notes are permanent; no delivered authoritative meaning is assigned to presence |

The loop's useful correspondences justify trying the platform for a
concrete build task. They do not justify counting sixteen rows as a
complete behavioral translation: several of those rows lose actors,
conditions, state or authority. [Judgment]

## 3. Gaps as decisions and recommendations

### D1. Unheld, addressed work and completion without landing

**Keep the complete design owed.** It must cover filing before any work
starts, an optional scope, addressing to the intended performer,
accepting conditions, re-addressing, decline, requester withdrawal,
performer cancellation, completion without a landing, acceptance or
rejection of the result, closure and replacement links. These are useful
planning requirements even when a first build task can use a simpler
delivered practice. [Judgment]

The old option proposed `claim.hold?: boolean`, `claim.to?: Principal`
and `release.outcome?: done-elsewhere/wont-do/duplicate-of`, plus
`work-addressed` attention. Those are **not adopted fields** in either
the legacy bodies or the v2 primitive set. Declared `open` still takes
a hold; ordinary `release` still requires the holder's lease and leaves
the thread reusable. Merely adding application fields does not create
the missing state transition. [Source: docs plan D1, R-DECL-5]

**Recommendation.** Design the application work-item lifecycle first,
then test whether reviewed repository data and declarations can enforce
it. If the platform needs an unheld opening, closure or another guard,
write a separately reviewed primitive amendment with an unused number.
Do not infer permission from the spelling of an application field.
Keep the item, conversation and resource hold distinct. [Judgment]

The design must answer these authority cases before implementation:

| Transition | Authority and race that must be specified |
|---|---|
| File/address | Who is the requester; who may name/change performer and conditions; no borrowed actor signature |
| Accept/takeover | Intended performer or explicit substitute; bind the exact conditions/version; refuse closed or concurrently withdrawn work |
| Re-address | Requester/admin according to explicit policy; only while unaccepted; compare the same state/version as a simultaneous acceptance |
| Decline | Addressed performer can end its conversation; decide whether the underlying item remains open for another performer |
| Withdraw | Requester can withdraw after a promise as well as before it, subject to an explicit reserved-publication boundary; not a holder-only release pretending to be requester authority |
| Cancel/release | Performer relinquishes its commitment/hold; that does not assert requester satisfaction or silently retire the item |
| Report/accept | Performer reports evidence and outcome; requester or its designated acceptance principal declares satisfaction or rejection |
| Close without landing | Filer/holder/admin powers and required evidence are explicit; optional/absent lease cannot bypass authority or race with takeover |
| Supersede | Preserve result, conditions and replacement link; close under authorized actor and do not erase the original promise |

Tests must exercise filing, addressing, each actor's allowed and refused
transition, all non-landing outcomes, closed-item takeover, and both
orders of acceptance versus withdrawal/re-address/closure. Repeat after
lease expiry and policy activation. Attention and UI must distinguish
unheld resource state from open work, declined conversation and closed
work. [Judgment, Untested]

No D1 implementation is commissioned by this note. Neither D1 adoption
nor delivery is a universal jam-start gate. Builder records how the
concrete first task tracks requests, work, review and acceptance; the
richer scope remains owed. [Source: current direction, docs plan D1]

### D2. Governance: assertion, adoption and dissent

**Recommendation.** Put enduring decisions in reviewed repository files
when that serves the application, or declare an explicit conversation
meaning where a file is unnecessary. State which principal adopts the
decision, what evidence it reviews, and when it becomes effective.
Do not equate every file landing with requester satisfaction. [Judgment]

A custom `require` rule can ask for a review by an admin/team/member on
`notes/**`. Its `allowSelf` and documentation-scope restrictions follow
R-OBL-2; the platform's special flagged sole-admin exception applies to
`obl_admin-approval` on `.artroom/**`, not to every owner review. Changing
policy itself keeps the fixed admin boundary. A note records dissent;
an `object` review may block under the configured landing rule.
[Source: R-OBL-2, R-ADMIN-1/2, R-POL-7, `policy.ts`, `evidence.ts`]

This supplies a practice and pack design, not a new platform act. A
requester's non-file acceptance remains D1 scope. [Judgment]

### D3. Who lands and who accepts

**Recommendation.** Let the holder request landing once obligations are
met; let the Room be the canonical writer. Give requester acceptance its
own meaning when the task requires it. A human publication gate can be
an actual `require` review obligation, or an explicit `land` rule using
supported rule inputs. `landApproval` is not a policy field. [Source,
Judgment: R-LAND, `policy.ts`]

Author exclusion, custom documentation `allowSelf` and the sole-admin
policy exception are separate cases. They are not a blanket assertion
that every landing has independent requester approval. [Source]

### D4. Reports and non-artifact work

**Recommendation.** Keep proposal summaries and bound review/check
evidence for artifact changes. Record answers, investigations, decisions
and results without a main change as work-item results where needed.
An existing note can hold evidence; it does not by itself provide the
request/report/acceptance lifecycle. Preserve that D1 gap. [Judgment]

### D5. Note anchors

**Recommendation.** Use the delivered act and line anchors. No amendment
is needed to add a feature that already exists. Keep its full
lane/generation/head/path/line binding in docs and clients. [Source,
Judgment: section 1.1]

### D6. Ephemeral chat and presence

**Recommendation.** Keep transient playing or advisory presence in an
application live layer when useful. Promote consequential statements to
attributed records deliberately. A live layer may coexist with the Room;
it cannot alter admitted authority, sequence or evidence. No new platform
act is proposed here. [Judgment]

### D7. Reviewer selection

**Recommendation.** Configure a real review-capable principal/team in
`require`. If a particular requester must accept a result, express that
requirement rather than assuming any independent review satisfies it.
Explicit ad hoc selection remains an application design question, with
qualification and self-review constraints preserved. A job's name is
not its roster role. [Source, Judgment: R-OBL-2]

### D8. Check transports and generic declarations

The v1 named check remains RPC-only for bearer credentials; there is no
named MCP check tool or fixed bearer-client check method. Roster is never
a bearer act, and bearer `POST /acts` remains excluded. Own-key HTTPS
signing keeps its existing rules. [Source: R-CRED-10, `fa120186`]

The adopted stage-5 clarification allows a v2 declared check through
generic MCP or bearer HTTPS submission. Its current role, declared
primitive, delegability and exact grant binding must permit it; Room
still enforces all R-OBL-3 job, author-independence and evidence bindings.
A custom kind's name is not evidence and does not route a job on its
own. Stage 4 still owes real v2 prepared/job dispatch support.
[Source: `fa120186`, R-DECL-18/19]

**Recommendation.** Preserve this distinction in the composed protocol
and clients. Use an independently authorized reviewer's own key and
separate version/review/land acts for the initial development task where
that suffices. Do not make complete musical checker integration a
universal development-start condition. [Source, Judgment: `d0352a08`]

### D9. Read and verification surfaces

**Recommendation.** Preserve all four added core reads and the complete
later room/diff/file/policy scope. Preserve declared catalogue/history,
replay-library and CLI packaging obligations separately. Commission a
missing surface when it blocks an actual task; do not claim a planned
command is already delivered or require every later read before any jam
work starts. [Judgment]

## 4. What remains stable and what may evolve

This replaces the old freeze list with explicit boundaries. [Judgment]

| Boundary | Stability requirement | Permitted change |
|---|---|---|
| Platform steps and recovery | Interpret the recorded steps version and keep signing, holder, evidence, admin and recovery guards | Independently reviewed primitive amendment, version/migration/replay design and actual runtime tests |
| Application act names and bodies | Sign the meaning read; retain historical declarations and opening hold settings | Reviewed v2 configuration change at an exact activation sequence; retirement/reuse remains explicit |
| Grants and pending intents | Exact signed kind/binding map; current authority; no wildcard expansion or rebinding at admission | A deliberate new grant or intent signed by its authorized actor |
| Historical record | Read each entry under its own declaration and policy; retain old thread kinds/settings | New configuration does not rewrite past labels, bindings or admitted effects |
| API and transports | Keep implemented and adopted inputs, errors and retry behavior accurately documented | Separately reviewed contract change with composed client/Room gates |
| Workroom meaning | Requests, commitments, evidence and acceptance remain attributable | Evolve the application's vocabulary as self-hosting exposes better choices |

The currently owed contract work already has numbers and owners:
declared acts are protocol amendment 6/section 33; the repaired MCP core
is amendment 7/section 34 and composes with stage 5. Do not assign the
old D1 sketch to an already occupied amendment or make it an adopted API.
No extra amendment is proposed solely to obtain a vocabulary freeze.
[Source, Judgment]

Admission, replay and generic clients must finish their existing exact
scopes, including independent runtime review and meaningful assertion-
failing guard omissions. The two complete log lists and seven v2 verify
cases remain stage 3; musical primitives/jobs remain stage 4. Builder
then judges the first task from current evidence. Specific blocking
spikes follow the user's priority; neither this review nor an optional
formal-model experiment is an automatic start gate. [Source: current
direction and stage ownership clarification]

The live row-write/provider experiment from stage-2 condition 5 is
sequenced after independently reviewed admission landing, under
`6599e1c0` and complete follow-up request `92ddf4cc`. Its original
harness, dataset, all-object attribution and no-added-row claims remain
owed; local SQLite parity does not substitute for it. This changes the
order of delivery and adds no universal jam-start gate. [Source]

## 5. Jam's acts and the platform's development work

The original zero-amendment criterion has been replaced by the separate
application boundary. Jam uses published, pinned Artroom packages and a
deployed Room; it does not patch or import platform source. A platform
gap returns to this gitseq workroom as a separate request. Platform
backlog and further work can continue while jam is built. [Source:
`7363396b`, jam revision request `47aa5403`]

The musical room needs its own declarations: `take-part`, `lead`,
`take-solo`, `pass-solo`, `signal`, `add-pattern`, `change-key`, and
reviewed house-rule changes. Its fixed exclusive scopes, solo reservation,
workspace-free hold, unanchored count-in and compound version/land
checks need stage-4 support for the full musical session. Sample packs
and each player's takes also need suitable scoped authority. Historical
replay retains the transport origin and file/configuration history.
[Source: declared-acts note section 7; jam revision 5, approved candidate
`cf212d74`, landed on main `6ce1e3ab`]

Building the jam repository is a different application of the platform.
It needs development requests, accountable work, version/review/land and
acceptance appropriate to its chosen first task. A musical room's lack
of a backlog says nothing about those development needs. Conversely,
developing declarations and acceptance cases through independent
reviews can precede a complete musical checker service or audio fixture.
[Judgment; source direction `d0352a08`]

Builder's proposed first task is to found a jam development Room and land
its declarations and acceptance cases through generic acts and
independent reviews. Its present dependencies are stages 2, 3 and 5.
Planner keeps docs ready to start beside jam after a positive dated
judgment. Neither D1, a frozen development vocabulary, every publication
or backlog item, a full seven-stage musical fixture, nor separate Hugh
start approval is added by this note. [Source: `8c87c35c`, `04da4388`,
`d0352a08`, complete docs plan]

## 6. Is this a useful materialization of work?

### 6.1 A conversation model and an artifact model

Define a work conversation C with requester A, performer B, conditions
q, request version r, result evidence e and an acceptance principal.
The state includes more than who currently holds a resource. The table
below is this note's design model, inspired by conversation-for-action
work; it is not a proof or a transcription claimed from an unavailable
paper. [Judgment]

| Transition in C | Actor and state | Artifact/hold mapping and missing meaning |
|---|---|---|
| Request | A offers r,q to B | No delivered unheld addressed item |
| Promise | B accepts that r,q | A hold does not itself accept q or retain A's rights |
| Counter | B offers changed conditions q′; A may accept/counter/withdraw | Re-address changes performer, not conditions; a note records words but no guarded negotiation transition |
| Decline | B ends this offered conversation | Re-addressing a reusable item may be useful, but is not the same terminal conversation |
| Withdraw | A withdraws before or after B promises | An unheld-only filer closure cannot represent A withdrawing after B holds the work |
| Cancel | B ends its promise | Release loses a hold; decide explicitly whether C or the underlying item remains open |
| Report | B claims the result satisfies q, with e | A proposed head is one kind of e, not every non-artifact result |
| Accept/reject | A or its designated principal judges e against q | Policy-qualified landing by B may occur without A; an object review is not automatically A's rejection of the promised result |

Define artifact state V for a particular version, hold H for resource
ownership, and operation O for publication. A held/unheld lane can have
many generations. `propose` adds a V; reviews/checks affect its evidence;
`land` starts O; a confirmed landing moves main. Release/expiry changes
H and retains history. The lane can be taken over again after release
and can receive another generation after landing. [Source: R-LANE,
R-PROP, R-LAND; `lanes.ts`, `landing.ts`]

The coupling is explicit: a conversation can cite a proposal or landing
receipt as result evidence, and its conditions can require particular
reviews. That does not identify C's accepted state with V's landed state.
Investigations, questions and decisions may conclude without a main
change; a reusable lane does not make those conversations complete.
No transition-preserving homomorphism or bisimulation is established.
The old sketch omitted actor, state and condition cases as well as the
counter transition. [Judgment, Untested]

This is why D1 asks for a full lifecycle design rather than two body
fields justified by an apparent state-machine equivalence. A proposed
implementation must define exactly which C transitions it represents,
which artifact/hold effects accompany them, and what remains elsewhere.
[Judgment]

### 6.2 A workflow net is a possible test, not a proven property

A workflow net has an initial place, a distinct final place and a path
through each place/transition. Classical soundness requires completion
to the final marking from every reachable marking and no unusable
transition; it is not established by naming a possible next actor.
[Source: Blondin, Mazowiecki and Offtermatt,
[The complexity of soundness in workflow nets](https://michaelblondin.com/papers/BMO22a.pdf),
section 2.2]

An Artroom lane is reusable, not such a one-shot net by definition.
Landing does not release its hold or end the lane; release does not
retire it. An operation's `unresolved` state holds the publication slot
pending read-back or a terminal abort result. The protocol does not
turn it terminal because an admin is named. Policy can refuse a landing,
and external publication can remain unavailable. [Source: `Lane`,
`LandOp`, `SlotHolding`, R-LANE-8/10, R-REV-5, R-PUB-1]

A useful experiment would first choose its instance boundary: one
conversation, one generation, or one publication operation. Its marking
would include hold/lease state, evidence, policy/version, reservation,
pending publication and cleanup debt. It must distinguish retained
historical refs from unfinished operational work. It must state fairness,
clock/alarm, provider availability, participant and policy assumptions,
then check allowed races, revocation and every terminal case. A test
showing each named act can run once is not a proof of reachability from
every reachable state. [Judgment]

No soundness theorem, dead-transition result or universal vocabulary
freeze follows from this note. A model/checking spike is optional future
work if a concrete uncertainty warrants it; its model, assumptions and
counterexamples would be the deliverable. [Untested, Judgment]

### 6.3 Placement: use supported distinctions

The comparison below is scoped to read sources and this local workroom.
It does not assert that unrelated ticket systems lack features or that
Artroom has a unique governance mechanism. [Judgment]

| Axis | Artroom | Relevant comparison |
|---|---|---|
| Unit of work | Reusable thread, versions and publication operations; application acts add meaning | gitseq separately records requests, promises, artifacts, reviews and dispositions |
| Governed state | Room-controlled canonical publication, with separately recorded authority and evidence | Gerrit changes/patch sets have labels and configurable submit requirements |
| Review reuse | Explicit carrying over declared paths, global inputs, config and runner | Gerrit `copyCondition` is a configured predicate; it is not merely an undocumented rebase heuristic |
| Resource coordination | Expiring holds; by-scope mode permits overlap with awareness, exclusive mode enforces the stated overlap rule | An assignee alone is not a fenced workspace hold; no claim of uniqueness across all products is made |
| Configuration history | `.artroom/policy.json`, reviewed admin boundary and sequence activation | Gerrit versions `project.config` in `refs/meta/config`; configuration changes can be submitted for review |
| Conversation acceptance | Partial in the delivered lane model; D1 remains design work | This gitseq workroom has separate attributed commitment and satisfaction decisions |

Gerrit's configuration branch is in the repository and records access,
labels and submit requirements. Its update paths include direct changes
and changes reviewed on `refs/meta/config`; Artroom is not the first
system to version or review repository governance. [Source:
[Project configuration](https://gerrit-review.googlesource.com/Documentation/config-project-config.html),
[Submit requirements](https://gerrit-review.googlesource.com/Documentation/config-submit-requirements.html)]

Gerrit's labels copy only when their configured predicate matches; the
documented predicates include change kinds and reviewer/uploader criteria.
Artroom's carrying rules use a different stated input/evidence model.
Which is useful for a particular application is an engineering question,
not evidence that the other is heuristic or that one is universally
stronger. [Source:
[Review labels](https://gerrit-review.googlesource.com/Documentation/config-labels.html);
Judgment: the comparison]

The defensible starting claim is narrower: Artroom combines governed
publication, signed attribution, explicit evidence and resource holds,
and declared acts let an application express those transitions in its
own language. Self-hosting can test whether that combination supports
actual development commitments. It will also expose missing primitives
or awkward declarations. Preserve those findings rather than treating
a comparison table as proof that the design is complete. [Judgment]

### 6.4 What is justified and what remains unproven

**Supported:** the inventory and limits at the named source heads; the
partial mappings and concrete authority gaps; the distinction between
historical binding and current authorization; the builder-owned task
judgment. These justify a concrete self-hosting experiment when its
dependencies are delivered. [Source, Judgment]

**Unproven:** equivalence to a complete conversation-for-action system,
workflow-net soundness, completeness for every kind of work, and musical
performance. None is required to claim more than its evidence. The
collections-of-rooms proposal and jam will test different applications;
their questions remain open. [Untested]

## 7. Follow-through and non-decisions

- Finish the existing admission, replay and generic-client requests at
  their complete scopes. Keep stage ownership, guard evidence, mutations
  and exact-head review intact.
- Revise this note against review `4d82c9a8`, then obtain independent
  architecture, security and simplification review before adoption.
- Keep D1 as a complete authority/lifecycle design proposal. This note
  chooses no new platform API, principal syntax, amendment number or
  implementation owner for it.
- Builder records a new dated readiness judgment against the actual
  first jam task. After a positive judgment, commission jam and the
  complete approved docs plan together; run only spikes that unblock the
  actual next task.
- The application's pack must specify review teams, owner scopes,
  independent evidence and adoption meaning. No provisioning or admin
  delegation is assumed completed here.
- Historical gitseq work may be linked; importing its full record needs
  its own fidelity and authority design. A URL in `because` is a link,
  not proof that commitments were translated.
- Optional formal models, ephemeral transport and later MCP reads
  remain separate questions. Their omission from a first task does not
  retire their scope or establish their behavior.

## 8. Sources and verification of this revision

Repository facts above use main `6ce1e3ab` unless marked candidate; its
source code is unchanged from the inventory read at `a42c4d83`:
`packages/contract/src/{acts,envelope,roster,ids,lanes,evidence,
landing,pagination,errors,declarations,transports}.ts`,
`packages/mcp/src/tools.ts`, `packages/cli/src/main.ts`,
`packages/cli/src/cli.ts`, `packages/log/src/verify.ts`, and
`docs/protocol.md` through section 33. Candidate sources are the MCP
core `1d9ac5ad` (section 34) and generic-client stage 5 `477dda2f`.
The complete older eighteen-tool plan is retained on `request/mcp-plan`;
its abridged inputs are explicitly distinguished from implemented types.

The local directions are recorded in
[the planner direction](2026-10-03-planner-direction.md),
[the complete docs plan](2026-10-01-docs-plan.md), and
[the declared-acts design](2026-10-02-declared-acts.md).
The jam revision cited here is approved candidate `cf212d74`,
`notes/2026-10-01-jam-room.md`, landed at `6ce1e3ab` with receipt
`02d0f110` and child revision request `47aa5403` satisfied. That design
landing is not application-start readiness.
Other workroom bases include `2b1105bb`, `869d9aad`, `fa120186`,
`d0352a08`, `8c87c35c`, `7363396b` and `04da4388`.

Gerrit's three linked primary pages and the workflow-net paper were read
on 2026-10-03. The Winograd language/action paper is background to the
original review; its remote full text was unavailable in this pass, so
the conversation table is defined here as a proposed model and carries
no equivalence claim attributed to that paper. No other product's
capabilities are inferred from memory.

This revision changes one planning note. Its checks are complete field/
target inventory against the named sources, all nineteen loop rows,
all eight original review repairs, local links and whitespace. It
claims no new runtime, mutation, deployment or mathematical proof result.
