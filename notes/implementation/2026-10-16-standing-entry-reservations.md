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

## Corrected gate and bounded Counting completion

The corrected clean Source head is
`7b62ad2da04b11902a0db59cded4fe98afc4fc45`, tree
`aa01dcf21e1308317f487be5004bf4e70f305c48`. Its original gate process
closed with exit 1. Installation was skipped against the matching adopted
lock stamp. Whitespace passed (0.1 seconds elapsed / 0.1 CPU) and
typechecking passed (8.0 / 25.9). The test stage exited 1 (590.4 / 331.4):
all 1,384 Vitest tests passed, three skipped, and all 16 Node checks passed.
The Counting client child stalled; the remaining Counting tests continued
when that single identified child was terminated with SIGTERM. The
Counting runner reports 51 passed plus one failed test-file process. This
is a failed gate, not a whole-gate pass.

A bounded diagnostic runs that exact generated client test file with a
30-second test timeout. All nine cases pass, exit 0, in 588.8 milliseconds.
The original stalled process had waited for more than five minutes with
negligible CPU use and no network socket. No whole suite was rerun. The
51 original Counting passes and nine focused passes cover exactly the
same 55 distinct case names as the successful query gate: none missing or
extra. The intermittent wait remains unexplained; the diagnostic does not
establish its cause.

All four generated Counting test outputs are byte-identical to the
successful query gate's outputs. Their SHA-256 hashes are:

| Generated test | SHA-256 |
|---|---|
| client | `7949b03068d55e2b083c5fa9a26fc4504a5eca49825e7f30cf0ffeace46e5cd5` |
| voice-controller | `9c1c69517cef23d4b379869faa510bb3022163b90a3d755918182f42bb65c49c` |
| app | `bef7b612878b2ccaa9e50cbb65136db9f06c8b2ed4e60b994e004f48570e1f3a` |
| device-key | `148a63bcce4d4c001959e71b5a15df2dda395d67f361b3ab50192eae8b42cad9` |

The wrapper is `/tmp/artroom-c1-7b62ad2d-gate.log`, with private raw stage
directory `tmp.doHzMp05IG`. The focused diagnostic is
`/tmp/artroom-c1-counting-client-diagnostic.log`. Counting's generated
current-output directory is `artroom-counting-node-GoVKGu`; the successful
query comparison is `artroom-counting-node-xg2mVr`. Only closed public test
metadata is offered to review; private raw logs receive no general read
grant.

This reporting-only successor changes this note alone. Source, tests and
generated assets remain byte-identical to `7b62ad2d`. Final review must
assess the failed gate together with this exact bounded completion, rather
than infer a full rerun or erase the stalled test. Local query main
`cf07ac85` contains the approved query and archive notes; C1 differs from
it in exactly its 17 authored paths. Main merge accounting still completes
through the original gitseq process; no repeated merge, push or deployment
is authorized by these test results.

The Counting harness comparison also checks the source graph and driver:
all 58 repository inputs in the current build metafile are byte-identical
to query gate `49941df6`. The root package scripts, lockfile, test driver
and all four owning test entry sources are identical. The driver hash is
`39e478d0a2ef04f1ee9e45f12bf916ebc7f3292f92b65bbd47368dfe4901280a`;
the lock hash is
`647301d0627568fc949dcf2d5277d352b5b855031ab0382f4870f5252f532326`.
Current Node is v26.12.0. Prior process environment was not captured, so
no environment-identity or root-cause claim is made. Public metadata pins
the complete driver/input comparison. Separate request `2f07acf9` asks
planner to sequence the intermittent Counting wait and finite child-timeout
work after NOW; it does not change this C1 implementation.
