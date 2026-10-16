# Directory partitions

**Proposed design for checker review; no Source change.** Request
`6aa3bc30`, owned by the planner, from builder act `49c7c811` and checker
decision `c9a2c676` ("Directory lifetime"). Read against main
`0548b726d0`. This note ran no tests, gate or provider operation.

**Draft 2** answers checker review `e8416df9` of Draft 1 at `20b23e82`
(findings F1 to F6). It also moves the root to `platform:directory@10`,
because builder Source `8e957b54` takes register `@10`, membership `@6`
and directory `@9`. Section 12 maps each finding to its answer.

**Draft 3** answers checker review of Draft 2 at `267b5904`: finding F7
(compromise relays must not be expendable), the preconditions of Q11, and
the operator's one-shot resend. It adds section 4.10 and prerequisite D1.

## 1. Problem

A room has one directory scope. It opens every lane, numbers it, and keeps
one index row for it. Its journal never shrinks.

| Fact | Source at main `0548b726d0` |
|---|---|
| A scope holds at most `scopeEntries` entries, 100,000, counted over its whole life. | `packages/contract/src/bounds.ts:63`, `:112` |
| The directory allows 100,000 lane rows, 1,000 task rows and 1,000 application rows. Rows are never removed. | `packages/platform/src/directory.ts:189`, `:211`; `application.ts:81` |
| Every lane update that changes a listed field sends an `index` advisory to the directory, and each one is a directory entry. | `apps/room/lanes/definitions/issue.json`; `directory.ts:321-343` |
| A lane's directory is fixed at the lane's genesis: its creator, when that is a directory, or the directory its creator recorded. | `packages/derive/src/sends.ts:31-36`, `:258`, `:302-306` |
| A full scope answers a delivery `retry("scope-full")`. An advisory is never given up, so each lane keeps resending it. | `packages/scope/src/delivery.ts:238`; `outbox.ts:14-19`, `:137` |
| Finding a lane's row walks every page of rows, once for each index update. | `directory.ts:427-436` (`rowOf`) |
| The CLI reads every row, then every lane's whole summary. | `packages/cli/src/commands.ts:1739-1759`, `:1844` |
| A page of items reads the `(type, state, id)` index; a declared index answers one key. | `packages/scope/src/sqlite.ts:80`, `:194-201`, `:287-291` |

So lane creations and every later lane update spend one budget. Archive
does not free it (section 15 of
`notes/2026-10-09-shared-language-volatile-acts.md`). Moving rows into
several scopes does not help if one root scope still records each update.

## 2. Terms

- **Root**: the room's directory scope. It keeps the repository, the
  three child references, import, the `compromised` relay and the
  partition list. It opens no lane.
- **Partition**: a scope of kind `directory` that the root creates. It
  opens lanes, tasks and applications, numbers lanes and keeps their rows.
  Its lanes record it as their directory.
- **Generation**: the ordinal of a partition in the root, from 1.
- **Active partition**: the one partition that opens lanes now.
- **Sealed** (of a partition): its control item's flag `sealed` is true.
  It opens no more lanes, tasks or applications, and still records index
  updates. This is not the "sealed entry" of the scope contract.
- **Handoff**: sealing the active partition and creating its successor.
- **New work** and **settling entry**: as `fits` uses them
  (`packages/derive/src/reserve.ts:138-161`). New work is accepted only if
  the entries written and reserved stay within `scopeEntries`.

## 3. Decision

1. New rooms use a new cohort: root `platform:directory@10` and
   `platform:directory-partition@1`. Old pins are frozen. No room is
   migrated.
2. The root records nothing per lane, task or lane update. It reserves
   the entries of every handoff it may still make (section 4.7), so other
   traffic cannot starve one.
3. A partition reserves its own `seal` from its genesis, by the existing
   marker duty. Index traffic cannot take that room (section 4.7).
4. A partition's control item never changes state. A flag says it is
   sealed, so every existing selector keeps working.
5. Numbers come from a fixed range per generation.
6. A successor creation that ends `undelivered` frees the generation for
   a new one. One that ends `delivery-unavailable` stays pending and is
   sent again unchanged. At most one partition is ever live.
7. Point reads use declared indexes: generation to partition, number to
   row, and lane to row. Each is one key lookup. Nothing walks a list.
