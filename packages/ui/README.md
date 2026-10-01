# Artroom UI

The web interface for Artroom: four screens over one data adapter.

| Screen | What it shows |
|---|---|
| **Needs you** | The viewer's attention queue. Each item says what to do, why it is theirs, and offers one action. |
| **Room** | Claims and their overlaps (before any code exists), lanes and leases, the landing operations, the publication slot, and how far the log is published. Live. |
| **Proposal** | One generation: the diff, notes anchored to path, line and head, the obligations as a checklist, each piece of evidence marked *reviewed here*, *carried* (with the reason) or *stale* (with the reason), and "why" links. |
| **Policy** | The rules in plain English, recent outcomes, and a dry run of a draft rule against the room's history. |

It is built with Preact and Vite, with hand-written CSS. It has no component
library. It is served as Workers static assets.

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
npm run typecheck
npm test                                # vitest: component and adapter tests (happy-dom)
npx playwright install chromium         # once
npm run e2e                             # Playwright, headless: builds, serves, walks the scenario
```

`npm run e2e` also rewrites the screenshots in `screenshots/`. The request
asked for `ui/screenshots`; they are in `packages/ui/screenshots`:

- `needs-you-light.png`, `needs-you-dark.png`, `needs-you-phone.png`
- `room-light.png`, `room-dark.png`
- `proposal-light.png`, `proposal-dark.png`, `proposal-phone.png`
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
src/room/adapter.ts      RoomAdapter and the view model (RoomSnapshot)
src/room/mock/           MockRoom: a small deterministic room model and the scripted scenario
src/room/live/           LiveRoom: a stub over the contract's HttpRoom and its WebSocket watch
src/room/dryrun.ts       the policy dry run
src/screens/             the four screens
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
5. @birch's lease expires with no handover note. Its proposal now conflicts
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
   reachable, through `Lane.landing`; finished ones are not listed.
4. **No read of main**: its head and when it last moved.
5. **No read of the active policy document, and no dry-run method.** Plan
   section 12 asks for a dry run against history.
6. **`NotCarried` does not name its obligation.** The UI infers it from the
   previous generation's evidence.
7. **No way to dismiss a notify-only attention item** (`why: "policy"`).
8. **`Update` carries only entry summaries**, so the live adapter reloads its
   reads on every update.
9. **`connect()` is declared, not implemented**, so `LiveRoom` takes an
   `HttpRoom` from its caller, and `main.tsx` runs only the mock.

The mock does not run JSONata. Each rule in its policy has a TypeScript twin
that gives the same answer on this scenario. The dry run supports four kinds
of draft: a required review, a refused claim, a default dependency and a
global input.
