# Parked source: the ledger

Nothing in this directory is built, tested, exported, released or deployed.
No workspace holds it, no script runs it, and no active package imports
from it; `scripts/active-source.test.mjs` checks the last. It is the source
of the earlier model that a later delivery replaces, kept as dated
reference material for that delivery. It is not a second runtime.

Files here are not edited. Many no longer compile: they import modules
that I1 replaced and deleted, or the one file that I2 replaced and deleted. Each package's manifest and build
configuration are kept as they were, and so name entry points, scripts and
dependencies that no longer exist.

The deployed spike and the packed release are the earlier product's. This
directory neither runs them nor retires them. They stay until a separately
authorized retirement (E1 in the demo contract).

## Where this source comes from

| | |
|---|---|
| Last head at which every package built and its tests passed | main `b6a9c0b62d82d9ccc4a9fc6570117ae848c33262` |
| Head this branch was cut from | main `4a7a13a11313e7c26a21e5735d3d1c0df269b291`, which differs from `b6a9c0b6` by two notes and no source |
| What main changed afterwards | The review fix batch, landed as `b2a0bb12dc3900b1cc71e5884683f0e121c6af66`. Read with `git diff --stat b6a9c0b6 origin/main -- packages scripts`: 13 files, 93 insertions and 15 deletions |

The 13 files of that batch, by package: `packages/cli` (`README.md`,
`src/git.ts`, `src/main.ts`, one test snapshot); `packages/client`
(`src/connect.ts`, `test/redeem.test.ts`); `packages/mcp` (`src/tools.ts`,
`test/schema.test.ts`, `test/stage0.test.ts`); `packages/room`
(`scripts/deploy-spike.sh`, `src/schema.ts`, `test/workerd/roster.cases.ts`);
and one new script, `scripts/deploy-scripts.test.mjs`.

**The reconciliation was made on this branch.** Main at
`b2a0bb12dc3900b1cc71e5884683f0e121c6af66` was merged into it. The batch's
changes to the kept files are carried into `parked/` as main made them:
`cli` (`README.md`, `src/git.ts`, `src/main.ts`, one test snapshot), `mcp`
(`src/tools.ts`, `test/schema.test.ts`, `test/stage0.test.ts`) and
`room/scripts/deploy-spike.sh`. Those are main's changes, not edits made
here. Four files of the batch are deleted here with the modules I1 replaces,
so their changes have no successor in this tree: `client/src/connect.ts`,
`client/test/redeem.test.ts`, `room/src/schema.ts` and
`room/test/workerd/roster.cases.ts`. The batch's script check is parked,
unedited, at `parked/scripts/deploy-scripts.test.mjs`: it reads deploy
scripts under `packages/`, and none is active now. No command runs it.

The exact earlier source of any file, deleted or kept, is in Git history
at the two heads above.

## The ledger

Successors are the deliveries of the demo contract
(`notes/2026-10-04-demo-contract-and-retarget-inventory.md`, sections 8
and 9; revision 4 is at `3b6e1ad7`, on its own branch, and the note is not
in this tree). "Kept after review" means the scope contract (section 11) or the
demo contract names the module as a candidate to keep in a new role, once
its successor has reviewed it. Nothing here has had that review, except
what I1 took. "What I2 replaced", below, says where each row stands after
I2.

