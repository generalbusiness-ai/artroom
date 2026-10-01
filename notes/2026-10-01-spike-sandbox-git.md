# Spike: merges and landing with git in a Sandbox container

2026-10-01. Request `spike-sandbox-git`. Code in
[spikes/sandbox-git/](../spikes/sandbox-git/README.md); raw results in
[spikes/sandbox-git/driver/results/](../spikes/sandbox-git/driver/results/).

## Summary

Container git works on this account and is fast enough. A warm container
previews a merge in about 210 ms and lands one in about 510 ms. A new
container clones a small repo and previews in about 0.8 s. In 20 races
between two container lands, exactly one landed every time, and Artifacts
refused the other.

Checker's review `5fc820a6` found two defects, now fixed. See
[Review 5fc820a6](#review-5fc820a6).

**Recommendation: use container git for previews and landing. Do not build
the isomorphic-git fallback now.** It works for small repos, so it remains a
contingency, but it is slower, has no lease, and cannot merge histories
with several merge bases.

## What we built

- **Worker `artroom-spike-sandbox-git`.** One route, `POST /op`, protected by a
  shared key. The body names a sandbox, an Artifacts remote, a repo token, a
  base branch, a candidate branch and, for a land, the base commit the caller
  expects.
- **Durable Object `GitBox`.** One per sandbox name. It starts a container
  with the Durable Object Container API (`ctx.container`, Sandbox SDK 1.0
  style) and runs git with `exec()`. The container is started with
  `enableInternet: false`. It stays up for 10 minutes after the last request.
- **Token handling.** The container never receives the token. The Durable
  Object registers `interceptOutboundHttps()` for the Artifacts host. A
  `WorkerEntrypoint` (`ArtifactsGateway`) receives each git request and checks
  that it is for the one repo in the request. It refuses `git-receive-pack`
  unless the operation is a land. It then adds `Authorization: Bearer`. This is
  the pattern in the Sandbox docs, "Clone a private repository". We did not
  test it adversarially. There is no route that runs arbitrary commands.
- **Preview.** `git fetch` of the two branches into a bare repo. On first use
  this is a clone. Then
  `git merge-tree --write-tree --name-only --no-messages base head`. Exit 0
  means clean; exit 1 lists the conflicting paths.
- **Land.** The preview, then a refusal if the fetched base differs from
  `expect` (`main-moved`) or the merge conflicts (`conflict`). Otherwise
  `git commit-tree` with both parents, then
  `git push --force-with-lease=refs/heads/main:<expect>`. Every land response
  gives `outcome`, `expect` and `commit` (the integration commit, or null if
  none was made). `outcome` is one of:
  - `landed`;
  - `rejected`: the ref definitely did not change. The reasons are a lease
    (`stale ref` from Artifacts, or git's `stale info`), `main-moved`,
    `conflict`, a non-fast-forward, or another refusal the receiver reported;
  - `error`: the push failed before anything was sent (authentication, DNS,
    connection);
  - `unknown`: the pack may have been sent and no report came back. Main may
    or may not have moved.

  This was added after review; see [Review 5fc820a6](#review-5fc820a6).
- **Comparison Worker `artroom-spike-isogit`.** The same preview and land with
  isomorphic-git 1.42.6 and an in-memory filesystem, with no container. It
  has no lease. It checks `expect`, then pushes without force, so only a
  fast-forward from the fetched main can land. Since the review, requests for
  the same repo in one isolate run one at a time. Each request also uses its
  own refs and checks its merge commit's parents before it pushes.

The image is `alpine/git` (git 2.54.0, linux/amd64), copied into
`registry.cloudflare.com` and pinned by digest. A `Dockerfile` for Debian with
git is included for when Docker is available.

## Test repos

Both repos are in namespace `gitseq-spike`.

| Repo | Contents |
|---|---|
| `artroom-sbx-small-10011212` | 4 files. Previews merge `cand/clean` (edits `b.txt`) or `cand/conflict` (edits `a.txt` and `c.txt`) into `preview-base` (edits `a.txt` and `c.txt`). Lands and races use `main` and one new file per candidate. 56 branches |
| `artroom-sbx-medium-10011212` | 2,000 files, about 10 MB, 33 commits. The same preview branches |

## Numbers

The driver ran on a laptop. "Client" is the round trip from the laptop, which
adds about 100 ms. "In DO" is measured inside the Durable Object and is what
a Room would see. All rows are 10 runs. The default instance size was used
unless stated otherwise.

### Container git

| Measurement | Client p50 / max (ms) | In DO p50 / max (ms) | Where the time goes (p50, ms) |
|---|---|---|---|
| Cold preview, small repo (new sandbox: start, clone, merge) | 1,114 / 2,012 | 823 / 1,410 | start 350, clone 398, merge 8 |
| Cold preview, small repo, `standard-1` | 1,036 / 1,293 | 718 / 1,020 | start 268, clone 354, merge 10 |
| Cold preview, medium repo | 2,850 / 3,227 | 2,548 / 2,800 | start 307, clone 2,127, merge 10 |
| Warm preview, small, clean | 339 / 356 | 207 / 234 | fetch 146, merge 10 |
| Warm preview, small, conflicting (`a.txt`, `c.txt`) | 387 / 463 | 266 / 307 | fetch 197, merge 11 |
| Warm preview, medium, clean | 340 / 381 | 212 / 234 | fetch 162, merge 10 |
| Warm preview, medium, conflicting | 322 / 1,123 | 204 / 932 | fetch 152, merge 9 |
| Land, small repo, warm (10 of 10 landed) | 628 / 721 | 509 / 570 | fetch 267, merge 8, push 195 |

The first container start after the first deploy took 5,893 ms. We observed
this once, before the measured runs. All 30 measured cold starts took
223–675 ms to start.

### Refusals and races (container git)

| Check | Result |
|---|---|
| Land a conflicting candidate | Refused `conflict`, with paths `a.txt` and `c.txt`. Nothing pushed |
| Land with a stale `expect` | Refused `main-moved`. Remote main unchanged |
| 10 races, pushes timed to the same instant, from two sandboxes | One winner in all 10. Remote main is the winner's commit in all 10 |
| 10 races, both requests sent at once, no timing | One winner in all 10. Remote main is the winner's commit in all 10 |
| How the loser was refused | In all 20 races, by Artifacts: `[remote rejected] (stale ref)`. Both pushes passed git's own lease check, so Artifacts' compare-and-swap on the ref decided. The code that ran then derived `refused: "lease"` from the exit code alone. The recorded output is `stale ref`, which the corrected classifier also reads as a lease rejection |

### isomorphic-git in a plain Worker (comparison)

Times inside a Worker do not advance during pure computation, so merge time
reads as 0 there. Use the client column to compare with the container.

| Measurement | Client p50 / max (ms) |
|---|---|
| Preview, small, fresh clone each time | 693 / 1,669 |
| Preview, small, cached in the isolate (clean / conflicting) | 549 / 939 and 524 / 829 |
| Preview, medium, fresh clone each time | 5,978 / 7,718 |
| Preview, medium, cached in the isolate (clean / conflicting) | 6,274 / 7,925 and 6,170 / 8,341 |
| Land, small (10 of 10 landed) | 1,022 / 1,631 |
| 10 races, both requests sent at once, from the laptop | One winner each time. Artifacts refused 5 losers; isomorphic-git's fast-forward check refused the other 5. These only show which push Artifacts accepted. They ran the code from before the review, which could merge the wrong candidate when requests share an isolate. So they say nothing about whether the right commit was merged. We did not rerun them |

The isolate cache was hit in 31 of 40 "cached" requests. Consecutive requests
often reach different isolates. On the medium repo, even a cache hit was no
faster. We did not find out why within the time box.

## What failed, and quirks

1. **No Docker daemon on the build machine.** `wrangler deploy` with a
   `dockerfile` image failed: "The Docker CLI is needed to build the
   configured image before deploying but could not be launched." The Docker
   CLI is installed, but no daemon or Docker Desktop is. Workaround: copy
   `alpine/git` into `registry.cloudflare.com` with `crane`, using
   `wrangler containers registries credentials --push` ([image.sh](../spikes/sandbox-git/image.sh)).
   For the product, build the image in CI or Workers Builds.
2. **Instance names `lite` and `basic` are refused at runtime.**
   `ctx.container.start({ instance: "lite" })` threw
   `TypeError: Invalid container instance type.` The docs say `lite` is valid
   and is the default. Leaving `instance` out works. `"standard-1"` works, and
   so does a custom `{ vcpu: 1, memoryMib: 3072, diskMb: 4000 }`. The default
   instance reports 1 CPU and 458 MiB of memory.
3. **A new Worker with required secrets needs `--secrets-file`** on its first
   deploy. `wrangler secret put` cannot run before the Worker exists.
4. **The docs' isomorphic-git memory filesystem is out of date.**
   isomorphic-git 1.42.6 also needs `readlink` and `symlink`. Without them,
   `init` fails with "Cannot read properties of undefined (reading 'bind')".
   Fetch also needs a configured remote (`NoRefspecError`).
5. **Artifacts does not support `filter`**, according to its git protocol
   page. So blobless partial clones are not available for large repos.
   Shallow clones are supported, but `merge-tree` needs the merge base.
6. **`exec()` has no timeout.** A stuck git process would hold the sandbox.
   The Room needs its own deadline and `kill()`.
7. **Driver faults, now fixed.** The first `setup` crashed after creating a
   repo, before saving its token. Cleanup now finds every `artroom-sbx-*` repo
   by listing and revokes its tokens. One local `git commit` failed in the
   macOS temp directory ("unable to create temporary file: Invalid argument").
   It did not happen again when rerun.
8. **No Artifacts 10400 errors this time.** Each repo was created on the first
   attempt.

## Cost and limits

- Containers are billed per 10 ms while running. Memory and disk are billed
  as provisioned; CPU only when active. At `lite` rates (256 MiB, 2 GB disk),
  an idle running container costs about $0.0028 an hour, so a 10-minute warm
  window costs about $0.0005. The Workers Paid plan includes 25 GiB-hours of
  memory a month, which is about 100 hours of `lite`.
- The inactivity timeout can be up to 6 hours. A container allows 128
  intercept entries; a hostname uses two.
- We hit no limits. The spike started 39 containers in total.

## Recommendation

**Use container git, and only container git, for content merges and
landing.**

- It gives real git: the `ort` merge with rename detection, and a true
  `--force-with-lease`.
- Warm previews take about 210 ms and lands about 510 ms inside the Durable
  Object.
- The race test shows that Artifacts enforces compare-and-swap on the ref.
  The Room's serial landing has a safety net underneath it.
- isomorphic-git was slower than a warm container: previews took 693 ms
  against 339 ms on the small repo, and 5,978 ms against 340 ms on the medium
  one (client p50). It beat a cold container only on the small repo (693 ms
  against 1,114 ms). It runs the merge on Worker CPU and cannot keep a warm
  clone reliably. It has no lease. Its docs say it fails when there are
  several merge bases, because it has no recursive strategy.

For the plan:

1. Give each Room one named sandbox, for example named after the repo. Set an
   inactivity timeout long enough that previews stay warm while work is
   active: 10 to 60 minutes. Use the same sandbox to land.
2. Keep the token out of the container with the intercept gateway, as built
   here. The Room supplies a short-lived token for each operation.
3. Cold start is about 0.3 s. Clone time grows with repo size: about 2.1 s
   for 10 MB. For large repos, consider container snapshots (public beta) to
   skip the first clone.
4. Keep path-level overlap checks in the Room, through the Artifacts binding.
   Call the container only when paths overlap, as the plan says.
5. Treat every land outcome other than `landed` and `rejected` with care.
   After `unknown`, read back main and reconcile before any further land: the
   push may have landed. The local capture shows this happen. After `error`,
   nothing was sent. Lane B implements the durable recovery.
6. Keep isomorphic-git as an unbuilt contingency. This spike shows that a
   small-repo preview and land work if containers become unavailable. It
   makes no claim about races in that path; see the review section.

## Review 5fc820a6

Checker reviewed head `0c5764ab`. The container-git recommendation was
approved. Two findings were fixed as follows. The numbers above are
unchanged; they come from the runs before the review.

**P1. The comparison Worker could merge the wrong candidate.** Requests in one
isolate shared the refs `spike-base`, `spike-head` and `spike-land`, with no
serialization. Land A could fetch candidate A and wait. Land B could then
overwrite `spike-head`, and A would merge B while reporting A. Checker
reproduced this with mocked network calls. The fix is in
`src/iso-op.ts`:

- requests for the same repo run one at a time;
- each request uses its own refs (`refs/spike/r<n>/…`), and deletes them when
  it finishes;
- before pushing, a land reads its merge commit back. If the parents are not
  exactly (expected base, requested candidate), it refuses with `error`.

The container Worker did not have this defect. It merges by commit ID, and
its Durable Object already runs one operation at a time.

`test/iso-concurrency.test.mjs` forces the interleaving: the first merge
waits until a second merge starts, or 300 ms. It checks:

- that each land's merge commit has parents (base, its own candidate);
- that the commit's tree has that candidate's file and not the other's;
- that the pushed commit is the commit the response names;
- that the second land starts only after the first one pushes.

We broke the fix three ways, one run each, and the test failed every time:

| Mutant | Result |
|---|---|
| No serialization | Test fails: the order of operations is wrong |
| No serialization, shared refs | Test fails: the parent check refuses A, whose merge has B as its second parent. This is checker's defect |
| No serialization, shared refs, no parent check | Test fails: A's commit has B as its second parent |

**P2. A failed push is not necessarily a lease refusal.** Both Workers
returned `refused: "lease"` for any failed push. A push can fail after the
receiver has already accepted it. `src/push-outcome.ts` now classifies each
push as `landed`, `rejected` (with a reason), `error` or `unknown`. The rule
is: never answer `error` or `rejected` if the ref might have changed. Every
land response now gives `outcome`, `expect` and `commit`.

The container Worker classifies `git push --porcelain` output. It answers:

- `rejected` when a `!` status line for `refs/heads/main` reports a refusal
  (`[rejected]` or `[remote rejected]`);
- `error` when stderr shows a failure while finding the remote (`unable to
  access`, authentication) and nothing shows sending began;
- `unknown` in every other case.

The comparison Worker also answers `unknown` for any failure after
isomorphic-git's `onPrePush` hook has run. An exception during a land is
`error` if it came before the push began and `unknown` after. A failed call
from the Worker to the Durable Object is also `unknown`.

`test/capture_push_samples.py` captures real git output for each case into
`test/push-samples.json`:

- a local bare repo: landed, wrong lease (`stale info`), hook refusal;
- a host that does not resolve, and a closed port;
- the Artifacts host with a dummy token (HTTP 403);
- a local smart-HTTP server that applies the push, then answers 502 or
  closes the connection;
- a local smart-HTTP server that answers the push with 401;
- a receive-pack whose output is cut before its report;
- Artifacts' `stale ref`, taken from the race results.

In the 502, dropped-connection and cut-report cases, **main had moved**, but
git exited with a failure. Those are the cases the old code would have called
a lease refusal. `test/push-outcome.test.mjs` checks that every sample is
classified as expected, and that no sample whose ref changed is called
`error` or `rejected`. Two mutants were run against the final samples.
"Every failure is a lease" fails 9 tests. "No after-send check" fails 1 test,
the 401 case, whose stderr also contains a discovery-style message.

**What `unknown` means for the Room.** After `unknown`, the Room must read
back main, and reconcile it against the commit in the response, before it
lands anything else. Lane B implements this durable recovery. After `error`,
nothing was sent. After `rejected`, main did not change because of this push.

**Checks run for this revision** (in `spikes/sandbox-git`):

| Command | Result |
|---|---|
| `npm test` (`node --test test/`) | 18 tests, 18 passed |
| `npm run typecheck` (`wrangler types && tsc --noEmit`) | Exit 0 |
| `python3 test/capture_push_samples.py` | 11 samples captured. The auth case needs network |
| Live smoke, both Workers redeployed | Each Worker: one land (`landed`, and main equals the response's `commit`) and one stale-`expect` land (`rejected`, `main-moved`, `commit` null). Container Worker: a dummy-token land returned `error`, with `expect` and a null `commit`. The first try of that call reached the previous version during the deploy and lacked the new fields. The retry, on two sandboxes, was correct |

We did not run a live lost-response test against Artifacts, and we did not
rerun the timing or race measurements.

## Left running

- Workers `artroom-spike-sandbox-git` and `artroom-spike-isogit`. Both need the
  spike key. Containers stop 10 minutes after the last request; all spike
  sandboxes were destroyed.
- Image `registry.cloudflare.com/6e953d231f1c9aadffbf59537a82e13a/artroom-spike-git:alpine`.
- Repos `artroom-sbx-small-10011212` and `artroom-sbx-medium-10011212` in
  `gitseq-spike`. All their tokens are revoked. The review smoke test added
  `smoke/*` branches to the small repo and landed four commits on its main.
