# I3, fourth milestone: a complete founding and the first publication judged by its destination

Branch `request/i3-m4`, under the full I3 commission `bcf5ec17`.
Written 2026-10-06. Source before this note: `8b744c3cc`.

This is one milestone. It leaves the complete I3 commission, provider,
browser, application and proof duties open. It claims no deployment and
no completion of the plan's six-scope M1. Its own milestone request,
exact candidate, artifacts and review will be named by the filing.

## 1. Bases and integration

| Adopted design | Revision | Commit |
|---|---|---|
| Scope and replay contract | 23 | `3b3e394fc6807c33211ac80db813621253c38f5c` |
| Authority, effects and publication | 28 | `8b1c3c9d7987fba6ac5f5b31fbe329d50a3f568b` |
| Lane forms and browser flow | 15 | `f4889d470920cabff693b29b3279ed075e5109da` |

The four inherited branches are included: holds `a2c96e913`, smaller
forms `c5fe50eb6`, observations `202d93e51`, and authority rows
`d9718ac2f`. The last two workers committed their remaining changes
before the restart. Integration started from `origin/main` at
`dec02ee25`. The merges preserve the reservation checks, indexes,
settlement markers and observation rows together. The new observation
path is checked by `withinCounts`, just like the older path.

The scope contract's source rows I3-39 through I3-61 are implemented.
The deltas note describes the three inherited groups in sections 32,
33 and 34 and the integrated decision ledger afterwards. Platform data
now uses the destination's holds, additions, operation holders, origins,
observations and indexed bound withdrawal. Neither lane digest changes.
The pinned change lane's source update to send the new `reports` field
is still owed. The observed story uses two explicitly scripted source
entries and does not credit that lane update.

## 2. What the source now does

- The destination has every rule its definition requires, including
  `first-head` and `receipt`. It builds the Git trees, commits and ref
  names from the recorded facts, with the contract's canonical fact text
  and ref digest. Real local Git verifies both SHA-1 and SHA-256 forms.
- A publication takes a reservation. Operations and outgoing requests
  draw on its holder. Bound withdrawals take one of its decision counts
  even when refused; the fold derives the binding again from the
  recorded request and the state before it. It trusts no draft-only
  binding. Final holders release decisions, while unfinished cleanup,
  receipts and outgoing results keep their remaining duties.
- The destination reads the real rules, merger, holders of
  `rules.publish`, authors and approving/checking keys. Its two subject
  lists are derived again in the commit and in replay. The lane reader
  reads the retained source entries; an outcome copies its origin's
  `uses` and fetches no new foreign entry.
- Rules `publish` reads its checkers. Directory lane creation observes
  active definitions, and task creation observes its worker. The rules
  scope answers observations with the extents digest and matching bytes
  from the same state. Its configuration act declares its retained value
  place.
- An owner declares evidence value domains and maxima in its installed
  version code. Runtime and replay share that declaration before
  admission; an absent declaration is unavailable, never a zero amount.
  The changed set is kept beside the destination's judge entry under
  `artroom-changed-set-1`. The judge reserves two outcome entries, each
  with up to 262,144 bytes of changed set and 262,144 of observed extents:
  1,048,576 retained bytes beside the entries and their other duties.
  These bounds remain the designs' conditional proposals, owned by R4.
- Retained value reads require the domain as well as kind and digest,
  over RPC and HTTP under the existing read authority. A replay without
  named bytes is incomplete. A repeated or conflicting recorded outcome
  is answered from the ledger before another value read; owner and kind
  are still checked first.
- The verifier checks the shared entry-budget admission after folding.
  A taking entry that did not fit used plus reserved entries is a
  mismatch. Runtime and replay use the same settling conditions.

## 3. The observed story and its trust boundaries

`packages/scope/test/founding-real.test.ts` runs the deployed classes,
SQLite storage, the package's platform rules and production membership
reader in workerd. The Git host is a labelled stand-in. No provider
created a repository in this scenario.

The install founds the register. A claim survives the lost first reply,
creates the directory, then membership, rules and the destination. The
first head is compared with the exact computed founding commit. Rules
retain a configuration, refuse an inactive definition and worker, read a
checker from real membership and publish it. A signer named as checker
is served by her grant and is correctly refused because her role is
admin, not checker.

The test writes a manifest and merge by hand. No change lane judged
these two source entries. The real destination receives and retains
them, reads their bytes with its production lane reader, observes real
membership and rules, retains extents and changed-set bytes, and judges
the publication reserved. The host stand-in then answers the push,
receipt and token cleanups. The publication becomes published, the
branch head changes, the receipt ends and its tokens are cleaned up.
The actual SQLite holder has one withdrawal decision initially and none
in the final publication.

The verifier reads all five real histories over the actual HTTP read
surface and reports each consistent with grants derived as `proven`.
Only the two scripted lane entries are anchors. Progress messages to
that scripted lane remain pending; this scenario does not show a real
lane receiving them or full holder release. The separate in-memory
publication scenario settles the scripted lane's outgoing results and
shows the final reservation released then.

