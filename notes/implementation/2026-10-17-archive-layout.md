# Internal archive layout

The internal builder now constructs a deterministic cumulative archive
from a bounded, explicitly selected native prefix. It validates the named
native bytes, the immediate parent's represented prefix and the complete
finite Git graph reachable from that parent. It returns objects only
after all checks finish. It has no production caller or package export.

Current Source request `3957ab1c`, promise `1311f791`, continues archive
root `e871ba09` / `55d9a12f` on reviewed Main
`55e1970a5f7a87a9aeeda92542b3e98ad0088a10`, tree
`8125caf09510d3415dd13649e371e07ed289465d`. Technical decision
`9f5ff41d` is adopted by `a0abf26d`. Its cumulative-tree manifest indexes
the whole selected prefix; this does not change the new interval processed
by a pass. Logical names and blob bytes survive deterministic fan-out,
which can relocate physical paths.

The initial child `5b9903fd` / `aa49ae94` cited the valid terminology
landing receipt. Its inherited historical support retirements made that
basis stale. Before any Source artifact, the child was renewed on the
live archive root and adopted decision, with exact Main pins in its body.
The conditions are byte-identical, no dead-basis override was used, and
`1c570af9` retires the original child toward this one. Implementation and
checkpoint history continue; there is no repeated gate for that renewal.

## Object foundation checkpoint

Two internal modules implement an explicit-format object codec and layout
work counters. Existing `Reader`, `objectId`, `idOf`, snapshot and provider
contracts are unchanged. No new package/barrel export or runtime caller is
added. Production Git code imports no Scope or platform runtime module.

The layout requires the caller's original `ArchiveBudget` through a
structural port. It cannot create a replacement deadline or top up the
inventory allowance. Additional limits bound object/tree construction and
reads, files, names, depth, single-object bytes and output work. They may
only decrease. Object construction reserves header/body work before its
own allocation and charges repeated/cached construction. Output work is a
conservative reservation, not unique output size or a heap measurement.
A limit failure prevents subsequent object-list access.

The object reader probes metadata with a zero body limit before reserving
body work. Both awaited calls use the original budget and deadline. It
checks exact format, type, size and hash before exposing bytes. Archive
modes are plain files and trees only. Names and IDs use full-string checks;
executables, symlinks, gitlinks, duplicate names and noncanonical tree
ordering refuse. Git ordering includes the directory slash. Bodies are
owned copies, rather than references to mutable caller buffers.

Commit headers use the adopted identity and message, a single header
order and UTC offset. The encoder supports whole Unix seconds from zero
through 253,402,300,799 inclusive, the last second of year 9999. Earlier
native times and larger/noninteger values refuse rather than wrap or
saturate. Deriving the seconds from the actual selected cutoff entry was
remaining work at checkpoint `0cf9f7a8`; the builder now derives
that value by flooring the actual cutoff's UTC milliseconds.

## Focused evidence and failed attempts

The first Git source compiler reported four narrowing errors. An explicit
never-returning refusal function fixes the narrowing without casts. Git
source and test compilers then pass. Four focused cases pass in original
session `12310`; their Git objects are mechanical fixtures, not native
journal admission or privacy certificates. They use real scratch Git
repositories for both formats and the actual existing native budget class
through its structural interface. The Scope budget import is test-only;
its SQL type import is erased. No SQL service or provider runs here.

The cases check exact object/tree/commit bytes through real Git read-back
and strict fsck, deterministic ordering, both timestamp endpoints and a
post-2038 time, strict modes/spellings, ownership of bytes, prior inventory
cost, metadata-before-body reservation, corrupt bytes, cached work,
stopped output and a delayed body under the original deadline. This is
object-foundation evidence, not a complete archive builder or replay run.

The first hash-check control, session `2271`, ended CLOSED 2. Its fault
reached the corrupt-body case, but Vitest reported a generic rejection
error rather than an assertion; the control is inconclusive. The witness
now captures an explicit accepted/refused outcome. A second control could
not run its fault because the updated baseline had one failure. A focused
one-case run identifies object-list access after a stopped output counter;
it ended CLOSED 1 with three cases skipped. The metadata/input helpers
now check that stopped state before work or output access.

