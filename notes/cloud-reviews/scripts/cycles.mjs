import fs from "node:fs"; import path from "node:path";
const files = [];
function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) { if (e.name!=="node_modules") walk(p);} else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);} }
for (const pk of fs.readdirSync("packages")) { const s=`packages/${pk}/src`; if (fs.existsSync(s)) walk(s); }
const g = new Map();
for (const f of files) { const src=fs.readFileSync(f,"utf8"); const deps=[]; for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']/g)) {  let r=path.normalize(path.join(path.dirname(f), m[1])); if (!fs.existsSync(r)) { for (const ext of [".ts",".tsx","/index.ts"]) if (fs.existsSync(r.replace(/\.js$/,"")+ext)) { r=r.replace(/\.js$/,"")+ext; break; } } deps.push(r);} g.set(f,deps); }
// Tarjan SCC
let idx=0; const st=[], on=new Set(), I=new Map(), L=new Map(), sccs=[];
function sc(v){ I.set(v,idx); L.set(v,idx); idx++; st.push(v); on.add(v); for (const w of g.get(v)||[]) { if (!g.has(w)) continue; if (!I.has(w)) { sc(w); L.set(v,Math.min(L.get(v),L.get(w))); } else if (on.has(w)) L.set(v,Math.min(L.get(v),I.get(w))); } if (L.get(v)===I.get(v)) { const c=[]; let w; do { w=st.pop(); on.delete(w); c.push(w);} while(w!==v); if (c.length>1) sccs.push(c);} }
for (const v of g.keys()) if (!I.has(v)) sc(v);
for (const c of sccs) console.log(c.length, c.join(" "));
console.log("files", files.length, "value-import cycles", sccs.length);
