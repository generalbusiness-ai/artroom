# Simplification, cost and security review

Date: 2026-10-02. Request `55563589`, promise `8a342698`. Read-only: no
source file was changed. Reviewed at `main` `93a2552e`; three later
commits landed during the review (`a6330262`), touching
`room/src/{room,core,jobs}.ts` and `git/src/snapshot/repos.ts`, and the
security findings were checked against `a6330262`. Line numbers are at
`93a2552e` unless marked.

Hugh asked for three perspectives: duplication, cruft, layering and
simplification; manageability and cost weighted by Cloudflare's billing
units, including Artifacts; and security, specifically internet-reachable
paths to privilege escalation or integrity attack.

**How to read the labels.** Every finding was produced by one of six
read-only audits (duplication, cruft, layering, the largest modules, cost,
security) and then checked by the planner against the cited code before
it appears here. **[Verified]** means the planner opened the cited lines
and confirmed the claim. **[Reported]** means the audit's evidence is
cited but the planner did not re-open it. **[Predicted]** marks a cost
figure built from published prices and a predicted count. Effort is S
(hours), M (a day), L (days). Risk is the risk of the fix.

## Summary

- **Two security defects need fixing before any public deployment, and
  before the jam's room is founded.** A signed join copied from the log
  and replayed through the redemption route mints a renewable read
  session as that member. A join refused on the acts route is sealed in
  the log with its invitation secret. Both are small fixes. Request
  `c657d4ba`. [Verified]
- **One loop is most of the system's cost.** After every publication the
  Room seals a checkpoint entry, which makes the log unpublished again,
  which republishes it a minute later. An idle room publishes about
  42,000 times a month, each time minting and revoking two tokens and
  running a container push. Artifacts operations are billed at $0.15 per
  thousand from 2026-10-14, so this is roughly $13 to $50 per idle room
  per month. Request `0b5ebd9e`. [Verified; cost predicted]
- **Nothing on the internet-facing side is rate limited or quota'd.**
  Founding needs no credential and creates a repository, a Durable Object
  and a container per call; any room-ID-shaped path instantiates an
  object; check jobs retry every 30 seconds with no cap and run
  containers with no concurrency limit; a stuck pin or a foreign push
  puts a room in a five-second alarm loop. Requests `d226be30`,
  `99782949`, `2b1d287e`. [Verified]
- **An operator cannot see any of this.** No logs, no metrics, no room
  inventory, and step failures are swallowed. Request `d2cb872f`.
  [Verified]
- **The signing path is written four times and has started to drift.**
  Canonical JSON, signing bytes, base64url, key IDs and digests exist in
  log, room, client, policy and checkers with differences on undefined
  values, reserved keys and nesting depth. The copies that matter agree
  today because clients never sign entries, but nothing tests that.
  Request `4cd9b14f`. [Verified]
- **The rest is ordinary accumulation from parallel lanes**: a glob
  validator and the admin rules copied between room and policy, three
  copies of the duty ledger, the Room writing into git's private tables,
  fakes and fault hooks exported from the production entry point, 1,099
  lines of amendment text in the protocol, 4,372 lines of README mostly
  review deltas, 68 tracked result files, three superseded spikes. Each
  has a request. None blocks the jam's move; two should land before the
  platform's (section 8).
- **Six decisions are Hugh's** (section 7): the founding gate, what a
  check attests, re-running checks when main moves, fork retention,
  retiring the legacy migrations and harness Workers, and when the
  structural refactors run.

## 1. Ranked findings

Ordered by leverage: impact over effort, discounted by confidence and
fix risk. Each row names the request that carries it.

