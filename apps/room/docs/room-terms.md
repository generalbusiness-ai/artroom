# The room's terms

These terms belong to dap-room, the application that keeps a repository's
work. The framework's own terms, such as scope, act, entry and
destination, are in [The ten terms](../../../docs/manual/ten-terms.md).

## Room

A **room** brings a repository's membership, rules, work and publication
together. It is a set of scopes: a directory, a membership scope, a rules
scope, a destination, and a lane for each issue and each change. The
`dap claim` command creates a room under a register.

## Member

A **member** is a person or an agent whose enrolled device keys may sign
the acts that their role allows. Membership is its own scope. A job name
such as "builder" is separate from the role that decides what a member
is allowed to do.

## Lane

A **lane** is a scope of the kind `lane`. Its pinned definition decides
what it holds. The room has two lane definitions, `issue` and `change`,
in [apps/room/lanes](../../../apps/room/lanes). [Lanes](lanes.md) describes
them.

## Issue

An **issue** lane holds a goal: its conditions, the commitments people
make to it, the holds they take, what they report, how the goal is
planned and split, its discussion, and whether it is open.

## Commitment

A **commitment** is a promise to do one piece of work. In the contract, a
`Commitment` names one exact operation that its issuer has promised to
complete ([scope.ts](../../../packages/contract/src/scope.ts)). In a
definition, a commitment is an item that moves from `offered` to
`accepted` to `fulfilled`. The room's issue definition declares that
item, with a requester, an offeree and a performer, and with other final
states for a commitment that is declined, withdrawn or cancelled.

## Hold

A **hold** is a time-limited claim, taken under one accepted commitment
by its performer. A hold item has a holder, a fixed reference `under` to
the commitment, an end time and an `epoch`. Only a `hold` effect opens,
renews or ends it. A timed rule ends it when its time passes, and it also
ends in the entry that takes its commitment to a final state. The
validator checks this shape, and the `hold@1` capability in
[hold.ts](../../../packages/derive/src/capability/hold.ts) derives the
records of a hold's workspace.

## Plan and concern

A **plan** is one way to split a goal into parts, and a **concern** is
one part of a plan. Both are items of the room's issue definition, in
[issue.ts](../lanes/src/issue.ts). A plan is `open` while
concerns are added, then `sealed` as the goal's current plan. Adding a
concern sends a `create` for a new lane under the same definition, and
the concern's state follows that request: `creating`, then `created`,
`refused` or `conflict`.

## Change

A **change** lane holds a proposed change to the repository. A change
has versions, and a version takes one of two forms. A one-file version,
which the page and the `edit` command open with `propose-file`, names the
path, the digest and the size of one file; the destination supplies the
integration commit and the tree when it reserves the publication. A
report version, which `propose-manifest` opens, names an exact selection
of reports with its integration commit and tree. Both forms are complete
versions. In the lane's definition the change itself is the item named
`proposal` and each version is a `manifest`. The change also holds its
reviews, check jobs, threads and links to issues.

## Review

A **review** is a verdict on one exact version of a change, for one part
of the repository. The destination judges whether the verdict counts: an
author's own approval does not count as an independent review.

## Check

A **check** records a checker's result for named inputs. The rules scope
says which checks a part of the repository needs.

## Land

To **land** a change is to have the destination publish it. The change
lane asks for that with its `merge` act. A `merge` act that takes effect records the request. The change reaches the final state `merged` only when the
destination's published outcome arrives. A merge that has taken effect, a local Git commit and a merged change are three different states.

## Words the room no longer uses

The earlier pages used three words that the page no longer shows. The
native item names in the definitions did not all change with them.

- **Proposal**, as the page said it, is now a version of a change; the
  definition keeps `proposal` as the name of the change item and calls a
  version a `manifest`. A newer version does not replace the evidence
  about an older one.
- **Policy** is now the rules scope, together with the definitions it
  activates. The earlier policy package is parked and is not run.
- **Attention queue** is now each member's inbox scope,
  `platform:inbox@1`, which holds the notices that acts direct to that
  member. A notice helps a member find work. It does not change what the
  member is allowed to do.

## Sources

Written against main `d309b6b9`. Sources:
[membership](../../../packages/platform/src/membership.ts),
[the inbox](../../../packages/platform/src/inbox.ts),
[the issue definition](../../../apps/room/lanes/src/issue.ts),
[the change definition](../../../apps/room/lanes/src/change.ts), and
[the command line's help](../../../packages/cli/src/line.ts). This page
claims no run.