8. Authority uses existing grants and guards. No new membership version.
9. Four prerequisites are owed before the Source that needs each: C1, a
   standing reservation (root); C2, `int` as an indexed type; D1, a
   destination version that reads key standing before each push (section
   4.10); A1, the `dropped` answer for a full partition's index handler
   (section 10).
10. The `compromised` relay through the root stays capacity-limited. It
   becomes an accelerator. D1 is the guarantee that a revoked key stops
   publication (F7).

## 4. Protocol

### 4.1 Versions

| Definition | Kind | Change |
|---|---|---|
| `platform:directory@10` (root) | `directory` | The data of `@8` (`application.ts:131`), without the items `lane`, `task`, `application`, the acts that open them and the `index` handler. Adds the item `partition`, the act `open-partition`, the handler `seal` and the send mark `create-partition`. |
| `platform:directory-partition@1` | `directory` | New. The lane, task and application items, acts and `index` handler of `@8`; the control item `repository`; the act `seal`. |
| The next register version after `@10` | `register` | Maps to `platform:directory@10` in `DIRECTORY_OF` (`register.ts:57`). |
| A new cohort | | Pins the above beside the membership, rules and destination versions current when Source starts (`index.ts:125-154`). |

The partition has kind `directory` on purpose. Then the platform routes
its lanes' `index` sends to it and names it in every `create` of a lane
(`sends.ts:31-36`, `:258`) with no change. The destination accepts
deliveries only from `platform:directory` (`destination.ts:130`).

### 4.2 Root records

`repository` gains the value `generations` (count, default 0).

New item `partition`, many, at most `MAX_GENERATIONS` = 1,000, with
`indexes: ["generation"]` (needs C2):

| Slot | Kind | Set by |
|---|---|---|
| `generation` | value, int, fixed, required | the opening entry: `generations` + 1 |
| `base` | value, int, fixed, required | the opening entry: `(generation - 1) × SPAN + 1` |
| `scope` | ref, kind `directory` | the `applied` clause |
| `conflict` | value, bool, default false | the `conflict` clause |

States: `creating`, `active`, `sealed`, `refused`, `undelivered`. The last
three are final.

**Invariant P1.** At most one `partition` item is `creating` or `active`.

`create-partition` (send mark, one request): a `create` of kind
`directory`, definition `platform:directory-partition@1`. Its body is
`{ fields, directory: root, membership }`, built as `create-lane` builds
one (`directory.ts:739-756`). Fields: `generation`, `base`, and the root's
`membership`, `rules` and `destination` references with incarnations.

| Clause | Effect |
|---|---|
| `applied` | `scope` from the sender; state `active` |
| `refused` | state `refused` |
| `undelivered` | state `undelivered` |
| `conflict` | `conflict` set true. The state does not change. |

### 4.3 Partition records

Genesis `establish-partition`, by the root's `create`. It opens the one
control item, type `repository`, state `open`, which never changes:

- fixed refs `root`, `membership`, `rules`, `destination`, copied once
  from the root, which sets each of them once and never changes them;
- fixed values `generation` and `base`; `lastNumber` = `base - 1`;
- the flag `sealed` (bool, required, default false, not fixed);
- the flags `handedOff`, `sealRefused`, `sealUndelivered` (bool,
  default false), set by the clauses of the `seal` tell.

Because the type is `repository` and the state stays `open`, the selector
at `directory.ts:400`, and `directoryMembership`, `directoryRulesScope`
and `repositoryAt` (`:411-421`, `:447-451`) read it unchanged after the
seal. The option of versioning every selector is not taken: a stable
state with a flag is the smaller change (F2).

The `lane` item differs from `@8` in three slots:

- `seed`: value, digest, fixed, required. The digest of the lane's seed.
  An opening act computes it from the seed it sends; an `index` that
  opens a row takes it from the sender's scope ID.
- `number`: now fixed and required. Every row takes its number in its
  opening entry already (`next-number`, `index-number`).
- `indexes: ["seed", "number"]`. `number` needs C2.

### 4.4 Numbers

