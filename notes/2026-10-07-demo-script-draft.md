# The demo script, draft 1

2026-10-07. A shot list for the recording of plan 024 (gate of Monday
2026-10-13), written by a cloud builder from the documents named below.
It is a document only: no source changed. Five to seven minutes of screen
time. A local colleague reviews it, runs the "to be confirmed" scenes on
the deployment, and corrects the expected lines to what is observed.

Sources read: on `origin/main`, plans 024, 019, 016, 025 and 021 and the
sprint reports of 2026-10-06 23:00, 2026-10-07 07:00 and 2026-10-07
15:00; on `planner/i5-demo-host` at `5de2b850`, `docs/cli.md`,
`docs/hosts.md`, `docs/pages.md`, `docs/deploy.md`, the lane wiring
delivery note and the lane scenario tests
(`packages/lanes/test/wiring.scope.test.ts`, `story.scope.test.ts`); at
`b6a9c0b6`, `notes/deploy-spike.md`. I could not find a document on any
branch named for the developer onboarding positioning; the opening below
uses plan 019, the nouns, verbs and invariants of plan 025, and the phrase
"you write the record, the room runs it" as given in the brief.

Labels used in the shot list:

- **Live**: observed on the deployment on 2026-10-07 by the local
  colleague. The expected lines are copied from the 15:00 sprint report
  or, where marked, from `docs/cli.md`. IDs, times and hashes differ on
  every run.
- **To be confirmed**: not yet run live. The expected outcome is what the
  lane scenario tests assert. The printed form of the command line for
  these outcomes has not been observed, and section 7 lists what blocks
  them today.

## 1. The shape

| Part | Shots | Time |
|---|---|---|
| Opening | 1 to 2 | 0:00 to 0:35 |
| Middle: found, invite and join, clone, page | 3 to 7 | 0:35 to 2:45 |
| Middle: edit, refusal, approval, publication, verifier | 8 to 12 | 2:45 to 5:15 |
| Close: GitHub, the jam, what is next | 13 to 15 | 5:15 to 6:30 |

Total 6:30, with 30 seconds of slack under the seven-minute ceiling. If
the jam clip is not ready, cut shot 14 and the total is 6:10.

Screen layout for the whole middle: a terminal on the left (device A,
the founder, `@hugh`), a second terminal on the right (device B, the
member, `@una`), and a browser that slides in for the page shots. Large
font, a plain prompt `$ `, no shell history visible. Long IDs are cut to
eight letters in the captions, as the command line prints them in full.

## 2. Opening

### Shot 1. Title (0:00 to 0:10)

- **On screen**: the word Artroom on a white card; under it, "you write
  the record, the room runs it".
- **Typed**: nothing.
- **Said**: "This is Artroom."

### Shot 2. What it is (0:10 to 0:35)

- **On screen**: three short columns on a white card, built up one by
  one, in the words of plan 025:
  - Nouns: room, repository, page, read token.
  - Verbs: found, invite, join, clone, edit, publish, verify.
  - Invariants: only the room writes the published branch; a page is
    served only from a published commit; a folder changes only as its
    rules allow; every step can be checked afterwards.
- **Typed**: nothing.
- **Said**, the two sentences: "Artroom is a room for a repository: you
  write down its nouns, its verbs and its rules, and the room runs them,
  for people and agents alike. Everything you see happen is a signed
  record that anyone can replay afterwards, without trusting our
  database."

## 3. Middle

### Shot 3. Found a room on the hosting's own Git service (0:35 to 1:15). Live

- **On screen**: device A terminal.
- **Typed**:

  ```
  $ artroom install <base-url> --host artifacts --namespace artroom-demo
  ```

