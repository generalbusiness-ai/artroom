# Expanded Gate 1 source and live-operations intake

Requests: `225da894` (whole Gate 1, producer `f8a56f1c`) and `4d8d543f`
(live operations, producer `3be19128`). Branch `request/i5-live-ops-intake`.

The combined source is locally gated and ready for exact review preparation.
It contains the GitHub component, the hosting service adapter, causal reads,
claim recovery and the upload-pack framing repair. It is not approved or
landed. This exact combined source now has live founding, authenticated
replay and Git clone evidence. Planner decision `0478ff82` binds its new
independent SOURCE review to existing Gate 1 request `225da894` and producer
`f8a56f1c`; receipt eligibility remains conditional on approval, landing and
the required landed-commit gate. Full I3, native lane hold and
change publication, profiles, capacity and browser obligations stay open.

## Source and ownership

This branch preserves the frozen GitHub component `a4e3dbd19`, integrates
cloud live operations `31cd35577` and own-host source `c7955c39`, and adds
builder repairs. Merge `03425641f` combines live operations with the original
preflight fixes; `61bb2e140` adds the own-host adapter and its isolated repair
`a7a52112`. The native framing fixture commit `5c981c6d` and repair
`e380dcf5` are cherry-picked without the unrelated site renderer.

Builder and delegated readers inspected the complete incoming source deltas
and notes. The GitHub current component received a complete independent
source review `74f5aee6`: no additional high-confidence code defect, but
changes requested because the component's prepared receipt would close
unfinished expanded request 225. Builder accepted that finding via
`c5264fea`. No source approval or landing is inferred from it, and its
reading does not give current-source credit to these later changes.

## What the integration changes

- **Exact claim recovery.** Keep the signed found, seat and first-key
  envelopes before sending, and their accepted facts afterward. Unknown or
  unavailable delivery retains the request. Saved markers are checked by
  settling the exact envelope and comparing intent digest and full fact.
  No deadline is refreshed. Only `--again` deliberately opens another found.
  Cached child IDs are derived from the actual directory seed and full
  reference; same-key, same-handle rooms cannot be spliced together.
  Legacy digest-only state recovers only from checked real retained claim
  and enrollment records, otherwise stops without a new mutation.
- **Causal read admission.** Validate signature, exact route argument,
  target, clock and deadline before resolving any chain. A foreign send's
  signer can qualify for its derived entry without first signing locally.
  Summary eligibility remains separate. One unavailable chain does not
  poison unrelated later entries; resolved roots are not reread.
- **Typed retained provenance.** An authorized entry must carry the exact
  retained kind, digest and domain through the existing typed/provenance
  helpers. An unrelated quoted digest is not authorization. The retained
  request argument is SHA-256 of `artroom-read-resource-1`, newline and
  canonical `[kind,digest,domain ?? null]`; v remains 1 and no bound grows.
  Client, replay source and service compute the same fixed-width argument.
- **Whole register history.** Decision `ca8ad1cf` permits all register
  entries to a recent local signer, and to an authentic session of a
  membership its claims created, without the signed-entry window for that
  session. Other register reads are not granted by that session rule.
- **Destination sessions.** Authenticate MAC, deployment, recorded
  membership identity, clock, expiry and read permission before a bounded
  RPC to the actual creator directory. Verify its confirmed full membership
  incarnation and cache it only for session checking. Recheck authority on
  the current clock after the await. Grant observations and the four-cause
  bound are unchanged. Native issuer sessions include summary; manually
  restricted history-only sessions conservatively cannot resolve a missing
  birth incarnation through that summary route.
- **Restart progress.** The first call of an object starts one driver pass
  for a recorded unsent attempt. A sent attempt remains sent; no mutation
  retry is invented.
- **Own-host guards.** Configuration is pinned to the binding's
  `artroom-demo` namespace before calls. Creation's remote must match the
  configured host, namespace and name. A cleanup handle is reported only
  after custody reads back the exact plaintext. Token replies must state
  requested scope and a valid reported ISO expiry. TTLs are requests,
  not fabricated expiry evidence. Lost creation replies, failed cleanup and
  name-only repository identity remain explicit service limitations.
- **Pack framing.** Parse the counted objects, verify SHA-1 at their actual
  trailer boundary, then allow only one exact `0000` when upload-pack opts
  in. Corrupt/truncated packs, other tails, repeated flushes and uncounted
  compressed objects remain rejected. Existing object, delta and byte bounds
  remain; only fully verified objects enter the cache.

