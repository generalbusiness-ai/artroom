# Artroom end-to-end experiences and developer adoption
2026-10-03. Planning input from Hugh's informal Wave/Artroom discussion, sent at his explicit request: "When ready, send this to planner to build concrete tasks."

Scope: assess planned Artroom, not only the implemented slice. OpenCode compatibility is unimportant. Preserve the existing focus and application/platform boundary. These are research judgments and proposed acceptance scenarios, not adopted designs, implementation claims, or a proven causal explanation of Wave's failure.

The adoption problem
A strong collaboration foundation becomes valuable when a person can accomplish a recognizable task and a developer can build another such experience without reconstructing the foundation. Artroom needs complete paths from intent to an accepted result. APIs, screens, replay and documentation are necessary parts, but component completion alone does not establish the experience.

End-to-end experiences to close

E1. A first useful result from a real repository.
A new user joins or creates a room, selects a supported coding setup, gives one bounded task, watches progress, reviews an inspectable artifact and evidence, and sees the confirmed publication outcome at its named destination. They can do this with one person and an agent; they need not recruit a team or study the protocol first.
Planned foundations: lane J setup/import/invitations/MCP, four UI screens, the documentation quickstart. Remaining design question: their composition through actual execution and publication, with a tested/default staffing and policy choice.
Acceptance: a newcomer follows only the task tutorial on the hosted path and completes a small useful change. Record time, help needed, manual setup and unclear terms. The docs plan's 15-minute first-change target is a target, not measured performance.

E2. Work continues while the user is away, and reconnecting restores control.
Start work in a browser, close the laptop, let file edits/commands/tests continue in a durable cloud workspace, then return on another device as the same member. The returning view explains changes, waiting conditions, result/evidence and the next decision. Watching/steering does not replace the agent's identity or turn browser closure into cancellation.
Reuse the three-story request b5f1fb3f and its independently reviewed successor design; do not duplicate its execution recovery, browser flow or device/custody tasks. Strengthen their combined acceptance with one complete journey including disconnection, a lost response, bounded execution/cost and preserved workspace/conversation correspondence. Unknown command or publication outcomes must remain visible until reconciled; a timeout is not evidence of failure. Pause, cancel, revoke and retention have distinct effects as the adopted design specifies.
Attention while absent needs a chosen delivery path and a link back to the exact decision; design notifications without requiring a new chat/social product.

E3. A person can join midway and make the right decision.
An invited reviewer who has not watched the agent transcript sees the requested outcome, current proposal/head, material changes, relevant tests, carried evidence with reasons, and the specific decision needed. They can inspect the relevant files/preview, ask an anchored question, request a revision and review the revised generation.
Planned foundations: Proposal and Needs you screens, line/act anchors, explanations, evidence carrying, pi-durable watch. The experience gap is selection and presentation of that context, plus role-appropriate access to the actual reviewed artifact. An agent's narrative is supporting context; effective state and formal evidence come from the room.
Acceptance: a cold reviewer handles a real proposal without assistance or reading the whole transcript. Move the generation during the review and verify the UI clearly identifies the old subject, changed material and applicable/carrying evidence. State age and reconnection must be understandable without a distributed-systems lesson.

E4. Work has an accountable lifecycle through handover and completion.
A requester can file work before a performer holds a scope, specify conditions, receive an accountable commitment, see blocked/declined/cancelled/reassigned work, inspect a reported result and accept or reject it. Non-code work can finish without a file landing. A released lease or landed artifact alone does not assert requester satisfaction.
Reuse the complete D1 work-item/commitment design owed in the acts review and docs plan; configurable act names alone do not fill it. Include useful small-team coordination: two agents can contribute without losing work, authority or review responsibility. No hundred-agent milestone is needed for initial value.
Acceptance: one request survives performer handover with conditions and context intact; another completes with evidence but no landing; cancellation and a concurrent report/acceptance have explicit, attributable outcomes. Distinguish requester acceptance, qualified artifact review and publication.

E5. Incremental adoption produces value without moving every existing workflow.
A person should be able to try one bounded task on an existing repository, retain ordinary Git access to artifacts, invite one reviewer and understand where the canonical result will appear. Define canonical repository and optional mirror roles explicitly; do not promise seamless bidirectional synchronization or an implemented GitHub mirror.
Acceptance: the first task works without migrating all issue tracking, CI, editors or harnesses; artifacts and the relevant work history can be retrieved independently of the browser UI. This is an adoption/portability scenario using existing boundaries, not a new federation architecture.

Developer experience for people and agents

D1. A complete starter with a useful outcome.
Provide a small supported application in its own repository, consuming published/pinned packages and a deployed room. Include declarations/template, a minimal UI, one participant/agent, the validator/checker route it actually uses, configuration and deployment instructions. Make the authority/identity/default-policy setup coherent. Distinguish participant setup, application-builder setup and platform-operator setup.
The coding journey supplies immediate value; a small jam journey demonstrates a second application's vocabulary and interaction. Use the same client model for both. Explain what declarations can express and where application code or a new platform primitive is required. Do not advertise arbitrary applications from a rulebook change alone.
Acceptance: a developer unfamiliar with Artroom modifies and runs the starter without imports from Artroom source paths or a platform source patch.

D2. Discovery that supports completing a task.
An unfamiliar agent needs the active vocabulary and bindings, field/target schemas, usable examples, its own authority, current task context, required evidence and the next possible steps. Distinguish an action absent from the app, forbidden to this actor, blocked by state or awaiting an external outcome.
The catalogue and generic submission planned in declared-acts stage 5 are foundations. Decide what contextual guidance must be returned by runtime APIs and what belongs in the short agent guide/application workflow. A discovery or preflight read does not reserve state or guarantee later admission.
Acceptance: a cold agent performs an unfamiliar declared action, handles a genuine refusal, waits for the right event and completes the intended task without protocol spelunking or a hard-coded tool for that vocabulary. Measure tokens, turns, repeated refusals and help, not just JSON schema validity.

