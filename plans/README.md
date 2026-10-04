# Credential cleanup handoffs

## Composable lanes and GitHub demonstration

[017: Composable authority scopes, lanes, and the GitHub demo](017-2026-10-04-composable-lanes-and-github-demo.md)
is architecture Draft 2 dated 2026-10-04 under planning request
`5c716a5c35bfdbdcef89e1e4fbe82df4aab0b8fd`. Hugh's direction starts
with composable authority scopes and defines lane as work as it happens:
issues/goals, discussion, commitments, splitting concerns and recombination
into an exact proposed and mergeable deployable change. Issues and PRs are
lane forms. The demo target is an exact-as-reasonable GitHub experience.
Production rollout is explicitly outside this design. Hugh's clarification
`d4e07064` establishes the sequence: one compelling complete demo; the
composable architecture that supports it; explicit retargeting of all other
Artroom applications and components. No backward compatibility is required.
Completed and in-flight architecture may be replaced or retired. Planner
owns the complete retargeting ledger, successor requests, removal tasks,
independent review and revised sequencing. Demo success alone does not
complete alignment/removal. Runtime mechanisms remain proposed; this draft
changes no source implementation. Status: DRAFT 2, planner handoff.

[018: Demo-first task and retargeting ledger](018-2026-10-04-composable-lanes-task-ledger.md)
records the full revised input, explicit supersession of initial S1–S4,
five successor design requests R0–R4, decision owners, proposed source and
removal packages, and an all-component/application category inventory.
All five now have builder promises: R0 `30c06d80` / `cbbf8612`,
R1 `c69b573d` / `8d614272`, R2 `fe47970e` / `8da8b218`,
R3 `f2d23e6f` / `8661af6b`, and R4 `b18554a6` / `f3c5d607`.
Frozen 018 records its earlier status snapshot. Initial S1's
promise raced unclaimed replacement; requester withdrawal `0de4b3a0`
now projects cancelled, and R1 is separately accepted. The other three
unclaimed requests were guardedly retired/replaced. No source completion
is claimed by those acts.

Frozen 018 is primary `f7ebb23b`, attachment commit `8df56a19`, 22,650
bytes, SHA256
`1ac551d6281f7a09e952d3f9d749e2133ace083f096fd5ed38e0f0de8852bf2b`.
Local/attachment byte equality, local links and whitespace were verified.
Joint exact evidence-only review `edaad58f` covers 017 Draft 2 and 018,
D1–D8/P0–P8/A1–A10, three browser outcomes and the complete removal
boundary. It is queued with no executing reviewer; the existing native
checker remains terminal/restricted, with no restart or substitute.
Planner promise `efc0d86c` continues. Exact source-level inventory and
formal dispositions for other incompatible promises remain owed.

Builder delivered R0's first draft in `98fee5dc`, at exact head
`542c3bfff32ee2ab8cd9b6a9f263a695897ae7fa` on `request/demo-contract`.
Planner read the complete demo contract (945 lines) and all three
inventories (785, 442 and 293 lines); its four-file design-only diff passed
the whitespace check. Internal correction `b9eb7419` requests explicit
coverage of the full workspace, browser and device outcomes; separates
hold expiry from responsibility; distinguishes refusal before an
irrevocable effect from reconciliation afterwards; qualifies GitHub parity
and inbox-only attention; corrects current inventory/tooling/manual scope;
and requires attributed task closure without calling cancelled delivery
complete. Source-baseline reuse is proposed, with no automatic release or
main merge. Runtime design and settlement choices still need their named
owners. The builder should revise with a correction matrix before filing
independent review. R1 design may continue. No old task, external duty or
review invitation was closed by this correction; it is not independent
approval. The ephemeral heads-up failed because the builder inbox was
full; the durable correction is effective.

Builder also delivered R1's first scope/replay draft in `4131c1f4`, at
`8416c414df68f11b2a789ebb686de0bf1895c4d4` on `request/scope-contract`.
Planner read its full 842-line contract and 420-line admission-read
inventory; the design-only diff passed the whitespace check. Effective
internal correction `a670d34d` requests construction without circular
creation/source hashes; time-dependent revalidation after preparation;
complete pinned act semantics; recursive source verification with explicit
trust and replay limits; distinct refusal, retry and settlement behavior;
retention and capacity for outstanding duties; and complete contribution
authorship for review. The separate per-scope queue and conservative local
head validation remain proposed. A corrected exact draft and correction
matrix are owed before independent review. No protocol or source adoption
is claimed.

R0 revision 2 arrived in `c2aa096c`, at exact head
`b02a85a9a86077c2b6457d592a1c6070a0da2623`. Planner read its complete
1,250-line contract and 21-line correction matrix; the three inventories
are unchanged from the first reading. Its two-file revision passed the
whitespace check. Effective internal follow-up `86fc02fd` preserves the
revised story coverage and requests the remaining commissioning fixes:
C2 needs an explicit staged retarget, because the original spike depends
on the reviewed C1 authority contract; checkpoint and deletion witnesses
must preserve its full acceptance scope; a refused push cannot release a
slot while an earlier attempt could still write; and the rebuilt task
ledger needs exact provenance. Planner also proposed cancelling the
obsolete MCP source amendment's remaining integration, while retaining
four historical-note deliveries through `50d7806a` with review and landing
still owed. These are proposed dispositions, not closure acts. A corrected
exact head is still needed before independent review. No provider probe,
runtime test, implementation, adoption or task closure followed from this
reading.

R1 revision 2 arrived in `3ee06d0a`, at exact head
`8ceb151059977fcf8f01f6ce63d599a68cba126a`. Planner read the complete
1,244-line contract and 28-line correction matrix; its admission inventory
is unchanged. The revised note's bytes and reported SHA256 match, and
the two-file revision passed the whitespace check. Effective internal
follow-up `ba913350` requests unambiguous identities for multiple items
opened by one entry; an explicit provisional-child confirmation path;
terminal delivery responses and supersession; a stated runtime source
trust boundary; and complete initialization, selectors and report
attribution. The single namespace and inbox also need to agree with R0.
These are open foundation decisions for the corrected draft and its
independent review. R2 and R3 may use it as design input with the gaps
named; no executable contract or source adoption is claimed.

R0 revision 3 arrived in `15751680`, at exact head
`a3d0ce4c5337c98bf1e9f507813d3b8605c03894`. Planner read every change
against the fully read revision 2, the complete 40-line correction matrix
and new 76-line ledger-source evidence. All three revised files' bytes and
hashes were checked; the revision passed the whitespace check. Main note:
118,495 bytes, 1,300 lines, SHA256
`9b66892b2a865319f96ebf1f4681e7ec6b271253d3970c65b38ab054a1cc1dbf`.
Effective internal readiness `7e66c453` asks the builder to file all six
files at that exact head for independent design review. The five latest
corrections are addressed for that review, including staged C2 delivery,
full recovery witnesses, uncertain publication, historical dispositions
and exact task-ledger provenance. R1's foundation fixes remain open.
Implementation scopes and task dispositions remain proposed.

Checker status `25c25dc3` confirms that the earlier verifier turn failed
an automated cybersecurity-risk review. Its retained source and bounded
runtime reports are evidence, with remaining review checks unfinished;
there is no verdict on `a23cfe01`. Presence and a promise do not imply an
executing or completed review. No restricted reviewer is restarted,
replaced or rephrased. The exact design reviews remain pending, while
permitted planning continues.

R2's first draft is announced in `9166ffc5`, at exact head
`c2a0987d142cda2fa8ed123878c07cf79ef4bd2a` on `request/lane-forms`.
Its handoff names the complete browser flow, two-device journey, lane
forms, dated GitHub comparison and eight proposed grammar gaps. Planner
has now read all 819 lines of the note and all 533 lines of the evidence,
recovering truncated spans, and checked their bytes and hashes. The
design-only diff passed the whitespace check. A bounded check of current
official GitHub references and the existing Jam timing contract informed
effective internal correction `5f83a4bf`. Its eight groups cover exact
report/commitment and selected-input binding; goal and judgment subjects;
verdict preservation and check recovery; creation, plans and handover;
source freeze and atomic link edits; deletion and replay; browser recovery
and enrollment; and Jam semantics, bounds and compact source evidence.
A corrected exact draft and matrix are owed before independent review.
No runtime gate, provider probe or source implementation was run.

The builder has filed all six R0 paths at `a3d0ce4c`: primary `674473eb`,
corrections `7ed9ab4e`, ledger source `862f272c`, source inventory
`00ddc3cf`, workroom inventory `065f3426` and documents/repositories
inventory `40d4af78`. Planner inspected each attribution and the complete
independent review invitation `de653836`, which is open and rests on all
six exact artifacts. It is queued, with no verdict or adoption claimed.
Checker planning evidence `eb4632f5` verifies a bounded source census and
identifies one wording correction: section 9.6 names three measurement
configurations, so "Four" should read "Three". Builder recorded that
erratum in `2abe4923`, preserving the filed bytes. Evidence `d26606b3`
checks all seventy ledger request identities, thirty-eight promise
bindings and five historical approval subjects, without establishing
the narrative safety reasons or completing original conditions. Its
full design review is unperformed. Reconciliation `b491912f` confirms that partial planning
reading has closed no promises and approved no design. Original review
and settlement duties remain pending.

R1 revision 3 arrived in `814853a9`, at exact head
`4b7f77eb3955a9f81a1a502b561f20c86eb7dbc5`. Planner read its complete
two-file revision against the fully read revision 2. The main note is
1,407 lines, 81,298 bytes, SHA-256
`808aafce1b7fc0c8a1d2935acbd25008b036236593b695a3731f238145514c3a`.
It resolves the item collision, confirmation exception and terminating
message exchange. Correction `f4ed2dab` asks for four remaining points:
receiver loss cannot prove an earlier request had no effect; entry and
replay types must express the new message outcomes; founding-child seed
causes need distinct replay rules; and effects must check aliases after
resolving actual local item identities. The R2 grammar extensions remain
proposed and must follow the current application corrections. Whitespace
checking passed. No independent verdict or source authorization is implied.

R3's first authority and publication draft arrived in `c2408d90`, at
exact head `43b68f5a6d1f1a68bcb494062fa2db0e081f7ef9`. Planner read all
888 lines of its main note and all 723 lines of the source-reading
evidence. The main note is 56,110 bytes, SHA-256
`f2f78fb0db14cfdb8f4a99580d97b5916cad533c90b7a9c6ff4035357fc45483`.
Correction `f6c4d14b` asks for nine groups: complete bounded authority
proofs; device and direct private-resource controls; separate writable
workspaces for plural commitments; no inventory-based settlement of
unknown creates; correlated publication messages and complete source
eligibility; evidence for every possible dispatch; explicit publication
and abort-fence assumptions; object staging and receipt ownership; and
safe founding replacement with complete resource retirement. Both notes'
whitespace checking passed. No independent verdict, adoption or runtime
work is claimed.

R2 revision 2 arrived in `3265ebea`, at exact head
`f146aa2ef1f77775b49ec2f07c47f5879f978e42`. Planner read the full main
note (1,121 lines), correction matrix (25 lines) and documentation
evidence (533 lines). The main note is 84,087 bytes, SHA-256
`77ca6209ee61404d7d5eee83b0d1d9f3356ce3e8ec6396bd20f8338f2665e62d`.
It improves verdict preservation, check retries, commitment forks and
redaction coverage. Correction `36115bc5` asks for six remaining groups:
uncertain send/expiry recovery; exact goal/plan/concern coverage including
failed creations; parent-result and inherited-input provenance;
executable job supersession and own-action guards; correlated publication
progress and frozen eligibility; and precise redaction/presentation
controls with two bounded documentation qualifications. Whitespace
checking passed. No independent verdict or runtime work is claimed.

The builder filed R1 revision 4 at exact head
`665e490bf474d44065ad6618dce4478c76306623`: primary `f47508dc`,
corrections `bead7549` and admission inventory `76e0cf78`. Planner
inspected all three attributions and the full independent invitation
`6d348d8a`. It is queued and has no verdict. The complete revision 4
delta against the fully read revision 3 is next; filing does not prove
the requested corrections or authorize implementation.

Checker status `da822d58` records its standing goal as blocked: the last
known native reviewer failure remains the automated cybersecurity-risk
rejection, and recent status reads failed at the local transport. The
pending independent invitations remain open. Planner can continue design
corrections; no reviewer restart, replacement or rephrasing is authorized.

Direction `d4e07064` governs current commissioning. Older sections below
record historical approvals, ownership and previous sequencing; they do
not require legacy support, pre-change replay or completing an obsolete
architecture. Useful outcomes and test economy are reassessed under the
new model, and real unknown external duties remain until safely accounted
for. Removal accompanies replacements; successful demo alone cannot close
all-component alignment. Source implementation still needs relevant exact
independent design adoption.

## Original credential cleanup audit

Focused read-only audit under gitseq request `c01205f5d967ccef69319549dd1734b3e108a8b0`, with promise `51ef2bd2a3829800872ccd25f072cbe28dc961f1`. Started at approved main `72d6abde5c6dfa993ac441884e8f966a903b932f`; reconciled to `bd520fb926f8161a722c6f1e23ae4aac29e41a66` after the separately reviewed A7 landing. That landing's tree equals approved head `84e25a78883e03f7accf1a18d66d8866eea94195`. The Git paths below are unchanged; Room founding line references were refreshed.

The improve skill supplied the handoff format. Four verified fixes were selected under the user's standing autonomous checker instruction. Priorities and effort estimates set review order only. They do not cut scope. Source code was not changed by this audit. These plans have not been implemented or approved for landing.

