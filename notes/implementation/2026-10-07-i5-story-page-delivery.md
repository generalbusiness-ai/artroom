# I5: the story page on the demo base, served by the scope Worker, delivery

2026-10-08. Branch `claude/story-page-edit-command-j0clah` (the name this
session may push; the brief's local name was `i5-edit-page`), opened from
`origin/planner/i5-demo-host` at `13ae3055`, whose history is unchanged.
Built alone in a cloud container with no binding, no deployment
credentials and no workroom, so no gitseq request was opened or updated;
the planner owes that. Nothing was deployed.

Labels: **[code]** read from code, **[run]** confirmed by a run in this
container, **[inferred]** not checked.

The brief held a second task, "a one-file change, proposed from the
command line ...". That work (`artroom edit`, `propose-file`, the
destination's publication of a one-file change on both hosts, its test
`packages/lanes/test/edit.scope.test.ts`, and its note
`notes/2026-10-07-i5-edit-page-delivery.md`) is already on the demo base
[code]. I did not build it again. This branch uses it: the page's story
runs `artroom edit` and shows what it made.

## 0 The merge

`git merge origin/request/i5-page` (head `4440459a`) conflicted in three
files [run]:

- `packages/cli/test/story.scope.test.ts` and `docs/cli.md`: I kept the
  demo base. On the base, `artroom act` sends a value beside an act with
  `--value`, so `open-issue` with the definition's bytes is refused by the
  guard's name, `guard-failed (not-activated)`, and without them
  `bad-field`; the base's test already expects both. The page branch's
  commit `be49557` (expect `bad-field`) and its line "act sends no value"
  were older than `--value`, and are dropped. I also put the example line of
  `docs/cli.md` back to `guard-failed (not-activated)`, which the page
  branch had changed.
- `docs/testing.md`: both paragraphs kept; the page's was then rewritten
  (section 5 of this list).

**The command line's story.** The brief says it fails one assertion at the
base. At this branch's head it passes: `npx vitest run --project scope
cli/test/story`, 1 passed [run], and in the gate [run]. So I settled the
question as the base already had: the refusal by name is right when the
bytes are sent, `bad-field` is right when they are not, and the test checks
both (lines 153 to 161). I did not run it at `13ae3055` itself; this branch
changes no code it runs except four `export` keywords in
`packages/cli/src/commands.ts`, so I expect it passes there too [inferred].

## 1 What is built, by test title

### A. The repairs to the page's data functions (`packages/page/src/data.ts`) [code]

| Was | Now |
|---|---|
| `openRoom(session, directory)` read the directory with no reader, which the deployed readers refuse `forbidden`. | `openRoom(session, place)`. A `Place` is the directory's ID and membership's `ScopeRef` with its incarnation, which a session request names. `placeOf(text)` reads it from an invitation link or from the command line's `config.json`. The page asks membership for a session first, then reads the directory with it. |
| No signed reads. | Every handle is over the client's `signedReads` transport: with no session, each summary, history, entry, log and retained read is signed by the caller's key, as the command line does. `Room.unsessioned` says why membership gave none. |
| A session was asked once. | `fresh(room)` asks again before a read when the session ended or ends within ten seconds (sessions last 600 seconds). |
| No way to enrol a key. | `joinRoom(session, link)` signs membership's `join` with the link's invitation and secret, reading the act from membership's version that the link names, as `artroom join` does. `linkOf`, `Link` and `LINK` are exported from `packages/cli/src/commands.ts` for this. |
| `act` sent no value, so `open-issue` and `open-pr` were refused `bad-field`. | For a field whose declaration states a value place in the domain of a definition, `actsOn` lists the definitions the rules scope holds active as `choices`, and `act` reads the chosen definition's bytes from the rules scope (`retained`, kind `definition`) and sends them as `values`. Any other domain stops before signing. |
| A version showed base, integration and tree. | `Manifest.file`: a one-file version's path, digest, size and `page`, the site address `<service>/site/<directory>/HEAD/<path>`. `siteAddress` and `loadSite` read the published site. |
| `listLanes` took a lane's state from its summary, else the directory's advisory row. A merged proposal is final and leaves the summary, so a merged change showed `open`. | It reads the main item from the scope's retained final items when the summary lacks it. Found by the story [run]. |

The view (`view.ts`) shows the file, size, digest and the link, a link to
the published site from the room screen, a choice list for definition
fields, and on every screen whether reads present a session or are signed.
`main.ts`: the room screen now has the directory's acts panel; Settings take the base URL (empty means the page's own origin),
the room (a link or `config.json`) and the key; "Make a new key" and "Join
with the invitation link". A slower, earlier draw no longer replaces a
later screen (found by the screenshot script's first run [run]).

### B. The route and the bundling [code, run]

- One registration: the deployed Worker's default `fetch` in
  `packages/scope/src/worker.ts` now sends `/page` and `/page/...` to
  `page(request)` of the new `packages/scope/src/page.ts`; `/site/` and
  every other path are as before.
- `/page` redirects to `/page/`; `/page/` is the HTML; `/page/page.js` the
  script; any other path `not-found`; a method other than GET or HEAD `405`.
  Each file carries `content-security-policy: default-src 'none';
  script-src 'self'; connect-src 'self'; style-src 'unsafe-inline';
  img-src 'self' data:; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'` and `x-content-type-options: nosniff`.
