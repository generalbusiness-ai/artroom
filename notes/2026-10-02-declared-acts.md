# Declared acts

2026-10-02. Gitseq request `a2cbd459` (planner to builder), following
hugh's assert `4e4134b4`. Branch `request/declared-acts`, cut from main
`df22d771`.

**What this note is for.** Assert `4e4134b4` says that a room's acts are
declared by its application, not fixed by the platform. It supersedes the
fixed seven-act design: plan section 4, `ActKind` in
`packages/contract/src/acts.ts`, and everything that assumes those seven
are the only acts. This note designs that change. It says what a
declaration contains, what the room enforces whatever the declaration
says, where declarations live and how they take effect, how replay stays
deterministic, what happens to undeclared kinds, how the seven acts become
the code-review application's declarations, what the jam's declarations
look like, and what the change costs and in what order to build it.

**What it adopts.** Nothing beyond assert `4e4134b4`. Every other
statement is a proposal for review. Points that need hugh's decision are
marked **Decision for hugh**. The note commissions no build: each stage in
section 8 becomes its own request only after this note is approved.

**Citations.** Code is cited at main `df22d771` as `path@df22d771:line`.
To keep lines short, paths under `packages/` drop that prefix and the
`src/` directory: `room/admission.ts` means
`packages/room/src/admission.ts`. Rules are cited by ID from
[docs/protocol.md](../docs/protocol.md). "The plan" is
[2026-10-01-artroom-plan.md](2026-10-01-artroom-plan.md).

## 1. What an act declaration contains

A declaration is data. It names the act, the shape of what a signer sends,
who may sign it, and which of the room's primitives (section 2) the act
runs. It contains no code and no pointer to code. gitseq found that a
declaration able to name code is a privilege-escalation seam (section 9).

The proposed shape, in the contract's TypeScript style:

```ts
/** One declared act. The key in `PolicyDocument.acts` is its kind. */
interface ActDeclaration {
  /** Shown to people and agents. */
  readonly label: string;
  /** For each target shape the act accepts, the primitive steps it runs. */
  readonly targets: { readonly [T in TargetShape]?: readonly Step[] };
  /** The application's own body fields, beyond those the steps require. */
  readonly body?: Readonly<Record<string, Field>>;
  readonly who: {
    /** Roles that may sign it, within the platform floor (section 2.2). */
    readonly roles: readonly Role[];
    /** Whether a delegation may cover it (R-ADM-5). Default true. */
    readonly delegable?: boolean;
  };
  /** For steps that take or keep a hold. */
  readonly hold?: {
    /** The hold's scope: the body's `scope` field, or fixed globs with `{field}` slots. */
    readonly scope: "body.scope" | readonly Glob[];
    /** Absent: the policy's `lanes` setting (R-POL-8). */
    readonly conflict?: "exclusive" | "by-scope";
    /** Absent: the room's lease. Bounded by the platform (section 2.2). */
    readonly leaseSeconds?: number;
    /** For `hand-over`: how long the hold stays reserved for the named member. */
    readonly reserveSeconds?: number;
    /** Whether the thread has a workspace: a fork and a token (R-WS). */
    readonly workspace?: boolean;
  };
  /** Refusal wording in the act's own terms, by refusal code. */
  readonly refusals?: Readonly<Partial<Record<RefusalCode, { readonly reason: string; readonly fix: string }>>>;
  /** Guidance for agents. Never read by admission. */
  readonly help?: string;
}

type TargetShape = "none" | "thread" | "version" | "entry" | "line";
type Step = "open" | "take" | "version" | "review" | "check" | "land" | "release" | "hand-over" | "comment";
type Field = (
  | { readonly type: "text"; readonly max: number }
  | { readonly type: "int"; readonly min: number; readonly max: number }
  | { readonly type: "bool" }
  | { readonly type: "enum"; readonly values: readonly string[] }
  | { readonly type: "globs"; readonly max: number }
  | { readonly type: "member" }
  | { readonly type: "act" }
  | { readonly type: "segment" }
) & { readonly optional?: boolean; readonly requiredFor?: readonly TargetShape[] };
```

How each part of the request maps onto this shape:

| The request asks for | Where it is in a declaration |
|---|---|
| The act's name and body schema | The key in `acts`; `body`, plus the fields each step requires (section 2). Field types are the room's existing closed set (`room/schema.ts@df22d771:53-134`) |
| Who may perform it | `who.roles` and `who.delegable`. Holder-only follows from the steps (`take` on a held thread, `version`, `land`, `release`, `hand-over`). Review and check qualification follow from the `review` and `check` steps. A narrower limit, such as one team, is a `refuse` rule on the actor's role and teams (`contract/policy.ts@df22d771:159-164`) |
| What it requires of the room's state | The guards each step brings (section 2), plus policy `refuse` rules whose `on` names the act (R-POL-2). A declaration adds no third mechanism |
| What it holds exclusively, and for how long | `hold`: scope, conflict mode, lease length, reservation length |
| What it changes in the room's state | Its steps. There is no other way to change state |
| Whether it lands files, and which checks and reviews apply | Steps `version` and `land`. Obligations come from `require` rules on the changed paths (R-POL-3), as today; acts with step `review` or `check` are the evidence that meets them |
| How refusals are worded in the act's own terms | `refusals`: a reason and a fix per refusal code |

**Hold settings are fixed when a thread opens.** The lease length,
conflict mode and reservation length are stored on the thread by the act
that opens it, and later acts on that thread use them.

**Steps combine only in one way.** An act runs one step per target shape,
except that `version` may be followed by `land`. That pair lets an
application land a change in one act when no review is owed (section 7).

**Refusal wording.** The room still decides the refusal and its code, so
clients can branch on the code. The declaration supplies only the
`reason` and `fix` text. The text may use these slots, filled by the room
from facts it already reports: `{holder}`, `{lane}`, `{generation}`,
`{obligation}`, `{path}` (the first path outside a hold, as today's
`outside-claim` reason gives it), `{reservedFor}`, `{until}` and `{kind}`.
Nothing else is interpolated, so a template cannot leak body text or
provider text into a refusal. This
follows the closed safe-text grammar that request `d29c09fa` (main
`df22d771`) applies to stored error fields.
A refusal from a `refuse` rule keeps that rule's own `reason` and `fix`,
as today (`contract/policy.ts@df22d771:51-56`).

**Recommendation: application state stays in files and in the record.**
A declaration cannot define new state variables, such as a counter or a
"current key" held only in the room. An application keeps such state in
files that it lands (the jam keeps its key in `song.json`) or in typed act
bodies. Reasons: files are already versioned, reviewed, checked and
carried (R-CARRY); and dap's spike found that writing models with their
own state is where the cost lies (section 9). Revisit when an application
needs state that cannot be a file.

## 2. The primitives the room enforces, and the invariants

### 2.1 Primitives, derived from the code

The seven acts today are thin wrappers over a small set of room
mechanisms. Admission runs one shared path for every act
(`room/admission.ts@df22d771:1-23`, R-ADM-1). Steps 1 to 6 differ by kind
only through tables: the role table and the body and target shapes. Steps
7 to 10 differ through the `decide` switch
(`room/admission.ts@df22d771:486-505`). The handlers behind that switch
use these mechanisms:

