# Research: jj compared with Artroom

2026-10-01. Request `966aeaad`, promise `bfb563fe`. Answers hugh's
research question: how does `jj` (Jujutsu) compare with the proposed
Artroom?

**Revised 2026-10-04** under request `50d7806a`. This note is reconciled
with the reviewed clarification
`plans/011-2026-10-04-jj-clarification.md` (section 9 gives its
identity). The clarification answers changes review `6649bb50` of the
first version of this note. Corrected passages are rewritten in place.
The first version stays readable at commit
`b3050dc6959f3c10d5eb550b28492d40ab81f435`.

This note covers:
- what each system is for;
- where their models are alike;
- where they differ, and why;
- what Artroom could take from jj, and what it should not;
- a revised sentence for section 3 of the plan.

**Kinds of statement.**
- **Source** marks a fact read in the named documentation, source file
  or saved result.
- **Judgement** marks a product or architectural conclusion.
- **Untested** marks a claim that the evidence does not establish.
- An unmarked statement about jj in the tables of section 2, or in a
  list headed **Source: jj**, is a Source statement from the pages in
  section 8.

Statements about jj come from its own documentation and changelog
(section 8), at jj **v0.45.1** (released 2026-09-03). The pages were
first read on 2026-10-01 at their moving `main` links, and read again on
2026-10-04 at links pinned to v0.45.1. v0.45.1 is a reproducible
comparison baseline. It is not a claim about the latest release or about
every client version. A statement about jj that the clarification does
not restate rests on the 2026-10-01 reading.

Statements about Artroom come from three places, and each is named where
it is used:
- the plan, revision 4, and `docs/protocol.md`, as read on 2026-10-01
  (history);
- Artroom main at `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`, read on
  2026-10-04 (current source);
- decisions recorded in the workroom.

Nothing was measured for this note. Saved results are credited within
their own limits, and none was rerun. Local evidence is not shared Room
authority, and it is not proof about a provider.

**History, adopted and proposed.** Section 5 marks each item as a
recorded decision, as existing work, or as a proposal. The proposed plan
sentence in section 6 is not yet in the plan.

## 1. The short answer

**Judgement.** jj and Artroom solve different problems, and they fit
together. Neither replaces the other.

- **jj is a local version control tool with a Git backend.** It manages
  a local repository's code and history. It makes history editing, undo
  and conflicts easy for whoever holds the repository. It can take part
  in shared workflows through Git remotes, so it is not limited to one
  developer working alone.
- **Artroom is a shared room where many actors do recorded work.** It
  orders signed acts from members and delegated agents. It decides who
  may do what, in what order, under the application's rules, and it
  keeps a signed record of the decisions and outcomes.

**Judgement.** jj itself supplies no shared authority, review, policy or
landing model. That is a statement about what jj does natively. It does
not say that jj cannot take part in an external review system
(section 4). Artroom supplies no history-editing or local-conflict
model. Agents use a git client for that.

An agent may use jj within a code lane on two conditions. The
environment and the repository must be supported. The agent's push,
preparation and proposal must obey the ordinary Artroom rules. This
conditional compatibility does not establish a hosted jj workspace, a
durable agent or continuity across devices.

The two systems share several ideas: a stable identity for a change
across rewrites, a log of state changes, and work that proceeds in
parallel. jj reconciles divergent views of its operation log after the
fact. Artroom decides each act when it is admitted.

**Judgement.** Each answer fits its setting (section 4).

**Judgement.** jj is a neighbour, not a competitor, for the contest. It
is a useful client alongside Artroom. Its design offers Artroom two
ideas that hugh judged worth doing: accepting jj as an agent's client
safely, and showing a change's history across rewrites (section 5).

## 2. What jj is

**Source.** jj is an open-source version control system. Its main
storage backend is Git, so a jj repository can push to and fetch from a
Git remote. The meanings below are local repository meanings. They come
from the pinned glossary, operation-log page and conflict design page.

