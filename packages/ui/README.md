# Artroom UI

> **Test file names below may be out of date.** Each section names the tests as they were when it was written. Request `ecbc722a` later merged and removed many test files; [plans/test-invariants.md](../../plans/test-invariants.md) is the current map from each invariant to its test.

The web interface for Artroom: five screens over one data adapter.

| Screen | What it shows |
|---|---|
| **Needs you** | The viewer's attention queue. Each item says what to do, why it is theirs, and offers one action. |
| **Room** | Claims and their overlaps (before any code exists), lanes and leases, the landing operations, the publication slot, and how far the log is published. Live. |
| **Proposal** | One generation: the diff, notes anchored to path, line and head, the obligations as a checklist, each piece of evidence marked *reviewed here*, *carried* (with the reason) or *stale* (with the reason), each check carry judgment from its `check-carried` event, advisory checks listed apart as never blocking, and "why" links. When commits carry jj `change-id` headers, also which changes the generation rewrote, added or dropped, with an interdiff for each rewritten one. |
| **Policy** | The rules in plain English, recent outcomes, and a dry run of a draft rule against the room's history. |
| **Acts** | What the room's policy lets people do, in the room's own words: each declared act with its label, help and who may sign it, and a form built from the declaration to prepare and send one. See "Declared acts". |

It is built with Preact and Vite, with hand-written CSS. It has no component
library. It is served as Workers static assets.

**Baseline.** The UI builds against the contract on `main` at `0d8f04c`
(contract unchanged since `ca61351`): the
approved lane 0 contract (`940e2dca`) with the policy-runtime amendment
(path/owner pairs, replay contexts, the per-act budget in `ProfileStamp`,
check carry facts), and contract amendment 3 (`bc351fa8`, on `main` at
`fb2bd41`): advisory obligations and `check-carried` events. It also uses the policy runtime
(`@generalbusiness/artroom-policy`) for glob matching, carry decisions and
the policy dry run, and lane B's git engine (`@generalbusiness/artroom-git`)
for the bounded tree diff behind the per-change history.

## Run it

From the repository root:

```sh
npm install
npm run dev -w @generalbusiness/artroom-ui      # http://localhost:5173
```

The page runs on a **mock room** that replays a scripted scenario. URL
options:

| Option | Effect |
|---|---|
| `?step=N` | Open the scenario at step N. The default is step 22: a publication is stuck, and one verdict carried while another went stale. |
| `?viewer=@sam` | Show another member's queue. The top bar also has a "Viewing as" menu. |
| `?dev` | Show the demo timeline: play, pause, step. The footer's "Replay the scenario" button and the <kbd>d</kbd> key do the same. |
| `?theme=dark` | Force a theme: `light`, `dark` or `system`. The top bar's theme button cycles them. |
| `?app=setlist` | Open the second demo room instead: a band's setlist, whose policy declares its own five acts and none of the review ones. `?viewer=@ivo` works here too. |

Keyboard: <kbd>1</kbd> Needs you, <kbd>2</kbd> Room, <kbd>3</kbd> Policy,
<kbd>4</kbd> Acts, <kbd>j</kbd>/<kbd>k</kbd> next and previous item, <kbd>?</kbd> help. With
the timeline open, <kbd>,</kbd> and <kbd>.</kbd> step back and forward.

## Test it

```sh
cd packages/ui
npm run typecheck                       # see the note below
npm test                                # vitest: component and adapter tests (happy-dom)
npx playwright install chromium         # once
npm run e2e                             # Playwright, headless: builds, serves, walks the scenario
```

The vitest files, by what they protect. The sections below record earlier
reviews as they were answered; where they name a `test/review-*.test.tsx`
file, `test/policy-runtime.test.ts` or `test/amendment-3.test.tsx`, the cases
are now in the files of this table.

