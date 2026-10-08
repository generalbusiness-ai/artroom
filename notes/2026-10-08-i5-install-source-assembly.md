# Planned install assembled with current claim and clone recovery

Existing requests `da1` / `484`. Integration base:
`1d311bf900ff3989d857579fa979a59015cfe660`. Reviewed install feature source:
`20a3ca2956644c7e9e3a4a579db2bc0453c6c51d`.
Worktree `/tmp/artroom-install-integrated`, branch
`request/i5-install-integrated`. This is isolated source preparation for
Root review, not an activated or deployed release.

## What was assembled

Only the planned-install functions and their required imports and context
input were transplanted into current commands: `installing`, `registerIdOf`,
`installAttemptOf`, `planInstall` and `installPlanned`. Plain install gains
only the reviewed refusal to replace an attempted unresolved plan. Its
existing `NEWEST` selection and exact supported catalog check remain.
Planning also selects that current supported `NEWEST`; resuming checks the
saved pin with the existing `knownPlatform` helper, without a name-only
classifier or newest fallback.

The store gains `PlannedInstall` and the config's plan slot. It retains all
current `ClaimStep`, full pending claim, private pending join and private
storage APIs. The command line gains only install switches, usage and
install dispatch. No edit, page, issue, later navigation or other feature
was imported. No source operation/Worker changes from the older component
were imported.

Attempt evidence is saved before submission. A never-attempted expired
plan sends nothing; an attempted exact replay can recover the same
accepted founding after expiry, while the server still refuses an expired
unaccepted founding. The injected transport requires an explicit trust
input bound to the configured service and identical fetch function.
Native acknowledgment checks exact definition, original intent digest,
complete register fact shape and seq-0 position, and must match any retained
accepted fact. The original plan and complete receipt are saved before
installed config and retained afterwards as `service-acknowledged`.
That trust label is not independent genesis or executable proof.

The compact install witness was transplanted from the reviewed source.
Its scripted repository answer now uses `DIRECTORY_OF` at the retained
plan's exact pin, rather than the older native `DIRECTORY` constant. This
keeps its fixture consistent with the current catalog. The current claim
and runtime/clone handoff witness files are unchanged. The adjacent ledger
records full source-pair hashes and checks that the entire commands suffix
from `validStep` through EOF is byte-identical to current base, including
claim/join/clone recovery, birth checks, custody and exact catalog helpers.
Package manifests and lock remain byte-identical to base after `npm ci`.

## Focused checks

Pinned product dependencies were installed with `npm ci`. No tooling
package was installed into this checkout. Testing guidance was consulted.
The focused run occurred once after assembly was complete:

- `npm run typecheck --workspace @generalbusiness/artroom-cli`: exit 0;
  source, Node tests and scope test configs all checked.
- `./node_modules/.bin/vitest run --project cli packages/cli/test/install.test.ts --project scope packages/cli/test/install.scope.test.ts packages/cli/test/claim.scope.test.ts packages/scope/test/runtime-versions.test.ts`:
  exit 0; 4 files, 5 tests; wall duration 2.01 seconds and printed summed
  test time 664 milliseconds. These are local focused-run figures, not gate
  or live-provider performance.

The five tests cover malformed/substituted plans sending nothing; planned
pin before install followed by a timely claim; lost native acknowledgment
or final config save recovering the identical accepted founding beyond the
signature window, with unsent/unaccepted expiry controls; current saved
accepted-claim enrollment after all register signature windows and restart;
and current @2 session/read-token/private-custody plus scripted Git handoff.
The scope objects and route calls are real local workerd boundaries. Git
host replies, scheduling and the Git runner are labelled stand-ins. This
is test-source and local execution evidence, not a provider or deployment
proof. No new control run was needed for selective composition of the
already reviewed feature; no prior control is represented as a new run.

Exact retained raw logs:

- `/tmp/artroom-install-integrated-install.log`
- `/tmp/artroom-install-integrated-typecheck.log`
- `/tmp/artroom-install-integrated-focused.log`

Their byte lengths and SHA256 hashes are recorded in
`2026-10-08-i5-install-source-assembly-ledger.json`.

## Remaining boundary

Late recovered installed identity does not yet make a fresh claim usable.
The unchanged current fresh-claim path still requests the register summary
to select the pin and construct expected state. The pure expected-state
context proposal remains held on exact reviewed executable/ABI/bounds
closure and service/root correspondence; no constructor, synthetic item,
trusted verified flag or hardcoded expected revision was added here.
Fresh found permission, fields, deadline and capacity remain server
judgments. Historical executable admission and all activation obligations
remain pending. No gate, provider call, deployment or main-branch edit ran.
