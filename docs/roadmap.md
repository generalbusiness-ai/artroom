# Roadmap

This page says what dap does today, what is not yet built, and which use
cases need each missing part. It also says what the
[dap-spike](https://github.com/generalbusiness-ai/dap-spike) contributed:
the earlier experiment that tested several of these ideas, and recorded
where they failed.

The page gives states and an order, and no dates. The
[use cases](use-cases.md) page holds the catalogue that the case numbers
below refer to.

## What runs today

| What | Where to read and check it |
|---|---|
| A scope keeps an ordered record, pins one definition, judges each signed act, and answers with a receipt or a refusal. | [Scopes](scopes.md), [The life of an act](manual/life-of-an-act.md) |
| Anyone with the record can replay it. The rehearsal of the repository story ends with fourteen scopes reported consistent. | [The record](manual/record.md), [Rehearse the demo](demo.md) |
| Scopes compose by messages. The receiver reads the sender's entry, checks it, and judges the delivery in its own turn. Each request gets one result. | [Scopes: composition](scopes.md#composition) |
| dap-room: membership, rules, issues, changes, reviews of an exact version, and publication to a Git host with a recorded outcome. Two changes on one base are settled by reservation and judgement. | [apps/room/docs](../apps/room/docs/first-change.md), [Rehearse the demo](demo.md) |
| Two Git hosts: Cloudflare Artifacts and GitHub. | [Configure a Git host](hosts.md) |
| A declared application: you write a definition as data, validate it, pin it, and create a scope under it in a room. Guards, grants, timed rules and detached texts are available to it. | [Write an application](write-an-application.md) |
| dap-counter, a declared application in which people and agents take turns. | [The Counter source](../examples/counting/README.md), [Build a counter](build-a-counter.md) |
| dap-library, a declared lending library. Each act that changes a thing also publishes that thing's shelf page through the room's destination. | [The lending library](../examples/lending/README.md), [Build a lending library](build-a-lending-library.md) |
| Agents act in a room through MCP: a local server over stdio or loopback HTTP, and a hosted endpoint on the scope Worker. | [MCP](mcp.md), [The hosted endpoint](mcp.md#the-hosted-endpoint) |
| A room created from the served page, with no email; or a whole service run on your own account. | [Run dap in 10 minutes](self-host.md) |
| Published repositories served as pages. | [Pages](pages.md) |

Each of those pages states its own evidence and limits. The table in
[Scopes](scopes.md) under "What runs" is the most exact account.

### Publication from a fold

When an act takes effect in an application's scope, the same act can say
"this text is the content of this path", and the room's destination
commits and publishes that file. The destination checks that the request
comes from an application of its own room. The lending library uses this
for its shelf pages. The scope does not check the page's text against
the record; the journal shows who stated it. The design is
[the fold publication note](../notes/2026-10-13-fold-publication.md).

Three limits shape everything below:

- **Every member of a room reads the whole record.** A read session is
  bound to a repository, not to a participant's part of it.
- **A definition is pinned when its scope is created.** A scope does not
  change its rules afterwards.
- **A declared application has no operation of its own on an outside
  system.** It can list the fixed capability forms that the contract
  declares, `hold@1` and `git-read@1`, when their code is supplied. It
  cannot declare an application-specific operation, and no host adapter
  for one exists.

## What is not yet built

In order, nearest first.

| Capability | State | Use cases that need it |
|---|---|---|
| [An application's own messages between scopes](#an-applications-own-messages-between-scopes) | Can be declared; no application has two scopes of its own yet | 25, 31, 32, 33 |
| [Durability levels](#durability-levels) | Designed; not built | 36, 44, and the live part of every case |
| [A fork for each hold](#a-fork-for-each-hold) | Planned; a first measurement ran | 34 |
| [Offline work and propose from a branch](#offline-work-and-propose-from-a-branch) | Direction set; not designed | 34 |
| [Private views in one record](#private-views-in-one-record) | Not designed in dap; tested in the dap-spike | 21, 32, 37, 39, 40, 41, 42, and parts of 08, 18, 19, 24, 25, 33 |
| [Evidence capture and private custody](#evidence-capture-and-private-custody) | Not designed | 01, 02, 04 to 19, 23, 24, 27, 28, and the custody part of every case |
| [Outside parties and systems](#outside-parties-and-systems) | Runs for Git publication only | 35, 37, 38, 39, 43, and all of group 4 |
| [A personal account across records](#a-personal-account-across-records) | Not designed | All of group 4 |
| [Rules that change after creation](#rules-that-change-after-creation) | Not designed in dap; tested in the dap-spike | 42; a sale that gains packages; a club that changes its policy |
| [Expressions that compute effects](#expressions-that-compute-effects) | Not designed; a rule can check a proposed value today | Analytic pipelines such as Tailapps; chess and other games with many rules |
| [Split and join](#split-and-join) | Not designed; a protocol is sketched in the dap-spike | A merger of two records |
| [An authoring language](#an-authoring-language) | Not designed; one attempt in the dap-spike stopped | Every case, for its author |

### An application's own messages between scopes

**What it is.** An application made of several scopes, in which one scope
owns each shared constraint and the others ask it. Examples: one scope
owns a budget that two projects spend from; one allocator owns the
capacity of a building with many rooms; an inspection runs in its own
scope and returns a result to the sale.

**Today.** The mechanism runs: dap-room's register, directory, membership,
rules, destination and lanes all work by messages. A declared definition
may also declare a send to a scope that one of its slots holds. The
lending library sends one kind of message, to its room's destination, to
publish a page. No declared application yet consists of scopes of its own
that ask one another.

**Not offered.** One act cannot take effect in two scopes at once.
Instead, one scope sends a request, the other answers with a result, and
the sender's rules decide what that result means.

**The dap-spike's contribution.** Its design note gives the test for where
a boundary may go: a right that only one party can exercise needs one
owner
([boundaries and composition](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-14-evolving-spaces-design.md)).
It also separates three ways to cross a boundary: link to an outside act,
admit a result from an exact position of another record, and join. The
spike ran these in one bounded fixture: an inspection's result is
imported into the sale from an exact position, and a later fulfilment
joins the two
([ordering report, goal 1](https://github.com/generalbusiness-ai/dap-spike/blob/9d738e2e/spike/ORDERING-REPORT.md#goal-1-executed-lifecycle-and-proof-boundary)).
That fixture had one trusted writer, and the report states its limits on
proof, disclosure and availability. It is not free composition of two
records.

**Next.** A two-scope declared application with one owner of a shared
amount, with replay of both scopes.

### Durability levels

**What it is.** A scope's definition declares one of three levels.
**Live**: no record is kept, and the scope can reset. **Recorded**: the
scope keeps its journal, as every scope does today. **Archived**: the
journal is also written to Git, so that it can be checked from a clone
without the service.

**Today.** Every scope is recorded. Only a publication's receipt reaches
Git.

**Use cases.** Practice counting that keeps no record (44); presence and
hypotheses during an incident (36); the drafts and tentative options in
every card of the catalogue.

**State.** Designed in
[the volatile acts note](../notes/2026-10-09-shared-language-volatile-acts.md),
whose sections on levels and the journal archive are reviewed and on
main. Not built.

### A fork for each hold

**What it is.** Each performer who takes a hold works in a separate fork
of the destination's repository, with a token that reaches only that
fork. The performer never holds a token to the destination.

**Today.** Each destination has one repository
([Configure a Git host](hosts.md)).

**State.** [Plan 029](../plans/029-2026-10-11-artifacts-forks.md). A
first measurement created a fork on Cloudflare Artifacts and committed to
it; what a fork costs in storage is not yet measured
([the measurement](../notes/2026-10-13-fork-cost-measurement.md)).

### Offline work and propose from a branch

**What it is.** A participant works without a connection and proposes a
change from a branch when they return. An application shows a local
result at once and reconciles it with the record.

**State.** The direction is set. No design note exists.

### Private views in one record

**What it is.** Participants read different parts of one record and still
agree on every decision they share. Two buyers each see their own offer
and the seller's one acceptance, and neither sees the other's price.

**Today.** Every member of a room reads the whole record. An application
can redact a detached text, and it can keep private material in another
room. Neither lets two readers of one record see different parts and
still check that they agree.

**Use cases.** Group 3 of the [catalogue](use-cases.md#3-private-views):
the guitar sale with private offers (32), community governance with
private standing (42), childcare details (21), competing quotations (37),
hiring (39), a school support plan (40) and research review (41).

**The dap-spike's contribution.** This was the spike's main subject
([visibility report](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/REPORT.md),
[One series, many views](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-14-one-series-many-views.md)).
It wrote the conditions for failure before it ran.

- Agreement held in the fixtures that ran. In the repaired Sale and
  Booking models, participants with different views reached the same
  verdict on every event that both could see.
- Privacy held in those two models. Offer amounts stayed between bidder
  and seller.
- The Club model's original policy for admitting members fails, and that
  result was kept
  ([decision](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-16-club-admission-decision.md)).
  The result is for two models, not three.
- Writing such a model was costly. The budget was two repairs for each
  model, and Sale needed six. Every repair was an error about who could
  read what.

**What that means here.** Private views can work. A person or an agent
who writes the readers by hand is likely to get them wrong, so private
views in dap should come with a check that the author cannot skip.

### Evidence capture and private custody

**What it is.** A participant brings in a bill, a photograph or a letter
as unchanged bytes with a stated source. The record keeps three things
apart: a person's own assertion, an imported document, and another
party's signed act. The documents stay in private custody, and a later
helper can be given them.

**Today.** A detached text of up to a fixed size travels beside an act
and is kept by digest. There is no capture with a stated source, no store
for larger or binary evidence, and no custody that is private to some
members.

**Use cases.** Group 4 of the
[catalogue](use-cases.md#4-episodes-across-organisations), and the
custody part of every other card.

**The dap-spike's contribution.** Its direction note names the three kinds
of record and lists the account, the capture and the anchor as unfinished
([direction and next steps](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md)).

### Outside parties and systems

**What it is.** A scope sends an operation to a system outside dap,
records the attempt before it is sent, and treats a lost answer as
unknown until it is reconciled. A party in another organisation answers
with its own signed act.

**Today.** This model runs for one kind of operation: publication to a
Git host, with its receipt and cleanup duties. A declared application
cannot declare its own operation. A fact from outside can enter only as a
participant's signed report.

**Use cases.** Release and deployment (35); a payment attempt (38); a
tool executor's work (43); every counterparty in group 4.

**The dap-spike's contribution.** Its obligations experiment declared a
duty with a role, a performing act and a deadline. The controls for late,
missing and mismatched performance passed for Sale, and Club gave a
counterexample
([obligations report](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/T3-OBLIGATIONS-REPORT.md)).

### A personal account across records

**What it is.** One person's view of an episode that spans several
records: an insurer's answer, a contractor's undertaking and a family's
arrangements. The view gathers their statuses and gains no authority over
any of them. It is useful to one person before any other party joins.

**Today.** A member reads the rooms they have joined, one at a time.

**The dap-spike's contribution.** The design of a perspective and an
anchor, and the plain statement that the anchor is implemented nowhere
([the sale as experienced](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-15-sale-as-experienced.md)).

### Rules that change after creation

**What it is.** A running record gains a capability part-way through, or
a later package narrows an earlier one's guard, and what already happened
keeps its meaning.

**Today.** A scope pins its definition for good. A room activates new
definitions for new scopes. No scope moves to a new definition.

**The dap-spike's contribution.** This was the spike's first goal, and it
held for the fixtures that ran: a package attached to a live record,
earlier outcomes replayed unchanged, and a client without the new package
paused instead of guessing
([visibility report](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/REPORT.md),
[ordering report](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/ORDERING-REPORT.md)).
It did not show a general change of a record's state, or two models
composed freely.

### Expressions that compute effects

**What it is.** An expression that takes an event and the rows it reads,
and gives back the new rows. One event can create a row or update it, and
can change several rows.

**Today.** A definition may carry up to 16 named rule expressions in a
restricted JSONata, with arithmetic, conditionals, and functions such as
`$sum`, `$count`, `$max`, `$lookup` and `$substring`. A rule reads the
act's fields and the items the act names, and it answers true or false:
it is a guard. An effect is one of a fixed set of forms, such as copying a
field into a slot or setting a time at a declared offset from the commit
clock. No effect writes a value that an expression computed, so a
computed value enters as a proposal. The signer sends the new value
as a field, a rule checks it against the state, and an effect copies it.
The Counter works this way: the signer proposes the next number and the
next speaker, and
[its rules](../examples/counting/definition.ts) check the arithmetic.

**The gap.** Four things, none of them in the expression syntax:

- A rule's answer is true or false. It cannot give the values to write,
  so every writer must read the state, compute, and propose.
- One act opens one item or changes items it names. It cannot create a
  row when the key is new and update it otherwise, and it cannot write a
  number of rows that the expression decides.
- An act's fields are declared types: text, integer, boolean, time,
  identifier, record, and a list of at most 64. An act cannot carry an
  arbitrary nested record for an expression to normalize.
- The function list has no `$string`, `$number`, `$boolean`,
  `$lowercase` or `$uppercase`.

**Use cases.** Analytic pipelines such as
[Tailapps](https://github.com/generalbusiness-ai/tailapps), where an
author writes expressions that turn a stream of telemetry into tables,
and a reader asks questions in SQL. The pipeline's life (create,
validate, activate) is buildable today. So is a running total for each
session, by proposal and check. Tables that answer SQL are a separate
gap: a scope's reads are pages of items and entries. Chess is the other
case. A rule could accept or refuse a proposed position, and nobody has
written a game's rules in the rule language to see whether its budgets
allow it.

**The dap-spike's contribution.** Its sweep names the need and one
condition: a guard may call a pure helper only if the check on who reads
what still sees everything the helper reads
([authoring language directions](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-18-authoring-language-directions.md)).

### Split and join

**What it is.** One record becomes two, or two become one, with a stated
rule for what each side keeps. The party that writes a record hands that
duty to another.

**Today.** A scope creates child scopes. Nothing else changes a boundary.

**The dap-spike's contribution.** Protocols for split and join, with their
known weakness stated: a join can block after one side releases and
before the other activates
([ordering note](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-14-ordering.md)).
A planned handover of the writer ran in its fixture, and the same
fixture imported an inspection's result into the sale and later joined
fulfilment and delivery in a new record, with one trusted writer and the
limits its report states
([ordering report, goal 1](https://github.com/generalbusiness-ai/dap-spike/blob/9d738e2e/spike/ORDERING-REPORT.md#goal-1-executed-lifecycle-and-proof-boundary)).

### An authoring language

**What it is.** A source form in which an author states roles, readers
and rules once, and a compiler derives the audiences, the available acts
and the checks.

**Today.** An author writes a definition as data, with rule expressions
for what guards cannot say, and the validator bounds it.

**The dap-spike's contribution.** Fifteen ranked directions for such a
language
([authoring language directions](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-18-authoring-language-directions.md)),
and one attempt at a declaration layer that stopped with a
counterexample: its accepted Sale declaration disclosed one person's
refused terms to the wrong readers
([stop report](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/lang/REPORT.md)).

## What the dap-spike contributed

The dap-spike was a research experiment, not a product. It built three
small models (a sale with private offers, a room booking with a clock,
and a club that admits members by vote) on one foundation, and tried to
break its own claims. Its results, in one table:

| Question | Result | Report |
|---|---|---|
| Do people with different views of one record agree? | Yes, in the Sale and Booking fixtures that ran | [Visibility](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/REPORT.md) |
| Does privacy survive? | Yes, in those two models | The same |
| Can a record gain a capability part-way through? | Yes, in the fixtures that ran | The same, and [ordering](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/ORDERING-REPORT.md) |
| Can an agent write a model within a small repair budget? | No. Sale needed six repairs against a budget of two | [Visibility](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/REPORT.md) |
| Does Club's original policy for admitting members hold? | No. The failure was kept | [Decision](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-16-club-admission-decision.md) |
| Does a declaration layer remove the authoring errors? | Not this one. It stopped with a counterexample | [Stop report](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/lang/REPORT.md) |
| Can a duty be declared and checked? | Yes for Sale; Club gave a counterexample | [Obligations](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/T3-OBLIGATIONS-REPORT.md) |
| Can it run as one process with no outside service? | Yes, in its fixture | [Ordering](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/ORDERING-REPORT.md) |
| Can a newcomer understand a record from the screen? | Not measured | |

Where dap stands on each idea:

| Idea in the dap-spike | In dap today |
|---|---|
| One signed record in one agreed order, with one writer | Each scope is that |
| An exact retry returns the first receipt | Runs |
| A result is read from an exact position of another record and is never read live | Runs, as delivery between scopes |
| A shared constraint has one owner | The form of composition; no declared application shows it yet |
| A duty with a deadline | Runs, as timed rules and pending duties |
| Different readers of one record | Not built |
| A package attached to a running record | Not built |
| Split, join and handover of the writer | Not built |
| A personal anchor across records | Not built |

## Source

Written 13 October 2026 against main `d1b845f8` and dap-spike main
`9d738e2e`, and revised 14 October 2026 against main `f20df342` after
review. The states come from reading the documentation, the definitions
and the spike's reports. Nothing was run for this page.
