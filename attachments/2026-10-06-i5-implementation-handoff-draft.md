# Browser and public tools: implementation handoff draft

2026-10-06. Planner draft under 5c716a5c / efc0d86c.
Status: prepared scope, not an issued source commission or adopted new design.
Reconcile exact existing IA/I5/I6 requests before filing. Original C1 b538c5ea
and C4 18815307 stay owed; a successor must retain their useful outcomes.

## Basis and boundary

Use adopted R1 revision 23 at 3b3e394fc6807c33211ac80db813621253c38f5c,
adopted R3 revision 28 at 8b1c3c9d7987fba6ac5f5b31fbe329d50a3f568b,
and adopted R2 revision 15 at f4889d470920cabff693b29b3279ed075e5109da.
R16 at 34333921844c2055dc774b3d27834b709a73144d is an adopted partial
mapping/questions/fallback stage, not completed smaller-profile or new-form
implementation. Q16 forms under 8f0d575b need their own review and adoption.
Use existing distinct signed wire forms until replacements are adopted,
implemented and pinned. Raw design/menu hashes activate nothing.

I5 builds browser pages and the public CLI/MCP experience on I1–I3 and IA.
I3 owns membership, grants, read sessions, platform definitions, Git effects,
checks and destination publication. IA owns the task runtime, conversation,
command journal, private checkpoint/recovery and signed control outcomes.
I5 displays and invokes those interfaces; it does not implement a second
authority, recovery engine, effect ledger or conversation-as-result store.
I6 owns the complete deployed walkthrough and cross-component acceptance.
The full manual remains db2fd146, not a smaller quickstart substitution.

## Complete person’s journey

1. Create or join and import. Show source validation, copy, founding, initial
   rules and destination as separate recorded stages. Retain one attempt
   across a lost reply. Show used/expired/missing invitations distinctly.
   Make device B’s own key through an admin-issued invitation for the same
   member; a non-admin asks an admin. Save permitted recovery material.
2. Give the agent a task. Show its member/controller, commitment, hold,
   fork/compute/dependency stages, budgets and actionable failures. Task input
   is not the agent’s lane acceptance. No browser close changes the task.
3. Watch and steer. Show each lane’s confirmed position and each task’s
   activity, command state and last acknowledged boundary separately.
   A signed control is accepted/queued before its later applied outcome.
   Steering does not rewrite signed commitments or conditions; use the lane’s
   explicit negotiation act when those change.
4. Leave and return. B discovers the same work and uses its own enrolled key.
   A’s unsent journal is not silently shared or reconstructed on B. Show
   current/stale/disconnected/read-only/unavailable/authority-unknown and
   unresolved submission states. A read session grants no signing/control
   authority or private transcript/file access.
5. Attend, pause, resume or cancel. Inbox attention links to recorded items
   with current read authorization; an agent answer is a separate control.
   Start with the declared inbox-only experience. External alerts remain
   N7’s separate design and implementation, with consent and unknown sends.
   Show pause/save/compute/hold states and pending cancellation effects
   separately. A recorded pause voids earlier unapplied start/resume controls
   as the task contract states. Resume after a lost hold requires a new hold
   and exact acknowledged restore. No effect is undone by cancellation.
6. Review real work. Provide repository/tree/file/commit/branch views, issue
   and Work views, linked concerns/reports and selected facts, and the PR’s
   Conversation/Commits/Checks/Files changed. Bound artifact reads, expose
   truncation/continuation and retain the exact manifest/tree/base selected.
   Phone review shows its subject before signing. Keep outdated threads,
   superseded checks and timed-out jobs as history; timeout is no proof that
   a checker stopped. Apply current signer/member/principal/controller and
   extent review rules, including ownerMayReview and its separate declared
   single-controller exception. A second key is not a second reviewer.