| Parked | Files | What is here | Successor | Candidates to keep after review | Removal owed |
|---|---|---|---|---|---|
| `contract` | 7 | `landing.ts`, `roster.ts`, `checker.ts`; `guards.ts`; the manifest and two build configurations. No guide. `evidence.ts` was here: I2 replaced it and deleted it. | I3 for landing, the roster and the check job | `checker.ts`. Of `guards.ts`, the three guards on landing and evidence types; its identifier guards are the bytes package's now | I3 rewrites each as items, commitments, grants and check jobs, and deletes it here. The directory goes with the last. `checker.ts` imports the type `CheckInput` from the deleted `evidence.ts`, and `guards.ts` imports `Evidence` and `Carried`. Neither file is edited. |
| `room` | 109 | Sources: `authority.ts`, `roster.ts`, `requests.ts`, `founding.ts`, `registry.ts`, `jobs.ts`, `snapshot.ts`, `artifacts.ts`, `logremote.ts`, `policy.ts`, `mcp.ts`, `secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts`, `memory/artifacts.ts`. Node case files for kept sources and for the measurement scripts. `wrangler.jsonc`, `wrangler.spike.jsonc`, `scripts/`, and `measure/` with its 70 files | I3 for membership, the directory, founding and check issue; I5 for the tool endpoint; I4 for `measure/`; E1 for the spike configuration and `scripts/` | `secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts`; `memory/artifacts.ts` as test support | I3 removes the package when the last scope kind is accepted. I5 removes `mcp.ts`. I4 deletes `measure/` with its results. E1 deletes the spike configuration and scripts after settlement. |
| `log` | 0 | Nothing. I3 removed the directory at its step 17: "What I3 removed", below. | `packages/git` | None left | Done. |
| `policy` | 10 | `admin.ts`, its test and the test's fixtures; the guide, the manifest and configurations | I3: part of the membership definition | None named | I3 rewrites it and deletes the directory. |
| `git` | 63 | The whole package | I3 | The publisher (`publisher/client.ts`, `container.ts`, `git-publisher.ts`, `gitops.ts`, `push-outcome.ts`, `ref-fence.ts`); reads and support (`artifacts.ts`, `diff/treediff.ts`, `first-commit.ts`, `snapshot/repos.ts`, `safe-errors.ts`, `sql.ts`, `index.ts`) | I3 rewrites landing, workspaces, fork tokens and the mint ledger, keyed by hold and epoch; retires `publisher/log-push.ts`; I4 deletes `measure/`. |
| `checkers` | 43 | The whole package | I3. I2 delivered the subject of a check, as data: the `job` item type of the `change` definition. Nothing here was removed for it. | The runner: `sandbox.ts`, `runner.ts`, `container.ts`, `checkers.ts`, `llm.ts`, `worker.ts`, `index.ts` | I3 rewrites `job.ts`, `checker.ts`, `signing.ts` and `snapshot-commit.ts`; I4 deletes `measure/`; E1 the spike configuration. |
| `mcp` | 24 | The whole package | I5 | The transport: `server.ts`, `stdio.ts`, `worker.ts`, `validate.ts`, `index.ts` | I5 replaces `tools.ts`, `run.ts` and `toolsets.ts` with tools generated from declarations. |
| `cli` | 22 | The whole package | I5 | `config.ts`, `link.ts`, `format.ts`, and the bundle with its third-party notices | I5 removes the 18 commands and their tests. |
| `ui` | 76 | The whole package | I5, in the application's own repository | None: the mock world and the scripted scenario are not ported | I5 deletes it here when the application is accepted. The row stays open until I5 lands. The three files of the generation history are among the 76 and stay: the planner decided that I2 deletes none of them. |
| `release` | 18 | `pack-release.mjs`, `check-release.mjs`, `release-lib.mjs`, `release-manifest.test.mjs`; `consumer/`; `third-party/` with the licence records | I6: the released set is listed again when the new packages exist | The scripts' method; the licence records are regenerated | I6 rewrites the list and the scripts and deletes this directory. `docs/release.md` describes these and is marked inactive. |

## What I1 deleted

I1 delivers the scope substrate in `packages/` and deleted from here, at
the same time, every module it replaces, with its tests, fixtures, runner
configurations and result files.

