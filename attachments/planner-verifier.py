import collections
import datetime
import hashlib
import json
import pathlib
import subprocess
import tarfile

bundle = pathlib.Path('/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/artroom-checker-stage5-c74f3696-ngehusq3')
repo = bundle / 'repo'
head = 'c74f36965cc90049ad8fc44256a94974de5deb81'
tree = '005530a5042fe92495896b58e11dc28677573459'
sha = lambda data: hashlib.sha256(data).hexdigest()
git = lambda *args: subprocess.check_output(['git', *args], cwd=repo)
read = lambda name: json.loads((bundle / name).read_text())
manifest = read('evidence-manifest.json')
assert len(manifest) == 152
for row in manifest:
    data = (bundle / row['path']).read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256'], row['path']
assert sha((bundle / 'evidence-manifest.json').read_bytes()) == '9303db2b532f5e1a84e54e2d60267bd6c00e7897ba61a6c5cb4da9c8a9fb8cf8'
assert git('rev-parse', 'HEAD').decode().strip() == head
assert git('rev-parse', 'HEAD^{tree}').decode().strip() == tree
assert git('status', '--porcelain', '--untracked-files=all') == b''
assert git('diff', 'HEAD', '--') == b''
entries = []
for row in git('ls-tree', '-rz', '--full-tree', head).split(b'\0'):
    if row:
        meta, path = row.split(b'\t', 1)
        mode, kind, oid = meta.split()
        assert kind == b'blob'
        entries.append((path.decode(), oid.decode()))
payload = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=repo, input=''.join(oid+'\n' for _, oid in entries).encode())
position = 0
blobs = {}
for path, oid in entries:
    nl = payload.index(b'\n', position)
    meta = payload[position:nl].split()
    assert meta[0].decode() == oid and meta[1] == b'blob'
    start = nl+1
    size = int(meta[2])
    data = payload[start:start+size]
    assert payload[start+size:start+size+1] == b'\n'
    position = start+size+1
    assert (repo/path).read_bytes() == data, path
    blobs[path] = data
assert position == len(payload) and len(blobs) == 715
inventory = {path: {'bytes': len(data), 'sha256': sha(data)} for path, data in blobs.items()}
assert read('tracked-initial.json') == read('tracked-final.json') == inventory
snapshots = read('source-snapshots.json')
assert len(snapshots) == 73
for row in snapshots:
    data = blobs[row['path']]
    assert len(data) == row['bytes'] and sha(data) == row['sha256']
    assert (bundle/'source-initial'/row['path']).read_bytes() == data
archived = set()
with tarfile.open(bundle/'head-tree.tar', mode='r|') as archive:
    for member in archive:
        if member.isfile():
            assert archive.extractfile(member).read() == blobs[member.name], member.name
            archived.add(member.name)
assert archived == set(blobs)
copied = read('copied-fixtures.json')
assert len(copied) == 9
for row in copied:
    data = (bundle/'fixtures'/row['copiedTo']).read_bytes()
    assert data == pathlib.Path(row['oldSource']).read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256']
