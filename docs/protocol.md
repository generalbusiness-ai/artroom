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
7. Credentials per transport (R-CRED, R-WS)
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
24. Review 45431cd9
25. Review d12b67d6
26. Policy amendment (81c31bc7)
27. Amendment 2 (82a0b25a): integration gaps from lanes A, E and L
28. Amendment 3 (66d6fb14): `refuse` rules before the claim check

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
Envelopes carry the room ID, never the room name. A name is unique only on
one deployment (R-GEN-11); an ID is unique everywhere.

**R-ID-4.** A key ID is `key_` followed by the unpadded base64url encoding of
the 32-byte Ed25519 public key. A signature can be checked from the key ID
alone.

**R-ID-5.** Members and teams share one handle namespace. A handle is never
reused in a room, even after removal.

**R-ID-6.** A `Sha` is a 40-character lowercase hex git object name. Version
1 supports SHA-1 repositories only (section 22, point 15).

**R-ID-7.** A digest of JSON is the SHA-256 of its canonical bytes (R-SIG-3).
A digest of a file is the SHA-256 of its raw bytes.

**R-ID-8.** Operation IDs come from sequence numbers, never from hashes, so
an entry can name the operation it creates:
- a landing operation is `op_land_<seq>`, from its `land` act's seq;
- a preview operation is `op_preview_<seq>`, from its `propose` act's seq;
- a workspace operation is `op_ws_<laneSeq>_<leaseGeneration>`.

An operation ID never changes during the operation's life. Operations are
not log entries.

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
| `artroom-onboarding-v1` | An onboarding grant (R-GEN-12) | An operator key the deployment trusts |

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
- the room name and the canonical repository's identity (R-GEN-12), and,
  for an imported repository, the operator's onboarding grant;
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
- The invitation names no key. It binds whichever key redeems it, at
  redemption (R-ADM-3, case (c)).
- `join` is signed by the new key and reveals the secret. It is admitted
  only if the secret's hash matches and the invitation is unexpired and
  unused at admission. The same entry consumes it. For a room-custody
  invitation the room makes the key and signs the `join` (R-CRED-3).
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

**R-GEN-10. Founding.** A room is founded in two steps. Neither step needs
a room credential. The founder proves control of the first admin key by
signing the genesis. Authority over the canonical repository comes from
R-GEN-12, never from the founder's choice.

1. **Draft.** `POST /v1/rooms` with a `RoomDraft`, or `ArtroomFounder.draft`
   over RPC. The body names the room, the repository source (R-GEN-12),
   the first admin's handle and key, and the recovery key. The deployment
   validates them, checks an import's grant as `found` will, makes the room
   key, and returns a `DraftedRoom`: the genesis object to sign, and a
   `draft` value from which the deployment can recover the room key and,
   for a public founding, the repository identity. The `draft` value is not
   a secret. The room key's private half never leaves the deployment.
   `draft` creates, reads and binds nothing.
2. **Found.** `POST /v1/rooms/found` with a `Founding`, or
   `ArtroomFounder.found`. The body is the genesis, the first admin key's
   signature over it (`artroom-genesis-v1`, R-SIG-1), and the `draft`
   value. The deployment takes these steps in order. Each uses only the
   body and the deployment's own configuration, never the draft's earlier
   answer:
   1. validates every genesis field as `draft` does, including that
      `format` is `artroom-log-v1` and that `profile` names the profile and
      `jsonata` version the deployment runs (R-EVAL-4);
   2. checks that the genesis names the room key that the `draft` value
      recovers;
   3. verifies the first admin's signature;
   4. authorizes the repository (R-GEN-12);
   5. binds the repository, the room ID and the name together in the
      registry (R-GEN-13);
   6. only then creates the repository (for `new`) or reads it (for
      `import`), seals the genesis as entry 0 and the initial
      `policy-activated` event as entry 1 (R-GEN-1, R-POL-9).

   It returns the room ID: `{ room }` over HTTPS, the ID itself over RPC.

A failure in steps 1 to 5 throws `bad-request`, `unauthenticated` or
`forbidden`. It reads no repository contents, mints no credential, seals
nothing and binds nothing. A failure in step 6 throws `unavailable`, and the
registry binding stays. Repeating `found` with the same genesis then
completes the founding, or returns the same room ID if it was already
complete, so a founder whose response was lost can retry.

**R-GEN-11. Room names.**
- A room name is 1 to 128 characters and never has the form of a room ID
  (R-ID-3). `draft` and `found` refuse any other name with `bad-request`.
  So a string in the form of a room ID, in a route's `:room` or in
  `ArtroomService.room()`, is always an ID.
- On one deployment a name names at most one room. It is bound with the
  room's repository, in one registry binding (R-GEN-13), and never bound
  again to another room.
- A name is a convenience for people. Envelopes, requests and invitation
  links carry the room ID (R-ID-3, R-CRED-11). A client that has only a name
  finds the ID with R-API-11.

**R-GEN-12. The canonical repository.** A room's repository is named in
the genesis by its identity (`RepoIdentity`): the storage system's stable
identifier for one repository, such that two references to the same
repository always give the same identity. A name, alias or URL is not an
identity, and is refused with `bad-request`. The `RoomDraft` chooses one of
two sources:
- **`new`: public founding.** The deployment allocates a fresh, empty,
  isolated repository. Its identity is derived from the `draft` value with
  a deployment secret, inside a namespace the deployment reserves for
  public founding. So no caller can choose it, and it never names a
  repository that existed before. At `found` the deployment derives it
  again and refuses, with `forbidden`, a genesis that names any other
  repository or carries `onboarding`. The repository is created at step 6,
  after the registry binding, so an existing repository at that identity
  can only be this founding's own, from an earlier attempt.
- **`import`: an existing repository.** The draft carries a
  `SignedOnboardingGrant`, and the genesis carries it as `onboarding`, so
  the first admin's signature covers it. At `found` the deployment checks
  that:
  - the grant is signed under `artroom-onboarding-v1` by an operator key in
    the deployment's configuration;
  - `grant.repo` equals `genesis.repo`, is an identity, and is not in the
    namespace reserved for public founding;
  - `grant.admin` equals `genesis.admin.key`;
  - `notAfter` has not passed, unless the registry already binds this
    repository to this room ID (a retry).

  Otherwise it refuses with `forbidden`. How the operator confirms that
  the requester may import the repository is outside this contract.

The deployment reads a repository's contents, and mints a credential for
it, only for the room that the registry binds to it (R-GEN-13, R-PUB-10).

**R-GEN-13. The registry.** Each deployment has one registry. It holds one
binding per repository identity: the room ID and the room's name. This
binding is the source of the room's identity and of its publication
authority (R-PUB-10). The name binding is part of it.
- `found` binds the repository, the room ID and the name in one atomic
  step, after it authorizes the repository (R-GEN-12) and before it reads
  the repository or seals any entry.
- If the registry already holds exactly this binding (the same
  repository, room ID and name), the step succeeds, and founding continues
  forward. That covers a retry after a failure at step 6.
- If the repository or the name is bound in any other way, `found` throws
  `forbidden` and binds nothing. So two
  foundings of one repository, under different names, keys or grants,
  never both proceed: the second gets no sequencer, no publication slot and
  no credential.
- A binding is never removed or moved to another room. Moving a
  repository to a new room is a separate, authorized operation that this
  version does not define (section 22, point 37).

## 5. Admission and authority (R-ADM)

**R-ADM-1.** Admission order. The room handles each envelope in this order.
The first failing step decides the outcome.

| Step | Check | On failure | Recorded? |
|---|---|---|---|
| 1 | Parse, version, room ID, size of the whole envelope | `ArtroomError` `bad-request`, `unauthenticated` or `payload-too-large` | No |
| 2 | Signature (R-SIG-5) | `ArtroomError` `unauthenticated` | No |
| 3 | Idempotency (R-IDEM) | The original result, or refusal `idempotency-mismatch` | No new entry |
| 4 | Authority at admission, by case (R-ADM-3) | Refusal `not-member`, `key-revoked`, `key-in-use`, `delegation-invalid`, `role-forbids`, `admin-required`, `recovery-only` or `invitation-invalid` | No |
| 5 | Body schema and sizes (R-SIG-4, R-SIG-6) | Refusal `invalid-body` or `body-too-large` | No |
| 6 | Secret scan (R-SEC-1) | Refusal `secret-detected` | No |
| 7 | Lane and lease (R-LANE) | Refusal, such as `generation-moved` | Yes |
| 8 | Platform invariants (R-PROP, R-OBL, R-ADMIN). For `propose`, policy `refuse` rules run inside this step: after the head is known and the changed paths are computed and bounded (R-PROP-1, R-PROP-3, R-PROP-6), before the claim check (R-PROP-4) and the remaining invariants | Refusal, such as `outside-claim`, or a `refuse` rule's refusal as in step 9 | Yes |
| 9 | Policy `refuse` rules (for kinds other than `propose`), and `require` on `propose` (R-POL). Skipped on a configuration-recovery lane (R-ADMIN-5) | Refusal with the rule's ID and fix, or `policy-budget-exceeded`, `policy-type-error` | Yes |
| 10 | Seal the entry: content, hash, ID, room signature (R-LOG-2); commit; apply effects | — | Yes |
| 11 | Policy `notify` rules, after the commit (R-LOG-13) | Never refuses; never changes the sealed entry | In a later `notified` entry |

For `propose`, `refuse` rules run before the claim check so that a rule
can name a cause that would otherwise show only as `outside-claim`, such
as jj conflict directories at the root of the tree. Moving them earlier
only adds refusals: every platform invariant is still checked, and a
configuration-recovery lane still skips them. They share the act's budget
meter with the `require` rules that follow (R-EVAL-9).

Admission is the act's place in the room's order. The room clock at
admission is recorded as `at`. It is informational. The envelope carries
no trusted signing time.

**R-ADM-2.** The room takes the actor's identity from the verified
signature. It never takes identity from a field. Over a service binding,
`as` only chooses which of the caller's delegations to sign under.

**R-ADM-3.** Authority is judged at admission, in exactly one of four
cases. The room picks the case from the envelope; no other case's checks
apply. In every case the signing key must not be revoked, for any reason.
The receipt records the case and the authority used (`Authority`, field
`via`).

**(a) Direct member** (no `delegation`, not a `join`, not the recovery key):
- the key is an active key of a member;
- that member is active;
- its role may sign the kind (R-GEN-5), and, for roster ops, R-GEN-4 allows
  it.

**(b) Delegation** (the envelope names a `delegation`):
- the delegation exists, is not revoked, and has not expired by the room
  clock;