| Package | Deleted | Replaced by |
|---|---|---|
| `contract` | `acts.ts`, `lanes.ts`, `legacy.ts`, `log.ts`, `policy.ts`, `ids.ts`, `envelope.ts`, `declarations.ts`, `transports.ts`, `index.ts`, `examples/`. And `errors.ts` and `pagination.ts`: their content, refusals as typed values and pages with cursors, is the new contract's `result.ts` and `read.ts`; what else they held named lanes, lease generations and the published log | `packages/contract`; `packages/contract/test/shapes.ts` |
| `room` | `core.ts`, `admission.ts`, `model.ts`, `store.ts`, `log.ts`, `ids.ts`, `declared.ts`, `obligations.ts`, `room.ts`, `worker.ts`, `http.ts`, `config.ts`, `ports.ts`, `reads.ts`, `schema.ts`, `index.ts`, and the copies `canonical.ts`, `crypto.ts`, `glob.ts`. Every workerd test, because each ran through the Room's object; the node cases of deleted modules; the two node runners that imported deleted cases; the workerd and declared runner configurations, `wrangler.test.jsonc`, `tsconfig.types.json` | `packages/scope`, `packages/bytes` |
| `log` | Everything but the Git object reader: `verify.ts`, `fold.ts`, `obligations.ts`, `roster.ts`, `declared.ts`, `calls.ts`, `decode.ts`, `entries.ts`, `layout.ts`, `tree.ts`, `publisher.ts`, `cli.ts`, `index.ts`, `canonical.ts`, `crypto.ts`, `time.ts`, `scripts/` with its results, every test and fixture | `packages/replay`, `packages/bytes` |
| `client` | The whole package | `packages/client` |
| `policy` | Everything but `admin.ts`: the validator, steps, vocabulary, binding, rules, carry, activation, explain, catalogue, the code-review declarations, the pack and helpers, and the evaluator, which `packages/derive/src/rule` holds after review | `packages/derive` |

Kept case files with no runner: `room/test/node/diag.cases.ts`,
`secrets.cases.ts`, `logremote.cases.ts` and `mint-sites-scan.cases.ts`
test kept sources, and the runner files that imported them are deleted.
`policy/test/admin.test.ts` is kept with its fixtures, which import deleted
modules.

## What I2 replaced

I2 delivers the two lane definitions, `issue` and `change`, as data in
`packages/lanes`, and the forms they use in the active packages. The demo
contract gives I2 some removals, in its sections 8 and 9.1 to 9.4. This
table reconciles each with this directory. It was made at `e7a38d4cb`, by
reading both texts, the tree and Git history.

"Moved and deleted by I1" means: commit `42873516c` moved the file from
`packages/` to `parked/`, and commit `8d898b323` deleted it there. Both are
in I1 as landed, `f1c456ce`. Read with
`git log --full-history --diff-filter=D -- <path>`.

| Item the demo contract gives to I2 | Section | State | Evidence |
|---|---|---|---|
| The code-review declarations, the policy pack and the helpers of `packages/policy`: `src/codereview.ts`, `src/pack.ts`, `src/helpers.ts` | 8; 9.1 | Deleted by I1. I2 removed nothing and restored nothing. | Moved and deleted by I1. `parked/policy/src` holds `admin.ts` only, which is I3's. |
| The exports `./helpers` and `./pack` of the earlier policy package | 9.3 | The modules are deleted by I1. The kept manifest, `parked/policy/package.json`, still names both entry points and is not edited. It goes with the directory, which is I3's. | The same two commits. The ledger's first section says that kept manifests name entry points that no longer exist. |
| The main entry of the earlier policy package, "158 names reassessed" (I1 and I2) | 9.3 | Deleted by I1: `src/index.ts` and every module but `admin.ts`. No active package exports those names for I2 to retire. | `parked/policy/src`. The evaluator is in `packages/derive/src/rule` after I1's review. |
| The declared-act stage flags in `packages/room/src/declared.ts` | 8 | Deleted by I1. | Moved and deleted by I1. |
| `packages/room/test/workerd/declared-run.test.ts` | 9.4 | Deleted by I1, with every workerd test of the Room. | Moved and deleted by I1. `parked/room/test` holds no `workerd` directory. |
| The pack and code-review tests of `packages/policy/test` | 9.4 | Deleted by I1: `pack.test.ts`, `helpers.test.ts`, `declared-acts.test.ts` and every other test but `admin.test.ts`. | Moved and deleted by I1. `parked/policy/test` holds `admin.test.ts`, `env.d.ts` and `support/fixtures.ts`. |
| `evidence.ts` of the earlier contract: review and check obligations, evidence "reviewed here" or "carried", and the input of a check | 9.1; this ledger gave it to I2 | Replaced by I2, and deleted here by I2. It is the only file that I2 deleted from this directory. | The item types `review`, `job` and `result` of `change`, with the `rules` item that holds the required approvals and checks (`packages/lanes/src/change.ts`). A review and a job each name one manifest in a fixed slot. A job holds its tree and its configuration, and a result names one job. Both definitions pass the validator whole: `packages/lanes/test/definitions.test.ts`, the test whose name begins "validation". The earlier text is in Git history at `e7a38d4cb`. |
| The earlier client, "a typed handle to scopes" (I1 and I2) | 9.1; 9.3 | Nothing is parked: I1 deleted the whole package. I2 added the handle that is typed from a declared definition, in `packages/client/src/declared.ts`. | "What I1 deleted", above. |
| The subject of a check, in the earlier checkers package (I3 and I2) | 9.1 | Parked whole, and stays for I3. I2's part is delivered as data: the `job` item type. I3 rewrites `job.ts` and `checker.ts` against it. | `parked/checkers/src`, 11 files, unchanged. |
| The UI's generation history: `src/ui/ChangeHistory.tsx`, `src/room/changes.ts`, `test/change-history.test.tsx` | 8 | Parked, and stays for I5. The planner decided that I2 deletes none of the three. Manifest versions are the successor form, and they validate as data. The application that shows them is I5's. | The three files are in `parked/ui`. The `ui` row of the ledger stays open until I5 lands. |
| The earlier Room package, "removed when the last scope kind is accepted" (I1, I2 and I3) | 9.1; 9.3 | Not I2's to remove. I2's own part of it was `declared.ts`, above. The rest is I3's, I4's, I5's and E1's, as the `room` row says. | The `room` row. |

