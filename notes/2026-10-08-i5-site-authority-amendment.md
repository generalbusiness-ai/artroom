# I5 site authority: configuration, publication and renderer delegation

2026-10-08. Proposed exact owner amendment under existing gitseq request
`a2317893c5728e29cffb14f78439e3ad506fb56a`, following planner direction
`ad796ce00accd758cd6e8f46aa20f2df2ec9feb9`, read in full. Working branch
`request/i5-site-prep`, source checkpoint
`94ad3870a1a361c9b122b0df842b530940efe7d6`; current main read at
`cf4e41e295f1fb8e0e4eb32babc5fd9a0d956656`. The exact f60 native interfaces
were independently reviewed and adopted by
`fbb9143e5a6f3b577f05f0ee3aec68e60e96cd0d`, read in full. That adoption is
not implementation, source approval or enablement. This successor changes no runtime, tests,
keys, configuration or provider state and adopts no new protocol fields.

Transition revision following planner direction
`31fa6919e4e61a614ef8879f6138fadf5d6879e4`, read in full. Committed
predecessor `f60f56054675b4428d3664e3d853053d6de7da2f` remains unchanged.
This amendment is a proposed successor for normal full DESIGN review after
Root reading. The attachment direction is selected; its creation, binding and
authority schemas remain proposed successor owner amendments before code or
enablement. The added `authority` field changes the canonical bytes of the
f60 configuration/delegation schemas; successor review must cover that exact
change, not assume it was adopted with f60. Those schemas have not shipped;
no automatic domain-number change is proposed, but the owner must decide
their final identity/byte contract. Unused @3 and attachment allocations
remain proposals pending verification and adoption.

Pending-opt-in recovery follow-up within the same 31fa amendment owner:
frozen review subject `4de373d6c439d5f4e4aa1381d2da653b1495ef9f` remains
unchanged. The recovery interface addition below is a proposed repair for
normal successor review after Root reading, not adoption,
implementation or a duplicate task.

This draft also answers both P2 findings in the full formal verdict
`ad33b64583f6696ebe75895f13feea2c430e1e9d` and planner disposition
`88cd7081bcec9ac54fca0670e4d7b46539825353`, both read in full. Their
current-selection and known/ambiguous pending recovery boundaries are
incorporated below; new factory/signature fields still require successor
normal review before code. No frozen review subject is edited in Git.

The planner has adopted the product direction: site visibility is distinct
from repository visibility; explicit public or members policy, absent deny;
durable Room authority controlled by `rules.publish`; a distinct renderer
service principal with an exact-repository read credential; and only proved
published commits. Retained native interfaces below follow f60 adoption;
their changed fields and the attachment/factory/discovery interfaces remain
proposed successor amendments, not claimed existing support. Filing remains after
read/clone in the existing site request. No generic application registry,
Worker room allowlist, human-key reuse or new task is proposed.

## Actual source boundary

| Source read | Existing behavior and limit |
|---|---|
| `packages/platform/src/rules-scope.ts`, on main and site prep | `publish` takes approvals, ownerMayReview, checks, labels, extents and optional singleControllerException; grant `rules.publish`. It sets those slots and `rules.published` to its own fact. There is no site field or configure act. |
| Same file, `keep-configuration` and `configuration-bytes` | Immutable checker configurations, domain `artroom-check-configuration-1`, with a required `image` digest. This is not an application/site configuration API; inserting site bytes there would reinterpret checker semantics. |
| `packages/contract/src/scope.ts`, `observation.ts`, `session.ts`; `packages/derive/src/grant.ts` and `judge.ts` | Ordinary Grant subject and principal are MemberRef; membership-derived grantFrom sets principal:null. Custom platform grant marks can pass a key with no member, but no site delegation rule or service-principal grant is supplied. Sessions authenticate a membership/member/key and named reads; they are not renderer credentials. |
| `packages/platform/src/membership.ts` | Person/agent/checker membership and role action lists, with membership.manage enrollment. No renderer service registration or bounded site delegation is implemented. Older protocol prose about delegation is not active new-model implementation evidence. |
| `packages/platform/src/destination.ts`, `destination-objects.ts` | Publication and first-head judgments open receipts. Receipt objects derive exact commit/ref/file bytes from recorded facts. No site-issued renderer mint/read lifecycle is defined. Host refs alone do not prove those judgments. |
| `packages/scope/src/credential-store.ts`, `operations.ts`, `destination-host.ts` | Private custody is scoped by complete ScopeRef, mint operation and attempt. A judged mint makes matching metadata live; explicit confirmed revocation drops plaintext. Dropping plaintext is not provider revocation. Existing outside driver/attempt and cleanup machinery can be reused after exact new owner rules are adopted. |
| Site prep `site/host.ts`, `site/route.ts` | Hardened stable host identity, expiry and close behavior remain partial preparation. Route still declares every site public and follows host branches/tags. Neither room policy nor a room-issued renderer principal/delegation is present. |

Site prep predates main's strict `43d` birth/session preparation and typed
retained-resource signature changes. Its directory/rules definitions also
lack main's newer value places. Integration must retain current main's exact
full-reference, typed eligibility and final post-await checks, not replace
them with the older preparation files. This note read the relevant schemas,
grant/session, receipt and custody boundaries, not every implementation file
in their entirety.

## Narrow proposed rules authority

For a future room with the proposed new native rules/destination identities,
keep ordinary `publish` and checker `keep-configuration` meanings unchanged.
Add the site-only delegation/configuration acts and explicit disable
transition to the next rules version; none exists today. All require a fresh
current `rules.publish` grant in this room, with
the existing exact membership and revocation/freshness checks. Renderer keys
cannot exercise this controller authority.

**`delegate-site-renderer`.** Opens an immutable `site-delegation` item from
canonical bytes in proposed domain `artroom-site-delegation-1`. Fields:
`digest` (required value place), with `expected` naming the current rules
revision. Bytes have exactly:

```
{ v:1, authority:ScopeRef, directory:ScopeRef, membership:ScopeRef, rules:ScopeRef,
  destination:ScopeRef,
  repository:{ host, namespace, name, id },
  renderer:{ installation:Digest, key:KeyId },
  actions:["repository.read"], notAfter:Timestamp }
```

The guard resolves exact confirmed room births and the stable destination
repository; all references must match, including incarnations and provider
ID. Repository names/URLs alone are insufficient. The renderer installation
has a separately registered service key, with authenticated service
installation/key-custody evidence; it cannot be a human device key or an
operator signing key. Its key must not be enrolled in the room's membership.
Require that check again before using the delegation. Off-record key custody
and installation identity need operator/security-owner evidence; a public
key's bytes alone cannot prove who holds its secret.

The item holds immutable digest/expiry/principal/repository fields and its
issuing fact. No plaintext credential is in these bytes. The fact of this
act is the delegation reference used below. This uses two acts deliberately:
a configuration can cite an already sealed delegation without a circular
self-reference or a value containing its own digest.

**`configure-site`.** Opens an immutable `site-configuration` item from a
required digest/value place in proposed domain `artroom-site-configuration-1`;
`also.rules` selects the sole current rules item. `expected` names that
item's current revision, so concurrent replacement is refused under the
existing revision rules. Optional `previous:FactRef` must equal the current
site pointer, and must be absent for the first configuration. Canonical
bytes have exactly:

```
{ v:1, authority:ScopeRef, directory:ScopeRef, membership:ScopeRef, rules:ScopeRef,
  destination:ScopeRef,
  repository:{ host, namespace, name, id },
  audience:"public"|"members",
  versions:{ mode:"latest-published", ref:"HEAD" }
        | { mode:"pinned-published", commit:ObjectId,
            publication:FactRef, receipt:FactRef },
  rendering:"site-safe@1", delegation:FactRef }
```

The guard verifies whole bytes, exact room/repository bindings, unexpired
delegation, matching renderer installation/key and solely repository.read
rights. Only the named safe rendering profile is accepted. A pinned version
must already satisfy the publication proof below. Unknown fields/policy,
missing bytes/proofs, conflicting incarnation, unsupported profile or
unavailable authority refuse; they never select a default public policy.
Domain sizes, retained-item and operation reservations are bounded by the
existing capacity owner; no numeric readiness claim is made here.

The item keeps fixed digest and declaration bytes. Its immutable revision is
the `configure-site` FactRef (scope/incarnation, sequence and hash), not a
Worker setting or a repository flag. In the same commit the rules item gains
local fact slot `siteConfigured`: as existing own fact slots do, it stores
the local entry position. Typed reads materialize its complete FactRef from
the exact owner ScopeRef and stored entry hash. Previous-fact comparisons
must verify that materialized fact, not compare a full FactRef to a local
number. Reconfiguration creates a new item
and causal fact; previous items/bytes remain unchanged. Existing `published`
and revisionOf for ordinary rules publish retain their meanings.

Proposed `disable-site`, also requiring rules.publish and an exact expected
current revision, clears `siteConfigured` in a recorded entry and schedules
cleanup of issued site credentials. A missing pointer then denies rendering.
Removing or superseding a configuration never erases prior delegation facts,
pending mints or cleanup duties. This explicit disable is a site-only
transition, not an extension of checker configuration or a registry of apps.

## Selected legacy transition: one site-only attachment

Legacy D/M/R/G below are the **existing complete** directory, membership,
rules and destination references, including incarnations. They and their
actual semantic bundles remain unchanged. An opt-in creates independently
versioned site authority A, proposed `platform:site-authority@1`; it does not
create a replacement Room or make D/R/G emit a new act. The common schemas
above now state `authority`: R for the proposed native new-room path, A for
this attachment. Their `rules` field remains the actual existing R in both
paths. Configuration/delegation facts belong to `authority`, never to a
fabricated old R entry.

The proposed immutable Room binding is exactly:

```
{ v:1, service:ServiceId, directory:D, membership:M, rules:R,
  destination:G, repository:{host,namespace,name,id},
  births:{directory:FactRef,membership:FactRef,rules:FactRef,destination:FactRef},
  bundles:{directory:BundleId,membership:BundleId,rules:BundleId,destination:BundleId} }
```

Births must be the verified applied genesis facts of those exact references,
with directory confirmations of its actual children, and the destination's
recorded stable repository. Historical bundle IDs require the adopted exact
source/genesis/build correspondence; same legacy @1 text alone is not that
proof. Unknown provenance keeps site denied and existing records/duties held.
The repository's provider/namespace/ID match the actual bound host; no
repository name, URL, arbitrary `room.json` or operator ref selects a Room.

### Opt-in creation and authoritative discovery

Proposed site-only interface `attachSite(signedOptIn, roomProof)` receives a
SignedIntent-shaped request: `to:null`, actor the controller key, kind
`attach-site`, `expected:{binding:epoch}`, fields containing the whole
bounded inline Room binding, attachment definition and, for replacement of
an existing site-authority selection, its previous binding revision digest.
`notAfter` and idempotency identity retain their normal signed meanings.
The binding-epoch expectation is an explicit new factory semantic, not a
claim that the existing ScopeApi item-revision checker owns this slot.
The inline record avoids pretending that current founding already accepts
a new digest/value place beside a genesis. This is a **new explicit site
factory contract**, not an existing ScopeApi method.

`authorizeSiteController(key, binding, action="rules.publish")` resolves the
actual historical R/M implementations and reads current exact M standing
and applicable R authority. It checks the real current permission to publish
that Room's rules, signature, expiry, revocation/freshness and all full birth
references. It does not equate the word "admin" or a copied grant with that
permission. Ordinary Grant.within still has its original meaning. A new
site-only controller mark maps that verified R permission to only this
attachment's opt-in/delegate/configure/disable acts under the owner amendment;
it does not silently expand an old grant to unrelated scopes.

