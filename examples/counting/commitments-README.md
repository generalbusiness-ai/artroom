# Counting commitments: successor declaration

This source prepares C1 request `3adae6d003165501ee974606609ee11abb92ec75`,
promise `b74ce5382aca3d8b26db0ca2b44aa0f9aa2a1bb2`, under the adopted
Counting commitments and invitations Draft 4 (`e59f533a`). It adds fourteen
acts for the new application `counting-commitments`. The old `counting`
source, canonical bytes and pin stay unchanged. No scope silently migrates.

The [declaration](commitments.ts) uses existing common forms and the existing
restricted@1 interpreter. Its complete closure contains this one declaration:
there are no child definitions, sends, receives, capabilities, audio effects
or app-specific Core code. Establish opens untimed configuration; the actual
native factory must provide the verified opener and target. Initialize is a
separate authorized act that opens the paused board. Grants must be recorded
explicitly; the factory does not authorize counting actions by implication.

A participant is inactive, active or finally removed. Native max16 counts
inactive and active rows; a complete MemberRef can have one such live row.
Activity does not remove a native member or free a membership invitation slot.
The board remains non-final in paused, open and finished, preserving max1 even
at completion. Promise has max1 live pledged item; its resolved final rows
and the complete history remain retained under native admission limits.

Start opens claims without selecting a speaker. An active signer proposes
the complete ordered active basis and the next number/serial/current generation.
The scope verifies every proposal, full MemberRefs, participant/board revisions,
no pledge/link and fairness before recording a commitment. When more than one
participant is active, the last fulfilled speaker cannot commit next; this
provides neither round robin nor a bounded wait for every member. The promise
retains its exact participant, admission fact, number, generation, serial,
ordered basis and 30-second deadline. Promised and fulfilled counts differ.

Only the holder can Fulfill or Fail that exact pledge. Fulfill requires the
current board link, matching number/generation/serial, native revisions and
admission strictly before its deadline. It advances the fulfilled number,
records the speaker and fulfillment fact, and finishes at target or remains
open without selecting a successor. Fail retains a closed failure reason and
pauses without advancing. The controller can Cancel, then separately change
activity. Deactivate, ForceDeactivate and RemoveParticipant cannot erase a
live pledge. Removal requires an inactive participant; ForceDeactivate applies
to another active participant, not the controller's own row.

Two own-item timers copy the same commit-reading-plus-30-seconds deadline.
The older board expires first, pausing and clearing its link/deadline; the
original promise stays pledged until its own expiry. Both intermediate forms
block replacements. The next ordinary act waits for the due drain. A deliberate
promise-first input must be rejected as wrong-next; it is not an emitted native
history. Expiry states only that fulfillment was not recorded in time, not
that a disconnected device made no sound. Reset requires paused or finished
with no pledge/link, increments generation and clears serial/count/last speaker/
fulfillment/deadline/link while preserving participants, activity and history.
It cannot settle or discard private unknown requests.

The [four coherent witnesses](commitments.test.ts) are authored against the
real validator, restricted evaluator, judges, sealing and fold with in-memory
Ledger state and scripted current grants. They cover canonical identity and
closure; contention/activity/fairness/completion; failure/cancel/paired expiry/
wrong-next/reset/late reports; and max16/ownership/removal/re-entry. They have
**not been run**. Memory refolding is not native persistence, native authority,
Worker restart, durable custody, audible completion or V1 delivery evidence.

[commitments.json](commitments.json) contains authored canonical JSON plus one
trailing newline. [commitments-pin.ts](commitments-pin.ts) currently names:

`sha256:b55824346382d9b158be4cadd9d098008f8129147fba772537778e2f738d5271`

These bytes were authored with a scratch Python standard-library serializer:
ASCII keys/strings, safe integer values, sorted compact JSON and SHA-256 over
`artroom-definition-1`, one LF, and canonical JSON without its file LF. The
[byte authoring script](scripts/pin-commitments.mjs) reproduces this from the
literal source with built-in Node filesystem/crypto only. It imports no
compiler, test config, evaluator or validator. It has been authored but not
executed; the actual canonical implementation equality and declaration/pin
validation remain required focused checks. This pin is not a validation claim.

Later owner-released focused commands, with cached dependencies already bound
to this exact worktree, are:

```sh
node node_modules/typescript/bin/tsc -p examples/counting/tsconfig.json
node node_modules/vitest/vitest.mjs run --config examples/counting/commitments.vitest.config.ts
```

No types, config import, discovery, tests, semantic controls, native run, browser,
audio, provider, installation or gate has been run here. The inherited C0
config/root project explicitly selects the old definition.test.ts only. This
candidate adds a separate focused config and leaves those existing selectors
unchanged; reviewed root integration must include both files in the normal
gate before complete Source acceptance. Source preparation cannot close the
native C1 contention/replay boundary or the full counting `4073e756`/V1 journey,
the eight builder tasks, durability `578edf65`, or the complete manual duties.