| Order | Plan | Impact | Effort | Fix risk | Confidence | Status |
|---|---|---|---|---|---|---|
| 1 | [001: Complete token inventories](001-complete-token-inventories.md) | Prevent premature workspace grants and writable “ready” snapshots under incomplete provider replies | M | MED | HIGH | DONE, pending review |
| 2 | [002: Unknown fork effects](002-retain-unknown-fork-effects.md) | Preserve late-create cleanup through foreign occupancy | M | LOW | HIGH | DONE, pending review |
| 3 | [003: Terminal publication cleanup](003-retry-terminal-publication-tokens.md) | Retry known credential revocation after a successful landing | M | MED | HIGH | DONE, pending re-review after [review f060871b](#review-f060871b) ([report](#plan-003-report)) |
| 4 | [004: Founding wake](004-persist-founding-wake.md) | Recover first remote founding effects after host interruption | M | MED | HIGH, static path | DONE, pending review |

Plans 001 and 002 touch the same workspace cleanup function; serialize their edits or explicitly reconcile the second head. Plan 004 also touches workspaces.ts and should follow that reconciliation. Plan 003 can proceed independently. Every executor must use a gitseq request/promise, preserve unrelated work, run the stated gates and deliver all artifacts at one exact head for checker review.

Design note for review under request `a2cbd459`, following assert `4e4134b4` as corrected by `b2cdc44a` (acts are declared by each application): [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md).

## Connected browser coding stories

[005: Durable browser coding across devices](005-2026-10-03-browser-cloud-work.md),
dated 2026-10-03, is the frozen Draft 2 under planning request `b5f1fb3f`,
promise `28e63ebc`. It connects durable cloud coding, the complete browser
journey and same-member device continuity. It reconciles all six groups in
independent Draft 1 review `25065edf` / guarded verdict `c80ef89e`.
The exact revision was independently approved for commissioning in
`fc77cf82` (ratified `412c7bce`), then adopted as product direction
`0f358e52` (ratified `cfc2d66f`). Its workroom evidence artifact
`209a5ec9` names commit `a15aed52`, attachment
`2026-10-03-browser-cloud-work-draft2.md`, SHA256
`10b9d2650aeb774c0811cce51f213a432d7495fc3dad5899cb0ab1b38de6fecc`.
The saved note preserves those exact reviewed bytes; its draft label and
proposed-package table describe that frozen version.

The approval carries one explicit contract choice: raw private reads
initially require a direct owner/admin device session, with direct-key
provenance and current role/resource checked by the trusted Room boundary.
A returned member handle is insufficient. Delegation-issued read sessions
are denied raw resources by default; signed task controls remain separate.

All six self-contained implementation requests below are addressed to
builder. They inline the reviewed decisions, dependencies, acceptance and
bounded validation. Requests are not implementation completion. The
contract task also owns eventual repository integration of this saved
planning note and commissioning index through normal source review/landing.

| Work | Request | Dependency order |
|---|---|---|
| Authority and lifecycle contract, types and trusted Room boundary | `b538c5eace50a1de82a8bdf8a8f19764548af15e` | Reviewed design; reconcile acts/client and test workflow |
| Real coding recovery spike | `6cdaf20fa260d6d6c6b30e83f585883a51b964f4` | Relevant reviewed contract decisions |
| Production durable coding agent | `13dfc613e8e3d9a1aed5f7492272fbf8c580d727` | Contract/boundary and reviewed recovery spike |
| Browser identity, onboarding and authorized import | `18815307e6c306d63766230ed7eb7ddbf94d1f21` | Contract; reuse lane J and policy bootstrap `a13a0bf5` |
| Complete browser progress, steering and review | `cfbde32f20618231aed598f63f3898cc188d0ffd` | Live runtime/identity; reuse stage 5 and cleanup `8d249233` |
| Joint deployed acceptance and user docs | `d89fc17fb60a7c8a3591e23193596c981781b26c` | Integrated journey, policy/cleanup; coordinate existing docs plan |

Test-overhead `ecbc722a` has independent approval; main integration remains
owed. Builder now resumes acts, builder-identified Jam blockers, and
Jam/docs in parallel after builder-positive readiness.
These stories add no first-Jam readiness gate. Initial delegated-agent
runtime, reusable agent identities, private-source OAuth, browser IDE and
preview remain later choices; no implementation or shipping is claimed.

## Experience and developer adoption

[006: Experience-to-task map](006-2026-10-03-experience-and-developer-adoption.md)
is Draft 1 under planning request `2262034d`, promise `4d8de5d7`. It covers
all ten scenarios in the supplied experience/DX analysis, reuses the six
connected-story requests, and proposes seven missing packages. Independent
review `48cb948c` approved commissioning in `a259c26d`, ratified `bf77c8cd`,
against evidence-only artifact `5b32100a`,
attachment commit `109501e9`, SHA256
`7bdca0fd19a8c26613c9e9ea427c6cea1c3296c7fa429ff3ff1561135e03a381`.
The local plan matches those frozen bytes. Earlier metadata/invitation
`fcaec9bb` / `00a2d4cc` were retired to correct a final-newline hash.
The commissioning scope was adopted in `cf116410`, ratified `711f7826`.
[The companion task ledger](006-2026-10-03-experience-and-developer-adoption-tasks.md)
records seven effective builder requests and the five explicit full-scope
review details. Six requests deliver designs before separately commissioned
implementation; N6 delivers the complete already approved manual beside Jam
after builder-positive readiness. New protocol/runtime choices remain subject
to review and adoption. The full documentation scope, test-overhead priority
and builder-owned Jam start path are retained.
Planning request `2262034d` is satisfied by report `51a4cfdc`, ratified
`389dc7ee`; implementation remains queued. The independent checker also
read all seven effective requests in full and found no handoff correction.

## Attention delivery handoff

[007: Attention delivery for the durable coding runtime](007-2026-10-03-attention-runtime-handoff.md)
is an independently reviewed planning addendum to wake/schedule request `24711ceb` and runtime C3
`13dfc613`. It identifies the older wake note's unspecified cursor meaning
against the Room's exclusive attention position, and separates durable
input delivery, attention closure and authoritative work outcomes.
Planning clarification request `03d85a35`, promise `9e8e3081`, tracks the
addendum. Draft 1 review `40514a0a`, ratified by `12211341`, requested
visibility catch-up, ingestion ordering and inherited author provenance.
Frozen Draft 2 evidence `c85631b5` names attachment commit `7f3cb69d`,
14,606 bytes, SHA256
`6b0cb9cd9f8079ed0ff21d5b3d13bb3838bfb2c5678f8a930cbf7f40d068ca5d`.
Successions `3cb8e697` and `d0009274` preserve Draft 1 history and replace
the first Draft 2 primary's stale review dependency with live provenance.
The bytes are unchanged. Succession `d8caf1f6` withdraws the stale
invitation `c2875063` in favor of one live invitation.
Independent evidence-only approval `78be0cd1` for review `16a23469` is
operative and was ratified by `3057e53a`; the earlier stale-lineage verdict
`18a209d0` remains historical. Private runtime handoff `34c5274b` was
ratified by `bb69d6f3`. Planning completion `07e0fdf7`, ratified by
`96634818`, closes `03d85a35` only. Public wake cursor, attention closure
and added read-field choices remain open for their named contract owners;
runtime implementation and the older wake-note review remain owed.
Draft 2 addresses source-derived case `b5471b77`: role/team or work-filter
changes can reveal older queue positions. It proposes bounded fresh scans,
separate scan progress, re-evaluation of filter skips, deduplicated input
identities and fences for overlapping ingestion. The frozen draft keeps its
pre-review status text; this index records the subsequent approval.
It adds no implementation
request or Jam gate and preserves the reviewed bytes of 005 and 006.
The older full wake/schedule note received changes review `2acf4f43`
under request `e34ac0c1` and checker promise `2723c332`, against exact
primary `c44e96df` at `337a449d`. Ratification `24a58dd6` accepts that
review delivery. The six bounded corrections cover delivery guarantees,
qualified closure, schedule firing/recovery, coalescing, private secrets
and budgets, and actual watcher availability. The original planning
request `24711ceb` still owes a reviewed correction and source integration.
This remains below actual-task acts reviews and adds no Jam gate.

[008: Wake and schedule clarification](008-2026-10-03-wake-and-schedule-clarification.md)
is frozen Draft 2 under no-Git planning request `45065116`, promise
`6a209eaa`. Draft 1 review `f965c475`, accepted by `08cf96df`, requested
one correction: non-scoped housekeeping is action work, and notice
acknowledgment cannot complete its requested outputs. Current primary
`3ee468ec` names attachment commit `649b7cd8`, 26,682 bytes, SHA256
`bb4eedbd29bae8834a903471c144dded1a32f8dc7e440edda32382ecd073facc`.
The local file matches that attachment. Supersession `5ba48e8d` retires
Draft 1 primary `552abe62`; the fresh candidate's own-promise bases remain
live. Independent planning rereview `033f6473`, promise `f45ece69`,
approved the exact evidence in `8365e4c4`, accepted by `2fec61af`.
Draft 2 retains firing-linked non-scoped action work, a qualified recorded
result and its outstanding/coalescing lifecycle without requiring a lane
or new public acceptance field. Its proposed activation/time, coalescing
and budget semantics were adopted as planning direction in `6068751a`,
ratified by `bc9ec5ab`. It preserves
the adopted scope/defaults/staging and approved 007. Public encoding and
runtime work remain with existing owners; original `24711ceb` source
integration remains owed. Planning completion `e87fe126`, ratified by
`e33176bd`, satisfies `45065116` only. The frozen file retains its
pre-review status label; this index records operative approval and adoption.

## MCP planning review

Original MCP planning request `489a992e`, promise `932ce20e`, still owes
independent review and source integration. Current primary `91e3d26a`
names the complete Revision 3 at `b5add513`,
`notes/2026-10-01-mcp-plan.md`: 32,581 bytes, 582 lines, SHA256
`c79336c71296da583a929b497721ddf97380988373b4e8851287f1fcbd004962`.
Full source-note review `711ded30`, checker promise `099e171b`, returned
changes `4e542273`, accepted by `5877afdf`. Its seven bounded corrections
cover general declared-act routing, frozen prepared retry meaning,
conforming error schemas/explicit credential outputs, OAuth client consent
and current Room authority, caching boundaries, source/staging/owner status,
and qualified external client/subscription claims. The dated reconciliation
remains owed under the existing planning promise, below actual-task
functional work. It preserves adopted `775acdd3` goals and
staged scope while reconciling fixed code-room assumptions with declared
acts, prepared meaning and existing C1/N1/N3/N4/N5/N6 owners. The old
vendor/client statements remain dated evidence; the current
[MCP version page](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning)
calls 2026-07-28 current, rather than final. The plan's review is distinct
from the MCP core implementation and adds no runtime suite or Jam gate.

[009: MCP clarification](009-2026-10-03-mcp-clarification.md) is frozen
Draft 2 under evidence-only request `7fc05f06`, promise `9e739dea`.
Primary `514c43ba` names attachment commit `b15eca8d`, 35,977 bytes,
537 lines, SHA256
`c5bd4fbe66c424e12db24a34baeaa4bad15495adf423412ce1ba8108fc0e7343`.
The local note matches the frozen attachment. It responds to all seven
accepted corrections, retaining the complete surface, adopted staging,
named owners and acceptance. Draft 2 corrects the planner's overbroad
checker exclusion against adopted `fa120186`: properly bound declared
check steps may use generic MCP, while legacy bearer check, bearer roster
and ordinary independent-check qualifications retain their boundaries.
Supersessions `98a20ce5` and `b07ffaff` retire Draft 1 primary `d89250a8`
and invitation `24db7e09`; its attachment remains historical.
The fresh primary rests only on the live own promise and fresh freeze.
Independent planning review `b2162238`, promise `0809f54b`, approved the
complete exact Draft 2 in `db41608a`, accepted by `04b94a1d`. The full
surface, adopted staging and all seven corrections remain. Planning
guidance `c18af03e` records this accepted revision without granting runtime
authority. Completion `81faccb0`, accepted by `8266ca84`, satisfies only
own clarification `7fc05f06`; current inspect confirms that status.
Original `489a992e` source integration, runtime/schema approval, final
dual contract/runtime binding and deployment remain separate. The frozen
note's dated Stage 2 status cannot revive withdrawn approval `25bede37`.
This clarification adds no implementation lane or first-Jam gate.

MCP core functional verdict `bc0d7f6b` requests changes at `50216bb1`.
Its original runtime scope remains open. Planner has republished all four
own `a9788a59` / `ee3d9036` contract artifacts at composed review head
`048c7411`: primary protocol `baa91897`, transports `7342cd7d`, index
`52240536` and example `b121df57`. Their exact bytes and SHA256 identities
were checked; all four also match `947fb909`. This removes the planner's
missing-artifact blocker at `048c7411`, without source edits or approval.
Final functional review must explicitly bind both original contract and
runtime scopes at one final composed head and assess the original result
and schema conditions. Grantor-revoked bearer request `5d41ea36` now has
its separate exact-head approval `65df0958`. Real binary-to-Room and
expired-bearer stdio coverage remain unshown limits, not two additional
tests prescribed by original `9ca1d290` or verdict `bc0d7f6b`. The complete
original MCP plan's cold-agent/deployed acceptance keeps its existing
owners and scope. No new first-Jam gate is added by those coverage limits.
Later source changes require metadata at that actual review head.

Builder has confirmed the final-publication order: after the `d691e6e9`
verifier verdict and any required repair, update the MCP report's dated
state and dependencies, then name that composed head. Planner publishes
the original four paths there, including
`packages/contract/examples/demo-loop.ts`; builder then files one full
contract/runtime invitation at the same head. At `d691e6e9`, only the
protocol's carry-report paragraph differs from planner publication `9451aa24`;
the other three contract blobs match. This is publication preparation and
scope clarification, without new runtime evidence or source approval.
Planner observation `32f5446d` records the correction and agreed sequence.
For the final report-only commit, the adopted testing workflow carries
checks with the tested and delivery tree identities and an explicit
source/tests-unchanged statement. It does not repeat the full gate for
documents alone. Any further source repair keeps its relevant checks.

## Other original planning reports

Two original reports still owe independent review and source integration.
Their reviews follow actual-task functional work, 008 and the full MCP
plan. The complete exact drafts and current workroom states were refreshed.

| Original work | Current source evidence | Queued review |
|---|---|---|
| jj comparison `966aeaad` / promise `bfb563fe` | Primary `e51dc84d`, `notes/2026-10-01-research-jj.md` at `b3050dc6`; 12,816 bytes, SHA256 `8563588cd23c7047eb3572bd61b78b432b87eef85141e467cb08d63b72aa516f` | `a9c34999` |
| Collections of Rooms `34cf52b3` / promise `6430ffd4` | Primary `5c69660e`, `notes/2026-10-02-collections-of-rooms.md` at `5b579511`; 47,931 bytes, SHA256 `4179cca075e3c9ff2ed83ae7519eea98e23228c71375d7f636f054ea9f65038d` | `106bd3ca` |

The jj review preserves the recorded choice to pursue safe client/header
handling and per-change history. Existing bounded implementation and
measurement evidence is credited separately from live product gaps below.
Changes verdict `6649bb50`, accepted by `fef19f77`, requests four bounded
corrections: qualify operation-log concurrency separately from working-copy
and Git-backend locks; distinguish an unresolved landing merge from jj
conflict data stored in Git objects; pin source identities and qualify
header/interoperability evidence; reconcile follow-up boundaries with
declared applications and existing N1/C2 owners. Items 1 and 2 remain
worth doing, item 3 is not pursued and item 4 remains undecided. The
original note's corrected review and source integration remain owed.

[011: Dated jj clarification](011-2026-10-04-jj-clarification.md) is frozen
Draft 1 under evidence-only request `63be1105`, promise `152a3b84`.
Primary `9acd28e0` names attachment commit `5d0d606e`, 25,637 UTF-8 bytes,
423 lines, SHA256
`cd74665c0e516d30edfdc078d18f2410574d8ec2f6a221d383c62ab175e3139b`;
the local note matches the frozen attachment. Independent planning review
`bf425045` is queued below functional acts and the carry amendment.
Checker promise `ad9885e7` and guarded evidence-only approval `e7cc8c03`
have since completed that review, accepted by `10b794ba`. Accepted
clarification guidance `cb4613c9` preserves the recorded choices and
existing owners. Completion `8ddc4745`, accepted by `de44ea91`, satisfies
only own `63be1105`; current inspect confirms that status. The frozen
note retains its dated pre-review label and exact bytes.
It reconciles all four accepted correction groups throughout the complete
comparison, retaining all four recorded choices and existing owners.
Pinned jj v0.45.1 sources describe that dated baseline. Main `e6e67828`
already has header test source, a bounded Artifacts measurement with a
stand-in Room, the changes-only conflict refusal and a mock per-change UI.
The new merge commit's header is distinct from the original reachable
object's header. Live authorized history reads and hosted/device recovery
remain existing N1/C2/C3/C5/C6 work. Planning approval and original `966aeaad`
source integration remain separate; no new implementation or Jam gate is
commissioned by this clarification.

Collections review `106bd3ca` is promised by `10d431c5` at the same
complete source head. Guarded changes verdict `e1f72af6` was read in full
and accepted by planner. Seven correction groups retain the full scope:
fresh replayable authorized revocation and direct-key coverage; targeted
activity and outage limits; one sale decision and explicit disclosure
limits; source-authorized reporting/coordinates; preserved work with
current controls and coherent join/delegation; changing standing/usable
agency; precise dated source and runtime claims. Original corrected
planning review and source integration remain owed. These are proposed
contract/source corrections, not runtime defects or new Jam gates.
Collections preserves
the previously delivered user-first draft and
Hugh's current wording, all ten walkthroughs, four revocation alternatives
and 41 traceable requirements. Its proposed collection/mandate mechanisms
remain future design. Neither review adds implementation requests or a
first-Jam gate; review approval alone cannot prove source incorporation.

[012: Dated collections clarification](012-2026-10-04-collections-clarification.md)
is frozen Draft 2 under evidence-only `b9877507` / `7184dd20`.
Primary `ed154082` names attachment commit `2bea2e84`, 89,844 UTF-8 bytes,
1,105 lines, SHA256
`7d621bc99d44d8c0b12aa540dc259a814926f0a31f8f1fd816222c3062883cbd`;
the local note matches the frozen attachment. Independent planning review
`a694028a` approved complete Draft 2 in `2baa8ef7`, accepted by `f78144e4`.
The complete original was
reread, and the revision preserves the model, six constraints, all ten
walkthroughs, four revocation alternatives and 41 numbered requirements.
All seven accepted corrections are reconciled throughout, including fresh
complete authorized retained revocation proof and direct-key recovery,
actual activity/known discovery/outage frontiers, unique sale decisions and
private disclosure, source export/query privacy, saved-work versus fresh
control, changing standing and pinned evidence boundaries. Section 9 maps
focused acceptance and existing owners; unresolved contract/encoding
choices remain explicit. No mechanism adoption, source integration,
runtime implementation or Jam gate is claimed by freezing this note.
Full Draft 1 review `a3c58958`, accepted by `331d44e8`, reconciled all
seven substantive groups and retained the complete scope. One P3 corrected
source attribution: the pi spike uses the actual pinned Room/client with
real policy, landing and log components over fake repository/publisher
services, with simulated workspace/push and caller-driven resumption.
The token path and production C3 remain unproved. Draft 2 changes only
that passage and its label; the entire delta and byte identity were checked,
with no runtime rerun. Supersession `cddd0167` retires Draft 1 primary; fresh
provenance uses only the live own promise/freeze. Provisional freeze
`0a204ae6` was replaced by `2bea2e84` and retired in `ed0c0155` to avoid
inheriting old-candidate review staleness. The accepted full Draft 1 review
is historical assessment evidence carried only across unchanged text.
Reviewed handoff `b5aab68c` preserves original `34cf52b3` source integration
and every selected mechanism's bounded evidence duties. Completion
`09dc707b`, accepted in `5297ec5e`, satisfies only clarification `b9877507`.

## First Jam release decisions

[013: A reviewed first release for Jam](013-2026-10-04-first-jam-release.md),
dated 2026-10-04, is frozen Draft 1 for builder's integration decision
`18060abc`, authenticated UI scope decision `a49b78ab` and package
availability decision `1d4e5b39`. Planner promises are `bc297ae7`,
`82e04fe2` and `4f56cf10`. Primary `741e4502` names attachment commit
`e0e80927`, 16,255 UTF-8 bytes, 295 lines, SHA256
`68612673f6b4c54f569a376aea1a2e0bcbbccbf671be94742980c176ba5d9602`.
Complete independent planning review `51486c08` approves the frozen text;
planner accepted it in `8b0b1a76`. Direction `90939141`, ratified in
`0cdace8f`, adopts the decisions. Fresh requester direction `8021b270`,
ratified `58a6c383`, preserves their full scope without inheriting retired
source artifacts as current commissioning bases. Inherited staleness was
inspected: this is a dated planning assessment, not source approval at
the later `7931d5e8` or `077bf24a` heads.

Current ordinary decision reports `27049c0e` and `61c0f684` now answer the
original integration and package requests without stale provenance. Both
attach the complete 013 text, preserve all original conditions and name
the fresh commissions below. Builder accepted them in `e654c4cc` and
`6cb6ef4c`; both original requests are satisfied. They replace retired
reports `a6824b80` and `b6dd55dc`; attempts to accept those retired reports
were ineffective. Builder also accepted historical UI report `bdd0ebd5`
in `7eed990b`, satisfying `a49b78ab` with its stale source qualification
retained. No refreshed UI decision request is needed. Current scope
ownership is already recorded below. These are
planning-record corrections, with no source approval or implementation
review restart.

Intermediate verifier delivery is commissioned as `42342e35`, now promised
by builder in `4e66accc`, under that new promise alone; original Stage 3
`1e8fee4b` / `3af8ebc7` retains complete
accounting, every original outcome, all ten carry cases and points A–F.
Actual CLI and machine-readable limits must disclose the incomplete pass
accounting; the sealed source binding must not claim original Stage 3
completion. The full carry Draft 2 at `077bf24a` is assessed in
[014: Carry-pass Draft 2 review](014-2026-10-04-carry-pass-draft2-review.md),
report `794e6f86` under `baf43319` / `357e0bcd`, accepted in `3034c23d`:
changes requested in A/C;
B/D/E/F accepted with precise qualifications. That dated decision retains
all thirteen cases. Complete Draft 3 at `90b91f31` now has an accepted,
amended incorporation copy in
[015: Carry-pass Draft 3 decision](015-2026-10-04-carry-pass-draft3-decision.md).
Ordinary report `7634a884` answers `ac8b8fd7` / `a7304876` with all A–F,
all fifteen cases, both open choices and exact owner/order instructions.
Builder accepted it in `6693d748`; the original ordinary planning request
is satisfied. The whole contract is adopted
in `4fa3fe0c`, authorized by `1d2319ba`. Section 35/amendment 8,
R-CARRY-17–19, is checked unused at the reviewed head. The saved 015
contains the complete incorporation copy, not a summary. It preserves
declared-name compatibility, makes attempt/pass allocation the actual
durable engine fence, resolves current no-tree checks versus forbidden
land/closed-pass use, discriminates preview owners, and qualifies full,
integrity, mixed-history and unfinished-prefix reporting. Existing Stage 4
owns source protocol/types/producer incorporation; original Stage 3 keeps
full accounting and all other outcomes. Design adoption approves no
source and adds no first-Jam gate. Selected-mode wording is clarified by
[016: Verification modes](016-2026-10-04-verification-mode-clarification.md),
adopted `f8ed56c6` / `03a41871`: disabling policy replay does not disable
or deny independently retained Git-object consultation or landing guards.
The complete unchanged 015 and exact replacement paragraph are both
attached to that record; all fifteen cases and original owners remain.

Fresh scope amendment `04880e7e`, ratified `8464d0e7`, transfers only the actual
authenticated unknown-act browser entry/witness to existing C5 `cfbde32f`,
dependent on C4 `18815307`. Its C5 acceptance addendum `0a9a086c`, ratified
`85236634`, retains the real browser/Room witness and authoritative result.
Every other Stage 5 condition remains, including capacity, catalog and
pending-intent ownership, and original-intent retention `2ee996f4`.

Built packed-package delivery `7e82100b`, promised in `1eb5788c`, covers
contract, policy, client,
MCP, log and CLI from one reviewed source commit, with exact tarball
identities and bounded external runtime/type/CLI installation witnesses.
Public registry publication remains an owner choice. N3's complete
starter and conformance scope stays owed. Every source delivery still
needs exact-head independent review, final composition and normal landing.
N3 builder promise `779cf3a6` has a design draft on
`request/starter-spec`, first read completely by planner at `82a4ba4d`.
Planner direction `37934f82` records proposed defaults and planning
corrections: valid declared targets and authority, consistent development
key custody, independent review rather than seed-key mechanics, complete
prepared-intent context, actual Jam acceptance and N5 provisioning.
The existing public founding protocol avoids making a convenience SDK
export a prerequisite. The later `fdd98295` delta corrects several act
shapes and names the candidate's Stage 4 limits; further corrections and
independent design review/adoption remain owed before implementation.
N5 promise `a18f373c` has a separate installation/evolution design draft
at `6e6447f5` on `request/app-installation`. Planner read it completely,
and the complete starter revision 2 at `7736157b`. Direction `c1b91b4b`
records proposed installation/update choices and source corrections:
keep a usable, currently authorized holder exit; qualify continuing lease
renewal and binding identity; reuse the validator's existing history
argument; distinguish candidate job metadata from complete Stage 4;
and retain the separate checker authority/provisioning owners. It also
clarifies starter recovery-key custody and signing, and removes a newly
mandatory third acceptance run. These are planning choices and source
observations, with no runtime witness or new implementation commission.
Both drafts still need independent design review/adoption and their
later implementation and acceptance. Neither is an adopted runtime change
or a first-Jam gate. The temporary publication hold was later lifted in
`bbc5a412`; normal independent design review remains owed.
The builder applied N5 direction in `8ee78cca`; planner read that complete
revised note. The remaining narrow corrections concern per-kind mismatch
wording, open-ended catalogue intervals and unfinished questions whose
leases have expired. Expiry is not application acceptance, so retirement
guidance must retain their documented recovery or name an explicit
authorized migration. No new migration API or runtime check is requested.
Planner then read the complete N5 `8ee78cca` to `98c0883f` delta and
starter `7736157b` to `6c7b42d0` delta. Observation `46ef56c0` records
their exact current heads and applied follow-ups. The N5 note covers
unfinished held and unheld work, qualified per-kind mismatch and the
active catalogue interval. The starter clarifies recovery-key custody,
one signing call, local page authorization and independent reviewer setup,
and keeps the additional handed-over acceptance run optional. No further
correction arose from those deltas. The designs are now filed: N3 at
`6c7b42d0` under invitation `cdcdabb5`, primary `f3c9cb58`; N5 at
`98c0883f` under `17f1411d`, primary `8e13237d`. Planner read both
complete invitations and their non-stale direct artifact bindings. No
executing reviewer is established; neither design is adopted, and its
original implementation and acceptance remain owed.

N4 builder promise `bc530039` has a new guidance design at `3973f302`
on `request/act-guidance`. Planner read its complete note and original
scope, then checked targeted contract and source boundaries. Direction
`87440e49` records five proposed defaults and eight design repairs:
text-only shared client guidance; caller hints from known authorized
inputs; no new authoritative read now; known refusal, unknown write and
read/wait timeout kept distinct; ambiguous policy-rule provenance;
qualified authority and waiting; exact prepared recovery; and a complete
bounded cold-agent scenario. It removes the proposed mandatory second
complete cold run and tests that merely mirror a table. Independent
design review/adoption and later implementation remain owed. This adds no
Stage 5 closure condition or first-Jam gate.
Builder applied that direction at `c938f0cb`; planner read the complete
revised note. Observation `637c1054` gives six narrow recovery
and evidence corrections. It corrects planner's own reservation wording:
an actual `reserved` refusal means the caller is not the designated
member. It distinguishes landing's write and later wait, actual read
shapes and wait boundaries, transport-specific uncertainty, exact signed
envelope replay after revocation versus an ended bearer session, and the
policy that governed an outcome. It also removes an unarranged revocation
observation and an unsupported promised refusal from the cold recipe.
These are design corrections; no runtime commission or extra test follows.
Builder applied all six follow-ups at `ec5e99ef`; planner read the
complete delta and builder's report. No further correction arose from
that inspected delta. The design is filed under invitation `408f4c0e`,
primary `f11ad1f9`, at that exact head. Planner read the complete invitation
and its direct artifact binding. Publication supplies no executing review,
adoption or implementation credit.
The current accepted decision reports are listed above; their historical
predecessors supply no current source approval.
The two fresh commissions and two scope records were inspected effective
and non-stale. Their original `34c87678`, `64dc6f04`, `98a292d4` and
`c046f97c` predecessors were retired solely to correct stale tracking
bases; the substantive scopes and dated planning assessment are retained.

Builder readiness `77a2aada` says not yet: reviewed code is not on main or
deployed, and Jam cannot yet install the application packages. The first
task can use generic acts and independent reviews without all Stage 4
primitives or complete carry accounting. Builder will judge again when
those two concrete blockers are removed, then start Jam and the full
manual together. This note supplies no new readiness checklist.

Builder source request `50d7806a` commissions comprehensive incorporation
of the complete reviewed 008, 009, 011 and 012 clarifications into their
four original repository notes, after test-cost, acts and actual Jam
blockers. It preserves all original source promises and requires a full
condition-to-source checklist, independent source review and normal
landing. It adds no runtime mechanism or first-Jam gate. C1/N1 retain
005/006 incorporation; the full manual remains separately owned.

Builder promise `14926009` delivered a reconciliation draft at
`508ac63b` on `request/notes-reconcile`, with the four notes and their
condition checklists. Planner direction `fceb27d0` answers all four
checklists' open editorial questions after reading their drift sections,
relevant frozen passages and cited source. It corrects the jj account of
parent-relative hunk positions, qualifies the pi harness evidence, and
aligns collections summaries and audit wording with their detailed
requirements. It also includes the already-requested narrow comparison
paragraph in the Artroom plan. Frozen planning artifacts stay unchanged;
their history and the operative corrections remain explicit. This is
direction for the next draft, not a complete independent source review
or approval. The temporary hold on publishing the design package was
later lifted in `bbc5a412`; independent review remains owed.
Prose validation uses whitespace and focused source, link and pin checks;
it requires no runtime suite or spike rerun.
Builder applied that direction in `b878fee9`, now ten changed artifacts
including the narrow Artroom-plan paragraph. Planner read that paragraph,
all five reconciliation files, the complete wake body and focused MCP/jj
passages. Observation `244e1f43` records independent input/output identity
checks, all 41 requirement IDs once, eight resolving relative Markdown
links outside code fences and exact-delta whitespace validity. A broad
initial link regex also matched four fenced shell patterns; those are
not links. These checks do not prove semantic completeness. The complete
other three note bodies and whole delivery still need independent review;
builder's exact-quotation checks remain producer evidence. Two narrow
provenance corrections are requested: date the jj checklist's pre-commit
statements as history and label the unavailable scratch review reports
accurately. No report recreation or runtime check is requested.
Builder applied both provenance corrections at `5c5de4fd`; planner read
the complete three-checklist delta and checked its whitespace. Note bodies
are unchanged. The N4 table also matches all 43 platform rules and ten
error codes once each in a corrected static comparison. That establishes
inventory, not the semantic classification questioned in `87440e49`.
The ten-path delivery is now filed at `5c5de4fd` under invitation
`988fdbc4`, primary `06202327`. Planner read the complete invitation and
all ten non-stale artifact bindings. Observation `415314b0` records
complete reads of the four reconciled note bodies and all five maps,
alongside the changed Artroom-plan paragraph. It does not claim a new
complete read of that plan's unchanged remainder. One narrow jj provenance
correction remains: attribute the original note's dated latest-release
claim without newly affirming that it was true on that day. Preserve the
comparison pin and frozen 011; no new research or runtime check follows.
Builder applied that correction in `18e2d077`. Planner read the entire
two-file delta, confirmed whitespace validity and the unchanged frozen
011 digest, and inspected the replacement invitation `8d3d138e`, primary
`6806aed3`, with all ten non-stale bindings at that head. Supersession
`a78ad387` retires `988fdbc4`; it supplies no current review binding.
No further correction arose from that inspected delta.
Current direct-basis observation `dadff438` preserves these reads and
limits. It replaces an observation that inherited the retired invitation's
staleness; the evidence and substantive scope are unchanged.
Whole independent review, normal landing and the four original source-note
promises remain owed. None of the four design invitations establishes an
executing reviewer or adopts its design.

Builder has promised the existing N1 proposal-read design in `4ba647c2`
under `53016b8e`. Planner reread its complete scope and confirmed that the
design/specification and implementing-lane handoff may proceed. Its reader
matrix, current authority, retention, revision examples and C5/C6 witness
stay intact. Runtime routes need separate commissioning after exact design
review and adoption; this adds no Jam gate.
Builder's first N1 design is `41b304e7`, a complete 631-line note, with
the two frozen 006 files and a separate provenance note. Planner read the
note and provenance completely and independently matched both copied
files. Direction `25b6dccd` records five proposed defaults and six repair
groups. Serving immutable inputs for client diffs is the proposed route,
with current member-backed read sessions and explicit new file disclosure.
The design must fix its empty-base inference: equal base and head also
occur for unchanged proposals, and unrelated or multiple-base histories
need qualified comparison identities. It must specify graph ordering and
parent/root/merge inputs, bounded responses and caches, missing-object and
cursor semantics, current authorization during awaited reads, and the
MCP presentation handoff. The source shows redemption throttling, not the
general read throttling claimed by the draft. These are design corrections,
not a finding against the pending release or a runtime commission. Original
N1, C5/C6 and full MCP outcomes remain owed; review/adoption precedes
implementation.

Planner read revision 2 `b4b06d26` completely: 771 lines, 40,995 bytes.
Only the note changed; the frozen 006 copies and provenance are unchanged.
Direction `a1db261a` chooses recording the actual comparison for future
generations: empty tree or all merge bases. Matching a path/status list
does not prove the original baseline or its content; older generations
need qualified displays unless retained facts establish the comparison.
The revision must also keep head files readable independently of a bounded
history listing, enforce the encoded response budget (including JSON
expansion and long path pages), bound blob acquisition, and align returned
identities with the exact types. Displayed content can inform a human
review; it cannot itself settle or replace a recorded Room outcome.
These remain corrections to the exact design and amendment proposal,
with their producer/consumer compatibility and later A1–A7 handoff.
No runtime or verifier change is commissioned by this direction.

Revision 3 `31eef8f3` applies those main corrections. Planner read all
912 lines, 50,359 bytes; only the note changed and its delta passes
whitespace checking. Direction `8deb5b15` identifies the last adapter
input gap: complete per-commit changed paths cannot be recovered from
the proposal's net paths or from known-path file reads. A path changed
and later restored still belongs to a commit's patch. The exact design
must supply bounded path discovery, with parent/root identity,
rename metadata, pagination and visible incompleteness. It must also
bound returned paths, align the permitted snapshots and legacy history
set, and remove the remaining absolute claim about multiple bases.
The existing history acceptance can cover the transient path economically.
Design review and adoption remain owed; no additional runtime work or
release gate follows from this read.

Revision 4 `c3fbb91f` adds `commitChanges` for bounded first-parent/root
path discovery and aligns the exact contract, transport, matrix and
implementation lanes. Planner read the complete delta against the
completely read revision 3; the note is now 994 lines, 55,391 bytes,
and the copied plans and provenance are unchanged. Observation `4ff5915f`
found no further architectural correction in that delta. It asks only
that the transient-path example name the selected before/after heads,
since an intermediate generation can still show that path.
Builder may publish all four exact source paths and file the normal full
independent design invitation after that wording fix. Review is queued;
no executing reviewer, adoption or A1–A7 commission is established.

N1 is now filed at `75260d65`. Planner read its complete two-hunk
wording delta, the one-note inventory and whitespace result, and the full
invitation `ad2c9cd3`. Primary `66c9f481` and the other three artifacts
bind that exact head and promise `4ba647c2`; all four are non-stale.
Observation `6f2ddd2e` supplies no further correction from that delta
and preserves the outstanding independent review, adoption and landing.
It also answers builder's scheduling question: full N2 `9c43c173` next,
then full N7 `64e9d131`. Accepted terms, actor authority, handover and
requester closure fit the acts-first priority and define what steering
means; absent-person delivery follows that design. Both keep their
original full scope and remain design work, with separate implementation
after review/adoption. Neither adds a first-Jam gate.

Builder promised N2 in `6f1481eb`, then supplied its first complete draft
at `6ffab389`: one new note, 662 lines, 40,523 bytes. Planner read it
completely and recorded direction `098186f8`. The full destination stays
an enforced lifecycle; a cooperative ledger is a reduced practice that
may support the first Jam task. The revision must make negotiated terms
and the basis/race model coherent, and supply the trusted state, party,
reference and terms guards that the proposed primitives still lack.
It must keep commitment performer separate from resource holder and
define how interpretation remains stable across policy versions.
Room receipts, application projections and authoritative guard outcomes
need distinct labels and complete-prefix evidence. Existing body `act`
and `member` fields check format, not existence or relationship; entry
anchors have a separate existence check. All original lifecycle,
handover, non-code, attention and publication-boundary scope remains.
Representative lease/activation controls can accompany the required
distinct race orders without multiplying the whole table. This is
design direction, with independent review/adoption and implementation
still outstanding.

Planner read revision 2 `95eb6a41` completely (798 lines, 49,039 bytes),
then the complete `f32e612b` delta (812 lines, 49,989 bytes). The draft
now owns workflow state and transitions in the Room, with real guarded
outcomes and a distinct reduced practice. Direction `2a78d9f0` asks the
remaining corrections: pin transition meaning as well as schema,
retain the current agreement's provenance, make every shown declaration
expressible, validate party/reference targets, define attention across
party changes, and align member recovery and complete-prefix reading.
The enforced reader/agent route must depend on the enforcing Room and
template; reduced practice remains optional. These are design repairs,
with full original lifecycle scope retained.

Planner then read the complete revision-3 delta at `82c05a2a` and
revision-4 delta at `7f49d9e4`; both single-note inventories and whitespace
pass. Revision 3 applies all five corrections. Observation `f3c9308b`
asked two final repairs, applied in revision 4: pin opening guards/effects
and profile, and distinguish same-definition duplicates from eligible
new-definition replacements. Full invitation `82191a0b` is queued with
no executing reviewer. The new `d4e07064` direction now reassesses this
design within composed lanes; useful semantics remain input, while old
v1 preservation and prior implementation sequencing are not required.

Request `5c716a5c` now has immutable 017 Draft 2 and reconciled 018,
with five actual R0–R4 successors and a joint review invitation, as
recorded at the top of this index. Planner read both complete 017
versions and verified the current exact attachment. The unfinished
initial 018 and contrary S1–S4 conditions were replaced formally.
Demo-first composable architecture and full all-component retarget/removal
now govern, with no backward compatibility. N2's one-performer choice
remains an application choice, not a universal platform constraint.
Production rollout is excluded. Independent design adoption, source-level
dispositions, implementation and removal remain owed.

## Current test-cost priority

The 10× useful-invariant/test-economy goal continues under `d4e07064`.
The source integration sequence below records the previous model; R0/R4
now reassess each component/test and R3 accounts for actual external
duties before any retirement. It is not a requirement to complete an
obsolete architecture. Historical measurements qualify their exact
candidate, not the new model's unmeasured validation cost.

Test-overhead request `ecbc722a` is independently approved at exact head
`f621285036b0bec4bc156946172440061dce3b81`, primary `6b8024ab`, by
guarded review `b1738122`. Builder accepted that review in `a21d9d7c`.
Planner accepted the bounded cost scope in `b47f97f5`, ratified by
`0ce8ba3d`; source integration and inherited functional work remain owed.
Measurement clarification
`da68c9a9`, ratified by `67d58f37`, uses comparable elapsed pipeline time
and aggregate process CPU to assess the 10× target for the complete gate
and normal edit-to-review cycle. Summed component commands, serial suite
comparisons and worker phase subtotals must name their actual boundaries.
Exact internal worker lifetimes are no longer an acceptance requirement.
The review accepts the useful-invariant audit, heavy-test optimization,
helper corrections, compact complete gate and contributor workflow.
The complete pipeline comparison records 12.09× lower elapsed time and
10.65× lower process CPU. Its baseline is a sum of observed components;
the normal edit-to-review baseline is reconstructed. Shared load, cache
conditions and those measurement boundaries limit the comparison; this
is not a universal 10× guarantee. The supplementary serial comparison
records 12.44× elapsed and 10.66× CPU reduction.

Builder's integration plan `dae9a1f3` keeps `request/test-overhead` as the
combined branch for stages 2, 3, 5 and MCP core. Each lane needs its own
functional approval at an exact head, in that order. An approval can
carry across a repair only when its source, witnesses and relevant shared
contract/runtime/helper/test-configuration dependencies are unchanged,
with the diff and impact stated. A dependency change needs focused review
of its actual effect. One landing follows when all four approvals hold.
No main incorporation is claimed here. Whole-carry, original-input
profile, bearer parity, oversize/storage failure, stage 4 job lifecycle
and live provider row-write outcomes retain their existing owners.

During Stage 2 preparation, builder found removed/weakened useful
acceptance witnesses in the approved cost candidate. Commit `4178a97d`
restores target/hold binding changes, a signed pre-change grant, a narrow
legacy grant, changed-scope takeover/overlap, stored-version migration,
and additional policy, log, checker-isolation and client-subscription cases.
The invariant map names restored witnesses and the remaining lower-level
substitutions. Test result helpers now fail by assertion. No production
source changed from `f6212850`. Report correction `4ec48aa1` changes only
two figures: thirteen files in package test directories, and 67.8 CPU
seconds. Builder records 2,006 passing tests and one gate without install
at 28.4 elapsed seconds. These are the builder's recorded results; planner
has read the concrete delta but has not independently rerun the gate.
Functional Stage 2 review `a25ee2a9`, checker promise `c8bfd0d7`, is at
exact `4ec48aa162413302f066e78790a240f810d24525`, primary `3638042e`.
Historical guarded verdict `25bede37` approved Stage 2 under original
`fd6f00b6` / `c96e88fc`, naming all 43 artifacts and preserving the
recorded evidence limits. It uses carried source/witness review and one
independent focused stale-scope binding control; no repeat gate or fresh
36-control sweep is claimed. Builder accepted the verdict in `5c7307de`;
this does not approve the other three functional lanes or establish main
incorporation.
The checker has since withdrawn `25bede37`: current inspect records it
retired following newly found pre-existing policy-cache behavior. It is
historical evidence, not an operative approval to land Stage 2. The bounded
test-cost approval remains separate.
The next candidate owes three nonblocking accuracy corrections: valid
hyphenated recipient handles, modeled before/after checker snapshot
wording, and protocol 23/29.6 in the acceptance inventory. Later heads
require explicit unchanged-dependency carry or review of their delta.
Earlier planner preflight `a0dd55de` and cost approval `b1738122` do not
approve that repaired head or its functional outcome. Main integration
remains owed; the comparisons above remain historical evidence for
`f6212850`.

Builder's carry-accounting proposal at `37f627e1` adds useful checks
against an unwitnessed carry admitting a landing and a newer judgment
being skipped before an older carry. It also proposes a later Room/event
amendment for remaining whole-event accounting. Original Stage 3
condition 2 remains owed under `1e8fee4b`; planner has not accepted that
scope split. Independent review must assess honest overlap, missing-tree,
policy and filtered-snapshot boundaries. An amendment needs reviewed
semantics, explicit ownership and original-condition accounting before
Stage 3 can be described as complete. This adds no first-Jam gate.
Read-only assessment `060828bb` and the independent checker found the
same source timing boundary: land input precedes an awaited policy call,
while its event is sealed before the engine fences the final answer.
`land-evaluated` therefore is not itself a current-valid reservation.
The proposed guard needs snapshot/fencing semantics and an honest timing
witness. Complete pass accounting also needs an independent lifecycle
anchor, so deleting a whole marker/judgment/end group cannot erase the
work's obligation. These are planning/source findings, not reproduced
runtime failures or adopted event encodings.

New candidate `26872bac08efb220d90ee218ac31a4034b90e98e` revises the carry
note, restores additional verifier guards, fixes the three accuracy
corrections and changes the Room's evaluation/sealing boundary. Builder
reports a newly reproduced stale carry after an intervening revocation;
that is distinct from planner's earlier source-only `060828bb` finding.
Planner read the complete revised note, review invitation `58623b2a`,
primary metadata `d05c5c85` and full Room source/two held-evaluation test
delta. The changed Stage 2 source needs its own focused delta approval
bound to original `fd6f00b6` / `c96e88fc`; approval at `4ec48aa1` does not
carry automatically. That invitation named Stage 3's delivered
portion. Original Stage 3 condition 2 explicitly remains owed, with an
independently anchored pass amendment proposed next. Neither the partial
delivery nor builder's reported 2,024-test gate closes that condition.
Planner also asked the existing reviewers to distinguish facts that may
stay pinned from current facts that need fencing during activation or
supersession. That question is source-derived, not a new runtime repro.

## Evidence and limits

[010: Carry-pass planning review](010-2026-10-04-carry-pass-review.md)
reviews the complete builder amendment, unchanged from `b008a326` through
`947fb909`, under replacement evidence-only `49d6d070` / `d95e3e22`.
Draft 2 requests changes while retaining all ten
acceptance stories and answering the three open questions. Primary
`98166e96` names attachment commit `041d6d1a`, 16,286 bytes, 272 lines,
SHA256 `220806ce3bbba973888dbc8969ddb63b66657a4eeb65de475f3887c0c6fb0c4d`;
the frozen attachment matches the local review. The key design finding
is that enabling enforcement at the first pass permits deletion of that
first/only pass to remove the enabling condition. Other corrections
define start/current facts, producer fences, legal stop/terminal frontiers,
public later-job evidence, preview/recovery bounds and existing ownership.
These are source/design findings, not newly run failures or adoption.

Old delivery `2f9952c3` is recorded but ineffective: review request
`795d0ad4` omitted `no_git_artifact` and inherited a main-landing
obligation. Builder retired it in `7a792d51` and issued `49d6d070` with
`no_git_artifact: true`. Fresh report `85032553` is effective and accepted
by builder in `4832669c`; only that planning-review request is satisfied.
The earlier primary is retired by `1c53fa8b`; its
attachment remains historical. Current `39430e23` producer fences are
credited as pending-review source; they do not record pass closure or
establish complete-call accounting. No amendment adoption or source
approval is claimed. Original Stage 3 condition 2 stays owed; Stage 4 remains
the prepared-event producer owner. Functional Stage 3 review `58623b2a`
was promised by `c72697dd` at exact `26872bac`. New Stage 2 delta
invitation `ec9de335` was followed by supersession `3b397466`, which
cancelled the Stage 3 invitation and released its promise. Planner asked
builder to restore a fresh live Stage 3 invitation and verify the Stage 2
guard's actual `fd6f00b6` / `c96e88fc` binding, or use one properly bound
combined review. No verdict is claimed for either delta from those
invitation records. Fresh Stage 3 invitation `1c911ea7` now names exact
`947fb909`, primary `a4821bf7`, all 37 artifacts and the complete original
binding. It preserves the outstanding whole-carry outcome. The fresh
invitation, rather than cancelled `58623b2a`, is current.

Fresh Stage 2 delta invitation `944c5550`, checker promise `aa976cb6`,
binds original `fd6f00b6` / `c96e88fc` to primary `724f795c` and 46
artifacts at exact `0138a05c`. Its production source is unchanged from
`26872bac`; the two added notes explain proposed accounting and pinned
versus current facts. Two independent held-evaluation controls in
`d9f83440` distinguish the revocation fences, within their stated scope.
They do not establish that every mutable dependency is fenced.

Effective guarded verdict `a7688a71` now requests changes against all 46
artifacts and the full original Stage 2 implementation binding. Planner
read the complete verdict and the carry-removal probe's exact observation,
diagnostic test-only diff and result. Withdrawal `290b3e87` retires the
earlier Stage 2 approval. Builder owes both focused source repairs and
their note corrections before exact delta review. Neither the reported
gate nor the two passing revocation controls overrides these findings.

Checker finding `29551590`, read in full, records an actual declared-v2
held carry after activation/recomputation removes its obligation. The
published honest log fails `decision-extra` at that stale event. Finding
`7dabf862`, also read in full, records a cached passing reservation reused
after a block-only policy activation with unchanged input. Planner read
the cache, input and activation/reservation source and confirmed the
missing evaluated-policy identity; no probe was rerun. Both findings
retain the existing Stage 2/3 scopes and need focused repairs. Legitimate
historical-policy carry names are separate from current target eligibility.

Fresh Stage 2 invitation `306abff3` binds all 47 artifacts to exact
`39430e23`, primary `086ae11b`, and the full original `fd6f00b6` /
`c96e88fc` scope. Checker promised it in `53df705f`. The Room now uses a
kept land evaluation only under its recorded policy version, including all
cache reads and replacement of older cache rows. A carry seal also checks
current policy and obligation eligibility. Builder reports focused v2 and
legacy witnesses and three distinguishing controls; planner read the
source delta and has not rerun them. Guarded independent approval
`9cb05da9`, accepted by builder in `93974c40`, now binds the full Stage 2
scope at this repaired head. Portable
evidence `ca9d0668` records three successful actual-Room witnesses, two
under v2 and the activation case under v1, using workerd/SQLite and real
policy evaluation with artifact/publisher/checker-service doubles. Old-row
compatibility is source-reviewed; no provider or repeated broad gate is
claimed. The approval retains historical policy identities and conservative
activation restart, with advisory wording corrections. It does not approve
the assembled branch or other scopes. Old `25bede37` remains withdrawn.

Stage 5 invitation `595fb021` replaces retired `f7a3c7fb` at exact
`048c7411`, primary `beb2d2bf`, all 111 artifacts; checker promise is
`f4ebb374`. Repair source retains unresolved named-act bytes and refuses
a new act at capacity before signing or sending. Full checker findings
`6bf8d38a`, `b2043423` and `4a138704` were read: eviction lost exact retry;
an accessor could change value between plain-data validation and cloning;
and an ordinary failed catalogue refresh unmounted the UI form holding an
unresolved intent. Only the first has a submitted repair at `048c7411`.
The latter two and the original live UI entry requirement remain under
functional review. The UI probe proves ownership loss on one open page,
not a production Room, signature or browser acceptance result. Recorded
gates do not replace these focused invariant outcomes.

Focused finding `f7740b54`, read in full, shows the remaining concurrent
capacity boundary at `048c7411`: with 63 unknown outcomes retained, two
simultaneous new calls both dispatch and leave 65. Exact prepared bytes,
literal HTTP bodies and original receipts survive activation, so eviction
is repaired; capacity must be reserved before the first await. The loaded
capacity assertion fails while the serial witness passes, over the exact
client/Ed25519/FakeRoom HTTPS seam. No real Room/provider result or new
original-byte-loss claim follows. This remains the existing Stage 5 repair
scope, alongside accessor/UI ownership and live UI entry.

Fresh Stage 3 guarded verdict `6263fdec` requests changes at exact
`947fb909`, with all 37 artifacts and original `1e8fee4b` / `3af8ebc7`
binding. The named primary is actually the checker Git test; the report
artifact is `f7b143bc`. The entire Log subtree is unchanged from `26872bac`,
so no duplicate verifier run was performed. Complete omission/extra/context
accounting and the integrated whole-log legacy negative remain owed;
helper-level vocabulary refusal does not satisfy that latter condition.
The accepted 010 changes decision does not adopt or build the amendment.

Stage 5 invitation `60900227` replaces `595fb021` at exact `736f4953`,
primary `06d9af26`, retaining all 111 artifacts and original scope. Its
guarded changes review `0b33e8cc` supports the getter repair with two
focused passing witnesses and a distinguishing control. Copy and validation
use property descriptors in one pass; getters are refused without invocation.
Concurrent capacity, UI ownership and live UI entry remained outstanding.
Builder's `7931d5e8` source addresses capacity and catalogue presentation
ownership. Independent guarded changes review `12b1e0a` assesses all 111
artifacts under `a5d64b35` / `d5378da5` and supports those repairs with
focused witnesses and distinguishing controls. Original-intent retention
and stale-confirmation availability remain corrections. Its local
client/FakeRoom and UI/MemoryRoom evidence supplies no whole-head or real
browser/Room approval. The earlier 048 verdict draft
was not filed: acknowledged planner contract artifact news expanded its
sealing binding beyond its prepared Stage 5 scope. A fresh invitation
after publication is the normal metadata remedy; no guard bypass, scope
reduction or implicit contract approval is used. Future own contract
publication will precede the fresh final MCP dual-scope invitation.

Additional Stage 5 finding `2ee996f4`, accepted in `31c1a977`, proves that
a known mismatch for different work under the same key can discard the
original unanswered act. After activation its retry is re-signed and refused.
The ordinary settlement control preserves original bytes and its receipt;
one accepted claim remains in both cases. Planner read the complete probe,
raw failure and observations, and independently checked 12 source, two
probe and nine saved evidence identities. This is exact client/FakeRoom
evidence, not provider or Room execution. The key-based cleanup path remains
in `7931d5e8`; this repair stays under original Stage 5 condition 2. No
duplicate effect or authority bypass is claimed.

Builder reports retention repair `30d83d58`; planner read its full client
and witness delta, but independent approval remains owed. New confirmation
availability finding `522b0b80`, ratified `27acdc69`, accepts the second
P2 from `12b1e0a`. A deliberate stale-confirmation click creates a new
key/binding and accepted MemoryRoom act while declarations are unavailable,
contradicting the banner. An actual legacy state also dispatches a fresh
candidate but accepts none. Planner read the complete diagnostic and
observations and matched nine exact source/fixture and 19 saved evidence
hashes. One loaded failed-read assertion fails; the final legacy assertion
was not reached, although all three observations were saved. No automatic
resend or authority bypass is claimed. Every new-intent route must use the
same availability guard, preserving cached meaning, unresolved exact retry
and Leave it. The next exact-head invitation must also correct the source
release ledger and use fresh scope `04880e7e` / `8464d0e7`; actual live
entry remains C5 under `0a9a086c` / `85236634`.

Builder's new `9451aa24` candidate adds the confirmation availability
guard and disabled button, with a bounded unavailable/click/restore
witness. Planner read all five changed paths from `30d83d58`; no runtime
approval is claimed. Invitation `ea6d9266`, primary `ced12916`, names all
111 artifacts at that exact head, replacing `f85ae6f1` with `b99cc10e`.
Checker promised the complete retained-scope review in `40437194`, using
the fresh scope records, and reports that normal preparation binds all
111 solely to original Stage 5. The four own MCP records remain outside
that scope. Independent guarded verdict `17ce6443` requests changes,
with the actual recorded binding solely to `d5378da5`. It gives bounded
repair credit to the already-held intent and confirmation availability
guards, but a distinct fresh-key race remains. Original A is accepted,
different B under the same initially unheld key mismatches, both answers
are lost, and B's unknown-result completion wins retention. After an
activation and cache refresh, A is rebuilt and refused instead of settling
its original receipt. The timing control preserves its object, canonical
and literal wire bytes, and receipt without another signature. One claim
remains in both runs; no duplicate effect or authority bypass is claimed.
Planner read the full verdict, diagnostic report, timing probe/config,
control and saved assertion/observation summaries; 13 exact source
identities, 29 evidence seals and 713 restored archive files match.
This actual client/FakeRoom evidence proves the local retry failure,
not real Room, browser or provider behavior. The correction remains
original Stage 5 work. Builder's `2ba30aa8` now records the intent owner
before preparation or signing, shares concurrent same-intent calls and
refuses a conflicting in-flight intent locally. Planner read its complete
five-path delta and public caller/hook contract. Independent review remains
owed. One source-ordering counterexample was sent to builder and checker:
the bearer path can invoke `onPrepared` synchronously before the owner's
shared promise is assigned, so a same-intent call from that hook can read
an undefined outcome promise. This is not a reproduced runtime finding;
the existing Stage 5 review must assess that boundary. New invitation
`ef469da0`, primary `eb3eacc8`, names all 111 artifacts at `2ba30aa8`;
`8c9b2507` retires the older invitation and is not the new request.
Checker promised the complete 111-artifact review in `c04a6f26`; guarded
changes-requested verdict `26231a05` now records that re-entry boundary: a
synchronous bearer hook's same-intent call returns undefined, while the
outer call admits one claim and a post-return call shares its Promise.
The actual public HttpRoomClient/McpBearer path reaches a local HTTP
FakeRoom adapter; no duplicate real Room admission or authority bypass
is established. Its paired loaded assertion distinguishes synchronous
publication timing. The entire guarded report retains full Stage 5 scope,
all 111 artifacts and actual sealed binding solely to `d5378da5`.
Ordinary conflict/share/capacity fixes have bounded independent positive
and distinguishing-control evidence; source-identical earlier UI/held-key
evidence is carried with its original limits. Planner read the complete
verdict and binding. Planner then read the complete callback report,
private public-API fixture, actual loaded failure/control observations
and command status; all 43 saved evidence seals, 16 source identities
against exact Git, and 727 restored tracked hashes match. This strengthens
the saved callback appraisal; the full ownership-control and 111-artifact
appraisal remains the checker's. Planner ran no witness. Initialize the
shared Promise before
preparation can re-enter, retaining the synchronous intent reservation
and existing exact-byte owner/settlement rules. The clean-checkout
2,042-test gate remains builder-reported evidence. Fresh corrected source
review is owed. Builder's `6b877f6b` creates and enters a real shared Promise
before starting the act, then adopts the send/settlement result into it.
Planner read all five changed paths, including fresh bearer and retained
key callback controls and the caller contract. This is source assessment,
not runtime approval. Fresh invitation `dbf4147f`, primary `28dfc5d6`,
now names all 111 artifacts at `6b877f6b` under original Stage 5. The
2,048-test gate and two old-order distinguishing controls are builder
evidence. Checker promised the complete exact-head review in `bb127c66`.
Complete guarded approval `b90f2211`, accepted by builder in `0ddc47f5`,
now covers all 111 artifacts solely under original `d5378da5`. Four focused
callback assertions pass, and restoring only the old publication block
produces two loaded semantic failures. Fresh bearer evidence measures RPC
`bearerAct` invocations; the kept-key probe supplies local HTTPS, exact
original body reuse and zero additional envelope signatures. These are
bounded fake-Room seams, retaining the separately qualified historical
real-Room/UI evidence. Planner read the full verdict and actual binding;
its raw runtime/source/inventory appraisal is the checker's. Nonblocking
wording corrections remain: a hook must return successfully or fulfill
before sending, while a throw or rejection stops the send; the shipped
bearer witness measures an invocation rather than a POST. Normal final
composition and landing remain owed.
Builder's `d7dde97f` incorporates those nonblocking corrections. Planner
read its complete three-path delta: the option comment now specifies
fulfillment and rejection; the shipped RPC witness calls its counter
`calls`; the source ledger adds dated approved/open status without
rewriting its historical evidence. The named-call implementation is
unchanged. This source assessment adds no new exact-head approval.
Invitation `ef469da0` is retired by `d86e2a7e`; the earlier changes verdict
is historical. The earlier
2,037-test gate is also builder evidence. The source ledger
still cites historical scope `98a292d4`; the fresh identical transfer is
operative, and final composition must reconcile those references and
withdrawn Stage 2 approval prose. Normal prepared binding remains to be
inspected, without adding implicit MCP approval to a Stage 5 verdict.

Bearer request `5d41ea36`, promised in `9c75aae2`, now has source changes
at `5aaf22a7` and `87cd5804`. `judgeBearer` uses the read path's
`authenticateHash`, and R-CRED-10 explicitly ends access for revoked
grantor keys, expired/revoked grants, inactive members and ended sessions.
An intact retained signed envelope still has its original R-IDEM-2
settlement path. Independent guarded approval `65df0958`, accepted by
builder in `3a65356a`, covers the complete repair at `87cd5804`, with a
passing actual Room witness, assertion-distinguishing old-judge control
and the changed recovery case. Local workerd/SQLite uses fake provider
seams. This approval remains separate from final composition or deployment.

Planner semantic decision `a6e9a14a` accepts that exact R-CRED-10
paragraph under existing `5d41ea36` condition 1, preserving ended-session
access refusal, retained signed settlement and current role/kind admission
checks. This is contract acceptance, separate from source/runtime approval.
Review `510fbbbf`, checker promise `bc0b176a`, names all six artifacts at
`87cd5804`. Planner source inventory `e8586693` compares approved Stage 2
`39430e23` with `4cb7688e`: only the bearer judge changed in Room source;
the core and policy remain identical. This supports focused evidence reuse,
not approval of the whole branch. Collections Draft 2 is independently
approved as recorded above. No final main incorporation is claimed.
Complete pass accounting still needs the separately reviewed amendment;
neither repair depends on adoption of that amendment.

Historical Stage 5 invitation `f7a3c7fb` at `c38c23ce` was replaced by
the later invitations above. MCP core review `bc0d7f6b` requests changes
under invitation `90adf4a7` at `50216bb1`, all 35 artifacts. Fresh Stage 3
review `6263fdec` under `1c911ea7` preserves complete accounting and the
whole-verifier legacy negative. Builder subsequently added that negative
case at `a10c9bec`; planner checked its source and actual verify wrapper,
while independent execution/review remains owed. The staged release route
and live UI ownership transfer in 013 are adopted planning decisions;
intermediate source delivery `42342e35` and packed release `7e82100b` are
commissioned on fresh normal bases. Scope amendment `04880e7e` /
`8464d0e7` and C5 addendum `0a9a086c` / `85236634` record the narrow
live-entry transfer. Actual source
review and landing remain owed.

The intermediate verifier is now delivered at exact `391d20cd`, under
new promise `4e66accc` alone. Invitation `9122c446`, primary `db1ec1fb`,
has 46 artifacts, all inspected current at that head; its text's count of
40 is corrected by the builder's chat and checker promise `f5c48aee`.
The advertised main-to-head path set has those 46 existing files and two
deleted tests, `packages/log/test/amendment-4-large.test.ts` and
`packages/log/test/staging.test.ts`. Planner sent that inventory to the
checker for explicit test-cost evidence carry; no existing path is missing.
Builder attributes both removals to `ecbc722a`, independently approved in
`b1738122`, with the Log "Removed or replaced" rows: layout/large-entry
invariants stay in `amendment-4.test.ts`, and staged transfer at a smaller
limit stays in `transfer.test.ts`. This is source attribution and qualified
historical test-cost evidence, not new execution or whole-head approval.
Planner read the complete commission, invitation, promise and seven-path
delta from `9451aa24`. Its default CLI output and JSON report partial
carry accounting and explain that a verified prefix does not prove every
duty, complete publication or every state transition. This source reading
is not independent runtime approval. Complete guarded verdict `63af1ce0`
requests two P2 repairs, with actual sealed binding solely to `4e66accc`
and all 46 artifacts. Integrity-only replay-off output claims checks it
skipped; a signed malformed legacy check can throw rather than return a
structured failure and verified prefix. Checker supplies actual paired
full/integrity and valid/malformed controls. This is saved synthetic-log
evidence, not malformed admission by a real Room. The full default
grammar/call/input/budget and legacy positive/negative assessment retains
bounded credit; the omission argument does not establish every
mandatory/advisory/order/pass duty. Planner read the complete verdict;
the checker's raw-seal appraisal is not claimed as planner reproduction.
All original Stage 3 outcomes, ten carry families/A–F and Stage 4 producer
scope remain owed. The 2,038-test gate is historical builder evidence.

Builder delivered both repairs at exact `f2582a68` under invitation
`53b0e587`, primary `04e7814c`, with 47 artifacts and sole original fresh
promise `4e66accc`. Checker promised the complete review in `99f5ccef`.
The new request states full/integrity mode and carryAccounting none when
replay is off, matching machine/human limits, and decoder validation of
legacy input/integration before replay. Two distinguishing controls and
the clean-checkout 2,044-test gate are builder-reported evidence. Complete
guarded verdict `7df5edb5` independently supports both earlier repairs and
requests one remaining disclosure P2, bound solely to `4e66accc` with all
47 artifacts. Passive reads on the signed duplicate fixture observed both
proposal-head objects in integrity mode; API and CLI output denied those
reads. This is the checker's saved runtime evidence, not planner execution.
Planner source inspection confirms `witnessOf` at 651, its version call
at 1449 before replay 1457, and the land guard at 1195–1201 before replay
1203. Ordinary policy-defined obligations are absent when replay is off;
only the fixed admin-approval obligation supports that retained guard.
The verdict's landing qualification is source-derived, without an executed
open-land witness. It does not retain full-mode obligation accounting.
Planner read the complete verdict and its actual scope and proof limits;
the raw runtime and inventory appraisal remains the checker's.

Builder's `db1c24c6` and `f8d8980a` repair that disclosure. Planner read the
complete six-path delta: common/API/CLI and protocol/README wording names
retained checks, distinguishes Git-object consultation from comparing
recorded context, and limits the landing guard to admin approval. It
removes categorical claims that every skipped semantic error passes.
The extended passive-reader assertion and the added admin/rule-obligation
pair are producer witnesses; planner ran neither. Fresh invitation
`43172fc4`, primary `b10b2c72`, names all 47 artifacts at exact `f8d8980a`
under the same sole intermediate commission. Checker promised its complete
review in `b9b547f1`. The clean-checkout 2,049-test gate is builder evidence;
independent exact-head verdict and normal landing remain owed. Invitation
`53b0e587` is retired by `5d9dafca`, so `7df5edb5` is historical rather
than fresh-head approval. Future adopted contract wording in 016 and all
fifteen cases remain unchanged.
Checker subsequently reports a narrower wording P2 on `f8d8980a`:
`cannotProve` denies comparing any recorded context with Git, but
`witnessOf` reads retained proposal paths and `missingChanges` compares
them with Git before the replay gate. Planner read those exact source
paths: omitted changes select Git's list for the witness. This limited
comparison is distinct from complete input/context/budget replay and does
not, with replay off, reject the context mismatch through semantic replay.
The categorical denial still needs correction. This is source assessment
and a checker progress notice, not a fresh guarded verdict or runtime
approval; the normal complete review remains pending.
Complete normal verdict `925790d7` now requests that same P2, with all
47 companions and sole `42342e35` / `4e66accc` binding. The finding is
source-qualified, without a new runtime comparison countercase. Two
actual unmodified shipped mode/admin-versus-rule assertions pass, carrying
the earlier repairs with their unchanged-source limits. The admin refusal
now has this bounded independent runtime credit; no fresh CLI process or
independent signature revalidation was run in this review. The comparison
is conditional and one-way: it checks omitted changed paths, without
proving the retained base, rejecting extra retained changes or rebuilding
complete semantic contexts. Planner read the full verdict and actual
binding; its raw identity/runtime/seal appraisal remains the checker's.
Builder's `8b833fb3` corrects that categorical denial. Planner read its
complete four-path delta: the common report and protocol now describe the
omitted-path comparison, selection of Git paths, lack of refusal from
that comparison, and skipped semantic replay. The existing reporting
witness is extended; no verifier guard or mode changes. This is source
assessment of the replacement, without a fresh guarded verdict.
Builder's later `342d67c3` addresses the complete formal wording request:
the report and mode documentation condition the comparison on both Git
objects and retained proposal context, state its one-way omission/Git-list
selection, and disclaim extra-change rejection, merge-base proof and
complete semantic-context/budget reconstruction. Planner read the complete
four-path refinement, including the existing assertion update and report.
It changes descriptions rather than verifier guards. Fresh normal
candidate review remains owed under the same intermediate commission.
Fresh invitation `46ad0357`, primary `eb09af54`, now pins all 47 artifacts
at `342d67c3`; checker promised the complete review in `4905d528`.
Invitation `43172fc4` is retired by `1aa18c64`, making `925790d7` the
historical correction verdict rather than replacement-head approval.
Planner also raised a source-qualified decoding question within existing
grammar/report scope: retained input decoding checks outer context shapes,
while `witnessOf` accepts a changed-path array whose items `missingChanges`
assumes are objects. A malformed item may throw before replay. Public
reachability and applicable catches remain to be assessed; no reproduced
defect, malformed real-Room admission or new acceptance gate is claimed.
Checker confirmed the narrow source path and the separate legacy quiet
catch, then assigned one valid/malformed public `verifyLog` pair with
canonical digest, receipt and fixture resealing. Its two selected wording
witnesses have completed; final `342d67c3` verdict waits for the new
question's appraisal. The pair has no result yet, and its eventual
synthetic offline evidence must retain that admission boundary.
Builder now reports a public `verifyLog` reproduction in both modes and
delivers repair `d691e6e9`. Planner read its complete four-path delta:
the decoder validates proposal base/changed items, optional carry paths,
and land obligation/review items before those shapes are consumed. Four
paired cases distinguish the null item that threw from three shapes that
previously returned context-mismatch and now return malformed. The valid
controls, hand restoration, 305-log-test result and 2,053-test gate are
builder evidence pending independent appraisal. This is not a complete
retained-context schema or malformed real-Room admission proof. Actual
replacement invitation `a23cfe01`, primary `8b986210`, pins all 47 at
`d691e6e9`; `e442b1c4` retires `46ad0357` and is not the new request.
The former `4905d528` review is released, and a fresh normal promise and
exact-head verdict are owed under the same sole intermediate scope.
Planner observation `e53f7c64` records the complete replacement read,
the producer evidence limits and the remaining review and release work.
Planner correction `56407f10` records stronger execution evidence: the
checker's actual task reported a failed turn after an automated risk
flag, while its workroom connection remained leased. That connection
did not establish an executing review. The same task was continued on
the delivered repair and existing validation work, with retained
diagnostic inspection first; native status initially confirmed a new
active turn. Full original scope and the fresh guarded verdict remain
owed.
Fresh checker promise `f6dd71f4` now owns `a23cfe01` at exact `d691e6e9`.
Planner read the complete promise and initially confirmed execution.
Checker reports that its retained old child report/manifest records a
completed full-mode valid/malformed public pair and TypeError at
`342d67c3`, with synthetic/offline limits. Planner has not read that
report/manifest or credited an integrity-mode probe. The old binding
stays cancelled, and current guarded approval remains pending.
Planner status correction `aabbeaa8` records that the resumed native turn
has also failed with the automated cybersecurity-risk flag. Its truncated
last commentary reports shipped validation passing and an additional
source question; it supplies no complete report or verdict. The named
child task could not be read because it was not loaded. Preserve existing
results and uncertain command handles. The rejected probe will not be
restarted or repeatedly rephrased to bypass the restriction. The review
promise remains outstanding, with no source approval or extra tests.
Safe independent planning and notes reconciliation continue.
Coordination decision `bbc5a412` records the current blocker and lifts
only the temporary hold on independent design publication. The release
review still needs a real complete verdict at `d691e6e9`; the resumed
checker task remains failed after its automated restriction. The review
package stays intact. Hugh has been asked whether to arrange an independent
human review, restore access for the existing reviewer, or continue planning
while it waits. That answer remains pending. No replacement reviewer,
model switch or retry to bypass the restriction has been initiated.
Invitation `9122c446` is retired by
`1455927e`; the prior verdict is historical, not fresh-head approval.
Packed release `7e82100b` / `1eb5788c` is delivered for review under
invitation `0bf6e7c`, primary `a8307d37`, all 32 artifacts at exact
`90d24c4c`. Checker promised the complete independent review in
`8b56aa78`. The six `0.1.0-dev.1` tarballs were built from clean source
`980618d1`; the review head adds only the report. Evidence assertion
`2d1dde24` names the local delivery directory, manifest, both consumer
lockfiles and the saved 53-check result. Planner read the packaging
scripts, consumer, manifests/configuration and documentation delta, and
matched all six local tarball hashes, names, byte counts and matching
versions; their source tree matches Git. This inventory inspection is
not an independent install/runtime run or source approval. The saved
result reports all 14 library subpaths loading, both consumer typechecks
and commands working, with the CLI installed alone. The 2,040-test gate
and byte-reproducibility comparison remain builder-reported evidence.
Complete guarded package verdict `59605d51` requests changes, with actual
sealed binding solely to `1eb5788c` and all 32 artifacts. Independent cold
consumers loaded all 14 library subpaths, passed ordinary NodeNext/bundler
typechecks and fixture/CLI-only help; exact six tar identities and consumer
isolation retain bounded credit. One P2 remains: the standalone CLI bundles
third-party implementation but omits supplied copyright/permission notice
contents. Staging/inventory must include the applicable actual bundled
notices and check their contents, then repack the corrected candidate.
Planner read the complete guarded report; the checker's detailed raw
source/license/consumer appraisal is not claimed as planner reproduction.
Final matching source/release evidence remains required: both the client
repair and current verifier changes affect the bundled CLI or log package.
No registry publication or first-Jam readiness is claimed.

Builder's notice repair is now delivered at `1e444739`, invitation
`08b8041a`, primary `63bec7f4`, all 43 artifacts under the same `1eb5788c`.
Checker promised the complete review in `5f0d8d8f`. The six matching-version
candidate files are at `artroom-releases/candidates/1b40b7ec`, built from
`1b40b7ec` (source tree `6c8c82ed`); assertion `798318a3` names the manifest,
both locks, extracted notices and reported 55-check result. Planner matched
all six local tar hashes/byte counts to their manifest and Git source tree.
The CLI archive has seven members, including a 36,859-byte notices file,
SHA256 `bfef5fbb8d71e14e46aacf212a1ee36029346abc0a0e458ae9a12d77bce62f0b`.
All nine recorded source license hashes match, and their complete normalized
texts occur in that actual archive. Planner read the staging/content-check
and bundle/source-map inventory changes, not executed them. Complete
guarded approval `81478e2d`, accepted by builder in `99d8496b`, now covers
all 43 artifacts solely under `1eb5788c`, including the actual
archive/installed notice repair. The
checker supplies fresh cold-consumer imports, strict NodeNext/Bundler
typechecks and standalone CLI evidence, plus two focused inventory
witnesses and loaded hash/missing-record controls. The complete consumer
actually installs 181 packages; 239 describes non-root lock entries,
including 58 absent optional platform alternatives. CLI alone installs
one package. This evidence proves packaging boundaries, not real Room
admission, live discovery or functional readiness. Embedded dependency
discovery remains limited to available published source maps. Planner
read the full verdict and sealed sole-implementation binding; its raw
consumer/source/license appraisal is the checker's. The 55-check result
and 2,046-test broad gate remain historical builder evidence. Approval
does not authorize public registry publication. This candidate predates `6b877f6b`
and the final verifier disclosure repair; final matching repack remains
required. Old invitation `0bf6e7c` is retired by `8ef33b74`.

MCP condition 7 retains the four own `a9788a59` / `ee3d9036` contract
artifacts and explicit dual implementation binding at the final composed
head. Builder's separate review heads are a workflow choice, not a new
one-lane-per-head contract. Current source repairs and metadata correction
remain owed before normal integration can establish completion.
Original runtime request `9ca1d290` explicitly leaves first-Jam readiness
to builder and adds no runtime gate for the recorded first task. Accepted
release decision `27049c0e` requires both MCP scopes to be reviewed in the
chosen composition, which already contains their source. That source
review requirement does not enlarge the first task's capability needs.

Planner republished all four own MCP artifacts at `9451aa24` before its
new Stage 5 invitation: protocol primary `7c1b69ee`, transports `a6925cf3`,
contract index `f9c46cca` and demo example `1fefbba3`. Each has sole direct
`ee3d9036` provenance and is inspected current/non-retired. All four source
paths are byte-identical to `87cd5804`; no source edit or runtime run
occurred. This satisfies current-head publication, not full MCP review,
source completion or landing. The later explicit dual-scope review must
include both complete original commitments and all changed evidence.
The subsequent `391d20cd` protocol change belongs to the intermediate
verifier delivery. The four own MCP artifacts will be republished at the
final composed head for their separate review, after the current Stage 5
review; these earlier publications do not approve that later protocol
change.

Parent read every cited production path and test pattern. Read-only synthetic provider controls using actual exported Workspaces/SnapshotRepos classes and in-memory SQLite reproduced incomplete inventory acceptance and unknown-duty closure on foreign provenance. They do not establish live provider behavior. Terminal revocation and founding interruption were verified by source control-flow analysis; their plans require meaningful regression tests, including actual DO recovery for founding. No new whole-repository gates, live inference, deployments, remote deletions or credential creation were run as part of the audit. A7's separate exact-head review ran its own gates and fault controls; those are not claimed as audit repros.

## Canonical mint ownership: contract handoff still needed

`packages/git/src/artifacts.ts:110,115` and `publisher/client.ts:84` retry non-idempotent canonical token creation after potentially applied internal errors (see artifacts.ts:60–68). `packages/room/src/logremote.ts:45` mints before its finally block. A lost answer can leave an unnamed token outside a cleanup owner's records; a usable publication answer can also be lost between mint and durable pushToken recording at landing/engine.ts:266–267. The ownership loss is evidenced, but a safe complete recovery design needs a contract decision: canonical inventories do not identify an owner and contain concurrent unrelated tokens. Do not turn this into a blanket revoke-all plan. Request explicit ownership of that design and its implementing lanes. Known tokens need durable handoffs; unknown effects need honest observation/retention or a documented provider completion fence. No unauthorized access or credential disclosure is claimed. Measured 60-second publication and longer pin token TTLs remain adopted behavior.

Design for review under request `10fcfe4e`: [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), with the contract in [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). Revisions 2 to 5 answer checker reports `9ff903ab` and `851b215b` and their follow-ups. Approved in review `ad6cc052`. Lane A landed at `7be42275` (review `84b71c71`): see [Mint lane A](#mint-lane-a-request-1eda3c5e). Lane B landed at `574568b2` (review `1266c4a7`): see [Mint lane B](#mint-lane-b-request-78f0971c). Lane C is implemented, pending review: see [Mint lane C](#mint-lane-c-request-5ff58c9a). Live, lanes B and C made every propose fail, because the ledger's expiry check had no margin for Artifacts' clock: see [Live propose 503 after lanes B and C](#live-propose-503-after-lanes-b-and-c-request-df6ff8d3). The lane fork's read token for pinning, which the design left out of scope, is lane F (request `02836f9a`), implemented, pending review: see [Mint lane F](#mint-lane-f-request-02836f9a).

## Considered and excluded

- Room A6 known-token handoff loss: already owned by implementation request `23b96a18f1cb21e521ed0aa44e4b6cb686644d07`, fixed and independently approved in A7 review `b611030c8a060e6c27d3eedb6e18619489f7e8cb`; do not duplicate it.
- Cleanup attention/read projection: already owned by `c0f0592f3c919ce3be248f73c51dcb7e25d75f07`; the correctness plans must preserve that handoff.
- Unsigned checker jobs: trusted bound producers under adopted R-EXEC-8, with new authority design request `f12cef6bae7bf4c3813241df0624199568f14ddf`; not reported as a current vulnerability.
- Harness canonical token sweeps: development-only code, not production cleanup.
- False revoke results: may mean already revoked or absent; not automatically evidence of a live credential.
- Snapshot legacy unknown creates and founding legacy adoption: existing indefinite debt and durable incarnation handling credited; no duplicate defect. (Both were retired later by decision D5, request 73eccbec.)
- An unawaited setAlarm alone: insufficient to claim a crash bug without the Workers storage/output-gate contract. Plan 004's evidenced issue is absence of any wake before the first founding create.
- Provider TTLs, normal CAS/complete-forward behavior and expired credentials: do not change them or treat expiry as proof a push did not land.
- Broad performance, dependencies, UI, general auth review and unrelated roadmap features were outside this focused audit. No direction features were ranked against correctness fixes.

Status values: TODO, IN PROGRESS, DONE (with reviewed exact head and receipt), BLOCKED (with reason), REJECTED (with evidence of independent fix or invalid assumption).

## Implementation report: plans 001, 002 and 004

Gitseq request `b2509b23e82ae7c5aa31535a31f66c595a72df25`, branch `request/cc-workspace`, from main `bd520fb926f8161a722c6f1e23ae4aac29e41a66`. One commit per plan, in plan order: 001, then 002 on top of it (both change `cleanForkNow`), then 004. Main `a319360a` (checker bindings) was then merged in; it touches none of this branch's paths. The plan files were committed as recorded in assert `4efb1ef3`; their sha256 digests matched before the status lines below were edited. Plan 003 was not part of this request, and its file is not in this tree.

All three plans are **DONE, pending review**. No plan's premise turned out to be wrong, and no STOP condition applied. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What changed

**Plan 001: complete token inventories.** `completeInventory` in `packages/git/src/artifacts.ts` accepts a listing only when its records account for its total and every record has a non-empty ID, a known scope and state, and a timestamp-string expiry. Otherwise it throws. The founding validator (`Workspaces.inventoryOf`) now uses it; its rules are unchanged, except that a redundant type check on the total was dropped (the strict count comparison already rejects a missing or non-number total). Workspace cleanup (`cleanForkNow`) and snapshot preparation (`SnapshotRepos.prepare`) also use it. An incomplete or malformed workspace listing leaves every duty owed and on its backoff, so the workspace is never ready and gets no grant. An incomplete snapshot listing issues nothing, and the repository keeps its owed deletion. Each caller keeps its own active and expiry filter. The recorded lease token is still kept, and the creation token is still revoked, only on the proven fork. The binding's `listTokens()` takes no paging parameter, so the pagination STOP condition did not apply. Provider documentation was not consulted, because no live calls were allowed.

**Plan 002: unknown fork effects through foreign occupancy.** When a repository that is not this canonical repo's fork holds a lane fork's name, `cleanForkNow` still settles answered and owed duties: our fork is gone, and so are its tokens. It no longer settles a step that is still in flight. That step keeps its inventory on the existing capped backoff (`cleanFork`'s `finally` advances it), and it does not block a lease. The foreign repository is still only read for provenance (`get` and `info`).

**Plan 004: founding wake before the first create.** `WorkspacesOptions.wake` is a new optional async callback. `createIncarnation` records the create step in one transaction, then awaits `wake(now)` and only then sends the create. If the wake rejects, nothing is sent and the step is closed as `not-sent`; debt recorded earlier is kept. `CoreOptions.wake` passes the callback through, and `Room.wake` persists the alarm. Wake-ups run one at a time, each reads the stored alarm and only ever moves it earlier, and the alarm cache is set only after storage accepts the alarm. `schedule()` now clears its cache when a store is rejected. The Room constructor schedules any founding debt it finds (`blockConcurrencyWhile` with `recover`), so recovery does not need a new found request.

### Tests and gates

Every new test below failed on the code before its fix, except two plan 002 controls (a definite refusal, and an answered create), which check behaviour that had to stay the same. For plan 004, the failures include the Durable Object test: its alarm assertion failed while the first create was held.

| Plan | Gate | Tests or command | Result |
|---|---|---|---|
| 001 | Every malformed or incomplete case, both callers | `workspaces.test.ts`: "plan 001: a fork inventory with …", one test per listing shape (9 shapes: an empty page with a positive total, no total, no list of records, no ID, an empty ID, an unknown scope, an unknown state, an unreadable expiry, an expiry that is not a string). `snapshots.test.ts`: "plan 001: the creation token's revocation fails and the inventory has …", the same 9 shapes | Pass |
| 001 | Lease token kept, creation token ended | the same workspace tests (after recovery the only live token is the lease's), and "an incomplete inventory after the lease token is minted" | Pass |
| 001 | Restart controls; an unrelated canonical token untouched | "an unrecorded token on a released fork, while inventories are incomplete …"; "across a restart, an incomplete inventory never makes a snapshot ready …"; each per-shape workspace test also restarts over the same SQLite | Pass |
| 002 | Late create, restart, foreign isolation, backoff | "plan 002: a fork creation whose answer is lost, a foreign repository at the name …"; "foreign, absent, foreign and ours again …" (8 restarted hosts; the backoff grows and is capped at 30 minutes; the next check is always in the future) | Pass |
| 002 | Definite refusal and an ordinary answered create | "plan 002: a fork creation refused unchanged …"; "an ordinary fork creation that answered, not yet swept …"; the existing provenance and readiness tests | Pass |
| 004 | Actual Durable Object: alarm persisted before the first create; a stopped host's debt is serviced by a fresh object's alarm | `founding-gaps.test.ts`: "the alarm is in storage while the first create is outstanding …" (inspects storage while the create is held, aborts the object, applies the create late, then runs only `runDurableObjectAlarm`) | Pass |
| 004 | Wake failure sends nothing; earliest alarm kept | "an alarm that cannot be stored …"; "an earlier alarm already in storage is kept …"; "wake-ups asked for at once …"; Node: "plan 004: a wake-up that cannot be stored …" and "the founding wake-up is stored after the create step is on record …" | Pass |
| 004 | Older ledger, unfounded room, healthy founding, legacy adoption (since retired by decision D5), sealed isolation | "a fresh object schedules founding debt it finds …"; the existing founding-gaps and founding tests | Pass |
| All | Root and package gates | `npm ci`; `npm run typecheck`; `npm test`; `npm run test:workers -w @generalbusiness/artroom-git` (8 tests); `npm run test:node -w @generalbusiness/artroom-room` (125, after the merge); `npm run test:workerd -w @generalbusiness/artroom-room` (387); `node --test packages/git/test/workspaces.test.ts packages/git/test/snapshots.test.ts` (106); `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only) | All exit 0, run in that order at the final head of the branch (after main `a319360a` was merged in). Earlier runs were discarded, because another agent shared the scratch directory and a gate script may have been mixed |
| All | Scope | `git diff --name-only bd520fb9..HEAD`: only the plans' drift-check paths and `plans/` | Pass |

One note on the Durable Object test. In the workerd test pool, aborting an object does not complete while an RPC request to it is still in flight, or while its pending work resolves a promise created by the test. Either way the test hangs. So the test performs the Worker's founding steps itself (the registry binding and the seed), starts `room.core.found` inside the object, and polls a plain flag. The founding code path, the storage and the abort are all real.

### Mutation table

Each mutant was applied alone to the merged code and the relevant suites were run (the Node Git tests; for plan 004 also the workerd founding tests); then the file was restored. Every mutant turned at least one test red.

| ID | Mutation | Red tests |
|---|---|---|
| M1 | 001: drop the total-versus-count check | 9 (empty-page and no-total cases for both callers, both restart controls, the post-mint test, founding a35b4b61) |
| M2 | 001: drop the per-record check | 14 |
| M3a, M3b | 001: drop the ID type check, or the non-empty ID check | 2, 2 |
| M4 | 001: drop the scope check | 2 |
| M5 | 001: drop the state check | 3 |
| M6a, M6b | 001: drop the expiry type check, or the expiry parse check | 2, 2 |
| M7 | 001: drop the records-list check | 1 (after the "no list of records" case was added; it first survived) |
| M8 | 001: workspace sweep reads `.tokens` unvalidated | 10 |
| M9 | 001: snapshot preparation reads `.tokens` unvalidated | 10 |
| M10 | 001: founding inventory reads `.tokens` unvalidated | 4 (existing a35b4b61 tests) |
| N1 | 002: settle every duty under a foreign occupant (the old behaviour) | 2 |
| N2 | 002: settle only answered duties | 1 (existing owed-debt test) |
| N3 | 002: settle only owed duties | 2 |
| N4 | 002: remove `cleanFork`'s backoff `finally` | 4 |
| P1 | 004: no wake before the create | 4 (2 Node, 2 workerd) |
| P2 | 004: send the create after a failed wake | 2 |
| P3 | 004: leave the never-sent step in flight | 2 |
| P4 | 004: wake not awaited | 3 |
| P4b | 004: wake moved after the create's answer | 4 |
| P5 | 004: Room wake overwrites an earlier stored alarm | 2 |
| P6 | 004: Room wake sets its cache before storage accepts | 2 |
| P7 | 004: `schedule()` keeps its cache after a rejected store | 1 |
| P8 | 004: no constructor recovery | 1 |
| P9 | 004: wake-ups not serialized | 1 |

The first version of the validator had a type check on the total that no test could turn red. It was removed, because it was redundant, not because it was hard to test. An explicit `recheck` in plan 002's branch duplicated `cleanFork`'s `finally`, and was removed for the same reason.

### Not changed here (for separate requests)

- The Room's snapshot `wake` (`core.ts`, `snapshotRepos`) still calls `committed()`, which issues `setAlarm` without awaiting it. So `SnapshotRepos.prepare` can send a create before the alarm is confirmed in storage. Plan 004 asked for this to be reported, not fixed.
- Constructor recovery covers founding debt only. A founded room still relies on its stored alarm, as before.
- `packages/room/src/jobs.ts` validates its canonical inventory with its own rule, which does not check scope. Future consumers should use `completeInventory`.
- The development harness in `packages/git/src/worker.ts` (now `packages/git/measure/harness/worker.ts`, decision D5) reads listings unvalidated. It is out of scope, as the audit noted.

## Follow-up c9cd4cd8

Gitseq request `c9cd4cd859e9f715a743a674845e1c7e0cc4b994`, branch `request/cc-followup`, from main `93a2552e`. It closes the three gaps the report above left for separate requests. No unrelated token is revoked, and no unknown effect is settled by time or by a clean observation.

| Item | Change | Tests (each failed before the change) | Mutants (each turned the tests red) |
|---|---|---|---|
| 1. The snapshot wake-up is stored before a snapshot create | `core.ts`: `SnapshotRepos` wakes through the Room's persisted alarm (`CoreOptions.wake`), not `committed()`. `repos.ts`: if the wake-up cannot be stored, `prepare` sends nothing, closes the step as `not-sent` and drops its row | `snapshot-repos.test.ts`: "the alarm is in storage while the snapshot create is outstanding …" (with no alarm stored beforehand, the test holds the create, checks storage, aborts the object, applies the create late, and a fresh object's alarm deletes the repository); "a snapshot wake-up that cannot be stored …". `snapshots.test.ts` (Node): "follow-up c9cd4cd8: a wake-up that cannot be stored sends no create …" | Q1: the wake-up is `committed()` again (2 red). Q2: the failed wake-up leaves the step in flight (2). Q3: the create is sent after a failed wake-up (2) |
| 2. A fresh Room object schedules every debt it owns | `room.ts`: `recover()` stores an alarm for `nextAlarm()` in a founded room (snapshot, workspace and job-token cleanup, and the rest of the alarm's work), and for `foundingDue()` before founding | Durable Object restart controls, each with no alarm stored before the restart: "a snapshot repository's owed deletion …" (`snapshot-repos.test.ts`); "a released workspace whose token revocation and inventory are owed …" (`followup-c9cd4cd8.test.ts`); "(2) with no alarm stored, a fresh object stores one, and its alarm observes the unknown mint without settling it" (`job-token-mint.test.ts`). Each also runs the stored alarm and checks the debt is serviced; the unknown mint stays open | Q4: founding-only recovery, as before (3 red). Q5: founded-only recovery (1, the plan 004 founding control) |
| 3. Job inventories use `completeInventory` | `jobs.ts` uses the shared rule, now exported from the Git package's `index.ts`; the note text is unchanged | `job-token-mint.test.ts`: "(3) an inventory with a record of an unknown scope …" and "… a record whose expiry is not a timestamp string …". The old rule counted such a record as a live token | Q6: the old inline rule (2 red). Q7: no validation (3) |

Gates at the exact head of the branch: see the request's report. Not changed here: the development harness listings in `packages/git/src/worker.ts` (now `measure/harness/worker.ts`), which the audit put out of scope.

## Plan 003 report

Status: DONE, pending checker re-review. Reviews `1473992512c5bf7f973bfb8044cb45edebd7b7c5` and `f060871bfd1610447865b3069b3e48efd6f6c349` requested changes, made as described [below](#review-14739925). Implemented under request `7da437bcb901741837f61bc149a00c723c7c8217` on branch `request/cc-terminal` (the plan suggested `request/terminal-publication-cleanup`; the assignment named this one), from main `bd520fb926f8161a722c6f1e23ae4aac29e41a66`. The head for review is the commit that carries this report. The plan and this README are byte-identical to the copies attached to assert `4efb1ef348723189487e0a383b25db5b71d661f7` when first committed (sha256 `731c4cee…` and `6f8b9717…`). No gitseq delivery is recorded yet; the requester publishes it.

**Premise.** Confirmed before the fix. With the push landing and revocation failing, `nextDue()` returned null after the landing, and a `reconcile()` run anyway, after Artifacts recovered, left the token live. Only the held operation's tokens were ever retried.

**Change.** Two source files, both in scope:

- `core.ts` adds a private table, `artroom_land_token_cleanup (op, n, token, due, backoff)`. `save()` records each known, unrevoked token of any operation that is not active, in the same transaction. That includes `landed`, `aborted` and any future terminal state. A new record is due after 1 s, because the engine has just tried. `tokenRevoked()` deletes the record. `cleanupFailed()` doubles the wait, from 1 s up to 5 min, and never gives the record up. `nextDue()` includes the earliest due time, so the Room's alarm wakes for it. A room stored before this change adopts its ended operations' unrevoked tokens once, at start, under a meta key.
- `engine.ts`: after `reconcile()` has dealt with the held slot and any reservation, it starts a cleanup pass over the due records (at most 20). Since review 14739925 that pass runs beside the publication queue rather than on it; see [below](#review-14739925). Each record is revoked by its own token ID. A stopped instance writes nothing.

What does not change: the slot, receipts, CAS, token TTL, mint attribution and the public `LandOp` shape. A revocation emits no event. Neither a revocation answer nor token expiry changes an operation's state. The only visible difference is that an ended operation's `updatedAt` moves when its token is revoked.

**Gates and tests.**

| Plan gate | Evidence | Result |
|---|---|---|
| Step 1: regression fails before the fix | `R-PUB-3: the push lands but its token's revocation fails; after a restart, before the token expires, the alarm revokes it` | Red on `bd520` ("the known token's revocation is still owed"); green after |
| Done 1: fresh-engine recovery before expiry | Same test: restart on the same SQLite, clock within 60 s, token revoked, one receipt, slot free | Pass |
| Done 2: durable future due time on failure; cleared on success | `a failed cleanup keeps a durable later due time with capped backoff…` (waits 1 s to 300 s, no early retry, restarts keep the schedule, more than 20 min past expiry still owed) | Pass |
| Done 3: receipts, free slot and later publication unchanged | `several ended operations owe revocations across a restart…` (a third landing reserves, pushes with a live token and lands while revocations are owed); all 39 earlier landing tests unchanged | Pass |
| Step 3: one operation's cleanup cannot revoke another's token; no unrelated token | Same test (per-token failures; an unrelated canonical token is never asked for) and `a held publication's tokens stay with its own publication steps…` (two tokens of one operation, each by its own ID) | Pass |
| Step 3: abort-terminal cleanup through an existing definite path only | `an abort that ends without a push, by its existing definite path…` (an abort arrives at mint; `aborted` comes from read-back and `cannotLand`, as before) | Pass |
| Done 4: no expiry or revocation result used as landing evidence | Backoff test (state, log and slot unchanged after hours of failures); abort test (the recorded `abort-attempt` stays `tokenRevoked: false`) | Pass |
| Step 3: real SQLite DO storage and restart | `test-workers/landing-do.test.ts`: `R-PUB-3: … across real restarts the alarm keeps the revocation owed with backoff, and revokes it when Artifacts recovers` (failure made durable by an SQLite trigger; the real scheduled alarm revokes) | Pass |
| Stored rooms | `a room stored before the cleanup records existed…` | Pass |
| Targeted: `node --test packages/git/test/landing.test.ts` | 52 tests, at the head carrying this report | Exit 0 |
| Package types: `npm run typecheck -w @generalbusiness/artroom-git` | (also within root typecheck) | Exit 0 |
| Worker storage: `npm run test:workers -w @generalbusiness/artroom-git` | 10 tests, at the head carrying this report | Exit 0 |
| Root: `npm ci`, `npm run typecheck`, `npm test` | Every workspace, including the Room's workerd suite | Exit 0 |
| Scope: `git diff --name-only bd520f..HEAD` | The four plan paths, plus `plans/003-…md` and `plans/README.md`; since review f060871b also the Room alarm control `packages/room/test/workerd/review-f060871b.test.ts`, which that review asked for | As allowed, with that one test added at the review's request |

The Room's workerd suite prints workerd "code had hung" uncaught-exception messages, but it passes. The same messages appeared with main's landing sources when checked at the first delivery, and their number varies from run to run, so this change did not cause them.

**Mutation testing.** Each guard was broken in turn, the targeted file was run, and the code was restored. Every mutant turned at least one test red. The Workers DO test was also red for M1, M4, M5, M8, M9, M11, M15, M16 and M17.

| Mutant | Red tests |
|---|---|
| M1 ended operations owe nothing | 5 |
| M2 active operations owe too | held-publication test |
| M3 already-revoked tokens owed | several-operations test |
| M4 new record due at once | 3 |
| M5 `nextDue` ignores records | 5 |
| M6 due time ignored | 2 |
| M7 batch of 0 | 6 |
| M8 failure leaves due time unchanged | 2 |
| M9 no doubling / M10 no cap | backoff test |
| M11 success keeps the record | 5 |
| M12 success clears other operations' records | several-operations test |
| M13 no adoption / M14 adoption at every start | stored-room test |
| M15 `reconcile` skips cleanup | 6 |
| M16 failure not rescheduled / M17 failure treated as revoked | 3 each |
| M18 stopped instance writes its failure | held-publication test |
| M19 revokes the last due record's token | 2 |
| M20 records the first push's token for every push | held-publication test |

A first version of M19 ("revoke the first due record's token") survived. It is equivalent, because each pass removes the first due record. It was replaced by M19 above, and the held-publication test gained an assertion for M20.

**Not covered here.** The two gaps first reported here, the batch size and cleanup running after the held slot, are now pinned (see review 14739925 below). A token whose mint answer is lost before `pushToken` records it remains the canonical mint ownership request's work (`10fcfe4e`). Showing owed revocations to admins remains with the cleanup projection request. A revocation that answers `false` still counts as done, as before. `workspaces.ts` and `cleanForkNow` were not touched.

## Review 14739925

Review `1473992512c5bf7f973bfb8044cb45edebd7b7c5` of head `8a2b82da` requested changes for one P2 availability defect. The cleanup pass ran on the serial queue that `publish` and `reconcile` share, so an old revocation that was sent but never answered held up a later, independently reserved publication. The checker reproduced this, and it was correct.

**Change** (`engine.ts` only; `core.ts`, the durable records and the backoff are unchanged):

- `reconcile()` starts the cleanup pass and does not wait for it. The pass still starts only after the held slot and any reservation have been dealt with (R-PUB-7).
- One pass runs at a time. A pass tries at most the 20 due records it read when it started.
- Each revocation has a timeout, 30 s by default (`REVOKE_TIMEOUT_MS`; tests pass `revokeTimeoutMs`). A timeout or a refusal counts as a failure and takes the durable backoff. A late answer is dropped, so the token stays owed until a later attempt is answered. A timeout is never taken as success.
- A stopped instance still writes nothing. Records, revocation by the record's own ID, and the absence of any event or outcome change are as before.
- `settle()` does not wait for the pass, so a hung revocation cannot hold it up either.
- A Room alarm that starts a pass now sets its next wake before the pass ends. *Correction (review f060871b):* this revision said that could add only one wake about a second later. That held only for the Durable Object stand-in, whose revocations answer at once and whose alarm floor is one second. In the production Room, a pass still waiting on Artifacts left the owed record's past due time in `nextDue()`, so every alarm asked for another about 10 ms later. Review f060871b's change, below, fixes that.

**Tests added** (`packages/git/test/landing.test.ts`):

| Control | What it shows |
|---|---|
| `review 14739925: an ended operation's revocation that has not answered holds up no later publication…` | The reviewer's case: while a's revocation is unanswered, b prepares, reserves, pushes and lands once, and the slot is free. A second alarm does not send a's revocation again. A restarted room retries it and Artifacts answers. The dead instance's late answer then writes nothing. |
| `…a revocation that does not answer in time counts as failed, with backoff…` | The timeout counts as a failure (backoff 2 s). A late answer leaves the token owed, and the next answered attempt clears it. |
| `…a slow batch of revocations delays no preparation or publication…` | Three slow revocations: a later operation prepares, reserves and lands while the batch waits on its first answer, then the batch completes. |
| `R-PUB-3: one cleanup pass tries at most twenty owed tokens…` | Adapted from the checker's 25-token diagnostic: 20, then the remaining 5 on the next pass. |
| `R-PUB-7: after a restart the held publication is recovered before any ended operation's token is tried` | Revocation order: the held operation's tokens first, then the ended one. |

The existing token tests now wait for the pass with `cleanupDone()`. The Durable Object test now polls for the background pass's result.

**Checker's diagnostics.** The checker's pending-answer test passes against this engine unchanged. Its 25-token test fails unchanged, but only because it checks the result as soon as `reconcile()` returns; the adapted version above waits for the pass and passes.

**Mutation testing.** I ran 27 mutants against `landing.test.ts`: the 20 earlier ones, re-anchored to the new driver, plus 7 new. Every mutant except N6 turned at least one test red.

| Mutant | Red tests |
|---|---|
| N1 pass awaited on the publication queue (the reviewed defect) | 3, including the unanswered-revocation and slow-batch controls |
| N2 no single flight | 2 |
| N3 no timeout | timeout control |
| N4 timeout counted as success | timeout control |
| N5 cleanup started before held recovery | R-PUB-7 control |
| M7b batch of 40 | batch control |
| N6 `settle` does not wait for the pass | none: that wait was removed as unneeded |
| M1–M20 (as before) | each red, 1 to 11 tests |

The Workers DO test was red for M1, M5, M8, M11, M15, M16 and M17 under the new driver.

**Gates** are recorded for the head that carries this section; see the delivery report.

## Review f060871b

Review `f060871bfd1610447865b3069b3e48efd6f6c349` of head `611edea7` found the repair for review 14739925 sound, and requested changes for two P2 defects. Both reproduced.

1. **Repeated immediate wakes.** While a pass waited on Artifacts, `nextDue()` still returned the owed record's past due time. The production Room's alarm clamps that to about 10 ms ahead, so it kept running its whole work cycle while the pass skipped.
2. **Completion failures.** If Artifacts answered but the completion transaction failed, the throw ended the pass silently. The debt kept its old due time, and the next alarm repeated the revocation at once.

**Change** (`engine.ts` and `core.ts`):

- While a pass is in progress, owed revocations are not due before the current attempt's timeout, that is, the attempt's start plus `REVOKE_TIMEOUT_MS` (30 s). `Landing.nextDue()` passes that time to `LandingCore.nextDue(cleanupNotBefore)`. The time moves with each attempt in the batch, and is cleared when the pass ends.
- Other work that is due still sets an earlier wake. A restarted instance has no pass, so overdue records are due at once.
- When Artifacts answers but the completion transaction fails, that counts as a failure, with the durable backoff, the same as a refusal or a timeout. If storage cannot record even the retry, the record keeps its due time, and the pass goes on with the rest of its batch. The stopped-instance check still comes first, so a dead instance writes nothing.
- Unchanged: single flight, the batch bound, the timeout, the backoff, held-slot priority, a later publication's progress, and revocation by the record's own ID.
- A Room alarm that starts a pass now sets its next wake no later than the pending attempt's timeout. When the pass ends sooner, any record it rescheduled waits for that wake, at most 30 s after the attempt started.

**Tests:**

| Control | What it shows |
|---|---|
| `landing.test.ts`: "review f060871b: while a cleanup pass waits on an answer, the owed revocations are due again when its current attempt times out…" | Two overdue records. `nextDue()` is the attempt's start plus 30 s, and moves when the second attempt starts. An accepted operation still makes it "now". A restarted room owes the record at once. |
| `landing.test.ts`: "review f060871b: a revocation answered whose completion cannot commit counts as a failure with backoff…" | A `BEFORE DELETE` trigger fails completion. Both records take the 2 s backoff, `tokenRevoked` rolls back, and the batch continues. With an `UPDATE` trigger too, both are still tried and keep their due times. After recovery, both complete, with one receipt each. |
| `landing-do.test.ts`: "review f060871b: a failure recording the cleanup duty rolls the landing back…" | Adapted from the checker's SQL fixture, across real Durable Object restarts. A failed duty insert rolls the landing back. A failed completion keeps the debt on its 2 s backoff with `tokenRevoked` false. After recovery, the next attempt completes, with one receipt. |
| `packages/room/test/workerd/review-f060871b.test.ts` | Adapted from the checker's alarm fixture: the production Room with real `Room.alarm` runs. While a revocation is pending: five alarms, one call, no stored alarm under 1 s, and `nextDue` between 1 s and 30 s ahead. After completion: no debt and no landing wake. On a 200 ms timeout: backoff 2 s, the next due time is the record's, and an earlier alarm sends nothing. |

The earlier Durable Object test's last phase now runs the alarm itself, and checks that any wake left is bounded and finds nothing owed. The checker's two original fixtures also pass unchanged against this head.

**Mutation testing.** Every mutant was red on `landing.test.ts`; the extra suites are noted.

| Mutant | Red |
|---|---|
| W1 `nextDue` ignores the pass | wake control; Room control |
| W2 core keeps the overdue time (min instead of max) | wake control; Room control |
| W3 the wake does not move per attempt | wake control (the Room control has one record per pass, so it does not catch this) |
| W5 completion failure not caught | completion control; Durable Object SQL control |
| W6 completion failure counted as done | completion control; Durable Object SQL control |
| W7 an unrecordable retry ends the batch | completion control |
| W9 the pass defers debt an hour past its timeout | wake control; Room control |
| M1–M20, M7b and N1–N5, re-anchored to the new loop | each red, 1 to 13 tests |

**Scope.** The Room control is a new test file outside plan 003's four paths. Review f060871b asked for a production Room alarm control, and the coordinator asked for it explicitly. No Room source changed.

## Mint lane A (request 1eda3c5e)

Status: DONE, landed at `7be42275`, approved in review `84b71c71`. Gitseq request `1eda3c5e`, branch `request/mint-ledger`, cut from main `b803d210`. It implements lane A of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane A: the ledger"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

**Scope.** Code is added only: `packages/git/src/mints.ts` (new), `packages/git/src/index.ts` (exports), and `packages/git/test/mints.test.ts` (new). No caller changes; lanes B and C do that. This section, and the status line above, are the only other edits. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What was built

`MintLedger`, on the Room's SQLite through the package's `Sql` interface (a Durable Object's storage or `node:sqlite`). It creates its own tables, as the other Git package classes do: `artroom_mint` (the records) and `artroom_mint_summary` (one row).

```ts
const mints = new MintLedger({ sql, repo, now, wake, known, waitMs? /* default 30 s */, sleep? /* tests */ });
const t = await mints.mint(purpose, "read" | "write", (sentAt) => ttlSeconds, { notAfter? });
//   t: { id, plaintext, scope, expiresAt, release(), claim() }
await mints.withToken(purpose, scope, ttl, async (t) => …);   // mint, run, release
await mints.reconcile();   // the alarm: keep or clear the takeover time, start a revocation pass, observe if due
mints.nextDue();           // when the alarm should next run, or null
mints.duties({ after, limit });   // one page of records by row ID, with the counts and the observation
await mints.idle();        // tests: the revocation pass and late answers have ended
```

- `repo` is a function that returns the canonical repository (`createToken`, `revokeToken`, `listTokens`), as `canonicalTokens` takes it. Every lookup of it, in `mint()`, the revocation pass and the observation, runs within the bounded wait; a lookup that does not answer in time is that attempt's failure, and one that answers later is dropped, so it starts no provider work. `mint()` looks it up before the record is written, so nothing slow sits between the lifetime and the send. Every provider call (create, revoke, list) is bounded too.
- Every error that a record or the observation keeps goes through `errorNote(stage, error)`: a fixed phrase for the stage, the error's name if it is in a fixed list, an Artifacts code if it is one `artifacts.ts` classifies, and an integer numeric code or HTTP status. No provider message text is stored (review 0ab6dac3). The Room's shared safe-metadata boundary can replace it once the Git package can depend on one.
- `known(tokenId)` is the Room's point lookups in its other records (`job_tokens` and, from lane B, `artroom_land_token`). The ledger checks its own records through an index on token ID.
- Records: `sent`, `held`, `owed` or `unknown`, as in the note's table. A record is deleted when it ends. Row IDs come from `AUTOINCREMENT`, so they are never reused. Every change is `UPDATE … WHERE id = ? AND state = ? RETURNING id` (or the same `DELETE`), and the counts in the summary row change in the same transaction, from the rows that actually changed.
- Before the request: one transaction writes the `sent` record, and moves the takeover time to 60 s ahead if it is less than 30 s away. Then `wake(takeover)` is awaited. Then `ttl(sentAt)` is called, and a second conditional update stores that lifetime and send time on the record (approval obligation 1). Only then is `createToken` called. If any of these fails, the record is deleted and nothing is sent.
- The answer is classified once, as the note says. Usable: a token ID and text, the scope asked, a readable expiry no later than the answer's arrival plus the lifetime asked and no later than `notAfter`, for a caller still waiting. Usable answers become `held` and are returned. A token ID otherwise becomes `owed`, due at once, with its reported expiry or none. A refusal that changed nothing deletes the record. Anything else is `unknown`. Only the `retriable()` classes are retried, up to 5 attempts from 0.5 s, and each attempt is a new record, sent only after the previous one holds its outcome. A caller waits at most 30 s. After that the record is `unknown`, and the answer, whenever it comes, is applied to its own record with no caller. If recording an answer fails, the record keeps its state, the ID is revoked at once, and the record is deleted only when that revocation is answered.
- `release()` revokes by ID, waiting at most 30 s. An answer deletes the record. A refusal, a timeout or a completion that does not commit makes it `owed`, due in 1 s. `claim()` is synchronous: it deletes the `held` record inside the owner's transaction, and throws if the ledger no longer holds it.
- Takeover: the constructor turns every `sent` record into `unknown` and every `held` record into `owed`, due at once, in one indexed update. So a Room builds one ledger per object start.
- `reconcile()`: with records in flight, the takeover time moves 60 s ahead when less than 30 s away; with none, it is cleared. Then a revocation pass starts, unless one is running, and is not awaited. Then at most one observation runs, if one is due, and is awaited: its repository lookup and its listing share one deadline, 30 s (`waitMs`) from its start, so the whole observation waits at most 30 s. A revocation pass, which the alarm does not await, waits at most 30 s for its lookup and 30 s for each of up to 20 revocations.
- Revocation pass: at most 20 owed records with `due <= now`, ordered by due time, then row ID. If any of them has a readable expiry that has passed, the pass settles only those, with no revocation call and no wait, in one transaction with one summary write, and ends; `nextDue()` then puts the next pass 1 s later, and that pass revokes the rest. Otherwise the pass looks up the repository, within the wait, and then, immediately before each revocation, checks the record's expiry again: a record whose expiry passed during the lookup or an earlier revocation is settled with no call, on the lookup's failure path too. Each other record is revoked by its ID, waiting at most 30 s, and a failed lookup is a failure for each of them. Those results are written in one transaction at the end of the pass. So every pass makes at most 20 record writes and one summary write. If that transaction fails, every record in the batch takes its backoff, as a failure. Backoff: 1 s doubling to 5 min, never past a readable expiry. When the pass ends, it stores a wake-up for `nextDue()`.
- Observation: only while a record is `unknown`. One repository lookup and one `listTokens()`, sharing one deadline 30 s from the start: a slow lookup leaves less time for the listing, and a lookup that leaves none means no listing is started. The flag is released when either fails or the deadline passes. If the listing has more than 1,000 records, or `completeInventory` refuses it, that is the result and nothing is counted. Otherwise each active, unexpired token is looked up by index and by `known()`. One summary write: the time, the result, the count, and the next due time (a wait doubling from 1 min to 6 h). A new unknown record brings it forward to no sooner than 1 min after the last one.
- `nextDue()`: the earliest of the owed records' minimum due time (not before the current attempt's timeout while a pass waits), the observation time (while any record is unknown; not before its timeout while one is running), and the takeover time (while any record is `sent` or `held`). Each time already passed counts as now plus 1 s. A still-future time counts as itself. So the 1 s step applies only when due <= now, and never postpones a still-future takeover or observation time (approval obligation 2). The Room's `wake` keeps an earlier unrelated alarm.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **The pass writes its results once, at its end** (accepted in review 0ab6dac3). Settlement at a passed expiry must not wait on a lookup (that review), and a pass makes one summary write (the note's bound, which the checker's extra controls on `19f6e389` held to). So a pass that finds expired records settles only those and ends, and the next pass, 1 s later, revokes the rest. This is the simplest way to meet both: one more pass, never a second summary write, and no record waits for a lookup to be settled at its expiry. The note asks both that "counts change in the same transaction as each record" and that a pass makes "at most 20 record writes and one summary write". One transaction at the end of the pass meets both. The cost: a host that stops during a pass loses the answers it got. Those records stay owed and are revoked again, and a revocation that answers `false` counts as done.
2. **A token owed at once is revoked by the next pass, not inside `mint()`.** Its record holds the ID, and `mint()` stores a wake-up for now. Only the failed-handoff case, where no record holds the ID, revokes inline, as the note says.
3. **Backoff stops at a readable expiry**, so an owed record is settled when its expiry passes, not at its next backoff time after that.
4. **Wake-ups after a debt is recorded are best effort** (review 0ab6dac3 notes that lane B must compose `nextDue()` into the Room's next alarm and store it): on a release failure, an unusable answer, a late answer, or the end of a pass. The debt is durable, and the takeover wake-up, stored while the record was `sent` or `held`, already covers it. The wake-up before a send is required, and a failure there sends nothing.
5. **A failed handoff whose revocation also fails** (review 0ab6dac3 notes this; it stays explicit here: recovery may need a new object start) leaves the record `sent`, as the note says ("keeps its earlier state"). On a live host it then stays in flight: the alarm keeps moving the takeover time until the next object start makes it `unknown`. The same holds for a `release()` that cannot record its debt. That throws, and the record stays `held` until the next start makes it `owed`. Both need storage to fail twice in a row.
6. **A new unknown brings the observation forward but does not reset the doubling.** The note says only "brings it forward". Either way there is at most one inventory a minute.
7. **`nextDue()` reads one indexed minimum, one indexed existence check and the summary row**, where the note says "three indexed minimums". The bound is the same.
8. **Additions to the note's API:** `sleep` (tests only, as `SnapshotRepos` and `canonicalTokens` have), `idle()` (as the landing engine's `cleanupDone()`), `errorNote` and its `ErrorStage` type, and the exported constants. `duties()` includes the token ID, never its text, and caps `limit` at 1,000. `withToken` takes no `notAfter`, because only check jobs need one, and they claim the token.
9. **The bounded wait timing out is not retried,** and neither is a transport failure: only `retriable()` classes are, as `withRetry` does today.

### Tests: rule map

`packages/git/test/mints.test.ts`, 47 tests, named with the note's lane A numbers, "(checker 1)" or "(checker 2)" for review 0ab6dac3's two findings, "(checker 3)" for review 6a979799's two P2 findings, and "(checker 4)" for its P3. Each test is red under at least one mutant below. Without the ledger the file does not load.

| Note | Rules | Tests |
|---|---|---|
| (1) | R-MINT-2 | the record and the stored wake-up in place when `createToken` is called; the lifetime computed after a 20 s wake-up and held on the pre-send record; a failed record write, and a failed wake-up, send nothing and leave no record; the takeover time moves only when under 30 s away |
| (2) | R-MINT-2, R-MINT-5 | applied then `INTERNAL_ERROR`: unknown, and the retry is a new record; the record survives 100 lifetimes, a complete inventory with nothing unaccounted, an incomplete one and a takeover; nothing outside the ledger's records is revoked |
| (3) | R-MINT-3 | a refusal deletes the record, with no retry; a transport failure is unknown, with no retry |
| (4) | R-MINT-3, R-MINT-4 | ID without text owed and revoked by ID; unreadable expiry owed until a revocation is answered; another scope, a longer expiry, or after `notAfter` owed and never returned (an expiry equal to `notAfter` accepted); no ID is unknown; settlement at a readable expiry with no revocation call |
| (5) | R-MINT-3 | an answer held past the wait: error, unknown, then the late ID owed and revoked; a late refusal deletes; a late lost answer stays unknown; a late answer to a record whose unknown state could not be stored is owed, never held |
| (6) | R-MINT-3, R-MINT-4 | failed handoff: record kept, ID revoked at once, record deleted only after the answer; two mints in flight with a claimed row; a stale caller after a takeover gets nothing, and counts stay exact; `claim()` rolls back with its owner |
| (7) | R-MINT-4, R-MINT-7 | takeover: `sent` to unknown, `held` to owed and revoked by ID; the old host's `release` and `claim` do nothing |
| (8) | R-MINT-7 | the takeover time in `nextDue()`, moved on the live host, cleared with nothing in flight; overdue work at now plus 1 s; a still-future takeover, observation or revocation time on time |
| (9) | R-MINT-4, R-MINT-7 | backoff 1 s to 5 min across a takeover; a timeout is a failure and its late answer is dropped; a completion that cannot commit is a failure; a failed or timed-out release is owed; 20 a pass, earliest due first; one pass at a time, not eligible before the attempt's timeout |
| (10) | R-MINT-5, R-MINT-7 | the scale control below; a listing over 1,000 records counts nothing; the observation doubles from 1 min to 6 h, and new unknowns every second give one inventory a minute |
| (checker 1) | R-MINT-7 | a lookup that never answers: `mint()` sends nothing and writes no record; the observation records its result and next time; the pass backs each record off, and a later pass revokes. A lookup that answers only after the wait: backoff recorded, the pass and observation flags released (a new pass or observation starts while the old lookup is out), and the late answer starts no revocation or listing and changes no row. A held lookup never delays settlement at a passed expiry |
| (checker 2) | R-MINT-5 | the checker's control (an accepted token's opaque text echoed in an `Authorization: Bearer` revocation error); every sink (creation, release, the pass, the pass's and the observation's lookups, the listing) with a short opaque text in the message, the name, the code and the status, stores only safe metadata, and neither the rows nor `duties()` contain the text; `errorNote` keeps only allowed names, known codes and bounded integers |
| (checker 3) | R-MINT-4, R-MINT-7 | a readable expiry that passes while the lookup is held is settled and never revoked, whether the lookup answers or times out; a mixed due batch (two expired, two revocable records) makes one summary write a pass and settles every record within two passes, the second 1 s after the first; a record that expires while an earlier revocation in its pass waits is settled, not revoked, in that pass's one summary write |
| (checker 4) | R-MINT-7 | an observation's lookup and listing share one deadline: a lookup that takes 200 ms of a 300 ms deadline leaves the listing 100 ms, and the observation ends by the deadline; a lookup that uses the whole deadline means no listing is started |
| — | | the bounds are the design's (30 s, 60 s and 30 s, 1 s, 20, 1,000, both backoffs) |

**The scale control (10).** The SQL double wraps `node:sqlite`. It counts the rows each statement returns, and the rows written per table (from `RETURNING` or `changes()`). It also runs `EXPLAIN QUERY PLAN` on every read, update and delete, and records any that scans `artroom_mint` rather than searching an index. Setup: 10,000 unknown records; 890 tokens known to other records; a backlog of 100 owed records, all due; and 10 owed records due earliest whose readable expiry has passed. Those 1,000 tokens are all that is listed. Then 40 alarm turns, each at `nextDue()` and each after a new unknown record. Each turn: at most one `listTokens()`; at most 20 record writes; at most one summary write each for the takeover time, the observation and the pass, and at most one that changes the counts; at most 1,040 rows read; at most 1,000 `known()` calls. Turns that only observe write no record. The first pass settles the 10 expired records with no revocation call, and the next is 1 s later. The five backlog passes after it revoke the next 20 in due order, and after each, `nextDue()` and the stored wake-up are exactly 1 s ahead. Observations are at least 1 min apart, and each counts 0 unaccounted. No statement scans the records. Paging `duties()` 1,000 at a time reaches all 10,040 remaining records once, each page reading at most 1,002 rows. The counts equal `COUNT(*)` per state: all 10,040 are unknown, and none is owed.

### Mutation table

Each mutant was applied alone to `src/mints.ts` by a script, the mint tests were run, and the file was restored from the commit (`git checkout`). Every mutant turned at least one named test red. T-mutants are the note's mutation targets, O-mutants the approval's two obligations, and G-mutants the other guards. 85 mutants, all red, and every test is red under at least one: 61 before review 0ab6dac3, F1 to F18 for its findings, H1 to H4 for review 6a979799's P2s, and J1 and J2 for its P3. All 85 were rerun against the final code (the table below is that run). After each review, mutants whose target lines had moved were re-anchored (T9a, T9b, G2, G13, G19, G23, F2, F14), and T17 and G20 also break the settlement of expired records before a pass's lookup. The first run left three survivors (T5b, G29, G30). Each was a missing test, not an equivalent mutant, and each now has one: the third (5) test, an assertion in the first (4) test, and one in the scale test. Two tests were then red under no mutant, so G32 and G33 were added to break their guards. G31 was rerun after a fix to the mutant itself, which had broken the syntax.

| Mutant | Mutation | Red tests (number) |
|---|---|---|
| T1a | the wake-up after the send | (1) ×3 |
| T1b | the record after the send (create sent before the record is written) | (1) ×4, (2) |
| T2 | a failed wake-up that still sends | (1) |
| T3a | settling an unknown record by inventory | (2), (7), (10), (checker 1) |
| T3b | settling an unknown record by lifetime | (2), (10) ×2, (checker 1) |
| T3c | settling an unknown record by the owner's end (takeover deletes sent records) | (6) ×2, (7) |
| T4 | a late ID left unknown | (5) ×2, (6) |
| T5a | a late answer given to the caller (no bounded wait on the create) | (5) ×3, (6) ×2 |
| T5b | a late answer treated as for a waiting caller | (5) |
| T6a | a takeover time left out of nextDue() | (8) ×2 |
| T6b | a takeover time not moved ahead by the alarm on the live host | (8) |
| T7 | an observation written to each record | (10) |
| T8 | a new unknown that resets the schedule to under 1 min | (10) ×2 |
| T9a | a revocation batch ordered by newest | (4), (9) ×2, (10), (checker 3) ×2 |
| T9b | a revocation batch ordered by row ID only | (9) |
| T10a | an unconditional update by row ID (move) | (5) ×2, (6) |
| T10b | an unconditional delete by row ID (drop) | (5) |
| T11 | a retry under one record (the old hidden withRetry) | (2) |
| T12 | a swallowed revocation failure on release | (8), (9), (checker 2) ×2 |
| T13 | a claim() in its own transaction (deferred out of the owner's) | (6), (7) |
| T14 | notAfter checked after the token is returned (not in the classification) | (4) |
| T15 | ttl computed before the wake-up | (1) ×2 |
| T16a | an overdue nextDue() returned as is | (8), (10), (checker 3) |
| T16b | an overdue nextDue() returned as now plus less than 1 s | (8), (10), (checker 3) |
| T17 | settlement at an unreadable expiry | (4) |
| O1 | the pre-send record does not hold the recomputed lifetime (no second conditional update) | (1) ×2 |
| O2a | the 1 s continuation postpones a still-future time when anything is overdue | (8) |
| O2b | the 1 s continuation applied to a future time too | (8), (checker 1) |
| G1 | a failed wake-up leaves its record | (1) |
| G2 | a refusal leaves the record unknown | (3), (5) |
| G3 | no text check | (4) ×2, (8), (9) ×5, (10), (checker 1) ×3, (checker 3) ×3 |
| G4 | no scope check | (4) |
| G5 | no generic expiry check | (4) |
| G6 | no readable-expiry check for use | (4) |
| G7 | takeover in the constructor removed | (6) ×2, (7) |
| G8 | takeover makes held records owed later, not at once | (7) |
| G9 | a late refusal or late ID leaves the unknown count unchanged | (5), (6) |
| G10 | a failed handoff deletes the record before the revocation is answered | (6) |
| G11 | a failed handoff does not revoke the ID | (6) |
| G12 | release revokes a token that is no longer held (claimed) | (6), (7) |
| G13 | no single pass at a time | (9) |
| G14 | owed records eligible while a pass waits on an answer | (9) |
| G15 | a batch of 40 | (9), (10), bounds |
| G16 | backoff does not double | (4), (9), (checker 1) |
| G17 | backoff not capped | (4), (9) |
| G18 | a revocation timeout counts as answered | (9) |
| G19 | a completion that cannot commit is not recorded as a failure | (9) |
| G20 | no settlement at a readable expiry | (4), (10), (checker 1), (checker 3) ×3 |
| G21 | backoff carries the next try past a known expiry | (4) |
| G22 | no listing size cap | (10) |
| G23 | an incomplete listing counted | (2) |
| G24 | the takeover time never moved before a send | (1) |
| G25 | no wake-up when a pass ends | (10) |
| G26 | no wake-up for a token owed at once | (4) |
| G27 | a pass's record writes not batched (summary written per record) | (10), (checker 3) ×2 |
| G28 | no observation backoff doubling | (10) |
| G29 | observation runs with no unknown records too | (4), (checker 1), (checker 3) |
| G30 | the ledger's own token index not consulted by the observation | (10) |
| G31 | the takeover time not cleared with nothing in flight | (8) |
| G32 | every failure that leaves the outcome unknown is retried, not only the retriable() classes | (3), (8), (10) ×2, (checker 1) ×2, (checker 4) ×2 |
| G33 | an answer without a token ID closes the record | (4) |
| F1 | mint's repository lookup unbounded | (checker 1) |
| F2 | the pass's repository lookup unbounded | (checker 1) ×2, (checker 3) |
| F3 | the observation's repository lookup unbounded | (checker 1) ×2 |
| F4 | the lookup's wait not enforced | (checker 1) ×5, (checker 3) |
| F5 | a lookup that answers late still starts provider work | (checker 1) ×5, (checker 3) |
| F6 | expired records settled only inside the pass, behind the lookup | (10), (checker 1), (checker 3) |
| F7 | errorNote keeps the error's message | (checker 2) ×3 |
| F8 | any error name kept | (checker 2) ×2 |
| F9 | any code kept | (checker 2) ×2 |
| F10 | any status kept | (checker 2) ×2 |
| F11 | any numeric code kept | (checker 2) |
| F12 | release stores the provider's text | (checker 2) ×2 |
| F13 | the pass stores the provider's text | (9), (checker 2) |
| F14 | the pass's lookup failure stores the thrower's text | (checker 2) |
| F15 | the observation's lookup failure stores the thrower's text | (checker 2) |
| F16 | the listing failure stores the provider's text | (10), (checker 2) |
| F17 | a create failure stores the provider's text | (checker 2) |
| F18 | an unusable answer's reason quotes the provider's scope | (4) |
| H1 | no expiry recheck immediately before revoking | (checker 3) ×2 |
| H2 | no expiry recheck on the lookup's failure path | (checker 3) |
| H3 | expiry judged before the lookup, not after | (checker 3) ×2 |
| H4 | a pass that settles expired records goes on to revoke the rest (two summary writes) | (10), (checker 3) |
| J1 | the listing gets a full wait of its own, not what is left of the shared deadline | (checker 4) |
| J2 | the listing is started with no time left | (checker 4) |

### Review 0ab6dac3

Report `0ab6dac3` (changes requested) found two P1 defects at `658d10af`, both reproduced by the checker's controls (`/tmp/artroom-checker-mint-a-v1-controls.ts`).

1. **Confidentiality.** A revocation error that echoed an accepted token's opaque text was stored in `last_error` and shown by `duties()`. A pattern redactor was tried first and rejected by the review: no token format in the contract makes a pattern sufficient. The ledger now stores safe metadata only (`errorNote`, above), at every sink: creation, release, the pass, the repository lookups and the listing. An unusable answer's reason is a fixed phrase ("another scope", not the provider's value).
2. **Availability.** `await repo()` was outside the bounded wait in the observation and the pass (and in `mint()`), so a held lookup held the alarm's observation or the cleanup pass, and its flag, indefinitely. Every lookup is now bounded; a timeout is that attempt's failure with its backoff, the flag is released, and a lookup that answers late is dropped. Records whose readable expiry has passed are settled before any lookup.

The checker's three controls failed at `658d10af` (its log, `/tmp/artroom-checker-mint-a-v1-controls.log`) and pass against this branch's fix (rerun here with only the import paths changed to this worktree). The review accepted choices 1, 2, 3, 6, 7, 8 and 9, and noted 4 and 5, as marked above.

### Review 6a979799

Report `6a979799` on `19f6e389` (changes requested) found two P2 defects and one P3, the first two with the checker's extra controls (`/tmp/artroom-checker-mint-a-v2-extra-controls.ts`).

1. **P2: expiry not rechecked after the lookup.** A record whose readable expiry passed while the pass's repository lookup was held was revoked afterwards, because its expiry was checked before that wait. The pass now looks up the repository first, then checks each record's expiry immediately before both the no-repository result and the revocation call. A record that expired meanwhile is settled with no call.
2. **P2: two summary writes in a mixed pass.** Settling expired records before the lookup, then writing the revocation results, made two summary writes in one pass, against the note's bound of one. The bound is kept, not amended: a pass that finds expired records settles only those, with one summary write, and ends; the next pass, 1 s later, revokes the rest. This is the simplest way to keep both one summary write a pass and settlement that never waits on a lookup. The scale control now has 10 expired records in its backlog and checks one count write a pass.
3. **P3: the observation's waits.** The report said 30 s, but the lookup and the listing each had 30 s. They now share one deadline, so the whole observation waits at most 30 s, the bound the note adopted and lane B's alarm composition relies on.

The checker's first extra control passes. Its second asserts that a mixed batch (one expired, one revocable record) is fully settled by a single `reconcile()` with one count write. With the design above, its count assertion holds (one write), but its first assertion, `owed === 0` after that one call, fails by design: the revocable record is revoked by the next pass, 1 s later. Both together are not possible while settlement at expiry must not wait on a lookup. The first write must come before the lookup, and the revocation's count change after it. "(checker 3) a mixed due batch …" is the replacement control: one count write in each pass, and every record settled within two passes.

### Gates

Run at the exact head that carries this section; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git` and `npm test -w @generalbusiness/artroom-git` (Node); then from the root `npm ci`, `npm run typecheck` and `npm test`; then the note's lane gates: `npm run test:workers -w @generalbusiness/artroom-git`, `npm run test:node -w @generalbusiness/artroom-room`, `npm run test:workerd -w @generalbusiness/artroom-room`, and `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; nothing is uploaded).

### Not changed here

Every caller: `canonicalTokens`, the landing engine and core, the publisher client, the log remote, snapshot preparation and check jobs keep their own mints until lanes B and C. The Room does not build a ledger yet, so nothing in production uses it. The package README is unchanged; lane B, which puts the ledger in the Room, can describe it there.

## Mint lane B (request 78f0971c)

Status: DONE, landed at `574568b2`, approved in review `1266c4a7`. Gitseq request `78f0971c`, branch `request/mint-publication`, cut from main `7be42275` and merged with main `25a7b837` (idle write storms, request `3da1d82b`), so the head for review is the combined one. It implements lane B of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane B: the publication token, and the ledger in the Room"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

**Scope.** The note's lane B paths on main's current layout (post-D5): `packages/git/src/artifacts.ts` (`canonicalTokens` removed), `src/index.ts`, `src/landing/engine.ts`, `src/landing/core.ts`, the Git harness at `packages/git/measure/harness/worker.ts`, `packages/git/test/support.ts`, `test/landing.test.ts`, `test-workers/worker.ts` and `test-workers/landing-do.test.ts`, `packages/room/src/core.ts`, and a new Room workerd file, `packages/room/test/workerd/mint-publication-78f0971c.test.ts`. The two package READMEs name the new API where they named `canonicalTokens`. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What was built

```ts
// Git package
const tokens = publicationTokens({ mints, repo, waitMs? /* 30 s */, sleep? });   // PublicationTokens
await tokens.mint(`publish:${op}:${n}`); // the ledger's token: { id, plaintext, expiresAt, claim(), release() }; 60 s write, as before
await tokens.revoke(tokenId);            // by ID; lookup, revocation and withRetry's retries share one bounded wait
core.pushToken(op, n, tokenId, claim, expiresAt);  // one transaction: the ID on the attempt, the token's row, claim()
core.tokenRevoked(op, n);                // also deletes the token's row, by its ID
core.knownToken(tokenId);                // one point lookup in artroom_land_token; no operation is read
// FaultPoint "token-answered": after the mint's answer, before pushToken

// Room
core.mints;                // one MintLedger per object start, built with the core
core.steps.mints(due?);    // its own loop work kind, "mints"
core.nextAlarm();          // includes max(mints.nextDue(), the "mints" backoff), unless the canonical repository is gone
```

- **The publication mint.** `PublicationTokens.mint(owner)` is the ledger's `mint(owner, "write", () => 60)`: a `sent` record and the stored wake-up before the create, the lifetime asked after the wake-up, a 30 s bounded wait, and any retry under a new record (lane A). The engine calls it once per push attempt and never retries it. Its owner is `publish:<op>:<n>`.
- **The handoff.** `pushToken` takes `claim` and calls it inside its transaction, after recording the ID on the attempt and inserting the token's `artroom_land_token (token PRIMARY KEY, op, n, expires_at)` row with Artifacts' reported expiry. A rollback leaves the ledger owning the token (still `held`) and no row. The engine then releases the token in the background (revoked by its ID; a failure makes it `owed`), never awaited by the publication queue (R-MINT-4), and rethrows. `cleanupDone()` also waits for those releases (tests).
- **The token rows (R-MINT-7).** `pushToken` writes a row and `tokenRevoked` deletes it, in their own transactions; nothing else does. So a row is kept while a revocation fails, after the operation ends too, until plan 003's cleanup pass or the held operation's own revocation is answered; no row is settled at expiry. A room stored before this change fills the rows once, at its first start, under the meta key `token-index`: one per unrevoked token of an active operation, and one per cleanup record (plan 003's `adoptEndedTokens` runs first, so every ended operation's unrevoked token is there).
- **The fault point.** `token-answered` sits between the mint's answer and `pushToken`. A host that stops there leaves the token with the ledger, `held`; the next object's ledger takes it over (`owed`, due at once) and its alarm revokes it by its ID, while the engine completes the publication forward with a new attempt.
- **Revocation of publication tokens.** `canonicalTokens().revoke` is replaced by `publicationTokens().revoke`: the repository lookup and the revocation, with `withRetry`'s retries of a transient error, inside one bounded wait (30 s). A timeout is a failure, as before for the caller; a later answer is dropped, and nothing is sent after the wait ends: the end is checked when each attempt starts (after a retry's sleep) and after each lookup, immediately before the send (review `d4a4c681`, below).
- **Safe metadata.** A mint that fails is recorded on the push attempt as `token not minted (<errorNote("create failed", e)>)`: the stage, a known error name and code and bounded integers, never the provider's text (lane A's `errorNote`).
- **The Room.** `RoomCore` builds the ledger in its constructor, before the landing engine, with the Room's persisted `wake` (read the stored alarm, store only an earlier one, resolve once stored), the room clock, the canonical repository, and `known(id)`: a primary-key lookup in `job_tokens`, then `landing.core.knownToken(id)`. The landing engine's tokens are `publicationTokens({ mints, repo })`. The `mints` step runs `mints.reconcile()` (takeover time, revocation pass, observation; each checks its own durable due time). `nextAlarm()` includes the ledger's `nextDue()`, so the Room's start-up recovery (`Room.recover`, which stores `nextAlarm()` through `wake`) schedules the ledger's debt with no request, and every alarm stores the earlier of the ledger's time and the Room's other work (`schedule` and `wake` only ever move the stored alarm earlier).
- **The "mints" loop kind (merged with request `3da1d82b`).** The step is its own kind in `LOOP_KINDS`: a failure of the step itself (storage failing in `reconcile`, say) sets `loop_backoff.mints`, 5 s doubling to 5 min, and an alarm that runs earlier for other work skips the step. It is never pending by rows: the ledger times its own work. Like landing's, its backoff ends only when the step runs (`SELF_TIMED`), and `nextAlarm()` uses the later of the ledger's time and the backoff. It needs the canonical repository: while `canonical_gone` is set, the ledger's records are kept, and it is neither run nor scheduled. The other kinds' fences are unchanged.
- **The harnesses.** The Git harness (`measure/harness/worker.ts`) builds its own ledger, includes it in its alarm and schedule, and still type-checks (checked with a scratch tsconfig; the package gates do not cover it). The Git Workers test Room mints through a real ledger over a token table that stands in for Artifacts.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **Recovery may need a new object start** (lane A's choice 5, carried as the checker asked). Three cases. (a) A host that stops between the answer and `pushToken` (the `token-answered` point): on a live host nothing uses the token again, but the record stays `held`, its takeover time kept ahead by each alarm (control "several alarms on a live host"), until a new object takes it over and revokes it. (b) `pushToken` rolls back and the background release's revocation fails: the record becomes `owed` and the ledger's pass revokes it, with no new start needed; only if storage also refuses to record that does it stay `held` until the next start. (c) Lane A's failed handoff whose revocation fails stays `sent` until the next start. All three need either a stopped host or storage failing twice.
2. **A rolled-back `pushToken` releases the token in the background**, not awaited by the publication queue (R-MINT-4), rather than leaving it `held` for a takeover. The note says only that "the token is revoked later"; releasing at once is sooner, and a failed release is still the ledger's debt.
3. **`publicationTokens().revoke` keeps `withRetry`**, inside one 30 s bound. The held operation's revocations and plan 003's cleanup pass behaved this way with `canonicalTokens`, except that the wait was unbounded. A retry is safe for a revocation by ID. Revocations by the ledger itself (lane A) do not retry.
4. **The `mints` loop kind** follows the coordinator's direction on the merge with request `3da1d82b`: a fence after a failure of the step itself, never pending by rows (rows that are unknown for the life of the room would otherwise keep the kind backed off), its backoff ending only when it runs, and held while the canonical repository is gone. The cost: after a step failure, every ledger time (takeover move, revocations, observation) waits for the fence, at most 5 minutes. A record's own backoff is unchanged.
5. **While the canonical repository is gone, the ledger is neither run nor scheduled.** Its revocations and observation cannot succeed, and running them would write a backoff every few minutes forever. Records are kept, never settled.
6. **The step runs last in `runAll`**, after publication, so the observation's bounded wait (at most 30 s) never delays the log.
7. **The landing row stores Artifacts' reported expiry** when the mint gives one; the one-time fill stores NULL, as the operation never recorded it. The expiry is shown nowhere and decides nothing: a landing row ends only with `tokenRevoked`.
8. **A pass's last wake-up stays.** When the last pass of a backlog ends, the alarm already stored for the attempt's timeout (at most 30 s ahead) is kept, because a wake never moves an alarm later; it runs, finds nothing due and writes nothing. The backlog control shows this between the last pass and the lease alarm. Review f060871b accepted the same for the landing's cleanup pass.
9. **The backlog control's "a publication lands meanwhile".** The publication's own landing work is due at once, so while it runs the Room stores an alarm for now, as it always has. The control checks the bounds (no stored alarm under 1 s ahead, none past the held attempt's timeout) before the publication and again after the landing's alarm has run. All the ledger's own wake-ups stay within those bounds throughout.
10. **Pre-existing provider text in the landing record is not changed here.** The engine still stores `message(e)` for a failed read of main (`readBackFailed`), a push that did not answer, and a failed integration. Lane B changed only the mint's failure, which it now owns. A separate request should apply the safe-metadata rule there. (Done by request `d29c09fa`: see [below](#request-d29c09fa-safe-error-metadata-at-durable-sinks).)
11. **Test hooks.** The Room controls run the room clock a week ahead of real time with no alarm delay, so a stored alarm is the room's own time and never fires by itself; they set hooks on one object only (its `schedule`, `storeAlarm`, the engine's `tokens.revoke`, the ledger's `waitMs` and `reconcile`, and the canonical fake's `revokeToken`), and restore the suite's existing clock and alarm delay. The idle control counts rows written through a spy on that object's `Sql`.

### Tests: rule map

Git package, `packages/git/test/landing.test.ts` ("mint lane B …", 10 tests, with the production `publicationTokens` and a real `MintLedger` over a canonical repository double; a restart is a new engine and a new ledger on the same SQLite), and `packages/git/test-workers/landing-do.test.ts` (1 new test, real Durable Object restarts). Room, `packages/room/test/workerd/mint-publication-78f0971c.test.ts` (10 tests, the production Room with real storage and alarms). The note's (1) and (2) are red at `3ac55e96` by construction: there was no ledger to own the token.

| Note | Rules | Tests |
|---|---|---|
| (1) | R-MINT-4, R-MINT-7 | Node: a host stops at `token-answered`; the token is the ledger's alone (`held`, on no attempt, in no row); a restart 10 s later makes it `owed`, due 1 s ahead; the ledger revokes it by its ID once; the publication lands forward with attempt 2, one receipt, no live token, no record, no row. Workers: the same across a real abort, through the alarm alone |
| (2) | R-MINT-2, R-MINT-5 | Applied, then `INTERNAL_ERROR`: one `unknown` record, the ledger's retry is a new record whose token is pushed, the same outcome, slot and receipts, and the applied token never revoked, past its lifetime and an observation. A lost answer: one create (the engine does not retry), one `unknown` record, the attempt's detail is safe metadata only, and the next attempt lands |
| (3) | R-MINT-3, R-MINT-4 | A trigger fails `pushToken`'s save: no ID on the attempt, no row, the ledger still owns the token (its release failed, so `owed`), and its pass revokes it by its ID; the publication lands later with a new token. The release is off the publication queue: `publish` ends while it is unanswered |
| (4) | R-MINT-4, R-MINT-7 | The row: written by `pushToken` with the reported expiry, the ledger's record gone in the same transaction; deleted by the held operation's revocation; kept while revocations fail, after the operation ends and past the token's expiry; deleted by plan 003's cleanup pass. A trigger on the row's insert rolls `pushToken` back (and the ledger's release revokes the token); one on its delete rolls `tokenRevoked` back, and the duty stays until it commits |
| (5) | R-MINT-7 | A stored room with an active operation's unrevoked token and an ended operation's owed token gains both rows at its first start, and not again |
| (6) | R-MINT-5, R-MINT-7 | An observation over a listing of exactly those two tokens counts 0 unaccounted; the SQL spy shows two point lookups in `artroom_land_token` and no statement on `artroom_land_op` |
| (7) | | All earlier landing, plan 003 and review f060871b tests pass unchanged (only `FakeTokens` gained the new interface's fields) |
| (8) no alarm stored | R-MINT-2, R-MINT-7 | With no alarm stored and the Room's own scheduling off on that object, while the publication's create is held: an alarm no later than the takeover time, stored by the ledger's wake. A wake that takes 20 s of room time comes before the lifetime: the record holds 60 s and the post-wake send time, and the token expires 60 s after it (approval obligation 1) |
| (8) answer lost | R-MINT-5, R-MINT-7 | Abort while the create is held; it applies late. The fresh object has the record `unknown` and stores an alarm by the observation's time (1 s ahead); one alarm observes once (1 unaccounted: the late token; the publication's own live token is known by its row), keeps the record, and stores the next observation (60 s) on time; after the lifetime and another observation, still `unknown`, the late token never revoked |
| (8) earlier alarm | R-MINT-4, R-MINT-7 | The token held after `token-answered`; an alarm for other work 20 s later lands the publication and leaves a stored alarm no later than the takeover time; with no alarm stored, the fresh object stores the ledger's (1 s ahead, the only work due), and its alarm takes over and revokes the token by its ID |
| (8) wake not stored | R-MINT-2 | Storage refuses every alarm: no create while publishing, no record, the attempt's detail is safe metadata only; on a fresh object the publication lands |
| (8) live host | R-MINT-7 | Four alarms, 35 s apart, with a long-held token: each moves the takeover time to 60 s ahead; every stored alarm is at least 1 s ahead and no later than the takeover time; the live host's token is not revoked |
| (8) backlog | R-MINT-4, R-MINT-7 | 45 owed records and one unknown; the first revocation held. While held: one call, `nextDue` at the attempt's timeout, the stored alarm between 1 s ahead and that timeout, also after a publication has reserved, pushed and landed and the landing's own alarm has run. The attempt times out with its backoff; the batch's other 19 are revoked; then through alarms alone the next 20, then the last 5 and the held one, earliest due first, each next alarm exactly 1 s after its pass; the lease alarm, earlier than the next observation, is kept; once it has run, the observation's time is stored exactly (approval obligation 2) |
| (8) expiry | R-MINT-4, R-MINT-7 | A ledger record with a readable expiry whose revocations fail is settled at its expiry: no revocation after it, the token never marked revoked. A landing row for a token whose revocations fail stays past its expiry, with plan 003's record, until `tokenRevoked` |
| idle | R-MINT-7 (request 3da1d82b) | A write spy on the object's `Sql`: the `mints` step, `nextDue` and `nextAlarm` write 0 rows with no records, and with an unknown record whose next observation is not due. A job token's ID (a `job_tokens` row) is not counted as unaccounted |
| fence | request 3da1d82b | A failure of the step sets `loop_backoff.mints` (5 s); `nextAlarm` and the stored alarm wait for it though the ledger's time is earlier; an earlier alarm skips the step and keeps the backoff; at its end the step runs, revokes, and clears it |
| gone | request 3da1d82b | With `canonical_gone` set, the step does not run the ledger, its record is kept, and `nextAlarm` is null |

### Mutation table

Each mutant was applied alone by a script (`/private/tmp/claude-501/mintB/mutants/run.py`) at the merge head `720a7fd4`, the suites named were run, and the file was restored from the commit (`git checkout`). B-mutants are in the Git package and were run against all three suites: `landing.test.ts` (Node), the Git Workers suite, and the Room file; R-mutants are in the Room and were run against the Room file. T marks the note's lane B mutation targets, O the approval's obligations, F the checker's lessons for this lane, and G the other guards. 32 mutants, all red; every new test is red under at least one. No earlier test went red under any mutant. Review `d4a4c681` added K1 and K2 ([below](#review-d4a4c681)), both red.

| Mutant | Kind | Mutation | Red tests |
|---|---|---|---|
| B1 | T | no `claim` in `pushToken` | Node (1), (2) applied-then-error, (4) row, (6); Workers (1); Room: no alarm stored, answer lost, earlier alarm, live host, expiry |
| B2 | T | `claim` outside `pushToken`'s transaction (before it) | Node (3) trigger, (3) off-queue, (4) triggers |
| B3 | T | the token row written outside `pushToken`'s transaction (after it) | Node (3) off-queue, (4) triggers |
| B4 | T | the token row not deleted by `tokenRevoked` | Node (1), (4) row, (4) triggers, bounded revocation; Workers (1); Room: expiry |
| B5 | T | the fill skipped | Node (5) |
| B6 | T | the fill run at every start | Node (5) |
| B7 | T | `knownToken` reading operation bodies (active operations and cleanup records) | Node (6) |
| B8 | T | the engine retrying the mint itself | Node (2) lost answer |
| B9 | G | the `token-answered` point after `pushToken`, not before | Node (1); Workers (1); Room: earlier alarm, live host |
| B10 | G | no release when `pushToken` does not commit | Node (3) trigger, (3) off-queue, (4) triggers |
| B11 | F | the release awaited on the publication queue | Node (3) off-queue |
| B12 | F | the publication token's revocation unbounded | Node bounded revocation |
| B13 | F | retries of that revocation going on after the bound | Node bounded revocation |
| B14 | F | a failed mint's detail keeping the provider's text | Node (2) lost answer; Room: wake not stored |
| B15 | G | the fill leaving out the cleanup records | Node (5) |
| B16 | G | the token row without the reported expiry | Node (4) row |
| B17 | G | the publication lifetime changed (120 s) | Room: no alarm stored (60 s held, expiry 60 s after the post-wake send) |
| R1 | T | the alarm never runs the ledger (no `mints` step) | Room: backlog, answer lost, expiry, earlier alarm, idle, live host, fence |
| R2 | T | `nextAlarm()` leaving out the ledger | Room: backlog, earlier alarm, live host, fence |
| R3 | T | start-up recovery leaving out the ledger | Room: earlier alarm |
| R4 | G | the ledger's wake not persisted (the commit hook instead of the stored alarm) | Room: no alarm stored, wake not stored |
| R5 | G | a failed wake swallowed | Room: wake not stored |
| R6 | G | `known` leaving out the landing's token rows | Room: answer lost |
| R7 | G | `known` leaving out job tokens | Room: idle |
| R8 | G | a ledger built per alarm (a takeover at every alarm) | Room: earlier alarm, live host |
| R9 | O | the ledger's time replacing an earlier unrelated one | Room: backlog |
| R10 | G | `mints` not self-timed (an early alarm clears its backoff) | Room: fence |
| R11 | G | the `mints` step ignoring its fence | Room: fence, gone |
| R12 | G | `nextAlarm()` ignoring the `mints` fence | Room: fence |
| R13 | G | the ledger run while the repository is gone | Room: gone |
| R14 | G | the ledger scheduled while the repository is gone | Room: gone |
| R15 | G | `mints` pending by rows (the 5-second loop fences it) | Room: backlog, fence |

Lane A's mutants (T1 to T17, O1, O2, G1 to G33, F1 to F18, H1 to H4, J1, J2) guard `mints.ts`, which this lane does not change; its 47 tests pass unchanged in the Node gate.


### Review d4a4c681

Report `d4a4c681` on `af89862b` (changes requested) found one P2. `publicationTokens().revoke` checked whether its bounded wait had ended only when an attempt started, before `await o.repo()`. A repository lookup still out at the deadline, the first or a retry's, therefore sent its revocation when it answered, outside the bounded pass and possibly overlapping a later durable retry. The checker's 25 ms deferred-lookup controls saw one provider call where none was expected, and two where one was.

**Change** (`engine.ts` only): the check now runs after the lookup too, immediately before `revokeToken` is sent. The check when an attempt starts stays; it covers a retry whose sleep outlasts the wait. A give-up is a failure for the caller, so the held operation's attempt, or plan 003's cleanup record, keeps the debt for a later bounded pass. Every other bounded provider path was checked for the same gap. The engine's other revocations go through this function. The mint ledger's lookups (`mints.ts`) resolve to nothing when their wait ends, so a late lookup starts no provider work (lane A's F5). The Room passes only the repository function.

| Control (`landing.test.ts`, 200 ms wait) | What it shows |
|---|---|
| "review d4a4c681: a revocation whose repository lookup is still out when the bounded wait ends …" | The first lookup is held past the wait, then answers: no provider call. The landing goes on, its debt and token row stay, and a later cleanup pass revokes the token by its ID with one call |
| "review d4a4c681: a retry whose repository lookup is still out …" | The first attempt fails with a transient error, and the retry's lookup is held past the wait: one call, not two. The debt stays, and a later pass revokes the token |
| "review d4a4c681: a retry whose sleep outlasts the bounded wait …" | The retry's sleep is held past the wait: no further lookup and one call. The debt stays, and a later pass revokes the token |

| Mutant | Mutation | Red tests |
|---|---|---|
| K1 | no check after the lookup (the reviewed head's code) | the first two controls |
| K2 | no check when an attempt starts | the sleep control |

### Gates

Run at the exact head that carries this section, serially, with logs in `/private/tmp/claude-501/mintB/`; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git`, `npm test -w @generalbusiness/artroom-git` (Node) and `npm run test:workers -w @generalbusiness/artroom-git`; `npm run typecheck -w @generalbusiness/artroom-room`, `npm run test:node -w @generalbusiness/artroom-room` and `npm run test:workerd -w @generalbusiness/artroom-room`; then from the root `npm ci`, `npm run typecheck` and `npm test`; then `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; no credentials, nothing is uploaded). The Git harness is type-checked separately with a scratch tsconfig, as the package gates do not cover `measure/`.

### Not changed here

Lane C's sites keep their own mints: the publisher client's `withToken` (integrate, pinning, previews), the log remote, snapshot preparation's canonical read token and check jobs (`watchMint` and its `mint:` rows). The Room's `known` already includes `job_tokens`, so lane C's claim into that table needs no change here. `mints.ts` is unchanged. Showing the ledger's records to admins stays with the cleanup projection request (`8d249233`).

## Request d29c09fa: safe error metadata at durable sinks

Status: DONE, pending checker review. Gitseq request `d29c09fa`, branch `request/land-errors`, cut from main `574568b2`. Revised for review `f80d6692` (changes requested: legacy rows) and the checker's founding control on `18d69cda`: see [Review f80d6692](#review-f80d6692). The head for review is the commit that carries this section.

**The rule** (review `0ab6dac3`, lane A's standard). A durable or projected error field keeps lane A's `errorNote(stage, error)` and nothing more: a fixed stage phrase, the error's name if it is in a fixed list, an Artifacts code if `artifacts.ts` classifies it, and an integer numeric code or HTTP status. It never keeps the provider's message, even redacted: no token format in the contract lets a pattern find every credential. Operator logs are different. The Room's `diagnose` (`src/diag.ts`, request `d268d249`) logs the error's name and its redacted, bounded message; that is unchanged.

**What changed.** `errorNote` stays in `packages/git/src/mints.ts`, so lane C's edits there merge mechanically. Its `ErrorStage` type gains the new phrases, and the package exports `errorNote`, `ErrorStage` and `knownArtifactsCode` (the error's code if it is a known Artifacts code, else null). `publisher/push-outcome.ts` adds `outcomeNote(outcome)`: `push answered: <outcome>`, the kind of refusal, and an Artifacts refusal code from `ARTIFACTS_REFUSALS`.

### Sinks

Fixed (the stored text before, and now):

| Sink | Where | Before | Now |
|---|---|---|---|
| Landing record `lastError`, main not read back after a push (also `PublicationStatus.lastError`) | `landing/engine.ts` `readBackAndApply` → `core.readBackFailed` | `main could not be read: <message>` | `errorNote("main could not be read", e)` |
| Push attempt `detail`, a push that did not answer | `engine.ts` `publishStep` | `push did not answer: <message>` | `errorNote("push did not answer", e)` |
| Push attempt `detail`, a push that answered | `engine.ts` `publishStep` | git's stdout and stderr from the sandbox (only `art_v…` tokens redacted) | `outcomeNote(answer)` |
| Landing record `lastError`, a failed integration (the engine's catch) | `engine.ts` `prepare` → `core.prepared` | `<message>` | `errorNote("integration failed", e)` |
| `IntegrateResult.detail`, which the record keeps, from the Room's publisher | `publisher/client.ts` `ContainerPublisher.integrate` | `<message>` (token lookup, mint or sandbox error) | `errorNote("integration failed", e)` |
| `IntegrateResult.detail` from the Node publisher | `publisher/git-publisher.ts` | `GitError` message: git's stderr | `errorNote("integration failed", e)` |
| Landing record `lastError`, readiness that cannot be computed | `engine.ts` `evaluateNow` → `core.readinessFailed` | `<message>` (policy runtime, Artifacts reads) | `errorNote("readiness could not be computed", e)` |
| Workspace `artroom_ws.error`, and the failed workspace operation's `error.message` (its view, and act records that hold it) | `workspace/workspaces.ts` `failure` | `Could not provision the workspace: <message>`, token pattern redacted | `errorNote("could not provision the workspace", e)` |
| `artroom_ws_duty.last_error`, a failed or refused remote step | `workspaces.ts` `failedStep`, `answered` | `String(e)`, token pattern redacted | `errorNote("workspace step failed", e)` |
| `artroom_ws_duty.last_error`, cleanup owed after a failure (8 call sites, all through `defer`) | `workspaces.ts` `defer` | the same | `errorNote("workspace cleanup failed", e)`; `defer` now takes the error, not text |
| `artroom_snap_duty.last_error`: a failed create, an unresolved create's check, failed cleanup | `snapshot/repos.ts` create, `recheck`, `defer` | `String(e)`, token pattern redacted | `errorNote("snapshot create failed" / "snapshot create not yet seen" / "snapshot cleanup failed", e)` |
| Room `job_tokens.last_error`, and `jobTokenDuties().status` (operators): a lost mint, an unreadable inventory, a failed revocation | `room/src/jobs.ts` | `redact(String(e))` (`diag.ts`) | `answer lost: errorNote("create failed", e)`, `outcome unknown; errorNote("the token inventory could not be read", e)`, `errorNote("revocation failed", e)` |
| Room `meta.publication_error`, and the code in the caller's `unavailable` message | `room/src/core.ts` `publish` | the thrown error's `code`, any string | a known code (lane L's `PublishErrorCode`, the Room's `unknown-version` and `cohort-mismatch`), else a known Artifacts code, else `transport` |

Left as they are, with the reason:

| Sink | Why it is left |
|---|---|
| `artroom_mint.last_error`, the observation, `MintLedger.duties()` | Lane A: already `errorNote` |
| Push attempt `detail` `token not minted (…)` and `abort attempt before the push started` | Lane B's `errorNote`, and a fixed phrase |
| `job_tokens.last_error` values `ended`, `held`, `minting`, `refused`, `malformed answer`; the observation `N live token(s) … not accounted for at <time>`; the inventory's `… is incomplete or malformed` | The Room's own text, with counts and times. `jobs.ts` no longer runs them through `redact`, as they hold no provider text |
| `notify_queue.last_error` | Fixed phrases: `policy runtime failure`, `runtime failure` |
| `check_jobs.outcome` | `not-needed`, `unbound`, `refused: <rule>`, or a report's ID |
| `reason` and `done_reason` of `artroom_ws_duty` and `artroom_snap_duty`; a refused first commit (`the first commit was refused`) | Fixed codes and phrases |
| A workspace failure from `CleanupOwed` or `NotOurFork` | The Room's own messages: a count, and (since review `f80d6692`) a fixed sentence with no repository names |
| Landing `reason` and `fix`, `land-outcome` events; a `policy-invalid` refusal naming the first configuration problem | Retry and failure codes and the Room's fix text. A configuration problem comes from parsing and validating `.artroom/*.json` in the integration: repository content the members wrote, not provider text |
| Previews' `failed` body | A fixed `ArtroomError` ("The preview could not be computed.") |
| Attention and admin items | Built from fixed templates with IDs, lanes, generations and times; none from an error. `log-publication-stalled` names `NOT_FOUND` and the repository, in fixed text |
| `keys.reason`, `revoked_keys.reason`, a check report's `detail` | Text from signed acts, written by members |
| Operator logs: `RoomCore.diagnose` | A log, not a row or a projection: the error's name and its redacted message (request `d268d249`). The Room tests here check that the diagnoses hold none of the three samples either |
| Fields read at runtime and never stored: `PushOutcome.detail` inside the publisher (pinning reads `[up to date]`, `toLogOutcome` its refusal code), lane L's `PublishError` message and refusal detail (they reach the diagnosis log; `publication_error` keeps the code), `FirstCommitOutcome.detail`, `StageResult.detail`, `GitError` messages, and errors to clients (`toArtroomError` gives unknown errors a fixed message) | Not durable and not projected. `outcomeNote` is applied at the engine, not in the publisher, because pinning and the log push read the publisher's text at runtime |

### Choices for the checker

1. **The publishers return safe metadata**, and the engine stores `IntegrateResult.detail` as it comes. Both publishers and the engine's own catch use `errorNote`; the type says the field is safe metadata only.
2. **Rows written before the rule are upgraded** (review `f80d6692`, which rejected leaving them): every projection checks its value first, and a one-time upgrade rewrites the stored fields in bounded batches. See [Review f80d6692](#review-f80d6692).
3. **Names.** `errorNote`'s list of allowed names is unchanged, so an Artifacts binding error (`ArtifactsError`) reads `an error of another kind`, with its code and numbers.
4. **A publication code that is not known becomes `transport`.** The alarm's backoff and the gone-repository probe (`NOT_FOUND`, a known Artifacts code) are unchanged.
5. **Request `d268d249`'s job-token test** now expects metadata only at its three sinks, and also checks every row of every table and `jobTokenDuties()`.

### Tests

Each test makes the provider throw (or answer) with a message echoing an `art_v1_…` token, an `Authorization: Bearer` header's credential and a URL query's secret (assembled at runtime, so the source holds no credential-shaped literal). Each checks the exact stored metadata, and that none of the three appears in any row of any table or in what is shown.

| File | Tests | Shown and checked |
|---|---|---|
| `packages/git/test/safe-errors.test.ts` (new, 7) | integration (engine catch), integration through `ContainerPublisher`, integration through `GitPublisher` (git stderr), readiness, unanswered push, answered push (and `outcomeNote` for every outcome), main not read back | every row, `view`, `activeViews`, `status`, `slot`, the room's log |
| `packages/git/test/workspaces.test.ts` (3 new) | provisioning that keeps failing (the view, `artroom_ws`, the steps), a refused step (`answered`), failed cleanup (`defer`) | every row, `view`, `duties`, the returned view |
| `packages/git/test/snapshots.test.ts` (2 new) | a failed create, then its check; failed retirement (revoke and delete) | every row, `duties` |
| `packages/room/test/workerd/safe-errors-d29c09fa.test.ts` (new, 5) | the production Room: integration through `ContainerPublisher` then readiness; an answered push with main not read back, then an unanswered push; a publication failing with a credential as its code, with no code, and with a known Artifacts code | every row of every table, the `log`, `attention`, `lanes` and `op` reads, `PublicationStatus`, the operator diagnoses, the caller's error |
| Review `f80d6692` and the checker's founding control (Node 7 more in the three files above; Room 4 more, and 2 in `founding-gaps.test.ts`) | stored rows with old text, reopened; terminal rows; batches; see [Review f80d6692](#review-f80d6692) | every row, the projections before the upgrade, and after it |
| `packages/room/test/workerd/request-d268d249.test.ts` (1 changed) | the lost mint, the unreadable inventory, the failed revocation of job tokens | `job_tokens`, every row of every table, `jobTokenDuties()` |

### Mutation table

Each mutant was applied alone by a script (`/private/tmp/claude-501/landerr/mutants/run.py`) at the committed implementation `e5f990d1`. Git mutants ran against `safe-errors.test.ts`, `workspaces.test.ts` and `snapshots.test.ts`; those the Room reaches also ran, as did the Room mutants, against `safe-errors-d29c09fa.test.ts` and `request-d268d249.test.ts`. The file was restored from the commit after each. 21 mutants, all red; every new test is red under at least one. "The provider's text" below is the error's message, or for M8 the push's output.

| Mutant | Mutation | Red tests |
|---|---|---|
| M1 | `readBackFailed` given the provider's text | Node: main not read back; Room: answered push, main not read back |
| M2 | an unanswered push's detail with the provider's text | Node: unanswered push; Room: the same test |
| M3 | an answered push's detail kept as the publisher gave it | Node: answered push; Room: the same test |
| M4 | the engine's integration catch keeping the provider's text | Node: integration (engine catch) |
| M5 | `readinessFailed` given the provider's text | Node: readiness; Room: integration then readiness |
| M6 | `ContainerPublisher.integrate` returning the provider's text | Node: integration through `ContainerPublisher`; Room: integration then readiness |
| M7 | `GitPublisher.integrate` returning the `GitError` message | Node: integration through `GitPublisher` |
| M8 | `outcomeNote` appending the push's output | Node: answered push; Room: the same test |
| M9 | the workspace failure's message with the provider's text (the old form) | Node: provisioning that keeps failing; a refused step |
| M10 | `failedStep` storing `String(e)` | Node: provisioning that keeps failing |
| M11 | `answered` storing `String(e)` | Node: a refused step |
| M12 | the workspace `defer` storing `String(e)` | Node: failed cleanup |
| M13 | a failed snapshot create storing `String(e)` | Node: a failed create, then its check |
| M14 | the snapshot `recheck` storing `String(e)` | Node: a failed create, then its check |
| M15 | the snapshot `defer` storing `String(e)` | Node: failed retirement |
| M16 | a lost job-token mint storing `String(e)` | Room: job tokens (request d268d249's test) |
| M17 | an unreadable inventory storing `String(e)` | Room: job tokens |
| M18 | a failed job-token revocation storing `String(e)` | Room: job tokens |
| M19 | `publication_error` from the thrown code as it is (the old form) | Room: a code that is provider text |
| M20 | `knownArtifactsCode` keeping any code | Room: a code that is provider text |
| M21 | `publicationCode` keeping any code | Room: a code that is provider text |

Lane A's mutants guard `errorNote` itself (F7: `errorNote` keeping the message).

### Review f80d6692

Report `f80d6692` on `f81a102d` (changes requested) found one P2. New writes were safe, but rows stored before the rule kept the provider's text. Two reopen controls showed it through `PublicationStatus.lastError` and a failed `WorkspaceOp.error.message`, before any retry overwrote them. Ending a row does not erase it: a revoked workspace keeps its error, and a terminal landing record keeps its body.

**One validator** (`packages/git/src/safe-errors.ts`). `isSafeErrorText(text)` accepts exactly the text the sinks now write: `errorNote`'s output, `outcomeNote`'s, lane B's `token not minted (…)`, the job tokens' forms and state words (`held`, `ended`, `minting`, `refused`, `malformed answer`), `CleanupOwed`'s sentence, `NotOurFork`'s sentence, and the replacement phrase. The language has no free-text part: every part is a fixed phrase, a name or code from a fixed list, a bounded integer or a timestamp. So the validator does not try to clean old text. It accepts only text that cannot hold a credential, and anything else is replaced whole. To keep it that way, `NotOurFork`'s message no longer names repositories. `safeErrorText(text, stage)` returns the text if it is safe, else `<stage>: legacy error withheld`, using the stage the text starts with, if any.

**At read.** `PublicationStatus.lastError`, `WorkspaceOp.error.message` (the workspace view, and so the `op` read) and `jobTokenDuties().status` show only what the validator passes. So nothing stored before the rule is shown, from the moment the object opens, whether or not the upgrade has reached that row. Attention and admin items, and the landing views, show no error field.

**At rest.** Room migration 2 starts a one-time upgrade. In its transaction, in O(1), it stores a cursor (`meta.error_scrub`) if any table that could hold an old error has rows, and makes a `publication_error` that is not a known code `transport`. Each alarm then runs one batch (`RoomCore.scrubErrors`, the `errors` step; `nextAlarm` is due at once while the cursor is stored). A batch reads at most `SCRUB_BATCH` (500) rows of one table after the cursor, by its key. It rewrites only the unsafe values, in one transaction with the new cursor. The last batch deletes the cursor. After that the step reads one meta row and writes nothing, and a run over upgraded rows changes nothing. The tables, in order: `artroom_land_op` (every record, terminal ones too: `lastError` and each push's `detail` in the JSON body), `artroom_ws` (`error`, revoked rows too), `artroom_ws_duty` and `artroom_snap_duty` (`last_error`, done rows too), and `job_tokens` (`last_error`). Nothing else changes: ownership, token IDs, expiry and deadlines, `next_ms` and backoff, attempts, unknown and known effects (`mint:` rows stay unknown mints), `held`, cleanup duties and their state. Signed history (entries, records, acts) is never touched. A host without an alarm (tests, the Git harness) can run every batch at once with `scrubLegacyErrors(sql)`.

| Control | What it shows |
|---|---|
| Node: the validator | Every form the sinks write passes; the provider's text, with or without a stage, a known note with text after it, an unknown name or code, a repository name, and the empty string do not |
| Node: reopen a landing record | A held record's `lastError` and push `detail` written with the provider's text; a new engine on the same storage shows `main could not be read: legacy error withheld` in `PublicationStatus` before any step; the upgrade rewrites both fields, and a second run changes nothing |
| Node: a terminal landing record | A landed record's body with old text: the upgrade changes only `lastError` and the push details; state, receipt, tokens, outcomes and timing are as they were |
| Node: safe values stay | A record with safe metadata only is not changed |
| Node: reopen a workspace | A failed workspace's error and its steps' errors with old text: the reopened view shows `could not provision the workspace: legacy error withheld`; after it is revoked, the upgrade still rewrites its row and steps |
| Node: reopen snapshot steps | One old step and one safe step: only the old one changes |
| Node: batches | Seven rows, a batch limit of 3, and a table that does not exist: the cursor moves 3 rows at a time, the missing table is skipped, and the last batch ends the upgrade |
| Room: reopen a stored room | A room put back at version 1 with old text in every field above (landing record and push, failed workspace, a done workspace step, a done snapshot step, three job tokens, `publication_error`) and safe values beside them, then aborted and reopened. Before any batch, `PublicationStatus`, the workspace `op` read and `jobTokenDuties` show only the withheld phrase, and the log, attention and lanes reads hold none of the text. The cursor is stored and the alarm is due. The batches then end with the cursor deleted. Every field is rewritten, the safe ones are unchanged, and the job tokens' expiry, `next_ms`, attempts and kinds are as before. A further run writes nothing, and no row of any table holds the text |
| Room: the job-token view | Rows written with old text after the upgrade are shown withheld; `held` stays `held` |

| Mutant | Mutation | Red tests |
|---|---|---|
| V1 | the validator accepting any string | Node: validator, every reopen control, terminal record, batches; Room: reopen, job-token view |
| V2 | a note's name followed by any text | Node: validator |
| V3 | `answer lost: ` followed by any text | Node: validator; Room: reopen, job-token view |
| V4 | `NotOurFork`'s old sentence, with repository names | Node: validator |
| V5 | the withheld phrase always the fallback stage, never the text's own | Node: validator, landing reopen, snapshot reopen, terminal record; Room: reopen |
| V6 | `PublicationStatus.lastError` shown as stored | Node: landing reopen; Room: reopen |
| V7 | the workspace view's message shown as stored | Node: workspace reopen; Room: reopen |
| V8 | `jobTokenDuties().status` shown as stored | Room: reopen, job-token view |
| S1 | no migration 2 | Room: reopen |
| S2 | migration 2 storing no cursor | Room: reopen |
| S3 | `publication_error` left as stored | Room: reopen |
| S4 | a batch skipping the next table | Room: reopen |
| S5 | the last batch starting again instead of ending | Room: reopen |
| S6 | `nextAlarm` leaving out the upgrade | Room: reopen |
| S7 | a full batch moving to the next table (rows after the limit never reached) | Node: batches |
| S8 | a batch reading with no limit | Node: batches |
| S9 | a landing record's `lastError` not upgraded | Node: landing reopen, terminal record; Room: reopen |
| S10 | push details not upgraded | Node: landing reopen, terminal record; Room: reopen |
| S11 | workspaces' `error` not upgraded | Node: workspace reopen; Room: reopen |
| S12 | workspace steps not upgraded | Node: workspace reopen; Room: reopen |
| S13 | snapshot steps not upgraded | Node: snapshot reopen; Room: reopen |
| S14 | job tokens not upgraded | Room: reopen |
| S15 | every string rewritten, safe or not (the same text, written again) | Node: safe values stay (it counts writes) |
| S16 | a job token's status checked only in parts, never whole | Room: reopen (a safe `outcome unknown; N live token(s)` observation) |

24 mutants, all red, each applied alone by `/private/tmp/claude-501/landerr/mutants/run2.py` at `e5a2efb3` (logs beside it). S15 and S16 were green there. The commit after it adds the write count and the safe observation, and both are red at `a1176a89`.

#### The founding path (checker's control on `18d69cda`)

The checker's control showed a cursor that was never drained. A public founding failed its revocation, and its alarm then settled all the remote debt without sealing the genesis. A version-1 room with a done workspace step holding old text was then reopened. Migration 2 stored the cursor, but an unfounded room's `recover` and `schedule` used only `foundingDue` (null by then), and its alarm ran only `settleFounding`.

**Change.** On the founding path, `recover` and `schedule` now use `RoomCore.unfoundedDue()`: the earlier of the founding debt and the upgrade, which is due at once while its cursor is stored (`scrubDue`). The alarm's work there is `workUnfounded()`: the upgrade's next batch, then the founding cleanup. A failure of one does not stop the other. A founded room already had the upgrade in `nextAlarm` and in `runAll` (the `errors` step). That step is not a loop kind, so it also runs while the canonical repository is gone, and when other steps fail. There is no other alarm path: a room's alarm runs either the founded composition or the founding one, and the registry stores no error fields.

| Control | What it shows |
|---|---|
| `founding-gaps.test.ts`: the checker's control | As the checker ran it, with its file also run as it was (`/private/tmp/claude-501/landerr/checker-founding-control.log`, passed). After the founding debt is settled, a reopened version-1 room with old text in a done workspace step stores an alarm, and alarms alone drain the cursor and rewrite the text. The room stays unfounded |
| `founding-gaps.test.ts`: founding debt still owed | The same with every workspace step holding old text while the revocation is still owed: the same alarms drain the upgrade and settle the founding debt |
| `safe-errors-d29c09fa.test.ts`: a founded room; the canonical repository gone | Old text in a done workspace step, a done snapshot step and a job token, reopened at version 1: recovery stores an alarm, and alarms alone drain the cursor and rewrite all three, also while `canonical_gone` is set |

| Mutant | Mutation | Red tests |
|---|---|---|
| F1 | an unfounded alarm running only `settleFounding` (the reviewed code) | both founding controls |
| F2 | an unfounded `schedule` using only `foundingDue` | both founding controls |
| F3 | an unfounded `recover` using only `foundingDue` | the checker's control |
| F4 | `unfoundedDue` leaving out the upgrade | both founding controls |
| F5 | `workUnfounded` not running the batch | both founding controls |
| F6 | `scrubDue` always null | both founding controls; the Room reopen control |
| F7 | `nextAlarm` leaving out the upgrade | the Room reopen control |
| F8 | the `errors` step doing nothing | a founded room; canonical repository gone |

8 mutants, all red, each applied alone by `/private/tmp/claude-501/landerr/mutants/run3.py` at `db6247c8`.

### Gates

Run at the exact head that carries this section, serially, with logs in `/private/tmp/claude-501/landerr/`; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git`, `npm test -w @generalbusiness/artroom-git` (Node) and `npm run test:workers -w @generalbusiness/artroom-git`; `npm run typecheck -w @generalbusiness/artroom-room`, `npm run test:node -w @generalbusiness/artroom-room` and `npm run test:workerd -w @generalbusiness/artroom-room`; then from the root `npm ci`, `npm run typecheck` and `npm test`.

## Mint lane C (request 5ff58c9a)

Status: DONE, pending checker exact-head review of the combined candidate after [review 31ad41d5](#review-31ad41d5), at the head that merges main `df22d771` (request `d29c09fa`, safe error metadata). Gitseq request `5ff58c9a`, branch `request/mint-sites`, cut from main `574568b2`. It implements lane C of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane C: the other canonical sites"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

**Scope.** The note's lane C paths on main's current layout: `packages/git/src/publisher/client.ts`, `packages/room/src/artifacts.ts`, `logremote.ts`, `config.ts`, `ports.ts`, `core.ts` (the snapshot path, and the constructor, which now builds the ledger before the Artifacts adapter that needs it), `jobs.ts` and `store.ts` (a schema comment). Two small additions to lane A's `mints.ts`: `adopt()` for the one-time move, and `within` exported for the job tokens' bounded wait. The Git harness (`measure/harness/worker.ts`) and the Room's `measure/logbig/worker.ts` pass the ledger where they build these clients. Tests: a new Room workerd file `test/workerd/mint-sites-5ff58c9a.test.ts`, a node source scan `test/node/mint-sites-scan.test.ts`, and the earlier controls that described the old job mint records, restated through the ledger. The two package READMEs name the change. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What was built

| Site | Purpose (ledger record) | Lifetime | Owner after the answer |
|---|---|---|---|
| `ContainerPublisher.integrate` | `integrate:<op>:<attempt>` | 60 s write | the ledger, released after the sandbox call |
| `Pinning.pinObjects`, canonical half | `pin-objects:<head>` | 600 s write | the ledger, released |
| `Pinning.pinRef` | `pin-ref:<lane>:<generation>` | 60 s write | the ledger, released |
| `Pinning.preview` | `preview:<lane>:<generation>` | 60 s write | the ledger, released |
| log remote `readRef` | `log-read:<ref>` | 60 s read | the ledger, released |
| log remote `push` | `log-push:<commit>` | 60 s write | the ledger, released |
| snapshot preparation's canonical read (`core.ts`) | `snapshot:<commit>` | 300 s read | the ledger, released |
| a whole-tree check job (`jobs.ts` `issue`) | `job:<job>_<attempt>` | ends 5 s before the deadline | claimed into `job_tokens` |

- **Released sites** use `mints.withToken(purpose, scope, () => ttl, fn)`: the record and wake-up before the request, a bounded wait, a lost answer kept as `unknown`, and a revocation by ID afterwards whose failure makes the record `owed` (due in 1 s, backed off to 5 min) for a later alarm. Nothing is dropped. The publisher clients take the ledger as `PublisherClientOptions.mints`; the Room's `ArtifactsAdapter` passes it to `Pinning`; `Remotes.logRemote(repo, mints)` receives it, and the Room passes `RoomCore.mints`. The log remote reads the repository's remote before minting, so the token's lifetime is not spent on that lookup.
- **Check jobs.** `issue` calls `mints.mint(job:<id>, "read", (sentAt) => floor((deadline - sentAt) / 1000) - 5, { notAfter: deadline })`. The lifetime is a function of the send time, which the ledger calls after the wake-up is stored, and the pre-send record holds that recomputed lifetime (approval obligation 1). The three deadline checks: (1) the lifetime asked ends 5 s before the deadline, from the post-wake send time; (2) the reported expiry is by the deadline, now the ledger's `notAfter`, checked before any caller gets the token, so a token that would outlive the deadline is never returned or claimed, and the ledger owes its revocation; (3) `issue` still never dispatches at or after the deadline (`core.now() >= deadline`), and ends the token instead. The claim: one transaction writes the `job_tokens` row with the handoff metadata (`token_id = id`, `expires_at = expiresAt`, `next_ms = expiresAt`, `last_error = 'held'`) and calls `claim()`. If that transaction fails, the ledger still holds the token and `release()` revokes it at once (a failure there is owed).
- **`watchMint` and the `mint:<job>` rows are gone.** The ledger's records and its shared observation replace them. A room stored before this change moves its open `mint:` rows into the ledger once, at the object's start (`moveJobMints`, meta key `job_mints_moved`), in one transaction: each becomes an `unknown` record (`job:<job>`, read, `notAfter` = the row's deadline) through `MintLedger.adopt` (one summary write), and the rows are deleted. A room with none only sets the key. After that, each start reads one meta row.
- **Ended job tokens** (`settleToken`) keep their owner rule, as today: a row ends when Artifacts answers its revocation, or once its known expiry has passed, with no revocation; a row with no known expiry is never settled by time. The repository lookup and the revocation now share one bounded wait (30 s, `MINT_WAIT_MS`), the expiry is checked again after the lookup immediately before the send, nothing is sent once the wait has ended, and a late answer changes nothing. A failure is stored as `errorNote("revocation failed", e)`, never the provider's text.
- **The job token pass** (review `b84aead9`). Ended job tokens are revoked by their own pass, not by the jobs step: at most 20 rows due now, earliest due first, read by the index `job_tokens_due (next_ms, token_id)`, which Room migration 3 installs (below, review `993dce7a`). The pass runs in the background, one at a time, and the alarm never awaits it, so the alarm's later steps (snapshots, abort, publication, mints) run while a revocation is held. While a pass waits on an attempt, its rows are not eligible before that attempt's timeout. `jobTokensDue()` gives the earliest eligible time; a time already passed (a backlog) is now plus 1 s, a still-future time is itself, and `nextAlarm()` takes the earlier of it and other work, so an earlier unrelated alarm is kept and a fresh object schedules the debt at start with no request. It is its own loop kind, `jobTokens`, under lane B's `loop_backoff` fence: a failure of its step (reading the batch) takes the kind's backoff, which ends only when the step runs (self-timed), and while the canonical repository is gone it is neither run nor scheduled.
- **The jobs step** issues at most 20 jobs, earliest due first, by the partial index `check_jobs_due (next_ms) WHERE state != 'done'`, also from migration 3; a batch left over is due 1 s later (`jobsDue()`). Each issue's waits are bounded (the ledger's).
- **`jobTokenDuties()`** lists `held` and `revoke` rows only. An unknown job mint is a ledger record, read through `core.mints.duties()`.
- **Safe metadata.** Integrate's detail for any failure, the mint's included, is request `d29c09fa`'s `errorNote("integration failed", e)` (this branch's own `token not minted (…)` form gave way to it at the merge); every ledger record and job token row keeps `errorNote` text only, and `jobTokenDuties()` shows `safeJobStatus` text, as `d29c09fa` made it.
- **The fork read token** in `pinObjects` is unchanged (`withForkToken`, still a hidden retry and a dropped revocation), pending request `02836f9a`. The source scan names it as that pending exception.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **Job tokens are settled at their expiry before any revocation is tried** (standard 3, "re-check expiry right before any revocation"), not only after a failed one, as before. A row due at its expiry (a held token whose attempt ended without its end being written, or an attempt found past its deadline) is deleted with no call: the token no longer reads. Eight earlier controls asserted `revoked === true` for a token past its expiry; they now assert that it no longer reads and that its row has ended (below).
2. **A token owed at once is revoked by the ledger's next pass**, not inside `issue` (lane A's choice 2). Controls that expected a refused job token revoked by the jobs step alone now run the `mints` step.
3. **`moveJobMints` runs in the `RoomCore` constructor, unwrapped**, as lane B's `token-index` fill. A storage failure there fails the object's start, as `createSchema` would; a partial move is impossible (one transaction with the meta key). The moved records' `sent_at` is the move time: the old rows did not keep the send time; the note on each record says so.
4. **The bounded wait for job tokens** is the ledger's constant; `setJobTokenWait(core, ms)` (a per-object `WeakMap`, like `jobs.ts`'s waits) lets the controls use 200 ms on one object. No process global is swapped.
5. **Purposes** are per site and per operation (table above), so admins can tell the records apart in `duties()`; a `job:` purpose is the attempt's job ID.
6. **Ledger writes per mint.** Each released mint writes four record statements (the record, the lifetime asked, the answer, the deletion), as the note's three rows plus lane A's post-wake lifetime update, and a summary write for the takeover time at most every 30 s. A failing log publication mints 11 tokens per retry (lane L's read-backs and pushes), so request 3da1d82b's backoff control now counts the ledger's writes separately and checks they are a fixed number per retry. Request `8bd623cc` may want to measure this.
7. **The `RoomCore` constructor builds the ledger earlier**, before the Artifacts adapter that takes it. Its `known` callback still reads `landing` lazily. This is outside the snapshot path, but unavoidable.

Review `b84aead9` accepted choices 1 to 5, and moved the cost in choice 6 to request `8bd623cc`'s accounting. These were added for its findings:

8. **Job tokens follow the `mints` kind's rules**: self-timed, fenced after a failure of their own step, and held, kept, while the canonical repository is gone. A held row with a known expiry is therefore not settled by time while the repository is gone; it is when the repository returns.
9. **The jobs step stays awaited by the alarm**, as before, but takes at most 20 jobs a step; each issue's provider waits are the ledger's bounded ones. Two writes over due rows stay single statements: a room the registry does not bind pushes every due job's time forward in one `UPDATE`, and the one-time move of `mint:` rows is one transaction at first start. `jobTokenDuties()` (an operator read) still returns every row.
10. **The source scan uses Babel's TypeScript parser** (`@babel/parser`, pinned as a Room dev dependency; it was already installed). The review preferred the TypeScript compiler API, but TypeScript 7, the native compiler this repository uses, ships no in-process parser, only an unstable API that spawns the native binary and parses only files in a project.
11. **Room migration 3 creates the due indexes** (`DUE_INDEXES`, `CREATE INDEX IF NOT EXISTS`), not the base step: a stored room never reruns an earlier step, so only a later one reaches it. Written as version 2, it was renumbered to 3 when request `d29c09fa` landed first with its error scrub at 2 (main `df22d771`, merged here). The composed chain is tested from each stored version: a version-1 room gets the scrub (its cursor stored, then drained by its own step to safe text) and the indexes; a version-2 room gets the indexes only, and the scrub does not run again; a version-3 room reopened changes nothing.
12. **`declare` declarations are scanned too**, not skipped: an ambient context holds only types, which are erased inside it, and TypeScript refuses an initializer there, so scanning them costs nothing and hides nothing.

### Tests: rule map

Room, `packages/room/test/workerd/mint-sites-5ff58c9a.test.ts` (26 tests, the production Room with real storage and alarms), and `packages/room/test/node/mint-sites-scan.test.ts` (3 tests). The note's tests 1 to 4 are red at `3ac55e96` by construction: no site there kept a record.

| Note | Rules | Tests |
|---|---|---|
| (1) | R-MINT-2, R-MINT-5, R-MINT-7 | For each of the eight sites: the site's create applies and its answer is lost. One `unknown` record with the site's purpose; integrate's detail is safe metadata only. Restart: the fresh object schedules the overdue observation exactly 1 s ahead, with no request; two alarms, each followed by the next observation's still-future time, stored exactly (approval obligation 2). The record is kept and observed, and the applied token is never asked to be revoked |
| (2) | R-MINT-4, R-MINT-7 | For each site: its token's first revocation fails. The debt is kept with `errorNote` text (the ledger's `owed` record, or the job's token row); a later alarm revokes it by its ID (two calls in all) and the record ends. Each site's lifetime is as before |
| (3) | R-MINT-5 | A stored room with two open `mint:` rows and a held token row: at the next start, two `unknown` records with the right purposes and deadlines, counts 2/0, the held row kept, the observation scheduled 1 s ahead; a `mint:` row written after the move is not moved by a later start; the moved records are observed, never settled |
| (4) | R-MINT-2, R-MINT-3, R-EXEC-9 | Through `issue` and the production ledger, each with a wake-up that takes 20 s of room time, and each checking the pre-send record: `notAfter` = the deadline and the lifetime computed from the post-wake send time. Wake delay: sent, expiry 5 s before the deadline, handoff metadata. Create delay (20 s): expiry 15 s past the deadline, passes the generic check; owed (`an expiry after notAfter`), never sent, revoked by its ID at the next pass. Answer delay (20 s): claimed and sent. Boundaries: a reported expiry equal to the deadline is accepted and sent, 1 ms later is owed; dispatch at the deadline sends nothing and ends the token, 1 ms before sends it |
| (4) retained | R-EXEC-9, R-MINT-5 | `job-token-mint.test.ts` lines 121–180 (was 123–177), review 013dad0c's control: a mint held past its deadline, attempt 2 sent, then the first applies. Late usable answer: owed, revoked by its ID, never sent. Minted in time, answer late: claimed by the superseded attempt and ended. Lost answer: `unknown` past the deadline and past the lifetime asked, across a restart and an alarm |
| (5) | R-MINT-4 | A job token row whose revocations fail is retried while the token reads, and settled once its expiry passes, with no further call. A job's ledger record with no readable expiry stays `owed` through 18 hours of failing passes. Bounded: a revocation that never answers ends within the wait, its late answer changes nothing; a lookup still out at the end sends nothing, then or later; an expiry that passes during the lookup settles the row with no call |
| bounded | R-MINT-4, R-MINT-7 | 45 ended job token rows due at once, the first revocation held: the alarm returns while it is held and its publication step runs; the rows are ineligible until the attempt's timeout (5 s here), and no stored alarm is under 1 s ahead or past it; the first pass revokes exactly the 20 due earliest; then alarms alone take the next 20 and the last 5, each next alarm exactly 1 s after its pass. A fresh object with no alarm stored schedules overdue rows 1 s ahead and future rows at their own time, after an earlier lease alarm, which runs first; its alarms alone revoke them. The `jobTokens` fence: a failure of the step takes the backoff, an earlier alarm skips the step and keeps it, `nextAlarm` waits for it, then the step runs and clears it; while the repository is gone, a row is kept and nothing is scheduled. 25 jobs due at once: one jobs step takes the 20 due earliest, the rest are due 1 s later |
| upgrade | R-MINT-7 | Twice, from schema version 1 and from version 2: a stored room with neither index, a held job token, a job token row with legacy error text, an owed job and an unknown mint, reopened at version 3: both indexes; every row, the ledger, the log head and meta unchanged; from version 1 the scrub's cursor is stored and its own step drains it to safe text, from version 2 the scrub does not run again and the row keeps its text; the production due queries are each one indexed search (`SEARCH job_tokens USING COVERING INDEX job_tokens_due (next_ms<?)`, `SEARCH check_jobs USING INDEX check_jobs_due (next_ms<?)`), with no temporary B-tree; reopened at version 3, nothing changes |
| (6) | R-MINT-1 | Every production source file is parsed, every node but erased TypeScript syntax visited. Outside the harnesses, `measure/` and tests, `createToken` is reached once each in `mints.ts`, `workspace/workspaces.ts`, `snapshot/repos.ts` and `publisher/client.ts`, and nowhere else; the client's one reach is inside `withForkToken`, used once, for the fork (pending request `02836f9a`). An actual fixture file outside the allowed files (`test/node/fixtures/create-token-forms.ts`) with twenty forms of reach (call, optional call, optional receiver, string index, optional string index, template index, alias, destructuring, renamed and quoted destructuring; and in executable TypeScript, the checker's runtime namespace probe, an enum initializer, `as`, `!`, `satisfies`, an angle-bracket assertion, an instantiation expression, a parameter property, a class field and a decorator) fails on exactly those twenty lines, and not on its type positions, `declare` declarations, interface, type alias or string argument; the checker's namespace probe as a new Room source file fails; at an allowed path it fails on its count; a reach outside `withForkToken` in the client fails |

**Earlier controls restated through the ledger** (same meaning; only what the old `mint:` rows or an inline revocation showed changed): `job-token-mint.test.ts` (all 13: observations and backoff are the ledger's, a malformed answer with an ID is owed and revoked by that ID), `review-90f30a3b.test.ts` (refused tokens are the ledger's and revoked by its pass; cleanup across a restart through the ledger's backoff), `review-271dbd53.test.ts` (a refused token is never the job's; transfer failures leave the ledger owning it), `review-0f9739dc.test.ts` and `review-786e9606.test.ts` (an expired token's row ends with no call), `request-d268d249.test.ts` (the job sinks keep `errorNote` text, and no table holds the injected text, as request `d29c09fa` checks), `mint-publication-78f0971c.test.ts` (its holds and wake controls target the publication's create, now that integrate mints through the ledger too), `idle-writes-3da1d82b.test.ts` (choice 6), `phase2b.test.ts` and `config.test.ts` (the log remote takes the ledger).

### Review b84aead9

Report `b84aead9` on `d24e5a46` (changes requested) found two P2s, both reproduced by the checker.

1. **Job token revocation was not bounded.** A real Room alarm with 45 due, unexpired job token rows sent all 45 revocations, and `issueJobs` scanned and awaited every due row before the alarm's later steps. Now a bounded pass of its own (above, "The job token pass"), and the jobs step takes a bounded batch. Every other loop over due rows this lane added or touched was checked (choice 9).
2. **The source scan missed `repo.createToken?.('read', 60)`** in a new Room source file. The scan now parses every file and counts reaches by syntax (above, (6)). The checker's control, as a new file in `packages/room/src`, fails the scan (checked by hand at this head, then removed); the fixture file holds it as one of its ten forms.

### Review 993dce7a

Report `993dce7a` on `7eb9e36f` (changes requested) credited the bounded background pass and the parser for the original cases, and found two P2s, both reproduced by the checker.

1. **The due indexes never reached a stored room.** They were in the base schema step, which `migrate` skips for a room already at version 1, so an existing room kept scanning and sorting both tables. They are now a Room migration of their own, version 3 after the merge with request `d29c09fa`'s scrub at 2 (choice 11), and the "upgrade" control reopens a version-1 room and checks the plans. The checker's control (`/tmp/artroom-checker-mint-c-v2-upgrade-control.test.ts`) asserts a fresh room is at version 1, which is no longer true; with that line changed to set version 1, it passes against this head.
2. **The scan skipped every TypeScript node** but five expression kinds, so a runtime namespace hid a reach. The traversal is inverted: only an explicit set of erased syntax is skipped, the emitted TypeScript nodes are listed, and an unknown TypeScript node stops the scan (choice 12 for `declare`). The checker's probe (`/tmp/artroom-checker-mint-c-v2-scan-probe.ts`), copied into `packages/room/src`, fails the scan (checked by hand at this head, then removed), and it is in the fixture. The checker's scan control file carries its own copy of the old scan, so it stays red by design.

### Merge with main `df22d771` (request `d29c09fa`)

Request `d29c09fa` landed first, and its approval `d1f23589` asked the combined candidate to reconcile the migration history. Conflicts, and how each was settled:

- `packages/room/src/store.ts`: the scrub stays version 2, and the due indexes are version 3 (choice 11).
- `packages/git/src/index.ts`: both exports, `within` and `knownArtifactsCode`.
- `packages/git/src/publisher/client.ts`: `d29c09fa`'s integrate detail, `errorNote("integration failed", e)`, which covers a failed mint as well; this branch's `minted` flag went.
- `packages/room/src/jobs.ts`: this branch's (the ledger replaced `watchMint` and the `mint:` rows), with `d29c09fa`'s `safeJobStatus` in `jobTokenDuties()`.
- `request-d268d249.test.ts`: this branch's ledger-based form, under `d29c09fa`'s name.

Three of `d29c09fa`'s tests met this branch's design and were adapted, keeping their meaning. Its reopen control ("on reopen no projection shows the text …") now starts from a room stored before both lanes, so its legacy `mint:` rows move into the mint ledger at the start, as unknown records with a fixed note; the control checks those four records and that no table holds the text, and the store ends at version 3. Its operators' view control no longer writes a `mint:` row, which can no longer arise. Its Git control builds `ContainerPublisher` with a stand-in ledger, now required.

### Review 31ad41d5

Report `31ad41d5` on `e03a9c95` resolved both P2s of review `993dce7a` (60 mutations red; choices 11 and 12 appropriate) and asked only for the combined candidate with request `d29c09fa`, now landed. Its requirements, and where each is met:

- **Landed migration 2 kept, due indexes as 3** (choice 11; the merge above).
- **Both stored versions, with an in-progress scrub and a restart.** The "upgrade" control runs from version 1 (the scrub starts, its own step drains it, the indexes are installed) and from version 2 (indexes only; the scrub does not rerun). A new control starts a room at version 2 with the scrub's cursor stopped mid-table in `job_tokens` and legacy rows after it: migration 3 adds the indexes and leaves the cursor; production alarms alone resume the scrub from the cursor (the rows after it are made safe, the row before it is not revisited), finish it and remove the cursor; ownership and deadlines are kept; a restart changes nothing. Both indexes are used: each due query is one indexed search, no sort.
- **Cleanup still finishes through production alarms, before and after founding.** `d29c09fa`'s founded control ("in a founded room the upgrade drains …", with and without the repository) and its two unfounded controls (`founding-gaps.test.ts`, "the error upgrade drains in an unfounded room …") pass on the combined head, and now also check that the chain reached version 3 with both indexes; the unfounded ones check that `unfoundedDue()` is the earlier of the founding debt and the scrub's work (the scrub's, due at once).
- **No landed sink or guard dropped.** Every line `d29c09fa` added to the files both lanes touch was checked against the combined head. Kept as landed: in `mints.ts`, `knownArtifactsCode` and the stage list; in `client.ts`, integrate's `errorNote("integration failed", e)`; in `core.ts`, `publicationCode` (known codes only), the `errors` step, `scrubErrors`, `scrubDue`, `unfoundedDue` and the scrub in `nextAlarm`; in `store.ts`, migration 2, `PUBLICATION_CODES`, `safeJobStatus`, `ROOM_SCRUB_TABLES` with `job_tokens`; in `index.ts`, the safe-error exports; in `jobs.ts`, `jobTokenDuties()`'s `safeJobStatus` read guard and the failed revocation's `errorNote("revocation failed", e)` (in `settleToken`'s bounded form). Gone by design: `jobs.ts`'s three `mint:` sinks (the lost mint's `answer lost: …`, `watchMint`'s inventory note, and its import of `completeInventory`), because the mint ledger replaced those records; the ledger's own sinks are `errorNote` throughout (lane A).

### Mutation table

Each mutant was applied alone by a script (`/private/tmp/claude-501/mintC/mutants/run.py`) at the merge `6a40738a` (M1 to M4 again at `dc01cd19`, with the controls added for review `31ad41d5`), the suites named were run, and the file was restored from the commit (`git checkout`). Every mutant ran against the lane C workerd file, the restated controls (`job-token-mint`, `review-90f30a3b`, `review-271dbd53`, `request-d268d249`, `review-786e9606`, `review-0f9739dc`), request `d29c09fa`'s Room controls (`safe-errors-d29c09fa`, and `founding-gaps` for M1 to M4) and the source scan. T marks the note's lane C mutation targets, O the approval's two obligations, G the other guards, B the bounded passes of review `b84aead9` (its four named guards are B1 batch, B2 ordering, B6 in-flight eligibility and B4 continuation), S the source scan's enforcement and traversal, and M the due indexes' migration (review `993dce7a`: S6 to S9 break the new traversal guard, M1 to M3 the upgrade; review `31ad41d5`: M4 the composed chain). 56 mutants, all red, and every test in the lane C workerd file and the source scan is red under at least one. Earlier runs, at `62048db6` (29 mutants), `fe68473e` (44), `3ed73ae2` (48) and `37eab909` (55), are kept beside it: G14 survived the first (no control checked that the log push still landed with its write token; "(2) the log remote's push" now does), and the scan's first, regex form, mutant S1 then, was replaced with the parser-based scan. Lane A's own mutants of `mints.ts` (including O2a, the 1 s step postponing a future time when anything is overdue) stay with lane A's 47 tests, which pass unchanged.

| Mutant | Kind | Mutation | Red tests |
|---|---|---|---|
| T1a | T | a site calls `createToken` directly (pinRef) | (1) and (2) pinRef; (6) three scan tests (the count, the client's one reach, a reach outside `withForkToken`) |
| T1b | T | a site calls `createToken` directly (the log remote, as before lane C) | (1); (2) readRef and push; (6) |
| T1c | T | a site calls `createToken` directly (snapshot preparation, as before lane C) | (1) and (2) snapshot; (6) |
| T1d | T | a site calls `createToken` directly (a check job, with its own deadline check) | 26 tests: (1), (4) every case, (5) settlement, all of `job-token-mint` but the refusal, review-90f30a3b (4), review-271dbd53 (2), review-786e9606, request-d268d249, (6) |
| T2a | T | a dropped revocation failure (publisher client: the record given up, revoked outside the ledger, failure swallowed) | (2) integrate, pinObjects, pinRef, preview |
| T2b | T | a dropped revocation failure (the log remote) | (2) readRef and push |
| T2c | T | a dropped revocation failure (snapshot preparation) | (2) snapshot |
| T2d | T | a dropped revocation failure (a job token row deleted when its revocation fails) | (2) check job; (5) all four job-token controls; request-d268d249 |
| T3a | T | the move run at every start | (3) |
| T3b | T | the move not run at all | (3) |
| T4 | T | `issue`'s `notAfter` left out of the job's mint | 17 tests: (4) every case; `job-token-mint` (9, the 013dad0c control among them); review-90f30a3b (2); review-271dbd53 |
| T5 | T | `issue`'s check for a passed deadline before dispatch removed | (4) dispatch boundary; `job-token-mint` "an answer still outstanding …"; review-90f30a3b "an answer delayed past the attempt's deadline …" |
| O1 | O | the lifetime computed before the wake-up, so the pre-send record does not hold the lifetime recomputed after it | (4) all five cases |
| O2 | O | the 1 s continuation applied to a still-future time too (`nextDue`) | (1) (the next observation stored exactly); review-90f30a3b "cleanup fails, and the room restarts" |
| G1 | G | the claim before the `job_tokens` transaction, not inside it | review-271dbd53 both transfer controls |
| G2 | G | no release when the claim does not commit | review-271dbd53 both transfer controls |
| G3 | G | handoff metadata: `next_ms` not the reported expiry | (4) wake delay; review-271dbd53 (2) |
| G4 | G | no expiry recheck after the lookup, before the send (job tokens) | (5) "an expiry that passes during the lookup …" |
| G5a | G | a job token revocation not bounded | (5) "a revocation that never answers …" |
| G5b | G | a job token revocation's lookup not bounded (a late lookup still sends) | (5) "a repository lookup still out …" |
| G6 | G | a job token revocation failure stores the provider's text | (2) check job; (5) two; request-d268d249 |
| G7 | G | the move drops the deadline (`notAfter`) | (3) |
| G8 | G | the move keeps the old rows | (3) |
| G9 | G | adopted records not counted (unknown count, observation) | (3) |
| G10 | G | integrate stores the provider's text for a failed mint (its `d29c09fa` sink) | (1) integrate; `safe-errors-d29c09fa` |
| G11 | G | no margin under the deadline for a job's lifetime | (2) check job lifetime; (4) all five; review-90f30a3b "a mint delayed by less than the room's margin" |
| G12 | G | the pinning token's lifetime changed (600 s to 60 s) | (2) pinObjects |
| G13 | G | the snapshot read's lifetime changed (300 s to 600 s) | (2) snapshot |
| G14 | G | the log push minted as a read token | (2) push; the three job token controls that publish the log |
| B1 | B | the job token pass unbounded (1,000 a pass) | bounded: 45 rows |
| B2 | B | the job token pass ordered by token ID, not due time | bounded: 45 rows; the fence; upgrade (the plan) |
| B3 | B | the job token pass awaited by its alarm step | bounded: 45 rows (the alarm does not return while the revocation is held) |
| B4 | B | a job token backlog returned as is (no 1 s continuation) | bounded: 45 rows; fresh object |
| B5 | B | the 1 s step applied to a still-future job token time too | bounded: 45 rows; fresh object |
| B6 | B | job token rows eligible while a pass waits on an answer | bounded: 45 rows |
| B7 | B | the job token step ignores its fence | the fence |
| B8 | B | `nextAlarm` ignores the job token fence | the fence |
| B9 | B | job tokens not self-timed (an early alarm clears the backoff) | the fence |
| B10 | B | job tokens run while the repository is gone | the fence |
| B11 | B | job tokens scheduled while the repository is gone | the fence |
| B12 | B | the jobs step unbounded (1,000 a step) | bounded: 25 jobs |
| B13 | B | the jobs step in row order, not due order | bounded: 25 jobs; upgrade (the plan) |
| B14 | B | a jobs batch left over returned as is (no 1 s continuation) | bounded: 25 jobs |
| S1 | S | the scan: property accesses not counted (the checker's optional call passes) | (6) all five |
| S2 | S | the scan: destructuring not counted | (6) the fixture; the count at an allowed path |
| S3 | S | the scan: element access by a string not counted | (6) the fixture; the count at an allowed path |
| S4 | S | the scan's enforcement removed (no file is checked) | (6) the production scan; the fixture; the namespace probe; the allowed-path count |
| S6 | S | the traversal guard as before review `993dce7a` (every TypeScript node skipped but assertions) | (6) the fixture; the namespace probe; the allowed-path count |
| S7 | S | namespaces treated as erased | (6) the fixture; the namespace probe; the allowed-path count |
| S8 | S | enum members treated as erased | (6) the fixture; the allowed-path count |
| S9 | S | parameter properties treated as erased | (6) the fixture; the allowed-path count |
| M1 | M | the due indexes' migration (3) removed | upgrade (from 1 and from 2); mid-scrub at 2; `d29c09fa`'s founded (2) and unfounded (2) upgrade controls and its reopen control (each now checks version 3) |
| M2 | M | the upgrade guard broken: the due indexes only in the base step, which a stored room never reruns | as M1 |
| M4 | M | the composed chain broken: the due indexes folded into step 2 (as numbered before the merge), which a version-2 room never reruns | upgrade (from 2); mid-scrub at 2; and, as the version ends at 2, the controls M1 names |
| M3 | M | the job token index without its tie-break (a sort for the order) | upgrade (the plan); mid-scrub at 2 (the plan) |
| S5 | S | the fork exception not held to `withForkToken` | (6) a reach outside `withForkToken` |

### Gates

Run at the exact head that carries this section, serially, with logs in `/private/tmp/claude-501/mintC/`; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git`, `npm test -w @generalbusiness/artroom-git` (Node) and `npm run test:workers -w @generalbusiness/artroom-git`; `npm run typecheck -w @generalbusiness/artroom-room`, `npm run test:node -w @generalbusiness/artroom-room` and `npm run test:workerd -w @generalbusiness/artroom-room`; then from the root `npm ci`, `npm run typecheck` and `npm test`; then `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; no credentials, nothing is uploaded). The Git harness is type-checked separately with a scratch tsconfig, as the package gates do not cover `measure/`.

### Not changed here

The fork read token in `pinObjects` (request `02836f9a`). `MintLedger`'s behaviour (lane A) and the publication token (lane B). Showing the ledger's records to admins stays with the cleanup projection request (`8d249233`). Requests `8bd623cc` (row writes) and `d29c09fa` (error sinks) touch `core.ts` and `jobs.ts`; this branch will merge main when they land.

## Live propose 503 after lanes B and C (request df6ff8d3)

Status: DONE, pending checker exact-head review. Gitseq request `df6ff8d3` (planner to builder), branch `request/live503`, cut from main `d3f7d3a8`, whose source equals `965c911a`. The head for review is the commit that carries this section. Main `b44601dd` (row writes `58a2f0a0`, the declared-acts note) was merged in afterwards. Only `notes/deploy-spike.md` conflicted, and both sides' sections are kept. The merge touches none of this fix's files. The spike still runs the build of `0753d7de`, which does not have the row-write changes.

**The defect.** After the spike was redeployed from main `965c911a` (Room version `5ad0e3f2`), every `propose` failed in under a second with 503 `unavailable`, "The repository could not be read. Nothing was recorded; retry with the same idempotency key." The log was never published either. Reproduced at 03:03 UTC on `5ad0e3f2`: the full smoke failed 12 steps, the same 12 as the planner's run (all four proposes, the landings after them, and both log publications and verifications). Cleanup was `ok`.

### Diagnosis

**The step and its cause, from the Room's own diagnosis.** A temporary deploy (Room `e46f42bd`) put the diagnosis that `preAdmission` logs into the 503's message. Every propose gave:

```
{"event":"pre-admission-failed","step":"propose.pinObjects","name":"Error",
 "message":"Artifacts' answer cannot be used (an expiry later than the lifetime asked); the token is owed revocation"}
```

That is the mint ledger's check on the answer to the canonical write token that `Pinning.pinObjects` asks for (`pin-objects:<head>`, 600 s). R-MINT-3 lets a token be used only if its reported expiry is no later than the answer's arrival plus the lifetime asked. A second temporary deploy (Room `b70de69e`) added the margin to the message. For the four proposes of one run, Artifacts' expiry was **67, 44, 41 and 45 ms** later than the Room's arrival time plus 600 s. Artifacts sets the expiry by its own clock and the Room reads the arrival by its own, and Artifacts' clock was ahead. The check had no margin, so every canonical mint failed: pinning, and also previews, integration, publication and log reads and pushes. That is why the logs were not published. The tests could not see this: the in-memory Artifacts and the Room share one clock.

Mint lanes B and C caused the failure only by moving these mints into the ledger. Lane A's check was never run against live Artifacts before this deployment. The other suspects did not apply: the token-create answer had the shape, the scope and a readable expiry, and the ledger's tables and indexes were in place.

**Why the tail showed no diagnosis.** The line was logged, but the Durable Object's trace events reached `wrangler tail` late, and not on the propose's own event:

- In both tails (the planner's, and mine from 03:03 UTC), the Room `submit` event of each failing propose was missing while the tail ran. The Worker's `POST /acts` event with status 503 was there. (The planner's run from 02:54 UTC was still in its checks phase when mine began; its events are in my tail too.)
- When the temporary deploy shut down the `5ad0e3f2` objects at about 03:14 UTC, the tail received a batch of their held events, some from 10 minutes before. It included failing proposes' `submit` events, with no logs, and Room alarm events that carried the lines. Each `pre-admission-failed` line came on the alarm event that started while that propose was still running: the ledger stores a wake-up at once for an owed token, so the alarm starts during the propose. For example, my run's lane 3 propose ran from `1790996955205` for 283 ms, its room's alarm started at `…955367`, and the line is stamped `…955398`. The `publication-failed` lines with the same message came on later alarm events. Some failing proposes' events had still not arrived when the tail stopped.
- On the measurement build, a probe line logged at the start of each `submit` appeared on the `submit` events that arrived. So console output from the Room does reach the tail.

So the diagnosis goes to the Worker's log as request `d268d249` intended. No sink other than the console is wired in production (`services.diagnose` is set only by tests). The catch is not bypassed. The delay and the attribution to another event are the Durable Object runtime's, and this request does not change them. To read a Room's diagnoses, keep the tail running until the object stops (a redeploy stops it), and look at every `Room` event, alarms included, not only the propose's. Why the runtime held these events for so long was not established.

### The fix

`packages/git/src/mints.ts`: the generic check allows `MINT_CLOCK_ALLOWANCE_MS` (5,000 ms, exported from the package) past the arrival plus the lifetime asked. That is about 75 times the largest margin measured, and the same 5 s as the deadline margins (`TOKEN_MARGIN_S`). An answer whose expiry is later than that still makes the token owed and unused. `notAfter` (a check job's deadline) has no allowance. A check job asks for a lifetime that ends 5 s before its deadline, so a fast clock up to that size is already covered there.

R-MINT-3 in [docs/protocol.md](../docs/protocol.md) section 32 and the design note's "The answer" now state the allowance. No other Room record compares a reported expiry with the lifetime asked: workspace and snapshot tokens are checked against their lease end and deadline, with 5 s margins.

### Tests

| Test | On `965c911a`'s source | On the fix |
|---|---|---|
| Room, `test/workerd/live-propose-df6ff8d3.test.ts`, "67 ms ahead, as live": Artifacts' clock 67 ms ahead of the Room's. Two proposes are admitted, both lanes land (the second through a sandbox merge), the log publishes, and no ledger record or active canonical token is left | red: `ArtroomError: The repository could not be read. Nothing was recorded; retry with the same idempotency key.` at the first propose, as live | green |
| Room, same file: an expiry a minute past the lifetime asked is still refused. The propose is `unavailable`, the diagnosis names `propose.pinObjects` and the reason, and the `pin-objects` record is owed | green | green |
| Git, `test/mints.test.ts`, "(4) Artifacts' clock ahead …": 67 ms and exactly 5,000 ms past are usable, 5,001 ms is owed, 1 ms past `notAfter` is owed, and all four tokens are revoked by ID | red: the module has no `MINT_CLOCK_ALLOWANCE_MS` (without that import, the mutant "no allowance" below is the old code) | green |
| Git, the existing "(4) … a longer expiry …" test: the longer expiry is now 5,001 ms past, not 1 ms | — | green |

The Room test's skew is set on the in-memory Artifacts' own clock (`now`), which sets token expiries and expiry states. No process global is swapped.

**Mutants**, each applied alone to `packages/git/src/mints.ts` and restored, with the Git ledger tests and the Room file run each time:

| Mutant | Mutation | Red |
|---|---|---|
| no allowance | the check as before (`> arrival + ttl`) | Git: the new test. Room: "67 ms ahead" |
| no check | the generic check removed | Git: the new test and "(4) … a longer expiry …". Room: "a minute past" |
| boundary | `>=` for `>` | Git: the new test (exactly 5,000 ms) |
| allowance on `notAfter` | `notAfter` also given 5 s | Git: the new test (1 ms past `notAfter`) |

### Live

| When (UTC) | Room version | Checker version | What |
|---|---|---|---|
| 02:41 (planner) | `5ad0e3f2` | `7cc7e16e` | main `965c911a` |
| 03:03 | `5ad0e3f2` | `7cc7e16e` | reproduced: 12 FAIL, cleanup `ok` |
| 03:14 | `e46f42bd` | `9b21cfc4` | temporary: the diagnosis in the 503 |
| 03:22 | `b70de69e` | `0b4fd37d` | temporary: the measured margin in the 503, a probe line in `submit` |
| 03:34 | `6d15d828` | `c18342a3` | the fix, `0753d7de` (source as at this head) |

Each deploy used `packages/room/scripts/deploy-spike.sh`, with no retry. The same `ROOM_KEY_SECRET` and `CHECKER_KEY` values were put again; no credential was created or rotated. Neither temporary change is in any commit.

**The smoke on the fix**, all phases, `node packages/room/measure/spike-smoke.mjs`, 03:35:10 to 03:39:12 UTC: passed, exit 0, 91 of 91 steps ok. The four proposes took 1.1 to 3.1 s. The public, import and checks logs were published and verified (through entries 14, 8 and 15). Cleanup was `ok`, with 0 unresolved and no repository left. A tail of that run recorded 239 events from `6d15d828`, all `ok`, with no log line and no exception. Record: [spike-smoke-2026-10-03T03-35-10-310Z.json](../packages/room/measure/results/spike-smoke-2026-10-03T03-35-10-310Z.json). The spike is left running this fix.

**A cleanup that needed finishing.** The first temporary run (03:15 UTC) stopped after the public phase, when hugh's wrangler OAuth access token expired mid-run: Artifacts REST answered `10000 Authentication error`, so the smoke's cleanup could not run and reported `ok false`. After `wrangler whoami` refreshed the login, the same `cleanupRun` from `measure/cleanup.mjs` deleted the run's canonical repository and two forks, with no active token on them, and its final listing showed nothing left. Neither spike namespace has a smoke repository left. Later runs refreshed the login first.

### Gates

Run at the exact head that carries this section, serially; the exit codes are in the delivery report. `npm run typecheck`, `npm test`, `npm run test:workers` and `npm run test:log` in `@generalbusiness/artroom-git`; `npm run typecheck`, `npm run test:node` and `npm run test:workerd` in `@generalbusiness/artroom-room`; then from the root, under bash, `npm ci`, `npm run typecheck` and `npm test`.

### Not changed here

How the Durable Object runtime delivers trace events. Sending diagnoses from the stateless Worker as well, so they show at once, would need the Room to pass them over RPC; that is a separate request if wanted.

## Declared acts stage 1 (request 245986cb)

Status: implemented, pending review. Gitseq request `245986cb` (planner to builder), stage 1 of 7 in section 8.5 of [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md), approved as design in review `1808ae17`, under hugh's assert `4e4134b4` as corrected by `b2cdc44a`. Branch `request/decl-stage1`, cut from main `b44601dd`. The head for review is the commit that carries this section. Nothing was pushed or deployed, and no Cloudflare credential was used.

The request cited some sections by an earlier revision's numbers. As the coordinator corrected: the acts validator is the note's section 3.4, the recovery decision 3.5, the evaluator decision 3.8, and the amendment inventory 8.2. This work follows those sections.

### What was added

- **Protocol.** [docs/protocol.md](../docs/protocol.md) section 33, contract amendment 6: rules R-DECL-1 to R-DECL-26 (33.2); every "Amend" of the note's section 8.2, plus R-SIG-1, R-SIG-5, R-ADM-3, R-CRED-10 and R-POL-12, in one table (33.3); every new refusal code, event and outcome in one table (33.4), including `kind-undeclared`, `binding-stale`, `wrong-thread`, `scope-fixed`, `reserved`, `check-unroutable`, `prepared`, `reservation-ended`, `handed-over`, `hold-unending`, the verify failures, `git-unwitnessed`, and the verifier's unsupported-version outcomes `steps-unsupported` and `profile-unsupported`; acceptance cases by stage (33.5); the stage-2 suite criterion (33.6); the types and data (33.7); conditions and stages (33.8); open points 46 to 48 (33.9). Assert `e7307f81`'s two passages are quoted in the section's opening and stated as rules in R-DECL-17 (intersection, never acquisition) and 33.6 (the four fixture conversions, none permission to weaken an assertion).
- **The note.** The wording of commit `d126b9d2` (branch `declared-acts-wording`) is applied to the landed note, unchanged: the `v1`-era grant intersection rule in section 2.3.2, and the four listed fixture conversions in sections 6 and 8.5. The note and the protocol now agree.
- **Contract.** `packages/contract/src/declarations.ts`: the declaration types (`ActDeclaration` and its parts: targets and steps, `threads`, `body` fields, `who`, `hold`, refusal wording and slots, `help`), `PolicyDocumentV2` with `acts`, `steps` and `profile`, `CheckerConfigV2` with `act`, the binding (`Binding`, `BindingSubject`, `BindingField`, `BindingHold`), grant maps (`GrantMap`, `DelegateOpV2`, `InvitationSessionV2`, `DelegationV2`), `DeclaredEnvelope` (`v: 2` with `binding`), `DeclaredBearerAct`, the platform kinds and `RecoverOp`, `CheckJobV2`, `DeclaredPolicyLane`, `PreparedEvent`, `ReservationEndedEvent`, `HandedOverEffect`, `CheckUnroutable` and its attention item, `ActsCatalogue`, and the verify outcome names. `packages/contract/src/legacy.ts`: `ARTROOM_LEGACY_V1`, the legacy vocabulary as deep-frozen data, and `ARTROOM_LEGACY_V1_DIGEST` (`sha256:ea4361a697d1c7e1bf7ecdfe6576b81ecbad48aee78b857e0a7958dfa14b3937`). `PlatformRule` gains the five new refusal codes. The seven typed records and every existing type are unchanged.
- **Policy.** `packages/policy/src/acts.ts`: the acts validator `validatePolicyV2` (with the room's historical opening kinds and the head's checker configurations as context) and `validateCheckerConfigV2`, 73 guards, each one statement marked `// G:<id>`. `binding.ts`: `bindingSubject`, `bindingOf`, `bindingsOf`. `codereview.ts`: `CODE_REVIEW_ACTS`, the note's section 6 declarations as deep-frozen data. All are exported; nothing at runtime calls them. `validate.ts` now exports its helpers (`Problems`, `documentFields`, `checkerFields`, `result`) so the two validators share one implementation; `validatePolicy` and `validateCheckerConfig` check the same things in the same order with the same messages.
- **Tests.** `packages/policy/test/declared-acts.test.ts`, 104 tests (in workerd one node-only test is skipped), and the jam fixture `packages/policy/test/support/jam.ts`, copied from note section 7.1.

### Decisions for hugh (note 3.5 and 3.8)

Written as the note recommends, since hugh has not decided otherwise: a platform kind `recover` for configuration recovery in `v2` rooms (R-DECL-21), and a policy document that names its evaluator profile, changed only by activation, with the genesis naming the initial profile (R-DECL-22, amending R-GEN-1, R-GEN-10 and R-EVAL-4). If hugh decides otherwise before review, only those two rules change.

### Where this departs from the note, and why

1. **`recover` has a seventh op, `take`.** The note lists six. R-ADMIN-5 and R-LANE-7 let an admin take over a recovery lane today, and a legacy recovery lane still open at the first `v2` activation needs that path once its holder's lease expires.
2. **`kind-undeclared` is decided first in step 4a, not at step 5** (open point 47). The note puts the binding check between steps 4 and 5, and a binding can be compared only with a declared kind. Both steps are unrecorded.
3. **An absent `leaseSeconds` binds to the string `"room"`** (point 46, now settled). The room's lease is deployment configuration (`LEASE_SECONDS`); resolving it to a number in the binding would let a deploy change bindings, which note 3.9 forbids. After the checker's question in review, the numeric value is resolved when a thread opens and recorded on the thread, and R-DECL-6 and R-DECL-9 use that recorded value for the thread's life, so a deployment lease change affects only threads opened afterwards. The binding still excludes the number; the test "the subject resolves every default" pins `leaseSeconds: "room"`, and mutant `B:lease-default` turns it red.
4. **The binding resolves required-ness.** A body field's `optional` and `requiredFor` become one list, `required`, of the act's targets where the field is required, so writing a default out never changes a binding. Lists otherwise keep their written order.
5. **`threads` exactly when needed.** The validator also refuses `threads` on an act with no `thread`, `version` or `line` target, where it would mean nothing.
6. **Reservation lengths.** An absent `reserveSeconds` means the thread cannot be handed over, and a `hand-over` naming a declared opening kind without one is refused (guard `handover-reserve`). The note gave no default.
7. **Bounds the note left to the amendment** (R-DECL-26): at most 64 kinds and 32 fields per act; label, help and wording lengths; field-name and enum-value grammars (an enum value must be able to fill a scope slot).
8. **Scope slots** must name a `segment` or `enum` field that is required on target `none`, so a slot is never empty at `open`.
9. **"Body field names do not reuse a step's field names"** is read per act, for the act's own steps. Read across all steps, it would refuse the note's jam `signal`, whose `to` field is also `hand-over`'s.
10. **New types sit beside the existing unions.** `SystemEvent`, `LaneEffect`, `FailReason`, `AttentionWhy`, `RosterOp`, `Envelope` and `CheckJob` are unchanged: the UI and CLI switch exhaustively over some of them, so widening them now would force code changes that stage 1 excludes. Each new type names the stage that joins it. `PlatformRule` was widened, because nothing switches over it.
11. **The legacy description is of main `b44601dd`**, not `df22d771`. Between the two, admission differs only by the spike-only `PIN_DELAY_MS` switch (request `8bd623cc`), which admits the same acts.
12. **The contract package has no test runner,** so the digest test lives in the policy package, which depends on the contract. The digest uses the same `digestJson` that records decision inputs.

### Rule map

| Rule | Contract | Validator guards and functions | Tests (`declared-acts.test.ts`) |
|---|---|---|---|
| R-DECL-1 | `ARTROOM_LEGACY_V1`, `ARTROOM_LEGACY_V1_DIGEST`, `PolicyDocumentV2` | `doc-format`, `doc-object`, `doc-keys` | the legacy digest; frozen to the leaves; `G:doc-*` |
| R-DECL-2 | `KindName`, `PlatformKind` | `kind-grammar`, `kind-reserved` (`RESERVED_KINDS`) | `G:kind-grammar`; `G:kind-reserved` (`prepared`, `recover`) |
| R-DECL-3 | `ActDeclaration` | `decl-object`, `decl-keys`, `label`, `help` | `G:decl-*`, `G:label`, `G:help` |
| R-DECL-4 | `TargetShape`, `Step`, `StepList` | `targets-nonempty`, `target-shape`, `target-steps` (`STEPS_FOR_TARGET`) | `G:target-*` (wrong target, third step, pair on `version`) |
| R-DECL-5 | `Step` | `field-reserved` (`STEP_FIELDS`) | `G:field-reserved` |
| R-DECL-6, R-DECL-23 | `ThreadKind` | none (stage 2) | none |
| R-DECL-7 | `HoldDeclaration.scope` | `hold-scope`, `template-chars`, `slot-field`, `template-glob` | `G:hold-scope`, `G:template-*`, `G:slot-field` |
| R-DECL-8 | `ActDeclaration.threads` | `threads-required`, `threads-unused`, `threads-list`, `threads-known` | `G:threads-*`; a historical opening kind is valid |
| R-DECL-9 | `HoldDeclaration` | `hold-required`, `hold-unused`, `hold-object`, `hold-keys`, `hold-conflict`, `hold-lease`, `hold-workspace` | `G:hold-*` |
| R-DECL-10 | `reserveSeconds`, `HandedOverEffect`, `ReservationEndedEvent` | `hold-reserve`, `handover-reserve` | `G:hold-reserve`, `G:handover-reserve` |
| R-DECL-11 | `ActDeclaration.who` | `who-object`, `who-keys`, `roles-list`, `roles-admin`, `roles-known`, `roles-checker`, `delegable` | `G:who-*`, `G:roles-*`, `G:delegable` |
| R-DECL-12 | `DeclaredField` | `body-object`, `body-count`, `field-name`, `field-reserved`, `field-object`, `field-type`, `field-keys`, `text-max`, `globs-max`, `int-range`, `enum-values`, `optional-bool`, `optional-and-requiredfor`, `requiredfor-targets` | `G:body-*`, `G:field-*`, one test per type limit |
| R-DECL-13 | `RefusalWording`, `RefusalSlot` | `refusals-object`, `refusal-code`, `wording-object`, `refusal-keys`, `wording-length`, `wording-slot`, `wording-brace` | `G:refusal*`, `G:wording-*` |
| R-DECL-14 | `StepsVersion` | `doc-steps`; the binding's `steps` | `G:doc-steps`; the steps version changes the binding |
| R-DECL-15 | `Binding`, `BindingSubject`, `BindingField`, `BindingHold` | `bindingSubject`, `bindingOf` | the subject resolves every default; label, help, wording and `who` leave it unchanged; writing a default out leaves it unchanged; each change of meaning changes it; an explicit conflict ignores `lanes`; one kind's change leaves the others unchanged; it is the SHA-256 of canonical JSON |
| R-DECL-16, R-DECL-17 | `DeclaredEnvelope`, `DeclaredBearerAct`, `GrantMap`, `DelegateOpV2`, `InvitationSessionV2`, `DelegationV2`; `PlatformRule` | types only (stage 2) | typecheck |
| R-DECL-18 | `CheckerConfigV2`, `CheckJobV2` | `checker-shape`, `checker-object`, `checker-keys`, `checker-format`, `checker-act`, `checker-declared`, `checker-step`, `checker-role`, `checker-body` | `G:checker-*` (no `act`, undeclared, `signal`, `review`, roles, a required field, the v1 format); the code-review `check` act may be named |
| R-DECL-19, R-DECL-20 | `CheckUnroutable`, `CheckUnroutableAttention`, `PreparedEvent` | types only (stage 4) | typecheck |
| R-DECL-21 | `RecoverOp`, `RecoverTargets`, `RecoverEnvelope` | `recover` reserved; rules may name it | `G:kind-reserved` (`recover`); rules may name platform kinds |
| R-DECL-22 | `ProfileVersion`, `PolicyDocumentV2.profile` | `doc-profile` | `G:doc-profile` |
| R-DECL-24 | none | all of `validatePolicyV2`, including `acts-object`, `acts-count`, `rule-on`, `sound-version`, `sound-handover` and the warning `warn-unending` | the code-review and jam documents validate; one `G:` test per guard; a node-only test fails if any guard marker lacks a test |
| R-DECL-25 | `DeclaredVerifyFailure`, `VerifyProofLimit`, `VerifyUnsupported` | none (stages 3 and 6) | typecheck |
| R-DECL-26 | `DECLARATION_BOUNDS` (policy) | the bound guards above | the bound tests above |

### Mutation table

Each mutant was applied alone by `/private/tmp/claude-501/-Users-hughpyle-play-gitseq/3a928963-7b06-44e6-b22a-1b24ab3c0e34/scratchpad/mutate.py`, after the implementation was committed (`21260cac`). It edits one call site, runs `npx vitest run --config vitest.config.ts test/declared-acts.test.ts` in `packages/policy` (node), records the failing tests from the JSON reporter, and writes the file's original bytes back; it never runs `git checkout`. `git status --porcelain` was empty afterwards. A `G:` mutant turns the guard's report (`p.add`, `p.keys` or `warnings.push`) into `void`, so the guard still decides but reports nothing; `G:rule-on` makes the `on` predicate accept any string. `B:` mutants are in `binding.ts`, `L:` in `legacy.ts`, `C:` in `codereview.ts`.

**91 mutants, all red.** Every `G:` mutant turned its own named test red. None survived, and none broke the test file's loading.

| # | Mutant | Mutation | Tests turned red |
|---|---|---|---|
| 1 | `G:doc-object` | `p.add` at the guard becomes `void` | G:doc-object refuses a document that is not an object |
| 2 | `G:doc-keys` | `p.keys` at the guard becomes `void` | G:doc-keys refuses an unknown document field |
| 3 | `G:doc-format` | `p.add` at the guard becomes `void` | G:doc-format refuses format v1 with acts |
| 4 | `G:doc-profile` | `p.add` at the guard becomes `void` | G:doc-profile refuses an unknown profile |
| 5 | `G:doc-steps` | `p.add` at the guard becomes `void` | G:doc-steps refuses an unknown steps version |
| 6 | `G:acts-object` | `p.add` at the guard becomes `void` | G:acts-object refuses acts that are not an object |
| 7 | `G:acts-count` | `p.add` at the guard becomes `void` | G:acts-count refuses 65 kinds |
| 8 | `G:rule-on` | the `on` predicate accepts any string | G:rule-on refuses a rule on an undeclared kind |
| 9 | `G:kind-grammar` | `p.add` at the guard becomes `void` | G:kind-grammar refuses a kind with a capital letter |
| 10 | `G:kind-reserved` | `p.add` at the guard becomes `void` | G:kind-reserved refuses a reserved kind; G:kind-reserved refuses the platform kind recover |
| 11 | `G:decl-object` | `p.add` at the guard becomes `void` | G:decl-object refuses a declaration that is not an object |
| 12 | `G:threads-known` | `p.add` at the guard becomes `void` | G:threads-known refuses a misspelt thread kind; G:threads-known refuses a kind that never opened a thread here |
| 13 | `G:handover-reserve` | `p.add` at the guard becomes `void` | G:handover-reserve refuses a hand-over onto a hold without reserveSeconds |
| 14 | `G:decl-keys` | `p.keys` at the guard becomes `void` | G:decl-keys refuses an unknown declaration field |
| 15 | `G:label` | `p.add` at the guard becomes `void` | G:label refuses an empty label |
| 16 | `G:help` | `p.add` at the guard becomes `void` | G:help refuses help over 4,096 bytes |
| 17 | `G:targets-nonempty` | `p.add` at the guard becomes `void` | G:targets-nonempty refuses no targets |
| 18 | `G:target-shape` | `p.add` at the guard becomes `void` | G:target-shape refuses an unknown target shape |
| 19 | `G:target-steps` | `p.add` at the guard becomes `void` | G:target-steps refuses a step on the wrong target; G:target-steps refuses a third step; G:target-steps refuses version then land on a version target |
| 20 | `G:threads-required` | `p.add` at the guard becomes `void` | G:threads-required refuses a thread act without threads |
| 21 | `G:threads-unused` | `p.add` at the guard becomes `void` | G:threads-unused refuses threads on an act with no thread target |
| 22 | `G:threads-list` | `p.add` at the guard becomes `void` | G:threads-list refuses a repeated thread kind |
| 23 | `G:body-object` | `p.add` at the guard becomes `void` | G:body-object refuses a body that is not an object |
| 24 | `G:body-count` | `p.add` at the guard becomes `void` | G:body-count refuses 33 body fields |
| 25 | `G:who-object` | `p.add` at the guard becomes `void` | G:who-object refuses no who |
| 26 | `G:who-keys` | `p.keys` at the guard becomes `void` | G:who-keys refuses an unknown who field |
| 27 | `G:roles-list` | `p.add` at the guard becomes `void` | G:roles-list refuses roles that are not a list |
| 28 | `G:roles-admin` | `p.add` at the guard becomes `void` | G:roles-admin refuses admin listed explicitly |
| 29 | `G:roles-known` | `p.add` at the guard becomes `void` | G:roles-known refuses an unknown role |
| 30 | `G:roles-checker` | `p.add` at the guard becomes `void` | G:roles-checker refuses checker on an act with step version |
| 31 | `G:delegable` | `p.add` at the guard becomes `void` | G:delegable refuses delegable that is not a boolean |
| 32 | `G:hold-required` | `p.add` at the guard becomes `void` | G:hold-required refuses an opening act without a hold |
| 33 | `G:hold-unused` | `p.add` at the guard becomes `void` | G:hold-unused refuses a hold on an act without step open |
| 34 | `G:refusals-object` | `p.add` at the guard becomes `void` | G:refusals-object refuses refusals that are not an object |
| 35 | `G:refusal-code` | `p.add` at the guard becomes `void` | G:refusal-code refuses wording for an unknown refusal code |
| 36 | `G:wording-object` | `p.add` at the guard becomes `void` | G:wording-object refuses wording that is not an object |
| 37 | `G:refusal-keys` | `p.keys` at the guard becomes `void` | G:refusal-keys refuses wording with an unknown field |
| 38 | `G:field-name` | `p.add` at the guard becomes `void` | G:field-name refuses a field name with a capital first letter |
| 39 | `G:field-reserved` | `p.add` at the guard becomes `void` | G:field-reserved refuses a field named like its step's field; G:field-reserved refuses a field named because |
| 40 | `G:field-object` | `p.add` at the guard becomes `void` | G:field-object refuses a field that is not an object |
| 41 | `G:field-type` | `p.add` at the guard becomes `void` | G:field-type refuses an unknown field type |
| 42 | `G:field-keys` | `p.keys` at the guard becomes `void` | G:field-keys refuses a parameter its type does not have |
| 43 | `G:text-max` | `p.add` at the guard becomes `void` | G:text-max refuses text over 16 KiB |
| 44 | `G:globs-max` | `p.add` at the guard becomes `void` | G:globs-max refuses globs over 64 |
| 45 | `G:int-range` | `p.add` at the guard becomes `void` | G:int-range refuses an int with min over max |
| 46 | `G:enum-values` | `p.add` at the guard becomes `void` | G:enum-values refuses a repeated enum value; G:enum-values refuses an enum value that cannot fill a scope |
| 47 | `G:optional-bool` | `p.add` at the guard becomes `void` | G:optional-bool refuses optional that is not a boolean |
| 48 | `G:optional-and-requiredfor` | `p.add` at the guard becomes `void` | G:optional-and-requiredfor refuses both optional and requiredFor |
| 49 | `G:requiredfor-targets` | `p.add` at the guard becomes `void` | G:requiredfor-targets refuses requiredFor naming a target the act lacks |
| 50 | `G:hold-object` | `p.add` at the guard becomes `void` | G:hold-object refuses a hold that is not an object |
| 51 | `G:hold-keys` | `p.keys` at the guard becomes `void` | G:hold-keys refuses an unknown hold field |
| 52 | `G:hold-conflict` | `p.add` at the guard becomes `void` | G:hold-conflict refuses an unknown conflict mode |
| 53 | `G:hold-lease` | `p.add` at the guard becomes `void` | G:hold-lease refuses a lease under 10 seconds; G:hold-lease refuses a lease over 24 hours |
| 54 | `G:hold-reserve` | `p.add` at the guard becomes `void` | G:hold-reserve refuses a reservation over 10 minutes; G:hold-reserve refuses a reservation of 0 seconds |
| 55 | `G:hold-workspace` | `p.add` at the guard becomes `void` | G:hold-workspace refuses workspace that is not a boolean |
| 56 | `G:hold-scope` | `p.add` at the guard becomes `void` | G:hold-scope refuses an empty template; G:hold-scope refuses a scope source naming another body field |
| 57 | `G:template-chars` | `p.add` at the guard becomes `void` | G:template-chars refuses a template glob over 256 characters |
| 58 | `G:slot-field` | `p.add` at the guard becomes `void` | G:slot-field refuses a slot naming a text field; G:slot-field refuses a slot naming an optional field |
| 59 | `G:template-glob` | `p.add` at the guard becomes `void` | G:template-glob refuses a template that is not a glob once filled |
| 60 | `G:wording-length` | `p.add` at the guard becomes `void` | G:wording-length refuses an empty reason; G:wording-length refuses a fix over 512 bytes |
| 61 | `G:wording-slot` | `p.add` at the guard becomes `void` | G:wording-slot refuses a slot that is not a refusal slot |
| 62 | `G:wording-brace` | `p.add` at the guard becomes `void` | G:wording-brace refuses a brace that opens no slot |
| 63 | `G:sound-version` | `p.add` at the guard becomes `void` | G:sound-version refuses reviews with no act that makes versions |
| 64 | `G:sound-handover` | `p.add` at the guard becomes `void` | G:sound-handover refuses a hand-over with no act that can take the thread |
| 65 | `G:warn-unending` | `warnings.push` at the guard becomes `void` | the jam's declarations validate with in-key.json; propose-rules holds end only by expiry; G:warn-unending reports an opening kind no act can end, without refusing |
| 66 | `G:checker-shape` | `p.add` at the guard becomes `void` | G:checker-shape refuses a v1 checker configuration in a v2 document; G:checker-act refuses a checker configuration with no act |
| 67 | `G:checker-declared` | `p.add` at the guard becomes `void` | G:checker-declared refuses a checker naming an undeclared kind |
| 68 | `G:checker-step` | `p.add` at the guard becomes `void` | G:checker-step refuses a checker naming signal; G:checker-step refuses a checker naming review |
| 69 | `G:checker-role` | `p.add` at the guard becomes `void` | G:checker-role refuses a check act checkers may not sign |
| 70 | `G:checker-body` | `p.add` at the guard becomes `void` | G:checker-body refuses a check act with a required body field |
| 71 | `G:checker-object` | `p.add` at the guard becomes `void` | G:checker-object refuses a configuration that is not an object |
| 72 | `G:checker-keys` | `p.keys` at the guard becomes `void` | G:checker-keys refuses an unknown configuration field |
| 73 | `G:checker-format` | `p.add` at the guard becomes `void` | G:checker-shape refuses a v1 checker configuration in a v2 document; G:checker-format refuses artroom-checker-v1 directly |
| 74 | `G:checker-act` | `p.add` at the guard becomes `void` | G:checker-act refuses a checker configuration with no act |
| 75 | `B:label` | the subject includes `label` | the subject resolves every default; label, help, refusal wording and who leave the binding unchanged |
| 76 | `B:who` | the subject includes `who` | the subject resolves every default; label, help, refusal wording and who leave the binding unchanged |
| 77 | `B:kind` | the subject drops the kind's name | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 78 | `B:steps` | the subject ignores the document's steps version | a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 79 | `B:targets` | the subject drops the step lists | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 80 | `B:threads` | the subject drops `threads` | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 81 | `B:body` | the subject drops the body fields | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 82 | `B:hold` | the subject drops the hold | the subject resolves every default; writing a default out leaves the binding unchanged; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 83 | `B:conflict-default` | an absent conflict ignores the policy's lanes | a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 84 | `B:lease-default` | an absent lease resolves to the deployment default | the subject resolves every default |
| 85 | `B:reserve-default` | an absent reservation resolves to 0 | the subject resolves every default |
| 86 | `B:workspace-default` | an absent workspace resolves to true | writing a default out leaves the binding unchanged |
| 87 | `B:optional` | `optional` no longer clears `required` | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 88 | `B:required-for` | `requiredFor` is ignored | the subject resolves every default |
| 89 | `L:data` | one value of the legacy description changes | the legacy vocabulary's digest is the one the contract states |
| 90 | `L:freeze` | the legacy description is not frozen | the legacy vocabulary is frozen, to the leaves |
| 91 | `C:freeze` | the code-review declarations are not frozen | the code-review declarations are frozen, to the leaves |

### Gates

Run under bash at the implementation commit `21260cac`, serially, with exit codes checked. The branch then merged main `a6fcce54` (request `df6ff8d3`: R-MINT-3 amended in place in section 32, which does not touch section 33 or its numbering). The gates were run again at the merge head, which is the head for review; its counts are in the delivery report, since main's merge adds tests to the git and room packages. Main `b44601dd`'s counts were measured in the same worktree before any change.

| Gate | Exit | Result | Main `b44601dd` |
|---|---|---|---|
| `npm ci` (root) | 0 | installed | 0 |
| `npm run typecheck` (root) | 0 | every workspace | 0 |
| `npm test` (root) | 0 | 2,275 passed, 2 skipped | 2,068 passed, 1 skipped |
| `npm run typecheck` in `packages/contract` | 0 | | |
| `npm run typecheck` in `packages/policy` | 0 | src and tests | |
| `npm test` in `packages/policy` | 0 | node 303 passed; workerd 301 passed, 2 skipped | node 199; workerd 198, 1 skipped |
| `git diff --check origin/main` | 0 | clean | |

Per package, root `npm test` (node, then workerd where a package has both): checkers 43; cli 162; client 88 and 2; log 198 and 193; mcp 73 and 5; policy 303 and 301 (+2 skipped); room 237 and 529; ui 141. Every count except policy's equals main's. Policy's difference is exactly the 104 new tests; the extra workerd skip is the node-only guard-coverage test. No existing test was changed.

### Not changed here

The room, log, client, MCP, CLI, checkers and UI packages, and `examples/`, are unchanged: nothing reads the new types or data yet. The version witness type (note 4.3, stage 6) is not defined here; its shape belongs to that stage. `LICENSE`, `NOTICE` and `AGENTS.md` are untouched.

## Mint lane F (request 02836f9a)

Status: DONE, pending checker exact-head review. Gitseq request `02836f9a`, branch `request/fork-token`, cut from main `965c911a`, with main `58a2f0a0` merged in (merge `31ec8a77`; see [The merge with main 58a2f0a0](#the-merge-with-main-58a2f0a0)), then request `df6ff8d3`'s branch at `6e585cf9` (merge `012ea686`) and, once that landed, main `a6fcce54` (merge `f2421024`, no further content). This revision answers the checker's preliminary findings C1 to C4 on `3d1223a1`: see [Review findings C1 to C4](#review-findings-c1-to-c4-on-3d1223a1). The approved mint ownership design ([notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), "Out of scope", review `ad6cc052`) left one token outside every ledger: the 600-second read token that `Pinning.pinObjects` mints on the lane's fork. It had a hidden retry (`withRetry` around a create that may have applied) and a dropped revocation. This lane gives it a ledger owned by the fork's owner, and applies [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-2 to R-MINT-7) to it by analogy. The head for review is the commit that carries this section.

**Scope.** New: `packages/git/src/workspace/fork-tokens.ts` (the ledger), `packages/git/test/fork-tokens.test.ts` (28 Node tests) and `packages/room/test/workerd/fork-token-02836f9a.test.ts` (7 Durable Object tests). Changed: `packages/git/src/workspace/workspaces.ts` (builds and owns the ledger, checks provenance for it, asks it about each token in the fork's sweep, two token indexes), `publisher/client.ts` (`withForkToken` removed; `Pinning` takes the ledger), `mints.ts` (exports `MINT_RETRY`, the retry limits, unchanged; `MINT_ID_WRITE_ATTEMPTS`, and the canonical ledger's failed handoff keeps the known ID, for C2), `docs/protocol.md` (R-MINT-3 amended for C2), `packages/git/test/mints.test.ts` (the canonical test (6) restated, one added), `index.ts` (exports), the Git harness (`measure/harness/worker.ts`), `packages/room/src/artifacts.ts` and `core.ts` (the adapter passes the ledger; a `forkTokens` step and loop kind; `nextAlarm`), the source scan (`test/node/mint-sites-scan.test.ts`), and the two package READMEs. No Room migration. Nothing was deployed, no live Cloudflare call was made, and no credential was created, rotated or used.

### Who owns the fork

A lane fork has no durable store of its own. It is an Artifacts repository, and the only object that creates, provisions, sweeps and records it is the Room, through lane B's `Workspaces` on the Room's SQLite (`artroom_ws`, `artroom_ws_duty`). So `Workspaces` is the fork's lifecycle owner, and the ledger belongs to it: `Workspaces` builds a `ForkTokens` in its constructor and exposes it as `workspaces.forkTokens`. Its tables (`artroom_fork_mint`, `artroom_fork_mint_watch`, `artroom_fork_mint_summary`) sit beside the workspace tables. The canonical `MintLedger`, its tables and its records are not used: a fork token never appears in `room.core.mints.duties()` (R1 checks this).

### What was built

- **Before the create.** `mint(fork, purpose, ttl)` first looks the fork up through its owner, within the bounded wait (30 s, `MINT_WAIT_MS`). The owner checks provenance (`Workspaces.ourFork`): a repository at the fork's name that is not this room's fork, an absent fork, or one still being created is refused, and nothing is sent to it. Then one transaction writes the record as `sent` (fork, purpose `pin-objects:<head>`, read, 600 s, send time) and moves the takeover time 60 s ahead if it is less than 30 s away. Then the wake-up is awaited. If the record or the wake-up cannot be stored, the record is deleted and nothing is sent. After the wake-up, the record is checked to be still `sent`, then the create is sent and waited on for at most 30 s.
- **The answer** is classified once, whenever it arrives. Usable: a token ID and text, read scope, and a readable expiry no later than the answer's arrival plus the lifetime asked plus `MINT_CLOCK_ALLOWANCE_MS` (5 s; R-MINT-3's clock-skew contract, request `df6ff8d3`), for a caller still waiting; the record becomes `held`. A token ID otherwise: `owed`, due at once, with its reported expiry or none. A refusal that changed nothing (`refusedUnchanged`): the record is deleted. Anything else, including a transport failure, `INTERNAL_ERROR`, an answer without an ID and the 30 s wait running out: `unknown`. A late answer is applied to its own record only, by its row ID and expected state, and never reaches a caller. If an answer with a token ID cannot be recorded, the ID is written durably as owed, with at most 3 bounded writes (`MINT_ID_WRITE_ATTEMPTS`), before the token is revoked at once by that ID; an answered revocation ends the record, a failed one leaves it owed with its ID. Only if storage refuses every write does the record keep its earlier state (R-MINT-3 as amended; C2).
- **Retries.** The hidden retry is gone. Only `retriable()` errors (`INTERNAL_ERROR`, `UPSTREAM_UNAVAILABLE`) are retried, with the canonical ledger's limits (5 attempts, from 0.5 s), and each attempt is a new record, sent only after the earlier record holds its outcome (`unknown`). A transport failure or a lost answer is not retried.
- **Release.** `withToken` revokes the token by its ID however the pin ends, waiting at most 30 s. An answer deletes the record. A failure, a timeout or a completion that does not commit makes it `owed`, due in 1 s; a late answer to that revocation changes nothing.
- **Takeover.** The constructor (so each object start, in a founded room at `recover()`, which reaches it through `nextAlarm()`) turns every `sent` record into `unknown` and every `held` record into `owed`, due at once, in one indexed update.
- **The alarm.** `reconcile()` keeps or clears the takeover time, starts a revocation pass (not awaited), and observes at most one fork (awaited, bounded). A pass takes at most 20 owed records due now, earliest due first, then by row ID (index `artroom_fork_mint_state`); one runs at a time; while it waits on an answer, owed records are not eligible before that attempt's timeout. A pass that finds expired records settles only those, with no lookup and no call, and ends. Otherwise each fork in the batch is looked up once, bounded and with provenance; each record's readable expiry is checked again immediately before its revocation; results are written in one transaction. Backoff: 1 s doubling to 5 min, never past a readable expiry. A record with no readable expiry is never settled by time.
- **Watching unknown creates.** Each fork with unknown records has one watch row: its count of unknown records and its observation. An alarm observes at most one fork, the one due earliest (index `artroom_fork_mint_watch_due`): one bounded lookup and listing, `completeInventory`, at most 1,000 records, and a count of live tokens that nobody attributes by ID. A token counts as attributed if a ledger record names it (index `artroom_fork_mint_token`), or if the fork's owner holds it: the lane's lease token (`artroom_ws.token_id`) or a token revocation the workspace owes (`artroom_ws_duty.token_id`). Both are point lookups on two new indexes. Each observation makes one write, to that fork's watch row. The next is due after a wait doubling from 1 min to 6 h; a new unknown record never brings it sooner than 1 min after the last; a fork whose unknown records were all settled by their own late answers is not observed. No record is written, settled or revoked by an observation.
- **`nextDue()`** is the earliest of the owed records' due time, the earliest fork observation, and the takeover time while a record is `sent` or `held`. A time already passed counts as now plus 1 s; a still-future time counts as itself.
- **The fork's sweep** (R-WS-3; plans 001 and 002) asks about each token immediately before its revocation, after every earlier await. It keeps the lease's recorded token and a token the ledger holds for a pin in progress. While any fork token create on that fork is `sent` or `unknown`, it revokes only tokens whose IDs a record names (the ledger's records, or the workspace's owed token duties) and leaves every other active token; no time ends this, only the record's own answer (C1, C3).
- **The Room.** `ArtifactsAdapter` passes a delegate to `workspaces.forkTokens` to `Pinning` (the workspaces are built once the room is founded). The alarm runs the ledger as its own step and loop kind, `forkTokens`: self-timed like `mints`, so a failure of the step takes that kind's backoff, which ends only when the step runs. `nextAlarm()` includes `forkTokens.nextDue()`, after that backoff. The kind is not in `NEEDS_REPOSITORY`: forks are separate repositories, so the ledger runs and is scheduled while the canonical repository is gone, as workspace cleanup is.
- **Safe metadata.** Every stored error is `errorNote(stage, e)`, using the existing stages.
- **The source scan** allows `workspace/fork-tokens.ts` one reach of `createToken`, as `mints.ts`, `workspaces.ts` and `snapshot/repos.ts` have; `publisher/client.ts` now reaches it nowhere, and a reach put back there fails the scan.

### Where the fork ledger differs from section 32, and why

| Rule | Canonical ledger | Fork ledger | Why |
|---|---|---|---|
| R-MINT-1 | Owner: `MintLedger`, the Room's canonical records | Owner: `Workspaces`, the fork's lifecycle owner; its own tables | The request's condition; R-MINT-1 says fork tokens are not canonical mints |
| R-MINT-2 | Lifetime computed after the wake-up, then stored by a second update | Lifetime (fixed, 600 s) recorded with the record before the wake-up; after the wake-up the record is only checked to be still `sent` | There is no `notAfter`, so a slow wake-up cannot carry the lifetime past any bound. One write fewer per mint |
| R-MINT-2 | One repository, looked up before the record | The fork is looked up, with provenance, before the record; every create, revocation and listing goes through the same check | A fork's name can be held by another repository (plan 002); nothing is ever sent to it |
| R-MINT-3 | Scope asked; lifetime bound with `MINT_CLOCK_ALLOWANCE_MS`; `notAfter` with no allowance | Read scope only; the same lifetime bound with the same allowance; no `notAfter` | Pinning asks for one kind of token, and no fork token has a deadline. The fork check follows R-MINT-3's clock-skew contract (C4) |
| R-MINT-4 | `claim()` hands a token to another owner | No handoff: the caller always releases | Pinning uses the token only for the length of one sandbox call |
| R-MINT-5 | Never revokes a token it cannot match by ID; never sweeps the canonical repository | The ledger never revokes a token it cannot match by ID, and neither does the fork's sweep while one of the ledger's creates on that fork is `sent` or `unknown`: R-WS-3's cleanup of unrecorded tokens is suspended on that fork, not inferred around, until the record is settled by its own answer | The fork has a sweep the canonical repository does not (R-WS-3). A create takes no label, and nothing bounds when it applies (R-MINT-6, open points 42 and 43), so no listing, timing or lifetime can tell its token apart |
| R-MINT-5, R-MINT-7 | One shared observation of the canonical repository | One watch row per fork; at most one fork observed per alarm, earliest due first | Each fork is its own repository with its own listing |
| R-MINT-7 | A known ID's keyed record is the ledger row, `job_tokens` or `artroom_land_token` | The ledger row (indexed by token ID); a lease token is keyed by `artroom_ws.token_id`, a workspace's owed revocation by `artroom_ws_duty.token_id` | The two workspace indexes make those point lookups |
| R-MINT-7 | Not scheduled while the canonical repository is gone | Scheduled and run while it is gone | Forks are not the canonical repository |
| Migrations | Lane C's indexes are Room migration 3 | No Room migration. The ledger's tables and indexes, and the two workspace indexes, are made by their owners' constructors (`CREATE … IF NOT EXISTS`), which run at every object start, so a stored room gains them at its first start after this change (F17) | These tables are the Git package's, not the Room schema's, as `artroom_mint` is. No legacy rows exist: the old code kept no record of fork tokens, so nothing needs to be moved |

The exposure bound (R-MINT-6) is the same: an unknown or late-applied fork read token lasts at most its 600 s lifetime from when Artifacts applies it (open point 44). No lifetime changes.

### Choices for the checker

1. **The retry stays, as new records.** The request asked to remove the hidden retry; R-MINT-2 allows a retry as a new request with its own record, and the canonical half of the same pin retries that way. Removing every retry would make a transient `INTERNAL_ERROR` fail the proposal (the design rejected that for canonical sites). Each retry leaves its unknown predecessor kept and watched.
2. **The step runs while the canonical repository is gone** (table above).
3. **The pause covers `sent` creates too**, not only `unknown` ones: a create still out may already have applied, and its token has no recorded ID until the answer comes. This is stricter than the checker's wording, never looser.
4. **The owner's two indexes** are on existing workspace tables, made in the constructor. Building them over a stored room's `artroom_ws_duty` (which keeps settled rows) is a one-time cost at the first start.
5. **A record left `sent` because the host stopped between the record and the send** becomes `unknown` at the next start, though nothing was sent. The ledger cannot tell it from one sent, so it keeps it, as the canonical ledger does.
6. **C2 is applied to the canonical `MintLedger` as well.** R-MINT-3 is the canonical rule, so once it is amended the canonical ledger must keep it: its failed handoff now writes the known ID as owed, with the same bounded writes, before the revocation at once. Its test (6) is restated and a second added.

### Tests: rule map

Node: `packages/git/test/fork-tokens.test.ts`, 34 tests (F1 to F28), against a fork double whose create can apply and then throw, lose its answer, hold its answer, answer late or refuse, and whose revocations can fail or be held; F15 to F18 and F20 go through the real owner, `Workspaces`. Room: `packages/room/test/workerd/fork-token-02836f9a.test.ts`, 8 tests (R1 to R8), real Room objects with Durable Object storage and stored alarms, alarms run only through `runDurableObjectAlarm`, hooks on one object or one world's fake repositories, and in R6 a write spy on that object's SQL only. Without this lane the Node file does not load and every Room test fails (there is no `workspaces.forkTokens`).

| Condition or rule | Tests |
|---|---|
| Recorded durably before its create; a wake-up stored first (R-MINT-2) | F1, F2, F3, F18, R5 |
| Owned by the fork's own ledger, not the canonical one | F15, F16, F17, F20, R1, the source scan |
| No hidden non-idempotent retry; a retry is a new record (R-MINT-2) | F4, F5 (two), F6 |
| Lost answer (R-MINT-3, R-MINT-5) | F4, R1, R6 |
| Late apply (R-MINT-3, R-MINT-5, R-MINT-6) | F7 (late ID, late refusal, late loss; applied after a restart), R4 |
| Failed revoke: owed by ID, bounded and backed-off retry, a late success not taken as success (R-MINT-4) | F9 (three), F12, F22, R2, R7 |
| Restart between any two steps (R-MINT-4, R-MINT-7) | F10 (after the record, after the wake-up, while the answer is out, while held, while owed, during a revocation), F7, F15, F21, R3, R4 |
| Never settled by time or inventory; never revokes an unattributed token (R-MINT-5) | F4, F7, F8, F13, R1, R4 |
| Answers that cannot be used (R-MINT-3) | F8 |
| A failed handoff: the known ID written durably before any revocation, bounded writes (R-MINT-3 as amended; C2) | F21, F23, F25, F27; canonical: `mints.test.ts` (6), two tests |
| Wake-ups, takeover, overdue step (R-MINT-7) | F10, F11, F12, R1, R3, R4, R7 |
| Bounded, indexed, earliest-first work; one write per observation; idle writes nothing (R-MINT-7) | F12, F13, F17, F19, F22, R6 |
| Provenance; the owner's known tokens and sweep | F15, F16, F20 |
| The fork's sweep paused while a create is unsettled; no time resumes it; it resumes after the record's own answer (C1) | F24 |
| The sweep asks again before each revocation (C3) | F26 |
| The clock allowance on the lifetime bound (C4) | F28 (67 ms, 5,000 ms accepted; 5,001 ms owed), R8 (both halves of `pinObjects` 67 ms ahead, propose admitted) |
| Safe metadata at the sinks | F9, R2 |
| Duties pageable, without token text (R-MINT-5) | F14 |

### The merge with main 58a2f0a0

Main `58a2f0a0` (request `8bd623cc`, row-write measurements, after the orphan retirement record `d3f7d3a8`) changed `nextAlarm()` in `packages/room/src/core.ts`: one bounded existence check for pins on the default path, and one delayed-pin due read, passed into `loopPendingKinds`, when `PIN_DELAY_MS` is set. The merge was textually clean (merge `31ec8a77`; `git diff --check origin/main` is clean). In the merged `nextAlarm()`, the fork token ledger is its own term of the same earliest-first minimum, beside the delayed pin, the mint ledger, the error upgrade, the job-token pass and the check jobs.

The composed scheduler is tested in `packages/room/test/workerd/pin-delay.test.ts`, "set, composed with mint lane F (request 02836f9a) …", beside main's lane C composition test. With each ledger's due time set directly: the fork token ledger wins when it is earliest; each of the other five wins when earlier than it; its own `forkTokens` backoff holds it, and only it (the pins', mint ledger's and job-token pass's backoffs do not); and the repository-gone fence (`canonical_gone`) holds the pin, the mint ledger and the job-token pass but not the fork token ledger, whose own backoff still holds it while the repository is gone. So two things hold the fork token ledger's candidate back: its own backoff after a failure of its step, and a room not yet founded (`nextAlarm()` reads no workspaces then; before founding the Room schedules `unfoundedDue()` instead). Mutants K1 to K5 were run again against both Room files, with K6 and K7 added (below).

### Review findings C1 to C4 on 3d1223a1

The checker's preliminary findings on `3d1223a1`, with its controls in `checker-fork-controls.test.ts`. All three controls failed on `3d1223a1` as reported, and pass on the fixed code (run against `9209c8c8`; C1's and C3's interleavings are now F24 and F26, below). Each fix has committed tests and named mutants.

- **C1. The fork's sweep revoked a lost-answer token.** A pin's create whose answer is lost leaves an `unknown` record with no ID; `Workspaces.revoke` then swept the fork and revoked that token, which no record attributes. The guidance was corrected twice (planner assert `66f8b350` and its two corrections; the latest supersedes a request-time fence). A create takes only a scope and a lifetime, an inventory cannot identify it by timing, and nothing bounds when it applies (R-MINT-6), so no window, label or elapsed time can settle the question. The rule now: while any fork token create on a fork is `sent` or `unknown`, the sweep revokes only tokens whose IDs a record names (the fork ledger's records, or the workspace's owed token duties, such as an ended lease's token) and leaves every other active token, for as long as the record stays unsettled. The record settles only by its own create's answer (a late answer, as before) or a documented provider fence; never by time or inventory. **R-WS-3's cleanup of unrecorded tokens is suspended on such a fork, not inferred around.** R-WS-3's purpose, that an ended lease's access ends, still holds: the lease's own token is recorded by ID (`artroom_ws.token_id`, then an owed token duty) and is revoked through the pause. What the pause leaves are tokens no record names: their exposure is bounded only by each token's own lifetime, from when Artifacts applied it (R-MINT-6). When the record is settled, the fork's next sweep (the next lease end or provisioning) revokes the unrecorded tokens still active. F24: the pause, no time-based resume two hours later, the late answer, and the resumed sweep. Mutants N1 (no pause), N1t (a time-based resume), N7 (the pause revokes nothing, not even named tokens).
- **C2. A known ID was lost when its write failed.** One write failure recording `held`, then a failed revocation at once, left the record `sent` and so `unknown` after a restart, with the token live. Now the ID is written durably as owed, with at most 3 bounded writes (`MINT_ID_WRITE_ATTEMPTS`), before any revocation; then the revocation at once; a failure leaves the record owed with its ID for the alarm. R-MINT-3 in `docs/protocol.md` is amended, extending request `df6ff8d3`'s landed text: once an ID is received it is written durably before any revocation is attempted, a failed write is retried with the ID in hand, the retries are bounded, and if storage refuses every one the Room cannot guarantee that the duty survives and the record's earlier state governs; the earlier failed-write clause now applies only before an ID is known. The canonical `MintLedger` follows the same rule (choice 6). F21 now asserts the ID is kept; F23 (the write retried), F25 (the checker's control), F27 (a host stop while the revocation is out); canonical `mints.test.ts` (6) restated and one added. Mutants N4, N5 (fork), M1, M2 (canonical), L27.
- **C3. The sweep revoked a pin's token that became held while it waited.** The sweep took its keep set once, at the listing. It now asks about each token immediately before its revocation, after every earlier await. With C1's pause, the checker's own control no longer reaches its interleaving (the pause leaves its unrecorded write token), so F26 reproduces it with a token the ledger names: the sweep waits on revoking that token, the pin's answer arrives, and the pin's token, now held, is kept. Mutant N2 (the decisions taken once at the listing) survives alone, by causality: an unrecorded token that could become held belongs to a create that was already open at the listing, so the pause already left it; with the pause removed too (N12), F24 and F26 are red. The recheck is kept as the standing rule (cancellation checked after every await, before every send), not as the only guard.
- **C4. The fork check repeated the exact upper bound.** Artifacts stamps expiries up to 67 ms ahead of the Room's clock (request `df6ff8d3`), so the fork half of `pinObjects` refused a valid token. `ForkTokens.classify` now allows `MINT_CLOCK_ALLOWANCE_MS` on the lifetime bound, as R-MINT-3 says; a fork token has no absolute deadline, so there is no `notAfter` to keep. The canonical ledger's allowance and its deadline protection are request `df6ff8d3`'s, merged here. F28 (67 ms and 5,000 ms accepted, 5,001 ms owed and never returned), R8 (a real Room: both halves 67 ms ahead, the propose admitted with its head pinned, neither ledger left with a record). Mutants CK1 (fork allowance dropped), CK2 (canonical allowance dropped), CK3 (allowance applied to the canonical deadline). Request `df6ff8d3`'s own Room control for an expiry a minute past the bound (`live-propose-df6ff8d3.test.ts`) assumed the canonical half was refused; with this lane the fork's read token is minted first, with the same check, so it is that token which is refused and owed in the fork ledger, and the canonical create is never sent. The control is reconciled to that, keeping its meaning (commit `5d9926cf`).

### Mutation table

Each mutant was applied alone by a script (`mutants.py` in the scratch directory) to the committed tree; the named suites were run (N: `fork-tokens.test.ts`; R: the lane's Room file; P: `pin-delay.test.ts`; S: the source scan; M: the canonical `mints.test.ts`), and each file was restored from its committed text. The script stops if the tree is not clean after a mutant. The run recorded here is at `f2421024`; the code and the suites it ran are the same at this revision's head, which changed only request `df6ff8d3`'s Room control, outside those suites: 59 mutants, 58 red. N2 survives alone, as explained under C3; N12 (N2 with the pause also removed) is red. Every test in both new files is red under at least one mutant.

History. A first run at `adceb503` (44 mutants) left L30 alive; F22 was extended for it. After the merge with main `58a2f0a0`, K1 to K5 were run again with P, and K6 and K7 added. For C1 to C4, N1 to N7, M1, M2 and CK1 to CK3 were added. One run during this revision is discarded: its two-edit mutant N12 saved a half-mutated file as the original and left N1 in the worktree, so the mutants after it ran on a wrong tree. The worktree was restored from the commit, the script fixed (each file saved once, before any edit; the run stops on a dirty tree), and every mutant run again; the commit itself was never affected.

| Mutant | File | Mutation | Suites | Red tests |
|---|---|---|---|---|
| L1 | `fork-tokens.ts` | no wake-up stored before the send | N, R | F1, F2, F10, F18, R5 |
| L2 | `fork-tokens.ts` | a failed wake-up still sends | N, R | F2, F18, R5 |
| L3 | `fork-tokens.ts` | the hidden retry back: the create retried under one record | N, R | F5 |
| L4 | `fork-tokens.ts` | any failure retried, not only a transient one | N, R | F4, F13, F14, F19, F20, R1, R6 |
| L5 | `fork-tokens.ts` | an unknown record settled by time (its lifetime) | N, R | F4, F7, R1, R4 |
| L6 | `fork-tokens.ts` | an unknown record settled by a clean inventory | N, R | F4, F7, R1, R4 |
| L7 | `fork-tokens.ts` | the observation revokes tokens no record names (a sweep) | N, R | F7, F8, F10, F20, R4 |
| L8 | `fork-tokens.ts` | a late answer's ID left unknown | N, R | F7, F13, F24 |
| L9 | `fork-tokens.ts` | a late refusal leaves the record unknown | N, R | F7, F13 |
| L10 | `fork-tokens.ts` | a failed revocation dropped (the record deleted) | N, R | F9, F10, F11, F12, F14, F22, F26, R2, R7 |
| L11 | `fork-tokens.ts` | a revocation with no answer in time taken as answered | N, R | F9 |
| L12 | `fork-tokens.ts` | no backoff growth after a failed revocation | N, R | F9 |
| L13 | `fork-tokens.ts` | settlement at an unreadable expiry | N, R | F8, F9 |
| L14 | `fork-tokens.ts` | no takeover at a host's start | N, R | F7, F10, F15, F24, R3, R4 |
| L15 | `fork-tokens.ts` | the takeover time left out of nextDue | N, R | F11 |
| L16 | `fork-tokens.ts` | the takeover time not moved ahead by a live alarm | N, R | F11 |
| L17 | `fork-tokens.ts` | overdue work returned as is (no 1 s step) | N, R | F10, F11, F12, R1, R3, R4, R7 |
| L18 | `fork-tokens.ts` | an overdue step under 1 s | N, R | F10, F11, F12, R1, R3, R4, R7 |
| L19 | `fork-tokens.ts` | a pass ordered by row ID, not due time | N, R | F12 |
| L20 | `fork-tokens.ts` | an unbounded pass (1,000 a pass) | N, R | F12 |
| L21 | `fork-tokens.ts` | the pass awaited by the alarm's work | N, R | F12 |
| L22 | `fork-tokens.ts` | owed records eligible while a pass waits on an answer | N, R | F12 |
| L23 | `fork-tokens.ts` | observations not earliest due first | N, R | F13 |
| L24 | `fork-tokens.ts` | an observation written to each record | N, R | F13 |
| L25 | `fork-tokens.ts` | a new unknown record brings the observation sooner than 1 min after the last | N, R | F13 |
| L26 | `fork-tokens.ts` | a fork with no unknown records still observed | N, R | F13 |
| L27 | `fork-tokens.ts` | a failed handoff: the token not revoked at once | N, R | F21, F23, F25, F27 |
| L28 | `fork-tokens.ts` | no expiry check after the fork lookup, before the revocation | N, R | F22 |
| L29 | `fork-tokens.ts` | no expiry check before each later revocation | N, R | F22 |
| L30 | `fork-tokens.ts` | settlement at expiry looks the fork up first (no settle-only pass) | N, R | F22 |
| L31 | `fork-tokens.ts` | the fork lookup not bounded | N, R | F3 |
| L32 | `fork-tokens.ts` | the create not bounded | N, R | F7, F13 |
| L33 | `fork-tokens.ts` | a failed revocation stores the provider's text | N, R | F9, R2 |
| L34 | `fork-tokens.ts` | a refusal that changed nothing kept as unknown | N, R | F6, F7, F13 |
| O1 | `workspaces.ts` | the owner: provenance not checked before a request to the fork | N, R | F15 |
| O3 | `workspaces.ts` | the owner: its known token lookups dropped | N, R | F20 |
| O4 | `workspaces.ts` | the owner: its token indexes not made | N, R | F17 |
| O5 | `workspaces.ts` | the owner: with no wake-up store, the fork token is still sent | N, R | F18 |
| N1 | `workspaces.ts` | C1: no pause: while a create on the fork is unsettled, the sweep still revokes tokens no record names | N, R | F24 |
| N1t | `fork-tokens.ts` | C1: a time-based resume (the pause ends once the lifetime plus the allowance has passed since the send) | N, R | F24 |
| N7 | `workspaces.ts` | C1: while paused, the sweep revokes nothing, not even tokens a record names | N, R | F26 |
| N2 | `workspaces.ts` | C3: the sweep's keep decisions taken once at the listing, not asked again before each revocation | N, R | **survived** (see C3) |
| N12 | `workspaces.ts` | C3 with the pause also removed: N1 and N2 at once | N, R | F24, F26 |
| N3 | `workspaces.ts` | the sweep does not keep a token the ledger holds for a pin in progress | N, R | F16, F26 |
| N4 | `fork-tokens.ts` | C2 (fork): the known ID not written before the revocation at once | N, R | F21, F23, F25, F27 |
| N5 | `fork-tokens.ts` | C2 (fork): the ID's write not retried (one attempt) | N, R | F23 |
| M1 | `mints.ts` | C2 (canonical): the known ID not written before the revocation at once | M, R | mints (6) |
| M2 | `mints.ts` | C2 (canonical): the ID's write not retried (one attempt) | M, R | mints (6) |
| CK1 | `fork-tokens.ts` | C4: the clock allowance dropped from the fork token's upper bound | N, R | F28, R8 |
| CK2 | `mints.ts` | C4 (canonical half): the clock allowance dropped from the canonical token's upper bound | M, R | R8, mints (4) |
| CK3 | `mints.ts` | C4 (canonical half): the clock allowance applied to the absolute deadline (notAfter) too | M, R | mints (4) |
| C1 | `client.ts` | pinObjects mints the fork token directly, outside the ledger (as before) | S, R | R1, R2, R3, R4, R5, R6, R8, source scan (3) |
| K1 | `core.ts` | the Room: the forkTokens step does nothing | R, P | R1, R2, R3, R4, R6, R7 |
| K2 | `core.ts` | the Room: nextAlarm leaves out the fork ledger | R, P | R1, R7, P (composed with mint lane F) |
| K3 | `core.ts` | the Room: the step ignores its fence | R, P | R7 |
| K4 | `core.ts` | the Room: nextAlarm ignores the fence | R, P | R7, P (composed with mint lane F) |
| K6 | `core.ts` | the Room: the fork ledger's candidate fenced while the canonical repository is gone | R, P | P (composed with mint lane F) |
| K7 | `core.ts` | the Room: the fork ledger's candidate takes another kind's backoff (the mint ledger's) | R, P | R7, P (composed with mint lane F) |
| K5 | `core.ts` | the Room: the fork ledger's kind not self-timed | R, P | R7 |

### Gates

Run serially under bash at `5d9926cf` (the code head of this revision; this head differs from it only in this file), by `gates.sh` in the scratch directory, each exit code recorded. The same gates run again at this head; their exit codes are in the delivery report. Earlier revisions passed the same gates at `873b5044` and `ab936154`.

| Gate | Exit | Tests |
|---|---|---|
| `npm ci` | 0 | |
| `npm run typecheck` (root) | 0 | |
| `npm test` (root) | 0 | every workspace's `test` |
| `npm run typecheck -w @generalbusiness/artroom-git` | 0 | |
| `npm test -w @generalbusiness/artroom-git` (Node) | 0 | 340 passed, 0 failed (the 34 of `fork-tokens.test.ts` and the restated canonical (6) tests among them) |
| `npm run test:workers -w @generalbusiness/artroom-git` | 0 | 11 passed |
| `npm run typecheck -w @generalbusiness/artroom-room` | 0 | |
| `npm run test:node -w @generalbusiness/artroom-room` | 0 | 237 passed (17 files) |
| `npm run test:workerd -w @generalbusiness/artroom-room` | 0 | 540 passed (42 files; the 8 of `fork-token-02836f9a.test.ts`, the composed `pin-delay.test.ts` test and request `df6ff8d3`'s controls among them) |
| `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` | 0 | bundles only; nothing uploaded |
| The Git harness: `tsc` with a scratch tsconfig over `src` and `measure/harness/worker.ts` | 0 | |
| The Git harness: `wrangler deploy --dry-run -c measure/harness/wrangler.jsonc` | 0 | bundles only; nothing uploaded |
| `git diff --check origin/main` | 0 | |

The tree was clean before and after the gates.

### Not changed here

- The fork's sweep rule (R-WS-3, plans 001 and 002), apart from asking before each revocation, keeping held pin tokens, and the pause while a fork token create is unsettled (C1, C3). R-WS-3's text is not amended; the pause is recorded here and in `fork-tokens.ts` and `workspaces.ts`. If the checker wants it in R-WS-3, that is a contract change for its own request.
- The protocol text, apart from R-MINT-3's amendment for C2. Section 32 stays about canonical mints; this section records the analogy. If the checker wants R-MINT-1 to name the fork ledger, that is a contract change for its own request.
- The lease token mint in `workspaces.ts`, and snapshot repository tokens.
- Showing the fork ledger's records to admins: `forkTokens.duties()` pages them, as `mints.duties()` does, for the cleanup projection request (`8d249233`).
