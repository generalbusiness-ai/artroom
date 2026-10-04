# A person's journey on the deployed spike

Request 6eda77c8. This is an observed run, made on 2026-10-04 between 16:36 and
16:41 Eastern (20:36 to 20:41 UTC) in the kept room `sprint-journey`
(`room_8c39751cac7e49aa97960128bf5b69f2`) on the spike at
<https://artroom-spike-room.inguz.workers.dev>. The spike runs main at
`b6a9c0b6` (Room version `a75ebd24-f2f7-4d09-a992-acd716afc421`). The CLI is the
one installed from the packed `0.1.0-dev.1` tarballs for the sprint 1 run
([2026-10-04-23-spike-journey.md](2026-10-04-23-spike-journey.md)), in the same
run directory. Nothing here is reconstructed: every command block is copied from
the run's recorder, which wrote each command, the time, the output and the exit
code as it happened.

Three people take part, each with their own key and their own configuration
directory: Ana (a member), Ben (a maintainer) and the founder (the admin). They
are seats driven by one operator at one terminal, not three human beings.

## What the run shows

| # | Step | Result |
|---|---|---|
| 1 | Two people join with `artroom login` | `@ana` (member) and `@ben` (maintainer) |
| 2 | Ana claims paths, pushes to the lane remote with git, and proposes | lane `act_26_b4d699dc`; the push worked |
| 3 | Notes between two people, seen in `artroom attention` | Ben's line note and Ana's reply |
| 4 | The first change lands | landed with no review, because the policy asked for none; Ben's review was refused and recorded |
| 5 | A policy change that makes Ben the owner of the documentation | landing refused while the admin approval was open; landed after the founder approved |
| 6 | Ana's follow-up needs Ben's review | Ben approved, the obligation was met, the change landed |
| 7 | `artroom explain` for a refusal and for a review | the reason and the authority are given |
| 8 | The declared act `shout` from a person's seat | recorded as `act_55_d60d97c2`, signed by Ben's key |
| 9 | The published log verifies | verified through entry 56; exit 0; 9 policy decisions replayed |

## What to know before reading

- **A review must meet an obligation.** Under the policy first landed in this
  room, a change to the documentation needed no review, and the room refused a
  review that met nothing. The run therefore added an owner rule. This is the
  room working as specified, but a person who expects to "just approve" a
  change will be surprised by the refusal.
- **One gap in the attention queue.** Ben was not told that his review was
  wanted for the owner obligation (step 7). The founder was told for the admin
  approval (step 6). This is worth a look before a person's demonstration.
- **Setup still needs a helper.** Invitations and the policy file were written
  by the helper script, because the CLI has no command for them.
- **Verification needed the operator's credential**, as in the sprint 1 run.
- **No new room.** The run used the kept room. It added two members, three
  lanes (all released) and three landings to it.
- **No secrets are in this note**, and there are no screenshots: the run was
  all in a terminal.

## The run

### 1. Two people join

The founder, who is the room's admin, writes two invitations with the helper script (the CLI has no invitation command). Ana joins as a member and Ben as a maintainer, each with `artroom login`. Each gets a key kept on their own machine. Each invitation link holds a secret, so the command reads it from a private file.

Observed run, 2026-10-04 16:36:01 EDT:

```text
$ node journey.mjs invite-person @ana member
{
 "step": "invite @ana",
 "ok": true,
 "invitation": "act_22_13845836",
 "custody": "client",
 "role": "member",
 "expiresAt": "2026-10-05T20:36:02.074Z",
 "link": "written to secrets/ana-link.txt"
}
[exit 0]
```

Observed run, 2026-10-04 16:36:02 EDT:

```text
$ node journey.mjs invite-person @ben maintainer
{
 "step": "invite @ben",
 "ok": true,
 "invitation": "act_23_52c73fab",
 "custody": "client",
 "role": "maintainer",
 "expiresAt": "2026-10-05T20:36:02.894Z",
 "link": "written to secrets/ben-link.txt"
}
[exit 0]
```

Observed run, 2026-10-04 16:36:03 EDT:

