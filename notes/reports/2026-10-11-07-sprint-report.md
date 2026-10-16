# Artroom sprint report — 11 October 2026, 07:00 Eastern

Sprint from 23:00 on 10 October to 07:00 on 11 October. Written by the
planner at 06:40. The contest closes on Wednesday 14 October at 23:59
Pacific. Hugh's direction (assert `5be4288a`) stands: complete on main and
deploy on Cloudflare the Counter, the core workroom with its UI, and the
jam.

## What is on main and what runs

Build: main `3bd18314`, landed 03:21. Three landings this sprint, after
twelve hours with none:

| Time | Landing | What it carries |
|---|---|---|
| 02:55 | `04d6fd4a` | The corrected UI and Counter head `d2264140`: completed redesign, Counter commitments and cohort, browser stage, the `/counting/` route, the two P2 repairs the checker asked for (retained-command audio fence, expired-plan recovery). |
| 03:17 | `fef67109` | The six-package public SDK source, with its producer and checker scripts. No npm publication. |
| 03:21 | `3bd18314` | The application bootstrap correction with safe expired-unsent guidance for both cohorts. |

Main moved from `f722bc22` to `3bd18314` by 81 files, +4,292 and −495
lines (computed by `git diff --stat`).

Deployments, all from main `3bd18314` unless stated:

| Host | Version | Deployed | What it serves |
|---|---|---|---|
| `artroom-scope.inguz.workers.dev` | `34dc12b9` | 03:24 | `/page/` and `/counting/`. Settings and secrets preserved; the Core register pin untouched. |
| `artroom-rehearsal.inguz.workers.dev` | `79b41fbd` | about 03:45 | Same code, isolated register, database and settings, for rehearsals. |
| `artroom-counting.inguz.workers.dev` | `7dcf99d9` | 03:24, from `04d6fd4a` | The Counter host: its own register, a created GitHub repository, three agent members enrolled by their own keys and a person controller. |
| `artroom-jam.inguz.workers.dev` | `bb894888` | 01:45, from jam main `990dcbf` | The local procedural jam page, labelled as such. |

The 26-shot story of plan 019 ran against the isolated rehearsal host
with the artifacts adapter: all 26 shots matched, with the expected
refusals at shots 17 and 20 (builder act `ce1611a64`; transcript digest
`b2253da4…`). The run took 317 seconds of wall time, 227 of them the
operator's pin wait (reported by the runner, not an independent
measurement). This is the first full match since rehearsal 2 on 8
October, and the first against a deployment of the current main.

## What happened, 23:00 to 07:00

| Time | Event |
|---|---|
| 01:24 | Checker returns after twelve hours away and promises the combined review. |
| 01:38 | Stand-in report for the missed 15:00 and 23:00 boundaries lands (`2afd83b6`). |
| 01:47 to 02:04 | Checker's verdict on `fb6f923e`: changes requested (two P2). Builder repairs to `d2264140`. |
| 02:35 to 02:55 | Repaired head reviewed and landed (`04d6fd4a`). |
| 03:11 to 03:21 | Checker approves the cohort successor; SDK and application correction land. Checker's last act at 03:14. |
| 03:24 | Scope Worker deployed from main (`34dc12b9`); Counter host deployed. |
| 03:32 | Planner: rehearse on an isolated Worker; never mutate the live host's settings (`14c7d3d3`). |
| 03:50 | Isolated rehearsal: 26 of 26 match. |
| 04:10 | Counter provisioning complete; recording blocked on a macOS screen-recording grant. |
| 04:25 to 05:17 | Jam: six tarballs pinned by digest on `request/jam-native-integration` (`654e5709`); review `1eee58df0` filed. |
| 04:51 | Counter defect found during the browser run (changing the voice silently disarmed the stage); repaired at `24d8e71f`, review `fd6a703a1` filed. |
| 05:34 to 06:30 | Browser walkthrough evidence on main: an issue created, commented and closed; a change proposed with new rules and a file. Two of the wrapper runs stopped early and are recorded as stops, not passes. |
| 06:53 | Walkthrough finds a UI defect: a review verdict submitted without naming the open review request leaves that request unresolved after merge. Builder filed the fix (`b2eccf8dd`) and owns it. |

## Where it slowed

The checker has not acted since 03:14. Three demo reviews wait unclaimed:
the deployment and rehearsal evidence (`46b7b7c22`, filed 03:52), the
Counter repair (`fd6a703a1`, 04:51) and the native jam branch
(`1eee58df0`, 05:17). The planner nudged at 05:35 and 06:35. Nothing can
land until the checker returns; the builder is not blocked and is
producing evidence on main.

## Lanes

| Lane | State at 07:00 | What closes it |
|---|---|---|
| Core workroom and UI | On main and deployed; 26-shot rehearsal matched on the isolated host; browser evidence for issue, comment, close and proposal; one UI defect found (review request left unresolved), fix in progress | Checker's evidence review; the review-binding fix landed; a GitHub-host rehearsal on the live host once Hugh pins the register |
| Counter | Deployed and provisioned with three agents and a controller; the Arm/voice repair awaits review; no run with speech yet | Review of `24d8e71f`, then the three-device run with distinct voices; recording once macOS allows capture |
| Jam | Procedural page live; native branch built against the pinned SDK tarballs, unreviewed; model binding checked in documentation only | Review `1eee58df0`; a native deployment only after it, and only if time remains before the freeze |

## Next sprint (07:00 to 15:00)

1. Checker: `46b7b7c22` first (evidence only, no rerun), then
   `fd6a703a1`, then `1eee58df0`. Naming reviews `4757b2cc` and
   `56718deb` after the 14th.
2. Builder: the three-device Counter run with Arm, Start and speech,
   without capture, on the repaired head; keep every evidence packet as
   filed. Then the UI walkthrough as a single recorded sequence.
3. Builder: no change to the deployed procedural jam page until the
   native branch is reviewed.
4. Planner: hourly surveys; the 15:00 report; retire requests closed by
   this sprint's landings.

## For Hugh

1. Grant Screen Recording to the Counter recorder process (System
   Settings, Privacy and Security). Capture preflight returns false until
   then.
2. The GitHub-host rehearsal on `artroom-scope` needs
   `GITHUB_APP_CONFIG.registerScope` pinned to a fresh planned register.
   Either supply the current setting JSON so the builder can restore it,
   or authorize the pin.
3. Who publishes the six packages to npm, and under which account. Until
   then the jam pins the staged tarballs by digest; no publication is
   claimed.

Times are Eastern. Event times come from workroom act times and Git
history. Deployment versions come from the Cloudflare deployment list
read by the planner. Rehearsal and walkthrough results are the builder's
filed evidence, not yet independently reviewed.
