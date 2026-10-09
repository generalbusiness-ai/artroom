# Manifest tree and branch proposal delivery

Work in progress for request `b8c5a3c8d9a8f4b9c34d8609b9e779ceef86419a`
and builder promise `1721118488413cc0d65f8ab3ef2d28b9c054c02d`.
This note is not a completed delivery, gate result or deployment claim.

## Historical documentation preparation

The composed branch was clean at
`39a4e8ed0bb922e6e9bd0937d401bcbdb7dd508a`, tree
`dd1d141c86f5eb7b097ce12c4f8de23f426885f7`. That checkpoint carried main
`248d179a9832a4c3d4c482de2fa6b6134e0253a0` through merge
`29f394eaba31b4cd44e614ae38ef649cd13fcedf`, tree
`a8495634dad85fe98b2a1db9ed833c9df0bdc848`. The merge added only the
offline design note and sprint-report corrections. Packages, scripts, package
files and the CLI, testing and demo guides remained byte-for-byte unchanged.
The parent source remains clean at
`809e9513868ccc9f5b70551aed5bafc43f6467d7`.

That documentation-only preparation updated retained evidence and handoff
information without source changes, tests, a gate, provider operations or
review artifacts. Later source checkpoints below have separate evidence.

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

**Resolved read boundary.** Planner `41e959e76688a19f42b25d72b5eb908727f0d9aa`
corrected the earlier wording: only an act or alarm causes the next cleanup
turn. Reads must not prepare a turn. The removed patch is not adopted and
receives no validation credit. The later pure expiry projection is described
below; it never runs cleanup or calls the provider.

The exact final source still needs a final gate, an observed hosted proposal
publication and named refusal, complete independent Source review and landing.
No final gate or hosted proposal run has occurred for this candidate. Page v2 is separately landed as `d0a3bdcc`; its approval supplies no manifest
validation or protocol adoption.


## Independent cleanup duties repair

Source `28d12a372b433088f718a80ac133f5a715986adc`, tree
`2dfc63b076cad048efe75fa14fe2bc62f62357a2`, repairs the coupled
ref and token duty fields in the preceding checkpoint. A token's exhausted
revoke no longer hides an unknown stage or spends the ref's remaining
attempt budget. The existing draft cleanupReason slot now holds one bounded
record: optional refReason and tokenReason, tokenAttempts and refRemoved.
cleanupAttempts counts all opened deletion attempts across operations. This
keeps the publication at its existing twelve-slot bound; old pins and global
bounds do not change. The CLI reads each independent duty and its actual
counter. Its string fallback describes prior in-progress source, not a new
historical admission guarantee.

The real-Scope witness combines an unknown original stage, one confirmed
delete and three refused token revokes. Native verify --all names both duties.
The original stage's exact late proof then opens only the remaining two
deletes. A later answer to the earlier deletion cannot lower the cumulative
count from three to two. A separate actual adapter witness retains an unknown
mint as token custody owed at attempt one after a confirmed ref deletion;
its exact late mint proof and attributed revoke then settle cleanup.
The host, transport fault and scheduler fixtures remain labelled stand-ins.

At this exact source, all seventeen affected Scope tests passed
(`/tmp/artroom-manifest-independent-28d12-scope.log`, 20.40 seconds). Eight
focused derive tests passed
(`/tmp/artroom-manifest-independent-28d12-derive.log`). Platform, scope,
lane Scope-test and CLI source/test typechecks passed. Eleven older platform
data values retain equal canonical bytes, recorded in
`/tmp/artroom-manifest-independent-28d12-preservation.json`.

Two restored controls fail direct assertions: dropping the retained ref duty
loses reservation-stage-unknown
(`/tmp/artroom-manifest-independent-duty-control.log`), and restoring ordinal
counting for a late earlier answer changes the count to two
(`/tmp/artroom-manifest-independent-late-budget-control.log`). Both restored
the same source SHA256, `378e9ec24ff8a9408c29f457c75eddb67a5955f7262591d4431c2d4b952e0e9e`.
The first attempted four-field schema failed before room creation because
sixteen slots exceed the bound of twelve
(`/tmp/artroom-manifest-independent-first.log`); this is retained as a failed
implementation probe, not control credit. The late-answer API rejects unknown
answers, so the counter witness uses an admissible late refused answer.

The ordinary-read turn boundary, final gate, hosted observation, independent
Source review and landing remain owed as stated above. No read hook, deployed
claim or completed delivery is introduced by this repair.


## Confirmed ref removal and late refusal

