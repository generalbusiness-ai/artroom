# Artroom direction and jam readiness

2026-10-03. Planner's current work record, based on Hugh's direction in
the gitseq workroom. This note helps builder and checker choose the next
work and distinguish readiness to start from work still owed.

Artroom should first support declared acts well enough for builder to
judge that development of artroom-jam can start. Next come any specific
spikes that unblock that development. Once it can start, build the jam
and Artroom's user documentation in parallel. Existing backlog remains
in scope, along with platform work that the jam reveals.

## Who decides when jam can start

Builder judges whether Artroom with declared acts is complete enough to
build artroom-jam. The judgment should name the capabilities the first
jam task needs, their evidence, and any remaining limitation and owner.
If a capability is missing, name that capability and the next work that
will provide or test it.

Builder's recorded judgment at main `a04c774b` is **not ready yet**
(`8c87c35c`). It names three needed capabilities: declaration-based Room
admission (stage 2), generic act discovery and submission through HTTPS
and MCP (stage 5), and reading and verifying a v2 Room log (stage 3).
These must be on reviewed main and exercised on the deployed instance.
Stage 4's musical primitives and stage 6's full replay proof remain owed
but do not block the first development task.

Builder names that first task: found the jam's development room with
workroom-style v2 declarations, then use generic acts to land the jam's
own declarations and the cases in design section 7.4. A positive
judgment, room identifier and run evidence are still to be recorded.

Builder's follow-up `d0352a08` records a limit: automated checker-service
checks in a v2 room need stage 4's job act and binding support. The first
jam task can instead use an independent reviewer through the generic
act. The holder or proposer cannot meet their own check obligation. A
separately authorized checker may qualify using its own key when every
job, generation, integration, configuration and input guard holds
(R-OBL-3). A jam development policy that requires automated
service checks waits for stage 4; builder owns that work.

Jam uses its own acts model. Its declarations may change as it develops,
and the vocabulary used to track development in an Artroom workroom may
change during self-hosting too. A changed meaning uses the declared-acts
binding and activation rules; earlier meanings remain available for
replay. A platform change arising from that work gets its own request
and review.

Starting the jam does not require a cleared backlog, all seven acts
stages complete, a frozen workroom verb list, or a separate move approval
from Hugh. It also does not approve unreviewed platform changes or mark
their acceptance requirements complete. The six concerns below inform
builder's judgment and remain tracked follow-ups.

## Declared acts progress

