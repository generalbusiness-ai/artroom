# Bounded definition and state preparation

G2p-a is child `7fd9b815`, promise `e043bd40`, under Priority 1 request
`e0292346` and adopted decision `eae69004`. It follows the landed G2s signer
index and G2r genesis proof. This is private support for a later bounded
query. It switches no public caller, session policy, or legacy read path.

## One operation and one coherent snapshot

`ReadPreparation.capture` reads current scope metadata before genesis or
definition bodies. Direct-column UTF-8 size admission caps that metadata at
4 KiB before transfer and strict parsing. The parser checks the full native
ScopeState shape, canonical bytes, full references, status/time/head, and
recorded genesis. Missing and unavailable metadata are separate private
results; neither produces a prepared frame or authority.

The exact genesis uses the G2r `ProofBytes` contract. Its full reference,
sequence zero, and hash must match the captured current scope. It must be
an applied genesis. The native byte reader admits the body before transfer
and verifies canonical Entry structure/content. A new optional before-SQL
hook lets the preparation budget reserve each reader call. Existing callers
use a no-op hook; their behavior is unchanged.

One shared `PreparationBudget` follows capture, native reference callbacks,
and post-await revalidation. Its initial support limits are:

- 16 read/validation calls and 16 metadata candidates, including repeated
  reads and lookahead. Pure policy/support checks and cached scope accesses
  also spend calls conservatively.
- 256 KiB cumulative admitted item/fold bodies and 64 KiB metadata payload
  reservations, with bounded key/name/framing overhead.
- One exact genesis read, reserved at its 1-MiB maximum before its metadata.
  Recapture cannot reset this allowance.
- At most 256 KiB retained declared-definition body bytes. A cached raw
  declaration avoids transfer but still spends validation calls.

Scope rows, genesis, declarations, and item/fold bodies have separate
allowances. These are initial supported-operation limits, not a promise
that every valid room or declaration fits every composed operation. Budget
failure latches unavailable; a caller cannot catch it and continue with a
fresh allowance in the same operation.

`PreparedRead.current()` rereads bounded scope metadata and requires the
same full snapshot, including incarnation, genesis, head, status, and time.
It also checks the current policy version and reruns whole-runtime support.
A changed head or policy ends this operation. The caller must perform fresh
authentication after this last storage phase and must not treat a frame as
read authority. The session child owns the absolute deadline, pending work,
and fresh MAC/clock/read checks across any await. This storage child has no
async peer or public request handler.

## Exact pinned content and a bounded immutable cache

A retained declaration's truthful `octet_length(bytes)` is admitted before
its body is selected or parsed. Actual UTF-8 length, canonical identity,
and `definitionDigest` under `DOMAINS.definition` must match the genesis pin.
The support callback is the existing `Scope.validate`: the same profiles,
derivable/counted capability support, and runtime bounds apply. Untrusted
retained declarations never receive the platform validation option.

Platform support uses only the exact closed `VERSIONS` entry. The existing
`Scope.platform` must supply runnable whole support. The result must have
the exact requested version, the catalog data's domain digest, and its native
rules binding. There is no `NEWEST`, prefix alias, or other-version fallback.
The existing Scope validator is unchanged. Invalid, unavailable, or
substituted support refuses this path.

The loader retains at most one successful immutable raw declaration, at most
256 KiB. Its key binds helper policy version, full own genesis fact, exact
pin, and the validator/capability/runtime-bounds policy tag. The pin name is
capped at 128 bytes, policy at 256 bytes, and the complete key at 2 KiB, with
admission before serialization. Cache hits rerun support; missing or invalid
content is not a permanent negative. No genesis, head/status/clock, claims,
member/key standing, or mutable item/fold state is stored in this cache.
The loader is internal and not yet wired into a public query; its caller
must own the instance and shared operation budget.

The body allowances are not total heap or physical I/O measurements. The
native sender, strict parsing, canonicalization, hashing, and whole-support
validation make bounded copies or passes. Repeated validation is limited
by the call budget. Trusted packaged platform data/code has its closed
runtime catalog cost; it is not an external declaration body. Frames retain
only their bounded operation snapshot/data. No global concurrent-frame,
wire-size, synchronous preemption, or deployed performance claim follows.

## A small read-only facade

The facade exposes only `scope`, `page`, and `incarnations`, the methods used
by current exact native membership/birth reference callbacks. Other access
stops the operation. This is an admitted implementation, not a Pick over
unrestricted Store methods. It runs no native turn, judgment, outside work,
index construction, resolver, or legacy `pinned()`/summary fallback.