new = read('new-fixture.json')
assert sha((bundle/'fixtures'/new['path']).read_bytes()) == new['sha256'] == 'f003608abee061ea2f9671e9f95eddd6b96cc34ed25b23a0b796619006807733'
compiler = read('root-typecheck-final-fixtures.command.json')
assert compiler['exitCode'] == 0
scopes = []
private_names = []
all_assertions = []
private_files = {pathlib.Path(row['copiedTo']).name for row in copied} | {pathlib.Path(new['path']).name}
for label, total, passed, failed in [('cli-full',203,201,2),('ui-full',280,280,0),('client-title-focused',8,8,0)]:
    command = read(label+'.command.json')
    assert compiler['end'] < command['start']
    assert command['exitCode'] == (1 if failed else 0)
    raw = read(label+'.vitest.json')
    actual_rows = [a for suite in raw['testResults'] for a in suite['assertionResults']]
    counts = collections.Counter(a['status'] for a in actual_rows)
    assert len(actual_rows) == raw['numTotalTests'] == total
    assert counts == {'passed':passed, **({'failed':failed} if failed else {})}
    summary = read(label+'.independent-summary.json') if label != 'client-title-focused' else None
    if summary:
        assert summary['numTotalTests'] == total and summary['numPassedTests'] == passed and summary['numFailedTests'] == failed and summary['numPendingTests'] == 0
        by_file = {pathlib.Path(suite['name']).name: suite for suite in raw['testResults']}
        assert len(by_file) == len(raw['testResults']) == len(summary['files'])
        for file in summary['files']:
            expected = [{'name':a['fullName'],'status':a['status'],'failureMessages':a['failureMessages']} for a in by_file[file['file']]['assertionResults']]
            assert expected == file['assertions'], file['file']
    for suite in raw['testResults']:
        for actual in suite['assertionResults']:
            assert actual['status'] == 'failed' or actual['failureMessages'] == []
            if pathlib.Path(suite['name']).name in private_files:
                private_names.append({'file':pathlib.Path(suite['name']).name,'name':actual['fullName'],'status':actual['status'],'messages':actual['failureMessages']})
    all_assertions.extend(actual_rows)
    scopes.append({'run':label,'total':total,'passed':passed,'failed':failed,'skipped':0,'runtimeStart':command['start']})
failures = [a for a in all_assertions if a['status'] == 'failed']
assert len(failures) == 2 and sum(len(a['failureMessages']) for a in failures) == 4
assert all('alternateKind=true' in a['fullName'] and all('AssertionError' in m for m in a['failureMessages']) for a in failures)
assert len(private_names) == 50
log = (bundle/'cli-full.log').read_text()
for path in sorted((bundle/'observations/journal-kind').glob('*.json')):
    observed = json.loads(path.read_text())
    assert observed['savedKind'] == 'start-song' and observed['actSigningCalls'] == 1
    assert observed['posts'] == (5 if observed['state']=='prepared' else 1)
    assert observed['uniqueSignedBytes'] == observed['uniqueSignatures'] == 1
    finishing_posts = [e for e in observed['events'] if e['run']=='finish' and e['method']=='POST' and e['path'].endswith('/acts')]
    assert len(finishing_posts) == (1 if observed['state']=='prepared' else 0)
    marker = 'CHECKER_C74_JOURNAL '+json.dumps({'name':path.stem,'value':observed},separators=(',',':'),ensure_ascii=False)
    assert marker in log
extraction = read('ui-browser-json-extraction.json')
browser_log = (bundle/extraction['from']).read_text()
browser, consumed = json.JSONDecoder().raw_decode(browser_log[extraction['offset']:])
assert consumed == extraction['consumedCharacters'] and browser == read('ui-browser.playwright.json')
assert browser['stats']['expected'] == 9 and browser['stats']['unexpected'] == browser['stats']['flaky'] == browser['stats']['skipped'] == 0 and browser['errors'] == []
assert read('ui-build.command.json')['exitCode'] == read('ui-browser.command.json')['exitCode'] == 0
assert read('client-title.command.json')['exitCode'] == 1
proof = {'verifiedBy':'planner','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'tree':tree,'evidenceDirectory':str(bundle),'manifestEntries':152,'manifestSHA256':sha((bundle/'evidence-manifest.json').read_bytes()),'snapshotBlobs':73,'immutableInitialFinalCurrentAndArchivedBlobs':715,'retainedFrozenFixtures':9,'rawUnitCases':491,'passingExecutions':489,'failedCases':2,'actualAssertionErrorMessages':4,'privateQualifiedNames':50,'compilerExit':0,'compilerEnd':compiler['end'],'allSemanticStartsAfterCompiler':True,'scopes':scopes,'browserExpected':9,'browserReporterEqualsRawLog':True,'excludedCompoundClientWrapperExit':1,'restoredClean':True,'newSemanticExecutions':0,'installedDependencyArchiveClaim':False,'wholeStageCredit':False}
pathlib.Path('/tmp/artroom-planner-stage5-c74-checker-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
pathlib.Path('/tmp/artroom-planner-stage5-c74-checker-private-names.json').write_text(json.dumps(private_names,indent=2)+'\n')
print(json.dumps(proof,indent=2),flush=True)
