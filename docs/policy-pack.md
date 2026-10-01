# The default policy pack

Artroom's default policy pack is twelve rules. Each one replaces something a
team sets up today in a Git hook, branch protection, a `CODEOWNERS` file,
required CI checks or a review assistant's instructions. In Artroom they are
one file, `.artroom/policy.json`. It is versioned with the code and changed
only by an admin-approved proposal.

This guide covers:

- how to use the pack;
- how owners must cover every path;
- what each rule replaces, with one line for before and after, and the text
  a user sees;
- what the platform does without any rule;
- the budget the pack uses.

## Use it

Write `.artroom/policy.ts` with the authoring helpers, then compile it to
`.artroom/policy.json`:

```ts
import { owners, policy } from "@generalbusiness/artroom-policy/helpers";
import { claimBeforePropose, ownerReview, checkTests /* … */ } from "@generalbusiness/artroom-policy/pack";

export default policy(
  owners({ "**": "@maintainers", "src/api/**": "@security", "src/**": "@app", "docs/**": "@docs" }),
  claimBeforePropose(),
  ownerReview(),
  checkTests("@ci"),
  // …
);
```

Run the compiler from the repository root:

```sh
npm run compile-policy --workspace @generalbusiness/artroom-policy -- examples/demo-repo/.artroom
```

The directory is relative to where you run `npm`. npm runs the script in
`packages/policy`, so the compiler reads the directory npm was started from
(`INIT_CWD`). Without an argument it uses `.artroom`. The compiler writes
`policy.json` only if the policy is valid (R-POL-1) and every owner-review
path has an owner (see below). Otherwise it prints the problems and exits
with status 1. The command above reproduces the committed demo `policy.json`
byte for byte.

The demo repository's complete policy is in
[`examples/demo-repo/.artroom/policy.ts`](../examples/demo-repo/.artroom/policy.ts),
and the compiled file is next to it as `policy.json`. To use every rule with your
own owners, call `starterPolicy({ owners })` instead.

## Owners must cover every path

`owner-review` applies to every path (`**`) and asks for a review from
`owners`. Only the owners of the obligation's paths can meet it (R-OBL-2).
So a change to a path with no owner would open an obligation that nobody
can meet, and the proposal could never land. An admin's approval does not
help: `obl_admin-approval` and `obl_deploy-config-review` are separate
obligations, added on top of owner review, never instead of it.

So the owner map must give every path an owner. The pack's choice is a
**fallback owner**: an entry for `**`. The demo uses
`"**": "@maintainers"`, so root files such as `README.md` and
`package.json`, `tests/**`, deploy files such as `wrangler.jsonc`, and
`.artroom/**` are all owned by `@maintainers`.

Every matching pattern adds its owners; a later pattern does not replace an
earlier one, as it does in `CODEOWNERS`. So the fallback owner is also an
owner of every other path, and can meet `owner-review` for `src/api/**`
too. Choose a fallback team you trust with every path.

The pack refuses a policy that would leave a path without an owner:

- `starterPolicy()` throws if its owner map has no pattern that covers `**`;
- the compiler refuses any `policy.ts` in which a review rule whose only
  `from` is `owners` applies to paths that no single owners pattern covers.
  The message names the rule and the glob, and suggests
  `owners({ "**": "@maintainers" })`.

If you do not want a fallback owner, limit owner review to the paths you
own, for example `ownerReview(["src/**", "docs/**"])`. Paths outside it then
need no owner review. The check is conservative: two patterns that only
together cover a glob are not enough, and a rule's `when` is ignored.

The room itself does not run this check: a hand-written `policy.json` with
a partial owner map is still a valid policy (R-POL-1). Compile policy with
the compiler, and an admin can repair a stuck policy through a
configuration-recovery lane (R-ADMIN-5).

## The rules

Each rule below shows what it replaces, the setup before and after, and what
the user sees.

### Before an act is recorded

**`jj-conflicts`** replaces a pre-push hook or CI step that rejects commits
with unresolved conflicts.
- Before: jj can push a commit that still has conflicts
  (`jj git push --allow-conflicts`). jj stores such a commit as a Git tree
  with `.jjconflict-base-*` and `.jjconflict-side-*` directories at its
  root. Without this rule the room would refuse it as `outside-claim`, or
  its checks would fail, and neither says why.
- After: the room refuses a proposal if any changed path starts with
  `.jjconflict-base-` or `.jjconflict-side-`. Only the root of the tree
  counts: `src/.jjconflict-side-0/app.ts` or `docs/jjconflict-notes.md` is
  an ordinary file.
