# I5 page: the minimal page for the demo story (gate 3 of plan 024)

Branch `request/i5-page`, opened from `origin/request/i5-lane-wiring` with
`origin/request/i5-client` merged in. Written 2026-10-07 by a cloud builder
with no workroom, no deployment credentials and no network beyond GitHub and
the npm registry. No request is filed for this work yet: the local colleague
files it with gitseq and the review. Nothing is deployed and nothing is
published.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** not run or read directly.

## 0. The merge of the two branches

- `git merge origin/request/i5-client` conflicted in one place,
  `docs/testing.md`: both branches added a paragraph before the lane
  scenarios' paragraph. I kept the client's paragraph and the lane wiring's
  wording of the next one ("The lane scenarios", not "The eleven lane
  scenarios"). Nothing else conflicted. [run]
- The merged tree failed one assertion of the command line's story
  (`packages/cli/test/story.scope.test.ts`): `open-issue` with no
  definition bytes is now refused `bad-field`, not `guard-failed
  (not-activated)`, because the lane wiring's commit `c6fe198` states a
  value place for the definition's bytes, and a missing value is refused
  before any guard. It failed the same way with my later changes stashed.
  [run] Commit `be49557` changes that expectation and two lines of
  `docs/cli.md`. It means neither the command line nor the page can open a
  lane today (section 5, item 1).

## 1. What is built

### By screen

`packages/page` is new: plain TypeScript and DOM, no framework, one bundle
by esbuild 0.28.1, which the lockfile already held. [code, run]

| Screen | Address | What it shows | Read from |
|---|---|---|---|
| Room | `#/` | The room's issues and changes, by number, title and state | The directory's `lane` index rows, and each lane's own main item [code] |
| Issue | `#/issue/<scope>` | Number, title, state and close reason, opener, assignees, conditions, body, comments | The lane's summary, its retained final items, and its detached texts [code] |
| Change | `#/change/<scope>` | Where it stands (plan 016's states); the current version; reviews by extent against the extents of the rules the lane holds; review requests; checks; links; each merge with the destination's publication and its outside operations; comments | The lane, and the destination's publication items and history [code] |
| Rules | `#/rules` | "The rules of this room": revision, approvals, extents (class, approvals, approver, checks, paths), the single-controller exception, required checks, labels, active definitions; the line that a controller may change them, naming the members whose role holds `rules.publish` | The rules scope's `rules` and `definition` items, and membership's roster [code] |
| Settings | `#/settings` | Base URL, directory scope ID, key | The browser's local storage [code] |
| Acts panel | under issue, change and rules | Each act the signed-in member may sign now, as a form that signs and sends it; the scope's answer, and for a refusal its reason, guard name and the unmoved head | `heldActs`, the command line's own function, over the definition and the member's role [code] |

The acts are not hard-coded: the page lists the definition's acts whose
grant action the member's role holds, and those a rule decides, exactly as
`artroom acts` does. Commit `a2465d4` exports that computation
(`heldActs`, `standing`, `expectedOf`, `valueOf`, `describe`) from
`packages/cli/src/commands.ts`, and `acts` uses it. [code] A control by
hand: making `heldActs` list every act regardless of role fails the page's
story at "expected [...] to not include 'assign'"; the file was restored.
[run]

### By test title

- `packages/page/test/story.scope.test.ts`, "the page's data functions on
  the demo story: the issue, the change, the acts each member may sign, an
  act that takes effect, a refusal by its reason with nothing written, and
  the states of the change from waiting for a reviewer to publication
  confirmed (STAND-IN: the Git host; SCRIPTED: the changed set)". It runs on
  the lanes' `room()` fixture with the demo profile, as
  `packages/lanes/test/story.scope.test.ts` does, and every read and act of
  the page goes through `routed`, the Worker's HTTP routes. No DOM. It
  checks [run]:
  - `openRoom` finds membership, the rules scope and the destination from
    the directory, and paul's standing (`@paul`, member) and rita's (admin);
  - `listLanes` gives the issue with number, title and state;
  - `actsOn` offers paul `comment` and not `assign`, rita `assign`, and
    nobody `label` (not in `issue-demo`);
  - paul's comment and rita's assignment take effect through the page, and
    `loadIssue` shows the comment's text, the assignee and the state;
  - una's review request gives "waiting for a reviewer" naming @paul;
  - una, offered `review-verdict` by her role, is refused
    `guard-failed (author-cannot-review)` by the lane, and the head before
    and after are equal;
  - paul's review answering the request turns it `met`; `merge` is offered
    to rita and not to paul;
  - rita's merge: "publication in progress" and "effect queued" (the
    destination's judge read opened, not answered); after the stand-in host
    answers, "policy not met" naming the extent `rules`, and "effect
    confirmed" for the judge read; the issue is still open;
  - after rita approves for `rules` and merges again: the change is
    `merged`, the merge `published`, the publication `published`, and
    "publication confirmed" with one "effect confirmed" for each of the
    publication's operations (kinds judge, mint, push, receipt, revoke);
    the issue is closed, `completed`, the assignee kept;
  - `loadRules`: approvals 1, the exception not declared, controllers
    `["@rita"]`, the three extents with their approvers and classes, both
    demo digests active, and the revision equal to the rules item's
    `published` slot; `publish` is offered to rita and not to paul.
- `packages/page/test/states.test.ts`, four tests of `changeStates` and
  `operationsOf` on views and entries made by hand, for what the story's
  stand-in host does not produce: effect unknown, effect refused, effect
  queued with no attempt; unavailable authority from `unavailable`,
  `dependency-unavailable` and `authority-lost`, and not from
  `unauthorized`; policy not met with two extents, with an unclassified
  path, and from the lane's `approvals-needed`; operation naming by entry
  and ordinal and `for: "self"`. [run]
- Screenshots, in `packages/page/test/screenshots`: `issue.png` (106,837
  bytes), `change-refused.png` (253,516) and `rules.png` (111,426), each
  under 300 kB. [run] `packages/page/test/screens.mjs` builds the page, runs
  `record.scope.test.ts` with `PAGE_RECORD=1` (the story to the refused
  merge, with every read of the three screens and una's refused review sent
  through the Worker's routes, printed), then drives the preinstalled
  Chromium (`/opt/pw-browsers/chromium-1194`) through `playwright-core`
  1.56.1, installed in a scratch directory outside the checkout. The
  browser is answered with the recorded answers; a request the recorder did
  not make fails the script; none did. In `change-refused.png` the browser
  filled una's `review-verdict` form and pressed its button, and shows the
  lane's refusal. [run] It is a Playwright script, not a `@playwright/test`
  test, because neither package is in the lockfile. [code]

## 2. Stand-ins and limits

- **The Git host**: `OutsideDouble` for the destination and `Host` for each
  lane, from the lanes' fixture. No repository exists. [code]
- **The changed set** of each publication is stated by the test. [code]
- **The setup the page cannot do** is the fixture's: the founding, the first
  rules, the two activations, filing the issue and opening the change with
  its version (a hold under the stand-in host). [code]
- **The scheduler**: the fixture's `settle` and `publish`. [code]
- **The readers**: the test readers. Membership gave no read session in the
  story, and the page read without one. Real read sessions were not
  exercised by the page. [run for the story; inferred for sessions]
- **The screenshots are against recorded answers**, not a live service: the
  answers are the test Worker's, at one point of the story. The browser's
  own signed act was not judged; it got the answer the Worker gave to the
  same act signed in the recorder. [code, run]
- **The page in a browser has not talked to a live scope service.** [run:
  none exists here]

## 3. How the local colleague opens it against a deployment, once one exists

[code; not run against a deployment]

1. `npm ci`, then `npm run build --workspace @generalbusiness/artroom-page`.
   This writes `packages/page/dist/index.html` and `page.js` (539,989 bytes
   in this run [run]).
2. Serve `dist` from the scope service's own origin, or behind a proxy that
   puts both on one origin: the routes set no cross-origin headers
   (`packages/scope/src/worker.ts` has none [code]).
3. Open the page, go to Settings, and give the base URL, the directory's
   scope ID (from `artroom claim` or an invitation link), and a key: the
   content of `keys/device.key` (or `operator.key`) from the command line's
   config directory, which is the secret as base64url [code].
4. Expect the reads to be refused `forbidden` on a deployment with read
   sessions until section 5, item 3 is decided [inferred from code].

To take the screenshots again: install `playwright-core` in a scratch
directory, then
`PLAYWRIGHT_CORE=<dir>/node_modules/playwright-core node packages/page/test/screens.mjs`;
`CHROMIUM=<path>` names another browser.

## 4. Gate

The command, at the root, on a clean checkout: `npm run gate`. One run, at
head `299c2ce71eac97c0bd9a98636c8a4d0811970583`, tree
`719e7adc3bb15fa1aa40e12d6d1a291d83f28c88`. Machine: a cloud container
with 4 CPUs; load average 0.37 before and 1.18 after. **The gate failed on
one test this branch does not touch.** [run]

| Step | Exit | Elapsed seconds | CPU seconds |
|---|---|---:|---:|
| Install | 0 | 4.9 | 6.5 |
| Whitespace | 0 | 0.0 | 0.0 |
| Typecheck | 0 | 12.4 | 39.0 |
| Tests | 1 | 79.9 | 117.7 |

The test runner: 93 files (1 failed, 91 passed, 1 skipped), 737 tests (1
failed, 735 passed, 1 skipped); its own duration 77.45 seconds. The skipped
test is the recorder, which runs only with `PAGE_RECORD=1`. [run]

- The failure is T36 of `packages/checkers/test/runner.test.ts`,
  `checkout-failed`, under this container's `git version 2.43.0`, as both
  earlier delivery notes record. `packages/checkers` and `packages/git` do
  not differ from `origin/request/i5-lane-wiring`. [run]
- The output also holds the uncaught workerd message "Cannot perform I/O on
  behalf of a different Durable Object ... (I/O type: RefcountedCanceler)"
  with a vitest timeout frame, as the client's note records. No test failed
  with it. Its source is not traced. [run]
- Because the test runner failed, the gate did not run its last script. Run
  alone at the same head: `node --test scripts/active-source.test.mjs`, 6
  tests, 6 passed. [run]

This note was written after the gate run; it changes no source or test.

## 5. What is owed

1. **No client can open a lane.** The directory's `open-issue` and `open-pr`
   take the definition's bytes at a stated value place, and the page and
   the command line send no value beside an act, so both are refused
   `bad-field` [run for the command line]. The page lists the forms,
   because the member's role holds the action. A client needs the bytes:
   the rules scope retains them when it activates a definition [inferred],
   so a read of the retained value, plus sending it as `values`, would do.
   Not built here.
2. **No version can be proposed from the page.** `propose-manifest` needs a
   hold and a prepared step of the hold capability; the page prepares none.
   [code]
3. **Reads before a session** (the command line's note, section 5, item 1).
   The page reads the directory with no session, because a session request
   names membership's reference, which only the directory names
   (`sessionRequest(to: ScopeRef, ...)` in `packages/client/src/session.ts`
   [code]). On the deployed class "A reader that presents none is answered
   `forbidden`" (`packages/scope/src/worker.ts`, header). A design decision
   is owed. No route was invented.
4. **Cross-origin requests.** The routes set no `Access-Control-*` headers
   [code]; serving the page elsewhere than the service's origin needs a
   decision on them.
5. **Plan 016's infrastructure effect** has no definition here. The four
   effect states are read from the Git publication's own outside
   operations. [code]
6. **Live updates.** The page does not follow the scopes' streams. [code]
7. **For the reviewer's decision:** `scripts/active-source.test.mjs` now
   lets `packages/page` name the platform package (it reads platform
   definitions' acts, as the command line does), and lets the page's tests
   and development dependency name the lanes package; its source may not,
   and a new assertion says so. [code, run]
8. **For the reviewer's decision:** the key is kept in local storage, which
   any script on the page's origin can read. `docs/page.md` says to serve it
   from an origin that runs nothing else. [code]
9. **For the reviewer's decision:** the root `vitest.config.ts` gives the
   scope project `provide: { pageRecord }` from `PAGE_RECORD`, for the
   recorder. [code]
10. **Two numbers called revision.** The rules scope's revision is the
    position of its last `publish` (2 in the story); a change lane's
    `rules.revision` is the relation update's revision (5 in the story). The
    page labels them apart. [run] The lane forms' owner may want one name.
11. **The gitseq request** for this work, and the review. Also
    `notes/.keep-i5-page`, the empty file from the push check, can be
    removed when the work lands, with the two earlier ones.

## 6. Decisions followed

- The page chooses no binding and judges no guard. It reads revisions and
  the caller's role to build an intent, and the scope checks both again. A
  refusal is shown with its reason and guard name; the story shows the head
  did not move. [code, run]
- The acts come from the definition and the grant, through the command
  line's own `heldActs`; none is hard-coded. [code, run: the control]
- The page says only what it read: each screen ends with the scope and the
  entry it was read at, and a missing read is shown as the read's refusal.
  [code]
- Nothing deployed, nothing published; `packages/page` is `private`.
  Nothing deployed was called. [code]
- `package.json` files: the new package's own, and the lockfile gains only
  the two link entries, in a commit of their own, `475ec50` [run: `npm ci`
  accepted it]. The container's npm 10 and a pinned npm 11 each rewrote
  unrelated `libc` and `peer` lines, so I added the two entries to the
  original file and checked the rest byte for byte. [run]
- `playwright-core` and the second npm ran from scratch directories, not
  the checkout. [run]
- Plain English, no em-dashes, no product names but GitHub in the
  documents; "takes effect". [code]
- Commits are small and each was pushed.