- it was granted to the signing key;
- it covers the kind (R-ADM-5) and, for lane acts, the lane;
- the grantor key is an active key of an active member, and that member's
  role may sign the kind.

The signing key need not belong to any member and need not have joined.
Its own membership and role, if any, are not consulted. The act's authority
is the grantor's member, limited to the delegation.

**(c) Join** (a `roster` act whose op is `join`, with no `delegation`):
- the invitation exists, is unused and has not expired by the room clock;
- the SHA-256 of the revealed secret equals the invitation's `secretHash`;
- the signing key is not already a key of any member, and has never been
  revoked. Otherwise the refusal is `key-in-use`;
- the invitation's custody matches the admission path (R-ADM-12).
  Otherwise the refusal is `custody-mismatch`.

The invitation binds the signing key at redemption. It names no key in
advance. The authority is the invited member, with the invitation's role
for a new member or the existing role for an added key.

**(d) Recovery** (the signing key is the room's current recovery key):
- the kind is `roster` and the op is one R-GEN-3 allows;
- there is no `delegation`.

No membership, role or policy check applies. The recovery key is fixed by
genesis, and changed only by `rotate-recovery` signed by itself.

The room key never signs envelopes. It signs only entries and checkpoints.

**R-ADM-4.** An act signed before a revocation but submitted after it is
refused with `key-revoked`. An act under an expired or revoked delegation
is refused with `delegation-invalid`. Neither is recorded.

**R-ADM-5.** A delegation can grant only kinds the grantor's role may sign,
excluding `roster`. A delegation cannot grant a role. A delegated key cannot
re-delegate what it was granted: a `delegate` signed under a delegation is
refused with `delegation-invalid`. A grantor's later loss of a kind, by a
role change, makes the delegation stop covering that kind at the next
admission.

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

**R-ADM-9.** A runtime failure during admission records nothing. Examples
are a Worker CPU limit, running out of memory, a storage error or an engine
fault. The caller receives a retryable `ArtroomError`. The one exception is
`notify`, which runs after the act is committed: a runtime failure there
leaves the act recorded and is retried (R-LOG-13).

**R-ADM-10.** The room answers an act only after its SQLite write commits.

**R-ADM-11.** An accepted act by the lane holder on its lane renews the
lease (R-LANE-5). A recorded refusal does not.

**R-ADM-12. Invitation custody is enforced by the admission path.** There
is one join admission (case (c) of R-ADM-3). Its caller passes the
admission path (`AdmissionPath`), which the room's own code sets. The path
is never read from the envelope, the route, the body, or any other caller
input.

| Path | Who uses it | Invitations it may consume |
|---|---|---|
| `submitted` | `submit` over RPC, `POST /v1/rooms/:room/acts`, and `redeem` with `custody: "client"` | `custody: "client"` only |
| `room-redemption` | Only the room's own handling of `redeem` with `custody: "room"`. It signs the `join` with a key it has just generated and holds | `custody: "room"` only |

- A `join` against a room-custody invitation on the `submitted` path is
  refused with `custody-mismatch`. So is a room redemption of a
  client-custody invitation.
- A refused join records nothing and does not consume the invitation.
- Every other join check still applies on both paths: signature, invitation
  state, secret hash, unbound key, and single consumption.
- The receipt's authority records the invitation's custody (`custody` in
  the `join` case). `artroom verify` checks it equals the invitation's.
  For `room`, the joined key's custody is `room`.

So a room-custody member's key never leaves the room, and that member acts
only through the bounded session delegation of R-CRED-3.

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
| Worker (service binding) | A delegate key in a Worker secret; never joins | The calling Worker, under the delegation chosen by `as` | Session from a signed `session` request under that delegation |

**R-CRED-1. Browser.** The browser makes the key with WebCrypto and redeems
a client-custody invitation by signing a `join` and sending it to `redeem`
(R-CRED-9). It signs each envelope. GitHub sign-in may be
linked later. It never replaces the key.

**R-CRED-2. CLI.** `artroom login <invitation>` makes a key file readable
only by the user, and redeems the invitation. The CLI signs each envelope.

**R-CRED-3. MCP.** An invitation with `custody: "room"` works like this:
1. The caller sends the invitation ID and secret to `redeem` (R-CRED-9),
   with no other credential. The room makes the member's key and keeps it.
   It records the `join`, signed by that key, on the `room-redemption` path
   (case (c) of R-ADM-3, R-ADM-12). No other path can redeem this
   invitation.
2. For each bearer session, the room makes a session key. It records a
   `delegate` act from the member key to the session key, with the
   invitation's `session` kinds and lifetime.
3. It returns the bearer token once. It stores only the token's hash.
4. Every act the room signs for the agent is signed by the session key and
   names the delegation.

Revoking the delegation, or the member's key, ends the bearer session.

**R-CRED-4. Worker.** The Worker holds a delegate key as a secret. The key
is not a member and never joins. A member grants a delegation to that key's
ID, and gives the delegation's ID to the Worker's operator. The Worker signs
each envelope under it, and `as` chooses among its delegations (case (b) of
R-ADM-3). The room never sees the private key.

**R-CRED-5. Unrecorded requests.** Opening a workspace, retrieving its
token and starting a read session are signed request envelopes
(`artroom-request-v1`), not acts. The room judges their authority by the
cases of R-ADM-3, at the moment of each request:
- `workspace` and `workspace-token`: as for `propose` on that lane,
  including holder and lease (R-WS-2);
- `session`: case (a), or case (b) with the session's member being the
  grantor's.

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

**R-CRED-9. Redemption.** `redeem` is the one call that needs no prior
credential. It is `RoomWire.redeem` over RPC and `POST
/v1/rooms/:room/redeem` over HTTPS.
- `custody: "client"`: the body is a signed `join` envelope. The room
  admits it like any act, by case (c) of R-ADM-3, on the `submitted` path.
  It returns `Joined`, with a read session.
- `custody: "room"`: the body is the invitation ID and secret. The room
  makes the member key, and admits the `join` it signs with that key on the
  `room-redemption` path. It then makes a session key, records the
  `delegate`, and returns `Redeemed`, with the bearer token shown once.
- The body's `custody` only selects the branch. The join admission checks
  the invitation's recorded custody against the path (R-ADM-12).
- A refused redemption records nothing and does not consume the invitation.
- Redemption is rate-limited per client address and per invitation.

**R-CRED-10. Bearer sessions.** A bearer token is the credential of one
bearer session: a room-held session key and the delegation the room
recorded for it (R-CRED-3).
- **How it reaches the room.** Over RPC, the MCP endpoint's Worker passes
  the token to `RoomWire.bearerAct` for an act, to `RoomWire.bearerRequest`
  for `workspace` and `workspace-token`, and to `read` and `subscribe` for
  reads. Over HTTPS, the only route that accepts a bearer for acts and
  workspace requests is the MCP endpoint, `POST /v1/rooms/:room/mcp`. Reads
  over HTTPS use the token as `Authorization: Bearer` (R-API-3), or as a
  WebSocket subprotocol (R-API-12).
- **Judging the token.** The room finds the session by the token's hash.
  An unknown or expired token, or a revoked delegation or session key,
  throws `ArtroomError` `unauthenticated`, and nothing is recorded.
- **Signing.** For `bearerAct`, the caller gives only `kind`, `target`,
  `body` and `idempotencyKey` (`BearerAct`). The room sets `v`, its own room
  ID, `actor` (the session key) and `delegation` (the session's), signs the
  envelope with the session key, and admits it on the `submitted` path by
  case (b) of R-ADM-3. The caller cannot choose the actor, the delegation
  or the admission path. Idempotency keys are scoped to the session key
  (R-IDEM-1).
- **Which acts.** A bearer may submit exactly the kinds its delegation
  grants: the invitation's `session` kinds, limited by the member's role
  (R-ADM-5).
- **`roster`: never.** No delegation can grant `roster` (R-ADM-5), so the
  room refuses a bearer's roster act with `delegation-invalid`. A bearer
  can never invite, join, delegate, revoke a key or change a role. Those
  need an admin's own key, or the recovery key (R-GEN-4).
- **`check`: over RPC only.** A bearer whose delegation grants `check` may
  submit it with `bearerAct`. Over HTTPS it cannot, because the MCP tools
  (R-API-9) have no `check` tool. A checker service signs checks with its
  own key, as a Worker under a delegation (R-CRED-4, R-EXEC-5).
- **The HTTPS client.** A handle connected with a bearer token refuses
  `check` and `roster` itself, with `ArtroomError` `forbidden`, before it
  sends anything.
- **Requests.** `bearerRequest` takes `workspace` or `workspace-token`
  (`BearerRequest`). The room judges it as a signed request by the session
  key under its delegation (R-CRED-5, R-WS-2). There is no bearer `session`
  request: the bearer token already is a read credential.
- **Retries and idempotency.** The room judges the bearer token before it
  builds an envelope. While the token is valid, a retry with the same act
  and idempotency key builds the same envelope bytes, so it gets the
  original result (R-IDEM-2). After the token expires, or its delegation or
  session key is revoked, `bearerAct` throws `unauthenticated` even for such
  a retry: there is no envelope to replay. This differs from R-IDEM-2 for a
  signed envelope, which a client keeps and can send again after its key is
  revoked, and which still returns its original result. A bearer client
  that loses a receipt finds the act with `log` or `explain` while its
  token is valid; after that, only a member with its own read session can.

**R-CRED-11. Invitation links.** An invitation travels as one link:

```
https://HOST[/PREFIX]/rooms/ROOM/join#i=INVITATION&s=SECRET
```

- `ROOM` is the room ID, never the name. `INVITATION` is the `invite`
  act's entry ID (R-ID-2). `SECRET` is the invitation secret, unpadded
  base64url, at least 43 characters (32 bytes, R-GEN-6).
- The invitation ID and the secret are only in the fragment, after `#`. A
  browser or HTTP client never sends the fragment in a request, so neither
  value reaches a server log, a proxy, a `Referer` header or a cache. A
  client reads `i` and `s` only from the fragment, and refuses a link
  without them there.
- The API endpoint is the link's origin, followed by `PREFIX` if there is
  one.
- The inviting admin's client builds the link from the `invite` act and
  the secret it generated. The room never builds it, and never sees the
  secret before redemption.
- The link does not state custody. The recipient chooses: a key of their
  own (`join`), or a room-held key for an MCP agent (`redeem`). The wrong
  choice is refused with `custody-mismatch` and consumes nothing (R-ADM-12).
- A page served at the link's path reads the fragment in the browser,
  sends the secret only in the `redeem` body, and removes the fragment from
  the address bar.
- No output repeats the secret, except the inviting admin's own display of
  the link.

### Workspace credentials (R-WS)

**R-WS-1.** A workspace operation's public view (`WorkspaceOp`) never
contains a credential. Any member with a read session may read or wait on
it: state, lane, remote and lease generation. Preview and landing operations
contain no credentials either.

**R-WS-2.** The write token (`WorkspaceGrant`) is returned only by a
`workspace-token` request, and only if, at that request:
- the authority passes R-ADM-3 now: case (a), or case (b) with a delegation
  that covers `propose` on that lane. A revoked key, a removed member, or an
  expired or revoked delegation is refused;
- the authority's member is the lane's current holder (`not-holder`
  otherwise);
- the request's `lease` is the current lease generation (`lease-fenced`
  otherwise);
- the operation is `ready` (`workspace-not-ready` otherwise).

Each retrieval is judged afresh. A grant retrieved earlier gives no right
to a later one.

**R-WS-3.** Each lease generation gets its own token. When the lease ends,
by release, expiry or take-over, the room revokes it. A new holder's token
is minted for the new lease generation.

**R-WS-4.** A workspace token, publication token, bearer token or session
token never appears in:
- the log, receipts, `explain`, attention items or updates;
- operation reads, waits or subscriptions;
- error messages or refusals;
- shared or client caches. Every response that carries a grant has
  `Cache-Control: no-store`, and no read cache stores one;
- server logs. That includes the `Authorization` and
  `Sec-WebSocket-Protocol` request headers (R-API-12).

**R-WS-5.** Over MCP, the `workspace` tool returns `grant` only when the
operation is ready and R-WS-2 holds for the bearer's delegation. Otherwise
`grant` is `null`.

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
claim's entry ID, derived after the entry is sealed. The entry itself does
not contain it (R-LOG-12). The lane starts at generation 0 and lease
generation 1.
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
lane that carries a `lease` is refused with `lease-fenced`. Only an admin
may take over a configuration-recovery lane (R-ADMIN-5).

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
  policy version, as its `policy-activated` event names it;
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
A policy default applies when its key pattern may overlap a pattern of the
reviewed scope (R-PATH-3); its globs are then added to the verdict's
declared `dependsOn` (`CarrySettings.dependsOn`).

**R-CARRY-3.** And no such path is a global input. Global inputs are the
platform's list plus the policy's additions. Policy cannot remove a platform
entry. The platform's list is:

```
# configuration, policy and scripts
.artroom/**   .github/**   scripts/**   **/scripts/**

# manifests and lockfiles
package.json   **/package.json   package-lock.json   **/package-lock.json
npm-shrinkwrap.json   yarn.lock   **/yarn.lock   pnpm-lock.yaml   pnpm-workspace.yaml
bun.lockb   bun.lock   .npmrc   **/.npmrc   .nvmrc   .node-version   .tool-versions

# tests and fixtures
tests/**   **/tests/**   test/**   **/test/**   **/__tests__/**   spec/**
**/*.test.*   **/*.spec.*   **/fixtures/**   **/__fixtures__/**   **/__snapshots__/**

# build and test configuration
tsconfig*.json   **/tsconfig*.json   jsconfig*.json
wrangler.*   **/wrangler.*
vite.config.*   **/vite.config.*   vitest.config.*   **/vitest.config.*   vitest.workspace.*
jest.config.*   **/jest.config.*   playwright.config.*   karma.conf.*   .mocharc*
babel.config.*   .babelrc*   .swcrc   esbuild.*   rollup.config.*   webpack.config.*
turbo.json   nx.json   lerna.json   .env.test
Makefile   **/Makefile   Dockerfile   **/Dockerfile   docker-compose*.yml
```

Because a scoped checker's inputs always include this list (R-CARRY-8), a
new or changed test file always changes the filtered snapshot.

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
3. Evaluate the land rules on the prospective reservation input: the land
   `RuleInput` with `stage: "reservation"`, built from current state as
   reservation will rebuild it. If a rule blocks, the operation fails with
   the rule's ID and fix. If all pass, retain the input's canonical bytes
   and their SHA-256 digest (`RetainedLandInput`), separately from the
   evaluation's replay context, and record the digest as `landInput`.
   Either way, the room records the evaluation's decisions in a
   `land-evaluated` event (R-LOG-5), in the same transaction that stores
   its result. A configuration-recovery lane has no land rules, so no such
   event (R-ADMIN-8).
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
| The land-rule input rebuilt at reservation differs from the retained bytes (R-LAND-7), for example after a new objection | `land-input-changed` |

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
   - the land `RuleInput` with `stage: "reservation"`, rebuilt now from
     current state and canonicalized synchronously, is byte-for-byte equal
     to the retained `RetainedLandInput.canonical`. The comparison is of
     bytes, not of a digest: SHA-256 through WebCrypto is asynchronous, so no
     hashing and no rule evaluation happen inside this transaction. Equal
     bytes mean the land rules already passed on exactly this input.

   On any mismatch, the operation goes to `retryable`. A byte mismatch of
   the land-rule input gives the reason `land-input-changed`. Every other
   mismatch gives the reason that R-LAND-6 lists for its cause.
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

**R-PUB-10. One publisher per repository.** The deployment mints a
canonical write token (R-PUB-3), and pushes to `main` or to
`refs/artroom/log`, only for the room that the registry binds to that
repository (R-GEN-13). So each canonical repository has exactly one
sequencer, one publication slot and one log.

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
policy says `retiredEvidence: "reopens"`. Then such evidence does not carry
(`NotCarried` code `key-retired`), and an obligation it met reopens
(`Reopened` because `key-retired`).

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
`revert-lane` system event. The lane's ID is that event's entry ID, so the
event does not contain it (R-LOG-12). Its scope is the landed change's
paths. It appears in the admins' attention queue. Any member may take it
over.

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
  Otherwise the obligation reopens (`Reopened` because `sole-admin-ended`).

Whether any approval qualified for `obl_admin-approval` is judged by the
authority recorded at its admission (R-REV-1): a later demotion or removal
does not reopen it, and a later promotion cannot upgrade an earlier review.
Only a flagged self-approval depends on the current number of admins.

**R-ADMIN-3. The fixed recovery boundary.** Admins can always change the
roster and the policy, whatever the active policy says:
- policy `refuse` rules are not evaluated for `roster` acts signed by an
  admin or the recovery key;
- an admin can always repair `.artroom/**` through a
  configuration-recovery lane (R-ADMIN-5 to R-ADMIN-9).

On an ordinary lane, policy rules apply as usual, including to proposals
that change `.artroom/**`.

**R-ADMIN-4.** The recovery key can always restore an admin (R-GEN-3).

**R-ADMIN-5. Configuration-recovery lanes.** A claim with
`purpose: "config-recovery"` opens a configuration-recovery lane. On such a
lane:
- every act is signed by an active admin, by case (a) of R-ADM-3: the
  admin's own key, not a delegation. Otherwise `admin-required`;
- the claim's scope must match only paths under `.artroom/**`: every
  pattern starts with `.artroom/`. Otherwise `recovery-scope`;
- policy `refuse`, `require`, `carry` and `land` rules are not evaluated,
  and `lanes("exclusive")` does not apply. Admin authority is judged under
  the current roster;
- every act and record carries the flag `config-recovery`, and the UI shows
  it;
- signatures, schema, secret scanning, lease and generation fencing, and
  every other platform rule still apply.

Only an admin may take over such a lane. Its holder must still be an active
admin at every act; otherwise `admin-required`.

**R-ADMIN-6.** A proposal on a configuration-recovery lane is admitted only
if every changed path, old and new, is under `.artroom/**`. Otherwise
`recovery-scope`. Its head must still pass R-POL-1, so an invalid policy
cannot be proposed. Its only obligation is `obl_admin-approval`.

**R-ADMIN-7.** On a configuration-recovery lane, an admin's review is
admitted without policy rules, and meets `obl_admin-approval` under
R-ADMIN-1 and R-ADMIN-2. With two or more active admins, an admin cannot
approve their own proposal (`self-review`). A sole admin's own approval
carries `sole-admin-self-approval`.

**R-ADMIN-8.** On a configuration-recovery lane, `land` needs only the
platform conditions of R-LAND-1, with `obl_admin-approval` met. The landing
operation has no checks and no land rules (`landInput` is null).
Reservation re-validates everything else in R-LAND-7, including R-ADMIN-2
for a flagged approval and the holder's admin authority.

**R-ADMIN-9.** The proposed policy never judges its own authorization. It
applies only from its `policy-activated` event, after it lands (R-POL-9).
Until then, every act on the lane is judged under the current roster and
the platform rules.

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

**R-POL-5. `notify`.** Evaluated after the act's entry is sealed and
committed. Its decisions are recorded in a later `notified` entry, never in
the act's receipt (R-LOG-13). It puts the act in the targets' attention
queues with the rule's `why`. It never changes the act. A deterministic
error is recorded as a decision, and nobody is notified. Targets are
expanded with a `NotifyDirectory` that the room builds when it queues the
evaluation: active members by role for `role:<role>`, and the proposal's
qualifying reviewers for `reviewers`. `owners` uses the proposal's
`PathOwners`; `holder` the lane's holder. The directory is part of the
replay context (R-EVAL-8), and a retry reuses the same context.

**R-POL-6. `land`.** Evaluated twice, with different `stage` values:
- when the `land` act is admitted, on the input with `stage: "land"`. If
  `block` is true, the act is refused;
- during preparation, before the operation becomes `ready`, on the
  prospective reservation input with `stage: "reservation"` (R-LAND-4). If
  `block` is true, the operation fails.

Reservation rebuilds the `stage: "reservation"` input and compares its
canonical bytes with those retained (R-LAND-7). It never evaluates rules,
and the room never substitutes `stage: "land"` to make inputs match. So a
rule that blocks only at reservation cannot be bypassed.

**R-POL-7. Default policy.** With no policy file the room uses:
- no owners and no `require` rules;
- carry defaults: verdicts and checks carry, the platform's global inputs,
  no default `dependsOn`;
- lanes `by-scope`;
- `retiredEvidence: "counts"`;
- the land rule `objection-open`. It blocks while any qualifying reviewer's
  latest verdict on this generation, reviewed here or carried, is `object`.
  The land `RuleInput`'s `reviews` holds exactly those latest verdicts: one
  entry per qualifying reviewer.

The `policy()` helper includes `objection-open` unless the policy defines
its own rule with that ID.

**R-POL-8. Lanes.** With `lanes("exclusive")`, a claim that may overlap a
held lane (R-PATH-3) is refused with `scope-overlap`. With `by-scope`,
overlaps are admitted and shown.

**R-POL-9. Activation.** A policy activates through a `policy-activated`
system event, at the seq right after the landing that changed it (R-PUB-9).
The initial policy activates at seq 1, from main at import, or from the
default. The event names the policy document's digest and every active
checker configuration, by name and digest. From activation:
- obligations on open proposals are recomputed;
- carried evidence is re-evaluated;
- landing operations prepared under the old version go back to
  `preparing` (R-LAND-5).

Recomputing needs policy evaluation, which is asynchronous, so it happens
after the `policy-activated` event. That event records only what is known
when it is sealed: how many open proposals will be recomputed, and which
landing operations were fenced. Its `recomputed.reopened` is always 0. Then,
for each open proposal, the room seals one `obligations-recomputed` event
(R-LOG-5) with the `require` and `carry` decisions, the proposal's new
obligations, those that were met and are now open, and any deterministic
`require` failure. Until that event is sealed, `land` on that proposal is
refused with `obligation-open`, and a landing operation for it stays in
`preparing`.

If a `require` rule fails deterministically while obligations are
recomputed for an open proposal, the proposal keeps the recorded refusal
(`policy-budget-exceeded` or `policy-type-error`). Its `land` is refused with
that refusal until a new generation is proposed or another policy activates.
It never continues with fewer obligations.

**R-POL-10.** Policy cannot override sections 7 to 11 of the plan, or the
rules in this document marked as platform rules. In particular, policy
cannot:
- authorize a review or check that R-OBL forbids;
- carry evidence that R-CARRY forbids;
- make a compromised key's evidence count;
- remove a global input or `obl_admin-approval`;
- change who may sign which kind.

**R-POL-11.** Every decision records the rule ID, the kind, the policy
version, the profile, `jsonata` and accounting versions (`ProfileStamp`), the
digest of its replay context (R-EVAL-8), the outcome and the budget used.

**R-POL-12. The active policy is supplied, pinned.** For every evaluation the
room supplies the active `PolicyDocument`, immutable, and its version: the ID
of the `policy-activated` event. It retains each activated document by that
version (R-LOG-7), so that any decision can be replayed with the document it
was made under.

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

Added for Artroom, across all evaluations for one act (R-EVAL-9):

| Bound | Value |
|---|---|
| Steps per act | 25,000 |
| Inspected bytes per act | 4 MiB (4,194,304) |

These come from the room-core spike's deployed measurements. The spike
estimated 3 to 9 microseconds of CPU per step on the rules it sampled; that
is an estimate, not a bound for every program or host.

**R-EVAL-3.** Each kind's expression receives `RuleInput` for that kind:
plain JSON with safe integers. No rule input is keyed by a repository path:
ownership is a list of `PathOwners` pairs, so any legal path, including
`constructor`, `prototype`, `__proto__` and `_jsonata_cache`, appears only as a
string value. `refuse`, `land`'s `block`, `carry`'s
`allow`, and the optional `when` must return a boolean. Any other result is
`policy-type-error`.

**R-EVAL-4.** The room pins the `jsonata` version, the profile version and
the accounting version (`artroom-act-budget-v1`), and records all three with
every decision. A dependency update needs a new
profile version, or an independently reviewed claim that the old profile is
unchanged, backed by the full conformance corpus.

**R-EVAL-5. Deterministic refusal versus runtime failure.**
- **A deterministic refusal** is `policy-budget-exceeded` or
  `policy-type-error`. It is a recorded domain outcome, and replay gives the
  same result:
  - for `refuse`, `require` and `land`, the act is refused and recorded;
  - for `carry`, the evidence does not carry;
  - for `notify`, nobody is notified, and the `notified` entry records the
    error.
- **A runtime failure** is a Worker CPU limit, running out of memory, or an
  engine fault. It is infrastructure. During admission nothing is recorded,
  and the caller receives a retryable `ArtroomError` `policy-runtime`. For
  `notify`, which runs after the act is committed, the act stays recorded
  and evaluation is retried (R-LOG-13). The Worker CPU limit is a backstop,
  not the budget.

**R-EVAL-6.** Replaying a recorded decision, with its retained replay
context (R-EVAL-8), the same policy version and the same profile, gives the
same outcome.

**R-EVAL-7.** Integrity checks use WebCrypto, not atseq's Node-only
adapter.

**R-EVAL-8. The replay context.** Each evaluation of a rule kind for one act
is decided by one `ReplayContext`: the rule input; the act budget's
accounting version, limits and the usage already spent (`BudgetState`); the
lane purpose; for `refuse`, whether the recovery key signed; for `carry`, the
platform facts (`CarryFactsRecord`: revocation and check binding); for
`notify`, the `NotifyDirectory`. The evaluator copies and freezes it before
any asynchronous work, and hashes, evaluates and retains that same copy.
`Decision.input` is the SHA-256 digest of its canonical JSON. Nothing
outside the context, the policy and the profile may change an outcome.

**R-EVAL-9. One meter per act, in order.** One act's evaluations (for
example `refuse` then `require` on a propose, or `carry` and `land`) run in
order and share one act meter. Each records the meter's usage when it
starts. Distinct acts may evaluate concurrently, each with its own meter.
Running out of the act budget is `policy-budget-exceeded`. `notify` runs
after the act with its own fresh meter, never the act's.

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

