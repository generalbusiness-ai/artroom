# Restore voice eligibility after a selection change

The live Counter browser run 86011 found that changing the selected voice
left Arm unable to arm. The native board was paused; Start had not been sent.
The voice controller correctly invalidated its local observation, but the
mounted app still showed its previous fresh state and requested no native read.
A local selection change does not advance a native head.

The mounted handler now marks its observation stale before disarming, then
refreshes its existing native observer. Arm stays disabled until that observer
returns a complete, current authenticated snapshot. The app does not fabricate
freshness, clear retained custody, or automatically arm or speak. Choosing a
voice after interrupted playback still preserves the existing audio marker and
its recovery fence.

At source cfcf3efd606fc2b68aa0851c3767b020b64d838a, the Counting browser
compiler passed and both existing mounted app cases passed. The second case
now changes the genuine selector to an alternate voice, defers the requested
observation, and asserts no speech, marker, preparation or POST before its
current result arrives. Explicit Arm then plays that selected voice once.
The existing malformed-command, original Resume, cancellation and trusted
refusal assertions remain. DOM, native observations, speech and storage in
these two cases are labelled stand-ins; they do not prove audible speech or
native admission.

One isolated control restored only the old disarm handler. The same whole
two-case file produced one pass and one intended assertion failure: Arm was
still enabled while waiting for the requested observation. The original
source was restored exactly. There was no compiler or passing-baseline repeat.
The first external wrapper stopped before any compiler, bundle or Node test because its
static tool guard named a nonexistent TypeScript library file. That failure
is retained separately; correcting the binding to the actual pinned TypeScript
7 package did not replace a failed compiler or test result.

The normal Counting asset builder then ran once and exited zero. Its tracked
browser JavaScript and Worker asset module are included here. Page source and
assets were unchanged, so no Page build was repeated. The final normal gate
is still owed at this preparation point; no gate, review, landing or deployment
approval transfers from the earlier source head.

The existing Counter native provisioning and Core browser evidence retain
their original subjects. The three-agent live voice journey, audible distinct
voices, join/leave behavior, pause/resume/reset and the required recording
remain open. The paused live browser is owned separately; this source repair
does not operate it or settle a prior audio request.
