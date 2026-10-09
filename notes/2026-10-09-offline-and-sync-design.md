# Offline work and synchronization

Design for the plan after 2026-10-14. Written for request
`479234608afbf0e87e04e1091e1b813d46ad8f50`, under builder promise
`4950af44f65b6cb4ccfeeece35ec758910be0597`, covering items 2 and 3 of R5
(`af0086ff38a2f58952fe3e7613fc4929a05b50de`). This is a proposal for design
review. Landing this document adopts no protocol, dispatches no implementation
and changes no application interface.

## 1. The model

A device keeps a confirmed local projection of the scope histories it can
read, and a separate list of the person's pending changes. The person can
read retained work and prepare changes while disconnected. The application
may show the effect it expects a pending change to have, clearly marked as
pending. Only a scope's accepted entry changes the confirmed projection.

On reconnection, the device reads missing history, checks it, and rebuilds its
projection. It submits eligible signed intents from its private outbox. The
scope judges each against its current state, authority, time and capacity.
A refusal removes that change's tentative effect and retains the person's
draft and the reason. The person can revise the draft against the newly read
state. A new signed intent is a new request, with an explicit link in local
records to the request it replaces.

This model applies to any room application whose actions and state are
declared by the room's pinned definition. Application code supplies the
tentative presentation and the rules for revising a draft. It cannot declare
an act accepted, grant authority, reserve room capacity or settle an outside
effect. A tentative opening uses a local identifier; dependent changes wait
for the accepted entry's real item identifier before they are signed.

## 2. Nouns, acts and observations

| Name | Meaning and owner |
|---|---|
| Confirmed projection | Verified entries and their derived state, identified by scope, incarnation, pinned definition and a confirmed head. The client owns this cache. |
| Held observation | What the device last read, with its source and head. It helps prepare a draft; it is not current authority. |
| Draft | The person's requested change and its base revisions, still editable. It is local work, not an entry. |
| Signed intent | Fixed canonical bytes naming the target, signer, act, fields, expected item revisions, idempotency key and `notAfter`. It is immutable. |
| Local outbox | Private durable storage of exact signed intents, their accompanying bytes, attempt state, answers and recovery progress. It is distinct from a scope's outbox of recorded sends. |
| Tentative projection | The application's presentation of pending drafts over a confirmed projection. It is disposable and never an authority input. |
| Receipt | Evidence that this exact intent was accepted. Following it checks the scope, incarnation, position and hash. |
| Settlement | The target scope's answer about acceptance of the exact signed intent, including whether absence is terminal and whether preparation remains. |

The existing verbs are sufficient for the first slice: read summary,
definition, items, history, entries and retained inputs; build and sign an
intent; submit; settle; follow its receipt and recorded duties; and replay.
The application uses its definition's existing act names. Synchronization
does not introduce a generic privileged act or let a background service sign
on behalf of the person.

The device retains the item revisions used for `expected`, full fact
references used in fields or presentations, the pinned definition and each
read's head. An item revision is not a whole-room revision. A complete read at
one head can support a count or an absence at that head; incomplete pages or
pages from different heads cannot. A multi-scope projection holds one cursor
and confirmed head per scope. It claims no single atomic head for the room.

Membership and rules observations used by a receiving scope are separate.
The scope reads and retains those under the existing freshness rules. A
client's disconnected copy never extends their window, and changing the
client's clock or restoring a cache cannot make them fresh.

## 3. Preserve the request before it can leave

The proposed local store commits the signed envelope and all required
accompanying bytes before submission. It then durably records an attempt
before the transport can send. A crash after that marker, even before a known
send, is recovered conservatively as attempted with an unknown outcome.
Only one local sender may advance a record at a time; a restart resumes its
record rather than signing a replacement. The implementation must prove
this order with interrupted writes and two competing senders.

