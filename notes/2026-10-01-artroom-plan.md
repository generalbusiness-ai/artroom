# Artroom: plan for the Cloudflare Git platform competition

2026-10-01. Draft for checker's review. Request `7ff7a261`, promise `2bb1a40d`.

Artroom ("artifact workroom") is a place where agents and people change
code together. It runs on Cloudflare Workers, Durable Objects and
Artifacts. It replaces pull requests, review comments, and the hook and CI
plumbing around them with a small set of signed, ordered acts and a
policy file the repository owns.

This note says what we will build, why, how it will be judged, how we will
spend the 13 days, and what we have not decided yet. Section 13 lists
decisions for review.

## 1. The competition

Source: Cloudflare's official rules for the "Build the Next-Gen Git
Platform on Cloudflare Competition" and its announcement post, both
published 2026-10-01.

**Deadline.** The submission must arrive by **2026-10-14, 23:59 PDT**. We
aim to submit on 2026-10-13.

**What to submit:**
- a 5–10 minute demonstration video;
- the source repository, under MIT, Apache 2.0 or BSD, with a LICENSE
  file (ours is Apache 2.0);
- instructions for running it.

**Hard requirements:**
- Built on Cloudflare's developer platform, including Workers and
  Artifacts.
- It "must enable multiple agents working on changes concurrently".

**Content limits:**
- Our own original work.
- No third-party copyrighted material.
- No personal attacks on anyone or on any discernible product. We may
  compare with existing tools only factually and without disparaging
  them.

**Scoring.** Each criterion is scored 1–5:

| Weight | Criterion | What it asks of us |
|---|---|---|
| 50% | Originality and quality of the prototype for agent-oriented software collaboration | An idea judges have not seen, built well enough to trust |
| 25% | Multi-agent concurrency, coordination, context preservation, review and conflict handling | Visible, measured behaviour with many agents at once |
| 25% | Ease of use and product/user experience | Easy to start, obvious to use, pleasant for agents and people |

Ties go to the first criterion.

**What happens next.** Three finalists present live, for ten minutes each,
at Cloudflare Connect on 2026-10-21. The winner must attend in person.

The announcement asks for "GitHub as it exists today with agents added on
top" to be avoided. It names repositories, branches, pull requests,
worktrees, code review, merge conflicts, preserving agent context, and
"compare multiple changes at the same time, and decide which one should
ship".

**Implication.** Simplicity is the baseline, not the differentiator.
The field will be strong. We need one clear idea, shown working under
load, behind an interface a judge can use in two minutes.

## 2. What we already know

The gitseq spike on 2026-10-01 measured Artifacts and a sequenced workflow
directly. The evidence is gitseq report `6e13e7d5` and the harness at
`~/play/gitseq-artifacts-spike` (commit `58dbdbf`). Its facts govern this
plan.

**Artifacts works as a git store.**
- Custom ref namespaces survive push and fetch.
- Fast-forward checks, `--force-with-lease` and `--atomic` behave
  correctly. In a 10-way race exactly one push won.
- Repo tokens are read or write, can expire, and revoke immediately.
- Push events arrive in order 0.2–0.9 s after the push.

**Artifacts has gaps we must design around.**
- Any write token can force-push, so only the platform may hold write
  access to the canonical repository.
- `read_only` is recorded but not enforced.
- About 5 in 70 repo creations failed with an internal error (10400) and
  needed a retry.

**Speed decides the architecture.**

| Route | p50 per act | Throughput |
|---|---|---|
| HTTPS to a Durable Object | 0.13 s | 201 appends/s, no gaps |
| An act carried by `git push` | 1.9 s | — |

So acts go to a Durable Object, and git carries only code.

**Concurrency costs come from workflow rules, not from storage.**
- With 8 concurrent changes, reviews needed 1–11 attempts, because each
  verdict was pinned to the whole log's position.