```text
$ ARTROOM_HOME=$PWD/ana-home npx artroom login "$(cat secrets/ana-link.txt)"
Joined sprint-journey as @ana (member).
Your key key_dm7p3-umVnSmVgcyRbnZCCmNyZFDQGij9dXTTw4ZQN8 is in <run>/ana-home/keys/room_8c39751cac7e49aa97960128bf5b69f2.json, readable only by you.
Next: artroom claim <paths> --goal "<what you will do>"
[exit 0]
```

Observed run, 2026-10-04 16:36:04 EDT:

```text
$ ARTROOM_HOME=$PWD/ben-home npx artroom login "$(cat secrets/ben-link.txt)"
Joined sprint-journey as @ben (maintainer).
Your key key_GftgwdSSRlmzvUjnVyjUnMaz_vkgpfIKeo7XDjzi2Hg is in <run>/ben-home/keys/room_8c39751cac7e49aa97960128bf5b69f2.json, readable only by you.
Next: artroom claim <paths> --goal "<what you will do>"
[exit 0]
```

### 2. Ana claims paths, gets a workspace and pushes

Ana claims `README.md` and `docs/**` before changing them. `artroom workspace` sets up a git remote for her lane. She fetches the room's main, commits two files and pushes with plain git. The push worked; nothing else was needed. Then she proposes the pushed commit.

Observed run, 2026-10-04 16:36:10 EDT:

```text
$ git init -q -b main ana-repo && cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom claim 'README.md' 'docs/**' --goal 'Say what this room is for' --plan 'A short README and a first page under docs.'
Claimed lane act_26_b4d699dc, lease 1, until 2026-10-04T21:06:11.649Z.
Scope: README.md docs/**
Next: artroom workspace
[exit 0]
```

Observed run, 2026-10-04 16:36:11 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom workspace
Workspace ready for lane act_26_b4d699dc, lease 1.
Git remote "artroom": https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1--act_26_b4d699dc.git
Git can push there until 2026-10-04T21:06:06.449Z. The token is in <run>/ana-repo/.git/artroom/credentials, readable only by you, and is not shown.
Next: git push artroom HEAD, then artroom propose -m "<what changed and why>"
[exit 0]
```

Observed run, 2026-10-04 16:36:15 EDT:

```text
$ cd ana-repo && git fetch -q artroom 2>&1 | sed -E 's#https://[^ ]+#<lane remote>#'; git checkout -q -B main artroom/main && git log --oneline | cat && git ls-files
b5bb9ca Declare the room's acts: the code review policy and a declared act, shout
69a6b12 Artroom: the first commit on main, with no files (public founding)
.artroom/policy.json
[exit 0]
```

Observed run, 2026-10-04 16:36:22 EDT:

```text
$ cd ana-repo && mkdir -p docs && printf '# sprint-journey\n\nA small room kept on the spike for sprint reports.\n' > README.md && printf '# How this room is used\n\nPeople and agents join by invitation, claim paths, propose changes and land them after review.\n' > docs/using.md && git add -A && git -c user.name=Ana -c user.email=ana@example.invalid commit -q -m 'Add a README and a first page under docs' && git log --oneline -1 | cat && git push artroom HEAD 2>&1 | sed -E 's#https://[^ ]+#<lane remote>#'
e3a410c Add a README and a first page under docs
To <lane remote>
   b5bb9ca..e3a410c  HEAD -> main
[exit 0]
```

Observed run, 2026-10-04 16:36:23 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom propose -m 'Adds a README and docs/using.md, which say what this room is for.'
Proposed generation 1 of lane act_26_b4d699dc: e3a410cdc986.
It needs no reviews or checks.
Preview: pending.
Next: artroom land --wait
[exit 0]
```

### 3. Ben leaves a note; Ana sees it and replies

Ben's queue is empty at first. He leaves a note on line 3 of the README in Ana's proposal. Ana's queue then shows the note, and she replies.

Observed run, 2026-10-04 16:36:33 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom attention
Nothing needs you.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6LTEsInAiOjB9
[exit 0]
```

Observed run, 2026-10-04 16:36:34 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom note 'act_26_b4d699dc#1:README.md:3' -m 'Could this line also say who keeps the room? Not blocking.'
Noted act_28_316c137e.
[exit 0]
```

Observed run, 2026-10-04 16:36:35 EDT:

```text
$ ARTROOM_HOME=<run>/ana-home npx artroom attention
2 items need you:
  lane-unheld        act_4_c26077e1     act_4_c26077e1 was released.
  note               act_28_316c137e    New note on act_26_b4d699dc.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MjgsInAiOjR9
[exit 0]
```

Observed run, 2026-10-04 16:36:41 EDT:

```text
$ ARTROOM_HOME=<run>/ana-home npx artroom note act_28_316c137e -m 'Good point. I will add that in a follow-up; this change only says what the room is for.' --reply-to act_28_316c137e
Noted act_29_200c0472.
[exit 0]
```

### 4. A finding: this change needed no review, so the room refused Ben's review

The proposal said "It needs no reviews or checks": the room's policy then named no owner for these paths. Ben's approval was refused, because a review must meet an obligation and there was none. The refusal is recorded in the log, and `artroom explain` gives the reason. Ana's landing went through without a review. Both then read their queues: Ben sees Ana's reply and Ana sees the landing outcome. So the first change shows claim, push, propose, notes and landing, but not a review that gates a landing. Steps 5 to 7 add an owner rule and show one.

Observed run, 2026-10-04 16:36:42 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom review 'act_26_b4d699dc#1' --approve --scope 'README.md' 'docs/**' -m 'Reads well. Approved as it stands.'
Refused: not-authorized-reviewer
  Reason: @ben qualifies for no review obligation on this generation.
  Fix: Ask a qualifying reviewer.
  Recorded as act_30_8841edc6. For the details: artroom explain act_30_8841edc6
[exit 3]
```

Observed run, 2026-10-04 16:36:43 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom land --wait --timeout 120
Landing op_land_31, generation 1: e3a410cdc986.
Landed: e3a410cdc986 (reserved at seq 33).
Next: artroom release, or artroom renew to keep working on the lane.
[exit 0]
```

Observed run, 2026-10-04 16:36:51 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom attention
1 item needs you:
  note               act_29_200c0472    A reply to your note.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MjksInAiOjV9
[exit 0]
```

Observed run, 2026-10-04 16:36:52 EDT:

```text
$ ARTROOM_HOME=<run>/ana-home npx artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MjgsInAiOjR9
1 item needs you:
  land-outcome       op_land_31         Landing op_land_31 is landed.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MzQsInAiOjZ9
[exit 0]
```

Observed run, 2026-10-04 16:37:29 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom explain act_30_8841edc6
act_30_8841edc6: review (Review), refused, published.
Meaning: review as declared in policy version act_11_ae7ecc48, binding sha256:f65d93317414d20d1a0a6a10ca9d40ab16cefdc32f66f335ef20e17688c3fcad.
Refused by not-authorized-reviewer: @ben qualifies for no review obligation on this generation. Fix: Ask a qualifying reviewer.
Authority: member, @ben (maintainer).
Held: R-ADM-3: authority by case member
Failed: R-OBL-2: @ben qualifies for no review obligation on this generation.
[exit 0]
```

### 5. Ana proposes a policy change; the landing waits for an admin

Ana releases her first lane. She then proposes a change to `.artroom/policy.json`: Ben owns `README.md` and `docs/**`, and a change there needs one review from an owner. The helper writes the file (appendix A). A policy change needs an admin's approval. Ana tries to land before it is given, and the room refuses with the reason.

Observed run, 2026-10-04 16:37:30 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom release -m 'Landed. Ben asked who keeps the room; that goes in a follow-up.'
Released lane act_26_b4d699dc, with a handover note.
Removed the workspace credential for lane act_26_b4d699dc, lease 1, from <run>/ana-repo/.git/artroom/credentials.
[exit 0]
```

Observed run, 2026-10-04 16:37:31 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom claim '.artroom/**' --goal 'Make Ben the owner of the documentation, so changes to it need his review'
Claimed lane act_37_d8cbbc24, lease 1, until 2026-10-04T21:07:32.130Z.
Scope: .artroom/**
Next: artroom workspace
[exit 0]
```