Final original control session `47181` ended CLOSED 0: the unchanged
baseline passes four cases, disabling only the object hash comparison
produces three passes and one assertion failure, and the file is restored.
The assertion receives accepted where object-mismatch is required. This
is the distinguishing control; neither earlier attempt is passing evidence.
Restored source hashes at the object-foundation checkpoint were:

- `journal-objects.ts`: d87395afd1a6baacdac0d92d1caf680dc4c82e9577a406b8dcef2b0369f9c998
- `journal-work.ts`: e6d55ff9ec4a98df8a7cd4a3950d2e23fe4eb26589194e30778b64759aa0d039

Original logs use `/tmp/artroom-archive-layout-` with suffixes
`first-object-types.log`, `object-types-after-narrowing.log`,
`first-object-test-types.log`, `first-object-focus.log`,
`object-hash-control.log`, `object-hash-control-explicit-outcome.log`,
`object-boundary-baseline-failure.log`, `object-types-after-stopped-output.log`
and `object-hash-control-final.log`. No whole-suite gate had run at that
checkpoint. These are retained original attempts, not a union gate.

## Complete internal layout

The private selection description preserves the native inventory's
consumer reasons. It normalizes typed retained keys in byte order,
collapses exact duplicate descriptors and refuses conflicting sizes,
unsupported consumers and failed dependency choices. Its closed wire
form is bounded to 1 MiB before parsing. Each selected local entry is
read by position and checked for canonical bytes, native hash, full scope
reference, continuity and cutoff. Consumer origins bind to actual input
variants. Retained rule, definition, snapshot and value bytes use their
native hash domains. The initial cohort refuses foreign entry copies
and custom value domains before reading them. The input port has no
enumeration, current-head or detached-text operation.

The cumulative v1 manifest indexes entries from zero through the pinned
native head. The pass's new interval is reported separately. Manifest
and head files have closed canonical schemas. Private consumer reasons,
work counters and ancestry bookkeeping do not enter these files. Segment
bytes use LF separators without a trailing LF. A closed 1,000-entry
segment stays byte-identical on extension; the final open segment can
grow. Physical fan-out uses the complete logical name set. The mechanical
4,096-to-4,097-name witness checks relocation with stable logical names
and blob identities. It uses separate planning calls: it does not claim
that a whole native archive can exceed the initial 512-attempt allowance.

The immediate parent must match the selected object format, full native
scope/incarnation, strictly earlier cutoff, canonical head and manifest,
fixed commit timestamp and parent ID. Its represented prefix, retained
keys, closed segments and final segment prefix must match the selected
native bytes. Unexpected paths, empty directories and executable, symlink
or gitlink modes refuse. The Git-valid corrupt-retained-file counterexample passes real
Git fsck but fails this native content comparison.

Decision `30b4f3f7`, adopted by `e9201582`, adds the finite parent closure
walk. It follows actual commit/tree/blob edges through a genuinely
parentless archive commit, validating each object's type, selected-format
ID and content hash. A bounded visited map avoids expanding shared
subtrees twice. Every edge and cache lookup still spends allowance, and
cached subtree heights preserve the depth bound on a deeper reuse.
Embedded native snapshot IDs remain blob payload and are never followed.
Older Git integrity is checked, but older native cutoff semantics are
not replayed. There is no caller-selected stop ID or persisted closure
certificate.

All phases share the caller's original native allowance and deadline:
4,096 entries, 512 attempts, 64 nodes, 16,384 calls, 4 MiB metadata,
64 MiB input work and 30 seconds. Downward-only layout limits add 8,192
object attempts, 2,048 trees, 8,192 files, 32,768 names, depth 64,
8 MiB per object and 64 MiB output work. Commit ancestry and physical
tree depth are bounded. Repeated parent reconstruction and cache work
remain charged. The 1 MiB description bound, cumulative work or many
prior archive commits may make a small current prefix unavailable before
the nominal entry limit. No allowance is reset or raised to fit a test.

The builder captures API operands before awaiting callbacks. A retained
read receives a copied key. The object reader captures validated primitive
probe metadata before the body await and captures the returned data once.
Intrinsic byte lengths and bounded owned copies prevent Buffer views or
mutable adapter records from changing the validated bytes. Every direct
work-limit failure stops later output access. No successful partial
archive is exposed on missing, corrupt, exhausted or late work.

## Subsequent checks and corrections

