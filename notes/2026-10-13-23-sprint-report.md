# dap sprint report — Tuesday 13 October 2026, 23:00 Eastern

Sprint from 15:00 to 23:00 Eastern. Written by the planner at 22:40 from
main, the workroom and the served pages. Times are Eastern.

## What is on main and what runs

Main `b4adc8cb`, seven landings this sprint, 34 files, +1,587 and −153
lines from `d3f5aa74` (computed by `git diff --shortstat`), 44 commits,
543 workroom acts since 15:00.

| Time | Landing | What it carries |
|---|---|---|
| 15:47 | `3ca42192` | The lending library design note, Draft 5, approved as a design at 15:31. |
| 16:04 | `8235c6b3` | Discovery of application scopes through the MCP service, the corrected head after one P2 on paging consistency. |
| 16:26 | `0555cf55` | The logo's hosted delivery record: homepage, workroom and Counter hosts refreshed, served bytes read back. |
| 16:38 | `27bb745f` | The self-host guide's final publication record. |
| 18:31 | `2a40db9b` | The Counter target-100 preparation note: the recording scope, two Codex agent identities and their grants. |
| 20:29 | `7dc133e4` | The architecture diagram in the README and `docs/architecture.md`. Approved 16:53; landed by the planner at Hugh's word. |
| 20:45 | `b4adc8cb` | The CLI launcher file renamed to `dap.js`, and the security P2: `join` accepts only an https service URL, or http on loopback, with no credentials, query or fragment. Approved 18:39; landed by the planner at Hugh's word. |

Served pages, read by the planner at 22:36:

| Host | Serves | Evidence |
|---|---|---|
| `dap.generalbusiness.ai` | Title "dap" | The logo delivery of 15:00; no homepage head landed this sprint. |
| `artroom-scope`, `/page/` | Title "dap - workroom" | The logo delivery. Not redeployed since; the rename, the P2 and the security repair below are not served. |
| `artroom-rehearsal`, `/page/` | Title "dap - workroom" | Same bundle as `artroom-scope`. |
| `artroom-counting`, `/counting/` | Title "dap - counting" | The logo delivery; the Counter recording ran on it. |
| `artroom-jam` | Sunday's build | Deferred until after the submission. |

## What happened, 15:00 to 23:00

- Hugh recorded the Counter video and is satisfied with it (20:00). The
  take has three agents in open competition: a browser participant and two
  Codex CLI sessions through the local MCP service, each with its own
  macOS voice, on a fresh target-100 scope. The checker's question about
  agent enrollment on the current membership version was answered by the
  recorded route; the general fix for the documented CLI route is request
  `53850986`, built in Hugh's session and filed for review at 21:00.
- A critical security finding was confirmed at 18:49. The planner's fold
  publication design session found, by reading the source, that a declared
  application may be named `change` and that the destination's `reserve`
  handler does not check that the sender belongs to its room. The builder's
  real-scope witness opened a native publication from room A into room B.
  The checker triaged it at 19:05. The builder's first repair head was
  stopped by a replay compatibility blocker at 20:14; the corrected head
  `75453e83` passed the source preflight at 21:46 and the closed
  native-history evidence preflight at 22:17. The gate, the formal review,
  the landing and the host redeployment are still owed. The deployed hosts
  carry the defect until then.
- Hugh found at 21:05 that creating a room from the served join page fails.
  The cause is configuration, not code: the hosts never received the demo
  register and the two worker settings that the Start landing's own
  delivery note listed as owed, so the founding-offer endpoint answers 404.
  Request `834d134c` covers the configuration, a cold-create proof, Hugh's
  new copy for the join screen, and a plain-English failure message. It
  ships in the same redeploy as the repair.
- The lending library: the design was approved at 15:31 and landed; Hugh's
  separate session built the first part on `planner/lending-library-build`;
  the builder promised the full delivery at 16:03 and filed a bounded
  baseline milestone for review at 18:46.
- The hosted MCP endpoint, built in Hugh's MCP session, went through five
  review rounds (nine P2s, then three, then one, then a further round);
  round five was filed at 19:22. Hugh said at 16:46 that it may land before
  the submission once approved.
- The checker's open question about the hosted endpoint's priority was
  answered twice: review after the demo heads, and no Thursday wait.

## Where it slowed

- The builder filed no head between 16:39 and 18:30 while working the
  logo and self-host records; the approved dap.js and P2 head then waited
  two hours for a landing until the planner landed it. Two other approved
  heads (architecture diagram, 16:53; Counter note, 18:21) also waited on
  their authors.
- The security repair has taken from 18:49 to past 22:30 through two
  preflights. It is the right order, but the hosts stay exposed meanwhile.
- The checker holds three promised reviews without verdicts: the lending
  baseline (promised 18:48), the hosted MCP round five (19:24) and the
  enrollment head (21:01). Its preflights on the repair took precedence.
- The Start landing of 12:12 was never configured on the hosts. A landing
  that needs a deployment step should carry a served-commit assert before
  it counts as delivered; the 15:00 report's rule for the logo applies to
  every host-facing head.

## Lanes

**Core workroom and UI.** Main carries the rename, the P2, the diagram and
the docs. The served workroom is behind main and cannot create a room.
Next: the security repair, then the Start host configuration and join
screen, one redeploy for both, with a served-commit assert.

**Counter.** Recorded. The enrollment compatibility head is in review.

**Lending library.** Design landed; baseline milestone in review; the full
delivery follows the fold publication design, whose Draft 3 had changes
requested at 16:12.

**MCP.** Local discovery landed. The hosted endpoint is in round five.

**Jam.** Unchanged. Deferred until after the submission.

## Next sprint (23:00 to 07:00)

Builder, in this order:

1. The security repair under `2ce4730e`: gate, exact-head review, land.
2. The Start host configuration and join screen, `834d134c`, landed and
   deployed with the repair; served-commit assert; Hugh reads the page.
3. The lending baseline landing when approved, then the full delivery
   `ebda829b` as the fold design allows.
4. The enrollment compatibility `53850986` landing when approved.
5. The apps consolidation `38064e13`, hygiene `dc706047`, prettier
   `c6e29874`.

Checker: the repair head the moment it is filed; then the lending baseline
`0d308612`, the hosted MCP round five `2e607432`, the enrollment head
`9fe32cab`; then the Start head; then verifications of tonight's two
planner landings.

Planner: hourly surveys; the 07:00 report; the fold publication Draft 4,
the Counter script revision and the roadmap revision are owed by Hugh's
sessions.

## For Hugh

- The served workroom cannot create a room until `834d134c` ships. Read
  the join page again after the builder says the redeploy is done.
- The hosted MCP endpoint lands when round five approves; say if it should
  wait after all.
- The origin remote of the shared checkout still points at the old
  repository name; GitHub redirects it. Update it when convenient.
