import datetime
import hashlib
import json
import pathlib
import subprocess
import tempfile

repo = pathlib.Path('/tmp/artroom-planner-ui-4567-ajquzk40/repo')
head = 'c74f36965cc90049ad8fc44256a94974de5deb81'
src = pathlib.Path('/tmp/artroom-planner-journal-kind.test.ts')
dst = repo / 'packages/cli/test/planner-journal-kind.test.ts'
bundle = pathlib.Path(tempfile.mkdtemp(prefix='artroom-planner-c74-journal-kind-'))
commands = []
sha = lambda data: hashlib.sha256(data).hexdigest()
git = lambda *a: subprocess.check_output(['git', *a], cwd=repo)

def inventory():
    return {p: sha((repo / p).read_bytes()) for p in git('ls-files', '-z').decode().split('\0') if p}

def write(name, value):
    (bundle / name).write_text(json.dumps(value, indent=2) + '\n')

def run(name, args, cwd):
    record = {'name': name, 'args': args, 'cwd': str(cwd), 'start': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with (bundle / (name + '.log')).open('w') as out:
        record['exit'] = subprocess.run(args, cwd=cwd, stdout=out, stderr=subprocess.STDOUT).returncode
    record['end'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    commands.append(record)
    write('commands.json', commands)
    print(json.dumps(record), flush=True)
    return record['exit']

assert git('rev-parse', 'HEAD').decode().strip() == head
assert git('status', '--porcelain', '--untracked-files=all') == b''
assert not dst.exists()
before = inventory()
write('tracked-before.json', before)
data = src.read_bytes()
(bundle / 'fixture.test.ts').write_bytes(data)
(bundle / 'runner.py').write_bytes(pathlib.Path(__file__).read_bytes())
write('setup.json', {'head': head, 'tree': git('rev-parse', 'HEAD^{tree}').decode().strip(), 'fixtureSha256': sha(data), 'fixtureBytes': len(data), 'fixtureLines': data.count(b'\n'), 'trackedFiles': len(before), 'runtimeScope': 'four actual CLI/FakeRoom cases; no production Room authority'})
dst.write_bytes(data)
print(json.dumps({'bundle': str(bundle), 'head': head, 'fixtureSha256': sha(data)}), flush=True)
try:
    if run('compile', ['npm', 'run', 'typecheck'], repo) == 0:
        run('runtime', ['npm', 'exec', '--', 'vitest', 'run', 'test/planner-journal-kind.test.ts', '--reporter=verbose', '--reporter=json', '--outputFile=' + str(bundle / 'runtime.vitest.json')], repo / 'packages/cli')
        raw = json.loads((bundle / 'runtime.vitest.json').read_text())
        actual = [a for suite in raw['testResults'] for a in suite['assertionResults']]
        result = {'total': len(actual), 'passed': sum(a['status'] == 'passed' for a in actual), 'failed': sum(a['status'] == 'failed' for a in actual), 'pending': sum(a['status'] == 'pending' for a in actual), 'assertions': actual}
        write('named-results.json', result)
        print(json.dumps({k: v for k, v in result.items() if k != 'assertions'}), flush=True)
finally:
    assert dst.read_bytes() == data
    dst.unlink()
    after = inventory()
    write('tracked-after.json', after)
    assert before == after and git('status', '--porcelain', '--untracked-files=all') == b''
    write('restoration.json', {'head': git('rev-parse', 'HEAD').decode().strip(), 'trackedFiles': len(before), 'initialEqualsFinal': True, 'status': '', 'fixtureRemoved': True})
    manifest = {str(p.relative_to(bundle)): {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in sorted(bundle.iterdir()) if p.is_file()}
    write('manifest.json', manifest)
    print(json.dumps({'bundle': str(bundle), 'manifestCount': len(manifest), 'manifestSha256': sha((bundle / 'manifest.json').read_bytes())}), flush=True)
