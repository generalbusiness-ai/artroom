# Declared acts

2026-10-02. Revision 3. Gitseq request `a2cbd459` (planner to builder),
following hugh's assert `4e4134b4` as corrected by assert `b2cdc44a`.
Branch `request/declared-acts`, cut from main `df22d771`.

**What this note is for.** Assert `4e4134b4` says that a room's acts are
declared by its application, not fixed by the platform. It supersedes the
fixed seven-act design: plan section 4, `ActKind` in
`packages/contract/src/acts.ts`, and everything that assumes those seven
are the only acts. Assert `b2cdc44a` corrects one point: builder, not
hugh, judges whether Artroom is self-hostable. This note designs the
change. It says what a declaration contains, what the room enforces
whatever the declaration says, where declarations live and how they take
effect, how replay stays deterministic, what happens to undeclared kinds,
how the seven acts become the code-review application's declarations,
what the jam's declarations look like, and what the change costs and in
what order to build it.

**What it adopts.** Nothing beyond assert `4e4134b4` as corrected by
`b2cdc44a`. Every other statement is a proposal for review. Points that
need hugh's decision are marked **Decision for hugh**. The note
commissions no build: each stage in section 8 becomes its own request only
after this note is approved.

**Revision 2** answers checker review `197f8511`:

| Finding | Where it is answered |
|---|---|
| P1: bind a signed act to its meaning across activation | Section 3.6 (new), with delegations, checker jobs and acceptance cases; section 9 |
| P2: thread and scope restrictions in the jam | Section 1 (`threads`), section 2.1 (`take` on fixed scopes, overlap rule), section 7 (rules and tests) |
| P2: an exact legacy vocabulary for `v1` replay | Section 3.2 (new), sections 3.5, 5.3 and 6 |
| P2: close the replay proof | Section 4, rewritten: a guard-by-guard witness table, derived transitions, named failures, proof limits, bounds and adversarial fixtures |
| P2: builder judges self-hostability (assert `b2cdc44a`) | Opening, section 7.4, section 8.5 stage 7, section 9 |
| Supersession inventory | Section 8.2 (new): every plan section, protocol rule and contract type that assumes the seven acts, with a disposition |
| The role floor in the jam examples | Section 2.2 (`admin` is implicit), sections 6 and 7 |
| A check cannot compare the act's `key` with `song.json` | Section 7.1: the field is removed, and why |

**Revision 3** answers checker review `07915199`. It decides four shared
rules once, in a new section 2.3, and both worked examples use them:

| Finding | Where it is answered |
|---|---|
| P1: bind the grantor's signed grant | Section 2.3.2: delegations and room-custody invitations carry a signed map from kind to binding, checked at the grant's admission and at each use; no wildcard for declared kinds; `v1`-era grants never upgraded; cases for delayed explicit and expanded-wildcard grants, exact retries and legacy grants |
| P2: an ordered, retained identity for step semantics | Sections 2.3.4 and 3.9: the document pins `steps`; only activation changes it; every version is kept; cases for a log across two versions, old retries, and a deploy with no activation |
| P2: derive the required evaluation calls | Section 4.4 (new): the calls each entry must have made, contexts rebuilt from the fold and compared, `decision-missing`, `decision-extra`, `context-mismatch`; section 4.3: a published `prepared` event, because a check's own report cannot show that the room prepared its integration; section 4.7: the forged-log fixtures |
| P2: scope changes on code-review take-over | Section 2.3.1: scope source versus current scope; section 2.1's `take`; section 6.1's cases; section 6's suite criterion now names the recovery rewrite |
| P2: the jam's check path and how jobs choose an act | Section 2.3.3: each checker configuration names its act; section 7.1: `in-key-check`, its rule and its configuration; section 7.4: the end-to-end and mapping-failure cases |
| P2: retirement and thread references | Section 2.3.1: historical opening kinds stay valid in `threads`; name reuse by name, on purpose; section 5.4 |

**Citations.** Code is cited at main `df22d771` as `path@df22d771:line`.
To keep lines short, paths under `packages/` drop that prefix and the
`src/` directory: `room/admission.ts` means
`packages/room/src/admission.ts`. Rules are cited by ID from
[docs/protocol.md](../docs/protocol.md). "The plan" is
[2026-10-01-artroom-plan.md](2026-10-01-artroom-plan.md).

## 1. What an act declaration contains

A declaration is data. It names the act, the shape of what a signer sends,
who may sign it, which threads it may act on, and which of the room's
primitives (section 2) the act runs. It contains no code and no pointer to
code. gitseq found that a declaration able to name code is a
privilege-escalation seam (section 9).

The proposed shape, in the contract's TypeScript style:

