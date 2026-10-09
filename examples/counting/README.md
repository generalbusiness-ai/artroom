# Counting: pure application source

For an application author, this example shows how a scope can own a shared
count using existing declaration forms. It supplies a typed definition,
its complete canonical declaration and pin, and focused model witnesses.
It supplies no browser, speech adapter, hosted scope or enrollment flow.

2026-10-09. Source preparation under request
`8d319c43d9cf62573126cbcf7ef9758acdfa0fc6`, promise
`09fd9347f0fd099c487853db6f6290969e46e918`; planner disposition `ae893dbd`.
The earlier `807e4b2e` / `dd474e38` and `d96023ac` / `416f2f3d` tracking
chains were retired in favor of this single successor. Full counting
request `4073e756` and durability `578edf65` remain open. Baseline is main
`9d7e4c2777ea8d35441b4a9d79b407cd701065fa`; this example's source review,
coordinated candidate gate and normal landing are still required.

## What the definition owns

One participant item per joined MemberRef gives the roster its native order:
ascending Join-opening IDs. Each issued turn retains that complete ordered
basis. The selected member reports the exact generation, serial and number.
Clients may propose the successor fields, but the scope independently checks
the complete roster, member correspondence, arithmetic and selected item
before copying any values. No external counter or app-specific Core rule
chooses a speaker. There is no sort, key-projection or computed-effect extension.

The complete closure is the single [counting definition](definition.ts):
it creates no other definitions and declares no outside operations or
capabilities. [definition.json](definition.json) holds its canonical bytes,
with one trailing newline. [pin.ts](pin.ts) records the validated digest:

`sha256:435d9f5745048183d3cf0392ce909cd76909fd69ee368dfc57e142ba96af1d09`

The validator checks the actual restricted@1 rule grammar. The pin binds
the whole declaration, not a display name. Its profile/interpreter remains
the existing version; no old pin or runtime behavior changes.

## Establish, initialize, then count

Current forms prohibit a genesis that opens a timed item. Establish therefore
opens an untimed configuration containing the native creator's opener and
target. The authorized controller then submits **Initialize**, which opens
the paused board and copies that configuration. This extra act is deliberate;
it is not a claim that a generic application factory is already available.

Join opens a participant; Leave removes the signer's joined item. Start
issues a new turn, and Spoken records its completed number/member and the
actual signed key. A Join affects future turns. A non-current Leave preserves
the active turn; a current Leave issues a different serial for the same
number, or pauses if nobody remains. The controller's CancelTurn can remove
the exact current speaker for disconnect/media-error; it cannot remove an
unrelated participant. The controller can leave their own participant through
ordinary self Leave.

Pause clears the active turn without advancing the number. Reset changes
generation and resets count while preserving the roster and old history.
The 15-second expiry clears the turn and pauses. The next Start advances its
serial. Target completion changes state to finished and clears active values;
Reset is still possible. Empty fields and optional next binding are checked
through the real judges, not assumed from the earlier prose draft.

There is one configuration, one board, at most eight live participants,
target 1–100, and generation/serial at most 1,000,000. Every join/completion
is an entry; final participant rows and history remain retained. These bounds
do not promise unlimited resets or an archive. Normal scope admission and
settlement capacity still apply.

## Pure evidence and its limits

The [model witnesses](definition.test.ts) use the real validator, restricted
evaluator, judgment, sealing and fold through derive's reusable Ledger.
Its membership grants are scripted current answers, and its clock/store are
in memory. Genesis is a pure model founding, not a proved authorized native
application creation. The tests establish sequence, designated MemberRef,
three-to-four roster progression, ordered full basis, duplicate/stale reports,
departures, empty next binding, reset, pause, expiry and deterministic refolding.
They do not establish DO persistence, reactivation, real authority windows,
transport retry, private browser custody or audible output.

A completed report can receive a known roster refusal after a new Join.
The model shows a corrected successor proposal retaining that same completion's
generation/serial/N can be accepted. A future voice client must reuse that
retained completion without speaking again. An unknown acknowledgment must
stay fenced to the exact original envelope; the pure model implements no
network/outbox and supplies no recovery proof. Refolding memory is not a
Worker restart test. Revocation must be refused when observed under native
authority windows, not claimed instantly across scopes.

With dependencies already prepared, run only this example from the repository root:

```sh
node node_modules/vitest/vitest.mjs run --config examples/counting/vitest.config.ts
node node_modules/typescript/bin/tsc -p examples/counting/tsconfig.json
```

The local config resolves workspace modules to this checkout and selects one
Node file. It changes no root suite/dependency configuration. Two bounded
semantic controls were checked: removing ordered roster enforcement accepts
the wrong sequence; removing the reset-generation guard accepts a late old
completion. Clean source was restored. No Worker, audio, provider, browser,
installation, mutation sweep or whole gate was run for C0.

## Still needed for the visible demo

The generic authorized application factory and client watch lifecycle need
their own versioned source/review. Existing authenticated summaries/head
streams can be reused; a custom found request with no verified membership
does not supply native application authority. Independent clients still need
real enrolled keys, sessions and exact pending-request custody.

Root's separate no-audio inventory found three named local voices; it proves
neither audible distinguishability nor end/cancel behavior. Actual TTS,
automatic peer state, unknown reply/reconnect/DO restart controls, a hosted
sequence, measured acknowledgment/peer/audio gaps, qualified replay, reviewed
source and the final natural recording remain owed. No provider fallback is
commissioned by this example.
