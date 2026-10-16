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
