# dap sprint report — Monday 12 October 2026, 07:00 Eastern

Sprint from 23:00 on 11 October to 07:00 on 12 October. Written by the
planner at 06:40. The contest closes on Wednesday 14 October at 23:59
Pacific. The freeze is tonight, Monday 12 October at 23:00 Eastern; Hugh
rehearses today and records on Tuesday, the Counter first. Hugh's
direction (assert `5be4288a`) stands: complete on main and deploy on
Cloudflare the Counter, the core workroom with its UI, and the jam.

## What is on main and what runs

Build: main `622c76fe`, merged 02:33, pushed by the planner at 04:32.
Thirteen commits this sprint, 27 files, +1,181 and −166 lines from
`46f15f71` (computed by `git diff --shortstat`).

| Time | Landing | What it carries |
|---|---|---|
| 02:33 | `622c76fe` | The Counter demo head: one demo file with three identities, a remembered non-extractable signing key in the browser, one Join action, automatic turns, en-US voices, stable controls, the "dap - counting" title, and the two repairs from the full review (an origin-wide custody lock so a second tab cannot revive a forgotten key; a device proposes again after a refusal caused by Pause once Start brings fresh state). Approved 02:27 after a first review at 00:23 asked for changes. |

Deployments, read from the Cloudflare deployment list by the planner:

| Host | Version | Deployed | From |
|---|---|---|---|
| `artroom-counting` | `bfaa66a9` | 04:31 | Main `622c76fe`, the approved Counter, by the planner; served assets equal main by SHA-256; secrets unchanged. |
| `artroom-jam` | `2ba68698` | 23:43 | The jam page with its "dap - jam" title, by the builder; approved 23:29. |
| `artroom-rehearsal` | `d7e7baca` | 00:37 | The Counter candidate before its repairs and the first join flow candidate, by the builder. |
| `artroom-scope` | `c3fdd2a1` | Sunday 20:00 | Main `3d400d49`, the branded room page. Not redeployed this sprint. |

Approved and not landed: the page join flow composite `f83e92e1` (the
path chooser, the invitation path that creates a key and joins, the
config file path, the settings vocabulary removed, the room navigation
hidden before a room is loaded, the "dap - workroom" titles), approved
02:39 on top of the approved Counter. It waits for the builder's landing
and the room host's redeploy.

## What happened, 23:00 to 07:00

| Time | Event |
|---|---|
| 23:20 to 23:53 | Jam title landed, deployed and approved; a served-bytes discrepancy reconciled by a corrected provenance claim. |
| 23:44 | Builder estimates "Start a room" without email at four hours and asks whether the demo register may admit a first claim from a new key; the rehearsal register admits known keys only. |
| 00:05 | Counter candidate `6a1d7f87` delivered, seven hours into a twelve-hour estimate. |
| 00:23 | Full review: changes requested. A refused automatic commit after Pause could stall a device for good; Forget on one tab did not fence a second tab; compiled guard controls missing. The verdict was ineffective on the request's shape and was refiled properly at 00:58. |
| 00:31 | Planner: repair the stall first, then custody, Counter stays first; the demo register that admits a first claim is authorized for the two demo hosts only, the production register untouched. |
| 00:57 to 01:01 | Builder: three hours for the repairs; the join flow chooser head filed for review. |
| 01:42 | Chooser review: one change, an archived refused invitation could be pasted and sent again. |
| 02:16 to 02:27 | Repaired Counter filed and approved. |
| 02:24 to 02:39 | Repaired join flow composite filed on the approved Counter and approved. |
| 02:33 | Counter merged to main in the shared checkout; not pushed. Last builder act 02:39. |
| 04:31 | Planner pushes main and deploys the counting host, as announced at 03:35. |
| 02:39 to 07:00 | No builder or checker act. |

## Where it slowed

The builder stopped at 02:39 with the landing half done: merged, not
pushed, not deployed, no landing assert, and the approved join flow
composite unlanded. The Codex daemon and the workroom adapters were still
running at 05:30, so the session is idle rather than crashed. Four hours
of the eight were lost on the join flow's landing. Two review filings
were ineffective on shape (a main target where a review commitment was
owed) and cost about fifteen minutes each; the checker's full analysis
was carried over each time, so no review work was repeated.

## Lanes

| Lane | State at 07:00 | What closes it |
|---|---|---|
| Counter | Approved head on main and live on the counting host | Hugh's own three-device try; any fix from it before 23:00 |
| Core workroom and UI | Join flow composite approved, not landed; the room host runs Sunday's page | Builder lands it and redeploys the room and rehearsal hosts |
| Start a room | Demo register authorized for the demo hosts; four-hour head queued behind the chooser; child request filed by the builder | Head reviewed, landed, redeployed before 23:00, or the chooser ships alone from the noon checkpoint |
| Jam | Titled page deployed | Unchanged; native only after the submission |
| dap rename and docs | Rename head and product-name-only docs head promised, not started | Noon checkpoint: rename head or the minimal rename for publication |
| Words gate | Practice script amendment (no-merge sentence, Counter line, observed numbers) promised, not started | The amendment lands and the script passes the three-part test |

## Next sprint (07:00 to 15:00)

1. Builder, on return: push nothing new before landing the join flow
   composite `f83e92e1`, redeploy the room and rehearsal hosts, file the
   landing assert; then the Start a room head; then the practice script
   amendment; then the rename head.
2. Checker: the Start a room head when it arrives (full); the practice
   script amendment (words gate).
3. Planner: hourly surveys; the noon checkpoint on the rename; the
   15:00 report.

## For Hugh

1. The Counter is live at the counting host's `/counting` route on the
   approved head. Try it on three devices: import the demo file once,
   pick an identity, Join, and let the turns run; Pause then Start; close
   a tab and reopen it, the key is remembered. Anything that breaks the
   recording is a fix before 23:00, ahead of everything else.
2. The builder session is idle since 02:39 and needs a prompt or a
   restart. Until then the join flow stays unlanded and the room page
   keeps Sunday's entry dialog.
3. "Start a room" without email: the automatic browser key form is in
   scope as you asked; the planner authorized a demo register that admits
   a first claim from a new key, for the demo hosts only. Four hours of
   builder time after the join flow landing. The noon checkpoint decides
   whether it ships tonight or the chooser ships alone.
4. The rename and docs heads have not started. The fallback at noon is
   the minimal rename (package names and metadata) for publication.

Times are Eastern. Event times come from workroom act times and Git
history. Deployment versions come from the Cloudflare deployment list
read by the planner. Review verdicts are the checker's.

## Addendum, 07:35

The builder returned at 07:08 and finished the landing the report
called unlanded: the join flow composite is on main at `459ccf92`, the
room host runs it as version `c4ab4c3f` (07:19) and the rehearsal host
as `98fddc61` (07:23), with the served page bytes and the "dap -
workroom" title read back by the builder. The counting host stays at
`bfaa66a9`. The builder is now composing the Start a room head in its
own worktree. Item 2 of "For Hugh" is no longer needed.
