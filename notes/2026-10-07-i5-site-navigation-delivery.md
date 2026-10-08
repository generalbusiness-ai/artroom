# I5: the site's navigation, versions and title, delivery

2026-10-08. Branch `claude/artroom-edit-page-site-navigation-vjqfjo`, on
top of `planner/i5-demo-host` at `67fe67f9`, whose history is unchanged.
It builds the rest of section 6 of plan 025
(`plans/025-2026-10-07-published-pages.md` on `main`) as the planner's
decisions for this task state it: a header, a breadcrumb, folder listings
by title, a footer, a redirect to `HEAD` and a versions page. Built alone
in a cloud container with no binding, no deployment credentials and no
workroom, so no gitseq request was opened or updated; the planner owes
that. Nothing was deployed.

Labels: **[code]** read from code, **[run]** confirmed by a run in this
container, **[inferred]** not checked.

The same brief also named two other tasks: the issue commands with
`--closes` and `verify --all`, and `artroom edit`. Both are already
delivered at the base head: their commits are in its history
(`1cc7a56`, `20a610e`, `f459e97`, `2440fe0` for the issues; `1eb9436`,
`4015c34`, `fa4aa0f`, `7974d8f` for the edit) and their notes are
`notes/2026-10-07-i5-issues-delivery.md` and
`notes/2026-10-07-i5-edit-page-delivery.md` [code]. This branch does not
build them again and changes nothing of the command line or the lanes.
The known failure of `packages/cli/test/story.scope.test.ts` that the
brief named was not touched; section 4 says that it passed in this
branch's gate run.

## 1 What is built

Source, in `packages/scope/src/site/` [code]:

