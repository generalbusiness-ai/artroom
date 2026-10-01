#!/usr/bin/env python3
"""Capture real `git push --porcelain` output for each push outcome.

Writes test/push-samples.json, which test/push-outcome.test.mjs checks the
classifier against. Run with python3 (no credentials needed):

    python3 test/capture_push_samples.py

Each sample records the exit code, stdout, stderr, the outcome the classifier
must give, and whether the remote ref actually changed. The cases:

  landed            local bare repo, correct lease
  lease-client      local bare repo, wrong lease: "[rejected] (stale info)"
  remote-rejected   local bare repo whose pre-receive hook declines
  error-dns         https host that does not resolve
  error-refused     https to a closed local port
  error-auth        the Artifacts host with a dummy token (HTTP 403); needs network
  unknown-502       local smart-HTTP server applies the push, then answers 502
  unknown-dropped   local smart-HTTP server applies the push, then closes the socket
  unknown-401-after-send  the server accepts discovery, then answers the POST with 401
  unknown-hangup    local transport whose receive-pack output is cut after the
                    ref advertisement, so no report arrives

The server-side lease rejection ("[remote rejected] (stale ref)") comes from
the Artifacts race results in driver/results/, because it needs two real
concurrent pushes.
"""
import glob, http.server, json, os, socket, subprocess, sys, tempfile, threading

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = "refs/heads/main"
ENV = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@invalid",
           GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@invalid", GIT_CONFIG_NOSYSTEM="1",
           GIT_CONFIG_GLOBAL="/dev/null")


def git(*args, cwd=None, check=True, env=None):
    p = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=env or ENV, timeout=60)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {args}: {p.stderr}")
    return p


def setup(tmp):
    """A bare remote with main at c1, and a work repo with c2 = merge-like child of c1."""
    remote, work = os.path.join(tmp, "remote.git"), os.path.join(tmp, "work")
    git("init", "-q", "--bare", "-b", "main", remote)
    git("init", "-q", "-b", "main", work)
    open(os.path.join(work, "f"), "w").write("1\n")
    git("add", "f", cwd=work)
    git("commit", "-q", "-m", "c1", cwd=work)
    git("push", "-q", remote, "main", cwd=work)
    c1 = git("rev-parse", "HEAD", cwd=work).stdout.strip()
    open(os.path.join(work, "f"), "w").write("2\n")
    git("commit", "-q", "-am", "c2", cwd=work)
    c2 = git("rev-parse", "HEAD", cwd=work).stdout.strip()
    return remote, work, c1, c2


def push(work, url, c2, expect, extra=()):
    return git("push", "--porcelain", *extra, f"--force-with-lease={TARGET}:{expect}", url, f"{c2}:{TARGET}",
               cwd=work, check=False)


def ref_of(remote):
    p = git("--git-dir", remote, "rev-parse", "-q", "--verify", TARGET, check=False)
    return p.stdout.strip() or None


TMP = None


def sample(name, p, expected, changed, note):
    clean = lambda t: t.replace(TMP, "<tmp>") if TMP else t
    return {"case": name, "exitCode": p.returncode, "stdout": clean(p.stdout), "stderr": clean(p.stderr),
            "expected": expected, "refChanged": changed, "note": note}


class SmartHTTP(http.server.BaseHTTPRequestHandler):
    """Just enough smart HTTP for receive-pack. After applying a push it
    misbehaves as `mode` says: answer 502, or close the connection."""
    remote = None
    mode = None

    def log_message(self, *a):
        pass

    def do_GET(self):
        adv = subprocess.run(["git", "receive-pack", "--stateless-rpc", "--advertise-refs", self.remote],
                             capture_output=True, env=ENV).stdout
        head = b"# service=git-receive-pack\n"
        body = b"%04x" % (len(head) + 4) + head + b"0000" + adv
        self.send_response(200)
        self.send_header("Content-Type", "application/x-git-receive-pack-advertisement")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        data = self.rfile.read(int(self.headers["Content-Length"])) if self.headers.get("Content-Length") \
            else self._chunked()
        if self.mode == "401":  # credentials refused after discovery; nothing applied
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="x"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        subprocess.run(["git", "receive-pack", "--stateless-rpc", self.remote], input=data,
                       capture_output=True, env=ENV)  # the push is applied here
        if self.mode == "502":
            self.send_response(502)
            self.send_header("Content-Length", "0")
            self.end_headers()
        else:
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()

    def _chunked(self):
        out = b""
        while True:
            n = int(self.rfile.readline().strip(), 16)
            if n == 0:
                self.rfile.readline()
                return out
            out += self.rfile.read(n)
            self.rfile.readline()


