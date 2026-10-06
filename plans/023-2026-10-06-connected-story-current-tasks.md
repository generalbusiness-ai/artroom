# Connected browser coding current tasks

2026-10-06. Planner task map for the three connected browser stories,
updated after S3 publication and the capacity design adoption.

A person must be able to start coding work in a browser, close their
laptop, and continue watching, steering and reviewing that work on another
device. The implementation tasks below preserve that complete experience.
The published platform milestone is partial; real hosted recovery and the
complete browser journey remain owed.

This map updates the task routing in [005](005-2026-10-03-browser-cloud-work.md)
and [018](018-2026-10-04-composable-lanes-task-ledger.md). Their dated
designs and original request records remain history. The current requests
and amendments determine which source each owner delivers.

## Required experience

| Story | Person sees and controls | Acceptance still required |
|---|---|---|
| Durable coding workspace | Task, commitment, hold, fork and environment stages; commands and their last durable boundary; acknowledged checkpoint coverage; pending effects and recovery choices. | Real repository edits, dependency installation, commands, results and prepared Git objects survive interruption at their acknowledged boundary. Uncertain effects are reconciled rather than blindly repeated. The exact contribution reaches normal proposal, review and publication. |
| Complete browser workflow | Create or join, import, task input, progress, steering, attention, pause, resume, cancellation, real artifact review and publication. Activity stays beside recorded scope outcomes. | A new person completes a useful change through the browser. Waiting, refusal, disconnection, failed saves and uncertain publication have distinct recovery paths. An agent's statement that work is finished changes no recorded result. |
| Device continuity | Each device has its own enrolled key for the same member. The person can observe, steer and review ongoing work, manage devices and use authorized recovery. | B continues after A closes. Unauthorized devices cannot control work or read private resources. Read-only sessions grant no control; private reads require their own current owner/admin authority. One revoked device with another active key differs from last-key loss, member removal and agent-key revocation. |

## Current implementation owners

Short IDs below name gitseq events. Inspect the request and its named
amendment together before making a source promise.

| Work | Request and amendment | Delivery boundary |
|---|---|---|
| I3 platform | `bcf5ec17` | Complete register, directory, membership, rules, destination and inbox definitions; actual authority, reads, Git gateways, checks, custody, incidents and owned effects. Published M4 does not close this full request. |
| C1 and IA hosted runtime | `b538c5ea`, amended by `d55da8ef`; design milestone `b01321d3` | Current task definition, durable conversation and command records, autonomous work, real filesystem and command tools, save and restore, private reads and export, retention and cleanup. The production supervisor proposal is under review; its real-host premises remain unproved. Use I3's interfaces. |
| C4 and I5 browser and public tools | `18815307`, amended by `20dd4a48` | Identity, enrollment, recovery, onboarding and import; browser progress, steering, attention, artifact review and publication; public client, CLI and MCP discovery, preparation, settlement and replay. Use actual I3 and IA outcomes. |
| I6 integrated acceptance | `7c67653c` | One real deployed A-to-B journey, abrupt host interruption, acknowledged recovery, uncertain-effect reconciliation, qualified review and publication, plus a fresh-person walkthrough and matching journey documentation. |
| Shared version-2 forms | `7df6a805` | Contract, bytes, derive, scope, client and replay move together. Preserve exact v1 lifetime meaning and implement the adopted selectors, authority alternatives and retained decisions. Exact R3 confirmation precedes dependent authority code; public refusals and strict readers preserve branch authorization. |
| Compiler and closed profiles | Full owner `dce6864d`; manifest-interface design `c62fdd2b` | Deliver exact code-owner and peer dependency interfaces, the compiler, the whole commitment fragment, full definitions and an actually smaller closed profile with validated executable pins. Design counts and raw hashes do not satisfy this work. |
| Capacity | `cc570904` and promise `a1bd8c18`; S1 `f28a24bc`, S2 `7b9e535f`, S3 `b1593dc7` | The three partial source milestones are published. The four owner choices are adopted as design. Full coverage of the 114 dispositions, five-axis runtime admission, complete producer and retained-duty accounting, measured values, physical resources and whole-workflow cost remain owed. |
| Public-package starter | `f3299ab4`, amended by `d0682f8e` | Revise the existing design for current scope APIs and actual public release support. Preserve independent source/log reads, deliberate two-actor conflict, durable context-qualified retry, coding and actual Jam interaction, and cold outsider acceptance. Implementation follows review and adoption. |
| Complete manual | `db2fd146` | The full approved 67-page inventory and additional troubleshooting, examples, agent guidance and cold-reader/cold-agent acceptance. I6 journey pages do not replace it. |

C1 and C4 remain live requests. Their original Room, roster, UI and lease
path names do not require restoring the earlier engine: the requester
amendments retain the useful outcomes in the adopted scope composition.
The original C2 request `6cdaf20f` was withdrawn. C3 `13dfc613`, C5
`cfbde32f` and C6 `d89fc17f` are stale through that history. Their useful
outcomes now belong to IA, I5 and I6; staleness is not completion.

