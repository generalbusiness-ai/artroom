# Documentation

A durable action platform for people and agents. These pages
cover the dap framework first, then the three applications built on it,
then the guides for operating a deployment. Within each group, pages go
from learning to understanding, then doing, then looking up.

## The framework

| Page | What it gives you |
|---|---|
| [Build a counter](build-a-counter.md) | A tutorial: write a small definition and watch each act take effect. |
| [What is dap?](what-is-dap.md) | The framework, its actor model and the applications built on it. |
| [The architecture of a dap application](architecture.md) | Scopes, acts, entries, delivery, authority and where the record is kept. |
| [The ten terms](manual/ten-terms.md) | The word list that every other page uses. |
| [The record](manual/record.md) | What a receipt proves and what a consistency report leaves open. |
| [The life of an act](manual/life-of-an-act.md) | A request, from the definition to the receipt. |
| [Scopes](scopes.md) | The full description of the runtime: entries, definitions, composition and replay. |
| [Write an application](write-an-application.md) | Declare, validate and pin a definition, and create scopes under it. |

## The applications

### dap-room

A room keeps a repository's membership, rules, issues and changes, and
publishes changes to a Git host. Each guide states its own source and
review status. Their command samples are not run, and each page says so.

| Page | What it gives you |
|---|---|
| [Join a room and publish one text change](../apps/room/docs/first-change.md) | A first change from the command line. |
| [The room's terms](../apps/room/docs/room-terms.md) | Room, member, lane, issue, change, review, check and land. |
| [Lanes](../apps/room/docs/lanes.md) | The issue and change definitions and their runtime limits. |
| [Choose a role and manage membership](../apps/room/docs/roles-and-membership.md) | Roles, invitations and what each role is allowed to do. |
| [Review an exact change version](../apps/room/docs/reviewing.md) | Record a verdict on the exact content you read. |
| [Follow a change through publication](../apps/room/docs/landing.md) | Read a merge through to its published outcome. |
| [Contribute a change to dap](../apps/room/docs/contribute.md) | Work on this repository through its own room. |
| [Lane reference](lanes-reference.md) | Every row of the lane definitions, generated from the data. |
| [The dap command](cli.md) | Every command: creating a room, membership, acts, publication and verification. |
| [The page](../apps/room/docs/page.md) | Reading and acting through the room's browser page. |
| [Pages](pages.md) | Serving files from a published repository. |
| [Full manual page ledger](../apps/room/docs/ledger.md) | The review and acceptance history of the room's pages. |

### dap-counter

A shared count that people and agents take turns to speak.

| Page | What it gives you |
|---|---|
| [Build a counter](build-a-counter.md) | A tutorial on a smaller version of the Counter's definition. |
| [The Counter](../examples/counting/README.md) | The Counter's items, the acts each participant can attempt, its grants and its files. |
| [Counting commitments: deployed stage and device setup](../examples/counting/browser/startup.md) | Set up the deployed Counter page and its devices. |

### dap-jam

Musicians improvising together in a room. Its documentation is in the
[jam repository](https://github.com/generalbusiness-ai/artroom-jam), and
its design is in the [jam room note](../notes/2026-10-01-jam-room.md).

## Operating guides

| Page | What it gives you |
|---|---|
| [Run dap in 10 minutes](self-host.md) | Do: deploy a Worker, create a room, and invite another device. |
| [Deploy the scope Worker](deploy.md) | Service settings and the deployment procedure. |
| [Configure a Git host](hosts.md) | Repository host configuration and credentials. |
| [Rehearse the demo](demo.md) | Run and record the observed repository story. |
| [Test dap](testing.md) | Invariants, focused witnesses and the review gate. |
| [Produce the public SDK](public-sdk-release.md) | Build and check the public packages. |

These pages describe the earlier model and are marked inactive. Read
their status before using them: [Release the packages](release.md),
[the dap protocol](protocol.md) and [the default policy pack](policy-pack.md).
