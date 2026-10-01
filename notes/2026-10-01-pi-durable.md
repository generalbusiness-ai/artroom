# pi-durable in Artroom: design and spike

Date: 2026-10-01. Request: 3f23ea89. Code:
[spikes/pi-durable/](../spikes/pi-durable/). Raw results:
[spikes/pi-durable/results/](../spikes/pi-durable/results/).

This note proposes how pi-durable agents should work in Artroom, answers
the eight D2 questions in the documentation plan
(`notes/2026-10-01-docs-plan.md` on `request/docs-plan`, section 7), and
reports a spike that tests the riskiest part: an agent that survives a crash
in the middle of an act without acting twice or losing its receipt.

**How to read the labels.** Each claim carries one:

- **[Source]** a fact from pi-durable's or Artroom's documentation or code,
  cited at a pinned version;
- **[Spike]** measured in this spike, with the test that shows it;
- **[Judgement]** a design choice or opinion;
- **[Untested]** a claim nobody has run yet.

## Summary

- **pi-durable runs inside a Durable Object, on the Durable Object's own
  SQLite.** It needs a small storage adapter (about 130 lines). pi-durable's own
  storage conformance suite, 23 cases, passes on it inside workerd. [Spike]
- **A pi-durable agent claimed, proposed and landed a change** in lane A's
  Room over a service binding, signing as a Worker under a member's
  delegation. This ran with a scripted model, and with a real model
  (`openai/gpt-4.1-mini` on OpenRouter). [Spike]
- **Crash and resume works with one rule.** An Artroom act tool must be
  `replay: "safe"`, and must store its prepared, signed envelope in the tool
  task's memo before it first sends it. A rerun then sends the same bytes,
  and the room returns the original receipt (R-IDEM-2). The agent's Durable
  Object was reset at ten points across claim, push, propose and land.
  Every run resumed, every act was admitted exactly once, and the model saw
  no error. [Spike]
- **Each half of the rule is needed.** Without `replay: "safe"` (pi-durable's
  default) the model is told the call was interrupted, and the act it made
  is unknown to it. Without the stored envelope, the rerun rebuilds the act
  from fresh reads and the room refuses it as `idempotency-mismatch`. Without
  either, the rerun's `propose` is a second act, admitted as generation 2.
  [Spike]
- **No protocol amendment is needed.** Authority is still judged at
  admission, the room is still the only writer of `main`, and every act is
  still a signed envelope. The design uses delegations (R-CRED-4),
  idempotency (R-IDEM), leases (R-LANE) and attention (R-API-8, R-API-9) as
  they are. Two small client-library gaps are listed. [Judgement]
- **Not proven yet:** a Cloudflare deployment, long runs inside one Durable
  Object request, the attention bridge, steering from the web UI, and
  reviewer identities. Each is listed with what would prove it.

## Sources

**pi-durable**, version 1.0.0, released 2026-10-01, experimental. The npm
package `@earendil-works/pi-durable@1.0.0` (published 2026-10-01 19:11 UTC)
names `gitHead` `a13d35a742c6ef8462812a28fbe1d8c8b7431c32`, which is the tag
`v1.0.0` of <https://github.com/earendil-works/pi>. Its dependencies at that
version are `@earendil-works/pi-ai` 1.0.0 and `@earendil-works/chord` 1.0.0.
Cited files, all at that commit, under
`https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/`:

| Short name | Path |
|---|---|
| post | <https://earendil.com/posts/pi-durable/> ("Pi Durable", Earendil Engineering, 1 October 2026), retrieved 2026-10-01 |
| README | `packages/durable/README.md` |
| spec | `packages/durable/docs/spec.md` (the normative specification) |
| tool.ts | `packages/durable/src/harness/tool.ts` |
| database.ts | `packages/durable/src/storage/sqlite/database.ts` |
| types.ts | `packages/durable/src/harness/types.ts` |
| example 22 | `packages/durable/test/examples/22-subagent-foreground.ts` |
| example 23 | `packages/durable/test/examples/23-subagent-background.ts` |

**Artroom.** `docs/protocol.md` on `main` at `8189d66b`. Lane A's Room on
`request/laneA-room` at `4a7c4af6` (`packages/room`, with lanes B, C and L).
Lane E's client on `request/laneE-clients` at `cb1767dd`
(`packages/client`). Both lanes are in review; the spike vendors those exact
commits.

