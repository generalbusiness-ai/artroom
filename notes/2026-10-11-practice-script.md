# Record the dap demo

Use this shot list for Monday 12 October's rehearsal and Tuesday 13
October's recording. The freeze is Monday at 23:00 Eastern. The cut runs
6:40, under seven minutes. This script follows [plan 030](../plans/030-2026-10-11-demo-plan-to-the-14th.md)
and supersedes the recording order in the 7 October draft.

Commands below use today's executable, `artroom`. The rename changes that
name to `dap`. Replace placeholders with the current take's printed
values. Never type an old scope ID, version, hash, or deadline from a
transcript into a new take.

**To be confirmed** means that the stated screen, line, or sound has not
been observed on the intended recording deployment. Confirm those rows
during rehearsal. An old command transcript, a source label, and a
recorded test screenshot each have different evidence.

## 1. Open the room and publish a change, 0:00 to 3:45

Keep three signed-in contexts: Hugh, who owns the rules; Una, a member;
and Paul, a maintainer. Prepare their keys and connections off camera.
Show the page first. Use a terminal only for the steps that require it.

### 0:00 to 0:15. Name the product

- **On screen:** the dap wordmark, then the room's page.
- **Do:** open `<base-url>/page/`. Confirm the selected room and member.
- **Appears:** the current room name and its issues. The dap branding on
  the deployed page is **to be confirmed** after the rename and styling.
- **Say:** “Durable action platform for people and agents.”
  “Rooms where people and agents act under shared rules. Every action signed, every rule enforced, every record kept.”
  “A Worker, the hosting's own Git service as the repository host, the
  published pages, and the same record running on GitHub.”

Say the hosting sentence once in the whole recording.

### 0:15 to 1:15. Create, invite, join, and clone

Show the prepared room while speaking. Compress these steps into one
minute. Keep the terminal commands below available for a cutaway, rather
than typing the whole setup in the recording.

```sh
  artroom install --plan <base-url> --host artifacts --namespace artroom-demo
  # The operator pins the printed register before continuing.
  artroom install --planned
  artroom claim <take-name> --handle @hugh
  artroom invite @una --role member
  artroom invite @paul --role maintainer
  # In Una's fresh context, use her own invitation.
  artroom join <una-invitation>
  artroom clone site
  git -C site log --oneline
  # In Paul's fresh context, use his own invitation.
  artroom join <paul-invitation>
```

The [observed 7 October script, corrected on 8 October](2026-10-07-demo-script-draft.md)
retains the complete printed lines. Recognizable results include
`Installed: register …, under platform:register@2, as planned.`,
`Claimed …; each created and confirmed.`, `Joined as @una on key …`,
`Cloned into site.`, and `Found this repository.` IDs differ per take.
Those commands on the next recording deployment are **to be confirmed**.
Blur invitations. Never show a signing key or a read token.

**Say:** “Hugh creates a room, sets its rules, and invites Una and Paul.
Each works with their own key. Una clones the repository through the
room.”

### 1:15 to 1:35. Open an issue

- **On screen:** Una's Issues page.
- **Do:** click **Create issue**. Enter title `Add a getting-started page`
  and description `A page that says how to clone and edit.` Submit once.
- **Appears:** a new issue with that title. Today's browser walkthrough
  created issue #5. A fresh take's issue number and exact success line
  are **to be confirmed**. Do not label an existing #5 as a new #1.
- **Say:** “Una opens an issue for a getting-started page.”

Terminal fallback, observed on 8 October:

```sh
  artroom issue open --title 'Add a getting-started page' --body 'A page that says how to clone and edit.'
```

Printed shape: `Opened issue #1: Add a getting-started page. Its lane is …`.

### 1:35 to 1:55. Comment and assign

- **On screen:** Paul's view of the issue, then Hugh's view.
- **Do:** Paul submits `I will take this.` with **Comment**. Hugh assigns
  the issue to Paul using the offered issue action.
- **Appears:** Paul's comment, then `Assigned to @paul`. The current
  deployment's assignment control and result are **to be confirmed**.
  Today's walkthrough observed a comment and a separate close, not this
  complete fresh-take sequence.
- **Say:** “Paul says he will take it. Hugh assigns the issue to Paul.”

Terminal fallback, observed on 8 October:

```sh
  artroom issue comment <issue-number> 'I will take this.'
  artroom issue assign <issue-number> @paul
```

Printed shapes: `Commented: entry …, hash …` and
`Assigned: entry …, hash …`.

### 1:55 to 2:20. Propose and publish the page

- **On screen:** Paul's **Propose change** form and the resulting change.
- **Do:** propose `guide/start.md` from the published base. Include
  `# Getting started` and `Clone the room, then edit a page.` Link the
  current issue to close when published. Submit once. Merge when offered.
