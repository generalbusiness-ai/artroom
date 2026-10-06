# 022: Self-hosting with the jam, measured, on a smaller vocabulary

Date: 2026-10-06, 08:55 Eastern. Planner's record of hugh's decisions of
this morning, after two questions: whether the lanes' vocabulary (49 and
51 acts) invites procedural confusion, and whether the jam's development
still doubles as the test of self-hosting. It records three decisions and
commissions two design requests to builder, queued after the fourth I3
milestone. It changes no platform design by itself.

## 1. The jam stays the first self-hosted repository, decoupled in time

The jam room note's rule stands: the jam's work is tracked and reviewed
in an Artroom room once Artroom can host it. What changes is the clock.

- **Now.** Spikes J0 to J2 and the stage proceed in the jam repository
  on plain git, with the gitseq workroom for review, as today.
- **Self-hosting starts** when a destination publishes on a deployment:
  a repository founded whole on the platform scopes (the fourth
  milestone in tests; then a deployment and a real Git host). The jam's
  remaining work (the harness, the agent prompts, the stage) becomes its
  first hosted lanes.
- **Stop rule.** If self-hosting blocks jam work for more than one
  sprint, the jam returns to plain git and the block becomes a platform
  request in this workroom. The test stays honest without holding the
  demo to it.

Why: one builder; a demo with a date; nothing deployed yet; and every
platform gap would otherwise look like a jam fault until sorted.

## 2. Measurement from the first hosted act

Nothing on main measures how the declared acts are used. The deltas note
counts which acts the scenarios exercise; spike J1 times the act path.
That is not use. From the first hosted act, derive from the room's own
log, which replay already reads, and so at no cost to collect:

| Measure | From the log | What it tells |
|---|---|---|
| Acts used, by whom | Each entry's kind and signer, person or agent | Which of the vocabulary a team needs |
| Refusals by reason | Refused acts and their reasons, when the client records the answer | Which acts are misunderstood, and which rules bite |
| Retries before success | Same signer, same target, same kind, within a short window | Where the client or the description misleads |
| Intents never completed | Opened items with no settling entry after a sprint | Where the flow loses people |
| Breakdowns | A note per stall, as the workroom keeps for its own | What stopped work, and whether it was the platform or the jam |

Review after the first hosted sprint: remove any act nobody used, rename
any act whose refusals say it was misunderstood, and record both as a
lane forms revision.

## 3. A smaller vocabulary before self-hosting starts

Counts from `docs/lanes-reference.md` at main:

| Definition | Item types | Acts | `-own`/`-any` pairs | Shared commitment acts | Screen-state acts |
|---|---|---|---|---|---|
| `issue` | 12 | 49 | 10 | 12 | 2 |
| `change` | 14 | 51 | 26 | 12 | 2 |

The simplifications, none of which removes a function:

- **One verb, not two.** Each `-own`/`-any` pair becomes one act; "owner
  or grant holder" moves into the guard, and a grant may carry a
  qualifier (own or any) where an agent's grant must stay narrower. The
  guard records which case admitted the act, so the record and the
  refusals lose nothing. Removes 36 acts.
- **Verbs on nouns.** Where the target item's type disambiguates, the
  verb alone is the act: edit, redact, resolve on a comment, a thread or
  a proposal, with the target in the body.
- **A shared commitment fragment.** The twelve commitment acts (offer,
  accept, decline, withdraw, cancel, the three handover acts, take-hold,
  renew-hold, release-hold, authorize-export) are defined once and
  imported by both lanes by digest.
- **No screen state as acts.** Collapse and expand are client
  preferences. If "collapse for everyone" is wanted, it is one
  moderation act.
- **A demo profile.** Plan 019's story needs about 12 issue acts and 18
  change acts. Pin a small profile beside the full definitions and say
  in the demo that rules can add the rest.

The simplification lands before self-hosting starts, so the jam tests
the vocabulary we mean to keep. The practical mitigation is already on
main: the tool list and the page show only the acts the caller may do
now.

## Requests

- To builder: a lane forms revision carrying section 3, with the demo
  profile pinned, for independent review; the contract owner states the
  grant qualifier and the definition fragment as forms.
- To builder: the measurement plan of section 2 as a short note with the
  ledger's fields and the derivation from the log, and the stop rule of
  section 1 written into the jam room note's next revision.

Both are queued after the fourth I3 milestone and are not a sprint 6
gate.
