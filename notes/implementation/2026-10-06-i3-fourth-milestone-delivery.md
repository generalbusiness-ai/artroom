# I3, fourth milestone: a complete founding and the first publication judged by its destination

Branch `request/i3-m4`, under the full I3 commission `bcf5ec17`.
Written 2026-10-06. Source before the initial draft: `8b744c3cc`.

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

Two later owner dispositions bind the amended source: `335ef3ea`
clarifies clause identity for R1 revision 24, and `4157eaa2` clarifies
redacted binding evidence. Their contract-text follow-through remains
with the existing R1/R2 owners. This does not claim adoption of a new
complete contract revision.

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
is still owed. The observed story uses four explicitly scripted source
entries and does not credit that lane update.

The pinned byte files and `digests.ts` still stamp source revision 14,
at `4b3bf5da`; design revision 15 is the adopted follow-through. The
issue digest stays
`sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad`,
and change stays
`sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45`.
Both definitions validate whole under the clause amendment. Neither has
the offending conditional same-name sends with differing results. Their
byte files and pins are unchanged from `f09de095d` (Git diff, exit 0).

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

The test writes a manifest, check opening, passed check and merge by
hand. No change lane or runner judged these four source entries. Real
membership enrolls the checker's key, and the published source extent
requires the configured `unit` check. The real destination receives and retains
them, reads their bytes with its production lane reader, observes real
membership and rules, retains extents and changed-set bytes, and judges
the publication reserved. The host stand-in then answers the push,
receipt and token cleanups. The publication becomes published, the
branch head changes, the receipt ends and its tokens are cleaned up.
The actual SQLite holder has one withdrawal decision initially and none
in the final publication.

The verifier reads all five real histories over the actual HTTP read
surface and reports each consistent with grants derived as `proven`.
Only the four scripted lane entries are anchors. Three source-target
duties remain pending; this scenario does not show a real
lane receiving them or full holder release. The separate in-memory
publication scenario settles the scripted lane's outgoing results and
shows the final reservation released then.

The `Branch` fixture of the platform tests still supplies a scripted
`LaneRead`, a made-up directory and observations. Its destination rules
are real; the former first-head and receipt substitute rules are gone.
The production lane reader has separate made-up-record witnesses, and
the real-scope story above reads actual retained bytes with that reader.
The object-format witnesses use real local Git, independently of the
host stand-in. No result here credits a real Git host adapter, runner, gateway,
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
| Checker `a50c4655`: outcome callbacks lost the data's change/opening limits | `7cb0c7e8a` enforces joined changes, opening type and absence, and prohibits taking a holder in an outcome. Four callback witnesses pass; removing the holder-opening guard distinguishes. |
| Checker `395b4241`: observation-only clauses were recovered from the wrong conditional send | Owner ruling `335ef3ea` and source `78766933d` compare both effects and observation rows. A forbidden definition is refused `ambiguous-send`; identical conditional results, distinct names and unconditional forms keep executable result witnesses. Two controls distinguish. |
| Checker `b11774c0`: actual rules observations name checkers by member ID | `bea9a8820` binds that ID to the currently observed membership scope and incarnation, preserving historical grant/key checks. The actual required-check story `59c4b906f` fails its SQLite reservation assertion when the former comparison is restored. |
| Checker `ce5512a3`: nominal agent actions could outlive controller eligibility | `6b7fee625` observes actual membership before and after controller removal or last-key loss. Current merger is refused; historical noncompromised approvals and checks still count. Removing the guard distinguishes. |
| Checker `0f963cd0`: late coded `bad-field` lost its bound draw | `0427af924` shares the original field/subject checks with the fold through retained sidecars. Early failures keep counts; later guard/effect refusals draw one. Counters prove no guard/effect reruns; the old shortcut fails two count assertions. |
| Checker `5255923a`: a no-account clause could use a final holder's retained cleanup count | `7b674fa8f` faults before an unrelated draw. The result stays offered and the state/head unchanged; nonfinal draws and final own-account cleanup remain valid. The guard-removal control distinguishes. |
| Erased text could hide whether a bare `bad-field` refusal reached binding | Owner disposition `4157eaa2` and source `1a114ae51` stop before an unproved draw. Two actually judged histories have different counts before erasure and both stop before the deciding entry afterward. Ordinary redacted decisions keep their credit; removing the ambiguity guard fails the coverage assertion. |
| A prior checked delivery can prove an erased text's size bound | `095b3f380` uses a successful earlier field check in the same scope, incarnation and checked prefix, including superseded tells. An equal or smaller maximum proves the deciding size check; a larger maximum leaves it ambiguous. The larger-maximum control distinguishes. No code or guard is rerun and no text size is guessed. |
| Checker `eb03426a`: accepted outcome names could read inherited domains or lose their reservation table entry | `530e39fe6` reads only own domain declarations and builds tables without prototype setters. Strict canonical-loaded `__proto__`, `constructor` and `toString` follow ordinary validation; an explicitly declared `__proto__` held kind keeps the same positive kind, holder and addition amounts as an ordinary name. Restoring either old branch fails an assertion. No name is banned and no amount formula changes. |
| Checker `44739493`: replay admission omitted pinned platform owners and their positive legacy closure | `8eaf531f2` uses the runtime's shared owner adapter at the final `fits` check. Actual register data/rules judge and fold genesis and a founding in memory; no host answers. Its pending creation needs 93 entries in the controlled witness, and a scripted external reservation needs four more. Tight budgets fail at the founding, sufficient budgets replay consistently, and restoring the raw-owner call fails the mismatch assertion. No capacity formula or production ceiling changes. |
| Checker `e6e5fde8`: observation-only clauses lost retained-byte reservation when effects were omitted | `98faddb3c` retains rows independently of missing or empty effects. Canonical applied/refused/superseded forms have equal amounts; a 321-byte declared value adds 321 bytes to request, clause, holder and addition amounts. Restoring the old skip fails that positive-byte assertion. Invalid effect lists still report shape problems. Outcome-send grammar and all formulas remain unchanged. |
| Checker `4ff6e117`: an unknown own member selected an inherited record validator and caused an unavailable retry | `cba8fd645` selects only own declared validators. Canonical-loaded `__proto__`, `constructor`, `toString`, `hasOwnProperty` and ordinary unknown members receive a written `bad-field` refusal; valid link/issue delivery applies and opens a publication. Restoring the old helper fails the refusal assertion. No name is banned and no rule exception is swallowed. |
| Checker `05fe74ed`: historical views omitted declared index rows | `e37933cec` journals each indexed row with the entry that opens it. The authored in-memory history checks actual lookup contents at empty, older, newer, repeated and out-of-order heads, equal keys, limits, final items, future exclusion and incomplete indexes. Removing that journal fails an assertion. This witnesses the fold/View boundary, not a failure of a built-in reader or a runtime observation. |

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
- Redaction preserves ordinary replay credit. An ambiguous bare
  `bad-field` refusal may require the erased text's original size to
  distinguish an early unbound failure from a later bound refusal.
  Owner disposition `4157eaa2` requires incomplete verification before
  any uncertain draw, with no verified state or capacity suffix. A
  definite early failure or a derivable binding remains ordinary replay.
  Live admission uses the available bytes before deletion, and SQLite
  preserves actual holder/account rows across an ordinary restart.
  Reconstructing counts solely from an erased, ambiguous history still
  needs missing evidence or an explicitly trusted anchor. This milestone
  does not credit cold reconstruction or a new size/phase wire record.