| # | Finding | Category | Impact | Effort | Risk | Request |
|---|---|---|---|---|---|---|
| 1 | Redeem mints a session for a replayed join; refused joins recorded with the secret; redemption limit bypassable | security | read access as any member whose join is readable; invitation hijack | S | LOW | `c657d4ba` |
| 2 | Checkpoint-after-publish loop republishes every ~62 s; orphan rooms alarm forever | cost | most of the idle cost; 43k noise entries a month per room | S | MED | `0b5ebd9e` |
| 3 | Placeholder `PUBLIC_URL` sends bearers to a third-party host; CLI writes server strings into git config; bodies read before the size check | security | token theft on a default deployment; client code execution | S | LOW | `55be0661` |
| 4 | Five-second alarm loop with no backoff; retries with no deadline; tables never pruned | cost | $155 to $777 per stuck room-month [predicted] | S-M | LOW | `99782949` |
| 5 | Job retries ignore the checker's retryable flag and have no cap; runner ignores the deadline; no per-room job budget | cost | runaway containers from one bad test; one room can starve the account | M | LOW | `2b1d287e` |
| 6 | Public founding unauthenticated and unlimited; unbound room IDs instantiate objects; names unnormalised | security, cost | unbounded recurring cost; name squatting | M | MED | `d226be30`, after D1 |
| 7 | No operator logging, metrics or inventory; container sizing unpinned; long polls keep rooms awake | cost | runaways run until the invoice | M | LOW | `d2cb872f` |
| 8 | Four signing and canonicalisation stacks, drifting; IDs, roles, error tables, redaction and push shapes duplicated | duplication | a byte difference breaks every signature on one side | M | MED | `4cd9b14f` |
| 9 | Glob validator drifted between room and policy; admin rules copied; landing state classes re-encoded; snapshot commit derived twice | duplication | a policy can activate with a glob the Room refuses; R-CARRY-15 depends on two tree encoders agreeing | S-M | LOW | `4fd06c76` |
| 10 | Non-holder propose runs pinning and diffs before the holder check; verify takes no expected room; weak keys; harness on workers.dev | security | resource amplification; log substitution verifies | S | LOW | `a872f4db` |
| 11 | Fakes and fault hooks in the production entry; manifests misstate imports; dead exports; git's Durable Object tests not in the gate | cruft | test code ships; tests can break unnoticed | S | LOW | `2246222d` |
| 12 | Three duty ledgers; alarm steps and their due times in two places; git tables unversioned; Room writes git's tables | layering | a git schema change breaks the Room at runtime | M | MED | `894c9030` |
| 13 | Four fake Artifacts; two SQLite adapters; ten copies of the measurement harness | duplication | tests pass against fakes that disagree with each other | M | LOW | `e7abe9c8` |
| 14 | Protocol amendments not folded in; READMEs are review deltas; result files; spikes unmarked; notes dangling; UI never live | cruft | readers get superseded rules; the shipped UI is a mock | L | LOW | `61bdd92b` |
| 15 | admission.ts prologue boilerplate; seven raw lane writes; core.ts at 1,722 lines; verifyLog at 509; body fields in three places; typecheck via generated declarations | simplification | every change touches the largest files | L | MED | `249d113d`, after the move |

**Not audited.** Performance under load, dependency versions and
licences, the UI's accessibility, and the policy evaluator's budget
rules. The security audit did not run any attack; it traced code paths.

## 2. Security

Routes a stranger reaches with no credential: draft and found, the name
lookup, redeem, acts (for a join, and to instantiate an object), and
requests up to signature verification. [Verified: `room/src/http.ts:82-101`]

**SEC-01. Redeem mints a session for a replayed join.** A client-custody
redemption calls `submit` and then `newSession` for whatever record comes
back (`requests.ts:204-208`). Idempotency, step 3 of admission, returns
the stored record for an exact-bytes replay before authority, invitation
state or custody are checked (`admission.ts:266-269`). Every accepted
join is sealed with its full signed envelope, so anyone who can read the
log, including a bearer, a delegated key, a former member or dependency
code in a check runner, can replay it and receive a one-hour renewable
read session as that member, which survives the attacker's own removal.
[Verified] Fix: a session only for a join this call committed.

**SEC-02. A refused join on the acts route is recorded with its secret.**
The acts route admits with default hooks, so refusals are recorded;
`roster()` runs policy refuse rules for a join; the refusal is sealed with
`ctx.signed`, which carries `body.secret`, and the schema exempts the
secret from the secret scan. The redeem route alone passes
`recordRefusals: false`. This contradicts R-GEN-6. The invitation stays
unused, so a log reader can sign their own join and retry through redeem.
[Verified: `admission.ts:214-220, 1485-1491`; `requests.ts:204`] Fix:
never record a refused join on any path.

