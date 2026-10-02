# Canonical token mints: who owns each token

2026-10-02. Gitseq request `10fcfe4e` (builder), from checker audit handoff
`9f2d8808` ([plans/README.md](../plans/README.md), "Canonical mint
ownership"). Branch `request/mint-ownership`, cut from main `3ac55e96`. Every
line number below was read at `3ac55e96`.

This is a design for review. It changes no source code. The normative text
is [docs/protocol.md](../docs/protocol.md) section 31 (R-MINT-1 to R-MINT-6).

## Summary

- One durable record owns each canonical token, from before the create
  request is sent until Artifacts answers its revocation or its reported
  expiry has passed. A new mint ledger in the Git package holds that record
  for every site that has no owner today.
- Each create request has its own record, written before it is sent.
  Transient errors may still be retried, but each retry is a new record.
  There is no hidden retry under one record.
- Only a usable answer, or an Artifacts error that says nothing changed,
  settles a create. Anything else leaves it unknown.
- An unknown create is kept open for the life of the room and observed on
  a capped backoff. Nothing settles it: not time, not a token lifetime, not
  a clean inventory, not the end of its owner. The Room never revokes a
  token it cannot match by ID to its own record.
- A known token is revoked by its own ID. A failure stays owed, with
  backoff, off the publication queue. Ownership moves between records only
  in one transaction.
- The provider gives no way to attribute or fence an unknown create (see
  "What Artifacts offers"). So the token's lifetime, counted from when
  Artifacts applies the create, is the only bound on its exposure. No token
  lifetime changes.

## The mint sites

A grep of every production source for `createToken(` finds these. "Today"
is the behaviour at `3ac55e96`.

| # | Site | Repository, scope, lifetime | Today | Owner after this design |
|---|---|---|---|---|
| 1 | `packages/git/src/artifacts.ts:138`, `canonicalTokens().mint`, called by `landing/engine.ts:271` | canonical, write, 60 s (R-PUB-3) | `withRetry` repeats the create after a possibly applied `INTERNAL_ERROR` (`artifacts.ts:104–131`). No record before the request. If the host stops between the answer (271) and `pushToken` (279), the token is recorded nowhere | Mint ledger until `pushToken` takes it in the same transaction; then the push attempt; then plan 003's cleanup table, as now |
| 2 | `packages/git/src/artifacts.ts:143`, `canonicalTokens().mintRead` | canonical, read, 60 s | No production caller | Removed |
| 3 | `packages/git/src/publisher/client.ts:84`, `withToken`: `integrate` (106), `pinObjects` canonical half (159, 600 s), `pinRef` (179), `preview` (191) | canonical, write, 60 s or 600 s | `withRetry` as in 1. No record. A failed revocation is dropped (`client.ts:88`, `.catch(() => false)`) | Mint ledger |
| 4 | `packages/room/src/logremote.ts:45`, `withToken`: `readRef` (62), `push` (87) | canonical, read or write, 60 s | No retry, but no record. A failed revocation is dropped (49) | Mint ledger |
| 5 | `packages/room/src/core.ts:202`, snapshot preparation's read of the canonical repository | canonical, read, 300 s | No record. A failed revocation is dropped (212). Not named in the audit | Mint ledger |
| 6 | `packages/room/src/jobs.ts:371`, a whole-tree check job's token | canonical, read, until the job's deadline | Already meets these rules: intent row `mint:<job>` before the request (366–367), one request, handoff in one transaction (387–400), unknown kept and observed (`watchMint`, 203–232). Tests: `job-token-mint.test.ts` | `job_tokens`, unchanged; lane C widens only the IDs `watchMint` counts as known |

Mints on other repositories already have an owner, and are outside this
design: the workspace lease token (`workspaces.ts:446`, the fork's ledger,
R-CRED-8), snapshot job tokens (`snapshot/repos.ts:393`, deleted with the
repository, R-CARRY-16), and the tokens that come with a created repository
or fork (`workspaces.ts:511, 830`, `repos.ts:322`). The development harnesses
(`packages/git/src/worker.ts:296, 324, 377`;
`packages/checkers/src/harness.ts:99, 140`) and the `measure/` scripts are
not production code.

One parallel defect is on a fork, not the canonical repository:
`pinObjects` also mints a 600 s read token on the lane's fork
(`client.ts:155`) with the same hidden retry and dropped revocation. Its
owner should be the fork's own ledger, which can attribute tokens by
repository and sweep them. That is a different remedy, so it needs its own
request (see "Out of scope").

The audit's line numbers have moved since it was written: the retry is now
`artifacts.ts:104–131` (the error classes are at 88–95), and the landing
gap is between `engine.ts:271` and `engine.ts:279`. `client.ts:84` and
`logremote.ts:45` are unchanged.

## What Artifacts offers

| Property | Evidence in this repository | Status |
|---|---|---|
| Create takes only a scope and a lifetime | Binding: `createToken(scope?, ttl?)` (`artifacts.ts:24`). REST: `POST /tokens { repo, scope, ttl }` (`packages/git/measure/token-inflight.mjs:67`, `packages/room/measure/spike-smoke.mjs:158`) | Evidenced |
| The answer gives ID, text, scope and expiry | `MintedToken` (`artifacts.ts:16–21`); live results in `packages/git/measure/results/` | Evidenced |
| A listing gives ID, scope, state and expiry, and a total | `TokenInfo` (`artifacts.ts:9–14`), `completeInventory` (plan 001) | Evidenced |
| A listing can be filtered by state, and paged | REST `GET /repos/{name}/tokens?state=active&per_page=100` (the `measure/` scripts). The binding's `listTokens()` takes no argument | Evidenced |
| A token can be revoked by ID or by its text | `revokeToken(tokenOrId)`; `snapshot/repos.ts:341–344` revokes by text | Evidenced |
| The shortest lifetime is 60 s | R-PUB-3; `MIN_TOKEN_TTL_S` (`workspaces.ts`) | Evidenced |
| Some errors mean "refused, nothing changed" | `REFUSED_UNCHANGED` (`artifacts.ts:95`), from lane B's review (`notes/2026-10-01-laneB-git.md`, P1 rows) | Evidenced for those five codes |
| `INTERNAL_ERROR` (10400) can follow an applied request | Seen after a fork creation (`artifacts.ts:91`); about 5 in 70 creations failed and succeeded on retry (`notes/2026-10-01-artroom-plan.md:120`) | Evidenced for forks; assumed for tokens |
| Revocation does not stop a push already sent | `notes/2026-10-01-laneB-token-inflight.md`, case E | Evidenced |
| A token name, label, description, metadata or idempotency key | None. Repositories take a `description`; tokens do not | Not evidenced |
| A listing with a creation time | Only the in-memory fake has `createdAt` (`packages/room/src/memory/artifacts.ts:161`) | Not evidenced |
| A bound after which a failed create cannot apply, or a way to ask its outcome | None | Not evidenced |
| A lifetime counted from when the create applies | Assumed by `jobs.ts:267` and the fake | Assumed |

So the provider gives no attribution and no completion fence. The design
uses the fallback the handoff asks for: a durable record before the
request, and observation and retention after it.

## The decision

### One ledger

A new class in the Git package, `MintLedger`, on the Room's SQLite, owns
every canonical token of sites 1, 3, 4 and 5. Site 6 keeps `job_tokens`,
which already follows the same rules. Each ledger record has a purpose
(such as `publish:<op>:<n>` or `log-push`), a scope, the lifetime asked
for, the time it was sent, and one state:

| State | Meaning | Ends when |
|---|---|---|
| `sent` | The request is out; no answer recorded | The answer, or a restart (becomes `unknown`) |
| `held` | Known by ID; in use by this live host | Released (revoked), claimed by another owner, or a restart (becomes `owed`) |
| `owed` | Known by ID; revocation due | Artifacts answers the revocation, or the reported expiry passes |
| `unknown` | The create may or may not have applied | Never, without a provider fence (open point 42) |

A record is deleted when it ends. A create that Artifacts refused
unchanged deletes its record at once.

### What happens in each case

- **Before the request.** The record is written as `sent` in its own
  transaction. If that fails, nothing is sent.
- **A usable answer** (ID and text). In one transaction the record becomes
  `held`, with the token's ID and its reported expiry. If the scope or
  expiry is not what was asked, it becomes `owed` instead, and the caller
  gets an error.
- **A lost answer.** A transport failure, an `INTERNAL_ERROR`, any other
  error that is not "refused, nothing changed", or an answer without an ID
  and text: the record becomes `unknown`. It is never retried under that
  record.
- **A retry.** For the transient classes that `retriable()` names, the
  ledger may try again, up to the attempts and backoff `withRetry` uses
  today (5 attempts, from 0.5 s). Each attempt is a new record, written
  after the last one's outcome is. So an applied-then-failed attempt stays
  on record, and the retry keeps today's availability. This fences the
  retries; it does not remove them.
- **After use.** The holder releases the token: the ledger asks Artifacts
  to revoke it by ID, with a 30 s bounded wait. An answer deletes the
  record. A refusal or a timeout makes it `owed`, with a backoff that
  doubles from 1 s to 5 min. A late answer is dropped. Nothing is swallowed.
- **A handoff.** The landing engine takes the publication token by calling
  `claim()` inside the transaction of `LandingCore.pushToken`. That deletes
  the ledger record in the same transaction that writes the push attempt's
  token ID. If the transaction rolls back, the ledger still owns the token.
- **A restart.** The ledger's constructor turns every `sent` record into
  `unknown`, and every `held` record into `owed`, due at once: a new
  instance holds nothing. This closes the gap between `engine.ts:271` and
  `engine.ts:279`. Recovery at start (follow-up c9cd4cd8) then stores an
  alarm for the owed revocations.
- **A late-applied create.** If Artifacts applies a create after the Room
  recorded it as unknown, the token exists with nobody holding its text,
  and it expires on its own. The record stays `unknown`. An observation may
  see one more active token than the Room can account for. The Room does
  not revoke it, because it cannot tell that token from another owner's.

### Owed revocations

The ledger's revocation pass follows plan 003's rules (review f060871b):
it is started by the Room's alarm and not awaited there; it never runs on
the landing engine's publication queue; one pass at a time; at most 20
records a pass; 30 s per revocation; while a pass waits, its records are
not due before the attempt's timeout; a completion that cannot commit
counts as a failure. A known token's record also ends once its reported
expiry has passed, as job and workspace tokens do today. Plan 003's own
cleanup table, which keeps an ended operation's token past expiry, is
unchanged.

### Unknown records

The ledger keeps them and observes them. Observation reads one complete
inventory (`completeInventory`) of the canonical repository for all due
unknown records together. It writes on each record the time and the count
of active, unexpired tokens whose IDs no Room record holds: the ledger's,
the landing engine's (unrevoked tokens of active operations and plan 003's
cleanup table) and `job_tokens`. An incomplete inventory is noted as such.
The next observation is due after a wait that doubles from 5 s to 6 hours,
and starts again at 5 s when a new record becomes unknown. The count is
evidence for an operator, not attribution: other owners' tokens in flight,
an operator's own tokens and an unrevoked founding token all add to it.
`jobs.ts`'s `watchMint` uses the same set of known IDs.

