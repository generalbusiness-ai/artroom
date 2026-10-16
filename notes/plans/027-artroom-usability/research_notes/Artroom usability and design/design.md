# Artroom: modern work app patterns, design standards, and validation

## Publication reconciliation — 8 October 2026

This is the complete historical research record, with publication corrections. Its original source claims refer to main `1eed91a` and reference `315785966`, not current main; original excerpts and screenshot findings retain those subjects. Accepted I5 (`7bb3a641`, publication base `16d7ba44`) now contains Page/Site/clone/edit/issues/planned install and the fixes described in the shared [baseline and evidence](../../BASELINE.md). Historical source links may resolve to newer files; check excerpts with `git show <stated-head>:<path>`.

I5 rejects incomplete/failed/mixed-head enumeration, keeps known returned answers across refresh failure in memory, guards service/identity/URL boundaries, labels latest Site separately from unavailable immutable rendering, and repairs clone/planned-install observation/recovery. Remaining partial/provenance/text reads, durable reload/outbox, fresh standing, query, exact preview and external acceptance remain open. The four handoffs are future proposals, not commissioned/adopted/dispatched work. All proposed commands/APIs remain unavailable until implementation. Plans 006/020/025/026 retain their duties; retained sample QA proves only its actual sample, not current product/provider/browser/device/accessibility/cold-user acceptance.


Research date: 8 October 2026. Primary documentation was fetched on this date. Product documentation supports documented behavior; it does not establish usability superiority or verified parity with a signed-in live app. All Artroom targets and design choices below are proposals, not measured results.

## 1. Which modern work app patterns transfer to Artroom?

### Takeaway

Borrow the familiar structure of work lists and contextual actions, and remove unnecessary decisions before the first useful outcome. Compare platform installation, workspace creation, and creation inside an existing workspace separately; board creation is not a valid proxy for installing a service.

### Cited Findings

