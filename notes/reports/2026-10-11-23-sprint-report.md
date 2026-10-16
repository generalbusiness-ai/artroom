# dap sprint report — Sunday 11 October 2026, 23:00 Eastern

Sprint from 15:00 to 23:00 on 11 October. Written by the planner at
22:40. The contest closes on Wednesday 14 October at 23:59 Pacific. The
freeze is Monday 12 October at 23:00 Eastern; Hugh rehearses on Monday
and records on Tuesday. Hugh's direction (assert `5be4288a`) stands:
complete on main and deploy on Cloudflare the Counter, the core workroom
with its UI, and the jam.

## What is on main and what runs

Build: main `da54981d`, landed 22:20. Thirty commits this sprint, 91
files, +2,477 and −130 lines from `a92b64cb` (computed by `git diff
--shortstat`).

| Time | Landing | What it carries |
|---|---|---|
| 16:27 | `0e8d5b5e` | The brand kit: supplied artwork, fonts, guidelines and offline generators, approved by the checker at 12:47. |
| 16:37, 17:15 | `64b8f979`, `e304102b` | The practice script for Hugh's recording, accepted by the planner, then the create and change wording. Plan 030 glossary corrected at `87e4b6be`. |
| 19:32 | `49aa5852` | Plan 030: four changes after the second entrant sweep (the words rule as a gate, the no-merge sentence, one observed number, the Counter beat line). |
| 19:45 | `3d400d49` | Page branding on the room page, the Counter stage and the jam page: tokens, self-hosted fonts, zero radius, cut buttons, wordmarks, favicons, the "dap." acknowledgement. Approved 19:39 after a full review. |
| 21:19 | `1b1278ee` | Plan 030: the Counter demo head moved before the freeze; the guard estimate recorded; the checker's order. |
| 22:11, 22:20 | `58f25812`, `da54981d` | The stale-base rehearsal shot (plan 030 step 3) as a bounded child of its request: both changes admitted on one base, the second merge refused out-of-date, re-proposed on the new head as a fresh change and published; 27 runner shots; the observed run on the isolated host. Approved 22:08. |

Deployments, read from the Cloudflare deployment list by the planner:

| Host | Version | Deployed | From |
|---|---|---|---|
| `artroom-scope` | `c3fdd2a1` | 20:00 | Main `3d400d49`, the branded room page, by the builder. |
| `artroom-counting` | `f9d0370c` | 20:50 | Main `3d400d49`, the branded Counter, by the planner at Hugh's direction; served assets equal main by SHA-256. |
| `artroom-jam` | `9f2f508f` | 19:49 | The jam procedural page with the branding, by the builder. |
| `artroom-rehearsal` | `a06502bd` | 21:38 | The stale-shot candidate; the observed run was taken here. |

The one number for the video, as plan 030 item 3 asks: the time from the
stale merge attempt to its refusal, 2,586.6 ms, observed run with the
runner's own timer on the isolated host at 21:40, recorded in
`docs/demo.md`.

## What happened, 15:00 to 23:00

| Time | Event |
|---|---|
| 16:22 | Builder resumes after a pause since 13:08; lands the kit and the practice script. |
| 16:51 | Page design head promised; reordered ahead of the rename at 16:45 so Hugh rehearses on the branded pages. |
| 17:30 | Stale-base shot found to need hold staging in its same-lane form; planner adopts the fresh-lane form for the video, same-lane owed after the submission. |
| 18:09 | Two hosted-service planner requests filed by the second planner session (domain and production register; hosted design note). Both are after the recording. |
| 18:20 to 19:45 | Builder restarts again, deploys the page candidate to the isolated host, files it for review; approved and landed. |
| 18:46 | Hugh's four demo-plan changes after the entrant sweep; plan 030 updated at 19:32. |
| 20:00 to 20:50 | Room page, jam and Counter hosts redeployed from the branded main. |
| 20:21 to 22:08 | Three review rounds on the stale-base shot: the checker required a bounded child so the same-lane commitment stays open; the planner filed it at 20:31; source ready at 21:28; the hosted run observed and approved. |
| 21:10 to 21:30 | Counter design review (request `e04c3b81`, second planner session) and two Hugh-approved mockups. Hugh: the Counter is the first demo he records; the demo may persist the signing key; the Counter work goes before the freeze. |
| 21:26 | Builder promises the Counter demo head at twelve hours and asks that the slip rule hit the docs head first. Planner applies it at 21:45. |
| 22:27 | Hugh, through the builder: the page's join flow is unusable; rework it with an explicit path chooser, invitation links that create a key and join, and no settings vocabulary. |