- **Committed, and checked in the gate.** The page package's existing
  `build` script is now `node scripts/assets.mjs`: esbuild 0.28.1 (already
  in the lockfile), minified, writes `dist/index.html`, `dist/page.js`
  (291,558 bytes [run]) and `packages/scope/src/page-assets.ts` (about
  306 kB), which is committed. `packages/page/test/assets.test.ts` builds
  again in memory and fails while the committed module differs. The scope
  package does not depend on the page package; only the generated module
  sits in its source.

### C. Tests [run]

Each passed in the gate run of section 4.

| Test (file) | Shows |
|---|---|
| "the page's data functions against the Worker's routes as deployed: join with a link and a session from membership; signed reads where no session is given; open an issue with the definition's bytes; an edited README merged, published and read back from the site; AGENTS.md waiting for the controller, refused by name, then published; a refusal by guard name with nothing written; the acts by role; the rules (STAND-IN: the Git host and the scheduler)" (`packages/page/test/story.scope.test.ts`) | On a room that the command line founds (`test/support/demo.ts`), with the real read sessions: `placeOf` of `config.json` and of the link give the same place; a stranger's key is refused a session and its signed read of the directory is `forbidden`; una joins on the page with a page-made key and opens the room with a session, as `@una (member)`; a second join with the link is refused; with no session secret, rita's page reads by signed reads (`sessions-unavailable`) and una's read of the directory is `forbidden`; una opens issue 1 through the page, with the issue definition's bytes read from the rules scope; paul comments; the acts by role (paul may comment, una may not assign, rita may); rita's `artroom edit README.md` shows as a merged change with file `README.md`, 37 bytes, its digest and site address, merge and publication `published` at the host's head, "publication confirmed", and `loadSite("README.md")` returns 200 with the rendered heading; paul's `artroom edit AGENTS.md` shows `rules-not-met:rules`, "policy not met" for the extent rules, nothing pushed and the site 404; paul's own `review-verdict` is refused `guard-failed (author-cannot-review)` with the head unmoved; rita approves for rules and paul merges, both through the page; the change is merged, a new head is pushed and the site serves AGENTS.md; the rules (approvals 0, controller `@rita`, the three extents, both demo digests active; `publish` offered to rita, not paul); after 601 seconds on the scripted clock the page renews una's session and reads on. |
| "the Worker serves the page at /page/: its HTML and script under a same-origin script policy; /page redirects; another file is not-found; a POST is refused; /v1 is not the page's" (`packages/scope/test/page-route.test.ts`) | Through the deployed Worker's default export. |
| "the scope Worker's page module is the page's build of this source: ..." (`packages/page/test/assets.test.ts`) | As in B. |
| `states.test.ts` (four tests, unchanged) | The states the story does not reach. |

**Controls**, each by hand (one line changed, the story run alone, the
file restored) [run]:

| Change | Result |
|---|---|
| `act` sends no values | fails by assertion: `open-issue` answered `refused`, `bad-field` instead of accepted. DISTINGUISHES. |
| `listLanes` reads the summary only | fails by assertion: the README change is `open`, not `merged`. DISTINGUISHES. |
| `fresh` never renews | first run failed by a thrown `Unreadable` (inconclusive); I made that read an assertion (`resolves`), and then it fails by assertion: "promise rejected ... instead of resolving". DISTINGUISHES. |

