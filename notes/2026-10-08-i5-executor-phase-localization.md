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
