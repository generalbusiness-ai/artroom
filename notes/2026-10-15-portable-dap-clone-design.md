# A portable dap clone

15 October 2026. Discussion draft 1 for Hugh.

Request `35ee8372`, planner promise `35f875e4`. Source baseline:
main `bc95110e119b84d8073e5b61b8568884c6a58de4`.
Gap investigation: `e398c623`. Archive privacy decision: `5eccb4e8`;
unresolved planner dependency: `d553ff29`.

This note proposes the additional contracts needed for a clone to carry
the readable state of a dap room. The proposal has no checker approval
and is not adopted or implemented. It does not authorize an archive writer,
change an existing room's disclosure policy, or commission writable rehosting.

## 1. The result a person gets

A person runs a dap-aware clone command. The result contains source code
and a named export of the room's issues, discussions, changes, versions,
relationships, rules, and membership information that the export policy
permits. An installed local reader can reconstruct and browse that record
without contacting the original service.

The clone identifies the exact histories it contains. It reports its
cutoff, content coverage, verification results, and any external trusts.
It does not imply that every scope was captured at one instant or that
the room stopped changing after capture.

The proposed initial experience is:

1. Request an export of the room through a captured set of heads.
2. Wait for the service to establish the selected export's contents.
3. Clone source and the exact export, with all required Git objects.
4. Open the room locally and inspect its issues and changes.
5. Verify the record independently, with explicit qualifications.

An incomplete export must not be described as a complete portable clone.
A partial record may still be useful, but it has a different result and
an explicit list of missing subjects or content.

## 2. Three promises need separate meanings

| Promise | Meaning | Proposed scope |
|---|---|---|
| Portable record | The selected room state and its required readable content are present through named heads. | This design |
| Portable reader | Installed software can discover, reconstruct, browse, and verify that record without the original service. | This design |
| Portable authority | Another host can safely continue the same room, including pending external operations. | Separate migration design |

Content completeness and proof coverage are also separate. A complete
readable record may retain an existing replay qualification, such as an
ancestry walk that the verifier does not derive. The result must show
that qualification rather than claim a proof the current verifier cannot
give. A reconstructed state is not automatically a verified state.

Private signing keys, provider credentials, sessions, and bearer secrets
are not portable room content. Public key identities, grants, and the
recorded decisions about them are part of the record where eligible.

## 3. Current implementation and the existing archive plan

Today, each scope's authoritative journal and retained inputs live in its
Durable Object. Git contains published repository files and publication
receipts, not the complete histories of the room's issues and changes.
[Architecture](../docs/architecture.md) describes this distinction.

The reviewed [durability design](2026-10-09-shared-language-volatile-acts.md),
sections 15 and 16, proposes an asynchronous journal copy under
`refs/artroom/journal/<scope ID>`. It includes per-scope manifests,
retained dependencies, archive progress, and offline clone replay.
It deliberately excludes detached text and private operational custody.
Earlier rooms do not gain the archive automatically.

The builder's priority-1 request `e871ba09`, promise `55d9a12f`, covers
that archive and its stated limits. The Recorded declaration foundation,
[archive path codec](2026-10-15-archive-path-grammar.md), and
[segment grouping](2026-10-15-archive-segment-grouping.md) have landed.
They do not enable an archive writer or portable room reader.

The [current clone command](../packages/cli/src/commands.ts) obtains a
read credential and runs ordinary `git clone`. The
[replay command](../packages/replay/src/cli.ts) currently reads the service
through HTTP. Neither supplies the experience in section 1.

## 4. The gaps and their owners