**SEC-03. Public founding.** No credential, no rate limit, each call
creates an Artifacts repository, a first commit, a registry row and a
Publisher container; names bind first-come forever with no normalisation;
`createdAt` is unbounded. [Verified: `http.ts:82-87`; `founding.ts:45-49`;
`registry.ts:67-79`] This is also the largest cost exposure (COST-02).

**SEC-04. Placeholder public URL.** `room.ts:79` falls back to
`https://artroom.example.workers.dev` and `wrangler.jsonc:31` sets the
same; the CLI prints a ready-to-paste MCP command with the bearer token
pointed at it. [Verified]

**SEC-05. Git config injection in the CLI.** `cli/src/git.ts:61` writes
the server-supplied `remote` and `token` verbatim into an included git
config file. Quotes or newlines inject keys that run code on the next git
command. [Verified]

**SEC-06. Any room-ID-shaped path instantiates a Room.** `roomStub` maps a
`room_` ID straight to `idFromName` without the registry, and the
constructor creates the schema. [Verified: `http.ts:37-45`]

**SEC-07. The redemption rate limit** is an in-memory map keyed by caller
input before validation, never evicted, shared under one address for RPC
callers, and not applied to joins on the acts route. [Reported:
`requests.ts:175-197`; `worker.ts:56`]

**SEC-08. Non-holder propose does I/O first.** `preAdmission` pins objects
from the fork into the canonical repository, reads main and diffs every
generation before the holder check. [Reported: `admission.ts:207-208,
375-392, 692`]

**SEC-09. What a check attests.** A required tests or types check runs
the proposal's own `package.json` scripts and lockfile, which are not
under `.artroom/**`; whole-tree jobs get a read token for the entire
canonical repository including the log; runner output goes into the
recorded detail. Partly by design. [Reported: `checkers/src/checkers.ts:
30-50`; `room/src/jobs.ts:361-412`; `sandbox.ts:65-80`] Decision D2.

**SEC-10. Verify trusts entry 0.** `VerifyOptions` has no expected room
or checkpoint, so a substituted log verifies. [Verified:
`log/src/verify.ts:150-155`]

**SEC-11. Body size.** Chunked bodies are read whole before the 1 MiB
check; the MCP route has no cap. [Reported: `http.ts:47-51`;
`mcp/src/worker.ts:45-52`]

**SEC-12. Weak Ed25519 keys** are not rejected at founding, join,
delegate or rotate-recovery; mostly self-inflicted. [Reported, MED]

**SEC-13. The checker harness Worker** is on workers.dev behind one
shared header compared with `!==`, in the spike room's namespace, and can
revoke every token on any named repository. [Reported]

**Checked and sound.** Room ID before signature; domain tags; key IDs are
public keys; strict canonical JSON parsing; no re-delegation; recovery
lanes admin-only; bearer and session tokens hashed and re-judged; fork
tokens scoped to the fork; compare-and-swap pushes with ref fences;
runner has no internet and the token stays in the gateway; unknown
errors map to fixed messages. The earlier checker finding, a delegated
claim admitted after expiry, is closed at `a6330262` by `finalBoundary`
re-judging authority inside the write transaction. No path was found
where an `agent` or `member` reaches an admin-only effect.

## 3. Cost and manageability

**Billing units** (all fetched 2026-10-02 from developers.cloudflare.com;
published unless marked): Workers Paid $5 a month with 10M requests;
Durable Objects $0.15 per million requests and $12.50 per million GB-s
beyond included amounts, hibernating objects pay no duration; SQLite
$1.00 per million rows written beyond 50M, and **each `setAlarm` is one
row written**; Containers billed per 10 ms on provisioned memory and
disk, lite is 1/16 vCPU and 256 MiB; Workers AI $0.011 per thousand
neurons; **Artifacts: 10,000 operations a month included then $0.15 per
thousand, 1 GB storage included then $0.50 per GB-month, billing starts
2026-10-14, repositories persist until deleted, 1 GB per repository,
2,000 control-plane requests per 10 s per namespace.** Whether token
mint, revoke, list, info or fork count as operations is not stated, so
operation counts below are predicted as a low (git push and read only)
and a high (plus token calls) figure.