There is one durable **site-only binding slot**, keyed by stable service ID
and complete D, with a monotonically increasing epoch. It is not a Worker
allowlist or a generic application registry. Proposed immutable binding
decisions contain Room binding digest, selected authority ScopeRef and exact
definition, its applied genesis FactRef, opt-in intent digest and controller
proof and recorded admission time, previous binding revision (absent initially),
and epoch. The revision
digest uses proposed canonical domain `artroom-site-binding-1`; the decision
contains no self-digest or credential. The factory's authenticated receipt
binds that revision and current epoch. This record is not falsely presented
as an old scope's FactRef.

The slot verifies current controller authority and compare-and-swaps the
expected epoch/previous revision, recording a durable pending creation
before admitting A's genesis. A's proposed seed has creator:null, kind:site,
definition:platform:site-authority@1, cause equal to the exact opt-in intent digest,
ordinal:0. Thus its creation claims no nonexistent D send. A's genesis
retains the signed opt-in, immutable binding and verified authority/birth
proof. The slot selects A only after its exact applied genesis is verified;
its completed binding decision and receipt retain that causal reference.
Unknown creation stays pending and grants no site access. Retry settles or
continues the same request/seed; it never creates a different candidate on
an ambiguous answer. A competing request cannot replace that pending epoch.
After creation the controller's authority is rechecked before selection;
loss of authority leaves records retained and site unselected/denied.

### Pending opt-in settlement and current-controller recovery

Expiration or a controller/key/permission change does not erase an admitted
opt-in, refresh its signature or authorize a new selection. It changes the
pending record's actionable status. The factory keeps the exact original
opt-in envelope/digest, recorded admission time and historical authority
proof, immutable Room binding digest, candidate seed/definition and any
verified A genesis. A pending identity also names stable service, complete D,
binding epoch and pending revision digest, plus the creation executor's
owner/nonce/release and its original resource/duty ledger reference. Recovery
requests must bind **all** that identity; they cannot select an A merely by
kind, repository name or a shortened ID.

Proposed `settlePendingSiteOptIn(pendingIdentity)` is an authenticated,
read-only historical settlement. It reads the factory's original admission
and exact candidate, verifies signatures and permissions at their recorded
admission time with the actual historical bundles, and checks the candidate
seed/cause, applied genesis, full incarnation, binding and resource records.
It does not reapply the old request's notAfter against today's clock as if
it were a new mutation; nor may an expired request create or select anything
through this read. A real previously admitted A remains a historical fact
even if the original key has since expired, been revoked or lost rules.publish.
An absence/read failure is not proof that creation never happened or cannot
still happen.

Settlement reports one of: verified admitted-unselected A; selected with its
exact binding decision; held-unknown with exact missing evidence; or a proven
terminal creation/refusal/abort with its closure evidence. Where the genesis
is verified but current selection authority is missing, report
held-current-authority, not an unexplained generic pending state. Retain a
durable responsible recovery executor and the permitted next action:
recover the original creation/fence evidence, or ask a current eligible Room
controller for completion/handoff/abort. If the Room has no eligible current
controller, use its existing membership/recovery procedure to restore one
where that actual historical protocol supports it. If it cannot, report
the missing recovery authority as an owner obligation rather than assuming
restoration; the site factory gets no operator override. Only authorized controllers and
factory recovery may inspect these detailed records; a viewer-facing refusal
does not disclose private candidate/resource metadata.

`completeSiteOptIn(pendingIdentity, candidateGenesis, signedCompletion)` is
a **new current-controller** authorization to finish that original candidate,
not a refreshed opt-in or a replacement A. It requires fresh actual R/M
rules.publish authority, current expiry/signature/revocation checks and CAS
of the exact pending epoch/revision. It selects only the historically settled
original A with its same seed, full genesis fact and immutable Room binding.
The selection decision retains both the original opt-in/genesis cause and
the new factory completion decision/receipt and current controller proof;
it does not invent an old R completion FactRef. It does not rewrite A's genesis
or treat the completing key as its original signer. It enables no renderer
grant by itself: A still requires current configuration/delegation separately.
If creation remains unknown, completion refuses and the original stays held;
it must not issue a fresh creation under a new signature to fill the gap.

For a definitively applied A, the current controller may instead use proposed
`retireSiteSelection(pendingIdentity, candidateGenesis, signedRetirement,
selectionClosureProof)`. It historically settles that exact applied genesis
and its original opt-in/binding, then requires fresh R/M rules.publish
authority and CAS of the same pending predecessor/epoch. The slot records
retiring-selection and blocks new selection work. An authenticated terminal
retire/refuse-selection decision requires all old selection continuations
fenced for the original owner/nonce/release and epoch. It retains A, its
origin/genesis/evidence, custody and all duties, and records terminal epoch
and revision before any next-epoch opt-in may proceed. Known durable creation
is not treated as ambiguous simply because its original issuer is gone:
its immutable genesis and proved original creation/idempotence rules settle
that creation. Neither the new controller nor a late original continuation
may overwrite it or create a different candidate. If that correspondence or
selection fence is unproved, retirement remains held with its named owner
and proof action. No old-issuer signature is required for this new decision.

For genuinely ambiguous creation, proposed
`reconcileSiteOptIn(pendingIdentity, signedReconciliation)` lets a current
eligible controller authorize authenticated original-candidate/evidence
recovery and record progress without the old issuer returning. It binds the
same original request/seed/epoch/resource ledger and changes neither the
creation cause nor the candidate. It cannot manufacture absence, refresh
creation authority or reset the slot. Actual evidence may resolve it to
known-applied (then complete or retire-selection), or establish original
creation/selection closure for the abort path below. Otherwise held-unknown
continues with a responsible owner and precise next recovery action.

`handoffSiteOptIn(pendingIdentity, targetController, signedHandoff)` transfers
the named recovery responsibility only after current R/M controller
authorization and the target's verified current controller identity and
acceptance, all bound to the same epoch/candidate/resources. It records the
handoff and recipient, not a new opt-in or a change to D/M/R/G/repository.
It transfers no human key, provider plaintext, renderer grant or old Room
duty. Administrative handoff does not fence an original execution owner or
authorize another creation. A mutating executor handoff needs actual
authenticated closure/fencing of the original owner/nonce/release; without
that proof the recipient may inspect/recover, not replay the original
creation or race its original selection continuation.

`abortSiteOptIn(pendingIdentity, signedAbort, closureProof)` requires a fresh
current controller and exact pending CAS. The slot first records an abort
request which blocks new selection work; that request alone is not terminal.
For ambiguous/not-yet-settled creation, termination requires authenticated
durable proof that no original creation
or selection continuation can still run for that owner/nonce/release and
epoch, including already queued/in-flight work. Every late continuation
must be unable to reopen the tombstone or select/create through it. A lease,
timeout, expired key/deadline, missing response or current read of no genesis
is not such a fence. If that proof is unavailable, record held-abort-requested
with its owner and recovery action; preserve the candidate and duties.

For an already admitted A, use the known-applied retire-selection path above,
which retains its exact genesis/history and quarantines it as unselected;
it neither deletes A nor fabricates that it was never created. A's current
binding/act gates must preclude future selection
or new renderer use for the aborted epoch. Once original creation/selection
closure is proven, the slot records an immutable terminal decision/tombstone
and may admit a separately authorized opt-in at a **new** epoch. A competing
request cannot silently reset the old pending slot, reuse its epoch or
substitute its candidate. If the underlying factory/executor cannot prove
this exclusion, the epoch stays held with the explicit responsible owner;
the unsupported fence is a proof obligation, not inferred completion.

Each path retains the original candidate's resource ledger and exact
mint/attempt/custody/cleanup ownership, even after the binding epoch can
terminate. Pending/unselected A grants no renderer use; resources, if already
recorded during preparation, remain attributed to that A and original
operation. Unknown creation or mint, late reply and failed revoke survive;
only actual judged settlement/cleanup evidence changes their state. Remote
cleanup may remain owed after local creation/selection closure is proven,
but a new epoch cannot take its secrets or drop those duties. Existing
D/M/R/G functionality and obligations remain untouched.

These named read/completion/retire-selection/reconciliation/handoff/abort
and status/resource/fence records
are proposed site-factory schemas, not existing built-in acts. Their exact
historical evaluator, current-controller guard, causal receipt, CAS and
executor closure correspondence require the same owner review before code.
They use the existing attachment owner and recovery machinery; no generic
registry, new effect engine, administrative authority bypass or instant
revocation promise is introduced.

`readSiteBinding(service,D)` is the sole typed discovery boundary. It returns
the current authenticated binding decision and exact authority genesis, or
absent/pending/refused. The site verifies its service/D, epoch freshness,
revision digest, opt-in authority at its recorded admission time and causal
genesis/birth linkage. It does not reapply an expired opt-in request as a new
mutation or require that old configuring key to be the current viewer.
New controller actions and current renderer use retain their separate fresh
authority checks. An
unauthenticated browser hint cannot choose A. For the proposed native path,
the same slot can select exact R@3 as authority only through a controller
opt-in decision proving that actual existing R; it never chooses between
native and attachment paths by Worker heuristics. No second authoritative
Room-to-site lookup is introduced. The factory receipt/current-pointer
publisher trust and freshness are specific required owner schemas; their
authentication is not inferred from a JSON response or replay success.

### Attachment revisions and existing authority

A initially has no active site configuration, so it denies rendering. Its
site-only delegate/configure/disable acts use the schemas above with
authority:A and fixed D/M/R/G/repository. A has a sole local site-state item;
expected names its local revision, and previous must equal the current
configure FactRef when present. Its local pointer stores an entry position;
typed reads materialize the full A FactRef and verify previous against it.
One transaction admits each immutable
configuration/delegation item and advances or clears A's pointer. Concurrent
configurations cannot both satisfy the same expected revision. Its own
FactRefs form the configuration causal chain; old R.published and old
publication rules are untouched. The selected binding never changes merely
because configuration changes. A replacement authority/definition requires
a fresh controller opt-in, binding CAS and continuity of old A duties.

### Current selection is a final-use boundary for both paths

Every site read carries this proposed nonsecret `SiteUseContext` through
proof preparation, renderer mint, private borrowing, actual host use and
cache/response handling:

```
{ service:ServiceId, directory:D, bindingEpoch:number,
  bindingRevision:Digest, authority:ScopeRef, authorityDefinition:PlatformDefinition,
  configuration?:FactRef, delegation?:FactRef,
  repository:{host,namespace,name,id}, publishedCommit?:ObjectId }
```

The full selected authority is R@3 on the native path or A on the attachment
path, as the one authoritative slot actually selects. From its first binding
read, the context carries that authenticated selection. Configuration,
delegation and commit fields are filled only as their proofs resolve;
mint/borrow/host use or content/cache/304 release requires the complete
verified context and refuses missing fields. The context is bound
to the request and relevant mint/borrow identity; it is not supplied by an
untrusted browser as authority. Cache identities also include service,
complete D, binding epoch/revision and full selected authority, in addition
to their existing configuration/commit/path/profile/viewer partition.

`currentSiteSelection(context)` authenticates a fresh current read from
that exact service/full-D slot through its adopted typed publisher/trust
boundary. It requires equal epoch, revision and full selected authority
(including incarnation/definition), not merely a monotonic floor or a cached
old A observation. Missing/pending/disabled/unknown selection, unavailable
authentication, changed epoch/revision/authority or a binding mismatch
refuses new use. A1's own pointer, valid delegation, issuer standing and
published commit can remain unchanged after the slot selects A2; none can
override this current-slot refusal.

Run this gate after every awaited preparation and immediately before mint,
private credential borrowing, actual host use and every answer, including
internal cache hits and 304. Run the viewer/configuration/expiry/custody
checks alongside it, not instead of it. Authenticated slot reads and final
use/release checks must be coupled at the actual operation boundary under
the reviewed current-use protocol; a stale cached object cannot treat an
earlier discovery result as permission for a later call. The owner must
specify and prove that precise freshness/final-call correspondence before
enablement. This is not a claim of an atomic provider RPC or instantaneous
recall of already delivered bytes. A denied/unavailable gate may return only
the bounded non-disclosing refusal, never cached content or an old-policy 304.

