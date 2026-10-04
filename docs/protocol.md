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
28. Amendment 66d6fb14: `refuse` rules before the claim check
29. Contract amendment 3 (bc351fa8): checks, check jobs and snapshots
30. Contract amendment 4 (1c785ed8): log objects within Artifacts' limit
31. Request c657d4ba: joins and redemption
32. Contract amendment 5 (10fcfe4e): canonical token mints (R-MINT)
33. Contract amendment 6 (245986cb): declared acts (R-DECL)
34. Contract amendment 7 (a9788a59): the MCP core

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
- A refused `join` is never recorded, at any step of admission and on any
  path (R-ADM-8). Its body carries the secret, and a refused join leaves the
  invitation unused, so recording it would publish a live credential.

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
  can only be this founding's own, from an earlier attempt. The deployment
  may store it under a name derived from the identity, one per creation
  attempt and never reused, so that a late request for an abandoned attempt
  cannot reach the room's repository; the room's repository is the attempt
  it seals the genesis on. At step 6 the deployment also gives `main` one
  commit with no files, so that the room's
  first landing has a main to land on (R-LAND-2, R-PUB-4), and revokes every
  credential that creating the repository and that commit produced before it
  seals the genesis.
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
as a proposal that adds jj conflict directories at the root of the tree.
Moving them earlier only adds refusals: every platform invariant is still
checked, and a configuration-recovery lane still skips them. They share the act's budget
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

The one exception is `join`. Its `secret` is exempt from the secret scan
(R-SEC-4) because an admitted join consumes the invitation in the same
entry. A refused join consumes nothing, so a `join` refused at steps 7 to 9
is not recorded either: it is returned without `act`, leaves no
idempotency record, and a retry is judged afresh (R-IDEM-4, R-GEN-6).

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
  It returns `Joined`, with a read session, only when this call admitted
  the join. A join admitted earlier is public in the log, so a redemption
  that repeats it is refused `invitation-invalid` and issues no session.
  The key that joined gets its record again by resubmitting the same bytes
  (R-IDEM-2), and a session with a signed `session` request (R-CRED-5).
- `custody: "room"`: the body is the invitation ID and secret. The room
  makes the member key, and admits the `join` it signs with that key on the
  `room-redemption` path. It then makes a session key, records the
  `delegate`, and returns `Redeemed`, with the bearer token shown once.
- The body's `custody` only selects the branch. The join admission checks
  the invitation's recorded custody against the path (R-ADM-12).
- A refused redemption records nothing and does not consume the invitation.
- Redemption is rate-limited per client address and per invitation. The
  invitation's limit counts every attempt to join with it, through
  `redeem` and as a `join` on `POST /acts` or `RoomWire.submit`. It keys
  only an entry ID that names an invitation the room issued. A Worker
  calling over a service binding has no client address, so only the
  invitation's limit applies to it; a binding that fronts the public
  limits its own callers. The counters may be held in memory, but must be
  bounded, and an exceeded limit throws `rate-limited` and records
  nothing.

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
  An unknown or expired token, a revoked session key, a revoked or expired
  delegation, a revoked key of the delegation's grantor, or a member who
  is not active, throws `ArtroomError` `unauthenticated`, and nothing is
  recorded. The room judges a token the same way for a read, an act and a
  request. So a session that has ended gets no result even for an exact
  retry of an act it made before: the room signs nothing for it, and there
  is no envelope to replay. A signed envelope that someone kept is another
  matter: submitted as its own bytes, it gets its record (R-IDEM-2). A
  change of the member's role, or of what the delegation's kinds mean,
  does not end the session; it is judged when a new act is admitted
  (request `5d41ea36`).
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
act's `secret` is exempt: it is consumed in the same entry, and a refused
join is never recorded (R-GEN-6, R-ADM-8).

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
commit, never by the commit it names. Unpublished `checkpoint` events alone
never make a publication due; they wait for the next other entry (request
3da1d82b).

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

**R-API-9.** The MCP core has fourteen named convenience tools and the
generic `act` and `acts` tools of amendment 6: sixteen tools in total.
The four added reads do not replace the two generic tools. The named
tools call these `RoomApi` methods:

| Tool | Method | Kind |
|---|---|---|
| `claim`, `propose`, `note`, `review`, `land`, `release`, `renew` | The method of the same name | Act |
| `workspace` | `workspace`, then `workspaceToken` | Request |
| `attention`, `explain`, `lanes`, `lane`, `proposal` | The method of the same name | Read |
| `operation` | `op`, and `wait` when `waitMs` is given | Read |

`act` performs a declared act with the caller's explicit binding;
`acts` reads declarations and their bindings (R-DECL-16). Neither assumes
the workroom's vocabulary. The named act tools keep their code-review
bindings as amendment 6 requires.

- `McpHeld` carries `lane` and `lease`, and fencing is the same as for the
  method;
- `workspace` waits up to `waitMs` (default 20 seconds) for `ready` or
  `failed`, and also calls `workspaceToken`: its `grant` follows R-WS-5;
- `land` waits up to `waitMs` (default 0);
- **every act tool requires `idempotencyKey`.** A call without one is
  `ArtroomError` `bad-request`, whose message says to add any unique string
  and to reuse it to retry. Over a bearer, retries follow R-CRED-10;
- `propose`, and `claim` in both its forms, accept `because`, and pass it
  to the method unchanged;
- `attention` returns `RoomApi.attention`'s page unchanged. The page
  carries `publishedThrough` from the same read as its items
  (`AttentionPage`), so the tool makes no second read;
- Artroom chooses object-shaped not-found results for these MCP reads:
  `explain` returns
  `ExplainNotFound`, `{ act, outcome: "not-found" }`; `lane`, `proposal`
  and `operation` return `McpNotFound`, `{ outcome: "not-found", what }`.
  `RoomApi.explain`, `lane` and `proposal` keep returning `null` for a
  missing record. `RoomApi.op` and `ReadResults.op` are non-nullable;
  missing operations throw `ArtroomError` `not-found`. The MCP operation
  adapter maps only that lookup outcome to `McpNotFound<"operation">`;
  authentication, permission, unavailable and other failures retain their
  normal errors. HTTPS still answers `not-found`.

The [MCP structured-content specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content)
permits any JSON value conforming to an advertised output schema, including
`null`. Artroom's object-shaped results are its own consistent interface
choice, not an upstream object-only restriction.

There is no named `check` or `roster` tool. A generic declared check follows
the versioned transport and exact-job rules of R-CRED-10 and R-OBL-3;
`act` does not open the platform roster path to a bearer. Waiting follows
R-API-15; descriptors follow R-API-13; listing follows R-API-14.

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

**R-API-13. MCP descriptors.** Each tool has one `McpToolDescriptor`.
`tools/list` advertises its `name`, `title`, `description`, `inputSchema`,
`outputSchema` and `annotations`, in a fixed order. `method` and `toolsets`
stay on the server.
- **Output schemas are advertised, and results conform.** For an act tool
  and `workspace`, `outputSchema` is `oneOf` the tool's result and
  `Refusal`, so a refusal's structured content conforms too. Every result
  also carries a short text form: for a refusal, its rule, reason and fix.
- **Descriptions** are at most 1,000 characters. Each says when to use the
  tool and gives the likely refusals with their fixes.
- **Annotations** are hints for hosts, never authority. A host that trusts
  them may auto-approve read-only tools; the room judges every call either
  way. The values are fixed:

  | Tools | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
  |---|---|---|---|---|
  | `attention`, `explain`, `lanes`, `lane`, `proposal`, `operation`, `acts` | true | false | true | false |
  | `claim`, `propose`, `note`, `review`, `renew`, `workspace` | false | false | true | false |
  | `land`, `release`, `act` | false | true | true | false |

  Act tools are idempotent because the key is required (R-API-9).
  `openWorldHint` is false: every tool acts only on the room.
  `act` uses conservative fixed hints for every kind: a declared act may
  land or release, so the generic tool is never advertised as read-only
  or non-destructive merely because an earlier call performed a review.
- **Server instructions** are at most 512 characters and stand alone: what
  the room is, to call `attention` first, and that refusals carry a fix.

**R-API-14. MCP toolsets.** A toolset is the set of tools `tools/list`
shows a caller (`McpToolsets`):

| Toolset | Tools |
|---|---|
| `builder` | `attention`, `claim`, `workspace`, `propose`, `note`, `land`, `release`, `renew`, `lane`, `proposal`, `explain`, `operation` |
| `reviewer` | `attention`, `lanes`, `lane`, `proposal`, `note`, `review`, `explain` |
| `observer` | `attention`, `lanes`, `lane`, `proposal`, `explain`, `operation` |
| `all` | All fourteen named tools, and `act` and `acts` |

The two generic tools compose with every toolset: `acts` is a read in all
four; `act` is included in `builder`, `reviewer` and `all`, subject to the
caller's act authority. `observer` lists no act tool. The generic tool's
listing never grants a kind or a binding; admission judges the explicit
intent under R-DECL-16.

- **The default comes from the caller's authorization.** First apply the
  read-only-delegation override: a delegated caller with no eligible new
  MCP act kind, as defined below, gets `observer`. Otherwise the current
  roster role selects `all` for `admin` or `maintainer`, `builder` for
  `member` or `agent`, and `reviewer` for `checker`. That last choice is a
  presentation set, not review authority: a checker still cannot sign a
  review or claim, and only eligible act tools are listed.
- **A caller may select another named toolset.** The query parameter
  `toolset` on the MCP URL (for example `?toolset=reviewer`), or
  `--toolset` on `artroom mcp`, selects any one of `builder`, `reviewer`,
  `observer` and `all`, whatever the caller's default is. The
  read-only-delegation override decides the default only. Every selected
  list is filtered by the same eligibility predicate, so selecting `all`
  shows no act tool the caller could not make a new call of, and grants no
  act and no signed binding. An unknown name is `bad-request`.
- **One eligibility predicate governs HTTPS and stdio.** Authenticate the
  request and use the active document and current roster role. The host
  that authenticated the request supplies the caller's facts
  (`McpCaller`): the credential's current role and, under a delegation,
  the delegation's `kinds` and signed map exactly as recorded. The Room's
  own endpoint reads them from the token, by a method of the Room that is
  not part of `RoomApi` or `RoomWire`. `artroom mcp` reads them from the
  current roster and the credential's own recorded delegation. Both read
  them again for every `tools/list`. For a `v2`
  document, a declared kind is eligible for a new generic call exactly
  when its `who` admits that role under R-DECL-11, including the implicit
  admin and narrow checker floor. With delegated credentials it must also
  be delegable, have an entry in the unchanged signed kind-to-binding map,
  and that entry must equal the active kind's binding. A direct own-key
  caller needs no grant map. Do not test a target, held thread, policy
  refusal, proposer/holder exclusion or exact check-job qualification here;
  those remain admission questions.
- **Generic `act` uses existence, not a grant named `act`.** List it in a
  selected set that includes it if at least one declared kind satisfies
  that predicate. Platform-only grants do not qualify. An all-stale map
  qualifies no kind; a mixed map qualifies its current permitted entries
  without requiring every other entry to stay current. A renamed kind
  with a `check` step is eligible by its declaration, role and signed
  binding, not by the literal name `check`; v2 generic-check transport
  limits remain R-CRED-10. Under an active `v1` document, generic `act` is
  not listed, because a v2 envelope there is `bad-request` (R-DECL-16).
- **Named act tools use the same authority facts.** Under `v2`, their
  built-in binding must also match the active declaration and, for a
  delegated caller, its signed map entry. Under `v1`, use the frozen
  legacy role/kind and delegation rules. Platform `renew` uses its plain
  platform grant and role floor. The eligible new MCP act kinds for the
  default override are the union of these named kinds and the eligible
  generic kinds, before the selected presentation set is applied. Thus a
  permitted `renew`-only grant may list named `renew` but never generic
  `act`; a grant with no eligible new MCP act kind gets `observer`.
- **No grant changes during discovery.** Do not expand a map, substitute a
  current binding for a signed stale one or grant a newly declared kind.
  `acts` remains an authenticated read in every set, even when no new act
  is eligible. Read, workspace and operation methods retain their normal
  Room permission checks.
- **Lists depend only on authorization,** never on earlier calls, as the
  [MCP tools specification, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
  requires. Listing is deterministic for the same tools and authorization.
- **Listing is not permission.** A call to a core tool that is not listed
  runs and is judged by the room like any other call. The discovery
  predicate must not reject an unlisted invocation. An authenticated
  exact retry keeps its original envelope or caller-supplied binding and
  may return its accepted receipt under R-IDEM/R-CRED-10, even if no new
  call of that kind would now be listed. Never rebind it to make it visible.

**R-API-15. MCP waiting.** A `waitMs` is at most 45,000 (`McpMaxWaitMs`),
below common client tool timeouts. A larger value is `bad-request`.
- `workspace` and `land`: as R-API-9, within that bound.
- `attention`: when the page after `cursor` would be empty, the server waits
  for the next update that carries attention items for the caller (over a
  bearer, on `RoomWire.subscribe`), then reads the page again. At `waitMs`
  it returns the empty page with its cursor. A `waitMs` of 0 (the default)
  never waits.
- `operation`: waits until the operation reaches one of `until` (default:
  the kind's terminal states). At `waitMs` it returns the operation's
  current state, not an error, so the caller calls again to keep waiting.
- Waiting never holds a lease, a slot or any room state; it is a read.

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
| **Isolated public creation.** Draft with repository source `new`, sign, found; found again with the same body | `genesis.repo` is a fresh identity in the public namespace, with no `onboarding`; the repository is created after the registry binding, with `main` at one commit with no files and no live credential; entry 0 is the genesis, entry 1 `policy-activated` with `checkers`; the second `found` returns the same room ID | R-GEN-10, R-GEN-12, R-GEN-13, R-POL-9 |
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
| **MCP keys.** `claim` with no `idempotencyKey`; `claim` with a key, its response lost, then the same call again | `bad-request` and nothing recorded; then one claim, and the retry returns its receipt | R-API-9, R-CRED-10 |
| **MCP reads.** `lane` and `proposal` of unknown IDs; `lanes` with `touches` | `{ outcome: "not-found", what }` for each; the overlapping lanes | R-API-9 |
| **MCP operation errors.** `RoomApi.op` throws lookup `not-found`; separately it throws `unauthenticated`, `forbidden` or `unavailable` | Only the lookup becomes `{ outcome: "not-found", what: "operation" }`; each other failure keeps its error | R-API-9 |
| **MCP descriptors.** `tools/list` as an admin, under an active `v2` document and under an active `v1` document | Under `v2`: the fourteen named tools, then `acts` and `act`, in a fixed order, the act tools subject to binding and authorization. Under `v1`: the fourteen named tools and `acts`, with the generic `act` absent. In both, each tool has a title, an output schema and annotations, and the instructions are at most 512 characters | R-API-13, R-API-14, R-DECL-16 |
| **MCP refusal conforms.** A `propose` refused `outside-claim` | Structured content validates against the tool's `outputSchema`; the text gives rule, reason and fix | R-API-13, R-API-1 |
| **MCP toolsets.** `tools/list` as an `agent`; as an `agent` with `?toolset=reviewer`; with `?toolset=nope`; as a bearer whose delegation lacks `land` | The builder twelve and reviewer seven named tools, each composed with the generic tools and filtered by authorization; `bad-request`; the builder list without `land` | R-API-14, R-DECL-16 |
| **MCP checker default.** A direct checker; a delegated checker with one eligible declared check kind; a delegated checker with no eligible new MCP act kind | The reviewer presentation filtered by authority for the first two; observer for the third; no review or claim authority in any case | R-API-14, R-DECL-11 |
| **MCP generic discovery.** A v2 bearer with only platform grants; an all-stale signed map; a mixed map with one current eligible entry; a grant for a renamed check kind | Generic `act` absent for the first two, present for the latter two in a set that includes it; signed grants unchanged | R-API-14, R-CRED-10 |
| **MCP discovery after authorization changes.** The role or declaration's `who` stops admitting the caller; the declaration stops allowing delegation; a direct own-key caller has no grant map | The first two remove that kind's eligibility; the own-key caller uses its current role and declaration; HTTPS and stdio give the same list for the same authorization | R-API-14, R-DECL-11 |
| **MCP unlisted call.** An `agent` on `?toolset=observer` calls `claim` | The claim is judged and recorded as usual | R-API-14 |
| **MCP unlisted exact retry.** A still-authenticated caller retries an accepted act with its original key and binding after that kind ceases to qualify for discovery | The accepted receipt returns under the normal retry rules; no new act or substituted binding | R-API-14, R-CRED-10, R-IDEM-2 |
| **MCP waiting.** `attention` with `waitMs: 30000` and an empty page, then a note notifies the caller; `operation` on a preparing landing with `waitMs: 1000`; any tool with `waitMs: 60000` | The page with the note's item, before 30 s; the operation's current state, no error; `bad-request` | R-API-15 |
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

## 28. Amendment 66d6fb14: `refuse` rules before the claim check

Request 66d6fb14 added the `jj-conflicts` rule to the default policy pack
(docs/policy-pack.md). Its condition is that a proposal adding
`.jjconflict-side-0/` is refused with that rule, not `outside-claim`.
Under R-ADM-1 as written, platform invariants (step 8) ran before policy
`refuse` rules (step 9), so `outside-claim` always came first.

| Change | Rules | Types | Who adapts |
|---|---|---|---|
| For `propose`, `refuse` rules run inside step 8: after R-PROP-1, R-PROP-3 and R-PROP-6, before R-PROP-4 and the remaining invariants. `require` rules stay at step 9 | R-ADM-1 | — | Room (lane A): evaluate `refuse` rules for `propose` before the claim check, with the same act meter as `require` |

Not part of this amendment: the rule sees only the proposal's changes, so
conflict data left untouched on the lane's base is not refused. A check of
the whole head would need a Room-owned, bounded fact about the proposed
head's root entries in the `refuse` rule input. That is a candidate for a
later amendment.

## 29. Contract amendment 3 (bc351fa8): checks, check jobs and snapshots

Request bc351fa8 asked the contract to define how checks carry, where the
runner environment comes from, the filtered snapshot commit, and the check
job, so that lanes A (the Room) and G (the checkers) can integrate. It also
asked for two decisions about jj support. This section holds every new
rule, so that the rest of the document changes as little as possible.
Where a rule here amends an earlier one, it says so; the earlier rule is
read with the amendment. Section 28 is left to request 66d6fb14, which
changes the order of `refuse` rules for `propose`.

### 29.1 Check carry is recorded (R-CARRY-13)

**R-CARRY-13. A check carries only by a sealed `check-carried` event.**
- When preparation judges whether an earlier check counts for a check
  obligation on a new integration, the Room seals a `check-carried` system
  event in the transaction that stores the judgment. It records the
  operation, the lane and generation, the new integration, the obligation,
  the earlier `check` act, the policy version that judged it, the outcome,
  and the `carry` rule decisions.
- The outcome is `carried` with its `CarryReason`, or `notCarried` with its
  `NotCarried`. Both are sealed: a check that does not carry is history,
  not silence (R-CARRY-5).
- The platform conditions are judged first: R-CARRY-6 to R-CARRY-12 and
  R-CARRY-14. Only if they hold are the `carry` rules whose `evidence` is
  `check` or `any` evaluated, with one act meter for the judgment
  (R-EVAL-9). `decisions` is empty when a platform condition failed or no
  rule applies.
- A carried check counts only on that integration, under that policy
  version, and only once its event is sealed. After a policy activation the
  Room judges again under the new version, with a new event.
- **Fail closed.** A Room that does not seal `check-carried` events never
  carries a check. Each check obligation is then met only by a check bound
  to the integration itself.
- Amends R-LOG-5 (the event is added to the system events), R-LOG-13 (a
  post-admission outcome in its own entry) and R-LOG-10: `artroom verify`
  replays each `check-carried` event's decisions with the policy version it
  names, and checks that `act` is an earlier accepted `check` of the same
  lane and obligation.

### 29.2 The runner environment (R-CARRY-14, R-EXEC-11)

**R-CARRY-14. The runner environment is pinned by the configuration.**
- A checker configuration may pin its runner environment:
  `CheckerConfig.runner`, a digest. Like the rest of the configuration, it
  changes only by an admin-approved proposal (R-CARRY-7, R-ADMIN-1).
- R-CARRY-6's runner condition compares the earlier check's `runner` with
  the digest pinned by the configuration active now. It never reuses the
  earlier check's own value as the current one, and never takes a value
  the checker service states after the fact.
- A check whose `runner` differs from the digest its configuration pins is
  refused `check-binding` (amends R-OBL-3).
- A checker with no pinned runner can still meet obligations with checks
  on the integration itself, but its checks never carry: `NotCarried` code
  `runner-changed`, text "No runner environment is pinned".

Why a pin, not an attestation by the checker service before each job: the
service's statement before a job is the same claim its signed check
already makes. A pin makes the environment a reviewed policy fact, and the
signed check confirms that the service ran in it.

**R-EXEC-11. The checker service measures its runner.** In each new runner
sandbox, before any job code runs, the service measures the environment's
digest (for example, a SHA-256 over the image reference and the tool
versions) and states it as the check's `runner`. When the job pins a runner
(`CheckJob.runner`) and the measured digest differs, the service runs
nothing, signs nothing, and returns a refusal `check-binding`. The service
shows the digest it measured in each check's `detail`, so that an admin can
pin it.

### 29.3 Filtered snapshot commits (R-CARRY-15)

**R-CARRY-15. A filtered snapshot is one fixed commit.**
1. **Files.** For a scoped checker and an integration, the filtered files
   are every entry of the integration's tree with mode `100644`, `100755`
   or `120000` whose path matches the checker's declared inputs or a global
   input (R-CARRY-8). Submodule (`160000`) entries are never included. The
   digest is that of R-CARRY-9.
2. **Commit.** The snapshot commit is exactly this git commit object, with
   no other header (no `parent`, `encoding`, `gpgsig` or `change-id`):

   ```
   tree <tree of exactly the filtered files>
   author Artroom Snapshot <snapshot@artroom.invalid> 0 +0000
   committer Artroom Snapshot <snapshot@artroom.invalid> 0 +0000

   Artroom filtered snapshot for <checker>

   Digest: <digest>
   ```

   The message ends with one newline. So the commit's ID is a function of
   the files, the checker name and the digest, and anyone can compute it
   again (`SnapshotIdentity`, `SnapshotMessage`).
3. **Record.** Before it issues a filtered job, the Room derives the
   commit and records it with the canonical integration, the checker, the
   configuration digest, the snapshot digest and the paths.
4. **Store.** The publisher writes the commit into its own snapshot
   repository (R-CARRY-16). The Room issues the job only if the commit the
   publisher wrote has the ID the Room recorded; otherwise it issues
   nothing and retries later.
5. **Binding.** A filtered job's `integration`, and its check's
   `integration`, is the snapshot commit, not the canonical integration.
   The Room admits a filtered check only if its `integration` is a snapshot
   commit it recorded for this checker and generation, and `input.snapshot`
   and `input.paths` equal the recorded digest and paths. The check then
   counts for the canonical integration recorded with the snapshot. Any
   other filtered check is refused `check-binding`. Amends R-OBL-3.

**R-CARRY-16. A filtered job reads only its own snapshot.** A runner must
not be able to read any file outside its own snapshot, whatever it asks
the server for: an advertised ref, or the ID of another commit, tree or
blob it learned elsewhere (R-CARRY-9, R-EXEC-7). So isolation comes from
what the repository holds and what the token reaches. It never depends on
what the runner checks out, on the snapshot having no parents, on IDs
being undisclosed, or on refs being removed.
- **One repository per snapshot commit.** The Room creates a new, empty
  repository for each snapshot commit. The publisher writes into it that
  commit and exactly the trees and blobs it reaches, under one ref,
  `refs/artroom/snapshot`, and nothing else, ever. A repository is never
  given a second snapshot, and no object or ref is added to it later.
- **One token per job.** For each filtered job the Room mints a read token
  for that repository only, expiring no later than the job's `deadline`.
  The job's `readUrl` is that repository (R-EXEC-9). A token never reaches
  another snapshot's repository, the canonical repository, or a fork.
- **Reuse only for the same commit.** Jobs that name the same snapshot
  commit, and so the same files, may share its repository, each with its
  own token. A job for any other snapshot, including the same checker after
  its configuration or the integration changed, gets its own repository.
- **Retirement.** The Room deletes the repository, and revokes every token
  minted for it, when its last job ends, or at the latest 24 hours after,
  if it keeps the repository for reuse by the same commit. Deletion and
  revocation are durable cleanup duties: recorded when owed, and retried
  until Artifacts confirms them, as for workspace tokens (R-WS-3).
- Amends R-CARRY-9, whose words "the runner receives only that snapshot"
  this rule makes concrete, and replaces the per-checker snapshot
  repository that amendment 3 first proposed.

### 29.4 Check jobs (R-EXEC-8 to R-EXEC-10, R-OBL-7)

**R-EXEC-8. The Room issues jobs, over a service binding only.**
- The Room issues every `CheckJob`, and nothing else does. It issues one
  when a check obligation waits on an integration: a preview's or a
  landing operation's. For a scoped checker it issues the job only after
  R-CARRY-15 steps 3 and 4.
- A job travels only over a Workers service binding, from the Room's
  Worker to the checker service's `CheckerService.handle`. The service
  exposes no other route that accepts or builds a job. The service binding
  is the job's authentication: only a Worker that the operator binds to
  the service can call it. Jobs are not signed, and no signing domain
  exists for them.
- **The trust boundary is the operator's.** A deployment binds only
  trusted Room producers to the checker service, and a production
  deployment excludes any harness route that builds jobs. A caller bound
  to the service is trusted to submit only jobs the Room recorded. The
  service does not otherwise verify a job's origin: a bound caller can make
  it run code against any repository its token reaches.
- Within that boundary, two checks catch mistakes. The service checks the
  job's binding before it starts a sandbox (room, checker, the read URL's
  host, the `gitAuthEnv` shape, the deadline), and refuses with
  `check-binding`. The Room admits a resulting check only if it binds an
  integration or a snapshot that the Room recorded (R-OBL-3, R-CARRY-15).

**R-EXEC-9. Git's credential and the runner's environment.**
- `CheckJob.gitAuthEnv` is exactly three variables (`GitAuthEnv`):
  `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=http.extraHeader`, and
  `GIT_CONFIG_VALUE_0=Authorization: Bearer <token>`. The token is
  read-only, for the repository of `readUrl` only, and expires no later
  than `deadline`. For a filtered job, that repository holds only the
  job's own snapshot (R-CARRY-16).
- The service may route the runner's git through a gateway that holds the
  token, so that the token never enters the runner. Then the runner's
  process environment holds `PATH` and the variables that name the
  gateway's certificate authority (`GIT_SSL_CAINFO`,
  `NODE_EXTRA_CA_CERTS`), and nothing else. Amends R-EXEC-3, which allowed
  only `gitAuthEnv` and `PATH`.
