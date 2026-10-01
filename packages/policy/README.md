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

**Dependency.** This package compiles against the contract on the same
branch (`packages/contract`). The policy amendment for approval 81c31bc7
moved the shapes this package needs into the contract: `PathOwners`,
`ReplayContext` and its parts, `CheckCarryFacts`, the per-act budget in
`PolicyProfile` and `ProfileStamp`, and `PolicyLane.purpose`. This package
defines no shadow copies of them. Protocol section 26 lists the changes.

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
| `obl_admin-approval` for `.artroom/**`, sole-admin self-approval, roster acts by admins, configuration-recovery lanes (R-ADMIN-1 to 9) | nothing |
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
  `ArtroomError` shape, with code `policy-runtime`, `retryable: true` and
  `maybeRecorded: false`. The caller records nothing: no act, refusal or
  decision. Causes: an engine fault (any exception from the engine that is
  not a budget or profile check), a stack overflow, a changed engine, or a
  rule input from the room that is not plain JSON. Worker CPU and memory
  limits are runtime failures too; they end the isolate, so nothing is
  written.
- `notify` runs after the act is sealed (R-LOG-13), with its own fresh act
  budget, never the act's meter. The room builds the context once with
  `notifyContext(input, directory)` and stores it with the queue entry. If
  evaluation throws, the act stays recorded and the room retries with
  `replay(policy, context)` before it seals the `notified` entry.
- A rule that fails is never treated as "did not apply". A failed `require`
  rule refuses the propose and returns no obligations.

## Replay contexts

Every evaluate call first copies and freezes, synchronously, one
`ReplayContext` (a contract type, R-EVAL-8). It holds the rule input and every side
input that decides the outcome:

- the act budget: accounting version (`artroom-act-budget-v1`), limits, and
  the usage already spent by earlier calls for the same act;
- the lane purpose, and for `refuse` whether the recovery key signed;
- for `carry`, the platform facts (key revocation, check binding);
- for `notify`, the directory that expands roles and reviewers.

`Decision.input` is the SHA-256 digest of the canonical context. The digest,
the evaluated input and the retained `RuleEvaluation.context` are the same
owned value, so a caller who changes its objects later, or while the call is
pending, changes nothing. `replay(policy, context)` reconstructs the call and
returns the same decisions (R-EVAL-6). `explain()` returns each context by
its digest.

## Land stages and the reservation guard

The `land` act is evaluated with `stage: "land"`. Preparation evaluates the
prospective reservation input, with `stage: "reservation"`, before the
operation becomes ready; when it passes, `LandResult.retained` holds its
canonical bytes and digest (`RetainedLandInput`). Inside the no-await
reservation transaction, `matchesRetainedLandInput(retained, rebuilt)`
compares the rebuilt input's canonical bytes synchronously; it never hashes
or evaluates (R-POL-6, R-LAND-4, R-LAND-7).

## Path-safe rule inputs

