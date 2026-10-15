# Bounded genesis-root content evidence

G2r is child `f489c779`, promise `9e7b1a53`, under Priority 1 request
`e0292346` and adopted checker decision `76cf7c72`. It follows the landed
G2s signer index. This slice adds bounded genesis-root preparation and a
native byte source. It does not enable an item query or change existing
public summary, history, log, retained, or session admission.

## One exact genesis, shared causal choices

`GenesisProofs` starts at the exact current own genesis fact: full scope
reference, sequence zero, and the genesis hash recorded in bounded scope
metadata. It calls the existing `rootOf`, with budgeted read and own-entry
accessors. `rootOf` gains an optional work callback before each causal step
and uses-array visit. Existing callers omit it and keep their causal rules.
The ordered search is shared, rather than copied into a second walk.

The helper preserves the four-step rule, including a signer found at the
fourth step. Delivery sources, applied-genesis seed causes and ordered intent
search, and same-own-scope earlier outcome/diagnosis causes retain the
existing choices. Old signed-read tests cover those branches. The helper
starts only at genesis; it does not prepare general history roots, register
claims, `Chains.has`, or `Chains.update`.

Internal results separate a verified root, a completed semantic no-root,
and unknown. Missing content, unsupported sources or entry forms, invalid
bindings, exhausted work, and deadline expiry remain unknown. They are not
complete negatives and are never permission to scan broader history.

## Admission precedes body transfer

`ProofBytes` reads scope metadata through a direct-column UTF-8 size check,
capped at 4 KiB before JavaScript transfer or parsing. It validates full
scope reference, active/provisional status, genesis hash, and head shape.
Entry metadata returns only a bounded hash and truthful `octet_length(bytes)`
before any body query. The legacy stored `size` is not an admission proof.
Retained entry copies use the same direct-column byte primitive before
selecting their body. Unsupported SQL or metadata refuses without fallback.
The backend premise is the locally verified Scope SQLite primitive in
[G2a](2026-10-15-item-metadata-seeks.md), not a deployed version measurement.

The internal `proofSource` method accepts one exact fact and finite caller
allowance, clamped to its own 1-MiB hard maximum. It checks current full
reference, position, and stored hash before the body. It returns only
`fact` and canonical `bytes`: no definition label, origin inventory, folded
state, or unrelated history. It uses no `#first`, `sourceOrigin`, native
turn, backfill, driver, or provider operation. Ordinary lifecycle index
initialization and scheduling remain independently owned by G2s.

`namespace().proofs` is a dedicated native capability. Missing support
returns unavailable; it never calls generic `Resolver.read` or `source()`.
Those older interfaces return bodies already materialized and cannot
establish this admission boundary. No HTTP route or generic client method
is added. The namespace binding remains trusted native infrastructure,
unavailable to browser presentation code. The helper asks only for facts
selected by the validated causal walk, not browser-supplied facts.

Every consumer checks strict canonical UTF-8 bytes, actual length, supported
Entry structure, complete reference/sequence, and `entryHash`. A FactUse
also binds the raw retained-content digest; it is different from the fact
hash. Cached dependencies reject a conflicting content request for the
same exact fact. Definition labels are not evidence for either binding.
This is exact native content evidence under the trusted-source premise,
not full replay, room signatures, or a complete closure proof.

An arbitrary malicious adapter can materialize a huge reply before a
receiver rejects it. The before-transfer guarantee therefore belongs to
the trusted native sender and its tests, not post-hoc receiver validation.

## Fixed work and one owned flight

The helper supports these operation limits:

- Four causal steps and at most 16 distinct canonical entry bodies,
  including the own genesis.
- At most 1 MiB of cumulative admitted entry bytes. The next source receives
  the remaining allowance before it can load a body.
- At most 64 lookup attempts, including cache hits, and 512 causal steps
  or uses-array visits. Structural parse, validation, and hashing work is
  separately bounded by the admitted body bytes.
- One absolute 10-second completion deadline, across all sequential reads.

A valid history may exceed these initial supported-operation limits. That
produces unknown, rather than semantic no-root, a skipped dependency, or
an unbounded retry. No uncontrolled fanout occurs.

