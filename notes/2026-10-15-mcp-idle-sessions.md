# MCP session expiry

Request `6bc9a2e0` asks for bounded HTTP sessions and idle expiry.
The existing shared HTTP layer already caps legacy sessions at 16,
ends the oldest after admitting a 17th, bounds capabilities at 16 KiB,
and caps all streams at four. This change preserves those limits.

A legacy HTTP session expires after 30 minutes without recorded client
activity. Before an authenticated legacy request uses or creates a
session, the layer removes expired sessions, closes their streams with
a final event and removes their stored rows. Their IDs answer `404`;
the client must initialize again. Checks are lazy: no timer or Durable
Object alarm runs solely for expiry, so an idle connection can remain
until another legacy request triggers the check. Server notifications
do not renew activity. Origin and bearer checks precede expiry; the
stateless modern revision never renews or expires legacy sessions.

Client activity is durable before the request dispatches. Activity and
Wire's initialization/listing markers share the last committed row and
one write queue per session within the HTTP layer. Final removal waits
behind pending writes; queued updates skip an ended session. This keeps
a late activity write from recreating an expired row and keeps activity
updates from overwriting prospective Wire markers. A failed persistence
does not advance the live activity time. Queue keys are weak references.
This establishes no cross-process storage lock or native act outcome.

The existing hosted JSON row stores the new activity field without a
SQL schema change. Restored rows retain their deadline. A pre-change row
without activity uses its creation time. An already expired old session
must initialize again. Standard-input sessions and custody records do
not acquire an expiry policy.

Two new witnesses use the real shared HTTP layer and Wire, with labelled
stand-ins for scope service and durable row storage. An explicit clock
checks renewal, exact expiry, stream closure, authorization and modern
revision barriers, and restoration of both row formats. A write gate and
the real session-ending callback order a pending activity write against
expiry; no sleep schedules the race. These tests do not demonstrate
provider eviction or native scope judgment.

The two new tests and nine existing loopback HTTP tests pass. Existing
hosted tests of aggregate control accounting and deletion during a
pending listing also pass against real local Durable Object SQLite,
with their existing stand-ins. MCP compiler checks pass.

Two focused controls distinguish required behavior and restore source.
Changing the expiry comparison from `>=` to `>` leaves the exact-deadline
GET at `200` instead of `404`. Removing the write queue from final removal
allows the gated late write to recreate the stored row. Each fails the
corresponding assertion. No mutation sweep has run.

The candidate will run its one gate before review. Its exact head, tree
and terminal result will accompany the final artifact. Dependencies use
the unchanged pinned lock and normal pool preparation. No GitHub push
or Cloudflare deployment runs here.