**Screenshots** [run], in `packages/page/test/screenshots`, through the
container's Chromium (`/opt/pw-browsers/chromium-1194`) with
`playwright-core` 1.56.1 installed in a scratch directory outside the
checkout: `issue.png` (una), `change-refused.png` (paul's AGENTS.md change,
policy not met, with his review refused by the lane in the browser),
`change-published.png` (the README change with its file and link; the top
1,500 pixels, since the whole page is over the script's 300 kB bound),
`rules.png`, `site-readme.png` (the rendered README reached by the
change's link). The browser loads the page at `https://scopes.test/page/`
from the answers that the deployed Worker's entry gave to `/page/` and
`/page/page.js`, with their headers, and every read from answers the
recorder (`record.scope.test.ts`, `PAGE_RECORD=1`) took on the same room.
No request went unanswered.

### D, E. Documents

`docs/page.md` rewritten for `/page/`, signing in, sessions and signed
reads, definition bytes and the one-file version; a section "The page" in
`docs/deploy.md`; the page's paragraph in `docs/testing.md`.

## 2 The live procedure

[code; nothing here was run against the deployment]

1. Gate this branch and deploy the scope Worker as before
   (`docs/deploy.md`). The page needs no new binding, setting or secret.
   It deploys with the Worker.
2. Check the route: `curl -sI <base>/page/` answers 200, `text/html`,
   with the policy above; `curl -s <base>/page/page.js | head -c 100`
   answers script.
3. Open `<base>/page/#/settings` in a browser.
   - **As the founder, or any member of the command line:** leave the base
     URL empty; paste the content of `config.json` from the command line's
     config directory as the room; paste the content of
     `keys/operator.key` (the founder) or `keys/device.key` (a member who
     joined) as the key; "Keep in this browser".
   - **As a new member on the page:** `artroom invite @<handle> --role
     member` on the command line; paste the printed link as the room;
     "Make a new key"; "Join with the invitation link".
4. Expect the room screen with "Reads present a read session from
   membership." If it says membership gave no session, the reason follows
   in brackets: `sessions-unavailable` means the deployment has no
   `SESSION_SECRET` or `DEPLOYMENT`.
5. The demo: on the room screen, "What you may do here" offers
   `open-issue` with the active issue definition to choose; then
   `artroom edit README.md --file <file>` on the command line; then the
   change from the room screen, its "Rendered page" link, and the
   published site from the room screen. A room on a register founded at
   `@1` has an `@1` directory, whose `open-issue` states no value place;
   the page then sends no bytes, as that directory expects [inferred from
   the definition-versions note].

## 3 Stand-ins and limits

- **The Git host** in the story and the recorder: `OwnGit` of
  `packages/scope/test/hosts.ts`, under the production wiring of the
  hosting own Git service's ports. GitHub's provider is not run by the
  page's tests; `edit.scope.test.ts` runs both [code].
- **The scheduler**: `pause` in `support/demo.ts` drives the operations
  drivers and dispatchers [code].
- **The session secret** is a TEST SECRET; the signed-read step sets none,
  so the deployed path (`sessions-unavailable`) answers [run].
- **The screenshots** were taken at `7909bea2`, before the room screen's acts panel, which no screenshot shows; they are of recorded answers, not a live service; the
  browser's refused act got the answer the Worker gave to the same act in
  the recorder [code, run].
- **The page has not talked to a live scope Worker** [run: none exists
  here].
- The key in local storage: any script of the Worker's origin can read
  it. The page's policy allows this origin's scripts only, and the site's
  pages run none; a future route on the same origin that serves script
  would change that [code].

## 4 Gate

`npm run gate` at head `ccd86e35c28fbf6b699a59965819dbb4f71dafae`, tree
`98d7703fbd3f5c92fce988a7652d56d3be883230`, with this note the one
uncommitted file. Machine: a cloud container with 4 CPUs; load average
0.47 before, 1.16 after; `node_modules` installed from this lockfile, so
install was skipped [run]. (An earlier run at `7909bea2`, before the room
screen's acts panel, gave the same result: 811 tests, T36 the one failure
[run].)

| Step | Exit | Elapsed seconds | CPU seconds |
|---|---|---:|---:|
| Install | skipped | | |
| Whitespace | 0 | 0.0 | 0.0 |
| Typecheck | 0 | 12.6 | 40.5 |
| Tests | 1 | 120.7 | 162.3 |

The test runner: 119 files (1 failed, 117 passed, 1 skipped), 811 tests (1
failed, 809 passed, 1 skipped); its own duration 118.31 seconds. The
skipped test is the recorder. **The failure is T36 of
`packages/checkers/test/runner.test.ts`**, which this branch does not
touch, under this container's `git version 2.43.0`, as the brief says.
Because the tests failed, the gate did not run its last script; alone at
the same head, `node --test scripts/active-source.test.mjs`: 6 tests, 6
passed [run].

This note was written after the gate run and changes no source or test.

## 5 What is owed

1. **The gitseq request** for this work, and the review. `notes/.keep-i5-story-page`
   (the push check) can go when it lands. The brief's
   `notes/.keep-i5-edit-page` already existed from the edit-page work.
2. **The room screen's acts panel** (the directory's acts, which offer
   `open-issue` and `open-pr`) was added after the story; the story opens
   the issue through the same `act` function, and no screenshot shows the
   room screen [code].
3. **`propose-file` from the page** is the generic form only (section 5
   of `docs/page.md`).
4. **For the reviewer's decision:** `page-assets.ts` is a committed,
   generated file of about 306 kB that changes with every page source
   change. The alternative, building it in the gate, would make the scope
   package's tests depend on a build step.
5. **For the reviewer's decision:** `screens.mjs` bounds each screenshot at
   300 kB, so `change-published.png` is the top of the page only.
6. **Live updates** and **cross-origin** remain as in `docs/page.md`.

## 6 Decisions followed

- Served from the scope Worker at `/page/`, static files bundled into it,
  no second deployment [code, run].
- Signs in with a key in local storage and a session from membership;
  signed reads where membership gives none [code, run].
- Shows issues and changes with their states and refusals by name, a
  change's one-file manifest and a link to its rendered page, and the acts
  the member may sign now from the definition and the role (`heldActs`);
  it chooses no binding and judges no guard [code, run].
- No other route invented: the page uses the session, read, act, retained
  and site routes as they are [code].
- Nothing deployed; `package.json` and the lockfile unchanged but for the
  page's own `build` script line; `playwright-core` ran from a scratch
  directory [run].
- Plain English, no em-dashes; no product named but GitHub; "takes
  effect" [code].
- Small commits, each pushed [run].

## 7 Candidate preservation repairs, 2026-10-08

On candidate `3157859665e5531a3f94b124ccec00d2994c01ad`, carry the
already reviewed page source from
`e7901bae257b6cd4366a893ec1b9b6920dd6c2de`: exact `src/data.ts`,
`src/main.ts`, `src/view.ts` and `test/join.test.ts` under `packages/page`.
No older Worker, platform, CLI or site source is transplanted.

The page refuses incomplete summaries, refused/truncated/budget-exhausted
item/history projections and mixed heads rather than displaying empty results.
An actual returned submit answer is saved in memory before awaited refresh,
bound to service/directory/membership/key/scope; failed refresh and view redraw
keep the known answer and separate unknown observation with inspect-before-new-act
guidance. This is memory-only and supplies no missing reply or durable recovery.
The version view rejects invalid edit paths and does not offer a HEAD link as
an immutable proposed/published version preview. Latest-site navigation remains
explicit; exact eligible version rendering is still owed to the site owner.
Invitation encodings must match configured service, full native references and
an explicit supported membership hint before signing; this is no provenance
proof and does not implement pre-enrollment discovery or saved join recovery.
The settings room text survives key-generation redraw in memory and is cleared
on save; it is not persisted as an invitation secret.

The existing locked tooling, borrowed with local workspace links and no package
installation, built `packages/scope/src/page-assets.ts` from this composition.
One focused page batch passed seven tests in three files; all page source, Node
test and scope-test TypeScript configurations passed. Raw local logs:
`/tmp/artroom-candidate-page-build.log`,
`/tmp/artroom-candidate-page-focused.log`,
`/tmp/artroom-candidate-page-types.log`. The new join/read/answer witness uses
scripted HTTP and a minimal DOM stand-in; it proves no browser/provider or
real enrollment/publication. No whole gate, provider, browser or cloud ran.

The five-line page-route query witness is carried with the separately owned
Worker ingress repair. This branch does not change `worker.ts`, and that
witness has not been run against the unguarded candidate here. The combined
Worker must reject credential-bearing URLs before dispatching to site/page,
while preserving the candidate's site and scope routes. Final composed route
verification and the candidate's one gate/review remain owed. The claim name
header is held pending its owner-selected signed founding schema.

## 8 No-session story expectation, 2026-10-08

On combined candidate `4c9cf99fa1d6e2cd8587b5dddee0832e3614a56d`, the
existing page story failed at its deliberate no-session rules view:
`loadRules` now reports `definition items ... forbidden`. This is the
production limited signed-read contract, not a missing incarnation or
session-wiring authorization. `SIGNED_READS` supports summary/history/entry/
log/retained, not item enumeration; the page's strict complete enumeration
correctly refuses rather than returning a partial list. The fixture already
uses the real session wiring and full birth references.

Only the story expectation changes: the no-session founder summary/read
phase remains valid, and the complete rules view explicitly reports
Unreadable. The later real membership-session phase still reads both active
definitions, extents, controller and grants; its session is now explicitly
asserted present. Existing enrollment, member denial, two edited publications,
controlled refusal, role and session-renewal assertions remain intact. No
product source, authority, full-incarnation guard, read grant or test bypass
changes. No unknown definition list is relabelled empty.

The original story run is retained in
`/tmp/artroom-page-story-authority-before.log`. The corrected complete story
passes once in `/tmp/artroom-page-story-authority-after.log`. A focused
control returns partial rows on refused enumeration and fails the new
rejection assertion because the promise resolves instead; its log is
`/tmp/artroom-page-story-authority-control.log`. Source was restored after
that control. All three page TypeScript configurations pass in
`/tmp/artroom-page-story-authority-types.log`; the existing testing guide
is unchanged from the already read candidate. No whole gate, cloud, browser
or provider ran; the host and scheduler remain labelled stand-ins.

## 9 Settings service origin, review F5, 2026-10-08

Planner decision `158be2c4800db1753af32e60674591ff17464cde`, following
review `376aa53064b8adae9b330d5d655f5fb019b6b168`, selects refusal of
unsupported service-origin changes for this landing. On base
`68be1ffeb3d64094232ec7f8e4373629f8527c07`, Settings now reports
"Unsupported service origin" when the chosen base URL has another origin.
The actual Settings handlers validate it before saving key/room/service
state, changing the memory room draft or sending a join. A loaded older
cross-origin setting is refused before opening a view or sending requests,
without pretending it works. Empty service still selects this page's own
origin; explicit own-origin service settings still save. No CSP, scope route,
transport authority, grant or read permission changes. The explicit data
client's service remains usable by its existing scripted/real-scope tests.
The original reviewed cross-origin functionality and trust-boundary obligation
remain owed; this local refusal neither implements nor waives them.

`settings.test.ts` exercises actual main-module Settings handlers with a
minimal DOM/localStorage stand-in. It checks unchanged saved state and zero
requests after unsupported save/join/new-key actions, own-origin default
saving, and older saved-setting refusal before view I/O. One focused test
passes in `/tmp/artroom-page-service-setting-focused.log`; disabling the
origin check fails its state/no-request assertion in
`/tmp/artroom-page-service-setting-control.log`. Source is restored. All
three page TypeScript configurations pass in
`/tmp/artroom-page-service-setting-types.log`. No browser/CSP enforcement
proof, provider/cloud call, whole suite or gate is claimed.

F3's join-answer category body and docs/page.md's general refusal wording
are separate repairs. This preparation changes only the main settings
regions, a data helper, the service-settings documentation and this note.
The final combined source must rebuild page-assets once after both main
patches are assembled; the inherited generated bundle is not this F5 source.
The final combined source-correct gate and independent successor review
remain Root's landing duties under request 86206b55.
