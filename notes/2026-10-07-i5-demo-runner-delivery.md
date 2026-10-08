# I5: the demo runner, a rehearsal of the script with a transcript and page captures

Branch `claude/edit-page-issue-commands-h08jb0` (this session may push only
under that name; the brief's local name was `i5-edit-page`), from
`origin/planner/i5-demo-host` at `67fe67f9`, history not rewritten.
Written 2026-10-08 by a builder working alone in a cloud container, with
no workroom, no deployment credentials and no network beyond GitHub and
the npm registry. Nothing here is deployed or run against a deployment.
No gitseq request was filed: this container has no workroom.

The brief carried three tasks. Two of them, the issue commands with
`--closes` and `verify --all`, and edit a page, are already delivered and
merged at `67fe67f9` (`notes/2026-10-07-i5-issues-delivery.md`,
`notes/2026-10-07-i5-edit-page-delivery.md`), so this branch builds on
them and does not redo them. This note is the third: the demo runner.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** inferred and not run.

## 1. What is built

**A. The two scripts.**

- `scripts/demo/rehearse.ts` **[code]**: the rehearsal, in any runtime.
  26 shots, in the order of the 23:00 sprint report's observed run and
  the brief: plan and planned install (with the operator's setting
  between them), claim, rules published, issue and change definitions
  activated, invite and join for a member and a maintainer, clone by the
  room's token and `git log --oneline`, issue open, comment and assign,
  `edit guide/start.md --closes 1` (published, the issue closes), the
  `AGENTS.md` edit refused `rules-not-met:rules`, the controller's
  approval, the merge that publishes, the bad path refused
  `path-invalid`, `issues`, `verify --all`, and a GET of the site's front
  page, both published pages and `/page/`. Each shot is the command line's
  own function `command` of `packages/cli/src/line.ts` with that person's
  `Context`; no process is spawned for an `artroom` command. Each shot
  states its exit code and lines as templates (`<name>` keeps a value,
  `<...>` is any text, `{name}` is a kept value); a later shot types the
  kept values. `transcript()` writes, per shot, the time, the command as
  typed, the lines printed, the seconds taken and whether they match,
  then the table: shot, expected, observed, match. `withheld()` cuts every
  invitation link to its first eight letters, in the lines and in the
  typed `join`.
- `scripts/demo-run.ts` **[code]**: the runner against a deployment:
  `<base-url> --host --namespace --scratch --out [--name] [--setting-set]`.
  A fresh config directory for each person under the scratch directory
  (it refuses one that is not empty), the local files and the clone in
  `work`, Node's file store, `git` and `fetch`. After the plan it prints
  the register ID and waits for Enter, unless `--setting-set`. It writes
  `transcript.md` and `room.json` (the room's IDs and the config
  directories' paths, no secret) and exits 1 if any shot does not match.
- `scripts/demo-captures.ts` **[code]**: six PNG captures of the page in
  a headless browser, each at most 300 kB: the room, the issue, the
  refused change (`../outside.md`), the published change
  (`guide/start.md`), the rules view and the site's rendering of
  `guide/start.md`; with `captures.md` listing them. Live form: the base
  URL, a person's config directory (`--home`, the key it keeps goes only
  into the browser's local storage) and `room.json`. Recorded form
  (`--recorded`): runs the recorder below and answers the browser from
  the record, as `packages/page/test/screens.mjs` does. Without
  `playwright-core` or the browser it prints "Skipped: ..." and makes no
  capture.
- `scripts/tsconfig.json`, added to the root `typecheck` script, so the
  three files are typechecked by the gate **[run]**.

**B. The test on real scopes**: `packages/lanes/test/demo.scope.test.ts`,
beside the lane scenarios, in the root `scope` project.

- "every shot, from the planned install to the page, prints the exit code
  and the lines the script expects, and the transcript's table says yes
  for each; a shot whose outcome differs is a row that says no; no secret
  is in the transcript" **[run]**: the 26 rows all say yes; the issue
  lists closed, the host's branch got the three commits in order,
  `verify --all` says "All consistent: 12 scopes."; the transcript holds
  neither invitation link whole, nor any person's key, nor any credential
  the stand-in host gave out. Its in-test control: the refused edit's
  expectation does not take the published merge's outcome ("exit 0,
  where 1 is expected"), the published merge's expectation does not take
  another change's publication (line 1 differs), and a table with such a
  row says no and names the shot.
- "record the Worker's answers to the page's reads on the rehearsal's
  room, for demo-captures (runs only with DEMO_RECORD=1)": not a test of
  a property; skipped by name in the gate **[run]**. The root
  `vitest.config.ts` provides `demoRecord` beside `pageRecord`.

Controls with `scripts/control.mjs`, each against the lanes package's own
workerd config (`-- packages/lanes --config vitest.scope.config.ts
test/demo.scope.test.ts`), each "DISTINGUISHES" with the first test
failing by an assertion **[run]**:

| Change applied to `scripts/demo/rehearse.ts` | Failing assertion |
|---|---|
| The controller approves `extent=source` instead of `extent=rules` | "19. Merge: it publishes: exit 1, where 0 is expected" |
| `withheld` returns the text unchanged | the links-are-cut assertion ("expected false to be true") |
| `judged` ignores the exit code | the in-test control: line 1 differs, where "exit 0, where 1 is expected" was asserted |

**C.** `docs/demo.md`: what the runner does, how to rehearse a deployment
with it and the captures, what the transcript shows, the recording-day
order, and the tests. `docs/testing.md` names the new scenario.

**D.** This note.

Runs of the scripts in this container:

- `scripts/demo-captures.ts --recorded` **[run]**: six captures, 21,611
  to 165,824 bytes (room 78,386; issue 122,913; change-refused 133,095;
  change-published 165,824; rules 141,831; site-page 21,611), with
  `playwright-core` 1.56.1 installed in a scratch directory outside the
  checkout and the container's browser at
  `/opt/pw-browsers/chromium-1194`. I looked at the room and the refused
  change: the refused change shows its merge "refused (path-invalid)" and
  the destination's publication "not-reserved (path-invalid)". The
  pictures are not committed.
- `scripts/demo-run.ts` against a closed local port **[run]**: shot 1
  (the plan, which signs locally) matches; every later shot is "No
  answer" or "not run", the transcript and `room.json` are written, and
  the exit code is 1. It has not run against a deployment.

## 2. The live procedure (the planner's)

On the machine with the deployment's settings, from a checkout of this
branch, with `node` 22 or later (as `packages/cli/bin/artroom.js` runs;
no package is installed in the checkout):

```
node --experimental-transform-types --no-warnings scripts/demo-run.ts \
  https://artroom-scope.inguz.workers.dev --host artifacts --namespace artroom-demo \
  --scratch <scratch>/rehearsal-1 --out <scratch>/rehearsal-1/out
```

1. After shot 1 the runner prints `Set registerScope to sc_... in the Git
   host's setting ..., then press Enter.` Set `registerScope` in
   `ARTIFACTS_CONFIG` to that ID as on 2026-10-07 at 21:14:44, then press
   Enter within the plan's 14 minutes.
2. It prints each shot as it ends. Expect about 90 seconds after the
   setting (the observed run of 21:14 to 21:16 took eighty seconds for
   the middle) **[inferred]**.
3. Then the captures, signed in as the founder:

```
PLAYWRIGHT_CORE=<scratch>/pw node --experimental-transform-types --no-warnings scripts/demo-captures.ts \
  https://artroom-scope.inguz.workers.dev --home <scratch>/rehearsal-1/founder \
  --room <scratch>/rehearsal-1/out/room.json --out <scratch>/rehearsal-1/out
```

   with `npm install playwright-core@1.56.1` run in `<scratch>/pw` first,
   and `CHROMIUM=<a browser executable>` if the browser is not under
   `/opt/pw-browsers`.
4. Read `transcript.md`: every row of its table says "yes", or the
   result line names the shots that differ. Copy the observed lines into
   the demo script where they differ.

On GitHub as the host, the same command with `--host github.com
--namespace <organization>` and `GITHUB_APP_CONFIG` pinned instead; the
expected lines name the host and namespace given **[inferred]**, and shot
11's remote is GitHub's.

## 3. Stand-ins and limits

- The runner has not run against a deployment. Its expected lines are
  the 23:00 report's observed lines in form, and the test Worker's lines
  in fact **[run]**; a deployment that prints otherwise is a "no" row to
  read, not a fault of the runner by itself.
- In the test: the Git host (`OwnGit` under the production wiring of the
  hosting own Git service's ports), `git` (a clone is a read of the
  stand-in's refs with the clone's header; `log` reads the stand-in's
  commit objects), the scheduler, and the operator's setting (the test
  wires the stand-in to the planned register before the planned install,
  as `install.scope.test.ts` does). The captures' recorded form answers
  the browser with the test Worker's answers; it shows the page on that
  room, not on a deployment.
- The runner keeps going after a shot that does not match, so later rows
  can be noise after an early failure; the first "no" row is the one to
  read. A live run after a failure may still sign acts on the deployment.
- The repository pins no TypeScript runner: there is no `tsx` in the lock
  file. The scripts run as `packages/cli/bin/artroom.js` does, with
  `node --experimental-transform-types`. The 23:00 report ran the command
  line with `tsx` 4.21.0 from a scratch directory; that should also run
  them, and was not tried here.
- The repository does not pin Playwright, against the brief's
  understanding: `docs/testing.md` and `packages/page/test/screens.mjs`
  install `playwright-core` outside the checkout. The captures script
  follows that, through `PLAYWRIGHT_CORE`.
- The captures in the recorded form are taken with the founder's key
  only; the member's or maintainer's view needs the live form with their
  `--home`.
- The known failure of `packages/cli/test/story.scope.test.ts` named in the
  brief ("Refused: bad-field" against "Refused: guard-failed
  (not-activated)") does not occur at `67fe67f9`: the test passes **[run]**
  (`npx vitest run --project scope cli/test/story`). Its line 157 now
  expects `guard-failed (not-activated)` and line 161 `bad-field` for the
  act with no bytes beside it, after the definition-versions merge
  `13ae305`. I touched neither the command line nor the lanes, and left
  it.

## 4. Gate

`npm run gate` once, at `d169c3b3` (tree `12ea4c4f`), in this container
(Node v22.22.0, a shared cloud machine, cold vitest cache, `node_modules`
installed by the gate's own `npm ci` because the stamp was absent)
**[run]**:

| Step | Exit | Elapsed | CPU |
|---|---|---:|---:|
| install | 0 | 4.7 s | 6.2 s |
| whitespace | 0 | 0.1 s | 0.1 s |
| typecheck (now with `scripts/tsconfig.json`) | 0 | 14.1 s | 45.9 s |
| test | 1 | 186.8 s | 234.4 s |

Vitest: 122 files, 2 failed, 119 passed, 1 skipped; 817 tests, 2 failed,
813 passed, 2 skipped (the demo recorder, and one skipped before);
3 unhandled errors, each `EPIPE` from the stand-in Git server of
`packages/git/test/support/host.ts` while `http-read.test.ts` ran. The
gate stops after a failing vitest run, so its last script did not run;
run alone, `node --test scripts/active-source.test.mjs` passed 6 of 6
**[run]**. The gate reports FAILED, for two failures this branch does not
cause:

- T36 of `packages/checkers/test/runner.test.ts`: the container's `git`,
  as the brief says.
- "the scope Worker's page module is the page's build of this source" of
  `packages/page/test/assets.test.ts`: it fails the same way at the base
  `67fe67f9` **[run]** (a worktree of that head with this container's
  `node_modules`). This branch changes no file under `packages/page` or
  `packages/scope/src` (`git diff --stat` against the base lists none).
  The build in this container differs from the committed
  `page-assets.ts`; why (the bundler's output here, or a page source
  merged without a rebuild) I did not find, and I did not regenerate the
  file, which is outside this task.

The `EPIPE` errors are in the git package's tests, which this branch does
not touch; whether they come and go with the container's `git` I did not
establish **[inferred]**.

## 5. What is owed

- The page module check (`packages/page/test/assets.test.ts`) to be run
  where the gate is green, and the module rebuilt there if it is stale.
- The live run of section 2, and its transcript beside the script.
- The script's expected lines updated from that transcript where they
  differ (shots 8 to 12 of the draft still show the earlier `act open-pr`
  form; the runner's shots are the commands that replaced it).
- If the planner wants the runner to stop at the first "no" row on a
  live deployment, a `--stop` flag; not built, since the brief asks for
  every shot's row.

## 6. Decisions followed

- `scripts/demo-run.ts` takes a base URL, a host and a namespace, a
  scratch config directory and an output directory; fresh config
  directories per person (founder, member, maintainer); the shots in the
  brief's order; it prints the register ID and waits for Enter, or takes
  `--setting-set`; `transcript.md` with time, command, lines, seconds and
  match per shot, and the table at the end; exit non-zero on any
  mismatch; no secret printed.
- The commands are called as functions with a `Context`
  (`packages/cli/src/line.ts`), not spawned.
- The same rehearsal runs in a test on real scopes with the stand-in host,
  and the test asserts the transcript's match table.
- `scripts/demo-captures.ts` uses the container's browser at
  `/opt/pw-browsers`; it opens `/page/` on the runner's room from
  `room.json`, saves the six captures under 300 kB each, and in the test
  form runs against the test Worker's answers, skipped by name when not
  asked for.
- Plain English; no em-dash; in `docs/demo.md` no product is named but
  GitHub, and the other host is "the hosting own Git service" (the
  package `playwright-core` and the environment names appear as literals).
