# I5: pin the register before it is founded, so a claim never waits for a restart

Branch `claude/edit-page-delivery-pq1w81` (the brief's `i5-edit-page`; this
session may push only under that `claude/` name), from
`origin/planner/i5-demo-host` at `13ae305`. Written 2026-10-08 by a builder
working alone in a cloud container, with no workroom, no deployment
credentials and no network beyond GitHub and the npm registry. Nothing
here is deployed.

The brief also carried the earlier task "edit a page". That work is
already at the base: `notes/2026-10-07-i5-edit-page-delivery.md` and
`packages/lanes/test/edit.scope.test.ts` are on `13ae305` **[run]**
(`git ls-tree`). This branch builds the pin-before-install task only.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** inferred and not run.

## 1. What is built

**A. Plan and planned install** (`packages/cli/src/commands.ts`,
`planInstall`, `installPlanned`; `line.ts`; `store.ts`, `PlannedInstall`).

- `artroom install --plan <base-url> [--host <h>] [--namespace <ns>]` signs
  the `install` intent with the operator key, computes the register ID
  from the seed `{ v: 1, kind: "register", definition: REGISTER, creator:
  null, cause: intentDigest(intent), ordinal: 0 }`, which is the seed the
  scope's `found` makes (`packages/scope/src/core.ts`, line 473), and keeps
  `{ service, definition, founding, register }` in the config. It founds
  nothing. It prints the ID and the seed's time, the intent's `notAfter`
  **[code]**.
- The intent lives 14 minutes: the contract's 15-minute bound less one
  minute, so a Worker clock slightly behind the command's does not refuse
  it as "further ahead than an intent may live" (`derive/src/genesis.ts`,
  line 129) **[code]**.
- `artroom install --planned` takes no other argument. Before it sends
  anything it refuses `plan-mismatch` (the kept ID is not the one the kept
  intent and version make, or the version is not this command's
  `REGISTER`) and `plan-expired` (the local clock is at or past
  `notAfter`). After the founding it checks that the receipt names the
  planned register **[code]**. A plan is replaced by a later plan and
  dropped once founded **[code]**.
- The plain `artroom install <base-url>` is unchanged in behaviour; its
  intent is now built by the same helper **[code]**.

Test, `packages/cli/test/install.scope.test.ts`: "the planned register ID
is the founded one; with the host pinned to it before the install, a claim
creates its repository in one run with no restart, sent once; a mismatched
or expired plan is refused by name and sends nothing; a plain install
founds another register; the config holds no secret" **[run]**.

Controls, run by hand as `docs/testing.md` says for a root-project test
(change one line, run `npx vitest run --project scope install.scope`,
restore) **[run]**:

- the mismatch check replaced by `if (false)`: the test fails at
  `expected [ 1, … ] to deeply equal [ 1, 'Refused: plan-mismatch' ]`; the
  mismatched plan was sent and founded a register;
- the planned ID computed from another intent (a changed
  `idempotencyKey`): the test fails at the correct plan's install,
  `expected [ 1, undefined ] to deeply equal [ +0, … ]`.

**B. Resend on acceptance** (`packages/scope/src/operations.ts`,
`reaccepted` and `#accepted`; `object.ts`, `#first`; `worker.ts`,
`outsideOf` and `DeployedScope.wiring`).

- The driver remembers, in memory, each attempt that a pass left recorded
  and unsent because the outside port did not accept its kind (and the
  runtime has rules for it). At each call of the object that runs no pass
  of its own, `reaccepted()` asks the port about at most one batch
  (`deliveryBatch`) of them, writes nothing, and if one is accepted starts
  one pass, which starts the walk over the unsent attempts again. A call
  that commits already runs a pass, and the pass makes the same check
  **[code]**.
- Nothing is sent twice: the walk sends only attempts whose sent mark is
  empty, and `markSent` writes the mark before the request leaves
  (unchanged, `sqlite.ts`) **[code]**.
- `outsideOf` reads the host settings from the environment at each call
  and makes a host's wiring again only when one of its values changed.
  `DeployedScope` now always wires the outside factory; with no setting it
  answers as `NO_OUTSIDE` **[code]**.
- The test Worker (`packages/scope/test/worker.ts`) lets an outside port
  that a test wired by name win over the deployed factory, as before this
  change **[code]**.

Tests:

- `packages/scope/test/operations.test.ts`: "an attempt recorded while the
  outside port refused is sent, with no restart, at the next call after
  the port accepts its kind, which is a read; it is sent exactly once;
  while the port still refuses, reads send nothing" **[run]**. Its control
  is inside it (reads while refused send nothing), and the test beside it
  shows the restart path, unchanged **[run]**.
- Control with `scripts/control.mjs`, `object.ts`: the `reaccepted()` call
  disabled: "DISTINGUISHES", failing at `expected [ [], … ] to deeply
  equal [ [ '1:0#1' ], … ]` **[run]**.
- `packages/scope/test/artifacts-wiring.test.ts`: "the Worker's outside
  port reads the setting at each call: a register refused with no setting
  is accepted once the setting appears, with no new port, and refused
  again once it is removed" **[run]**.

