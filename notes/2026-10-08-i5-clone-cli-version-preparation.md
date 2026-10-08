# Clone CLI: exact version selection preparation

2026-10-08. Existing request `48407a70e3083e8ef396db347e064b2cd6e9879f`,
promise `3501de76369dc3e0f44c2883434a4106518e62c1`, and adopted provenance/
routing direction `a515f21b5e1f3f3e1fa75c222722a825255fd8fa` were read.
Branch `request/i5-clone-cli-integrated`, exact base
`cfaa2b38f40dcacff2d24f3726aecb81d5e43b24`. Donor `85d0a6a8b` was a
reference only: its weaker claim/join implementation was not transplanted.
This is CLI component preparation, not source approval, activation, whole
clone completion or proof of legacy historical correspondence.

## Selection and saved requests

The CLI now selects only exact supplied catalog identities whose data names
the required platform family. The register's full confirmed reference and
actual pinned summary definition select `DIRECTORY_OF`; that directory's
exact catalog entry selects `SIBLINGS_OF`. Unknown versions, wrong families
and substituted register incarnations refuse before signing a new found.
There is no name-prefix or NEWEST fallback for existing scopes.

Both new claims and recovery of older digest-only pending claims derive the
directory seed from that same pinned register selection. Cached repository
references are checked against that seed and the exact sibling definitions;
live child summaries must match the expected scopes, kinds and definitions.
Membership must match the full expected reference, exact definition,
founding key and handle before preparing seat/first-key. Its actual pinned
data supplies those act shapes. Existing exact saved envelopes, accepted
fact/settlement comparisons, legacy retained-claim checks and --again rules
remain intact. No saved signature or deadline is refreshed from metadata.

Fresh install explicitly chooses the catalog's NEWEST register@2 and prints
it; a completed claim prints its exact child versions. That client selection
does not activate an operator root, attest a runtime bundle, or establish
that a compatible deployment tuple serves it. Those remain the runtime/
operator owners' adoption, correspondence and activation obligations.

The destination summary must also name an exact supported destination
catalog entry before clone prepares anything. The read-token proof and
outcome scanner, one-time custody consumption, handoff, cancellation and
failure behavior are not changed by this component.

## Invitation convention: proposal still requiring adoption

Newly emitted invitation links propose an optional `definition` field in the
existing `artroom-invite` v1 JSON, populated from the inviter's authenticated
exact membership summary. Join selects only that exact supported membership
family. This is a proposed owner convention, not yet an adopted link schema.
The owner must approve its field/version form before landing; it might need
a new link identity rather than an optional field in v1.

The tag alone does not authenticate a historical source bundle or the
membership genesis. It supplies the local builder's declared act shape;
the actual scope judges the signed request, and the existing exact accepted
fact, entry, private saved-envelope and inbox checks remain mandatory.
Unsupported/wrong-family tags refuse without key creation or submission.
An untagged link is explicitly held, with no NEWEST/native@1 guess. The
owner still owes a trustworthy convention for those existing invitations,
including their saved enrollments. Their temporary hold is not preservation
of complete old-invite functionality or closure of the whole request.

For tagged links, the exact secret-bearing join remains in private storage
before delivery, with only its public pointer/digests in config. Link
substitution still fails the existing pending-link digest/reference check;
retries never re-sign or reinterpret a private saved request. A new key
does not gain a pre-join read permission from a version tag.

## Focused evidence and remaining integration

Read `docs/testing.md`; no whole suite or gate was run. Locked
`npm ci --ignore-scripts` installed this isolated checkout without package
or lock changes. CLI source, Node-test and scope-test typechecks passed.

`version-selection.test.ts` passed three Node tests (0.362 s): untagged/
unsupported/wrong-family invitation refusal before local/remote mutations;
known tagged @1/@2 private-envelope preparation without a pre-join read;
and unknown/wrong-family/substituted-incarnation register refusal before a
found. These use typed stand-in service replies and made-up references,
not actual @2 scope admission or provenance evidence.

One control changed exact catalog lookup to fall back to NEWEST on an
unknown name. The invitation refusal witness failed by assertion: the
command attempted enrollment instead of rejecting membership@99.
`scripts/control.mjs` reported **DISTINGUISHES** and restored the source.

The existing real native@1 private-join/restart witness, plus existing
clone/proof/outcome tests, passed eight tests in four selected files
(2.46 s). They retain exact saved signature/deadline/fact and cursor,
unknown/refused stops, abort/cancellation and no duplicate enrollment. The
real-scope fixture now explicitly tags its known membership@1 invitation;
its loss/private-persistence assertions are otherwise unchanged. This proves
that selected known-pin path, not an untagged historical convention.

The existing claim/story witnesses are prepared for explicit future @2
install and child identities, without loosening their pending enrollment,
source/fact, named-refusal or secret-exposure assertions. Their actual @2
real-scope run awaits the other producer's exact runtime/session/host and
version-aware founding-publication checkpoint. No @2 serving success is
claimed from Node stand-ins or a client version selector. That runtime
checkpoint must be combined and these focused real-scope witnesses run
before complete component acceptance. No runtime/host/platform seam files
were edited here.

Historical source receipts, archives/evaluator correspondence, additive
old-root routing, exact original attempts and executor fencing/activation
remain separate required work under the adopted design. This component
implements none of those as an implicit fallback. No provider calls, main
changes, gate, deployment or whole-request receipt were made.
