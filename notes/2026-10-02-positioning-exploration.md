# Positioning exploration: how to present Artroom

Date: 2026-10-02. Revision 2. Request `9c4d7b9b`, promise `0655d5da`. Exploration
instructions. This note is not a design and not a deliverable. It records
the position reached in discussion on 2026-10-02, states what is still
open, and says what the first checker round should bring back. Nothing in
it is adopted. No video, website or presentation work starts until a
positioning design note rests on the answers.

## 1. Why this note exists

Artroom will be presented in a demonstration video for the competition
(submission by 2026-10-13) and later in a website or presentation. Those
assets are expensive to change once made. Before any of them is built, the
positioning must be right: who the audience is, what the one claim is, what
picture carries it, and which worked examples show it.

The first checker round is asked for breadth, not depth. We want the space
of ways to present Artroom mapped, the working position tested against that
space, and the weakest parts of the position named, before anyone writes a
script or a landing page.

## 2. The working position

Each item below is a hypothesis. The round should treat each as something
to confirm, sharpen or reject, and say which.

**H1. The audience is developers first, then people who build and run
internet infrastructure.** Everyone else is reached through what those two
groups build. The video's judges are in both groups.

**H2. The story leads with the platform and specialises to software
development.** The platform is a place where applications run over a
shared record. Software development, with people and agents changing code
together, is its first worked example, chosen because the audience can
judge it from the inside. The alternative order, software first and
platform as a reveal, is the main contender and the round should weigh it.

**H3. The one-sentence claim.** The agent writes the application; the
platform guarantees the integrity of the record and the consistency of the
state computed from it, so what is decided stays decided and every party
builds on the same facts.

**H4. The guarantee is named with two words and their objects.** The
integrity of the record. The consistency of the state. These were chosen
over alternatives that need a distributed-systems background to land. The
mechanism behind them, one sequencer per room judging each act against the
rules in force and recording it permanently, is how the guarantee is
delivered, not what is promised. The words "ordering" and "admission" are
not used in presentation material. "Takes effect" and "effective" are the
plain-English terms for the moment a proposal becomes a fact, and they are
already the codebase's own.

**H5. The developer-experience argument.** Agents make code cheap, so the
pitch cannot be "write less code." The cost has moved to being sure: who
may act, what counts, and what the state is now. Evidence from the dap
authoring spike (its notes of 2026-09-18) shows an agent could not author a
multi-party model within two repairs, and every repair concerned who could
read what, and therefore who could judge what, never the business rule.
The platform's job is to own those questions so the application does not
have to. A refusal is a value with a fix, so an agent corrects itself. A
judgement records its inputs, so a person can replay it.

**H6. The rulebook, the record and the board.** Every room has three parts:
a rulebook the room owns, a record of signed acts, and a board that every
party computes from the acts that took effect. An act takes effect only if
the rulebook says so, given everything that took effect before it. Change
the rulebook and you have a different application on the same platform.
The software lifecycle is one rulebook: opening an issue is a claim,
pushing a branch is a proposal, approving is a verdict bound to one head,
checks are obligations, a merge queue is the single publication slot, and
a force push never takes effect. A game or a simple business process is
another rulebook with the same shape: a valid move, or "you cannot borrow
the same tool twice." A chess application already runs on the gitseq host
with exactly this shape, recording an illegal move in the history with a
refusal reason and no effect on the game. This is the bridge that lets the
platform story and the software story click into one picture.

**H7. Three worked rooms, light to heavy.** The jam room (artroom-jam):
lightweight rules, time, and nothing to do with code. A rollout room: a
short, legible rulebook that drives something real outside the room, such
as moving a Worker's traffic between versions, with checks, sign-offs and
a freeze window as obligations and refusals. The code room: the full
software lifecycle. The rollout room is proposed as the middle example
because its rules are ones every developer has been burned by, and because
the Cloudflare platform already has versions and gradual deployments for
the room to drive rather than reimplement. Its rulebook should be drafted
as an appendix to the positioning design note. It is built before the
competition submission only if time permits.

**H8. The image.** A paving machine that lays bricks in the road just ahead
of itself. The road is the record; a brick is an act that took effect; the
machine lays the next step on what is already laid and never pulls a brick
up. In a line: the platform lays the bricks ahead of you, and every brick
stays laid.

## 3. What the position deliberately leaves out

- **Visibility.** Per-fact audiences, who may see what, are a direction in
  dap's design notes and not a property of Artroom today. They are not
  part of the guarantee and must not appear in it.
- **Comparisons.** Presentation material makes no comparison statements.
  The only other product named is GitHub, because the audience lives in it,
  and only as a nod to the shared vocabulary of issues, branches, pull
  requests and merge queues. The competition's content limits require any
  comparison to be factual and qualified; the simplest way to meet that is
  to make none.
