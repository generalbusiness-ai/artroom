# The page

The page is a small client for a room, for the demo story of plan 019. It
runs in a browser. It reads a room over a scope service's HTTP routes, and
it signs acts with a key that the browser keeps. It judges nothing: whether
an act takes effect is the scope's decision, and the page shows the scope's
answer. A refusal writes nothing, and the page shows its reason.

The source is `packages/page`. Nothing is deployed and nothing is published
to a registry. The page has run only against the test Worker.

## Build it

From the root of a checkout, after `npm ci`:

```
npm run build --workspace @generalbusiness/artroom-page
```

This writes two files to `packages/page/dist`: `index.html` and `page.js`,
one bundle made by esbuild. Serve the directory from any static web server,
over HTTPS. Serve it from an origin that runs nothing else, because any
script on that origin can read the key the page keeps (see below).

The scope service must accept requests from the page's origin. The
service's routes set no cross-origin headers today, so the page works when
it is served from the service's own origin, or through a proxy that puts
both on one origin. See "What it does not do yet".

## Open it against a room

Open the page and go to Settings (`#/settings`). Give it three things:

- **The base URL** of the scope service, for example `https://scopes.example`.
- **The directory's scope ID** of the room (`sc_...`). `artroom claim`
  prints it, and an invitation link from `artroom invite` holds it.
- **A key**: the 32-byte Ed25519 secret, as unpadded base64url. The page
  keeps it in the browser's local storage under `artroom-page`, and shows
  only its key ID (`key_...`). "Make a new key" makes one in the browser.
  A new key is no member's until membership enrols it; today a key is
  enrolled with the command line (`artroom join`), which keeps the key as
  base64url text in `keys/device.key` under its config directory. A person
  who joined there can paste that file's content here.

The page then reads the directory, which names membership, the rules scope
and the destination. It asks membership for a read session signed by the
key, and presents it to every later read. If membership gives none, the
page reads without one, and each scope decides.

## What it shows

| Address | Screen |
|---|---|
| `#/` | The room's issues and changes: the directory's index rows, each with its lane's own state. |
| `#/issue/<scope>` | One issue: number, title, state and close reason, who opened it, assignees, conditions, body and comments. |
| `#/change/<scope>` | One change: where it stands; the current version (base, integration commit, tree, authors); reviews by extent, against the extents of the rules the lane holds; review requests; checks; links to the issues it closes; each merge with the destination's publication and its outside operations; and comments. |
| `#/rules` | The rules of this room, as the rules scope holds them: the revision, the approvals the lanes count, the extents with their classes, approvals, approvers, checks and paths, whether the single-controller exception is declared, required checks, labels and the active definitions. It says who may change them: the members whose role holds `rules.publish`. |

Every screen shows who the page acts as: the member's handle and role, or
that the key is no active member's.

**What you may do here.** Under each issue, change and the rules, the page
lists the acts of that scope's definition that the signed-in member may
sign now: each act whose grant action the member's role holds, and each act
that a rule decides. It computes this the way `artroom acts` does, with the
command line's own function. Each act is a form: one input for each field,
typed as the field's declared type reads it, and for a transition the item
it is on. The button signs the act and sends it. The page then shows the
answer: "Took effect" with the entry, or "Refused" with the reason and the
guard's name, and that the scope's head did not move.

A value is read as `artroom act --set` reads it: a list or a record as
JSON, a number for an item, `true` or `false`, and `@handle` for a member.

**Where it stands.** For a change, the page names each of plan 016's states
that the room's records show, with the record it comes from:

| State | Read from |
|---|---|
| waiting for a reviewer | An open review request, while no merge is published. |
| unavailable authority | The scope answered `unavailable`, or refused for a dependency it could not read; or the destination did not reserve the latest merge, `authority-lost`. |
| policy not met | The destination did not reserve the latest merge, `rules-not-met`, with the extents it names; or the lane refused the merge, `approvals-needed`. |
| publication in progress | The latest merge is `intended`, `committed` or `unknown`, or its publication is not final. |
| publication confirmed | The latest merge is `published`. |
| effect queued, unknown, confirmed, refused | Each outside operation of the latest merge's publication, by the result of its last attempt. |

## What it does not do yet

- **Opening an issue or a pull request.** The directory's `open-issue` and
  `open-pr` need the lane definition's bytes beside the act. The page sends
  no value beside an act, so the directory refuses both, `bad-field`. The
  forms are listed, because the member's role holds the action.
- **Proposing a version.** `propose-manifest` needs a hold and a step of
  the hold capability prepared first. The page does not prepare steps.
- **Cross-origin requests.** The scope service's routes set no
  cross-origin headers. Serve the page from the service's origin.
- **Reads on a deployment with read sessions.** The page reads the
  directory before it has a session, because a session request names
  membership, which only the directory names. A deployment with read
  sessions answers a reader with no session `forbidden`. This is the same
  open design question as the command line's `claim`.
- **Joining, and enrolling a key.** The page has no invitation or join
  screen; use the command line.
- **The infrastructure effect of plan 016.** No definition opens a
  separate effect for an extent. The effect states are those of the Git
  publication's own outside operations.
- **Live updates.** The page reads when a screen is drawn and after an
  act. It does not follow the scopes' streams.
- **Editing the rules** is the generic form of `publish`, with the
  extents as JSON. There is no rules editor.