## 6. Verification

Every workspace typecheck passed after integration. Focused combined
checks passed for the forms, real-storage holds/indexes/observations,
replay and destination rules. A final combined check after the story and
owner-declaration corrections passed 51 tests in six files, including
the real founding/publication and value/replay scenarios. All 25
publication and creation cases passed after the fixture fold was given
its pinned binding rules and its expected real decision count.

The first candidate's `npm run gate` passed at `c6b5e16b1f8d01ee7c0bdfcf5ccfe9d27a5f503f`,
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
change, was merged. The initial gate annotation changed this note only.
That gated packages tree was `410b80a5a23e3d74675b9528ce112290fc94b78f`.
Later checker findings required source repairs, so this run is historical
and does not validate the amended delivery. The final amended source
will be gated before filing. Its logs are retained at
`/tmp/artroom-i3-m4-gate.log` and in the directory the gate printed.

The amended gate at `06fbcf38d` failed two withdrawal fixture cases because
the fixture omitted its pinned fold rules and source sidecar. After that
fixture repair, `8b3383cb0d835925f0d16a8ff31055611e116f1c` passed
714 Vitest tests and six Node tests in 15.34 seconds elapsed. The later
prior-bound proof repair changed source, so that pass is historical too.

The gate at `1edd88a211f0dd8c04b8d8fd94f1fe71ca83a4dd` failed one
membership replay setup: a notice's delivery answer had no fact to replay.
It passed 713 of 714 Vitest tests; the command took 29.94 seconds elapsed.
The failed test then passed alone, all four membership tests passed
together, and the scope project passed all 93 tests in 30 files. These
checks did not establish the cause. The witness now asserts that both
notices are recorded before reading their facts, so a recurrence reports
the actual delivery answer. No retry or larger timeout was added.

