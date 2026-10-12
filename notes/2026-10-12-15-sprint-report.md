# dap sprint report — Monday 12 October 2026, 15:00 Eastern

Sprint from 07:00 to 15:00 on 12 October. Written by the planner at 14:20.
The contest closes on Wednesday 14 October at 23:59 Pacific. The freeze is
tonight at 23:00 Eastern; Hugh rehearses today and records on Tuesday, the
Counter first. Hugh's direction (assert `5be4288a`) stands: complete on main
and deploy on Cloudflare the Counter, the core workroom with its UI, and
the jam. Two directions added today: no new cloud sessions from 13:35, and
a triage of every open workroom task (delivered at 14:15, outside the
repository).

## What is on main and what runs

Main `c4156177`, six landings this sprint, 51 files, +3,381 and −481 lines
from `622c76fe` (computed by `git diff --shortstat`), 53 commits.

| Time | Landing | What it carries |
|---|---|---|
| 07:08 | `459ccf92` | The page join flow composite approved at 02:39: path chooser, invitation path, config file path, "dap - workroom" titles. |
| 12:12 | `565a3915` | The joined shell: controls and connected Join behaviour; approved 12:05 with a qualified gate (three fixture failures repaired and rerun). |
| 13:09 | `e179059d` | Plan 031, one MCP service for every dap application, Draft 7, approved 13:04 after three rounds of changes; from Hugh's MCP session. |
| 13:17 | `013fac7a` | Hugh's Counter defect of 12:40: the "Record and definition" block and the Forget button hidden until a device has an identity; one view witness. Filed 12:33, approved 13:13. |
| 13:49 | `b419f806` | The empty-room pages: guidance, truthful Pages refusals, and the configured-summary fast path the checker asked for at 12:13; approved 13:42. |
| 14:05 | `c4156177` | The dap homepage: four static pages (root, room, counter, jam) with exact-byte serving metadata, from Hugh's approved design; approved 14:00. |

Deployments, as the builder's delivery asserts record them and the planner
read the served titles at 14:10:

| Host | Version | Deployed | From |
|---|---|---|---|
| `dap.generalbusiness.ai` | serving, title "dap" | 14:10 read | Main `c4156177`, the four homepages; the builder's delivery assert is pending at 14:20. |
| `artroom-scope` | `0f46327e` | 13:59 | Main `b419f806`, the empty-room head; title "dap - workroom". |
| `artroom-rehearsal` | `f64263c8` | 13:59 | Main `b419f806`. |
| `artroom-counting` | `714a9adb` | 13:28 | Main `013fac7a`, the Counter with Hugh's fix; title "dap - counting". |
| `artroom-jam` | `2ba68698` | Sunday 23:43 | Unchanged; the wordmark head redeploys it. |

Delivered and in review: the documentation head `a62005b5` on
request/dap-docs-head (33 artifacts, gate passed on the exact head: 1,038
tests passed, 2 skipped; link check 256 links, 0 broken). The checker's first
review at 12:00 asked for five changes; the revision answers them and the
exact-head invitation `e199fa69` was promised at 14:05. Approval lands it on
main at once, documentation only, outside the freeze.

Delivered and queued behind the demo heads: the CLI JSON output design
(`notes/2026-10-12-cli-json-output-design.md` at `65609bac`, review
`3a26309f`) from Hugh's request of 13:34, and the observability design
(`3b67ad94`) from Hugh's other session.

## What happened, 07:00 to 15:00

