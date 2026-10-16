# A unified room interface: platform basis and design sequence

15 October 2026. Design baseline for independent review.

Request `a1889c73`, planner promise `39439c9d`.
Source inventory: main `40e37d8537aad5eecf8066fd426ae49842766526`.
This note replaces the earlier unlanded discussion draft of the same name.
It incorporates the forge research (`dbf2ccc4`) and navigation and
visualization research (`8ba14e34`).

The proposed result is a complete browser experience for coordinated
development, with the depth of a good forge and local Git client. The
design covers the platform prerequisites and the sequence for choosing
and validating views. Landing this note commissions no UI or runtime
implementation and changes no existing builder priorities.

## 1. A room should be understandable before its diagrams

For the current forge application, a room brings one repository's work
together: what people want to achieve, the content they propose, and the
decisions and outcomes that move the work forward. The room has members
and rules. Applications can add tools under those rules.

A person needs three familiar questions:

- **Work:** What are we trying to achieve, who undertook it, and what
  remains to be done?
- **Source:** Which files and exact versions are involved, and what changed?
- **Decisions and outcomes:** What needs attention, what is required, and
  what actually happened?

These are explanatory concepts, not a decision to add three navigation
tabs. Issues and Changes remain recognizable destinations. Repository
browsing and an attention view are candidates to test within the same
room shell. Rules and membership explain how work is governed. They do
not need to dominate ordinary work.

Hugh's main reference is Visual Studio Code: useful and deep, but complex
and sometimes difficult. Dap should preserve depth through the selected
work, rather than ask a person to understand the platform's internal
objects before finding a useful action.

Scope IDs, incarnations, definition pins, retained inputs, and read
frontiers remain available for inspection. Ordinary navigation explains
the relevant work and consequences in plain language. A global workbench
may gather several separately authorized rooms; it gains no authority
over them. Multiple repositories inside one current room are not assumed.

## 2. One connected investigation

Consider **Improve account recovery**. Its issue states an outcome and
conditions. A plan may split the work into concerns. People or agents
undertake parts and report contributions. A change proposes exact content.
Reviews and checks concern that version. Publication has its own outcome.
Future delivery tools could connect a published version to an environment.

A reviewer can follow the change back to the conditions, inspect its diff,
browse neighbouring code, and return to the same review. A maintainer can
start from a code area and find related work. An operator could start from
a running version and follow its evidence and purpose backward.

These are relationships, not one mandatory sequence. Several changes may
address an issue. One change may address several issues. Maintenance can
begin without an issue. A release can combine work from many changes.

Each fact has one canonical home. Other views summarize it and link to
its record. One interaction pattern applies throughout:

**Exact subject → current state → relevant requirements → available
action → recorded result.**

A diagram selects and explains work. It does not create a second workflow
or change an object's state merely because someone moves a visual mark.

## 3. What the current platform actually supplies

This inventory describes source at the baseline above. It does not claim
deployed availability or completed user acceptance.

| Area | Available foundation | Gap affecting the interface |
|---|---|---|
| Room | One fixed repository and branch, with membership, rules, and destination references in the [directory](../packages/platform/src/directory.ts) | Cross-room discovery and context are separate product work |
| Work | Native [issue](../packages/lanes/src/issue.ts) conditions, commitments, plans, concerns, reports, and requester judgments | Most deeper coordination remains outside the ordinary Page journey |
| Changes | [Manifests](../packages/lanes/src/change.ts) identify immutable proposal versions, reviews, jobs, and publication relationships | A retained one-file proposal and a Git-tree proposal have different source representations |
| Native reads | [Scope API](../packages/contract/src/transport.ts) exposes summary, final-item pages, history, entries, duties, logs, and retained inputs | No generic public relationship enumeration, room search, or arbitrary aggregate query |
| Counts and storage | Summary has exact type/state counts; [SQLite](../packages/scope/src/sqlite.ts) has state and immutable-key indexes, plus internal bounded metadata helpers | Filtered cross-scope totals, relationship indexes, and public query integration remain owed |
| Read authority | Existing sessions and signed reads enforce eligibility | [Recent-signer eligibility](../packages/scope/src/signed-reads.ts) can still scan history; an internal metadata seek alone does not make an authenticated query bounded |
| Page | [Room shell](../packages/page/src/main.ts), issue/change lists, contextual forms, focus restoration, and exact review safeguards | Lists materialize lanes before filtering; no shared graph/tree/diff navigation context |
| Client recovery | Specialized join/Start custody, context-bound drafts, and settlement interfaces exist | Ordinary Page actions and retained edits do not yet have complete durable reload recovery |
| Git | [Reader](../packages/git/src/reader.ts) verifies bounded objects, trees, refs, and ordered parents; isolated and [edit-base](../packages/git/src/edit-base.ts) retrieval helpers exist | No general authenticated history, tree, diff, search, or blame projection; partial helpers have not switched production callers |
| Published content | [Site routes](../packages/scope/src/site/route.ts) serve receipt-authorized immutable publications, directories, Markdown, and downloads | Publication access is not permission to browse arbitrary repository objects or unpublished work |
| Checks and effects | Jobs name exact subjects and configurations; Git publication has owned attempts, receipts, and unknown-outcome handling | The [checker runner](../packages/checkers/src/service.ts) has no production adapter; general automation and deployment management remain separate contracts |
| Applications | Declared application scopes, generic act discovery, and configured inventory exist | Complete installable packages, shared projections, and isolated presentations are the [approved destination](2026-10-15-self-contained-applications.md), not implemented capabilities |