- **Expected**, from the 09:55 run:

  ```
  Installed: register sc_gatlhaw5upazwk4vubzeho2hcxmoza2mvqnpnz2wcsck6oxlnuca.
  ```

  (`docs/cli.md` also shows a second line, "The operator key key_... is
  kept in the config directory, readable only by you. It is the one
  founder key." The report did not copy it; confirm on the day.)

- **Cut**: the setting that pins the register is set off camera (section
  5). The recording resumes at the claim.
- **Typed**:

  ```
  $ artroom claim demo-own-host --handle @hugh
  ```

- **Expected**, from the 09:55 run, returned ten seconds after it was
  typed:

  ```
  Claimed demo-own-host: directory sc_lm2piehz..., membership sc_5hfk5tpy..., rules sc_knkga4d5..., destination sc_ipwfgr6w...; each created and confirmed.
  You are @hugh, an admin, on key key_M5p1...; your inbox is sc_wgxtpfct....
  ```

- **Said**, over the install: "One signed act founds the room's
  register." Over the claim: "A claim creates the repository, its
  members, its rules and its destination, and pushes the founding
  commit. Ten seconds."

### Shot 4. Invite (1:15 to 1:35). Live (member path, 18 seconds end to end)

- **On screen**: device A terminal.
- **Typed**:

  ```
  $ artroom invite @una --role member
  ```

- **Expected**, in the form of `docs/cli.md` (the live lines of the member
  run are not in the documents I read; copy them in on the day):

  ```
  Invited @una as member: invitation sc_5hfk5tpy...:5, until 2026-10-14T...Z.
  Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox...
  ```

- **Said**: "The founder invites a member. The link carries a one-time
  secret, not a key."
- **Note for the edit**: blur the link after its first eight letters.

### Shot 5. Join on a second device (1:35 to 1:55). Live

- **On screen**: device B terminal.
- **Typed**:

  ```
  $ artroom join artroom-invite:eyJ2Ijox...
  ```

- **Expected**, in the form of `docs/cli.md`:

  ```
  Joined as @una on key key_H1bY2Hml....
  Your inbox: sc_zbtu7vax....
  ```

- **Said**: "Una joins from her own machine, with a key made there and
  never sent anywhere."

### Shot 6. Clone with a token the room issued (1:55 to 2:25). Live

- **On screen**: device B terminal.
- **Typed**:

  ```
  $ artroom clone site
  $ git -C site log --oneline
  ```

- **Expected**, from the 14:22 run:

  ```
  Read token: sc_ezngnqra...:8, until 2026-10-07T19:22:36.226Z.
  Remote URL: https://<service>/git/artroom-demo/pjpl7g2x...-1.git
  Cloned into site.
  e1a3edc artroom Found this repository.
  ```

- **Said**: "To read the repository, Una asks the room for a read token.
  The room records that it issued one, for her, for an hour, and never
  records the token itself."

### Shot 7. The room's page (2:25 to 2:45). Live

- **On screen**: the browser at `<base-url>/site/<directory>/HEAD/`.
- **Typed**: the address.
- **Expected**, from the 11:39 run: the index of the founding tree. On
  the live room today this is the page for an empty repository, because
  nothing has been published yet. Headers, if shown in a side panel:

  ```
  HTTP/2 200   content-type: text/html; charset=utf-8   cache-control: public, max-age=60
  etag: "517e108199a4c292e6f7e2457493828600ae0986.4949615abd7d7388e6e1a802"
  ```

- **Said**: "Every room's repository is also a site. The page is read
  from the published commit and nowhere else."
- **Note**: the first part of the ETag is the commit. Shot 9 shows it
  change.

### Shot 8. Edit a page in an open folder (2:45 to 3:30). To be confirmed

- **On screen**: device B terminal; the change is `guide/start.md`, a
  page in the `source` extent, which needs one approval from a member who
  holds `change.review`.
- **Typed**, by the act names of the demo profile (`change-demo`); the
  exact command line is not settled (section 7, gaps 1 to 3):

  ```
  $ artroom act open-pr --on directory --set definition=<change-demo digest> --set title="Add a getting-started page" --set draft=false
  $ artroom act propose-manifest --on <change lane> ...
  $ artroom act request-review-own --on <change lane> --set requested=@paul
  ```

  then on a third terminal or device A as `@paul`:

  ```
  $ artroom act review-verdict --on <change lane> --set manifest=<manifest> --set verdict=approve --set extent=source
  ```

  then as `@una`:

  ```
  $ artroom act merge --on <change lane> --set manifest=<manifest> --set reports=[]
  ```

- **Expected**: each act prints `Took effect: entry <scope>:<seq>, hash
  sha256:...`. The outcome, as test W1 asserts it: the change lane's
  merge item is `published`, the destination's publication is
  `published`, the branch head moves to the new commit, and the linked
  issue, if any, is `closed` with reason `completed`.
- **Said**: "Una edits a page in an open folder. One reviewer approves,
  and the room publishes it."

### Shot 9. The page, published (3:30 to 3:45). To be confirmed

- **On screen**: the browser at
  `<base-url>/site/<directory>/HEAD/guide/start.md`, then the index.
- **Expected**: the page rendered; a new ETag whose first part is the new
  commit (`docs/pages.md`, "Caching"). The front page lists `guide/`.
- **Said**: "The page is live, from the commit the room just published."

### Shot 10. An edit in a controlled folder, refused by name (3:45 to 4:20). To be confirmed

- **On screen**: device B terminal. The change touches `AGENTS.md`, the
  instructions for agents, and one page. `AGENTS.md` is in the `rules`
  extent by default (`**/AGENTS.md`, `**/CLAUDE.md`,
  `.github/workflows/**`, `.github/actions/**`); only the rules scope's
  controller, a holder of `rules.publish`, can meet it. A repository may
  add patterns to that extent, so a folder such as `policy/` can be made
  controlled at founding; that variant is not in any test.
- **Typed**: as in shot 8, a new change; `@paul` approves for `source`;
  `@una` merges.
- **Expected**, as test W2 and the profile story test assert it: the
  merge act takes effect, and the destination refuses the reservation.
  The lane's merge item state is `refused` with reason:

  ```
  rules-not-met:rules
  ```

  The publication is `not-reserved`, the branch head is unchanged, and
  the linked issue stays `open`. How the command line prints this (by
  `artroom show <change lane>:<seq>` or `artroom log`) is to be
  confirmed.
- **Said**: "Now Una touches the instructions the agents follow. The
  source reviewer's approval is not enough. The room refuses, and says
  which rule is not met. A refusal writes nothing to the repository."

### Shot 11. The controller approves and it publishes (4:20 to 4:45). To be confirmed

- **On screen**: device A terminal, `@hugh`, the founder, who holds
  `rules.publish` and is not an author of the change.
- **Typed**:

  ```
  $ artroom act review-verdict --on <change lane> --set manifest=<manifest> --set verdict=approve --set extent=rules
  ```

  then `@una` merges again.
- **Expected**, as test W2 asserts it: merge item `published`,
  publication `published` with no exception reason, branch head moved,
  issue `closed`.
- **Said**: "The rules scope's controller approves, and the same change
  takes effect. The rules are the room's own: written down, versioned,
  and changed only by the people they name."

### Shot 12. The verifier (4:45 to 5:15). Live for the founding and member path; to be confirmed after a change

- **On screen**: device B terminal.
- **Typed**:

  ```
  $ artroom verify register
  $ artroom verify directory
  $ artroom verify membership
  $ artroom verify rules
  $ artroom verify destination
  $ artroom verify inbox
  ```

  (In the edit, run them in one line with `for s in ...; do ...; done`
  and cut to the six results.)
- **Expected on a room with no change yet**, from the 14:22 run, six
  times:

  ```
  Result: consistent, for the mode, target, coverage and trusts stated below.
  ```

- **Expected after shots 8 to 11**, as test W2 asserts it: register,
  membership and rules `consistent`; the directory, the destination and
  both lanes `incomplete`, each for one reason only, said after every
  other entry derived with no mismatch:

  ```
  Result: incomplete: the walk of the ancestry record in entry <n> of <change lane> was not derived: this replay reads no commit, ...
  ```

  This is the verifier's own honest limit: it does not read Git commits
  (`packages/replay/src/verify.ts`, sections 9.3 and 16.4).
- **Said**, if shown on a room with no change: "Anyone can replay the
  room. The verifier folds every history from its first entry and
  reports each one consistent." If shown after the change: "The verifier
  replays every history. Each act is derived again, with no mismatch;
  what it cannot check without reading Git, it says so."
- **Recommendation**: record shot 12 on the room after the change, and
  use the second sentence, unless the proof plan's owner adds commit
  reads before the freeze. Do not say "consistent" over a line that says
  "incomplete".

## 4. Close

### Shot 13. GitHub as the linked host (5:15 to 5:40). Live

- **On screen**: a fresh terminal, a second register, then the
  organization's repository list on GitHub.
- **Typed**:

  ```
  $ artroom install <base-url> --host github.com --namespace <organization>
  $ artroom claim demo-github --handle @hugh
  ```

- **Expected**, in the form of the live runs of 08:27 and 09:23 (their
  full lines are not in the documents I read):

  ```
  Installed: register sc_....
  Claimed demo-github: directory sc_..., membership sc_..., rules sc_..., destination sc_...; each created and confirmed.
  You are @hugh, an admin, on key key_...; your inbox is sc_....
  ```

  and on GitHub, a new repository with one commit, "Found this
  repository."
- **Said**: "The same room can keep its repository on GitHub, through
  the organization's App. Same acts, same rules, same record."

### Shot 14. The jam, as the sting (5:40 to 6:00). Optional

- **On screen**: the J2 clip with the rockstar lead and the mood phrase
  (`j2-mood-clip.wav` over the white-stage page), cut to its first
  phrase: hum, synth, percussion, lead. About 18 seconds, the shape of
  plan 021's reference clip.
- **Typed**: nothing.
- **Said**: nothing over the clip. After it, one line: "Same room. Here
  the record is a band."
- **If not ready**: cut the shot; do not replace it with a slide.

### Shot 15. What is next (6:00 to 6:30)

- **On screen**: a white card with three lines.
  - An agent working under a narrow grant, refused when it steps outside
    it.
  - An issue split into concerns, each returned as a change, recombined
    into one.
  - Pages as an application a room installs.
- **Said**: "Next: agents under narrow grants, issues that split and
  recombine, and applications a room installs. You write the record. The
  room runs it."

## 5. Fallback plan

Plan 024's rule: if a gate slips more than half a day, the next one moves
down a level.

| If this is not ready by Sunday's freeze | Then |
|---|---|
| Shots 8 to 11 on the new model (the change lane from the command line) | Keep shots 1 to 7, 12 (no-change form) and 13 on the new model. Replace shots 8 to 11 with the old spike's live segment, below, and say over it: "This is the earlier version of the room publishing a page." Show the refusal (shot 10) as the scenario test's run in a terminal, `npx vitest run --project lanes story`, with its test title on screen. |
| The new model on the deployment at all | The whole middle from the old spike, below; the opening and close as written, minus shot 13. |
| The jam clip | Cut shot 14. |

The old spike at `b6a9c0b6` (`notes/deploy-spike.md` there) runs at its
own address on the hosting's own Git service. Its smoke run,
`node packages/room/measure/spike-smoke.mjs`, recorded on 2026-10-02:
founding a room (200, 2.3 s); a lane that claims `docs/**` and
`README.md`; a workspace fork and a write token for it (2.5 s); clone,
commit `docs/smoke.md`, push; `propose` (200, generation 1, no
obligations, 1.0 s); a clean fast-forward preview; `land` (accepted,
`landed` 1.0 s later); `main` at the landed commit; the log published
about 62 seconds later; `artroom verify` on the published log, exit 0,
"verified through entry 10". Limits to respect on camera: it has no
reviews, no checks and one member, so it shows publication and
verification, not a refusal; the log takes about a minute to publish, so
cut that wait. It speaks the old vocabulary (claim, workspace, propose,
land); say "publish" over `land`. Run it the day before to confirm it
still answers; nobody has touched it since 2026-10-02.

## 6. The morning of the recording: what must be true

Settings and deployment:

- [ ] The scope service is deployed from the landed head that carries
      gates 1, 1b and 2 and the clone, renderer and destination read
      branches; its version ID is noted.
- [ ] `DEPLOYMENT` and `SESSION_SECRET` are set; `SESSION_SECRET` has
      not changed since the rooms were founded (a change ends every
      session).
- [ ] The binding for the namespace `artroom-demo` is present.
- [ ] `ARTIFACTS_CONFIG` holds exactly `registerScope` (the demo
      register), `namespace` `artroom-demo`, `host`, `maxBytes` (8388608
      on the 15:00 run) and `credentialIdentity` `adapter-attempt`.
- [ ] `GITHUB_APP_CONFIG` pins the GitHub register for shot 13;
      `GITHUB_APP_PRIVATE_KEY` and `GITHUB_READ_TOKEN` set;
      `GITHUB_CREATION_TOKEN` minted within the hour before shot 13, if
      it is an installation token, and the service restarted after it is
      set.
- [ ] After each setting change, the service is redeployed and the
      register is read once, so that a claim does not wait two minutes
      for a restart (the 14:19 claim did).

Rooms:

- [ ] Every room on camera is founded after the last change of the
      platform definitions on the deployed head. A room founded before
      such a change refuses new acts and fails verification (15:00
      report, "Stand-ins and limits"), until definition versions are
      decided.
- [ ] One rehearsal room, founded and taken through every shot the
      evening before, with the observed lines copied into this script.
- [ ] One fresh room per take, founded on camera; a spare register
      installed in case a claim gives up.
- [ ] The rules scope of each room has activated `issue-demo` and
      `change-demo` (digests `sha256:82a938c8...` and
      `sha256:8d777c02...`), and its rules publish `approvals: 1`,
      `ownerMayReview: false` and the first extents. If a `policy/`
      folder is to be controlled, its pattern is in the `rules` extent.
- [ ] `@hugh` holds `rules.publish`; `@paul` holds `change.review` and
      is no author of the changes; `@una` holds `change.open`.

Tokens and timing:

- [ ] Shot 6 (the first clone) runs within 15 minutes of the claim: a
      destination where no act has been signed cannot be read once the
      founder's intent window has passed (`docs/cli.md`).
- [ ] The founder takes the seat within 15 minutes of the claim.
- [ ] A read token lasts one hour by default; a later fetch needs a new
      `artroom clone`.
- [ ] The two stray repositories (the 08:17 register `sc_abgztv2y` and
      its GitHub repository) are deleted, so the organization's list on
      GitHub shows only the demo's.

Screen:

- [ ] Config directories for device A and device B are fresh
      (`ARTROOM_HOME`), and hold no key from a rehearsal.
- [ ] No setting value, token, invitation link or key appears on screen
      in full.

## 7. Gaps that block the "to be confirmed" scenes

Recorded with the exact text where there is one. I invented no route
around them.

1. **The command line cannot open a lane on the deployed head.** The lane
   wiring's commit `c6fe198` made the definition's bytes a value at a
   stated place beside the intent of `open-issue`, `open-pr` and the
   rules scope's `activate`: "With a stated place, missing bytes are
   refused `bad-field` before any guard" (lane wiring delivery note,
   section 6, gap 3). `artroom act` sends a platform act with no value
   beside it (`packages/cli/src/commands.ts`, line 528,
   `handle.submit(signed)`), and the decision of 2026-10-07 07:00 is that
   "a client never carries them" (`732d83e6`). So the command line's
   `open-pr` and `activate` are answered `Refused: bad-field`. This is
   the known failing assertion of `packages/cli/test/story.scope.test.ts`
   (line 153 expects `Refused: guard-failed (not-activated), judged at
   entry ...`). I read this from code and did not run it; this branch
   changes no source, so I left the test as it is. Which refusal is
   right, and whether the directory reads the bytes from the rules scope
   or the client sends them, is for whoever touches the command line or
   the lanes next.