Unknown records are kept for the life of the room. One record is a short
row, and one inventory serves all of them, so the cost grows only with
their number in storage. They are listed, without token text, by
`MintLedger.duties()`. Showing them to admins is the cleanup projection
request's work (`c0f0592f`).

### Wakes

The Room's `nextAlarm()` includes the ledger's earliest owed revocation
and next observation, and a new `mints` step runs the ledger's work. Each
wake does bounded work: one pass of at most 20 revocations, and at most
one inventory. A record in use by a live host is not due. No wake is
stored before each create: if the host stops, the token lifetime bounds
the token's exposure whether or not a wake comes first, and the next
instance takes the record over at start. A wake per create would add up
to one alarm per mint (log publication mints often) without shortening
the worst case, since a host can stop after its wake has run.

### Rejected alternatives

- **Revoke whatever the inventory shows that the Room cannot name.** The
  canonical repository holds other owners' tokens: mints in flight, the
  founding token, an operator's own. This is the blanket revocation the
  handoff rules out.
- **Match an unknown create to a listed token by scope, expiry or creation
  time.** Concurrent mints share scope and lifetime, and the binding gives
  no creation time.
- **Settle an unknown create after its lifetime, or on a clean inventory.**
  Neither proves that the create cannot still apply.
- **Remove every retry.** Safe, but it would make proposals, previews and
  log pushes fail outright on a transient error that a retry fixes today.
  A retry as a new record is just as safe.
