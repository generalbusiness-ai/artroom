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
