# dap sprint report — Tuesday 13 October 2026, 07:00 Eastern

Sprint from 23:00 to 07:00 Eastern. Written by the planner at 06:45 from
main, the workroom and the served pages. Times are Eastern.

## What is on main and what runs

Main `61e70379`, three landings this sprint, 396 files, +1,383 and −1,076
lines from `b69ee8ef` (computed by `git diff --shortstat`), 17 commits.

| Time | Landing | What it carries |
|---|---|---|
| 04:05 | `b5d15349` | The minimal rename: six workspace package identities under `@generalbusiness/dap-*`, the shared `dap` launcher with `artroom` kept as an alias, the CLI transcript text, and the public SDK name mapping. 394 paths. Receipt 05:15, verified by the checker 05:17. |
| 06:16 | `c4d98848` | The SDK publication note: the six packages `dap-contract`, `dap-bytes`, `dap-client`, `dap-derive`, `dap-platform` and `dap-replay` published at `0.1.0-dev.2` under the `dev` tag, with anonymous registry and tarball readbacks. |
| 06:23 | `61e70379` | The practice script note with plan 030's two edits: the concurrent-edit beat is a narrated example that claims no observed refusal, and the Counter minute opens with "a merge conflict with the code removed". |

Published packages, read by the planner from the public registry at 06:38:
all six resolve at `0.1.0-dev.2`, tagged `dev`. The `latest` tag also points
at `0.1.0-dev.2`, and each package also lists an earlier `0.0.0-stage`
version.

Served pages, read by the planner at 06:38:

| Host | Serves | Evidence |
|---|---|---|
| `dap.generalbusiness.ai` | Title "dap", the single-sentence homepage | Unchanged this sprint; no homepage head landed. |
| `artroom-scope`, `/page/` | Title "dap - workroom" | Serves. The builder has not yet said which commit the hosts serve since the rename; the rename changes package names and the command, not the page bundles. |
| `artroom-counting`, `/counting/` | Title "dap - counting" | Unchanged; Hugh's pre-join fix of Monday 13:17 is served. |
| `artroom-jam` | Sunday's build | Deferred until after the submission. |

## What happened, 23:00 to 07:00

- The rename's gate failed at 00:29 on five rehearsal transcript cases that
  still printed `$ artroom`; the builder corrected them by 01:03. Filing the
  394 artifacts took from about 00:45 to 02:34. The checker promised at
  03:05 and approved at 03:25; the builder ratified at 03:27 and the merge
  reached main at 05:15 with the receipt, verified by the checker two
  minutes later. The builder then retired 968 artifact acts of the earlier
  filings.
- The SDK publication, confirmed by Hugh at 23:58, ran after the rename.
  Its pipeline stopped twice at its own guards before any publish (the
  private-ownership guard, then the token schema), then all six publishes
  returned 0. The first anonymous metadata read returned 404 while the
  registry propagated; the builder asked the planner how to complete, did
  the read-only readbacks, and the checker approved the note at 06:14.
- The practice script note waited on two reads: the planner's plain-language
  acceptance (03:33, after the builder made it a durable request because
  its ephemeral reminders met a full planner inbox) and the checker's
  verdict (03:35, promised at 23:42). It landed after the rename and the
  SDK note, as Hugh's order allowed.
- The plan 031 MCP build from Hugh's other session was approved after nine
  rounds at 02:33 and ratified at 02:36. It was held for the rename, then
  recomposed onto the renamed main as `bfbffab0`; the exact-head review
  request `512b4079` is open with the checker.
- The fork cost measurement (plan 029, item 0) completed on one scratch
  source with one create and one fork; its note is filed for review
  (`1c7b7130`, checker promised 06:16), alongside the Home delivery record
  (`3105a3d5`, promised 06:16).
- The builder worked the heads in parallel under subagents from 21:40,
  as Hugh asked; self-host, logo, Artifacts wording and tagline docs were
  prepared in isolated worktrees and now rebase on the renamed main.

## Where it slowed

- Filing: about two hours to publish 394 artifacts for one head, before
  review could start. The retirement of the superseded artifacts cost
  another large wave of acts after the landing.
- Landing: from ratification at 03:27 to the receipt at 05:15, with no
  builder act between 03:42 and 05:15. A short assert with the landing
  handle at the start of a long gate would have shown that it was running.
- Review order: the checker took three MCP rounds ahead of the one-note
  script head it had promised at 23:42; the script verdict arrived at 03:35,
  two minutes after the planner's own acceptance.
- Start a room without email (`32da4f2a`) did not start this sprint either.

## Lanes

**Core workroom and UI.** Renamed on main and published. The workroom and
rehearsal hosts serve; the served commit since the rename is to be
confirmed by the builder. Next: "create" not "found" (`beb2bf65`), the
self-host guide (`527ca154`, the "run it in 10 minutes" page), the logo
(`259e2eab`), Start a room without email, the Artifacts wording
(`f384cab0`), the tagline docs (`71767f3b`), the fork-limit docs
(`a0ea718c`), the tutorial on the published packages (`82a40107`), and
prettier (`c6e29874`) last.

**Counter.** Unchanged this sprint. Hugh records the Counter first today.

**Jam.** Unchanged since Sunday. Deferred until after the submission.

## Next sprint (07:00 to 15:00)

Builder, in parallel where the files allow:

1. Say which commit each host serves; deploy from main if any host is
   behind.
2. "create" not "found", `beb2bf65`.
3. The self-host guide, `527ca154`, and the logo, `259e2eab`.
4. Start a room without email, `32da4f2a`.
5. Artifacts wording `f384cab0`, tagline docs `71767f3b`, fork-limit docs
   `a0ea718c`, the package tutorial `82a40107`, then prettier `c6e29874`.

Checker: the fork cost note and the Home delivery record as promised, then
the MCP exact-head composition `512b4079`, then the builder's heads in the
order above as they arrive; the JSON output design (`3a26309f`) and the
journal archive design (`f0d085cc`) after those.

Planner: hourly surveys; Draft 2 of the JSON output design and Draft 4 of
the journal archive design; Hugh's README readability edit lands from the
`readme` worktree when Hugh says it is ready.

## For Hugh

- The six packages are public. Both `dev` and `latest` point at
  `0.1.0-dev.2`, and an earlier `0.0.0-stage` version is visible on each
  package; say if either should change before the submission.
- The `dap` command is on main; `artroom` still works as an alias. The hosts
  serve, but the builder has not reported a redeployment from the renamed
  main, so read the workroom page once before recording.
- The `readme` worktree on `hugh/readme-readability` has two uncommitted
  changes of yours; tell the planner when it is ready to file.
