# Spike: room core

A Worker and a Durable Object (`RoomSpike`) that:

1. verify an Ed25519-signed act with WebCrypto;
2. evaluate JSONata rules of the five kinds (`refuse`, `require`, `survive`,
   `land`, `notify`) in a restricted profile ported from atseq, and record
   every rule input;
3. compute the changed paths between two commits from Artifacts
   `readCommit` and `readTree`, without a container;
4. append to SQLite and answer with the record or a `Refusal`.

This is a spike. It is not product code. The findings are in
[notes/2026-10-01-spike-room-core.md](../../notes/2026-10-01-spike-room-core.md).

## Files

| File | What it does |
|---|---|
| `src/index.ts` | Worker. Routes `/r/:room/{setup,act,diff,explain,log,bench}` to the room. |
| `src/room.ts` | `RoomSpike` Durable Object: verify, rules, SQLite, replay, benchmarks. |
| `src/profile.ts` | Restricted JSONata profile (port of atseq `src/runtime/evaluator.ts`). |
| `src/glob.ts` | Path globs for rules, without regular expressions. |
| `src/treediff.ts` | Changed paths between two commits from tree objects. |
| `src/policy.json` | The policy used by the measurements: 12 rules, all five kinds. |
| `scripts/setup_repo.sh` | Creates the test repo in Artifacts (import plus two pushed branches). |
| `scripts/driver.mjs` | Signs acts, drives a lifecycle, measures, writes `results/*.json`. |
| `results/` | Raw results of the runs cited in the note. |

## Acts

An act is `{kind, actor, body, nonce}`. `actor` is the base64url raw Ed25519
public key. The signature is Ed25519 over the canonical JSON of the act
(sorted keys, no whitespace, safe integers only). The envelope posted to
`/r/:room/act` is `{act, sig}`.

| Kind | Body |
|---|---|
| `claim` | `{goal, scope: [glob]}` |
| `propose` | `{claim, base, head}`; the room diffs `base..head` |
| `review` | `{proposal, verdict: "approve" \| "changes", scope: [glob]}` |
| `land` | `{proposal}`; recorded only, no merge |

The answer is the record, or `{refused: true, rule, reason, fix}`.

## Tests

```bash
npm ci
npm test               # Node: evaluator isolation, failure paths (15 tests)
env -u CLOUDFLARE_API_TOKEN npx wrangler dev --port 8787 &
npm run test:workerd   # the same isolation check inside workerd
```

`test/build.mjs` bundles `src/` for Node with esbuild. One bundle replaces
`cloudflare:workers` with a stub; another also makes `$glob` throw a
`TypeError` for the pattern `__inject_fault__`, to test that an engine fault
writes nothing.

## Rerun

Requirements: Node 22 or later, `jq`, and a wrangler OAuth login to account
`6e953d231f1c9aadffbf59537a82e13a` (`npx wrangler login`). Unset
`CLOUDFLARE_API_TOKEN` so that wrangler uses the OAuth login.

```bash
cd spikes/room-core
npm ci
npx wrangler types

# 1. Test repo: artroom-spike-tree in namespace gitseq-spike.
#    Reuses the repo if it exists; pushes fresh spike-small and spike-large
#    branches; writes results/repo.json; revokes every repo token it saw.
bash scripts/setup_repo.sh

# 2a. Local workerd. Timers advance during CPU work only here, so the
#     per-operation CPU figures come from this run. Artifacts calls go to the
#     real service ("remote": true), so local diff times are not meaningful.
env -u CLOUDFLARE_API_TOKEN npx wrangler dev --port 8787 &
node scripts/driver.mjs http://127.0.0.1:8787 --runs 50 --phases acts,bench --out results/local-workerd.json

# 2b. Deployed. Redeploy first so the first calls meet a cold isolate.
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy
node scripts/driver.mjs https://artroom-spike-room-core.<subdomain>.workers.dev --runs 50 --out results/deployed.json

# 3. Remove the Worker when done.
env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-spike-room-core
```

Driver options: `--runs N` (default 50), `--room name`, `--phases
acts,diff,bench` (add `difflimit` for the concurrency-cap runs),
`--verify-inner`, `--rule-inner`, `--compile-inner`, `--patho-sizes
25,50,100`, `--out file`. `node scripts/summarize.mjs results/<file>.json`
prints the tables.

The CPU-limit runs and the tail cross-check were made by hand with curl while
`wrangler tail --format json` ran:

```bash
U=https://artroom-spike-room-core.<subdomain>.workers.dev
curl -X POST $U/r/limit1/setup
curl -X POST $U/r/limit1/bench --data '{"op":"patho","size":150,"guard":false}'   # exceeds the 30 s CPU limit
curl "$U/w/bench?op=patho&inner=1&size=25&guard=true"                          # runs in the Worker isolate
```

Results files: `local-workerd.json` and `deployed.json` (main runs),
`deployed-difflimit.json`, `deployed-tail-cpu.jsonl`,
`deployed-cpu-limit.jsonl`, `deployed-string-doubling.jsonl`, `repo.json`.

## Measuring CPU time on Cloudflare

Deployed Workers freeze `performance.now()` and `Date.now()` during CPU work;
they only advance on I/O. So the room's own timers read 0 ms for verify and
rule evaluation when deployed. The driver therefore also times each benchmark
from the Worker, around the RPC to the Durable Object (that is I/O, so the
clock advances), subtracts the median no-op RPC, and divides by the iteration
count. The note reports both.

The setup endpoint has no authentication. Do not leave the Worker deployed.
