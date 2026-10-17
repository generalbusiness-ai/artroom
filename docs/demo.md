# Rehearse the demo

The demo runner plays the middle of the demo script
(`notes/reports/2026-10-07-demo-script-draft.md`) against a deployment, as three
people with three fresh config contexts on one system, and writes down
what each command printed. It does not verify hardware identity. The
captures script then takes pictures of the room's page. Run both the
evening before a recording, and again on the morning of it.

## What the runner does

`scripts/demo-run.ts` runs 27 shots in order by default. Each ordinary shot
is one command line, called through the CLI with that person's config
directory, or one read of `git log` or a page. The concurrency shot records
each of its commands and exits. The people are the
creator `@hugh`, a member `@una` and a maintainer `@paul`, each with a
fresh config directory.

| Shots | What happens | Script shot |
|---|---|---|
| 1 to 3 | The creator plans the install, the operator pins the register, the creator installs as planned and claims a room | 3 |
| 4 to 6 | The creator publishes the rules (no approval for the source extent; the rules extent needs the controller) and activates the issue and change definitions of the demo profile | the checklist of section 6 |
| 7 to 10 | The creator invites the member and the maintainer; each joins | 4, 5 |
| 11, 12 | The member clones with a read token from the room, and reads `git log --oneline` | 6 |
| 13 to 15 | The member opens issue #1, the maintainer comments, the creator assigns it to the maintainer | 8 |
| 16 | The maintainer edits `guide/start.md` with `--closes 1`: published, and the issue closes | 8 |
| 17 to 19 | The maintainer proposes `AGENTS.md`: refused `rules-not-met:rules`; the creator approves. Before merging it, the maintainer proposes the second file on the same published base, then publishes `AGENTS.md`. Each command and exit is recorded. | 10, 11, concurrency |
| 20 | The maintainer merges the already-proposed second file: refused `out-of-date`; the same maintainer re-proposes it as a new change on the new head and publishes it. The refused lane remains in the record. | concurrency |
| 21 | The maintainer edits `../outside.md`: refused `path-invalid` | 10 |
| 22, 23 | `dap issues` shows #1 closed; `dap verify --all` reports fourteen scopes consistent | 8, 12 |
| 24 to 27 | The site's front page, the two published pages, and the room's page at `/page/` | 7, 9, 11 |

### What the concurrency shots show

Two changes are proposed on the same published base. The first publishes.
The second is refused `out-of-date`, and its lane stays in the journal.
The room settles the race by reservation and judgment at the destination.
Both changes target the destination's one repository; only the first is
published on that base. A fork for each hold is not built
([hosts](hosts.md)).

Each shot states the exit code and the lines it expects. The isolated
GitHub rehearsal `github27-freeze-two`, run on 12 October 2026 UTC,
observed the new stale-base row at source `c8cb6c538`. All 27 shots ran;
25 matched, including fourteen consistent scopes. The front-page and
`AGENTS.md` reads returned HTTP 502. One later anonymous read of each
returned the expected HTTP 200, content type, title and page text. Those
later reads are separate evidence; the original run remains failed.
The controlled change and the
stale change name the same earlier published base. Both proposals
take effect before the controlled publication; the second merge follows it. The result's
`staleRefusal` field and transcript report runner-local elapsed milliseconds
from invoking that merge command to its expected `out-of-date` return,
using `performance.now()`. They label the date, service and Git host. This
includes CLI work and round-trip waiting, excludes the fresh proposal and
publication, and is not server-only latency or a native journal fact.
Injected test clocks are labelled separately. The freeze route uses a
new change lane; same-lane manifest replacement remains separate work
under plan 029.

Observed run, runner timer: **2,586.628125 ms**, measured with
`performance.now()` at `2026-10-12T01:40:23.340Z`, against
`https://artroom-rehearsal.inguz.workers.dev`, with Git host `github.com`.
Subsequent signed native reads confirm the shared old base, retained
out-of-date refusal, same proposer, distinct fresh lane and publication
on the winner's commit. Native timestamps corroborate the recorded CLI
sequence; they do not define a global order across scopes.

