# Historical definition provenance and host routing

2026-10-08. Design proposal for review, within gitseq requests
`48407a70e3083e8ef396db347e064b2cd6e9879f` and
`9be26ef7e1a4aac138bc0637d7ed121e26fcd105`, following planner direction
`ff632296eb436ae51f98d4d7d43ead4e7c50f68e`. Branch
`request/i5-version-routing-design`, base
`cf4e41e295f1fb8e0e4eb32babc5fd9a0d956656`. This note changes no code,
tests, configuration or history. It approves no deployment or provider
operation. New historical-resolution and routing choices below need normal
design review and adoption before implementation.

Revision for findings `2720f4eb70e4ec7b729a1ffdc3a10a1e3a7f8139` and
boundary clarification `a347c1e6d4ac22ff1a8fc683805f16bb46ada220`, both
read in full. Committed predecessor
`5fa375edd27ebae89b0706adbce4cd7e0a260cab` remains immutable. Root read the
subsequent b26 predecessor revision in full; procedural artifact binding belongs to
the planner. Gate1 has separately passed its gate, been approved and landed;
this design changes none of that reviewed source.

Further proposed clarification follows checker preflight
`75d62028d7c9e83118c2fc71224cc16b8b77f89e`, read in full. Root chooses the
conservative outstanding-send-permit proposal below. Committed predecessor
`b26dd2936bebf529b9ae38c545482c220a791930` remains immutable; this note
revision has been read in full by Root and is ready for the normal owned
successor design review. The choice still needs the named owners' adoption
and proof before implementation.

Explicit versions for future semantic changes are already adopted. This
proposal supplies the missing choices for histories which already use one
legacy name for different implementations, and for continuing host writes
through both old and new registers. Filing order remains Gate1/1b, live
reads, clone, site, then edit/version combined. Reviewed Gate1 is unchanged.

## Evidence and the problem

Source observations below are read-only. Live results are the planner's
recorded evidence, not a new run by this author.

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| Original main `52c3769b5569eb7e49a790771e767d9ffcc53736` | Original platform data and executable rules; no destination read-token or membership first-list grant for it | The source actually used by every deployed room |
| Clone/destination-read source `87ba6faba759603aeaf968561ab894a3ae323aea`; assertion `edcbe04984703a08b2f270c08947209bb9dd006d` | Planner reports Worker `416b5394` deployed at 14:18 Eastern on October 7. The 14:19:31 register is `sc_y6fhyph3s75dhsynm4s7ukotkmqkeicdyqnbuqaslcaunbspg33q`. Its room is directory `sc_pjpl7g2x...`, membership `sc_vlfh2myo...`, rules `sc_i2gegpd7...`, destination `sc_ezngnqra...`, repository `artroom-demo/pjpl7g2xkukgjwtjq7zdjzkq7c26e2z3xkjmlxuv5mc3oxpoy2yq-1`. Read-token and mint outcome were destination entries 8 and 9; six replays were reported consistent at 14:22:38 | Full scope/incarnation IDs, exact genesis and head hashes, retained bytes, build digest and an authenticated deployment-to-source binding |
| The same assertion's 09:56 room finding; checker `cf00d48ef4cfeefbf38053226a209d03b7b14cc7` | Clone-era code changed existing `@1` meaning; old-room membership/directory/rules/destination/inbox replay mismatched | A repair or trustworthy selection of historical code |
| Versions delivery `f4859a3d83458653f386ccf20a50457978df1ebd`, own base `5de2b850aa2b5ab54982d30ec391481ec4ea7e33` | Source restores original-main data/first lists as `@1`, introduces `@2`, routes observations and operations by genesis pins | Compatibility of clone-era `@1` histories, a passing local gate, or retained old-register host writes |
| Member story `2275e82c92b5c2dfe33baebc70d9d8fc1a0385d5` | At 17:35 the same 14:19 room ran on Worker `416b5394`, source `87ba6fab`. Full directory ID is `sc_pjpl7g2xkukgjwtjq7zdjzkq7c26e2z3xkjmlxuv5mc3oxpoy2yq`. Membership invitation entry 5, member join/inbox `sc_ewnlavk3...`, destination read-token entry 10, member-session consistent membership/destination/inbox replays and site 200 were reported | Exact subsequent head hashes, full child/incarnation IDs, retained histories and an archived runtime bundle |
| Explicit version/edit run `1ee62de379a761a4f222553da94f6c427bba2b1c` | Source `13ae305505d910b23d44e524860dc788cbcc5a8f`, Worker `b905dfe1` at 19:47; a fresh register at `@2`, directory `sc_7zed42beqpspbwelen5t5qznijkfcifg3mro2bgt6c4ktwkrv2vq`, README founding and edits/clone were reported at 19:47-19:51 | Compatibility of the 14:19/17:35 legacy history or a complete exact retained-history/source binding |

