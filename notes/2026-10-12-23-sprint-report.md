# dap sprint report — Monday 12 October 2026, 23:00 Eastern

Sprint from 15:00 to 23:00 Eastern. Written by the planner at 22:55 from
main, the workroom and the served pages. Times are Eastern. The freeze
planned for 23:00 was lifted by Hugh at 21:40; work continues through the
night in priority order.

## What is on main and what runs

Main `02d6ccb7`, six landings this sprint, 83 files, +5,043 and −1,632 lines
from `1de6fc75` (computed by `git diff --shortstat`), 77 commits.

| Time | Landing | What it carries |
|---|---|---|
| 15:36 | `cf22cdc5` | Wordmark links on the page and the Counter, with the delivery note. |
| 16:46 | `8e4689b4` | The homepage tagline "Durable action platform for people and agents." and the compact shared header. |
| 17:17 | `db95fb9a` | The observability design, Draft 6, from Hugh's other session. Document only; its three builder heads come after the demo. |
| 17:31 | `6198b199` | The documentation head of plan 028 step 3: root README, framework pages, the room pages under apps/room/docs, the Counter tutorial, the link check script. 36 files. |
| 21:34 | `2086f60e` | The forms and round-two head: the eight form findings and Hugh's six round-two findings (popups, read-session sentence, empty-list guidance, Boolean labels, issue list refresh, local timestamps), with Rules 4 and the page assets. Approved 20:56 after one revision. |
| 22:19 | `02d6ccb7` | The homepage with the single sentence under a larger wordmark, from Hugh's request of 16:55. Approved 22:09. |

Served pages, read by the planner at 22:50:

| Host | Serves | Evidence |
|---|---|---|
| `dap.generalbusiness.ai` | Main `02d6ccb7` | One sentence under the wordmark; the earlier second sentence is gone. At 22:35 the cache still served the old copy; it was current by 22:50. |
| `artroom-scope`, `/page/` | Main `2086f60e` or later | Title "dap - workroom"; the served bundle carries the new filtered-list sentence and no longer carries "No matches." |
| `artroom-rehearsal`, `/page/` | Same as `artroom-scope` | Same bundle, same bytes. |
| `artroom-counting`, `/counting/` | Main `013fac7a` plus the wordmark head | Title "dap - counting". No Counter change landed this sprint. |
| `artroom-jam` | Sunday's build | Title "dap - jam". Jam work is deferred until after the submission. |

The builder's delivery asserts for the room and homepage deployments name
no version identifiers this sprint; the table above is from served bytes.

## What happened, 15:00 to 23:00

- The documentation head went through its fourth review round, was approved
  at 17:20 and landed at 17:31. Its receipt is recorded as an incorporation.
- The forms and round-two head was filed at 19:43 after a long publishing
  phase, came back at 19:59 with one P2 (the filtered empty list gave no next
  action), was refiled at 20:45 and approved at 20:56.
- The homepage copy head was filed, approved and landed within an hour.
- The checker reviewed the MCP build from Hugh's other session four times
  (18:07, 19:14, 21:30 and the sixth round from 22:17), each time with a
  shorter list of changes. That build lands when the checker approves it.
- The planner retired 60 overtaken requests and ratified 10 frozen drafts in
  one wave, and learned that retiring a request makes everything resting on it
  read stale; the rename and the script amendment were refiled on live bases.
- Hugh filed three new wording and hygiene items tonight: "create" not
  "found" (beb2bf65, now starting right after the rename), "Cloudflare
  Artifacts" in place of "the hosting's own Git service" (f384cab0), and JSON
  files formatted with prettier (c6e29874).

## Where it slowed

- The forms head took five hours from its first gate to its landing. The
  artifact publishing of 31 files, the one review round and the evidence
  permissions the checker needed for closed proofs each cost about an hour.
- The homepage cache served the old copy for about twenty minutes after the
  landing. A purge or deployment step after each homepage landing should be
  part of the builder's delivery.
- Start a room without email (32da4f2a), the practice script amendment
  (cc50622b) and the minimal rename (2e8c191d) did not start this sprint. The
  builder worked the forms head alone until 21:40, when Hugh asked for
  independent heads to run in parallel under subagents.

## Lanes

**Core workroom and UI.** Demo-ready on `artroom-scope` and `artroom-rehearsal`
with the forms and round-two fixes served. The documentation set is on main
and linked from the homepage. Still ahead: Start a room without email, the
rename to `dap` in package names and the command, the "create" wording, and
the Artifacts wording.

**Counter.** Unchanged this sprint; Hugh's pre-join fix of 13:17 is served.
Hugh records the Counter first on Tuesday.

**Jam.** Unchanged since Sunday. Deferred until after the submission by
Hugh's direction of 16:35.

## Next sprint (23:00 to 07:00)

Builder, in parallel where the files allow:

1. Start a room without email, 32da4f2a.
2. The practice script amendment, cc50622b.
3. The minimal rename, 2e8c191d, then "create" not "found", beb2bf65, at once
   after it.
4. "Cloudflare Artifacts" wording, f384cab0, then JSON formatting with
   prettier, c6e29874.
5. npm publication under `@generalbusiness/dap-`, 86674779, after the rename
   and on Hugh's confirmation.

Checker: the builder's heads in that order as they arrive; the MCP build
between them as Hugh's session revises it; the JSON output design (3a26309f)
and the journal archive design (f0d085cc) after those.

Planner: hourly surveys; Draft 2 of the JSON output design and Draft 4 of
the journal archive design after the checker's builder-head reviews are
clear; Hugh's README readability edit lands from the `readme` worktree when
Hugh says it is ready.

## For Hugh

- The homepage, workroom and rehearsal hosts serve tonight's landings. Read
  them once before rehearsing: the room's filtered empty list, the Boolean
  labels and the local timestamps are the visible changes.
- Three wording items are queued behind the rename. If the Artifacts wording
  should jump ahead of "create" not "found", say so; the files differ, so both
  can run at once.
- The `readme` worktree is on branch `hugh/readme-readability` from
  `2086f60e`; it does not contain the Artifacts phrase.