- GitHub documents separate Issues and Pull requests pages, default filters for open work and work involving the current user, filters by assignee and labels, review-status filtering for pull requests, sorting, and URLs that preserve filter and sort selections. The UI offers dropdowns as well as a query field; syntax need not be the first interface a beginner learns. — [GitHub: filtering and searching issues and pull requests](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests?tool=webui)
- GitHub repository creation distinguishes owner, name, optional description, visibility, and optional prepopulated files/templates. Its documentation warns against adding initial files when importing an existing repository because of possible conflicts. Organization permissions can restrict creation. — [GitHub: creating a new repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- Linear creates a team with the workspace's name by default, recommends beginning with one or two teams, and makes Triage and Cycles opt-in. Later team creation can be restricted by workspace permissions, and includes copying existing team settings. — [Linear: teams](https://linear.app/docs/teams)
- Linear projects can be created from workspace/team project views; only project name and status are required. Project views can display lists, boards, or timelines and be organized by properties. — [Linear: projects](https://linear.app/docs/projects)
- Linear issues require a title and status and belong to a team. Creation is accessible through a visible create control, shortcut, or logged-in creation URL. Its documentation explicitly describes preserving drafts and distinguishes temporary local drafts from saved drafts. — [Linear: issues](https://linear.app/docs/creating-issues)
- Linear filtering narrows lists by properties such as status, assignee, labels, and project, updating results as filters are applied. Main filters are included in the URL; view options and quick filters are not. Saved custom views can be created from a filtered list/board. — [Linear: filters](https://linear.app/docs/filters), [Linear: custom views](https://linear.app/docs/custom-views)
- Atlassian's Jira Cloud board guide fetched on 8 October 2026 separates first-time Jira setup, which creates a space and may already select a board, from board creation after setup. Existing-space board creation depends on permissions; team-managed projects have restrictions on directly creating additional boards. That retrieved guide used “spaces” terminology, while still mentioning “projects” in a compatibility note. — [Jira Cloud: create a scrum board based on spaces](https://support.atlassian.com/jira-software-cloud/docs/create-a-board/)
- USWDS recommends short, sentence-case button labels that describe the outcome and begin with a verb; it also advises against excessive buttons. — [USWDS: button](https://designsystem.digital.gov/components/button/)
- The rehearsal room presents raw identity/key information, a scope ID, and an operation-schema accordion under “What you may do here.” The refused-change screenshot prominently shows “effect confirmed,” places publication refusal lower down, and describes a HEAD page as unavailable for the proposed version until publication. These are observations of supplied artifacts, not a live application audit. — [Room screenshot](/Users/hughpyle/tmp/artroom-rehearsal-1/room.png), [Refused change screenshot](/Users/hughpyle/tmp/artroom-rehearsal-1/change-refused.png)

### Inferences and proposed design direction

**Creation and the easy path**

- Separate operator setup from ordinary room creation. An existing service should let a person choose a room name and start work with defaults. A self-hosted operator still needs infrastructure/authority choices; compressing these into an opaque command must not conceal who gains authority or where data is published.
- Treat creating a fresh local folder, connecting an existing Git repository, joining a room, and administering a server as different entry intentions. Detect context and offer an appropriate default, preserving files/history. Do not force a fresh-room tutorial on import/join paths.
- Default the basic issue/change definitions and a clearly described review policy. Policy defaults are a product decision that needs explicit review; do not silently infer that a zero-approval policy is universally safe merely because the rehearsal uses one.
- First useful outcome should be visible: a room that can accept an issue or change, with one next action. Invite others, configure advanced rules, inspect scopes, and manage service internals should come later.
- Report progress in outcomes: “Create room,” “Prepare repository,” “Ready.” If a partial operation can be retried, preserve a resumable identity and explain the remaining action. Never require the user to reconstruct IDs from terminal output.
- Count decisions, context switches, pasted tokens, required unfamiliar concepts, and recoverable failure paths, rather than claiming one command eliminates setup complexity.

**Room navigation and lists**

- Default room destination: the Issues list, or an intentionally designed lightweight overview that links immediately to Issues and Changes. Establish this through testing; do not begin with a ledger dashboard.
- Primary navigation: Issues, Changes; secondary navigation: Files, Activity if useful. Preview and Configure rules are contextual actions. Members/settings are an overflow or room menu. Noun labels remain appropriate for navigation destinations; verb labels are for actions. Turning every destination into “View issues” can add noise.
- Issues: Open / Closed / All, search, status filter, optional assignee/label filters, visible sort, and “Create issue.” Changes: Open / Merged / Closed / All, plus review/publication condition filters supported by the actual data model. Do not invent workflow states to match a competitor.
- Rows foreground title and human status, then number, author/assignee, activity time, labels. Change rows additionally surface the most useful current blocker or required review. Protocol IDs belong in Inspect details, with Copy ID.
- Preserve list filters and sort in shareable URLs and browser history; preserve scroll position when returning from an item. Make filtered-zero-results distinct from an empty room, with “Clear filters.” Avoid hidden personal defaults that make a shared link show a different result.
- Show selected filters as removable chips. A visible “Filter” control works on touch and keyboard. A query syntax/command palette can be an advanced accelerator after ordinary controls work.
- “Create issue” should open a title-first composer with an optional body and optional metadata. Preserve draft text across a failed submission and accidental navigation. Meaningful confirmation should reveal the created issue, not a scope entry.

**Change detail and truthful actions**

- Above the fold: title/number, open/merged/closed state, publication outcome, latest actionable blocker, author, version, and the next permitted action. Put file changes and review discussion before optional audit data.
- Refusal example: “Not published. This path is outside the room.” Follow with a precise correction supported by product behavior; avoid offering “Retry” when retrying unchanged input cannot succeed. If editing a proposed path is unsupported, explain that a new corrected change is needed.
- Review status is not publication status. “Approved” does not mean merged; “effect confirmed” for a judge operation does not mean a change was published; “0 required checks” does not mean verification succeeded. Preserve these distinctions in text and iconography.
- Preview must identify what it shows: “Preview version 5” only when rendering that exact version is implemented and verified. A HEAD link should say “View published page.” Label “Latest published version” when useful. Do not fabricate a review preview by linking to an older published page.
- One primary action per state, e.g. Request review, Review change, or Merge change, selected from real capabilities and current conditions. Disabled actions require an adjacent explanation of the unmet requirement. Discoverable unavailable permissions may be useful; raw capability/field-schema dumps are not an interaction design.
- A durable activity timeline answers who did what and why. Expand “Inspect details” for digests, scope IDs, held-rule version, operation attempts, and exact refusal codes. Clarity requires keeping this evidence available without making it the principal reading order.

### Gaps

- No signed-in competitor walkthrough was performed. There is no verified click count, task completion time, pricing-independent feature parity, or evidence that any competitor's full onboarding is uniformly simple.
- The report needs the code audit's authoritative lifecycle/capability model before defining filters and CTA eligibility. Proposed review summaries must not collapse different policy extents or imply a reviewer can approve all affected areas.
- The screenshot observation does not establish whether client-side JavaScript improves keyboard, focus, responsiveness, or submission behavior; those need direct testing.

## 2. What visual and interaction standard should Artroom adopt on desktop and mobile?

### Takeaway

Use restrained visual hierarchy, readable type, predictable controls, and a small token system. Sleekness should result from coherent spacing and clear priorities, with accessibility and mobile review designed into the same product.

### Cited Findings

- WCAG 2.2 is W3C's recommended conformance target; criteria apply across desktop and mobile. WCAG does not cover every accessibility need, and conformance claims concern complete pages/processes, not an attractive screenshot or automated scan alone. — [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- Normal text requires at least 4.5:1 contrast; qualifying large text requires 3:1. Thresholds must not be rounded up. — [W3C: contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- Visual information necessary to identify a control, meaningful graphic, or state requires 3:1 contrast against adjacent colors, with applicable exceptions. Decorative separators are different from an input boundary necessary to recognize an input. — [W3C: non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- WCAG 2.2 AA pointer target minimum is 24 × 24 CSS pixels, subject to spacing, equivalent-control, inline, user-agent, and essential exceptions. The guidance explicitly observes that larger targets help many users. — [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Reflow addresses access at the equivalent of 320 CSS pixels for vertically scrolling content; content that requires two-dimensional layout can have exceptions. Its examples discuss a side-by-side change comparison whose individual columns fit 320-pixel containers. — [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- Focused controls must not be entirely obscured by author-created content at AA. Sticky headers/footers can violate this criterion; the proposal below deliberately exceeds the minimum by requiring full visibility. — [W3C: focus not obscured minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- Drag-operated functions need an equivalent single-pointer action without dragging unless an exception applies. Keyboard equivalence alone does not satisfy this criterion. — [W3C: dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- APG differentiates buttons that perform actions from links that navigate. Buttons activate with Enter and Space; native HTML is preferable to manually rebuilding ordinary semantics. — [W3C APG: button](https://www.w3.org/WAI/ARIA/apg/patterns/button/), [W3C APG: link](https://www.w3.org/WAI/ARIA/apg/patterns/link/)
- APG modal dialogs place and contain keyboard focus, close with Escape, and normally return focus appropriately. Tabs use arrow keys within the tab list; automatic activation is recommended only when panel display has no noticeable latency. Route links styled as tabs are not automatically ARIA tab widgets. — [W3C APG: dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [W3C APG: tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- Status messages about outcomes, waiting, progress, or errors should be available to assistive technology without needing focus. Announcing an entire frequently updating work list would not follow from this requirement. — [W3C: status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- Authentication should support assisting mechanisms such as password managers and paste; requiring manual transcription of credentials or codes without an alternative can fail AA. — [W3C: accessible authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)
- Disabling nonessential interaction-triggered motion is a WCAG AAA criterion, not an AA requirement. W3C guidance supports honoring reduced-motion preferences and avoiding unnecessary motion. — [W3C: animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

### Inferences and proposed design specification

All tokens below are proposed, not competitor tokens or W3C mandates. Contrast ratios were calculated using WCAG relative luminance on these flat color pairs; they are not proof that every rendered component or future theme conforms.

| Token | Proposed value | Purpose |
|---|---|---|
| Font | system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif | Fast native-feeling interface without a required font download |
| Body | 16px / 24px, weight 400 | Descriptions, forms, comments |
| UI text | 14px / 20px, weight 400–600 | Desktop labels and metadata; avoid smaller routine text |
| Page title | 28px / 36px desktop, 24px / 32px mobile, weight 600 | One clear page identity |
| Section title | 18px / 26px, weight 600 | Secondary hierarchy |
| Monospace | ui-monospace; only paths, code, optional IDs | Technical meaning rather than overall product tone |
| Spacing | 4, 8, 12, 16, 24, 32, 48px | Consistent density and grouping |
| Page inset | 32px desktop, 16px phone | Keep content readable at narrow widths |
| Reading width | 68–76ch prose; lists can be wider | Bound long reading lines |
| Main background | #F6F8FA | Quiet room canvas |
| Surface | #FFFFFF | Lists, composers, dialogs |
| Ink | #17212B | 16.29:1 on white |
| Secondary text | #52606D | 6.46:1 on white; 6.06:1 on main background |
| Action/focus | #3156D3 | 6.17:1 on white; white text on this filled button also 6.17:1 |
| Essential boundary | #6B7785 | 4.56:1 on white; use for necessary form/checkbox boundaries |
| Decorative divider | #D8DFE6 | Only grouping decoration; do not rely on this alone to identify inputs |
| Radius | 8px controls, 12px dialogs | Unified shape; reserve pill shape for chips/status |
| Shadow | Small, one subtle elevated shadow | Use mainly for popovers; ordinary lists do not need layered cards |

| Meaning | Foreground / background | Calculated contrast | Use rule |
|---|---|---:|---|
| Successful publication | #14734A / #EAF7F0 | 5.32:1 | Explicit “Published”/“Merged” text + icon |
| Waiting / needs review | #865400 / #FFF5D8 | 5.88:1 | “Needs review” text; not a failure color |
| Refusal / failure | #A82935 / #FFF0F1 | 6.26:1 | Specific failure text and recovery action |
| Review information | #6245A7 / #F3EEFC | 6.30:1 | Only if a distinct information category is useful |
| Selected control | #3156D3 / #EFF3FF | 5.57:1 | Label plus selected indicator, not color alone |

- Status text, icon shape, and semantic meaning must remain understandable in grayscale and forced-colors mode. Separate structural item status from action eligibility and publication outcome. Do not use generic green for every “confirmed” operation.
- Focus: visible 2px outline with 2px offset, independently checked against each adjacent background. Keep focused control and ring fully visible under sticky UI. Outline appearance should not depend on hover.
- Targets: propose at least 44 × 44 CSS-pixel action targets across touch and keyboard workflows, with 8px separation when practical. Compact 36–40px desktop controls may be considered only after real hit-target review; 24px is a standard minimum with exceptions, not the desired product experience.
- Use native links, buttons, form labels, disclosure controls, and selects wherever they meet the visual need. Avoid clickable whole rows with nested interactive controls unless hit areas and semantics are deliberately implemented. Make the title link the obvious navigation target.
- A single main action, a few visible contextual secondary actions, and a labeled overflow menu are preferable to a wall of equal-weight controls. Hover can reveal optional shortcuts, but never the only path to an action.
- Motion: proposed 100–160ms opacity or small positional transitions. No decorative parallax, springy content, or list reshuffling animation. Respect prefers-reduced-motion. Success should be stable text, not a transient animation users must catch.
- Default light theme with fully checked color values is sufficient for the first design pass. Dark/automatic theme should use independent tokens and verification; merely inverting colors is insufficient. Respect browser forced-colors and zoom independently of theme work.

**Responsive behavior, specified by task rather than shrinking a desktop page**

- At 320px: one-column page, short room switcher, clear Issues/Changes navigation, visible create action, search on its own line, Filter control with count. Avoid a permanent 240px sidebar, a dense multidimensional status toolbar, and page-wide horizontal scrolling.
- Mobile work rows become stacked: title, then status/number/person/time. Metadata can wrap; avoid cutting off the only distinguishing part of a title or path. Long paths need wrapping or an explicit copy/open affordance.
- At medium widths: collapsible room rail and flexible content. At desktop widths: optional 200–224px room rail, a bounded readable main region, metadata rail only when it improves review. Proposed breakpoints around 640 and 1024px are implementation starting points, not evidence of universal device categories.
- Mobile review: unified diff by default, file selector with changed-file count, per-file collapse, clear additions/deletions in text/icon and color, optional side-by-side at sufficiently wide widths. Permit local horizontal scrolling for genuinely necessary code, while surrounding controls/comments reflow.
- Keep version identity beside the diff/preview and before a review submission. Preserve selected file, scroll, draft comment, and filter context on Back. Updating to a new version must not silently attach an old drafted approval to changed content.
- A phone can review, comment, request changes, and merge when authorized. Do not substitute a message telling users to use desktop for ordinary workflow. Complex policy editing may use a dedicated page, with full data access and truthful validation on phone.
- Composer on phone: full-height/page presentation rather than a cramped centered dialog, explicit Close/Cancel, safe-area padding, action reachable above the virtual keyboard, text preserved when backing out. Any modal version follows focus and Escape conventions.
- Persistent bottom actions require viewport/keyboard testing and scroll padding. They must never hide the active field or the last discussion item. Use a stable action area, not a bouncing bar.

**Preview coverage required before implementation review**

Show desktop and 390px mobile versions of: populated Issues, filtered Changes with a blocker, change review showing protected-path requirement, refused publication, composer, room creation, and rules configuration. Also check 320px reflow, tablet width, 200% text, and 400% browser zoom. Include loading, empty, filtered-empty, offline, stale version, permission-limited, and error states. Style previews alone cannot establish task completion or accessibility.

### Gaps

- Apple/Material pages were attempted but were not readable through the fetch tool; no specific Apple/Material numerical requirement is claimed here. The 44px target is an Artroom proposal.
- No mobile screenshot, actual device walkthrough, dark-theme check, or keyboard/screen-reader run was available in the rehearsal evidence. Token calculations cannot substitute for component testing.

## 3. How should usability, accessibility, and performance be validated?

### Takeaway

Require repeatable task outcomes and test recovery as rigorously as the happy path. Treat a small formative study as design evidence, then establish performance and accessibility through appropriately scoped measurement.

### Cited Findings

- Core Web Vitals' good thresholds are LCP ≤ 2.5 seconds, INP ≤ 200ms, and CLS ≤ 0.1, assessed at the 75th percentile and segmented by desktop/mobile. All three must meet their thresholds; these are field-oriented experience metrics rather than a claim that a lab score measures every workflow. — [web.dev: Web Vitals](https://web.dev/articles/vitals)
- GOV.UK describes moderated usability testing as observing actual/likely users on specific tasks, usually in 30–60-minute sessions. Tasks should be relevant, clear, and avoid hinting at the correct route. Assistive-technology users often need their own devices/setup. — [GOV.UK: moderated usability testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing)
- W3C advises combining evaluation with users with disabilities and standards conformance testing. Small studies cannot support broad statistical generalizations, and accessibility-barrier sessions may prioritize understanding errors over speed. — [W3C: involving users in accessibility evaluation](https://www.w3.org/WAI/test-evaluate/involving-users/)
- The rehearsal transcript reports a scripted expected-output check, including a manually prompted operator step, not novice onboarding research. Its all-shots-match result establishes that the script saw expected outputs on that run; it does not establish simplicity, accessible actions, or comparative task speed. — [Rehearsal transcript](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md)

### Inferences and proposed validation plan

**Proposed product targets; none are measured claims**

| Task/quality | Proposed target | Measurement boundary |
|---|---|---|
| Existing-service room creation | ≤ 2 minutes to a usable room; ≤ 2 required user decisions excluding necessary authentication | Already reachable configured service; name and intentional privacy/policy choices documented |
| Create first issue | ≤ 45 seconds after entering the room | Title/body supplied; no mandatory policy/schema work |
| Find open change needing review | ≤ 15 seconds | A populated room with realistic decoy items; task phrased without naming Filter |
| Identify why publication failed and the next useful step | ≤ 20 seconds | Refused-change page; correct explanation required, not merely opening details |
| Novice critical task success | ≥ 90% unassisted across later validation | Proposed release target, not statistically established by six users |
| Formative rounds | 6–8 participants per round, then another round after fixes | Report raw n/N per task; do not imply this demonstrates the 90% rate |
| Critical misunderstanding | Zero observed belief that unconfirmed/refused action was published, wrong-room write, or approval of unintended version | Any instance blocks release of the implicated workflow pending correction and retest |
| Web performance | Good Core Web Vitals at p75 separately on phone/desktop | Field data once sufficient traffic exists; beforehand report lab conditions and distributions |
| Immediate local action feedback | ≤ 100ms | Button activation, focus/state feedback; does not assert operation completion |
| Typical filter/navigation content update | p95 ≤ 500ms on stated dataset/device/network | Measure separately from backend operation or policy settlement |
| Operation waiting | Show named current phase and preserve outcome/recovery | Long legitimate backend work is not hidden behind a misleading optimistic “Done” |
| Accessibility | WCAG 2.2 AA across complete critical processes, plus 44px touch target and reduced-motion product targets | Automated checks + manual keyboard/AT/zoom/device testing; no blanket claim from a scan |

Use small and large datasets: empty room; 30 items; 1,000 items; large change with many files and a long discussion. Measure rendering and response behavior separately. Add pagination or appropriately accessible loading before unbounded lists become an input-delay problem. Repeating a whole suite or a mutation sweep is not part of this research validation plan.

**Research protocol**

1. Recruit actual likely users: people familiar with Git but new to Artroom, and people comfortable with work apps but not with Git. Include mobile-first use and participants who rely on keyboard, screen readers, magnification, or alternate input. Do not claim one participant represents an entire disability group.
2. Test the current experience before teaching the proposed flow, then test the design in a separate round or counterbalanced task variant to reduce learning effects. Record service bootstrap, room creation, and member joining separately.
3. Give neutral task prompts: “Start a room for these files,” “Record the missing getting-started page,” “Find the changes that still need someone to review,” “Decide whether this change can be published,” “Show a colleague this same filtered list,” “Continue your comment after the network returns.” Avoid “Click Create,” “use status filter,” and command names that reveal the answer.
4. Capture raw outcomes: task completion, assistance, attempts, wrong selections, backtracking, abandoned draft, misunderstanding of state/version/privacy, time to first useful outcome, and participant explanation of what happened. Distinguish think-aloud discovery sessions from later timed benchmark sessions.
5. On critical operations, ask participants to explain which room/version is affected and what will become published before committing. An apparently fast click is not success if the person misunderstands the consequence.
6. Test on real Safari/iPhone and Chrome/Android, desktop browsers, keyboard-only use, and participant-owned assistive-technology setup when feasible. Check virtual keyboard, rotation, safe areas, browser Back, long localized text, reduced motion, forced colors, and weak network.
7. Report the issue, observed evidence, severity, affected task, recommended correction, and retest outcome. A failed authority/version/publication understanding is critical; a wrong-room or lost-work bug is critical; inability to perform a core task is high; cosmetic inconsistency is lower. Resolve critical/high barriers before visual polish sign-off.

**Failure-case matrix for prototypes and later implementation**

| Case | Outcome that must remain clear |
|---|---|
| Existing files / existing Git history | No unintended replacement or loss; distinct connect/import decision |
| Missing service / insufficient permissions | Explain prerequisite and give one useful next action |
| Duplicate room name / expired invite | Preserve input; offer correction/reissue route without exposing tokens |
| Partial initialization / interrupted process | Resume the same operation without creating hidden duplicate rooms |
| No matches vs empty room | Clear filters vs create first item |
| Revoked role / unavailable capability | No successful-looking action; truthful explanation and safe context |
| Rule changed since screen loaded | Identify changed rule context; do not promise current eligibility from stale projection |
| Proposed version superseded | Explicit stale-version notice; prevent accidental approval of a different version |
| Path invalid | Human-readable explanation and useful correction; unchanged retry is not a remedy |
| Required review missing | Name affected area and required eligible review without equating count with publication |
| Network fails before/after submission | Preserve draft; determine confirmed outcome before recommending duplicate submission |
| Publication pending, refused, or confirmed | Distinct states; no optimistic permanent success before confirmation |
| Preview unavailable / stale published page | Identify what page/version can actually be viewed |
| Very long file/path/comment | No unusable horizontal page overflow; core actions stay reachable |
| Mobile keyboard / sticky bar / zoom | Current input and focus stay visible; no hidden confirmation or final comment |

Before release, exercise complete processes: create/join → issue → propose → review → publish → verify visible result, plus failure/recovery and version changes. A component can pass its own accessibility test while the surrounding process still fails.

### Gaps

- Current timings, novice success rates, bundle sizes, field metrics, screen-reader behavior, and mobile completion rates have not been measured. Proposed budgets require a baseline and explicit device/network/dataset reporting.
- No user recruitment or external outreach is authorized by this research task. The protocol is a concrete plan for later execution, not a completed study.
- The backend's confirmed/pending/failed operation guarantees must be established by the architecture review before implementing retries, optimistic updates, or summaries of latest authority.
