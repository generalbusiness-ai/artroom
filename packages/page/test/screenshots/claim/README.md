# Create room browser evidence

The production Page ran in cached Playwright 1.63.0 and Chromium 153.0.8010.12 at `https://scopes.test/page/`, with a 390 × 844 CSS pixel viewport. Browser plugin not available. The native recorder supplies separate, actor-bound responses for the founder and member. Register reads are checked against the caller's signed request; no actor's read answer is reused for another actor.

Recorded from 2026-10-09 03:35:21 to 03:35:39 UTC at source `e46bd87b341bd720498bba1db5fa871e7ea483f2`, tree `5c434baf7dd6fe569b890e909335c12f59f4a108`; command exit 0. Built Page assets blob: `75c22eaba7f58a43b987a1ae9a75de843530dd96`.

```
PLAYWRIGHT_CORE=<cached Playwright 1.63.0 directory> \
CHROMIUM='<cached Chromium 1243 executable>' \
node --import tsx --no-warnings scripts/demo-captures.ts \
  --recorded --claim-witness --out /tmp/artroom-page-v2-claim-journal-browser
```

The native founder eligibility read exposes Create room. The member's own native register read returns forbidden, so its control is absent; this does not claim inspection of the register's policy as that member. The dialog has one name input, 16px editable text, a 46px input and 44px buttons. Escape returns focus and preserves the draft.

A labelled transport-loss stand-in intercepts the exact signed `found` requests before any Scope admission. The first request is held while a double click and a second tab attempt creation. The actual Chromium Web Lock serializes the tabs. The second tab's stale New predecessor reports a journal conflict without sending a POST, restores the original label and requires an explicit Resume. Reopening the first dialog also discovers that original unknown operation instead of presenting a new creation. Three intercepted attempts retain the same operation ID, canonical signed envelope and original local label in the v2 journal.

A separate browser context holds an original request and queues a second tab. Changing the shared settings' register reference before releasing the lock blocks the queued mutation. Only the already held request was intercepted; no additional POST leaves after the change, and the original private journal's complete bytes remain unchanged. The public checks retain only its digest, never the private record.

Five network diagnostics are precisely explained in `claim-checks.json`: the member's native 403 read refusal, three intercepted request failures in the retry flow and one in the changed-settings flow. There are no other browser errors or unrecorded requests.

| File | Shows | Bytes |
|---|---|---:|
| `create-room-mobile.png` | Name-only dialog with the local draft and native eligibility-controlled action. | 34501 |
| `create-room-pending-mobile.png` | Unknown submission, immutable original name and explicit Resume creation. | 43870 |

This browser run admits no founding request, creates no native repository and claims no hosted-provider completion. Native admitted lost replies, exact archived-operation recovery and creation of a second distinct room are covered separately by the Scope adapter witnesses, with their labelled host, scheduler, storage and loss stand-ins. Browser presentation and native completion remain distinct evidence.

These files replace the earlier source `346aec0a` claim captures. That run remains in Git history and `/tmp/artroom-page-v2-claim-browser`; its earlier assertions do not receive credit for this later source. The two views look similar, but this invocation checks the operation journal, stale New refusal, explicit Resume and changed-settings guard.

Raw command log: `/tmp/artroom-page-v2-claim-journal-browser-first.log`, SHA-256 `98f3c7d6aa21871554954a70c6c7e777f578bf8434167168f28bb79e9f14a92b`. Its generic success line matches the earlier run's log bytes; the exact source, operation and new checks are retained separately in `claim-checks.json` (SHA-256 `6dd4d9305d962f6d752e814fae5ee01d57ea59da5e44abc7bc271d3ab8bf1f0c`). No keys or signed envelopes are exported.
