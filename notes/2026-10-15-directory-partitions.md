# Directory partitions

**Proposed design for checker review; no Source change.** Request
`6aa3bc30`, owned by the planner, from builder act `49c7c811` and checker
decision `c9a2c676` ("Directory lifetime"). Read against main
`0548b726d0`. This note ran no tests, gate or provider operation.

## 1. Problem

A room has one directory scope. It opens every lane, numbers it, and keeps
one index row for it. Its journal never shrinks.

| Fact | Source at main `0548b726d0` |
|---|---|
| A scope holds at most `scopeEntries` entries, 100,000, counted over its whole life. | `packages/contract/src/bounds.ts:63`, `:112` |
| The directory allows 100,000 lane rows, 1,000 task rows and 1,000 application rows. Rows are never removed. | `packages/platform/src/directory.ts:189`, `:211`; `application.ts:81` |
| Every lane update that changes a listed field (title, state, labels, assignees) sends an `index` advisory to the directory, and each one is a directory entry. | `apps/room/lanes/definitions/issue.json` (`edit-*`, `label`, `assign`, `close-*`, `reopen-*`); `directory.ts:321-343` |
| A lane's directory is fixed at the lane's genesis: its creator, when that is a directory, or the directory its creator recorded. | `packages/derive/src/sends.ts:31-36`, `:258`, `:302-306` |
| A full scope answers a delivery `retry("scope-full")`. An advisory is never given up, so each lane keeps resending it. | `packages/scope/src/delivery.ts:238`; `outbox.ts:14-19`, `:137` |
| Finding a lane's row walks every page of rows. | `directory.ts:427-436` (`rowOf`) |
| The CLI reads every row, then every lane's whole summary. | `packages/cli/src/commands.ts:1739-1759`, `:1844` |
| A page of items already reads the `(type, state, id)` index and costs only the rows it returns. | `packages/scope/src/sqlite.ts:80`, `:194-201` |

So the directory's budget is spent by lane creations and by every later
update of every lane. Archive does not free it (section 15 of
`notes/2026-10-09-shared-language-volatile-acts.md`). Moving rows into
several scopes does not help if one root scope still records each update.

## 2. Terms

- **Root**: the room's directory scope. It keeps the repository, the
  three child references, import and the `compromised` relay. In the new
  version it also keeps the partition list. It opens no lane.
- **Partition**: a scope of kind `directory` that the root creates. It
  opens lanes, tasks and applications, numbers lanes and keeps their rows.
  Its lanes record it as their directory.
- **Generation**: the ordinal of a partition in the root, from 1.
- **Active partition**: the one partition that opens lanes now.
- **Sealed** (of a partition): it opens no more lanes, tasks or
  applications. It still records index updates for the lanes it opened.
  This is not the "sealed entry" of the scope contract.
- **Handoff**: sealing the active partition and creating its successor.

## 3. Decision

1. New rooms use a new cohort: a new root version and one new partition
   definition. Old pins are frozen. No room is migrated.
