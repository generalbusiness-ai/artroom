# Room, web and mobile usability

## Publication reconciliation — 8 October 2026

This proposal is published under request `41c14d2b`, following assessment `ea37da9c`. The original research used main `1eed91a` and reference `315785966`; their excerpts, screenshots and findings remain historical evidence. The accepted I5 merge is `7bb3a6415892138a25f5a147f89ae8469b0a716d`. Publication starts from `16d7ba440d148c8d6dc29307810ee3c0c103c624`, which adds the sprint report without changing I5 packages. Main now contains the page, site, clone, edit, issue and planned-install code. Neither these historical observations nor the retained sample QA describes the current product as a whole.

| Earlier finding | Accepted I5 behavior | Work still proposed and owed |
|---|---|---|
| Failed/capped item or history reads and failed destination reads look empty | Page summary, definition and enumerations reject incomplete, failed and mixed-head results; budget exhaustion is unreadable. Publications use checked destination reads. | Partial rows with typed provenance/continuation; text absent/redacted versus unreadable; qualified advisory fallbacks; bounded room query and scoped publication reads. |
| Returned action answer disappears after failed refresh | `act` exposes the real answer before awaited refresh; `main.ts` retains it by service/directory/membership/key/scope and the failure view displays it. | This map is memory-only. Durable draft, original signed envelope, lost-reply settlement and reload/outbox recovery remain with the shared owner. |
| Unsafe service/identity or proposal links; HEAD presented as a selected version | Page rejects credential-bearing and unsupported cross-origin service settings before persistence/join/read; join validates supplied identity. Site validates URL and stable repository identity. Latest-site navigation is labelled separately; invalid proposal paths have no version link and immutable rendering is explicitly unavailable. | Fresh standing and contextual authority; authorized immutable artifact/preview routes, cross-origin isolation and selected-version viewing. `siteAddress` still constructs a HEAD address; the guarded view, not this helper alone, suppresses invalid proposal links. |
| Clone and planned install use weaker recovery | Planned install retains an exact attempted marker and configured-service acknowledgement; clone checks the exact accepted request/opening/outcome before reading one credential, bounds observation and preserves unknown/refused recovery guidance. Existing claim/join saved-envelope recovery is retained. | Clone occupied/writable-target preflight, renewed fetch custody, local attachment/import, multi-room context and durable application/edit orchestration. Service acknowledgement is not independent founding-history proof; stand-in witnesses are not provider acceptance. |

The four handoffs below are **future proposals**. This publication does not adopt their designs, commission or dispatch implementation, change application behavior, or authorize cloud/provider/browser/device/user sessions. Proposed commands and APIs remain unavailable until implemented and adopted. Plans 006, 020, 025 and 026 retain their authority, settlement, journey, preview, packaging and guide duties. Exact review, native browser, provider, physical-device, accessibility, scale and cold-user acceptance remain open.

For future implementation, choose the exact affected file and invariant once per slice; do not run repeated broad CLI/Scope selections. Reuse unchanged witnesses, then run one final gate at the implementation review head. This documentation publication runs `git diff --check` and compares source/package tree identity to the retained accepted gate; it runs no suite, build, rehearsal or browser check. See [current baseline and evidence](../../BASELINE.md).

## What does the current room experience actually do?

### Takeaway

The rehearsal shows a technically useful, minimal projection of records. It does not yet provide a human workbench: there are no dedicated issue/change list routes, filters, contextual action workflows or diff review. Improving hierarchy alone will not solve missing data, incomplete-read handling or authority presentation.

### Scope and evidence convention

