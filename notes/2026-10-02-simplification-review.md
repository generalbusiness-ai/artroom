# Simplification, cost and security review

Revision 3, 2026-10-03. Request `55563589`, promise `8a342698`.
This revision repairs review `f24d2b56` on the original audit outcome.
It changes the note and its implementation handoffs; it changes no runtime source.

The original audit examined `93a2552e45c5a46c4dcf624e28c7c703d987e114`.
Its revision-2 production tree matched
`a6330262b1a609843308d9a493dbd6132d428499`. This revision reconciles
that evidence with reviewed main
`344656705140d9bf6539fe44de889d1e21dd2482` (the **current base** below).
Historical citations use the original audit base unless marked `a633`.
Current citations use the current base. Package shorthand omits `packages/`
and, for runtime files, `src/`: `room/crypto.ts` means
`packages/room/src/crypto.ts`. Explicit `test/`, `measure/`, configuration
and manifest paths start at that package root; `cli/src/git.ts` is likewise
explicit. Counts are dated, not counts of an unreviewed acts branch.

Hugh requested duplication, cruft, layering and simplification; cost and
manageability weighted by provider billing units; and internet-reachable
privilege or integrity defects. All those areas and their original
functional handoffs remain covered here. **Verified** means a cited source
path was reopened to establish the stated behavior. **Reported** means a
historical audit observation with reproducible source citations, without a
claim of a new planner runtime test. **Model** marks stated assumptions
multiplied by published rates. **Investigation** means a question requiring
evidence, not a proved exploit. Effort is S (hours), M (about a day), L (days);
fix risk concerns compatibility and ownership, not the severity of a finding.

## Summary and priority

The important remaining work is bounded job retry/deadline/capacity control,
safe retention and clearer ownership interfaces. Preserve the full signed
verification prefix and lifetime idempotency; a closed duty can still prove
ownership. Supported container controls are runtime sizing and application
admission budgets. A container policy migration is a separate design choice.

Several high-impact audit findings have already been repaired: join and
redemption secrecy/session handling (`c657d4ba`), configured public URLs,
git-config quoting and streamed body limits (`55be0661`), legacy/harness
retirement (`73eccbec`, D5), and idle publication/backoff/gone-repository
behavior (`3da1d82b`). They are credited below rather than commissioned again.
The remaining original room-teardown outcome stays explicit.

Hugh's directions `7363396b` and `04da4388` govern scheduling: acts enabling
jam first; spikes needed to unblock an actual jam task next; then jam and
complete Artroom docs in parallel. The builder judges readiness for concrete
jam development using reviewed and deployed evidence. Remaining audit work
is backlog, not a requirement to empty it before self-hosting. A finding
that blocks an actual task should be named with its dependency. Jam's own
acts vocabulary may evolve while historical declaration bindings remain
verifiable. No complete-stage-4/6 requirement is added here.

## 1. Ranked outcomes

This preserves the original fifteen outcome groups, with current status
and compatible acceptance. It is an audit ranking, not a new readiness gate.
The current request IDs are mapped to their original IDs in section 11.
Each detailed finding below inherits the effort and compatibility risk of
its named implementation group. For self-hosting, signing/authority, ledger
retention and structural transaction changes have medium integration risk
and need isolated review; helper/docs/test-boundary work has low to medium
risk, mainly stale contracts or lost evidence. Landed security/idle fixes
have regression risk if changed again. D1–D4 choices have design risk until
resolved. None is asserted to block the builder's current first jam task
without a concrete failing dependency.

| # | Outcome and evidence group | Current status / next result | Effort | Fix risk | Current request |
|---|---|---|---|---|---|
| 1 | Join replay and refused-secret handling, SEC-01/02/07 | Landed c657; retain controls | S | low | existing `c657d4ba` |
| 2 | Idle publication and orphan rooms, COST-01/09 | 3da idle/backoff/gone fixes landed; complete teardown | S–M | medium | `14edad4c` |
| 3 | Deployment/CLI/body hygiene, SEC-04/05/11 | Landed 55be; retain controls | S | low | existing `55be0661` |
| 4 | Due scheduling, unknown effects and safe retention, COST-07/12/14 | Credit backoff/indexes; retain lifetime/ownership data | M | medium | `b70595d0` |
| 5 | Retryable errors, deadlines, concurrency/daily budgets, COST-04/05/13 | Returned refusals stop; thrown errors need policy | M | medium | `ea7716c0` |
| 6 | Founding exposure, registry-before-object and names, SEC-03/06, COST-02 | Full outcome waits for owner D1/control-Rooms design | M | medium | `214ddbfe` |
| 7 | Supported sizing, operator reads/telemetry and wait bounds, COST-03/10/11 | Observability and DO RPCs already exist; finish interfaces | M | low–medium | `d687ef51` |
| 8 | Shared signing/IDs/errors/redaction/push contracts, DUP-01/03/06/07/08 | Preserve raw entry bytes and explicit input adapters | M | medium | `96253919` |
| 9 | Glob/admin/state/snapshot/type contracts, DUP-02/04, ARCH-02/05 | Share the named behaviors; allow intentional reexports | M | medium | `705cd75c` |
| 10 | Pre-I/O holder check, optional verify pinning, key/harness investigation, SEC-08/10/12/13 | Distinguish hardening/investigation from proved exploits | S–M | low–medium | `972e3023` |
| 11 | Production/testing exports, manifests, dead symbols and git test wiring | Credit D5 import/Ledger repairs; finish remaining groups | M | low | `c7440a7d` |
| 12 | Ledgers, run/due table, owner APIs and migrations | Credit snapshot adoption/inventory/D5; preserve unknowns | M–L | medium | `3b761aba` |
| 13 | Artifacts fakes, SQLite/measurement helpers and behavior overlap | Preserve independently useful controls | M | low–medium | `60034992` |
| 14 | Protocol/README/results/spikes/notes/live-UI hygiene | Preserve complete rule/history/docs scope; credit later UI landing | L | low–medium | `166e80e3` |
| 15 | All nine structural refactor groups, ARCH-03/04/07/09/11/12 | D6 allows any time; schedule around acts work | L | medium | `478e024f` |