Observed run, 2026-10-04 16:37:32 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom workspace
Workspace ready for lane act_37_d8cbbc24, lease 1.
Git remote "artroom": https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1--act_37_d8cbbc24.git
Git can push there until 2026-10-04T21:07:26.588Z. The token is in <run>/ana-repo/.git/artroom/credentials, readable only by you, and is not shown.
Next: git push artroom HEAD, then artroom propose -m "<what changed and why>"
[exit 0]
```

Observed run, 2026-10-04 16:37:35 EDT:

```text
$ cd ana-repo && git fetch -q artroom && git checkout -q -B main artroom/main && git log --oneline -3 | cat && node ../journey.mjs policy-owners .artroom/policy.json > /tmp/claude-policy.$$ && mv /tmp/claude-policy.$$ .artroom/policy.json && git diff --stat | cat && git -c user.name=Ana -c user.email=ana@example.invalid commit -q -am 'Policy: Ben owns README.md and docs; changes there need the owner review' && git push artroom HEAD 2>&1 | sed -E 's#https://[^ ]+#<lane remote>#' | tail -2
e3a410c Add a README and a first page under docs
b5bb9ca Declare the room's acts: the code review policy and a declared act, shout
69a6b12 Artroom: the first commit on main, with no files (public founding)
 .artroom/policy.json | 25 ++++++++++++++++++++++++-
 1 file changed, 24 insertions(+), 1 deletion(-)
To <lane remote>
   e3a410c..8d7b31f  HEAD -> main
[exit 0]
```

Observed run, 2026-10-04 16:37:36 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom propose -m 'Policy: @ben owns README.md and docs/**, and a change there needs one review from an owner.'
Proposed generation 1 of lane act_37_d8cbbc24: 8d7b31fb493e.
It needs:
  open  obl_admin-approval: review by role:admin
Preview: pending.
Next: artroom attention, then artroom land --wait when everything is met.
[exit 0]
```

Observed run, 2026-10-04 16:37:48 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom land --wait --timeout 60
Refused: obligation-open
  Reason: The obligation obl_admin-approval is open.
  Fix: Meet it, then land.
  Recorded as act_39_08c1a286. For the details: artroom explain act_39_08c1a286
[exit 3]
```

### 6. The founder reviews, and the policy change lands

The founder's queue shows the review request. The founder approves, the obligation is met, and Ana lands. This is a second person's review that decides whether a change lands.

Observed run, 2026-10-04 16:37:49 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom attention
2 items need you:
  land-outcome       op_land_7          Landing op_land_7 is landed.
  review-requested   act_37_d8cbbc24#1  Review act_37_d8cbbc24 generation 1 for obl_admin-approval.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MzgsInAiOjh9
[exit 0]
```

Observed run, 2026-10-04 16:37:50 EDT:

```text
$ ARTROOM_HOME=<run>/founder-home npx artroom review 'act_37_d8cbbc24#1' --approve --scope '.artroom/**' -m 'Agreed: Ben owns the documentation.'
Approved act_37_d8cbbc24#1 at 8d7b31fb493e.
Met obl_admin-approval.
[exit 0]
```

Observed run, 2026-10-04 16:37:51 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom land --wait --timeout 120
Landing op_land_41, generation 1: 8d7b31fb493e.
Landed: 8d7b31fb493e (reserved at seq 43).
Next: artroom release, or artroom renew to keep working on the lane.
[exit 0]
```

Observed run, 2026-10-04 16:37:59 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom release -m 'Landed: the owner rule is active.'
Released lane act_37_d8cbbc24, with a handover note.
Removed the workspace credential for lane act_37_d8cbbc24, lease 1, from <run>/ana-repo/.git/artroom/credentials.
[exit 0]
```

### 7. Ana's follow-up now needs Ben's review; Ben approves and it lands

Ana answers Ben's note with a one-line change to the README. Under the new policy version the proposal lists an open obligation: a review by the owners. Ben approves, the obligation is met, and the change lands. One thing to note: Ben's queue did not show a review request for this owner obligation, with or without a cursor, although the founder's queue did show one for the admin approval in step 6. Ben reviewed because Ana's proposal named the obligation, not because his queue told him.

