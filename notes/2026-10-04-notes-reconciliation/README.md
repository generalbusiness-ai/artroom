# Reconciliation of four planning notes, 2026-10-04

Gitseq request `50d7806a` (planner to builder), promise `14926009`.
Branch `request/notes-reconcile`, cut from main `e6e67828`.

Four reviewed clarifications were written after four design and research
notes. This delivery makes each note agree with its clarification, in the
note itself. It changes no source code, no protocol text and no runtime
decision.

| Note | Brought from | Clarification (planner's file, with its recorded SHA-256) | Checklist |
|---|---|---|---|
| [2026-10-01-wake-and-schedule.md](../2026-10-01-wake-and-schedule.md) | `request/wake-and-schedule` at `337a449d` | `plans/008-2026-10-03-wake-and-schedule-clarification.md`, 26,682 bytes, `bb4eedbd29bae8834a903471c144dded1a32f8dc7e440edda32382ecd073facc` | [wake.md](wake.md) |
| [2026-10-01-mcp-plan.md](../2026-10-01-mcp-plan.md) | `request/mcp-plan` at `b5add513` | `plans/009-2026-10-03-mcp-clarification.md`, 35,977 bytes, `c5bd4fbe66c424e12db24a34baeaa4bad15495adf423412ce1ba8108fc0e7343` | [mcp.md](mcp.md) |
| [2026-10-01-research-jj.md](../2026-10-01-research-jj.md) | `request/research-jj` at `b3050dc6` | `plans/011-2026-10-04-jj-clarification.md`, 25,637 bytes, `cd74665c0e516d30edfdc078d18f2410574d8ec2f6a221d383c62ab175e3139b` | [jj.md](jj.md) |
| [2026-10-02-collections-of-rooms.md](../2026-10-02-collections-of-rooms.md) | `request/collections-note` at `5b579511` | `plans/012-2026-10-04-collections-clarification.md`, 89,844 bytes, `7d621bc99d44d8c0b12aa540dc259a814926f0a31f8f1fd816222c3062883cbd` | [collections.md](collections.md) |

The clarification files are the planner's. They are in the planner's
checkout and in the workroom's artifacts, not on this branch. Each note
names its clarification by path and identity.

## How to read the branch

The first commit, `8888d8ef`, brings the four notes onto the branch
unchanged. The second, `508ac63b`, holds the reconciliation. So `git
diff` between the two shows what the reconciliation changed in each note.

The planner then read the "Drift and open points" of each checklist at
`508ac63b` and answered them in the workroom, in assert `fceb27d0`
(2026-10-04). The third commit applies that direction. It is planning
direction. It is not a review of these files, and it adopts no protocol or
runtime behaviour. Each checklist marks every open point as answered by
`fceb27d0`, with what was done, or as still open, with its owner.

## What each checklist holds

- One row for each condition of the note's original request, and one for
  each correction or requirement of the clarification, with the place in
  the note that delivers it.
- "Drift and open points": where the clarification, the earlier note and
  the source disagree and no reviewed text settles it. Nothing there was
  decided in this delivery. Most are questions for the planner.
- "Independent check": a second reader compared each reconciled note with
  its sources, without the first writer's reasoning. Each finding is
  listed with what was done about it.
- "Checks run": the commands, and what they printed.

## How it was made

Each note was reconciled by one writer and then compared with its sources
by a separate reader. The builder dispatched both, ruled on the findings,
and checked the results. The collections note carries its clarification's
text word for word; the other three are rewritten in place.

## What this does not do

- It does not close the four original planner commitments (`489a992e` /
  `932ce20e`, `966aeaad` / `bfb563fe`, `24711ceb` / `19a020af`,
  `34cf52b3` / `6430ffd4`). Those keep their own conditions.
- It adopts nothing. A mechanism that a clarification proposes is still
  only proposed.
- It changes one paragraph of `notes/2026-10-01-artroom-plan.md`: the
  comparison with jj in section 3, replaced by the reviewed paragraph of
  the jj clarification, on the planner's direction `fceb27d0`. That is
  documentation. It adopts no runtime support. Nothing else in the plan is
  changed.
- Two corrections go beyond the reviewed clarifications, both on the
  planner's direction: the jj note describes `packages/ui/README.md` as
  that file reads on main, where the clarification's phrase was
  inaccurate; and the collections note corrects six operative passages
  that the clarification had left in conflict with its own corrections.
  Section 10 of the collections note quotes the wording each replaced. The
  clarification files themselves stay as they were reviewed.
- No external source was read again. Dated statements keep the date on
  which they were read.
