# Parked source

Nothing in this directory is built, tested, released or deployed. It is the
source of the earlier model, kept as material for the deliveries that replace
it. It is not a second runtime: no active package imports from here.

Each package was last built and tested at main `b6a9c0b62d82d9ccc4a9fc6570117ae848c33262`.
The demo contract (`notes/2026-10-04-demo-contract-and-retarget-inventory.md`,
section 9) and the scope contract (section 11) decide each module.

| Package | Successor delivery | What that delivery does with it |
|---|---|---|
| `contract` (`evidence.ts`, `landing.ts`, `roster.ts`, `checker.ts`) | I2, I3 | Rewritten as items, commitments, grants and check jobs. |
| `room` (`authority.ts`, `roster.ts`, `requests.ts`, `founding.ts`, `registry.ts`, `jobs.ts`, `snapshot.ts`, `artifacts.ts`, `logremote.ts`, `policy.ts`, `mcp.ts`; kept after review: `secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts`, `memory/artifacts.ts`) | I3, I5 | Membership, directory and destination definitions; check issue; Git reads; the tool endpoint. |
| `policy` (`admin.ts`) | I3 | Part of the membership definition. |
| `git` | I3 | Publisher, reads and support kept after review; landing, workspaces and tokens rewritten. |
| `checkers` | I3 | Runner kept after review; job and signing rewritten. |
| `mcp` | I5 | Transport kept after review; tools generated from declarations. |
| `cli` | I5 | Commands replaced; support kept after review. |
| `ui` | I5 | Leaves this repository. |

A module that I1 replaces is deleted from here when its replacement is
delivered. This table is updated in the same change.
