# 013: A reviewed first release for Jam

Date: 2026-10-04. Draft 1, proposed for independent planning review.
Planner decisions requested in gitseq `18060abc` (integration),
`a49b78ab` (authenticated UI entry) and `1d4e5b39` (package availability).
Their planner promises are `bc297ae7`, `82e04fe2` and `4f56cf10`.
Planned at main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`;
source inspected at `request/test-overhead`,
`4cb7688e98e71490396c93fa157bfd3e19b5d66c`.
Source changes after these pins require an explicit impact check.

This note decides release order and ownership. It approves no source,
deployment or public registry publication. After independent review, the
planner will record the decisions and commission the bounded deliveries
below through gitseq. Source delivery still requires normal exact-head
review and landing.

## Why this release matters

The user's order is test-cost reduction first, declared acts and actual
Jam blockers next, then Jam and the complete manual together when the
builder judges the first self-hosting task possible. An entire later
platform stage is not automatically a gate for that first task.

The builder's dated judgment `77a2aada` remains “not yet”. The first task
is to found Jam's development Room, activate a v2 document with workroom
declarations, and land Jam's own declarations and acceptance cases through
generic acts and independent reviews. The builder says the integration
branch supplies those capabilities, but the deployed Room still runs main
and packages cannot be consumed normally outside Artroom. This is a
builder judgment with named evidence and limits, not planner runtime proof.

## 1. Land a separately reviewed intermediate verifier delivery

Choose a staged route. Do not wait for complete carry accounting before
any reviewed declared-acts code can reach main. Do not obtain an approval
that silently satisfies the complete original Stage 3 request.

Main cannot read a declared v2 log today. The integration branch's
`packages/log` supports it. Removing that package from the composition
would leave declared Rooms with an unusable verifier. The intermediate
release therefore includes the delivered verifier, through a new explicit
source-delivery request, while the complete original request
`1e8fee4b` / promise `3af8ebc7` remains owed.

### The independent binding

Commission one intermediate delivery addressed to builder, naming the
original request and preserving its commitment. Its review binds:

- Original condition 1 in full: grammar, retained D(s), who/body/binding,
  legacy v1, retained steps version, and honest unsupported-version limits.
- The delivered part of condition 2: derive required admission/step calls
  and rebuild their inputs and budget progression; judge recorded carry
  eligibility and outcomes; detect the implemented missing-newer-judgment,
  duplicate-judgment and blocking-obligation boundaries; check prepared
  facts where present. Assess those exact boundaries and limitations,
  rather than approve all carry accounting.
- Original condition 3's delivered fixtures, including the whole-log
  legacy-recovery negative case newly delivered at `a10c9bec`. Verify that
  case independently; its existence is not its approval.
- Original conditions 4 and 5, reconciled with the already adopted
  test-cost workflow: useful invariant witnesses and distinguishing
  controls, preserved relevant assertions, exact-head checks and full
  changed-path disclosure. No new numerical test or mutation quota.

The candidate source baseline is `4cb7688e`, not a perpetual approval pin.
Builder must publish every relevant artifact at the actual composed
delivery head under the intermediate promise. The checker assesses the
exact head and changes since the earlier Stage 3 verdict `6263fdec`.
Carry prior evidence only where source, fixtures, meaning and dependencies
are unchanged; review affected dependencies with focused evidence.

Use a normal assigned binding to the new intermediate request. Do not
bind a final approved verdict to original `1e8fee4b` / `3af8ebc7` as though
all five original conditions were complete. If the guard cannot express
this accurately, report the binding problem before signing; do not
override provenance or disguise source delivery as evidence-only.

### What the verifier must say

The source at this pin has two useful boundaries:
`packages/log/src/verify.ts:957–962` detects a newer missing judgment when
an older check carries; `1158–1165` refuses a land evaluation with a
blocking obligation unmet in the fold. Recorded carry judgments are
replayed at `902–956`. These are not a complete inventory of every pass.

The release report and actual verify output must state the larger
remaining gap plainly. Without an independently required pass and its
start/end facts, the verifier does not establish that every required
carry evaluation happened, in its order, with its correct inputs and
budget progression. Missing non-carry judgments, missing entire passes,
extra pass evidence and substituted pass contexts are not all accounted
for. Waiting, cancellation, interrupted prefixes, repeated preparation
and recovery need their exact recorded boundaries. A verified prefix
does not mean every duty has finished, publication is complete, or all
Room state transitions have been re-derived.

The current `cannotProve` entry at `verify.ts:260` says whether a carry
judgment was owed is unproved. Reconcile its wording with the guards that
are implemented and the whole remaining scope; retain the other existing
limits, including unavailable Git objects and stage 6 transition checking.
CLI text and machine-readable output must preserve the qualification.
Do not call a partial report “complete accounting”.

The claim in `notes/2026-10-03-carry-accounting.md` that removing a
non-carry judgment cannot admit an improper landing is a source argument,
not proof supplied by Stage 2 approval. The independent release review
must assess its applicability to the actual intermediate source and
state its limits. It must not use that claim to discard omission, extra,
context or diagnostic requirements.

### The complete remainder stays owned

Keep original Stage 3 open and promised. The index, intermediate report
and later release inventory link it by full request identity and say
“complete carry accounting remains owed”. Do not retire it on landing.

Builder owns the revised carry-pass amendment. It must address all A–F
in accepted planner review `85032553`, retain all ten accounting
scenarios, and receive independent review and adoption before new
protocol facts are built. Stage 4 `48c021ea` owns the prepared producer
and its actual lifecycle mapping. Stage 3 owns the consumer's complete
derivation, inputs, budget, omissions, extras and context checks. Review
the producer and consumer together at a consistent head for those facts.
The feature activation must be independent of the first proof/pass, and
the legacy boundary must remain explicit. This order authorizes the
needed prepared/pass work, not every unrelated Stage 4 primitive as a
first-Jam prerequisite.

### The final composition still needs approval

The staged integration retains complete independent approvals for
Stage 2, the revised Stage 5 scope below, the original MCP contract and
runtime scopes, bearer repair and test-cost work, plus the intermediate
verifier scope. At present Stage 2 is approved at `39430e23` in
`9cb05da9`, bearer repair at `87cd5804` in `65df0958`, and historical
test-cost work at `f6212850` in `b1738122`. Those approvals do not
automatically approve a later composition.

Stage 5 still owes concurrent capacity reservation and unresolved intent
ownership. MCP still owes its actual runtime witnesses, disjoint output
contract integration and original contract/runtime dual binding. Publish
planner's four original MCP contract artifacts at the final source head
before the fresh combined invitation. Scope review and impact checks to
the actual changes and dependencies; run the retained final gate once
after the head settles. A staged release changes neither those outcomes
nor the highest test-cost priority.

## 2. Deliver authenticated Acts entry with the browser journey

Move only the actual authenticated page entry and its real-Room browser
witness from Stage 5's final acceptance to the existing browser journey
request `cfbde32f20618231aed598f63f3898cc188d0ffd` (C5). Its credential
dependency remains browser identity/onboarding
`18815307e6c306d63766230ed7eb7ddbf94d1f21` (C4).
Record this as an explicit requester scope amendment and acceptance
addendum, without replacing or cancelling either request.

C5 already owns the real page entry and live adapter. C4 already owns
non-extractable device keys, enrollment, read sessions and signed controls.
A separate token-entry development page would create another credential
path without completing that planned product journey.

The acceptance transferred to C5 is precise:

A person enters a real Room through the supported authenticated browser
entry using C4's current device identity. The Acts screen reads current
declared labels, help, targets and typed fields through that Room's
authenticated API. It prepares and submits an application act whose kind
was unknown to the client binary, with the explicit binding and the
person's own current signing authority. The UI displays the actual
authoritative result, including a refused or uncertain result when it
occurs. One bounded actual-browser/real-Room witness exercises the path,
identifies all fake provider seams, and verifies current authority rather
than claiming that MemoryRoom is a deployed Room. Preserve original
Stage 5 meaning, stale-binding and exact-settlement rules in this live
integration. C5's whole coding journey remains owed separately.

After the explicit amendment, Stage 5 condition 1 still binds declaration
reads, signing/HTTPS, MCP, CLI, generic typed UI preparation/submission
components and the LiveRoom adapter. Condition 3 still binds the actual
unknown-act HTTPS/MCP and CLI demonstrations and UI component behavior.
Only the real authenticated page-entry/browser witness moves to C5.
All other conditions, historical D(s) reading, grant restrictions,
legacy compatibility and complete evidence remain. A component/double
witness is credited as such. Stage 5 may then complete without C4/C5
being complete.

The two existing Stage 5 repair findings stay in Stage 5:
reserve unresolved capacity before the first await, and retain unknown
intent/status above catalogue presentation gates until settled or
deliberately left. Moving the page entry does not excuse either repair
or permit a fresh replacement act when a catalogue read fails.

## 3. Supply built, packed packages for the first Jam task

Choose packed tarballs from a reviewed Artroom commit for the first Jam
task. This is the planner's reversible development route under the user's
standing self-hosting instruction, not an assertion that the owner chose
a public registry. Public npm publication, scope creation/account access
and a public release remain an explicit owner choice when needed.
Do not require them to start Jam.

Commission one bounded packaging implementation. Keep the complete
starter design/conformance specification under
`f3299ab4b2bf553f2a221a353a7cb75f04cbd5c6`; its installation dependency
may now be an exact reviewed packed release. Its cold-outsider,
public-interface and later registry inventory outcomes remain owed.
Do not call a private workspace link a package release.

### Package contract and delivery

Build JavaScript and declarations for the supported application exports
of contract, policy, client, MCP and log. Preserve the existing public
subpaths and clearly separate Node, browser and Worker entry points.
A Worker-only export need not load in plain Node; every claimed Node
entry must load there without Artroom TypeScript source or workspace
resolution. Build the existing log command rather than silently removing
a public bin. Use one matching nonzero development version for the
release and compatible exact internal package dependencies.

The CLI is already bundled. Reconcile its runtime dependency list so a
fresh CLI-only install does not try to fetch unpublished Artroom
libraries. Include built output, declarations, required notices/licence,
documented engines and a bounded files list. Do not ship tests,
measurement directories or credentials. Reconcile the source-test
resolution explicitly; packaging must not silently change the exercised
implementation. Avoid platform runtime behavior changes.

Deliver the tarballs as gitseq evidence with a release manifest naming
the reviewed source commit, package names/versions, exact filenames,
bytes and SHA256. Record the actual delivery location and reproducible
build/pack/install commands. A consumer must be able to install the
complete compatible set from that location with a lockfile, no symlink,
repository source import or unpublished registry dependency. If
gitseq's attachment mechanism cannot carry that bounded set, choose an
existing local/repository artifact mechanism and record its exact
content identity; do not substitute an unrequested public release.

Scope: those six package manifests, packaging build/export configuration,
necessary scripts, matching lockfile, licence/notice packaging, one
consumer fixture and release instructions. Add a transitive application
package only if an actual supported export needs it and name its runtime;
do not require all Worker-internal packages to become plain Node libraries.

### Bounded acceptance

Use one isolated external consumer fixture outside Artroom's workspace:

1. Build and pack the exact source head. Install the compatible tarballs
   into the fresh consumer and save its lockfile.
2. Import each claimed Node library/subpath from plain Node; typecheck
   representative client/declaration/policy use under ordinary NodeNext
   and bundler settings without compiling Artroom's TypeScript source.
3. Install the CLI tarball alone in a second fresh directory and run its
   help/discovery entry. Report whether an external service was involved.
4. Assert that bins, exports, declared types and package dependency
   resolution point to files actually present in the packed artifacts.

This proves installability, not real Room admission. Reuse the separately
reviewed deployed generic-act path for the first Jam task; do not rerun
every platform test from the consumer. The independent review checks the
build/pack source, exact consumer commands and packed identities, then
the final relevant gate. Public publication is not part of completion.

Known repository commands at the pin are `npm run typecheck`,
`npm run test:changed` and `npm run gate`. The CLI already has
`npm run build --workspace @generalbusiness/artroom-cli` and a prepack
hook. Builder must record the newly delivered release command and
filtered consumer check; these commands are not yet shipped.
No planner installs, builds or runtime tests were run for this note.

## Owners, limits and the next judgment

After the staged composition is approved and landed, builder redeploys
the existing supported spike through its normal reviewed deployment
process. After a matching packed release is independently reviewed,
Jam can install it in its own repository and use the deployed Room URL.
Builder then records a fresh readiness judgment under `b4ef9b7a`;
a positive judgment starts the first tracked Jam task and complete
manual request `db2fd146` together.

Neither this note nor planner approval claims that either blocker has
been removed. Complete carry accounting, browser identity/journey,
remaining primitives, musical fixtures and later spikes retain their
owners and full outcomes. Vocabulary may change through Jam's own acts
model while self-hosting; the dated workroom vocabulary is not frozen.

If source drift invalidates the described boundaries, packaging requires
undocumented privileged setup, or an intermediate approval cannot retain
the full original commitment honestly, report the concrete discrepancy.
Resolve the delivery contract before landing instead of silently
shrinking acceptance.

