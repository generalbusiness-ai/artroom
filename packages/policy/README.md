# @generalbusiness/artroom-policy

Artroom's policy runtime (lane C). It evaluates a room's
`.artroom/policy.json` over recorded inputs and returns the same outcome on
every host. It contains:

- the `artroom-jsonata-v1` evaluator, ported from atseq;
- the five rule kinds: `refuse`, `require`, `carry`, `land` and `notify`;
- the platform's carry conditions and admin boundary;
- policy activation and policy validation;
- data for `explain()`;
- the authoring helpers `policy()`, `owners()`, `requireCheck()`,
  `requireReview()`, `carry()`, `lanes()` and `rule()`.

**Dependency.** This package uses the types of the lane 0 contract
(`packages/contract`) at commit `7771921f`. That contract is still under
checker review. If its types change, this package must follow.

## Run the tests

From the repository root, after `npm install`:

```sh
npm run typecheck
cd packages/policy
npm run test:node      # vitest in Node
npm run test:workerd   # the same files inside workerd (@cloudflare/vitest-pool-workers)
```

Both runs use the same test files. A test in each run checks that it is
running on the host it names.

## Pinned versions

- `jsonata` is pinned to exactly `2.2.2`, the version atseq uses.
- The profile is `artroom-jsonata-v1`.
- Every `Decision` records both in `stamp` (R-EVAL-4).
- Before its first evaluation, the evaluator checks the installed `jsonata`
  version and an engine fingerprint. The fingerprint is a SHA-256 hash of the
  results, step counts and inspected bytes of 13 probe programs. A mismatch
  is a runtime failure (`dependency_mismatch`), so a changed engine can never
  record a decision.

## What is platform code and what is policy

Platform code is plain TypeScript. Policy cannot change it (R-POL-10).

| Platform code (TypeScript) | Policy (data and JSONata) |
|---|---|
| Carry conditions: reviewed scope, `dependsOn`, global inputs (R-CARRY-1 to 3) | `carry.dependsOn` defaults per area, extra `carry.globalInputs` |
| Whole-tree default for checks, filtered snapshots, config and runner digests, volatile checkers (R-CARRY-6 to 10) | `carry({ verdicts, checks })` switches |
| Revoked keys: compromised evidence never carries (R-CARRY-12) | `retiredEvidence: "reopens"` |
| `carry` rules run only after the platform conditions pass, and can only stop carrying (R-CARRY-4) | `carry` rules' `allow` expressions |
| `obl_admin-approval` for `.artroom/**`, sole-admin self-approval, the recovery boundary (R-ADMIN-1 to 3) | nothing |
| Obligations from actual changed paths; `allowSelf` only for `docs/**` and `**/*.md` (R-PROP-5, R-OBL-2) | `require` rules' `paths`, `when` and obligation |
| Glob syntax, matching and conservative overlap (R-PATH) | the globs themselves |
| Budgets and the expression profile (R-EVAL) | `refuse`, `land` and `notify` expressions |

## Two kinds of failure (R-EVAL-5)

- **A deterministic refusal** is a recorded outcome. Replay gives the same
  result.
  - `policy-budget-exceeded`: a budget ran out.
  - `policy-type-error`: the program or its result is outside the profile,
    for example a rule that returns a number where it must return true or
    false.
  - For `refuse`, `require` and `land` the act is refused. For `carry` the
    evidence does not carry. For `notify` that rule notifies nobody.
- **A runtime failure** is thrown as `PolicyRuntimeFailure`. It has the
  `ArtroomError` shape, with code `policy-runtime` and `retryable: true`.
  Nothing is recorded. Causes: an engine fault, a stack overflow, a changed
  engine, or a rule input from the room that is not plain JSON.

## Budgets

atseq's per-evaluation budgets are unchanged: program 64 KiB; input and
output 256 KiB; JSON depth 32; AST 4,096 containers and 64 levels;
evaluation nesting 64; 100,000 evaluator visits; sequences of 16,384; one
intermediate result 1 MiB; 16 MiB inspected in total. The contract's
`PolicyProfile` type fixes each value.

Three additions come from the room-core spike's measurements on Cloudflare
(2026-10-01):

- **A per-act budget** (`ACT_BUDGET`): 25,000 steps and 4 MiB inspected,
  shared by every rule evaluated for one act. Pass one `actMeter()` to every
  evaluate call for that act. The per-evaluation budgets still apply.