The current [Page data layer](../packages/page/src/data.ts) rejects
incomplete or mixed-head enumeration, but can discard useful partial
results. It also conflates failed text reads with absent text. Richer
views must resolve these distinctions rather than inherit ambiguous data.

The [current routes](../packages/page/src/shell.ts) do not encode a full
room/version/path/comparison context. Existing per-tab preferences and
review safeguards are useful foundations, not the shared navigation
contract specified below.

## 4. Eight required platform contracts

These are capability requirements, not new implementations or claims
that one universal graph API already exists. Each needs an exact schema,
authority boundary, bounded behavior, and distinguishing witnesses before
a product increment depends on it.

### 4.1 Identity and navigation context

Every displayed subject resolves to a room, full scope reference where
applicable, item/opening fact, definition or application semantic identity,
revision, and observed head. Content adds the selected proposal version,
repository, resolved commit, path, or comparison endpoints.

A route records the nonsecret context needed to reopen the investigation.
Back and Forward restore selection, filters, expanded groups, and return
position. Reload preserves the documented subset. Actor and membership
context bind drafts and pending actions internally; credentials never
become route parameters.

Changing a view, selecting a historical commit, or opening a related item
must not silently switch a checkout, workspace, review subject, or draft.
A moving ref is resolved explicitly. Its later advancement is shown,
rather than substituted into retained review evidence.

### 4.2 Records and typed relationships with provenance

Use the existing native [item identity and state](../packages/contract/src/read.ts)
as the foundation. Add bounded projections for references and explicit
relationships, including final records. A relationship identifies both
subjects, its type and state, exact source fact, interpretation version,
and delivery or observation coverage where relevant.

The initial semantic inventory must distinguish:

- Accepted commitment under exact terms from assignment or an offer.
- Concern in a sealed plan from an arbitrary related issue.
- Reported contribution from requester acceptance of that report.
- A manifest's selected accepted reports from a simple closing link.
- Review or check evidence for one version from evidence about another.
- Requested publication from confirmed publication and its closing update.
- Changed-file membership from code dependency or inferred product impact.

There is no automatic business completion percentage or critical path.
Such measures require an adopted criterion and supporting facts.
Derived relationships state their derivation and remain distinguishable
from recorded ones. A copied relationship is not proof that every related
scope has advanced to the same state.

### 4.3 Bounded authorized lookup, search, and aggregation

Specify direct object lookup, supported filters and ordering, typed
neighbourhood expansion, timelines, scoped search, and named aggregates.
Requests have row, byte, traversal, work, and duration bounds. Results
identify source heads, continuation, index coverage, and completion.

Authority applies before returning rows, existence, or counts. Query
eligibility and any legacy index backfill must themselves be bounded.
An unauthorized reader must not learn migration state or restricted
subjects from an aggregate. No endpoint may scan every lane behind a
small visible result and claim bounded work.

Every aggregate declares its unit, population, grouping, deduplication,
time or head selection, and contributing-record query. Native exact
type/state counts can be reused where their meaning suffices. A matrix
cell or ribbon must open the exact records that contributed to it.

The existing priority-1 bottleneck task `e0292346` owns bounded-read
foundations. This broader product contract does not silently extend its
promise to all cross-room search and graph queries.

### 4.4 Coherent captured views, refresh, and coverage

A room is several histories. A combined view names the heads it observed
and its required cross-scope coverage. It does not claim one atomic room
snapshot merely because several responses arrived together.