2. The root records a bounded number of entries per generation: at most
   two (the seal delivery and the successor's creation result). It records
   nothing per lane, per task or per lane update.
3. A partition seals by a signed act once a quarter of its entry budget
   is used. The rest is its **update allowance**: room for index updates
   from the lanes it already opened.
4. Numbers come from a fixed range per generation, so no two partitions
   can give the same number and no partition reports numbers to the root.
5. Authority uses existing grants and guards. No new grant and no new
   membership version.
6. Reads page the root's partition list, then each partition, through the
   existing `(type, state, id)` index.
7. A full partition is still a full scope. One small contract change is
   proposed for index advisories that reach it (section 4.7, A1).

## 4. Protocol

### 4.1 Versions

| Definition | Kind | Change |
|---|---|---|
| `platform:directory@9` (root) | `directory` | The data of `@8` (`application.ts:131`), without the items `lane`, `task`, `application`, without the acts that open them and without the `index` handler. Adds the item `partition`, the act `open-partition`, the handler `seal` and the send mark `create-partition`. |
| `platform:directory-partition@1` | `directory` | New. The lane, task and application items, acts and the `index` handler of `@8`, unchanged in meaning; a control item from its genesis; the acts `seal` and `retry-seal`. |
| A new register version | `register` | Maps to `platform:directory@9` in `DIRECTORY_OF` (`register.ts:57`). |
| A new cohort | | Pins the above beside existing membership, rules and destination versions (`index.ts:125-154`). |

The partition has kind `directory` on purpose. Then the platform's
existing rules route its lanes' `index` sends to it and name it in every
`create` of a lane (`sends.ts:31-36`, `:258`) with no change. The
destination accepts deliveries only from `platform:directory`
(`destination.ts:130`), so it never takes a partition for the root.

### 4.2 Root records

The `repository` item gains one value, `generations` (count, default 0).

New item `partition`, many, at most 10,000:

| Slot | Kind | Set by |
|---|---|---|
| `generation` | value, int, fixed | the entry that opens it: `generations` + 1 |
| `base` | value, int, fixed | the same entry: `(generation - 1) × SPAN + 1` |
| `scope` | ref, kind `directory` | the `applied` clause of its creation |

States: `creating`, `active`, `sealed` (final), `refused` (final),
`conflict` (final).

**Invariant P1.** At most one `partition` item is `creating` or `active`.
The root's turns are serial, so the guards below keep it.

`create-partition` (send mark, one request): a `create` of kind
`directory`, definition `platform:directory-partition@1`. Its body is
`{ fields, directory: root, membership }`, as `create-lane` builds one
(`directory.ts:739-756`). Fields: `generation`, `base`, and the root's
`membership`, `rules` and `destination` references with incarnations.
Clauses: `applied` sets `scope` and state `active`; `refused` and
`conflict` set those states.

### 4.3 Partition records

Genesis `establish-partition`, by the root's `create`. It opens one
control item with the fixed refs `root`, `membership`, `rules` and
`destination`, the fixed values `generation` and `base`, and `lastNumber`
set to `base - 1`. If the item keeps the type name `repository`, then
`directoryMembership` and `directoryRulesScope` (`directory.ts:411-421`)
and the guards that read them work unchanged. Its state is `open`, then
`sealed`.

The partition copies the root's references once. The root sets each of
them once, from its children's creation results, and never changes them.

### 4.4 Numbers

`SPAN` is 100,000, a constant of the partition definition. Generation g
numbers from `base = (g - 1) × SPAN + 1`. `next-number` and
`index-number` (`directory.ts:438-444`, `:712-724`) work as now, from the
partition's `lastNumber`. They refuse a number above `base + SPAN - 1` as
`scope-full`, naming the dimension `numbers`.

Each partition entry takes at most one number, and a partition holds at
most `scopeEntries` entries. So while `scopeEntries` ≤ `SPAN` the range
cannot run out. If a deployment raises `scopeEntries` past `SPAN`, the
refusal keeps numbers unique. 10,000 generations × `SPAN` = 10^9, the
`number` field's maximum. The cost is visible: numbers jump at each
generation, for example from #8,214 to #100,001. See Q2.

### 4.5 Acts, handlers and grants

| Where | Act or handler | Grant or sender | Guard | Effect and send |
|---|---|---|---|---|
| Root | `open-partition` (act) | `issue.open` | The three child refs are set, and no `partition` item is `creating` or `active` (P1). | Opens `partition` `creating`; `generations` + 1; `create-partition`. |
| Root | `seal` (`tell` handler) | From kind `directory` under `platform:directory-partition` | The sender is the `scope` of the `active` item. Otherwise refused `not-the-active-partition`. | That item becomes `sealed`; opens the next item `creating`; `create-partition`. One entry. |
| Partition | `open-issue`, `open-pr`, `open-task`, `establish-application` | As today: `issue.open`, `change.open`, `task.control`, `application.establish` | Added guard `partition-open`: state `open` and `head + 1 < SEAL_AT`. Refusals `partition-sealed` and `partition-full`. | As today. |
| Partition | `seal` (act) | `issue.open` | State `open` and `head + 1 ≥ SEAL_AT`. | State `sealed`; one written `tell` `seal` to `root`. |
| Partition | `retry-seal` (act) | `ledger.retry` | State `sealed`, and the last `seal` request has a diagnosis and no result. | A new `tell` `seal` to `root`, as `retry-import` does (`directory.ts:308-319`). |
| Partition | `index` (advisory) | From kind `lane` | None, as today. | As today, in every state. |

`SEAL_AT` is `⌊scopeEntries / 4⌋`, a proposal for R4 to measure (Q8).

Why `issue.open`. Every role that may open anything in a partition holds
it (`membership.ts:99-113`). The guards, not the grant, limit these acts:
`open-partition` can only take effect when the room has no live
partition, and `seal` only when the partition is at its threshold. A new
grant would need a new membership version and adds no safety (Q5).

Why `seal` is an act and not a side effect of the last opening. A send
list may hold at most one conditional mark (scope contract revision 19,
section 6.1), and the opening acts already hold `create-lane`. An
advisory handler may send nothing, so an `index` delivery cannot seal.

The root keeps `compromised` (`directory.ts:344-362`) and `retry-import`.
Membership still tells the root (`membership.ts:512`).

### 4.6 State changes

| Scope | From | Input | To |
|---|---|---|---|
| Root item | (none) | `open-partition`, or `seal` from the active partition | `creating` |
| Root item | `creating` | creation result `applied` / `refused` / `conflict` | `active` / `refused` / `conflict` |
| Root item | `active` | `seal` from its own scope | `sealed` |
| Partition | `open` | `seal` act | `sealed` |

A `refused` or `conflict` item leaves the room with no live partition. The
next opener signs `open-partition`. That generation's number range stays
unused.

### 4.7 Late deliveries and the full partition

- An `index` from any lane goes to the partition that opened it, or that
  its creator recorded, for the lane's whole life. Concern lanes created
  after the seal also index into the sealed partition. Nothing reaches the
  successor or the root.
- An opening act sent to a sealed partition is refused `partition-sealed`.
  The client resolves the active partition again and signs a new intent.
- Task and application creation results go to the partition that sent the
  creation, and settle under the existing reservation (`reserve.ts:156-161`).
- A second `seal` from the same partition is refused by the root. The
  partition's `refused` clause is empty.

When a partition's journal reaches `scopeEntries`, its update allowance is
spent. Today an `index` then gets `retry("scope-full")`, and each lane
resends it forever. **Amendment A1 (proposed, Q1):** a platform handler
may declare `full: "drop"`. A delivery to that handler, when the scope is
full, gets the answer `dropped`. The receiver writes nothing. The sender
records the answer in the attempt log, as bookkeeping, and stops. Only the
partition's `index` handler declares it. The lane stays authoritative for
its own fields. Readers see the partition is full from its head, and
treat its rows as possibly stale. Without A1, today's behavior stays.

## 5. Reads

| Read | How | Cost |
|---|---|---|
| Active partition | Root `page("partition", ["active"], null, 1)`. Empty with a `creating` item: retry later. Empty with none: sign `open-partition`. | One index seek. |
| Partition list | Root `page("partition", ["active", "sealed"], after, 100)`. Item IDs rise with generation. | Rows returned, plus one per state. |
| Lanes of the room | For each partition in order, the bounded item query of `notes/2026-10-15-item-query-page.md` on `("lane", ["listed"])`. | Rows returned per page. |
| Lane by number n | `g = ⌊(n - 1) / SPAN⌋ + 1`; partition g from the list; then its row. | See Q4 for the row. |
| Partition of a lane | The lane's genesis (`directoryOf`, `sends.ts:31-36`). | One entry read. |

A room-wide cursor is `(generation, partition cursor)`. The partition
cursor is bound to that partition's full reference and head, as the item
query requires. On head drift it restarts that partition's pages only. A
listing states, for each partition, the head it is complete at. It never
claims a room-wide snapshot. The rows are an index that can lag; current
issue state comes from each lane by a bounded singleton read, never from
a whole summary (checker `c9a2c676`, "Consumers").

## 6. Handoff failure and restart

| Case | What happens | Outcome |
|---|---|---|
| Crash before the partition's `seal` entry commits | Nothing recorded. | The client signs `seal` again. |
| Crash after that entry, before dispatch | The `tell` is in the outbox, written with the entry. | The alarm dispatches it. |
| Root unavailable past the routing-refusal limit | The partition writes a diagnosis. | An admin signs `retry-seal`. |
| Root crashes during the `seal` turn | Nothing committed. | Redelivery; judged again. |
| Root commits the seal, crashes before the `create` leaves | The `create` is in the root's outbox. | The alarm dispatches it. |
| The `create` arrives twice | The second is a repeat, answered from the genesis (`derive/src/genesis.ts:110-113`). | One successor. |
| The successor's creation is refused or conflicts | Item `refused` or `conflict`; no live partition. | The next opener signs `open-partition` for a new generation. |
| Two members sign `seal` at once | The partition's turns are serial. | The second is refused `partition-sealed`. |
| A late `seal` and a `retry-seal` both arrive | The first takes effect. | The second is refused `not-the-active-partition`. |
| `open-partition` races a `seal` | The root's turns are serial; P1 holds. | One live partition. |
| A client holds a stale active partition | Its opening act is refused `partition-sealed`. | It reads the root again. |

Between the seal and the successor's `applied` result there is no active
partition, and openers wait. The wait is bounded by the dispatch retry
policy (`dispatchRetryMaxSeconds`, 300 seconds).

## 7. Budget over the room's life

- Root: its founding entries; at most two entries per generation (a
  `seal` delivery or an `open-partition` act, and one creation result);
  two per `compromised` relay; the import. 10,000 generations use at most
  20,000 entries. Key compromises remain the one input that grows without
  a per-generation bound, as today.
- Partition: registrations until `SEAL_AT`, then index updates and
  settlements until `scopeEntries`, then A1 or today's refusal.
- Membership, rules, destination and lanes keep their own budgets.

## 8. What stays unchanged

- Rooms on `platform:directory@1` to `@8` and their registers and cohorts.
  They keep the interim behavior that `c9a2c676` chose: `scope-full` with
  reserved settlement entries (request `cc570904` and its owners).
- `scopeEntries` and the settlement reserve. Nothing raises a constant,
  resets history or moves entries.
- Lane definitions, the `index` routing rule and the `create` body rule.
- The membership role table and every grant. Membership, rules and
  destination definitions and their reference to the root.
- The bounded item query and its owners. The archive design.

## 9. Witnesses

Use small `scopeEntries` and real Durable Object storage, as the existing
budget witnesses do.

| Invariant | Witness | Control that must fail |
|---|---|---|
| Root growth is per generation | Open lanes through three generations with many index updates. The root's head grows by at most two per generation and not with lanes or updates. | A root that records each index |
| P1, one live partition | Interleave `seal`, `retry-seal` and `open-partition` deliveries. At every root head at most one item is `creating` or `active`, and each sealed generation has one successor. | Remove the P1 guard |
| Unique numbers | Issues and post-seal concerns in two generations. Every number is in its range; no number repeats. | Drop the base offset |
| Seal threshold | At `SEAL_AT - 1` an opening act is refused `partition-full`; `seal` takes effect; the next opening is refused `partition-sealed`; an `index` still records. | Omit `partition-open` |
| Restart | Stop after the partition's seal entry, and after the root's seal entry, before dispatch. The final root and partition items equal an uninterrupted run. | Send the `seal` outside the entry |
| Refused successor | A runtime stand-in refuses the creation; `open-partition` creates the next generation; the refused range stays unused. | |
| Late deliveries | An `index` from a lane of a sealed partition lands there, never in the successor or root. | |
| Authority | `open-partition` without `issue.open`, early `seal`, and a `seal` from a sealed or foreign directory-kind scope are refused. The partition's refs equal the root's. | |
| Bounded reads | Three partitions beside 3,000 unrelated rows: rows read per page are at most the limit plus one per state; head drift restarts one partition's cursor. | A filter over all rows |
| Old pins | Existing `@1` to `@8` witnesses replay unchanged. | |
| A1, if adopted | A full partition answers `dropped`; the lane's row is acknowledged; the partition's head does not move. | Without A1 the row is resent |

## 10. Open questions for checker

| # | Question | Proposed |
|---|---|---|
| Q1 | Adopt A1 (`dropped` for a declared advisory handler of a full scope), or keep endless resends to a full partition? | Adopt A1. It changes delivery section 7.4 only for a declared advisory handler. A verifier reads no acknowledgments, so replay is unchanged. |
| Q2 | Accept number jumps per generation, or dense numbers? Dense numbers need concern rows after the seal to take no number, and the `seal` to carry `lastNumber`. | Accept the jumps; they need no coordination. Hugh may prefer dense. |
| Q3 | Listing issues apart from changes. Rows of both kinds share one `(type, state)` range, so a filtered page can be sparse. | Bounded per page, with `more` shown. Or split the partition's row type into `issue` and `change`. |
| Q4 | `rowOf` and lookup by number still walk the partition's rows (`directory.ts:427-436`). `number` is an `int`, not an indexed type (`derive/src/binding.ts:38`), and `scope` is not set when a row opens. | The walk is bounded by one partition's rows. An index needs a contract change; checker decides. |
| Q5 | Reuse `issue.open` for `open-partition` and `seal`? | Yes; see 4.5. |
| Q6 | Does any reader take every `directory`-kind scope for the room's root? CLI, invitations and session references check the kind only (`commands.ts:573`, `client/src/invitation.ts:33`, `scope/src/session-reference.ts:32-40`), but take the root from the room link. | Builder confirms by search before Source. |
| Q7 | Does the recorded-membership read (`scope/src/authority.ts`) accept the membership in a platform-named creation body from a directory? | Builder confirms, with the Authority witness. |
| Q8 | `SEAL_AT` at a quarter of `scopeEntries` | A proposal. R4 measures updates per lane. |
| Q9 | The GitHub importer (`notes/2026-10-15-github-repository-import.md`, section 3) opens many lanes at once. | It handles `partition-full`, signs `seal`, and resolves the successor like any client. |
