# Manifest tree and branch proposal delivery

Work in progress for request `b8c5a3c8d9a8f4b9c34d8609b9e779ceef86419a`
and builder promise `1721118488413cc0d65f8ab3ef2d28b9c054c02d`.
This note is not a completed delivery, gate result or deployment claim.

## Current preparation

The composed branch was clean at
`39a4e8ed0bb922e6e9bd0937d401bcbdb7dd508a`, tree
`dd1d141c86f5eb7b097ce12c4f8de23f426885f7`. It now carries main
`248d179a9832a4c3d4c482de2fa6b6134e0253a0` through merge
`29f394eaba31b4cd44e614ae38ef649cd13fcedf`, tree
`a8495634dad85fe98b2a1db9ed833c9df0bdc848`. The merge added only the
offline design note and sprint-report corrections. Packages, scripts, package
files and the CLI, testing and demo guides remained byte-for-byte unchanged.
The parent source remains clean at
`809e9513868ccc9f5b70551aed5bafc43f6467d7`.

This preparation updates retained evidence and review handoff information.
It changes no source, role, cleanup rule or manifest. It runs no tests, gate
or provider operation and files no review artifact.

## Implemented source

The selected amendment `d9e4baa4` limits this delivery to at most 64
committed UTF-8 text files. The command reads a frozen local branch tip
against the room's published base, preserving the working tree and index.
Deletion, rename, binary content and unsupported mode changes receive named
refusals. It carries signed source entries and a manifest list, not a pack.

New register, directory and destination versions create rooms for the new
lane definitions. Existing genesis pins and legacy declaration bytes remain
unchanged. New one-file edits and multi-file proposals share the tree builder.
The destination records the base, tree, integration commit and source bindings,
then stages the integration commit under its canonical reservation ref before
checks. The checker verifies the reservation and staged objects; the runner
fetches that exact ref. Missing or mismatching staging starts no check.

An acknowledged destination generation fence makes retries current. Results
for an earlier generation cannot acquire publication eligibility after that
fence. A retry after a publication send starts is refused while preserving
the old job and any unknown send. Final key reads remain bounded.

Publication moves the branch by its recorded compare-and-swap. Ref deletion
and token revocation are separate retained duties; unknown staging or deletion
is not settled by a ref read alone. Publication cleanup stays live until its
recorded revocation confirms. Cancellation and failed checks preserve cleanup.

## Verification retained so far

- Parent source: seven real-Scope scenarios passed in the retained final
  run, including one-file and two-file reservations, generation races, unknown
  staging/deletion and refused-publication cleanup. The log reports one test
  file, seven tests and a 9.18-second duration. Both host paths of the legacy
  edit scenario passed in earlier retained validation. The Git hosts and
  scheduler are labelled stand-ins.
- Composed repairs: the retained focused run reports three test files,
  eighteen tests passed and one opt-in recorder skipped, in 35.79 seconds.
  These are historical producer runs, not new execution at this preparation.
  The peer read at `5a98b424` confirmed the selected repairs; it is not an
  independent Source verdict.
- Root composition at `da9c67f669cc613762683e1d4a24720c6bec33ee` passed
  twelve tests and skipped one opt-in recorder across the demo, manifest tree
  and edit files. This precedes the later staging-mismatch guard change.
- The recorded Scope-to-Node bridge retains exactly 29,734 public bytes,
  SHA-256 `e0c0f1023925207bde7f52859d91601e76cd85c6093427244ae164df963fe4c9`.
  It validates those objects, fetches their exact staged ref from a local Git
  stand-in and runs the fixture's configured Node checker step. Missing or
  changed staging starts no additional step. A commit-ID fallback control
  falsely confirms missing staging. Root's composed Node test passed and
  script types passed at `39111ff25adeb45eb510cb794d26ef029fac91c4`.

The bridge joins two runtimes through identified recorded bytes. Its producer
capture was dirty at `bc85a7a2`, with two changes later committed as `4dd2d731`
and a temporary recorder-only switch. Its fixture metadata preserves that
qualification. The local host and executable are stand-ins; no configured
deployment image, container, fresh authority or provider acceptance follows.

## Retained repair evidence

The following raw logs were read for this preparation. The snapshot control's
assertion and terminal summary were read; its long returned-object payload
was not audited in full. Hashes identify the complete files, not a claim that
every payload field was read.

| Log in `/tmp` | SHA-256 | Observed result |
| --- | --- | --- |
| `artroom-manifest-seven-scope-final.log` | `e88b3e8071d8c128a10e0ff61e47dad6c75c2ee7f64f646c2be024f93fa219b9` | Seven tests passed. |
| `artroom-manifest-repaired-composed-focused.log` | `529956258337ae8cf68d718569fe343274edb79faa5f3a519c411c210c1d9225` | Eighteen passed; one recorder skipped. |
| `artroom-refused-stage-cleanup-control.log` | `7c8e825a18dfc5d3f7b4bd711cfe81b560afef8c12a2e641a4970c765db4e28a` | The control left the reservation ref present where the assertion required absence: one failed, six passed. |
| `artroom-snapshot-generation-control.log` | `4e8b05180537ed2c2d472e9a9404b88757c588818b0c2804413993f9e8d49f01` | The control returned a snapshot where the assertion required null: one failed, six passed. |
| `artroom-manifest-cli-link-control.log` | `4694651edd46a2f7a7f576994313fd4b4957e2387afbccf5643d0461331aa034` | Four controls lost the recorded proposal locator; the accepted-link case passed. The log records source restoration. |

