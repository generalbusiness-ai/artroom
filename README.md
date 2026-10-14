# dap

A durable action platform for people and agents.

dap is a framework for building collaborative applications for people and
agents. It is based on an event-sourced actor model. You write an
application as a set of definitions. dap keeps the record of what each
participant did, judges every request against those definitions, and lets
anyone with the record check it again. The project site is
<https://dap.generalbusiness.ai/>.

![The dap model. A person or an agent signs an act and sends it over the command line, MCP or HTTP. A scope judges it against its pinned definition, with guards, rule expressions in a restricted JSONata, and the signer's grants. An act that takes effect becomes an entry in the journal, and its declared effects are folded into the scope's items. The journal can be replayed, entries send messages to other scopes, and a destination scope publishes the files it is sent to a Git repository on Cloudflare Artifacts or GitHub, which serves pages. Dashed lines are planned.](docs/assets/dap-architecture.svg)

The diagram shows the intended model. Two parts of it are planned and not
yet built, and are drawn dashed: writing items to the repository, and the
archive of the journal in Git. Today a destination scope publishes to the
repository: a room's merged changes, and files that an application's acts
send it, such as the lending library's shelf pages.

## The actor model in one paragraph

A **scope** is an actor. It holds an ordered record of entries and pins
one **definition**: data that names the scope's item types, the acts a
participant may sign, the guards each act must meet, and the effects it
has. A person or an agent signs an **act** with a device key and sends it
to a scope. The scope judges the act against its definition, its current
state and the signer's authority. If the act takes effect, the scope
writes one entry and returns a receipt that names it. If not, the scope
refuses it and says why. The current state is the fold of the entries, so
replaying the record gives the same state. Scopes share no storage. They
compose by delivering messages to each other, and each receiver judges a
delivery in its own turn, as it judges an act.

## Four applications built on dap

- **dap-room** holds membership, rules, issues and changes for a
  repository, and publishes accepted changes to a Git host. Its pages
  are in [apps/room/docs](apps/room/docs). Start with
  [Join a room and publish one text change](apps/room/docs/first-change.md)
  and [Lanes](apps/room/docs/lanes.md).
  Its definitions are in [packages/platform](packages/platform) and
  [packages/lanes](packages/lanes).
- **dap-counter** keeps a shared count. People and agents join, take
  turns, and each device speaks its number aloud. The source is in
  [examples/counting](examples/counting), and the tutorial
  [Build a counter](docs/build-a-counter.md) builds a smaller version of
  its definition.
- **dap-library** is a lending library for kitchenware and tools. Members
  donate things, borrow them and return them, and staff remove a thing
  that is lost or broken. The source is in
  [examples/lending](examples/lending), and the tutorial
  [Build a lending library](docs/build-a-lending-library.md) writes its
  first definition. Each act also publishes the thing's page to the
  room's repository; that is built, and not yet run on a deployed room.
- **dap-jam** lets musicians improvise together in a room. Its source and
  documentation are in the
  [jam repository](https://github.com/generalbusiness-ai/artroom-jam).

dap runs on Cloudflare Workers and Durable Objects. Each scope is one
Durable Object with its own storage. There is no hosted sign-up. You enter
a room with an invitation link from one of its members, or with the
configuration file and key of a member who has already joined.

## Where to read next

- [Run dap in 10 minutes](docs/self-host.md) deploys a room on your own
  Cloudflare account and gives you a link for another device.

- [What is dap?](docs/what-is-dap.md) explains the framework, the actor
  model and the applications.
- [Build a counter](docs/build-a-counter.md) is a tutorial. You write a
  small definition and watch each act take effect.
- [Build a lending library](docs/build-a-lending-library.md) is a second
  tutorial, on items with states, final states and grants.
- [The architecture of a dap application](docs/architecture.md) explains
  scopes, acts, entries, delivery and where the record is kept.
- [Write an application](docs/write-an-application.md) shows how to
  declare item types, acts and invariants, then validate and pin them.
- [Scopes](docs/scopes.md) is the full description of the runtime.
- [The documentation index](docs/README.md) lists every page.

dap is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
