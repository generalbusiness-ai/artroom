# Tagged agent-key enrolment on the current cohorts: delivery

This note reports the build of request `53850986`, "tagged CLI agent
enrollment on the current application cohorts", on branch
`request/agent-key-cohorts`. The branch started from main `7dc133e4` and
merged main `b4adc8cb` once (the `dap.js` rename and the invitation
service URL check), taking main's `invitationServiceUrl` check beside
this head's pin set in the one file both changed.

## What was wrong

The CLI's agent-key issuance (`issueInvitation`) and enrolment
(`enrolAgentKey`) in `packages/cli/src/invitations.ts` held every read,
receipt and follow to `platform:membership@2`, and the invitation link's
validator in `packages/client/src/agent-key-invitation.ts` accepted no
other `definition`. A room founded with `--cohort counting-commitments`
has its membership at `platform:membership@5`, and one founded with
`--cohort application` at `platform:membership@4`, so on those rooms the
admin's issuance was refused at the first summary read, and no agent could
be enrolled as `docs/mcp.md` describes.

## What was built

- **The pin set.** The client exports `AGENT_KEY_MEMBERSHIPS`, the three
  exact membership pins an agent-key invitation may name:
  `platform:membership@2`, `@4` and `@5`. The link validator accepts
  exactly these; `isAgentKeyMembership` is the one test.
- **Issuance reads the pin from the membership.** A new issuance reads the
  membership's summary once, requires its definition to be one of the
  three and a `platform:membership` pin, and keeps it in the retained
  issuance row (`Issue.definition`). Every later summary read, receipt
  follow and the directory check are held to that pin, and the link
  carries it. A retained row without `definition` (written before this
  head) still means `platform:membership@2`, so the existing behaviour and
  custody are unchanged.
- **The directory beside each pin.** The directory check accepts the
  directory definitions a membership pin is founded beside, as exact
  pairs: `@2` beside the demo register's directory and the web demo
  cohort's; `@4` beside the application cohort's `directory@5`; `@5`
  beside the Counting cohort's `directory@6`. No pin accepts another's
  directory.
- **Enrolment verifies the receipt against the link's pin.** After the
  native enrol is admitted, the receipt's definition must equal the link's
  `definition`; otherwise the configuration does not take the enrolment up
  and says so: "The invitation names X, and the membership's receipt names
  Y. The exact original enrolment is retained unverified; nothing was
  replaced." The follow, the summary reads and the directory check then
  run under the link's pin.
- **The act shape per pin.** The `add-member` and `invite-key` fields are
  prepared from the pinned definition's own data, so the expected
  revisions are the right definition's.
- **`docs/mcp.md`.** A paragraph after the Counter's turn table states the
  commitments Counter's grants as the definition declares them:
  `counting.participate`, `counting.activity` (one grant for `activate`
  and `deactivate`; there is no `counting.activate` or
  `counting.deactivate`), `counting.commit`, `counting.fulfill` and
  `counting.fail`; `counting.control` stays with the controller. It also
  states the three pins an agent-key invitation carries. No earlier text
  of `docs/mcp.md` named `counting.activate`; the correction is an added
  accurate statement, not a replaced one.

Unchanged: the native membership definitions and their rules; the
controller binding (the issuer must be the person controller and hold
`membership.invite` and `membership.manage` under the room's current
policy; no particular role name supplies that authority); the private request,
envelope and key custody of both functions; person invitations.

## Kept person invitations (added 14 October 2026)

Hugh asked on 14 October 2026 for the lending library to reach its final
state, member interface first. The lending runbook named one gap on that
path: no retained person invitation for `platform:membership@4`. The
issuance in `invitations.ts` already handles `kind: "person"` and, with the
pin set above, tags the link with the membership's own pin, but only the
page called it. This head adds the command:

- **`dap invite <@member> --role <role> --keep`** calls `issueInvitation`
  for a person. The secret and the signed `invite-member` are kept before
  sending; the link names the membership's exact definition.
- **`dap invite --check`** reads the kept invitation's outcome and sends
  nothing; **`dap invite --continue`** resumes the exact original.
- One kept invitation at a time. While it is unresolved, a new one is
  refused and nothing is signed. A verified or refused one is released at
  once, and its link is printed once, as `dap invite` prints it. (A person
  who has joined consumes the invitation, so it can no longer be verified
  later; releasing at verification is what lets the next one start.)
- Plain `dap invite` is unchanged.
- `examples/lending/runbook.md` now names the command in place of the gap.
  `docs/cli.md` documents it.

### Answer to review fe63415c