The three repaired typecheck logs for scripts, Scope and lanes are empty.
Their successful completion remains producer-attributed; empty files alone
do not establish an exit code. No typecheck was repeated here.

## Conditions still owed

Peer findings were repaired at composed source
`5a98b42407cafae4b61d466c012f8f1ffc41b950`. Unknown-stage cancellation
retains a live cleanup duty; refused publication pushes open staged-ref
deletion and token cleanup. Snapshot reads bind to the destination's current
job generation. Linking failures retain the accepted proposal locator and
safe inspection guidance. Eighteen focused tests passed with one opt-in
recorder skipped. A narrow read-only peer re-read confirmed those repairs;
this is not the full independent Source review. Unknown cleanup stays owed.

Planner decisions `9dba1b4ce04263e3acc6a06e427f4d64ccaa9a47` and
`6c74a564f45defed9d6d91c73148c1b53770b3d9` adopted the three choices.
New one-file edits are one-element lists on the shared tree; old entries and
pins stay unchanged and earlier rooms refuse the list form. The maintainer
is the accepted proposer for the demo, with member grants unchanged.
Expiry cleanup must be automatic on the destination's next timed turn,
with at most three recorded cleanup attempts and named owed cleanup.
The former explicit-resend expiry candidate does not meet that decision.

## Timed cleanup implementation checkpoint

Source `68ef4cef97c605498cf9c65ead6e34d797f7fe22`, tree
`a7d00ba4d080da4d33737da4c759de184c4d6004`, implements the platform-only
constant timed opener for destination@3 in nextDue/judgeTimed and replay.
Its list can open only the owned three-attempt reservation deletion and its
first mint, from held capacity. Declared definitions, different kinds,
unknown callback fields and attempts outside the owned kind's bound refuse.
Only the exact destination@3 runtime can use it. No general callback,
external scheduler or new user act was added.

The timed transition records deletion and mint before the normal operations
driver runs. Failed publication, cancellation and stage mismatch use the
same bounded cleanup. Successful deletion waits for confirmed token cleanup;
unknown custody is not made cleaned. Mint/revoke holds cover stage 1, push 3,
receipt 3 and deletion 3, ten each. The live cleanup-owed item records a
closed cleanupReason name and actual cleanupAttempts. A known accepted delete
can finish at attempt one while the old stage stays unknown: that is owed
unknown custody, not three fabricated attempts. A late own stage answer can
record only the unused part of the three-attempt ceiling.

The carried CLI reporting reads complete live publication items from the
matched summary and retained final items from pagination. The distinction
matters: the items route alone returns only final items and missed live owed
cleanup in the first actual native witness. The corrected native verify --all
names owed ref/token cleanup separately from consistent historical replay.

At this clean checkpoint the committed-source real-Scope family passed
fifteen tests (`/tmp/artroom-manifest-timed-clean-68ef-scope.log`, 17.94 seconds),
including ordinary-act expiry, exactly three known refusals, unknown token
custody, late original stage settlement, positive deletion/revoke cleanup and
actual CLI reporting. Eight focused derive tests passed
(`/tmp/artroom-manifest-timed-clean-68ef-derive.log`); affected typechecks passed.
An omitted timed opener control failed at the direct recorded-operation
assertion, with source restored. It precedes the last reserve-state and
unknown-classification guards and is not a final whole-source gate.

The initial late-stage witness incorrectly expected cleaned after the next
marked delete saw absence. Its failed log
`/tmp/artroom-manifest-timed-late-stage.log` is retained. That expectation was
corrected, not the provider's uncertainty guard: absence cannot settle a
marked attempt. The final witness retains named unknown cleanup after the
remaining real attempts. Eleven older platform data values have equal
canonical bytes; no historical source/admission chronology proof follows.

**Read-trigger boundary remains open.** Ordinary reads currently do not enter
Scope's timed turn. A proposed pin-specific read hook was removed following
Root's boundary review; it is not in this source or its claimed validation.
Only existing ordinary-act and alarm turn triggers are implemented and tested.
Root requested explicit owner judgment on recorded read-turn preparation
versus the instruction against hidden read-writes. No cleanup completion is
claimed by treating a readonly query as an implicit provider operation.

The exact final source still needs a final gate, an observed hosted proposal
publication and named refusal, complete independent Source review and landing.
No final gate or hosted proposal run has occurred for this candidate. UI
implementation remains with the separate session under the user's instruction.