**C. Documents.** `docs/deploy.md`, "The order": plan, set the setting,
install as planned, claim; and "The earlier order, and its wait".
`docs/cli.md`: `install --plan` and `install --planned`. `docs/hosts.md`:
where `registerScope` comes from.

## 2. The live procedure

For the hosting's own Git service (for GitHub, use `--host github.com
--namespace <login>` and `GITHUB_APP_CONFIG`):

1. Deploy the Worker with `DEPLOYMENT`, `SESSION_SECRET` and the
   `ARTIFACTS` binding, with or without `ARTIFACTS_CONFIG`.
2. In a fresh config directory: `artroom install --plan <base-url> --host
   artifacts --namespace artroom-demo`. Note the register ID and the
   seed's time it prints.
3. Set `ARTIFACTS_CONFIG` with `registerScope` set to that ID, and deploy.
   Do this within 14 minutes of step 2.
4. `artroom install --planned`. Expect `Installed: register <the same
   ID>, under platform:register@2, as planned.`
5. `artroom claim demo --handle @you`. Expect it to finish in one run.
   Check: the register's operations show one attempt of
   `create-repository`, sent once.
6. Optional, the old order: in another config directory, `artroom install
   <base-url> ...`, set the setting to the new ID, deploy, and claim at
   once. Record how long the creation waits now.

If step 4 is refused `plan-expired`, repeat from step 2: a new plan has a
new ID, so the setting must change too.

## 3. Stand-ins and limits

- The Git host in both new scope tests and the command-line test is
  `OutsideDouble` (`packages/scope/test/outside.ts`), and in the
  command-line test it answers each creation with the name the register
  asks for. The scheduler is the test's `pause`. The clock is scripted.
  The readers are the real read sessions under a test secret **[code]**.
- The command-line test pins the planned ID by wiring the stand-in port
  under that name before the register exists. That stands for the host
  setting's `registerScope`; it does not run `hostBound` of the real
  wirings. That a real wiring pinned to an ID accepts that register is
  shown by the existing wiring tests **[code]**.
- **[inferred]** In production, a changed Worker setting is a new Worker
  version, and an object that runs the earlier version may keep the
  earlier environment until it restarts. Then part B cannot act before
  the restart, and the existing first-call pass sends the attempt after
  it. Part B acts whenever the environment an object reads changes in its
  life, which the tests show. Part A avoids the wait in either case.
- The plan's window is 14 minutes from the plan. No flag sets a later
  window **[code]**.
- `reaccepted()` remembers only attempts refused in the object's current
  life; after a restart the first-call walk covers the rest **[code]**.

The known failure of `packages/cli/test/story.scope.test.ts` ("Refused:
bad-field" where "guard-failed (not-activated)" is expected) does not
reproduce here: the file passes at the base `13ae305` and at this branch's
head, run with `npx vitest run --project scope story.scope` (2 passed
each) **[run]**. I changed neither the refusal nor the test.

## 4. Gate

`npm run gate`, once, at `5ab7c95` (tree `692a6d34`), the last source
commit; this note is the only later commit, and changes only a document
**[run]**. The machine: this cloud container, no other load of mine, the
install cache warm from `npm ci`.

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | 0 | 4.3 s | 5.6 s |
| whitespace | 0 | 0.1 s | 0.1 s |
| typecheck | 0 | 11.2 s | 36.4 s |
| test | 1 | 139.2 s | 184.4 s |

Tests: 805 passed, 1 failed, of 806, in 115 files. The one failure is T36
of `packages/checkers/test/runner.test.ts` (`checkout-failed`), the
container-git failure the brief names; I did not touch it.

The run also reported two errors that failed no test:

- an unhandled `write EPIPE` from `packages/git/test/support/host.ts`,
  line 80, during `packages/git/test/http.test.ts`. That file alone passed
  with no error (`npx vitest run --project git http.test`, 2 passed)
  **[run]**. This branch changes nothing under `packages/git` **[code]**.
- a log line of the test runtime, "Cannot perform I/O on behalf of a different Durable
  Object", from the test runner's timeout abort. No test failed or timed out by
  name, and I could not tell which file it came from.

`sudo apt-get install -y time` failed first ("Unable to locate package");
after `apt-get update` it installed **[run]**.

## 5. What is owed

- The live run of section 2, on the deployment: the planned ID equals the
  founded one, and the claim finishes in one run.
- The old order on the deployment, to learn whether part B acts there
  before a restart (section 3, the inferred limit).
- If 14 minutes is too short for setting the setting and deploying, a
  flag for a later window is a planner's decision; I added none.

## 6. Decisions followed

- The register ID is a pure function of the install seed; the operator
  computes it before founding with `install --plan`, which prints the
  seed's time and the ID and keeps the plan in the config; `install
  --planned` founds with it and checks the ID; plain `install` works as
  before.
- The host wiring reads its setting from the environment at each
  outside-port call; the object runs one driver pass when a setting it
  depends on appears after a recorded unsent attempt, bounded, and sends
  nothing twice.
- A refusal writes nothing and is the answer. Nothing was deployed.
