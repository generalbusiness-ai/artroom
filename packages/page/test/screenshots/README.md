# Screenshots of the page

Written by `node packages/page/test/screens.mjs`, which says how they are made: the page as the scope Worker serves it at
`/page/`, in Chromium, answered with the test Worker's recorded answers in the demo story, after README.md is published and
while AGENTS.md waits for the controller.
These files describe this recorder invocation only. Browser POST replies are played by route; no browser intent/signature is verified or admitted again. Native form acceptance belongs to separate real-scope witnesses. They establish no live deployment or immutable rendered version acceptance.
Source at invocation: `3d8757a69339c3b0d9d5a1b4fbdca298efdc5919`; tree `ef60c604288e0460745df33f07fee6ba7f8bb41f`. Uncommitted shared source, if present, is not described as that committed tree.
Recorded fixture: destination platform:destination@3; change sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2; legacy one-file manifest on current CLI cohort; no manifest-list proposal.
Environment: Playwright 1.63.0, Chromium 153.0.8010.12; desktop 1024px, phones 390px/320px, dark Rules, Create issue dialog, inline comment/primary review, editor preparation, list back/refresh and 200% CSS layout zoom. Browser plugin not available.
The flow under test is: recorded current CLI cohort with legacy one-file change → Create issue dialog cancellation → list query/detail/back/refresh → inline comment draft → primary nonauthor review presentation → own-review refusal playback → retained editor preparation → latest Pages navigation. No new proposal is confirmed or published by browser playback.

| File | Shows | Bytes |
|---|---|---:|
| `issues-desktop.png` | The actual room’s Issues list at 1024 CSS pixels, from recorded native room answers. | 31431 |
| `create-issue-desktop.png` | Create issue task dialog at desktop width, showing title/body and Escape/focus return without submitting. | 52498 |
| `issue.png` | Signed in as @una (who joined on the page with an invitation link): the issue she opened through the page, paul's comment, and the acts she may sign on it. | 45981 |
| `change-primary-review.png` | Recorded nonauthor admin sees Review change in the main next-action slot, exact selected version; no browser POST submitted. | 51953 |
| `change-refused.png` | Signed in as @paul: the change that AGENTS.md is, waiting for the rules extent's approval (policy not met), its one-file version, the merge the destination refused (rules-not-met:rules), and paul's own review refused by the lane, author-cannot-review. | 56859 |
| `change-refused-record.png` | The same refusal with Inspect change record expanded, retaining native policy refusal and outside operation history separately from the main condition. | 198279 |
| `change-published.png` | Signed in as @paul in the current CLI @3-destination recorder fixture with the legacy one-file change declaration: the recorded README.md change, merged result and selected retained source; Pages remains latest navigation, not an immutable result link. | 38838 |
| `change-source-preview.png` | The selected README.md version’s authenticated retained source text, opened locally without an additional network read; this is not a rendered GitHub-Flavored Markdown or HEAD preview. | 58541 |
| `change-editor-prepared.png` | Retained-text draft preparation from recorded authenticated reads, warnings and named base; no new proposal confirmed or mutation submitted. | 148517 |
| `rules.png` | Signed in as @paul: the rules of this room, who may change them, and that paul may sign no act that changes them. | 47948 |
| `site-readme.png` | README.md as the site route renders the latest published branch, reached by the separate Pages navigation; this is not an immutable version preview. | 31794 |
| `issues-mobile.png` | The room’s Issues list at 390 CSS pixels, from the same recorded native room answers. | 26493 |
| `create-issue-mobile.png` | Create issue task dialog at390px, no mutation submitted. | 28043 |
| `issue-mobile.png` | The recorded issue opened from its list at 390 CSS pixels. | 40165 |
| `issues-narrow.png` | The same Issues list at 320 CSS pixels, checked for horizontal overflow. | 24564 |
| `create-issue-narrow.png` | Create issue task dialog at320px, checked editable text and overflow. | 25929 |
| `issue-narrow.png` | The recorded issue opened from its list at 320 CSS pixels. | 38280 |
| `rules-mobile-dark.png` | The same recorded room rules at 390 CSS pixels with a dark color scheme. | 40736 |
| `issues-layout-zoom-200.png` | Issues at200% CSS magnification; not physical browser zoom or assistive-technology acceptance. | 66155 |

## Design-rule witness map

This map names the evidence available from this recorder. It does not extend the test Worker's stand-ins into live-provider acceptance.

| Rule | Recorder evidence and limit |
|---|---|
| 1. One default home | issues-desktop/mobile and change-published: visible room switch and selected navigation; inspect record carries deeper native facts. `view.test.ts` “ordinary screens omit empty record panels” and “issue and rules keep their subject once” cover DOM duplication; visual inspection is still required. |
| 2. Controls explain actions | Create issue cancellation, inline comment draft and primary nonauthor Review change are exercised; own-review POST replays a recorded native refusal without admitting the browser signature. `actions.test.ts` “review submits the exact observed version and typed controls once” covers the submitted subject and inspection fallback. |
| 3. Consistent outcome language | change-published comes from the recorded lane/destination publication, not an internal operation success. change-refused retains the native guard refusal. `view.test.ts` “one current condition follows the selected version” rejects internal-operation and older-version success. |
| 4. Requirements at decisions | change-refused exercises the actual author-cannot-review answer. `actions.test.ts` “unknown submission offers only a read refresh” blocks mutations in an unknown result; this recorder does not invent a native unknown outcome. |
| 5. Content over notices | issue records Paul’s real comment and the actual room’s issue; visual inspection checks presentation. `view.test.ts` “ordinary screens omit empty record panels” covers empty metadata. Create issue dialog is exercised without submission; native creation admission and rule-save acceptance remain separate. |
| 6. Real affordances | Pages is separate latest navigation. Open latest page remains the accurate Page link; immutable Site proof can exist independently but no selected-version Page link is claimed here. `actions.test.ts` “a single eligible choice is fixed” covers removal of a false picker. |
| 7. Preserve subject | Review form is checked against the recorded manifest and rules extent before sending. Published/source-preview screenshots identify and check the selected recorded version and retained content, opening without new network reads; latest Pages makes no immutable claim. `shell.test.ts` “a late read from the previous room cannot replace the active room” and the comment-draft navigation interaction cover scope preservation. |
| 8. Designed narrow layouts | issues/issue at 390px and 320px, dark Rules at 390px; checks.json records overflow and editable-text checks. Create issue Escape/focus return and 200% CSS layout zoom are recorded; physical zoom, virtual keyboard and assistive technology remain separate. |
