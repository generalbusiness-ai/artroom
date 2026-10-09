# Pages

A room's repository can be read as a site: each markdown file is a page,
rendered as HTML by the scope Worker. This page says how to open a room's
site, what renders and what does not, the limits, and who can read it.
Plan 025 (`plans/025-2026-10-07-published-pages.md` on `main`) is the
design; this page describes what is built.

## Opening a site

A page's address is:

```
<base-url>/site/<directory>/<ref>/<path>
```

- `<base-url>` is the scope Worker's address, the one given to
  `artroom install`.
- `<directory>` is the room's directory scope identifier (`sc_...`),
  not a human name.
  `artroom claim` prints it ("Claimed demo: directory sc_..."), and the
  command line keeps it under the name `directory`.
- `<ref>` is `HEAD` or a published branch name. `HEAD` names the room's
  branch at the exact head its destination records. The Worker does not
  substitute the Git host's current branch head. A name that holds a `/`
  uses `%2F`, such as `release%2F1.0`. Every other branch, tag or commit
  name is refused as `not-published`, even if the backing repository holds it.
  The current room model records one branch and no tags or named versions;
  provider tags do not become published versions.
- `<path>` is a file or a folder in the repository at that commit.

For example, `<base-url>/site/sc_hs5f27fz.../HEAD/` opens the room's
front page. Use the recorded branch name to open another path at the same published head.

Two more addresses:

- `<base-url>/site/<directory>/`, with no ref, redirects (status 302) to
  `<base-url>/site/<directory>/HEAD/`.
- `<base-url>/site/<directory>/versions/` lists only the room's recorded
  published refs and exact commits, with links to their roots. Today it
  lists the destination's single published branch, marked "HEAD, the
  published branch"; before its first head it lists no versions. Provider
  branches and tags are never used to build the list. The name `versions`
  is reserved for this listing at the root.

## What every page shows

- **A header.** "Repository:" and the repository's name as the directory
  records it, linking to the root of the same published branch; the branch
  shown, such as "branch main (HEAD)" or "branch main";
  and a link to the versions page. This is the name the register gave the
  repository at the Git host. It is not a human claim name. Carrying a
  signed claim display name into the directory and header remains a named
  follow-up after the demo; the current signed fields do not contain it.
- **A breadcrumb.** The ref, then each folder of the path, each a link,
  then the page itself.
- **A footer.** "Rendered from commit" and the commit's ID, and a link to
  the room's page at `<base-url>/page/`. The footer would also link to a
  verifier's result for the commit, but the Worker keeps no such result,
  so no page has that link.

## What a path answers

