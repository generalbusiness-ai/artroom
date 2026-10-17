# Capacity guarantees: preparation

Request `113a54bd`, promise `0dc3ead9`; preparation Source `fa0583d5`,
promise `3e32b45b`. This note maps Main
`698a3d71337a6a03bdea0dfdac10043dd5cbf011`. It changes no runtime,
definition, bound, refusal, storage schema, or replay rule.

Entries have admission accounting. Bytes, items, records, and pending
requests do not yet have matching whole-scope admission guarantees.
Existing five-dimensional reservation amounts are partial inputs to that
work. They must be extended, not replaced with a second calculator.

## Adopted accounting rules

Planner decision `78b6d12993d5d390618f7d5d0207bd7659b52856`
adopted contract revision 23 at
`3b3e394fc6807c33211ac80db813621253c38f5c`. Section 17.1 already fixes
the units: items include live and retained final states; records are
capability records and relationship copies in every state; bytes are
canonical entries plus named retained inputs, once per byte-domain/digest.
Redacted bytes leave Used from the redaction entry onward. Derived
indexes, folded state, and outbox bookkeeping are outside these dimensions.
Requests remain pending until a recorded result or `undelivered`
diagnosis; transport acknowledgment does not settle them.

Section 17.3 already requires `scope-full` to name the exceeded dimension.
These are adopted semantics, not fresh design choices. Historical
coordination `f45f1111` distinguishes them from runtime/configuration,
diagnostic, finite producer-maximum, and incomplete historical-byte
reporting decisions. The exact section and that coordination act were
read for this correction; no stale historical support is used as a new
Source freshness basis.

## Current counting and commit points

Line numbers refer to the Main above.

| Dimension | Existing source | What it establishes; what is missing |
|---|---|---|
| Entries | `packages/contract/src/bounds.ts:63`; `packages/derive/src/reserve.ts:101`, `:174` | `scopeEntries` is the only whole-scope capacity bound. `owed` counts pending entry duties; `fits` compares written plus reserved entries after the fold. |
| Bytes | `packages/scope/src/turn.ts:366`; `packages/scope/src/sqlite.ts:173`, `:176`, `:179`, `:412`, `:421` | Each canonical entry has a UTF-8 size and an `entryBytes` limit. Entry storage and retained inputs have separate write points. `scopeBytes()` measures the serialized scope metadata row; it is **not** whole-scope storage. `storedTotalBytes()` sums entry bodies only. No complete byte account or scope byte ceiling exists. |
| Items | `packages/scope/src/sqlite.ts:80`, `:187`, `:339`, `:346` | Items have one row per ID and counts by type/state. An update to an existing ID is not an opening. These reads support existing type/state duties; they are not a new whole-scope item ceiling. |
| Records | `packages/scope/src/sqlite.ts:90`, `:96`, `:348`, `:384` | Relationship copies and capability records have distinct keys and write paths. Replacing a key is not creating another record. There is no complete scope-wide record count/bound. Do not equate the single SQL table named `record` with the whole contract dimension. |
| Pending requests | `packages/scope/src/sqlite.ts:260`, `:352` | `outstanding()` distinguishes requests without diagnosis, delivery-unavailable diagnoses, and remaining operation outcomes. `putRequest()` persists result/diagnosis changes. Its projections currently feed entry reservations, not a pending-request ceiling. |

`Turn.#seal` (`packages/scope/src/turn.ts:356`) appends the entry, retains
inputs, applies the fold, and removes redacted texts. The admission check
at `:335` runs after that fold inside the commit transaction. A failed
`fits` throws `Full`, so the transaction keeps none of those writes.
`Store.transaction` promises this rollback (`packages/scope/src/store.ts:63`);
SQLite delegates it to its transactional port (`sqlite.ts:139`). Extend
this same commit boundary for all dimensions.

Replay derives the entry again, applies the fold, and calls the same
`fits` (`packages/replay/src/verify.ts:1500`). Runtime-only counters would
not by themselves preserve that correspondence.

## What admitted work must reserve

`Amount` already names entries, items, records, bytes, and requests
(`packages/derive/src/held.ts:40`). Distinct tasks sum; alternatives use a
componentwise maximum. Keep those operations and the existing holder,
marker, state/copy, and outcome traversals.