**Two profiles, per room-month** [Predicted counts, published prices]:

| Profile | Driver | Range |
|---|---|---|
| Idle room | 42k publications from COST-01: 84k to 336k Artifacts operations; Publisher container awake 24/7 at lite; log storage growth; alarms | $15 to $58 (about $0 without COST-01) |
| Active room, 10 lanes a day, 2 generations, 1 check, 1 review | idle cost plus 1,500 check runs at 3 s to 120 s each; optional LLM review; a Room kept awake by polling; lane operations; forks never deleted | $20 to $83, plus fork storage growing each month |

**COST-01. The publication loop.** `core.ts:1599` seals a checkpoint after
each publication; `core.ts:1713` arms a 60 s alarm whenever the head is
past `published_through`; `publicationDue` (`core.ts:1517-1524`) counts a
lag of one entry older than 60 s as due. `notes/deploy-spike.md:267`
observed it live. [Verified] Request `0b5ebd9e`.

**COST-02. Founding is free to the stranger** and costs the operator
forever; 1,000 scripted foundings predict $15k to $58k a month, and about
24,000 always-on lite Publishers would use the account's 1,500 vCPU cap,
stopping checks and landings for every room. [Verified path; predicted
cost] Request `d226be30`.

**COST-03. One Publisher container per room**, no instance type, no
`max_instances`, 15-minute inactivity never reached. [Reported:
`git/src/publisher/container.ts:51, 152-153`] Request `d2cb872f`.

**COST-04. Job retries** re-owe at +30 s with no cap and never read
`retryable`. [Verified: `jobs.ts:460-468`] Request `2b1d287e`.

**COST-05. The runner ignores the deadline**: `timeoutSeconds` has no
maximum, each step gets 600 s, the deadline is checked only at the start,
and the Room re-issues while the old container may still run.
[Reported] Request `2b1d287e`.

**COST-06. Every landing re-runs every check on every open proposal**
(`core.ts:1258-1304`); the LLM check never carries. [Reported] Decision
D3.

**COST-07. The five-second loop.** Any pending pin, preview, workspace,
re-evaluation, recompute or publication arms `now + 5_000` with no
backoff. [Verified: `core.ts:1704-1712`] Request `99782949`.

**COST-08. Forks, canonical repositories and rooms are never deleted.**
[Reported] Decision D4.

**COST-09. Orphan rooms** whose repository is gone alarm every 60 s
forever; every spike run left some. [Verified: `deploy-spike.md:272-274`]
Request `0b5ebd9e`.

**COST-10. No observability.** Zero console calls in room, git or checker
production paths; `room.ts:190` and `core.ts:1652` swallow failures;
`jobTokenDuties` and `tick` are unrouted. [Verified] Request `d2cb872f`.

**COST-11. Long polls and RPC subscriptions** keep the Room awake for
duration billing while the hibernatable WebSocket path exists.
[Reported] Request `d2cb872f`.

**COST-12. Some retries have no deadline by design** (`landing/core.ts:
61-64`); a lost mint is watched forever. [Reported] Request `99782949`.

**COST-13. No per-room job quota or `max_instances`.** [Reported]
Request `2b1d287e`.

**COST-14. Tables never pruned; `nextAlarm` scans them on every commit
without indexes.** [Reported] Request `99782949`.

**What has a cap today:** redemption (in memory only), notify retries
(every 5 min, no limit), token revoke retries (every 5 min), snapshot
repositories (deleted, 24 h), runner output (8 MiB), LLM diff (40k
characters, 1,200 output tokens), publication push attempts (5 per
call), long poll (60 s).

## 4. Duplication

**DUP-01. Four signing stacks.** `canonicalize` in client, log, room and
policy; `signingBytes` in room (takes payload bytes), client, log and
checkers (take a value and always canonicalise); six base64url codecs;
`parseStrict` twice with a nesting limit only in room's; `keyIdOf`,
`publicKeyOf`, `sha256Hex` and `digestJson` three or four times each.
The copies differ on `undefined` (client omits, others throw), on
reserved keys (policy refuses `__proto__`), and on depth. About 550
lines. The entry domain is signed only by room and log, which agree, so
the drift is latent today. [Verified] Request `4cd9b14f`.

