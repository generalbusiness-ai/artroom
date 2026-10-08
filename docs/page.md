# The page

The page is a small client for a room, for the demo story of plan 019. It
runs in a browser. It reads a room over the scope service's HTTP routes,
and it signs acts with a key that the browser keeps. It judges nothing:
whether an act takes effect is the scope's decision, and the page shows the
scope's answer. A refusal writes nothing, and the page shows its reason.

The source is `packages/page`. The scope Worker serves it at `/page/`, on
the same origin as the routes it reads, so no second deployment and no
cross-origin header is needed. It has run only against the test Worker:
its story test, and screenshots in Chromium answered with the test
Worker's recorded answers.

## Build it

From the root of a checkout, after `npm ci`:

```
npm run build --workspace @generalbusiness/artroom-page
```

This bundles the page with esbuild and writes three files:
`packages/page/dist/index.html` and `page.js`, and
`packages/scope/src/page-assets.ts`, the module from which the scope
Worker serves the two files. That module is committed. The page's test
`assets.test.ts` fails while it differs from a fresh build of the page's
source, so run the build after any change under `packages/page/src`, and
commit the module with the change. Deploying the scope Worker deploys the
page with it.

| Path | Answer |
|---|---|
| `/page` | A redirect to `/page/`. |
| `/page/` | The page's HTML. |
| `/page/page.js` | The page's one script. |
| any other path under `/page/` | `not-found`. |

Each answer carries a content security policy that runs this origin's
scripts only and lets the page read only this origin. The page keeps its
key in the browser's local storage for the origin, which any script of the
origin can read. The site route's pages, on the same origin, run no script
(their policy is `default-src 'none'`).

## Open it against a room

Open `<base URL>/page/` and go to Settings (`#/settings`). Give it:

- **The base URL**, only if the routes are on another origin than the
  page. Empty means the page's own origin, which is the case when the
  scope Worker serves it.
- **The room**: an invitation link from `artroom invite`, or the content of
  the command line's `config.json`. The page keeps only the room it names:
  the directory's scope ID, and membership's scope ID with its
  incarnation, which a session request names. A key that is not yet a
  member cannot read the directory to learn membership, so the page is told
  both.
- **A key**: the 32-byte Ed25519 secret, as unpadded base64url. The page
  keeps it in local storage under `artroom-page`, and shows only its key ID
  (`key_...`).

There are two ways to sign in:

1. **Join on the page.** Paste the invitation link, press "Make a new
   key", then "Join with the invitation link". The page signs membership's
   `join` with the new key and the link's secret. Membership enrols the key
   as the invited member. The link is not kept. A link joins once; a
   second join with it is refused.
2. **Use a key of the command line.** Paste `config.json` as the room and
   the content of `keys/device.key` (or `keys/operator.key` for the
   founder) as the key, from the command line's config directory.

The page then asks membership for a read session signed by the key, and
presents it to every read. A session lasts 600 seconds; the page asks for
a new one before a read when the last one has ended. If membership gives
no session (a key that is no active member's, or a deployment with no
session secret), each read that can be signed goes as a signed read by the
key, and the scope answers only where that key signed an entry in the
window of an intent, about 15 minutes. Every screen says which of the two
the page is using. The page then reads the directory's repository item for
the rules scope and the destination, and the member's standing in
membership.

## What it shows

| Address | Screen |
|---|---|
| `#/` | The room's issues and changes: the directory's index rows, each with its lane's own state. |
| `#/issue/<scope>` | One issue: number, title, state and close reason, who opened it, assignees, conditions, body and comments. |
| `#/change/<scope>` | One change: where it stands; the current version (base and authors; for a one-file version from `artroom edit`, the file's path, size and digest and a link to its rendered page on the site; otherwise the integration commit and tree); reviews by extent, against the extents of the rules the lane holds; review requests; checks; links to the issues it closes; each merge with the destination's publication and its outside operations; and comments. |
| The site | The room screen links to the published site, `/site/<directory>/HEAD/`, and a one-file version links to its path there. The site serves the published branch, so the file appears there once the merge is published. |
| `#/rules` | The rules of this room, as the rules scope holds them: the revision, the approvals the lanes count, the extents with their classes, approvals, approvers, checks and paths, whether the single-controller exception is declared, required checks, labels and the active definitions. It says who may change them: the members whose role holds `rules.publish`. |

Every screen shows who the page acts as: the member's handle and role, or
that the key is no active member's.

**What you may do here.** Under the room, each issue, each change and the rules, the page
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

A field that takes a definition's bytes at a stated place, as the
directory's `open-issue` and `open-pr` do, is a choice of the definitions
that the rules scope holds active. The page reads the chosen definition's
bytes from the rules scope, which retained them when it activated the
definition, and sends them beside the act. So a member can open an issue
or a change from the page.

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

- **Proposing a version from the page.** `propose-file` is listed as a
  generic form, which needs the base commit, the content, its digest and
  its size typed by hand; use `artroom edit`. `propose-manifest` needs a
  hold and a step of the hold capability prepared first, which the page
  does not prepare.
- **Activating a definition.** The rules scope's `activate` needs the
  definition's bytes, which no scope holds before the activation; use
  `artroom act activate --value`.
- **The infrastructure effect of plan 016.** No definition opens a
  separate effect for an extent. The effect states are those of the Git
  publication's own outside operations.
- **Live updates.** The page reads when a screen is drawn and after an
  act. It does not follow the scopes' streams.
- **Editing the rules** is the generic form of `publish`, with the
  extents as JSON. There is no rules editor.
- **Another origin.** The routes set no cross-origin headers. A page
  served elsewhere than the scope Worker cannot read them.

## Tests

`packages/page/test/story.scope.test.ts` runs the page's data functions
against the Worker's routes on a room that the command line founds, with
the real read sessions, the edit command and the site route; the Git host
and the scheduler are labelled stand-ins. `assets.test.ts` checks the
Worker's page module, `states.test.ts` the states of a change, and
`packages/scope/test/page-route.test.ts` the `/page/` route.
`packages/page/test/screens.mjs` takes the screenshots in
`packages/page/test/screenshots`.
