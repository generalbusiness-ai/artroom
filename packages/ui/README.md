# Artroom UI

The web interface for Artroom: four screens over one data adapter.

| Screen | What it shows |
|---|---|
| **Needs you** | The viewer's attention queue. Each item says what to do, why it is theirs, and offers one action. |
| **Room** | Claims and their overlaps (before any code exists), lanes and leases, the landing operations, the publication slot, and how far the log is published. Live. |
| **Proposal** | One generation: the diff, notes anchored to path, line and head, the obligations as a checklist, each piece of evidence marked *reviewed here*, *carried* (with the reason) or *stale* (with the reason), each check carry judgment from its `check-carried` event, advisory checks listed apart as never blocking, and "why" links. |
| **Policy** | The rules in plain English, recent outcomes, and a dry run of a draft rule against the room's history. |

It is built with Preact and Vite, with hand-written CSS. It has no component
library. It is served as Workers static assets.

**Baseline.** The UI builds against the contract on `main` at `0d8f04c`
(contract unchanged since `ca61351`): the
approved lane 0 contract (`940e2dca`) with the policy-runtime amendment
(path/owner pairs, replay contexts, the per-act budget in `ProfileStamp`,
check carry facts), and contract amendment 3 (`bc351fa8`, on `main` at
`fb2bd41`): advisory obligations and `check-carried` events. It also uses the policy runtime
(`@generalbusiness/artroom-policy`) for glob matching, carry decisions and
the policy dry run.

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

Keyboard: <kbd>1</kbd> Needs you, <kbd>2</kbd> Room, <kbd>3</kbd> Policy,
<kbd>j</kbd>/<kbd>k</kbd> next and previous item, <kbd>?</kbd> help. With
the timeline open, <kbd>,</kbd> and <kbd>.</kbd> step back and forward.

## Test it

```sh
cd packages/ui
npm run typecheck                       # see the note below
npm test                                # vitest: component and adapter tests (happy-dom)
npx playwright install chromium         # once
npm run e2e                             # Playwright, headless: builds, serves, walks the scenario
```

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
src/room/dryrun.ts       the policy dry run, through the policy runtime
src/screens/             the four screens
src/ui/landing.tsx       what each landing state means, from its recorded facts
src/ui/                  shell pieces: icons, badges, router, the "why" dialog, the demo bar
```

Screens read a `RoomSnapshot` and call the adapter. They never touch a
transport. Contract records (`Lane`, `Proposal`, `LandOp`, `AttentionItem`,
`Refusal`, `Evidence`) pass through unchanged, so a change in the contract
(lane 0, `845c7fd7`, still under review) is absorbed in `src/room`.

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
   landing proceeds. Each landing preparation judges each check for the new
   integration and records a `check-carried` event: the tests check carries
   while main is unchanged and does not carry once main moves; the volatile
   LLM review never carries.
6. @birch's lease expires with no handover note. Its proposal now conflicts
   with main. @cedar takes the lane over and recuts it.

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
5. **No read of the active policy document, and no dry-run method.** Plan
   section 12 asks for a dry run against history. The demo room runs it with
   the policy runtime over the rule inputs it recorded; a live room would
   need the retained replay contexts (R-LOG-7).
6. **`NotCarried` does not name its obligation.** The UI infers it from the
   previous generation's evidence.
7. **No way to dismiss a notify-only attention item** (`why: "policy"`).
8. **`Update` carries only entry summaries**, so the live adapter reloads its
   reads on every update. It follows every cursor (up to 20 pages, and only
   while the cursor advances) and reads the newest 500 log entries. Whatever
   it could not read is marked in `RoomSnapshot.coverage`, and the screens say
   so instead of claiming "nothing" or "all".
9. **`connect()` is declared, not implemented**, so `LiveRoom` takes an
   `HttpRoom` from its caller, and `main.tsx` runs only the mock.
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
   event, or not carried, with why. Carried check evidence shows the reason
   from its event; if no event is loaded, it says so and shows no reason.
3. **No per-change history in a live room (open point 39).** See contract
   gap 10.
