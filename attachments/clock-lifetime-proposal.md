# Controlled old/new fixture clock lifetime — proposal only

The filed 109-line plan and its SHA36f9 copy remain unchanged. No execution,
source patch, timeout change or private probe is authorized by this addendum.

One dedicated native boundary witness can test the supported interference
mechanism without an arbitrary predecessor or waiting for a real timeout.
It models an old fixture's release after timeout; it does not claim to
reproduce the actual 676 timeout or identify its writer.

Use the existing public test Gate (scope/src/testing.ts:173–194: hold, held,
pass, release), with deterministic releases and no sleep. Keep one test's
original 5,000 ms deadline. Two gates bracket only the old continuation's
existing shared-clock assignment and its finally restoration; they do not
intercept private workerd state or patch AbortController.

1. Capture the old fixture's clock value as Site does at line19. Start its
   controlled continuation and hold it before the +1800-second assignment.
   Confirm the existing Gate has held it; do not use timers.
2. Mark that fixture lifetime released in test memory, then create the new
   graph/change and perform T5b's actual initial rules delivery. Sign its
   offer through the unchanged declared handle, retaining that exact envelope.
   Capture numeric signing now/notAfter and the state already read for
   expected revisions. No signing key, field body or scope ID is logged.
3. Release the old continuation to execute the same +1800 shared-clock
   assignment as Site line91. Its second gate prevents the old finally from
   restoring the clock before the new offer is submitted. Submit the exact
   new signed offer once; assert the native expired refusal at its retained
   current head, comparing numeric raw clock, retained floor and notAfter.
4. Release the old finally and await that owned continuation so nothing is
   deliberately stranded. Restore only the fixture-owned settings, under
   an explicitly reviewed ownership condition. No global drain or eviction.

This is a deterministic mechanism witness, not an unchanged full Site or
T5b workflow and not evidence that a timeout actually continued in 676. The
release marker is a model of the lifecycle boundary. Its value is separating
scripted clock interference from wall cost: old write crossing the new
frozen deadline is sufficient for the native refusal even in a short run.

Do not add a reset/replacement of net.clock or infer ownership from equal
clock values. Native DOs hold the same object and may retain later floors.
The pre-execution patch must expose every write/restoration, release path,
exact-one discovery, and numeric evidence outlet. If preserving old/new
ownership cannot be done without affecting retained DO clocks, report the
blocker rather than apply a rollback. A proposed released-owner guard would
need a separate native/control repair decision; this witness does not adopt it.

Use assertions as the primary evidence, with a reviewed runner-owned numeric
attachment if supported. Do not rely on console forwarding after the previous
zero-marker run. Any observer must return original promises/errors and bind
late callbacks to their original run. No forced timeout, expected-failure
Vitest trick, extended deadline, warm cohort, provider run or whole gate.
