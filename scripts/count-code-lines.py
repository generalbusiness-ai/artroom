"""Count physical lines in tracked code at one exact Git commit; no checkout edits."""
from collections import defaultdict
import json
import re
import subprocess
import sys

repo, ref = sys.argv[1:3]
git = lambda *args: subprocess.check_output(['git', *args], cwd=repo)
head = git('rev-parse', ref).decode().strip()
extensions = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sh')
totals = defaultdict(lambda: {'files': 0, 'physicalLines': 0})
for record in git('ls-tree', '-rz', head).split(b'\0'):
    if not record:
        continue
    metadata, raw_path = record.split(b'\t', 1)
    mode, kind, blob = metadata.decode().split()
    path = raw_path.decode()
    if kind != 'blob' or not path.endswith(extensions):
        continue
    text = git('cat-file', 'blob', blob).decode('utf-8')
    lines = len(text.splitlines())
    category = ('generated' if '/browser-build/' in path or '/dist/' in path or '/deploy/assets/' in path or path.endswith('/assets.ts') or path.endswith('-assets.ts')
                else 'tests' if re.search(r'(^|/)(test|tests)/|\.(test|spec)\.', path)
                else 'tooling' if path.startswith('scripts/')
                else 'source')
    for key in ['all', category]:
        totals[key]['files'] += 1
        totals[key]['physicalLines'] += lines
print(json.dumps({'head': head, 'method': 'Tracked UTF-8 files; physical lines including comments and blanks; extensions ' + ', '.join(extensions), 'counts': totals}, indent=2))
