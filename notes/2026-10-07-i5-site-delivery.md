# I5: the site renderer, delivery

2026-10-07. Branch `claude/i5-site-renderer-39k7iz` (built locally as
`i5-site`), on top of `planner/i5-demo-host` at `714afda4`, whose history
is unchanged. It builds section 6 of plan 025
(`plans/025-2026-10-07-published-pages.md` on `main`), the renderer, and
nothing of its section 5 or of section 7, steps 3 and 4. Built alone in a
cloud container with no binding, no deployment credentials and no
workroom, so no gitseq request was opened or updated; the planner owes
that. Nothing was deployed.

Labels: **[code]** read from code, **[run]** confirmed by a run in this
container, **[inferred]** not checked.

## 1 What is built

Source, all new, in `packages/scope/src/site/` [code]:

- `node.ts`, `blocks.ts`, `inlines.ts`, `autolinks.ts`, `html.ts`,
  `markdown.ts`: the converter. `renderMarkdown(source, options)` answers
  `{ html, title }`. It is written for this repository; no markdown
  library is used and no dependency is added.
- `entities.ts`: the 2,125 named character references of HTML, as data.
  It is generated from `lib/maps/entities.json` of the npm package
  `entities` 2.2.0, licence BSD-2-Clause; the names and code points are
  the HTML Standard's. No code of that package is used, and it is not a
  dependency.
- `host.ts`: `roomOf` reads a directory's genesis entry for the room's
  repository record and published branch; `readerOf` opens the
  repository at its host.
- `route.ts`: `site(request, env, fetch?)`, the route
  `GET /site/:directory/:ref/*path`.
- `packages/scope/src/worker.ts`: one import and one registration. The
  default export sends a path that starts with `/site/` to `site`, and
  every other path to `route` as before. No route of `route` changed.

`wrangler.jsonc` is unchanged: the route uses the bindings the hosts
already have. Documents: `docs/pages.md` (new).

Tests, all in the `scope` project (workerd), all passed in the gate run
of section 5 [run]:

`packages/scope/test/site-conformance.test.ts`:

1. "GFM specification conformance: every example, as the
   specification's runner configures it, renders the stated HTML; the
   pass count by section is reported"
2. "as served (every extension on, raw HTML escaped), the examples that
   differ are reported, and each one holds raw HTML, an autolink or a
   tag the filter names"

`packages/scope/test/site-route.test.ts`, on a real register and
directory in the namespace `PLATFORM`, with a scripted binding as the
labelled stand-in for the hosting's own Git service:

3. "a page: a markdown file at HEAD, at its branch and at a tag renders
   as HTML with relative links under /site, headings with GitHub's ids,
   and raw HTML escaped (STAND-IN host)"
4. "an index: the root answers its README, a directory its index.md, and
   a directory with neither a listing of its files (STAND-IN host)"
5. "a relative image: the address a page writes answers the image's bytes
   with its type (STAND-IN host)"
6. "refusals: a missing page, a bad ref, a file over the size bound at
   the real bound, no room, a bad path and no host each answer plain text
   with a reason and a status (STAND-IN host)"
7. "cache: same commit, same ETag, and If-None-Match answers 304 without
   reading the pack; a new commit, a new ETag (STAND-IN host)"

Controls, each with `node scripts/control.mjs <file> '<old>' '<new>'
--expect '<test>' -- packages/scope test/site-route.test.ts` [run]:

| Change | Result |
|---|---|
| `host.ts`: the check that the host's pinned register created the room removed | distinguishes, test 6 |
| `html.ts`: inline raw HTML passed through | distinguishes, test 3 (it survived until test 3's page held inline HTML; the page was changed) |
| `html.ts`: an HTML block passed through | distinguishes, test 3 |
| `html.ts`: unsafe addresses kept | distinguishes, test 3 |
| `route.ts`: no 304 for a matching `If-None-Match` | distinguishes, test 7 |
| `route.ts`: a branch's commit read before the 304 | distinguishes, test 7 |
| `route.ts`: the file bound raised to the reader's default | distinguishes, test 6 |

## 2 Conformance

The examples are those of the GitHub Flavored Markdown specification,
version 0.29-gfm, `test/spec.txt` of `github/cmark-gfm` at
`27d942c8b0a6`, fetched on 2026-10-07. It is published by GitHub under
Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), stated in its
front matter. That licence permits copying and adapting with attribution,
and asks that an adaptation be shared under the same licence; it is not a
permissive licence in the software sense. The 672 examples are committed
as `packages/scope/test/site/gfm-spec.json`, with `LICENSE` (attribution,
what was changed, and the licence's text) and `spec-to-json.mjs`, which
made the file. [run]

**The bar: every example, 672 of 672.** Each example runs as the
specification's own runner (`test/spec_tests.py`) runs it: with the one
extension it is tagged with, else none. The two task list examples are
tagged `disabled`, which that runner skips; here they run with `tasklist`.
Raw HTML passes through and headings get no id, as the examples expect.

Result: 672 of 672; no section falls short [run]. By section:

| Section | Passed |
|---|---|
| Tabs | 11/11 |
| Precedence | 1/1 |
| Thematic breaks | 19/19 |
| ATX headings | 18/18 |
| Setext headings | 27/27 |
| Indented code blocks | 12/12 |
| Fenced code blocks | 29/29 |
| HTML blocks | 43/43 |
| Link reference definitions | 28/28 |
| Paragraphs | 8/8 |
| Blank lines | 1/1 |
| Tables (extension) | 8/8 |
| Block quotes | 25/25 |
| List items | 48/48 |
| Task list items (extension) | 2/2 |
| Lists | 26/26 |
| Inlines | 1/1 |
| Backslash escapes | 13/13 |
| Entity and numeric character references | 17/17 |
| Code spans | 22/22 |
| Emphasis and strong emphasis | 131/131 |
| Strikethrough (extension) | 2/2 |
| Links | 87/87 |
| Images | 22/22 |
| Autolinks | 19/19 |
| Autolinks (extension) | 11/11 |
| Raw HTML | 20/20 |
| Disallowed Raw HTML (extension) | 1/1 |
| Hard line breaks | 15/15 |
| Soft line breaks | 2/2 |
| Textual content | 3/3 |

The comparison is exact, character for character [code]. The
specification's runner normalizes the HTML before it compares
[inferred: from cmark-gfm's `test/normalize.py`, not read here].

What the route serves differs from the examples by design, and test 2
reports it [run]:

- Every extension on, raw HTML passed through: 662 of 672. The ten that
  differ are HTML blocks 140, 141, 142, 145 and 147 (the tag filter makes
  `<script>` and `<style>` inert) and Autolinks 610, 614, 616, 619 and 620
  (an extended autolink is found in text that core CommonMark leaves
  plain). GitHub renders with every extension on [inferred].
- As served, raw HTML escaped and unsafe addresses emptied: 595 of 672.
  The 77 that differ are every example of HTML blocks (43), 13 of Raw
  HTML, the one of Disallowed Raw HTML, the five autolinks above, and 15
  more in other sections whose source holds raw HTML. Test 2 checks that
  each served difference has a `<` or an address in its source.

Three behaviours were read from the expected HTML and the reference
implementation, not from the specification's prose: strong emphasis
directly inside strong emphasis adds no tag (GitHub's renderer does
this); an HTML comment follows the newer CommonMark rule (`<!-->` and
`<!--->` are comments), which this copy of the specification's examples
expects; and a link destination nests at most 32 parentheses, which the
specification allows, to bound the scan. [code]

## 3 The live procedure for the local colleague

What the route needs is already deployed for gate 1b: the scope Worker
with the `ARTIFACTS` binding and `ARTIFACTS_CONFIG`, or the GitHub
settings. No new binding, variable or secret is needed [code].

1. Check out `claude/i5-site-renderer-39k7iz`. Run `npm ci` and
   `npm run gate`. Expect the one known failure of section 5.
2. Deploy the scope Worker as in `docs/deploy.md`.
3. Take a room claimed on the hosting's own Git service. Its directory
   scope ID is in `artroom claim`'s output and in the command line's
   config under `directory`.
4. Open `<base-url>/site/<directory>/HEAD/`. The published branch holds
   only the founding commit, whose tree is empty, so expect a listing
   with no entries, titled `HEAD`, and the commit's ID in the footer.
   This shows the room lookup, the register check, the read token and
   the ref read. [inferred]
5. Content: only the room writes the published branch, and no lane
   publishes yet (gate 2). With operator access to the service, push a
   branch that is not the published one, for example `site-demo`, with a
   `README.md`, a folder with an `index.md`, a folder with neither, an
   image, a table, a task list and a relative link up a folder. Then open
   `<base-url>/site/<directory>/site-demo/`.
6. Check with `curl -i`:
   - a page answers 200, `text/html`, an `ETag`, `Cache-Control: public,
     max-age=60` and a `Content-Security-Policy`;
   - the same request with `-H 'If-None-Match: <etag>'` answers 304;
   - after a new commit on `site-demo`, the `ETag` changes;
   - `.../site-demo/missing.md` answers 404 `not-found: ...`,
     `.../no-such-ref/` answers 404 `ref-not-found: ...`, and a file of
     more than 1 MiB answers 413 `too-large: ...`;
   - in the service, each read token the Worker minted is revoked, or
     ends after two minutes.
7. For a GitHub room, the same, with the repository's own branches and
   tags; a private repository needs `GITHUB_READ_TOKEN`, and a setting
   with `publicReads: true` reads with no token. [code]

## 4 Stand-ins and limits

Stand-ins [code]:

- The hosting's own Git service, in tests 3 to 7: `Scripted`, a binding
  double and a scripted smart-HTTP upload-pack over a map of refs and
  objects. It sends every object in every pack. No repository exists, and
  nothing shows how the real service answers an upload-pack request.
- The clock and the readers of the namespace `PLATFORM`, as in every test
  there. The site reads no session.
- GitHub: no test reads a GitHub repository through the site. The GitHub
  branch of `readerOf` is code only.

Limits:

- **Whole history.** The smart-HTTP source asks for the commit with no
  depth limit, so every uncached page fetches the commit's whole history,
  bounded by the host setting's `maxBytes`. One large file anywhere in
  the history makes every page `unreadable`. [code]
- **A read token per request.** On the hosting's own Git service each
  request, a 304 included, mints and revokes one read token. [code]
- **Annotated tags.** The route follows an annotated tag to its commit,
  but no test has one: the test's pack builder writes no tag object.
  [code]
- **GitHub repository check.** The destinations check a GitHub
  repository's numeric ID through GitHub's REST interface before a read.
  The site does not: it reads the recorded name. A repository renamed
  and replaced under the same name would be read. [code]
- **Host settings.** `host.ts` reads only the fields it needs of
  `ARTIFACTS_CONFIG` and `GITHUB_APP_CONFIG`, not the whole checks of
  the two wirings, so a setting the wiring refuses may still be read by
  the site. The wiring files were not changed, to stay out of the other
  session's files. [code]
- **Refs served.** Every branch and every tag at the host is served, not
  only the published branch. Today only the room writes the repository
  [inferred from docs/hosts.md]; a branch pushed there by another hand is
  served too.
- **Cost of a deep list.** Lists nested about 500 deep in 250 kB took
  320 ms to convert in Node; the work grows with the square of the depth.
  Nested block quotes, emphasis, links and images are linear. [run]
- No footnotes, wiki-style links, mathematics, diagrams or syntax
  highlighting (`docs/pages.md`).

## 5 Gate

One run of `npm run gate`, at head `0d2e890e8d9b` (tree `685726e21eb1`),
in this container: 4 processors, no other load, a warm npm cache, first
gate run of the checkout [run].

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | 0 | 4.9 s | 6.2 s |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 11.0 s | 34.2 s |
| test | 1 | 65.4 s | 106.6 s |

Vitest: 104 test files, 103 passed and 1 failed; 776 tests, 775 passed
and 1 failed. The failure is T36 of `packages/checkers/test/runner.test.ts`
("T36, the runner's checkout checks the commit, its tree and its parents
against the job, on a real repository: ..."), the known failure caused
by this container's `git`; this branch changes nothing in `checkers`.
The run also reported 2 uncaught `EPIPE` errors, from the local Git
server of `packages/git/test/support/host.ts`, while
`packages/git/test/http.test.ts` and `http-read.test.ts` ran; their
tests passed, and this branch changes nothing in `git` [run]. All nine
tests of the two site files passed in that run [run].

Because the vitest step failed, the gate did not run
`scripts/active-source.test.mjs`. It was run once on its own at the same
head: exit 0, no failure [run].

The note's own commit changes only documents (this note, and the removed
placeholder). The source and tests are unchanged: the tree above is the
tree of the gated head, and the note's commit gives the second tree.

## 6 What is owed

- **Members-only sites.** Every site is public to whoever holds the
  room's directory scope ID, and is read with the deployment's own
  access, so a private repository is public through the site. A
  members-only site rests on read sessions: the route would accept a
  session of the room's membership scope, as the other read routes do.
  Plan 025's section 3 names this invariant; it is not built.
- **Which refs are a site.** Plan 025 says "A page is served only from a
  published commit". The route serves any branch or tag at the host. If
  lanes come to push proposal branches into the room's repository, the
  route must be limited to the published branch and to tags.
- **One reader of the host settings**, shared by the wirings and the
  site, in place of `host.ts`'s partial reading.
- **A shallow read.** A depth-limited fetch, or a cache of the objects of
  a commit, so that a page costs one file and not the whole history.
- **The gitseq request** for this work, which the cloud session could
  not open.
- The placeholder `notes/.keep-i5-site`, which checked that this branch
  could push, is removed in the note's commit.

## 7 Decisions followed

- Plan 025, section 6, as hugh set its scope: markdown links and images,
  GitHub Flavored Markdown as the completeness bar, no wiki-style links.
- The brief's description of the binding was checked against the code.
  The binding's repository handle has `createToken`, `revokeToken` and
  `info`, and no tree or commit read (`artifacts-host.ts`,
  `ArtifactsRepository`) [code]. So on the hosting's own Git service the
  site reads over smart HTTP with a minted read token, as the
  destinations' reads do, and not through a tree read of the binding.
- The room is the directory's genesis, read through the object's
  `source` method, which checks no reader. A room is served only when the
  register pinned in the host's setting created its directory, the same
  rule as `hostBound` in `host-wiring.ts`.
- The head of a ref is read from the host, not from the destination's
  branch item: no read of a scope's item is open to a caller with no
  session, and only the room writes the published branch [inferred].
- Raw HTML is escaped, never passed through. An HTML block is shown in a
  `pre` element as its source. `javascript:`, `vbscript:`, `file:` and
  `data:` addresses are emptied, as commonmark.js's safe mode does, and
  every page has a content security policy that runs no script.
- A folder's `index.md` is chosen before its `README.md`.
- An address starting with `/` is taken from the repository's root.
- The `ETag` is the commit and a digest of the path and the renderer's
  version, so that a change of the renderer changes every tag.
- Refusals are plain text, `<reason>: <sentence>`, with `no-store`.
- The file bound is 1 MiB, a constant of `route.ts` (`FILE_BYTES`), and
  the test checks it at that real bound. The cache keeps an answer for
  60 seconds (`MAX_AGE`).
- Plain English, no em-dashes; in documents no product is named but
  GitHub, and the other host is "the hosting's own Git service".

## 8 After the first live run: the failed step is named

The first live run (planner/i5-demo-host at `9f79067e`) answered 502
`unreadable` at `/site/<directory>/HEAD/` and at `/README.md`, with no
cause in the log. Commit `c42c790` names the cause. [code]

**Header and log.** Every catch in `site()` now logs one line with
`console.error` and adds the header `x-site-step` to the refusal. The
body is unchanged. The line is:

```
site <step>: <error class>: <message>[; last request: <METHOD> <origin><path> -> <status> <content-type>]
```

| Step | What failed |
|---|---|
| `room` | Reading the directory's genesis entry (`roomOf`). |
| `open` | `binding.get(name)`. |
| `info` | `info()`, or its remote is not the expected one. The message says what type the reported remote had, not its value. |
| `token` | `createToken("read", 120)`, or its answer holds no token. The message lists the answer's field names, not their values. |
| `refs` | Reading the ref advertisement (`info/refs`), or a ref name the route refuses. |
| `objects` | Reading the commit, a tree or a blob (`git-upload-pack`). |
| `render` | Converting the markdown. |

`last request` is the last request the smart-HTTP source sent and what
came back, so a `refs` or `objects` failure shows the service's status
and content type. Redacted: the minted token's plaintext and
`GITHUB_READ_TOKEN` wherever they appear; any value after `Bearer`,
`Basic`, `token` or `authorization`; a URL's user part; and a URL's
query. No request header is logged. The two catches inside the helpers
`parse` and `resolveAddress` are not failures of a read and log nothing.
[code]

**Forms of the binding's answers that are accepted** [code]:

- The minted token: the field `plaintext`, else the field `token`. Each
  must be a string of 1 to 4,096 printable ASCII characters.
- The remote that `info()` reports: compared with the expected
  `https://<host>/git/<namespace>/<name>.git` after both have any
  trailing `/` removed and then a final `.git` removed. So `.../<name>`,
  `.../<name>/`, `.../<name>.git` and `.../<name>.git/` are all accepted.
  Another host, namespace or name is refused at the step `info`, before a
  token is minted. The site still reads from the `.git` form that it
  builds, as the destinations do.

`artifacts-host.ts`, which the destinations use, still accepts only
`plaintext` and the exact remote; it is not this branch's file. The
founding commit was pushed and read back live through it, so those two
shapes held for it on this service [inferred]. That suggests the failure
is not in `open`, `info` or `token`. The most likely step is `objects`:
the founding write never sends `git-upload-pack`, and the site is the
first live caller of it [inferred]. The header will say which.

**An empty tree at `/`.** A commit whose tree is empty, such as the
founding commit `517e108`, answers 200 with a page titled with the ref
that says "The repository has no files at this commit." An empty folder
below the root says "This folder has no files at this commit." Neither
is a refusal. [code, and test 11]

**Tests**, added to `packages/scope/test/site-route.test.ts`, all passed
[run]:

9. "binding answers: a token named token, and a remote reported with or
   without .git and a trailing slash, each read the page; another remote
   is refused at the step info (STAND-IN host)"
10. "a failure at each step answers the same refusal with x-site-step and
   logs one redacted line naming the step (STAND-IN host)". It covers
   `open`, `info`, `token`, `refs` and `objects`, and checks redaction.
   No test makes `room` or `render` fail.
11. "an empty tree: the root of a commit with no files answers a page
   that says so (STAND-IN host)"

Controls, as in section 1, each distinguishes [run]: the `token` field
not read (test 9); the remote compared exactly (test 9); no
`x-site-step` header (tests 9 and 10); the step not moved to `objects`
before the tree read (test 10); the empty page not given (test 11).

**Gate**, one run of `npm run gate` at `c42c7908a471` (tree
`6dc9e8e3e23d`), same container, 4 processors, no other load [run]:
whitespace exit 0 (0.0 s); typecheck exit 0, 11.0 s elapsed, 34.7 s CPU;
test exit 1, 66.0 s elapsed, 107.0 s CPU. Vitest: 104 files, 103 passed
and 1 failed; 779 tests, 778 passed and 1 failed, T36 of
`packages/checkers/test/runner.test.ts` as before. This run reported no
`EPIPE` errors. `scripts/active-source.test.mjs`, run on its own at the
same head: 6 passed, 0 failed. This note's commit changes only this
note.

**For the redeploy:** request `/site/<directory>/HEAD/` again and read
`x-site-step` from the answer and the `site <step>:` line from the
Worker's log.


## F2: bind GitHub Site acquisition to its recorded stable ID

Under request `86206b5595fa55a7d84821a74e200aabc0fa837e`, reviewer
`376aa53064b8adae9b330d5d655f5fb019b6b168` and planner decision
`158be2c4800db1753af32e60674591ff17464cde`, this repair starts at
`68be1ffeb3d64094232ec7f8e4373629f8527c07`. It corrects the GitHub
identity omission described in section 4 above; the earlier delivery/run
records remain historical.

Site acquisition now uses the same exact numeric-ID validator as
GitHubProvider. Its bounded REST lookup and account/repository decoder are
shared with GitHubApp through a read-only export. The configured account
login, numeric ID and type, repository name/URLs and recorded repository ID
must match before the Site exposes a Git source. Missing/unexposed,
mismatching or unavailable identity fails closed at `info`. A missing
lookup is uncertainty, not proof that a repository does not exist.

Public reads still use no token; private reads use the existing
GITHUB_READ_TOKEN, with Bearer for REST and Basic for Git. The read-only
lookup requires no App signing key, JWT or new credential. No mint,
mutating request, public policy or host-routing change is introduced.

One focused invocation passes 24 tests across five files: the original
GitHub REST/provider/wiring witnesses, the existing site-route witnesses
and one compact scripted Site-adapter identity witness. Git source/test
types and final Scope source/test/Node fixture types pass. Initial Scope
types caught explicit undefined in an optional test binding; the fixture
now omits that binding. Bypassing only the shared stable-ID comparison
makes the Site witness fail because a replacement source is exposed;
the source is restored. Exact commands/source pairs/raw logs/control are
retained in `/tmp/artroom-site-repository-identity-evidence.json`.

The lookup and Git acquisition remain separate requests. This is no atomic
post-lookup identity fence, observed provider incident, live GitHub proof,
new admission proof or closure of the existing public/member/publication,
historical source, custody/cleanup or capacity obligations. No gate or
provider/cloud/browser run was made for this isolated repair; Root owns
the combined final gate and filing.
