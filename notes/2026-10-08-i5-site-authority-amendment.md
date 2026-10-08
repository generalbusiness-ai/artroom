# I5 site authority: configuration, publication and renderer delegation

2026-10-08. Proposed exact owner amendment under existing gitseq request
`a2317893c5728e29cffb14f78439e3ad506fb56a`, following planner direction
`ad796ce00accd758cd6e8f46aa20f2df2ec9feb9`, read in full. Working branch
`request/i5-site-prep`, source checkpoint
`94ad3870a1a361c9b122b0df842b530940efe7d6`; current main read at
`cf4e41e295f1fb8e0e4eb32babc5fd9a0d956656`. Root read this design before
formal owner DESIGN filing; adoption remains owed. It changes no runtime, tests,
keys, configuration or provider state and adopts no new protocol fields.

The planner has adopted the product direction: site visibility is distinct
from repository visibility; explicit public or members policy, absent deny;
durable Room authority controlled by `rules.publish`; a distinct renderer
service principal with an exact-repository read credential; and only proved
published commits. The acts, schemas and authority proof below are proposed
owner amendments, not claimed existing support. Filing remains after
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

Keep ordinary `publish` and checker `keep-configuration` meanings unchanged.
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
{ v:1, directory:ScopeRef, membership:ScopeRef, rules:ScopeRef,
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
{ v:1, directory:ScopeRef, membership:ScopeRef, rules:ScopeRef,
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
`siteConfigured` pointing to that fact. Reconfiguration creates a new item
and causal fact; previous items/bytes remain unchanged. Existing `published`
and revisionOf for ordinary rules publish retain their meanings.

Proposed `disable-site`, also requiring rules.publish and an exact expected
current revision, clears `siteConfigured` in a recorded entry and schedules
cleanup of issued site credentials. A missing pointer then denies rendering.
Removing or superseding a configuration never erases prior delegation facts,
pending mints or cleanup duties. This explicit disable is a site-only
transition, not an extension of checker configuration or a registry of apps.

## Exact authority proof and renderer lifecycle

`SiteDelegation` above is a new site-specific capability proof. It is **not**
an existing ordinary Grant with a service shoved into its MemberRef fields.
The contract/authority owner must adopt its fixed schema, signature/key
binding, causal issuer proof, current-use checks and replay attribution.
Use an existing signed Intent envelope for proposed destination act
`site-read`: actor is the dedicated renderer key; fields name the exact
configuration and delegation facts, published commit/proof facts, requested
expiry and request identity. The platform's new `site-delegation` grant mark
has no ordinary action fallback: an admin's ordinary grant, a copied viewer
session, or a human key cannot substitute for the service proof.

The mark verifies signature, current rules site pointer, exact configuration
and delegation bytes/facts, renderer installation/key, absence of that key
from human membership, exact destination/repository and expiry. It may pass
with no MemberRef under the existing custom-mark mechanism, but its service
identity must be reconstructible from retained signed fields and issuer
facts. The authority owner must specify that attribution before code; no
service-principal support is inferred from the existing Grant.principal.

A proposed rules observation `asked:"site"` returns current `siteConfigured`
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

Destination `site-read` opens a bounded `site-read` holder and one
`mint-site-read` operation under its own new pinned owner. Before minting,
the provider port checks all current proof/expiry/custody conditions and
the exact stable repository. Mint read-only rights for that repository
alone, with absolute expiry bounded by the request, delegation and configured
maximum; reject broader rights, another ID/namespace, missing/invalid expiry
or a late reply. These must be actual validated provider reply properties,
not an inferred TTL. A provider which cannot supply the exact credential
and recorded cleanup behavior cannot enable that site through this port.

Private destination custody stores the secret with that exact mint/attempt,
renderer installation/key, configuration/delegation revision and repository
binding before exposure. Only its judged matching outcome makes it usable.
The renderer borrows it through an authenticated internal port with a
bounded per-read custody handle; no viewer, ordinary credential endpoint,
history, URL or log receives the plaintext. Dedicated renderer signing-key
custody remains separate from human/operator keys and provider tokens.
After any await, recheck configuration/delegation, publication eligibility,
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

The minimal version selector supports only HEAD and exact proved published
commits. Later human-readable version labels need their own Room-issued
mapping; branch/tag listing is not that mapping. Relative links/images keep
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
   select a cache entry or reach the host. Recheck viewer/configuration
   eligibility after awaits and immediately before an answer, including 304.
   Validate path existence/type before 304; a guessed ETag cannot authorize a
   nonexistent path. No failure discloses private titles/listings/commit IDs.

Members responses use private cache isolation and no shared public response
cache. A cache key alone is not authorization. Keys bind exact room,
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
preserved. They have no configure-site/delegation act today. Enabling this
site policy for those rooms therefore needs an explicit owner-reviewed
legacy admission/transition path with exact causal authority, under a new
identity. That path is **not specified or authorized by this proposal**;
inventing an old rules act, checker-configuration reinterpretation, Worker
allowlist or fresh-room substitute would not preserve it. Until it is
supplied, old-room site rendering is unresolved/denied under absent-policy
direction, not claimed fully operational. Complete site acceptance remains
blocked on that old-room functionality obligation as well as the new code.

| Owner | Exact amendment/proof owed before implementation |
|---|---|
| Rules/platform owner | Adopt site-only acts/items/pointer, canonical schemas/domains, previous/expected revision handling, publication guards and current site observation. Preserve ordinary publish/check configurations and old pins. |
| Contract/authority/security owner | Adopt separate renderer ServicePrincipal/SiteDelegation semantics, custom mark with no ordinary grant fallback, dedicated-key registration/custody/disjoint membership proof, exact current-use and replay attribution, and typed internal configuration read. Ordinary Grant does not already provide this. |
| Destination/host/custody owner | Adopt exact published/receipt proof, new scoped operations/holders, actual returned read rights/expiry, authenticated private renderer borrowing, original-attempt identity and durable cleanup through all failure/restart/late-answer cases. |
| Session/site owner | Adopt site-authority@1 and separate siteViewerEligibility over existing authenticated membership-summary eligibility plus current standing, before all caches/304/ref/host access; do not add site permission to old SessionClaims. Adopt private internal partitioning/invalidation, external no-store and controlled-cache bypass, final post-await checks and same-commit link resolution. Any alternative external cache policy needs separate adoption. Name actual recall/expiry limits; already delivered bytes cannot be recalled. |
| Version/Room owner | Allocate unused shipped identities and provide the explicit old-room admission/transition with retained exact authority and functionality, consistent with historical provenance and multi-register routing; no automatic migration. |
| Existing capacity owner | Bound configuration/delegation bytes and retained versions, holder/operation reservations, reads/proof closure, outstanding credentials, cleanup backlog and private cache work using existing capacity evidence. No new numbers or matrix. |

## Compact boundary witness plan after owner adoption

Strengthen existing rules, destination, session, custody and site witnesses:
unauthorized configure changes nothing; exact controller configuration and
delegation facts replay; absent/unknown/disabled policy denies; another
room/incarnation, human key or expired/broader renderer grant cannot mint or
borrow; current member/key changes refuse site bytes and 304; cache hits
cannot bypass that gate; path-before304 remains; unpublished operator/tag/
proposal commits are refused despite valid host objects; a real judged
first-head/publication plus written receipt selects exactly its commit;
restart/lost/late mint and failed cleanup retain their original duties.
Preserve old-room histories and prove the explicit transition once defined.
Use the existing selected safe-output witnesses, not a new conformance or
provider/version matrix. No tests, compilation, gate or provider probes ran
for this draft. Implementation, integrated review and full site delivery
remain in existing a231, after read/clone.
