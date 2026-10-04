
## Connected browser coding stories

[005: Durable browser coding across devices](005-2026-10-03-browser-cloud-work.md),
dated 2026-10-03, is the frozen Draft 2 under planning request `b5f1fb3f`,
promise `28e63ebc`. It connects durable cloud coding, the complete browser
journey and same-member device continuity. It reconciles all six groups in
independent Draft 1 review `25065edf` / guarded verdict `c80ef89e`.
The exact revision was independently approved for commissioning in
`fc77cf82` (ratified `412c7bce`), then adopted as product direction
`0f358e52` (ratified `cfc2d66f`). Its workroom evidence artifact
`209a5ec9` names commit `a15aed52`, attachment
`2026-10-03-browser-cloud-work-draft2.md`, SHA256
`10b9d2650aeb774c0811cce51f213a432d7495fc3dad5899cb0ab1b38de6fecc`.
The saved note preserves those exact reviewed bytes; its draft label and
proposed-package table describe that frozen version.

The approval carries one explicit contract choice: raw private reads
initially require a direct owner/admin device session, with direct-key
provenance and current role/resource checked by the trusted Room boundary.
A returned member handle is insufficient. Delegation-issued read sessions
are denied raw resources by default; signed task controls remain separate.

All six self-contained implementation requests below are addressed to
builder. They inline the reviewed decisions, dependencies, acceptance and
bounded validation. Requests are not implementation completion. The
contract task also owns eventual repository integration of this saved
planning note and commissioning index through normal source review/landing.

| Work | Request | Dependency order |
|---|---|---|
| Authority and lifecycle contract, types and trusted Room boundary | `b538c5eace50a1de82a8bdf8a8f19764548af15e` | Reviewed design; reconcile acts/client and test workflow |
| Real coding recovery spike | `6cdaf20fa260d6d6c6b30e83f585883a51b964f4` | Relevant reviewed contract decisions |
| Production durable coding agent | `13dfc613e8e3d9a1aed5f7492272fbf8c580d727` | Contract/boundary and reviewed recovery spike |
| Browser identity, onboarding and authorized import | `18815307e6c306d63766230ed7eb7ddbf94d1f21` | Contract; reuse lane J and policy bootstrap `a13a0bf5` |
| Complete browser progress, steering and review | `cfbde32f20618231aed598f63f3898cc188d0ffd` | Live runtime/identity; reuse stage 5 and cleanup `8d249233` |
| Joint deployed acceptance and user docs | `d89fc17fb60a7c8a3591e23193596c981781b26c` | Integrated journey, policy/cleanup; coordinate existing docs plan |

Test-overhead `ecbc722a` remains builder's highest implementation priority,
then acts, builder-identified Jam blockers, and Jam/docs in parallel.
These stories add no first-Jam readiness gate. Initial delegated-agent
runtime, reusable agent identities, private-source OAuth, browser IDE and
preview remain later choices; no implementation or shipping is claimed.

## Evidence and limits

Parent read every cited production path and test pattern. Read-only synthetic provider controls using actual exported Workspaces/SnapshotRepos classes and in-memory SQLite reproduced incomplete inventory acceptance and unknown-duty closure on foreign provenance. They do not establish live provider behavior. Terminal revocation and founding interruption were verified by source control-flow analysis; their plans require meaningful regression tests, including actual DO recovery for founding. No new whole-repository gates, live inference, deployments, remote deletions or credential creation were run as part of the audit. A7's separate exact-head review ran its own gates and fault controls; those are not claimed as audit repros.

## Canonical mint ownership: contract handoff still needed

`packages/git/src/artifacts.ts:110,115` and `publisher/client.ts:84` retry non-idempotent canonical token creation after potentially applied internal errors (see artifacts.ts:60–68). `packages/room/src/logremote.ts:45` mints before its finally block. A lost answer can leave an unnamed token outside a cleanup owner's records; a usable publication answer can also be lost between mint and durable pushToken recording at landing/engine.ts:266–267. The ownership loss is evidenced, but a safe complete recovery design needs a contract decision: canonical inventories do not identify an owner and contain concurrent unrelated tokens. Do not turn this into a blanket revoke-all plan. Request explicit ownership of that design and its implementing lanes. Known tokens need durable handoffs; unknown effects need honest observation/retention or a documented provider completion fence. No unauthorized access or credential disclosure is claimed. Measured 60-second publication and longer pin token TTLs remain adopted behavior.

Design for review under request `10fcfe4e`: [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), with the contract in [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). Revisions 2 to 5 answer checker reports `9ff903ab` and `851b215b` and their follow-ups. Approved in review `ad6cc052`. Lane A landed at `7be42275` (review `84b71c71`): see [Mint lane A](#mint-lane-a-request-1eda3c5e). Lane B landed at `574568b2` (review `1266c4a7`): see [Mint lane B](#mint-lane-b-request-78f0971c). Lane C is implemented, pending review: see [Mint lane C](#mint-lane-c-request-5ff58c9a). Live, lanes B and C made every propose fail, because the ledger's expiry check had no margin for Artifacts' clock: see [Live propose 503 after lanes B and C](#live-propose-503-after-lanes-b-and-c-request-df6ff8d3). The lane fork's read token for pinning, which the design left out of scope, is lane F (request `02836f9a`), implemented, pending review: see [Mint lane F](#mint-lane-f-request-02836f9a).

