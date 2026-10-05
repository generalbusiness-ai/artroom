# Plan 019: the demo story, as a GitHub user knows it

Date: 2026-10-05. Hugh's direction, recorded by the planner from the
discussion after the 15:00 sprint report. Workroom acts `c2b574dc`,
`d5ee570d` and this note. To be factored into the final designs: the
lane forms successor (request `fdc3d7e2`), the demo contract's
follow-through, and the proof plan's acceptance stories (plan 016). The
rework is not needed until after I3 lands.

## The surface

The demo tells its story the way a GitHub user knows it. A user opens an
issue. Other people comment on it. It may be assigned or self-assigned,
optionally. A developer opens a pull request that says it closes the
issue. Comments appear on the issue or the pull request and reference
each other. The merge closes the issue. Labels, issue types, fields,
projects and milestones are out of scope for now.

Our lane model is more flexible in some ways and more constrained in
others. The demo aligns towards that surface, and the vocabulary of the
model (terms, offers, holds, obligations) appears only where a rule or a
participant uses it.

## Decided defaults

1. Assignment or self-assignment is optional and never required to merge.
   A repository's rules may require it.
2. Any member of the membership scope may comment on an issue or a pull
   request. Commenters from outside membership are a later identity
   question.
3. A pull request that says it closes an issue auto-closes it on merge,
   with the link recorded as a fact of the lane. The issue opener's
   acceptance of the closure is available as a rule, not a default.

At each point where one of these appears, the script says that the
repository's rules are customizable for exactly this sort of thing.

## The wedge: what the demo shows that a tracker or a forge cannot

The audience is a team about to let agents work on real repositories.
The demo opens on the familiar surface, so the cost of understanding is
near zero, and then shows:

- **Splitting and recombining.** An issue splits into concern lanes taken
  by different people or agents; each returns a mergeable change; they
  recombine into one pull request with the history intact. This is the
  object that fills the gap between an issue and a pull request, and it
  must be part of the story, told as an incremental improvement over the
  current process.
- **An agent under a narrow grant.** An agent takes one split, works under
  a visible grant for specific acts over specific extents, and is refused
  when it steps outside it. The refusal is shown, with its reason.
- **Rules that compose.** A mixed change is held until each touched
  extent's reviewer acts; a rules change needs the rules scope's
  controller; an infrastructure landing is an effect with its recovery.
  Plan 016 is the acceptance story.
- **Every step tracked.** The history replays with the rule version that
  admitted each act, so what happened can be checked afterwards without
  trusting anyone's database.

## How it is told

- Flows are described in GitHub terms first; the model's names come
  second, where they add something.
- Public material names no other product and makes no comparisons; the
  demo script says "trackers and forges" or nothing.
- The story leads with the agent and the refusal, not with vocabulary.
- Sprint reports follow the same order from now on.

## Who factors it in

| Where | What |
|---|---|
| Lane forms successor (`fdc3d7e2`) | Optional assignment; generic comments; closes link as a lane fact with auto-close on merge; per-extent obligations read by the change lane |
| Demo contract follow-through | The fifteen-step run retold on the GitHub surface, with the split and recombination as the visible middle act and the agent's refusal shown |
| Proof plan (plan 016 and successors) | Acceptance stories for the three defaults as rules, the extents, and the agent refusal |
| Authority note | The grant an agent works under, and what its refusal records |
