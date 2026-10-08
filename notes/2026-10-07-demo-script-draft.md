# The demo script, draft 1

Corrected on 2026-10-08: every command line and every printed line in
shots 3 to 12 and in the checklist of section 6 is now the line observed
when the demo runner (`docs/demo.md`) ran against main `7bb3a641` on
2026-10-08, 26 of 26 shots matching. The run took 77.3 seconds, a sum of
the per-shot seconds in the transcript's shot headers, not an observed
wall-clock time. Scope IDs are shown as placeholders of the printed shape
(`sc_<directory>`, `key_<founder>`); hashes, times and entry numbers are
the run's own and differ on every run.

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

- **Live**: observed on the deployment by the demo runner on 2026-10-08
  (shots 3 to 12), or, for shot 13, by the local colleague on 2026-10-07.
  The expected lines are copied from the runner's transcript. IDs, times
  and hashes differ on every run.
- **To be confirmed**: not run by the runner. Shot 13's lines are in the
  form of the 2026-10-07 live runs, and section 7 keeps the gaps as they
  were found on 2026-10-07, with a note on what the 2026-10-08 run
  settled.

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
member, `@una`), a third terminal for the maintainer `@paul` in shots 8
to 11, and a browser that slides in for the page shots. Large
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
  $ artroom install --plan <base-url> --host artifacts --namespace artroom-demo
  ```

- **Expected**, from the 2026-10-08 run:

  ```
  Planned: register sc_<register>, under platform:register@2, on host artifacts, namespace artroom-demo. The seed's time is 2026-10-08T19:50:45Z.
  Set registerScope to sc_<register> in the Worker's host setting, then run artroom install --planned before 2026-10-08T19:50:45Z.
  ```

- **Cut**: the setting that pins the register is set off camera (section
  6). The recording resumes at the second install and the claim.
- **Typed**:

  ```
  $ artroom install --planned
  $ artroom claim demo-own-host --handle @hugh
  ```

- **Expected**, from the 2026-10-08 run; the claim returned seven seconds
  after it was typed:

  ```
  Installed: register sc_<register>, under platform:register@2, as planned.
  Service-acknowledged identity recovery. The original plan and receipt are retained for later history verification.
  Claimed demo-own-host: directory sc_<directory>, membership sc_<membership>, rules sc_<rules>, destination sc_<destination>; each created and confirmed.
  Definitions: platform:directory@2, platform:membership@2, platform:rules@2, platform:destination@2.
  You are @hugh, an admin, on key key_<founder>; your inbox is sc_<founder inbox>.
  ```

- **Said**, over the install: "One signed act founds the room's
  register." Over the claim: "A claim creates the repository, its
  members, its rules and its destination, and pushes the founding
  commit. Seven seconds."

### Shot 4. Invite (1:15 to 1:35). Live (member path, 18 seconds end to end)

- **On screen**: device A terminal.
- **Typed**:

  ```
  $ artroom invite @una --role member
  ```

- **Expected**, from the 2026-10-08 run:

  ```
  Invited @una as member: invitation sc_<membership>:5, until 2026-10-09T19:37:00Z.
  Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox...
  ```

- **Said**: "The founder invites a member. The link carries a one-time
  secret, not a key."
- **Note for the edit**: blur the link after its first eight letters.
- **Off camera, or in the same shot**: the maintainer who edits in shots
  8 to 11 is invited the same way, `artroom invite @paul --role
  maintainer`, which prints `Invited @paul as maintainer: invitation
  sc_<membership>:8, until 2026-10-09T19:37:02Z.` and a link for `@paul`
  only.

### Shot 5. Join on a second device (1:35 to 1:55). Live

- **On screen**: device B terminal.
- **Typed**:

  ```
  $ artroom join artroom-invite:eyJ2Ijox...
  ```

- **Expected**, from the 2026-10-08 run:

  ```
  Joined as @una on key key_<member>.
  Your inbox: sc_<member inbox>.
  ```

- **Said**: "Una joins from her own machine, with a key made there and
  never sent anywhere."
- **Off camera, or on the third terminal**: `@paul` joins with his own
  link, `artroom join artroom-invite:eyJ2Ijox...`, which prints `Joined
  as @paul on key key_<maintainer>.` and `Your inbox: sc_<maintainer
  inbox>.`

### Shot 6. Clone with a token the room issued (1:55 to 2:25). Live

- **On screen**: device B terminal.
- **Typed**:

  ```
  $ artroom clone site
  $ git -C site log --oneline
  ```

- **Expected**, from the 2026-10-08 run (the repository's name on the
  service is the directory's ID without its `sc_` prefix, then `-1`):

  ```
  Read token: sc_<destination>:8, until 2026-10-08T20:37:05.148Z.
  Remote URL: https://<service>/git/artroom-demo/<directory>-1.git
  Cloned into site.
  5924bde Found this repository.
  ```

- **Said**: "To read the repository, Una asks the room for a read token.
  The room records that it issued one, for her, for an hour, and never
  records the token itself."

### Shot 7. The room's page (2:25 to 2:45). Live

- **On screen**: the browser at `<base-url>/site/sc_<directory>/HEAD/`.
- **Typed**: the address.
- **Expected**, from the 2026-10-08 run: the index of the tree, titled
  with the repository's name. Before shot 8 this is the founding tree,
  because nothing has been published yet.

  ```
  HTTP 200, text/html; charset=utf-8
  Title: <directory>-1
  ```

  Headers, if shown in a side panel, from the 11:39 run of 2026-10-07
  (the runner does not read them):

  ```
  HTTP/2 200   content-type: text/html; charset=utf-8   cache-control: public, max-age=60
  etag: "517e108199a4c292e6f7e2457493828600ae0986.4949615abd7d7388e6e1a802"
  ```

- **Said**: "Every room's repository is also a site. The page is read
  from the published commit and nowhere else."
- **Note**: the first part of the ETag is the commit. Shot 9 shows it
  change.

### Shot 8. Edit a page in an open folder (2:45 to 3:30). Live

- **On screen**: device B terminal, then the third terminal; the change
  is `guide/start.md`, a page in the `source` extent, which the rules of
  section 6 publish with no approval. `start.md` is a local file of 53
  bytes holding "Clone the room, then edit a page."
- **Typed**, as `@una` on device B:

  ```
  $ artroom issue open --title 'Add a getting-started page' --body 'A page that says how to clone and edit.'
  ```

  then on the third terminal as `@paul`:

  ```
  $ artroom issue comment 1 'I will take this.'
  ```

  then on device A as `@hugh`:

  ```
  $ artroom issue assign 1 @paul
  ```

  then as `@paul`, and, after it, as `@una`:

  ```
  $ artroom edit guide/start.md --file start.md --closes 1
  $ artroom issues
  ```

- **Expected**, from the 2026-10-08 run, in that order (the edit took
  eight seconds):

  ```
  Opened issue #1: Add a getting-started page. Its lane is sc_<issue>.
  Commented: entry sc_<issue>:2, hash sha256:d0d822481c57.
  Assigned: entry sc_<issue>:3, hash sha256:450a1caf5b35.
  Proposed guide/start.md (53 bytes) as change sc_<published>, version 5.
  Linked: when it is published, the change sc_<published> closes issue #1 (sc_<issue>).
  Published: commit 9c37c9834a03f20c51dbd8601a4ac0c2a6e10d01, by the merge sc_<published>:7.
  Page: <base-url>/site/sc_<directory>/HEAD/guide/start.md
  #1  closed (completed)  Add a getting-started page; assigned to @paul; lane sc_<issue>
  1 issues, 0 open.
  ```

- **Picture**: `issue.png` (the issue's screen) and
  `change-published.png` (the `guide/start.md` change's screen), from the
  room's page at `<base-url>/page/`; `room.png` shows the room's issues
  and changes with their states, taken at the end of the run.
- **Said**: "Una opens an issue. Paul takes it and edits a page in an
  open folder. The room publishes the page and closes the issue."

### Shot 9. The page, published (3:30 to 3:45). Live

- **On screen**: the browser at
  `<base-url>/site/sc_<directory>/HEAD/guide/start.md`, then the index.
- **Expected**, from the 2026-10-08 run:

  ```
  HTTP 200, text/html; charset=utf-8
  Title: Getting started
  Shows: "Clone the room, then edit a page."
  ```

  A new ETag whose first part is the new commit (`docs/pages.md`,
  "Caching"), and the front page listing `guide/`, are not read by the
  runner; confirm in the browser.
- **Picture**: `site-page.png`, the page as the site renders it.
- **Said**: "The page is live, from the commit the room just published."

### Shot 10. An edit in a controlled folder, refused by name (3:45 to 4:20). Live

- **On screen**: the third terminal, `@paul`. The change touches
  `AGENTS.md`, the instructions for agents; `agents.md` is a local file
  of 31 bytes holding "Ask before you push." `AGENTS.md` is in the
  `rules` extent by default (`**/AGENTS.md`, `**/CLAUDE.md`,
  `.github/workflows/**`, `.github/actions/**`); only the rules scope's
  controller, a holder of `rules.publish`, can meet it. A repository may
  add patterns to that extent, so a folder such as `policy/` can be made
  controlled at founding; that variant is not in any test.
- **Typed**:

  ```
  $ artroom edit AGENTS.md --file agents.md
  ```

- **Expected**, from the 2026-10-08 run; the command exits 1:

  ```
  Proposed AGENTS.md (31 bytes) as change sc_<controlled>, version 5.
  Not published: the merge sc_<controlled>:6 is refused, rules-not-met:rules. The change sc_<controlled> stays open at version 5. When it may be merged, run: artroom merge sc_<controlled>
  ```

  The branch head is unchanged. A second refusal, if there is time,
  shows a path outside the repository refused by name, `artroom edit
  ../outside.md --file start.md`, which exits 1 and prints
  `Not published: the merge sc_<refused>:6 is refused, path-invalid. ...`
  after its `Proposed` line.
- **Picture**: `change-refused.png`, the `../outside.md` change's
  screen. There is no capture of the `AGENTS.md` change while refused.
- **Said**: "Now Paul touches the instructions the agents follow. A
  maintainer's edit is not enough. The room refuses, and says which rule
  is not met. A refusal writes nothing to the repository."

### Shot 11. The controller approves and it publishes (4:20 to 4:45). Live

- **On screen**: device A terminal, `@hugh`, the founder, who holds
  `rules.publish` and is not an author of the change; then the third
  terminal, `@paul`; then the browser.
- **Typed**:

  ```
  $ artroom act review-verdict --on sc_<controlled> --set manifest=5 --set verdict=approve --set extent=rules
  ```

  then `@paul` merges again:

  ```
  $ artroom merge sc_<controlled>
  ```

- **Expected**, from the 2026-10-08 run:

  ```
  Took effect: entry sc_<controlled>:9, hash sha256:54dec834d28b.
  Published: commit 59a3eb77535834c1cf90f857bf80d3a12601a96b, by the merge sc_<controlled>:10.
  Page: <base-url>/site/sc_<directory>/HEAD/AGENTS.md
  ```

  and the browser at that page:

  ```
  HTTP 200, text/html; charset=utf-8
  Title: Agents
  Shows: "Ask before you push."
  ```

- **Picture**: `rules.png`, the rules of this room and who may change
  them.
- **Said**: "The rules scope's controller approves, and the same change
  takes effect. The rules are the room's own: written down, versioned,
  and changed only by the people they name."

### Shot 12. The verifier (4:45 to 5:15). Live, after the changes

- **On screen**: device B terminal.
- **Typed**:

  ```
  $ artroom verify --all
  ```

  (The run took 28 seconds; in the edit, cut to the results.)
- **Expected after shots 8 to 11**, from the 2026-10-08 run, with the
  second refusal of shot 10 included (without it, its lane's line is
  absent: an inference, not observed); the entry numbers are the run's
  own:

  ```
  register sc_<register>, entry 3: consistent.
  directory sc_<directory>, entry 23: consistent.
  membership sc_<membership>, entry 10: consistent.
  rules sc_<rules>, entry 10: consistent.
  destination sc_<destination>, entry 35: consistent.
  lane sc_<issue>, entry 5: consistent.
  lane sc_<published>, entry 12: consistent.
  lane sc_<controlled>, entry 13: consistent.
  lane sc_<refused>, entry 8: consistent.
  inbox sc_<founder inbox>, entry 1: consistent.
  inbox sc_<member inbox>, entry 1: consistent.
  inbox sc_<maintainer inbox>, entry 1: consistent.
  All consistent: 12 scopes.
  ```

- **Said**: "Anyone can replay the room. The verifier folds every history
  from its first entry and reports each one consistent."
- **Recommendation**: record shot 12 on the room after the change, as the
  runner did. Do not say "consistent" over a line that says anything
  else.

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
- [ ] The rules scope of each room has published its rules (`approvals`
      0, `ownerMayReview` false, and the first extents: `rules` with
      `approvals` 1 and approver `rules.publish`, `infrastructure`,
      `source` with no patterns and `approvals` 0) and activated
      `issue-demo` and `change-demo` (digests `sha256:82a938c8...` and
      `sha256:d86c64ae...`). If a `policy/` folder is to be controlled,
      its pattern is in the `rules` extent. As the founder, after the
      claim, the three commands of the 2026-10-08 run, each printing
      `Took effect: entry sc_<rules>:<seq>, hash sha256:...`:

      ```
      $ artroom act publish --on rules --target 0 --set approvals=0 --set ownerMayReview=false --set 'checks=[]' --set 'labels=[]' --set 'extents=[{"name":"rules","patterns":["**/AGENTS.md","**/CLAUDE.md",".github/workflows/**",".github/actions/**"],"approvals":1,"approver":"rules.publish","checks":[],"class":"authority"},{"name":"infrastructure","patterns":["**/.gitignore","**/.gitattributes",".github/**"],"approvals":0,"approver":"change.merge","checks":[],"class":"deployment"},{"name":"source","patterns":[],"approvals":0,"approver":"change.review","checks":[],"class":"content"}]'
      $ artroom act activate --on rules --set digest=sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e --set name=issue --value issue-demo.json
      $ artroom act activate --on rules --set digest=sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2 --set name=change --value change-demo.json
      ```

- [ ] `@hugh` holds `rules.publish` and is no author of the changes;
      `@paul`, a maintainer, authors the changes and comments on the
      issue; `@una`, a member, opens the issue, clones and verifies.

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

Recorded on 2026-10-07 with the exact text where there is one. I invented
no route around them. On 2026-10-08 the runner went through shots 8 to 12
with `artroom issue`, `artroom edit`, `artroom merge` and `artroom verify
--all`, as written above; gaps 1, 2 and 4 did not block that run, and
gap 5 was not seen: the verifier reported all twelve scopes consistent.
The text below is kept as it was found.

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
