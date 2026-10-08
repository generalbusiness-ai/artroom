# Proposed executor and auxiliary-duty owner amendment

Draft for review, 2026-10-08. Existing requests `48407a70` and `9be26ef7`;
governing design `c8318a8a06bf88e7ee1422c4ce99c34f602a439f`, adopted by
`a515f21b5e1f3f3e1fa75c222722a825255fd8fa`. This is a source correspondence
and proposed owner amendment for review, not implementation, adopted authority
or activation. The governing design directions are adopted; these exact
schemas and interfaces still require normal owner review and concrete proof.
The inspected execution source is `/tmp/artroom-clone-prep`, commit
`0938010b54e27d436ea1feb92dce6e843ac7bf54`. No project code, test, build or
provider operation was run. This scratch note changes no checkout.

Refined after reading full planner direction
`ec2fa2d234d0ade6273e168f688b1144eb961b94`. Its auxiliary-duty and trust
direction is adopted; the exact amendment below is proposed for normal owner
review. It replaces earlier underspecified schema/authentication and auxiliary
classification choices. Missing executor proof, actual trusted-key/namespace
inputs and measured bounds are not supplied by this refinement.

The reviewed 331-line predecessor is retained verbatim at
`/tmp/artroom-executor-correspondence-reviewed-331.md`, SHA-256
`665e13c5e9a1e07605339d04e1f9dc0830670ba8e07fd3b40b89a74f27e5d315`.
The pre-wording 623-line amendment is retained at
`/tmp/artroom-executor-correspondence-pre-wording-623.md`, SHA-256
`9dffd5e3945807abbe8e22316941797c30a1f068069883c8a3a61e8b05910756`.
The pre-duty-identity 639-line amendment is retained at
`/tmp/artroom-executor-correspondence-pre-duty-identity-639.md`, SHA-256
`c48755148a17c8be6065e07e97fd99061811337961a92271c74382ec78aa1f51`.
The pre-call-plan 679-line amendment is retained at
`/tmp/artroom-executor-correspondence-pre-call-plan-679.md`, SHA-256
`3dfc7f2368b2b822073304c6361624f1659ab3c7a4b1543a831583d87422421d`.
The follow-on identity/call-plan/handoff choices below follow full planner
`8eec9844` and checker `1b58` readings. They remain exact proposed owner-review
schemas, not executable permission or proof of the missing terminal fence.
The pre-role-equality 908-line draft is retained at
`/tmp/artroom-executor-correspondence-pre-role-equality-908.md`, SHA-256
`bf4cebd3bd4c0409b2657cc6d87b6af599c94b177ead1eb58bdd8d96bbfe3af6`.

## Existing seams and the missing proof

`ScopeObject` constructs `SqliteStore` with
`ctx.storage.transactionSync`, then creates its read-only `OutsideGiven`
facade, `Scope`, `Turns` and `Operations`. The adapter receives state reads,
own sealed entries and retained bytes, not Store writes. Preserve that
separation. `ScopeObject.effect()` runs the existing Operations driver;
there is no second executor named `scopeOperations` in this checkout.

`Operations.#pass` checks pinned code, exact operation/origin, adapter
acceptance and owner readiness. At `operations.ts:336` it calls `markSent`
before scheduling `#send`. It then awaits `#wake` before starting the
outside work. The durable attempt row records `sent` once, and the marked
branch does recovery/unknown processing instead of sending the original
request again. These semantics must remain unchanged.

`Operations.#answer` races its outside promise through `within`.
`turn.ts:36–49` makes clear that `within` does not cancel that promise.
An `unknown` outcome may therefore precede a nested continuation resuming
inside an adapter. Neither the timeout nor `attempt.outcome` proves that
continuation cannot enter a provider mutation. A late own answer remains
eligible under the existing ledger; activation must not fabricate another
outcome or reset `sent`.

The useful narrow integration seam is private ownership bookkeeping beside
`attempt`, plus an opaque fence capability carried through the existing
Outside/provider methods. It is not a new operation kind or effect engine.

## Actual terminal calls and their preceding waits

| Existing path | Preparation that can suspend | Terminal mutation boundary |
|---|---|---|
| Register GitHub create | `RegisterHost` checks retained creation; GitHubApp prepares request | GitHubApp `#request`: POST fetch for repository creation |
| Register GitHub delete | `GitHubProvider.cleanupRepository`; any token preparation | GitHubApp `#request`: DELETE fetch for the exact repository |
| Register GitHub revoke | `cleanupCredential` | GitHubApp `#request`: DELETE fetch for the exact token |
| Destination GitHub mint | credential-handle allocation; JWT generation/signing in `mintInstallationToken` | GitHubApp `#request`: POST fetch for repository-restricted installation token |
| Destination GitHub mint-read | read-credential lookup, exact repository identity read, JWT generation/signing | Same token POST, with adopted read permissions |
| Destination GitHub revoke | exact custody lookup, followed by provider method | GitHubApp `#request`: token DELETE fetch |
| Artifacts register create/delete | exact namespace/name checks | `ArtifactsNamespace.create` / `.delete` invocation |
| Artifacts destination mint | credential-handle allocation, `binding.get` | Obtained repository handle's `createToken("write", ...)` invocation |
| Artifacts mint-read | `binding.get` | Obtained handle's `createToken("read", ...)` invocation |
| Artifacts revoke/creation cleanup | `binding.get` | Obtained handle's `revokeToken(...)` invocation |
| First-head/push/receipt | `DestinationHost.#write`: format and possibly objects; `sendOnce`: commit/closure reads; SmartHttpGit: pack compression and receive advertisement | SmartHttpGit `#request`: receive-pack POST fetch |

The final GitHub REST fetch is `packages/git/src/github.ts:234`.
The final Git smart HTTP fetch is `packages/git/src/http.ts:176`.
Both request builders are synchronous up to invoking that fetch.