The landed checkout is `/Users/hughpyle/play/artroom` at `1eed91aacac56649ac0b75c0652215b0418eeff8`. That historical tracked tree had no `packages/page` or site renderer; accepted I5 now includes both. The inspected active rehearsal reference is `planner/i5-demo-host` at `315785966`, located at `/private/tmp/claude-501/-Users-hughpyle-play-artroom/bf99aaed-2820-49a8-b522-bd49f87dbe3a/scratchpad/gate1`; below, **REF** means this directory and **MAIN** means the landed checkout. These are active reference packages, not `parked/ui`. MAIN `notes/2026-10-07-23-sprint-report.md:52–66` explains that the planner branch is deployed and the member/edit/page capabilities were not landed main at that report. The transcript does not record its deployment source hash, so matching source strings/screens is corroboration, not proof of the exact deployed build hash.

All six supplied PNGs were inspected with `view_image`. SCREEN means `/Users/hughpyle/tmp/artroom-rehearsal-1/`. The transcript says all 26 scripted shots matched expected output; it is not a usability test (SCREEN `transcript.md:3–5`). No source was changed and no app mutation or secret file was read.

### Cited findings

#### [UI-01] Give Issues and Changes their own useful list views

- **Evidence:** REF `packages/page/src/view.ts:46–56` renders two tables containing only number, title, state and optional draft. REF `packages/page/src/main.ts:138–150` dispatches only room, individual issue/change, rules and settings. REF `packages/page/src/data.ts:212–234` exposes only scope/number/kind/title/state/draft in `LaneRow`. SCREEN `room.png` visibly contains a closed issue and three changes together, with no status switcher, search, sorting, pagination, room name or create button.
- **Impact:** People must scan all work together, cannot quickly locate open issues or awaiting-review changes, and receive no useful room identity.
- **Effort:** L, several days, because fast truthful lists require a read contract as well as UI. **Risk:** MED; directory rows are advisory and must not become silently authoritative. **Confidence:** HIGH.
- **Fix sketch:** Persistent room navigation; separate Issues and Changes routes; default Open; explicit Closed/Merged/All status controls, search, basic filters, stable paging and meaningful empty states. Extend row data only for features the product actually supports.

#### [UI-02] Replace protocol forms with contextual action workflows

- **Evidence:** REF `packages/page/src/view.ts:165–185` creates disclosure forms from protocol field names/types, requires manual `On item` defaulting to 0, and labels submits `Sign and send <act>`. REF `packages/page/src/data.ts:528–537` uses `heldActs` to offer role-granted actions but says scopes may still refuse on state/guards. SCREEN `issue.png` shows eleven schema disclosures, including close/reopen actions on a closed issue; SCREEN `rules.png` exposes fields like `extents:extent-list (rule)`.
- **Impact:** Every task requires knowledge of internal item IDs, fact references and typed JSON. Role permission is mistaken for contextual availability; irrelevant actions overwhelm ordinary work.
- **Effort:** L. **Risk:** MED; preserve typed signing/expected revisions and protocol authority. **Confidence:** HIGH.
- **Fix sketch:** Put New issue in the list header, Comment at the conversation, Assign in issue metadata, Close/Reopen in the issue action area, Request review/Review/Publish at a change readiness panel. Choose the current item/version internally. Keep a clearly named Advanced actions inspector for custom definitions and operators.

#### [UI-03] Put the actual publication outcome above operation diagnostics

- **Evidence:** REF `packages/page/src/states.ts:46–65` covers rules-not-met and authority-lost but has no summary for path-invalid, out-of-date or a generic merge refusal. REF `packages/page/src/view.ts:97–118` renders operations near the top and actual merge reason below reviews/checks/links. SCREEN `change-refused.png`: top says only `effect confirmed: judge, operation 33:0`; the true `refused (path-invalid)` appears around the lower quarter. SCREEN `change-published.png` shows eight publication/effect lines before the version.
- **Impact:** A refused change can initially look successful; people scroll through internal machinery to learn the task outcome and next step.
- **Effort:** M for faithful outcome summary; L with full workflows. **Risk:** MED; never collapse unknown/queued into failure or success. **Confidence:** HIGH.
- **Fix sketch:** First card: Open + Publication refused + Invalid file path, with Fix path when supported, exact technical reason in expandable details. Separate lane lifecycle, latest publication attempt and operational health. Collapse confirmed judge/mint/revoke/receipt records under Publication details. Unknown delivery says outcome unknown, not failed; accepted intent says submitted, not published.

