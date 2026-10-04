# Composable authority scopes, lanes, and the GitHub demo

Date: 2026-10-04. Initial design draft for planner reconciliation and
independent review. Written against Artroom main
`e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`.

Tracking request: `5c716a5c35bfdbdcef89e1e4fbe82df4aab0b8fd`.
Related experience planning: `2262034df901fca771f57e065f275e7cca00fcfc`.

The product direction below comes from Hugh's instructions. The proposed
mechanisms are a first architecture draft, not an adopted protocol,
implementation delivery, or measured scalability result. Planner should
resolve the named decisions, obtain independent design review, and build
concrete tasks while reconciling existing work. Source implementation and
current implementation priorities are unchanged by this drafting task.

## 1. Starting principle and destination

**An authority scope is a composable primitive.** It owns an ordered
history, the fold that derives its state, and the admission of changes to
that state. An application composes scopes into a coherent experience.
This principle determines the architecture from the beginning.

Wave's wavelet provides a useful precedent: its concurrency boundary and
hosted authority were explicit, while a wave assembled several wavelets.
The analogy does not imply adopting Wave's transport, federation, or text
OT. Artroom needs an explicit algebra and authority contract for its own
work operations. [Wave presentation, slides 14–24](https://www.usenix.org/legacy/event/lisa09/tech/slides/berlin.pdf)

**A lane models work as it happens.** It carries an issue or goal through
discussion, requests, commitments, investigation, contribution, review,
and an exact proposed and mergeable result. Issues and PRs, including their
discussion threads, are particular lane forms. A lane also models the
splitting of concerns derived from an issue or goal and their recombination
into a single deployable change.

The gitseq-style work conversation is concrete: a request names conditions;
a promise accepts exact conditions; a report names a result and evidence;
a qualified review or requester judgment accepts or rejects that result.
Counter-offers, withdrawal, cancellation, handover, and replacement preserve
their own authors and bases. The lane's fold explains who owes what next
from those acts, rather than inferring it from a comment or a status label.

**The demonstration destination is an exact-as-reasonable clone of the
GitHub user experience, built on distributed scopes.** Recognizable
repository, issue, and PR interactions are the baseline. Artroom adds a
coherent view of the work connecting them. Familiar product vocabulary
remains visible; DOs, admission envelopes, and fold mechanics belong in
developer documentation and diagnostics.

The design covers creating and coordinating work, preparing and reviewing
changes, determining merge eligibility, and publishing the exact result to
a Git destination. A deployable change is a pinned change artifact whose
declared build and integration conditions have been satisfied. Its manifest
may include a build artifact digest when the application requires one.
This does not assert that it has reached production.

**Production rollout is outside this design.** The proposed rollout
application, environment promotion, traffic shifting, production sign-off,
production health monitoring, and rollback are separate work. They may
consume a deployable-change reference later. This draft specifies no
production rollout mechanism or production credential.

## 2. Terms and boundaries

| Term | Meaning in this design |
|---|---|
| Authority scope | A stable, addressable boundary that admits transitions and owns their ordered history and fold. |
| Lane | A durable work model expressed within an authority scope, including its conversation, conditions, commitments, contributions, and result links. |
| Lane form | An application specialization: issue, goal/work, or proposed change/PR. A form is distinct from a numbered proposal generation. |
| Resource extent | Paths or other resources a commitment or workspace may use. This is distinct from an authority scope; existing path-glob fields need an explicit compatibility mapping. |
| Commitment | A participant's acceptance of exact requested conditions and responsibility for an outcome. |
| Hold | A lease or reservation over a resource. It can support a commitment but does not define the lifetime or completion of the work. |
| Contribution | A reported result, potentially code, evidence, a decision, or other work, with an exact subject and provenance. |
| Deployable change | An exact assembled result, its source contributions, declared readiness conditions, qualified evidence, and publication destination. |
| Room/repository view | The application's projection of related lanes, authority facts, artifacts, and destinations. Its presentation boundary does not require one ordering authority. |

The initial placement maps one independently active lane to one authority
scope and one DO. Several logical scopes may be co-located later without
changing their semantics. The same scope primitive also expresses
membership, configuration, and destination authorities; those are not work
lanes merely because they use the same substrate.

A goal lane can exist before anyone takes responsibility. It can contain
several commitments and several resource holds, or none. Expiry of a
workspace lease cannot erase the goal, its discussion, the accepted
conditions, or unresolved responsibility. Assignment is visible product
metadata; the application must state whether it also constitutes a
commitment. An assignee label alone does not establish acceptance.

## 3. One lane model, several familiar forms

The following are logical components, not proposed public wire fields.
Planner must choose an encoding consistent with the declared-act model.

| Component | What the lane retains |
|---|---|
| Intent | Goal, requester, conditions, intended destination, and exact revisions of that intent. |
| Conversation | Attributed comments, requests, counter-offers, decisions, dissent, and links to the artifacts discussed. |
| Responsibility | Offers, acceptance, promised conditions, current participants, blocked reasons, cancellation, withdrawal, and handover. |
| Structure | Derived concerns, parent/child relationships, dependencies, and explicit contribution selection. |
| Work | Relevant activity summaries, workspace/run references, investigation findings, and reported results. |
| Proposal | Exact versions, changes, authorship, destination base, and integration candidate when code is involved. |
| Evidence | Reviews, checks, required conditions, original subjects, and explicit reasons for any reuse. |
| Outcome | Result report, requester judgment where required, close/reopen/supersession, and confirmed publication receipts. |

These components have separate states. A lane can have an open issue,
cancelled commitment, retained result, and closed workspace at the same
time. A single status enum such as `open → working → done` cannot carry
those distinctions faithfully.

An **issue lane** emphasizes intent, discussion, assignment, labels, and
open/closed state. A **work lane** emphasizes responsibility, decomposition,
investigation, progress, and contribution. A **PR lane** emphasizes an exact
proposed change, review discussion, checks, and destination publication.
They share the model and primitive machinery. They are not independent
product silos connected to an execution-only object also called a lane.

For GitHub-compatible navigation, an issue and a PR normally retain their
own identities and displayed numbers. One issue may lead to several PRs;
one PR may address several issues. Turning work into a PR attaches or
creates the appropriate change form without destroying the issue or its
history. The full work path remains navigable from either page.

Comments become consequential only through a declared transition. A
comment saying “done,” an agent's summary, or a check's success cannot by
itself accept a result, end another actor's commitment, or publish code.
Optional live conversation and detailed execution streams remain separate
from the admitted facts used to decide work state.

## 4. The authority-scope contract

Each scope needs these properties, irrespective of placement:

1. Stable logical identity, a creation record, and an incarnation that
   prevents identity reuse from redirecting an old reference.
2. A discoverable ordering authority and an explicit authority epoch if
   that authority can move. Physical relocation must fence the former
   authority before the new one admits changes.
3. Versioned declarations, admission rules, and fold semantics; local
   receipts record which meanings governed each decision.
4. Signed intent, canonical bytes, idempotency, and a locally ordered
   history whose effects and outgoing duties commit atomically.
5. Replay that reconstructs required evaluations and their inputs, rather
   than accepting the recorded decision or a snapshot as self-proving.
6. Bounded reads, subscriptions, checkpoints, retention, and recoverable
   external effects.

A concrete reference family should distinguish:

| Reference class | Contract |
|---|---|
| Identity | This exact scope/incarnation, with its type and authority lineage. It makes no assertion about current state. |
| Fact | An exact accepted event or version, named by local position and hash with its admission and meaning. |
| Grant | Permission for a subject to perform specified actions in a specified scope, under recorded expiry, revocation, and delegation limits. |
| Commitment/reservation | An exact operation the issuer has authorized or promised to complete, with its cancellation boundary and eventual result. |

Those classes should be shared across human clients, agents, projections,
and verification. A link cannot silently become a grant; a historical fact
cannot silently become proof of current membership or current readiness.

### Local admission and parallel preparation

Preparation captures an immutable, consistent context and may run outside
the local commit queue. The synchronous commit validates the complete
context dependencies, authority, time-sensitive conditions, and
idempotency before allocating a local sequence and applying effects.
Dependencies include absence and predicates, such as “no conflicting hold
exists,” not just named rows. Effect IDs derived from the sequence are
allocated at commit rather than baked into speculative evaluation.

This is a proposed admission design. The current whole-head check is not
removed merely because this draft describes a narrower check. A complete
guard/input inventory and focused race evidence precede that change.

## 5. References and reliable composition

Every relationship has one authoritative owner. For example, a PR lane
owns its exact link to an issue; the issue's list of addressing PRs is a
projection of that link. Creating or changing the link records an outgoing
duty in the same local transaction. The destination consumes deliveries
idempotently and records their source revision. Delayed delivery cannot
restore a removed link or overwrite a newer relationship.

Creation across scopes uses the same pattern: the initiating scope records
a stable child-creation intent and its permitted authority; the receiving
scope judges that exact command, creates once, and returns a receipt.
The parent's projection shows pending or refused creation until the
receipt arrives. Source system activity must preserve the initiating
actor's admitted intent and cannot invent a participant's signature.

Navigation may resolve a current projection. Decisions use an exact fact
or a deliberately coordinated current-state condition. Verification can
cache immutable facts by hash, with their verified authority lineage and
semantics. Current authority still needs the selected freshness mechanism.
Unavailable history leaves a decision unresolved or refused; it is not
replaced by guessed current state.

Object links may be cyclic. The work-decomposition relation must reject
cycles, using an explicit bounded ancestry check or creation restriction.
Accepted causal dependencies cannot refer to future facts or rely on a
circular proof. A merged view shows per-source positions and causal links;
wall-clock sorting is presentation, not a global serialization proof.

Reopening, closing, and editing remain source-owned transitions. An issue
that consumes a merge receipt closes once according to its configured
link semantics. Repeated delivery cannot close it again after a later
reopen. Concurrent unlink/merge and close/reopen require the exact ordering
and conflict rules in decision D4 below.

## 6. Splitting concerns from a goal

A split records a work plan derived from an exact goal/conditions revision.
Each child lane has its own purpose, requested outcome, participants,
authority, resource extent when needed, and references to that basis.
Creating a child gives it no implicit right to change its parent or
siblings. References preserve common purpose; explicit grants govern
actions.

The initiating lane records:

- which concern each child addresses;
- which goal revision and conditions it rests on;
- whether it is required, optional, an alternative, or superseded;
- dependencies and the expected contribution interface;
- who owes the next response or result.

Each child can discuss, negotiate, work, pause, hand over, and report
independently. Dependencies should point to declared outcomes or exact
contributions. “Child is closed” is insufficient evidence that a required
interface or acceptance condition was met.

A change to the parent goal creates a new revision. Existing promises
retain their original conditions. The parent records which children need
reconsideration or renegotiation; it does not silently rewrite their
commitments. Withdrawal and supersession preserve already recorded work.
Required children that fail or are cancelled leave an explicit unresolved
condition until an authorized replacement or scope decision is made.

The lane's work view answers: what was split, why, who is responsible,
what is happening, what is blocked, and which results are ready to use.
It does not require reading every agent transcript.

## 7. Recombining into an exact deployable change

Recombination is work with an accountable owner, a proposed result, and
evidence. It is represented by a change/PR lane using the same model.

The proposed result has a versioned manifest containing:

- originating goals and the exact conditions it claims to meet;
- selected contribution scope/incarnation, version, result receipt, and
  immutable artifact references;
- explicit replacements, exclusions, and unresolved required inputs;
- contributor and integrator provenance;
- repository, destination ref, expected base, integration commit and tree;
- required build/integration conditions and exact qualified evidence;
- applicable declaration and policy bindings.

The manifest freezes a deliberate selection. Later work in a child does
not float into the proposal. To use it, the integrator proposes a new
result version. A changed requirement or a contribution that must remain
current invalidates eligibility through its explicit guard, rather than
through an unqualified “use latest” lookup.

Assembly uses Git where the result is code. Overlapping contributions
require a deliberate merge or conflict resolution. Interface disagreement
can require more work even when Git finds no text conflict. The combined
tree is checked against its declared integration conditions.

Reviews and checks of children retain their original subjects. They count
for the assembled result only under an explicit equivalence/carry rule.
The assembled result receives any additional required review and checks.
Review independence considers relevant authors of all selected
contributions and conflict resolution, with only explicitly permitted
policy exceptions. Renaming an integrator cannot erase authorship.

Successful child results, accepted reports, passing child tests, and an
assembled branch are distinct facts. None alone establishes mergeability.
The PR view explains missing contributions, stale inputs, conflicts,
failed checks, review requirements, and destination changes.

The initial demonstration assembles one repository's contributions for
one Git destination. The reference model can identify other repositories,
but an atomic publication across multiple repositories is an additional
composition contract and is not implied here.

## 8. Membership, policy, and destination authority

Membership is an authority scope, not a field copied from a lane's parent.
A membership reference identifies an actor; an exact authorization fact or
grant establishes what that actor could do under the chosen semantics.
Inherited role labels, cached rosters, and expired capabilities cannot
assert present authority.

The initial composition should use locally retained, verifiable grants
and imported facts, with an explicit revocation/freshness boundary.
General lane admission must not require synchronously walking parent
lanes, the whole repository, or every control scope. This preserves the
existing collections direction that a cell judges its own admissions and
revocation has a dedicated mechanism.

This draft does not select a revocation algorithm. D2 must reconcile
current-member semantics, the collections freshness/completeness proof,
compromise handling, and reservation timing. A TTL without an explicit
bounded-staleness policy is insufficient. A source signature proves a
statement's issuer, not that its authority is still current.

A destination scope owns publication to a canonical ref. It reserves an
exact assembled result, applicable authority and evidence, and expected
base. Its external writer uses a recoverable, fenced operation. A lost
push reply remains unresolved and is reconciled by exact-operation retry
and readback. Other lanes continue ordinary work while that destination
waits; a later publication to the same ref respects its held slot.

Moving from the current single-room reservation to multiple authorities
requires an exact protocol. D3 must specify how the PR's version/conditions
and the destination's reservation agree, how cancellation is ordered,
which permissions become irrevocable at which point, and how an unknown
outcome is retained. Reading several current versions and then committing
locally does not establish a joint atomic condition.

The narrow mechanisms are co-location of jointly governed facts, an
operation-specific commitment/reservation with explicit semantics, or
stronger coordination when the application truly needs it. No general
distributed transaction guarantee follows from the reference protocol.

## 9. Folds, checkpoints, and distribution

Every local fold runs under retained semantic versions. A composed result
references the exact local facts it consumed. A reproducible repository
view can therefore identify a set of source checkpoints and dependencies;
it does not call an arbitrary set of current heads a globally consistent
snapshot.

Independent operations may prepare concurrently when they preserve each
other's admission conditions and effects. Equal final state alone is not
enough to justify reordering. Operation summaries and checkpoints can
reduce repeated folding and dependency checks if they preserve all facts
the rules require. They never rewrite audit provenance or make an earlier
review apply to another subject by default.

The implementation should distribute independently active lanes across
DOs. Direct references route to their scopes; inactive scopes can remain
dormant. Repository discovery, human-number allocation, search, and
aggregate lists use bounded, partitionable indexes. The naming allocator
handles creation, not every lane act. A room-wide hash-chain writer or
directory relay in every admission would recreate a shared throughput
ceiling and needs a separate justification.

Cloudflare describes DOs as single-threaded units that scale horizontally
across objects. Its current paid SQLite limit is 10 GB per object. These
constraints support bounded active state, externalized sealed history,
and distributed placement, but do not establish this design's throughput
or cost. [Cloudflare limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

Hot scopes still have finite capacity. Sealed-history segmentation
addresses retained storage; it does not make a hot destination or hot lane
parallel. A future split must follow an explicit authority boundary.
Reference delivery uses bounded batches, retry budgets, and retained
unresolved duties. Measurements include control/revocation infrastructure,
indexing, recovery, and fan-out, not just fast lane-local appends.

## 10. GitHub experience and parity

The demo should be usable by a person familiar with GitHub without an
Artroom lesson. Preserve recognizable navigation, language, layout,
interaction sequences, and state explanations. Compare actual screens
and behavior, not only an inventory of API verbs.

GitHub's documented PR structure gives the baseline conversation,
commit, check, and file views. The issue/PR linking documentation supplies
default-branch closing behavior. Review and protection documentation
provides the authority and stale-review cases. These sources are a dated
starting point; implementation must verify any additional feature claimed
as equivalent.

| Surface | Target behavior and evidence | Classification |
|---|---|---|
| Repository | Familiar navigation, code/tree/file browsing, README, commit history, branch selection, and clone access. | Baseline parity. |
| Issue lists/detail | Open/closed filtering, search within declared supported filters, creation/editing, labels, assignees, and attributable timeline. | Baseline parity. |
| Discussion | Markdown, mentions, replies and reference links; edits preserve appropriate authorship/history. | Baseline parity; exact editing/deletion policy needs D4. |
| PR creation | Head/base selection, comparison, description, draft/ready state, and linked issues. | Baseline parity. |
| PR review | Conversation, Commits, Checks, Files changed; line discussion, review submission, requests, and resolved/outdated threads. | Baseline parity. |
| Review decisions | Comment, approve, request changes, with distinct authority to count toward required approval. | Baseline parity. |
| Eligibility | Explain conflicts, required checks/reviews, relevant stale approvals, and destination changes. | Baseline parity; branch-rule subset must be named. |
| Publication | Familiar merge control, declared merge method, exact resulting commit, confirmed outcome, and close/reopen. | Baseline parity; D3 and D4 govern races. |
| Issue/PR relationships | Development links and applicable closing keywords/default-branch behavior, with source-owned updates. | Baseline parity; D4 records exact supported behavior. |
| Attention | Review requests, mentions, notifications, deep links, and read/unread state with authorization. | Baseline parity; reuse existing attention work. |
| Work view | Current commitments, parent/child concerns, progress, blocked reasons, selected contributions, and path to the proposed result. | Explicit Artroom addition, accessible from issue and PR. |
| Human/agent actions | The same meaningful actions, current permissions, explanations, and exact operation outcomes through UI and supported clients. | Platform requirement. |
| Broader GitHub features | Projects, full Actions workflow hosting, advanced organization administration, complete rulesets/merge queues, and other service-wide features. | Planner must enumerate and explicitly decide parity/defer; absence cannot be silently called equivalence. |
| Production deployment | Rollout, promotion, traffic shifting, production health and rollback. | Excluded by Hugh's instruction. |

Sources: [PR views and draft behavior](https://docs.github.com/en/pull-requests/reference/pull-requests),
[review decisions](https://docs.github.com/en/pull-requests/reference/pull-request-reviews),
[issue/PR links](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

The initial safety policy may intentionally differ from configurable
GitHub behavior. For example, Artroom's independent-checker rule and exact
integration evidence must not be weakened merely to imitate a permissive
setting. Record the difference and show its effect. Similarly, carrying
an approval must follow the selected parity policy and explain its subject;
the demo cannot silently adopt Artroom carry while claiming identical
stale-review behavior.

GitHub-compatible issue auto-close is distinct from requester satisfaction.
The issue form implements its selected close semantics. Where a work lane
requires requester acceptance, that remains a separate recorded judgment.
Do not make every ordinary GitHub interaction require a new unfamiliar
approval ritual.

## 11. Worked demonstration: one goal, several concerns, one result

The example goal is “Add project export” in a small application. It needs
an export endpoint, a browser control, and an integration check plus user
documentation. A person files issue #42 and names the conditions: export
the selected project, preserve its contents, expose a usable browser
control, and produce a verified downloadable result.

1. The issue lane records the request before any lease or commitment.
2. The coordinator proposes three concerns with interfaces and conditions.
   Their child work lanes open independently and retain the exact goal
   revision. The issue's work view shows responsibility and creation state.
3. Two independently identified agents accept different concerns. The
   integration/documentation concern can be owned by another participant.
   They work in separate resource extents and workspaces where appropriate.
4. One concern blocks on the other's interface. A recorded request and
   response settle it. A handover preserves conditions, context, and
   artifact references, while replacing only the relevant responsibility
   and workspace authority.
5. Each child reports an exact contribution and evidence. One report fails
   a required condition and is revised; its old result remains visible.
6. The integrator opens PR #43, selects exact contributions, and proposes an
   assembled manifest. Another child advances meanwhile; that version is
   visible but is not silently included in PR #43.
7. An independent reviewer uses familiar PR views and requests a revision.
   The combined integration test catches an interface problem even though
   child-local checks passed. The integrator resolves it in a new version.
8. Qualified evidence makes the exact combined result eligible at the named
   destination. A base change causes the defined recomputation and any
   necessary new checks, with visible eligibility reasons.
9. The destination reserves and publishes the exact result. A lost reply
   is reconciled for the same operation. Confirmed publication updates the
   PR and applicable issue links through durable receipts.
10. The issue closes under its configured GitHub-compatible rule. Any
    separate requester-acceptance condition is judged explicitly. The
    resulting deployable change is inspectable with its source contributions,
    integration artifact, evidence, and provenance. The walkthrough ends
    there; it does not push the result into production.

A second, unrelated issue and PR remain active throughout. Slow child
work, delayed backlink delivery, or an unresolved publication does not
block unrelated lane admissions. The same destination still orders its
publications correctly.

## 12. Current source and existing work

This is a successor architecture, not a claim that existing application
declarations already express it.

| Source or task | Relevant existing behavior or obligation |
|---|---|
| `packages/room/src/core.ts:1` | One repository sequencer, local SQLite sealing and effects, deferred external work. |
| `packages/room/src/core.ts:895` | `serial()` chains admission work. |
| `packages/room/src/admission.ts:234` | Awaited decision within that queue; whole-head validation before commit. |
| `packages/room/src/core.ts:1026` | Reservation revalidates authority/evidence and compares retained evaluation input. A useful local pattern, not an existing cross-scope protocol. |
| `packages/contract/src/acts.ts` | Current lane/claim, proposal generations, review/check and landing shapes. These require compatibility treatment, not wholesale reinterpretation. |
| `notes/2026-10-02-declared-acts.md:224` | Current primitives focus on held lanes, files, evidence and landing; broader work state machines and cross-thread guards need explicit extensions. |
| `notes/2026-10-02-acts-review.md:461` | Full addressed-work lifecycle D1, including pre-work filing, negotiation, non-landing results, handover, cancellation and acceptance. |
| N2 `9c43c17327cc26c2e5e54cd27fea197d26e803a5` | Owns that full lifecycle design. Lane composition should reconcile it, not file a duplicate lifecycle implementation. |
| N1 `53016b8e7ebc4ee50322fc85ce5e9f7a9d4d0dfa` | Real immutable proposal reads and reader authority, needed by the PR experience. |
| `plans/005-2026-10-03-browser-cloud-work.md` | Reviewed durable coding/browser/device direction; C1–C6 implementation remains separately owned. |
| `plans/006-2026-10-03-experience-and-developer-adoption-tasks.md` | Existing N1–N7 tasks for reads, lifecycle, starter, guidance, installation, complete manual, and human attention. |
| `plans/012-2026-10-04-collections-clarification.md` | Proposed self-sufficient admission, imported authority/configuration, dedicated revocation, and grouped projections. Its original source integration and design decisions retain their existing owners. |
| `notes/2026-10-02-positioning-exploration.md` H7 | Proposed rollout application; expressly excluded from this work. |

Current source excerpts for drift checking:

```ts
// packages/room/src/core.ts:895
serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = this.chain.then(fn);
  this.chain = next.catch(() => undefined);
  return next;
}

// packages/room/src/admission.ts:234, abbreviated
return core.serial(async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    core.expireDueSync();
    const snap = core.headSeq();
    const plan = await decide(core, signed, path, pre);
    // Replay/refusal handling omitted here.
    const out = core.sql.transaction(() => {
      if (core.headSeq() !== snap) throw new Moved();
      const late = finalBoundary(core, plan);
      if (late) return { late };
      return { done: commit(core, plan, hooks) };
    });
    // Completion/reconsideration handling omitted here.
  }
});
```

The current whole-head rule is a sound conservative mechanism. Improving
it needs complete dependency validation. Distribution additionally changes
the history/identity contract; it cannot be delivered by deleting the
queue or changing a DO name.

## 13. Decisions to resolve before implementation

| ID | Decision and required output | Owner and evidence |
|---|---|---|
| D1 | Scope identity, authority epoch/routing, historical fact encoding, checkpoint retention and legacy room/lane mapping. Include authority move/fencing or explicitly freeze placement for the first version. | Planner with contract/log owner; exact schemas, historical replay examples and bounded recovery scenario. |
| D2 | Grant freshness/revocation, compromise propagation and authorization decision points. Reconcile self-sufficient admission and current authority without a universal synchronous parent traversal. | Membership/collections owners and planner; both orders of revocation versus admission/reservation, retained proof and measured control-path cost. |
| D3 | Cross-scope recombination/publication commitment and cancellation protocol. Specify source freezing/eligibility, destination reservation, unknown outcomes and completion ordering. | Planner with Git/Room owners; exact state machine and fault-injected race witness. |
| D4 | Lane forms and graph transitions: splitting, renegotiation, replacement, selected inputs, issue links, auto-close, close/reopen and discussion edit semantics. | N2 owner with planner; complete transition/authority table and product parity matrix. |
| D5 | Application fold/guard expressiveness and verification. Identify the smallest new primitives and any app-code boundary; define reproducible semantics and independently reconstructable inputs. | Declared-act/policy/log owners; one issue lifecycle and one split/join expressed through public interfaces. |
| D6 | GitHub parity extent, installation path, demo repository and exact supported package versions. Name each deferred service feature and intentional difference. | Planner with N1/N3/N5 and UI owners; screen/interaction inventory, cold-person walkthrough and public-package install evidence. |
| D7 | Bounded indexes, history storage, fan-out, backpressure and horizontal scaling acceptance workload. Define measurements before claiming capacity. | Platform owner with planner; actual deployed latency/cost/storage and failure-recovery evidence. |

Mechanisms that cannot preserve a required invariant remain explicit
design findings. Do not substitute cached “current” state, weaken review
independence, or claim an unresolved operation failed to make a test pass.

## 14. Planner task map

The rows below are proposed packages. Planner must inspect existing
commitments, reuse owned work, and record actual request IDs and exact
deliverables. Commission implementation after the relevant design is
reviewed and adopted; a design report is not implementation completion.

| Package | Deliverable | Dependencies and reuse |
|---|---|---|
| P1 Scope/reference contract | Exact proposed identity, receipts, local admission dependencies, causal verification and compatibility design for D1/D5. | Contract/log/declared-act owners; preserve current meaning and history. |
| P2 Complete lane lifecycle | Lane forms, pre-work intent, commitments, discussion, splitting, handover, dependencies and selected-result transitions. | Reconcile N2/D1; add composition to its owner map rather than replace its promised conditions silently. |
| P3 Authority composition | D2 grant/revocation contract and D3 commitment/publication protocol, with named narrow proofs. | Existing membership/collections, C1, Git/Room authority and recovery owners. |
| P4 Distributed composition proof | A small real multi-DO lane graph with durable delivery, independently progressing lanes, exact split/join and recoverable destination publication. | Adopted P1–P3; public interfaces where available; no production rollout. |
| P5 GitHub application and UI | Separate application repository, parity matrix, familiar repository/issue/PR experience and integrated Work view. | N1 reads, N3 public starter, N4 guidance, N5 install; supported generic client/MCP/UI and C3/C5 when autonomous coding is shown. |
| P6 End-to-end acceptance and guides | The worked demonstration, cold review/use, independent replay and bounded deployed scaling evidence. | P4/P5; reuse C6, N6 complete manual and N7 attention where applicable. |

Planning/reconciliation is owned by planner; affected builder owners
deliver the corresponding reviewed source or proof artifacts; checker
reviews the exact design and implementation evidence independently.
The existing test-overhead, acts, builder-owned Jam readiness, and complete
documentation work remain tracked. This draft neither cancels them nor
adds a blanket prerequisite to the current Jam path. A priority change
needs an explicit recorded direction.

## 15. Bounded acceptance scenarios

| Scenario | Required witness |
|---|---|
| A1 Familiar experience | A cold GitHub user creates an issue and PR, reviews real files, understands a blocker and publishes a confirmed result using the declared parity surface. Record help, unfamiliar terms and deviations. |
| A2 Work before a hold | Issue/goal exists unassigned; two actors negotiate and commit to exact conditions; expiry/handover preserves work history and unresolved responsibility. Non-code results also have an explicit judgment. |
| A3 Split and join | One goal produces independently progressing concern lanes; the assembled result names exact versions and unresolved inputs; a later child version cannot silently change it. |
| A4 Combined correctness | Child-local evidence passes but combined integration fails; the result remains ineligible until the exact combined result meets its conditions and qualified review. |
| A5 Durable references | Repeated/out-of-order link deliveries, unlinking, interrupted child creation and restart preserve one source truth. Old delivery cannot revive a removed link or close a reopened issue twice. |
| A6 Authority races | Both orders of withdrawal/cancellation, compromise/revocation, changed conditions and publication reservation produce the specified outcome and a verifiable reason. |
| A7 Failure isolation | Delay one lane's evaluation, reference receiver, or destination push; unrelated lanes continue. The same destination retains unresolved publication duties and fences stale attempts. |
| A8 Replay and compatibility | Reconstruct local states and the composed result from retained historical semantics and causal receipts; a forged/missing dependency, stale authority epoch or unsupported history is detected. Existing legacy evidence remains readable under its own meaning. |
| A9 Horizontal scaling | Compare an agreed workload at one, ten and one hundred independent active lanes. Measure per-lane queue/evaluation/commit time, p50/p95/p99, CPU/storage, RPC/delivery fan-out, control-plane load and cost. Include a shared-destination variant and a skewed hot-lane variant. No numerical pass target is invented before D7 selects the workload and budget. |

Reuse fixtures and compact invariant tests. Distinguish local DO/RPC
fidelity from real hosted Artifacts/Sandbox effects and deployed placement.
Only new boundaries or unresolved failures justify additional tests.

## 16. Handoff and verification

This drafting task changes only this file and a small additive planning
index entry. It creates no application, protocol amendment, runtime,
deployment, production rollout or new builder implementation promise.

For source reconciliation, run:

```sh
git diff --stat e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967..HEAD -- packages/contract packages/room packages/log packages/git packages/client packages/ui docs/protocol.md
```

Compare the excerpts and live ownership before assigning implementation.
Current available commands are `npm run typecheck`,
`npm run test:node --workspace @generalbusiness/artroom-room`, and
`npm run test:workerd --workspace @generalbusiness/artroom-room`.
They are not required for a prose-only draft. Typecheck currently generates
declaration/runtime files, and implementation verification must reconcile
the independently owned minimized workflow before selecting exact gates.

Draft completion requires the user direction, lane forms, split/join,
authority contract, reference classes, exact deployable result, GitHub
parity inventory, exclusions, decision owners, task reuse and acceptance
scenarios above to be present; local links and formatting must be checked.
Deliver the exact UTF-8 bytes and digest as workroom evidence to planner.
Planner returns a reconciled task ledger and independent design-review
path. Unresolved D1–D7 choices stay named until their evidence decides them.