| File | What it protects |
|---|---|
| `test/screens.test.tsx` | The five screens over the scripted room, note threads bound to their head, and the why dialog (review 82f2743b, P2.4 and P2.5) |
| `test/acts-screen.test.tsx` | The Acts screen: a form built from a declaration, a stale meaning never sent without the person confirming, and a lost answer shown as unresolved and asked again with the same key (review fb27de86) |
| `test/acts-fields.test.ts` | Reading typed fields and targets with the declared limits; what changed between two meanings |
| `test/declared-rendering.test.tsx` | Every record shown under the declarations of its own seq; thread names from the opening act's own declaration (decision c37653e1) |
| `test/live-catalogue.test.ts` | The page's catalogue never goes back behind an activation it confirmed (reviews fcd7391d, 0fd98c41, 8df737b8 and fb27de86) |
| `test/live-room.test.tsx` | The live adapter over the contract's reads: no workspace token, partial reads shown as partial (review 82f2743b, P2.6), check-carried events |
| `test/publication.test.tsx` | What the page says about an unresolved publication and a finished landing (reviews 82f2743b and 88a20f74) |
| `test/checks.test.tsx` | Advisory checks never shown as blocking; a carried check's reason from its own event (amendment 3, review a4241e41) |
| `test/change-history.test.tsx` | The per-change history and its interdiff (reviews 125ee638 and f3fff92c) |
| `test/dry-run.test.ts` | A draft rule's preview agrees with the policy runtime, and is validated first (reviews 82f2743b, P1.1 and 88a20f74, P2) |

The scripted room and the in-memory room in `src/room/mock` are stand-ins.
The tests use them to drive the page and the live adapter; they do not test
the stand-ins' own behaviour, which shows nothing about a real Room.

`npm run typecheck` first generates declarations for the policy runtime into
`.types/` (git-ignored) and checks the UI against them. The runtime's sources
assume a non-DOM library, and the UI needs the DOM, so the UI checks against
declarations generated from those sources rather than a hand-written copy.

`npm run e2e` also rewrites the screenshots in `screenshots/`. The request
asked for `ui/screenshots`; they are in `packages/ui/screenshots`:

- `needs-you-light.png`, `needs-you-dark.png`, `needs-you-phone.png`
- `room-light.png`, `room-dark.png`
- `proposal-light.png`, `proposal-dark.png`, `proposal-phone.png`
- `proposal-carry-light.png`: step 28, a carried and a not-carried check, and the advisory check
- `policy-light.png`, `policy-dark.png`
- `proposal-changes-light.png`, `proposal-changes-dark.png`: the per-change history of the session lane's recut

Laptop screenshots are 1280 pixels wide; phone screenshots are 390. The clock
is UTC and motion is reduced, so the screenshots are reproducible.

## Deploy it

`wrangler.jsonc` serves `dist/` as static assets, with single-page fallback.
It has not been deployed.

```sh
npm run build
npx wrangler deploy
```

## How it is built

```
src/room/contract.ts     the only import of @generalbusiness/artroom-contract
src/room/adapter.ts      RoomAdapter and the view model (RoomSnapshot, Coverage)
src/room/glob.ts         path matching and overlap, from the policy runtime
src/room/refuse-claim.ts the refuse-claim draft compiled to a profile expression, and its TypeScript twin
src/room/mock/           MockRoom: a small deterministic room model and the scripted scenario
src/room/live/           LiveRoom: a stub over the contract's HttpRoom and its WebSocket watch
src/room/acts.ts         declared acts: reading typed fields and targets, a record under its own meaning, what changed between two meanings
src/room/mock/memory-room.ts   an in-memory room with declared acts, behind the live adapter
src/room/mock/setlist.ts       a small application that is not code review, and declared-room.ts, its demo
src/room/dryrun.ts       the policy dry run, through the policy runtime
src/room/changes.ts      per-change history and interdiffs from jj change-id headers
src/room/mock/repo.ts    an in-memory git object store, read through lane B's TreeReader
src/ui/ChangeHistory.tsx the per-change view on the Proposal screen
src/screens/             the five screens
src/ui/landing.tsx       what each landing state means, from its recorded facts
src/ui/                  shell pieces: icons, badges, router, the "why" dialog, the demo bar
```

Screens read a `RoomSnapshot` and call the adapter. They never touch a
transport. Contract records (`Lane`, `Proposal`, `LandOp`, `AttentionItem`,
`Refusal`, `Evidence`) pass through unchanged, so a change in the contract
(lane 0) is absorbed in `src/room`.

**The scenario.** Three agents (@ash, @birch, @cedar), two people (@maya,
security; @sam, platform and admin) and a checker (@ci) work in `acme/web`
for 44 minutes, in 37 steps:

