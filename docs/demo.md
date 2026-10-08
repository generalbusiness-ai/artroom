# Rehearsing the demo

The demo runner plays the middle of the demo script
(`notes/2026-10-07-demo-script-draft.md`) against a deployment, as three
people with three fresh config contexts on one system, and writes down
what each command printed. It does not verify hardware identity. The
captures script then takes pictures of the room's page. Run both the
evening before a recording, and again on the morning of it.

## What the runner does

`scripts/demo-run.ts` runs 26 shots in order. Each shot is one command
line, called as the command line's own function with that person's config
directory, or one read of `git log` or of a page. The people are the
founder `@hugh`, a member `@una` and a maintainer `@paul`, each with a
fresh config directory.

| Shots | What happens | Script shot |
|---|---|---|
| 1 to 3 | The founder plans the install, the operator pins the register, the founder installs as planned and claims a room | 3 |
| 4 to 6 | The founder publishes the rules (no approval for the source extent; the rules extent needs the controller) and activates the issue and change definitions of the demo profile | the checklist of section 6 |
| 7 to 10 | The founder invites the member and the maintainer; each joins | 4, 5 |
| 11, 12 | The member clones with a read token from the room, and reads `git log --oneline` | 6 |
| 13 to 15 | The member opens issue #1, the maintainer comments, the founder assigns it to the maintainer | 8 |
| 16 | The maintainer edits `guide/start.md` with `--closes 1`: published, and the issue closes | 8 |
| 17 to 19 | The maintainer edits `AGENTS.md`: refused `rules-not-met:rules`; the founder approves for the rules extent; the maintainer's merge publishes | 10, 11 |
| 20 | The maintainer edits `../outside.md`: refused `path-invalid` | 10 |
| 21, 22 | `artroom issues` shows #1 closed; `artroom verify --all` reports twelve scopes consistent | 8, 12 |
| 23 to 26 | The site's front page, the two published pages, and the room's page at `/page/` | 7, 9, 11 |

Each shot states the exit code and the lines it expects, taken from the
observed run of the 23:00 sprint report. An expected line is a template:
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
   founded for 14 minutes. Preserve the other setting fields and secrets,
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
must be current. The GitHub adapter supports all 26 shots, including
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
token is never printed by `artroom clone`, and keys are shown by their
key IDs only. The keys stay in the config directories, readable only by
their owner.

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
`packages/page/test/screens.mjs` does for the page's own screenshots.

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
4. After the take: `artroom verify --all` on the take's room. The current
   deployment capture form supports homes with the runner's bound native
   observations; a manually created take home without them is unsupported.

## In the tests

`packages/lanes/test/demo.scope.test.ts` runs the same rehearsal on the
test Worker, on real scopes, and asserts that every row of the table says
"yes" and that the transcript holds no secret. It covers both host paths
through their production wiring. Its stand-ins are the Git host (`OwnGit`
or GitHub's `Hub`), `git` and the scheduler; the operator's setting is the
test wiring the stand-in host to the planned register. The recorder in
the file serves `demo-captures.ts --recorded`; it runs only
with `DEMO_RECORD=1`, and is skipped by name otherwise.
