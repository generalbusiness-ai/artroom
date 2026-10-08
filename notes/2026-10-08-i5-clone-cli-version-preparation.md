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

### Exact commands and retained captures

The checks above used these exact commands in
`/tmp/artroom-clone-cli-integrated`:

```
npm run typecheck --workspace @generalbusiness/artroom-cli
./node_modules/.bin/vitest run --project cli test/version-selection.test.ts --reporter verbose
node scripts/control.mjs packages/cli/src/commands.ts 'typeof named === "string" ? platform(named) : null' 'typeof named === "string" ? (platform(named) ?? platform(NEWEST[name]!)) : null' --expect 'join holds an untagged invitation and refuses unknown' -- packages/cli test/version-selection.test.ts
./node_modules/.bin/vitest run --project scope --project cli test/join.scope.test.ts test/clone.test.ts test/clone-proof.test.ts test/clone-outcome.test.ts --reporter verbose
```

2026-10-08 evidence-only follow-up: no checks were rerun. Original raw runner
output was not saved to local files. The tool transcript retains the actual
outputs. The files below now retain retrospective transcript extracts with
exact commands, source chunk identifiers and outcomes. Their SHA-256 values
identify those newly retained extract files, **not** original stdout/stderr
or Vitest JSON reports; excerpts/summaries do not reproduce every original
output byte. No hash for an unretained original output is claimed.

| Check | Retained extract path | SHA-256 |
|---|---|---|
| CLI typechecks, exit 0 | `/tmp/artroom-clone-cli-evidence-6f42092ac/typecheck.json` | `d73318aa1cb829bf05d372ec78c5fe9b385173ca053057c554b093d52d0ff0e2` |
| Version selection, 3 passed | `/tmp/artroom-clone-cli-evidence-6f42092ac/version-selection.json` | `e78ccf1871c96741fd289ce9042248c0f4a2e65e9b9f2e391f8759654b2ddbd9` |
| NEWEST fallback control, distinguishes, source restored | `/tmp/artroom-clone-cli-evidence-6f42092ac/fallback-control.json` | `0ed504033454ebfaffee1a8aad1d11fc09605af63d6ecaf4b3bc935f806ed079` |
| Selected clone/join checks, 8 passed | `/tmp/artroom-clone-cli-evidence-6f42092ac/clone-join.json` | `21cd1848b42b3632a96a24de47064fd455f6d9dc7527c44f6eaeb24d75d1ef11` |

The helper's original temporary report was
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/artroom-control-sHjGS9/after.json`;
the helper removed it on exit, as designed. It was not recovered or hashed.
Extracts contain no invitation, private envelope, signing key or provider
plaintext. They are local scratch artifacts outside Git, not a durable
source-review receipt. Their extraction/capture limits remain explicit.
This follow-up changes only this note: the complete `packages` tree remains
`af0bf741f375c7518cfd2fa4a345b13599f6de0a`, as at source head
`6f42092aca0d25a522b66775bfa6433796fb02d1`; no new test/gate credit follows.

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