- The token never appears in a check, its detail, or any log (R-WS-4).

**R-EXEC-10. What a job carries besides the commit.**
- `base`: the canonical main commit that the integration was built on,
  that is the landing's `expectedMain` or the preview's base. A
  review-style checker compares `base` with `integration`. A filtered job's
  runner cannot read `base`.
- `volatile`, `advisory` and `runner`: copied from the configuration whose
  digest is `config`.
- A signed check's `volatile` must equal its configuration's `volatile`,
  either way. Otherwise the Room refuses it with `check-binding`. A checker
  whose own inputs are volatile refuses a job that says `volatile: false`,
  with `check-binding`, rather than sign a false flag.

**R-OBL-7. Advisory obligations.**
- A check obligation is advisory when its checker's configuration says
  `advisory: true`, in the policy version that made the obligation
  (`CheckObligation.advisory`). It is recomputed at activation like any
  obligation (R-POL-9).
- The Room requests it like any check obligation: an attention item and a
  job. Its checks follow every binding rule, are recorded as evidence, and
  are shown.
- It never blocks a landing. `land` admission (R-LAND-1), readiness
  (R-LAND-4) and reservation (R-LAND-7) do not wait for it. A failing
  advisory check never fails a landing with `check-failed`, and
  `obligation-open` never names it.
- Only an admin-approved change to `.artroom/checkers/**` makes a checker
  advisory (R-ADMIN-1). A `require` rule cannot.

### 29.5 Two decisions about jj

38. **No fact about the proposed head's root entries (kept open).** The
    `jj-conflicts` rule (request 66d6fb14) refuses a proposal that adds or
    changes jj conflict data. A whole-head check would need a Room-owned,
    bounded fact in the `refuse` rule input: the names of the head tree's
    root entries. It is not added, for three reasons:
    - Conflict data already on the lane's base came through `main`. A
      changes-only rule refuses it when it is introduced, so it reaches
      `main` only if it predates the rule or came through a
      configuration-recovery lane.
    - A whole-head refusal would refuse every proposal on every lane while
      `main` holds such data, instead of the one lane that should remove
      it.
    - No consumer of the fact has landed, and the reviewed rule is
      changes-only by design.

    A later amendment can add `PolicyProposal.headRoot`: the root entry
    names, sorted, at most 1,024, with a flag when there are more. It would
    be a value, never a key (R-EVAL-3), and part of the replay context.
39. **No Room read of a generation's commits (kept open).** Lane F's
    per-change history needs, for each proposal generation, the commits
    from base to head with their parents, subjects and `change-id` headers,
    and the trees or interdiffs of those commits under lane B's bounds. It
    is not added, for three reasons:
    - No Room read returns commits or file contents today. Which members
      may read the canonical repository's objects through the Room is an
      access decision of its own.
    - The view is author-supplied, and never an input to obligations,
      evidence or carrying, so nothing depends on it for correctness.
    - Lane F's screen already shows nothing extra when the read is absent.

    A later amendment can add a read session route,
    `GET /v1/rooms/:room/lanes/:lane/:generation/commits`, returning at most
    2,000 commits (`id`, `parents`, `subject`, raw `change-id` header),
    with per-commit diffs under lane B's tree-diff bounds.

These points continue section 22's list.

### 29.6 Acceptance cases

Each is normative.

| Case | Expected result | Rules |
|---|---|---|
| **Check carried.** A pinned, non-volatile checker passed on integration I1; main moves; I2 has the same tree; a carry rule for checks allows it | A `check-carried` event with outcome `carried`, reason `tree-identical`, and the rule's decision; the check counts on I2 only after the event; `artroom verify` replays the decision | R-CARRY-13 |
| A carry rule for checks refuses it | A `check-carried` event with `notCarried` code `policy-rejected` and the decision; a new job is issued for I2 | R-CARRY-13, R-CARRY-4 |
| A policy activation after the carry | The carry stops counting; a new `check-carried` event under the new version | R-CARRY-13 |
| A Room that seals no `check-carried` events | No check carries; each obligation waits for a check on I2 | R-CARRY-13 |
| **Runner.** The configuration pins runner R; a check states runner S | Refused `check-binding` | R-CARRY-14, R-OBL-3 |
| The pin changes from R to S by an approved proposal; a check made under R is judged for carrying | `notCarried`, code `config-changed` or `runner-changed`: the current pin, not the earlier value, is compared | R-CARRY-14 |
| No runner pinned | The check meets the obligation on its own integration; it never carries (`runner-changed`) | R-CARRY-14 |
| The job pins R and the service measures S | The service runs nothing and returns `check-binding` | R-EXEC-11 |
| **Snapshot.** Two Rooms, or the Room and a third party, compute the snapshot commit for the same files, checker and digest | The same commit ID | R-CARRY-15 |
| The publisher writes a snapshot commit with another identity or time | Its ID differs from the recorded one; no job is issued | R-CARRY-15 |
| A filtered check names an unrecorded commit, another checker's snapshot, or another digest | Refused `check-binding` | R-CARRY-15 |
| A filtered check names the recorded snapshot | Admitted; it counts for the canonical integration recorded with the snapshot | R-CARRY-15 |
| **Older snapshot, omitted file.** Snapshot S1 included `src/secret.txt`; the current snapshot S2 omits it. The S2 job's runner fetches S1's commit, and the blob of `src/secret.txt`, by their known IDs, and lists the server's advertised refs | Each fetch fails: the S2 repository has no such object. The only advertised ref is `refs/artroom/snapshot`, at S2. The runner cannot read the file | R-CARRY-16, R-CARRY-9 |
| **Exact current commit.** The same runner fetches S2's commit by its ID and checks it out | It succeeds, and `HEAD` is S2 | R-CARRY-16, R-EXEC-4 |
| **Concurrent jobs, different snapshots.** Two filtered jobs, for snapshots S2 and S3, run at once | Each job's token reads only its own repository; each runner fails to fetch the other's commit or blobs, by ID or by ref | R-CARRY-16 |
| **Configuration change.** An approved proposal changes the checker's declared inputs; the next job's snapshot is S4 | S4 gets a new repository; the S2 job's token cannot read it, and the S4 job's token cannot read S2's | R-CARRY-16 |
| **Retirement.** The last job for S2 ends | Within 24 hours the S2 repository is deleted and every token minted for it is revoked; an Artifacts outage leaves both owed and retried | R-CARRY-16 |
| **Jobs.** A request to the checker service from anything but the service binding | No route accepts it | R-EXEC-8 |
| A job with a `gitAuthEnv` of any other shape, or for another host | Refused `check-binding` before any sandbox starts | R-EXEC-8, R-EXEC-9 |
| A signed check whose `volatile` differs from its configuration, either way | Refused `check-binding` | R-EXEC-10 |
| A volatile checker receives a job that says `volatile: false` | The service refuses it; nothing is signed | R-EXEC-10 |
| **Advisory.** An advisory checker's check fails on the landing's integration | The landing proceeds; the failing check is recorded and shown; `obligation-open` is never raised for it | R-OBL-7 |

### 29.7 Conditions and changes

| Condition | Rules | Types (`packages/contract`) |
|---|---|---|
| (1) Check carry recorded, or fail closed | R-CARRY-13; amends R-LOG-5, R-LOG-10, R-LOG-13 | `SystemEvent` gains `check-carried` |
| (2) Runner environment | R-CARRY-14, R-EXEC-11; amends R-CARRY-6, R-OBL-3 | `CheckerConfig.runner?`; `CheckJob.runner`; `CheckCarryFacts.now.runner` documented as the current pin |
| (3) Filtered snapshot commit, binding, who issues jobs | R-CARRY-15, R-CARRY-16 (one repository per snapshot commit, one token per job), R-EXEC-8; amends R-OBL-3 and R-CARRY-9 | `SnapshotIdentity`, `SnapshotMessage`; comments on `CheckJob.integration` and `CheckBody.integration` |
| (4) Jobs: authentication, `gitAuthEnv`, advisory, base, volatile | R-EXEC-8 (service binding), R-EXEC-9, R-EXEC-10, R-OBL-7; amends R-EXEC-3 | `GitAuthEnv`; `CheckJob` gains `base`, `volatile`, `advisory`, `runner`; `CheckerConfig.advisory?`; `CheckObligation.advisory?` |
| (5) jj decisions | Open points 38 (head root entries) and 39 (commit history read), each with reasons and the shape a later amendment would add | — |
| (6) Additive, lane edits, gates | This section | `CheckerConfig` and `CheckObligation` fields are optional. `CheckJob` fields are required, because the Room is the only producer and a job without them is incomplete. `packages/policy`'s checker configuration validator accepts `advisory` and `runner`, with a test. `examples/check-job.ts` compiles a filtered job and a `check-carried` event |

The contract adopts what lanes A and G built wherever it is sound: lane
A's snapshot commit (`src/snapshot.ts`) and its message, lane A's
fail-closed carry and volatile check, lane A's proposed `check-carried`
event, lane G's `gitAuthEnv` shape and gateway, and lane G's measured
runner digest. It departs in three places:
- **Every check carry needs a sealed event**, not only one judged by a
  carry rule. Lane A carries a check by platform conditions alone without
  recording the judgment.
- **The snapshot commit has a fixed identity.** Lane G's `writeSnapshot`
  fixes the time but takes the author and committer from the sandbox's git
  configuration, so the Room refuses its commits.
- **Each snapshot commit has its own repository** (review 1fe39980). Lane
  G keeps every snapshot of a checker in one repository, so a runner with
  that repository's token can fetch an older snapshot and read a file its
  own snapshot omits.

### 29.8 Required lane edits

"(type)" marks an edit that a lane's typecheck forces once it builds on
this contract. Packages on main (`git`, `log`, `policy`, `ui`) typecheck
unchanged at this amendment's head. Lane B was not in the request's list,
but review 1fe39980 needs its Artifacts port and cleanup duties.

**Lane A (`packages/room`)**
1. Seal a `check-carried` event for every check carry judgment, carried or
   not, in the transaction that stores it, and count a carry only with its
   event. Until this is done, carry no check at all: today a check carries
   on platform conditions without an event (R-CARRY-13).
2. Runner: take the current runner from the active configuration's pin
   (`CheckerConfig.runner`), not from `RoomServices.runnerDigest`. Refuse a
   check whose `runner` differs from the pin with `check-binding`. A
   checker with no pin never carries (R-CARRY-14).
3. Snapshot: keep `snapshotCommit`, which matches R-CARRY-15. Before
   issuing a filtered job, check that the commit the publisher wrote has
   the recorded ID.
4. Snapshot repositories (R-CARRY-16): create a new, empty repository for
   each snapshot commit, and have the publisher write only that commit and
   its closure into it, at `refs/artroom/snapshot`. Mint each filtered
   job's read token for that repository only, expiring by the job's
   deadline, and set `readUrl` to it. Reuse a repository only for jobs
   naming the same snapshot commit. When its last job ends, or at most 24
   hours later, record its deletion and the revocation of its tokens as
   durable cleanup duties, retried until Artifacts confirms them.
5. Jobs: issue every job, only through the checker's service binding, with
   `base`, `volatile`, `advisory`, `runner` and a `GitAuthEnv`
   (R-EXEC-8 to R-EXEC-10). (type, for code and fixtures that build a
   `CheckJob`)
6. Advisory obligations: set `CheckObligation.advisory` from the
   configuration. `land` admission, readiness and reservation do not wait
   for them, and a failing advisory check does not fail a landing
   (R-OBL-7).
7. The volatile check already matches R-EXEC-10.

**Lane G (`packages/checkers`, and its copy of `packages/git`)**
1. `writeSnapshot`: set the author and committer to
   `Artroom Snapshot <snapshot@artroom.invalid>` as well as the time 0, and
   use the message the Room gives (R-CARRY-15). Write into the snapshot's
   own new repository, at `refs/artroom/snapshot` only (R-CARRY-16). Lane
   B's package takes the same change when this publisher operation lands
   there.
2. Expect a per-snapshot repository: drop the per-checker store
   (`<repo>--snap-<checker>`) from the harness, and test that a filtered
   runner cannot fetch an older snapshot's commit or blobs by ID or by
   ref, while the job's own commit fetches (R-CARRY-16).
3. `gitAuthEnvFor` returns `GitAuthEnv`. (type)
4. `checkJob`: refuse with `check-binding` a job whose `runner` differs
   from the measured digest, and, for a volatile checker, a job that says
   `volatile: false`. Sign `volatile` as the job states it (R-EXEC-10,
   R-EXEC-11).
5. Accept jobs only through the service binding. The live harness's
   job-building route must not be part of a production deployment; a
   deployment binds only the Room to the service (R-EXEC-8).
6. The LLM reviewer compares `job.base` with the integration, instead of
   the integration's first parent. Its configuration says `advisory: true`
   (R-EXEC-10, R-OBL-7).
7. Show the measured runner digest in each check's `detail` (R-EXEC-11).
8. Tests and fixtures that build a `CheckJob` add `base`, `volatile`,
   `advisory` and `runner`. (type)

**Lane B (`packages/git`)**
1. The Artifacts port (`ArtifactsNamespace`) gains creating an empty
   repository and deleting one. Today it has only `get` (R-CARRY-16).
2. The durable cleanup duties, which today cover workspace tokens, also
   cover deleting a snapshot repository and revoking its tokens: recorded
   when owed, retried until Artifacts confirms them (R-CARRY-16).
3. When `listTree` and `writeSnapshot` land in this package, `writeSnapshot`
   writes the fixed commit of R-CARRY-15 into a new repository, at
   `refs/artroom/snapshot` only, and adds nothing to it afterwards.

**Lane E (`packages/client`, `packages/mcp`, `packages/cli`)**: none. MCP is
outside this amendment.

**Lane F (`packages/ui`)**
1. Show an advisory obligation as not blocking (R-OBL-7).
2. Show `check-carried` events in the feed, and carried checks' reasons
   from them (R-CARRY-13).
3. The per-change history stays unavailable in a live room (open point
   39).

**Lane L (`packages/log`)**
1. Decode `check-carried` events: add the type to the decoder's list of
   system events and read its decisions. Today the decoder refuses an
   unknown event, so this must ship before any Room seals one.
2. `artroom verify` replays each `check-carried` event's decisions with
   the policy version it names, and checks that `act` is an earlier
   accepted `check` of the same lane and obligation (R-CARRY-13,
   R-LOG-10).

**Lane D (`packages/policy` pack and `docs/policy-pack.md`)**
1. No change is required. The checker configuration validator in
   `packages/policy` now accepts `advisory` and `runner`; this branch makes
   that edit, with a test. The guide may show an advisory checker and a
   pinned runner.

### 29.9 Review 1fe39980

Checker's review of `56eb2316` confirmed conditions 1 to 4, and found one
P2 and one wording fault.