def http_case(tmp, name, mode):
    remote, work, c1, c2 = setup(os.path.join(tmp, name))
    SmartHTTP.remote, SmartHTTP.mode = remote, mode
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SmartHTTP)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{srv.server_address[1]}/repo.git"
        p = push(work, url, c2, c1)
    finally:
        srv.shutdown()
    note = ("the receive-pack POST was refused with 401 after discovery; the client cannot know that"
            if mode == "401" else "the receiver applied the push, then the response was lost")
    return sample(name, p, "unknown", ref_of(remote) == c2, note)


def main():
    global TMP
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        TMP = tmp
        remote, work, c1, c2 = setup(os.path.join(tmp, "ok"))
        p = push(work, remote, c2, c1)
        out.append(sample("landed", p, "landed", ref_of(remote) == c2, "correct lease"))

        remote, work, c1, c2 = setup(os.path.join(tmp, "stale"))
        p = push(work, remote, c2, "0" * 39 + "1")
        out.append(sample("lease-client", p, "rejected:lease", ref_of(remote) == c2, "wrong expected base"))

        remote, work, c1, c2 = setup(os.path.join(tmp, "hook"))
        hook = os.path.join(remote, "hooks", "pre-receive")
        os.makedirs(os.path.dirname(hook), exist_ok=True)
        open(hook, "w").write("#!/bin/sh\necho declined >&2\nexit 1\n")
        os.chmod(hook, 0o755)
        p = push(work, remote, c2, c1)
        out.append(sample("remote-rejected", p, "rejected:remote-rejected", ref_of(remote) == c2,
                          "pre-receive hook declines"))

        remote, work, c1, c2 = setup(os.path.join(tmp, "dns"))
        p = push(work, "https://no-such-host.invalid/repo.git", c2, c1)
        out.append(sample("error-dns", p, "error", False, "host does not resolve"))

        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        p = push(work, f"https://127.0.0.1:{port}/repo.git", c2, c1)
        out.append(sample("error-refused", p, "error", False, "nothing listens on the port"))

        artifacts = "https://6e953d231f1c9aadffbf59537a82e13a.artifacts.cloudflare.net/git/gitseq-spike/no-such-repo.git"
        p = git("-c", "http.extraHeader=Authorization: Bearer art_v1_" + "0" * 40, "push", "--porcelain",
                f"--force-with-lease={TARGET}:{c1}", artifacts, f"{c2}:{TARGET}", cwd=work, check=False)
        p.stderr = p.stderr.replace("art_v1_" + "0" * 40, "<dummy>")
        out.append(sample("error-auth", p, "error", False, "Artifacts host, dummy token"))

        out.append(http_case(tmp, "unknown-502", "502"))
        out.append(http_case(tmp, "unknown-dropped", "drop"))
        out.append(http_case(tmp, "unknown-401-after-send", "401"))

        remote, work, c1, c2 = setup(os.path.join(tmp, "hangup"))
        adv = subprocess.run(["git", "receive-pack", "--advertise-refs", remote], capture_output=True,
                             env=ENV).stdout
        wrap = os.path.join(tmp, "cut-receive-pack.sh")
        open(wrap, "w").write(f'#!/bin/sh\ngit receive-pack "$@" | head -c {len(adv)}\n')
        os.chmod(wrap, 0o755)
        p = push(work, remote, c2, c1, extra=(f"--receive-pack={wrap}",))
        out.append(sample("unknown-hangup", p, "unknown", ref_of(remote) == c2,
                          "receive-pack output cut after the advertisement; no report arrives"))

    # The server-side lease rejection, captured from Artifacts during the race test.
    for path in sorted(glob.glob(os.path.join(HERE, "..", "driver", "results", "*-??????.raw.json"))):
        d = json.load(open(path))
        for r in d.get("races", []):
            for side in "ab":
                s = r[side]
                if not s.get("landed") and "stale ref" in (s.get("pushOut") or ""):
                    out.append({"case": "lease-server", "exitCode": 1, "stdout": s["pushOut"],
                                "stderr": s.get("pushErr") or "", "expected": "rejected:lease",
                                "refChanged": False,
                                "note": f"Artifacts race loser, from {os.path.basename(path)}"})
                    break
            if out[-1]["case"] == "lease-server":
                break
        if out[-1]["case"] == "lease-server":
            break

    with open(os.path.join(HERE, "push-samples.json"), "w") as f:
        json.dump(out, f, indent=1)
    for s in out:
        print(f"{s['case']:16} exit={s['exitCode']} expected={s['expected']:26} refChanged={s['refChanged']}")


if __name__ == "__main__":
    sys.exit(main())
