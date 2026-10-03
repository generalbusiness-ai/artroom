import hashlib, json, pathlib, subprocess, sys
root=pathlib.Path(__file__).resolve().parent
repo=root.parent/'repo'
fixture=repo/'packages/mcp/test/checker-mcp-streams-b359.test.ts'
assert fixture.read_bytes()==(root/'fixture.test.ts').read_bytes()
results={'head': subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(), 'fixtureSha256':hashlib.sha256(fixture.read_bytes()).hexdigest()}
with (root/'typecheck.log').open('w') as out:
    results['typecheckExit']=subprocess.run(['npm','run','typecheck'],cwd=repo,stdout=out,stderr=subprocess.STDOUT).returncode
(root/'results.json').write_text(json.dumps(results,indent=2)+'\n')
if results['typecheckExit'] != 0: sys.exit(results['typecheckExit'])
jsonpath=root/'streams.vitest.json'
assert not jsonpath.exists()
with (root/'streams.log').open('w') as out:
    results['runtimeExit']=subprocess.run(['npx','vitest','run','--config','vitest.config.ts','test/checker-mcp-streams-b359.test.ts','--reporter=default','--reporter=json','--outputFile='+str(jsonpath)],cwd=repo/'packages/mcp',stdout=out,stderr=subprocess.STDOUT).returncode
(root/'results.json').write_text(json.dumps(results,indent=2)+'\n')
