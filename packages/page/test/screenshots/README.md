# Screenshots of the page

Written by `node packages/page/test/screens.mjs`, which says how they are made: the page as the scope Worker serves it at
`/page/`, in Chromium, answered with the test Worker's recorded answers in the demo story, after README.md is published and
while AGENTS.md waits for the controller.
These files describe this recorder invocation only; they do not establish a live deployment or immutable version preview.
Source at invocation: `4a905af8e6ef71811e7892dc39f3132774597ee3`; tree `bbeea6ad62aa95d58465a52499e9717bb5dfed26`. Uncommitted shared source, if present, is not described as that committed tree.
Environment: Playwright 1.63.0, Chromium 153.0.8010.12; desktop 1024px, phones 390px and 320px, dark Rules. Browser plugin not available.
The flow under test is: recorded room → issue/list navigation → native refused own-review → confirmed change → latest Pages navigation.

| File | Shows | Bytes |
|---|---|---:|
| `issues-desktop.png` | The actual room’s Issues list at 1024 CSS pixels, from recorded native room answers. | 30894 |
| `issue.png` | Signed in as @una (who joined on the page with an invitation link): the issue she opened through the page, paul's comment, and the acts she may sign on it. | 43176 |
| `change-refused.png` | Signed in as @paul: the change that AGENTS.md is, waiting for the rules extent's approval (policy not met), its one-file version, the merge the destination refused (rules-not-met:rules), and paul's own review refused by the lane, author-cannot-review. | 61551 |
| `change-refused-record.png` | The same refusal with Inspect change record expanded, retaining native policy refusal and outside operation history separately from the main condition. | 203051 |
| `change-published.png` | Signed in as @paul: the change that rita's artroom edit README.md made, merged and published, its one-file version and recorded publication commit; retained source preview is bound to its selected version; Pages remains separate latest-site navigation. | 36325 |
| `change-source-preview.png` | The selected README.md version’s authenticated retained source text, opened locally without an additional network read; this is not a rendered GitHub-Flavored Markdown or HEAD preview. | 52190 |
| `rules.png` | Signed in as @paul: the rules of this room, who may change them, and that paul may sign no act that changes them. | 47573 |
| `site-readme.png` | README.md as the site route renders the latest published branch, reached by the separate Pages navigation; this is not an immutable version preview. | 32253 |
| `issues-mobile.png` | The room’s Issues list at 390 CSS pixels, from the same recorded native room answers. | 26686 |
| `issue-mobile.png` | The recorded issue opened from its list at 390 CSS pixels. | 37437 |
| `issues-narrow.png` | The same Issues list at 320 CSS pixels, checked for horizontal overflow. | 24608 |
| `issue-narrow.png` | The recorded issue opened from its list at 320 CSS pixels. | 35446 |
| `rules-mobile-dark.png` | The same recorded room rules at 390 CSS pixels with a dark color scheme. | 40953 |

## Design-rule witness map

This map names the evidence available from this recorder. It does not extend the test Worker's stand-ins into live-provider acceptance.

| Rule | Recorder evidence and limit |
|---|---|
| 1. One default home | issues-desktop/mobile and change-published: visible room switch and selected navigation; inspect record carries deeper native facts. `view.test.ts` “ordinary screens omit empty record panels” and “issue and rules keep their subject once” cover DOM duplication; visual inspection is still required. |
| 2. Controls explain actions | issue and change-refused: real action controls; the own-review submission exercises Review change. `actions.test.ts` “review submits the exact observed version and typed controls once” covers the submitted subject and inspection fallback. |
| 3. Consistent outcome language | change-published comes from the recorded lane/destination publication, not an internal operation success. change-refused retains the native guard refusal. `view.test.ts` “one current condition follows the selected version” rejects internal-operation and older-version success. |
| 4. Requirements at decisions | change-refused exercises the actual author-cannot-review answer. `actions.test.ts` “unknown submission offers only a read refresh” blocks mutations in an unknown result; this recorder does not invent a native unknown outcome. |
| 5. Content over notices | issue records Paul’s real comment and the actual room’s issue; visual inspection checks presentation. `view.test.ts` “ordinary screens omit empty record panels” covers empty metadata. Native creation and rule-save interactions are outside this recorder. |
| 6. Real affordances | Pages is separate latest navigation. No exact-version Open page is shown because immutable selected-version rendering is unsupported in this source. `actions.test.ts` “a single eligible choice is fixed” covers removal of a false picker. |
| 7. Preserve subject | Review form is checked against the recorded manifest and rules extent before sending. Published/source-preview screenshots identify and check the selected recorded version and retained content, opening without new network reads; latest Pages makes no immutable claim. `shell.test.ts` “a late read from the previous room cannot replace the active room” and the comment-draft navigation interaction cover scope preservation. |
| 8. Designed narrow layouts | issues/issue at 390px and 320px, dark Rules at 390px; checks.json records overflow and editable-text checks. Touch target and keyboard checks remain separate. |

## Creation and recovery follow-up

[Create room evidence](claim/README.md) was recorded separately at source `346aec0a`, after the screenshots above. It checks native founder eligibility and the member's own forbidden read, the name-only phone dialog, Escape/focus/draft, pending double click, actual Chromium Web Locks across two tabs and exact saved-envelope retry. Its founding transport is an explicit loss stand-in that admits nothing to a Scope. This supplements design rules 2, 4, 6, 7 and 8; it does not turn the earlier pictures into evidence of the later source.

The native claim adapter's separate Scope test covers admitted lost replies and recovery. Name-only browser presentation and native completion are distinct witnesses. Controller rule confirmation, Cancel with no POST and native value reread are recorded in [the six demo captures](../../../../../notes/2026-10-09-demo-captures/README.md).