Opaque query continuation binds the selection, sort, authorization
context, and head/frontier policy. Drift either restarts explicitly or
continues under a specified retained snapshot. Refresh invalidates or
updates affected projections while preserving the user's investigation.
Live subscription support is a separate declared capability; polling
does not acquire stronger consistency by being frequent.

The user must be able to distinguish complete absence from not loaded,
stale, denied, unsupported, redacted, and unavailable. Disclosure-safe
partial results may remain useful. They cannot justify an orphan-work
claim, an empty search conclusion, or a completion percentage without
the necessary coverage.

Record availability and archive cutoffs belong in this contract. Git
publication does not imply a complete room archive. Portable records and
credential-safe history remain separate durability work; this note
authorizes no export or change to its privacy rules.

### 4.5 Versioned source exploration and comparison

Specify authenticated member repository exploration independently of
anonymous published Pages. The supported journey is commit selection,
parents or changed files, full tree, file content, and comparison, with
one preserved context. A one-file retained proposal remains a valid
content subject even before it has a published integration commit/tree.

Required reads include commit metadata and ordered parent identities,
bounded directory children with exact path bytes/modes/object IDs, file
availability, changed-file summaries, and explicitly defined diffs.
History pages retain traversal frontiers and distinguish an unloaded
parent from a root. Search and blame each need their own scope,
completeness, cost, and interpretation contracts.

Comparison specifies exact endpoints and whether it compares snapshots
or changes since a selected merge base. Rename inference, binary content,
submodules, LFS, huge lines, omitted hunks, and unsupported formats have
explicit states. Metadata, summaries, and expensive content are separate
reads. Object verification, selected-path coverage, complete closure,
host retention, and publication eligibility remain different assertions.

### 4.6 Decisions, offered actions, and durable request custody

The shared client binds an action to the actual subject, selected version,
definition, and authority context. It explains relevant requirements and
rechecks current eligibility. An offered action can still be refused by
its eventual judgment; a job label grants no authority.

Keep the exact signed request and confirmed answer through reload under
the reviewed custody model. Lost replies remain unknown until settled.
Navigation must not create a new request, discard an unresolved mutation,
or treat retry as a fresh action without a deliberate choice.

Request accepted, evidence recorded, publication confirmed, and a future
deployment completed are separate facts. A derived readiness display
does not replace native judgment. A requirements cell opens evidence or
the appropriate contextual form; it is not a directly editable truth.

This contract overlaps the planned shared developer interface and current
client work. Its implementation needs explicit scope and a separate
commission, rather than another client built inside each visualization.

### 4.7 Application projections and a trusted host shell

Follow the adopted [self-contained application direction](2026-10-15-self-contained-applications.md).
Semantic, presentation, and release identities stay distinct. Browser,
MCP, and agents consume the same supported projections. A presentation
must not reinterpret an old event using a new semantic version.

The host owns identity, signing, custody, navigation, and the presentation
boundary. Untrusted application code does not receive the member's keys
or unrestricted room authority. Until the approved isolation prerequisite
exists, trusted operator presentations and generic host-rendered records
remain the available boundary.

An application can provide descriptions and reviewed semantic adapters
for its records and relationships. Unknown types retain a readable generic
home and honest capability limits. They do not acquire invented meanings
such as goal fulfillment, dependency, or deployment health. The generic
browser cannot execute package code merely to draw a graph.

### 4.8 Execution evidence and external outcomes

Native jobs bind a manifest, tree, configuration, check name, and deadline.
Result admission checks the signer against the lane-held rules and records
the actual checker. Requested inputs, applicable authority, and the
recorded performer therefore remain separate facts, including across
rules updates. General execution still needs a runner and result-custody
contract. Admission rules, event-triggered work, and provider operations
retain their different authority and recovery semantics.

Future deployment records need exact artifact/configuration, environment,
promotion authority, provider attempt, observed outcome, and health
observation identity/freshness. A passed historic check is not current
production health. A rollback is another authorized operation, not an
erasure of history or automatic reversal of storage changes.

These capabilities can join the same record and navigation model when
implemented. Their absence must not block useful issue/change/source
journeys, or be concealed by static success badges. The older
[repository-to-live-site plan](../plans/020-2026-10-05-repository-to-live-site.md)
is intent, not delivered deployment management.

## 5. Derive view priorities from questions and reliable facts

The following sequence is a design dependency order. It is not a new
P0/P1 queue or an implementation promise. Existing NOW and SOON tasks,
including priority-1 durability and bottlenecks, retain their priority.

