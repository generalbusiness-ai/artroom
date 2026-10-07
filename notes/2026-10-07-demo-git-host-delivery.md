# Demo Git host and deployment

Request: `225da894f5fc9322a6e86f923ffe6fd52b9739dd`.
Producer: `f8a56f1ca6d6a55c3127cb4d66a806256371af36`.
Branch: `request/demo-git-host`, from published main `9b753bf74`.

The GitHub source component has a passing local gate and a real public
founding, destination publication and unauthenticated clone. It is ready
for exact source review. Independent approval and landing remain owed.
The re-cut Gate 1 also requires the hosting service's ARTIFACTS adapter
(`97821ea7`); that cloud delivery and its run are pending. This component
does not complete that whole gate or the I3 commission.

The scope creates its outside port after storage is available. The port
receives live state reads, its own sealed entries and already retained
inputs. It receives a read facade, without the store's write methods. The
destination port uses the platform rules' existing operation-context
functions; the host adapter supplies evidence to those rules.

The Git package has separate Web API entry points for smart HTTP writes,
exact object reads and GitHub App requests. A write builds a verified SHA-1
pack, checks the advertised old ref, sends one exact update and requires a
complete status reply. It performs the caller's live authorization check
immediately before the POST, after compression and discovery. A lost reply
remains unknown, even when a subsequent read finds the requested commit.
The reader checks complete pack trailers, object bytes and both Git delta
formats before retaining any object. A failed object read is never absence.
The caller configures the transport buffer allowance; it is no adopted
platform quota.

GitHub App requests use RS256 JWTs and explicitly restricted installation
tokens. The primitive validates repository IDs, account, permissions,
expiry and clean fixed provider URLs. Repository creation requests no
initial commit. Deletion requires an administration token restricted to
the exact recorded repository ID. The caller still owns the name binding,
credential custody and cleanup. Creation authority and the App installation
remain configuration prerequisites. GitHub returns token plaintext and
expiry, without a separate credential ID; the adapter's nonsecret identity
mapping must be explicit before production use.

Private credential rows live beside scope history. They keep a mint's
reply metadata and plaintext across a restart. Only the matching confirmed
mint judgment makes a credential usable, and only before expiry. Expiry or
dropped plaintext does not claim provider revocation. These rows are absent
from the state facade, entries, history, log and public methods.

Focused producer evidence so far:

- Real local Git receives the exact founding commit, binary blobs, tree,
  compare-and-set update and deletion. The same witness distinguishes a
  race, a lost reply and authorization changing during discovery.
- Real local Git supplies upload packs and independently generated OFS and
  REF delta packs. The production reader verifies their exact objects.
- Real SQLite witnesses show live read-only factory context and private
  custody across an object restart, with unchanged public history and log.
- Register rules run in memory with a scripted provider. GitHub HTTP
  responses are scripted; real RSA verifies the JWT signature. Neither
  fixture demonstrates a hosted provider.
- The byte-copy, final authorization, pack-checksum, read-facade and expiry
  controls distinguish their injected faults. Register and GitHub controls
  also distinguish, but their raw output remains in tool transcripts;
  register's saved file is explicitly an observed-result summary.

Retained logs: `/tmp/artroom-smart-http-copy-control.log`,
`/tmp/artroom-smart-http-live-guard-control.log`,
`/tmp/artroom-smart-http-read-checksum-control.log`,
`/tmp/artroom-demo-outside-factory-final.log`,
`/tmp/artroom-demo-outside-facade-control.log`, and
`/tmp/artroom-demo-credential-expiry-control.log`.
The initial checksum control was inconclusive because the test reporter
classified a promise assertion as an error. The same fault then
distinguished after the assertion was made explicit; the initial output
remains in the transcript. Logs without executed-head/source-hash stamps
are producer correspondence evidence, not independent reproduction.

The required real run still owes install and register, repository claim,
directory/membership/rules/destination confirmation, a judged publication,
a person's Git clone, and verification through deployed authenticated
reads, with times and deployment identities. Runner, browser and agent
stand-ins must be named in the final delivery. Nothing is registry-published
and the old deployed spike is outside this change.

## Worker wiring and recovery

The deployed class now enables the host factory only with explicit GitHub
configuration. The operator pins `registerScope`, the ID computed from the
exact install seed. Destinations must retain that register's actual claim
and have the directory creator ID derived from its recorded seed. Merely
citing the claim from an independently founded directory grants no host
authority. Wider installation authorization remains N5's work.

