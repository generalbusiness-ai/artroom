# Planned install recovery: adopted boundary, isolated source preparation

This follows preparation `80f7d056802914f224d79fe607172530c34663dc` under
request `da1a2f020c30efb19e860782f91ccf2c64b51f52`. The planner adopted the
recovery boundary in event `79e1bac158353009b9d93558115a623bcfae4138`.
Builder read that complete event with the explicit repository and actor.
This implements that disposition; it adopts no additional policy.

The current successor implements the further explicit acknowledgement
disposition `aa575e06e92fe04019ec70df53437d51a2f56ca3`, read in full. The
predecessor proof-read behavior and its limits below remain historical;
the final section records the current path, evidence and trust basis.

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

## Native acknowledgement successor under aa575

The configured service's native accepted identical founding may now finalize
planned identity recovery after the full signed-read bootstrap window, without
GET entry zero. The local checks retain the exact signed envelope, operator,
service, pinned version and derived scope ID; receipt definition/intent digest,
register kind/scope/sequence zero and structurally valid complete incarnation/
hash must match. Any previously retained accepted fact must remain identical.
Mismatch, conflict, unavailable acknowledgement or unsupported provenance keeps
the original plan held. Never-attempted expiry and native refusal of an expired
unaccepted founding remain unchanged.

Acceptance evidence is saved before the final installed config. Both that
intermediate state and installed config retain the original plan, complete
accepted receipt and explicit `service-acknowledged` status. They remain for
later verification/reconciliation. The command reports that trust basis and
claims no independently computed genesis hash or fresh mutation rights.

An injected Context.fetch needs an internal declaration bound to the exact
callback identity and configured service. Ordinary native fetch uses the
configured-service contract. The declaration prevents accidental treatment of
an arbitrary callback as that service, but authenticates no remote history.
It changes no ordinary client transport or read authority and introduces no
product permission flow. The real routed scope witness explicitly declares
its service transport; synthetic altered replies are refusal/conflict controls,
not independent history proof.

The same compact witness retries 901 seconds after the original plan deadline,
past the full 15-minute genesis window. It asserts zero recovery entry reads,
retained envelope/receipt/status after success and final-config-save loss,
malformed identity and metadata refusal, undeclared callback hold, and conflicts
in hash/incarnation against the prior durable accepted fact. It still shows
one genesis and byte-identical submissions; the inspector's later entry read
is test-only and is not the command's authority or proof.

Exact commands, run from `/tmp/artroom-install-plan-prep`, with output redirected
before execution:

```text
npm run typecheck --workspace @generalbusiness/artroom-cli
npx vitest run --project scope install.scope --project cli install.test
npx vitest run --project scope install.scope -t 'the attempted marker precedes submission'
```

The first completed with exit 0 for all three CLI configurations. The second
completed with exit 0: two files, three tests. For the third, only the retained
accepted-fact conflict predicate was replaced with false. The unchanged witness
failed by assertion: a conflicting hash was reported installed instead of held.
It exited 1, with one failure and one skip. Source was restored after completion;
commands.ts SHA-256 before and after restoration was
`37396a657469c279c61a9741644156a0a3c408579cfef7cf8b2b92e8b80a8c15`.

| Original captured output file | SHA-256 |
|---|---|
| `/tmp/artroom-install-ack-typecheck.log` | `b071fdcd2a1b9f41028faa45b00336ae371e0f884cc193f14edfaf8c03d0b11f` |
| `/tmp/artroom-install-ack-focused.log` | `5b45e47c2d03ac333959e009da3134572033a48061faeb92ae7429200dcdff11` |
| `/tmp/artroom-install-ack-control.log` | `1c7fe58f9f8e048f2cf6a1bb17a7537727a77702fbc32cb7a87d7c4c3a91f537` |

Final commands.ts and install.scope.test.ts have the checked bytes; the latter's
SHA-256 is `6bfac2cc2c36526fc212e0d2a800f2ff460bfb24392bf28b5fc2ecce076bf873`.
Store declarations were checked; only their documentation was clarified after
validation. Final store.ts SHA-256 is
`933fbc8caf7075a8fcd93251bcdc68b19672713fa4f0be9a585140243452cf2e`.
An initial fixture typecheck rejected an explicitly undefined optional trust
property; the fixture now deletes it, and the final typecheck above passed.
No package installation, provider operation, sleep or whole gate was run. The
integrated gate and original normal review/filing/landing order remain owed.
