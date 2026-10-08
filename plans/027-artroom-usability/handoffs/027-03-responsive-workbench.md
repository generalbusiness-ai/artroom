# Plan 027.3: Build responsive work lists and contextual issue actions

> **Executor instructions:** Read fully and honor prerequisites. This plan is not a request to rewrite the frontend framework. Preserve the existing DOM/data/signing separation unless evidence requires a reviewed change. Track implementation through a gitseq request. The planner maintains the parent index.
>
> **Current baseline:** Accepted I5 is `7bb3a6415892138a25f5a147f89ae8469b0a716d`; the publication base is `16d7ba440d148c8d6dc29307810ee3c0c103c624`. [BASELINE.md](../BASELINE.md) supersedes the old findings below. Implementation remains uncommissioned and undispatched.
>
> **Drift check after future dispatch:** `git diff --stat 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/page packages/scope/src/page-assets.ts`
> Accepted main includes the page. Check later drift and compare `git diff 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/page/src/main.ts packages/page/src/view.ts packages/page/src/index.html packages/page/test/screens.mjs`. Reconcile the excerpts and plan 027.1 changes; STOP if source/contract differs without an adopted update.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** MED
- **Depends on:** 027.1 truthful reads/receipts/fresh standing; approved bounded room query and room-name/link contract; 027.2 naming/context decisions for cross-surface consistency
- **Category:** direction / dx
- **Planned at:** main `1eed91aacac56649ac0b75c0652215b0418eeff8`, candidate `3157859665e5531a3f94b124ccec00d2994c01ad`, 2026-10-08

## Current I5 reconciliation

See the shared [accepted I5 baseline and evidence](../BASELINE.md). I5 already supplies the integrated Page and truthful rejection/memory-answer guards. Proposed work supplies actual bounded query contracts, contextual issue controls, responsive interaction and real accessibility/device acceptance; it cannot show unsupported metadata or turn memory-only answers into durable recovery.

## Why this matters

The current reference mixes work lists with protocol forms and requires users to identify target items/fields. Dedicated lists and contextual issue controls let people locate work and act without learning the schema. Responsive design, focus, drafts and truthful query results must work together; a new coat of CSS over an unbounded scan is not completion.

## Historical inspected state (1eed/315)

Candidate `packages/page/src/main.ts/draw` handles `issue`, `change`, `rules`, `settings` and otherwise room. `showFor` replaces the root; superseded draws are guarded but focus/drafts are not restored. `view.ts/h` constructs native DOM; `roomScreen` renders two tables; `issueScreen` shows body/comments/conditions; `actsPanel` generates protocol fields. `data.ts/listLanes` loops directory live rows and reads each lane serially. `LaneRow` lacks author/assignee/time/label/count fields.

Historical `315785966` excerpts; these are not current source:

```ts
// main.ts:57
const showFor = (n: number) => (...children: HTMLElement[]) => { if (n === drawing) root().replaceChildren(...children); };
// main.ts:147–150
if (kind === "issue" && scope) return show(issueScreen(room, await loadIssue(room, scope as ScopeId)), await panelFor(room, scope as ScopeId));
if (kind === "change" && scope) return show(changeScreen(room, await loadChange(room, scope as ScopeId), last(scope)), await panelFor(room, scope as ScopeId));
if (kind === "rules") return show(rulesScreen(room, await loadRules(room)), await panelFor(room, room.rules));
return show(roomScreen(room, await listLanes(room)), await panelFor(room, room.directory));
// data.ts:212
export interface LaneRow { scope: ScopeId; number: number | null; kind: "issue" | "pr" | null; title: string | null; state: string | null; draft: boolean | null }
// view.ts:166,174
return section("What you may do here",
// ... generated schema fields ...
h("button", { type: "submit" }, `Sign and send ${a.kind}`),
```

`index.html:18–29` uses fixed definition-list columns, full-width tables and 4px control padding, without reflow breakpoints/focus/skip-link. Existing native labels/buttons/details are a sound base. Candidate `test/screens.mjs:1–16` replays real Worker-route recorded answers and fails on unrecorded requests; its viewport at line 43 is fixed 1000×800 light desktop. Candidate `test/story.scope.test.ts` opens an issue/comments through typed signed data functions, using real membership/rules and labelled host/scheduler stand-ins. `scripts/assets.mjs` generates `packages/scope/src/page-assets.ts`; `assets.test.ts` asserts freshness.

## Scope