The 14:19 room was founded under clone-era semantics still labelled `@1`.
Restoring original `@1` globally would change its membership genesis lists
and remove its destination entries' act and outcome rules. A new original
`@1` test room and a successful fresh `@2` room cannot establish that this
retained history survives. The 17:35 member story extends that same legacy
room's history. It is not a version-era replacement room. The 19:47-19:51
fresh `@2` run must not replace compatibility evidence for either earlier
scene. All three need their actual recorded heads and source bindings.

The versions test's equal membership `@1` and `@2` data digests are correct:
their declarative data is the same. Their executable `role-table` behavior
and observation identity differ. A data digest alone is not executable
identity. The same distinction applies to register child versions.

## Proposed historical source resolution

**V1. Retain a complete semantic bundle permanently.** Give each shipped
implementation a content-addressed bundle manifest containing canonical
data bytes and digests, executable source/build digests, build recipe and
dependency/toolchain identities, the evaluator ABI, rules and mark table,
observation/observed-value derivation, membership/rules-reference derivation,
historical grant/authority derivation, and capability versions/code. Include
outside-adapter evidence interpretation and credential-handle derivation
where they affect those histories. Provider secrets are never part of it.
Keep the actual bytes and build inputs, not just Git hashes or mutable
package exports. A bundle absent or incomplete locally cannot be run.

The archive is a narrow immutable binding manifest and the bytes needed by
the existing pure evaluator through explicit ports, not a new engine or an
archived Worker with active bindings. Historical evaluation reconstructs
sealed judgments, observations, grants and capability effects from recorded
facts and time. It sends no provider requests and issues no present sessions.
Current transport and admission guards remain outside that evaluator.

### Operation boundary and precedence (proposed V1a)

| Operation | Historical bundle governs | Current service boundary governs | Unresolved provenance |
|---|---|---|---|
| Pure historical verification | Sealed act judgment, recorded-time grant derivation, observations at their recorded heads, capability effects and interpretation of recorded outside answers | Authentication only when acquiring remote bytes; registry publisher trust and coverage validation | Incomplete, with exact missing/conflicting binding; no historical grants promoted to present authority |
| Authenticated genesis/raw acquisition | Nothing: acquisition does not judge the scope or grant authority from its history | Current signature/MAC, deployment, clock/expiry, full ScopeRef, named read, typed retained-resource eligibility and strict `43d` birth checks; cheap format/address checks before RPC and final post-await checks | Only the separately adopted bootstrap access below remains available; ordinary unresolved semantic authority confers no access |
| Current live mutation and provider dispatch | The scope's resolved bundle determines its admitted act/rule/capability meaning; a resolved membership bundle interprets current membership standing at its current head | Current admission, freshness, revocation, standing eligibility and transport checks plus `43d` full-reference preparation and final post-await checks; exact activation and original attempt/provider binding | No grant preparation, sealing or dispatch; records, pending attempts and custody retained |

Precedence is conjunctive, not a fallback: current transport checks pass
first, then proven bundle resolution, then the bundle's semantic judgment
under current admission/freshness checks. Access, provenance and activation
preflight refusals seal no scope entry and send no provider request. After
those preflights resolve, a semantic refusal keeps the actual contract's
recorded/refused behavior; this design does not replace it with a universal
no-write rule. Historical evaluation uses historical facts only;
current helpers must not reinterpret a sealed old act or manufacture its
past grant. Archived reader/session code must never replace current strict
guards. Current standing is a fresh reading, not an archived observation.

