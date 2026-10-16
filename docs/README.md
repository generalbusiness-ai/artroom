# Documentation

dap is a durable action platform for people and agents. Its main
application is the room: a shared coding workflow for a repository. In a
room, people and agents file issues, propose changes, review the exact
version they read, and land the changes that meet the room's rules. The
room then publishes each landed change to a Git repository. Every step is
signed, checked against the rules, and kept in a record that anyone can
check again.

These pages start with the room. Next, two 15-minute tutorials show how
to build an application of your own. After those come the other
applications, the pages that explain how the framework works, and the
guides for running a deployment.

## Work in a room

These are the pages for dap-room. Each guide states its own source and
review status. Their command samples are not run, and each page says so.
The [application source](../apps/room/README.md) groups the room's code
and deployment configuration. To run a room of your own, start with
[Run dap in 10 minutes](self-host.md).

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

## Build your own

Each tutorial takes about 15 minutes. It runs in memory on your own
computer and needs only Node.js and npm.

| Page | What it gives you |
|---|---|
| [Build a counter](build-a-counter.md) | People join and take turns to count. You write the rules, see requests refused with a reason, and read the history. |
| [Build a lending library](build-a-lending-library.md) | Members donate, borrow and return things, and only staff can remove one. |

## Other applications

### dap-counter

A shared count that people and agents take turns to speak.

| Page | What it gives you |
|---|---|
| [Build a counter](build-a-counter.md) | A 15-minute tutorial on a smaller version of the Counter. |
| [The Counter](../apps/counter/README.md) | The Counter's items, the acts each participant can attempt, its grants and its files. |
| [Counting commitments: deployed stage and device setup](../apps/counter/browser/startup.md) | Set up the deployed Counter page and its devices. |

### dap-library

A lending library for kitchenware and tools. Members donate, borrow and
return things; staff remove a thing that is lost or broken. Each act
publishes the thing's shelf page. Publication is built and not yet run
on a deployed room.

| Page | What it gives you |
|---|---|
| [Build a lending library](build-a-lending-library.md) | A 15-minute tutorial that writes the library's first definition. |
| [The lending library](../examples/lending/README.md) | Where it runs, its files, its rules and its tests. |
| [Provision and run the lending library](../examples/lending/runbook.md) | The operator's commands, and the record of the rehearsal run. |
| [The demo script](../examples/lending/demo-script.md) | The story of Nasruddin and the pot, shot by shot. |
| [Taking part through MCP](mcp.md#taking-part-in-the-lending-library) | An agent's tool calls to donate, borrow and return. |

### dap-jam

The [Jam application](../apps/jam/README.md) records the source and managed
assets of the deployed procedural band. It runs locally in the browser,
without a connected dap scope, AI model or microphone. The
[jam repository](https://github.com/generalbusiness-ai/artroom-jam) holds
its earlier development, and the [jam room note](../notes/2026-10-01-jam-room.md)
describes the broader design.

## How the framework works

These pages go from understanding to reference.

| Page | What it gives you |
|---|---|
| [What is dap?](what-is-dap.md) | The framework, its actor model and the applications built on it. |
| [The architecture of a dap application](architecture.md) | Scopes, acts, entries, delivery, authority and where the record is kept. |
| [The ten terms](manual/ten-terms.md) | The word list that every other page uses. |
| [The record](manual/record.md) | What a receipt proves and what a consistency report leaves open. |
| [The life of an act](manual/life-of-an-act.md) | A request, from the definition to the receipt. |
| [Write an application](write-an-application.md) | Declare, validate and pin a definition, and create scopes under it. |
| [Scopes](scopes.md) | The full description of the runtime: entries, definitions, composition and replay. |
| [Use cases](use-cases.md) | A catalogue of situations dap is meant to serve, grouped by what each needs. |
| [Roadmap](roadmap.md) | What runs today, what is not yet built, and what the dap-spike contributed. |

## Operating guides

| Page | What it gives you |
|---|---|
| [Run dap in 10 minutes](self-host.md) | Do: deploy a Worker, create a room, and invite another device. |
| [Deploy the scope Worker](deploy.md) | Service settings and the deployment procedure. |
| [Configure a Git host](hosts.md) | Repository host configuration and credentials. |
| [Rehearse the demo](demo.md) | Run and record the observed repository story. |
| [Test dap](testing.md) | Invariants, focused tests and the checks to run before review. |
| [Produce the public SDK](public-sdk-release.md) | Build and check the public packages. |

These pages describe the earlier model and are marked inactive. Read
their status before using them: [Release the packages](release.md),
[the dap protocol](protocol.md) and [the default policy pack](policy-pack.md).
