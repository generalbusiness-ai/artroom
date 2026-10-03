from pathlib import Path
import subprocess,sys,datetime,json,os
label,cwd=sys.argv[1:3]
argv=sys.argv[3:]
here=Path(__file__).resolve().parent
log=here/(label+'.log')
meta=here/(label+'.meta.json')
env=os.environ.copy()
env.update({'CI':'1','NO_COLOR':'1','WRANGLER_SEND_METRICS':'false'})
info={'label':label,'cwd':cwd,'argv':argv,'utcStart':datetime.datetime.now(datetime.timezone.utc).isoformat(),'envOverrides':{k:env[k] for k in ['CI','NO_COLOR','WRANGLER_SEND_METRICS']},'rawLog':str(log)}
meta.write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps({'started':label,'utc':info['utcStart'],'log':str(log)}),flush=True)
with log.open('wb') as f:
 p=subprocess.run(argv,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
info.update({'exit':p.returncode,'utcEnd':datetime.datetime.now(datetime.timezone.utc).isoformat()})
meta.write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info,indent=2),flush=True)
sys.exit(p.returncode)