#### [UI-04] Distinguish Preview, a published version and the latest site

- **Evidence:** REF `packages/page/src/data.ts:330–331,404–406` maps every version file to HEAD. REF `packages/page/src/view.ts:103–104` shows an active `Rendered page` URL even for refused/unpublished proposals, with a qualification that it shows the published branch. SCREEN `change-refused.png` contains `/HEAD/../outside.md`; SCREEN `change-published.png` names publication commit `dbe726652c89`, while SCREEN `site-page.png` says rendered from `3c98483d47d15...` after a later change. REF `packages/scope/src/site/route.ts:5–9,42–43,308–312` resolves branch/tag/HEAD, exposes the site without a read session, and caches a moving ref for 60 seconds.
- **Impact:** A published-branch page does not show the proposed version. HEAD can show later content than the selected change. Renaming it Preview would make the interface false; dot segments can normalize to another URL before reaching the server.
- **Effort:** S for truthful labels/invalid-path suppression, L for immutable preview and published-version contracts. **Risk:** HIGH for preview because the browser origin holds a signing key and renderer security must remain intact. **Confidence:** HIGH.
- **Fix sketch:** Current capability: View latest site / View published page, clearly marked Latest published content. Suppress invalid-path links. New capability: Preview renders exact proposal version/blob, never calls it published; View this published version uses its confirmed immutable commit through a reviewed route contract. Keep branch/tag selection separate from commit selection.

#### [UI-05] Preserve unknown and incomplete reads instead of inventing absence

- **Evidence:** REF `packages/page/src/data.ts:105–115` silently breaks a final-item page read on refusal and caps at 100 pages without completeness metadata; `textOf` at 119–122 maps all refused text reads to null; `listLanes` at 225–230 falls back to directory title/state on failed authoritative lane reads; `publicationsOf` at 351–355 returns empty map on failed destination summary; `historyOf` at 364–373 caps at 1,000 pages with no exhaustion state. REF `packages/page/src/view.ts:116` describes null publication as no recorded publication. These are source facts, not failures proven in supplied screenshots.
- **Impact:** Missing permission, unavailable services and truncated histories can look like empty comments, no publication, stale open state or complete lists. Stylish UI would amplify misleading certainty.
- **Effort:** L, first dependency of the workbench. **Risk:** MED; changes return types through page data and tests, not authority rules. **Confidence:** HIGH.
- **Fix sketch:** Typed read results carry provenance/head, completeness, continuation and error. Retain partial list rows explicitly marked Status unavailable / Last known status; never count them as freshly authoritative. Distinguish redacted/missing content from unreadable content. Progressive reads and scoped publication operation reads avoid loading a room's entire history.

#### [UI-06] Retain the scope answer when a later read fails

- **Evidence:** REF `packages/page/src/data.ts:557–579` receives accepted/refused/unavailable/mismatch and then awaits a summary before returning it; failed post-submit summary throws away that answer. REF `packages/page/src/main.ts:80–85` deletes lastActs on any exception and alerts. `answerLine` at REF `view.ts:153–157` has good explicit refusal/non-write copy when the answer survives.
- **Impact:** A successful submit followed by a read outage can lose its receipt and invite duplicate submissions. People cannot distinguish no reply from known acceptance plus failed refresh.
- **Effort:** M. **Risk:** MED; retain existing replay/idempotency semantics and nonce behavior. **Confidence:** HIGH.
- **Fix sketch:** Capture known scope answer immediately; post-read failure is a separate observation status. Preserve draft, exact signed request identity and receipt. Offer Check status for an unknown submit result; do not generate a new irreversible intent as a blind retry. Later reference worktrees have some receipt-preservation repairs: reconcile those before implementing anew.