- `route.ts`:
  - Every page has a header: the room's name, linking to the root at the
    same ref; the branch or tag shown ("branch main (HEAD)", "branch
    main", "tag v1"); and a link to `/site/<directory>/versions/`. Below
    it, the breadcrumb: the ref, each folder of the path, the page.
  - Every page's footer: "Rendered from commit" and the commit's ID, and
    a link to the room's page at `/page/`.
  - A folder with no index page lists its sub-folders, then its markdown
    files by title (first heading, else file name; the first 100 are
    read for a title, `LISTED_TITLES`), then its other files. A name that
    starts with `.` is not listed; the file is still served.
  - `/site/<directory>` and `/site/<directory>/` answer 302 to
    `/site/<directory>/HEAD/`, with nothing read.
  - `/site/<directory>/versions/` lists every branch and every tag of the
    repository, as the Git host advertises them, with the commit each
    names (an annotated tag is followed to its commit), each linked to
    its root, the published branch marked.
  - The `ETag` now covers the header's inputs: the room's name, the ref as
    written in the address, and the full name of the branch or tag it
    names. The renderer's version in the tag is now `site-2`, so every
    tag of the earlier renderer is out of date. The versions page's tag
    is a digest of every ref and its target.
  - The tag following that `commitOf` did for a ref is now `peeled`,
    shared with the versions page.
- `markdown.ts`: `titleOf(source)`, the title that `renderMarkdown` gives,
  with no HTML written. The converter is otherwise untouched.

Tests, in `packages/scope/test/site-route.test.ts`, on a real register
and directory with the stand-in Git host the file already had. The
founding fixture gains a commit with two folders (`guide`, with no index
page, and `notes`, with one), two dot-entries in `guide`, the tag `nav`,
and an annotated tag `release` of it. [run, 13 tests pass]

| Test | Invariant |
|---|---|
| navigation: the header names the room and the branch or tag, the breadcrumb links each folder of the path, and the footer names the commit and links to /page/ | Header, breadcrumb and footer at a tag, at `HEAD`, at the branch by name, and at an annotated tag (the footer names the commit, not the tag object). |
| a folder: its listing gives sub-folders, markdown files by their first heading else their name, and other files, hiding dot-files; a link to a folder, with or without a slash, answers its index | The exact listing of `guide`; no dot-entry listed, `.hidden.md` still served; the README's links `guide`, `notes/` and `guide/../notes` and the page's `./` and `../` resolve under the same ref and answer the folder's listing or index. |
| versions: /site/<directory>/versions/ lists each branch and tag with its commit, an annotated tag followed, the published branch marked; a new tag gives a new ETag | Every row against the stand-in's refs; `release` shows the commit, not the tag object; 304 for the same tag; a new tag answers 200 with a new `ETag`. |
| cache: the same commit and path under HEAD, its branch and a tag give three ETags, as each page's header differs | The header's inputs are in the tag. Before this branch the three were one tag for three different pages. |
| no ref: /site/<directory> and /site/<directory>/ redirect to HEAD/ | 302 to `HEAD/`, and no pack is read; `/site//` is still `bad-request`. |

The earlier eight tests of the file pass unchanged, so images, refusals
and their names, the size bound, the cache, the binding's answers and the
failed step are as before [run].

The stand-in host's pack writer gains `withTags`: `buildPack` of the git
package writes commits, trees and blobs only (all a push sends), so the
test appends each tag object as an undeltified entry and writes the count
and the trailer again. It is test code only [code].

Controls, each by `node scripts/control.mjs packages/scope/src/site/route.ts ... -- packages/scope test/site-route.test.ts` with `--expect`
naming the test [run, each DISTINGUISHES]:

| Change | Test that fails |
|---|---|
| The dot-file filter made `true` | a folder: ... hiding dot-files |
| The ETag's header inputs left out (`[]`) | cache: ... three ETags |
| A listed title made `null` | a folder: ... first heading |
| The versions page shows a tag's target without following it | versions: ... |
| The redirect's status 302 made 301 | no ref: ... |

Other tests that read the site route pass with the new header and footer:
`packages/lanes/test/edit.scope.test.ts`, `packages/lanes/test/issues.scope.test.ts`
and `packages/page/test/story.scope.test.ts`
(`npx vitest run --project scope edit issues story site`, 7 files, 21
tests) [run].

Documents: `docs/pages.md`, the two new addresses, a section "What every
page shows", the folder row of the table, folder links, and the cache's
`ETag` [code].

## 2 The live procedure for the local colleague

On the deployment after this branch is deployed, with a room claimed by
the command line (`directory` from `artroom claim`). Each step names what
to see.

1. Open `<base-url>/site/<directory>`. It redirects to
   `<base-url>/site/<directory>/HEAD/`.
2. That page is the founding README. The header shows the repository's
   name (the long name the register gave, ending `-0` or another attempt
   number), "branch main (HEAD)" and "versions". The footer's commit is
   the one `git ls-remote` gives for `refs/heads/main` on the room's
   repository, and its link opens `<base-url>/page/`.
3. Open `<base-url>/site/<directory>/versions/`. One row: branch `main`,
   "(HEAD, the published branch)", with the same commit as step 2. A tag
   shows only if the repository has one: the room writes none. If the
   colleague holds a write token for the repository, a tag pushed with
   the host's own tools appears there, and `<base-url>/site/<directory>/<tag>/`
   shows "tag <tag>" in the header [inferred].
4. Make a folder with no index page:
   `artroom edit guide/start.md --file start.md`, where `start.md` begins
   `# Getting started` and links `[the top](../)`. Then open
   `<base-url>/site/<directory>/HEAD/guide/`: a list with
   "Getting started start.md". On the page itself the breadcrumb reads
   `HEAD / guide / start.md`, each part a link, and "the top" opens the
   README.
5. For a hidden file, `artroom edit guide/.draft.md --file draft.md`. If
   the room takes it, the list of step 4 does not show it and its own
   address serves it; if the path is refused by name, the hiding is shown
   by the test alone [inferred: this branch did not check the path rules
   for a dot-file].
6. Open a page twice with the browser's network panel: the second answer
   is 304. Open the same page under `HEAD` and under `main`: the `ETag`s
   differ.

## 3 Stand-ins and limits

- The Git host is the test file's stand-in, `Scripted`: a binding double
  and a scripted smart-HTTP upload-pack over a map of refs and objects.
  The register and the directory are real scopes [code].
- **The room's name.** The decision says the claim's name as the
  directory records it. The directory records no claim name: its
  genesis has the repository record `{ host, namespace, name, id }`, the
  branch, the founder's handle and the claim's fact reference
  (`packages/platform/src/directory.ts`, item `repository`), and the
  register's claim has no name either (`packages/platform/src/register.ts`,
  item `claim`) [code]. The name given to `artroom claim <name>` is used
  only in the command line's message ("Claimed demo: ...") [code,
  `packages/cli/src/commands.ts`, `claim`]. So the header shows
  `repository.name`, the name the register gave the repository at the
  host, which is long and not chosen by the founder. Showing the
  founder's chosen name needs a field for it in the claim, carried into
  the directory's genesis: a definition change, which this branch does
  not make.
- **The versions the destination records.** The decision says the
  versions page lists the branches and tags the destination records with
  their heads. The destination records one branch, `branch.name` and
  `branch.head`, and no tags (`packages/platform/src/destination.ts`,
  item `branch`) [code]. Its state is read only with a read session, and
  the site route reads none [code, `route.ts` header comment]. So the
  versions page reads the repository's refs as the Git host advertises
  them, on the same read the pages use. Where the destination's
  `branch.head` and the host's ref differ (a publication in progress, or
  a push from outside the room), the page shows the host's [inferred].