The inherited outcome trace is `819afc09`. It keeps autonomous operation
without browser heartbeats, separate conversation and scope cursors,
session-free recovery of admitted signed acts after revocation, purge and
expired retries, and the ratified unfamiliar-act browser witness
`0a9a086c` / `85236634`.

## Decisions in force and proposed changes

R1 revision 24 at `dffa9c90` is adopted by `09e58be0`, alongside R2
revision 15 (`37a482c9`) and R3 revision 28 (`e93b737b`). It chooses
ordered existing-action authority alternatives, a signed verb/noun selector
and immutable whole build imports. Source task `7df6a805` owes the shared
form implementation; it does not deliver the separate compiler or closed
profiles. The design requires one current observation for all alternatives
and preservation of the selected branch and grant in storage and replay.
Public refusals must keep the required selected,
attempted or null authorization. Existing v1 scopes retain their exact
lifetime meaning and pins; menus and raw design hashes activate nothing.
The narrow normalized-result-work wording successor `101b209b` remains
under independent review; it changes no signed canonical bytes.

Recovery R10 at `9bea347e` is adopted by `cf5ecc64`. Uploaded manifest
bytes remain separate from the guarded recorded checkpoint receipt and
pointer. Without local commit certainty, the save stays pending. The R3/IA
decisive-read join and final-cut agreement remain explicit dependencies.
No save or commit ends a host before the recorded agreement and required
premises hold. The current production proposal `7b69cea8` is under DESIGN
review `d92812e4`; its selected nested supervisor arrangement and all 14
actual-host obligations remain unproved. A controlled-command probe does
not establish a production environment for agent-selected commands.

R17 at `f674acb6`, adopted by `7a8a6698`, corrects R16's checkpoint
page wording. Hold expiry and pause create no save. Name the valid
acknowledged checkpoint and its exact coverage, or show unsaved, failed,
pending or uncertain work. No acknowledged checkpoint means no promised
restore. An older checkpoint covers no later edits or unknown effects.
Restore and private export retain their authority and
lifecycle guards. The original `dce6864d` smaller-profile obligation remains
mandatory and incomplete.

The four capacity choices at `73a8f987` are adopted by `2cf4a7d2`:
explicit separate five-axis configuration, exact arithmetic and original-head
failed-dimension reporting; live versus qualified historical byte accounting;
finite producer bounds; retention of spare nonfinal-branch reservations.
These are design choices, not implemented interfaces or measured budgets.
The default v1 answer stays exact; the chosen opt-in capacity format cannot
discard v2 branch authorization. Actual producer maxima and cardinalities,
reachable branch evidence, runtime admission and measured costs remain owed.
Valid redacted replay retains its treatment; `4157eaa2` still stops before an
irreducibly uncertain binding/count draw. No historical length is guessed.

## Evidence and next steps

M4 remains a partial I3 milestone. Capacity S1, S2 and S3 are now
independently reviewed, sealed and published. S3's receiving main is
`cd665d9d31ed4e0a9ba447dfe2a2ec73cf277026`, receipt `870c6472`.
It preserves the separately reviewed guide correction, newer derive guide
and task map. These are source publication facts; actual coding-host,
provider, browser and cross-device acceptance remain with their owners.

The next assigned shared-form source task is `7df6a805`. Its exact R3
authority confirmation belongs to that handoff; it does not require reopening
all R3 or waiting for the separate compiler-manifest design. Other capacity
work remains with `cc570904`. The manifest interface, normalized wording and
production runtime proposals follow their own design reviews. Complete
capacity, I3, IA, I5 and I6 claims require their full evidence.
Source promises name exact adopted decisions, affected interfaces and
focused commands. Real operational runs also identify their test resources,
authority, limits and cleanup owners; a tracking request alone is not a run.

Test economy remains a priority. Reuse compact distinguishing cases and
retained exact evidence; run affected checks and one source gate before
review, without mutation sweeps or repeated whole suites. S1 reused the
existing late-result witness; S2 and S3 strengthened the same canonical
fixture. Their retained gates do not prove a current whole-workflow
10-fold saving. Documents-only changes with unchanged source and tests
reuse their exact tree evidence and run no project gate.

These stories add no blanket Jam readiness gate. The builder judges when
Artroom is sufficient to build Jam, may evolve the work vocabulary during
self-hosting, and continues the authorized Jam work and
[full manual](../notes/2026-10-01-docs-plan.md) in parallel. Hugh retains
the documentation-host and cold-reader choices. Jam R9's timing direction
is adopted by `2b3d0946`: actual hosted development needs a real deployment
and destination publication, with plain-Git continuation after a recorded
block of more than eight elapsed hours. The accepted J0 amendment needs
one singer; its completed local-seed recommendation is not hosted or
complete musical acceptance.