On selection change, cancel/deny new uses of the old context. A continuation
must not reuse its old credential/configuration as the newly selected
authority; a new request must independently establish the new context and
viewer eligibility. Do not release buffered private bytes after an awaited
host read merely because the original A still calls them public. Internal
cache invalidation/partitioning is helpful but cannot replace this gate.

Original already-started attempts, their immutable provider/credential
bindings, unknown/late replies, reconciliation and cleanup remain on the
original owner after replacement. A late known mint reply is retained and
cleaned up under that mint/attempt; it cannot become permission for a new
old-authority borrow/read. Current selection refusal must not discard its
secret/duty, fabricate revocation, remint or reassign the original attempt.
Only authenticated internal paths proving an actual original recorded duty
may perform that reconciliation/cleanup without new-use authorization;
a caller's `cleanup` hint cannot turn a new host read into such a duty.

The delegate issuer and configuring controller need current verified
rules.publish authority; plain viewers do not. Ordinary active member/key
eligibility suffices for the members-only viewer gate even when that viewer
holds no rules.publish action. A renderer's current-use
check resolves the delegation issuer's applicable current authority as well
as its exact A/configuration/key/expiry. That check is separate from the
viewer's current membership/key eligibility. A revoked controller cannot
make a new configuration or silently renew a renderer credential. It does
not invent instantaneous recall of an already issued provider bearer.

### Attachment-owned renderer operations

Legacy G does not gain `site-read`, `read-token`, mint or cleanup acts. A owns
its site-read holder, mint-site-read/revoke operations and private custody,
under its independently pinned definition. Its grant mark authenticates the
dedicated service principal against A's current delegation/configuration.
The exact original mint/attempt, repository ID, service key and configuration
revision key every borrow/reply/cleanup duty. A reads G's authoritative
publication and written-receipt proof through G's **actual** historical
bundle and the current strict typed transport boundary. It never judges G
with A's code or a newer destination version. Only an eligible proved commit
reaches the existing bounded host port with an exact repository.read token.

The existing driver/custody machinery is extended only for A's explicitly
adopted owners/operations and exact provider binding. It cannot use a human
credential, reinterpret a checker token, broaden a namespace or transfer
old G's tokens/duties into A. Restart, unknown/late mint, failed/false revoke,
disable and replacement retain A's original duties. Old D/M/R/G writes,
clone, publication rules, receipts, private custody and pending attempts
remain fully on their existing owners and pins. Site disable stops new site
use, not the Room's other functionality or already owed cleanup.

### Feasibility seams which must be adopted, not assumed

Current ScopeKind/PlatformDefinition unions contain no site/site-authority;
current foundedKind selects register or directory, and ScopeApi.found is not
attachSite. Existing grants/observations do not establish the factory's
site-only controller mapping, binding discovery receipt or renderer
principal. Those exact new kind/identity, inline genesis validation and
causal authority, typed factory/settlement/discovery, pending binding CAS,
publication reader and A private port schemas require owner amendment and
implementation proof. No arbitrary prototype fields may be added to old
schemas. If the approved forms cannot express this linkage, keep site
denied and retain the pending records; correct the amendment before code.
This draft supplies a feasible separation of responsibilities, not a claim
that built-in forms or an executor already implement these interfaces.

## Exact authority proof and renderer lifecycle

**Native path only.** The following rules-pointer/observation and destination
act/custody paragraphs apply to the proposed native R@3/G@3 identities once
their unused allocations and exact schema amendments are verified. They do
not add fields or acts to legacy R/G. Both paths must match the authoritative
site binding's selected authority and immutable D/M/R/G/repository; a caller
cannot select the path by changing a configuration field.

`SiteDelegation` above is a new site-specific capability proof. It is **not**
an existing ordinary Grant with a service shoved into its MemberRef fields.
Its separation from ordinary grants is adopted with f60. The added authority
field and concrete typed service registration, signature/key binding,
current-use/borrowing/custody and replay attribution schemas still need the
specified owner review before implementation/enablement. On the native path,
use an existing signed Intent envelope for the new G@3 destination act
`site-read`: actor is the dedicated renderer key; fields name the exact
configuration and delegation facts, published commit/proof facts, requested
expiry and request identity. The platform's new `site-delegation` grant mark
has no ordinary action fallback: an admin's ordinary grant, a copied viewer
session, or a human key cannot substitute for the service proof.

The native mark verifies signature, authenticated current SiteUseContext
selection, current R@3 rules site pointer, exact configuration
and delegation bytes/facts, renderer installation/key, absence of that key
from human membership, exact destination/repository and expiry. It may pass
with no MemberRef under the existing custom-mark mechanism, but its service
identity must be reconstructible from retained signed fields and issuer
facts. The authority owner must specify that attribution before code; no
service-principal support is inferred from the existing Grant.principal.

A new R@3 rules observation `asked:"site"` returns current `siteConfigured`
and its digest beside the current rules head. It does not return secrets.
Its ordinary rules revision remains the latest publish revision; the site
revision is the full configure-site fact. Extend exact ObservationRequest,
RulesContent, byte guards, observed-value domain and derive/replay handling
only under the new rules identity. A new site-only grant mark reads that
current answer through production authority with a fresh, bounded use and
retains the exact issuer/configuration proof. A caller-supplied old snapshot
cannot establish current configuration. Nonsecret internal configuration
acquisition needs an explicitly typed read boundary; it grants no host
capability merely by returning bytes.

Native G@3 destination `site-read` opens a bounded `site-read` holder and one
`mint-site-read` operation under its own new pinned owner. Before minting,
the provider port authenticates current binding epoch/revision/full authority
and checks all current proof/expiry/custody conditions and
the exact stable repository. Mint read-only rights for that repository
alone, with absolute expiry bounded by the request, delegation and configured
maximum; reject broader rights, another ID/namespace, missing/invalid expiry
or a late reply. These must be actual validated provider reply properties,
not an inferred TTL. A provider which cannot supply the exact credential
and recorded cleanup behavior cannot enable that site through this port.

Native G@3 private destination custody stores the secret with that exact mint/attempt,
renderer installation/key, configuration/delegation revision and repository
binding before exposure. Only its judged matching outcome makes it usable.
The renderer borrows it through an authenticated internal port with a
bounded per-read custody handle; no viewer, ordinary credential endpoint,
history, URL or log receives the plaintext. Dedicated renderer signing-key
custody remains separate from human/operator keys and provider tokens.
After any await, recheck current service/full-D slot epoch/revision/full
selected authority, configuration/delegation, publication eligibility,
expiry, exact borrowing owner and custody before the actual host read and
before answering. Do not remint/reassign an ambiguous original attempt.

Finishing, expiry, reconfiguration/disable or failed consumption retains a
durable revoke/cleanup duty under that original attempt and stable repository.
An unknown mint stays unknown; a late known reply enters cleanup without
becoming a usable grant. Failed/false revocation does not mark success or
drop the duty. Loss of plaintext is not revocation, and local expiry prevents
use without inventing a provider answer. Existing Operations/CredentialStore
can be extended narrowly for these exact owners, including restart and
pagination of replies/cleanup, rather than replaced by a new token engine.

**Legacy attachment path only.** The selected A uses its own current
site-state pointer, with a typed A site observation under
`platform:site-authority@1`. Proposed exact answer shape:

```
{ of:A, definition:"platform:site-authority@1", head:Head,
  bindingRevision:Digest, configuration?:{fact:FactRef,digest:Digest} }
```

The configuration pair is either wholly present or wholly absent; absent
denies. This binds complete A, its current head, materialized configuration
fact/digest and the authoritative binding revision. It is not an old R rules
observation or an extension of old RulesContent. Its typed read/retention and
replay representation need the attachment owner's schema amendment before
code; existing observation unions are not assumed to accept it. A's
service grant mark rechecks the authoritative current slot as well as
reading/retaining that exact A answer, and resolves
controller/issuer authority through the actual historical R/M bundles.
Renderer `site-read`, holders, mint-site-read/revoke operations, private
custody, authenticated borrowing, late replies and cleanup all belong to A
under the same immutable Room/repository binding. Apply the native path's
exact principal, scope, publication, expiry, final-use and cleanup invariants
to those A-owned interfaces, never by routing a new site act to old G or
putting a site pointer in old R. Old G is only the source of actual
publication/receipt proof; old R is only the bound existing rules authority.
Neither gains a field, observation or act from this attachment.

## Published version proof and viewer checks

For HEAD, select the latest eligible destination publication by verified
history, not a host advertisement. For a pinned commit, verify the named
facts against that same history. The publication proof binds complete
destination ScopeRef, its genesis/birth/repository, the exact judged first
head or published integration, and a receipt opened for that commit. Require
receipt state `written` proved by the destination's judged receipt outcome,
with no conflict; derive its expected receipt file/commit/ref from the real
`destinationReceipt` and verified facts. Verify fetched Git objects and
receipt bytes against those names. A receipt ref supplied by the host is
not authority by itself. No branch/tag name, operator ref, arbitrary current
branch head, proposal or unproved ancestor substitutes for this proof.
The rule for imported first heads must use their judged import/first-head
and receipt facts; an imported repository's entire older ancestry is not
automatically published site content.

The minimal HEAD/proved-commit selector is a staged seam, not complete
plan025 navigation. Safe published branch/tag and human-readable version
label functionality remains owed under that owner: each permitted label
must have a Room-issued current mapping to an eligible immutable published
commit, with the same authority/receipt/viewer checks. A host listing alone
is not that mapping, and this draft does not adopt its eventual schema.
Full site/navigation cannot close by dropping those features. Relative links/images keep
the same authorized immutable commit prefix, so a click cannot switch to an
unpublished host ref. Keep the safe renderer and exact-output witnesses.

Request order is explicit:

1. Check method/address/credential-in-URL and obtain exact confirmed Room
   configuration facts through the typed internal boundary. Absent, unknown,
   expired delegation or disabled configuration denies with no host access.
2. For public policy, require no viewer session, but still require the
   Room-issued renderer delegation for every host read. For members policy,
   first authenticate the existing member session's MAC, current deployment,
   clock/expiry and full room membership/incarnation. Require its existing
   `summary` read eligibility for authenticating against that exact membership
   scope; no token's broad room read list is itself a site grant.
   Then read that member/key's **current** exact-room standing through the
   resolved membership semantics: active member/key and applicable controller
   eligibility. A valid old session alone is insufficient for this site gate.
   The current-main `43d` exact birth/typed resource guards remain in force.
3. Only after viewer eligibility, resolve the authorized published version,
   select a cache entry or reach the host. Carry SiteUseContext and recheck
   its authenticated current service/full-D binding epoch/revision/full
   selected authority and viewer/configuration eligibility after awaits and
   immediately before all mint/borrow/host use and every answer/cache hit/304.
   Validate path existence/type before 304; a guessed ETag cannot authorize a
   nonexistent path. No failure discloses private titles/listings/commit IDs.

Members responses use private cache isolation and no shared public response
cache. A cache key alone is not authorization. Keys bind stable service,
complete directory, binding epoch/revision/full selected authority, exact room,
configuration revision, immutable published commit, normalized path, renderer
profile and the relevant viewer eligibility partition; all cached bytes/304
still pass the current gate. Public cache use also revalidates current Room
policy before serving; a formerly public entry cannot bypass members policy
after reconfiguration. No token appears in keys or URLs.

For external/browser/CDN response caching, the conservative proposed policy
is `Cache-Control: no-store` on every site response: public and members
content, images/downloads, errors and any 304. Controlled CDNs, proxies and
service-worker response caches must bypass storage and cannot answer a stale
public/private response or conditional request without the current site
policy and standing gate. ETags are validators only, never access authority;
any 304 must be produced at that gate after current eligibility and path
validation. Do not reuse the current public max-age behavior for this policy.
No alternative external cache policy is authorized until its owner adopts
one with an exact current-authorization boundary and invalidation semantics.
Existing internal immutable object caching may remain partitioned as above,
with configuration/eligibility changes invalidating response reuse; every
answer still checks the current gate. None of this recalls bytes already
delivered, saved by a viewer, or retained by an uncontrolled cache. It governs
new responses from this service and the caches under its control.

