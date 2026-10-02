# Canonical token mints: who owns each token

2026-10-02. Gitseq request `10fcfe4e` (builder), from checker audit handoff
`9f2d8808` ([plans/README.md](../plans/README.md), "Canonical mint
ownership"). Branch `request/mint-ownership`, cut from main `3ac55e96`.
Revision 2 answers checker report `9ff903ab`; revision 3 answers the
checker's two follow-up points on it (landing token IDs, and check jobs'
deadline). Source line numbers are as at this revision's head, where no
source file differs from `3ac55e96`.

This is a design for review. It changes no source code. Approving it
authorizes no live operation and no implementation: lanes A, B and C below
each get their own gitseq request after approval, with their own decision
provenance. The normative text is [docs/protocol.md](../docs/protocol.md)
section 31 (R-MINT-1 to R-MINT-7).

## Summary

- One durable record owns each canonical token, from before its create
  request is sent until Artifacts answers its revocation. A new mint ledger
  in the Git package holds the record until another owner takes the token
  in one transaction.
- Before each request, the Room writes the record and stores a wake-up for
  taking it over. If either fails, nothing is sent. While a request is
  outstanding or a token is in use, that wake-up is kept in the future.
- Transient errors may still be retried, but each retry is a new record.
- An answer that gives a token ID makes the token known, whenever it
  arrives. Only a known token with its text can be used, and only by a
  caller still waiting for it. Any other known token is revoked by its ID.
- A create with no such answer, and no "refused, nothing changed" error,
  stays unknown for the life of the room. Time, token lifetimes,
  inventories and the end of the owner never settle it. The Room never
  revokes a token it cannot match by ID to its own record.
- Unknown creates are observed through one shared record: each pass writes
  a fixed number of rows, whatever the number of records kept.
- No token lifetime changes.

## The mint sites

A grep of every production source for `createToken(` finds these six.
"Today" is the behaviour at `3ac55e96`.

| # | Site | Repository, scope, lifetime | Today | Owner after this design |
|---|---|---|---|---|
| 1 | `packages/git/src/artifacts.ts:138`, `canonicalTokens().mint`, called by `landing/engine.ts:271` | canonical, write, 60 s (R-PUB-3) | `withRetry` (`artifacts.ts:104–131`) repeats a create after a possibly applied `INTERNAL_ERROR`. No record before the request. If the host stops between the answer (271) and `pushToken` (279), the token is recorded nowhere | Ledger, until `pushToken` claims it; then the push attempt; then plan 003's cleanup table, as now |
| 2 | `packages/git/src/artifacts.ts:143`, `canonicalTokens().mintRead` | canonical, read, 60 s | No production caller | Removed |
| 3 | `packages/git/src/publisher/client.ts:84`, `withToken`: `integrate` (106), the canonical half of `pinObjects` (159, 600 s), `pinRef` (179), `preview` (191) | canonical, write, 60 s or 600 s | `withRetry` as in 1. No record. A failed revocation is dropped (88) | Ledger |
| 4 | `packages/room/src/logremote.ts:45`, `withToken`: `readRef` (62), `push` (87) | canonical, read or write, 60 s | No record. A failed revocation is dropped (49) | Ledger |
| 5 | `packages/room/src/core.ts:202`, snapshot preparation's read of the canonical repository. Not named in the audit | canonical, read, 300 s | No record. A failed revocation is dropped (212) | Ledger |
| 6 | `packages/room/src/jobs.ts:371`, a whole-tree check job's token | canonical, read, until the job's deadline | A record (`mint:<job>`) before the request (366–367), one request, handoff in one transaction (387–400). But no wake is stored before the request, and `watchMint` (203–231) writes every due record on each observation | Ledger until claimed; then `job_tokens`, as now |

Mints on other repositories have other owners and are outside this design:
the workspace lease token (`workspaces.ts:446`, R-CRED-8), snapshot job
tokens (`snapshot/repos.ts:393`, R-CARRY-16), and the tokens that come with
a created repository or fork (`workspaces.ts:511, 830`, `repos.ts:322`).
The development harnesses (`packages/git/src/worker.ts:296, 324, 377`;
`packages/checkers/src/harness.ts:99, 140`) and the `measure/` scripts are
not production code.

`pinObjects` also mints a 600 s read token on the lane's fork
(`client.ts:155`), with the same hidden retry and dropped revocation. Its
owner should be the fork's own ledger, a different remedy. Builder will
file it as its own request after this design is approved.