All fixture selections are synthetic native inventory stand-ins. Their
entry shapes, canonical bytes, signatures and hashes use the existing
code, and their Git repositories and fsck/read-back are real. They do
not run native admission, SQL, a policy judgment or a provider. The test
budget is the existing `ArchiveBudget` through the structural port.

The first builder focus passed two cases (`62653`). Expanding it exposed
an invalid fixture operation spelling and evidence shape. The compiler
and five-case run failed; those are retained failed attempts. The repaired
run (`58054`) passed four cases and failed a missing-input witness that
assumed input order. Naming the exact missing key fixes that witness;
its focused run passed. The domain/budget/fan-out run (`59320`) passed
eight cases; the parent-mode run (`96541`) passed twelve across two files.

Control `54589` passed unchanged with eight cases. Disabling only the
immediate parent's file-byte comparison produced seven passes and one
assertion failure: accepted instead of parent refusal. The source was
restored. The recorded-time boundary focus then passed for epoch,
subsecond flooring, post-2038 and year-9999 values in both formats;
pre-epoch input refuses.

A Buffer ownership witness failed before the copy repair. The old
`slice()` could retain a Buffer view. The repaired copy and cumulative
file-planning focus (`37558`) passed five cases. Independent checkpoint
advisory `084582e9`, adopted by `7e5f4d4a`, found two further defects:
mutable probe metadata across an await and nonterminal direct tree-size
refusals. Two focused assertions reproduced them. Capturing primitive
metadata and stopping the shared work object fixes both; original run
`30821` passed all four object cases. The advisory concerns checkpoint
`0cf9f7a8`; it is not Source approval of the later implementation.

The first closure test compiler rejected a possibly undefined byte access;
an explicit indexed value fixes it. The first closure focus (`76793`)
passed two cases but its combined two-format fault matrix exceeded
Vitest's five-second wrapper timeout. The matrix now runs separately
per format with a 15-second test wrapper. Production deadlines and
allowances are unchanged. Run `98845` then passed all fourteen closure
and layout cases, including mutated callback operands. A strengthened
cache-depth witness initially expected the wrong error text; that run
failed one assertion with three cases skipped. The corrected focused
run (`25056`) passed the case with three skipped. It also checks that
Git-looking IDs inside blob payload cause no reads.

Parent-walk control `53740` passed its two-case baseline and failed both
formats when the walk stopped at the immediate parent. Its first failure
was a traversal-count assertion. Moving that ancillary assertion after the
missing-object cases makes the required behavior the distinguishing
boundary. Refined control `73884` ended CLOSED 0: two baseline passes;
the same fault produced two assertion failures, accepted instead of
parent refusal after only the older commit was removed. The source was
restored. This is the parent-closure refusal control, rather than a claim
based only on the reported count.

Checkpoint `d6c86ac0`, tree `1083aa012648b96e12b7f268ec9994be4efe9293`,
was submitted for read-only advisory `86a5e5d5` before the gate. A later
self-audit found additional direct size refusals outside the object
writer/parser. A file-tree witness reproduced accessible earlier objects
after a zero-file allowance refused the call. The list, description,
JSON, path, file and generated-manifest size guards now stop the shared
work state consistently. Invalid non-list/non-string shapes remain input
refusals. Original run `15585` ended CLOSED 0 after the repair: Git source
and test typechecks, then eleven focused file/layout cases passed. The
reproducer's original failed log is retained; it is not passing evidence.

Logs retain the `/tmp/artroom-archive-layout-` prefix. Relevant suffixes
include `parent-content-control.log`, `buffer-ownership-original-failure.log`,
`buffer-copy-and-cumulative-files-focus.log`,
`advisory-original-boundary-failures.log`,
`advisory-snapshot-terminal-repair-focus.log`,
`first-complete-closure-focus.log`, `closure-and-operand-focus.log`,
`cache-depth-opaque-focus.log`, `cache-depth-opaque-repaired-focus.log`,
`parent-closure-control.log`, `parent-closure-refusal-control.log`,
`file-limit-terminal-original.log`, `terminal-limits-types.log` and
`terminal-limits-focus.log`.
These original focused runs are not a combined gate. The separate frozen
gate is recorded below. Complete independent Source review remains
required before landing.

## Frozen gate and Source preparation

