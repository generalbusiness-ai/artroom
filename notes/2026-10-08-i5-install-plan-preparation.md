# Pin-before-install: isolated repair preparation

This is preparation under request `da1a2f020c30efb19e860782f91ccf2c64b51f52`,
following root promise `36b4`. Base:
`9bae1b44e03a2e4d658542c957d2ca44c9e2b5be`, whose own delivery base is
`13ae305505d910b23d44e524860dc788cbcc5a8f`.

This predecessor checkout is not integrated with main's Gate 1 repairs at
`cf4e41e295f1fb8e0e4eb32babc5fd9a0d956656`. Its older claim and join code
is unchanged. This preparation is not review-ready, and completes no
request or design adoption. No deployment or provider was called.

## Repairs

The operations driver reconsiders a bounded batch of refused hints in
rotation. A permanently refused prefix no longer hides a later accepted
kind. It allocates no copy of the whole map. Each hint is checked against
its durable parked, unsent row and its current attempt's outcomes; stale
hints are removed. An accepted live hint remains until the actual pass
checks its row. The sent-mark branch and durable mark before the original
request are unchanged: a sent attempt with an unknown answer is never
resent when acceptance changes.

The command validates the saved install with the shared signed-intent
shape and signature checks. It requires an install addressed to no scope
or item, no expected revisions, the current operator key and config
service, a supported pinned register version, its exact computed ID, and
the existing native lifetime bound. Malformed or substituted plans are
named `plan-mismatch` before network. Supported older versions are not
silently replaced with the newest version. After acceptance the client
follows the receipt, verifies its full fact/hash, and checks the exact
applied genesis, pinned version and saved founding before saving config.

The new witnesses check saved-plan substitution without network or config
changes, and fair reconsideration beyond a small batch followed by an
unknown answer that remains sent exactly once. The outside system and
operation-opening input in the scope witness remain labelled stand-ins.

## Validation

Dependency files were borrowed through links to the existing installation;
workspace links point into this isolated checkout. No package was
installed and no package manifest or lock file was changed.

After the final source changes:

- `node_modules/.bin/vitest run --project cli install.test --project scope
  operations.test install.scope`: 3 files, 13 tests passed; duration 1.72 s.
- `tsc -p packages/cli/tsconfig.json`,
  `tsc -p packages/cli/tsconfig.test.json`, and
  `tsc -p packages/scope/tsconfig.test.json`: each exited 0.
- `git diff --check`: passed.

Two targeted controls used `scripts/control.mjs`, each with one test:

- Remove hint rotation, targeting `reads fairly reconsider` in the scope
  operations file: **distinguishes**, expected `['1:2#1']`, received `[]`.
- Disable saved-envelope signature verification, targeting the CLI saved
  plan witness: **distinguishes**, expected no request, received one.

An earlier control invocation from the root was **inconclusive**: the
helper selected Node's test runner for that package and `--project` was
not a Node option. No test started and no source was changed by it. The
controls above ran from their respective package directories and restored
the source. This is no mutation sweep. No whole gate was run; integration,
the required gate and independent review remain owed.

## Outstanding decisions and integration

The expiry paragraphs below record the `80f7d0568` checkpoint. The planner
subsequently answered that question in `79e1bac1`; the source follow-through
and its remaining read limit are recorded in
[the recovery preparation](2026-10-07-i5-install-recovery-preparation.md).

An accepted install whose reply or config save was lost can be recovered
by the native exact founding repeat even after its deadline: genesis
checks a verified identical existing founding before checking expiry.
The command's local `plan-expired` precheck currently blocks that recovery.
Removing it would contradict the source's promised expired-plan
no-network behavior for a first expired submission. A durable attempted
marker alone cannot prove acceptance. The planner has been asked to decide
the exact attempted replay or authoritative lookup boundary. This repair
preserves the precheck pending that disposition. It never re-signs or
re-plans an uncertain install implicitly.

Integration must preserve main's exact pending claim envelopes, private
join storage, strict asynchronous read checks and verified birth rules.
Dynamic settings do not settle or resend sent/ambiguous attempts. The
source's live-setting scenario uses an environment changed inside one
object life; it does not prove that deployment settings change in an
existing production object without restarting. In-flight configuration
removal at the final send boundary remains an independent review question:
the inherited final guard checks current state/custody, while each new
outside-port call selects its current configured wiring.