1. @ash and @birch claim overlapping scopes. The overlap shows before any code.
2. Policy refuses @birch's first claim (a migration); the platform refuses a
   proposal outside its claim. Both show the rule and the fix.
3. @maya approves generation 1 of the rate limit and declares a dependency on
   `src/lib/authz/**`. Generation 2 changes `src/lib/authz/check.ts`: @sam's
   approval carries, and @maya's goes stale, each with its reason.
4. Two landings prepare in parallel. The first one's publication is
   unresolved, so it keeps the slot and the second waits, ready. The push
   completes forward; main moves; the second prepares again and lands.
5. An advisory LLM review fails on generation 2 of the rate limit and again on
   its landing integration. It is shown apart, as never blocking, and the
   landing proceeds. Each landing preparation judges each passing check for
   the new integration and records a `check-carried` event: the tests check
   carries while main is unchanged and does not carry once main moves. A
   failed check is never carried: a required one keeps the landing waiting,
   and an advisory one does not.
6. @birch's lease expires with no handover note. Its proposal now conflicts
   with main. @cedar takes the lane over and recuts it. @birch worked in jj,
   so the recut's page shows the per-change history: one change rewritten
   with a real edit, one only rebased, one added and one dropped.

The mock applies the platform's rules to the viewer's actions too: approve or
object from the Proposal screen, reply to notes, or run a dry run. A review
from someone who is not a needed reviewer is refused with
`not-authorized-reviewer` and its fix.

**Tokens.** The UI never asks for a workspace token and never shows one. The
mock holds none. A test renders a live room whose transport has a token
available and checks that it is never requested or displayed.

**Accessibility.** Semantic landmarks and headings, labelled controls, a skip
link, visible focus rings, focus moved to the page on navigation, and
`prefers-reduced-motion`. Status colours always come with words. The colour
pairs used for text meet WCAG AA contrast (checked by calculation for the
main token pairs in both themes; no automated audit has been run).

## Per-change history (request d0cbb26d)

When a generation's commits carry jj `change-id` headers, the Proposal
screen lists, by change ID, which changes the generation rewrote, added or
dropped compared with the previous generation. Each rewritten change has an
interdiff: each version of the change is a patch against its own parent, and
the two patches are compared, so changes underneath it (main moving) mostly
do not show. A patch keeps, for each path, what the commit did (added,
modified, deleted or renamed, the rename source, the file modes) and its
hunks with three lines of context. The interdiff lists a path when that
metadata differs, said in words, or when a hunk, context included, is in only
one version, or is in both but at different places; each such hunk is shown
with its line numbers. A hunk's place is where it starts in the file it was
made against (its parent). When the two versions' parents differ at that
path, the old hunk's parent lines are mapped into the new parent by a line
diff of the two parents. So a rebase that only moves an edit up or down does
not show, and one that changes a line within three lines of an edit shows
that hunk from both versions. When the old hunk's lines do not map one to
one (the parent changed inside them) and the new version has the same hunk,
the screen says it **could not tell whether the edit moved**, rather than
calling it the same. A change only rebased or reworded says so. When no commit in either generation has a header, the
screen shows nothing extra. Commits without a header beside ones with a
header are counted, not followed. The same change ID twice in a generation
is shown as divergent and not matched.

The view is labelled **author-supplied**. A header proves nothing, so it is
never an input to obligations, evidence or the carry rule, which stay
path-based. A test checks that no change ID reaches those records.

**Bounds.** Each commit's own diff runs through lane B's bounded tree diff
(`treeDiff` with `DEFAULT_BOUNDS`: depth 64, 100,000 entries), and a
generation of more than 2,000 commits (`maxCommits`) is not compared. A
proposal's diff has the same bounds. Lane B bounds paths, not file contents,
so this view adds bounds of its own (`LINE_BOUNDS` in `src/room/changes.ts`),
which do not apply to the proposal's diff:

| Bound | Limit |
|---|---|
| Lines in one version of a file | 2,000 |
| UTF-8 bytes in one line | 10,000 |
| Work for one comparison of two generations, all its changes together: one unit per character read, plus one per pair of lines compared | 20,000,000 |