Not audited here: load performance, dependency/license audit, UI accessibility
and policy evaluator budget implementation. The original security audit
traced source paths; it did not run an attack. This revision makes no new
runtime-suite or live-provider measurement claim.

## 2. Security evidence

**SEC-01 — accepted join replay creates a new session (historical, fixed).**
Historical `room/requests.ts:204-208` called `newSession` after an exact
idempotent `submit` replay (`admission.ts:266-269`). A log reader could reuse
the accepted signed join to acquire a session as that member. Current
`requests.ts:194-202` returns a replay refusal before creating a new session.
Retain c657's exact-byte, session and removal controls. This historical read
access defect does not establish an admin-effect escalation.

**SEC-02 — recorded refused join exposes the invitation secret
(historical, fixed).** Historical `admission.ts:214-220,1485-1491` recorded
refusals through the acts path with `ctx.signed`; the redeem-only hook did
not cover it. Current admission excludes join refusals from the public log,
as c657's tests/documented cases require. Preserve this across v1/v2 and
redemption paths; no new secret-bearing refusal is permitted.

**SEC-03 — public founding exposes operator resources (current).** Current
`room/http.ts` routes draft/found without a separate operator-issued
founding credential; `founding.ts:45-49` accepts length-valid names without
normalization. Founding validates the genesis/admin signature and repository
authorization and binds before repository work; this does not impose an
operator quota. Repository creation, Room storage and registry bindings
create exposure. `git/first-commit.ts` pushes the initial commit directly by
smart HTTP; a Publisher container starts for later publication work, not
necessarily inside each founding call. No fixed monthly bill per founding
is inferred. The complete gate/name/clock outcome waits for owner D1.

**SEC-04 — placeholder public URL (historical misconfiguration, fixed).**
Historical `room/room.ts:79` and Wrangler supplied a placeholder hostname;
a CLI command could send a bearer to that configured host. This showed
misconfiguration risk, not evidence of host ownership or token theft.
Current `room/config.ts:62-72` rejects missing or malformed HTTPS origins;
`55be0661` removes the placeholder fallback; no hostname blacklist is added.

**SEC-05 — git config injection (historical, fixed).** Historical
`cli/src/git.ts:61` inserted server remote/token strings into included git
configuration. Quotes/newlines could introduce extra settings consumed by
git. Current 55be validates and quotes those fields and preserves atomic
local-state/install ownership controls. This revision credits that repair.

**SEC-06 — shaped unbound IDs instantiate an object (current).** Current
`room/http.ts:37-45` sends room-ID-shaped inputs to `ROOMS.idFromName` without
registry lookup; only names are resolved through registry. Room construction
initializes storage. The requested result is registry-before-object and
not-found without creating a Room, alongside the complete D1-dependent gate.

**SEC-07 — redemption limiter boundary (historical, partly addressed by
c657).** The old limiter was in memory and keyed by caller input; RPC clients
shared the null address (`requests.ts:175-197`, `worker.ts:56`). Even at that
base the outer redemption was checked before the limiter. Current
`requests.ts:182-187` still checks outer shape first; the client join body is
validated later. Do not confuse those boundaries. c657 covers bypassable
address/invitation limiting and secrecy/session behavior; any further
operator admission policy belongs to its named full handoff or D1, not an
unsourced assurance of unlimited unauthenticated effects.

**SEC-08 — holder check follows propose I/O (historical Reported).**
`room/admission.ts:207-208,375-392,692` prepared pins/main/diffs before the
holder decision. Move the holder and lease check before I/O, retain the full
step-7/final transactional recheck after awaits, and test both boundaries.
This is resource-amplification hardening; do not infer unauthorized landing.

**SEC-09 — what a check attests (owner D2).** Historical
`checkers/checkers.ts:30-50`, `room/jobs.ts:361-412` and `sandbox.ts:65-80`
run proposal-controlled scripts/lockfiles and give whole-tree checks a
canonical read capability. D2 remains a choice about trusted command
configuration, admin approval of command changes or diff review as the
barrier. A recorded check's precise binding is not evidence that its command
is independently trustworthy. No new decision is made by this audit.

**SEC-10 — optional expected identity/checkpoint (hardening).** Current
`log/verify.ts:119-125,150-154` reports room/operator identity but options do
not pin an externally expected room/checkpoint. The CLI consumer is
`log/cli.ts:28-36`; it verifies the caller-selected remote. No consumer that
confuses an unexpected room with a trusted expected room was demonstrated.
Retain the full optional `--room` and `--checkpoint through:hash` mismatch
checks and prominent identity output in the small-security handoff, without
ranking their absence as a proved log-substitution exploit.

**SEC-11 — streaming body boundary (historical, fixed).** Historical
`room/http.ts:47-51` read a chunked body before measuring it; the MCP route
had no matching cap. Current `http.ts:47-77` stops reading after 1 MiB;
55be's MCP authentication/body-limit controls are credited and retained.

