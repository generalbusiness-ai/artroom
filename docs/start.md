# Write a room application

You write the record. The room runs it.

A definition's bytes state the application's schema, API, permissions
and events. They name the things the room holds, the acts people sign,
the conditions each act must meet and the changes it records. The room
judges those acts, keeps the history and delivers the messages the
definition declares.

Start from a template and remove what your application does not need.
For work shaped around issues and changes, read the demo profile in
[demo.ts](../packages/lanes/src/demo.ts). It selects existing acts and
handlers from the full lane definitions. It keeps their item types and
timed rules. After removing more rows, validate the whole result.

For a live application, read the [jam design](../notes/2026-10-01-jam-room.md)
and its [separate repository](https://github.com/generalbusiness-ai/artroom-jam).
Its record holds themes, interpretations, instrument claims and patterns;
the live layer renders those patterns. The jam is a worked design and
spike, not a complete declared definition ready to found. Its application
code depends on published packages and a deployed room's URL.

## Name the nouns

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

## Name the verbs

Write the acts in `acts`. Each act says whether it opens an item,
changes an item or comments. It declares the fields the signer supplies,
the grant they need, the guards that must hold, the effects it writes and
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
| A person may promise work only with authority to do so. | The act names `issue.promise` as its grant; membership supplies current authority. A grant does not replace the act's guards. |
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
[lanes](lanes.md) for those boundaries.

## Validate the whole definition

`validateDefinition(definition, bounds)` checks the whole declaration
before a scope pins it. It checks names and forms, required slots,
effects, counts and the space needed for timed entries. It returns the
validated definition or the problems that refuse it.

Use the installation's bounds. The supplied lane examples use
`PROPOSED_BOUNDS`; these numbers are provisional. The
[definition tests](../packages/lanes/test/definitions.test.ts) show the
validator calls for both full definitions and their demo profiles.

From the repository root, with its workspace dependencies already
installed, the following producer run on 2026-10-08 at source
`3b574854` validated both demo definitions. It used runtime version
`v26.10.0`. It ran no scenarios or gate.

```sh
node --input-type=module <<'JS'
import { PROPOSED_BOUNDS } from './packages/contract/src/bounds.ts';
import { validateDefinition } from './packages/derive/src/validate/index.ts';
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

The run exited 0 and printed:

```
issue: valid, sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e
change: valid, sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2
```

To validate your own declaration, give the validator that whole value
and its bounds. Resolve its reported problems before pinning.
Validation checks the declaration's form. It does not establish that a
host, an outside adapter or an application journey works.

## Pin its bytes

Pin the canonical JSON of the validated definition and its definition
digest. A scope records that digest at genesis. The digest covers the
whole value in the definition's byte domain; changing any row changes it.

The lane package keeps its declarations in `src`, canonical bytes in
`definitions` and digests in `src/digests.ts`. Its
[pin script](../packages/lanes/scripts/pin.mjs) writes all four lane
definitions and their digests. Its
[reference script](../packages/lanes/scripts/reference.mjs) writes the
human readable row reference. Keep those outputs together with a changed
definition.

The same producer run executed these commands from the repository root:

```sh
node packages/lanes/scripts/pin.mjs
node packages/lanes/scripts/reference.mjs --check
```

Both exited 0. The pin script printed:

```
issue  sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad  46160 canonical bytes
change  sha256:3f0389ba644e6d58e96a352debcc77d01661ffcf349c6db53d0645c2513eae70  59715 canonical bytes
issue-demo  sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e  23024 canonical bytes
change-demo  sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2  43130 canonical bytes
```

The reference check printed:

```
docs/lanes-reference.md is current
```

No generated file changed in that run. After editing a lane declaration,
the pin script writes its new bytes and digest. Generate the reference
from those same declarations before reviewing them.

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
[Testing](testing.md) explains how to choose and run the witnesses for a
change.

## Found a room and run the record

The commands and printed lines below are from the observed 2026-10-08
run at source `7bb3a641`, recorded in the
[demo transcript note](../notes/2026-10-07-demo-script-draft.md), shots
3 to 12 and section 6. They are historical observations, not fixed values
to expect on another run. Use the IDs your run prints. Times, entry
numbers and hashes will differ.

You need a deployed service with its host configured, the command
available as `artroom`, and a fresh config directory for each person.
[Deployment](deploy.md), [hosts](hosts.md) and the [command guide](cli.md)
describe that setup. The operator must pin the planned register before
the second command below. An install receipt alone does not configure
the host.

As the founder:

```
artroom install --plan <base-url> --host artifacts --namespace artroom-demo
```

The observed plan printed:

```
Planned: register sc_<register>, under platform:register@2, on host artifacts, namespace artroom-demo. The seed's time is 2026-10-08T19:50:45Z.
Set registerScope to sc_<register> in the Worker's host setting, then run artroom install --planned before 2026-10-08T19:50:45Z.
```

After the operator sets that register, within the plan's deadline:

```
artroom install --planned
artroom claim demo-own-host --handle @hugh
```

The claim creates and confirms the directory, membership, rules and
destination. It gives the founder an admin seat and key. The observed
run printed:

```
Claimed demo-own-host: directory sc_<directory>, membership sc_<membership>, rules sc_<rules>, destination sc_<destination>; each created and confirmed.
Definitions: platform:directory@2, platform:membership@2, platform:rules@2, platform:destination@2.
You are @hugh, an admin, on key key_<founder>; your inbox is sc_<founder inbox>.
```

Next publish the demo's room rules and activate its pinned definitions.
Make the canonical byte files under `packages/lanes/definitions` available
as `issue-demo.json` and `change-demo.json` in the command's working
directory. As the founder, run these three observed commands:

```
artroom act publish --on rules --target 0 --set approvals=0 --set ownerMayReview=false --set 'checks=[]' --set 'labels=[]' --set 'extents=[{"name":"rules","patterns":["**/AGENTS.md","**/CLAUDE.md",".github/workflows/**",".github/actions/**"],"approvals":1,"approver":"rules.publish","checks":[],"class":"authority"},{"name":"infrastructure","patterns":["**/.gitignore","**/.gitattributes",".github/**"],"approvals":0,"approver":"change.merge","checks":[],"class":"deployment"},{"name":"source","patterns":[],"approvals":0,"approver":"change.review","checks":[],"class":"content"}]'
artroom act activate --on rules --set digest=sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e --set name=issue --value issue-demo.json
artroom act activate --on rules --set digest=sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2 --set name=change --value change-demo.json
```

The source extent needs no approval. The rules extent needs one approval
by a holder of `rules.publish`. The founder holds that action and is not
an author of the controlled change.

Invite a member and a maintainer:

```
artroom invite @una --role member
artroom invite @paul --role maintainer
```

Pass each full invitation link privately to its named recipient. In each
person's fresh config context, join with their own link. The note displays
its secret as an abbreviation; replace that abbreviation with the actual
link:

```
artroom join artroom-invite:eyJ2Ijox...
```

As Una, clone and read the founding commit:

```
artroom clone site
git -C site log --oneline
```

The observed clone printed:

```
Read token: sc_<destination>:8, until 2026-10-08T20:37:05.148Z.
Remote URL: https://<service>/git/artroom-demo/<directory>-1.git
Cloned into site.
5924bde Found this repository.
```

Create the two local UTF-8 files that the observed story used. Each
has a final newline. These exact contents come from the run's producer,
[scripts/demo/rehearse.ts](../scripts/demo/rehearse.ts).

`start.md`, 53 bytes:

```md
# Getting started

Clone the room, then edit a page.
```

`agents.md`, 31 bytes:

```md
# Agents

Ask before you push.
```

As Una, open the issue:

```
artroom issue open --title 'Add a getting-started page' --body 'A page that says how to clone and edit.'
```

As Paul, comment; as Hugh, assign it to Paul. Use the issue number your
run printed in place of `1`:

```
artroom issue comment 1 'I will take this.'
artroom issue assign 1 @paul
```

As Paul, publish the source page and link it to that issue:

```
artroom edit guide/start.md --file start.md --closes 1
```

The observed run printed:

```
Proposed guide/start.md (53 bytes) as change sc_<published>, version 5.
Linked: when it is published, the change sc_<published> closes issue #1 (sc_<issue>).
Published: commit 9c37c9834a03f20c51dbd8601a4ac0c2a6e10d01, by the merge sc_<published>:7.
Page: <base-url>/site/sc_<directory>/HEAD/guide/start.md
```

As Paul, edit the controlled file:

```
artroom edit AGENTS.md --file agents.md
```

The observed run exited 1 and printed:

```
Proposed AGENTS.md (31 bytes) as change sc_<controlled>, version 5.
Not published: the merge sc_<controlled>:6 is refused, rules-not-met:rules. The change sc_<controlled> stays open at version 5. When it may be merged, run: artroom merge sc_<controlled>
```

Use your change's scope and manifest number. As the founder, approve
that manifest for the rules extent; as Paul, merge it:

```
artroom act review-verdict --on sc_<controlled> --set manifest=5 --set verdict=approve --set extent=rules
artroom merge sc_<controlled>
```

The observed run printed:

```
Took effect: entry sc_<controlled>:9, hash sha256:54dec834d28b.
Published: commit 59a3eb77535834c1cf90f857bf80d3a12601a96b, by the merge sc_<controlled>:10.
Page: <base-url>/site/sc_<directory>/HEAD/AGENTS.md
```

The page address follows the destination's latest published head. The
refusal and approval belong to the room's record; the destination
publishes only when its rules are met.

To complete the observed story, as Paul also try the path outside the
repository. The observed run exited 1 with `path-invalid`:

```
artroom edit ../outside.md --file start.md
```

As Una, read the issue and check the histories:

```
artroom issues
artroom verify --all
```

For rooms pinned to `platform:destination@3`, this command also reports
recorded reservation cleanup at the same destination head that replay reached.
It names each reservation marked `cleanup-owed`, its reason and attempt count;
unknown custody stays unknown. This separate observation does not turn a
consistent history into a claim that cleanup finished. An incomplete or moving
cleanup read is reported as unread, and owed or unread cleanup exits nonzero.
Earlier destination versions define no staged-reservation cleanup status; their
unchanged output makes no cleanup claim.

The observed issue listing printed:

```
#1  closed (completed)  Add a getting-started page; assigned to @paul; lane sc_<issue>
1 issues, 0 open.
```

The observed full story reported `All consistent: 12 scopes.` The
transcript records each scope's reached entry. Read your run's actual
result and coverage. Do not treat a missing or incomplete history as
consistent.

An unavailable answer confirms no acceptance. It also confirms no
absence of writes. Inspect the history before another mutation. Repeating
a generic act signs a new request; recovering a request needs its
original signed envelope. The command guide describes saved founding and
join recovery.