**Bootstrap proposal.** Publish nonsecret signed registry manifests outside
scope-semantic access. Provide a narrowly named raw genesis/history
acquisition path to an operator identity pinned in the service trust
configuration, with an explicit complete-ScopeRef allowlist and purpose.
It checks current signatures, replay/expiry limits, service/deployment
address and typed bytes/hash linkage without deriving membership from the
unresolved history. It is read-only and never returns private custody or
provider tokens. Membership readers use the ordinary current `43d` path
only after their required bundle is resolved. An unknown bundle cannot
bootstrap its own authority. An explicitly local retained export is another
input, labelled with its operator/source trust. This operator bootstrap
access and its bounds require contract/security-owner adoption; it is not
asserted to exist in current code. Without adopted authenticated acquisition
or a supplied trusted export, resolution stops incomplete.

Session and token promises remain those of the actual present issuance and
serving code: current session MAC/deployment/expiry, existing standing checks
where that operation performs them, and credential one-time take/expiry and
recorded revocation duties. Key removal does not imply instantaneous
invalidation of every issued read session or external bearer token. Any
stronger revocation promise needs its own explicit owner amendment; `43d`
shows strict aged birth reads, not that broader promise.

**V2. Bind legacy scopes to bundles with operator evidence.** Proposed
nonsecret `HistoricalSourceBinding` contains stable service identity, complete
`ScopeRef` (kind/scope/incarnation), exact applied genesis entry hash,
legacy definition name, bundle ID, an exact witnessed head, and the
immutable admission release/build receipt and adopted decision which attest
the source used. Stable service identity names the continuing logical
service; it is not the current Worker release or current session deployment
label. Admission release identifies the binary/configuration which actually
admitted the witnessed history. Current release identifies the runtime now
executing requests. Rollout changes the last, never the first two. Session
deployment addressing continues to use its adopted current rules.
The host operator supplies the evidence; the definition owner attests the
semantic bundle; normal independent review checks correspondence. A
timestamp, room nickname, history shape, inferred feature presence or
successful replay under one candidate is not sufficient provenance.

Bindings live in a durable operator registry separate from scope histories,
keyed by stable service identity, complete ScopeRef and genesis hash. Entries
are append-only decisions with a revision and their evidence references. A
runtime loads one explicit registry revision and checks its digest;
duplicate/conflicting bindings fail closed. Registry changes are operator
actions reviewed under these existing requests, not membership actions or
automatic discoveries. The replay client receives the same nonsecret
manifest and decision evidence through an authenticated operator publication
or an explicitly supplied local manifest; it reports this trust basis.
Scope membership itself cannot choose its code. A current release must
explicitly declare compatible execution of each resolved bundle; its own
release identity does not select historical semantics.

**Canonical registry trust proposal.** Use the repository's canonical byte
form and a domain-separated content digest for the manifest, with signatures
over stable service ID, monotonic revision, parent digest, manifest digest
and publisher key ID. A nonsecret operator trust anchor is pinned through
reviewed service configuration; remote connection identity alone does not
authorize a registry publisher. Signer authorization and key succession are
operator decisions. Rotation is signed by the prior authorized key and
adopted under the trust anchor; lost/compromised-key recovery needs a separate
explicit operator trust reset. A scope cannot supply an alternative anchor.

Online runtimes pin the active registry digest/revision in the activation
tuple below and retain a monotonic accepted floor; a valid old signature
cannot roll that floor back. Replay at an explicitly pinned historic revision
reports that revision, operator trust and covered heads, with no claim of
current freshness. An online client requires the operator-authenticated
active revision and fails unavailable/conflicting publication rather than
using a cached older revision silently. A local manifest requires explicit
acceptance of the same configured operator anchor or a visibly supplied
operator-trust override; it is never trusted because a scope returned it.
Signature/hash validity proves publication identity, not actual executable
correspondence; admission build/source evidence is still mandatory.

**V3. Resolve by provenance, never by a legacy name alone.** Proposed
`resolveHistorical({service, scope, genesis, named, targetHead}, registry)`
returns a complete bundle plus evidence, or a typed unresolved/conflict
result. A historical verifier acquires genesis and the target chain through
the semantic-independent authenticated boundary above, then resolves every
referenced scope similarly. Existing future unambiguous versions continue
through the adopted version catalog.
Legacy `@1` scopes require an explicit binding; absence does not default to
original main, clone-era code, or newest `@2`. Read access still obeys all
existing guards. An authorized raw history read can remain available when
semantic verification cannot proceed.

