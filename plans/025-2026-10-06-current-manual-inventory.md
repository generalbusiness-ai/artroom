# Current manual inventory and feature dependencies

2026-10-06. Planning handoff for the existing full manual, not delivered
manual pages or a claim that a tested release exists.

This ledger preserves all 67 pages in section 4 of the approved documentation
plan and maps their outcomes to the current Artroom model. Documentation
planning and accurate source-capability pages can proceed beside authorized
local Jam work. Hosted tutorials keep their real deployment dependencies.

The manual implementation owner remains request
`db2fd1468ed09aecd51bbec3a89a45cb373b91a2`, amended by
`21128e61180d51ffaca0cc3ae3950eeb36903eb2`. This planning inventory belongs
to the existing R0 reconciliation request
`5c716a5c35bfdbdcef89e1e4fbe82df4aab0b8fd` and planner promise
`efc0d86cc329025353f8e2dd21957b0f60ce68d8`; it closes neither request.
Its source baseline is main `c6ed5dd0dd4facbc7a5065ab273a70f4aac306cb`.
The preserved inventory is in
[the documentation plan](../notes/2026-10-01-docs-plan.md), blob
`5a8a6116ef7d5c58ce511bd6b69d674727fd6edc`.

## Page state and evidence

Every row below is **planned for the complete manual**. This ledger assigns
no page writer and attests no tested release or completed page acceptance.
The full manual request is addressed to builder but remains unclaimed.
Feature-owner codes identify dependencies, not assigned page writers.
Reconcile any existing feature-page delivery before assigning a writer;
then expand its row with the actual writer, artifact, tested release,
independent page review and acceptance evidence. No global absence of
earlier documentation evidence is asserted.

Existing source guides provide reusable material. They do not establish
that a manual page's full outcome, executable sample or cold-reader test
passed. The current guides include [scopes](../docs/scopes.md),
[lanes](../docs/lanes.md), [testing](../docs/testing.md), and the package
READMEs. The old protocol, policy-pack and release guides are explicitly
inactive historical material. Preserve their history; use current interfaces
for new instructions.

Use exact status labels with their evidence: current source, tested release,
v1 lifetime-supported behavior, adopted but unimplemented, and planned.
An adopted definition, type, fixture or exported test helper is not a tested
public release, deployed workspace, agent run or browser journey.

## Feature owners

| Code | Current owner and remaining dependency |
|---|---|
| R1 | Adopted scope, reference, authority and replay contracts. Coupled v2 source `7df6a805` under `170ed74f` remains in progress; retain exact v1 lifetime meaning. |
| R2 | Full lane/application forms, imported fragments, compiler and full plus smaller closed executable profiles and pins under `dce6864d`. Counts and design fragments do not deliver those outputs. |
| I3 | Actual membership, founding, rules, checks, source/destination publication, credentials, cleanup and real Git-host support under `bcf5ec17`. M4 is partial evidence with scripted host and source-lane facts. |
| IA | Hosted task, conversation, workspace and supervisor source under `b538c5ea`/`d55da8ef`. Adopted runtime/recovery designs do not prove the 14 intended-host controls or deployed interruption recovery. |
| I5 | Browser, device identity, public client and CLI/MCP journey under `18815307`/`20dd4a48`. Authentication, attention, steering, review and truthful recorded outcomes remain complete delivery requirements. |
| I6 | Real deployed cross-device/browser/host acceptance under `7c67653c`, distinct from the manual and partial source witnesses. |
| N3 | Public-package starter and actual install/release/development support under `f3299ab4`/`d0682f8e`. Source exports and parked packaging are not public installation evidence. |
| R4 | Complete capacity, reservations, physical accounting and measured costs under `cc570904`; genuine bounds and test economy. Measured throughput and provider cost need their actual evidence. |
| Security | Full security follow-through under `82edb034`, plus I3/IA/I5 authority, credential and revocation owners. Do not promise complete secret detection. |
| Extents | Qualified independent review and permitted exceptions under `42de9e34`, with actual rules and destination enforcement in I3. |
| Harness | Exact harness/provider primary documentation, implemented integration and authorized cold-agent acceptance. Earlier research commands are inputs to verify, not current support. |
| Mirror | Future GitHub issue/PR import and synchronization; name its actual implementation owner before claiming support. Do not create a duplicate task from this ledger. |
| Docs | Existing full manual `db2fd146`, page review, generated-reference/style integration and complete ledger. Hugh retains hosting and cold-person tester choices. |