Ownership in rule inputs is a list of `{ path, owners }` pairs
(the contract's `PathOwners`), not a map keyed by path. Paths are
string values, never object keys, so legal paths such as `constructor`,
`prototype`, `_jsonata_cache` and `__proto__` work without widening the
profile. A rule reads them as `proposal.owners[path = "x"].owners`.

## Admin approval evidence

`judgeAdminApproval` judges whether a review qualified by its recorded
admission authority, and whether it is still valid by the current state of
its signer and grantor keys (R-REV-1 to 3). A later demotion, removal, or
retirement under the default policy does not reopen it; a later promotion
cannot upgrade a member's review. Only a flagged sole-admin self-approval
depends on the current number of admins. The land initiator's or recovery
holder's current admin authority is a separate check, `judgeInitiator`.

## Configuration-recovery lanes

An act on a configuration-recovery lane has `lane.purpose:
"config-recovery"` in its rule input; for `evaluateCarry`, whose input has
no lane, pass `{ purpose: "config-recovery" }`. Policy rules are then not evaluated (R-ADMIN-5);
platform rules are. `evaluateRequire` returns only `obl_admin-approval`, and
refuses with `recovery-scope` a proposal that changes anything outside
`.artroom/**` (R-ADMIN-6). On an ordinary lane, policy applies as usual,
including to `.artroom/**` (R-ADMIN-3). The room enforces admin-only
signing on the lane.

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
  evaluate call for that act, in order. The per-evaluation budgets still
  apply. The spike estimated 3 to 9 microseconds of deployed CPU per step on
  the rules it sampled, so 25,000 steps is an estimated 75 to 225 ms for
  such rules. That is an estimate, not a bound for every program or host.
  The accounting is versioned and recorded in each replay context.
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
expected values unchanged, including every exact budget boundary. Two
Artroom cases tighten boundaries that atseq tests in steps of two: AST depth
at an odd level, and inspected bytes to the byte. It does not
port atseq's fold, Lexicon schema and Inlay view cases, which have no Artroom
counterpart, or its Node-only dependency check, which
`test/integrity.test.ts` replaces with WebCrypto checks.

Artroom's cases:

- `test/carry.test.ts`: the seven acceptance cases of plan section 7, the
  "scoped checker, new test" case of protocol section 23, and one named case
  for each carry condition;
- `test/admin.test.ts`: sole-admin bootstrap, the policy lockout case, the
  configuration-recovery lane, and policy activation;
- `test/rules.test.ts`: the five rule kinds, determinism, replay, the
  spike's pathological rule, a `require` rule over budget, the per-act
  budget and interleaving;
- `test/faults.test.ts`: an injected engine fault in each rule kind gives a
  retryable error that records nothing;
- `test/review-dd2a995b.test.ts`: checker review dd2a995b's reproductions,
  asserting the repaired behaviour;
- `test/review-09c01bf9.test.ts`: land stages and the reservation byte
  guard;
- `test/helpers.test.ts`: the plan's section 5 policy example, the default
  policy, validation and globs.

## Mutation spot-checks

Each budget, each carry condition and each failure rule was broken once, and
the Node suite run against the change. All 35 mutations made at least one
named test fail. Examples:

| Mutation | A test that failed |
|---|---|
| AST depth limit + 1 | AST depth exact boundary at an odd level |
| AST size, visits, nesting, sequence, program, input and output limits raised; one intermediate result limit × 4 | the matching atseq exact-boundary case |
| Inspected-byte limit + 1 | inspected bytes exact boundary to the byte |
| Per-act step or byte budget raised | the act budget is shared across rules; the cubic rule |
| Shared compiled expression | evaluations of one program interleave |
| Each carry condition (R-CARRY-1, 2, 3, 4, 6, 8, 9, 10, 12) removed | the named plan 7 or R-CARRY case |
| `require` catches a rule error and continues | a require rule over its budget refuses the act |
| A carry rule error carries | a carry rule that errors stops carrying |
| A broad catch turns engine faults into outcomes | an engine fault throws a retryable error |
| Recovery lanes evaluate policy, or allow paths outside `.artroom/**` | policy lockout; recovery-scope |

## The default policy pack

`src/pack.ts` (exported as `@generalbusiness/artroom-policy/pack`) holds
eleven named rules built with the helpers, and `starterPolicy()`. The demo
repository's policy is `examples/demo-repo/.artroom/policy.ts`, compiled
with `npm run compile-policy -- <dir>`. `docs/policy-pack.md` explains what
each rule replaces; `test/pack.test.ts` is its corpus.

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

## Contract gaps and how they were resolved

The policy amendment (protocol section 26) resolved or kept open each gap
that this package listed:

| Gap | Resolution |
|---|---|
| 1. Per-act budget | Resolved: `PolicyProfile.actSteps`, `actInspectedBytes`, `accounting`; `ProfileStamp.accounting`; R-EVAL-2, R-EVAL-9 |
| 2. Default `dependsOn` | Resolved: R-CARRY-2 and the `CarrySettings.dependsOn` comment say a key applies when it may overlap a reviewed scope pattern |
| 3. Retired evidence | Resolved: `NotCarried` code `key-retired` and `Reopened` because `key-retired` (R-REV-2) |
| 4. Sole-admin reopening | Resolved: `Reopened` because `sole-admin-ended` (R-ADMIN-2); `judgeAdminApproval` returns `because` |
| 5. Notify targets | Resolved: `NotifyDirectory` in the contract and in `ReplayContext` (R-POL-5). Kept open: reviewers are not in the notify rule input (open point 32) |
| 6. Land reviews | Resolved: `reviews` holds one latest verdict per qualifying reviewer (R-POL-7) |
| 7. Check carry facts | Resolved: `CheckCarryFacts` and `CarryFactsRecord` in the contract |
| 8. Require errors at activation | Resolved: the proposal's `land` is refused with the recorded refusal until a new generation or activation (R-POL-9) |
| 9. No `$glob` | Kept open (open point 30): needs a new profile version and a step charge |
| 10. Lane purpose | Resolved: `PolicyLane.purpose`. Refuse, require and land take the purpose from `input.lane.purpose`; carry, whose input has no lane, takes `opts.purpose` |

The review dd2a995b shapes (path/owners pairs, replay context, versioned
act budget) are now contract types; see protocol section 26.

## Review dd2a995b

| Finding | Fix | Tests |
|---|---|---|
| P1.1 Hidden budget and directory inputs | One digested `ReplayContext` per call, with budget accounting, limits and starting usage, lane purpose, carry facts and notify directory. `replay()` reconstructs a call. Notify always starts a fresh budget; `notifyContext()` gives the queue a stored context | `test/review-dd2a995b.test.ts` P1.1: default-budget refuse-then-require replay, notify directory replay, notify retry |
| P1.2 Retained input aliased the caller | The context is copied and frozen synchronously before any await; digest, evaluation and retention use that one value | P1.2: mutation after return and while pending; oversized input still refused and replayed |
| P1.3 Admin evidence judged by current role | Judged by recorded admission authority and current key validity; `judgeInitiator` checks the initiator now | `test/admin.test.ts`: demotion or retirement still counts, promotion cannot upgrade, compromised signer or grantor reopens, retired under `reopens`, second admin reopens a flagged approval |
| P2.1 Reserved and prototype path keys | Ownership as `{ path, owners }` pairs; profile unchanged | P2.1: ownership, require, notify, refuse and replay for `constructor`, `prototype`, `_jsonata_cache`, `__proto__` |
| "At most 225 ms" | Described as an estimate for sampled rules | — |

Seven more mutations, one per repair, each made a named Node test fail:
the context not copied; starting usage not recorded; the digest covering
only the rule input; notify inheriting a meter; admission role ignored;
grantor compromise ignored; ownership as a path-keyed map.

All of these run in Node and in workerd. The pinned usage of the spike's
cubic rule changed with each input shape change: 932 steps and 4,203,669
bytes before review dd2a995b; 775 and 4,200,107 with ownership pairs; 775
and 4,202,795 once `PolicyLane.purpose` joined the input.

## Not done

- The spike's suggestion to refuse a policy that exceeds a budget on a
  sample input when it is proposed. The carry result's `highlight` flag
  covers only the dry-run case of plan section 7.
- Overlap's `certain` flag (R-PATH-3). `globsOverlap` answers only "may
  overlap".
- Mutation spot-checks were run under Node only. The workerd suite was run
  only on the unmutated code.
