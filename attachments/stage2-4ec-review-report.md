# Stage 2 review at 4ec48aa1

Delegated read-only evidence for checker review promise c8bfd0d7bbdc83ced5655a86a92d448a1363958b, original implementation request fd6f00b612d68c035cbdbc3f27ebe3c21500f079. Exact candidate: 4ec48aa162413302f066e78790a240f810d24525. Prior Stage 2 source: 35797f844b55fea9439ac852451fd062c5177b73. Approved overhead head: f621285036b0bec4bc156946172440061dce3b81.

No new blocking Stage 2 finding in this bounded review. The restored cases exercise the intended admission, grant, takeover and migration boundaries. Every numbered repaired defect has a meaningful source-level witness in the current map. This is not a fresh runtime result for all 36 defects. The one focused actual control below independently demonstrates the restored hold.scope refusal and the revised assertion helper.

## Restored acceptance evidence

Line numbers refer to exact candidate objects, not the working tree.

- Same-shape change and hold.scope: packages/room/test/workerd/declared-fd6f00b6.test.ts:193-208 signs before activation, submits the original signed bytes, expects binding-stale/current binding, and checks no version or active landing. The lease-length change is separately retained at 160-190. The targets [version, land] and scope template are directly activated by the test helper; Stage 2 still rejects these unsupported primitives at propose-time. These are tests of stale meaning at admission, not approval of the Stage 4 primitives or their positive execution.
- Actual pre-change explicit grant: 254-283, especially 278-283, signs a roster delegate under the current claim binding, changes the declaration, submits that exact earlier envelope, checks binding-stale and unchanged head seq.
- Legacy narrow grant: 319-343, especially 325 and 332-335, creates a v1 grant limited to review/check, then checks a declared review and platform renew both return delegation-invalid. The v1 star grant keeps renew but gains no declared kind. The common declared authority branch rejects all missing maps; this is not a separate positive review/check execution witness.
- Takeover with new scope, both parts: 556-565 uses real admission on a released thread, checks the new scope, holder, lease generation and taken-over effect, then checks overlap against another exclusive held thread.
- Migration from 1/2/3: 1240-1272 removes all six Stage 2 columns, marks each prior stored version, aborts/restarts the Durable Object, checks kind backfill and null binding/lease/conflict/map/invitation defaults, exercises renewal, and checks a second restart. The separate idempotent migration test at 1274-1289 preserves custom/recovery/room kinds.

Migration fixture fidelity is bounded: the Stage 2 fixture retains later due indexes and safe metadata. This is acceptable for its migration-4 column/backfill condition because migrations 2 and 3 change error data and indexes, not base table columns. Retained complementary witnesses cover those earlier migrations: log-tokens.test.ts:1576-1647 drops the due indexes for versions 1/2, verifies the indexed query plan, preserves debt/ownership/history, and checks whether the scrub starts; 1649 onward preserves a paused scrub cursor and resumes through production alarms. safe-errors-d29c09fa.cases.ts:182-314 injects unsafe historical error rows, restarts from version 1, checks safe projections before cleanup, drains bounded batches and checks final rows/version. This review read those tests; it did not rerun them or claim every historical database layout was recreated.

## The 36 repaired defects

Read the entire current Stage 2 workerd file (1-1291), the entire Node declared-equivalence file (1-399), the 36-defect map (plans/test-invariants.md:475-500), and the mapped policy witnesses for constructor/prototype and the canonical document bound. The map covers every number 1 through 36; grouped rows retain actual assertions relevant to each listed defect:

| Defects | Current meaningful witness |
|---|---|
| 1 | lane.kind visible to real policy evaluation; null with no thread (598-613) |
| 2, 8, 11 | exact retry across target/vocabulary change; malformed outer shape rejected; stale meaning precedes changed target judgment (211-249) |
| 3, 7, 25 | application purpose cannot select recovery; own fields required; non-text goal/text stored as empty contract text (616-654) |
| 4 | who.delegable and current role rejudged at each declared grant use (286-316) |
| 5, 28 | mapped redemption behind queued v1 activation refused without consuming invitation (371-394) |
| 6, 15 | invitation cannot gain declared/legacy kinds; empty v1 session refused with reason (397-427) |
| 9, 27 | accepted/refused bearer retry results retained; same key with another body mismatches (456-484) |
| 10 | kind retired before redemption refuses binding-stale; invitation unused (348-368) |
| 12, 20 | unchanged grant meaning lands; changed delegated meaning and retired kind lose reservation authority (844-882) |
| 21 | recovery landing survives vocabulary retirement, but loses admin authority (885-913) |
| 13 | renamed step kinds run actual admission/landing; summary/explain follow steps (489-521) |
| 14, 26, 36 | recovery role table and active admin own-key boundary, recover record field, textual ops only; Node recover-op loop rejects inherited/list ops (782-839; Node119-146) |
| 16, 17 | conflict recorded at opening and unchanged by activation; opened effect carries kind/binding only under v2 (49-75; lease726-775) |
| 18 | role bounds on platform renew delegation/invitation (254-275) |
| 19, 31, 32 | jobs carry kind/binding; late stale answer owes another attempt; held preparation uses active binding; forged stale service reply does not spuriously reissue (960-1036) |
| 22, 30 | real core parser refuses overbound v2 document even with legal constructor owner path; policy validator checks exact canonical bound/B+1 and prototype owner/dependency names (1051-1070; policy319-378) |
| 23, 33, 34 | only valid Room facts word refusals; bounded filled text, U+FEFF/character boundary; late authority refusal uses declaration wording (659-716; Node359-375) |
| 24 | active policy parsed at most once for a many-kind grant, deep frozen and refreshed on activation (1075-1105) |
| 29 | inherited constructor undeclared at admission, constructor/prototype keys refused by validator (131-142; policy319-332) |
| 35 | segment rejects slash/glob/backslash and exact byte limits (Node158-209) |

