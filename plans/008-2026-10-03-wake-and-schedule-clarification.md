# Wake and schedule: delivery, recovery and recorded outcomes

2026-10-03. Draft 2, proposed for independent design review. Draft 1
received changes review `f965c475dc2ef2999c1794f2d49a523d5cd0fcd3`;
this revision distinguishes non-scoped action requests from informational
notices and preserves their requested outputs and outstanding work.
This dated
clarification answers all six corrections in guarded review
`2acf4f435420e2fc4b94e7ebd8fa0bbccb395631` of the original wake/schedule
note at `337a449daafe1a347cd69fc755b9be1ade7860dc`, primary `c44e96df`.
Planning request `45065116e200c36fa690eced1795c53e2e150598`, promise
`6a209eaa54a0ca445fd8619504e0c5aba26b5193`, tracks this evidence-only
correction. Original request `24711ceb` still owes the reviewed source
note and its repository integration.

The proposals below clarify outcomes. Public field encodings, protocol
amendments and runtime implementation still require their existing
owners' reviewed work. This does not adopt a schema or authorize source
changes. The independently approved [attention runtime handoff](007-2026-10-03-attention-runtime-handoff.md)
is carried forward, without reopening its review or changing its bytes.

## Direction retained

Retain the original pipeline:

```text
matching act or due schedule
  → recorded attention or scoped work
  → content-free wake hint
  → receiver reads and retains input
  → agent submits ordinary admitted acts
  → Room records the actual outcomes
```

The adopted decision `154f25d8` retains the amendment's three parts:
qualified attention closure through `because`, Room-owned schedules,
and wake addresses. It retains 60 wakes per member per hour, 20 per
lane per hour, a 15-minute minimum schedule interval, 20 schedules per
Room, and application-pack prompts in stage 3. Coalescing defaults to
true. All five stages and their order remain:

| Stage | Still-owed outcome |
|---|---|
| 1 | A local watcher, `--exec` and `--once`, plus external-cron documentation |
| 2 | The qualified attention-closure amendment |
| 3 | Room schedules, recorded fired/missed/coalesced outcomes, housekeeping/report examples and application-pack prompts |
| 4 | Wake addresses, authentication, delivery status and budgets |
| 5 | Pi Durable wake integration through the durable receiver |

A smaller demonstration and old effort estimates do not reduce this
scope. Acts work needed for the actual first Jam task stays ahead of
this planning correction. Builder judges first-task readiness; this
clarification adds no Jam gate. Jam and the complete manual can then
proceed together, with later needs and backlog allowed to remain.

## 1. A wake preserves the receiver's progress

Use the receiver's own durable attention checkpoint. A wake cursor, if
included, is an advisory high-water mark only. It must never become an
acknowledged read position. An initial receiver starts with the first
attention page. Attention, conversation and subscription cursors have
different meanings and are not interchangeable.

Carry the approved 007 boundary into every durable hosted receiver:

1. Save the page's items and their dispositions with the appropriate
   page position in one Agent transaction. Serialize ingestion or fence
   it by starting cursor and local selection generation. A late drainer
   cannot regress a position or replace a newer selection.
2. Retain a pending conversation input before submission. Its identity
   includes Room, agent member, task/conversation and attention item.
   Retrying after either submission crash window reuses that identity.
   Keep the source entry and author through storage, submission and
   rendering; another member's text remains attributed data.
3. Establish current principals and owned work configuration on startup
   or resume. On changed or uncertain visibility, run the bounded fresh
   scan from 007, with progress separate from the ordinary cursor.
   Reconsider filter-only skips, deduplicate submitted inputs and expose
   an exhausted scan budget as pending work.
4. An authorized active task's bounded alarm/input loop supplies catch-up
   after a lost wake. Before delayed dispatch, check current obligation,
   task authority, lease and workspace epoch. A paused or attention-waiting
   task stays stopped; a wake cannot grant resume. Browser disconnection
   alone leaves authorized hosted work active.