Observed run, 2026-10-04 16:38:07 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom claim 'README.md' --goal 'Say who keeps the room, as Ben asked' --because act_28_316c137e
Claimed lane act_47_d0d3f7f9, lease 1, until 2026-10-04T21:08:07.517Z.
Scope: README.md
Next: artroom workspace
[exit 0]
```

Observed run, 2026-10-04 16:38:07 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom workspace
Workspace ready for lane act_47_d0d3f7f9, lease 1.
Git remote "artroom": https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1--act_47_d0d3f7f9.git
Git can push there until 2026-10-04T21:08:02.089Z. The token is in <run>/ana-repo/.git/artroom/credentials, readable only by you, and is not shown.
Next: git push artroom HEAD, then artroom propose -m "<what changed and why>"
[exit 0]
```

Observed run, 2026-10-04 16:38:11 EDT:

```text
$ cd ana-repo && git fetch -q artroom && git checkout -q -B main artroom/main && printf '\nThe room is kept by its founder. Ben owns the documentation.\n' >> README.md && git -c user.name=Ana -c user.email=ana@example.invalid commit -q -am 'README: say who keeps the room' && git push artroom HEAD 2>&1 | sed -E 's#https://[^ ]+#<lane remote>#' | tail -2
To <lane remote>
   8d7b31f..ad268c5  HEAD -> main
[exit 0]
```

Observed run, 2026-10-04 16:38:12 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom propose -m 'README now says who keeps the room, answering the note act_28_316c137e.'
Proposed generation 1 of lane act_47_d0d3f7f9: ad268c533940.
It needs:
  open  obl_docs-owner-review: review by owners
Preview: pending.
Next: artroom attention, then artroom land --wait when everything is met.
[exit 0]
```

Observed run, 2026-10-04 16:38:30 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MjksInAiOjV9
Nothing needs you.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6LTEsInAiOjV9
[exit 0]
```

Observed run, 2026-10-04 16:38:37 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom attention
1 item needs you:
  note               act_29_200c0472    A reply to your note.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MjksInAiOjV9
[exit 0]
```

Observed run, 2026-10-04 16:38:38 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom review 'act_47_d0d3f7f9#1' --approve --scope 'README.md' -m 'That answers my note. Approved.'
Approved act_47_d0d3f7f9#1 at ad268c533940.
Met obl_docs-owner-review.
[exit 0]
```

Observed run, 2026-10-04 16:38:38 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom land --wait --timeout 120
Landing op_land_50, generation 1: ad268c533940.
Landed: ad268c533940 (reserved at seq 53).
Next: artroom release, or artroom renew to keep working on the lane.
[exit 0]
```

Observed run, 2026-10-04 16:39:00 EDT:

```text
$ ARTROOM_HOME=<run>/ana-home npx artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6MzQsInAiOjZ9
4 items need you:
  lane-unheld        act_26_b4d699dc    act_26_b4d699dc was released.
  land-outcome       op_land_41         Landing op_land_41 is landed.
  lane-unheld        act_37_d8cbbc24    act_37_d8cbbc24 was released.
  land-outcome       op_land_50         Landing op_land_50 is landed.
Later, for only new items: artroom attention --cursor c1.eyJrIjoiYXR0ZW50aW9uIiwibiI6NTQsInAiOjEyfQ
[exit 0]
```

### 8. Why things happened: explain and the log

Ana asks why her early landing in step 5 was refused. The log shows the follow-up's claim, proposal, review and landing.

Observed run, 2026-10-04 16:39:05 EDT:

```text
$ ARTROOM_HOME=<run>/ana-home npx artroom explain act_39_08c1a286
act_39_08c1a286: land (Land), refused, published.
Meaning: land as declared in policy version act_11_ae7ecc48, binding sha256:fb386c4b767b17a9fc0e3bb5cfa655617a7af7a824d74800b4d3216c7cd83543.
Refused by obligation-open: The obligation obl_admin-approval is open. Fix: Meet it, then land.
Authority: member, @ana (member).
Held: R-ADM-3: authority by case member
Failed: R-LAND-1: The obligation obl_admin-approval is open.
[exit 0]
```

Observed run, 2026-10-04 16:39:06 EDT:

```text
$ ARTROOM_HOME=<run>/ana-home npx artroom log --after 46 --limit 12
   47  act_47_d0d3f7f9  2026-10-04T20:38:07.517Z  claim (Claim) by @ana
   48  act_48_c523570f  2026-10-04T20:38:30.613Z  propose (Propose) by @ana
   49  act_49_e8eb9a12  2026-10-04T20:38:38.626Z  review (Review) by @ben
   50  act_50_ef3297e7  2026-10-04T20:38:39.388Z  land (Land) by @ana
   51  act_51_02c44763  2026-10-04T20:38:53.701Z  system checkpoint
   52  act_52_4a21263b  2026-10-04T20:38:57.215Z  system land-evaluated
   53  act_53_2b273c54  2026-10-04T20:38:57.260Z  system land-reserved
   54  act_54_1540ccb4  2026-10-04T20:39:00.165Z  system land-outcome