| Gap | Existing work | Additional requirement |
|---|---|---|
| Journal bytes in Git | Planned archive layout and writer | Complete eligible room inventory, not only independent scope prefixes |
| Readable bodies and comments | Deliberately omitted from the archive | Adopted payload export and redaction policy |
| Credential-free history | No certified export cohort | Versioned admission records that can be copied without credentials |
| Capture completeness | Per-scope archive positions | A closed, bounded room export with exact heads and dependencies |
| Dependency coverage | Replay and declaration consumers exist | Complete validated inventory, including pinned declaration closure |
| Clone transport | Ordinary authenticated clone exists | Exact export selection and retrieval of archive refs and objects |
| Offline use | Git-backed verification is planned | Room discovery, state reconstruction, text resolution, and a readable local projection |
| Older rooms | No automatic archive migration | Explicit legacy export outcome and proof limits |
| Large external content | May reside outside Git | Included bytes or an honest incomplete result |
| Writable relocation | Not covered by the archive | A separate ownership, recovery, and cutover protocol |

The existing archive remains useful. This proposal adds a room-level
product contract rather than changing the live sequencer to Git.

## 5. Eligible contents and payload policy

A complete readable export includes the selected room's durable records,
including final issues and changes, their relationships, and currently
retained content needed to read their selected state and included history.
It includes the exact definitions and versioned interpretation needed by
the supported reader. Required immutable source objects must be present
for included change versions, not merely named by a remote URL.

The scope includes relevant room applications discovered through their
creation records. An allowlisted application needs a supported generic
or specific readable projection. An opaque attachment does not count as
a readable application. Unsupported interpretation makes the whole-room
result incomplete or refused, unless a partial export was explicitly
requested. An unknown application cannot be silently discarded.
An ephemeral Live scope has no durable history to copy. Its exclusion
must be declared without presenting it as preserved state.

### Text is an explicit addition to the archive contract

Issue bodies and comment bodies are detached text in the
[issue definition](../packages/lanes/src/issue.ts). Their digest alone
does not preserve their words. The proposed portable export includes
authorized, currently retained text under reviewed field semantics.

This is a proposed change to the earlier no-text export decision. It does
not silently add texts to every background archive or retroactively
publish an existing room's discussion. The policy must state its audience,
covered fields, retained historical versions, and treatment of redaction
before an export starts.

A later redaction may affect content referenced by an earlier captured
head. Disclosure policy therefore applies at export time as well as to
the selected history. The exporter must not recover redacted text from
older caches or backups to satisfy a historic cutoff. It records a safe
tombstone or policy omission. Such an omission is distinct from lost bytes.

The baseline profile covers current non-redacted content for every
included durable subject, including closed issues and final changes.
Historical payload coverage is a separate explicit selection. Missing
older text must not be hidden under a claim of complete readable history.
The export does not recover material removed by an authorized redaction.
Git copies already distributed cannot promise later erasure. That
consequence must be stated before readable payloads are exported.

The manifest needs disclosure heads as well as state heads. A later
redaction used to exclude earlier content is a named disclosure dependency,
not a silent change to the captured application state.

The proposed disclosure boundary is an explicit export release decision,
before the first provider object write. It binds the final closed
scope/head/payload inventory, audience, policy version, and export attempt.
Closure may add dependencies, so initial consent alone is insufficient.
Required owners must admit that exact release under a protocol ordered
against redaction, revocation, and policy change. Earlier revocation or
redaction invalidates unfinished release; after release, retraction is
not promised. Release authorization and actual copying remain distinct
recorded outcomes.

Release cannot override the credential exclusion or an unresolved schema
classification. Its purpose is to admit eligible content for copying.

Temporary or unreachable Git objects disclose bytes too. Withholding the
completion pointer cannot undo a provider upload. Acquisition and private
construction therefore precede release, and no object upload precedes
the required release admissions. Separate HTTP checks are not an atomic
admission protocol. Its owner coordination, freshness, and race semantics
remain a blocking design decision. Text export stays disabled until review.

### Read permission is not export permission

Eligibility is bound to exact definition digests, platform and owner
versions, schemas, retained kinds, and named value domains. The policy
classifies whole entries, retained inputs, paths, provenance, and omission
metadata. Reversible encoding and valid digests do not make private data
safe to publish.