The exact proposed boundary is `siteViewerEligibility(reader, configFact)`
under new profile `site-authority@1`, not an added `site` name silently
inserted into existing v1 SessionClaims. It uses current-main session
preparation/checks against the exact membership's existing `summary` read,
then authenticates the live standing and applies this Room's members policy.
The policy plus that standing authorizes the new site view; a session alone
does not. The contract/session owner must adopt this separate site operation
and current-standing gate. Existing v1 token domains, claim shape, named
reads, issuance/expiry and serving behavior elsewhere remain unchanged.
This is not instantaneous recall of issued external bearer
tokens or every existing read session. New site eligibility checks prevent
new service reads/answers at the defined boundary; provider cleanup and
already-issued remote access retain their actual bounded semantics.

## Changed identities, old rooms and owners

Proposed shipped definitions are `platform:rules@3` (three site-only acts,
site data/pointer, observation/byte domains) and `platform:destination@3`
(site principal mark and mint/read/cleanup holders and operations), above
the incoming explicit @2 family. These numbers are proposed allocation,
subject to owner verification at integration; they must never replace an
already shipped identity. New root/child selection must use the adopted
version continuity design, with new register/directory identities if their
child-creation semantics change. The site authority/profile schema also
receives new identity `site-authority@1`, and the safe rendering policy is
explicit `site-safe@1`. The route/cache identity advances from existing
`site-1` to a new version when authorization/selector/cache behavior changes;
that cache identifier alone is not a principal/delegation version. Existing
member-session v1 semantics remain unchanged as specified above.

Old @1/@2 scopes and their histories/data/executables must remain served by
their actual pinned semantics; do not repin or rewrite their genesis. Their
existing repository writes, membership, clone and replay functionality are
preserved. They have no configure-site/delegation act today. The selected
site-only attachment above is the proposed exact transition without adding
those acts to them, repinning or replacing the Room. It still needs full
owner DESIGN review/adoption of its unsupported field/creation/trust seams
and implementation witnesses. Until those exist and the Room explicitly
opts in, site is denied and all old functionality/duties remain preserved.
That pending site state is not claimed complete old-room site support.

| Owner | Exact amendment/proof owed before implementation |
|---|---|
| Rules/platform owner | Adopt site-only acts/items/pointer, canonical schemas/domains, previous/expected revision handling, publication guards and current site observation. Preserve ordinary publish/check configurations and old pins. |
| Contract/authority/security owner | Adopt separate renderer ServicePrincipal/SiteDelegation semantics, custom mark with no ordinary grant fallback, dedicated-key registration/custody/disjoint membership proof, exact current-use and replay attribution, and typed internal configuration read. Ordinary Grant does not already provide this. |
| Destination/host/custody owner | Adopt exact published/receipt proof, new scoped operations/holders, actual returned read rights/expiry, authenticated private renderer borrowing, original-attempt identity and durable cleanup through all failure/restart/late-answer cases. |
| Session/site owner | Adopt site-authority@1 and separate siteViewerEligibility over existing authenticated membership-summary eligibility plus current standing, before all caches/304/ref/host access; do not add site permission to old SessionClaims. Adopt SiteUseContext with authenticated current service/full-D binding epoch/revision/full selected authority after awaits and at every mint/borrow/host/answer boundary, private internal partitioning/invalidation, external no-store and controlled-cache bypass, and same-commit link resolution. Preserve original late/unknown/cleanup duties separately from new-use gating. Any alternative external cache policy needs separate adoption. Name actual recall/expiry limits; already delivered bytes cannot be recalled. |
| Version/Room/attachment owner | Allocate unused native and independent site-authority identities; adopt exact site-only factory/genesis, full Room/bundle binding, one authenticated discovery slot and pending/CAS/revision/settlement/completion/retire-selection/reconciliation/handoff/abort/status/resource schemas. Prove historical original-candidate settlement separately from current controller permission: known-applied completion/selection retirement retains A and fences old selection, ambiguous creation requires its actual closure proof and never resets. Prove owner fencing before mutating handoff. Unknown records remain held with a responsible owner/action. Preserve old Room functionality/duties; no fake old acts, repin, automatic migration or replacement Room. |
| Navigation/publication owner | Complete safe published branch/tag and human-label mappings from plan025 under the exact receipt/publication proof. HEAD/proved-commit staging does not close these obligations. |
| Existing capacity owner | Bound configuration/delegation bytes and retained versions, holder/operation reservations, reads/proof closure, outstanding credentials, cleanup backlog and private cache work using existing capacity evidence. No new numbers or matrix. |

## Compact boundary witness plan after owner adoption

Strengthen existing rules, destination, session, custody and site witnesses:
the real existing D/M/R/G can opt in without any old-scope act/history change;
concurrent or uncertain opt-ins cannot select two authorities for one binding
epoch, and exact retry/discovery recovers the same causal A genesis; stale or
expired/revoked original opt-in settlement retains that actual genesis and
requires a fresh current controller to complete the same candidate; handoff
and abort cannot reset an unknown epoch or outrun an original continuation,
and terminal closure retains resources/cleanup;
unauthenticated binding hints deny; a plain member without rules.publish can
view after current eligibility while configuration still needs controller
authority;
unauthorized configure changes nothing; exact controller configuration and
delegation facts replay; absent/unknown/disabled policy denies; another
room/incarnation, human key or expired/broader renderer grant cannot mint or
borrow; current member/key changes refuse site bytes and 304; cache hits
cannot bypass that gate; swap the authoritative slot from A1/public to
A2/members or unconfigured while a read is suspended, leaving A1's own
pointer/delegation/publication valid, and show new old-context mint/borrow/
host use or content/cache/304 release is refused while original duties remain;
path-before304 remains; unpublished operator/tag/
proposal commits are refused despite valid host objects; a real judged
first-head/publication plus written receipt selects exactly its commit;
restart/lost/late mint and failed cleanup retain their original duties.
Preserve old-room histories and prove the explicit transition once defined.
Use the existing selected safe-output witnesses, not a new conformance or
provider/version matrix. No tests, compilation, gate or provider probes ran
for this draft. Implementation, integrated review and full site delivery
remain in existing a231, after read/clone.

## Exact interface finalization draft under existing a231

This prefix-preserving append answers planner
`70cc2b2b6c07ed12a9ec0e717ba0df030e8180fb`. The preceding 770 lines are
unchanged from adopted DESIGN `c4a17ee0d62529a8d8ba574ef6e8a6242effb737`,
SHA-256 `d29723c803149a351b118f75305b10954f6eff97375b4bd90644fbe43b9b078c`.
Complete normal verdict `5222bc6f42a33c0ed5134d86b3c8e3c659fa99f3`, adoption
`e5437627fd3dd8ccf38d797fc3c917d397d30ada`, one-file DESIGN
`721c2f816cd034e762fa8278de02d4d4354dcc88` (all381 lines) and adoption
`7349458bc1f40004535434363111e0341b7f97c5` were freshly read. Complete checker draft feedback7ea5b116e501471849346de71625600871eff0a0 was read and reconciled below. Earlier proposed/
review labels in the immutable prefix describe its history. This append is a
proposed exact successor, refined by full planner3c27459fcf4fcf52648756554403cdc938bbc123 and full c35b3484612833ffd90c3b330767ef7f8ff1df80 plus raw-record confirmation558df5e210d72c6539bc81dd7a2256e9ff195159, for Root steering and complete normal DESIGN review,
not finalized allocations, supported source wire, code or activation.
The actual 280 OwnerKey/AttemptKey/InvocationKey/DutyIdentity/closure/signature/
terminal-port sections and b74 ArtifactRef/ServiceIdentity/canonical-DAG
sections were freshly read. Those supplemental readings were selected
sections, not fresh whole 1141-line280 or whole b74-body coverage.

The prefix's request-order phrase "applicable controller eligibility" applies
only to configuring/delegating controllers and delegation issuers. A members
viewer needs current active member/key eligibility, not rules.publish.

### Closed records, domains and roles

Every record below rejects extra/missing fields; a union accepts only its exact
named variant. Optional previous/configuration fields in the prefix become
explicit null or exact variants at these finalized interfaces. No null/absent
value licenses another authority, implementation, mode or epoch. ScopeRef,
FactRef, Seed, Digest, KeyId, timestamp, canonical JSON/UTF-8 and object-ID
forms retain their actual contract validators. Artifact digests identify
retained bytes and complete reference closure, never a ready/verified flag.

Propose these distinct canonical byte domains, each framed as its literal
tag, newline and canonical payload, with no self-digest: the retained
`artroom-site-delegation-1`, `artroom-site-configuration-1` and
`artroom-site-binding-1`; additional `artroom-site-room-binding-1`,
`artroom-site-factory-read-1`, `artroom-site-factory-receipt-1`,
`artroom-site-selection-read-1`, `artroom-site-current-use-1` and
`artroom-site-borrow-1`, `artroom-site-handoff-offer-1`,
`artroom-site-handoff-acceptance-1`,
`artroom-site-initial-state-1`, `artroom-site-slot-state-1` and
`artroom-site-factory-closure-1` (closure signature framing only). These are explicit proposed allocations for owner
collision checking/adoption, not existing DOMAINS/value-read support. Factory
contract/ABI, installation, bundle and closure artifact identities use their
existing owner's canonical/raw-digest contracts; format names are not silently
promoted to new hash domains. Actual signed publication keys and byte/read/
lifetime allowances remain prerequisites below.

Define a separate SiteFactoryIntent/SignedSiteFactoryIntent byte contract for
controller factory mutations. Its cryptographic framing remains the existing
intent-domain tag/newline/canonical payload and signature primitive; it does
not extend shipped Intent, FieldValue, SignedIntent, ScopeApi or their guards.
Factory fields explicitly admit only the closed nested records/null variants
below. Existing FieldValue excludes nested null, even though the current
runtime isIntent only checks that fields is a record. Neither fact supplies
this new factory contract or authorizes a cast through the old type.
The factory is a separately typed route, never ScopeApi.found or an old R act.
Its commands require to:null, on:null and exactly expected:{binding:epoch};
expected.binding equals previous.epoch (a number), and both previous.epoch
and previous.revision must CAS-match the current authenticated slot position.
All listed fields are signed. This is the new factory CAS, never an old scope
item alias; ordinary scope endpoints must not acquire these new kinds. Dedicated factory/slot publication keys
sign factory receipts/selection statements. Registered renderer keys sign
site-read/use/borrow requests and are disjoint from human/member/operator
keys. Registered original recovery executors sign their own duty evidence;
the factory authenticates it against actual executor ownership. No signer
role is established by a key supplied in the same request/response.

