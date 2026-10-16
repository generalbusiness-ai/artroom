# dap sprint report — Tuesday 13 October 2026, 15:00 Eastern

Sprint from 07:00 to 15:00 Eastern. Written by the planner at 14:40 from
main, the workroom and the served pages. Times are Eastern.

## What is on main and what runs

Main `77d9cca0`, nine landings this sprint, 131 files, +23,248 and −305
lines from `61e70379` (computed by `git diff --shortstat`), 145 commits.
The workroom recorded 1,277 acts since 07:00 (counted from the sequence
ref), most of them artifact filings and their retirements.

| Time | Landing | What it carries |
|---|---|---|
| 07:40 | `d1b845f8` | The Home delivery record. |
| 08:23 | `bb817174` | The bounded fork cost measurement record (plan 029, item 0). |
| 08:42 | `fe121d9f` | "create" as the public CLI and page wording; the native commands keep their identity. |
| 09:56 | `bd02ecff` | The plan 031 MCP service: `@generalbusiness/dap-mcp` and `dap mcp`, stdio and loopback HTTP transports, custody of signed envelopes. |
| 10:13 | `765c4eb9` | "Names in transition" retired; the names paragraph lives on the SDK page only; the three tagline openings. |
| 12:12 | `062e1adb` | Start a room without email, recomposed onto the renamed main; Create, MCP and Names preserved. |
| 13:37 | `862ac59e` | The self-host guide, `docs/self-host.md` ("Run dap in 10 minutes"), with the namespace configuration. 13 files. |
| 13:43 | `5cd6bb69` | The Counter tutorial on the published packages. |
| 14:09 | `77d9cca0` | The hosted MCP endpoint design note, Draft 5 (plan 031 stage 2). Document only. |

The logo recomposition (`950ee6a8`, the two-tailed `a` and the tab icon)
was approved at 14:27 and ratified at 14:28; its landing is the builder's
next act and the host redeployments follow it.

Served pages, read by the planner at 14:36:

| Host | Serves | Evidence |
|---|---|---|
| `dap.generalbusiness.ai` | Title "dap", the single-sentence homepage, a self-host link | The served commit is not yet reported by the builder. |
| `artroom-scope`, `/page/` | Title "dap - workroom" | Serves; the old wordmark until the logo lands and the host is redeployed. |
| `artroom-counting`, `/counting/` | Title "dap - counting" | Unchanged this sprint. |
| `artroom-jam` | Sunday's build | Deferred until after the submission. |

## What happened, 07:00 to 15:00

- The MCP service from Hugh's other session landed at 09:56 after its
  exact-head composition review. The planner then read the landed service
  directly for security at Hugh's request and filed one P2 (the `join` tool
  accepts any service URL from an invitation link; `eee29145`, builder
  promise `9505b12e`) and five P3 advisories, which the builder filed as its
  own requests for after the submission.
- Start a room without email landed at 12:12 in one review round after its
  recomposition. The self-host guide and the package tutorial landed at
  13:37 and 13:43, after the planner asked for both landings ahead of the
  logo.
- Hugh's session took the hosted MCP endpoint design through five drafts in
  three hours; Draft 5 landed at 14:09, and the build request `9b3084d4` is
  filed. The discovery head `f05efdb3` is with the checker (`20d343c8`).
- Hugh reordered twice: the logo ahead of the self-host guide because the
  submission screenshots depend on it (12:26), and the lending library
  implementation immediately after its design is approved (12:41). Hugh
  accepted the tab icon out of band (12:29) and asked for the CLI
  entrypoint file to be named `dap.js` (`a5ef601d`, promised).
- Hygiene requests filed from Hugh's review of the repository: NOTICE
  disclosures, `spikes` and `parked` consolidated, dated note filenames
  (`dc706047`, promised), and the consolidation of all applications under
  `apps/` as the first head after the submission (`38064e13`, promised).
- The checker returned changes requested on the roadmap and use-case pages
  (two factual boundaries, `cfec030b`), the architecture diagram (revised
  head `88e92e65` refiled) and the lending library Draft 4 (`b41ffffb`).

## Where it slowed

- Landing waited on the builder: the tutorial was approved at 11:23 and
  landed at 13:43; the self-host guide was approved at 12:27 and landed at
  13:37. The builder prepared the logo head first. The planner's nudge at
  13:31 brought both landings within twelve minutes.
- The logo was recomposed twice: once onto `765c4eb9` (approved 13:31) and
  again after the two landings moved main (approved 14:27). An approved head
  that waits behind other landings is recomposed again.
- Design review rounds: the hosted endpoint note took four rounds of
  changes before approval; the lending library note is on its fifth draft.
- The hosts have not been redeployed since the rename; the served commits
  are still unreported.

## Lanes

**Core workroom and UI.** Start, self-host, tutorial and the MCP service
are on main. The logo lands next, then the hosts are redeployed. Still
ahead before the submission: the `dap.js` entrypoint rename (`a5ef601d`),
the security P2 (`eee29145`), hygiene (`dc706047`), prettier (`c6e29874`),
and the lending library demo once its note is approved.

**MCP.** The generic service is on main with the hosted endpoint design.
The discovery head is under review; the hosted endpoint build
(`9b3084d4`) is open for Hugh's MCP session.

**Counter.** Unchanged this sprint. Hugh records the Counter first today.

**Jam.** Unchanged since Sunday. Deferred until after the submission.

## Next sprint (15:00 to 23:00)

Builder, in this order, in parallel where the files allow:

1. Land the logo `950ee6a8`; redeploy the workroom, Counter and homepage
   hosts; assert which commit each serves (`ba0594a4`).
2. The `dap.js` entrypoint rename, `a5ef601d`, and the security P2,
   `eee29145`, in parallel.
3. The lending library implementation, filed by the planner on approval of
   the design note.
4. Hygiene `dc706047`, then prettier `c6e29874`.

Checker: the discovery head `20d343c8` as promised; the architecture
diagram `8cfe0b6e`; the fold publication note `13f9224f`; then the
builder's heads in the order above as they arrive; the lending library and
roadmap revisions from Hugh's session when refiled; the planner's JSON
output (`3a26309f`) and journal archive (`f0d085cc`) designs after those.

Planner: hourly surveys; the lending library implementation request on
approval; the 23:00 report; Draft 2 of the JSON output design and Draft 4
of the journal archive design when the checker's builder-head reviews are
clear.

## For Hugh

- The screenshots can be taken after the builder's served-commit assert
  that follows the logo landing; read the workroom page once before.
- The lending library note needs a Draft 5 (`b41ffffb`); the roadmap pages
  need the two factual fixes (`cfec030b`). Both are in your sessions.
- The `readme` worktree on `hugh/readme-readability` still holds two
  uncommitted changes; tell the planner when it is ready to file.