#### [UI-07] Refresh membership and show permission reasons without a protocol lecture

- **Evidence:** REF `packages/page/src/main.ts:64–68` caches the opened Room by service/directory/secret. REF `packages/page/src/data.ts:91–96` renews reader but does not refresh standing; `openRoom` at 196 reads standing once; `actsOn` at 532 subsequently uses cached room.me. SCREEN pages repeat key ID, role and signed-read session details above content. Role grants do not imply guard availability (REF data.ts:522–526).
- **Impact:** Revoked/reassigned permissions can leave obsolete affordances; key/session mechanics distract every reader. The server still decides, so this is an affordance correctness problem rather than evidence of unauthorized execution.
- **Effort:** M/L. **Risk:** MED; distinguish session expiry, unavailable authority and real permission refusal. **Confidence:** HIGH.
- **Fix sketch:** Account menu shows handle/role; connection health shown only when relevant; diagnostics disclose key/session/head. Refresh standing on membership events or bounded reread and before permission-sensitive workflows. Show relevant disabled action with reason when it explains a task; hide irrelevant administration entirely.

#### [UI-08] Design and prove mobile, keyboard and screen-reader operation

- **Evidence:** REF `packages/page/src/index.html:18–29` uses `grid-template-columns:max-content 1fr`, multi-column tables, compact 4px control padding and no responsive width breakpoint, skip link, explicit focus styling, overflow wrapping or minimum touch sizing. REF `packages/page/src/main.ts:57,138–153` replaces the root without focus restoration; only initial HTML `Loading.` at index.html:33 announces loading visually. REF `packages/page/test/screens.mjs:43–45,60–63` captures only 1000×800 light desktop; its screenshots are verification artifacts, not accessibility assertions. Native labels/details/buttons already give a useful semantic foundation. SCREEN supplied images show long scope IDs/URLs and six-column rules tables. No actual 320px run was performed, so narrow-screen overflow is a strongly grounded risk, not a measured result.
- **Impact:** Core review/admin tasks can require horizontal page scrolling, tiny targets or repeated keyboard traversal; root replacement can strand screen-reader focus and lose in-progress inputs.
- **Effort:** L. **Risk:** MED; responsive presentation must preserve semantics and evidence. **Confidence:** HIGH for missing code/test coverage; MED for actual narrow rendering.
- **Fix sketch:** Mobile-first row cards, wrapped headings/identifiers, controls at least 44×44px, two-column metadata stacking, local horizontal diff/table scrollers, focus and status announcements, mobile review flows. Prove reflow at 320px plus touch, keyboard and assistive technology on real devices.

### Exact excerpts for independent verification

From REF `packages/page/src/data.ts:108–113`:

```ts
for (let cursor: string | undefined, pages = 0; pages < 100; pages++) {
  const page = await handle.items(type, cursor);
  if (!page.ok) break;
  for (const item of page.value) if (!items.has(item.id)) items.set(item.id, item);
  if (page.next === undefined) break;
  cursor = page.next;
```

From REF `packages/page/src/data.ts:353–354`:

```ts
const read = await G.summary();
if (!read.ok) return new Map();
```

From REF `packages/page/src/data.ts:579`:

```ts
return { answer, before, after: (await summaryOf(handle)).at };
```

From REF `packages/page/src/data.ts:405–406`:

```ts
export function siteAddress(room: Pick<Room, "session" | "directory">, path: string): string {
  return `${room.session.service.replace(/\/+$/, "")}/site/${room.directory}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;