`SPAN` is 100,000, a constant of the partition definition. Generation g
numbers from `base = (g - 1) × SPAN + 1`. `next-number` and
`index-number` (`directory.ts:438-444`, `:712-724`) work as now, from
`lastNumber`. They refuse a number above `base + SPAN - 1` as
`scope-full`, naming the dimension `numbers`. Each partition entry takes
at most one number, so the range cannot run out while `scopeEntries` ≤
`SPAN`. 1,000 generations end at number 10^8. Numbers jump at each
generation, which section 11 accepts.

### 4.5 Acts, handlers and grants

| Where | Act or handler | Grant or sender | Guard | Effect and send |
|---|---|---|---|---|
| Root | `open-partition` (act) | `issue.open` | The three child refs are set; P1 holds; `generations` < 1,000. | Opens `partition` `creating`; `generations` + 1; `create-partition`. |
| Root | `seal` (`tell` handler) | From kind `directory` under `platform:directory-partition` | The sender is the `scope` of the `active` item (`not-the-active-partition`); `generations` < 1,000 (`root-exhausted`). | That item becomes `sealed`; opens the next item `creating`; `create-partition`. One entry. |
| Partition | `open-issue`, `open-pr`, `open-task`, `establish-application` | As today | Added guard `partition-open`: `sealed` is false (`partition-sealed`) and `head + 1 < SEAL_AT` (`partition-full`). | As today. |
| Partition | `seal` (act) | `issue.open` | `sealed` is false and `head + 1 ≥ SEAL_AT`. | `sealed` true; one written `tell` `seal` to `root`. Declares `settles: { of: "on", sets: "sealed", in: ["open"] }`. |
| Partition | `index` (advisory) | From kind `lane` | None, as today. | As today, with the row found by `seed` (section 5). |

`SEAL_AT` is `⌊scopeEntries / 4⌋`. Every role that may open anything in a
partition holds `issue.open` (`membership.ts:99-113`). The guards, not the
grant, limit the two control acts. `seal` is an act because a send list
may hold one conditional mark only (scope contract revision 19, section
6.1), and an advisory handler may send nothing. Draft 1's `retry-seal` is
withdrawn: section 4.8 shows that no case needs it.

The root keeps `compromised` (`directory.ts:344-362`) and `retry-import`.

### 4.6 State changes

| Scope | From | Input | To |
|---|---|---|---|
| Root item | (none) | `open-partition`, or `seal` from the active partition | `creating` |
| Root item | `creating` | result `applied`, `refused`; diagnosis `undelivered` | `active`, `refused`, `undelivered` |
| Root item | `creating` | diagnosis `delivery-unavailable` | stays `creating` |
| Root item | `active` | `seal` from its own scope | `sealed` |
| Partition flag | `sealed` false | `seal` act | `sealed` true |

### 4.7 Capacity that handoff needs (F1, F4)

**Partition.** The `seal` act settles the control item's marker
`sealed` (the third form of `Settles`, `contract/src/definition.ts:127-134`).
So from its genesis the partition reserves the `seal` entry and what it
can start: the tell's result and one possible diagnosis (`owed`,
`reserve.ts:100-133`, through `markerOwed`). An `index` is new work. When
index traffic reaches the reservation, `fits` refuses it and the seal
still fits, however late the signer is. Once `sealed` is set the marker
is settled and its room is spent as planned. No automatic seal is needed.

Below `SEAL_AT`, an opening act can still be refused `scope-full` while
many creations wait for results. That is transient: each result frees its
reservation.

**Root (C1).** The root declares a standing reservation of 3 entries for
each generation it has not opened yet: `3 × (1,000 − generations)`, added
to `owed`. The 3 entries are the handoff input (a `seal` decision or an
`open-partition` act), the creation's result, and one diagnosis. A
handoff input opens a generation, so it releases 3 and the request it
sends reserves 2: it always fits. Every other kind of new work (a
`compromised` relay, a refused or foreign request, a `conflict` result, a
checkpoint, an import retry) must leave the whole reservation free. It is
refused `scope-full` when it cannot. The existing marker form settles one
duty once, so it cannot hold a reservation for many generations; C1 is
the smallest rule that can.

### 4.8 Failure of a handoff send (F3)

The contract gives two findings for a request without a result
(`derive/src/settle.ts:49-73`): `undelivered` when every attempt was
answered by a routing refusal, and `delivery-unavailable` otherwise.

