# Join a room and publish one text change

For a developer joining an existing room, this guide covers the current
command-line path: join, propose one text file, obtain the reviews its rules
require, and follow the room's confirmed publication.

This draft describes capabilities in main
`9d7e4c2777ea8d35441b4a9d79b407cd701065fa`, inspected on 2026-10-09.
The current CLI founds rooms under the native `@2` cohort. Workspace packages
are `0.1.0-dev.1`; no current public registry release or cold-reader result
is established. Use an already supplied, supported CLI and an invitation
from the room admin. This guide supplies no npm installation command,
operator permission or new-room bootstrap.

## Join with your invitation

In a terminal with a fresh Artroom user context, run:

```sh
artroom join '<your invitation link>'
artroom acts
artroom issues
```

The admin chooses your room role when inviting you. The CLI creates and
keeps your device key; you do not paste a private key into a command.
The invitation contains a one-time secret. Keep it out of shared notes,
screenshots and logs. A shell may retain the command in its private history;
follow your environment's handling of sensitive arguments.

The CLI saves the exact signed Join request privately before sending it.
If the reply is lost or the inbox is still being created, rerun `join` with
that original link. It uses the same key, request and deadline. A different
invitation cannot replace a pending Join. Missing private records or keys
stop recovery; they do not authorize a new enrollment as the same member.
See [the command reference](../cli.md) for custody and refusal details.

`acts` lists the actions your current role holds. An offered action can
still be refused by the room's rules or state. A member can propose and
review changes, but the default member role cannot merge; a maintainer or
admin with `change.merge` performs publication.

## Propose one text file

Create a local UTF-8 file, then use its path as the input:

```sh
artroom edit README.md --file ./readme.md --title 'Explain the room'
```

`README.md` is the target path in the room's repository. `./readme.md` is
the local file whose bytes you want to propose. The current command carries
one UTF-8 text file of at most 65,536 bytes. It reads the active change
definition and the destination's published head, computes the content digest
and size, opens a change, proposes that file, and attempts a merge. The room
judges each act; your command never pushes the published branch directly.

Read the outcome carefully. `Proposed` identifies a recorded change and
version. It does not mean published. A missing approval, unauthorized merger
or invalid path can leave a recorded proposal unpublished. Keep the change
and version shown in that output for review and later merge.

This source has no `artroom propose <branch>`, application preset or ordinary
browser editor. The branch/manifest-list workflow is separate unlanded work;
it is not an alternative command in this guide. A clone is optional for this
one-file path. [Clone and host credentials](../hosts.md) explain the separate
read-token path and its limits.

## Review the exact version and extent

A reviewer must read the proposed content and hold the action required by
the touched extent. An extent is a named part of the repository with its own
review requirements. For a source extent named `source`, an eligible reviewer
uses the actual change and version printed earlier:

```sh
artroom act review-verdict --on <change-scope> \
  --set manifest=<version> --set verdict=approve --set extent=source
```

For an authority file such as `AGENTS.md`, the default rules extent requires
an eligible controller holding `rules.publish`:

```sh
artroom act review-verdict --on <change-scope> \
  --set manifest=<version> --set verdict=approve --set extent=rules
```

Replace each placeholder with the exact recorded value. Inspect the room's
Rules view and [lane reference](../lanes-reference.md) before choosing an
extent. One verdict names one extent; mixed changes need each touched
extent's required verdicts. Authors cannot supply an independent review of
their own version. Current rules also judge controller relationships and
any explicitly declared exception. These are native authority checks, not
proof that the reviewing actor is a person rather than an agent.

The browser's current one-file source preview checks the retained proposal
bytes for the selected version. It is literal source, not a complete tree
diff or rendered immutable page preview. General proposal-object access and
cold-review acceptance retain their own owners. Do not approve content you
could not obtain or verify.

## Follow confirmed publication

An authorized merger runs:

```sh
artroom merge <change-scope>
artroom log <change-scope>
artroom verify --all
```

A `Published: commit ...` result names the room destination's confirmed
commit. A refusal or uncertain result does not. The room may retain outside
operations and cleanup duties after an unavailable reply; inspection is not
permission to create another merge request blindly.

The Page link and Pages navigation use `/site/<directory>/HEAD/...` for the
latest published branch. Opening that address later may show a newer change.
It does not preserve the earlier version. `verify` reports consistency only
for the histories, coverage and trusted inputs it states; it does not prove
that all external effects are finished or that unobserved history is complete.

## If you cannot continue

- **Join expired, used or refused:** keep the original pending request.
  Ask the admin about the invitation; do not infer recovery from a fresh key.
- **No active change definition:** an authorized admin must activate the
  correct definition. Your role or a generated key cannot do that implicitly.
- **Approval required:** keep the recorded proposal and have an eligible
  reviewer judge its exact version and extent.
- **Merge unauthorized:** a member's proposal can be valid while its merge
  is refused. Use the authorized maintainer/admin path.
- **Path invalid:** create a deliberate corrected proposal. The current
  command does not promise in-place path correction or rename.
- **Reply unavailable:** inspect the original records. Generic `act`, `edit`
  and `merge` do not provide a universal durable recovery journal; rerunning
  them may sign new requests. Join's saved-request recovery is narrower.

## Evidence and remaining acceptance

Commands match current [CLI help](../../packages/cli/src/line.ts).
[CLI story](../../packages/cli/test/story.scope.test.ts) covers native
founding, enrollment, authority refusals and history reads with labelled
Git host, scheduler and clock stand-ins. The existing
[one-file scenario](../../packages/lanes/test/edit.scope.test.ts) and
[demo rehearsal](../../scripts/demo/rehearse.ts) supply contribution,
extent-review and publication examples. This documentation change runs no
new tests or hosted commands and claims no new fixture result.

The [full manual ledger](ledger.md) retains installation, browser/agent,
source-review, recovery, release and cold-reader obligations. This bounded
guide is awaiting independent page review. It does not complete the approved
manual's full first-change tutorial or its hosted 15-minute target.
