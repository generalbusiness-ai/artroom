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
(`packages/contract`). The branch is based on `7771921f` and has merged the
contract's repair for review 45431cd9 (`845c7fd`), which is still under
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
`ReplayContext` (`src/context.ts`). It holds the rule input and every side
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

## Path-safe rule inputs

Ownership in rule inputs is a list of `{ path, owners }` pairs
(`ProposalInput`, `src/inputs.ts`), not a map keyed by path. Paths are
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

Pass `{ purpose: "config-recovery" }` to `evaluateRefuse`,
`evaluateRequire`, `evaluateCarry` and `evaluateLand` for an act on a
configuration-recovery lane. Policy rules are then not evaluated (R-ADMIN-5);
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

1. **Per-act budget.** See "Required contract changes" below. The codes
   `act_step_budget` and `act_inspection_budget` are details inside
   `policy-budget-exceeded`.
2. **Default `dependsOn`.** The comment on `CarrySettings.dependsOn` says a
   changed path that matches a key adds that key's values. R-CARRY-2 says the
   defaults apply to "the areas of the reviewed scope". This package follows
   R-CARRY-2: a key applies when it may overlap a reviewed scope pattern.
3. **Retired evidence.** `NotCarried.code` has no code for a retired key under
   `retiredEvidence: "reopens"`. This package uses `policy-rejected`.
4. **Sole-admin reopening.** `Reopened` has no reason for a flagged
   self-approval that stops counting at reservation. `judgeAdminApproval`
   returns `reopens: true` with a text.
5. **Notify targets.** `Decision.outcome.to` holds only members and teams,
   and the notify `RuleInput` has no reviewers. The room passes a
   `NotifyDirectory`, which is recorded in the replay context.
6. **Land reviews.** The land `RuleInput` does not say that `reviews` holds
   each qualifying reviewer's latest verdict. The default `objection-open`
   rule assumes it does.
7. **Check carry facts.** The carry `RuleInput` has no check binding. The
   room passes `CarryFacts`, which are recorded in the replay context.
8. **Require errors at activation.** An open proposal cannot be refused
   after it is recorded. `activate()` returns a `refusal` for that proposal,
   which should block its landing until a new generation or policy.
9. **No `$glob`.** The profile's allowlist has no path-matching function,
   so expressions cannot match globs; `require` rules' `paths` cover the
   common case. If one is added, it must charge steps for its work.
10. **Lane purpose in rule inputs.** `PolicyLane` has no `purpose`, so the
    room passes it as an option. It is recorded in the replay context.

Resolved by the contract repair `845c7fd`: tests, fixtures and test and build
configuration are now platform global inputs (R-CARRY-3). This package uses
that list verbatim.

## Required contract changes

This branch does not edit `packages/contract`. These shapes are defined in
this package and should move into the contract:

1. **Path-safe ownership** (review dd2a995b P2.1). In `policy.ts`:

   ```ts
   export interface PathOwners { readonly path: RepoPath; readonly owners: readonly Principal[] }
   // PolicyProposal: replace
   //   readonly owners: Readonly<Record<RepoPath, readonly Principal[]>>;
   // with
   readonly owners: readonly PathOwners[]; // one entry per path in `paths`, same order
   ```