```

### Inferences

The best leverage is a complete new presentation layer over preserved domain contracts, beginning with read truth/receipt preservation. Simply relabeling protocol accordions leaves the cognitive model unchanged. Proposed effort estimates are rough design/build scope, not schedule commitments.

### Gaps

No permission/status failure recordings, mobile captures, user timing results, screen-reader sessions or production-scale lists were supplied. The deployed build SHA is not in the transcript. The repeated bottom header/breadcrumb strip visible in `site-page.png` has no corresponding repeated header in REF route template (route.ts:251–255), so reproduce it before filing a duplicate-chrome implementation bug.

## What should a complete human workbench look like?

### Takeaway

Use familiar nouns to locate work and concrete verbs to perform it. The workbench should make room identity, work state and the next relevant action visible while retaining precise evidence behind expandable detail.

### Grounded design recommendations

All recommendations below respond to the cited UI-01–UI-08 gaps. They are proposed design requirements, not claims of current capability.

**Information architecture.** Header: Artroom, meaningful room name/room switcher, account. Room navigation: Issues, Changes, Pages, Settings; an Activity destination only if a supported user-facing activity read exists. Room root defaults to open Issues or remembers a clearly visible last destination. Settings contains Rules, Members, Connection; rules have a read-only summary for ordinary members and Configure rules for permitted administrators. Do not promote low-level task scopes to a top-level Tasks destination without a defined human job. IDs/hashes, outbox, grants and replay details remain in Inspect history / Advanced actions.

**Naming.** Navigation nouns are a convention people scan to identify destinations; an Issues tab is clearer than a verb implying a mutation. Action controls use verbs: New issue, Edit page, Comment, Assign, Close issue, Reopen issue, Request review, Approve version, Request changes, Publish change, Configure rules, Save rules. A link can still be an action: View published page / View latest site. Preview is valid only when it renders the selected proposal. Avoid `Sign and send`, `open-pr`, `What you may do here`, `the rules of this room` and `the published site` as general action labels. Retain exact protocol act names only in the inspector.

**List anatomy.** Desktop header includes Issues or Changes, count qualified by completeness, and primary create/edit control. Status segment follows, then Search issues/changes and explicit filter menu; active filters visible as removable chips; Clear filters appears on zero-match state. Issues default Open, then Closed, All; Changes default Open, then Merged, Closed, All, with Draft and review/publication state as separate filters. Sorted by recently updated only after timestamp contract exists, otherwise state the actual supported order. Keep query/filter/sort/cursor in URL; Back returns to prior list position and filter. Avoid introducing Kanban as default—the existing issue/change model already favors list review.

**Issue detail.** Title + #number + state; context breadcrumb; primary state control and overflow Edit title/body. Conversation body and chronological event/comments timeline in main column; assignees and Conditions in sidebar (single column on mobile). Comment composer has multiline body, draft retention, submit pending state, inline errors. Assignment uses members picker. Closed issue shows closure reason and Reopen when authorized; do not require item 0. Linked closing change resolves to readable #number/title, not scope ID. Commitments/reports/holds appear where they actually help an issue task, progressively disclosed; do not erase domain state merely because GitHub lacks that concept.

**Change detail.** Title/#number/lifecycle; outcome card first, with distinct latest publication attempt and operational uncertainty. Tabs: Conversation, Files, Checks when data supports each. Files offers base→selected immutable version diff, filename tree, changed lines, unified default, split optional on desktop, keyboard file navigation and text alternative for binary/non-text content. Approval always names the version and protected extent. Changed version invalidates the current review presentation as domain rules require; never imply an old version's approval applies. The readiness panel names unmet requirements from lane-held rules and explicitly says destination rechecks current rules; it must not claim Ready to publish solely because counts look complete. Published links distinguish selected commit and latest branch. Technical merge attempts/operations remain visible in expandable history.

**Rules.** Plain-English categories Protected rules files / Infrastructure / Other files, with original extent names available. Read summary includes who may approve, required checks, protected paths and whether author approval is allowed. Configure rules edits structured fields with path patterns, approval counts, eligible role/member grant explanations and declared-check selector. Preview impact on representative changed paths; review change summary before Save rules, only as an in-flow control—do not invent an external approval requirement. A failed save retains form and displays exact refusal with useful next step. Show revision read and expected revision; conflict prompts reload/compare while preserving draft. Keep custom definitions in Advanced configuration, with pinned digest provenance.

**Pages and published reading.** Pages presents folder/content navigation and Edit page, not remote URLs/hashes as headings. Published reader uses meaningful room/title, breadcrumb, accessible branch/tag selector, current-version identity, restrained content typography, local ToC for long pages, and View room. Missing path/ref, host outage and file-too-large get designed recovery pages with status semantics preserved; no private content leaks into failure bodies. Current site is public by ID; do not invent private/public controls until supported authorization contracts exist. Ensure custom room display name is separate from immutable repository host identity.

**Visual system.** Neutral layered surfaces, one calm accent, semantic colored statuses with icon/text, thin separators, little shadow; 8px spacing base; 4/8/12/16/24/32 spacing scale; body 16px/1.5, compact metadata 13–14px, 24–32px page title; headings and rows supply hierarchy. Use readable ~70-character content measure, wider bounded lists/review workspace. Buttons distinguish primary/secondary/danger without relying on color; quiet status icons; no decorative metric dashboards, giant empty hero or glossary around normal buttons. Support light/dark via tested contrast tokens and reduced motion. Reuse tokens/components between workbench, previews and published reader while preserving rendering security boundaries.

### State contract and responsive acceptance matrix

| Situation | Required experience |
|---|---|
| No room or unopened invitation | One invitation-aware Join room flow; service inferred from link/current origin where contract allows; key generation automatic and explained briefly; explicit expired/used invitation error; advanced import available |
| First issue/change or empty published repository | Explain what is empty and offer one relevant authorized action; no zero-data schema table |
| Filter has no matches | Preserve query/chips; Clear filters; do not say room has no issues |
| Loading / navigation | Stable shell, announced loading, cancel superseded reads; preserve draft/selection; destination title and focused heading on completion |
| Partial list/read error | Keep read rows; mark unavailable/last known with time/head provenance; Retry failed section; accurate completeness/count |
| Unauthorized/removed member | Explain access loss, preserve local draft, no false write success; account/connection recovery only |
| Unavailable authority | Distinct temporary unavailability; same authorized act can be retried only with domain-safe identity semantics |
| Revision mismatch | Preserve draft; Refresh and compare; never silently overwrite |
| Submit accepted, later read failed | Keep receipt and say Submitted; unable to refresh; Check status |
| Request outcome unknown | Keep request identity; Check status; never assert Nothing was written |
| Merge refused | Open change remains open; publish attempt refused with reason and remedial action |
| Publication queued/unknown/confirmed | Distinct states; polls/stream update known read heads; confirmation only from actual record |
| Rules or membership changed | Refresh visible availability and revision; maintain server decision authority |
| 320–479px | Single column, wrapped row cards, label+status retained, filters in accessible sheet, 44px targets, unified diff, no document-level horizontal scrolling |
| 480–767px | Same complete tasks; comfortable row density; responsive composers and controls |
| 768–1023px | Optional metadata/sidebar where space allows, no collapsed essential controls |
| ≥1024px | Work lists plus side metadata; resizable file navigation; split diff optional; comfortable maximum width |
| 200% text / 400% zoom | Reflow with all tasks available; code/diff scroll isolated; no clipped actions/sticky overlays |
| Keyboard / screen reader | Skip link, semantic nav/lists/headings, active destination; visible focus; logical order; Enter/Space actions, Escape dialogs; focus returns to trigger; labels/errors associated, status live region, non-color state; no drag-only task |
| Touch / mobile browser | Tested input with virtual keyboard and safe areas; no hover-only affordance; non-sticky fallback if action bar obscures content |

### Contracts/data gaps to settle before building promises

1. Room name/display identity and browser-safe room discovery/link format; no pasted config/secret needed on ordinary invitation join.
2. Bounded searchable issue/change list contract with truthful provenance, heads, completeness, cursor, supported state/count semantics; actual-authoritative status fallback distinguished from directory copy. Date/updated-by, assignee, author, labels, comments/review/check counts currently absent from LaneRow and cannot be added as fictional UI data.
3. Fresh membership/role and contextual action availability; avoid reimplementing rule judges in client. Advisory presentation can explain expected blocker but final signed scope answer decides.
4. Partial/error return types for every read and accepted-answer preservation across failed post-read; transport unknown separately from refusal/unavailable/mismatch.
5. Immutable diff read: selected manifest's base/current content with provenance, path validation, size/binary limits; current ChangeView has metadata, not diff text. Structured review submission tied to selected version/extent and real current eligibility.
6. Exact proposal preview and commit-pinned published rendering, isolated from untrusted scripts; current route only branch/tag/HEAD. Page editor supplies real retained bytes and uses existing propose/merge semantics, not direct Git bypass.
7. Change-linked issue number/title resolution and event timeline from retained records, with redaction/error distinctions; comments currently lack timestamps in view.
8. Progressive publication status/operation reads instead of entire destination history scans; stream expiry/reconnect with last-known provenance.

### Inferences

A coherent desktop/mobile workbench is feasible because data functions already separate signing/reading from DOM. The presentation must preserve domain distinctions—lane state, manifest/version, held rules, current destination judgment, recorded publication—and avoid turning an advisory projection into an authority. UI appearance can be rebuilt aggressively while those boundaries stay explicit.

### Gaps

Browser identity portability/recovery, public/private site support, labels/filter semantics, exact preview route, diff annotations and activity timeline need product/contract decisions. Do not include avatars/timestamps/collaborator presence or claim they exist without a supporting read contract.

## How should the redesign be delivered and verified?

### Takeaway

Specify workflows and read contracts first; deliver complete slices with accessibility and mobile acceptance from the start. The existing tests prove domain behavior but not usable mobile interaction.

### Executable checks and existing witnesses

Commands below are planned checks in the integrated reference/future worktree, **not executed in this read-only audit**. Run only the focused tests applicable to that slice; run the gate once at the review head. REF `docs/testing.md:330–391` (historical MAIN had the same policy; accepted I5 now includes the Page inventory) requires narrow working tests, meaningful invariants, no mutation sweeps and a single gate; doc-only revisions can reference unchanged source/test tree hashes rather than repeat a gate.

| Command | Expected result / limitation |
|---|---|
| `npm run test:changed` | Changed-source dependent tests pass; only affected active test files run |
| `./node_modules/.bin/vitest run --project page packages/page/test/states.test.ts` (asset parity separately after a changed build) | State projections preserve refusal/unknown/confirmed distinctions; generated assets match source. Extend states witness for path-invalid/out-of-date/generic refusal; existing REF states.test.ts:13–54 explicitly leaves out-of-date with no high-level policy state |
| `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` | Existing REF page/test/story.scope.test.ts:19–134 demonstrates join/session/signing, truthful lane/publication state, author-review refusal, controller review, rules and session renewal over real scopes; Git host/scheduler remain labelled stand-ins |
| `./node_modules/.bin/vitest run --project scope packages/scope/test/page-route.test.ts` | Deployed Worker serves page/JS, CSP maintained, redirect/404/405 correct; existing REF scope/test/page-route.test.ts:8–35 |
| `./node_modules/.bin/vitest run --project scope packages/scope/test/site-route.test.ts` | Ref/path resolution, missing/large/error cases, branch-move caching, images, index, navigation, versions remain correct; REF scope/test/site-route.test.ts:208–467 uses stand-in host |
| `./node_modules/.bin/vitest run --project scope packages/scope/test/site-conformance.test.ts` | GFM specification witness and served safe rendering remain passing; preserve raw HTML escaping and link semantics |
| `npm run build --workspace @generalbusiness/artroom-page` | Generated page-assets module refreshed when UI source changes; assets.test proves freshness |
| `PLAYWRIGHT_CORE=/absolute/scratch/tool/node_modules/playwright-core CHROMIUM=/absolute/existing/chromium node packages/page/test/screens.mjs` | Current recorded desktop screenshot harness succeeds, unanswered requests fail; it writes screenshot/build artifacts so execute only within authorized implementation/test worktree. Existing harness requires external tool; never install into checkout. Extend viewport/state interactions rather than treating these current screenshots as mobile/a11y proof |
| `npm run gate` | Once, before review, at actual implementation review head; all required typecheck/tests/pins/source checks pass; do not whole-suite rerun or mutation sweep |

**New meaningful witnesses.** At pure data boundary: incomplete final-page response does not become complete/no data; unreadable destination does not mean no publication; stale index fallback remains marked advisory; nonempty known answer survives post-read failure. At real scope boundary: comment/create/review/publish forms deliver required typed fields, expected revision and exact version; stale/missing authorization refuses while preserving draft. At browser boundary: one end-to-end invitation→issue→review→publication workflow through production bundle and recorded/real Worker route contract, plus representative failure controls. A role-hidden action must not be mistaken for an unavailable dependency. Test invariants once at cheapest sufficient boundary; do not assert one component per token.

**Browser quality gate proposed.** 320, 375/390, 768, 1024, 1440 widths; portrait/landscape phone; light/dark; touch and keyboard. Assert no page horizontal overflow except explicitly labelled diff/code scrollers, 44px targets for main controls, active route state, focus after navigation/modal close, no unresolved console errors or unrecorded network requests. Run automated accessibility tooling pinned in scratch against real rendered DOM, plus manual VoiceOver/Safari and NVDA/Firefox or equivalent desktop AT, iOS/Android touch/virtual-keyboard task completion. Check 200% text, 400% zoom, reduced motion, forced colors; contrast both themes. These are requirements, not current test results.

**Usability gate proposed.** Test people with fresh-room setup/open invitation, find an open assigned issue, add comment, identify why a protected change is blocked, review selected version, distinguish Preview from latest published site, and recover failed write. Record task success, critical misunderstandings, assisted steps and elapsed time. Provisional target: all core tasks complete unassisted on phone and desktop, zero false beliefs about accepted/published/unknown outcomes, and no specialist IDs needed; tune quantitative time targets from an observed baseline instead of inventing performance claims.

**Delivery sequence.** (1) Lock IA/copy/data/state contract and usability cases; (2) rectify truthful reads/known-answer handling and freshness; (3) responsive shell and real list views; (4) issue creation/details/comment/assignment complete slice; (5) change review/diff/outcome/publish complete slice; (6) structured rules and invitation/connection flow; (7) exact preview/published reader/editor integration; (8) accessibility/performance/user study verification and review. Each stage uses desktop/mobile designs and preserves existing scenario witnesses. Publish no design-only UI that advertises absent contracts as working actions.

### Inferences

The current screenshot recorder is a valuable starting fixture because its answers come from real scope routes, but its single fixed desktop viewport and non-assertive image recording do not establish accessibility or usability. Reuse recorded domain histories and enrich browser behavior checks, rather than replacing them with screenshots of fictional mocks alone.

### Gaps

No executable browser-a11y suite or assistive-technology validation is present in the inspected reference. Tool locations for future scratch browser checks must be established without modifying checkout dependencies. No checks were run by this researcher because no app source changed. Parent reports one successful MAIN gate at `1eed91a`, tree `2d00a7ee9b664322f73267923f1e7466d10d23b7`: 785 vitest tests plus 6 script tests. This validates MAIN only, not the rehearsal reference, proposed UI or mobile/accessibility. Parent tracks gitseq request `ded25d6f`, promise `3d76ff06`.