**V4. A single bundle requires whole-history correspondence.** The supplied
head must equal or descend from the binding's genesis on the verified chain;
coverage is only the exact witnessed head and its verified ancestors.
Extending coverage requires a signed registry amendment naming the new exact
head, unchanged prefix, continued bundle, and actual admission release/build
evidence for that extension. A wall-clock range, latest deployment, or
successful replay cannot extend coverage. Live continued execution requires
the active runtime's reviewed compatibility declaration for this bundle and
activation tuple; the operator's initial witnessed head alone does not grant
permission for later writes. If one retained scope was actually admitted
by different semantics, do not silently pick a bundle which reproduces only
its genesis. Mark it unresolved and retain the records. Exact code intervals
bound to entry hashes and admission receipts would need a further explicit
owner decision; this proposal does not authorize such a mechanism or claim
that it is sufficient. Historical evaluation must never accept a semantic
switch merely because it produces consistent output. Mixed-history refusal
preserves records with paused semantics; it does not prove that every legacy
room remains operational.

**V5. Unknown provenance permits no semantic mutation or outside action.**
Runtime preparation fails before grants, sealing or dispatch; pending
operations and private custody remain held. Replay reports incomplete with
the unresolved provenance and coverage, rather than consistent. Proposed
public reason `definition-provenance-unavailable` needs contract-owner
adoption; until then use the existing unsupported-definition boundary with
an explicit diagnostic. No genesis/history rewrite, silent repin, reassigned
incarnation, automatic migration, or fresh-room substitution is allowed.

This registry costs retained artifacts and explicit operator work. A static
signed manifest would be simpler but less suitable for durable amendments;
using raw history shape is simpler still but cannot establish provenance.
The chosen registry design remains a proposal pending the owners below.

## Proposed host routing

**H1. Keep explicit old and new roots.** Replace the one-register host pin
with a bounded list of `RegisterBinding` records. Each contains a complete
register ScopeRef, applied genesis hash, resolved semantic bundle, and exact
provider identity, host and namespace. Existing GitHub issuer, installation,
account, byte bound, privacy and credential policy remain binding fields;
Artifacts keeps its one bound namespace and byte bound. This work adds
register roots within the same adopted host capability, not unrelated
accounts, namespaces, provider rights or repositories. Each new register
requires an explicit operator binding decision. Installing it or owning a
membership grants no host authority by itself.

**H2. Select exactly one binding from retained provenance.** Proposed
`bindingForRegister(given, bindings)` matches the exact current register and
its genesis. `bindingForDestination(given, bindings)` retains all current
`destinationBirth` checks: exact verified claim, its retained found entry,
directory derived from its recorded seed, actual creator and held directory,
and matching repository host/namespace. It additionally matches the claim's
complete register reference and that register's bound genesis/bundle.
Operation owner must equal the destination's own genesis pin, and source
resolution must be complete. Zero or multiple matches sends nothing;
selection never uses array order, newest version, repository prefix alone,
an ID-only join, or a claimant's supplied routing hint.

**H3. Keep capabilities and custody exact.** The selected adapter receives
only the existing operation's exact repository, binding, attempt, lifetime,
write ref and validated object set. A root list confers no namespace-wide
token. Keep per-destination CredentialStore ownership, exact confirmed
outcome backing, signing-key/session guards, expiry, one-time reads and
revocation duties. Do not move plaintexts or credential handles between
roots or scopes, remint on routing changes, relax current-standing checks,
or reuse creation authority as read/write authority. Lost/unknown outcomes
remain held under their original attempts. Recovery, retained replies,
credential retrieval and cleanup must use the same selected binding as
dispatch; they must not fall through to another root.

**Immutable attempt binding.** Proposed nonsecret `AttemptBinding` is keyed
by exact scope/incarnation, origin entry hash, operation and attempt. Before
the first outside send, persist its semantic bundle, RegisterBinding content
ID, exact provider/account/installation/namespace/repository identity and
capability/ref/lifetime limits with the attempt's existing durable ownership.
Dispatch, recovery, retained replies, credential retrieval and cleanup after
restart look up that original binding. They do not choose a new binding from
the current root list. Custody retains the original handle and scope keys.
Amendments may extend provenance coverage or add compatible runtime releases;
they cannot alter an admitted attempt's provider identity or capabilities.
Secret rotation may supply new secret material only for the same adopted
provider identity and rights; it never expands the attempt's authority.

