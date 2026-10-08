# Executor preparation: exact restart phase

This preparation evidence remains under the existing executor owners 484/9be.
It is not source approval, activation or whole executor delivery. Source
checkpoint `7455501e80f074bcbd77a039264eb8e74b489375` and its full restart
witness remain preserved.

The earlier completion log preceded the Operations pass, owner/history
snapshots and helper return. Attributing that overall timeout to eviction
was too strong. This successor adds bounded start/done labels around the
same existing awaits. It changes no assertion, timeout, retry or RPC.

One focused run used:

```sh
npx vitest run --project scope github-founding -t 'registered original Git dispatch'
```

The default five-second test timed out. The physical port call completed
exactly once and rejected the changed binding. The Operations pass, closed
owner snapshot, history snapshot, helper gate cleanup and helper return
completed. The last completed phase was `helper done`; the first incomplete
phase was `eviction start`. No post-eviction phase was reached.

The pending await is now localized to `destination.restart()`, which calls
the pinned cloudflare:test 0.22.0 helper and its native
`workerdUnsafe.evict`. This observation does not identify a native cause,
prove deployment drain or establish provider exclusion. Actual restart and
post-restart no-resend proof remain owed. Production supplier, independent
trust, ticket/finalization, bundle, drain and capacity prerequisites remain held.

The unedited [raw phase log](2026-10-08-i5-executor-phase-localization.log)
has SHA-256 `2a681285771f812ce17080b82b29af5c721d466656b6fabccfca9aaf3fa4bdeb`.
The original retained copy is `/tmp/artroom-executor-phase-localization.log`.
Earlier failures and the single restored zero-POST guard control remain at
the paths recorded in checkpoint745's commit body. No further runs, timeout
or abort variants, provider calls or gate were performed for that phase successor.

## Replacement-life waitUntil and alarm observation

Planner diagnostic `2e2517581c29a0f2961270603784b6cc9717d62c` authorized one
further run of the same full witness with its default timeout. The test-only
name-bound observer checks the actual native method's data descriptor before
installation, rejects accessors or unsupported descriptors, and checks exact
wrapper readback. It forwards the exact original promise to the original
method with its native receiver. The registry retains only a fixed source
label and counts. No original promise is replaced, canceled or awaited by
the observer, and no extra native wait is registered.

The observation row is set after earlier founding/mint setup and missing-input
holds. The helper then completes its existing restart before the effect RPC
constructs the replacement object and installs the observer in its wiring.
Coverage therefore starts at construction of that replacement original-send
life and ends at the snapshot and method restoration. It excludes the earlier
founding/mint life and any underlying native/RPC work that those earlier calls
could retain. Zero registrations applies only to the observed replacement life.

Installation and exact wrapper readback succeeded: installations 1,
unsupported 0. The snapshot recorded registrations 0, pending 0, fulfilled 0
and rejected 0. Its restorations 0 is the copy taken before the callback's
`finally` restored the original descriptor/method. The subsequent restoration
count assertion was 1 and completed before `eviction start`.

The actual alarm was `4070908800000`; native `Date.now()` was
`1791449766262`, while the separate scripted clock was
`2099-01-01T00:00:00Z`. The alarm was later than observed native time.
This measures the stored alarm, not all native handles or a running handler.

Helper/pass/physical completion and the native observation snapshot completed.
The initial helper restart succeeded; final post-send `eviction start` again
had no completion before the five-second test timeout. No post-eviction
assertion ran. Neither the zero counts nor the future alarm identify a native
cause, prove quiescence or discharge the owed restart/no-resend proof.

