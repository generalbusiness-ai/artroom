# Plan 027.4: Make review, rules and version viewing trustworthy

> **Executor instructions:** Execute only after dispatch and contract adoption. Keep review evidence tied to an exact version/extent, distinguish current site from proposal preview, and retain backend authority. Track this work through gitseq. No framework replacement or deployment-system implementation is part of this plan. The planner maintains the parent index.
>
> **Current baseline:** Accepted I5 is `7bb3a6415892138a25f5a147f89ae8469b0a716d`; the publication base is `16d7ba440d148c8d6dc29307810ee3c0c103c624`. [BASELINE.md](../BASELINE.md) supersedes the old findings below. Implementation remains uncommissioned and undispatched.
>
> **Drift check after future dispatch:** `git diff --stat 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/page packages/scope/src/site packages/scope/src/page-assets.ts packages/scope/test/site-route.test.ts packages/scope/test/site-conformance.test.ts`
> Accepted main includes the page/site renderer. Check later drift, then compare `git diff 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/page/src/data.ts packages/page/src/view.ts packages/page/src/states.ts packages/scope/src/site/route.ts packages/page/test/story.scope.test.ts`. STOP on unreconciled excerpt or contract drift. Account for 027.1/027.3 deliberately adopted changes.

## Status

- **Priority:** P1 outcome/review correctness; P2 full immutable preview/rules editor
- **Effort:** L
- **Risk:** HIGH for artifact reads/rendering; MED for contextual presentation
- **Depends on:** 027.1; 027.3 shell/workflows; plan 006 N1 immutable artifact-read authority and C5/C6 journey; plan 025 pages/renderer; plan 020 only where actual build/deployment preview is requested
- **Category:** direction / security / dx
- **Planned at:** main `1eed91aacac56649ac0b75c0652215b0418eeff8`, candidate `3157859665e5531a3f94b124ccec00d2994c01ad`, 2026-10-08

## Current I5 reconciliation

| Earlier finding | Accepted I5 behavior | Work still proposed and owed |
|---|---|---|
| Failed/capped item or history reads and failed destination reads look empty | Page summary, definition and enumerations reject incomplete, failed and mixed-head results; budget exhaustion is unreadable. Publications use checked destination reads. | Partial rows with typed provenance/continuation; text absent/redacted versus unreadable; qualified advisory fallbacks; bounded room query and scoped publication reads. |
| Returned action answer disappears after failed refresh | `act` exposes the real answer before awaited refresh; `main.ts` retains it by service/directory/membership/key/scope and the failure view displays it. | This map is memory-only. Durable draft, original signed envelope, lost-reply settlement and reload/outbox recovery remain with the shared owner. |
| Unsafe service/identity or proposal links; HEAD presented as a selected version | Page rejects credential-bearing and unsupported cross-origin service settings before persistence/join/read; join validates supplied identity. Site validates URL and stable repository identity. Latest-site navigation is labelled separately; invalid proposal paths have no version link and immutable rendering is explicitly unavailable. | Fresh standing and contextual authority; authorized immutable artifact/preview routes, cross-origin isolation and selected-version viewing. `siteAddress` still constructs a HEAD address; the guarded view, not this helper alone, suppresses invalid proposal links. |
| Clone and planned install use weaker recovery | Planned install retains an exact attempted marker and configured-service acknowledgement; clone checks the exact accepted request/opening/outcome before reading one credential, bounds observation and preserves unknown/refused recovery guidance. Existing claim/join saved-envelope recovery is retained. | Clone occupied/writable-target preflight, renewed fetch custody, local attachment/import, multi-room context and durable application/edit orchestration. Service acknowledgement is not independent founding-history proof; stand-in witnesses are not provider acceptance. |

Future steps are proposed only. Reuse the already-landed invariants above rather than commission them twice. Remaining reload/outbox, standing, query, preview and external acceptance duties stay open.

## Why this matters

The refused change screen emphasizes confirmed internal effects before the refusal. Every candidate version links to moving HEAD, so it cannot serve as exact preview or selected published-version evidence. A complete review interface must show the outcome first and the selected artifact/rule/authority subject precisely, with a structured rules workflow and complete failure/accessibility acceptance.

