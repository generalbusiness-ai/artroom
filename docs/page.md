# The page

The page uses the accepted [v2 design](../plans/027-artroom-usability/v2/design-review.md)
for the demo story. It
runs in a browser. It reads a room over the scope service's HTTP routes,
and it signs acts with a key that the browser keeps. It judges nothing:
whether an act takes effect is the scope's decision, and the page shows the
scope's answer and refusal reason. An unavailable answer confirms no acceptance;
timed entries may already have been written. Inspect the history before another
act. Recovery requires the same original signed envelope, which generic Page
submission does not retain.

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

1. **Join on the page.** Paste the invitation link, press "Create key",
   then "Join room". The page signs membership's
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
window of an intent, about 15 minutes. Record inspection says which read
method the page is using. The page then reads the directory's repository item for
the rules scope and the destination, and the member's standing in
membership.

## What it shows

| Address | Screen |
|---|---|
| `#/` | Issues, with search and Open, Closed and All filters. Changes uses `#/?kind=change`. Each row keeps its lane's observed state. |
| `#/issue/<scope>` | One issue: number, title, state and close reason, who opened it, assignees, conditions, body and comments. |
| `#/change/<scope>` | One change: where it stands; the current version (base and authors; for a one-file version from `artroom edit`, its path, size and digest and any recorded publication commit; otherwise the integration commit and tree); reviews by extent, against the extents of the rules the lane holds; review requests; checks; links to the issues it closes; each merge with the destination's publication and its outside operations; and comments. Immutable version rendering is unavailable. |
| The site | Pages and **Open latest page** navigate to `/site/<directory>/HEAD/`. These show the latest branch, not an immutable rendered preview. Exact source preview verifies the selected retained signed proposal's subject, digest and size; rendered same-version links and assets remain separate work. |
| `#/rules` | The rules of this room, as the rules scope holds them: the revision, the approvals the lanes count, the extents with their classes, approvals, approvers, checks and paths, whether the single-controller exception is declared, required checks, labels and the active definitions. It says who may change them: the members whose role holds `rules.publish`. |

The account control identifies the member. Record inspection retains the
role, key and read-session evidence. The room switcher uses the recorded
repository name; it does not invent a retained claim display name.

**Actions.** Create issue opens a dialog with Title and Description. The title
also states the completion condition, matching the CLI's issue command.
Comments appear with the conversation. A change has one prominent next action
from its offered native actions; other actions remain under Inspect. Review
uses the selected version and held extent choices. Merge uses that version's
selected issue-report facts in their native order, not checker jobs. Missing
technical facts make the task unavailable instead of asking for guessed IDs.

The page computes offered actions with the same function as `artroom acts`;
native guards remain decisive. Signing fences the visible controls locally
and preserves the subject. The actual answer appears before the optional
observation refresh. The page shows the
actual answer category: accepted with its recorded fact, refused with its
reason and any guard name, unavailable, or mismatch. Before/after heads are
separate observations; a refusal category alone does not show that the head
stayed unchanged. A failed subsequent read keeps the known answer and reports
observation unknown. Inspect the recorded result before another mutation.

Ordinary forms use exact observed item and version defaults. Other forms
remain under Inspect. A scope-bound in-memory fence blocks further signing
while a request is pending, including after navigation. A lost submit reply
keeps that scope read-only. Check status reads; it does not resubmit or treat
a changed head as settlement. Generic submission does not retain its exact
signed envelope across reload, so that recovery limit remains.

List query and filter state survives detail/back navigation and refresh in
this browser session. It is separated by origin, directory, membership, key
and list kind; it supplies no authority for a mutation.

For verified retained one-file text, **Propose an edit** prepares a new change
with Title, Target file path and Text. An invalid old path offers **Create
corrected proposal**. The task derives exact UTF-8 digest and size, names the
recorded published base and warns that current-file comparison is unavailable.
Changing the path leaves the old file. Confirmation creates only a proposal;
it does not review or merge it. Each signed step is kept before POST and a
lost reply stops further steps. Drafts, requests and answers survive only
while this Page remains loaded. Reload recovery remains separately owed.

Join also blocks duplicate requests and checks captured settings before
submission and before selecting an accepted reply. A late accepted answer
is kept in memory for its original context; Use joined room selects that
known result with the original signing key and makes no new Join. Unknown
Join outcomes remain read-only, with the same reload-recovery limitation.
Enrollment custody follows the actual membership incarnation and signing key.
Saving that room or changing the invitation does not release an unknown Join
under the same identity.

The Rules editor changes approval counts and preserves complete checks,
extents, labels and exception values. Only an actually offered `publish`
action exposes it. Changes require before/after confirmation; cancellation
and unchanged values sign nothing.

When an explicitly supplied command-line config contains a full register
reference, the page can read whether its current key may claim there.
Create room appears only for an eligible key with a known member handle,
Web Locks and dialog support. It never installs a register. Its private
claim record retains exact founding and enrollment envelopes plus a separate
recovery key before sending; Resume creation follows those same requests.
Each logical creation has a separate retained operation. Another Create
requires verified completion of the previous active operation; unresolved
work is not replaced. Old operations remain resumable by their exact identity.
The private journal admits at most 64 operations and evicts none to make room.
Context is checked again after a queued lock and before each mutation POST.
The typed name is a local intent label, saved with the exact room context
and shown beside the native generated repository name. It does not replace
the recorded name or travel to another selected room.

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

- **General source authoring.** The retained editor supports one bounded
  UTF-8 text file under a compatible manifest-producing declaration. It does
  not supply packs, multiple files, deletes, renames or binary edits. The new
  LIST1 source-producing declaration needs a separate manifest-freeze step;
  the current editor refuses that shape. Generic inspection forms are not a
  substitute for that missing task workflow.
- **Activating a definition.** The rules scope's `activate` needs the
  definition's bytes, which no scope holds before the activation; use
  `artroom act activate --value`.
- **The infrastructure effect of plan 016.** No definition opens a
  separate effect for an extent. The effect states are those of the Git
  publication's own outside operations.
- **Live updates.** The page reads when a screen is drawn and after an
  act. It does not follow the scopes' streams.

## Tests

`packages/page/test/story.scope.test.ts` runs the page's data functions
against the Worker's routes on a room that the command line founds, with
the real read sessions, the edit command and the site route; the Git host
and the scheduler are labelled stand-ins. `assets.test.ts` checks the
Worker's page module, `states.test.ts` the states of a change, and
`packages/scope/test/page-route.test.ts` the `/page/` route.
`packages/page/test/screens.mjs` takes the screenshots in
`packages/page/test/screenshots`.