## Local checks

Final gate at `6621284d7f55c275f33dba10f49e4da0ccc9398e`, tree
`a0b0f91c4377c4d9ff4fa5c43cdcc59a34d49030`: all typechecks,
**781 tests and six active-source checks passed**. Packages tree
`d485f8afd69fa939f75ce30f3c2f5a5e3176e6e3`; scripts tree
`c7ffb21b9435e2a7985a2bd0492c72dce1047787`.

Log `/tmp/artroom-expanded-gate1-framing.log`; raw phase directory
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.aTqKkzROve`.
Install skipped with current lockfile. Whitespace 0.0 seconds; typecheck
3.8 elapsed/11.8 CPU; tests 24.0 elapsed/49.1 CPU. These are phase figures,
not total command time. Shared Mac, Node 26.10.0, Git 2.54.0, warm focused
caches; load not sampled.

The first combined gate `61bb2e140` failed the old synchronous stream
fixture call after stream preparation became asynchronous. The repair
awaits that call and preserves every late-answer/head/checkpoint assertion;
nine focused operation tests passed. Log
`/tmp/artroom-expanded-gate1-stream-await.log`; original failure
`/tmp/artroom-expanded-gate1-61bb2e140.log`. A new gate passed 779 tests at
`ea41b9402` before the incoming framing change; it is not used to verify
that later code. No whole-suite repeat without a changed source or failure.

Focused source evidence includes the actual Worker claim crash/retry witness
(`/tmp/artroom-live-ops-claim-4d8.log`), six destination/session/founding
tests and two guards (`/tmp/artroom-destination-session-*.log`), eight
signed-read tests, client/replay tests and three controls indexed in
`/tmp/artroom-live-read-evidence.json`, and eight own-host tests plus six
controls from the isolated adapter repair. Framing's four focused tests and
malformed-tail control are `/tmp/artroom-expanded-framing-focused.log` and
`/tmp/artroom-expanded-framing-control.log`. Controls were restored before
the gate; no sweep was run.

## Live evidence and remaining limits

The isolated Worker `artroom-scope-review-g1.inguz.workers.dev` runs the
gated packages/scripts trees above, deployed from notes-only head
`3c5b117918206f20047111916399a58b6894101c`. Source deployment version
`a9419198-1212-45dc-9ae9-f2d2b92047be`; session and hosting configuration
were applied afterward. Install took 1.307 seconds and claim 8.880 seconds.
All six authenticated replay commands exited 0 and reported consistent,
without anchors or missing foreign facts. The real operator-token clone
exited 0: founding commit `deb39648e7622493c5e7b80d0213cd443531cdd4`,
empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`, subject
“Found this repository.” on `main`. See the companion live witness for
exact identities, coverage, logs and trust limits. Builder used an operator
read-token stand-in; this does not demonstrate the later room-issued clone
credential flow or a fresh-person walkthrough.

Earlier observed runs are attributed to their exact source versions:
builder's public GitHub founding/credential-free clone from `dfaa5395`
(`73507add`), planner's own-host founding/token-authenticated clone from
the `714afda4` integration (`b00cde62`), and planner's first empty-tree
site response after the framing repair (`60ce7f0f`). They are component
evidence, not reproduction of the complete source now gated above.

Whole-register history is contiguous. Unanchored multiple-cofounder replay
still asks for another directory's private history even when its genesis is
retained by the register. The fixture's explicit anchors make that replay
consistent; they are labelled and do not establish unanchored live replay.
Foreign outcome-origin chains outside the current scope and O(history)
eligibility/carried-input costs remain qualified limitations.

The deployed planner branch also contains later clone and site work. Builder
has not overwritten it with this narrower source. The cloned and rendered
own-host paths need reconciliation with the new session and resource-hash
protocol. The later cloud requests remain separate and ordered.

Planner decision `0478ff82fe22979331146bfeabe3eb32861a0138` and report
`c6b43291` choose the expanded successor under existing `225da894` /
`f8a56f1c`, preserving the historical `74f5aee6` changes-requested review
and all original/re-cut conditions. No GitHub-only partial receipt is made.
Independent exact SOURCE approval, implementer landing and the required
landed-commit gate are still needed. The decision closes no separately owned
I3, Gate 2, live-operations, clone, site, browser, profile or manual work.
This note grants no approval and ignores no unreadable dependency.
