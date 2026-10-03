# Positioning exploration: first round

Date: 2026-10-03. Research for request `3f3f1d0ee91057c4a62ec19c9438ffc1335e8966`, promise `8f36dbcd1c9faa29fc2d190b6278f73f4f89bd95`. Baseline: approved main `344656705140d9bf6539fe44de889d1e21dd2482`; instructions revision 3 at `notes/2026-10-02-positioning-exploration.md`.

This note answers Q1–Q15 at their commissioned breadth. Recommendations, opening paragraphs and candidate sentences are research judgments and specimens to test. F1 onward identifies sourced facts; proposed demonstrations and unmeasured claims are labelled. This research adopts no positioning design and commissions no assets. Estimates can sequence work; the complete functional scope remains owed.

Presentation uses the integrity of the record, the consistency of the state, and actions that take effect. It makes no visibility guarantee or comparison claim. Cloudflare and its platform parts may be named; GitHub may appear only as a nod to shared software vocabulary. Internal source identifiers, repositories, commits and paths in this note allow evidence to be checked and do not authorize those names or comparisons in later assets. This work follows admission, and does not create a jam-start condition; the builder owns concrete readiness and the full documentation/jam parallel start.

## Q1. Audience and story order

**Judgment: lead with a software problem and show the platform within the first minute.** Developers can judge a concrete version, review and landing result before they understand “applications over a shared record.” Platform-first survives as the strongest alternative because it makes the broader ambition explicit immediately. Failure-first survives as an interruption in the worked demonstration; opening with only failures postpones a useful result. No unaided audience test establishes which order actually lands faster for developers in 2026.

Platform-first specimen: People and agents need a shared place where actions have rules and the results have a history. In an Artroom, a rulebook says which actions may take effect, a signed record keeps the decisions, and a board shows what follows from them. Start with a code room: two agents prepare changes, another party reviews the exact work, and the room publishes only when its requirements are met. The same picture guides the proposed music and rollout rooms.

Software-first specimen: Two agents are changing one repository. Each needs to know which work is theirs, which version a review covers, which checks still count and what actually landed. Artroom records those decisions and shows what each party owes next. Follow a change through a refusal, a repair, a review and a confirmed landing; then inspect the shared record and rulebook behind that workflow, and the other kinds of room they suggest.

| Order | First sixty seconds, as a proposed allocation | Cost and strongest objection |
|---|---|---|
| Platform first | 0–15 seconds: shared picture; 15–45: a real code decision; 45–60: the resulting board and boundary | Abstract nouns consume the first attention. A viewer may hear a universal platform promise before seeing the actual fixed steps and application code. |
| Software first | 0–20: overlapping work and the decision a person needs; 20–45: exact proposal/evidence/result; 45–60: rulebook, record and board | The broader platform can become an afterthought. Reveal it explicitly within the minute and later show a distinct application when evidence supports it. |
| Failure first | 0–20: a stale review or unresolved write; 20–45: repair; 45–60: the successful result and common picture | Risk can dominate the opening. Keep the failure in the demonstration where its fix shows value. |

Keep developers first (H1), then explain the operating mechanism to infrastructure readers. The official task requires actual concurrent code work and scores it (F1); it does not establish every judge's background or audience preference. Test both opening specimens with newcomers: ask what they could do, what is guaranteed, and which behavior they believe already works. The strongest objection to this recommendation is that a familiar code opening can hide the platform ambition. Its answer needs a distinct application proof, rather than more abstract introductory language.

## Q2. The infrastructure audience

**Judgment: use one paragraph in the same story, with a technical appendix for later use.** Operators need the unit of authority and scaling, failure behavior, trust assumptions, data portability and operating cost. Developers first need a correct next action and an exact result. Both need the same trust boundary, explained at different depths.

Infrastructure specimen: One room owns a signed record and judges actions against the rules in force. Many rooms can prepare work independently, while publication within one room has a single slot. A lost reply can be retried to recover the original result. A write to another service can remain unresolved, and the room records that uncertainty until it confirms the outcome. Retained decisions and their inputs can be inspected; the current verifier states which parts it cannot independently reconstruct.

A paragraph after the first working loop survives because it explains the result already seen. A second track loses in a five-to-ten-minute competition demonstration: it restarts the story and consumes time needed for code work. It survives as a later infrastructure talk or appendix. A hosting-component list loses as an opening because it gives parts before a reason to use them. The strongest objection is that one paragraph cannot establish reliability. Pair it with exact failure schedules, source/deployment identities, portability/proof limits, workload measurements and costs. A single sequencer does not prove arbitrary scale; parallel preparation does not make publication parallel. F2–F4 and F8 bound those claims.

## Q3. Rewordings, assumptions and falsifiability

The working H3 is preserved verbatim for testing:

> The agent writes the application; the platform guarantees the integrity of the record and the consistency of the state computed from it, so what is decided stays decided and every party builds on the same facts.

**Judgment: sharpen H3.** Its first clause is a division of work; its last clause can wrongly imply unchanged current standing, immediate identical views or independently proven external truth. The historical decision remains in the recorded prefix. A review can later stop counting after a relevant edit or revocation; later actions change the board. Readers at different prefixes can legitimately see different current states.

| Rewording | Said aloud | Read on a slide | Newcomer reading | Decision and scope |
|---|---|---|---|---|
| The agent writes the application; the platform protects the signed record and makes the same recorded history and rules yield the same state. | Precise but long | Too dense alone | “Same” needs the prefix/rules condition | Survives as a technical thesis, with retained inputs and supported implementation stated. |
| People and agents propose actions; the room applies its rules and keeps a signed record of the decisions. | Clear actor/action/result | Readable with one real outcome | Least prior knowledge needed | Preferred spoken specimen. Add the state condition in the next sentence; a decision can be a refusal. |
| One record, one rulebook, one account of what takes effect. | Rhythmic but abstract | Compact beside a worked decision | Needs an explanation of who owns the rules | Survives as a compact specimen, not a complete guarantee. |
| Build applications whose participants can check decisions and follow the same recorded history. | Useful ambition | Readable but unspecific | “Check” can sound like full independent proof | Survives as a developer aim only with the current verifier's limits. |
| The room preserves what was decided; participants using the same history and rules can compute what counts now. | Longer, but separates time correctly | Best as two clauses beside historical/current views | Explains why a review can stay recorded but become stale | Preferred explanatory specimen; “can” needs a complete, supported projection and retained inputs. |
| Artroom makes every action permanent and every application state identical. | Easy to say | Short | Easy to misunderstand | Reject: early failures are unrecorded, storage is not indestructible, prefixes differ and external states differ. |
| Agents write the rules; Artroom guarantees that the result is correct. | Easy to say | Short | Suggests correctness of business meaning and real-world claims | Reject: consistently applying a mistaken rule is still wrong for its purpose. |
| What is decided stays decided. | Memorable | Very short | Implies current eligibility never changes | Reject as the whole guarantee; retain only as a carefully explained historical-record image. |

The spoken survivor is the second, followed by: “Participants using the same recorded history and rules have the same basis for computing the state.” The technical survivor is the first; the compact survivor is the third beside an actual decision. The fifth best explains historical decisions versus current standing. These are editorial judgments, not measured comprehension results.

The guarantee needs authenticated keys, an intact available prefix, the exact supported policy and platform-step versions, deterministic evaluation and all required retained inputs. Replay must use the policy in force for the decision; current eligibility must use the relevant history rather than silently substituting today's rules for yesterday's. Key control alone does not establish a person's organizational identity. A host must implement the steps correctly, and a trusted room's reported clock and provider observations remain evidence with named limits. Clients and adapters must fulfill their own contracts.

Falsifiers are concrete: two conforming projections disagree on the same complete prefix and versions; an altered signed entry is accepted as unchanged; a decision uses a different policy or omitted required input without detection; a historically eligible review is silently rewritten instead of its present standing changing. Claims about outside effects need separate falsifiers: a reported confirmed publication names a head the provider does not hold, or an approved rollout is presented as deployed despite failed read-back. A correct record of a mistaken report is still not independent proof of provider truth. Current main replays retained policy decisions but does not independently reconstruct every receipt effect or board transition (F4); the broader declared implementation remains staged, not delivered by its type contract alone.

## Q4. Integrity and consistency