Destination already carries `allowed` from `DestinationHost.#write` through
`sendOnce` to `SmartHttpGit.beforeSend`. Its existing guard checks live
destination state and exact custody after pack compression/discovery.
Extend that correspondence to ownership; do not replace current checks.
Move or carry the owner invocation fence beside the final fetch so future
nested preparation cannot introduce an unchecked await. REST mutations,
Artifacts token methods and register cleanup need the same capability at
their actual terminal call, not merely at entry to `Outside.send`.

A terminal fetch callback or structural Artifacts binding is a trusted port.
Calling it synchronously proves entry into that supplied port. If its own
implementation defers dispatch, the port owner owes the same fence at that
deeper boundary. A wrapper guard cannot prove an opaque service's executor.

## Finite existing mutation sequences

These are counts of physical call sites in one existing invocation, not
adopted capacity limits or proof that each call occurs.

| Invocation | Existing sequence and maximum mutable call sites |
|---|---|
| Artifacts create repository | One create, then at most one immediate revoke of its returned creation token: 2 |
| Register delete or revoke credential | One exact delete/revoke: 1 |
| Destination mint or mint-read | One restricted createToken / installation-token POST: 1 |
| Destination revoke | One exact revoke: 1 |
| Artifacts `#read` | One temporary read-token create, host reads, at most one revoke in `finally`: 2 |
| Artifacts judge/read/adopt-read invocation | One `#read` lifecycle: at most 2 |
| Computed founding-head or receipt write through Artifacts | Format read, one receive-pack POST, optional successful read-back, final seen read: at most 3 temporary-token lifecycles plus POST, 7 |
| Push or imported first-head write through Artifacts | The preceding sequence plus object-read lifecycle: at most 4 temporary-token lifecycles plus POST, 9 |
| The corresponding GitHub write | One receive-pack POST; current source reads use supplied read credentials rather than minting temporary Artifacts tokens |

Artifacts `#read` obtains a handle, verifies `info().remote`, then creates
the read token before entering the try/finally that revokes it. Validation
of plaintext occurs before that finally; malformed token replies can leave
uncertain remote token creation. The current code does not retain a durable
temporary-token cleanup duty. Its finally also treats failed revocation as
unconfirmed and relies on the provider's reported expiry assertion. Do not
turn either behavior into invented proof of revocation or closure.

Current exact093 wiring deliberately supplies no Artifacts `recovery` port
(`artifacts-wiring.ts:97–105`): each individual read mints a temporary read
token and can revoke it, so repeating it is not mutation-free. Repeated
same-attempt Artifacts recovery is future owner-adopted work, not current
runtime behavior. Each proposed invocation would be finite, but an attempt
count alone would not bound its total repeated invocations. Owners must
specify and review the exact finite auxiliary call plan and accounting for
each invocation under the original binding. Calling an outer method a read
does not exempt its physical mutations. No unlimited `invoke` permission
and no permit for resending the original mutation is introduced.

Immediate creation-token cleanup, ordinary recorded revocation, temporary
token cleanup and remote original effects are distinct duties. Closure must
not drop any existing custody/cleanup obligation. If an auxiliary duty must
survive local owner closure, its exact retained custody and compatible
continuation path need owner correspondence; temporary-token durability is
currently a specific gap to resolve, not a missing amount certified zero.

## Proposed private records and restricted API

Names below are proposed interfaces, not implemented types. Use canonical
records and domain-separated content IDs under the adopted trust scheme.

```ts
interface DispatcherOwner {
  service: string;
  namespace: string;
  object: string;
  scope: ScopeRef;
  nonce: string;
  release: Digest;
  build: Digest;
}
interface SendPermit {
  id: Digest;
  generation: number;
  tuple: Digest;
  attemptBinding: Digest;
  owner: DispatcherOwner;
}
interface AttemptDispatch {
  operation: OperationId;
  attempt: number;
  origin: Digest;
  binding: Digest;
  permit: SendPermit;
  phase: "reserved" | "marked" | "closed";
  originalEntered: boolean;
  calls: readonly CallEntry[];
  closure: Digest | null;
}
interface DispatchFence {
  invoke<T>(site: MutationSite, current: () => boolean,
            call: () => Promise<T>): Promise<T>;
  close(): ClosureReceipt;
}
```

`MutationSite` is the finite reviewed call plan for that exact existing
method/binding, not arbitrary caller text. `CallEntry` names the site,
exact target/request identity and occurrence. It contains no token plaintext.
`ClosureReceipt` binds the permit, exact owner/nonce/release/build, original
attempt and binding, and durable fence evidence. Its authenticated wire
encoding, signer and coordinator verification remain owner inputs.

Add a private table beside `attempt`, with the same operation/attempt key
and complete scope/origin identity. Persist the immutable AttemptBinding
before first dispatch. Its fields include semantic bundle, register-binding
content ID, provider/account/installation/namespace/repository identity and
exact capability/ref/lifetime limits. Never derive missing legacy attribution
from current configuration. A reviewed operator decision must attribute it
once; unknown/conflicting attribution leaves work held.

The scope owns record mutations and issues the opaque fence to adapters.
Keep OutsideGiven read-only. A provider cannot select another binding,
change the owner, reopen its nonce or obtain an unrestricted Store handle.
Recovery, retained replies, credential retrieval and cleanup use the original
binding after restart and config rotation.

## Permit lifecycle and synchronous exclusion

1. The coordinator issues the exact permit in its transaction, serialized
   with draining. Draining stops new old-generation permits. Local storage
   retains its authenticated owner/tuple/binding before use.
2. Before marking, an abort is terminal only when the exact owner is
   durably fenced against both later marking and provider invocation.
   Persist the fence/abort proof; a timed-out issue RPC is not an abort.
3. In the local existing durable transaction, validate the reserved owner
   record and atomically record its marked phase with `markSent`. Treat the
   attempt as may-have-started immediately. There is no abort-to-unsent,
   original resend or permit retirement after this point.
4. After every awaited preparation, each actual mutable call invokes the
   opaque fence. It synchronously checks the exact local durable owner,
   nonce/release/tuple and outstanding permit, immutable call binding and
   current authority/freshness/custody predicate. It consumes the applicable
   finite call-plan entry in a local transaction, then calls the terminal
   port on the same synchronous stack. No await or detached task lies between
   checking/consuming and calling. The original entry is one-shot.