The first complete gate ran at clean frozen head
`a1829883d353d4676d34b39a857a0cd376064309`, tree
`ea86f84d2f64245cc5f4efd50c9ac59b29853498`. Original owner session
`79043` exited zero. Installation took 2.4 seconds elapsed and 3.4 CPU;
whitespace 0.0 and 0.0; workspace typechecks 7.4 and 26.7; tests 427.9
and 539.8. The result was 1,559 Vitest passes, three skips, 16 Node
passes and 55 Counting passes. No suite was restarted or combined with
an earlier run. Runtime fault messages in the step log did not make the
completed gate fail.

This was local macOS 27.0.1 on arm64 with 18 logical CPUs. The observed
load averages before the gate were 1.30, 1.38 and 1.35. Existing dependencies
were present but no verified-lock stamp existed, so the gate performed
its normal existing-lock installation. The package lock hash stayed
`a3dd5689f33c5181b5ff48553fbb3c45b44abf96720ba9935eed40853a3b09bc`.
These are observations, not a claim that load alone caused any timing.

The original gate log is `/tmp/artroom-archive-layout-a182-gate.log`.
Its step logs are under
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.P1G8wYWM0a`.
They remain owner evidence; an independent review receives only the
explicitly granted finite metadata, not access to adjacent logs or helpers.
All 1,439 original Main mode/blob leaves are exact at the frozen head;
the change adds thirteen paths. This post-gate update changes this note
only. All twelve implementation/test leaves remain exact to the passing
freeze; the Source preparation checks that correspondence before filing.
Read-only advisory `86a5e5d5` at earlier checkpoint `d6c86ac0` is distinct
from independent Source review of the final candidate. No Source approval
or landing is claimed by this gate record.

## Empty-directory correction after Source filing

Self-audit found that the immediate-parent flat file map silently dropped
empty directories. A Git-valid parent could therefore contain an extra
empty directory outside the archive path set while all expected files
still matched. The file writer never creates an empty directory, so this
parent is not the canonical archive layout.

The unchanged `c811785ea` candidate reproduced the defect in one offline
scratch-Git probe (`8ed6f7`, exit 1): the ordinary SHA-1 parent extended,
but the same parent with only an unexpected empty directory also extended.
The assertion required a parent refusal. The first probe attempt
(`d1f36c`, exit 9) used a flag removed from Node 26; it did not run the
probe and is not defect evidence. The existing esbuild then bundled the
same probe without installing a tool or changing checkout dependencies.

The strengthened existing parent-path witness reproduced the same
assertion in both SHA-1 and SHA-256 (`63037`, exit 1, two failures and nine
unselected cases). Its previous metadata, forbidden-mode and unexpected
blob checks passed before each new empty-directory assertion failed.
The immediate-parent file walker now refuses an empty tree as a malformed
layout. The generic object reader and older Git-closure walk are unchanged:
older blobs remain opaque and older native layout semantics are not
replayed.

Git source/test typechecks passed. The repaired files, layout and closure
focus (`79243`, exit 0) passed sixteen cases in three files. Original logs:
`/tmp/artroom-archive-empty-tree-c811-probe.log`,
`/tmp/artroom-archive-empty-tree-c811-bundled-probe.log`,
`/tmp/artroom-archive-empty-directories-original-focus.log`,
`/tmp/artroom-archive-empty-directories-types.log` and
`/tmp/artroom-archive-empty-directories-repaired-focus.log`.

Finding `bdcf6890` holds the old candidate. Supersession `24704f32`
withdraws its exact Source review `27b153f3`; Source request `3957ab1c`
and promise `1311f791` remain live. The old passing gate, thirteen reports
and immutable metadata grant `73a8e23f` are historical evidence, not
approval of this repair. The changed implementation requires a fresh
freeze and gate before replacement artifacts and independent review.
The separate P3 integration gate `24299` also remains an actual pass
of its original composition; it cannot validate this changed dependency.
These log references grant no external-file or execution access.

## Remaining archive outcomes

This internal builder enables no archive producer, exporter, alarm,
provider/send call, privacy certificate, access or consent decision. The
current native inventory configures no real policy. A shaped selection or
successful layout fixture cannot certify inline or foreign data. Clone
HistorySource/CLI/integrity/replay/receipt-prefix witnesses, the asynchronous
writer, lost-push reconciliation, disclosures, progress and G1's verified
closure plus at-send retention guarantee remain owed. No root outcome,
Source approval, landing, deployment or publication is claimed here.