**DUP-02. Glob.** `room/src/glob.ts` is `policy/src/glob.ts` with two
extra rules (256-character cap, `**` whole-segment) that policy lacks; the
Room uses both matchers in one process; the UI deliberately uses only
policy's. [Verified] Request `4fd06c76`.

**DUP-03. Entry and room IDs, sealing, checkpoints** duplicated between
room and log; the act-ID regex in five places with an unbounded seq in
verify. [Reported] Request `4cd9b14f`.

**DUP-04. The snapshot commit** derived in room and checkers with separate
tree encoders; the empty-tree SHA declared five times. R-CARRY-15 requires
identical IDs. [Reported] Request `4fd06c76`.

**DUP-05. Four fake Artifacts**, about 450 lines, each with its own token
semantics, which is exactly what the credential cleanup work keeps
changing. [Reported] Request `e7abe9c8`.

**DUP-06. ID regexes, role and kind lists** in eleven files. **DUP-07.
Error tables** in room and client, six refusal builders. **DUP-08. Token
redaction regex** in six source files and ten scripts; push limits and
refusal codes in both git and log. [Reported] Request `4cd9b14f`.

**DUP-09. SQLite test adapter** twice. **DUP-10. Measurement harness**
copied ten times with the account ID and a macOS-only path. [Reported]
Request `e7abe9c8`.

**DUP-11. Behaviour fakes** (client's 1,251-line fake room, the UI's
1,119-line mock world) re-implement rules the real Room has, with a
rough overlap check. [Reported, MED] Not filed: it folds into `e7abe9c8`
and the UI item of `61bdd92b` once the shared helpers exist.

**Not duplication:** `log/src/roster.ts` re-implements authority on
purpose so verification does not depend on room's code; the spikes are
frozen records.

## 5. Cruft

**CRUFT-01. The production entry point exports the fakes.** `room/src/
index.ts` re-exports `FakeArtifactsHost`, `FakeRepo`, `setFault`,
`setClock`, `setAlarmDelay` and `setServicesFactory`; `faultHook` is
module-level state called on production paths. [Verified] Request
`2246222d`.

**CRUFT-02. Legacy migrations** v2 to v8, the legacy lease, `ws_legacy`,
the registry legacy flag and the snapshot revision-3 upgrade exist for
states only the spike deployment had before 2026-10-01 22:55. [Reported]
Decision D5.

**CRUFT-03. The protocol.** Sections 24 to 30 are 1,099 of 3,244 lines and
define 14 rules; R-LOG-9 and R-CARRY-6, 9 and 10 are superseded without a
pointer. [Verified counts] Request `61bdd92b`.

**CRUFT-05. The UI is always the mock** and says the client's `connect`
does not exist; it does. [Verified] Request `61bdd92b`.

**CRUFT-06. Dead exports**, nine of them plus one contract type.
[Reported] Request `2246222d`.

**CRUFT-07. Harness Workers.** The Room imports its Publisher through the
lane B harness file; lane G's harness duplicates admission. [Verified
import] Request `2246222d` for the import; decision D5 for the rest.

**CRUFT-08. READMEs** are 4,372 lines, room's 1,719 with 23 review
sections before its reference material; 27 test files are named by
review ID. [Verified] Request `61bdd92b`.

**CRUFT-09. 68 result files**, 1.4 MB, two read as fixtures from another
package's directory. [Verified] Request `61bdd92b`.

**CRUFT-10. Spikes** unmarked, own lockfiles, pi-durable pinned 284
commits behind. [Reported] Request `61bdd92b`.

**CRUFT-11. Notes** have no index and cite files on unmerged branches.
[Reported] Request `61bdd92b`.

**CRUFT-12. git's Durable Object and pushlog suites** are not in its test
script, so the root gate never runs them. [Verified] Request `2246222d`.

## 6. Layering

The real graph: contract at the bottom; policy on contract; log on
contract and policy; git on contract; room on all of them plus client and
mcp/worker because it mounts the MCP endpoint; checkers on contract and
policy, with git only in its harness; client on contract; mcp on
contract, declaring client unused; cli on client and mcp; ui on contract,
policy and git, not on client. No cycles in production sources; one in
scripts. [Verified from manifests and imports]

