# Application source consolidation

Request `38064e13`, promise `5c6c1cbb`. This Source candidate preserves Main
`1d2572d8`, including the bounded-read prerequisites and the planner's
hosted-agent design note. It completes the application path move; it
implements none of that design note's proposed hosted-agent features.

Room owns its lane definitions, page, static assets, application dispatch
and Worker configuration under `apps/room`. Counter's definitions, browser,
build scripts, documentation and served assets are under `apps/counter`.
Jam's landing page and the recorded deployed procedural source and managed
assets are under `apps/jam`. Worker names, native class names and served
URLs remain unchanged. No provider operation or deployment ran.

The public platform SDK stays under `packages/platform`, with exact current
Main bytes. It is the reusable definition and rule catalog that the
framework exports. The Scope Worker serves Scope, Site and MCP without
importing application source. The application entry in `apps/room` exports
the same existing classes and adds Room, Counter, lending demo and brand
routes. ScopeObject retains its read-only native founding projection; its
HTTP dispatch belongs to the app. Lending remains the separately scoped
example, and its static route/assets move from the generic Scope package
into its existing example directory.

Counter shares the existing Room application Worker. Its README names
`apps/room/wrangler.jsonc` as its actual deployment configuration and links
the application dispatch that serves it. There is no independent Counter
Worker. This is an explicit shared deployment owner, not a duplicate or
unused Wrangler file. The planner has been asked to confirm this reading
of the per-app configuration condition. This candidate claims preservation
of the actual shared deployment; it does not claim a new independent
Counter deployment or an adopted future split. Jam's recorded managed
assets have their own app-local configuration.

Workspaces, lock entries, Vitest projects, TypeScript configurations,
package scripts, build recipes, generated asset destinations, SDK/module
checks, tutorials and operating guides use the current paths. The practice
script already contains no removed source-path reference. A hidden-aware
tracked-source search finds no `examples/counting` or `homepage/src/jam`
outside notes and plans. Historical source links, captures and evidence
retain their original commit/route/hash provenance; moving a screenshot
is not a new observation.

Jam's production closure is recorded from foreign commit
`b4b7c764199e5b9758771e43f8132c618858bf32`, not an arbitrary branch tip.
`apps/jam/deployed-source.json` records each imported source and asset hash,
its original configuration and retained public deployment evidence. The
managed-assets recipe checks the whole recorded file set before copying
it into a fresh external directory. It reproduces the HTML entry rewrite,
uses the retained exact JS bundle and refuses changed inputs, extra assets,
existing output or an output inside the checkout. It neither installs tools
nor contacts a provider. The separate retained inline authoring recipe is
not the managed-assets deployment recipe. No new Jam bundle, playback,
native Jam integration or hosted acceptance is claimed.

Focused checks passed while this branch was prepared:

- All affected workspace and supplementary root TypeScript compilers.
- Five native Room wiring cases and three selected application route cases.
- Twelve static source, framework-boundary, Home, Jam and SDK checks.
- The documentation audit: 455 relative links, none broken before the final
  Counter ownership paragraph; the final link audit is recorded separately.
- The normal local Page and Counter builds and their two exact generated
  asset comparison cases. The Page asset uses its new app-local generated
  header and agrees with the current source.

The six moved lane JSON definitions and pins, both Counter definition JSON
files and pins, and the public platform SDK remain byte-identical to Main.
Large browser assets are generated from the owning normal build recipe;
recorded Jam assets remain their original bytes. The new boundary witness
rejects production framework imports of application source. Existing route
witnesses verify the app entry still serves the pages and the generic
framework entry does not take application routes.

Earlier preparation runs exposed a stale checker test-path assertion, a
wrong expected generic-page error shape and a stale platform import in the
relocated Room fixture. Those were corrected, then their affected checks
passed. An extra Counter asset filter named a nonexistent path and selected
only the Page case; the actual Counter asset case was then selected once.
These are local preparation corrections, not passing executions of the
mistaken filters. No whole gate or mutation sweep ran during preparation.

The final candidate runs one gate before exact-head Source review. Its
finite public evidence records that gate and the final changed-path/hash
inventory. Source consolidation does not establish browser playback,
credential custody, hosted acceptance, a new deployment or completion of
separate durability, bounded-query, library or Jam implementation tasks.
Hugh's no-Cloudflare-infrastructure-deployment hold remains in force.