**In scope:** candidate-integrated `packages/page/src/main.ts`, `view.ts`, `index.html`, `data.ts`, `index.ts`; create `packages/page/src/routes.ts` for canonical route/query parsing, `packages/page/src/work.ts` for contextual issue workflow adapters, and `packages/page/test/routes.test.ts`; `packages/page/test/story.scope.test.ts`, `record.scope.test.ts`, `screens.mjs`, `support/demo.ts`, `assets.test.ts`; generated `packages/scope/src/page-assets.ts` through build only; `packages/page/test/screenshots/README.md` for evidence limits.

**Out of scope:** backend query/index implementation, unsupported metadata fields, Kanban/custom workflow engine, identity backend, room authority, new framework/build system, broad state-contract repair already owned by 027.1, change/rules/preview slices owned by 027.4, parked source, lock/manifest changes for probes. Do not put unimplemented controls in production with mock values.

## Verification after future dispatch (not run for publication)

This is a selection map, not a script to run repeatedly. Reuse the accepted I5 witnesses for unchanged guards. Select one exact affected file per changed invariant at its cheapest sufficient boundary; extend an existing witness where it owns that invariant. A later step references its retained result instead of rerunning it unless material source changes invalidate it. Asset parity follows an actual UI build; one final gate covers the completed implementation. New test paths and proposed product commands are unavailable until their separately dispatched slice creates them.

| Purpose | Command | Expected result |
|---|---|---|
| Availability | `git ls-files packages/page/src/main.ts packages/page/test/screens.mjs` | Both tracked; else STOP |
| Routes/states/assets | `./node_modules/.bin/vitest run --project page packages/page/test/routes.test.ts` (new file after dispatch; asset parity separately after build) | Matching tests pass; generated assets fresh |
| Real issue/workflows | `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` | Typed issue/comment/authority story passes |
| Build | `npm run build --workspace @generalbusiness/artroom-page` | Exit 0; generated module updated |
| Types | `npm run typecheck --workspace @generalbusiness/artroom-page` | Exit 0 |
| Browser harness | `PLAYWRIGHT_CORE=/absolute/scratch/tool/node_modules/playwright-core CHROMIUM=/absolute/existing/chromium node packages/page/test/screens.mjs` | Existing script path runs after actual tool paths supplied; no unanswered requests/errors; new interaction/reflow assertions pass |
| Changed tests | `npm run test:changed` (only for affected witnesses not already exercised) | Affected active witnesses pass |
| Review | `npm run gate` | Once at actual review head, all steps pass |

The browser command is an existing harness with environment placeholders, not a claimed available browser/tool path. Locate a pinned tool in scratch/existing cache; never install into checkout. Harness writes test artifacts, so use the authorized implementation worktree. Automated accessibility tooling is an additional commissioned pinned scratch check; this plan does not invent an installed command.

## Git workflow

Use an isolated request branch. Commit complete slices, for example `Add shareable issue lists and contextual comments`. Do not merge/push/deploy without dispatch. Build generated assets as part of each UI source change's logical unit; no manual bundle edits.

## Steps

### Step 1: Freeze bounded query and route contracts

Adopt room label/links and actual list API with kind/filter/sort/limit, opaque query-bound cursor, head/watermark, per-row authoritative/advisory status, completeness and count semantics. Specify changed-query cursor rejection, watermark expiry, deduplication, concurrent writes and resume. Require bounded backend query work and bounded browser reads; do not fetch every lane then slice. Global search and status filters require server/index support; until that is available, stop production list integration. Define supported fields and real ordering. Initially omit author/time/labels/assignee unless approved reads exist. Route/query spelling is proposed: room Issues/Changes with state/query/sort/cursor in a credential-free URL; retain existing item links/redirects.

**Verify:** `git diff --check` → exit 0 for the commissioned contract; named query owner provides approved schema/examples and bounded cost witness. No absent endpoint is called. Without the accepted contract, build design fixtures only and report the prerequisite; do not claim production pagination.

### Step 2: Build stable shell, routes and lists

Add `routes.ts` with canonical query round-trip and supported-state validation. `draw` keeps a stable nav/account shell and replaces only destination content. Navigation nouns are Issues, Changes, Pages, Settings. Implement separate list screens with title/qualified count, status segment, Search/Filter, visible chips and Clear filters. Issues default Open/Closed/All; Changes Open/Merged/Closed/All with independent supported draft/review/publication filters. Retain query intent/scroll on Back. Use actual query adapter in `data.ts`; cancel/ignore superseded reads. Empty room differs from no matches, partial/read failure and access loss.

**Verify:** `./node_modules/.bin/vitest run --project page packages/page/test/routes.test.ts` (after creation) → URL round-trip/reload/Back intent, unsupported-state handling, no credentials in URL and qualified partial results pass. `npm run typecheck --workspace @generalbusiness/artroom-page` → exit 0. Browser harness asserts status switches never turn refused open change into closed work and page loading does not request all lane summaries.

### Step 3: Replace schema controls with a complete issue slice

