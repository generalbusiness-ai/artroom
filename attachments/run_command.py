import datetime,json,os,pathlib,subprocess,sys,time
label=sys.argv[1]; command=sys.argv[2:]; parent=pathlib.Path(__file__).resolve().parent; cwd=pathlib.Path.cwd()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
start=time.time()
with (parent/(label+'.log')).open('w') as log:
 result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
end=time.time()
record={'label':label,'head':head,'cwd':str(cwd),'command':command,'start':start,'start_utc':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat(),'end':end,'exit':result.returncode,'log':str(parent/(label+'.log'))}
(parent/(label+'.command.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record)); sys.exit(result.returncode)

