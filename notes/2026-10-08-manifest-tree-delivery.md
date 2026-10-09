# Manifest tree and branch proposal delivery

Work in progress for request `b8c5a3c8d9a8f4b9c34d8609b9e779ceef86419a`
and builder promise `1721118488413cc0d65f8ab3ef2d28b9c054c02d`.
This note is not a completed delivery, gate result or deployment claim.

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

- Parent source: six real-Scope scenarios passed, including a one-file edit,
  two-file reservation, generation race, unknown stage/deletion and cleanup.
  Both host paths of the legacy edit scenario also passed. The Git hosts and
  scheduler are labelled stand-ins.
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

## Conditions still owed

Peer review found a remaining custody defect: cancellation after a staging
send with an unknown answer can finalize the publication without retaining
cleanup, even when the provider wrote the ref. The source owner is repairing
that path with a real-Scope witness. Exhausted refused publication pushes
also finalize without staged-ref cleanup. A separate command recovery fix
must preserve the accepted proposal locator when linking loses an answer.
Snapshot reads must bind to the destination's current job generation as well
as the lane's requested state. This candidate must not be gated or filed as
complete before those repairs are integrated.

The planner must judge the expired reservation's explicit cleanup trigger
(`f1b87a0b017aa745ed85f77f4ed3154d36d59eb7`), the historical one-file-form
interpretation (`f001cfc222a2df5803491cc7ecd6584421c28846`) and the demo
proposer's existing member-versus-maintainer authority
(`aa0eef599d6e1e20b45885b4eb3ead5b44e67102`). The
current optional technical demo uses a maintainer; it is not claimed to meet
the request's explicit member-role scene.

The exact final source still needs a final gate, an observed hosted proposal
publication and named refusal, complete independent Source review and landing.
No final gate or hosted proposal run has occurred for this candidate. UI
implementation remains with the separate session under the user's instruction.