D3. A supported client that handles protocol mechanics without hiding meaning.
SDK/CLI/MCP/browser paths should share canonical preparation/signing, durable retry/outcome recovery where needed, subscriptions and typed errors. Examples should not reimplement identity, envelope or outbox logic.
Keep exact retries distinct from new intent. A changed binding requires reading the new meaning and deliberate resubmission, not silently re-signing. Errors should identify the relevant object, explain what happened and name a useful recovery action. UI explanations and machine-readable errors should agree. Unknown external outcomes remain open rather than becoming success/failure by timeout.
Acceptance: a documented lost-response and a stale-binding case can be recovered using the supported interface with the intended authority and no duplicate side effect. Reuse existing retry coverage and the three-story implementation acceptance instead of creating duplicate suites.

D4. A small, fast feedback loop that checks real collaborative behavior.
Give application builders a supported local or hosted disposable test room with seeded identities and a inspectable record. Include happy-path and decisive conflict/refusal examples. Make it straightforward to exercise two actors and replay a history with the real semantics.
Cloudflare provides local Workers/Durable Objects development, but that does not establish local fidelity for all Artifacts/Sandbox/external effects. Clearly identify which adapters run locally and which require a remote test environment.
Application-only edits should have a documented focused verification path. Reuse reviewed conformance fixtures for shared invariants; do not require reading the full protocol or rerunning every platform permutation for each UI/act change. Preserve the existing test-overhead priority ecbc722a.
Acceptance: a cold builder can change one starter interaction, test it against the named fidelity boundary, inspect a refusal and see the result with a bounded ordinary iteration cycle. Record elapsed time and manual steps.

D5. Installation and evolution are supported experiences.
Document what an application can install through ordinary room acts, what the operator must configure, and what deployment/account ownership is required. Checker dispatch is an existing named extension seam: the jam note records same-account service bindings and open endpoint/pull alternatives. Reconcile existing checker/job requests; do not present independent reviewer validation as equivalent to a machine checker.
Provide a worked act/policy change with dry-run, exact activation, regrant where bindings require it, understandable stale intent, and historical reading. Keep existing open threads/release paths and retained old semantics valid. Deployment of new code alone must not silently change the meaning of prior acts.
Acceptance: an outside builder installs and updates a supported application using documented public interfaces, gets understandable configuration errors, and verifies a history spanning the change. Identify the owner and next task for any unsupported extension.

What planner should produce
Create a compact experience-to-task map before commissioning more component work. For each E/D item: user/actor and desired outcome; already adopted design and existing request; remaining composition gap or decision; accountable owner; dependencies; concrete delivery artifact; a bounded acceptance scenario; and observable success measures.
Extend/reconcile b5f1fb3f and the docs/onboarding/generic-client/D1/checker work. Issue missing concrete gitseq tasks with reviewed acceptance conditions; do not duplicate them or call design/doc delivery implementation completion. Preserve full existing scope and Hugh's current priority order: builder test overhead first, acts that enable jam, necessary unblocking spikes, then jam and docs in parallel. These adoption stories add no blanket jam-start gate and do not silently adopt a new platform/application model.

Suggested demonstration and release proof
1. One person starts a useful task; an agent produces an inspectable result.
2. The person leaves and returns on another device.
3. A reviewer joins midway, asks for one change and reviews the right version.
4. A failed check or lost response is repaired through the supported flow.
5. The room confirms the publication outcome and the requester can judge the result.
6. A developer/agent then uses the same client concepts for one small jam interaction.
Platform generality becomes observable through the second application; initial success should not depend on learning its internals.

Primary local planning evidence
- notes/2026-10-01-artroom-plan.md, section 12: onboarding, four screens and unmeasured targets.
- notes/2026-10-01-pi-durable.md, sections 3.2/3.3 and Q3/Q4/Q8: durable outbox, lane context, cancellation and watch/steer.
- notes/2026-10-02-acts-review.md, D1/D5/D6 and section 6.1: complete work lifecycle, existing anchors, live-layer boundary.
- notes/2026-10-02-declared-acts.md, sections 2/3/4/5 and stage 5: fixed steps, binding/version/replay, historical rendering and generic clients.
- notes/2026-10-01-jam-room.md, section 9: published-package application boundary and checker dispatch/account questions.
- notes/2026-10-01-docs-plan.md, revision 3: tested task tutorials, 15-minute hosted target, cold-person/cold-agent/unfamiliar-app tests and full page inventory.
- notes/2026-10-03-planner-direction.md: current readiness and preserved sequencing.
- b5f1fb3f: ongoing connected execution/browser/device design; Draft2 artifact 209a5ec9 is evidence under review, not an adopted/implemented capability.

Research context
- HN discussion: https://news.ycombinator.com/item?id=49947051
- Joe Gregorio's Wave presentation: https://www.usenix.org/legacy/event/lisa09/tech/slides/berlin.pdf
- Wave model and application separation: https://cwiki.apache.org/confluence/display/WAVE/Wave%20Model%20Code%20Walk
- Current Cloudflare local-development boundary: https://developers.cloudflare.com/workers/local-development/

The Wave analogy motivates this experience analysis. It does not establish that these changes guarantee adoption, nor does it require copying Wave federation, operational transformation, a general social product or a new editor.