Input retention or a repeated submission identity proves no command,
external side effect, review or landing completed. The production receiver
must demonstrate both submission crash windows and author provenance at
its actual durable boundary. The caller-driven Pi spike is not that proof.
The [Pi Durable announcement](https://earendil.com/posts/pi-durable/)
describes submission deduplication separately from interrupted tools:
safe calls may rerun, while other interruptions are reported. This note
makes no claim that arbitrary command execution is exactly once.

The local watcher needs the same honest boundary for `--exec`. It must
persist an item disposition and command-start intent before launching a
command, then save its result. After an uncertain launch or lost result,
reconcile a retained execution handle when possible; otherwise expose
the uncertain command and stop automatic repetition. A command explicitly
declared safe to retry may retry. Arbitrary shell text is not safe merely
because the input identity repeats. A durable spool is required for a
watcher claiming interruption recovery; a disposable watcher must state
its weaker recovery limit. `--once` reports a pending or uncertain
remainder when its bounded drain cannot finish.

Workspace saves, signed-act replay and unknown-command settlement retain
their separate boundaries from 005/C1/C3. A completed command is not a
durable workspace checkpoint. Retaining input does not grant fresh tools
after authority is revoked.

## 2. Attention closure has a qualified meaning

Preserve `because` as the link from a response to its trigger. Initial
closure through a citing act is proposed for informational policy/note
notices whose declared meaning is acknowledgment. Only an admitted act
by the addressee, citing that notice, can acknowledge it. The eventual
contract must identify those eligible notice kinds; a citation by another
member or an unsigned model statement is insufficient.

Keep the current authoritative predicates for review, check, generation,
lease and publication obligations. A claim can show that work started;
a note can show receipt or progress. Neither silently satisfies a review,
check or addressed work request. Review/check notices follow the actual
obligation and its current generation. Publication follows the recorded
result and read-back, not a claim that a push succeeded.

A schedule classifies what it asks for when its task definition activates.
An informational notice whose requested outcome is acknowledgment may
use the qualified notice rule. An action request uses the recorded work
lifecycle and requested result whether or not it has a file scope.
Scope determines where work may change files or open a lane; it does not
determine whether work was requested. A task edit that changes that
classification is a new activation, preserving the earlier work owed.

The original daily-housekeeping example is a non-scoped action request:
it asks for findings, notes on the affected lanes and items needing a
person. Retain an addressed work identity linked to that firing and its
requested outputs without requiring a lane. A citing acknowledgment marks
the attention notice received, while that work identity stays outstanding.
A recorded result links the requested notes/items to the firing, or
records that the bounded check found nothing requiring an output. Its
qualified completion and any requester acceptance use N2/D1's reviewed
lifecycle. A model's assertion, claim or unaccepted progress report does
not qualify. Failure, pause, an uncertain tool or missing requested output
leaves the unit visibly outstanding and recoverable.

A weekly report requested to land is likewise incomplete while it is
merely claimed, proposed or reported. Required reviews, landing/publication
and requester acceptance remain distinct. Cancellation or supersession
can end old work without marking it successful. N2 and existing D1 own
the concrete addressed-work contract and recorded-result predicate for
both scoped and non-scoped actions; this note invents no public acceptance
field or a new generic completion act.

The browser shows these outcomes alongside activity, as required by 005.
Even when a notice is acknowledged, it must still show unfinished work
and publication debt. The prepared declared kind and binding determine
an act's meaning. Vocabulary changes must not reinterpret a retained
act or authorize re-signing it under a new meaning.

## 3. A firing belongs to one activated task definition

Proposed initial rules:

- Each schedule activation has a distinct generation. Pin the reviewed
  schedule definition, cron/zone evaluation meaning and resolved task.
  A prompt named from a pack binds to the activated pack revision and
  its resolved arguments/content digest. Activation validates and scans
  the resolved task before it becomes usable. Retain the materialized
  public task or a verifiable immutable reference; if unavailable, expose
  the firing as unresolved instead of loading the latest prompt.
- Editing the schedule or its referenced pack task activates a new
  generation. Removal deactivates the old one. Reusing the human ID or
  reverting bytes still creates a new generation. Already recorded
  firings and their pending effects keep their old meaning. They may be
  explicitly cancelled through the relevant work lifecycle; an edit is
  not retroactive cancellation or authorization.
- The new generation starts at its activation frontier, with no automatic
  replay from before activation. The old generation covers due slots
  through the switch/removal frontier; the new generation covers slots
  strictly after it. This prevents a boundary slot from belonging to two
  generations. Preserve unfinished old evaluation/effects for recovery,
  but create no old-generation slot after its deactivation frontier.
- A slot is an absolute UTC instant obtained from the pinned cron/zone
  meaning. During a repeated local time, both matching UTC instants are
  distinct slots. A nonexistent local time produces no slot. The firing
  records enough meaning to explain this choice. The evaluator and zone
  rules must remain reproducible for an unfinished window; their concrete
  pin/reference format is a contract choice. Validation enforces the
  adopted 15-minute minimum between actual slots.

The original `id@scheduledTime` spelling is a readable shorthand, not
enough to distinguish reused IDs or changed task meaning. The stable
firing identity includes Room, activation generation and its slot/window
identity. Public encoding stays with the schedule amendment owner.

The private due frontier marks the last interval conclusively accounted
for. At an alarm pass, capture an evaluation window `(frontier, cutoff]`
within the activation bounds. A normal on-time slot produces one firing.
If several due slots were missed, preserve the adopted one-event-per-
schedule missed-window behavior: record one summary with the earliest
missed instant, count, covered interval and actual recording time. Produce
one requested task for that summary, subject to coalescing; do not run
one job for every missed slot. No due slot is silently dropped.

Capture and retain the window identity before bounded calculation. If
calculation cannot finish in the pass budget, save its progress and
resume the same window. A later pass must not enlarge it silently.
Clock movement backwards cannot regress the accounted frontier or create
a second firing. Future windows use the same pinned evaluation meaning.
The shared Room alarm includes pending calculation/effect recovery and
retains its existing lease and publication responsibilities.

A completed Room transaction should record the firing and its deterministic
Room-side attention/scoped-work effects together with the settled frontier.
Crash recovery finds that firing rather than recording another. If the
implementation cannot place an effect in that transaction, its existing
operation owner must first retain a keyed completion intent and recover
the same effect; it cannot advance an apparently settled frontier while
forgetting owed effects. Creating an unheld local work item is separate
from a later claim and external fork provisioning. This requires one
recoverable Room boundary, not a second public outbox or a transaction
between Room and Agent.

Public facts are the recorded fired, missed and coalesced outcomes,
their activated definition/task references, timing/window and output
links. Evaluation progress, due frontiers and retry state are private
operational state. A recorded firing means that the request exists,
not that the agent ran or completed it.

## 4. Coalescing names the outstanding unit

Resolve targets against the current roster when a firing is committed,
then retain the concrete addressed identities with that firing. A role
or team name is not continuing permission to retarget old work.

| Form | Unit and proposed behavior |
|---|---|
| Informational bare notice | One outstanding notice unit per activated schedule generation and resolved member. If A acknowledged the prior notice and B did not, the next firing creates A's notice and records B's coalesced link to the prior notice. Each newly resolved member receives its own unit; a removed recipient gets no new one. |
| Non-scoped action request | One outstanding addressed work unit per activated schedule generation and resolved member, linked to its firing and requested result without requiring a lane. A later firing coalesces against that work unit's N2/D1 result/lifecycle, even if its attention notice was acknowledged. Each newly resolved member receives its own work unit; removing a recipient prevents new units but does not silently complete or erase old work. |
| Scoped work | One shared outstanding work unit per activated schedule generation and resolved task/scope, with the original concrete addressees retained. While that work is outstanding, a later firing records a coalesced link to it instead of opening another lane. The skipped event names both the existing work/addressees and the current resolved target set. A target change does not silently reassign or accept old work. N2's explicit reassignment/cancellation is used when needed. |

An old generation's outstanding units remain visible but do not block a
new generation's units: a reviewed task change asks for distinct work.
Removal stops future firings without asserting that old work succeeded.
If all addressees lose authority, expose the outstanding shared work as
blocked so an authorized person can reassign or cancel it.

For informational notices, the qualified acknowledgment predicate above
decides openness. For either kind of action request, the requested-result
and N2/D1 lifecycle decide; claim/report alone does not end it. If A
completed the non-scoped housekeeping result and B only acknowledged its
prompt, the next firing creates A's work and coalesces B's still-owed work.
The notice and work states are shown separately. Accepted completion,
cancellation or supersession can release a work unit, with the latter two
recorded as an unsuccessful terminal outcome. Afterward, a future slot may
create new work. A coalesced summary says which slots and recipient/work
units were skipped and why; a partially coalesced fan-out cannot say that
all targets received new work. Disabling coalescing intentionally allows
overlapping units, while authority and budgets still apply.

## 5. Delivery budgets and wake secrets are private

For the adopted wake limits, propose a rolling 60-minute window measured
in absolute time. One attempted outbound delivery to one member's route
counts as one wake. Every retry counts because it consumes delivery
work. A debounced batch counts once per recipient; two recipients count
as two deliveries. Charge each delivery once to every distinct lane
represented by its batch. Lane-free work charges the member budget only.
The 20/lane/hour limit is shared across recipients and delivery routes.

Reserve the attempted delivery in private durable budget/retry state
before sending. An uncertain send retains its charge; recovery must not
assume it was free. A payload held by budget exhaustion has not been sent
and is not charged until an attempt is reserved. Backwards clock movement
cannot prematurely free a reservation. The exact storage algorithm and
bounded clock handling belong to the existing delivery owner.

When either limit is exhausted, retain the queued input and pending
content-free hint. Show the affected budget and next eligibility through
authorized operational status. Coalesce the admin exhaustion notice per
affected budget key until capacity returns; retries must not create an
alert storm. Any wake for that alert obeys the same budgets. Closing an
alert is not permission to discard pending work or bypass a limit.

Wake limits do not bound independent local watcher command starts or
C3 catch-up pages/tools. Those owners must apply their already required
bounded command/input/tool work, retain unfinished work and expose a
pending remainder. Debounce and rate limits change latency; they do not
erase obligations. Own-author acts do not generate a wake to that same
member, as adopted; scheduled Room requests still use the ordinary
target and budget rules.

The public roster may identify that a wake route is configured, using
a safe non-secret route reference. Actual endpoints, binding resolution,
HMAC secrets, route generations, provisioning/rotation, due/budget/retry
records and delivery diagnostics are private operational data. An HTTPS
URL containing a token is not safe public metadata. A secret must never
enter roster history, schedules, the public log, act receipts or error
diagnostics. Keep private reads subject to current authority.

Provision a secret through an authenticated private control path between
the authorized Room operator/member and receiver. Routing changes require
current authority and a new route/secret generation; an untrusted hint
cannot change a route. Rotate or retire the old generation immediately
on replacement, removal or revoked routing authority, cancelling old
dispatch retries. Already delivered hints do not authorize tools. A new
route can later catch up from the durable queue. HMAC verification and
receiver rate limits reject invalid or replayed traffic cheaply; the
wire authentication/freshness format remains for contract review.

Apply R-SEC to inline schedule text and the materialized pack prompt and
arguments at activation and before public materialization. Pack changes
require new validation and task activation; a retry uses the retained
old task meaning. Preserve who authored that content and which reviewed
pack supplied it. Neither HMAC authentication, an admin-approved prompt
nor text attributed to another member grants agent admission authority.
Model/tool credentials stay outside public prompts and task history.
N7 separately owns human notification consent, disclosure and delivery.

## 6. The watcher is planned, not shipped

The original historical `8189d66` facts do not establish a CLI watcher.
The command map inspected at main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`
contains `attention` and ordinary lane/agent commands, but no `watch`,
`--once` or `--exec`. Subscribe and attention APIs are its foundation.
Stage 1 still owes the command, its recovery behavior and documentation.

External cron can already start an agent or a read adapter using those
APIs without a Room amendment. Examples using `artroom watch` must be
marked as future stage-1 examples until the command is delivered. Keep
the local watcher, hosted wake address and Pi receiver routes: none
replaces the others. Full schedules/HMACs are not prerequisites for C3's
own bounded active alarm/input loop unless its chosen mechanism needs
them. Harness examples need the full manual's actual cold-run evidence;
the historical example spellings are not verification of current CLIs.

Output remains as planned: lane findings and their reasons in recorded
notes; retained reports as files reviewed and landed through a lane;
new addressed work through D1/N2; publication followed separately.
Tools that send output outside the Room need their own task authorization
and uncertain-effect recovery. Recording that a send was attempted is
not evidence that it was delivered.

## Owners, dependencies and unresolved choices

| Work or choice | Existing owner and required next evidence |
|---|---|
| Source-note correction and integration | Original `24711ceb`/`19a020af`; this dated evidence is reviewed first, then the existing source-integration path carries it. Original completion is not claimed here. |
| Public schedule/wake identity, eligible notice kinds, authentication/freshness and safe route references | Existing wake/schedule amendment, reconciled with C1 `b538c5ea` and declared acts. Exact public encoding remains open. |
| Atomic or keyed Room firing/effect/frontier recovery; reproducible cron/zone meaning | Schedule stage 3 owner; a bounded design must name its actual storage and evaluator boundary before implementation review. |
| Durable receiver and alarm/input budget | C3 `13dfc613`, using approved 007; prove real storage/submission recovery and current authority, not a mock wake. |
| Scoped and non-scoped action work, accepted result/reassignment/cancellation | Existing D1 and N2 `9c43c173`, with the schedule owner; preserve their separately reviewed lifecycle and authority. Scope is optional and an acknowledgment does not replace an action result. |
| Watcher and harness-specific instructions | Existing stage 1 CLI/docs owners and complete manual N6 `db2fd146`; distinguish real command support from examples. |
| Private route/secret control and raw read authority | C1 and stage 4 delivery owner; access follows current member/device authority, not possession of a route URL. |
| Notifications to an absent person | N7 `64e9d131`; agent wake configuration supplies no human delivery consent. |

The proposed UTC-slot, activation, coalescing and budget semantics above
need independent design approval and adoption. The exact schema and
provider mechanisms remain open. This is bounded planning work within
existing scope, not new implementation requests or a requirement to
complete schedules before starting Jam.

## Acceptance scenarios for the eventual implementation

| Scenario | Useful invariant and required outcome |
|---|---|
| Lost/duplicate hints, both submission crash windows, late drainer and changed principals/filter | The real receiver preserves its own checkpoint, one retained input identity and original author. Approved 007's bounded scans and fences recover pending input; no effect-completion claim follows. |
| Arbitrary watcher command interrupted around launch/result | A saved start intent and actual execution/result boundary expose uncertainty. An unclassified command is not automatically launched again; safe retry remains possible. |
| Claim/note cites a review, check, publication or action request | Acknowledgment/progress stays separate from qualified Room outcomes and requester acceptance. A report file reaches normal review, landing and publication. |
| Schedule activation, edit, removal and reused ID during a pending window | Old work retains its task meaning and effects; generation/frontiers prevent duplicated or retroactively changed firings. Pending evaluation resumes without silently changing the window. |
| Restart after firing before attention/work/frontier completion | The same recorded firing and keyed effects settle. No duplicate task or forgotten due window results. Lease/publication alarms remain serviced. |
| Repeated/missing local time and a long missed interval | UTC slots follow the pinned meaning. A bounded calculation resumes and records one accurate missed summary/task, with earliest time, count and covered interval. |
| A answered, B did not; target membership changes; shared scoped work stays open | Classified per-member notice/action fan-out and shared-work coalescing produce accurate output links. New membership does not silently reassign old work. Cancellation/supersession is not success. |
| Daily housekeeping has no scope: A completes its recorded findings/output result, B only acknowledges the prompt | A's next work unit is created; B's still-outstanding work is coalesced and visible despite notice acknowledgment. The result links required lane notes/person items, or a qualified no-findings outcome, to its firing. Restart, failure or pause does not erase owed output; no lane or invented public acceptance field is required. |
| Failed/retried multi-lane fan-out and exhaustion alert | Member/lane attempt accounting survives an uncertain send, limits stay at adopted values, alerts coalesce, and pending hints/input remain visible and recoverable. |
| Route/secret rotation, revoked authority, delayed hint and changed pack prompt | Old dispatch generation is retired; hints grant no tools. Public history/diagnostics contain no secret. Old firing uses its pinned scanned task with author provenance. |

Validate the eventual implementation with focused witnesses at these
durability, authority and effect boundaries. Reuse approved 007 evidence
where unchanged. This planning correction needs no runtime suite,
install, repeated root gate or per-field mutation inventory.

## Evidence used for this draft

Read-only evidence: all 14,179 bytes of the source note at `337a449d`
(SHA256 `6754f5d87b280441adfcee0f7874ae97a79af6005cd8f987a3d5289def764598`),
full guarded review `2acf4f43` and its accepted delivery `24a58dd6`, the
adopted decision `154f25d8`, approved private handoff `34c5274b`/007,
and main `e6e67828` attention read and CLI command-map source. Draft 2
also responds to the complete changes review `f965c475` and the original
non-scoped housekeeping task in that source note. Attention
reads use exclusive queue positions and current principals; review/check
openness uses actual obligations and generation. These are source facts,
not a runtime failure reproduction. The linked Pi announcement was read
for its submission/tool distinction. No live wake, schedule, external
command, credential, provider operation or application test was run.