- For a proposal, the room runs `refuse` rules before it checks the claim
  (R-ADM-1, step 8). So the author sees this rule, not `outside-claim`. It
  is also the pack's first `refuse` rule, so it fires before
  `claim-before-propose`.
- The user sees: *This proposal contains unresolved jj conflicts: it has
  .jjconflict-base-\* or .jjconflict-side-\* directories at the root of its
  tree.* Fix: *Resolve the jj conflicts, then propose again.*

**`claim-before-propose`** replaces a pre-push hook that requires a ticket or
branch name.
- Before: a hook in each developer's clone checks the branch name; anyone can skip it.
- After: the room refuses a proposal on a lane nobody has claimed.
- The user sees: *This lane has no claim, so nobody can see who is changing
  these paths.* Fix: *Claim the paths you are changing, then propose again.*

**`narrow-claims`** replaces a pre-push hook that rejects repository-wide
changes.
- Before: a hook counts changed files; it cannot see what other people are doing.
- After: a claim on `**` is refused unless an admin makes it, so lanes stay
  small and overlaps stay visible.
- The user sees: *A claim on \*\* covers the whole repository and would
  overlap every other lane.* Fix: *Claim only the directories or files you
  will change, for example src/api/\*\*.*

### What a proposal needs

**`owner-review`** replaces `CODEOWNERS` with "require review from code
owners".
- Before: `CODEOWNERS` plus a branch protection setting.
- After: `owners({ "**": "@maintainers", "src/api/**": "@security", … })`,
  and each changed path needs a review from its owners. Renames count both
  the old and the new path. Every path must have an owner (see "Owners must
  cover every path").
- The user sees an open obligation, `obl_owner-review`. `land` is refused
  with `obligation-open` until it is met.

**`check-tests`** replaces a required CI status check for tests.
- Before: a required check named in branch protection, matched by job name.
- After: changes to `src/**`, `tests/**` or `test/**` need the `tests` check
  from `@ci`, bound to the exact integration commit.
- The user sees an open obligation, `obl_check-tests`, until `@ci` reports.

**`check-types`** replaces a required CI status check for the type checker.
- Before: another required job, which runs even for a README change.
- After: only changes to `*.ts`, `*.tsx` or `tsconfig*.json` need the `types` check.
- The user sees an open obligation, `obl_check-types`.

**`deploy-config-review`** replaces `CODEOWNERS` entries that give
`.github/` and deploy files to admins.
- Before: `/.github/ @org/admins` in `CODEOWNERS`.
- After: changes to `.github/**`, `wrangler.*` or a `Dockerfile` need a
  review from an admin (`role:admin`).
- The user sees an open obligation, `obl_deploy-config-review`.

### Which earlier reviews still count

**`stale-approval`** replaces branch protection's "dismiss stale approvals
when new commits are pushed".
- Before: every push dismisses every approval, or none does.
- After: an approval carries to a new generation only when nothing it
  reviewed or depends on changed (platform rule). This carry rule adds that
  a rework of more than 25 paths drops earlier approvals anyway.
- The user sees, on the proposal: *not carried: policy rule stale-approval
  does not accept it*. The review obligation opens again.

The pack's carry settings also add `config/**` to the global inputs, and say
that a review of `src/api/**` depends on `src/lib/**` and `src/db/**`. A
change there stops an API approval from carrying, even if the reviewer did
not declare it.

### Before it lands

**`objection-open`** replaces branch protection's "require conversation
resolution" and a blocking "request changes" review.
- Before: a reviewer's "request changes" can be dismissed by anyone with write access.
- After: landing is blocked while any qualifying reviewer's latest verdict,
  here or carried, is an objection. The `policy()` helper adds this rule.
- The user sees: *A qualifying reviewer's latest verdict on this generation
  is an objection.* Fix: *Resolve the objection, or ask the reviewer to
  approve a new generation.*

**`fresh-approval`** replaces branch protection's "require approval of the
most recent reviewable push", for one area only.
- Before: the setting applies to the whole repository, so every small fix needs a new approval.
- After: only a change under `src/api/` needs an approval made on this
  generation. Elsewhere, carried approvals are enough.
- The user sees: *This proposal changes src/api/ and its approvals were all
  carried from earlier generations.* Fix: *Ask an owner to review this
  generation.*
- It applies when the `land` act is admitted, and again when the landing is
  prepared for reservation. Reservation then checks that nothing it saw has
  changed.

### Who hears about it

**`notify-owners`** replaces `CODEOWNERS` auto-requested reviewers, and a
review assistant's path instructions.
- Before: a bot comment, or a path rule in a review tool's configuration.
- After: the owners of every changed path get the proposal in their
  attention queue.
- They see: *You own a path this proposal changes.*

**`notify-holder`** replaces pull-request email for "changes requested" and
failed checks.
- Before: email for every comment, filtered by hand.
- After: the lane's holder hears only about objections and failed checks.
- They see: *Someone objected to your proposal, or a required check failed.*

## What the platform does without a rule

These protections are platform rules. Policy cannot turn them off, so the
pack does not repeat them.

| Today | In Artroom | The user sees |
|---|---|---|
| A hook that blocks commits touching other teams' files | A proposal that changes paths outside its claim is refused (R-PROP-4) | `outside-claim`. Fix: *extend the claim* |
| A secret-scanning pre-commit hook | Every act body, including notes, is scanned before it is recorded (R-SEC-1 to 3) | `secret-detected`, naming the field and the detector, never the secret. Fix: *remove the secret; rotate it if it was shared elsewhere* |
| `CODEOWNERS` for the policy files themselves | Any change to `.artroom/**` needs an admin's approval (R-ADMIN-1) | An open obligation, `obl_admin-approval` |
| "Require all reviews before merging" | `land` is refused while a review obligation is open (R-LAND-1) | `obligation-open`, naming the first open obligation |
| "Require branches to be up to date" and a clean merge | Preparation merges onto current main; a conflict fails the landing (R-LAND-4) | The landing fails with `conflict` and the paths |

## Budget

Every rule runs in a restricted evaluator with a budget per act: 25,000
evaluator steps and 4 MiB of inspected data (R-EVAL-9). The pack was
measured on a 500-path proposal, every path under `src/api/`, on both Node
and workerd. Both gave the same numbers, and the corpus pins them.

| Act | Rules evaluated | Steps | Inspected bytes | Share of the act budget |
|---|---|---|---|---|
| `propose` | `jj-conflicts`, `claim-before-propose`; the `require` rules | 4,012 | 139,286 | 16.0% of steps; 3.3% of bytes |
| `land`, and preparation at the reservation stage | `objection-open`, `fresh-approval` | 3,546 | 148,055 | 14.2% of steps; 3.5% of bytes |
| One carried approval | `stale-approval` | 6 | 30,012 | under 1% |

- The two rules that read every path are `jj-conflicts` (4,007 steps and
  139,159 bytes) and `fresh-approval` (3,532 steps and 147,708 bytes).
  `fresh-approval` reads each path's owners, so the fallback owner adds 15
  bytes per path.
- The largest act by steps is `propose`, with 20,988 steps of headroom
  (84.0%). The largest by bytes is `land`, with 4,046,249 bytes (96.5%).
- Adding `jj-conflicts` raised `propose` from 5 steps and 127 bytes. It
  does not lower the largest proposal the pack accepts. That limit comes
  from the profile's 256 KiB limit on one input value, with or without the
  rule: 1,461 paths of the length measured here. At that size `propose`
  uses 11,700 steps (46.8%) and 413,749 bytes (9.9%).
- `require` and `notify-owners` match paths in platform code, so they use no
  evaluator steps.
- The room-core spike estimated 3 to 9 microseconds of deployed CPU per step
  on the rules it sampled. That suggests about 12 to 36 ms for the largest
  act at 500 paths. This is an estimate, not a bound.

If an act runs out of budget, the refusal is deterministic:
`policy-budget-exceeded`, the same on every host and on replay. The corpus
shows this for `fresh-approval` on the same 500 paths with a 3,000-step budget.

## Where the tests are

`packages/policy/test/pack.test.ts` runs the demo policy through the real
runtime on Node and on workerd. It checks:

- each rule's pass case and refuse or apply case, including a jj conflict
  proposal outside the lane's claim and names that only contain
  `jjconflict`;
- the carry cases of plan section 7;
- the policy-level cases of protocol section 23 ("scoped checker, new test"
  and the policy lockout);
- the reservation-stage case;
- that `policy.ts`, `policy.json` and `starterPolicy()` agree;
- the budget figures above.

`packages/policy/test/review-4df45987.test.ts` checks owner coverage, on
Node and on workerd. For root files, `tests/`, deploy files, `.artroom`
files and a mixed proposal, it shows who can meet each obligation. It shows
that a partial owner map would leave `README.md` with nobody, and that
`starterPolicy()` refuses it. On Node, it runs the compiler and checks that
it refuses a partial map, writes nothing, and resolves its argument against
`INIT_CWD`.
