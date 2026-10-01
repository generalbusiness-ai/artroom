# Spike: merge preview and landing with git in a Sandbox container

A Worker and a Durable Object that starts a container with real git. Given an
Artifacts repo, a base branch and a candidate branch, it:

1. clones the repo into the container on first use, and fetches after that;
2. previews the merge with `git merge-tree` and reports clean, or the
   conflicting paths;
3. lands the merge into the base branch with `git push --force-with-lease`,
   and refuses if the base moved.

The findings are in [notes/2026-10-01-spike-sandbox-git.md](../../notes/2026-10-01-spike-sandbox-git.md).

## Files

| File | What it is |
|---|---|
| `src/index.ts` | Worker `artroom-spike-sandbox-git`: the `GitBox` Durable Object, which runs git in its container, and the `ArtifactsGateway` entrypoint, which adds the repo token to git's requests |
| `src/push-outcome.ts` | Classifies a push as `landed`, `rejected`, `error` or `unknown` |
| `src/iso.ts`, `src/iso-op.ts`, `src/memory-fs.ts` | Worker `artroom-spike-isogit`: the same preview and land with isomorphic-git and no container, for comparison |
| `test/` | Node tests: same-isolate concurrent lands, container failures part-way through a land, and push classification against real git output (`push-samples.json`, made by `capture_push_samples.py`) |
| `wrangler.jsonc`, `wrangler.iso.jsonc` | Configuration for the two Workers |
| `Dockerfile` | The image to use when Docker is available |
| `image.sh` | Copies `alpine/git` into the Cloudflare registry without Docker (what this spike used) |
| `driver/spike.py` | Creates test repos, runs the measurements, cleans up |
| `driver/results/` | Results of the run in the note. Tokens are redacted |

## The API

`POST /op` with the header `x-spike-key: <SPIKE_KEY>` and a JSON body:

```json
{ "op": "preview", "box": "room-1", "remote": "https://<account>.artifacts.cloudflare.net/git/gitseq-spike/<repo>.git",
  "token": "<repo token>", "base": "main", "head": "cand/x", "expect": "<sha main must have>" }
```

`op` is `preview`, `land`, `info` or `destroy`. A land response always has
`outcome` (`landed`, `rejected`, `error` or `unknown`), `expect` and `commit`.
After `unknown`, read back the branch before landing again: the push may have
landed. When the response names `commit`, reading back the branch shows whether
that commit landed. When the whole response was lost (`commit` null), reading
back cannot settle the operation: hold it for recovery. Artroom's Lane B
supplies a durable identity for each operation, and the reconciliation that
uses it. `box` names the sandbox: one
Durable Object and one container. The token travels in the request body and
stays in the Worker. The container is started with no Internet access and
reaches only the Artifacts host, through the gateway.

## Tests

```sh
npm install
npm test                               # node --test test/  (no network)
npm run typecheck                      # wrangler types && tsc --noEmit
python3 test/capture_push_samples.py   # optional: recapture push-samples.json
```

## Rerun the measurements

You need Node, Python 3, a wrangler login for account
`6e953d231f1c9aadffbf59537a82e13a`, and either Docker or
[crane](https://github.com/google/go-containerregistry).

```sh
cd spikes/sandbox-git
npm install
env -u CLOUDFLARE_API_TOKEN npx wrangler whoami        # refreshes the OAuth token the driver uses

# 1. Image. With Docker, point wrangler.jsonc at ./Dockerfile instead.
CRANE=/path/to/crane ./image.sh                         # then put the printed digest in wrangler.jsonc

# 2. Deploy both Workers with a shared key. Keep the key file out of the repo.
umask 077; openssl rand -hex 24 > ~/.artroom-spike-key
printf 'SPIKE_KEY=%s\n' "$(cat ~/.artroom-spike-key)" > ~/.artroom-spike-secrets
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --secrets-file ~/.artroom-spike-secrets
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy -c wrangler.iso.jsonc --secrets-file ~/.artroom-spike-secrets

# 3. Measure. Use bash, not zsh.
export SPIKE_KEY_FILE=~/.artroom-spike-key RUNS=10
python3 driver/spike.py setup      # two repos in namespace gitseq-spike; tokens go to driver/.state.json (git-ignored)
python3 driver/spike.py measure    # container: cold, warm, land, refusals, races
python3 driver/spike.py iso        # isomorphic-git: the same checks
python3 driver/spike.py cleanup    # destroys sandboxes, revokes every artroom-sbx-* repo token
                                   # add --delete-repos to delete the repos too
```

To remove the Workers:
`env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-spike-sandbox-git` and
`... delete artroom-spike-isogit`.
