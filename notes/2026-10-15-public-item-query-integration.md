# Public bounded item queries

Source child `98d3342d`, promise `0930557e`, under priority-one request
`e0292346`. Planner decision `05bf8b66` adopts checker advice `9fc008f8`
and the concrete summary in `d53ba2de`. This is an assembly note in
progress. It is not Source approval or evidence of an enabled route.
The isolated candidate starts at local main `f41ab63c`.

## Current source

- `packages/scope/src/item-query-page.ts:21` already validates the query,
  full scope and cursor, selects bounded metadata, admits every legal
  prefix before selecting bodies, and sizes the whole canonical response.
  It is synchronous and supplies no authority.
- `packages/scope/src/item-candidates.ts:26` admits worst-case metadata
  and seek counts before indexed or primary-key reads. Its result exposes
  actual candidate and metadata counts. The page caller still owes a
  composed operation's SQL and body counters.
- `packages/scope/src/read-preparation.ts:84` captures one bounded native
  frame, applied genesis and supported definition. `PreparedRead.current`
  repeats full currentness and whole support within its original budget.
- `packages/scope/src/session-preparation.ts:53` owns a separate flight
  and returns a boolean. It must supply an operation-bound continuation
  for query composition. Its recorded membership and at-most-one exact
  birth-directory participant remain the only session preparation paths.
- `packages/scope/src/genesis-proof.ts:57` also returns eligibility under
  its own deadline. The query must use its walk under the parent operation
  and charge exact-proof receivers before dispatch. Its existing minimal
  root cache is not a cached genesis body.
- `packages/scope/src/local-signers.ts:126` validates bounded indexed
  evidence and can select one 1 MiB entry. Unknown is distinct from
  negative. No query may fall back to the legacy recent-history walk.
- `packages/scope/src/signed-reads.ts:292` validates the signed resource,
  argument and clock but reads `Store.scope`. Query admission needs pure
  shape/signature/resource checks before protected storage, then the
  same exact checks against the captured frame and a fresh final clock.
- `packages/scope/src/worker.ts:243` parses a URL before route admission.
  `apps/room/fetch.ts:14` parses it even earlier. Both entry layers need
  the common finite URL guard before parsing, decoding or hashing.
- `packages/client/src/http.ts:45` currently uses a generic 4 MiB,
  30-second response allowance. Query responses need their own 256 KiB
  pre-parse bound, strict envelope validation and invocation deadline.
- `apps/room/page/src/data.ts:111` reads whole summaries. Its `itemsOf`
  helper at line 146 combines those with up to 100 final-item pages.
  Bounded query consumers must retain incomplete coverage and cursors;
  they must not silently collect every page or fetch details per row.

Line references name the starting source. Implementation moves them.

## Adopted wire and authority

The route is `GET /v1/scopes/:scope/query-items?q=<canonical-base64url>`.
It admits a sole literal `q`, at most 10,923 encoded characters and 8,192
decoded canonical UTF-8 bytes. The full URL is at most 12 KiB. An explicit
common frontdoor cap must precede all existing outer URL parsers while
preserving existing routes. Query credentials remain in bounded headers.
Aliases, GET bodies, extra parameters, fragments and malformed paths
refuse before protected work. Responses and errors use `no-store`.

Success is exactly the private page's canonical envelope, including full
scope, head, selection digest, exact 86-byte page argument, items and
`complete`/`next`. The complete bytes fit 256 KiB. Deferred oversized-row
refusal is adopted: return the largest legal nonempty prefix; if the next
page cannot fit its first selected row, refuse it without skipping that
row. Errors have a finite query-specific vocabulary, fit 4 KiB, and carry
no success head or cursor. State-specific errors follow scoped authority.

One Scope-owned flight starts before query decode, hashing, authentication
or storage and retains its original 10-second deadline. A second query
refuses immediately. A logical timeout keeps the slot until the real
outstanding task settles; late results do no further storage, authority
work or cache installation. Peer requests carry bounded remaining time,
not another isolate's clock epoch.

After the last peer await, revalidate the entire unchanged native frame
and whole support. Metadata, admitted bodies, exact serialization and the
fresh final scoped authority check then form one synchronous tail. No
storage, support read or await follows that final check. No helper's
boolean eligibility becomes authority for a later operation.

Visibility follows declared state finality. Empty state selections still
need ordinary scoped authority. Empty IDs do not turn selected final
states into live visibility. Sessions retain live→summary, final→items,
mixed→both, with the existing extra summary requirement for native birth.
Signed queries bind their own resource and exact argument at every guard;
they permit live/empty visibility only with recent indexed local evidence
or the exact own-genesis root. Preserve tri-state OR evidence.

## Work reservations

