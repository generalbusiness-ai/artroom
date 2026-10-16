# A portable dap clone

15 October 2026. Discussion draft 2 for review.
Revised 16 October 2026 against main `cf07ac85b`.

Request `35ee8372`, planner promise `35f875e4`. Draft 1 was read against
main `bc95110e1`. Gap investigation: `e398c623`. Archive privacy decision:
`5eccb4e8`. The planner dependency `d553ff29` is answered by planner
decision `4cfc2230` (section 6).

This note states what a clone must contain to carry the readable state of
a dap room, and what main still lacks. It has no checker approval and
authorizes no archive writer, disclosure change or rehosting. Draft 2
marks each gap **resolved**, **partly addressed** or **open**, links to the
per-scope archive contract instead of restating it, and keeps only the
remaining delivery work.

## 1. The result a person gets

A person runs a dap-aware clone command. The result contains source code
and a named export of the room's issues, discussions, changes, versions,
relationships, rules and membership information that the export policy
permits. An installed local reader reconstructs and browses that record
without contacting the original service.

The clone names the exact histories it contains, its cutoff, content
coverage, verification results and external trusts. It does not imply
that every scope was captured at one instant. The person requests an
export through a captured set of heads, waits for it to be established,
clones source and the exact export, opens the room locally, and verifies
the record with explicit qualifications. An incomplete export is never
described as a complete portable clone; it lists what is missing.

## 2. Three promises need separate meanings

| Promise | Meaning | Scope |
|---|---|---|
| Portable record | The selected room state and its required readable content are present through named heads. | This design |
| Portable reader | Installed software can discover, reconstruct, browse and verify that record without the original service. | This design |
| Portable authority | Another host can safely continue the same room, including pending external operations. | Separate migration design (section 13) |

Content completeness and proof coverage are also separate. A complete
record may keep a replay qualification, such as an ancestry walk the
verifier does not derive again, and shows it. Private signing keys,
provider credentials, sessions and bearer secrets are never room content;
public key identities, grants and decisions about them are, where eligible.

## 3. What main has now

Each scope's journal and retained inputs live in the scope's own storage;
Git holds published files and receipts, not the histories of issues and
changes ([architecture](../docs/architecture.md)).