- **Move job tokens and plan 003's records into the ledger.** Both already
  meet these rules and are reviewed. Moving them is churn.

## Implementing lanes

Each lane is its own gitseq request, branch and exact-head checker review.
B and C depend on A. B and C both touch `packages/room/src/core.ts`, in
different places; serialize them or reconcile the second head.

Every lane runs these gates at its exact head, and records the exit codes:
`npm ci`; `npm run typecheck`; `npm test`;
`npm run test:workers -w @generalbusiness/artroom-git`;
`npm run test:node -w @generalbusiness/artroom-room`;
`npm run test:workerd -w @generalbusiness/artroom-room`;
`npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run`
(bundles only). No live Artifacts call is needed.

### Lane A: the ledger (Git package, additive)

**Files:** new `packages/git/src/mints.ts`; `packages/git/src/index.ts`
exports it; new `packages/git/test/mints.test.ts`. No caller changes.

**API:** `new MintLedger({ sql, repo, now, known?, revokeTimeoutMs? })`;
`mint(purpose, scope, ttl)` returns `{ id, plaintext, release(), claim() }`;
`withToken(purpose, scope, ttl, fn)`; `reconcile()`; `nextDue()`;
`duties()`.

**Tests**, against an in-memory repository handle whose `createToken` can
apply and then throw, lose its answer, hold its answer, or refuse unchanged.
Each test is red with no ledger, or with the mutation named:

1. The record is in storage when `createToken` is called. A failed record
   write sends nothing.
2. Applied, then `INTERNAL_ERROR`: the first record is `unknown`; the retry
   is a second record; after release, only the unknown record remains. It
   is still there after the lifetime has passed many times over, after a
   complete inventory with nothing unaccounted, after an incomplete one, and
   after a restart. No unrelated token is ever asked to be revoked.
3. A refusal that changed nothing deletes the record, with no retry.
4. An answer without text is unknown. An answer whose scope or expiry is
   wrong is owed at once and revoked by its ID.
5. Restart: `sent` becomes `unknown`; `held` becomes `owed` and is revoked
   by its ID on the next `reconcile()`.
6. A failed or timed-out revocation stays owed, with backoff 1 s, 2 s, …,
   5 min, across restarts; a late answer is dropped; a completion that
   cannot commit counts as a failure; at most 20 records a pass; one pass at
   a time; `nextDue()` while a pass waits is the attempt's timeout.
7. Observation: one inventory for any number of due unknown records; the
   wait doubles to 6 hours and starts again at 5 s for a new unknown record;
   it never settles a record and never revokes.
8. `claim()` inside a transaction that rolls back leaves the record owned
   by the ledger.
9. `duties()` carries no token text.

**Mutation targets:** write the record after the send; settle an unknown
record on a clean inventory; settle it after its lifetime; retry under one
record; revoke an unaccounted token; swallow a revocation failure; no
backoff cap; no restart conversion of `sent` or of `held`; one inventory
per record; no observation cap; `claim()` in its own transaction; release
awaited without a timeout.

### Lane B: the publication token and the Room's wiring

**Files:** `packages/git/src/artifacts.ts` (remove `canonicalTokens`),
`packages/git/src/landing/engine.ts`, `packages/git/src/landing/core.ts`
(`pushToken` takes `claim`), `packages/git/src/worker.ts` (the harness
builds its own ledger), `packages/git/test/support.ts` (`FakeTokens`),
`packages/git/test/landing.test.ts`,
`packages/git/test-workers/landing-do.test.ts`,
`packages/room/src/core.ts` (build the ledger, the `mints` step,
`nextAlarm()`, the known-ID set), and a new Room workerd test.

