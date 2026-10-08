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
- `<ref>` is `HEAD`, a branch or a tag. `HEAD` is the room's published
  branch, the one the room's destination writes. For a branch or a tag,
  the Worker looks for a branch of that name first, then a tag. A name
  that holds a `/` is written with `%2F` in its place, such as
  `release%2F1.0`.
- `<path>` is a file or a folder in the repository at that commit.

For example, `<base-url>/site/sc_hs5f27fz.../HEAD/` opens the room's
front page, and `<base-url>/site/sc_hs5f27fz.../v1.0/docs/setup.md` opens
one page at the tag `v1.0`.

Two more addresses:

- `<base-url>/site/<directory>/`, with no ref, redirects (status 302) to
  `<base-url>/site/<directory>/HEAD/`.
- `<base-url>/site/<directory>/versions/` is the versions page: every
  branch and tag of the room's repository, each with the commit it names
  and a link to its root. An annotated tag shows the commit it names, not
  the tag object. The published branch is marked "HEAD, the published
  branch". The list is read from the Git host, as the host advertises it.
  Because of this address, the root of a branch or tag named `versions`
  cannot be opened; its other paths can.

## What every page shows

- **A header.** "Repository:" and the repository's name as the directory
  records it, linking to the root of the same branch or tag; the branch
  or tag shown, such as "branch main (HEAD)", "branch draft" or "tag v1.0";
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
  branch or tag it names. So the same file under `HEAD`, under the branch's name and under a
  tag has three tags. A browser that asks again with that tag, while the
  ref still names the same commit, gets `304 Not Modified`, and the Worker
  reads no file. When the ref moves to a new commit, every page gets a new
  tag. The versions page's tag is made from every branch and tag and the
  object each names, so it changes when any of them moves or is added.
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
| `ref-not-found` | 404 | No branch or tag has that name. |
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

**Every site is public for now.** Anyone who has the room's directory
scope ID can read every page of every branch and tag of the room's
repository, with no session. The Worker reads the repository with its
own access: a read token it mints on the hosting's own Git service, or
the deployment's read token on GitHub. So a private repository's files
are readable through the site by anyone with the address.

A site for members only, which would ask for a read session of the room's
membership, is not built.
