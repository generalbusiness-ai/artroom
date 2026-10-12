# Stale refusal rehearsal delivery

Bounded child `c151104fdedd8d2e3a3777908825fc4a95199080`, promised by
`c40356ac6fcc3d0f821f5b41ec2e4dd771b4fb9d`, delivers the freeze route below.
Parent request `3f08557547c4df666e44f150fe8d0209d43c8af9` and its original
promise remain open. Runner timing also supports practice-script request
`b861b235`. Source composition: `8aa545de532e4454578b96e38e3b5f2baa6ca9cb`,
including landed Page branding from main `3d400d49`.

The rehearsal admits two changes on the same published base before the
winner publishes. The second merge then returns `out-of-date`. The same
proposer opens a distinct change on the fresh head and publishes it. The
refused change remains recorded. This route uses the existing CLI and
native policy. It adds no same-lane replacement rule.

The default sequence has 27 shots and verifies 14 scopes. The optional
manifest sequence has 32 shots and verifies 16 scopes. Capture references
include both the stale change and its fresh replacement.

`Taken.staleRefusal` records elapsed milliseconds only around the stale
`command(ctx, ["merge", stale])` invocation through its expected refusal.
Production uses `performance.now()`. The result and transcript label the
clock method, date, service, and Git host. Elapsed time includes CLI work
and round-trip waiting. It excludes the fresh proposal and publication.
The measurement is local to the runner, not server-only latency or a native
history fact. The hosted evidence below supplies the observed refusal
time and the two publications in this concurrency route.

## Existing evidence

The chronology correction passed all four native witnesses across the two
host stand-ins. One recorder remained skipped. The owning scripts compiler
passed. The timing change also passed these four witnesses and its owning
compiler. Its default witnesses use an explicitly labelled injected clock to check
read count, recording, and labels. Their constant clock steps alone do not
prove that fresh work stays outside the interval.

These runs use real native scopes, with Git hosting, local Git, and the
scheduler as labelled stand-ins. Both used the exact Page asset composition
and restored the original bytes afterward. They do not prove a hosted run.
The original gate at `932b1a01` skipped installation and passed whitespace,
then failed typecheck on five index-signature accesses in the native witness.
Its test phase did not run. That original failed result remains unchanged:
`stale-composed-gate-one/public-result.json`, SHA256
`534676eef808e46d7330537161f47d64874e38cfc42f82977fb339cc9d9219b9`.

Commit `dbf88cfb` changed only those five accesses to bracket notation.
One full compiler run then passed. The previously unrun test phase passed:
1,028 Vitest cases, with two skips, followed by eight repository Node checks
and 39 browser Node checks. No focused cases or gate were repeated.
Completion evidence: `stale-composed-gate-completion-one/public-result.json`,
SHA256 `b7fa1b91059171dd614088746e135ccaef0d9c7c653ce32f8b18c9087b9c6687`.
This completes the failed and unrun phases. It does not make the original
gate green. Checker decision `c99590a2` accepts that phase completion but
requests stronger runner evidence. That decision is not final approval.

The earlier control changed only the stale proposal's base to the fresh
head and failed by assertion. That proof predates the chronology correction
and is retained as historical evidence, not a control of the composed head.
Original failures and corrected runs remain separate. No check was repeated
for this note.

## Successor runner evidence

Commit `35753cd0` exports the two existing composite helpers and `Found`.
Their production judgments, read handling, and mutation order are unchanged.
Two Node witnesses use explicitly scripted CLI commands, read sessions,
entries, and summaries. One checks that malformed or unknown preparation
answers stop before the next mutation. The other checks refusal and
replacement answers, with separate clock advances for stale and fresh work.
The native chronology witness remains unchanged.

The first successor compiler run passed the scripts closure, then failed
on the scripted fixture's `kind: string` type. Its Node body did not run.
Proof SHA256: `add830116171fa6db4586a2d5c26e43821473a0b35dadda7c08f140fec5f5465`.
Commit `0e76e2bee` corrects only that fixture type to `ScopeRef["kind"]`.
The failed compiler then passed, followed by the two previously unrun Node
witnesses. The unchanged scripts compiler was not repeated. Completion proof
SHA256: `1d43ae87f09af060dad01dc9d417d272839dfafdcaee2dff8714b9f33abe3b18`.

Two compiled controls at `0e76e2bee` distinguish the intended faults. All
four mutant compiler stages passed. Bypassing the preparation result and
stale-refusal gates failed the named no-next-mutation assertions at lines
84 and 114. Moving the timer endpoint past fresh edit work failed the
named timing assertion at line 119: 1,250 ms instead of 250 ms. Both bodies
failed by assertion, and the isolated source was restored exactly.
Control proof SHA256: `2834ee0aefb4c663338327649541153de4b1033c12a811b09aaa781493bc2dd2`.

These are two coherent runner controls, not a proof for every individual
predicate. Scripted answers establish runner stopping and timing behavior.
They establish no native authority, provider behavior, or hosted latency.
Original failures and their completion remain separate. No old control,
whole suite, or gate was repeated for the successor or this note.

## Remaining guard and outer-stop evidence

Commit `3d7162aae` extends the same two scripted Node journeys. Returned
opening provenance, proposal and rules readiness, command results, manifest
source, and fresh edit results now have bounded failure ledgers. Trusted
preflight cases cover initial base and scope, saved room and key, and
session refusal. Those cases establish local stopping behavior, not remote
evidence or membership authority.

