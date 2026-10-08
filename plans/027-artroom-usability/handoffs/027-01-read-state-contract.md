# Plan 027.1: Preserve read truth and action evidence

> **Executor instructions:** Read this plan fully. Check source identity first, run each applicable verification once per changed invariant, and stop on the named conditions. This is a future proposed implementation handoff. It has not been commissioned, adopted or dispatched; publication authorizes no application change. When implementation is dispatched, track it with a gitseq request; the planner maintains the parent index. Update only the status row in `plans/027-artroom-usability/README.md` when the operator asks you to maintain it.
>
> **Current baseline:** Accepted I5 is `7bb3a6415892138a25f5a147f89ae8469b0a716d`; the publication base is `16d7ba440d148c8d6dc29307810ee3c0c103c624`. [BASELINE.md](../BASELINE.md) supersedes the old findings below. Implementation remains uncommissioned and undispatched.
>
> **Drift check after future dispatch:** `git diff --stat 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/page packages/client/src/handle.ts packages/scope/src/reads.ts docs/testing.md`
> Accepted main contains the independently reviewed page package. Historical excerpts below came from reference `3157859665e5531a3f94b124ccec00d2994c01ad`. Run `git diff 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/page/src/data.ts packages/page/src/main.ts packages/page/src/states.ts packages/page/test`. Inspect differences against the excerpts before editing. STOP if later source or owner changes cannot be reconciled. Already-landed guards are regression constraints, not new repair tasks. Do not transplant the older candidate CLI recovery code.

## Status

- **Priority:** P1
- **Effort:** L
- **Risk:** MED
- **Depends on:** Accepted I5 baseline; plan 006 C3/shared settlement and N1 read ownership
- **Category:** bug / direction
- **Planned at:** main `1eed91aacac56649ac0b75c0652215b0418eeff8`, reference `3157859665e5531a3f94b124ccec00d2994c01ad`, 2026-10-08

## Current I5 reconciliation

See the shared [accepted I5 baseline and evidence](../BASELINE.md). I5 rejects failed/incomplete/mixed-head enumeration and keeps returned action answers across refresh failure in memory. Proposed work extends typed partial/provenance and text-read distinctions, durable reload/outbox settlement, fresh standing and independent status axes. Existing guards are reused, not commissioned again.

## Why this matters

I5 now refuses incomplete enumerations and preserves a returned answer across refresh failure in memory. Partial presentation, text-read distinctions, durable reload/unknown-delivery recovery and fresh standing remain owed. A visually convincing workbench must preserve those distinctions and server judgment.

## Historical inspected state (1eed/315)

Candidate `packages/page/src/data.ts` separates domain reads/signing from DOM. `itemsOf`, `textOf`, `listLanes`, `publicationsOf` and `historyOf` assemble projections; `fresh` renews sessions; `openRoom` reads membership standing once; `actsOn` uses `room.me`; `act` signs typed acts using expected revisions. Candidate `main.ts` caches opened rooms and stores last action answers in a transient map. `states.ts/changeStates` projects records without judging rules.

Historical `315785966` excerpts; these are not current source:

```ts
// data.ts:108–113 — itemsOf
for (let cursor: string | undefined, pages = 0; pages < 100; pages++) {
  const page = await handle.items(type, cursor);
  if (!page.ok) break;
  for (const item of page.value) if (!items.has(item.id)) items.set(item.id, item);
  if (page.next === undefined) break;
  cursor = page.next;
}
// data.ts:353–354 — publicationsOf
const read = await G.summary();
if (!read.ok) return new Map();
// data.ts:549,579 — Acted and act
export interface Acted { answer: Answer; before: Head; after: Head }
return { answer, before, after: (await summaryOf(handle)).at };
// main.ts:80–84 — panelFor
lastActs.set(scope, await act(room, scope, kind, { on: target, fields }));
} catch (error) {
  lastActs.delete(scope);
  alert(error instanceof Error ? error.message : String(error));
}
```

The generic current reader already exposes `ScopeHandle.summary/items/history` in `packages/client/src/handle.ts:66–69`. `packages/scope/src/reads.ts:216–225` returns bounded retained-item pages with `at`, `complete`, and `next`. This does not provide searchable room-wide pagination or an indexed publication-by-lane query. Those APIs must be separately designed, not guessed from these methods.

Existing example: candidate `packages/page/test/story.scope.test.ts:19–134` runs data functions through real Worker routes, membership, signed reads and rules; the Git host and scheduler are labelled stand-ins. Candidate `states.test.ts` uses manually made projections for unknown/refused operations. Main `packages/cli/test/claim.scope.test.ts` and `join.scope.test.ts` demonstrate exact-signature settlement with injected lost replies, not wall-clock sleeps.