- **Appears:** the proposed version, the linked issue, and publication.
  The complete browser sequence with issue closure is **to be confirmed**.
  Today's separate browser publication merged change #6 at
  `7ddce9ed3f5e8df026e4e0af86673f0b3f1f06dc`; its request for review
  remained open. Do not use that result as evidence of request closure.
- **Say:** “Paul proposes the page. The room checks the change against
  its rules, publishes it, and closes the linked issue.” **To be
  confirmed:** use the last clause only after this take's issue closes.

Terminal fallback, observed on 8 October:

```sh
  artroom edit guide/start.md --file start.md --closes <issue-number>
  artroom issues
```

Printed shapes: `Proposed guide/start.md (53 bytes) as change …, version 5.`,
`Linked: when it is published, the change … closes issue #1 (…)`,
`Published: commit …, by the merge …`, and `1 issues, 0 open.`
Use the take's actual bytes, version, and issue count on screen.

**Say:** “A clean textual merge can still be wrong, and only a test catches it, if one exists. So the room never merges text: it prevents by rule, composes by selection, and refuses when stale.”

### 2:20 to 2:50. Narrate the concurrent-edit story

- **On screen:** keep the page from the preceding publication visible.
- **Do:** explain the rule in words. Do not attempt another publication
  or add a stale-base rehearsal shot for this segment.
- **Say:** “If two changes start from the same version, publishing one
  changes the shared state. The other would be refused because its
  starting version is no longer current. Its proposer would need to
  propose it again from the current version, under the same rules.”

This is a narrated example, not an observed concurrent-edit run. Keep it
directly after the first publication. Do not label the visible page as
proof of a stale refusal or a second publication.

### 2:50 to 3:15. Refuse a change to the rules

- **On screen:** Paul's proposal to change `AGENTS.md`.
- **Do:** propose the local `agents.md` file containing `# Agents` and
  `Ask before you push.` Attempt the merge as Paul.
- **Appears:** the change remains open. The observed command refusal is
  `rules-not-met:rules`. The current browser's exact refusal screen is
  **to be confirmed**. The 9 October invalid-path capture is a different
  refusal and cannot stand in for this one.
- **Say:** “Paul changes the instructions the agents follow. The room
  refuses because this area needs approval from the person who owns
  the rules.”

Observed terminal command:

```sh
  artroom edit AGENTS.md --file agents.md
```

Observed printed shape:
`Not published: the merge … is refused, rules-not-met:rules. The change … stays open at version 5. When it may be merged, run: artroom merge …`.

### 3:15 to 3:45. Approve and publish that version

- **On screen:** Hugh's review, then Paul's change and its published page.
- **Do:** Hugh approves the current version for the rules area. Select
  the actual request for review if one exists. Paul merges that same
  version. Open **Open latest page**.
- **Appears:** the approved version and a publication. The page contains
  `Ask before you push.` **To be confirmed:** this rules-area sequence
  on the updated deployment. Today's independent browser witness showed
  a merged change, its exact 102-byte source, and its latest page with
  the matching commit footer. That witness was for a source-area change.
- **Say:** “Hugh approves this version. Paul publishes it. The page
  comes from the commit the room just published.”

Observed terminal fallback:

```sh
  artroom act review-verdict --on <controlled-change> --set manifest=<current-version> --set verdict=approve --set extent=rules
  artroom merge <controlled-change>
```

Printed shapes: `Took effect: entry …, hash …`,
`Published: commit …, by the merge …`, and `Page: …/HEAD/AGENTS.md`.
These legacy commands do not demonstrate fulfillment of a separately
offered request for review. Use the updated browser's original request
selection and check its recorded result before claiming that outcome.

## 2. Run the Counter, 3:45 to 4:45

**Say, within this minute:** “a merge conflict with the code removed: three agents, one shared state, exclusive turns, an expiry, a restart, every turn signed”.
“Two agents show a handoff. Three is the smallest number that shows a
contested turn, a bystander tracking the shared state, and a restart at
once.”

- **On screen:** three browsers at
  `https://artroom-counting.inguz.workers.dev/counting/`, plus a silent
  controller context. Connect each browser with its own verified public
  binding and matching enrolled key off camera.
- **Do:** select distinct usable voices before arming. Wait for each
  current connection. Click **Arm** in each participant browser. Click
  **Start** once in the controller. Let the browsers take turns naturally.
- **Appears:** the shared count advances. Each speaking browser shows
  **Playing** then **Reporting**. The others track the shared count.
  The retained run advanced from 0 to 5; a separate native read verified
  five accepted completions. Daniel and Karen appeared in playback.
  Samantha did not speak in that run.