| Send | `undelivered` | `delivery-unavailable` |
|---|---|---|
| Root `create-partition` | Clause sets `undelivered`. No later dispatch is made, and a late result is ignored (`derive/src/delivery.ts:283-284`). Under the preconditions below, no attempt reached a judgment, so this send created no child. P1 is free; the next `open-partition` opens a new generation with a new seed. | No clause runs. The item stays `creating`; P1 blocks a new generation. It is not proof that no child exists. The operator may send the same envelope again with the explicit one-shot `sendAgain` (`scope/src/operator.ts:160-195`); no automatic retry is designed after this finding (contract revision 11, section 7.4, "After `delivery-unavailable`"). The seed, cause and child are the same. A late authentic result is recorded by its clause. |
| Partition `seal` tell | Clause sets `sealUndelivered`. Every attempt was a routing refusal from the root's own reference, so a new tell would be refused too. The room cannot grow; this is a fault of the deployment, shown on the partition. | Sent again unchanged, as for the root. The root decides it once; a repeat is answered from its deciding entry with no new entry. |

**Preconditions of the `undelivered` row** (checker, Q11). They hold for
the one-namespace resolver and a correctly addressed `create`:

- every attempt is logged before it leaves, so the log is complete
  (`outbox.ts`, `sendAgain` likewise);
- the resolver decides a routing refusal before any judgment
  (`ScopeObject.deliver`), with a stable namespace identity;
- for a `create` whose name is its seed's digest, `routed` returns no
  refusal, whether the scope exists (also after a refused genesis) or the
  store is empty (`scope/src/namespace.ts:92-102`).

So for the root's own correctly built `create`, `undelivered` signals a
fault: a misaddressed envelope or a changed namespace. A misaddressed
envelope can be refused while some other child exists, and an unavailable
or unreachable service proves nothing. The design treats only the
complete, all-routing-refused log of this one send as ending its
generation, and reports the fault on the item.

A second `applied` result in another incarnation of the same seed runs the
`conflict` clause (`derive/src/delivery.ts:285-290`). It sets the flag and
keeps the first `scope`. So there are never two live successors.

### 4.9 Late deliveries and the full partition

- An `index` goes to the partition that opened the lane, or that its
  creator recorded, for the lane's whole life. Concerns created after the
  seal index into the sealed partition and take numbers from its range.
- An opening act sent to a sealed partition is refused `partition-sealed`
  after its grant is judged. The client resolves the active partition again
  and signs a new intent.
- Task, lane and application creation results settle under their existing
  reservations (`reserve.ts:156-161`).

Without A1, an `index` that does not fit gets `retry("scope-full")`, as
today. A1 (section 10) replaces that only when the refusal is permanent.

### 4.10 A revoked key and publication (F7)

Today a key revoked as compromised reaches the destination only through
the root: membership tells the root (`membership.ts:512`), which tells the
destination (`directory.ts:344-362`). The destination's `abort-if-behind`
then sets `aborting`, revokes a live token and opens the deciding read
(`destination.ts:439-457`, `:1729-1766`). The push rule reads `aborting`
and makes no fresh membership read (`destination.ts:1934-1964`). Under
C1, unrelated traffic can fill the root outside its reservation. The
relay then waits at membership, and publication would continue.

**D1, the guarantee.** A new destination version, pinned by the partition
cohort, adds observation rows to the `mint` outcome kind, as `judge`
already has them (`destination.ts:465-471`):
`{ of: "key", from: "rule", max: 9, window: 10, use: "once", without: "wait" }`.
The rule names the keys behind the publication: those the reservation
entry observed (the merger's key and the keys behind counted verdicts or
the deciding result), at most 9. A push request is sent only after its
mint has an outcome (`destination.ts:1944-1947`), so every push attempt
is gated by that outcome entry.

- Every key is active in the read: the entry is as today.
- A key is revoked or compromised: the entry sets `aborting`, revokes the
  token it minted and opens the deciding read, as `abort-if-behind` does.
  No push request leaves for that attempt.
- The read cannot be made: the entry is not written (`without: "wait"`).
  The mint has no outcome, so no push request leaves. Publication waits.

The read is bounded: at most 9 key observations, each one membership read
under the observation limits the destination already uses. It adds no
operation and changes no custody: tokens, receipts and the deciding read
work as now.

