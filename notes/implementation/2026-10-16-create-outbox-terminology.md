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
