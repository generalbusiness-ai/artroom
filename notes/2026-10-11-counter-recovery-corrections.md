# Counter recovery corrections

This successor addresses the two P2 findings in checker review `eb363393`
of combined UI/Counter head `fb6f923e`. The completed UI redesign and its
policy applicability correction remain in the combined delivery.

A retained control command now fences new sound and commands even when its
private `kind` is missing or empty. Only an explicitly empty store slot
means absence. Restore, Check, Resume and later custody reads use the same
classification. Malformed originals remain unchanged and visible as
unknown; valid prepared requests and exact terminal recovery retain their
existing behavior. Mounted Arm and control callbacks check the fence.
A save that writes before throwing also recovers the retained presence.

An expired, definitely unsent selected Counting install now directs the
supported separate empty `ARTROOM_HOME` workflow. The original directory,
request, register and deadline stay intact. The new directory needs its
own plan and operator key, and the host must use that new register ID.
Attempted and acknowledged originals still reconcile from their original
directory, including after expiry. No request is silently replaced.

## Verification

At Source head `d5205690` / tree `e5d0daf6`, CLI process `47538` passed its
compiler and both whole-file custody cases. Browser process `81123` passed
its compiler and all 37 existing cases. The original browser preparation
stopped before any compiler or body because two executable links still
named a donor checkout; their targets were corrected. That preflight
failure remains separate and earns no test credit.

The mounted fixture initially failed to retain its audio marker for
readback, which would hide the intended sound failure. Test-only commit
`3188cc09` / tree `70ee3a6b` corrected that fixture. Process `54915` then
passed the browser compiler and both complete mounted-app cases. No
37-case or CLI repeat was performed for that fixture change.

The single isolated control, process `37162`, restored kind-derived
absence. Both mounted cases ran: roster recovery passed, and the sound
fence failed by assertion with one fake playback versus zero expected.
The control therefore distinguishes the bug. Its sibling was restored
exactly to clean `3188cc09`; the mutant ref remains retained. No mutation
sweep, compiler repeat or baseline repeat accompanied the control.

These cases use scripted service, DOM, speech and memory custody ports.
They prove those boundaries, not deployed provisioning, real browser
storage, audible speech or three independent enrolled voice agents.
Actual asset generation and the ordinary gate are recorded in the final
review evidence, with their exact head and outcomes.

## Delivery scope

Repair requests `d9ed7989` / promise `8028a4a6` and `947908eb` / promise
`889ae255` are carried by the existing bounded Counter Source child
`d0caeb8c` / implementation `f4cf2432`. The combined Source receipt may
close only that child and UI child `b9c885d3` / implementation `fe19f5fb`.
Full Core `03f0e900`, Counter `c612acc6`, Jam `73d10ceb` and their runtime,
review, deployment, recording and manual acceptance duties remain open.
The earlier `fb6` findings and outcomes remain historical evidence; they
do not authorize landing the corrected successor without independent
exact-head review.
