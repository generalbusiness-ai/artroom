# Shared room names and room-issued version labels

9 October 2026. **Proposed design Source; no protocol or runtime adoption.**
Request `576411c5ffd3ef7d8862134209f130539e82e2e8`, promise
`f7946f7b24f51046717487b6b2c9a6462aa03a79`. This makes planning report
`32c28687569ebfeb46a3f1cb6ab45fcdc00c1e35` precise, with directions
`a2537179e00d77e866ccea9675991945a638efd5` and
`3ddeeaff1350a077ffa1fc1a818e9b738d716ad8`. Independent design/authority
review and planner adoption precede implementation. Existing C1/A1 approval
supplies no approval for this contract.

## Identity and exact naming rows

The room remains its full directory reference and recorded register/claim,
membership, rules and destination relationships. Repository identity/name,
branch, refs, URLs and signing targets never change because of a display name.
Current directory@1/@2 have no shared-name row; Page `Room.name` reads the
fixed generated repository name. A local label is personal browser state.

Proposed supporting directory:

| Noun/verb | Exact contract |
|---|---|
| `room-profile` | At most one live item; initial/nonfinal state `open`; no parties or refs; mutable required text value `displayName`, set by its opening act. No close/delete act. ID is its opening entry's sequence, not a guessed constant. |
| `name-room` | Signed **open** act on `room-profile`, fields `{name: text}` required; grant `room.name`; no `also` subjects. Native count of open profiles must be zero (`profile-exists` guard otherwise). Opens only that item and sets `displayName` from the validated field. No expected profile revision is fabricated for an absent item. |
| `set-room-name` | Signed **transition** on the actual open profile, same required name/grant; `expected.on` is the authenticated sampled profile revision. Changes only `displayName`; no provider operation, send, rename, relationship/key change or unrelated repository-revision dependency. |

Directory genesis already opens `repository`. Core allows **one item per
entry**, so the earlier proposal to also open a profile at genesis is withdrawn.
Supporting rooms begin authoritatively **unnamed, profile uninitialized**.
An ordinary Name room task chooses `name-room` only after a complete authorized
read proves absence, or `set-room-name` for the actual existing profile.
The first profile opening carries the requested name in one signed entry;
no empty initializer plus second mutation is required. An unknown opening
never becomes a fresh transition merely because another read finds a profile.

Name validation is identical for both rows: valid Unicode scalar text, at most
256 UTF-8 bytes, one line, no C0/DEL controls or U+2028/U+2029. The signed value
must equal ECMAScript `trim()` of itself; no normalization or truncation.
The UI rejects invalid scalars/controls, caps its raw draft at 512 UTF-16 units,
shows the trimmed proposal for confirmation, and sends only that value.
Native checking rejects more than 256 UTF-16 units before encoding, then checks
the UTF-8 bound. The whole existing request/entry limits still apply.
Empty canonical text means clear/unnamed. Clearing an already absent profile
or saving unchanged text needs no ordinary UI submission. Duplicate names
are allowed and disambiguated by repository/short room ID. Render with inert
DOM text, isolated bidirectional text and wrapping, never as markup/selector/URL.

## Authority and observation window

`room.name` and the separate label action `site.name-publication` are proposed
new membership action names. New supporting membership defaults give both
only to admin. Deliberate existing `set-actions` replaces a role's complete
list under `membership.manage`; it can delegate either action to **any native
role**, including agent/checker. There is no human/agent authorization predicate
and no inference from account/email, repository access or a personal label.
Agent/controller and other native grant conditions remain unchanged.

Directory grants resolve the actual recorded full membership reference and
observe the signing key's active member/key/actions and scope filter. Pure
naming/label acts have the current **ordinary 300-second, run-local reusable**
window (`windowOf`), not the ten-second hold/export/check window. Commit checks
use the directory clock, full reference, retained observation and nondecreasing
membership heads. No observation cache survives restart. Observed retired/
compromised keys or removed members stay revoked for that run; an unavailable
read can use only a still-valid existing observation under the existing guards.
Role/action changes are judged when observed; this contract promises neither
instantaneous revocation nor a fresh membership read before every POST. A
stronger window needs separate authority adoption, not a fake hold effect.

