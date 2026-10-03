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

Source shorthand in Q6–Q8: P = `docs/protocol.md`; A = `notes/2026-10-02-acts-review.md`, revision 4; J = `notes/2026-10-01-jam-room.md`, revision 5, all at the Artroom baseline named above. C = `chess.go` and CA = `docs/reference/architecture.md` in `github.com/generalbusiness-ai/gitseq-chess` at `b97c6a82ef7e3618721696f5a69efef13da10a79`. Source line ranges identify evidence rather than presentation wording.

**Judgment: sharpen H6.** Rules, a retained record, and a current board are a useful explanation. The strong claim that changing only the room's rulebook yields an arbitrary new application fails the breadth test. Room declarations select from fixed, versioned platform steps; policy can refuse, require evidence, narrow carrying, block landing, or notify. Neither mechanism provides arbitrary application state transitions, an audio engine, a deployment adapter, or a new provider guarantee. That boundary is a strength if stated clearly: the application supplies its business code while the platform supplies common guards and recorded decisions. It becomes a misleading promise if those two responsibilities are merged.

**Sharpened H6 wording, for hypothesis evaluation:** A room has rules, a record and a board. The platform checks actions using its fixed rules and the room's rules in force, and records decisions and later outcomes. The board shows what follows from that record at a stated point. Declarations choose names, fields and permissions within the platform's steps; application code and adapters supply work those steps do not perform.

This costs more words than the original. The shorter explanation can introduce the three objects first, but must retain the application-code and external-effect boundary when claiming generality. The rulebook should not be drawn as solely a file owned by the room: recovery, signatures, custody, evaluation limits, historical binding and publication are platform rules the application cannot repeal.

### Alternatives considered

| Explanation | Disposition and cost |
|---|---|
| Change only the rulebook and get any application | Reject. Neither the fixed steps nor the supplied policy input contains an arbitrary application fold or external-effect implementation. Chess is a concrete counterexample to the claimed mechanism. |
| Three parts, with platform rules and application code explicit | Keep. Best compact conceptual bridge, but requires one visible boundary around application code and outside systems. |
| Everything is a code-review workflow with renamed verbs | Reject as the general explanation. It erases the distinct musical live layer and the missing request/completion lifecycle; it makes typed declarations look like labels only. |
| A record plus any application fold | Keep as an architectural explanation of gitseq chess; do not equate it with the delivered Artroom declared-steps runtime. It shifts useful work to the application and raises version-retention and identity questions. |
| A complete programmable application host, including effects | Leave open as a possible future platform scope, not evidence from this snapshot. It would require new semantics, delivery and trust boundaries. This research adopts no API or design. |

### Every act and non-act path

The current admission dispatch is explicitly `claim`, `propose`, `note`, `review`, `check`, `land`, `release`, `renew`, and `roster` (`packages/room/src/admission.ts:486–505`). The code-review declarations are delivered as data, not used by that dispatch (`packages/policy/src/codereview.ts:23–74`). `recover` is a proposed platform path for v2, not a tenth delivered legacy act. The following table covers all these paths and the paths that the three-part picture tends to hide.

| Path | What the record/board picture explains | What room rules alone do not supply; delivery boundary | Source |
|---|---|---|---|
| `claim`, opening | Attributed holder, scope, generation and lease | A held resource lane is not an unheld issue, an addressed request, or a promise accepting another actor's conditions. Current legacy code supplies the transition; v2 `open`/`take` runtime is owed. | P:762–814; A:463–505; `admission.ts:487–488` |
| `claim`, rescope/takeover | A guarded change to a reusable resource hold | Release/expiry leaves a resource available; it does not say a work item is open, declined, satisfied or closed. Rescope's known `obligationsRecomputed: false` behavior is preserved by this steps version. | P:3546–3571, 3608–3634; A:471–505 |
| `propose` | An exact head, actual changed paths, obligations, retained versions and preview | A branch push is only preparation. Git reachability, diff bounds, pinning, integration and preview use platform code and provider access. No conversation closure or business effect follows merely from pushing. | P:837–926; `admission.ts:489–490` |
| `note` | Attributed commentary, entry or source-line anchor | Text cannot create a protected work-item transition by convention. Unanchored declared comments are owed, not a delivered legacy-note capability. | P:3590–3634, 4284–4304; `codereview.ts:42–48`; A:473–484 |
| `review` | A qualified judgment bound to exact version/head, retained as history | Qualification, self-review restrictions, actual authority and count are platform guards. A review is evidence for configured obligations, not every requester's acceptance or a universally authorized adoption. | P:875–926, 1290–1308; A:490–529 |
| `check` | Signed evidence tied to integration, checker configuration and observed runner inputs | The checker runs application/test code; the signature records a result, not independent proof that the code or provider told the truth. An obligation is a requirement; a check is evidence that may satisfy it. v2 job kind/binding routing is owed. | P:897–911, 985–1022, 2486–2648, 3914–3953 |
| `land` | A request for a guarded operation followed by reservation and later outcome | The operation is not complete merely because the request was accepted. Preparation can run in parallel; only publication is single-slot. External Git effects require adapters and outcome resolution. A landing is not every kind of work completion. | P:1047–1219; A:461–510; `core.ts:1340–1369` |
| `release` | Holder relinquishes a lease; history retains the handover note | It does not close or retire a work item, accept a result, or release an already reserved publication. Current code sets the lane to `unheld` and increases its lease generation. | P:799–814, 1136–1155; `admission.ts:1281–1308` |
| `renew` | Current holder extends a lease under platform authority | The platform clock and lease guards are not an arbitrary room policy or a business timer service. In v2 it remains a platform kind. | P:785–798, 3540–3544, 4147–4149 |
| `roster`, all ops | Versioned membership, invitations, role/team changes, key revocation, delegation, undelegation and recovery-key rotation | Authority floors, custody and emergency recovery are fixed. Admin/recovery roster acts intentionally bypass policy refusals; app rules are not the sole judge. | P:193–258, 406–449, 1290–1360; `admission.ts:331–389, 535–559` |
| v2 `recover` | A separately identified protected configuration-recovery workflow | Proposed platform kind, active admin's own key only, not a declaration that can be renamed or delegated. Legacy config-recovery behavior continues under v1. | P:3954–3990, 4154, 4297 |
| Signed unrecorded requests | Workspace operation/token and read session retrieval | These are explicitly not acts and leave no room-log entry for the request. Nonces, credentials and grants have an operational store/trust boundary outside a board derived only from effective acts. | P:578–631; `packages/room/src/requests.ts:1–93` |
| Invalid/unauthorized early submissions | Failure/refusal to the caller | Parse/signature/authority/body/secret failures are unrecorded; a claim that the log contains every attempted action is false. Runtime failure records nothing. Late deterministic refusals are recorded. | P:374–400, 455–491 |
| System events | Lease expiry, policy activation, obligation recomputation, carried evidence, preparation evaluation, reservation, abort attempt, unresolved publication, outcome, revert lane, notification and checkpoint | These are not actor-signed application acts. Room signatures and recorded observations are part of the record. `prepared` and `reservation-ended` are additions owed by declared stage 4. | P:1648–1663, 2457–2485, 4177–4191 |
| Reading, watch/subscribe, attention, waiting | Clients see a cursor/prefix and operation status | Same rules and same prefix can yield the same projection; disconnected clients need not have the same current prefix. A wait timeout does not cancel an operation. Attention delivery and provider results can lag. Generic v2 clients/catalogue are owed. | P:1828–1951, 4169, 4297–4303 |