Unknown pins, schemas, input variants, and foreign dependencies fail closed.
No existing cohort is certified safe by this draft. A reviewed allowlist
must precede the first writer. A text scanner may detect suspicious
content, but cannot prove that arbitrary user text contains no secrets.

Repository readers receive the exported content. A field restricted to
a narrower audience cannot be copied into an ordinarily readable ref.
The initial design stops or offers an explicitly limited export in that
case. Encryption with separately held keys is a possible later design,
not an implicit way to claim a self-contained readable clone.

## 6. Credential-bearing native histories are a blocking incompatibility

The current membership `join` and `enrol` acts take an inline `secret`
field. A native act entry retains the signed intent. Replay uses the
secret when judging admission. See
[membership](../packages/platform/src/membership.ts) and
[native entry inputs](../packages/contract/src/entry.ts).

The archive contract currently requires unchanged entries and excludes
credentials. Those requirements conflict for these histories. Invitation
expiry, consumption, or consent does not remove the conflict. Skipping
an entry, replacing its secret, or signing a substitute does not preserve
the original native history. A copied foreign membership entry can make
another scope ineligible too.

The proposed direction is a new versioned membership flow:

1. A prospective device generates its key locally.
2. An authorized inviter binds an invitation to that exact public key,
   member, role, scope, and deadline through a verified exchange.
3. The named key signs acceptance of that invitation.
4. The native rules check the invitation, key, authority, expiry, and
   current membership state, then consume the invitation atomically.

The durable admission evidence contains public authorization data and
signatures, rather than a bearer secret. A link may locate an invitation;
it cannot establish which key the inviter intended. Unauthenticated key
substitution must not become the new admission mechanism.

This direction requires a reviewed protocol, replay rules, client and
browser flows, recovery treatment, and adversarial witnesses. It does not
retroactively make old entries exportable or certify a whole cohort.
Every reachable input variant needs examination, including inline user
payloads and copied foreign entries. For example, `change.propose-file`
retains inline content in its signed input, unlike detached issue text.
Sensitive bytes there cannot be removed from the original signed entry.
Unresolved credential-bearing inputs stop the native export even under
the proposed membership version. The existing archive writer remains
blocked under `d553ff29` until the contradiction and exact eligibility
policy are resolved.

## 7. Older rooms need an honest compatibility outcome

Two legacy outcomes are proposed:

- **Original native history:** refuse a complete export when any required
  canonical entry or dependency violates the disclosure policy. Report
  the blocking category without echoing its secret bytes.
- **Readable state snapshot:** produce a separately identified, sanitized
  artifact of approved current records, with source heads, transformations,
  omissions, and the exporter's attestation. It is not the original
  signed journal and cannot reproduce its original admission judgments.

A snapshot can preserve useful issues and changes from an older room.
It must carry a different proof claim from a portable native history.
It has a distinct artifact type, schema, and local reader path. Original
references appear as provenance only. Native history reconstruction and
replay results are unavailable for transformed records; an exporter
attestation cannot supply them.
An eventual import of that snapshot would create new authority and
identities. Original references remain provenance, not transferred grants.

The portable format should identify which outcome it contains. A partial
native archive cannot be silently combined with a snapshot and labelled
complete original replay. This proposal does not yet define the snapshot
signing authority or authorize that legacy exporter.

## 8. A captured room needs a closed set of histories

There is no global journal or atomic multi-scope read. The export captures
a vector of heads: full scope reference, position, and entry hash for each
included history. It records the capture interval and final directory
head. The vector describes a causally closed selection, not a global
wall-clock snapshot.

Start from a directory head and follow the creation records in its prefix.
Read each discovered scope through a selected head. Include final subjects
and required room applications. The current hosted
`roomScopes` discovery routine in the
[CLI](../packages/cli/src/commands.ts) is a useful foundation, not an
export completeness certificate.