**R-LOG-2.** Sealing an entry follows this order, and no step depends on a
later one:
1. take `seq` (the head plus one) and `prev` (the previous entry's hash;
   `null` for genesis);
2. build the content `{ format, seq, prev, at, entry }` (`EntryContent`),
   with its receipt complete;
3. `hash` is the SHA-256 digest of the content's canonical bytes;
4. the entry ID is `act_<seq>_<hash8>` (R-ID-1);
5. `roomSig` is the room key's signature over `hash` (R-LOG-4);
6. commit to SQLite.

A sealed entry is never rewritten.

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
| `policy-activated` | A policy activation, with its checker configurations (R-POL-9) |
| `obligations-recomputed` | One open proposal's obligations under a newly active policy (R-POL-9) |
| `land-evaluated` | The land rules evaluated during preparation, and their decisions (R-LAND-4) |
| `land-reserved` | A reservation (R-LAND-7) |
| `abort-attempt` | An abort attempt (R-REV-5) |
| `publication-unresolved` | The first time a publication becomes unresolved (R-PUB-5) |
| `land-outcome` | `landed`, `aborted`, `retryable` or `failed` |
| `revert-lane` | A revert lane opened by the room (R-REV-6) |
| `notified` | The `notify` outcome for one earlier entry (R-LOG-13) |
| `checkpoint` | A confirmed publication: through, hash and the log commit (R-LOG-8) |

