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

## Approved landing and production delivery

Assigned approval `0ed7a4e588a158e682ab954ef44fafba72d0dd52` accepted Source
`aac3b436ff4dbe1ec503d5a533600ced3a1cf72d`. Requester ratification
`cbe41021caab8d5f573315a52fa0d7c4f435f8b5` preceded the normal landing.
Sealed receipt `1e5996077de2d0da063119ffe9f515e69b93af5f` records main
`02d6ccb7f4f6d7e7ebb5150494fa62fa420be38d`, tree
`4f8c6db139d104937ca7566dbf7b7975eb939b13`, and the four intended Home paths.

Original production session `95389` ran one normal Home build and one deployment
from that landed commit. Both phases exited 0. The existing `dap-home` Worker
reported version `697b181d-08da-46ff-9ed2-a7b31ca19836` at 100% traffic.
The resource hashes, protected configuration except the permitted script etag,
and domain remained unchanged. The
[original production result](/Users/hughpyle/play/artroom-diagnostics/home-single-line-production-preparation/output-one/public-result.json)
has SHA-256
`f6970dd36fb7d6f8ccc5436d253b1cedcfd939e5ad0244e4a38d66e93f7db01f`.

That original command remains failed. Its first canonical Home GET returned
2190 bytes instead of the expected 2063, so nine asset reads did not run. The
[HTML comparison](/Users/hughpyle/play/artroom-diagnostics/home-single-line-production-preparation/original-html-comparison.public.json)
shows that response matched committed pre-Home HTML exactly. Its SHA-256 is
`d9abb31a9f270771a84d9235cc05cefb283436d2618d168c9e3fcb8ff388e6a8`.
The comparison establishes no cause for the mismatch.

Separate read-only session `31623` completed all ten canonical GET observations.
Each returned HTTP 200 with exact expected bytes and content type. The Home
response contained the sole adopted tagline and no supporting sentence. The
shared CSS declared the new desktop and compact widths. Room and Counter
marketing HTML, the wordmark, favicon, three fonts, and font licence also matched.
The responses retained `public, max-age=0, must-revalidate, no-transform`. The
[read-only completion result](/Users/hughpyle/play/artroom-diagnostics/home-single-line-production-preparation/completion-one/public-result.json)
has SHA-256
`d4eb66848a2bf006aef8ae28857341389ecf9c823be818bca27cf152ae1d7301`.
This completion ran no build, deployment, or provider metadata call. It does not
replace the original failed result or establish a single successful combined run.

## Served wordmark measurements and scope

Separate session `93685` exited 0 after two fresh browser observations of the
canonical served Home page. The measurements compare against retained local
before heights, rather than a new observation of the previous deployment.

| Viewport width | Retained before height | Served after height | Ratio | Served width | Tagline rows |
|---|---:|---:|---:|---:|---:|
| 1280 px | 98.90625 px | 123.625 px | 1.249921 | 212.5 px | 1 |
| 390 px | 75.625 px | 94.53125 px | 1.25 | 162.5 px | 2 |

The [served geometry result](/Users/hughpyle/play/artroom-diagnostics/home-single-line-production-preparation/served-measurement-one/public-result.json)
has SHA-256
`0ca93f3f6c385a2f7f0a2a728b4f3a454e8d5bbffed27aaf4654cdd9f85d8a3e`.
It records actual observed main `b69ee8ef5284a75239c0c4d47ec8fc23e9a77a53`,
tree `bcbf9e9992be8fd3f2823bc0546cd64e76fee95f`, separately from the build's
landed commit. The intervening main change is the planner's sprint report.
The geometry observation supplies no fresh provider-version claim.

Root directly viewed both served captures. The
[public fidelity record](/Users/hughpyle/play/artroom-diagnostics/home-single-line-production-preparation/served-measurement-one/root-fidelity.public.json),
SHA-256 `82323faa98a57ba5dc0c5f39e3d63da983ab7aa9f17a58091b0682ad5e81093e`,
records visible glyphs, keyboard focus, readable destination rows, aligned rules,
and utility icons without horizontal clipping. This is Root's observation,
not a checker or Hugh visual acceptance claim.

The matching child headers here are the `dap-home` Room, Counter, and Jam
marketing pages. The owning test compares their exact utility header links and
labels with Home, and all four pages use the same utility logo width rules.
The retained local browser result measured Room and Counter marketing headers
at the matching Home heights. The served completion verified their HTML and
shared CSS bytes. The served browser observation opened Home only. It does not
establish fresh hosted child-page geometry or a Jam visual observation.
Room's application Page and Counter's application masthead have their own sizes;
this Home change neither resizes nor proves those application headers.

## Delivery qualification

Checker assertion `3e0c4f7bf26fc871e14a0c30490eddcb0da7b1d0` read all six
public evidence files with matching sizes and hashes. Together with the earlier
Source, test, gate, approval, and landing evidence, the checker states that the
evidence supports request `532ffca4`'s delivery criteria. The original request
requires served verification but no additional Hugh confirmation. This corrects
the extra human-acceptance duty stated in earlier sections and proof qualifiers.
The assertion is a qualification, not parent ratification or a sealed receipt
for this delivery note. The parent remains promised pending its normal workflow.

The separate single-URL purge requested by `d99d5730` attempted one POST and
failed with HTTP 401 and error code 10000. The
[purge result](/Users/hughpyle/play/artroom-diagnostics/homepage-single-url-purge-preparation/purge-one/public-result.json)
has SHA-256
`32e056c0034f4bd038e7a66c21f4113d94225b2f66ae55105447dde3587386ac`.
That failure remains separate work. It is not a dependency of this Home delivery
and proves no cause for the earlier HTML mismatch.

This successor appends only the delivery record. No new test, gate, build,
deployment, browser observation, purge, or package installation ran for it.
