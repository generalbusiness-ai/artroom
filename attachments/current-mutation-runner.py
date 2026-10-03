#!/usr/bin/env python3
"""Declared acts stage 2 mutation runner (request fd6f00b6).

For each mutant: check its text occurs exactly once, write the mutated file,
run the test sets, collect failing tests from the JSON reports, and write the
file's original bytes back. It never runs git checkout. Results go to
results.json, one record per mutant, as they finish.
"""
import gzip, hashlib, json, os, re, signal, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
MUTANTS = importlib.import_module(os.environ.get("MUT_INVENTORY", "inventory")).MUTANTS
ROOT = os.environ.get("MUT_ROOT", "/Users/hughpyle/play/artroom-worktrees/decl-stage2/packages")
OUT = os.path.join(HERE, os.environ.get("MUT_OUT", "results.json"))
SETS = [
    ("policy", "policy", ["npx", "vitest", "run", "--config", "vitest.config.ts", "test/vocabulary.test.ts", "test/declared-acts.test.ts"]),
    ("room-node", "room", ["npx", "vitest", "run", "--config", "vitest.node.config.ts", "test/node/declared-equivalence.test.ts", "test/node/schema.test.ts"]),
    ("room-legacy", "room", ["npx", "vitest", "run", "--config", "vitest.workers.config.ts"]),
    ("room-declared", "room", ["npx", "vitest", "run", "--config", "vitest.workers.declared.config.ts"]),
    ("checkers", "checkers", ["npx", "vitest", "run", "--config", "vitest.config.ts", "test/checkers.test.ts"]),
]

MESSAGES = {}

def typecheck():
    """The whole workspace's source and test typecheck (root `npm run typecheck`) with the mutant applied: exit code and its error lines."""
    p = subprocess.run(["npm", "run", "typecheck"], cwd=os.path.dirname(ROOT), capture_output=True, text=True, timeout=900)
    keep("typecheck.console.txt", f"$ npm run typecheck\nexit {p.returncode}\n--- stdout\n{p.stdout}\n--- stderr\n{p.stderr}")
    errors = [l for l in (p.stdout + p.stderr).splitlines() if "error TS" in l]
    return p.returncode, errors

def git(*args):
    return subprocess.run(["git", *args], cwd=os.path.dirname(ROOT), capture_output=True, text=True).stdout.strip()

def stop(*_):
    raise KeyboardInterrupt
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

# This stage's guard tests live in files named declared-guards-*: the node and policy sets take them all.
import glob as _glob
def _more(pkg, pattern):
    return sorted(os.path.relpath(p, os.path.join(ROOT, pkg)) for p in _glob.glob(os.path.join(ROOT, pkg, pattern)))
SETS = [(n, p, c + (_more(p, "test/declared-guards-*.test.ts") if n in ("policy", "checkers") else _more(p, "test/node/declared-guards-*.test.ts") if n == "room-node" else [])) for n, p, c in SETS]
if os.environ.get("MUT_QUICK"):
    # A pre-flight, never the evidence: this stage's own test files only.
    OWN = ["test/workerd/declared-fd6f00b6.test.ts", "test/workerd/declared-audit-fd6f00b6.test.ts", "test/workerd/declared-audit2-fd6f00b6.test.ts", "test/workerd/declared-rows-fd6f00b6.test.ts"]
    OWN += [f for f in _more("room", "test/workerd/declared-guards-*.test.ts") if f not in OWN]
    OWN += [f for f in os.environ.get("MUT_EXTRA_WORKERD", "").split() if f not in OWN]
    SETS = [s if s[0] != "room-legacy" else (s[0], s[1], s[2] + OWN) for s in SETS if s[0] != "room-declared"]
    SETS = [s if s[0] != "room-node" else (s[0], s[1], s[2] + os.environ.get("MUT_EXTRA_NODE", "").split()) for s in SETS]
    SETS = [s if s[0] != "policy" else (s[0], s[1], s[2] + os.environ.get("MUT_EXTRA_POLICY", "").split()) for s in SETS]