`admission.ts` and `core.ts` in this table mean `packages/room/src/`; `codereview.ts` means `packages/policy/src/`.

### All fixed declared steps

These are the nine `artroom-steps-v1` primitives, not arbitrary code hooks. Declaration data can choose only the listed target/step combinations; the sole compound combination is `version` then `land` on a thread. Every step retains the platform's guards. Names and typed fields cannot add a transition the step does not perform. Source: P:3583–3634.

| Step | Expressible choice in room data | Still fixed or supplied elsewhere |
|---|---|---|
| `open` | Opening kind, roles, typed fields, fixed/template/body scope, lease/conflict/workspace settings | Opens a held resource thread. No unheld filing, business-object constructor, requester acceptance or arbitrary state update. |
| `take` | Which opening thread kinds are addressable | Guarded takeover or rescope; expected generation, lease, fixed-scope and reservation checks. No reassignment of an independent addressed conversation. |
| `version` | Application act name/fields/roles; policy obligations and refusals | Exact reachable Git head, bounded diff, scope, administrative configuration rule, pin, preview and generation. Application-specific validators/checkers supply content judgments. |
| `review` | Name/fields, permitted thread kinds and roles; configured principals/count | Exact-head binding, qualifying evidence and self-review floor. No automatic acceptance of every business condition. |
| `check` | Application check name and declared binding selected by job configuration | Check/result contract, author exclusion and runner evidence; service implementation and dispatch are code/deployment dependencies. |
| `land` | Name/fields and room gating rules | Code publication operation and global publication guards, not arbitrary side effects. Compound version/land cannot acquire an independent review inside the same act. |
| `release` | Name and optional declared metadata | Holder's resource release; reusable unheld thread, not item/conversation closure. |
| `hand-over` | Typed target member and opening-kind compatibility | Release plus reserved named takeover with recorded duration; not a general transferable business transaction. |
| `comment` | Typed signal/comment body; permitted anchor shapes | Records commentary/attention. Application rendering/timing or interpreting a typed signal is separate application code. |

All nine are delivered in stage-1 contract/data/validation form. The table does not assert that their declared runtime has landed. Existing analogous legacy behavior does not make new `hand-over`, fixed scopes, per-thread conflict/lease settings, unanchored comments or compound acts delivered. The exact stage map is P:4293–4304.

### All configurable rule kinds

| Rule kind | What room policy alone changes | Bound that remains |
|---|---|---|
| `refuse` | Add deterministic reasons and fixes over supplied act/actor/lane/proposal/room input | Cannot waive platform guards or introduce arbitrary effect code; admin/recovery exceptions are fixed. |
| `require` | Path-based review/check obligations, principal/count choices and conditional application | Configures evidence requirements, not a runner, reviewer, external service or new business-object state. |
| `carry` | Narrow whether otherwise eligible evidence carries | Cannot widen the platform's exact-input, global-input, revocation or runner/environment conditions. |
| `land` | Block at request or reservation evaluation based on supplied input | Cannot turn code landing into a general deployment or access-grant adapter; no live provider reads or trusted current clock in these inputs. |
| `notify` | Add attention targets and reason | Runs after commit, records its outcome later, never rewrites the act, and is not an arbitrary outbound webhook. |

Sources: P:1363–1466; `packages/contract/src/policy.ts:37–98, 204–266`; `packages/policy/src/profile.ts:10–29`; `packages/policy/src/evaluator.ts:64–80`. A freeze window is not justified merely by mentioning JSONata: the current `RuleInput` has no clock, randomness or I/O. An application/checker may attest a bounded external observation, or a future reviewed interface may supply it; an actor's body timestamp is not trusted current time. This is a missing implementation/trust choice for a rollout candidate, not a commission to add an API.

### Complete numbered-rule coverage

The inventory contains **247 distinct numbered rules in 24 families**. Every number is included below; amendments are read with earlier rules. The inclusive family ranges below enumerate every distinct numbered rule; the inventory was independently generated from the pinned protocol and checked against this table. The rows are grouped for comprehension, not a seven-act subset.

**Delivery notation:** **L** means the existing legacy protocol/source boundary, not fresh validation of every rule or provider effect. **D** means stage-1 declared contract/types/data/validator functions are present. **O** means additional declared runtime/replay/client/fixture behavior remains owed. Every L row retains the platform floor when the O amendments eventually become effective. None means deployed applications were tested in this research.