**SEC-12 — Ed25519 registration/backend conformance (Investigation).**
Current `room/crypto.ts:96-100` checks key syntax/32-byte length; `schema.ts:
321-396` and `admission.ts:364-383` cover join/delegate/recovery registration
and authority. A malformed admitted key could cause registration lockout;
that is different from signature forgery. Current `log/crypto.ts:108-114`
and Room's Noble fallback `crypto.ts:188` use `zip215:false`. Pinned Noble
2.4.0's `abstract/edwards.ts:967-980` rejects small-order public keys in that
mode; its strict decoding also bounds encodings. Room's WebCrypto path
(`crypto.ts:181-185`) needs separate paired conformance evidence. Test
small-order/noncanonical classes, each registration path and each backend;
record results and repair only demonstrated gaps. [Noble primary source](https://raw.githubusercontent.com/paulmillr/noble-curves/2.4.0/src/abstract/edwards.ts).

**SEC-13 — retired harness redeployment (Reported/configuration exposure).**
D5 moved the checker harness to `checkers/measure/harness/`; its Wrangler
header says not deployed by default. If redeployed, the configuration enables
workers.dev in `gitseq-spike`; `harness.ts:312` compares the shared header
with `!==`, and `:321-325` can revoke active tokens on the named repository.
This configuration is not proof of a currently public Worker or shared key.
The full handoff still requires a separate measurement namespace, disabled
public exposure while unused, constant-time comparison and key rotation if
actual sharing is established. Keep production and measurement entry points
separate.

**Boundaries credited from the source audit.** Room identity/domain/signature
checks, no re-delegation, admin recovery effects, current bearer/session
authority and credential scoping remain essential controls. The expiry issue
was repaired at a633 by final transactional authority judgment. Unrestricted
runner internet is disabled; the gateway intentionally permits registry
GET/HEAD and scoped repository smart HTTP (`sandbox.ts:65-80,136-139`). The
source audit found no ordinary member/agent path to an admin-only effect;
this is a bounded source finding, not a universal security proof.

## 3. Cost and manageability

### Rates and a reproducible model

Primary provider pages were checked on 2026-10-03. Rates below are US dollars;
allocations are account-wide, not a new free allowance for each room.

| Meter | Rate and included allocation | Source |
|---|---|---|
| Artifacts operations | create/push/pull/clone: 10,000/month included, then $0.15/1,000; billing starts 2026-10-14 | [Artifacts pricing](https://developers.cloudflare.com/artifacts/platform/pricing/) |
| Artifacts storage | 1 GB-month included, then $0.50/GB-month; retained repositories continue to store data | [Artifacts pricing](https://developers.cloudflare.com/artifacts/platform/pricing/) |
| SQLite rows | 50M writes included, then $1/M; 25B reads included, then $0.001/M; 5 GB-month stored included, then $0.20/GB-month; alarms and deletes write rows | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| DO requests/duration | 1M requests included, then $0.15/M; 400,000 GB-s included, then $12.50/M GB-s; 128 MB object allocation | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| Container memory/disk/CPU | provisioned memory $0.0000025/GiB-s; provisioned disk $0.00000007/GB-s; active CPU $0.000020/vCPU-s; respective account allocations 25 GiB-h, 200 GB-h, 375 vCPU-min | [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/) |

Let `T = 30 × 86400 = 2,592,000 seconds`. Gross meter cost before account
allocations is `count × rate`; compute an account invoice by aggregating all
rooms/services first, then applying the relevant allocation and provider
rounding. Container activity is billed in 10 ms units. One DO held awake by
overlapping polls/work is counted once for elapsed allocated duration, not
once per poller. Container charges exclude the additional Worker/DO charges.
Plan fees, Workers requests/CPU and optional model inference are additional
meters, not included in the examples below.

An **idle room after the landed loop fix** has no publication wake caused
only by its checkpoint. The specific 3da idle-window dataset recorded zero
Room writes; it does not establish zero storage, reads, requests, duration or
a zero total invoice. For comparison only, the historical 62 s loop predicts
`floor(T/62) = 41,806` publications/month. If each generates one billed push,
its push component is `41,806 × 0.15/1000 = $6.27` gross; add only demonstrated
billed pull/clone/create operations and measured resources. Token mint/revoke,
list/info/fork billing and failure-operation charging are not established by
the pricing page, so the old $15–58/$13–50 ranges are withdrawn.

An **active profile** assumes 10 lanes/day for 30 days, two generations per
lane, one check and one review. Its base is 600 preview-generation checks.
If every lane lands and one fresh landing check is required, add 300: 900
runs before additional invalidation/retries; a carried valid check subtracts
from that assumption. There is no unexplained 1,500-run total. For `n` actual
standard-1 runs, `t` provisioned seconds/run and `c` active CPU seconds/run,
the gross container component is
`n × (4t × 0.0000025 + 8t × 0.00000007 + 0.5c × 0.000020)`.
If `n=900` and `c=t`, 3 s/run gives $0.056 and 120 s/run gives $2.220 gross.
These are model inputs, not measurements; provisioning, setup, cleanup and
idle tail belong in `t`. Add actual Publisher runs, DO awake seconds
(`0.128 × seconds × 12.50/1M`), account-level requests, physical rows and
retained fork/canonical storage. Optional Workers AI usage needs measured
model-specific neurons. No all-in active-room invoice is asserted.

A hypothetical permanent 5 s loop predicts `T/5 = 518,400` wakes, but this
alone says nothing about billed Artifacts operations. Even a hypothetical
one `setAlarm` per wake gives only `518,400 × $1/1M = $0.5184` gross alarm-row
cost, before other physical writes/account allocation. The old $155–777
estimate assumed 2–10 billed provider operations on every wake without
establishing that path; it is withdrawn. Current 3da backoff is 5 s doubling
to 300 s, so that hypothetical is not a current persistent-failure model.

| Failed-work path | Provider work to count at the failure boundary | What remains uncertain |
|---|---|---|
| Failed publication | canonical metadata probe; mint-ledger work; container stage/push/read-back reached before failure | short-circuit position, internal retries, token/control-plane billing and failed push charge |
| Failed pin/preview | source/destination reads, credential duties, container pin/diff/build calls actually reached | branch-dependent short circuits, shared container uptime and token operations |
| Unresolved mint/create | complete inventory/create/revoke probes when its durable due time permits | unknown outcome is still owned; no fixed operation count without the ledger trace |
| Gone canonical repo | canonical probe once at the relevant boundary; owed cleanup retained but blocked | new act/forced retry and unrelated object work; not one successful push per alarm |

Current source anchors are `room/core.ts:1660-1750,1910-2025`,
`git/mints.ts`, `git/workspace/workspaces.ts:699-718`, and the Publisher and
pin/preview implementations. The full provider harness must record actual
per-path attempts/results. This table deliberately does not turn an alarm
count into invented token or push charges.

### Findings COST-01 to COST-14

| ID | Reproducible evidence and current interpretation | Result / owner |
|---|---|---|
| COST-01 | Historical `room/core.ts:1517-1524,1599,1713` and `notes/deploy-spike.md:267` show checkpoint publication feedback; current `core.ts:1660-1704` ignores a checkpoint-only suffix | 3da landed; retain independent verification; teardown remains in `14edad4c` |
| COST-02 | Current founding routes/name/registry paths in SEC-03/06; first commit is direct smart HTTP | Full D1-dependent gate in `214ddbfe`; quantify actual exposure |
| COST-03 | Current `git/publisher/container.ts:147-153` starts without explicit runtime instance; checker `sandbox.ts:136` already chooses standard-1 | Explicit supported Publisher lite/timeout in `d687ef51` |
| COST-04 | Current `room/jobs.ts:477-486` marks a returned refusal done, but thrown error catch re-owes at 30 s; `checker.ts:93-99,201-205` throws retryable=false for oversized output | Typed retry policy/cap/backoff/attention in `ea7716c0` |
| COST-05 | Current `policy/validate.ts:210-211`, `checkers/job.ts:155-156`, `runner.ts:109-110`, `sandbox.ts:183-185`, `room/jobs.ts:190-198` | Bound timeout/deadline and abort/late-answer cleanup in `ea7716c0` |
| COST-06 | Historical `room/core.ts:1258-1304` refreshes previews; `:1303-1304` and `jobs.ts:102-118` issue only qualifying clean/unlanded, unmet, bound, deduplicated obligations | Owner D3; no universal every-check rerun claim |
| COST-07 | Historical `core.ts:1704-1712` pending 5 s wakes; current `:1986-2025` keeps per-kind capped backoff, `:2085-2110` uses due times | Credit 3da; finish missing scheduling/escalation in `b70595d0` |
| COST-08 | Historical `git/workspace/workspaces.ts:218-307,664-670` retains fork ownership; `room/registry.ts:67-79` keeps bindings; snapshot repos do have retirement | Owner D4 for canonical/fork/room lifecycle; not a claim all repositories are never deleted |
| COST-09 | Historical `deploy-spike.md:272-274`; pending cohorts could wake 5 s, not universally 60 s; current `core.ts:1682-1739` recognizes gone canonical repo and once-attention | 3da landed; complete teardown without losing unknown cleanup |
| COST-10 | Historical swallowed step errors; current diag/report source, Wrangler obs=true, `room.ts:178-185` duties/tick RPCs | Finish documented operator HTTPS/RPC reads and telemetry in `d687ef51` |
| COST-11 | Historical `room.ts:122-165,284` long polls/subscriptions versus hibernatable watch | Bounded waits/stream lifetime and watch guidance in `d687ef51`; model one object duration |
| COST-12 | Historical `git/landing/core.ts:61-64` forward retries and `room/jobs.ts:186-229` lost mint observation; current durable remote-effect ledgers retain unknown ownership | Escalate/back off in `b70595d0`; never settle unknown by deadline |
| COST-13 | Current `room/jobs.ts:59,162-198` batch 20 is not an active-slot or daily budget; `checkers/worker.ts:50-52` supplies a fresh runner per job | Durable concurrency/daily limits in `ea7716c0`; no unsupported max_instances |
| COST-14 | Current due-query/index and retained ownership citations in section10; attention insertion `core.ts:966`, idem lookup/insert `admission.ts:290-303,1538,1555` | Safe query-specific retention/indexes in `b70595d0`, with lifetime compatibility |

Both deployments use `scheduling_policy=durable_object` (`room/wrangler.jsonc:
47`, `checkers/wrangler.jsonc:43`). It selects size through the runtime
`instance` property, defaulting to lite; `max_instances` is unsupported.
Keep that policy and use application admission controls. [Scheduling policy](https://developers.cloudflare.com/containers/configuration/scheduling-policy/),
[runtime Container API](https://developers.cloudflare.com/containers/api/durable-object-container/).
Account limits are 6 TiB memory, 1,500 vCPU and 30 TB disk. With lite's 2 GB
disk, the disk limit gives roughly 15,000 instances before the 1/16 vCPU CPU
limit gives 24,000; this is an inference, not a tested capacity. [Container limits](https://developers.cloudflare.com/containers/platform/limits/).

Existing caps include bounded dispatch/revocation batches, known-expiry
credential cleanup, output 8 MiB, publication attempts per call, snapshot
retirement and read waits. A known token expiry can finish its owned revoke
duty; an unknown mint cannot be discarded by analogy. None of these caps
proves the missing per-room daily/active-job budgets.

## 4. Duplication

| ID | Historical source evidence | Compatible simplification |
|---|---|---|
| DUP-01 | canonicalize: `client/canonical.ts:58`, `log/canonical.ts:37`, `room/canonical.ts:41`, `policy/integrity.ts:22` over `values.ts:30`; signing: `client/keys.ts:93`, `log/crypto.ts:94`, `room/crypto.ts:135-150`, `checkers/signing.ts:41` | Shared runtime-neutral bytes with explicit input/runtime adapters; raw entry hashes stay raw |
| DUP-02 | `room/glob.ts:11-33,97-121`, `policy/glob.ts:11-22,95-121` differ on256-character/whole-segment rules | One strict glob/overlap/path owner with current behavior pinned |
| DUP-03 | `room/ids.ts:18-52`, `log/entries.ts:12-22`, verifier act references, `ui/room/mock/ids.ts:17`, `cli/main.ts:471-479` act parsing | Shared ID/checkpoint/sealing constants; preserve bounded sequence semantics and history |
| DUP-04 | `room/snapshot.ts:16-57`, `checkers/snapshot-commit.ts:12-70`, `git/publisher/gitops.ts:130` derive commit/author/tree facts | One exact snapshot/git-object encoder; R-CARRY-15 identity control |
| DUP-05 | Four fake families: `room/memory/artifacts.ts:41,90,355` (859-line file), `git/test/workspaces.test.ts:19-171`, `git/test/snapshots.test.ts:11-133`, `checkers/test/support.ts:82-197` | Shared FakeArtifacts/token helpers without losing distinct error/fault cases; no unsupported450-line aggregate |
| DUP-06 | IDs/roles/kinds in `room/ids.ts:18`, `room/schema.ts:221-307,321`, `log/decode.ts:99`, `log/verify.ts:176`, `client/room.ts:250-298`, `client/bearer.ts:111-140`, UI/CLI parsing | Shared lists/patterns/body-field owners; enumerate current definitions before removal |
| DUP-07 | `room/errors.ts:9-40`, `client/errors.ts:9-69`, ad hoc Refusal constructors in admission/client/CLI | One error/retry/status/refusal contract with adapter-specific presentation retained |
| DUP-08 | Token/error redaction in `git/mints.ts:191`, workspace/snapshot/jobs helpers and measurement scripts (`git/measure/live.mjs:25`, Room smoke`:71`, MCP stage0`:67`, checker live`:31`); `git/publisher/log-push.ts:24-33,77-84`, `log/git.ts`, `log/publisher.ts` repeat push shapes/limits | Shared redaction, push wire types/limits; preserve secret handling and independent readers |
| DUP-09 | `git/test/support.ts:18-43`, `checkers/test/support.ts:59-80`; row helpers `git/sql.ts`, `room/store.ts:251-263` | Shared nodeSql/savepoint/row helpers with existing transaction behavior |
| DUP-10 | `git/measure/live.mjs:19-56`, `room/measure/spike-smoke.mjs:59-155`, `room/measure/mcp-stage0.mjs:51-152`, `checkers/measure/live.mjs:26-55` and remaining scripts | One measurement library/account+namespace env inputs, portable OAuth lookup and redaction; all original scripts remain covered |
| DUP-11 | `client/test/support/fake-room.ts:156-1251` and `ui/room/mock/world.ts` (1,119 historical lines) reimplement behavior; client overlap helper`:1240` is approximate | Record behavioral overlap/limitations; coordinate shared helpers and complete live UI, not silently omit it |

The historical survey counted four canonicalizers, four signing functions,
two strict parsers and multiple base64/ID/error/redaction copies. Different
function signatures are not themselves drift. Entry-v1 signs a raw UTF-8
hash (`log/crypto.ts:94-100`, `room/crypto.ts:143-150`); envelope domains use
canonical JSON. Current Room publication tests already verify both prefixes
with independent Log and reject tampering (`room/test/workerd/log.test.ts:
49-83`). What is missing is comprehensive cross-implementation edge vectors.

`96253919` retains all original canonical/parse/domain-byte/base64/key/digest/
ID/role/error/refusal/redaction/push-limit/wire-type outcomes. Edge vectors
precede switching and cover undefined/reserved/duplicate keys, depth,
number/string boundaries, raw hashes and historical signatures. Keep
synchronous Room sealing, runtime dependency boundaries and deliberately
different input acceptance through named adapters. `log/roster.ts` remains
an independent authority judge; sharing its judgment with admission would
remove a useful verification boundary.

## 5. Cruft and documentation

These findings are a dated inventory. Current consumers determine whether
a symbol/file is dead; no item is deleted merely because its old count grew.

| ID | Historical/current evidence | Full remaining result |
|---|---|---|
| CRUFT-01 | Current `room/index.ts:19` exports fakes/hooks; `core.ts:182-186` fault state; `config.ts:131-180` test configuration setters; `log/index.ts` MemoryGit | Production/testing export split with behavior and deployment tests |
| CRUFT-02 | Historical Room migrations v2–v8, ws_legacy, registry flags, snapshot adoption | D5 retirement 73ecc already delivered; preserve current/unknown ownership semantics |
| CRUFT-03 | Historical `docs/protocol.md` sections24–30:1,099 of 3,244 lines; superseded R-LOG-9/R-CARRY-6/9/10 and open points inside amendments | Fold governing rules in place, retain history/rule IDs and gather open points; include current declared section33 |
| CRUFT-04 | Historical `room/obligations.ts:36-47`, `admission.ts:495-503,716-743`, `policy/admin.ts`, `rules.ts` | Named admin/recovery/self-review behavior shared by policy; not deletion of authority checks |
| CRUFT-05 | Historical `ui/main.tsx:22` selects mock; `client/connect.ts:56-69` already exists; UI manifest lacks client | Full live-client path with explicit demo flag; stage5 development head is not landed evidence |
| CRUFT-06 | Current inventory: `room/roster.ts:101,129`, `crypto.ts:25`, `log.ts:111`; `ui/ui/format.ts:34,46`; `cli/git.ts:52,144`; `contract/landing.ts:45` names isHandleTaken/teamMembers/sha256Bytes/entryCount/personOf/ruleDescription/credentialPath/removeCredential/WorkspaceDetail | Resolve every candidate against actual consumers; record removed/used items rather than assume all dead |
| CRUFT-07 | Historical Room Publisher harness import and checker stand-in Ledger/harness | Current Publisher uses git/publisher, checker Ledger export gone after D5; retain boundary, no second retirement |
| CRUFT-08 | Historical package README total 4,372 lines, Room 1,719 with 23 delta sections;27 review-ID test files | Current-state references + changelogs, behavior test names retaining review IDs |
| CRUFT-09 | Historical 68 tracked result files; two logbig fixtures consumed at `git/test/push-outcome.test.ts:41-42` | Move fixtures to their consumer; enumerate and reproducibly archive only unreferenced results, preserving audit/provider/history inputs |
| CRUFT-10 | `spikes/room-core`, `spikes/sandbox-git`, `spikes/pi-durable` READMEs/locks/pins | Superseded status+archive tags, re-pin or explicitly freeze pi spike; production pi-durable remains separate full scope |
| CRUFT-11 | Historical notes links in `notes/mcp-stage0.md:3`, `2026-10-01-pi-durable.md:9`, plan runtime-profile reference, carry delivery notes | Status index/link check, current main destinations and preserved history |
| CRUFT-12 | Current `git/package.json:14-17`: test only node test/*.test.ts, workers/log suites separate | Root test gate actually runs git DO and pushlog suites |

`166e80e3` keeps all six original hygiene groups, current protocol rules,
fixture/results preservation, spike status, notes index and complete live
UI. It does not reduce the approved full docs plan of 67 pages. `c7440a7d`
keeps production/testing boundaries, manifest/version checks, every named
dead-symbol candidate and git test wiring; it credits the landed D5 import
and checker Ledger changes.

## 6. Layering and complete structural scope

Production dependency edges observed at the audit/current base are contract
at the bottom; policy→contract; log→contract+policy; git→contract;
room→contract+policy+log+git+client+mcp/worker (it mounts MCP);
checkers→contract+policy with git for measurement; client→contract;
mcp→contract with a declared but unused client dependency; cli→client+mcp;
ui→contract+policy+git, historically without client. The manifests and actual
imports both matter. No production cycle was found in the source survey;
script composition is a separate boundary.

The following table defines every ARCH/LAYER ID cited by the original
handoffs. Historical lines are reproducible at the stated base; current
credits qualify them rather than commissioning completed work twice.

| IDs | Evidence / complete change group | Owner |
|---|---|---|
| ARCH-01, LAYER-01 | Duty ledgers `git/workspace/workspaces.ts:218-307`, `snapshot/repos.ts:245-277`, `room/jobs.ts:73-84,216-219`; historical Room private-table writes `core.ts:1368,1708`; current`:2000` still reads artroom_ws | `3b761aba`: shared ledger, owner APIs and current pending predicate |
| ARCH-02, LAYER-03 | Glob/admin/recovery copies in DUP-02/CRUFT-04 | `705cd75c`: strict matcher and shared authority constants/skips |
| ARCH-03 | `room/admission.ts` repeated lane/refusal prologue; review/check evidence`:970-1011,1063-1151`; carry`:748-790` and `core.ts:666-688`; landAuthority/initiatorOf | `478e024f`: laneTarget/evidence/reviewCarry/authority helpers with refusal order pinned |
| ARCH-04 | Seven historical raw lane writes `admission.ts:539,594,659,819,1253`, `core.ts:1266,1327` | `478e024f`: named transitions and shared side effects |
| ARCH-05 | Landing ACTIVE/PRE_RESERVATION `git/landing/core.ts:68-69` versus `core.ts:575,1251`, admission`:1394,1402`, jobs`:296` | `705cd75c`: isUnreserved/isReserved/retryFix owner predicates |
| ARCH-06 | Historical run list `core.ts:1628-1643` versus due logic`:1672-1715`; current LOOP_KINDS/backoff and nextAlarm | `3b761aba`: one complete run/due table, no stranded new step |
| ARCH-07 | Historical `room/core.ts`1,722 lines and section boundaries; current file grew | `478e024f`: publication/notify/founding/landing-host modules without feature cuts |
| ARCH-08 | `workspaces.ts:164-177`, `landing/core.ts:103-107` constructor schemas; snapshot`:148-152` already transactional version2 adoption at93/a633 | `3b761aba`: unified supported migration owner; credit prior adoption and laterD5 |
| ARCH-09 | `log/verify.ts:176` verifyLog (509 historical lines), chain/retained/evidence/system handlers | `478e024f`: readChain/retainedIndex/checkEntries/checkNeeds with independent judgment |
| ARCH-10 | Four fake families/two SQLite helpers/measurement scripts in DUP-05/09/10 | `60034992`: complete shared helpers and behavior-overlap inventory |
| ARCH-11 | `room/schema.ts:221-307`, `client/room.ts:250-298`, bearer`:111-140` | `478e024f`: owned BODY_FIELDS/schema/client/bearer definitions preserving v1/v2 |
| ARCH-12 | `room/config.ts:53-92`, ports`:231-263`, room tsconfig/typecheck, CLI main render/commands/USAGE | `478e024f`: factories/TestServices, runtime-neutral types, typed seams, CLI helpers |
| LAYER-02, LAYER-04 | Identity/signing/error/redaction/push copies in DUP-01/03/06/07/08 | `96253919`: shared byte contracts with explicit input adapters |
| LAYER-05 | Snapshot/tree encoding copies in DUP-04 | `705cd75c`: exact shared git object identities |
| LAYER-06 | Historical `room/ports.ts:127-136` concrete reexports/test hooks and four engine compositions | `478e024f`: buildEngines and separate TestServices; credit retired harnesses |
| LAYER-07 | Historical `room/ports.ts:147,152,204`, git index`:16,43,49,52`, log git TreeEntry/PushOutcome and checkers Signer | `705cd75c`: resolve named confusing contracts/aliases, permit intentional reexports/package namespaces |
| LAYER-08 | Room tsconfig remaps log/client/mcp to generated .types declarations | `478e024f`: current runtime-neutral typecheck/IDE sources, common web types, generate Worker types once |
| LAYER-09 | UI mock/client dependency in CRUFT-05 | `166e80e3`: complete live-client/demo scope |
| LAYER-10, LAYER-11 | Production fakes/hooks and manifests versus actual import graph in section5/this section | `c7440a7d`: testing boundary/import checks/root gates |
| LAYER-12 | Publisher/checker casts in `room/config.ts`, ports; policy as-never; source regex in `room/test/node/deploy.test.ts:57-65` | `478e024f`: PublisherStub/LogRemoteStub/snapshot interfaces, typed bindings and exported checker table |

`3b761aba` must preserve existing ledger tables/states and unknown remote
ownership. At a633, completeInventory was already exported/imported by jobs;
the current git index exports it at`:60`. Snapshot adoption already existed
at the original audit; D5 subsequently retired legacy paths. Do not add a
second upgrade or restore retired importLegacyDuties. Apply current-owner
APIs and compatible adoption only to surviving storage semantics.

`478e024f` keeps all nine original refactor groups, each separately or in
small reviewed groups with behavior pinned. The original 900-line Room-file
organization target permits splitting, not omission of behavior. Refusal
order/invariant tags, synchronous sealing transactions, independent Log
judgment and current transport/body shapes remain. D6 permits any time;
acts work and concrete jam dependencies determine when capacity is used.

## 7. Owner decisions

Original assert `82c29bcd`; Hugh's answers are in `1c62cbf1`.

- **D1 — founding admission:** deferred to complete control-Rooms design
  (`notes/2026-10-02-collections-of-rooms.md`, firm-auth `d50ce26d`). The audit
  does not choose operator grants, address quota, proof of work or contest
  openness. The complete founding handoff waits for the decision.
- **D2 — checker trust:** pin commands in protected configuration, require
  admin approval of scripts/lockfiles, or use diff review as the barrier.
  Open; retain precise check bindings whichever model is chosen.
- **D3 — freshness:** strict current-base checks, lazy re-run or debounce.
  Open; any change preserves explicit invalidation/carry semantics.
- **D4 — fork retention:** retained until pinned, timed deletion after landing
  or permanent retention. Open; ownership and referenced evidence constrain
  disposal whichever policy is chosen.
- **D5 — legacy/harness retirement:** yes, retire; `73eccbec` delivered.
  Preserve retained/unknown ownership rather than reintroducing obsolete code.
- **D6 — structural timing:** any time, subject to current acts-first priority.
  The old recommendation to wait for jam was not an owner requirement.

These D1–D6 labels concern this audit; they are not adoption of the separate
unimplemented D1 workflow extension in the acts research note.

## 8. Relation to self-hosting

The old audit used J2/J3 staging and proposed universal pre-deployment
ordering. The current user direction and builder task-specific judgment
replace that ordering, while every functional outcome remains owed.
Join/URL/body/idle-loop repairs are already on main; current declared stages
and their exact independent reviews/deployed evidence remain separate.
No stale audit request becomes a new jam start gate simply by being rebased.

Once the builder judges a concrete jam task enabled, commission that task
and the complete 67-page docs lane in parallel. Full docs includes current
release behavior, ISO plain English, sample/style CI, cold readers/agents
and the production pi-durable path. Platform gaps discovered by jam return
as named Artroom requests. Musical/development acts may change vocabulary
without rewriting the historical bindings that made previous acts valid.
The audit itself may land after its note/handoffs are repaired and reviewed;
all implementation follow-ups need not be completed before that landing.

## 9. Considered and rejected

Generated, ignored Worker runtime declarations are not themselves cruft;
share generation where useful. MCP's zod peer is required by its server.
Independent Log roster judgment is deliberate. The contract's ambient
connect declaration is bound to implementations by tests. Existing canonical
mint-ownership plans and cleanup requests remain owned, not replaced by this
audit. Intentional shared type reexports and harmless package names are
allowed; only cited confusing distinct contracts need clarification.

## 10. Woo lessons, physical rows and safe retention

Woo commits `6d2c425a`, `50163fc1`, `3f6e5a29`, `f4b5dbaf` and its
`spec/operations/net-cutover.md` / `observability.md` motivated measurement.
Its fanout, retry/cache/startup growth and billing-dataset gate are reference
material, not evidence Artroom has passed a budget or can use the same FIFO
policy. The original 250,000 total / 50,000 per-object woo gate is not substituted
for Artroom's declared full provider cases and current named budgets.

| Shape | Correct Artroom evidence | Required interpretation |
|---|---|---|
| Alarm writes | Current due/backoff `core.ts:1986-2110`; provider bills setAlarm as a row | Measure actual calls/windows/all objects; credit landed idle zero-write window |
| Indexes | Current `store.ts:110-114,151-152` explicit indexes on different tables plus implicit uniqueness | Attribute each modified table/index; no six-write multiplier for every act |
| Attention fanout | Current `core.ts:966` creates per-principal rows | Bound fanout while keeping unresolved work and stable monotonic cursors |
| Idempotency growth | Current `admission.ts:290-303` reads before new-row inserts`:1538,1555` | Growth is unique recorded requests, not an identical-retry-mints-row loop |
| Trigger fanout | Preview refresh/policy recompute with clean/unlanded/unmet/bound/dedup guards | Record qualifying generations and actual jobs, not all proposals/checks |
| Startup | Current `store.ts:128-140` skips completed schema versions | Separate fresh database initialization from reconstructing an existing DO |

R-IDEM-2/3/5 (`docs/protocol.md:523-535` at the current base) keeps exact
original results/mismatch protection for the room lifetime. Unenforced
`budgets.ts` FIFO constants/comments are advice awaiting implementation,
not current enforcement and not compatible acceptance. Replace that advice
in `b70595d0`: archive only with exact durable lookup, original results,
lifetime key uniqueness, transactional transfer and restart/replay readers.
Do not re-admit an old valid request after deleting its key.

Closed ownership is also not automatically disposable. Current
`git/workspace/workspaces.ts:823-839` reads sealed repo-create provenance to
protect incarnation/abandoned-name cleanup. Keep that record or equivalent
readers. Preserve the full signed prefix, retained inputs and historical
publication commitments. Unknown mint/create/forward landing effects remain
owned until resolved even after deadlines/caps. Archive/prune only proven
unreferenced closed rows and measure deletions/secondary-index effects.

Credit existing indexes: `git/landing/core.ts:123,129`, workspaces`:196-197`
and Room job due indexes. Evaluate actual plans for workspace due`:699-718`,
snapshot due`:475-498`, attention and nextAlarm before adding partial indexes.
No claim that all scans lack indexes remains.

`8bd623cc` retains the full physical-row measurement/gate scope: read-only
analytics credentials, spike-only runs, exact reviewed deployed source/
config/version, all objects/background activity, complete act/alarm/
publication/startup/carry/landing cases and raw datasets/samples. Existing
rows.mjs/data cover dated cases; undeveloped/missing cases remain owed.
The declared-v2 follow-up `92ddf4cc` similarly preserves its complete
live-provider/no-added-row outcome. Local 13-case SQL pairs are local evidence,
not those provider passes. No unreviewed admission deployment is authorized
by this note. The full fail-closed gate is retained in the observability and
measurement handoffs without inventing a new universal jam threshold.

## 11. Durable handoffs and revision evidence

All thirteen original audit implementation requests were still unclaimed.
Each guarded replacement refused if a promise/completion appeared first;
all thirteen replacement pairs succeeded. Inventory clarification `0f3dfe05ebb7b47945f8df1e70a0104f150b996f`
corrects the actual Log CLI consumer and eight value candidates plus one
contract type; used exports are retained with a recorded disposition. The
replacement handoffs retain the full original functional groups and
corrected conditions. Ordinary staleness alone was
not the reason. Ownership correction `8592926f` rests on the original audit
and Hugh's current priority/readiness directions; retired artifacts/reviews
are evidence, not live authority requirements.

| Original request | Current whole-outcome request | Complete scope |
|---|---|---|
| `99782949` | `b70595d020ea7c2e613f4b85664a52031bd803d5` | Due/backoff/escalation, safe retention/archives, ownership/lifetime idem, indexes and corrected budgets advice |
| `2b1d287e` | `ea7716c0186e160a476305b95de02a991183138f` | Typed retries, attempt caps, deadlines/abort, durable concurrency/daily job budgets |
| `d2cb872f` | `d687ef51e0c5a5700650b3abaf05cb3fcccc23f9` | Supported sizing/timeout, four telemetry kinds, HTTPS/RPC duties/inventory, waits and full provider-row gate |
| `4cd9b14f` | `9625391917dfed9e8c32550ae060e62ef5f2aebf` | Full shared wire-byte/ID/error/redaction/push contracts and edge vectors/adapters |
| `4fd06c76` | `705cd75c4d6aafcae12e0dc987a4d0cdc99af2e7` | All five glob/admin/state/snapshot/type groups, intentional reexports retained |
| `894c9030` | `3b761aba16cefbe3960745015a27789501d91cb1` | Ledgers/backoff/locks, private-table owner APIs, run/due table and surviving migration ownership |
| `2246222d` | `c7440a7d2526a693e3dada04151807710175921b` | Production/testing exports, imports/manifests/versions, dead inventory and git root-test wiring |
| `e7abe9c8` | `6003499251ff0b223a71af0528a6e42f29f4512f` | Four fakes, SQLite/row helpers, all measure scripts and behavior overlap |
| `249d113d` | `478e024f7641c7b59cc96c39a39dd51f78fe9778` | All nine structural groups with behavior/order/history preserved |
| `61bdd92b` | `166e80e355e07ac4abac012c0c85280a1c5d1c52` | All six hygiene groups/current rules, preserved evidence and complete live/demo UI |
| `0b5ebd9e` | `14edad4cdc1ebd79a392e0c912b09ca4c07cab6e` | Credit landed 3da loop/gone repairs; complete compatible teardown |
| `a872f4db` | `972e302398681e958d5089712ce0b6cb5f45d0f7` | Early holder check, optional verify pinning, backend key investigation and retired-harness isolation |
| `d226be30` | `214ddbfe8323f4d17b30803ad060dd08faa0aa0d` | Full D1-dependent founding gate, registry-before-object, name/confusable/clock bounds |

Existing c657/55be/D5/8bd work and D1–D6 decisions retain their own
accountability. No plans/ file was added and no source task was silently
closed by this note. Guarded replacements do not constitute implementation,
independent approval, deployment or satisfaction of the audit itself.

Revision-3 repairs correspond to all seven f24d findings: (1) safe retained
ownership/prefix/lifetime idem/attention, (2) supported container controls,
(3) raw entry bytes/existing verifier tests/adapters, (4) precise security,
(5) sourced cost models/current telemetry/task-specific sequencing,
(6) migration/export credits/defined structural evidence/type-name scope,
(7) qualified write-storm mapping and full provider measurement constraints.

Reproduce historical source/counts with `git show <audit-base>:<path>`,
`git ls-tree -r --name-only <audit-base>` and `rg -n` on an isolated checkout;
the audit base/package README/result counts were reopened for this revision.
Current named source paths and all original handoffs/review/owner decisions
were read selectively. No tests were rerun merely to edit prose. Validation
for delivery is the notes-only diff, `git diff --check`, cited path/rule/
request inventory, arithmetic and independent exact-head review. Runtime
and provider tests remain obligations of their full implementation requests.