The `Branch` fixture of the platform tests still supplies a scripted
`LaneRead`, a made-up directory and observations. Its destination rules
are real; the former first-head and receipt substitute rules are gone.
The production lane reader has separate made-up-record witnesses, and
the real-scope story above reads actual retained bytes with that reader.
The object-format witnesses use real local Git, independently of the
host stand-in. No result here credits a real Git host adapter, gateway,
production token delivery, browser session or cloud deployment.

## 4. Corrections and distinguishing witnesses

| Correction | Witness and control |
|---|---|
| Checker `d372b4e8`: canonical JSON puts `of` before `slot` in a binding operand | `forms-binding.test.ts` loads the canonical whole definition. Restoring first-key selection fails its acceptance assertion. Exact member and subject restrictions remain. |
| Checker `01bb33fd`: shared rows could retain the older record while claiming both rows whole | `forms-observes.test.ts` keeps one selection through both phases: the fresh short-window record wins in either input order; with only the older reuse, the loose row is whole and the strict row absent. Reading the first independently serving record fails the retained-record assertion. |
| A member served by the signer's grant was invisible to its rule | Existing own-member witness reads the projected member, checks the 300-second boundary and once/reuse rules. Removing the projection fails the judgment assertion. |
| Observation sizing treated ASCII membership handles as six-byte escapes | The adopted 65 authors, merger plus eight other keys, rules and holder rows validate; a larger key set is refused. Restoring the escape multiplier fails acceptance. Rules content is sized at 49,571 bytes for 256-byte handles. |
| Decision counts were separate from the actual holder ledger | Bound refusal, additions, outgoing accounts, release, history fold and full-scope replay witnesses. Removing a draw or decision reservation fails the count or admission assertion. |
| Evidence values had no runtime/retention/read/replay path | Real SQLite value retention across restart and HTTP replay; wrong digest, missing bytes and oversized new evidence write nothing. Lost retention and omitted maxima controls fail storage and accounting assertions. Missing owner declarations and recorded-outcome idempotency have additional controls. |
| First-head equality, undeciding read, directory reference and extents bytes | Focused controls for each fail the corresponding publication/founding assertion. |

The worker reports and the integration logs record these controls as
`DISTINGUISHES`, by assertions. The tests label their scripted histories,
observations and outside answers. No mutation sweep was run.

## 5. Limits and duties kept open

- No deployment or production Git host adapter is delivered. The default
  outside port still sends nothing. Installation and browser paths,
  custody, task execution, the remaining full I3 outcomes and the proof
  plan remain with their existing owners.
- The change lane still needs the adopted forms and selected-report send
  update, then real lane-to-destination and progress delivery witnesses.
  The story proves the receiving destination using scripted source acts.
- The entry budget is enforced and replayed. Amounts in the other four
  dimensions are computed, including declared evidence maxima, but
  runtime admission against their budgets is not complete. What a live
  item's state-started duties reserve is still known only in entries.
  This remains request `cc570904`; this milestone closes neither that
  duty nor whole-operation cost measurement or numerical bound adoption.
- The observation-size check still counts observations and the fixed
  frame, not a generic static derivation of every effect and copied use.
  An actual entry is checked against `entryBytes` before sealing. The
  authority's whole-entry maximum and the proof plan's measurements remain
  separately accountable; the changed-set value is outside the entry.
- Marker settlements are implemented generically and witnessed on
  made-up data. The destination's remaining marker-duty design questions
  are not settled by the generic tests or by this publication story.

## 6. Verification

Every workspace typecheck passed after integration. Focused combined
checks passed for the forms, real-storage holds/indexes/observations,
replay and destination rules. A final combined check after the story and
owner-declaration corrections passed 51 tests in six files, including
the real founding/publication and value/replay scenarios. All 25
publication and creation cases passed after the fixture fold was given
its pinned binding rules and its expected real decision count.

One `npm run gate` passed at `c6b5e16b1f8d01ee7c0bdfcf5ccfe9d27a5f503f`,
tree `7710fc8219062444712230d287274fe62c0a231a`. It printed 694 Vitest
tests passed and 6 in Node's runner. Whitespace passed; every workspace
typecheck passed. The install was skipped: dependencies had already been
installed from the unchanged lockfile.

| Observed step | Elapsed seconds | CPU seconds |
|---|---:|---:|
| Whitespace | 0.0 | 0.0 |
| Typecheck | 3.3 | 9.4 |
| Tests | 11.6 | 32.0 |

The whole command took 15.08 seconds elapsed, 34.96 user CPU and 6.72
system CPU. These are one observed run, on shared Mac17,7 hardware with
18 CPUs, after focused tests had already run. Load was not captured
before the gate; the reading after it was 3.64, 3.69 and 3.86. No cost
saving or controlled comparison is claimed. The previous milestone's
note reports 537 Vitest tests; this gate has 157 more.

Before the gate the latest main commit `f09de095d`, a plan 021 document
change, was merged. The final gate annotation changes this note only.
The packages tree is `410b80a5a23e3d74675b9528ce112290fc94b78f` at the
gated head and the filed head. Source and tests are unchanged after that
gate; no second gate was run. Its logs are retained at
`/tmp/artroom-i3-m4-gate.log` and in the directory the gate printed.