`work.ts` maps Create issue, Comment, Assign, Close issue and Reopen issue to real declared typed acts. Bind known target/current expected revisions internally. Use active-definition bytes according to existing `actsOn/act` conventions, never hard-code a digest from mock data. Title-first creation has optional body/metadata per definition. Issue detail preserves Conditions and domain commitments where present, resolves links through actual reads, and offers a member picker only with an approved roster read. Authorize affordances from fresh standing plus contextual state; final scope answer decides. Preserve draft and durable receipt on refusal/unknown/refresh failure via 027.1. Move schema forms to explicitly advanced inspection.

**Verify:** `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` → actual typed creation/comment/close/reopen and authorized assignment succeed; unauthorized/stale revision/session-unavailable remain distinct and retain draft; wrong target/version cannot be silently substituted. Browser recorder uses production bundle and actual Worker answers, not canned success from screen mocks.

### Step 4: Apply responsive tokens and accessible interactions

Use report token system with 16px body, readable secondary text, restrained surfaces/accent, non-color statuses, essential form boundaries and visible focus. Native nav/links/buttons/labels/details stay. At 320px use row cards, wrapped metadata and labels below the main title rather than a trailing badge that shrinks it to a few characters. At wide widths use bounded lists/optional rail. Isolate diff/code scrollers; no document overflow. Minimum core touch target 44×44px; visible create/filter controls, no hover-only actions. Add skip link, route heading focus, live status, associated errors, modal focus/Escape/return and stable draft focus during refresh. Preserve input under virtual keyboard/safe-area/zoom/sticky bars.

**Verify:** build + extended browser harness → 320/375–390/768/1024/1440 layouts show zero page overflow, readable whole-word title wrapping, all primary actions reachable, 44px primary targets and correct focus/back behavior. A zero-overflow metric alone is insufficient: visually inspect narrow long-title rows and capture them. Manual keyboard/AT/device checks are recorded separately, not claimed by screenshot output.

### Step 5: Validate scale/failure and hand off the complete slice

Exercise empty/30/1,000-item data at the real query boundary. Record dataset/device/network and query count/bytes versus DOM work; verify page cost is bounded independent of total room size. Retain partial status and cursor recovery under injected outage/concurrent updates. Extend recorder for production DOM flows and update evidence README with source HEAD, stand-ins and viewports. Run changed tests then one gate. Run manual mobile/AT checks with neutral tasks; resolve critical/high barriers before declaring completion.

**Verify:** `npm run build --workspace @generalbusiness/artroom-page`, `npm run test:changed` (only for affected witnesses not already exercised), `git diff --check` → exit 0; extended browser harness → all assertions pass; `npm run gate` → one successful review-head run. Named manual record shows task outcomes and remaining barriers, not blanket conformance from automated tooling.

## Test plan

`routes.test.ts` tests supported query canonicalization, cursor binding/expiry, Back/restoration and credential-free links. Pure tests cover complete empty, no matches, partial/advisory/unavailable rows and qualified count. Real scope story tests only load-bearing field/authority/revision invariants with existing patterns. Browser assertions cover list/search/filter creation/comment/closure, draft loss controls, stale refresh, keyboard/modal/status, responsive readable title wrapping, no page overflow and unanswered requests. Measure bounded page work at an actual backend query, not only client mocks. Complete critical process tests in 027.4 reuse this fixture.

## Done criteria

- [ ] Separate lists/filter URLs work with real bounded query and qualified state/count semantics.
- [ ] No unsupported metadata shown as fact; no unbounded all-lane scan behind pagination.
- [ ] Issue tasks use contextual typed forms; no ordinary manual item IDs/digests/JSON.
- [ ] Draft/receipt survive navigation/refusal/unknown/outage; refreshed authority remains decisive.
- [ ] 320px long titles wrap readably; touch/keyboard/AT tasks remain available.
- [ ] Production asset, focused tests, recorded browser evidence and one review gate pass.
- [ ] Manual checks and scale measurements name conditions and limitations.
- [ ] Only listed commissioned paths changed.

## STOP conditions

Stop if the adopted 027.1 contract is missing, bounded/searchable query is unavailable, directory index is assumed authoritative, missing fields need fiction, authority must be reimplemented client-side, creation/assignment definitions do not support proposed forms, source drifts, required work exceeds scope or focused verification fails twice. Do not replace the DOM architecture with a framework to evade these contracts.

## Maintenance notes

New filters require query/read contracts and shareable semantics, not local-only silently different defaults. New metadata requires provenance. Keep exact inspection accessible while task controls stay ordinary. Preserve readable narrow title width when adding badges/status columns; no-overflow checks alone missed this in the design preview until visual inspection.
