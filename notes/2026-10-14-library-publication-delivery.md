# Library publication: Source delivery candidate

14 October 2026. This implements the approved
[Publication from a fold, Draft 5](2026-10-13-fold-publication.md) under
full request `ebda829b`, promise `23fed5e2`. It is a Source candidate.
The final combined gate passed once, as recorded below. Source review and
landing, and real hosted library acceptance remain owed.

The explicit CLI selection `--cohort application-publication` pins
register 9, directory 8, membership 4, rules 3, destination 4 and inbox 1.
Existing rooms, the application 5 cohort, Counting 6, WebDemo 8, default
selection and all existing lane pins retain their versions. Directory 8
reserves `destination` against caller values and injects its recorded full
reference only when the application's genesis declares that exact scope
field and destination kind. The old factory policy remains unchanged.

An accepted application act tells `publish-file` with one path and at most
65,536 bytes of UTF-8 text. Destination 4 proves the sender's actual
creation by its own directory's application factory. Missing origin proof
leaves the tell pending. Admission, queued work, the last check before a
send, recovery, late settlement and Replay use that proof. A declared
application named `change` does not acquire the platform change role.

File and change publications share one destination slot. The new slot and
judging values hold optional integer item IDs; absence means empty and ID
zero remains valid. File publications retain the full sender reference,
source sequence, hash and send ordinal, path and text digest. An exact
repeated tell is admitted once. Source order is compared for that sender
and path across live and retained final rows. An older unsent publication
is superseded with its own causal receipt. A sent attempt with an unknown
answer retains the slot and is not resent by recovery.

**Authority remains as approved:** any application of the room can write
any path, including a file in an extent that asks for review of a person's
change. Room review rules do not govern `publish-file`. Activation and
`application.establish` control which definitions and scopes the room
trusts. The record binds the text to its signer and entry; the scope does
not check whether that text describes the item's state truthfully.

Lending keeps its fixed destination and a fixed `shelf/<16 characters>.md`
path chosen before donation is signed. Its path rule and uniqueness guard
include gone things. Donate, borrow, return and cancel send bounded page
text. The sixth act, `publish`, uses the live library as primary and reads
any thing, including a gone one, without changing it. Browser custody keeps
the exact signed path and content before sending. Page text names the
known Scope and incarnation, without inventing a future entry or item
number. The interface separately compares observed rendered page text at
an identified published commit and links that immutable page. It does not
infer push completion from an accepted lending act.

The contribution checks below are attributed reports of their original
runs. They are not a combined gate or borrowed whole-candidate verification.

| Contribution | Reported evidence and limits |
|---|---|
| A: destination schema, lifecycle and objects | Pure schema, ID-zero, retained-order and SHA-1/SHA-256 object witnesses passed. The content body accepted 65,536 bytes and refused 65,537 within an overall failed run at `cd69b3fb`. The corrected receipt body separately passed at `e013c358`, distinguishing 64 from 65 owed receipts across both kinds; its content body was skipped. No whole bounds-file pass is claimed before the final gate. Causes, origin, authority and host answers in these cheap tests are scripted. Latest reported head: `e013c358`. |
| B: origin, operations, Replay and Site | Native case `93599` passed: missing proof, exact repeat, admitted stale work before send, an actual lost answer and restart with no resend, late settlement, delayed old delivery, two send ordinals, nested non-directory creation and foreign-room refusal. Actual receipt refs were read through the Git Reader. Immutable Site and proven Replay passed. Git maps, clock, inspector and scheduler are stand-ins. Both origin controls distinguished their faults. The later available-clock expiry metadata check `35978` and its control passed. |
| C: factory and explicit CLI protocols | Reported unit factory/CLI, invitation and catalog checks passed. The old application case passed within run `80303`, whose other new fixture case failed; that overall run remains failed. The repaired new-cohort case `46312` passed. Exact destination 4 CLI support compiled; cleanup diagnostics had six Node passes, and retained editor compatibility had four. The later golden update is not presented as a rerun. These are reported checks, with no provider or browser claim. |
| D: Lending and shared-slot integration | Two compiler configurations passed. Sixteen pure/model/custody cases passed, with the new renderer-text witness separately passing. Both path controls distinguished their faults. Native Lending `61375` passed every original story, role, capacity, recovery and proven Replay assertion, plus causal outbox results and gone-page repair. Mixed case `46681` passed with the real CLI change and Lending scopes, one held OwnGit answer, both receipts, commit ancestry and both immutable Site pages. |

D's compact public summaries are in the local diagnostics packet
`/Users/hughpyle/play/artroom-diagnostics/pub-lending-assets-one/`:
`pure-and-compiler.public.json`, `native-61375.public.json`,
`mixed-46681.public.json` and `local-qa.public.json`.
They were written retrospectively from terminal tool results; raw runner
stdout was not redirected. They do not claim independently sealed input
closures. Committed Source representations are `c78a9ca1`, `f564de20` and
`a593b992` respectively.

The Lending asset producer ran once. Its 1,569 other tracked leaves stayed
identical; only generated JavaScript and the Worker module changed.
Local Playwright 1.63 with Chromium 1243 rendered the generated Join page
at desktop and mobile sizes and checked the page-reading helper against
scripted Site HTML. Two resource 404 console errors remain recorded, one
uncorrelated. This is not a zero-console pass, a real browser join or act,
or a hosted shelf witness.

Original failed runs remain failed. They include fixture trust, recorded
result interleaving and head races, provider-gate capture timing, integer
slot storage, directory row kind and digest-domain mistakes. They also
exposed two actual compatibility gaps: the CLI initially refused
destination 4, and Site initially required `judge` for a file reservation
whose kind is `file-judge`. Their Source repairs and subsequent checks do
not erase those failures. The held mixed-case provider response was not
lost: its outside map update had already happened while the Native answer
remained pending.

**Final gate: passed once.** The original `npm run gate` at
`60c158b94bb637d219701c780ae76107f36cfd42`, tree
`65ed867d7209f9c371055bb0fe20565addb7a673`, exited 0 in 192.265 seconds.
Whitespace, the full typecheck and the test phase each exited 0. Vitest
reported 1,195 passed and three skipped cases; the two Node/browser groups
reported 10 and 55 passes, with no failures. Installation was skipped.
The post-command Source, tool and dependency guard passed. The original
result is retained at the local diagnostics path
`publication-compose-60c158-final-gate-released-one/gate-one/result.public.json`,
SHA-256 `761dd3ffa196538ec72074cad6a76a5073a1ec71aa204de0869692de259ef6fa`.
This note-only successor records that outcome. Production and test bytes
remain those of the gated head. No gate or producer was repeated.
Source approval and landing remain owed. Full `23fed5e2` stays open for the real new-cohort Artifacts library,
deployed member interface, shelf pages after their acts, public history
witness and homepage Published shelf link. The Native tests and local
browser fixture do not satisfy those hosted obligations.