| Signed phase | Calls | Metadata | Other admitted work |
| --- | ---: | ---: | --- |
| Indexed signer | 16 | 64 KiB | One 1 MiB entry |
| Causal evidence, receivers included | 128 | 512 KiB | 16 bodies/1 MiB; 64 attempts; 512 visits; 4 steps; 16 exact RPCs |
| One local preparation | 16 | 64 KiB | 16 candidates; 256 KiB fold; 1 MiB genesis; 256 KiB declaration |
| One page | 200 | 128 KiB | 1,616 candidates; 100 bodies; 256 KiB complete response |

The signed operation's conservative sum is 360 calls, 768 KiB metadata,
18 history body selections and 3 MiB raw history, with declaration,
page and framing allowances kept distinct. Actual own-genesis bytes may
be selected twice; this candidate initially retains that conservative
reservation rather than treating the minimal root cache as body reuse.

Sessions retain at most two preparation participants, each at unchanged
limits, plus one page: 232 calls, 256 KiB metadata, 32 preparation
candidates plus 1,616 page candidates. Payload limits remain per phase.
Counters charge before materialization or peer dispatch and never borrow
from another phase. Reservations are admitted-work bounds; measurements
must label actual cold/warm work separately. These are not heap, copying,
wire, constructor, background-maintenance or physical cancellation bounds.

## Delivery and verification still owed

Implement the ledger, operation-bound preparation/evidence continuation,
native query owner, finite refusal contract, guarded transport and bounded
SDK/CLI/Page consumers. Keep all proposed public contract changes isolated
until complete Source review. Main's public read names, dispatch and
claims remain unchanged while that work is incomplete.

Native composed witnesses must cover syntax/header rejection before
protected reads, local signer and own-genesis roots, unknown index, every
visibility class, exact envelope limits, deferred oversized rows, all
scoped guards, drift and expiry after the last storage phase, conservative
and actual cold/warm counters, exact-proof receiver work, and stalled/late
peers retaining ownership. Consumer witnesses must cover pre-parse bounds,
finite pages/bytes/time, explicit incomplete/refused coverage and bounded
drift restart. Existing cancellation diagnostics remain qualified.

## Intermediate implementation checkpoint

The isolated branch now has an operation-wide phase ledger, admission
hooks for the unchanged G2p allowance, native candidate/page and indexed
signer reads, and a parent-owned genesis walk. Exact native proof senders
accept bounded relative remaining time and cap timed execution at five
SQL reads; callers reserve eight conservative calls and 32 KiB metadata.
The parent-owned path starts no nested timer, joins no existing content
flight and reads or writes no cross-operation root cache.

Session preparation now returns operation-bound data to its owner. Its
existing boolean helper still performs its own full currentness and final
check. Empty selection requires ordinary summary or items permission.
Issued-session read lists have not acquired a query claim.

The native owner is wired into `ScopeObject` on this isolated candidate.
It owns decode, authorization, preparation, evidence and the synchronous
page/final guard. The query resource name and reply types are proposed
here; main's read names, HTTP dispatch and claims remain unchanged.
Common URL admission and exact query wire syntax exist as private helpers
but are not yet wired into the outer entrypoints. Shared URL encoding
reuses the landed canonical query codec.

Focused results so far are separate runs: ten budget/preparation checks;
twelve wire/candidate/native-page checks; seven signer-index checks;
ten existing genesis checks; one new parent-owned stalled-peer check;
six session-preparation/fault checks; five proof-source checks; and two
native query-owner scenarios. The page witness compares the ledger with
actual native SQL calls, candidate metadata, bodies and complete response
bytes. The stalled-peer witness uses an explicit clock and peer gate on
real SQLite with a labelled synthetic causal chain; after logical timeout
the real task retains its slot, a late reply causes no more SQL, and a
later operation reads the proof again. These are not physical cancellation
or deployed behavior claims.

An initial focused launch was denied loopback access before tests ran;
the permitted retry passes. Typechecking found a missing clock-wiring
property and the session authenticator's false refusal representation;
both were corrected. The first native owner test mistakenly queried
offered commitments after its fixture had assigned one into accepted;
the query correctly returned none. The corrected accepted-state witness
passes. No failure is presented as a pass.

This is an intermediate development commit, not a gate-frozen review
head. Complete native composed counters/drift/visibility witnesses,
all frontdoors and bounded SDK/CLI/Page consumers remain owed. No full
gate or public Source approval is claimed. No push or deployment runs here.

## Intermediate transport and consumer checkpoint

The next preparation checkpoint adds the public transport paths on this
isolated branch. It is still not an approved or gate-frozen candidate.
Main has none of these new query routes. The earlier checkpoint inventory
above describes `b07eca20`; the following describes its successor work.

The Scope service and application entrypoints apply raw URL character and
actual UTF-8 bounds before their outer URL parsers. Query routing admits
one literal `q` and bounded authorization, then forwards the encoded bytes
to the object's owner without query decoding or hashing. The HTTP route
returns the owner's exact canonical envelope with `no-store`; query errors
use the finite refusal/status mapping. The service binding keeps encoded
query input and parses the trusted owner's bounded serialized result.