For complete request IDs and coherent source ownership, use the
[current connected-story task map](023-2026-10-06-connected-story-current-tasks.md)
and the workroom. New page work must inspect current delivery state rather
than treat these dated pointers as live implementation proof.

## All approved pages

The original page names identify preserved outcomes. The target column
states how to write them using current capabilities; it does not activate
an old API or silently remove a capability.

| No. | Approved page | Current target | Feature dependencies |
|---|---|---|---|
| 01 | What is Artroom? | Application-declared signed acts, scopes and composed authoritative outcomes; code work and Jam as distinct applications. | R1, R2 |
| 02 | Quickstart | A fresh person creates/joins a room, imports a repository, starts agent work, reviews and follows publication in the browser. | I3, IA, I5, I6, N3 |
| 03 | Quickstart, self-hosted | The same useful change on an actual supported deployment; document the installer only when delivered. | I3, IA, I5, I6, N3 |
| 04 | The ten terms | Ten beginner terms, each with one sentence and one picture, matching current scopes, lanes, acts, receipts and member authority. | R1, R2, Docs |
| 05 | Your first change, by hand | A person completes the full change loop through actual browser and CLI surfaces without an agent. | I3, I5, I6, N3 |
| 06 | Tracking work in Artroom | Issue/goal and contribution lanes compose into one attributable work process, rather than an execution-only side object. | R2, I5 |
| 07 | File, find and pick up work | Current declared request/commitment and holder workflow, addressing, discovery and exact authority. | R1, R2, I5 |
| 08 | Your attention queue | Inbox/attention outcomes and why they concern this member, through browser, CLI and MCP. | I3, IA, I5 |
| 09 | Close work that will not land | Exact current withdrawal, duplicate or other completion outcomes and who may record them; keep undelivered alternatives planned. | R2, I5 |
| 10 | Hand over work | Holder change, recorded handover, lease loss and access to retained work; another holder's private export remains distinct. | R2, I3, IA, I5 |
| 11 | Boards and reports | Current query/filter/report surfaces over authoritative histories; activity is shown beside recorded outcomes. | R1, R2, I5 |
| 12 | Moving from GitHub Issues | Preserve issue import/linking outcome; describe actual supported mirror scope and honest deferrals. | Mirror, R2, I3, I5 |
| 13 | From idea to landed change | The composed issue, design, contribution, proposal, qualified review/check and destination publication process. | R1, R2, I3, I5 |
| 14 | Design before code | An exact dated design, independent review and owning decision carried into implementation with individual provenance. | R2, I3, I5, Extents |
| 15 | Working in a lane | Real fork/hold workspace, plain Git pushes, exact proposal and revisions; checkpointed work survives under its declared contract. | R2, I3, IA, I5 |
| 16 | Reviewing | Exact proposal/artifact reads, concerns, individual reviewer authority, independence and reuse qualification. | R2, I3, I5, Extents |
| 17 | Checks | Authorized checker jobs, source/configuration/evidence binding, meaningful invariants and reuse conditions. | I3, Extents, R4 |
| 18 | Landing | Actual destination reservation/publication states, conflict/refusal/retry and unresolved effects. | R2, I3, I5 |
| 19 | Conflicts and recuts | Exact base/head and changed-set handling, new proposal after conflict and preserved prior evidence. | R2, I3, I5 |
| 20 | Writing your room's policy | Current rules/extents and qualified reviews/checks; do not revive the parked policy package. | R1, I3, Extents |
| 21 | Roles and membership | Member/key enrollment, exact roles/actions, revocation and same-member recovery; distinguish last-key/member removal. | I3, I5, Security |
| 22 | The record | Scope histories, receipts and publication, qualified replay and its source trusts; no claim that a model's done message is a result. | R1, I3, I5 |
| 23 | Secrets | Actual custody/detection boundaries, inert authored content, credential expiry/revocation and rotation; limits remain explicit. | Security, I3, IA, I5 |
| 24 | Moving from pull requests | Current factual GitHub parity, contribution/review/publication mapping and explicit differences. | R2, I3, I5, Mirror |
| 25 | Roles agents play | Jobs versus member roles; independent agents, qualified review and machine-checker authority. | R1, R2, IA, I5, Extents |
| 26 | A small room | Actual supported one-person/builder/reviewer setup and complete useful change. | I3, IA, I5, I6, N3, Harness |
| 27 | A team room | Current routing, area concerns, multiple contributions, recombination and attention through actual supported interfaces. | R2, I3, IA, I5, Harness |
| 28 | A large room | The same coordination at stated measured throughput/cost; unmeasured scale remains explicit. | R2, IA, I5, R4 |
| 29 | Patterns | Planner/builder/checker, independent reviewer pools, disjoint work and human gates under actual authority. | R2, IA, I5, Extents |
| 30 | Keeping agents safe | Immutable controller, scoped lane credentials, fenced holds and independent agent authority; optional delegated mode remains labelled. | I3, IA, I5, Security |
| 31 | Cost and limits | Actual host/runtime/authority/model/storage/publication measurements, capacity and unfinished work; no invented quotas or prices. | I3, IA, R4, Harness |
| 32 | Claude Code | Verify current supported configuration, credential custody and unattended/cloud modes with primary docs and a cold run. | Harness, IA, I5, N3 |
| 33 | Codex | Verify current supported configuration, device/key custody, approval/sandbox and unattended/cloud modes with a cold run. | Harness, IA, I5, N3 |
| 34 | pi | Verify actual CLI/MCP/extension/RPC support and tested versions; no revival of old vendored Room setup. | Harness, IA, I5, N3 |
| 35 | pi-durable | Document the actual integrated durable conversation/runtime and tested inference configuration after its spike. | Harness, IA, I3, I5 |
| 36 | Any MCP client | Actual tool schemas, authenticated discovery, exact intent/preparation/settlement, current refusals and app-owned acts. | I5, N3, R1, R2 |
| 37 | Scripts and CI | Actual published client/CLI, authorized keys, bounded runner and complete contribution/review/publication fixture. | I3, I5, N3, Harness |
| 38 | On your laptop | Supported local workspaces and independent agent keys with actual lane holds and truthful save/recovery semantics. | IA, I3, I5, Harness |
| 39 | In containers | Adopted supervisor/guest separation, exact registration and credential custody; actual containment/host evidence required. | IA, I3, Security |
| 40 | In CI | Supported ephemeral worker lifecycle, authorized enrollment/credentials and cleanup without persistent unattended privilege. | I3, IA, I5, Harness |
| 41 | In a vendor's cloud | Tested network, repository and secret interfaces for the exact supported cloud harness; retain unsupported limits. | Harness, IA, I3, Security |
| 42 | On Cloudflare | Actual supported Worker/DO runtime and inference integration, source/host boundaries and current scope authority. | IA, I3, I5, Harness |
| 43 | Mixed fleets | People on multiple devices and actual supported agents/checkers sharing the composed work process. | I3, IA, I5, I6, Harness |
| 44 | Architecture in one page | Current scope composition, durable conversation, trusted supervisor, guest, Git host and destination authority. | R1, R2, I3, IA, I5 |
| 45 | The life of an act | Exact immutable definition/version, signed intent, side values, authority, judgment, receipt, attention and retry. | R1, R2, I3, I5 |
| 46 | The life of a landing | Exact source preparation and destination commit/publication; uncertain effects retain their reconciliation duties. | I3, R2, I5 |
| 47 | Guarantees | Per-scope order, actual authority and composed outcomes; source trust, capacity, unsaved work and completeness limits. | R1, R4, I3, IA, I5 |
| 48 | Write a checker | Actual checker service/runner contract, isolated checkout, source/configuration/evidence and qualified signer. | I3, Extents, N3 |
| 49 | Write a policy rule | Current profile, rule inputs, exact evaluator support and owned budgets; source text versus retained rule input. | R1, R2, R4, I3 |
| 50 | Build an application with declared acts | A separate application using supported public packages and its own exact definitions/acts; Jam when those capabilities land. | R1, R2, N3, I3, I5 |
| 51 | Declare and change an act | Supported typed dispatch, immutable pins/history, changed binding/stale intent, retirement and name reuse examples. | R1, R2, I5, N3 |
| 52 | Evolve a development workroom | Application acts and development-work vocabulary may evolve independently while retaining old lifetime meaning. | R1, R2, N3 |
| 53 | Build a client | Exact supported sign/submit/prepare/read/retry/settle and transport APIs, with authenticated reads and qualified receipts. | R1, I5, N3 |
| 54 | Consume the log | Actual history/publication/replay/export interfaces and completeness limits; old refs are not current routes by default. | R1, I3, I5, N3 |
| 55 | Extend the UI | Current browser adapter and tested data boundaries; stand-ins clearly distinguished from real authority/host outcomes. | I5, I6, N3 |
| 56 | Self-host and operate | Actual supported install/deploy/bindings, backup, upgrades, monitoring, stop/recovery and unknown publication. | I3, IA, I5, N3, Security |
| 57 | Contribute | Current package layout, gitseq review/landing and focused invariant checks with one source gate. | Docs, R4, N3 |
| 58 | CLI commands | Generate from actual supported command/help source and prove drift failure; authenticated access is not supplied by the current stock verifier. | I5, N3, Docs |
| 59 | MCP tools | Generate actual delivered tool schemas; discover application declarations rather than freezing a universal act vocabulary. | I5, R1, R2, N3, Docs |
| 60 | Declarations and bindings | Exact supported definition/profile/selector/branch/preparation schema and versions; compiler closure/pins remain actual source duties. | R1, R2, I5, N3 |
| 61 | TypeScript API | Generate from actual published exports and supported types, including strict versioned readers; source tables alone are not release proof. | R1, I5, N3, Docs |
| 62 | HTTP and WebSocket API | Document delivered HTTP/RPC/session/stream transports; preserve the original transport-reference outcome and label unsupported WebSocket behavior. | I3, I5, N3, Docs |
| 63 | Policy language | Current declared forms, rules/extents and exact evaluator profile; preserve the authoring outcome without old package aliases. | R1, R2, I3, R4, Docs |
| 64 | Refusal codes | Generate current operation-specific refusal meanings, authority/version/head context and recovery actions. | R1, I3, IA, I5, Docs |
| 65 | Error codes | Current transport/read/unknown-outcome errors and fixes, instead of restoring the old ArtroomError family. | R1, I3, IA, I5, Docs |
| 66 | Glossary | Complete current terms and links to their actual governing contract/version. | R1, R2, Docs |
| 67 | Protocol | Current normative scope/replay/authority/recovery plus reviewed amendments; preserve the inactive earlier specification as history. | R1, R2, I3, IA, I5, Docs |