- **Heard:** **to be confirmed** by Hugh on the recording devices: distinct
  voices saying successive numbers. Browser speech callbacks are not a
  human listening result. A complete 0-to-10 run and three speaking
  physical devices are **to be confirmed**.
- **Say:** “The same room now coordinates the next count. A device
  promises the next count, speaks it, then records that the promise was
  kept. The other browsers see the result.”

Current evidence: the pre-audio lock repair is reviewed, landed, and
deployed. The later run stopped conservatively at an unknown report
notice. Its original report was preserved; the native history confirms
count 5, then expiry of the next promise. An earlier unexplained page
close remains unexplained. Do not claim either incident was resolved by
the lock repair. Do not replay or clear an uncertain sound for a take.

## 3. Play the procedural jam, 4:45 to 5:15

- **On screen:** `https://artroom-jam.inguz.workers.dev/`, the existing
  procedural page. Show its theme, instruments, and current bar for about
  20 seconds. Keep the page's actual labels.
- **Do:** use the current page's playback control. **To be confirmed:**
  the control's exact label and the resulting screen on Hugh's machine.
- **Heard:** **to be confirmed:** the procedural music through Hugh's
  chosen recording output.
- **Say:** “Here is the procedural jam. The next example puts promises
  around the next bar, using the same words as the Counter.”

The deployed procedural page is the current fallback. Do not narrate
native promises, a synth agent, model improvisation, microphone input,
or human collaboration as events that happened in this procedural clip.

## 4. Return to the repository and check it, 5:15 to 6:15

### 5:15 to 5:35. Show GitHub as the linked host

- **On screen:** the take's public repository under `generalbusiness-ai`
  on GitHub, with its initial commit and published changes.
- **Do:** open the URL printed by this GitHub-backed take's clone.
- **Appears:** **to be confirmed:** today's fresh rehearsal's repository
  and commits. The [8 October GitHub transcript](2026-10-08-demo-github-transcript.md)
  observed all 26 shots, but is evidence for that earlier room.
- **Say:** “The same record can run with GitHub as its repository host.
  The room still applies the team's rules.”

Prepare this room off camera with:

```sh
  artroom install --plan <base-url> --host github.com --namespace generalbusiness-ai
  # The operator pins this new register in GITHUB_APP_CONFIG.
  artroom install --planned
  artroom claim <github-take-name> --handle @hugh
```

### 5:35 to 6:15. Show the verifier

- **On screen:** the take's terminal. Cut the wait, not the result.
- **Do:** run the verifier on the room used in the take.

```sh
  artroom verify --all
```

- **Appears:** the 8 October default rehearsal printed each history
  `consistent.` and `All consistent: 12 scopes.` **To be confirmed:**
  the new take's actual count and lines. The narrated concurrency example
  adds no room or verifier result. Never require twelve if the take has
  more rooms in its record.
- **Say:** “The verifier replays the record and checks each history.
  Nothing you saw depends on trusting our database.” Say that proof line
  only after the take's verifier result supports it. Close with:
  “That is why the Git story can be whatever your team's rules say.”

## 5. Show what is next, 6:15 to 6:40

- **On screen:** one card: “Agents working on a part, with a time limit.
  Changes composed from accepted pieces. Music coordinated by promises.”
- **Do:** hold the card. No new live claim.
- **Say:** “Next, the room gives agents a part to work on and checks what
  they hand in. The same promises can coordinate a musical bar.”

## 6. Check the morning setup and each take

1. Confirm the deployed source and version before rehearsal. Counter's
   observed version is `b693d767-9c8c-47e7-8344-4644e1d13d9f`, from main
   `2614a82a`, with `DEPLOYMENT=artroom-counting-v1`. Core and the isolated
   rehearsal host still served the earlier `3bd` source when this script
   was prepared. Their updated source and provider version are **to be
   confirmed**. Do not describe the newer request-selection repair as
   deployed there until readback proves it. Jam's procedural source is
   `990dcbf`; its provider version is **to be confirmed** at rehearsal.
2. Confirm the intended host's actual settings privately. Preserve
   `DEPLOYMENT`, resource bindings, and secret values. For own Git, check
   `ARTIFACTS_CONFIG` and its actual resource binding. For GitHub, check
   `GITHUB_APP_CONFIG`, the App private key, creation credential, and
   installation access to new public repositories in `generalbusiness-ai`.
   Do not copy an own-Git configuration onto the Counter host, which has
   no `ARTIFACTS` binding.