An expected line is a template:
`<name>` is any text without a space, `<...>` is any text, and `{name}` is
a value that an earlier line printed, such as the change's scope ID. A
later shot types those values, so the runner needs no help from the
operator after the setting.

The runner continues after ordinary output mismatches while it can. If a
newly captured scope identity is missing or disagrees with its saved
configuration, it stops later commands and hooks. It also marks a shot
"not run" when an earlier shot did not print a value it needs.

## How to rehearse a deployment

The runner uses Node 22 or later with the `tsx` loader already declared
by the current CLI workspace. No package is installed by the runner.
The older standalone runner delivery lacks that dependency declaration;
it needs the current CLI dependency integration before these commands
are usable from a fresh install.
```
node --import tsx --no-warnings scripts/demo-run.ts \
  https://<service> --host artifacts --namespace artroom-demo \
  --scratch /tmp/rehearsal-1 --out /tmp/rehearsal-1/out
```

1. The scratch directory must be new or empty. The runner makes
   `founder`, `member` and `maintainer` in it, one config directory each,
   and `work`, which holds the local files and the member's clone.
2. After shot 1 it prints the planned register ID and waits. Set
   `ARTIFACTS_CONFIG.registerScope` to that ID for `--host artifacts`, or
   `GITHUB_APP_CONFIG.registerScope` for `--host github.com`
   ([deploy.md](deploy.md), "Plan"), then press Enter. The plan can be
   created for 14 minutes. Preserve the other setting fields and secrets,
   including `DEPLOYMENT`. The runner records the operator's Enter as a
   confirmation; it does not inspect the deployment's setting.
3. It prints each shot as it ends, with "matches" or what differs.
4. It writes `transcript.md` and `room.json` in the output directory, and
   exits 0 when every shot matches and 1 otherwise.

For the GitHub adapter, run the same shots and transcript format:

```
node --import tsx --no-warnings scripts/demo-run.ts \
  https://<service> --host github.com --namespace generalbusiness-ai \
  --scratch /tmp/rehearsal-github-1 --out /tmp/rehearsal-github-1/out
```

Arrange the pin step with the deployment operator before starting. The
App installation must cover the new repository; the creation credential
must be current. The run asks the GitHub adapter for all 27 shots, including
the member's one-hour read token, clone, publications and site reads, so
none is skipped for this host. A missing setting, expired credential or
unexpected provider answer is a mismatch to investigate, not an
unsupported shot to hide. The run creates a repository and keeps it;
the runner does not delete repositories or revoke the deployment's
credentials afterwards.

`--setting-set` skips the pause only. Shot 1 still makes a fresh signed
plan and prints its register ID; this flag neither uses an earlier plan
nor proves that its register is pinned. Use the interactive pause for
the coordinated GitHub run.

`--name <room>` names the room; the default is `rehearsal-` and the month,
day, hour and minute. The runner prints no secret: an invitation link is
cut to its first eight letters on screen and in the transcript, the read
token is never printed by `dap clone`, and keys are shown by their
key IDs only. The keys stay in the config directories, readable only by
their owner.

## Proposing a committed two-file branch

Add `--manifest` to opt in to five shots immediately after shot 16. The
creator activates the current manifest-list demo definition. In the
member's clone, the runner pulls the room's head, creates `two-pages`,
writes two UTF-8 Markdown files and commits them with Git. It records
these local Git commands and their outputs explicitly. The maintainer
runs `dap propose two-pages` in the same local clone and proposes both
committed files as one change, expecting publication. dap writes its own integration commit; the local commit
is source preparation, not a commit made by a dap command.

The next preparation checks out `main` and pulls again, observing the
room's integration commit, then creates `two-controlled` with `AGENTS.md`
and a second text file. The maintainer's proposal must be refused
`rules-not-met:rules`, with neither file published. The remaining
scenes use the manifest-list definition; the explicit later merge prints
its publication line without the legacy convenience page line.

The optional run has 32 shots and verifies 16 scopes; the default run
keeps its 27 shots and 14 scopes. Both flags can be used together:
`--manifest --pace` waits before the preparation steps too.

