# Lending drafts, confirmed handles and recovery wording

Current Source child `1665d183`, promise `60a826a4`, combines the four
nonblocking P3 findings under `6bfce701` / `9253b465`. It starts from Main
`55e1970a5`. The draft-only child `a6cd648c` / `a2db9f95` produced local
checkpoint `a53744bc`; `c0218075` retires that narrower request toward
the combined outcome before any Source artifact or full gate. The
combined request `57878f81` / `8f268c82` then produced checkpoint
`0d1f382b8`; `8234904a` continues it under the current request, changing
only the local-validation sequence. All original attempts remain.

Archive remains priority 1 for review and landing. During that review,
an exact local composition of archive `c811785ea`, this Lending slice
and invitation slice `8c98c1f73` can receive one frozen integration gate.
This is validation, not approval of an unreviewed dependency. Source
filing and normal landing still wait for archive approval/landing and
exact Main correspondence. A code change from review requires a fresh
implementation freeze and check.

The renderer previously cleared donation and cancellation inputs after
both a recorded act and a refusal. It also cleared a cancellation reason
after unrelated recorded acts, including publication. A person could lose
the text needed to correct a refusal, or a draft they had not submitted.

The renderer now clears only fields consumed by a recorded act: donation
name and description after donation, or the reason after cancellation.
Refused and unknown outcomes preserve drafts. Publication, borrowing and
returning consume neither form. Native authority, staff controls, request
custody and epoch fencing are unchanged.

Post-join discovery now reads this device's active key and member from
authenticated membership before returning an identity. The response must
be complete, bind the full membership scope/incarnation and pin the
current application membership version. Missing, contradictory or
ambiguous key/member rows do not confirm a handle. The renderer stores
the confirmed handle and states confirmation only after discovery.
Existing stored identities and original pending-request bindings are not
migrated or rebound by this change.

The README and demo script distinguish local scripted renderer checks
from the retained hosted runs. Check documentation now says that it
submits no new lending or join act. Its reads may sign and send
read-session authentication. The custody check, act submission and retry
rules are unchanged.

## Focused evidence

The browser flow is: the shelf loads, the person types a donation or
cancellation, a scripted gateway returns a refusal, and the real renderer
keeps those values available for correction. The same witness exercises
recorded donation and cancellation, an unrelated recorded publication,
and an unknown outcome.

The Browser plugin is not available. The check uses existing pinned
Playwright 1.63.0 and local Chrome against a loopback fixture, at 1280 by
900 and 390 by 844. The actual main renderer, model, shelf and CSS run.
Gateway, membership, remembered storage and publication ports are explicit
stand-ins. This proves the rendered boundary, not native authority,
custody, signatures, IndexedDB, a service or a hosted publication.

The first fixture attempt (`49459`, exit 1) timed out before the shelf.
Its import matcher used the `/tmp` spelling while esbuild canonicalized
the entry to `/private/tmp`. It is not defect evidence. The fixture now
uses the canonical path and asserts that all four intended ports were
replaced before opening a browser.

The unchanged source then reproduced six assertion failures among twelve
checks (`19916`, exit 1): refused donation and cancellation lost text,
and recorded publication lost an unrelated cancellation reason, in both
viewports. The repair passed all twelve checks (`98216`, exit 0). Page
identity and meaningful content, absence of an error overlay, empty
relevant warning/error logs and interaction results were checked.
Desktop and mobile screenshots were inspected, including the empty
original donation fields and retained repaired donation/reason values.

The extended rendered witness then reproduced stale handle display in
both viewports (`86493`, exit 1, fourteen passes and two assertion
failures). A scripted discovery returned `@confirmed`, but the renderer
stored and displayed `@advertised`. After the presentation correction,
all sixteen checks passed (`59518`, exit 0), including unavailable
membership without handle confirmation. The final handle screenshots
were inspected at both viewport sizes. These ports remain stand-ins;
the authentication data source is checked separately below.

