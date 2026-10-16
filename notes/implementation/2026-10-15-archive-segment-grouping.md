# Archive segment grouping and directory sharding

This is A1b, child `16f047f3`, promise `79ea38d4`, under Priority 1
request `e871ba09`. It implements two internal layout helpers from the
[durability design](2026-10-09-shared-language-volatile-acts.md#154-layout).
It follows the landed [path grammar](2026-10-15-archive-path-grammar.md).

`archiveSegments` takes an already selected contiguous cohort, beginning
at any legal sequence number, and a caller's total output byte allowance.
It checks canonical JSON objects and joins lines with LF separators,
without a trailing LF, as R-LOG-17 specifies. A
segment closes at 1,000 lines or before its next line would exceed 8 MiB.
A single line over that bound refuses; no partial result is returned.
The sequence numbers give the existing twelve-digit logical segment paths.
Native entry form, hashes and continuity are the later builder's checks.
Grouping does not prove that a canonical object is an entry.

`archiveShards` takes the complete set of names in one logical directory.
Up to 4,096 names stay directly in that directory. Larger sets split by
successive groups of three decimal digits for segment names, or two hex
digits for retained digests, following
[R-LOG-19](../docs/protocol.md#304-the-object-bound-and-directory-fan-out-r-log-19).
The original name stays at the leaf. Input order does not affect output.
Duplicate, alternate or path-shaped names refuse. Each retained kind and
value domain needs its own call; domain encoding remains A1a's job.

The caller must supply old names with new names. With append-only names,
a split remains split. The helpers do not read a parent, extend its last
segment or plan a commit. Their byte allowance bounds returned segment
payload, not peak allocation or metadata; this slice makes no measured
memory or runtime capacity claim.

Four focused cases and Git source/test typechecks passed. The cases use
synthetic canonical objects, labelled as such. They check the exact line,
separator-inclusive UTF-8 byte and aggregate limits, malformed or discontinuous
input, both sides of the directory threshold, clustered decimal and hex
keys, every resulting directory's child count and input-order independence.
Two targeted controls raise the segment limit to 1,001 and the directory
limit to 4,097. Their existing cases fail by assertions at the segment
boundary and required split respectively. A third adds a trailing LF;
the byte-bound case fails because the exact-B segment becomes B+1.
Source bytes were restored;
the restored SHA-256 is
`e690bd5334d2304d40b9229a44ba3a6e9cef2f07197b09445638c4b9b24f0417`.

The original gate at `3777f07e0f2506af93735b6770766e48e0b1cbe5`
passed typechecks, whitespace, 1,255 Vitest cases (three skipped), 13 Node
checks and 55 Counter checks. It had started before the checker's reminder
exposed the builder's mistaken trailing-LF framing. The corrected successor
changes segment encoding, byte accounting, the boundary cases and this note;
four focused cases and Git source/test typechecks passed, and all three
controls distinguished their faults. The full suite was not repeated, and that original
gate is not a whole-successor result. Exact evidence pins are filed separately.

This module has no public package export and no runtime caller. It reads
or writes no archive. Full A1 still requires the per-input replay inventory,
privacy omissions and disclosures, manifest, object modes, deterministic
SHA-1/SHA-256 commits and real local Git read-back. Parent append planning,
export permission, the writer, clone replay and archive progress remain
owed. No existing scope level, journal, definition pin or publication
behavior changes here.
