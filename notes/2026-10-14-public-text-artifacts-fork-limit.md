# Public wording: Artifacts, concurrency, and Library recovery

This candidate combines requests `f384cab0`, `a0ea718c`, and the bounded
Library correction `dce705`. It is prepared from main
`f20df3420db8e09af4059ef38dc1c568762fb448`. It awaits composition after
the journal-name fix. No application checks, doc-link command, build, gate,
or provider action has run for this candidate.

Public pages and comments name Cloudflare Artifacts, then Artifacts.
Host keys, binding names, environment variables, file names, and historical
notes are unchanged. Test stand-in descriptions use the same host name.

The concurrency paragraph corrects the requested sentence that both
changes are pushed. Both changes target one repository, but the second
change on the stale base is refused before publication. Its replacement
uses a fresh lane and base. This is supported by
`packages/lanes/test/demo.scope.test.ts:475` (same base), `:488`
(stale merge refused), and `:489` (replacement published), and by
`packages/platform/src/reservation.ts:193` (base differs from the head).
The destination reservation and judgment are described by
`packages/platform/src/destination.ts:10` and
`packages/platform/src/reservation.ts:192`.

The fork limit is described in `docs/hosts.md` and plan 029. The operation
kinds and retained fork records are in
`packages/derive/src/capability/hold.ts:51` and `:509`. The existing host
port selects the destination repository by name in
`packages/scope/src/artifacts-host.ts:248`. The fork measurement note
exists on this receiving main, so the limit links to it. No clause about
operations not being sent to a host was added to the limit paragraph.

The Library correction distinguishes final run `9377` recoveries from the
earlier rehearsal, records the completed history policy correction and
publication, and keeps the original f33 gate separate from the later
receiving MCP correspondence. The prior external patch remains preserved.
Homepage publication is now supported by original `89750`: all five
provider phases passed, its final guard passed, and all 13 anonymous static
readbacks matched. The four final Library hrefs were checked without
following another service. This reused build `55847` and did not repeat
a build or gate. The original f33 gate remains distinct from the receiving
MCP composition. No geometry or human acceptance is claimed.

Before review, run the doc-link check, the owning checks for changed test
comments, and one gate on the final composed candidate. These remain unrun.

Plan 030's repeated claim of one repository per hold was also corrected.
The current destination uses one repository; per-hold forks remain the
unbuilt plan 029 design. Its original intended-design wording is identified
as such. Support is `docs/hosts.md:150`, the retained operation kinds in
`packages/derive/src/capability/hold.ts:51`, and the destination repository
selection in `packages/scope/src/artifacts-host.ts:248`. No runtime behavior
or host identifier changed for this wording correction.