Over any bound, the interdiff says "too large to compare here" and names the
bound; once the work is spent, every later rewritten change says so too.
Lines are numbered before the comparison, so comparing two lines costs the
same whatever their length. The line comparison is synchronous, but no single
file can cost more than 2,000 × 2,000 pairs, and the reads between files give
the page back to the browser. A blob is read whole before its lines are
counted: the `TreeReader` gives no size, so a live Room should refuse an
oversized blob when it serves it.

**What the live Room must expose.** The contract has no read for a
generation's commits (contract gap 10), so `LiveRoom` has no
`changeHistory` (the adapter method is optional) and the live
screen shows nothing extra. To support it, the Room would need to serve, per
proposal generation:
1. the commits from the generation's base to its head, oldest first, each
   with its ID, parent and message subject, and its raw `change-id` header
   when present;
2. read access to those commits' trees and blobs in the canonical repository
   (the pinned heads' objects), as lane B's `TreeReader` plus a blob read, or
   the per-change interdiffs computed server-side under the same bounds.

`src/room/changes.ts` takes exactly these (`CommitInfo[]` and a
`CommitStore`), so either form plugs into the existing adapter.

## Declared acts

Declared acts stage 5 (request `a5d64b35`, clarification `fa120186`;
docs/protocol.md section 33). A room's policy can declare its own acts. The
UI reads them and never assumes the review verbs.

**Old records keep the meaning they had.** Each act and each recorded
refusal is read under the declarations in force at its own entry, `D(s)`,
never under the active ones (R-DECL-23). The live adapter reads one
catalogue for each policy version in the loaded window (`actsAt({ seq })`)
and builds each feed entry from it (`src/room/live/describe.ts`):

- A declared record shows who, the label in force at its entry, its target
  in words, and each body field by name.
- A kind that a later policy dropped shows "Retired at seq N". If a still
  later policy declares the name again, the old record keeps the old label,
  fields and retirement. Two meanings of one name differ by binding.
- A label-only edit does not change the binding. The old record still shows
  the old label, because it is read under its own entry's policy.
- A legacy record, and `renew` and `roster` in every room, keep the
  sentences they always had.
- A record made under the code-review declaration keeps the code-review
  sentence. That is decided by binding, not by name: a room that declares a
  different `claim` gets the generic rendering.
- A record whose kind the policy in force did not declare is shown plainly
  with its kind and fields. It is never dropped.
- When a room cannot give its declarations, only a `v: 1` record of one of
  the nine legacy kinds is read as one. Anything else says its meaning
  could not be read.

After an activation the earlier catalogues are read again, because a new
policy can retire a kind of an earlier one.

**Evidence by step.** Reviews, checks and notes for the Proposal screen are
rebuilt from the log by the step a record ran (`review`, `check`,
`comment`) under its own declaration, so an application's own name for a
review still counts. Legacy records are matched by kind, as before.

**The act form** (`src/screens/Acts.tsx`, `src/room/acts.ts`). It lists
the active declarations and builds a form for one from
`fieldsOf(declaration, shape)`: an input per field by type, required fields
marked, and the declared limits checked before anything is sent. It sends
once, with the binding of the declarations the person chose the act from.
A refresh of the snapshot behind an open form does not change the form.

- On `binding-stale` the form says the meaning changed, reads the
  declarations again, lists what changed, and sends again only when the
  person presses "Send it with the new meaning". If the new meaning needs a
  field the form does not have yet, nothing is sent until it is filled in.
- When the room's answer does not arrive, and the error says the act may
  have been recorded, the form says the outcome is unresolved. It never
  says the act was not taken. "Ask again, the same act" sends exactly
  what was sent, with the same idempotency key: the room returns the
  record it made, or records the act once (R-IDEM-2). Until then the form
  sends no other act.
- On `kind-undeclared` it says the room no longer has that act and returns
  to the list.
- Any other refusal shows the room's rule with the reason and fix as given,
  since a declaration may word them.

The UI's checks are a courtesy. The room decides again at admission.

**The second demo room** (`?app=setlist`; `src/room/mock/declared-room.ts`).
It is the live adapter over an in-memory room (`memory-room.ts`) whose
policy declares five acts for a band's setlist (`setlist.ts`): start a
song, add a part, cue, sign off, wrap up. A second policy version renames
one, reshapes another and drops a third, so the feed shows each case
above. The in-memory room is a stand-in: it has no signatures, expiring
leases, policy rules or landing. It answers a generic act's idempotency
key as the Room does (R-IDEM-2 to R-IDEM-4).

**Not done here.**

- The form has no input for `because` (the reasons an act rests on).
- The form does not send `recover` or the platform kinds.
- After a lost answer the form asks again only when the person says so.
- An act whose outcome is unknown belongs to the Acts screen, not to the
  form, so it outlasts a failed read of the room's acts. While the acts
  cannot be read the page says so, sends no new act, and still offers
  "Ask again, the same act" and "Leave it". "Send it with the new meaning"
  waits too (reviews `0b33e8cc`, `12b1e0a9`).
  It keeps the act and its idempotency key for as long as the form stays
  open: it does not store them, so closing the page loses them, and the
  act's outcome is then read from the feed.
- The Room, Proposal and Needs-you screens keep the review application's
  wording ("lane", "claim", "generation"). A thread opened by another
  application's act is named by that act's label and its first text field
  by name, read with the declaration in force when the thread opened.
- Steps and hold settings the Room does not run until stage 4 (hand-over,
  scope templates, reservations, comments with no anchor, two steps in one
  act) are described by `fieldsOf` already, so the form needs no change
  when they arrive, but nothing here has exercised them.

## Contract gaps

Things the UI needs that the lane 0 contract does not provide yet. The mock
supplies them; the live adapter reports them as unavailable.

1. **No diff read.** The Proposal screen needs the diff of a generation and
   the paths changed between two generations. The contract has only
   `Proposal.changed` and, on carried evidence, `CarryReason.changed`.
2. **No read of acts by ID.** Reviews, checks and notes are rebuilt from log
   envelopes, which loses `Review.fulfils`.
3. **No read of landing operations or the publication slot.** `PublicationSlot`
   is a type, but no method returns it. Only in-flight operations are
   reachable, through `Lane.landing`; finished ones are not listed. The live
   adapter shows the slot as held only when a loaded landing holds it, and
   otherwise as unavailable, never as free.
4. **No read of main**: its head and when it last moved.
5. **No read of the active policy's rules, and no dry-run method.** Plan
   section 12 asks for a dry run against history. The demo room runs it with
   the policy runtime over the rule inputs it recorded; a live room would
   need the retained replay contexts (R-LOG-7). Declared acts stage 5 closes
   part of this gap: the live adapter now reads the active policy version,
   the entry it took effect at, and its declared acts with their bindings
   (`acts()`), and the declarations in force at any entry (`actsAt()`). The
   rules themselves (`refuse`, `require`, `carry`, `land`, `notify`) still
   have no read, so the Policy screen shows a live room's version and
   outcomes but not its rules.
6. **`NotCarried` does not name its obligation.** The UI infers it from the
   previous generation's evidence.
7. **No way to dismiss a notify-only attention item** (`why: "policy"`).
8. **`Update` carries only entry summaries**, so the live adapter reloads its
   reads on every update. It follows every cursor (up to 20 pages, and only
   while the cursor advances) and reads the newest 500 log entries. Whatever
   it could not read is marked in `RoomSnapshot.coverage`, and the screens say
   so instead of claiming "nothing" or "all".
9. **The page is not wired to a live room.** The client package now
   implements `connect()`, but the UI does not depend on it: `LiveRoom` still
   takes an `HttpRoom` from its caller, and `main.tsx` runs only the two demo
   rooms. Wiring it means a sign-in flow and key custody in the browser,
   which is its own piece of work. Declared acts stage 5 did not change
   this. What it did change: `LiveRoom` now uses the handle's `acts`,
   `actsAt` and `act`, so a caller that passes a connected handle gets the
   declared-acts reads and the generic act with no further change here.
10. **No read of a generation's commits** (open point 39). The per-change
    history is not shown in a live room, and the UI does not build it from
    anything else.

The demo room admits acts synchronously, so each JSONata rule in its policy
has a TypeScript twin. Tests check every twin against the policy runtime's
evaluator on every scenario act. The dry run never uses a twin: it runs the
policy runtime itself. It supports four kinds of draft: a required review, a
refused claim, a default dependency and a global input.

## Review 82f2743b

Checker reviewed head `5cc8c17b` and asked for six changes. Each is now
covered by tests (`test/policy-runtime.test.ts`,
`test/review-82f2743b.test.tsx`).

1. **P1 — the policy preview and the exported rule disagreed.** The dry run
   now replays the room's recorded rule inputs through the policy runtime
   (`evaluateRefuse`, `evaluateRequire`, `evaluateCarry`) under the active
   policy and under the draft. The preview is therefore the compiled rule's
   own answer. A refuse-claim draft compiles to a profile expression that uses
   only `$substring`, `$count` and comparisons, with literal text quoted as JSON
   strings. It catches broad patterns such as `**` and `m*`. A pattern it
   cannot express (anything but a literal path or `dir/**`) is reported as
   "cannot be written as a faithful rule", and nothing is replayed. Where the
   compiled rule and path overlap (R-PATH-3) still disagree about a claim, the
   screen lists those claims. Tests compare the expression, its twin and the
   dry run with the real evaluator for broad, intersecting, disjoint, quoted
   and non-ASCII patterns.
2. **P1 — publication recovery was described wrongly.** `src/ui/landing.tsx`
   describes each landing from its recorded read-back and abort facts. The
   expected main without an abort means the room pushes the same reserved commit
   forward. Another writer on main means the room stopped pushing, and an admin
   must reconcile main. An abort attempt means forward pushes stopped; the
   screen shows the trigger, whether the token was revoked, the read-back, and
   the possible outcomes (landed with a revert lane, or aborted). The
   after-reservation note now names the compromise exception. The live
   adapter's event sentences follow the same facts.
3. **P2 — failed landings hid their reason.** A refused failure shows the
   refusal's rule, reason and fix. A retryable outcome shows its reason and
   recorded fix. A conflict names its paths. A failed check links to the check.
4. **P2 — note threads were projected onto newer heads.** A thread is placed on
   another head's lines only when the interdiff of every generation in between
   is known and leaves the file unchanged. Otherwise it stays with its own head,
   in "Notes written on other heads", which says whether the file changed or
   whether that is not known.
5. **P2 — a late explanation could replace the current one.** Each explain
   request has a number, and only the latest one may update the dialog.
   Closing, changing the act and unmounting all invalidate earlier requests. A
   failed request shows an error with "Try again".
6. **P2 — partial live reads looked complete.** See contract gap 8. The
   publication lag comes from the log's own counters (`head` and
   `publishedThrough`). The slot is "Unavailable" when it cannot be read.