| Rules, inclusive | Record/board contribution | Room-rule-only boundary and delivery | Exact P source lines |
|---|---|---|---|
| R-ID-1–10 (10) | Stable entry/resource/operation/evidence identities | Fixed hash/sequence/name formats; declarations cannot replace identity arithmetic. L; declared names/bindings D/O. | 85–128; amendments 4132–4170 |
| R-SIG-1–6 (6) | Attributed, bounded, canonical signed intents | Cryptographic/domain/body guards are platform code; early failures are absent from record. L; v2 kind/binding/body extensions D/O. | 131–176; 4133–4136 |
| R-GEN-1–13 (13) | Founding identity, membership, invitations, recovery, canonical repository and registry | Room/operator/provider trust and authority floor cannot be inferred from a user field or repealed by policy. L; profile/declaration authority changes D/O. | 179–371; 4137–4139 |
| R-ADM-1–12 (12) | Atomic decision, exact authority, sealed receipts, recorded late refusals | Fixed validation order, room clock, recovery and custody; not every attempted act appears in log. L; v2 binding and `who` judgment O. | 374–517; 4140–4142 |
| R-IDEM-1–6 (6) | Same signed retry returns same committed outcome | Durable key/bytes lookup; a newly signed retry or different bytes is not equivalent. Unrecorded failures do not acquire a logged outcome. L. | 520–539 |
| R-CRED-1–11 (11) | Actor custody, delegated/bearer permissions and separated read/write access | Sessions, workspace retrieval and token secrets are not recorded acts; signer service/browser/operator are trust boundaries. L; binding-aware declared bearer/client paths O. | 549–708; 4143–4146 |
| R-WS-1–5 (5) | Workspace operation and public safe view | Provider fork/token operations, secret retrieval and revocation need operational code; board/log never includes token values. L; declaration workspace choice D/O. | 711–747; 3697–3715 |
| R-LANE-1–10 (10) | Reusable resource scope, holder, lease and generation | Resource hold is not request/conversation/completion; reservations and per-thread settings require fixed-step code. L; thread-kind/fixed-scope/hand-over runtime O. | 762–814; 4147–4149 |
| R-PATH-1–3 (3) | Deterministic scope/path match and conservative overlap | Fixed glob algorithm, not arbitrary business-key mutual exclusion. Declaration scope templates select inputs to it. L; templates O. | 817–836; 3660–3676 |
| R-PROP-1–7 (7) | Exact proposed head, actual bounded paths and preview | Git adapters/integration code; a push alone is not proposal. Pinned proposal head survives later fork force-push. L; declared `version` and witnesses O. | 837–872; 3608–3634; 4165–4166 |
| R-OBL-1–7 (7) | Exact qualifying review/check evidence and required/advisory status | Platform qualification, principal independence, count and check-input guards; policy configures requirements, does not produce evidence. L; declared job bindings O. | 875–926; 2634–2648; 4150 |
| R-CARRY-1–16 (16) | Retained history distinguished from evidence valid in a new generation | Fixed scope/global-input/policy/config/runner/snapshot conditions and sealed carry events; room policy only narrows. L; declared binding-aware jobs O. | 934–1022; 2457–2504; 2516–2583; 4163 |
| R-LAND-1–11 (11) | Guarded preparation, latest generation, reservation and recorded outcome | Serial publication is only part of parallel work; reservation fixes authorization and later loss of hold is not cancellation. Git/check adapters remain. L; declared compound act and prepared events O. | 1047–1163; 4151–4152 |
| R-PUB-1–10 (10) | One publication slot, complete-forward resolution and policy activation | Outside-ref observations and exclusive publisher assumption; token expiry alone does not prove an old push stopped. Authorized `force-with-lease` publication exists. L; application effects beyond Git require adapters. | 1166–1219 |
| R-REV-1–8 (8) | Later evidence invalidation, reopenings, emergency abort/revert history | Immutable historical admission is distinct from evidence currently counting. Retired/compromised are not interchangeable; after-reservation emergency boundary is fixed. L; declared revert thread vocabulary O. | 1222–1287; 4153 |
| R-ADMIN-1–9 (9) | Protected configuration change, flagged sole-admin exception and recovery | Application rulebook is not sole authority: recovery deliberately bypasses broken policy; special sole-admin permission is not every custom review. L; v2 `recover` O. | 1290–1360; 4154 |
| R-POL-1–12 (12) | Versioned application gating, obligation/carry/attention/landing decisions and activation | Exactly five rule kinds over supplied bounded input, no arbitrary state/effect code and no self-authorizing proposed policy. L; v2 document additions D/O. | 1363–1466; 4155–4160 |
| R-EVAL-1–9 (9) | Pinned pure evaluation, budgets, retained replay inputs and deterministic errors | Restricted engine is platform code; timeout/failure is not a logged deterministic refusal; replayed input is not independent proof that an outside observation is true. L; new profile activation/retention when implemented O. | 1469–1558; 4161–4162 |
| R-EXEC-1–11 (11) | Exact isolated job/commit/input/environment result provenance | Runner/service/provider trust, untrusted repository execution and measured environment remain outside policy expressions; dispatch is service binding. L; declared kind/binding jobs O. | 1561–1588; 2505–2515; 2584–2633; 4163 |
| R-SEC-1–6 (6) | Refuse detected secrets before permanent/public recording | Detection expressly incomplete; no confidentiality/per-fact visibility claim. Credentials never belong in the record. L. | 1591–1619 |
| R-LOG-1–20 (20) | Signed chained entries, retained replay material, checkpoints, layout and resolution of publication | Record includes accepted acts, late refusals and system events. Verification covers an available published prefix, not missing unpublished acts, trusted clock, all current transitions or provider truth. L; declared full fold/witness/version proof O. | 1622–1825; 2884–3104; 4164–4168 |
| R-API-1–12 (12) | Refusal values, cursors/status, replayable public views and updates | Transport, credentials and operational waits are code; equal projection needs equal prefix. Wait timeout is not cancellation, generic declared tools/catalogue remain O; L fixed clients. | 1828–1951; 4169 |
| R-MINT-1–7 (7) | Durable accounting for token creates, known ownership and unresolved external outcomes | Operational ledger, provider clock/create/revoke and exclusive writer assumption are not a pure board fold. Unknown outcomes must remain unknown, not promoted to success by time. L. | 3311–3461 |
| R-DECL-1–26 (26) | Application names/targets/typed fields/roles/holds, meaning identities, retirement/reuse, retained step/profile semantics, replay requirements | No code or reference to code in declarations; only nine fixed steps. Platform kinds and authority floors remain fixed. D functions/data/types; all runtime stage ownership explicit O. | 3546–4124; 4284–4304 |

Existing implementation anchors include `packages/room/src/admission.ts:486–559`, `packages/policy/src/validate.ts:140–154` (only v1 document validation on the existing path), `packages/policy/src/acts.ts:183–207` (separate v2 validator), `packages/policy/src/profile.ts:10–29`, `packages/room/src/core.ts:1340–1378`, and `packages/log/src/verify.ts:176–185`. Supporting existing modules are the room authority/requests/jobs code, `packages/git/src/landing/`, `packages/git/src/mints.ts`, and `packages/log/src/layout.ts`; their existence is not offered as a fresh correctness proof. Searching production `packages/` finds no caller of `validatePolicyV2` other than its export; test calls are in `packages/policy/test/declared-acts.test.ts`. Thus contract tests are not runtime declared-acts delivery.

