# Artroom protocol, version 1

This document is the normative contract for Artroom. It goes with the
types in `packages/contract`. It implements the approved plan,
[notes/2026-10-01-artroom-plan.md](../notes/2026-10-01-artroom-plan.md),
sections 4 to 11 and 13.

**How to read it.**
- Each rule has a number, such as `R-LAND-7`. Reviews and tests cite rules by
  number.
- "Must" and "never" are requirements. "May" is a permission.
- Each rule is written so that a test can show it holds or fails.
- Where the plan left a detail open, this document chooses the safest
  reading. Section 22 lists each such choice.

**Contents**

1. Terms
2. Identifiers (R-ID)
3. Canonical bytes and signing (R-SIG)
4. Room genesis, the roster and the recovery key (R-GEN)
5. Admission and authority (R-ADM)
6. Idempotency (R-IDEM)
7. Credentials per transport (R-CRED)
8. Lanes and leases (R-LANE)
9. Paths and proposals (R-PATH, R-PROP)
10. Obligations, reviews and checks (R-OBL)
11. Carrying verdicts and checks (R-CARRY)
12. The landing operation (R-LAND)
13. Publication and recovery (R-PUB)
14. Revocation and the emergency rule (R-REV)
15. Admins and the policy boundary (R-ADMIN)
16. Policy (R-POL)
17. The policy evaluator (R-EVAL)
18. Execution isolation (R-EXEC)
19. Secrets (R-SEC)
20. The log format (R-LOG)
21. The API on every transport (R-API)
22. Open points
23. Acceptance cases and the rules they test

## 1. Terms

| Term | Meaning |
|---|---|
| Room | One repository and its sequencer, the Room Durable Object |
| Act | A signed, ordered, permanent statement by a member: `claim`, `propose`, `note`, `review`, `check`, `land`, `release` |
| Envelope | The signed form of an act, and of `renew` and `roster` |
| Entry | One position in the log: an accepted act, a recorded refusal, or a system event |
| Lane | A claim and everything resting on it |
| Generation | One proposed head within a lane, numbered from 1 |
| Lease | A lane holder's time-limited right to act on the lane |
| Obligation | Something a proposal needs before it may land: a review or a check |
| Evidence | A verdict or check that meets an obligation, either "reviewed here" or "carried" |
| Operation | Asynchronous work with visible states: workspace, preview, landing |
| Reservation | The moment a landing is decided (R-LAND-7) |
| Publication slot | The room's single right to write `main` (R-PUB-1) |
| Admission | The point in the room's order at which an act is judged and recorded (R-ADM-1) |

## 2. Identifiers (R-ID)

| Identifier | Format | Example |
|---|---|---|
| Entry ID (`ActId`) | `act_<seq>_<hash8>` | `act_42_9f3a01bc` |
| Lane ID | The ID of the claim that opened the lane | `act_7_0c1d2e3f` |
| Room ID | `room_` + 32 lowercase hex characters | `room_5d1f…` |
| Key ID | `key_` + 43 base64url characters | `key_Q2xh…` |
| Member or team handle | `@` + `[a-z0-9][a-z0-9-]{0,38}` | `@alice`, `@security` |
| Git object (`Sha`) | 40 lowercase hex characters | `3b18e512…` |
| Digest | `sha256:` + 64 lowercase hex characters | `sha256:9e10…` |
| Operation ID | `op_` + `[A-Za-z0-9_-]{1,64}` | `op_land_17` |
| Obligation ID | `obl_` + rule ID | `obl_tests` |
| Pinned ref | `refs/artroom/heads/<laneId>/<generation>` | `refs/artroom/heads/act_7_0c1d2e3f/2` |

**R-ID-1.** Every entry has an ID `act_<seq>_<hash8>`. `seq` is the entry's
position, in decimal, with no leading zeros; genesis is 0. `hash8` is the
first 8 hex characters of the entry hash (R-LOG-2). A reader resolves an ID
by `seq`, then compares `hash8`. A mismatch means "not found".

**R-ID-2.** These IDs reuse entry IDs: a lane is the claim that opened it; a
delegation or invitation is the roster act that created it; a policy version
is the `policy-activated` system event.

**R-ID-3.** A room ID is `room_` followed by the first 32 hex characters of
the SHA-256 of the canonical bytes of the genesis object (R-GEN-1).
Envelopes carry the room ID, never the room name. A name can be reused; an
ID cannot.

**R-ID-4.** A key ID is `key_` followed by the unpadded base64url encoding of
the 32-byte Ed25519 public key. A signature can be checked from the key ID
alone.

**R-ID-5.** Members and teams share one handle namespace. A handle is never
reused in a room, even after removal.

**R-ID-6.** A `Sha` is a 40-character lowercase hex git object name. Version
1 supports SHA-1 repositories only (section 22, point 15).

**R-ID-7.** A digest of JSON is the SHA-256 of its canonical bytes (R-SIG-3).
A digest of a file is the SHA-256 of its raw bytes.

**R-ID-8.** The room chooses operation IDs. An operation ID never changes
during the operation's life. Operations are not log entries.

**R-ID-9.** An obligation ID is `obl_` followed by the ID of the rule that
created it. The platform's own admin obligation is `obl_admin-approval`.
The same rule gives the same obligation ID in every generation of a lane.
This is how evidence is matched when it carries.

**R-ID-10.** Rule IDs and checker names match `[a-z][a-z0-9-]{0,63}`.
Idempotency keys match `[A-Za-z0-9_-]{1,64}`.

## 3. Canonical bytes and signing (R-SIG)

**R-SIG-1.** The bytes signed are a domain tag, a newline (`0x0A`), and then
the canonical bytes of the object. Signatures are Ed25519 (RFC 8032, pure
Ed25519), 64 bytes, encoded as unpadded base64url.

| Domain tag | Object signed | Signed by |
|---|---|---|
| `artroom-genesis-v1` | The genesis object | The first admin key |
| `artroom-envelope-v1` | An envelope | The `actor` key |
| `artroom-request-v1` | A request envelope (R-CRED-5) | The `actor` key |
| `artroom-entry-v1` | The entry's `hash` string, as UTF-8 | The room key |
| `artroom-checkpoint-v1` | A checkpoint, without `sig` | The room key |

**R-SIG-2.** Canonical bytes are the UTF-8 encoding of the JSON
Canonicalization Scheme (RFC 8785) form of the object.

**R-SIG-3.** Signed JSON follows a restricted profile:
- every number is a safe integer (from −(2^53 − 1) to 2^53 − 1), and never
  negative zero;
- every string is well-formed Unicode, with no lone surrogates;
- no object has duplicate keys; a parser that sees one must reject the input;
- an absent optional field is omitted, never `null`, unless the type says
  `null`.

**R-SIG-4.** Envelopes and bodies are closed. A field the type does not
define is an error:
- in the envelope: `ArtroomError` `bad-request`;
- in the body: refusal `invalid-body`, not recorded.

**R-SIG-5.** The room checks `v` is 1 and `room` is its own room ID, then
verifies the signature against `actor`. Any failure throws `ArtroomError`
`unauthenticated`. Nothing is recorded.

**R-SIG-6.** Size limits. A larger act is refused with `body-too-large`,
not recorded.

| Item | Limit |
|---|---|
| Signed envelope, canonical bytes | 64 KiB |
| `goal` | 1 KiB |
| `plan`, `note.text`, `review.text`, `check.detail` | 16 KiB each |
| `summary`, handover note | 8 KiB each |
| `scope`, `dependsOn` | 64 patterns each, 256 characters per pattern |

The values are initial values (section 22, point 9).