The gate at `436026fec9372aea3f54b3c0e0328a35638284c1`, tree
`525cdae2a2b7e08e2730c3f7ea125601305334c0`, passed whitespace,
all workspace typechecks, 714 Vitest tests and six Node tests. The
checkout was clean and installation was skipped against the unchanged
lockfile. Typecheck took 3.4 seconds elapsed and 9.6 CPU; tests took
12.2 seconds elapsed and 33.6 CPU. The whole command took 15.85 seconds
elapsed, 36.46 user CPU and 6.97 system CPU. Logs are
`/tmp/artroom-i3-m4-admission-gate.log` and
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.236Ce8Bbdp`.
This annotation changes this note only. The preceding failed run remains
an unexplained failure, rather than a credited functional repair.

That candidate was filed as `057392c6cc851a79ba7ea65ca6e94d460315ddc5`
under milestone request `8eb14bd1`, primary artifact `84e29afd` and
ordinary review invitation `4b6abd64`. Review `5b0ce240` requested
changes for the outcome-name defect, with its early, partial source
coverage explicit. The requester accepted that disposition. Source
`530e39fe6` repairs it; all 33 focused holds tests and the derive
typecheck passed, and both controls distinguished. The gate at
`436026fec` is now historical evidence, rather than validation of the
amended source. Source `8eaf531f2` repairs the separately confirmed
current replay owner-composition defect `44739493`; its five focused
replay tests and replay typecheck passed. Its old-call control reports
`DISTINGUISHES` by an assertion. Both repairs are integrated before the
amended source gate and replacement filing.

The corrected gate at `47bc3a5be6765dd9b0c1fb300ddb36d6f4213731`,
tree `46e969c82d934a41adbd1e446cd825a135086f28`, passed whitespace,
all workspace typechecks, 717 Vitest tests and six Node tests. The
checkout was clean; installation was skipped against the unchanged
lockfile. Typecheck took 3.2 seconds elapsed and 9.4 CPU; tests took
11.3 seconds elapsed and 31.8 CPU. The whole command took 14.81 seconds
elapsed, 34.88 user CPU and 6.54 system CPU. Logs are
`/tmp/artroom-i3-m4-owner-corrected-gate.log` and
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.cOomu7Lr6w`.
This annotation changes this note only; the gated packages tree remains
`3d4cb3ff2bfdb4e33072bbc44f46e85a96228f56`. The earlier unexplained
membership failure remains separately owned under `bd5a8986`, with all
five previous outputs retained in assertion `4049031f`. Neither this
pass nor the diagnostic assertions credit a functional repair of it.

Corrected `4b53c528` was filed as primary `00f03498` under the same
milestone, with ordinary full review `3dea48c3`. Review `b7a616c2`
requested the separate observation-only clause-retention correction
`e6e5fde8`, and the requester accepted that disposition. Source
`98faddb3c` repairs it; 34 focused holds tests and the derive typecheck
passed, with an assertion control distinguishing the old skip. The
replay and scope guides now name all four scripted lane anchors, as
documentation follow-through `3bb1fd41` asks. The named-definition
root-count countercheck was closed by supported counterevidence; no
directory change is included. The gate at `47bc3a5be` remains historical
after this actual source repair. All existing limits above remain open.

The amended integrated gate at
`a15cad6c70580c9e7f58c3ba8ed4b043f76064d5`, tree
`acbf91dfeae1c7d999bacdc0e6b23c1021b901e6`, passed whitespace,
all workspace typechecks, 718 Vitest tests and six Node tests. The
checkout was clean; installation was skipped against the unchanged
lockfile. Whitespace took 0.1 seconds elapsed; typecheck took 3.4
seconds elapsed and 9.5 CPU; tests took 11.8 seconds elapsed and 32.4
CPU. The whole command took 15.46 seconds elapsed, 35.46 user CPU and
6.63 system CPU. Logs are
`/tmp/artroom-i3-m4-clause-corrected-gate.log` and
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.QiYwk2AKJk`.
This annotation changes this note only; the gated packages tree remains
`19562fc840cc9941672eaed12765189a1d4faec9`. The unknown membership
failure and all its retained outputs remain separately owned.

Candidate `47079235` was filed as primary `12d1c528` with full source
review `8939d0a1`. Complete review `0709fe6c` requested the two source
repairs `4ff6e117` and `05fe74ed`, plus current guidance correction
`b8b3b701`; the requester accepted that disposition. The record repair
passed all 19 focused destination tests and the platform typecheck. The
historical-index repair passed 52 focused replay tests and the replay
typecheck. Both old-code controls distinguish by assertions. Guidance
`79f0ded0` reconciles destination/rules availability and the precise
scripted, default-outside and deployment limits; its TypeScript changes
are comments only. These repairs are integrated together. The earlier
`a15cad6c` gate is historical after these source changes; the corrected
source requires its own final gate before replacement filing. No full
I3, numerical capacity, host, deployment or unexplained membership
failure duty is closed by these corrections.

The corrected integrated gate at
`432511e19866e2f68fb3b78ae79bea7bcbd6568a`, tree
`475161c60b4910b42431d350ef0ab1f3012ca468`, passed whitespace,
all workspace typechecks, 720 Vitest tests and six Node tests. The
checkout was clean; installation was skipped against the unchanged
lockfile. Whitespace took 0.0 seconds elapsed; typecheck took 3.3
seconds elapsed and 9.4 CPU; tests took 11.5 seconds elapsed and 32.3
CPU. The whole command took 15.06 seconds elapsed, 35.56 user CPU and
6.34 system CPU. Logs are `/tmp/artroom-i3-m4-index-record-gate.log`
and `/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.rFFHZPj6FJ`.
This annotation changes this note only; the gated packages tree remains
`62bffe221dc1f4fd1e4b4da619d18e50fcf40c2a`. The unknown membership
failure and all retained outputs remain separately owned.