7. Follow publication and judge. Show all failing merge guards, touched
   extents, destination reservation, cancellation eligibility and every
   refusal/unknown/final reason from recorded results. An agent’s “finished”
   is activity. A report, proposal, approval, reservation, confirmed merge and
   requester judgment are different facts. Do not clear an uncertain push
   or cancellation by a UI clock, restart, new attempt or token expiry.

## Persistence, authority and recovery

Persist exact prepared/signed intent and its device dispatch fence before
sending. Settlement reads the owning scope’s retained result even after
intent expiry or key revocation. One refusal is true at its judged position
and does not settle another in-flight copy. Show final absence only from the
owning scope’s terminal settlement evidence, with pending preparation duties.
Do not offer blind effect retries; any separately authorized new attempt
keeps earlier unknown duties.

Revocation uses current R28’s clock/freshness bounds, not an invented
instant global stop. One controller key retired while another remains active
does not stop the agent. Last-key loss, controller removal, agent-key
revocation and compromise have distinct consequences and evidence counting.
An existing hold is not ended merely by membership revocation. Fencing,
token cleanup and in-flight unknown duties remain separate recorded work.
Previously displayed/cached content cannot be recalled. A removed member
cannot be restored by an invitation or role reset.

The Work view must name an acknowledged checkpoint and its coverage before
saying work is saved. Older checkpoint plus later edits, unknown/failed save,
no checkpoint and failed restore each need truthful states. Existing
4e71cbef corrects the unconditional R16 hold-ended label; existing 4684b23f
clarifies external manifest bytes versus guarded committed checkpoint.
Final-cut/host-destruction permission awaits recorded recovery/IA agreement.
Show retention, extension, expiry, pins and physical cleanup duties without
equating logical expiry or storage presence with deletion or durability.

## Dependencies, task reconciliation and acceptance

Before a source promise, identify existing task IDs and merge or supersede
overlapping C4/I5 scope through its owners, retaining original outcomes.
I3’s M4 landed/published at 68ffd637 is a partial milestone; actual provider
adapters, full platform source, IA runtime/recovery, capacity and real
authority boundaries are still owed. Source absence at this tree’s
packages/ui/cli/mcp/room is metadata, not proof about external deployments.
Retained pi-durable spike source is not the current runtime.

Owner interfaces must expose authoritative control outcomes, bounded artifact
and replay reads, authenticated discovery, device administration, inbox,
operator incidents/waiting duties and proposal/publication reasons. Map
browser/client/CLI/MCP exports and remove replaced active routes with their
successor. Never reactivate the historical Room or old private spike setup
to obtain a passing demonstration. External-login design needs explicit
owner adoption; its reviewed proposal alone is not profile activation.

Distinguishing acceptance preserves the full original connected stories:
cold browser import to useful reviewed/published change; A closes and B
steers/reviews without A’s key; unauthorized and read-only devices refused
for control/private access; single-key revocation versus last key/removal;
lost signed-control reply and exact settlement, including a refusal followed
by admission of an earlier copy; acknowledged versus uncertain save and
abrupt host loss; attention pause and later resume; cancellation with a late
effect; revised manifest and stale/independent review; moved destination and
lost push reply with recorded reconciliation; bounded actual artifacts;
and public CLI/MCP discovery/preparation/settlement/replay on the same model.
I6 runs the complete deployed journey; focused I5 checks alone do not close it.

Builder names current focused commands after runner reconciliation and runs
one gate before source review. Reuse one compact browser boundary and
invariant fixtures. No legacy per-field suites, mutation sweeps, repeated
whole setup or numerical test quota. Retain whole-path wall/CPU/setup costs
under cc570/R4. Full independent exact-head source/removal review and normal
landing precede claims. This draft commissions no provider/account operation,
deployment, browser run, package install, source execution or test.

Read credit: targeted current R2 browser states/pages/two-device/Work/task/
attention/deferral passages and R28 revocation/lifecycle/owner-map excerpts;
whole original 006 task ledger displayed; no new whole R1/R2/R3 body review.
