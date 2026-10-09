# Agents that count: contract and feasibility draft

2026-10-09, America/New_York. Revision 3, incorporating planner seq4's native Join-order/member steering and root's static consistency corrections. Planner-owned planning request `b855290c83c525d16b12ba7555df7c6b6fce0cf1`, builder promise `66c8baf9530fec97ef76d798b6b3d809487c6815`; preserves the full delivery request `4073e7561b47b3b13aaceb616d9fc3d67478af5e`. **DRAFT for independent owner decision. No definition pin, validator success, deployment, usable voice set, audio result or hosted acceptance is asserted.**

Recommendation: a separate small counting example using the existing scope SQLite/DO journal, independent enrolled voice-client keys, authenticated snapshots/head invalidations and browser TTS. The scope owns the roster, turn selection and count transition. No Git push per number, Terse runtime, external counting coordinator, LLM arithmetic or app-specific Core branch. Today can settle the contract and exact generic gaps. Saturday's hosted scene is conditional on those gaps being reviewed and implemented, and actual voice availability and playback checks.

## Reference inspected, without media

All five requested source files were read at [TerseAI/talkingAgent `0cdf280fbf030808862c2a39606e4aaa8773d414`](https://github.com/TerseAI/talkingAgent/tree/0cdf280fbf030808862c2a39606e4aaa8773d414). Exact bytes fetched on October 9 are retained in `/tmp/artroom-counting-reference-0cdf280f/`; hashes are below. No private video, audio, microphone or playback was opened.

- [PRODUCT.md](https://github.com/TerseAI/talkingAgent/blob/0cdf280fbf030808862c2a39606e4aaa8773d414/PRODUCT.md): independent browser agents, shared actor, model start/pause decisions, completion after playback and private server credentials.
- [counting-room.ts](https://github.com/TerseAI/talkingAgent/blob/0cdf280fbf030808862c2a39606e4aaa8773d414/src/counting-room.ts): persists count/running, deduplicates and sorts connected IDs, selects by count modulo roster size, broadcasts and handles departure. Its `increment()` checks running but not a designated actor, turn identity or reported number. Do not import this as our invariant implementation.
- [counting-turns.ts](https://github.com/TerseAI/talkingAgent/blob/0cdf280fbf030808862c2a39606e4aaa8773d414/src/counting-turns.ts): correlates response metadata/ID, waits for stopped output, mutes other microphones and pauses for human speech. Its local number-based correlation is weaker than the reset/cancel fences required below.
- [relay](https://github.com/TerseAI/talkingAgent/blob/0cdf280fbf030808862c2a39606e4aaa8773d414/server/counting-socket-relay.mjs) and [protocol](https://github.com/TerseAI/talkingAgent/blob/0cdf280fbf030808862c2a39606e4aaa8773d414/shared/counting-protocol.mjs): bounded socket messages, origin/participant checks, state handoff and a target of 100. Supplied participant IDs do not replace Artroom member/key authority.

Keep the natural scene: three identifiable voices, counting, a fourth joining, participants leaving, pause/resume and a short reveal of definition plus number/speaker record. The meme is context; footage reuse is not required or authorized here. No visible wrong-number, out-of-turn or manual-refresh exercise.

## Nouns, identities and bounds

| Noun | Recorded meaning |
|---|---|
| Counting board | One live item, state `paused`, `running` or `finished`; starts paused with last number 0 |
| Participant | One joined item with its authenticated full native MemberRef in party `agent`; each demo member has its own enrolled key and voice client, while optional display/voice labels are presentation |
| Eligible roster | At most 8 joined participants, distinct MemberRefs, sorted by native Join-opening item IDs; the native joined-item set owns eligibility |
| Generation | Monotone reset identity, initially 0; Reset increments it, never reuses an earlier generation |
| Turn | Tuple `(full counting ScopeRef, generation, turnSerial)`; every issued turn has a higher serial within its generation; paused/finished has no current turn |
| Turn basis | Exact native-order list of `{id, member}` rows copied when that turn is issued; later Join cannot retarget it |
| Expected number | `lastNumber + 1`, bounded by target; only Spoken changes lastNumber during a generation |
| Speaker | The basis row at index `(expectedNumber - 1) % basis.length`; its MemberRef is a board party |
| Completion | Authenticated playback-completion report naming turn and number; one accepted entry records the member and signed intent's actual key |
| Target | Immutable run setting, 1–100; the reference scene uses 100 |

Proposed board has 7 value slots: target, generation, serial, lastNumber, number, basis and until. Parties are controller, speaker and lastSpeaker; optional reference `lastSpokenAt` names the last completion entry. Participant items own the roster, so no redundant whole-roster slot or client key echo is needed. Empty speaker means no issued turn. Membership/creation references remain in verified genesis, not a client-editable replacement. Serial/generation maximum is 1,000,000; exhausting it refuses rather than wraps. Basis is optional and cleared when paused; a required list may not be empty in folded state.

A completion entry includes the original signed Spoken fields, authority and derived last-number/speaker values. Earlier completions remain in history after Reset. The small stage may display a bounded recent sequence; full replay coverage is reported separately. Target 100 does not waive scope entry/storage capacity: preflight adequate current bounds and refuse before admitted work cannot settle. No infinite count/archive promise.

## Verbs and state transitions

All mutating requests bind the full scope incarnation, board revision and immutable fields before signing. Native grants are scoped to the existing membership: `counting.join`, `counting.leave`, `counting.spoken`, `counting.control`. An operator grants these deliberately with existing membership `set-actions`; founding or a voice connection grants none implicitly.

| Act | Guard and atomic recorded result |
|---|---|
| Establish | Authorized native creation pins the definition and membership; creates paused board, target and controller; empty roster, zero count/generation/serial |
| Join | Native scope checks authenticated self, no already-joined row for that MemberRef and roster capacity; it opens the row in native order. Voice arming is a client precondition, not a scope-verified fact or declared guard. While running, current basis/speaker/turn stay unchanged. A paused board remains paused until Start. |
| Leave | Authenticated self removes its exact participant row, including a controller who has joined as a participant. A non-current departure preserves current turn. Current-speaker departure cancels that exact turn and increments serial; if remaining roster is nonempty, scope issues a replacement for **the same next number**, using the reduced roster. If empty, it pauses and clears current speaker. No count increment. |
| Start | Authorized controller; paused, lastNumber below target and nonempty native joined roster. Issues a fresh turn with serial increment, exact basis, next number and selected MemberRef; starts running. Independent enrolled keys remain the native authentication boundary, not a new selected-key projection. |
| Pause | Authorized controller; cancels current identity, increments serial, clears active turn and pauses without changing count. Local adapters cancel audio. It does not retain an old utterance to finish after Resume. |
| Reset | Authorized controller; cancels current turn, increments generation, resets serial/lastNumber and clears completion/speaker values; remains paused. Retains eligible roster and prior journal history. |
| Spoken | Native grant authenticates the actual key and designated member; running, exact generation/serial, still joined, exact current N, N=lastNumber+1, N<=target, expected board revision. Scope independently verifies proposed successor values/basis against native state, then records N/speaker once and applies the successor in the same transaction, or finishes at target. |
| CancelTurn | Authorized controller names the exact current turn/participant, with bounded reason `disconnect` or `media-error`; removes that current speaker's eligibility, cancels without increment and issues same-N replacement, or pauses. It cannot remove an unrelated/non-current participant; the controller's own participant departure uses self Leave. For abrupt disconnect when the client cannot sign Leave, never forge that client's act. |
| TurnExpired | Scope timed rule on a fixed proposed 15-second turn deadline clears exact current turn and pauses without increment. It need not increment serial; the next Start must issue serial+1. It is a safety stop, not proof of audio failure or auto-completion. |

Explicit UI Disconnect signs Leave and cancels local audio before closing the connection; continue only after the recorded state is known. An abrupt network loss is not silently a durable Leave. The controller can CancelTurn; expiry prevents indefinite running with no report. Connection presence may help show the problem, but cannot choose speakers or remove durable eligibility outside the definition.

Join's “future turns” rule is precise: the currently issued tuple/basis remains valid; selection after its completion uses the new roster. A departing non-speaker can remain in the historical basis, while the designated current speaker must remain eligible. A replacement gets a different serial even though N is unchanged. Reset to N=1 is safe because generation differs. Leave versus Spoken is resolved by scope order: completion first legitimately advances; Leave first makes the old callback stale. Neither audio timing nor an HTTP arrival time supplies another ordering.

## Invariants the shared definition owns

1. Within a generation, recorded completions are exactly 1..lastNumber with no gaps or duplicates; each has one member/key and exact turn.
2. At most one issued turn exists. Running implies an eligible designated speaker and nonempty basis; paused/finished has no active speaker.
3. Speaker selection is a pure function of the retained basis and N. Neither the browser nor a relay may supply an unchecked successor or override.
4. Join never changes an issued turn; cancellation changes identity before replacement. Reset makes every prior callback ineligible.
5. Spoken is authenticated to the designated MemberRef, exact and once-only at the journal boundary. The signed entry retains the actual enrolled key. A second freshly signed callback for the old turn fails the guards; an exact original request may settle to the first receipt. Key rotation for the same member follows native membership authority, not a fabricated app device identifier.
6. Derive the successor only after validating completion, in the same local transaction. No observer publishes “completed” from a mere playback-end event or optimistic counter.
7. Restart preserves board/generation/turn/roster/count. It does not prove or replay an audible side effect. Unknown acknowledgment retains the exact request and blocks fresh submission for that turn.
8. A session permits reads; it signs no act. Audio completion establishes the client's report, not proof every listener heard it, and gives no exactly-once audible guarantee.

## Declaration draft using current forms

Planner seq4 removes the speculative sorting/key/assignment extensions. **Native Join order is the sorted order**: participant IDs are opening entry positions; `sameSet.ordered` checks strictly increasing matched IDs. Each basis row's MemberRef is matched to the participant's actual `agent` party. Distinct authenticated member identities, each with independent enrolled keys, satisfy the required voice-agent identities without a new device-key operand.

Clients may propose successor fields, as any signed intent supplies fields. They are not trusted computations: the shared declaration independently verifies complete ordered basis, designated signer, exact number/serial/generation and selected participant using native guards and pure boolean arithmetic. Only the scope applies effects; supplying another candidate fails. This eliminates a computed-value extension as well as SORT and actor projection. The member/key authentication is supplied by native authority; the signed completion retains the exact key.

The following is a closed current-form declaration draft, with local helpers expanding to existing `DeclaredDefinition` fields. **It has not been executed, typechecked or validated; no digest/passing pin is claimed.** Its operational establishment still requires the reviewed generic factory. This is a concrete candidate for the next authorized pure validation, not an invented new form.

```ts
import type { ActType, DeclaredDefinition, EffectForm, Guard, Subject } from
  "@generalbusiness/artroom-contract";
const integer = (min:number,max:number) => ({type:"int",min,max} as const);
const field = (type:any, required=true) => ({...type,required});
const value = (of:any, required=false, defaultValue?:any) =>
  ({fixed:false,required,of,...(defaultValue===undefined?{}:{default:defaultValue})});
const party = (required=false,fixed=false) => ({required,fixed,list:false,author:false});
const id = {type:"item",of:"participant"} as const;
const basis = {type:"list",max:8,of:{type:"record",of:{
  id:field(id), member:field({type:"member"})}}} as const;
const range = (except:Subject[]=[]) => ({type:"participant",states:["joined"],except});
const roster = (except:Subject[]=[]):Guard => ({sameSet:{
  list:{field:"basis"},as:"p",key:{element:"p.id"},items:range(except),
  match:[{equals:{a:{slot:"agent"},b:{element:"p.member"}}}],ordered:true}});
const rule = (name:string):Guard => ({rule:name});
const controller:Guard = {signer:["controller"]};
const boardController:Guard = {of:"also.board",signer:["controller"]};
const current:Guard = {equals:{a:{slot:"agent"},b:{slot:"speaker",of:"also.board"}}};
const leftEmpty:Guard = {count:{...range(["on"]),max:0}};
const remaining:Guard = {count:{...range(["on"]),min:1}};
const done:Guard = {equals:{a:{field:"n"},b:{slot:"target"}}};
const more:Guard = {differs:{a:{field:"n"},b:{slot:"target"}}};
const base = (step:ActType["step"],on:string,grant:string):ActType => ({
  step,on,grant,also:{},fields:{},guards:[],effects:[],sends:[],attention:[]});
const clear = (of?:Subject, when:Guard[]=[]):EffectForm[] => [
  {party:{slot:"speaker",from:null},...(of?{of}:{}),if:when},
  ...["number","basis","until"].map(slot =>
    ({value:{slot,from:null},...(of?{of}:{}),if:when} as EffectForm))];
const issue = (numberField:string,when:Guard[]=[]):EffectForm[] => [
  {party:{slot:"speaker",from:{slot:"agent",of:"also.next"}},if:when},
  {value:{slot:"basis",from:{field:"basis"}},if:when},
  {value:{slot:"number",from:{field:numberField}},if:when},
  {value:{slot:"until",from:{time:{plusSeconds:15}}},if:when}];
const leaveFields = {generation:field(integer(0,1000000)), serial:field(integer(0,1000000)),
  nextSerial:field(integer(1,1000000)), basis:field(basis), next:field(id,false)};
const leaveEffects:EffectForm[] = [
  {state:"left"},
  {of:"also.board",value:{slot:"serial",from:{field:"nextSerial"}},if:[current]},
  {of:"also.board",party:{slot:"speaker",from:{slot:"agent",of:"also.next"}},if:[current,remaining]},
  {of:"also.board",value:{slot:"basis",from:{field:"basis"}},if:[current,remaining]},
  {of:"also.board",value:{slot:"until",from:{time:{plusSeconds:15}}},if:[current,remaining]},
  {of:"also.board",state:"paused",if:[current,leftEmpty]},
  ...clear("also.board",[current,leftEmpty])];
const leave = (grant:string,guards:Guard[]):ActType => ({...base("transition","participant",grant),
  also:{board:{item:"board",one:true},next:{item:"participant",by:"next"}},
  fields:leaveFields, guards:[{state:["joined"]},...guards,roster(["on"]),rule("leave-plan")],
  effects:leaveEffects});
export const counting:DeclaredDefinition = {
  format:"artroom-definition-1", name:"counting",profile:{name:"restricted",version:1},
  capabilities:[],genesis:"establish",
  items:{
    board:{many:false,max:1,states:{paused:{final:false},running:{final:false},finished:{final:false}},
      initial:"paused",parties:{controller:party(true,true),speaker:party(),lastSpeaker:party()},
      refs:{lastSpokenAt:{fixed:false,required:false,to:{type:"fact",under:"counting",kind:["spoken"]}}},
      values:{target:{fixed:true,required:true,of:integer(1,100)},
        generation:value(integer(0,1000000),true,0),serial:value(integer(0,1000000),true,0),
        lastNumber:value(integer(0,100),true,0),number:value(integer(1,100)),
        basis:value(basis),until:value({type:"time"})}},
    participant:{many:true,max:8,states:{joined:{final:false},left:{final:true}},initial:"joined",
      parties:{agent:party(true,true)},refs:{},values:{}}
  },
  acts:{
    establish:{...base("open","board","counting.establish"),
      fields:{opener:field({type:"member"}),target:field(integer(1,100))},
      effects:[{party:{slot:"controller",from:{field:"opener"}}},
        {value:{slot:"target",from:{field:"target"}}}]},
    join:{...base("open","participant","counting.join"),
      guards:[{count:{...range(),max:7}},
        {none:{...range(),where:[{equals:{a:{slot:"agent"},b:{signer:true}}}]}}],
      effects:[{party:{slot:"agent",from:{signer:true}}}]},
    leave:leave("counting.leave",[{signer:["agent"]}]),
    "cancel-turn":{...leave("counting.control",[boardController,current,{of:"also.board",state:["running"]}]),
      fields:{...leaveFields,reason:field({type:"enum",of:["disconnect","media-error"]})}},
    start:{...base("transition","board","counting.control"),
      also:{next:{item:"participant",by:"next"}},
      fields:{n:field(integer(1,100)),nextSerial:field(integer(1,1000000)),basis:field(basis),next:field(id)},
      guards:[{state:["paused"]},controller,{of:"also.next",state:["joined"]},roster(),rule("start-plan")],
      effects:[{state:"running"},{value:{slot:"serial",from:{field:"nextSerial"}}},...issue("n")]},
    pause:{...base("transition","board","counting.control"),fields:{nextSerial:field(integer(1,1000000))},
      guards:[{state:["running"]},controller,rule("serial-plan")],
      effects:[{state:"paused"},{value:{slot:"serial",from:{field:"nextSerial"}}},...clear()]},
    reset:{...base("transition","board","counting.control"),fields:{generation:field(integer(1,1000000))},
      guards:[controller,rule("reset-plan")],effects:[{state:"paused"},
        {value:{slot:"generation",from:{field:"generation"}}},{value:{slot:"serial",from:{const:0}}},
        {value:{slot:"lastNumber",from:{const:0}}},{party:{slot:"lastSpeaker",from:null}},
        {ref:{slot:"lastSpokenAt",from:null}},...clear()]},
    spoken:{...base("transition","board","counting.spoken"),also:{next:{item:"participant",by:"next"}},
      fields:{generation:field(integer(0,1000000)),serial:field(integer(1,1000000)),n:field(integer(1,100)),
        nextN:field(integer(1,100)),nextSerial:field(integer(1,1000000)),basis:field(basis),next:field(id)},
      guards:[{state:["running"]},{signer:["speaker"]},
        {some:{...range(),where:[{equals:{a:{slot:"agent"},b:{signer:true}}}]}},
        {of:"also.next",state:["joined"]},roster(),rule("spoken-plan")],
      effects:[{value:{slot:"lastNumber",from:{field:"n"}}},
        {party:{slot:"lastSpeaker",from:{slot:"speaker"}}},{ref:{slot:"lastSpokenAt",from:"self"}},
        {value:{slot:"serial",from:{field:"nextSerial"}}},{state:"finished",if:[done]},
        ...issue("nextN",[more]),...clear(undefined,[done])]}
  },
  receives:{},
  timed:{"turn-expired":{on:"board",states:["running"],deadline:"until",
    effects:[{state:"paused"},...clear()],attention:[]}},
  rules:{
    "start-plan":'($v := subjects.on.values; $b := fields.basis; $c := $count($b); $c > 0 and fields.n = $v.lastNumber + 1 and fields.n <= $v.target and fields.nextSerial = $v.serial + 1 and fields.next = $b[(fields.n - 1) % $c].id)',
    "spoken-plan":'($v := subjects.on.values; $b := fields.basis; $c := $count($b); $c > 0 and fields.generation = $v.generation and fields.serial = $v.serial and fields.n = $v.number and fields.n = $v.lastNumber + 1 and fields.n <= $v.target and fields.nextSerial = $v.serial + 1 and fields.nextN = (fields.n = $v.target ? $v.target : fields.n + 1) and fields.next = $b[(fields.nextN - 1) % $c].id)',
    "leave-plan":'($v := $lookup(subjects,"also.board").values; $b := fields.basis; $c := $count($b); fields.generation = $v.generation and fields.serial = $v.serial and fields.nextSerial = $v.serial + 1 and ($c = 0 ? $not($exists(fields.next)) : fields.next = $b[$v.lastNumber % $c].id))',
    "serial-plan":'fields.nextSerial = subjects.on.values.serial + 1',
    "reset-plan":'fields.generation = subjects.on.values.generation + 1'
  }
};
```

Static source correspondence: complete-set/order/member checks use `derive/lists.ts:152–164`; member authority uses native signer party guards; arithmetic and conditional rule expressions use current restricted@1 operators/functions. Existing effects assign only proven signed fields, native party slots, constants and commit-time-plus-15. The deadline clears turn and Start later advances serial. No lambda, sort, app callback, arbitrary compute effect, outside capability or new value API is introduced. The helper `any` annotations make this a readable design draft, not a claimed typecheck. Before pinning, exact validator/profile/typed bounds and reference compatibility must be checked under the authorized narrow validation slice.

A Leave of a non-speaker has no board effects; its exact roster proposal still verifies against all remaining native joined items. It validates nextSerial=board.serial+1 without applying that proposed serial to the board; the original current turn stays unchanged. A current Leave keeps board.number unchanged, while selection uses lastNumber modulo remaining count. CancelTurn is controller-authorized and current-only, so it cannot remove an unrelated member under a stale speaker claim. Reset need not retire the board; it preserves journal history. The actual completed signed intent includes key, generation, serial and N even though lastSpokenAt is folded to a local reference.

Empty current-speaker departure is supported by the inspected field semantics: `readFields` in `derive/fields.ts:73–84` requires field presence, and `isValue` in `derive/values.ts:52` admits a list of length zero when within its maximum. `sameSet` in `derive/lists.ts:152–164` then passes only when the complete matching remaining item set is also empty. The Leave rule requires `next` absent in that case. Effects clear the optional board basis; they do not write an empty required slot. This is static source correspondence, not a validator or native test result. At target, Spoken still verifies a complete nonempty basis, joined `next` and nextSerial+1 even though it finishes and clears active values instead of issuing that successor. Current speaker eligibility guarantees a nonempty roster at that judgment; no terminal shortcut weakens its validation.

Only demonstrated remaining generic gaps are **authorized establishment** and **client watch lifecycle**. No SORT/device projection/computed assignment extension is required by this candidate. The source plan must stay that small unless pure validation reveals a specific missing supported expression or form.

The existing shared-language writer's proposed generic `establish-application` directory act is the matching establishment seam, not a second counting-specific factory. Its native authority defaults to an explicitly granted admin action; any delegation follows the existing exact authority contract, not a caller boolean. Proposed inputs are an active immutable definition digest and bounded genesis values; canonical definition/named closure travels through the existing retained-value path. The factory validates the actual genesis schema, supplies trusted `opener` from its authenticated signer and the full recorded membership in the creation body, rejects caller replacement of those reserved bindings, and creates a declared child with native seed/cause/ordinal. It must record the exact resulting scope/reference and original creation duty. No caller-chosen kind, arbitrary membership, profile downgrade or NoOutside/import flag is permitted. Existing issue/PR creation cannot be called generic import just because its child definition is data. This source contract is proposed under the existing owner, not available today.

## Existing establishment, authority, SDK and watch path

Baseline inspected: main `9d7e4c2777ea8d35441b4a9d79b407cd701065fa`. No pending source candidate's gate or release is inherited.

| Boundary | What exists / exact gap and owner |
|---|---|
| Journal/fold | `scope/turn.ts`, `sqlite.ts`, `derive`: local atomic seal/fold/retained inputs. Use this first. DO accepted receipt is journal commitment; no Artifacts/Git barrier per count. Durability/volatile design `578edf65` and `8a13f7b8` remains planner-owned. |
| Establishment | `core.foundedKind` permits register or directory founding. A directly founded custom definition has no verified membership creation context. Directory `open-issue/open-pr` can create activated declared lanes with native membership, but its field/factory contract is code-work-specific. No generic application import/setup journey is established by that alone. Planner/source owner must choose the narrow generic factory extension. |
| Definition/rule retention | Native founding validates canonical declaration bytes, named closure and pins; definition/rule retained-input reads and replay exist. Retain counting's exact compiled bytes/profile version through native creation, not a mutable import URL. No pin before compile/review. |
| NoOutside | `NO_OUTSIDE` sends no provider effects; it is appropriate because counting declares none. Host wiring only enables bound register/destination effects. It does not supply application creation, membership or an external coordinator. Native create messages are distinct from provider operations. |
| Authority | `repositoryAuthority` reads membership recorded in verified genesis; absent context is authority-unavailable. `set-actions` permits bounded custom action names; current initial roles contain no counting grants. Each voice agent is an independent member/key, controller distinct. |
| Typed SDK | `declaredHandle` verifies exact pin; `intent`, `submit`, `settle`, `followReceipt` and session support exist. Build against actual declarations; retain exact signed envelope/beside values privately before POST. No blanket browser durable outbox exists. |
| Snapshot | Complete authenticated `summary` returns live board/roster at a head. Counts/final-item pagination are separate; do not use a final-only item scan for this live board. No new public snapshot type is necessary for the initial stage. |
| Watch | Worker `/stream` publishes latest heads, not application deltas; sessions checked before each send. Client ScopeApi lacks stream/watch. Reuse I5 read/invalidation owner for a small authenticated fetch-stream helper with cleanup, renewal and head-guarded snapshot; no WebSocket relay just for counting. |
| Presence | Volatile connected/speaking indicators may reset; durable Join/Leave/turn state cannot. Coordinate the existing shared-language volatile writer; don't require a new backend or silent presence-driven mutation. |

Snapshot handoff: start authenticated head subscription, then read a complete snapshot; keep highest head/full scope identity. If an invalidation arrived during the read, coalesce one reread rather than rendering old state. Discard out-of-context/older replies; reconnect subscribes and obtains a fresh snapshot automatically. Bound stream line bytes and one outstanding refresh, cancel reads on client teardown, recover session expiry visibly. No full-history or definition query per number: verified immutable definition cached per pin for that client lifetime, one small state refresh per coalesced head. This is a proposed watch lifecycle, not shipped SDK evidence.

## Voice and client feasibility

First choice: `speechSynthesis` with one independently enrolled client per window/profile and three explicitly selected voices. The [Web Speech draft](https://webaudio.github.io/web-speech-api/#the-speechsynthesis-interface) describes voice enumeration/change events and per-utterance completion/errors; voice availability is user-agent dependent. Cancellation removes queued output and interrupts active output. Those API semantics do not establish three distinct usable installed voices, audible output, tab independence or timing on this machine. No voice probe was performed. Browser user activation should be explicit in each client; the [Chrome autoplay guidance](https://developer.chrome.com/blog/web-audio-autoplay/) reinforces testing actual media policy rather than assuming background playback works.

Adapter policy (application design): user clicks Arm voice before native Join; choose three different voice identities and later listen for distinguishability. Bind each utterance closure to exact scope/generation/serial/N/key and a local audio-session generation. Only a non-canceled current utterance's end event may create Spoken. Mark it locally once before any await. Pause/Leave/Reset invalidate that closure before calling cancel. An end/error from an earlier audio session cannot advance any replacement. Error or no usable voice results in explicit control/cancel, never completion. Warm allowed voice resources after user gesture; do not pre-play the next count or queue multiple turns.

Each example client must use its own enrolled member/key context rather than Page's shared ambient Settings key. Separate browser profiles or explicit per-agent private key slots may provide that isolation; enrollment/startup must show the actual three distinct public identities. Read sessions stay in memory and are renewed through membership. Retain at most one exact pending Spoken envelope for each active client/turn, before POST, in a bounded private local record with no key/token in URL, shared log or screenshot. That narrow example requirement is not an adopted universal browser outbox. If local request custody is lost, show recovery unavailable and pause/cancel under control; do not infer an unsent report. Mark voice readiness, pending completion and recorded completion separately. The stage can carry a small synthetic-voice disclosure without a setup essay.

On unknown Spoken acknowledgment, retain its envelope and show pending. Inspect/settle that exact attempt, never call `speak` again to recover the HTTP reply. Reconnect restores recorded state and exact pending request; if audio completion cannot be established from the local retained boundary, cancel/pause under authority rather than invent completion. Native at-most-one increment does not prevent the same number being audible again after cancellation or restart. Keep that qualification in the recording caption.

Only if browser voices fail the actual suitability check, one existing API fallback is private-server OpenAI Speech using `gpt-4o-mini-tts` and three built-in voices, e.g. alloy/coral/onyx. [Official Speech documentation](https://developers.openai.com/api/docs/guides/text-to-speech) supports those inputs and streaming audio and requires an AI-voice disclosure. This is an available service option, **not an existing Artroom adapter or account capability proof**. It requires an operator-approved server route, private `OPENAI_API_KEY`, model/billing access, same-origin authenticated native-client requests, fixed voice/number allowlists, bounded output/deadline, and cancellation correlation. No key in browser/URL/log and no new credentials requested here. Server TTS renders a scope-issued number; it has no authority to increment. Terse's private-server credential pattern is reference only; no Terse SDK/runtime dependency or Realtime model substitution is proposed. Provider calls and added latency/cost need separate authorization/evidence.

## Bounded implementation and acceptance plan

Proposed path: `examples/counting/` as a separate application with `definition.ts`, authored rule/profile pins, `client.ts`, `voice.ts`, stage HTML/styles and a short startup/readme. Use existing workspace packages; public installation remains N3's separate release proof. The generic factory belongs to a versioned platform contract; watch belongs to client/I5. The example owns all counting-specific logic. No derive/Core extension is requested by the source-supported candidate, and no broad UI redesign/framework/store rewrite or music analysis pipeline is needed.

Owners: planner adopts contract/extensions and assigns their source owners; builder implements the example and bounded integrations; independent checker reviews invariants/authority/provenance; I5 owner supplies watch lifecycle; shared-language/578 writer supplies durable-versus-volatile disposition; operator/Hugh controls authorized hosting and recording. These are proposed assignments, not new promises or acceptance transfers.

Smallest real hosted slice: one actual counting scope with three independent enrolled members/keys, complete declaration retention, operator controls and automatically synchronized clients; at least 12 recorded turns, fourth Join, current-speaker Leave with same-N replacement, non-current departure, pause/resume and continuity to the target where practicable. The on-screen scene need not count all100. After source freeze, one coordinated gate per docs/testing; focused changes first, no sweeps or competing whole suites. Native scenario uses real definition/fold/authority, explicitly named transport/audio stand-ins until hosted evidence replaces them. Do not call a scripted playback event an acoustic proof.

| Focused control | Required evidence, offstage |
|---|---|
| Duplicate/stale/wrong actor/N | Exact retry returns original receipt; freshly signed duplicate/stale generation/serial, unauthorized or revoked key, wrong member or N cannot increment. A valid newly enrolled key of the same member follows native membership authority. |
| Join/Leave | Current basis unchanged by Join; non-current Leave preserves current tuple; current Leave records cancellation and same-N replacement/empty-roster pause |
| Reset/Pause race | Late end from canceled/reset turn cannot advance the replacement, even when N matches; completion-before-control order remains valid |
| Restart/unknown reply | DO state survives; accepted-lost response settles exact envelope with no new signature/increment/audio replay; failed pre-POST preparation remains distinguishable |
| Reconnect/head race | New snapshot cannot regress count or resurrect canceled turn; invalidation during fetch triggers one coalesced refresh; context/key/room switch drops old callbacks |
| Empty/revoked/offline | Start empty refuses; last departure pauses; revoked signer cannot report; abrupt disconnect never forges Leave and reaches explicit cancellation/expiry |
| Declaration/establishment | Wrong pin/member incarnation/creator cannot establish authority; actual generic factory and retained rule bytes replay at the stated frontier |

Measurements for the same small hosted run: capture client report-created/POST-start/answer-received, receipt head, peer invalidation/snapshot-applied, and utterance start/end timestamps. Report acknowledgment latency, peer-visible latency and end-to-next-start audio gap separately, with sample counts, browser/voice/source pins and min/median/max. Do not subtract unsynchronized clocks across machines; use one recorder clock for shared audio/visual observations or state synchronization uncertainty. No threshold, throughput or cost is claimed before measurement. A visible pending label changes to recorded only on the known receipt/head; current-speaker highlight comes from recorded turn plus local playback indication.

## Schedule and today's decisions

- **Friday October9:** planner disposes generic factory and watch ownership; approve the current-form declaration, native Join-order/MemberRef contract and exact source path. Authorize the narrow pure validation next if desired. Optional explicitly approved no-audio voice inventory is still needed; it does not establish usability. Missing disposition means report blocker today, not “implementation ready”.
- **Saturday October10:** hosted three-agent slice only if reviewed source, enrollment/deployment and actual voice checks are available. Otherwise report the exact unresolved dependency and revise ETA; no fallback to an external counter backend.
- **Sunday October11, noon America/New_York:** freeze reviewed source, operator configuration, focused acceptance evidence and the short scene. Audio/identity/callback defects block the freeze; don't cut those conditions to meet the date.
- **Monday October12:** record the natural scene with original app-owned assets and honest captions; reveal the small definition and completed number/speaker journal briefly. Keep wrong-turn tests offstage and inspect panels secondary.
- **Competition deadline October14:** retain contingency for recording/export/rights checks; full hosted proof is currently unestablished. Optional Git export is an explicit separate result, not a prerequisite or an implied archive capability.

Today’s adoption questions are concrete: (1) choose the generic native factory/authority contract coordinated with the existing shared-language writer, (2) adopt the source-supported native Join-order/MemberRef/fully checked proposal declaration and authorize a narrow pure validation, (3) confirm watch lifecycle ownership, (4) approve the bounded actual voice inventory and subsequent listening/hosting evidence. No sort, key-projection or computed-assignment amendment is requested. This artifact executes none of them. Seven current correctness repairs keep their Worker lane; this static design does not compete with them.

## Provenance and remaining evidence

Exact reference source SHA-256:

| File | SHA-256 |
|---|---|
| PRODUCT.md | `4e1c600b55ac0bdcb46996dc5a56c5e04f8788927d6e2e6c2a33ea13b20beb7b` |
| src/counting-room.ts | `77fa5449daa44b6d355e495dd5e302c38ca20ff48c4be8f7c6601fca93896c31` |
| src/counting-turns.ts | `7544663b92f5fbde9cb81e245ebe4d3fe11cf274be7aa8ab0fa6435619a54404` |
| server/counting-socket-relay.mjs | `4d2850813c638cbaacd742959f1c1a91ec8d22a788b960767eefdbe919243736` |
| shared/counting-protocol.mjs | `81a1538f489c473be943edc56a4a72b864529fde353754a2f0c2b4a4749f14db` |

Native sources inspected: contract definition/intent/result/entry; derive ruleInput/operand/profile/evaluator/sends; scope core/founding/turn/reads/authority/worker/object/sessions/host-wiring/NO_OUTSIDE; platform directory/membership; client declared/handle/session. Existing source establishes those interfaces, not acceptance of this draft. No test, native runtime, provider, install, media, browser voice enumeration or new implementation was run. One broad filename search was stopped and replaced by exact public source reads; it supplied no private-media evidence.

Still owed: independent contract adoption; validator-passing complete declaration and exact pins; generic source changes with focused invariants; real establishment/grants; actual three-voice availability and audible distinguishability; hosted synchronization/sequence/turn-gap evidence; complete replay at a stated frontier with trusts; frozen screenshots/recording and startup instructions. Nothing here closes original4073 or claims full delivery.