- With 4 changes to the same line, a racing recut cascade wasted 6 of 10
  approvals. The same 4 changes took 239 Artifacts operations, against
  113 when they touched different files.

**gitseq's ceremony is too heavy for this.** The gitseq workroom has
averaged about 84 events per merge since 2026-09-10. 54% of reviews
requested changes.

**What we keep from gitseq:**
- signed acts;
- a single writer per scope;
- verdicts bound to an exact head;
- "why" links between acts;
- staleness as a signal, not an error;
- a log anyone can audit.

**What we leave behind:**
- per-path artifacts;
- retirement bookkeeping;
- whole-log frontier pinning;
- the promise ceremony.

## 3. The state of the art, stated factually

These facts come from vendor documentation and changelogs as of
2026-10-01. The main sources are listed in section 14.

**GitHub.**
- **Agents.** Agents can be assigned work, and Copilot's coding agent
  opens one pull request per task.
- **Review.** Copilot code review comments, and can approve when an admin
  allows it.
- **Integrating work.** Stacked pull requests are in public preview. A
  merge queue tests merge groups.
- **Rulesets.** These can dismiss approvals when new commits arrive, or
  require approval of the latest push. Either way it is all or nothing.

**Review assistants.**
- **CodeRabbit:** configured by `.coderabbit.yaml`, with path
  instructions and natural-language pre-merge checks. Each check is
  `off`, `warning` or `error`, and can be bypassed for a pull request.
- Graphite, Greptile, Qodo, Cursor Bugbot and others review a diff after
  it is opened.

**Agent-native version control.** Tools like Entire, GitButler and jj
record agent context or untangle parallel edits. None records who intends
to change what before the code exists.

**Published evidence.** A July 2026 study of 33,596 agent pull requests
(arXiv 2607.04697) found that 79.4% overlap in time with another agent's
pull request. Conflict rates were 41.7% between different agents and 19.8%
within one agent. GitHub's own engineering blog (2026-05-07) says review
capacity has not kept pace with agent throughput.

**What no one offers, and Artroom will:**
1. **Intent before code.** An agent claims a goal and a scope first.
   Overlaps are visible and ordered before anyone writes a line.
2. **Verdicts that last as long as they are true.** An approval survives
   a new commit unless that commit touches what the reviewer reviewed.
3. **Policy as data, enforced when the act is written.** A rule in the
   repository refuses an act or creates an obligation. A comment cannot
   bypass it.
4. **One queue of what needs each person or agent, and why.**
5. **Parallel landing of disjoint work.** Only real overlaps queue.
6. **Collaboration history you can clone and verify,** next to the code,
   in Artifacts.

## 4. The workflow

There are seven acts. Each is signed by its actor, ordered by the room,
and permanent.

| Act | Who | What it means | Replaces |
|---|---|---|---|
| `claim` | agent or person | "I intend this goal, in this scope." | Nothing comparable today |
| `propose` | the claimant | "This exact head meets my claim." | Opening a pull request |
| `note` | anyone | A comment anchored to path, line and head, threaded | Review comments |
| `review` | a reviewer | A verdict on an exact head, scoped to the paths reviewed | Reviews |
| `check` | a checker | A machine result for one obligation | CI statuses |
| `land` | the claimant | "Merge this head." The room performs it | Merge button, merge queue |
| `release` | the claimant, or a lapsed lease | "I am giving this up," with a handover note | Closing a pull request |

A clean change is four acts from its author and its reviewer: `claim`,
`propose`, `review`, `land`. Checks arrive by themselves. For comparison,
the gitseq spike's clean lifecycle took six submissions plus a land.

Each **room** is one repository with one sequencer. Inside it, work moves
in **lanes**: a claim and everything resting on it.

### Context preservation

Context is carried by the room, not by any one agent's memory.
- **Every act can say why.** It links to the acts and commits it rests
  on.
- **A claim carries its goal and plan.** A proposal carries a summary of
  the session that produced it.
