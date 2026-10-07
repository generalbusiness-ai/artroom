# Plan 025: published pages, a documentation site from a room's repository

2026-10-07. Hugh's direction of this morning: a knowledge-base repository,
folders of markdown published as a site, is a use of Artroom worth planning
now. This plan says what exists, what is missing, how the pieces are
packaged and installed, and in what order they are built. It follows the
demo gates of plan 024 and does not move before them.

Scope, as hugh set it: markdown links and images, with GitHub Flavored
Markdown as the completeness bar. No wiki-style links and no sync with a
local notes editor; both wait for an explicit story, which is not planned
yet. Versions are branches and tags, as a documentation site shows them.

## 1. The nouns

- **Room.** A claimed repository with its directory, membership, rules
  scope and destination, as today.
- **Repository.** The room's Git repository at its host. With the room's
  own host (the hosting's Git service, gate 1b) it needs no outside
  credential; with GitHub it needs the App.
- **Page.** A markdown file in the published branch. Its address is its
  path. An image or other file next to it is an **asset**.
- **Site.** The rendered pages of one branch or tag of one room, served
  under the room's address.
- **Read token.** A short-lived credential for the repository, issued by
  the room, that lets a person or the renderer read.
- **Pages application.** The bundle that makes a room a site: lane
  definitions for page changes, a rules configuration, and the renderer's
  route.

## 2. The verbs

- **Publish.** The room's destination pushes the branch, as today. Nothing
  else writes the repository.
- **Render.** The Worker serves a page: it reads the file at the branch's
  head through the host, converts it, and answers with caching by commit.
- **Edit a page.** One act that proposes a change to one file. It is a
  change with a one-file manifest, judged by the rules and published by
  the room. It rests on gate 2's lane wiring and the propose-from-branch
  command of design request R5, of which it is the small case.
- **Clone.** A member gets a read token from the room and clones the
  repository, works offline, and proposes later (R5).
- **Issue a read token.** The room mints a read credential for a session
  or for the renderer, with a lifetime, recorded like every credential.

## 3. The invariants, and where each one lives

| Invariant | Where it is enforced |
|---|---|
| Only the room writes the published branch | The destination's one grant per publication; the gateway |
| A page is served only from a published commit | The renderer reads by commit from the host, never from a proposal |
| A section's pages change only as its rules allow | The rules scope's extents: a folder is an extent, with its approvals and required checks |
| A read token names one repository, one scope and an end | The host's tokens are per repository, read or write, with a lifetime; the room records each one |
| A public site needs no session; a members-only site needs one | The renderer's route: a public site renders with the room's own read; a members-only site renders for a session of the room's membership |
| What is rendered is what GitHub would render | The renderer's conformance tests against the GitHub Flavored Markdown specification's examples |

## 4. What exists and what is missing

| Piece | State | Rests on |
|---|---|---|
| Repository, publication, founding commit | Live on both hosts (gate 1 and 1b, 2026-10-07) | |
| Membership, invite, join, sessions | In the command line | |
| Rules by extent, required checks | Designed and built in the rules scope; the pinned demo profile is gate 2's | gate 2 |
| Read tokens issued by the room; `artroom clone` | Missing. The host's repositories are token-only | gate 1b landed |
| Renderer route on the Worker | Missing | |
| GitHub Flavored Markdown conversion with relative links and images | Missing | renderer |
| Index, navigation, versions by branch and tag | Missing | renderer |
| Edit a page as one act | Missing | gate 2, R5 |
| The pages application as an installable bundle | Missing | section 5 |

## 5. Packaging and install

An application is three things: lane definitions, a rules configuration
and client code. Definitions are addressed by digest and read by the
directory from the rules scope, never carried by a client.

- **First form.** A preset in the command line: `artroom claim <name>
  --app pages` seeds the new room's rules scope with the application's
  definitions and configuration, and the Worker serves the renderer's
  route for every room that carries that configuration.
- **Second form, the self-hosting one.** The application is itself a
  published repository: `--app` names a room and a commit, and the
  definitions and configuration are read from there by digest. Then a
  pages application and the jam are the same kind of thing.

The first form is enough for the first site. The second form is the one
to design once the first is in use.

## 6. The renderer, in one page

A route on the scope Worker, `/site/<directory>/<ref>/<path>`, reads the
file at `<path>` in `<ref>` of the room's repository through the host
(the binding's tree reads on the room's own host; the smart-HTTP read
client on GitHub), converts the markdown, resolves relative links and
images against the page's path, and answers with a cache key of the
commit and the path. A missing page is a plain refusal. An index page
lists the folder. No build step, no second repository, no state beyond
the cache.

## 7. Order of work

1. After gate 1b lands: the room-issued read token and `artroom clone`.
2. The renderer route with GitHub Flavored Markdown conformance, links
   and images, index and versions. A cloud session can build it from the
   gate 1b branch; the planner runs it live.
3. After gate 2: the edit-a-page act, beside the propose command of R5.
4. The pages application as a command line preset; then its second form.

None of this is on the demo path except the read token and clone, which
the demo needs too. The rest starts when the gates of plan 024 have passed.
