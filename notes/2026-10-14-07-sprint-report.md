# dap sprint report — Wednesday 14 October 2026, 07:00 Eastern

Sprint from 23:00 to 07:00 Eastern. Written by the planner at 06:40 from
main, the workroom and the served pages. Times are Eastern. The contest
closes tonight at 23:59 Pacific.

## What is on main and what runs

Main `3da7af83`, nine landings this sprint, 103 files, +6,558 and −471
lines from `af3d6958` (computed by `git diff --shortstat`), 89 commits,
528 workroom acts since 23:00.

| Time | Landing | What it carries |
|---|---|---|
| 00:10 | `dedcb14b` | The lending library baseline: definition, shelf, browser interface, served at `/lending/`, with real-scope tests. |
| 01:12 | `9a3e43d2` | The security repair: a destination's `reserve` now checks the sender's room and origin, reserved application names are refused, and the two witnesses refuse. Approved 00:49 after three preflights. |
| 01:34 | `47a2a4b5` | Tagged CLI agent enrollment on the current Counter and lending cohorts, with the corrected grant list in `docs/mcp.md`. Record `11e3c72b` at 02:02. |
| 01:47 | `a5d25fd6` | The Counter README rewritten around counting commitments, with two diagrams. |
| 02:07 | `26d2bc8a` | The lending member interface linked from the homepage, with its rehearsal record. |
| 05:31 | `e975b23d` | Kept invitations: `dap invite --keep`, `--check` and `--continue` on membership@4 rooms. Landed by the planner. |
| 05:31 | `94cb87de` | The publication-from-a-fold design note, Draft 5. Landed by the planner. |
| 06:00 | `3da7af83` | The join screen as Hugh asked ("Join or create a room", three cards, create first) and the demo register configuration for the hosts. |

Served pages, read by the planner at 06:36:

| Host | Serves | Evidence |
|---|---|---|
| `dap.generalbusiness.ai` | Title "dap"; links the Library | Hugh's session's homepage landing of 02:07. |
| `artroom-scope`, `/page/` | The Start deployment of about 06:07 on main `3da7af83` | `GET /v1/demo/founding-offer` answers 200 with a `platform:register@8` offer for this origin. The checker's deployment and settings audits are ratified; the cold-create witness is still marked incomplete. |
| `artroom-rehearsal`, `/page/` | Same deployment | Same offer check, its own register. |
| `artroom-counting`, `/counting/` | The security repair build of 01:50 | Title "dap - counting". |
| `artroom-jam` | Sunday's build | Deferred until after the submission. |

## What happened, 23:00 to 07:00

- The critical cross-room publication defect went from its third repair
  head to approval, landing and deployment: preflights at 23:32 and 00:49,
  formal review filed 00:22, approved 00:49, landed 01:12, served on all
  three hosts from 01:50 after the planner asked for the deployment not to
  wait for the Start head.
- The served join page could not create a room because the hosts had
  never been configured for Start. The builder's candidate passed its
  gate at 04:03 but was held until two approved heads from Hugh's
  sessions landed. Those sessions went quiet after 03:30, so the planner
  landed both at 05:31; the Start head was filed, approved and landed by
  06:00 and deployed within minutes.
- The lending library moved from design to a served member interface:
  baseline landed 00:10, the interface and homepage link at 02:07, kept
  invitations at 05:31. Hugh's direction of 00:58 is "final state,
  member interface first"; the published shelf follows the fold
  publication design, now landed as Draft 5, which the builder has
  mapped and builds next.
- The hosted MCP endpoint went through round six; the checker's verdict
  has been promised since 01:09 and a primary-report binding question for
  Hugh's MCP session is open since 01:25.
- Hugh's sessions recorded and exported the workroom demo on a prepared
  moo-mcp repository.

## Where it slowed

- The Start fix waited two and a half hours on two landings the author
  session had ratified but not pushed. Approved heads should be landed by
  whoever is awake; the planner can do it at Hugh's standing word.
- The hosted MCP round-six verdict has waited five and a half hours.
- Three repair rounds were needed because each fix changed recorded
  effects under unchanged version names; the versioning rule is now known.

## Lanes

**Core workroom and UI.** Served with the security repair, the rename,
the P2, the diagram and the Start chooser. A visitor can create a room
from the join page once the builder records the cold-create witness.

**Counter.** Recorded Tuesday; docs rewritten with diagrams.

**Lending library.** Member interface served and linked. Published shelf
pages are next, after the fold design.

**MCP.** Local service landed. Hosted endpoint in round six.

**Jam.** Unchanged. Deferred until after the submission.

## Next sprint (07:00 to 15:00)

Builder, in this order:

1. The cold-create witness and delivery assert closing `834d134c`.
2. The publication from a fold and the lending shelf pages, under
   `ebda829b` as Hugh's session steers.
3. The apps consolidation `38064e13`, hygiene `dc706047`, prettier
   `c6e29874`, before the submission tonight.
4. The P3 follow-ups after those.

Checker: hosted MCP round six first, then the builder's heads as they
arrive.

Planner: hourly surveys; the 15:00 report; Hugh decides the final
submission cut.

## For Hugh

- Read the served join page once: heading, three cards, and a create.
- The hosted MCP endpoint lands when round six approves, per your word.
- The planner landed two of your sessions' approved heads at 05:31 to
  unblock Start; say if that should not happen again without your word.
- The remaining pre-submission items are the consolidation, hygiene and
  prettier; say if any should be dropped for tonight.