## Where it slowed

The stale-base shot took three review rounds, two of them on binding
rather than code: the first review would have closed the whole request,
including the same-lane form owed after the submission, and the fix was
a bounded child request from the planner. Two builder restarts cost
about an hour each. The second planner session files under the same
planner key with times labelled four hours late (UTC written as
Eastern); the plans carry the corrected times.

## Lanes

| Lane | State at 23:00 | What closes it |
|---|---|---|
| Core workroom and UI | Branded page deployed; stale-base shot landed with its observed run; join flow rework requested by Hugh | Join flow head reviewed, landed and redeployed; rehearsal on Monday |
| Counter | Lock repair and branding deployed; Counter demo head promised (one demo file with three identities and a remembered non-extractable key, one Join, automatic turns, en-US voices, stable controls) | Candidate on the isolated host Monday afternoon; full review; land and redeploy before 23:00 Monday |
| Jam | Procedural page branded and deployed | Unchanged; native only after the submission |
| dap rename and docs | Rename head and docs head promised; docs head reduced to the product-name-only form before the freeze | Rename head after the Counter and join flow heads; minimal rename as the fallback for publication |
| Design | Kit and page branding on main; READMEs with the wordmark inside the docs head | The docs head |

## Next sprint (23:00 to 07:00)

1. Builder: the Counter demo head and the join flow head, in parallel
   where possible; the rename head after them.
2. Checker: the Counter head and the join flow head as they arrive
   (full), then the rename head.
3. Planner: hourly surveys; the 07:00 report; decide by Monday noon
   whether the rename head or the minimal rename publishes.

## For Hugh

1. Rehearse Monday from `notes/reports/2026-10-11-practice-script.md` on main.
   The branded room page, Counter and jam are deployed now. The Counter
   candidate with the new Join flow is due on the isolated host Monday
   afternoon; until then the deployed Counter has the current Connect
   dialog.
2. The words gate: the practice script passes the three-part test once
   the no-merge sentence, the Counter line and the observed numbers are
   added (builder request filed 19:32). The glossary row "Ada promised
   43" stands, as you confirmed.
3. The concern path guard is not in the video; the narrated line over
   the rules refusal stands in. The guard is built in full after the
   submission.

## Addendum, 22:55

Between the report and the boundary, the second planner session delivered
with Hugh a design-first preview of the page's entry: "Start a room" as
the first run (email and room name, a key prepared in the browser, email
verification before the claim under the hosted service register), then
the invitation, CLI and agent connections; and for an existing room a
chooser with two paths, a pasted invitation that creates a key and joins,
or a config file with its matching key and one Join action. No source
changed; the gate ran once at the unchanged main. The planner's reading
for the freeze: the join flow head implements the chooser and its two
paths, removes the settings vocabulary and hides the room navigation
before a room is loaded; "Start a room" with email verification is the
hosted service's work after the submission, under the hosted design
request. Hugh may correct this.

Times are Eastern. Event times come from workroom act times and Git
history. Deployment versions come from the Cloudflare deployment list
read by the planner. Review verdicts are the checker's; the observed
timing is the builder's run on the isolated host, recorded in
`docs/demo.md` on main.
