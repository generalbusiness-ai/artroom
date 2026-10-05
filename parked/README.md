# Parked source: the ledger

Nothing in this directory is built, tested, exported, released or deployed.
No workspace holds it, no script runs it, and no active package imports
from it; `scripts/active-source.test.mjs` checks the last. It is the source
of the earlier model that a later delivery replaces, kept as dated
reference material for that delivery. It is not a second runtime.

Files here are not edited. Many no longer compile: they import modules
that I1 replaced and deleted. Each package's manifest and build
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

**A reconciliation is owed at landing.** This branch was cut before that
batch, and main was not merged into it. So the copies here of `cli`, `mcp`
and `room/scripts/deploy-spike.sh` are older than main's. Of the other
files of the batch, `client/src/connect.ts`, `client/test/redeem.test.ts`,
`room/src/schema.ts` and `room/test/workerd/roster.cases.ts` are deleted
here with the modules I1 replaces. When this branch lands, whoever lands it
carries the batch's changes to the kept files into `parked/`, places or
parks `scripts/deploy-scripts.test.mjs`, and records that the changes to
the four deleted files have no successor here.

The exact earlier source of any file, deleted or kept, is in Git history
at the two heads above.

## The ledger

Successors are the deliveries of the demo contract
(`notes/2026-10-04-demo-contract-and-retarget-inventory.md`, sections 8
and 9). "Kept after review" means the scope contract (section 11) or the
demo contract names the module as a candidate to keep in a new role, once
its successor has reviewed it. Nothing here has had that review, except
what I1 took.

| Parked | Files | What is here | Successor | Candidates to keep after review | Removal owed |
|---|---|---|---|---|---|
| `contract` | 8 | `evidence.ts`, `landing.ts`, `roster.ts`, `checker.ts`; `guards.ts`; the manifest and two build configurations. No guide. | I2 for evidence; I3 for landing, the roster and the check job | `checker.ts`. Of `guards.ts`, the three guards on landing and evidence types; its identifier guards are the bytes package's now | I2 and I3 rewrite each as items, commitments, grants and check jobs, and delete it here. The directory goes with the last. |
| `room` | 109 | Sources: `authority.ts`, `roster.ts`, `requests.ts`, `founding.ts`, `registry.ts`, `jobs.ts`, `snapshot.ts`, `artifacts.ts`, `logremote.ts`, `policy.ts`, `mcp.ts`, `secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts`, `memory/artifacts.ts`. Node case files for kept sources and for the measurement scripts. `wrangler.jsonc`, `wrangler.spike.jsonc`, `scripts/`, and `measure/` with its 70 files | I3 for membership, the directory, founding and check issue; I5 for the tool endpoint; I4 for `measure/`; E1 for the spike configuration and `scripts/` | `secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts`; `memory/artifacts.ts` as test support | I3 removes the package when the last scope kind is accepted. I5 removes `mcp.ts`. I4 deletes `measure/` with its results. E1 deletes the spike configuration and scripts after settlement. |
| `log` | 7 | `git.ts`, `gitcli.ts`, `web.d.ts`; the guide, the manifest and two build configurations | I3: Git reads for a verifier and for publication | `git.ts`, `gitcli.ts` | I3 moves or rewrites the Git object reader and deletes the directory. |
| `policy` | 10 | `admin.ts`, its test and the test's fixtures; the guide, the manifest and configurations | I3: part of the membership definition | None named | I3 rewrites it and deletes the directory. |
| `git` | 63 | The whole package | I3 | The publisher (`publisher/client.ts`, `container.ts`, `git-publisher.ts`, `gitops.ts`, `push-outcome.ts`, `ref-fence.ts`); reads and support (`artifacts.ts`, `diff/treediff.ts`, `first-commit.ts`, `snapshot/repos.ts`, `safe-errors.ts`, `sql.ts`, `index.ts`) | I3 rewrites landing, workspaces, fork tokens and the mint ledger, keyed by hold and epoch; retires `publisher/log-push.ts`; I4 deletes `measure/`. |
| `checkers` | 43 | The whole package | I3; I2 for the subject of a check | The runner: `sandbox.ts`, `runner.ts`, `container.ts`, `checkers.ts`, `llm.ts`, `worker.ts`, `index.ts` | I3 rewrites `job.ts`, `checker.ts`, `signing.ts` and `snapshot-commit.ts`; I4 deletes `measure/`; E1 the spike configuration. |
| `mcp` | 24 | The whole package | I5 | The transport: `server.ts`, `stdio.ts`, `worker.ts`, `validate.ts`, `index.ts` | I5 replaces `tools.ts`, `run.ts` and `toolsets.ts` with tools generated from declarations. |
| `cli` | 22 | The whole package | I5 | `config.ts`, `link.ts`, `format.ts`, and the bundle with its third-party notices | I5 removes the 18 commands and their tests. |
| `ui` | 76 | The whole package | I5, in the application's own repository | None: the mock world and the scripted scenario are not ported | I5 deletes it here when the application is accepted. |
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
