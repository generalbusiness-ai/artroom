# jj and Artroom: dated clarification

2026-10-04. Draft 1 for independent planning review. Planning clarification
request `63be1105161fb4d0c0c390fbba34c30929781932`, promise
`152a3b84ec731df68c058a61b333396f9e2ddcfc`. Written against Artroom main
`e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`.

This is the complete corrected comparison for original request `966aeaad` /
promise `bfb563fe`. It addresses all four groups in changes review
`6649bb50`, whose delivery was accepted in `fef19f77`. The original source
note is `notes/2026-10-01-research-jj.md` at
`b3050dc6959f3c10d5eb550b28492d40ab81f435`: 12,816 UTF-8 bytes,
247 lines, SHA256
`8563588cd23c7047eb3572bd61b78b432b87eef85141e467cb08d63b72aa516f`.
That note's source integration remains owed. This clarification delivers
planning evidence; it does not land a source change or approve a runtime.

**Source** means a fact read in the named documentation, source or saved
result. **Judgment** means a product or architectural conclusion.
**Untested** means a claim not established by that evidence. Saved results
are credited within their actual boundaries; none was rerun for this note.
The jj baseline is the pinned **v0.45.1** documentation, retrieved
2026-10-04. It is a reproducible comparison baseline, not a claim about the
latest release or every client version.

## 1. What each system is for

**Judgment.** jj is a useful client alongside Artroom. It manages a local
repository's code and history. Artroom records shared work, authority,
decisions and outcomes. Neither replaces the other.

At the pinned baseline, jj provides Git-backed local version control,
including rewriting and inspection. It can participate in shared workflows
through Git remotes; it is not limited to a solitary developer. A stable
change identity generally survives a rewrite while the commit identity
changes. See the [pinned jj glossary](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/glossary.md).

Artroom orders signed acts from members and delegated agents. The
application declares its vocabulary and bindings; admission checks current
authority, role, binding and relevant state. The code-review profile adds
lanes, immutable proposal generations, obligations, preparation, review
and landing. Lane/generation is an analogy for that profile, not the
universal identity of all Artroom work. Declared kinds and their recorded
bindings determine what a general application means.

An agent may use jj within a code lane if the environment and repository
are supported and its push, preparation and proposal obey the ordinary
Artroom rules. That conditional client compatibility does not establish a
hosted jj workspace, a durable agent or cross-device continuity.

## 2. The relevant jj features

**Source.** This table uses the pinned glossary, operation-log and conflict
design pages. Their meanings are local repository meanings.

| Feature | Meaning relevant to this comparison |
|---|---|
| Change and commit identity | A rewrite generally retains change identity and creates a different commit |
| Working-copy commit | Each workspace's working files are snapshotted by most commands |
| Evolution log, `jj evolog` | Inspect successive versions of a rewritten change |
| Operation log | Repository views and operation history, separate from commit history |
| Undo, operation revert and restore | Record a new operation that restores earlier state |
| Operation-view reconciliation | Merge divergent operation heads; this is not a promise of lock-free working-copy mutation |
| First-class conflicts | Represent unresolved content using stored trees; some expressions simplify as history changes |
| Workspaces | Multiple working copies share repository storage and operation history |

The glossary also describes other workspaces pointing to storage in the
initial workspace. A directory of checked-out files alone therefore does
not establish recoverability of the shared local repository.
[Glossary](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/glossary.md),
[operation log](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/operation-log.md),
[conflict design](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/technical/conflicts.md).

**Source.** The pinned changelog records these versioned additions:

| Addition | Dated baseline |
|---|---|
| `jj run` | 0.43.0, 2026-07-01: commands over changes with private working copies |
| `jj converge` | 0.45.0, 2026-09-02: heuristics to combine divergent versions; noninteractive failure remains possible |
| Default Git `change-id` header | 0.30.0, 2025-06-04: ordinary object transfer can carry it; rewriting tools may lose it |
| Gerrit upload | 0.34.0, 2025-10-01: experimental upload integration, rather than a complete review service |
| Comparison baseline | 0.45.1, 2026-09-03 |

