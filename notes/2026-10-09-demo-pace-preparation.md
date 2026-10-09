# Paced demo preparation

The A3 recording mode is implemented under request `34734d794820b9f540b17dba01591e1fc0d59507`, promise `82f6cf38bdb03d08fa2f20e475dbe4454ed6a7a1`.
It waits before each runnable shot, names the shot, script scene, person and
command, and prints observed elapsed time separately from summed shot times.
The transcript format stays unchanged. This note records preparation, not a
paced deployment run, gate, review or landing.

The implementation began at `a8c9aa792`. Main `4b6d42a7` was composed at
`547e366ef`; the only conflict was an import union retaining both `NextShot`
and the native capture's `allowedClaim`. The previously observed GitHub run
was unpaced and does not satisfy A3's paced-run condition. The current runner
needs a fresh scratch directory; an old plan or actor config is not reused.

## Coordinated hosted run

Once the manifest delivery source is frozen, its hosted proposal run can also
exercise A3 by including `--pace` in that exact composed runner. The source must
contain both the pacing hook and the current manifest scenes and expectations.
No earlier transcript gains new evidence from this preparation.

After composing the manifest source, the proposed public command is:

```sh
node --import tsx --no-warnings scripts/demo-run.ts \
  https://artroom-scope.inguz.workers.dev \
  --host github.com --namespace generalbusiness-ai \
  --scratch /tmp/artroom-paced-hosted-20261009 \
  --out /tmp/artroom-paced-hosted-20261009/out --manifest --pace
```

The base URL is the previously recorded deployment location, not a claim that
the manifest candidate is deployed there. Root must confirm the exact deployed
source, host readiness and selected register setting before this command runs.
The scratch path must be absent or satisfy the runner's fresh-directory checks.
Do not add `--setting-set`: after the plan, the operator must pin the exact new
register ID in `GITHUB_APP_CONFIG.registerScope` and confirm it before Enter.
The plan's printed expiry still applies while pacing the first two shots.

Each runnable shot needs its own Enter, and the register pin has a separate
Enter. A run must finish with every expected/observed row matching. Retain the
public transcript and terminal elapsed/sum lines; keep actor keys, invitation
links and private capture state in the private scratch directory. Provider
creation credentials and App configuration remain deployment-owned.

The current manifest source adds five preparation/proposal shots to the
26-shot story, for 31 shots. Its two proposal scenes run as the maintainer:
two committed text files publish together, and a controlled two-file proposal
is refused by name. The current source uses `--manifest` to select those
scenes. This A3 branch alone has the 26-shot story; it must be composed with
the final manifest source before the combined command above runs.

Gate correspondence, exact candidate review, the actual paced transcript and
landing remain owed. Root coordinates this with the higher-priority manifest
delivery; this branch does not start a deployment or provider run.
