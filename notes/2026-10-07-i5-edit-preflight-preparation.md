# Edit command preflight: isolated repair preparation

Preparation under edit request
`50b608c8ab49bc06f21045620226ad535db87fdf`, following root promise `cc2d`.
Base: planner reference `13ae305505d910b23d44e524860dc788cbcc5a8f`.

This predecessor checkout is not integrated with main's Gate 1 repairs at
`cf4e41e295f1fb8e0e4eb32babc5fd9a0d956656`. Its older claim and join code
is unchanged. This is preparation, not a review-ready candidate or a
completed request. No deployment or external provider was called.

## Problem and repair

The command read any active definition named `change`, opened its lane,
asked for rules, and only then assumed `propose-file` existed. An older
valid active definition could therefore leave a partial change and throw
while building the proposal.

The command now checks compatibility before signing the directory's
`open-pr` or the lane's `ask-rules`. It checks the three act targets and
the field types that the fixed edit workflow uses. It reuses the client's
declared-act input validator to check the actual file against its bounds
and reject missing required fields or presentations. That validator is
extracted as the pure helper `shapeDeclaredAct`; the declared handle uses
the same helper before signing, preserving its existing behavior.

Preflight requires each manifest and merge slot that the command relies
on to have one unconditional write from its required source, without a
conflicting write to that slot. It identifies the rules request and
reserve send by their message and destination, checking the needed
operation, manifest and reports sources. Unrelated metadata effects and
additional send fields are not rejected solely for adding rows or keys.
No definition digest or demo profile name is an allowlist. The command
judges no guard, permission, review or check requirement.

An incompatible definition produces a clear local `Unsupported edit`
answer naming its digest and stating that no change was opened. The
response does not expose file content or an exception. No definition,
manifest row, check policy, commit identity or platform version selector
was changed.

## Evidence

The existing edit scenario now activates an older valid definition
without `propose-file`, and a valid definition whose content field is
detached rather than the inline signed text this workflow sends. The real
rules scope validates each activation. Edit refuses each locally and the
directory's exact head stays unchanged. The first supported edit uses
the existing demo definition. The second uses a compatible extension
with an unrelated manifest metadata value and effect, showing that
support is not an exact-row catalog. Its required writes also use the
explicit default target `of: "on"`; preflight normalizes that equivalent
target. Both host scenarios then retain the
existing replacement, controlled-extent refusal/approval, invalid-path,
publication, site and replay witnesses.

The exception catch is limited to the incompatible-definition test
inputs: disabling preflight restores the original thrown path, so the
test captures it and asserts the wrong response and changed directory
head. The product does not catch and print that original exception.
Hosts and scheduler remain the scenario's labelled stand-ins.

Dependencies were borrowed through links to the existing installation,
with workspace links into this isolated checkout. No package was
installed or manifest/lock file changed.

- Existing client declared-input tests and both edit scenarios: 2 files,
  4 tests passed (4.38 seconds before the compatibility refinement).
- After the final compatibility refinement: both edit scenarios passed
  (4.08 seconds); CLI and lanes scope typechecks exited 0. Output:
  `/tmp/artroom-edit-prep-tests.log`.
- The client source/test typechecks had already passed after extracting
  the unchanged shared validator; its code was not changed afterwards.
- `git diff --check` passed.
- One targeted control, disabling preflight, **distinguishes**: the own
  host scenario receives the original `TypeError` and the directory moves
  from sequence 4 to 7, where the witness expects a named local refusal
  and no movement. The control was refreshed after the compatibility
  refinement. Its output is `/tmp/artroom-edit-prep-control.log`.

No whole gate was run. Integration, the required gate and independent
review remain owed under the original request. The lane/authority owner
adoption of the edit rows, required checks for one-file versions, closure
transport and full I3 hold/workspace/staging duties remain open. This
repair does not decide any of them.
