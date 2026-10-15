# Write an application

To write a dap application, declare its definitions as data, validate
them, pin their bytes, and create scopes under them. This page shows each
step. Two tutorials walk through a definition first:
[Build a counter](build-a-counter.md) and
[Build a lending library](build-a-lending-library.md).
[The architecture of a dap application](architecture.md) explains what
the runtime does with one.

A definition names the items a scope holds, the acts people and agents
sign, the conditions each act must meet and the changes it records. The
runtime judges those acts, keeps the record and delivers the messages the
definition declares. You write no judging code.

Start from a template and remove what your application does not need:

- For a small application with turns and a target, start from the
  [Counter definition](../examples/counting/definition.ts).
- For things that members hold, lend and remove, with a member role and a
  staff role, start from the
  [lending definition](../examples/lending/definition.ts).
- For work shaped around issues and changes, start from the room's demo
  profile in [demo.ts](../packages/lanes/src/demo.ts). It selects acts
  and handlers from the full lane definitions and keeps their item types
  and timed rules.

After you remove rows, validate the whole result.

A definition without `level` uses recorded durability: the runtime commits
its journal before answering with a receipt. You can declare that requirement
explicitly with `level: { name: "recorded", version: 1 }`. The explicit member
changes the definition's bytes and digest. It does not change an existing
scope's pin. Live and Archived levels are not supported yet. Their declarations
are refused as `unsupported-definition`, without creating a recorded fallback.

## Declare the item types

Write the item types first, in the definition's `items`.

An item type names its states, initial state and final states. Its slots
hold people (`parties`), references (`refs`) and values (`values`). Say
whether a slot is required and whether it may change. Say how many items
of the type the scope may hold.

For example, the issue definition has a `commitment` item. It holds the
requester, offeree and performer. Its fixed `termsAt` reference names the
entry that stated the terms. Its states include `offered`, `accepted` and
the final state `fulfilled`. A `report` is a separate item, so reporting
work does not itself say that the requester accepted it.

Read the actual [issue](../packages/lanes/src/issue.ts) and
[change](../packages/lanes/src/change.ts) declarations alongside the
[generated row reference](lanes-reference.md). Keep the names your
application needs and remove the others.

## Declare the acts

Write the acts in `acts`. Each act says whether it opens an item,
changes an item or comments. It declares the fields the signer supplies,
the action in `grant` that the signer must be allowed to take, the guards
that must hold, the effects it writes and
the messages and notices it sends.

The issue's `accept` act changes a commitment. Its signer supplies a
`terms` reference and needs `issue.promise`. Its guards require an offered
commitment, the named offeree when there is one, and the same terms the
commitment already holds. Its effects make the commitment accepted and
the signer its performer. The entry also records notice to the requester.

Then write the handlers in `receives` and the timed rules in `timed`.
A handler says what a message from another scope changes. A timed rule
says what changes when a recorded deadline passes. These are events the
application declares as part of the same definition.

## Put each invariant where it lives

Write each invariant as a plain sentence before choosing its form.

| Invariant | Where it lives |
|---|---|
| A person accepts the terms that were offered. | The fixed `commitment.termsAt` reference and the `accept` guard that compares it with the supplied `terms`. |
| Only the named offeree accepts an offer that names one. | The `accept` guard, in the definition. |
| A fulfilled commitment has ended. | `fulfilled` is a final state of the commitment item. Holds under a commitment end in the entry that makes it final. |
| A thing that is lent cannot be borrowed again until it is returned. | The lending `borrow` guard `{ state: ["available"] }`. |
| Only staff remove a thing from the library. | The lending `cancel` act names `lending.staff` in its `grant` field. In the rehearsal room, membership gives that action to the `admin` role only. |
| A person may promise work only when allowed to. | The act names `issue.promise` in its `grant` field, and membership says who is allowed to take it. Being allowed does not replace the act's guards. |
| Each recorded attempt at an outside effect is sent at most once, including across restarts. | The platform's operation ledger and driver. The application inherits this rule. |
| Publishing a change to the rules extent needs the controller's approval. | The room's published rules configuration, which its controller may change. The destination judges the change against that configuration. |

For an outside effect, a lost answer does not mean that nothing happened.
The durable send mark remains, and the attempt may have an `unknown`
outcome. The original mutation is not sent again. A new attempt must be
opened by an entry under its owner's rules. See the
[operation driver](../packages/scope/src/operations.ts).