3. Use a new scratch directory for each rehearsal. The runner creates
   separate `founder`, `member`, and `maintainer` config directories.

   ```sh
    node --import tsx --no-warnings scripts/demo-run.ts <base-url> --host github.com --namespace generalbusiness-ai --scratch <new-scratch-directory> --out <new-scratch-directory>/out --name <unique-room-name>
   ```

   Use the current runner's actual table and keep its transcript. The
   stale-base recording shot is canceled; do not add or run it for this
   narration. Require every observed row to say `yes`. Do not present
   the narrated concurrency example as a measured run. Do not pass
   `--setting-set` as proof of the pin.
4. Arrange the operator's pin before planning. After shot 1, replace only
   the selected host setting's `registerScope` with the printed register.
   Verify the actual setting, preserve the other fields, and continue
   before the printed deadline. The plan lasts 14 minutes. If it expires,
   preserve the original config and start a new plan in another directory.
5. For every camera take, use a fresh room and fresh `ARTROOM_HOME`
   directories for Hugh, Una, and Paul. The runner's room is not the
   camera take. Keep the founder's seat and first clone inside their
   15-minute claim window. Renew an expired one-hour read token through
   the supported clone command. Keep invitations and private keys off
   camera.
6. Prepare Counter with independently enrolled identities and verified
   bindings. Do not treat a new profile as proof that an older audio
   record is empty. Check preserved original custody before a new Start.
   Record distinct usable voices, then Arm explicitly. Test the actual
   screen and audio capture before the take.
7. Check Jam playback and the recording output. Verify that the selected
   page is the procedural deployment. Run the take's verifier after the
   repository sequence and retain its exact result.

Use these fallbacks when a part is not ready:

| Part | Fallback |
|---|---|
| Repository browser action | Use the observed CLI route and show the current page. Mark an older capture as the earlier version. Do not claim an unobserved current browser outcome. |
| Concurrent edit | Narrate the conditional example over the preceding publication page. Identify it as narration; claim no observed stale refusal, second publication, shot count or timing. |
| Counter | Use the bounded observed 0-to-5 evidence with its limits, or shorten the segment to the page and its retained record. Do not claim three audible devices or a completed 0-to-10 run. |
| Jam | Use the current procedural page. If its playback cannot be recorded, omit the sound clip and identify any retained clip as the earlier version. |
| GitHub | Use the retained 8 October transcript and identify the earlier room. Do not present its repository as the new take. |
| Verifier | Show its actual result. If incomplete, state that result and omit the supporting proof claim. |

## 7. Use the same plain words

Use the application's word for the application's thing: issue, change,
assign, merge, branch, and clone for the repository; turn, count,
and next for Counter; theme, instrument, solo, and bar for Jam. Use one
shared plain word for what the room does. Name the rule when naming a rule.

This is the glossary from plan 030:

| Record | Surface |
|---|---|
| scope, entry, act | the room, a step, an action |
| found, claim | create |
| commitment: offered, accepted, fulfilled | a promise: offered, taken, kept |
| hold | working on it, with a time limit |
| plan, concern | the split, a part |
| report, accept-report | handed in, accepted |
| manifest | a version of the change |
| integration commit | the combined commit |
| extent | an area of the repository |
| rules scope, controller | the rules, the person who owns them |
| destination | the repository (the role a repository plays for a room; a Counter or jam room has one too) |
| register, directory, membership, inbox | not said |
| grant | allowed to |
| guard failed with reason x | refused, because x, in plain words |
| reservation, receipt, first head | not said; “published” and “checked” |

Keep room, record, rules, and refused. The shared phrases are “Paul
promised issue #1”, “device B promised the next count”, and “the synth
agent promised the next bar”. Use each only when the shown application
actually records that promise. A comment or assignment alone does not
prove Paul's recorded promise. The current procedural Jam does not prove
a synth agent's promise.

## 8. Keep the existing limits on what to say

Follow [section 8, “Sentences that must not be said”, of the 7 October script](2026-10-07-demo-script-draft.md#8-sentences-that-must-not-be-said).
That section is retained by reference without additions.

## Evidence used for this script

The older exact command lines come from the corrected 7 October script
and the 8 October GitHub transcript. The [9 October capture provenance](2026-10-09-demo-captures/README.md)
identifies recorded test answers and keeps them separate from hosted
outcomes. Today's Core publication is retained in gitseq assertion
`74f8ee25360d5ce3dfc5c246c04760d1d38c6e02`: the independent native read
and distinct browser read prove its publication, while its request for
review remains open. Today's Counter read proves native head 34, count 5,
five fulfilled promises, and expiry of the promise for count 6. It does
not prove human audibility or three physical devices.

Tracked by request `f77085ed223a7f96f86c6b89ec0ce72c99d6a355`, amended
by `abbf07f37c37820f39bf8d87c0e248a8540ea740` and
`c46cf5946184b4cfeef8264bd8954c403d7fc512`. This is a note only.