```ts
/** One declared act. The key in `PolicyDocument.acts` is its kind. */
interface ActDeclaration {
  /** Shown to people and agents. */
  readonly label: string;
  /** For each target shape the act accepts, the primitive steps it runs. */
  readonly targets: { readonly [T in TargetShape]?: readonly Step[] };
  /**
   * For targets `thread`, `version` and `line`: the kinds whose threads this
   * act may act on. A thread's kind is the kind of the act that opened it,
   * or `room` for a thread the room opened (R-REV-6).
   */
  readonly threads?: readonly string[];
  /** The application's own body fields, beyond those the steps require. */
  readonly body?: Readonly<Record<string, Field>>;
  readonly who: {
    /** Roles that may sign it besides `admin`, which always may (section 2.2). */
    readonly roles: readonly Role[];
    /** Whether a delegation may cover it (R-ADM-5). Default true. */
    readonly delegable?: boolean;
  };
  /** For an act with step `open`: the hold on the thread it opens. */
  readonly hold?: {
    /** The scope: the body's `scope` field, or fixed globs with `{field}` slots. */
    readonly scope: "body.scope" | readonly Glob[];
    /** Absent: the policy's `lanes` setting (R-POL-8). */
    readonly conflict?: "exclusive" | "by-scope";
    /** Absent: the room's lease. Bounded by the platform (section 2.2). */
    readonly leaseSeconds?: number;
    /** For `hand-over` on this thread: how long it stays reserved for the named member. */
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
| What it requires of the room's state | The thread it may act on (`threads`), the guards each step brings (section 2), and policy `refuse` rules whose `on` names the act (R-POL-2) |
| What it holds exclusively, and for how long | `hold`, on the act that opens a thread: scope, conflict mode, lease length, reservation length |
| What it changes in the room's state | Its steps. There is no other way to change state |
| Whether it lands files, and which checks and reviews apply | Steps `version` and `land`. Obligations come from `require` rules on the changed paths (R-POL-3), as today; acts with step `review` or `check` are the evidence that meets them |
| How refusals are worded in the act's own terms | `refusals`: a reason and a fix per refusal code |

**A thread belongs to the kind that opened it.** The room records that
kind on the thread, with its opening act's hold settings, which never
change. An act on a thread of a kind its `threads` does not name is
refused with `wrong-thread`. The full rule, including how a thread's
current scope differs from its fixed scope source, is in section 2.3.1.
This is enforcement, not wording: in the jam it stops a `take-solo` on a
released part thread, and a `change-key` on a part (section 7).

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
provider text into a refusal. This follows the closed safe-text grammar
that request `d29c09fa` (main `df22d771`) applies to stored error fields.
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
| `open` | A new thread (today: lane), held by the signer at lease generation 1, over a scope; conservative overlap, refused when it may overlap a held or reserved thread and either side is `exclusive` | `scope` when the declaration says `body.scope` | `room/admission.ts@df22d771:608-660` |
| `take` | On a held thread, the holder rescopes it at the same lease generation; on an unheld one, any qualified signer takes it over at the next lease generation, unless it is reserved for someone else (`reserved`); `expectedGeneration` must match. On a body-scoped thread both carry a new current scope, with overlap checked; on a thread with a fixed scope only a takeover is allowed, with no `scope`, and a rescope is refused `scope-fixed` (section 2.3.1) | `scope` (body-scoped threads only), `expectedGeneration`, `lease` (rescope only) | `room/admission.ts@df22d771:662-726` |
| `version` | Holder only, current lease; head reachable in the fork; diff bounded; changed paths inside the scope; `.artroom/**` validated and given an admin obligation; `require` and `carry` rules; new generation, pin, preview, attention to reviewers and checkers; an unreserved landing is invalidated | `lease`, `expectedGeneration`, `head` | `room/admission.ts@df22d771:399-428, 730-893` |
| `review` | Head equals the version's head; the signer qualifies for a review obligation and is not the author (with the two flagged exceptions); verdict recorded as evidence | `head`, `verdict`, `scope`, `dependsOn?` | `room/admission.ts@df22d771:992-1088`, `room/obligations.ts@df22d771:92-125` |
| `check` | Bound to an open check obligation, the named checker, an integration the room prepared, the active configuration digest, its volatile flag and runner, and the exact tree or snapshot; never by the author | the nine `CheckBody` fields | `room/admission.ts@df22d771:1092-1228` |
| `land` | Holder only; latest generation and its head; no landing in flight; no blocked or pending recomputation; every review obligation met; `land` rules; starts a landing operation in the same transaction | `lease`, `head` | `room/admission.ts@df22d771:1230-1276`, R-LAND-1 |
| `release` | Holder only; thread unheld, lease generation up by one, optional handover note kept, workspace token revoked, members told | `lease`, `note?` | `room/admission.ts@df22d771:1278-1306` |
| `comment` | Anchored to an entry or to a line of a version's head, or (new) to nothing; renews the holder's lease if the holder signs; attention to the holder and the replied-to author | `replyTo?` | `room/admission.ts@df22d771:946-990` |
| `hand-over` | **New.** As `release`, and the thread is reserved for one named active member until the thread's reservation length has passed. Only that member may `take` it until the room seals `reservation-ended`. A reserved thread counts as held in overlap checks, so nobody can open a second thread to get round the reservation | `lease`, `to` | none yet (section 7) |

Shared guards that every step uses: the thread exists (`lane-unknown`),
the thread's kind is one the act names (`wrong-thread`, new), the holder
and lease check (`room/admission.ts@df22d771:516-524`), the
configuration-recovery check (`room/admission.ts@df22d771:526-533`), and
policy `refuse` rules (`room/admission.ts@df22d771:535-556`). Any accepted
act from the holder renews the lease (R-ADM-11,
`room/admission.ts@df22d771:578-585`).

**Overlap between hold modes.** Today one room-wide setting decides
whether overlapping claims are refused (R-POL-8,
`room/admission.ts@df22d771:617-621, 682-685`). With a mode per thread,
an `open` or `take` is refused with `scope-overlap` when it may overlap a
held or reserved thread and either thread is `exclusive`. So an
exclusive hold cannot be overlapped by a `by-scope` act, and an exclusive
act cannot overlap a `by-scope` hold.

Three kinds stay platform kinds, not declared: `renew`, which only renews
a hold (`room/admission.ts@df22d771:1308-1337`), `roster`
(`room/admission.ts@df22d771:1350-1510`), and, if hugh chooses option (a)
in section 3.5, `recover`.

**What moves into declarations:** act names, labels, the application's
body fields and their limits, which roles may sign, which threads an act
may act on, which steps it runs on which target, the hold's scope source,
conflict mode, lease and reservation lengths, refusal wording, and help
text. The roles table (`room/roster.ts@df22d771:29-35`) and the per-kind
body and target checks (`room/schema.ts@df22d771:163-305`) become derived
from the active declarations.

**What stays platform code:** the meaning of every step, the guards it
brings, and everything in section 2.2. The meaning of the steps has its
own version identity, `artroom-steps-v1` (section 3.6).

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
`policy-invalid` (section 3.4).

| # | Invariant | Where enforced today | Why a declaration cannot change it |
|---|---|---|---|
| 1 | Identity comes only from the verified signature; canonical bytes; idempotency per key (R-SIG, R-ADM-2, R-IDEM) | `room/admission.ts@df22d771:203-228, 289-299` | Without it no act can be attributed or replayed |
| 2 | Authority is judged at admission, by one of four cases; a delegation never covers `roster` and never exceeds its grantor; the recovery key signs only roster ops (R-ADM-3 to R-ADM-5, R-GEN-3) | `room/authority.ts@df22d771:54-137` | A declaration is data authored under the roster's authority. If data could grant authority, a member could approve their own escalation. gitseq refuses to let `roster` be redefined for this reason (section 9) |
| 3 | `renew`, `roster` and `recover` are platform kinds; their names, `room`, and the system event names are reserved | `room/authority.ts@df22d771:74-79, 91-94, 119`; `room/admission.ts@df22d771:1308-1510` | The room reads them directly to decide authority and recovery |
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
| 15 | A signed act is admitted only under the meaning it was signed for (section 3.6) | none yet | Otherwise a declaration change could make an old signature start an action its signer never agreed to |

**The platform floor on roles.** R-GEN-5 says roles decide which kinds a
member may sign, and R-POL-10 says policy cannot change that. With
declared acts, `who.roles` replaces the R-GEN-5 table for declared kinds,
under two fixed limits:
- **`admin` is implicit.** An admin may sign every declared act.
  Declarations do not list `admin`; validation refuses it as redundant, so
  every declaration reads the same way. An empty `roles` means admins only.
- **`checker` is narrow.** A checker may sign only acts whose steps are
  `check` or `comment`.

This grants no new power. A declaration lives in `.artroom/**`, so
changing who may sign an act needs an admin's approval (invariant 7), and
admins can already change any member's role with a roster act.

**Bounds proposed for holds:** a lease of 10 seconds to 24 hours, and a
reservation of 1 second to 10 minutes. These are proposals, to be fixed in
the protocol amendment.

### 2.3 Rules every application shares

Four rules are decided once here. The code-review declarations (section
6) and the jam's (section 7) both use them.

#### 2.3.1 Threads: kind, settings and scope

- **Kind.** A thread's kind is the kind of the act that opened it, or
  `room` for a thread the room opened (R-REV-6). The room records it with
  the binding of that opening act (section 3.6), so readers can tell two
  meanings of one name apart.
- **Settings.** From the opening declaration's `hold`: the scope source,
  conflict mode, lease length, reservation length and workspace. They are
  fixed for the thread's life. A later document never changes them.
- **Scope source and current scope.** These are different things. The
  scope source is fixed: either `body.scope` or a template. The current
  scope is what overlap checks and changed paths are judged against.
  - With a template, the current scope is the template filled in at
    `open`, and never changes. A `take` on such a thread has no `scope`
    field (`invalid-body` if it has one) and may only take an unheld
    thread over; a `take` that carries `lease`, which would be a rescope,
    is refused with `scope-fixed`. The jam's parts and solo work this way.
  - With `body.scope`, the current scope is set at `open` and replaced by
    every `take`. A rescope by the holder (with `lease`, same lease
    generation) and a takeover of an unheld thread (without `lease`, next
    lease generation) both carry `scope`; both check `expectedGeneration`
    and the overlap of the new scope. This is today's reclaim
    (`room/admission.ts@df22d771:662-710`), and today's takeover tests
    already send a scope (`packages/room/test/workerd/lanes.test.ts@df22d771:49-65`).
    Code-review's `claim` works this way.
- **Which acts may act on a thread.** An act on a thread, or on one of its
  versions or lines, is refused with `wrong-thread` unless the thread's
  kind is in the act's `threads`. Names match by name.
- **Names a document may use in `threads`:** `room`; a kind declared in
  the same document with step `open`; or a **historical opening kind**,
  one that opened at least one thread in this room before the document is
  validated. The room knows these from its thread table; verify
  re-derives them from the log. Any other name is refused with
  `policy-invalid`, which catches a misspelt kind. A retired kind cannot
  open new threads (`kind-undeclared`), but the threads it opened stay
  reachable by any declared act that names it.
- **Reusing a name is allowed, deliberately.** If a later document
  declares a retired name again with a different `hold`, its new threads
  get the new settings and the old threads keep theirs. An act that lists
  the name acts on both. An application that must tell them apart uses a
  new name.

Acceptance cases, in stage 2: a released `claim` taken over with a
different scope is admitted, its current scope changes and the lease
generation rises by one; a takeover whose new scope overlaps an
exclusive held thread is refused `scope-overlap`; an opening kind retired
while one of its threads is held with an open version can still be
released and reviewed by declared acts that name it, and a new act of the
retired kind is refused `kind-undeclared`; a document whose `threads`
names a kind that never opened a thread here is refused `policy-invalid`.

#### 2.3.2 Grants carry the bindings their grantor signed

A grant lets another key act for a member. It must cover the meanings the
grantor signed, not the meanings in force when the room happens to admit
it.
- **A `delegate` op** in a room with a `v2` document names its declared
  kinds as a signed map from kind to binding. Today's body has a list of
  kinds or `*` (`contract/roster.ts@df22d771:103-109`). The grantor's
  client expands any wildcard before signing, so the signed map is the
  catalogue boundary; `*` is not accepted for declared kinds. `renew`, a
  platform kind, is still named plainly.
- **At the grant's admission**, each pair must equal the active
  declaration's binding. If any differs, the op is refused with
  `binding-stale` and not recorded, and the grantor signs again. A kind
  declared after the grant was signed is not covered.
- **At each use**, an act under the delegation must carry the binding the
  grant names for its kind. Otherwise it is refused with
  `delegation-invalid`: "The delegation was granted for an earlier meaning
  of {kind}."
- **Invitations.** A room-custody invitation's `session.kinds` uses the
  same signed map, checked when the `invite` is admitted as a grant is.
  The room creates the session's delegation from it at
  redemption (R-CRED-3, `room/requests.ts@df22d771:239-299`), and only if
  every binding still equals the active one. Otherwise the redemption is
  refused, unrecorded, with `binding-stale`; the invitation stays unused,
  and an admin invites again. Today an invitation with no `session`
  becomes a `*` delegation (`room/requests.ts@df22d771:258`); in a `v2`
  room it covers `renew` only.
- **Read sessions** (R-CRED-7) grant no acts, so they carry no bindings.
- **Exact retries.** An exact retry of an admitted `delegate` returns its
  original receipt (R-IDEM), even after a meaning changed. It does not
  re-pin anything; acts under it are judged at their own admission.
- **Grants from before declared acts.** A delegation or invitation
  admitted under a `v1` document carries no bindings. After the room
  activates a `v2` document, it covers no declared kind, only `renew`. It
  is never upgraded silently. Acts under it are refused
  `delegation-invalid`, with the fix "ask the grantor to delegate again".

Acceptance cases, in stage 2: an explicit-kind grant signed before an
activation that changes one of its kinds, and submitted after it, is
refused `binding-stale`; a grant whose signed map was expanded before an
activation that adds a kind is admitted, and does not cover the new kind;
an exact retry of an admitted grant after a meaning change returns the
original receipt, and acts under it are then refused
`delegation-invalid`; an invitation signed before a meaning change and
redeemed after it is refused; a `v1`-era delegation covers no declared
kind after the first `v2` activation.

#### 2.3.3 Check jobs choose their act from the checker's configuration

- **Each checker configuration names its act.** A checker configuration
  (`.artroom/checkers/<name>.json`, `contract/policy.ts@df22d771:133-154`)
  gains, in a new format `artroom-checker-v2`, a field `act`: the declared
  kind its checks are signed as. Checker configurations already activate
  with the policy document (R-POL-9), so the act and the configuration are
  always from the same version.
- **Validation** (R-POL-1). In a `v2` room, every checker configuration
  has `act`; it names a kind declared in the same activation whose only
  step on its `version` target is `check`, whose `who.roles` includes
  `checker`, and which declares no required body field, because the
  checker service fills only the `check` step's fields. Otherwise the
  proposal is refused with `policy-invalid`, naming the checker. Several
  checkers may name one act. Because each configuration names exactly
  one act, a job can never have none or several to choose from.
- **The job.** A `CheckJob` carries that kind and its binding, from the
  policy version that made the obligation, as it already carries that
  version's configuration digest (`contract/checker.ts@df22d771:35-75`).
  An activation that changes the binding ends every owed or sent job as no
  longer needed, as a configuration change does today
  (`room/jobs.ts@df22d771:1-33`), and the room issues new ones. A late
  check signed under the old binding is refused `binding-stale`.
- **Thread applicability.** Before issuing a job, the room checks that the
  obligation's thread kind is in the act's `threads`. If not, it issues no
  job, admins see `check-unroutable` in their attention, and a landing
  that needs the check fails in preparation with code `check-unroutable`
  and the fix "declare the check act for this kind of thread" (R-LAND-4
  step 2).
- **The legacy vocabulary** signs `check`, as today
  (`checkers/checker.ts@df22d771:224-233`).

Acceptance cases, in stage 4: a checker configuration with no `act`, or
naming an undeclared kind, a kind whose step is not `check`, or a kind
with a required body field, is refused `policy-invalid`; an obligation on
a thread whose kind the act does not name issues no job and fails the
landing `check-unroutable`.

#### 2.3.4 Step semantics are pinned by the document

A `v2` document names its step semantics version, in a required field
`steps` (for example `"steps": "artroom-steps-v1"`). Section 3.9 says how
it changes. The binding of section 3.6 includes it.

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
  (`log/verify.ts@df22d771:513-528`). No new field on that event is
  needed.
- One version identity: the `policy-activated` entry's ID (R-POL-12).

A `v1` document has no `acts`. It means the legacy vocabulary of section
3.2, permanently.

### 3.2 The legacy vocabulary

**What it is.** `artroom-legacy-v1` is exactly what main `df22d771`
admits: the seven acts, `renew` and `roster`; today's bodies, targets,
roles, delegable kinds and refusals; and `claim` with
`purpose: "config-recovery"` (`room/schema.ts@df22d771:221-239`), with its
admin-only, policy-bypassing semantics (`room/admission.ts@df22d771:608-660`
and every `recoveryLaneCheck`, R-ADMIN-5 to R-ADMIN-8). It also keeps
today's behaviour where the code and a rule differ, such as rescope
recording `obligationsRecomputed: false`
(`room/admission.ts@df22d771:691`; see R-LANE-2 in section 8.2).

**What it is not.** It is not the section-6 declarations. Those are
code-review `v2` authoring: the same seven acts, written as declarations,
with `threads`, the binding of section 3.6, and no `purpose` field under
option (a) of section 3.5. A room can adopt them only by activating a
`v2` document.

**Its identity.** The platform carries it as a fixed, canonical
description with a fixed digest, and the name `artroom-legacy-v1`. It is
never edited. Its meaning is the admission code it describes, kept as one
frozen path in the room and in verify, not re-expressed through the steps.

**Where it applies:**
- in a room whose active document is `v1`, to every act. Such a room
  admits exactly what main `df22d771` admits;
- in `artroom verify`, to every entry admitted while a `v1` document was
  in force, whatever later documents say;
- to envelopes of format `v: 1`, which carry no binding. They are
  admitted only while the active document is `v1`. Once a `v2` document is
  active, a `v: 1` envelope of a declared kind is refused with
  `binding-stale` (section 3.6). `renew` and `roster` keep accepting
  `v: 1`.

**Moving a room from `v1` to `v2`.** The first `v2` document lands like any
policy change. A configuration-recovery thread that is open at that
activation keeps its purpose, its holder and its history. Under option
(a) of section 3.5, later acts on it are `recover` ops, which accept any
thread whose purpose is `config-recovery`, whether a legacy `claim` or a
`recover` op opened it; a code-review `v2` act on it is refused with
`wrong-thread`, and the fix names `recover`. Under option (b), the
code-review `v2` declarations keep `purpose`, and nothing changes for
that thread.

**How the guarantee is held.** By two tests, not by the absence of
production logs:
- stage 2 runs the room's whole existing suite unchanged against the
  legacy vocabulary (section 8.5);
- stage 3 adds a fresh-clone replay fixture with a whole legacy recovery
  sequence: `claim` with `purpose: "config-recovery"`, `propose` of an
  `.artroom/` change, an admin's `review` (including a flagged sole-admin
  approval), `land`, `land-outcome`, `policy-activated` of a `v2`
  document, and the thread's later release. Verify must pass it, and a
  verifier mutated to judge the `v1`-era entries under the `v2`
  declarations must fail it.

### 3.3 Admin approval and activation

Nothing new is needed:
1. A proposal that changes `.artroom/policy.json` is validated at propose
   time (R-POL-1). The validation grows to cover `acts` (section 3.4).
2. It gets `obl_admin-approval` (R-ADMIN-1). A sole admin may approve it,
   flagged (R-ADMIN-2).
3. The proposed declarations never judge their own authorization
   (R-ADMIN-9).
4. When it lands, `policy-activated` is sealed at the next seq (R-POL-9,
   `room/core.ts@df22d771:1325-1336`). From that seq the new declarations
   judge every act.

### 3.4 Validation at propose time

R-POL-1 refuses an invalid document with `policy-invalid`. For `acts` it
also checks:
- every kind matches `[a-z][a-z0-9-]{0,31}` and is not reserved
  (`renew`, `roster`, `recover`, `room`, and the system event names of
  R-LOG-5);
- every target shape lists only allowed steps, and only `version` then
  `land` is combined;
- an act with a `thread`, `version` or `line` target names `threads`, and
  each name is one section 2.3.1 allows; an act with step `open` has
  `hold`, and no other act has it;
- the document names a step semantics version this platform carries
  (sections 2.3.4 and 3.9);
- every checker configuration names an act that section 2.3.3 allows;
- body field names do not reuse a step's field names or `because`;
- every limit is inside the platform's bounds (invariant 14, section 2.2);
- `who.roles` respects the platform floor and does not list `admin`
  (section 2.2);
- `hold.scope` slots name `segment` or `enum` fields of the same act;
- every rule's `on` names a declared kind or a platform kind;
- refusal templates use only the slots in section 1;
- **soundness:** no step is unreachable. Every act that needs a thread or
  a version has an act that can create one; every `hand-over` has an act
  that can `take` the thread; and a hold that no declared act can end is
  reported, because only lease expiry will end it. This checks the
  reachable states, after the workflow-net view in the acts review
  (`notes/2026-10-02-acts-review.md` on branch `request/acts-review`,
  section 6.2).

### 3.5 The recovery path cannot depend on declarations

Today a configuration-recovery lane is a `claim` with
`purpose: "config-recovery"`, then `propose`, `review` and `land` on that
lane, all admin-only and outside policy rules (R-ADMIN-5,
`room/admission.ts@df22d771:611-616`). If the recovery path were made of
declared acts, a bad declaration could remove it, and a room could lock
itself out. That breaks invariant 7. In a `v1` room the legacy vocabulary
keeps it (section 3.2); the question is `v2`.

**Decision for hugh.** Two options:
- **(a) Recommended: a platform kind `recover`**, with ops, as `roster`
  has: `open`, `version`, `approve`, `land`, `release`, `note`. It keeps
  today's recovery rules exactly, and platform code judges it whatever the
  declarations say. The code-review `v2` `claim` has no `purpose` field.
  The legacy vocabulary is unchanged, and open legacy recovery threads
  move to `recover` as section 3.2 describes.
- **(b) Reserve the code-review names.** `claim`, `propose`, `review`,
  `land`, `release` and `note` keep their code-review meaning in every
  `v2` room, and recovery uses them. No new kind, but the seven stay
  special. That contradicts the assert's "one vocabulary among others".

### 3.6 Binding a signed act to its meaning

**The problem** (review `197f8511`, P1). If a signed act were judged only
by the declarations in force when it arrives, a declaration change could
give an old signature a new meaning with the same shape. Example: a
thread-targeted act changes from `[version]` to `[version, land]` with the
same body, roles and target. A request signed to stage a version would
then start a landing, which its signer never agreed to. Changes to fixed
scopes and hold settings give more such cases. dap fences this with
`stale_binding` (section 9).

**The rule.**
- **The envelope carries a binding.** Envelope format `v: 2` adds a
  signed field `binding`: the identity of the declaration the act was
  prepared under. Every act of a declared kind carries it.
- **The identity is per kind.** It is the SHA-256 of the canonical JSON
  of `{ steps, kind, targets, threads, body, hold }` for that kind, where
  `steps` is the step semantics version the document names (section
  2.3.4), and every default is resolved first (for example `conflict`
  from the policy's `lanes`). It leaves out `label`, `help` and
  `refusals`, which change only how the act is described, and `who`, which
  decides whether this signer may act at all and is judged at admission
  against the current roster (R-ADM-3). Activating a document that names
  a new steps version changes every binding (section 3.9).
- **Why per kind, not the whole document.** A whole-document binding goes
  stale on every policy change: a new kind, a changed `refuse` rule, a
  relabelled act. Every in-flight act and delegation in the room would be
  refused after it, for example every pending `take-solo` when the jam's
  house rules change mid-session. A per-kind identity goes stale only for
  acts whose meaning changed. The cost is that the identity must include
  everything that decides the act's meaning, which is why defaults are
  resolved and the steps version is included. The thread an act targets
  is not part of its identity: its settings were fixed when it was opened
  (section 2.3.1), and the signer chose it by name.
- **Admission.** A new step, between authority (step 4) and the body
  check (step 5): if `binding` differs from the identity of the active
  declaration of that kind, the act is refused with `binding-stale` and
  not recorded. The refusal's `current` gives the active binding and
  policy version.
- **Retries.** Idempotency (step 3) runs first. So an exact retry of an
  act that was already accepted returns its original receipt, even after
  its binding has gone stale (R-IDEM). Because `binding-stale` is not
  recorded, its signer may sign the same intent again under the new
  binding, with the same idempotency key. The client library re-signs only
  when its caller asks, after showing what changed. It never re-signs on
  its own.
- **Grants carry the bindings their grantor signed** (section 2.3.2):
  delegations and room-custody invitations name a signed map from kind to
  binding, checked when the grant is admitted and again at each use.
  dap's rule is the same: "A newer package never silently enlarges
  authority" (section 9).
- **Bearer sessions.** A bearer act (`room/requests.ts@df22d771:353-360`)
  is signed by the room with a session key, so the binding must come from
  the agent: the MCP `act` tool requires it, and the agent reads it from
  the `acts` tool. Each named code-review MCP tool carries the binding of
  the declaration it was built for, so a room whose declaration differs
  refuses it with `binding-stale`.
- **Checker jobs** carry the act their checker's configuration names,
  with its binding, and are reissued when it changes (section 2.3.3).

**Acceptance cases** (stage 2 in section 8.5):
1. A same-shape change: an act signed under `[version]` and submitted
   after activation of `[version, land]` is refused `binding-stale`, and
   no landing starts.
2. A fixed-scope or hold change (`hold.scope`, `leaseSeconds`): the same.
3. An unrelated update (a new kind, a changed `refuse` rule, a new label
   or refusal wording) leaves the binding equal, and the act is admitted.
4. An exact retry of an act accepted before the activation returns the
   original receipt after it.
5. The grant cases of section 2.3.2, including delayed explicit-kind and
   expanded-wildcard grants across an activation.
6. A check job prepared before a change to its act is ended as not
   needed, and a late check under the old binding is refused (section
   2.3.3).

### 3.7 Upgrading a declaration safely

- **Signed acts keep their meaning** (section 3.6).
- **Threads keep their settings.** A thread keeps the kind, scope,
  conflict mode, lease length and reservation deadline it was opened with.
  Activation does not end, shorten or extend any hold. Only the steps and
  lease expiry do.
- **Open versions are recomputed,** as today (R-POL-9). A change to who
  may review, or to `require` rules, reaches open proposals through the
  existing `obligations-recomputed` events.
- **Landing operations prepared under the old version are fenced** and
  prepared again (R-LAND-5), as today.
- **Clients learn the declarations and bindings from the room**: a read of
  the active version's `acts`, and the same in MCP (section 8.1). gitseq
  publishes its catalog in the same way (section 9).
- **Retiring a kind** means leaving it out of the next document. There is
  no fallback to a built-in definition. gitseq's fallback is an
  implementation detail its own design note proposes to remove (section
  9). The legacy vocabulary is not a fallback: it applies only to `v1`
  documents.

### 3.8 Upgrading the evaluator

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

### 3.9 Upgrading step semantics

The step semantics are platform code, so a new engine could change what a
room's existing document means without anyone activating anything. The
rule prevents that, in the same way as for the evaluator (section 3.8):
- **Pinned by the document.** A `v2` document names its steps version
  (section 2.3.4). Admission uses the implementation that `D(s)` names,
  and the binding of every kind includes it.
- **Changed only by activation.** A platform release may add a steps
  version. It never changes an existing one, and it never moves a room to
  the new one. A room moves by landing a document that names it: an
  admin-approved change (invariant 7) that takes effect at the exact seq
  of its `policy-activated` event (R-POL-9). From that seq every binding is
  new, so every act signed before is refused `binding-stale` and every
  grant must be made again. That is intended, and visible in the log.
- **Retained for ever.** The platform keeps every steps version it has
  shipped, in the room and in verify, as it keeps the legacy vocabulary
  (section 3.2). Verify picks the implementation for each entry from
  `D(s)`. A verifier that lacks the version a document names stops at the
  first such entry with `steps-unsupported`: a limit of that verifier, not
  a finding against the log.
- **A behaviour fix is a new version.** For example, implementing R-LANE-2
  (section 8.2) changes what `take` does, so it ships as a new steps
  version that rooms adopt by activation.

Acceptance cases, in stage 6: a log spanning two steps versions verifies,
each interval under its own; an exact retry of an act accepted under the
old version returns its original receipt after the room has moved; a
deployment that ships a new steps version, with no activation, leaves
every binding and every receipt byte-identical; a verifier without the new
version reports `steps-unsupported` at the first entry that needs it.

## 4. Deterministic evaluation and replay

### 4.1 What is evaluated, and how

- Binding, body and target shapes, the roles check and every step's
  guards are platform code, deterministic, with no evaluator.
- Guards written as expressions are `refuse` rules. They run in the
  pinned profile (R-EVAL-1), with budgets unchanged (R-EVAL-2), on the
  input for their kind (R-EVAL-3), stamped with the `jsonata`, profile and
  accounting versions (R-EVAL-4), on one meter per act (R-EVAL-9). A
  declaration can neither add a function nor raise a budget.
- Each decision records its policy version, which now also names the
  declarations, and the digest of its replay context (R-POL-11,
  R-EVAL-8).

**Which declarations judged an act.** The act at seq `s` was judged by the
document of the last `policy-activated` event before `s`; call it `D(s)`.
Verify already computes this for every entry
(`log/verify.ts@df22d771:466, 513-528`) and already requires each
decision's policy to be that version.

### 4.2 What verify proves today, and what it must prove

Today `artroom verify` checks every signature and the hash chain, each
act's authority by replaying the roster, and every recorded policy
decision by replaying it from its retained context
(`log/verify.ts@df22d771:1-24`). It states its own limit: it "does not
re-derive lane, lease, obligation or landing transitions, or the effects
in receipts" (R-LOG-15, `log/verify.ts@df22d771:183`). The replay context
is the context of one evaluator call (R-EVAL-8), not a witness of the
whole admission. And receipt effects carry little: `LaneEffect` has no
scope at open, no changed paths, no obligations and no integrations
(`contract/lanes.ts@df22d771:107-124`).

With declared acts, the guards are chosen by data, so a fresh clone must
be able to show that each guard held. Three classes of fact need
different treatment:
- **Published decisions.** Every entry in the log: accepted acts,
  recorded refusals (admission steps 7 to 9) and system events. Verify
  re-derives and replays these.
- **Unrecorded admission refusals.** Steps 1 to 6, including
  `binding-stale`, `kind-undeclared`, `secret-detected` and every refused
  `join`. They never reach the log, by design (R-ADM-8). Verify can
  neither see nor prove them.
- **Room-clock truth.** When a lease or reservation was due, and every
  `at` (R-ADM-1 calls `at` informational). Verify proves the order of
  events, not that the clock was right.

### 4.3 Each guard and its witness

"Fold" below means thread state that verify re-derives from earlier
entries: the envelopes, the receipts and the system events.

| Guard | Steps | What verify reads | Today | Proposed |
|---|---|---|---|---|
| Signature, room, canonical bytes, idempotency | all | the entry | checked | unchanged |
| Authority by case, role, delegation | all | the roster fold | checked | `who` from `D(s)`; the bindings a grant names (2.3.2) |
| Kind declared; binding; body and target shape | all | `D(s)`, retained (R-LOG-7) | kinds against a fixed list of nine (`log/decode.ts@df22d771:96, 261`) | re-derived |
| Thread exists; its kind; holder; lease generation; hold settings; scope source and current scope | every step on a thread | fold: the opening envelope and `D(s)` give kind, settings, scope source and first scope; each `take`'s body and its `rescoped` or `taken-over` effect give the current scope; `opened`, `released` and `expired` effects and `lease-expired` events give holder and lease generation | not checked | re-derived (section 2.3.1) |
| Reservation | `take`, `hand-over` | fold: a new `handed-over` effect (`to`, deadline) and the `reservation-ended` event | none | re-derived; order only |
| `expectedGeneration`; a version's head | `take`, `version`, `review`, `check`, `land`, `comment` on a line | fold of `proposed` effects | not checked | re-derived |
| Head reachable in the fork; diff bounded; base; changed paths | `version` | **new witness**: the version's base and changed paths, retained by digest and named in the receipt; and Git objects through the pinned refs, when fetched | not checked; changed paths appear only inside policy contexts, when rules ran | the scope guard and the admin obligation re-derived from the witness; the witness checked against Git when the objects are present, otherwise proof limit `git-unwitnessed` |
| `require` obligations; carrying | `version`, recomputation | the required calls (4.4), rebuilt contexts, and the rules in `D(s)` | only the decisions present are replayed | calls derived, contexts rebuilt and compared, outcomes replayed; then the obligation set derived from them |
| Evidence qualifies | `review`, `check` | recorded authority, roster fold, the obligation set, the act's flags | authority only | re-derived by the shared qualification rule (`room/obligations.ts@df22d771:92-125`) |
| Check binding: an integration prepared for this generation, its owner, configuration, tree or snapshot | `check` | **new system event** `prepared`: the room seals it when an integration is ready, before any job for it is issued, naming the owner (a preview of a lane and generation, or a landing operation), the integration, its base and tree, and for each scoped checker the snapshot commit and digest; configuration digest from `D(s)` | not checked | the guard requires a `prepared` event for this generation, and for `landOp` that operation, naming the check's integration and tree or snapshot; obligation and configuration re-derived |
| Review obligations met; no blocked or pending recomputation; no landing in flight | `land` | fold of evidence, `obligations-recomputed`, `land-op` effects and `land-outcome` events | not checked | re-derived |
| `refuse` and `land` rules | all, `land` | the required calls (4.4) and rebuilt contexts | only the decisions present are replayed | calls derived, contexts rebuilt and compared, outcomes replayed |
| Main exists | `land` | a room fact about Git | not checked | proof limit `git-unwitnessed` |
| Lease expiry and reservation end | every holder step, `take` | the order of sealed events | not checked | order re-derived; timing is room-clock truth |
| Secret scan | all | the body | unrecorded class | not proved; verify may scan again and warn |

The version witness is retained like a replay context, following the
pattern of `CarryFactsRecord` (R-EVAL-8). The `prepared` event is
different in kind: a check witness that reported only an integration,
owner and tree would show that a check ran on that tree, not that the
room prepared that integration for that preview or landing, and matching
trees cannot show it either. So preparation is itself published, as an
ordered fact the check guard can require. Its cost is one entry per clean
preview and per prepared landing, which stage 2 measures against the
row-writes baseline. What remains a limit is that the integration is the
correct merge of the head onto its base: that needs the Git objects and
the publisher's merge, and is `git-unwitnessed` without them.

### 4.4 Required evaluation calls

Recorded decisions alone do not show that the room asked every question it
had to. Verify today groups the decisions present in a receipt and replays
those (`log/verify.ts@df22d771:421-457`); a receipt with none replays
nothing. So a room-signed log could leave out a whole `require` call and
its context, record no obligations, and later land.

Verify therefore derives, for each published entry, the calls the room
had to make, in order:

| Entry | Required calls, in order |
|---|---|
| Any act, except an act on a configuration-recovery thread and a roster act by an admin or the recovery key (R-ADMIN-3, R-ADMIN-5) | `refuse`: each rule in `D(s)` whose `on` names the kind, in document order, until the first refusal or error |
| An act with step `version` | `refuse` as above, before the scope check (R-ADM-1 as amended by `66d6fb14`); then each `require` rule in document order; then `carry` for each earlier verdict the platform's carry conditions admit, which the fold gives |
| An act with step `land` | `refuse`; then the `land` rules at stage `land` |
| `obligations-recomputed` | `require` and `carry` for that proposal (R-POL-9) |
| `land-evaluated` | the `land` rules at stage `reservation` (R-LAND-4) |
| `notified` | the `notify` rules whose `on` names the kind (R-POL-5) |

The order within each kind, and where it stops, is the evaluator's own
(for `refuse`, `policy/rules.ts@df22d771:183-210`). Verify calls the same
code, so the two cannot drift.

For each required call, verify rebuilds the replay context (R-EVAL-8)
from the fold, not from the retained copy: the act from the envelope; the
actor's role, teams and delegation from the roster fold; the lane from the
thread fold; the proposal from the version witness, with owners from
`D(s)`; the room from the roster fold; the lane purpose and recovery-key
flag; and the budget state, where the act's meter starts empty and each
call starts with the usage the calls before it recorded (R-EVAL-9). Then
it compares:
- a required call with no recorded decision: `decision-missing`;
- a recorded decision that no required call accounts for:
  `decision-extra`;
- a retained context whose digest is not the rebuilt one:
  `context-mismatch`. A plausible but false context fails here, even
  though it would replay consistently;
- the outcome, as today (`policy-decision-mismatch`).

Only after these does verify derive obligations and effects (4.5).

**Remaining limit.** The rebuilt `proposal` input is only as good as the
version witness, which is checked against Git when the objects are
present and is `git-unwitnessed` otherwise.

### 4.5 Derived transitions, and named failures

For each accepted act, verify computes the expected effects from the fold,
`D(s)` and the witnesses, and compares their canonical bytes with the
receipt's `effects`. For each recorded refusal, it finds the first guard
that fails and compares that refusal code. Then it advances the fold.

New verification failures, each naming the seq:
- `kind-undeclared`: the kind is not declared in `D(s)`;
- `binding-stale`: the binding is not the identity of the kind in `D(s)`;
- `body-invalid`: the body or target does not fit `D(s)`;
- `guard-failed`: an accepted act whose guard fails on the fold;
- `effect-mismatch`: receipt effects that differ from the derived ones;
- `refusal-mismatch`: a recorded refusal whose code is not the first
  failing guard's;
- `decision-missing`, `decision-extra`, `context-mismatch`: section 4.4;
- `witness-missing`: a required witness, `prepared` event or retained
  document is absent;
- `git-mismatch`: a witness that disagrees with Git objects that are
  present.

Proof limits, reported but not failures: `git-unwitnessed` (Git objects
not fetched), room-clock timing, and the unrecorded refusals.

### 4.6 Bounds

- The fold holds one record per thread, generation, obligation and piece
  of evidence. It grows linearly with the log, and verify streams the
  entries. A verifier may save the fold at each log checkpoint.
- A changed-path witness is bounded by the room's diff bound (R-PROP-6,
  `diff-too-large`). Witnesses and documents are published through the
  log layout's object bound and chunking (R-LOG-18, R-LOG-19).
- Replay contexts keep their existing bounds (R-EVAL-2: input at most
  256 KiB).

### 4.7 Adversarial fixtures

Room-signed logs with valid signatures, to show that verify does not
trust the room:
- a `land` accepted with a review obligation open: `guard-failed`;
- a version whose witness lists a path outside its scope: `guard-failed`;
- a `take-solo` by another member before `reservation-ended`:
  `guard-failed`;
- a `release` whose effect does not raise the lease generation:
  `effect-mismatch`;
- a version whose witness is not published: `witness-missing`;
- a witness that disagrees with the pinned Git objects: `git-mismatch`;
- a version whose whole `require` call, decision and context, is deleted,
  with no obligations recorded and a later `land`: `decision-missing`;
- an act whose whole `refuse` call is deleted: `decision-missing`;
- a `land` whose stage-`land` call is deleted: `decision-missing`;
- a version whose `require` context is replaced by a plausible false one
  (its `proposal.paths` leaves out `.artroom/policy.json`), with the
  decision's digest recomputed to match: `context-mismatch`;
- a decision added that no rule required: `decision-extra`;
- a check bound to an integration with no `prepared` event for that
  generation: `guard-failed`.

### 4.8 No clock in replay

Every time-based decision becomes a sealed event before it can affect an
act: lease expiry today (R-LANE-8, `room/core.ts@df22d771:1399-1415`), and
reservation end for `hand-over`. Admission seals due expiries before it
decides anything (`room/admission.ts@df22d771:236-237`). So replay
compares sequence numbers, never clocks.

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
- The act at seq `s` was admitted under `D(s)`. Its kind, binding and
  body were checked against `D(s)`, and its decisions name `D(s)`'s
  version.
- A later activation at seq `t > s` changes `D` only for entries after
  `t`. It never revisits entry `s`. This is R-ADM-7 ("an admitted act's
  authority is never re-judged as an act") applied to kinds.
- `D(s)` is retained by digest (R-LOG-7), so a fresh clone can always read
  it. Verify judges `s` under `D(s)`, as it already judges policy
  decisions.

So retiring, renaming or changing a kind never invalidates a record. A
name may later be declared again with a different shape; it then has a
different binding. Each record is still read under the version at its own
seq.

**How readers show it.** The UI, client and MCP show a record with the
label and fields of `D(s)`, and mark a kind no longer declared as
"retired at seq `t`". They never classify an old record by the current
vocabulary; gitseq found that such readings disagree with the fold
(section 9).

### 5.3 Logs written before declared acts

Their `policy-activated` events name `v1` documents. Every entry admitted
under a `v1` document is judged by the legacy vocabulary (section 3.2),
whose digest is fixed in code. So verify judges every old record exactly
as the room admitted it, including configuration-recovery lanes. No log is
rewritten.

### 5.4 State left by a kind that is no longer declared

- **A hold** opened by a retired kind keeps its settings and ends by lease
  expiry, or by any declared act whose `threads` names that kind. A
  retired opening kind stays a valid name in `threads` (section 2.3.1), so
  later documents can keep a release or review path to its threads.
- **A reservation** keeps its deadline and ends by its sealed event.
- **Evidence** keeps counting by the facts recorded at its admission
  (R-REV-1). Activation re-judges carrying, as it does today (R-POL-9).
  Retiring a review kind does not reopen obligations its reviews met;
  only revocation does (R-REV-3).
- **A landing operation** in flight completes forward, as any landing
  does (R-PUB-6).

### 5.5 In `artroom verify`

A kind not declared at its own seq is the verification failure
`kind-undeclared`, because the room would never have admitted it. A kind
declared then and retired since is valid. Today verify stops at any kind
outside its fixed list, as `malformed` (`log/verify.ts@df22d771:288-296`).

## 6. The seven acts as the code-review application's declarations

This section shows, for each of the seven acts, what the room enforces
today, then its code-review `v2` declaration, then what that declaration
does not capture. The legacy vocabulary of section 3.2 is these seven plus
`claim`'s `purpose`, frozen as main `df22d771` has them; it is not
re-expressed as declarations.

Three things apply to all seven:
- **Who, today.** R-GEN-5's table (`room/roster.ts@df22d771:29-35`):
  `admin` signs every kind; `maintainer`, `member` and `agent` sign all
  but `check`; `checker` signs `check` and `note`. A delegation covers any
  of the seven (`room/schema.ts@df22d771:31`) within its grantor's role
  (`room/authority.ts@df22d771:120-131`). In the declarations `admin` is
  implicit (section 2.2).
- **Threads.** Every thread in a code-review room is opened by `claim`, or
  by the room as a revert lane (R-REV-6). So every act on a thread names
  `"threads": ["claim", "room"]`.
- **Policy rules.** `refuse` rules may refuse any of the seven, and
  `notify` rules may notify on any (`policy/rules.ts@df22d771:198, 515`).
  The names are unchanged, so every existing policy, including the pack
  (`policy/pack.ts`) and `examples/demo-repo/.artroom/policy.json`, keeps
  its meaning.

**How "nothing is lost" is shown.** In each table every enforcement site
maps to a step (section 2.1), a declaration field, or a platform rule that
applies to all acts. The executable proof is stage 2 in section 8.5: the
room's whole existing suite passes unchanged against the legacy
vocabulary. Against the code-review `v2` declarations it passes with two
kinds of change, and no others: envelopes carry bindings; and, under
option (a) of section 3.5, the configuration-recovery tests are rewritten
from `claim` with `purpose` to `recover` ops. Bindings alone cannot turn
the one into the other, so that rewrite is an intended change of
behaviour, and stage 2's report lists each rewritten test for review. A
mutation of each declaration field turns a test red.

### 6.1 `claim`

| What | Today | Where (`room/…@df22d771`) | Becomes |
|---|---|---|---|
| Target | `null` (new lane) or a lane | `schema.ts:166-168` | targets `none`, `thread` |
| Body | `goal` ≤ 1,024 bytes (required for a new lane), `scope` 1 to 64 globs, `plan` ≤ 16 KiB, `expectedGeneration` and `lease?` on a lane, `purpose?`, `because?` | `schema.ts:221-239` | `goal`, `plan` declared; `scope`, `expectedGeneration`, `lease` from the steps; `purpose` stays in the legacy vocabulary and moves to `recover` under option (a) of section 3.5 |
| Requires, new lane | recovery purpose admin-only and `.artroom/` only; under `exclusive`, no overlap with a held lane; `refuse` rules | `admission.ts:611-623` | `open` |
| Requires, existing lane | lane exists; rescope needs the holder and current lease; take-over needs an unheld lane; `expectedGeneration` matches; the new `scope` is checked for overlap, for rescope and take-over alike; `refuse` rules | `admission.ts:665-687` | `take` on a body-scoped thread (section 2.3.1) |
| Holds | new: holder is signer, lease generation 1; rescope: same generation; take-over: next generation; expiry is now plus the room lease | `admission.ts:624, 688-689` | `hold.scope: "body.scope"`, room lease, workspace |
| Changes | inserts the lane, or updates scope, goal, plan, holder, lease, for rescope and take-over alike; a take-over invalidates an unreserved landing | `admission.ts:637-646, 700-710` | `open`, `take`: the current scope from the body; goal and plan as below |
| Files, checks, reviews | none | | |
| Refusals | `admin-required`, `recovery-scope`, `scope-overlap` ("The scope may overlap {lane}, held by {holder}."), `lane-unknown`, `lease-fenced`, `not-holder`, `lane-held`, `generation-moved` | `admission.ts:614-620, 665-684, 516-522` | platform wording; no override |

```json
"claim": {
  "label": "Claim",
  "targets": { "none": ["open"], "thread": ["take"] },
  "threads": ["claim", "room"],
  "body": {
    "goal": { "type": "text", "max": 1024, "requiredFor": ["none"] },
    "plan": { "type": "text", "max": 16384, "optional": true }
  },
  "who": { "roles": ["maintainer", "member", "agent"] },
  "hold": { "scope": "body.scope", "workspace": true }
}
```

Two cases, in stage 2, pin take-over with a new scope: a released `claim`
taken over with a different scope is admitted, with the new current
scope and the next lease generation; and a take-over whose new scope may
overlap an exclusive held lane is refused `scope-overlap`.

**Not captured.** One detail moves from admission to the code-review
record view: today a take-over or rescope that omits `goal` or `plan`
keeps the lane's previous value (`room/admission.ts@df22d771:703-704`).
Admission no longer stores application fields on the thread, so the
code-review module shows the latest `goal` and `plan` given by the
thread's `open` and `take` acts. What is admitted is unchanged. Then: the
configuration-recovery purpose, which section 3.5
keeps out of the application's hands under either option, and which the
legacy vocabulary keeps for `v1` rooms. Also, R-LANE-2 says a rescope
recomputes obligations when paths change, but the code always records
`obligationsRecomputed: false` (`room/admission.ts@df22d771:691`). The
declaration keeps today's behaviour; section 8.2 gives the disposition.

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
  "threads": ["claim", "room"],
  "body": { "summary": { "type": "text", "max": 8192 } },
  "who": { "roles": ["maintainer", "member", "agent"] }
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
  "threads": ["claim", "room"],
  "body": { "text": { "type": "text", "max": 16384 } },
  "who": { "roles": ["maintainer", "member", "agent", "checker"] }
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
  "threads": ["claim", "room"],
  "body": { "text": { "type": "text", "max": 16384 } },
  "who": { "roles": ["maintainer", "member", "agent"] }
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
  "threads": ["claim", "room"],
  "who": { "roles": ["checker"] }
}
```

Each code-review checker configuration names it: `"act": "check"`
(section 2.3.3).

**Not captured.** Nothing at admission. One site outside admission names
the kind: the checker service signs `kind: "check"`
(`checkers/checker.ts@df22d771:224-233`). With section 2.3.3 it signs the
kind and binding its job names, which for code-review is `check`.

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
  "threads": ["claim", "room"],
  "who": { "roles": ["maintainer", "member", "agent"] }
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
  "threads": ["claim", "room"],
  "who": { "roles": ["maintainer", "member", "agent"] }
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
seconds. `admin` is implicit in every act (section 2.2), so an empty
`roles` means admins only.

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
    "threads": ["take-part", "lead"],
    "who": { "roles": ["member", "agent"] }
  },
  "take-solo": {
    "label": "Take the solo",
    "targets": { "none": ["open"], "thread": ["take"] },
    "threads": ["take-solo"],
    "who": { "roles": ["member", "agent"] },
    "hold": { "scope": ["solo/**"], "conflict": "exclusive", "leaseSeconds": 64, "reserveSeconds": 8 },
    "refusals": {
      "lane-held": { "reason": "{holder} has the solo.", "fix": "Signal to take the next one." },
      "scope-overlap": { "reason": "{holder} has the solo.", "fix": "Signal to take the next one." },
      "reserved": { "reason": "The solo was passed to {reservedFor}.", "fix": "Wait until {until}, or signal." },
      "wrong-thread": { "reason": "That is not the solo.", "fix": "Take the solo thread." }
    }
  },
  "pass-solo": {
    "label": "Pass the solo",
    "targets": { "thread": ["hand-over"] },
    "threads": ["take-solo"],
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
    "threads": ["take-part"],
    "body": { "summary": { "type": "text", "max": 1024 } },
    "who": { "roles": ["member", "agent"] },
    "refusals": { "outside-claim": { "reason": "{path} is outside your part.", "fix": "Change only your part's files." } }
  },
  "change-key": {
    "label": "Change key",
    "targets": { "thread": ["version", "land"] },
    "threads": ["lead"],
    "body": { "summary": { "type": "text", "max": 1024 } },
    "who": { "roles": ["member", "agent"] },
    "refusals": {
      "not-holder": { "reason": "Only the leader changes the key.", "fix": "Signal the leader." },
      "wrong-thread": { "reason": "The key is changed only in the song file.", "fix": "Act on the lead thread." }
    }
  },
  "propose-rules": {
    "label": "Propose house rules",
    "targets": { "none": ["open"], "thread": ["version"] },
    "threads": ["propose-rules"],
    "body": { "summary": { "type": "text", "max": 4096, "requiredFor": ["thread"] } },
    "who": { "roles": ["member", "agent"] },
    "hold": { "scope": [".artroom/**"], "conflict": "exclusive" }
  },
  "approve-rules": {
    "label": "Approve house rules",
    "targets": { "version": ["review"] },
    "threads": ["propose-rules"],
    "body": { "text": { "type": "text", "max": 1024 } },
    "who": { "roles": [] }
  },
  "adopt-rules": {
    "label": "Adopt house rules",
    "targets": { "version": ["land"] },
    "threads": ["propose-rules"],
    "who": { "roles": ["member", "agent"] }
  },
  "in-key-check": {
    "label": "In key",
    "targets": { "version": ["check"] },
    "threads": ["take-part"],
    "who": { "roles": ["checker"] }
  }
}
```

**The check path.** Three pieces, using section 2.3.3. A `require` rule in
the same document asks for the check on every pattern:

```json
{ "id": "in-key", "kind": "require", "paths": ["parts/**"],
  "obligation": { "type": "check", "check": "in-key", "by": ["role:checker"] } }
```

The checker's configuration, `.artroom/checkers/in-key.json`, names the
act its checks are signed as:

```json
{ "format": "artroom-checker-v2", "act": "in-key-check",
  "inputs": ["parts/**", "song.json"], "volatile": false, "timeoutSeconds": 60 }
```

And `in-key-check`, above, is that act: its only step is `check`, it acts
only on part threads, only the `checker` role signs it, and it has no
required body field. So a job for `in-key` on a part thread has exactly
one act to sign, and its binding. The validator rejects the
configuration if `act` is missing or names anything else; the room issues
no job, and the landing fails `check-unroutable`, if a pattern somehow
needed the check on a thread kind that `in-key-check` does not name.

"Only the leader" is one `refuse` rule in the same document, on the
actor's teams. An admin passes it:

```json
{
  "id": "leader-only", "kind": "refuse",
  "on": ["lead", "change-key", "propose-rules", "adopt-rules"],
  "refuse": "$not(\"@leader\" in actor.teams) and actor.role != \"admin\"",
  "reason": "Only the leader may do this.", "fix": "Signal the leader."
}
```

**Why `change-key` has no `key` field.** Revision 1 gave it a typed `key`
and said a check could compare it with `song.json`. No check can: a
`CheckJob` carries Git inputs (the integration, its base, the input and
the configuration), not the act that proposed them
(`contract/checker.ts@df22d771:35-75`). Two copies of the key, one of them
unchecked, would invite disagreement. So the key lives only in
`song.json`. The `in-key` check reads it from the integration, and the UI
reads it from the landed file.

### 7.2 What the room enforces, and how

| Jam act | Steps | What the room enforces | Today, without declared acts (jam note section 1) |
|---|---|---|---|
| Take a part | `open` | One holder per part, exclusive, for the session; the part's workspace for pattern and take files | `claim` on `parts/bass/**`; exclusivity only room-wide (`lanes`) |
| Take the solo | `open` the first time, then `take` on a solo thread only | One soloist at a time: refused while the solo is held or reserved for someone else, and a second solo thread cannot be opened while one is held or reserved; `wrong-thread` on any thread not opened by `take-solo`; the thread's 64-second lease catches a player who drops out | `claim` on `solo/**`; refusal is `scope-overlap` with platform wording |
| Pass the solo | `hand-over` on a solo thread only | Ends the hold and reserves the solo for `to` for 8 seconds (4 bars); anyone else's `take-solo` is refused `reserved`; `to` must be an active member | `release` with a handover note naming the next player; nothing enforced |
| Signal | `comment` | Typed: one of five signals, and an optional member; `count-in` with no anchor fixes bar 1 | `note` with a text convention |
| Add a pattern | `version`, `land` on a part thread only | Holder of the part only; changed paths inside the part; the `in-key` obligation is met during preparation, before the landing publishes (R-LAND-4): the room prepares the integration and seals `prepared`, issues a job naming `in-key-check` and its binding, and admits the checker's signed `in-key-check` | `propose` then `land`: two acts |
| Change key | `version`, `land` on the lead thread only | Only the leader (the `leader-only` rule) and only on the thread `lead` opened, so only `song.json` changes; a `notify` rule on `change-key` reaches every player; every open pattern's `in-key` check stops carrying, because `song.json` is a global input (R-CARRY-3) | `propose` and `land` of `song.json` |
| Change the house rules | `propose-rules`, `approve-rules`, `adopt-rules` | Invariant 7: an admin must approve any change to `.artroom/**`, so this cannot be one act. A sole admin may approve their own, flagged (R-ADMIN-2). It activates at the next seq (R-POL-9) | `claim`, `propose`, `review`, `land` |

**How the thread rules close the gaps review `197f8511` found.** The
thread's kind and settings are fixed at its opening (section 1):
- released part threads keep their kind, `take-part`, so `take-solo` on
  one is refused `wrong-thread`. A solo can never run on a part's
  four-hour lease;
- a leader who also holds a part cannot run `change-key` on it: the part
  thread's kind is `take-part`, not `lead`;
- `pass-solo` acts only on solo threads, and `take` on a reserved solo is
  refused for everyone but the named member;
- a `take-solo` with a lease on the held solo thread would be a rescope,
  and the solo's scope is fixed, so it is refused `scope-fixed`
  (section 2.3.1).

**Two notes on `version` then `land` in one act.** The landing part follows
R-LAND-1: if the new version owes a review, the whole act is refused with
`obligation-open`, and nothing is recorded but the refusal. So the pair is
only useful where `require` rules ask for checks alone, as for patterns.
The `in-key` check is met during preparation, so the act returns before
the check runs, and the landing then waits for it as any landing does.

### 7.3 New primitives the jam needs

| Need | Proposed | Where it lands |
|---|---|---|
| A thread's kind and settings | recorded at `open`; `threads` and `wrong-thread` | Room: `kind`, `lease_ms`, `conflict`, `reserve_ms` columns on lanes; `PolicyLane` gains the kind |
| Lease length per act | `hold.leaseSeconds` | Room |
| Exclusivity per act | `hold.conflict`, with the either-side overlap rule (section 2.1) | Room |
| Scopes from a body field | `{field}` slots, from `segment` or `enum` fields only; `scope-fixed` on rescope | Room and validator |
| Reserved handover | the `hand-over` step; refusal `reserved`; a `handed-over` effect; a `reservation-ended` system event sealed by the alarm, as `lease-expired` is; a reserved thread counts as held in overlap checks | Contract, room, log, verify |
| One-act change | `version` then `land` | Room admission |
| A signal with no anchor | target `none` for `comment`; today a note is always anchored (`contract/acts.ts@df22d771:78-87`) | Contract and room |

**Unchanged by this note:** how the room reaches an application's checker
(jam note section 9, "the first finding"). Declared acts do not touch
check dispatch, so that finding stays open as its own request.

### 7.4 Acceptance cases for the jam fixture

- **Cross-thread use:** `take-solo` on a released part thread,
  `change-key` on a part thread, `add-pattern` on the lead thread and
  `pass-solo` on a part thread are each refused `wrong-thread`.
- **Reservation bypass:** while the solo is reserved, `take-solo` by
  another member is refused `reserved`, and `take-solo` with target
  `none` is refused `scope-overlap`; the named member's `take-solo` is
  admitted; after `reservation-ended`, anyone's is.
- **Conflicting hold modes:** a `by-scope` hold over `parts/**` is refused
  while an exclusive part is held, and an exclusive `take-part` is refused
  while a `by-scope` hold overlaps it.
- **Fixed scope:** a rescope of the solo thread is refused `scope-fixed`.
- **Leader only:** `change-key` by a player in the `@leader` team who does
  not hold the lead thread is refused `not-holder`; `lead` by a player
  outside the team is refused by `leader-only`.
- **The check path, end to end:** `add-pattern` on a part thread; the
  landing operation prepares the integration and seals `prepared`; the
  room issues a job naming `in-key-check` and its binding; the checker's
  signed `in-key-check` is admitted and meets the obligation; the landing
  reserves, publishes, and ends `landed`. A fresh clone verifies every
  step of it.
- **Check mapping failures:** `in-key.json` with no `act`, naming
  `signal`, or naming a check act with a required body field, is refused
  `policy-invalid`; with `in-key-check`'s `threads` changed to `["lead"]`,
  a pattern's landing fails `check-unroutable` and admins are told.
- **Binding:** after the house rules change `take-solo`'s
  `leaseSeconds`, a `take-solo` signed before the change is refused
  `binding-stale`; a `signal` signed before it is admitted.

**Self-hostable.** By assert `4e4134b4` as corrected by `b2cdc44a`,
builder judges whether Artroom is self-hostable: whether, with declared
acts, it is a viable platform for building the jam, as its proof and as a
basis for iteration. Section 8's last stage builds these declarations as
a fixture inside Artroom, so that builder can judge on evidence. Until
then, jam spikes may start in `~/play/artroom-jam`, and none is approved
(assert `fdb08e72` stands).

## 8. Impact and staging

### 8.1 What changes, by package

The inventory found the vocabulary hard-coded in about 140 places outside
`acts.ts`. Most belong to the code-review application and stay as its
code. The fixed kind list itself is written out five times:
`room/schema.ts@df22d771:30`, `room/roster.ts@df22d771:29-35`,
`policy/validate.ts@df22d771:16`, `log/decode.ts@df22d771:96` and
`log/roster.ts@df22d771:42-43`. In `v2` rooms those five become one: the
active declarations. The legacy vocabulary keeps one frozen copy.

| Package | Change |
|---|---|
| `packages/contract` | See section 8.2 for each type |
| `docs/protocol.md` | A new section, R-DECL, for this design; each amended rule is in section 8.2 |
| Room (`packages/room`) | The legacy path frozen; `schema.ts` body and target checks driven by the active declarations; the binding step; `authority.ts` and `roster.ts` roles from `who`, delegations pinning bindings; `admission.ts` `decide` dispatching by step, not by kind; thread kind and settings; `wrong-thread`, `scope-fixed`, `reserved`; refusal wording; `hand-over` and reservation; the version witness and the `prepared` event (section 4.3); check jobs choosing their act (2.3.3); grants carrying bindings (2.3.2); the steps version from the document (3.9); check jobs carrying kind and binding; a Room migration adding `kind`, `lease_ms`, `conflict`, `reserve_ms`, `reserved_for` and `reserved_until` to lanes. It takes the next free number: 4 if mint lane C lands first with migration 3 |
| Policy runtime (`packages/policy`) | Validation of `acts` (section 3.4); the binding identity; the code-review `v2` declarations as data; `refuse` and `notify` rules accept declared kinds; `PolicyLane` carries the thread's kind. The evaluator and profile do not change |
| Log and verify (`packages/log`) | Decoding accepts any kind that fits the grammar; the legacy vocabulary for `v1`-era entries; kind, binding, body and `who` judged under `D(s)`; then the fold, required calls, rebuilt contexts, derived transitions and the named failures of section 4 |
| Client (`packages/client`) | A generic `room.act(kind, target, body)` beside the existing `PreparedAct` path (`client/room.ts@df22d771:218-245`), which adds the binding; a read of the active declarations and bindings; the eight per-kind methods stay as the code-review module |
| MCP (`packages/mcp`) | Two new tools: `act`, which requires a binding, and `acts`, which lists the declarations with their bindings. The ten named tools stay (R-API-9), each with the binding it was built for. MCP is turn-based, so the jam's players use the client, not MCP (jam note section 5) |
| UI (`packages/ui`) | The feed and refusal text are generic from `label`, fields and refusal wording; a record of an unknown or retired kind shows its declaration at its seq (section 5.2). The Room, Proposal and Needs-you screens stay as the code-review application's |
| CLI and checkers | `artroom act <kind>`; the checker signs the kind and binding named in the job |

### 8.2 Supersession inventory

Every plan section, protocol rule and contract type that assumes the seven
acts, with one of three dispositions:
- **Superseded:** an assumption assert `4e4134b4` has already removed;
  nothing to decide.
- **Amend:** a proposal to change it, made by this note, for the protocol
  amendment of stage 1.
- **Retained:** it stands as written; where it names one of the seven, it
  now describes that act's steps, or the code-review application.

Rules and types not listed do not assume the seven acts.

**Plan sections**

| Plan section | Assumption | Disposition |
|---|---|---|
| 4, "The workflow" | "There are seven acts" | Superseded. The seven are the code-review application's (section 6) |
| 5, Principles | A lane's ID is its first claim's act ID | Retained: a thread's ID is its opening act's ID |
| 5, core types and the room example | `room.claim()` … `room.land()` | Retained as the code-review client module; amend: a generic `act` (8.1) |
| 5, Lane transitions | The transition table | Retained, as the step semantics (2.1) |
| 5, MCP tools | Ten tools named after acts | Amend: add `act` and `acts` |
| 5, Policy | Rules `on` act kinds | Retained; `on` names declared kinds |
| 9, The signed envelope | `{ v: 1, … kind … }` | Amend: `v: 2` with `binding` (3.6) |
| 9, Membership and roles | Roles decide which acts a member may sign | Amend: `who` with the platform floor (2.2) |
| 9, Platform invariants | Six invariants | Retained and extended (2.2) |
| 9, Leases | One room lease; release or expiry | Amend: a lease length per thread; reservation |
| 9, Bootstrap and recovery | Recovery through a claim's purpose | Amend: `recover` under option (a) (3.5); retained for `v1` rooms |
| 12, Targets; Edge cases | Measures named after acts | Retained, as code-review measures |
| 13, Gate 1 | The code-review slice | Retained (8.4) |
| 13, staging after the slice | Its order | Superseded in priority: declared-acts work comes first (assert `4e4134b4`) |
| 14, decision 1 | Invariants stay in platform code | Retained |

**Protocol rules**

| Rule | Disposition |
|---|---|
| Section 1, Terms (the act list) | Amend: acts are declared; the seven are code-review's |
| R-SIG-4 (closed envelopes) | Amend: the kind grammar, and `binding` in `v: 2` |
| R-GEN-1, R-GEN-10 (profile in genesis) | Amend only if hugh accepts section 3.8; otherwise retained |
| R-GEN-5 (role table) | Superseded as a fixed table; amend to the platform floor (2.2); retained for `v1` rooms |
| R-ADM-1 (admission order; `propose` special case) | Amend: the binding step; "propose" becomes "an act with step `version`" |
| R-ADM-5 (delegable kinds) | Amend: declared kinds, `delegable`, pinned bindings |
| R-ADM-7 | Retained; section 5.2 applies it to kinds |
| R-ADM-8 (unrecorded steps) | Amend: adds `binding-stale` and `kind-undeclared` to the unrecorded refusals |
| R-IDEM-1 to R-IDEM-6 | Retained; they decide exact retries (3.6) |
| R-CRED-3 (room-custody redemption makes the session's delegation) | Amend: the delegation copies the invitation's signed bindings, and redemption is refused if any is stale (2.3.2) |
| R-CRED-5 ("as for propose") | Amend: "as for an act with step `version` on that thread" |
| R-WS-1 to R-WS-5 | Retained; a workspace belongs to a thread whose hold says `workspace` |
| R-LANE-1, R-LANE-4, R-LANE-6, R-LANE-8 to R-LANE-10 | Retained, as step semantics |
| R-LANE-2 (rescope recomputes obligations) | Retained as written. The code does not do it today (`room/admission.ts@df22d771:691`). The legacy vocabulary keeps today's behaviour; the `v2` `take` step keeps it too, until a separate request fixes the code, which will change `artroom-steps-v1`. This note neither fixes nor hides the gap |
| R-LANE-3 (holder-only acts) | Amend: holder-only follows from steps; add `wrong-thread` |
| R-LANE-5 (renewal by the room lease) | Amend: the thread's lease length |
| R-LANE-7 (take-over) | Amend: `reserved`, `scope-fixed` |
| R-PATH-1 to R-PATH-3, R-PROP-1 to R-PROP-7 | Retained, as the `version` step |
| R-OBL-1, R-OBL-2, R-OBL-4 to R-OBL-7 | Retained, as the `review` and `check` steps |
| R-OBL-3 (check binding) | Amend: the check's kind and binding come from the job |
| R-CARRY-1 to R-CARRY-16 | Retained |
| R-LAND-1 | Amend: `version` then `land` in one act |
| R-LAND-4 (preparation requests checks) | Amend: seal `prepared`; fail `check-unroutable` when no job can be issued (2.3.3) |
| R-LAND-2 to R-LAND-11, R-PUB-1 to R-PUB-10 | Retained |
| R-REV-1 to R-REV-8 | Retained; R-REV-6's revert lanes have kind `room` |
| R-ADMIN-1 to R-ADMIN-4, R-ADMIN-9 | Retained |
| R-ADMIN-5 to R-ADMIN-8 (recovery through `claim`) | Amend under option (a): `recover`; retained in the legacy vocabulary |
| R-POL-1 | Amend: validates `acts`, `steps` and each checker's `act` (3.4) |
| R-POL-2, R-POL-5 (`on` kinds) | Amend: declared kinds |
| R-POL-3, R-POL-4, R-POL-6, R-POL-9, R-POL-11, R-POL-12 | Retained |
| R-POL-7 (default policy) | Amend: a room with no policy file uses the legacy vocabulary |
| R-POL-8 (`lanes`) | Amend: a mode per thread, and the either-side overlap rule (2.1) |
| R-POL-10 ("cannot change who may sign which kind") | Amend: the platform floor (2.2) |
| R-EVAL-3 (`RuleInput` per kind) | Amend: `act.kind` is a declared kind; `PolicyLane` gains the thread's kind |
| R-EVAL-4 | Amend only if hugh accepts section 3.8 |
| R-EXEC-8 to R-EXEC-10 (check jobs) | Amend: a job carries the kind and binding to sign |
| R-LOG-5 (system events) | Amend: `reservation-ended` and `prepared` |
| R-LOG-6 (receipts) | Amend: the `handed-over` effect and the version witness's digest |
| R-LOG-7, R-LOG-9 (retained inputs) | Amend: retain the version witness |
| R-LOG-10 (what verify checks) | Amend: section 4's contract |
| R-LOG-15 (what verify does not prove) | Superseded as a blanket limit; amend to the proof limits of section 4.5 |
| R-API-9 (ten MCP tools) | Amend: `act` and `acts` |
| Section 23, acceptance cases | Retained for code-review; amend: add the cases of sections 2.3, 3.2, 3.6, 3.9, 4.7 and 7.4 |

**Contract types** (`contract/…@df22d771`)

| Type | Where | Disposition |
|---|---|---|
| `ActKind` | `acts.ts:34` | Superseded |
| `EnvelopeKind` | `acts.ts:47` | Amend: a declared kind, or `renew`, `roster`, `recover` |
| `DelegableKind` | `roster.ts:49` | Amend: a declared kind or `renew` |
| `Envelope`, `EnvelopeOf` (`v: 1`) | `envelope.ts:42-66` | Retained for `v1`; amend: `v: 2` with `binding`, and a generic declared envelope |
| `ClaimBody` … `RenewBody`, `ReclaimBody` | `acts.ts:91-176` | Retained as the code-review module; `ClaimBody.purpose` legacy-only under option (a) |
| `Claim` … `Renewal`, `RecordByKind`, `ActRecord` | `acts.ts:228-337` | Retained as the code-review module; amend: a generic declared record |
| `ClaimInput` … `ReleaseInput` | `acts.ts:342-353` | Retained |
| `LanePurpose`, `Flag`, `Authority`, `Verdict` | `acts.ts:49-62, 184-213` | Retained |
| `LaneEffect` | `lanes.ts:107-124` | Amend: `handed-over`; the thread's kind in `opened` |
| `Effect`, `Receipt` | `log.ts:43-65` | Amend: the version witness's digest |
| `SystemEvent` | `log.ts:76` onward | Amend: `reservation-ended`, `prepared` |
| `PolicyDocument` | `policy.ts:117-130` | Retained as `v1`; amend: `artroom-policy-v2` with `acts` and `steps` |
| `CheckerConfig` | `policy.ts:133-154` | Retained as `v1`; amend: `artroom-checker-v2` with `act` (2.3.3) |
| `RosterOp` `delegate`, `Invitation.session` | `roster.ts:77, 103-109` | Amend: a signed map from kind to binding (2.3.2) |
| `RefuseRule.on`, `NotifyRule.on` | `policy.ts:51-96` | Amend: declared kinds |
| `RuleInput`, `PolicyLane` | `policy.ts:167-217` | Amend: declared `act.kind`; the thread's kind |
| `Delegation` | `roster.ts:52-60` | Amend: the signed bindings it was granted with |
| Refusal codes | `errors.ts:30-54` | Retained; amend: `kind-undeclared`, `binding-stale`, `wrong-thread`, `scope-fixed`, `reserved` |
| `RoomApi` per-kind methods | `transports.ts:224-232` | Retained; amend: generic `act` |
| `McpTools` | `transports.ts:451-506` | Retained; amend: `act`, `acts` |
| `BearerAct` | `transports.ts:334` | Amend: `binding` |
| `CheckJob` | `checker.ts:35-75` | Amend: `kind` and `binding` |
| `AttentionWhy` | `pagination.ts:42-66` | Retained for existing reasons; amend: `check-unroutable`. Declared acts otherwise reach attention through `notify` rules |
| `Genesis.profile` | `roster.ts:133` | Amend only if hugh accepts section 3.8 |

### 8.3 Lanes in flight

Lanes under review finish as reviewed (assert `4e4134b4`). None of them
touches `acts.ts`, `docs/protocol.md` or `packages/policy`.

| Lane | State at `df22d771` | What it means for declared acts | What declared acts mean for it |
|---|---|---|---|
| Mint lane C, request `5ff58c9a` (`request/mint-sites`) | Recut on this main; under re-review; adds Room migration 3 (due indexes) | No act-kind code. Declared acts take the next migration number. Both touch `room/core.ts` and `room/jobs.ts`, in different regions (lane C: loop kinds, mints, `nextAlarm`, how jobs mint tokens) | None. It finishes as reviewed |
| Row-writes, request `8bd623cc` (`request/row-writes`) | Under review; touches `propose()` in `admission.ts` for the `PIN_DELAY_MS` switch | Its rows-per-act measurements are the baseline: the declared path must add no rows per act beyond the version witness, retained once per version, and the `prepared` event, sealed once per clean preview or prepared landing. Its smoke driver sends literal `v: 1` act bodies, which stay valid in `v1` rooms | Stage 2 merges after it and keeps its switch inside the `version` step |
| Fork-token mint lane F, request `02836f9a` | Not started; no branch | Independent: it changes how `pinObjects` mints its fork token | It does not wait for declared acts. If both compete for a slot, declared acts go first (assert `4e4134b4`) |
| Orphan retirement (`request/orphans`) | Notes only; under review | None | None |
| Jam room note, request `f4a626c8` (`request/jam-room-note`) | Not yet reviewed; cut from a main about 400 commits old | It is this note's second example | Its premise, "the same seven acts", and its zero-amendment criterion are superseded. **Recommendation:** revise it against this note before review: the jam's acts are declarations, and the criterion becomes "no platform code in the jam". Its timing model, live layer, sample library and spikes stand |
| Acts review, request `9ea217bc` (`request/acts-review`; status not checked here) | A note | Its section 6 (two coupled state machines, workflow nets) supports the soundness lint in section 3.4 | Its "freeze the seven act kinds" (its section 4) is superseded. Its amendment 5 for work tracking (D1) can become a declared vocabulary instead of a contract amendment |

### 8.4 Gate 1 (2026-10-05)

Gate 1 is the deployed vertical slice of the code-review loop (plan
section 13): claim, workspace and push, propose with pinning, review and
one check from a real runner, a safe land, the attention queue, and
`artroom verify` on a fresh clone, run by two agents. The spike deployment
already ran that loop live over HTTPS and MCP on 2026-10-02
([deploy-spike.md](deploy-spike.md), "Review and check, live"). Whether
the rest of gate 1 is met is not judged here.

Declared acts change the room's admission path, the envelope, the
contract, the log's reading and verify. Building, reviewing and deploying
that in three days would put the slice at risk. And it is not needed for
the slice: a room on a `v1` policy keeps the legacy vocabulary exactly
(section 3.2), so a log recorded at gate 1 stays valid after declared acts
land.

**Recommendation for hugh to decide:** keep gate 1 on 2026-10-05 as the
code-review slice, run on the current fixed-act code, and do not make
declared acts a gate-1 condition. From the approval of this note, the
declared-acts stages below take the first free implementation slots,
ahead of every item in plan section 13's staging list, with lanes now
under review finishing first.

This is separate from self-hostability, which builder judges (section
7.4).

### 8.5 Staged implementation requests

At most two implementation lanes run at once until the slice passes
(plan section 13). Each stage is one request, with its own review.

| # | Request | Depends on | Done when |
|---|---|---|---|
| 1 | **Protocol amendment and contract types.** R-DECL in `docs/protocol.md` and every "Amend" of section 8.2; the contract types; the legacy vocabulary's description and digest; the `steps` field and the signed grant maps; checker configurations naming their act; the code-review `v2` declarations as data; the `acts` validator and the binding identity. No change in behaviour. Includes hugh's decisions on sections 3.5 and 3.8 | this note | the declarations validate; every existing test passes; checker approves the amendment |
| 2 | **Room admission by declaration.** The legacy path frozen; `v2` declarations; the binding step, delegation pins and check-job bindings; thread kinds and `wrong-thread`; `kind-undeclared`; refusal wording | 1 | the room's whole existing suite passes unchanged against the legacy vocabulary, and with bindings added against the `v2` declarations; the six binding cases of section 3.6 and the cases of sections 2.3.1 and 2.3.2 pass; a mutation of each declaration field turns a test red; row-writes' measure shows no new rows per act |
| 3 | **Log and verify, first part.** Decoding by grammar; the legacy vocabulary for `v1`-era entries; kind, binding, body and `who` judged under `D(s)` | 1 | the legacy recovery fixture of section 3.2 passes on a fresh clone, and fails under the mutated verifier; verify passes on a log that activates a document adding a kind, and fails `kind-undeclared` and `binding-stale` on forged entries |
| 4 | **New primitives.** Thread settings, the overlap rule, scope slots and `scope-fixed`, `hand-over` with `reservation-ended`, `version` then `land`, unanchored comments, check jobs choosing their act and the `prepared` event; the Room migration | 2 | acceptance cases for each, including a reservation that ends while a `take` is in flight, and the check-mapping cases of section 2.3.3 |
| 5 | **Client, MCP, CLI, UI.** Generic act with binding; declarations read; generic rendering | 2 | an agent performs a declared act it was not built for, over HTTPS and MCP |
| 6 | **Verify's replay proof** (sections 4.3 to 4.8): the fold, required calls and rebuilt contexts, derived transitions, the named failures, and keeping every steps version (3.9) | 3, 4 | every adversarial fixture of section 4.7 fails with its named failure, an honest log passes, and the cases of section 3.9 pass |
| 7 | **The jam's declarations as a fixture,** in `examples/`, with the cases of section 7.4 and no jam code | 4, 5 | builder can judge self-hostability on it (assert `b2cdc44a`) |

Stages 2 and 3 can run in parallel, then stages 4 and 5. Stage 6 builds
the design of section 4; it does not stand in for it.

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
  (`notes/2026-08-08-first-ontology.md:147-150`). Section 3.7 has no
  fallback; the legacy vocabulary applies only to `v1` documents.
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
  Section 3.4 reserves names in the same way.
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
  a verifier. Section 3.6 adopts the expected binding as a signed field,
  per kind; revision 1 had declined it, and review `197f8511` showed why
  that was wrong.
- **Grants pin content.** "Grants pin exact capability content ids. A
  newer package never silently enlarges authority"
  (`notes/2026-09-14-evolving-spaces-design.md:617-618`). Section 2.3.2's
  delegations pin bindings for the same reason.
- **Cautions.** Writing models cheaply was the spike's "negative result"
  (`spike/REPORT.md:34`). This is why declarations here are limited to
  choosing steps, and why section 8 tests them with the jam before
  builder judges self-hostability (assert `b2cdc44a`).