The bytes package now checks reply size before strict parsing, canonical
form, exact members, full scope/head, selection identity, exact argument,
row order/state/type/IDs, the input suffix and the next cursor. HTTP reads
at most 256 KiB before parsing; service-binding allocation remains the
trusted producer's obligation. SDK handles and bindings have a finite
10-second caller wait. `collectItemQuery` defaults to one page and retains
explicit coverage. Explicit collection permits at most four attempts,
1 MiB of conservative full-page reservations, 10 seconds and one drift
restart. Restarts do not reset attempts, reservations or the original
clock. Late completions start no further read. These are logical caller
limits, not physical draining or end-to-end ingress guarantees.

`dap items <scope> --query <canonical-item-query-JSON>` makes one query,
prints the head and selected-suffix completeness, and keeps the next
cursor visible. It discovers no inventory and fetches no per-item detail.
This command does not implement the separate all-command JSON design.

Planner decision `48a7e398` adopts listing-only no-N+1 scope. Page item
selection replaces the old 100-page final-item scan with explicit bounds
of four pages, 1 MiB and 10 seconds at one full scope and head. Incomplete
or refused coverage raises `Unreadable`. Directory listing uses one
bounded lane-index page and its advisory title/state; opening a row reads
its current record. The screen labels this as the directory index.
Retained comment-text requests remain separate, as adopted: neither the
metadata query limit nor this change bounds a whole discussion load to
10 seconds or 1 MiB. Lazy comment bodies remain a later item. Existing
bootstrap/discovery summaries and legacy history consumers are not a new
bounded query contract.

Session preparation now returns a typed permission or availability
refusal to its owner; its older boolean eligibility interface preserves
its behavior. Native witnesses exercise a genuinely enrolled founder's
issued session over HTTP, the service binding, signed SDK and CLI. Other
restricted-claim inputs are explicitly minted policy tests. All URL
frontdoors reject oversized input before URL parsing or namespace lookup.
The native query meter observes actual SQL across caller and trusted
proof/session-reference receiver objects, separates metadata/history/
declaration/fold/body costs, and compares each phase with its reservation.
Both cold and warm owners are checked; receiver construction and unrelated
background work are excluded. Both own-genesis loads are observed when
an incomplete signer index falls back to the exact genesis root.

The complete query continuation is checked with an explicit clock and a
held actual directory reply. Caller timeout retains the pending slot,
refuses another query without further SQL, and discards a late reply
without installing membership authority; a later new operation resolves
the directory again. Scripted changes to real native metadata and support
after the peer wait prevent page reads. Expiry or MAC-secret replacement
after the last page-body SQL prevents releasing the page. The exact
256-KiB full envelope and a one-byte larger refusal also run through the
actual signed query owner; its large native rows are synthetic boundary
inputs, not claimed as judged opening histories.

Focused checks pass for the three native issued/signed transport cases,
three actual-work cases, two full-continuation cases, three URL/frontdoor
cases, two reply-codec cases and three SDK/collection cases. The Page
native story checks one directory query with no per-lane reads; its
malformed-selection adapter now mutates canonical query envelopes as well
as summaries. Seven existing Page boundary cases and the new directory
prefix case pass. Initial fixture failures and changed protocol adapters
were corrected; none is a gate pass.

Two focused controls distinguish removal of the final authority check
and removal of pending ownership, by assertion failures on expired-page
release and a second query's admission. The first call-budget control
survived because its stand-in reached the independent 512-KiB metadata
ceiling at the same 128th call. Isolating the call reservation with zero
metadata makes raising 128 to 129 distinguish by assertion. All controls
restore Source; there is no mutation sweep.

A full typecheck found three hand-built Page fixture values missing the
new directory binding; their explicit null bindings are now supplied.
Package typechecks pass after correction. Rendered QA, the final selected
checks and one full gate at the frozen Source head remain owed. The
Browser plugin and `browser` skill are absent; rendered QA will use the
existing cached Playwright 1.63.0 installation outside the checkout.
No package probe was installed, and no push or deployment ran.

The first gate attempt at `02213cf9f50a3ceba527760b7eec12e22447142e`
(tree `a85c8320ac8992eff69f7bfa3eaeebb13d01fc92`) stopped at whitespace:
the query-wire helper had an extra blank line at EOF, inherited from the
first preparation checkpoint. No typecheck or test stage ran. The line is
removed in the corrected Source head. Browser QA at that earlier head
passes at 1280 × 900 and 390 × 844 with the exact native recorded Page
assets: nonblank, correct identity, no overlay/overflow, no console errors
or warnings, filtering without requests, issue open/back, and a scripted
incomplete directory reply visibly withheld. The first playback fixture
omitted public brand/fonts; adding the packaged static assets fixed the
fixture. No native or deployed authority is inferred from playback.