What I2 did not do here. It restored no deleted file. It added no adapter
between the earlier model and the new one. It removed nothing that the
ledger gives to I3, I4, I5, I6 or E1.

What still waits, and on whom, for the rows that name I2:

| Parked | Waits on | For |
|---|---|---|
| `contract`: `landing.ts`, `roster.ts`, `checker.ts`, `guards.ts` | I3 | Landing, the roster and the check job, as the `contract` row says. |
| `checkers` | I3 | The check job and its signing, rewritten against the `job` item. |
| `ui`, with the three files of the generation history | I5 | The application, in its own repository. |
| `policy`: `admin.ts` and the kept manifest with its `./helpers` and `./pack` entries | I3 | The membership definition. |

## What I3 removed

I3 removes each parked path in the step that makes its successor pass its
witness (`notes/2026-10-05-i3-implementation-plan.md`, section 6.1). Every
removal is bound to the plan's list of retained paths (its section 6.2):
the two spike configurations, `room/scripts/`, `room/src/mcp.ts`, every
`measure/` directory, and `.github/workflows/row-writes.yml`. No step
deletes, moves or reads the body of a path on that list.

| Step | Removed | Successor | The review, and what did not move | Checked against the retained paths |
|---|---|---|---|---|
| 17 | `log/`, whole: `src/git.ts`, `src/gitcli.ts`, `src/web.d.ts`, the guide, the manifest and two build configurations. 7 files. | `packages/git/src/names.ts`, `reader.ts`, `program.ts` | `notes/2026-10-05-i3-git-review.md`, section 2. No file moved as it was. The reader's parsers and its read of an object and a ref were written again against the review. The object writers, the log's push, the transfer in parts, the in-memory repository and `gitcli.ts` have no successor. | `log/` held no `measure/` directory and no other retained path. |

Parked files that imported what a step removed still name it, and are not
edited: after step 17, some sources and manifests of `room`, `git`,
`contract` and `ui` name the earlier log package.

## Outside this directory, and not active either

These were left untouched. Each is owned by a later delivery or by the
planner.

| Item | Owner |
|---|---|
| `docs/protocol.md`, `docs/policy-pack.md` | I6, section by section with I2, I3 and I5. Each is marked inactive in its first paragraph. |
| `docs/release.md` | I6. Marked inactive. |
| `examples/demo-repo` | I6. It holds a version 1 policy. |
| `spikes/pi-durable` | IA. `spikes/room-core` and `spikes/sandbox-git` are retired with no successor; their notes stay. |
| `.github/workflows/row-writes.yml` | I4 if a budget monitor is kept; otherwise it goes with E1. It probes the spike Worker. |
| `plans/`, with `plans/test-invariants.md` | The planner; the proof plan replaces the invariant map (I4). |
| `notes/` | History. Dated notes are not edited. |
