# Create and outbox terminology

Source child 1a7c88af, promise 75d700a4, implements items 2 to 5 of
bb2c27ac. The completed spikes slice and its history tag are preserved.
The isolated branch starts from Directory candidate f45a5ce80 while its
exact review 584f53a9 proceeds. Directory corrections retain priority;
this terminology slice cannot land before Directory.

## First implementation checkpoint

A read-only token inventory separated code identifiers from quoted
values. The first pass changes 47 distinct type, API and helper names,
360 token occurrences across 62 files. It includes CreationOffer,
Created, SignedCreation, the initial-commit helpers and creator custody
helper names. No compatibility aliases were added. The public found()
operation, generic internal names, filenames and the outbox terminology
remain unfinished; this checkpoint is not a completed delivery.

Pinned definition keys, native intent kinds, signed genesis input keys,
digest-addressed initial Git content and persisted custody keys have not
changed. In particular, renaming the initial-commit helper leaves its old
README and commit bytes intact. These values need an explicit file/line
and next-version inventory before final Source review. No new cohort is
being created for wording.

The root typecheck passes after this symbol pass. Focused existing tests
pass: six platform version/initial-object cases, one client offer case,
and eight Page connection/start custody/UI cases. Logs are
/tmp/artroom-create-outbox-first-symbol-types.log,
/tmp/artroom-create-outbox-first-platform-focus.log,
/tmp/artroom-create-outbox-first-offer-focus.log and
/tmp/artroom-create-outbox-first-custody-focus.log. These Node checks are
not rendered or hosted evidence. No full gate has run for this slice.

The new checkout used npm ci --offline with the existing reviewed lock,
not a tooling-probe install. Package manifests and the lock are unchanged.
Whitespace passes. A generated-source search initially printed an
oversized minified line; it is not validation or a changed generated asset.

## Line-count method and baseline

The script /tmp/artroom-terminology-line-count.py counts physical lines
of tracked UTF-8 files, including blank lines and comments, for .ts,
.tsx, .js, .jsx, .mjs, .cjs, .py and .sh. It reports tests, generated
files, tooling and other source separately. This is not a semantic count
of executable statements.

At the pre-rename Directory freeze 2bcc1a4d, the count is 142,509 lines
in 814 files: 61,847 test lines, 77,248 other source lines, 3,367 tooling
lines and 47 generated lines. The subsequent f45 composition changes
only Markdown, so that code baseline is unchanged. The first symbol pass
preserves line counts. Final counts will use the same script and exact
final Source commit.

## Remaining work

Complete the scope-making API and internal names, rename their files and
unsigned discovery routes, and update active documentation. Preserve and
list every pinned or signed/digested literal instead of changing old
journal meanings. Confirm the outbox's unsigned read and bookkeeping
boundaries before renaming its API and internal mechanism names; preserve
the meaning and availability of existing retained records. Keep turn,
settle and pinned settles, define them plainly, and add the general
patterns section to the ten-terms manual. Rebuild owned generated assets
after source changes, run the affected existing checks, then one gate at
the frozen final implementation and independent exact Source review.

No approval, landing, push, publication or provider operation is claimed.
The Cloudflare hold remains in force.


## Create operation checkpoint

The SDK, ScopeApi, HTTP/RPC implementations and native test stubs now
call create() instead of found(). No public method alias was added. The
CLI's previous one-release found alias is removed; create and the existing
claim recovery workflow remain. The existing native claim test now checks
that the removed command returns usage and leaves custody untouched, then
continues the same original request through create. Its focused run passes
in /tmp/artroom-create-outbox-removed-cli-alias-focus.log.

Pinned act names and existing saved-claim keys remain explicit quoted
literals. In particular, old claim envelopes are neither replaced nor
re-signed for the terminology change. Native genesis, receipt and
initial-object bytes remain under their original versions. The unsigned
operational method/place labels now say create and rpc:create. Broader
local variables, filenames, discovery URLs, prose, literal/version
inventory and outbox work are still pending.

The first two compiler attempts of the operation pass found incomplete
transport/method bindings and accidental substitutions of seven ordinary
lookup spreads and three pinned act accesses. These are corrected; no
spreads or old act values are changed in the current diff. Original logs
create-operation-first-types.log and create-operation-second-types.log
remain under /tmp/artroom-create-outbox-. The complete third root
compiler invocation passes in create-operation-third-types.log there.
These failed compiler attempts are not passing evidence.

Focused existing checks then pass: thirteen native cases across five
files (genesis, native telemetry, SDK client, CLI claim and Page Start),
eleven client protocol/signed-read cases, and fifteen platform version
and register cases. Logs use that prefix with
create-operation-first-native-focus.log,
create-operation-client-focus.log and
create-operation-platform-focus.log. The separate alias-removal run is
one additional execution of its changed claim case, not a union gate.
No full gate, Source review or provider operation has run for this slice.