The protocol also has required edits, acceptance cases and open points outside numbered families. They clarify the bounds; they do not supply additional application primitives. In particular, sections 29–32 cover fixed checker/snapshot/log-layout/mint work rather than user-defined effect code; section 33.8 owns the declared stages rather than making every clause deployed by publication of the specification. The acts note retains the complete D1 lifecycle as owed and unadopted (A:461–510).

### What changing room data can and cannot do

**Delivered legacy room data:** require different qualified reviewers/checkers for actual changed paths; change a deterministic refusal; tighten evidence carry; add landing vetoes or attention; select overlap mode; make retired evidence reopen; add checker input/environment/advisory configuration. All retain fixed platform guards and use code already implementing the associated operation. Changing a checker command or service also changes code/deployment, not only the room's decision rule.

**Declared contract, runtime owed:** give application acts their own bounded names/fields, target shapes, thread restrictions, roles, refusal wording and help; choose among platform steps; choose fixed scope templates, holds, conflict/lease/workspace/reservation settings; combine version and landing where no independent review is required. Meaning changes have explicit bindings; signed grants acquire no new authority. Historical meanings and old thread settings survive retirement and reuse (P:3636–3747, 3784–3913).

**Needs application/host/effect code or a separately reviewed new platform capability:** a chess move engine; jam musical scheduling and synthesis; arbitrary work-item status/closure; real deployment or access provisioning; reconciliation of unknown external outcomes; reading a current provider or clock outside supplied input; checker distribution beyond deployed service bindings; UI/client rendering. Files plus reviews can implement useful practices for some of these, but a label such as `close` or a field such as `outcome` does not itself add an enforced transition.

### Where the software lifecycle mapping breaks

| Original shorthand | Correction and implication |
|---|---|
| Opening an issue is a claim | A claim opens a held scoped resource. Unheld addressed filing, promise conditions, decline, re-address, requester withdrawal, performer cancellation, non-landing report, result acceptance/rejection, closure and supersession remain complete owed D1 scope. Do not present a resource hold as a delivered conversation lifecycle. |
| Pushing a branch is a proposal | Proposal requires a signed act naming an exact reachable head; the room computes bounded actual changes and pins it. A fork push precedes this and may never be proposed. |
| Approving is a verdict bound to one head | Keep, qualified by eligible principal, reviewed scope, independence and current evidence validity. Historical approval remains visible even when it no longer satisfies an obligation. |
| Checks are obligations | Correct to checks provide evidence for check obligations. Requested, advisory, failed, stale, unroutable or noncarrying checks do not all have the same standing. |
| A merge queue is the single publication slot | Explain preparation and disjoint work in parallel, one external publication at a time. The slot is not a queue of every act or every task; unresolved publication can hold it indefinitely. |
| A force push never takes effect | Reject unqualified wording. Pinned proposed heads never move (P:850–852); the publisher itself uses `force-with-lease` (P:1179–1181). An unexpected writer at canonical main produces unresolved state under the single-writer assumption rather than being made impossible by room data. |
| Landing completes the work | Landing records a Git publication outcome. It neither releases the lane nor asserts requester satisfaction; current code updates the generation and previews, leaving holder/resource state distinct (`core.ts:1353–1369`). |

### Chess: the actual mechanism and bounded proof

The pinned gitseq chess application has eight schemas and a native Go fold dispatch (C:31–42, 191–225). A move must name the exact accepted predecessor, have the correct seat at that record's identity state, and pass the `notnil/chess` engine's `MoveStr`; only then does it update the accepted game and seat binding (C:388–432). `go.mod:5–8` pins gitseq host `7152e79a741e` and chess engine `v1.10.0`. Refused chess decisions remain in the host history; the projection holds a bounded refusal tail, and querying an older decision re-folds the prefix rather than guessing (C:551–560, 831–883).

Three existing tests passed in the isolated exact checkout with `go test . -run 'Test(MoveRequiresTheRightTurnAndExactPriorMove|IllegalMoveCannotUpgradeAnUnanchoredSeat|LegalDestinationsComeFromTheFoldEngine)$' -count=1`: `ok`, 1.443 s. These test turn/predecessor guards, actual move legality and illegal-move refusal not changing seat authority (`chess_test.go:166–209, 1264–1319`). They support the narrow example of recorded refusal with no game effect. They do not prove a hosted deployment, public exposure, multi-host failover, complete chess correctness or Artroom declared runtime.

Chess is evidence for **application judgment over a verified log**, not evidence that Artroom's application declarations supply arbitrary chess rules. Its architecture also trusts the service serving prepared bytes and browser JavaScript (CA:24–40), and constrains forge writes to one local POSIX writer/confirmed prefix. The OS lock does not fence independent clones or administrators; public exposure and multi-host failover are outside the stated delivery boundary (CA:73–101). The separate gitseq DDL chess migration note is unadopted design, not a delivered replacement of this native fold.

The guarantee assumptions and falsifiers are stated in Q3; Q11 applies them to each worked room and the leading deferred candidate. Current main proves only the published-prefix and retained-policy boundary named in F4, while broader declared replay/full-fold behavior remains owed.

## Q7. Table, diagram or repeated sentence

**Judgment: keep all three for different jobs; prefer a small diagram to introduce the mechanism, then a table to compare the rooms.** This is an explanation recommendation, not an asset commission or a claim of tested audience comprehension. The repeated sentence is a mnemonic; it cannot alone carry the guarantee's bounds.

