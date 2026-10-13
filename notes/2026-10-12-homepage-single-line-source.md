# Single-line homepage and larger shared wordmark

Request `532ffca4bb270301b9e1b6ea5d59ac4578864caa`, under promise
`167bf06ae308bacd73ae541abdb34f99eadcde3f`, keeps only
“Durable action platform for people and agents.” on the homepage. The separate
supporting sentence is removed. The existing homepage witness expects that
single line. Child copy, destination order, URLs, utility link order, palette and
fonts remain unchanged.

## Initial Source preparation (historical)

The shared utility logo width changes from 170 to 212.5 pixels on desktop and
from 130 to 162.5 pixels at the compact breakpoint. All four headers use the same
stylesheet. The 440 by 256 SVG aspect ratio and 60% maximum width are preserved.
At those unclamped widths, the calculated heights change from 98.91 to 123.64
pixels on desktop and from 75.64 to 94.55 pixels in the compact row. Each height
increases by exactly 25%. These are calculations from the Source dimensions,
not measurements of a newly rendered page. Narrower containers can still apply
the existing width cap. Actual browser geometry and fold acceptance remain owed.

This isolated Source preparation starts from landed main
`8e4689b489fac9e29080b58d8b5c98f66f539d5a`, tree
`f841fb6ea9c9bc7f5ea8a704f970a7befdcb7f12`. It changes only homepage HTML,
two shared CSS width values, the retained copy expectation and this note.
The SVG master and child HTML headers remain unchanged. Existing results retain
their original heads and do not prove these new dimensions.

No tests, build, browser, gate, deployment or package installation has run for
this Source. The receiving Forms and Round 2 landings must be composed before
the request's one ordinary gate and exact-head review. The owning homepage
witness and bounded actual browser geometry need their released checks. The
normal homepage build, deployment and served-page readback follow approved
landing. Source preparation alone does not close the hosted or human acceptance
scope, and this note claims no approval or delivery of the larger rendered logo.

## Retained local browser result

The subsequent original browser run `80424` passed all eight local cases at
Source `64e68b8dea675180c59af6b2358e3865a94e218d`. At a 1280-pixel viewport, the
measured wordmark height rose from 98.90625 to 123.625 pixels, a ratio of
1.249921. At 390 pixels, it rose from 75.625 to 94.53125 pixels, a ratio of
1.25. The exact sole tagline occupies one desktop row and two naturally wrapped
mobile rows. The supporting sentence is absent. Static Room and Counter
marketing headers match the new homepage height at both widths. All 52 requests
were allowed local GETs, with no browser errors. Root directly viewed all eight
captures and recorded the seven-point fidelity check. The browser proof is
`/Users/hughpyle/play/artroom-diagnostics/homepage-single-line-browser-source/output-one/public-result.json`,
SHA-256 `5c6ed195c575b6205044a555ea906fb9615111698b145a3bd23f6e3d83dd67ec`. The
fidelity record is
`/Users/hughpyle/play/artroom-diagnostics/homepage-single-line-browser-source/root-fidelity.public.json`,
SHA-256 `d104132a8ece07174d7c8d3155426d42389a22292179227ce699fa7068762148`.
These measurements use exact Source HTML, CSS, and public brand assets on
loopback with fresh browser contexts. They establish no deployed page or served
readback. No application link or Jam page was opened. The normal homepage
production build remains after approved landing. At that reporting head, the
gate and exact-head review remained pending, with Forms required to land before
Home. That successor changed only this note.

## Landed Forms composition and actual Home gate

Home now includes landed Forms main
`2086f60e5eef9012870b4053a7a381cb7544c97e` through normal merge
`c1241066ce818f07343ce7365acb10df8d3d11f0`, tree
`c9d72c2a9bd21ea3c655059d771e11f6d4e6f8fc`. The diff from that landed main
contains only the four intended Home paths. Their bytes match frozen Home
`0080b1ea5d9fe47668558f3309b26766711174ec`; all other Forms and documentation
mode, type and blob entries are preserved.

The original owning Node test passed one case at
`64e68b8dea675180c59af6b2358e3865a94e218d`. Its
[closed public result](/Users/hughpyle/play/artroom-diagnostics/homepage-single-line-source/owning-check-public.json)
has SHA-256
`a1568041b20f664807c2876e34817707bac9096be270ca3af1b2391bc254371f`.
It builds an exclusive temporary fixture and removes it. It is distinct from the
normal production build required after landing. Root independently verified all
62 Home producer, test and brand inputs equal those at the tested head. The
owning result and eight-case browser result above therefore retain their
original heads and apply to those unchanged inputs. Neither check was repeated.

Original session `17461` completed one ordinary `npm run gate` at `c124`, with
command and wrapper exits 0. It passed 1042 Vitest tests, with 2 existing skips,
and 186 test files, with 1 skipped file. The chained Node runs passed 9 and 55
tests. The measured command wall time was 119.7002 seconds. Installation was
skipped. The clean postguard retained 1431 Source files, 3882 dependency files
and 12 workspace links. The
[closed public gate proof](/Users/hughpyle/play/artroom-diagnostics/home-single-line-composition-gate-source/gate-one/public-proof.json)
has SHA-256
`5f8ee5dcbb61a4d9142cb0af0f4e6ab9cda9c0fee1ae2688c7366290e5e698ac`.
The raw diagnostic token counts are 1 for `RefcountedCanceler` and 2 for
`SQLITE_CONSTRAINT`; the successful gate does not establish a clean log,
a cause for those diagnostics or physical request draining.

This reporting successor changes only this note. All 1430 other mode, type and
blob entries remain exact to gated `c124`; no test, browser, build or gate is
repeated. The normal Source child
`1c8f68f27f657b9e9ce76f3b402aa48a2a472012`, under promise
`ba1cec2e71ff1cb987d5587d0812f8a8de4e8feb`, records this bounded Home Source
work. Exact-head review and normal approved landing remain required before the
normal production Home build. Full parent
`532ffca4bb270301b9e1b6ea5d59ac4578864caa` retains that build, deployment,
served-page readback and Hugh's acceptance duties. These local results establish
no hosted page or human acceptance.