| Design increment | User result | Necessary basis | Candidate presentation |
|---|---|---|---|
| Orientation and continuation | Find work, understand its state, open related records, and return | Identity, bounded discovery, record semantics, coverage, shared context | Existing lists, search/facets, canonical detail, attention projection |
| A complete everyday journey | Follow purpose → change → content → requirements → decision → confirmed outcome | Exact source/evidence, relationship provenance, durable actions | Connected tree/history/diff, requirements table, focused relationship trace |
| Large-scale explanation | Find uncovered goals, overlapping changes, and concentrated work | Exact relationship/aggregate contracts and useful grouping | Sankey/parallel sets, incidence/coverage matrices, code atlas |
| Execution and operational explanation | Follow validation or a running version to its inputs, decisions, and effects | Actual execution/deployment contracts | Event sequences, swimlanes, environment comparisons |

Prototype exploration can proceed with clearly labelled synthetic fixtures
while platform contracts are designed. A product capability cannot be
declared delivered from such a prototype.

### First visualization comparisons

Sankey is an early research candidate for the large-scale explanation
increment, connecting goals, issues, commitments, changes, and code areas.
Direct lists remain the comparison baseline. Its first comparison uses
separate pairwise incidence layers, with named relationship counts and
distinct entity counts alongside them. A connected layout must disclose
unequal incoming/outgoing totals, duplicate entities, and attribution
limits. Only recorded tuples justify an attributed end-to-end path.
Ten issues producing twenty commitments and
touching thirty files are not one conserved quantity. Pairwise links
through a change establish an association, not automatic file attribution
to every linked goal.

Compare that overview with a goal/evidence coverage matrix and direct
lists on the task **Find work missing implementation or evidence**.
Include unlinked and unclaimed work. It must not disappear because it
has no ribbon. Time-expanded alluvial views answer cohort movement and
reopening questions separately from static traceability.

For **Investigate concurrent changes in a subsystem**, compare a stable
code hierarchy/atlas and change-by-file matrix. File overlap is not proof
of a text conflict; extent overlap is another relation again. An UpSet
view becomes useful when exact multiway intersections are the question.

For **Explain why this version is blocked or running**, compare a focused
provenance trace, requirements table, and event timeline. Typed edges
explain actual dependencies or evidence. Git railway edges retain their
ancestry meaning. Temporal order alone does not establish causality.

More elaborate bundling, compound graphs, and spatial maps are later
research options. Elevate one when the simpler comparison demonstrably
fails a representative question, not because it can display more marks.

## 6. Consistency, simplicity, and accessibility are acceptance conditions

Selection carries the same authorized record set between views. A selected
ribbon, matrix cell, directory, or event opens its literal contributors.
The active room, version, relation types, filters, metric, and coverage
remain inspectable. Grouping and layout changes are explicit; live updates
must not continually rearrange a person's investigation.

Known targets can start from search. Discovery can start from an overview.
Focused expansion and a simple relationship-column browser can support
the same journey without requiring graph interpretation. Opening an edge
explains the relationship; opening a node opens its canonical home.

Use the existing [brand guidance](../brand/GUIDELINES.md),
[tokens](../brand/tokens.css), and actual Page components. The earlier
[027 review](../plans/027-artroom-usability/v2/design-review.md) remains
useful for one-home-per-fact, exact-subject, and decision-point principles.
Its violet visual specification has been overtaken by the current brand.
This note does not select a new frontend framework or replace the shell.

Mobile uses deliberate full-width destinations and reliable Back, rather
than compressed desktop panes. Keyboard and screen-reader users need
equivalent structured relationships and direct record links. Selection
cannot depend on hover, colour, precise edge tapping, or dragging.
Retain visible focus, useful touch targets, zoom/reflow, and reduced motion.

Simple vocabulary does not mean one universal status. A promise can be
fulfilled, a check can pass, and publication can remain unknown. Show
those meanings at the relevant home, with a compact summary elsewhere.

## 7. Specific next steps and review gates

These are design deliverables to commission separately. Owners name roles;
this table does not create new builder promises. The requester assigns
named owners and a bounded initial scope when each follow-up is
commissioned. An unresolved owner means proposed work, not a commitment.