## Scope

**In scope after prerequisites:** `packages/page/src/data.ts`, `packages/page/src/main.ts`, `packages/page/src/states.ts`, `packages/page/src/view.ts`, `packages/page/src/index.ts`, `packages/page/test/states.test.ts`, `packages/page/test/story.scope.test.ts`, `packages/page/test/record.scope.test.ts`, `packages/page/test/support/demo.ts`; create `packages/page/test/data.test.ts` and `docs/room-read-state.md` as the proposed contract artifact. If the existing owner already has a canonical contract path, obtain a reviewed scope amendment rather than create a competing document. Refresh generated `packages/scope/src/page-assets.ts` only through the existing page build.

**Out of scope:** platform membership/rule judges, new authority grants, room-wide search/index implementation, generic signing/outbox replacement, renderer preview, public/private visibility policy, parked source, framework migration and checkout dependency changes. If a correct bounded query requires backend code, finish the contract prerequisite and stop for its owner rather than extend this scope.

## Verification after future dispatch (not run for publication)

This is a selection map, not a script to run repeatedly. Reuse the accepted I5 witnesses for unchanged guards. Select one exact affected file per changed invariant at its cheapest sufficient boundary; extend an existing witness where it owns that invariant. A later step references its retained result instead of rerunning it unless material source changes invalidate it. Asset parity follows an actual UI build; one final gate covers the completed implementation. New test paths and proposed product commands are unavailable until their separately dispatched slice creates them.

Existing commands operate on accepted I5; newly proposed test files exist only after authorized implementation. Select an exact affected file/invariant, once per slice, then one final gate. Use installed tools. No package probes/installations in a checkout.

| Purpose | Command | Expected result |
|---|---|---|
| Source availability | `git ls-files packages/page/src/data.ts packages/page/src/main.ts` | Both paths listed; otherwise STOP |
| Focused projection tests | `./node_modules/.bin/vitest run --project page packages/page/test/data.test.ts` (new file only after dispatch; reuse `join.test.ts` and `states.test.ts` only when their invariants change) | The adopted partial/provenance invariant passes; existing rejection and known-answer witnesses are reused |
| Real scope story | `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` | Real-route data story passes with labelled stand-ins |
| Affected tests | `npm run test:changed` (only for affected witnesses not already exercised) | Imported changed-source witnesses selected and pass |
| Generated assets | `npm run build --workspace @generalbusiness/artroom-page` | Exit 0; generated assets current |
| Workspace types | `npm run typecheck --workspace @generalbusiness/artroom-page` | Exit 0, no errors |
| Review gate | `npm run gate` | Once at actual review head; all steps pass |

## Git workflow

Create an isolated implementation branch/worktree using the adopted project request. Keep commits in logical units with plain descriptive subjects, matching main's style (for example `Retain accepted page answers across failed refresh`). Do not push, land or deploy unless the operator dispatched that action. A dirty checkout blocks landing. The prior review's main gate is not this implementation's gate.

## Steps

### Step 1: Adopt read and submission contracts

In the adopted `docs/room-read-state.md` artifact, define a discriminated read result carrying value/partial value, canonical head/provenance, completeness, continuation and exact failure category. Separate missing/redacted text from failed text reads. A cap is partial with continuation/reason, never complete. Define durable action state with immutable subject, exact request identity, answer if known, and independent refresh status. Reuse the plan 006 shared preparation/outbox/settlement interface; freeze owner-only storage and reload behavior before code. Define membership refresh on room revival, relevant events and before sensitive submission, with explicit unavailable standing. Record the owner and actual query/settlement methods. No endpoint is assumed.

**Verify:** `git diff --check` → exit 0. `git diff --name-only` → only the contract path named by the future dispatch; the reviewer explicitly accepts absent/partial/unavailable, exact-envelope and authority-refresh semantics. If the contract is not adopted, STOP before implementation; a source test cannot replace this decision gate.

### Step 2: Return read truth at the data boundary

Update `itemsOf/textOf/publicationsOf/historyOf` and their load callers. Carry partial rows and failed sections instead of empty maps/null. `listLanes` records whether title/state came from an authoritative lane or advisory directory copy, including head and failure. Counts stay qualified. Retain I5's unreadable rejection at the existing 100/1,000 page budgets; only an adopted partial/progressive contract may replace rejection with explicit continuation. Publication details initially preserve truthful incompleteness; replacing full-history scans waits for an adopted scoped query.