- **A released lane keeps everything.** It holds the claim, notes,
  verdicts, checks and handover note. The next agent picks it up from the
  room, not from a transcript.
- **Every judgement is replayable.** The policy that judged each act is
  recorded with it.

## 5. The TypeScript API surface (essential)

Cloudflare presents its features as small, typed, composable
TypeScript surfaces. Examples are the Artifacts binding
(`env.ARTIFACTS.get(name)` returning a disposable repo), Durable Object
RPC stubs, `WorkflowEntrypoint`, and the Agents SDK. Artroom must feel
like one of these. The API is a product surface in its own right, and
everything else is built on it: the web UI, the CLI, the MCP tools, the
checkers and the demo.

### Principles

1. **One vocabulary, every transport.** The seven acts have the same
   names and types whether called through:
   - Worker RPC (a service binding or Durable Object stub);
   - HTTPS and WebSocket;
   - the CLI;
   - MCP tools.
2. **Typed results; refusals are values.** Every act returns its record
   or a `Refusal`. The refusal names the rule, the reason and the fix,
   so callers branch on data rather than parsing errors.
3. **Disposable handles,** like the Artifacts binding: `using room =
   ...`.
4. **Composable policy.** Policy is plain data, authored with small typed
   helpers that compose. The repository owns it.
5. **No new concepts where Cloudflare already has one.**
   - git transport: Artifacts repos and tokens;
   - code execution: Sandbox containers or Dynamic Workers;
   - live updates: WebSocket hibernation;
   - long tasks: Workflows.

### Deploying and binding

The `artroom` package exports a Durable Object class and a default
Worker.

```ts
// Self-hosted: src/index.ts
import { Room, artroom } from "artroom";
export { Room };                        // one Durable Object per repository
export default artroom({ ui: true });   // HTTP, WebSocket, MCP, Artifacts events
```

```jsonc
// wrangler.jsonc
{
  "durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "Room" }] },
  "artifacts": [{ "binding": "ARTIFACTS", "namespace": "artroom" }],
  "containers": [{ "class_name": "GitSandbox", "image": "./sandbox" }]
}
```

Another Worker, such as a team's own bot, binds to a deployed Artroom
with a service binding and calls it over RPC.

### The room

```ts
using room = await env.ARTROOM.room("acme/web", { as: actor });

const claim = await room.claim({
  goal: "Rate-limit /api/login",
  scope: ["src/api/login.ts", "src/lib/ratelimit/**"],
  because: [issueRef],                  // why: links to acts or commits
});
if (isRefusal(claim)) throw claim;      // e.g. rule "scope-owned", fix "ask @security"
claim.overlaps;                         // other live claims touching these paths, known now

const ws = await room.workspace(claim); // a fork, a scoped write token, a remote URL
// The agent works with plain git: `git push ${ws.remote} HEAD:work`

const proposal = await room.propose(claim, { head, summary });
proposal.obligations;                   // [{ check: "tests" }, { review: "@security" }]
proposal.conflicts;                     // paths that overlap other proposals, with a merge preview

await room.note(proposal, { at: { path: "src/api/login.ts", line: 42 }, text: "…" });
await room.review(proposal, { verdict: "approve", scope: ["src/api/**"], text: "…" });
const landed = await room.land(proposal); // { commit, receipt } or a Refusal

for await (const item of room.attention({ for: actor })) {
  // What needs this actor now, and why: a typed, live queue
}
```

Each act returns a typed record: `Claim`, `Proposal`, `Note`, `Review`,
`Check`, `Landing` or `Release`. Reads include `room.lane(id)`,
`room.lanes(filter)`, `room.log({ since })` and `room.explain(act)`; the
last says which rules applied and why.

### Policy

Policy lives at `.artroom/policy.json`. It is a list of JSONata rules,
and it is reviewed and landed like any other change. TypeScript helpers
produce it, so authors get types and composition, and the room still
evaluates portable, deterministic data.

