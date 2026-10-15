# Import a GitHub repository into dap

15 October 2026. Draft 1 for checker design review. Request `d7b9e504`,
planner promise `f4bbdac2`. Source baseline: main
`0157307b904c9afc75500b626fc565a152113cfa`.

Hugh asks for an existing GitHub repository and its open issues to become
a Cloudflare-hosted dap room. People collaborate on those issues in dap,
and GitHub stays synchronized. The five delivery stages below are accepted
as a planning sequence. This note proposes the contracts within them.
It authorizes no connector implementation, credentials, provider operation,
or migration. The independent priority-1 bottleneck request `e0292346`
may improve the shared runtime before this design is adopted.

## 1. The result a person gets

A person selects a GitHub repository and authorizes the required access.
Dap reports the branches and history it can import, the issue and comment
counts it has established, and any limit or inaccessible content. After
import and catch-up, the room shows the imported issues with their GitHub
numbers and source links. An enrolled participant can comment. A participant
with the required authority can edit, assign, label, close, or reopen an
issue. Each local act has a dap receipt and a separate synchronization
status. A GitHub failure does not erase a recorded local act.

GitHub changes flow back into dap. Newly opened issues, and previously
closed issues that are reopened after import, enter the room. An imported
issue remains available after closure. Closed issues that have never been
imported are outside the initial selection. Pull requests remain source
links rather than imported change lanes in this first release.

The first release imports the current fields and complete existing comment
conversations of the selected issues. It preserves label, assignee,
milestone, author, timestamp, and URL metadata. Timeline events, reaction
write-back, Projects, pull-request reviews, releases, Actions, and wikis are
separate capabilities. Their omission is visible in the import report.
Attachment URLs remain in their Markdown. An authorized attachment-copy
stage may retain bytes in R2, but a failed or absent copy is never called
an archived attachment. Import does not fetch arbitrary linked web pages.

## 2. Existing dap boundaries

The directory already has an `import` operation and a selected `{commit}`
result. The destination can establish that imported first head. The
production Artifacts port does not implement that whole journey:
[`ArtifactsNamespace`](../packages/scope/src/artifacts-host.ts) exposes
`get`, `create`, and `delete`, and production outside wiring serves register
and destination operations. A new operation owner must bind native import
to the directory's durable attempt and result. The existing declaration
alone is not working repository import.

[`ArtifactsProvider.objects`](../packages/scope/src/artifacts-host.ts)
materializes the entire reachable Git closure. First-head initialization
and reservation staging call it in
[`DestinationHost`](../packages/scope/src/destination-host.ts). Import can
fit Artifacts and still exceed dap's memory, object, or transport bounds.
The new path must verify and adopt a selected head without repacking its
entire ancestry. Later publication needs bounded incremental object work.

An issue is already a lane, with comments, labels, assignment, edit, close,
and reopen acts. Its current definition has no GitHub identity or external
authorship fields. The signer becomes the comment author. Directory lane
creation assigns the next local number and derives identity from a signed
intent. Re-signing a scan is therefore not a deduplication strategy.
See [directory creation](../packages/platform/src/directory.ts) and
[issue forms](../packages/lanes/src/issue.ts).

These changes require new versioned definitions. Existing scopes retain
their pins. Start with newly imported rooms; migration of existing rooms
requires a separate design. The importer reuses normal judgment, authority,
retained inputs, receipts, and delivery settlement rather than writing
directly into projected issue tables.

## 3. Storage and execution

| Owner | Data and duties |
|---|---|
| Artifacts | Git objects and explicitly selected refs, including separate upstream-tracking and dap work refs. |
| Repository coordination DO | Bound GitHub repository ID, room references, import generation, phase, source mappings, agreed synchronization values, permissions state, durable inbox and outbox, progress, and conflicts. |
| Issue scopes | Native collaboration records and source observations under their pinned definitions. Source comments and local comments retain distinct provenance. |
| Directory partitions | Bounded issue indexing and listing. Partition/continuation policy must address journal lifetime, not merely SQL row count. |
| R2 | Immutable raw API captures, copied attachments, export bundles, and large checkpoint data. |
| Workflows and queue consumers | Bounded resumable work. They carry identifiers and object references; the coordination DO owns durable correctness. |

One repository coordinator serializes admission and mapping decisions.
Independent issue workers serialize updates per issue. Bulk bytes do not
pass through one in-memory repository snapshot. A Workflow step is safely
repeatable, or it reconciles an already recorded outside attempt before it
does more work. Completion logs and queue retention are not the permanent
import record. The coordinator records the next work before relying on a
queue notification, so a failed enqueue is recoverable.

Write an immutable R2 object, verify its digest and size, then commit its
reference in the DO. A failed DO commit may leave an orphan object, which
an ownership-aware cleanup pass can remove. There is no cross-service
transaction. Referenced objects cannot expire while replay or a pending
duty needs them. Any compaction or deletion policy must preserve those
dependencies and state its verification consequences.