A Page read-session or cached offered control permits no mutation by itself.
A stale UI can be natively refused. No hidden automatic privilege addition
is made to an old roster or old pinned membership.

## Read and outcome grammar

Existing authenticated directory summary/entry/history reads expose the new
item under the supporting pin. A complete sampled read records full directory
and membership refs, profile ID/revision/opening fact, name and head/time.
Page separates `sharedName`, `repositoryName` and `personalLabel`; it refreshes
the cached Room projection on naming, return/focus/status recovery. Sampling
is not a watch or an authority lease.

| Observation/result | Presentation and continuation |
|---|---|
| Supporting pin, no profile | Unnamed room; profile uninitialized. Name room is available only under actual held authority. |
| Profile with empty value | Unnamed room; cleared at the sampled revision. |
| Unsupported old pin | Shared naming unavailable for this room; repository/ID fallback. Never synthesize a profile. |
| Failed/partial/unauthorized read | Current name unavailable. A retained sample may say Last read name with its head/time; no sample uses room ID. Never convert unreadability to unnamed or a personal label. |
| Accepted naming, refresh failed | Name recorded; current read unavailable. Keep the known receipt before refresh. Proposed text is not presented as a newly observed current value. |
| Definite refused submit | Preserve reason/`judgedAt` and draft. There is no rename receipt/history entry for that refused act; independently drained work may still have written entries. |
| Lost/malformed/unavailable/mismatch after delivery | Naming outcome unknown. Retain the exact original operation/envelope; no replacement signature or optimistic current name. |

Two profile-openers race: one opens the item; the other receives the real
count/guard refusal and retains its text. Two renames read revision r: first
admission moves it; second is `revision-moved`, not last-write-wins. A deliberate
fresh read/compare/confirmation is needed for a new known-refused task.
An unknown task stays unknown even if a different name appears. Exact retry
returns the original accepted result where native settlement proves it;
not-found/read failure is not terminal absence. Native replay derives accepted
names from the pinned definition, effects and retained grant; client refusal
and known-answer records are not invented native history.

The bounded naming adapter must retain exact signed opening/transition bytes,
context and the whole known answer before any awaited refresh. Bind origin,
full directory/profile, membership/member/key, expected revision and frozen
name. Check context immediately before delivery; double click/navigation
must not sign another intent. Current generic Page submission does not expose
that envelope, so this custody integration remains required under C4/188153.
Durable reload/cross-device recovery uses that owner's private journal/key
reference, never a generic outbox or secret-bearing public evidence. Founding
and naming have separate results: failed/unknown naming never refounds a room.

## Local verified room selection

Only actual retained/enrolled contexts on this origin may enter a bounded
local selector. A pasted config/invitation or matching display name is not
proof. Capture the full directory reference from authenticated Summary.scope,
full membership reference, verified member and public key ID, actual register
provenance, sampled names and an existing **credential reference**. Current
Page's raw-secret Settings is a custody baseline, not permission to copy keys
into a catalog. The reviewed C4 credential interface must supply selection.

Proposed cap: 64 retained contexts. Revalidate origin/full refs/current key,
native directory→membership relation, active enrollment and successful local
selection persistence before publishing a new view. Denied/full/inaccessible
contexts remain explicit; never evict unresolved tasks to add an entry.
Keep queries/drafts/known/unknown operations bound to their original context.
There is no global/cross-device catalog or automatic cross-origin selection.
Personal labels are secondary and never auto-published during claim/join,
migration or selection; copying one into a shared-name task is deliberate.
Shared names remain authenticated metadata; public Site disclosure of them
requires a separate decision.

## Room-issued version-label appendix

A1 owner `6ec330fda2e3337b6626683bbe5c6ee024d33e38` retains immutable publication
selection/Git correspondence. This appendix coordinates one directory successor;
it creates no competing selector, provider tag or publication authority.