## Filename and unsigned discovery route checkpoint

Ten creation-related modules, fixtures and test files now use creation
instead of founding in their filenames; import references and live source
links are updated. The paired anonymous demo offer route is now
/v1/demo/creation-offer, with no old route alias. Signed native act names,
legacy custody fields and retained opaque session nonces are unchanged.
Historical Markdown prose and exact log filenames remain historical;
only live link targets were repaired where needed. Root types pass in
/tmp/artroom-create-outbox-filenames-first-types.log; the documentation
link check reports 484 relative links and zero broken in
/tmp/artroom-create-outbox-filenames-doc-links.log. The new route still
needs its focused runtime checks. No full slice gate has run.

Directory review b8b351f1 now requests regeneration of the Lending JS
and Worker module. Terminology implementation is checkpointed while that
higher-priority Directory correction proceeds. No terminology delivery,
approval or landing is claimed.


## Manual and protected-data preparation

The ten-terms manual now defines turn and settle and adds the requested
five-row general-patterns section. Its room-creator prose changes no
native slot or key. This is documentation preparation while the Directory
asset correction's original gate runs; it adds no runtime claim.

Direct canonical comparison against the Directory catalog confirms all
36 current definition data values and NEWEST are identical after the
terminology checkpoints. The retained projection is
/tmp/artroom-create-outbox-platform-catalog-correspondence.json. A separate
read-only inventory finds 304 protected literal occurrences across the
catalog, with nine distinct names: found, founder, founder-key,
founderHandle, founders, founding-key, founding-policy, foundingHandle and
foundingKey. Final Source still needs every source file/line and next
version, plus the global genesis key and digest-addressed initial Git
text. No catalog revision or default selection changes for this wording.

The parent text limits found renames to making a scope; its condition
could also be read to include ordinary lookup variables named found.
Planner clarification is requested before widening the change into Jam
lookups, autolinks and Git search results. The literal/version inventory
and other authorized work continue independently. Global genesis input
founding belongs to Entry-v1 bytes, so its future wire version is also
being distinguished from definition-local field revisions.

## Approved Directory composition and provenance renewal

Directory candidate a2d18fe3 is approved by c7f86f94 and landed as Main
9a1238b7 with effective receipt 731911ea. This branch now includes that
merge, including its exact Lending generated assets and final report.
The original terminology request depended on the now-retired f45 report;
request 1b6d2579 and promise e692fa54 renew this unfinished slice on the
stable landing receipt. Request 1a7c88af is superseded toward that
successor. Earlier checkpoints and failed compiler attempts remain above.

## Outbox and pending-work symbol checkpoint

The read-model types and validators now use OutboxItem, OutboxId,
isOutboxItem and isOutboxId. The SDK follow operation is followOutbox.
The definition validator's internal reservation terms use PendingWork and
PendingWorkAmounts because they include item and marker work as well as
sends. CleanupWork names the destination's internal cleanup projection.
The lexical pass changes 211 tokens across 40 files. No alias is added.
Public field and transport-method renames, retained operational-record
normalization and remaining prose are still unfinished.

Direct source inspection confirms these outbox types describe unsigned
reads and runtime bookkeeping, rather than a field in the sealed Entry
or NativeInput grammar. Receipt.sends still contains the same seq.n ID
strings. The private request_index SQL column named duty and previously
retained operator reference JSON need explicit compatibility treatment
when their public projections change. No signed-read kind is added;
outbox still uses its existing protected-read policy.

Root types pass in
/tmp/artroom-create-outbox-outbox-symbols-first-types.log. Existing focused
checks pass: twelve settle/marker cases in
/tmp/artroom-create-outbox-pending-work-focus.log and nine byte-domain
cases in /tmp/artroom-create-outbox-outbox-domains-focus.log. The native
demo-route and client invocation passes three cases across two Scope
files in /tmp/artroom-create-outbox-demo-route-outbox-focus.log. Its
additional client/CLI paths were outside that selected project and are
not claimed as executed. No full terminology gate has run.

## Outbox fields and retained operational records

ScopeApi and its HTTP/RPC implementations now expose outboxItem for one
send; the existing outbox route and its protected-read policy remain the
same. The SDK follows it with followOutbox. Public item and operational
reference IDs are outboxId. The MCP sends/wait argument is outboxId;
returned items use outboxItem, and acceptance projections list outboxIds.
No old method or public argument alias is retained. The MCP reference
schemas and owned mcp-tools.json are updated from the existing derivation.