Dependencies can require a later directory or membership position. The
proposed algorithm allows selected heads to advance only as needed for
closure. An advanced directory must be scanned again for newly included
creations. Record both the initial and final root heads; do not describe
the root as frozen while silently advancing it.

Classify each creation and its recorded outcome. Refused creation is
different from a created scope whose history is unavailable. Provisional,
unconfirmed, and undelivered creation requests remain visible pending
records. They cannot disappear from coverage or become invented children.

Repeat until every required in-room source fact, observation position,
and creation is covered.
Missing history, conflicting hashes, unsupported definitions, or an
exhausted budget stop the export. Continuous activity may prevent closure
within the budget. The exporter then reports that it could not capture
a complete record and retains the last completed export.

Use explicit limits on bytes, entries, scopes, dependency depth, closure
passes, duration, and concurrent work. No dimension may be made unbounded
to obtain a successful label. Normal room writes continue; success does
not require Git confirmation before every ordinary act is acknowledged.

An interrupted attempt may retain validated immutable bytes in private
custody under its attempt identity and exact selected heads. Resume
rechecks closure and disclosure eligibility. A changed selection becomes
an explicit new manifest revision or attempt, never an unnoticed mixture
of mutable latest answers. Budgets include decoded bytes, object and
payload counts, and decompression work, as well as transport bytes.

Shared infrastructure needs a declared boundary. A shared register cannot
be copied wholesale into every room. Any required external history,
retained fact, or trust anchor must be named with its coverage and trust
basis. An unavailable dependency cannot be silently anchored to force a
verification pass.

## 9. Dependency inventory must match the actual consumers

The archive inventory must share dependency-reading rules with replay and
runtime definition discovery. It must not infer completeness from a
successful HTTP read or a list of attempted fetches.

The current checker's `5eccb4e8` decision establishes these constraints:

- Enforce each captured cutoff in the history source's reported head,
  entries, and pagination. Replay's `Options.head` checks a known anchor;
  it does not truncate traversal.
- Inventory successful, validated inputs. Replay can probe several value
  domains before finding a matching observation. Failed probes are not
  all required dependencies.
- Key dependencies by scope incarnation, kind, domain where applicable,
  and digest. Preserve required provenance metadata and deterministic
  deduplication.
- Include the transitive named declaration closure, including unused
  child declarations promised by the archive contract. Replay alone does
  not traverse that entire closure.
- Keep copied foreign entries separate from the source histories needed
  to establish them. A retained copy does not carry all its own inputs.
- Use typed completion states. Missing text, missing evidence, unsupported
  consumers, exhausted limits, and the existing unwalked ancestry
  qualification have different meanings.

The [history source](../packages/replay/src/source.ts),
[verifier](../packages/replay/src/verify.ts), and
[runtime definition consumer](../packages/scope/src/definitions.ts) are
the relevant implementation boundaries. A manifest must not claim a
complete dependency inventory after an unrelated early stop.

After capture seals, a source over the selected inventory refuses every
undeclared scope or input and every entry beyond its cutoff. Its pages
terminate exactly at the named head. Run terminal reconstruction and
verification against that sealed source, independently of acquisition's
successful reads. Missing declarations, extra dependencies, or misleading
page heads cannot yield a complete result.

## 10. One immutable room export selects the included bytes

The proposed room manifest names:

- Artifact type and format, room identity, repository identity, and Git
  object format.
- Export identity, capture interval, and initial and final directory heads.
- Each included scope reference, selected head, and exact archive commit.
- Exact source commits and required Git object closures for change versions.
- Selected checkout branch and exact source commit, separately from
  per-change source versions.
- Definitions, interpretation versions, dependency inventory, and payloads.
- Export-policy version, audience, disclosure heads, safe omissions, and
  external facts.
- Separate content completeness and verification results, including trusts.

Each included object is immutable and content-addressed. Construct and
validate the export before updating a discoverable completion pointer.
The manifest pins all scope archive commits; readers must not resolve
each scope's mutable latest ref independently after selecting an export.

