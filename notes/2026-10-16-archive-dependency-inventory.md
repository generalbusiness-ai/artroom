# Archive dependency inventory preparation

Source request `7e39eb4b`, promise `c248de8d`, implements the selection
boundary adopted in `1815b3dd`. Technical decision `9f5b0a32` permits a
local-native, two-phase pass. This checkpoint shares consumers and byte
checks; it is not a completed inventory, exporter or archive verdict.

`creates()` now lives in derive and retains the scope module's export.
Its native grammar is unchanged: direct create-definition sends in acts
and receives, distinct digest edges in byte order, with self and platform
references terminating. Native founding still tolerates a missing unused
child. Archive closure must separately require that child's bytes.

The closed consumer plans carry full local fact provenance and input
variant, exact retained key, purpose, and required/probe/text handling.
They distinguish replay-required definition roots from archive-only child
closure. Ordered observation probes use native definition keys, preserve
domain order and select no failed probe. Text plans record archive omission;
ordinary replay still reads and settles texts where it already did.

Replay's actual retained read sites use those plans. Shared byte helpers
preserve ordinary replay's existing JSON spelling rules. Archive selection
can explicitly require canonical bytes. Required copies/rule inputs hash
their actual bytes; values hash their canonical value in the named domain.
Semantic definition, entry, snapshot and owner checks remain necessary.

Sixty-four focused cases pass across byte validation, closed consumers,
native reference grammar and existing replay/decision behavior. Seven
initial grammar/native-founding checks also passed. Package source/test
typechecks pass. No full gate or Source review is claimed at this checkpoint.

The native pass remains owed: one local full scope and exact cutoff; the
whole prefix through that cutoff, including earlier archived entries;
privacy admission before forbidden payload reads; bounded metadata first;
validation before dependency selection; independent declaration closure;
terminal limits and no late continuation. Initial conservative ceilings are
4,096 entries, 512 retained attempts, 64 aggregate declaration nodes, 64 MiB
of cumulative input work, 16,384 native SQL calls, 4 MiB of projected
metadata, and one original 30-second deadline. Native per-root limits still
apply. The existing namedDefinitions limit counts the root before testing
each additional child, permitting up to 16 additional visited children at
the default limit; aggregate 64 does not enlarge any individual root.

SQLite's [octet_length](https://www.sqlite.org/lang_corefunc.html#octet_length)
can obtain a column's byte size from metadata before JSON inspection. The
native implementation must verify support and account for actual stored
sizes before JSON work; a small projected row is no proof of cheap parsing.

Inspection found a prerequisite: `Core.pinned()` currently reads and parses
the genesis body. It cannot establish an archive pin before that read.
A bounded native pin/seed metadata index, written with new genesis entries,
will be reviewed separately before the scanner uses it. Historical scopes
without trustworthy admission metadata must refuse or remain unavailable;
this preparation authorizes no unbounded or privacy-blind backfill.

No private cohort is newly certified. No history, foreign copied-entry
body, custom-value body or detached text is exported. No push or deployment
ran. Completed manifests, Git layout/writer and clone/replay witnesses
remain separate work.

The branch now composes local main `60ab711f`, preserving C1 and both
accepted concise proposals. The export conflict was resolved by retaining
standing, created-definition and retained-plan exports together.

A private pass budget now admits the agreed aggregate entry/attempt/node,
SQL-call, projected-metadata and input-work limits, without reset or top-up.
Native calls reserve metadata plus input work before execution; repeated
parsing/hashing still needs its own reservation at the consumer. One
original deadline fences awaited values and later SQL/cache continuation.
Pure fake-SQL/clock tests establish these budget mechanics, not a measured
native inventory bound. Sixty-seven selected byte/consumer/replay/budget
cases pass; native preflight and full per-consumer selection remain owed.

Native pin prerequisite `b40f8765` is now approved and locally on main as
`8e7481ee`. This branch composes its exact helper and atomic genesis write.
The new scalar prefix reader binds that metadata and an exact cutoff,
checks native sequence/hash/byte-size rows, and reserves cumulative input
work before entry JSON inspection. The initial JSON allowance is 64 full
entry-byte equivalents per selected row, covering the fixed header and
bounded effect/owner projections. Raw body transfer and later parsing,
hashing and validation need separate charges. This deliberately supports
less than 64 MiB of entry bodies; it is not a CPU-time or heap guarantee.

A second helper classifies the whole selected prefix using only bounded
native JSON metadata projections. It refuses any retained foreign copy,
unknown input/effect/owner/capability metadata or declared custom value
domain. Native owner tables and certificates are trusted configuration,
not request flags. The helper has no route, body reader or export permit.
Selected additional declaration roots, their policy coverage and archive
closure still need orchestration before this is a complete privacy pass.

Eight native prefix/privacy cases pass. They include exact 4,096/4,097
scalar positions; excessive stored byte work before JSON; a forbidden copy
or unsupported owner in the last selected position with no body reads;
and stopped, damaged or unknown metadata refusing without a partial result.
Synthetic/corrupt history rows, certificate and owner tables are explicitly
stand-ins. Founding, pin writes, SQL queries and byte admissions are native.
The cumulative-work and foreign-copy controls each fail by the intended
assertion when their one guard is disabled; both guards are restored.

Replay now shares act, observation, text, outcome value and snapshot
selection at its actual reads. Thirteen existing ancestry/snapshot cases
pass after the extraction. The snapshot helper retains the native ancestry
record grammar and ordinary replay's incomplete/unwalked qualification;
it grants no ancestry proof. No full gate or exact-head review is claimed
for this development checkpoint.
