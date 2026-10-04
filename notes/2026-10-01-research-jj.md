# Research: jj compared with Artroom

2026-10-01. Request `966aeaad`. Answers hugh's research question: how
does `jj` (Jujutsu) compare with the proposed Artroom?

This note covers:
- what each system is for;
- where their models are alike;
- where they differ, and why;
- what Artroom could take from jj, and what it should not;
- a revised sentence for section 3 of the plan.

**Kinds of statement.** Statements about jj come from its own
documentation and changelog (section 8), at jj 0.45.1 (2026-09-03).
Statements about Artroom come from the plan (revision 4) and
`docs/protocol.md`. Nothing here was measured. Judgements are marked
**Judgement**, and claims nobody has tested are marked **Untested**.

## 1. The short answer

jj and Artroom solve different problems, and they fit together.

- **jj is a version control tool for one person's repository.** It runs
  locally over a Git backend. It makes history editing, undo and
  conflicts easy for whoever holds the repository.
- **Artroom is a shared room where many actors change one repository.**
  It decides who may do what, in what order, under the repository's
  policy, and it keeps a signed record of that.

jj has no shared authority, review, policy or landing model. Artroom has
no history-editing or local-conflict model; agents use whatever git
client they like. So an agent can use jj inside an Artroom lane.

The two systems share several ideas: a stable identity for a change
across rewrites, a log of every state change, and concurrency without
locks. They answer the concurrency question in opposite ways, and each
answer fits its setting (section 4).

**Judgement.** jj is a neighbour, not a competitor, for the contest.
Its design offers Artroom two ideas worth building: accepting jj as an
agent's client safely, and showing a change's history across rewrites
(section 5).

## 2. What jj is

jj is an open-source version control system. Its main storage backend is
Git, so a jj repository can push to and fetch from any Git remote. The
features that matter for this comparison:

| Feature | What it does |
|---|---|
| Change ID | A stable ID for a change. It survives rewrites; each rewrite makes a new commit ID |
| Working-copy commit | The working copy is itself a commit, snapshotted automatically |
| Evolution log (`jj evolog`) | The sequence of commits a change has been, across rewrites |
| Operation log (`jj op log`) | Every command that changes the repository is an operation with a snapshot (a "view") of all heads, bookmarks and working copies |
| Undo (`jj undo`, `jj op revert`, `jj op restore`) | Restores earlier views. Undo is itself a new operation, so the log only grows |
| Lock-free concurrency | Concurrent commands each commit an operation. The next command finds several operation heads and merges their views three ways. Contradictions are recorded, not refused |
| First-class conflicts | A merge conflict is stored in the commit, as an ordered list of trees. Work continues on top; descendants rebase automatically; the conflict is resolved when convenient |
| Workspaces | Several working copies share one repository and one operation log |
| `jj run` (0.43.0, 2026-07-01) | Runs a command over a set of changes, each in its own private working copy. Edits and conflicts propagate to descendants |
| `jj converge` (0.45.0, 2026-09-02) | Combines divergent commits (two visible commits for one change ID) into one, with heuristics, or aborts in non-interactive mode |
| `change-id` Git commit header (default since 0.30.0, 2025-06-04) | Carries the change ID through ordinary `git push`. Some forges and Git commands drop it when they rewrite commits |
| `jj gerrit upload` (0.34.0, 2025-10-01, experimental) | Uploads stacks of changes to Gerrit |