Safe host reads can recover under their original marked attempt, after the
existing retry delay. Mutations still leave once. Indexed private pages
recover stored mint replies through the normal late-answer path. A separate
private binding, written before a revocation request, connects its attempt
to the exact mint and credential. Recovery reads the actual committed own
confirmed Revoke and drops that credential after normal repeat judgment.
It issues no second DELETE, changes no original unknown entry and makes no
revocation claim from expiry or absence.

This repairs checker finding `f20eba93`. Finding `5df5d41f` is repaired by
format discovery using the valid `refs/heads/` prefix while the source still
checks the entire advertisement. The existing Worker witness exercises the
actual provider method and distinguishes the original invalid prefix.
Both findings were static; the new runs are producer evidence.

Actual workerd checks exposed `redirect: "error"` as unsupported. Every
HTTP primitive now uses manual redirects and refuses unexpected statuses,
redirected responses and changed response URLs. The existing Node and
Worker witnesses retain the no-follow policy. Worker RSA key export,
PKCS8 import, JWT signing and scoped mint requests run in the same fixture;
HTTP answers and credential mappings there remain scripted.

Pinned Wrangler 4.147.0, run from `/tmp`, built a dry-run Worker bundle at
`6b1221e4`: 1,351.92 KiB, 317.53 KiB gzipped. Log:
`/tmp/artroom-demo-worker-dry-run.log`. That build precedes later repairs
and is not a deployment or a current-head gate.

The coupled `github-founding.test.ts` now uses the actual configured factory
on five real scope objects. It confirms their births, exact first-head and
receipt packs, both scoped token cleanups, private binding completion and
public histories without plaintext. Actual destination eviction/restart
preserves history and private rows and makes no extra provider call. REST
and Git upstream responses, clock and readers remain scripted. It produces
no source lane or source publication.

That witness exposed transport deadline timers retaining object activity.
The first optional eviction timed out; explicitly clearing each HTTP
controller's timer in `finally` allowed the same actual restart to pass.
The final coupled witness took 185 ms; Git/scope typechecks and four focused
HTTP tests also passed. Raw evidence, exact source hashes, the earlier
one-pass cleanup failure and eviction timeout are preserved in
`/tmp/artroom-github-founding-225.log`. This is producer lifecycle evidence,
not a timeout-based distinguishing control or a deployed run.

The latest published sprint report at `54cc1bd23` is preserved by the
branch's merge `4b12597c`; it changes no source or test body.

Hugh selected `generalbusiness-ai`, organization ID `285042784`, and says
the App is not yet created. The exact setup requirements were sent to the
planner and saved in workroom evidence `827d4c7c`; the register authority
pin was added in `06c2723d`. No App, repository or deployment has been
created by this delivery.

## Remaining run dependencies

The native lane hold and Git-read operations are not supplied by this
register/destination adapter. Planner decision `c6499e91` authorized merging
the delivered Gate2 lane wiring into this branch for a native first
publication. That merge is now `c248ea071`; its only conflict was the testing
guide, resolved by preserving both descriptions. It supplies definition
value places, the merge's selected reports and the rules/extent wiring.
The remaining production hold/staging dependency is under investigation;
the native fixtures still supply a scripted lane host. Builder has asked
whether the decision's labelled source-entry stand-in covers this runtime
dependency. No such deployed fallback has run.

Planner decisions `c6499e91` and `70a0680e` made the bootstrap policy precise.
The cloud delivery `09c390c9b84f1f5340925c9a783a22e094bac7a2` is integrated:
signed reads, a cause chain of at most four causes whose window starts at
the signed root entry, and the command line's bootstrap reads. Local review
found validation-before-cause-read and class transport forwarding defects;
repairs are in progress. Recent signed reads give only the summary, genesis
and signer's entries; authenticated full replay remains owed.
Gate2 request `14db4e69` and Gate3 request `490fc42c` stay open and preserve
their required filing and landing order after Gate1. Their cloud test
figures are not local builder verification.

## Local preparation and checkpoint gate

`scripts/demo-git-host.mjs` supplies local `prepare` and `plan` phases.
Run it with Node 26 and pinned `tsx@4.21.0` from `/tmp`; no tool package is
installed in this checkout. It creates three signing keys in an exclusive
owner-only directory and file, and prints public signed install data and
the exact register seed. The explicit deadline must fit the server's
existing 900-second intent lifetime. Changing it changes the register pin;
the helper overwrites no key or plan and extends no deadline automatically.
Its CLI performs no network request. Bootstrap, directory, source
publication and deployed verification are not supplied by those phases.

Two direct Node tests passed through that pinned runtime, independently
checking the Ed25519 signature and actual filesystem permissions, exclusive
creation, public output and immutable plan. Permission and deadline controls
distinguish their faults. Evidence:
`/tmp/artroom-demo-git-host-prepare-225.log`, including the initial native
Node TypeScript import failure and the successful scratch runtime. These
two tests are separate from the Vitest gate. The later live run below uses
the integrated CLI, not this preparation helper.