The unedited [raw observation log](2026-10-08-i5-executor-waitUntil-alarm-observation.log)
has SHA-256 `5b53c3dec8d4b85f17869c05892974a68310b2f1c7855aa9ec09dd110f863e8a`;
its original copy is `/tmp/artroom-executor-waitUntil-alarm-observation.log`.
The observer source patch retained before this note has SHA-256
`750d75a3a1f44f89da2b5d00040a3164505660a5d189687a9cf4fb3bdd6bcde8`
at `/tmp/artroom-executor-waitUntil-observer-source.patch`. Scope typecheck
passed at `/tmp/artroom-executor-observer-typecheck.log`. No further run,
placement change, timeout/abort variant, provider call, activation or gate
followed this observation. Checkpoints745 and390 remain preserved.

## Registered post-mark classification repair

Finding `e67b562c7488301217b64a4401485e9ecc7d84b2` and planner direction
`51fbeba0ee61aa71319ca02669810e76e1ef373e` identify a separate source defect:
after the original's irreversible mark, local denial or stale discovery was
classified as `not-sent`, producing a decisive refused own-answer. The
fence-present path now returns no decisive answer, so existing Operations
records unknown and retains original ownership, mark and reservation.
Unfenced legacy classification and complete own remote rejection stay intact.
No attempt is reset, rearmed or resent.

The compact witness uses the existing isolated real-scope Operations fixture.
Opening/owner rules, signed authority/admission/capacity, live authorization,
producer conversion and finite Git upstream are labelled stand-ins. SQLite,
Scope/Operations, signed fence/mark, sendOnce, Git object validation and smart
HTTP are actual. It claims no actual mint revocation/expiry or host authority.
Discovery is suspended after mark, authorization is denied, and the one ask
resumes: zero POSTs, unknown/none outcome, unchanged nonnull mark, unconsumed
owner and one retained unknown reservation. A separate unfenced library call
checks legacy `not-sent`; it is not a replay by the Scope driver.

Validation ran only the new witness (1 passed, 9 skipped), Scope/Git typechecks
(passed), and one control restoring only the old !ran/stale classification.
The control failed at the actual stored outcome: refused/own-answer instead
of unknown/none. Its source was restored. An initial test-only assertion
mistook the folded evidence digest for an entry's evidence body; it was
corrected to inspect the actual stored entry, with that failure retained.

Two source blobs: github-host.ts `f8df30d75549aff7f0965d75c9f59a6c5eba1fa9`;
operations.test.ts `6c3cc298c5e0f446adb339704015861a4465895e`.
Commands: `npx vitest run --project scope operations -t 'registered post-mark local denial'`
for witness/control; `npm run typecheck --workspace=@generalbusiness/artroom-scope`
and `npm run typecheck --workspace=@generalbusiness/artroom-git`.

Retained evidence (SHA-256):

| Path | Hash |
| --- | --- |
| `/tmp/artroom-executor-denial-source.patch` | `f7cdde5e43e4adc1d2e7b2d145a87b3bb012f7477bc4838355961be950e849fd` |
| `/tmp/artroom-executor-denial-focused.log` | `b75d4a8f26896a0f16714f6e0f12c27762f40a3f2719913950a883cf3e879a70` |
| `/tmp/artroom-executor-denial-control.log` | `1d76b14237152603cc7d97115e6f1f1989aa5e160539fa43775d25b41c15f132` |
| `/tmp/artroom-executor-denial-typecheck.log` | `6d6fedb36dbee4bff38ae0d2fcbad3cce9af62a012c11f1517cbd8d6ce0d09a6` |
| `/tmp/artroom-executor-denial-git-typecheck.log` | `fb1946fb8e814e74df3ec3ae73f4cdae0fc4738093929b56fb1bf46851dd23b8` |
| `/tmp/artroom-executor-denial-initial-assertion-failure.log` | `a7732822e0260328cd9a365418d483b1041bac6de2f5095b1980eed5513b3d04` |

All original tests, full restart assertions and failed restart logs remain
unchanged. The full eviction witness was not rerun. No Room/version matrix,
gate, provider call, production activation or broader source change occurred.
Restart, supplier/trust, full auxiliary, coordinator, bundle/drain and capacity
obligations remain owed under the existing owners 484/9be.