| Form, sketched in words | What survives | Strongest objection / cost |
|---|---|---|
| Table: rows for code, jam and the chosen-or-candidate middle room; columns rules, retained decisions, current board, and application/outside work | Easiest way to audit generality and prevent different meanings being hidden behind the same three nouns. Candidate/owed cells can be explicit. | A three-column table alone hides time, refusal, asynchronous effects and an older versus current prefix. The fourth boundary column adds width and interrupts a very short spoken opening. |
| Diagram: an actor's action enters a box containing fixed platform rules plus room declarations/policy; its outcome enters a retained record; a board is drawn from a labeled prefix. A side branch sends approved work to application/provider code and records its later observation back in the record. Jam live notes remain outside this authoritative path. | Shows judgment, refusals, history-to-state, and decision-versus-effect without pretending an outside system changed in the same atomic step. A new rule version also enters the record at a specific point. | Too many arrows overwhelm the first minute. Keep one code example initially and reveal the external-effect arrow only when needed; do not draw one magical box promising arbitrary application correctness. |
| Repeated sentence: for each room, name which action is checked, what decision is retained, and what current result the board shows | Best spoken rhythm and fast recall. Reuse the same grammatical roles while changing concrete nouns, rather than repeating an abstract slogan unchanged. | It invites the false universal rulebook-only inference and can equate current state with historical decision. Needs a nearby statement that application code and outside systems supply their own effects and observations. |

A minimal concept table would identify these objects, without adopting a room design:

| Example | Rules | Record | Board/application boundary |
|---|---|---|---|
| Code | Who qualifies, which exact changes need evidence, when publication may proceed | Signed proposals/reviews/checks, late refusals, reservations and outcomes | Current lanes/generations/evidence/operations; Git/checker adapters supply file/integration/provider work. |
| Jam, planned | Parts/solo holds, permitted signals, exact pattern/song versions and evidence | Commitments, signals and landed files with historical timing inputs | Application computes musical effect bars and renders audio; live previews are outside durable authority. |
| Rollout, candidate | Authorized desired version split and required evidence; freeze rule needs a specified time/observation mechanism | Reviewed desired state and adapter reports | Desired/observed/unresolved deployment state must be separate. No adapter is established by this research. |
| Access request, alternative candidate | Qualified requester/approver, target resource and bounded grant conditions | Requests/approvals/adapter observations | Current authorization/expiry needs provisioning and clock semantics; sensitive credentials stay outside log. |
| Case management, alternative candidate | Who may assign, amend, accept, close or reopen a case | Attributed changes and decisions | Case state needs a file/application fold or new reviewed lifecycle semantics; current lane release is not closure. |

If Q9 defers a middle room, label its diagram/table row as a candidate or omit it from an eventual demonstration. The candidate row does not adopt a design; the owner’s existing permission to build rollout before submission if time permits remains intact. Choosing a middle room and testing spoken comprehension remain root-round judgments, not established facts from this contribution.

## Q8. The paving image strains at current state and external effects

**Judgment: sharpen H8; reject the original literal explanation of the entire system.** Paving is a usable image for append-only history if a brick means a **record entry**, including accepted acts, recorded refusals and system observations. A brick cannot mean only an act that took effect, because the actual record contains the other categories. The fixed road also cannot stand for unchanging present validity or an outside effect that can be rolled back.

**Sharpened H8 wording, for hypothesis evaluation:** The record is laid one entry at a time. Past entries remain; later entries can change the current state. The image must attach the permanence claim to the retained record, not to every approval still counting or every external effect remaining in force.

| Room / alternative | Where paving helps | Counterexample to the overbroad H3/H6/H8; assumptions, readiness and trust boundary |
|---|---|---|
| Code | A proposal/review/refusal/reservation/outcome joins a permanent chronology; a later recut does not erase the earlier head. | A compromised approval remains historically recorded but ceases to count; an unresolved publication cannot be described as the next road already laid. Same-prefix board assumes correct platform/projection and retained rule/input history. Existing legacy code is the evidence; declared stage-2 admission, stage-3 replay and stage-5 clients remain owed. Git/checker/provider/operator and canonical single-writer assumptions remain; verification of current full lane/landing effects is limited. D1 lifecycle is still owed, not folded away by the metaphor. |
| Jam, planned | Recorded count-in, exact historical tempo/lookahead/song versions and commitments preserve a common musical plan. | A late listener plays a change late even though replay assigns the same effect bar; transient MIDI/audio previews are not durable bricks. Current key/tempo/solo change without erasing earlier decisions. Assumes retained origin/timing/file versions and application scheduling, not listener arrival time or latest settings. Musical scheduling/rendering/live transport/harness and musical-session primitives remain unbuilt/untested at the note's evidence base. Builder's concrete development-task judgment is separate; no added jam gate follows. J:143–199, 266–279, 390–395, 435–455, 607–637. |
| Rollout, candidate | Desired split, independent sign-offs and reports form a clear decision trail. | The adapter times out after submitting; provider may have applied the change while the board only knows it is unresolved. A later rollback changes traffic while old authorization remains recorded. Assumes scoped deployment credentials, trusted bounded observation and reconciliation; these are application/adapter duties, not policy expression effects. Current Cloudflare traffic-split capability is factual; this research establishes no Artroom rollout adapter or tested freeze mechanism. |
| Production access requests, alternative candidate | Approvals and grant/revocation observations create accountability. | An approval remains in history while access expires/revokes; an outside administrator may bypass the adapter. A signature is not proof that access was enforced or removed. Requires provisioning adapter, clock/expiry rules, resource identity and private credential handling; no per-fact visibility guarantee. No delivered access application is established here. |
| Case management, alternative candidate | Amendments, declined assignments and acceptance/rejection can remain visible without overwriting an earlier decision. | Closing a case and later reopening/correcting it reverses the current status; releasing a resource hold does not establish either event. Assumes specified lifecycle/actor authority and application projection or reviewed file practice. D1 requester/performer/race/closure semantics are still owed, so rulebook-only case management is not established. |
| Chess, boundary control | Legal/refused attempts remain in the verified history and determine an accepted game position. | A pure declaration cannot calculate legal chess moves using Artroom's fixed steps; native application code and pinned engine do so. A client reading another prefix shows another valid position. The local application/tests support the narrow recorded-refusal example, not a public service or generalized Artroom runtime. C:191–225, 388–432; CA:73–101. |

The Cloudflare-specific fact is narrow: gradual deployments can divide Worker requests between versions, upload creates a version without deploying it, and deployment selects the traffic split. The same documentation warns of version skew. That makes rollout a plausible external-effect candidate, not a proven room implementation or a guarantee that all requests observe one version. [Cloudflare gradual-deployment documentation](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/) (checked 2026-10-03, body lines 590, 621–634, 677–692).

“Lays the next step ahead of you” also suggests guaranteed progress. The actual protocol preserves an unresolved publication until it can be resolved (P:1182–1213); a rulebook can refuse, wait for evidence, or fail. Append-only safety does not by itself promise liveness, low latency, musical quality, an approved deployment, or successful outside provisioning. The paving machine should not be used as proof of those properties.