The complete checkpoint gate passed once at clean head
`a69c90c98d52efe6a9a4b6611bb1ff84547f1dc2`, tree
`5c531a12fd88709b9980b0c33f08a01687f77d04`: all workspace typechecks,
747 tests and 6 active-source checks. Log:
`/tmp/artroom-demo-git-host-gate-a69c90c98.log`; raw phase logs:
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.Z6SuAvqXvg`.

| Phase | Elapsed seconds | CPU seconds |
|---|---:|---:|
| Install | 1.9 | 2.2 |
| Whitespace | 0.0 | 0.0 |
| Typecheck | 3.5 | 9.6 |
| Tests | 12.3 | 34.4 |

These are printed phase figures, not a whole-command timing. Machine:
the shared Mac, Node 26.10.0 and Git 2.54.0. Focused runs warmed caches;
load was not sampled. A note-only successor preserves the gated source
and tests. This gate verifies the local checkpoint; it closes no deployed
journey, final review or landing requirement.

## Resumed intake and deployment handoff

The planner deployed the original `9c0f5890` source as `artroom-scope`, URL
`https://artroom-scope.inguz.workers.dev`, version
`dfe6bd8f-9a69-412a-b46d-f917511e89fd`. Its observed install succeeded;
subsequent bootstrap reads were forbidden on that earlier source. The
register is now outside its bootstrap window. This is the planner's
attributed evidence (`65a64e03`, `4bc51bde`), not a builder live founding.
Builder's current root GET returned 404 with `not-found`; the planner's
earlier root 500 was not reproduced.

The App handoff is present in the established owner-only local secret
directory. Read-only validation with the actual GitHub helper passed:
App `5223496`, installation `168852986`, account `generalbusiness-ai`
(`285042784`, Organization), active, all repositories, Contents and
Administration write. Exactly two installation GETs were made, with no
token mint or resource mutation. Evidence:
`/tmp/artroom-github-installation-readonly-result.json`. Hugh chose public
demo repositories. Planner supplied the explicit hourly installation-token
bootstrap procedure, and later an owner-only durable creation-token file.
This builder run used the hourly token and does not exercise the durable
one.
The planner's session-secret file was preserved owner-only in the local
handoff directory; its original remains intact. No secret value appears
here or in the logs.

Focused intake results, before the pending runtime/read-boundary repairs:

- Seven scope tests passed for signed reads, founding and the CLI story on
  `09c390c9`: `/tmp/artroom-gate1-09c-focused-scope.log`.
- Two client signed-read tests and eight replay/CLI Node tests passed:
  `/tmp/artroom-gate1-09c-client-read.log` and
  `/tmp/artroom-gate1-09c-focused-node.log`.
- Four canonical lane/profile tests passed after the merge:
  `/tmp/artroom-gate1-merged-definitions.log`.
- The merged scope story/wiring run passed eight tests and failed the CLI
  refusal input, which lacked the newly required definition bytes. The
  repaired CLI witness uses a complete duplicate-member act, asserts its
  named `handle-in-use` refusal and unchanged head after earlier inbox work
  settles. That story passed: `/tmp/artroom-gate1-merged-cli-refusal.log`.
  The original integration failure remains in
  `/tmp/artroom-gate1-merged-story-wiring.log`.

The earlier 747-test gate does not verify these integrated source changes.
The complete integrated gate and live run follow.

## Integrated source gate