The private request_index SQL column remains duty: its current public
projection is outboxId, so existing rows need no destructive migration.
OperatorRecord reads normalize only an exact retained one-key duty
reference with a valid unchanged seq.n ID. New writes accept the current
outboxId form only. The journal, receipt ID strings, dispatch state,
read authorization and native definitions are unchanged by this mapping.
The existing request-index and operator journeys now witness an old SQL
row and an old retained JSON reference respectively, including unchanged
native entries, unchanged retained JSON bytes, and refusal of the old key
on a new operator write. The JSON witness reopens the record against
actual local SQLite; it does not claim a deployed restart.

The first field-pass compiler invocation failed on the quoted recordDuty
Pick member, a prototype transport member and one dispatcher spread
binding. These are repaired; the second complete root compiler passes.
The operator journey's local ID helper calls were also corrected before
its focused runtime invocation. Logs are
/tmp/artroom-create-outbox-outbox-fields-first-types.log and
/tmp/artroom-create-outbox-outbox-fields-second-types.log.

The first native focus records nine passing and one failing case across
five files. Its failure was the telemetry witness reading the private SQL
column with the new public name. The SQL assertion is restored to duty;
only the affected telemetry file was rerun, and its three cases pass.
The original failure is retained in
/tmp/artroom-create-outbox-outbox-fields-first-native-focus.log; the repair
is /tmp/artroom-create-outbox-outbox-fields-telemetry-repair-focus.log.
The other four files include the retained-record, protected read and SDK
outbox witnesses. Thirteen client envelope/signed-read/operational cases
pass in /tmp/artroom-create-outbox-outbox-fields-client-focus.log.

Both native MCP recipe cases pass in
/tmp/artroom-create-outbox-outbox-mcp-recipes-focus.log. The first Node
schema focus passed five cases and failed the stale documentation
reference. After updating the Markdown schemas and deriving the JSON
catalog with the repository's MCP_WRITE_DOCS path, its one affected
reference case passes in
/tmp/artroom-create-outbox-outbox-mcp-reference-repair.log; the original
failure is /tmp/artroom-create-outbox-outbox-mcp-schema-focus.log.
Separate client and CLI creation-offer route tests each pass in
/tmp/artroom-create-outbox-client-creation-route-focus.log and
/tmp/artroom-create-outbox-cli-creation-route-focus.log. No full gate,
independent terminology review or provider operation has run.

## Remaining identifier and unsigned-wrapper checkpoint

The existing pinned TypeScript 7.0.2 AST API, run from scratch without
installing anything, classifies the remaining names by syntax. The pass
renames bindings and references, expands shorthand properties with their
original quoted keys, and spells native or retained data accesses with
explicit string keys. This avoids confusing a spread with a property
access. Scope-making names use creation/created/creator; lookup results
use matched. Lending discovery and autolink types use DiscoveryResult and
MatchedLink. No old API export or method alias is added.

SignedCreation now uses creation internally, and the paired unsigned
POST /v1/scopes wrapper carries creation. Old Entry-v1 genesis input
founding remains an explicit literal, including the runtime rule view and
replay reader; the CLI's digested retained install plan also keeps its
literal. The existing HTTP witness verifies that the removed wrapper key
is refused before a native turn. This changes no signed request bytes.

The original AST pass found three optional-access punctuation repairs and
local creation/created collisions with existing names or helpers. The
first full compiler log records those failures; a partial repair helper
then stopped on an unmatched source phrase, leaving the duplicate local
for the second failed compiler invocation. The explicit initialRules
binding and scoped helper import names resolve them. The third complete
root compiler passes. Logs are
/tmp/artroom-create-outbox-remaining-identifiers-first-types.log,
/tmp/artroom-create-outbox-remaining-identifiers-second-types.log and
/tmp/artroom-create-outbox-remaining-identifiers-third-types.log.

Canonical comparison after these edits confirms all 36 platform data
values, catalog names and defaults remain identical to the retained
b38c578a baseline. The projection is
/tmp/artroom-create-outbox-platform-catalog-after-identifiers.json.
This is data correspondence, not Source approval. The AST audit is
/tmp/artroom-terminology-ast-rename-audit.json; its original proposal
included six ordinary lookup references in Jam's record.ts. Those edits
were restored before validation because the module belongs to the exact
historical deployed-source.json closure. The retained deployment record,
source and bundle are unchanged. The two existing Jam managed-asset checks
pass in /tmp/artroom-create-outbox-jam-retained-closure-focus.log.
Whether the parent's no-found condition includes these unrelated lookup
locals remains an explicit planner clarification, not a claimed exception
approval. The other active source has no remaining found identifier in
the AST inventory. Generated assets still need their final owned builds.