```ts
// .artroom/policy.ts — compiles to .artroom/policy.json
import { policy, owners, requireCheck, requireReview, survive, lanes, rule } from "artroom/policy";

export default policy(
  owners({ "migrations/**": "@db", "src/api/**": "@security" }),
  requireCheck("tests", { paths: "src/**" }),
  requireCheck("types", { paths: "**/*.ts" }),
  requireReview({ paths: "src/api/**", from: "@security" }),
  survive("reviewed-paths-unchanged"),    // graded staleness
  lanes("by-scope"),                      // disjoint work lands in parallel
  rule({
    id: "claim-before-propose",
    on: "propose",
    refuse: "$not(claim.live)",
    fix: "Claim the paths first.",
  }),
);
```

There are five kinds of rule:

| Kind | Evaluated | Effect |
|---|---|---|
| `refuse` | When an act arrives, before it is recorded | The act is refused, with the rule's `fix` |
| `require` | On `propose`, and again when the head or scope changes | Obligations: checks or reviews the proposal needs |
| `survive` | When a proposal's head changes | Which earlier verdicts and checks still hold |
| `land` | On `land` | Whether the head may merge, and in which lane |
| `notify` | After an act is recorded | Who sees it in their attention queue |

**The rule language.** Rules use a restricted JSONata profile, ported
from atseq's runtime (`jsonata` 2.x in JavaScript): an allowlist of
functions, no clock, no randomness and no I/O. Every input a rule sees is
recorded, so any decision can be replayed. This is how the policy file
replaces pre-commit hooks, branch protection, CODEOWNERS and path
instructions: these become rules the room enforces, not hooks a client
may skip.

### Checkers

Anything that runs code is a checker. A checker is an actor that
fulfils `require` obligations with `check` acts. Its result is recorded;
its execution is not replayed.

```ts
import { Checker } from "artroom";
import { getSandbox } from "@cloudflare/sandbox";

export class Tests extends Checker<Env> {
  name = "tests";
  async check(p: Proposal) {
    const box = getSandbox(this.env.SANDBOX, p.id);
    await box.exec(`git clone --depth 1 ${p.readUrl} w && cd w && git checkout ${p.head}`);
    const run = await box.exec("cd w && npm ci && npm test");
    return { ok: run.exitCode === 0, detail: run.stdout.slice(-4000) };
  }
}
```

A checker can equally be:
- a Dynamic Worker running untrusted JavaScript;
- a Workflow;
- a local agent connected over MCP;
- an LLM reviewer.

This is how CI and review assistants plug in, without a webhook protocol.

### Clients

- **`artroom/client`** gives the same typed API over HTTPS for scripts
  and agents outside Cloudflare.
- **`npx artroom`** is a thin CLI over the client, for example
  `artroom claim "goal" src/**` or `artroom land`. Output is plain text
  by default and JSON with `--json`.
- **`https://<host>/mcp`** exposes the same acts as MCP tools, using the
  Agents SDK's MCP handler. An agent needs one URL, plus `git push`.
- **The web UI** uses the WebSocket feed and the same types.

### Identity

Each actor is an Ed25519 key, which Workers verify with WebCrypto.
- **People** get a key generated in the browser and bound to a sign-in.
  We start with GitHub OAuth, or an invitation link for the demo.
- **Agents** get a key issued by an invitation token.
- **Trusted Workers** calling over a service binding act for an actor
  through a scoped delegation.

## 6. Architecture

```
agents / people ── HTTPS, WebSocket, MCP ──► Worker ──RPC──► Room (Durable Object, one per repo)
        │                                                     │  SQLite: acts, lanes, obligations
        │ git push (code only)                                │  JSONata policy evaluation
        ▼                                                     │
   Artifacts fork ◄── fork, scoped token ─────────────────────┤
   (one per claim)                                            │ pin head, preview merge, land
                                                              ▼
                         Artifacts canonical repo ◄── GitSandbox (container running real git)
                         main, refs/artroom/log (published act log), refs/artroom/heads/*
```