An existing attempt without this side record needs exact retained facts and
operator evidence to bind it once, with an explicit reviewed decision. Do
not infer the binding from current settings or rewrite its history. Unknown
or conflicting attribution pauses its outside work and preserves its
custody/duties. Runtime code may rotate only through reviewed compatible
implementations of its bundle and capability semantics. This is an explicit
port/attempt contract, not a second outside-effect engine.

**H4. Activate one compatible revision set.** Proposed config schema
version 2 replaces `registerScope` with `registers`; the parser retains exact
field checks and rejects duplicate/conflicting identities and invalid whole
configurations. A candidate limit is 16 roots per existing provider binding,
not adopted or measured. The owner must choose the root and manifest-size bounds from the
capacity evidence; this design asserts no numerical readiness. The operator
publishes a signed activation manifest containing one coherent tuple:
stable service ID, activation generation, current runtime release/build,
registry revision/digest, routing revision/digest, bundle-set digest and
reviewed runtime/port compatibility declaration. A trusted durable active
pointer selects that tuple atomically; publishing artifacts or observing a
new Worker version alone does not activate it. Every referenced artifact
must already be retained and validated. A single old config can remain
supported as one root only after its full identity/provenance is resolved;
an ID alone must not be promoted into authority.

Each scope object identifies its loaded tuple and verifies that its runtime
supports it. Semantic preparation/sealing requires an admission ticket;
physical dispatch separately requires a send permit. Both are issued by the
durable coordinator for that tuple. A stale cached object reloads compatible
manifests through explicit current ports or refuses affected work. All live
code runs current guards, including final checks after awaited preparation;
no archived Worker receives bindings.

**Admission tickets.** The coordinator serializes issuance and transition
to draining in its durable transaction. An admission ticket binds generation,
tuple, exact scope/incarnation/head and operation. Once draining begins, no
new old-generation ticket is issued. The scope finalizes it in its existing
transaction with the exact committed entry, or an atomic abort record which
precludes later commit under that ticket. Duplicate processing cannot reopen
an aborted ticket. The coordinator authenticates that exact finalization
before retiring the ticket. A logical send mark is not finalization of the
separate physical-send permit.

**Conservative physical-send permit sequence.** The chosen proposal is:

1. The coordinator issues a durable send permit for the exact generation,
   tuple, immutable attempt/provider/capability binding, and one dispatcher
   owner. Owner identity includes stable service ID, namespace/object ID,
   complete ScopeRef, a fresh owner nonce and its runtime release/build.
   Those fields are bound to the permit and held in the scope's durable
   attempt record; a restart
   cannot silently adopt the nonce or mint another permit for the same
   original mutation. Draining stops new old-generation permits.
2. Before `markSent`, an atomic abort may finalize the permit only if its
   owner is durably fenced from marking or calling later. The coordinator
   authenticates the exact abort/fence record. An unanswered RPC, timeout or
   expired lease is not that proof.
3. In its existing durable transaction, the dispatcher commits `markSent`
   once for this owner/nonce/release and original attempt. This makes that
   dispatcher irreversibly responsible for the sole original mutation and
   conservatively classifies it as **may have started before the call**.
   The send permit stays outstanding. The logical mark neither proves that
   a provider call occurred nor authorizes retiring the permit. After this
   mark there is no abort-to-unsent and no original resend, including a crash
   before entering the provider call. The original attempt's uncertainty and
   reconciliation duties remain; no activation manufactures an outcome.
4. Immediately before the sole actual mutating call, the explicit live port
   checks the current authority/freshness/custody conditions and exact
   original binding, plus the still-open permit and matching owner nonce,
   release and tuple. After any awaited preparation it rechecks the durable
   owner/closure state at the actual call boundary. No asynchronous gap may
   separate that final owner/fence check from invoking the original mutation
   in which a closed continuation could resume without checking again.
   This requirement covers nested adapter continuations that can invoke the
   mutation, not merely entry into an outer async provider wrapper. If a
   final check refuses after `markSent`, preserve the marked attempt and
   establish closure; do not reset it to unsent or retry the original call.