```ts
interface SiteFactoryIdentityArtifact {
  format:"artroom-site-factory-identity-1";
  service:ServiceId; address:ServiceAddress;
  namespace:string; object:string; contract:ArtifactRef;
}
type SiteFactoryIdentity = Digest;
type Epoch = number;
interface SiteAuthorityRef {kind:"site";scope:ScopeId;inc:Incarnation}
interface SiteSeed {
 v:1;kind:"site";definition:"platform:site-authority@1";
 creator:null;cause:Digest;ordinal:0;
}
interface SiteFactRef {at:SiteAuthorityRef;seq:number;hash:Digest}
interface SiteScopeOwnerKey {
 service:string;namespace:string;object:string;scope:SiteAuthorityRef;
 nonce:Digest;release:Digest;build:Digest;
}
interface SiteScopeAttemptKey {
 scope:SiteAuthorityRef;origin:SiteFactRef;operation:OperationId;
 attempt:number;binding:Digest;
}
interface SiteScopeInvocationKey {attempt:SiteScopeAttemptKey;ordinal:number;site:string}
interface FactoryRecordRef {
  factory:Digest; slot:SiteSlot; seq:number; hash:Digest;
}
type SiteOwner =
  | {kind:"factory";factory:Digest;slot:SiteSlot;nonce:Digest;
     release:Digest;build:Digest}
  | {kind:"scope";owner:OwnerKey|SiteScopeOwnerKey};
interface SiteSlot { service: ServiceId; directory: ScopeRef }
interface SitePosition { epoch: Epoch; revision: Digest }
type SiteOriginalCause =
  | { path: "attachment"; request: Digest; envelope:CanonicalArtifactRef<SignedSiteFactoryIntent>;
      admission: FactoryRecordRef; roomBinding: Digest; seed: SiteSeed }
  | { path: "native-selection"; request: Digest; envelope:CanonicalArtifactRef<SignedSiteFactoryIntent>;
      admission: FactoryRecordRef; roomBinding: Digest; authority: NativeSiteAuthority };
interface PendingSiteCandidate {
  definition: "platform:site-authority@1"; seed: SiteSeed;
  scope: ScopeId; genesis: SiteFactRef | null;
}
interface NativeSiteAuthority {
  ref: ScopeRef; definition: "platform:rules@3"; genesis: FactRef;
}
interface AppliedAttachmentAuthority {
  ref: SiteAuthorityRef; definition: "platform:site-authority@1";
  seed: SiteSeed; genesis: SiteFactRef;
}
type SelectedSiteAuthority = NativeSiteAuthority | AppliedAttachmentAuthority;
interface SitePendingIdentity {
  factory: SiteFactoryIdentity; slot: SiteSlot; position: SitePosition;
  original: Extract<SiteOriginalCause, {path:"attachment"}>;
  candidate: PendingSiteCandidate;
  executor: SiteOwner; resources: CanonicalArtifactRef<SiteFactoryLedgerOrigin>;
}
interface SiteNativeSelectionIdentity {
  factory: SiteFactoryIdentity; slot: SiteSlot; previous: SitePosition;
  original: Extract<SiteOriginalCause, {path:"native-selection"}>;
  executor: SiteOwner; resources: CanonicalArtifactRef<SiteFactoryLedgerOrigin>;
}
interface SiteFactoryIntent<K extends SiteFactoryMutationKind = SiteFactoryMutationKind> {
  v:1; to:null; actor:KeyId; kind:K; on:null;
  expected:{binding:Epoch};
  fields:{factory:SiteFactoryIdentity;slot:SiteSlot;previous:SitePosition;
          body:BodyOf<K>};
  idempotencyKey:string; notAfter:Timestamp;
}
interface SignedSiteFactoryIntent<K extends SiteFactoryMutationKind = SiteFactoryMutationKind> {
  intent:SiteFactoryIntent<K>; sig:Signature;
}
```

ServiceAddress is the exact independently configured full service URL/origin,
not a link-selected endpoint. FactoryRecordRef names this factory's durable
record identity and content digest, not a fabricated Scope FactRef.
Factory identity is the raw b74 ArtifactId of the complete canonical identity
artifact, retained with encoding canonical-json; its contract ref names the
actual closed factory ABI. The configured service/namespace/object/tuple must
cross-match it. Epochs and record sequences are nonnegative safe integers,
never negative zero; increments are checked and overflow holds without wrapping.
Native scope owner means actual 280 OwnerKey/AttemptKey/InvocationKey and
DutyIdentity exactly. Attachment executions use separately typed SiteScopeOwnerKey,
SiteScopeAttemptKey/SiteScopeInvocationKey, SiteScopeDutyIdentity and site-scope
closure forms below, with the same exact owner/attempt/duty semantics and
field layout, substituting only the dedicated site refs. This is an explicit
new validator/type branch before support, not a cast through old ScopeRef/Seed/
FactRef or280 records. Private Digest custody-reference meaning remains280.
Shipped primitive/record validators and signature bytes remain unchanged.
Site seed ID/hash uses the existing seed-domain framing; its site-only decoder
must validate the exact SiteSeed shape rather than call a shipped kind guard. Pre-creation factory owner is
the distinct closed factory variant above and never has an invented ScopeRef.
CanonicalArtifactRef<T> is b74 ArtifactRef {digest,bytes,encoding:"canonical-json"}
whose retained bytes validate as the declared closed T, with raw ArtifactId;
no schema-name field or generic proof/string alias is stored in that reference.
Controller/registration EvidenceRef retains b74's actual artifact/kind shape;
its actual authority/custody/registration correspondence remains a declared
owner prerequisite, not permission obtained from the reference itself. For attachment
before creation, scope is seed-derived and genesis:null explicitly means no
verified incarnation yet. A nonnull genesis must have the same scope, kind,
definition and exact applied seed/cause. SelectedSiteAuthority never has a nullable
or shortened authority/genesis: ref equals genesis.at, with the exact applied
birth proof. Native ref is the actual rules ScopeRef; proposed SiteAuthorityRef
is the full new site-kind ref, whose allocation/validator is still an owner
input, not an extension assumed present in shipped ScopeRef. Native selection
never has an attachment seed or a creation ledger fabricated for R.

Room binding bytes are exactly the prefix's full service/D/M/R/G/repository/
births/bundles record. Their room-binding-domain digest is used everywhere.
Required birth/source/build/confirmation/repository and historical evidence is
retained, typed and attributable; equal names/hashes alone do not select code.
The signed factory identity, slot.service/D, inline binding and original
resource/executor references must agree before any mutation. The initialized never-admitted absent slot has epoch0 only through its
actual signed retained initial state; storage loss/missing answer cannot
supply it. First admitted candidate uses checked epoch1. Candidate pending,
completion, held, handoff and retirement retain that epoch; another candidate
requires checked next epoch after actual predecessor exclusion. Every logical
slot-state transition changes its revision and CAS-matches both previous
members. Private audit/custody bookkeeping has its own ledger revision and
must not silently redefine this slot position.

Request identity is exactly existing intentDigest of the unsigned complete
SiteFactoryIntent canonical payload, under the unchanged intent-domain framing.
The dedicated nullable factory schema supplies validation; it does not change
that digest's input. Original seed.cause equals this unsigned request identity.
Retain the original signed envelope as a separate canonical-json ArtifactRef,
including its exact signature, alongside its unsigned request digest; verify
both association and actor signature before using or settling it. Raw artifact,
unsigned intent digest and signature are distinct, never interchangeable.
Receipts, records and original-request lookup bind the unsigned request Digest
and that retained signed-envelope association, not a new signed-request hash.
Factory read requests likewise have their exact read-domain payload digest,
with their separately retained signature; they are not creation intent causes.

### Factory record DAG and separate current revision

Closed canonical records have exactly
{format:"artroom-site-factory-record-1",factory:Digest,slot,seq,
 predecessor:FactoryRecordRef|null,previous:SitePosition|null,
 originalRequest:Digest|null,request:Digest|null,
 signedRequest:CanonicalArtifactRef<SignedSiteFactoryIntent>|null,epoch,
 transition:SiteFactoryTransition}. IDs/signatures are external. Ref.hash is exactly b74 raw digestBytes of the original retained canonical
factory-record payload bytes; for that artifact Ref.hash equals its raw
ArtifactRef.digest. It is not a framed content hash or ordinary entryHash.
Artroom-site-factory-record-1 is a schema format only: no extra record hash
or signing domain is allocated. Existing configured factory receipt/selection
publisher signatures bind that exact raw FactoryRecordRef, current position
and request/tuple, so an additional record signature is unnecessary.
Initial/slot position revisions separately use their selected framed state
domains, so neither is a raw-record hash or BindingDecision ID. Initialize is seq0 with both predecessors and
requests and signedRequest null, epoch0 and transition:{kind:"initialize",roomBinding:Digest}.
Other records have checked seq+1 and exact previous record/position; request
is their actual unsigned current mutation intent digest, signedRequest retains
its exact envelope/signature association, and originalRequest is the immutable
original candidate/selection intent digest. They never include their own ref/resulting state
revision or a future artifact ID.

SiteFactoryTransition is exactly initialize as above or
{kind:"admit-attachment",plan:CanonicalArtifactRef<SiteFactoryPlan>} or
{kind:"select-native",authority:NativeSiteAuthority,roomBinding:Digest,
 controller:EvidenceRef} or
{kind:"advance",path:"attachment"|"native-selection",
 action:"complete"|"hold"|"retire"|"reconcile"|"handoff"|"abort",
 origin:CanonicalArtifactRef<SiteFactoryLedgerOrigin>,
 evidence:SiteTransitionEvidence}. SiteTransitionEvidence is a closed path/action match. Attachment complete
has exactly {controller:EvidenceRef,genesis:SiteFactRef}; native complete has
{controller:EvidenceRef,authority:NativeSiteAuthority}. Hold has
{reason:SiteFactoryReason,responsible:SiteOwner,next:RecoveryAction}; retire has
{kind:"attachment",controller:EvidenceRef,genesis:SiteFactRef,closure:SiteClosureRef}
or {kind:"native",controller:EvidenceRef,authority:NativeSiteAuthority,closure:SiteClosureRef}; reconcile has
{controller:EvidenceRef,acquired:ArtifactRef[]}; handoff has
{offer:CanonicalArtifactRef<SiteHandoffOffer>,
 acceptance:CanonicalArtifactRef<SignedSiteHandoffAcceptance>,
 closure:SiteClosureRef|null}; abort has
{controller:EvidenceRef,closure:SiteClosureRef|null}. Acquired refs must have
exact declared original evidence/resource types and authorized acquisition;
they cannot be an arbitrary artifact crawl or substitute record. Missing
actual controller/evidence correspondence remains held, never a verified
boolean. Native reconcile/retire/handoff/abort map to their corresponding closed
evidence shape with the original native identity and actual authority, never
an attachment genesis; attachment actions carry their pending A. Eight mutation
kinds, five native actions, path-tagged transitions, five authenticated read
purposes and six result variants are checked together. Each path/action's
payload/mutation/result links must agree. No unrelated
action or mutable state artifact substitutes for required original evidence.

Initial state bytes are exactly
{format:"artroom-site-initial-state-1",factory:Digest,slot,epoch:0,
 roomBinding:Digest,record:FactoryRecordRef}. External initial-state-domain
hash is position.revision. Subsequent state bytes are exactly
{format:"artroom-site-slot-state-1",factory:Digest,slot,epoch,
 record:FactoryRecordRef,state:"pending"|"held"|"selected"|"retiring"|"terminal",
 origin:CanonicalArtifactRef<SiteFactoryLedgerOrigin>,
 candidate:PendingSiteCandidate|SelectedSiteAuthority,
 decision:Digest|null,responsible:SiteOwner,next:RecoveryAction|null}.
External slot-state-domain hash is the current position revision. Selected
requires the SelectedSiteAuthority shape with a full applied ref/genesis and
its binding decision; unselected states
confer no use. Origin/candidate/decision/state associations must match their
actual retained facts. A generic held state cannot hide missing authority,
fence or evidence; typed receipts retain the actual reason/next action.

Binding decision digest in artroom-site-binding-1 stays independently
attributable; it is not the lifecycle position revision. In the complete
SiteUseContext successor, bindingRevision means current position.revision and
additional bindingDecision names that selected immutable decision. Thus even
a same-epoch held/retire/handoff transition invalidates an older current-use
position. Configuration facts retain their separate R/A causal revisions.

DAG order is plan -> original admission record -> immutable ledger origin ->
later records/state/evidence. Initial record precedes initial state; each
later record precedes its resulting slot state. Decisions/evidence used by a
record already exist and contain no resulting record/revision/self ID. Typed
publisher signatures/read receipts are later envelopes over those identities.
Mutable ledger snapshots have their own checked predecessor revision; they
cannot rewrite an original cause, plan, executor, resource or pending epoch.

### Factory mutation and historical settlement interfaces

