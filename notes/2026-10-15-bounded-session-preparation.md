# Bounded session and directory reference preparation

G2p-b is child `5c1b229d`, promise `6eb7e370`, under Priority 1 request
`e0292346`. It implements the session prerequisite of decision `eae69004`
and the adopted two-participant refinement `3c020a1d`, including all eight
parts of checker recommendation `039c5ab1`. G2p-a is landed at `3f1c9b2f`.
This child adds internal support. It changes no public query, legacy read
admission, session issuance, grant authority, provider setting or deployment.

## One operation, at most two participants

`SessionPreparation` belongs to the live ScopeObject. One operation gets
one G2p-a budget for its local frame. An unresolved rules or destination
birth may use one exact native directory participant, which gets one
independent G2p-a budget. Neither can borrow, refill, recapture with a new
allowance, retry automatically, or discover another peer. A local-only
operation has no directory participant.

Each participant retains the existing hard maxima: 16 conservative calls,
16 metadata candidates, 256 KiB cumulative item/fold body bytes, 64 KiB
metadata reservations, one 1-MiB exact genesis reservation, and 256 KiB
admitted declared content. Calls include the charged pure support/policy
and cached-scope/page work, not just SQL. Lookahead, failed work and final
revalidation keep their charges. The caller also reserves its one RPC and
10 KiB of request/reply framing against its local allowance.

The two-participant preparation maxima are therefore 32 calls, 32 candidates,
512 KiB item/fold bodies, 128 KiB metadata, 2 MiB genesis and 512 KiB declared
content. Fixed session MAC/form/codec work and one request of at most 8 KiB
and reply of at most 2 KiB are separately admitted. A participant failure
ends the operation; unused capacity in the other participant cannot repair it.

`PreparationFlights` starts the absolute ten-second caller deadline before
request validation, authentication or storage. It includes queue/peer wait,
final metadata/support and fresh authority. It admits one outstanding task
per live owner and queues no waiters. Timeout completes the caller as private
unavailable but retains the slot until the original task settles. A late
reply cannot advance local storage, install authority or release a replacement
operation early. A subsequent retry after settlement is a distinct operation.
This is completion and ownership, not physical RPC cancellation or draining.

The native receiver also clamps a relative remaining duration within its own
ten-second maximum, measured from the start of its bounded request decode.
No shared clock epoch is assumed. A supplied large number cannot extend either
hard limit. The caller retains its original absolute deadline regardless of
receiver timing.

G2p-a's budget now accepts an optional active-operation predicate. Default
callers keep their previous behavior. Every spend checks it; `available`
latches expiry too. This stops further admitted phases and prevents a raw
declaration cache installation after synchronous validation overran the
operation, even before a timer callback could run. Resetting a test clock
cannot revive that budget.

## Native policy on a coherent frame

The caller authenticates the existing bounded session MAC, canonical claim
form and deployment, and checks the requested live/final/mixed claim before
storage. It derives membership with the existing `recordedMembership` and
exact native version callbacks. A membership scope binds itself. Other
scopes require their recorded full reference, or the existing unresolved
rules/destination birth policy; a partial ID alone grants nothing.

The native birth function is shared with legacy preparation. Its optional
already-derived membership argument avoids repeating that same callback in
the new frame; existing callers retain their old behavior. Birth still
requires the applied own genesis, seed kind/creator, source at directory
sequence zero, create request, locally held directory and exact supported
`SIBLINGS_OF` child pin. Claims and replies cannot choose the peer.

A frame-local facade reuses successful immutable pages only for the exact
current native argument tuples: branch empty/ready, rules current, and
repository open, all at null/one. Its three possible keys are owned by that
one full frozen snapshot. Cache hits spend a conservative call. It freezes
admitted page data, crosses no head or operation, exposes no unsupported
method, and stores no claims, roles or standing. Incarnation proof remains
G2p-a's bounded zero/one/ambiguity seek; ambiguity stops this path.

After the one await, the caller checks the strict witness's full directory
identity, exact allowed cohort and full membership against its own recorded
binding and the authenticated token. Rules additionally require the exact
confirmed rules ScopeRef. Destination intentionally has no corresponding
destination-target equality requirement. The witness does not include an
unused destination reference.

The final `current()` rereads the full scope snapshot and current whole
support/policy. An unchanged head/incarnation/genesis/status/time justifies
reuse of the operation's native birth descriptor. Drift fails; it does not
restart preparation. Only then does the caller repeat MAC/deployment,
membership, local clock/expiry and read claims, with a final deadline check.
The object support-policy tag includes the native policy version and a digest
of its actual runtime bounds. The bounded immutable definition cache still
retains only successful raw content and reruns whole support.

