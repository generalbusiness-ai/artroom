# Stage 2 bounded independent baseline at 35797

All requested selected baselines passed at exact `35797f844b55fea9439ac852451fd062c5177b73`, after the full root source/test typecheck passed. No genuine named assertion defect was observed. This is a compiling unchanged-head baseline under original request `fd6f00b612d68c035cbdbc3f27ebe3c21500f079`; it is not a mutation result or satisfaction of any complete stage condition.

The new private detached checkout is `/tmp/artroom-checker-stage2-35797-OdtWKz`. Evidence is `/tmp/artroom-checker-stage2-35797-evidence-c9ICmd`. The prior independently verified 9aa source preflight / cf933a58 was preserved unchanged. I read the entire 9aa→35797 delta: an audit2 import replacement and 34 test lines, with no production source change. I also read the actual call/failure, signed, activate and restarted helpers. The two added no-text-form tests use the JSON value `{toString: 1}`; exact retry after v2→v1 remains admitted, malformed actor/idempotency/kind values are bad-request, and the valid bearer control is admitted. Both named tests passed in the full audit2 baseline.

## Compiling prerequisite and actual runs

`npm ci` exited 0 in this checkout only. The full root command `npm run typecheck` exited 0 at `2026-10-03T22:04:54.461598Z`, checking every workspace's configured source/tests, including Room source/test compilation. Every semantic run started later. Complete compiler/install logs and each exact argv, cwd, environment override, exit and UTC start/end are preserved; `exact-commands-times.tsv` is the compact command/time index. No source or test repair was needed.

| Run / exact selected files | Passed | Failed | Not selected/skipped | Config |
| --- | ---: | ---: | ---: | --- |
| checker declared-guards-f | 3 | 0 | 0 | checkers/vitest.config.ts |
| policy declared-guards-e | 27 | 0 | 0 | policy/vitest.config.ts |
| Room node declared-guards-a / b / e | 54 / 76 / 3 | 0 | 0 | room/vitest.node.config.ts |
| policy declared-guards-e, additional workerd run | 27 | 0 | 0 | policy/vitest.workers.config.ts |
| Room workerd declared-guards-c / d / e / f | 42 / 18 / 31 / 24 | 0 | 0 | room/vitest.workers.config.ts |
| Complete Room workerd declared-audit2-fd6f00b6 | 35 | 0 | 0 | room/vitest.workers.config.ts |
| Original declared-fd6f00b6, only name pattern `migration 4` | 4 | 0 | 49 | room/vitest.workers.config.ts |

All six Vitest invocations exited 0 and their fresh raw JSON reports success. All nine new guard files plus the complete audit2 file passed 313 tests in the primary selected configurations. The additional policy workerd run repeats its 27 test names. The migration selection adds four passes, for **344 passing test executions / 317 distinct qualified test names**, zero failures, and **49 migration-file nonselections**. This count is not a field/guard coverage denominator. JSON numTotalTestSuites includes describe blocks; actual file/status arrays are indexed separately.

The four executed migration names are the stored-version 1, 2 and 3 reopen controls and migration-4 idempotence. They retain actual abort/reopen, exact migrated rows, legacy renewal and another reopen. The remaining 49 original-file cases are reported as skipped solely because the focused name filter did not select them. They are neither completed baseline cases nor evidence of a configured declared-run exclusion. `migration-nonselected.json` preserves their exact names/statuses.

## Exposure and scope limits

Checker F, policy E and Room node A/B/E validate their source/helper boundaries; they do not themselves perform authenticated Room admission or compose a real checker service with a Room. Policy E was run in both its actual Node and workerd configurations. The workerd C/D/E/F and complete audit2 runs use real Room Durable Objects and SQLite with the existing local fake services/remotes. Their own envelope signing is used; no provider, deployment, account or credential operation occurred.

The new workerd suites deliberately use ordinary `vitest.workers.config.ts`: each founds its own v1/v2 rooms and `describe.skipIf(DECLARED)` is inactive. They would be skipped by the converted declared configuration; that converted configuration was not run or credited here. Direct activation controls go through core/SQL and do not test proposal/landing seams. The earlier helper/export, private unreachable-arm, boxed-string, duplicate-kind, signedAs precondition and compound-factor distinctions remain as mapped by the unchanged 9aa source preflight. An unchanged baseline does not establish that removing any given guard turns a meaningful named assertion red.

All seven original fd6 conditions remain open for complete frozen compile-first mutation evidence and final exact-head review. Stage 4 still owns full hand-over and sent-job ending/reissue at activation; the partial stage-2 retry machinery and helper tests do not waive those outcomes or add a new jam gate. No mutants or broad unrelated runtime suites were run, and no full-stage approval is claimed.

## Preserved evidence and source integrity

Every runtime command produced both a complete raw log and a fresh actual Vitest JSON file; no JSON was reconstructed or edited. `actual-test-names.json` / `.tsv` preserve all actual qualified names, statuses, durations and failures (none). `actual-results-summary.json` checks each semantic start against the completed compiler gate. Per-file paths were normalized using filesystem realpath (`/tmp` resolves to `/private/tmp`), never substring replacement.

`exact-source.tar` freezes the whole tracked source at the exact commit. `exact-dependencies.tar.gz` freezes all nine root/nested node_modules trees, including installed package/lock/runtime-cache bytes and symlink targets. The archive was independently read back and matched against **20,231** entries in `dependency-byte-index.json`. Node v26.10.0, npm 11.19.1 and actual Vitest 4.1.11 are recorded. The 53 generated ignored files outside node_modules are frozen separately in `generated-build-artifacts.tar`; no generated images were found. The whole manifest hashes every delivered artifact, including those archives.

Initial and final all-tracked proofs both have the exact head, `git diff --quiet HEAD` exit 0 and empty `git status --porcelain=v1`. No tracked source/test was edited, so no restoration operation was necessary. Tracked object IDs are retained in proof files without printing their large field. A private evidence-packaging setup initially failed on an undefined path variable and then a missing script; its complete diagnostics were preserved and its private script corrected. Those packaging errors occurred after all semantic runs, changed no project source/tests, and do not count as compiler/assertion failures. The completed archive freeze exited 0.
