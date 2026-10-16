# The page

The page uses the accepted [v2 design](../../../plans/027-artroom-usability/v2/design-review.md)
for the demo story. It
runs in a browser. It reads a room over the scope service's HTTP routes,
and it signs acts with a key that the browser keeps. It judges nothing:
whether an act takes effect is the scope's decision, and the page shows the
scope's answer and refusal reason. An unavailable answer confirms no acceptance;
timed entries may already have been written. Inspect the journal before another
act. Recovery requires the same original signed envelope, which generic Page
submission does not retain.

The source is `apps/room/page`. The scope Worker serves it at `/page/`, on
the same origin as the routes it reads, so no second deployment and no
cross-origin header is needed. The story test and earlier screenshots use
the test Worker's recorded answers. They do not establish live enrollment;
current delivery evidence is reported separately.

## Build it

From the root of a checkout, after `npm ci`:

```
npm run build --workspace @generalbusiness/dap-page
```

This bundles the page with esbuild and writes three files:
`apps/room/page/dist/index.html` and `page.js`, and
`apps/room/page/assets.ts`, the module from which the scope
Worker serves the two files. That module is committed. The page's test
`assets.test.ts` fails while it differs from a fresh build of the page's
source, so run the build after any change under `apps/room/page/src`, and
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
raw Ed25519 key in the browser's local storage for the origin, which any
script of that origin can read. The private enrollment record also contains
the key and the exact signed Join request, including the invitation secret.
Neither belongs in a URL, log, screenshot or exported diagnostic. Read-session
tokens stay in memory. This is the Page's existing raw-key policy, not the
Counter demo's non-extractable CryptoKey policy. The site route's pages, on
the same origin, run no script (their policy is `default-src 'none'`).

## Open it against a room

Open `<base URL>/page/`. The existing-room chooser offers two paths:

1. **Invitation link.** Choose this path and paste the complete link from
   `dap invite`. The page prepares a browser key and joins automatically.
   There is no key input or manual Join button. Before dispatch, it retains
   and reads back the key and exact signed enrollment request under the
   origin's Web Lock. After verification, it checks the loaded membership
   handle against the invitation before selecting the room.
2. **Config and key.** Paste `config.json` and its matching 32-byte Ed25519
   key as unpadded base64url. The key comes from `keys/device.key`, or
   `keys/operator.key` for the founder, in the command line's config directory.
   Choose **Join room** once. The page verifies the key's actual membership
   before saving the connection and navigating. The connection still uses
   the service that serves this page, regardless of an address in the config.

The saved connection names the directory and the complete membership
reference, including its incarnation. It keeps the selected key under
`artroom-page`. An invitation's complete URL is not saved, but its secret
remains in the private signed enrollment record. The chooser replaces
Settings, Save settings and manual key creation. The old `#/settings`
address opens the chooser.

An unknown enrollment survives redraw and reload. **Check status** reads
its original result and verifies the matching receipt and signed entry;
it sends no replacement enrollment. A newer head does not settle the request.
Do not replace its key or try another invitation while it remains unknown.

After a verified first-attempt refusal, the same invitation remains refused
and sends no new enrollment. Pasting an explicit different invitation reuses
the retained key. The record keeps the original envelope and refusal intact
before dispatching the new request. It holds at most eight prior refusals
within a 64 KiB record; full, malformed or unavailable custody blocks dispatch.
**Check status** remains read-only for refused requests.
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
| `#/change/<scope>` | One change: where it stands; the current version (base and authors; for a one-file version from `dap edit`, its path, size and digest and any recorded publication commit; otherwise the integration commit and tree); reviews by extent, against the extents of the rules the lane holds; review requests; checks; links to the issues it closes; each merge with the destination's publication and its outside operations; and comments. Immutable version rendering is unavailable. |
| The site | Pages and **Open latest page** navigate to `/site/<directory>/HEAD/`. These show the latest branch, not an immutable rendered preview. Exact source preview verifies the selected retained signed proposal's subject, digest and size; rendered same-version links and assets remain separate work. |
| `#/rules` | The rules of this room, as the rules scope holds them: the revision, the approvals the lanes count, the extents with their classes, approvals, approvers, checks and paths, whether the single-controller exception is declared, required checks, labels and the active definitions. It says who may change them: the members whose role holds `rules.publish`. |

Room navigation, the room switcher and the account control appear only
with verified room context. The account identifies the actual member, and
record inspection retains the role, public key ID and read-method evidence.
The room switcher uses the recorded repository name; it does not invent a
retained claim display name. The document title is `dap - workroom <name>`
for that verified name, and `dap - workroom` while entering or when the room
context cannot be verified.

**Actions.** Create issue opens a dialog with Title and Description. The title
also states the completion condition, matching the CLI's issue command.
Comments appear with the conversation. A change has one prominent next act from the native acts it offers; other acts remain under Inspect. Review
uses the selected version and held extent choices. Merge uses that version's
selected issue-report facts in their native order, not checker jobs. Missing
technical facts make the task unavailable instead of asking for guessed IDs.

The page computes the offered acts with the same function as `dap acts`;
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

Invitation enrollment differs from generic forms: its exact key, signed
request and outcome remain in bounded origin-private storage across reload.
The page checks the captured route and connection before dispatch and before
selecting a verified result. A late reply cannot select another context.
Unknown enrollment remains fenced; changing the selected room does not
resolve it. Checking the original request verifies its receipt and exact
signed entry without rekeying or reenrolling.

The Rules editor changes approval counts and preserves complete checks,
extents, labels and exception values. Only an actually offered `publish` act exposes it. Changes require before/after confirmation; cancellation
and unchanged values sign nothing.

When an explicitly supplied command-line config contains a full register
reference, the page can read whether its current key may claim there.
Create room appears only for an eligible key with a known member handle,
Web Locks and dialog support. It never installs a register. Its private
claim record retains exact creation and enrollment envelopes plus a separate
recovery key before sending; Resume creation follows those same requests.
Each logical creation has a separate retained operation. Another Create
requires verified completion of the previous active operation; unresolved
work is not replaced. Old operations remain resumable by their exact identity.
The private journal holds at most 64 operations and evicts none to make room.
Context is checked again after a queued lock and before each mutation POST.
The typed name is a local intent label, saved with the exact room context
and shown beside the native generated repository name. It does not replace
the recorded name or travel to another selected room.

A value is read as `dap act --set` reads it: a list or a record as
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
  not supply packs, multiple files, deletes, renames or binary edits. The known
  LIST1 source-producing declaration records one source, then freezes exactly
  that source in a separate manifest step. Another collected source stops the
  one-file task. A source receipt alone is not a proposed version. Unsupported
  declaration pins remain unavailable.
- **Activating a definition.** The rules scope's `activate` needs the
  definition's bytes, which no scope holds before the activation; use
  `dap act activate --value`.
- **The infrastructure effect of plan 016.** No definition opens a
  separate effect for an extent. The effect states are those of the Git
  publication's own outside operations.
- **Live updates.** The page reads when a screen is drawn and after an
  act. It does not follow the scopes' streams.

## Tests

`apps/room/page/test/story.scope.test.ts` runs the page's data functions
against the Worker's routes on a room that the command line creates, with
the real read sessions, the edit command and the site route; the Git host
and the scheduler are labelled stand-ins. `assets.test.ts` checks the
Worker's page module, `states.test.ts` the states of a change, and
`apps/room/page/test/route.scope.test.ts` the `/page/` route.
`apps/room/page/test/screens.mjs` takes the screenshots in
`apps/room/page/test/screenshots`.