**Judgment: keep both with their objects and plain verbs.** Integrity can mean untampered bytes, authorized actions, accurate assertions or moral character. Here it concerns signatures, the unchanged recorded prefix and attributable decisions; it does not make an assertion true. Consistency can mean agreement at one prefix, instant convergence everywhere or an atomic transaction with another service. Here it requires the same history, rules and retained inputs. Room decisions, repository publication and other provider effects are separate states.

| Alternative | Survives or loses |
|---|---|
| History and state | Keep as clear objects in explanation, but they name no promised property. |
| Trust and agreement | Drop as the guarantee: people need not agree about truth or preferences, and trust can imply every participant/provider is trustworthy. |
| Safety and predictability | Keep as possible outcomes; drop as names because neither gives a bounded falsifiable contract alone. |
| Permanence and determinism | Keep in the technical appendix; permanence can imply eternal storage and determinism needs pinned inputs. |
| Auditability and coordination | Keep as value descriptions, but neither promises correct business meaning or full replay. |
| Shared facts | Keep only for attributable recorded facts with prefix and truth boundaries; drop as universal external truth. |

The strongest objection is that the two technical nouns hide different claims behind reassuring language. A developer should see a signed review bound to one version and why it counts now; an operator should see the prefix, implementation profile and unavailable proof. Neither audience should see the two labels without their objects and an example.

## Q5. The pivot from proposal to fact

Three plain-English candidates:

1. “The room checks the rules. If the action takes effect, later actions build on that decision.” Preferred: actor and consequence are explicit.
2. “A proposal becomes a recorded decision that the application can use.” Survives with the outcome shown: a refusal is also a recorded decision and does not grant the proposed effect.
3. “From something someone asks for to something the room has accepted.” Survives conversationally, but loses where acceptance of a landing request could be mistaken for confirmed publication.

A recorded refusal supplies context without applying the requested effect. A landing request taking effect starts an operation; its confirmed publication outcome comes later. The strongest objection to the word “fact” is that it can conceal that boundary. Show the decision and effect separately (F2–F4).

## Q6. The picture survives; rulebook-only generality does not

Source shorthand in Q6–Q11: P = `docs/protocol.md`; A = `notes/2026-10-02-acts-review.md`, revision 4; J = `notes/2026-10-01-jam-room.md`, revision 5, all at the approved Artroom baseline. C = `chess.go` and CA = `docs/reference/architecture.md` in `github.com/generalbusiness-ai/gitseq-chess` at `b97c6a82ef7e3618721696f5a69efef13da10a79`. Ranges below are exact source lines, not presentation wording.

**Judgment: sharpen H6.** Rules, a record and a board explain the shared mechanism. Changing only a rulebook cannot supply arbitrary application transitions, an audio engine or a deployment adapter. Declarations choose names, fields and permissions within fixed platform steps; policy gates those steps. Application code supplies business judgment and outside work. Signatures, recovery, custody, evaluation limits, historical binding and publication remain platform rules the room cannot repeal. Q11 gives the authoritative room-by-room counterexamples and readiness/trust boundaries.

| Alternative | Disposition and strongest objection |
|---|---|
| Change only the rulebook and get any application | Reject: fixed steps and supplied inputs do not implement an arbitrary application fold or outside effect. |
| Three parts, with platform rules and application code explicit | Keep: a compact bridge, provided the application/outside-system boundary is visible. |
| Code-review workflow with renamed verbs | Reject as the general explanation: it erases musical live work and the missing request/completion lifecycle. |
| A record plus an application fold | Keep for gitseq chess, not as delivered Artroom declared runtime; the application must retain semantics and judge identity. |
| Complete programmable host, including effects | Leave open as future scope; new semantics, implementation and trust boundaries are not established here. |

### Complete act and non-act coverage

Current dispatch is `claim`, `propose`, `note`, `review`, `check`, `land`, `release`, `renew`, `roster` (`packages/room/src/admission.ts:486–505`). Code-review declarations are data (`packages/policy/src/codereview.ts:23–74`); v2 `recover` is proposed, not a tenth legacy act. In this table, `admission.ts` and `core.ts` mean `packages/room/src/`; `codereview.ts` means `packages/policy/src/`.

| Path | Record/board contribution and limit | Source |
|---|---|---|
| `claim`, opening | Holder/scope/generation/lease. A held resource is not an unheld issue, addressed request or accepted promise; declared `open`/`take` runtime is owed. | P:762–814; A:463–505; `admission.ts:487–488` |
| `claim`, rescope/takeover | Guarded reusable hold. Release/expiry does not establish work status; this steps version preserves rescope's `obligationsRecomputed: false`. | P:3546–3571, 3608–3634; A:471–505 |
| `propose` | Exact head, bounded actual changes, obligations and retained preview. Push alone is preparation; reachability, diff, pins and integration require Git/provider code. | P:837–926; `admission.ts:489–490` |
| `note` | Attributed entry/line commentary, not a protected business transition. Unanchored declared comments remain owed. | P:3590–3634, 4284–4304; `codereview.ts:42–48`; A:473–484 |
| `review` | Qualified exact-head judgment. Platform authority, independence, scope and count determine whether it meets an obligation; it is not every requester's acceptance. | P:875–926, 1290–1308; A:490–529 |
| `check` | Evidence bound to integration, config and runner inputs. A requirement is an obligation; a check may satisfy it. Runner truth is trusted; declared job routing is owed. | P:897–911, 985–1022, 2486–2648, 3914–3953 |
| `land` | Guarded request, preparation, reservation and later outcome. Preparation may be parallel; publication is single-slot and needs external resolution. Not general completion. | P:1047–1219; A:461–510; `core.ts:1340–1369` |
| `release` | Relinquishes the holder's lease, retaining handover text; sets `unheld` and advances lease generation. Does not close work, accept results or cancel reserved publication. | P:799–814, 1136–1155; `admission.ts:1281–1308` |
| `renew` | Holder's lease extension under room-clock/authority guards, not a business timer. Remains a platform kind in v2. | P:785–798, 3540–3544, 4147–4149 |
| `roster`, all nine ops | `invite`, `join`, `set-role`, `remove`, `revoke-key`, `team`, `delegate`, `undelegate`, `rotate-recovery`. Membership/custody/authority floors are fixed; admin/recovery roster acts bypass policy refusals. | P:193–258, 406–449, 1290–1360; `admission.ts:331–389, 535–559` |
| v2 `recover` | Protected configuration recovery, active admin's own key only; cannot be renamed/delegated. Legacy config-recovery continues under v1. | P:3954–3990, 4154, 4297 |
| Signed non-act requests | Workspace/token/read-session retrieval uses an operational nonce/credential/grant store; the requests are unrecorded. | P:578–631; `packages/room/src/requests.ts:1–93` |
| Early failures | Parse/signature/authority/body/secret and runtime failures record nothing. Late deterministic refusals are recorded; the log is not every attempt. | P:374–400, 455–491 |
| System events | Room-signed expiry, activation, recomputation, carry, preparation evaluation, reservation, abort, unresolved/outcome/revert, notification and checkpoint. `prepared` is owed by stage 2; `reservation-ended` by stage 4. | P:1648–1663, 2457–2485, 4177–4191 |
| Reads, watch, attention, waits | Prefix/cursor and operation state; disconnected clients may differ. A timeout does not cancel work, and attention/provider outcomes can lag. Generic v2 access remains owed. | P:1828–1951, 4169, 4297–4303 |

### Nine fixed declared steps and five policy kinds

`artroom-steps-v1` permits only these nine primitives and their specified target combinations. The sole compound act is `version` then `land` on a thread (P:3583–3634). All are stage-1 contract/data/validation, not declared runtime delivery; stage ownership is P:4293–4304.