**R-LOG-6.** A receipt records the authority used, the policy decisions
made before sealing (`refuse`, `require`, `carry`, `land`), the effects,
the flags and, while a slot is held, `after`.

**R-LOG-7.** Retained policy inputs. Every decision's replay context
(R-EVAL-8) is kept as
canonical JSON under its digest. Every activated policy document and checker
configuration is kept the same way. Both are published with the log.

**R-LOG-8.** Publication of the log. Each step uses only what earlier steps
produced:
1. Choose N, the last sealed entry to publish.
2. Build the checkpoint (`Checkpoint`): room, `through: N`, `hash` (entry
   N's hash), time and room key, signed by the room key. It names no git
   commit.
3. Build the tree (R-LOG-9) with the checkpoint in it, then the commit,
   whose parent is the previous log commit.
4. Push it to `refs/artroom/log` with a lease on the previous log commit.
   The ref only moves forward.
5. Read the ref back. When it equals the new commit, seal a `checkpoint`
   system event naming `through`, `hash` and the commit, and set
   `publishedThrough` to N.

The checkpoint event is an entry after N, so it is published by the next
commit, never by the commit it names.

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
- that full segments match earlier log commits byte for byte;
- that the commit's `checkpoint.json` names the last entry in its segments,
  by seq and hash;
- that every `checkpoint` event names an ancestor log commit whose
  checkpoint has the same `through` and `hash`;
- that every `notified` event names an earlier entry, and no entry is
  notified twice;
- that no `opened` effect or `revert-lane` event names a lane (R-LOG-12);
- that every recorded decision replays to the same outcome from its
  retained replay context and policy version (R-EVAL-6). That includes the
  decisions in `notified`, `obligations-recomputed` and `land-evaluated`
  events. An `obligations-recomputed` event names the active policy
  version. A `notified` event's decisions name the version active when the
  notified entry was sealed, not when the `notified` event was (R-LOG-13);
- that a genesis with `onboarding` carries a grant signed under
  `artroom-onboarding-v1` by its `operator` key, whose `repo` and `admin`
  equal the genesis's (R-GEN-12). Verification reports the operator key;
  whether to trust it is the reader's decision;
- that the policy document and every checker configuration named by each
  `policy-activated` event are published (R-LOG-9), and that every accepted
  `check` names in `config` the digest its checker has in the policy
  version active at its admission (R-OBL-3);
- that every `delegate` act grants only kinds its grantor's role could sign
  at its admission, never `roster`, and was not itself signed under a
  delegation (R-ADM-5).

It proves the integrity of the published prefix. It cannot prove that acts
after `publishedThrough` exist or do not exist. R-LOG-15 lists what else it
does not prove.

**R-LOG-11.** Every log page and update states `publishedThrough`. Log
pages also state `head`. The publication lag is `head − publishedThrough`.

**R-LOG-12. No self-reference.** An entry's content never contains its own
hash or its own ID. Where an entry creates something whose ID is the entry's
ID, the content leaves it out, and readers derive it after sealing:
- a new claim's `opened` effect has no `lane`;
- a `revert-lane` event has no `lane`.

An entry may contain its own `seq`, which is fixed before hashing. So
operation IDs derived from `seq` (R-ID-8) may appear. Records returned by
the API add the derived IDs; they are projections, not entry content.

**R-LOG-13. Post-admission outcomes are separate entries.** Anything
decided after an entry is sealed goes in a later entry, never back into
the sealed one:
- `notify` decisions go in one `notified` event per notified entry;
- obligations recomputed after an activation go in one
  `obligations-recomputed` event per proposal (R-POL-9);
- land rules evaluated during preparation go in `land-evaluated` events
  (R-LAND-4);
- landing outcomes, activations, expiries and checkpoints are their own
  system events.

`notify` sees the sealed entry's ID. If `notify` evaluation fails at
runtime, the act stays recorded. The room retries from a durable queue
until it reaches a deterministic outcome, then seals the `notified` event.
Until then, the act's notifications are delayed, and nothing else changes.

The queued evaluation is pinned to the policy version active when the
entry was sealed. The room stores that version with the queued replay
context (R-POL-12, R-EVAL-8), and every retry uses it, even if another
policy activates before the `notified` event is sealed. The `notified`
event's decisions name that version.

### Worked example: a new claim, its notification, and two publications

This shows each value computed from earlier values only. `h(n)` is entry
n's hash.

| Step | Computed | From |
|---|---|---|
| 1 | Entry 0: genesis, `prev: null`; `h(0)` | The genesis object |
| 2 | Entry 1: initial `policy-activated`; `h(1)` | `h(0)` |
| 3 | Entry 2: @alice's claim. Receipt: authority, `refuse` decisions, effect `{ type: "opened", purpose, lease }` with no lane; `h(2)` | `h(1)`, the envelope |
| 4 | Lane ID `L = act_2_<first 8 hex of h(2)>`; the API answers with `L` | `h(2)` |
| 5 | `notify` runs with input `act.id = L` | `L` |
| 6 | Entry 3: `notified { entry: L, decisions, to }`; `h(3)` | `h(2)`, `L` |
| 7 | Checkpoint K1: `through: 3, hash: h(3)`, signed | `h(3)` |
| 8 | Tree T1: genesis, segment lines 0–3, inputs, policies, K1. Commit C1, no parent | K1, entries 0–3 |
| 9 | Push C1, read back. Entry 4: `checkpoint { through: 3, hash: h(3), commit: C1 }`; `h(4)`. `publishedThrough = 3` | C1, `h(3)` |
| 10 | Entries 5–9 are admitted; `h(9)` | `h(4)` onwards |
| 11 | Checkpoint K2: `through: 9, hash: h(9)` | `h(9)` |
| 12 | Tree T2: segment lines 0–9 (lines 0–3 unchanged), K2. Commit C2, parent C1 | K2, entries 0–9, C1 |
| 13 | Push C2, read back. Entry 10: `checkpoint { through: 9, hash: h(9), commit: C2 }`. `publishedThrough = 9` | C2, `h(9)` |

Every arrow points to an earlier step. No value is an input to its own
computation, and no sealed entry or published commit is changed.
`examples/log-construction.ts` builds the same sequence through the types.

**R-LOG-14. Log commits carry no git signature.** A log commit has no
`gpgsig` header, and a verifier never relies on one. Everything in its tree
is bound without it:
- the checkpoint is signed by the room key and names the last entry's
  hash;
- every entry is hash-chained and signed by the room key;
- `genesis.json` must equal entry 0's genesis;
- each retained input, policy document and checker configuration is named
  by the digest of its content.

A git signature would add a second signing key for the room to keep, and
would prove nothing that these do not. Files at other paths carry no
meaning, and verification ignores them.

**R-LOG-15. What verification does not prove.** In version 1,
`artroom verify` re-derives the roster and each act's authority, including
delegation grants, and replays every policy decision (R-LOG-10). It does
not re-derive lanes, leases, obligations or landings. Its report lists
these as not proven, together with acts after `publishedThrough` and the
room clock. Section 22, point 34, gives the reasons.

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
bearer token in `Authorization: Bearer`, or as a WebSocket subprotocol
(R-API-12). Four routes need no credential: `POST /v1/rooms` and
`POST /v1/rooms/found` (R-GEN-10), `GET /v1/rooms/:room` (R-API-11), and
`POST /v1/rooms/:room/redeem` (R-CRED-9). In every route, `:room` is a room
ID or a percent-encoded room name (R-GEN-11).

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
- RPC: `RoomWire.subscribe(session, cursor)` returns bytes (`ByteStream`),
  because Workers RPC streams carry bytes. The bytes are UTF-8. Each
  `Update` is one line of JSON that ends with a newline (`0x0A`), and
  contains no other newline. The room writes an update only when it has
  entries or attention items. The stream ends when the session or bearer
  token stops being valid; the consumer resumes from the last cursor it
  read. The `Room` handle decodes the lines and returns `UpdateStream`;
- HTTPS: a long poll that returns the next `Update`, or an empty one after
  `waitMs`;
- browser: a hibernating WebSocket (`watch`, R-API-12);
- MCP: `attention` with the cursor.

It is not a cross-transport async iterator.

**R-API-9.** The ten MCP tools are `claim`, `workspace`, `renew`,
`release`, `propose`, `note`, `review`, `land`, `attention` and `explain`.
Each calls the `RoomApi` method of the same name:
- `McpHeld` carries `lane` and `lease`, and fencing is the same as for the
  method;
- `workspace` waits up to `waitMs` (default 20 seconds) for `ready` or
  `failed`, and also calls `workspaceToken`: its `grant` follows R-WS-5;
- `land` waits up to `waitMs` (default 0);
- every act tool accepts `idempotencyKey`;
- `propose`, and `claim` in both its forms, accept `because`, and pass it
  to the method unchanged;
- `attention` returns `RoomApi.attention`'s page unchanged. The page
  carries `publishedThrough` from the same read as its items
  (`AttentionPage`), so the tool makes no second read;
- `explain` returns `ExplainNotFound`, `{ act, outcome: "not-found" }`, for
  an act the room does not have, never `null`, because MCP structured
  content must be an object. `RoomApi.explain` still returns `null`, and
  HTTPS still answers `not-found`.

Over HTTPS, the MCP endpoint acts for its bearer through `bearerAct` and
`bearerRequest` (R-CRED-10). A coding agent needs only the MCP URL and
`git`.

**R-API-10.** Every record a method returns can be derived from the log and
the room's operation state. No method returns a fact the log contradicts.

**R-API-11. Finding a room's ID.** `GET /v1/rooms/:room`, with a name or an
ID, returns a `RoomRef`: the room ID and its name. It needs no credential.
An unknown room is `not-found`. This is how a client that has only a name
learns the ID it must sign with. The answer is not proof. After it
connects, the client reads entry 0 and checks that the genesis digest is
that ID (R-ID-3). A wrong answer cannot redirect acts, because every
envelope and request carries the room ID it was signed for (R-SIG-5). Over
RPC, `ArtroomService.room()` accepts a name, but a Worker that signs acts is
configured with the room ID (R-CRED-4).

**R-API-12. WebSocket authentication.** Browsers cannot set headers on a
WebSocket, so the read token travels as a subprotocol, never in the URL.
1. The client opens `GET /v1/rooms/:room/ws`, with an optional
   `?cursor=`, and offers two subprotocols: `artroom.v1` and
   `artroom.token.<token>`, where `<token>` is a session or bearer token.
   Session and bearer tokens use only the characters `[A-Za-z0-9_-]`, so
   each is a valid subprotocol name.
2. The room judges the token before the upgrade (R-CRED-7, R-CRED-10). If
   the token is missing or not valid, it answers HTTP 401 with an
   `ArtroomError` body, and opens no socket.
3. Otherwise it answers 101 with `Sec-WebSocket-Protocol: artroom.v1`. It
   never selects or echoes the token subprotocol. It keeps at most the
   token's hash with the socket.
4. Each message from the room is one text frame that holds one JSON
   `Update`. The room ignores messages from the client.
5. Before each update, the room judges the token again. When it is no
   longer valid, the room closes the socket with code 1008.
6. The `Sec-WebSocket-Protocol` request header is a credential, like
   `Authorization`: it is never logged (R-WS-4).

The client reconnects with the last cursor it saw, so no update is lost or
repeated.

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
23. **Values declared, not implemented.** `connect()`, `join()`,
    `redeem()`, `Checker` and the policy helpers are declared in the
    contract and implemented by lanes E, G and C or D. They are exported
    from the subpaths `/client`, `/checker` and `/policy`, so the package's
    main entry has no missing values at run time.
24. **Configuration-recovery acts need the admin's own key.** A delegation
    cannot act on a configuration-recovery lane (R-ADMIN-5). This keeps the
    bypass as narrow as possible. A browser or CLI admin signs directly.
25. **Recovery lanes have no checks.** `require` rules are not evaluated
    there (R-ADMIN-6), so a policy repair lands on admin approval alone.
    That is the price of a boundary that a bad policy cannot block.
26. **Notifications can be delayed.** A `notify` runtime failure leaves the
    act recorded and retries from a durable queue (R-LOG-13). Attention may
    lag the act by the retry time.
27. **The global input list is wider** (R-CARRY-3). It now includes tests,
    fixtures and build and test configuration. More checks will rerun
    instead of carrying. Policy can add to the list, not remove from it.
28. **Redemption is unauthenticated by design** (R-CRED-9). The invitation
    secret is the credential. It is rate-limited, and a failed attempt does
    not consume the invitation. Whether failed attempts should eventually
    disable an invitation is open.
29. **A lost redemption response.** If a room-custody redemption succeeds
    but its response is lost, the bearer token cannot be shown again. The
    admin issues a new room-custody invitation for the same member, which
    adds a key and a session, and may revoke the unused delegation. Lane E
    tests refused, partial and lost-response redemptions, and that none
    leaks a bearer token.
30. **No `$glob` in the profile.** Expressions cannot match globs; `require`
    rules' `paths` cover the common case. Adding a path function needs a new
    profile version, and it must charge steps in proportion to its work.
31. **The genesis pins profile and `jsonata`, not accounting.**
    `Genesis.profile` is unchanged. For `artroom-jsonata-v1` the accounting
    is always `artroom-act-budget-v1`; a different accounting needs a new
    profile version.
32. **Notify reviewers are in the directory, not the rule input.** A
    `notify` expression cannot read the reviewer list; the `reviewers`
    target uses the `NotifyDirectory` (R-POL-5).
33. **Public founding is open, and names are first come** (R-GEN-10 to
    R-GEN-13). Anyone who can reach the deployment can found a room on a
    fresh, empty repository, and so can take an unused name first. That
    gives them authority over nothing that existed before. Importing an
    existing repository needs an operator's grant. A deployment may also
    put public founding behind its own access control, such as Cloudflare
    Access, and should rate-limit it.
34. **Verification does not re-derive lanes, leases, obligations or
    landings** (R-LOG-15). Obligations come from changed paths, which come
    from git diffs of the canonical repository (R-PROP-3), and landings
    from main's history. Neither is in the log, so an offline verifier of
    the log alone cannot re-derive them. Lanes and leases could be
    re-derived from the log alone, but lease expiry depends on the room
    clock, which is informational. They are the first candidates for a
    later version. Until then the room enforces all four at admission, and
    the report says that verification does not prove them.
35. **Revocations are ordered by the log, not timed.** The roster records a
    revocation by its seq (`KeyState.at`), not a timestamp. That is enough,
    because authority is judged at admission order (R-ADM-3).
36. **Unknown note anchors.** A note whose anchor names no entry is refused,
    and recorded, with `lane-unknown`, as lane A built it. This amendment
    does not add a closer rule.
37. **No room succession.** A registry binding is never removed or moved
    (R-GEN-13). If a room must be replaced, for example because its
    founding never completed and the genesis is lost, or because its
    recovery key is lost, the repository stays bound. Moving it to a new
    room needs a separate operation, authorized by the operator and
    recorded in both rooms' logs. This version does not define it.

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

Cases added for review 45431cd9. Each is normative: an implementation
must pass it.

| Case | Expected result | Rules |
|---|---|---|
| **Policy lockout.** No lane is held. The active policy refuses `claim`, `propose`, `note`, `review`, `land`, `release` and `renew`, and blocks every landing. The sole admin claims `.artroom/policy.json` with `purpose: "config-recovery"`, opens the workspace, pushes, proposes, approves, and lands | Each act is admitted with the flag `config-recovery`; no policy decision is recorded for them; the approval carries `sole-admin-self-approval`; the landing lands; `policy-activated` follows. A non-admin's recovery claim is refused `admin-required`; a recovery proposal that also changes `src/x.ts` is refused `recovery-scope`; a delegated admin key is refused `admin-required` | R-ADMIN-5 to R-ADMIN-9, R-POL-9 |
| Same lockout, two admins | The author's own approval is refused `self-review`; the other admin's approval meets `obl_admin-approval` | R-ADMIN-7 |
| **B watches A's workspace.** Member B reads and waits on A's workspace operation, then requests its token | B sees state, remote and lease generation, and no token. B's `workspace-token` request is refused `not-holder` | R-WS-1, R-WS-2 |
| A requests the token with an old lease generation; after its key is revoked; after it is removed; under an expired delegation | Refused `lease-fenced`, `key-revoked`, `not-member`, `delegation-invalid` | R-WS-2 |
| A token appears in no attention item, update, log entry, `explain`, error or cached response | Verified by scanning every output for the token | R-WS-4 |
| **Scoped checker, new test.** A checker with inputs `src/**` passed on generation 1. Generation 2 leaves `src/**` unchanged and adds a failing `tests/login.test.ts` | The filtered snapshot contains the new file, so its digest changes; the check reruns and fails; it is not carried | R-CARRY-3, R-CARRY-8, R-CARRY-9 |
| **Stage-specific land rule.** A land rule blocks when `stage = "reservation"`. Separately, a rule that passes, with state unchanged and then changed between `ready` and reservation | The `land` act is admitted (stage `land`); preparation evaluates stage `reservation`, so the operation fails and never becomes `ready`. With the passing rule, reservation rebuilds byte-equal canonical input and proceeds; after a change such as a new objection, the bytes differ and the operation goes to `retryable` | R-POL-6, R-LAND-4, R-LAND-7 |
| **Browser join.** A browser key redeems a client-custody invitation | `Joined`; the key is bound at redemption; a second `join` with the same invitation is refused `invitation-invalid`; a `join` by an already-bound key is refused `key-in-use` | R-ADM-3 (c), R-CRED-9 |
| **MCP redemption.** An agent redeems a room-custody invitation with no credential | `Redeemed`, with a bearer token shown once; the log holds the `join` (authority `custody: "room"`, key custody `room`) and the `delegate`, not the token; the member's acts are bounded by the session delegation's kinds and lifetime | R-CRED-3, R-CRED-9, R-ADM-12, R-SEC-5 |
| **Room-custody invitation, self-signed join on `/acts`.** The recipient makes its own key and posts a signed `join` with the invitation's secret to `POST /v1/rooms/:room/acts` | Refused `custody-mismatch`; nothing recorded; the invitation stays unused | R-ADM-12 |
| **Room-custody invitation, self-signed join over RPC.** The same `join` sent to `RoomWire.submit` | Refused `custody-mismatch`; nothing recorded; the invitation stays unused | R-ADM-12 |
| **Room-custody invitation, client redemption.** The same `join` sent to `redeem` with `custody: "client"` | Refused `custody-mismatch`; nothing recorded | R-ADM-12, R-CRED-9 |
| **Client-custody invitation, room redemption.** `redeem` with `custody: "room"` and a client-custody invitation's ID and secret | Refused `custody-mismatch`; no key made; nothing recorded; the invitation stays unused | R-ADM-12, R-CRED-9 |
| **Unjoined Worker.** A member delegates `check` and `note` to a key that never joined; the Worker signs a `note` under it | Admitted with authority `via: "delegation"`, the grantor as member. After the grantor's key is revoked, the next act is refused `delegation-invalid` | R-ADM-3 (b), R-CRED-4 |
| **Recovery key.** The recovery key signs `set-role` while no admin can act | Admitted with authority `via: "recovery"` and the flag `recovery-key`; a `claim` signed by it is refused `role-forbids` | R-ADM-3 (d), R-GEN-3 |
| **Log construction.** A new claim, its `notified` event, and the first two publications | Built in the order of section 20's worked example; `artroom verify` accepts both commits | R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13 |
| A `notify` rule hits a runtime failure | The claim stays recorded; a `notified` entry is sealed after a retry | R-LOG-13 |

Cases added for amendment 2 (section 27). Each is normative.

| Case | Expected result | Rules |
|---|---|---|
| **Isolated public creation.** Draft with repository source `new`, sign, found; found again with the same body | `genesis.repo` is a fresh identity in the public namespace, with no `onboarding`; the repository is created empty after the registry binding; entry 0 is the genesis, entry 1 `policy-activated` with `checkers`; the second `found` returns the same room ID | R-GEN-10, R-GEN-12, R-GEN-13, R-POL-9 |
| **Unauthorized existing repository.** Draft `import` with a grant signed by a key that is not an operator key, or with a grant for a different admin key; separately, found a `new` draft whose genesis names an existing repository | `forbidden` at `draft` and at `found`; no repository contents read, no token minted, no entry sealed, nothing bound | R-GEN-10, R-GEN-12 |
| **Repository altered after draft.** An authorized import draft whose genesis is edited to name another repository, keeping the grant, and re-signed by the admin key | `forbidden`, because `grant.repo` differs from `genesis.repo`; nothing read, minted, sealed or bound | R-GEN-12 |
| **Authorized import.** An operator grants repository R to admin key K; K drafts and founds | Founded; `genesis.onboarding` holds the grant; `artroom verify` checks the grant's signature and binding, and reports the operator key | R-GEN-12, R-LOG-10 |
| **Simultaneous founding.** Two `found` calls for repository R, with different names and keys, each with a valid grant, at once | Exactly one binds and founds; the other gets `forbidden`, and no sequencer, publication slot or token | R-GEN-13, R-PUB-10 |
| **Duplicate import.** After R is founded, a second `found` with the same grant and a new name or recovery key | `forbidden`; the first room's binding is unchanged | R-GEN-13 |
| **Canonical-name aliases.** A grant whose `repo` is a name or URL rather than an identity; two grants that name R by its identity, used for two foundings | `bad-request`; the second founding is `forbidden` | R-GEN-12, R-GEN-13 |
| **Recovery after binding.** Step 6 of `found` fails after the registry binding (`unavailable`); the grant then expires; the founder retries with the same body; another founder tries a different genesis for R meanwhile | The retry completes the founding; the other founder gets `forbidden` | R-GEN-10, R-GEN-13 |
| Found with a genesis whose `profile` or `jsonata` version differs from the deployment's, or whose room key does not match the draft; draft a room whose name has the form of a room ID; found a second room with a bound name | `bad-request`; `bad-request`; `forbidden`. Nothing sealed or bound | R-GEN-10, R-GEN-11 |
| **Name to ID.** `GET /v1/rooms/<name>` with no credential; then an unknown name | `RoomRef` with the ID whose genesis digest it is; then `not-found` | R-API-11 |
| **Bearer roster and check.** A bearer submits a `roster` act through `bearerAct`; a bearer whose delegation lacks `check` submits a `check` | Both refused `delegation-invalid`; nothing recorded | R-CRED-10, R-ADM-5 |
| A bearer opens its workspace with `bearerRequest`, then asks for the token; a bearer that is not the holder asks for the token | `WorkspaceOp`, then `WorkspaceGrant`; `not-holder` | R-CRED-10, R-WS-2 |
| **WebSocket.** Connect with subprotocols `artroom.v1` and `artroom.token.<session>`; connect with no token; revoke the session's key while connected | 101 with `Sec-WebSocket-Protocol: artroom.v1` only, then updates; 401 and no socket; the socket closes with 1008. The token is in no URL, response header or log | R-API-12, R-WS-4 |
| **RPC subscription.** Read `RoomWire.subscribe` after two acts | UTF-8 bytes; each line one `Update`; the `Room` handle yields the same updates | R-API-8 |
| **MCP.** `explain` of an unknown act; `attention`; `propose` with `because` | `{ act, outcome: "not-found" }`; a page with `publishedThrough` and no extra log read; the record's `because` equals the input | R-API-9 |
| **Invitation link.** Parse a link with the secret in the fragment, and one with the secret only in the query | The first gives room, invitation and secret; the second is refused | R-CRED-11 |
| **Recompute after activation.** A policy that adds a `require` rule lands while a proposal's review obligation is met | `policy-activated` with `reopened: 0`; `land` refused `obligation-open` until an `obligations-recomputed` event lists the new obligation; a `require` rule that errors gives `blocked` | R-POL-9, R-LOG-5 |
| **Land rules in preparation.** A land rule passes during preparation; in a second operation it blocks | A `land-evaluated` event for each, with the decisions; the second is followed by a `failed` outcome | R-LAND-4 |
| **Byte mismatch.** A new objection arrives between `ready` and reservation | `retryable` with reason `land-input-changed` | R-LAND-6, R-LAND-7 |
| **Notify across an activation.** An entry is sealed under policy V1 and its `notify` is queued; policy V2 activates; then the `notified` event is sealed | The `notified` decisions name V1 and were evaluated with V1; `artroom verify` replays them with V1 and accepts them | R-LOG-13, R-LOG-10, R-POL-12 |
| **Bearer receipt after revocation.** A bearer act is admitted and its response lost. The agent retries with the same act and idempotency key; then the session delegation is revoked and it retries again. Separately, a client resends a signed envelope it kept after its key is revoked | The first retry returns the original result; the second throws `unauthenticated` and records nothing; the kept envelope returns its original result | R-CRED-10, R-IDEM-2 |
| **Verification.** A log with a `delegate` that grants a kind the grantor's role cannot sign; a `check` whose `config` differs from its checker's digest; a `policy-activated` that names an unpublished checker configuration | Each fails verification with a named reason | R-LOG-10 |

## 24. Review 45431cd9

Checker's review of `7771921f` requested changes. Each finding, and where
it is answered:

| Finding | Rules changed or added | Types | Examples |
|---|---|---|---|
| P1.1 Acyclic log and publication | R-ID-8, R-ADM-1 (steps 10–11), R-LANE-1, R-REV-6, R-POL-5, R-EVAL-5, R-LOG-2, R-LOG-5, R-LOG-6, R-LOG-8, R-LOG-10, new R-LOG-12, R-LOG-13, the worked example in section 20 | `EntryContent` split from `LogEntry`; `Checkpoint` has no `commit`; the `checkpoint` event carries it; new `notified` event; `opened` effect and `revert-lane` event have no lane; `Receipt` has no `attention` effect; `land-outcome` has no `revertLane` | `log-construction.ts` |
| P1.2 Configuration recovery before approval exists | R-ADMIN-3 rewritten; new R-ADMIN-5 to R-ADMIN-9; R-LANE-7; R-ADM-1 step 9 | `ClaimBody.purpose`, `LanePurpose`, `Lane.purpose`, `Claim.purpose`, flag `config-recovery`, refusal `recovery-scope`, `landInput: Digest \| null` | `config-recovery.ts` |
| P1.3 Authority cases, redemption, onboarding | R-ADM-3 split into cases (a)–(d); R-ADM-5; R-GEN-6; R-CRED-1, R-CRED-3, R-CRED-4, R-CRED-5; new R-CRED-9 | `Authority` is a union on `via`; `JoinEnvelope`; `Redemption`, `Joined`, `Redeemed`; `RoomWire.redeem`; `POST /v1/rooms/:room/redeem`; declared `join()`, `redeem()`; refusal `key-in-use` | `onboarding.ts` |
| P1.4 Workspace credentials | New R-WS-1 to R-WS-5; R-CRED-5; R-API-9 | `WorkspaceDetail` has no token; new `WorkspaceGrant`; `RoomApi.workspaceToken()`; request kind `workspace-token`; MCP `workspace` returns `{ op, grant }`; refusal `workspace-not-ready` | `workspace-visibility.ts`, `demo-loop.ts` |
| P2.1 Tests as global inputs | R-CARRY-3 list extended | — | Section 23, "Scoped checker, new test" |

## 25. Review d12b67d6

Checker's review of `845c7fd7` found the five earlier findings resolved,
and one remaining P1.

| Finding | Rules changed or added | Types | Examples |
|---|---|---|---|
| P1 Enforce invitation custody at every join | R-ADM-3 (c) adds the custody condition; new R-ADM-12; R-CRED-9 | `AdmissionPath` (internal, never on the wire); `Authority` `join` case gains `custody`; refusal `custody-mismatch`; custody documented on `Invitation`, `Redemption`, `RoomWire.submit` and `POST /acts` | `onboarding.ts`; section 23, four cross-custody cases with the bounded MCP case |
| Non-blocking: runtime failure wording | R-ADM-9 and R-EVAL-5 name the post-commit `notify` exception of R-LOG-13 | — | — |
| Non-blocking: Lane E redemption tests | Open point 29 | — | — |

## 26. Policy amendment (81c31bc7)

Checker's approval 81c31bc7 of the policy runtime required these contract
changes before the Room integrates it. Each is listed with what other
lanes must change.

| Change | Rules | Types | Who adapts |
|---|---|---|---|
| Ownership as pairs | R-EVAL-3 | `PolicyProposal.owners` is `readonly PathOwners[]` (was a map keyed by path); new `PathOwners` | Room: build `owners` as pairs, one per path in `paths` |
| Lane purpose in rule inputs | R-ADMIN-5 | `PolicyLane.purpose: LanePurpose` (new, required) | Room: set it from `Lane.purpose` |
| Replay context | R-EVAL-6, new R-EVAL-8, R-LOG-7, R-POL-11 | new `ReplayContext`, `BudgetState`, `Usage`, `NotifyDirectory`, `CarryFactsRecord`; `Decision.input` is the context's digest | Room: retain contexts, not bare inputs; store a notify context with each queued notification |
| Per-act budget | R-EVAL-2, R-EVAL-4, new R-EVAL-9 | `PolicyProfile` gains `actSteps`, `actInspectedBytes`, `accounting`; `ProfileStamp` gains `accounting` | Room: one meter per act, in order |
| Pinned active policy | new R-POL-12 | — | Room: pass the immutable document and its version; retain each version |
| Check carry facts | R-CARRY-6 to 10 | new `CheckCarryFacts` (`before` reuses `CheckBinding` with `input`) | Room, checkers |
| Retired evidence | R-REV-2 | `NotCarried.code` gains `key-retired`; `Reopened` gains `key-retired` | UI: show the new codes |
| Sole-admin reopening | R-ADMIN-2 | `Reopened` gains `sole-admin-ended` | Room, UI |
| Default `dependsOn` | R-CARRY-2 | comment on `CarrySettings.dependsOn` | — |
| Latest verdict per reviewer | R-POL-7 | comment on the land `RuleInput.reviews` | Room: one entry per qualifying reviewer |
| Require failure at activation | R-POL-9 | — | Room: block `land` with the recorded refusal |
| `landInput` | R-LAND-4, R-LAND-7, R-POL-6 | `ready.landInput` is the digest of the retained prospective reservation input; new room-internal `RetainedLandInput` (see "Review 09c01bf9") | Room, landing operation |
| Kept open | Open points 30 to 32 | — | — |

### Review 09c01bf9

Checker's review of `95fbdefd` kept every change above and found one P1:
the contract did not say which `stage` preparation evaluates, or how a
synchronous reservation compares a digest it cannot compute without an
`await`.

| Finding | Rules changed | Types | Who adapts |
|---|---|---|---|
| P1 Prospective reservation input and synchronous comparison | R-POL-6 rewritten; R-LAND-4 step 3; R-LAND-7 compares bytes | New room-internal `RetainedLandInput` (`stage: "reservation"`, `canonical`, `digest`); comments on `RuleInput` `stage` and `ready.landInput`. `ready.landInput` keeps its type, `Digest \| null`, and is now the digest of the retained reservation-stage input | Landing operation (lane B): evaluate stage `reservation` during preparation, retain bytes and digest, compare bytes in the reservation transaction. Room (lane A): evaluate stage `land` at admission |

Acceptance case, added to section 23: a land rule `stage = "reservation"`
passes the `land` act but fails preparation, so the operation never becomes
`ready` and the rule cannot be bypassed. With a rule that passes, unchanged
state rebuilds byte-equal input at reservation, and a change to that state,
such as a new objection, fails the byte comparison and sends the operation
to `retryable`.

## 27. Amendment 2 (82a0b25a): integration gaps from lanes A, E and L

Request 82a0b25a asked the contract to close the gaps that lanes A (the
Room), E (client, MCP and CLI) and L (the log) found, adopting what they
built wherever it is sound. This section maps each of its eight conditions
to what changed, then lists every edit a lane must make.

Most changes adopt a lane's names, shapes and wire formats as they are.
The contract departs from what a lane built in six places, each for
soundness:
- **Founding authorizes the repository** (R-GEN-12). The Room let the
  founder name any repository. Public founding now always creates a fresh
  repository; importing an existing one needs an operator's grant.
- **One registry binds repository, room and name** (R-GEN-13, R-PUB-10).
  The Room re-pointed a name at every founding, so anyone could take over
  an existing room's name, and two rooms could claim one repository.
- **`found` re-validates the genesis** (R-GEN-10). The Room validates fields
  only at `draft`, so a founder could change the profile after drafting.
- **WebSocket authentication is checked before the upgrade, from the
  subprotocol** (R-API-12). This adopts lane E's client. The Room
  authenticated with a first message on an already open socket.
- **The RPC subscription carries bytes** (R-API-8). This adopts the Room's
  stream. The client passed the stream on as if it held `Update` objects.
- **A bearer `propose` and `claim` keep `because`** (R-API-9). The client
  dropped it for bearer acts.

### Conditions and changes

| Condition | Rules | Types (`packages/contract`) |
|---|---|---|
| (1) Room lifecycle: founding, and name to ID | New R-GEN-10 to R-GEN-13, R-PUB-10, R-API-11; R-GEN-1, R-SIG-1, R-ID-3 and R-API-3 amended; open points 33 and 37 | New `RoomDraft`, `RepoSource`, `DraftedRoom`, `Founding`, `RoomRef`, `ArtroomFounder`, `RepoIdentity`, `OnboardingGrant`, `SignedOnboardingGrant`; `Genesis` gains optional `onboarding`, and `Genesis.repo` is a `RepoIdentity`; `SigningDomain` gains `artroom-onboarding-v1`; `HttpRoutes` gains `POST /v1/rooms`, `POST /v1/rooms/found` and `GET /v1/rooms/:room` |
| (2) Bearer acts | New R-CRED-10, including how a bearer retry differs from R-IDEM-2; R-API-9 amended. A bearer submits exactly the kinds its delegation grants; never `roster` (R-ADM-5); `check` only over RPC, because MCP has no `check` tool; checkers use a key | `RoomWire` gains `bearerAct` and `bearerRequest`; new `BearerAct`, `BearerRequest` |
| (3) Transport | New R-API-12; R-API-8 rewritten; R-WS-4 names the `Sec-WebSocket-Protocol` header | `RoomWire.subscribe` returns `ByteStream` (was `UpdateStream`); new `ByteStream`, `WsProtocol`, `WsTokenProtocol`; the `ws` route documents its query and subprotocols. `Room.subscribe` still returns `UpdateStream` |
| (4) MCP | R-API-9 amended | New `AttentionPage`, returned by `RoomApi.attention`, `ReadResults.attention`, the `attention` route and the MCP tool; MCP `explain` returns `Explanation \| ExplainNotFound`; MCP `propose` and the `claim` form for an existing lane gain `because` |
| (5) Invitation link | New R-CRED-11 | New `InvitationLink` |
| (6) Log entries and retry reason | R-POL-9, R-LAND-4, R-LAND-6, R-LAND-7, R-LOG-5, R-LOG-13 amended; R-LOG-13 pins a queued `notify` to the policy version at sealing | `SystemEvent` gains `obligations-recomputed` and `land-evaluated`; `policy-activated.recomputed.reopened` is the literal `0`; `RetryReason` gains `land-input-changed` |
| (7) Lane L gaps | New R-LOG-14 (no git signature: resolved), R-LOG-15 (what verify does not prove); R-LOG-10 and R-OBL-3 amended; open points 34 and 35 | `policy-activated` gains `checkers: CheckerDigest[]`; new `CheckerDigest` |
| (8) Additive, lane edits listed, gates | This section | `examples/lifecycle.ts` compiles every new type |

Lane L's five gaps, one by one:

| Gap | Decision |
|---|---|
| 1. Log commits are not git-signed | Resolved: they are not, and need not be (R-LOG-14) |
| 2. Checker configurations not named by an event | Resolved: `policy-activated.checkers`; verify checks they are published and that each check's `config` matches (R-POL-9, R-LOG-10) |
| 3. Lane, lease, obligation and landing state not re-derived | Kept open, with reasons (R-LOG-15, open point 34) |
| 4. Delegation grants not checked against the grantor's role | Resolved: verify checks each grant (R-LOG-10) |
| 5. No revocation timestamp | Resolved: none is needed (open point 35) |

Lane A's three gaps under condition (6): recomputation after activation is
the `obligations-recomputed` event; readiness decisions are the
`land-evaluated` event; the byte mismatch is `land-input-changed`. Lane A's
gap 7, unknown note anchors, was not in the request; open point 36 records
it.

### Required lane edits

Edits marked "(type)" fail that lane's `npm run typecheck` against the
amended contract until they are made. Lanes A, E and L are not yet on
main, so their edits are theirs to make. This was checked by compiling each
lane's branch with the amended `packages/contract`. The other edits are
behaviour that the types cannot enforce.

**Lane A (`packages/room`)**
1. `found`: validate every genesis field again, as `draft` does, including
   `format`, `profile` and the `jsonata` version. Run the steps of R-GEN-10
   in order: nothing reads the repository, mints a credential, seals an
   entry or binds a name before the repository is authorized and bound.
   Today `found` reads main before it binds anything, and binds the name
   only after sealing.
2. Repository source (R-GEN-12): `draft` takes `repo: { kind: "new" }` or
   `{ kind: "import", grant }`, never a repository name. For `new`, derive
   a fresh identity from the `draft` value with a deployment secret, in a
   reserved namespace, and create the repository at step 6. For `import`,
   check the grant (operator key from configuration, `repo`, `admin`,
   `notAfter`) at `draft` and again at `found`, and put it in
   `genesis.onboarding`.
3. Registry (R-GEN-13): replace the `RoomNames` Durable Object, which
   overwrites, with one registry that binds repository identity, room ID
   and name in one atomic step: the same binding again succeeds, any other
   use of the repository or name throws `forbidden`. Refuse a name in the
   form of a room ID with `bad-request` (R-GEN-11).
4. Mint canonical write tokens and push `main` and `refs/artroom/log` only
   for the room the registry binds to that repository (R-PUB-10).
5. Add `GET /v1/rooms/:room`, with no credential, returning `RoomRef` from
   the registry (R-API-11).
6. The Worker's `RoomWire` target gains `bearerAct`, which unwraps the
   Durable Object's existing method, and `bearerRequest`, new in the
   Durable Object: `workspace` and `workspace-token` judged under the
   bearer's delegation as R-WS-2 judges a signed request (R-CRED-10). Its
   `subscribe` already returns a `ByteStream`, so the target can implement
   `RoomWire` whole, not `Omit<RoomWire, "subscribe">`. (type)
7. WebSocket: authenticate from the `artroom.token.<token>` subprotocol in
   `fetch`, before accepting; answer 401 when it is missing or not valid;
   answer with `Sec-WebSocket-Protocol: artroom.v1`; read the cursor from
   `?cursor=`; keep only the token's hash in the socket attachment; stop
   authenticating by first message, and ignore client messages (R-API-12).
8. The `attention` read returns `publishedThrough` with its page
   (R-API-9).
9. `policy-activated` names `checkers`, as name and digest pairs sorted by
   name (R-POL-9). (type)
10. `recompute` seals one `obligations-recomputed` event per proposal in
    the transaction that stores the result, with the decisions, the new
    obligations, those reopened, and `blocked` (R-POL-9). Lane C's
    `activation.ts` already returns which obligations reopened.
11. `evaluateLandRules` seals a `land-evaluated` event in the transaction
    that stores the result, whether the rules pass or block (R-LAND-4).
12. A queued `notify` keeps using the policy version stored with it, even
    after another activation (R-LOG-13). The Room already stores it; a
    test of the "Notify across an activation" case is needed.
13. Reservation's byte mismatch sends the operation to `retryable` with
    `land-input-changed`, not `obligation-open`. Add the reason's text to
    the in-memory landing engine's table of reasons (R-LAND-7). (type,
    for the table)

