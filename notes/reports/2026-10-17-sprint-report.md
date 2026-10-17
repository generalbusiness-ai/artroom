# Sprint report, 17 October 2026

Sprint from 16 October, 17:00, to 17 October, 17:00 Eastern. Deployment
reopened at 09:50 on 17 October. A hosting deployment now follows checker
review of the exact head. None was made during this sprint.

Every landing below passed its gate and an independent checker review at
the exact head, unless the line says otherwise. All of it is on `main` at
GitHub.

## Direction

[Plan 032](../plans/032-2026-10-17-journey-as-acceptance-target.md) is
the order of work from this sprint on. One journey is the acceptance
target: start a repository change in the desktop AI app and hand it to
cloud agents, leave and return from another device, see what needs you,
inspect the diff and get review from the people you asked, and see
publication confirmed. The plan:

1. Finish the archive milestone, then capacity.
2. Build the journey: MVP slices S0 to S9, plus five pieces (J1 to J5).
3. Build hosted Counter agents and the developer half of self-contained
   apps alongside.

The exit test is one bounded working sprint with a few remote
participants.

## What landed

### Operations

- Status and health: public health and a session-authorized `dap status`
  (`aeebc18c`). This is the second stage of the observability design.
- The Judge stage of observability: a bounded deployment evaluator and
  closed MCP metrics (`02a91803`). The rows-written figure is reported as
  unavailable, with its reason, until a reader for it exists.
  Follow-up request `23b45732` tracks that reader.
- Capacity preparation (`afcf416e`): a map of where each dimension is
  counted and committed today. It is the base for the capacity limits now
  in progress.

### Platform

- Directory partitions (`9a1238b7`): the explicit partition cohort,
  bounded receiving identity, and bounded command-line, page and MCP
  reads.
- The rename of scope-making APIs to "create" and "creation", and of
  delivery work to "pending work" and "outbox" (`55e1970a`). Signed
  definitions and journal bytes are unchanged.
- Five small follow-ups to the invitation, lending and MCP work
  (`2637e6bb`). They include custody for MCP invitation bearers and a
  bound on the continuation cache. The original gate run failed on a test
  deadline and showed a storage teardown warning. The checker examined
  both before approving the landing, and the failed run stays on record.

### Durability

- The internal archive layout, slice A1 (`698a3d71`): cumulative journal
  files and bounded Git objects. The Git source, clone replay and writer
  (A2 and A3) come next. They will run on fixture histories only.

### Designs

- Evidence rules (`d09cc918`): where a check runs, when its result may be
  reused, and at which stage it counts. These are stated in the room's
  rules, with every reuse audited.
- Declared landing policy (`4f7b07ee`): a room's landing policy as room
  data, with what today's protocol supports and what waits.
- Plan 032, described under Direction above (`532b1d0d`).
- The journey views design (`92bedfda`): five view families, six flows,
  51 states, in light and dark at desktop and phone widths, with
  static HTML examples and browser checks. During review the catch-up
  view gained a list of every change since the last review, and the
  checker's marker changed shape so it no longer looks like a checkbox.

## Decisions

- **Capacity limits** (`63195bdd`):
  - A room opts in through a versioned field in its definition. Rooms
    that do not opt in keep entries-only admission and replay.
  - There are four temporary ceilings, for bytes, items, records and
    pending requests. Measurement will replace their values.
  - A capacity refusal names the limit it hit.
  - Replay reports a byte check as incomplete where a redacted text's
    size was not kept.
  - Only the entry that settles a duty releases its reservation.
  - A room that opts in must supply every child definition at creation
    (`9455d1c5`).
- **The J5 attention loop's catch-up reads one resumable stream of
  scope entries** (amendment `b692f9d1`). The stream follows a published
  open protocol for resumable streams. It replaces today's head-only
  stream and the polling in MCP `wait` and in the page.
- **Commissioned:** the first evidence-rules slice (`a53e1464`), with
  the real checker runner (J3, `c097372e`) as its production adapter.

## In progress

- **Capacity limits** (`113a54bd`). All four limits are now enforced for
  opted-in rooms on builder's branch, and the replay cases are under
  way. Nothing has landed yet.
- **Views in the chat.** A throwaway prototype outside the repository
  ran the views inside a desktop AI app. A full view is about 2,900
  pixels tall in a chat reply, too much to work with. A second prototype
  uses small cards, one item at a time:
  - Paging through items stays inside the card.
  - Each act becomes a one-line receipt in the chat, and the next card
    follows.

  The views design will be revised toward these cards before view work
  (MVP S2) starts.

## What stalled, and why

- **A question waited.** Builder's capacity question (`4dccae54`) waited
  from 09:41 to 12:21 before the planner answered it. Each hourly
  survey now also checks for open requests sent to the planner, not only
  for new acts.
- **MVP slice S0 was not done.** S0 confirms what the deployed service and
  each desktop app support. It carries over to the next sprint.
- **Landing receipts are still owed** for the notes sweep (`45605953`)
  and the spikes cleanup (`cb3b1c8f`). They wait on builder retiring the
  old-path artifacts in one batch.
- **Workroom writes are still slow under load.** Every act needs a
  deadline of up to 120 seconds.

## Commitments for the sprint ending 18 October, 17:00

The order below is the build order. Push after each landing. Deploy only
after checker review of the exact head.

| Owner | Work | Request |
|---|---|---|
| Builder | Land capacity limits for opted-in rooms, with the witnesses in the preparation note | `113a54bd` |
| Builder | Archive A2 and A3 to "clone, disconnect, verify to a cutoff", on fixture histories only | `e871ba09` |
| Builder | Revise the views design to small in-chat cards, one item at a time | to be filed |
| Builder | Then the real checker runner (J3) with the first evidence-rules slice | `c097372e`, `a53e1464` |
| Builder | In parallel: hosted Counter agents and the developer half of self-contained apps | `b2046fe2`, `74f38c24` |
| Builder | Bookkeeping: retire the old-path artifacts in one batch | — |
| Checker | Review builder's heads in the order above | — |
| Planner | MVP slice S0: what the deployed service and each desktop app support | `5f136703` |
| Planner | File the card revision of the views design, from the prototype's findings | — |
| Planner | Landing receipts for the notes sweep and the spikes cleanup | `45605953`, `cb3b1c8f` |