| Step | What the room enforces and does today | Fields it requires | Where |
|---|---|---|---|
| `open` | A new thread (today: lane), held by the signer at lease generation 1, over a scope; conservative overlap, refused under `exclusive` | `scope`; `purpose` stays platform (section 3.4) | `room/admission.ts@df22d771:608-660` |
| `take` | On a held thread, the holder rescopes it at the same lease generation; on an unheld one, any qualified signer takes it over at the next lease generation; `expectedGeneration` must match | `scope`, `expectedGeneration`, `lease` (rescope only) | `room/admission.ts@df22d771:662-726` |
| `version` | Holder only, current lease; head reachable in the fork; diff bounded; changed paths inside the scope; `.artroom/**` validated and given an admin obligation; `require` and `carry` rules; new generation, pin, preview, attention to reviewers and checkers; an unreserved landing is invalidated | `lease`, `expectedGeneration`, `head` | `room/admission.ts@df22d771:399-428, 730-893` |
| `review` | Head equals the version's head; the signer qualifies for a review obligation and is not the author (with the two flagged exceptions); verdict recorded as evidence | `head`, `verdict`, `scope`, `dependsOn?` | `room/admission.ts@df22d771:992-1088`, `room/obligations.ts@df22d771:92-125` |
| `check` | Bound to an open check obligation, the named checker, an integration the room prepared, the active configuration digest, its volatile flag and runner, and the exact tree or snapshot; never by the author | the nine `CheckBody` fields | `room/admission.ts@df22d771:1092-1228` |
| `land` | Holder only; latest generation and its head; no landing in flight; no blocked or pending recomputation; every review obligation met; `land` rules; starts a landing operation in the same transaction | `lease`, `head` | `room/admission.ts@df22d771:1230-1276`, R-LAND-1 |
| `release` | Holder only; thread unheld, lease generation up by one, optional handover note kept, workspace token revoked, members told | `lease`, `note?` | `room/admission.ts@df22d771:1278-1306` |
| `comment` | Anchored to an entry or to a line of a version's head; renews the holder's lease if the holder signs; attention to the holder and the replied-to author | `replyTo?` | `room/admission.ts@df22d771:946-990` |
| `hand-over` | **New.** As `release`, and the thread is reserved for one named active member until a deadline. Only that member may `take` it until the room seals `reservation-ended`. A reserved thread counts as held in overlap checks, so nobody can open a second thread to get round the reservation | `lease`, `to` | none yet (section 7) |

Shared guards that every step uses: the thread exists (`lane-unknown`),
the holder and lease check (`room/admission.ts@df22d771:516-524`), the
configuration-recovery check (`room/admission.ts@df22d771:526-533`), and
policy `refuse` rules (`room/admission.ts@df22d771:535-556`). Any accepted
act from the holder renews the lease (R-ADM-11,
`room/admission.ts@df22d771:578-585`).

Two kinds stay platform kinds, not declared: `renew`, which only renews a
hold (`room/admission.ts@df22d771:1308-1337`), and `roster`
(`room/admission.ts@df22d771:1350-1510`). A third, `recover`, is proposed
in section 3.4.

**What moves into declarations:** act names, labels, the application's
body fields and their limits, which roles may sign, which steps
an act runs on which target, the hold's scope source, conflict mode,
lease and reservation lengths, refusal wording, and help text. The roles
table (`room/roster.ts@df22d771:29-35`) and the per-kind body and target
checks (`room/schema.ts@df22d771:163-305`) become derived from the active
declarations.

**What stays platform code:** the meaning of every step, the guards it
brings, and everything in section 2.2.

**Limits of this set.** The steps are lane operations. They express
exclusive holds over paths, versions of files, evidence, landing and
comments. They do not express agreements between several parties with no
file, multi-step state machines inside one thread, or guards over state
the rule input does not carry. A `refuse` rule sees only the act, the
actor, six lane fields, the proposal and the roster
(`contract/policy.ts@df22d771:209-217`), not lease expiry, obligations or
other threads. gitseq and dap both found such a ceiling (section 9). The
jam fits under it (section 7). An application that does not is a finding
for a new step, not a reason to let declarations carry code.

### 2.2 Platform invariants that no declaration can change

