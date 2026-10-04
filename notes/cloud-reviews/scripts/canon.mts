import * as L from "../../../packages/log/src/canonical.ts";
import * as R from "../../../packages/room/src/canonical.ts";
import * as C from "../../../packages/client/src/canonical.ts";
import * as P from "../../../packages/policy/src/integrity.ts";
const t=(f,v)=>{try{return f(v)}catch(e){return "THROW:"+(e.name)+":"+(e.code??"")+":"+e.message.slice(0,50)}};
const cases={undefProp:{a:1,b:undefined}, arrUndef:[1,undefined], top:undefined, float:1.5, big:2**60, negz:-0, proto:{["__proto__"]:1}, ctor:{constructor:1}, date:new Date(0), lone:"\uD800", nested:{b:[{z:1,a:"x"}],a:null}};
for (const [k,v] of Object.entries(cases)) console.log(k,"| log",t(L.canonicalize,v),"| room",t(R.canonicalize,v),"| client",t(C.canonicalize,v),"| policy",t(P.canonicalize,v));
const deep="[".repeat(100)+"]".repeat(100); const vdeep="[".repeat(20000)+"]".repeat(20000);
for (const s of [deep, vdeep, '{"a":1,"a":2}', '"\\u0001"', '"\u0001"', '1.0', '1e2', '-0', '{"__proto__":1}', ' 1 ', '"\\ud800"', ' 1']) console.log(JSON.stringify(s.slice(0,20)), "| log",JSON.stringify(t(L.parseStrict,s)).slice(0,80),"| room",JSON.stringify(t(R.parseStrict,s)).slice(0,80));
