import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import subprocess
import tempfile

REPO = pathlib.Path('/tmp/artroom-planner-ui-4567-ajquzk40/repo')
HEAD = 'c74f36965cc90049ad8fc44256a94974de5deb81'
BASE = '624dbb9fc961caabc42e6e66e8a8f906e40fe0ba'
EVIDENCE = pathlib.Path(tempfile.mkdtemp(prefix='artroom-planner-stage5-c74-'))
COMMANDS = []

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def write(name, value):
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + '\n')

def inventory():
    return {p: sha((REPO / p).read_bytes()) for p in git('ls-files', '-z').decode().split('\0') if p}

def run(name, args, cwd):
    record = {'name': name, 'args': args, 'cwd': str(cwd), 'start': now()}
    with (EVIDENCE / (name + '.log')).open('w') as out:
        record['exit'] = subprocess.run(args, cwd=cwd, stdout=out, stderr=subprocess.STDOUT).returncode
    record['end'] = now()
    COMMANDS.append(record)
    print(json.dumps(record), flush=True)
    return record

def fixture(src, destination, expected=None):
    data = src.read_bytes()
    if expected is not None:
        assert sha(data) == expected, str(src)
    dst = REPO / destination
    assert not dst.exists(), str(dst)
    frozen = EVIDENCE / 'fixtures' / destination
    frozen.parent.mkdir(parents=True, exist_ok=True)
    frozen.write_bytes(data)
    dst.write_bytes(data)
    return {'source': str(src), 'destination': destination, 'sha256': sha(data), 'bytes': len(data), 'lines': data.count(b'\n')}

assert git('status', '--porcelain', '--untracked-files=all') == b''
assert git('rev-parse', 'HEAD').decode().strip() == BASE
subprocess.run(['git', 'checkout', '--detach', HEAD], cwd=REPO, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
assert git('status', '--porcelain', '--untracked-files=all') == b''
initial = inventory()
write('tracked-before.json', initial)
write('heads.json', {'head': HEAD, 'tree': git('rev-parse', 'HEAD^{tree}').decode().strip(), 'base': BASE, 'repo': str(REPO)})
fixtures = []
try:
    ui = pathlib.Path('/tmp/artroom-planner-ui-4567-ajquzk40')
    fixtures.append(fixture(ui / 'checker-ui-f606-races.test.ts', 'packages/ui/test/checker-ui-f606-races.test.ts', 'b58e94872c699b49fa48a108e34b26ac7c723211783509c9de41cc14a9caed57'))
    fixtures.append(fixture(ui / 'planner-ui-unavailable.test.ts', 'packages/ui/test/planner-ui-unavailable.test.ts', '8cf82744551421b1cb72887f273009f84316aa56cd4d75b26fd4bd05c03717d8'))
    observed = pathlib.Path('/tmp/artroom-checker-ui-624d-x3tfvfj8')
    observed_name = 'probes/checker-ui-624-observations.test.ts'
    manifest = json.loads((observed / 'frozen-manifest.json').read_text())
    matching = [item for item in manifest if pathlib.Path(item['path']).resolve() == (observed / observed_name).resolve()]
    assert len(matching) == 1
    expected = matching[0]['sha256']
    fixtures.append(fixture(observed / observed_name, 'packages/ui/test/checker-ui-624-observations.test.ts', expected))
    title = pathlib.Path('/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T')
    fixtures.append(fixture(title / 'artroom-planner-cli-era-flomo622/planner-title-era.test.ts', 'packages/cli/test/planner-title-era.test.ts', '4b2f84801bfa082b9b6a4bb70369d005c5af8f3577f38b0b744ec675a0021e25'))
    fixtures.append(fixture(title / 'artroom-planner-cli-retry-era-_eylsugl/planner-title-retry-era.test.ts', 'packages/cli/test/planner-title-retry-era.test.ts', '6169736fb97d47357bc9d18a52b74e8e2d2e80496e5c82a56cff524284fec95d'))
    checker = title / 'artroom-checker-title-624-ei7wb2vf'
    checker_path = 'fixtures/packages/cli/test/checker-title-era-624.test.ts'
    sums = dict(line.split('  ', 1)[::-1] for line in (checker / 'SHA256SUMS').read_text().splitlines())
    fixtures.append(fixture(checker / checker_path, 'packages/cli/test/checker-title-era-624.test.ts', sums[checker_path]))
    write('copied-fixtures.json', fixtures)
    write('setup.json', {'head': HEAD, 'trackedDiffBeforeCompile': git('diff', '--name-only', 'HEAD').decode(), 'compilerIncludes': ['all workspaces source/tests through root typecheck', 'UI tsconfig includes src/test/e2e', 'CLI tsconfig and tsconfig.test'], 'started': now()})
    print(json.dumps({'evidence': str(EVIDENCE), 'head': HEAD, 'fixtureCount': len(fixtures)}), flush=True)
    compile_result = run('compile', ['npm', 'run', 'typecheck'], REPO)
    write('commands.json', COMMANDS)
    if compile_result['exit'] == 0:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            pending = [pool.submit(run, group, ['npm', 'exec', '--', 'vitest', 'run', '--reporter=verbose', '--reporter=json', '--outputFile=' + str(EVIDENCE / (group + '.vitest.json'))], REPO / 'packages' / package) for group, package in [('ui', 'ui'), ('cli', 'cli')]]
            for handle in pending:
                handle.result()
        write('commands.json', COMMANDS)
        groups = {}
        for group in ['ui', 'cli']:
            raw = json.loads((EVIDENCE / (group + '.vitest.json')).read_text())
            assertions = [a for result in raw['testResults'] for a in result['assertionResults']]
            groups[group] = {'total': len(assertions), 'passed': sum(a['status'] == 'passed' for a in assertions), 'failed': sum(a['status'] == 'failed' for a in assertions), 'pending': sum(a['status'] == 'pending' for a in assertions), 'assertions': assertions}
            assert len(assertions) == raw['numTotalTests']
            print(json.dumps({'group': group, **{k: v for k, v in groups[group].items() if k != 'assertions'}}), flush=True)
        write('named-results.json', groups)
finally:
    for item in fixtures:
        dst = REPO / item['destination']
        assert sha(dst.read_bytes()) == item['sha256']
        dst.unlink()
    after = inventory()
    write('tracked-after.json', after)
    assert initial == after
    assert git('status', '--porcelain', '--untracked-files=all') == b''
    assert git('rev-parse', 'HEAD').decode().strip() == HEAD
    write('restoration.json', {'head': HEAD, 'trackedFileCount': len(initial), 'trackedInitialEqualsFinal': True, 'status': '', 'privateFixtureCountRemoved': len(fixtures), 'trackedDiff': git('diff', '--name-only', 'HEAD').decode()})
    entries = {str(path.relative_to(EVIDENCE)): {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size} for path in sorted(EVIDENCE.rglob('*')) if path.is_file()}
    write('manifest.json', entries)
    print(json.dumps({'evidence': str(EVIDENCE), 'manifestCount': len(entries), 'manifestSha256': sha((EVIDENCE / 'manifest.json').read_bytes())}), flush=True)