5. Closing synchronously installs a durable exclusion that every terminal
   call path checks. It cannot be inferred from provider completion,
   `within` timeout, an unknown outcome or `attempt.outcome`. A suspended
   continuation later sees that fence; duplicate invocation cannot consume
   the original entry again. Local auxiliary obligations must have their
   reviewed disposition without losing custody/cleanup duties.
6. The coordinator authenticates the exact local closure receipt before
   retiring the permit. Lost acknowledgement is retried as finalization,
   never dispatch. A local open owner cannot coexist with a coordinator
   retired permit. This invariant permits a synchronous local terminal
   check; doing an awaited coordinator check at that boundary would itself
   introduce the forbidden gap.
7. Restart reads the predecessor's immutable record. It cannot adopt its
   nonce or reissue the original request, even if the crash happened after
   marking and before entering the provider. Recovery may establish a new
   authenticated fence for the old owner only with actual executor proof.
   Otherwise its permit stays outstanding and activation remains held.

Closure proves no future original local mutation can start or repeat. It
does not prove the remote effect completed. An already-entered call may
finish after local closure. Unknown history, late own answers, private
custody and cleanup remain under their original binding and compatible tuple.

## Exact admission transaction seam

Admission tickets are separate from physical permits. Coordinator issuance
binds generation/tuple, full scope/head and exact input/operation identity,
serialized with draining. Do not give remote coordinator code a scope commit.

`Turns.#commit` uses `Store.transaction`; `#judged` rechecks the head, judges,
calls `#seal`, then checks `fits` against the folded state. Add the ticket's
exact committed-entry finalization in that same transaction, after the fits
check and before returning `verdict.sealed`. A `Full` rollback must roll it
back too. Admission of semantic refusal entries retains existing contract
behavior. Preflight refusal/aborted tickets write no semantic scope entry.

An atomic abort record must preclude every subsequent commit under that
ticket. Snapshot-restart or preparation timeout alone cannot retire it.
The coordinator authenticates durable commit/abort evidence, with idempotent
bounded delivery of finalization. `Turns.onSealed` runs after commit and is
only a notification seam; it cannot replace atomic finalization. The exact
ticket integration for first genesis and timed/settling turns is an owner
input: activation protection cannot skip a sealing path just because no
ordinary client act initiated it.

## Bounds obligations from existing capacity work

`derive/reserve.ts` implements section 17.3 admission in the entries axis:
new work leaves room for owed deadlines, requests/results/late results,
operations and owner closures, holders, markers and the closing checkpoint.
Settling entries consume their existing reservation. `held.ts` represents
five axes: entries, items, records, retained bytes and pending requests;
distinct duties sum, alternatives take componentwise maxima. S1/S2/S3
deliveries explicitly leave full Used/reserved admission, additional record
terms, checked arithmetic, physical cost and numeric adoption unfinished.
`Bounds.scopeEntries` is the only implemented scope budget here.

Therefore these new private/operator records need separately demonstrated
physical bounds and settlement room; scope-history `fits` does not already
cover them. Keep that obligation in existing `cc570904` and its owners.

Before issuance, account for the record/bytes and required local/coordinator
commit-or-abort and closure-finalization work, including lost acknowledgements
and retained exclusion evidence. Reserve mandatory finalization/cleanup room;
never evict an outstanding ticket, permit, unknown owner or custody record
to admit new work. Backpressure refuses new issuance, not owed settlement.

Owner-owed quantities are maximum simultaneous preparations and dispatcher
owners; tuple/root/manifest bytes and reference-closure work; exact record
sizes and request envelopes; per-pass issuance/finalization/recovery work;
peak old/new generation overlap; retained nonce/fence and finalization
backlog; auxiliary token call/custody/cleanup counts; arithmetic and storage
precision; archive retention; and actual transaction/CPU/memory/network cost.
Measure the consistency domain before any sharding claim. Existing
`deliveryBatch`, bounded due/parked walks and indexed retained-reply pages
are reusable scheduling boundaries, not measured capacity for a coordinator.
No root count, default quota, lease or timeout is adopted by this note.

## One real-scope controlled witness and honest control

Extend the existing `github-founding.test.ts` production-wiring fixture.
Keep its real PLATFORM objects, SQLite, Turns, Operations, RegisterHost,
DestinationHost, GitHubProvider and smart-HTTP stack. Label the terminal
HTTP provider and test clock as stand-ins, as the existing test does.

Gate the already existing receive advertisement GET before the first-head
POST. The real attempt is marked and its exact permit stays outstanding;
the nested `SmartHttpGit.send` continuation is suspended after admission.
Through the adopted local owner-closing boundary durably fence that nonce.
Close only the executor owner: leave the publication/branch target, its token,
authority and private custody valid. Assert the existing destination and live
custody predicates still permit this exact write and the advertisement still
matches its expected old ref. Do not let an unknown-outcome/cleanup transition
decide first while the send is gated; that would not distinguish the owner fence.
Assert the coordinator cannot retire before authenticated closure. Release
the GET gate, then assert zero receive-pack POSTs for that original attempt.
Its durable mark remains; the test must not manufacture an unsent outcome.
Restart the scope and run its existing operation pass. Assert no nonce
adoption or original resend, unchanged immutable binding, and preserved
uncertainty/custody duties. Do not open a replacement room or new provider.

The honest control removes only the terminal owner-closure guard while
retaining current destination/custody checks, which must still pass for that
same original send. The unchanged witness must
fail by the receive-pack POST count assertion, not timeout or exception.
Existing Operations T19 continues to witness marked-attempt restart and
late own-answer semantics; do not duplicate its whole scenario. The pure
HTTP witness remains useful for current-token/target rechecks, but alone
cannot establish durable owner/restart exclusion.

