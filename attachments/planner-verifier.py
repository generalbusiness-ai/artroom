import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import tarfile

bundle = pathlib.Path('/tmp/artroom-checker-stage2-35797-evidence-c9ICmd')
initial = json.loads((bundle / 'initial-clean-proof.json').read_text())
repo = pathlib.Path(initial['clone'])
head = '35797f844b55fea9439ac852451fd062c5177b73'
git = lambda *a: subprocess.check_output(['git', *a], cwd=repo)

def digest(stream):
    h = hashlib.sha256()
    while block := stream.read(1024 * 1024):
        h.update(block)
    return h.hexdigest()

def file_digest(path):
    with path.open('rb') as stream:
        return digest(stream)

manifest = (bundle / 'SHA256SUMS').read_text().splitlines()
for line in manifest:
    expected, name = line.split('  ', 1)
    assert file_digest(bundle / name) == expected, name
assert len(manifest) == 47
print(json.dumps({'manifestEntriesVerified': len(manifest)}), flush=True)
assert git('rev-parse', 'HEAD').decode().strip() == head
assert git('rev-parse', 'HEAD^{tree}').decode().strip() == '8fb4596b51019f4ae60412e5f929af081e73d6b5'
assert git('status', '--porcelain', '--untracked-files=all') == b''
assert git('diff', 'HEAD', '--') == b''
assert initial['rootTrackedObjects'] == git('ls-tree', '-r', head).decode()
entries = []
for raw in git('ls-tree', '-rz', '--full-tree', head).split(b'\0'):
    if not raw:
        continue
    meta, path = raw.split(b'\t', 1)
    mode, kind, oid = meta.split()
    assert kind == b'blob'
    entries.append((path.decode(), oid.decode()))
payload = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=repo, input=''.join(oid + '\n' for _, oid in entries).encode())
position = 0
blobs = {}
for path, oid in entries:
    nl = payload.index(b'\n', position)
    meta = payload[position:nl].split()
    assert meta[0].decode() == oid and meta[1] == b'blob'
    size = int(meta[2]); start = nl + 1
    data = payload[start:start + size]
    assert payload[start + size:start + size + 1] == b'\n'
    position = start + size + 1
    assert (repo / path).read_bytes() == data, path
    blobs[path] = data
assert position == len(payload) and len(blobs) == 700
source_members = set()
with tarfile.open(bundle / 'exact-source.tar', mode='r|') as archive:
    for member in archive:
        if member.isfile():
            assert archive.extractfile(member).read() == blobs[member.name], member.name
            source_members.add(member.name)
assert source_members == set(blobs)
print(json.dumps({'trackedAndArchivedSourceFilesVerified': len(blobs)}), flush=True)
dependencies = json.loads((bundle / 'dependency-byte-index.json').read_text())['files']
for path, info in dependencies.items():
    current = repo / path
    if info['type'] == 'symlink':
        assert current.is_symlink() and os.readlink(current) == info['target'], path
    else:
        assert current.stat().st_size == info['bytes'] and file_digest(current) == info['sha256'], path
    assert oct(current.lstat().st_mode & 0o7777) == info['mode'], path
archived = set()
with tarfile.open(bundle / 'exact-dependencies.tar.gz', mode='r|gz') as archive:
    for member in archive:
        if member.isfile():
            assert member.size == dependencies[member.name]['bytes']
            assert digest(archive.extractfile(member)) == dependencies[member.name]['sha256'], member.name
            archived.add(member.name)
        elif member.issym():
            assert member.linkname == dependencies[member.name]['target'], member.name
            archived.add(member.name)
        elif member.islnk():
            assert dependencies[member.name]['sha256'] == dependencies[member.linkname]['sha256'], member.name
            archived.add(member.name)
assert archived == set(dependencies) and len(archived) == 20231
generated = json.loads((bundle / 'generated-artifacts-index.json').read_text())
generated_members = set()
with tarfile.open(bundle / 'generated-build-artifacts.tar', mode='r|') as archive:
    for member in archive:
        if member.isfile():
            assert archive.extractfile(member).read() == (repo / member.name).read_bytes(), member.name
            generated_members.add(member.name)
assert generated_members == set(generated['files']) and len(generated_members) == 53 and generated['generatedImages'] == []
print(json.dumps({'dependencyEntriesVerifiedCurrentAndArchive': len(archived), 'generatedFilesVerified': len(generated_members)}), flush=True)
compiler = json.loads((bundle / 'root-typecheck.meta.json').read_text())
assert compiler['exit'] == 0
index = json.loads((bundle / 'actual-test-names.json').read_text())['rows']
rows = []
scopes = []
for label in ['checker-f', 'policy-e-node', 'room-node-a-b-e', 'policy-e-workerd', 'room-workerd-c-d-e-f-audit2', 'room-migration-focused']:
    meta = json.loads((bundle / (label + '.meta.json')).read_text())
    assert meta['exit'] == 0 and compiler['utcEnd'] < meta['utcStart']
    raw = json.loads((bundle / (label + '.raw.json')).read_text())
    count = {'passed': 0, 'pending': 0, 'skipped': 0, 'failed': 0}
    for suite in raw['testResults']:
        path = str(pathlib.Path(suite['name']).resolve().relative_to(repo.resolve()))
        for actual in suite['assertionResults']:
            row = {'run': label, 'file': path, 'status': actual['status'], 'fullName': actual['fullName'], 'title': actual['title'], 'ancestorTitles': actual['ancestorTitles'], 'durationMs': actual.get('duration'), 'failureMessages': actual['failureMessages']}
            if label == 'room-migration-focused' and actual['status'] == 'skipped':
                row['exclusion'] = 'not selected by --testNamePattern=migration 4'
            rows.append(row)
            count[actual['status']] += 1
            assert actual['failureMessages'] == []
    assert sum(count.values()) == raw['numTotalTests']
    scopes.append({'run': label, 'actualFiles': len(raw['testResults']), **count})
assert sorted(rows, key=lambda r: (r['run'], r['file'], r['fullName'])) == sorted(index, key=lambda r: (r['run'], r['file'], r['fullName']))
assert len(rows) == 393
passed = [r for r in rows if r['status'] == 'passed']
nonselected = [r for r in rows if r['status'] == 'skipped']
assert len(passed) == 344 and len(nonselected) == 49 and all(r['run'] == 'room-migration-focused' for r in nonselected)
distinct = len({(r['file'], r['fullName']) for r in passed})
assert distinct == 317
proof = {'verifiedBy': 'planner', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'bundle': str(bundle), 'head': head, 'tree': '8fb4596b51019f4ae60412e5f929af081e73d6b5', 'manifestCount': 47, 'manifestSha256': file_digest(bundle / 'SHA256SUMS'), 'immutableTrackedAndArchivedSourceCount': len(blobs), 'currentAndArchivedDependencyCount': len(archived), 'generatedIgnoredFiles': len(generated_members), 'compilerExit': 0, 'compilerEnd': compiler['utcEnd'], 'allSixRuntimeStartsAfterCompiler': True, 'scopes': scopes, 'actualAssertionRows': len(rows), 'allActualRowsMatchIndex': True, 'passingExecutions': len(passed), 'distinctPassedFileAndName': distinct, 'migrationNameFilterNonselections': len(nonselected), 'sourceEdits': 0, 'newSemanticExecutions': 0, 'cloneStatus': '', 'initialProofScope': 'pre-install clean status/diff and Git object inventory; no pre-install per-file SHA256 inventory', 'noMutationOrWholeStageCredit': True}
pathlib.Path('/tmp/artroom-planner-stage2-357-checker-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof, indent=2), flush=True)