2. **Replay context** (P1.1, P1.2). In `policy.ts`, and change the comment
   on `Decision.input` to "Digest of the canonical `ReplayContext`; the
   context itself is retained with the log (R-LOG-7)":

   ```ts
   export interface Usage { readonly steps: number; readonly inspectedBytes: number }
   export interface BudgetState {
     readonly accounting: "artroom-act-budget-v1";
     readonly limits: Usage;
     readonly start: Usage; // spent by earlier calls for the same act
   }
   export interface NotifyDirectory {
     readonly roles: Readonly<Partial<Record<Role, readonly MemberId[]>>>;
     readonly reviewers: readonly MemberId[];
   }
   export interface CarryFactsRecord {
     readonly revoked: RevocationReason | null;
     readonly check: {
       readonly before: { readonly integration: Sha; readonly input: CheckInput; readonly config: Digest; readonly runner: Digest };
       readonly now: { readonly integration: Sha; readonly tree: Sha; readonly snapshot: Digest | null; readonly config: Digest; readonly runner: Digest };
       readonly volatile: boolean;
     } | null;
   }
   type In<K extends RuleKind> = Extract<RuleInput, { readonly kind: K }>;
   export type ReplayContext =
     | { readonly kind: "refuse"; readonly input: In<"refuse">; readonly budget: BudgetState; readonly purpose: LanePurpose; readonly recoveryKey: boolean }
     | { readonly kind: "require"; readonly input: In<"require">; readonly budget: BudgetState; readonly purpose: LanePurpose }
     | { readonly kind: "carry"; readonly input: In<"carry">; readonly budget: BudgetState; readonly purpose: LanePurpose; readonly facts: CarryFactsRecord }
     | { readonly kind: "land"; readonly input: In<"land">; readonly budget: BudgetState; readonly purpose: LanePurpose }
     | { readonly kind: "notify"; readonly input: In<"notify">; readonly budget: BudgetState; readonly directory: NotifyDirectory };
   ```

3. **Versioned act budget** (P1.1). Add to `PolicyProfile`, and to
   R-EVAL-2's table:

   ```ts
   readonly actSteps: 25_000;
   readonly actInspectedBytes: 4_194_304;
   readonly accounting: "artroom-act-budget-v1";
   ```

   and to `ProfileStamp`: `readonly accounting: "artroom-act-budget-v1";`.
   Until then, the accounting version and limits are in every replay
   context, so they are covered by `Decision.input`.

4. **Admin evidence facts** (P1.3). No new contract type is needed: the
   facts come from `Review.by: Authority` (its `member` and `role`) and the
   roster's key states. R-ADMIN-2's text could say that only a flagged
   self-approval depends on the current admin count.

## Review dd2a995b

| Finding | Fix | Tests |
|---|---|---|
| P1.1 Hidden budget and directory inputs | One digested `ReplayContext` per call, with budget accounting, limits and starting usage, lane purpose, carry facts and notify directory. `replay()` reconstructs a call. Notify always starts a fresh budget; `notifyContext()` gives the queue a stored context | `test/review-dd2a995b.test.ts` P1.1: default-budget refuse-then-require replay, notify directory replay, notify retry |
| P1.2 Retained input aliased the caller | The context is copied and frozen synchronously before any await; digest, evaluation and retention use that one value | P1.2: mutation after return and while pending; oversized input still refused and replayed |
| P1.3 Admin evidence judged by current role | Judged by recorded admission authority and current key validity; `judgeInitiator` checks the initiator now | `test/admin.test.ts`: demotion or retirement still counts, promotion cannot upgrade, compromised signer or grantor reopens, retired under `reopens`, second admin reopens a flagged approval |
| P2.1 Reserved and prototype path keys | Ownership as `{ path, owners }` pairs; profile unchanged | P2.1: ownership, require, notify, refuse and replay for `constructor`, `prototype`, `_jsonata_cache`, `__proto__` |
| "At most 225 ms" | Described as an estimate for sampled rules | — |

All of these run in Node and in workerd. The pinned usage of the spike's
cubic rule changed (775 steps, 4,200,107 bytes, from 932 and 4,203,669),
because ownership pairs change the input's size.

## Not done

- The spike's suggestion to refuse a policy that exceeds a budget on a
  sample input when it is proposed. The carry result's `highlight` flag
  covers only the dry-run case of plan section 7.
- Overlap's `certain` flag (R-PATH-3). `globsOverlap` answers only "may
  overlap".
- Mutation spot-checks were run under Node only. The workerd suite was run
  only on the unmutated code.
