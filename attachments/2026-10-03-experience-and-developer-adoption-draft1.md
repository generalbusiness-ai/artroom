# Reconcile the complete experience and developer adoption work

Dated 2026-10-03. Draft 1 for independent review. Planning request
`2262034df901fca771f57e065f275e7cca00fcfc`; promise
`4d8de5d7819bd4a8aa941f80866c43b3d3d68ede`.
Planned against Artroom main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`.

This is a task map and commissioning proposal, not an API amendment or a
claim that the experience is delivered. It carries all ten scenarios in the
supplied experience and developer-adoption analysis into existing work or
an explicit missing task. Independent review of this map precedes
commissioning. New authority, storage or protocol choices require their own
review and adoption before implementing them.

## Purpose and priority

A person should complete a useful change, leave the browser, return on
another device, and understand what is happening without treating the
agent's transcript as the Room's result. A new application builder should
then achieve a small useful result with public packages and a deployed Room,
rather than copying platform internals.

The highest implementation priority remains the 10× test-overhead request
`ecbc722a`. Then come declared acts and spikes that unblock the builder's
actual next Jam task. Builder owns the positive self-hosting judgment under
`b4ef9b7a`; Jam and the complete Artroom documentation plan proceed together
after that judgment. This map adds no blanket readiness gate, fixed
workroom vocabulary, or requirement to finish every later read first.

## Evidence and existing owners

The source analysis is the immutable attachment
`2262034df901fca771f57e065f275e7cca00fcfc:attachments/2026-10-03-artroom-experiences-and-developer-adoption.md`.
Its recommendations are proposals, not evidence that adoption succeeds or
an explanation of why Google Wave failed.

The connected-story design is [005](005-2026-10-03-browser-cloud-work.md).
Frozen Draft 2 was independently approved in `fc77cf82`, adopted as product
direction in `0f358e52`, and its planning request `b5f1fb3f` is satisfied.
Implementation remains open. The six builder requests are:

| Key | Effective request | Deliverable |
|---|---|---|
| C1 | `b538c5eace50a1de82a8bdf8a8f19764548af15e` | Hosted authority/lifecycle contract and trusted Room boundary |
| C2 | `6cdaf20fa260d6d6c6b30e83f585883a51b964f4` | Real filesystem/process interruption and reconciliation spike |
| C3 | `13dfc613e8e3d9a1aed5f7492272fbf8c580d727` | Production durable coding runtime and retained-act settlement |
| C4 | `18815307e6c306d63766230ed7eb7ddbf94d1f21` | Browser identity, onboarding and authorized repository import |
| C5 | `cfbde32f20618231aed598f63f3898cc188d0ffd` | Live browser task/progress/steering/review/publication journey |
| C6 | `d89fc17fb60a7c8a3591e23193596c981781b26c` | Joint deployed acceptance and related user documentation |

C4 reuses policy bootstrap `a13a0bf5` and lane J. C5 reuses cleanup visibility
`8d249233`, stage 5 `a5d64b35`, and existing bound review/note mechanisms.
The supported generic client/CLI/MCP/UI surfaces are already owed under
stage 5; the repaired MCP core runtime is separately owed under
`9ca1d290`. This map does not duplicate or silently enlarge their closure
conditions.

The full documentation plan at
`1c27b35adaf09bc9c8a44a5165b263eca9d5f430:notes/2026-10-01-docs-plan.md`
was independently approved in `d4865c90` and landed under `93c76c16`.
Its 63 original pages plus four declaration/application pages remain owed.
That request delivered the plan, not those guides. C6 commissions related
journey material; it does not replace the full delivery lane.

The full product issue-tracking D1 design remains owed:
`notes/2026-10-02-acts-review.md:461`. This is distinct from the source
analysis's developer-experience D1 starter scenario. The old optional
`claim.hold`, `claim.to` and `release.outcome` sketches are not adopted.

Current implementation evidence matters: at the planned head,
`packages/ui/src/room/live/live-room.ts:185` returns null for both diff and
interdiff. The Room API in `packages/contract/src/transports.ts` returns a
Proposal but has no corresponding commits/files read. Protocol open point
39 explicitly leaves object access authorization for a later decision.
A mock diff screen is not evidence of real browser review. Other historical
UI README gaps must be rechecked individually; they are not all current.

Checker job authority is an existing contract-only request `f12cef6b`.
Stage 4 `48c021ea` owns prepared v2 job dispatch. Neither alone specifies
a cross-account checker service transport. Jam section 9 keeps same-account
service bindings as the current path and HTTPS/pull as alternatives requiring
a separate decision. Independent actor review and machine check remain
different evidence.

## Ten connected scenarios

All implementation owners below are builder, with independent exact-head
checker review. Planner owns the map and follow-up commissioning; Hugh owns
the explicitly retained product choices. Each row names a concrete artifact
and bounded acceptance evidence, not a numerical test quota.

| Scenario and user flow | Existing work and missing work | Dependencies and evidence |
|---|---|---|
| **E1 First useful result.** Create/join → import → task → observe → answer attention → inspect → review → follow publication. One person and one independently identified agent is the initial useful unit. | C1–C6; bootstrap and lane J. C6 owns the cold-person journey and chosen default review/check policy. N1 fills real review reads; N6 carries the full manual. | Live C3/C4/C5 and N1. Record time to useful published result, setup steps, terms encountered, help interventions and failures. The docs' 15-minute target is unmeasured until this run; do not report a mock or expert run as cold-user success. |
| **E2 Leave and return.** Close A while work continues; on enrolled B discover, watch and steer the same task. Follow an uncertain effect until its actual result is reconciled. | C1–C6 already own persistence, authority, budgets, device continuity and lost-reply behavior. N7 chooses delivery of human attention while absent. | No browser heartbeat dependence. Reuse the joint interruption/lost-reply witness; record acknowledged checkpoint, operation IDs, current Room watermark and response latency. B's reply does not erase an unknown duty or satisfy an unrelated Room obligation. |
| **E3 Join as a reviewer midway.** Open the requested outcome and exact proposal; inspect material changes, checks and carry reasons; ask an anchored question; review a later generation. | C5/C6 own the view and acceptance. N1 owns missing artifact-read architecture/implementation. Existing act/line anchors are reused. | N1 plus C5. A reviewer unfamiliar with the conversation reaches a justified decision from artifacts and Room evidence. Move the generation during review: keep the old subject visible and require deliberate review of the current head. Measure transcript/help dependence and incorrectly counted stale evidence. |
| **E4 Accountable work, including no landing.** File/address → accept exact conditions → report → requester accepts/rejects; also decline, withdraw, cancel, hand over and replace. | N2 commissions the complete product D1 design, then separate implementation after adoption. Existing simple development practice remains usable. | Declared acts establish a mechanism, not these missing state transitions. Show two cooperating actors, a non-code result and both orders of acceptance versus withdrawal/re-address/closure. Record who owes the next act and retained commitment/result links. Landed/released never substitutes for requester satisfaction. |
| **E5 Incremental adoption and exit.** Import one existing repository, do one task with one reviewer, retrieve ordinary commits and the published record independently. | C4/C6, normal Git publication and N6 guides. N1 makes proposal artifact access concrete. | Explain the Artifacts copy as canonical for this Room and the source repository's separate status. Demonstrate independently fetching/verifying the bounded published record with its watermark. Source synchronization/mirroring stays later work; no bidirectional guarantee or federation is implied. |
| **DX D1 Public-package starter.** An outsider installs pinned packages, configures a deployed Room, runs a small app and edits an interaction. | N3 owns a separate starter repository and delivery. Reuse Jam's own-repository/client design; N5 resolves installation/checker seams. | Concrete available package versions, reviewed stage-5 public surfaces and documented deployment authority. Cold builder uses no Artroom source import, workspace link or platform patch. Record setup/manual steps and first useful interaction; coding and a small Jam interaction exercise the same supported client. |
| **DX D2 Contextual discovery.** Discover an unfamiliar act, its target and binding; understand a refusal/wait; perform the appropriate next action. | Stage 5 and MCP core remain intact. N4 adds task-context guidance and a cold-agent scenario as a separate follow-up. N6 supplies the short agent guide. | Current authenticated public reads only unless a new read contract is reviewed. Distinguish absent, forbidden, state-blocked and externally waiting; hints never grant authority or reserve state. Record turns/tokens, refusals and human help for an unfamiliar act. |
| **DX D3 Shared client mechanics.** Use one preparation/outbox/retry/subscription path in starter, agent and browser. After an uncertain answer recover the same signed intent; after changed meaning deliberately create another. | Stage 5, MCP core and C3 already own binding/idempotency/settlement. C5/N3 integrate them rather than implementing app-specific signing. | Reuse compact existing lost-reply/revocation tests and C6's real witness. UI and agent must agree on the retained operation ID and unknown outcome; timeout is not absence. Show binding-stale without silent reread/re-sign. |
| **DX D4 Fast developer loop.** Change a starter interaction, run a focused disposable Room with two actors, inspect conflict/refusal/replay, then verify the actual external boundary. | N3 owns the starter loop and fixture reuse. Test economy remains under `ecbc722a`. | Record adapter fidelity and exact local versus hosted boundary. Local Cloudflare or mocked Artifacts/Sandbox does not prove remote fidelity. Record elapsed time/manual steps; one focused conformance set and one justified remote smoke, not each app's whole-platform permutation suite. |
| **DX D5 Install and evolve.** Install declarations/configuration under the right authority, activate at an exact sequence, update policy/act meaning, replace grants deliberately and inspect old history. | N5 owns the missing installation/deployment seam design. Stage 5 owns discovery/binding/history; checker authority `f12cef6b` and stage-4 jobs retain separate owners. N6 owns the worked guide. | Outsider distinguishes ordinary acts, admin activation, operator binding setup and code deployment. Demonstrate stale intent and retained historical meaning, plus one visible configuration error. Independent validator review uses a qualified distinct member; it does not forge a machine-check result. |

The demonstration can reuse one small repository and six beats: useful
human/agent result, leave/return, cold reviewer requesting a revision,
failed check or lost reply with recovery, Room publication and requester
judgment, then a small Jam interaction using the same client. E4 and Jam
follow only when their own capabilities are delivered; they are retained
scope, not extra conditions for the first coding result.

## Missing concrete work to commission after map review

These are work packages, not invented API fields. File seven requests,
record their full IDs in a companion ledger, and link them to this map's
exact reviewed artifact. Reuse completed work as evidence. A design request
does not close its later implementation obligation.

### N1 Real proposal reads and cold review

Owner: builder; design and contract first, followed by an implementation
request after independent adoption. Deliver a dated note
`notes/2026-10-03-proposal-artifact-reads.md` and exact amendment proposal
covering bounded diff/interdiff, file/blob and commit access at immutable
room/lane/generation/base/head references. Decide authenticated reader
authority, transport parity, object/ref pin lifetime, pagination/bounds,
binary/large-file behavior and revoked access. Limit commits/history to the
needs of the actual reviewer; optional author-supplied change identity
never changes obligation or carrying truth.

Private raw workspace/transcript/command reads remain direct owner/admin
device resources under C1. Published/proposed committed artifact reads
need their own role/grant matrix; do not deny qualified independent
reviewers merely because they are not the task owner, or expose fork write
credentials to solve a read gap.

Implementation must deliver the adopted Room/client routes and C5 live
adapter, plus C6's cold reviewer witness, with coordinated file ownership.
Acceptance: the exact object/diff is inspected without the agent transcript;
a moved head cannot change the viewed old subject; unauthorized/revoked
readers fail; a bound line question survives another generation; current,
carried, rejected and stale evidence remain distinguishable.
Effort L, risk high for read authorization. No test for every field.

### N2 Full addressed-work lifecycle design

Owner: builder/design, planner commissioning; independent review before
adoption. Deliver `notes/2026-10-03-work-item-lifecycle.md` with actor/state
tables, version comparison, attention, item/conversation/hold separation and
every transition listed in product D1. Choose a repository/declaration
application model first; show honestly what it enforces. Any missing unheld
opening/closure/guard needs a separately reviewed primitive amendment at
an unused number.

Specify requester withdrawal before and after a promise, the reserved
publication boundary, performer cancellation, decline versus the open item,
handover, re-addressing only while unaccepted, designated requester
acceptance, non-landing evidence and replacement links. Address both race
orders after lease expiry and policy activation. Deliver exact implementation
lane scopes and acceptance fixtures; then commission that implementation,
without pretending release outcome fields already exist.
Effort L, risk high for authority/races. The first Jam task may use a simpler
documented tracked practice while this remains owed.

### N3 Public starter and focused developer loop

Owner: builder after relevant published client decisions; coordinate Jam
rather than creating a competing platform. Deliver a separate repository,
pinned public-package manifest/lockfile, declarations/template, minimal UI,
one person/agent path, actual validator/checker route, seed identities and
documented configuration/deploy ownership. State an actual registry/release
availability dependency; a monorepo source import is a failed boundary.

First deliver a reviewed starter specification and package/deployment
availability inventory. Then implement against that adopted specification.
Provide an exact quickstart command, focused edit/test commands, disposable
Room/history inspection and a fidelity matrix for local and hosted adapters.
Use existing reviewed conformance fixtures; choose one external smoke that
answers the remaining real boundary.

Acceptance: a cold outsider modifies and runs a useful interaction without
platform edits; two actors expose a real refusal/conflict and replayable
history; the same public client supports coding and a small Jam interaction.
Record elapsed time, commands, help and costs; claim only observed fidelity.
Effort L, risk medium. Package/release or operator provisioning blockers
stay named dependencies, not fake runnable placeholders.

### N4 Contextual agent guidance follow-up

Owner: builder; separate follow-up to stage 5/MCP core with planner-reviewed
UX/specification before implementation. Deliver a dated guidance design,
one short task-facing agent interface and a bounded cold-agent report.
Reuse discovered schemas/help/bindings, attention, lane/proposal/operation
reads and typed errors. Specify how current role/grant and task state shape
hints, and which explanation is runtime guidance versus a documentation
link. If more authoritative reads are required, propose the exact contract
change instead of reconstructing permission from a label.

Acceptance: an unfamiliar agent discovers an app act, reads its target and
meaning, handles forbidden/state-blocked/externally-waiting paths, and
continues after deliberate binding refresh. No hardcoded new tool or protocol
spelunking. Record turns/tokens/help and whether hints agree with admission;
preflight is advisory and cannot reserve or guarantee success.
Effort M, risk medium. This is not an added stage-5 closure or first-Jam gate.

### N5 Installation, checker deployment and evolution seams

Owner: builder/design; coordinate `f12cef6b`, stage 4 and Jam section 9.
Deliver `notes/2026-10-03-application-installation.md` with a tested-target
deployment diagram and authority/ownership table. Separate declarations,
admin policy activation, ordinary participant acts, operator service-binding
configuration and worker/package releases. Use the actual supported
same-account route for the initial path. Explicitly identify who can
provision it for an outsider on a hosted Room.

Decide whether an actual next app requires separately authenticated HTTPS
jobs or pull. If so, specify signed job/replay/read-token/revocation/cleanup
requirements and commission the reviewed contract/runtime work separately;
the existing job-authority request must not be silently called transport
delivery. If not, keep it as a named later gap, with its owner and trigger.

Specify one worked update with policy dry-run capability honestly classified
as delivered or missing, exact activation, deliberate regrant/new intent,
old history and incompatible release handling. Reuse available historical
catalogue/replay surfaces; missing policy reads/dry-run routes require a
named reviewed dependency.
Acceptance: outsider installs/updates using documented public interfaces
and declared operator/admin actions, sees one useful configuration failure,
and distinguishes independent validator review from machine checking.
Effort M/L, risk high for external job authorization. New transport is not
a blanket initial Jam gate.

### N6 Complete documentation delivery lane M

Owner: builder with checker page review. Commission the approved full plan,
all 67 section-4 pages and agent materials, starting beside Jam after the
builder's positive judgment. C6 and feature lanes retain their owned pages
and evidence; one page ledger prevents duplicate writing or a smaller
quickstart substituting for the complete manual.

Deliver a 67-page inventory with writer, feature dependency, actual tested
release, delivered/planned status and acceptance link; the four reader areas,
all named harnesses and infrastructures, generated references, `llms.txt`,
room-generated instructions and short agent guide remain in scope. Verify
historical harness commands against current primary docs and cold runs when
writing. Workers AI stays the pi-durable default.

Hugh retains docs-host choice and cold-reader tester selection. Markdown
content can proceed while the host is undecided. Never label undelivered
capability guides complete merely by adding placeholders. Reuse the joint
browser/starter fixtures for executable samples; generated-reference drift,
plain-language/style checks and exact page review are bounded distinct
checks. The 15-minute cold-person target and unfamiliar-act cold-agent
scenario are measured, not asserted.
Effort L, risk medium. This is the full approved backlog, not a new platform
feature request or a condition for Jam to start.

### N7 Attention when the person is absent

Owner: builder/design, planner product review. C3 already owes durable
agent attention and C5 an inbox; this task chooses delivery beyond a closed
browser. Deliver `notes/2026-10-03-absent-attention.md` comparing an opt-in
Web Push or other explicitly authorized channel with inbox-only return.
Select an initial path through independent design review, retaining user
consent, device/channel ownership, revocation, privacy and operator cost.

Define exact Room/task/attention decision anchors, duplicate suppression,
reconnect/catch-up, notification expiry, pause/budget semantics and delivery
failure. A notification is advisory; its click opens current authorized
state and cannot carry steering/review authority. Revoked devices cannot
continue receiving private payloads. Distinguish human notification from
the separate agent trigger/wake design `24711ceb`.

Acceptance: while A is closed an opted-in authorized destination receives
a bounded alert; B opens the specific attention item, authenticates and
responds through normal authority. Delivery failure leaves durable inbox
attention; revocation has explicit effects. Inbox-only must be labelled
a reduced experience until the chosen absent-delivery path is implemented.
No live messages to people are authorized by this design request.
Effort M, risk medium. Implement only after the channel/authority design is
adopted, reusing C3/C5 instead of a new social or chat system.

## Verification and handoff sequence

1. Independently review these ten scenario mappings, all seven missing
   packages, existing ownership and priority boundaries. Frozen evidence
   must identify exact bytes; a review of a moving local file is insufficient.
2. Adopt the commissioning scope, not unspecified new protocol designs.
   File N1–N7, with N1/N2/N3/N4/N5/N7 explicitly design-first. Record their
   IDs, design/adoption dependencies and later implementation owners.
3. Tell C5/C6/N6 owners the reusable cold-user/cold-review/portability
   acceptance scenarios. Record durable cross-links without silently
   changing an already promised stage's completion conditions.
4. Each design report supplies independently reviewable source artifacts
   and implementation lane scopes. Commission missing implementation only
   after adoption; track it until actual accepted results, not just a design
   report. Builder carries this saved map and its index/ledger through
   ordinary source review and integration.

For source drift, first run
`git diff --stat e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967..HEAD -- packages/contract packages/client packages/mcp packages/ui notes/2026-10-01-docs-plan.md notes/2026-10-02-acts-review.md notes/2026-10-01-jam-room.md`.
Reconcile changed excerpts and current request state before implementing.
At this head root commands are `npm run typecheck` and `npm test`;
package runners are `npm test --workspace @generalbusiness/artroom-ui`,
`npm run e2e --workspace @generalbusiness/artroom-ui`, and client
`test:node`/`test:workerd`. These are runner names, not instructions to run
every suite for each task. Promise/report the exact focused commands after
test-overhead work changes them. Planning-only edits need
`git diff --check`, byte/hash verification and independent design review;
no application runtime suite is needed.

Stop and report a concrete discrepancy if an adopted capability has no
public package, an assumed read is unavailable, a promised role cannot
perform the demonstration, or a proposed lifecycle requires an unadopted
primitive. Keep its owner/dependency in the map and obtain the needed
decision. Do not patch platform authority in an app or weaken acceptance.

Success is traceable scenario coverage with named owners and observed
outcomes, alongside actual reductions in setup, help, confusion and test
cost. No adoption, performance or usability claim follows merely from
filing the tasks.
