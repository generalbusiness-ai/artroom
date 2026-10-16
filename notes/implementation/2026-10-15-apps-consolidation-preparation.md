# Application source consolidation

Request `38064e13`, promise `5c6c1cbb`. This Source candidate preserves Main
`7a6a1b55`, including the bounded-read prerequisites and the planner's
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
unused Wrangler file. Requester adoption `f31290f2` explicitly replaces the
separate Counter-local configuration condition with this existing shared
owner. It preserves the actual deployment and adopts no independent Counter
Worker or future split. Jam's recorded managed assets have their own
app-local configuration.

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

The one frozen gate at `01cebef0` passed installation, whitespace and all
types, then failed five native cases in two files: 1,324 Vitest cases passed
and three were skipped. The demo rehearsal and Page Start fixtures still
imported the now-generic Scope Worker for app routes, so `/page/` and the
founding offer returned 404. Those imports, and the same future recorder
import, now select Room's real application entry. No assertion or native
behavior was weakened. The affected native run passes six cases; two
recorder cases remain skipped. Both affected workspace typechecks pass,
and the previously unrun 16 Node and 55 Counter browser-module cases pass.
No full gate or whole suite was repeated. The original failed gate remains
failed; the successor is supported by these focused checks, not a claimed
full successor gate pass.

Requester adoption `f31290f2` explicitly accepts that qualified successor
validation for this source move, replacing the original whole-gate-passes
condition. It requires no repeat gate and grants no Source approval. The
complete independent review at `8ad35298` found no blocking code or move
defect. Its nonblocking guide typo now names the actual build workspace,
`@generalbusiness/dap-page`; that one-line guide change and this acceptance
report are the only deltas for final review.

The later merge of Main `7a6a1b55` adds only the already reviewed private
query executor, its tests and note. Those three files match their landed
Source exactly and affect no application import or asset. Its own exact
gate passed 1,335 Vitest cases, 13 Node and 55 Counting cases; that separate
gate is not substituted for this branch's gate. The original native
cross-object `RefcountedCanceler` diagnostic, scripted reset/retention
faults and Git body-text warnings remain disclosed. Passing focused checks
do not resolve that diagnostic or prove physical cancellation or draining.

The finite public evidence records both gate qualifications and the final
changed-path/hash inventory. Source consolidation does not establish browser playback,
credential custody, hosted acceptance, a new deployment or completion of
separate durability, bounded-query, library or Jam implementation tasks.
Hugh's no-Cloudflare-infrastructure-deployment hold remains in force.