**Lane E (`packages/client`, `packages/mcp`, `packages/cli`)**
1. Client, RPC: decode `RoomWire.subscribe`'s newline-delimited UTF-8
   bytes into the `UpdateStream` that `Room.subscribe` returns (R-API-8).
   (type)
2. Client: both handles' `attention` return `AttentionPage`, the page the
   room now sends (R-API-9). (type)
3. Client test support: the fake room's `wire()` implements `bearerAct` and
   `bearerRequest`, returns bytes from `subscribe`, and includes
   `publishedThrough` in attention pages. Its WebSocket answers with
   `artroom.v1` (R-API-12). (type)
4. Client, bearer acts: pass `because` through for `propose` and for a
   `claim` on an existing lane; today both drop it (R-API-9).
5. MCP `propose`: the schema and the runner accept `because` and pass it to
   `RoomApi.propose`. The `claim` schema lists `because` for both forms
   (R-API-9). (type, through the schema test)
6. MCP `explain`: return `{ act, outcome: "not-found" }` as structured
   content for an unknown act, and update its output schema (R-API-9).
   (type)
7. MCP `attention`: return `RoomApi.attention`'s page as it is, without the
   extra log read (R-API-9).
8. CLI: no change. R-CRED-11 adopts its link format and parser.

**Lane L (`packages/log`)**
1. Replay the decisions in `obligations-recomputed` and `land-evaluated`
   events, and check that an `obligations-recomputed` event names the
   active policy version (R-LOG-10).
