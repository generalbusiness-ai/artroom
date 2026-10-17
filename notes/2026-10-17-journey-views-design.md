# Journey views in the AI app

Design packet, 17 October 2026. Request `a9a3585c`, clarified by `9b70e9b6`.
Source `b410d2f0`, promise `355b9a8b`, starts from Main `2637e6bb`.
The packet contains static HTML mockups, concepts and browser PNGs.
Exact-head checker approval and planner read remain due. These examples
implement no production view or live act.

The person starts work, leaves, and returns to the same shared record.
They can understand a decision, inspect an exact change, and confirm its
publication without carrying context between agent sessions. The design
uses the [MVP plan](2026-10-16-repo-in-ai-mvp-plan.md) and
[journey plan](plans/032-2026-10-17-journey-as-acceptance-target.md).

There are five view families: **Needs you**, **Work**, **Decision**,
**Change**, and **File and diff**. The last family has separate File,
Diff, and Interdiff states. The original request's six-view count was
corrected by `9b70e9b6`; all six requested flows remain in scope.

## One record, several steps

The examples use a fictional **Task list** room. Ari is a person.
Interface agent and Storage agent are separate agent members, each
controlled by Ari. Repository checker is a checker member, not an agent
disguised as a person. No example is a read of a real room or repository.

The main task is **Clear completed**. Its issue history has these steps:

1. Entry 220 sets conditions v1: add Clear completed, hide completed tasks
   from the active list, and leave unfinished tasks unchanged.
2. Separate offers and acceptances bind each agent to those conditions.
   The two offers are entries 221 and 222. The interface acceptance is
   entry 223, followed by the storage acceptance at entry 224.
3. Storage agent asks whether clearing should keep history, then blocks
   its work. Interface work can continue independently.
4. Entry 245 sets question text v2. It proposes keeping history and
   compares that choice with permanent deletion. This is a proposal.
5. Ari approves that exact text at entry 246 and records the decision at
   entry 247. Neither act changes the work's conditions.
6. Ari separately revises the conditions at entry 250. Conditions v2 now
   require history to remain recoverable. Old commitments still say v1.
7. New offers name v2. Each agent accepts those exact terms. Storage agent
   releases the old block with the decision as evidence. Old commitments
   are cancelled rather than relabelled.
8. Change 12 reaches version 2, is reviewed against its integration, and
   publishes only after its own checks and requested review allow it.

Entry numbers in that list belong to the issue scope. A change's entry
numbers and a membership's entry numbers belong to their own scopes.
The interface never presents one global room entry counter.

The initial Needs you example also contains two independent work items:
Change 18, **Improve empty-list message**, awaits a review; Change 9,
**Keyboard focus fix**, has an unknown publication outcome. Those items
show how the queue combines reasons without putting one change into
contradictory states. Their links retain their own subject identities.

The catch-up example reads three scopes. Its saved review points advance
by five, one, and one entries respectively, for seven updates. Opening
the queue or a detail changes none of those review points. **Mark
reviewed** records the inspected scope cutoffs but leaves the three open
work items open.

### Exact example commits

These synthetic identifiers name design fixtures, not local Git objects.
Every displayed short hash has a full value under **Full commits**.

| Subject | Full identifier |
| --- | --- |
| Base | `8475e1beda99cd9b32d3617f1fb255664090fbe0` |
| Version 1 source | `94e6b0427e0779b4cd686d3c46ec196cf105aacc` |
| Version 2 source | `569c9aeed9e74b4d803f874cfbfbd90a9218c24d` |
| Version 1 integration | `62a6aced9f5b9e2473d33960fb336721de14582f` |
| Version 2 integration | `6ef56437b0cf81a1d95c2a00b7c539d1856e0fdf` |
| Change 9 integration | `1faf54e188a46dd8edeb5ead4adb7f9fbee10fb4` |
| Change 18 version 2 integration | `d664779063515feb27b0532f708970d1c4f68008` |
| Change 18 version 2 source | `edc3a252bcf84cdd0fb28ea459bf6419106ea223` |