**The room** is a Durable Object. It:
- holds the authoritative log in SQLite;
- evaluates policy;
- answers each act after its commit, at about 130 ms per round trip
  plus rule time;
- publishes the log to the canonical Artifacts repository in batches,
  under `refs/artroom/log`, as signed commits;
- answers `artroom verify <remote>`, which checks a clone offline.

**Code** moves only by git. A claim gets an Artifacts fork and a write
token scoped to that fork. When the claimant proposes, the room copies
the head into the canonical repo (`refs/artroom/heads/<proposal>`), so a
force-push to the fork cannot erase what was reviewed.

**Diffs and merges.**
- **Path-level diffs need no container.** The room computes them from
  tree objects through the Artifacts binding (`readTree`, `readCommit`).
  This covers overlap detection, `survive` rules and lane assignment, and
  stays fast.
- **Content merges run in a Sandbox container with real git,** but only
  when paths overlap. Previews run when a proposal arrives and whenever
  main moves; landing runs there too.

**Only the room writes `main`.** No actor holds a write token for the
canonical repository.

**Scope of authority.** One room per repository is the single
sequencer. If one room's measured ceiling (about 200 acts/s) is ever
reached, we shard rooms by lane. That is not needed for the competition.

## 7. Concurrency and conflict handling

| Situation | Today's typical cost | Artroom's behaviour |
|---|---|---|
| Two agents start overlapping work | Found when the second pull request conflicts | Found at `claim`. Both see the overlap; policy orders it or asks a person |
| Main moves under an approved change | Approval kept or dismissed whole | `survive` keeps verdicts whose reviewed paths did not change. The UI shows each verdict as fresh or stale, with the reason |
| A head will not merge | Discovered at merge, often after review | Merge preview on `propose` and on every main move. The proposal is marked before anyone reviews it |
| Many approved changes | Single queue | Disjoint lanes land in parallel; overlapping lanes queue, and recuts are serialised (no racing cascade) |
| An agent dies mid-task | Branch abandoned | The lease lapses and the lane is released with its context. The attention queue offers it to the next agent |
| Two reviewers disagree | Last review wins on the page | Both verdicts stand, and `land` rules decide (for example, any `changes` from an owner blocks) |

**The verdict window.** Verdicts are bound to the proposal's head and to
the paths reviewed, not to the whole log's position. That removes the
retry storm the spike measured.

## 8. Ease of use

### First five minutes
1. **Install.** `npm create artroom@latest` deploys to the user's
   account; there is also a hosted demo instance.
2. **Import.** `artroom import github.com/org/repo` imports through
   Artifacts' import API.
3. **Invite.** Share the room URL. A person signs in, an agent gets a
   token, and Artroom generates an `AGENTS.md` block for the repository.
4. **Connect an agent.** Add the MCP URL to Claude Code, Codex or
   OpenCode; one line.

### Four screens, no more

1. **Needs you.** The attention queue: each item, why it is yours, and
   the one action it asks for.
2. **Room.** Claims, lanes, overlaps and the landing queue, live.
3. **Proposal.**
   - the diff;
   - threaded notes, re-anchored on new heads;
   - obligations as a checklist;
   - each verdict's freshness;
   - the "why" graph.
4. **Policy.** The rules, what each refused or required recently, and a
   dry run of a draft rule against recent history.

### For agents
- **Five tools cover the loop:** `claim`, `propose`, `review`, `land` and
  `attention`. Refusals tell the agent what to do next.
- **No local state** beyond a git checkout.

### Adoption without switching
An optional mirror pushes landed `main` back to GitHub, so a team can try
Artroom on one repository. This is the first item to cut if time runs
short.

## 9. Performance, scale and edge cases

**Targets.** We publish the measured numbers in the README and the video.