Source checks included admission retry/shape/authority/binding/body ordering, grant semantics, declared handler field projection, dispatch, thread/lease recording and takeover; authority direct/delegated/recovery classes; redemption's document-in-force queue, simulation and final transaction; migration definitions. The 16 source files the report names as unchanged were independently byte-compared with 35797f84. All are identical. The five later edits match the report's disclosed Stage 5/MCP additions. Identity of these files alone does not establish all dependencies: changed shared contract/HTTP/MCP/Room wrapper surfaces are delegated to another review helper and remain subject to the parent review.

## Lower-level witnesses and boundaries

The three disclosed carry-plan cases remain meaningful evaluator tests: packages/policy/test/carry.test.ts:38-40 checks room-default src/lib/** dependency invalidation, 62-64 checks package-lock.json as a global input, and 67-71 checks .artroom/policy.json invalidation plus admin requirement. The retained real Room carrying test in obligations.cases.ts:165-193 builds two generations and checks explicit dependsOn invalidation, reopened obligations and stored notCarried paths. Combined with the shared step handler/policy port, that decomposition is a reasonable smaller witness set for this Stage 2 review. It is weaker than reproducing all three exact inputs through a Room and should retain the published qualification. I found no new Stage 2-specific reason to restore the duplicated cases or the whole v2 suite.

The four Stage 5 stand-in downgrades, log retained-file placement and broader Stage 3/5/MCP verdicts are outside this helper's assigned functional verdict. No credit is added for independently owed v1 oversize storage/landing failure (6d4b227c), bearer retired-key retry (5d41ea36), full Stage 4 check-job lifecycle, or live row writes (92ddf4cc). Conflict enforcement under stored hold modes is explicitly Stage 4 work; Stage 2 records the mode.

## One actual control

Owned fixture was created by git archive of exact 4ec. Installed Vitest4.1.11 and workers0.22.0 were reused without installation, with workspace package links redirected into the fixture. Canonical source and dependencies were not mutated. The shipped scripts/control.mjs was byte-identical to 4ec and used --expect plus a Vitest name filter for the restored same-shape/hold test.

At packages/room/src/admission.ts:378, replaced exactly once:

    if ((env.v as number) !== 2 || signedFor !== current)

with the faulty claim-only exemption:

    if ((env.v as number) !== 2 || (env.kind !== "claim" && signedFor !== current))

Keeping propose's guard avoids invoking Stage 2's unsupported two-step dispatch. The unchanged baseline ran one selected test: 1 passed, 41 unselected. The compiled mutant ran the same selected test: 0 passed, 1 failed by AssertionError, 41 unselected. No timeout or unloaded file. The failure is the required invariant at declared-fd6f00b6.test.ts:208: expectRefusal expected binding-stale but received an admitted claim with scope docs/**. The assertion helper at support.ts:542 is the failing boundary. control.mjs returned exit0 / DISTINGUISHES. Total control wall time was 5.704seconds, not a benchmark claim.

Before/restored admission.ts SHA256: e6fbb3924fefb6ebfb56b9f0ad6a7429ecd45c4ee3826fcaf60fd97e958c0e7d. Exact mutant SHA256: 34cd68aa0c22d4a0ba5ce3b1bf1e36132f802a802262394a0b3991683499e6cc. Source Git blob: 88e8255a1b61469cb8b2bf951325f028e9aa95ca. The restored source is byte-identical to the before copy. This is control credit for the hold.scope half and assertion helper, not proof of positive Stage 4 primitive execution or a new complete gate.

Full before/after stdout, stderr and Vitest JSON are npx-1.* and npx-2.* in this report's directory. A transparent wrapper only added --no-install, saved the raw bytes/report, and forwarded the child output and exit code; control.mjs and test behavior were unchanged. control-meta.json records the exact argv, replacement, hashes and restoration result.
