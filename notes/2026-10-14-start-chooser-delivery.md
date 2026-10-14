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
`a5d25fd6330f9535ab305dbac0ca7ecd1736d9cb`, whose tree is
`713623ee3385d41be447e41c43f7dbb49fc50441`. This receiving tree preserves
the security landing, Lending baseline, tagged agent enrollment cohort and
Counter documentation landing. The five authored code and test files retain
their exact bytes from `d80d5432`; this note updates their receiving provenance.

At `30a69505`, both Page compiler configurations passed. The two whole owning
test files passed their existing coherent cases. They cover both chooser
variants, navigation without creation, unavailable discovery without custody,
retained Check errors, and the existing Start recovery and connection flow.
Their DOM, discovery, custody and room ports are scripted; these are not
browser or hosted admission witnesses. The original run is `3836`, with
complete Source and dependency guards passing before and after it.

The normal Page producer ran once at that Source, in run `25077`. Its generated
HTML exactly equals the Source HTML. The generated module contains exactly
that HTML and the emitted script. Only `packages/scope/src/page-assets.ts`
changed among tracked files. The script has SHA-256
`55c63beb4bf960d0e862e638cfdc10a3bc1122f88cd10107543253e7190ba806`.
Those compiler, owning and producer results are historical evidence for
`30a69505`; they do not establish this composed head. The candidate initially
inherits the receiving main page bundle. Its normal Page producer and one
ordinary gate remain unrun. The Page compiler pair and all four whole chooser
owning files must run against the new receiving cohort before that gate.

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