**Limits that matter here** (from jj's Git-compatibility page): no Git
hooks, no partial clones, no Git LFS, no submodules. Commit signing is
supported. Conflicted commits appear in Git as `.jjconflict-base-*` and
`.jjconflict-side-*` directories; `jj git push` refuses them unless given
`--allow-conflicts`.

## 3. Where the models are alike

| Idea | jj | Artroom |
|---|---|---|
| Stable identity across rewrites | Change ID; each rewrite is a new commit | Lane ID; each `propose` is a new generation with an immutable head |
| History of rewrites | Evolution log | Every generation stays readable, with its verdicts and checks |
| A log of every state change | Operation log, with a view per operation | Act log, with rule inputs and outcomes per act |
| Append-only undo | `jj undo` adds an operation that restores an earlier view | Acts are permanent; a correction is a new act (`release`, a revert lane) |
| Optimistic concurrency | Commands never wait; divergence is found afterwards | Agents work in parallel forks; `expectedGeneration` is a compare-and-swap; preparation runs in parallel |
| Isolated working copies | Workspaces | One Artifacts fork per lane, with a token scoped to the lease |
| Running tools over changes | `jj run` | Checkers run on each integration commit |
| Signing | Commits can be signed | Every act is signed; commits are not required to be |

## 4. Where they differ, and why

### Who the system serves

jj serves one owner of a repository. All its processes and workspaces
have the same authority. Artroom serves many actors, people and agents,
with different roles, keys and delegations.

### What happens when two writers race

This is the central difference.

- **jj accepts both writes and reconciles later.** An operation "cannot
  fail to commit". The next command merges the divergent views. A
  bookmark moved two ways is recorded as "moved from A to B or C". A
  change rewritten twice becomes divergent; `jj converge` can combine it.
- **Artroom decides at admission.** One sequencer orders every act.
  Authority, generation and policy are checked before an act is
  recorded. A stale act is refused with a rule and a fix
  (`generation-moved`). Two holders cannot both propose for one lane.

**Judgement.** Each answer fits its setting. jj can reconcile later
because every writer is equally trusted and the log is private. Artroom
cannot: its log is signed, published and permanent, and records who was
allowed to do what. A contradiction about authority, once recorded and
published, cannot be merged away. Artroom does keep jj's optimism where
it is safe, in the code itself: agents never wait for each other to
edit, only to land.

### What the log proves

jj's operation log is local and unsigned. It records metadata such as
user name and host name, which the writer supplies. `jj git push` sends
commits, bookmarks and tags, not operations, so other people do not see
your operation log.

Artroom's log is the shared record. Each act is signed by its actor. The
log is published to `refs/artroom/log` and can be verified offline up to
its published high-water mark.

### Conflicts

- **In jj, a conflict is data.** It is stored in a commit. Work
  continues on top of it. Conflict expressions simplify: if a conflicted
  commit is later rebased past the cause, the conflict can disappear
  without anyone resolving it.
- **In Artroom, a conflict ends a landing.** Preparation merges the head
  onto the expected main. A conflict ends the landing operation as
  `failed` with code `conflict` and the paths (R-LAND-4). The holder owns
  the recut (R-LANE-9).

Artroom cannot publish a conflict: `main` must be a tree Git tools and
checkers can use. So jj's model applies, if at all, before publication
(section 5, item 3).

### What jj does not do

jj has no claims or declared intent, no review verdicts, no policy, no
obligations, no landing operation, no attention queue and no membership.
These are Artroom's subject matter.

### What Artroom does not do

Artroom has no history editing, no local undo and no local conflict
tools. It leaves these to the agent's git client. jj is one good choice
of client.

## 5. What Artroom could take from jj

In order of value for cost.

**hugh's decisions (2026-10-01):**
- Items 1 and 2 are worth doing.
- Item 3 is not pursued. It is invasive, and its main benefit, a
  conflict that vanishes when main moves again, comes mostly from
  reverts, which seem rare.
- Item 4 is not decided.

1. **Say that jj works as an agent's client, and make it safe.** Small.
   - An Artroom lane needs only an MCP URL and `git`. jj pushes with
     ordinary Git, so it qualifies.
   - **Untested:** that a jj `change-id` header survives the path from
     fork to pinned head to landing. A plain Git server stores the
     commit object unchanged, and R-LAND-4 builds a merge commit rather
     than rewriting, so it should. A test in lane B would settle it.
   - A head pushed with `--allow-conflicts` contains `.jjconflict-*`
     directories. Today it would probably be refused as `outside-claim`
     or fail its checks, with a confusing reason. A `refuse` rule in the
     default policy pack could name the cause, with the fix "resolve the
     jj conflicts, then propose again".
2. **Show a change's history across generations.** Medium.
   - When commits carry `change-id` headers, the Proposal screen could
     show which changes a new generation rewrote, added or dropped, with
     an interdiff per change, like `jj evolog` and `jj interdiff`.
   - This helps reviewers decide what to re-read. It does not change the
     carry rule in section 7 of the plan, which stays path-based; a
     header is author-supplied and proves nothing.
3. **Treat a conflict as a state of preparation, not only a failure.**
   Larger; it touches R-LAND-4 and R-LANE-9. Not pursued (above).
   - Keep the conflicted preparation as an inspectable object: the base,
     both sides and the conflicting paths, so the holder resolves
     against exactly what the room saw.
   - Re-evaluate it when `main` moves, as Artroom already does for
     `retryable` operations. jj's conflict simplification shows that a
     conflict can vanish when the base moves again, for example after a
     revert. Today a `failed` operation would not notice.
   - This bears on the cascade gitseq showed (section 2 of the plan: 6
     of 10 approvals went to heads that then conflicted). **Untested**
     that it would reduce that number.
4. **Borrow the vocabulary of append-only undo.** Small. jj shows that
   "undo" can be friendly and still never erase history. Artroom's
   release, handover and revert lane could be presented the same way:
   every correction is a new act that names what it corrects.

### What Artroom should not take

- **Reconcile-later for acts.** Section 4 gives the reason: signed,
  published authority cannot be merged after the fact.
- **Host-supplied metadata as identity.** jj's operations record a user
  name and host name. Artroom takes identity only from a verified
  signature, and should stay that way.

## 6. A revised sentence for the plan

Section 3 of the plan currently says: "jj offers first-class conflicts
and an operation log." That is accurate but leaves out the parts that
matter to a judge comparing the two. Proposed text:

> jj (Jujutsu) is a local version control tool with a Git backend. It
> gives each change a stable ID across rewrites, records every
> repository operation in a log that supports undo and lock-free
> concurrent commands, and stores conflicts in commits so work can
> continue. It has no shared authority, review or policy model, and an
> agent can use it as its git client in an Artroom lane.

The plan is under checker's review, so this note proposes the change and
does not make it.

## 7. Follow-up work

These carry out items 1 and 2. Each needs its own request.

1. Test that a jj `change-id` header survives Artifacts push, pinning
   and the landing merge. (Lane B.)
2. Add a `refuse` rule for `.jjconflict-*` paths to the default policy
   pack, with the fix in item 1. (Lane D.)
3. Show per-change history and interdiffs between generations on the
   Proposal screen, when commits carry `change-id` headers. (Lane F.)

## 8. Sources

jj, retrieved 2026-10-01:
- Changelog: <https://github.com/jj-vcs/jj/blob/main/CHANGELOG.md>
  (0.30.0 `change-id` header default; 0.34.0 `jj gerrit upload`; 0.43.0
  `jj run`; 0.45.0 `jj converge`; 0.45.1 latest release)
- Concurrency design: <https://github.com/jj-vcs/jj/blob/main/docs/technical/concurrency.md>
- Operation log: <https://github.com/jj-vcs/jj/blob/main/docs/operation-log.md>
- First-class conflicts, design: <https://github.com/jj-vcs/jj/blob/main/docs/technical/conflicts.md>
- Git compatibility: <https://github.com/jj-vcs/jj/blob/main/docs/git-compatibility.md>
- Glossary: <https://github.com/jj-vcs/jj/blob/main/docs/glossary.md>

Artroom:
- `notes/2026-10-01-artroom-plan.md`, revision 4: sections 2, 3, 7 and 8
- `docs/protocol.md`: R-LANE-9, R-LAND-4