| Finding | Change | Cases (29.6) | Lane edits (29.8) |
|---|---|---|---|
| P2 A filtered runner could fetch an older snapshot from the shared per-checker repository and read a file its own snapshot omits | New R-CARRY-16: one new repository per snapshot commit, holding only its closure under one ref; one read token per job for that repository only; reuse only for the same commit; deletion and token revocation within 24 hours of the last job, as durable cleanup. R-CARRY-15 step 4 and R-EXEC-9 point to it | Older snapshot, omitted file (by known ID and by advertised ref); exact current commit; concurrent jobs, different snapshots; configuration change; retirement | A 4; G 1 and 2; B 1 to 3 |
| Wording: a forged job was said to produce only a refused check | R-EXEC-8 now states the operator's trust boundary: only trusted Room producers are bound to the checker service, the harness route is excluded in production, and a bound caller is trusted to submit only jobs the Room recorded | — | G 5 |

## 30. Contract amendment 4 (1c785ed8): log objects within Artifacts' limit

Request 1c785ed8 asked the contract to keep every git object the log
writes under Artifacts' object limit, and to report a refused push as a
definite failure. The bounded-memory log work (request a6aa60c9, landed at
main b5864882; `notes/log-bounded.md`) measured the limit on
2026-10-02: Artifacts accepts a git object of 33,554,432 bytes (32 MiB) and
refuses one byte more with `artifacts_git_receive_pack_object_too_large`.

Under R-LOG-9 as written, the active segment is one blob of up to 1,000
entries, and nothing bounds an entry's size. With entries near the 64 KiB
envelope bound, a segment passes 32 MiB at about 500 entries. The push is
then refused, lane B's `pushLog` reports the refusal as `unknown`, and the
Room retries the same cohort for ever while the log silently stops
publishing. The `inputs/` tree also grows without bound: 97 bytes per
retained file, so it passes 32 MiB at about 346,000 files.

The answer has four parts, and it adds no limit on what a room may record:
- a layout named in the signed checkpoint, so old logs verify as before
  (R-LOG-16);
- segments that close at a byte bound (R-LOG-17);
- one chunking rule for any file over the bound, including an entry line,
  and one fan-out rule for every directory (R-LOG-18, R-LOG-19);
- publication outcomes that keep every pushed commit until it is resolved,
  and report a refusal loudly (R-LOG-20).

This section holds every new rule, as section 29 does. Where a rule here
amends an earlier one, it says so; the earlier rule is read with the
amendment. Revision 2 answers review 2e38de90 (30.11).

### 30.1 Two layouts (R-LOG-16)

**R-LOG-16. The checkpoint names the layout.**
- Layout 1 is R-LOG-9 as first written. Layout 2 is R-LOG-9 with R-LOG-17
  to R-LOG-19.
- A layout 2 commit's checkpoint has `layout: { version: 2, from }`
  (`LogLayout`). It is signed with the rest of the checkpoint (R-LOG-8). A
  checkpoint without `layout` is layout 1.
- `from` is the first seq that the byte rule of R-LOG-17 places: the
  `through` of the commit's parent plus one, or 0 when it has no parent.
  The first confirmed layout 2 commit fixes it. Every later commit is
  layout 2 with the same `from`.
- Until a layout 2 commit is confirmed, a layout 2 cohort takes `from` from
  its own parent. So if an outstanding layout 1 commit lands late
  (R-LOG-20), the next layout 2 cohort builds on it, with `from` one past
  its `through`.
- The Room writes layout 2 for every cohort it builds after this amendment
  is deployed. A layout 1 commit it pushed before stays outstanding until
  it is resolved (R-LOG-20).
- Entries do not change. Their format stays `artroom-log-v1`, and the tree
  root stays `artroom-log/v1/`.

The layout is in the checkpoint because the checkpoint is in every commit,
is signed by the room key, and is an argument of `commitFor`. So a
verifier reads the layout before anything else, and `commitFor` stays a
pure function of its arguments. A log format version would change every
entry's hashed content, and a genesis field would not reach rooms founded
before this amendment.

### 30.2 Segments close at a byte bound (R-LOG-17)

**R-LOG-17. In layout 2, a segment closes at 1,000 entries or at the
object bound.**
- A segment's bytes are its lines joined by newlines (`0x0A`), with no
  newline after the last. From `from` on, each entry's line is its
  canonical line, or its `ChunkedLine` when the canonical line is over B
  (R-LOG-18).
- Entries are placed in seq order. Entry `n` starts a new segment when the
  current segment holds 1,000 entries, or when `n` is at least `from` and
  the current segment's bytes, plus one, plus the length of `n`'s line,
  would exceed the object bound B (R-LOG-19). Otherwise `n` is appended.
- Before `from`, only the count applies, so segments published under
  layout 1 stay as they are. The segment open at the switch continues under
  the byte rule. If it already holds more than B bytes, it closes at the
  switch, and entry `from` starts a new segment.
- No line placed from `from` on is over B, so every segment that holds an
  entry from `from` on is at most B bytes.
- Segment boundaries depend only on the lines' lengths and `from`. Any two
  publishers given the same parent, entries, checkpoint and retained files
  make the same commit. `examples/log-layout.ts` gives the reference
  computation (`segmentStarts`).
- In both layouts, every segment except the last never changes, and the
  last only grows. This replaces R-LOG-9's last paragraph: in layout 1 the
  segments other than the last are exactly the full ones.

### 30.3 One chunking rule (R-LOG-18)

**R-LOG-18. In layout 2, a file over B is a directory of chunks at the
same path.**
- This applies to every file of the log tree: `genesis.json`, every
  retained replay context, policy document and checker configuration, and
  the file of an entry over B (below). A segment never needs it: it is at
  most B by R-LOG-17, or it is a layout 1 segment, which keeps its blob.
- The chunks are the file's bytes in order: each exactly B bytes, except the
  last, which has 1 to B bytes. They are named by their index, as 12
  decimal digits from `000000000000`. The directory is fanned out like any
  other (R-LOG-19). A reader reassembles the bytes, then checks them as it
  would the file: a retained file by the digest in its name, an entry by
  its hash and signature.
- **An entry over B.** An entry from `from` on whose canonical line is over
  B is stored as the file `artroom-log/v1/entries/<seq>.jsonl`, which is
  therefore chunked. `<seq>` is 12 decimal digits. In its segment the entry has a
  `ChunkedLine` instead: `{"chunked":{"bytes":N,"digest":"sha256:…"},"seq":n}`
  in canonical form, where N is the line's length and the digest is the
  SHA-256 of its bytes. It has no key that an entry has, so a reader cannot
  mistake it for one.
- The entry's bytes, hash and signature are unchanged: the reassembled line
  is exactly the line the room sealed. This covers entries of any size,
  including entries sealed before this amendment and not yet published,
  and old replay contexts and policy files that were never published.
- Nothing else changes for a large entry. The Room seals, stores and
  publishes entries of any size; notifications, revert lanes, recomputed
  obligations and policy activations are recorded in full, however many
  members, paths, rules or checkers they name. R-SIG-6's envelope limit
  is unchanged.

### 30.4 The object bound and directory fan-out (R-LOG-19)

**R-LOG-19. B is 8 MiB (8,388,608 bytes), and no directory lists more than
4,096 entries.**
- B bounds every blob a layout 2 commit writes. An object's size is the
  length of its content, without git's `<type> <size>\0` header.
  Artifacts' limit was measured on that size.
- B is a quarter of Artifacts' limit, 25,165,824 bytes below it. The margin
  is large because:
  - the limit is measured, not documented, and may change;
  - the active segment is a new blob at every publication, so B also
    bounds how much of it one publication sends again. B equals one
    staging part of lane L's publisher (`LOG_TRANSFER_LIMITS`, 8 MiB).
- **Fan-out.** In layout 2 the directories `segments/`, `entries/`,
  `inputs/` and `policies/`, and every chunk directory, are fanned out by
  name. Each name has a key: 12 decimal digits for a segment, an entry
  file or a chunk, and 64 hex characters for a retained file. Keys are cut
  into groups of three digits or two hex characters.
  - A directory that would list at most 4,096 names lists them.
  - Otherwise it lists one subdirectory for each distinct next group of the
    names' keys, named by that group, and the rule applies again inside
    each subdirectory.
  - Names are never removed, so a directory that has split stays split.
    Where each name goes depends only on the set of names, so the trees are
    deterministic. `shardsOf` in `examples/log-layout.ts` is the reference.
  - Every key is unique, so the split always ends: once three decimal
    groups are used, a directory holds at most 1,000 names, and once 31 hex
    groups are used, at most 256.
  - A room with at most 4,096 of each keeps R-LOG-9's paths unchanged.
- So every tree is small. A directory of names holds at most 4,096 entries
  of at most 97 bytes, 397,312 bytes in all. A split directory holds at most
  1,000 subdirectories of 30 bytes. The root and `artroom-log/v1/` trees
  hold at most six entries. A commit is a few hundred bytes.
- **The publisher's guard.** In layout 2, every blob is at most B and every
  tree is small by construction. The publisher still checks every object
  it would write against B when it plans the commit, before the Room stores
  the cohort. An object over B means a fault in the publisher. The cohort
  is not stored and nothing is pushed, so nothing is outstanding. It is a
  definite failure, `object-too-large` (R-LOG-20). Objects reused from the
  parent by ID are not written, so they are not checked: a layout 1 segment
  over B that is already published stays.
- At the switch, every retained file moves to its layout 2 path, chunked if
  it is over B. A file at or under B keeps its blob ID. Amends R-LOG-9's
  table.

### 30.5 Publication outcomes (R-LOG-20)

**R-LOG-20. Every pushed log commit is outstanding until it is resolved,
and a stalled log attends the admins.**
- **Outstanding commits.** The Room records each log commit, with its
  parent, `through` and `hash`, durably before its first push. It stays
  outstanding until it is resolved. Every push of a commit leases its
  parent (R-LOG-8). The ref only moves forward, and only to commits the
  Room wrote, so a commit is resolved only when the ref is read back:
  - at the commit: it is **confirmed**. The Room seals its `checkpoint`
    event and builds the next cohort on it;
  - at a commit that is not its parent: it **cannot apply**, because its
    lease names a value the ref will never hold again.

  A definite refusal of one push, a read-back at the parent, the expiry of
  a write token, and its revocation each prove only that one attempt did
  not apply. An earlier attempt whose answer was lost may still apply. None
  of them resolves a commit.
- **Reading back.** After every push, and before the Room builds a cohort,
  it reads the ref. If the ref holds any outstanding commit, the Room
  confirms that commit, whichever attempt wrote it, and every other
  outstanding commit on the same parent cannot apply. If the ref holds its
  last confirmed commit, nothing has changed. Anything else is another
  writer.
- **A refused push.** A push is refused when the remote answers that it did
  not apply it. That is a `[rejected]` or `[remote rejected]` status for
  `refs/artroom/log` other than a lease refusal, or an Artifacts error code
  in answer to the pack that Artifacts gives before it updates any ref,
  such as `artifacts_git_receive_pack_object_too_large`. A lease refusal is
  still a lease mismatch, and is resolved by reading back. An answer that
  is not clear is still unknown.
- **After a refusal**, the Room:
  1. keeps the refused commit outstanding, and does not push it again;
  2. attends its admins once with `log-publication-stalled`, giving the
     reason (`refused`) and the remote's answer. A repeated refusal keeps
     the same item open; it does not add another;
  3. after at least one hour, or when it restarts (for example after a
     deployment), builds a new cohort on its last confirmed commit and
     pushes that, with the same lease. Both commits lease the same parent,
     so at most one can apply, and reading back says which;
  4. keeps admitting acts. `publishedThrough` stays where it was, and the
     lag shows it (R-LOG-11).
- **During the switch.** A refused layout 1 commit stays outstanding while
  the Room pushes a layout 2 cohort on the same parent. If the layout 2
  commit is confirmed, the layout 1 commit cannot apply. If an earlier
  push of the layout 1 commit lands late instead, the Room confirms it, and
  its next cohort is layout 2 on it, with `from` one past its `through`
  (R-LOG-16).
- **An unclear answer.** The Room pushes the same commit again, with
  backoff, as before. If a commit has been outstanding for an hour with no
  confirmed publication, the Room attends its admins with the reason
  `unresolved`, and keeps trying.
- **Another writer** gives the item with the reason `unexpected-writer`,
  and publication stops, as it does today. The Room no longer reports it
  as `publication-unresolved` with the operation `op_log`, which names no
  operation.
- **The guard** (R-LOG-19) gives the item with the reason
  `object-too-large`. The Room tries again after an hour or a restart.
- **A gone repository** (request 3da1d82b). When a publication fails and
  Artifacts answers NOT_FOUND for the canonical repository itself, the
  Room gives the item once, with the reason `repository-gone`. It keeps
  every outstanding commit and every owed cleanup, and settles nothing. It
  stops publishing and landing, and tries again only after a later entry
  is sealed, or when publication is forced.
- The item closes when a publication is confirmed.

### 30.6 Verification (amends R-LOG-10)

`artroom verify` reads each commit's layout from its checkpoint, and also
checks:
- that layout 1 commits follow R-LOG-9 as first written. So every log
  published before this amendment verifies as it did;
- that no layout 1 commit follows a layout 2 commit, that every layout 2
  commit has the same `from`, and that the first one's `from` is its
  parent's `through` plus one, or 0 when it has no parent;
- that a layout 2 commit's segments start exactly where R-LOG-17 says;
- that every blob in a layout 2 commit is at most B bytes, except segments
  that hold only entries before `from`, and that every directory follows
  R-LOG-19's fan-out;
- that each `ChunkedLine` names an entry file whose reassembled bytes have
  its length and digest, and whose entry has its seq. The entry is then
  checked like any other;
- in both layouts, that every segment except the last is unchanged in each
  later commit, and that the last segment's lines are a prefix of the same
  segment's lines in the next commit;
- that in layout 2 each retained file is at its fanned-out path, named by
  its digest, and reassembled first if it is chunked. A file at any other
  path carries no meaning (R-LOG-14).

Each needs a named failure reason, such as `layout-changed`,
`segment-bound` and `chunk-mismatch`.

### 30.7 Acceptance cases

Each is normative. The limits these cases name are the layout's real
ones. The tests show most cases at small limits set for the test
(`setLayoutLimitsForTests`), since each rule is about where a limit falls
and not about its size; the 8 MiB segment bound and the 4,096-entry
directory bound are also shown at their real size
(request `ecbc722a`).

| Case | Expected result | Rules |
|---|---|---|
| **Byte close.** Layout 2; entries near the 64 KiB envelope bound | After about 128 entries, the next entry starts a new segment, because it would take the first past 8,388,608 bytes. Every segment is at most B; earlier segments never change; verify passes | R-LOG-17 |
| **Count close.** Layout 2; small entries | Segments close at 1,000 entries, as in layout 1 | R-LOG-17 |
| **Edge.** An entry that brings the segment to exactly B bytes, newlines included; then one that would bring it to B + 1 | The first is appended; the second starts a new segment | R-LOG-17 |
| **Determinism.** The same parent, entries, checkpoint and retained files, given to two publishers and to one publisher before and after a restart | The same commit ID each time; its segments, chunks and shard directories are where `examples/log-layout.ts` says | R-LOG-17 to R-LOG-19 |
| **Old log.** A layout 1 log whose full segments include one of 20 MiB | Verifies as before | R-LOG-16, 30.6 |
| **Switch, large open segment.** A layout 1 log confirmed through W, whose open segment holds 300 entries and 20 MiB | The next commit has `layout: { version: 2, from: W + 1 }`; that segment is unchanged and closed; entry W + 1 starts a new segment; verify passes across the switch | R-LOG-16, R-LOG-17 |
| **Switch, small open segment.** The open segment holds 3 entries at the switch | It continues, and closes at 1,000 entries or at B | R-LOG-17 |
| **Unpublished old entry over B.** A layout 1 log confirmed through a 10-byte entry 0; entry 1, sealed before the upgrade and never published, has a line of 8,388,609 bytes | The switch commit has `from: 1`. Segment 0 holds entry 0 and the `ChunkedLine` for entry 1; `entries/000000000001.jsonl` holds two chunks of 8,388,608 and 1 bytes. Every blob is at most B; the push is accepted; verify reassembles the line and checks entry 1's hash and signature | R-LOG-18 |
| **Retained prefix.** 5,000 retained files whose digests share their first two hex characters, and one replay context and one policy document of 20 MiB, never published | `inputs/<hh>/` splits again by the next two characters, so no tree lists more than 4,096 entries; each 20 MiB file is three chunks; verify finds and checks each by its digest | R-LOG-18, R-LOG-19 |
| **Many segments.** A log of 5 million small entries | `segments/` splits by digit groups; every tree is under 397,312 bytes | R-LOG-19 |
| **Large notification.** A `notify` rule targets a role with 200,000 members | The `notified` event is sealed with every recipient and decision, published as a chunked entry, and verified; every recipient is notified | R-LOG-18 |
| **Large revert.** A landing that changed 100,000 paths is reverted after landing | The `revert-lane` event lists every path; the lane opens with that scope; the event is published and verified | R-LOG-18, R-REV-6 |
| **Large activation.** A landing changes the policy and adds 2,000 checker configurations, with 20 MiB of policy files; obligations are recomputed for 500 open proposals | `policy-activated` names every checker; every `obligations-recomputed` event is sealed; each file over B is chunked; verify replays every decision | R-LOG-18, R-POL-9 |
| **Layout regression.** A layout 2 commit followed by a layout 1 commit, or by a layout 2 commit with another `from` | Verify fails with `layout-changed` | 30.6 |
| **Misplaced boundary.** A layout 2 commit whose segment starts differ from R-LOG-17 | Verify fails with `segment-bound` | 30.6 |
| **Bad chunk.** A chunk of an entry file or retained file is changed | Verify fails with `chunk-mismatch` | 30.6 |
| **Guard.** A faulty publisher plans an object over B | The cohort is not stored and nothing is pushed; admins get `object-too-large` | R-LOG-19, R-LOG-20 |
| **Refused push.** Artifacts answers `artifacts_git_receive_pack_object_too_large` (the response recorded on 2026-10-02) | Lane B reports `refused` with the code; the ref reads back at the parent; the commit stays outstanding and is not pushed again; admins get one `log-publication-stalled` item; acts are still admitted | R-LOG-20 |
| **Refused, by status.** A `[remote rejected]` status for `refs/artroom/log` | As for the refused push | R-LOG-20 |
| **Late earlier push.** Push 1 of commit C on parent P gets no clear answer; push 2 of C is refused; the ref reads back at P. An hour later the Room pushes cohort D on P; then push 1 lands | Either D's push fails its lease and the ref holds C, or the ref holds D. If C: the Room confirms C, seals its checkpoint event, D cannot apply, and the next cohort builds on C. If D: C cannot apply. No `unexpected-writer` either way | R-LOG-20 |
| **Late push during the switch.** As above, with C a layout 1 commit and D the layout 2 switch commit | If C lands, the next cohort is layout 2 on C with `from` one past C's `through`; if D lands, `from` is one past P's `through`. Verify passes either way | R-LOG-16, R-LOG-20 |
| **Unclear answer.** The connection drops after the pack is sent | `unknown`: the same commit is pushed again. After an hour with no confirmation, admins get `unresolved` | R-LOG-20 |
| **Recovery.** A room whose layout 1 commit was refused, because its open segment is over 32 MiB, is upgraded | Its next cohort is layout 2 on the confirmed parent; it is accepted; the refused commit cannot apply; the admins' item closes | R-LOG-16, R-LOG-20 |

### 30.8 Conditions and changes

| Condition | Rules | Types (`packages/contract`) |
|---|---|---|
| (1) A segment closes at a byte bound; every log object under the limit with a margin; entries over the bound; other unbounded objects; layout kept otherwise; `commitFor` deterministic | R-LOG-16 to R-LOG-19; amends R-LOG-9 and R-LOG-10 | New `LogLayout` and `ChunkedLine`; `Checkpoint.layout?`; comments on `PublishedLayout`, which gains `entries/` |
| (2) A refused push is a definite failure with an admin item | R-LOG-20; amends R-LOG-8 and the Room's pending-cohort rule | `AttentionWhy` gains `log-publication-stalled` |
| (3) Lane edits and acceptance cases | 30.7, 30.9 | `examples/log-layout.ts` gives `segmentStarts`, `chunks` and `shardsOf` |
| (4) Amendment and review only | This section | — |

Both type changes are additive. `Checkpoint.layout` is optional, so every
checkpoint published before this amendment still has the type. The new
attention item is a new case of a union; a `switch` over `why` must handle
it.

### 30.9 Required lane edits

"(type)" marks an edit that a lane's typecheck forces. Packages on main
(b5864882) typecheck at this amendment's head, because this branch adds
the new attention case to lane F's screen and lane E's CLI.

**Lane L (`packages/log`, including `artroom verify`)**. The publisher of
request a6aa60c9 (main b5864882) streams each segment from an
`EntrySource`, builds every commit in one synchronous `plan`, and keeps
an `Index` of its last commit. Its edits:
1. `plan` writes the layout the checkpoint names. For layout 2: segment
   starts by R-LOG-17; a `ChunkedLine` and a chunked entry file for a line
   over B; chunked retained files and `genesis.json` over B; and fanned-out
   directories by R-LOG-19. The `Index` keeps each segment's `first` and
   blob ID, and the names in each shard directory, instead of lists by
   position. Closed segments and existing shards are reused by ID and not
   read. Layout 1 output does not change, so the comparison with
   `test/support/publisher-417a1618.ts` still holds for layout 1.