## What Artifacts documents, and what the code relies on

Sources: the Workers binding page
(<https://developers.cloudflare.com/artifacts/api/workers-binding/>) and
the REST API page (<https://developers.cloudflare.com/artifacts/api/rest-api/>),
both read on 2026-10-02, and this repository. The Room uses the binding
only. `TokenInfo` and `MintedToken` (`artifacts.ts:9–21`) are local subsets
of what the code reads, not a description of the provider.

| Property | Binding page | REST page | This repository |
|---|---|---|---|
| Create takes | `createToken(scope?, ttl?)` | `repo`, `scope`, `ttl` (60 s to 1 year) | The same |
| Create answers | `plaintext` and `expiresAt` are named; an ID is not | `id`, `plaintext`, `scope`, `expires_at` | The code reads `id` from the binding, and the live spike revoked a lane token by its recorded ID (`notes/deploy-spike.md`, step 9) |
| A listing gives | `total` and `tokens`; no record fields named, and no creation time | `id`, `scope`, `state`, `created_at`, `expires_at`; filter by `state`; paged, 100 at most | `completeInventory` (plan 001) checks `id`, `scope`, `state`, `expiresAt` and `total` |
| Revoke | `revokeToken(tokenOrId)`, a boolean | by ID | By ID; by text in `snapshot/repos.ts:341–344` |
| Errors that mean nothing changed | Not documented | Not documented | `REFUSED_UNCHANGED` (`artifacts.ts:95`), from lane B's review |
| `INTERNAL_ERROR` after an applied request | Not documented | Not documented | Seen after a fork creation (`artifacts.ts:91`; `notes/2026-10-01-artroom-plan.md:120`). Assumed possible for tokens |
| A token name, label, metadata or idempotency key | Not documented | Not documented | None |
| A fence: a bound after which a failed request cannot apply, or a way to ask its outcome | Not documented | Not documented | None |
| When a token's lifetime starts | Not documented | Not documented | Assumed: when the create applies (`jobs.ts:267`) |
| Whether `listTokens()` returns revoked and expired tokens, and how many | Not documented | REST defaults to `active` | The in-memory fake returns all states |

So no attribution and no completion fence is documented in the interfaces
examined. A creation time (REST only) does not attribute either: concurrent
mints of one scope and lifetime look alike. The design therefore keeps a
durable record before each request, and observes and retains what it
cannot settle.

## The decision

### The ledger

A new class in the Git package, `MintLedger`, on the Room's SQLite, takes
every canonical mint: sites 1 and 3 to 6. Each record has a row ID, a
purpose (such as `publish:<op>:<n>` or `job:<job>`), the scope and lifetime
asked for, the time it was sent, and a state:

| State | Meaning | Ends when |
|---|---|---|
| `sent` | The request is out; no answer recorded | An answer; the bounded wait (becomes `unknown`); a takeover (becomes `unknown`) |
| `held` | Known by ID and text; given to a caller on this live host | Released, claimed by another owner, or a takeover (becomes `owed`) |
| `owed` | Known by ID; revocation due | Artifacts answers the revocation, or a readable reported expiry passes |
| `unknown` | The create may or may not have applied | The request's own later answer, or a provider fence (open point 42) |

A record is deleted when it ends. Every change to a record is a
conditional update of its own row ID in its expected state, so a late
completion can never change another record or another owner's row.

The ledger also keeps one summary row: the counts of `owed` and `unknown`
records, the takeover time, and the shared observation (its time, result
and next due time). Counts change in the same transaction as each record.

### What happens in each case

- **Before the request.** In one transaction, the record is written as
  `sent`. Then the ledger asks the Room to store a wake-up no later than
  the takeover time (below). The Room's `wake` reads the stored alarm and
  writes only if there is none, or a later one. If the record or the
  wake-up cannot be stored, the record is deleted and nothing is sent.
- **The answer.** It is classified once, whenever it arrives:
  - an ID and text, with the scope asked and a readable expiry no later
    than the answer's arrival plus the lifetime asked, while the caller
    still waits: the record becomes `held`, and the caller gets the token.
    This is the ledger's generic check. An owner may add a stricter one:
    a check job also needs the expiry by its absolute deadline (lane C);
  - an ID, but no text, another scope, an unreadable or longer expiry, or
    a caller that no longer waits: the record becomes `owed`, with the
    reported expiry, or none if it is unreadable. No caller gets the text.
    A token with no readable expiry stays owed until a revocation is
    answered;
  - an Artifacts error that says nothing changed: the record is deleted;
  - anything else (a transport failure, `INTERNAL_ERROR`, no ID): the
    record becomes `unknown`.
- **The bounded wait.** A caller waits at most 30 s for the answer. Then
  the record becomes `unknown` and the caller gets an error. If the answer
  comes later, while this host lives, it is classified as above: an ID
  makes the record `owed`, and a refusal deletes it. That answer proves the
  request's outcome; an inventory or a clock does not. The wait also keeps
  an unanswered create from holding the publication queue.
- **A failed handoff.** If the transaction that records an answer fails,
  the record keeps its earlier state. If the answer gave an ID, the ledger
  revokes it by that ID at once. Only when Artifacts answers that
  revocation does it delete the record, by its row ID.
- **A retry.** For the classes `retriable()` names, the ledger may try
  again, up to `withRetry`'s limits today (5 attempts, from 0.5 s). Each
  attempt is a new record and a new wake-up check, sent only after the
  previous record holds its outcome.
- **After use.** The holder releases the token: the ledger revokes it by
  ID, waiting at most 30 s. An answer deletes the record. A refusal or a
  timeout makes it `owed`, with a backoff from 1 s, doubling to 5 min. A
  late answer is dropped. Nothing is swallowed.
- **A handoff to another owner.** The landing engine claims the
  publication token inside `LandingCore.pushToken`'s transaction; check
  jobs claim theirs inside the transaction that writes the `job_tokens`
  row (`jobs.ts:387–400`). The claim deletes the ledger record in that same
  transaction, so a rollback leaves the ledger owning the token.
- **A takeover.** When a new object starts, the ledger turns every `sent`
  record into `unknown` and every `held` record into `owed`, due at once:
  a new object holds nothing. It does this in one indexed update of those
  states only. The Room's start-up recovery then stores a wake-up for the
  owed revocations and for the next observation. This closes the gap
  between `engine.ts:271` and `engine.ts:279`.
- **A late-applied create.** A create can apply after its record became
  unknown, with no answer reaching the Room. The token then exists with
  nobody holding its text, until it expires. The record stays `unknown`.
  The Room does not revoke the token, because it cannot tell it from
  another owner's.

### Wake-ups

The summary row holds one takeover time for the host. Before each send,
if the takeover time is less than 30 s away, the ledger moves it to 60 s
from now (one row write at most every 30 s), and in every case calls
`wake(takeover)` and waits for it, as founding does (plan 004).

While any record is `sent` or `held`, `nextDue()` includes the takeover
time. So an earlier alarm that runs for other work schedules the next one
no later than the takeover time. When the takeover alarm runs:

- on the same live host, with records still in flight: the takeover time
  moves 60 s ahead. The next wake-up is always in the future, so the alarm
  never spins;
- on a new object: the takeover above has already happened, and the alarm
  revokes the owed tokens and observes;
- with nothing in flight: the takeover time is cleared.

`nextDue()` also includes the earliest owed revocation and the next
observation. While a revocation pass waits on an answer, its records are
not due before that attempt's timeout (review f060871b).

### Bounded work per wake-up

Each read below uses an index. No step reads, writes or waits in
proportion to the number of records kept.

| Work | Bound per wake-up |
|---|---|
| Owed revocations | One pass at a time, off the publication queue, never awaited by the alarm. At most 20 records, earliest due first, then by row ID, so older debt goes first however many new mints arrive. At most 30 s per revocation. At most 20 record writes and one summary write |
| Observation | At most one, when due. One `listTokens()` call, waited on for at most 30 s. If the listing is incomplete (`completeInventory`) or has more than 1,000 records, that is the result, and nothing is counted. Otherwise each active, unexpired token's ID is looked up by primary key or index in three tables (below): at most 3,000 point lookups. One summary write: the time, the result and the next due time. No record is written, and no operation body is read |
| Observation schedule | After each observation, the next is due after a wait that doubles from 1 min to 6 h. A new unknown record brings it forward, but never sooner than 1 min after the last one. So there is at most one inventory a minute, whatever the rate of new unknowns |
| Takeover at start | One update of the `sent` and `held` records, whose number is the host's work in flight, not the history |
| `nextDue()` | Three indexed minimums and the summary row |
| `duties({ after, limit })` | One page of records by row ID, at most `limit`, with the counts from the summary row. Every record stays reachable by paging. None is ever evicted |

The observation looks up each listed ID in three places, each keyed by
token ID:

- the ledger's records (an index on their token ID);
- `job_tokens` (its primary key);
- a new landing table, `artroom_land_token (token TEXT PRIMARY KEY, op,
  n)`. Today a publication token's ID lives only inside
  `artroom_land_op.body`, in the push attempt (`core.ts:704–710`), and in
  plan 003's cleanup table once its operation has ended
  (`core.ts:155–167`). Neither can be read by token ID. The new table holds
  one row for every landing token not yet confirmed revoked, active or
  ended. `pushToken` inserts the row in the transaction that records the
  ID and claims it from the ledger. `tokenRevoked` (`core.ts:726–733`)
  deletes it in the transaction that marks the token revoked. Those are the
  only two places that change a token's state. A room stored before this
  change fills it once, under a meta key, from its active operations'
  unrevoked tokens and its cleanup table rows; an ended operation's
  unrevoked token is always in that table.

The ledger takes these as one callback, `known(tokenId)`, which the Room
builds from the three point lookups. The count is evidence for an
operator, not attribution: an operator's own tokens, and a founding token
not yet revoked, add to it.

On the normal path a mint writes three ledger rows: the record, its
answer, and its deletion by the claim or the revocation. A publication
token also writes and deletes its landing row. Request `8bd623cc`, which
is measuring physical rows per act, should measure this too.

### Rejected alternatives

- **Revoke whatever the inventory shows that the Room cannot name.** The
  repository holds other owners' tokens. This is the blanket revocation
  the handoff rules out.
- **Match an unknown create to a listed token by scope, expiry or creation
  time.** Concurrent mints share all three closely.
- **Settle an unknown create after its lifetime, or on a clean
  inventory.** Neither proves the create cannot still apply.
- **Remove every retry.** Safe, but proposals, previews and log pushes
  would fail outright on a transient error that a retry fixes today.
- **Write each observation onto every unknown record.** That is a row
  write per kept record per pass.
- **Leave check jobs on their own records.** They would need their own
  wake-up and bounded observation. Claiming from the ledger gives them
  both.

## Implementing lanes

Each lane is its own gitseq request, approved after this design, with its
own branch and exact-head checker review. B and C depend on A. Both touch
`packages/room/src/core.ts`, in different places: serialize them, or
reconcile the second head.

Each lane runs these gates at its exact head, and records the exit codes:
`npm ci`; `npm run typecheck`; `npm test`;
`npm run test:workers -w @generalbusiness/artroom-git`;
`npm run test:node -w @generalbusiness/artroom-room`;
`npm run test:workerd -w @generalbusiness/artroom-room`;
`npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run`
(bundles only). No live Artifacts call is needed.

### Lane A: the ledger (Git package, additive)

**Files:** new `packages/git/src/mints.ts`; `packages/git/src/index.ts`
exports it; new `packages/git/test/mints.test.ts`. No caller changes.

**API:** `new MintLedger({ sql, repo, now, wake, known, waitMs? })`,
where `known(tokenId)` answers whether another Room record holds that ID;
`mint(purpose, scope, ttl)` returns `{ id, plaintext, release(), claim() }`;
`withToken(purpose, scope, ttl, fn)`; `reconcile()`; `nextDue()`;
`duties({ after, limit })`.

**Tests.** The repository double's `createToken` can apply and then throw,
lose its answer, hold its answer, answer late, or refuse unchanged. Each
test is red with no ledger, or with the mutation named.

1. The record and the stored wake-up are both in place when `createToken`
   is called. A failed record write, or a failed wake-up, sends nothing
   and leaves no record.
2. Applied, then `INTERNAL_ERROR`: the record is `unknown`; the retry is a
   new record. The unknown record is still there after the lifetime has
   passed many times, after a complete inventory with nothing unaccounted,
   after an incomplete one, and after a takeover. No token outside the
   ledger's records is ever asked to be revoked.
3. A refusal that changed nothing deletes the record, with no retry.
4. Answers: an ID without text is owed and revoked by that ID; an
   unreadable expiry is owed with no expiry and stays owed through any
   time until a revocation is answered; another scope or a longer expiry
   is owed at once; no ID is unknown.
5. A held answer past 30 s: the caller gets an error and the record is
   `unknown`. The answer then arrives with an ID: no caller gets the text,
   and the record becomes `owed` and is revoked by that ID. A late refusal
   deletes the record.
6. A failed handoff (a trigger rejects the update): the record keeps its
   state, the ID is revoked at once, and the record is deleted only after
   that revocation is answered. Two mints in flight: a late completion of
   one never changes the other's row, or a row another owner has claimed.
7. Takeover: `sent` becomes `unknown`, `held` becomes `owed` and is revoked
   by its ID on the next `reconcile()`.
8. The takeover time is in `nextDue()` while a record is in flight; a run
   on the live host moves it 60 s ahead; it is cleared when nothing is in
   flight.
9. A failed or timed-out revocation stays owed with backoff (1 s to 5 min)
   across takeovers; a late answer is dropped; a completion that cannot
   commit counts as a failure; at most 20 records a pass; one pass at a
   time.
10. Scale: 10,000 kept unknown records, 1,000 known IDs, and new unknown
    records arriving on every turn. The SQL double counts rows read and
    written. Each turn: at most one `listTokens()`, one summary write for
    the observation, at most 20 record writes and one summary write for
    revocations, and rows read bounded by the batch, the page and the
    listing, not by the records kept. The next observation is never sooner
    than 1 min after the last; `nextDue()` is in the future after each
    turn; owed records due earlier are revoked before newer ones; paging
    `duties()` reaches every record once; the counts are exact.

**Mutation targets:** the record or the wake-up after the send; a failed
wake-up that still sends; settling an unknown record by inventory, by
lifetime or by the owner's end; a late ID left unknown; a late answer
given to the caller; a takeover time left out of `nextDue()`, or not moved
ahead; an observation written to each record; a new unknown that resets
the schedule to under 1 min; a revocation batch ordered by newest; an
unconditional update by row ID; a retry under one record; a swallowed
revocation failure; a `claim()` in its own transaction.

### Lane B: the publication token, and the ledger in the Room

**Files:** `packages/git/src/artifacts.ts` (remove `canonicalTokens`),
`packages/git/src/landing/engine.ts`, `packages/git/src/landing/core.ts`
(`pushToken` takes `claim`; the `artroom_land_token` table, written by
`pushToken` and `tokenRevoked`, filled once for a stored room, and read by
`knownToken(id)`),
`packages/git/src/worker.ts` (the harness builds its own ledger),
`packages/git/test/support.ts`, `packages/git/test/landing.test.ts`,
`packages/git/test-workers/landing-do.test.ts`, `packages/room/src/core.ts`
(build the ledger with `CoreOptions.wake`; a `mints` step; `nextAlarm()`),
and a new Room workerd test file.

**Change:** `PublicationTokens.mint(owner)` returns the ledger's token with
`claim`; the engine passes `claim` to `pushToken`. A new fault point,
`token-answered`, sits between the answer and `pushToken`.

**Tests** (1 and 2 are red at `3ac55e96`):

1. Stop at `token-answered`; restart within 60 s: the token is revoked by
   its ID, the publication completes forward with a new attempt, and there
   is one receipt.
2. The first create applies and fails with `INTERNAL_ERROR`: an unknown
   record stays; the retry's token is the one pushed; outcome, slot and
   receipts are as before.
3. A trigger that fails `pushToken`'s transaction leaves the ledger owning
   the token, with no landing row; the token is revoked later.
4. The landing row: present after `pushToken`; deleted by `tokenRevoked`,
   whether the held operation's own revocation or plan 003's cleanup pass
   answered; kept while a revocation fails, including after the operation
   ends; a trigger that fails the row's insert or delete rolls back
   `pushToken` or `tokenRevoked` with it.
5. A stored room with an active operation's unrevoked token and an ended
   operation's owed token gains both landing rows once, at its first
   start, and not again.
6. An observation over a listing that holds an active operation's token
   and an ended operation's owed token counts neither as unaccounted. The
   SQL double shows it read no `artroom_land_op` row.
7. All existing landing tests, plan 003's cleanup tests and review
   f060871b's Room control pass unchanged.
8. Durable Object controls, with real storage and alarms, and no request
   after the first:
   - no alarm stored beforehand: while the create is held, storage has an
     alarm no later than the takeover time;
   - a crash with the answer lost: abort the object while the create is
     held, apply it late, then run only `runDurableObjectAlarm`. The fresh
     object records the create as unknown, stores a bounded next alarm for
     the observation, observes once, and keeps the record;
   - an earlier alarm runs first: an alarm for other work runs while the
     token is held; afterwards, storage still has an alarm no later than
     the takeover time. Then abort the object; the next alarm takes over
     and revokes the token by its ID;
   - a wake-up that cannot be stored sends no create;
   - several alarms on a live host with a long-held token: each moves the
     takeover time ahead, and none is stored less than 1 s ahead.

**Mutation targets:** no `claim`; `claim` outside `pushToken`'s
transaction; the landing row written outside `pushToken`'s transaction,
or not deleted by `tokenRevoked`; the fill skipped, or run at every start;
`knownToken` reading operation bodies; the engine retrying the mint
itself; the ledger left out of `nextAlarm()` or of start-up recovery.

### Lane C: the other canonical sites

**Files:** `packages/git/src/publisher/client.ts` (`withToken` uses the
ledger for canonical tokens; the fork token is unchanged),
`packages/room/src/artifacts.ts` (passes the ledger to `Pinning`),
`packages/room/src/logremote.ts`, `config.ts` and `ports.ts` (`logRemote`
receives the ledger), `packages/room/src/core.ts:202–212`,
`packages/room/src/jobs.ts`, and tests.

**Check jobs:** `issue` mints through the ledger and claims inside the
`job_tokens` transaction. It keeps its own deadline checks, which are
stricter than the ledger's generic one: it asks for a lifetime that ends
before the deadline (`jobs.ts:371`); it accepts a token only if its
reported expiry is by the attempt's absolute deadline (`jobs.ts:385–386`),
and otherwise ends it at once; and it never sends an attempt once the
deadline has passed, ending its token instead (`jobs.ts:424–429`). `watchMint` and its `mint:<job>` rows go. A room
stored before this change moves its open `mint:` rows into the ledger as
`unknown` records once, under a meta key, so no unknown create is lost.
The tests in `job-token-mint.test.ts` keep their meaning, checked through
the ledger's duties.

**Tests** (each red at `3ac55e96`):

1. For each of `integrate`, `pinObjects`, `pinRef`, `preview`, the log
   remote's `readRef` and `push`, snapshot preparation and a check job: a
   lost answer leaves an unknown record, kept across a restart and two
   alarms, and nothing outside the Room's records is revoked.
2. For the same calls: a failed revocation is owed and revoked by its ID
   at a later alarm.
3. A stored room with open `mint:` rows: after the move, each is an
   unknown ledger record, once, and none is lost.
4. The deadline, beside the generic check: the room clock moves 20 s while the
   create's answer is held, so the answer passes the ledger's generic
   check (expiry no later than its arrival plus the lifetime asked) but
   its expiry is after the job's deadline. The token is not accepted, no
   job is sent, and the token is revoked by its ID. A second case: the
   expiry is by the deadline, but the clock passes the deadline before
   dispatch. No job is sent, and the token is ended. A third: a token
   whose expiry fails the generic check is refused too. Each case is red
   if `issue` relies only on the generic check.
5. A source scan: outside the harnesses, `measure/` and tests, only
   `mints.ts`, `workspace/workspaces.ts`, `snapshot/repos.ts` and
   `publisher/client.ts` (the fork token only) call `createToken`.

**Mutation targets:** a site that calls `createToken` directly; a dropped
revocation failure; the move run at every start, or not at all; `issue`'s
expiry check against the deadline removed; `issue`'s check for a passed
deadline before dispatch removed.

## Out of scope

- The fork read token in `pinObjects` (`client.ts:155`): builder files its
  own request after approval.
- Plan 003's cleanup records, which stay as they are.
- Token lifetimes: 60 s for publication, staging, previews and logs, 300 s
  for snapshot reads, 600 s for pinning, and up to the deadline for check
  jobs, as adopted.
- Showing the records to admins: the cleanup projection request
  (`8d249233`, the successor of `c0f0592f`) reads `duties()` page by page.
- Workspace, snapshot-repository and repository-creation tokens.
- The harnesses and `measure/` scripts, beyond keeping the Git harness
  compiling.
- A revocation that answers `false` still counts as done, as before.

## Open provider questions

Questions 1 to 4 are open points 42 to 45 in the protocol.

1. **A completion fence.** Can a failed create still apply later? Is
   there a bound after which it cannot, or a request ID whose outcome can
   be asked?
2. **Attribution.** Can a create carry a caller-chosen name, label or
   idempotency key that a listing returns or filters by?
3. **When a lifetime starts.** From when the create applies, or from when
   it was requested?
4. **What `listTokens()` returns.** All states or only active tokens, and
   is its size bounded? The observation's 1,000-record limit assumes it
   can be large.
5. Does `INTERNAL_ERROR` on a token create ever follow an applied create?
   It has been seen for forks only; the design assumes it can.
