# Self-contained applications: the destination and the work to reach it

15 October 2026. Design direction for review.

Source baseline: main `bc95110e1`, dap-spike main `9d738e2e`. This note is
for the request that carries it. It commissions no implementation. A
separate request will commission each milestone in section 7.

## 1. Purpose

Hugh wants a better developer experience. A developer should be able to
create a complete, self-contained dap application, then publish it and
release new versions of it. Anyone should be able to install and run it
inside a single host, in the style the dap-spike intended.

dap can already judge, record and replay a declared application. What it
lacks is the application as a unit: something a developer can build, name,
publish and version, and an operator can install without changing the host.
This note describes that destination and lists the work needed to reach it.

## 2. The destination

A developer writes an application in one directory and publishes it as one
immutable package, identified by its content. Anyone who runs a dap host can
install that package into a room with one act. The host is not rebuilt or
redeployed. Members open the application at a route that the host serves.
Agents reach the same acts through MCP. When the developer publishes a new
version, the room's admin decides whether to adopt it. What already
happened keeps its meaning.

This is the dap-spike's package model. In its design note, a package is "the
unit of authorship, publication, reuse, review and trust" (evolving-spaces
design, section 3). It has a reverse-DNS logical name, a human version and a
content id. An environment pins its exact closure, like a lockfile (section
7). Old events never change meaning. A newer package never silently
enlarges authority. The Weixin survey shows the host's side of the same
model: the host supplies identity, joining, notification and the record,
and the program supplies rules and screens. dap's difference is that the
record belongs to the participants, not to the developer.

The developer's path, as a sketch. None of these commands exist yet.

```
dap new lending                 # a template: manifest, definition, screens, scenarios
dap dev                         # a local host with in-memory scopes and live reload
dap check                       # validate, pin, run scenarios, replay, audit capabilities
dap pack                        # canonical bundle and its content id
dap publish                     # a signed release at a URI that resolves
dap app install <uri>@<id>      # an admin, in a room: one act that shows what is requested
dap app upgrade <uri>@<id>      # adopt a successor under its declared upgrade path
```

## 3. Principles

1. **An application is data and static presentation.** It contains
   definitions, rule expressions, screens and declared requests for host
   capabilities. It contains no server code. This makes an application
   safe to install, possible to replay, and possible to host beside many
   others. An escape hatch for code-driven functionality comes later
   (section 8, decision 5).
2. **The content id is the identity.** The name and version are for
   people. Install, grants and replay use the content id.
3. **Install is an act.** Installing, upgrading, disabling and removing an
   application are recorded in the room, under the room's rules, like any
   other change.
4. **Authority is requested, shown and granted.** A package states what it
   needs. The admin sees that at install. The host enforces it. A newer
   version that asks for more needs a new grant.
5. **One client kit for all applications.** Joining, the device key,
   keeping a request until it settles, reading state and offline work are
   written once in the SDK, not once for each application.
6. **One read projection serves screens, MCP and agents.** An application
   declares what a reader sees. Its screens, the MCP tools and agents all
   read that projection.

## 4. What a package contains

| Part | Today | Destination |
|---|---|---|
| Manifest | None | Logical name, human version, content id, publisher key, the host contract it needs, requested capabilities and their bounds, default roles and their actions, and the entry definition |
| Definitions | One `definition.ts`, `definition.json` and `pin.ts` for each application, kept in agreement by a script | One or more definitions with their declared creation edges, pinned together |
| Rule expressions | Inside each definition | Unchanged |
| Read projections | None. Screens read the journal and compute their own state (`examples/lending/shelf.ts`) | One declared projection for each definition |
| Presentation | `browser/` code compiled into the Worker | Static assets in the package, bound to the projections |
| Act descriptions | None: "An act definition has no description text" (`docs/cli.md`) | Text for each act and field, read by screens and agents |
| Scenarios | An ad hoc `test-support.ts` for each application | A standard scenario form that `dap check` runs and replays |
| Upgrade path | Not possible | A declared predecessor, and optionally a carry-forward rule (section 6, gap 10) |

## 5. What the host provides

- **An application store.** Packages kept by content id, fetched from a
  publisher's URI and checked against that id.
- **A generic route.** Each installed application is served at a path
  derived from the room and the package, with the same strict content
  security policy that the lending route uses today.
