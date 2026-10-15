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
