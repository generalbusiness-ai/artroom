# dap sprint report — Sunday 11 October 2026, 15:00 Eastern

Sprint from 07:00 to 15:00 on 11 October. Written by the planner at
14:45. The contest closes on Wednesday 14 October at 23:59 Pacific. Hugh's
direction (assert `5be4288a`) stands: complete on main and deploy on
Cloudflare the Counter, the core workroom with its UI, and the jam.

Dates, corrected. Today is Sunday 11 October. The freeze is Monday 12
October at 23:00 Eastern; plan 028 and the morning's acts called that day
"Monday 13 October", a wrong weekday for the same day. The recording is
Tuesday 13 October.

## What is on main and what runs

Build: main `a92b64cb`, landed 14:32. Seventeen commits this sprint, 24
files, +937 and −64 lines from `4cbc5a1a` (computed by `git diff --stat`).

| Time | Landing | What it carries |
|---|---|---|
| 07:39 | `cef4b25b` | Counter voice-selection refresh repair (the stage no longer disarms silently on a voice change), approved by the checker. |
| 08:00 | `55b5f5e3` | Plan 028: rename to dap, framework first, docs one mode per page. |
| 09:00 | `e0bf51f3` | Page review binding: an ordinary review now binds to the selected native request, so a merge resolves the review request (the 06:53 walkthrough defect). |
| 12:41 | `2614a82a` | Counter pre-audio lock repair: a stale lock grant no longer keeps a reservation, so a fresh pledge writes its marker and plays. Approved 12:36 at `6a86738e`. |
| 13:32, 13:33 | `40c7a6e1`, `0acad1e0` | Plans 029 (a fork for each hold) and 030 (the demo plan re-cut). |
| 14:32 | `a92b64cb` | Corrections to both plans after the checker's review: dates, no destination token in any fallback, the fork as custody evidence, the words rule and glossary. |

Deployments, read from the Cloudflare deployment list by the planner:

| Host | Version | Deployed | From |
|---|---|---|---|
| `artroom-counting` | `b693d767` | 12:47 | The repaired Counter, main `2614a82a` by the builder's deployment; the builder has not yet reported it in the workroom. |
| `artroom-scope` | `34dc12b9` | 03:24 | Main `3bd18314`. The page review binding of 09:00 is not yet deployed here. |
| `artroom-rehearsal` | `79b41fbd` | 03:43 | Same code, isolated register and settings. |
| `artroom-jam` | `bb894888` | 01:45 | Jam main `990dcbf`, the procedural page. |

The brand kit head `37a9bd0b` (48 kit files, fonts and licences, the
garnet tokens, a note) was approved by the checker at 12:47 and has not
landed yet.

## What happened, 07:00 to 15:00

| Time | Event |
|---|---|
| 07:02 | Checker returns; clears the deployment evidence, the Counter voice repair and the page binding in turn. |
| 07:20 to 08:15 | Hugh: the project is dap; the six public packages publish as `@generalbusiness/dap-*`; the full rename and the documentation change land before the deadline; the freeze moves to Monday. Plan 028 lands. |
| 09:46 | Codex restarts; the builder loses its temporary diagnostics and the checkout's dependency links, and rebuilds them outside the checkout. Main stays clean. |
| 10:13 | Checker reports the two naming verdicts; no landing before the freeze. |
| 11:22 | Builder finds the Counter root cause with a witness on main: the voice controller records its reservation before taking the lock. Repair filed, promised, landed by 12:41. |
| 11:44 | Brand kit head filed for review; the kit's three later font files are left for the page design lane. |
| 12:36, 12:47 | Checker approves the Counter repair and the brand kit. |
| 12:50 | Hugh files two planner requests: a detailed forks plan, and the demo plan re-cut with the positioning and a three-step concurrency ladder. A third at 14:08: the words rule and glossary. |
| 12:52 | Planner files the practice script for Hugh's own recording, due 22:00. |
| 13:33 | Plans 029 and 030 land. Builder requests filed: the stale-base rehearsal shot, the concern path guard. |
| 13:36 to 14:33 | Checker asks two qualifications of plan 029 and one of plan 030; planner corrects both plans and answers. |

## Where it slowed

The builder's last workroom act was at 12:44; the Counter deployment at
12:47 shows it working. The practice script (`f77085ed`) is not yet
promised at 14:45, with 22:00 as its time. The screen-recording
preflight returned false after the restart; the recorder is launched by
the daemon process that did not restart. Hugh records the demo himself,
so capture is off the critical path.

## Lanes

| Lane | State at 15:00 | What closes it |
|---|---|---|
| Core workroom and UI | Review binding on main, not deployed; 26-shot rehearsal matched on the isolated host at 03:50 | Redeploy from the renamed main; the stale-base shot observed; the GitHub-host rehearsal on the isolated Worker |
| Counter | Lock repair landed and deployed; no three-device run with speech since the repair | The three-device run on `b693d767`; the unexplained page close observed or ruled out |
| Jam | Procedural page live; native branch awaits its P3 and a review | Unchanged this sprint; native only if time remains |
| dap rename and docs | Plan 028; rename head and docs head promised; lead claim and glossary settled in plan 030 | Rename head Sunday night, docs head Monday, redeploy and publish before 23:00 Monday |
| Design | Kit approved, landing pending; page design lane after the rename; sample page shown to Hugh | Kit landed; page head after the rename |

## Next sprint (15:00 to 23:00)

1. Builder: land the kit; report the Counter deployment; the practice
   script on main by 22:00 with the glossary; the stale-base rehearsal
   shot with its observed run; begin the rename head.
2. Checker: the rename head when it comes (full); the stale-base shot
   (evidence). Nothing else.
3. Builder: the Counter three-device run on the repaired deployment,
   without capture, evidence as filed.
4. Planner: hourly surveys; the 23:00 report; check the practice script
   against the glossary on acceptance.

## For Hugh

1. The practice script lands tonight at `notes/reports/2026-10-11-practice-script.md`
   on main. Monday is the rehearsal day; Tuesday the recording.
2. Confirm the lead phrase: "dap is a programmable, general-purpose
   coordination fabric", with plan 028's framework sentence as its
   description. The docs head is amended to that reading.
3. Screen capture, if still wanted: the recorder's launcher is the Codex
   daemon process started on 29 September, which the restart did not
   replace. Quitting the daemon fully would be the next thing to try. Not
   needed for your own recording.

Times are Eastern. Event times come from workroom act times and Git
history. Deployment versions come from the Cloudflare deployment list
read by the planner. Review verdicts are the checker's; evidence not yet
reviewed is marked as the builder's.