## 4. Room genesis, the roster and the recovery key (R-GEN)

**R-GEN-1.** Genesis is entry 0. It is a system entry that holds the
genesis object and the first admin key's signature over it. The genesis
object names:
- the room name and the canonical repository;
- the first admin's handle and key;
- the recovery key;
- the room key;
- the policy profile and the pinned `jsonata` version;
- the creation time.

**R-GEN-2.** A room's genesis never changes. A new genesis is a new room
with a new room ID.

**R-GEN-3.** The recovery key may sign any roster op except `join`,
`delegate` and `undelegate`, at any time:
- whatever the policy, the roles and the sole-admin state;
- even when no admin can act.

The recovery key is not a member. It may not sign any other kind: refusal
`role-forbids`. Each use carries the flag `recovery-key`, and the UI shows
it. Only the recovery key itself can replace the recovery key, with
`rotate-recovery`.

**R-GEN-4.** Who may sign each roster op:

| Op | Signer |
|---|---|
| `invite`, `set-role`, `remove`, `revoke-key`, `team` | An active `admin`, or the recovery key |
| `join` | The invited key, once |
| `delegate`, `undelegate` | The grantor key, which must belong to an active member |
| `rotate-recovery` | The recovery key only |

Any other signer is refused with `admin-required` or `recovery-only`.

**R-GEN-5.** Roles decide which kinds a member may sign. Policy cannot
widen this table.

| Role | May sign |
|---|---|
| `admin` | Every kind |
| `maintainer`, `member`, `agent` | `claim`, `propose`, `note`, `review`, `land`, `release`, `renew`, and `roster` ops `delegate` and `undelegate` |
| `checker` | `check`, `note`, and `roster` ops `delegate` and `undelegate` |

A kind outside the table is refused with `role-forbids`. Whether a member
may review or check a particular proposal is decided by its obligations
(R-OBL-2, R-OBL-3).

**R-GEN-6.** Invitations.
- An invitation is single-use and expires. Its expiry is at most 7 days
  after the room clock when it is issued.
- It binds exactly one new key to one member. For a new member it also sets
  the role. For an existing member it adds a key, and sets no role.
- The invitation records `secretHash`, the SHA-256 of a random secret of at
  least 32 bytes. The secret travels out of band.
- `join` is signed by the new key and reveals the secret. It is admitted
  only if the secret's hash matches and the invitation is unexpired and
  unused at admission. The same entry consumes it.
- A refused `join` is not recorded, so a secret that fails is never
  published.

**R-GEN-7.** The `team` op sets a team's members. Teams are principals for
owners, review obligations and notifications.

**R-GEN-8.** The room refuses, with `last-admin`, any op that would leave no
active admin:
- removing the last active admin;
- demoting the last active admin;
- revoking the last active key of the last active admin.

The recovery key may still do these.

**R-GEN-9.** A member is active while its state is `active`. An active
admin is an active member with role `admin` and at least one active key.

## 5. Admission and authority (R-ADM)

**R-ADM-1.** Admission order. The room handles each envelope in this order.
The first failing step decides the outcome.

| Step | Check | On failure | Recorded? |
|---|---|---|---|
| 1 | Parse, version, room ID, size of the whole envelope | `ArtroomError` `bad-request`, `unauthenticated` or `payload-too-large` | No |
| 2 | Signature (R-SIG-5) | `ArtroomError` `unauthenticated` | No |
| 3 | Idempotency (R-IDEM) | The original result, or refusal `idempotency-mismatch` | No new entry |
| 4 | Authority at admission (R-ADM-3) | Refusal `not-member`, `key-revoked`, `delegation-invalid`, `role-forbids`, `admin-required`, `recovery-only` or `invitation-invalid` | No |
| 5 | Body schema and sizes (R-SIG-4, R-SIG-6) | Refusal `invalid-body` or `body-too-large` | No |
| 6 | Secret scan (R-SEC-1) | Refusal `secret-detected` | No |
| 7 | Lane and lease (R-LANE) | Refusal, such as `generation-moved` | Yes |
| 8 | Platform invariants (R-PROP, R-OBL, R-ADMIN) | Refusal, such as `outside-claim` | Yes |
| 9 | Policy `refuse` rules, and `require` on `propose` (R-POL) | Refusal with the rule's ID and fix, or `policy-budget-exceeded`, `policy-type-error` | Yes |
| 10 | Record the act and its receipt; apply effects | — | Yes |
| 11 | Policy `notify` rules (R-POL-5) | Never refuses | Decision recorded |

Admission is the act's place in the room's order. The room clock at
admission is recorded as `at`. It is informational. The envelope carries
no trusted signing time.

**R-ADM-2.** The room takes the actor's identity from the verified
signature. It never takes identity from a field. Over a service binding,
`as` only chooses which of the caller's delegations to sign under.

**R-ADM-3.** An act is admitted only if, at its admission, all of these are
current:
- the signing key is active, not revoked for any reason;
- the key's member is active, and its role may sign the kind (R-GEN-5);
- if the envelope names a delegation: the delegation exists, is not revoked,
  has not expired by the room clock, covers the kind and the lane, and was
  granted to the signing key;
- for a delegation: the grantor key is active, and the grantor's member is
  active and its role may sign the kind.

With a delegation, the act's authority is the grantor's member, limited to
the delegation. The receipt records the authority used (`Authority`).

**R-ADM-4.** An act signed before a revocation but submitted after it is
refused with `key-revoked`. An act under an expired or revoked delegation
is refused with `delegation-invalid`. Neither is recorded.

**R-ADM-5.** A delegation can grant only kinds the grantor's role may sign,
excluding `roster`. A delegation cannot grant a role. A delegated key cannot
re-delegate what it was granted: a `delegate` signed under a delegation is
refused with `delegation-invalid`.

**R-ADM-6.** Admission is atomic. No other act is admitted between the reads
used to judge an act (roster, lane, lease, generation, policy version) and
the write that records it. The room either evaluates with no external I/O
between those reads and the write, or re-validates all of them inside the
synchronous write transaction.

**R-ADM-7.** An admitted act's authority is never re-judged as an act. It
is judged again only as evidence (R-REV-1).

**R-ADM-8.** Steps 7 to 9 record refusals as `refusal` entries, with the
full signed envelope and the decisions that led to them. The returned
`Refusal` then carries the entry ID in `act`. Refusals from steps 1 to 6 are
never recorded. So only an authenticated, authorized, well-formed and
secret-free envelope ever reaches the log.

**R-ADM-9.** A runtime failure records nothing. Examples are a Worker CPU
limit, running out of memory, a storage error or an engine fault. The caller
receives a retryable `ArtroomError`.

**R-ADM-10.** The room answers an act only after its SQLite write commits.

**R-ADM-11.** An accepted act by the lane holder on its lane renews the
lease (R-LANE-5). A recorded refusal does not.

## 6. Idempotency (R-IDEM)

**R-IDEM-1.** An idempotency key is scoped to the signing key. Two acts
with the same `actor` and `idempotencyKey` are the same request.

**R-IDEM-2.** If a request matches an earlier accepted act or recorded
refusal, and its canonical envelope bytes are identical, the room returns
the original record or refusal. It creates no entry. This holds even if the
key has since been revoked. It is idempotency, not re-admission.

**R-IDEM-3.** If the bytes differ, the room refuses with
`idempotency-mismatch`, names the original entry in the reason, and records
nothing.

**R-IDEM-4.** An unrecorded refusal (steps 1–6 of R-ADM-1) leaves no
idempotency record. A retry with the same key is judged afresh.

**R-IDEM-5.** Idempotency records last as long as the room.