2. Check that every checker configuration named by `policy-activated` is
   published, and that every accepted `check` names its checker's digest
   in the active version. Each needs a named failure reason (R-LOG-10).
3. Roster replay: at each `delegate`, check that the kinds are ones the
   grantor's role could sign, never `roster`, and that the act was not
   signed under a delegation (R-LOG-10, R-ADM-5).
4. Test fixtures that build `policy-activated` add `checkers`
   (`test/support/room-sim.ts`). (type)
5. The report lists lanes, leases, obligations and landings as not proven
   (R-LOG-15).
6. `notified` decisions: compare their policy version with the one active
   when the notified entry was sealed, not when the `notified` event was.
   Today `replayDecisions` compares with the version active at the event,
   which fails the "Notify across an activation" case (R-LOG-10, R-LOG-13).
7. A genesis with `onboarding`: check the grant's signature by its
   `operator` key and that its `repo` and `admin` equal the genesis's; name
   the operator key in the report (R-LOG-10, R-GEN-12).
8. No change for log commit signing: R-LOG-14 adopts what the package
   does.

**Lane F (`packages/ui`)**, which landed on main after this amendment was
written:
1. The landing screen's table of retry reasons gains `land-input-changed`
   (R-LAND-6). (type) This branch makes that one-line edit, so main stays
   green when it lands.

