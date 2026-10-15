# dap

A durable action platform for people and agents.

* Web site: [https://dap.generalbusiness.ai](https://dap.generalbusiness.ai/)
* Blog post: [Software and the Cauldron](https://generalbusiness.ai/blog/2026-10-14-baby-cauldron/), ([repo copy](notes/2026-10-14-blog-post-baby-cauldron.md)), including three demo videos
* Source code: [https://github.com/generalbusiness-ai/dap](https://github.com/generalbusiness-ai/dap)

Most software development problems are collaboration problems.

Working together on a project needs some rules and guardrails: how we apply rules to processes
when there are multiple participants involved.  Agents and people.  In software, this looks like
all the things that _surround_ Git: issues, pull requests, changes, hooks, protection, actions,
agent guidance, and even CI.

Examples of these rules: You can't close an issue if it's already closed.  You can't close
without choosing a reason.  You can't merge into main if the branch is protected. Every 
change needs a performance budget. You can't add this file without linting it.  If you
change the database, Joe and Kate need to approve.  And so on.

Dap is a way to build these rules around the whole of a git repo, so that they are
an integral part of it.  Every act is signed and checked against the rules that you
define.  The log of everything gives a really strong way to replay and trace what
happened and why.  And dap inherits some nice characteristics by running on Cloudflare:
global scalability, leveraging Workers and Durable Objects and Artifacts.

## What is dap, technically?

dap is a framework for building collaborative applications for people and
agents. It is based on an [event-sourced](https://martinfowler.com/eaaDev/EventSourcing.html) [actor model](https://en.wikipedia.org/wiki/Actor_model). You write an
application as a set of definitions. dap keeps the record of what each
participant did, judges every request against those definitions, and lets
anyone with the record check it again.

This is more general-purpose than just a software-development coordination system.
My hope is that dap-style applications are useful for a very broad set of things.

![The dap model. A person or an agent signs an act and sends it over the command line, MCP or HTTP. A scope judges it against its pinned definition, with guards, rule expressions in a restricted JSONata, and the signer's grants. An act that takes effect becomes an entry in the journal, and its declared effects are folded into the scope's items. The journal can be replayed, entries send messages to other scopes, and a destination scope publishes the files it is sent to a Git repository on Cloudflare Artifacts or GitHub, which serves pages. Dashed lines are planned.](docs/assets/dap-architecture.svg)

## The "event-sourced actor" model

A **scope** is a process that receives and processes messages. It holds
an ordered record of entries and pins one **definition**: data that names
the scope's item types, the acts a participant may sign, the guards each
act must meet, and the effects it has. A person or an agent signs an **act**
with a device key and sends it to a scope. The scope judges the act against
its definition, its current state and the signer's authority. If the act
takes effect, the scope writes an entry and returns a receipt that names
it. If not, the scope refuses it and says why. The current state is the
fold of the entries, so replaying the record gives the same state.

Scopes compose by delivering messages to each other, and each receiver
judges a delivery in its own turn, as it judges an act.

Dap was built with the help of several concurrent coding agents, using
[gitseq](https://github.com/generalbusiness-ai/gitseq), which is a locally-hosted precursor to dap.

## Four applications built on dap

- **dap-room** holds membership, rules, issues and changes for a
  repository, and publishes approved changes to a Git host. Its pages
  are in [apps/room/docs](apps/room/docs). Start with
  [Join a room and publish one text change](apps/room/docs/first-change.md)
  and [Lanes](apps/room/docs/lanes.md).
  [Concurrent changes are settled by reservation and judgment, not by merging.](docs/demo.md#what-the-concurrency-shots-show)
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
  room's repository.
- **dap-jam** lets musicians improvise together in a room. Its source and
  documentation are in the
  [jam repository](https://github.com/generalbusiness-ai/artroom-jam).

You can [try them out](https://dap.generalbusiness.ai/) on the hosted service.

dap runs on Cloudflare Workers, Durable Objects and Artifacts.

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
- [The roadmap](docs/roadmap.md) says what runs today and what is not
  yet built, and [Use cases](docs/use-cases.md) is the catalogue behind
  it.
- [The documentation index](docs/README.md) lists every page.

dap is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
