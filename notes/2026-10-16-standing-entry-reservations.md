# Standing entry reservations (C1)

Request `e151c7bf`, implementation promise `a5afac64`, follows checker
technical decision `5712ef94` on `eb53f531`. This implements the entry
reservation prerequisite for partition admission. It activates no new
directory version, handoff policy, root pin or hosted counter.

## Declaration and amount

Platform data may state one optional top-level declaration:

```json
{"standing":{"item":"repo","slot":"count","entries":3,"max":2}}
```

The declaration has exactly those four keys. The named item is a singleton
(`many:false`, `max:1`). Its counter is a required mutable integer value
with minimum 0 and the exact declared maximum. Its default is absent or
exactly 0. Safe integers are required; negative zero, fractional values,
unsafe products and products beyond the scope-entry bound are refused.
Declared user definitions cannot state this field. Existing platform data
omit it, retaining their pins and behavior. Adoption requires a separately
reviewed immutable platform version. The mutable counter is not an index.

The existing `owed` ledger adds `entries * (max - count)` before its
closing-checkpoint rule. Absence before opening counts as zero and reserves
the full term. Finality does not release this term; only the counter
reaching max makes it zero. Existing request, result, diagnosis, operation,
capability, holder and closing-checkpoint terms remain in that ledger.
For a C1 definition, invalid arithmetic operands or aggregate overflow fail
closed before the settlement capacity exemption. A valid total above the
entry bound remains ordinary scope-full for new work. Valid owed
settlements keep their existing capacity exemption.

Selection counts each fixed declared state, then pages only its sole
positive state with limit 1. It reads no full inventory or history. Native
SQLite reads at most two item bodies for that page, including the ambiguity
detector, rather than two bodies for every declared state. Invalid counts,
count/page disagreement, ambiguous items and unreadable/invalid counters
fail closed. The metadata carries a deterministic state order.

## Monotonicity and failure boundary

The shared prospective check compares the valid before-counter with the
complete after-item for every entry. It uses the existing item effects
interpreter, mechanically extracted from fold with its public exports
preserved. New singleton openings cannot replace or create a second item;
identity, required counter shape, declared state and global nondecrease
are checked. No entry kind, `settles` flag or caller claim grants an
exception. Written and marked effects use the same check. Judgment checks
the derived effects; fold independently checks recorded effects before
writing. Preparation and checkpoint paths participate as well.

A violation uses the existing unavailable judgment. On delivery that is
`retry` with reason `unavailable`, keeping the request duty. Arithmetic
faults discovered after fold roll back the transaction and use that same
public boundary. A recorded counter decrease raises FoldError without
partially applying it. It is not labelled scope-full for an owed duty.

C1 proves that this standing term cannot grow. It does not prove a genuine
handoff, its unique recipient, or that a +1 matches one admitted child.
The later directory/root policy must enforce those facts and failures.
Capacity work `113a54bd` remains separate; this slice counts entries only.

## Focused evidence

The pure and native fixtures use made-up platform data and explicit grant,
rule, result-source and owner-reservation stand-ins. They are not deployed
platform versions or authority journeys. The judges, prospective item
projection, native turns, fold, SQLite and reservation ledger are real.

Ten new focused cases cover the closed grammar, arithmetic bounds and
negative zero; pre-opening absence including a singleton distinct from
genesis; exact B and B minus one; unrelated new-work refusal; finality;
max and the closing checkpoint; bounded state selection; missing/null,
unsafe and out-of-range counter values; count/page ambiguity; ordinary and
owed marked decreases; diagnosis then late result; bad-record fold and
re-fold rejection; checkpoint-derived counter reconstruction; rollback and
restart. A handoff at B exchanges three standing entries for one accepted
entry plus the request's two settlement entries, keeping used+owed at B.
A delivery-unavailable diagnosis consumes one reserved entry, retaining
the late-result reservation. A later valid result still succeeds after an
invalid marked clause was refused.

The native witness compares entry bytes, accepted intent metadata, items,
counts, request ledger and a nonempty integer index before and after
refusal. It reaches the actual owed result mark at capacity, then accepts
a corrected result after eviction. An invalid owner-reservation operand is
detected after fold and rolls back without a public exception. An injected
null counter makes new work unavailable and writes nothing; its fixture
record is restored. A deliberately inconsistent native count/page reads
exactly two bodies and refuses ambiguity; its injected second row is
removed before continuing. Native B-minus-one genesis writes no entry or
item. Initialization DDL is excluded from selector-read counts.

The six changed neighborhoods pass 75 cases: the ten new C1 cases and 65
existing binding/hold/reservation cases. Derive and scope test typechecks
pass. Initial fixture assertions were corrected for the required declared
rule, the delivery API's recorded/retry responses, and preparation plus
commit both invoking a rule. Those corrections reach the intended
capacity boundary; they do not turn an unsupported fixture into evidence.

Two bounded controls omit the standing amount and permit a counter
decrease. Both fail existing pure/native assertions. A separate selected
owed-marked diagnosis case also fails when decrease is permitted. Each
control restores Source; the standing helper SHA-256 after restoration is
`886d03af8824d99648b8d891ceeefb7c8115621d5336bd137d6bc3f9df031cd7`.
No mutation sweep ran. A frozen gate and final Source review follow the
complete local-main composition and normal asset producers.

No GitHub push, Cloudflare deployment, provider action or export ran.

## Frozen composition

C1 preparation `e8964037` composes the approved archive design on
`c3efd0d9` and public-query candidate `757ec063`, both without conflict.
These are inherited prerequisites, not new C1 implementation claims.
The query's local-main merge is completing normal durable succession
separately. All 75 focused cases pass again after this composition.

The extracted item-effects block is byte-identical to its original in
`f56204f9` after trimming surrounding blank lines; that compared block's
SHA-256 is
`c04e61d18ef46f71c1839de91ca0407c7abb83f44b01032bb2fec5f139945785`.
The normal Page and Counting asset producers run on the composed Source.
Only the Page asset module changes: its JavaScript includes the new
standing declaration validator. Counting output remains unchanged. This
slice makes no rendered-layout or deployed-browser claim.

The first frozen gate at `3f65751e` stopped at whitespace: the new
item-effects file had an extra blank line at EOF. Installation passed
(2.4 seconds elapsed / 3.8 CPU); whitespace exited 2 (0.1 / 0.1), and
neither typechecking nor tests ran. The wrapper is
`/tmp/artroom-c1-3f65751e-gate.log`, with private stage directory
`tmp.QVCRYoupzs`. The successor removes that single blank line and records
this failed gate. The compared trimmed interpreter block, runtime behavior,
tests and generated assets are unchanged. The corrected head gets its own
gate; the stopped run is not a pass.
