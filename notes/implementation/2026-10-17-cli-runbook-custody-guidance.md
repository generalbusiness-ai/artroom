# Keep CLI recovery guidance on the intended directory

Tracking request `cddebb13` / promise `99f70ff5` is delivered through
Source child `03b4ff8a` / promise `527d0f9b`, based on Main `55e1970a5`.
These are nonblocking follow-ups to the approved config-name change.
Archive review `17dad8da` remains first for review and landing. This local
slice owes a final composed gate, exact path reports, independent approval
and correspondence with landed Main before Source filing or landing.

## Changes

The Lending runbook expands `$DAP_HOME` in later shell commands. A person
who set only `ARTROOM_HOME` could run the CLI successfully while the shell
expanded the value path as `/lending.json`. It now shows the explicit
export from the existing legacy variable, in the same shell. The command
refuses an unset or empty legacy value and preserves spaces. It selects
the original directory; it copies no custody and creates no key.

Expired selected install plans now tell a person to set `DAP_HOME` to a
separate empty directory for a new plan. If `ARTROOM_HOME` is set, the
guidance says to unset it or set it to that same new directory, explaining
that conflicting explicit variables refuse before configuration is read.
The original plan and directory must remain unchanged. The printed cohort
label also names `invitation-key` correctly instead of Calling it Counting.
Only the displayed recovery guidance and its label change. Refusal and
admission conditions, stored envelopes, requests, keys, configuration
selection and native versions are unchanged.

The CLI guide and package README distinguish the Node 22.0 launcher using
its installed `tsx` loader from repository checks that import TypeScript
directly. The direct checks and gate use Replay's existing engine range:
Node 22.18 or later in the 22 series, or Node 23.6 or later. This introduces
no new runtime requirement and claims no newly established gate regression.
No old Node version was installed or rerun for this wording correction.

The existing resolver tests now construct synthetic homes, working
directories, XDG roots and expected paths with the host's path functions.
They retain their explicit-variable conflict, legacy precedence and actual
temporary-file custody preservation witnesses. Production `config-dir.ts`
is unchanged. This source correction does not establish native Windows
execution or add a supported platform claim.

## Evidence

The unchanged-lock offline install (`be4072`, exit 0) changed no manifest
or lock. The strengthened existing install-cohort witness failed before
the message repair (`83149`, exit 1, one assertion failure and one
unselected case). The actual output still directed a new plan to
`ARTROOM_HOME` and supplied no explicit-variable conflict guidance. The
first invitation-key case also printed the pre-existing Counting label.

After the repair, both install-cohort cases passed (`e31da3`, exit 0),
including retained bindings, expiry, all four current selectors and
same-envelope recovery after scripted reply/final-save loss. These use
memory storage and a scripted service acknowledgement; they prove no
Native authority, actual host or provider. Existing assertions still
require no send or custody replacement for a refused expired plan.

All three built-in Node resolver cases passed (`2f394d`, exit 0). The
third uses real temporary files containing labelled synthetic sentinels,
and verifies unchanged config, key and pending-record bytes. The first
two use synthetic directory metadata ports. This was macOS, not Windows.
CLI source, test and Scope-test typechecks passed (`54061`, exit 0;
owner terminal `859e26`).

One actual POSIX-shell check (`febc06`, exit 0) used only synthetic
environment strings. With legacy-only configuration, the old expansion
was `/lending.json`; the exact new export gave the same original directory
with spaces followed by `/lending.json`. An unset legacy variable refused
with nonzero status before the value expansion. This check wrote no file
and invoked no application, setup or network operation.

Original owner logs remain at:

- `/tmp/artroom-cli-runbook-p3-install.log`
- `/tmp/artroom-cli-runbook-p3-original-guidance-focus.log`
- `/tmp/artroom-cli-runbook-p3-repaired-guidance-focus.log`
- `/tmp/artroom-cli-runbook-p3-config-dir-focus.log`
- `/tmp/artroom-cli-runbook-p3-types.log`

These references grant no external-file, helper or execution access.
No full gate, Source approval or landing is claimed yet. Original
invitation schemes, custody and all hosted outputs remain unchanged.
No provider call, deployment, publication or new package install ran.
