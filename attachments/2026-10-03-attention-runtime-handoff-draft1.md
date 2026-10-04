# Attention delivery for the durable coding runtime

2026-10-03. Planning addendum for wake/schedule request `24711ceb99c3939c0217eb7e0cac7d2b2d21cde9` and production coding runtime request `13dfc613e8e3d9a1aed5f7492272fbf8c580d727`.

Status: proposed handoff, pending independent design review. This does not amend the protocol, approve implementation, or add a Jam readiness gate. The approved browser/cloud design and experience map keep their reviewed bytes. Test-overhead reduction remains the highest implementation priority.

## Why this needs a handoff

The wake note at `337a449daafe1a347cd69fc755b9be1ade7860dc` says a ping carries `{ room, member, cursor }`, and the agent reads attention after that cursor. It does not define whether that position precedes the items being announced or names the new tail.

On main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`, `packages/room/src/reads.ts` returns attention items with `pos > afterPos`, ordered by their queue position. An attention page returns the position of its last returned item. Cursor kinds are checked: an updates cursor is not an attention cursor. Queue position is independent of the entry's sequence, so an item made later about an older entry must still be delivered. These are source observations; no runtime counterexample was run.

If a future ping carries the new tail and the receiver uses it as its resume position, it skips the announced items. The wake schema needs an explicit meaning before it is implemented. This is a planning gap in an unimplemented wake address, not an observed production defect.

The current pi spike does not settle this gap. Its `Agent.run()` submits a caller-provided `requestId` and waits for the answer. Its README explicitly lists the autonomous alarm loop and attention bridge as not built. Conversation input deduplication does not by itself persist a Room queue position or reconcile an uncertain command.

## Proposed delivery flow

A wake asks the receiver to read its queue. It does not replace the receiver's saved cursor, authorize tools, close an attention item, or resume a paused task.

1. The Agent reads Room attention with its own persisted **attention** cursor. An agent with no cursor begins with the initial page. A hint may contain an advisory high-water mark, but the receiver must not adopt it as an acknowledged read position. Conversation, attention and live-update cursors remain distinct.
2. In one Agent-owned transaction, it saves the returned items in its durable input ledger and advances its attention cursor to the page's returned cursor. It records a disposition for every item it passes, including an item already closed or outside the task's configured work. It does not advance past an actionable item whose input or disposition could not be saved. It continues bounded pages while `more` is true.
3. A pending input is submitted to the durable conversation with a stable identity scoped to the Room, agent member, task/conversation and attention item. The exact encoding is an implementation choice, not a new public act field. A restart before submission finds the pending input; a restart after submission but before its delivery receipt retries the same input identity. The actual harness must demonstrate that this returns the same submission rather than starting another run.
4. Delivery records mean that the input was retained or submitted. They do not mean the requested work finished. The conversation may wait, refuse, pause or ask for attention. Its tools still pass through the operation ledger, current task authority, lease and workspace epoch fences.
5. Before acting on a delayed item, the runtime reads the relevant current Room state. An old proposal, superseded obligation or lost authority can make the request obsolete. The saved input remains attributable; the runtime records that disposition rather than silently treating it as successful work.

This uses the durable-input and scheduling owners already required by C3. It does not add a second public SDK outbox or require a transaction across the Room and Agent. Saving a local pending input before submitting it separates the two durable boundaries; the stable submission identity handles a lost reply between them.

A lost wake needs a concrete catch-up path. An authorized active task's existing bounded alarm loop can drain retained inputs and check for new attention. The production design must name that path and its budget; “the queue is the truth” alone does not make a receiver run again. Wakes exhausted by a delivery budget leave the queue readable and expose the delivery failure. A paused or attention-waiting task retains its inputs and saved work, with new tools and lease renewals stopped as specified; a ping must not turn it back into active work. Browser disconnection alone leaves an authorized active task running.

## Authority and recorded outcomes

The wake note's adopted `because` proposal closes an attention item after an addressed act cites its source entry. That is a proposed attention mechanism whose eligible item kinds and interaction with existing automatic closure still need a reviewed contract. It must not substitute for a qualified review, a check, a landing receipt, publication read-back, or requester acceptance of an addressed work report.

The existing Room read code computes whether review/check requests remain open from current obligations. The later contract should preserve that authority and explicitly state whether `because` closure applies to policy/note items only, or define other eligible cases. N2 owns the separate addressed-work and requester-acceptance design; this addendum does not adopt an answer for it.

Use the declared kind and binding retained with a prepared act. A changed application vocabulary must not cause a stored input's unknown act to be reconstructed and signed under a new meaning. Conversation input deduplication, signed-act exact replay and command-effect reconciliation are three different boundaries. Neither a wake nor a repeated `requestId` proves an external side effect ran once.

C1 and C3 already specify who can control a task, private reads, device revocation and independent agent membership. Apply those rules here: revoking device A while owner device B remains active can leave hosted work active; removing the owner or its last active key stops new tools/broker writes/renewals. Retained settlement work is not a fresh dispatch grant. A device reconnecting must read the durable task and Room state. It need not reconstruct work from a wake history.

The absent-human alert design N7 is separate. An Agent wake is a content-free runtime hint; a human notification needs its own reviewed delivery, consent and disclosure rules.

## Decisions and dependencies

| Decision or work | Owner and status |
|---|---|
| Whether a public wake cursor is an advisory high-water mark or a defined position before the announced items; cursor kind and initial catch-up behavior | Wake/schedule design `24711ceb`, pending design review. Proposed initial receiver rule above uses only its own acknowledged attention cursor. |
| Durable input ledger, page-position commit, stable conversation submission, restart recovery and bounded active catch-up | Already commissioned production runtime C3 `13dfc613`; implementation evidence still owed. |
| Current authority and pause/resume rules at delayed input dispatch | Relevant reviewed C1 decisions `b538c5ea` and C3 implementation. |
| Eligible `because` attention closure and preservation of automatic obligation closure | Wake/schedule amendment, with the existing Room contract; no source amendment supplied here. |
| Addressed work, reports and requester acceptance | N2 `9c43c173`, design first. |
| Full schedules, roster wake addresses, HMACs and application-pack prompts | Existing wake/schedule staging, subject to current declared-acts and package design. They are not prerequisites for C3's owned alarm/input loop unless a concrete selected delivery mechanism needs them. |
| Notifications to an absent person | N7 `64e9d131`, design first. |

No implementation request is added by this note. The relevant runtime work was already commissioned. The wake/schedule source note and this proposed clarification need independent design review before protocol work. Preserve the user's order: test reduction; acts; concrete Jam blockers; then Jam and the full manual in parallel when the builder judges actual self-hosting readiness.

## Acceptance scenarios

- Drop and duplicate a wake. The active authorized Agent catches up through the named alarm path, retains each queue item and submits one durable conversation input per identity. The hint never moves its acknowledged cursor.
- Return more items than one page, including a new item about an older entry. Restart between pages. Every required item has a durable disposition; the read position does not skip the later queue item or the remaining page.
- Interrupt once after local input retention but before conversation submission, and once after submission before its receipt. Resume from the ledger and reuse the same submission identity. A storage failure leaves the earlier cursor intact.
- Delay an input until its proposal is superseded or authority is revoked. The runtime records why it cannot act; it neither counts an obligation as met nor starts a new mutating tool. A wake after pause leaves the task paused. Closing the browser while the task is active does not pause it.
- Submit a citing note or claim. If the future attention contract permits that item to close, the browser still shows the actual proposal, review, landing, publication and addressed-work outcomes separately. An uncertain command or act remains unsettled until its own reconciliation provides evidence.

Use focused controls at the actual Agent storage/submission and Room read boundaries. A mock wake alone cannot prove durable delivery. No per-field mutation inventory, restored whole-vocabulary duplicate suite or repeated root gate is required.