This one witness proves propagation through the nested Git write path,
not all provider call sites. REST and Artifacts correspondence still require
the complete finite call-site inventory above and source review at their
terminal invocation points. The test does not certify GitHub behavior,
Artifacts internals, cloud executor kill/drain behavior or remote completion.

## Precise decisions and evidence still owed

- Transaction/executor owner: adopt exact authenticated ticket/permit/owner
  schemas, trusted issuer and closure signer; identify the terminal-port
  consistency/exclusion guarantee and every commit/fence path. Prove that
  no nested or detached continuation can bypass `invoke`.
- Host owner: declare the finite original/auxiliary mutation plan and its
  exact capability/ref/target binding, including Artifacts temporary-token
  creation/revocation, creation cleanup and proposed same-attempt recovery
  invocations. Current Artifacts wiring has no recovery port.
  Supply durable correspondence for auxiliary custody/cleanup that may
  outlive closure; current temporary tokens do not supply it automatically.
- Capacity owner: adopt measured issuance/overlap/backlog/retention/storage
  and work bounds with mandatory-finalization headroom in all applicable
  physical axes. No missing term is zero by assumption.
- Coordinator/deployment owner: define authenticated idempotent finalization,
  monotonic tuple selection and local-close/coordinator-retire correspondence.
  Supply actual recovery proof for a crashed owner; absence of an answer or
  an expiry is not closure.
- Operator: old releases without this fence cannot participate. Supply
  authenticated replacement/drain evidence covering outstanding executions,
  calls and exact durable attempt/custody state. Cloudflare deployment or a
  changed Worker version does not by itself prove old calls were drained.
  Without this evidence old ownership blocks activation.

Implementation should stay in the existing ScopeObject/Turns/Operations/
Store/SqliteStore paths, a small explicit coordinator/fence port, existing
host adapters and terminal Git transports. It introduces no semantic effect
engine, new outcome class, inferred provenance or expanded provider authority.

## Exact owner amendment proposed after ec2

This section governs the earlier illustrative interfaces. It supplies schema
and terminal-port requirements for normal owner review, without claiming
implementation or enabling the service. The numeric call counts above remain
inventory only. Keep all existing scope-history operation/outcome semantics.

### Canonical records, identities and authentication domains

All records below have exactly their listed fields, reject unknown members,
and use the current canonical JSON implementation. Digest/KeyId/ScopeRef/
FactRef/Timestamp/signature fields use their existing structural validators;
all integer ordinals/revisions are nonnegative safe integers, with checked
increments. `null` is explicit. Arrays have no duplicate identities and are
ordered by their declared ordinal or canonical byte identity. These are shape
rules, not capacity quotas. Actual field byte maxima are capacity-owner inputs
and must be validated before issuance or storage.