A possible logical ref is `refs/artroom/exports/<directory>/<export-id>`.
Its spelling and publication protocol need review. The export commit
must make every required Git object reachable, not merely mention object
IDs in JSON. It may retain scope archive tips and required source tips
through actual Git parent edges or another reviewed reachability layout.
Git garbage collection does not follow arbitrary object IDs in blobs.
See the [Git object model](https://git-scm.com/docs/gitdatamodel.html).

The final design must bound parent counts and fan-out. A large room cannot
put an unlimited number of scope tips directly on one commit. Export
packaging commits are storage structure, not new native events or source
changes. Lost publication replies use the existing owned-attempt and
read-back pattern. No uncertain mutation becomes an automatic fresh push.

A provider's ref advertisement or partial tree read does not establish
complete source-object possession. Acquisition must verify the required
closure under its actual bounds. The related publication-retention
dependency `108e7b79` does not supply a certificate merely by existing.

## 11. The clone must fetch the export and contain its payloads

The proposed first product contract is **dap-aware clone**, preserving
an ordinary working checkout plus an explicitly selected room export.
Command names and flags remain to be chosen.

Ordinary remote Git clone does not fetch arbitrary custom refs. The
dap command must fetch the exact export and its reachable objects under
an explicit refspec, validate the selected export, and retain its local
ref. It records the export ID for later offline opening and comparison.
See [Git clone semantics](https://git-scm.com/docs/git-clone).

The initial proposal checks out the selected source commit, not a branch
tip that happened to advance during cloning. If the command also offers
the newer branch, the difference is explicit. The local reader must not
silently describe the captured room while showing a different checkout.

If the requirement is that plain `git clone` must carry room state with
no additional dap step, the layout must instead be reachable through
normally fetched refs. A dedicated metadata branch is one candidate.
That product choice remains open; custom refs alone cannot satisfy it.

Required payloads must be in the clone. An R2 URL is not a portable copy.
An owned attachment or large evidence object must be included by digest,
using bounded chunks if needed, or the export cannot claim its complete
inclusion. Preserve ordinary external hyperlinks as links; this design
does not archive every third-party page mentioned in a comment.

LFS objects, submodule repositories, and external build artifacts need
explicit inclusion classes. A pointer is not its target bytes. The
manifest must distinguish metadata-only references from included content.
Storage limits can make a complete export unavailable; an R2 fallback
must not quietly weaken the clone-only promise. See the related
[import storage analysis](2026-10-15-github-repository-import.md).

## 12. The offline reader reconstructs without executing room work

The reader starts from the pinned export manifest and validates its
objects, paths, sizes, modes, and dependency coverage. It reads committed
objects, not a mutable working tree. Opening a clone must not execute
repository hooks, install arbitrary code, or dispatch recorded operations.

For a native-history export, the reader folds each included history through
its selected head and resolves readable payloads under the export policy.
It presents issues,
discussions, changes, versions, reviews, jobs, rules, and relationships
with their original references. Search and lists report their coverage.
Unsupported interpretation remains visible rather than becoming an empty
room. The [existing replay view](../packages/replay/src/view.ts) provides
state-folding foundations, not this complete reader.

Integrity, reconstruction, and full replay produce separate results.
A materialized projection may speed browsing, but the reader checks its
binding to the manifest and must not treat it as independent proof.
The reader requires an installed compatible interpreter; it must not
contact the old service to obtain missing data during offline acceptance.
Interpretation support covers the selected applications and their foreign
dependencies. The reader does not execute declaration-supplied native
code, hooks, or plugins. A legacy state snapshot uses its separate schema
reader and provenance labels, not native replay.

Recorded requests or unknown operations remain historical facts. The
reader does not restart delivery, mint credentials, acquire write tokens,
or act as the old service. It clearly identifies the room as a captured
read-only record.

## 13. Writable rehosting is a separate contract

A later design may continue a room on another host. It must establish
exclusive writer ownership, old-service fencing, scope identity and
incarnation treatment, membership authority, new provider bindings,
credential replacement, and pending-operation reconciliation.

The archive excludes dispatcher and private custody rows. Some of those
rows distinguish an operation not sent from one possibly sent whose reply
was lost. Rebuilding folded items cannot safely recreate that distinction.
See the [store's attempt custody](../packages/scope/src/store.ts).

A portable record is therefore not a resumable runtime checkpoint.
Restoring an old service's queues and retrying them is outside this note.
The separate [task save-and-restore plan](../plans/023-2026-10-06-connected-story-current-tasks.md)
does not supply a native room migration protocol.

## 14. Proposed delivery sequence and acceptance

Keep the existing archive foundation work. Add these dependency-ordered
stages after the required decisions and reviews:

| Stage | Deliverable | Distinguishing acceptance |
|---|---|---|
| Disclosure and admission | Versioned payload policy, credential-safe membership protocol, exact eligible cohorts, and legacy outcome | No credential-bearing original entry or unknown schema is exported; transformed legacy state has different provenance claims |
| Native archive | Complete layout, immutable dependency inventory, writer, and progress | Exact bytes read back; lost reply, conflict, missing input, and policy refusal preserve the native prefix and explicit status |
| Room capture | Bounded discovery, head closure, payload inclusion, and pinned manifest | New creation and cross-scope races either produce a closed selection or a typed incomplete result |
| Clone and local reader | Explicit acquisition, reachability, reconstruction, browsing, and verification | Disconnect the service and open all included work from the intended clone command |
| Operational acceptance | Real eligible hosted room and a legacy control | Source, export, clone, offline view, omissions, and proof limits are compared through exact heads |

Fixtures must distinguish:

- A final issue or change from a subject omitted by a filtered list.
- A current comment from redacted, policy-excluded, and lost content.
- A captured root from one advanced during dependency closure.
- A successful validated dependency from a failed domain probe.
- A transitive child declaration from an unavailable or unsupported pin.
- A copied foreign fact from its proof dependency and trust anchor.
- A complete content record from qualified or incomplete replay.
- A successful source clone from one missing custom refs or required blobs.
- A source branch advancing during clone from the pinned checkout commit.
- A resumed capture from one that mixes heads across unnamed attempts.
- An export revoked after payload acquisition but before release from
  one already admitted for irreversible release. Neither test may treat
  an unpublished pointer as proof that no bytes were disclosed.
- A preserved unknown publication from an operation incorrectly resent.

Run offline acceptance with network access disabled after acquisition.
Verify required objects remain available after local Git maintenance.
Mutate a copied fixture's manifest, segment, text, or required object and
show the corresponding mismatch or incomplete result. Use real clone
transport and production eligibility rules for the final hosted witness.

## 15. Decisions still required

Before implementation beyond pure helpers, decide and review:

1. The exact meaning of complete content, selected historical payloads,
   and permitted redaction omissions, including admission ordering when
   export races with redaction, revocation, or policy changes.
2. The credential-safe admission protocol and complete finite initial
   export-policy cohort. No safe cohort is established by this draft.
3. Whether legacy readable snapshots are an acceptable first portability
   outcome, and who may attest to them.
4. Whether the promised user command is dap-aware clone or plain Git clone.
5. The export manifest, object reachability layout, capture budgets, and
   external trust boundaries.
6. The required treatment of owned attachments, LFS, submodules, and
   evidence that exceeds repository storage limits.
7. The supported offline reader and its exact interpretation versions.

The first acceptance target is a useful room record that remains readable
when dap hosting is unavailable. Continued collaboration after transfer
requires the separate authority design in section 13.

This draft changes no source, journal, credential, provider binding,
export permission, or builder priority. Existing archive implementation
and review obligations remain open.