| Step | Room-data choice | Fixed or application-supplied work |
|---|---|---|
| `open` | Kind, fields, roles, scope, lease/conflict/workspace | Held resource thread, not unheld filing or arbitrary object/state creation. |
| `take` | Addressable opening kinds | Guarded takeover/rescope, expected generation, lease, scope and reservation; not separate-conversation reassignment. |
| `version` | Kind/fields/roles, obligations and refusals | Reachable exact head, bounded diff/scope/admin guards, pins/preview/generation; content validators are application code. |
| `review` | Kind/fields/thread kinds/roles and principals/count | Exact-head qualification and self-review floor; not universal acceptance. |
| `check` | Check kind/binding in job configuration | Result contract, author exclusion and runner evidence; services and dispatch must be deployed. |
| `land` | Kind/fields and gating rules | Canonical code publication, not arbitrary effects; a compound act cannot obtain independent review inside itself. |
| `release` | Kind and metadata | Holder release of a reusable resource, not work/conversation closure. |
| `hand-over` | Named member and compatible thread kind | Release plus time-bounded reserved takeover, not an arbitrary transferable transaction. |
| `comment` | Typed signal and permitted anchors | Commentary/attention; application code interprets timing and renders results. |

| Policy kind | Room policy can change | Fixed limit |
|---|---|---|
| `refuse` | Deterministic reasons/fixes on supplied input | No waived platform guard or arbitrary effect; admin/recovery exceptions remain. |
| `require` | Path/condition/principal/count review or check obligations | Requirements do not supply evidence, a runner or business-object state. |
| `carry` | Narrow eligible evidence reuse | Cannot widen scope/global-input/revocation/config/runner floors. |
| `land` | Block at request or reservation evaluation | No external deployment/access effect, provider read or trusted live clock. |
| `notify` | Attention targets/reasons after commit | Later recorded outcome, not an outbound webhook or a rewritten act. |

Sources: P:1363–1466; `packages/contract/src/policy.ts:37–98, 204–266`; `packages/policy/src/profile.ts:10–29`; `packages/policy/src/evaluator.ts:64–80`. `RuleInput` has no clock, randomness or I/O. An actor's timestamp is not trusted current time; a rollout freeze needs a specified application observation/time mechanism (Q10), not merely a policy expression.

### All 247 numbered rules in 24 families

The following inclusive ranges cover every distinct numbered rule, independently counted from the pinned protocol. Amendments apply with the earlier rules; non-numbered acceptance cases and open points still matter. **L** denotes the existing legacy contract/source boundary, not fresh validation of each runtime rule. **D** denotes delivered stage-1 types/data/validator functions. **O** denotes owed declared runtime/replay/client/fixture behavior. None means a deployed application was tested in this research. All rows retain the fixed platform floors described above.

| Rules, inclusive | Contribution | Distinct boundary and delivery | Exact P source lines |
|---|---|---|---|
| R-ID-1–10 (10) | Stable act, resource, operation and evidence IDs | Fixed identity arithmetic. L; declared names/bindings D/O. | 85–128; amendments 4132–4170 |
| R-SIG-1–6 (6) | Canonical signed intents | Cryptography, size/domain/body guards are fixed; early failures are unrecorded. L; v2 extensions D/O. | 131–176; 4133–4136 |
| R-GEN-1–13 (13) | Founding, roster, recovery, repository and registry | Operator/provider authority remains a trust boundary. L; profile/declaration authority D/O. | 179–371; 4137–4139 |
| R-ADM-1–12 (12) | Atomic judgment, sealed receipts and late refusals | Validation order, room clock, recovery and custody are fixed. L; binding/`who` runtime O. | 374–517; 4140–4142 |
| R-IDEM-1–6 (6) | Original outcome for identical signed retries | Changed bytes or a newly signed act are not equivalent; unrecorded failures have no logged outcome. L. | 520–539 |
| R-CRED-1–11 (11) | Custody, delegation, bearer and read/write authority | Sessions and secrets remain operational, outside acts. L; binding-aware declared access O. | 549–708; 4143–4146 |
| R-WS-1–5 (5) | Safe workspace operation views | Forks, tokens and revocation require provider code; secrets stay outside records. L; declared workspace choice D/O. | 711–747; 3697–3715 |
| R-LANE-1–10 (10) | Scope, holder, generation and lease | Reusable resource hold, not request/conversation closure. L; thread settings, fixed scopes and handover O. | 762–814; 4147–4149 |
| R-PATH-1–3 (3) | Deterministic path matches and conservative overlaps | Fixed glob algorithm, not arbitrary business-key exclusion. L; scope templates O. | 817–836; 3660–3676 |
| R-PROP-1–7 (7) | Exact pinned head, bounded changes and preview | Git/provider code supplies reachability, integration and pins; a push alone is not a proposal. L; version witnesses O. | 837–872; 3608–3634; 4165–4166 |
| R-OBL-1–7 (7) | Qualified required/advisory evidence | Independence, count and check-input floors are fixed; policy configures requirements. L; declared job bindings O. | 875–926; 2634–2648; 4150 |
| R-CARRY-1–16 (16) | Evidence that still counts on a later version | Fixed scope/global-input/policy/config/runner/snapshot/revocation conditions; policy only narrows. L; binding-aware jobs O. | 934–1022; 2457–2504; 2516–2583; 4163 |
| R-LAND-1–11 (11) | Preparation, latest version, reservation and outcome | Reservation fixes authority; later hold loss is not cancellation. L; `prepared` O in stage 2, compound acts O in stage 4. | 1047–1163; 4151–4152 |
| R-PUB-1–10 (10) | One slot, forward resolution and policy activation | Provider observations and exclusive publisher assumed; token expiry alone does not stop a push. Authorized `force-with-lease` exists. L. | 1166–1219 |
| R-REV-1–8 (8) | Invalidated evidence, reopened obligations and abort/revert history | Historical decisions remain; retired/compromised and post-reservation emergency rules differ. L; declared revert vocabulary O. | 1222–1287; 4153 |
| R-ADMIN-1–9 (9) | Protected configuration, sole-admin exception and recovery | Recovery bypasses broken policy; sole-admin permission is not every custom review. L; v2 `recover` O. | 1290–1360; 4154 |
| R-POL-1–12 (12) | Versioned gating, requirements, carry, landing and attention | Five bounded rule kinds; no arbitrary effects or self-authorizing proposed policy. L; v2 document D/O. | 1363–1466; 4155–4160 |
| R-EVAL-1–9 (9) | Pure evaluation, budgets and retained inputs | Runtime failure is unrecorded; replay does not prove observation truth. L; new profile activation/retention O. | 1469–1558; 4161–4162 |
| R-EXEC-1–11 (11) | Isolated job/input/environment provenance | Runner/service/provider trusted; repository execution remains untrusted and dispatch uses service bindings. L; declared jobs O. | 1561–1588; 2505–2515; 2584–2633; 4163 |
| R-SEC-1–6 (6) | Detection before permanent/public recording | Secret detection is incomplete; no per-fact confidentiality guarantee. Credentials never belong in the record. L. | 1591–1619 |
| R-LOG-1–20 (20) | Chained signed entries, replay material and checkpoints | Verification covers a published prefix; full transition/effect derivation, unpublished acts and room clock are proof limits. L; fuller declared proof O. | 1622–1825; 2884–3104; 4164–4168 |
| R-API-1–12 (12) | Refusal values, cursors, operations and updates | Equal projection needs equal prefix; wait timeout is not cancellation. L fixed clients; generic declared access O. | 1828–1951; 4169 |
| R-MINT-1–7 (7) | Durable token ownership and unresolved outcomes | Operational ledger/provider clock/create/revoke and exclusive writer are not a pure fold; elapsed time is not success. L. | 3311–3461 |
| R-DECL-1–26 (26) | Names, fields, targets, roles, holds, bindings, retirement and historical semantics | Only nine fixed steps; no code references in declarations. Platform authority remains fixed. D types/data/functions; runtime stages O. | 3546–4124; 4284–4304 |

Implementation anchors: `packages/room/src/admission.ts:486–559`; `packages/policy/src/validate.ts:140–154` (active v1 path); `packages/policy/src/acts.ts:183–207` (separate v2 validator); `packages/policy/src/profile.ts:10–29`; `packages/room/src/core.ts:1340–1378`; `packages/log/src/verify.ts:176–185`. Room authority/requests/jobs, `packages/git/src/landing/`, `packages/git/src/mints.ts` and `packages/log/src/layout.ts` supply operational code. Production `packages/` has no `validatePolicyV2` caller beyond its export; tests call it in `packages/policy/test/declared-acts.test.ts`. Contract tests therefore do not establish runtime delivery. Protocol sections 29–32 specify checker/snapshot/log-layout/mint machinery; section 33.8 assigns the declared stages.

### Where the software shorthand breaks