- **Measured inputs.** Each rule input is copied, frozen and measured once.
  A rule that reads it again is charged the recorded size without a second
  walk. The charge is exactly what a walk would charge; the corpus's exact
  boundaries and the engine fingerprint prove it.
- **No time limits.** JSONata's `timeout` option is not used: on Workers the
  clock does not advance during CPU work, so it never fires. Only the step
  and byte counts guard evaluation.

The evaluator compiles every program afresh for each evaluation. It shares no
compiled expression, so concurrent evaluations cannot see each other's hooks.
A test interleaves evaluations of one rule to check this.

## The conformance corpus

`test/profile-corpus.test.ts` ports atseq's evaluator cases with their
expected values unchanged, including every exact budget boundary. It does not
port atseq's fold, Lexicon schema and Inlay view cases, which have no Artroom
counterpart, or its Node-only dependency check, which
`test/integrity.test.ts` replaces with WebCrypto checks.

Artroom's cases:

- `test/carry.test.ts`: the seven acceptance cases of plan section 7, the
  scoped-checker case from checker review 45431cd9 (P2.1), and one named case
  for each carry condition;
- `test/admin.test.ts`: sole-admin bootstrap, the admin boundary, and policy
  activation;
- `test/rules.test.ts`: the five rule kinds, determinism, replay, the
  spike's pathological rule, the per-act budget and interleaving;
- `test/helpers.test.ts`: the plan's section 5 policy example, the default
  policy, validation and globs.

## The authoring helpers

`src/helpers.ts` implements the functions that the contract's `/policy`
subpath declares. Each is typed as `typeof` the contract's declaration, so a
signature change fails the typecheck. When lane 0 lands, the contract's
`/policy` subpath can replace its `export declare function` lines with:

```ts
export { policy, owners, requireCheck, requireReview, carry, lanes, rule } from "@generalbusiness/artroom-policy/helpers";
```

The helper imports only types from the contract, so this adds no runtime
cycle.

## Contract gaps

These are added in this package or decided here. Each needs a decision in
the contract.

1. **Check inputs for tests.** R-CARRY-3 and R-CARRY-8 list no tests or test
   configuration. Checker review 45431cd9 (P2.1) requires them for check
   carrying. `PLATFORM_CHECK_INPUTS` adds `**/tests/**`, `**/test/**`,
   `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*`, and test and build
   configuration. Verdict carrying keeps the protocol's list.
2. **Per-act budget.** `PolicyProfile` has no per-act budget. `ACT_BUDGET`
   and the codes `act_step_budget` and `act_inspection_budget` are added
   here.
3. **Default `dependsOn`.** The comment on `CarrySettings.dependsOn` says a
   changed path that matches a key adds that key's values. R-CARRY-2 says the
   defaults apply to "the areas of the reviewed scope". This package follows
   R-CARRY-2: a key applies when it may overlap a reviewed scope pattern.
4. **Retired evidence.** `NotCarried.code` has no code for a retired key under
   `retiredEvidence: "reopens"`. This package uses `policy-rejected`.
5. **Sole-admin reopening.** `Reopened` has no reason for a flagged
   self-approval that stops counting at reservation. `judgeAdminApproval`
   returns `reopens: true` with a text.
6. **Notify targets.** `Decision.outcome.to` holds only members and teams,
   and the notify `RuleInput` has no reviewers. The room passes a
   `NotifyDirectory` (members by role, and reviewers) to expand `role:`
   principals, `owners` and `reviewers`.
7. **Land reviews.** The land `RuleInput` does not say that `reviews` holds
   each qualifying reviewer's latest verdict. The default `objection-open`
   rule assumes it does.
8. **Check carry facts.** The carry `RuleInput` has no check binding. The
   room passes `CarryFacts` (earlier binding, new tree or snapshot, config and
   runner digests, `volatile`).
9. **Require errors at activation.** An open proposal cannot be refused
   after it is recorded. `activate()` returns a `refusal` for that proposal,
   which should block its landing until a new generation or policy.
10. **No `$glob`.** The profile's allowlist has no path-matching function,
    so expressions cannot match globs; `require` rules' `paths` cover the
    common case. If one is added, it must charge steps for its work.

## Not done

- The spike's suggestion to refuse a policy that exceeds a budget on a
  sample input when it is proposed. The carry result's `highlight` flag
  covers only the dry-run case of plan section 7.
- Overlap's `certain` flag (R-PATH-3). `globsOverlap` answers only "may
  overlap".
- Mutation spot-checks were run under Node only.