This record uses approved main `a04c774b` and the workroom projection on
2026-10-03. [The declared-acts design](2026-10-02-declared-acts.md) and
[protocol section 33](../docs/protocol.md#33-contract-amendment-6-245986cb-declared-acts-r-decl)
hold the complete seven-stage scope.

| Work | Current state | Owner and next step |
|---|---|---|
| Stage 1, protocol and contract | Landed at `815e3383`; present on main | Complete under its own review |
| Stage 2, Room admission | Builder has promised `fd6f00b6`; source approval is still owed | Builder finishes the exact composed head; checker reviews it |
| Stage 3, log and verification | Builder has promised `1e8fee4b`; source approval is still owed | Builder owns every log path and composes reviewed stage 2 |
| Stage 4, new primitives | Builder has promised `48c021ea`; follows stage 5 in the start path | Builder implements the full primitive and checker-mapping acceptance, potentially alongside jam development |
| Stage 5, generic client access | Builder has promised `a5d64b35`; starts after reviewed stage 2 and a free slot | Builder implements declaration discovery and generic HTTPS, MCP, CLI and UI access |
| Stage 6, complete replay proof | Retained scope; not yet commissioned | Planner files the request after stages 3 and 4; earlier proofs do not waive the remaining obligations |
| Stage 7, jam declarations fixture | Retained scope; not yet commissioned | Planner files the fixture request against the capabilities it uses; builder uses its evidence for readiness |

Checker accepted the stage-2/3 ownership clarification `869d9aad` through
report `0b19f583` and ratification `8e4552fe`. Stage 2 owns admission and
shared policy exports. Stage 3 owns grammar decoding and semantic
verification in `packages/log`. Its accelerated required-call,
reconstructed-context, budget, prepared-event and two-version acceptance
remains fully owed. Stage 6 retains the complete production replay proof.

Parallel development must produce composed heads whose dependencies
have been reviewed. The preferred sequence is stage 2 reviewed and
landed, then stage 3 merged with that main and checked again. Give stage
5 the next implementation slot ahead of stage 4: stages 3 and 5 complete
the capabilities builder identified for starting jam development.

## Concerns retained from the previous readiness checklist

These are follow-ups, not a mandatory completed checklist. Planner owns
their tracking; builder identifies which, if any, blocks the first jam
task. A follow-up needs a concrete implementation request when started.

| Concern | Evidence and work still owed |
|---|---|
| Acts and workroom vocabulary | Declared-acts design is approved and stage 1 is landed. The earlier acts audit at `522a54c7` received changes requested in `4d82c9a8`; its corrections remain useful work. A vocabulary freeze is superseded by Hugh's current direction. |
| Tracking development work | The documentation plan's issue-tracking proposal has not been implemented. Builder must identify how the first jam development task records work and acceptance with the capabilities actually available. The musical session and development of the jam repository are different workflows. |
| Canonical repository and GitHub mirror | The deployed spike proved import and publication in temporary repositories. This record establishes no permanent canonical repository or mirror workflow for platform or jam development. Record the choice and handoff when they are needed. |
| Durable deployment and custody | [The deployment note](deploy-spike.md) records a spike with cleanup. It does not establish the permanent deployment, registry retention and key custody needed for ongoing development. Preserve repositories and development records when setting that up. |
| Development paths exercised live | The spike proved an independent review/check/landing loop. This record does not claim that the complete conflict, concurrent-lane, expiry/take-over, failing-check, carry and monorepo-runner matrix has passed. Builder selects the evidence needed for the first task; the remaining cases stay tracked. |
| Jam first, platform development later | The jam repository exists at `~/play/artroom-jam`; its inspected main contains the initial README and agent instructions. Builder's current judgment is not ready yet, with stages 2, 3 and 5 named as the needed capabilities. No jam development room or positive judgment is established. Record the first task and room when reached; track a later transfer of platform development separately. |

## Next planning work

Keep acts implementation and review moving. Builder's readiness request
`b4ef9b7a` asks for a concrete capability judgment. Commission a blocking
spike only when it answers a named question that prevents the first jam
task; the old jam note's timing and musical spikes are candidates, not
automatic gates.

Prepare the documentation handoff from its existing plan, updating it
for declared acts and application-specific vocabularies. Once builder
judges jam development ready, start jam work and user documentation in
parallel. Guides must describe delivered behavior and clearly label
capabilities still planned.

The earlier MCP-core amendment and wake/schedule design remain owed.
Their review handoffs need reconciliation with current protocol and
artifact successors. They move ahead of jam only if builder identifies
a concrete dependency. The cleanup-visibility handoff is reconciled in
`57b86ffc`; implementation `8d249233` is still owed.

The simplification backlog has not been cancelled or implemented by
changing readiness direction. Retiring the former checklist propagated
ordinary staleness into its dependent audit and handoffs. Planner must
refresh those bases and carry the checker corrections forward before an
affected item starts; preserve the full functional scope and retained
ownership and replay data.

## Workroom record

The current user direction is `7363396b`; the priority order is
`04da4388`. The planner tracking request is `fd8ce0d8`, with promise
`6b2b1713`. These replace the former mandatory checklist without
requiring its completion to begin the jam. All activity continues in
the [gitseq workroom](http://127.0.0.1:7781/).

Builder's readiness promise and current judgment are `8c87c35c` under
`b4ef9b7a`; the stage-5-before-stage-4 sequencing is recorded in
`2ab6120f`.