```ts
interface OwnerKey {
  service: string;
  namespace: string;
  object: string;
  scope: ScopeRef;
  nonce: Digest;
  release: Digest;
  build: Digest;
}
interface AttemptKey {
  scope: ScopeRef;
  origin: FactRef;
  operation: OperationId;
  attempt: number;
  binding: Digest;
}
interface PermitPayload {
  format: "artroom-send-permit-1";
  service: string;
  generation: number;
  tuple: Digest;
  coordinator: { namespace: string; object: string; key: KeyId };
  owner: OwnerKey;
  attempt: AttemptKey;
  callPlan: Digest;
  purpose: "original-dispatch" | "auxiliary-read" | "owned-cleanup";
  duty: Digest | null;
}
interface ClosurePayload {
  format: "artroom-owner-closure-1";
  service: string;
  generation: number;
  tuple: Digest;
  permit: Digest;
  owner: OwnerKey;
  attempt: AttemptKey;
  closedRevision: number;
  localRecord: Digest;
  exclusion: Digest;
}
interface SignedOwnerRecord<T> {
  key: KeyId;
  payload: T;
  sig: Base64Url;
}
interface InvocationKey {
  attempt: AttemptKey;
  ordinal: number;
  site: string;
}
interface AuxiliaryReceiptJudgment {
  format: "artroom-auxiliary-receipt-1";
  invocation: InvocationKey;
  binding: Digest;
  owner: OwnerKey;
  replyCustody: Digest;
  cleanupHandle: Digest | null;
  repository: { name: string; id: string | null };
  rights: "read" | "write";
  reportedEnds: Timestamp | null;
  checkedAt: Timestamp;
  repositoryEvidence: "trusted-bound-handle" | "exact-own-reply";
  result: "usable" | "cleanup-only" | "unavailable";
  reason: null | "wrong-repository" | "wrong-rights" | "invalid-expiry"
               | "expired" | "malformed-reply" | "missing-handle";
}
interface CleanupAuthority {
  format: "artroom-owned-cleanup-1";
  duty: Digest;
  invocation: InvocationKey;
  binding: Digest;
  cleanupHandle: Digest;
  action: "revoke-exact-credential" | "reconcile-exact-creation";
  /** Nonsecret provider ID only; required bearer bytes remain private. */
  target: { repository: string; providerCredential: string | null };
  admittedBy: Digest;
}
interface LocalClosureRecord {
  format: "artroom-dispatch-exclusion-1";
  permit: Digest;
  owner: OwnerKey;
  attempt: AttemptKey;
  closedRevision: number;
  callEntries: readonly Digest[];
  carriedDuties: readonly Digest[];
  closed: true;
}
interface DutyIdentity {
  format: "artroom-auxiliary-duty-1";
  invocation: InvocationKey;
  binding: Digest;
  plan: Digest;
  admission: Digest;
  purpose: "temporary-read-token" | "creation-token-cleanup";
  originalDispatcher: OwnerKey;
  originalMintOwner: OwnerKey;
  originalMintInvocation: InvocationKey;
}
interface AuxiliaryDutyState {
  format: "artroom-auxiliary-duty-state-1";
  duty: Digest;
  permit: Digest;
  owner: OwnerKey;
  phase: "reserved" | "mint-may-start" | "reply-held" | "usable"
       | "cleanup-pending" | "revoke-may-start" | "revoked"
       | "creation-unknown" | "cleanup-unknown";
  cleanupHandle: Digest | null;
  receiptJudgment: Digest | null;
  uncertainty: null | "no-reply" | "malformed-reply" | "missing-handle"
                   | "custody-failed" | "revoke-refused" | "revoke-unanswered";
  revision: number;
  predecessor: Digest | null;
}
interface OwnerClosedState {
  format: "artroom-owner-state-1";
  permit: Digest;
  owner: OwnerKey;
  attempt: AttemptKey;
  closedRevision: number;
  exclusion: Digest;
  phase: "closed";
}
type ClosureReadback =
  | { ok: true; attestation: SignedOwnerRecord<ClosurePayload>;
      ownerRecord: OwnerClosedState; exclusionRecord: LocalClosureRecord }
  | { ok: false; reason: "not-found" | "open" | "conflict" | "unavailable" };

type MutationSite = "repository.create" | "repository.delete"
  | "credential.mint" | "credential.revoke" | "git.receive-pack"
  | "temporary-read.mint" | "temporary-read.revoke";
type CallRole = "original" | "auxiliary-mint" | "owned-cleanup";
interface ProviderTarget {
  provider: Digest;               // exact retained immutable provider identity
  repository: { host: string; namespace: string; name: string; id: string | null };
}
interface Rights {
  operation: "create" | "delete" | "read" | "write" | "revoke";
  permissions: readonly { name: string; level: "read" | "write" }[];
}
interface AbsoluteLifetime {
  notBefore: Timestamp;
  useBefore: Timestamp;
  requestedSeconds: number | null;
  maximumProviderEnds: Timestamp | null;
}
interface RequestIdentity {
  method: "POST" | "DELETE" | "ARTIFACTS_CREATE" | "ARTIFACTS_DELETE"
        | "ARTIFACTS_CREATE_TOKEN" | "ARTIFACTS_REVOKE_TOKEN";
  path: string;                   // exact endpoint/repository method target
  publicBody: Digest | null;      // canonical nonsecret request arguments only
  /** Token/bearer bytes are absent; resolve the exact private predecessor. */
  custodyFromSite: number | null;
}
interface CallSitePlan {
  ordinal: number;
  site: MutationSite;
  role: CallRole;
  target: ProviderTarget;
  ref: string | null;
  rights: Rights;
  absoluteLifetime: AbsoluteLifetime | null;
  request: RequestIdentity;
  cleanupPredecessor: number | null;
}
interface CallPlan {
  format: "artroom-dispatch-call-plan-1";
  attempt: AttemptKey;
  admittedBy: Digest;
  sites: readonly CallSitePlan[];
}
interface PhysicalInvocation {
  format: "artroom-physical-invocation-1";
  attempt: AttemptKey;
  plan: Digest;
  siteOrdinal: number;
  auxiliaryOrdinal: number;
  purpose: "original-dispatch" | "auxiliary-read" | "owned-cleanup";
  sourceDuty: Digest | null;       // already-admitted predecessor duty only
  originalOwner: OwnerKey;
}
interface CallEntry {
  format: "artroom-dispatch-call-entry-1";
  invocation: Digest;
  plan: Digest;
  siteOrdinal: number;
  auxiliaryOrdinal: number;
  permit: Digest;
  owner: OwnerKey;
  attempt: AttemptKey;
  duty: Digest | null;
  sourceDuty: Digest | null;
  request: RequestIdentity;
  cleanupHandle: Digest | null;    // reference to private custody, never bearer
  mayStartAt: Timestamp;
}
interface CleanupHandoff {
  format: "artroom-cleanup-handoff-1";
  duty: Digest;
  origin: AttemptKey;
  originalPlan: Digest;
  originalDispatcher: OwnerKey;
  originalMintOwner: OwnerKey;
  originalMintInvocation: InvocationKey;
  rights: Rights;
  predecessorState: Digest;
  predecessorRevision: number;
  oldOwner: OwnerKey;
  oldPermit: Digest;
  authenticatedClosure: Digest;
  newOwner: OwnerKey;
  newPermit: Digest;
  compatibleTuple: Digest;
  coordinator: { namespace: string; object: string; key: KeyId };
  remainingAuthority: Digest;
}
```

For the original logical mutation the invocation ordinal is zero. Auxiliary
invocation ordinals are monotonically allocated positive values in the exact
parent attempt's durable bookkeeping, never reallocated across owners or
restarts. The reviewed call plan enumerates each concrete method/site,
original-versus-auxiliary role, exact repository/ref/rights/lifetime constraints
and permissible cleanup predecessor. It is content-addressed, not mutable
caller text. Each cleanup dispatch records a separate ordinal and its source
duty; new work cannot reuse an old invocation ID to remint or hide uncertainty.

The stable duty ID is external: hash the immutable DutyIdentity only. Its
binding must equal invocation.attempt.binding and its admission/plan must
match the authenticated reservation. Store that identity once. Phase changes,
owner transfer and cleanup progress do not change the duty ID. Hash each
AuxiliaryDutyState separately under its state domain; the state digest is
external to that payload and identified with its monotonically increasing
revision. State's duty field refers to the stable identity, not its own hash.
The immutable originalDispatcher, originalMintOwner and originalMintInvocation remain fixed across
handoff; purpose describes that mint/creation's auxiliary duty, not a new cleanup
executor. Origin's complete scope, entry hash, operation/attempt and binding are
explicit in invocation.attempt. OriginalMintInvocation must equal invocation
for that duty's founding mint/creation. originalDispatcher must equal the
original dispatch's complete owner; originalMintOwner must equal that mint's
recorded physical owner, never the current cleanup executor. Handles, current owner, phase,
uncertainty, receipt and revision are excluded from DutyIdentity.

The initial AuxiliaryDutyState has revision zero and predecessor null. Each
update must compare the current stable duty ID, exact predecessor state digest
and revision in one local transaction, then write revision + 1 with predecessor
equal to that digest. Checked increment must fit the adopted arithmetic bounds.
Concurrent/stale updates fail rather than replace custody or origin. Owner change
requires the authenticated handoff below; it is not an ordinary state update.

