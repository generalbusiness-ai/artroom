# dap sprint report — Wednesday 14 October 2026, 23:00 Eastern

Sprint from 15:00 to 23:00 Eastern. Written by the planner at 22:35 from
main, the workroom and the served hosts. Times are Eastern. The contest
closes tonight at 23:59 Pacific, 02:59 Eastern. This is also the state
note for the submission.

## What is on main and what runs

Main `be7d3dfa`, tagged `submission-2026-10-14` for reviewers who want a
fixed version. Since the last report: seven landings and two README
edits, 93 files, +4,211 and −641 lines (computed by `git diff --shortstat
2c86a5a8 be7d3dfa`), 56 commits, 910 workroom acts.

| Time | Landing | What it carries |
|---|---|---|
| 14:33 | `f20df342` | The approved library publication, composed onto main with the hosted MCP endpoint. |
| 17:03 | `98a5fe04` | The roadmap and use cases, in plain language: 45 cases, three built. |
| 19:42 | `475665be` | Library journal labels, staff-only cancellation, rebuilt page assets, the "Cloudflare Artifacts" wording and the fork-limit docs. |
| 21:05 | `47e25e33` | The CLI configuration-name change. |
| 21:44 | `479f6352` | The library page reads published shelf pages as inert text, so the strict content policy stays and the browser console stays clean. |
| 22:23, 22:28 | `d2e1b776`, `be7d3dfa` | Hugh's README edits. |

Served, as read by the planner at 22:30:

| Host | State |
|---|---|
| `dap.generalbusiness.ai` | Answers 200. |
| `artroom-scope` | Hosted MCP deployed (version `52ff1908`). `POST /mcp` without a bearer answers 401. A fresh agent joined, listed all 26 tools and read its room. The founding offer answers 200. |
| `artroom-rehearsal` | Hosted MCP deployed (version `3c041583`), 401 without a bearer. |
| Library publication rehearsal and final hosts | Serve the build from `479f6352`. All 18 assets read back exactly; staff and ordinary-member browser checks passed on both, with no console errors. |
| Older lending demo service | Redeploy from `479f6352` approved by the planner; running at the time of writing. |

## What happened, 15:00 to 23:00

- Hugh dropped the apps consolidation until Thursday and asked for the
  hosted MCP endpoint if low-risk. It went to rehearsal first, then to
  scope at 20:15, after a real agent check on each host.
- The combined library and documentation head passed its gate, a doc-link
  check found one broken anchor, the builder fixed it, and the checker
  approved with no P1 or P2.
- A browser check found three content-policy messages when the library
  page read published shelf pages. The fix landed within two hours and
  is now on both publication hosts.
- The planner answered four deployment questions: one annotation change
  on rehearsal, one on the older demo service, the same change for the
  corrected build, and three unbound handler exports in that build.

## Where it slowed

- The hosted MCP deploy sat for two hours behind the library head. The
  planner moved it ahead at 19:33, and it was live 45 minutes later.
- The builder's questions to the planner waited up to 30 minutes because
  the planner's inbox was full and reminders could not be delivered.
- Start on a fresh browser logs early 403 messages before the seat and
  first key exist. The room opens correctly; the cause is still being
  diagnosed and does not block anything.

## After the submission

- The apps consolidation `38064e13` (Thursday).
- Prettier `c6e29874`.
- The P3 follow-ups from the reviews and the MCP security review.
- A planner wording head for the roadmap's three remaining checker notes.
- A retirement wave for stale requests from 1 to 11 October, with Hugh's
  word.
- Jam.

## For Hugh

- Main is tagged `submission-2026-10-14` at `be7d3dfa`. Work that lands
  later is not in the tag.
- The older lending demo redeploy should finish before 23:30. The planner
  will confirm it at the 23:30 survey.
