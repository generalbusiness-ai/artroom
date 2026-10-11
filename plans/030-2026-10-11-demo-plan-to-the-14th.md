# Plan 030: the demo plan to the 14th, re-cut

Planner, 11 October 2026, 14:10 Eastern. Successor to plan 024. Direction
from Hugh, recorded in planner request `36372c32`: record the positioning,
re-order the video, and add the rules requirements for the concurrent-edit
story. Hugh records the video himself with voice-over and rehearses on
Sunday 12 October; the practice script (builder request `f77085ed`, due
tonight) is the shot list he rehearses from.

Two assumptions, stated because the request and the morning's direction
differ. The freeze is Monday 13 October, as Hugh said at 08:15 (plan 028);
the request says Sunday 12. The lead phrase below is the claim of the
video and the README; plan 028's sentence ("a framework for building
collaborative applications for people and agents, on an event-sourced
actor model") is the description that follows it. Hugh may change either.

## Positioning

The lead claim: dap is a programmable, general-purpose coordination
fabric. The verifier line, "nothing you saw depends on trusting our
database", stays as the supporting proof, not the way in.

The hosting surface, said once in one line: a Worker, the hosting's own
Git service as the repository host, the published pages, and the same
record running on GitHub.

## The order of the video

| Part | What is shown | Time |
|---|---|---|
| 1. Open | The repository story: issue, comment, assign, change, refusal under rules, approval, publication. The concurrency beat (below) comes early, right after the first publication. | 0:00 to 3:45 |
| 2. The same fabric, a Counter | Three browsers, Arm, Start, voices; the record it writes | 3:45 to 4:45 |
| 3. The same fabric, a jam | The procedural page, about 20 seconds; one line | 4:45 to 5:15 |
| 4. Back to the repository | GitHub as the linked host; the verifier; "that is why the Git story can be whatever your team's rules say" | 5:15 to 6:15 |
| 5. What is next | One card | 6:15 to 6:40 |

Total 6:40 under the seven-minute ceiling. The 7 October script filled
6:30 with the repository story alone; its shots 3 to 7 (found, invite,
join, clone, page) compress to one minute, said over the page rather than
typed, and shot 12 (the verifier) moves to part 4.

## The concurrent-edit story: a three-step ladder

Each step is a recorded act with a named reason. No textual merge
anywhere.

### Step 3 first: refused when stale

Two changes on the same base. The first publishes. The second is refused
`out-of-date` (reservation check 1 in
`packages/platform/src/reservation.ts`: the manifest's base is not the
head just read) and is re-proposed on the new head by its integrator.
Said: "the loser is not patched by a model; it is re-proposed under the
same rules".

- On main today: the check and its reason; `propose-manifest` with a new
  base; the demo runner (`scripts/demo-run.ts`, `docs/demo.md`) with 26
  shots and no stale-base shot.
- To build: one runner shot, after shot 19 (the published change): a
  second change proposed on the old base, its merge refused
  `out-of-date`, re-proposed on the new head, published. Its expected
  lines come from an observed run on the rehearsal host. `docs/demo.md`
  gains the row.
- Witness: the runner's table says "yes" for the new shot on the
  rehearsal host; the transcript shows the refusal line with its reason
  and the second publication.
- Fallback: none needed; this is the cheapest step and goes first.
- Estimate: the builder states it; the planner expects under three hours.

### Step 2: composed by selection

One issue; a sealed plan with two concerns; two agents, each under a hold
(each in its own fork once plan 029 lands; until then, each under its
grant and hold as the record already enforces). Each returns a report.
The integrator proposes a manifest selecting both reports. The destination
checks that both report commits are ancestors of the integration commit
and that the base is the head, and publishes one integration commit.
Said: "nothing merged this; the room checked that it was composed from
exactly these two accepted pieces".

- On main today: plans, concerns (`add-concern`), reports, manifests that
  select reports, and reservation check 2 (tree, first parent, each
  selected report's commit an ancestor). `packages/lanes/test/manifest.scope.test.ts`
  runs two concerns and a manifest over both.
- To build: nothing in the model. A runner shot or a page sequence that
  shows the two reports and the manifest selecting them, with the
  observed lines, if time remains after step 3 and the rename.
- Witness: the shot's row says "yes"; the destination's publication entry
  names both report commits.
- Fallback: the beat becomes two sentences over the existing publication
  shot, with the manifest's selection shown in the page.
- Estimate: the builder states it.

### Step 1: prevented by rule

A concern declares the paths it covers (a new field on `add-concern`). A
report whose tree, against the concern's base, touches a path outside its
concern is refused with a named reason, `path-outside-concern`. The path
judgment reuses the extents classifier in
`packages/platform/src/extents.ts`. Because lanes are data, this is a
definition change in `packages/lanes` plus the guard's code, and the demo
says so.

- On main today: `add-concern` without a paths field; the extents
  classifier; report acceptance without a tree check against the concern.
- To build: the field; the guard, which reads the report's tree against
  the concern's base and classifies each changed path; the refusal
  reason; a scenario test; the lane definition's pin updated.
- Witness: a lane scenario in which a report outside its concern's paths
  is refused `path-outside-concern` and the same report inside them is
  accepted; the gate passes; the checker's full review.
- Fallback: if the builder's estimate does not fit before the freeze,
  the beat becomes one narrated line over the existing refusal shot
  (shot 10 of the 7 October script, the change to the rules extent
  refused by name).
- Estimate: the builder states it against the freeze; the planner expects
  it not to fit beside the rename and docs heads, and plans the narrated
  line.

## Order of the builder's work, and nothing beside it

1. Land the brand kit; deploy the Counter host from main `2614a82a`.
2. The practice script (`f77085ed`), tonight.
3. Step 3, the stale-base rehearsal shot, with its observed run.
4. The component rename head (plan 028 step 2).
5. The documentation head (plan 028 step 3), carrying the positioning.
6. Step 1, the concern path guard, only if its estimate fits before
   Monday; otherwise the narrated line.
7. Redeploy every host, rehearse the 26 (now 27) shots, publish the six
   packages as `dap-*`.
8. The fork cost measurement (plan 029 item 0) only in an idle hour.

The checker's order stays as set: the rename head, then the docs head,
then the guard head if filed. The stale-base shot is an evidence review,
not a full one.

## Gates, re-cut

| Date (Eastern) | Gate | Owner |
|---|---|---|
| Sat 11 Oct, 22:00 | Practice script on main | Builder |
| Sun 12 Oct | Rehearsal day: Hugh runs every part from the practice script on the deployed hosts; the stale-base shot observed; the rename head reviewed | Hugh, builder, checker |
| Mon 13 Oct | Freeze: docs head landed, hosts redeployed from the renamed main, packages published; recording | All |
| Tue 14 Oct | Submission by 23:59 Pacific | Hugh |

If a gate slips by more than half a day, the next one moves down a level:
the concurrency beat to narration; the docs head to the product-name-only
rename; the jam to the procedural page as it is.

## What changes in the shot list

The practice script of tonight is the shot list Hugh rehearses from and
supersedes the 7 October draft for the recording. It carries the order
above, the concurrency beat after the first publication, the one-line
hosting surface, and section 8 of the 7 October script (sentences that
must not be said) by reference. Where the script of 7 October has
observed lines, they stay; the stale-base shot's lines are added from its
observed run.