File shows a file at one exact commit. Diff compares the base with the
selected integration. Interdiff compares the two integrations on their
unchanged base. A future comparison with different bases must name all
four patch endpoints and its comparison method. It cannot silently use
the current branch as an endpoint.

## The visual system

The interface is a work surface inside a conversation. It has a small
header, a short navigation row, and one clear main task. Open rows and
thin rules carry the structure. It has no dashboard sidebar, marketing
hero, decorative statistics, or grid of status cards.

The existing [brand guidelines](../brand/GUIDELINES.md),
[tokens](../brand/tokens.css), and [fonts](../brand/fonts.css) are the
source for colours, wordmark, type, and button geometry. The wordmark is
the existing SVG, not text or a replacement generated logo.

| Element | Design |
| --- | --- |
| Light surfaces | Bone `#F3F1EA`; white controls where needed |
| Light text and actions | Ink `#16180F`; forest green `#123F2B` |
| Dark surfaces and text | Background `#121410`; text `#ECEAE2` |
| Dark links and secondary text | Green `#5FA880`; muted `#A3A295` |
| Refusals and removed lines | Brand garnet; text and symbols also explain them |
| Body and headings | Open Runde; deliberate control typography |
| Labels and receipts | Teletype33, at least 13 CSS pixels |
| Code and identifiers | Sometype Mono; selectable text |
| Surfaces | Square corners, thin rules, no shadows or gradients |
| Primary actions | Forest green, with the brand's cut bottom-right corner |
| Spacing | An 8-pixel rhythm; larger gaps separate decisions and evidence |

Desktop uses a wide reading area. Change can place evidence beside review
actions. Narrow layouts use one column: labels precede values, work rows
stack, and alternatives follow one another. Code wraps within its own
reader. Long identifiers can wrap; the whole page does not scroll sideways.

Touch targets are at least 44 by 44 CSS pixels, following the chosen
[WCAG enhanced target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).
This target is a design choice, not a claim of complete WCAG conformance.
Focus remains visible, actions have text labels, and meaning does not
depend on colour, hover, shape, or animation alone.

### Concept references and corrections

The built-in Image Gen tool produced the visual concepts before HTML.
The selected references are in [the concepts directory](2026-10-17-journey-views-design/concepts/).
They cover the five desktop families, dark narrow Needs you, narrow
Interdiff, and narrow unknown publication. The prompt set is retained
with the design assets. The final mockups remain HTML and CSS.

Generated references are visual specifications with these explicit text
corrections. They are not evidence that the example operations occurred:

- The first Work offer is entry **221**, despite the generated image retaining
  **220** after a targeted correction. The second offer is entry 222 and
  the interface acceptance is entry 223. An offer never counts as acceptance.
- File, Diff, and Interdiff remain three visible reader choices. The narrow
  Interdiff image omitted Diff; the HTML must restore that required choice.
- Wrapped code continues the same logical line. A continuation gets no
  new line number, even when the generated image numbers a wrapped fragment.
- Change 9 uses its own integration `1faf54e`. Its generated recovery
  reference borrowed Change 12's hash; the HTML must use the correct fixture.
- Normal spaces remain in labels such as **entry 245** and **Version 2**.
- The existing exact brand tokens and SVG control colour and geometry.
  Bitmap texture, slight shading, and generated logo variations are not
  production assets.

The browser comparison below records copy, layout, type, colours, actor
markers, container rules and narrow overflow. It compares the selected
concepts with the HTML, including the five native desktop dimensions.

## People, agents, and checkers

A person has a circular marker and an explicit **person** label. An agent
has a square marker, an **agent** label, and **Controlled by Ari** beside
each act and work row. A checker has an outlined square and a **checker**
label. The marker supplements the words; it never replaces them.

Identity comes from the service's membership data. A model-supplied name,
host display name, or editable field cannot make a member a person.
An agent's controller is fixed in the current membership definition
(`packages/platform/src/membership.ts:248,414–445`). Historical acts
retain that binding; an unavailable binding is labelled unavailable.
The view does not guess a controller or silently substitute the viewer.

