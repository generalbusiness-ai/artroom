# Planned install recovery: adopted boundary, isolated source preparation

This follows preparation `80f7d056802914f224d79fe607172530c34663dc` under
request `da1a2f020c30efb19e860782f91ccf2c64b51f52`. The planner adopted the
recovery boundary in event `79e1bac158353009b9d93558115a623bcfae4138`.
Builder read that complete event with the explicit repository and actor.
This implements that disposition; it adopts no additional policy.

## Result

Before the first possible founding submission, the command durably saves
an attempted marker. Its digest binds the exact service, operator key,
signed envelope (including signature and deadline), supported pinned
definition and derived register ID. A marker that no longer matches is
refused before network. An unsupported exact pin retains the pending plan
and reports unsupported provenance; no newest-version substitution occurs.

A never-attempted expired plan still sends nothing. An attempted plan may
send only the identical original founding after expiry. The server's
unchanged identity and expiry checks decide whether it recovers an existing
accepted genesis or refuses an expired founding that was never accepted.
The marker proves no acceptance and grants no new effect or time allowance.

The saved marker/envelope survive transport uncertainty and an atomic
config-save failure. Full receipt fact/hash, exact founding and applied
genesis checks still precede saving installed configuration. A mismatch
preserves pending recovery state. Both a new `install --plan` and plain
`install` refuse to silently replace an attempted pending plan. No key,
signature, deadline, version or register ID is refreshed during recovery.

An attempted marker is also retained after a server refusal. This change
adds no automatic discard/reset policy. Previous claim/private-join code,
operations reconsideration and final-send/custody guards are untouched.

## Evidence and limits

One compact real-scope witness covers accepted reply loss and config-save
loss, the never-attempted expiry boundary, and an attempted request that
never reached the server. It checks the marker at the actual HTTP send,
rejects substitution of a supported version and its recomputed ID, and
rejects a returned wrong full-fact hash while preserving the plan. Accepted
recovery retains one genesis and one identical submission payload/ID.
The server refuses the attempted-but-unaccepted expired replay. Existing
malformed/envelope/operator/service mismatch witnesses remain in place.
Faults are injected around the real HTTP founding and receipt routes; no
Git host or external provider runs.

The successful recovery is tested one second after the original 14-minute
deadline, inside the inherited 15-minute signed-read authority window.
A much later exact replay may obtain native acceptance while its genesis
read is forbidden; the command then retains the plan rather than trusting
an unverified receipt. This does not widen read authority or claim indefinite
receipt-read access. That remaining read/provenance boundary is visible to
the owner and integration review.

Focused validation after the final source changes:

- Two files, three tests passed: CLI saved-plan witness and both planned
  install scope witnesses. Runner duration 1.56 seconds; no whole gate or
  performance comparison. Output: `/tmp/artroom-install-recovery-tests.log`.
- CLI source, Node-test and scope-test typechecks each exited 0.
- A one-test control restores the older unconditional local expiry check.
  Baseline: one passed. Mutant: one assertion failed, returning
  `plan-expired` where exact attempted recovery/receipt verification is
  expected. **Distinguishes**; the source is restored.
  `/tmp/artroom-install-recovery-before.log` and `-after.log` retain output;
  the corresponding `.json` files retain assertions;
  `/tmp/artroom-install-recovery-control-summary.json` records the result.
- Two earlier helper invocations were inconclusive before mutation: a
  relative configuration path resolved outside the checkout; an absolute
  configuration invoked from package cwd discovered no matching test.
  The successful control runs directly from the root cwd, preserving the
  same baseline/mutant/restoration protocol. Neither inconclusive run is
  evidence, and no source was changed by them.
- `git diff --check` passed. No package or tooling installation, manifest
  change, provider call, deployment or whole gate was performed.

This remains predecessor source preparation. Main's Gate 1 repairs must
be preserved during integration. The original request still owes the
integrated gate, independent review, filing order and witnessed landing;
this note closes none of them.

## Receipt metadata correction

Under the same `da1a` request and `79e1bac1` adoption, planned install now
checks the receipt's definition against the exact planned pin and its
intent digest against the original founding before following the receipt
or saving installed configuration. A mismatch keeps the pending plan.
The existing recovery witness changes each metadata member in a shape-valid
accepted answer while leaving the actual genesis read unchanged. That read
alone cannot detect incorrect receipt metadata.

CLI source, Node-test and scope-test typechecks passed. The focused saved-plan
and real-scope install witnesses passed: two files, three tests. A manual
control removed this exact metadata guard; the recovery assertion then failed
because an altered definition was reported installed. The source was restored.
An earlier helper invocation selected Node's runner at the root and never
started Vitest; an early-restoration attempt supplied no control evidence.
Neither is counted as a successful control. No whole gate was run.

The genesis proof read and its inherited bootstrap window remain unchanged
pending the owner's disposition. This correction does not substitute a
shape-valid response for independently checked genesis bytes, refresh an
envelope, widen read authority or approve native acknowledgement as that proof.

### Exact retained output evidence

The correction's source head is
`d008ad2f2d6cf7f5db9c09be277e09307c920e6b`, tree
`0ed1302537aee1fd78b126ee7e69d0c9cd1b55b1`. Its packages tree is
`69249ae7f9c0c27d88e92abdaaa86464bf8b9c54`; its scripts tree is
`c7ffb21b9435e2a7985a2bd0492c72dce1047787`.

These files preserve the actual tool-returned output after the runs; they
are labelled transcripts, not original runner-generated log/report files.
No command was rerun to create them. Their SHA-256 digests are:

| Output transcript | SHA-256 |
|---|---|
| `/tmp/artroom-install-metadata-typecheck-transcript.txt` | `4769d772c92d65ef00fe89fde4bdf57efe2808b3e3017dfe90f7194f217a55a4` |
| `/tmp/artroom-install-metadata-focused-transcript.txt` | `0258e8a44a921d889b7ebb41d022da9a33800c36658b48b50632dbc06cc768a4` |
| `/tmp/artroom-install-metadata-control-transcript.txt` | `8bd3f031b26424af4865aa6a3f570c84911931841fb31214f08dc41a28c3d493` |

The typecheck command ran the source, Node-test and scope-test configurations
and returned no diagnostics. It and focused Vitest ran sequentially in one
shell whose final exit was 0; no separately captured typecheck exit code is
available. The focused output reports two files and three passing tests.
The completed manual guard control reports one assertion failure, one skipped
test and exit 1; its source was restored after completion. The two earlier
invalid control attempts above supply no successful-control evidence.

This annotation changes only the note. Source, tests, dependencies and the
packages/scripts trees remain unchanged. The integrated gate and original
review/filing/landing order remain owed; no document-only rerun is performed.
