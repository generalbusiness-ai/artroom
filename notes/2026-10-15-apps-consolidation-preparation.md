# Application consolidation: preparation checkpoint

Request `38064e13`, promise `5c6c1cbb`. This branch preserves Main
`0157307b904c9afc75500b626fc565a152113cfa` and the earlier composition.
Priority 1 durability and Git capacity work preempts its final validation.
This checkpoint is not a delivery or a request for Source approval.

Room owns its lanes, browser page, static assets, application dispatch and
Worker configuration under `apps/room`. Counter source and its served assets
live under `apps/counter`. Jam's recorded source, landing page and managed
asset recipe live under `apps/jam`. Worker names and served URLs stay the same.
No deployment ran.

The public `dap-platform` SDK stays in `packages/platform`, with the exact
current Main bytes. The reusable Scope Worker serves Scope, Site and MCP.
The application Worker adds the pages and demo offer. ScopeObject retains
its read-only founding projection, so framework modules import no app code.

Focused checks completed on this preparation:

- Scope test typecheck passed.
- Eight active-source checks passed, including the framework import boundary.
- The Home page, Jam managed assets and SDK module checks passed in the
  original static run. That run also exposed the relocated checker-test path
  assertion, which was corrected before the eight active-source checks passed.
- Demo founding and hosted MCP passed: twelve tests in the original route run.
  The added generic-page assertion initially expected the wrong error shape.
  The corrected Page route test passed separately.

No full gate ran. Remaining work includes checking all moved configurations,
links, capture records and application ownership, then one gate at the final
candidate and one complete exact-head checker review. Historical captures
must keep their original provenance. This checkpoint does not claim browser
playback, a new Jam build, hosted acceptance or completion of the parent task.

The later checkpoint preserves Main `1d2572d8`, including bounded session
preparation, query codecs and the planner's hosted-agent design note. The
relocated Room fixture now imports the public platform destination at its
correct path. All affected workspace and supplementary root types passed;
five native Room wiring cases, three focused application route cases and
12 static source, framework-boundary, Home, Jam and SDK checks passed.
The documentation audit found 455 relative links and no broken target.
The normal local Page and Counter builds ran; their two exact generated
asset comparison cases passed. An initial extra Counter test filter named
a nonexistent path and selected only the Page case; the real Counter case
was then selected explicitly. Historical capture records remain unchanged.

Room's new source overview and Counter's README state the existing shared
Worker owner. Counter has no independent Worker today; the preserved
configuration is under `apps/room`. The planner has been asked to confirm
that this explicit shared owner meets the per-app configuration condition,
or to identify the desired Counter-local shared deployment entry point.
No duplicate or unused Wrangler configuration was added. Jam's recorded
managed-assets configuration remains app-local. No final gate or complete
Source review has run for this branch. Priority 1 work still preempts it,
and Hugh's no-Cloudflare-deployment hold remains in force.