## 1. What pi-durable gives us

These are the parts of pi-durable that the design uses. [Source]

- **A harness over one storage.** A Harness opens over a storage backend
  and runs many conversations at once. "One process owns a storage at a
  time; there is no cross-process locking." The portable SQLite core "runs
  without Node APIs, for example ... in Cloudflare Durable Objects, given an
  asynchronous `SqliteDatabase` facade" (README, "Storage"). No Durable
  Object facade ships in 1.0.0.
- **Every step is a durable task.** A tool call commits its intent before it
  runs. On recovery it reruns only if both the stored and the current
  `replay` policy are `"safe"`; otherwise the model gets an `interrupted`
  error result (tool.ts lines 85–111; spec section 8.4). The default is
  `"unsafe"` (spec section 7.3).
- **Memos.** A task's memo is a small first-writer-wins value that survives
  a crash and disappears when the task ends (spec section 5.2, "Effect
  sandwich"). Hooks share the task's memo namespace (spec section 12, "Hook
  memo names").
- **Exactly-once submissions.** "A retried submission with the same
  `requestId` returns the existing submission" (README, "Persist and
  Resume"). The scope is one conversation (spec, line 2175).
- **Steering.** An input to a busy conversation is a follow-up by default;
  with `whenBusy: "steer"` it joins the running work after the current tool
  round (README, "Busy Conversations").
- **Documents.** Typed JSON stored next to the transcript and changed in
  atomic commits. Each document declares what a fork starts with:
  `"initial"`, `"current"` or, for rewindable documents only, `"asOf"`
  (README, "Your Own State"; spec section 3.7).
- **Forks.** A conversation can fork another at any entry, and keeps the
  parent's agent as of that entry (README, "More Conversations and Forks").
- **The ownership tree.** Tasks and conversations have owners. Aborting a
  task aborts what it owns, bottom-up, and each task's abort handler undoes
  its own effects (README, "Abort and Subagents", "Child Tasks"). An abort
  handler cannot create owned children (spec section 12, "Compensation in
  abort handlers").
- **Hooks.** `beforeTool` can block or rewrite a call; a hook that decides
  stores the decision in a memo (post, "Hooks"; spec section 7.2).
- **Watching.** Any number of clients can attach to a conversation, get its
  current view, then each commit's operations (README, "Watching a
  Conversation").

## 2. The invariants this design keeps

Artroom's three invariants are unchanged:

1. **Authority is judged at admission.** The agent's harness never decides
   whether an act is allowed. The room does, when the act arrives (R-ADM-1
   to R-ADM-6). A pi-durable approval or hook can stop an act from being
   sent; it can never make one valid.
2. **The room is the only writer of `main`.** The agent pushes only to its
   lane's fork and asks the room to land (R-LAND, R-PUB).
3. **Every act is a signed envelope.** The agent's Worker signs with its own
   key, under a delegation (R-CRED-4). The stored envelope that makes
   recovery work is that same signed envelope, sent again unchanged.

## 3. The design

### 3.1 Where the agent runs [Judgement]

One **Agent Durable Object per agent identity**, in the same Worker as the
Room or in another Worker. It hosts one pi-durable Harness on its own SQLite
through the facade in `spikes/pi-durable/src/do-sqlite.ts`. The Durable
Object's single-threaded execution gives pi-durable the single owner its
storage requires.

It reaches the Room through a service binding, with lane E's client:
`connect(env.ARTROOM, roomId, { kind: "delegation", signer, as })`. The
Worker holds the agent's signing key as a secret (R-CRED-4).

An agent identity is one of two things:

- **an agent acting for a person**: a delegation from that person to the
  agent's key, covering `claim`, `propose`, `land`, `release`, `renew` and
  `note`. Its acts count as the person's (R-ADM-3, case (b)). The spike uses
  this;
- **an agent as a member**: a member with role `agent` (R-GEN-5), whose key
  is the Worker's secret, joined with a client-custody invitation over the
  service binding (lane E's `join`). It has its own attention queue, and its
  reviews can meet obligations that name it. [Untested]

Each lane the agent works on is **one conversation**. The conversation's
`artroom.lane` document records the room's receipts for that lane.

### 3.2 The act tools: exactly once across crashes [Spike]

Every Artroom act tool (`claim`, `propose`, `land`, `release`, `renew`,
`note`, `review`) follows one rule:

1. It is declared `replay: "safe"`.
2. Before the first send, it lets the client prepare and sign the act, and
   stores the prepared act, including the signed envelope, in the tool
   task's memo (lane E's `onPrepared` hook).
3. If the memo already holds a prepared act, it sends that, unchanged, with
   the client's `replay()`. It never signs a second envelope.
4. Its idempotency key is `pd-<storage prefix>-<tool task ID>`. The prefix is
   random, made once per Agent storage, so task IDs that restart after a
   lost storage cannot reuse a key.
5. It records the receipt in the lane document, keyed by act ID, so a second
   record of the same receipt changes nothing.

The spike's crash points show why each step is there (section 6).

### 3.3 The lane document [Spike for the receipts; Judgement for the rest]

`artroom.lane` is a conversation document: room, lane, lease generation,
scope, pushed head, generation, landing operation, and the receipts by act
ID. It is `history: "rewindable"`, `fork: "asOf"`, so a fork sees what its
parent knew at the fork point. A prompt section renders it before every
model request, so the model always sees its lane and lease.

The room is the authority; the document is this conversation's record of
the room's answers. A tool that needs the current generation or lease reads
it from the room when it prepares an act; the stored envelope then fixes
what was sent.

### 3.4 From the room to the conversation [Judgement; partly Spike]

The Agent Durable Object runs an **attention bridge**:

- it follows the room's updates for the agent's identity (R-API-8: an RPC
  subscription, or the HTTPS long poll from an alarm), keeping its cursor
  in its own SQLite;
- for each attention item about a lane the agent holds, it submits an input
  to that lane's conversation with `requestId: "attention:<position>"`;
- items that change the current work (an objection, a requested change,
  `generation-moved`, `recut-needed`, a lease about to expire) use
  `whenBusy: "steer"`; outcomes (a landing landed or failed, a review
  approved) use the default follow-up.

The cursor can be saved after the submission: a redelivered item has the
same position, so the same `requestId`, so pi-durable admits it once. The
spike shows the exactly-once half: the same landing notice submitted twice
gives one user entry and the same answer (`test/agent.test.ts`, "runs the
task end to end"). The subscription itself is not built.

### 3.5 Durable Object lifetime [Judgement; Untested]

A Durable Object runs only while it handles a request or an alarm. The
Agent should set an alarm whenever a run is unfinished, and on each alarm
call `harness.resume()` and work until idle or near a time budget, then set
the next alarm. The spike's runs are driven by an RPC call that waits for
the answer; after a reset the test calls again with the same `requestId`.

## 4. The D2 questions

### Q1. Agents as pi-durable conversations in Durable Objects, next to the Room, calling it over a service binding

**Proposed design:** sections 3.1 and 3.2. One Agent Durable Object per
agent identity, one conversation per lane, the client over `env.ARTROOM`,
signing under a delegation.

- [Spike] pi-durable 1.0.0 and pi-ai 1.0.0 load in workerd with
  `nodejs_compat` (the spike runs the openrouter provider too).
- [Spike] pi-durable's `SqliteStorage` runs on Durable Object SQLite through
  the facade, and passes pi-durable's 23-case storage conformance suite
  inside a Durable Object (`test/do-sqlite.test.ts`).
- [Spike] Durable Object SQLite refuses `SAVEPOINT` in SQL (its error names
  `BEGIN TRANSACTION` too), but
  `storage.transaction(async () => …)` runs `sql.exec` writes as one
  transaction across awaits and rolls all of them back on a throw. The
  facade uses that.
- [Untested] Deployed CPU and memory. pi-durable's README says the package
  root costs "about 23 MB of peak RSS unbundled, about 4 MB in a tree-shaken
  bundle" [Source]; pi-ai brings its provider SDKs. A long run inside one
  request may also meet the Durable Object's per-request limits; section
  3.5's alarm loop is the answer to test.

### Q2. The Room's attention queue and subscriptions waking or steering conversations (`whenBusy: "steer"`)

**Proposed design:** the attention bridge, section 3.4.

- [Judgement] Attention is per member. An agent acting under a person's
  delegation sees that person's queue, so the bridge forwards only items
  about lanes this agent holds. An agent that is a member has its own queue.
- [Spike] The live model said "the change has been landed" while the
  landing was still `accepted`; the room landed it on its next alarm. A
  model cannot know an operation's outcome from the `land` receipt. The
  bridge's follow-up on the landing outcome is what makes the agent's report
  true.

### Q3. Lane state held as a pi-durable durable document, updated in the same commit as the transcript

**Proposed design:** section 3.3, with one change to the question: the
receipt is recorded in the tool's own commit, not the transcript's.

- [Source] A tool result cannot carry document writes. The tool task
  appends the result entry in its own `settle` commit (tool.ts lines
  362–388); the tool writes documents with `api.commit()` before it returns.
- [Spike] That gap is harmless with replay: a reset after the receipt was
  recorded and before the result was committed (`<act>:after-receipt`)
  reruns the tool, which gets the same receipt and records nothing new.
- [Judgement] Same-commit atomicity would need a pi-durable change (a result
  that carries document writes). It is not needed.

### Q4. pi-durable's ownership tree matched to lanes, so aborting a lane's work and releasing the lane agree

**Proposed design:** [Judgement; Untested]

- Each lane's conversation is owned by an `artroom.lane` task (a
  `defineTask` with `background: true`, so a person's Esc in another
  conversation does not reach it). The task's abort handler sends `release`
  under the rule of section 3.2, so a crash during the abort neither loses
  nor repeats the release. It sends it inline, because an abort handler
  cannot create owned children [Source: spec section 12].
- In the other direction, when the room ends the lane (released elsewhere,
  lease expired, taken over: R-LANE-8), the bridge aborts that
  conversation's work. Its later acts would be refused anyway with
  `lease-fenced` or `not-holder` (R-LANE-3, R-LANE-6).
- The lease (1,800 seconds by default in lane A's Room, `LEASE_SECONDS`) is
  renewed by any accepted act of the holder (R-LANE-5). A long model turn with no act needs a `renew`; the lane
  task can schedule one with a durable timer.

### Q5. Forked conversations per generation or per reviewer

**Proposed design:** forks per reviewer, each with its own identity. No
forks per generation. [Judgement]

- **Per reviewer: yes, as a separate identity.** A review fork at the
  `propose` result entry sees the author's context up to the proposal, with
  a cheaper model and read-only tools [Source: README, "Per-Conversation
  Agent"]. But a review signed under the author's delegation is the
  author's review, and cannot meet an obligation that excludes the author
  (R-OBL-2). So the fork must sign as another member: another Agent identity,
  a member with role `agent` that the policy names. [Untested]
- **Per generation: no.** One lane has one lease and one holder. Two forks
  acting on one lane race on `expectedGeneration`; the room refuses the
  loser safely (`generation-moved`, R-LANE-4), but the work is wasted. A
  recut continues in the lane's own conversation; `reset()` or compaction
  keeps its context bounded. A fork is fine for read-only exploration, with
  the act tools removed.

### Q6. Approval hooks that wait for an Artroom review or a person's act, rather than an approval kept only inside the harness

**Proposed design:** no harness approval for Artroom acts. Approvals are
reviews, recorded in the room. [Judgement]

- The room already refuses a `land` whose obligations are not met, and
  policy `require` rules decide which reviews are needed. A harness approval
  in front of `land` would be a second, unrecorded gate that the room
  cannot see and `artroom verify` cannot check.
- When a tool needs to wait for a review, it returns ("waiting for review by
  role:maintainer") and the run ends. The bridge delivers the review as a
  follow-up, which starts the next run. Nothing waits inside a hook: a hook
  runs inside its task and holds the run while it waits [Source: spec
  section 12, "Work created by hooks"].
- A `beforeTool` hook is still useful for effects outside Artroom (a deploy,
  an external API). If such an approval must be durable, the person signs a
  `note` on the lane, and the hook stores the note's act ID in a memo, as
  the post's approval example stores its answer [Source: post, "Hooks"].
  [Untested]

### Q7. Exactly-once mapping between pi-durable's `requestId` and Artroom's `idempotencyKey`, and which tools are safe to replay

**Proposed design:** two layers, each with its own key. [Spike]

| Direction | Key | Scope [Source] | Set from |
|---|---|---|---|
| Room or person → conversation | pi-durable `requestId` | one conversation (spec, line 2175) | the attention position, or the caller's own ID |
| Conversation → room | Artroom `idempotencyKey` | one signing key (R-IDEM-1) | `pd-<storage prefix>-<tool task ID>` |

The stored envelope, not the key, carries exactly-once. With the envelope
stored, the spike's crash tests pass even with a random key per attempt
(a mutation run, section 6). The derived key is a backstop: without the
stored envelope it turns a double act into a safe refusal.

Which tools may replay:

| Tool | `replay` | Why |
|---|---|---|
| `claim`, `propose`, `land`, `release`, `renew`, `note`, `review` | `safe` | Stored envelope sent again: R-IDEM-2 returns the original record or refusal. [Spike for claim, propose, land] |
| Reads: `lane`, `op`, `wait`, `attention`, `log`, `explain` | `safe` | No effect. |
| `workspace` (open) | `safe` | A signed request with a fresh nonce each time (R-CRED-6); the room opens or returns the lane's one workspace operation. [Untested] |
| `workspaceToken` | `safe`, and never stored | Judged afresh each time (R-WS-2). The token must stay out of memos, documents, the transcript and tool output (R-WS-4): fetch it inside the push, use it, drop it. |
| Push to the fork | `safe` | Push the memoized commit; a rerun pushes the same SHA. [Spike, simulated push] |
| Acts through an MCP bearer token | `safe` only while the token is valid | There is no signed envelope to keep (R-CRED-10). Prefer a delegation for pi-durable agents. |

The stored envelope is not secret: it is what the room puts in its public
log. It must not hold a token, and it does not: envelopes carry no
credentials (R-WS-4).

### Q8. People watching and steering agents from the Room's web UI

**Proposed design:** watch first, steer second. [Judgement; Untested]

- The Agent Durable Object serves each conversation's `watch()` over a
  hibernating WebSocket. A frame is the exact operations of one commit, and
  a client that falls 100 frames behind gets the whole view again [Source:
  README, "Watching a Conversation"]. The Room screen (lane F) links a lane
  to its agent conversation, and the Agent judges the viewer's Artroom read
  session before it attaches them.
- Steering is a submission with `whenBusy: "steer"`. Only the member the
  agent acts for (the delegation's grantor) and admins may steer. A steer is
  an instruction, not an act: whatever the agent then does is a signed act
  under its delegation, judged at admission. If a team wants steers on the
  record, the agent posts a `note` citing them.
- Nothing in the protocol links a lane to an agent conversation. The agent
  can post its conversation's address in a `note` on its claim. That needs
  no amendment.

## 5. Protocol amendments

**None.** [Judgement] The design uses existing rules: delegation
(R-CRED-4, R-ADM-3 case (b)), the `agent` role (R-GEN-5), idempotency
(R-IDEM-1, R-IDEM-2), leases and fencing (R-LANE-3 to R-LANE-6, R-LANE-8),
workspace tokens (R-WS-2, R-WS-4), subscriptions and attention (R-API-8,
R-API-9).

Two client-library gaps (lane E), not protocol changes:

1. **`resubmit` over a service binding.** `resubmit()` sends a stored signed
   envelope without connecting, but only over HTTPS. Over a binding the
   spike sends it through a connected handle's `replay()`, and connecting
   reads the log with a read session. After the agent's key or delegation is
   revoked, that read fails, so the original receipt cannot be recovered over
   the binding, although R-IDEM-2 would return it.
2. **A clock for signed requests.** Requests carry `notAfter` from the
   client's clock (R-CRED-6). The client takes a `now` option, which the
   spike needed because lane A's test room runs on a fixed clock. Nothing to
   change; worth a line in the agent guide.

## 6. The spike

### What it proves

That a pi-durable agent in a Durable Object can drive a real Room through
claim, propose and land, and survive a crash at any point of an act without
a double act or a lost receipt. This is the riskiest part: pi-durable's
recovery reruns or abandons a tool, and either can go wrong against a
system that records every act permanently.

### Setup [Spike]

All in workerd under `@cloudflare/vitest-pool-workers` 0.22.0:

- lane A's Room, Registry and Worker at `4a7c4af6`, with the real policy
  runtime, landing engine, workspaces and log publisher, over lane A's fake
  Artifacts and publisher sandbox;
- lane E's client at `cb1767dd`, connected over a self service binding
  (`env.ARTROOM`, the Room Worker's default entrypoint);
- an Agent Durable Object with pi-durable 1.0.0 on its own SQLite, five
  tools (`artroom_claim`, `artroom_write`, `artroom_propose`, `artroom_land`,
  `artroom_status`), the `artroom.lane` document and two prompt sections;
- a member `@alice`, who delegates `claim`, `propose`, `land`, `release` and
  `note` to the agent's key, which never joins;
- a scripted model: pi-ai's faux provider with a response factory that reads
  the transcript, so its answer after a restart is the same as before;
- a live run with `openai/gpt-4.1-mini` on OpenRouter in place of the
  scripted model.

A **reset** is `ctx.abort()` in the Agent Durable Object at a named point.
workerd discards the instance and any writes not yet committed; the next call
constructs a new instance, which reopens the same SQLite. The test then calls
`run()` again with the same `requestId`, as any caller retrying would.

Pushing to the fork goes straight to the fake Artifacts; the workspace token
path is not exercised.

### Pass criteria

Set before the runs:

1. pi-durable's storage conformance suite passes on Durable Object SQLite.
2. The agent completes claim, push, propose and land; the landing reaches
   `landed`; `main` is the pushed head; the lane document holds exactly the
   three receipts.
3. With a reset at each of ten points (below), the run finishes; the log
   holds exactly one accepted `claim`, `propose` and `land` signed by the
   agent's key, and no refusal of them; the landing lands; the model sees no
   error result.
4. Ablations: without replay, without the stored envelope, and without
   either, the run fails in the way the design predicts.
5. The live model completes criterion 2 with one reset after the room
   admitted `propose`.

### Result: pass

| Criterion | Result | Evidence |
|---|---|---|
| 1 | Pass: 23 of 23 conformance cases, and the SQLite probe | `test/do-sqlite.test.ts` |
| 2 | Pass | "runs the task end to end" |
| 3 | Pass at all ten points | "crash and resume across an act" (10 cases) |
| 4 | Pass: each ablation fails as predicted | "ablations" (3 cases) |
| 5 | Pass in four runs; one recorded | `results/live-2026-10-01.json` |

The whole suite: 39 tests pass, plus the live test when a key is present
(`results/scripted-2026-10-01.txt`).

**Crash and resume, by point.** "Sends" lists what the act tool handed to
the client: `prepared` is a new signed envelope; `replayed` is the stored
one, sent again.

| Reset at | What the rerun did | Sends of that act | Acts in log |
|---|---|---|---|
| `claim:before-send` | Found the stored envelope; sent it for the first time | replayed | 1 claim |
| `claim:after-send` | Sent the stored envelope again; the room returned the original receipt | prepared, replayed | 1 claim |
| `claim:after-receipt` | As above; the receipt was already in the lane document, so nothing changed | prepared, replayed | 1 claim |
| `write:after-push` | Found the pushed head in the memo; pushed nothing more | — | — |
| `propose:before-send` | As for claim | replayed | 1 propose |
| `propose:after-send` | As for claim | prepared, replayed | 1 propose |
| `propose:after-receipt` | As for claim | prepared, replayed | 1 propose |
| `land:before-send` | As for claim | replayed | 1 land |
| `land:after-send` | As for claim | prepared, replayed | 1 land |
| `land:after-receipt` | As for claim | prepared, replayed | 1 land |

In every case the Agent was constructed twice (once before the reset, once
after), the landing landed, and the transcript has no error result.

**Ablations.**

| Without | What happened |
|---|---|
| `replay: "safe"` (pi-durable's default) | After a reset past the room, the model got "Tool artroom_propose was interrupted and may have partially run". The `propose` stands in the room; the lane document never got its receipt. |
| The stored envelope | The rerun read the lane again (now generation 1), built a different `propose` under the same key, and the room refused it: `idempotency-mismatch`. No double act, but the receipt is lost to the conversation. |
| Both (a fresh key per attempt, the client's default) | The rerun's `propose` was admitted as a second act, generation 2, and the agent went on to land it. |

**Mutation checks.** With the memo never read back, 9 of the 10 crash cases
fail (the push case does not use it). Where the rebuilt `propose` differs
from the first (after the room admitted it, the lane is at generation 1),
the room refuses it as `idempotency-mismatch`. Elsewhere the rebuilt
envelope happens to be byte-identical, because Ed25519 signatures are
deterministic and nothing it read had changed, and only the test's count of
sends catches the change. With a random key per attempt but the envelope
still stored, all crash cases still pass and only the "without the stored
envelope" ablation fails: the stored envelope carries exactly-once.

**Live run.** Model `openai/gpt-4.1-mini` through OpenRouter, as pi-ai
1.0.0's openrouter provider names it; OpenRouter reported the response model
as `openai/gpt-4.1-mini`, with no dated snapshot. One reset after the room
admitted `propose`. The model called the four tools once each, in order. One
`claim`, one `propose` and one `land` were admitted; the landing landed; the
`propose` was sent twice (prepared, then replayed). Recorded run: 6 seconds,
2,166 tokens, USD 0.0010 by pi-ai's price table. All four live runs passed;
together they cost about USD 0.004. The API key was passed as a workerd
binding and given to pi-ai through its credential store; the recorded
result and the test output contain no key-shaped string (checked with
`grep`).

### Other findings [Spike]

- **A document is a live overlay only inside its commit.** Returning
  `tx.doc(...)` from `api.commit()` and reading it later fails with "Cannot
  use a settled overlay". Copy it out inside the commit.
- **`fork: "asOf"` needs `history: "rewindable"`.** The types enforce it; at
  run time pi-durable accepted `history: "latest"` with `fork: "asOf"`
  without an error. The spike now uses `"rewindable"`.
- **`ctx.abort()` logs an uncaught `broken.outputGateBroken`** in workerd for
  each reset. It is noise, but a deployment's logs will show it on every
  real reset too. [Untested in a deployment]
- **The Agent resumes only when called.** pi-durable's `resume()` starts the
  scheduler, but a Durable Object with no request or alarm does not run.
  Section 3.5's alarm loop is needed.

## 7. Untested, and what would test it

| Claim | Test |
|---|---|
| Deployed CPU, memory and bundle size are acceptable | Deploy the spike Worker (names `artroom-spike-pd-*`) against a deployed Room once lane A deploys; measure a run |
| The alarm loop resumes a run with no caller | Reset, then `runDurableObjectAlarm`; then a deployed eviction |
| The attention bridge delivers each item once, with steer or follow-up | Subscribe from the Agent; drop the stream mid-item; count user entries |
| A lane task's abort releases exactly once, and a room release aborts the lane's conversation | Two tests in the same harness, with a reset in each |
| A reviewer fork under its own `agent` identity meets a review obligation | Policy `requireReview({ from: "role:agent" })`; fork at the proposal |
| The web UI can watch and steer | A WebSocket from the Agent; a steer from the grantor, a refusal for anyone else |
| The workspace token path | Open the workspace, fetch the token inside the push, check R-WS-4 holds in memos and transcript |

pi-durable is experimental: "The API changes without notice between
releases" [Source: README]. Pin the version, and run the conformance suite
and the crash tests on every upgrade.

## 8. Recommendation [Judgement]

Build the integration in this order, each step with its test from section 7:

1. The Agent Durable Object, the facade and the act-tool rule, as the spike
   has them, as a package beside the client (about 2 days with the alarm
   loop).
2. The attention bridge (about 1 day).
3. Lane tasks for release and renew (about 1 day).
4. Watch from the web UI; steering for the grantor (about 2 days, with lane
   F).
5. Reviewer identities with role `agent` (about 1 day, after policy
   examples exist).

The pi-durable guide in C2 should document steps 1 and 2, and state the
rule of section 3.2 plainly: an act tool is replay-safe and sends its stored
envelope again; it never signs twice.
