# Room creation chooser

This note reports the page Source part of request `834d134c` and promise
`12675083`. Deployment, valid offers on both hosts, and one cold browser
creation remain owed under that promise.

## Behaviour

The disconnected chooser says **Join or create a room**. It presents three
matching cards, in this order:

1. **Create a new room** — Start a new room for shared work.
2. **Join with an invitation link** — Paste a link. We create your key and join
   the room.
3. **Join with a config and key** — Use config.json and its matching device key.

The connected chooser keeps **Join another room** and its named link back to
the current room. It presents the same cards. Neither chooser has an intro
paragraph. Selecting creation opens the Start form; it does not create a room.

When discovery fails for a new Start, the page says:

> This service is not set up to create rooms. Nothing was sent.

The new message applies before Start custody begins. Check and Continue keep
their original errors and retained register. The existing exact-origin,
verified-founder, unresolved-enrollment and late-callback checks still apply.

## Source and checks

The authored changes are `packages/page/src/main.ts`,
`packages/page/test/joined-shell.test.ts` and
`packages/page/test/start-ui.test.ts`, plus the existing chooser expectations
in `packages/page/test/join-ui.test.ts` and `packages/page/test/settings.test.ts`.
They are now composed on receiving main
`26d2bc8a40bbf419c35f0dbfdadead7bb5a7c8e0`, whose tree is
`46f8966882e10b8f7e8fdabd73464d2ac5be75db`. This receiving tree preserves
the security landing, Lending baseline, tagged agent enrollment cohort and
Counter documentation landing, plus the Lending homepage and rehearsal
record. The five authored code and test files retain
their exact bytes from `d80d5432`; this note updates their receiving provenance.

At `ff10c5c9`, both Page compiler configurations and all four whole chooser
owning files passed their five existing coherent cases in original run `13603`.
They cover both chooser variants, navigation without creation, unavailable
discovery without custody, retained Check errors, invitation enrollment,
config/key admission, and the existing Start recovery and connection flow.
Their DOM, discovery, custody and room ports are scripted; these are not
browser or hosted admission witnesses. Source and dependency guards passed
before and after the run.

The normal Page producer ran once at that Source, in original run `56955`.
Its generated HTML exactly equals the Source HTML. The generated module
contains exactly that HTML and the emitted script. Only
`packages/scope/src/page-assets.ts` changed among tracked files. The script
is 628,940 bytes with SHA-256
`6907f527f7b55709d9823eb8ac42a50803ca5fe68469cfb5861ed5a016b2641a`.
The producer preserved the prior dist directory and files physically in its
evidence directory. Its complete guards passed before and after generation.

The original compiler/owning run `3836` and producer `25077` at `30a69505`
remain historical evidence only. They were not transferred to this composition.
The receiving main successor `11e3c72b` adds the enrollment landing receipt
and has exactly the same full tree as `a5d25fd6`.

### Composition with retained invitations

The isolated composition `cfd91dbd` also includes the approved invitation
change at `7d0aba6d` and the approved fold publication design at `eb53463e`.
Their original main landings remain separate. The Page uses the changed
`issueInvitation` function, so this composition needs a new bundle.

In original run `41312`, both Page compilers and the single Vitest command
exited zero. Six selected cases passed and three unselected cases were skipped.
They include the five chooser cases above and one connection custody case,
whose shared sender is mocked. The wrapper exited one because its parser
expected per-case `pending` statuses where Vitest records `skipped`.
Passive run `66720` independently verified the original report, exact case
selection, and fresh Source and dependency guards. It preserved the wrapper
failure and did not rerun any compiler or test.

The normal Page producer then passed once at `cfd91dbd`, in original run
`15814`. Its script is 628,955 bytes with SHA-256
`4fe2e5ef5843fc0c29b5df8ddfe477f631a44deda3e259bf8a5477034b458a5a`.
The module contains exactly the emitted script and Source HTML. Only the
generated module changed among tracked files. Its guards passed, and there
was no prior dist directory. Producer `56955` remains evidence for its earlier
Source and bundle, rather than this generated module.

The first gate at `282bb48b` (original `36494`) failed one Native membership
authority witness: an inbox was provisional where the fixture promised active.
The unchanged authority assertion passed in an isolated diagnostic (`9216`).
The separately tracked fixture correction and its deterministic confirmation
control are reported in `2026-10-14-membership-inbox-confirmation.md`; the
original failure cause remains unknown.

The review gate runs once on the changed, composed final Source. Its actual
terminal, phase results and retained evidence are supplied separately with
the review request; this note does not predict a pass. No compiler, focused
test or producer pass replaces that gate.

## Hosted acceptance still owed

Both demo hosts need a genuine `platform:register@8` root, a matching version-2
`DEMO_START_CONFIG`, and the actual `DEPLOYMENT` setting. The GitHub adapter
admits the ordinary register, current demo register and optional legacy demo
register separately. Keep the ordinary App register binding and other existing
bindings. Public demo repositories require the shared repository setting to be
public and the configured account to be `generalbusiness-ai`.

After normal Source review and landing, record the actual served commit, both
valid offer responses, and one cold browser creation reaching a verified ready
room with Invite people, Connect command line and Connect an agent available.
Retain the original requests and custody if an outcome is unknown. This note
claims no provider change, deployed version, live mitigation or ready room.