A definition is pinned for the life of its scope. Removing an act or
changing a guard makes a new definition with a new digest. Activating that
definition lets the directory create new lanes under it; existing lanes
keep the digest they pinned. Room rules, such as required approvals and
checks, have their own published revisions. See [scopes](scopes.md) and
[Lanes](../apps/room/docs/lanes.md) for those boundaries.

## Validate the whole definition

`validateDefinition(definition, bounds, profiles)` checks the whole
declaration before a scope pins it. It checks names and forms, required
slots, effects, counts and the space needed for timed entries. It returns
the validated definition or the problems that refuse it.

Use the installation's bounds. The supplied examples use
`PROPOSED_BOUNDS`. These numbers are provisional. If the definition
declares rule expressions, pass `RULE_PROFILES` from
`@generalbusiness/dap-derive/rule` as the third argument, as the
[Counter's tests](../examples/counting/definition.test.ts) do. The
[lane definition tests](../packages/lanes/test/definitions.test.ts) show
the validator calls for the room's lane definitions and their demo
profiles, which declare no rule expressions.

The validator imports below use the published SDK names. The lane demo
definitions remain checkout-only source because the public SDK has no lanes
package.

From the repository root, with its workspace dependencies installed, this
command validates both demo profiles. Unlike the standalone Counter tutorial,
this mixed example requires the checkout for `issueDemo` and `changeDemo`:

```sh
node --input-type=module <<'JS'
import { PROPOSED_BOUNDS } from '@generalbusiness/dap-contract';
import { validateDefinition } from '@generalbusiness/dap-derive';
import { issueDemo, changeDemo } from './packages/lanes/src/demo.ts';
for (const definition of [issueDemo, changeDemo]) {
	const result = validateDefinition(definition, PROPOSED_BOUNDS);
	if (!result.ok) {
		console.error(JSON.stringify(result.problems));
		process.exitCode = 1;
	} else {
		console.log(`${definition.name}: valid, ${result.definition.digest}`);
	}
}
JS
```

This exact checkout command ran with Node.js 26.11.1 at commit
`fdafc051ae2ddc384c5dea940fe469e677993dec` and exited 0. It uses the
materialized repository workspace packages, separately from the Counter
tutorial's public npm install. Its observed output was:

```
issue: valid, sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e
change: valid, sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2
```

To validate your own declaration, give the validator that whole value
and its bounds. Resolve its reported problems before pinning.
Validation checks the declaration's form. It does not establish that a
host, an outside adapter or an application journey works.

## Pin the definition's bytes

Pin the canonical JSON of the validated definition and its definition
digest. A scope records that digest at genesis. The digest covers the
whole value in the definition's byte domain, so changing any row changes
it.

Keep the declaration, its canonical bytes and its digest together. The
Counter keeps them in [definition.ts](../examples/counting/definition.ts),
[definition.json](../examples/counting/definition.json) and
[pin.ts](../examples/counting/pin.ts), and its test checks that the three
agree. The room's lane package keeps its declarations in `src`, canonical
bytes in `definitions` and digests in `src/digests.ts`. Its
[pin script](../packages/lanes/scripts/pin.mjs) writes every lane
definition and its digest. Its
[reference script](../packages/lanes/scripts/reference.mjs) writes the
row reference, [lanes-reference.md](lanes-reference.md).

To pin the lane definitions and check the reference, run from the
repository root:

```sh
node packages/lanes/scripts/pin.mjs
node packages/lanes/scripts/reference.mjs --check
```

Run on 2026-10-12 at main `d309b6b9`, both exited 0. The pin script
printed:

```
issue  sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad  46160 canonical bytes
change  sha256:3f0389ba644e6d58e96a352debcc77d01661ffcf349c6db53d0645c2513eae70  59715 canonical bytes
issue-demo  sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e  23024 canonical bytes
change-demo  sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2  43130 canonical bytes
change3  sha256:85cec888905722a8dd051b3eb3388a1b674d82500f1df80044b298d12a285930  55174 canonical bytes
change-demo3  sha256:4945948396a0417aabc5bc66520036d39d179d131aaade1428da55ee96ed7b77  40241 canonical bytes
```

The reference check printed:

```
docs/lanes-reference.md is current
```

No generated file changed in that run. After you edit a lane declaration,
the pin script writes its new bytes and digest. Generate the reference
from the same declarations before you review them.

## Write scenarios

A scenario states one invariant and shows the acts that reach it. Include
the refused path that distinguishes the invariant, as well as the path
that takes effect. For the demo profile, the
[story scenario](../packages/lanes/test/story.scope.test.ts) covers an
open extent and a controlled extent. The
[real-room scenarios](../packages/lanes/test/wiring.scope.test.ts) cover
membership, rules and publication together.

Read each scenario's stated boundary. These scenarios run real scopes
and their rules, with a stand-in host and changed set. They do not run a
hosted application or a checker runner. A live run is separate evidence.
[Test dap](testing.md) explains how to choose and run the witnesses for a
change.

## Create a scope under the definition

A definition takes effect when a scope pins it at genesis. Two paths
exist today. Neither was run for this page.

**A lane in an existing room.** The room's rules scope keeps the list of
active definitions. A member who holds `rules.activate`, an admin by
default, signs `activate` with the definition's digest and its canonical
bytes.
The room's directory then creates new lanes under it. The command reads
the `--value` file at the path you give. For the demo profile of the
change lane, run this from the repository root, where the pin script
wrote `packages/lanes/definitions/change-demo.json`:

```sh
dap act activate --on rules --set digest=sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2 --set name=change --value packages/lanes/definitions/change-demo.json
```

Lanes that already exist keep the digest they pinned.

**A new application scope.** A room created with
`dap install --cohort application` has a directory at version 5. Its act
`establish-application` creates one scope under a definition that the
rules scope has already activated. The act takes the definition's
digest, the other genesis fields as canonical JSON in `values`, and
`execution=recorded-do`. The directory supplies the signer as the
genesis `opener`. The definition and every definition it creates must
use no capabilities, and the genesis fields may not be facts, items or
detached texts. Membership must then allow the intended members to take the
definition's own actions, such as `counting.control`. Enrollment alone
allows none. [The dap command](cli.md#an-explicitly-selected-application-room)
lists the install and claim commands and the custody each one needs.

The lending library's [runbook](../examples/lending/runbook.md) has the
commands for this path: `activate`, `establish-application` and
`set-actions` for each role. Its rehearsal section records them run on a
deployed service on 14 October 2026, under the library's first
definition. `--value` sends a file
exactly as it is, and the digest covers the canonical bytes with no
trailing newline. The runbook writes a copy without the newline first.

Validation, pins and creation check the declaration and its record. They
do not establish that a host, an outside adapter or a whole application
journey works. A live run is separate evidence.

## Publish a file from an act

Create a room with `dap install --cohort application-publication` to use
the file-publication factory and destination. Existing rooms keep their
original pins. The new cohort uses register@9, directory@8, membership@4,
rules@3, destination@4 and inbox@1, each with the `platform:` prefix.

Declare a genesis field named `destination`, with type `scope` and kind
`destination`. Keep that reference in a fixed item slot. The directory
supplies its own recorded destination, including its incarnation. Do not
include `destination` in the caller's genesis `values`: the factory
refuses it even when the definition declares no such field.

Declare a `tell` to that slot with message `publish-file`, fields `path`
and `content`, and result clauses for `refused` and `undelivered`. The
path is at most 1,024 bytes; the UTF-8 text is at most 65,536 bytes. The
[Lending definition](../examples/lending/definition.ts) shows this form.
Its guards further restrict paths to the shelf and keep each path owned
by one thing, including after that thing is gone.

An application of the room can overwrite any repository path, including
files in the rules extent. The room's change-review rules do not govern
`publish-file`. Control remains at activation and creation: a member needs
`rules.activate` to activate the definition and `application.establish` to
create its scope. Activate only definitions whose writes you trust.
The destination proves that its own directory created the sender before
admitting or pushing its file.

The act takes effect before the destination pushes. A successful act or
delivery does not prove that its page is published. Read the destination's
receipt to connect the sending entry and send ordinal to its commit.
For the same sender and path, a later source position (entry number, then
send ordinal) supersedes older unsent work even if it arrives first. An unknown push keeps the publication slot
and is never resent; later work waits behind it.