### Alternative image and costs

**Keep for consideration: a shared signed logbook beside a current status board.** The logbook retains who asked, which rules were in force, what decision was made and what later outcome was reported. The board shows the current result at a stated point. A new log entry can change status without tearing out the old page. For rollout/access, a distinct outside instrument reports what the provider observed; for jam, the live performance happens beside the logbook rather than being every mark on the page.

This image fits code, music and either middle-room alternative more evenly than permanent roadway. It directly accommodates refusals, corrections, reopened evidence, unresolved effects and prefix boundaries. Its costs are less motion/visual spectacle, potential “audit paperwork” associations, and a need to explain that signed reports are attributable claims, not automatically true measurements. These are judgments, not audience-test findings.

Other considered images: a chessboard is concrete but makes simultaneity/playing look like discrete turns and overweights the unbuilt Artroom chess interpretation; a score and conductor suits the jam but poorly explains refusal history, code publication and unknown effects; a ledger stresses history but can imply transactions or business correctness stronger than this platform establishes. None removes the application-code or external-state boundary. The three-part logbook/status-board image survives this first factual test; visual choice should remain open until the integrated positioning design is reviewed.

## Q9. choose a middle example for its proof, not its place in the story

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

## Q10. leave the chosen rulebook open

**Judgment.** Q9 defers the choice, so no chosen twelve-line rulebook or
appendix is supplied. A candidate mapping is useful evidence for a later
choice, but is not an adopted rulebook. These are the boundaries a rollout
implementation would have to resolve:

| Candidate requirement | Actual available act, policy or declared step | Support boundary |
|---|---|---|
| Work on one service's release plan | Current `claim` and workspace; a proposed `plan-release` kind would use `open`, with a `service` segment and fixed scope such as `releases/{service}/**` | Current legacy claims can choose a scope. A lifetime-fixed templated scope is planned stage 4, not delivered main. The application must store exact provider version IDs and traffic proportions in reviewed files. |
| Keep one holder and require fresh authority | Current leases and fencing; proposed `take-release` uses `take`, and a declared hold uses exclusive conflict mode | Lifetime-fixed scopes and the new declared conflict behaviour remain stage 4 work. Losing a room lease does not revoke a provider credential. |
| Make the exact plan a reviewable version | Current `propose`; proposed `propose-release` uses `version` | Current proposals pin heads. Declared runtime admission, generic access and declared replay remain unfinished stages 2, 5 and 3. |
| Require an independent sign-off | Current `review` plus a `require` rule with `allowSelf: false`; proposed `approve-release` uses `review` | A named independent member, agent or admin can review. The platform establishes the signed review and its binding, not the reviewer's competence or provider authority. |
| Require plan validation | Current checker configuration and `require` check obligation; proposed `validate-release` uses `check` | File validation requires application checker code. Automated declared jobs need stage 4's kind and binding support. A live health check is volatile and must not be carried as timeless evidence. |
| Reassess sign-offs when a plan changes | Current generation-bound evidence and `carry` policy | The candidate can disable verdict and check carry, or narrow it using the actual recorded inputs. A changed plan cannot silently reuse arbitrary health evidence. |
| Make an approved desired plan effective | Current `land`; proposed `adopt-release` uses `land` | Landing confirms the canonical repository update. It does not deploy a Worker or establish current provider traffic. |
| Freeze releases by time | A `refuse` or `land` rule can judge supplied room facts; an application can record a freeze state | The policy profile has no wall clock or external reads. An autonomous calendar window cannot be guaranteed by a rule that merely trusts a submitted time. A trusted application mechanism and recorded inputs are required; no new clock primitive is adopted here. |
| Execute, confirm and recover a provider change | An application adapter can act under its own external authority and submit signed reports, for example a declared `report-release` using `comment` | No current platform step deploys a Worker. Durable retries, provider read-back, competing provider writers, unknown outcomes and credential handling need application code. A signed report proves who reported it, not its independent truth. |
| Undo a traffic change | A new reviewed plan and landing can request an earlier version | This preserves the historical decision. It does not reverse requests already served, database writes or incompatible migrations. |

**Sources.** `packages/contract/src/declarations.ts:7` explicitly limits
delivered stage 1 to types. The fixed step set is at line 79; body field
types at 85; fixed hold templates, lease and workspace declarations at
102; `who` at 142; declared rules at 159. Current `require`, `carry`,
`land` and `notify` structures are in
`packages/contract/src/policy.ts:59`; the no-clock/no-I/O input boundary
is at 204. Jam revision 5 lines 97–109 assigns fixed scopes, conflict
settings, compound acts and automated declared jobs to stage 4. The
current priority/readiness record is
`notes/2026-10-03-planner-direction.md:21` and `:34`.

Unsupported requirements are explicit above. Renaming acts is not an
implementation of provider truth, time-window enforcement, identity
mapping, external credential revocation or business-specific lifecycle
rules. Those remain full application work, rather than grounds to weaken
the platform's scope or invent more readiness approvals.

## Q11. three different proofs, with three different limits

**Source and judgment: code room.** The delivered legacy Room coordinates
signed acts, roles, leases, pinned heads, generation-bound reviews,
obligations, canonical publication and its recovery. That is the best
existing source basis for the required concurrent-code demonstration.
The broad H3 counterexample is an approval whose current standing later
changes after a relevant edit or key compromise: its historical decision
is retained, while it may no longer count toward landing. The H6
counterexample is an unrelated writer changing the canonical repository
through provider authority outside the room: changing the rulebook does
not remove that external power, and the Room must detect and reconcile
the changed provider state. A signed check also does not prove that its
program correctly judges the code.

The unique proof is exact code versions and evidence surviving changes,
with concurrent work and publication recovery. Current legacy source is
delivered; the proposed universal declared path is not. A live connected
browser demonstration is also not established by the current UI entry
point. The Room README lines 63–72 and 108–127 describe the source
mechanisms; its tests and deployed run evidence must be distinguished
from this research, which ran no new live workflow.

**Source and judgment: jam room.** The unique proposed proof is that a
non-code application can coordinate musical commitments, handover and
timed effects while leaving ordinary live playing outside the record.
The H3 counterexample is already in the approved design: a late listener
plays a recorded change late and hears different live audio. Identical
recorded inputs can establish the same assigned effect bars; they cannot
establish identical sound at every listener. The H6 counterexample is
the sound engine and live clock layer: neither appears just by replacing
a policy document. Replay additionally needs the complete retained
history and referenced file versions, not only the latest song file.

