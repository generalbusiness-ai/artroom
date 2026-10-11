// The existing three-entry U1 recipe: transpile real workspace sources, inspect the metafile, then Node's own test runner.
import { build } from "esbuild";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { realpathSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const root=realpathSync(fileURLToPath(new URL("../../../",import.meta.url)));
const inside=(base,path)=>{const part=relative(base,path);return part===""||!part.startsWith("..")&&!isAbsolute(part);};
const lock=await readFile(resolve(root,"package-lock.json"));
const lockData=JSON.parse(lock);
const lockHash=createHash("sha256").update(lock).digest("hex");
const stamp=resolve(root,"node_modules/.artroom-lock-sha256");
if(existsSync(stamp)&&(await readFile(stamp,"utf8")).trim()!==lockHash)throw new Error("Counting witness dependency view does not match the existing lock.");
if(JSON.parse(await readFile(resolve(root,"node_modules/esbuild/package.json"),"utf8")).version!=="0.28.1")throw new Error("Counting witness requires the pinned esbuild.");
const dependencyRoots=[];
for(const name of readdirSync(resolve(root,"node_modules"))){if(name.startsWith("." )||name==="@generalbusiness")continue;const candidates=name.startsWith("@")?readdirSync(resolve(root,"node_modules",name)).map(child=>name+"/"+child):[name];
  for(const name of candidates){const supplied=resolve(root,"node_modules",name),manifest=resolve(supplied,"package.json");if(!existsSync(manifest))continue;const pkg=JSON.parse(await readFile(manifest,"utf8"));if(lockData.packages?.["node_modules/"+name]?.version===pkg.version)dependencyRoots.push(realpathSync(supplied));}}
const names=["client","voice-controller","app"];
const entries=names.map(name=>resolve(root,`examples/counting/browser/${name}.test.ts`));
const output=realpathSync(await mkdtemp(resolve(tmpdir(),"artroom-counting-node-")));
const aliases=Object.fromEntries(["client","bytes","contract"].map(name=>[`@generalbusiness/artroom-${name}`,resolve(root,`packages/${name}/src/index.ts`)]));
const result=await build({entryPoints:entries,absWorkingDir:root,bundle:true,platform:"node",format:"esm",outdir:output,outExtension:{".js":".mjs"},alias:aliases,metafile:true,write:true,logLevel:"silent"});
const meta=JSON.stringify(result.metafile);if(Buffer.byteLength(meta)>4*1024*1024)throw new Error("Counting witness metafile exceeds its bound.");
await writeFile(resolve(output,"metafile.json"),meta);
const inputs=Object.keys(result.metafile.inputs),outputs=Object.entries(result.metafile.outputs);
if(inputs.length>10000||outputs.length!==3)throw new Error("Unexpected Counting witness build inventory.");
const source=new Set();
for(const name of inputs){const supplied=resolve(root,name),path=realpathSync(supplied);
  if(inside(root,path)&&!inside(resolve(root,"node_modules"),supplied))source.add(path);
  else if(!dependencyRoots.some(base=>inside(base,path)))throw new Error("Counting witness input is outside the current source and locked dependencies.");
}
for(const name of ["packages/client/src/observe.ts","packages/client/src/head-stream.ts","packages/client/src/index.ts","packages/client/src/intent.ts","packages/bytes/src/index.ts","packages/contract/src/index.ts","examples/counting/commitments.ts","examples/counting/commitments-pin.ts",...entries.map(path=>relative(root,path))])if(!source.has(realpathSync(resolve(root,name))))throw new Error("Counting witness omitted a current source dependency.");
const files=outputs.map(([name,info])=>{const path=realpathSync(resolve(root,name));if(!inside(output,path)||!info.entryPoint||!entries.includes(realpathSync(resolve(root,info.entryPoint))))throw new Error("Unexpected Counting witness entry or output.");return path;});
if(new Set(files.map(path=>basename(path))).size!==3||new Set(outputs.map(([,info])=>info.entryPoint)).size!==3)throw new Error("Duplicate Counting witness output.");

await writeFile(resolve(output,"source.json"),JSON.stringify({root,entries,outputs:files}));
const run=spawnSync(process.execPath,["--test",...files],{cwd:root,stdio:"inherit",env:Object.fromEntries(Object.entries(process.env).filter(([name])=>name!=="NODE_PATH"&&name!=="NODE_OPTIONS"))});
console.log(`Counting Node witness evidence: ${output}`);
process.exitCode=run.status??1;
