# Plan 030: the demo plan to the 14th, re-cut

Planner, 11 October 2026, 14:10 Eastern. Successor to plan 024. Direction
from Hugh, recorded in planner request `36372c32`: record the positioning,
re-order the video, and add the rules requirements for the concurrent-edit
story. Hugh records the video himself with voice-over and rehearses on
Monday 12 October; the practice script (builder request `f77085ed`, due
tonight) is the shot list he rehearses from.

Dates. Today, 11 October 2026, is a Sunday. The freeze is Monday 12
October at 23:00 Eastern: Hugh's "Monday" (08:15) and the request's
"2026-10-12" are the same day. Plan 028 named the weekdays wrong and its
"Monday 13 October" means this Monday. The recording is Tuesday 13
October and the submission closes Wednesday 14 October at 23:59 Pacific.

One assumption: the lead phrase below is the claim of the video and the
README, and plan 028's sentence ("a framework for building collaborative
applications for people and agents, on an event-sourced actor model") is
the description that follows it. Hugh may change it.

Estimates decide what is live in the video, never what is built. Hugh's
standing direction is that schedule estimates do not constrain
functionality: every step below keeps its owner and its request, and the
complete work proceeds with review as progress is made, after the
submission where it does not fit before the freeze.

## Positioning

The lead claim: dap is a programmable, general-purpose coordination
fabric. The verifier line, "nothing you saw depends on trusting our
database", stays as the supporting proof, not the way in.

The hosting surface, said once, never as a service count: Cloudflare
Artifacts holds one repository per destination. The Worker runs the room
and keeps its scope journal; the same room can publish to GitHub. Published
pages carry signer-authored text, whose faithfulness to the journal is not
checked by the scope. A fork for each hold remains the unbuilt design in
plan 029; the original per-hold repository wording described that intended
design.

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
- Fallback, for the video only: if the builder's estimate does not fit
  before the freeze, the beat becomes one narrated line over the existing
  refusal shot (shot 10 of the 7 October script, the change to the rules
  extent refused by name). The guard itself is built in full regardless,
  under the same request, with its witness, gate and full review, after
  the docs head and after the submission if need be.
- Estimate: the builder states it against the freeze; the planner expects
  it not to fit beside the rename and docs heads, and plans the narrated
  line for the video.

## Order of the builder's work, and nothing beside it

1. Land the brand kit; deploy the Counter host from main `2614a82a`.
2. The practice script (`f77085ed`), tonight.
3. Step 3, the stale-base rehearsal shot, with its observed run (the
   distinct-lane child for the freeze; the same-lane form after the
   submission).
4. The Counter demo head (Hugh, 11 October 21:15: the Counter is the
   first demo he records, and the demo may persist the signing key): one
   identity bundle remembered in the browser as a non-extractable key,
   one Join in place of Participate, Activate and Arm, automatic turns,
   and the three presentation fixes from the design review of request
   `e04c3b81`. Candidate on the isolated host Monday afternoon for the
   rehearsal; landed and redeployed before the freeze.
5. The component rename head (plan 028 step 2).
6. The documentation head (plan 028 step 3), carrying the positioning.
7. Step 1, the concern path guard: the builder's estimate (eight hours
   after the docs head) does not fit before the freeze, so the video
   takes the narrated line; the guard is built in full after the docs
   head and the submission.
8. Redeploy every host, rehearse the 26 (now 27) shots, publish the six
   packages as `dap-*`.
9. The fork cost measurement (plan 029 item 0) only in an idle hour.

The checker's order follows: the stale-base child, the Counter head
(full), the rename head, the docs head.

The stale-base shot is an evidence review, not a full one; the others
are full reviews.

## Gates, re-cut

| Date (Eastern) | Gate | Owner |
|---|---|---|
| Sun 11 Oct, 22:00 | Practice script on main | Builder |
| Mon 12 Oct | Rehearsal day: Hugh runs every part from the practice script on the deployed hosts; the stale-base shot observed; the rename head reviewed and landed; the docs head reviewed | Hugh, builder, checker |
| Mon 12 Oct, before 23:00 | Glossary gate: every line of the practice script passes the three-part words test; the no-merge sentence and the Counter line present; the pass recorded in the sprint report | Planner, builder |
| Mon 12 Oct, 23:00 | Freeze: docs head landed, hosts redeployed from the renamed main, packages published | All |
| Tue 13 Oct | Recording from the frozen main | Hugh |
| Wed 14 Oct | Submission by 23:59 Pacific | Hugh |

If a gate slips by more than half a day, the next one moves down a level:
the concurrency beat to narration; the docs head to the product-name-only
rename; the jam to the procedural page as it is.