`version-label`: many, provisional max 64, initial/nonfinal `named`; no retarget,
withdraw/delete or reuse act. Keeping every record live preserves slug
reservation and lifetime count; a final-item max would not bound retained labels.
Fixed values: `slug`, canonical selected `commit`, optional `displayText`,
`proofDigest`; fixed refs: full destination, judged publication/first-head fact
and written-receipt state fact; fixed issuer party comes from the actual grant.
Creation fact is derived from directory/fullref + item ID + opening hash,
not supplied circularly by the client. Exact repository identity and receipt
objects/file are in the retained proof bundle, not caller assertions.

`name-publication`: signed open act, grant `site.name-publication`, required
slug/commit and optional display text. It opens one label in its own entry,
only when no retained label has that slug and a fresh native publication proof
matches the directory's actual destination/repository/commit. The native
bounded uniqueness/count decision serializes racing issuers; there is no
invented singleton revision for a new label. Exact retry returns its original
result. Another mapping needs another unused slug, never overwriting old bytes.

Slug: lower ASCII 1–64 bytes, `[a-z0-9][a-z0-9._-]*`; reserve HEAD/versions
case-insensitively and complete 40/64-hex object spellings. `version~<slug>` is
the explicit proposed Site selector; canonical object IDs keep their own
precedence. Nonunique optional display text uses the same 256-byte/scalar/
single-line rules as names, but neither it nor slug is a shared room name.
Only already-eligible published content may be named/disclosed. No draft,
private backing branch, arbitrary ancestry or host-advertised tag gains access.

### Required native publication observation and replay contract

Current A1 `sitePublishedCommit` is an **internal Site RPC**, not a rule API.
The following native observation extension is a proposal requiring explicit
authority/contract adoption and implementation before `name-publication`:

- Request: full destination `of`, full requesting directory, exact selected
  commit, `asked: publication-proof`. The acting directory resolves destination/
  repository from its own recorded relationships; caller cannot choose them.
- Answer: subject `publication`; exact `of`, destination definition/head,
  directory, stable repository descriptor, selected commit; judged publication
  or first-head FactRef; written receipt FactRef; receipt ref/commit/tree/blob
  and canonical receipt file; digest of a bounded proof bundle. The observer
  adds its own read-start `at`; the peer cannot claim that start time.
- Source: destination's actual active SQLite snapshot, with same-room full
  references and actual native judged publication/written receipt derivation.
  Reuse A1's derivation semantics only after adopting this separate observation
  interface. No provider call, dispatch, credential mint or native effect.
  Current RPC access does not imply public/anonymous observation authority.
- Admission: exact shape/pin/refs/repository/commit/fact hashes and receipt
  derivation are checked; current clock is checked after awaited work. Use one
  fresh observation for one commit, **10-second once window**, with monotone
  destination heads. This is a NEW nonmembership observation form/window;
  it does not change the 300-second membership grant or pretend current forms
  already support it. Missing/partial/over-budget proof is unavailable,
  not not-published. Not-published requires completed bounded native selection.
- Retention/replay: accepted label input retains the typed observation/read
  run+number/use and a digest-bound canonical bundle of exact native fact copies
  and receipt bytes needed by the derivation. Replay checks bindings, hashes,
  proof derivation, window/commit time, head order and one-use. Like existing
  observations, actual source/read timing retains explicit runtime
  `trusted: observation-read`; self-consistent caller JSON is not source proof.
  Missing retained bytes yields incomplete replay, never eligibility.

Implement native observation types/strict guards/resolver/retained-value domain,
row forms and replay checks together. Which exact closure bytes can be retained
within configured Core budgets must be settled before runtime commissioning;
this is the remaining native seam, not permission to bypass it with Site RPC.

Label lookup/list is a bounded internal directory read for Site: fullref/head,
item/revision/creation fact and proof reference; proposed 16 rows/page and 64-row
lookup scan. Cursors are bound to one head; movement requires restart, never
false completeness. Site resolves label, rechecks native publication eligibility
and the existing stable-repository/receipt/fetched-Git correspondence **before
304**, just as before a body. Its public response follows existing Site policy;
it reveals no new private scope data. Old pins return unsupported for version~,
never provider-tag fallback. Read errors/limits are unavailable, not absent.

