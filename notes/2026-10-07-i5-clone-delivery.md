# I5: a member reads the repository (`read-token`, `artroom clone`), delivery

2026-10-07. Branch `claude/read-token-credential-flow-6vlu8d` (the name
this session may push; the brief's local name was `i5-clone`), on top of
`origin/planner/i5-demo-host` at `714afda4`, whose history is unchanged.
Built alone in a cloud container with no binding, no deployment
credentials and no workroom, so no gitseq request was opened or updated;
the planner owes that. Nothing was deployed. No file under
`packages/scope/src/site*` was created or changed.

Labels: **[code]** read from code, **[run]** confirmed by a run in this
container, **[inferred]** not checked.

## 1 What is built

### Source

- `packages/platform/src/destination.ts`: the act `read-token` on the
  branch, field `hours` (int, 1 to 24, `READ_TOKEN_HOURS`), grant
  `destination.read-token`, which adds room for one `mint-read` and whose
  one effect is the rule `open-read-token`. The operation kind
  `mint-read` (`DESTINATION_KINDS.mintRead`, 1 attempt) and its outcome
  rule: a `confirmed` body is exactly `{ token, ends }`, a `refused` or
  `unknown` body is `{}`, and it derives no effect. [code]
- `packages/platform/src/membership.ts`: one more row of the role table,
  `destination.read-token` for all five roles, appended to each role's
  first list. An admin now has 35 actions, a maintainer 26, a member 23,
  an agent 19 and a checker 3. [code]
- `packages/scope/src/destination-host.ts`: `DestinationProvider` gains
  `mintRead(repository, { handle, seconds })` and `remote(repository)`.
  `DestinationHost.send` answers a `mint-read`: it reads `hours` from the
  act that opened the operation, fixes a nonsecret handle
  (`read:<digest>` of the scope, operation, attempt and origin hash),
  asks the provider once, puts the plaintext in custody and answers
  `{ token: handle, ends }`. `judged` and `replies` treat a `mint-read`
  as they treat a write's `mint`. `credential(handle, key)` is the
  one-time read. [code]
- `packages/scope/src/credential-store.ts`: `held(id)` and `take(id,
  now)`. `take` drops the plaintext in the same step as it returns it; at
  or after the end it drops it and returns nothing. [code]
- `packages/scope/src/artifacts-host.ts`: `mintRead` is one
  `createToken("read", hours * 3600)` through the binding; `remote` is
  `https://<setting host>/git/<namespace>/<name>.git`. [code]
- `packages/scope/src/github-host.ts`: `mintRead` is one installation
  token restricted to the repository's ID with `contents: read`; its end
  is GitHub's `expires_at`, and `seconds` is not sent. `remote` is
  `https://github.com/<namespace>/<name>.git`. [code]
- `packages/scope/src/operations.ts`, `ports.ts`, `sessions.ts`,
  `object.ts`, `worker.ts`, `artifacts-wiring.ts`, `github-wiring.ts`:
  `Outside.credential`, the read name `credential` (in `MEMBER_READS`),
  `Readers.holder` (the session's key), `ScopeObject.credential`, and the
  route `GET /v1/scopes/:destination/credential/:handle`, answered with
  `cache-control: no-store`. [code]
- `packages/cli/src/commands.ts`, `line.ts`, `main.ts`, `store.ts`, and
  the new `git.ts`: `artroom remote` and `artroom clone [<directory>]
  [--hours 1]`; `Context.git`; Node's runner `nodeGit`; the config's
  `remote`. `show` and `acts` are unchanged. [code]

Documents: `docs/cli.md` (the two commands, and two lines of "What it
does not do yet"), `docs/hosts.md` (how a member reads the repository on
each host), `docs/scopes.md` (one paragraph on the credential read) and
`packages/scope/README.md` (the route).

### Tests, by title

- `packages/platform/test/destination.test.ts`: "read-token takes hours
  from 1 to 24 and opens one mint-read; its confirmed outcome is exactly
  a handle and an end, and changes no item". In memory, with the test
  authority. [run]
- The listing tests that pin the definition and the roles were extended,
  not loosened: the destination's acts, marks, outcome kinds and 21
  rules, with the row "I5: one mint-read, with 1 attempt"
  (`destination.test.ts`); the reserving kinds (`definitions.test.ts`);
  the five role counts (`rules.test.ts`); the session's reads
  (`packages/scope/test/sessions.test.ts`). [run]
- `packages/scope/test/read-token.test.ts`: "a member mints a read token
  and reads it once; a second read, another member's session, a read with
  no session and a read at its end are each forbidden; a key that is no
  member's is refused; the plaintext is in no entry and is gone from
  custody; the destination verifies consistent". Real scopes of the
  namespace `PLATFORM`, the real read sessions and routes, the real
  `artifacts-wiring.ts` port over a scripted binding. [run]
- `packages/scope/test/github-host.test.ts`: the existing GitHub test now
  also states "a member's read token is restricted to the repository
  with contents read": one POST with `{ repository_ids: [71],
  permissions: { contents: "read" } }`, and GitHub's remote form. [run]
- `packages/cli/test/git.test.ts` (Node): "the Node runner passes the
  header only through git's environment configuration, never in the
  arguments; with no git on the PATH it answers null". A stand-in `git`
  script on the PATH records its arguments and environment. [run]
- `packages/cli/test/clone.scope.test.ts` (beside
  `story.scope.test.ts`): "remote prints the host's form; clone without
  git signs nothing; clone signs read-token, reads the token once and
  gives it to git only in its environment's header configuration; a
  member clones once the destination has an act; GitHub's remote is
  whole". It also witnesses the gap of section 5.1. [run]

Controls, each run once and the file restored:

| Change | Test | Result |
|---|---|---|
| `read-token`'s field bounds 1..24 widened to 0..25 | the platform test | distinguishes [run] |
| the signer check `opening.signed.intent.actor !== key` made `false` | `read-token.test.ts` | distinguishes: another member's session read it, 200 for 403 [run] |
| `take` does not drop the plaintext | `read-token.test.ts` | distinguishes: a second read got 200 [run] |
| `take` ignores the end | `read-token.test.ts` | distinguishes: a read at the end got 200 [run] |
| no session read as a session of some other key | `read-token.test.ts` | survives: the signer check decides first, so this guard changes no answer of that test [run] |
| `clone` gives git the header as `-c http.extraHeader=...` arguments (by hand; `scripts/control.mjs` cannot select the root `scope` project) | `clone.scope.test.ts` | the test failed by an assertion [run] |

## 2 The live procedure for the local colleague

Read section 5.1 and 5.2 first: the room claimed this morning cannot be
cloned by this command, because its destination has had no act and the
claim was more than 15 minutes ago. The procedure therefore uses a fresh
claim on the same register. [run in the test Worker; inferred for the
deployment]

1. Check out this branch, gate it, and deploy the scope Worker as before
   (`docs/deploy.md`). No new binding, setting or secret is needed.
   [code]
2. Optional, to see the gap on the old room: `artroom remote`. Expected:
   `Cannot read sc_...: forbidden.` [inferred for the deployment]
3. A second config directory for the fresh claim, with the same
   operator key and register:

   ```
   cp -R ~/.config/artroom /tmp/artroom-i5        # or $ARTROOM_HOME
   ```

   In `/tmp/artroom-i5/config.json`, remove the members `repository`,
   `handle`, and `claim` and `remote` if present. Keep `v`, `service`,
   `key` and `register`.
4. Claim, then clone within 15 minutes of the claim:

   ```
   export ARTROOM_HOME=/tmp/artroom-i5
   artroom claim demo-clone --handle @hugh
   artroom remote
   artroom clone /tmp/demo-clone --hours 1
   ```

   Expected: `remote` prints `Host: artifacts`, `Namespace:
   artroom-demo`, the name, and the remote URL with `<service host>`
   marked. `clone` prints `Read token: sc_...:<seq>, until <end>.`, the
   remote URL whole (`https://<the setting's host>/git/artroom-demo/<name>.git`)
   and `Cloned into /tmp/demo-clone.` [run in the test Worker]
5. Checks:
   - `git -C /tmp/demo-clone log --oneline` shows the founding commit, if
     the destination's first head was written before the clone; otherwise
     git reports an empty repository. `artroom log destination` shows
     both. [inferred]
   - `git -C /tmp/demo-clone config --list | grep -i extraheader` prints
     nothing: the header was never in the clone's config. [inferred]
   - `artroom remote` now prints the remote URL whole. [run]
   - `artroom log destination --limit 4` shows `act read-token by
     key_...` and an outcome entry after it. `artroom verify
     destination` reports consistent. [run in the test Worker]
   - A second member: `artroom invite @someone --role member`, `artroom
     join <link>` in a third config directory, then `artroom clone` there.
     It works because the destination now has an act. [run in the test
     Worker]
   - The one-time read itself (a second read, another member's session,
     a read at the end) has no command; the test of section 1 shows it.

## 3 Stand-ins and limits

- The hosting's own Git service is a scripted binding in every test. No
  real token was minted, no repository was cloned, and no remote URL of
  the real service was seen. [run]
- GitHub's `mintRead` ran against a scripted fetch. No GitHub token was
  minted. [run]
- `git` is a recording function in the real-scope story, and a stand-in
  shell script in the Node test. No `git clone` ran against any host.
  [run]
- The header reaches git through `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0`
  and `GIT_CONFIG_VALUE_0`, which git reads as `-c` configuration from
  version 2.31. That git honours them for `http.extraHeader` on a real
  clone was not run. [inferred]
- The token is not in git's arguments, so a process list does not show
  it. A process's environment is still readable by the same user and by
  root, through `/proc/<pid>/environ`. [inferred]
- On GitHub the header is `Basic` with the user `x-access-token`, the
  form the GitHub port already uses for its own Git reads. It was not run
  against GitHub. [code]
- The register's Git host and the scheduler are the stand-ins of
  `story.scope.test.ts`. [run]

## 4 Gate

Machine: this container, 4 CPUs, Linux, git 2.43.0, load average about 1
before each run, warm caches (installed `node_modules`, earlier vitest
runs). `npm run gate` was invoked five times, because each of the first
four found something at its head:

| Head | Tree | What ended it |
|---|---|---|
| `8368c2f` | | whitespace: a blank line at the end of `read-token.test.ts` |
| `1e06b03` | | typecheck: a comparison in the new platform test |
| `c111519` | `5f1a8466` | test: 772 passed, 1 failed (T36) |
| `e8e1325` | `bd97c42c` | test: 772 passed, 1 failed (T36); 4 unhandled EPIPE errors |
| `6a51302` | `5a476cd0` | test: 772 passed, 1 failed (T36); 1 unhandled EPIPE error |

After `c111519` I added the GitHub `mintRead` check and found that the
source-layout script read my temporary directory name `artroom-git-` as a
name of the git package; both are fixed, and the last run is at the head
whose source and tests this note sends.

The last run, at `6a51302c8e4dbe3eb8af477fcb2da3f9fdc96c7b`, tree
`5a476cd0a601cd871ea5abf6e7b21561108917ec`, observed once:

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | skipped (lock file unchanged) | | |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 11.8 s | 36.3 s |
| test | 1 | 68.2 s | 109.0 s |
| whole gate (`time`) | 1 | 80.2 s | 145.7 s (123.8 user, 21.9 system) |

- vitest: 105 files, 104 passed and 1 failed; 773 tests, 772 passed and
  1 failed. The failure is T36 of
  `packages/checkers/test/runner.test.ts` (`checkout-failed`), untouched
  here, which the brief names as failing because of the container's git.
  [run]
- vitest also reported 1 unhandled error, `write EPIPE` from
  `packages/git/test/support/host.ts:80`, during
  `packages/git/test/http.test.ts`. The run before reported 4 such errors
  in `packages/git` tests, and the run before that none. This branch does
  not change `packages/git`. Its cause was not looked for. [run]
- The log also holds an uncaught workerd message, `Cannot perform I/O on
  behalf of a different Durable Object`, with no failed test. It appeared
  in the runs at `c111519` and `6a51302`. My two new real-scope files,
  run alone together, do not print it. Its origin was not found. [run]
- Because vitest exited 1, the gate did not run its last step,
  `scripts/active-source.test.mjs`. I ran that script alone at the last
  head: 6 tests, 6 passed. [run]

This note is a document-only commit after the last run; the source and
tests are those of tree `5a476cd0`.

## 5 What is owed

5.1 **A destination with no act cannot be read after the founder's
intent window.** Exact text, from the run in `clone.scope.test.ts`, 16
minutes after the claim:

```
Cannot read sc_...: forbidden.
```

The destination records membership's incarnation only from an
observation that an entry retains, and the first such entry is its first
act. Until then it accepts no read session (`checkSession` compares the
incarnation). A signed read by the founder's key reaches it through the
claim, but only within 15 minutes of the reading (`signed-reads.ts`, rule
6). So `remote` and `clone` cannot read the branch's revision, and
`read-token` needs that revision in `expected`. Every member, the founder
included, is blocked once the window has passed. The room claimed this
morning is in that state. [run for the test Worker; inferred for the
deployment] Not invented here; three ways the planner may choose from:
the destination accepts a session by membership's ID alone before its
first observation; `claim` ends with a first act at the destination,
signed by the founder within the window; or `read-token` names no
revision. Each changes a decided rule.

5.2 **Rooms founded before this branch lack the action.** A roster keeps
the action lists that membership's `establish` set. On such a room every
`read-token` would be refused `unauthorized` until an admin's
`set-actions` adds `destination.read-token` to each role's list, five
acts, each with the role's whole list. [code; inferred for the
deployment] A fresh claim has it.