## Four changes after the second entrant sweep

Direction from Hugh, 11 October 18:45 Eastern, recorded in planner request
`5b61978d` after the second sweep of the field (a code search on Artifacts identifiers found about twenty more entrants; the
strongest ones read well because they use one plain vocabulary, and one of
them leads with a results table and a long video).

1. Words first. The words rule and glossary below are a gate on the shot
   list before the freeze, not a later pass: before Monday 23:00 every
   caption, page label and narrated line in the practice script passes
   the three-part test, and the planner records the pass in the sprint
   report. The gates table carries this row.
2. Say that we chose not to merge text. One sentence in the repository
   segment, in plain words, right before the concurrency beat: "A clean
   textual merge can still be wrong, and only a test catches it, if one
   exists. So the room never merges text: it prevents by rule, composes
   by selection, and refuses when stale." The three-step ladder above
   stays as requested; this sentence names it.
3. Show one number, labelled by how it was taken. The cheapest honest
   number we own is the count from the scripted rehearsal run on the
   isolated host once the stale-base shot lands: shots run, holds taken,
   refusals, publications, and the time from the stale merge attempt to
   its refusal, each labelled "observed run" on screen with the host and
   the run's date. The fork cost measurement (plan 029 item 0) replaces it
   only if the idle hour comes before the freeze; its labels are "observed
   run" or "metrics read". No proxy and no reconstruction is presented as
   a measurement. The builder's stale-base shot request records the time
   to refuse from the observed run; the practice script carries the
   numbers once observed.
4. The order stands: repository, then Counter and jam on the same fabric,
   then back to the repository. Within the Counter segment, name the
   concurrency beat in so many words within its first minute: "a merge
   conflict with the code removed: three agents, one shared state,
   exclusive turns, an expiry, a restart, every turn signed", and say why
   three is the honest number: two is a handoff, three is the smallest
   count that shows a contested turn, a bystander tracking the shared
   state, and a restart at once; more adds nothing the record does not
   already show. The hosting surface is one line, not a service count:
   Artifacts holds one repository per destination, the Worker runs the
   room and keeps its scope journal, and the same room can publish to
   GitHub. Published pages carry signer-authored text; the scope does not
   check its faithfulness to the journal. Per-hold forks remain the
   unbuilt plan 029 design.

The practice script is amended by a builder request filed with this
section: the no-merge sentence verbatim in section 1, the Counter line in
section 2, and the observed numbers in section 1 once the stale-base shot
has run.

## The words

Direction from Hugh, recorded in planner request `1efcbdc0`: the demo's
words follow the platform's own split, and the plain words are shared
across the three applications on purpose. The model needs about
twenty-five exact terms; the demo does not. The rule, applied to every
caption, page label and narrated line:

1. If the word names a thing the application owns, use the application's
   word. The repository says issue, change, assign, merge, branch,
   clone. The Counter says turn, count, next. The jam says theme,
   instrument, solo, bar.
2. If the word names something the room does to that thing, use the one
   shared plain word, the same in all three segments: a promise (offered,
   taken, kept), working on it with a time limit, allowed to, refused
   because (the plain reason, never the guard's name), the rules, the
   record, the room.
3. If the word names a rule, say which rule.

The sameness must be seen, not asserted: "Paul promised issue #1", "the
synth agent promised the next bar", "device B promised the next count".

Glossary, record word then surface word:

| Record | Surface |
|---|---|
| scope, entry, act | the room, a step, an action |
| found, claim | create (a person creates a room; nobody says found) |
| commitment: offered, accepted, fulfilled | a promise: offered, taken, kept |
| hold | working on it, with a time limit |
| plan, concern | the split, a part |
| report, accept-report | handed in, accepted |
| manifest | a version of the change (the page says change, not pull request; Hugh 11 Oct 17:00) |
| integration commit | the combined commit |
| extent | an area of the repository |
| rules scope, controller | the rules, the person who owns them |
| destination | the repository (the role a repository plays for a room; a Counter or jam room has one too) |
| register, directory, membership, inbox | not said |
| grant | allowed to |
| guard failed with reason x | refused, because x, in plain words |
| reservation, receipt, first head | not said; "published" and "checked" |

Four words stay as they are because they carry the claim: room, record,
rules, refused. The practice script carries this section as its glossary,
and every line in it passes the three-part test.

## What changes in the shot list

The practice script of tonight is the shot list Hugh rehearses from and
supersedes the 7 October draft for the recording. It carries the order
above, the concurrency beat after the first publication, the one-line
hosting surface, and section 8 of the 7 October script (sentences that
must not be said) by reference. Where the script of 7 October has
observed lines, they stay; the stale-base shot's lines are added from its
observed run.