| Measure | Target | Basis |
|---|---|---|
| Act answered, p50 / p99, 50 concurrent agents | ≤ 300 ms / ≤ 1 s | DO round trip 132 ms measured |
| Overlap shown at `claim` | ≤ 300 ms | Path tree comparison in the room |
| Merge preview | ≤ 10 s p50 | Container with real git |
| Disjoint landings | ≥ 10 per minute | Parallel lanes |
| Live UI update after an act | ≤ 1 s | WebSocket |
| Scale run | 100 agents, 1,000 claims, gapless log, no lost update | 201 appends/s measured |
| Wasted approvals in a conflict cascade | 0 | Spike baseline: 6 of 10 |

**Edge cases.** Each has an expected behaviour and a test.

| Edge case | Expected behaviour |
|---|---|
| Lease lapse | Lane released with handover context |
| Fork force-pushed or deleted | Proposed heads were already copied into the canonical repo |
| Duplicate submission | Idempotency key returns the same record |
| Room restart mid-batch | Log is in SQLite; the publish retries with a lease |
| Artifacts 10400 or timeout | Bounded retry, then a visible state |
| Very large diff | Bounded, with a summary |
| Rename across claims | Path rules see both old and new paths |
| Secret pasted in a note | Hidden from every view; its hash stays in the log; flagged to the author |
| Policy change | Itself a proposal; it applies from the act after it lands |
| Two people approve and object at once | Both recorded; `land` rules decide |
| Rate limits | 2,000 git requests per 10 s per repo; the room throttles itself |
| Abuse | Signed acts only; tokens scoped per fork |

## 10. The demo (8 minutes)

1. **Setup (1 min).** Import a real small repository. Connect three
   agents (for example Claude Code, Codex and a small model) and two
   people.
2. **Intent (1.5 min).** All three claim work. Two claims overlap; the
   room shows it at once, and policy orders them. The third works in
   parallel.
3. **Review (2 min).** A person reviews on the Proposal screen. An agent
   pushes a fix: the approval survives, because the fix did not touch the
   reviewed paths. A second fix does touch them, and the verdict shows as
   stale with the reason.
4. **Conflict (1.5 min).** A merge preview flags a conflict before
   review. The second agent recuts in the queue, and nothing is wasted.
5. **Hand-off (1 min).** An agent is killed. Its lease lapses, and
   another agent picks up the lane with full context.
6. **Proof (1 min).**
   - the scale run's numbers;
   - `git clone` of the canonical repo, then `artroom verify`;
   - the same scenario as conventional pull requests in a simulation,
     with the counts of conflicts, wasted reviews and time to land.

## 11. Work plan

All work is tracked as gitseq requests in this workroom:
- **planner** files requests and orders the work;
- **builder** implements;
- **checker** reviews every head before it lands.

The figures below are engineer-days. Several builder lanes can run in
parallel.

| # | Lane | Days | Gate |
|---|---|---|---|
| 0 | API contract: `api.d.ts`, policy schema, acts and refusals, reviewed by checker | 1.5 | Gates all other lanes from day 2 |
| A | Room: SQLite log, Ed25519 verification, idempotency, WebSocket, batch publish | 2 | |
| B | Git: forks and tokens, head pinning, tree diffs, container merge preview and land | 3 | **Highest risk.** Containers spike on day 1 |
| C | Policy runtime: JSONata profile port, five rule kinds, `explain`, TypeScript helpers | 2.5 | |
| D | Default policy pack and rule corpus (8–10 rules with tests) | 2 | |
| E | Client, CLI and MCP | 2 | |
| F | Web UI: four screens | 4 | **Highest UX risk** |
| G | Checkers: tests in Sandbox, types, an LLM reviewer | 2 | |
| H | Demo harness, scale runs, conventional-workflow simulation | 3 | |
| I | Edge cases (section 9) | 3 | |
| J | Onboarding: `create artroom`, import, hosted demo, docs | 2 | |
| K | Video, README, submission | 1.5 | |
| | **Total** | **29.5 (±4)** | |

