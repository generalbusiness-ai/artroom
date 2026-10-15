# Private bounded item page execution

G2q-b is child `a802cb43`, promise `e558f158`, under Priority 1 request
`e0292346` and decision `69a33abc`. It follows landed G2q-a at `1d2572d8`.
This private module enables no HTTP route, public read name, session claim
or client transport. It accepts a supported prepared frame and an exact
query only after the caller authorizes that query.

The caller owns the operation deadline, revalidates the frame before this
synchronous call and repeats fresh final authentication before releasing
its returned bytes. A successful preparation or boolean eligibility check
does not authorize a later unbound page. This module supplies neither
session nor signed bootstrap authority and cannot replace those duties.

The executor admits the query through the G2q-a codec, checks its full scope
and cursor against the frame's head, then checks the pinned declaration's
own type and state names. These semantic results are private until the
caller has authorized them. An inactive or unsupported frame refuses.

G2a performs the same indexed metadata seeks: at most 16 states, 100 sparse
IDs, 1,616 metadata candidates and 128 KiB of metadata. A requested row
limit stays between one and 100. Empty IDs or states select nothing. The
metadata contains IDs and direct-column `octet_length(record)`, not record
bodies. A missing size primitive or index refuses without a body fallback.

The private response uses the existing Read shape:

```text
{ok:true, at:head,
 value:{v:1, scope:fullScopeRef, query:selectionDigest,
        argument:exactPageArgument, items:[...]},
 complete:boolean, next?:opaqueCursor}
```

The argument echoes the exact query, including its input cursor or explicit
null. The selection digest excludes that cursor, as G2q-a specifies. Scope,
head, argument, next cursor, every field and the item commas count toward
the 256 KiB actual serialized UTF-8 response limit.

Before selecting any body, the executor checks each of at most 100 finite
prefixes using exact metadata bytes and its actual empty-items envelope.
A complete final prefix omits the cursor. It can fit even when a preceding
incomplete prefix does not, so the first failed prefix does not stop this
calculation. Unsafe sums or item bytes already above the total cap cannot
fit any later prefix. The largest fitting nonempty prefix is admitted.
Only those exact primary-key bodies are then loaded, each with the same
native byte-size predicate. Strict parsing, canonical bytes, item shape,
ID, type and selected state must agree. Final serialization must equal the
admitted byte count and remain within the cap. Nothing is truncated.

The current private byte-stop policy returns a fitting nonempty prefix
without claiming that later rows can fit. A later request explicitly
refuses `row-too-large` if its first matching row fits no legal page. It
does not skip that row, return an empty repeating cursor or silently
declare completion. Question `6e6d8290` asks the planner to adopt this policy
and the exact envelope before public integration. The proposed POST method
and bounded body admission are also unresolved there. This Source slice
does not claim that either public choice has been adopted. `complete`
means the selected suffix is exhausted at this one head, not a whole
inventory or verified earlier prefix.

Six focused workerd cases exercise real Durable Object SQLite and native
supported preparation. The population records and large values are
explicitly synthetic storage fixtures. The made-up lane uses its existing
labelled test authority, not genuine public signed/session admission.
One continuation test reads a genuinely opened and assigned commitment;
an actual checkpoint between requests changes the head and makes its old
cursor stale before any item SQL. That checkpoint's whole-state work is
explicit competing test activity, not a bounded query dependency.

The three-state native traversal returns 100, 100 and three rows with no
duplicate or omitted ID beside 3,000 unrelated rows. Passive counters report
306, 206 and nine rows read, zero writes, 203, 103 and three candidates,
and 100, 100 and three admitted body reads. All query plans are indexed
state or integer-primary-key searches, with no scan or temporary sort.
Sparse four-ID selection uses four metadata seeks and three body seeks,
at most seven rows read. Empty selections and semantic refusals use no
item SQL. Preparation SQL is outside these executor-only counters.

Other cases cover actual multibyte byte stops, later explicit oversized-row
refusal, a response exactly at 256 KiB, a one-byte-over singleton with zero
body reads, cursor removal making a final prefix fit, malformed or
mismatched storage records, an unsupported-primitive stand-in and an
external active predicate expiring before bodies. These do not prove a
physical timer, cancellation, RPC draining, deployed latency or heap bound.

Three selected guard controls fail by assertions and restore exact source:
omitting response framing selects an oversized body; stopping at the first
failed prefix rejects a fitting complete page; omitting selected-state
matching returns an unrequested final-state row. The first two preliminary
controls stopped in the test's convenience reader with a refusal error.
Those runs are retained but are not credited as assertion controls. The
boundary assertions were made explicit and reordered to observe body
admission first; their two final controls then failed at those assertions.
The row-state witness and guarded source did not change. No sweep ran.

Focused native cases and Scope source/test types pass. The one final gate
is recorded in the finite review evidence. Public operation ownership,
fresh authority, signed/session visibility, exact request admission,
transport and bounded consumers remain owed. Hugh's Cloudflare deployment
hold remains in force. This slice runs no provider operation and closes
neither full G2 nor the parent request.