| Local condition | Next action |
|---|---|
| Draft, not signed | Read or edit locally. Sign only when the target, revisions and fields are known. |
| Signed, never attempted, still eligible | Record the attempt, then submit the saved envelope and accompanying bytes. |
| Signed, never attempted, expired | Keep the draft and mark the envelope unsent and expired. After refreshing the base, a new envelope may be signed. |
| Accepted | Keep and follow the receipt; incorporate verified history. Track resulting duties separately until their recorded results are known. |
| Refused | Keep the answer and `judgedAt`; remove the tentative effect. Refresh and ask whether to revise. The refusal consumes no idempotency key and is not terminal settlement. |
| Transport failure, malformed reply, or `unavailable` | Keep the original envelope and accompanying bytes. Inspect and settle; an eligible retry uses those same bytes. No automatic replacement signature. |
| Idempotency mismatch | Stop that record and inspect the original and recorded intent. Do not invent a new key to conceal the mismatch. |
| Settlement finds no entry, with no terminal basis | Keep the record unresolved. Absence at this head does not prove that a later acceptance is impossible. |
| Settlement proves terminal absence | An acceptance cannot follow. Inspect and resolve preparation or outside duties before releasing their bytes or treating the work as safely replaceable. |

A refusal answers one attempt at one head. If an earlier attempt has an
unknown outcome, a later refusal alone does not settle it. Before replacing
an attempted envelope, require its accepted receipt or terminal absence from
the exact target, and account for preparation in every involved scope.
An accepted receipt completes that request; it is never permission to issue
its effect again. An accepted change that should be undone needs another
authorized act if its definition supplies one. Removing a tentative effect
undoes no room entry. Replacing a refused request also requires terminal
absence: stop its sender and prove that an old in-flight retry cannot arrive
later, rather than treating the refusal as a cancellation.

Elapsed time on the device is not evidence that an attempted request had no
effect. Expiry can prevent a later admission; it does not undo an earlier
acceptance or settle an unknown mint, push or private dispatch. The original
signed envelope, source bindings and private custody remain until the
applicable recorded settlement or authenticated completion permits release.

## 4. Reconnection and revising stale work

Synchronization proceeds in bounded passes:

1. Open a fresh read session when the device is still authorized. Check the
   repository, membership incarnation and scope incarnations against the
   saved records. Stop on a changed incarnation; do not attach old work to a
   replacement scope.
2. Fetch missing history and retained inputs, with a separate cursor for
   each scope. Check canonical bytes, hashes, signatures, chains and pinned
   definitions. Keep partial progress, but report its coverage honestly.
3. Recover attempted requests before submitting dependent new work. Ask for
   exact settlement and inspect accepted receipts and preparation. Keep
   unknown records intact when the service or required history is unavailable.
4. Rebuild the confirmed projection. Reapply only compatible tentative
   changes over it, marking changes that now require a decision.
5. Submit eligible saved envelopes in dependency order, within a bounded
   work and retry budget. A retry delay grants nothing and settles nothing.
6. Refresh after each accepted entry or relevant refusal. Keep the reason,
   including a declared refusal name when supplied, beside the draft.

`revision-moved` means the signed expected revision no longer matches. The
client does not edit that signature or silently omit `expected`. It compares
the draft's old base with the new state and prepares a revised draft. A
definition-specific rule may carry forward independent text edits; an
ambiguous change needs the person's decision. Authority, final state, rules,
required checks and capacity are judged again on submission. An earlier
local check of them is only a preview.

The proposed first version requires the person to approve a replacement
intent after a stale refusal. A future application may ask for explicit
standing permission to revise narrowly defined changes automatically; its
scope and limits need a separate design. It cannot cover a still-unknown
attempt or manufacture present authority.

### Long disconnection

| What changed while away | Expected observation and response |
|---|---|
| Nothing relevant changed; saved envelope is still within its lifetime | It may be accepted after the scope's current checks. Reconnection alone promises no acceptance. |
| Disconnection outlasted `notAfter` | Never-attempted work becomes an expired local envelope. Attempted work is settled with the original envelope; a previously accepted intent can still return its receipt. |
| An expected item advanced or became final | Keep the current head and refusal; revise the draft after resolving prior attempts. No local acceptance. |
| Rules or another relevant scope changed | Read their current records. The target judges required conditions and observations; the client cannot reuse held approval as fresh authority. |
| Device key was retired, compromised, or its member removed | New actions may be refused under the authority windows. Exact settlement remains a read of the original intent. Preserve historical evidence and unresolved custody. |
| Session expired | Request a new session with this device's key. A session signs no acts; failure to renew does not erase local drafts or prove settlement. |
| History or retained input is missing, redacted, too large or unreadable | Mark the affected replay incomplete or otherwise report its actual result; stop dependent automatic reconciliation. Keep drafts and recovery records. |
| Scope capacity is full | Retain the envelope and refusal. Offer inspection or later retry within its lifetime; never drop an admitted duty or reduce required evidence to make new work fit. |