R2 references contain byte domain, digest, size, object identity, access
policy, and retention ownership. A URL alone is insufficient. Inputs needed
for judgment are fetched and validated before the storage transaction.
Replay resolves the same exact bytes and reports missing evidence as
incomplete. This extends the current SQLite retained-input resolver; it is
not transparent storage substitution. See
[retained storage](../packages/scope/src/sqlite.ts) and
[replay verification](../packages/replay/src/verify.ts).

## 4. Limits are part of admission

The following are documented ceilings or current package policy, not
measured supported workloads. Platform documentation was read on
15 October 2026.

| Boundary | Current value | Design consequence |
|---|---|---|
| Artifacts repository | 1 GB | Budget imported history and future growth; report a repository that does not fit. |
| Artifacts file or blob | 32 MB | Check reachable historical objects, not just the current checkout. |
| Artifacts request rates | 2,000 per 10 seconds per namespace for control operations, and per repository for Git | Pace aggregate import and synchronization work. |
| Paid SQLite DO | 10 GB per object; 2 MB row/string/blob limit | Store bounded records and partition before a single object exhausts its lifetime or storage. |
| Worker memory | 128 MB per isolate, shared across requests | Stream large data; do not accumulate repositories or API histories in memory. |
| dap scope journal | 100,000 entries under current proposed bounds | Creation, results, indexing, and future updates all spend entries. This is not support for 100,000 imported issues. |
| Current issue definition | 256-byte title, 64 KiB body/comment, 5,000 live comments, 20 labels, 10 member assignees | Preflight exact representability; use a reviewed successor definition or report the exception. Never silently truncate. |
| Current Git reader defaults | 1 MiB commit, 8 MiB tree, 32 MiB blob, 100,000 closure objects and refs | Reconcile package budgets separately from provider ceilings. |