The source contract exists, but declared admission, replay and generic
clients are still unfinished on this baseline. The actual musical
features need the listed stage 4 primitives and application code; the
musical timing and agent spikes remain untested here. Builder's dated
judgment is not ready for the named first development task, pending
stages 2, 3 and 5. That task is distinct from a completed musical session;
stage 4 and full later proof remain owed without becoming new start
conditions. Sources: jam revision 5 lines 11–19, 84–109, 147–176 and
507–518; planner direction lines 21–41.

**Judgment: rollout, leading deferred candidate.** Its unique proposed
proof is an effective decision causing an independently observed change
outside the room. The H3 counterexample is an approved 10% rollout
followed by a timeout: the adapter cannot infer from the room's record
whether the provider applied 10%, 0% or a different change. Even after a
confirmed deployment, a later provider administrator can change it.
Historical approval survives; current provider traffic is an observation
that may change. The H6 counterexample is provider credentials and an
adapter that uploads a version, deploys the exact split, reconciles an
unknown answer and records its evidence. They are not supplied by a new
rulebook.

A useful demonstration would show approved plan, provider confirmation
and a real request returning a version, with clear provenance for each.
One returned version proves that request's response, not the statistical
traffic split; read back the deployment configuration and identify any
sampled-request observation separately.
Replaying the room can reproduce the decision and the recorded report;
it cannot independently re-run history to prove every request's routing.
No rollout application or that proof is established on the inspected
baseline. Begin a future worked example with a stateless Worker so that
its shown effect is precise; retain Durable Object migrations,
dependencies, other provider writers and irreversible side effects in
the complete application's requirements. This is a research/example
choice, not a reduction of scope. Sources: the two official deployment
pages above and the explicit current step set.

**Other candidates' counterexamples.** Production access: a room records
that a lease ended, while a provider session still accepts requests. The
record cannot prove revocation; the application must reconcile the real
identity, authorization and session. Case management: the room records a
response, while an external delivery fails or the customer disputes
closure. The room establishes the recorded decision, not satisfaction or
receipt. Tool lending: a recorded return leaves the physical tool in the
borrower's possession. Each needs application verification beyond policy
and no working integration is established by this research.

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

## Q13. what the first five minutes should establish

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

## Q14. rough eight-minute cut, with the code room doing the work