**What is guaranteed without the relay.** No push request leaves unless
the entry that recorded its mint's outcome also recorded every key behind
the publication as active, from a read at most 10 seconds old when that
entry was written. A revocation that a membership read can see stops the
next attempt. The time from that entry to the send is not bounded here;
the minted token's own lifetime limits it. Not guaranteed without the relay: early revocation of a
token minted before the revocation, the recall of a push already sent,
and an abort while no attempt is due. The relay, when it arrives, still
does these.

The fallback named by the planner, a bounded relay reservation for lanes
with reserved, publishing or unresolved work, is not taken, because D1's
read is bounded and fits current custody (Q10).

## 5. Reads (F5)

| Read | How | Most work |
|---|---|---|
| Active partition | Root `page("partition", ["active"], null, 1)` | One seek; P1 makes one row |
| Generation g | Root `lookup("partition", "generation", g, 2)` | One key seek, one body |
| Number n | `g = ⌊(n − 1) / SPAN⌋ + 1`; generation g; partition `lookup("lane", "number", n, 2)` | Two key seeks, two bodies, in two scopes |
| Row of a lane | Partition from the lane's genesis (`directoryOf`); `lookup("lane", "seed", digest, 2)`, where the digest is decoded from the lane's scope ID | One entry read, one key seek, one body |
| Row for an `index` | The same lookup replaces `rowOf` in `index-row` and `index-number` | One key seek |
| Partition list | Root `page("partition", ["active", "sealed"], after, 100)` | Rows returned |
| Lanes of the room | For each partition in order, the bounded item query of `notes/2026-10-15-item-query-page.md` on `("lane", ["listed"])` | Rows returned |

`lookup` reads at most `limit` key rows after two count reads
(`sqlite.ts:287-291`). If it returns null, the index does not cover every
item; the read is refused `unavailable`. No read falls back to a walk or
to collecting all rows. A point read returns at most two item bodies,
within the item query's 256 KiB response limit. The lane's own fields
then come from a bounded singleton read of the lane (checker
`c9a2c676`, "Consumers").

A room-wide cursor is `(generation, partition cursor)`. The partition
cursor is bound to that partition's reference and head. On head drift it
restarts that partition's pages only. A listing states, for each
partition, the head it is complete at, and never claims a room-wide
snapshot.

## 6. Handoff failure and restart

| Case | What happens | What a reader sees |
|---|---|---|
| Crash before the `seal` entry commits | Nothing recorded. | The client signs `seal` again. |
| Crash after it, before dispatch | The tell is in the outbox with the entry. | The alarm dispatches it. |
| Root crashes in the `seal` turn | Nothing committed. | Redelivery; judged again. |
| Root commits, crashes before the `create` leaves | The `create` is in the outbox. | The alarm dispatches it. |
| The `create` arrives twice | A repeat, answered from the genesis (`derive/src/genesis.ts:110-113`). | One successor. |
| Successor refused, or `undelivered` | Item final; P1 free. | `open-partition` for a new generation. |
| Successor `delivery-unavailable` | Item `creating`, with its diagnosis. | Pending, shown with its diagnosis. Recovery is the operator's one-shot `sendAgain` of the same `create`. |
| Two members sign `seal` | Serial turns; the flag is set once. | The second is refused `partition-sealed`. |
| `open-partition` races a `seal` | Serial turns; P1 holds. | One live partition. |
| A stale client | Its opening act is refused `partition-sealed`. | It reads the root again. |
| Index traffic before a late `seal` | Refused `scope-full` (or A1) at the reservation. | The `seal` still fits. |

Between the seal and the successor's `applied` result there is no active
partition, and opening acts wait. No time bound is claimed: retryable
answers can continue as long as the root or the child is unavailable. The
root's item shows the condition (`creating`, with or without a
diagnosis), and the partition's flags show its tell's outcome.

## 7. Budget over the room's life (F4)