**Verify:** the exact affected `packages/page/test/data.test.ts` or `join.test.ts` witness, once → failed later page returns partial known data; missing content differs from unreadable content; unreadable destination never yields definitive no-publication; stale row fallback is labelled advisory; all existing projection cases pass.

### Step 3: Persist known answers independently of refresh

Preserve I5's existing before-refresh answer callback, independent observation field and associated failure display. Extend them through the adopted shared durable submission interface; do not reimplement already-removed evidence deletion. Persist draft, exact signed request reference and known answer according to custody policy, then restore them after reload. Unknown transport outcomes expose Check status/settlement; do not generate a new signature/deadline on retry. Expired unattempted intent and deliberately changed meaning are separate operations.

**Verify:** Reuse accepted `packages/page/test/join.test.ts` for memory-only known-answer/refresh preservation. Extend the adopted durable interface witness in `packages/page/test/story.scope.test.ts` for lost-reply settlement/reload with the original envelope and no duplicate comment/proposal; select that exact file once for the new invariant. `npm run typecheck --workspace @generalbusiness/artroom-page` → exit 0.

### Step 4: Refresh standing and project separate status axes

Refresh `room.me` from current authenticated membership on revived room and before sensitive work; retain error/age independently of session renewal. Clear stale enabled actions when standing becomes unreadable, without asserting access revocation. Keep backend authority decisive. Extend `changeStates`/view for generic refusal, invalid path and out-of-date while separating canonical lifecycle, latest publication attempt and readiness/observation health. A confirmed judge/mint/revoke never produces Published. Retain exact refusal in inspectable details.

**Verify:** `./node_modules/.bin/vitest run --project page packages/page/test/data.test.ts` (new file only after dispatch; reuse `join.test.ts` and `states.test.ts` only when their invariants change) → named reason and generic refusal witnesses pass. `./node_modules/.bin/vitest run --project scope packages/page/test/story.scope.test.ts` → reassigned/revoked membership and changed rules are correctly reflected while real scope refuses stale authority/version; published state requires the actual record.

### Step 5: Integrate presentation and review once

Render pending/partial/error sections without replacing current drafts, and retain status after navigation. Refresh generated assets, then run affected tests. Record source HEAD/tree and stand-in limits. Run the gate once at the review head; do not repeat whole suites for document-only follow-up.

**Verify:** `npm run build --workspace @generalbusiness/artroom-page` and `npm run test:changed` (only for affected witnesses not already exercised) → exit 0; `git diff --check` → exit 0; `npm run gate` → one successful review-head run.

## Test plan

Reuse current `join.test.ts` rejection and memory-answer witnesses. Proposed `data.test.ts` adds only the adopted partial/provenance contract at the cheapest boundary. At minimum test complete empty, partial later failure, budget cap with continuation, failed text versus absent text, failed publication versus complete none, and authoritative/advisory fallback. Extend `states.test.ts` for path-invalid/out-of-date/unknown/generic refusal. Reuse `join.test.ts` for the existing answer-plus-refresh-failure invariant. Extend real-route `story.scope.test.ts` only for the new durable lost-reply/reload, membership revival and exact-version invariants its adopted slice changes. Label fixture substitutions as existing tests do. Use clock/gates, never wall-clock sleeps. One focused guard control may distinguish a changed guard; no mutation sweep.

## Done criteria

- [ ] Read data never silently converts failure/cap into absence/completeness.
- [ ] Accepted answer/request identity survives failed refresh and reload in tested durable storage.
- [ ] Lost delivery is settled without a fresh irreversible signature.
- [ ] Current standing is refreshed; permission errors differ from authority unavailability.
- [ ] Canonical state, publication attempt and readiness remain separate in tests and UI.
- [ ] Types, applicable focused witnesses, asset freshness and one review gate pass.
- [ ] `git diff --name-only` contains only commissioned in-scope paths; evidence names exact head/tree.

## STOP conditions

Stop if the accepted baseline or later drift cannot be established, excerpts drift without reconciliation, later receipt fixes already own the change, shared settlement/durable browser custody is unresolved, authoritative read semantics cannot distinguish absence from refusal, backend query work becomes necessary, two reasonable focused repair attempts fail, or a fix needs out-of-scope source. Do not simulate authority success or invent a working endpoint to finish.

## Maintenance notes

Reviewers should inspect state fidelity under failure, not only successful screenshots. Future indexed lists and scoped publication reads must preserve head/continuation/provenance semantics. Future identity work must refresh standing while retaining exact historical request subjects. This plan leaves scalability APIs and immutable preview contracts to their named owners.