## Review 88a20f74

Checker reviewed head `c5cf189f` and asked for two changes and one
screenshot fix. Main at `0d8f04cf` (the lane D policy pack) is merged first.
Tests are in `test/review-88a20f74.test.tsx`.

1. **P1 — live sentences still promised forward pushes after an abort.** A
   `publication-unresolved` event records only its operation and what main
   read back. So its sentence now says only that ("main read back as the
   expected main, so the push had not landed", or the commit main showed).
   What the room does next is added only from the loaded operation
   (`src/room/recovery.ts`, shared with the landing cards): "Abort attempt in
   progress", "another writer", or "pushes the same reserved commit forward".
   When the operation is not loaded, the sentence says the current state is
   not known; it never assumes there was no abort. Explain titles use the same
   rule. Tests: abort before the first unresolved event, truncated history
   with a loaded abort, no loaded operation, ordinary forward completion,
   unexpected main, and the explain title.
2. **P2 — a dry run could preview a policy the room would refuse.**
   `compileDraft` now runs the policy runtime's `validatePolicy` on the whole
   compiled document before anything is evaluated. If it is invalid, the dry
   run returns the validation problems and a fix, and no prediction. This
   covers all four kinds of draft: a duplicate rule ID, and patterns outside
   the glob syntax. Unsupported refuse-claim target shapes are still refused
   before validation, and a valid draft of each kind still replays.
3. **Screenshots.** The phone screenshot now waits for the diff to load, as the
   laptop one does, so it captures the whole page.

## Contract amendment 3

Lane F's edits for amendment 3 (`docs/protocol.md` section 29.8). Tests are in
`test/amendment-3.test.tsx`.

1. **Advisory obligations never block (R-OBL-7).** A check obligation with
   `advisory: true` is listed under "Advisory checks", apart from "Before it
   can land", and is not counted there or on the room's lane card. A failing
   advisory check says that it does not block a landing.
2. **Check carry is shown from its event (R-CARRY-13).** `check-carried`
   events are in the activity feed and in `RoomSnapshot.checkCarries`. Each
   check obligation lists its judgments: carried, with the reason from the
   event, or not carried, with why; a judgment under another policy version
   says it does not count under this one. Carried check evidence shows the
   reason only from an event that names the generation's merge preview, its
   integration and the obligation's policy version (review `a4241e41`). If
   no such event is loaded, or the preview has no integration, it says so
   and shows no reason.
3. **No per-change history in a live room (open point 39).** See contract
   gap 10.

## Review 125ee638

Checker reviewed head `048b2d51` (the per-change history) and asked for two
changes, a security bound and two simplifications. Main at `fb2bd41` (contract
amendment 3) is merged first. Tests are in `test/review-125ee638.test.tsx`;
the checker's three diagnostics are among them, now asserting the correct
outcome.

1. **P2: tree-change metadata was lost.** A patch now keeps, for each path,
   its status, rename source and old and new modes (`FileMeta`). A path whose
   metadata differs between the versions is listed, and the screen says what
   each version did ("renames it from y.txt; generation 1's renames it from
   x.txt", "edits it, mode 100644 to 100755; generation 1's leaves it
   alone"). Tests: "a different rename destination is a difference", "a
   different rename source is a difference", "setting the executable bit in
   one version only is a difference", "the same text edit, with the executable
   bit set only in the new version, is a difference", and the control "the
   same rename and the same mode change, rebased, are not a difference".
2. **P2: edits at different places looked the same.** Hunks keep three lines
   of context and their line numbers (`Hunk`). Two versions match on a hunk
   only when its lines, context included, are equal; line numbers are not
   compared. Tests: "denying in first() and denying in second() are different
   edits" (each version's hunk names its function) and the control "the same
   edit, moved down by a rebase that changed lines far from it, is not a
   difference". The existing rebase-only control (whoami, `tkxlpsuy`) still
   says "the same edits". In the scenario, `check.ts` now shows once more in
   the first change: `rateKey()`'s body, two lines above the `currentUser`
   edit, changed underneath it, so that hunk's context differs. The test "a
   rewritten change's interdiff shows only how its own edits differ" asserts
   this, and that the import edit, whose context did not change, is not
   listed.
3. **Security: bytes per line and total work were not bounded.** See
   **Bounds** above: 10,000 UTF-8 bytes per line, and 20,000,000 units of work
   per comparison, shared by all its changes. Tests: "a line over the byte
   bound is too large, counted in UTF-8 bytes", "one file's line comparison
   over the work bound is too large", "reading counts as work, even when the
   line comparison is trivial", "the work bound covers all the changes of a
   comparison together", and "once the work is spent, a later change that
   needs no reading is still too large". The 2,000-line bound keeps its test
   in `test/change-history.test.tsx`.
4. **Simplification: structure.** The interdiff is per path: `meta` (or null)
   and the hunks only in each version, each with `oldStart`, `newStart` and
   its lines. No more unlocated `+`/`-` strings. Test: "each hunk shows where
   it is, with its context".
5. **Simplification: the "too large" copy.** It no longer says this view's
   bounds apply to every proposal's diff. For lane B's bounds (depth,
   entries, commits) it says every proposal's diff has the same bound; for
   this view's own (lines, bytes per line, work) it says the bound does not
   limit the proposal's diff. Test: "too large: this view's own bounds are not
   said to bound the proposal's diff". The identical-edit case still reads
   "The same edits as in generation 1 ... only rebased or reworded".

**Mutations.** Each was applied to the committed fix, run against
`test/review-125ee638.test.tsx` and `test/change-history.test.tsx`, then
reverted. Each turned at least one test red:

| Mutation | Tests that went red |
|---|---|
| Drop the metadata comparison | the four metadata tests |
| Drop the context (0 lines) | first()/second(); the scenario interdiff |
| Compare line numbers too | the moved-by-a-rebase control |
| Remove the lines-per-file bound | lane B's bounds test (lines) |
| Remove the bytes-per-line bound | the byte bound test |
| Count characters, not bytes | the byte bound test |
| Remove the work bound | the three LCS work tests |
| Do not charge the line comparison | the three LCS work tests |
| Do not charge reading | reading counts as work |
| Give each change its own budget | all changes together; spent budget |
| Do not check a spent budget first | spent budget |
| Say the line bound is shared | the "too large" copy test |

The screenshots `proposal-changes-light.png` and `proposal-changes-dark.png`
are regenerated.

**Gates**, all exit 0: root `npm run typecheck`; root `npm test` (git 118,
log 100 and 95 in workerd, policy 190 and 189 with 1 skipped in workerd, UI
114); `npm run build` in `packages/ui`; `npm run e2e` (Playwright, 7 tests).

## Review f3fff92c

Checker reviewed head `69a8931` and credited the metadata fix, the bounds
and the copy. One P2 remained. Main at `ad19956b` (lane F's carry UI,
`3203660e`) is merged first, keeping both sides: the README rows and
scenario, the e2e carry screenshot, and lane F's test that a live room has
no per-change history. For that test, `RoomAdapter.changeHistory` is now
optional and `LiveRoom` does not have it. Tests are in
`test/review-f3fff92c.test.tsx`; the checker's diagnostic is the first one,
now asserting the correct outcome.

**P2: repeated context still hid an edit moved between functions.** Hunks
were matched by their lines alone, so with two functions whose bodies are
identical for more than three lines, denying in `first()` and denying in
`second()` matched. Now a pair of hunks is the same edit only when its lines
are equal and the old hunk's place, mapped into the new version's parent, is
the new hunk's place (`matchHunks` and `placeIn` in `src/room/changes.ts`):

- **Same parent blob at that path:** places are compared as they are.
- **Different parents:** a line diff of the two parents maps each old
  parent line to the new one. The old hunk's place maps only if every one of
  its parent lines maps, one to one and in order. That diff is charged to
  the work bound.
- **No map, but the same hunk in the new version:** reported explicitly in
  `FileInterdiff.unsure`. The screen says "Could not tell whether this edit
  moved" and shows the hunk once, with where generation 1 made it. It is never
  counted as the same edit.

Tests:
- "same parent: denying in first() and denying in second() are different
  edits, at their own places" (the diagnostic: five identical lines on each
  side);
- "different parents: the move is still found, through the rebase";
- the controls "the same edit, rebased onto lines added above it, is the
  same edit" and "the same edit, rebased onto an unrelated change in the
  other function, is the same edit". Review 125ee638's unrelated-rebase
  control and the scenario's rebase-only change (whoami) still pass;
- "ambiguous: when the old edit's place is gone from the new parent, it says
  it could not tell" (main deleted `first()`);
- "ambiguous: a rebase that repeats a line inside the old edit's
  surroundings is not claimed as a move". A fuzz of 6,000 small rebases found
  this case: without the one-to-one check it was reported as a move;
- "diffing the two parents counts as work";
- "an unsure match says it could not tell whether the edit moved, and shows
  the hunk".

**Mutations.** Each was applied to the committed fix, run against the
three per-change test files, then reverted:

| Mutation | Tests that went red |
|---|---|
| Ignore the place (lines only) | the diagnostic, the rebased move, both ambiguous tests |
| Same place even when the parents differ | both rebase controls, both ambiguous tests |
| No "unsure": an unmapped hunk is "only in" one version | both ambiguous tests |
| An unmapped equal hunk counts as the same edit | both ambiguous tests |
| Drop the one-to-one check | the repeated-line ambiguous test |
| Do not charge the parents' diff | diffing the two parents counts as work |
| Do not render "unsure" | the on-screen test |
| Let a region whose first parent line is gone still map | none (below) |

No test separates that last check (`first < 0`) from the one-to-one check,
which almost always rejects the same regions. The same fuzz, run 40,000
times over two-letter files (the most repetitive), gave identical results
with and without it. It is kept as the plain statement that a line main
deleted has no place, but it is not counted as tested.

The screenshots `proposal-changes-light.png` and `proposal-changes-dark.png`
are regenerated: the identical-edit sentence now says "at the same places".

**Gates**, all exit 0, after `npm ci` (main added `packages/room`): root
`npm run typecheck`; root `npm test` (git 143; log 127, and 122 in workerd;
policy 199, and 198 with 1 skipped in workerd; room 67, and 275 in workerd;
UI 141); `npm run build` in `packages/ui`; `npm run e2e` (Playwright, 8
tests, including lane F's carry screenshot).