Source `1a3663c7504b39d410c6b4a312737eca1708083f`, tree
`0fd24985d9a6703a3e0c3bf2d411650cb63d95fc`, additionally preserves known
ref removal when an older deletion answer arrives while token custody keeps
the reservation live. The actual host's first confirmed deletion answer is
held while all three attempts become unknown. Its exact late proof removes
the ref duty. A later refusal for attempt three preserves that proof and the
delete count of three; only the independent token duty remains. A distinct
late confirmed stage still explicitly opens any remaining ref cleanup.

The new native witness and the full affected eighteen-test Scope family pass
(`/tmp/artroom-manifest-monotonic-1a366-scope.log`, 21.61 seconds). Three
changed-source type configurations pass. Omitting the preservation guard fails
its direct assertion: refRemoved becomes false and reservation-ref-unknown
reappears (`/tmp/artroom-manifest-monotonic-ref-control.log`). The restored
source SHA256 is
`54cc005b6c0a0d99ca63e8588f233f7d50e916614ebd38695cbceac399b09355`.
The preceding derive, CLI and historical-data evidence still applies to their
unchanged boundaries. This is bounded implementation feedback and validation,
not independent Source approval. The ordinary-read owner decision and all
remaining delivery duties above remain open.

## Current source preparation

The coherent source is `43cae0dbd190cccaf5b32c7763e9e639d9e4d109`, tree
`d33acc7e885391be1d5932f5a87e57e47d9a354c`. It carries landed Page v2 and
documentation reconciliation main `4b6d42a7`, without borrowing their approvals.
Final gate, hosted publication and named refusal, full independent review and
landing remain owed. The snapshot clock/history-floor protection difference
in checker `16cc76f7` remains qualified and has been sent to planner as
`ed2303e9`; no exploit or expired-access claim follows.

Checker `ff599ea1` identified two additional supported defects. Source
`c374302c` rejects empty production/demo manifests before freezing collection,
using the existing nonempty-list guard and named `empty-manifest` refusal.
A refused empty collection remains open; a subsequent one-source manifest
can complete. Only successor pins changed. Four native scenarios and whole
new-pin validation pass, and guard omission admits both empty forms and fails
the assertions. The first test failure was an oracle correction for local
fact normalization, not a runtime repair.

Source `8d146c6b` retains the known native opening, lane, rules request and
accepted source/manifest facts on interrupted post-opening exits. It names
the current request digest and its uncertainty, preserves refusal and mismatch
categories, and gives inspection guidance before a fresh mutation. It does
not retain a generic durable outbox or retry a signed request. Eleven focused
Scope cases pass, including actual acceptance with lost reply and the existing
link-recovery counterparts; locator omission fails direct assertions. An
inconclusive package-wrapper control receives no credit. After composition,
eight targeted repair cases pass at `57a220ad`, with unrelated cases excluded.
The checker service comment now distinguishes snapshot and legacy-token runs.

Planner `41e959e7` requires write-free expiry reporting. Source `39289ee3`
adds optional destination@3 Summary.reservationExpiry, with current read clock
and expired live reservation IDs at the returned head. It compares that clock
with the last sealed time; behind, malformed or unavailable projection clocks
supply no expired IDs. Summary.time keeps its recorded meaning. ScopeObject,
Site, history and old pins remain unchanged. The strict client shape guard
accepts only the two declared projection variants.

CLI `3d88dff6` reports expired reservations as cleanup pending until the next
act or alarm, distinct from independent cleanup owed after recorded attempts.
It reads the projection at the final coherent summary and preserves all
same-head/live/final/pagination checks. Clock-unavailable output names recorded
state without an expiry claim. Historical replay consistency remains separate.

At exact `43cae0db`, four native Scope scenarios and one client transport test
pass; six affected typechecks pass. Native Session reads show valid expiry;
Session/Signed authorization still refuses behind clocks. A deterministic
failure limited to the post-authorization projection clock returns recorded
state and unavailable expiry. Inspector fallback cases are labelled separately.
All application-owned SQL rows, reached head and outside-send counts stay
unchanged across reads and actual verify --all; Cloudflare internal tables
are excluded from the SQL fixture. A subsequent ordinary act records cleanup.
Omitting the expiry IDs or sealed-clock floor fails direct native assertions,
with source restored. Initial strict-shape and internal-table probes are
retained and receive no control credit.

Raw focused logs: `/tmp/artroom-manifest-expiry-43ca-scope.log` SHA-256
`a53003e2fd80e65fd52d08dd2c7597b63bfe8c6c5f45846be1173eeab48a18ed`,
`/tmp/artroom-manifest-expiry-43ca-client.log` SHA-256
`7b447d540a5a2424c6289e0c4849b9d96fa3e79cd7689789f889028f0162d643`.
Root read these complete logs and both complete assertion-control logs.
Metadata and earlier-source evidence retain their own exact identities;
none is relabelled as a final gate or hosted-provider observation.
