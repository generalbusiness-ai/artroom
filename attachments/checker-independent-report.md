# Independent checker UI preflight at 624dbb9f

The two previously recorded lower-activation publication regressions pass at **624dbb9fc961caabc42e6e66e8a8f906e40fe0ba**. All frozen controls, all supplied UI tests, full root compilation, UI build and all nine browser cases pass. One independently found **P3 availability residual** remains for a truthful custom handle that reuses equal readonly Catalogue objects. These are bounded preflight results for the original `a5d64b35` request and `d5378da5` promise; no durable verdict or whole-stage approval is made here.

I read the actual recorded `89a6a33970bd810c69bd2c5e1f263c108fb37342` finding as checker. I read the complete two-path repair, all **479 current LiveRoom lines** and all **212 supplied review-0fd98c41 test lines**. Its exact parent is **3a03d4050b0858b430b8527da39351bf8de03d56**. The intervening 5590..3a03 commit implements the separately adopted c376 thread-naming choice; it is not part of this two-path unavailable-state repair. The runtime below was pinned to immutable 624 throughout.

## Repair evidence for the recorded P2

The adapter now stores `confirmed` independently of `active`. A failed read can make declarations honestly unavailable without lowering the confirmed activation. An older successful response is checked against that retained `since`. Final snapshot publication uses the current availability/catalogue rather than the earlier load's catalogue.

All five frozen fixtures from the 5590 bundle were copied byte-for-byte after independently verifying all **34** previous manifest entries. They include the original six f606 race cases, original fifteen checker cases, three retained-intent cases and the planner's four unavailable/error-order cases. All **28** now pass. In particular, the two previously failing planner cases preserve the confirmed activation across unavailable reads: an old held current answer no longer republishes since1 after confirmation2, and an earlier completed load no longer republishes since3 after confirmation5.

The no-intervening-activation and honest-null controls still pass, as do newer restoration, explicit/read/load ordering, ended-version reads, retirement, and captured lost-result intent/key controls. The new supplied six-case test also passes. This supports the original P2 repair in these local adapter cases; it does not establish real Room admission, authenticated signed replay, credential revocation behavior or HTTPS/MCP lost-result integration.

## P3 residual: a repeated readonly result is not a new observation to the guard

**`packages/ui/src/room/live/live-room.ts:155`–`:157`.** For an error, `confirm` decides whether another successful response superseded it by comparing the current Catalogue object with the one held when the request began. A truthful successful read can return the same readonly object. The earlier error then sees the same reference and clears a catalogue that the later successful read just confirmed.

This is an independently found residual at624. Its introducing commit is not established: I did not run this new fixture against5590, and the older age-based guard also did not distinguish successes for one policy version.

The new compiling fixture `checker-ui-624-observations.test.ts` has three paired cases. It reads the actual MemoryRoom on **every** successful call. The reused-result variant only interns a result whose entire content equals the latest actual read; it does not fabricate a catalogue, return a stale version or omit a room read.

- A policy activation is genuinely confirmed at since **2**. An earlier request is held and will fail. A later successful read confirms the same policy while that request is pending.
- With fresh Catalogue objects, the earlier error is ignored: its answer and the snapshot both remain since **2**. This control passes.
- With one reused readonly Catalogue object, the same successful later observation is overwritten by the earlier error. Both its answer and snapshot become **null**. One named test fails with two actual AssertionErrors: **a successful later read must remain available after an earlier error completes: expected null to deeply equal the catalogue**, and **completed-read ordering must not depend on object identity: expected null to deeply equal the catalogue**.
- With no intervening successful read, the error still honestly makes the catalogue unavailable. This separate control passes.

The available declarations disappear from the snapshot. The Acts screen's null branch (`screens/Acts.tsx:393`) displays "This connection cannot read the room's acts" and hides the forms until another successful read. That screen consequence follows from the inspected source; this fixture asserts the actual adapter answer/snapshot rather than rendering the screen. No draft-loss or authority result is claimed.

The scope is a custom RoomApi/HttpRoom handle that reuses truthful equal readonly results. The public `acts(): Promise<Catalogue>` contract promises active declarations, not a distinct object per call (`packages/contract/src/transports.ts:283`). The built-in HTTP implementation normally gives new objects: `RoomCore.acts()` always reads the room (`client/src/room.ts:576`), and its HTTP wire parses each response with `JSON.parse` (`wire.ts:141`). Ordinary MemoryRoom reads also produce new Catalogue objects. Their paired control passes here. This is **P3 availability and abstraction evidence**, not a built-in HTTP regression, changed authority, bad admission, replay defect or reopening of the repaired lower-activation P2.

A completed-observation counter would distinguish a successful same-instance response from no response. Any follow-up should preserve the existing high-water and honest-null behavior. This report adds no readiness or Jam gate.

## Exact-head checks

Both complete root source/test compilations passed. The final one included the independently added fixture and finished **before** runtime. A single full UI run produced the actual verbose log and Vitest JSON: **273 passed, 1 failed, 0 skipped, 274 cases in24 files**.

| Scope | Actual result at624 |
| --- | --- |
| All supplied UI tests | **243/243 pass** |
| New supplied review-0fd98c41 | **6/6 pass** |
| Supplied earlier review-fcd7391d | **12/12 pass** |
| Frozen original checker fixtures | **15/15 pass** |
| Frozen f606 publication races | **6/6 pass** |
| Frozen retained intents | **3/3 pass** |
| Frozen planner unavailable fixture | **4/4 pass**, formerly two failures |
| Independent repeated-result cases | **2 pass / 1 named failure**, two AssertionErrors |
| Full root source/test compiler, including every private fixture | **exit0** before runtime |
| UI production build | **exit0** |
| Existing browser smoke | **9/9 pass**, exit0 |
| Two-path repair whitespace check | **exit0** |

The browser's unchanged declared-room case now runs through naming, invalid-field validation, successful submission and the new song appearing in the room. Its previous Footprints-versus-c failure is superseded at this composed head by the separate c376 naming change at parent3a03. That is bounded UI/browser evidence for that scope, not credit to the unavailable-state repair or for client/CLI/MCP runtime cases. No browser expectation was weakened.

## Frozen provenance and restoration

Private clone and evidence directory: **`/tmp/artroom-checker-ui-624d-x3tfvfj8`**. The bundle retains the six private fixtures, byte comparisons with every frozen input, complete two-path repair delta, source proofs before/after runtime, actual gitseq inspection, the exact command runner, commands/timestamps/exits, complete compiler/build/unit/browser logs, actual Vitest JSON and two failure messages, parsed per-file counts, and the generated browser screenshot.

Immutable runtime source SHA-256: **d95ed7bfc73c82a0d83637c303caf26a3b76cfd1e47930363fe58a95dbf16855**, Git blob **85212f289a5d482e73d3853fd55c0b4f850410da**. Immutable supplied212-line test SHA-256: **916d984c3e2f5036f71842505932e7873c34357a1a867032017f8d5349e20e38**, Git blob **b88acd6c2f1a34136dd1987061ce2fd292b17290**. Both disk files matched these immutable624 blobs before and after all runs.

The browser generated one changed private screenshot, `declared-form-light.png`; I saved that output and restored only that generated screenshot. I saved then removed only the six owned private fixtures. Final clone HEAD is624, status and tracked diff empty. Canonical source/docs, gitseq durable state, credentials, deployments and providers were untouched.

All counts come from this run's actual JSON. No old128-mutant coverage, whole Stage5 credit, full root runtime suite, authenticated transport result or new scope gate is inferred. The original five conditions and separately adopted MCP scope remain with the composed review.