One new artifacts-only native case runs two fresh rooms. It injects a valid
unavailable `open-pr` answer before admission, first during stale preparation
and then during fresh reproposal. The actual runner, CLI, planned install,
and read codecs run. Both failed composites leave every later shot unrun,
with no later mutation submission or runnable callback. Git hosting and
scheduling remain stand-ins. Earlier acts remain recorded, without rollback.
The four existing native happy-path stories were not repeated.

Both owning compiler closures passed. The two Node cases and new native
case passed at `3d7162aae`. Baseline proof SHA256:
`acf2907b4d1c37a93498cecf730dd58b448717abb583bf417214b395adc51561`.
Production code is unchanged from the previously reviewed successor.

Four additional guard groups distinguish intended faults. Opening
provenance passed both mutant compilers and failed the intended mutation
prefix assertion at line 102. The next readiness recipe failed compilation:
`TS6133` reported an unused predicate, and unconditional return made the
remaining pause and config code unreachable for narrowing. That original
failure remains preserved, without credit for the unrun readiness body:
`37a72342341311001cea149271aa8005c223d66518fbcd2f766adc46431129ef`.

The corrected recipe preserves conditional flow while bypassing the
readiness decision. Its continuation runs only that corrected group and
the two previously unrun command-result and outer-stop groups. All six
mutant compiler stages passed. Readiness and command-result bodies failed
the intended prefix assertions at line 102. The outer-stop body failed the
later-shots-unrun assertion at line 83. Isolated source was restored exactly.
Completion proof SHA256:
`d7668a9025144e5bee03adbfca780c780b5f778c2d48842c13ea8e0bd4cd60ff`.
The earlier two successful controls retain credit and were not repeated.

These grouped controls do not prove independent necessity for every
predicate or output field. The Node ledgers establish runner decisions
from scripted answers. The native outer case establishes the outer stop
through its stated fixture boundaries. No proof establishes hosted results
or latency. No test, control, gate, or provider action ran for this note.

Local evidence remains outside the repository:

- `artroom-diagnostics/stale-base-source/public-result.json`
- `artroom-diagnostics/stale-base-chronology/public-result.json`
- `artroom-diagnostics/stale-refusal-timing/public-result.json`

## Remaining work

Final checker evidence review and child landing remain owed. The hosted
run and separately labelled completion are recorded below.
The full same-lane manifest successor remains separate work under Plan 029.
This bounded child does not satisfy or close the parent request and promise.

## Observed isolated hosted run

The reviewed runner at `c8cb6c538` ran `github27-freeze-two` against
`https://artroom-rehearsal.inguz.workers.dev`, with public repositories
in `generalbusiness-ai` on GitHub. Protected runtime and binding metadata
remained unchanged apart from the three intended GitHub credential names
and provider versions. The served scope source tree is
`ddde538aa08478594cb99f4d45d86aea8e4e401c`, equal to the deployed branded
runtime. Final provider version: `a06502bd-4162-43e3-87d5-7b30d9a42217`.

All 27 shots completed. Twenty-five matched their expected lines; shot 23
reported all fourteen scopes consistent. Shots 24 and 26 returned HTTP
502, so the original runner exited 1. Exactly one later anonymous GET of
each failed page returned HTTP 200 and the expected type and title;
`AGENTS.md` also contained its expected text. The original failed rows
remain preserved. No native act or rehearsal was repeated.

Shot 20 matched its complete stale-refusal and fresh-publication sequence.
Observed run, runner timer: **2,586.628125 ms**, using `performance.now()`
at `2026-10-12T01:40:23.340Z`. This includes CLI work and network waiting
but excludes the new proposal and publication.

Bounded signed native reads then verified the sealed capture bindings,
three lane histories and destination history. Both original proposals
name base `7d84a42eba48386e0d49d8af5ab1482e0dc39d2b`. The winner published
`6ca64836a33f47160348722cc7c39a08f7998fc4`. The stale lane retained its
`out-of-date` refusal. The same actual signing actor proposed the fresh,
distinct lane on the winner's commit and published
`4c18564813c5012b33ab7018dec0726666b6b9b6`. Native timestamps corroborate
the observed CLI order, without claiming a global cross-scope clock.

Closed public evidence, outside the repository:

- Original runner terminal: `97151b91b0467e1355a0743c7004fc1a7c21bd3d0b90bcc9d083aa2c9884c266`.
- All 27 rows, verifier and timer: `8b11a0758b9fef963621b527500855581ddfa4d7053006b038639038ca14b1cc`.
- Later two public page reads: `5384744394dcb0d29f269cc84edd37b49a2124fbda3b11d064a2e7d70fda6f02`.
- Native proposer, base, refusal and publication facts: `8bf934d63c0278a167ff1fb7f3a69d687d310e33eda8f0b29ac4d9c0f09f332a`.
- Protected served-runtime metadata: `0eda823fc47276370b1f8b9c8f894337f73ec26f0d05f42b5270b32980372513`.

The first local launch exited 13 at its initial input pause because a
Python heredoc gave the child EOF. Its original local plan and key remain
preserved; production correspondence checks found no attempted or
acknowledged founding. The corrected run used a fresh directory and plan
with the same live terminal throughout. No original plan was retried.

This successor changes only this note and `docs/demo.md`. Runtime and
test source remain byte-identical to the reviewed and observed runner.
No gate or test was repeated for these documentation changes. The failed
original gate and its accepted bounded completion remain as stated above.