**Root.** Successful work: at most 2 entries per generation (the input
and the `applied` result), 2,000 over 1,000 generations. With failures:
at most 3 per generation, because each failed creation ends its
generation, and C1 reserves 3 for each. So all handoff history, success
and failure, fits in 3,000 entries reserved from the start. The rest of
the budget, less the founding entries and `owed`, takes other new work:
`compromised` relays (the root's deciding entry, then the destination's
result, with a diagnosis first if that is lost), refused or foreign
requests (1
each), `conflict` results (1 each), import retries and checkpoints. These
are capacity-limited. When the rest is spent they are refused
`scope-full`: a request stays pending at its sender, and a result is sent
again. After generation 1,000 the root refuses `seal` as `root-exhausted`;
the partition shows `sealRefused`, and no lane can be opened.

**Partition.** Registrations until `SEAL_AT`; then index updates and
settlements up to the budget less its reservations, which always hold
the `seal` until it is used. Then `scope-full`, or A1.

## 8. What stays unchanged

- Security behavior is not unchanged. In a new room the `compromised`
  relay can wait behind unrelated root traffic, and D1 (section 4.10)
  is what stops publication for a revoked key. Rooms of old cohorts keep
  their current relay and push behavior.
- Rooms on `platform:directory@1` to `@9`, and their registers and
  cohorts. They keep the interim behavior that `c9a2c676` chose:
  `scope-full` with reserved settlement entries (request `cc570904` and
  its owners).
- `scopeEntries` and the existing reservation rules. Nothing raises a
  constant, resets history or moves entries.
- Lane definitions, the `index` routing rule and the `create` body rule.
- The membership role table and every grant. Membership, rules and
  destination definitions and their reference to the root.
- The bounded item query and its owners. The archive design.

## 9. Witnesses

Small `scopeEntries`, real Durable Object storage and the real authority
path, as the existing budget witnesses use.

| Invariant | Witness | Control that must fail |
|---|---|---|
| F1: seal is reserved | Fill a partition past `SEAL_AT` with sustained index traffic until `fits` refuses it, holding the signer back; then sign `seal`. It is recorded; exactly one handoff completes. | Remove the `settles` marker: the `seal` is refused `scope-full` |
| F2: control reads after seal | After `seal`, and after a restart: an opening act reaches its grant and is refused `partition-sealed`, not `dependency-unavailable`; an existing lane's index and a new concern's first index record, with a number; a late `create-lane` result settles. | Move the control item to state `sealed` |
| F3: routing failure | The root's `create` gets only routing refusals: `undelivered`; `open-partition` opens the next generation. | Treat `undelivered` as pending |
| F3: lost answer | Mixed attempts: `delivery-unavailable`; `open-partition` is refused; a resend of the same `create` makes the child `active`; a second incarnation's `applied` sets `conflict` only. | Allow `open-partition` while `creating` |
| F4: root bound | Foreign requests and `compromised` relays fill the root to C1's reservation, then are refused; handoffs to the generation cap still complete; handoff entries ≤ 3 per generation. | Remove C1 |
| F5: point reads | Beside 3,000 unrelated rows: lookups by generation, number and lane, and an `index` update, each read at most a fixed number of rows, counted. An incomplete index refuses `unavailable`. | Restore `rowOf` |
| P1 | Interleave `seal` and `open-partition`; at every root head at most one item is `creating` or `active`. | Remove the P1 guard |
| Unique numbers | Issues and post-seal concerns in two generations; no number repeats. | Drop the base offset |
| Authority | `open-partition` without `issue.open`, an early `seal`, and a `seal` from a foreign directory-kind scope are refused. The partition's refs equal the root's. Root and partition consumers are told apart (Q6, Q7). | |
| F7: revoked key behind a held publication | Fill unrelated root traffic to the new-work boundary, so the `compromised` relay is refused. Hold a publication in `reserved`; revoke, as compromised, the merger's key. The next mint outcome observes the key, sets `aborting`, revokes the token and opens the deciding read; no push request leaves. Repeat across a restart before and after that entry. Also: the membership read cannot be made, and the entry waits with no push. | Remove D1's observation: the push is sent |
| Old pins | Existing `@1` to `@9` witnesses replay unchanged. | |
| A1, when built | Only a permanently full partition answers `dropped`; the lane stops sending; no partition entry; the reader marks the partition incomplete. | Drop on a transient refusal |

## 10. Prerequisites owed

Each needs its own reviewed contract or definition revision before the
Source that uses it. Partitions need C1, C2 and D1 first. Without A1 they
keep today's resends.