The gate passed at `dfaa5395023f09adc71c8587dca3d74b65a86d0c`, tree
`2eb2f904e340b3c2c6d4c457318c55fe67b2f1d9`: every typecheck, 764 tests
and six active-source checks. Log:
`/tmp/artroom-demo-git-host-gate-t39-repair.log`; raw phase directory:
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.VDqtBYl4ba`.
Install was skipped because this lockfile was already installed. Whitespace
took 0.0 seconds; typecheck 3.9 elapsed/11.8 CPU; tests 22.6 elapsed/49.0 CPU.
These are phase figures, not total command time. Shared Mac, Node 26.10.0,
Git 2.54.0, warm focused caches; load was not sampled.

The first integrated gate at `2a65bf4a9` failed one of 764 tests: T39 pinned
membership's head while the earlier seat's inbox confirmation was still
arriving. The repair explicitly settles that earlier creation before
pinning the head around rejected requests; the unchanged-head and untouched
invitation assertions remain. Focused T39 passed before the new gate.
Failure log `/tmp/artroom-demo-git-host-gate-2a65bf4a9.log`; focused result
`/tmp/artroom-gate1-t39-setup.log`. No blind whole-suite rerun was used.

Source preflight repairs now integrated: validate the signed read's exact
request before resolving its cause; preserve all transport methods and
their original receiver; publish complete owner-only key files by atomic
no-replace hard link; launch using the CLI's installed, pinned tsx 4.21.0.
Focused checks and distinguishing controls are in
`/tmp/artroom-signed-read-guard-control.log`,
`/tmp/artroom-signed-read-transport-control.log` and
`/tmp/artroom-cli-files-runtime-09c.log`. The CLI launcher also ran under
Node 22.0.0. These are producer checks; checker preflights `b0554af5` and
`ee3a9eb1` are bounded static evidence, not ordinary source approval.

The later merge of published main `5af9abde` adds only the sprint report.
Packages tree `186a7909b857ee5fae3de689cf2b010ac4badd08` and scripts tree
`c7ffb21b9435e2a7985a2bd0492c72dce1047787` preserve the gated source.

## Real public GitHub run

Builder used the integrated CLI from the gated source and its own generated
operator/recovery keys in the owner-only local demo directory. The handle
`@hugh` is the member label used by that operator; it is no independent
human judgment. Source deployment `a6bff5d3-f02e-41de-a4ba-08041327b6e4`
uploaded 1367.46 KiB (gzip 320.92), startup 13 ms, to
`https://artroom-scope.inguz.workers.dev`. Wrangler 4.147.0 ran from `/tmp`
with `--keep-vars`. Separate operator bootstrap credentials were configured
through stdin; JWT headers also travelled through stdin, not process
arguments. No probe or repository was deleted.

The fresh install and claim created and confirmed:

- Register `sc_fcwgzdw47nyyxwkw4dtduajmpaccfgayqne7l4xghvbu3z7llzta`.
- Directory `sc_cxcmwjzukjktomk7tvfibx4ugq33fvdtocg2edvkqvdea5pqt4ta`.
- Membership `sc_mlcssejwqoa7ql7rluu4uz7yllddsndw5r47zmoztejehyqskzta`.
- Rules `sc_2dostbjskmponzhz4ea7guhccrqq3u22q2g25mdgimaippgii3hq`.
- Destination `sc_bsl6s4ajqophmfvzkf657yhbdf2r53vmmkgpni527t3tduwh5bna`.
- Inbox `sc_o3hvaeg5hk5hn6mza6zj3rc6p2pj7pi433dzokwwut6mvkxvx63a`.

GitHub repository
`generalbusiness-ai/cxcmwjzukjktomk7tvfibx4ugq33fvdtocg2edvkqvdea5pqt4ta-1`,
ID `1408775530`, is public, created `2026-10-07T12:47:50Z`. The destination
pushed `e2c5bf4ebb323e8ed0be71256e776c16a614123b`, "Found this repository."
A real Git clone with credential helpers disabled succeeded. This is the
founding publication permitted by planner `72ccc867`, not a native change
lane publication; that remains Gate 2 work. The clone command is a builder
stand-in for a person's client, not a fresh-person walkthrough.

Whole-command wall timings: install 1.385 seconds; credential provisioning
8.807; source deploy 6.271; claim 7.474. Public output and commands are in
`/tmp/artroom-builder-public-install.log`, `...-provision.log`,
`...-deploy.log`, `...-claim.log`, `...-acts.log` and `...-clone.log` under
that same prefix. No private key, installation token or read session is in
those logs.

The initial read-session probe answered `sessions-unavailable`. Setting
SESSION_SECRET and DEPLOYMENT through stdin corrected it: membership then
issued a real session and an authenticated membership genesis read
succeeded. The final secret-binding deployment version is
`866e3534-b9c4-4278-b070-c71499efa2a1`, retaining the deployed source.
Evidence `/tmp/artroom-builder-public-session-probe.log`,
`...-session-after-bindings.log`, `...-show-membership-session.log` and
`...-deployments.log`.

Authenticated membership replay reports a missing dependency: register
entry 2 is not covered by its session. Destination session reads are
forbidden because its genesis records a membership scope ID without an
incarnation. Earlier signed-read replay also lacked retained inputs. These
are recorded failures, not consistent replay or coverage of any entry.
Logs `...-verify.log`, `...-verify-session.log` and
`...-verify-membership-session.log`. The broader read and claim-resume
changes commissioned by `6b6c6400` belong to the named cloud delivery after
Gate 1; builder has not invented a wider read rule here.

The older planner-created repositories remain private. This public run
does not change them. Gate 1b, the durable creation token's exercise,
complete authenticated replay, exact independent source review and landing
remain explicitly owed. Full I3 and the other cloud requests stay open.
