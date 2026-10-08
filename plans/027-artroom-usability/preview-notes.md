# Proposed screen preview

The interactive preview is a design proposal with local sample data. It does not describe shipped behavior, contact a service, create a real room, send a notification, or publish content. Room and issue fixtures can change during the preview. Status counts describe only those sample fixtures.

## Publication provenance

This is the retained sample delivered under report `aa6a99c51267c1b4ec5fb54650fb5c9a6455b937`, with no recorded sample Git HEAD or exact deployed product HEAD. The assets/QA retain their delivered bytes, pinned by `sample-assets.sha256`; the 38-check result below is producer evidence from that sample, not a new run or current I5 product acceptance. The driver retains local cache/worktree paths. The generated wrapper runs sample scripts in its sandbox; it does not implement the proposed production no-script, authorized exact-version boundary. [BASELINE.md](BASELINE.md) reconciles the historical findings with accepted I5.

## Historical baseline inspected

Inspected the actual rehearsal images at `/Users/hughpyle/tmp/artroom-rehearsal-1/room.png`, `change-refused.png`, `change-published.png`, and `rules.png`, and read its transcript. The rehearsal source is `planner/i5-demo-host@315785966`, not the current `main` UI. The UI researcher verified the model semantics against that source.

The observed room mixes issues and changes on one page, exposes session/key and directory facts, and offers operation schema accordions. The refused change gives a confirmed judge effect higher prominence than the actual publication refusal. The published-page link points at `HEAD`; it cannot serve as an exact proposal preview or prove that a displayed proposal was published. These are historical315 findings: I5 now guards invalid proposal paths, labels latest-site navigation and explicitly leaves immutable version rendering unavailable. Outcome hierarchy and complete contextual flows remain proposed. The alternative screens and controls below are proposed behavior requiring implementation.

## Screens and decisions

| Screen | Design decision | Product work required |
| --- | --- | --- |
| Room / Issues | One familiar list, a primary Create issue action, search, and Open / Closed / All filters. An empty room asks for one thing to do. Issue number, author, and assignee provide context without a separate metadata dashboard. | Extend room read models for issue metadata and filters; connect native forms to authorized writes. |
| Changes | Separate proposal lifecycle from publication readiness. The list can show Open alongside Publication refused, or Merged alongside Published. A refusal never turns an open proposal into a rejected/closed proposal. | Join proposal, review, and publication evidence without conflating their states. |
| Change detail | Show publication/readiness status before discussion or technical facts. Discussion, Files, and Checks are familiar task destinations. Request review and Review change are explicit actions. | Capability-aware actions, version-bound reviews, discussion writes, file diff, destination preflight and publication outcome. |
| Publication refused | Explain the invalid path, state that the proposal remains open, and offer Fix path. Avoid suggesting an identical retry will repair the path. | Validate paths before proposal writes; preserve entered text on failure and link to a correction workflow. |
| Publication pending | Say that the request is recorded and confirmation is unavailable. Check publication preserves uncertainty and does not submit a duplicate request. | Durable operation status, safe recovery, polling/backoff, idempotency, and evidence reconciliation. |
| Publication confirmed | Offer View this published version separately from View latest site. Show the linked issue completion only after confirmed publication. | Immutable published-version routes and receipt-backed status; ensure latest-site routes retain distinct semantics. |
| Create room | Start with name and readable address. Generate the address from the name. Explain a small standard setup; defer import and advanced configuration. | Identity/workspace context, reserved-name/path validation, default rule/definition activation, resumable provisioning, and CLI parity. The preview's workspace-relative address is a proposed product concept, not an existing service guarantee. |
| Configure rules | Describe file groups and who can approve them. Keep patterns and other low-level rule details under Advanced rules. Review rule changes before applying them. | Validated rule editor, controller eligibility, self-review constraints, conflict detection, before/after summary, and a rules publication write. |

Navigation alternatives are intentionally different: **Room tabs** favors a focused room; **Workspace sidebar** reserves a stable navigation column for people managing multiple rooms. At narrow widths the sidebar moves to the top. Room tabs are the recommended first implementation. The preview supports a host-provided density adjustment; it does not add a second design-controls panel.