## Historical inspected state (1eed/315)

Candidate `view.ts/changeScreen` chooses the current or latest manifest, calculates reviews for its extents, displays diagnostic states and metadata, then merge outcomes. `rulesScreen` renders protocol tables; `actsPanel` supplies generic publish fields. `data.ts/loadChange` exposes manifest metadata but no actual base/current diff content; `loadRules` reads structured extents/checks/definitions. `states.ts/changeStates` explains rules-not-met and authority-lost but lacks generic/path/out-of-date summary. `siteAddress` always selects HEAD.

Historical315 excerpts; these are not current source:

```ts
// view.ts:83–88 — changeScreen
const current = change.manifests.find((m) => m.state === "current") ?? change.manifests.at(-1) ?? null;
const states = changeStates(change, last);
const extents = change.rules?.extents ?? [];
// ...
const approving = change.reviews.filter((r) => r.manifest === current?.id && r.state === "submitted" && r.verdict === "approve" && r.extent === extent.name);
// data.ts:405–406
export function siteAddress(room: Pick<Room, "session" | "directory">, path: string): string {
  return `${room.session.service.replace(/\/+$/, "")}/site/${room.directory}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;
}
// site/route.ts:52–54
export const FILE_BYTES = 1024 * 1024;
/** How long a cache may keep an answer before it asks again, in seconds. A branch can move, so this is short. */
export const MAX_AGE = 60;
// site/route.ts:101
const PAGE_POLICY = "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
```

Candidate `site/route.ts/commitOf:183` resolves branch/tag and `site:262` serves public-by-directory-ID content without membership session. `ref-not-found`, `not-found`, `too-large`, host-not-configured and unreadable map to specific HTTP statuses with no-store refusal bodies; rendering escapes untrusted content and supplies restrictive CSP. It is not an immutable arbitrary-commit route or members-only proposal preview. Do not merely pass a commit hash into its `:ref` slot and claim it works.

Existing witnesses: `page/test/states.test.ts` uses hand-made projections and explicitly expects no policy summary for out-of-date; `page/test/story.scope.test.ts` demonstrates author-review refusal, controller review, protected change refusal/confirmed publication through real scopes with a stand-in host/scheduler. Candidate `scope/test/site-route.test.ts` covers ref/path/error/branch caching/images/index/navigation; `site-conformance.test.ts` covers safe GFM rendering. Browser recorder covers actual Worker response headers, not a live provider.

## Scope

**In scope after contracts:** `packages/page/src/data.ts`, `states.ts`, `view.ts`, `main.ts`, `index.ts`, `index.html`, adopted `work.ts` from 027.3; create `packages/page/src/review.ts` and `rules.ts` for contextual adapters and `packages/page/test/review.test.ts`, `rules.test.ts`; `page/test/states.test.ts`, `story.scope.test.ts`, `record.scope.test.ts`, `screens.mjs`, `support/demo.ts`; `packages/scope/src/site/route.ts` for an approved explicit published-commit mode; `packages/scope/test/site-route.test.ts`, `site-conformance.test.ts`; generated `packages/scope/src/page-assets.ts` through build. An isolated proposal-render route/module is **not authorized within this file list until its owner adopts the contract and names its exact source/test paths**; add a separately reviewed scope amendment before implementation.

**Out of scope:** authority/rules judges, general object-read grants, build/deploy/promote/rollback effect from plan 020, preview annotations, private/public site switch, direct Git writes, full code editor/IDE, alternate renderer, generic outbox replacement, account backend, parked files or default framework migration. Any future presentation change still requires dispatch. Preserve the already-correct latest-site/unavailable labels; enabling Preview awaits the adopted immutable contract.

## Verification after future dispatch (not run for publication)

This is a selection map, not a script to run repeatedly. Reuse the accepted I5 witnesses for unchanged guards. Select one exact affected file per changed invariant at its cheapest sufficient boundary; extend an existing witness where it owns that invariant. A later step references its retained result instead of rerunning it unless material source changes invalidate it. Asset parity follows an actual UI build; one final gate covers the completed implementation. New test paths and proposed product commands are unavailable until their separately dispatched slice creates them.

| Purpose | Command | Expected result |
|---|---|---|
| Page projections/forms | the exact affected `packages/page/test/states.test.ts`, proposed `review.test.ts` or proposed `rules.test.ts`, once per invariant; `assets.test.ts` once after build | Existing/new matching witnesses pass |
| Real review/rules story | `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` | Typed exact-version review, refusals, rules and publication story passes |
| Workbench route | `./node_modules/.bin/vitest run --project scope packages/scope/test/page-route.test.ts` | Assets/headers/CSP/redirect/404/405 remain correct |
| Published renderer | `./node_modules/.bin/vitest run --project scope packages/scope/test/site-route.test.ts` | Ref/path/error/cache and new explicit immutable route witnesses pass |
| Safe GFM | `./node_modules/.bin/vitest run --project scope packages/scope/test/site-conformance.test.ts` | Conformance/security witnesses pass |
| Asset build | `npm run build --workspace @generalbusiness/artroom-page` | Exit 0, generated assets current |
| Types | `npm run typecheck --workspace @generalbusiness/artroom-page` | Exit 0 |
| Browser | `PLAYWRIGHT_CORE=/absolute/scratch/tool/node_modules/playwright-core CHROMIUM=/absolute/existing/chromium node packages/page/test/screens.mjs` | Supply real scratch/cache paths; recorded requests and expanded interactions/assertions pass |
| Changed tests / review | `npm run test:changed` (only for affected witnesses not already exercised); then `npm run gate` | Applicable affected tests; one successful gate at review head |

Separate commands shown in one table cell are sequential instructions, not a repeated suite mandate. Use focused tests for each slice. No package tool install in checkout. Preview-contract tests use its adopted real command once available; do not invent a test path or successful endpoint now.

## Git workflow

Use an isolated request worktree and descriptive commits, for example `Distinguish selected published versions from latest site`. The present review has not authorized push, merge or deployment; follow operator dispatch. Do not modify generated asset bytes directly. Preserve reviewed renderer invariants when changing labels/frame/navigation.

## Steps

### Step 1: Correct outcome hierarchy and existing viewing labels

Put title/number/lifecycle and publication outcome above operations. Project generic/path/out-of-date refusal, named authority unavailability and unknown publication through 027.1 state contract. Keep lane lifecycle separate: refusal leaves Open. Collapsible Publication details retains exact operations/receipt/head. Preserve I5's labelled latest-site navigation, invalid-path guard and explicitly unavailable immutable version render. Keep URL/identity guards as regressions; change them only if the adopted artifact contract requires an exact additional invariant. Do not advertise HEAD as a selected proposal or published version. If an edit-path workflow is unsupported, describe corrected proposal rather than a nonworking Fix path button.

**Verify:** `./node_modules/.bin/vitest run --project page packages/page/test/states.test.ts` (new review-selection invariant belongs in proposed `review.test.ts`) → invalid-path and out-of-date/generic refusal clear above details; confirmed judge never yields Published; invalid paths have no active site link; HEAD remains explicitly latest. Browser capture/read order asserts outcome before diagnostics on 320px and desktop.

### Step 2: Adopt exact artifact and preview contracts before rendering promises

With plan 006 N1, specify immutable manifest/base/current blob/tree reads, version/digest/head provenance, authorization, retention, size/binary limits and missing/redacted/unavailable outcomes. Adopt explicit published-commit route selection distinct from branch/tag/HEAD, with commit/repository membership validation and no arbitrary repository object access. Define exact proposal rendering under a no-script isolated boundary, credential-free relative resources, CSP/sandbox and access rules. Prevent active untrusted HTML/scripts from reaching signing-key origin/storage. Decide cache behavior for immutable subject versus moving branch. Plan 020 build/deploy previews remain separate; a proposed markdown render does not complete its promotion/rollback duties.

**Verify:** commissioned contract `git diff --check` → exit 0; actual artifact/route owners provide accepted schema/security tests and name implementation paths. Until then, render an explicit unavailable Preview explanation or omit action; do not use HEAD as substitute. STOP the dependent renderer slice if the contract is absent.

### Step 3: Build exact-version file review and contextual actions

In `review.ts/data.ts`, load the selected immutable subject and base, provide unified diff plus binary/too-large text alternative, file navigation and optional wide split view. Preserve selected old version when current version advances and mark superseded. Bind Request review, Approve version, Request changes and Publish change to actual typed act fields, exact manifest/extent and expected revisions. Resolve held-rule context and independently qualified current-member eligibility; backend destination rechecks current rules. Show a readiness explanation, not a client-certified Ready derived solely from counts. Preserve draft, receipt and selected subject after conflict/unknown/refresh failure; ask deliberate selection of new version rather than silently rebinding approval.

**Verify:** `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` → eligible exact-version review works, author/stale/removed-member review refuses where domain says, rules changed at destination cannot inherit earlier client readiness, publishing confirms only actual record. `./node_modules/.bin/vitest run --project page packages/page/test/review.test.ts` (after creation) → superseded subject/binary/missing/unreadable cases remain distinct. Browser tests verify Files accessible and no unintended-version approval.

### Step 4: Add structured rules editing with revision-safe save

In `rules.ts/view.ts`, read-only rules summary names protected paths, eligible reviewer grant, counts, checks, author exception and active definition provenance. Configure rules appears only for actual fresh publish authority; explain relevant unavailability. Structured form edits declared fields, validates paths/counts/check configuration without changing semantics, and previews representative path impact. Custom definitions/extents retain names/bytes through Advanced configuration; do not round-trip unknown fields away. Save rules reviews the exact change and uses expected revision; refusal/mismatch preserves draft and offers reload/compare, never overwrite. Preview impact is advisory and must not invent final destination judgment or external approval requirements.

**Verify:** `./node_modules/.bin/vitest run --project page packages/page/test/rules.test.ts` (after creation) → configuration round-trip preserves untouched custom fields; declared validation/path impact checks pass. `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` → authorized publish uses revision; unauthorized/stale/changed-role save refuses and retains draft; actual scope configuration matches intended bytes.

### Step 5: Implement immutable published viewing and isolated preview when approved

Extend `site/route.ts` only with the explicitly adopted commit mode and validate subject/reference. Keep HEAD/branch/tag selection separate and preserve current refusal/cache/security behavior. Bind View this published version from a confirmed publication record and its exact commit, not current manifest heuristics. Implement proposal rendering only under separately adopted source scope/security contract. Label selected proposal version, exact published version and latest site unambiguously; no working-looking preview when bytes/access are unavailable.

**Verify:** the exact affected file in `packages/scope/test/{site-route,site-conformance,page-route}.test.ts`, once for its invariant → old routes remain passing; selected published commit stays unchanged after HEAD moves; missing/mismatched commit/path fails with truthful status/no-store/no content leakage; raw HTML/link/image/security controls preserve isolation. Run actual approved proposal-contract witness → exact bytes/digest/version, bounded reads and cross-origin/key isolation pass. If that command is not yet defined, STOP this substep and leave Preview unavailable.

### Step 6: Exercise complete processes and release evidence

Extend existing real-scope recording/browser fixture for join/create issue/propose/review/publish/view, plus deterministic failures below. Add native accessibility/focus/draft assertions and readable wrapping at 320px. Record production bundle/source hash, backend read watermark and stand-ins. Test physical iOS/Android, virtual keyboard, keyboard-only, VoiceOver/Safari plus another AT/browser pairing, 200% text/400% zoom, forced colors/reduced motion and both verified themes. Record raw user-task outcomes using report protocol; no recruitment/external outreach is authorized by this plan alone. Use existing C6/026 commissioning.

**Verify:** asset build, focused affected tests, expanded existing browser harness and `git diff --check` → exit 0; `npm run gate` → one successful actual-review-head run. A named hosted witness proves publication/result on its actual release; a recorded stand-in host does not. Manual accessibility and user study records name barriers and n/N; absence means that acceptance remains open.

## Complete acceptance matrix

| Boundary / condition | Load-bearing assertion and cheapest witness |
|---|---|
| Complete empty / filtered zero / partial read / unavailable | Distinct presentation, count/provenance and recovery; pure data + browser |
| Existing Git/import/join context | No replacement/wrong-room action; reuse 027.2 filesystem/real-scope witnesses |
| Permission removed, role changed, revived screen | Fresh affordance and actual scope refusal; real membership story |
| Authority temporarily unreadable / expired session | Distinct from true unauthorized/removed state; data + scope session witness |
| Stale rules/revision | Draft retained; destination judges current rules, editor cannot overwrite; real scope |
| New proposal version during review | Old subject preserved, approval cannot migrate; real typed act + browser |
| Invalid path / out-of-date / generic refusal | Open lifecycle plus refusal and useful correction; state + browser |
| Missing required eligible review/check | Name affected extent/version, no fake Ready from counts; state + real scope |
| Loss before send / after delivery / accepted then refresh fails | Exact journal identity, known receipt retained, unknown settled; real scope with fault injection |
| Queued / unknown / refused / aborted / confirmed publication | Distinct attempt state; confirmation only record, no duplicate blind retry; projection + real scope |
| Preview missing/unreadable/too large/binary | Exact subject or honest unavailable state; artifact contract tests |
| HEAD moves after publication | Pinned selected version stable; latest visibly different; site-route |
| Untrusted HTML/URL/resources | Script/key/storage isolation, escaped safe rendering, correct CSP; route/conformance + browser security control |
| Long path/title/discussion/many files | Readable wrapping, bounded query/render and local scrollers; browser + scale witness |
| Keyboard/SR/touch/zoom/virtual keyboard | Full task completion, labelled status/errors, focus visible/returned, no lost draft; browser assertions + manual device/AT |

## Test plan

Reuse state fixtures for reason projection, real `story.scope.test.ts` for version/extent/authority and safe-renderer witnesses for transport/security. Extend `record.scope.test.ts` to capture actual production reads, not fabricated diff success. New pure `review.test.ts/rules.test.ts` asserts exact subject selection and configuration round-trip. Write one meaningful control for a changed guard where appropriate, per `docs/testing.md`; no per-field mutants or whole-suite sweep. Acceptance targets are proposed: zero false publication/wrong-version beliefs, unassisted mobile/desktop core tasks, ≤20s to explain refusal, bounded page work, immediate feedback ≤100ms, p95 typical navigation ≤500ms under stated conditions. WCAG 2.2 AA complete-process review and 44px product touch target require manual evidence beyond scans.

## Done criteria

- [ ] Refusal/outcome is above diagnostics; lifecycle/readiness/publication remain separate.
- [ ] Reviews/actions name exact selected version/extent and current legitimate authority.
- [ ] Rules form preserves draft/custom configuration and uses expected revision.
- [ ] HEAD links are truthful; immutable published link proven stable after branch move.
- [ ] Enabled Preview renders exact authorized proposal bytes in approved isolation; otherwise it remains explicitly unavailable.
- [ ] Every relevant failure/permission/version state has a meaningful boundary witness.
- [ ] Focused tests, safe rendering, assets, recorded browser checks and one review gate pass.
- [ ] Complete-process manual/hosted/usability acceptance evidence names conditions/limits; no mock parity claims.
- [ ] Only commissioned paths changed; newly required preview paths have an approved scope amendment.

## STOP conditions

Stop if immutable artifact/preview authority or isolation is unresolved, arbitrary-commit route is assumed from current branch/tag parser, rules round-trip loses unknown custom meaning, proposed action needs a missing declared transition, readiness would replace destination judgment, publication evidence is incomplete but demanded as success, candidate/source drifts, out-of-scope changes are required, or focused verification fails twice. A renderer on signing-key origin with active untrusted content is not an acceptable shortcut.

## Maintenance notes

Future page anchors/comments stay tied to exact preview subject under plan 020; do not add them prematurely. Plan 025 owns pages packaging, renderer behavior and eventual privacy contract; current candidate site is public by ID. C6/026 own real journey/documentation acceptance. Keep local preview QA separate from production/mobile/AT/hosted evidence.
