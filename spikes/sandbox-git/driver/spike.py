#!/usr/bin/env python3
"""Measurement driver for the sandbox-git spike.

  python3 driver/spike.py setup     # create Artifacts repos and push test branches
  python3 driver/spike.py measure   # cold, warm, land, refusals, races
  python3 driver/spike.py iso       # the same checks against the isomorphic-git Worker
  python3 driver/spike.py cleanup   # destroy sandboxes, revoke repo tokens

Environment:
  SPIKE_URL       Worker URL (default https://artroom-spike-sandbox-git.inguz.workers.dev)
  ISO_URL         isomorphic-git Worker URL (default https://artroom-spike-isogit.inguz.workers.dev)
  SPIKE_KEY_FILE  file holding the Worker's SPIKE_KEY secret (required)
  SPIKE_STATE     state file with repo tokens (default driver/.state.json, git-ignored)
  RUNS            runs per measurement (default 10)

Repo tokens live in the state file (mode 600) and in request bodies only.
Nothing here prints them: every printed or saved string passes through redact().
REST calls use hugh's wrangler OAuth token; run `npx wrangler whoami` first.
"""
import json, os, re, statistics, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ACCT = "6e953d231f1c9aadffbf59537a82e13a"
NS = "gitseq-spike"
URL = os.environ.get("SPIKE_URL", "https://artroom-spike-sandbox-git.inguz.workers.dev")
ISO_URL = os.environ.get("ISO_URL", "https://artroom-spike-isogit.inguz.workers.dev")
STATE = os.environ.get("SPIKE_STATE", os.path.join(HERE, ".state.json"))
RUNS = int(os.environ.get("RUNS", "10"))
UA = "artroom-spike/1.0"
TOKEN_RE = re.compile(r"art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?")


def redact(s):
    return TOKEN_RE.sub("<token>", s if isinstance(s, str) else json.dumps(s))


def log(*a):
    print(redact(" ".join(str(x) for x in a)), flush=True)


# ------------------------------------------------------------- Cloudflare REST
def oauth():
    with open(os.path.expanduser("~/Library/Preferences/.wrangler/config/default.toml")) as f:
        for line in f:
            if line.startswith("oauth_token = "):
                return line.split('"')[1]
    raise RuntimeError("no oauth token; run npx wrangler whoami")


def art(method, path, body=None):
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/artifacts/namespaces/{NS}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + oauth(), "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


def create_repo(name):
    for attempt in range(6):
        r = art("POST", "/repos", {"name": name, "default_branch": "main"})
        if r.get("success"):
            return {"name": name, "remote": r["result"]["remote"], "token": r["result"]["token"],
                    "create_attempts": attempt + 1}
        log(f"create {name} attempt {attempt + 1}: {r.get('errors')}")
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"create {name} failed")


# ------------------------------------------------------------- local git
def git(*args, cwd=None, token=None, check=True):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_AUTHOR_NAME="spike", GIT_AUTHOR_EMAIL="spike@invalid",
               GIT_COMMITTER_NAME="spike", GIT_COMMITTER_EMAIL="spike@invalid")
    if token:
        env.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="http.extraHeader",
                   GIT_CONFIG_VALUE_0="Authorization: Bearer " + token)
    p = subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True, timeout=600)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {args[0]}: {redact(p.stderr)[-800:]}")
    return p.stdout.strip()


