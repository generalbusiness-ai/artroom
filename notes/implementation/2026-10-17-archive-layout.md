# Internal archive layout

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
saturate. The eventual builder still must derive the seconds from the
actual selected cutoff entry, including the adopted subsecond rule.

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
Restored source hashes are:

- `journal-objects.ts`: d87395afd1a6baacdac0d92d1caf680dc4c82e9577a406b8dcef2b0369f9c998
- `journal-work.ts`: e6d55ff9ec4a98df8a7cd4a3950d2e23fe4eb26589194e30778b64759aa0d039

Original logs use `/tmp/artroom-archive-layout-` with suffixes
`first-object-types.log`, `object-types-after-narrowing.log`,
`first-object-test-types.log`, `first-object-focus.log`,
`object-hash-control.log`, `object-hash-control-explicit-outcome.log`,
`object-boundary-baseline-failure.log`, `object-types-after-stopped-output.log`
and `object-hash-control-final.log`. No whole-suite gate has run for this
Source. These are retained original attempts, not a union gate.

## Remaining outcome

Manifest normalization, named native entry/retained-byte validation,
closed cumulative schema, parent-prefix/append validation, complete
logical-to-physical file layout and their bounded witnesses remain to be
implemented. Then run one gate at the frozen full implementation and
request exact independent Source review with complete path reporting.

This internal foundation enables no archive producer, exporter, alarm,
provider/send call, privacy certificate, access or consent decision. The
current native inventory configures no real policy. A shaped selection or
successful layout fixture cannot certify inline or foreign data. Clone
HistorySource/CLI/integrity/replay/receipt-prefix witnesses, the asynchronous
writer, lost-push reconciliation, disclosures, progress and G1's verified
closure plus at-send retention guarantee remain owed. No root outcome,
Source approval, landing, deployment or publication is claimed here.
