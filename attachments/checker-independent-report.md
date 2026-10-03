# Independent checker UI publication repair preflight

The runtime remains **5590c318b9210bfee08756f747d7893b58bf1ea4**, detached in a fresh private clone. This report follows original request `a5d64b35e87c97560ff354578d9560bd1261aacb`, promise `d5378da5583d3bc16c0c19094c1d4c8716aceb2b`, and the recorded `fcd7391d55cdb61de4381ccbc576e418e825714c` publication finding. It is evidence for the parent reviewer, not a durable verdict or whole-stage approval.

I read the actual fcd finding and planner assertion `0fd98c417bd40221bf31757d788a7098901ec208` as checker. I read the complete two-path `3e6241dff9853f83f3a47e429e564c2b0baceb04..5590` delta, all **473 current LiveRoom source lines**, and all **322 supplied review-fcd test lines**. I also read the entire 4567..5590 delta: only null-safe test assertion helpers change. The runtime source is byte-identical to **4567a490cea451d1f4404b0dd1d49bd3422c24a3**. No result below is labelled as running on another head.

## P2: unavailability still erases the confirmed activation

**`packages/ui/src/room/live/live-room.ts:157`, `:156`, `:167` (age at `:63`; active fast path at `:173`).** The repair rejects an older catalogue only by comparing it with `this.active`. An accepted unavailable answer sets active to null, whose age is -1. That forgets the activation already confirmed. A held older successful answer can then become active; an older completed load can also pass the final snapshot comparison.

I verified the planner's eight-entry frozen manifest against actual files (manifest SHA-256 `5525bba84ee9dc1a4b0f1fe1d20323318e9a18145a65332451369d4a72b4829f`). I read and copied its 68-line unavailable fixture unchanged, SHA-256 **8cf82744551421b1cb72887f273009f84316aa56cd4d75b26fd4bd05c03717d8**. The full root source/test compiler, including all five private fixtures, completed with exit **0 before runtime**. The exact-head UI run independently produces the same two named failures and three actual AssertionError messages:

1. `an older held answer stays behind a confirmed activation after a newer read fails, laterActivation=true`. The held response captures since **1**. A genuine MemoryRoom activation and explicit read confirm since **2**; a genuine act is accepted under that policy. A later current-read transport error makes the catalogue unavailable. Releasing the first response republishes since **1**, and `catalogueAt` for the later accepted record returns **act_1_3f90684a** instead of **act_2_2eeb2724**. Actual messages: **expected 1 to be greater than or equal to 2**, and **expected act_1_3f90684a to be act_2_2eeb2724**.
2. `an older completed load cannot be published after the newest confirmed catalogue becomes unavailable`. A load has confirmed since **3**, then waits on an earlier record's historical read. An explicit read confirms since **5**; a subsequent current-read error sets availability to null. Completing the load republishes since **3**. Actual message: **expected 3 to be greater than or equal to 5**. This second fixture proves stale snapshot publication; it does not assert a second accepted-record mislabelling result.

The no-later-activation held-answer control passes. A successful newer response restoring availability also passes. Each failure uses actual legal catalogues produced by MemoryRoom and ordinary transport errors. Assertions tolerate an honest unavailable snapshot; they fail because an older catalogue is republished. These are assertion failures, not compiler, module-load, timeout, or fixture admission failures.

This continues the original confirmed-activation publication outcome in fcd. Keep the greatest activation already confirmed separately from whether declarations are currently available, and use that knowledge in both catalogue confirmation and final snapshot publication. Preserve honest unavailability and the passing old-answer/newer-answer controls. No added readiness gate or scope is proposed.

## Passing repair evidence and checks

A single full UI run with verbose output and the actual Vitest JSON ran every supplied UI test and all five unchanged private fixtures. Its independently parsed totals are **260 passed / 2 failed / 0 skipped**, **262 cases in 21 files**. The two failures are precisely the unavailable cases above.

| Evidence | Actual result at 5590 |
| --- | --- |
| All supplied UI tests | **234/234 pass**, including new supplied review-fcd **12/12** |
| Original unchanged checker probes | **15/15 pass** |
| Original frozen f606 publication race controls | **6/6 pass**, formerly four pass/two fail |
| Retained-intent controls | **3/3 pass** |
| Planner unavailable/error-order fixture | **2 paired controls pass / 2 named failures**, three AssertionError messages |
| Full root source and tests, all workspaces including private UI fixtures | **exit 0**, before runtime |
| UI production build | **exit 0** |
| Existing browser smoke | **8 pass / 1 fail**, exit 1 |
| Two-path diff whitespace check | **exit 0** |

The original unchanged probes cover legal own-name fields, confirmed and uncertain outcome wording, explicit activation reads and retirement. The retained-intent cases retain body/binding/key and the original result across an accepted lost answer and body-binding activation; pending keyboard submission adds no request; an unrecorded stale retry waits for deliberate confirmation and then uses a new binding/key. All copied bytes match the frozen fixtures. These remain local MemoryRoom/UI evidence, not true authenticated HTTPS/MCP lost-result integration, original signed authority after credential change, or real Room admission proof. The new runtime does not change the form's delivery path.

The browser failure remains the known existing red gate: `packages/ui/e2e/smoke.spec.ts:199` expects **Start a song: Footprints**, while actual browser context displays two **Start a song: c** links. It fails before the form submission checks, which remain unexecuted in that smoke case. The previous exact b7 and f606 controls established the same failure; at 5590 I independently reran all nine browser cases and read the actual failure/context. The naming path and browser assertion have no change in the new repair. No test was weakened or naming contract rewritten.

## Frozen provenance and boundaries

Evidence directory: **`/tmp/artroom-checker-ui-5590-su95jyc2`**. It contains the byte-identical five fixtures under `probes/`, actual gitseq inspections, complete two-path delta and test-helper-only delta, timestamped command runner and command records, full compile/build/unit/browser logs, actual `ui-tests.vitest.json`, parsed named failures, browser error context, immutable source proofs before/after runtime, copied-fixture hashes, runtime identity, and restoration proof.

Source SHA-256: **dc158fce3785ff4db45eb87578ffd927a25ecc003ad0d5b2cf15cce32a607944**, git blob **0affb2aa4661386a6598989be874711ab68df52b**. Supplied 322-line test SHA-256: **cf9fe24160fd3e1202124d4318e1510bb67aaab897e3084768e1dd6ff946b7d8**, git blob **571d91b0d3ae2c2f03c9185afea176f7e0e18376**. Both match the immutable 5590 blobs before and after the actual runs. All eight prior planner manifest entries were verified, and every copied fixture was compared byte-for-byte with its original.

After saving evidence, I removed only the five owned private fixtures from the clone. Final head is 5590; `git status --porcelain` and tracked diff are empty. No canonical source, gitseq state, credential, deployment or provider operation was changed.

No producer counts were substituted for the actual JSON. No whole mutation inventory, duplicate client/API runtime suite, universal Jam gate, authenticated transport result or final stage approval is inferred. All original five conditions and separately adopted MCP scope remain with the composed review.