2. A line over B is hashed and sent in B-byte chunks, read in parts, so the
   publisher's memory stays bounded as R-LOG-9's segments' does. An
   `EntrySource` may return a large line in parts.
3. `commitFor` stays synchronous. With the publisher's last commit as the
   parent, it uses the `Index`. With any other parent, it places every
   segment from `entries` and the checkpoint's `from`, as `segmentStarts`
   does.
4. The guard (R-LOG-19) goes in `plan`, over every planned object's size,
   so `commitFor` and `publish` both refuse, with a new `PublishError` code
   `object-too-large`, not retryable.
5. `GitRemote.push`'s `PushOutcome` gains
   `{ ok: false, reason: "refused", code, detail }`. After it, read back:
   at the commit, done; at the lease, fail with a new code `refused`, not
   retryable, without pushing again; anything else, `unexpected-writer`
   carrying the ref's value, so the Room can match it against its
   outstanding commits. Today every outcome other than a lease mismatch
   pushes the same commit again until the attempts run out.
6. `open` and `readIndex` accept a head that is any commit the caller
   names as its own, so the Room can confirm a late commit and build on
   it. `readIndex` still reads only trees and `checkpoint.json`: it checks
   the layout 2 shape (segment names start at 0, increase, and cover at most
   1,000 entries each; directories fanned out), and leaves the byte checks
   to verify.
7. `decodeCheckpoint` accepts `layout` with `version: 2` and a seq `from`,
   and refuses any other value. `decodeEntry`'s callers recognise a
   `ChunkedLine`.
8. `artroom verify` and `readLogFiles` make the checks of 30.6, reassemble
   chunked files and follow shard directories, with named failure reasons.
   Every layout 1 check stays as it is.
9. Tests for the cases of 30.7 that need no Room.

**Lane B (`packages/git`)**
1. `toLogOutcome` maps a `rejected` outcome other than a lease refusal to
   `{ ok: false, reason: "refused", code, detail }`. Today it maps it to
   `unknown`. `LogPushOutcome` gains the case, and the test that it is the
   same type as lane L's `PushOutcome` both ways still holds. (type, through
   that test)
2. The push classifier reports Artifacts' refusal of the pack as
   `rejected` (`remote-rejected`), starting with
   `artifacts_git_receive_pack_object_too_large`. Add only codes that
   Artifacts answers before it updates any ref; keep the rule that an
   answer is never `rejected` when the ref might have changed. Test it with
   the response recorded in the live probe of 2026-10-02
   (`packages/room/measure/logbig/results/logbig-2026-10-02T02-52-36-597Z.json`).

**Lane A (`packages/room`)**
1. Write layout 2 for every new cohort, with `from` from the cohort's
   parent until a layout 2 commit is confirmed, then fixed (R-LOG-16).
2. Replace the single pending cohort with a durable list of outstanding
   commits, recorded before each first push, each with its parent,
   `through` and `hash`. Read the ref before building a cohort and after
   every push; confirm any outstanding commit found there, and mark the
   others on its parent as unable to apply (R-LOG-20). A refusal, a
   read-back at the parent, token expiry or revocation never removes one.
3. After a refusal: keep the commit, attend the admins once with
   `log-publication-stalled`, and build a new cohort on the last confirmed
   commit after an hour or a restart. After an hour outstanding with no
   confirmation, attend them with `unresolved`. Close the item on the next
   confirmed publication. Today the Room records `transport` and retries
   the same cohort silently. (type, for the new item)
4. Another writer gives `log-publication-stalled` with `unexpected-writer`,
   instead of `publication-unresolved` with the operation `op_log`.
5. Store and read entries and retained files of any size. Durable Object
   storage limits a row to about 2 MB, so a larger entry or file is stored
   in parts. Seal every system event in full, whatever its size (R-LOG-18).

**Lane F (`packages/ui`)**
1. Show the new item in the attention queue, saying that publication has
   stopped for `unexpected-writer` and is retried for the other reasons.
   This branch makes that edit in `NeedsYou.tsx`, so main stays green.
   (type)

**Lane E (`packages/client`, `packages/mcp`, `packages/cli`)**
1. CLI `where()` in `src/format.ts` falls through to `item.lane`, which the
   new item does not have. It needs a case that returns the item's `seq`.
   (type) This branch makes that edit, so main stays green.
2. A schema that lists the attention reasons gains the new one.

**Lane D (`packages/policy`)** and **Lane G (`packages/checkers`)**: none.

**Order.** Lane L's verify, decoder and `readLogFiles`, and lane B's
classifier, ship before any Room writes layout 2: a verifier from before
this amendment fails a layout 2 log. Lane L's edits above are written
against the bounded-memory publisher (request a6aa60c9), which is on main.

### 30.10 Open points

These continue section 22's list.

40. **The object limit is measured, not documented.** If Artifacts lowers
    it below B, the guard does not catch it: each push is refused and
    R-LOG-20 reports it. A smaller B would need a layout 3.
41. **Reads of a very large entry.** The log is published whatever an
    entry's size, but the API returns whole entries in a page (R-API-6). An
    entry larger than a transport's message limit, such as a Workers RPC
    call's, needs a read in parts. This amendment does not define one.

### 30.11 Review 2e38de90

Checker's review of `993e95d9` kept the signed `Checkpoint.layout` with a
fixed `from`, the byte-based segment close, the loud refusal item and the
order of verifier before writer, and found three P2s.

| Finding | Change | Cases (30.7) | Lane edits (30.9) |
|---|---|---|---|
| P2 An entry over B sealed before the upgrade and not yet published made the log unpublishable for ever | R-LOG-18 is now one chunking rule: any file over B is a directory of B-byte chunks at its path; an entry over B is the chunked file `entries/<seq>.jsonl`, with a `ChunkedLine` in its segment. Bytes, hash and signature are unchanged. Old replay contexts and policy files are covered by the same rule | Unpublished old entry over B; retained prefix; bad chunk | L 1, 2, 7, 8; A 5 |
| P2 A refused retry does not prove that an earlier attempt will not apply | R-LOG-20 keeps every pushed commit outstanding until the ref is read back at it (confirmed) or at another commit (cannot apply). Refusal, read-back at the parent, expiry and revocation resolve nothing. A new cohort after a refusal leases the same parent, so at most one applies. `from` is fixed by the first confirmed layout 2 commit. Unclear answers attend the admins after an hour (was open point 40) | Late earlier push; late push during the switch; unclear answer; recovery | L 5, 6; A 1 to 3 |
| P2 Object size became a limit on what a room may record, and trees could still grow past B | The 1 MiB entry bound, the 1 MiB policy and checker configuration bounds, the 256-checker cap and the table of dropped events are removed: entries and files of any size are recorded in full and chunked. R-LOG-19 fans out `segments/`, `entries/`, `inputs/`, `policies/` and chunk directories by name groups, so no directory lists more than 4,096 entries. `log-entry-too-large` is removed, and `log-publication-failed` is renamed `log-publication-stalled` with the reason `unresolved` | Large notification; large revert; large activation; many segments; retained prefix | L 1; A 5; F 1; E 1 |
| Wording: the UI said every stalled publication is retried | The UI says that publication stops for `unexpected-writer` | — | F 1 |

## 31. Request c657d4ba: joins and redemption

Simplification review 55563589 found three defects in joins and
redemption (SEC-01, SEC-02 and SEC-07). No type changes.

| Finding | Change | Rules | Who adapts |
|---|---|---|---|
| SEC-01 A client redemption issued a session for whatever admission returned, including the stored result of a join copied from the log, so anyone who could read one join got a renewable read session as that member | A session only for a join the call admitted; a repeat is refused `invitation-invalid` | R-CRED-9 | Room; the client's `join` recovers a lost response by resubmitting and signing a `session` request |
| SEC-02 A `join` refused at steps 7 to 9 on `POST /acts` or `RoomWire.submit` was recorded with its envelope, publishing a secret whose invitation stayed usable. R-ADM-8 required it; R-GEN-6 forbade it | A refused join is never recorded, on any path; R-ADM-8 names the exception | R-ADM-8, R-GEN-6, R-SEC-4 | Room |
| SEC-07 The redemption limit keyed unvalidated input, never dropped a counter, put every service-binding caller under one address, and did not count joins on `/acts` | Validated invitation IDs only; bounded counters; no address for service bindings; joins on every path count against the invitation | R-CRED-9 | Room |

## 32. Contract amendment 5 (10fcfe4e): canonical token mints

Request 10fcfe4e asked who owns each token the Room creates on the
canonical repository, from the request to its end. Checker audit handoff
9f2d8808 found that a lost answer, a hidden retry or a host that stops can
leave a token outside every record. The Artifacts interfaces examined (the
Workers binding and REST pages, 2026-10-02) document no way to name a
token when it is created, and no way to learn that a failed create will
never apply. So these rules keep a durable record and a stored wake-up
before each request, and never revoke a token that the Room cannot match
to its own record by ID. Revision 2 answers checker report 9ff903ab;
revision 3 answers the checker's follow-up on landing token IDs and check
job deadlines; revision 4 makes four consistency repairs (a check job's
late token, overdue wake-ups, and removal of keyed records at expiry);
revision 5 answers checker report 851b215b.

The design, the mint sites, the provider evidence, and each lane's edits
and tests are in
[notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md).
These rules add obligations to R-PUB-3, R-LOG-8, R-CARRY-15, R-PROP-1,
R-PROP-2, R-PROP-7 and R-EXEC-9. They change no token lifetime and no
landing rule.

**R-MINT-1. Scope.** A *canonical mint* is a token that the Room creates
with Artifacts' token-creation call on its canonical repository: for
publication (R-PUB-3), staging an integration, pinning and previews, log
reads and pushes (R-LOG-8), reading the canonical repository to prepare a
snapshot (R-CARRY-15), and check jobs (R-EXEC-9). These rules apply to
every canonical mint. Tokens on a lane fork or a snapshot repository, and
the token that comes with a created repository or fork, are not canonical
mints (R-CRED-8, R-CARRY-16, R-GEN-12). Development harnesses are not
covered.

**R-MINT-2. A record and a wake-up before each request.**
- Before the Room sends a create request, it writes a durable record of
  it: its owner (the operation, attempt or purpose), its scope and the
  lifetime asked for, and any absolute bound (`notAfter`) on the token's
  expiry. It then stores a wake-up no later than the record's takeover
  time (R-MINT-7). If either cannot be stored, the request is not sent.
- The lifetime asked is computed after the wake-up is stored, just before
  the request is sent, so a slow wake-up cannot carry it past `notAfter`.
- Each request has its own record. A request is never sent again under
  the same record. A retry after a transient error is a new request with
  its own record, sent only after the earlier record holds that request's
  outcome.

**R-MINT-3. What a create's answer settles.** The request's own answer is
applied to its own record only, whenever it arrives, including after the
record became unknown:
- An answer that gives a token ID makes the token known. In one
  transaction, the record becomes the record of that token, by its ID,
  with the expiry Artifacts reported, or with no expiry if it is
  unreadable.
- The token may be used only if the answer also gives its text, the scope
  asked, and a readable expiry no later than both the answer's arrival
  plus the lifetime asked plus 5 seconds, and the request's `notAfter`,
  and only by a caller still waiting for it. The 5 seconds allow for
  Artifacts setting the expiry by its own clock, which ran 67 ms ahead of
  the Room's on the spike (request df6ff8d3); `notAfter` has no
  allowance. This check runs before the token is given to any caller or
  claimed by any owner. Otherwise it is owed revocation at once, and no
  one uses its text.
- A check job's request carries the job's deadline as `notAfter`, and an
  attempt whose deadline has passed is never sent; its token is ended
  instead (R-EXEC-9).
- An Artifacts error that says the request was refused and changed
  nothing (`refusedUnchanged`) closes the record.
- Any other result leaves the outcome unknown. That includes a transport
  failure, `INTERNAL_ERROR`, an answer without a token ID, a caller's
  bounded wait running out, and a host that stopped before it recorded
  the answer.
- Once an answer has given a token ID, the ID is written durably before
  any revocation of that token is attempted. If the transaction that
  records the answer fails, the write is retried with the ID still in
  hand, as the record of that token owed revocation (R-MINT-4). These
  retries are bounded: at most 3 writes. Then the token is revoked at once
  by its ID; an answered revocation closes the record, and a failed one
  leaves it owed, with its ID, for later attempts. If storage refuses
  every bounded write, the Room cannot guarantee that the duty survives:
  the record keeps its earlier state, and only the revocation at once
  remains. (Request 02836f9a, checker finding C2; planner assert 66f8b350
  and its two corrections.)
- Before a token ID is known, if the transaction that records an answer
  fails, the record keeps its earlier state.

**R-MINT-4. A known token has one owner.**
- From the moment its ID is recorded, a known token is owned by exactly
  one durable record. The record ends only when Artifacts answers the
  token's revocation or, where its owner's rule allows, when a readable
  expiry that Artifacts reported has passed. Settlement at expiry records
  no revocation. A token with no readable expiry is never settled by
  time.
- Ownership moves only in one transaction, which writes the new owner's
  record and removes the old one. A record changes only by its own
  identity and expected state, so a late completion never changes another
  owner's record.
- A token that only a host's running code was using, with no durable
  owner for a later use (as a check job has until its deadline), is owed
  revocation at once when the Room takes over after that host stops.
- A known token is revoked by its own ID, never by listing the repository.
  A revocation that fails or is not answered stays owed, with a durable
  later due time on a capped backoff. A failure is never discarded.
- No revocation of an ended or abandoned token runs on, or is awaited by,
  the publication queue (R-PUB-3, R-PUB-7). A revocation answer or a
  token's expiry is never evidence about a push (R-PUB-2).

**R-MINT-5. An unknown create is kept, not guessed.**
- A record whose outcome is unknown stays open. Only its own request's
  later answer (R-MINT-3), or a completion fence that Artifacts documents
  (open point 42), settles it. Elapsed time, a token lifetime, an
  inventory (complete or not) and the end of the record's owner never
  settle it.
- The Room never revokes a token that it cannot match by ID to one of its
  own records. It never revokes by scope, expiry, creation time or absence
  from its records, and it never sweeps the canonical repository's tokens.
- The Room may read a complete inventory (`completeInventory`) and keep
  what it saw, as an observation shared by all its open records. An
  observation never settles a record.
- Open records are kept for the life of the room, and none is ever
  evicted. Admins can read them, with the room's other cleanup duties, in
  bounded pages that reach every record. They never contain a token's
  text.

**R-MINT-6. The exposure bound.** If a create whose outcome is unknown
applies, the Room holds no copy of the token's text. The token lasts no
longer than the lifetime asked. *Assumed, not documented:* that lifetime
runs from when Artifacts applies the create (open point 44), and nothing
bounds when that is (open point 42). The lifetime is the only bound on
the token's exposure. This amendment changes no lifetime: publication,
staging, preview and log tokens last 60 seconds, snapshot preparation
reads 300 seconds, and pinning tokens 600 seconds. A check job asks for a
lifetime that ends before the job's deadline, counted from when it sends
the request. The deadline guarantee (R-EXEC-9) covers only tokens accepted
and issued to checkers, which passed `notAfter` (R-MINT-3). An unknown or
late-applied create is bounded only by the lifetime asked, counted from
when Artifacts applies it under the assumption above, so it can outlast
the deadline. Its record stays open: owed if a late answer gave its ID,
unknown otherwise.

**R-MINT-7. Wake-ups and bounded work.**
- While any create request is outstanding, or any token is in use by a
  host's running code, the Room keeps a stored wake-up no later than a
  takeover time at most 60 seconds ahead. A wake-up on the same live host
  moves the takeover time ahead. A wake-up on a new object first takes
  over what the stopped host left: outstanding requests become unknown,
  and tokens in use become owed (R-MINT-4).
- Each owed revocation, and the next observation, has a stored wake-up no
  later than its due time. A fresh object schedules both at start, with no
  request needed.
- A due time is eligibility: the earliest time the work may run, not a
  promise that it runs then. While a revocation pass waits on an answer,
  its owed records are not eligible before that attempt's timeout.
- The next wake-up for this work is the earliest eligible time, if that is
  in the future, so a takeover or observation time is stored on time. If
  it has passed, because work is overdue or backlogged, the next wake-up
  is the current time plus a fixed step of 1 second. So the alarm never
  runs again at once, and overdue work never waits for an unrelated
  wake-up. Storing a wake-up never moves an earlier stored alarm later.
- Every known canonical token ID has a record keyed by that ID, which
  lives exactly as long as the token's owning record (R-MINT-4): from the
  transaction that records the ID to the one that ends the owning record,
  by a confirmed revocation or by settlement at a readable known expiry.
  It is never ended by marking a token revoked that was not. That includes
  a publication token, whose ID is also in its landing operation. An
  unknown create has no ID and no keyed record; it stays a separate
  unknown record (R-MINT-5). So an observation finds whether the Room
  knows a listed token by point lookups, without reading operations.
- Each wake-up does work bounded independently of the number of records
  kept: at most 20 revocations, earliest due first, each with a bounded
  wait; at most one inventory, with a bounded wait and size; a fixed
  number of rows written for an observation; reads by index, in bounded
  batches. New mints never delay revocations or observations that were due
  earlier.

### 32.1 Open points

These continue section 22's list.

42. **No completion fence.** The interfaces examined document no way to
    learn that a failed create request will never apply: no bound after
    which it cannot, and no request ID whose outcome can be asked. Until
    one is documented, an unknown record without a later answer stays
    open (R-MINT-5).
43. **No attribution.** A create takes only a scope and a lifetime. The
    REST listing gives each token's ID, scope, state, creation time and
    expiry; the binding page names no fields. A creation time does not
    tell concurrent mints apart. If Artifacts lets a create carry a name,
    label or idempotency key that a listing returns, the Room could revoke
    its own unknown token, and only that one. This version does not.
44. **When a lifetime starts.** R-MINT-6 assumes that a token's lifetime
    runs from when Artifacts applies the create. If it runs from the
    request, the bound runs from the time the Room sent it.
45. **The size of a binding listing.** The binding page does not say
    whether `listTokens()` returns revoked and expired tokens, or how
    many. An observation over its size bound counts nothing and settles
    nothing (R-MINT-7).

## 33. Contract amendment 6 (245986cb): declared acts (R-DECL)

Hugh's assert 4e4134b4, as corrected by assert b2cdc44a, says that a room's
acts are declared by its application, not fixed by the platform. The design
is
[notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md),
approved as documentation in review 1808ae17 (request a2cbd459). "The note"
below means that file, and section numbers such as "note 2.3.1" are its
sections. Request 245986cb is stage 1 of the note's section 8.5: this
amendment, the contract types, the code-review declarations as data, and
the acts validator.

This section holds every new rule, as sections 29 and 32 do. Where a rule
here amends an earlier one, it says so in section 33.3; the earlier rule is
read with the amendment.

**What changes now, and what later.** This amendment is the contract. It
changes no behaviour of any deployed room: a room whose active document is
`artroom-policy-v1` admits exactly what it admits today (R-DECL-1). Each
rule takes effect in the stage of note section 8.5 that builds it. Section
33.8 maps each rule to its stage. Until that stage lands, the rule binds
the lane that builds it, not the room.

**Two decisions for hugh.** Note 3.5 (the recovery path) and note 3.8
(upgrading the evaluator) are written here as the note recommends: a
platform kind `recover` (R-DECL-21), and a policy document that names its
evaluator profile, which only activation changes (R-DECL-22). If hugh
decides otherwise before review, those two rules change and nothing else
here does.

**Wording from assert e7307f81.** Two points are worded as gitseq
assert e7307f81 states them. On grants from before declared acts: "the
intended rule is intersection, never acquisition. A v1-era grant after v2
activation covers exactly those platform kinds it covered when signed
(explicitly, or through * as expanded at signing time against the v1
vocabulary), and no declared kind. renew is retained only if the original
grant covered it; a grant restricted to review and check does not acquire
renew, or anything else, at activation." R-DECL-17 states that rule. On
the stage-2 suite criterion: "the intended format conversions are bindings,
the recover rewrite of the recovery tests, v2 checker configurations
naming their act, and signed grant maps; each is a listed, reviewable
rewrite of fixtures, and none is permission to weaken an assertion."
Section 33.6 states that criterion.

### 33.1 Terms (amends section 1)