SiteFactoryMutationKind and BodyOf<K> are exactly the eight mutation rows
below, with no generic fields/object fallback. Each has exactly the new
factory fields record above. Previous is the full authenticated SitePosition;
expected.binding equals previous.epoch, while the full previous revision and
epoch are compared together. The final ninth row is a separate read, not a
mutation kind. Body/kind mismatches or extra nested fields reject.

| Kind | Exact body | Boundary |
|---|---|---|
| attach-site | {roomBinding,definition:"platform:site-authority@1"} | Fresh current R/M rules.publish, exact pending CAS before creation. Seed is only creator:null, kind:site, that definition, cause:original intent digest, ordinal:0. Persist original admission/executor/resources before possible creation. |
| select-native-site-authority | {roomBinding,authority:R,definition:"platform:rules@3",genesis:FactRef} | Fresh controller and exact existing R@3 genesis/Room proof. Starts a new checked epoch only after predecessor exclusion. Creates no A/fake R act. R equals binding.rules; G has the combined compatible meaning. |
| complete-site-opt-in | {pending:SitePendingIdentity,candidateGenesis:SiteFactRef} | Fresh current controller, exact pending CAS and original settled candidate only; retains original and completion proofs separately. |
| retire-site-selection | {pending:SitePendingIdentity,candidateGenesis:SiteFactRef,selectionClosure:SiteClosureRef} | Known-applied candidate retained/quarantined; actual original selection continuation fence before terminal epoch. |
| reconcile-site-opt-in | {pending} | Fresh controller authorizes original evidence recovery only; no new creation, changed seed or inferred absence. |
| handoff-site-opt-in | {offer:SiteHandoffOffer,targetAcceptance:SignedSiteHandoffAcceptance,executorClosure:null\|SiteClosureRef} | Target's separate current signed acceptance binds this exact pending identity/resources. No mutating executor transfer without actual original closure. |
| abort-site-opt-in | {pending,closure:null\|SiteClosureRef} | Null can record abort-requested only. Terminal abort requires original queued/in-flight creation/selection exclusion. Applied A uses retirement instead. |
| settle-native-site-selection | {selection:SiteNativeSelectionIdentity,action:NativeSelectionAction} | Fresh controller, full predecessor CAS, same existing R/Room/original epoch and original duties; no attachment or R birth mutation. |
| read-only settlement | no mutation body | Separate signed factory-read interface below; never rejudge old notAfter as a fresh creation. |

NativeSelectionAction is exactly
{kind:"complete",authority:NativeSiteAuthority} or {kind:"reconcile"} or
{kind:"retire",selectionClosure:SiteClosureRef} or
{kind:"handoff",offer:SiteHandoffOffer,targetAcceptance:SignedSiteHandoffAcceptance,
 executorClosure:SiteClosureRef|null} or {kind:"abort",closure:SiteClosureRef|null}.
All require the outer signed factory/slot/previous/expected fields and current
controller authority. Complete verifies the same actual existing R genesis/
Room/original epoch; reconcile only acquires original evidence; retire excludes
original selection/use continuations and preserves duties; null abort is a
request only and terminal abort needs actual exclusion. Already selected native
uses retirement. Handoff uses the path-tagged native offer and actual target
consent, with no physical transfer absent original closure. None creates,
deletes, aborts the birth of or repins R. Unknown native selection stays held.

The last row is deliberately not a mutating SiteFactoryIntent kind. Thus the
mutation set contains the preceding eight kinds. The handoff uses a separately retained canonical offer, never the final
handoff intent digest, so no content-ID cycle is present. Offer-domain bytes
are exactly {v:1,factory,slot,identity,previous,targetController,requester:KeyId,
executor:SiteOwner,resources:CanonicalArtifactRef<SiteFactoryLedgerOrigin>,
source:KeyId,target:KeyId,nonce:Digest,idempotencyKey,notAfter}. Its external offer digest is computed once; the
payload contains no own digest, acceptance or final handoff digest.
Identity is the closed path-tagged union
{path:"attachment",pending:SitePendingIdentity} or
{path:"native-selection",selection:SiteNativeSelectionIdentity}.
Its shared owner/resources/predecessor/target fields cross-match that exact
variant completely, never converting a native selection into a pending A. The
requester is the final handoff actor, and the target is its exact current
full membership/member/key controller identity. The unsigned offer conveys
no authority; it becomes attributable through the final controller signature.

SignedSiteHandoffAcceptance is the dedicated envelope {payload,sig}, signed
with the target's actual current controller key over
artroom-site-handoff-acceptance-1/newline/canonical payload. Payload is exactly
{v:1,offer:Digest,target:KeyId,nonce:Digest,notAfter:Timestamp}. Offer includes
complete pending/predecessor/original resources, source and target controller
keys, nonce and notAfter; its retained digest is in offer-domain bytes. The
acceptance has no final handoff/acceptance digest and cannot outlive the offer.
Require both current/unexpired, source/target current eligibility, exact CAS
and unused acceptance at final handoff. Nonce/byte/lifetime allowances remain
actual owner inputs, not a new TTL. This statement is consent only, not an
factory mutation or a cast through shipped nullable FieldValue.

Final signed handoff contains the complete offer and acceptance plus actual
executorClosure or explicit null. It compares the same factory/slot/pending/
predecessor/epoch/target/requester/executor/resources, validates target signature
and current permission/acceptance, and CAS-matches both predecessor members.
Offer and final handoff keep their listed immutable idempotency keys.
Acceptance has no idempotencyKey field: its exact replay identity is the
external SHA-256 of UTF8("artroom-site-handoff-acceptance-1\n") plus canonical
bytes of that unsigned payload. Signature/envelope artifact association is
retained separately. Consume one acceptance for its exact offer/target/nonce/
full predecessor. An equal original retry returns only the retained outcome,
never another handoff or refreshed deadline/consent. All three retain their exact deadlines; final admission must precede all three deadlines and
satisfy actual configured lifetime bounds. No retry refreshes any of them.
The current offering controller and current target controller remain eligible
at final admission. Null closure transfers inspection/recovery responsibility
only; mutation needs the actual original executor fence. This transfers no
human keys, provider plaintext or old Room duties.

A native selection's resource ledger belongs only to its actual selection
and site-use responsibilities; it cannot state that the factory created R.
A held/lost native selection is settled through authenticated original-request
or native-selection reads, with the original signed association, admission,
full existing R birth/source and selected/held/terminal-native-selection result.
Fresh settle-native-site-selection action:complete finishes only the same R/
Room/original epoch; it records new completion without rewriting birth/cause.
Native retire requires fresh current controller, entire-position CAS and actual
original selection exclusion; it retains R/G and all site/old duties. Its
terminal-native-selection result names that exact original selection/authority/
record/closure. No pending attachment, seed, R creation or A deletion is
fabricated to fit settlement. Native unknown selection never enters attachment
creation/abort; unsupported evidence remains held with actual owner/action.
Original attach is the only command permitted to establish its exact seed;
new completion/reconciliation/retirement signatures never rewrite that cause.
Retries of an admitted original attach retain its original bytes/key/deadline/
idempotency identity. Completion is a new current request, not an old issuer
refresh. Unknown creation remains bound to the original candidate and owner.
A native selection has its actual existing R genesis and no creation ledger
fabricated for R. Both paths still require configuration/delegation before use.

A closed factory decision in binding-domain bytes has exactly:

```
{v:1,factory,slot,positionPrevious,epoch,roomBinding,
 authority:SelectedSiteAuthority,original,
 completion:null|FactoryRecordRef,controllerProof:EvidenceRef,
 admittedAt:Timestamp,executor:SiteOwner,
 resources:CanonicalArtifactRef<SiteFactoryLedgerOrigin>}
```

Its external digest is bindingDecision, the immutable selected decision ID.
It is distinct from bindingRevision/position.revision, the current slot-state
hash. Neither its own decision ID nor a resulting state revision is inside
this decision payload. Native original.path is native-selection and
binds its actual factory selection request/admission separately from R's
existing genesis/source cause. Attachment original.path is attachment and its
seed.cause equals original.request. Pending, receipt and decision copies must
agree on every original/factory/slot/epoch/candidate/executor/resource field;
a factory admission or a renamed request can never replace R's birth cause. Publication/receipt records bind this exact decision,
CAS predecessor, tuple and request digest. A conflicting repeat is held;
no second authority or revision is selected under the same pending predecessor.

Factory receipts are signed envelopes {payload,sig}; payload has exactly
{v:1,factory,slot,request:Digest,tuple:Digest,record:FactoryRecordRef,result}.
Result is one closed variant:

```
{state:"pending",pending,responsible:RecoveryOwner,next:RecoveryAction}
| {state:"selected",decision:Digest,position:SitePosition,authority:SelectedSiteAuthority}
| {state:"held",pending,reason:SiteFactoryReason,responsible,next}
| {state:"held-native-selection",selection:SiteNativeSelectionIdentity,
   reason:SiteFactoryReason,responsible,next}
| {state:"terminal",pending:SitePendingIdentity,decision:FactoryRecordRef,closure:SiteClosureRef}
| {state:"terminal-native-selection",selection:SiteNativeSelectionIdentity,
   decision:FactoryRecordRef,closure:SiteClosureRef}
```

RecoveryAction is only acquire-original-evidence, ask-current-controller,
complete-same-candidate, retire-known-selection, recover-original-fence or
settle-original-duties. SiteFactoryReason is only missing-provenance,
unsupported-contract, unavailable-proof, current-authority-missing,
predecessor-conflict, candidate-conflict, creation-unknown or fence-unproved.
Ordinary request shape/signature/expiry/authority refusals keep their actual
existing refusal class; they do not become an acknowledged pending receipt.
Detailed pending/resources are returned only to a current controller or an
exact registered responsible recovery executor. A viewer gets a bounded
nondisclosing denial. No response manufactures candidate incarnation or
closure; no status/receipt releases secrets or grants new use.

### Exact authenticated reads and current selection

Signed factory reads have {payload,sig}; payload has exactly
{v:1,factory,slot,actor:KeyId,authorization,purpose,nonce,notAfter,tuple}.
Authorization is exactly {role:"renderer",registration:EvidenceRef} or
{role:"recovery",registration:EvidenceRef,executor:SiteOwner} or
{role:"controller",controllerProof:EvidenceRef}. Controller authorization is
actual fresh R/M rules.publish, not service registration or old issuer status.
Purpose is exactly {kind:"binding"} or {kind:"locator",locator:ScopeId} or
{kind:"pending",pending:SitePendingIdentity} or
{kind:"native-selection",selection:SiteNativeSelectionIdentity} or
{kind:"original-request",request:Digest}. Renderer is allowed binding/locator discovery only.
All detailed purposes require current controller/exact original recovery
authorization and the same full service/factory/D slot.

Original-request lookup solves lost first replies without inventing generated
executor/resources. It locates only that exact originally signed request and
returns its actual retained pending/native-selection identity, selected
receipt or established terminal record under the same closed receipt variants.
The factory verifies retained envelope/signature/admission/cause correspondence;
request digest possession alone grants no read. It neither submits creation
nor resets selection/expiry, chooses another epoch/candidate, or returns history.
Once learned, subsequent detailed settlement binds the complete original
identity. A lost reply is not grounds to refresh/re-sign the opt-in.
Actual registration verification, nonce/replay/lifetime/byte bounds and signer
custody come from the existing security/executor owners. They are not granted
by these fields or an ordinary member session. No public history, service
credential or operator override is added.

A binding/selection answer in selection-read-domain bytes has exactly
{v:1,factory,slot,request:Digest,tuple:Digest,at:FactoryRecordRef,result} and its
configured slot publisher signature. Result is {state:"absent",position} or
{state:"pending",position} or {state:"disabled",position} or
{state:"selected",position,decision:Digest,authority:SelectedSiteAuthority}.
The first three disclose no candidate/resources. Selected carries the exact
retained decision/genesis proof through the typed internal acquisition path,
not arbitrary caller URLs. Online selection requires the actual active tuple,
monotonic publication floor and independently trusted publisher. A valid old
signature proves the old statement only. Historical settlement uses the
retained admission/code evidence and current read authorization, not current
mutation permission for an expired original request.