Proposed domain tags are exact strings:
`artroom-send-permit-1`, `artroom-owner-closure-1`,
`artroom-dispatch-call-plan-1`, `artroom-physical-invocation-1`,
`artroom-auxiliary-duty-1`, `artroom-cleanup-handle-1`,
`artroom-auxiliary-receipt-1`, `artroom-owned-cleanup-1`,
`artroom-auxiliary-duty-state-1`, `artroom-owner-state-1`,
`artroom-dispatch-call-entry-1`, `artroom-cleanup-handoff-1`,
`artroom-dispatch-exclusion-1` and `artroom-owner-finalization-1`.
IDs are SHA-256 over tag, newline and canonical payload bytes, as the existing
tagged-byte/digest implementation does. IDs are external to the payload they
hash. Signatures are existing Ed25519 over the same tagged canonical payload;
they are not session HMACs. Nonces are fresh digest-form owner identities from
the trusted executor, with durable uniqueness/exclusion; their actual entropy
source and nonce-generation correspondence remain executor-owner evidence.

### Finite plans, consumed entries and cross-record equality

CallPlan has at least one site; sites are finite, numbered contiguously from
zero and sorted by ordinal, with no unlisted mutable call. Canonical permission
names are unique and sorted by byte order. No numeric site/byte/work ceiling
is chosen here: whole-plan validation must use the measured owner-adopted bounds.
For each concrete invocation, the producer selects the exact finite permitted
sequence from the existing method's reviewed code. An unchecked optional site
or implicit provider retry cannot expand it.

Target/provider and repository fields must equal the immutable AttemptBinding;
an unknown repository ID is permitted only for creation that cannot know it
before the call. A usable token and ordinary repository write require the
nonnull stable ID. ref is nonnull only for the exact Git write target. Rights
must equal that site's constrained rights in the original adopted binding; they
are not widened by a family label or a new cleanup owner. PublicBody identifies
the retained nonsecret arguments (for a Git write, the exact ref/old/new/object
set identity). Actual endpoint/method/arguments must match at the terminal seam.
Auth headers and bearer bytes are never hashed into these signed public records.

Where an admitted site has an access/token window, absoluteLifetime records
that exact window, with notBefore < useBefore; the terminal check must be inside
it. Null is allowed only where the reviewed existing duty authority specifies
no such window; it cannot imply a stale human grant or waive current authority/
custody checks. RequestedSeconds, when present, is the exact admitted
token request. Reported provider expiry is separately retained and validated,
never overwritten by useBefore. Owned cleanup has no inherited human access
window; its duty authority and current compatible tuple govern it. It cannot
turn this distinction into a new read/write or broader credential request.

cleanupPredecessor and custodyFromSite are null except for sites that consume
an earlier mint/creation's cleanup material. Each nonnull ordinal is strictly
lower than the site using it and names the exact mint/creation role in this
plan. Plans reference such local ordinals, not state/duty/invocation/entry IDs.
They contain neither their own digest nor a permit ID or downstream duty ID.
This makes the dependency order acyclic:
admission/reservation -> plan -> physical invocation -> immutable duty origin
-> duty-bound permit -> consumed CallEntry -> changing duty state/closure.
For cleanup of an already admitted duty, sourceDuty refers to that existing
origin; no new mint duty is created or rewritten by cleanup.

PhysicalInvocation has no self-ID, permit, changing state or own newly created
duty ID. Its external digest is computed before dispatch. DutyIdentity carries
the original invocation values, not a CallEntry digest. Admission used there
is a prior independently identified reservation, not the downstream permit.
This prevents permit/duty/plan/entry self-dependencies. A CallEntry is an
immutable consumed may-start record; reply/progress updates live elsewhere.

The terminal transaction must verify all of these equalities, not just digest
shape or labels:

- CallPlan.attempt == PhysicalInvocation.attempt == CallEntry.attempt ==
  PermitPayload.attempt, including complete scope, origin FactRef and binding.
  origin.at equals attempt.scope; operation's opening position agrees with
  origin.seq; attempt is the actual existing opened attempt.
- The external plan ID equals invocation.plan, entry.plan and permit.callPlan;
  siteOrdinal selects the exact CallSitePlan, and entry.request equals that
  site's RequestIdentity. Both auxiliaryOrdinal values match the allocated
  invocation ordinal. The concrete target/ref/rights/lifetime/arguments and
  exact private custody predecessor must match that selected site's constraints.
- entry.permit equals the authenticated permit ID; entry.owner equals its
  owner and the actual executor identity/nonce/release/build. Scope and service
  agree across the owner, attempt and active tuple. The invocation's original
  owner is retained; a later cleanup owner is authorized only through handoff.
- The selected site.role maps exactly to both invocation.purpose and
  permit.purpose: original -> original-dispatch; auxiliary-mint -> auxiliary-read;
  owned-cleanup -> owned-cleanup. Entry consumption rejects any other pairing.
  An outer original-dispatch permit does not authorize a nested auxiliary mint;
  that invocation needs its own matching pre-reserved authenticated permit.
  A duty-bound owned-cleanup permit cannot select mint/create/write, even if
  those sites occur in the same originalPlan.
- An auxiliary mint's entry.duty equals the external DutyIdentity ID and
  permit.duty. Identity invocation/originalDispatcher/originalMintInvocation,
  binding, plan and admission equal their founding records.
  Identity.invocation.ordinal equals physicalInvocation.auxiliaryOrdinal and
  identity.invocation.site equals the selected site's MutationSite.
  A cleanup entry's sourceDuty, entry.duty, permit.duty and CleanupAuthority.duty all equal the
  same existing admitted duty; its origin/binding/rights remain unchanged.
- For the original mutation, auxiliaryOrdinal is zero and duty/sourceDuty are
  null. Its may-start slot is unique across every permit/owner/release for the
  original AttemptKey. Auxiliary mint is one-shot per positive allocated
  ordinal; cleanup/reconciliation gets a distinct reserved invocation under
  the reviewed existing duty policy, never a replay of a consumed call entry.