**LAYER-01. The Room writes git's tables** (`core.ts:1368` inserts into
`artroom_ws_duty`; `:1708` joins `artroom_ws`), and git's ten tables have
no versioned migrations while the Room has a runner. [Verified] Request
`894c9030`.

**LAYER-06. The Room's "ports" are git's concrete classes** re-exported,
with five test-only hooks on the production services type and engines
composed in four places. [Verified: `ports.ts:127-136`; `config.ts:57`]
Request `249d113d`.

**LAYER-07. Same-name different-shape types** across packages, and
contract names shadowed. [Reported] Request `4fd06c76`.

**LAYER-08. Typechecking through generated declarations.** The Room's
`tsconfig` remaps log, client and mcp to `.types/*.d.ts` emitted by its
own typecheck script, so the IDE and a plain `tsc` see stale or missing
types. [Verified] Request `249d113d`.

**LAYER-11. Manifests misstate imports.** [Verified] Request `2246222d`.

**LAYER-12. Casts at the seams**: the Publisher stub, the checker
bindings, `as never` into policy's canonicaliser; the checker binding
names enforced by a regex over source text. [Reported] Request
`249d113d`.

## 7. Decisions for Hugh

Recorded as assert `82c29bcd`. Hugh's answers of 2026-10-02 are recorded
as assert `1c62cbf1`: D1 is deferred until the control-Rooms picture is
complete (`notes/2026-10-02-collections-of-rooms.md` and request
`d50ce26d`), because the controls are expected to live there; D5 is yes,
retire now, request `73eccbec`; D6 is any time. D2, D3 and D4 are open.

- **D1. Public founding.** Operator-signed grant per founding; a
  per-address quota with a Rate Limiting binding; proof of work; or open
  for the contest period only. Request `d226be30` waits on this.
  **Deferred** to the control-Rooms design.
- **D2. What a check attests.** Pin the command in checker configuration
  under `.artroom`; require admin approval when `package.json` or the
  lockfile change; or accept that review of the diff is the barrier and
  say so in the policy pack.
- **D3. Re-running checks when main moves.** Strict freshness as now;
  lazy re-run at the next land or attention; or debounce.
- **D4. Fork retention.** Delete after landing plus a retention period;
  keep forever; or keep until pinned, which is already at propose.
- **D5. Legacy migrations and harness Workers.** Wipe the spike objects,
  fold the migrations into one base schema and retire the harnesses to
  `measure/`; or keep them until the durable deployment exists.
- **D6. When the structural refactors run.** The review recommends after
  the jam's move, since they touch sealing transactions.

## 8. Relation to the self-hosting move

Against the staging in assert `5f2f7c4b`: `c657d4ba` and `55be0661`
should land before J3, founding the jam room, because the jam's room will
be a public deployment with invitations. `0b5ebd9e`, `99782949` and
`2b1d287e` should land before J2, the durable deployment, because a
durable deployment is where the loops start costing money, and before
2026-10-14 when Artifacts billing begins. `d226be30` depends on D1 and
should land before any deployment a stranger can reach. Everything else
can follow the jam's move; `249d113d` should.

## 9. Considered and rejected

- The three 16k-line `worker-runtime.d.ts` files: generated by `wrangler
  types` and gitignored; not cruft. Generating once at the root is a
  minor item inside `249d113d`.
- `zod` in the MCP package: a peer dependency of the MCP server.
- `log/src/roster.ts` duplicating authority: deliberate independence for
  verification.
- The `declare function connect` ambient pattern in contract: sound, and
  bound to implementations by tests.
- Existing `plans/001` to `004` and request `10fcfe4e` (canonical mint
  ownership): already owned; the credential findings here are not
  duplicates of them.
- Stale request `c0f0592f` (duties read): revived inside `d2cb872f`.

## 10. What woo's Durable Object write storms teach

Hugh asked for caution from the woo project's history, where Durable
Object re-write storms were costly. Sources: woo commits `6d2c425a` and
`50163fc1` (2026-08-02, the billing gate), `3f6e5a29` and `f4b5dbaf`
(2026-07-28), `spec/operations/net-cutover.md` and `observability.md`.

