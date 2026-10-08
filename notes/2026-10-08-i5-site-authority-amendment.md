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