Pages reuse G2a's metadata-first `(type,state,id)` seeks. All state lookahead
and merge candidates are reserved before SQL. The page preserves ascending
first-ID selection and `more`; it admits all emitted bodies against the
remaining byte allowance before selecting any of them. Unreturned lookahead
bodies are not loaded, even when large. Actual body length, canonical Item
shape, ID, type, and selected state are checked. The backend premise is
[G2a's verified Scope SQLite primitive](2026-10-15-item-metadata-seeks.md).

Incarnation proof uses the existing folded primary key. Native observed
keys have been canonical `[scope,inc,subject]` since `putObserved` was added
in `57b189840`. One scope-prefix seek finds its first incarnation; a second
seek jumps past that entire incarnation prefix, across all its subjects.
It distinguishes zero, one, and more than one without DISTINCT, a whole-table
scan, a new index, or a legacy population pass. Keys and values are bounded
and validated together. Unsupported/malformed keys, mismatched values, or
oversized bodies stop; they are not skipped to fabricate completeness.

The two-incarnation result is an ambiguity witness, not an inventory. The
facade returns an array only for complete zero/one results and stops on
ambiguity. Native `referenceOf` would grant no reference for an ambiguous
history either. No truncated same-incarnation prefix is called complete.
The premise is the native key contract, not integrity of an arbitrarily
rewritten database or an unknown historical storage format.

## Validation

Thirteen new focused cases pass in the actual isolated Durable Object SQLite
runtime, with Scope source/test compilers passing. A combined focused run
also covers the 26 existing genesis-proof, signed-read, and restart cases:
39 cases. Genuine native founding supplies the declared pin/cache witness.
The test forbids legacy Store scope/history/retained readers during capture.
It verifies read-only SQL, late-arriving content, current support on cache
hits, malformed/oversized metadata and declarations, domain mismatch,
shared genesis allowance, policy changes, and head drift.

Current exact platform versions run through the native whole-support
validator. The catalog reference callbacks agree with the complete Store
on bounded layout fixtures. The replacement platform pins, item/fold rows,
large populations, and altered metadata are explicitly synthetic storage
fixtures, not judged platform creations, observations, or public authority.
The differing-version case supplies a genuinely runnable other version and
requires refusal for the actual pin; no fictitious valid-data mutation is
counted as that evidence.

Native incarnation cases contain 2,500 subjects of one incarnation and
3,000 unrelated scopes. One-incarnation proof reads two or three rows,
loads one body, and makes three SQL calls; the extra row can be an
out-of-range cursor boundary touch. Two-incarnation proof reads four rows,
loads two bodies, and makes four calls. Plans show primary-key seeks with
no scan or temporary sort. The page witness uses 3,000 unrelated final
items and a 1-MiB unreturned lookahead body; it loads only the first selected
item and checks the indexed seek plan and bounded cursor work. These are
fixture counters, not service latency, global CPU, or physical I/O results.

Seven targeted controls fail by assertions and restore exact source:

- Ordering by the capped-key alias reads 5,004 rows where at most three are
  allowed; ordering by the indexed column avoids that sort.
- Jumping past the whole scope instead of the first incarnation falsely
  reports one incarnation where two are witnessed.
- Omitting item-body admission transfers and accepts an oversized body.
- Omitting candidate admission issues metadata SQL where zero is allowed.
- Omitting declaration admission selects an oversized retained body.
- Omitting exact-catalog checks accepts a different runnable version.
- Omitting final head coherence accepts a changed snapshot.

Early focused work found the actual alias-ordering defect above, then an
overstrict expected count of two instead of allowing a boundary touch.
A test fixture initially tried to repair an immutable retained row through
`retain`; it correctly did not replace it, so the fixture now uses the same
direct SQL repair boundary as its corruption. An attempted data-mutation
probe was rejected by the existing validator and is not counted as a valid
substituted platform; the final witness uses another real version. An
out-of-scope test variable and a platform-data typing probe were corrected
before final checks. Exact hashes and the single frozen gate are filed
separately. No mutation sweep or repeated whole suite is used.

G2p-b still owns bounded ordinary-session preparation and the authenticated
small directory reference RPC, exact cohort/asymmetric target checks, fresh
claims and shared completion/pending ownership. Full G2 also owes query
argument binding, visibility policy, cursors, coherent body/envelope output,
and bounded clients. No public caller, broader authority, provider operation,
deployment, full G2/e029, or parent completion is enabled here.