**Source.** The official submission deadline is **2026-10-14 at 11:59 PM
PDT**; October 13 is the project's earlier target. The rules require a
5–10 minute demonstration, source under an allowed permissive license,
running instructions, Workers and Artifacts, and multiple agents working
concurrently. Judges weight prototype originality/quality **50%**,
concurrency/coordination/context/review/conflict **25%**, and ease of
use/experience **25%**. Ties favor the first criterion.
[Official competition rules](https://www.cloudflare.com/documents/build-next-gen-git-platform-competition-terms.pdf),
§§1, 4 and 6, checked 2026-10-03.

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

## Q15. decisions needed before outlining assets

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
2. **The cost and self-correction argument lacks the required evidence.** H5's “every repair” and “never the business rule” description misses the preserved Club business defect; the later declaration candidate also fails an independent check. Literal size is not total effort saved. Use the bounded positive mechanisms and retain the negative results in Q12.
3. **The first-use and three-room story are ahead of working proof.** Bootstrap/import/admin/UI connection, cold newcomer comprehension, jam timing and a real middle-room adapter remain concrete gaps. A mock board and renamed acts cannot demonstrate them. Q13 names the current source gaps and Q14 reserves most time for actual code work. These are work to complete, not new jam-start conditions or scope cuts.

## Sourced facts used

All Artroom paths below mean exact approved baseline `344656705140d9bf6539fe44de889d1e21dd2482`, unless a dated deployment or separate repository is explicitly identified. A source specification describes a contract; an implementation/test demonstrates only its stated boundary. Research judgments above are separate.

- **F1. Plan and competition.** [Artroom plan](2026-10-01-artroom-plan.md), sections 1, 12 and 13, retains full scope and planned ease/scale. The official deadline is **2026-10-14, 11:59 PM PDT**; October 13 is the project's earlier aim. Entries need a 5–10 minute video, permissively licensed source/run instructions, Workers and Artifacts, and multiple concurrent agents. Scoring is 50% prototype originality/quality, 25% coordination/context/review/conflict, 25% ease/experience, with the first criterion breaking ties. Checked 2026-10-03 against [official rules, sections 1/4/6](https://www.cloudflare.com/documents/build-next-gen-git-platform-competition-terms.pdf) and [announcement](https://blog.cloudflare.com/next-git-platform-on-cloudflare/); these supersede the old draft's unchecked-weights caveat.
- **F2. Current acts and mechanism.** [Protocol](../docs/protocol.md), R-ADM, R-IDEM, R-LANE, R-PROP, R-OBL, R-ADMIN, R-POL and R-LOG; Room admission.ts:486–559. Current legacy dispatch has seven software acts plus renew/roster. Signed non-act requests, early unrecorded failures and room-signed system events also matter. Q6's inventory covers all 247 numbered rules in 24 families, all nine declared steps and five policy kinds.
- **F3. Outcomes and standing.** Protocol R-LAND/R-PUB/R-REV preserves reservations, unresolved/confirmed outcomes and later evidence invalidation/reopening/revert. A request taking effect is distinct from confirmed publication; current eligibility is distinct from the original decision. The pinned-head rule and the publisher's force-with-lease show why an unqualified “force push never takes effect” is inaccurate.
- **F4. Current replay boundary.** [Log verification](../packages/log/README.md), “Verification”, and verify.ts:176–185,421–454. It checks an available published prefix and replays retained policy decisions. It states limits on transition/effect derivation, unpublished acts and room clock. The historical smoke's green verifier does not remove those limits. Declared fuller replay and end-to-end proof remain staged work.
- **F5. Jam and declared delivery.** [Jam note](2026-10-01-jam-room.md), approved revision 5, separates durable musical commitments from transient live playing, requires historical timing/file versions and lists both musical/agent spikes. [Planner direction](2026-10-03-planner-direction.md):21–41,65 and protocol:4284–4304 separate concrete builder-owned readiness from complete platform/jam proof. Stage-1 contract/data/validators are delivered; runtime admission/replay/generic-client and later platform/fixture stages are still owed at this baseline. Preliminary candidates are not delivery approvals. No fresh jam result is claimed here.
- **F6. Developer surfaces.** Client/CLI README, client tests and reads.ts identified in Q12; UI main.tsx:22 always creates MockRoom although LiveRoom and client connect() exist. Main.ts:78–107 and its complete explicit command table/own-key dispatcher have no create/import/admin-invite command. Founding.ts:179–214 supplies an actual signed import API. This is a pinned source finding, not a claim that no deployment/package exists anywhere.
- **F7. Dated deployed loop.** [Deployment spike](deploy-spike.md):1213–1219 and [retained smoke result](../packages/room/measure/results/spike-smoke-2026-10-03T03-35-10-310Z.json) identify source `0753d7de` and 91 successful steps with cleanup ok/no unresolved cleanup or repositories left. Source/report links in Q12 identify the exact Room/checker deployment. The record includes actual canonical-head and published-prefix observations. No fresh provider call, deployment or credential exercise was performed for this research.
- **F8. Workload and performance bounds.** [Room-core spike](2026-10-01-spike-room-core.md) and [sandbox Git spike](2026-10-01-spike-sandbox-git.md) retain dated workload-specific warm/cold results; both are unchanged from the old draft's inspected source to this baseline. They do not establish the plan's current full-workflow targets. Section 12 explicitly leaves these unmeasured until their lane reports: act answers with 10 concurrent full workflows at p50 ≤300 ms/p99 ≤1 s; claim overlap ≤300 ms; workspace p50 ≤5 s; preview p50 ≤10 s; at least 10 disjoint ready landings/minute; UI updates ≤1 s; 100 simulated agents/1,000 claims with gapless/no-lost-update results, expressly distinct from 100 coding workflows; and zero approvals spent on already-known conflicting heads in the controlled serialized-recut scenario, with reviewer waiting and throughput reported. Reports must identify location/workload/sample counts/retries/cold-warm/fork time/Artifacts-container cost. Estimates do not constrain functionality.
- **F9. Authoring and correctness evidence.** dap `9d738e2e71b84ec85cd321bd4d87623ea3fad355`: spike/REPORT.md:74–90,183–221,240–246; 2026-09-18 directions:374–377,658–659,732–752; exact model ledgers/source identities in Q12. T1 candidate `22444f8536a8932fc758d77bb614a1424635fec3` and spike/lang/REPORT.md:3–71,130–170 retain its negative result and separate line/byte counts from total authoring cost. Numbered excerpts and source hashes were checked against immutable files; these reports were read, not their historical campaigns rerun.
- **F10. Middle-room hosting capability.** Workers can upload versions separately from deployment and route percentages to versions; connected resources and version skew complicate an application's desired/observed state. Gradual deployments treat Durable Objects differently. See [versions/deployments](https://developers.cloudflare.com/workers/versions-and-deployments/) and [gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/), checked 2026-10-03. The deployment-management page's body was available through the provider's documentation preview while its canonical URL returned an error; its upload/percentage/resource statements were corroborated against the main overview and gradual-deployment page. They establish provider capability, not an Artroom adapter.
- **F11. Alternative hosting capability.** Provider [temporary authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/temporary-auth/) supports purpose/approval and access for up to 24 hours. [Session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/) distinguishes ending sessions from preventing new ones. [Workflows](https://developers.cloudflare.com/workflows/) persists steps, retries and waits for external events. Checked 2026-10-03. These facts support the candidate ranking; they do not establish identity mapping, external revocation, receipt or correctness in an Artroom application.
- **F12. Actual chess mechanism.** gitseq-chess `b97c6a82ef7e3618721696f5a69efef13da10a79`, chess.go:191–225,388–432 and docs/reference/architecture.md:24–40,73–101, uses native application code and a pinned legal-move engine. Three targeted existing local tests independently passed as described in Q6. No public deployment, full chess correctness, multi-host failover or Artroom declaration-based chess claim follows.

Internal repositories for F9/F12 are `/Users/hughpyle/play/dap` and `/Users/hughpyle/play/gitseq-chess`, respectively. Exact identifiers and source paths are research provenance under the approved exception; they do not carry into presentation assets.

## What this round could not settle

- **Audience and word comprehension:** no unaided developer/operator/newcomer comparison of the two openings, candidate claims or images was conducted. Editorial survivors remain hypotheses.
- **General authoring economics:** the experiments lack equal fresh-agent trials and complete effort/cost accounting. They do not settle which segments spend more on certainty than code, or how much shared machinery saves overall.
- **Agent recovery:** refusal/retry mechanisms and assertions exist; no causal success rate for an agent following a fix or a cold five-minute experience was measured.
- **Complete current/deployed general platform behavior:** approved main and dated legacy deployments do not establish unfinished declared stages, arbitrary applications, every rule's implementation, complete full-state replay, or every provider failure path.
- **Jam evidence:** musical/live timing, audio quality, agent collaboration and the full historical replay harness need their own results. Their absence here does not change the builder's concrete readiness authority.
- **Middle-room selection and implementation:** rollout leads the ranking, but no working inspected candidate supplies its external-effect proof. Freeze/clock, provider writers, unknown answers and recovery are application work; selection stays deferred and pre-submission rollout permission stays intact.
- **Final demonstration and call to action:** exact participants, connected UI/setup, source/deployed identities, shown outcome, owned original media and measured timings must be established before a positioning design can choose assets. The allocation in Q14 is a rough cut, not a script.

Naming exceptions and the official deadline/weights are settled in the current sources; they are not carried forward as unresolved items from the older draft.

## Validation of this research note

This is a note-only change in an isolated request worktree based on the approved baseline above. The full Q1–Q15 and H1–H8 inventory, commissioned numerical breadth, source identities, name/visibility/comparison limits, per-room counterexamples and full-scope/readiness boundaries were checked. The protocol inventory independently counts 247 unique rules across 24 families. Immutable source hashes/excerpt ranges for 31 evidence files match. Primary competition/hosting documentation was rechecked on 2026-10-03. The research used source reads and retained results; apart from the three narrow local chess tests described in Q6, it performed no new application benchmark or provider execution. No runtime test suite is needed for this note-only implementation; the exact final research head still requires another actor's Architecture/Security/Simplification review and landing through gitseq.