## Visual and interaction guidelines demonstrated

- 16px body and editable text; 14px secondary text. Clear headings, generous form spacing, quiet list rows, and a restrained single brand accent.
- Product-scoped light/dark colors, opaque product surfaces, neutral separators, and darker essential input boundaries (`#6B7785` in light appearance).
- Destination labels remain familiar nouns: Issues, Changes, Pages, Settings. Buttons use action verbs: Create issue, Edit page, Review change, Configure rules, Apply rules, Fix path.
- On mobile, metadata and labels flow below a full-width title. Long readable titles must wrap at words, not degrade into single-syllable columns. File names may wrap when necessary.
- Detail and form screens omit the repeated room header. The room breadcrumb supplies context and lets publication status appear earlier on small screens.
- Native buttons, inputs, labels, selects, textareas, and validation; visible keyboard focus; filter/detail-tab focus retained after updates; live status announcements.
- Narrow-screen controls are at least 44px high. All primary actions work locally or show an explicit design-sample notice. No real mutation or outgoing message occurs.
- Exact proposal preview, exact published version, and latest published site are separate destinations. The proposed preview is an isolated, no-script rendering requirement; the mock demonstrates the label and navigation distinction, not a production security boundary.

## Verification performed

Used the visualize skill's sandboxed-fragment renderer and the already cached **Playwright 1.63.0** with its existing Chromium. Installed no package and changed no application source, package manifest, or lockfile.

The final QA run passed **38 screen/device/theme checks**, with zero browser script errors, duplicate element IDs, or measured product-boundary overflow. Covered desktop, 390px and 320px product widths, plus a 320px host containing an actual 288px product. Covered the primary lists, room creation, rule configuration, empty room, needs review, invalid path, pending publication, and confirmed publication. A dark 390px list was also checked.

Exercised search, no-match state, Clear filters, local issue creation, room-name/address generation, local room creation and empty state, Files, exact proposal preview navigation, approval, simulated publication, Fix path, review/apply rules, and sidebar navigation. Local form buttons and Enter handling were corrected after discovering that the sandbox disallows native form submission. Native field validation remains active.

Visually inspected desktop, 320px invalid-path detail, dark 390px list, and 320px-host captures. Independent root-agent inspection found that a trailing Documentation label squeezed a narrow issue title into word fragments. The final layout moves badges below metadata; “Explain who can approve protected files” now wraps into two readable lines at an actual 288px product width. Refreshed captures reflect that correction.

QA captures:

- `preview-desktop.png`
- `preview-mobile-320.png`
- `preview-mobile-390-dark.png`
- `preview-host-320.png`

`preview-qa-results.json` records the checks. `preview-qa.mjs` is the local verification driver. `preview-qa.html` is only the generated standalone inspection wrapper; the editable source is `artroom-design-preview.html`.

## Limits and release requirements

This is a style and flow preview, not an application prototype with a complete policy engine. Some navigation opens representative sample content; editing a sample page routes to a representative change specimen. The rule editor demonstrates review-before-apply rather than persisting an authoritative rule revision. The preview does not implement identity, permissions, hosting, invitations, conflict resolution, real publication evidence, or real proposal rendering.

The preview has not been tested with an actual mobile device, VoiceOver/TalkBack, switch input, browser zoom to 200%/400%, localization, forced colors, long unbroken room names, or the native Page embed host. Keyboard focus styling and selected-control retention are implemented but have not received a complete keyboard-only traversal. A coarse pointer at desktop width needs a separate 44px-target pass. The model-aware widget-state persistence and optional host density controls are guarded; the fragment remains usable without them.

Before release, perform manual keyboard/screen-reader and physical-device verification; check contrast for all states; test loading/error/permission-denied/expired-session states; retain form values across every refusal; cover uncertain/conflicting publication evidence; enforce safe isolation for proposal rendering; and verify that each capability gate matches the actual eligible controller and proposal version. Mock screenshots do not substitute for those checks.