5. The permit remains outstanding while any continuation of that owner can
   still invoke the original mutation. The executor records durable closure
   of this exact owner/nonce/release/attempt only after it establishes a
   fence which prevents every such continuation from starting that call.
   A stale continuation must observe the closed owner and cannot revive it
   or acquire a new permit for the original mutation. If the call already
   entered, closure must also prove that no continuation can invoke it again.
   Recovery may prove closure after a crash; it cannot assume it from silence.
   The coordinator authenticates the closure/fence evidence, matching permit
   and durable owner record, then retires the send permit in its transaction.
6. Activation flips only after all admission tickets have authenticated
   commit/abort finalization and all old-generation send permits have this
   authenticated durable closure/fence. Unknown/crashed ownership blocks the
   flip until recovery establishes that evidence. The remote outcome need
   not finish once no original local mutation can start: unknown outcomes,
   late answers, private custody, recovery reads and cleanup duties still
   survive under the original attempt/binding and compatible new tuple.

The transaction/executor/port owners must identify the concrete owner fence
and prove the final-call exclusion, including suspended and nested
continuations and restart. A durable `closed` row alone is insufficient if
an old continuation can bypass it. Where the underlying executor cannot
establish this fence or authenticated closure, the permit cannot retire and
activation remains blocked. No timeout or lease establishes quiescence.
This uses an explicit permit contract around the existing attempt driver;
it does not introduce a second effect engine, atomic provider transaction,
instant token revocation, or a claim that current code implements the fence.

Old releases without this barrier cannot participate in activation. The
operator must first verify their replacement/drain, including outstanding
calls and durable attempt/custody state; a new Worker label or presumed
global restart is insufficient. Failure to prove replacement/drain blocks
activation. Objects prove convergence per relevant operation. This proposal
promises no instant session or external-token recall.

New claims/roots stay disabled until the tuple validates all existing roots,
bundles and pending attempt bindings, the operator explicitly admits the new
root, and that register's object presents the same active generation at its
claim boundary. Precomputed exact install/genesis pins may support preparing
the binding; they do not grant host authority before activation. On a mixed
tuple or unavailable coordinator, no affected sealing/send/new claim occurs.
Approved old duties run only through a complete compatible tuple and their
original bindings; they are never served through a partial revision mix.

Old-root removal needs a separate operator decommission decision after
pending writes, custody and cleanup duties are accounted for. It is not
part of introducing a new version. Routing config must retain all existing
roots while new roots are added. An unavailable root pauses its operations
without deleting duties, weakening pins or choosing another provider.

The bounded list keeps routing selection simple and inspectable. A global
namespace allowlist would be smaller but would broaden authority; one
register would keep the current parser but strand old rooms. Neither meets
this task. A separate general provider registry is unnecessary here.

## Rollout, failure and rollback

1. Obtain exact historical evidence, archive bundles and review/adopt V1-V5
   and H1-H4. Keep clone work independent where it has no unresolved choice.
2. Implement source resolution and routing on the isolated integration
   branch, retaining strict full-reference session preparation, typed
   retained checks, private exact joins and all `43d` rules-birth repairs.
   Do not mechanically merge the ID-only `87ba6fab` preparation.
3. Validate retained old histories and exact old-root routing before enabling
   new-room claims. Deploy additive configuration containing both roots;
   witness its coherent activation tuple and per-operation convergence, then
   separately install/bind new roots under the adopted future-version policy.
   This ordering is subject to the exact
   precomputed-install pin procedure and owner approval of live actions.
4. If correspondence, registry or route selection fails, expose a bounded
   diagnostic and pause affected mutations. Preserve raw records, pending
   operations and custody. No fallback to a default version or root.
5. Roll back by a new monotonic activation generation referencing a complete
   compatible runtime/registry/routing/bundle tuple, never by lowering the
   trusted registry floor. It must preserve every admitted root, bundle,
   immutable attempt/provider/capability binding and custody/cleanup duty.
   Review admission-ticket finalization and physical-send-permit closure
   exactly as for forward activation.
   After a new root has duties, removing it is not a safe rollback. Keep the
   compatible runtime and disable new claims while repairing; an older binary lacking
   admitted bundles cannot be used to resume those scopes. Never restore old
   configuration by dropping custody or outstanding cleanup.

## Owner amendments and remaining inputs