**What happened there.** Rows were written by fan-out across objects,
by retries and concurrent reads each minting a durable row, by caches
whose eviction window never closed, by startup migration and save on
cold init, and by a hot object's roster growing without bound. The
fixes were receipts that advance no head, FIFO quotas with insert and
prune in one transaction, dedup of no-op writes, per-turn budgets refused
by name, and a load gate of 250,000 total physical rows and 50,000 per
object, measured from the billing API because application counters
cannot see base-table plus secondary-index writes.

**Artroom's matching shapes** [Verified]:

| woo shape | Artroom site | Status |
|---|---|---|
| a row per alarm, alarms on every commit | `setAlarm` is one row written; `nextAlarm` runs at eight `committed()` sites and on the five-second loop | `99782949` |
| index multiplier | six secondary indexes on the Room's tables in `store.ts`, so one act is several physical rows | measured by `8bd623cc` |
| fan-out per principal | `attention` inserts one row per principal per item (`core.ts:859`), uncapped, never pruned | `99782949` gains caps |
| retry mints a row | `idem` written for every act (`admission.ts:1493, 1510`), never pruned | `99782949` gains a quota |
| fan-out on a trigger | policy activation recomputes every open proposal; every landing resets every open preview | D3 |
| startup amplification | `createSchema` and eight migrations on every new object | `73eccbec` |

**Applied.** Request `99782949` gains FIFO caps on attention and idem
with insert-and-prune in one transaction and a per-item fan-out cap.
Request `d2cb872f` gains a fail-closed rows-written gate from the
billing API. A new request measures physical rows per act, per alarm
tick and per publication on the spike before the durable deployment,
and ports woo's gate scripts; see the table below.

## 11. Requests filed

| Request | Scope | Priority |
|---|---|---|
| `c657d4ba` | join and redemption hardening (SEC-01, 02, 07) | now |
| `55be0661` | client and deployment hygiene (SEC-04, 05, 11) | now |
| `0b5ebd9e` | publication loop and orphan rooms (COST-01, 09) | before J2 |
| `99782949` | alarm backoff, retry deadlines, table hygiene (COST-07, 12, 14) | before J2 |
| `2b1d287e` | job budgets and deadlines (COST-04, 05, 13) | before J2 |
| `d226be30` | founding gate and unbound IDs (SEC-03, 06, COST-02) | after D1 |
| `d2cb872f` | container sizing and observability (COST-03, 10, 11) | before J2 |
| `a872f4db` | small security items (SEC-08, 10, 12, 13) | soon |
| `4cd9b14f` | one signing and identifier module (DUP-01, 03, 06, 07, 08; LAYER-02, 04) | after the jam's move |
| `4fd06c76` | glob, admin rules, snapshot commit, type names (DUP-02, 04; ARCH-02, 05; LAYER-03, 05, 07) | after the jam's move |
| `894c9030` | duty ledger, alarm steps, git migrations (ARCH-01, 06, 08; LAYER-01) | after the jam's move |
| `2246222d` | entry points, manifests, dead exports, test wiring (CRUFT-01, 06, 07, 12; LAYER-10, 11) | soon, small |
| `e7abe9c8` | one fake Artifacts, SQLite adapter, measure library (DUP-05, 09, 10; ARCH-10) | after the jam's move |
| `249d113d` | structural refactors (ARCH-03, 04, 07, 09, 11, 12; LAYER-06, 08, 12) | after the move, D6 |
| `61bdd92b` | documentation and repository hygiene (CRUFT-03, 05, 08, 09, 10, 11; LAYER-09) | any time |
| `82c29bcd` | decisions D1 to D6 (assert); answers in `1c62cbf1` | Hugh |
| `73eccbec` | retire the legacy migrations and harness Workers (D5) | now |
| `8bd623cc` | row-write accounting from the billing API and a fail-closed gate (woo lessons, assert `53fbb7e3`) | before J2 |

No files were written under `plans/`; the requests above carry the
handoff, as this project's practice is, and `plans/README.md` is left as
the credential cleanup audit wrote it.