The Node runner uses actual local Git in the member's `site` clone.
The real-scope rehearsal tests label preparation and branch capture as
stand-ins. Their published and refused outcomes prove the scopes' behavior
from those captured bytes; they do not prove Git capture or a deployment.
The manifest-tree scenario separately witnesses the required check on the
recorded reservation. The demo profile has no required check configured.

## Recording

Add `--pace` to either deployment command above. Before each runnable
shot, the runner prints its number, title, script shot, person and the
command about to run, then waits for Enter. Narrate the shot and press
Enter when the recorder is ready. Invitation links remain cut on screen.
The separate register-setting pause after shot 1 still applies; finish
pinning and installing within the plan's printed expiry.

The transcript keeps its existing format. The pause before a shot is
outside that shot's duration. At the end, the terminal prints the
observed total elapsed seconds, including operator waits, setup and
capture observations, and separately the sum of recorded shot seconds.
The sum is not the elapsed time of the whole run.

## What the transcript shows

For each shot: its number and title, the script shot it shows, who ran
it, when it started, the seconds it took, the command as typed, every
line it printed, the exit code, and whether the lines match. Below the
shots, one table: shot, expected, observed, match. A recording uses the
observed lines; a shot whose row says "no" is not recorded until it is
understood.

## The captures

`scripts/demo-captures.ts` opens the page at `<base-url>/page/` in a
headless browser, signed in with a key from a config directory, and saves
six pictures, each at most 300 kB: `room.png`, `issue.png`,
`change-refused.png` (the `../outside.md` change), `change-published.png`
(the `guide/start.md` change), `rules.png` and `site-page.png` (the page
as the site renders it). It also writes `captures.md`, which lists them.

The deployment form requires the owner-home `capture-observations.json`
that a successful current runner writes. Before loading the key, captures
bind the service and room hints to the configured full references and
native returned creation facts. Old room files, a changed config/source,
or a home without those observations fail closed. `room.json` alone does
not establish this association. The pictures are screen observations;
they do not replace the native receipts for publication or closure.

```
PLAYWRIGHT_CORE=<scratch directory> node --import tsx --no-warnings \
  scripts/demo-captures.ts https://<service> --home /tmp/rehearsal-1/founder \
  --room /tmp/rehearsal-1/out/room.json --out /tmp/rehearsal-1/out
```

The browser automation package `playwright-core` is not a dependency of
this repository: install it in a scratch directory outside the checkout,
and name that directory in `PLAYWRIGHT_CORE`. The browser is `CHROMIUM`,
or the one under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`).
Without either, the script says it skipped and makes no picture.

With `--recorded` in place of the base URL and the two files, the script
runs the rehearsal on the test Worker (`DEMO_RECORD=1`, see below) and
answers the browser with the Worker's recorded answers, as
`apps/room/page/test/screens.mjs` does for the page's own screenshots.

## The order on the recording day

1. The evening before: deploy, then run the runner on a fresh scratch
   directory and the captures on its room. Copy the observed lines into
   the script where they differ, and keep the transcript with the take.
2. The morning: check the setting values and the deployed version
   (section 6 of the script), then run the runner once more. Every row of
   its table says "yes" before the camera starts.
3. Each take: fresh config directories (`ARTROOM_HOME`) on both screens,
   and a new room. The takes type the commands of the transcript in the
   same order; the runner's room is not used on camera.
4. After the take: `dap verify --all` on the take's room. The current
   deployment capture form supports homes with the runner's bound native
   observations; a manually created take home without them is unsupported.

## In the tests

`apps/room/lanes/test/demo.scope.test.ts` runs the same rehearsal on the
test Worker, on real scopes, and asserts that every row of the table says
"yes" and that the transcript holds no secret. It covers both host paths
through their production wiring. Its stand-ins are the Git host (`OwnGit`
or GitHub's `Hub`), `git` and the scheduler; the operator's setting is the
test wiring the stand-in host to the planned register. The recorder in
the file serves `demo-captures.ts --recorded`; it runs only
with `DEMO_RECORD=1`, and is skipped by name otherwise.