| Original shorthand | Correction |
|---|---|
| Opening an issue is a claim | Claim opens a hold. Complete D1 scope remains owed and unadopted: unheld filing, optional scope, addressed performer/conditions, acceptance, decline, reassignment, requester withdrawal, performer cancellation, non-landing report, result acceptance/rejection, closure and replacement. Fields cannot create these guards (A:461–510). |
| Pushing a branch is a proposal | A signed act names an exact reachable head; the room computes/pins its changes. A push may never be proposed. |
| Approving is a verdict bound to one head | Keep with principal, scope, independence and present evidence validity; the historical approval can remain while no longer counting. |
| Checks are obligations | Checks provide evidence for obligations; requested/advisory/failed/stale/unroutable/noncarrying results differ. |
| Merge queue is the publication slot | Preparation/disjoint work can be parallel; one external publication uses the slot, and an unresolved write can hold it indefinitely. |
| A force push never takes effect | Reject unqualified wording: pinned proposal heads stay fixed (P:850–852), but the publisher uses `force-with-lease` (P:1179–1181). Another canonical writer causes unresolved state. |
| Landing completes work | Confirmed Git outcome does not release the lane or assert requester satisfaction; it updates generation/config/preview state (`core.ts:1353–1369`). |

Delivered room data can choose reviewer/checker requirements, refusal/landing gates, attention, overlap mode, retired-evidence reopening and checker input/environment/advisory settings. Proposed declarations add bounded names, fields, targets, threads, roles, wording/help and hold/compound settings. Meaning bindings prevent a signed grant gaining new authority; retirement/reuse preserves historical meanings and old thread settings (P:3636–3747, 3784–3913). New business transitions, provider reconciliation, live clock reads, checker distribution, scheduling and rendering need application code or a separately reviewed platform change.

### Chess: concrete mechanism, bounded proof

The pinned chess application has eight schemas and native Go dispatch (C:31–42, 191–225). Exact accepted predecessor and seat authority are checked before `notnil/chess` `MoveStr` changes game/seat state (C:388–432). `go.mod:5–8` pins host `7152e79a741e` and engine `v1.10.0`. Refusals remain in history; a bounded refusal tail and older-decision prefix re-fold support queries (C:551–560, 831–883). It demonstrates application judgment over a verified log, not arbitrary chess semantics from Artroom declarations.

In the isolated exact checkout, three existing tests passed with `go test . -run 'Test(MoveRequiresTheRightTurnAndExactPriorMove|IllegalMoveCannotUpgradeAnUnanchoredSeat|LegalDestinationsComeFromTheFoldEngine)$' -count=1`: `ok`, 1.443 s (`chess_test.go:166–209, 1264–1319`). They establish the narrow turn/predecessor/legality and refused-move authority checks, not public deployment, full chess correctness or Artroom runtime. The service/browser-code and one-local-POSIX-writer trust limits are in CA:24–40, 73–101 and summarized in Q11. The separate DDL chess migration remains unadopted design. Current Artroom verification's own proof boundary is F4.

## Q7. Table, diagram or repeated sentence

**Judgment: use a small diagram to introduce the mechanism, then a table to audit the rooms; keep the repeated sentence as a mnemonic.** These are untested explanation choices, not assets. Q11 supplies the authoritative room comparison.

| Form, sketched in words | Why keep it; strongest objection |
|---|---|
| Table: rooms as rows; rules, recorded decisions, current board and application/outside work as columns | Makes generality and candidate/owed status inspectable. Width and detail cost spoken time; three columns alone hide asynchronous effects and different prefixes. |
| Diagram: action enters fixed platform rules plus room declarations/policy; outcome enters the record; a board follows a labelled prefix. A side branch invokes application/provider work and records its later observation. Jam live notes stay outside authority. | Shows refusals and decision-versus-effect. Reveal the outside branch after one code example; too many arrows can suggest a magical universal application box. Show rule activation at a specific recorded point. |
| Repeated sentence: name each room's checked action, retained decision and current result in the same grammatical roles | Gives spoken rhythm and recall. Alone it invites rulebook-only generality and equates historical decision with current standing; retain the application/outside boundary nearby. |

A middle row remains labelled candidate or is omitted from a future demonstration while Q9 defers it. Representation and spoken comprehension remain research judgments.

## Q8. The paving image strains at current state and external effects

**Judgment: sharpen H8; reject paving as a literal explanation of the whole system.** A brick must mean a **record entry**, including accepted acts, recorded refusals and system observations. Past history can remain while an approval stops counting, traffic changes or an outside outcome remains unresolved. Paving also suggests guaranteed progress, which append-only safety does not provide (P:1182–1213).

Q11 gives each room's full counterexample, assumptions, readiness and trust boundary. The particular strains are:

- **Code:** compromised evidence stays recorded without still qualifying; unresolved publication is not a completed road ahead.
- **Jam:** a common effect bar does not make a late listener play on time; transient MIDI/audio previews are not durable bricks.
- **Rollout/access candidates:** rollback or expiry changes outside standing without removing historical authorization; a timeout can leave the actual effect unknown.
- **Case candidate:** closing/reopening changes status; resource release alone implements neither. **Chess:** another prefix gives another valid position, and native move code remains necessary.

Sharpened wording: “The record is laid one entry at a time. Past entries remain; later entries can change the current state.” Attach permanence to retained history, not guaranteed storage forever, current eligibility, low latency or successful outside work.

**Alternative to keep: a shared signed logbook beside a current status board.** Entries retain who asked, rules, decisions and reported outcomes; the board shows the result at a stated point. An outside instrument reports provider observations; jam's live performance happens beside the logbook. This handles refusal, correction, reopened evidence and unknown effects. Its costs are less motion, an audit-paperwork association, and the need to explain that signed reports are attributable rather than automatically true.

Other images considered: chessboard—concrete but suggests discrete turns and overweights the unbuilt Artroom chess interpretation; score/conductor—fits music but poorly explains refusal history, code publication and unknown outcomes; ledger—stresses history but can imply stronger transaction/business guarantees. Keep logbook/status-board for consideration; visual choice and audience response remain open.

## Q9. Choose a middle example for its proof, not its place in the story

**Judgment.** Rollout is the strongest candidate, but defer selecting a
middle room for the submission. None of the inspected source establishes
a working middle-room application or its external effects. Retain rollout
as the first candidate to build and assess. It may be built before
submission if time permits, as the owner allows. A later design decision
can choose it, reject it, or continue the deferral. This decision does not
delay jam development or reduce the application's eventual functionality.

The following rankings are judgments, not measurements. Rank 1 is best
within that column; lower build cost is better. The overall ranking gives
most weight to a legible rulebook and a visible effect outside the room.
The cost column assesses the complete application, including failure and
recovery paths; it is not a deadline-based feature cut.

| Overall | Candidate | Developer rule legibility | Visible external effect | Cloudflare fit | Full build cost |
|---|---|---|---|---|---|
| 1 | Rollout of a Worker between exact versions | 1: familiar sign-off, check, freeze and rollback rules | 1: a request returns a different version | 1: existing versions and traffic controls | 2: substantial adapter, observation and recovery work |
| 2 | Production access requests | 2: requester, approver, purpose, duration and revocation are clear | 2: a real request changes from denied to allowed, then denied again | 2: identity and application access controls already exist | 4: identity mapping, least privilege, live-session revocation and emergency recovery make this the highest-risk integration |
| 3 | Simple case management | 3: assign, investigate, respond and close are easy to read | 3: a real response can be delivered outside the room | 3: Workers and Workflows fit durable delivery and waiting | 3: case lifecycle, duplicate delivery, attachments and ordinary business requirements require application work beyond today's steps |
| 4 | Shared tool lending | 4: borrow, return and one current borrower are intuitive, but the developer connection is weaker | 4: a board entry does not prove a physical handover | 4: hosted record and UI fit, but physical verification adds little platform-specific value | 1: the smallest external adapter burden when both people confirm handover; actual physical custody still relies on those observers |

**Sources.** Workers can upload a version without deploying it, then
deploy an uploaded version and choose its traffic percentage. A normal
deployment command can immediately send all traffic to a new version, so
an adapter must deliberately use the separate controls. Connected
resources are not necessarily covered by the Worker's version.
[Deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/).
Gradual deployment can split traffic between versions; successive
requests may reach different versions. Durable Objects have a different
deployment model because each object runs one version at a time.
[Gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/).

