# Credential cleanup handoffs

Focused read-only audit under gitseq request `c01205f5d967ccef69319549dd1734b3e108a8b0`, with promise `51ef2bd2a3829800872ccd25f072cbe28dc961f1`. Started at approved main `72d6abde5c6dfa993ac441884e8f966a903b932f`; reconciled to `bd520fb926f8161a722c6f1e23ae4aac29e41a66` after the separately reviewed A7 landing. That landing's tree equals approved head `84e25a78883e03f7accf1a18d66d8866eea94195`. The Git paths below are unchanged; Room founding line references were refreshed.

The improve skill supplied the handoff format. Four verified fixes were selected under the user's standing autonomous checker instruction. Priorities and effort estimates set review order only. They do not cut scope. Source code was not changed by this audit. These plans have not been implemented or approved for landing.

| Order | Plan | Impact | Effort | Fix risk | Confidence | Status |
|---|---|---|---|---|---|---|
| 1 | [001: Complete token inventories](001-complete-token-inventories.md) | Prevent premature workspace grants and writable “ready” snapshots under incomplete provider replies | M | MED | HIGH | TODO |
| 2 | [002: Unknown fork effects](002-retain-unknown-fork-effects.md) | Preserve late-create cleanup through foreign occupancy | M | LOW | HIGH | TODO |
| 3 | [003: Terminal publication cleanup](003-retry-terminal-publication-tokens.md) | Retry known credential revocation after a successful landing | M | MED | HIGH | TODO |
| 4 | [004: Founding wake](004-persist-founding-wake.md) | Recover first remote founding effects after host interruption | M | MED | HIGH, static path | TODO |

Plans 001 and 002 touch the same workspace cleanup function; serialize their edits or explicitly reconcile the second head. Plan 004 also touches workspaces.ts and should follow that reconciliation. Plan 003 can proceed independently. Every executor must use a gitseq request/promise, preserve unrelated work, run the stated gates and deliver all artifacts at one exact head for checker review.

## Evidence and limits

Parent read every cited production path and test pattern. Read-only synthetic provider controls using actual exported Workspaces/SnapshotRepos classes and in-memory SQLite reproduced incomplete inventory acceptance and unknown-duty closure on foreign provenance. They do not establish live provider behavior. Terminal revocation and founding interruption were verified by source control-flow analysis; their plans require meaningful regression tests, including actual DO recovery for founding. No new whole-repository gates, live inference, deployments, remote deletions or credential creation were run as part of the audit. A7's separate exact-head review ran its own gates and fault controls; those are not claimed as audit repros.

## Canonical mint ownership: contract handoff still needed

`packages/git/src/artifacts.ts:110,115` and `publisher/client.ts:84` retry non-idempotent canonical token creation after potentially applied internal errors (see artifacts.ts:60–68). `packages/room/src/logremote.ts:45` mints before its finally block. A lost answer can leave an unnamed token outside a cleanup owner's records; a usable publication answer can also be lost between mint and durable pushToken recording at landing/engine.ts:266–267. The ownership loss is evidenced, but a safe complete recovery design needs a contract decision: canonical inventories do not identify an owner and contain concurrent unrelated tokens. Do not turn this into a blanket revoke-all plan. Request explicit ownership of that design and its implementing lanes. Known tokens need durable handoffs; unknown effects need honest observation/retention or a documented provider completion fence. No unauthorized access or credential disclosure is claimed. Measured 60-second publication and longer pin token TTLs remain adopted behavior.

## Considered and excluded

- Room A6 known-token handoff loss: already owned by implementation request `23b96a18f1cb21e521ed0aa44e4b6cb686644d07`, fixed and independently approved in A7 review `b611030c8a060e6c27d3eedb6e18619489f7e8cb`; do not duplicate it.
- Cleanup attention/read projection: already owned by `c0f0592f3c919ce3be248f73c51dcb7e25d75f07`; the correctness plans must preserve that handoff.
- Unsigned checker jobs: trusted bound producers under adopted R-EXEC-8, with new authority design request `f12cef6bae7bf4c3813241df0624199568f14ddf`; not reported as a current vulnerability.
- Harness canonical token sweeps: development-only code, not production cleanup.
- False revoke results: may mean already revoked or absent; not automatically evidence of a live credential.
- Snapshot legacy unknown creates and founding legacy adoption: existing indefinite debt and durable incarnation handling credited; no duplicate defect.
- An unawaited setAlarm alone: insufficient to claim a crash bug without the Workers storage/output-gate contract. Plan 004's evidenced issue is absence of any wake before the first founding create.
- Provider TTLs, normal CAS/complete-forward behavior and expired credentials: do not change them or treat expiry as proof a push did not land.
- Broad performance, dependencies, UI, general auth review and unrelated roadmap features were outside this focused audit. No direction features were ranked against correctness fixes.

Status values: TODO, IN PROGRESS, DONE (with reviewed exact head and receipt), BLOCKED (with reason), REJECTED (with evidence of independent fix or invalid assumption).