- **The capabilities.** Publication to the room's destination, holds,
  Git reads, and later notifications and outside operations. Each one is
  bounded by what the manifest declared and the admin granted.
- **The generic tools.** The MCP service already reads a room's
  definitions as data and derives one tool for each act (`docs/mcp.md`).
  The same derivation can give a default interface to an application
  that has no screens of its own.
- **Operation.** Install, upgrade, disable and remove, an observability
  view for each application, and export of its journals.

## 6. The gaps

Each gap names what exists today and what is needed.

**Gap 1. There is no unit called an application.** Today the lending
library is made of these parts:

- a definition and a pin script
- a browser directory
- an asset script that writes a Worker module (`scripts/assets.mjs`)
- a route clause in the platform Worker
- a separate `wrangler.lending.jsonc`
- a 364-line runbook

The `apps/` consolidation (request `38064e13`) moves each application's
source into its own path. It still composes them into one Worker when
the host is built. Needed: a manifest format, and a `pack` step that writes
canonical bytes and one content id for the whole closure.

**Gap 2. Installing an application means changing and redeploying the
host.** Screens are compiled into the Worker, and each application has a
route written into its dispatch. Needed:

- an application store in the host
- one generic route
- an install act. The rules scope's `activate` already accepts a
  definition's digest and bytes, so the install act can extend it to a
  whole package.

**Gap 3. Room creation depends on the application.** Today the `dap install`
command takes `--cohort application`, `application-publication` or
`counting-commitments`, and each choice selects platform versions. The
Counter has its own lineage of register, directory and membership.
Needed: a room is created once with the capabilities its host offers.
Applications are installed into it afterwards, and each manifest says what
it needs.

**Gap 4. Provisioning is a runbook.** Today the steps are:

1. Sign `activate` with the definition's digest and bytes.
2. Sign `establish-application`.
3. Run `set-actions` for each role.
4. Before `--value`, remove a trailing newline from `definition.json`.

Needed: one install that proposes the manifest's default roles, and records
the admin's confirmation. Membership then grants each action on purpose,
not by default.

**Gap 5. Each application writes its own client.** The Counter and the
lending library each have their own device key, storage, request custody,
gateway and joining code. Needed: a browser kit in the published client
package. The offline and synchronization design
(`notes/2026-10-09-offline-and-sync-design.md`) belongs in the same kit, so
every application gets it once.

**Gap 6. Screens compute state from the journal.** The dap-spike binds a
renderer only to a model's `observe` projection (design, section 3). Needed:
a declared read projection for each definition, used by screens, MCP and
agents. Then a generic interface derived from the acts and projections, so
an application without its own screens still works.

**Gap 7. Applications made of several scopes.** This is the roadmap's
nearest item. No declared application yet has two scopes of its own that
ask each other. The package format must carry several definitions and their
creation edges from the start, even though the first packages will use one.

**Gap 8. Capabilities are not bounded.** An application with
`publish-file` "can overwrite any repository path, including files in the
rules extent" (`docs/write-an-application.md`). The only control today is
trust when the definition is activated. Needed: the manifest declares each
capability and its bounds, such as paths under `shelf/`. The install shows
them. The host enforces them. This applies the dap-spike's versioning rule
7: grants pin exact capability ids.

**Gap 9. There is no publication or distribution channel.** npm publishes
the SDK, not applications. dap already publishes to Git hosts and records
the outcome, so an application release can be a signed commit or tag in a
repository. The release is resolved by URI, following the scope-URI
direction (request `9626787f`). The host fetches the package by URI and
checks its content id.

**Gap 10. Versioning and upgrade.** A scope pins its definition for life.
Upgrades come in three steps, in this order.

1. **Successor declarations.** Version 2 names version 1. Existing scopes
   continue under version 1, and new scopes use version 2. The runtime
   supports this today. Nothing records the lineage.
2. **Carry forward into a new scope.** A declared, deterministic export
   of version 1's settled state starts a version 2 scope that links to
   the old one. This is the dap-spike's rule 5: "Large discontinuities may
   create a new context."
3. **Change inside a running scope.** A package is attached at an exact
   position, with a declared migration and refusal of stale signed acts.
   This is the dap-spike's composition and extensibility work, and the
   roadmap's "Rules that change after creation". It depends on research.

