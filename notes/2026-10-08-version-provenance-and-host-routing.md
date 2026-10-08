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

Explicit versions for future semantic changes are already adopted. This
proposal supplies the missing choices for histories which already use one
legacy name for different implementations, and for continuing host writes
through both old and new registers. Filing order remains Gate1/1b, live
reads, clone, site, then edit/version combined. Frozen Gate1 is unchanged.

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
authority and session semantics, and capability versions/code. Include
outside-adapter evidence interpretation and credential-handle derivation
where they affect those histories. Provider secrets are never part of it.
Keep the actual bytes and build inputs, not just Git hashes or mutable
package exports. A bundle absent or incomplete locally cannot be run.

Historical evaluation uses those archived implementations. New host
transport plumbing may surround them only where its correspondence is
explicitly reviewed; it cannot substitute new judges or authority rules.
Do not import an archived Worker wholesale into a replay and activate its
bindings: historical evaluation is pure and sends no provider requests.
Safe runtime execution must separately retain the bundle's authority and
capability meaning through the deployed ports.

**V2. Bind legacy scopes to bundles with operator evidence.** Proposed
nonsecret `HistoricalSourceBinding` contains deployment identity, complete
`ScopeRef` (kind/scope/incarnation), exact applied genesis entry hash,
legacy definition name, bundle ID, an exact witnessed head, and the
deployment/build receipt and adopted decision which attest the source used.
The host operator supplies the evidence; the definition owner attests the
semantic bundle; normal independent review checks correspondence. A
timestamp, room nickname, history shape, inferred feature presence or
successful replay under one candidate is not sufficient provenance.

Bindings live in a durable operator registry separate from scope histories,
keyed by deployment, complete ScopeRef and genesis hash. Entries are
append-only decisions with a revision and their evidence references. A
deployment loads one explicit registry revision and checks its digest;
duplicate/conflicting bindings fail closed. Registry changes are operator
actions reviewed under these existing requests, not membership actions or
automatic discoveries. The replay client receives the same nonsecret
manifest and decision evidence through an authenticated operator publication
or an explicitly supplied local manifest; it reports this trust basis.
Scope membership itself cannot choose its code.

**V3. Resolve by provenance, never by a legacy name alone.** Proposed
`resolveHistorical({deployment, scope, genesis, named, targetHead}, registry)`
returns a complete bundle plus evidence, or a typed unresolved/conflict
result. A historical verifier first reads the authenticated genesis and
target chain, then resolves every referenced scope similarly. Existing
future unambiguous versions continue through the adopted version catalog.
Legacy `@1` scopes require an explicit binding; absence does not default to
original main, clone-era code, or newest `@2`. Read access still obeys all
existing guards. An authorized raw history read can remain available when
semantic verification cannot proceed.

**V4. A single bundle requires whole-history correspondence.** The supplied
head proves the binding's observed coverage, not permission to guess later
entries' source. Operator evidence must also establish which implementation
continues to execute that scope. If one retained scope was actually admitted
by different semantics, do not silently pick a bundle which reproduces only
its genesis. Mark it unresolved and retain the records. Exact code intervals
bound to entry hashes and admission receipts would need a further explicit
owner decision; this proposal does not authorize such a mechanism or claim
that it is sufficient. Historical evaluation must never accept a semantic
switch merely because it produces consistent output.

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

**H4. Publish and load a complete routing revision.** Proposed config schema
version 2 replaces `registerScope` with `registers`; the parser retains exact
field checks and rejects duplicate/conflicting identities and invalid whole
configurations. A candidate limit is 16 roots per existing provider binding, not adopted or
measured. The owner must choose the root and manifest-size bounds from the
capacity evidence; this design asserts no numerical readiness. The operator publishes the
complete list atomically and redeploys/restarts using the existing procedure;
already-running objects may hold old settings, so claiming a new root waits
until the active revision is witnessed. A single old config can remain
supported as one root only after its full identity/provenance is resolved;
an ID alone must not be promoted into authority.

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
   witness its active revision, then separately install/bind new roots under
   the adopted future-version policy. This ordering is subject to the exact
   precomputed-install pin procedure and owner approval of live actions.
4. If correspondence, registry or route selection fails, expose a bounded
   diagnostic and pause affected mutations. Preserve raw records, pending
   operations and custody. No fallback to a default version or root.
5. Roll back to the previous known complete registry/routing revision only
   if it still serves every admitted root and semantic bundle. After a new
   root has duties, removing it is not a safe rollback. Keep the compatible
   runtime and disable new claims while repairing; an older binary lacking
   admitted bundles cannot be used to resume those scopes. Never restore old
   configuration by dropping custody or outstanding cleanup.

## Owner amendments and remaining inputs

| Owner | Exact proposed amendment or input |
|---|---|
| Scope contract owner | At section 6.1, define complete semantic identity and the explicit legacy binding trust boundary; at replay/observations section 16.1, require provenance for every historical subject and report its coverage/trust. Adopt or reject the typed unresolved reason and V4 mixed-history refusal. No change to seed/history bytes. |
| Platform/authority owner | Amend definition-version and platform mark/authority rules to preserve archived executable, observation and authority semantics; approve the original-main and clone-era bundles and their complete correspondence. Shared source helpers alone are not an archive. |
| Deployment/host operator and planner | Supply 14:19 and 17:35 exact Worker/build-to-source receipts, full scope/incarnation/genesis/head bindings, retained histories and reference closure. Confirm whether any scope used multiple implementations. Adopt registry revision/storage/trust rules and both register roots; provide the exact existing provider capability scope without secrets. |
| Host adapter owner | Adopt `RegisterBinding`, exact single-match selection, 16-root/size bounds, additive config transition and decommission/rollback duties. Amend `docs/deploy.md` and `docs/hosts.md` from one register to explicitly adopted roots. |
| Replay/client owner | Add contextual bundle resolution and explicit trust/coverage reporting; preserve existing read authorization. CLI must not silently resolve missing legacy provenance or advertise old-room verification as fresh-room success. |

The 14:19 and 17:35 attestations identify the same room and source; they
still omit exact genesis/head hashes and full child/incarnation IDs. The
19:47-19:51 evidence identifies the new directory and source but likewise
does not supply a complete retained-history binding. These are evidence
owed, not inferred identities. The permanent source archive and authenticated registry cannot
be approved on those omissions. Future-version adoption alone does not
adopt any of these historical or routing choices.

## Compact validation plan after adoption

Follow [docs/testing.md](../docs/testing.md). Strengthen existing witnesses,
not a new version/provider matrix: platform `versions.test.ts` keeps data
pins and the equal-membership-digest/executable distinction; scope
`versions.test.ts` adds replay of authentic retained original and clone-era
histories selected by exact provenance, plus unresolved/conflicting refusal.
Use the existing production host-wiring/founding boundary to show both roots
retain exact writes, a foreign root is refused, and unknown provenance sends
nothing. Existing signed-read/session, read-token/custody, host reply and
cleanup witnesses must still distinguish their guards across restart and
config changes. Preserve existing rules-birth witnesses during reconciliation.
Only the producer performs relevant focused checks and one gate at the
review head. A later authorized live witness must read the actual 14:19 and
17:35 histories and their pending/custody states; do not replace either with
a fresh room. No tests or live operations were run for this design note.