The current configured intent lifetime is proposed as fifteen minutes. This
design does not extend it to support days of disconnection. Long-lived local
work stays as drafts; short-lived signed envelopes preserve intent and
expected revisions, and are renewed only through the recovery rules above.
Clock windows are the authority note's clock-based rules and assumptions,
not a promise of real-time revocation from a disconnected device's clock.

## 5. Bytes through the Worker

The current host configuration supplies `maxBytes`; there is no universal
pack size in this proposal. Current Git transport code bounds compressed
wire bytes, inflated and retained object bytes, object count and per-object
size. A receive request must fit its command framing plus pack, so a pack
that fits by itself may still be too large to send. The client must preserve
and report the configured allowance and the measured quantity, rather than
labeling compressed size as the whole memory cost.

Before a future pack upload can be queued, the protocol owners must define
the upload route, byte domain and object closure, ownership, authentication,
retention, expiry, recovery and capacity reservation. Neither this note nor
R5 supplies a current arbitrary-pack upload act. The concurrent text-manifest
work is not treated as proof of pack support. A local Git branch may remain
local while the supported proposal form carries its selected text sources.
Publication stays the destination's judgment.

Oversized work is refused before an outside send, with its draft retained.
Splitting it requires a declared protocol whose stages have their own
identities and completion rules; slicing a byte stream or changing the
proposal's files silently is insufficient. The first offline slice excludes
pack upload. Its local store still has explicit byte, record and retained
history budgets. At its limit it stops admitting new local work and tells the
person how to retain or export their draft; it never evicts an unknown request
or private credential to make space.

## 6. One key per device

Each device creates and keeps its own key. Keys are never copied between
devices. Enrollment uses the existing authorized invitation and join;
disconnection does not revoke a key. Revoking this device affects this key
under the existing windows and does not revoke another active device's key.

The outbox is private to its signing device. Another device does not discover
or send an unsent signed act as though it were room work. A replacement
device can read accepted room history under its own authority, but that does
not recover a lost private draft, original envelope or secret automatically.
Recovery and enrollment cannot declare an unknown outside operation settled.

The store must separate device keys, session tokens, secret-bearing envelopes
and provider credentials from public projection data. Public exports and
diagnostics include none of those secrets. Device storage loss, logout,
revocation, and an explicit request to erase private drafts each need a
defined custody outcome. The first slice preserves unresolved records and
reports them; it introduces no cross-device outbox sharing or key backup.

## 7. What exists, and what must change

The authority and contract references below are the adopted revisions named
by the landed I3 fourth milestone. Their design guarantees do not prove that
every source path implements them.

| Concern | Existing basis | Required work |
|---|---|---|
| Immutable signing, expected revisions, expiry and lifetime idempotency | Scope contract 2.1 and 4.2; current intent and answer types | No weaker server rule. Add durable local records and an explicit recovery state machine. |
| Terminal absence and preparation | Contract 9.1 defines terminal bases and preparation status | Current `Settlement = Read<Receipt>` omits both. Close this API/runtime/client gap, with witnesses, before automatic replacement of attempted work. |
| Reads and independent replay | Contract 9.1–9.6; current history pages and replay package | Define persisted cursors, consistent page coverage, incremental projection checkpoints and handling of missing inputs. Preserve replay trust labels. |
| Current authority | Contract 16.1; authority 3.3 and 3.12 | Clarify explicitly that offline client observations serve drafting only. Preserve scope-owned read/run freshness and fail-closed behavior. |
| Device keys and read sessions | Authority 3.5, 3.6 and 3.9 | Specify durable device storage, private record lifecycle and loss handling. Do not add an offline grant or signing session. |
| Unknown outside effects and custody | Authority 5.4 and existing exact-envelope recovery in selected client workflows | Make generic outbox recovery retain all required bindings and preparation status. Do not broaden those workflow witnesses into a complete offline client claim. |
| Capacity | Contract 17 states five dimensions and reserved settlement duties | Verify current admission coverage separately. Add client-store bounds; client preview cannot promise room capacity or release server reservations. |
| Packs and Worker limits | Host `maxBytes` and current Git reader/send bounds | Owner-approved upload protocol and measured bounds are prerequisites for pack transport. No pack feature in the first slice. |
| Optimistic presentation and stale draft revision | R5 items 2 and 3 | Specify the application-facing projection/outbox interface and replacement authorization. The confirmed fold continues to follow accepted entries only. |