- **Bounded record.** The shared issuance engine no longer writes a new
  snapshot when it resends a stage that is already attempted. A chain now
  holds at most one snapshot for each change of state: four for a person
  invitation, seven for an agent key, within the reader's limit of 16.
  This changes the page's custody the same way; its bundle is
  regenerated.
- **Boundary witness.** Twenty `--continue` runs with every answer lost
  leave one signed `invite-member` of `@rex`. A `--check` whose directory
  read is interrupted says nothing was read and keeps the original. A
  second `--check` verifies it without moving the membership's head, and
  there is one invitation of `@rex`. Control: with the engine change
  removed, the same story stops with "The retained invitation's private
  record is unavailable".
- **Modes.** `--check` with `--continue`, either with `--hours` or
  `--acts`, and `--keep` with `--acts` are refused with a usage message.
- Main `26d2bc8a` merged, including the publication-origin repair; the
  page bundle is regenerated from the merged source.

## Witnesses

`packages/cli/test/agent-key.scope.test.ts`, one scenario on real scopes
of the namespace `PLATFORM` over the Worker's routes with the real read
sessions, the Git host and the scheduler as stand-ins, as
`story.scope.test.ts` has them. Observed run: 1 test, about 0.7 s.

- A Counting cohort room (`platform:membership@5`, directory `@6`),
  founded by `install --cohort counting-commitments` and `create`. Two
  agent-key invitations, two separate agent configurations, each enrolled
  by `join`. For each: the link carries `platform:membership@5`; the
  retained enrol envelope settled through the scope gives a receipt whose
  definition is `platform:membership@5` and whose fact is the one the
  configuration keeps; the member is an active agent with the admin as
  controller; its key is active; its inbox is active; `acts membership`
  with the agent's own session lists the role's acts under
  `platform:membership@5` for `@botN (agent)`; `acts directory` lists
  `open-issue` as held. The two agents hold distinct keys and members, and
  no printed line holds a signing key or a link secret.
- An application cohort room (`platform:membership@4`, directory `@5`) in
  a second register, founded by `install --cohort application`; one agent
  enrolled the same way, with a `platform:membership@4` receipt.
- **Wrong pin.** A `@5` link relabelled to `@4` is admitted natively under
  `@5`, then fails receipt-pin verification. Its original enrolment stays
  retained unverified; the configuration takes up no repository or handle.
  `join --check` repeats that result without submitting another act. This
  does not undo the native enrolment or restore the consumed invitation.
- **Cross-room.** A Counting link addressed to the library's membership
  (repository, controller membership and both fact references retargeted,
  as the link's shape requires) is refused natively by the library
  membership, `guard-failed`; its head does not move; a retry reports the
  retained refusal without another act submission. The same with the pin left at `@5`
  is refused too; neither room's head moves.
- **Kept person invitation on membership@4.** In the application cohort
  room, the answer to the first `invite-member` is lost after the scope
  records it (a fetch stand-in). A new `--keep` invitation is then refused
  without a new invitation act. `dap invite --check` verifies the original without
  moving the membership's head; there is one invitation of `@pat`; the
  link names `platform:membership@4`; a fresh configuration joins with it.
  The next `--keep` invitation is verified.
- **Controller.** An issuance naming another member (`@bot1`) as the
  controller is refused before an invitation act is submitted. Read-session
  authentication may still sign and send. The Counting membership's head
  does not move.

The follow-up submission tripwire observes the act transport for these
zero-submit claims, independently of the retained head comparisons.
The `acts` outputs above are authenticated listings of held actions, not
execution of those actions. No independently signed post-enrolment role
act was run for every fresh configuration in this witness. The separately
recorded Counter take proves that Counter action for its own configuration;
it does not establish subsequent role use by all the configurations above.

Each issuance in the test runs on its own view of the admin's store, as
the page's connection custody gives one: the admin's configuration without
another issuance's pointer, the admin's key, and that issuance's private
snapshots. The CLI command line does not expose issuance; the page does.

## Limits

- The pin is checked at the receipt. A fresh key cannot read a membership
  before it enrols, so the native enrol of a relabelled link is admitted
  under the membership's own definition and the invitation is consumed;
  the configuration never takes it up. Only the link's holder can relabel
  a private link, and the issuer read the pin from the membership itself,
  so a mismatch is the holder's own doing. The test records the consumed
  enrol: `@bot4`'s member and key are active natively and no configuration
  holds them.
- The directory pairs are a table in the CLI; a new cohort needs a row.
- Not shown: enrolment through MCP's `join` tool, which calls the same
  function; and an agent's act on the commitments Counter after
  enrolment, which `notes/implementation/2026-10-13-counter-target100-cli-identities.md`
  records from the Counter session's route.