Atomic consumption compares the unconsumed invocation and exact predecessor
state before mark-may-start, writes CallEntry once and does the terminal call
on the same synchronous stack. A timeout or owner handoff cannot clear that
consumption. No new automatic retry policy or effect engine is introduced.

For an auxiliary token cleanup entry, CleanupAuthority.action must be
revoke-exact-credential, selected site must be credential.revoke or
temporary-read.revoke, method must be DELETE or ARTIFACTS_REVOKE_TOKEN, and
rights.operation must be revoke with the exact original binding's permitted
cleanup constraints. Its sourceDuty and private cleanupHandle must equal the
authority and current owned predecessor; repository/ref/nonsecret provider ID
must match that duty's original target. No minted token or repository creation/
write site can satisfy this equality. reconcile-exact-creation authorizes only
an admitted exact safe read, never consumption of a mutable CallEntry; any
nested temporary-token mint/revoke has its own correctly typed auxiliary permit.
Other recorded cleanup kinds require their exact adopted duty/action schema;
they are not authorized by this auxiliary-token revocation form or discarded.

### Authenticated cleanup handoff and custody distinction

CleanupHandoff is signed by the compatible active tuple's authorized coordinator
under artroom-cleanup-handoff-1 after authenticating the predecessor owner closure
and trusted durable readback. Its predecessorState/revision must be the exact
current AuxiliaryDutyState, its duty must hash the unchanged DutyIdentity,
and oldOwner/oldPermit must match that state. authenticatedClosure names the
verified signed closure/fence evidence, not a caller boolean. The scope applies
the handoff using the same predecessor CAS, changes current owner/permit through
the new issued cleanup permit, and retains the handoff as the transition evidence.
newPermit must equal that signed permit's content ID, and its owner/tuple/duty/
attempt/callPlan must equal the handoff's newOwner/compatibleTuple/duty/origin/
originalPlan. The permit does not contain a handoff ID; the handoff is issued
after the permit and carries it without an ID cycle. The scope must not permit
new-owner cleanup entry until the authenticated handoff CAS commits.
The new tuple must explicitly support the same bundle, original provider binding,
rights, origin and remaining duty. OriginalPlan/originalDispatcher/originalMintOwner/originalMintInvocation
must equal DutyIdentity; origin equals its original AttemptKey. No old nonce is
reopened, original call reconsumed, missing handle inferred or uncertainty dropped.

CleanupAuthority.target.providerCredential means only a nonsecret provider
credential ID, never an API bearer, token plaintext or signing secret. Required
bearer bytes are privately quarantined under cleanupHandle, tied to this stable
duty, original invocation and exact provider/repository target. An internal
terminal lookup verifies that binding and retrieves only the existing required
material for the exact permitted revoke. The signed request identity carries
the custody reference, never the plaintext. If a service requires plaintext
and none remains, preserve an explicit owned missing-material gap; do not place
it in public strings, guess it, or claim revocation. Provider ID and private
custody reference are distinct even when a provider API accepts either.

The active tuple explicitly names the coordinator identity/key authorized to
issue permits for that stable service and generation. The executor accepts
only its exact valid signed permit, supported tuple/release/build, own actual
namespace/object and complete local scope/attempt/binding. Authenticating a
coordinator key without these scope/owner bindings is insufficient. Draining
precludes further old-generation issuance. No caller chooses a coordinator,
namespace, signing key, nonce, binding or cleanup purpose.

The tuple also authorizes the trusted executor attestation key for an exact
namespace/object set and reviewed release/build. A signed ClosurePayload is
necessary but not sufficient. Retirement must additionally read back the exact
durable closure through the tuple-pinned executor/namespace boundary. Resolve
the actual object through that trusted binding, not an address from the
receipt, and verify complete ScopeRef, owner nonce/release/build, original
attempt/binding, local closure revision/digest and terminal exclusion digest.
Readback returns the exact signed attestation separately from owner and exclusion
records. Verify the returned attestation equals the presented signed message
and authenticates its ClosurePayload. Hash ownerRecord under artroom-owner-state-1
and require that digest to equal payload.localRecord; hash exclusionRecord under
artroom-dispatch-exclusion-1 and require that digest to equal payload.exclusion
and ownerRecord.exclusion. Match both records' permit, owner, attempt and
closedRevision against the payload and require closed phase/exclusion. These
are distinct canonical byte records, not an assertion that LocalClosureRecord
bytes equal ClosurePayload bytes. Open, absent or conflicting readback blocks
retirement. Then retire the permit transactionally in the coordinator.
Closure revisions are monotonic; acknowledged retirement cannot reopen a nonce.

This readback authenticates local record ownership and exclusion. It does not
prove the port's implementation checks that exclusion; the reviewed terminal
fence correspondence below is separately necessary. Actual key IDs, namespace/
object identities, readback RPC authentication and deployment receipts remain
owner inputs. Caller booleans, shared-key possession alone, clock expiry and
Worker labels are not substitutes.

### Durable auxiliary lifecycle and exact cleanup authority

Before any auxiliary mint, atomically allocate its ordinal/identity and reserve
its record, bounded reply capture, private cleanup custody, receipt judgment,
local finalization, coordinator finalization and cleanup/uncertainty headroom.
This is private bookkeeping beside the existing driver/custody, not a new
scope operation kind or independently retrying effect engine. The existing
capacity owner must adopt its measured amounts; no new invocation is issued
when those resources are unavailable.

Immediately before the exact token call, record `mint-may-start` durably and
consume its one terminal call entry. It remains may-have-started even if the
process stops before entering the port. Original mutation resend remains
forbidden regardless of any auxiliary result or newly allocated ordinal.

On a returned reply, snapshot members once and privately retain every available
bounded cleanup handle before semantic validation or exposure. A local handle
is tied to invocation ID, exact original provider/repository binding and the
private returned provider ID/plaintext needed for exact cleanup. It is
quarantined, never public or usable. Preserve it even when rights/remote/expiry
validation later fails. An unbounded/unreadable reply or custody failure keeps
explicit creation uncertainty; never invent a token handle or certify no mint.

