import hashlib, json, pathlib, subprocess, sys
root=pathlib.Path(__file__).resolve().parent
repo=root.parent/'repo'
source=repo/'packages/mcp/src/run.ts'
original=source.read_bytes()
old='close: () => stream.cancel().catch(() => undefined),'
new='close: async () => { reader.releaseLock(); await stream.cancel().catch(() => undefined); },'
text=original.decode(); assert text.count(old)==1
fixture=repo/'packages/mcp/test/checker-mcp-streams-b359.test.ts'
(root/'fixture.test.ts').write_bytes(fixture.read_bytes())
results={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'sourceBeforeSha256':hashlib.sha256(original).hexdigest(),'replacement':{'path':'packages/mcp/src/run.ts','old':old,'new':new,'occurrences':1}}
try:
 source.write_text(text.replace(old,new)); (root/'source-diagnostic.ts').write_bytes(source.read_bytes())
 with (root/'typecheck.log').open('w') as out:
  results['typecheckExit']=subprocess.run(['npm','run','typecheck'],cwd=repo,stdout=out,stderr=subprocess.STDOUT).returncode
 if results['typecheckExit']==0:
  dest=root/'streams.vitest.json'; assert not dest.exists()
  with (root/'streams.log').open('w') as out:
   results['runtimeExit']=subprocess.run(['npx','vitest','run','--config','vitest.config.ts','test/checker-mcp-streams-b359.test.ts','--reporter=default','--reporter=json','--outputFile='+str(dest)],cwd=repo/'packages/mcp',stdout=out,stderr=subprocess.STDOUT).returncode
finally:
 source.write_bytes(original); assert source.read_bytes()==original
 results['sourceRestoredSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
 results['trackedDiffAfter']=subprocess.check_output(['git','diff','--name-only'],cwd=repo,text=True)
 (root/'results.json').write_text(json.dumps(results,indent=2)+'\n')
