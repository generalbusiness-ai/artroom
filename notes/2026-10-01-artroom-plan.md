# Artroom: plan for the Cloudflare Git platform competition

2026-10-01. Revision 2, answering checker's review `c31169e9` of head
`8f85a0d5`. Request `7ff7a261`, promise `2bb1a40d`.

Artroom ("artifact workroom") is a place where agents and people change
code together. It runs on Cloudflare Workers, Durable Objects and
Artifacts. It replaces pull requests, review comments, and the hook and CI
plumbing around them with a small set of signed, ordered acts and a
policy file the repository owns.

This note covers:
- what we will build, and why;
- how it will be judged;
- the rules the system must keep;
- how we will stage the work.

Section 14 lists the decisions still open.

### What changed in this revision

| Review item | Where it is answered |
|---|---|
| P1.1 approval reuse | Section 7 |
| P1.2 landing and recovery | Section 8 |
| P1.3 authorization, policy activation and execution boundaries | Sections 9 and 10 |
| P1.4 secrets | Section 11 |
| P1.5 scope and capacity | Section 13 |
| P1.6 the API transitions | Section 5 |
| P2.7 evidence and claims | Sections 2 and 3, and labels on every target in section 12 |

## 1. The competition

**Sources:** the official rules ("Build the Next-Gen Git Platform on
Cloudflare Competition"), retrieved on 2026-10-01 from the URL in section
15. The PDF downloads with a browser user agent, and a copy can be
supplied on request. The second source is the announcement post of the
same date.

**Contest period.** 2026-10-01 09:00 EDT to **2026-10-14 23:59 PDT**. We
aim to submit on 2026-10-13.

**What to submit:**
- a 5–10 minute demonstration video;
- the source repository, under MIT, Apache 2.0 or BSD, with a LICENSE
  file (ours is Apache 2.0);
- instructions for running it.

**Hard requirements.** The project must use Cloudflare's developer
platform, "including Cloudflare Workers and Artifacts", and "must enable
multiple agents working on changes concurrently".

**Content limits:**
- Our own original work.
- No third-party copyrighted material.
- No personal attacks on anyone or on any discernible product. Every
  comparison in our material is factual and qualified.

**Scoring.** Each criterion is scored 1–5:

| Weight | Criterion | What it asks of us |
|---|---|---|
| 50% | Originality and quality of the prototype for agent-oriented software collaboration | An idea judges have not seen, built well enough to trust |
| 25% | Multi-agent concurrency, coordination, context preservation, review and conflict handling | Visible, measured behaviour with several agents at once |
| 25% | Ease of use and product/user experience | Easy to start, obvious to use, pleasant for agents and people |

Ties go to the first criterion.

**What happens next.** Three finalists present live, for ten minutes each,
at Cloudflare Connect on 2026-10-21. The winner must attend in person.

**Implication.** Simplicity is the baseline, not the differentiator. We
need one clear idea, shown working end to end, behind an interface a
judge can use in two minutes.

## 2. Evidence so far

**Sources:**
- gitseq report `6e13e7d5`;
- the harness at `~/play/gitseq-artifacts-spike`, commit `58dbdbf`;
- the Artifacts documentation.

These are baseline observations, not measurements of Artroom.

**Artifacts as a git store (measured).**
- Custom ref namespaces survive push and fetch.
- Fast-forward checks, `--force-with-lease` and `--atomic` behave
  correctly. In a 10-way race of fast-forward pushes, exactly one won.
- Repo tokens are read or write, can expire, and revoke immediately.
- Push events arrived in order, 0.2–0.9 s after the push, over 35
  events.

**Artifacts gaps we design around (measured):**
- Any write token can force-push.
- `read_only` is recorded but not enforced.
- About 5 in 70 repo or fork creations failed with an internal error
  (10400) and succeeded on retry.

**Documented limits:**
- 2,000 control-plane requests per 10 s per namespace;
- 2,000 git requests per 10 s per repository;
- 1 GB storage per repository;
- 32 MB per file or blob.

The Workers binding's `readTree` returns one level of a tree, so a
recursive diff has to be bounded and cached. The binding has no
conflict detector.

**A baseline for submitting acts (measured):**
- **HTTPS to a Durable Object: 132 ms p50 round trip** from one client
  in the New York area (Cloudflare colo EWR).
- **201 appends/s** with 32 closed-loop clients, with no gaps in the
  sequence.

That workload hashed the body and inserted one SQLite row. It did not
verify signatures, evaluate policy, track obligations, provision
workspaces, diff trees or publish anything. Carrying the same act by
`git push` took 1.9 s p50. So acts go to a Durable Object, and git
carries code. Full-system latency is **not yet measured**; spike
`0b50beed` is measuring it now.

**Review and conflict behaviour of a sequenced workflow (measured on
gitseq, not Artroom):**
- With 8 concurrent changes, reviews needed 1–11 attempts, because each
  verdict was pinned to the whole log's position.
- With 4 changes to the same line, recutting all losers at once gave a
  cascade: 6 of 10 approvals went to heads that then conflicted.

These are observations of gitseq's rules. They motivate Artroom's
design. They are not a measurement of any other product.

**gitseq ceremony, for context.** From 2026-09-10 to 2026-10-01 the
gitseq workroom recorded 1,521 events and 18 merges to main:
- 701 artifact statements, mostly one per changed path;
- about 600 retirement and ratification acts;
- 71 requests, 63 promises, 41 reports and 37 assertions.

22 of 41 review verdicts requested changes. These numbers show where
events go. They do not show that the ceremony caused the
changes-requested rate.

## 3. The state of the art, with sources

**Sources:** vendor documentation and changelogs as of 2026-10-01, linked
in section 15.

**GitHub.**
- **Agents.** Agents can be assigned work, and Copilot's coding agent
  opens one pull request per task.
- **Review.** Copilot code review comments, and can approve when an admin
  allows it.
- **Integrating work.** Stacked pull requests are in public preview. A
  merge queue tests merge groups.
- **Rulesets.** These can dismiss approvals when new commits arrive, or
  require approval of the latest push. Either way, an approval is kept or
  dismissed as a whole.

**Review assistants.**
- **CodeRabbit:** configured by `.coderabbit.yaml`, with path
  instructions and natural-language pre-merge checks. Each check is
  `off`, `warning` or `error`. Its documentation describes a per-pull
  request bypass.
- Graphite, Greptile, Qodo, Cursor Bugbot and others review a diff once
  it exists.

**Agent-context tools.** Entire records agent sessions with commits.
GitButler separates parallel agents' edits into virtual branches. jj
offers first-class conflicts and an operation log.

**Published research.** arXiv 2607.04697 (July 2026) studied 33,596 agent
pull requests. It reports conflict rates of 41.7% for co-active pairs
from different agents, and 19.8% for pairs from the same agent. The
rates come from replaying textual merges among sampled pairs that were
open at the same time. Cross-agent pairs were rare. The rates do not
describe all agent pull requests.

**What Artroom combines.** Each element below has partial precedents;
the combination is ours.
1. **Declared intent before code.** Claims with scopes, and overlap
   shown when a claim is made. GitHub and the review tools above start
   from a branch or pull request.
2. **Verdict reuse that explains itself.** Every verdict stays bound to
   the head it reviewed. A later proposal may carry it forward only
   under a stated rule, with the source head and reason shown (section
   7). This contrasts with keep-or-dismiss-whole rulesets.
3. **Repository-owned policy, enforced when acts are written.** A rule
   refuses an act or creates an obligation inside the sequencer, and the
   refusal names a fix.
4. **One attention queue per actor,** stating why each item is theirs.
5. **A collaboration record kept with the code,** published in Artifacts
   and verifiable offline up to its published high-water mark.

## 4. The workflow

There are seven acts, plus three lease and roster operations. Each act is
signed by its actor, ordered by the room, and permanent.

| Act | Who | What it means |
|---|---|---|
| `claim` | member | "I intend this goal, in this scope." Opens a lane with a lease |
| `propose` | lane holder | "This exact head is my next generation for this lane." |
| `note` | member | A comment anchored to path, line and head, or to an act; threaded |
| `review` | authorized reviewer | A verdict on one proposal generation and the scope reviewed |
| `check` | authorized checker | A machine result for one obligation, one generation and one integration tree |
| `land` | lane holder | "Merge this generation." Starts a landing operation the room carries out |
| `release` | lane holder | "I am giving this up," with an optional handover note |

**Other operations:**
- `renew` extends a lease.
- `roster` acts (admins only) add, remove and re-role members and keys.
- **System events,** signed by the room key, record lease expiry,
  landing outcomes, policy activation and publication checkpoints.

Each **room** is one repository with one sequencer, the Room Durable
Object. A **lane** is a claim and everything resting on it.

A clean change is four acts from its author and reviewers: `claim`,
`propose`, `review`, `land`. Checks are produced by checkers. For
comparison, the gitseq spike's clean lifecycle took six submissions
plus a land.

### Context preservation

- **Every act can link its reasons.** These are the acts and commits it
  rests on.
- **A claim carries its goal and plan.** A proposal carries the
  author's summary of the session that produced it.
- **A released lane keeps what was recorded:**
  - the claim;
  - each generation;
  - notes, verdicts and checks;
  - the handover note, if the holder wrote one.

  On lease expiry the room records the expiry. It does not invent a
  handover note.
- **Every judgement is replayable.** The policy version, rule inputs
  and outcome are recorded with each act.

## 5. The TypeScript API surface (essential)

Cloudflare presents its features as small, typed, composable TypeScript
surfaces: the Artifacts binding, Durable Object RPC stubs,
`WorkflowEntrypoint`, the Agents SDK. Artroom's API is a product surface
in its own right. The web UI, CLI, MCP tools, checkers and demo are all
built on it.

Lane 0 delivers the contract as `api.d.ts` plus a protocol note. It is
reviewed before any lane depends on it.

### Principles

1. **One vocabulary, every transport.** The acts and their types are the
   same over Worker RPC (service binding), HTTPS, WebSocket, the CLI and
   MCP. What differs per transport is listed under "Transports".
2. **Refusals are values; failures are exceptions.**
   - **A policy or invariant refusal** returns a `Refusal`: its rule,
     reason and fix.
   - **A transport, authentication or infrastructure failure** throws
     an `ArtroomError` with a `retryable` flag.
3. **Disposable handles.** `using room = …` releases only the client-side
   stub. It holds no server state, so a missed dispose leaks nothing.
4. **Immutable identities.**
   - Every act has a room-scoped ID, `act_<seq>_<hash8>`.
   - A lane's ID is its first claim's act ID.
   - A proposal is `(lane, generation)`, and each generation names an
     immutable head.
5. **Optimistic concurrency.** Acts that change a lane carry
   `expectedGeneration`. A stale generation is refused with
   `rule: "generation-moved"`.
6. **Async work has visible states.** Workspaces, merge previews, checks
   and landings are operations with states the caller can read, wait on
   or subscribe to.
7. **No new concepts where Cloudflare already has one:**
   - git transport: Artifacts;
   - code execution: Sandbox;
   - live updates: WebSocket hibernation;
   - long jobs: Workflows.

### The core types (abridged)

```ts
type ActId = `act_${number}_${string}`;
type LaneId = ActId;                          // the lane's first claim
type Generation = number;                     // proposal generation within a lane

interface Refusal { refused: true; rule: string; reason: string; fix?: string; act?: ActId }
type Result<T> = T | Refusal;

interface Claim {
  id: ActId; lane: LaneId; goal: string; scope: Glob[];
  lease: { holder: ActorId; generation: number; expiresAt: string };
  overlaps: Overlap[];                         // computed immediately
}
interface Proposal {
  lane: LaneId; generation: Generation; head: Sha;   // immutable
  pinnedRef: string;                           // refs/artroom/heads/<lane>/<generation>
  changed: PathChange[];                       // actual changes, with old and new paths for renames
  obligations: Obligation[];
  preview: Op<"pending" | "clean" | "conflict", { paths?: string[]; integration?: Sha }>;
}
interface Op<S extends string, D = {}> { id: string; state: S; detail: D; updatedAt: string }
```

### The room

```ts
using room = await env.ARTROOM.room("acme/web");   // the caller's identity comes from its credentials

const claim = await room.claim({ goal: "Rate-limit /api/login",
  scope: ["src/api/login.ts", "src/lib/ratelimit/**"], because: [issueRef] });
if (isRefusal(claim)) return explain(claim);       // e.g. "scope-owned", fix: "ask @security"

const ws = await room.workspace(claim.lane);       // Op: pending → ready { remote, token, expiresAt }
// The agent pushes with plain git to ws.remote. The token is scoped to its fork and its lease.

const p = await room.propose(claim.lane, { head, expectedGeneration: 0, summary });
if (isRefusal(p)) return explain(p);               // e.g. "outside-claim": changed paths exceed the scope

const r = await room.review({ lane: claim.lane, generation: p.generation },
  { verdict: "approve", scope: ["src/api/**"], dependsOn: ["src/lib/authz/**"], text: "…" });
if (isRefusal(r)) return explain(r);               // e.g. "not-authorized-reviewer"

const land = await room.land({ lane: claim.lane, generation: p.generation });
if (isRefusal(land)) return explain(land);         // e.g. "obligation-open: check tests"
await room.wait(land.op, { until: ["landed", "retryable", "failed"] });

await room.renew(claim.lane);                       // or room.release(claim.lane, { note })
```

**Attention and the log** are paginated and resumable:
- `room.attention({ cursor, limit })` returns `{ items, cursor }`.
- `room.log({ after, limit })` returns `{ acts, cursor, publishedThrough }`.
- Live updates use `room.subscribe(cursor)`. It is a WebSocket in the
  browser, a long poll over HTTPS, and an `attention` call with a cursor
  in MCP. It is not a cross-transport async iterator.

**Other reads:**
- `room.lane(id)`;
- `room.lanes(filter)`;
- `room.explain(actId)`: the rules applied, their inputs and outcomes.

### Lane transitions

| Transition | Rule |
|---|---|
| `claim` on a new scope | New lane, generation 0, lease starts |
| `claim` on an existing lane (scope change) | Holder only; `expectedGeneration`; overlap recomputed; obligations recomputed if paths change |
| `propose` | Holder only; `expectedGeneration` must match; makes generation n+1; earlier generations stay readable |
| `review` / `check` | Bound to `(lane, generation)`; a check also binds the integration tree and checker configuration |
| `land` | Holder only; starts a landing operation (section 8) |
| `release`, or lease expiry | Lane becomes unheld; workspace token revoked; next holder claims it with a new lease generation |
| Recut after conflict | The holder owns it. If the lease lapsed, the lane appears in other members' attention queues |

### Transports and credentials

| Caller | Credential | How acts are signed |
|---|---|---|
| Browser | Ed25519 key made in the browser (WebCrypto), bound by an invitation; GitHub sign-in can link later | The browser signs each envelope |
| CLI or script | Key file made by `artroom login` from an invitation | The client signs each envelope |
| MCP agent | Bearer token from an invitation, bound to a room-held agent key with a delegation | The room signs for the agent under that delegation, recorded in each act |
| Worker (service binding) | A delegation key held as a Worker secret | The calling Worker signs; the `as` option only chooses among its delegations |

### MCP tools

`claim`, `workspace`, `renew`, `release`, `propose`, `note`, `review`,
`land`, `attention`, `explain`. These cover the demonstrated loop. A
coding agent needs the MCP URL and `git`.

### Policy

Policy lives at `.artroom/policy.json`: data in a pinned, restricted
JSONata profile (section 10). TypeScript helpers compile to it.

```ts
import { policy, owners, requireCheck, requireReview, carry, lanes, rule } from "artroom/policy";
export default policy(
  owners({ "migrations/**": "@db", "src/api/**": "@security" }),
  requireCheck("tests", { paths: "src/**", by: "@ci" }),
  requireReview({ paths: "src/api/**", from: "@security" }),
  carry({ globalInputs: ["package.json", "package-lock.json", "tsconfig*.json", "wrangler.*", ".artroom/**"] }),
  lanes("by-scope"),
  rule({ id: "claim-before-propose", on: "propose", refuse: "$not(lane.claimed)", fix: "Claim the paths first." }),
);
```

There are five kinds of rule:

| Kind | Evaluated | Effect |
|---|---|---|
| `refuse` | When an act arrives, before it is recorded | The act is refused, with the rule's fix |
| `require` | On `propose` and at policy activation | Obligations, each naming who may fulfil it |
| `carry` | On a new generation | Whether earlier verdicts and checks may count as evidence (section 7) |
| `land` | On `land`, and again before publication | Whether the generation may merge |
| `notify` | After recording | Who sees the act in their attention queue |

**Policy cannot override the invariants in sections 7–11,** which are
platform code.

### Checkers

A checker is a service actor with a delegation. It fulfils `require`
obligations with `check` acts, under the isolation rules in section 9.

```ts
export class Tests extends Checker<Env> {
  name = "tests";
  inputs = ["src/**", "package*.json"];         // used by the input-equivalence rule
  async run(job: CheckJob): Promise<CheckOutcome> {
    // job: proposal, generation, integration commit, a read-only URL and token
    const box = getSandbox(this.env.RUNNER, job.id);
    await box.exec(`git init w && cd w && git fetch --depth 1 ${job.readUrl} ${job.integration}`);
    await box.exec(`cd w && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = ${job.integration}`);
    const run = await box.exec("cd w && npm ci && npm test");
    return { ok: run.exitCode === 0, detail: run.stdout.slice(-4000) };
  }
}
```

The `Checker` base class signs the `check` act outside the sandbox.

## 6. Architecture

```
agents / people ── HTTPS, WebSocket, MCP ──► Worker ──RPC──► Room (Durable Object, one per repo)
        │                                                     │  SQLite: acts, lanes, obligations, operations
        │ git push (code only, fork token)                    │  restricted JSONata policy
        ▼                                                     │
   Artifacts fork (one per lane) ◄── fork, scoped token ──────┤
                                                              │ pin, diff (binding), preview, land
                   Publisher sandbox (git only, no repo scripts) ◄─┤
                                                              ▼
           Artifacts canonical repo: main, refs/artroom/heads/*, refs/artroom/log
   Check runners (separate sandboxes, read-only access) ◄── checker services ──► Room
```

**The room** is a Durable Object. It:
- holds the authoritative log and operation state in SQLite;
- evaluates policy;
- answers each act after its SQLite write commits;
- publishes the log to `refs/artroom/log` in batches, as signed commits
  that carry a high-water mark.

**Code moves only by git.** A lane gets an Artifacts fork and a write
token scoped to that fork and lease. On `propose`, the room copies the
head into the canonical repo as `refs/artroom/heads/<lane>/<generation>`.
A force-push to the fork cannot erase a proposed head.

**Diffs.**
- **Path-level diffs** use the Artifacts binding. A recursive comparison
  skips any subtree whose hash is unchanged, caches by tree hash, and is
  bounded in depth and entry count. A diff over the bound is refused as
  "too large to evaluate".
- **Content previews and merges** run in the publisher sandbox with real
  git, only when paths overlap or at landing.

**Only the room's publisher writes `main`.** No member holds a write
token for the canonical repository.

**Scale.** One room per repository is the single sequencer. Sharding
rooms by lane is a future design question, because main, policy and
cross-lane dependencies stay shared.

## 7. Verdict and check reuse (answers P1.1)

**The invariant.** A verdict or check is permanently bound to the
generation, head and (for checks) integration tree it judged. Nothing
mutates it.

Policy may let an earlier verdict **count as evidence** for a later
generation, but only under the `carry` rule. The UI always shows each
piece of evidence as either "reviewed here" or "carried from generation
n, head `abc123`, because …".

### Carrying a verdict forward

A verdict from generation n counts for generation m only if all of these
hold:
1. Between the two heads, no changed path, old or new, falls in the
   verdict's **reviewed scope**.
2. No changed path falls in the verdict's **declared dependencies**
   (`dependsOn`). The reviewer declares these; policy can add defaults
   per area.
3. No changed path is a **global input**: dependency manifests,
   lockfiles, build and deploy configuration, `.artroom/**`, and
   anything else policy lists.
4. The active policy version is the same, or the new policy version
   still accepts this verdict when re-evaluated.

Otherwise the verdict stays visible as history, and the obligation
reopens.

### What path rules cannot see

Path rules cannot detect a semantic dependency nobody declared. An
unchanged `login.ts` can become unsafe when an undeclared helper it
imports changes. That is why carrying is policy-controlled and visible,
never silent. A room can turn it off by setting `carry({ verdicts:
false })`.

### Carrying a check forward

A required check binds to the exact integration commit it ran on, and to
a hash of the checker's configuration. After any change to the
integration (a new generation, or main moving), the check reruns. The
exception is when the checker's declared `inputs` hash to the same tree
in both integrations, and the checker configuration hash is unchanged.
That is the input-equivalence rule; every carried check shows that it
was carried.

### Acceptance cases (in the policy corpus)

| Case | Expected result |
|---|---|
| A new generation changes `src/lib/authz/check.ts`; the approval of `src/api/login.ts` declared `dependsOn: src/lib/authz/**` | Approval not carried; review obligation reopens |
| Same change, no `dependsOn` declared, and the room's default lists `src/lib/**` as shared | Not carried |
| Same change, no declaration and no default | Carried, shown as "carried: reviewed and declared paths unchanged". The policy dry-run highlights the case |
| A change to `package-lock.json` | Nothing carried (global input) |
| A change to `.artroom/policy.json` | Nothing carried; also needs admin review (section 9) |

## 8. Landing, publication and recovery (answers P1.2)

A Durable Object processes one event at a time. While it awaits external
I/O, other requests can interleave. It is not a transaction across
SQLite and git. So landing is a durable state machine, and every step
that follows an `await` re-checks its preconditions.

### The landing operation

The record is written to SQLite before any external I/O:

```
LandOp {
  id, lane, generation, head,
  expectedMain, policyVersion, leaseGeneration,
  integration?: Sha, evidence: ActId[],
  state, attempts, updatedAt
}
```

States:
- `accepted` → `preparing` (build the integration commit, run the
  preview and required checks against it) → `ready`;
- `ready` → `publishing` (compare-and-swap main from `expectedMain` to
  `integration`) → `landed`;
- any step → `retryable` (main moved, a check reran, or a generation,
  policy or lease changed);
- any step → `failed` (a conflict that needs a recut, or a refusal).

**Preparing runs in parallel; publishing runs one at a time.**
- **Preparation runs in parallel.** Several operations build and check
  their integration commits against the same main M at once.
- **Publication is serialized per room.** A single publisher takes
  `ready` operations in order and pushes each one with
  `--force-with-lease=main:<expectedMain>`.
- **When main moves.** After one operation lands, every other `ready`
  operation sees main move from M to M'. It goes back to `preparing`,
  building a new integration on M'.
- **What lands is what was checked.** Checks rerun on the new
  integration unless the input-equivalence rule in section 7 applies. So
  the commit that lands is always the commit that was checked.
- **Batching is an optional extension.** It would integrate several
  disjoint ready operations into one commit and check it once. It uses
  the same invariants.

### Fencing

Before publishing, the publisher re-reads all of these from SQLite, and
abandons the attempt (state `retryable`) on any mismatch:
- the lane's generation;
- its lease generation;
- the active policy version;
- the evidence set.

A release, a new generation or a policy activation during preparation
therefore cannot be overtaken by a stale push.

### Crash and timeout recovery

On restart, an alarm reconciles every operation in `publishing` by
reading canonical main:

| Main is | Meaning | Action |
|---|---|---|
| `expectedMain` | The push never happened | Retry the publication |
| `integration` | The push happened, the receipt did not | Write the `landed` receipt; no second push |
| Anything else | Someone else landed first | `retryable` |

A timeout during a push is handled the same way: before any further
attempt, the operation is reconciled against canonical main.

### Publication of the log

- **The room publishes in batches.** Each publication commits the log
  up to sequence number N to `refs/artroom/log`, and records N as
  `publishedThrough`.
- **The lag is visible.** The API and UI show `publishedThrough` and the
  publication lag.
- **`artroom verify <remote>` checks what was published, offline.** It
  proves the integrity of that published prefix. It cannot prove
  completeness of acts the room has not yet published.

### Acceptance cases (each a test in the owning lane)

- A crash before push, and after push but before the receipt.
- Two operations preparing in parallel. One lands; the other
  re-prepares and lands on top, and both changes survive.
- A release, a new generation and a policy activation, each during
  preparation.
- A lease race on publication: exactly one publisher wins.

## 9. Authorization and execution boundaries (answers P1.3)

### The signed envelope

```
{ v: 1, room, actor: keyId, kind, target, body, idempotencyKey, delegation? }
```

- It is canonicalized with JSON Canonicalization Scheme (RFC 8785) and
  signed with Ed25519.
- The room takes the actor's identity from the verified signature,
  never from an `as` field.
- An idempotency key reused with a different payload is refused
  (`rule: "idempotency-mismatch"`).

### Membership and roles

**A room's genesis names its first admin key.** Roster acts by admins
add or remove members and keys, and set roles: `admin`, `maintainer`,
`member`, `agent` and `checker`.

| Mechanism | Rule |
|---|---|
| Invitations | Single-use and expiring. Each binds one new key to one role |
| Key revocation | A roster act. The room refuses acts signed after it |
| Delegations | A key grants another key a subset of act kinds, lanes and an expiry. Delegations cannot grant roles |

### Platform invariants that policy cannot change

1. **A `review` must come from a member whose role or ownership the
   obligation names.** By default an author cannot fulfil a review
   obligation on their own lane; a room may allow this only for
   documentation scopes.
2. **A `check` must come from a checker identity or delegation that the
   obligation names, for the exact generation and integration tree.** A
   claimant cannot satisfy its own required check by signing one.
3. **Ownership and requirements are computed from the proposal's actual
   changed paths,** old and new for renames, not from the claim's scope.
   A proposal that changes paths outside its claim is refused
   (`outside-claim`, fix: "extend the claim"). It cannot hide a
   sensitive change.
4. **Claim patterns use a restricted glob syntax:** literal segments,
   `*` and `**`. Overlap between two patterns, including for files that
   do not exist yet, is computed conservatively. It may report an
   overlap that is not real. It never misses one.
5. **A proposal that touches `.artroom/**` needs an approval from an
   `admin` under the currently active policy, whatever that policy
   says.** Admins can always change the roster and policy. This is the
   fixed recovery boundary.
6. **Policy activation is a system event at the sequence number where
   the policy change lands.** From then on:
   - obligations on open proposals are recomputed;
   - carried evidence is re-evaluated (section 7);
   - landing operations prepared under the old version are fenced and
     re-prepared (section 8).

### Leases

- **Renewal.** A claim's lease is renewed by `renew` or by any act from
  the holder on that lane.
- **Expiry.** It is a system event raised by the room's alarm. It bumps
  the lease generation, revokes the lane's workspace token through
  Artifacts, and leaves the recorded context in place.
- **Fencing.** An act from a previous holder carries the old lease
  generation and is refused.

### Execution isolation

- **Two kinds of sandbox.** The publisher sandbox runs git only. It runs
  with `core.hooksPath=/dev/null`, executes no repository scripts, and
  receives a canonical write token only for the duration of one
  publication.
- **Check runners run untrusted code** in separate sandboxes. They get a
  read-only token, never a write token or any signing key.
- **The runner proves what it checked out.** It fetches the exact pinned
  ref, then confirms that `HEAD` equals the integration commit before
  running anything. The example in section 5 shows this.
- **The checker service signs the `check` act outside the sandbox.**

## 10. The policy runtime (answers P1.3, evaluator part)

- **Port atseq's isolated evaluator,** `src/runtime/evaluator.ts` and
  its profile in `docs/runtime-profile.md`, with its budgets intact:
  - AST depth and size;
  - evaluator visits;
  - intermediate sequence sizes;
  - bytes inspected.

  The function allowlist stays. Nothing uses the clock, randomness or
  I/O.
- **Pin the `jsonata` interpreter version and the profile version.**
  Record both with every decision.
- **Port atseq's conformance corpus.** Add Artroom's rule-kind cases,
  including the acceptance cases in sections 7–9.
- **Two distinct outcomes:**
  - **A deterministic refusal** (`policy-budget-exceeded`,
    `policy-type-error`) is a recorded domain outcome. Replay gives the
    same result.
  - **A runtime failure** (Worker CPU limit, out of memory) is
    infrastructure. The act is not recorded, and the caller gets a
    retryable `ArtroomError`. The Worker CPU limit is a backstop, not
    the budget.
- **Replace atseq's Node-only integrity adapter** with a WebCrypto
  implementation.

## 11. Secrets in notes and acts (answers P1.4)

**The first build:**
- **Detection before recording.** Every act body is scanned before it
  is recorded and published. The scan uses common credential formats
  and an entropy check on long tokens.
- **Rejection with a fix.** A detected secret refuses the act, with the
  fix "remove the secret; rotate it if it was shared elsewhere".
- **The limits are documented.** Detection is incomplete. A secret it
  misses becomes part of a signed, published, clonable log, and cannot
  be hidden from it. The only remedy is to rotate the credential, and
  the README says so.

**A later extension.** The log could hold only a commitment, the hash of
a body stored separately. The body could then be deleted later. Offline
verification would prove the commitment, not the deleted body. This is
a staged item in section 13, not part of the first build.

## 12. Ease of use, performance, scale and edge cases

### First five minutes
1. **Install.** `npm create artroom@latest` deploys to the user's
   account; a hosted instance is also available.
2. **Import.** `artroom import github.com/org/repo` uses Artifacts'
   import.
3. **Invite.** The admin invites people and agents. Invitations carry
   the role, and Artroom generates an `AGENTS.md` block for the
   repository.
4. **Connect an agent.** Add the MCP URL to the agent; one line.

### Screens

1. **Needs you.** The attention queue.
2. **Room.** Claims, lanes, overlaps, landing operations and
   publication lag, live.
3. **Proposal.**
   - the diff;
   - notes;
   - obligations as a checklist;
   - each piece of evidence, marked reviewed here or carried, with the
     reason;
   - the "why" links.
4. **Policy.** The rules, recent outcomes, and a dry run of a draft
   rule against history.

### Targets

All targets below are **unmeasured until their lane reports**. Each
report will state:
- the workload size and the client's location;
- sample counts, with p50 and p99;
- retries;
- cold or warm state;
- fork provisioning time;
- the Artifacts and container cost.

| Measure | Target |
|---|---|
| Act answered, p50 / p99, with 10 concurrent agents running full workflows | ≤ 300 ms / ≤ 1 s |
| Overlap shown on `claim` | ≤ 300 ms |
| Workspace ready (fork and token) | ≤ 5 s p50 |
| Merge preview | ≤ 10 s p50 |
| Landing of disjoint ready operations | ≥ 10 per minute |
| Live UI update after an act | ≤ 1 s |
| Claim throughput benchmark: 100 simulated agents, 1,000 claims | Gapless log, no lost update. This is not 100 concurrent coding workflows |
| Controlled serialized-recut scenario | Zero approvals spent on heads already known to conflict. Reviewer waiting time and throughput reported alongside |

### Edge cases and their owners

Each edge case is tested in the lane that owns it. None is saved for the
end.

| Edge case | Owner |
|---|---|
| Lease expiry and fencing | Room |
| Fork force-push or deletion | Git: pinned heads |
| Duplicate submission | Room: idempotency |
| Restart during publication | Git and landing |
| Artifacts 10400 errors or timeouts | Git: bounded retry, visible state |
| Large diffs | Git: bounded traversal |
| Renames across claims | Policy: old and new paths |
| Detected secrets | Room |
| Policy activation | Policy and landing |
| Concurrent approve and object | Policy: `land` rules |
| Rate limits (namespace and repository) | Git: the room throttles itself |

## 13. Scope, capacity and staging (answers P1.5)

**Scope.** On 2026-10-01 hugh directed that schedule estimates do not
limit functionality (planner assert `19a32703`). The complete scope in
this note stays in scope. What follows is a staging order and a way to
track progress, not a list of cuts. hugh and planner review progress at
each gate.

**Capacity:**
- **planner and builder** are one agent session (Claude). It dispatches
  implementation agents, each in its own worktree. It signs all workroom
  acts.
- **checker** reviews independently, every head.
- **Implementation lanes run at most two at a time until the vertical
  slice passes,** as checker recommends. After the slice, up to four
  run, if integration and review keep pace.

### Gate 1: the deployed vertical slice

**Target: by 2026-10-05 18:00 PDT.** One repository, on workers.dev,
with:
- `claim`, then a workspace (fork and token), then `git push`;
- `propose` with pinning, then `review` and one `check`, from a real
  runner;
- a safe `land` through the landing operation;
- the attention queue;
- `artroom verify` on a fresh clone.

Two agent clients take part, plus the Room, Proposal and Needs-you
screens.

**The observable result** is a recorded run of that loop on the
deployed instance, from two agents. If it has not passed by then,
planner and hugh decide the next staging. Scope is not cut
automatically.

**Staging after the slice, in order:**
1. Policy pack with `carry` and the corpus.
2. Parallel preparation with serialized publication.
3. Leases and handover.
4. MCP polish.
5. Policy screen and dry run.
6. Second checker and LLM reviewer.
7. OAuth sign-in.
8. Automatic re-anchoring of notes.
9. Removable bodies (section 11).
10. GitHub mirror.
11. The conventional-workflow model for the demo.
12. Scale runs.
13. `npm create artroom`.

A container fallback (isomorphic-git) is separately tested if it is
needed. It would restrict scope; it does not replace the container
path.

### Work estimate (engineer-days)

| # | Lane | Days | Depends on |
|---|---|---|---|
| 0 | Contract: `api.d.ts`, envelope, IDs, transitions, refusals, protocol note | 2 | Plan approval |
| A | Room: SQLite log, envelope verification, roster and delegations, idempotency, leases, subscriptions | 3 | 0, spike `0b50beed` |
| B | Git: forks and tokens, pinning, bounded diffs, preview, landing operations, recovery | 4 | 0, spike `469a7ab8` |
| C | Policy runtime: evaluator port, budgets, corpus, five rule kinds, `explain` | 2.5 | 0 |
| D | Policy pack and `carry` rules, with the section 7 cases | 2 | C |
| E | Client, CLI, MCP | 2 | 0 |
| F | Web UI | 4 | 0; A for live data |
| G | Checkers and runner isolation | 2.5 | B |
| L | Log publication and `artroom verify` | 1.5 | A |
| H | Demo harness, benchmarks, conventional-workflow model | 3 | slice |
| J | Onboarding and hosted instance | 2 | slice |
| K | Video, README, submission | 1.5 | all |
| R | Integration reserve | 2 | — |
| | **Total** | **32** | |

The range is wide: lanes B and G depend on integrations the spikes have
not yet proven. Spikes `469a7ab8` (Sandbox git) and `0b50beed` (Room
core) are running now. Their reports will update these numbers.

## 14. Open decisions

Checker's views (review `c31169e9`) are recorded. Planner's resolution
follows each.

1. **Policy language.** Bounded JSONata data with TypeScript helpers.
   Authorization and persistence invariants stay in platform code.
   **Adopted.**
2. **Runtime reuse.** Reuse atseq's isolated evaluator and admission
   checks, with pinned dependencies and conformance vectors. Do not take
   the application runtime or its Node-only adapters. **Adopted.**
3. **Log format.** A versioned Artroom format. Its definition includes:
   - canonical bytes;
   - room genesis;
   - membership;
   - signatures;
   - a sequence and hash chain;
   - retained policy inputs;
   - system receipts;
   - checkpoints.

   It is defined in lane 0 before offline verification is promised.
   **Adopted.**
4. **Hosting.** Start on workers.dev in hugh's account, with a
   quota-limited demo room. Artifacts is confirmed working there. Sandbox
   is being confirmed by spike `469a7ab8`. **Open for hugh:** whether a
   custom domain is wanted.
5. **Actors.** checker reviews; at most two implementation lanes until
   the slice passes. **Adopted.**
6. **Packages.** An owned npm scope at first, for example
   `@generalbusiness/artroom`. **Open for hugh:** the scope name.

## 15. Sources

Competition:
- Official rules: <https://www.cloudflare.com/documents/build-next-gen-git-platform-competition-terms.pdf>
- Announcement: <https://blog.cloudflare.com/next-git-platform-on-cloudflare/>

Cloudflare platform:
- Artifacts: <https://developers.cloudflare.com/artifacts/>
  - Workers binding: <https://developers.cloudflare.com/artifacts/api/workers-binding/>
  - Limits: <https://developers.cloudflare.com/artifacts/platform/limits/>
- Durable Objects rules: <https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/>
- Sandbox (Containers and Dynamic Workers): <https://developers.cloudflare.com/sandbox/>
- Agents SDK and MCP handlers: <https://developers.cloudflare.com/agents/>

GitHub:
- Copilot code review: <https://docs.github.com/en/copilot/concepts/agents/code-review>
- Stacked pull requests: <https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/>
- Rulesets: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- Merge queue: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>

Review assistants:
- CodeRabbit pre-merge checks: <https://docs.coderabbit.ai/pr-reviews/pre-merge-checks>
- CodeRabbit configuration reference: <https://docs.coderabbit.ai/reference/yaml-template>

Research:
- Agent pull request overlap and conflict study: <https://arxiv.org/abs/2607.04697>

Our own evidence:
- gitseq spike report: event `6e13e7d5` in the gitseq workroom
- Spike harness and results: `~/play/gitseq-artifacts-spike` (commit `58dbdbf`)
- Checker's review of revision 1: event `c31169e9` in this workroom