Only the requested person receives a question's approval control.
Checkers and agents do not receive person approval or merge controls.
The native grant and exact subject checks remain authoritative when an
old view, model, or forged request bypasses the presentation.

The person label reports membership kind. It is not proof of physical
human presence or a passkey assertion. That later work is separate.
Controller review counts only when repository rules permit it. The
Change example says that Ari controls the proposer and those rules allow
controller review. A different rule disables that route and explains why.

## What each view reads and offers

The tool names below describe the planned MVP reads. They are not a claim
that those view tools are on the current server. Existing act bindings
come from the actual catalogue, not guessed display names
(`packages/mcp/src/catalogue.ts`). A future view receives the binding,
native subject, and displayed revisions from its read result.

| View | Reads | Offers when authorised |
| --- | --- | --- |
| Needs you | Current open requests to the member; review and merge obligations; unresolved publication; per-scope review points, head ranges, and coverage | Open the exact item; load the remaining range; explicitly mark inspected scope ranges reviewed |
| Work | Current issue conditions, each commitment's immutable terms, agent/controller identities, blocks, linked decisions, and change versions | `offer` to one member under current terms; view the decision or change; explicit new offers after a revision; authorised cancellation of old commitments |
| Decision | Exact question body and `bodyAt`, requested approvers, current-text verdicts, comments, conditions, and pinned brief | Comment; request changes or `approve` the displayed body; `decide` after the requested verdicts permit it; separately open the conditions revision |
| Change | Displayed version, source/base/integration, linked conditions and decisions, exact-version checks, requested reviews, and publication result | Read exact diff or interdiff; comment or review the displayed version; merge only the authorised current version; settle the original request when its outcome is unknown |
| File and diff | Exact file or comparison endpoints, file paths, content, line positions, completeness, and omissions | Switch between pinned File/Diff/Interdiff reads; expand full identifiers; return to that same change version |

An approved question remains a question until its decision is recorded.
A decided question does not revise work conditions. A newer condition
does not rewrite an accepted commitment. A passed checker result does
not approve a product choice or stand in for a requested person's verdict.

File and diff views offer no approval or merge control. The return path
names the same change version. If a newer version exists, Change shows
that fact and requires a fresh review rather than retargeting an old act.

## Six flows

### Hand work to agents

Work shows the task and current conditions before an offer. Each offer
names one agent and one exact terms reference. A two-agent handoff is
two offers, not a claim of atomic bulk assignment. An offer waits for the
offeree's acceptance; the owner cannot accept on the agent's behalf.
The waiting and accepted states remain distinct. A partial handoff shows
which offer succeeded and which one is still missing.

### Return and catch up

Needs you combines current obligations with updates since explicit review
points. It explains what needs the person, why it is theirs, and what
settles it. The three independent examples illustrate a question, a
requested change review, and an unknown publication.

Reading keeps the work open. Marking a read range reviewed also keeps the
work open. Only the relevant decision, verdict, or resolved operation
changes the obligation. After **Mark reviewed**, the update count can be
zero while the same three requests remain visible.

Review points are vectors of full scope identity, incarnation, through
entry, and hash. They are not one room counter or a browser-only flag.
The future service stores them for the authenticated person where the
person's other device can recover them. Current `DAP_HOME` storage alone
does not establish that cross-device behavior.

J5's adopted stream amendment `b692f9d1` supplies per-scope entry offsets.
The UI preserves a stable read cutoff while paging. If a read is bounded,
the view names its omissions and offers **Load more**. It cannot mark
unread scopes or a missing range reviewed. Any omitted scope keeps its
previous point. A missing or unavailable point is shown honestly; it is
not treated as an empty history. Actual no-gap/no-duplicate resumption
and shared persistence remain J5 and J1 implementation witnesses.

### Review and request changes