**R-IDEM-6.** After a `timeout` or `unavailable` error, clients retry with
the same idempotency key. Every act method and MCP tool accepts one.

## 7. Credentials per transport (R-CRED)

| Caller | Credential | Who signs acts | Reads |
|---|---|---|---|
| Browser | Ed25519 key made with WebCrypto (non-extractable), joined by invitation | The browser | Session from a signed `session` request |
| CLI or script | Key file made by `artroom login` from an invitation | The client | Session from a signed `session` request |
| MCP agent | Bearer token from an invitation | The room, with a room-held key, under a delegation | The bearer token |
| Worker (service binding) | A delegation key in a Worker secret | The calling Worker, under the delegation chosen by `as` | Session from a signed `session` request |

**R-CRED-1. Browser.** The browser makes the key with WebCrypto and redeems
an invitation with `join`. It signs each envelope. GitHub sign-in may be
linked later. It never replaces the key.

**R-CRED-2. CLI.** `artroom login <invitation>` makes a key file readable
only by the user, and redeems the invitation. The CLI signs each envelope.

**R-CRED-3. MCP.** An invitation with `custody: "room"` works like this:
1. On redemption, the room makes the member's key and keeps it. The room
   records the `join`, signed by that key.
2. For each bearer session, the room makes a session key. It records a
   `delegate` act from the member key to the session key, with the
   invitation's `session` kinds and lifetime.
3. It returns the bearer token once. It stores only the token's hash.
4. Every act the room signs for the agent is signed by the session key and
   names the delegation.

Revoking the delegation, or the member's key, ends the bearer session.

**R-CRED-4. Worker.** The Worker holds a delegate key as a secret. Members
grant delegations to that key. The Worker signs each envelope, and `as`
chooses the delegation. The room never sees the private key.

**R-CRED-5. Unrecorded requests.** Opening a workspace and starting a read
session are signed request envelopes (`artroom-request-v1`), not acts. The
room checks their authority as for an act:
- `workspace`: as for `propose` on that lane, including the lease;
- `session`: an active member.

They are not recorded in the log.

**R-CRED-6.** A request envelope carries a `nonce` and a `notAfter`. The
room refuses a request with `ArtroomError` `unauthenticated` when:
- its `notAfter` is in the past, or more than 300 seconds ahead of the room
  clock;
- its nonce was already seen for that key within that window.

**R-CRED-7.** A session token is for reads only, and lasts at most one hour.
It stops working when its key or delegation is revoked.

**R-CRED-8.** A workspace token:
- is a write token for the lane's Artifacts fork only;
- expires no later than the lease;
- is revoked through Artifacts on release, expiry or take-over.

It is never recorded.

## 8. Lanes and leases (R-LANE)

| Transition | Body | Who | Effect |
|---|---|---|---|
| `claim` on a new scope | target `null` | Any member whose role may claim | `opened`: new lane, generation 0, lease starts |
| `claim` on a held lane (rescope) | target lane, `lease`, `expectedGeneration` | Holder only | `rescoped`: overlap recomputed; obligations recomputed if paths change |
| `claim` on an unheld lane (take-over) | target lane, `expectedGeneration`, no `lease` | Any member whose role may claim | `taken-over`: new lease generation |
| `propose` | `lease`, `expectedGeneration` | Holder only | `proposed`: generation n+1 |
| `review`, `check` | target `(lane, generation)` | Per obligations | Bound to that generation |
| `land` | `lease`, `head` | Holder only | Starts a landing operation (R-LAND) |
| `release` | `lease` | Holder only | `released`: lane unheld |
| `renew` | `lease` | Holder only | `renewed` |
| Lease expiry | System event | Room alarm | `expired`: lane unheld |

**R-LANE-1.** A claim with target `null` opens a lane. The lane's ID is the
claim's entry ID. The lane starts at generation 0 and lease generation 1.
The holder is the act's authority member. The response lists overlaps
(R-PATH-3).

**R-LANE-2.** A rescope is a claim on a held lane, signed by the holder. It
carries the current lease generation and `expectedGeneration`. The room
recomputes overlaps. If the latest generation's obligations depend on paths
that changed, the room recomputes them.

**R-LANE-3.** Only the holder may propose, land, release, renew, rescope or
open the workspace. Anyone else is refused with `not-holder`. On an unheld
lane these acts are refused with `not-holder`. An act that targets a lane
that does not exist is refused with `lane-unknown`.

**R-LANE-4.** Every act that changes a lane's generation carries
`expectedGeneration`. If it is not the lane's current generation, the room
refuses with `generation-moved`, and the refusal's `current` gives the
generation. `propose` makes generation n+1. Earlier generations stay
readable.

**R-LANE-5.** A lease is renewed by `renew`, or by any accepted act from
the holder on that lane. Renewal sets the expiry to the room clock plus the
room's lease duration.

**R-LANE-6.** Every holder act carries `lease`, the lease generation. If it
is not the current lease generation, the room refuses with `lease-fenced`.
The lease generation increases by one at each expiry, each release and each
take-over.

**R-LANE-7.** A take-over is a claim on an unheld lane, with no `lease`. A
take-over of a held lane is refused with `lane-held`. A claim on an unheld
lane that carries a `lease` is refused with `lease-fenced`.

**R-LANE-8.** On release or expiry:
- the lane becomes unheld;
- the room revokes the lane's workspace token;
- the recorded context stays: the claim, each generation, notes, verdicts,
  checks, and the handover note if the holder wrote one.

Expiry is a system event raised by the room's alarm. The room never
invents a handover note.

**R-LANE-9.** The holder owns a recut after a conflict. If the lease has
lapsed, the lane appears in other members' attention queues as
`recut-needed` with `unheld: true`.

**R-LANE-10.** A lane has at most one landing operation that is not in a
terminal state. A second `land` is refused with `land-in-progress`.

## 9. Paths and proposals (R-PATH, R-PROP)

**R-PATH-1.** Glob syntax:
- a pattern is segments joined by `/`;
- a segment is `**`, or literal text in which `*` matches any run of
  characters other than `/`;
