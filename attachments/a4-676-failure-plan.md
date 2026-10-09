# A4: exact 676 failure assessment — source only

No test, runtime probe, source edit, timeout change or gate was performed.
Baseline: 676f23d1794cb2fa4d7c52b5287933a808dcf653, tree
cbc5660678f7ea3087d2044bd820b52aacc7324a. Reads below use immutable Git bodies,
not the older manifest-composed checkout. The complete small gate evidence
and 6,109-byte raw test log were read.

The gate reports four failures: Links T5b's offer is refused expired at judged
seq 2; Manifest T3, Page task data and native Site @3 time out at 5 seconds.
The cross-DO RefcountedCanceler stack reaches Vitest abortIfTimeout. Neither
that stack nor completion-order output identifies the causal test or writer.
Test phase wall 408.6 seconds / CPU 451.7 seconds is retained, not explained.

## Concrete clock and lifecycle facts

* links.scope.test.ts:49–55 creates fresh G/H/C, delivers scripted rules, then
  signs/submits the first offer. Its only g.later(1) is at line 103, well after
  the failed offer. It does not advance time between signing that offer and
  submission itself.
* support/graph.ts:272–288 fills expected revisions from existing native
  history, then passes explicit timeMs(net.clock.now) to the declared client.
  client/declared.ts:166–171 forwards Signing; client/intent.ts:74–98 defaults
  its lifetime to 300 seconds and freezes notAfter before awaiting signature.
  The offer therefore does not use Date.now or the 60-second lifetime of the
  graph's separate handwritten instance/raw preparation helpers.
* scope/src/testing.ts:160–165 ScriptedClock.read consumes a queued script
  value, otherwise now. It does not advance with wall time. A 1.336-second
  offer scenario cannot expire this 300-second intent by wall cost alone.
  The namespace uses one shared ScriptedClock object (testing.ts:262–303;
  netPorts returns n.clock at 328; PlatformScope wiring uses net.clock at 117).
* derive/time.ts:24–29 clamps raw time to the retained scope.time floor.
  judge.ts:224 refuses when that asOf is at least notAfter. Thus a forward
  shared-clock jump after signing OR a rewind below a future retained floor
  can explain expiry; bare slow execution cannot do so on the scripted clock.
* site-native3-publication.test.ts:19 captures oldClock; line 91 advances the
  shared now by 1,800 seconds. Its finally at 98–101 unconditionally writes
  oldClock back and clears shared settings. It has no released guard or
  onTestFinished cleanup. A timeout does not cancel the underlying JS/RPC
  continuation. Its later clock advance or late unconditional restoration can
  interfere with a newer test. No actual ordering/overlap is recorded here.
* graph.ts:408–410 moves the same clock; T3 deliberately advances it by only
  1+2+4 seconds at manifest.scope.test.ts:126. graph's finish hook at 482–488
  settles then clears global controls; it neither restores nor owns the clock.
  This is an unowned lifecycle boundary, but is not proof of the expired offer.
* task-data.scope.test.ts:83 onward does not advance the clock. It uses demo;
  demo's owner/released checks restore only owned transport/provider settings
  and guard setup progress (demo.ts:61–100). They do not own/restore time.
* Only one exact net.clock.script.push was found in the 676 tree, in
  compose.test.ts:171. It queues current/current/2098, not a future value.
  Its actual remaining queue at T5b is unknown. No queued-future cause is
  inferred from this source search.

## What remains unknown, and no static fix claim

The gate records neither the offer's sampled signing time/notAfter, the raw
judge reading, the retained seq-2 time floor, nor the clock writer chronology.
It does not establish that Site ran before Links or continued after timeout.
A timeout may expose a late shared-control writer; it does not prove one.
The three timeouts may separately reflect completed native cost, pending work
or fixture interference. Prior fast cold/warm runs without emitted metadata
cannot distinguish these explanations.

Do not simply restore time earlier, replace the shared clock, increase intent
or test lifetime, drop cleanup, or force clock monotonicity. Old DOs hold the
same clock reference and retain their own history floors. A reset/replacement
can create a client/server split or violate a deliberate rollback witness.
No ownership-safe static repair is proved from this evidence alone. If a late
Site writer is measured, a narrowly owned/released fixture fence must suppress
that writer and its unowned cleanup; its treatment of earlier live DOs and
history floors needs an explicit design and native witness before adoption.

## Smallest discriminating proposal — not execution authority

Prefer ONE exact T5b workflow, with its unchanged calls/assertions/finally,
5-second deadline and real graph fixture. At its existing signed-offer boundary
record only numeric/allowlisted metadata: signing sample, notAfter, existing
cached scope-history seq/time (from the state already read to form expected),
raw clock now before submit and on receipt of the refusal, and returned
judgedAt.seq. Emit no key, signature, field text, scope ID or error payload.
Observe each existing ScriptedClock.read once, returning its exact original
value, in test-only code; capture numeric original-run state so a late callback
cannot contaminate a newer run. Do not add a clock read, wait, timer or drain.

A refusal with sampled now+300s below the existing seq-2 history floor proves
a rewind/floor mismatch. A raw judge reading crossing notAfter after signing
proves a forward jump. Matching clock/deadline/floor below expiry would instead
require checking the actual signed request/boundary, not a polling fix.
Timestamp rows alone do not identify the writer: explicit passive numeric
markers at the Site's existing +1800/finally assignments may label that writer
only if those assignments actually execute in the approved measurement.

An isolated T5b may be fast and never see another writer. That is a qualified
negative, not a warrant for arbitrary predecessors or another whole gate.
If the owner chooses a causal two-file contrast, the only justified companion
is the existing native Site @3 workflow, explicitly ordered Site → T5b in the
same worker, both original 5-second tests, exact-two discovery/bail1 and no
forced timeout or eviction. This is a separate owner choice, not both probes
or an authorized retry. A Site completion before T5b does not reproduce a
late continuation; a timeout must preserve the original task and normal
cleanup semantics while measuring only safe metadata. CPU/wall and exact
selected/skipped counts must be recorded. No 73-file pressure inference.

The previous three-stage run emitted no A4 markers. Before any future run,
source-level capture must be reviewable and the evidence outlet must avoid
relying solely on unproven console forwarding. A safe numeric assertion or
runner-owned metadata report is a prerequisite; if the pool cannot expose it
without altering native lifetime, report that blocker. No private probes or
extra head reads to circumvent it. Await planner disposition.