Change shows the exact version and integration. **Read diff** pins base
and integration; **Compare with version 1** pins the two versions.
The reviewer reads the agreed conditions beside checks and comments.
Requesting changes binds to the displayed version. A later revision
retains that older verdict as history rather than counting it for v2.
The empty-check state says **No checks ran**, not **Passed**.

### Approve as the requested person

Decision shows the immutable proposal, its alternatives and consequences,
and why the current person may approve. Approval binds to `bodyAt` for
text v2. It is separate from the recorded decision and from the owner's
later conditions revision. An unrequested person, an agent, or an old
text version gets an explanation instead of a usable approval control.
The refusal example preserves the original text and comment.

### Confirm publication

Change first shows review and check eligibility, then a pending or unknown
operation, and finally a confirmed publication. The confirmed state names
the target ref and the exact published commit from the result. An intent
receipt, an unchanged local tree, or a disconnected view is insufficient.

The unknown state offers only **Check original request**. It keeps the
same saved envelope and never offers a second merge or signs a replacement.
A second device can do that only when J1 has made that original request
available to the authorised person. If custody cannot be reached, the
recovery-unavailable state explains that and retains the unresolved act.
The mockup's links navigate examples; they exercise no real custody.

### Explain a refusal or an agent stall

A refusal says what was refused, why, and which exact subject was used.
It does not call the work complete or discard the person's draft. Stale
approval shows the old version and a link to read the new one.

A blocked agent shows the named decision and the controller. A stalled
agent shows the last known record and its read point. It does not invent
a live heartbeat or a diagnosis. The next action is to inspect or ask the
responsible person, not to silently assign the same work to another member.
Reassignment remains an explicit authorised act with its own custody.

## Loading, absence, bounds, and failures

| State | Visible behavior |
| --- | --- |
| Loading | Name the scope being read; show no invented data or enabled write action |
| Empty | Say there is no matching work at the inspected heads; retain the read point |
| Unavailable | Keep the last labelled snapshot where one exists; explain the failed read and offer a read retry |
| Partial catch-up | Show entries/scopes omitted and the continuation; do not claim caught up |
| Stale | Label the exact old subject and offer a fresh read; do not retarget an act |
| Refused | Preserve the draft, native reason, and exact subject; distinguish refusal from transport loss |
| Unknown | Keep the original unresolved request and offer only its outcome check |
| Truncated reader | Name the endpoints and the omission; missing lines are not unchanged lines |
| No checks | Say no checks ran; do not use a success marker |
| Check failed | Name the checked integration and failed result; prevent a misleading merge affordance |

These states apply to the shared kit. Work, Decision, Change, and reader
examples also show their specific blocked, stale, refusal, recovery, and
truncation variants. The [render index](2026-10-17-journey-views-design/renders/render-index.json)
enumerates the pages, themes, viewports and checked states.

## The iframe boundary

