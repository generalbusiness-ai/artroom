# Late recovered install: expected-state context proposal

Requests `da1` / `484`; planner decision
`e5973cf17ca0113d8731264059ce0ae5b17415ff`.
Selected base: `1d311bf900ff3989d857579fa979a59015cfe660`.

This is a proposal, not an implemented constructor, executable admission,
completed semantic review, or proof that an old deployment used this source.
No runtime helper or client routing changed. The current fresh-claim path
still reads the register summary. The accepted saved-claim recovery path
remains separate and uses its fully checked settlement receipt.

## The local invariant and its complete transition ledger

The two selected register source bodies have the same register-slot property.
The catalog selects native `register.ts` for `platform:register@1` and
`future-2/register.ts` for `platform:register@2`. The future module also names
an @1 sibling mapping; that mapping alone does not select its implementation
for a native @1 scope. Neither spelling identifies every historical @1 bundle.

| Reachable transition | Effect on the register item |
| --- | --- |
| Applied install genesis | The genesis judge resolves self to entry 0. The open form opens the singular register item. Install writes host, namespace, policy and founders on that newly opened item. `newItem` initializes revision 1; the fold does not increment a newly opened item. |
| Refused install | No applied register item; excluded from the proposed constructor. |
| Repeat install/genesis | Existing genesis is answered; no new item or change. |
| Found | Opens a claim, reads `also.register`, and writes the claim's intent, branch, copied policy, founder and seed. Opens a repository operation and its attempt; does not write the register item. |
| Repository outcomes | Select an answer and alter claim repository state or operation attempts; may open cleanup duties and send directory creation. No register-item effect. |
| Directory creation result | Applied clause records directory/genesis references and activates the claim. Other clauses have no register-item write. |
| Credential revoke / repository delete outcomes | Settle or advance cleanup operation attempts. No register-item effect. |
| Receives / timed / transition rows | Empty in both register declarations; no additional item-writing route. |
| Generic fold bookkeeping | Accepted intent indices, requests, operations, observations, holders, accounts and scope head can change independently. Their changes do not advance a register item revision. Attribution bookkeeping also preserves revision. |

The property is an item revision, not the scope head. The genesis item starts
at **1**, not 0. Existing-item effects would increment a revision once per
entry; the register-specific closure must prove there is no such reachable
effect on this item. Empty receives/timed rows do not alone prove this:
all marked rules, outcomes and result clauses must be included.

`found` opens a claim, so it has no existing `on` item. Its only required
expected input is the revision of its singular `also.register` item. Given
an actually bound immutable closure and applied install, that input can be
derived without the current head or a register summary. No current claim
count, operation state or free capacity can be inferred this way.

## Proposed input schema (not a validation implementation)

A future context constructor must consume these actual bytes and references:

1. `originalSignedFounding`: the complete original signed install intent,
   with signature verified, canonical digest, original fields, ID and deadline.
   Do not re-sign or extend it during recovery.
2. `nativeReceipt`: the complete retained accepted native receipt, not a
   digest or success flag. Check definition, identical intent digest, register
   target ScopeRef including incarnation/kind, seq-0 fact/hash, and every
   required receipt field against the original plan. Preserve its trust label:
   configured-service acknowledgment, not independent historical replay.
3. `serviceRoot`: the exact configured service URL/root tuple, register scope
   and incarnation, original plan seed/cause and exact supported register pin.
   Re-derive the seed/cause from the original signed input using the bound ABI.
   A changed service, root, pin, plan or receipt is held, not repaired by cache.
4. `reviewedClosure`: a content-addressed manifest of the executable closure:
   selected register data and every rule; selector/catalog; genesis/effect/judge/
   fold/state code; rule profiles and validator; canonical bytes/signature/seed
   algorithms and contract ABI; actual configured bounds; package/lock/build
   inputs and executable output. Include an explicit import/export closure and
   independent review reference. Merely listing files or hashing a version tag
   does not establish closure or acceptance.
5. `correspondenceEvidence`: retained owner/admission/build evidence that binds
   the exact service/root initialization to that reviewed executable manifest
   and its configured bounds. State the issuer, verification mechanism and
   evidence scope. The native receipt's pin and identity acknowledgment do not
   themselves provide this executable correspondence.
6. `invariantReview`: independently checked, manifest-bound derivation of the
   applied genesis opener and the complete transition ledger above. It must
   state the selected register item, initial revision constructor, singular
   resolution and found act's exact expected-input shape. It must reject any
   bundle with an additional reachable register write.

There is no `verified: true` input, name-only allowlist, arbitrary cached
summary, newest selector or synthetic root state. A brand or private class
constructor would only enforce API discipline; it cannot replace evidence.
The context factory's verification algorithm and accepted evidence format
must be reviewed before a context is produced. A shape-valid manifest is
still an unverified proposal.

## Pure helper contract once the context exists

The helper receives a verified context produced by that reviewed factory,
the original plan and complete retained receipt, plus the proposed fresh
found fields. It checks their exact binding again and resolves the selected
found act's expected-input shape. It derives the register item from the
bound applied genesis opener through the selected constructor and uses the
manifest-bound immutability invariant. It returns only the expected map,
or a held result naming missing/mismatched evidence. It does not fetch,
sign, grant permission, mint a session, replay an aged intent, or admit a claim.

The runtime still judges the new signature, address, time window, fields,
founding policy, expected inputs, capacity and other current admission checks.
Open policy or an admitted founder key is a fresh-found policy decision;
recovered identity is not permission. Later membership seating and first-key
steps still need their separately authorized current state. The constructor
would remove only the unnecessary register-summary dependency.

## Actual missing inputs and readiness

Current selected source has no retained executable-admission receipt or
factory that binds a recovered service/root tuple to a reviewed semantic
closure. The historical correspondence packet explicitly retains fresh
source archives separately from missing original executable receipts.
The original plan/native acknowledgment can bind identity but cannot fill
that gap. Actual configured bounds are also an input: `PROPOSED_BOUNDS` is
not evidence of the deployed value.

The adjacent JSON records exact hashes of local source anchors. It is not
an exhaustive transitive bundle inventory. Register data/rule transition
bodies, genesis open path, fold revision path and claim expected-input path
were read; validator/rule-profile/ABI/import closure is not represented here
as a completed full review. That closure and its independent review, plus
service/root-to-executable correspondence, remain prerequisites. No helper
was implemented because manufacturing that context would falsely validate
missing evidence.

The narrow owner handoff is to supply existing nonsecret executable/build/
admission receipts and the actual bounds, with exact safe paths and hashes,
for this service/root and original install. Do not bootstrap new authority,
widen register reads, select a newer pin or start another room to substitute
for them. Once the context is real, strengthen the existing beyond-window
composed witness to exercise recovered install followed by a fresh claim,
with a distinguishing summary-read control. No extra matrix is proposed.

## Validation and limits

This documentation-only preparation used local static reads and source
hashes. No imports, tests, builds, installs, gate, provider or network probes
ran. Repository testing guidance was consulted; no executable changed to test.
A final helper and invariant ledger need independent review before integration.