Head 54, published through 48.
[exit 0]
```

### 9. Ben does the declared act `shout` from a person's seat

`shout` is the act this room declared for itself in sprint 1. Ben reads its meaning and binding, then does it on the landing outcome. He signs with his own key, like any other act of his. `artroom explain` then shows the authority behind his review in step 7.

Observed run, 2026-10-04 16:39:06 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom acts shout
shout: Shout
  Who may sign it: admin, maintainer, member, agent.
  On target entry (--entry ACT): comment
    replyTo: an entry ID, optional (the comment step's)
    text: text, up to 2048 bytes
  Binding: sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14
  Policy version: act_45_5ec69314
To do it: artroom act shout --binding sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14 [target] --set FIELD=VALUE …
[exit 0]
```

Observed run, 2026-10-04 16:39:14 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom act shout --binding sha256:5a66eeb3e96b72726d47014b180d6b2f1a4acbd767facfa30a698b4c38099e14 --entry act_54_1540ccb4 --set text='Landed. Thanks, Ana.'
Done: Shout (shout), recorded as act_55_d60d97c2.
[exit 0]
```

Observed run, 2026-10-04 16:39:15 EDT:

```text
$ ARTROOM_HOME=<run>/ben-home npx artroom explain act_49_e8eb9a12
act_49_e8eb9a12: review (Review), accepted, not yet published.
Meaning: review as declared in policy version act_45_5ec69314, binding sha256:f65d93317414d20d1a0a6a10ca9d40ab16cefdc32f66f335ef20e17688c3fcad.
Authority: member, @ben (maintainer).
Held: R-ADM-3: authority by case member
[exit 0]
```

### 10. Ana releases; the published log verifies

Ana releases the lane. About a minute later the room has published its log through entry 56. The released verifier checks it, with the same five-minute operator read token as in the sprint 1 run, revoked afterwards. The recorded command drops npm's update notice and cuts each output line at 400 characters, so three long "Cannot prove" lines end early here; the sprint 1 note quotes them in full.

Observed run, 2026-10-04 16:39:16 EDT:

```text
$ cd ana-repo && ARTROOM_HOME=<run>/ana-home npx artroom release -m 'Landed with the owner review. Nothing left.'
Released lane act_47_d0d3f7f9, with a handover note.
Removed the workspace credential for lane act_47_d0d3f7f9, lease 1, from <run>/ana-repo/.git/artroom/credentials.
[exit 0]
```

Observed run, 2026-10-04 16:40:10 EDT:

```text
$ ARTROOM_HOME=$PWD/ana-home npx artroom log --after 53 --limit 8
   54  act_54_1540ccb4  2026-10-04T20:39:00.165Z  system land-outcome
   55  act_55_d60d97c2  2026-10-04T20:39:15.596Z  shout (Shout) by @ben
   56  act_56_899ebb30  2026-10-04T20:39:17.148Z  release (Release) by @ana
   57  act_57_9d9fe9e8  2026-10-04T20:39:55.211Z  system checkpoint