Sources: [Artifacts limits](https://developers.cloudflare.com/artifacts/platform/limits/),
[DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[dap bounds](../packages/contract/src/bounds.ts),
[Git reader](../packages/git/src/reader.ts), and
[issue definition](../packages/lanes/src/issue.ts).

R2 accepts much larger individual objects and provides strong consistency.
It suits immutable bulk data, but cannot make an unchanged Git repository
above Artifacts' ceilings fit Artifacts. Moving an ordinary historical Git
blob to a pointer rewrites commits. Original LFS pointers are a distinct
case: their referenced content still needs an LFS-compatible transfer and
serving design. A custom Git object backend over R2 would be a separate
provider with refs, protocol, indexing, integrity, and garbage collection.
It is not assumed here. See [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
and [consistency](https://developers.cloudflare.com/r2/reference/consistency/).

The first release reports unsupported repositories before promising a full
clone. A limited-history import is an explicit user choice, with its exact
boundary displayed; it is never a fallback selected silently. Another Git
backend is a future route for repositories that cannot fit. A result is
not Ready while source enumeration, comments, or required evidence is
incomplete. Actual workload measurements must establish supported counts,
memory, history growth, processing cost, and headroom before release.

## 5. Git transfer, access, and head ownership

Artifacts' native import is documented for public HTTPS repositories and
accepts branch and depth options. It can return before completion, with
follow-up operations returning `409 Conflict`. Default depth, complete
ref/tag coverage, private authentication, and LFS behavior are not assumed.
Use explicit options and verify the resulting ref and object identities.
See [native import](https://developers.cloudflare.com/artifacts/guides/import-repositories/)
and [Git protocol](https://developers.cloudflare.com/artifacts/api/git-protocol/).

For private repositories and recurring Git transfer, the proposed route is
native Git in a short-lived Cloudflare container. Its disk must fit the Git
database, temporary packs, and repacking overhead. An authenticated Worker
proxy keeps installation credentials outside the container. The actual
container and transfer choice requires the stage-1 comparison; none runs
under this design request. See
[private clone guidance](https://developers.cloudflare.com/sandbox/network/clone-a-private-repository/).

Record the GitHub repository's immutable ID, current URL, actual default
branch, selected refs, and source commit IDs. Names can change. A directory
operation records import ownership and intended Artifacts name before
dispatch. A lost import reply is reconciled against that exact attempt,
source, and resulting refs; an existing name alone proves no ownership.
Recover and revoke returned tokens through private custody. A failed room
import leaves a visible resumable result, with cleanup duties only for
resources that this attempt owns. It never deletes the source repository.

Proposed code policy: GitHub owns upstream-tracking refs; dap owns its work
branches. Fetch source changes without overwriting local work. A dap
publication records its expected source base and publishes an explicit
branch update or pull request. Fast-forward only when the expected ref
still agrees. Divergence becomes a visible conflict and an explicit
reproposal or merge decision. Never use unrestricted mirror-push.

The destination's recorded published head does not follow external pushes
silently. Observe a new upstream head and apply a guarded adoption when no
publication is active, or retain a conflict. Initial native import may
already have created refs; adopting it must not attempt an unrelated first
write with an assumed empty ref. The exact tracked-ref namespace and
publication-to-GitHub policy remain review decisions before source work.
See [GitHub mirroring](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository).

## 6. Imported identity does not grant authority

Use a GitHub App installation restricted to selected repositories. Read
contents and read/write issues are sufficient for issue synchronization;
code publishing requests contents-write separately. Installation access is
bounded by the installation's permissions and token lifetime. Keep tokens
and webhook secrets outside journals, R2 source captures, and logs.
See [installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).

The room has a narrowly authorized synchronizer principal bound to one
GitHub repository. It may attest source observations and apply only the
specified import/synchronization acts. Do not make it an unrestricted
maintainer. All private source captures and attachment copies inherit the
room's explicit access policy. A public source does not grant anyone room
membership. Private source access must not become anonymous through site
serving, R2 URLs, exports, or archive configuration.

Map source records using repository ID and issue/comment ID or node ID.
Keep the source issue number separately from the local item ID. Display
the GitHub number and source link, without requiring contiguous numbering.
An imported record retains original author, timestamps, URL, source
revision, and capture digest. The dap signer is the synchronizer. The UI
says who authored on GitHub and who imported it. It does not synthesize
historical user signatures or backdate dap entries.

A GitHub assignee stays an external reference until explicitly linked to
an enrolled dap member. GitHub collaboration permissions do not create dap
keys or grants. Dap participation alone does not authorize writing through
the installation: the room's bridge policy says who may publish which
fields. The proposed first release writes as the App and includes dap
authorship/provenance. User-attributed new writes require separate GitHub
user authorization; that is a product decision, not historical impersonation.
See [acting for a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user).

## 7. Import and synchronization protocol

### Bootstrap without an atomic snapshot

1. Validate access, bind the repository, and admit its supported envelope.
2. Start durable webhook capture and record the import-start watermark.
3. Import and verify the selected Git refs under the recorded attempt.
4. Enumerate open issues in a stable creation order, following all pages.
   Exclude records with `pull_request`. Persist each source ID before opening
   its mapped issue. Reuse the retained signed request after interruption.
5. Import every selected issue's comments and metadata, with exact source
   mappings and explicit incompleteness. API pages are immutable captures
   in R2; mutable progress stays in the coordinator.
6. Reconcile source changes since the watermark with overlapping windows,
   deduplicate shifted pages, and drain captured events. Repeat a bounded
   convergence pass. If changes continue, show catch-up and its watermark
   rather than inventing a global snapshot or claiming instantaneous equality.
7. Mark individually complete issues usable, then mark repository import
   complete when all admitted issues and Git state have their recorded
   results. Ongoing synchronization continues independently.

GitHub's issue endpoint includes pull requests. Comments are a separate
paginated collection. Choose per-issue or repository-wide comment reads
from measured workload; neither may omit a conversation silently.
See [issues](https://docs.github.com/en/rest/issues/issues) and
[comments](https://docs.github.com/en/rest/issues/comments).

### Durable ingress and egress

Validate `X-Hub-Signature-256` over the raw bounded webhook body. Record the
delivery ID, payload digest, source identity, and durable work before
acknowledging. Offload work and respond within GitHub's ten-second window.
Queue delivery is at least once. Deduplicate both delivery IDs and source
object revisions. GitHub events can be delayed or arrive out of order, and
failed deliveries are not automatically retried. Treat an event as a
signal to reconcile current state, not as an infallible ordered journal.
See [webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
[best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks),
[failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries),
and [Queues delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

A local act commits its outbound synchronization intention with its local
result. The sender records source object, base field values, requested
change, operation ID, attempt, and outcome. Dap reports Recorded locally,
Pending, Synchronized, Conflict, Unavailable, or Unknown as distinct states.
These are proposed connector statuses, not replacements for native receipt
answers. A webhook echo advances the mapping/baseline and never creates a
second outbound action.

Periodic API reconciliation repairs missed events, with durable cursors,
overlap, rate pacing, and complete enumeration checkpoints. It includes
new/reopened issues and known imported records. A `404` is not deletion
until access loss has been distinguished. Installation suspension/removal
pauses publication and marks access unavailable. Respect primary and
secondary limits and `Retry-After`. API quotas are shared across imported
repositories in the installation. See
[REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

### Unknown writes and conflicts

GitHub issue/comment creation documents no general idempotency-key
facility. Durable local outbox storage does not make an external POST
exactly once. After a lost reply, reconcile an App-authored stable dap
operation marker and returned mappings before retrying. Matching body and
timestamp alone is insufficient. A marker is correlation, not authority.
If success cannot be proved and absence cannot safely be established, the
operation remains Unknown with a review path. Do not blindly resubmit.
GraphQL `clientMutationId` is not assumed to provide idempotence.

Keep the last agreed values per field. Disjoint field changes can be
combined; competing edits to the same body, title, assignment, label set,
or state become conflicts. Comments append through stable source mappings;
comment edits and deletions have explicit revision/tombstone observations.
Retain original dap history and apply redaction rules to captured evidence
and archives as well as displayed text. No source deletion silently erases
a signed local act or its outstanding duties.

GitHub generally provides no conditional unsafe issue write that makes a
read-then-PATCH atomic. Re-read before writing, compare returned fields,
and reconcile after writing. This detects known divergence but cannot
promise zero lost updates against a simultaneous GitHub editor. Review
must choose the initial policy: automatic writes with this stated limit,
or explicit conflict-sensitive publication for mutable fields. Append-only
comments still require unknown-outcome reconciliation. See
[REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).

An external close is a source observation, not proof that dap's local
completion conditions passed. Apply the corresponding native act only
when its pinned guards and bridge authority permit it. Otherwise show the
external state and local conflict, preserving plans and commitments. Do
not silently bypass guards or automatically reopen the GitHub issue to
hide that disagreement. The same principle applies to assignment and
other state transitions.

## 8. Delivery stages and acceptance

| Stage | Deliverable | Distinguishing evidence |
|---|---|---|
| 1. Establish the envelope | Supported Git transfer/adoption path, practical budgets, and reviewed data/authority contracts. | Fixture with branches, tags, merge history, submodule and LFS pointers; ref/object identity comparison; boundary-size failures; bounded memory and directory growth. Public/private routes compared explicitly. |
| 2. Import code and found a room | Resumable owned import, verified baseline, destination adoption, and exact progress. | Lost create/import reply and restart reconcile the original attempt without another repository or overwritten ref. |
| 3. Import issues and conversations | Complete current open-issue representation and provenance. | Sparse numbers, distinct authors, unlinked assignees, edited comments, large bodies, labels and inaccessible attachments; duplicates and moved pages create no second lane/comment. Exceptions remain visible. |
| 4. Synchronize both ways | Durable ingress/outbox, permission mapping, paced writes and conflict handling. | New dap comment, authorized assignment/close, GitHub readback, inbound edit/reopen/new issue, echo suppression, duplicates/out-of-order/missed events, revoked access and simultaneous same-field edits. |
| 5. Prove recovery and convergence | Operational status, replay/evidence support, and release acceptance. | Crash after GitHub success but before local checkpoint; unknown stays unknown until proved; no duplicate POST; R2 dependency missing/corrupt/restricted; native provenance and receipts replay after restart. |

The release story imports a representative real repository, enrolls a
second participant, collaborates on an imported issue, observes both
directions of synchronization, and survives an interrupted operation.
Stand-ins establish deterministic boundaries; a separately authorized
provider witness establishes actual integration. Neither substitutes for
the other. No provider spike or implementation runs under this note.

The existing priority-1 bottleneck work owns reusable Git and collaboration
capacity improvements. The durability/archive work owns its level and
archive contracts. This connector consumes their reviewed interfaces and
does not silently expand or close either programme. Full five-dimensional
capacity request `cc570904` remains separately accounted for.

## 9. Decisions required before implementation

Checker review must identify contradictions and missing contracts, then
give explicit Architecture, Security, and Simplification conclusions.
Source implementation requires an adopted corrected design and its own
builder request. The remaining decisions are:

- The exact Git import coverage and explicit behavior for unsupported size,
  history, refs, LFS, or unavailable private source content.
- The first supported repository and issue workload, directory partition
  identity/lifetime, and reviewed successor definitions for content bounds.
- The repository/issue synchronizer principal, bridge publication grants,
  and private-source access policy. Bot-attributed outbound work is the
  proposal; individual GitHub user authorization is optional later work.
- The GitHub-tracking namespace, destination adoption rule, and whether
  outward code publication creates a branch/PR or guarded branch update.
- The mutable-field race policy, source deletion/redaction retention, and
  exact unknown-outcome/operator reconciliation path.
- The R2 byte resolver, retention/cleanup owner, and replay/archive
  disclosure inventory. Source captures are importer attestations, not
  GitHub-signed history or independent proof of every upstream fact.

## 10. Validation of this document

This note changes documentation only. Its source citations and local links
are checked against the stated main baseline. The repository gate is run
once at the review candidate, with its exact result recorded in the
workroom invitation. No runtime, provider, benchmark, GitHub write, import,
or synchronization outcome is claimed by that gate.
