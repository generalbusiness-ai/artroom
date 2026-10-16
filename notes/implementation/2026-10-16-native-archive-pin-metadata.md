# Native archive admission pin metadata

Request `0975896d`, promise `790296e8`, is the admission prerequisite for
archive inventory `7e39eb4b`. It follows technical decision `9f5b0a32`.
`Core.pinned()` currently reads the genesis body. An archive cannot use
that path to classify a cohort before selecting entry bodies.

The native SQLite append now writes one derived `archive-pin-1` metadata
row beside a new genesis, within the existing turn transaction. The closed
record contains its format, full ScopeRef, seed and genesis hash. It is at
most 1 KiB. The seed recomputes the scope ID and binds the definition and
creator/cause/ordinal. Ordinary entries do not rewrite it. An unsupported
or oversized description is omitted; this adds no new declaration-validity
refusal. The extra row has bounded size, independent of history length.

The internal reader accepts the caller's native full scope frame and uses
at most four SQL calls. First it reads scalar sizes/types of the pin and
current scope metadata. It then reads at most 1 KiB of pin metadata and
16 KiB of scope metadata, followed by the root entry's hash alone. It
checks canonical metadata, closed pin shape, scope ID from seed, full
scope/incarnation/kind, stored scope identity/genesis hash and root-row
hash. It does not read entry bytes, retained bodies or inventory rows.
The scope metadata check establishes these identity/genesis claims; a
later inventory still must validate its complete frame and exact cutoff.

The size probe uses SQLite's
[octet_length](https://www.sqlite.org/lang_corefunc.html#octet_length),
which obtains the size of a text/blob column from metadata. Native workerd
SQLite support is exercised in the tests. Missing function support,
missing historical metadata, malformed/oversized data or a binding mismatch
returns unavailable metadata, without a body-read fallback. Actual returned
UTF-8 length is rechecked before parsing. The reader writes nothing and
performs no automatic backfill, including after an ordinary accepted turn.

This is admission input, not a privacy certificate, history proof, complete
prefix scan or export permission. Native orchestration must obtain its own
scope frame and invoke this reader, rather than accept a supplied pin or
absence boolean. It must charge the bounded SQL/metadata/validation work
and apply the pass deadline. Trusted cohort policy, whole-prefix
consumer/owner/domain facts, declaration closure, consent and writer
admission remain separate. Existing historical cohorts without this index
remain unavailable until a separately reviewed migration can establish it.

## Evidence

The fixtures use made-up platform data and a declared rule stand-in. The
signature, founding, transaction, SQLite and restart paths are native.
Eleven focused cases pass across the three new metadata cases and existing
C1/founding neighborhoods. Scope source and test typechecks pass.

The native cases observe the four metadata-only queries, canonical
seed/pin identity and stable row across eviction. They reject missing,
malformed, unknown-format, extra-field, forged definition/seed/incarnation,
genesis/root hash and current-scope metadata, plus oversized pin/scope
strings. Oversize and missing-function cases stop after the scalar probe.
The SQL fixture blocks attempted history-body reads and asserts that
outside the reader's fail-closed catch, so a caught assertion cannot hide a
fallback. Metadata rows are restored after each injected fault. A normal
accepted turn with a missing admission row does not backfill it. B-minus-one
genesis capacity failure rolls back both its entry and its admission row.

Three bounded controls fail existing assertions: omit the native metadata
write; allow a seed whose definition no longer recomputes the scope ID;
and bypass the pin-size guard. The last control distinguishes stopping at
the scalar probe from reading and rejecting an oversized JSON body later.
Source is restored after each control. Restored hashes are:

- `archive-pin.ts`: `c01be690959db2478150a44e22a58eca44084b11d205499dd52d49f703294436`
- `sqlite.ts`: `dba2c1cea43db843103812f4c4c1ab794e0c513009ed1ea3ec88f79471866947`

This checkpoint adds no read route, exporter, cohort certification,
provider call, push or deployment. A composed frozen gate and exact-head
review follow before local landing. The broader shared-consumer/scanner
preparation remains on its own branch.

## Frozen gate

The clean composed Source head is
`399f37674146900613c8a28f7bb88895e0dd9076`, tree
`af212cc0e6a77b29e396cac5911baaa1a33a449c`, including local main
`60ab711f`. The normal Page and Counting producers run without changing
tracked assets. The original `caffeinate -is npm run gate` process closed
with exit 0: installation 2.3 seconds elapsed / 3.4 CPU; whitespace
0.1 / 0.1; typechecking 7.5 / 25.0; test stage 199.2 / 279.6. Vitest
reports 1,387 passed and three skipped; all 16 Node checks and all 55
Counting checks pass.

The wrapper is `/tmp/artroom-archive-pin-399f3767-gate.log`; private raw
stage logs are in `tmp.xEqApwsJbd`. Only closed public test metadata is
offered to the checker, not a general read grant to raw logs or fixtures.
This reporting-only successor changes this note alone. Source, tests and
assets remain byte-identical to the gated head. Final review and governed
local-main merge remain separate; this gate grants no export permission.
