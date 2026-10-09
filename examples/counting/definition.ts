/** Counting application: scope-verified field proposals, native Join order, no outside effects. */
import type { ActType, DeclaredDefinition, EffectForm, FieldType, FieldValue, Guard, ItemType, Range, Subject } from
  "@generalbusiness/artroom-contract";
const integer = (min:number,max:number) => ({type:"int",min,max} as const);
const field = (type:FieldType, required=true): FieldType & {required:boolean} => ({...type,required});
const value = (of:FieldType, required=false, defaultValue?:FieldValue): ItemType["values"][string] =>
  ({fixed:false,required,of,...(defaultValue===undefined?{}:{default:defaultValue})});
const party = (required=false,fixed=false): ItemType["parties"][string] => ({required,fixed,list:false,author:false});
const id = {type:"item",of:"participant"} as const;
const basis = {type:"list",max:8,of:{type:"record",of:{
  id:field(id), member:field({type:"member"})}}} as const;
const range = (except:Subject[]=[]):Range => ({type:"participant",states:["joined"],except});
const roster = (except:Subject[]=[]):Guard => ({sameSet:{
  list:{field:"basis"},as:"p",key:{element:"p.id"},items:range(except),
  match:[{equals:{a:{slot:"agent"},b:{element:"p.member"}}}],ordered:true}});
const rule = (name:string):Guard => ({rule:name});
const controller:Guard = {signer:["controller"]};
const boardController:Guard = {of:"also.board",signer:["controller"]};
const current:Guard = {equals:{a:{slot:"agent"},b:{slot:"speaker",of:"also.board"}}};
const leftEmpty:Guard = {equals:{a:{field:"replace"},b:{const:false}}};
const remaining:Guard = {equals:{a:{field:"replace"},b:{const:true}}};
const done:Guard = {equals:{a:{field:"n"},b:{slot:"target"}}};
const base = (step:ActType["step"],on:string,grant:string):ActType => ({
  step,on,grant,also:{},fields:{},guards:[],effects:[],sends:[],attention:[]});
const clear = (of?:Subject, when?:Guard[]):EffectForm[] => [
  {party:{slot:"speaker",from:null},...(of?{of}:{}),...(when?{if:when}:{})},
  ...["number","basis","until"].map(slot =>
    ({value:{slot,from:null},...(of?{of}:{}),...(when?{if:when}:{})} as EffectForm))];
const issue = (numberField:string,unless?:Guard[]):EffectForm[] => [
  {party:{slot:"speaker",from:{slot:"agent",of:"also.next"}},...(unless?{unless}:{})},
  {value:{slot:"basis",from:{field:"basis"}},...(unless?{unless}:{})},
  {value:{slot:"number",from:{field:numberField}},...(unless?{unless}:{})},
  {value:{slot:"until",from:{time:{plusSeconds:15}}},...(unless?{unless}:{})}];
const leaveFields = {generation:field(integer(0,1000000)), serial:field(integer(0,1000000)),
  nextSerial:field(integer(1,1000000)), basis:field(basis), replace:field({type:"bool"}), next:field(id,false)};
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
  fields:leaveFields, guards:[{state:["joined"]},{of:"also.board",state:["paused","running","finished"]},...guards,roster(["on"]),rule("leave-plan")],
  effects:leaveEffects});
export const counting:DeclaredDefinition = {
  format:"artroom-definition-1", name:"counting",profile:{name:"restricted",version:1},
  capabilities:[],genesis:"establish",
  items:{
    configuration:{many:false,max:1,states:{ready:{final:false}},initial:"ready",
      parties:{controller:party(true,true)},refs:{},values:{target:{fixed:true,required:true,of:integer(1,100)}}},
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
    establish:{...base("open","configuration","counting.establish"),
      fields:{opener:field({type:"member"}),target:field(integer(1,100))},
      effects:[{party:{slot:"controller",from:{field:"opener"}}},
        {value:{slot:"target",from:{field:"target"}}}]},
    initialize:{...base("open","board","counting.control"),
      also:{configuration:{item:"configuration",one:true}},
      guards:[{of:"also.configuration",state:["ready"]},{of:"also.configuration",signer:["controller"]}],
      effects:[{party:{slot:"controller",from:{slot:"controller",of:"also.configuration"}}},
        {value:{slot:"target",from:{slot:"target",of:"also.configuration"}}}]},
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
      guards:[{state:["paused","running","finished"]},controller,rule("reset-plan")],effects:[{state:"paused"},
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
        ...issue("nextN",[done]),...clear(undefined,[done])]}
  },
  receives:{},
  timed:{"turn-expired":{on:"board",states:["running"],deadline:"until",
    effects:[{state:"paused"},...clear()],attention:[]}},
  rules:{
    "start-plan":'($v := subjects.on.values; $b := fields.basis; $c := $count($b); $i := (fields.n - 1) % $c; $c > 0 and fields.n = $v.lastNumber + 1 and fields.n <= $v.target and fields.nextSerial = $v.serial + 1 and fields.next = $b[$i].id)',
    "spoken-plan":'($v := subjects.on.values; $b := fields.basis; $c := $count($b); $i := (fields.nextN - 1) % $c; $c > 0 and fields.generation = $v.generation and fields.serial = $v.serial and fields.n = $v.number and fields.n = $v.lastNumber + 1 and fields.n <= $v.target and fields.nextSerial = $v.serial + 1 and fields.nextN = (fields.n = $v.target ? $v.target : fields.n + 1) and fields.next = $b[$i].id)',
    "leave-plan":'($v := $lookup(subjects,"also.board").values; $b := fields.basis; $c := $count($b); fields.generation = $v.generation and fields.serial = $v.serial and fields.nextSerial = $v.serial + 1 and fields.replace = ($c > 0) and ($c = 0 ? $not($exists(fields.next)) : fields.next = $b[$v.lastNumber % $c].id))',
    "serial-plan":'fields.nextSerial = subjects.on.values.serial + 1',
    "reset-plan":'fields.generation = subjects.on.values.generation + 1'
  }
};

/** Complete declared closure: this application creates no child definitions. */
export const countingClosure: readonly DeclaredDefinition[] = [counting];