| Feature | What it does |
|---|---|
| Change ID and commit ID | A change has a stable ID. A rewrite generally keeps the change ID and makes a new commit with a new commit ID |
| Working-copy commit | Each workspace's working copy is itself a commit. Most commands snapshot the working files into it |
| Evolution log (`jj evolog`) | The successive commits a rewritten change has been |
| Operation log (`jj op log`) | Repository views and operation history, kept apart from commit history. A view records heads, bookmarks and working copies |
| Undo (`jj undo`, `jj op revert`, `jj op restore`) | Records a new operation that restores earlier state. Undo adds to the log |
| Operation-view reconciliation | Concurrent commands can each record an operation. A later command finds several operation heads and merges their views three ways. A contradiction, such as a bookmark moved two ways, is recorded, not refused. This is not a promise that working-copy mutation is free of locks (section 4) |
| First-class conflicts | Unresolved content is stored in the commit, as an ordered expression of trees. Work can continue on top, and descendants are rebased onto it. Some expressions simplify as history changes |
| Workspaces | Several working copies share one repository's storage and one operation history |

The glossary also says that other workspaces point to storage in the
initial workspace. So a directory of checked-out files does not, on its
own, establish that the shared local repository can be recovered.

**Source.** The pinned changelog records these additions:

| Addition | Version and date | What it is |
|---|---|---|
| `change-id` Git commit header, on by default | 0.30.0, 2025-06-04 | Ordinary transfer of Git objects can carry the change ID. Tools that rewrite commits may lose it |
| `jj gerrit upload` | 0.34.0, 2025-10-01 | Experimental upload of changes to Gerrit. It is an integration with a review system, not a complete review service |
| `jj run` | 0.43.0, 2026-07-01 | Runs a command over a set of changes, each in a private working copy. Edits and conflicts propagate to descendants (read 2026-10-01; not read again at the v0.45.1 pin, and the clarification does not restate it) |
| `jj converge` | 0.45.0, 2026-09-02 | Heuristics that combine divergent commits (two visible commits for one change ID). It can still fail in non-interactive mode |
| Comparison baseline | 0.45.1, 2026-09-03 | The release this note compares against |

These dates describe the source baseline. They are not capabilities
newly measured in Artroom.