The site-only slot publisher maintains its authenticated locator index from
the verified complete Room binding at slot admission; it is not a generic
registry. Closed locator bytes are exactly
{format:"artroom-site-locator-1",factory:Digest,service:ServiceId,
 locator:ScopeId,directory:ScopeRef,genesis:FactRef,roomBinding:Digest,
 position:SitePosition,record:FactoryRecordRef,tuple:Digest}.
The actual factory publisher signs this canonical artifact under proposed
artroom-site-locator-1 domain. Signed locator read binds actual configured
factory/service, requested locator, nonce/notAfter and active tuple in the
same factory-read contract, with purpose:{kind:"locator",locator:ScopeId};
renderer authorization is discovery-only, never detailed pending/resources.
Answer binds request digest, current factory record/position, locator artifact
and publisher signature; absent/conflict is nondisclosing denial.

Locator equals directory.scope and genesis is exact applied directory birth;
service/factory/room-binding/current position cross-match the current slot.
Lookup must yield one exact currently selected full D. Missing/conflicting
incarnations deny; no newest-incarnation fallback. Mapping changes need explicit
publisher-authenticated adjudication plus current slot cross-check and retain
old evidence. A URL/path/hostname/Room JSON supplies no such authority. These
new exact locator signature/read/index forms require owner allocation and
source support; declaration parsing is not implementation.

### Exact factory ledger, use and closure contracts

The following are distinct canonical-json b74 artifacts, not scope280 records
by cast. The site's proposed artifact format strings are explicit schema
identities; their raw IDs use b74 and are not new hash domains.

```ts
interface SiteFactoryPlan {
 format:"artroom-site-factory-plan-1"; factory:Digest; slot:SiteSlot;
 epoch:Epoch; request:Digest;envelope:CanonicalArtifactRef<SignedSiteFactoryIntent>;
 previous:SitePosition;
 candidate:PendingSiteCandidate|NativeSiteAuthority;
 owner:Extract<SiteOwner,{kind:"factory"}>; tuple:Digest;
 reservation:Digest;
 calls:{ordinal:number;kind:"create-original-attachment"|"select-original-authority"}[];
}
interface SiteFactoryLedgerOrigin {
 format:"artroom-site-factory-ledger-origin-1";factory:Digest;slot:SiteSlot;
 epoch:Epoch;request:Digest;admission:FactoryRecordRef;
 plan:CanonicalArtifactRef<SiteFactoryPlan>;
 originalOwner:Extract<SiteOwner,{kind:"factory"}>;
 reservation:Digest;tuple:Digest;
}
interface SiteFactoryLedgerState {
 format:"artroom-site-factory-ledger-state-1";
 origin:CanonicalArtifactRef<SiteFactoryLedgerOrigin>;
 revision:number;predecessor:CanonicalArtifactRef<SiteFactoryLedgerState>|null;
 owner:SiteOwner;
 phase:"pending"|"creation-may-start"|"created-unselected"|"selection-held"
      |"selected"|"retiring"|"closed";
 candidate:PendingSiteCandidate|SelectedSiteAuthority;
 uses:CanonicalArtifactRef<SiteUseIdentity>[];
 scopeDuties:CanonicalArtifactRef<DutyIdentity|SiteScopeDutyIdentity>[];
 custody:{ref:Digest;use:CanonicalArtifactRef<SiteUseIdentity>;owner:SiteOwner}[];closure:SiteClosureRef|null;
}
type SiteUseTarget =
 | {kind:"create";seed:SiteSeed;scope:ScopeId}
 | {kind:"select";authority:SelectedSiteAuthority;roomBinding:Digest}
 | {kind:"content";action:"mint"|"borrow"|"host-read"|"response-release";
    repository:{host:string;namespace:string;name:string;id:string};
    commit:ObjectId;path:string;profile:"site-safe@1";
    rights:["repository.read"];requestedExpiry:Timestamp;
    prepared:Digest|null};
interface SiteFactoryUseOrigin {
 format:"artroom-site-factory-use-origin-1";
 factory:Digest;slot:SiteSlot;epoch:Epoch;
 ledger:CanonicalArtifactRef<SiteFactoryLedgerOrigin>;
 owner:Extract<SiteOwner,{kind:"factory"}>;request:Digest;
 requestSource:{kind:"factory-admission";record:FactoryRecordRef;
                envelope:CanonicalArtifactRef<SignedSiteFactoryIntent>}
             | {kind:"scope-admission";fact:FactRef|SiteFactRef;
                envelope:CanonicalArtifactRef<SiteReadSignedIntent>};
 ordinal:number;target:SiteUseTarget;
 boundary:"create"|"select"|"mint"|"borrow"|"host-read"|"response-release";
 context:CanonicalArtifactRef<CompleteSiteUseContext>|null;
 custody:Digest|null;tuple:Digest;
}
type SiteUseIdentity =
 | {kind:"factory";origin:CanonicalArtifactRef<SiteFactoryUseOrigin>}
 | {kind:"scope";owner:OwnerKey;attempt:AttemptKey;invocation:InvocationKey;
    duty:CanonicalArtifactRef<DutyIdentity>|null;
    context:CanonicalArtifactRef<CompleteSiteUseContext>;target:SiteUseTarget;custody:Digest|null}
 | {kind:"site-scope";owner:SiteScopeOwnerKey;attempt:SiteScopeAttemptKey;
    invocation:SiteScopeInvocationKey;duty:CanonicalArtifactRef<SiteScopeDutyIdentity>|null;
    context:CanonicalArtifactRef<CompleteSiteUseContext>;target:SiteUseTarget;custody:Digest|null};
interface SiteFactoryExclusion {
 format:"artroom-site-factory-exclusion-1";factory:Digest;slot:SiteSlot;
 epoch:Epoch;owner:Extract<SiteOwner,{kind:"factory"}>;
 origin:CanonicalArtifactRef<SiteFactoryLedgerOrigin>;closedRevision:number;
 consumedUses:CanonicalArtifactRef<SiteFactoryUseOrigin>[];
 carriedDuties:CanonicalArtifactRef<DutyIdentity|SiteScopeDutyIdentity>[];
 retainedCustody:{ref:Digest;use:CanonicalArtifactRef<SiteUseIdentity>;owner:SiteOwner}[];
 terminalCorrespondence:EvidenceRef;
}
interface SiteFactoryClosure {
 format:"artroom-site-factory-closure-1";factory:Digest;slot:SiteSlot;
 epoch:Epoch;owner:Extract<SiteOwner,{kind:"factory"}>;
 origin:CanonicalArtifactRef<SiteFactoryLedgerOrigin>;
 predecessor:CanonicalArtifactRef<SiteFactoryLedgerState>;
 closedRevision:number;exclusion:CanonicalArtifactRef<SiteFactoryExclusion>;
 tuple:Digest;
}
type SiteClosureRef =
 | {kind:"factory";closure:CanonicalArtifactRef<SignedSiteFactoryClosure>}
 | {kind:"scope";attestation:CanonicalArtifactRef<SignedOwnerRecord<ClosurePayload>>;
    ownerState:CanonicalArtifactRef<OwnerClosedState>;
    exclusion:CanonicalArtifactRef<LocalClosureRecord>}
 | {kind:"site-scope";attestation:CanonicalArtifactRef<SignedOwnerRecord<SiteScopeClosurePayload>>;
    ownerState:CanonicalArtifactRef<SiteScopeOwnerClosedState>;
    exclusion:CanonicalArtifactRef<SiteScopeLocalClosureRecord>};
```

SiteScopeDutyIdentity has exactly 280 DutyIdentity's format/invocation/binding/
plan/admission/purpose/originalDispatcher/originalMintOwner/originalMintInvocation
fields, with the three owner/invocation fields and invocation using dedicated
SiteScope keys. SiteScopeClosurePayload has exactly 280 ClosurePayload fields,
using SiteScopeOwnerKey/AttemptKey. SiteScopeOwnerClosedState and
SiteScopeLocalClosureRecord have exactly the 280 fields with those site-scope
key substitutions. These explicit site-only forms retain 280 original duty,
permit, closure/finalization/no-resend semantics and signature framing, but
need their own declared typed validators and actual runtime tuple before use;
old ScopeRef/Seed/FactRef/OwnerKey validators are byte-identical. No factory
owner or pre-genesis candidate is cast through this site-scope branch.

SignedSiteFactoryClosure is exactly {key:KeyId,payload:SiteFactoryClosure,sig},
with the registered actual factory executor key, actual ownership/tuple and
retained terminal exclusion correspondence; its canonical artifact/signature
framing is Ed25519 over artroom-site-factory-closure-1/newline/canonical
SiteFactoryClosure payload. The signed envelope is separately a raw b74
canonical-json artifact. Actual domain/key/allocation/custody correspondence
remains a security/executor-owner input. A signature alone is
not proof that an older deployed continuation cannot execute. Scope closure
keeps the actual 280 domains, permit/attempt/owner/exclusion/finalization and
DispatchAuthority semantics without alteration.

Plan calls are exactly create then select for attachment, only select for
native; selection consumes only the same verified original result/authority.
No missing genesis/default ID is put in a pre-created scope owner. Origin is
immutable and retains original admission/plan/reservation/owner. State starts
revision0 with predecessor:null, then checked increment/full predecessor CAS;
physical ownership changes require actual original closure. Each custody association's ref is the existing private Digest record reference,
not a response/token hash. Its owner and typed use must match the exact retained
original attempt/invocation/duty/store associations, with no duplicate or
reassigned custody. Neither a bare Digest nor a list entry proves cleanup.
Create/select use may have context:null; mint/borrow/host/release require the
complete context, with no nullable permission fallback. Ledger/use references
never grant access, readiness, new cleanup privilege or a re-mint. Exclusion
precedes closure, which precedes the next closed state: no content-ID cycle.
SiteFactoryUseOrigin.request is only the unsigned intent-domain digest of
its prior actual original/admission envelope identified by requestSource. For
create/select it binds the already retained factory admission/original request;
for content it may bind the already admitted renderer site-read intent under
actual G/A with its exact fact/signature. SiteReadSignedIntent is that separately
adopted new-site schema, not a nullable cast through shipped Intent. Its exact
actual schema/validator/source remains a prerequisite. No origin refers to
the current-use or borrow envelope embedding that origin; their own payload
digests are later different identities. Missing prior admission holds use,
not a synthetic current-use hash substituted for the original. This preserves
prior request -> use origin -> current-use/borrow request -> consumed result.

Plan and immutable pending origin keep pre-creation genesis:null. A later
applied proof is separate in ledger state/selected authority/settlement evidence;
it never rewrites plan/origin bytes. Pending copies compare immutable factory/
slot/epoch/request/seed/scope/owner/resources; genesis may be filled only in the
later typed applied evidence and must match that exact seed/full SiteFactRef.
Native birth remains its actual prior FactRef, never an A creator record.

Every scope/site-scope/factory use binds target explicitly. Create consumes
only its exact seed-derived original scope; select consumes only the full
verified original authority/Room binding. Content target action equals the
boundary and exact repository/commit/path/profile equals CompleteSiteUseContext.
Path is the actual normalized request path under the authorized immutable
commit, not an unchecked browser string; profile is exactly site-safe@1.
Requested expiry/rights match actual admitted request/delegation/current
custody constraints. Prepared is a private Digest reference to the bounded
owner-held response bytes for response-release, never a bearer or public raw
content hash; it is nonnull for body release, null for preceding preparation
or no-body304, whose path/type/eligibility still require this target. An opaque
handle cannot substitute for these explicit cross-bound members. Ordinary
bounded nondisclosing denial when no complete context exists carries no site
bytes/304/private metadata and is not a successful content-use permission.

Actual capacity reservation schema, typed custody associations, state/use
judgments and terminal correspondence remain executable owner prerequisites,
not assumed present because the artifact bodies are closed.