Production access is a credible alternative: Cloudflare supports requests
with purpose justification and approver-granted temporary access, for up
to 24 hours. This is an existing provider feature, not an Artroom feature.
[Temporary authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/temporary-auth/).
Revoking a session is distinct from preventing a new one; unchanged
authorization can permit another session.
[Session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).
Workflows support persisted steps, retries and waiting for external
events. That is useful infrastructure for case delivery, but does not
itself establish that a recipient received or accepted a response.
[Workflows](https://developers.cloudflare.com/workflows/).

**Strongest objection to rollout.** It can look like another software
release interface rather than a distinct application. Its additional
proof is the boundary between an approved plan and the service actually
running it. If the demonstration only changes a file, rollout adds no
external-effect proof beyond the code room and should stay deferred.

Production access survives as the second candidate because its authority
boundary is sharper. It loses first place because a reassuring board
without real credential and session expiry would be actively misleading.
Case management survives as a broader business example, but a merely
renamed proposal does not implement assignment, reassignment, response and
closure. Tool lending is dropped from the leading set: its simplest
implementation demonstrates a record, while its important outside fact
remains physical custody.

The full D1 work-item lifecycle remains owed and unadopted: filing,
conditions, performer acceptance, reassignment, decline, withdrawal,
cancellation, completion without landing, result acceptance/rejection,
closure and replacement. Existing `open` takes a hold and `release` does
not retire an item. A case-room estimate must include these distinctions
or an explicit application implementation of them; none is waived here.
Source: `notes/2026-10-02-acts-review.md:461`–`:510`.

## Q10. Leave the chosen rulebook open

**Judgment: Q9 defers selection, so the chosen twelve-line rulebook/appendix stays open.** The following unadopted candidate map identifies what a rollout build would need; it is not a new API or delivered application.

| Candidate requirement | Act/policy/step mapping and unsupported work |
|---|---|
| One service's exact plan | Current `claim`/workspace; proposed `plan-release` → `open`, `service` segment and `releases/{service}/**`. Fixed lifetime template scope is stage 4. Application files/checker must validate provider version IDs and traffic proportions. |
| One holder with fresh authority | Current lease/fencing; proposed `take-release` → `take` with exclusive hold. New declared conflict/fixed-scope settings are stage 4. Room lease expiry does not revoke provider credentials. |
| Reviewable exact version | Current `propose`; `propose-release` → `version`. Declared admission/replay/generic access remain stages 2/3/5. |
| Independent sign-off | `review`, `require` with `allowSelf: false`; `approve-release` → `review`. Eligible independent member/agent/admin, not proof of competence or provider authority. |
| Plan validation | Checker plus required check; `validate-release` → `check`. Application code validates content; automated declared jobs need stage 4 binding/kind support. Live health is volatile evidence. |
| Reassess changed plans | Generation binding and `carry`; disable reuse or narrow it on recorded inputs. No timeless reuse of arbitrary health observations. |
| Effective desired plan | `land`; `adopt-release` → `land`. Confirms repository publication, not a Worker deployment or current traffic. |
| Time freeze | `refuse`/`land` on supplied facts, with a specified application time/observation mechanism. Policy has no live clock/I/O; submitted time cannot prove an autonomous calendar window. |
| Execute, confirm, recover | Application adapter with its own scoped external authority; `report-release` → `comment` can record attributable observations. Exact execution, durable retries, read-back, competing writers, unknown outcomes and credentials require application code. |
| Roll back traffic | New reviewed plan and landing request an earlier version. History remains; already-served requests, database writes and incompatible migrations are not undone. |

Sources: `packages/contract/src/declarations.ts:7,79,85,102,142,159`; `packages/contract/src/policy.ts:59,204`; J:97–109; `notes/2026-10-03-planner-direction.md:21,34`. Q6 explains the fixed-step boundary; Q11 distinguishes recorded reports from provider proof. All unsupported application work remains owed.

## Q11. Each room's proof, counterexample and trust boundary

This is the authoritative room-boundary table for Q6–Q10. **Existing source**, **planned application** and **candidate** distinguish delivery from judgment; no new live workflow or application benchmark was run for this research. Historical decisions can remain while current standing changes. Same-prefix replay of recorded observations is distinct from independently establishing outside truth.

| Room and distinct proof | Counterexample to overbroad H3/H6 | Readiness, assumptions and trust boundary |
|---|---|---|
| **Code, existing legacy source:** exact concurrent versions, evidence across changes and publication recovery | Approval stays in history after a relevant edit/key compromise makes it stop counting. Another provider-authorized writer changes canonical state; a rulebook cannot eliminate that authority. A signed check need not judge code correctly. | Correct platform/projection, retained versions/inputs, qualified principals, Git/checker/provider/operator trust and canonical single-writer assumption are required. Room coordinates acts, leases, pins, obligations and outcomes; adapters supply Git/check work. Declared admission/replay/generic clients remain unfinished. Current UI entry is a mock; full transition/effect verification is limited (F4). Source: Room README:63–72,108–127; P:850–852,1179–1213; A:461–510. |
| **Jam, planned:** non-code commitments, handover and timed effects alongside ordinary live playing | A late listener plays a change late despite the same recorded effect bar. Neither sound engine nor live clock appears by replacing policy. Latest song settings or listener arrival time cannot reconstruct past scheduling. | Requires retained count-in origin, exact tempo/lookahead/song history, platform times and application scheduling/rendering/live transport. Musical timing/audio/agent spikes and full harness are untested here; stage-4 primitives/check jobs remain owed. Builder's concrete first development task is not ready pending 2/3/5, separately from a complete musical session. No extra gate follows. Sources: J:11–19,84–109,143–199,147–176,266–279,390–395,435–455,507–518,607–637; planner direction:21–41. |
| **Rollout, leading deferred candidate:** an effective plan causing an observed effect outside the room | Approved 10% plan times out; the provider may have applied 10%, 0% or another change. Later provider administration/rollback changes traffic while old approval remains. Provider credentials and reconciliation are not a rulebook. | No Artroom adapter/freeze mechanism is established. Application must use scoped authority, execute exact versions/split, persist/reconcile unknown replies and record bounded read-back. Replay reproduces decisions/reports, not every historical request's routing. One version response proves that response, not the statistical split. Read back configuration and separate sampled observations. Use a stateless Worker for a precise first example; retain Durable Object migrations, dependencies, competing writers and irreversible side effects in full scope (F10). |
| **Production access, alternative candidate:** qualified, bounded authorization with observable enforcement | Room lease ends while provider session still accepts requests; historical approval does not prove grant/revocation. An outside administrator can bypass the adapter. | No application integration is established. Requires real identity/resource mapping, provisioning authority, trusted clock/expiry, session reconciliation and private credentials. No per-fact visibility guarantee follows (F11). |
| **Case management, alternative candidate:** distinct assignment, response and requester acceptance | Recorded response is not delivery or customer satisfaction. Closure followed by reopening changes status; holder release implements neither. | No working integration is established. Define lifecycle/actor/race rules, delivery and file/application projection; complete D1 authority/conditions/withdrawal/closure scope remains owed and unadopted (A:461–510). |
| **Tool lending, dropped from leading set:** attributable borrower/lender confirmations | Recorded return leaves the tool with the borrower. Record agreement is not physical custody. | Requires application holds/confirmation and trusted human observation; no working custody integration is established. |
| **Chess, boundary control:** refused/legal attempts in history determine a game position | Artroom declarations alone cannot calculate legal moves; native application and pinned engine do. Another prefix shows another valid position. | Local source/three tests support the narrow refusal/no-game-effect example. Service/browser JavaScript and one local POSIX writer are trusted; OS lock does not fence independent clones/admins. Public exposure, multi-host failover, full chess correctness and generalized Artroom runtime are not proved. Sources: C:191–225,388–432; CA:24–40,73–101. |

If rollout only changes a file, it adds no outside-effect proof beyond code and should remain deferred. Current hosting capability is factual, application readiness is not: gradual deployments can split versions, uploads can remain undeployed, requests can have version skew and Durable Objects follow a different model. [Gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/) (checked 2026-10-03, body lines 590,621–634,677–692); F10/F11 identify the other primary sources. Candidate selection and demonstration remain research judgments, independent of builder-owned jam readiness.

## Q12. What can be shown for developer experience

**Judgment: sharpen H5 to reusable coordination and inspectable reasons.** Agents can write application code, but developers still need confidence in what took effect. The platform supplies shared authority checks, safe retries, explainable refusals and replayable policy decisions; the application author still defines and tests the business meaning.

Five alternatives were considered. “Less code” survives as a bounded literal source-size observation, and loses as a measured total-cost claim. “A refusal makes an agent correct itself” loses as a causal claim without a recovery trial; a reason/fix is a capability an agent can use. “Confidence and audit” survives when the proof boundary is explicit. “The platform owns all application meaning and readership” loses: a wrong business rule can be applied consistently, clients have contracts, and Artroom has no per-fact visibility guarantee. “Reusable coordination” survives as the strongest secondary explanation because authority, retry and recorded-reason machinery need not be recreated for every application.

The following evidence can be inspected or demonstrated at the pinned Artroom baseline. Reading a test establishes its assertion and mechanism; it does not mean this research reran it or measured a user outcome.

| Evidence and exact location | What it establishes | Limit |
|---|---|---|
| `packages/client/test/room.test.ts:37–53`; CLI README:95–106; MCP README:19–31 | Structured refusal with rule, reason, fix and recorded explanation; caller can treat the result as a value | Client tests use a fake HTTPS room. A useful fix does not establish successful agent self-correction or every refusal's quality. |
| `packages/client/test/room.test.ts:99–142`; actual Room `test/workerd/admission.test.ts:148–188` | Lost/partial-answer retry keeps the original signed act/key, yields one record, rejects changed content | Local fixture assertions; bearer retry still requires valid transport authorization. They do not prove provider success. |
| `packages/room/src/reads.ts:268–294` | Explanation returns the stored entry, receipt decisions, invariant facts and publication status | Present proposal evidence can have changed standing; the original receipt stays historical. |
| `packages/log/src/verify.ts:421–454`; `test/tamper.test.ts:82–105` | Retained policy decisions are replayed; wrong decision/input/authority controls exist | Current proof limits at verify.ts:181–184 exclude re-deriving all lane, lease, obligation and landing transitions or receipt effects, room-clock truth, and absence of unpublished acts. |
| `packages/cli/README.md:7–34,109–115`; `packages/client/README.md:76–85` | Invitation/key or room-custody setup, generated agent instructions and durable original-act retry journal | Existing invitation is the starting point. Full bootstrap/import/admin flow and generic declared discovery still need work. |
| `packages/room/measure/results/spike-smoke-2026-10-03T03-35-10-310Z.json` | Dated deployed legacy run has 91 successful steps: founding/import, workspaces, pinned proposals, an obligation-open refusal, dispatched machine check, independent review, confirmed canonical landing and published-log verification; cleanup is reported complete | Deployed source is `0753d7de`, Room `6d15d828`, checker `c18342a3`, identified in deploy-spike.md:1215. This is a retained run, not a fresh run by this research or proof of current main/declared runtime/full concurrent-agent scale. Its verifier reports the limits above. |
| `packages/contract/examples/demo-loop.ts:2–11,41–56` | A compiled example sketches adapters and the interaction contract | Explicitly never run; signer, runner, push and tool adapters are placeholders. Do not present it as an executed end-to-end application. |

The dated dap experiments are source evidence for authoring responsibility, not an Artroom visibility promise or a controlled claim about all developers. The repository is pinned to `9d738e2e71b84ec85cd321bd4d87623ea3fad355`; the T1 declaration candidate is `22444f8536a8932fc758d77bb614a1424635fec3`.

| Dated experiment | Exact evidence | Result and its implication |
|---|---|---|
| Handwritten Sale | `spike/REPORT.md:74–85`; `spike/manifests/sale.ledger.md:268–285`; original source `009b5226bd77b9f9d5e7ccad70b39867ef3d1a41` | Seven recorded fixes, six semantic, against a two-fix budget; zero added kinds. The final bounded tests pass at the repaired source, but the overrun remains. |
| Handwritten Booking | Same report:77; `booking.ledger.md:9–13,265–275`; original source `127af627529362c66e4944ce0418913f1f31f3ed` | Two model fixes fit the budget, with separate foundation work. Revised client disclosure contracts and hostile-payload detection still have bounded coverage. |
| Club | Report:78,183–194; `spike/test/club.test.ts:265–283`; original evidence `772a514a08c2fac72fe534c8490c8d33a3e1c2d1` | A second admission after membership is effective while checker comparisons agree; the original business-policy assertion fails. An executing TODO or narrower green campaign must not be described as passing that policy. |
| T1 declaration layer | `spike/lang/REPORT.md:3–71`; `spike/lang/test/stop.test.ts:20–35` | Accepted Sale fails five campaign seeds with 81 independent privacy findings. At the retained refused-terms witness, an unrelated party reads the payload while generated checking is clean. Deriving checker and enforcement from the same mistaken declaration does not independently validate it. This is a negative candidate result, not a claim that every declaration language fails. |
| Literal T1 size | Same report:130–170; immutable candidate files independently counted | Sale declaration: 50 lines/6,585 bytes versus handwritten 389/19,308. Booking: 35/5,585 versus 337/15,232. Emitted Sale is 1,748/48,667; Booking 1,308/40,666. Shared compiler/runtime/schema/split builder also require work, and declarations have dense lines. These counts establish no measured authoring-cost improvement. |
| Client/host/application separation | `spike/src/script.ts:28–51,84–125,195–225`; directions of 2026-09-18:374–377,658–659,732–752 | Capable clients perform disclosures and grants separately; the model cannot emit them itself. The directions explicitly acknowledge the Club business guard and the partial-view experiment's limited domain. Arbitrary client behavior, external systems, lifecycle and general composition are not established. |

Sale, Booking and Club received progressively more examples (`spike/REPORT.md:240–246`); they were not equal independent authoring trials. Historical author ledgers omit parts of total specification, review, adaptation and operations effort. Later local ordering and obligation experiments address different boundaries and do not erase the authoring failures or prove a production host. The T1 fresh-agent, notation and total-cost trials remain uncommissioned in its report.

The strongest objection to H5 is concrete: the platform can preserve agreement while the application enforces the wrong business policy. The narrow positive claim survives because reusable authority, retry and recorded-reason machinery is inspectable. Cold newcomer comprehension, time-to-first-success, total effort saved and an agent's successful recovery after a refusal remain unmeasured. Q13 turns those into an experience to establish without claiming it already happened.

## Q13. What the first five minutes should establish

**Judgment.** Use the plan's install/import/invite/connect path to get to
one real refusal and one real, explainable approval quickly. The value is
that a newcomer can see who may act, which exact version is being judged,
and what to do when something cannot take effect. Merely watching
several agents produce code does not establish H5.

| Elapsed time | Experience to establish | Current evidence and concrete gap |
|---|---|---|
| 0:00–1:00 | Open a usable room, identify the user and see the local rulebook | The plan's `npm create artroom@latest` account deployment is a target. No corresponding create command/package is established in this source inventory. A usable public starter URL and published installation path need independent evidence; this research does not claim no deployment exists anywhere. |
| 1:00–2:00 | Bring a small repository in or choose a clearly labelled sample | No current `artroom import` command appears in CLI help. A real founding/import API does exist, requiring an authorized signed onboarding grant for imported repositories. Operator setup must become an understandable user path rather than hidden manual work. |
| 2:00–3:00 | Invite a person and an agent; see their actual roles and connect the agent | Current login/redemption, generated `AGENTS.md` and MCP setup exist. CLI help has no invite command, so the admin path needs a supported front door. Main exposes the legacy ten-tool MCP interface; generic declaration discovery is unfinished. Do not promise one generic interface as already deployed. |
| 3:00–4:00 | See two actual agents' overlapping intentions and a refusal with a fix | Claim, overlap, attention, explain and refusal data exist in the current source. The default browser page instead creates `MockRoom`. Wire and validate the real identity and live adapter before presenting that view as a live workflow. |
| 4:00–5:00 | Review an exact proposal; edit a relevant input and see why evidence counts or becomes stale | The four screens and mock example exist. The live adapter currently has no diff/interdiff, no active policy document/dry run, unknown main and incomplete publication-slot knowledge. Complete the needed reads and connection, or explicitly show supported real CLI/API output rather than suggesting those missing views are live. |

**Sources.** The original plan §12 is at
`notes/2026-10-01-artroom-plan.md:974`. Current CLI commands are
`packages/cli/src/main.ts:78`; joining, credentials and agent setup are
in `packages/cli/README.md:7` and `:109`. Current client `connect()` does
exist (`packages/client/src/index.ts:14`), so the UI README's older
absence claim is not a current source fact. Founding and signed imports
are `packages/room/src/founding.ts:179`. The UI entry point creates only
the mock (`packages/ui/src/main.tsx:22`); four screens are listed in
`packages/ui/README.md:5`. Actual live limitations are
`packages/ui/src/room/live/live-room.ts:123`, `:131`, `:185` and `:224`.

**Untested.** This is a first-use target, not a measured five-minute
onboarding result. The plan explicitly labels its performance numbers
as targets until the specified workload is reported. A claim benchmark
with 100 simulated agents is not evidence of 100 concurrent coding
workflows. Relevant timings need workload, location, count, cold/warm
state, retries and cost; do not promote the plan's p50/p99 thresholds to
achieved behaviour. This research ran no user study or fresh benchmark.

## Q14. Rough eight-minute cut, with the code room doing the work

**Source.** The official submission deadline is **2026-10-14 at 11:59 PM
PDT**; October 13 is the project's earlier target. The rules require a
5–10 minute demonstration, source under an allowed permissive license,
running instructions, Workers and Artifacts, and multiple agents working
concurrently. Judges weight prototype originality/quality **50%**,
concurrency/coordination/context/review/conflict **25%**, and ease of
use/experience **25%**. Ties favor the first criterion.
[Official competition rules](https://www.cloudflare.com/documents/build-next-gen-git-platform-competition-terms.pdf),
§§2, 4 and 6, checked 2026-10-03.

**Judgment.** Use a concrete software situation first, expose the shared
record within the first minute, and spend most of the demonstration on
actual coordinated work. This is a rough allocation, not a script or
asset commission. Scoring weights are not literal minute quotas: the
same successful workflow can establish quality, coordination and ease
of use together.

| Time | Purpose and required evidence |
|---|---|
| 0:00–0:30 | Establish a developer's concrete problem: two agents change related code and a person must know which decision counts. |
| 0:30–1:00 | Identify the room's rulebook, signed record and board, and name the record/state guarantee with its boundary. |
| 1:00–2:00 | Show the supported starting and joining path, the agent connection and a person's attention queue. If setup is shortened, identify the preparation rather than claiming instantaneous install. |
| 2:00–4:30 | Demonstrate two real agents working concurrently: claims, overlapping intent, a refusal with its fix, workspace changes and pinned proposals. |
| 4:30–5:30 | Demonstrate independent review, a relevant edit, stale or carried evidence with a reason, and one actual landing outcome. |
| 5:30–6:15 | Reconstruct one decision from recorded inputs; show the actual canonical outcome and distinguish local decision, publication and external observation. |
| 6:15–7:00 | Show jam's distinctive timed commitment only if it is built and tested. Otherwise use these 45 seconds for another genuine code-room recovery case and identify jam as planned, not a worked proof. |
| 7:00–7:30 | Show a confirmed rollout effect only if the candidate has been built and selected. With today's deferral, give these 30 seconds to the code room's publication/retry evidence. |
| 7:30–8:00 | Show how a newcomer can try the supported version and what remains to be built or measured. |

For a five-minute cut, shorten the introductory explanation and remove
unbuilt side-example segments; retain concurrent work, exact-head review,
an outcome and the supported start path. For a ten-minute cut, add a
second failure/recovery case and more observable setup or a demonstrated
external effect. Those are changes to editorial emphasis, not application
scope. Do not spend a quarter of the film on abstract platform parts
merely because the infrastructure audience is secondary.

## Q15. Decisions needed before outlining assets

**Judgment.** The round must settle the following in the independently
reviewed research and subsequent approved positioning design note before
website or presentation assets are outlined:

1. The developer's first concrete problem, and whether software-first
   remains the lead. A second infrastructure track is not justified by
   these questions; the infrastructure explanation can follow the worked
   code-room result.
2. The supported meaning of H3/H6: historical decisions stay in the
   record; current standing is computed under the relevant history and
   rules; a provider's state and an application's live effects need their
   own evidence. H3 remains verbatim in the research; do not silently
   replace it with a broader or narrower sentence.
3. The selected terms for the shared picture, after the other questions
   test them. Presentation uses “takes effect,” the integrity of the
   record and consistency of the state; internal source vocabulary does
   not become unexplained product copy.
4. A code-room demonstration whose source, deployed version, actual
   participants, results and limitations are identified. Choose which
   live views are supported and which are labelled examples.
5. Whether a middle room is selected, rejected or deferred, and why.
   Today this research recommends deferral with rollout leading. A
   chosen appendix is optional; rollout can still be built before
   submission if time permits.
6. Whether jam has working evidence for the specific claim that will be
   shown. Its development priority and builder's concrete readiness
   judgment continue independently of assets.
7. Whether the paving image communicates retained history without
   promising unchanged current standing or universal external control.
   The other research questions must decide this; it is not an image
   generation request.
8. The first-use path, accurate call to action, truthful timing evidence,
   and the rough cut. Product names/comparisons and visibility must stay
   within the approved presentation constraints; original audio and other
   asset ownership must follow the project's own rules.

The unresolved UI and external-adapter findings are work to track, not
new platform/jam start conditions or requirements for a vocabulary
freeze, cleared backlog, finished seven-stage fixture or another Hugh
approval. Admission implementation and review remain first priority.

## Judgments on H1–H8

These are research verdicts, with proposed wording for each sharpened hypothesis. They do not adopt a positioning design.

| Hypothesis | Verdict, wording and reason |
|---|---|
| H1: audience | **Sharpened:** “Start with developers who need people and agents to coordinate code; explain the operating boundary to infrastructure builders in the same story.” The official task supports this order, but judge demographics and conversion/comprehension were not measured. |
| H2: platform first | **Rejected as the recommended opening order:** software first gives a task/result sooner; expose the platform within sixty seconds so its ambition survives. Platform-first remains a viable test alternative with the cost in Q1. |
| H3: one-sentence claim | **Sharpened:** “The room preserves what was decided; participants using the same recorded history and rules can compute what counts now.” Add the supported projection/retained-input condition and separate provider observations. Original H3 remains verbatim in Q3; its unqualified permanence and universal-truth reading fail concrete counterexamples. |
| H4: two words | **Sharpened:** “The integrity of the signed record; the consistency of state computed from the same history, rules and inputs.” Keep plain examples alongside the labels, because integrity is not truth and consistency is not instantaneous global or provider agreement. |
| H5: developer experience | **Sharpened:** “Agents can write application code, but developers still need confidence in what took effect. The platform supplies shared authority checks, safe retries, explainable refusals and replayable policy decisions; the application author still defines and tests business meaning.” The broad cost shift and automatic self-correction claims are unmeasured; the Club/T1 counterexamples prohibit equating agreement with correctness. |
| H6: rulebook, record, board | **Sharpened:** “A room has rules, a record and a board. Fixed platform rules and the room's rules judge actions; the board shows what follows from the retained record at a stated point. Declarations choose within fixed steps; application code and adapters supply other work.” Reject rulebook-only arbitrary application generation and repair the software shorthand in Q6. |
| H7: three rooms | **Sharpened:** “Choose rooms for different proofs: code for exact concurrent work, jam for non-code timed commitments, and a built middle application for observed outside effects.” Light-to-heavy is not a reliable build-cost order. Defer the middle choice with rollout leading; preserve pre-submission rollout-if-time permission and all eventual functionality. |
| H8: paving | **Sharpened:** “The record is laid one entry at a time; later entries can change current state without removing the past.” A brick includes recorded refusals/system observations, not only effective actor acts. Keep paving for history only; a signed logbook beside a status board better covers current standing and unknown effects. Visual choice remains open. |

## The three weakest parts, ranked

1. **The guarantee and rulebook-only inference outrun their conditions.** H3/H6 can imply unchanged current eligibility, arbitrary application semantics and provider truth. This affects trust in every example. Q3 gives falsifiers and assumptions; Q6 inventories every rule/step and Q11 keeps decision, standing and outside observation distinct.
2. **The cost and self-correction argument lacks the required evidence.** Club's unrepaired business guard shows that shared agreement is not business correctness; it does not show a recorded non-visibility repair. The original repair-class finding does not establish broader authoring costs. The declaration candidate also fails an independent check, and literal size is not total effort saved. Keep Q12's bounded mechanisms and negative results.
3. **The first-use and three-room story are ahead of working proof.** Bootstrap/import/admin/UI connection, cold newcomer comprehension, jam timing and a real middle-room adapter remain concrete gaps. A mock board and renamed acts cannot demonstrate them. Q13 names the current source gaps and Q14 reserves most time for actual code work. These are work to complete, not new jam-start conditions or scope cuts.

## Sourced facts used

Artroom references mean approved baseline `344656705140d9bf6539fe44de889d1e21dd2482`, except explicit dated deployments/separate repositories. Specifications state contracts; source, tests and observations establish their named bounds. The judgments above are separate.

- **F1. Competition and plan.** [Plan](2026-10-01-artroom-plan.md), §§1,12,13, retains full scope and planned ease/scale. Deadline **2026-10-14,11:59 PM PDT**, earlier project aim October 13; required video **5–10 minutes**, licensed source/run instructions, Workers/Artifacts and concurrent agents; weights **50/25/25**, first criterion breaks ties. Q14 uses these checked facts. [Official rules §§2/4/6](https://www.cloudflare.com/documents/build-next-gen-git-platform-competition-terms.pdf), [announcement](https://blog.cloudflare.com/next-git-platform-on-cloudflare/), checked 2026-10-03.
- **F2. Acts and fixed rules.** [Protocol](../docs/protocol.md) R-ADM/IDEM/LANE/PROP/OBL/ADMIN/POL/LOG and Room admission.ts:486–559; Q6 covers all **247 rules/24 families**, **nine** steps, **five** policy kinds, seven software acts plus renew/roster and all non-act paths. This is source inventory, not fresh rule-by-rule runtime validation.
- **F3. Standing and outcomes.** Protocol R-LAND/PUB/REV and Q6 separate request, reservation and confirmed/unresolved outcome, and historical approval from present eligibility. Pinned heads stay fixed; authorized publisher `force-with-lease` exists. Q11 applies these limits per room.
- **F4. Replay.** [Log verification](../packages/log/README.md), “Verification”; verify.ts:176–185,421–454. Checks available published prefix and retained policy decisions; cannot derive every lane/lease/obligation/landing transition or receipt effect, establish unpublished acts or prove room-clock truth. Fuller declared replay remains owed.
- **F5. Jam/delivery.** [Jam](2026-10-01-jam-room.md), approved rev5, and [direction](2026-10-03-planner-direction.md):21–41,65; protocol:4284–4304. Stage-1 contract/data/validators are delivered, later runtime/replay/access/fixtures owed. Q11 lists concrete readiness and musical/live/historical-input limits; no fresh jam result is claimed.
- **F6. Developer surfaces.** Exact client/CLI/Room/UI sources are in Q12/Q13. Four screens exist but main.tsx:22 constructs MockRoom; LiveRoom/client connect() exist with the listed live read gaps. CLI lacks create/import/admin-invite; founding.ts:179–214 supplies a signed import API. This does not assert absence of every deployment/package.
- **F7. Deployed legacy evidence.** [Deployment spike](deploy-spike.md):1213–1219 and [smoke JSON](../packages/room/measure/results/spike-smoke-2026-10-03T03-35-10-310Z.json): source `0753d7de`, Room `6d15d828`, checker `c18342a3`, **91** successful steps and cleanup complete. Q12 names the observations; F4's verifier limits remain. No fresh provider execution occurred here.
- **F8. Workload limits.** [Room-core spike](2026-10-01-spike-room-core.md) and [sandbox-Git spike](2026-10-01-spike-sandbox-git.md) are unchanged dated warm/cold evidence, not current full-workflow targets. Plan §12 targets: 10 concurrent full workflows, act p50 ≤300 ms/p99 ≤1 s; overlap ≤300 ms; workspace p50 ≤5 s; preview p50 ≤10 s; ≥10 disjoint ready landings/minute; UI update after an act ≤1 s; 100 simulated agents/1,000 claims with a gapless log/no lost update, **not** 100 coding workflows; zero approvals spent on already-known conflicting heads in controlled recut, with waiting/throughput. Reports need workload/location/counts/retries/cold-warm/fork time/Artifacts-container cost. Q13 treats these as targets until matching reports exist.
- **F9. Authoring/correctness.** dap `9d738e2e71b84ec85cd321bd4d87623ea3fad355`, spike/REPORT.md:74–90,183–221,240–246; 2026-09-18 directions:374–377,658–659,732–752. T1 `22444f8536a8932fc758d77bb614a1424635fec3`, spike/lang/REPORT.md:3–71,130–170. Q12 preserves model identities, negative results, counts and unequal trials. Immutable files were checked; historical campaigns were not rerun.
- **F10. Rollout hosting.** [Workers versions/deployments](https://developers.cloudflare.com/workers/versions-and-deployments/) and [gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/), checked 2026-10-03: separate version upload/deployment, traffic percentages, connected-resource limits, version skew and different Durable Object behavior. Q9–Q11 use provider capability, not a proven Artroom adapter.
- **F11. Other hosting.** [Temporary authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/temporary-auth/) supports purpose/approval and ≤24-hour access; [session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/) separates session termination from preventing new sessions; [Workflows](https://developers.cloudflare.com/workflows/) persists steps/retries/external-event waits. Checked 2026-10-03; none establishes an Artroom identity/revocation/delivery integration.
- **F12. Chess.** gitseq-chess `b97c6a82ef7e3618721696f5a69efef13da10a79`, chess.go:191–225,388–432; docs/reference/architecture.md:24–40,73–101. Native move engine/local source and Q6's **three** tests support bounded legality/refusal checks, not public deployment, multi-host failover or Artroom declaration-based chess.

Internal repositories F9/F12 are `/Users/hughpyle/play/dap` and `/Users/hughpyle/play/gitseq-chess`. Their exact identities/paths are research provenance under the approved naming exception, not asset names.

## What this round could not settle

- **Audience and word comprehension:** no unaided developer/operator/newcomer comparison of the two openings, candidate claims or images was conducted. Editorial survivors remain hypotheses.
- **General authoring economics:** the experiments lack equal fresh-agent trials and complete effort/cost accounting. They do not settle which segments spend more on certainty than code, or how much shared machinery saves overall.
- **Agent recovery:** refusal/retry mechanisms and assertions exist; no causal success rate for an agent following a fix or a cold five-minute experience was measured.
- **Complete current/deployed general platform behavior:** approved main and dated legacy deployments do not establish unfinished declared stages, arbitrary applications, every rule's implementation, complete full-state replay, or every provider failure path.
- **Jam evidence:** musical/live timing, audio quality, agent collaboration and the full historical replay harness need their own results. Their absence here does not change builder's concrete readiness authority.
- **Middle-room selection and implementation:** rollout leads the ranking, but no working inspected candidate supplies its external-effect proof. Freeze/clock, provider writers, unknown answers and recovery are application work; selection stays deferred and pre-submission rollout permission stays intact.
- **Final demonstration and call to action:** exact participants, connected UI/setup, source/deployed identities, shown outcome, owned original media and measured timings must be established before a positioning design can choose assets. The allocation in Q14 is a rough cut, not a script.

## Validation of this research note

This is a note-only change in an isolated request worktree based on the approved baseline above. The full Q1–Q15 and H1–H8 inventory, commissioned numerical breadth, source identities, name/visibility/comparison limits, per-room counterexamples and full-scope/readiness boundaries were checked. The protocol inventory independently counts 247 unique rules across 24 families. Exact source identities, excerpt ranges and immutable evidence were checked. Primary competition/hosting documentation was rechecked on 2026-10-03. The research used source reads and retained results; apart from the three narrow local chess tests described in Q6, it performed no new application benchmark or provider execution. No runtime test suite is needed for this note-only implementation; the exact final research head still requires another actor's Architecture/Security/Simplification review and landing through gitseq.