- **Product names.** No other products, tools or companies are named, in
  this note or in the assets. Cloudflare and its platform parts, Workers,
  Durable Objects, Artifacts, Workflows and the rest, are not "other
  products": they are what Artroom runs on, and they are named freely.

## 4. Questions for the first round

Answer each with breadth: name the alternatives considered, say which
survive and why, and name the strongest objection to the working position.
Draw on the repository's notes, the plan (`notes/2026-10-01-artroom-plan.md`),
the protocol, the jam-room note, dap's design and authoring notes, the
spike reports, and your own research. Separate sourced facts from
judgement.

**Audience and order**

- Q1. For a developer audience in 2026, does platform-first (H2) land
  faster than software-first? What does each order cost in the first
  sixty seconds of a video? Give both openings in one paragraph each.
- Q2. What does the infrastructure audience need to hear that the
  developer audience does not? Is it one paragraph in the same story, or
  a second track?

**The claim and its words**

- Q3. Test H3 against at least five rewordings. Which survives being said
  aloud, read on a slide, and read by someone who has never seen a
  sequencer?
- Q4. Test H4. Are "integrity" and "consistency" the right words for both
  audiences? List the alternatives considered and the reason each lost.
  Note where either word carries a meaning we do not want.
- Q5. What is the plain-English gloss for the pivot from a stream of
  proposals to facts an application can put logic behind? Give three
  candidates.

**The picture**

- Q6. Does H6 hold for every act and rule in the protocol, or only for the
  seven acts? List any part of the software lifecycle that does not map
  cleanly onto a rulebook over a record, and say what that does to the
  claim.
- Q7. Is H6 better shown as a table, a diagram, or a single sentence
  repeated across the three rooms? Sketch each in words.
- Q8. Does the paving image (H8) survive contact with the three rooms? Say
  where it strains. Offer one alternative image.

**The worked rooms**

- Q9. Is the rollout room the right middle example (H7)? Consider at least
  three alternatives, including production access requests and a simple
  case-management room, and rank them on: legibility of the rulebook to a
  developer, visible effect outside the room, fit with the Cloudflare
  platform, and build cost after the submission.
- Q10. For the chosen middle room, list the rules in plain English, at most
  twelve lines, and map each to an existing act or policy rule. Name any
  rule the protocol cannot express today.
- Q11. What does each of the three rooms prove that the other two do not?
  If one proves nothing the others do not, say so.

**Developer experience evidence**

- Q12. What in the codebase and the spike reports can be shown, not
  claimed, for H5? List each piece of evidence with where it lives and
  what it demonstrates.
- Q13. What would a developer see in the first five minutes that makes H5
  true for them? Use the plan's section 12 as the starting point and say
  what is missing.

**The assets**

- Q14. Given a 5 to 10 minute video and the scoring weights in the plan's
  section 1, how much time does each part of the story deserve? Give a
  rough cut in minutes, with the code room as the demonstration.
- Q15. What must be true before the website or presentation can be
  outlined? Name the decisions that depend on this round.

## 5. What the round must return

A single note, `notes/2026-10-02-positioning-exploration-round-1.md`, with:

- an answer to every question in section 4, in order, with alternatives
  named and the reason each was kept or dropped;
- a verdict on each hypothesis H1 to H8: confirmed, sharpened (with the
  sharpened wording), or rejected (with the reason);
- the three weakest parts of the working position, ranked;
- a list of sourced facts used, separate from judgement;
- a list of what the round could not settle and why.

Breadth is judged by the alternatives considered, not by the length of the
answers. An answer that confirms the working position without naming what
else was considered is incomplete. The round writes no script, no copy and
no slide text.

## 6. Constraints on the round and on everything after it

- Plain conversational English, written for readability by a technical
  audience.
- No comparison statements. No product names other than GitHub, and that
  only as a nod to shared vocabulary.
- No visibility claims in the guarantee.
- The competition's content limits apply to anything that may reach the
  assets: original work only, nothing copyrighted, nothing that reads as
  an attack on any person or product.
- "Takes effect" and "effective" for the moment a proposal becomes a fact.
  Not "admission" and not "ordering" in anything the audience reads.

## 7. What follows

After the round is reviewed, a positioning design note adopts the
sharpened position and the chosen middle room, with the rollout rulebook
as an appendix. The video script rests on that note. The website and
presentation outline rest on it too, after the submission.

## 8. Bases

- `notes/2026-10-01-artroom-plan.md`, sections 1, 3, 4, 5 and 12.
- `docs/protocol.md`, sections 1 and 4 to 13.
- The jam-room note, `notes/2026-10-01-jam-room.md`, on the branch
  `request/jam-room-note`.
- dap, `notes/2026-09-20-direction-and-next-steps.md` and
  `notes/2026-09-18-authoring-language-directions.md`, for the
  authoring-spike evidence behind H5.
- The gitseq chess application, for the worked instance behind H6.
- Discussion with Hugh on 2026-10-02, which produced H1 to H8.