`ScopeObject` owns one helper instance. Its protected native preparation
method takes a callback that must repeat the exact caller's request,
signature, resource, target, clock, window, and expiry checks. There is no
public query caller in this slice. The helper validates the callback's key
and finite time before I/O and calls it again after awaited work and on
cache hits. A later query must supply those complete checks and independently
revalidate head/cursor/session authority; this callback is not itself a
signed-read verifier. The callback must itself have bounded work; arbitrary
injected callback code is not covered by the helper's I/O deadline.

One pending flight owns one source request at a time. Concurrent callers
share its answer. At deadline, callers finish with unknown, but unresolved
source ownership stays occupied. Repeated callers cannot start another
flight by timing out the first. A late reply cannot continue the walk or
install a cache. The slot releases only when the owned task settles.
No physical cancellation, draining, cross-isolate cleanup, or global source
pool bound is established. The ownership model is one live native ScopeObject;
this is not a deployment-wide concurrency or dormant-object claim.

The cache holds one minimal immutable root/no-root result, keyed by full own
genesis fact and helper/causal-policy version. It returns copies, not mutable
cache references. It retains no whole secret-bearing causal entries after a
settled flight. A changed incarnation or genesis invalidates the cache.
Unknown and partial results are not cached as permanent negatives. Cached
content still needs fresh actor and time eligibility; it is not standing
authority. Unproved public callers must eventually receive the same forbidden
result for unknown and ineligible states, with no progress/head/size detail.

The 1-MiB sum is not peak heap or wire measurement. Native sender and consumer
validation make bounded UTF-8, parse, canonicalization, and hash copies.
Each own source read adds up to 4 KiB of scope metadata and fixed hash/size
metadata. Exact sender checks make a bounded number of those reads. Fact
references have fixed native formats; the response adds only one such fact.
Even a conservative JSON-envelope model is at most six times the admitted
string bytes plus fixed framing, but the native RPC encoding is not measured
here. Attempts, distinct bodies, metadata calls, maps, and copies have fixed
operation limits. Per-caller admission and platform cleanup remain separate
from a global capacity claim.

## Validation

Eleven new focused cases run in the actual isolated Durable Object SQLite
runtime. With the existing signed-read and restart tests, 22 selected cases
pass, and Scope source/test compilers pass. Native founding and commitment
entries supply genuine signed content. The native RPC witness leaves a
parked outside attempt unsent after restart; its outside service and opening
entry use the repository's explicitly labelled stand-ins.

Larger causal chains, padding, and altered metadata are explicitly synthetic
canonical/hash-linked storage fixtures. They prove content, budget, and
control behavior, not judgments or replay of those records. A source stand-in
checks the remaining-byte contract in the cumulative-budget case; separate
native sender cases establish actual admission before body transfer at the
1-MiB boundary, B+1, UTF-8 multi-byte sizes, and forged legacy size. Retained
fact/content bindings, kind/incarnation/hash/position refusal, bounded scope
metadata, unsupported capability, and no generic fallback are covered.

The helper cases cover old-root parity at one, four, and five causes;
complete no-root caching; missing-dependency recovery; conflicting content;
new-incarnation invalidation; mutable returned-cache protection; actor/time
and fresh-request checks; exact versus excessive distinct bodies; repeated
cached uses and bounded search; cumulative bytes; and an injected absolute
deadline with an uncooperative then late source. No test waits ten seconds.

Targeted controls fail by assertions for these boundaries:

- Removing native size admission causes a body query at B+1.
- Passing a full fresh allowance instead of the remainder offers 1,048,576
  bytes where 446,845 are available in that fixture.
- Removing deadline completion leaves the caller observably pending.
- Releasing the occupied slot at timeout starts another proof and returns
  roots where repeated callers must receive unknown.
- Adding `#first` to the proof RPC writes the parked attempt's sent mark.
- Reusing the first request check accepts an ended request from the cache.

All changed source bytes are restored. The read-only control is repeated
only after adding the native per-object helper owner, to bind that final
source. Intermediate compiler errors for a missing type import, an unused
import, and literal widening were corrected before the final focused checks.
Exact hashes and the single frozen gate are filed separately. No whole-suite
or mutation sweep is used.

Full G2 still owes authorized query/session preparation, exact signed query
binding, cursor/head rules, synchronous body/envelope assembly, and bounded
consumers. Existing public reads and general `Chains.update` remain outside
this child. There is no provider probe, deployment, public query activation,
new read authority, end-to-end boundedness claim, or parent completion.