Proposed contract clarification: distinguish a local signed outbox from a
scope's recorded outbox; state replacement's dependence on exact settlement
and preparation; define synchronization coverage and dependent local work.
Proposed authority clarification: state that queued signatures retain their
original key and authority is judged at admission; record device-store
custody and loss rules. These are requests to the existing owners after the
14th, not amendments made by this document. A pack protocol needs its own
request, definition version and bounds review.

## 8. Staged delivery

**First slice: one-scope durable intent recovery.** Use one existing declared
act with no outside preparation, one enrolled device and one repository.
Implement private durable envelope storage, an attempt marker, restart
recovery, exact submit/settle, and a confirmed projection with a separate
pending effect. Close and witness the terminal-settlement API gap first.
Do not enable automatic replacement while that gap is open. No pack upload,
cross-device recovery or application redesign belongs in this slice.

The first slice's acceptance witnesses distinguish: interrupted persistence
from a possible send; competing senders from one attempt; a lost accepted
reply from a second mutation; never-attempted expiry from attempted unknown;
nonterminal absence from terminal absence; a stale refusal from a revised
request; a changed incarnation from the original scope; and revocation from
an offline grant. Each witness runs at the boundary that actually persists,
judges or recovers that case. A transport stand-in proves only its scripted
boundary.

Next, extend to several scopes with durable per-scope cursors, bounded replay
and dependent drafts. Show long-disconnection and incomplete-history cases
before background replacement is enabled. Then integrate acts with
preparation and outside duties, keeping their original custody and
settlement. Finally, consider owner-approved pack transport and measured
Worker bounds as a separate delivery. Each stage gets its own request,
reviewable source and focused witnesses; the design review and landing of
this note discharge none of those deliveries.

## 9. Reading and verification scope

Source baseline: `3b468cd04c5cd3925592fed28d9e801323c92702`.
The design texts are available from their immutable Git commits, even though
these paths are absent from this source checkout:

```sh
git show 3b3e394fc6807c33211ac80db813621253c38f5c:notes/2026-10-04-scope-and-replay-contract.md
git show 8b1c3c9d7987fba6ac5f5b31fbe329d50a3f568b:notes/2026-10-04-authority-effects-and-publication.md
```

Exact artifact records: contract
`e15527f604e515339893ecae91efe1aaa841ce0c`; authority
`d8e94aba76f298da706a6bf566371e753d215d9f`. The adoption baseline is
recorded in [the I3 fourth milestone delivery](2026-10-06-i3-fourth-milestone-delivery.md).
Current source interfaces are
[intent](../packages/contract/src/intent.ts),
[settlement and reads](../packages/contract/src/read.ts),
[local command storage](../packages/cli/src/store.ts),
[Git pack sending](../packages/git/src/http.ts) and
[Git pack reading](../packages/git/src/http-read.ts).

- Read the full B2 request and R5 request in the workroom.
- Read contract revision 23 at
  `3b3e394fc6807c33211ac80db813621253c38f5c`: sections 2.1, 4.2 and 9.1
  in full; the opening of 9.6, the opening/type/freshness table of 16.1,
  and the relevant opening rules of 17.1 and 17.3. Other sections were
  located by headings and targeted search, not read in full.
- Read authority revision 28 at
  `8b1c3c9d7987fba6ac5f5b31fbe329d50a3f568b`: sections 3.9 and 5.4
  in full; the opening rules of 3.3, 3.5, 3.6 and 3.12, including the
  observation freshness and clock assumptions. Other sections were not
  reviewed for this design. The exact artifact records and their approved,
  ratified review metadata were inspected; this is no new design adoption.
- Read current intent, observation, answer, read and bounds types; client
  guide; local command store; scope guide's answer/read sections; and Git
  pack build/send/decode bounds. Reviewed source statements here are bounded
  to those reads. No end-to-end offline implementation was exercised.

Only this document changes. Source and tests remain unchanged from the
baseline; no application, browser, provider, install, test or gate run was
performed for this design-only change. Independent design review and the
document's landing remain owed.