- `?`, `[`, `]`, `{`, `}`, `!` and `\` are not allowed;
- a leading `/`, empty segments, and `.` or `..` segments are not allowed.

Any other pattern is refused with `glob-invalid`. Claims, owners, review
scopes, `dependsOn` and policy use the same syntax.

**R-PATH-2.** A path matches a pattern when its segments match in order.
`**` matches zero or more whole segments. Matching is case-sensitive, on
the path's exact bytes, with no Unicode normalization.

**R-PATH-3.** Overlap between two patterns is conservative. The room
reports an overlap unless it can prove that no path, existing or not, can
match both. It may report an overlap that is not real. It never misses one.
`certain` is true only when one pattern is a literal path that the other
matches.

**R-PROP-1.** On `propose`, the room checks that `head` is reachable in the
lane's fork. If it is not, the act is refused with `head-unknown`. Pinning
has two steps:
1. Before admission, the room copies the head's objects into the canonical
   repository under `refs/artroom/objects/<head>`. This ref is named by
   content, so repeating it is harmless. A failure is `ArtroomError`
   `unavailable`, and nothing is recorded.
2. After admission, the room creates the pinned ref, pointing at the
   recorded head. After a restart, the room completes this step before it
   answers any read of that proposal.

So a generation number is only ever pinned to the head recorded for it.

**R-PROP-2.** A pinned ref never moves and is never deleted while the room
exists. A force-push to the fork cannot erase a proposed head.

**R-PROP-3.** Changed paths are computed from the merge base of `main` and
`head`, to `head`, with rename detection. A rename lists both the old and
the new path.

**R-PROP-4.** Every changed path, old and new, must match the claim's
scope. Otherwise the act is refused with `outside-claim`, and the fix is
"extend the claim".

**R-PROP-5.** Ownership and obligations come from the actual changed paths,
never from the claim's scope.

**R-PROP-6.** The path diff is bounded in tree depth and entry count. It
skips subtrees whose hash is unchanged, and caches by tree hash. A diff over
the bound is refused, and recorded, with `diff-too-large`. The refusal is
deterministic for the same trees.

**R-PROP-7.** Each proposal has a preview operation, which starts at
`propose`: `pending`, then `clean`, `conflict` or `failed`. The room
recomputes it when main moves.

## 10. Obligations, reviews and checks (R-OBL)

**R-OBL-1.** A review binds to `(lane, generation)` and to the head the
reviewer saw. If `head` is not that generation's head, the review is refused
with `head-mismatch`. A review of an earlier generation is recorded as
history. It meets obligations only on its own generation, or by carrying
(R-CARRY).

**R-OBL-2.** A review meets a review obligation only if the reviewer's
recorded authority matches one of the obligation's `from` entries:
- a member handle;
- a team that contains the member;
- `role:<role>`;
- `owners`: the owners that policy assigns to the obligation's paths.

By default the author cannot meet a review obligation on their own lane.
The author is the member who proposed that generation, or the lane's holder.
A rule's `allowSelf` takes effect only when every path in the obligation
matches `docs/**` or `**/*.md`. In every other case it is ignored.

A review whose reviewer qualifies for no review obligation on that
generation is refused with `not-authorized-reviewer`. A review whose only
qualifying obligations disallow the author is refused with `self-review`.

**R-OBL-3.** A check meets a check obligation only if all of these hold:
- the signer's authority matches the obligation's `by`;
- the check names the obligation's checker;
- it binds the exact generation;
- `integration` is a commit the room prepared for that generation: the
  preview integration, or a landing operation's integration;
- `config` equals the digest of the checker configuration in the active
  policy version;
- `input` is the integration's tree, or the filtered snapshot the room built
  for that integration (R-CARRY-9).

A failure of the first condition is refused with `not-authorized-checker`.
Any other failure is refused with `check-binding`. A lane's holder or
proposer can never meet its own check obligation.

**R-OBL-4.** A review obligation with `count: n` needs approvals from n
distinct members.

**R-OBL-5.** Obligations are computed when a proposal is recorded:
- one for each `require` rule whose paths match a changed path, and whose
  `when`, if any, is true;
- plus `obl_admin-approval` when a changed path matches `.artroom/**`
  (R-ADMIN-1).

They are recomputed when policy activates (R-POL-9).

**R-OBL-6.** An obligation is `met` when its evidence is enough and valid
(R-REV-1). Otherwise it is `open`. An obligation that was met and opens
again records why (`Reopened`).

## 11. Carrying verdicts and checks (R-CARRY)

A verdict or check is permanently bound to the generation and head it
judged, and, for checks, to the integration commit. Nothing changes it.
Carrying only decides whether it also counts as evidence for a later
generation.

**R-CARRY-1.** A verdict from generation n counts for generation m only if
no path that changed between the two heads, old or new, matches the
verdict's reviewed `scope`.

**R-CARRY-2.** And no such path matches the verdict's `dependsOn`, or the
default `dependsOn` that policy gives for the areas of the reviewed scope.

**R-CARRY-3.** And no such path is a global input. Global inputs are the
platform's list plus the policy's additions. Policy cannot remove a platform
entry. The platform's list is:

```
.artroom/**
package.json   **/package.json
package-lock.json   **/package-lock.json   npm-shrinkwrap.json
yarn.lock   pnpm-lock.yaml   pnpm-workspace.yaml   bun.lockb
tsconfig*.json   **/tsconfig*.json
wrangler.*   **/wrangler.*
vite.config.*   vitest.config.*   jest.config.*   playwright.config.*
Makefile   Dockerfile   .github/**   scripts/**   .npmrc   .nvmrc
```

**R-CARRY-4.** And the active policy version is the same, or the new
version still accepts the verdict when re-evaluated. Policy `carry` rules
are evaluated only for evidence that already meets R-CARRY-1 to 3. They can
only stop it from carrying. A carry rule that errors stops it carrying, and
the decision is recorded. `carry({ verdicts: false })` turns verdict
carrying off; `checks: false` does the same for checks.

**R-CARRY-5.** Evidence that does not carry stays visible as history. The
proposal lists it in `notCarried`, with a code and the paths that caused it.
The obligation reopens.

**R-CARRY-6.** A check binds the integration commit, the checker
configuration digest and the runner environment digest. After any change to
the integration, the check reruns, unless one of these holds:
- **Whole tree (the default).** The new integration's tree is identical,
  and the configuration and runner digests are unchanged.
- **Scoped inputs.** The filtered snapshot digest is identical, and the
  configuration and runner digests are unchanged (R-CARRY-9).

**R-CARRY-7.** A checker's configuration is
`.artroom/checkers/<name>.json`. The room reads it from the active policy
version, never from the proposal. Changing it needs an admin-approved
proposal (R-ADMIN-1). Neither a proposal nor its author can narrow a
checker's inputs.

**R-CARRY-8.** A scoped checker's inputs always include the global inputs.

**R-CARRY-9.** A scoped check is carried only if the runner could see
nothing else:
- the publisher builds a filtered snapshot with exactly the declared paths;
- the runner receives only that snapshot, in an isolated workspace;
- the runner has no token or remote for the canonical repository, no
  unfiltered git history or object database, and no shared cache or
  filesystem path that exposes omitted files.

The snapshot digest is the SHA-256 of the canonical JSON array of
`[path, mode, blob]` triples for the included files, sorted by the path's
UTF-8 bytes. A test that reads an undeclared file fails.

**R-CARRY-10.** A check from a checker whose configuration says
`volatile: true` never carries. Network fetches, time and unpinned tools are
volatile inputs.

**R-CARRY-11.** Every carried piece of evidence shows that it was carried:
the source generation, the source head, and the reason's text. The UI never
shows carried evidence as "reviewed here".

**R-CARRY-12.** Carried evidence must also be valid evidence (R-REV-1).

## 12. The landing operation (R-LAND)

A Durable Object handles one event at a time. While it awaits external I/O,
other requests can run. It is not a transaction across SQLite and git. So
landing is a durable state machine, and every step after an `await`
re-checks its preconditions.

| From | To | When |
|---|---|---|
| — | `accepted` | `land` is admitted (R-LAND-1) |
| `accepted` | `preparing` | The room starts building the integration |
| `preparing` | `ready` | Integration built; every obligation met; land rules passed |
| `preparing`, `ready` | `preparing` | Main moved, or policy activated (R-LAND-5) |
| `ready` | `publishing` | Reservation (R-LAND-7) |
| `publishing` | `landed` | Main read back equals the integration (R-PUB-5) |
| `publishing` | `unresolved` | The forward push failed, or main shows another writer (R-PUB-5) |
| `unresolved` | `landed` | Main read back equals the integration |
| `unresolved` | `aborted` | Only after an abort attempt, with terminal evidence (R-REV-5) |
| `accepted`, `preparing`, `ready` | `retryable` | R-LAND-6 |
| `accepted`, `preparing`, `ready` | `failed` | Conflict, failed check, or refusal |

No other transition exists. `landed`, `aborted`, `retryable` and `failed`
are terminal.

**R-LAND-1.** `land` is admitted only if:
- the signer holds the lane, with the current lease generation;
- the target generation is the lane's latest, and `head` is its head;
- the lane has no landing operation in flight (R-LANE-10);
- every review obligation is met (otherwise `obligation-open`, naming the
  first open one);
- the land rules pass (otherwise the rule's ID, or `objection-open`).

Check obligations may still be open; preparation meets them against the
integration. The landing operation is written in the same transaction as
the act, before any external I/O. Its state is then `accepted`.

**R-LAND-2.** The operation records `lane`, `generation`, `head`,
`expectedMain`, `policyVersion`, `leaseGeneration`, `integration` once it
exists, `evidence`, `state`, `attempts` and `updatedAt`.

**R-LAND-3.** After every `await`, a step re-reads the lane's generation,
lease generation, the active policy version and main. It writes its result
only if they still match the operation. Otherwise it follows R-LAND-5 or
R-LAND-6.

**R-LAND-4.** Preparation runs in parallel across operations:
1. Build the integration commit: `head` merged onto `expectedMain`, in the
   publisher sandbox. A conflict ends in `failed` with code `conflict` and
   the paths.
2. Meet the check obligations on that integration: carry where R-CARRY
   allows, otherwise request the checks. A failing required check ends in
   `failed` with code `check-failed`.
3. Evaluate the land rules and record the digest of their input as
   `landInput`.
4. Move to `ready`, listing the evidence.

**R-LAND-5.** When main moves, every operation in `preparing` or `ready`
whose `expectedMain` is not the new main goes back to `preparing`. It takes
the new main as `expectedMain`, and `attempts` increases by one. When a
policy activates, every operation in `preparing` or `ready` goes back to
`preparing` under the new version, with obligations recomputed.

**R-LAND-6.** Before reservation, these send the operation to `retryable`.
The room records a `land-outcome` event. The holder may `land` again.

| Cause | `reason` |
|---|---|
| A new generation was proposed on the lane | `generation-moved` |
| The lease expired or was taken over | `lease-changed` |
| The holder released the lane | `released` |
| The land initiator's authority is no longer current | `authority-lost` |
| Evidence stopped counting, such as from a compromised key | `evidence-invalid` |
| A review obligation reopened | `obligation-open` |

**R-LAND-7. Reservation is the linearization point.** Reservation is one
synchronous SQLite transaction in the room, with no `await` inside it. In
that transaction the room:
1. Re-validates the operation against current state:
   - the lane's generation and lease generation equal the operation's;
   - the active policy version equals the operation's;
   - the land initiator's current authority passes R-ADM-3, judged now as
     for a new admission;
   - every piece of evidence is valid under R-REV-1, judged against the
     authority recorded at its admission;
   - main, as the room last recorded it, equals `expectedMain`;
   - the land-rule input, rebuilt now, has the digest `landInput`.

   On any mismatch, the operation goes to `retryable`.
2. Records the operation as `publishing`, with the next publication
   number.
3. Records the publication slot as held by this operation.
4. Records a `land-reserved` system event. Callers see "landing reserved at
   seq N".

If the slot is held by another operation, the operation stays `ready` and
tries again when the slot is free. That is not a mismatch.

**R-LAND-8.** From reservation, the landing is authorized irrevocably.
While the slot is held, acts are admitted and ordered after the
reservation. They cannot cancel it. Each one's receipt names the
reservation in `after`, and carries the flag `after-reservation`. This
covers:
- a release;
- a new generation;
- an objecting review;
- a role change, or a key revocation for `retired`;
- a policy activation.

The single exception is a `compromised` revocation (R-REV-5). The UI shows
the order, for example "objection recorded after this change was reserved
for landing".

**R-LAND-9.** Before reservation the effect is the opposite. A release, a
new generation, a policy activation, an objecting review, or a revocation
invalidates the operation. The next step or reservation attempt sees the
change (R-LAND-3, R-LAND-6).

**R-LAND-10.** What lands is what was checked. The commit published to main
is the integration commit that every check on the operation bound, or a
commit with an identical tree when a check carried under R-CARRY-6.

**R-LAND-11.** Batching several disjoint ready operations into one
integration is an optional extension. If built, it keeps every rule in this
section.

## 13. Publication and recovery (R-PUB)

**R-PUB-1.** A room has one publication slot. At most one landing operation
is in `publishing` or `unresolved` at any time.

**R-PUB-2.** The slot stays held from reservation until the publication has
a confirmed terminal outcome: `landed`, or `aborted` (R-REV-5). Elapsed
time, token expiry and sandbox termination never release it. None of them
proves that a push did not happen.

**R-PUB-3.** Each push attempt uses a freshly minted canonical write token,
with the shortest lifetime Artifacts allows (60 seconds). The token goes only
to the publisher sandbox, for that one push. The room revokes it after the
attempt. No member ever holds a write token for the canonical repository.

**R-PUB-4.** The publisher pushes the integration commit to `main` with
`--force-with-lease=main:<expectedMain>`.

**R-PUB-5.** Complete forward. When a push times out, fails without a clear
answer, or the room restarts during publication, the room pushes the same
integration commit again, with the same lease. Before it writes any
receipt, it reads main back:

| Main is | Outcome |
|---|---|
| The integration | **Landed.** Record the `land-outcome` receipt, apply the lane's `landed` effect, release the slot |
| `expectedMain` | **Unresolved.** Keep the slot. Retry forward with backoff. Show admins "publication unresolved since …" |
| Anything else | **Unexpected writer.** Keep the slot. Stop pushing. Flag it for admins |

The first time an operation becomes unresolved, the room records a
`publication-unresolved` event.

**R-PUB-6.** The room never abandons a reserved publication. The slot is
released without a landing only on a confirmed terminal outcome of "did not
and cannot land". No such evidence is established today. So in version 1
the only automated resolution is completing forward. Admins can always see
the state.

**R-PUB-7.** Crash recovery. On restart, the first work the room's alarm
schedules is to resolve a held slot by completing forward. No reservation is
made until the slot is free. Acts are still admitted meanwhile, with `after`
(R-LAND-8).

**R-PUB-8.** Each publication has exactly one `landed` or `aborted`
receipt. No later operation reserves while an earlier one holds the slot.

**R-PUB-9.** A landing whose integration changes `.artroom/policy.json` or
`.artroom/checkers/**` is followed, at the next seq, by a
`policy-activated` event (R-POL-9).

## 14. Revocation and the emergency rule (R-REV)

**R-REV-1. Evidence validity.** A verdict or check counts as evidence only
if all of these hold:
- it was admitted, and its recorded authority qualified for the obligation
  at admission;
- neither its signing key, nor (if delegated) the grantor key, has been
  revoked as `compromised` at any time up to now;
- if the policy sets `retiredEvidence: "reopens"`, neither key has been
  revoked as `retired`.

The signer does not need to be authorized today. A later retirement (under
the default policy), removal, role change, or the expiry of a delegation
does not reopen it.

**R-REV-2. Retired.** After a `retired` revocation, the key's new acts are
refused (R-ADM-4). Its earlier verdicts and checks stay valid, unless the
policy says `retiredEvidence: "reopens"`.

**R-REV-3. Compromised.** After a `compromised` revocation:
- the key's earlier verdicts and checks stop counting as evidence. So do
  acts under delegations granted by that key or to it;
- every delegation granted by or to that key is revoked;
- the obligations they met reopen. The roster receipt lists them in
  `invalidated`;
- a landing operation that depends on them, and is not yet reserved, goes
  to `retryable` with `evidence-invalid`.

Policy can make retirement stricter. It can never make a compromised key's
evidence count.

**R-REV-4.** An expired delegation does not invalidate evidence admitted
while it was valid. It only stops new admissions.

**R-REV-5. The one emergency rule after reservation.** A `compromised`
revocation of a key that is evidence for the reserved operation, or of the
land initiator's key, or of a grantor key behind either, triggers a recorded
best-effort abort attempt:
1. the room stops pushing the publication forward;
2. the room revokes the publication token;
3. the room records an `abort-attempt` event.

The room keeps reading main back, with backoff. The outcome is decided by
what actually happens:

| What happens | Outcome |
|---|---|
| Main equals the integration | `landed`. The room opens a revert lane (R-REV-6) and puts it in the admins' attention queue |
| Termination without publication is established (R-PUB-6) | `aborted` |
| Neither | `unresolved`, slot held, visible to admins, until one of the above is confirmed |

The outcome is never guessed.

**R-REV-6.** A revert lane is an unheld lane that the room opens with a
`revert-lane` system event. Its scope is the landed change's paths. It
appears in the admins' attention queue. Any member may take it over.

**R-REV-7.** Any other act after reservation follows the reserved landing
(R-LAND-8). That includes a `retired` revocation.

**R-REV-8.** A `compromised` revocation whose key was evidence for
landings that have already completed puts each such landing in the admins'
attention queue as `evidence-invalidated`. It does not change main.

## 15. Admins and the policy boundary (R-ADMIN)

**R-ADMIN-1.** A proposal with any changed path matching `.artroom/**`
gets the obligation `obl_admin-approval`. It is met by an approval from a
member whose role is `admin`, judged under the active policy, whatever that
policy says. Policy cannot remove or weaken it.

**R-ADMIN-2. Sole-admin self-approval.** By default an author cannot meet
`obl_admin-approval` on their own lane. While the room has exactly one
active admin (R-GEN-9), that admin may:
- the approval carries the flag `sole-admin-self-approval`;
- the UI shows the flag on the proposal and in the policy history;
- the exception applies only while there is exactly one active admin. At
  reservation, a flagged approval counts only if that is still true.
  Otherwise the obligation reopens.

**R-ADMIN-3. The fixed recovery boundary.** Admins can always change the
roster and the policy:
- policy `refuse` rules are not evaluated for `roster` acts signed by an
  admin or the recovery key;
- for a proposal whose changed paths all match `.artroom/**` and whose
  `obl_admin-approval` is met, the room does not evaluate `refuse`,
  `require` or `land` rules. Only platform rules apply.

**R-ADMIN-4.** The recovery key can always restore an admin (R-GEN-3).

## 16. Policy (R-POL)

**R-POL-1.** Policy is `.artroom/policy.json` on main, as of the active
version. It must match `PolicyDocument`, and every expression must pass the
profile's admission checks (R-EVAL-1). A proposal whose head has an invalid
policy file or checker configuration is refused with `policy-invalid`. So an
invalid policy can never activate.

**R-POL-2. `refuse`.** Evaluated when an act of a listed kind arrives,
before it is recorded. If the expression is true, the act is refused, and
recorded, with the rule's ID, reason and fix.

**R-POL-3. `require`.** Evaluated on `propose` and at activation. It
creates an obligation, which names who may fulfil it (R-OBL-5).

**R-POL-4. `carry`.** Evaluated on a new generation and at activation, for
evidence that meets the platform's carry conditions. It can only narrow
(R-CARRY-4).

**R-POL-5. `notify`.** Evaluated after the act is recorded. It puts the act
in the targets' attention queues with the rule's `why`. It never changes the
act. An error is recorded as a decision, and nobody is notified.

**R-POL-6. `land`.** Evaluated on `land` and at `ready`. Reservation
re-checks its input digest (R-LAND-7). If `block` is true, the landing is
refused, or the operation fails, with the rule's ID and fix.

**R-POL-7. Default policy.** With no policy file the room uses:
- no owners and no `require` rules;
- carry defaults: verdicts and checks carry, the platform's global inputs,
  no default `dependsOn`;
- lanes `by-scope`;
- `retiredEvidence: "counts"`;
- the land rule `objection-open`. It blocks while any qualifying reviewer's
  latest verdict on this generation, reviewed here or carried, is `object`.

The `policy()` helper includes `objection-open` unless the policy defines
its own rule with that ID.

**R-POL-8. Lanes.** With `lanes("exclusive")`, a claim that may overlap a
held lane (R-PATH-3) is refused with `scope-overlap`. With `by-scope`,
overlaps are admitted and shown.

**R-POL-9. Activation.** A policy activates through a `policy-activated`
system event, at the seq right after the landing that changed it (R-PUB-9).
The initial policy activates at seq 1, from main at import, or from the
default. From activation:
- obligations on open proposals are recomputed;
- carried evidence is re-evaluated;
- landing operations prepared under the old version go back to
  `preparing` (R-LAND-5).

**R-POL-10.** Policy cannot override sections 7 to 11 of the plan, or the
rules in this document marked as platform rules. In particular, policy
cannot:
- authorize a review or check that R-OBL forbids;
- carry evidence that R-CARRY forbids;
- make a compromised key's evidence count;
- remove a global input or `obl_admin-approval`;
- change who may sign which kind.

**R-POL-11.** Every decision records the rule ID, the kind, the policy
version, the profile and `jsonata` version, the digest of its input, the
outcome and the budget used.

## 17. The policy evaluator (R-EVAL)

**R-EVAL-1.** The profile `artroom-jsonata-v1` is atseq's
`atseq-jsonata-v1` expression profile, with its admitted node types,
operators and function allowlist:

```
abs ceil floor round count sum min max length exists not lookup append merge contains substring
```

Nothing uses the clock, randomness or I/O. User functions, regular
expressions, `$eval`, wildcards, descendant traversal and transforms are not
admitted.

**R-EVAL-2.** Budgets, unchanged from atseq:

| Bound | Value |
|---|---|
| Program | 64 KiB |
| Input, output | 256 KiB each |
| JSON container depth | 32 |
| AST size, depth | 4,096 containers, 64 |
| Evaluation nesting | 64 |
| Evaluator visits | 100,000 |
| Intermediate sequence length | 16,384 |
| One intermediate result | 1 MiB |
| Cumulative inspected bytes | 16 MiB |

**R-EVAL-3.** Each kind's expression receives `RuleInput` for that kind:
plain JSON with safe integers. `refuse`, `land`'s `block`, `carry`'s
`allow`, and the optional `when` must return a boolean. Any other result is
`policy-type-error`.

**R-EVAL-4.** The room pins the `jsonata` version and the profile version,
and records both with every decision. A dependency update needs a new
profile version, or an independently reviewed claim that the old profile is
unchanged, backed by the full conformance corpus.

**R-EVAL-5. Deterministic refusal versus runtime failure.**
- **A deterministic refusal** is `policy-budget-exceeded` or
  `policy-type-error`. It is a recorded domain outcome, and replay gives the
  same result:
  - for `refuse`, `require` and `land`, the act is refused and recorded;
  - for `carry`, the evidence does not carry;
  - for `notify`, nobody is notified.
- **A runtime failure** is a Worker CPU limit, running out of memory, or an
  engine fault. It is infrastructure. Nothing is recorded, and the caller
  receives a retryable `ArtroomError` `policy-runtime`. The Worker CPU limit
  is a backstop, not the budget.

**R-EVAL-6.** Replaying a recorded decision, with its retained input, the
same policy version and the same profile, gives the same outcome.

**R-EVAL-7.** Integrity checks use WebCrypto, not atseq's Node-only
adapter.

## 18. Execution isolation (R-EXEC)

**R-EXEC-1.** There are two kinds of sandbox: the publisher, and check
runners. They never share a container, a filesystem or a cache.

**R-EXEC-2.** The publisher sandbox runs git only. It:
- runs with `core.hooksPath=/dev/null`;
- configures no clean, smudge, diff or merge drivers, and no `fsmonitor`;
- executes nothing from the repository;
- holds a canonical write token only during one push (R-PUB-3).

**R-EXEC-3.** A check runner runs untrusted code in its own sandbox. It
receives a read-only token for `readUrl` only. It never receives a write
token or any signing key. The process environment holds only `gitAuthEnv`
for git, plus `PATH`.

**R-EXEC-4.** Before it runs anything, the runner fetches the exact commit,
checks it out, and confirms that `HEAD` equals the job's integration. If it
does not, the outcome is `ok: false`.

**R-EXEC-5.** The checker service signs the `check` act outside the
sandbox. Output from the sandbox is data, truncated to 16 KiB.

**R-EXEC-6.** The runner wrapper takes argument arrays, never a shell
string. Untrusted values are separate arguments.

**R-EXEC-7.** A filtered snapshot is delivered into an isolated workspace
with no canonical remote, token or unfiltered objects (R-CARRY-9). The
Lane G tests attempt access to excluded data.

## 19. Secrets (R-SEC)

**R-SEC-1.** Before an act is recorded or published, the room scans every
string in its body. The scan uses common credential formats and an entropy
check on long tokens. Examples of formats: cloud provider keys, GitHub,
Slack and Cloudflare tokens, private key blocks, JWTs, and `password=`
assignments. The conformance corpus fixes the exact detectors and
thresholds.

**R-SEC-2.** A detected secret refuses the act with `secret-detected`. The
fix is "remove the secret; rotate it if it was shared elsewhere". The act is
not recorded. The body is not kept or logged anywhere, including server
logs.

**R-SEC-3.** The refusal's reason names the field path and the detector. It
never repeats the secret.

**R-SEC-4.** Fields with a fixed, validated format skip the entropy check
only. These are `Sha`, `Digest`, key IDs, entry IDs, signatures,
idempotency keys and nonces. They still get the format detectors. A `join`
act's `secret` is exempt: it is consumed in the same entry (R-GEN-6).

**R-SEC-5.** These are never recorded or published: workspace tokens,
publication tokens, bearer tokens, session tokens, `gitAuthEnv`, and
private keys.

**R-SEC-6.** Detection is incomplete. A secret it misses becomes part of a
signed, published, clonable log, and cannot be removed from it. The only
remedy is to rotate the credential. The README says so.

## 20. The log format (R-LOG)

**R-LOG-1.** The format is `artroom-log-v1`. Entries are numbered from 0
with no gaps.

**R-LOG-2.** Each entry's `hash` is the SHA-256 digest of the canonical
bytes of `{ format, seq, prev, at, entry }`. `prev` is the previous entry's
hash; for genesis it is `null`.

**R-LOG-3.** An entry is one of:
- `act`: an accepted act, its signed envelope and its receipt;
- `refusal`: a recorded refusal (R-ADM-8), its signed envelope and its
  receipt;
- `system`: a system event.

**R-LOG-4.** The room signs every entry: `roomSig` is the room key's
signature over the entry's `hash` (R-SIG-1). System events have no other
signature, except genesis, which also carries the first admin's.

**R-LOG-5.** System events are:

| Event | Records |
|---|---|
| `genesis` | The room's founding facts (R-GEN-1) |
| `lease-expired` | A lease expiry (R-LANE-8) |
| `policy-activated` | A policy activation (R-POL-9) |
| `land-reserved` | A reservation (R-LAND-7) |
| `abort-attempt` | An abort attempt (R-REV-5) |
| `publication-unresolved` | The first time a publication becomes unresolved (R-PUB-5) |
| `land-outcome` | `landed`, `aborted`, `retryable` or `failed` |
| `revert-lane` | A revert lane opened by the room (R-REV-6) |
| `checkpoint` | A confirmed publication of the log (R-LOG-8) |

**R-LOG-6.** A receipt records the authority used, every policy decision,
the effects, the flags and, while a slot is held, `after`.

**R-LOG-7.** Retained policy inputs. Every decision's input is kept as
canonical JSON under its digest. Every activated policy document and checker
configuration is kept the same way. Both are published with the log.

**R-LOG-8.** Publication of the log:
- the room publishes in batches;
- each batch is a commit on `refs/artroom/log` holding the prefix through
  seq N, and a checkpoint signed by the room key;
- the ref only moves forward;
- after the push is confirmed, the room records a `checkpoint` system event
  and sets `publishedThrough` to N;
- a checkpoint event is itself published in a later batch.

**R-LOG-9.** The tree of each log commit:

| Path | Content |
|---|---|
| `artroom-log/v1/genesis.json` | The genesis object |
| `artroom-log/v1/segments/<first>.jsonl` | Entries `first` to `first + 999`, one canonical entry per line; `first` is 12 decimal digits, zero-padded |
| `artroom-log/v1/inputs/<hex>.json` | Retained policy inputs |
| `artroom-log/v1/policies/<hex>.json` | Activated policy documents and checker configurations |
| `artroom-log/v1/checkpoint.json` | The checkpoint |

A full segment never changes. Only the last segment grows.

**R-LOG-10.** `artroom verify <remote>` checks, offline, the prefix up to
the checkpoint:
- the room ID from genesis;
- the hash chain and every `ActId`;
- every signature: envelopes by their actors, entries and the checkpoint by
  the room key;
- that each act's authority was valid at its admission, by replaying the
  roster from earlier entries;
- every retained input's digest;
- idempotency uniqueness;
- that full segments match earlier log commits byte for byte.

It proves the integrity of the published prefix. It cannot prove that acts
after `publishedThrough` exist or do not exist.

**R-LOG-11.** Every log page and update states `publishedThrough`. Log
pages also state `head`. The publication lag is `head − publishedThrough`.

## 21. The API on every transport (R-API)

**R-API-1. Refusals are values; failures are exceptions.**

| Transport | Refusal | `ArtroomError` |
|---|---|---|
| RPC (service binding) | Returned value with `refused: true` | Thrown object with `name: "ArtroomError"` |
| HTTPS | Status 409, body `Refusal` | Status from the table below, body `ArtroomError` |
| MCP | Tool result, `isError: false`, structured content `Refusal` | Tool result, `isError: true`, structured content `ArtroomError` |

| `ArtroomError.code` | HTTPS status | Retryable |
|---|---|---|
| `bad-request` | 400 | No |
| `unauthenticated` | 401 | No |
| `forbidden` | 403 | No |
| `not-found` | 404 | No |
| `payload-too-large` | 413 | No |
| `rate-limited` | 429 | Yes |
| `internal` | 500 | Yes |
| `unavailable`, `policy-runtime` | 503 | Yes |
| `timeout` | 504 | Yes |

Clients test with `isRefusal()` and `isArtroomError()`, never with
`instanceof`.

**R-API-2.** A handle holds no server state. `using room = …` releases only
the client-side stub. A missed dispose leaks nothing.

**R-API-3.** HTTPS routes are the keys of `HttpRoutes`. Acts are `POST
/v1/rooms/:room/acts` with a `SignedEnvelope`. Reads use a session or
bearer token in `Authorization: Bearer`.

**R-API-4.** Lane-changing methods take a `Held`: the lane and its lease. A
`Claim` record, or a held `Lane`, is one. Reviews and landings take the
proposal's `head`, so the signer acts on exactly the head they saw. A
`Proposal` record supplies it.

**R-API-5.** `wait` resolves when the operation reaches one of `until`. It
waits at most `timeoutMs`: default 30 seconds, maximum 300. Then it throws
`timeout`, and the operation is unchanged.

**R-API-6.** Every page has a `cursor`, even when `more` is false. Passing
it back resumes exactly after the last item returned. Cursors are opaque and
stay valid for at least 24 hours.

**R-API-7.** The log is returned in ascending `seq`. `log({ after })`
returns entries with a greater seq.

**R-API-8.** Live updates, `subscribe(cursor)`:
- RPC: a stream of `Update`;
- HTTPS: a long poll that returns the next `Update`, or an empty one after
  `waitMs`;
- browser: a hibernating WebSocket (`watch`);
- MCP: `attention` with the cursor.

It is not a cross-transport async iterator.

**R-API-9.** The ten MCP tools are `claim`, `workspace`, `renew`,
`release`, `propose`, `note`, `review`, `land`, `attention` and `explain`.
Each calls the `RoomApi` method of the same name:
- `McpHeld` carries `lane` and `lease`, and fencing is the same as for the
  method;
- `workspace` waits up to `waitMs` (default 20 seconds) for `ready` or
  `failed`;
- `land` waits up to `waitMs` (default 0);
- every act tool accepts `idempotencyKey`.

A coding agent needs only the MCP URL and `git`.

**R-API-10.** Every record a method returns can be derived from the log and
the room's operation state. No method returns a fact the log contradicts.

## 22. Open points

These are details the plan left open. For each, this document takes the
safest reading. Each needs confirmation by review.

1. **Teams live in the roster.** The plan's owners, such as `@security`,
   need a principal. Teams are set by the admin-only `team` roster op, so
   policy cannot change who is in a team (R-GEN-7).
2. **Which refusals are recorded.** The plan calls deterministic policy
   refusals "recorded domain outcomes". This document records refusals from
   lane, invariant and policy checks. It never records refusals that come
   before authority, schema and secret checks pass (R-ADM-8). That keeps
   unauthorized parties and secrets out of the log.
3. **Workspace and reads are signed, unrecorded requests** (R-CRED-5). The
   plan lists them as operations, not acts. Read sessions are this
   document's addition.
4. **Preview has a `failed` state.** The plan's preview states are
   `pending | clean | conflict`. A preview can fail on Artifacts errors or
   diff bounds, so `failed` is added, carrying the error.
5. **`unresolved` is a landing state.** The plan describes it as an outcome
   of publication. Here it is a state that holds the slot, with a read-back
   detail that also covers "unexpected writer".
6. **`after` on every act while the slot is held** (R-LAND-8), not only on
   acts that touch the reserved lane. This is simpler to test and shows the
   order in every case.
7. **`retryable` is terminal for the operation.** Main moving and policy
   activation re-prepare automatically (R-LAND-5). The plan lists "a check
   reran" as a cause of `retryable`. Here a rerun of checks is part of
   preparation, and only a reopened review obligation makes the operation
   `retryable`.
8. **The recovery key.** Only it can replace itself. What happens if the
   recovery key itself is compromised is not defined. The room's founder
   should keep it offline.
9. **Size limits and diff bounds** (R-SIG-6, R-PROP-6) are initial values.
   Lane B sets the diff bound from measurements.
10. **Checker configuration comes from the active policy**, never from the
    proposal (R-CARRY-7). This follows "neither a proposal nor its author
    can narrow it".
11. **Leases are fenced by a `lease` field in the body.** The plan says that
    an act from a previous holder "carries the old lease generation". So
    every holder act carries it. The handle takes a `Held`, so callers do
    not handle it by hand.
12. **Reviews and landings name the head** as well as the generation. A
    mismatch is refused (`head-mismatch`). This binds a signature to exactly
    what the signer saw.
13. **How policy opens a revert lane after a late objection.** The plan says
    that policy "can" do this. None of the five rule kinds opens lanes. For
    now a `notify` rule can put the late objection in the admins' queue.
    Opening the lane automatically needs a decision.
14. **Sole-admin self-approval after a second admin joins.** Here a flagged
    approval counts at reservation only while the room still has exactly
    one active admin (R-ADMIN-2).
15. **SHA-1 only.** `Sha` is 40 hex characters. SHA-256 repositories need a
    format decision if Artifacts supports them.
16. **No admin override for an unresolved publication.** The plan says
    admins "can always see the state and act on it". The contract has no
    act that releases a held slot without terminal evidence, because that
    would break R-PUB-2. If one is needed, it must record what the admin
    attests.
17. **Restart and admission.** "On restart, an alarm resolves any held slot
    before anything else" is read as "before any other landing work". Acts
    are still admitted, with `after`, so an Artifacts outage cannot freeze
    the room (R-PUB-7).
18. **Default `allowSelf` scopes.** "Documentation scopes" are fixed as
    `docs/**` and `**/*.md` (R-OBL-2).
19. **Retired evidence is configurable, compromised is not.** The plan
    calls revoked-key evidence "a policy decision with these defaults".
    Policy may only be stricter: `retiredEvidence: "reopens"`.
20. **Who counts as the author** for self-review: the proposer of that
    generation, and the current holder.
21. **MCP JSON Schemas** are written by lane E as `McpToolDescriptor`
    values and tested against `McpTools`. This package exports types only.
22. **Package scope.** `@generalbusiness/artroom-*` is a placeholder. To
    rename, change the `name` in `packages/contract/package.json` and the
    imports in `packages/contract/examples/`.
23. **Values declared, not implemented.** `connect()`, `Checker` and the
    policy helpers are declared in the contract and implemented by lanes E,
    G and C or D. They are exported from the subpaths `/client`, `/checker`
    and `/policy`, so the package's main entry has no missing values at run
    time.

## 23. Acceptance cases and the rules they test

| Plan case | Rules |
|---|---|
| Approval with `dependsOn: src/lib/authz/**`, helper changes | R-CARRY-2, R-CARRY-5 |
| No `dependsOn`, room default lists `src/lib/**` | R-CARRY-2 |
| No declaration and no default | R-CARRY-1, R-CARRY-11 |
| `package-lock.json` changes | R-CARRY-3 |
| `.artroom/policy.json` changes | R-CARRY-3, R-ADMIN-1 |
| New failing test under `tests/`, `src/**` unchanged | R-CARRY-6 |
| A file read by tests but missing from a scoped checker's inputs | R-CARRY-9, R-EXEC-7 |
| Crash before push, and after push before receipt | R-PUB-5, R-PUB-7 |
| Two operations preparing in parallel | R-LAND-4, R-LAND-5, R-LAND-10 |
| Release, new generation, policy activation during preparation | R-LAND-6, R-LAND-9, R-POL-9 |
| Paused push; release, new generation, objection, `retired` revocation | R-LAND-8, R-REV-7 |
| Paused push; `compromised` revocation of evidence | R-REV-5, R-REV-6 |
| Delayed authenticated push after token expiry and a forward retry | R-PUB-2, R-PUB-5, R-PUB-8 |
| The forward retry itself fails | R-PUB-5, R-PUB-6 |
| Token revocation or expiry during an in-flight push | R-PUB-2, R-PUB-6 |
| A lease race on publication | R-PUB-1, R-PUB-4 |
| Pre-signed act after its key's revocation | R-ADM-4 |
| Act under an expired delegation | R-ADM-4 |
| Byte-identical replay after revocation | R-IDEM-2 |
| Compromised reviewer's approval | R-REV-3 |
| Reviewer retired after their review | R-REV-1, R-REV-2 |
| Sole admin changes policy | R-ADMIN-2 |
| Locked-out admin restored | R-GEN-3, R-ADMIN-4 |
