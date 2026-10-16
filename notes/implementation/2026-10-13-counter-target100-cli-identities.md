# Counter target and independent CLI identity verification

Request `368257f2bbb85cc530921ee4167ede8d1679a89b`, under builder promise
`00b959eaf9ca2b4642c757ec961aca892ba78108`, replaces the earlier Stop proposal.
The existing **Pause** label and native behavior remain unchanged.

Root verified the existing target100 Counter and the two independent CLI
identities on production Source `27bb745f0012ce5994ea983ae1bd51e9e3ad17f8`.
Root reused the existing scope, enrolled keys, and separate `ARTROOM_HOME`
directories. These verification runs created no Counter, member, key, or
Counting commitment. This note records operations and their limits. It changes
no product Source, tests, configuration, assets, or deployment.

## Native scope and enrolled identities

Both successful reads identify this full Counter reference:

- Scope: `sc_mz2qukmzlvsnhxe2tavr34mfmcnwn2sfiana7z65wgvtrgzt3moa`.
- Incarnation: `in_fekhhxib6oztwtuplthy6mn5n4`.
- Kind: `lane`.
- Definition: `sha256:b55824346382d9b158be4cadd9d098008f8129147fba772537778e2f738d5271`.
- Fixed target: `100`.

The membership reference is `sc_2enkts3vuq64woelfhewjvplo5ya3emvp6mbosva7rh6ow6yyita`, incarnation
`in_vdhtpyrw4pknhm7b27gxd4cn3i`, under `platform:membership@5`.
The directory's actual native repository references agree with the same
membership, rules, and destination scopes. The cohort is register6,
directory6, membership5, rules3, and destination2.

`@codex-fred` and `@codex-samantha` are distinct native agent members with
distinct active enrolled keys. Their separate homes are
`~/.config/artroom-counter-live/section2/codex-fred` and
`~/.config/artroom-counter-live/section2/codex-samantha`.
Both configurations bind the same Counter and membership roots.

The verifier follows each already-recorded M5 enrollment receipt. It checks
the original `add-member`, `invite-key`, and `enrol` entries and their exact
fact hashes, signing key, recipient, and retained invitation correspondence.
It also checks each active agent member, active agent key, and active person
controller. These are genuine M5 enrollment facts, not M2 invitation links
with a changed label. The verification does not enroll either agent again.

Both agent roles hold `counting.participate`, `counting.activity`,
`counting.commit`, `counting.fulfill`, and `counting.fail`.
`counting.activity` authorizes both `activate` and `deactivate`.
The configuration's controller is `@counter-controller`, an active person
with an active key. Its `admin` role holds `counting.control`.
Both native Counter summaries show a paused board and no live pledged
promise. The full reads remain stable within each verification run.

## Actual operations and closed public results

Root ran the two verifications sequentially. Each process exited `0`.
The following two original public results are the complete checker allowlist.
The review packet records their exact local paths. Their nested data contains
public claims and references, not tokens, seeds, signatures, or raw envelopes.
Paths inside the results are descriptive values and confer no permission to
open a home, key, custody record, or another file.

| Identity | Root run | Public result | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| Fred | `78092` | `codex-fred-read-session-verification-one.public.json` | 5068 | `454893132f2cbe3e3ed798f8d0bf9c624617f67ddd1f53f4535a0793f2eb1c54` |
| Samantha | `8066` | `codex-samantha-read-session-verification-one.public.json` | 5084 | `78bb4627901a2d05d09bb95ddb8ab071ddc16d94447c50a6bb3ee9b1907d5092` |

Each agent signs one native read-session request. Root retains that exact
request before dispatch and retains an exclusive attempt marker before the
POST to its actual M5 membership's `/v1/scopes/<membership>/sessions` route.
The reply's deployment, full membership reference, member, key, allowed read
names, and end time are checked. The session token stays in process memory.
The helper performs no automatic renewal, second signature, or retry.

Session issuance writes the native request nonce outside the scope history.
The following reads use the issued session through the ordinary authenticated
routes. These operations are a read-session POST followed by authenticated
GETs. They are not a GET-only run or a run with no native write.
Neither verification dispatches a Counting act, admission, or audio action.

Root first built the two runtime modules once in external scratch, run
`96821`, exit `0`. The SDK module is `154136` bytes with SHA-256
`3627515199ab612e61d5dbd743b9d197e7b761c78db3905ebe1566fe6576eb70`.
The bytes module is `110022` bytes with SHA-256
`4394105852dd817a3505dfceeba46ac1787ef93640da4d71d36c2535aede79dc`.
Their package declaration, pinned Node, helper files, and unchanged Source
were sealed before the native runs. The issuer helper hash is
`cecd1639eb2260b64c5078e1d2f49a17543f60dbe0f5186391eae2a692c9c3ac`. The integrated verifier helper hash is
`69f39760d72dd95cb83d4a107a1e503f4ce3592d9874915886ab140c9554bcdb`.

## Preserved denials and limits

The original signed-read-only cohort attempt, run `12199`, exited `1`.
Its result, release, and evidence remain preserved. A separate local
diagnostic passed every local validation with zero GET attempts. A distinct
GET diagnostic made one directory summary read and received `forbidden`.
These earlier results are not replaced by the successful session reads.
Signed local-signer reads do not provide a repository session's authority.

A session cannot read the register's current summary through this path.
The verifier reads register entry `0` twice using native session cause-chain
permission. It checks the full register reference, genesis hash, and immutable
`platform:register@6` seed. It does not verify or claim the register's current
summary or head. Directory, membership, rules, destination, and Counter
summaries retain their full-reference, whole-read, and stable-head checks.

The historical provider version is `4772f607-ff16-41af-962b-801f5a3cf663`.
The original upload failed its static readback step. A separate bounded
completion matched all 22 readback routes for that same version.
Root binds those closed historical proofs to the known origin and deployment.
The current authenticated native observations are separate evidence.
These runs make no fresh provider-version check and claim no fresh deployment.

The tagged CLI invitation and enrollment path still hardpins membership M2.
This operational verification does not add an advertised M5 CLI enrollment
route. That runtime support remains tracked separately in `538…` and `c108…`.
Existing M5 enrollment and configured MCP roots do not close that gap.

Planner's effective `a31b2e…` records the authorized CLI-only ten-number
check, paused at ten in generation one with no live pledge. That is the
owner's run and qualification. Root does not claim to have heard it.
It establishes no accepted full mixed browser and CLI audible demonstration.
Hugh's review remains pending. The current Pause state, old scope, old keys,
pending originals, and uncertain-audio custody remain preserved.

## Prose-only review boundary

The receiving Source is `27bb745f0012ce5994ea983ae1bd51e9e3ad17f8`, tree `a863be5527d6cbb514cca575aa1972a2ccec6053`.
Only this delivery note is added to the isolated branch. All receiving
executable Source and tests remain byte-for-byte unchanged.
No test, gate, asset producer, deployment, native Counting act, or audio
operation is repeated for this prose-only record.
The final note head and tree are recorded in the review packet.