KEEP = os.path.join(HERE, os.environ.get("MUT_KEEP", f"kept-{os.environ.get('MUT_TAG', 'a')}"))
CURRENT = {"dir": None}

def keep(name, text):
    """Keep one output of the current mutant, whole, gzipped: kept-<tag>/<mutant>/<name>.gz."""
    os.makedirs(CURRENT["dir"], exist_ok=True)
    with gzip.open(os.path.join(CURRENT["dir"], name + ".gz"), "wt") as f:
        f.write(text)

def run_set(name, pkg, cmd):
    report = os.path.join(HERE, f"report-{os.environ.get('MUT_TAG', 'a')}-{name}.json")
    if os.path.exists(report):
        os.remove(report)
    p = subprocess.run(cmd + ["--reporter=json", f"--outputFile={report}"], cwd=os.path.join(ROOT, pkg), capture_output=True, text=True, timeout=900)
    keep(f"{name}.console.txt", f"$ {' '.join(cmd)}\nexit {p.returncode}\n--- stdout\n{p.stdout}\n--- stderr\n{p.stderr}")
    failed = []
    if not os.path.exists(report):
        return [f"{name}: no report (exit {p.returncode})"]
    keep(f"{name}.report.json", open(report).read())
    data = json.load(open(report))
    for f in data.get("testResults", []):
        if f.get("status") == "failed" and not f.get("assertionResults"):
            failed.append(f"{name}: {os.path.basename(f['name'])} failed to load")
        for a in f.get("assertionResults", []):
            if a.get("status") == "failed":
                msg = " ".join(a.get("failureMessages") or [])
                timed = " [TIMEOUT]" if "Test timed out" in msg else ""
                key = f"{name}: {os.path.basename(f['name'])} > {a.get('fullName') or a.get('title')}{timed}"
                failed.append(key)
                MESSAGES[key] = msg.strip()
    if p.returncode != 0 and not failed:
        failed.append(f"{name}: exit {p.returncode} with no failed test")
    return failed

def main():
    only = set(sys.argv[1:])
    global HEAD, TREE
    HEAD, TREE = git("rev-parse", "HEAD"), git("rev-parse", "HEAD^{tree}")
    assert git("status", "--porcelain") == "", "the worktree must be clean at the start"
    print("head", HEAD, "tree", TREE, flush=True)
    done = {}
    if os.path.exists(OUT):
        done = {r["id"]: r for r in json.load(open(OUT))}
    part = os.environ.get("MUT_PART")
    for index, (mid, f, old, new) in enumerate(MUTANTS):
        if part and index % int(part.split("/")[1]) != int(part.split("/")[0]):
            continue
        if only and mid not in only:
            continue
        if mid in done and not only:
            continue
        path = os.path.join(ROOT, f)
        original = open(path, "rb").read()
        text = original.decode()
        assert text.count(old) == 1, (mid, text.count(old))
        t0 = time.time()
        try:
            open(path, "w").write(text.replace(old, new))
            failed = []
            MESSAGES.clear()
            CURRENT["dir"] = os.path.join(KEEP, re.sub(r"[^A-Za-z0-9._-]", "_", mid))
            tsc, tsc_errors = typecheck()
            for name, pkg, cmd in SETS:
                failed += run_set(name, pkg, cmd)
        finally:
            open(path, "wb").write(original)
        restored = hashlib.sha256(open(path, "rb").read()).hexdigest() == hashlib.sha256(original).hexdigest()
        done[mid] = {"id": mid, "file": f, "old": old, "new": new, "head": HEAD, "tree": TREE, "original_sha256": hashlib.sha256(original).hexdigest(), "mutated_sha256": hashlib.sha256(text.replace(old, new).encode()).hexdigest(),
                     "restored": restored, "status_after": git("status", "--porcelain"), "typecheck_exit": tsc, "typecheck_errors": tsc_errors, "failed": failed, "messages": dict(MESSAGES), "seconds": round(time.time() - t0)}
        json.dump(list(done.values()), open(OUT, "w"), indent=1)
        print(f"{mid}: {len(failed)} red, typecheck {tsc} ({round(time.time() - t0)} s)", flush=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout
    print("git status --porcelain:", repr(st))

main()