| Time | Event |
|---|---|
| 07:08 to 07:23 | Builder returned, landed the join flow, redeployed the room and rehearsal hosts. |
| 08:35 | Eight issue and rules form findings from Hugh's rehearsal filed to the builder (`543616a2`); promised 11:32. |
| 09:29 to 09:40 | Hugh approved the homepage design; the homepage and wordmark heads filed; the domain step of `39fe5221` amended to front the homepage. The rename narrowed to the minimal one ahead of the noon checkpoint. |
| 10:08 to 10:33 | The documentation head written by a cloud session from today's paths with the plan 028 names; delivered at `52180d64`, review filed 10:50. |
| 11:15 and 11:30 | Shell and empty-room heads filed for review. |
| 12:00 to 12:13 | Documentation: five changes. Shell: approved and landed. Empty-room: one change (scan of definition history on every configured view). |
| 12:32 | Documentation changes sent to the cloud session; revision `a62005b5` pushed. |
| 12:40 to 13:28 | Hugh's Counter defect filed, built, reviewed, landed and deployed in 48 minutes. |
| 13:04 to 13:09 | Plan 031 approved and landed (Hugh's session). |
| 13:19 to 13:59 | Empty-room repair filed, approved, landed, hosts redeployed. |
| 13:34 to 13:50 | Hugh's JSON specification request; the design note written, published and filed for review. |
| 13:35 | Hugh: no new cloud sessions from here on. |
| 13:44 | Documentation exact-head invitation with all artifacts bound; the shapeless one retired. |
| 14:00 to 14:10 | Homepage approved, landed, serving at the domain. |
| 14:15 | Triage of the 173 open workroom rows delivered to Hugh: 20 live, 21 parked until after the submission, 12 of Hugh's sessions, 120 to retire in one wave after the submission. |

## Where it slowed

Nothing stalled over two hours. The documentation head cost one extra round
because its first invitation bound no artifacts and its commands used the
final names before the rename; the revision and the proper filing took the
planner about ninety minutes including the gate and 33 artifact filings.
The checker's queue carried six heads and three plan drafts this sprint and
cleared all but the documentation head and the two design notes.

## Lanes

| Lane | State at 15:00 | What closes it |
|---|---|---|
| Counter | Fixed head live on the counting host | Hugh's three-device try; any fix before 23:00 |
| Core workroom and UI | Shell and empty-room pages live on the room host; forms polish promised | The forms head (`543616a2`) reviewed, landed, redeployed before 23:00 |
| Homepage and wordmarks | Homepage live at the domain; wordmark head gate passed 12:00, not yet filed | Wordmark head reviewed and landed; jam redeployed with its wordmark link |
| Start a room | Branch advanced to 10:45; behind the wordmarks and forms | Head filed, reviewed, landed before 23:00, or the chooser ships alone |
| Documentation | Revised head in review, promised 14:05 | Approval, then landing by the planner at once |
| dap rename and npm | Minimal rename queued after the practice script; npm publication waits on it and on Hugh | Rename head lands; Hugh confirms the npm step |
| Words gate | Practice script amendment (`b861b235`) promised, not started | The amendment lands and the script passes the three-part test |
| Jam | Titled page deployed | Wordmark head; native work after the submission |

## Next sprint (15:00 to 23:00, the freeze)

1. Builder: file the wordmark head; the forms head; the Start head; the
   practice script amendment; the minimal rename. Land and redeploy each on
   approval. File the homepage delivery assert.
2. Checker: documentation head `a62005b5` (promised), then wordmarks, forms,
   Start, the script's words gate, the rename; the two design notes after.
3. Planner: land the documentation head on approval; hourly surveys; the
   23:00 report; Hugh's decision on the stale-base shot and the npm step.

## For Hugh

1. The homepage is live at https://dap.generalbusiness.ai/ with the four
   pages; the Open buttons lead to the room, counting and jam hosts. The
   Counter no longer shows the inspection block or Forget before you join.
2. Two decisions are yours: whether the stale-base rehearsal shot
   (`3f085575`, changes requested, prerequisite hold@1 staging) stays in the
   recording or is dropped; and whether the npm publication (`86674779`)
   happens after the minimal rename lands tonight.
3. The open-task triage is in `~/play/artroom-diagnostics/2026-10-12-open-tasks-triage.md`.
   The retirement wave (about 120 acts) runs after the submission on your go.

Times are Eastern. Event times come from workroom act times (UTC, converted)
and Git history. Deployment versions come from the builder's delivery
asserts; served titles were read by the planner at 14:10. Review verdicts
are the checker's.

## Addendum, 14:55

Since the report was written at 14:20:

- Hugh decided at 14:55: the stale-base rehearsal shot is dropped (the
  request is retired; the concurrent-edit story is told in words), and the
  six public packages publish as `@generalbusiness/dap-*`. The minimal
  rename (`2e8c191d`) and the practice script amendment (`cc50622b`) were
  refiled and the builder promised both at 14:50, with about two hours and
  half an hour of work, in that order after the room heads and Start.
- Hugh's second round of room page findings (dialogs that do not close on
  an outside click, two narrative sentences, boolean labels, the issues
  list not refreshing after create, no timestamps on an issue) is filed as
  `84f45948` and promised at 14:24 on the forms source.
- The documentation head's second review (14:21) asked for one change in
  the room glossary; the planner made it (`956814f6`) and is refiling the
  exact-head invitation. The checker also asked for changes on the two
  design notes: the CLI JSON design (five points, 14:38) and the
  observability design (14:43). Neither is demo-critical.
- Of the 120 stale workroom requests Hugh authorized for retirement, 60
  planner-owned ones are retired and ten frozen drafts ratified. Retiring a
  request makes live requests that rested on it read stale; two live ones
  were caught and refiled, and the rest of the wave was checked for
  dependents before it ran. The builder's and checker's own stale requests
  wait for them after the submission.
- Nothing stalled. Next sprint commitments are unchanged, with the two
  refiled requests in place of the originals.