| Term | Meaning |
|---|---|
| Act | A signed, ordered, permanent statement by a member, of a kind the active policy document declares, or of a platform kind. The seven acts `claim`, `propose`, `note`, `review`, `check`, `land` and `release` are the code-review application's declarations (section 33.7) |
| Envelope | The signed form of an act, of `renew`, `roster` and `recover` |
| Declaration | One entry of a `v2` document's `acts`: data that names an act's targets, steps, threads, body fields, signers, hold and refusal wording (`ActDeclaration`) |
| Platform kind | `renew`, `roster` and `recover`. Platform code judges them, whatever the declarations say |
| Thread | What a lane becomes: a hold over a scope, opened by an act with step `open`, or by the room (R-REV-6). "Lane" in earlier rules means thread |
| Thread kind | The kind of the act that opened a thread, or `room` |
| Step | One of the room's primitive operations (R-DECL-5). An act runs steps; it has no other way to change state |
| Steps version | The identity of the step semantics, such as `artroom-steps-v1` (R-DECL-14) |
| Binding | The SHA-256 identity of one kind's meaning (R-DECL-15) |
| Legacy vocabulary | `artroom-legacy-v1`: what a room admits under a `v1` document (R-DECL-1) |

### 33.2 Rules (R-DECL)

**R-DECL-1. Two vocabularies.**
- A policy document of format `artroom-policy-v1` has no `acts`. It means
  the legacy vocabulary `artroom-legacy-v1`, permanently: the seven acts,
  `renew` and `roster`, with the bodies, targets, roles, delegable kinds,
  refusals and roster ops that main b44601dd admits, and `claim` with
  `purpose: "config-recovery"` and its admin-only, policy-bypassing rules
  (R-ADMIN-5 to R-ADMIN-8). It keeps today's behaviour where the code and a
  rule differ, such as a rescope recording `obligationsRecomputed: false`
  (R-LANE-2).
- The legacy vocabulary's meaning is the admission code it describes, kept
  as one frozen path in the room and in verify. It is not re-expressed
  through steps. The contract carries a canonical description of it
  (`ARTROOM_LEGACY_V1`) and that description's digest
  (`ARTROOM_LEGACY_V1_DIGEST`): the SHA-256 of its RFC 8785 canonical JSON.
  Neither is ever edited. A test recomputes the digest.
- A policy document of format `artroom-policy-v2` declares its acts in
  `acts`, and names its steps version in `steps` (`PolicyDocumentV2`).
- The legacy vocabulary applies: in a room whose active document is `v1`,
  to every act; in `artroom verify`, to every entry admitted while a `v1`
  document was in force, whatever later documents say; and to envelopes of
  format `v: 1` (R-DECL-16).
- The code-review `v2` declarations (section 33.7) are not the legacy
  vocabulary. A room adopts them only by activating a `v2` document.
- A room moves from `v1` to `v2` by landing a `v2` document, as any policy
  change lands (R-POL-9, R-ADMIN-1). It never moves back by itself; a later
  `v1` document is valid and means the legacy vocabulary again.

**R-DECL-2. Kinds and reserved names.**
- A declared kind's name matches `[a-z][a-z0-9-]{0,31}`.
- These names are reserved, and no document may declare them: the platform
  kinds `renew`, `roster` and `recover`; `room`; and the system event names
  of R-LOG-5 as amended (`genesis`, `lease-expired`, `policy-activated`,
  `obligations-recomputed`, `check-carried`, `land-evaluated`,
  `land-reserved`, `abort-attempt`, `publication-unresolved`,
  `land-outcome`, `revert-lane`, `notified`, `checkpoint`, `prepared`,
  `reservation-ended`).
- No document may declare a kind named `constructor` or `prototype`. The
  evaluator's value profile admits no object key of either name
  (`reserved_key`; R-EVAL-3 keeps such names out of keys for the same
  reason). A kind is a key of every grant map, and a `delegate` op's body
  is part of a rule input. These are the only two names of the kind
  grammar that the profile reserves; every other name, `valueof` or
  `tostring` included, may be declared.

**R-DECL-3. A declaration is data.** A declaration names the act's label,
its targets and the steps each runs, the thread kinds it may act on, its
own body fields, who may sign it, the hold it opens, its refusal wording,
and help text (`ActDeclaration`). It contains no code and no reference to
code. `label` and `help` are shown to people and agents; admission never
reads them.