| Step | Owner | Concrete output | Ready for the next step when |
|---|---|---|---|
| Establish this baseline | Planner; independent checker | Reviewed room model, source inventory, eight contracts, and sequence in this note | Contradictions and unsupported current-capability claims are resolved |
| Specify the shared read model | Planner with platform/API owner; checker | Exact initial record/edge schemas, relation semantics, authority, bounds, continuation, coverage, and aggregate definitions | A forge fixture is queried without a hidden whole-room scan; an unfamiliar application retains a readable home, safe navigation, and provenance without invented forge semantics or package execution |
| Specify navigation and custody | Planner with client owner; checker | Route/selection schema, restoration and refresh rules, exact-subject action binding, durable request/answer behavior | Related-object investigation, reload, and a lost reply preserve subject and outcome meaning |
| Specify source exploration | Git/platform owner with planner; checker | Public member-read boundary, commit/tree/file/compare contracts and cost/completeness model | Same exact content can be reached from a change, history, or path, with unsupported cases explicit |
| Compare complete task flows | Planner/design owner; representative users | First the ordinary journey below, then the three specialized questions in section 5, on desktop and mobile with shared fixtures | A study names users, coverage, measures, and thresholds before implementation selection; observed results justify the initial feature boundary |
| Commission a vertical implementation | Planner/requester; builder; checker | Separate reviewed requests with exact dependencies and distinguishing witnesses | The first useful end-to-end increment has an agreed platform and UI contract |

The first prototype follows an ordinary room journey: resume an issue,
inspect its undertaking and related change, find the blocker, read the
exact content, return, and take an eligible action. Specialized diagrams
must improve an identified part of that journey or a named scale question.

Read-model and source-contract work can progress independently where their
dependencies allow. Design prototypes need not wait for every future
automation feature. Later implementation requests must distinguish reuse
of existing P1 work from genuinely additional scope.

The prototype fixture set includes multiple changes per issue, a change
linked to several issues, a replaced manifest, differing requirements,
closed/final records, a failed check superseded by a later run, an unknown
publication, an unsupported application, and incomplete reads. Source
fixtures include merges, filtered/missing history, large/binary content,
and branch movement during investigation.

Measure these results against the current interface:

- Can an unfamiliar technical user explain the room's work, source, and
  decisions without being taught scopes or storage internals?
- Can someone resume work, find its blocker and responsible party, and
  reach the relevant action? Record time, backtracking, and wrong turns.
- Can they identify the exact reviewed content and qualifying evidence,
  including when a newer version invalidates an earlier display?
- Does Back restore version, path, filters, selection, and return position
  after inspecting related code or work?
- Can they distinguish a recorded request from publication and deployment
  outcomes, including an unknown operation?
- Can they answer overlap and coverage questions without treating missing
  data as absence or association as causal implementation?

Wrong-subject actions, hidden incomplete coverage, and false-success
interpretations are critical failures regardless of comparative speed.
Back must restore the listed investigation context; reload must preserve
the subset explicitly agreed in the navigation contract. Test keyboard,
screen reader, touch,
enlarged text, zoom, and reduced motion. Decide task-success thresholds
before the comparative study; this note claims no completed usability test.

## 8. Research basis and scope of adoption

Research covered official GitHub/GitLab and local-client documentation,
native dap source, mobile navigation patterns, visualization research,
and accessibility guidance. It did not include hands-on comparative
product testing or a current live visual baseline.

Useful primary references support the proposed comparisons:

- [Tower historic trees](https://www.git-tower.com/help/guides/commit-history/historic-file-trees/mac)
  separates changed files from the complete tree at a commit.
- [GitLab comparison methods](https://docs.gitlab.com/user/project/repository/compare_revisions/)
  distinguishes snapshot and merge-base comparison intent.
- [D3 Sankey](https://github.com/d3/d3-sankey) defines numeric ribbon values
  and an acyclic layout; [Parallel Sets](https://eagereyes.org/publications/Kosara-TVCG-2006)
  addresses categorical distribution.
- [Node-link/matrix research](https://mohammad.ghoniem.info/research/ivs-usability-2005.pdf)
  supports task-dependent comparisons, not a universal graph-size cutoff.
- [Search, Show Context, Expand on Demand](https://dig.cmu.edu/publications/2009-doigraphs.html)
  provides a large-graph navigation approach.
- [UpSet](https://vdl.sci.utah.edu/publications/2014_infovis_upset/),
  [Software Cartography](https://scg.unibe.ch/research/softwarecartography),
  and [EventFlow](https://hcil.umd.edu/eventflow/) address intersections,
  spatial orientation, and temporal sequences respectively.
- [WAI tree interaction](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)
  and [reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
  inform accessible file navigation and comparisons.

Approval adopts the room model, required-contract inventory, design
sequence, and follow-up gates as a planning baseline. It does not adopt
an exact API schema, a final chart/navigation set, an application trust
exception, a new archive policy, or an implementation commission.
