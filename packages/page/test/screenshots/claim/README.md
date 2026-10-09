# Create room browser evidence

The production Page ran in cached Playwright 1.63.0 and Chromium 153.0.8010.12 at `https://scopes.test/page/`, with a 390 × 844 CSS pixel viewport. Browser plugin not available. The native recorder supplies separate, actor-bound responses for the founder and member. Every register read is checked against the caller's signed request; no actor's read answer is reused for another actor.

Recorded from 2026-10-09 02:53:21 to 02:53:35 UTC at source `346aec0a8201376f2c7e8adb24219f6df50d388e`, tree `c34f6e00ad12e088df1da27cfc497da5d2beb9bf`; command exit 0. The authorized `7c6992f3` source and observed source share built Page assets blob `bcdc07497439cdb66babf61f80d6322ef86ebc20`. Their difference is the recorder's private-output failure diagnostic guard.

```
PLAYWRIGHT_CORE=/Users/hughpyle/.npm/_npx/e41f203b7505f1fb/node_modules \
CHROMIUM='<cached Chromium 1243 executable>' \
node --import tsx --no-warnings scripts/demo-captures.ts \
  --recorded --claim-witness --out /tmp/artroom-page-v2-claim-browser
```

The native founder eligibility read exposes Create room. The member's own native register read returns forbidden, so its control is absent; this does not claim inspection of the register's policy as that member. The dialog has one name input, 16px editable text, a 46px input and 44px buttons. Escape returns focus and preserves the draft.

A labelled transport-loss stand-in intercepts the founder's exact signed `found` requests before any Scope admission. The first request is held while a double click and a second tab attempt submission. The actual Chromium Web Lock serializes the two tabs. The queued request and Resume creation reuse the original canonical signed envelope and local label. Three intercepted attempts share the recorded digest; private keys and signed envelopes are never exported.

Four network diagnostics are retained and explained in `claim-checks.json`: the member's native 403 read refusal and three intercepted request failures. There are no other browser errors or unrecorded requests.

| File | Shows | Bytes |
|---|---|---:|
| `create-room-mobile.png` | Name-only dialog with the local draft and native eligibility-controlled action. | 34942 |
| `create-room-pending-mobile.png` | Unknown submission, retained name and Resume creation. | 44368 |

This browser run admits no founding request, creates no native repository and claims no hosted-provider completion. The separate `packages/page/test/claim.scope.test.ts` witness exercises native admitted lost founding and enrollment replies, retained exact recovery and settlement, with its labelled host, scheduler, storage and loss stand-ins. Native completion and browser presentation are separate evidence.

Raw command log: `/tmp/artroom-page-v2-claim-browser-first.log`, SHA-256 `98f3c7d6aa21871554954a70c6c7e777f578bf8434167168f28bb79e9f14a92b`.
