# Bounded local signer evidence

G2s is child `88c6b27a`, promise `42c2173b`, under Priority 1 request
`e0292346` and checker decisions `69a33abc` and `69970b97`.

The Scope store now maintains private, derived evidence of each local
signer's latest entry. This prerequisite does not enable the item query.
The existing public summary and signed-read admission paths are unchanged,
including their existing history scan. No caller receives index readiness,
head, cutoff, progress, or failure details through a new public route.

## Evidence and transaction boundary

`entry-signer.ts` contains the unchanged pure `signerOf` classifier, also
re-exported from `signed-reads.ts`. Acts and preparations have their signed
actor. Only an applied genesis with founding input has a genesis signer.
Deliveries, outcomes, diagnoses, and other entries have none.

`SqliteStore.append` updates the index inside the caller's existing sealing
transaction. The actor primary key stores full incarnation/index version,
sequence, time, and entry hash. An upsert accepts only a greater sequence
in the same generation, so backfill cannot replace a later native append.
It does not repurpose `entry.actor` or rerun native judgments.

The private lookup has three results: positive, negative, and unknown.
It validates generation, current head, migration anchors, and the exact
indexed entry's metadata, canonical bytes, hash, own reference, and signer.
Its time comparison is inclusive. An incomplete prefix can supply positive
evidence, but a missing or old row remains unknown until the fixed prefix
is complete. Invalid control or inconsistent evidence is also unknown.
The lookup never calls the old scan or a resolver. These results are not
read authority by themselves: later integration still owes fresh request,
signature, target, resource, clock, window, and root-authority checks.

## Fixed legacy prefix and bounded work

Construction creates schema and captures one fixed legacy cutoff, full
scope reference, version, and tail. A private callback admits at most 4 KiB
of the scope metadata row with direct-column size metadata before transfer
and parsing. It extracts validated own reference, head, and time without
calling the unbounded general `scope()` reader. An oversized or malformed
scope row leaves this proof unavailable, distinct from an absent new scope
in private diagnostics. It reads no history bodies. An empty
new store becomes ready only through its normal genesis append. Later
appends advance the maintained tail without moving the cutoff.

One maintenance call uses one synchronous transaction. It selects at most
128 metadata rows by the entry primary key, from the next expected sequence
through the fixed cutoff. Direct-column `octet_length(bytes)` supplies
truthful UTF-8 body sizes before any body selection. A legacy `size` mismatch
stops maintenance. Hash and time metadata are capped in SQL before transfer
to JavaScript. The backend premise is the verified local Scope SQLite
primitive described in [G2a](2026-10-15-item-metadata-seeks.md).

A quantum admits at most 1 MiB of entry bodies, including a body that later
fails validation. A legal next row that exceeds the remaining allowance is
deferred without reading or skipping it. A single oversized row stops with
`unfit-entry`, rather than retrying an empty batch forever. Parsing, entry
validation, canonicalization, and hashing operate only on admitted bodies.
They establish contiguous sequences, full own reference, previous hash,
and nondecreasing time from genesis. Completion requires the exact cutoff
hash. Missing, malformed, unsupported, or inconsistent history stops the
proof path. No replay judgment, resolver, foreign fetch, native entry, or
outside operation belongs to backfill.

The body allowance is not a total heap bound. Each call also reads at most
4 KiB of control, 4 KiB of scope metadata, up to three anchor metadata rows,
and at most 128 bounded
metadata rows. Lookup adds one actor row, one entry metadata row, and at
most one admitted body. Fixed-size scope/head data and SQL calls add fixed
cost. JSON parsing, validation, canonicalization, and hashing make bounded
copies of an admitted body. This is an application work model, not measured
peak memory, physical disk I/O, service latency, or a global capacity claim.

Cursor, previous hash/time, and actor rows commit together. Reopen resumes
committed progress; rollback retains the prior prefix. Invalid version or
control is quarantined, and permanent history faults stop without an
automatic rebuild. This slice adds no operator repair surface.

## Maintenance owns one alarm contribution

`Wakes.maintenance` persists its own deadline and joins the existing minimum
with native deadlines, dispatch, outside-operation attempts, and the
in-memory driver. Clearing one contribution preserves the others.

Activation schedules a pending legacy index without requiring a read, and
preserves an earlier durable maintenance wake on reopen. Each alarm runs
one bounded synchronous quantum before native asynchronous owners, then
gives those owners their turn. A pending prefix gets a retry at least one
second after the later of host and injected scope time. Final arbitration
runs even when native work fails. Permanent invalid data clears only the
maintenance contribution. A read never runs a migration quantum.
Dormant objects migrate when activated; deployment alone does not walk all
objects. Native drain, dispatch, and operations remain their existing work,
so this slice does not bound the whole alarm or `Chains.update`.

## Validation and limits

Seven focused tests run in the actual isolated Durable Object SQLite runtime.
Native founding, hold, and commitment entries establish classifier/time
behavior and a genuine post-cutoff append that remains newer than backfill.
Pure constructed variants cover unsigned inputs and preparation; these
variants do not claim native judgment coverage.

Larger migration fixtures extend a real founded journal with explicitly
synthetic canonical, hash-linked entries. They establish storage, byte,
cursor, transaction, and scheduling behavior. They do not establish replay
judgments or public authority for those records. The 260-row witness commits
128, reopens, then commits 128 and 4. Other witnesses cover a failed batch
and append transaction, missing/corrupt/backward entries, generation/version
and cutoff faults, unknown negatives, a forged actor row, byte deferral,
an oversized row, and an oversized body with a forged small legacy size.
Oversized synthetic scope metadata is refused before transfer. Both cold
construction and later proof/maintenance checks use the bounded reader.
Small malformed JSON transfers only its admitted byte before strict parsing
returns unavailable. Neither fault reads a history body, marks ready, or
becomes a complete negative. Missing scope metadata remains separately empty.
The alarm witness checks first activation, durable wake preservation,
one-quantum fairness before a failing native owner, and independent clears.
Existing signed-read and restart checks also pass (11 cases).

Four targeted controls fail by assertions: removing the greater-sequence
condition changes the native actor proof from sequence 5 to 2; substituting
legacy size for truthful metadata causes four body-query attempts where
zero are allowed; omitting maintenance from alarm arbitration leaves no
activation wake. Removing scope-metadata admission transfers the oversized
row where null is required. Original source bytes are restored. An initial byte-control
command selected no tests; that result is inconclusive and excluded.
The initial new-test run also found a mutable trace snapshot in the test;
copying the trace at the observation boundary fixed that test defect.
The original frozen `3f4cdcc3` gate passed 1,271 tests with 3 skips,
13 Node checks, and 55 Counting browser checks. Self-review then found that
the original index callback loaded the whole scope metadata row before
extracting small fields. The successor adds the bounded private callback
and its native SQLite witness/control. All 18 selected signer-index,
signed-read, and restart cases and Scope compilers pass after that fix.
The whole gate is not repeated, and its original pass is not a successor
full-gate claim. Exact hashes and results are filed separately for review.

Full G2 still owes bounded genesis-root preparation, authorized query/session
integration, exact signed argument binding, cursors, synchronous body and
response assembly, envelope admission, and bounded consumers. No provider
probe, deployment, new public read, or end-to-end boundedness claim is made.
The parent request remains open.