**Change:** `PublicationTokens.mint(owner)` returns the ledger's token,
with `claim`. The engine passes `claim` to `pushToken`. A new fault point,
`token-answered`, sits between the mint's answer and `pushToken`.

**Tests:**
1. Stop at `token-answered`; restart on the same SQLite within 60 s: the
   ledger revokes that token by its ID, the publication completes forward
   with a new attempt, and there is one receipt. Red at `3ac55e96`: the
   token is never revoked.
2. The first mint applies and then fails with `INTERNAL_ERROR`: an unknown
   record stays open; the retry's token is the one pushed; the landing's
   outcome, slot and receipts are as before. Red at `3ac55e96`: no record.
3. A trigger that fails `pushToken`'s transaction leaves the ledger owning
   the token, and the token is revoked later.
4. Every existing landing test, plan 003's cleanup tests and review
   f060871b's Room control pass unchanged.
5. Room workerd: a fresh object with an owed ledger record and no alarm
   stores one, and its alarm revokes the token.

**Mutation targets:** no `claim`; `claim` outside `pushToken`'s
transaction; the engine retries the mint itself; the Room leaves the
ledger out of `nextAlarm()`.

### Lane C: the other canonical sites

**Files:** `packages/git/src/publisher/client.ts` (`withToken` uses the
ledger for canonical tokens; the fork token is unchanged),
`packages/room/src/artifacts.ts` (passes the ledger to `Pinning`),
`packages/room/src/logremote.ts`, `packages/room/src/config.ts` and
`ports.ts` (`logRemote` receives the ledger),
`packages/room/src/core.ts:202–212` (snapshot preparation's read),
`packages/room/src/jobs.ts` (`watchMint`'s known-ID set), and tests.

**Tests**, each red at `3ac55e96`:
1. For each of `integrate`, `pinObjects`, `pinRef`, `preview`, the log
   remote's `readRef` and `push`, and snapshot preparation: a lost
   `createToken` answer leaves an unknown ledger record, kept across a
   restart and two alarms, and nothing unattributed is revoked.
2. For the same calls: a failed revocation leaves an owed record, which a
   later alarm revokes by its ID.
3. `watchMint` does not count a token the ledger holds.
4. A source scan: outside the harnesses, the measure scripts and tests,
   only `mints.ts`, `jobs.ts`, `workspace/workspaces.ts`,
   `snapshot/repos.ts` and `publisher/client.ts` (the fork token only) call
   `createToken`. It fails if a new site bypasses the ledger.

**Mutation targets:** a site that calls `createToken` directly; a site
that drops a revocation failure; `watchMint` with only `job_tokens` IDs.

## Out of scope

- The fork read token in `pinObjects` (`client.ts:155`). It needs its own
  request, with the fork's ledger as its owner.
- Moving job tokens or plan 003's records into the ledger.
- Any token lifetime. The 60 s publication, staging, preview and log
  tokens, the 300 s snapshot read and the 600 s pinning tokens stay as
  adopted.
- Showing the records to admins (request `c0f0592f`).
- Workspace, snapshot-repository and repository-creation tokens, which
  their own ledgers own.
- The development harnesses and `measure/` scripts, beyond keeping the Git
  harness compiling (lane B).
- A revocation that answers `false` still counts as done, as before.

## Open provider questions

Questions 1 to 3 are open points 42, 43 and 44 in the protocol.

1. **A completion fence.** Can a failed create request still apply later?
   If so, is there a documented bound after which it cannot, or a request
   ID whose outcome can be asked? Either would let R-MINT-5 close unknown
   records.
2. **Attribution.** Can a create carry a caller-chosen name, label or
   idempotency key that a listing returns, or can a listing be filtered by
   one? Either would let the Room revoke its own unknown token, and only
   that.
3. **When a lifetime starts.** Does a token's lifetime run from when the
   create applies, or from when it was requested? The design assumes the
   first. If it is the second, the exposure bound runs from send time and
   is tighter.
4. **Does `INTERNAL_ERROR` on a token create ever follow an applied
   create?** It has been seen for forks only. The design assumes it can.
