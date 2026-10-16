import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
const root = process.cwd(); // run from the repository root
const pk = {};
for (const d of readdirSync(join(root,"packages"))) { const f=join(root,"packages",d,"package.json"); if(!existsSync(f)) continue; const j=JSON.parse(readFileSync(f)); pk[j.name]={dir:join(root,"packages",d),exports:j.exports??{}}; }
function res(from, spec) {
  if (spec.startsWith(".")) { const p=resolve(dirname(from),spec); for (const c of [p,p+".ts",p+".tsx",join(p,"index.ts")]) if(existsSync(c)&&!c.endsWith("/")&&readdirSafe(c)) return c; return null; }
  const m = spec.match(/^(@generalbusiness\/artroom-[a-z]+)(\/.*)?$/); if(!m||!pk[m[1]]) return null;
  const e = pk[m[1]].exports; const key = m[2]?"."+m[2]:"."; const t = typeof e==="string"?e:e[key]; if(!t) return null; return join(pk[m[1]].dir,typeof t==="string"?t:(t.import??t.default));
}
function readdirSafe(c){ try{ readFileSync(c); return true;}catch{return false;} }
const deps = new Map();
function scan(f){ if(deps.has(f)) return; const src=readFileSync(f,"utf8").replace(/^\s*import\s+type\s[\s\S]*?from\s+["'][^"']+["'];?/gm,"").replace(/^\s*export\s+type\s[\s\S]*?from\s+["'][^"']+["'];?/gm,"");
  const out=new Set(); for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) { const r=res(f,m[1]); if(r) out.add(r);} deps.set(f,out); for(const r of out) scan(r); }
const tests = process.argv.slice(2).map(p=>resolve(root,p));
const reach = new Map();
for (const t of tests){ scan(t); const seen=new Set(); const st=[t]; while(st.length){const x=st.pop(); if(seen.has(x)) continue; seen.add(x); for(const y of deps.get(x)??[]) st.push(y);} reach.set(t,seen);}
const count = new Map();
for (const [t,s] of reach) for (const f of s) if(f!==t && /\/src\//.test(f)) count.set(f,(count.get(f)??0)+1);
const rows=[...count].sort((a,b)=>b[1]-a[1]);
console.log("test entry files:",tests.length);
for (const [f,n] of rows) console.log(n, relative(root,f));
for (const q of ["packages/contract/src/index.ts","packages/room/src/core.ts"]) console.log("Q",q,count.get(join(root,q)));