The per-scope archive is designed in sections 15 and 16 of the
[durability design](2026-10-09-shared-language-volatile-acts.md#15-journal-archive-in-git-amendment-12-october-2026),
landed at `b7c548866` and amended since. It copies one scope's entries and
named retained inputs to `refs/artroom/journal/<scope ID>` after the
journal commitment. It never archives detached text or private custody.
Builder request `e871ba09` holds the work as slices A0 to A5. Landed so far:

| Slice | Landed | Note |
|---|---|---|
| A0a, recorded level in the declaration | `e987350d3` | [Recorded durability declaration](2026-10-15-durability-recorded-declaration.md) |
| A1a, archive path grammar | `74384558f` | [Archive path grammar](2026-10-15-archive-path-grammar.md) |
| A1b, segment grouping and directory sharding | `bc95110e1` | [Segment grouping](2026-10-15-archive-segment-grouping.md) |
| A1c preparation, selection contract | `c3efd0d9d` (with `17be8b9b1`, `1815b3dd2`) | [Section 15.3](2026-10-09-shared-language-volatile-acts.md#153-what-is-archived) and [inventory reconciliation](2026-10-16-archive-inventory-reconciliation.md) |
| Definition-domain retained key (A1c prerequisite) | `77e570a1a` | [Retained key](2026-10-16-definition-domain-retained-key.md) |
| Invitation-key membership and v1 export admission | `f41ab63c1` | [Invitation-key membership](2026-10-15-invitation-key-membership.md) |

The archive helpers are internal and have no runtime caller
(`packages/git/src/journal-path.ts:7` names the ref prefix). No archive is
written, read or cloned. The export admission helper is
`admitArchiveExport` (`packages/git/src/archive-policy.ts:14-23`); its only
caller is its test.

The [clone command](../packages/cli/src/commands.ts) runs ordinary
`git clone` with a read token (`commands.ts:1284-1294`). The
[replay command](../packages/replay/src/cli.ts) reads only the service over
HTTP (`cli.ts:60-64`); `HistorySource` has an HTTP and a memory source and
no Git source (`packages/replay/src/source.ts:53`, `:101`). Neither
supplies the experience in section 1.

Four other landed designs affect this note:
[directory partitions](2026-10-15-directory-partitions.md) (`108aee7e8`,
section 8), [self-contained applications](2026-10-15-self-contained-applications.md)
(`40e37d853`, sections 5 and 12),
[repository import](2026-10-15-github-repository-import.md) (`162350532`,
section 11) and the [unified forge design](2026-10-15-unified-forge-design.md)
(`d5cb3123d`, section 12).

## 4. The gaps and their state on main

| Gap | State | What remains |
|---|---|---|
| Journal bytes in Git | Partly addressed | Per-scope path, segment and selection contracts exist. Inventory Source (A1c), layout and commit, writer, progress and room permission (rest of A0, A1, A3, A4) are open. A room-level inventory over all scopes is open. |
| Readable bodies and comments | Open | The archive omits text by design and lists each omission. A portable text policy and release protocol are not decided (section 5). |
| Credential-free history | Resolved for the new cohort | The invitation-key cohort keeps no bearer secret in history. Legacy membership refuses export whole. The cohort is opt-in and not yet combined with archive permission or partitions (section 6). |
| Export eligibility | Partly addressed | The v1 allowlist exists and refuses rather than omits. Only membership@6 passes; no lane or other platform definition is certified (section 5). |
| Capture completeness | Open | Partitions make discovery two-level. The room head vector, closure and budgets are unbuilt (section 8). |
| Dependency coverage | Partly addressed | Per-scope selection is defined. Cross-scope closure for foreign proofs and a sealed verification source are open (section 9). |
| Clone transport | Open | Export selection and retrieval of archive refs and objects (section 11). |
| Offline use | Open | Git history source (A2), room discovery from a clone, text resolution and a readable projection (section 12). |
| Older rooms | Partly addressed | Native-history refusal exists at the admission gate. The readable snapshot outcome is undecided (section 7). |
| Large external content | Open | Attachments, inputs held outside Git, LFS, submodules, source held only in forks, and the repository size limit (section 11). |
| Writable relocation | Open, out of scope | Unchanged (section 13). |

The archive stays useful on its own; this proposal adds a room-level
contract on top and does not move the live sequencer to Git.

## 5. Eligible contents and payload policy

**State: text policy open; eligibility partly addressed.**

A complete readable export includes the room's durable records, their
relationships, the retained content needed to read them, the exact
definitions and interpretation versions the reader needs, and the source
objects of included change versions, not only their URLs.

Once self-contained applications reach M1, install is an act in the room
and each scope's genesis pins the package's semantic id
([self-contained applications, section 4](2026-10-15-self-contained-applications.md#4-what-a-package-contains)).
The export then finds applications through install entries as well as
creation records. Each needs a generic or declared read projection; an
opaque attachment is not readable. An unknown application makes a
whole-room result incomplete or refused, never silently dropped. A Live
scope has no durable history; its exclusion is declared.

### Text is an explicit addition to the archive contract

Issue bodies, report summaries and the change lane's bodies are detached
text (`apps/room/lanes/src/issue.ts:42`, `:86`;
`apps/room/lanes/src/change.ts:54`, `:1123` and others). A digest does not
preserve their words. The archive records each text as an omission by kind and
digest
([section 15.3](2026-10-09-shared-language-volatile-acts.md#153-what-is-archived)).
This note proposes that a portable export include authorized, currently
retained text under reviewed field semantics. That changes the earlier
no-text decision for exports only. It does not add text to the background
archive or publish an existing room's discussion retroactively.

The policy states its audience, fields, historical versions and redaction
treatment before an export starts. The baseline covers current
non-redacted text of every included subject; historical text is a
separate selection. A later redaction is a named disclosure dependency.
The exporter never recovers redacted text from caches or backups; it
records a tombstone or policy omission, distinct from lost bytes. Copies
already distributed cannot be erased, and the policy says so first.

Disclosure is an explicit release decision before the first provider
object write, binding the closed inventory, audience, policy version and
attempt. Owners admit that exact release under a protocol ordered against
redaction, revocation and policy change; after release, retraction is not
promised. No object upload precedes release, because withholding a
completion pointer cannot undo an upload. Text export stays disabled until
this protocol is reviewed.

### Read permission is not export permission

Planner decision `4cfc2230` set the v1 rule: refuse the whole export, never
omit or rewrite an entry. `admitArchiveExport` (`archive-policy.ts:14-23`)
admits only `platform:membership@6` or a digest in trusted,
checker-certified configuration. It refuses other membership versions as
`unsupported-credential-cohort`, other definitions as
`unsupported-archive-cohort`, and admitted ones with custom domains or
foreign copies. No certified configuration exists on main, so the issue
and change lanes and the room's rules, destination and directory are
refused today (`packages/git/test/archive-policy.test.ts:16`). The gate's
inputs must come from a whole-cohort scan, never a caller's claim.

A field limited to a narrower audience than repository readers cannot be
copied into a readable ref; the initial design stops or offers an
explicitly limited export.

## 6. Credential-bearing histories

**State: resolved for the invitation-key cohort; legacy refuses.**

Legacy `join` and `enrol` keep an inline `secret` in the signed entry
(`packages/platform/src/membership.ts:385`, `:404`), which no archive may
copy. Planner decision `4cfc2230` chose a new cohort with no backward
compatibility, landed at `f41ab63c1`. An invitation records `inviteKey`, a
public key; the private seed travels only in the link. `join` and `enrol`
carry only `invitation` and `proof`
(`packages/platform/src/invitation-key.ts:30-33`); the proof signs the
membership scope reference, invitation and joining key, and membership
verifies it before binding (`invitation-key.ts:46-55`). The declaration
and the serving guard refuse a `secret` field, and tests find neither
seed nor secret in written history. The cohort is `register@10`,
`directory@9` and `membership@6` (`invitation-key.ts:9-12`).

The legacy outcome is fixed: every earlier membership version refuses
export whole as `unsupported-credential-cohort`. No entry is skipped,
redacted or re-signed.

What remains:

- The cohort is opt-in. `dap install --cohort invitation-key` selects it;
  omission keeps the legacy default (`packages/cli/src/commands.ts:340-357`).
- No cohort joins this membership with the archive permission still owed
  by A0, or with `directory@10` partitions (planner decision `d5c9bb62`
  gave `@9` to this cohort). A portable room needs all three (decision 3).
- `change.propose-file` keeps file `content` in the signed input
  (`apps/room/lanes/src/change.ts:829-837`); the change lane is not
  certified until that input is classified.

## 7. Older rooms need an honest compatibility outcome

**State: refusal exists at the gate; snapshot undecided.**

- **Original native history:** refuse when a required entry or dependency
  violates the policy, naming the category without echoing secret bytes.
  The gate does this for membership; an end-to-end refusal that writes no
  object is owed (stage 3).
- **Readable state snapshot:** a separately typed, sanitized artifact of
  approved current records, with source heads, transformations, omissions
  and the exporter's attestation. It is not the signed journal and cannot
  reproduce its judgments; original references are provenance only.

A partial native archive is never combined with a snapshot and labelled
complete replay. Rooms on `directory@1` to `@9` are never migrated to
partitions, so an exporter supports both directory layouts.

## 8. A captured room needs a closed set of histories

**State: open; changed by directory partitions.**

There is no global journal or atomic multi-scope read. The export
captures a vector of heads (scope reference, position, entry hash) and the
capture interval: a causally closed selection, not a wall-clock snapshot.

Under `directory@10` the root opens no lane. It keeps a list of partitions;
each partition opens lanes, tasks and applications
([partitions, sections 2 and 5](2026-10-15-directory-partitions.md#5-reads-f5)).
Discovery is therefore two-level: root, then each partition, then what each
creates. The manifest records initial and final heads of the root and of
every partition. A partition's index can be marked incomplete after a
`dropped` advisory, so index rows never prove completeness. Discovery
follows creation records. The current `roomScopes` routine
(`commands.ts:1152`) reads every row and every lane summary; it is a useful
reference, not a completeness certificate.

A refused creation differs from a created scope whose history is
unavailable. Partitions and lanes in `creating`, `refused` or
`undelivered` states stay visible as pending records. Dependencies can
require a later root, partition or membership position; heads advance only
as closure needs, and an advanced directory is scanned again. Missing
history, conflicting hashes, unsupported definitions or an exhausted
budget stop the export with a typed result, and the last completed export
is kept.

Limits apply to bytes, entries, scopes, depth, closure passes, duration,
concurrency and decoded bytes; none is lifted to obtain a success label.
Room writes continue during capture. A resumed attempt keeps its identity
and selected heads; a changed selection is a new attempt. The register is
shared and not archived to a room (section 15.1, point 3). Any required
external history or trust anchor is named with its coverage and basis,
and an unavailable dependency is never silently anchored.

## 9. Dependency inventory

**State: per-scope selection defined; room-level closure open.**

The per-scope rules are now authoritative in
[section 15.3](2026-10-09-shared-language-volatile-acts.md#153-what-is-archived)
and the [inventory reconciliation](2026-10-16-archive-inventory-reconciliation.md):
a fixed cutoff; a shared, bounded selection interface at every verifier
consumer; `replay-required` separate from `archive-closure`; declaration
closure by the native `creates()` grammar
(`packages/scope/src/definitions.ts:26`); a failed domain probe never
selected; text recorded as omission. This note does not restate them.

The archive selector deliberately does not follow foreign proof histories
or seek later tombstones. A room export adds:

- **Foreign proofs.** Each copied foreign entry brings its source history
  through the proving position, or a named trust anchor.
- **Carry-forward predecessors.** A carry-forward genesis cites the
  predecessor's position and hash
  ([self-contained applications, gap 10](2026-10-15-self-contained-applications.md#6-the-gaps));
  the predecessor through that position joins the closure.
- **A sealed verification source.** After capture, a source over the
  selected inventory refuses every undeclared scope, input or later entry.
  Final reconstruction and verification run against it, not against
  acquisition's reads.

## 10. One immutable room export selects the included bytes

**State: open.**

The room manifest names: format, room, repository and Git object format;
export identity, capture interval, and initial and final heads of the root
and every partition; each scope's reference, selected head and exact
archive commit (per-scope layout as in
[section 15.4](2026-10-09-shared-language-volatile-acts.md#154-layout));
source commits and object closures of change versions, apart from the
checkout commit; definitions, interpretation versions, and applications by
semantic id, release id and adopted presentation; the dependency
inventory and payloads; policy version, audience, disclosure heads, safe
omissions and external facts; and separate completeness and verification
results with their trusts.

The export is validated before a discoverable completion pointer moves,
and readers never resolve a scope's latest ref after selecting it. A
possible ref is `refs/artroom/exports/<root>/<export-id>`. The export
commit makes every required object reachable through Git edges with
bounded fan-out, not only IDs in JSON
([Git object model](https://git-scm.com/docs/gitdatamodel.html)). A lost
reply follows the read-back rule of
[section 15.5](2026-10-09-shared-language-volatile-acts.md#155-the-writer).
A ref advertisement does not establish possession of source objects;
acquisition verifies the closure under its bounds.

## 11. The clone must fetch the export and contain its payloads

**State: open.**

The proposed command is a **dap-aware clone**: an ordinary checkout plus an
explicitly selected export. Ordinary clone does not fetch custom refs
([git clone](https://git-scm.com/docs/git-clone)), so the command fetches
the exact export under an explicit refspec, validates it, keeps its ref
and checks out the selected source commit, showing any newer branch as a
difference. If plain `git clone` must carry room state, the layout must
sit under normally fetched refs, such as a metadata branch (decision 5).

Required payloads must be in the clone; a storage URL is not a copy. Four
sources need explicit inclusion classes:

- **Owned attachments and evidence**, included by digest in bounded
  chunks, or the export does not claim complete inclusion.
- **Retained inputs held outside Git.** The import design keeps raw
  captures and large inputs in object storage and lets replay resolve them
  by domain and digest
  ([import, section 3](2026-10-15-github-repository-import.md#3-storage-and-execution)).
  A required input of that kind must be copied, not referenced.
- **LFS and submodules.** A pointer is not its target bytes
  ([forge, section 4.5](2026-10-15-unified-forge-design.md#45-versioned-source-exploration-and-comparison)).
- **Source held only in agent forks.** Change history can name commits of
  never-merged work whose only copy is a fork
  ([hosted agent teams](2026-10-15-hosted-agent-teams-design.md)). The
  export includes that closure or names it missing.

The hosted repository is limited to 1 GB and each blob to 32 MB
([import, section 4](2026-10-15-github-repository-import.md#4-limits-are-part-of-admission)).
Archive refs, exports and payloads share that budget with source, so a
complete export can be unavailable; a fallback to an outside store never
quietly weakens the promise. Ordinary hyperlinks stay links.

## 12. The offline reader reconstructs without executing room work

**State: open; aligns with self-contained applications M2 and the forge
read model.**

The reader validates the pinned manifest's objects, paths, sizes, modes
and coverage. It reads committed objects through the untrusted Git source
of [section 15.7](2026-10-09-shared-language-volatile-acts.md#157-the-verifier)
(slice A2), never a working tree, and runs no hooks, code or recorded
operation. It folds each history through its head, resolves text under
the export policy, and shows issues, discussions, changes, versions,
reviews, jobs, rules and relationships with their original references.

It uses each application's declared read projection, or the generic
interface that needs no package code
([self-contained applications, section 5.1](2026-10-15-self-contained-applications.md#51-the-presentation-trust-model)).
It never runs package screens. Lists state coverage with the
[forge read model](2026-10-15-unified-forge-design.md#44-coherent-captured-views-refresh-and-coverage)
states: absent, not loaded, stale, denied, unsupported, redacted,
unavailable. Unsupported interpretation stays visible. The
[replay view](../packages/replay/src/view.ts) is a folding foundation, not
this reader. Integrity, reconstruction and full replay are separate
results; a cached projection is never proof. The reader never contacts the
old service, restarts delivery or acts as that service.

## 13. Writable rehosting is a separate contract

**State: open; out of scope.**

Continuing a room on another host needs writer ownership, old-service
fencing, incarnation treatment, membership authority, new provider
bindings, credential replacement and reconciliation of pending operations.
The archive excludes custody rows that tell an unsent operation from one
whose reply was lost (`packages/scope/src/store.ts:36-47`), so a portable
record is not a resumable checkpoint. Carry-forward (self-contained
applications M3) moves rights between scopes on one host only.

## 14. Remaining delivery sequence

Section 3 lists what is done. Remaining stages, in order; each Source
stage runs its focused tests and the gate once before review.

| # | Stage | Owner | Acceptance witness |
|---|---|---|---|
| 1 | Decisions 1 to 5 of section 15, as a revision of this note | Planner; checker reviews | Approved note revision naming the text policy, cohort composition, legacy outcome and clone form |
| 2 | A1c inventory Source: shared selection interface at every verifier consumer (request `02252148`) | Builder | The two-step fixed-cutoff witness of the inventory note; a later turn's input is never read; text omission, missing input, unsupported cohort and ancestry incompleteness stay distinct |
| 3 | Rest of A1: manifest, deterministic layout and commit, real local Git read-back, admission gate called before body selection | Builder | Same manifest gives the same commit twice; legacy membership refuses end to end and writes no object |
| 4 | Initial export certification: exact lane and platform digests, and classification of inline inputs such as `propose-file` content | Checker certifies; planner decides scope | Reviewed certified configuration; an uncertified pin still refuses |
| 5 | Rest of A0 in one new-room cohort: archive permission, `archive-unavailable`, level in discovery, joined with membership@6 and, once its Source lands, `directory@10` | Builder, after partition prerequisites | A room under the cohort refuses a legacy join, refuses an archived scope without permission, and keeps every existing digest |
| 6 | A2 Git source, A3 writer, A4 read and client | Builder | The witnesses of section 15.9 |
| 7 | Room capture and export manifest: partition-aware discovery, head vector, foreign and predecessor closure, payload inclusion, sealed source | Builder | A creation or cross-scope race gives a closed selection or a typed incomplete result; a `dropped` index does not hide a lane |
| 8 | Text release protocol, only if decision 1 adopts it | Planner design; builder Source | An export revoked after acquisition and before release uploads nothing; an admitted release is not retracted |
| 9 | Dap-aware clone and offline reader, using declared projections or the generic interface | Builder, after self-contained applications M2 projections | With the network off, open every included subject from the intended clone command; local Git maintenance keeps every required object |
| 10 | A5 and operational acceptance: a hosted eligible room and a legacy control | Builder runs; checker reviews | Source, export, clone, offline view, omissions and proof limits compared through exact heads |

Stages 2, 3 and 6 are the archive's own A-series and stand without this
note. Stages 5 and 7 need partition prerequisites C1, D1 and the `dropped`
answer ([partitions, section 10](2026-10-15-directory-partitions.md#10-prerequisites-owed));
C2 landed at `23f156706`. Stage 9 needs self-contained applications M1
(install entries, semantic ids) and M2 (projections); M3 adds the
predecessor closure of section 9.

Fixtures for stages 7 to 10 must distinguish: a final subject from one
omitted by a filtered or dropped index; current text from redacted,
excluded and lost text; a captured root or partition from one advanced
during closure; a copied foreign fact from its proof and anchor; complete
content from qualified replay; a full clone from one missing custom refs,
outside inputs or fork-only commits; a resumed capture from a mixture of
attempts; and a preserved unknown publication from a resent operation.
Mutating a fixture's manifest, segment, text or object gives the matching
mismatch or incomplete result.

## 15. Decisions still required

Decided since draft 1 and dropped from this list: the credential-safe
admission protocol (`4cfc2230`, landed `f41ab63c1`); refuse rather than
omit for v1 export (`4cfc2230`); the per-scope selection boundary and
declaration-closure purpose (checker `78127fe6`, planner `191d8dec`).

Still required, in the order stage 1 needs them:

1. **Text.** Whether a portable export includes current text, which
   historical versions, which omissions redaction permits, and how release
   is ordered against redaction, revocation and policy change.
2. **Initial certified cohort.** Which exact lane and platform definitions
   are certified first, and how inline signed content such as
   `propose-file` is classified.
3. **New-room cohort.** One cohort joining membership@6, archive
   permission and `directory@10`, and whether it becomes the install
   default.
4. **Legacy outcome.** Refusal only, or a readable snapshot as well, and who
   may attest a snapshot.
5. **Clone form.** Dap-aware clone or plain `git clone`.
6. **Export layout.** Manifest, ref spelling, reachability, capture budgets
   and external trust boundaries.
7. **Large content.** Treatment of attachments, inputs held outside Git,
   LFS, submodules, fork-only source and the 1 GB repository limit.
8. **Reader.** The supported interpretation versions, and whether
   application packages travel in the export or are resolved by URI.

The first acceptance target is a room record that stays readable when dap
hosting is unavailable. This revision changes no source, credential,
permission or builder priority; it ran no tests.