- **C1, standing reservation.** A platform definition may declare
  `entries × (max − count)` from a count slot of its one item, added to
  `owed`. The root uses 3 × (1,000 − `generations`).
- **C2, `int` indexed type.** Add `int` to the seven indexed types
  (`derive/src/binding.ts:38`, section 17.2a). The key is the canonical
  decimal text. Fixed and required, as for the others.
- **D1, push-time key standing.** A new destination version (section
  4.10), with its own review, pinned by the partition cohort.
- **A1, dropped index.** A platform `advisory` handler may declare
  `full: "drop"`. The receiver first verifies the source, the send, the
  address and the handler, as today. It answers `dropped` only when the
  advisory cannot fit even after every pending duty settles: `head + 1 +
  floor > scopeEntries`, where `floor` is what no settlement can release
  (the closing checkpoint). Otherwise it answers `retry("scope-full")`. It
  writes nothing and invents no fact. The answer is a new value of the
  delivery answer, the transport and the attempt log, in a new version of
  each. The sender records it and stops sending that advisory. Readers
  mark such a partition's index incomplete from that head: rows may be
  stale, and a concern whose first row was dropped has no row or number.
  It stays reachable from its parent lane.

## 11. Planner decisions on the open questions

Decided by the planner on 2026-10-15; revised in Draft 2 after checker
review `e8416df9`.

- **Q1.** Adopt A1 as a separate contract slice (section 10), restricted
  to the declared handler and to permanent exhaustion. Partition Source
  does not wait for it.
- **Q2.** Accept number jumps. The checker accepts this.
- **Q3.** Keep one row type, with sparse bounded pages. The checker
  accepts this.
- **Q4.** Changed. An explicit bounded lookup is required: indexes on
  `generation`, `number` and `seed` (section 5), with C2 for `int`.
- **Q5.** Reuse `issue.open`, limited by guards. The checker accepts this.
- **Q6, Q7.** Before Source, builder shows by search and by the Authority
  witness that root and partition consumers are told apart and that the
  partition's recorded membership is read. The F2 witness covers the
  selectors.
- **Q8.** `SEAL_AT` is a quarter of `scopeEntries`, a versioned constant.
  It is tuning only; F1's reservation is the guarantee.
- **Q9.** The GitHub importer follows the same protocol, including
  `partition-full`, `seal` and every failure case of section 4.8.
- **Q10.** Changed after checker finding F7. The relay is not reserved,
  and is not the safety path. The primary guarantee is D1: each push
  attempt is gated by a fresh, bounded read of the standing of every key
  behind the publication, and fails closed (section 4.10). The relay stays
  capacity-limited and only speeds up the abort. The fallback, a bounded
  relay reservation for lanes with held publications, is not needed,
  because the read is bounded and reuses the destination's existing
  observation rows.
- **Q11.** The checker confirmed it only for the one-namespace resolver
  and a correctly addressed `create`. Section 4.8 now states those
  preconditions, not a universal transport claim.
- **Q6, Q7 (unchanged).** In the first Source, builder's source search
  and the real Authority witness; nothing is inferred from kind
  `directory` alone.

## 12. Findings of review `e8416df9`

| Finding | Answer |
|---|---|
| F1 | The `seal` act settles a marker on the control item, so its entry and its tell are reserved from genesis (4.5, 4.7). Witness F1. |
| F2 | The control item keeps state `open`; a flag records the seal; selectors are unchanged (4.3). Witness F2. |
| F3 | `undelivered` ends the generation; `delivery-unavailable` stays pending and is resent unchanged; `conflict` only sets a flag (4.2, 4.8). Two witnesses. |
| F4 | Successful work ≤ 2 per generation; all handoff history ≤ 3 per generation under C1; other control traffic is capacity-limited (4.7, 7). |
| F5 | Lookups by generation, number and lane seed, each one key seek, with no walk fallback (4.3, 5); C2. |
| F6 | No completion time is claimed; the pending conditions are stated (6). The resend after `delivery-unavailable` is the operator's explicit one-shot `sendAgain`. |
| F7 | D1 gates every push attempt on a fresh read of key standing and fails closed; the relay is an accelerator, capacity-limited (4.10, 7, Q10). Witness F7. |
| Q11 | Preconditions stated: one-namespace resolver, correctly addressed `create`, complete attempt log (4.8). |