2. **No route for a member's commit to reach the repository before the
   room publishes it.** The lanes' Git host is a stand-in in every test:
   "`Host` of `graph.ts` for each lane, answering the attempts of
   `hold@1`. No repository exists" (lane wiring note, section 2). The
   repository on the hosting's own Git service is read-only to members.
   Plan 025: "Edit a page. One act that proposes a change to one file.
   ... It rests on gate 2's lane wiring and the propose-from-branch
   command of design request R5". Until one of those exists, shots 8 to
   11 cannot run live.
3. **The changed set is scripted in the tests** (`Room.changes`), so the
   classification of `AGENTS.md` into the `rules` extent has not yet been
   seen against a real commit.
4. **A newly created lane's scope ID** is not printed by `Took effect:
   entry sc_...:<seq>`; how the person names `<change lane>` in the next
   command is to be confirmed (`artroom show` of the directory's entry,
   probably).
5. **The verifier after a change** reports `incomplete` for four
   histories (shot 12). Not a defect; a limit to say plainly.

## 8. Sentences that must not be said

- Any comparison with another product, tracker, forge or service: not
  "unlike ...", not "better than ...", not "a replacement for ...".
  Plan 019: "the demo script says 'trackers and forges' or nothing".
- Any product name but GitHub: not the name of the hosting, its Git
  service, its compute product or its deploy tool; not the names of
  model providers or models in the jam (each agent is named by its own
  name and "the model it runs on" as text, plan 021). Say "the hosting's
  own Git service".
- "Admission", "admitted", "admits": say "takes effect" or "is refused".
- Anything about pricing, plans, customers, licensing or the shape of
  the business.
- "Live" over a fallback or test shot. Say "the earlier version" over the
  spike, "the scenario test" over a test run.
- "Consistent" over a verifier line that says "incomplete".
- "Agents" doing anything on screen that no agent did: no agent runs in
  this story (lane wiring note, section 2). Agents appear only in shot 15
  as what is next, and in the jam.
- "Secure", "trustless", "guaranteed", "tamper-proof": say what is
  checked ("anyone can replay it") instead.
- The model's vocabulary (terms, offers, holds, obligations, scopes,
  intents) in voice-over, except "rules", "extent" where the refusal
  names it, and "verifier" (plan 019, "How it is told").

## 9. Note on this delivery

- Branch: `claude/demo-script-draft-2w895f`, from
  `origin/planner/i5-demo-host` at `5de2b850`, history not rewritten.
- Changes: this file and the empty marker `notes/.keep-demo-script`
  (the push check). No source, no test, no lockfile.
- Not run, as the brief allows for a document: `npm ci` and `npm run
  gate`. Nothing was deployed or run against the deployment.
- Known at the base and left as it is: one failing assertion of
  `packages/cli/test/story.scope.test.ts` (section 7, gap 1); T36 of
  `packages/checkers/test/runner.test.ts` fails under the container's
  Git (not run here).
- Names kept as literals because they are the code's own: the command
  line flag `--host artifacts` and the settings `ARTIFACTS_CONFIG` and
  `ARTIFACTS`. They are not said aloud.