**Limits that matter here** (Source: jj's Git-compatibility page). The
page lists no support for Git hooks, partial clones or Git LFS, and no
full support for submodules in the working copy. Commit signing is
supported. A repository's own requirements still matter when choosing
the client. Section 4 describes how a conflicted commit appears in Git.

## 3. Where the models are alike

**Judgement.** These analogies help explain the two systems. They do not
make their identities, authority or proof equal.

| Idea | jj | Artroom, and the limit of the analogy |
|---|---|---|
| Stable identity across rewrites | Change ID; each rewrite is a new commit | In the code-review profile: lane ID; each `propose` is a new generation with an immutable head. The application's declared bindings stay authoritative |
| History of rewrites | Evolution log and comparison | Every proposal generation stays readable, with its verdicts and checks. Grouping by change helps a reviewer inspect them |
| A log of state changes | Operation log, with a view per operation | Ordered acts, with rule inputs and outcomes kept per act, plus system events |
| Correction without erasing history | `jj undo` adds an operation that restores an earlier view | Acts are permanent. A correction is a new act (`release`, handover, a revert lane) under the application's rules |
| Parallel preparation | Separate local workspaces and operation views | Agents work in separate lane forks, and preparation is optimistic. `expectedGeneration` is a compare-and-swap. Admission and publication still have fences |
| Isolated working copies | Workspaces, sharing one repository's storage | One Artifacts fork per lane, with a token scoped to the lease |
| Running tools over changes | `jj run`, a local command | Independent checker jobs on the named integration commit, and on a filtered snapshot where required |
| Signing | Commits can be signed | Every act is signed by its actor, and publication can be verified. A signed commit is a different object; commits are not required to be signed |

**Source for the Artroom column.** The plan, revision 4, and
`docs/protocol.md` describe the lane, generation, fork and checker rows.
The limits in the last column come from the reviewed clarification.

The analogy with the code-review profile has two practical limits.
- A lane can hold several changes, and an author can supply duplicate or
  divergent headers. One header is not one lane, one generation, one
  authorised member or one obligation.
- Artroom keeps the Room's outcome apart from an agent's description of
  what happened. A local command that succeeds does not establish an
  admitted proposal, a satisfied review or a landed publication.

**Judgement.** Lane and generation belong to the code-review profile.
They are not the universal identity of all Artroom work. For a general
application, the declared kinds and their recorded bindings decide what
the work means. The clarification takes this general model from
decisions recorded in the workroom. Unlanded candidates for declared
acts are not credited here as behaviour of main.

## 4. Where they differ, and why

### Who the system serves

**Judgement.** jj serves whoever holds a repository. Its processes and
workspaces on that repository act with the same authority. People share
jj work through Git remotes. Artroom serves many actors, people and
agents, with different roles, keys and delegations.

### What happens when two writers race

This is the central difference. Concurrency has several boundaries, and
the comparison holds at only one of them.

**Source: jj.**
- **Operation-log views are reconciled later.** jj's concurrency design
  merges divergent operation heads. A bookmark moved two ways is
  recorded as moved from A to B or C. A change rewritten twice becomes
  divergent; `jj converge` can combine it, and can also fail.
- **The Git backend is not entirely lock-free.** The same design page
  says so, and it allows ordinary I/O failures.
- **Working-copy mutation takes a lock.** The working-copy interface
  acquires a lock to mutate the working copy and releases it when the
  mutation finishes.

So the operation-view design does not establish that commands never
wait, that writes always succeed, or that concurrent writers can safely
mutate one working copy without coordination.

**Source: Artroom** (plan, revision 4, and `docs/protocol.md`).
- **Artroom decides at admission.** One sequencer orders every act.
  Authority, generation and policy are checked before an act is
  recorded. A stale act is refused with a rule and a fix
  (`generation-moved`). Two holders cannot both propose for one lane.

**Judgement.** Each answer fits its setting. Reconciling local views is
useful for history editing by processes that have access to the same
repository. Every such writer is equally trusted, and the log is local.
It is not a shared authorisation protocol. Artroom's log is signed,
published and permanent, and it records who was allowed to do what.
Artroom must
decide whether an act is admitted in its sequenced state. A stale or
unauthorised act cannot become authorised by merging it with another
writer's view.

Parallel editing stays valuable, and the authority boundary does not
forbid optimistic work on code. Different lane holders can edit their
forks while other work proceeds. Their later proposals, prepared
commits, retained evidence and landing reservations each have their own
checks and fences.

### What the log proves

**Source: jj.** jj's operation log is local and unsigned. It describes
repository views and operations. It records metadata such as user name
and host name, which the writer supplies. Undo is a new operation.
`jj git push` sends Git history and refs, not operations, so other
people do not see your operation log. None of this guarantees that the
local log is kept through every cleanup, storage loss or workspace move.

**Source: Artroom, `docs/protocol.md` at main `e6e67828`.** Artroom's
log is the shared record. Each act is signed by its actor. The log is
published to `refs/artroom/log`. An
independent verifier can check the supported published prefix, up to the
published high-water mark, and state the limits of that proof. A member
handle, user name, host name, jj header or commit signature cannot
replace the actor's signature, the current role or the exact declared
binding that admission uses.

### Conflicts

Two different things are called a conflict. One is conflict data that jj
stores. The other is a failed integration in Artroom.

**Source: jj.**
- **In jj, a conflict is data.** It is stored in a commit. Work
  continues on top of it.
- **Conflict expressions can simplify.** The conflict design describes
  ordered tree expressions and the cancelling of terms. A changed base
  or a backout can simplify some conflicts. That is not a guarantee that
  an arbitrary conflict resolves itself.
- **In Git, a jj conflict is ordinary objects.** A conflicted commit
  appears as `.jjconflict-base-*` and `.jjconflict-side-*` directories
  at the root of the tree. The `jj:trees` commit header supplies the jj
  meaning. Ordinary Git tools do not read that header as jj does. So a
  valid Git tree does not, on its own, mean the content is resolved.
- **Pushing a conflict is an explicit choice.** `jj git push` refuses
  conflicted commits unless given `--allow-conflicts`.

**Source: Artroom, `docs/protocol.md` at main `e6e67828`.**
- **In Artroom, a merge conflict ends a landing.** Preparation merges
  the proposed head onto the expected main. An unresolved Git merge ends
  the landing operation as `failed` with code `conflict` and the paths
  (R-LAND-4). The holder owns the recut (R-LANE-9).
- **jj conflict data inside a head is a separate case.** A head can
  merge cleanly and still carry jj conflict directories. Neither the
  validity of the Git tree nor R-LAND-4 excludes that data.

**Source: Artroom, `packages/policy/src/pack.ts` at main `e6e67828`.**
The default policy pack already has a `jj-conflicts` rule
(`jjConflicts`). On `propose`, it refuses a proposal whose added or
modified paths, or rename destinations, start with the root conflict
directory prefixes. It runs before the `outside-claim` check, so the
author sees the real cause. It does not count deletions. This is a
**changes-only policy decision**. It is not a scan that proves the whole
head free of jj conflict data. Untouched older content, removals and
recovery paths need their own rules. Open point 38 in `docs/protocol.md`
(section 29.5) records why a whole-head fact was not added. These are
limits read in the source. They are not controls newly run for this
note.

**Judgement.** An application that requires resolved content in a
proposal should say so in its policy and its evidence. This note does
not widen the existing changes-only rule, and it does not ask for a new
whole-head scan. Section 5, item 3 records the suggestion to use jj's
idea during preparation. It is not pursued.

### What jj does not do

**Judgement.** jj's local features do not supply member enrolment,
delegations, admission of declared acts, claims or declared intent,
review verdicts and obligations, policy, attention delivery, or governed
landing. These are Artroom's subject matter. `jj gerrit upload` shows
that a jj client can integrate with an external review system. It does
not make jj the Room's shared authority service.

### What Artroom does not do

**Judgement.** Artroom has no history editing, no local undo and no
local conflict tools. A suitable local or hosted client does that work.
jj is one good choice of client.

## 5. What Artroom could take from jj

In order of value for cost.

**hugh's decisions (2026-10-01), recorded and unchanged:**
- Items 1 and 2 are worth doing.
- Item 3 is not pursued. It is invasive, and its main benefit, a
  conflict that vanishes when main moves again, comes mostly from
  reverts, which seem rare.
- Item 4 is not decided.

The evidence below was added on 2026-10-04. New evidence does not make a
new decision to commission work, and it does not add a gate before the
first Jam task. "Worth doing" is an adopted direction. It is not
demonstrated current support for jj clients.

### 1. Say that jj works as an agent's client, and make it safe

Small. **Status: adopted direction; partly built; bounded evidence.**

- **Source: plan, revision 4.** A coding agent needs the MCP URL and
  `git`.
- **Judgement.** jj pushes with ordinary Git, so a jj client can
  qualify, on the conditions in section 1.
- **History.** On 2026-10-01 this note marked header survival as
  untested and asked for a test in lane B. It also guessed that a head
  pushed with `--allow-conflicts` would "probably" be refused as
  `outside-claim` or fail its checks. That guess is not evidence of
  either refusal.
- **Source: existing test, main `e6e67828`.**
  `packages/git/test/jj-change-id.test.ts` covers preservation of the
  raw header through fork, pinning, and publication by fast-forward or
  by integration merge. It uses real local Git objects and bare
  repositories as stand-ins. Its case with the actual jj client runs
  only when the client is installed. The existence of the source does
  not prove that case ran in every gate.
- **Source: saved result, main `e6e67828`.**
  `packages/git/measure/results/jj-change-id-2026-10-01T21-57-04-695Z.json`
  (8,383 UTF-8 bytes, SHA-256
  `228e6850ca56ab674f4ab70c1043bb0d8c815c3b72a42b9f3c746b940856d5bc`)
  is a dated measurement against Artifacts. It records two lanes
  produced with jj: one landed by fast-forward and one by merge. Both
  keep the original header at fork, at pin and in main's history.
- **The merge commit has no header.** In the merge result, the proposed
  head is a parent, and the new merge commit does not itself carry
  `change-id`. Keeping the original reachable commit is not the same as
  copying its header onto a new object.
- **Limits of that evidence.** The driver is
  `packages/git/measure/jj-change-id.mjs`. Its Worker,
  `packages/git/measure/harness/worker.ts`, is for measurement only. It
  connects real Artifacts and publisher components to a stand-in Room.
  It has no production policy admission. It accepts the lanes its test
  driver holds, and it treats built landings as ready. Its synthetic
  local log is not the subject of the measurement. So the result is a
  recorded, bounded result for the artifact path. It does not cover the
  production browser's review, membership, independent log or recovery.
  The JSON does not pin the version of the jj executable, so its date
  does not prove that the run used v0.45.1.
- **Source: existing policy, `packages/policy/src/pack.ts` at main
  `e6e67828`.** The changes-only `jj-conflicts` rule (section 4) is in
  the default pack. Its fix reads: "Resolve the jj conflicts, so the
  proposal no longer adds or changes .jjconflict-* paths, then propose
  again."
- **Judgement.** Do not commission the rule again, and do not describe
  it as missing. Any wider rule needs its own decision.
- **Untested.** The saved result does not establish compatibility with
  the currently deployed client, a full live path from Room review to
  publication, recovery of ignored files, recovery of the operation
  store, or continuity across devices. Do not present all repositories,
  forges, rewriting clients or conflict states as covered. C2 and the
  joint browser acceptance own the cloud and runtime witnesses
  (section 7).

### 2. Show a change's history across generations

Medium. **Status: adopted direction; display built with mock data; live
data not delivered.**

- **The idea (2026-10-01).** When commits carry `change-id` headers, the
  Proposal screen could show which changes a new generation rewrote,
  added or dropped, with an interdiff per change, like `jj evolog` and
  `jj interdiff`. This helps reviewers decide what to read again.
- **Source: existing implementation, `packages/ui/README.md` at main
  `e6e67828`.** The per-change history was built under request
  `d0cbb26d`. It shows rewritten, added and dropped changes, and
  interdiffs relative to each version's parent. Where the two parents
  differ, it maps the old hunk's lines into the new parent. Where they
  do not map one to one, it says it could not tell whether the edit
  moved. A change ID that appears twice in a generation is shown as
  divergent and not matched. Commits without a header are counted. The
  display works with mock data.
- **Wording in `plans/011`.** The clarification describes the same
  display as showing "mapped and unmapped comment positions, explicit
  unknown states". The README at main `e6e67828` does not use those
  terms. This note follows the README.
- **Source: the same README.** Live Room data does not yet provide
  `changeHistory` or the commit and blob reads it needs. Live screens
  therefore show no such history.
- **Source: current bounds.** 2,000 commits; tree depth 64; 100,000
  entries; 2,000 lines per file; 10,000 UTF-8 bytes per line; 20 million
  units of comparison work in total. A blob is read whole before the
  comparison bounds apply, so a live authorised read must bound the blob
  itself. Bounds in source, and mocks, do not prove a deployed live
  reader.
- **Judgement.** N1's authorised, immutable reads of proposals, diffs,
  files and commits, and C5's live browser workflow, should reconcile
  this display with their current snapshots and bounds. Request
  `d0cbb26d` keeps its own remaining delivery and review obligations.
  Avoid a duplicate lane.
- **A header is display metadata.** It helps a reviewer group versions
  and decide what to read again. It is supplied by the author. It does
  not prove who signed, that two changes are equivalent, that a verdict
  qualifies, that authority is current, or that a carry is valid.
  Artroom's recorded bindings, integrations and evidence rules decide
  those outcomes. The carry rule in section 7 of the plan stays
  path-based. Unmatched or ambiguous headers should stay explicit. The
  screen should not invent continuity for them.

### 3. Treat a conflict as a state of preparation, not only a failure

Larger; it touches R-LAND-4 and R-LANE-9. **Status: recorded decision,
not pursued.**

The suggestion, kept here as history:
- Keep the conflicted preparation as an inspectable object: the base,
  both sides and the conflicting paths, so the holder resolves against
  exactly what the room saw.
- Re-evaluate it when `main` moves, as Artroom already does for
  `retryable` operations. jj's conflict simplification shows that some
  conflicts can vanish when the base moves again, for example after a
  revert. Today a `failed` operation would not notice.

This would change R-LAND-4 and the holder's recut. The possible benefit
from backouts, or from other base changes that simplify a conflict, is a
**Judgement**. It is not a measured result, and it is not an implicit
feature request.

The suggestion bears on the cascade gitseq showed (section 2 of the
plan: 6 of 10 approvals went to heads that then conflicted). That figure
is a dated observation of gitseq, kept as context. It is not a current
rate. **Untested** that this suggestion would have reduced it.

Nothing here supplies a live conflicted-preparation implementation, an
acceptance gate or a dependency for Jam.

### 4. Borrow the vocabulary of append-only undo

Small. **Status: recorded decision, undecided.**

jj shows that "undo" can be friendly and still add to history rather
than erase it. Artroom's release, handover, correction and revert lane
could be presented the same way: each is a later recorded act that names
the work it changes. Whether the product calls this "undo" is still an
open choice.

**Judgement.** Friendly undo wording could describe later corrective
work. It must not imply any of these:
- that the Room's recorded history is erased, or a Room act deleted;
- that a command's external effects are automatically reversed or
  restored;
- that jj keeps its local history for ever;
- that a new API has already been adopted.

### What Artroom should not take

**Judgement.**
- **Reconcile-later for acts.** Keep operation-view reconciliation on
  the local code side. Do not use it to merge contradictory claims of
  Room authority after admission. Section 4 gives the reason: signed,
  published authority cannot be merged after the fact.
- **Author-supplied metadata as identity.** jj's operations record a
  user name and host name, and commits can carry a change header. This
  metadata is useful for display. Do not turn user names, host names or
  headers into membership, approval or delegation. Artroom takes
  identity only from a verified signature, and its existing signature
  and admission rules stay authoritative.

## 6. A revised sentence for the plan

**Status: proposed. The plan is not changed by this note.**

Section 3 of the plan, revision 4, says: "jj offers first-class
conflicts and an operation log." That is accurate but leaves out the
parts that matter to a judge comparing the two.

On 2026-10-01 this note proposed a replacement. That text said jj's log
"supports undo and lock-free concurrent commands". Review `6649bb50`
found that claim too broad. The review accepted "no shared authority,
review or policy model" as a statement of what jj does natively, not a
claim that jj cannot take part in an external review system. That
proposal is withdrawn; it stays readable at `b3050dc6`.

The reviewed clarification proposes this text instead, to replace the
plan's comparison sentence when the plan is integrated:

> jj is a local version control client with a Git backend and history
> editing tools. Its operation-log views reconcile divergent local
> operations, while working-copy mutations and backend I/O have separate
> constraints. Artroom instead records shared, authorized acts and their
> outcomes. A supported jj client can work in a code lane, with immutable
> commits and author-supplied change headers carried through the ordinary
> proposal path; those headers do not confer Room authority or review.

**Judgement.** This is a comparison judgement grounded in the sources in
section 8. It avoids the earlier blanket claims: lock-free, never
waiting, always committing, and conflicts being excluded. It does not
change the general contract for declared acts, and it does not promise
that every client is compatible.

The plan edit is still owed under request `966aeaad`. Approval of the
clarification did not edit the plan and does not satisfy that
obligation. The first version of this note made the same point: it
proposed the change and did not make it, because the plan was under
checker's review.

## 7. Follow-up work

**History.** On 2026-10-01 this section listed three pieces of work to
carry out items 1 and 2, each needing its own request:
1. Test that a jj `change-id` header survives Artifacts push, pinning
   and the landing merge. (Lane B.)
2. Add a `refuse` rule for `.jjconflict-*` paths to the default policy
   pack, with the fix in item 1. (Lane D.)
3. Show per-change history and interdiffs between generations on the
   Proposal screen, when commits carry `change-id` headers. (Lane F.)

**Current state (2026-10-04).** All three now have work on main, within
the limits in section 5. The table names what exists and who owns what
remains. No duplicate implementation request is needed.

| Work or question | Current evidence | Existing owner or next decision |
|---|---|---|
| Header preservation | Local test source, plus the bounded, dated Artifacts result | Credit lane B's evidence. Reconcile only a changed path or source, or what remains of the original acceptance |
| Friendly conflict refusal | The default pack's changes-only rule, and the documented whole-head limit | Credit lane D. Any wider policy needs a separate, explicit decision |
| Per-change display | Built with mocks; the live read gap is explicit | Original `d0cbb26d`, N1 `53016b8e`, C5 `cfbde32f` |
| Live authorised immutable reads | N1's existing design package. Bounded source reads still need production authority | N1, C1 `b538c5ea`, and the current contract and admission owners |
| Hosted recovery | The accepted checkpoint and lifecycle direction in plan 005, not the header measurement | C2 `6cdaf20f`, C3 `13dfc613`, C6 `d89fc17f` |
| Correction vocabulary | Item 4 is undecided | A later, explicit product choice |
| Integration of this comparison | The accepted changes and the approved clarification | Original `966aeaad` / `bfb563fe`. Request `50d7806a` assists; it does not retire or satisfy that promise |

### A dependency for hosted jj continuity

**Judgement.** If a hosted environment advertises jj continuity, its
checkpoint must cover more than files and the closure of Git objects. It
must also cover the actual `.jj` operation, store and view state, and
the workspace references. Plan 005's quiescent checkpoint, acknowledged
manifest and epoch fences should apply to every writer. Prepared commits
and the frozen meaning of signed acts should be preserved separately. A
shell
exit, a pushed ref or a local working-copy commit does not prove a
durable checkpoint. Nor does it decide whether an external command with
an uncertain outcome can safely be repeated.

This is a dependency for claiming that client experience. It is not a
new requirement that the first C2 task or Jam task use jj. The cloud and
browser stories keep their agreed lifecycle, device authority,
reconciliation of uncertain outcomes, and the ordinary proposal, review
and publication boundaries.

### What this note does not gate

**Source: the reviewed clarification.** The vocabulary of declared acts
may change while Jam hosts its own work, and a display analogy cannot
freeze it. Builder decides when the first Jam task is enabled. Full
platform completion, these note corrections and the full manual are not
new gates on that start. The manual proceeds beside Jam once Jam
starts. Functional acts and the test-cost integration keep higher
priority.

### Scenarios this comparison must answer

A reader can check the note against these cases. They need no runtime
suite.

| Scenario | Required conclusion |
|---|---|
| Two local jj commands race | Operation-view merging is qualified. The analogy does not erase working-copy locks or I/O errors |
| Git accepts a jj conflict object | A valid Git object establishes neither resolved content nor an R-LAND-4 integration conflict. The current policy's changes-only limit is explicit |
| Artroom fast-forwards or creates a merge | Keeping the original raw commit, with its reachable header, is distinct from a header on the new merge commit |
| A reviewer opens per-change history | The existing display and mocks are credited. Live authorised source reads and bounds are not claimed as delivered |
| A supplied header is duplicated, absent or rewritten away | Grouping can be incomplete or ambiguous. Identity, admission, verdict and carry still use their ordinary rules |
| A cloud host is interrupted | The header measurement does not prove recovery of local operation state, commands or workspaces. C2, C3 and C6 keep those obligations |
| An application declares a different vocabulary | The lane analogy supplies no new binding, authority or completion rule |
| Follow-up work is planned | All four recorded choices and the existing owners remain. No duplicate implementation request and no first-Jam gate is introduced |

Future work reuses the existing witnesses where their source and meaning
are unchanged. It adds focused controls only for boundaries that
actually change, through the owners above. This note calls for no
mutation sweep, fresh baseline, install or broad runtime gate.

## 8. Sources

jj, at **v0.45.1**, retrieved 2026-10-04. These links describe that
baseline only.
- Changelog: <https://github.com/jj-vcs/jj/blob/v0.45.1/CHANGELOG.md>
  (0.30.0 `change-id` header default; 0.34.0 `jj gerrit upload`; 0.43.0
  `jj run`; 0.45.0 `jj converge`; 0.45.1 comparison baseline)
- Concurrency design: <https://github.com/jj-vcs/jj/blob/v0.45.1/docs/technical/concurrency.md>
- Working-copy interface: <https://github.com/jj-vcs/jj/blob/v0.45.1/lib/src/working_copy.rs>
- Operation log: <https://github.com/jj-vcs/jj/blob/v0.45.1/docs/operation-log.md>
- First-class conflicts, design: <https://github.com/jj-vcs/jj/blob/v0.45.1/docs/technical/conflicts.md>
- Git compatibility: <https://github.com/jj-vcs/jj/blob/v0.45.1/docs/git-compatibility.md>
- Glossary: <https://github.com/jj-vcs/jj/blob/v0.45.1/docs/glossary.md>

jj, as first retrieved 2026-10-01 (history). These links follow the
moving `main` branch, so they are replaced above by pinned ones. The
first version named 0.45.1 as the "latest release"; that was true only
of the day it was read.
- Changelog: <https://github.com/jj-vcs/jj/blob/main/CHANGELOG.md>
- Concurrency design: <https://github.com/jj-vcs/jj/blob/main/docs/technical/concurrency.md>
- Operation log: <https://github.com/jj-vcs/jj/blob/main/docs/operation-log.md>
- First-class conflicts, design: <https://github.com/jj-vcs/jj/blob/main/docs/technical/conflicts.md>
- Git compatibility: <https://github.com/jj-vcs/jj/blob/main/docs/git-compatibility.md>
- Glossary: <https://github.com/jj-vcs/jj/blob/main/docs/glossary.md>

Artroom, at main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`, read
2026-10-04:
- `packages/policy/src/pack.ts`: the default `jjConflicts` changes-only
  rule.
- `packages/git/test/jj-change-id.test.ts`: witnesses for the raw object
  and the header after landing.
- `packages/git/measure/jj-change-id.mjs`: the measurement driver.
- `packages/git/measure/harness/worker.ts`: the stand-in boundary.
- `packages/git/measure/results/jj-change-id-2026-10-01T21-57-04-695Z.json`:
  the saved result named in section 5.
- `packages/ui/README.md`: the per-change display, mocks, limits and the
  live-read gap.
- `docs/protocol.md`: R-LANE-9, R-LAND-4, and open points 38 and 39 in
  section 29.5.

Artroom, as read on 2026-10-01 (history), at
`b3050dc6959f3c10d5eb550b28492d40ab81f435`:
- `notes/2026-10-01-artroom-plan.md`, revision 4: sections 2, 3, 7 and 8
- `docs/protocol.md`: R-LANE-9, R-LAND-4

Workroom decisions. The current declared acts, and the C1 to C6 and N1
to N7 directions, are recorded workroom decisions and requests. The
clarification says they are indexed in `plans/README.md`.

## 9. Revision record and correction map

| Item | Identity |
|---|---|
| First version of this note | Commit `b3050dc6959f3c10d5eb550b28492d40ab81f435`, branch `request/research-jj`: 12,816 UTF-8 bytes, 247 lines, SHA-256 `8563588cd23c7047eb3572bd61b78b432b87eef85141e467cb08d63b72aa516f` |
| Changes review | `6649bb50`, four correction groups; ratified in `fef19f77` |
| Clarification | `plans/011-2026-10-04-jj-clarification.md`, Draft 1: 25,637 bytes, 423 lines, SHA-256 `cd74665c0e516d30edfdc078d18f2410574d8ec2f6a221d383c62ab175e3139b`. Request `63be1105161fb4d0c0c390fbba34c30929781932`, promise `152a3b84ec731df68c058a61b333396f9e2ddcfc`. Primary artifact `9acd28e0` at head `5d0d606e` |
| Its approval and guidance | Approval `e7cc8c03`, as an evidence-only planning clarification. Guidance `cb4613c9` |
| This reconciliation | Request `50d7806a`, 2026-10-04 |

The clarification file is not on this branch. It lives in the planner's
copy of `plans/`, and its frozen bytes are the primary artifact above.

Where each accepted correction group is delivered in this note:

| Group in review `6649bb50` | Delivered in |
|---|---|
| 1. Scope optimistic concurrency to the operation-log layer | Sections 1 and 2 (feature table), section 3 (parallel preparation), section 4 (races), section 6 (replacement text), section 7 (scenarios) |
| 2. Distinguish an unresolved landing merge from jj conflict data in a Git tree | Section 4 (conflicts), section 5 items 1 and 3, section 7 (scenarios) |
| 3. Exact source identity, and qualified interoperability and header evidence | The opening statement on kinds of statement, section 2 (dated additions), section 5 item 1, section 8, this section |
| 4. Follow-up boundaries, declared applications and ownership | Sections 1 and 3 (profile analogy), section 4 (logs, authority), section 5 items 2 and 4, section 7 |

The approval covers the dated clarification only. It gives no
implementation closure, runtime certification, universal client
compatibility, deployment or first-Jam gate. No runtime test,
installation, jj command or external action was performed for the
clarification, for its review, or for this reconciliation.
