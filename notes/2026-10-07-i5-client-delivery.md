# I5 client: the artroom command for the new model (gate 3 of plan 024)

Branch `request/i5-client`, opened from `origin/main` at `9b753bf`.
Written 2026-10-07 by a cloud builder with no workroom, no deployment
credentials and no network beyond GitHub and the npm registry. No
request is filed for this work yet: the local colleague files it with
gitseq and the review.

Each claim is labelled: **[code]** read from code, **[run]** confirmed
by a run in this container, **[inferred]** not run or read directly.

## 1. What is built

`packages/cli` is new. The old model's command line is under
`parked/cli`; it was read for the shape of its output only, and is not
touched. No `packages/cli` existed on main. [code]

| Command | Function | What it does |
|---|---|---|
| `artroom install <base-url>` | `install` | Founds the register with an `install` intent signed by a new operator key, which is also the one founder key (`policy: keys`). Keeps the key; prints the register's scope ID. |
| `artroom claim <name>` | `claim` | Signs the register's `found`. Computes the directory's ID from the claim's own intent, as the register's `directorySeed` does. Waits until the directory, membership, rules scope and destination are `active`, then takes the founder's `seat` and `first-key` and waits for the founder's inbox. Prints the four IDs and the inbox. |
| `artroom invite <@member> --role <role>` | `invite` | Membership's `invite-member`, with the digest of a new invitation secret. Prints a link holding the invitation's number and secret. |
| `artroom join <link>` | `join` | Membership's `join`, signed by a new key kept locally. Waits for the inbox that the join creates; prints it. |
| `artroom acts [<scope>]` | `acts` | The definition's acts whose grant action the caller's role holds now (role and roster read from membership's summary), and every act a rule decides, each with its fields and one line made from its step, item and grant. |
| `artroom act <kind> --on <scope> [--target n] [--set k=v ...]` | `act` | One act. A declared definition's act goes through the client's `declaredHandle`; a platform definition's is signed with `signedIntent`. Fills `expected` from the summary. Prints the entry and its hash, or the refusal with its reason and guard name, and exits 1. |
| `artroom log <scope> [--limit n]`, `artroom show <scope>:<seq>` | `log`, `show` | The history and one entry over the read routes. |
| `artroom verify <scope>` | `verify` | The replay verifier (`verify` with `httpSource`) with the platform package's rules and `grants: "proven"`; prints the report as `render` gives it. |

All of the above is [code]. Keys are 32-byte Ed25519 secrets for the
client's `secretSigner`, in `keys/<name>.key` under `$ARTROOM_HOME`,
`$XDG_CONFIG_HOME/artroom` or `~/.config/artroom`, directory 0700,
files 0600, never replaced and never printed. [code]

Tests, by title:

- `packages/cli/test/story.scope.test.ts`, "install, claim, invite and
  join over the Worker's routes; acts lists what the role holds; one act
  takes effect and one is refused by name with nothing written; log, show
  and verify read the histories back". Every command goes through
  `route`, the Worker's HTTP routes over the namespace `PLATFORM`: the
  deployed class, the production authority and the platform package's
  rules. It checks: the IDs `claim` prints are the ones the directory's
  repository item records, and all five scopes and the inbox are
  `active`; `join` makes una's member and key `active`; no printed line
  holds any of the three secrets; `acts` for a member lists `open-issue`,
  `open-pr` and `open-task` and hides `retry-import`; `add-member` by the
  admin takes effect at the entry the command names; `open-issue` by una
  is refused `guard-failed (not-activated)` and the directory's head does
  not move; with una's real read session `log` and `show` read
  membership and `log` of the register is `forbidden`; `verify` of
  membership under the session is `missing dependency` on the register;
  with the test readers all six histories verify `consistent`. [run]
- `packages/cli/test/files.test.ts`, "install keeps its operator key
  owner-only under the config directory, refuses to replace it, and
  prints only the key's ID; a refused founding is printed with its
  reason". [run]

One control, by hand, because `scripts/control.mjs` cannot select a root
project: in `answered`, a refusal returned exit 0 instead of 1. The story
failed at the refusal's assertion (`expected { code: +0, ...} to deeply
equal { code: 1, ...}`); the file was restored. [run]

Other changes: the root `vitest.config.ts` runs
`packages/cli/test/*.scope.test.ts` inside the `scope` project and adds a
`cli` project; `docs/testing.md` says so; `docs/cli.md` is new;
`package-lock.json` gains only the workspace link, in its own commit;
`scripts/active-source.test.mjs` lets `cli` name the platform package
(section 6). [code]

## 2. Stand-ins and limits

- **The Git host**: `OutsideDouble` of `packages/scope/test/outside.ts`,
  wired as the register's outside port after `install`. It answers the one
  creation request with "confirmed" under the attempt's own name. No
  repository is created. The destination's host operations are not
  driven. [code, run]
- **The scheduler**: while a command waits, the test's `pause` runs the
  register's operations driver and the dispatchers of the scopes waited
  on, in place of a deployment's alarms. The command's default pause is
  one second, up to 120 reads. [code]
- **The clock**: the scripted clock of the namespaces; the command signs
  by it through `Context.now`. [code]
- **The readers**: the test readers, which let every reader read, except
  for the `log`, `show` and session `verify` steps, which use the real
  read sessions under a test secret. [code, run]
- **The store**: `memoryStore`, one per person, stands for the config
  directory in the story. The file store is tested in Node. [code]
- **Who may install**: nothing checks it; that is the installation
  design's. [code]
- No check runner or lane is involved: the story needs neither. [code]
- The command has run only against the test Worker. Nothing is deployed
  and nothing is published. [run]

## 3. How to run it against a deployment, once one exists

Only the base URL and the operator key are needed. [code; not run
against a deployment]

```
export ARTROOM_HOME=~/.config/artroom-demo
# Optional: an operator key you already hold, as the 32-byte secret in unpadded base64url, mode 0600.
#   mkdir -p -m 700 $ARTROOM_HOME/keys && (umask 077; echo '<secret>' > $ARTROOM_HOME/keys/operator.key)
# Without it, install makes one.
packages/cli/bin/artroom.js install https://<worker-host> --host github.com --namespace <org>
packages/cli/bin/artroom.js claim demo --handle @you
packages/cli/bin/artroom.js invite @someone --role member
packages/cli/bin/artroom.js acts directory
packages/cli/bin/artroom.js verify membership
```

The member runs `join <link>` with their own `ARTROOM_HOME`. Section 5,
items 1 and 2, say what will block `claim` and `verify` on a deployment
that issues read sessions. [inferred]

## 4. Gate

Command: `npm run gate`, once, at head `5c3a84c` (tree `9905b706`), on a
4-core container, load average about 0.3 before the run. `install` ran
because no install stamp existed; it was the second `npm ci` of the
session, so the npm cache was warm. [run]

| Step | Exit | Elapsed s | CPU s |
|---|---|---|---|
| install | 0 | 4.5 | 5.8 |
| whitespace | 0 | 0.0 | 0.0 |
| typecheck | 0 | 10.6 | 33.4 |
| test | 1 | 52.6 | 89.9 |

vitest: 88 files, 87 passed, 1 failed; 724 tests, 723 passed, 1 failed;
duration 49.97 s. **The gate failed.** [run]

- The one failure is `packages/checkers/test/runner.test.ts`, T36. It
  fails the same way on `origin/main` in this container. This container
  has git 2.43.0, which refuses the runner's
  `checkout -q --detach --end-of-options <commit> --` with "fatal: only
  one reference expected, 2 given" (reproduced by hand). This branch
  changes nothing in `checkers` or `git`. [run]
- Because `vitest run` failed, the gate did not reach
  `scripts/active-source.test.mjs`. Run alone at the same head: 6 pass,
  0 fail. [run]
- The `scope` project's output also shows an uncaught workerd error,
  "Cannot perform I/O on behalf of a different Durable Object ... (I/O
  type: RefcountedCanceler)", from vitest's timeout abort. No test failed
  with it. The story file run alone does not produce it. Its source is
  not traced, and the whole suite was not run again to trace it. [run]

This note was added after the gate, and changes only documents: the
source and tests are unchanged from tree `9905b706`.

## 5. What is owed

1. **Reads before a session exists (blocks `claim` on a deployment).**
   `claim` reads the register's summary for the `found` act's `expected`,
   and the new directory's summary and genesis to find its children. On
   the deployed class "A reader that presents none is answered
   `forbidden`" (`packages/scope/src/worker.ts`, header), and "The readers
   port accepts a session only for the membership scope that the scope
   itself records" (`sessionWiring`). The register records none, and
   membership's ID is known only from the directory. Observed under real
   sessions: `Cannot read the history of <register>: forbidden.` [code,
   run for the register; inferred for the whole claim] No route was
   invented. A design decision is owed: what may read a register, and how
   a founder learns membership before holding a session.
2. **`verify` under a session.** The register's history cannot be read,
   so `verify membership` reports "missing dependency: a source history
   could not be read" naming the register's entry 2. [run]
3. **`invite --acts`.** Refused with exit 2: `invite-member` has the
   fields `handle`, `role`, `inviteHash` and `inviteEnds`, and no list of
   acts for one member (`packages/platform/src/membership.ts`). [code,
   run]
4. **`claim <name>`.** The register's `found` has the fields `branch`,
   `founderHandle`, `recoveryKey` and `import`; the name at the host is
   `repositoryName(seed, attempt)`. The name is printed only. [code]
5. **Act descriptions.** `DeclaredDefinition` and the platform data have
   no description member (`packages/contract/src/definition.ts`), so the
   one line is made from step, item and grant. [code]
6. **The lanes' acts** arrive with `request/i5-lane-wiring`. The
   directory refuses `open-issue` as `not-activated` until the rules
   scope activates a lane definition. `verify` passes no capability code,
   so a lane scope whose definition needs `hold@1` would replay as
   `unsupported-definition`. [run for the refusal; inferred for verify]
7. **Retry.** On a lost reply the command prints the transport's message
   but does not keep the signed intent; running the command again signs a
   new intent. [code]
8. **Platform acts are not shape-checked before signing.** The declared
   handle takes a `DeclaredDefinition`, and a platform field may be a
   mark; the scope checks every field. [code]
9. **T36 and the workerd message** of section 4. [run]
10. **The gitseq request** for this work, and the review. Not available
    here. Also `notes/.keep-i5-client`, the empty file from the push
    check, can be removed when the work lands.

## 6. Decisions followed

- The command chooses no binding and judges no guard. It reads revisions
  and the caller's role, and the scope checks both again. A refusal
  prints its reason (and guard name, when the answer carries one), exits
  1 and writes nothing; the test shows the head did not move. [code, run]
- Nothing is deployed and nothing is published; `packages/cli` is
  `private`. [code]
- Plain English; "takes effect" in output and documents; no product
  names but GitHub. [code]
- No route was invented; each gap is item 1 to 8 of section 5.
- `packages/lanes` and `packages/platform` are not edited, and nothing
  off main is used. [code]
- **For the reviewer's decision:** `scripts/active-source.test.mjs` now
  lets `packages/cli` name the platform package. No scope retains a
  platform definition's declaration for a client to read, and the
  verifier needs the platform's rules. [code]
- **For the reviewer's decision:** the invitation link holds the
  invitation's secret and is printed once, because `join <link>` takes it
  as text. No signing key is ever printed. [code, run]
- `claim` also takes the founder's seat and first key, so that `invite`
  has an admin to sign it. [code]
- Commits are small and each was pushed.