**Gap 11. The development loop.** Today:

- There is no template.
- There is no local host for development. The workerd fixtures exist
  only as tests.
- The validator refuses rule expressions unless the caller passes
  `RULE_PROFILES`, and this is easy to miss.
- Scenarios have no standard form.
- No single command validates, pins, runs scenarios and replays.

Needed: `dap new`, `dap dev` and `dap check`.

**Gap 12. Operating an installed application.** Needed: disable and remove
(the journals are kept, and the routes close), export, and an
observability view for each application. The observability design
(request `5a6f656a`) applies here.

**Gap 13. Limits of the rule language.** This is not packaging, but it
decides what developers can build. Effects cannot write computed values,
and one act cannot create a row or update it depending on whether its key
exists (roadmap, "Expressions that compute effects").

## 7. Milestones

Each milestone ends with something a developer can do.

**M1. Package on the current runtime.** No change to judging or replay.
Covers gaps 1 to 5 and 11: the manifest, `pack`, the application store and
the generic route, install in one act, the browser kit, and `dap new`,
`dap dev` and `dap check`. *Done when* the Counter and the lending library
are packages, a fresh room installs each of them by URI without a
redeploy, and their routes, asset modules and cohort are gone from the
host's source.

**M2. A complete application.** Covers gaps 6 to 9 and act descriptions:
declared projections, the generic interface, several scopes in one
package, bounded capabilities, and publication by URI. *Done when* a
two-scope application with one owner of a shared amount is published from
a repository, installed elsewhere and used by a person and an agent. No
host change is needed.

**M3. Upgrades.** Covers gap 10, steps 1 and 2, and gap 12. *Done when*
version 2 of an installed application is adopted, new scopes use it, an
existing scope carries forward, and both journals replay.

**M4. Change inside a running scope.** Covers gap 10, step 3. It depends on
the dap-spike's composition and extensibility results, then on a dap
design.

Private views and an authoring language follow, in the roadmap's order.

## 8. Decisions

Hugh agreed to decisions 1 to 4 on 15 October 2026, and made decision 5.

1. **Presentation is outside the semantic content id.** A package has a
   semantic id over its definitions and capabilities, and a separate
   presentation id over its screens. A room can update the presentation
   without a new install, as the dap-spike's rule 6 allows. Presentation
   that changes meaning must not be possible. Screens read projections
   and sign declared acts, and nothing else.
2. **Install is per room.** A host keeps a store of packages. Each room
   installs and grants on its own.
3. **Distribution is a Git release resolved by URI.** Not npm, and not a
   registry room for now. A registry can be added later as an index of
   URIs.
4. **Until change inside a running scope exists, upgrades use new scopes
   and carry forward.**
5. **Server code: an escape hatch later, for code-driven functionality.**
   Section 3's first principle holds for M1 to M3. A later design will
   define how a package may bring code for what declarations cannot
   express, such as computed effects or an adapter to an outside system.
   That design must say three things. First, how the code is isolated.
   Second, how its results enter the record: as signed reports or
   operation outcomes, never as a silent change of state. Third, what
   replay can still check.

## 9. Relation to other work

- **The `apps/` consolidation, `38064e13`.** Separates application source.
  M1 builds on it and removes the build-time composition.
- **The unified forge direction** (`notes/2026-10-15-unified-forge-design.md`,
  draft, request `f088256e`). Its possible deployment and observation
  records could later describe application releases. Neither note depends
  on the other.
- **The roadmap.** Gaps 7, 10 and 13 are roadmap items already. When this
  direction is adopted, the roadmap should gain one row for packaging and
  installation.
- **The offline and sync design, the observability design, and the
  scope-URI direction.** Gaps 5, 12 and 9 rely on these.

## Source

Written by the planner from:

- dap-spike notes: evolving-spaces design (sections 3, 6 and 7), the Weixin
  survey (sections 1 to 3), direction and next steps (section 2), and the
  technology spikes plan
- dap: `docs/roadmap.md`, `docs/write-an-application.md`, `docs/cli.md`,
  `docs/mcp.md` and `docs/architecture.md`
- `examples/lending` and `examples/counting`
- the scope Worker's dispatch at main, and consolidation commit `acb0f6b8d`

Nothing was run for this note. Its statements about today come from
reading those files.