- **The verifier's result.** The footer links to it only if a cached one
  exists. The Worker keeps none: no route or store of the scope package
  holds a verifier's result [code, a search of `packages/scope/src` for
  one]. So no footer has that link.
- A branch or tag named `versions` cannot be opened at its root, because
  `/site/<directory>/versions/` is the versions page. Its other paths can.
- The versions page reads the whole pack whenever the repository has a
  tag, to follow it to its commit, as a page read does [code].
- A folder's listing reads each listed markdown file, up to 100, for its
  title. The pack is already fetched for the page, so this adds no
  request [code].

## 4 Gate

One run of `npm run gate` at head `a10e1d3c` (tree `30b2ec53`), the last
commit of source and tests; the note's commit after it changes only this
document [run]:

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | skipped (installed from this lock file) | | |
| whitespace | 0 | 0.1 s | 0.0 s |
| typecheck | 0 | 12.3 s | 39.5 s |
| test | 1 | 136.5 s | 178.8 s |

Test files: 3 failed, 117 passed, 1 skipped (121). Tests: 3 failed, 816
passed, 1 skipped (820). The gate stops at the test step, so the active
source script did not run. None of the three failures is in a file this
branch changes:

- **T36** of `packages/checkers/test/runner.test.ts`, which the brief
  foresaw for this container's Git.
- **The page's assets test**, `packages/page/test/assets.test.ts`: the
  committed `packages/scope/src/page-assets.ts` is not this container's
  build of the page's source (the digest of `page.js` differs). It fails
  the same way at the base `67fe67f9` in a separate worktree [run]. This
  branch changes nothing of `packages/page` or of what it imports [code].
  It may be the bundler's output in this container; whoever builds the
  page next should run `npm run build --workspace @generalbusiness/artroom-page`
  on their machine and see whether the file changes [inferred].
- **T39** of `packages/scope/test/limits.test.ts`, the failure in the full
  run that `notes/2026-10-07-i5-issues-delivery.md` section 4 describes.
  It passes alone at this head and at the base [run].

`packages/cli/test/story.scope.test.ts` passed in this gate run, so the
refusal the brief named ("Refused: bad-field" against "Refused:
guard-failed (not-activated)") does not fail at this head [run]. This
branch does not touch it.

## 5 What is owed

- The live procedure of section 2, after deployment.
- The gitseq request for this task, which the planner opens or updates.
- The founder's chosen name in the header (section 3), if the planner
  wants it: a definition change to the claim and the directory.
- The destination's own record in the versions page, if the planner
  wants it over the host's refs: a read the site route can make without a
  session.
- The verifier's result link, once a verifier's result is kept anywhere
  the Worker can read.

## 6 Decisions followed

- A header with the room's name linking to the index, the branch or tag,
  and a breadcrumb: built; the name is the repository's name (section 3).
- A folder's index lists sub-folders and markdown files with their
  titles, hiding dot-files: built. Other files stay listed after them,
  as before, so an image or a text file of a folder is still reachable
  from its listing.
- A footer with the commit and links to `/page/` and to a cached
  verifier's result: built; there is no cached result, so no such link.
- `/site/<directory>/` with no ref redirects to `HEAD`: built.
- `/site/<directory>/versions/` lists branches and tags with their heads:
  built from the Git host's refs (section 3).
- Relative links to folders resolve to their index; images keep working;
  refusals keep their names: shown by tests.
- The ETag covers the header's inputs: built and shown.
- No wiki links, no search, no edit button: none built.
- The converter untouched except where a title is read: `titleOf` only.


## Combined sprint: honest repository label and named follow-up

Owner decision `605bc3ba199d27944369bf3f4fbb5bf2b73fd6d1` selects the
permitted named follow-up under request
`530d18175f501c5587f570c3efe4bf61fe4bfa6d` and combined preparation
`c878b983530dd68d5266589a6754b1fc4dae7a80`: **signed claim display name
carried to directory and site header**, after demo submission. That
obligation remains open. The earlier delivery and run records above are
historical; they do not establish a human claim name in the current data.

The current header now labels its actual `repository.name` value
"Repository:". The directory scope ID in the site address is an
identifier, not a human name. No signed field, founding schema, version
cohort or old seed changes. The renderer cache tag advances from `site-2`
to `site-3` so a cached header with the previous label does not answer 304
for the changed rendered bytes. The existing navigation and versions
assertions check the visible repository label; the other site assertions
remain.

Validation: `npm run test -w @generalbusiness/artroom-scope --
test/site-route.test.ts` passed: 1 file, 13 tests, exit 0 (4.72 seconds),
with the existing scripted Git host. Raw log:
`/tmp/artroom-expanded-site-label.log`. Scope types had already passed
before this wording-only change; no repeat typecheck was needed.
No new gate, cloud, browser or provider proof. The full exact-head gate
and Source review remain with the combined filing.