## Material beyond the 67 pages

The 67 rows are not a cap. Preserve troubleshooting and FAQ, including
unknown command/push, lost replies, disconnect, pause/cancel, device loss,
expiry, revocation, save failure, missing evidence and unresolved publication.
Reuse compact current fixtures instead of duplicating their runs per page.

Also retain `llms.txt`, the generated per-room agent-instructions block,
the short agent guide, supported harness skills, all harness/infrastructure
material and contextual refusal explanations. Their writers, releases,
reviews and acceptance evidence need their own ledger rows when commissioned;
this ledger leaves them planned without assigning a writer or attesting a
tested release or acceptance. A proposed discovery/explanation control is not a
current command merely because an old guide named it.

## All manual acceptance conditions

1. Deliver accurate independently reviewed pages for every delivered
   capability, while retaining every remaining inventory item. Planned
   placeholders do not satisfy their guide obligation.
2. Make every command/sample runnable in CI against a faithful current test
   composition. Reuse the existing starter/browser fixtures; label stand-ins.
3. Record a new person's first hosted change landing within the original
   15-minute target. A source/local fixture is not that cold-reader result.
4. Record cold Claude Code, Codex and pi runs and the pi-durable spike.
   Verify configuration and version claims against current primary sources.
5. Generate CLI/MCP/refusal/error references and show the drift check fails
   on a meaningful mismatch.
6. Check plain-language style for every delivered page.
7. Obtain independent checker accuracy/plain-language review of every
   delivered page, with exact artifacts.
8. Deliver unfamiliar-application discovery and binding-change, stale-intent,
   retirement and name-reuse examples, with exact tested release and honest
   old/v2/planned labels.

Hugh still chooses documentation hosting and the cold-person tester.
Markdown planning and page review can proceed without that choice. This
ledger authorizes no install, provider/account/private/browser/host operation
or new test matrix, and it changes no source priority or Jam readiness claim.

## Reading and verification

The complete original section-4 inventory was read at the baseline above.
A standard-library text check extracted exactly 67 ordered unique page
names; this table must preserve their order and identity. Only this planning
file changes. Source/test package and scripts trees remain equal to main.
This is a partial R0 handoff for independent planning review, not a full
repository/removal audit or full R0/manual delivery.