Focused checks pass: 65 derive compose/mark cases, fifteen platform
version/register cases, five replay decision cases and two CLI install
plan cases. Their logs use /tmp/artroom-create-outbox-remaining-identifiers-
with derive-focus.log, platform-focus.log, replay-focus.log and
install-plan-focus.log. The first native focus passed 24 and failed one
across six files; its five passing files cover real creation/replay,
routes and the two renamed MCP fixtures. It retains expected scripted
reset diagnostics and a native RPC-disposal diagnostic, with no cause or
leak claim. The HTTP telemetry witness first still expected the old
operation label, then still expected the public key for a raw SQL row.
Both original repair failures are retained in the matching
http-metric-repair.log and http-metric-second-repair.log files.

That witness then exposed a production omission: Turns.run's answer
classifier still listed found/rpc:found, after the operation labels had
become create/rpc:create. The classifier is corrected, and the existing
native HTTP witness now verifies both HTTP creation and an exact RPC
retry report accepted with their distinct labels. It also verifies the
removed wrapper is a pre-turn refusal and correlation uses the unchanged
private SQL key. The repaired case passes in
/tmp/artroom-create-outbox-http-rpc-create-classifier-focus.log; its earlier
single-case repair is
/tmp/artroom-create-outbox-remaining-identifiers-http-classifier-repair.log.
No whole suite or full terminology gate has run. Whitespace and the
484-link documentation check pass. Prose, the protected-literal/version
inventory, owned generated outputs and final line counts remain pending.

## Prose, owned assets and protected-literal preparation

Active guides, package READMEs and source comments now use creation and
creator, and describe pending work and the outbox with the current API
names. Historical contract section titles, quoted native keys, fixed Git
content and the inactive protocol specification retain their old names.
The broad prose pass was followed by grammar corrections for collective
pending work and explicit outbox IDs. User-facing browser, CLI and error
copy is updated without changing stored handles or signatures. The MCP
mark explanation values use the new prose while their native mark keys
stay fixed. The owned MCP JSON catalog is regenerated through its existing
MCP_WRITE_DOCS path, and the reference/description checks pass.

The manual defines turn and settle and contains the five requested general
patterns. The [protected-literal inventory](2026-10-16-create-outbox-protected-literals.md)
lists 157 production key/reader occurrences in 126 file-and-line rows,
the two fixed initial Git text values and the separate operational storage
boundaries. Its proposed future versions are not activated by this task.
The remaining Jam lookup clarification is explicit there. Current Source
still has no terminology approval or landing.

The Page, Counting and Lending owned local build commands completed after
the final browser copy changes. They update all five tracked generated
outputs from their current sources. Their logs are
/tmp/artroom-create-outbox-page-owned-build-final-copy.log,
/tmp/artroom-create-outbox-counting-owned-build-final-copy.log and
/tmp/artroom-create-outbox-lending-owned-build-final-copy.log. These are
local asset builds only, not rendered or hosted proof. Root manifests and
the lock are unchanged. All 36 platform data values and defaults still
compare exactly after the prose changes.

The local demo public plan now calls its unsigned projection creation;
its retained private state and signed fields stay unchanged. The first
plain-node test invocation failed before its cases on unsupported
TypeScript parameter-property syntax. An attempted one-class syntax
experiment was reverted completely after inspecting the helper's explicit
pinned tsx requirement; the second plain-node failure is also retained.
Neither failure is a passing test, and the transient declared.test pass is
not used as final evidence. Running the documented tsx 4.21.0 from scratch
with the existing offline cache passes both demo preparation/custody
cases, including the real child CLI invocation, in
/tmp/artroom-create-outbox-demo-plan-pinned-tsx-focus.log. No dependency was
installed in the checkout and no live provider request was made. Original
attempt logs are demo-plan-projection-focus.log and
 demo-plan-projection-second-focus.log under the same prefix.

The line-count script is now retained at scripts/count-code-lines.py.
It counts the same physical code lines as the earlier scratch method,
including blank lines and comments. Classification now also recognizes
retained deploy assets and the -assets.ts modules as generated; both
before and after will use this corrected classification. On exact Main
9a1238b7 the unchanged total is 142,509 lines in 814 code files: 61,847
test lines, 75,912 other source lines, 3,367 tooling lines and 1,383
generated lines. The earlier total was correct but its category split
missed retained Jam and embedded assets. Final counts remain owed at the
frozen implementation commit. No full terminology gate has run yet.

The final connection-custody copy focus passes its four cases in
/tmp/artroom-create-outbox-prose-connection-custody-focus.log. An attempted
extra error-copy focus named a nonexistent test/genesis.test.ts file;
/tmp/artroom-create-outbox-creation-error-copy-focus.log records no cases,
not a passing check. Existing compose/mark and native creation witnesses
above cover the genesis boundary; no replacement test was added merely
for changed error words. The generated literal table's 126 file/line/value
rows are independently checked against the current source. The normal
484-link check excludes notes by design, so its zero broken links is not
claimed as validation of that new inventory table.