### Current-use decision and terminal native consume

CompleteSiteUseContext has exactly
{service:ServiceId,directory:ScopeRef,bindingEpoch:Epoch,bindingRevision:Digest,
 bindingDecision:Digest,authority:ScopeRef|SiteAuthorityRef,
 authorityDefinition:"platform:rules@3"|"platform:site-authority@1",
 configuration:{fact:FactRef|SiteFactRef,digest:Digest},
 delegation:{fact:FactRef|SiteFactRef,digest:Digest},
 repository:{host,namespace,name,id},publishedCommit:ObjectId,
 publication:{destination:ScopeRef,publication:FactRef,receipt:FactRef,
              proof:EvidenceRef},path:string,rendering:"site-safe@1",viewer}.
Authority definition/ref/fact variants must match the one actual selected
NativeSiteAuthority or AppliedAttachmentAuthority; configuration/delegation
facts belong to that authority and their own canonical byte domains.
Publication facts remain actual G FactRefs under G's actual bundle. Viewer is
exactly the public/members variant below. No absent/null field is complete.

SiteUseContext remains the prefix's exact partial selection record until all
configuration/delegation/publication proofs resolve. Every consuming interface
requires the complete record plus the exact renderer installation/key,
configuration/delegation digests, proved publication/receipt and current viewer
classification. Public viewer is exactly {audience:"public"}; members viewer
is {audience:"members",membership:M,member:MemberId,key:KeyId,
 standing:CanonicalArtifactRef<Observation>,session:Digest}. The session digest is a nonsecret identity,
not its bearer; actual current summary eligibility/standing is still checked.
No renderer or cache infers completion from absent fields or a boolean.

Proposed current-use request is a signed renderer envelope in current-use-domain
bytes. Payload has exactly {v:1,factory,slot,context,renderer:{installation,key},
 owner:SiteOwner,use:SiteUseIdentity,boundary,tuple,nonce,
 notAfter}. Boundary is only mint, borrow, host-read or response-release.
SiteUseIdentity binds the actual owner authority/mint scope (G@3 for native,
A for attachment), holder/read request, operation/attempt/origin where admitted,
configuration/delegation and the explicit exact SiteUseTarget repository/commit/path/profile. An absent
operation is an explicit not-yet-admitted variant, never an invented operation
or license to re-mint an unknown attempt. Exact forms/physical ownership are
an existing executor/custody-owner input.

Current decision is not a lease, bearer, cached permission or reusable TTL
capability. Its signed statement is exactly {v:1,factory,slot,request:Digest,
 tuple,at:FactoryRecordRef,selection:SitePosition,authority:SelectedSiteAuthority,
 use:SiteUseIdentity,boundary,disposition:"current"|"stale"|"held"}.
That statement alone authorizes no consume. Actual terminal native consume
must authenticate and compare the live slot position/authority, complete
context/current configuration, viewer/issuer/service/expiry/custody and exact
original owner at the final native call boundary, with no awaited gap to that
single borrow/mint/host invocation or response-byte release. Any awaited proof,
RPC, host read or response preparation returns to this gate, including cache
hits and304. Replacing the slot invalidates old contexts even if old A's own
configuration remains valid. Buffered bytes cannot bypass the release gate.

One authoritative site-slot owner performs slot mutations and all final
mint/borrow/host/release/cache304 consumption. Remote proof preparation can
precede it; bounded prepared response bytes return to that owner for final
release. Its trusted terminal port serializes full predecessor/owner/context
checks against its actual current slot state and invokes/consumes the exact
native operation in the same synchronous final segment. No awaited gap or
remotely returned disposition supplies final permission. Scope-owned physical
calls use the trusted local280 DispatchAuthority only where complete identities
match; factory-owned calls use the distinct SiteOwner variant and actual
source-supported terminal authority. This design picks that owner/port, not a
generic distributed transaction/fence or an invented callback authority.
The implementation must supply actual selector-to-terminal-consume coupling
and original-owner exclusion proof in the reviewed runtime/executor tuple.
A proposed check-then-remote-call, stale replica, TTL authorization or generic
transaction/fence object cannot satisfy it. This draft adds no generic fence
authority; where the actual runtime cannot provide that coupling, current use
is unsupported/held. A signed disposition:"current" from an earlier call must
not be accepted as substitute evidence. The required operation interface is
consumeCurrentSiteUse(signedUseRequest, terminalNativeAction), where the latter
is the exact owner-bound mint/borrow/host-read/response-release action matching
boundary/use/context. It is not an arbitrary callback or caller-selected URL.
Its opaque handle/wire/native ABI must be supplied by the executor/custody
owner, cross-bound to the actual terminal side effect/release and coherent
tuple. Until that exact owner contract and coupling proof exist, no consume
interface or permission is claimed available by the declaration parser. Started original attempts remain
owned; the next response/use still gates current selection.

Borrowing uses its separate signed borrow-domain request with exactly
{v:1,factory,slot,context,renderer:{installation,key},use:SiteUseIdentity,
 mint:{kind:"native",scope:ScopeRef,operation:OperationId,attempt:number}
    | {kind:"attachment",scope:SiteAuthorityRef,operation:OperationId,attempt:number},custody:Digest,
 tuple,nonce,notAfter}. The private result is an opaque owner-bound borrow
handle, not a bearer in a receipt/history/URL. It binds those exact fields and
can be consumed only by the authenticated dedicated renderer's native host
port after the current-use gate. The existing private store owns plaintext;
borrow completion/expiry cannot pretend provider revocation. Only an actual
original recorded duty authenticates reconciliation/cleanup without new-use
permission. Full current-use/borrow/registration/custody API and actual rights/
ID/expiry/revocation correspondence must be implemented and proved before use.

### Combined c4 plus721 allocation and tuple dependency map

| Component | One combined contract and unchanged boundary | Actual prerequisite/owner |
|---|---|---|
| R/G@3 | One unshipped rules meaning: site acts/items/pointer/observation plus separate configuration-2 keeping and exact selector publishing. One destination meaning: site holders/mint/private borrowing/cleanup plus721 immutable one-file candidate/refused/unknown/late-answer mapping and real operation/time-bound commit reproduction. | Version/platform owners verify unused R/G@3 allocation and whole canonical data/rules/observation/ABI bodies; never competing @3 or rewritten @1/@2. |
| Root/children | Exact coherent register/directory/membership/rules/destination/inbox births and confirmations. Child-creation changes receive verified fresh identities. | Actual allocation inventory and bundle/birth/source/admission proof; do not assume register@3/directory@3 or silently alter @2. |
| Attachment/factory | Independently pinned site authority, exact null-creator seed, full Room binding, single site slot and native-versus-attachment selection above. | Site/contract/executor owners allocate actual kind/definition/profile/byte domains/factory record/CAS forms, publisher/read roles and source correspondence. Proposed site/@1 labels alone are not proof of unused allocation. |
| Signature/trust/custody | Existing controller intent; separate factory/slot publisher, renderer and original recovery signatures/registered custody; no ordinary MemberRef fiction. | Actual service IDs/full addresses, namespaces, public keys, registration/publisher/rotation receipts, secret custody and strict final calls. No key/config guessed or new registry. |
| Viewer/observation | Separate site operation over existing summary-session authentication plus current plain member/key standing; R@3 site observation and independently typed A observation. | Exact contracts/retained domains, historical M/R meaning, current birth/source/session and after-await proofs; v1 SessionClaims unchanged. |
| Publication/navigation | Actual judged first-head/import/integration and written nonconflicting receipt/verified objects; immutable same-commit links/images; eligible branch/tag/human label mappings. | G's actual bundle and receipt/source closure plus navigation owner's exact mapping schema and current eligibility. HEAD/proved-commit staging is not full delivery. |
| One-file/lane |721 base/tree/path/digest/size/previous/target rows, same-mode supersession, actual current predecessor and no intended/committed/unknown merge overlap; new full/demo digests. | Lane/version owners freeze exact new digests and preserve old pins/jobs/reviews/tokens/deadlines. Cross-mode conversion remains held. |
| Checker | Configuration-1 unchanged; exact configuration-2 selector, canonical one-file ABI, immutable image/adapter/resolved-image, closed report/details/reasons and precedence. | Retained actual contracts/code/image/ABI/reference closure and service-read exact job/target/selector; incompatibility before mint/start, never waive required checks. |
| Object/checkout | Pure editTree and separate real editCommit; typed authorized base object closure, real base HEAD/candidate index/all tracked worktree before steps. | Existing local/gateway acquisition and live job custody, actual reader/runner adapter/source; no public site acquisition or fabricated candidate commit. |
| Admission/executor | Separate exact original admission/send/use/resource identities and current terminal consume; pending settlement/retirement/handoff/abort exclude old continuations. | Actual original owner/nonce/release/build/fence/drain/closure proofs and coherent active tuple; no timeout/lease/boolean substitute. |
| Capacity/retention | Protected immutable Room/binding/config/delegation/manifest/job/content/base/ABI/image/proofs; original holders, mint/unknown/cleanup and caches. | Existing capacity owner supplies measured bytes/work/peak/lifetime/backlog allowances and physical reservations; no new quotas or matrix. |

An actual terminal port must also preserve the bounded 721 read/checker
acquisition and280 auxiliary mint/cleanup duties; calling an inspection/read
cannot exempt its physical token mutations from the same owner/exclusion
boundary. These duties retain their own original scope keys or explicit
factory origins, never an invented scope or a transferred live bearer.

The complete signed activation tuple must retain the existing stable service,
generation, runtime release/build, registry/routing revision/digest, bundle-set
and reviewed compatibility identities, and bind the exact combined cohort,
factory/slot/signature/controller/viewer/observation/current-use/borrow/renderer/
publication/navigation contracts; configuration-2/lane/checker/ABI/image/adapter/
report/details/driver identities; authorized reader/host/provider/custody and
actual admission/executor/consume coupling; and measured capacity/retention
reference closure. Every referenced artifact is retained/validated under its
own typed domain before activation. A list of names, ready flag, parser pass
or pure-helper success does not establish this tuple or source support.

### Missing inputs before freezing or source enablement

This draft now implements the six concrete3c owner choices: initialized
absence0/checked next1, exact full-position CAS and separate decision digest,
factory-record/initial/current-state DAG, acyclic offer/acceptance, distinct
factory-versus-280 scope ownership with typed b74 ledger/use/closure artifacts,
one authoritative terminal slot owner, and authenticated full-D locator index.
It chooses exact record shapes and proposed domains, not factual allocations
or credentials. Still missing: verified unused identity/
domain inventory; actual new-kind/domain allocation, configured factory identity and publisher
registration plus controller/renderer/recovery evidence contracts;
SiteAuthorityRef allocation, actual validation/source correspondence of the closed transition evidence and native
consume/borrow wire/opaque-handle correspondence; actual capacity reservation,
state/use/custody association/closure-signature/terminal exclusion schemas and
execution proof;
actual handoff domain/nonce/lifetime allocation and target-controller proof evidence; complete executor/use/resource/
custody references and terminal consume coupling; actual initialized slot/locator publisher/index/adjudication source and signature/key correspondence;
actual operator/factory/renderer/recovery keys, roles, service addresses and
custody/rotation/publication evidence; actual whole historical bundles/builds/
admissions/cohort; actual immutable image/ABI/adapter/code correspondence;
exact authenticated configuration/observation/borrow/receipt/source-read wiring;
provider repository/right/ID/absolute-expiry/revoke proof; navigation mapping;
and measured proof/body/retention/work/peak/lifetime/reservation allowances.

Root must resolve or explicitly carry each remaining actual owner input before freezing this
successor; the dedicated site-scope forms also need exact executor/contract allocation and support. Whole normal DESIGN review/adoption follows; implementation, compact
boundary witnesses, complete integrated source/gate and original filing order
remain separate. No code, grants, parser enablement, imports, tests, gate,
provider, key/config changes or activation were performed for this append.