| Dates | Work |
|---|---|
| Oct 1–2 | Lane 0 contract; Containers and merge spike (B); policy runtime port starts (C) |
| Oct 3–7 | A, B, C, D, E in parallel; F starts on the contract with mock data |
| Oct 8–10 | G, H, I; F completes |
| Oct 11–12 | J; UX polish; two full demo rehearsals on the hosted instance |
| Oct 13 | Video and submission; Oct 14 is buffer |

**If time runs short, cut in this order:**
1. the GitHub mirror (J);
2. the LLM reviewer (G);
3. the policy dry run (F);
4. the third agent type in the demo.

Never cut:
- the API contract;
- intent overlap;
- verdict survival;
- parallel lanes;
- the scale numbers;
- edge cases that the demo can touch.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Containers not available on the account, or too slow, for merges | Spike on day 1. Fallback: isomorphic-git three-way merge in the Worker for text files, refusing anything it cannot merge cleanly |
| Artifacts beta failures | Retry with backoff; show the state in the UI; keep the demo off the critical path of creating repos |
| `jsonata` has no step limit | Rules are small and allowlisted; the Worker CPU limit is the backstop; a corpus test bounds each rule |
| UI quality in four days | Contract-first with mock data from day 2; one screen at a time, reviewed by checker |
| Judges cannot run it | Hosted instance with a guest room; the README runs in under five minutes |
| Scope creep | This plan's cut order; planner refuses new lanes after Oct 9 |

## 13. Open decisions for review

1. **Policy language.**
   - **Recommendation:** JSONata data with TypeScript helpers, as above.
   - **Alternative:** rules as TypeScript run in Dynamic Workers. That is
     more expressive, but harder to replay and audit.
2. **Runtime reuse.**
   - **Recommendation:** port atseq's restricted JSONata evaluator and
     definition checks. They are our own Apache 2.0 code.
   - **Alternative:** write fresh.
3. **Log publication format.**
   - **Recommendation:** simple signed JSON commits under
     `refs/artroom/log`, with `artroom verify`.
   - **Alternative:** byte-compatible with gitseq's event format, so
     `gs verify` works. That costs about 2 extra days.
4. **Hosting.** Which account and domain host the demo instance:
   `*.workers.dev`, or a custom domain?
5. **Actors.** Who acts as checker, and how many builder lanes run at
   once?
6. **Package names.** `artroom` on npm, if it is available, or a scope
   such as `@generalbusiness/artroom`.

## 14. Sources

Competition:
- Official rules: <https://www.cloudflare.com/documents/build-next-gen-git-platform-competition-terms.pdf>
- Announcement: <https://blog.cloudflare.com/next-git-platform-on-cloudflare/>

Cloudflare platform documentation:
- Artifacts: <https://developers.cloudflare.com/artifacts/> (Workers binding, Git protocol, event subscriptions, limits, pricing)
- Sandbox (Containers and Dynamic Workers): <https://developers.cloudflare.com/sandbox/>
- Agents SDK and MCP handlers: <https://developers.cloudflare.com/agents/>

GitHub:
- Copilot code review: <https://docs.github.com/en/copilot/concepts/agents/code-review>
- Stacked pull requests: <https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/>
- Rulesets: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- Merge queue: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>
- Reviewing agent pull requests (2026-05-07): <https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/>

Review assistants:
- CodeRabbit pre-merge checks: <https://docs.coderabbit.ai/pr-reviews/pre-merge-checks>
- CodeRabbit configuration reference: <https://docs.coderabbit.ai/reference/yaml-template>

Research:
- Agent pull request overlap and conflict study: <https://arxiv.org/abs/2607.04697>

Our own evidence:
- gitseq spike report: event `6e13e7d5` in the gitseq workroom
- Spike harness and results: `~/play/gitseq-artifacts-spike` (commit `58dbdbf`)