**R-DECL-4. Targets and steps.**
- A declaration lists, for each target shape it accepts, the steps it runs
  there. The target shapes are `none` (target `null`), `thread`
  (`{ lane }`), `version` (`{ lane, generation }`), `entry` (`{ act }`) and
  `line` (a version's head, path and line, as `NoteAnchor`).
- Each target shape allows only these steps:

| Target | Steps allowed |
|---|---|
| `none` | `open`, `comment` |
| `thread` | `take`, `version`, `release`, `hand-over`, or `version` then `land` |
| `version` | `review`, `check`, `land` |
| `entry` | `comment` |
| `line` | `comment` |

- An act runs one step per target shape. The only combination is `version`
  then `land`, on `thread`. An act declares at least one target.

**R-DECL-5. The steps of `artroom-steps-v1`.** Each step brings the
guards of today's code for it (note 2.1). "Fields" are the body fields the
step itself requires; a declaration adds only its own fields (R-DECL-12).

| Step | What the room enforces and does | Fields |
|---|---|---|
| `open` | A new thread, held by the signer's member at lease generation 1, over a scope from the hold's scope source (R-DECL-7); refused `scope-overlap` under R-DECL-9 | `scope` (1 to 64 globs) when the scope source is `body.scope`; none with a template |
| `take` | On a held thread, the holder rescopes it at the same lease generation; on an unheld thread, a signer the declaration allows takes it over at the next lease generation, unless it is reserved for someone else (`reserved`). `expectedGeneration` must match (R-LANE-4). On a thread with a fixed scope only a takeover is allowed: a `take` with `lease` is refused `scope-fixed` | `expectedGeneration`; `scope` on a body-scoped thread only; `lease` for a rescope |
| `version` | Holder only, current lease; head reachable in the fork; diff bounded; changed paths inside the current scope; `.artroom/**` validated and given `obl_admin-approval`; `refuse`, `require` and `carry` rules; a new generation, pin and preview; review and check attention; an unreserved landing invalidated (R-PROP, R-OBL-5) | `lease`, `expectedGeneration`, `head` |
| `review` | Head equals the version's head; the signer qualifies for a review obligation and is not the author, except as R-OBL-2 and R-ADMIN-2 allow; the verdict is evidence | `head`, `verdict`, `scope`, `dependsOn?` |
| `check` | Bound as R-OBL-3 requires; never by the author; the kind and binding come from the job (R-DECL-18) | the nine `CheckBody` fields, `landOp?` |
| `land` | Holder only; the latest generation and its head; no landing in flight; no blocked or pending recomputation; every review obligation met; `land` rules; a landing operation in the same transaction (R-LAND-1) | `lease`, `head` |
| `release` | Holder only; the thread unheld, its lease generation up by one, the handover note kept, the workspace token revoked, members told (R-LANE-8) | `lease`, `note?` (at most 8 KiB) |
| `hand-over` | As `release`, and the thread is reserved for one named active member (R-DECL-10) | `lease`, `to` (a member) |
| `comment` | Anchored to an entry, to a line of a version's head, or to nothing (target `none`); renews the holder's lease if the holder signs; attention to the holder and the replied-to author | `replyTo?` |

Every step shares these guards: the thread exists (`lane-unknown`); the
thread's kind is one the act names (`wrong-thread`, R-DECL-8); the holder
and lease checks (R-LANE-3, R-LANE-6); the configuration-recovery check
(R-DECL-21); and policy `refuse` rules (R-POL-2). Any accepted act from
the holder on its thread renews the lease (R-ADM-11), for the thread's
lease length (R-DECL-9).

R-LANE-2 stands as written: a rescope should recompute obligations when
paths change. The code records `obligationsRecomputed: false` instead.
`artroom-steps-v1` keeps that behaviour, as the legacy vocabulary does. A
fix ships as a new steps version (R-DECL-14), not as a change to this one.

**R-DECL-6. Thread kind and settings.**
- A thread's kind is the kind of the act that opened it, or `room` for a
  revert thread the room opened (R-REV-6). The room records the kind with
  the binding of the opening act (R-DECL-15), so two meanings of one name
  can be told apart.
- A thread's settings come from the opening declaration's `hold`: scope
  source, conflict mode, lease length, reservation length and workspace.
  They are fixed for the thread's life. A later document never changes
  them, and activation never ends, shortens or extends a hold.
- Where the hold leaves the lease length to the room (no `leaseSeconds`),
  the room resolves it when the thread opens: it records its current
  numeric lease length on the thread, and that recorded value is the
  thread's lease length for its life. A later change to the deployment's
  lease affects only threads opened afterwards. The binding stays
  symbolic (R-DECL-15).
- A `room` thread has scope source `body.scope`, the conflict mode of the
  policy in force when it opened, the room's lease resolved and recorded
  at open, no reservation length, and a workspace.
- A configuration-recovery thread (R-DECL-21) has scope source
  `body.scope`, the room's lease resolved and recorded at open, no
  reservation length, and a workspace.
  It is never refused for overlap, and other threads treat it as
  `by-scope`.

**R-DECL-7. Scope source and current scope.**
- The scope source is fixed at `open`: `body.scope`, or a template of 1 to
  64 globs. A template may contain slots `{field}`, each naming a `segment`
  or `enum` field of the same act that the act requires on target `none`.
  The room fills each slot with the field's value.
- The current scope is what overlap checks and changed paths are judged
  against.
- With a template, the current scope is the filled template, and never
  changes. A `take` on such a thread carries no `scope` (`invalid-body` if
  it does) and may only take an unheld thread over. A `take` that carries
  `lease`, which would be a rescope, is refused with `scope-fixed`.
- With `body.scope`, the current scope is set at `open` and replaced by
  every `take`. A rescope by the holder (with `lease`, same lease
  generation) and a takeover of an unheld thread (without `lease`, next
  lease generation) both carry `scope`; both check `expectedGeneration`
  and the overlap of the new scope (R-DECL-9).

**R-DECL-8. Which acts may act on a thread.**
- An act on a thread, or on one of its versions or lines, is refused with
  `wrong-thread` unless the thread's kind is in the act's `threads`. Names
  match by name. `wrong-thread` is recorded, at admission step 7.
- A declaration has `threads` exactly when it has a `thread`, `version` or
  `line` target. It names 1 to 64 distinct kinds.
- A name in `threads` is valid if it is `room`; a kind declared in the
  same document with step `open`; or a historical opening kind, one that
  opened at least one thread in this room before the document is
  validated. The room knows these from its thread table; verify re-derives
  them from the log. Any other name is refused with `policy-invalid`.
- A retired kind cannot open new threads (`kind-undeclared`), but the
  threads it opened stay reachable by any declared act that names it.
- Reusing a retired name is allowed, deliberately. If a later document
  declares it again with a different `hold`, its new threads get the new
  settings and its old threads keep theirs. An act that names it acts on
  both. An application that must tell them apart uses a new name.
- A configuration-recovery thread accepts only `recover` ops. A declared
  act on one is refused `wrong-thread`, and the fix names `recover`.

**R-DECL-9. Holds and overlap.**
- An act with step `open` has `hold`. No other act has it.
- `hold.conflict` is `exclusive` or `by-scope`. Absent, it is the policy's
  `lanes` setting (R-POL-8) at the time of opening.
- An `open` or `take` is refused with `scope-overlap` when its scope may
  overlap (R-PATH-3) a held or reserved thread and either thread is
  `exclusive`. So an exclusive hold cannot be overlapped by a `by-scope`
  act, and an exclusive act cannot overlap a `by-scope` hold. A reserved
  thread counts as held.
- `hold.leaseSeconds` is the thread's lease length, from 10 to 86,400
  seconds. Absent, it is the room's lease, which the deployment
  configures, resolved to its numeric value when the thread opens and
  recorded on the thread (R-DECL-6). Every renewal (R-LANE-5) and every
  expiry uses the thread's recorded lease length, for the thread's life.
  A thread opened under a `v1` document has no recorded length and keeps
  today's behaviour: the room's current lease.
- `hold.workspace` true gives the thread a workspace: a fork and a token
  (R-WS). Absent means false.

**R-DECL-10. Hand-over and reservation.**
- `hold.reserveSeconds` is the thread's reservation length, from 1 to 600
  seconds. A thread without one cannot be handed over: a `hand-over` act
  whose `threads` names a kind declared in the same document must name
  only kinds whose `hold` has `reserveSeconds`.
- `hand-over` ends the hold as `release` does, and reserves the thread for
  the member named by `to`, which must be an active member, until the
  reservation length has passed. Its effect is `handed-over` (`to`, the
  deadline, the new lease generation).
- While a thread is reserved, a `take` by anyone but that member is
  refused with `reserved`. The member's `take` ends the reservation.
- When the deadline passes, the room seals a `reservation-ended` system
  event, as it seals `lease-expired` (R-LANE-8). Only that event ends an
  unclaimed reservation. Admission seals due events before it decides
  anything, so replay compares sequence numbers, never clocks.

**R-DECL-11. Who may sign.**
- `who.roles` lists the roles, besides `admin`, that may sign the act. It
  replaces R-GEN-5's table for declared kinds, under two fixed limits:
  - `admin` is implicit. An admin may sign every declared act. A
    declaration that lists `admin` is refused with `policy-invalid`. An
    empty `roles` means admins only.
  - `checker` is narrow. A declaration that lists `checker` may have only
    the steps `check` and `comment`.
- `who.delegable`, default true, says whether a delegation may cover the
  kind (R-ADM-5).
- Review and check qualification still come from obligations (R-OBL-2,
  R-OBL-3); holder-only follows from the steps.
- This grants no new power: declarations live under `.artroom/`, so a
  change to who may sign needs an admin's approval (R-ADMIN-1), and admins
  can already change any member's role.

**R-DECL-12. Body fields.**
- A declaration's `body` names the application's own fields, beyond those
  its steps require. A field name matches `[a-z][A-Za-z0-9]{0,31}`, and is
  not `because` or any field a step of the same act requires (R-DECL-5).
  It is not `constructor` or `prototype` either. A field is a key of the
  binding's subject (R-DECL-15) and of every rule input that carries the
  act's body, and the evaluator's value profile, under which both are
  made canonical, admits no object key of either name. These are the only
  two names of the field grammar that the profile reserves: a field may
  be named `toString` or `valueOf`, and is then read only as the body's
  own property.
- Field types are a closed set (`DeclaredField`): `text` (with `max`, 1 to
  16,384 bytes), `int` (with safe-integer `min` and `max`, `min` at most
  `max`), `bool`, `enum` (1 to 64 distinct values, each matching
  `[a-z0-9][a-z0-9-]{0,63}`), `globs` (with `max`, 1 to 64 patterns, in
  the restricted syntax of R-PATH-1), `member` (a member handle), `act`
  (an entry ID) and `segment` (one path segment: 1 to 255 bytes, not `.`
  or `..`, with no `/` and none of the characters R-PATH-1 keeps out of a
  pattern: `*`, `?`, `[`, `]`, `{`, `}`, `!` and `\`).
- A field is required for every target of the act unless it says
  `optional: true`, or `requiredFor` lists the target shapes where it is
  required (a non-empty, distinct subset of the act's targets). A field
  has at most one of the two.
- An act has at most 32 fields. Every act may also carry `because`
  (R-SIG-6's limits).
- Every body string is scanned for secrets (R-SEC-1). Only `member`, `act`
  and `segment` fields, whose format is fixed, skip the entropy check
  (R-SEC-4). A declaration cannot exempt a field.
- Size limits stay those of R-SIG-6: the envelope at most 64 KiB, text at
  most 16 KiB, at most 64 patterns and 64 reasons. A declaration may only
  lower them.

**R-DECL-13. Refusal wording.**
- The room decides each refusal and its code, so clients can branch on the
  code. A declaration's `refusals` supplies only the `reason` and `fix`
  text, by platform refusal code. Each text is 1 to 512 bytes.
- The text may use only these slots, filled by the room from facts it
  already reports: `{holder}`, `{lane}`, `{generation}`, `{obligation}`,
  `{path}` (the first path outside the scope), `{reservedFor}`, `{until}`
  and `{kind}`. Nothing else is interpolated, and a brace that does not
  open one of these slots is refused with `policy-invalid`. So a template
  cannot leak body text or provider text into a refusal.
- A slot is filled only with a fact in the form the room reports it. For a
  refusal decided before the target is judged (R-DECL-16), `{lane}` is
  filled only by a lane ID and `{generation}` only by a positive integer;
  anything else fills the slot with nothing.
- A filled `reason` or `fix` is at most 8,192 bytes. The room cuts a
  longer one at a character boundary.
- A refusal from a `refuse` rule keeps that rule's own `reason` and `fix`.

**R-DECL-14. The steps version.**
- A `v2` document names its step semantics version in the required field
  `steps`. This platform carries one: `artroom-steps-v1`, the semantics of
  R-DECL-5. A document naming any other is refused with `policy-invalid`.
- Admission uses the steps version that `D(s)` names, where `D(s)` is the
  document of the last `policy-activated` event before seq `s`.
- A platform release may add a steps version. It never changes an existing
  one, and it never moves a room to a new one. A room moves only by
  landing a document that names it, which takes effect at the exact seq of
  its `policy-activated` event (R-POL-9). From that seq every binding is
  new (R-DECL-15), so every act signed before is refused `binding-stale`
  and every grant must be made again.
- The platform keeps every steps version it has shipped, in the room and
  in verify. A behaviour fix is a new version.
- A verifier that lacks the version a document names stops at the first
  entry that needs it and reports `steps-unsupported` with that seq: a
  limit of that verifier, not a finding against the log (R-DECL-25).

**R-DECL-15. The binding identity.**
- A kind's binding is `sha256:` followed by the lowercase hex SHA-256 of
  the RFC 8785 canonical JSON of its binding subject (`BindingSubject`):

  ```
  { steps, kind, targets, threads, body, hold }
  ```

  - `steps`: the document's steps version;
  - `kind`: the kind's name;
  - `targets`: the declaration's `targets`, each step list in its written
    order;
  - `threads`: the declaration's `threads` in written order, or `[]`;
  - `body`: for each declared field, its type and the type's parameters
    (`max`, `min`, `values`, each as written), and `required`: the target
    shapes, of the act's own targets, for which the field is required, in
    the order `none`, `thread`, `version`, `entry`, `line`;
  - `hold`: `null` without `hold`; otherwise `scope` as written,
    `conflict` resolved (absent: the policy's `lanes`), `leaseSeconds`
    (absent: the string `"room"`), `reserveSeconds` (absent: `null`) and
    `workspace` (absent: `false`).
- Every default is resolved before hashing, so writing a default out, or
  leaving it out, never changes a binding. An absent `leaseSeconds`
  resolves to `"room"`, not to a number, because the room's lease is
  deployment configuration: a deploy must never change a binding. The
  numeric value is resolved and recorded on each thread when it opens
  (R-DECL-6), and the binding never includes it.
- The binding leaves out `label`, `help` and `refusals`, which change only
  how the act is described, and `who`, which decides whether this signer
  may act at all and is judged at admission against the current roster
  (R-ADM-3). The thread an act targets is not part of its binding: its
  settings were fixed when it opened, and the signer chose it by name.
- So a binding changes when, and only when, the steps version, the kind's
  name, a target or step list, `threads`, a body field or its limits or
  whether it is required, the scope source, or a hold setting changes,
  including a change of the policy's `lanes` for a hold without
  `conflict`.
- The per-kind identity, not a whole-document one, means a binding goes
  stale only for acts whose meaning changed.

**R-DECL-16. Envelope `v: 2` and the binding step.**
- An act of a declared kind is signed in envelope format `v: 2`
  (`DeclaredEnvelope`): the fields of `v: 1`, with `kind` any declared
  kind and one more signed field, `binding`, the binding the act was
  prepared under. It is signed under the same domain tag,
  `artroom-envelope-v1` (R-SIG-1); `v` is inside the signed bytes.
- Platform kinds (`renew`, `roster`, `recover`) use `v: 1` and carry no
  binding. A `v: 2` envelope of a platform kind is `bad-request`.
- In a room whose active document is `v1`, a `v: 2` envelope is
  `bad-request` at step 1.
- In a room whose active document is `v2`, admission has a new step 4a,
  after authority and before the body check:
  1. the kind must be declared in the active document; otherwise the act
     is refused with `kind-undeclared`. The reason names the kind and the
     active policy version; the fix points to the room's declarations;
  2. the envelope must be `v: 2`, and its `binding` must equal the active
     declaration's binding; otherwise the act is refused with
     `binding-stale`. The refusal's `current` gives the active binding and
     policy version. A `v: 1` envelope of a declared kind is refused
     `binding-stale`.
  Neither refusal is recorded (R-ADM-8).
- Idempotency (step 3) runs first. So an exact retry of an act that was
  already accepted returns its original receipt even after its binding has
  gone stale (R-IDEM). Because `binding-stale` is not recorded, its signer
  may sign the same intent again under the new binding, with the same
  idempotency key. A client re-signs only when its caller asks, after
  showing what changed. It never re-signs on its own.

**R-DECL-17. Grants carry the bindings their grantor signed.**
- **A `delegate` op** in a room whose active document is `v2` has
  `kinds`, a list of platform kinds it grants (today only `renew`), and
  `acts`, a signed map from declared kind to binding (`GrantMap`). `*` is
  not accepted: the grantor's client expands a wildcard before signing, so
  the signed map is the catalogue boundary. A `delegate` op in the `v1`
  shape is `invalid-body` in such a room.
- **At the grant's admission**, every key of `acts` must be a declared
  kind (`kind-undeclared` otherwise), may be delegated (`who.delegable`)
  and may be signed by the grantor's role, as R-ADM-5 requires today; and
  each binding must equal the active declaration's binding. If any
  differs, the op is refused with `binding-stale` and not recorded; the
  grantor signs again. A kind declared after the grant was signed is not
  covered.
- **At each use**, an act of a declared kind under the delegation must
  carry the binding the grant names for its kind. Otherwise it is refused
  at step 4 with `delegation-invalid`: "The delegation was granted for an
  earlier meaning of {kind}."
- **Invitations.** A room-custody invitation's `session` has the same
  `kinds` and `acts`, checked when the `invite` is admitted, as a grant
  is. The room creates the session's delegation from them at redemption
  (R-CRED-3), and only if every binding still equals the active one.
  Otherwise the redemption is refused, unrecorded, with `binding-stale`;
  the invitation stays unused, and an admin invites again. In a `v2` room,
  a new invitation with no `session` grants no declared kind; it covers
  only the delegable platform kinds its role may sign, which today is
  `renew`.
- **Read sessions** (R-CRED-7) grant no acts, so they carry no bindings.
- **Exact retries.** An exact retry of an admitted `delegate` returns its
  original receipt (R-IDEM), even after a meaning changed. It does not
  re-pin anything; acts under it are judged at their own admission.
- **Grants from before declared acts: intersection, never acquisition.** A
  delegation or invitation admitted under a `v1` document carries no
  bindings. After the room activates a `v2` document it covers exactly the
  intersection of what it covered when signed with the platform kinds: the
  platform kinds it named explicitly, or that `*` covered as expanded
  against the `v1` vocabulary for the grantor's role (because the `v1`
  vocabulary never changes, that is the set the grantor signed for). It
  covers no declared kind. So it keeps `renew` only if it covered `renew`
  before, and a grant limited to `review` and `check` covers nothing at
  all after activation. It never gains a kind. Acts of a declared kind
  under it are refused `delegation-invalid`, with the fix "Ask the grantor
  to delegate again."

**R-DECL-18. Checker configurations name their act.**
- In a room whose active document is `v2`, every checker configuration
  (`.artroom/checkers/<name>.json`) has format `artroom-checker-v2` and a
  field `act`: the declared kind its checks are signed as
  (`CheckerConfigV2`). Checker configurations activate with the policy
  document (R-POL-9), so the act and the configuration are always from the
  same version.
- `act` names a kind declared in the same document whose `version` target
  runs only the step `check`, whose `who.roles` includes `checker`, and
  which requires no body field on that target, because the checker service fills only the
  `check` step's fields. Otherwise the proposal is refused with
  `policy-invalid`, naming the checker. Several checkers may name one act.
  Each configuration names exactly one act, so a job never has none or
  several to choose from.
- A `CheckJob` carries that kind and its binding, from the policy version
  that made the obligation, as it carries that version's configuration
  digest (`CheckJobV2`). An activation that changes the binding ends every
  owed or sent job as no longer needed, as a configuration change does
  today, and the room issues new ones. A late check signed under the old
  binding is refused `binding-stale`.
- Under the legacy vocabulary, checkers sign `check`, as today.

**R-DECL-19. `check-unroutable`.** Before it issues a check job, the room
checks that the obligation's thread kind is in the check act's `threads`.
If it is not, the room issues no job; admins get an attention item
`check-unroutable` naming the obligation, the thread kind and the act; and
a landing that needs the check fails in preparation with code
`check-unroutable` and the fix "Declare the check act for this kind of
thread." (R-LAND-4 step 2).

**R-DECL-20. The `prepared` event.** When an integration is ready, before
the room issues any job for it, the room seals a `prepared` system event
(`PreparedEvent`). It names the owner (a preview of a lane and generation,
or a landing operation), the integration, its base and its tree, and for
each scoped checker the snapshot commit and digest. A check is admitted
only if a `prepared` event for its generation, and for `landOp` that
operation, names its integration and its tree or snapshot. One `prepared`
event is sealed per clean preview and per prepared landing; stage 2
measures the cost against the row-writes baseline.

**R-DECL-21. The platform kind `recover`** (note 3.5, option (a)).
- In a room whose active document is `v2`, configuration recovery uses the
  platform kind `recover`, whose body is an op, as `roster`'s is
  (`RecoverOp`). Platform code judges it, whatever the declarations say,
  so no declaration can remove the recovery path.
- Its ops are `open` (target `null`: `goal`, `scope`, `plan?`,
  `because?`), `take` (a thread: `scope`, `expectedGeneration`, `lease?`,
  `goal?`, `plan?`, `because?`), `version` (a thread: `lease`,
  `expectedGeneration`, `head`, `summary`, `because?`), `approve` (a
  version: `head`, `verdict`, `scope`, `dependsOn?`, `text`), `land` (a
  version: `lease`, `head`), `release` (a thread: `lease`, `note?`) and
  `note` (an entry or a line: `text`, `replyTo?`). Each has today's field
  limits (R-SIG-6).
- Every `recover` op follows R-ADMIN-5 to R-ADMIN-8 exactly as a legacy
  configuration-recovery lane does: an active admin's own key, by case (a)
  of R-ADM-3, never a delegation or the recovery key (`admin-required`);
  scope and changed paths under `.artroom/**` (`recovery-scope`); no
  `refuse`, `require`, `carry` or `land` rules; the flag
  `config-recovery`; `obl_admin-approval` as the only obligation; and a
  landing with no checks and no land rules.
- `open` opens a thread of kind `recover` with purpose
  `config-recovery`. `recover` ops act on any thread whose purpose is
  `config-recovery`, whether a legacy `claim` or a `recover` `open` opened
  it. A declared act on such a thread is refused `wrong-thread`
  (R-DECL-8).
- `recover` is not delegable, and no grant map names it.
- A recovery thread is never refused `scope-overlap`, and other threads
  treat it as `by-scope` (R-DECL-6), so no exclusive declared hold can
  lock recovery out.
- In a room whose active document is `v1`, `recover` is an unknown kind:
  `bad-request`, as today. Recovery there is the legacy `claim` with
  `purpose`.
- The note listed six ops. This amendment adds `take`, because R-ADMIN-5
  and R-LANE-7 let an admin take over a recovery lane today, and a legacy
  recovery lane open at the first `v2` activation needs that path after
  its holder's lease expires.

**R-DECL-22. The evaluator version** (note 3.8, as recommended).
- The policy document names its evaluator profile in `profile`, in `v1`
  and `v2` alike. Admission evaluates every rule under the profile of
  `D(s)`.
- A room changes profile only by activating a document that names the new
  one, at an exact seq, through the same admin-approved landing. A deploy
  never changes a room's profile.
- The genesis names the room's initial profile, not its only one.
- The platform keeps every profile it has shipped, with its pinned
  `jsonata` build. `artroom verify` replays each decision with the
  evaluator its stamp names, and checks that the stamp's profile is the
  profile of `D(s)`. A verifier that lacks a profile stops at the first
  decision that needs it and reports `profile-unsupported`, as R-DECL-14
  does for steps.
- A new profile ships with its own conformance corpus, and the old corpus
  runs unchanged against the old profile.
- Today the platform carries one profile, `artroom-jsonata-v1`, so this
  rule changes no behaviour until a second one ships.

**R-DECL-23. Undeclared and retired kinds.**
- A new act whose kind the active document does not declare is refused
  `kind-undeclared` at step 4a, unrecorded (R-DECL-16).
- A record whose kind was declared at its own seq stays valid for ever. A
  later activation at seq `t > s` changes `D` only for entries after `t`
  (R-ADM-7). `D(s)` is retained by digest (R-LOG-7), so a fresh clone can
  always judge entry `s` under it.
- Retiring a kind means leaving it out of the next document. There is no
  fallback to a built-in definition. The legacy vocabulary is not a
  fallback: it applies only under `v1` documents.
- State a retired kind left: its holds keep their settings and end by
  lease expiry or by any declared act whose `threads` names that kind; a
  reservation keeps its deadline and ends by its sealed event; evidence
  keeps counting by the facts recorded at its admission (R-REV-1), and
  retiring a review kind reopens nothing; a landing in flight completes
  forward (R-PUB-6).
- Readers (the UI, client and MCP) show a record with the label and fields
  of `D(s)`, and mark a kind no longer declared as "retired at seq `t`".
  They never classify an old record by the current vocabulary.

**R-DECL-24. Validation of a `v2` document** (note 3.4; amends R-POL-1).
A proposal whose head has a `v2` policy document is refused with
`policy-invalid` unless all of these hold. Each is one or more guards in the
acts validator (`validatePolicyV2`, section 33.7), and each guard has its
own test:
1. the document has the fields of `PolicyDocumentV2` and no others; the
   fields shared with `v1` are valid as R-POL-1 requires;
2. `steps` names a steps version this platform carries (R-DECL-14);
3. `acts` declares at most 64 kinds; each name matches the grammar and is
   not reserved (R-DECL-2);
4. each declaration has only the fields of `ActDeclaration`; `label` is 1
   to 128 characters; `help` is at most 4,096 bytes;
5. each target shape lists only steps it allows, one step or `version`
   then `land` (R-DECL-4);
6. an act has `threads` exactly when it has a `thread`, `version` or
   `line` target, and each name is valid (R-DECL-8);
7. an act with step `open` has `hold`, and no other act has it; `hold`'s
   fields are within bounds (R-DECL-9, R-DECL-10, R-DECL-26);
8. `hold.scope` is `body.scope` or 1 to 64 template globs; every slot
   names a `segment` or `enum` field of the same act that is required on
   target `none`; and every template is a valid glob once its slots are
   filled (R-DECL-7);
9. a `hand-over` act names only declared opening kinds whose `hold` has
   `reserveSeconds` (R-DECL-10);
10. body fields have valid names, types and limits, do not reuse a step's
    field names or `because`, and say at most one of `optional` and
    `requiredFor` (R-DECL-12);
11. `who.roles` names distinct roles, never `admin`, and lists `checker`
    only for an act whose steps are `check` or `comment`; `who.delegable`
    is a boolean (R-DECL-11);
12. `refusals` keys are platform refusal codes, and each text uses only
    the slots of R-DECL-13;
13. every rule's `on` names a declared kind or a platform kind;
14. every checker configuration is `artroom-checker-v2` and names an act
    that R-DECL-18 allows;
15. soundness: every act with a `version` or `line` target has an act
    with step `version` whose `threads` shares a kind with its own; and
    every `hand-over` act has, for each kind it names, an act with step
    `take` that names that kind.

Validation also reports, without refusing, each opening kind that no
declared act can end with `release` or `hand-over`: its holds end only by
lease expiry (`hold-unending`). The proposal's response lists these
warnings.

**R-DECL-25. What verify reports.** Stage 3 checks kind, binding, body
and `who` under `D(s)`; stage 6 adds the fold, the required evaluation
calls and derived transitions of note sections 4.3 to 4.8. Each failure
names the seq:
- `kind-undeclared`: the kind is not declared in `D(s)`;
- `binding-stale`: the binding is not the identity of the kind in `D(s)`;
- `body-invalid`: the body or target does not fit `D(s)`;
- `guard-failed`: an accepted act whose guard fails on the fold;
- `effect-mismatch`: receipt effects that differ from the derived ones;
- `refusal-mismatch`: a recorded refusal whose code is not the first
  failing guard's;
- `decision-missing`: a required evaluation call with no recorded
  decision;
- `decision-extra`: a recorded decision that no required call accounts
  for;
- `context-mismatch`: a retained replay context whose digest is not the
  one rebuilt from the fold;
- `witness-missing`: a required version witness, `prepared` event or
  retained document is absent;
- `git-mismatch`: a witness that disagrees with Git objects that are
  present.

Proof limits, reported and not failures: `git-unwitnessed` (Git objects
not fetched), room-clock timing, and the unrecorded refusals of steps 1 to
6. Unsupported versions, reported and not failures: `steps-unsupported`
(R-DECL-14) and `profile-unsupported` (R-DECL-22); verify stops at the
first entry that needs the missing version, and its report says the log
was verified only up to that seq.

**Carry judgments are accounted for in part** (as delivered; request
`42342e35`). Verify replays each recorded `check-carried` judgment
(R-CARRY-13). It reports `decision-extra` for a second judgment of the
same check on the same integration under the same policy version;
`decision-missing` at a judgment that carried when a newer passing check
of that obligation, admitted before the operation's land act, has no
judgment; and, at a `land-evaluated` event with a blocking obligation
open in the fold, `decision-missing` naming an earlier passing check that
has no judgment, or else `guard-failed` naming the obligation. It does
not derive the whole list of judgments the Room owed. Its report says so
to a program, as `carryAccounting: "partial"`, and to a person, in the
list of what it cannot prove. The report also names what the run checked:
`mode` is `full`, or `integrity` when the caller turned replay off
(`--no-replay`). An integrity run evaluates no policy; then
`carryAccounting` is `none`, and the report makes no statement that a
decision, a call or a carry judgment was checked. It still
makes the checks that need no policy evaluation: decoding, hashes, seals,
order, publication history, each act's authority, a check's configuration
and prepared input, what each check-carried event names, and the refusal
of a land evaluation while the admin-approval obligation is open, for
which it reads Git objects where they are present. Where they are, it
also compares the changed paths of a retained proposal context with them
and refuses nothing on that comparison. The report names those checks
and says what they do not show: an obligation that a rule opens is known
only by replay, and a context that differs from the one the Room used is
not detected. The list for a full run names: a missing judgment that did not carry when
no later one carried; a missing whole pass; the order, inputs and budget
of the judgments; an extra judgment that belongs to no pass; and waiting,
cancellation, repeated preparation and recovery, which the log does not
record. Complete accounting stays owed under request `1e8fee4b`. It needs
the Room to record carry passes, which no rule of this protocol provides
yet.

**R-DECL-26. Platform bounds on declarations.** A document outside these
is refused `policy-invalid`.

| Item | Bound |
|---|---|
| Declared kinds per document | at most 64 |
| Kind name | `[a-z][a-z0-9-]{0,31}`, not reserved |
| `label` | 1 to 128 characters |
| `help` | at most 4,096 bytes |
| Refusal `reason`, `fix` | 1 to 512 bytes each |
| Body fields per act | at most 32 |
| Field name | `[a-z][A-Za-z0-9]{0,31}` |
| `text.max` | 1 to 16,384 bytes |
| `globs.max` | 1 to 64 patterns |
| `int.min`, `int.max` | safe integers, `min` at most `max` |
| `enum.values` | 1 to 64 distinct values, each `[a-z0-9][a-z0-9-]{0,63}` |
| `threads` | 1 to 64 distinct names |
| `hold.scope` template | 1 to 64 globs, each at most 256 characters |
| `hold.leaseSeconds` | 10 to 86,400 |
| `hold.reserveSeconds` | 1 to 600 |
| The whole document, as canonical JSON | at most 1,048,576 bytes |

### 33.3 Amended rules

Each rule below is read with this amendment. Rules that note section 8.2
retains are not repeated.

| Rule | Amendment |
|---|---|
| Section 1, Terms | As section 33.1 |
| R-SIG-1 | A `v: 2` envelope is signed under `artroom-envelope-v1`, as `v: 1` is |
| R-SIG-4 | Envelopes stay closed. In a `v2` room `kind` is any name of R-DECL-2's grammar, checked against the declarations at step 4a, and a `v: 2` envelope has `binding`. A body is closed against its declaration's fields and its steps' fields (R-DECL-12) |
| R-SIG-5 | The room checks that `v` is 1, or 2 for a declared kind in a `v2` room (R-DECL-16) |
| R-SIG-6 | Declared text and glob fields have their declared limits, within these (R-DECL-12) |
| R-GEN-1 | The genesis names the room's initial evaluator profile and `jsonata` version, not its only one (R-DECL-22) |
| R-GEN-5 | The table is the legacy vocabulary's, and still decides `renew` and `roster` in every room. For declared kinds, `who.roles` decides, with `admin` implicit and `checker` narrow (R-DECL-11). Only an active admin's own key may sign `recover` (R-DECL-21). Policy still cannot widen any of these |
| R-GEN-10 | Step 1 accepts a genesis whose `profile` names a profile and `jsonata` version the deployment carries (R-DECL-22) |
| R-ADM-1 | Step 1 checks the kind's grammar in a `v2` room and the fixed list in a `v1` room. Step 4's role check uses `who` of the active declaration. New step 4a, kind and binding (R-DECL-16), unrecorded. In steps 8 and 9, "`propose`" means "an act with step `version`", and "a configuration-recovery lane" includes a `recover` thread |
| R-ADM-3 | Case (a): the role may sign the kind by R-GEN-5 as amended. Case (b): the delegation covers the kind by R-DECL-17 |
| R-ADM-5 | A delegation grants platform kinds by name and declared kinds by a signed map from kind to binding; only kinds with `who.delegable` not false and that the grantor's role may sign; never `roster` or `recover`. Grants from before declared acts follow R-DECL-17's intersection rule |
| R-ADM-8 | `kind-undeclared` and `binding-stale` (step 4a), and a redemption refused `binding-stale`, are never recorded. `wrong-thread`, `scope-fixed` and `reserved` are step 7 refusals and are recorded |
| R-CRED-3 | Step 2: the delegation copies the invitation's `kinds` and `acts`; redemption is refused, unrecorded, with `binding-stale` if any binding is no longer the active one (R-DECL-17) |
| R-CRED-5 | `workspace` and `workspace-token` are judged as for an act with step `version` on that thread |
| R-CRED-10 | A bearer act of a declared kind carries `binding` (`DeclaredBearerAct`); the agent reads it from the `acts` tool |
| R-LANE-3 | Holder-only follows from the steps (R-DECL-5). An act on a thread of a kind it does not name is refused `wrong-thread` (R-DECL-8) |
| R-LANE-5 | Renewal sets the expiry to the room clock plus the lease length recorded on the thread when it opened (R-DECL-6, R-DECL-9) |
| R-LANE-7 | A takeover of a reserved thread by anyone but the named member is refused `reserved`; a rescope of a fixed-scope thread is refused `scope-fixed` (R-DECL-7, R-DECL-10) |
| R-OBL-3 | The check's kind and binding are the ones its job names (R-DECL-18) |
| R-LAND-1 | An act may run `version` then `land` (R-DECL-4). If the new version owes a review, the whole act is refused `obligation-open`, and only the refusal is recorded |
| R-LAND-4 | Step 1 seals `prepared` once the integration is ready (R-DECL-20). Step 2 fails with `check-unroutable` when no job can be issued (R-DECL-19) |
| R-REV-6 | A revert lane is a thread of kind `room` (R-DECL-6) |
| R-ADMIN-5 to R-ADMIN-8 | In a `v2` room, configuration recovery is the platform kind `recover` (R-DECL-21). In a `v1` room, and for legacy recovery lanes, these rules stand as written |
| R-POL-1 | Validation also covers `acts`, `steps` and each checker's `act` (R-DECL-24) |
| R-POL-2, R-POL-5 | `on` names declared kinds or platform kinds |
| R-POL-7 | A room with no policy file uses the default policy as a `v1` document, so the legacy vocabulary |
| R-POL-8 | A conflict mode per thread, with the either-side rule (R-DECL-9). `lanes` is the default for a hold without `conflict` |
| R-POL-10 | Policy cannot change who may sign which platform kind, or break the platform floor of R-DECL-11. Declarations choose `who.roles` within it, under admin approval |
| R-POL-12 | The supplied document is `v1` or `v2`. Its version, the `policy-activated` entry's ID, also identifies its declarations, its steps version and its evaluator profile |
| R-EVAL-3 | `act.kind` is a declared kind or a platform kind. `PolicyLane` gains the thread's kind (`DeclaredPolicyLane`) |
| R-EVAL-4 | A dependency update needs a new profile version, or a reviewed claim backed by the full conformance corpus that the old profile is unchanged. A room adopts a new profile only by activation (R-DECL-22) |
| R-EXEC-8 to R-EXEC-10 | A job carries the kind and binding to sign (`CheckJobV2`), and is ended and reissued when the binding changes (R-DECL-18) |
| R-LOG-5 | System events gain `prepared` (R-DECL-20) and `reservation-ended` (R-DECL-10) |
| R-LOG-6 | Effects gain `handed-over` (R-DECL-10); `opened` gains the thread's kind and binding; the receipt of an act with step `version` names its version witness's digest (stage 6) |
| R-LOG-7, R-LOG-9 | Version witnesses are retained and published as replay contexts are |
| R-LOG-10 | Verify also checks what R-DECL-25 lists, from the stage that builds each check |
| R-LOG-15 | Superseded as a blanket limit, from stage 6. The proof limits are those of R-DECL-25 |
| R-API-9 | Two more MCP tools: `act`, which requires a binding, and `acts`, which lists the active declarations with their bindings. The ten named tools stay, each with the binding of the code-review declaration it was built for |

### 33.4 New codes, events and outcomes

Every name below is new. Each is a value of a contract type
(`packages/contract/src/declarations.ts`, unless the table says
otherwise).

| Name | Kind of name | Where it arises | Recorded? | Rule |
|---|---|---|---|---|
| `kind-undeclared` | Refusal code (`PlatformRule`) | Admission step 4a; a grant naming an undeclared kind | No | R-DECL-16, R-DECL-17, R-DECL-23 |
| `binding-stale` | Refusal code (`PlatformRule`) | Admission step 4a; a grant's admission; a room-custody redemption; a late check | No | R-DECL-16, R-DECL-17, R-DECL-18 |
| `wrong-thread` | Refusal code (`PlatformRule`) | Admission step 7 | Yes | R-DECL-8 |
| `scope-fixed` | Refusal code (`PlatformRule`) | Admission step 7, a `take` with `lease` on a fixed-scope thread | Yes | R-DECL-7 |
| `reserved` | Refusal code (`PlatformRule`) | Admission step 7, a `take` on a thread reserved for someone else | Yes | R-DECL-10 |
| `check-unroutable` | Landing failure code (`CheckUnroutable`) and attention item for admins (`CheckUnroutableAttention`) | Preparation, step 2 | In the `land-outcome` event | R-DECL-19 |
| `prepared` | System event (`PreparedEvent`) | Preview and landing preparation | Yes | R-DECL-20 |
| `reservation-ended` | System event (`ReservationEndedEvent`) | The room's alarm | Yes | R-DECL-10 |
| `handed-over` | Lane effect (`HandedOverEffect`) | A `hand-over` step | Yes | R-DECL-10 |
| `hold-unending` | Validation warning | The acts validator | No | R-DECL-24 |
| `kind-undeclared`, `binding-stale`, `body-invalid`, `guard-failed`, `effect-mismatch`, `refusal-mismatch`, `decision-missing`, `decision-extra`, `context-mismatch`, `witness-missing`, `git-mismatch` | Verify failures (`DeclaredVerifyFailure`) | `artroom verify` | — | R-DECL-25 |
| `git-unwitnessed` | Verify proof limit (`VerifyProofLimit`) | `artroom verify` | — | R-DECL-25 |
| `steps-unsupported`, `profile-unsupported` | Verify unsupported-version outcomes (`VerifyUnsupported`) | `artroom verify` | — | R-DECL-14, R-DECL-22, R-DECL-25 |

`delegation-invalid` and `policy-invalid` are existing codes with new
causes (R-DECL-17, R-DECL-24).

### 33.5 Acceptance cases

Each is normative. "Stage" is the stage of note section 8.5 that must
pass it.

| Case | Expected result | Rules | Stage |
|---|---|---|---|
| **Code-review declarations.** The seven declarations of section 33.7 in a `v2` document with today's default policy fields | Valid, with no warnings | R-DECL-24 | 1 |
| **Jam declarations.** The note's section 7.1 acts, its `in-key` and `leader-only` rules and its `in-key.json` configuration | Valid; one `hold-unending` warning, for `propose-rules` | R-DECL-24 | 1 |
| **Invalid documents.** Each case of R-DECL-24, one at a time: a reserved or misspelt kind, a step on the wrong target, a third step, missing `threads`, an unknown name in `threads`, `hold` on a non-opening act or missing on an opening act, a slot naming a `text` field, `hand-over` onto a hold without `reserveSeconds`, a field named `lease` or `because`, `admin` in `who.roles`, `checker` on an act with step `version`, an unknown refusal slot, a rule `on` an undeclared kind, an unknown steps version, an act needing a version that no act creates, a hand-over that no act can take | Each refused `policy-invalid`, naming the problem | R-DECL-24 | 1 |
| **Checker configuration.** No `act`; `act` naming an undeclared kind, `signal`, or a check act with a required body field; format `artroom-checker-v1` in a `v2` document | Each refused `policy-invalid`, naming the checker | R-DECL-18 | 1 |
| **Historical opening kind.** A document whose `threads` names a kind that never opened a thread here | Refused `policy-invalid`; the same document with that kind given as historical is valid | R-DECL-8 | 1 |
| **Legacy digest.** The digest of `ARTROOM_LEGACY_V1` | Equals `ARTROOM_LEGACY_V1_DIGEST` | R-DECL-1 | 1 |
| **Binding identity.** Changing `label`, `help`, `refusals` or `who` | The binding is unchanged | R-DECL-15 | 1 |
| **Binding identity.** Changing a step list, a body field or its limit, the scope source, `leaseSeconds`, `reserveSeconds`, `conflict`, `workspace`, `threads`, the steps version, or the policy's `lanes` for a hold without `conflict`; writing a default out | Each change gives a new binding; writing a default out gives the same one | R-DECL-15 | 1 |
| **Same-shape change.** An act signed under `[version]`, submitted after activation of `[version, land]` | Refused `binding-stale`; no landing starts | R-DECL-16 | 2 |
| **Hold change.** As above, for `hold.scope` or `leaseSeconds` | The same | R-DECL-16 | 2 |
| **Unrelated update.** A new kind, a changed `refuse` rule, a new label or refusal wording | The binding is unchanged and the act is admitted | R-DECL-15 | 2 |
| **Exact retry.** An act accepted before an activation, retried after it | The original receipt | R-DECL-16, R-IDEM | 2 |
| **Grants.** An explicit-kind grant signed before an activation that changes one of its kinds, submitted after it; a grant whose signed map was expanded before an activation that adds a kind; an exact retry of an admitted grant after a meaning change; an invitation signed before a meaning change and redeemed after it | Refused `binding-stale`; admitted, not covering the new kind; the original receipt, then acts under it refused `delegation-invalid`; redemption refused, the invitation unused | R-DECL-17 | 2 |
| **Grants from before declared acts.** After the first `v2` activation: a `v1`-era `*` delegation; a `v1`-era delegation limited to `review` and `check` | The first covers `renew` and no declared kind; the second covers nothing | R-DECL-17 | 2 |
| **Take-over with a new scope.** A released `claim` taken over with a different scope; a takeover whose new scope overlaps an exclusive held thread | Admitted, its current scope changes and the lease generation rises by one; refused `scope-overlap` | R-DECL-7, R-DECL-9 | 2 |
| **Retired opening kind.** An opening kind retired while one of its threads is held with an open version | Declared acts that name it can still release and review it; a new act of the retired kind is refused `kind-undeclared` | R-DECL-8, R-DECL-23 | 2 |
| **Legacy suite.** The room's whole existing suite against the legacy vocabulary | Passes unchanged | R-DECL-1 | 2 |
| **Code-review suite.** The room's whole existing suite against the code-review `v2` declarations | Passes with only the four conversions of section 33.6, each reported test by test | R-DECL-1, 33.6 | 2 |
| **Legacy recovery replay.** A fresh clone of a log with `claim` with `purpose: "config-recovery"`, `propose` of an `.artroom/` change, a flagged sole-admin `review`, `land`, `land-outcome`, `policy-activated` of a `v2` document, and the thread's later release | Verify passes; a verifier mutated to judge the `v1`-era entries under the `v2` declarations fails | R-DECL-1, R-DECL-21, R-DECL-25 | 3 |
| **Forged entries.** A log that activates a document adding a kind; then forged entries of an undeclared kind, and with a stale binding | Verify passes the honest log, and fails `kind-undeclared` and `binding-stale` on the forged entries | R-DECL-25 | 3 |
| **Check mapping.** An obligation on a thread whose kind the check act does not name | No job; admins see `check-unroutable`; the landing fails `check-unroutable` | R-DECL-19 | 4 |
| **Reservation.** While a thread is reserved: a `take` by another member; an `open` over the same scope; the named member's `take`; anyone's `take` after `reservation-ended`; a reservation that ends while a `take` is in flight | `reserved`; `scope-overlap`; admitted; admitted; decided by seq order | R-DECL-9, R-DECL-10 | 4 |
| **Fixed scope.** A rescope of a fixed-scope thread | Refused `scope-fixed` | R-DECL-7 | 4 |
| **Hold modes.** A `by-scope` hold over `parts/**` while an exclusive part is held; an exclusive open while a `by-scope` hold overlaps it | Both refused `scope-overlap` | R-DECL-9 | 4 |
| **Check job binding.** A job prepared before a change to its act's binding; a late check under the old binding | The job is ended as not needed and reissued; the late check is refused `binding-stale` | R-DECL-18 | 4 |
| **Generic act.** An agent performs a declared act it was not built for, over HTTPS and MCP | Admitted, with its binding | R-DECL-16, R-API-9 | 5 |
| **Steps versions.** A log spanning two steps versions; an exact retry across the move; a deployment that adds a steps version with no activation; a verifier without the new version | Each interval verifies under its own version; the original receipt; every binding and receipt byte-identical; `steps-unsupported` at the first entry that needs it | R-DECL-14 | 6 |
| **Adversarial logs.** Each forged log of note section 4.7 | Fails with its named failure; an honest log passes | R-DECL-25 | 6 |
| **Jam fixture.** The cases of note section 7.4 | Each as the note states | R-DECL-4 to R-DECL-19 | 7 |

### 33.6 The stage-2 suite criterion

Against the legacy vocabulary, the room's whole existing suite passes
unchanged. Against the code-review `v2` declarations, it passes with these
fixture format conversions, and no others:
1. envelopes carry bindings (`v: 2`, R-DECL-16);
2. the configuration-recovery tests are rewritten from `claim` with
   `purpose` to `recover` ops (R-DECL-21). Bindings alone cannot turn the
   one into the other, so this is an intended change of behaviour;
3. checker configurations use `artroom-checker-v2` and name their act,
   `"act": "check"` (R-DECL-18);
4. `delegate` ops and room-custody invitations carry signed maps from kind
   to binding instead of kind lists or `*` (R-DECL-17).

Stage 2's report lists every converted test, one by one, with the
conversion applied, for review. Each is a listed, reviewable rewrite of a
fixture's form; none is permission to weaken, remove or loosen an
assertion. A mutation of each declaration field turns a test red.

As reduced by request `ecbc722a`: the second run of the whole suite is
replaced by a named witness set, `declared-run.test.ts` in the Room's
tests, which runs chosen tests of the code-review application under the
`v2` declarations with the same four conversions, and checks that each
conversion was applied. The Room dispatches by step, and both vocabularies
run the same step handlers, so what a `v2` document changes (admission
steps 1, 4, 4a and 5, grants, sessions, check jobs, recovery and what a
thread records) has direct tests of its own. The list of every converted
test and the mutation of each declaration field are no longer kept;
[plans/test-invariants.md](../plans/test-invariants.md) names the
witnesses and says what the smaller run does not show.

### 33.7 Contract types and built-in data

| What | Where |
|---|---|
| `KindName`, `PlatformKind`, `ThreadKind`, `StepsVersion`, `ProfileVersion`, `TargetShape`, `Step`, `StepList`, `DeclaredField`, `HoldDeclaration`, `RefusalSlot`, `RefusalWording`, `ActDeclaration`, `DeclaredRefuseRule`, `DeclaredNotifyRule`, `DeclaredRule`, `PolicyDocumentV2`, `AnyPolicyDocument`, `CheckerConfigV2`, `Binding`, `BindingField`, `BindingHold`, `BindingSubject`, `GrantMap`, `DelegablePlatformKind`, `DelegateOpV2`, `InvitationSessionV2`, `DelegationV2`, `DeclaredTarget`, `DeclaredEnvelope`, `DeclaredBearerAct`, `RecoverOp`, `RecoverTargets`, `RecoverEnvelope`, `CheckJobV2`, `CheckUnroutable`, `CheckUnroutableAttention`, `DeclaredPolicyLane`, `PreparedEvent`, `ReservationEndedEvent`, `HandedOverEffect`, `ActsCatalogue`, `DeclaredVerifyFailure`, `VerifyProofLimit`, `VerifyUnsupported` | `packages/contract/src/declarations.ts` |
| The new refusal codes | `PlatformRule`, `packages/contract/src/errors.ts` |
| `LegacyVocabulary`, `ARTROOM_LEGACY_V1`, `ARTROOM_LEGACY_V1_DIGEST` | `packages/contract/src/legacy.ts` |
| The code-review declarations, `CODE_REVIEW_ACTS` | `packages/policy/src/codereview.ts` |
| The acts validator, `validatePolicyV2`, `validateCheckerConfigV2`, and the bounds and tables it checks against (`DECLARATION_BOUNDS`, `RESERVED_KINDS`, `STEPS_FOR_TARGET`, `STEP_FIELDS`, `REFUSAL_SLOTS`, `STEPS_VERSIONS`) | `packages/policy/src/acts.ts` |
| The binding identity, `bindingSubject`, `bindingOf`, `bindingsOf` | `packages/policy/src/binding.ts` |

The existing typed records and unions (`ActKind`, `EnvelopeKind`,
`Envelope`, `RosterOp`, `Delegation`, `Invitation`, `PolicyDocument`,
`CheckerConfig`, `CheckJob`, `BearerAct`, `PolicyLane`, `SystemEvent`,
`LaneEffect`, `FailReason`, `AttentionWhy`, and the seven acts' bodies and
records) are unchanged. They describe the legacy vocabulary and the
code-review module. Each new type that a stage adds to one of those unions
says which stage does so; adding it now would force behaviour changes in
the room, the UI and the CLI, which stage 1 excludes.

The code-review declarations are those of note section 6:

| Kind | Targets and steps | `threads` | Body | `who.roles` | `hold` |
|---|---|---|---|---|---|
| `claim` | `none`: `open`; `thread`: `take` | `claim`, `room` | `goal` (text, 1,024, required for `none`), `plan` (text, 16,384, optional) | maintainer, member, agent | `scope: "body.scope"`, `workspace: true` |
| `propose` | `thread`: `version` | `claim`, `room` | `summary` (text, 8,192) | maintainer, member, agent | — |
| `note` | `entry`, `line`: `comment` | `claim`, `room` | `text` (text, 16,384) | maintainer, member, agent, checker | — |
| `review` | `version`: `review` | `claim`, `room` | `text` (text, 16,384) | maintainer, member, agent | — |
| `check` | `version`: `check` | `claim`, `room` | — | checker | — |
| `land` | `version`: `land` | `claim`, `room` | — | maintainer, member, agent | — |
| `release` | `thread`: `release` | `claim`, `room` | — | maintainer, member, agent | — |

### 33.8 Conditions, stages and changes

| Condition of request 245986cb | Rules | Types and code |
|---|---|---|
| (1) R-DECL and the amended rules; every new code, event and outcome explicit; e7307f81's wording | R-DECL-1 to R-DECL-26; 33.3; 33.4; 33.6 | — |
| (2) Declaration types, `PolicyDocumentV2` with `acts` and `steps`, signed binding and grant-map shapes, the legacy vocabulary as frozen data with its digest | R-DECL-1, R-DECL-3 to R-DECL-17 | 33.7 |
| (3) The code-review declarations as data; the acts validator | R-DECL-24, 33.7 | `codereview.ts`, `acts.ts`, `binding.ts` |
| (4) No behaviour change; named mutations | This section | No existing type, rule or function changes behaviour |
| (5) Note 3.5 and 3.8 as recommended | R-DECL-21, R-DECL-22 | — |

| Stage of note 8.5 | Makes effective |
|---|---|
| 1 (this request) | The contract; R-DECL-24 as a validator that nothing calls yet; R-DECL-1's digest; R-DECL-15's identity as a function |
| 2 | R-DECL-1 (the frozen legacy path), R-DECL-6, R-DECL-8, R-DECL-11, R-DECL-13, R-DECL-15 to R-DECL-17, R-DECL-21, R-DECL-23; R-DECL-24 at propose time; 33.6 |
| 3 | R-DECL-25's kind, binding, body and `who` checks; R-DECL-1 in verify |
| 4 | R-DECL-7, R-DECL-9, R-DECL-10, R-DECL-18 to R-DECL-20; `version` then `land`; unanchored comments; the Room migration |
| 5 | R-DECL-16 in the client; R-API-9 as amended; R-CRED-10 as amended |
| 6 | R-DECL-14's retention and `steps-unsupported`; the rest of R-DECL-25 |
| 7 | The jam fixture |
| When a second profile ships | R-DECL-22 |

### 33.9 Open points

These continue section 32.1's list.

46. **The room lease in a binding** (settled after the checker's question
    in the stage-1 review). A hold without `leaseSeconds` binds to the
    string `"room"`, not to the deployment's `LEASE_SECONDS`, so a deploy
    never changes a binding. When such a thread opens, the room resolves
    its current numeric lease length and records it on the thread, and
    R-DECL-6 and R-DECL-9 use that recorded value for the thread's life.
    A change to the deployment's lease therefore affects only threads
    opened afterwards, never an existing thread, and needs no activation.
    This point is no longer open.
47. **Where `kind-undeclared` is decided.** Note 5.1 places it at step 5,
    with the body check. This amendment places it first in step 4a,
    because the binding of step 4a can be compared only with a declared
    kind. Both steps are unrecorded, so the change affects only which code
    a caller sees when an envelope has both an undeclared kind and an
    invalid body.
48. **Reservations on threads without a declaration.** R-DECL-24's guard 9
    checks only opening kinds declared in the same document. A
    `hand-over` naming a historical opening kind is judged at admission
    from the thread's recorded settings (stage 4); a thread with no
    reservation length cannot be handed over.

### 33.10 Stage 5: the generic act and the declarations read (a5d64b35, fa120186)

Stage 5 of note section 8.5 gives clients the declared acts: a read of a
room's declarations with their bindings, an act of any declared kind in the
client, over HTTPS, in the CLI and as two MCP tools, and records shown under
the declarations of their own seq. This section adds to section 33.3's rows
for R-API-9 and R-CRED-10 and amends the rules below. It renumbers nothing.
It records the planner's clarification `fa120186` on two points: readers
use `D(s)`, and a generic bound check may use the MCP endpoint.

#### Amended rules

| Rule | Amendment |
|---|---|
| R-API-3 | One more read route, `GET /v1/rooms/:room/declarations`, with the same credential as every read. With no query it answers with the active policy version's declarations. `?at=<seq>` answers with the version in force for the entry at that seq. `?policy=<version>` answers with that version. Both together, a seq that is not a whole number from 0, or a malformed version, is `bad-request`. A version the room does not retain is `not-found`. `POST /v1/rooms/:room/acts` takes a signed envelope of either version (`AnySignedEnvelope`). It takes nothing else: a bearer token on that route gives no authority, and a bearer act sent there is `bad-request` |
| R-API-5 and the reads | `ReadQuery` gains `{ q: "acts", at?, policy? }`, answered with a `Catalogue` or `null` (`ReadResults.acts`). `RoomApi` gains `acts()`, `actsAt()` and `act()`. `Explanation.kind` and `EntrySummary.kind` may be any kind name, and `Explanation` gains `meaning` |
| R-API-9 | The MCP tool `acts` takes an optional `at` (a seq) or `policy` (a version), never both, and returns the `Catalogue`; for a version the room does not retain it returns `{ outcome: "not-found" }` (`ActsNotFound`), the object-shaped not-found result Artroom chooses for its MCP reads (R-API-9). The MCP tool `act` takes `kind`, `target`, `body`, `binding` and `idempotencyKey`, all required, and calls `RoomApi.act` with them unchanged. It never reads a binding for the agent. A `binding-stale` refusal is an ordinary tool result; its text names the active binding and policy version and says that nothing was done. `explain` returns the `Explanation`, whose `meaning` is the kind's meaning at the entry's own seq. The ten named tools of amendment 2 are unchanged. Section 34 adds four named reads, so the core has fourteen named tools beside `act` and `acts`. The descriptor shape (titles, output schemas, annotations), the toolsets that list `act` and `acts`, their fixed hints, the required key and the wait limit are section 34's (R-API-13 to R-API-15), not this section's |
| R-CRED-10 | As below, "Bearer sessions and the generic act" |
| R-DECL-16 | In a client: as below, "The generic act in a client" |
| R-DECL-17 | A grantor's client builds a `delegate` op or an invitation `session` from the active catalogue: `*`, or a list of kinds, becomes the delegable platform kinds and a map from each declared kind to its active binding. A kind the grantor's role may not grant, or that the document does not declare, stops the build with an error that names it; nothing is signed with a smaller grant than was asked for. In a `v1` room the legacy shape is built, with the kinds as given |
| R-DECL-23 | As below, "Reading a record" |

#### The declarations read

A `Catalogue` describes one policy version: its `policy` (the version, the
ID of its `policy-activated` entry), `since` (that entry's seq) and `until`
(the seq of the next `policy-activated` entry, or `null` while the version
is active). A version governs the entries from `since` up to, and not
including, `until`.

- For a `v2` document it is an `ActsCatalogue`: `vocabulary: "declared"`,
  the document's `steps` and `lanes`, and for each declared kind its
  declaration and its binding (R-DECL-15). Platform kinds are not listed.
- For a `v1` document it is a `LegacyCatalogue`: `vocabulary:
  "artroom-legacy-v1"`, and nothing else. A `v1` version has no
  declarations and no bindings (R-DECL-1).
- A declared kind carries `retired`: the seq of the first later
  `policy-activated` entry whose document does not declare that kind. It is
  absent while every later document declares it. A still later document
  that declares the same name again does not remove it.

The read with no selector answers with the active version. It is what a
caller reads before it prepares an act. A retained earlier version is
`D(s)` for every entry in its interval.

#### The generic act in a client

1. `act(kind, target, body, { binding, idempotencyKey })` signs envelope
   `v: 2` with exactly the kind, target, body and binding given. The
   binding is required. It is the one the caller read from the catalogue,
   for the meaning it intends.
2. A client never reads the catalogue to act, never replaces a binding,
   and never signs an act again on its own. On `binding-stale` it returns
   the refusal, whose `current` names the active binding and policy
   version. The caller reads the declaration and, if that meaning is still
   what it intends, calls again with the new binding. That second call is
   a new act.
3. A prepared act keeps its binding (`PreparedAct.binding`, and inside the
   signed envelope). Sending it again sends the same bytes, or for a bearer
   session the same kind, target, body, binding and idempotency key. An
   exact retry of an act the room accepted returns the original record,
   also after an activation changed the kind's meaning (R-IDEM-2).
4. A platform kind is refused by the generic act before anything is sent:
   `renew` and `roster` keep `v: 1` and their own methods.
5. The named methods of the code-review module (`claim`, `propose`, `note`,
   `review`, `check`, `land`, `release`) stay. With a key, a handle reads
   the active catalogue once. Under a `v1` document it signs `v: 1`, as
   before. Under a `v2` document it signs `v: 2` with the binding of the
   code-review declaration the method was built for, under the room's
   steps version and `lanes`. That is not the room's own declaration's
   binding: where the two differ, the room refuses `binding-stale`. After
   a `binding-stale` or `kind-undeclared` refusal the handle forgets the
   catalogue it read, so the caller's next call reads again; the refused
   act is not sent again. With a bearer session the room adds the built-for
   binding itself (stage 2), and the handle reads nothing.
6. The command line follows the same rules. `artroom act` requires
   `--binding`; it never chooses one. It prints the active meaning after
   `binding-stale`, and what changed since the meaning the user read where
   the room still retains that version.

#### Bearer sessions and the generic act

These replace R-CRED-10's items "`check`: over RPC only" and "The HTTPS
client" for a room whose active document is `v2`. Everything else in
R-CRED-10 stands.

- **Signing.** For a declared act the caller gives `kind`, `target`,
  `body`, `idempotencyKey` and `binding` (`DeclaredBearerAct`). The room
  signs envelope `v: 2` with exactly that binding, with the session key
  under the session's delegation. It never chooses, replaces or looks up a
  binding for such an act. With no `binding`, the act is a named tool's
  (R-API-9 as amended in section 33.3).
- **The legacy rule stands.** A bearer `check` of the legacy vocabulary
  goes by `bearerAct` over RPC only. There is no named MCP `check` tool.
  A handle connected over HTTPS with a bearer token refuses its `check`
  and `roster` methods with `forbidden` before it sends anything.
- **A generic bound check.** In a `v2` room a generic act, with its
  binding, may run a declared `check` step over the MCP endpoint. That
  includes a bearer HTTPS client, whose generic act is one call of the MCP
  tool `act`. The rule looks at the step, not at the word `check`: a
  declared kind of any name whose step is `check` is covered. This amends
  the earlier wording, which excluded HTTPS only because no tool carried a
  check.
- **No new authority.** The delegation's signed map must name that exact
  kind with that exact binding (R-DECL-17). The session's member's role
  and the active declaration must allow it (R-DECL-11). Every guard of
  the check step applies as it does to a key-signed check: the obligation,
  checker, integration, input, configuration and runner of R-OBL-3, and
  the rule that a thread's holder and a version's proposer never meet
  their own check obligation. A generic submission is not independent
  evidence because it is generic.
- **What is excluded.** A `v: 1` act is never accepted on the generic
  path: the generic act is always `v: 2`, and a `v1` room refuses a `v: 2`
  envelope at step 1. `roster` is never accepted from a bearer; on the
  generic path a platform kind in a `v: 2` envelope is `bad-request`.
  Bearer acts are never accepted on `POST /v1/rooms/:room/acts`.
- **Key-signed checks.** A check signed with a member's own key over
  HTTPS, or by a Worker under a delegation, stays available with the same
  authority as before, in `v: 2` with its exact binding.
- **Not here.** The checker service's own path, `CheckJobV2` naming the
  act and binding to sign and the `prepared` event, is stage 4's. Allowing
  this transport does not build it.

#### Reading a record

Readers are the UI, the client, the CLI and the MCP tools.

- A reader shows a record with the label, targets and fields of the
  catalogue that governs the record's own seq. It never uses the active
  catalogue for an old record. The active catalogue is for preparing new
  acts.
- `RecordMeaning` is what a kind meant under one catalogue: `declared`,
  with the label, declaration, binding and `retired`; `platform`, for
  `renew`, `roster` and `recover`; `artroom-legacy-v1`, for a kind of the
  legacy vocabulary under a `v1` document, with `retired` set to the seq
  where another version replaced it; or `unknown`, for a kind the document
  in force did not know.
- A reader that shows a kind with `retired` says so, with the seq.
- A later document that declares a retired name again gives it a new
  binding. Old records keep the label and binding of their own seq. The
  policy version and the binding tell the two meanings apart.
- A label, help or wording edit leaves the binding equal. A record made
  before the edit shows the label in force at its own seq.
- The `explain` read carries the entry's `meaning`, computed by the room
  under the same rule.

#### A thread's kind and its name

- A `Lane` carries `kind`: the kind of the act that opened the thread
  (R-DECL-6), `room` for a revert lane, `recover` for a
  configuration-recovery thread in a `v2` room. It is the value the room
  compares with a declaration's `threads` (R-DECL-8). A reader uses it to
  tell which declared acts may act on a thread. The field is optional in
  the type, so that an older reader still fits. The room always gives it.
- A thread that `claim` opened has a `goal`. A thread that an application
  opened with its own act may have none: its `goal` is the empty text.
- Every reader names a thread by one rule, `threadTitle`:
  1. its `goal`, when that is not empty;
  2. else the title of its opening act, `titleOf`: the label in force at
     that act's seq, then `: ` and the value of one body field, when the
     body has one other than `scope` and `because`;
  3. else the thread's ID, when the opening act is not at hand.
- The field is the first present by name that the opening act's own
  declaration types as `text`. That declaration is the one of `D(s)`, the
  document in force at the opening act's seq, never the active one
  (R-DECL-23). "Text" is the declared type, not the type of the value: an
  enum's value, a member handle and an entry ID are strings too. `open`,
  the step an opening act runs, brings only `scope`, so no step field is
  considered.
- When no such field is present, the field is the first present by name,
  of any type. The same holds when the reader has no declared field types
  for the act: a kind of the legacy vocabulary, a platform kind, a kind
  the document does not declare, or a label alone.
- "First" is by field name. The room keeps a body as canonical JSON, whose
  keys are sorted, so the order a caller typed is not recorded. Sorting
  gives one title from the typed body and from the record.
- A thread's ID is its opening act's ID. One `explain` read of that ID
  gives the `meaning` and the entry, and `envelopeOf(entry).body` is the
  body.
- The CLI prints this name when `artroom act` opens a thread. The MCP tool
  `act` says it in the first line of its result. Neither prints a thread's
  goal anywhere else.

#### What a handle keeps

- `actsAt` may answer from an ended version the handle read before. An
  ended version's declarations and bindings never change. Its `retired`
  marks can: a later activation may drop one of its kinds.
- So a handle drops every ended version it kept when it sees an activation
  later than any it knew. It sees one in a read of the active catalogue, a
  read of another version, a log page, an update, and a refusal whose
  `current` names the active policy version.
- A reader that follows the room's updates therefore shows current marks.
  A handle that has seen nothing since may answer the marks it read.
  `actsAt(at, { fresh: true })` reads from the room and replaces what the
  handle kept. The MCP tool `acts` always reads this way.
- The active version is never kept by `acts()`.

#### Acceptance cases (stage 5)

Each is normative, and each has a test in the stage 5 report
(`plans/README.md`).

| Case | Expected result | Rules |
|---|---|---|
| **Generic act.** A member signs a declared kind that no client method names, over HTTPS; a bearer does the same through the MCP tool `act` | Admitted; the log holds a `v: 2` envelope with the binding given; the record has the act's own kind | R-DECL-16, R-API-9 |
| **Changed meaning.** An act prepared under a kind's binding, sent after an activation that changed a body field, a target, or a hold | `binding-stale` with the active binding and policy version; nothing recorded; the client sends nothing more and reads nothing | R-DECL-16 |
| **Label-only edit.** The same, after an activation that changed only `label`, `help` or wording | Admitted: the binding is equal | R-DECL-15 |
| **Lost result.** The answer to an accepted act is lost; the client retries | The same bytes are sent; one entry; the original record. After a meaning change, the exact retry still returns it | R-IDEM-2, R-DECL-16 |
| **Undeclared kind.** A generic act of a kind the active document does not declare | `kind-undeclared`, unrecorded | R-DECL-23 |
| **Role and grant.** A role `who.roles` does not list; a grant whose map lacks the kind; a grant made for an earlier binding; a grant whose grantor's role lost the kind | `role-forbids`; `delegation-invalid` in each grant case | R-DECL-11, R-DECL-17 |
| **Expanded grant.** `*` expanded before an activation that adds a kind; a grant signed before a meaning change and sent after it | The new kind is not covered; the delayed grant is `binding-stale`, unrecorded | R-DECL-17 |
| **Legacy controls.** In a `v1` room: a named method; the generic act; the `acts` read | `v: 1` as before; `bad-request`, nothing recorded; the legacy catalogue | R-DECL-1 |
| **Named methods in a `v2` room.** A room with the code-review declarations; a room whose `claim` differs | `v: 2` with the built-for binding, admitted; `binding-stale`, and the method is not sent again | R-API-9 |
| **Generic check.** A bearer whose map names a declared check act under another name, with its binding; one whose map lacks it; one with a stale binding; the version's proposer | Admitted and the obligation met; `delegation-invalid`; `delegation-invalid` or `binding-stale`; `not-authorized-checker` | R-CRED-10, R-OBL-3 |
| **Excluded on the generic path.** A platform kind; an act with no binding; any act in a `v1` room; a bearer act on `POST /acts` | Each refused before anything is recorded | R-CRED-10 |
| **Old records.** A room that was `v1`, then declared a kind, relabelled it, retired it and declared the name again with another shape | Each record explains with the label and binding of its own seq; the retired kind's records name the retirement seq; the legacy record names where the `v1` era ended | R-DECL-23 |
| **Dropped twice.** A kind declared, dropped, declared again and dropped again | Each version that declared it is marked with the first later version that did not | R-DECL-23 |
| **Retired after the read.** A handle keeps an ended version; a later activation drops one of its kinds; the handle then sees that activation | The next `actsAt` answer carries the mark. With no sign of the activation the kept answer is given, and `fresh` reads again | R-DECL-23 |
| **Thread kind.** A thread opened by `claim` and one opened by an application's own act | The lane reads give `claim` and the opening kind; an act whose `threads` omits that kind is `wrong-thread` | R-DECL-6, R-DECL-8 |
| **Thread name.** A thread with no goal, read after its opening kind's label or field types changed | Named by the label of the opening act's seq and its first text field by name under that seq's declaration, or its first field by name when none is text; the CLI and the MCP tool `act` print the same name | R-DECL-23 |

#### Types

| What | Where |
|---|---|
| `Catalogue`, `ActsCatalogue`, `LegacyCatalogue`, `CatalogueAct`, `RecordMeaning`, `AnyEnvelope`, `AnySignedEnvelope`, `DeclaredRecord` | `packages/contract/src/declarations.ts` |
| `ReadQuery` and `ReadResults` (`acts`), `RoomApi.act`, `acts`, `actsAt`, `GenericActOptions`, `CatalogueAt`, `AnyBearerAct`, `ActsNotFound`, the `acts` and `act` entries of `McpTools`, the route `GET /v1/rooms/:room/declarations`, `Explanation.meaning` | `packages/contract/src/transports.ts` |
| Each step's own fields with their types, `STEP_FIELD_SPECS` | `packages/policy/src/steps.ts` |
| `meaningOf`, `governs`, `fieldsOf`, `targetsOf`, `builtForBinding`, `expandGrant`, `titleOf`, `threadTitle` | `packages/policy/src/catalogue.ts`; also the export `@generalbusiness/artroom-policy/declared`, which loads no evaluator |
| `Lane.kind` | `packages/contract/src/lanes.ts` |
| `envelopeOf`, a log entry's envelope as `AnyEnvelope`, or null for a system entry | `packages/contract/src/guards.ts` |

`ActsCatalogue` was `{ policy, steps, acts }` in section 33.7. It gains
`vocabulary`, `since`, `until`, `lanes` and the `retired` mark. `LogEntry`
is unchanged: in a `v2` room an entry's envelope may be a
`DeclaredEnvelope` or a `recover` envelope, and readers treat it as
`AnyEnvelope`.

#### Open points

These continue section 33.9's list.

49. **No client method signs `recover`.** The platform kind `recover`
    (R-DECL-21) is admitted by the room from stage 2, and no client, CLI
    or MCP surface builds its envelope. Stage 5's request does not name
    it. Until one does, configuration recovery in a `v2` room needs an
    envelope signed by hand with an admin's own key.
50. **The cost of `retired`.** The read finds each kind's retirement by
    reading later policy documents in order, and stops when every kind has
    one. It is linear in the number of later versions for a kind that is
    still declared. A room with very many activations may want the mark
    stored at activation.
51. **`LogEntry` and declared envelopes.** `LogEntry` keeps its `v: 1`
    envelope type so that this stage changes no file of `packages/log`,
    which stage 3 owns. Readers call `envelopeOf(entry)`, which gives the
    envelope as `AnyEnvelope` without a cast of their own. The type should
    widen when stage 3's decoder lands.
52. **Which field names a thread.** The name of a thread with no goal
    uses the opening act's first text field by name, and its first field
    by name when it has no text field (planner's decision `c37653e1`). It
    goes by name because the room does not record the order a caller
    typed or the order a declaration lists its fields: both are kept as
    canonical JSON. So an application with two text fields gets the
    earlier name, and cannot choose the other. A declaration could name
    the field. That would be a new member of the declaration, and this
    stage does not add one.

## 34. Contract amendment 7 (a9788a59): the MCP core

Request `a9788a59` asked for items 1 to 4 of the MCP plan's amendment
(`notes/2026-10-01-mcp-plan.md` on its design branch, section 11), which Hugh adopted on
2026-10-01 (assert `775acdd3`). Items 5 to 9 (new reads, application packs,
toolsets on invitations, OAuth, resources and prompts) are for a later
amendment. This is amendment 7, after landed amendments 4 (log objects),
5 (canonical token mints) and 6 (declared acts); it does not reuse section
30 or amendment 4 from the original unlanded MCP draft.

The adopted fourteen-tool core composes with amendment 6's generic `act`
and `acts`. This contract handoff adds the four named reads and their
metadata types. Declared-acts stage 5 owns the generic transport types and
runtime, including historical declaration reads and the explicit v2
generic-check transport clarification `fa120186`. Neither scope is
complete merely because the other is delivered.

### 34.1 Conditions and changes

| Item | Rules | Types (`packages/contract`) |
|---|---|---|
| 1. The core tools and toolsets | R-API-9: fourteen named tools plus `act`/`acts`; new R-API-14 | `McpTools` gains `lanes`, `lane`, `proposal`, `operation`; new `McpNotFound`, `McpToolsets`, `McpToolset`; stage 5 composes the generic additions |
| 2. Titles, annotations, advertised output schemas, instructions | New R-API-13; R-API-1 unchanged | `McpToolDescriptor` gains `title`, `annotations`, `toolsets`; `method` of `operation` is `op`; new `McpToolAnnotations` |
| 3. Required idempotency key | R-API-9 | `McpCommon.idempotencyKey` is required |
| 4. Waiting | New R-API-15 | `attention` input gains `waitMs`; new `McpMaxWaitMs` |

The four added reads use methods a bearer already has (`RoomWire.read`
with `lane`, `lanes`, `proposal` and `op`, and `RoomWire.subscribe`). They
add no Room authority. Stage 5 separately adds generic methods and read
routes; its admission dependency remains stage 2. The new core acceptance
cases are in section 23, rows "MCP keys" to "MCP waiting", alongside
amendment 6's generic-act cases.

### 34.2 Required lane edits

Edits marked "(type)" fail that package's typecheck against the amended
contract until they are made. Checked on 2026-10-03 after `npm ci`, against
parent `9615f449853c505b53cde1d93792330415618f67` with this contract:
the contract and its examples compile; the client source and test types
compile; MCP fails for the four missing runners/descriptors and the ten
descriptors' missing metadata; CLI fails through those MCP imports.
These are the expected implementation seams, replacing the original
draft's measurement at `request/laneE-clients@5cd1c13b`. They are not
passing runtime gates. The final composed delivery must implement them
and pass the relevant gates before landing.

**Lane E (`packages/mcp`)**
1. Descriptors: add `title`, `annotations` (the R-API-13 table) and
   `toolsets` (the R-API-14 table) to each; add `idempotencyKey` to
   `required` for every act tool; set `maximum: 45000` on every `waitMs`.
   (type)
2. Add descriptors and runners for `lanes`, `lane`, `proposal` and
   `operation`, returning `McpNotFound` for unknown IDs. The operation
   runner maps `RoomApi.op`'s lookup `not-found` exception to
   `McpNotFound<"operation">`, preserving every other error. `operation` uses
   `op`, then `wait` with `until` and `timeoutMs = waitMs`, and maps a
   `timeout` to a fresh `op` read. (type)
3. `tools/list` sends `title`, `outputSchema` and `annotations`. For act
   tools and `workspace`, `outputSchema` is `oneOf` the result schema and
   the `Refusal` schema. Add a test that validates a success and a refusal
   against it.
4. `attention` with `waitMs`: when the page is empty, wait on the
   subscription for an update with attention items, then read again;
   return the empty page at the deadline.
5. Toolsets: implement the shared R-API-14 role/declaration/grant/binding
   predicate and default precedence in HTTPS and stdio. Accept `?toolset=`;
   drop ineligible new act tools from discovery, keep every core tool
   callable, and preserve accepted exact retries. Cover direct and
   delegated checker defaults, platform-only grants, all-stale and mixed
   maps, changed role/`who`, non-delegable kinds and a renamed check kind.
6. Cut the server instructions to at most 512 characters, and every
   description to at most 1,000.
7. The generated `AGENTS.md` block (`packages/client`, `agents-md.ts`) says
   that every act needs an `idempotencyKey` and that a retry reuses it.
8. Compose `act` and `acts` with all of the above in stage 5. Keep the
   generic `act` descriptor conservative about side effects, since one
   tool may perform a review, a check or a landing; `acts` is read-only.
   Toolsets filter authority without rebinding a signed grant or intent.

**Lane E (`packages/cli`)**
1. Rebuild against the amended `packages/mcp`. (type, through the import)
   When this contract was first checked, the command line needed no
   source change to typecheck. The runtime does need two: `artroom mcp`
   gives the server the caller's authorization (the R-API-14 seam: the
   member's own key, or a bearer's recorded delegation, read from the
   current roster for each `tools/list`), and it takes `--toolset NAME`,
   the stdio form of `?toolset=`.

**The MCP endpoint's deployment (request `8ae3b2dc`)**
1. The `RoomApi`-per-bearer adapter must serve `lane`, `lanes`,
   `proposal`, `op` and `wait` over `RoomWire.read`, and the attention wait
   over `RoomWire.subscribe`.
2. The endpoint's host gives the server the caller's authorization for
   each `tools/list` (R-API-14). Inside the Room's own Worker that is the
   Room's reading of the token. It is not a method of `RoomApi` or
   `RoomWire`, and no service binding returns it.

**Other lanes**
1. Stage 2 continues to own Room admission and shared policy vocabulary.
   Stage 5 owns declaration read routes and coordinates any Room seam.
   No other lane needs a change for the four named reads alone.

### 34.3 Review and composition

The MCP contract request `a9788a59` and declared-acts stage-5 request
`a5d64b35` keep their complete scopes and separate promise bindings. A
combined delivery must name both, report every changed path at one final
head and receive independent review of that whole head. If they are
reviewed separately, the later head must inherit the approved dependency
and pass its gates again. No provisional contract or runtime head is
treated as a completed implementation or a positive jam-readiness proof.