These are plan decision 1 ("authorization and persistence invariants stay
in platform code", plan section 14) and plan section 9's "Platform
invariants that policy cannot change", extended to declarations. A
proposed policy document that tries to change any of them is refused with
`policy-invalid` (section 3).

| # | Invariant | Where enforced today | Why a declaration cannot change it |
|---|---|---|---|
| 1 | Identity comes only from the verified signature; canonical bytes; idempotency per key (R-SIG, R-ADM-2, R-IDEM) | `room/admission.ts@df22d771:203-228, 289-299` | Without it no act can be attributed or replayed |
| 2 | Authority is judged at admission, by one of four cases; a delegation never covers `roster` and never exceeds its grantor; the recovery key signs only roster ops (R-ADM-3 to R-ADM-5, R-GEN-3) | `room/authority.ts@df22d771:54-137` | A declaration is data authored under the roster's authority. If data could grant authority, a member could approve their own escalation. gitseq refuses to let `roster` be redefined for this reason (section 9) |
| 3 | `renew`, `roster` and `recover` are platform kinds; their names and the system event names are reserved | `room/authority.ts@df22d771:74-79, 91-94, 119`; `room/admission.ts@df22d771:1308-1510` | The room reads them directly to decide authority and recovery |
| 4 | A review must come from a member the obligation names, and not from the author except for documentation scopes or a flagged sole admin; a check must come from the named checker, for the exact generation, integration and active configuration (plan section 9, invariants 1 and 2; R-OBL-2, R-OBL-3) | `room/obligations.ts@df22d771:62-65, 92-125`; `room/admission.ts@df22d771:1001-1035, 1102-1178` | Landing trusts evidence. A declaration that let authors meet their own obligations would make review meaningless |
| 5 | Changed paths come from the actual diff, old and new for renames; a version outside its hold is refused (plan invariant 3, R-PROP-3, R-PROP-4) | `room/admission.ts@df22d771:740-765` | Otherwise a scope could hide a sensitive change |
| 6 | Scopes use the restricted glob syntax and conservative overlap (plan invariant 4, R-PATH) | `room/glob.ts`, `room/schema.ts@df22d771:109-119` | Exclusivity is only as good as overlap that never misses |
| 7 | A change to `.artroom/**` needs an admin's approval; admins can always change the roster and policy; configuration-recovery lanes bypass policy (plan invariant 5, R-ADMIN-1 to R-ADMIN-9) | `room/obligations.ts@df22d771:41-46`; `room/admission.ts@df22d771:526-543, 774-776` | Declarations live under `.artroom/`. This invariant is what makes it safe to let a room declare its acts |
| 8 | Policy, and so the declarations, activate only at the seq right after the landing that changed them (plan invariant 6, R-POL-9, R-PUB-9) | `room/core.ts@df22d771:650-688, 1325-1336` | Replay needs one exact answer to "which declarations judged this act" |
| 9 | Leases are fenced by lease generation; one holder at a time; expiry only by a sealed `lease-expired` event from the room clock (R-LANE-6, R-LANE-8) | `room/admission.ts@df22d771:516-524`; `room/core.ts@df22d771:1399-1415` | A declaration may choose a lease's length within bounds, never the mechanism |
| 10 | Only the room writes main, through one landing operation per thread, reservation and complete-forward publication (R-LAND, R-PUB) | `room/admission.ts@df22d771:1243-1270`; `packages/git/src/landing/` | Landing safety is the platform's product |
| 11 | The log is append-only, hash-chained and room-signed; refusals at admission steps 7 to 9 are recorded, steps 1 to 6 and refused joins are not (R-LOG, R-ADM-8) | `room/admission.ts@df22d771:1521-1571`; `room/core.ts@df22d771:915-921` | `artroom verify` depends on it |
| 12 | Every body string is scanned for secrets; only fixed-format fields skip the entropy check (R-SEC-1 to R-SEC-4) | `room/admission.ts@df22d771:314-321` | A declaration cannot mark its own text field as exempt. Only fields of a fixed format (`member`, `act`, `segment`) skip the entropy check, as the room's fixed-format fields do today (`room/schema.ts@df22d771:82-86`) |
| 13 | The evaluator profile, its function list and budgets are fixed (R-EVAL-1 to R-EVAL-4) | `policy/profile.ts`, `policy/evaluator.ts@df22d771:302-318` | Replay and bounded cost |
| 14 | Size limits: 64 KiB envelope; text fields at most 16 KiB; at most 64 patterns and 64 reasons (R-SIG-6) | `room/schema.ts@df22d771:20-28` | A declaration may only lower them |

**The platform floor on roles.** R-GEN-5 says roles decide which kinds a
member may sign, and R-POL-10 says policy cannot change that. With
declared acts, `who.roles` replaces the R-GEN-5 table for declared kinds,
under two fixed limits: `admin` may sign every declared act, and
`checker` may sign only acts whose steps are `check` or `comment`. This
grants no new power. A declaration lives in `.artroom/**`, so changing
who may sign an act needs an admin's approval (invariant 7), and admins
can already change any member's role with a roster act.

**Bounds proposed for holds:** a lease of 10 seconds to 24 hours, and a
reservation of 1 second to 10 minutes. These are proposals, to be fixed in
the protocol amendment.

## 3. Where declarations live and how they take effect

### 3.1 Recommendation: in the policy document

Declarations go in `.artroom/policy.json`, as a new `acts` field in a new
document format, `artroom-policy-v2`. An author may keep them in a
separate source file; the policy pack already compiles `.artroom/policy.ts`
into `policy.json` ([docs/policy-pack.md](../docs/policy-pack.md)).

Reasons, over a separate `.artroom/acts.json`:
- Policy rules name act kinds (`RefuseRule.on`, `NotifyRule.on`,
  `contract/policy.ts@df22d771:51-96`). One document means one validator
  can check that every kind a rule names is declared.
- The existing machinery covers it unchanged: R-PUB-9 already activates on
  a change to `.artroom/policy.json`; the `policy-activated` event already
  names the document's digest; the document is already retained under
  `artroom-log/v1/policies/` (R-LOG-7, R-LOG-9); and `artroom verify`
  already tracks which version is in force at each entry
  (`log/verify.ts@df22d771:513-528`). No new log field is needed.
- One version identity: the `policy-activated` entry's ID (R-POL-12).

A `v1` document has no `acts`. It means the code-review declarations of
section 6, which ship in the platform as data with a fixed digest. The
default policy (R-POL-7) includes them. So every room founded before this
change, and every log it wrote, keeps its meaning (section 5.3).

### 3.2 Admin approval and activation

Nothing new is needed:
1. A proposal that changes `.artroom/policy.json` is validated at propose
   time (R-POL-1). The validation grows to cover `acts` (section 3.3).
2. It gets `obl_admin-approval` (R-ADMIN-1). A sole admin may approve it,
   flagged (R-ADMIN-2).
3. The proposed declarations never judge their own authorization
   (R-ADMIN-9).
4. When it lands, `policy-activated` is sealed at the next seq (R-POL-9,
   `room/core.ts@df22d771:1325-1336`). From that seq the new declarations
   judge every act.

### 3.3 Validation at propose time

R-POL-1 refuses an invalid document with `policy-invalid`. For `acts` it
also checks:
- every kind matches `[a-z][a-z0-9-]{0,31}` and is not reserved
  (`renew`, `roster`, `recover`, and the system event names of R-LOG-5);
- every target shape lists only allowed steps, and only `version` then
  `land` is combined;
- body field names do not reuse a step's field names or `because`;
- every limit is inside the platform's bounds (invariant 14, section 2.2);
- `who.roles` respects the platform floor (section 2.2);
- `hold.scope` slots name `segment` or `enum` fields of the same act;
- every rule's `on` names a declared kind or a platform kind;
- refusal templates use only the slots in section 1;
- **soundness:** no step is unreachable. Every step that needs a thread
  or a version has an act that can create one; every `hand-over` has an
  act that can `take` the thread; and a hold that no declared act can end
  is reported, because only lease expiry will end it. This checks the
  reachable states, after the workflow-net view in the acts review
  (`notes/2026-10-02-acts-review.md` on branch `request/acts-review`,
  section 6.2).

### 3.4 The recovery path cannot depend on declarations

Today a configuration-recovery lane is a `claim` with
`purpose: "config-recovery"`, then `propose`, `review` and `land` on that
lane, all admin-only and outside policy rules (R-ADMIN-5,
`room/admission.ts@df22d771:611-616`). If the recovery path were made of
declared acts, a bad declaration could remove it, and a room could lock
itself out. That breaks invariant 7.

**Decision for hugh.** Two options:
- **(a) Recommended: a platform kind `recover`**, with ops, as `roster`
  has: `open`, `version`, `approve`, `land`, `release`, `note`. It keeps
  today's recovery rules exactly, and it is judged by platform code
  whatever the declarations say. The code-review application's `claim`
  loses its `purpose` field. The cost is a contract change to the
  recovery acts. No production log holds any: the spike deployment's
  state was wiped under decision D5 (`notes/deploy-spike.md`, "Wipe and
  retirement").
- **(b) Reserve the code-review names.** `claim`, `propose`, `review`,
  `land`, `release` and `note` keep their code-review meaning in every
  room, and recovery uses them. No contract change for recovery, but the
  seven stay special. That contradicts the assert's "one vocabulary among
  others".

### 3.5 Upgrading a declaration safely

- **Holds and reservations survive activation.** A thread keeps the lease
  length and the reservation deadline it was given. Activation does not
  end, shorten or extend any hold. Only the steps and lease expiry do.
- **Open versions are recomputed,** as today (R-POL-9). A change to who
  may review, or to `require` rules, reaches open proposals through the
  existing `obligations-recomputed` events.
- **Landing operations prepared under the old version are fenced** and
  prepared again (R-LAND-5), as today.
- **An act signed against the old declarations** is judged by the new
  ones. If its body no longer fits, it is refused, unrecorded, with
  `invalid-body` or `kind-undeclared`, and the refusal names the active
  version. **Recommendation:** envelopes do not carry the declaration
  version they expect. dap does carry it, and treats a mismatch as
  `stale_binding` (section 9). That guards against a change of meaning
  with no change of shape, which is rare here because steps have fixed
  meanings, and it would add a field to every envelope.
- **Clients learn the declarations from the room**: a read of the active
  version's `acts`, and the same in MCP (section 8). gitseq publishes its
  catalog in the same way (section 9).
- **Retiring a kind** means leaving it out of the next document. There is
  no fallback to a built-in definition. gitseq's fallback is an
  implementation detail its own design note proposes to remove (section
  9).

### 3.6 Upgrading the evaluator

Today the genesis pins the profile and the `jsonata` version (R-GEN-1),
the deployment refuses a genesis that differs (R-GEN-10,
`room/founding.ts@df22d771:169-171`), and `artroom verify` requires every
decision's stamp to equal the genesis profile
(`log/verify.ts@df22d771:427-429`). The only rule on upgrades is R-EVAL-4:
a dependency update needs a new profile version, or a reviewed claim
backed by the full conformance corpus that the old profile is unchanged.
So today a room can never change its evaluator.

Declared acts do not need a new evaluator. They add no expression
language: guards are the existing `refuse` rules. But the question is
asked, and a long-lived room will need an answer.

**Decision for hugh. Recommendation:**
- The policy document already names its profile
  (`contract/policy.ts@df22d771:119`). A room changes profile only by
  activating a document that names the new one, at an exact seq, through
  the same admin-approved landing. A deploy never changes a room's
  profile.
- The genesis names the room's initial profile, not its only one.
- The platform keeps every profile it has shipped, with its pinned
  `jsonata` build. `artroom verify` replays each decision with the
  evaluator its stamp names, and checks that the stamp is the profile of
  the version in force at that seq.
- A new profile ships with its own conformance corpus and the old
  corpus run unchanged against the old profile.

This amends R-GEN-1, R-GEN-10 and R-EVAL-4. It is not needed for the
first stages in section 8.

## 4. Deterministic evaluation and replay

**What is evaluated, and how.**
- Body and target shapes, the roles check and every step's guards are
  platform code, deterministic, with no evaluator.
- Guards written as expressions are `refuse` rules. They run in the
  pinned profile (R-EVAL-1), with budgets unchanged (R-EVAL-2), on the
  input for their kind (R-EVAL-3), stamped with the `jsonata`, profile and
  accounting versions (R-EVAL-4), on one meter per act (R-EVAL-9). A
  declaration can neither add a function nor raise a budget.
- Each decision records its policy version, which now also names the
  declarations, and the digest of its replay context (R-POL-11,
  R-EVAL-8). Nothing outside the context, the policy and the profile may
  change an outcome.

**Which declarations judged an act.** The act at seq `s` was judged by the
document of the last `policy-activated` event before `s`. Verify already
computes this for every entry (`log/verify.ts@df22d771:466, 513-528`) and
already requires each decision's policy to be that version.

**What `artroom verify` checks on a fresh clone today**
(`log/verify.ts@df22d771:1-24`): every signature and the hash chain; each
act's authority, by replaying the roster from earlier entries; and every
recorded policy decision, by replaying it from its retained context. It
does not re-derive lane, lease, obligation or landing transitions, for any
of the seven acts (R-LOG-15, `log/verify.ts@df22d771:183`).

**What it must check with declared acts:**
1. **Kind and body.** The kind is declared in the version in force at its
   seq, and the body fits that declaration. Today decoding rejects any
   kind outside a fixed list of nine (`log/decode.ts@df22d771:96, 261`).
2. **Authority.** The roster replay judges `who` from the declarations in
   force, not from the fixed table in `log/roster.ts@df22d771:42-52`,
   which today differs in form from the room's own table
   (`room/roster.ts@df22d771:29-49`).
3. **Policy decisions.** Unchanged.
4. **Step guards. Recommendation:** verify folds thread state (holder,
   lease generation, generation, reservation) from the receipts' effects
   and the `lease-expired` and `reservation-ended` events, and checks each
   step's guards against it, with code shared with the room. The receipts
   already carry these effects (`contract/log.ts@df22d771:43-53`). Today's
   gap in verify is not new, but once guards are chosen by data, a fold
   is what lets a fresh clone show that each declared guard held. This is
   a separate stage (section 8), so that items 1 to 3 do not wait for it.

With items 1 to 4, `artroom verify` on a fresh clone reproduces every
admission decision: the shape check, the authority judgement, each step's
guard, and each policy decision.

**No clock in replay.** Every time-based decision is turned into a sealed
event before it can affect an act: lease expiry today (R-LANE-8,
`room/core.ts@df22d771:1399-1415`), and reservation end for `hand-over`.
Admission seals due expiries before it decides anything
(`room/admission.ts@df22d771:236-237`). So replay compares sequence
numbers, never clocks.

## 5. Records whose kind is not declared, or no longer declared

### 5.1 A new act whose kind is not declared

Refused at admission step 5, with the new code `kind-undeclared`, and not
recorded. The reason names the kind and the active version; the fix points
to the room's declarations. Step 5 refusals are unrecorded today
(R-ADM-8), and the body of an undeclared kind was never checked, so it
must not reach the log. gitseq moved to the same rule after silent
undefined kinds misled authors (section 9).

Today an unknown kind is an unrecorded `bad-request` at step 1, from the
fixed list (`room/schema.ts@df22d771:147`). The new rule moves the check to
step 5, where body checks already are.

### 5.2 A record whose kind was declared when written

It stays valid forever. Activation sequence numbers make this exact:
- The act at seq `s` was admitted under the document `D(s)` in force at
  `s` (section 4). Its kind and body were checked against `D(s)`, and its
  decisions name `D(s)`'s version.
- A later activation at seq `t > s` changes `D` only for entries after
  `t`. It never revisits entry `s`. This is R-ADM-7 ("an admitted act's
  authority is never re-judged as an act") applied to kinds.
- `D(s)` is retained by digest (R-LOG-7), so a fresh clone can always read
  it. Verify judges `s` under `D(s)`, as it already judges policy
  decisions.

So retiring, renaming or changing a kind never invalidates a record. A
name may later be declared again with a different shape. Each record is
still read under the version at its own seq.

**How readers show it.** The UI, client and MCP show a record with the
label and fields of `D(s)`, and mark a kind no longer declared as
"retired at seq `t`". They never classify an old record by the current
vocabulary; gitseq found that such readings disagree with the fold
(section 9).

### 5.3 Logs written before declared acts

Their `policy-activated` events name `v1` documents, which have no `acts`.
By section 3.1 a `v1` document means the built-in code-review
declarations. Their digest is fixed in code, so verify judges every old
record exactly as the room admitted it. No log is rewritten.

### 5.4 State left by a kind that is no longer declared

- **A hold** taken by a retired kind keeps its lease and ends by lease
  expiry, or by any declared act that can release that thread.
- **A reservation** keeps its deadline and ends by its sealed event.
- **Evidence** keeps counting by the facts recorded at its admission
  (R-REV-1). Activation re-judges carrying, as it does today (R-POL-9).
  Retiring a review kind does not reopen obligations its reviews met;
  only revocation does (R-REV-3).
- **A landing operation** in flight completes forward, as any landing
  does (R-PUB-6).

### 5.5 In `artroom verify`

A kind not declared at its own seq is a verification failure, named
`kind-undeclared`, because the room would never have admitted it. A kind
declared then and retired since is valid. Today verify stops at any kind
outside its fixed list, as `malformed` (`log/verify.ts@df22d771:288-296`).

## 6. The seven acts as the code-review application's declarations

The code-review application declares exactly the seven acts, with the
same names, targets and bodies. Each declaration is shown below, after
what the room enforces today. Together they are the built-in
declarations that a `v1` policy document means (section 3.1).

Two things apply to all seven:
- **Who, today.** R-GEN-5's table (`room/roster.ts@df22d771:29-35`):
  `admin` signs every kind; `maintainer`, `member` and `agent` sign all
  but `check`; `checker` signs `check` and `note`. A delegation covers any
  of the seven (`room/schema.ts@df22d771:31`) within its grantor's role
  (`room/authority.ts@df22d771:120-131`).
- **Policy rules.** `refuse` rules may refuse any of the seven, and
  `notify` rules may notify on any (`policy/rules.ts@df22d771:198, 515`).
  The names are unchanged, so every existing policy, including the pack
  (`policy/pack.ts`) and `examples/demo-repo/.artroom/policy.json`, keeps
  its meaning.

**How "nothing is lost" is shown.** In each table every enforcement site
maps to a step (section 2.1), a declaration field, or a platform rule that
applies to all acts. The executable proof is stage 2 in section 8: the
room's whole existing test suite must pass unchanged with the built-in
declarations as the only source of the vocabulary, and a mutation of each
declaration field must turn a test red.

### 6.1 `claim`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target | `null` (new lane) or a lane | `schema.ts:166-168` | targets `none`, `thread` |
| Body | `goal` ≤ 1,024 bytes (required for a new lane), `scope` 1 to 64 globs, `plan` ≤ 16 KiB, `expectedGeneration` and `lease?` on a lane, `purpose?`, `because?` | `schema.ts:221-239` | `goal`, `plan` declared; `scope`, `expectedGeneration`, `lease` from the steps; `purpose` moves to `recover` under option (a) of section 3.4 |
| Requires, new lane | recovery purpose admin-only and `.artroom/` only; under `exclusive`, no overlap with a held lane; `refuse` rules | `admission.ts:611-623` | `open` |
| Requires, existing lane | lane exists; rescope needs the holder and current lease; take-over needs an unheld lane; `expectedGeneration` matches; overlap; `refuse` rules | `admission.ts:665-687` | `take` |
| Holds | new: holder is signer, lease generation 1; rescope: same generation; take-over: next generation; expiry is now plus the room lease | `admission.ts:624, 688-689` | `hold.scope: "body.scope"`, room lease, workspace |
| Changes | inserts the lane, or updates scope, goal, plan, holder, lease; a take-over invalidates an unreserved landing | `admission.ts:637-646, 700-710` | `open`, `take` |
| Files, checks, reviews | none | | |
| Refusals | `admin-required`, `recovery-scope`, `scope-overlap` ("The scope may overlap {lane}, held by {holder}."), `lane-unknown`, `lease-fenced`, `not-holder`, `lane-held`, `generation-moved` | `admission.ts:614-620, 665-684, 516-522` | platform wording; no override |

```json
"claim": {
  "label": "Claim",
  "targets": { "none": ["open"], "thread": ["take"] },
  "body": {
    "goal": { "type": "text", "max": 1024, "requiredFor": ["none"] },
    "plan": { "type": "text", "max": 16384, "optional": true }
  },
  "who": { "roles": ["admin", "maintainer", "member", "agent"] },
  "hold": { "scope": "body.scope", "workspace": true }
}
```

**Not captured.** The configuration-recovery purpose, which section 3.4
keeps out of the application's hands under either option. Also, R-LANE-2 says a rescope recomputes
obligations when paths change, but the code always records
`obligationsRecomputed: false` (`room/admission.ts@df22d771:691`). The
declaration keeps today's behaviour; the gap is a separate finding.

### 6.2 `propose`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target, body | a lane; `lease`, `expectedGeneration`, `head`, `summary` ≤ 8 KiB, `because?` | `schema.ts:172-176, 240-247` | target `thread`; `summary` declared; the rest from `version` |
| Who | holder with current lease | `admission.ts:734-735` | `version` |
| Requires | `expectedGeneration`; head in the fork (read before admission); diff bounded; `refuse` rules before the claim check; recovery scope; paths inside the claim; valid `.artroom/` configuration | `admission.ts:405-428, 736-771` | `version` |
| Holds | renews the lease | `admission.ts:862` | `version` |
| Changes | admin obligation on `.artroom/**`; `require` obligations; `carry` of earlier verdicts; new generation, pin and preview; unreserved landing invalidated; attention `review-requested` and `check-requested` | `admission.ts:774-834, 846-890` | `version` |
| Files, checks, reviews | the head's files; obligations from `require` rules on the changed paths | `admission.ts:774-786` | `version` and policy |
| Refusals | `lane-unknown`, `not-holder`, `lease-fenced`, `generation-moved`, `head-unknown`, `diff-too-large`, `recovery-scope`, `outside-claim` ("{path} is outside the claim's scope."), `policy-invalid` | `admission.ts:733-771` | platform wording |

```json
"propose": {
  "label": "Propose",
  "targets": { "thread": ["version"] },
  "body": { "summary": { "type": "text", "max": 8192 } },
  "who": { "roles": ["admin", "maintainer", "member", "agent"] }
}
```

**Not captured.** Nothing. Everything `propose` does is the `version`
step. The attention texts ("Review {lane} generation {n} for {obligation}",
`room/admission.ts@df22d771:881-884`) stay platform wording.

### 6.3 `note`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target, body | an entry, or lane, generation, head, path, line and `endLine?`; `text` ≤ 16 KiB, `replyTo?` | `schema.ts:182-198, 249-254` | targets `entry`, `line`; `text` declared; `replyTo` from `comment` |
| Who | any role, including `checker`; admin's own key on a recovery lane | `roster.ts:29-35`; `admission.ts:961-962` | `who.roles` |
| Requires | the entry exists; or the lane and generation exist and the head matches; `refuse` rules | `admission.ts:949-964` | `comment` |
| Holds | renews the lease if the holder signs | `admission.ts:965-972` | `comment` |
| Changes | none; attention `note` to the holder and the replied-to author | `admission.ts:973-977` | `comment` |
| Files, checks, reviews | none | | |
| Refusals | `lane-unknown`, `head-mismatch` | `admission.ts:951-959` | platform wording |

```json
"note": {
  "label": "Note",
  "targets": { "entry": ["comment"], "line": ["comment"] },
  "body": { "text": { "type": "text", "max": 16384 } },
  "who": { "roles": ["admin", "maintainer", "member", "agent", "checker"] }
}
```

**Not captured.** Nothing.

### 6.4 `review`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target, body | a lane and generation; `head`, `verdict` (`approve`, `object`), `scope` ≥ 1 glob, `dependsOn?`, `text` ≤ 16 KiB | `schema.ts:177-180, 255-262` | target `version`; `text` declared; the rest from `review` |
| Who | qualifies for a review obligation on this generation, by the one qualification rule; not the author, except documentation scopes with `allowSelf` and a flagged sole admin on `.artroom/**` | `admission.ts:1003-1035`; `obligations.ts:62-65, 92-125` | `review` |
| Requires | lane and generation exist; head is the generation's head; `refuse` rules | `admission.ts:995-1001, 1037-1038` | `review` |
| Holds | none | | |
| Changes | evidence row; obligations met or reopened, from the same calculator as the projection; attention `objection` to the holder | `admission.ts:1040-1086` | `review` |
| Files, checks, reviews | it is the review | | |
| Refusals | `lane-unknown`, `head-mismatch`, `not-authorized-reviewer`, `self-review` ("The author cannot meet these obligations on their own lane.") | `admission.ts:995-1035` | platform wording |

```json
"review": {
  "label": "Review",
  "targets": { "version": ["review"] },
  "body": { "text": { "type": "text", "max": 16384 } },
  "who": { "roles": ["admin", "maintainer", "member", "agent"] }
}
```

**Not captured.** Nothing. The sole-admin flag and the self-review rule
are platform invariants 4 and 7.

### 6.5 `check`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target, body | a lane and generation; `obligation`, `check`, `integration`, `input` (tree or filtered snapshot), `config`, `runner`, `volatile`, `ok`, `detail` ≤ 16 KiB, `landOp?` | `schema.ts:177-180, 264-286` | target `version`; all from `check` |
| Who | `admin` or `checker` role; qualifies for the named check obligation; never the holder or proposer | `roster.ts:29-35`; `admission.ts:1102-1126` | `who.roles`, `check` |
| Requires | obligation exists and is a check; checker name; integration the room prepared (preview or landing); configuration digest, volatile flag and runner as configured; exact tree, or the room's snapshot and declared inputs; `refuse` rules | `admission.ts:1102-1179`, with the tree read at `430-439` | `check` |
| Holds | none | | |
| Changes | evidence row; obligations met or reopened; asks the landing in flight to evaluate again | `admission.ts:1180-1224` | `check` |
| Files, checks, reviews | it is the check | | |
| Refusals | `lane-unknown`, `obligation-unknown`, `not-authorized-checker`, `check-binding` (thirteen wordings) | `admission.ts:1095-1178` | platform wording |

```json
"check": {
  "label": "Check",
  "targets": { "version": ["check"] },
  "who": { "roles": ["admin", "checker"] }
}
```

**Not captured.** Nothing at admission. One site outside admission names
the kind: the checker service signs `kind: "check"`
(`checkers/checker.ts@df22d771:224-233`). A room may declare its check act
under another name, so the `CheckJob` should carry the kind to sign
(section 8).

### 6.6 `land`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target, body | a lane and generation; `lease`, `head` | `schema.ts:177-180, 287-292` | target `version`; all from `land` |
| Who | holder with current lease; admin's own key on a recovery lane | `admission.ts:1234-1237` | `land` |
| Requires | main exists (read before admission); latest generation and its head; no landing in flight; no blocked or pending recomputation; every review obligation met; `refuse` rules; `land` rules at stage `land` | `admission.ts:441-457, 1238-1258` | `land` |
| Holds | renews the lease | `admission.ts:1266` | `land` |
| Changes | a landing operation, `accepted`, in the same transaction; the room then prepares, reserves and publishes it | `admission.ts:1259-1272` | `land` |
| Files, checks, reviews | lands the head; check obligations are met during preparation (R-LAND-4) | R-LAND-1, R-LAND-4 | `land` |
| Refusals | `lane-unknown`, `not-holder`, `lease-fenced`, `generation-moved`, `head-mismatch`, `land-in-progress`, the recorded recomputation refusal, `obligation-open` ("The obligation {id} is open."), a `land` rule's own | `admission.ts:1233-1258` | platform wording |

```json
"land": {
  "label": "Land",
  "targets": { "version": ["land"] },
  "who": { "roles": ["admin", "maintainer", "member", "agent"] }
}
```

**Not captured.** Nothing.

### 6.7 `release`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target, body | a lane; `lease`, `note?` ≤ 8 KiB | `schema.ts:172-176, 293-298` | target `thread`; all from `release` |
| Who | holder with current lease; admin's own key on a recovery lane | `admission.ts:1282-1285` | `release` |
| Requires | `refuse` rules | `admission.ts:1286-1287` | `release` |
| Holds | ends the hold; lease generation up by one | `admission.ts:1294-1298` | `release` |
| Changes | lane unheld, handover note kept; unreserved landing invalidated; attention `lane-unheld` to every member; workspace token revoked after commit | `admission.ts:1294-1304` | `release` |
| Files, checks, reviews | none | | |
| Refusals | `lane-unknown`, `not-holder`, `lease-fenced` | `admission.ts:1281-1283` | platform wording |

```json
"release": {
  "label": "Release",
  "targets": { "thread": ["release"] },
  "who": { "roles": ["admin", "maintainer", "member", "agent"] }
}
```

**Not captured.** Nothing.

### 6.8 Outside the seven

Workspace requests are judged "as for `propose` on that lane"
(`room/requests.ts@df22d771:107-110`, R-CRED-5). With declared acts they
are judged as for any act whose steps include `version` on that thread.
The policy pack's twelve rules (`policy/pack.ts@df22d771:35-148`) name the
seven by kind and need no change.

## 7. The jam's acts as the second worked example

Source: `notes/2026-10-01-jam-room.md` on branch
`origin/request/jam-room-note` (head `d3291cd0`). The jam note maps the
jam onto the seven acts and keeps a table of "pressure on the
zero-amendment criterion" (its section 7). With declared acts, most of
that pressure goes away: the jam gets acts in its own terms, typed
signals, lease lengths per act and its own refusal wording.

### 7.1 Declarations

The parts are an example. Durations assume 120 bpm, so a bar is 2
seconds.

```json
"acts": {
  "take-part": {
    "label": "Take a part",
    "targets": { "none": ["open"] },
    "body": { "part": { "type": "enum", "values": ["bass", "keys", "drums", "sax"] } },
    "who": { "roles": ["member", "agent"] },
    "hold": { "scope": ["parts/{part}/**"], "conflict": "exclusive", "leaseSeconds": 14400, "workspace": true },
    "refusals": { "scope-overlap": { "reason": "{holder} already plays this part.", "fix": "Choose another part." } }
  },
  "lead": {
    "label": "Lead the song",
    "targets": { "none": ["open"] },
    "who": { "roles": ["member", "agent"] },
    "hold": { "scope": ["song.json"], "conflict": "exclusive", "leaseSeconds": 14400, "workspace": true }
  },
  "leave": {
    "label": "Leave",
    "targets": { "thread": ["release"] },
    "who": { "roles": ["member", "agent"] }
  },
  "take-solo": {
    "label": "Take the solo",
    "targets": { "none": ["open"], "thread": ["take"] },
    "who": { "roles": ["member", "agent"] },
    "hold": { "scope": ["solo/**"], "conflict": "exclusive", "leaseSeconds": 64, "reserveSeconds": 8 },
    "refusals": {
      "lane-held": { "reason": "{holder} has the solo.", "fix": "Signal to take the next one." },
      "scope-overlap": { "reason": "{holder} has the solo.", "fix": "Signal to take the next one." },
      "reserved": { "reason": "The solo was passed to {reservedFor}.", "fix": "Wait until {until}, or signal." }
    }
  },
  "pass-solo": {
    "label": "Pass the solo",
    "targets": { "thread": ["hand-over"] },
    "who": { "roles": ["member", "agent"] },
    "refusals": { "not-holder": { "reason": "Only the soloist can pass the solo.", "fix": "Signal instead." } }
  },
  "signal": {
    "label": "Signal",
    "targets": { "none": ["comment"], "entry": ["comment"] },
    "body": {
      "signal": { "type": "enum", "values": ["count-in", "head", "ending", "one-more", "next"] },
      "to": { "type": "member", "optional": true }
    },
    "who": { "roles": ["member", "agent"] }
  },
  "add-pattern": {
    "label": "Add a pattern",
    "targets": { "thread": ["version", "land"] },
    "body": { "summary": { "type": "text", "max": 1024 } },
    "who": { "roles": ["member", "agent"] },
    "refusals": { "outside-claim": { "reason": "{path} is outside your part.", "fix": "Change only your part's files." } }
  },
  "change-key": {
    "label": "Change key",
    "targets": { "thread": ["version", "land"] },
    "body": { "key": { "type": "enum", "values": ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] } },
    "who": { "roles": ["member", "agent"] },
    "refusals": { "not-holder": { "reason": "Only the leader changes the key.", "fix": "Signal the leader." } }
  },
  "propose-rules": {
    "label": "Propose house rules",
    "targets": { "none": ["open"], "thread": ["version"] },
    "body": { "summary": { "type": "text", "max": 4096, "requiredFor": ["thread"] } },
    "who": { "roles": ["admin", "member", "agent"] },
    "hold": { "scope": [".artroom/**"], "conflict": "exclusive" }
  },
  "approve-rules": {
    "label": "Approve house rules",
    "targets": { "version": ["review"] },
    "body": { "text": { "type": "text", "max": 1024 } },
    "who": { "roles": ["admin"] }
  },
  "adopt-rules": {
    "label": "Adopt house rules",
    "targets": { "version": ["land"] },
    "who": { "roles": ["admin", "member", "agent"] }
  }
}
```

"Only the leader" is one `refuse` rule in the same document, on the
actor's teams (an admin passes it):

```json
{
  "id": "leader-only", "kind": "refuse",
  "on": ["lead", "change-key", "propose-rules", "adopt-rules"],
  "refuse": "$not(\"@leader\" in actor.teams) and actor.role != \"admin\"",
  "reason": "Only the leader may do this.", "fix": "Signal the leader."
}
```

### 7.2 How each jam act works

| Jam act | Steps | What the room enforces | Today, without declared acts (jam note section 1) |
|---|---|---|---|
| Take a part | `open` | One holder per part, exclusive, for the session; the part's workspace for pattern and take files | `claim` on `parts/bass/**`; exclusivity only room-wide (`lanes`) |
| Take the solo | `open` the first time, then `take` | One soloist at a time: refused while the solo is held or reserved for someone else, and a second solo thread cannot be opened while one is held or reserved; a 64-second lease catches a player who drops out | `claim` on `solo/**`; refusal is `scope-overlap` with platform wording |
| Pass the solo | `hand-over` | Ends the hold and reserves the solo for `to` for 8 seconds (4 bars); anyone else's `take-solo` is refused `reserved`; `to` must be an active member | `release` with a handover note naming the next player; nothing enforced |
| Signal | `comment` | Typed: one of five signals, and an optional member; `count-in` with no anchor fixes bar 1 | `note` with a text convention |
| Add a pattern | `version`, `land` | Holder of the part only; changed paths inside the part; the `in-key` check (a `require` rule on `parts/**`) is met during preparation, before the landing publishes (R-LAND-4) | `propose` then `land`: two acts |
| Change key | `version`, `land` on the leader's `song.json` thread | Only the leader; only `song.json` changes; a `notify` rule on `change-key` reaches every player; every open pattern's `in-key` check stops carrying, because `song.json` is a global input (R-CARRY-3) | `propose` and `land` of `song.json` |
| Change the house rules | `propose-rules`, `approve-rules`, `adopt-rules` | Invariant 7: an admin must approve any change to `.artroom/**`, so this cannot be one act. A sole admin may approve their own, flagged (R-ADMIN-2). It activates at the next seq (R-POL-9) | `claim`, `propose`, `review`, `land` |

**Two notes on `version` then `land` in one act.** The landing part follows
R-LAND-1: if the new version owes a review, the whole act is refused with
`obligation-open`, and nothing is recorded but the refusal. So the pair is
only useful where `require` rules ask for checks alone, as for patterns.
The `in-key` check is met during preparation, so the act returns before
the check runs, and the landing then waits for it as any landing does.

**The room does not compare `key` with `song.json`.** The room evaluates
no file content. The body's `key` is what the UI and attention show; the
file is the truth. A check on `song.json` can confirm that they agree.

### 7.3 New primitives the jam needs

| Need | Proposed | Where it lands |
|---|---|---|
| Lease length per act | `hold.leaseSeconds`, stored on the thread at `open` | Room: a `lease_ms` column on lanes |
| Exclusivity per act | `hold.conflict` | Room: overlap check reads the thread's mode |
| Scopes from a body field | `{field}` slots, from `segment` or `enum` fields only | Room and validator |
| Reserved handover | the `hand-over` step; refusal `reserved`; a `reservation-ended` system event sealed by the alarm, as `lease-expired` is; a reserved thread counts as held in overlap checks | Contract, room, log, verify |
| One-act change | `version` then `land` | Room admission |
| A signal with no anchor | target `none` for `comment`; today a note is always anchored (`contract/acts.ts@df22d771:78-87`) | Contract and room |

**Unchanged by this note:** how the room reaches an application's checker
(jam note section 9, "the first finding"). Declared acts do not touch
check dispatch, so that finding stays open as its own request.

**Self-hostable.** By assert `4e4134b4`, Artroom is self-hostable when
hugh judges that, with declared acts, it is a viable platform for building
the jam. Section 8's last stage builds these declarations as a fixture
inside Artroom, so that hugh can judge on evidence. Until then, jam spikes
may start in `~/play/artroom-jam`, and none is approved (assert
`fdb08e72` stands).

## 8. Impact and staging

### 8.1 What changes, by package

The inventory found the vocabulary hard-coded in about 140 places outside
`acts.ts`. Most belong to the code-review application and stay as its
code. The fixed kind list itself is written out five times:
`room/schema.ts@df22d771:30`, `room/roster.ts@df22d771:29-35`,
`policy/validate.ts@df22d771:16`, `log/decode.ts@df22d771:96` and
`log/roster.ts@df22d771:42-43`. Those five become one: the active
declarations.

| Package | Change |
|---|---|
| `packages/contract` | `ActDeclaration` and its parts; `PolicyDocument` format `v2` with `acts`; `EnvelopeKind` becomes a declared kind string or `renew`, `roster`, `recover`; `RecordByKind` keeps the seven typed records as the code-review module, plus a generic record for any declared kind; refusal codes `kind-undeclared` and `reserved`; system event `reservation-ended`; `CheckJob` carries the kind to sign; `DelegableKind` becomes a declared kind string |
| `docs/protocol.md` | A new section, R-DECL, for this design. Amends R-GEN-5 (platform floor), R-ADM-1 step 5 and R-ADM-8 (`kind-undeclared`), R-ADM-5, R-SIG-4 (kind grammar), R-POL-1, R-POL-7, R-POL-10 and R-POL-12, R-LANE-5 (lease per thread), R-LOG-5 and R-LOG-10, R-API-9, R-ADMIN-5 (`recover`), and, if hugh agrees, R-GEN-1, R-GEN-10 and R-EVAL-4 (section 3.6) |
| Room (`packages/room`) | `schema.ts` body and target checks driven by the active declarations; `authority.ts` and `roster.ts` roles from `who`; `admission.ts` `decide` dispatches by step, not by kind; refusal wording applied; `hand-over`, reservation and per-thread lease and conflict; a Room migration adding `lease_ms`, `conflict`, `reserved_for` and `reserved_until` to lanes. It takes the next free number: 4 if mint lane C lands first with migration 3 |
| Policy runtime (`packages/policy`) | Validation of `acts` (section 3.3); the code-review declarations as built-in data; `refuse` and `notify` rules accept declared kinds. The evaluator and profile do not change |
| Log and verify (`packages/log`) | Decoding accepts any kind that fits the grammar; verify judges kind, body and `who` under `D(s)`; the `v1` rule (section 5.3); later, the thread-state fold (section 4) |
| Client (`packages/client`) | A generic `room.act(kind, target, body)` beside the existing `PreparedAct` path (`client/room.ts@df22d771:218-245`); a read of the active declarations; the eight per-kind methods stay as the code-review module |
| MCP (`packages/mcp`) | Two new tools: `act`, for any declared act, and `acts`, which lists the declarations. The ten named tools stay (R-API-9). MCP is turn-based, so the jam's players use the client, not MCP (jam note section 5) |
| UI (`packages/ui`) | The feed and refusal text are generic from `label`, fields and refusal wording; a record of an unknown or retired kind shows its declaration at its seq (section 5.2). The Room, Proposal and Needs-you screens stay as the code-review application's |
| CLI and checkers | `artroom act <kind>`; the checker signs the kind named in the job |

### 8.2 Lanes in flight

Lanes under review finish as reviewed (assert `4e4134b4`). None of them
touches `acts.ts`, `docs/protocol.md` or `packages/policy`.

| Lane | State at `df22d771` | What it means for declared acts | What declared acts mean for it |
|---|---|---|---|
| Mint lane C, request `5ff58c9a` (`request/mint-sites`) | Recut on this main; under re-review; adds Room migration 3 (due indexes) | No act-kind code. Declared acts take the next migration number. Both touch `room/core.ts`, in different regions (lane C: loop kinds, mints, `nextAlarm`) | None. It finishes as reviewed |
| Row-writes, request `8bd623cc` (`request/row-writes`) | Under review; touches `propose()` in `admission.ts` for the `PIN_DELAY_MS` switch | Its rows-per-act measurements are the baseline: the declared path must add no rows per act. Its smoke driver sends literal act bodies, which stay valid because the code-review bodies do not change | Stage 2 merges after it and keeps its switch inside the `version` step |
| Fork-token mint lane F, request `02836f9a` | Not started; no branch | Independent: it changes how `pinObjects` mints its fork token | It does not wait for declared acts. If both compete for a slot, declared acts go first (assert `4e4134b4`) |
| Orphan retirement (`request/orphans`) | Notes only; under review | None | None |
| Jam room note, request `f4a626c8` (`request/jam-room-note`) | Not yet reviewed; cut from a main about 400 commits old | It is this note's second example | Its premise, "the same seven acts", and its zero-amendment criterion are superseded. **Recommendation:** revise it against this note before review: the jam's acts are declarations, and the criterion becomes "no platform code in the jam". Its timing model, live layer, sample library and spikes stand |
| Acts review, request `9ea217bc` (`request/acts-review`; status not checked here) | A note | Its section 6 (two coupled state machines, workflow nets) supports the soundness lint in section 3.3 | Its "freeze the seven act kinds" (its section 4) is superseded. Its amendment 5 for work tracking (D1) can become a declared vocabulary instead of a contract amendment |

### 8.3 Gate 1 (2026-10-05)

Gate 1 is the deployed vertical slice of the code-review loop (plan
section 13): claim, workspace and push, propose with pinning, review and
one check from a real runner, a safe land, the attention queue, and
`artroom verify` on a fresh clone, run by two agents. The spike deployment
already ran that loop live over HTTPS and MCP on 2026-10-02
([deploy-spike.md](deploy-spike.md), "Review and check, live"). Whether the rest of
gate 1 is met is not judged here.

Declared acts change the room's admission path, the contract, the log
format's reading and verify. Building, reviewing and deploying that in
three days would put the slice at risk. And it is not needed for the
slice: the code-review declarations are designed to behave exactly as
today, and the `v1` rule (section 5.3) keeps a log recorded at gate 1
valid after declared acts land.

**Recommendation for hugh to decide:** keep gate 1 on 2026-10-05 as the
code-review slice, run on the current fixed-act code, and do not make
declared acts a gate-1 condition. From the approval of this note, the
declared-acts stages below take the first free implementation slots,
ahead of every item in plan section 13's staging list, with lanes now
under review finishing first.

### 8.4 Staged implementation requests

At most two implementation lanes run at once until the slice passes
(plan section 13). Each stage is one request, with its own review.

| # | Request | Depends on | Done when |
|---|---|---|---|
| 1 | **Protocol amendment and contract types.** R-DECL in `docs/protocol.md` and the amended rules (8.1); contract types; the code-review declarations as built-in data; the `acts` validator. No change in behaviour. Includes hugh's decisions on sections 3.4 and 3.6 | this note | the declarations validate; every existing test passes; checker approves the amendment |
| 2 | **Room admission by declaration, code-review only.** The five kind lists become one; `decide` dispatches by step; refusal wording; `kind-undeclared` | 1 | the room's whole existing suite passes unchanged; a mutation of each declaration field turns a test red; row-writes' measure shows no new rows per act |
| 3 | **Log and verify.** Decoding by grammar; kind, body and `who` judged under `D(s)`; the `v1` rule | 1 | verify passes on a log that activates a document adding a kind, and fails `kind-undeclared` on a forged entry; an old log verifies unchanged |
| 4 | **New primitives.** Per-thread lease and conflict, scope slots, `hand-over` with `reservation-ended`, `version` then `land`; the Room migration | 2 | acceptance cases for each, including a reservation that ends while a `take` is in flight |
| 5 | **Client, MCP, CLI, UI.** Generic act and declarations read; generic rendering | 2 | an agent performs a declared act it was not built for, over HTTPS and MCP |
| 6 | **Verify's thread-state fold** (section 4, item 4) | 3, 4 | a fresh clone shows every step guard held, for every act in a test log |
| 7 | **The jam's declarations as a fixture,** in `examples/`, with section 7's acceptance cases and no jam code | 4, 5 | hugh can judge self-hostability on it (assert `4e4134b4`) |

Stages 2 and 3 can run in parallel, then stages 4 and 5.

## 9. Prior art

Both sources were read, not changed. gitseq at `02090dc2d`
(`/Users/hughpyle/play/gitseq`), dap at `9d738e2e`
(`/Users/hughpyle/play/dap`).

### gitseq's declared kinds

- **What a declaration holds.** "Each declared kind states its required
  fields, its basis constraints, who may ratify it, how it renders, how
  staleness travels through it, and whether it takes part in the
  commitment lifecycle" (`docs/concepts/record.md:55-59`). Its guidance
  field is "never consulted by the fold"
  (`notes/2026-08-07-declared-kinds.md:52-61`). This note's `help` follows
  that rule; its refusal wording goes further, but only as text, never as
  a decision.
- **A closed algebra, not code.** "A finite constraint algebra with total
  semantics — enumerated operators … never embedded code"
  (`notes/2026-08-07-declared-kinds.md:72-74`). And: "Code that changes the
  fold is authorized by the host binding. Data that extends the vocabulary
  is validated by the existing fold"
  (`notes/2026-08-18-schema-fold-split.md:73-75`); a definition that could
  name code was "a privilege-escalation-shaped seam" (lines 79-82). Hence
  section 1's fixed steps.
- **Position-aware, never retroactive.** "An act is checked against the
  definition in force at its own position … verdicts remain fixed at
  append. No retroactive semantics, ever"
  (`notes/2026-08-07-declared-kinds.md:64-70`). This is section 5.2.
- **Reserved kinds.** `kind-def`, `fold-activation` and `roster` "may not
  be redefined. Redefining `roster` would let a participant name
  themselves as the satisfier of their own authority grant"
  (`notes/2026-08-07-declared-kinds.md:358-362`). This is invariants 2
  and 3.
- **Undeclared kinds.** Old records read as `undefined-kind`, "a gap to
  surface, not a meaning to improvise" (`docs/concepts/record.md:60-62`).
  New ones are now refused before signing, because silent acceptance left
  "authors … believing commitments had been made that no rule could see"
  (`internal/app/admission.go:161-168`). This is section 5.1.
- **No fallback on retirement.** Today a retired definition falls back to
  its starter entry, which the design calls a current detail to remove
  (`notes/2026-08-08-first-ontology.md:147-150`). Section 3.5 has no
  fallback.
- **Readers.** Classifying an old record by the current vocabulary
  disagrees with the fold (`docs/reference/architecture.md:983-990`). This
  is section 5.2's rule for readers.
- **The cost.** "A definition interpreter is more machinery than ten
  hardcoded kinds … ontology editing becomes a new authority surface"
  (`notes/2026-08-07-declared-kinds.md:413-426`). Section 2.2 answers the
  authority surface with invariant 7. The machinery is the price of the
  assert.

### dap's goals for extensibility

- **Evolvability is the first goal.** "A context can attach a package
  mid-stream and every prior outcome replays unchanged"
  (`notes/2026-09-14-evolving-spaces-design.md:86-89`). This is the test
  for sections 4 and 5.
- **Exact boundaries, no backfill.** An attach at `n` "is judged under the
  preceding environment … if effective it activates from `n+1` … There is
  no backfill" (`notes/2026-09-14-evolving-spaces-design.md:587-593`).
  "Old events never change meaning … Semantic upgrades activate at an
  exact ordered boundary" (lines 608-618). Artroom's activation at the seq
  after the landing is the same rule (R-POL-9).
- **A reserved system namespace.** Only the foundation lineage defines
  names under `ai.generalbusiness.dap.`, and the fold refuses an
  application that tries (`notes/2026-09-14-evolving-spaces-design.md:280-283`).
  This is section 3.3's reserved names.
- **What a package holds.** Kinds, models with "accepted kinds, folds …
  invariants, affordances", capabilities and roles, and presentation
  (`notes/2026-09-14-evolving-spaces-design.md:460-465`). An act
  declaration here is the kinds, roles and presentation parts. Models with
  their own state are not adopted (section 1).
- **Exclusive rights.** "A shared exclusive right … needs one owner,
  non-overlapping allocations, or an explicit joint protocol"
  (`notes/2026-09-14-evolving-spaces-design.md:178-184`). Holds are
  Artroom's one owner, with leases.
- **Declarations in an act's own terms.** dap's authoring sketch names
  who may act, the state required, the refusal reasons and the change in
  one declaration
  (`notes/2026-09-18-authoring-language-directions.md:437-446`). Section
  1 has the same four parts, with steps in place of free effects.
- **Unknown versus unavailable.** "An unhandled kind is a verdict; an
  unavailable definition is a pause," and a stale expected binding is
  ineffective
  (`notes/2026-09-14-evolving-spaces-design.md:484-496`). Artroom's
  declarations are retained in the log, so they are never unavailable to
  a verifier. Section 3.5 chooses not to carry an expected binding.
- **Cautions.** Writing models cheaply was the spike's "negative result"
  (`spike/REPORT.md:34`). This is why declarations here are limited to
  choosing steps, and why section 8 tests them with the jam before
  hugh's judgement.