64 names, 16 rows, bounded scans and 1MiB aggregate input are **provisional
maxima**, not adopted capacities. Current proposed Core entry bound is 256KiB,
with 128 foreign uses; the whole canonical entry/grant/observation/reference
budget and separately retained bundle must fit actual configured limits.
Size probes precede decode/allocation; do not truncate necessary provenance.
If proof does not fit, refuse/unavailable and narrow the contract with owners.
No eviction/reuse or larger Core limits are authorized by these numbers.

## Pinned closure, migration and implementation handoff

Reserve the following **proposed** combined cohort, held until B8's exact @3
source is reviewed/landed and this design independently reviewed/adopted:

| Pin | Required change/dependency |
|---|---|
| register@4 | Creates directory@4 explicitly; retains all shipped register pins/bytes. |
| directory@4 | Extends the reviewed B8 directory@3; adds profile/open/rename and labels/proof observation/read compatibility, without changing existing repository identity. |
| membership@3 | New initial admin action list adds room.name/site.name-publication; old @1/@2 lists unchanged; existing set-actions/delegation semantics retained. |
| rules@2, destination@3, inbox@1 | Explicit sibling closure from reviewed B8, not a newest alias. Destination observation extension needs its own reviewed ABI/authority closure; if it changes pinned native semantics, select a new destination/cohort pin before adoption. |

No exact new byte digests are asserted before native byte generation/validation.
Inventory: platform directory/register/membership/version maps and new rules;
contract observation shape/retained domain; derive validator/grant-window/
observation/replay; Scope native resolver/reads/retention; CLI/client typed
naming/recovery; Page separate-name projection/cache/task/selector; A1 label
lookup/selector/provider correspondence. Reuse existing signed reads,
expected revisions and grants. Runtime reviewer must verify full source/pin
closure and configured-budget fit, not just this list.

**Existing-room migration remains owed.** Old @1/@2 and future shipped @3 pins
have no profile/label attachment or upgrade verb; never rejudge old entries
under @4, overwrite old bytes, replace the directory or re-found its room.
The smallest missing migration contract is an authoritative, once-only
profile/label-namespace attachment/discovery tied to the same legacy full
reference and membership: exact old pin/head, authorized current administrator,
unique attachment subject/revision, explicit new metadata authority/refs and
accepted proof. It must preserve the legacy scope ID/incarnation, repository,
branch, relations, history and unknown operations; concurrency/unknown outcomes
must retain the original request. A local config pointer is insufficient.
No current API implements that linkage. Native/authority owners must separately
choose/review its storage, resolver and replay form before existing-room support.
Until then the first release is new-supporting-room-only and honestly unavailable
on old pins; the original existing-room obligation is not closed.

Planner/native authority owners adopt rows/defaults/windows/observation/schema/
closure/migration; builder implements only after commissioning; C4/188153 owns
private credential and interrupted naming/selector continuity; A1 owns native
publication/Git proof and named selectors; R3 retains broader authority/freshness
guarantees. Two enrolled devices must independently read the same native name
with their own keys. Old-room migration, reload/unknown recovery, revoked access,
public/private disclosure, physical phone/AT and deployed continuity retain their
own complete acceptance; neither a local picker nor this note satisfies them.

Acceptance must distinguish: first-name races and later revision conflicts;
clear versus unavailable; sampled cache versus native authority/window expiry;
admin default versus deliberate delegated agent/checker; old-pin byte identity;
wrong room/incarnation/repository/receipt; label never-retarget/never-reuse;
missing/oversized proof and incomplete replay; lost accepted reply preserving
exact bytes/known answer; two-device reads and selector refusal without secret
copying. Use focused native Scope/SQLite/HTTP and replay witnesses, then current
UI/device evidence and one coordinated implementation gate when commissioned.

Source baseline: main `f6d80b3996df7ad3e7d00feff88d48cf29877ddc`. Targeted static
reads: directory items/genesis, membership role/set-actions/standing, platform
version maps, derive grant/effects/fold, Scope authority/core/read boundaries,
Page data/context and client expected/settlement. A1 proof helper at unlanded
`590c09d7` is dependency evidence only. No runtime import/execution, source
implementation, tests/gate, provider operation or design adoption occurred.