| The path names | The answer |
|---|---|
| A markdown file (`.md` or `.markdown`) | The page, rendered as HTML. |
| A folder, or nothing (the repository's root) | The folder's `index.md`, else its `README.md` (either name in any letter case, or ending in `.markdown`), rendered. A folder with neither answers a list: its sub-folders, then its markdown files by title, then its other files. A markdown file's title is its first heading of the highest level, else its file name; only the first 100 markdown files of a folder are read for a title, and a file of more than 1 MiB keeps its name. A name that starts with `.` is not listed, but the file is still served at its own address. A folder with no files, or a repository with no files at its root, answers a page that says so. |
| An image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.svg`, `.ico`, `.bmp`) | The image's bytes, with its type. |
| Any other file | The file's bytes, as a download. |
| A symbolic link or a submodule | A refusal (`not-found`). |

## What renders

The Worker follows the GitHub Flavored Markdown specification, version
0.29-gfm, which GitHub publishes: CommonMark, and GitHub's five
extensions to it.

- Headings, paragraphs, block quotes, lists, code blocks, thematic breaks,
  emphasis, code spans, links, images, autolinks, entities, escapes and
  line breaks.
- Tables, with column alignment.
- Task list items, shown as checkboxes that cannot be changed.
- Strikethrough with `~` or `~~`.
- Extended autolinks: `www.` addresses, `http://`, `https://` and
  `ftp://` addresses, and email addresses, written as plain text.
- A fenced code block's language, as the class `language-<name>` on its
  `code` element.
- Headings get the anchor ids that GitHub gives them: `## Getting
  started` has the id `getting-started`, and a second heading of the same
  text has `getting-started-1`.

The checked-in document
[`packages/scope/test/site/completeness/fixture.md`](../packages/scope/test/site/completeness/fixture.md)
puts these constructs together. The `GFM completeness fixture` test in
`packages/scope/test/site-route.test.ts` renders those exact bytes through
Site and follows its companion-page and repository-image addresses. Its
Git host is a labelled stand-in; this test does not show a deployment.
The companion page and SVG beside the fixture can be published with it
for the separate deployment observation.

| Construct in the fixture | Site's answer |
|---|---|
| Headings, including repeated headings; same-page anchors | Renders. The anchors are `getting-started` and `getting-started-1`. |
| Emphasis, strong emphasis, strikethrough and inline code | Renders. |
| Bullet, nested and ordered lists | Renders. |
| Task lists | Renders as disabled checkboxes, including checked and unchecked tasks. |
| Tables | Renders with the declared column alignment. |
| Fenced code with a language | Renders as code with `language-ts`; syntax colouring is not built. |
| Block quotes and extended URL and email autolinks | Renders. |
| Relative page links, repository-root and parent-folder links | Renders as links under the same room and ref. The companion page serves its heading and anchor. |
| A repository SVG image | Renders at the same room and ref; the image route serves its exact bytes with a sandbox policy. |
| Inline and block HTML | Differs from GitHub: shown as escaped source; a block is in a source box. |
| An unsafe `javascript:` address | Filtered: the link text remains, with an empty address. |
| Footnotes | Unsupported: the reference and definition stay ordinary text. Footnotes are outside the GFM specification; this fixture records the limitation rather than adding another parser extension. |
| Wiki links | Unsupported: `[[Companion]]` stays ordinary text. |

Links and images:

- A relative address, such as `setup.md`, `../README.md` or
  `images/logo.png`, is resolved against the page's own folder and
  written as an address on the same site, at the same ref. A relative
  address cannot reach above the repository's root.
- An address that starts with `/` is taken from the repository's root.
- An address with a scheme (`https:`, `mailto:` and so on), and a link to
  a place in the same page (`#setup`), is left as written.
- A link to a folder, such as `guide`, `guide/`, `./` or `../`, answers
  that folder's index page or list, with or without a final `/`.

The converter's test runs every example of the specification: all 672
render as the specification states, with each example's own extension on
as the specification's runner sets it.

## What does not render

- **Raw HTML.** HTML in a markdown file is shown as text, not passed to
  the browser. An HTML block is shown in a box as its source. This differs
  from GitHub, which passes some HTML through after filtering it.
- **Unsafe link addresses.** A link or image to a `javascript:`,
  `vbscript:`, `file:` or `data:` address has an empty address. An image
  may still use a `data:` address of a PNG, GIF, JPEG or WebP image.
- **Scripts.** Every page is served with a content security policy that
  runs no script. A file served as itself, such as an SVG image, is also
  sandboxed.
- Wiki-style links (`[[Page]]`), footnotes, mathematics, diagrams, emoji
  short codes, syntax highlighting, and `@` mentions and `#` references
  to issues. None of these is in the specification, and none is built.
- A link to another markdown file keeps its `.md` ending. The Worker
  renders that address as a page, so the link works on the site.

## Limits

- **File size.** A file of more than 1 MiB (1,048,576 bytes) is refused
  with `too-large` (status 413).
- **Transfer size.** To read a file, the Worker fetches the commit with
  its whole history from the Git host, limited by the host setting's
  `maxBytes` (docs/hosts.md). A repository whose history is larger than
  that cannot be read, and every page answers `unreadable`.
- **Caching.** An answer may be kept for 60 seconds. Each answer has an
  `ETag` made from the commit, the path, and what the header shows: the
  recorded repository name, the ref as written in the address, and the
  published ref it names. The same file under `HEAD` and its branch name
  has different tags because the headers differ. The room's publication
  selection, repository identity, commit, path, object type and size are
  checked before `304 Not Modified`; a matching tag never bypasses a refusal.
  The versions page's tag covers only the recorded published refs and commits,
  whose commit objects are validated before 304.
- Each page read on the hosting's own Git service mints a read token for
  two minutes and revokes it after the read.

## Refusals

A refusal is plain text: a reason, a colon, and a sentence. It shows
nothing of the repository. A refusal from a failed read also has the
header `x-site-step`, which names the step that failed: `room`, `open`,
`info`, `token`, `refs`, `objects` or `render`. The Worker's log has one
line for it, `site <step>: <error class>: <message>`, with any token,
authorization value and URL query replaced by `[redacted]`.

| Reason | Status | When |
|---|---|---|
| `not-found` | 404 | No room has that directory, or no file or folder is at that path. |
| `not-published` | 404 | The room has no confirmed publication, or has not published the requested ref or commit name. |
| `too-large` | 413 | The file is more than 1 MiB. |
| `bad-request` | 400 | The address is not a site address, or a path segment is empty, `.` or `..`, or holds a `/`. |
| `method-not-allowed` | 405 | The request is not a `GET`. |
| `host-not-configured` | 503 | This deployment does not read that room's Git host, or the room was not created by the register that the host's setting names. |
| `unreadable` | 502 | The room or the repository could not be read. |

## Editing a page

`artroom edit <path> --file <local file>` changes one page (docs/cli.md).
The command opens a change on the room's change lane with a one-file
version: the path, the digest and size of the bytes, and the bytes. The
room judges it by its rules, as any change: a page in an extent that asks
no approval is published on the merger's own act, and one in the rules
extent waits for the rules scope's controller. On merge the destination
writes the published tree with that one file and pushes the new commit,
on the hosting's own Git service and on GitHub the same way. The command
prints the commit and the page's address, `<base-url>/site/<directory>/HEAD/<path>`,
which then serves the file. A page is text: a file of more than 65,536
bytes, or one that is not UTF-8, cannot be edited this way.

## Who can read a site

**Published files are public.** Anyone with the room's directory scope
ID can read every file at its recorded published branch head, with no
session, including files published from a private backing repository.
Other branches, tags and commit names are refused before acquiring provider
access. The Worker reads only the selected commit with its existing host
credentials: a temporary read token on the hosting's own Git service, or
the deployment's existing GitHub read token. GitHub's stable repository ID
must match the room's record before any Git source is acquired. Knowing a
room address does not publish its private repository's other branches.

The selection is a read of the confirmed directory and destination's current
SQLite records. It records no entry, starts no pending operation and changes
no credential custody. Provider branch changes alone do not change the site;
the destination must record the new published head. Missing or unavailable
room records never fall back to provider refs.

A site for members only, which would ask for a read session of the room's
membership, is not built.
