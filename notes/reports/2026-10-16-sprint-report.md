# Sprint report, 16 October 2026

Sprint from 15 October, 20:10, to 16 October, 17:00 Eastern. This is the
first daily sprint. During it, pushes to GitHub resumed at 11:56 on
16 October. Nothing was deployed to Cloudflare, and nothing will be
until deployment is reopened.

Every landing below passed its gate and an independent checker review
at the exact head, unless the line says otherwise. All of it is on
`main` at GitHub.

## What landed

### Platform and bottlenecks

- **Bounded public item queries** for the SDK, the CLI and the room page
  (`cf07ac85`). A page of items is read with fixed limits and a cursor.
  MCP does not offer this query yet; a later request covers it
  (`8bc5a05a`).
- **Prerequisites for directory partitions:** whole numbers as an
  indexable field type (`23f15670`), standing entry reservations
  (`dfd15042`), and the push-time key check in destination version 5
  (`5caa62f3`). The partition protocol itself is now in progress on
  `request/directory-partitions-e9943975`.
- **Retained keys** for definition domains (`77e570a1`).

### Durability and archives

- **Invitation-key membership** (`f41ab63c`). Joining signs with an
  invitation key, so no signed entry holds a secret. Rooms on older
  membership versions are refused for archive export by name.
- **Archive selection design** (`c3efd0d9`), **archive pin metadata**
  (`8e7481ee`) and the **archive dependency inventory** prerequisite
  (`4994af74`). The archive writer and export remain to be built.

### Operations and MCP

- **Observability, first stage** (`e444edf8`): native metrics and
  request correlation are retained, and late native turns are measured.
- **MCP:** descriptions for guards that a client does not recognise
  (`85cd430b`), and expiry of idle HTTP sessions (`d3357d38`).
- **Custody-lock guidance** for operators (`7ea9d28a`).

### Documentation

- **Plain-language tutorials** (`693e8f67`). "Build a counter" and "Build
  a lending library" each take about 15 minutes, introduce dap's terms
  after the reader sees each thing work, and ran end to end against the
  published 0.1.0-dev.2 packages. A new page, "Run your app", takes the
  tutorial's counter into a room. Its deployment steps are marked as not
  yet run. The documentation front page now leads with the room.
- **Notes reorganised** (`e6951fb1`). `notes/` now holds only design
  notes. Task notes are in `notes/implementation/`, reviews in
  `notes/reviews/`, reports in `notes/reports/`, and the plans in
  `notes/plans/`. Live links were rewritten; historical records of past
  commits were kept as written. Doc link checks are unchanged
  (480 links, 0 broken).
- **Spikes removed** (`54dcefbc`). The old `spikes/` folder is gone from
  `main` and preserved at the tag `spikes-final`. The hourly workflow
  that ran a spike script is removed.

### Designs adopted

| Design | Commit | What it settles |
|---|---|---|
| Directory partitions | `108aee7e` | The room directory splits into sections; the root records only openings, closings and handoffs; a push-time key check fails closed |
| Hosted Counter contracts | `5cfbaae7` | Agents take Counter turns as written utterances, within an app-wide budget of estimated Neurons, using four low-cost Workers AI models |
| Workroom evidence for the forge design | `5d32a7de` | Aggregate statistics of this project's own coordination, with eight charts, as evidence for the forge view priorities |
| Forge product shape | `7bca56e3` | Entry points, capability map, automation and deployment carried into the forge design |
| Portable clone | `dacf4df4` | What a clone must carry to hold a complete room; which gaps are resolved, partly addressed or open |
| Coordination in an AI app: proposals | `60ab711f` | Two short proposals: repository coordination, and learning, inside a person's AI app |
| Repository coordination MVP plan | `3267fbbe` | A desktop user test: two coding agents over MCP, questions that only requested people may approve, four MCP Apps views, a new room on the existing deployment, slices S0 to S9 |

## What stalled, and why

- **Workroom writes are slow.** The workroom server's answer has grown
  past its 64 MB limit, so each write checks the whole log locally. A
  landing receipt took about two hours overnight. While builder is
  active, the workroom moves during that check, and planner landings
  were refused several times until a retry with random delays got
  through. A fix to the workroom server is being worked on separately.
- **Landings that move or delete other actors' files.** Removing spikes
  and sorting the notes would have retired artifacts that other actors
  had filed at the old paths, which the normal landing refuses. Both
  were merged directly in Git after review. Builder will retire those
  artifacts in one batch, and the landing receipts follow.
- **Gate stability.** Several gates had timeouts while the machine was
  heavily loaded, and once while it slept. Gates now run under
  `caffeinate -i`. The causes are tracked in `1d3a13e3` and `833d1cab`.
- **Overnight idle.** Builder and checker were idle from about midnight
  to 07:20, because their sessions were waiting for input.

## Commitments for the sprint ending 17 October, 17:00

The order below is the build order. Push after each landing. No
Cloudflare deployment.

| Owner | Work | Request |
|---|---|---|
| Builder | Finish the bottleneck work: directory partitions (in progress) and the remaining bounded slices | `e0292346` |
| Builder | Finish the durability work: archive inventory and writer | `e871ba09` |
| Builder | Observability, the next stage after retained metrics | `f57fc4da` |
| Builder | Capacity limits for bytes, items, records and pending requests, alongside observability | `113a54bd` |
| Builder | Then: hosted Counter slices 1 to 4, in parallel with the developer half of self-contained apps M1 | `b2046fe2`, `74f38c24` |
| Builder | Bookkeeping: retire artifacts at old note, plans and spikes paths; move any new slice notes into `notes/implementation/` | — |
| Checker | Review builder's heads in the order above | — |
| Planner | MVP slice S0: confirm on the deployed service which registers, routes and forms exist, and what each desktop app supports | `5f136703` |
| Planner | Design the four MCP Apps views and their major flows, with mockups, before view work starts | to be filed |
| Planner | Record landing receipts for the notes sweep and the spikes cleanup once builder retires the old artifacts | `45605953`, `cb3b1c8f` |

Smaller filed items wait behind these: the renaming of "found" to
"create" (`bb2c27ac`), the lanes package in the SDK release
(`a1af7ad0`), command-line gaps (`520a8971`), the MCP item query
(`8bc5a05a`), and the gate stability work (`1d3a13e3`, `833d1cab`).
