# Plan 028: rename to dap and put the framework first

Planner, 11 October 2026. Direction from Hugh, 11 October: the project is
named dap. Its documentation presents dap as a framework for building
collaborative applications for people and agents, based on an event-sourced
actor model, and presents the room, the Counter and the jam as applications
built on that framework. The rename and the documentation change land before
the contest deadline. The freeze moves to Monday 13 October.

The name artroom stays for Worker names, hosts, environment variables and
local checkout paths. Everything a reader sees changes.

## Why the current documentation misleads

A reader who opens the documentation index or "What is Artroom?" meets
records, rooms and the Git-backed review workflow first. The reader
concludes that the product is a review tool for repositories. The framework
packages (contract, bytes, derive, scope, client, replay) never mention a
room, but the package named `platform` holds the room's definitions, and the
published six-package set includes it. The names hide the split that the
code already has.

## What a reader sees after this plan

1. dap is a framework. A scope is an actor that holds an ordered record and
   judges signed acts against its definition. Scopes compose by delivering
   acts to each other. An application is a set of definitions.
2. Three applications are built on it: dap-room (membership, rules, issues,
   changes and publication to a Git host), dap-counter (a shared count with
   voices) and dap-jam (musicians improvising in a room).
3. The Git-backed review flow is a feature of dap-room.

## Documentation, one mode per page

Each page gets one Diátaxis mode. Titles carry the point. Task pages are
named by a bare verb phrase. Every page is written or revised with the
technical-writing skill.

| Page | Mode | Change |
|---|---|---|
| `README.md` (root, new) | explanation | Three short sections: what dap is, the actor model in one paragraph, the three applications with links. Then "Where to read next". |
| `docs/what-is-dap.md` | explanation | Replaces `docs/manual/what-is-artroom.md`. Framework first, actor model second, applications third. The review flow moves to the room's pages. |
| `docs/architecture.md` | explanation | New. The logical architecture of a dap application: scopes and definitions, acts, entries and receipts, derivation, composition and delivery, authority observations, durability choices (the scope's own storage, publication to a Git host, replay as the independent reader). One closing section on the physical deployment, taken from `docs/manual/architecture.md`, which this page replaces. |
| `docs/build-a-counter.md` | tutorial | New, from the Counter source and `docs/start.md`. The reader builds the Counter definition and sees each act take effect. |
| `docs/write-an-application.md` | how-to | What remains of `docs/start.md` after the tutorial takes the walkthrough: item types, acts, invariants, validation, pins, founding. |
| `docs/scopes.md`, ten terms, the record, life of an act | explanation | Product name only. The ten terms page is the word list for every other page. |
| `docs/lanes-reference.md`, `docs/cli.md` | reference | Product name and command name only. |
| `docs/deploy.md`, `docs/demo.md`, `docs/release.md`, `docs/public-sdk-release.md`, `docs/hosts.md`, `docs/testing.md` | how-to | Titles become verb phrases: "Deploy the scope Worker", "Rehearse the demo", "Release the packages", "Produce the public SDK", "Configure a Git host", "Test dap". |
| `docs/README.md` | index | Reordered: framework pages, then the three applications, then operating guides. Within each group: learn, understand, do, look up. |
| `apps/room/docs/` | mixed, one mode per page | The room's pages move here from `docs/manual/`: roles and membership (explanation), reviewing (how-to), landing (how-to), contribute (how-to), first change (tutorial), lanes (explanation), page (reference). The ledger stays with them. |
| `apps/counter/README.md`, jam `README.md` | explanation | Each says it is an application built on dap and links to the framework pages. |

The protocol and policy-pack pages stay marked inactive and are not renamed
beyond the product name.

## Components

Framework packages stay under `packages/`. Applications move to `apps/`.

| Today | After | Package name |
|---|---|---|
| `packages/contract` | same | `@generalbusiness/dap-contract` |
| `packages/bytes` | same | `@generalbusiness/dap-bytes` |
| `packages/derive` | same | `@generalbusiness/dap-derive` |
| `packages/scope` | same | `@generalbusiness/dap-scope` |
| `packages/client` | same | `@generalbusiness/dap-client` |
| `packages/replay` | same | `@generalbusiness/dap-replay` |
| `packages/git` | same | `@generalbusiness/dap-git` |
| `packages/checkers` | same | `@generalbusiness/dap-checkers` |
| `packages/cli` | same, command `dap` | `@generalbusiness/dap-cli` |
| `packages/platform` | `apps/room/definitions` | `@generalbusiness/dap-room` |
| `packages/lanes` | `apps/room/lanes` | part of `dap-room` |
| `packages/page` | `apps/room/page` | `@generalbusiness/dap-room-page` |
| `examples/counting` | `apps/counter` | `@generalbusiness/dap-counter` |
| `artroom-jam` repository | `dap-jam` repository | `@generalbusiness/dap-jam` |

The published six become `dap-contract`, `dap-bytes`, `dap-derive`,
`dap-client`, `dap-replay` and `dap-room`. The producer and checker scripts
in `docs/public-sdk-release.md` follow the new names and paths.

Workspace references to change: 1,294 occurrences of
`@generalbusiness/artroom-` in 415 files under `packages`, `examples` and
`scripts`, counted with `grep -rho` at main `3bd18314`. The rename head
reports its own count at its own commit, with the command.

## Order and dates

| Step | Owner | When | Review |
|---|---|---|---|
| 1. Counter three-device run and GitHub-host rehearsal (already filed) | builder | Saturday | checker, evidence |
| 2. Component rename: directories, package names, `dap` command, imports, lockfile, producer scripts, Worker configuration paths. One head. Gate passes. | builder | Saturday to Sunday | checker, full |
| 3. Documentation head: root README, what-is-dap, architecture, tutorial, how-to split, index, moved room pages, application READMEs. Written with the technical-writing skill. | builder | Sunday | checker, full, also with the technical-writing skill |
| 4. Redeploy every host from the renamed main; rehearse the 26 shots once more; publish the six packages as `dap-*` | builder | Sunday night to Monday | checker, evidence |
| 5. Freeze | all | Monday 13 October | planner confirms in the report |

Step 2 precedes step 3 so that the documentation head names the final paths
once. If step 2 slips past Sunday noon, step 3 proceeds against the old paths
and the rename head updates the links.

## What stays open after the freeze

Rewriting the room's moved pages for their modes beyond the product name,
and Hugh's wider documentation feedback. Both are recorded as requests and
done after the contest.