Ordinary live reads require `summary`, final reads require `items`, mixed
reads require both. Unresolved birth additionally requires `summary` even
for a final read. There is no new query claim or fresh member/key roster
lookup. Issued session claims retain their existing expiry and revocation
semantics. Signed recent-local or exact-genesis-root bootstrap remains a
separate eligibility path and confers no final-row authority.

## Small authenticated directory RPC

The deployment-internal `sessionReference` method has no HTTP route. The
sender preflights finite fields before serialization; both sides clamp
actual UTF-8 bytes and exact versioned schemas. The optional namespace
capability uses one exact directory address and has no summary/source
fallback, independent timeout, retry or recursive discovery.

The receiver authenticates the existing session and its summary claim before
SQL. Its own bounded frame must be the full expected directory incarnation,
active, under an exact supported native pin. One indexed open-repository
page includes a second-candidate witness: one returned row without `more`
proves exactly one, rather than truncating an inventory. The exact native
membership callback uses that already admitted page and must return the
same full membership reference as the token. The receiver checks its local
clock/window and performs final current support and fresh authentication.
Only then can it return its version, full directory identity, exact pin,
confirmed full membership and optional rules reference.

It returns no item, summary, count, inventory, head, clock or origin material.
Every private failure is null; caller eligibility is a private boolean.
Neither path calls `#first`, the operations driver, old `pinned()` or generic
Store readers, native turns, source/resolver or backfill. Receiver construction
has no peer port. Existing independently owned bounded lifecycle maintenance
keeps the G2s/G2r qualifications; the preparation ledger is not a count of
all constructor or background SQL in a Durable Object.

## Evidence and limits

The final focused run passes 40 cases in ten files, with Scope source/test
compilers passing. It includes all new preparation/session tests, G2p-a's
storage tests and the existing session and destination-session cases. Subsequent native-policy and cold-activation checks cover the final
bounds-derived tag and stronger cold witness.
The single frozen gate and exact head/tree are filed separately.

Seven distinct current directory cohorts run through genuine native register
founding and directory/membership/rules/destination creation and confirmation,
with actual internal namespace RPC. Protected local-only and unresolved
rules/destination matrices exercise manually restricted live/final/mixed
claims. A test-only passive ledger on actual caller/receiver budgets measures:

| Path | Local calls | Receiver calls |
| --- | ---: | ---: |
| Membership local-only | 9 | none |
| Unresolved rules | 15 | 12 |
| Unresolved destination | 16 | 12 |

Every measured participant also fits its candidate/body/metadata/genesis/
definition maxima. Native receiver RPC returns the exact small witness
as the first call after restart, with generic Store scope/stored/retained/page
and parked-operation lookup forbidden, preserving its recorded tables. These complete operation witnesses establish supported
cohorts, not that every legal room or declaration fits.

Fault cases use genuine child histories. Scripted post-native reply changes
exercise wrong directory incarnation, cohort, membership, rules target,
version, oversize, malformed and unavailable replies. A genuine competing
native checkpoint changes the local head during the await and ends eligibility;
its whole-state checkpoint work is explicit fixture activity, not a bounded
session dependency. Expiry after peer preparation also ends eligibility.
A gated late completion shows occupied admission after timeout, no additional
local SQL after late settlement, and a new admitted retry only afterward.
A synchronous-validator timing fixture proves no late raw-content cache.

Oversized/malformed scope/genesis/branch and ambiguous observed-incarnation
faults are explicitly injected storage layouts over genuine creation, not
judged observations or corrupt-history authority. They show no peer call,
metadata admission before unwanted bodies, and conservative unavailable.
The native cohorts are genuine judgments; the Git host, clock and setup
reader remain labelled stand-ins. Restricted tokens are manually minted,
not evidence of issuance. Timing gates are scripted, not deployed latency.

Ten targeted guard controls fail by assertions and restore exact source:
wrong-cohort acceptance; wrong rules-target acceptance; destination refusal
when removing operation page reuse exhausts its budget; new work admitted
while an old task remains pending; overdue cache installation; final expired
session acceptance; duplicate open-repository acceptance; seven receiver SQL calls before the required summary claim; and oversized,
multibyte or nonstring replies forwarded by the native sender; and an
activation-driver lookup introduced into the cold reference RPC. No timeout-only or compilation
failure is counted. Initial fixture-helper argument and TypeScript annotation
corrections remain recorded; they were corrected before final checks. There
is no mutation sweep or repeated whole suite.

This child does not establish public query argument binding, visibility of
returned rows, cursors, coherent output bodies/envelopes or bounded clients.
The protected eligibility result is not a reusable grant or authorization
for an unbound future response. Full G2 integration must bind the actual
request and response and retain fresh completion checks. There is no global
concurrency, peak heap, physical I/O, wire-buffer, cancellation, draining,
cross-isolate cleanup or deployed performance claim. G2/e029 and parent work
remain open.