The existing real Scope/SQLite Lending scenario was strengthened with a
conflicting advertised handle after a native join. Before the discovery
repair it failed (`85371`, exit 1): the identity said `@not-visitor` when
the device's actual authenticated member was `@visitor`. The repaired
scenario passed (`24924`, exit 0); after the final membership-version
guard it passed again (`16336`, exit 0). It also continues through the
visitor's native donation. Scope, membership, sessions, WebCrypto and
SQLite are real; the scenario's existing Git host and clock remain
labelled stand-ins. It proves no hosted provider behavior.

Browser typechecking and the existing model/custody focus passed
(`84451`, exit 0): nine tests in two files. The existing-lock offline
install (`44183`) exited zero without manifest or lock changes. The owned
asset generator ran; all three disk assets and the Worker module
reproduce exactly. Among the generated assets, only JavaScript and the
Worker module differ.

The new membership projection's first test compilation rejected two
attempts to mutate readonly fixture data. Immutable replacement fixtures
fix those errors. Browser types and all nine model/custody cases then
passed (`70081`, exit 0), including missing-key, contradictory handle and
ambiguous-key observations. Final browser and Scope test typechecks
also passed. The owned assets were regenerated after the final changes.

Original records are retained outside the checkout:

- `/tmp/artroom-lending-refused-drafts-original-browser.log`
- `/tmp/artroom-lending-refused-drafts-matched-original-browser.log`
- `/tmp/artroom-lending-refused-drafts-repaired-browser.log`
- `/tmp/artroom-lending-refused-drafts-matched-original/report.json`
- `/tmp/artroom-lending-refused-drafts-repaired/report.json`
- `/tmp/artroom-lending-refused-drafts-model-custody-focus.log`
- `/tmp/artroom-lending-refused-drafts-types.log`
- `/tmp/artroom-lending-p3-original-handle-browser.log`
- `/tmp/artroom-lending-p3-repaired-handle-browser.log`
- `/tmp/artroom-lending-p3-native-original-focus.log`
- `/tmp/artroom-lending-p3-membership-native-focus.log`
- `/tmp/artroom-lending-p3-membership-version-focus.log`
- `/tmp/artroom-lending-p3-membership-types.log`
- `/tmp/artroom-lending-p3-membership-fixtures-types.log`
- `/tmp/artroom-lending-p3-membership-fixtures-model-focus.log`

These references grant no external-file or execution access. A later
Source review will receive its own finite, exact evidence grant. All four
P3 outcomes still owe exact reviewed landing. All six hosted outputs remain
untouched; no provider operation, deployment or publication ran.

## Frozen integration gate

Original gate `24299` completed at clean commit
`5375fb16bafa658be91b7dba316ae519a6b2a8c6`, tree
`10c77db40030c9b7533b5722c5f3fbdd2a4c7bbf`, and exited zero. Its exact
composition contains archive `c811785ea`, Lending `1d2a6cfde` and invitation
`8c98c1f73`: all thirteen, eleven and six respective path leaves retain
their original mode and blob. There are thirty changed paths against
Main `55e1970a5`, with no additional source changes.

The gate passed whitespace and type checks, 1,562 Vitest tests with three
skips, sixteen Node tests and fifty-five Counting tests. The existing-lock
install took 2.2 seconds, types 7.4 seconds and tests 444.9 seconds.
The original owner terminal is `b7fe0f`, exit 0. Its wrapper log is
`/tmp/artroom-p3-integration-5375-gate.log`; step logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.DHl3BJJKqb`.

This is the one frozen integration gate for both P3 slices. This note and
the invitation note record its result without changing implementation
bytes. It does not replace archive's original gate `79043`, approve an
unreviewed dependency or permit P3 Source filing before archive's reviewed
landing. Exact correspondence with landed Main and independent Source
approval remain required. These paths grant no raw-log or execution access.
