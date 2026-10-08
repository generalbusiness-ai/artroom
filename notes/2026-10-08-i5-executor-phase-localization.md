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
or abort variants, provider calls or gate were performed for this successor.
