from pathlib import Path
import subprocess,json,datetime,sys,os,hashlib
root=Path(__file__).resolve().parent
label,cwd,*argv=sys.argv[1:]
if (root/(label+'.command.json')).exists(): raise SystemExit('Refusing overwrite: '+label)
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
env=dict(os.environ);env['ARTROOM_CHECKER_TITLE_EVIDENCE']=str(root/'observations/title-retained');env['ARTROOM_CHECKER_C74_EVIDENCE']=str(root/'observations/journal-kind')
with (root/(label+'.log')).open('wb') as log:
 proc=subprocess.run(argv,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
data={'argv':argv,'cwd':cwd,'start':start,'end':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':proc.returncode,'runnerSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'environmentEvidencePaths':{k:env[k] for k in ['ARTROOM_CHECKER_TITLE_EVIDENCE','ARTROOM_CHECKER_C74_EVIDENCE']}}
(root/(label+'.command.json')).write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps(data));sys.exit(proc.returncode)