| Owner | Exact proposed amendment or input |
|---|---|
| Scope contract/security/transaction/executor owner | At section 6.1, define complete semantic identity and legacy binding trust; at section 16.1, require provenance for each historical subject and report coverage/trust. Adopt V1a operation precedence, exact bootstrap read eligibility, typed unresolved reason and V4 mixed-history refusal. Adopt and prove separate admission finalization and conservative physical-send permits, exact owner/nonce/release fencing, irreversible markSent classification, abort exclusion, final actual-call checks and authenticated closure. Coordinator reads, logical send marks, silence and timeouts are not physical-send closure. No change to seed/history bytes. |
| Existing capacity/contract owner | Account for coordinator issue/finalize transactions, peak outstanding admission tickets/send permits, authenticated recovery backlog, retained abort/owner-nonce/fence exclusion, old/new runtime overlap, root/manifest/reference-closure work and archive bytes. Choose work and storage bounds from capacity evidence, with no numerical readiness claim or new matrix. Backpressure may refuse new work but must retain issued tickets/permits and old duties. Establish the actual consistency domain before considering sharding; throughput cannot weaken the barrier. |
| Platform/authority owner | Preserve historical executable/observation/grant derivation while current strict `43d` transport/admission guards retain precedence; attest original-main and clone-era bundle correspondence and compatible current ports. Name actual session/token serving and revocation behavior; no inferred instant invalidation. Shared helpers alone are not an archive. |
| Deployment/host operator and planner | Supply 14:19/17:35 and 19:47-19:51 exact Worker/build-to-source receipts, full scope/incarnation/genesis/head bindings, histories and reference closure; establish any mixed implementation. Adopt stable service identity, canonical signatures/trust anchor, publisher authorization, freshness floors, key rotation/reset, and coherent activation tuples. Supply both exact register roots and existing capability scope without secrets. Procedural review artifact binding remains the planner's work. |
| Host adapter owner | Adopt `RegisterBinding` and immutable `AttemptBinding`, exact single-match selection, bounded additive config, original-provider recovery/read/cleanup, cached-object convergence and decommission/rollback duties. Prove sole original mutation and closure across nested port continuations, with final current authority/custody checks and no original resend after markSent. Numeric bounds remain unadopted and unmeasured. Amend `docs/deploy.md` and `docs/hosts.md` from one register to explicitly adopted roots. |
| Replay/client owner | Add narrow contextual bundle/pure-evaluator interfaces and explicit operator trust, pinned revision and exact head coverage reporting; preserve current access checks. Local manifests require explicit operator trust. CLI must not silently resolve missing legacy provenance or advertise fresh-room success as old-room support. |

The 14:19 and 17:35 attestations identify the same room and source; they
still omit exact genesis/head hashes and full child/incarnation IDs. The
19:47-19:51 evidence identifies the new directory and source but likewise
does not supply a complete retained-history binding. These are evidence
owed, not inferred identities. The permanent source archive and authenticated
registry cannot be approved on those omissions. Future-version adoption alone does not
adopt any of these historical or routing choices.

## Compact validation plan after adoption

Follow [docs/testing.md](../docs/testing.md). Strengthen existing witnesses,
not a new version/provider matrix: platform `versions.test.ts` keeps data
pins and the equal-membership-digest/executable distinction; scope
`versions.test.ts` adds replay of authentic retained original and clone-era
histories selected by exact provenance, plus unresolved/conflicting refusal
and a target beyond its attested coverage.
Use the existing production host-wiring/founding boundary to show both roots
retain exact writes, a foreign root is refused, and unknown provenance sends
nothing. Existing signed-read/session, read-token/custody, host reply and
cleanup witnesses must still distinguish their guards across restart and
config changes. At the existing real read/session boundary distinguish wrong
incarnation, stale/expired access and changed current standing according to
each operation's actual serving rules; historical consistency alone is no
access evidence. Existing host/attempt witnesses cover cached revision
mismatch and retention of the original provider binding through restart and
rollback. Strengthen those boundaries after owner adoption, not a separate
activation test matrix. Preserve existing rules-birth witnesses during
reconciliation.
Only the producer performs relevant focused checks and one gate at the
review head. A later authorized live witness must read the actual 14:19 and
17:35 histories and their pending/custody states; do not replace either with
a fresh room. No tests or live operations were run for this design note.