5.3 Two platform definitions changed in place, under the same names and
versions (`platform:destination@1`, `platform:membership@1`): a
definition is pinned by name and version, so existing scopes run the new
rows after a deploy. Earlier histories hold no `read-token`, so their
replay is unchanged. [code; inferred]

5.4 A read token that is minted and never read stays valid at the host
until its end, and its plaintext stays in custody until a read finds it
or is refused at its end. There is no sweep, and no revocation operation
(the decision gives none). [code]

5.5 The recovery of a lost `mint-read` reply through `replies()` is
written but no test exercises it. [code]

5.6 GitHub fixes an installation token's lifetime at one hour; `hours`
does not change it there. [code]

5.7 `remote` on the hosting's own Git service marks the service host
until a clone has learned it from the credential's answer: the host is the
Worker's setting, and no scope records it. [run]

5.8 `git fetch` and `git pull` in a clone have no command that gives
them a token; each `artroom clone` mints a new one. [code]

5.9 The two gate observations of section 4 (EPIPE in `packages/git`
tests; the workerd I/O message) are not explained. [run]

5.10 The `cli` package's `package.json` description still lists the
commands without `remote` and `clone`. [code]

## 6 Decisions followed

- `read-token` with `hours` 1 to 24, signable by any active member; the
  grant is named `destination.read-token` and is in every role's list.
  [code; run: a member signs it, a key that is no member's is refused]
- One `mint-read` per act. The hosting's own service: the binding's
  `createToken("read", ttl)` with `ttl = hours * 3600`. GitHub: an
  installation token restricted to the repository's ID with contents
  read. [code; run with stand-ins]
- The outcome records the adapter's nonsecret handle and the end, never
  the plaintext; the plaintext goes to private custody as a write token
  does. [run]
- The one-time route `GET /v1/scopes/:destination/credential/:handle`,
  for "the session that signed the act", implemented as the session
  whose key signed the `read-token` act; a session lasts at most ten
  minutes, so the same key's next session also qualifies. A second read,
  another key's session, no session, and a read at or after the end are
  `forbidden`. The act and its outcome are ordinary entries and verify
  folds them. [run]
- The route's answer holds `token`, `ends` and `remote`. `remote` is an
  addition: the hosting's service hostname is the Worker's setting and in
  no scope record, so this is how `clone` learns the remote URL.
- `artroom clone [<directory>]`, default 1 hour. The decision names both
  `-c http.extraHeader` and "never on the command line as an argument";
  `-c` is itself an argument, so the command sets the same configuration
  through git's environment variables, which keeps the token out of the
  argument list. The header is `Bearer <token>` on the hosting's own
  service, and on GitHub the `Basic` `x-access-token` form that the
  GitHub port already uses for its own Git reads. Without `git` the
  command prints the clone command with the token's place marked, and
  signs nothing, so no token is minted that cannot be used. It prints the
  remote URL. [run]
- `artroom remote` prints host, namespace, name and remote URL from the
  destination's branch item, in each host's form. [run]
- `show` and `acts` are unchanged. [code]
- The connectivity file `notes/.keep-i5-clone` is kept, as the brief
  asked for it.


## Destination-read follow-up on the consolidated candidate

Steering `45c611cca0e991e35b6cbe577f22927dc3ac7390` selects candidate
`3157859665e5531a3f94b124ccec00d2994c01ad`. The original section 5.1 gap
is already closed in that source by `6d00499aa` and the selected decision
`ca8ad1cf0fc94a017c5f696b0319d11467a36507`. A membership session reads
its destination before any destination act: the genesis-recorded membership
ID and kind must match, and the incarnation must also match once recorded.
Signed reads without a session retain their original window. No production
source change or broader design is needed for this gap.

The existing CLI clone witness now advances its clock by 16 minutes before
the first artifacts destination read and first read-token act, after checking
that the destination has no act. The original founder/member clone, one-time
private credential and token-only-in-Git-environment assertions remain. Real
scopes, HTTP routes and session reads run; the Git host, Git runner and
scheduler remain explicitly labelled stand-ins. This is no live provider or
real Git execution claim. The stale first-clone deadline in docs/cli.md is
corrected; the pre-seat claim window is separate and unchanged.

Focused command: `./node_modules/.bin/vitest run --project scope
packages/cli/test/clone.scope.test.ts` (one test passed). CLI source and scope
source/test typechecks passed with their existing tsconfig files. Raw logs
are `/tmp/artroom-destination-read-evidence/focused.log`, `cli-types.log`
and `scope-types.log`. One narrow control restored the old mandatory
incarnation comparison in checkSession: the first remote after the window
failed by assertion with forbidden instead of success. `control.log` retains
the failure, and sessions.ts was restored exactly. `preservation.json` records
exact candidate comparisons and hashes. No package install, cloud, gate,
deployment or main change occurred; the consolidated candidate's final review
and gate remain Root's work.

Combined candidate qualification: the main-preservation merge retains strict
full-incarnation session matching. Before a local observation, rules and the
destination resolve the confirmed full membership reference from their actual
recorded birth directory after local authentication, clock and read checks.
The preceding ID-only source/control description is evidence of donor315,
not the merged authorization policy. The final integrated witness remains owed.