def write(root, path, text):
    full = os.path.join(root, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(text)


def lines(tag, n=40):
    return "".join(f"{tag} line {i}\n" for i in range(1, n + 1))


def edit_line(root, path, i, text):
    full = os.path.join(root, path)
    ls = open(full).read().splitlines(keepends=True)
    ls[i - 1] = text + "\n"
    open(full, "w").write("".join(ls))


def branch_from(w, start, name, changes, msg):
    git("checkout", "-q", "-B", name, start, cwd=w)
    changes(w)
    git("add", "-A", cwd=w)
    git("commit", "-q", "-m", msg, cwd=w)


def build_small(w, races):
    """Small repo: previews on preview-base, lands on main."""
    git("init", "-q", "-b", "main", w)
    for f in ("a.txt", "b.txt", "c.txt"):
        write(w, f, lines(f))
    write(w, "README.md", "Spike repo.\n")
    git("add", "-A", cwd=w)
    git("commit", "-q", "-m", "Base", cwd=w)
    base = git("rev-parse", "HEAD", cwd=w)

    def main_side(r):
        edit_line(r, "a.txt", 20, "a.txt line 20 changed on main")
        edit_line(r, "c.txt", 10, "c.txt line 10 changed on main")
    branch_from(w, base, "preview-base", main_side, "Main moves on a and c")
    branch_from(w, base, "cand/clean", lambda r: edit_line(r, "b.txt", 5, "b.txt line 5 from candidate"),
                "Candidate edits b")

    def conflict_side(r):
        edit_line(r, "a.txt", 20, "a.txt line 20 from candidate")
        edit_line(r, "c.txt", 10, "c.txt line 10 from candidate")
    branch_from(w, base, "cand/conflict", conflict_side, "Candidate edits a and c")
    for i in range(1, RUNS + 3):
        branch_from(w, base, f"land/{i:02d}", lambda r, i=i: write(r, f"lanes/{i:02d}.txt", f"lane {i}\n"),
                    f"Lane {i}")
    for i in range(1, races + 1):
        for side in "ab":
            branch_from(w, base, f"race/{i:02d}-{side}",
                        lambda r, i=i, side=side: write(r, f"race/{i:02d}-{side}.txt", f"race {i} {side}\n"),
                        f"Race {i} {side}")
    git("checkout", "-q", "main", cwd=w)


def build_medium(w):
    """Medium repo: 2,000 files (about 10 MB) and 30 commits of history."""
    git("init", "-q", "-b", "main", w)
    blob = "".join(f"filler {j:04d} " + "x" * 60 + "\n" for j in range(70))  # ~5 KB
    for d in range(50):
        for f in range(40):
            write(w, f"pkg{d:02d}/file{f:02d}.txt", f"pkg{d} file{f}\n" + blob)
    git("add", "-A", cwd=w)
    git("commit", "-q", "-m", "Base", cwd=w)
    for c in range(29):
        for f in range(50):
            p = os.path.join(w, f"pkg{(c + f) % 50:02d}/file{f % 40:02d}.txt")
            with open(p, "a") as fh:
                fh.write(f"history commit {c} touch {f}\n")
        git("commit", "-q", "-am", f"History {c}", cwd=w)
    base = git("rev-parse", "HEAD", cwd=w)
    branch_from(w, base, "preview-base", lambda r: edit_line(r, "pkg00/file00.txt", 3, "main edit"), "Main moves")
    branch_from(w, base, "cand/clean", lambda r: edit_line(r, "pkg01/file00.txt", 3, "candidate edit"),
                "Candidate edit")

    def conflict_side(r):
        edit_line(r, "pkg00/file00.txt", 3, "candidate conflicting edit")
    branch_from(w, base, "cand/conflict", conflict_side, "Candidate conflicts")
    git("checkout", "-q", "main", cwd=w)


def setup():
    state = load() if os.path.exists(STATE) else {"run": time.strftime("%m%d%H%M"), "repos": {}}
    run_id = state["run"]
    races = 2 * RUNS
    for kind, build in (("small", lambda w: build_small(w, races)), ("medium", build_medium)):
        if state["repos"].get(kind, {}).get("branches"):
            continue  # already created and pushed
        repo = state["repos"].get(kind) or create_repo(f"artroom-sbx-{kind}-{run_id}")
        state["repos"][kind] = repo
        save(state)
        with tempfile.TemporaryDirectory() as tmp:
            w = os.path.join(tmp, "w")
            build(w)
            t = time.time()
            git("push", "-q", repo["remote"], "--all", cwd=w, token=repo["token"])
            repo["push_s"] = round(time.time() - t, 1)
            repo["branches"] = len(git("branch", "--format=%(refname)", cwd=w).splitlines())
        save(state)
        log(f"{repo['name']}: {repo['branches']} branches pushed in {repo['push_s']} s "
            f"(create attempts {repo['create_attempts']})")


def save(state):
    old = os.umask(0o077)
    try:
        with open(STATE, "w") as f:
            json.dump(state, f)
    finally:
        os.umask(old)


def load():
    with open(STATE) as f:
        return json.load(f)


# ------------------------------------------------------------- Worker calls
def key():
    with open(os.environ["SPIKE_KEY_FILE"]) as f:
        return f.read().strip()


def call(body, url=None):
    req = urllib.request.Request((url or URL) + "/op", data=json.dumps(body).encode(), method="POST", headers={
        "x-spike-key": key(), "Content-Type": "application/json", "User-Agent": UA})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        out = {"ok": False, "http": e.code, "error": redact(e.read().decode()[-500:])}
    except Exception as e:  # noqa: BLE001 - a spike records every failure
        out = {"ok": False, "error": redact(str(e))}
    out["clientMs"] = round((time.time() - t) * 1000)
    return json.loads(redact(out))


def op(repo, op_name, box, **kw):
    return call({"op": op_name, "box": box, "remote": repo["remote"], "token": repo["token"], **kw})


def ls_remote(repo, ref):
    out = git("ls-remote", repo["remote"], ref, cwd=HERE, token=repo["token"])
    return out.split()[0] if out else None


def stats(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return {"n": 0}
    return {"n": len(xs), "p50": round(statistics.median(xs)), "max": round(max(xs)), "min": round(min(xs))}


def summarize(rows, fields=("clientMs", "workerMs", "timing.totalMs", "timing.startMs",
                            "timing.fetchMs", "timing.mergeMs", "timing.pushMs")):
    def get(r, f):
        cur = r
        for part in f.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        return cur
    return {f: stats([get(r, f) for r in rows]) for f in fields if any(get(r, f) is not None for r in rows)}


# ------------------------------------------------------------- measurements
def measure():
    st = load()
    small, medium = st["repos"]["small"], st["repos"]["medium"]
    run = st["run"] + "-" + time.strftime("%H%M%S")
    res = {"run": run, "url": URL, "runs": RUNS, "started": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    boxes = []

    def cold(label, repo, instance=None):
        rows = []
        for i in range(RUNS):
            box = f"cold-{label}-{run}-{i}".replace(":", "")
            boxes.append(box)
            kw = {"base": "preview-base", "head": "cand/clean"}
            if instance:
                kw["instance"] = instance
            r = op(repo, "preview", box, **kw)
            rows.append(r)
            log(f"cold {label} {i}: ok={r.get('ok')} clean={r.get('clean')} client={r['clientMs']} "
                f"timing={r.get('timing')} err={r.get('error')} {r.get('detail', '')}")
            call({"op": "destroy", "box": box})
        return {"summary": summarize(rows), "rows": rows}

    res["cold_small_default"] = cold("sd", small)
    res["cold_small_standard1"] = cold("s1", small, "standard-1")
    res["cold_medium_default"] = cold("md", medium)

    def warm(label, repo):
        box = f"warm-{label}-{run}"
        boxes.append(box)
        first = op(repo, "preview", box, base="preview-base", head="cand/clean")
        log(f"warm {label} first: {first.get('timing')}")
        out = {"first": first}
        for head in ("cand/clean", "cand/conflict"):
            rows = []
            for i in range(RUNS):
                r = op(repo, "preview", box, base="preview-base", head=head)
                rows.append(r)
                log(f"warm {label} {head} {i}: clean={r.get('clean')} conflicts={r.get('conflicts')} "
                    f"client={r['clientMs']} timing={r.get('timing')} err={r.get('error')}")
            out[head] = {"summary": summarize(rows), "rows": rows}
        return out

    res["warm_small"] = warm("s", small)
    res["warm_medium"] = warm("m", medium)

    # Lands: each lands land/NN into main with the lease set to the main it expects.
    box = f"land-{run}"
    boxes.append(box)
    main = ls_remote(small, "refs/heads/main")
    first = op(small, "preview", box, base="main", head="land/01")  # warm the box and its clone
    rows = []
    for i in range(1, RUNS + 1):
        r = op(small, "land", box, base="main", head=f"land/{i:02d}", expect=main)
        rows.append(r)
        log(f"land {i}: landed={r.get('landed')} refused={r.get('refused')} client={r['clientMs']} "
            f"timing={r.get('timing')} err={r.get('error')} {r.get('pushErr', '')[-200:]}")
        if r.get("landed"):
            main = r["commit"]
    remote_main = ls_remote(small, "refs/heads/main")
    res["land"] = {"summary": summarize(rows), "rows": rows, "warmup": first,
                   "remote_main_matches_last_land": remote_main == main}

    # Refusals: a conflicting candidate, and a stale expectation of main.
    conflict = op(small, "land", box, base="preview-base", head="cand/conflict")
    stale = op(small, "land", box, base="main", head=f"land/{RUNS + 1:02d}", expect=rows[0]["baseSha"])
    after = ls_remote(small, "refs/heads/main")
    res["refusals"] = {"conflict": conflict, "stale_expect": stale, "main_unchanged": after == main}
    log(f"refuse conflict: landed={conflict.get('landed')} refused={conflict.get('refused')} "
        f"conflicts={conflict.get('conflicts')}")
    log(f"refuse stale: landed={stale.get('landed')} refused={stale.get('refused')} main unchanged={after == main}")

    # Races: two sandboxes land different candidates onto the same expected main.
    ra, rb = f"race-a-{run}", f"race-b-{run}"
    boxes += [ra, rb]
    op(small, "preview", ra, base="main", head="race/01-a")
    op(small, "preview", rb, base="main", head="race/01-b")
    races = []
    for i in range(1, 2 * RUNS + 1):
        synced = i <= RUNS  # first half: both push at the same instant; second half: fire and go
        expect = ls_remote(small, "refs/heads/main")
        kw = {"base": "main", "expect": expect}
        if synced:
            kw["pushAt"] = int(time.time() * 1000) + 4000
        out = {}

        def go(side, b):
            out[side] = op(small, "land", b, head=f"race/{i:02d}-{side}", **kw)
        ts = [threading.Thread(target=go, args=(s, b)) for s, b in (("a", ra), ("b", rb))]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        final = ls_remote(small, "refs/heads/main")
        winners = [s for s in "ab" if out[s].get("landed")]
        row = {"i": i, "synced": synced, "winners": winners,
               "main_is_winner": len(winners) == 1 and final == out[winners[0]]["commit"],
               "a": {k: out["a"].get(k) for k in ("landed", "refused", "pushOut", "pushErr", "timing", "error")},
               "b": {k: out["b"].get(k) for k in ("landed", "refused", "pushOut", "pushErr", "timing", "error")}}
        races.append(row)
        loser = "b" if winners == ["a"] else "a"
        log(f"race {i} synced={synced}: winners={winners} main_is_winner={row['main_is_winner']} "
            f"loser_refused={out[loser].get('refused')} loser_push={out[loser].get('pushOut', '')[-160:]!r} "
            f"loser_err={out[loser].get('pushErr', '')[-160:]!r}")
    res["races"] = races
    res["boxes"] = boxes
    res["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    path = os.path.join(HERE, "results", f"{run}.raw.json")
    with open(path, "w") as f:
        f.write(redact(json.dumps(res, indent=1)))
    summary = {k: (v.get("summary") if isinstance(v, dict) and "summary" in v else None)
               for k, v in res.items()}
    summary["warm_small"] = {h: res["warm_small"][h]["summary"] for h in ("cand/clean", "cand/conflict")}
    summary["warm_medium"] = {h: res["warm_medium"][h]["summary"] for h in ("cand/clean", "cand/conflict")}
    summary["races"] = {
        "synced": [len(r["winners"]) for r in races if r["synced"]],
        "unsynced": [len(r["winners"]) for r in races if not r["synced"]],
        "all_main_is_winner": all(r["main_is_winner"] for r in races)}
    summary["refusals"] = {"conflict": res["refusals"]["conflict"].get("refused"),
                           "stale": res["refusals"]["stale_expect"].get("refused"),
                           "main_unchanged": res["refusals"]["main_unchanged"]}
    summary["land_remote_main_matches"] = res["land"]["remote_main_matches_last_land"]
    summary = {k: v for k, v in summary.items() if v is not None}
    with open(os.path.join(HERE, "results", f"{run}.summary.json"), "w") as f:
        f.write(redact(json.dumps(summary, indent=1)))
    log(json.dumps(summary, indent=1))
    log("raw results:", path)


def iso():
    """isomorphic-git in a plain Worker: previews, lands and unsynchronised races."""
    st = load()
    small, medium = st["repos"]["small"], st["repos"]["medium"]
    run = st["run"] + "-iso-" + time.strftime("%H%M%S")
    names = [f"iso/{run[-6:]}-{i:02d}" for i in range(1, RUNS + 1)]
    races = [(f"isorace/{run[-6:]}-{i:02d}-a", f"isorace/{run[-6:]}-{i:02d}-b") for i in range(1, RUNS + 1)]
    with tempfile.TemporaryDirectory() as tmp:  # new candidates, each from the original base
        w = os.path.join(tmp, "w")
        git("init", "-q", w)
        git("fetch", "-q", small["remote"], "refs/heads/land/01:refs/heads/land01", cwd=w, token=small["token"])
        base = git("rev-parse", "land01^", cwd=w)
        for n in names + [b for pair in races for b in pair]:
            branch_from(w, base, n, lambda r, n=n: write(r, n.replace("/", "_") + ".txt", n + "\n"), n)
        git("push", "-q", small["remote"], *[f"refs/heads/{n}:refs/heads/{n}" for n in names]
            + [f"refs/heads/{b}:refs/heads/{b}" for pair in races for b in pair], cwd=w, token=small["token"])

    def iop(repo, op_name, **kw):
        return call({"op": op_name, "remote": repo["remote"], "token": repo["token"], **kw}, url=ISO_URL)

    res = {"run": run, "url": ISO_URL, "runs": RUNS, "started": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    for label, repo in (("small", small), ("medium", medium)):
        rows = [iop(repo, "preview", base="preview-base", head="cand/clean", fresh=True) for _ in range(RUNS)]
        for r in rows:
            log(f"iso fresh {label}: ok={r.get('ok')} clean={r.get('clean')} client={r['clientMs']} "
                f"timing={r.get('timing')} err={str(r.get('error'))[:300]}")
        res[f"fresh_{label}"] = {"summary": summarize(rows), "rows": rows}
        for head in ("cand/clean", "cand/conflict"):
            iop(repo, "preview", base="preview-base", head=head)  # prime this isolate
            rows = [iop(repo, "preview", base="preview-base", head=head) for _ in range(RUNS)]
            for r in rows:
                log(f"iso cached {label} {head}: clean={r.get('clean')} conflicts={r.get('conflicts')} "
                    f"client={r['clientMs']} timing={r.get('timing')} err={str(r.get('error'))[:300]}")
            res[f"cached_{label}_{head}"] = {"summary": summarize(rows), "rows": rows,
                                             "syncs": [r.get("timing", {}).get("sync") for r in rows]}
    main = ls_remote(small, "refs/heads/main")
    rows = []
    for n in names:
        r = iop(small, "land", base="main", head=n, expect=main)
        rows.append(r)
        log(f"iso land {n}: landed={r.get('landed')} refused={r.get('refused')} client={r['clientMs']} "
            f"timing={r.get('timing')} err={str(r.get('error') or r.get('pushErr'))[:300]}")
        if r.get("landed"):
            main = r["commit"]
    res["land"] = {"summary": summarize(rows), "rows": rows,
                   "remote_main_matches_last_land": ls_remote(small, "refs/heads/main") == main}
    out_races = []
    for a, b in races:
        expect = ls_remote(small, "refs/heads/main")
        out = {}

        def go(side, head):
            out[side] = iop(small, "land", base="main", head=head, expect=expect)
        ts = [threading.Thread(target=go, args=x) for x in (("a", a), ("b", b))]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        final = ls_remote(small, "refs/heads/main")
        winners = [s for s in "ab" if out[s].get("landed")]
        row = {"winners": winners, "main_is_winner": len(winners) == 1 and final == out[winners[0]]["commit"],
               "a": out["a"], "b": out["b"]}
        out_races.append(row)
        loser = "b" if winners == ["a"] else "a"
        log(f"iso race: winners={winners} main_is_winner={row['main_is_winner']} "
            f"loser={out[loser].get('refused')} {str(out[loser].get('pushErr') or out[loser].get('error'))[:200]}")
    res["races"] = out_races
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", f"{run}.raw.json"), "w") as f:
        f.write(redact(json.dumps(res, indent=1)))
    summary = {k: v["summary"] for k, v in res.items() if isinstance(v, dict) and "summary" in v}
    summary["cached_syncs"] = {k: v["syncs"] for k, v in res.items() if isinstance(v, dict) and "syncs" in v}
    summary["races"] = {"winners": [len(r["winners"]) for r in out_races],
                        "all_main_is_winner": all(r["main_is_winner"] for r in out_races)}
    summary["land_remote_main_matches"] = res["land"]["remote_main_matches_last_land"]
    with open(os.path.join(HERE, "results", f"{run}.summary.json"), "w") as f:
        f.write(redact(json.dumps(summary, indent=1)))
    log(json.dumps(summary, indent=1))


def cleanup():
    for path in sorted(os.listdir(os.path.join(HERE, "results"))) if os.path.isdir(os.path.join(HERE, "results")) else []:
        if path.endswith(".raw.json"):
            for b in json.load(open(os.path.join(HERE, "results", path))).get("boxes", []):
                call({"op": "destroy", "box": b})
    # Every spike repo, including any whose create response was lost.
    names = [r["name"] for r in art("GET", "/repos?limit=200&search=artroom-sbx-").get("result") or []
             if r["name"].startswith("artroom-sbx-")]
    for name in names:
        r = art("GET", f"/repos/{name}/tokens?state=active&per_page=100")
        for t in r.get("result") or []:
            d = art("DELETE", f"/tokens/{t['id']}")
            log(f"revoke {name} token {t['id'][:8]}: {d.get('success')}")
        if "--delete-repos" in sys.argv:
            d = art("DELETE", f"/repos/{name}")
            log(f"delete {name}: {d.get('success')}")


if __name__ == "__main__":
    {"setup": setup, "measure": measure, "iso": iso, "cleanup": cleanup}[sys.argv[1]]()
