# Bound MCP continuation hints

Root request `0adb22dd` / promise `8e69bb20` is delivered through Source
child `4f37b980` / promise `9379959b`, based on Main `55e1970a5`. This is
the separately tracked nonblocking cache follow-up. Archive exact review
`17dad8da` remains first. Source filing and landing wait for archive's
independent approval/landing, exact Main correspondence and normal review.

## Behavior

The two process-local caches each retain at most sixty-four recent hints.
A lookup makes a key recent; insertion evicts the oldest key at the bound.
The internal helper has no package export, configurable capacity or public
diagnostic interface. It retains entry positions or page cursors, never
tool answers, credentials or authority. This is an entry-count bound, not
a measured bound on process heap. Eviction can cause repeated bounded
reads; it provides no guarantee that cold progress survives heavy churn.

Entry searches bind to the service and the immutable opening entry's full
scope, position and hash. A later append therefore preserves progress.
Final-page hints bind to the service, full scope, observed head and query,
including the requested item and states. A different query or head starts
at the first page. If the head moves between summary and final-item reads,
the poll returns no item and a later poll reads again. It cannot report a
page's item under another read's head.

The existing sixteen-entry and four-page per-poll bounds, wait/credential
answer categories, authority checks, custody and one-time credential
behavior are unchanged. Recovery wording explains that eviction restarts
the bounded search. No tool schema, native declaration, version, default,
public export, manifest, lock or hosted output changes.

## Focused evidence

The first two-case focus (`25140`, exit 1) was started before the offline
install (`13279`, exit 0) returned. It is retained as a preliminary attempt,
not the stable original defect witness. The prescribed pool compatibility
step then ran (`2d42ee`, exit 0): it reported `copied:false`, before hash
`8d3d115037c749cce1e8cb26bc70ba08e215aaaa357e4eae9f0c1577277c5855`
and after hash
`cd50d18adce92adb54a3f00410d646b2fe09b3f12c5b833c492bcf5857621b39`.
It was not an unchanged dependency-view claim.

With dependency setup complete, stable original focus `17762` exited 1
with two assertion failures and seventeen unselected cases. After another
query had advanced the shared cursor, waiting for a first-page item timed
out instead of returning that item. After the head advanced, the service
sent the old cursor `8` instead of a first-page request. A separate original
case (`8d7142`, exit 1, one assertion failure) changed the head between the
summary and item read: the old service returned an item labelled with the
earlier head instead of waiting for a consistent observation.

These are actual MCP service calls over the existing labelled in-memory
HTTP stand-in. Native judgment, SQLite and provider behavior are not
proved. The stand-in's cursor is an offset; the head-boundary witness
observes the actual outgoing cursor, without pretending that this fixture
implements Native cursor validation.

The repaired public-call cases passed. The first combined focus (`77400`,
exit 1) also exposed an incorrect final expectation in the new pure cache
test: after its lookups, key4 was oldest and correctly evicted. Correcting
that expectation and making the expected capacity an independent literal
sixty-four produced five passes (`7f5797`, exit 0).

Two focused controls passed and restored the helper. Removing eviction
(`e06303`, exit 0) changed the required oldest-key refusal to a retained
value: baseline one pass, mutant one assertion failure. Removing lookup
refresh (`c7c832`, exit 0) failed the recently-used-key assertion in the
same way; the wrapper verified exact source SHA256 restoration
`2fa513de33f6f79238c57ef48331b8cd7ea2db83f239b75f43eaeddc6c2a8c41`.
No mutation sweep or whole suite was run for these controls.

Final MCP source/test/Scope-test typechecks passed (`05dc53`, exit 0).
The complete affected budget/cache focus (`94929`, exit 0, owner terminal
`77afad`) passed twenty cases with one existing skip. It preserves the
long-history and one-time credential witnesses; the long search now also
advances the native-looking head between calls and still avoids repeated
search entries. The same-head query, fresh-head request and mid-read head
change cases pass. The owned Page producer (`cdcd76`, exit 0) ran and its
tracked asset module remained byte-for-byte equal to Main.

Original owner logs use `/tmp/artroom-mcp-cache-bound-` followed by
`install.log`, `pool-compat.log`, `original-pages.log`,
`stable-original-pages.log`, `original-mixed-head.log`, `types.log`,
`repaired-focus.log`, `corrected-focus.log`, `eviction-control.log`,
`recency-control.log`, `complete-affected-focus.log`, `final-types.log`,
`final-affected-focus.log` and `owned-page-assets.log`.

These references grant no external-file, helper or execution access. One
frozen final composition gate is still required before exact Source review.
No Source approval, landing, provider operation, deployment, publication
or dependency addition is claimed.