**Integration (no single lane).** The MCP endpoint's Worker needs a
`RoomApi` for each bearer. Built on `RoomWire`, it sends acts to
`bearerAct`, workspace requests to `bearerRequest`, and reads to `read`
with the bearer token. This adapter belongs to whichever lane wires the
deployment. The deployment also needs:
- its operator keys in configuration, and a way for the operator to sign
  onboarding grants, such as an `artroom` operator command (R-GEN-12);
- a deployment secret and a reserved repository namespace for public
  founding, and the Artifacts call that creates the repository at step 6
  of `found` (R-GEN-12).

### Review 152f29e8

Checker's review of `b9fded01` requested two changes and two
clarifications. Each is answered here, and the condition map and the
required lane edits above include them.

| Finding | Rules changed or added | Types | Cases (section 23) |
|---|---|---|---|
| P1 Founding must authorize the canonical repository | R-GEN-10 rewritten (ordered steps; nothing read, minted, sealed or bound before authorization); new R-GEN-12 (public founding always creates a fresh repository; importing needs an operator's onboarding grant, carried in the signed genesis and checked again at `found`); R-GEN-1, R-SIG-1, R-LOG-10; open point 33 | New `RepoSource`, `RepoIdentity`, `OnboardingGrant`, `SignedOnboardingGrant`; `RoomDraft.repo` is a `RepoSource` (was a name); `Genesis.onboarding`; domain `artroom-onboarding-v1` | Unauthorized existing repository; repository altered after draft; authorized import; isolated public creation |
| P1 Serialize the repository-to-room binding | New R-GEN-13 (one registry binding per repository identity holds the room ID and the name, bound atomically and kept through an incomplete founding); R-GEN-11 derives names from it; new R-PUB-10 (one publisher per repository); open point 37 (no succession) | — | Simultaneous founding; duplicate import; canonical-name aliases; recovery after binding |
| (a) Policy for a queued `notify` | R-LOG-13 pins it to the version active when the entry was sealed; R-LOG-10 replays it with that version | — | Notify across an activation |
| (b) Bearer expiry versus R-IDEM-2 | R-CRED-10, "Retries and idempotency" | — | Bearer receipt after revocation |

## 28. Amendment 3 (66d6fb14): `refuse` rules before the claim check

Request 66d6fb14 added the `jj-conflicts` rule to the default policy pack
(docs/policy-pack.md). Its condition is that a proposal adding
`.jjconflict-side-0/` is refused with that rule, not `outside-claim`.
Under R-ADM-1 as written, platform invariants (step 8) ran before policy
`refuse` rules (step 9), so `outside-claim` always came first.

| Change | Rules | Types | Who adapts |
|---|---|---|---|
| For `propose`, `refuse` rules run inside step 8: after R-PROP-1, R-PROP-3 and R-PROP-6, before R-PROP-4 and the remaining invariants. `require` rules stay at step 9 | R-ADM-1 | — | Room (lane A): evaluate `refuse` rules for `propose` before the claim check, with the same act meter as `require` |
