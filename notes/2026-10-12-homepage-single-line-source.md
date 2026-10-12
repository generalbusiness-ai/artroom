# Single-line homepage and larger shared wordmark

Request `532ffca4bb270301b9e1b6ea5d59ac4578864caa`, under promise
`167bf06ae308bacd73ae541abdb34f99eadcde3f`, keeps only
“Durable action platform for people and agents.” on the homepage. The separate
supporting sentence is removed. The existing homepage witness expects that
single line. Child copy, destination order, URLs, utility link order, palette and
fonts remain unchanged.

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