The [stable MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
defines HTML `ui://` resources in a sandboxed iframe and JSON-RPC
communication through the host. Host context supplies theme, style
variables, container dimensions, and safe-area information. The future
view handles their updates and uses its own fallbacks when absent.
It needs no host-specific SDK, direct service connection, or key in the
iframe. The static mockups are layout examples, not protocol conformance.

Mockups use the existing local brand assets. Packaging inline resources,
their content digests, CSP, app-only tool visibility, and the standard
bridge belong to S2. A real host's available width and height remain
constraints; the design has no outer-browser navigation or fake host UI.
Narrow pages scroll vertically without a fixed action obscuring content.
External navigation, if later offered, uses the standard host link request.

## What this delivery must prove

Before review, static links must cover all six flows and keep the right
subject, actor, version, and theme. Each requested family and state needs
light and dark renders at desktop and narrow mobile widths. File, Diff,
and Interdiff must each be rendered with their correct endpoint labels.
Keyboard focus, text zoom, overflow, fonts, assets, and recovery controls
must be inspected in a browser. An iframe layout check is separate from
actual MCP host, signing, storage, or provider acceptance.

Only the design note and its assets change. Runtime, tests, declarations,
packages, locks, and deployments remain exact to the Source base.
Document-only gate handling follows [the testing guide](../docs/testing.md).
Capacity choices `4dccae54` were answered by planner report `63195bdd`
and accepted by `cd5d2265`. The full capacity runtime task `113a54bd`,
actual journey implementation and earlier operational or gate-stability
obligations remain open. Exact-head checker approval and planner read
remain required for this design.

## Open and reproduce the examples

Start with the [light catalogue](2026-10-17-journey-views-design/index-light.html)
or [dark catalogue](2026-10-17-journey-views-design/index-dark.html). Each
lists the 44 states across the five families. There are 88 state pages and
two catalogues. Every button-shaped link navigates a fictional snapshot;
none sends an act. Comments are read-only sample text. A later snapshot
can include acts by other members; navigating to it does not impersonate
them or simulate a live event stream.

The files live below `notes/2026-10-17-journey-views-design/`:

| Path | Purpose |
| --- | --- |
| `build.py` | Standard-library-only HTML generator and fixture identities |
| `mockups.css` | Shared brand, responsive layout and focus styles |
| `mockups.json` | State list, synthetic commit identities and HTML hashes |
| `concepts/` | Eight selected Image Gen references and their prompt record |
| `render.mjs` | Browser navigation, layout checks and PNG capture recipe |
| `renders/` | Full-page and viewport PNGs, with a hash index |
| `verification/` | Earlier run reports and the unchanged-source proof |

Run `python3 notes/2026-10-17-journey-views-design/build.py` to regenerate
HTML. Serve the checkout root on a loopback HTTP server so relative brand
and font paths resolve. Run `render.mjs` with `DESIGN_BASE_URL` pointing to
that directory, `PLAYWRIGHT_MODULE` pointing to an existing pinned
Playwright module, and `CHROME_PATH` pointing to an existing Chrome
executable. The recorded run used Playwright 1.63.0. No package was
installed in the checkout. Use a fresh `DESIGN_RENDER_DIR`; the renderer
refuses to overwrite an evidence directory.

The Browser plugin was unavailable. The in-app browser attempt returned
“Browser is not available: iab”, so the checks used the existing pinned
Playwright with isolated headless Chrome and a fresh profile. All page
requests were restricted to the loopback origin. There are no scripts,
forms, external links or live network connections in the mockups. Their
CSP denies connection and form actions. Images and fonts are local assets.

## Browser and visual evidence

The final run passed 197 checks and produced 200 PNGs, with no reported
failures. The render index records input hashes, PNG hashes, browser
version, checks and any failures. It covers every
state and both catalogues at 1536 × 1024 and 390 × 844 CSS pixels. The
additional checks cover five families at 320 pixels; a 640 × 450 viewport
at scale 2, equivalent to 200 percent browser zoom on a 1280 × 900
surface; visible keyboard focus; native Full commits expansion; all three
reader tabs; and a 390 × 600 sandboxed iframe. The iframe scrolls to its
actions without a host SDK. The zoom check is a layout equivalent, not a
claim about a real host's zoom control. No full WCAG conformance is claimed.

Each of the six walkthroughs runs in both themes. They check separate
offers and agent acceptances; reading versus Mark reviewed; exact-version
request changes; requested-person approval followed by a separate decision
and conditions revision; publication with each change's own commit; and
refusal, stall and original-request recovery. The three queue obligations
remain after Mark reviewed. Missing or failed checks disable merge. The
truncated reader really omits rows, and an unavailable reader shows no
invented code. Logical line numbers remain fixed when code wraps.

Earlier run reports are retained. The first full run failed on commit-ID
wrapping, the narrow File target and a font probe that expected an unused
font to have loaded. The fixes wrap full IDs, give each reader tab at
least 44 pixels, and explicitly load the declared fonts for the probe.
The next full run passed. Visual review then added old/new gutter labels,
corrected partial catch-up to say two of three scopes read, and moved the
last-known label into its item identity. Each later run retains its own
report. A passing later run does not rewrite the earlier failures.

### Fidelity ledger

The selected concept and browser render were inspected with `view_image`
in the same visual review. The five desktop comparisons use the concept's
native 1536 × 1024 dimensions. The phone bitmaps are 977 × 1610 for Needs
you and Interdiff, and 950 × 1655 for recovery. They specify no CSS viewport
or device scale, so they do not define a unique native browser size. The
phone comparison uses the actual 390 × 844 target and full-page captures;
it does not claim pixel equality with those differently sized bitmaps.

| Comparison | Concept and render evidence | Result or deliberate correction |
| --- | --- | --- |
| Needs you structure | `concepts/needs-you-desktop.png`; `renders/needs-you-light-1536-viewport.png` | Same header, catch-up band and three open rows with reason, responsibility and settling act. Titles and three action labels are retained. |
| Work density and terms | `concepts/work-desktop.png`; `renders/work-active-light-1536-viewport.png` | Open sections, three conditions and aligned agent rows retained. Excess row/section spacing was reduced. Entries 221 and 223 correct the generated text. |
| Decision hierarchy | `concepts/decision-desktop.png`; `renders/decision-requested-light-1536-viewport.png` | Proposal, alternatives, recommendation, requested person, comment and separate controls retained. The long title fits the desktop row. The read-only comment notice is an explicit prototype correction. |
| Change review | `concepts/change-desktop.png`; `renders/change-review-light-1536-viewport.png` | Pinned commit band and two-column diff/conditions/review layout retained. A flex basis that added sidebar height was removed. Required checks and controller-review rules stay explicit. |
| Reader and gutters | `concepts/file-diff-desktop.png`; `renders/file-diff-light-1536-viewport.png` | Full-width file surface, signed additions/removals and both line gutters retained. The caption now promises all changed lines of this file, rather than all file lines. File itself says lines 12–16. |
| Mobile queue | `concepts/needs-you-mobile-dark.png`; `renders/needs-you-dark-390-viewport.png` | Stacked reasons and full-width actions retained. The compact one-row header follows the other mobile references, keeps the actor visible, and makes Read decision fit the first phone viewport. It wraps naturally at 320 pixels. |
| Mobile recovery | `concepts/change-unknown-mobile-light.png`; `renders/change-unknown-light-390-viewport.png` | Unknown outcome, kept original request and one outcome-check action retained. Full commits is added so Change 9's corrected independent hash is inspectable. |
| Mobile interdiff | `concepts/interdiff-mobile-light.png`; `renders/file-interdiff-light-390-viewport.png` | Both immutable versions and shared base remain visible. The missing Diff tab is restored. Wrapping keeps one logical gutter number; Back to change remains below the code. |
| Type, palette and assets | All eight pairs above; `mockups.css`; existing `brand/` assets | Existing Open Runde, Teletype33 and Sometype Mono replace generated approximations. Exact flat bone/ink/forest tokens replace bitmap texture and gradients. Person circle, agent square, outlined checker and cut-corner controls are retained. The dark wordmark uses the existing transparent white SVG. |

The above-the-fold copy comparison retains the reference's task names,
proposal alternatives, actor kinds, controller labels and action names.
The deliberate changes are the record/hash corrections listed earlier;
normal spaces in record labels; the restored Diff tab; honest excerpt and
truncation captions; plain monospaced code with change signs and
backgrounds rather than generated syntax colours; explicit required-check wording; the read-only comment
notice; and the independent recovery hash with Full commits. The compact
phone header reorders the room name into the top row. A version label sits
beside the title on desktop and below it on phone. No marketing copy or
unrelated product feature was added.

The code-native mockups were faithfully verified against the selected
references and the documented corrections. No material visual mismatch
remains in the inspected comparisons. This is builder verification;
checker approval and the planner's read are separate requirements. Host
theme updates, standard bridge messages, actual service authority, shared
recovery custody and a real publication result remain implementation work.