Only validated actual rights, exact repository/provider identity and actual
reported expiry, followed by an exact durable successful receipt judgment,
permit use. Existing destination credentials still require their real committed
mint outcome and custody judged callback. Auxiliary temporary tokens currently
have no such durable judgment record: the amendment must supply a narrowly
specified private AuxiliaryReceiptJudgment before internal host-read use.
That record attests validated own provider reply under the admitted call plan;
it is no human grant, public credential or fabricated scope-history outcome.
Its exact schema/validation and provider trust correspondence belong to normal
host/contract review; the proposed exact record above supplies that review
subject. Invalid reply never becomes usable custody. A `usable` judgment
requires a nonnull cleanup handle and nonnull stable repository ID matching
the original binding, reportedEnds strictly after checkedAt, no reason,
and matching invocation/owner/binding/repository/rights. All other judgments
authorize no token use. The repository-evidence field discloses whether the
existing trusted bound handle or an exact own reply supplies that identity;
it is not an independent provider audit. Recheck the current clock before
use. replyCustody references private captured data; no secret or raw response
is included in this record or its digest/signature.
The judgment must also validate reportedEnds against the selected mint site's
admitted absolute lifetime and rights limits. A token mint site requires a
nonnull maximumProviderEnds from that exact admitted policy; its own reported
expiry must not exceed it, and use must remain inside notBefore/useBefore and
strictly before reportedEnds. These timestamps are explicit admitted constraints,
not new numeric defaults or an inferred provider expiry. Preserve the provider's
reported value unchanged; never replace it with a client deadline or fabricate
a missing timestamp. A late, invalid or over-limit reply remains quarantined
with its original owned cleanup/uncertainty duty and cannot become usable.

After use, cleanup is due. Malformed reply with a usable cleanup handle also
owes cleanup without ever authorizing use. Allocate/reserve its exact cleanup
invocation, record `revoke-may-start` before the terminal revoke, and confirm
revoked only from that provider's decisive own answer under the original binding.
A failed/refused/unanswered revoke keeps `cleanup-unknown` with its handle.
Lost reply/handle keeps `creation-unknown` or `cleanup-unknown`, with explicit
missing-handle ownership. Reported TTL, elapsed time and erased plaintext do not
confirm revocation. No duty is removed by starting a newer auxiliary invocation.

Cleanup/reconciliation authority derives from that previously admitted durable
duty, exact provider binding, handle and reviewed cleanup call plan. It does not
reuse the initiating person's stale grant or allow a fresh human mutation.
Only exact revocation/cleanup and admitted reconciliation are eligible; no
remint, broader rights, namespace scan, new repository/ref or target substitution.
The coordinator issues a duty-bound cleanup permit under a compatible active
tuple. Store checks the pending duty and exact predecessor; the provider checks
the original binding and handle at the terminal call. Current compatibility,
tuple and port checks still apply. A key removal cannot erase mandatory cleanup
by treating it as a new discretionary human act, nor grant unrelated work.

Unknown duty without an available provider handle may have no safe existing
reconciliation API. Preserve the duty and report that limitation. Do not guess
identities or perform an unadopted provider search. New auxiliary work is bounded
by reserved headroom while all older unknown duties remain accounted for.

### Terminal-port amendment and limits of closure proof

Replace the earlier illustrative caller-supplied `current(): boolean` with
checks inside the trusted reviewed terminal port. The opaque fence verifies
the exact permit/owner/attempt/binding/call-plan entry and current port authority/
freshness/custody or admitted cleanup-duty predicate. It verifies the actual
prepared target/rights/ref/body identity against that call-plan entry. It
synchronously records may-start/consumption, then invokes the pinned terminal
transport without an await. An arbitrary caller predicate or callback is not
authority. The sole original-call entry cannot be consumed twice.

Every physical mutation in the existing inventory passes this seam: GitHubApp
REST POST/DELETE fetch, SmartHttpGit receive-pack POST fetch, Artifacts create/
delete, token mint and token revoke. Propagate the opaque capability through
the existing provider methods and nested `#read`/cleanup paths. A closed nonce
rejects all later terminal entries. Unsettled cleanup is retained as an admitted
duty for a compatible new duty-bound owner/permit, never by reopening the old
owner or adopting its nonce. Original marks and unknown outcomes remain intact.

Current CredentialStore can hold validated mint replies and exact expected
revocations; it has no auxiliary ordinal/quarantine/uncertainty/finalization
record. Artifacts `#read` validates plaintext before its finally and retains
neither lost/malformed mint nor failed revoke as a durable owned duty. Creation
also checks returned name/token before retaining its cleanup handle. These are
actual amendments required by ec2, not existing guarantees.

The local no-await seam proves invocation of the terminal fetch or binding
method. The structural ArtifactsNamespace/Repository types do not prove when
their implementation physically dispatches after entry, whether it retries,
or whether its deeper continuations honor an owner fence. A supplied fetch
implementation can likewise defer or repeat internally. This cannot be proved
from the present caller source. The port/executor owner must supply the exact
terminal implementation guarantee or place the fence at that deeper dispatch
boundary. Unsupported correspondence keeps permits outstanding and activation
held; a new type signature or signed closed row cannot manufacture the proof.

Previously deployed releases that never checked this fence remain an additional
operator replacement/drain obligation. No Cloudflare restart/drain guarantee is
assumed. Readback can authenticate a closed record in a new object; it cannot
by itself prove an old execution elsewhere no longer bypasses that record.
Keep existing uncertainty, custody and cleanup during that recovery.

Actual trusted-key/namespace/executor declarations, AuxiliaryReceiptJudgment
validation correspondence, terminal dispatch/no-retry correspondence, legacy drain evidence and
measured reservation/retention/cleanup/finalization quantities remain inputs
for normal owner review. No quota, provider-proof claim, tests, code or
enablement is added by this amendment draft.