These release dates describe the source baseline, not a capability newly
measured in Artroom. [Pinned changelog](https://github.com/jj-vcs/jj/blob/v0.45.1/CHANGELOG.md).

**Source.** The compatibility page lists no Git hooks, partial clones,
Git LFS or full submodule working-copy support; it supports commit signing.
Repository requirements still matter when choosing the client.
[Git compatibility](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/git-compatibility.md).

## 3. Where the models overlap

**Judgment.** These analogies help explain the systems. They do not equate
their identities, authority or proof.

| Idea | jj side | Artroom side and boundary |
|---|---|---|
| Identity through code rewrites | Change ID versus commit ID | Code-profile lane and proposal generation versus immutable head; declared application bindings remain authoritative |
| Reviewing revisions | Evolution history and comparison | Retained proposal generations, verdicts and checks; per-change grouping helps inspection |
| Recording state transitions | Operations and repository views | Ordered acts, retained rule inputs and outcomes, plus system events |
| Correction without pretending nothing happened | A later undo operation | New release, handover, correction or revert work under the application rules |
| Parallel preparation | Separate local workspaces and operation views | Separate lane forks and optimistic preparation; admission and publication still have fences |
| Running tools on changes | Local command execution | Independent checker jobs on the named integration and filtered snapshot where required |
| Signing | Commit signing | Actor-signed acts and verifiable publication; a signed commit is a different object |

The code-profile analogy has two practical limits. A lane can contain
several changes, and an author can supply duplicate or divergent headers.
One header is not one lane, one generation, one authorized member or one
obligation. Also, Artroom retains a Room outcome separately from an agent's
description of what happened. Local command success does not establish an
admitted proposal, satisfied review or landed publication.

## 4. Where the systems differ

### Concurrency has several boundaries

**Source.** jj's concurrency design reconciles divergent **operation-log
views** by merging operation heads. It expressly qualifies the Git backend
as not entirely lock-free and allows ordinary I/O failures. Separately,
the working-copy interface acquires a lock for mutation and releases it
when the mutation finishes. An operation-view design cannot establish that
commands never wait, writes always succeed, or concurrent writers can
safely mutate one working copy without coordination.
[Concurrency design](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/technical/concurrency.md),
[working-copy interface](https://github.com/jj-vcs/jj/blob/v0.45.1/lib/src/working_copy.rs).

**Judgment.** Local view reconciliation is useful for history editing by
processes with access to the same repository. It is not a shared
authorization protocol. Artroom must decide whether an act is admitted in
its sequenced state. A stale or unauthorized act cannot become authorized
merely by merging it with another writer's view.

Parallel editing remains valuable. Different lane holders can edit their
forks while other work proceeds. Their eventual proposals, prepared
commits, retained evidence and landing reservations have distinct checks
and fences. The authority boundary does not forbid optimistic code work.

### The logs prove different things

**Source.** jj's local operation log describes repository views and
operations, including writer-supplied user and host metadata. Undo is a new
operation. Ordinary Git push transfers Git history and refs, not that
local operation history. These properties do not guarantee permanent local
retention through every cleanup, storage loss or workspace move.
[Operation log](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/operation-log.md).

**Source: Artroom snapshot.** Artroom publishes its signed act log under
`refs/artroom/log`. An independent verifier can assess the supported
published prefix and disclose proof limits. A member handle, username,
hostname, jj header or commit signature cannot replace the actor signature,
current role or exact declared binding used for act admission.

**Judgment.** Friendly undo vocabulary could describe later corrective
work. It must not imply erasure of the Room's recorded history, guaranteed
restoration of external effects, or an already adopted new API.

### Conflict data and a failed integration are distinct

**Source.** jj can encode a conflict in ordinary Git objects using root
`.jjconflict-base-*` and `.jjconflict-side-*` trees. The `jj:trees` commit
header supplies the jj meaning; ordinary Git tools do not interpret it as
jj does. Thus valid Git storage alone does not imply resolved content.
`--allow-conflicts` is an explicit escape from the normal push refusal.
[Git compatibility](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/git-compatibility.md).

**Source.** The conflict design describes ordered tree expressions and
term cancellation. A changed base or backout can simplify some conflicts;
that is not a guarantee that arbitrary conflicts resolve themselves.
[Conflict design](https://github.com/jj-vcs/jj/blob/v0.45.1/docs/technical/conflicts.md).

**Source: Artroom snapshot.** R-LAND-4 governs an unresolved Git merge
while preparing a proposed head against main. Such a conflict fails that
landing with the paths; the holder owns its recut. A jj-encoded conflict
already inside an otherwise mergeable head is a separate case. Neither
Git tree validity nor R-LAND-4 automatically excludes that data.

Main's default policy pack already has a friendly `jjConflicts` rule. It
checks added or modified paths, including rename destinations, against the
root conflict-directory prefixes on `propose`, before the outside-claim
rule. It excludes deletions. This is a **changes-only policy decision**,
not a scan proving the entire head free of jj conflict data. Untouched
legacy content, removals and recovery paths need their actual rules.
The protocol's open point 38 records why a whole-head root fact was not
added. These are read source boundaries, not newly run controls.

**Judgment.** An application requiring resolved proposed content should
make that requirement explicit in its policy and evidence. This note does
not broaden the existing changes-only rule or commission a new whole-head
scan. The old note's suggestion that a head would probably fail its claim
or checks is not evidence of either refusal.

### Authority and product responsibilities

**Judgment.** jj's local features do not supply Artroom's member enrollment,
delegations, declared act admission, review obligations, attention delivery
or governed landing. Gerrit upload shows that a jj client can integrate
with an external review system; it does not make jj itself the Room's
shared authority service. Conversely, Artroom does not supply a local
history editor. A suitable local or hosted client performs that work.

## 5. The four recorded choices, with current evidence

Retain Hugh's 2026-10-01 choices: **items 1 and 2 are worth doing; item 3
is not pursued; item 4 is undecided.** Updating evidence does not create a
new commissioning decision or first-Jam gate.

### 1. Support jj as an agent's client safely

**Source: existing implementation.** Main has
`packages/git/test/jj-change-id.test.ts`, covering raw header preservation
through fork, pinning and fast-forward or integration-merge publication.
It uses real local Git objects and bare-repository stand-ins. Its actual-jj
case is conditional on the client being installed; source existence does
not prove that case ran in every gate.

Main also contains a dated Artifacts measurement:
`packages/git/measure/results/jj-change-id-2026-10-01T21-57-04-695Z.json`,
8,383 UTF-8 bytes, SHA256
`228e6850ca56ab674f4ab70c1043bb0d8c815c3b72a42b9f3c746b940856d5bc`.
The saved result records two jj-produced lanes: one fast-forward and one
merge. Both preserve the original header at fork, pin and in main history.
The merge result records the proposed head as a parent and records that
the **new merge commit does not itself carry `change-id`**. Preservation of
the original reachable object is not header copying onto a new object.

**Evidence boundary.** The measurement driver is
`packages/git/measure/jj-change-id.mjs`. Its measurement-only Worker is
`packages/git/measure/harness/worker.ts`: it connects real Artifacts and
publisher components to a stand-in Room. It has no production policy
admission, accepts its test driver's held lanes and treats built landings
as ready. Its synthetic local log is explicitly not the measurement's
subject. This proves a recorded bounded artifact-path result, not the
production browser's review, membership, independent-log or recovery flow.
The JSON does not pin the jj executable version; its date does not prove
the run used this note's v0.45.1 source baseline.

**Source: existing policy.** The changes-only conflict refusal described
above is implemented in the default pack. Do not commission it again or
describe it as wholly missing. Do not advertise all repositories, forges,
rewriting clients or conflict states as covered by the saved result.

**Untested here.** Current deployed client compatibility, full live Room
review-to-publication, ignored-file recovery, operation-store recovery and
device continuity are not established by this measurement. C2 and the
joint browser acceptance own the relevant cloud/runtime witnesses.

### 2. Show history and interdiffs between proposal generations

**Source: existing implementation.** Main's UI README describes the
per-change history work under original request `d0cbb26d`: rewritten,
added and dropped changes, parent-relative interdiffs, mapped and unmapped
comment positions, explicit unknown states and unmatched divergent IDs.
Headerless commits are counted. The display is already implemented with
mock data; it is not an entirely unimplemented product idea.

The same README explicitly says live Room data does not yet provide
`changeHistory` and its needed commit/blob reads. Live screens therefore
have no such history data. Current bounds include 2,000 commits, tree
depth 64, 100,000 entries, 2,000 file lines, 10,000 UTF-8 bytes per line and
20 million aggregate comparison work. Blob reads currently occur before
the comparison bounds; a live authorized read boundary must bound the
blob itself. Source bounds and mocks do not prove a deployed live reader.

**Judgment.** N1's authorized immutable proposal/diff/file/commit reads and
C5's live browser workflow should reconcile this implemented display with
their current snapshots and bounds. The existing per-change request keeps
its own remaining delivery and review obligations. Avoid a duplicate lane.

Headers help a reviewer group versions and decide what to reread. They
prove neither signer identity nor equivalent changes, qualified verdicts,
current authority or valid carry. Artroom's recorded bindings, integrations
and evidence rules decide those outcomes. Unmatched or ambiguous headers
should remain explicit rather than receiving invented continuity.

### 3. Keep conflicted preparation alive for later reconsideration

**Recorded decision: not pursued.** The original suggestion would keep a
conflicted preparation inspectable and reevaluate after main moves. That
changes R-LAND-4 and holder recut semantics. The possible benefit from
backouts or other simplifying base changes remains a judgment, not a
measured result or an implicit feature request.

The old plan's cascade example described six of ten approvals reaching
heads that later conflicted. That historical observation is not a current
rate and does not prove this alternative would have reduced it. Preserve
the illustration as dated context if used in the original note; preserve
its **Untested** qualification. This clarification supplies no live
conflicted-preparation implementation, acceptance gate or Jam dependency.

### 4. Use friendly language for correction and undo

**Recorded decision: undecided.** New correction, release, handover and
revert work can be explained as later recorded deeds, each naming the
work it changes. Whether the product calls this undo remains a choice.
Do not imply that local jj retention is permanent, that a Room act is
deleted or that a command's external effects have automatically reversed.

### What to avoid borrowing

**Judgment.** Keep operation-view reconciliation on the local code side;
do not use it to merge contradictory claims of Room authority after
admission. Keep author-supplied history metadata useful for display;
do not turn usernames, hostnames or headers into membership, approval or
delegation. Existing signature and admission rules remain authoritative.

## 6. Proposed replacement for the plan's section 3 comparison

The original Revision 4 says that jj offers first-class conflicts and an
operation log. Replace its comparison sentence with this qualified text
when the source note and plan are integrated:

> jj is a local version control client with a Git backend and history
> editing tools. Its operation-log views reconcile divergent local
> operations, while working-copy mutations and backend I/O have separate
> constraints. Artroom instead records shared, authorized acts and their
> outcomes. A supported jj client can work in a code lane, with immutable
> commits and author-supplied change headers carried through the ordinary
> proposal path; those headers do not confer Room authority or review.

This is a comparison judgment grounded in the sources above. It avoids the
original blanket lock-free, never-wait, always-commit and conflict-exclusion
claims. It neither changes the general declared-act contract nor promises
universal client compatibility. Source integration is still owed under
original `966aeaad`; planning approval of this clarification does not edit
the older plan or satisfy that landing obligation.

## 7. Existing owners, dependencies and unresolved choices

| Work or question | Current evidence | Existing owner or next decision |
|---|---|---|
| Header preservation | Local test source plus bounded dated Artifacts result | Credit lane B evidence; reconcile only changed path/source or remaining original acceptance |
| Friendly conflict refusal | Default pack's changes-only rule and documented whole-head limit | Credit lane D; any wider policy needs an explicit separate decision |
| Per-change UI | Implemented mock surface; live read gap explicit | Original `d0cbb26d`, N1 `53016b8e`, C5 `cfbde32f` |
| Live authorized immutable reads | Existing N1 design package; bounded source reads still need production authority | N1, C1 `b538c5ea`, current contract/admission owners |
| Hosted recovery | Accepted 005 checkpoint/lifecycle direction, rather than this header measurement | C2 `6cdaf20f`, C3 `13dfc613`, C6 `d89fc17f` |
| Correction vocabulary | Item 4 undecided | A later explicit product choice |
| Original comparison integration | Accepted changes, this corrected complete draft awaits review | Original `966aeaad` / `bfb563fe` |

**Judgment: recovery dependency.** If a hosted environment advertises jj
continuity, its checkpoint must cover the actual `.jj` operation/store/view
state and workspace references, in addition to files and the Git object
closure. Apply 005's quiescent checkpoint, acknowledged manifest and epoch
fences to every writer. Preserve prepared commits and frozen signed-act
meaning separately. A shell exit, pushed ref or local working-copy commit
does not prove a durable checkpoint or decide whether an uncertain external
command can be safely repeated.

This is a dependency for claiming that supported client experience, not a
new requirement that the first C2 or Jam task use jj. The cloud and browser
stories retain their agreed lifecycle, device authority, uncertain-outcome
reconciliation and ordinary proposal/review/publication boundaries.

The declared-acts vocabulary may evolve during Jam self-hosting. A display
analogy cannot freeze it. Builder decides when the first Jam task is
enabled; full platform completion, these note corrections and the full
manual are not new start gates. The manual proceeds beside Jam once it
starts. Functional acts and test-cost integration remain higher priority.

## 8. Acceptance and bounded verification

The planning correction is complete only when independent review confirms
all four accepted groups throughout this note and its proposed replacement
text. The reviewer should check these scenarios without rerunning runtime
suites merely for prose:

| Scenario | Required conclusion |
|---|---|
| Two local jj commands race | Operation-view merging is qualified; working-copy locks and I/O errors are not erased by the analogy |
| Git accepts a jj conflict object | Git validity alone does not establish resolved content or an R-LAND-4 integration conflict; the current policy's changes-only limit is explicit |
| Artroom fast-forwards or creates a merge | Original raw commit preservation and reachable headers are distinct from headers on the new merge commit |
| A reviewer opens per-change history | Existing UI/mock work is credited; live authorized source reads and bounds are not claimed delivered |
| A supplied header is duplicated, absent or rewritten away | Grouping can be incomplete or ambiguous; identity, admission, verdict and carry still use their ordinary rules |
| A cloud host is interrupted | Header measurement does not prove local operation-state, command or workspace recovery; C2/C3/C6 keep those obligations |
| An application declares a different vocabulary | The comparison's lane analogy supplies no new binding, authority or completion rule |
| Follow-up work is planned | All four recorded choices and existing owners remain; no duplicate implementation request or first-Jam gate is introduced |

Future executors reuse the existing useful witnesses where their source and
meaning remain unchanged. Add focused controls only for actual changed
boundaries, through the owners above. Do not run a field-by-field mutation
sweep, fresh baseline, install or broad runtime gate for this dated note.

Planner changes are confined to this file and `plans/README.md`. Verify
whitespace with `git diff --check`; freeze the full UTF-8 bytes under the
own live promise; compare the attached bytes against this file; publish
one evidence-only primary and a no-Git independent review request. If a
source/evidence identity differs, compare the actual delta before reusing
the conclusion. Approval and eventual source landing remain separate.

## 9. Source identities and correction map

All external links above are pinned to jj **v0.45.1**, read 2026-10-04.
They describe that baseline only. The original note was dated 2026-10-01;
its mutable-main links are replaced here by exact versioned sources.

Artroom sources read at main
`e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`:

- `packages/policy/src/pack.ts`: default `jjConflicts` changes-only rule.
- `packages/git/test/jj-change-id.test.ts`: raw-object and landing-header witnesses.
- `packages/git/measure/jj-change-id.mjs`, its `measure/harness/worker.ts`
  and the exact dated JSON named in section 5: driver, stand-in boundary
  and saved result, respectively.
- `packages/ui/README.md`: per-change display, mocks, limits and live-read gap.
- `docs/protocol.md`: R-LANE-9, R-LAND-4 and section 29.5's open points 38/39.

Historical comparison sources at
`b3050dc6959f3c10d5eb550b28492d40ab81f435` are the complete original jj
note and `notes/2026-10-01-artroom-plan.md`, Revision 4. Current declared
acts, C1–C6 and N1–N7 directions are their recorded workroom decisions and
requests, indexed in `plans/README.md`. Unlanded acts candidates are not
credited as main behavior by this comparison.

| Accepted review group | Reconciled throughout |
|---|---|
| 1: concurrency scope | Sections 1–4, feature/analogy tables, replacement text and acceptance; no never-wait/always-commit promise |
| 2: conflict-data distinction | Sections 4/5/8; R-LAND-4, ordinary Git objects, explicit policy and existing changes-only limit |
| 3: sources and interoperability evidence | Metadata, pinned citations, dated features, exact Artroom snapshots, bounded saved result and original/new merge distinction |
| 4: declared applications and ownership | Sections 1/3/4/5/7/8; display versus authority, local undo versus Room history, existing N1/C2 owners and commissioning boundary |

No runtime test, installation, client command or external side effect was
performed for this clarification. Its current status is proposed planning
evidence awaiting independent review.