| Work admitted now | Reservation needed before ordinary traffic can use the room |
|---|---|
| Provisional scope and final checkpoint | The confirmation and closing entry, plus their complete byte/record effects. Preserve checkpoint rearming. |
| Timed state transition | Its longest finite chain, every declared opening/request, and retained bytes/records required by the chain. |
| State, relationship-copy, or marker settlement | The complete settling closure, including first openings, first copy keys, downstream duties, and each still-pending marker. Updating an existing subject adds no new unit for that subject. |
| Outgoing request | Diagnosis and possible late result, the foreign source bytes the result may retain, its result clause, and the pending-request unit while the duty remains open. Preserve the distinction between unavailable and terminal diagnoses. |
| Outside operation | Every remaining first/late outcome permitted by its attempts, outcome closure, retained evidence, and requests started by those outcomes. Count a `once` send once. |
| Holder and capability-owned work | Remaining held operations/requests/items, their complete closure, and capability records. Do not release a final holder merely because its visible item is final. |

The current entry walk is `reserve.ts:101–153`; holder projection starts
at `:88`. `validate/capacity.ts:23` retains known declared task amounts;
`:54` uses `entryBytes` as the static entry-size stand-in; `:57` includes
declared item openings and possible first relationship copies. `held.ts`
explicitly says other item/record/retention terms remain partial. The
previous S1–S3 delivery notes record those limits; this preparation does
not turn their partial amounts into a guarantee.

## Refusals and decisions before implementation

The existing capacity refusal is `scope-full`
(`packages/contract/src/result.ts:16`). Act/creation paths map `full` to
that refusal (`packages/scope/src/core.ts:511`, `:633`, `:722`); delivery
returns `retry/scope-full` (`packages/scope/src/delivery.ts:277`).
`entry-too-large`, `type-full`, and `slot-full` already describe different
per-entry/type/slot bounds. They must retain those meanings.

The current `full(head)` callback carries no dimension (`turn.ts:73`).
The answer type's `name` comment describes a declared guard reason.
Implementation must carry the adopted dimension diagnostic through the
callback and public readers, with an exact typed runtime/API convention.
That integration is the remaining question; neither `scope-full` nor its
requirement to name the dimension needs adoption again. Do not invent
four new public reason codes.

The first implementation slice needs three explicit decisions:

1. Apply the adopted units at every first-key, replacement, retention,
   deduplication, and redaction point. Specify the incomplete/trusted
   historical replay report when earlier erased text sizes are unavailable;
   missing historical bytes are not permission to count zero before their
   redaction. Keep finite producer maxima explicit. Physical SQLite cost
   remains a separate measurement.
2. State the four configurable ceilings and their adoption status. There
   are no existing defaults for them in `Bounds`; this note supplies no
   measured or arbitrary replacement values.
3. Pin the immutable opt-in/version boundary that leaves old scopes and
   old replay unchanged. Current validation rejects unknown definition
   fields (`packages/derive/src/validate/index.ts:157`). Changing current
   admission or replay globally would not satisfy the legacy condition.

## Proposed slices and witnesses

1. Resolve the remaining runtime/configuration/reporting and legacy
   choices against the adopted units. Extend existing `Amount` accounting through complete declared and
   owner-supplied closures. Check safe arithmetic and invalid operands;
   missing producer maxima must refuse, not count as zero.
2. Add used counts at the existing fold/retain commit points, with the
   same deterministic logical units in memory and SQLite. Verify first
   insert, replacement, duplicate retention, redaction, and rollback.
3. Extend the shared post-fold admission check one reviewed dimension at
   a time. Each witness must admit exactly at the limit and refuse the
   next unit by the agreed name. Fill ordinary room while a task owns a
   reservation, then complete its settlement without weakening any bound.
4. Verify runtime/replay agreement, restart reconstruction, old cohorts,
   late results, retained evidence, and closing/rearmed checkpoints.
   Run focused tests while changing each slice and one gate at its final
   implementation freeze before exact-head review.

This is a preparation-only Source slice. No test or gate was run for this
document; source and tests are unchanged. All four implementation
guarantees, measurements, boundary witnesses, exact reviews, and the full
`113a54bd` request remain owed. Judge/P3 preparation and archive work are
preserved; no deployment or publication is authorized by this note.

Review `94438c26` requested this correction at initial `7007a46b`.
It found the current-source map and proposed witnesses accurate, with no
other finding. This successor changes only this note and preserves all
1,452 Main leaves. The full capacity guarantees remain owed.