Head 57, published through 56.
[exit 0]
```

Observed run, 2026-10-04 16:40:11 EDT:

```text
$ node verify.mjs 0756f42f8962abac079792108d362d23-1 2>&1 | grep -v '^npm notice' | cut -c1-400
{
 "step": "repository",
 "name": "0756f42f8962abac079792108d362d23-1",
 "remote": "https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1.git"
}
{"step":"read token","id":"jmmq4076igb4ancx","scope":"read","ttl":300}
$ npx artroom-verify https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/0756f42f8962abac079792108d362d23-1.git
Verified. Every check this run makes passed; what it cannot prove is listed below.
Mode: full.
Room: room_8c39751cac7e49aa97960128bf5b69f2
Log commit: 9eb683d413f5065f86a01bea0c96bf428121aa35 (5 commits)
Published through entry 56; verified through entry 56 (act_56_899ebb30).
Policy decisions replayed: 9.
Carry accounting: partial.
Cannot prove: Whether any act was admitted after the last published entry: unpublished acts cannot be proven to exist or not to exist.
Cannot prove: Lanes, leases, obligations and landings (R-LOG-15): verify checks each act's authority and replays every policy decision, but does not re-derive lane, lease, obligation or landing transitions, or the effects in receipts.
Cannot prove: The room clock: expiry checks use each entry's recorded `at`, which only the room key vouches for.
Cannot prove: Refusals that are never recorded (R-ADM-8): kind-undeclared, binding-stale and the other refusals of admission steps 1 to 6 leave no entry, so verify can neither see nor prove them.
Cannot prove: Under a v1 document, entries are judged by the legacy vocabulary as before declared acts: the decisions present are replayed, but the calls the room had to make are not derived (R-DECL-1).
Cannot prove: Under a v2 document, the required evaluation calls are derived and their inputs rebuilt from the thread, roster, obligation and evidence fold, which takes receipt effects as recorded: lane, lease and landing transitions, the obligations effects, and the platform guards behind a recorded refusal are not re-derived (stage 6).
Cannot prove: A version's changed paths are checked against Git objects, from the base its context names to its head, when the objects are present; without them they are the retained context's, reported as git-unwitnessed. That the base is the merge base of main and the head needs main's history, which the log does not carry.
Cannot prove: The paths changed since an earlier verdict's head, which decide whether it carries, are read from Git objects. Without them they are the retained carry context's, where one is recorded; where none is, whether the verdict carried is undecided, and so is each land input that depends on it. Each is reported as git-unwitnessed.
Cannot prove: Whether the room prepared a check's integration, for a version or landing with no prepared event: rooms seal prepared events from stage 4 (R-DECL-20); verify checks a check against them where they are present. Until then a check on a filtered snapshot does not name the integration it counts for, and a check carry's new tree and snapshot are not in the log: verify takes them from the
Cannot prove: Carry judgements are accounted for in part (R-CARRY-13). Verify replays each check-carried judgement that is recorded, and a carry that is not recorded meets no obligation. It detects a second judgement of the same check, a carry that skipped a newer passing check, and a land evaluation made while a blocking obligation was open. It does not derive the whole list of judgements the roo
Cannot prove: What a verified prefix means: every check this run makes passed for the entries it names. It does not mean that every duty of the room was done, that publication is complete, or that each transition of the room's state was derived again.
[artroom-verify exit 0]
{"step":"revoke read token","id":"jmmq4076igb4ancx","revoked":true}
[exit 0]
```

## Appendix A: the helper commands added for this run (`journey.mjs`)

The whole helper is in the sprint 1 note. These two commands were added to it for this run:

```js
} else if (cmd === "invite-person") {
  // A person who keeps their own key: node journey.mjs invite-person @handle role
  const [member, role] = process.argv.slice(3);
  await invite(await adminRoom(), { op: "invite", member, role, custody: "client" }, `${member.slice(1)}-link.txt`);
} else if (cmd === "policy-owners") {
  // The active policy document plus an owner for the documentation and a rule that asks for the owner's review.
  const p = JSON.parse(readFileSync(process.argv[3], "utf8"));
  p.owners = { ...p.owners, "README.md": ["@ben"], "docs/**": ["@ben"] };
  p.rules = [...p.rules, { id: "docs-owner-review", kind: "require", paths: ["README.md", "docs/**"], obligation: { type: "review", from: ["owners"], count: 1, allowSelf: false } }];
  const problems = validatePolicyV2(p);
  if (!problems.ok) { console.error(JSON.stringify(problems)); process.exit(1); }
  process.stdout.write(JSON.stringify(p, null, 2) + "\n");
```
