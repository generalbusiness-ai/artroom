# Spike: a pi-durable agent in Artroom

A pi-durable 1.0.0 agent, hosted in a Durable Object on its own SQLite,
claims a lane, pushes a change, proposes it and lands it in lane A's Room.
It reaches the Room over a service binding, as a Worker under a delegation
(protocol R-CRED-4). The agent's Durable Object is then reset in the middle
of each act and push, and the room's replies are lost, and the run resumes
without a double act, a second commit or a lost receipt.

This is a spike, not product code. The design and the findings are in
[notes/2026-10-01-pi-durable.md](../../notes/2026-10-01-pi-durable.md).

## What runs

Everything runs in workerd, under `@cloudflare/vitest-pool-workers`:

| Part | Source | Real or fake |
|---|---|---|
| pi-durable Harness, tool tasks, memos, documents | `@earendil-works/pi-durable` 1.0.0 from npm | Real |
| Storage for pi-durable | `src/do-sqlite.ts`: pi-durable's `SqliteDatabase` facade over Durable Object SQLite | Real; written for this spike |
| The Room, landing engine, workspaces, log publisher | `request/laneA-room` at `4a7c4af6` (lanes A, B, C, L) | Real |
| Artifacts and the publisher sandbox | Lane A's `FakeArtifactsHost` | Fake, over real git objects |
| The client | `request/laneE-clients` at `cb1767dd`, `connect(env.ARTROOM, …)` | Real |
| The model | pi-ai's faux provider with a response factory that reads the transcript (`scriptedTurn` in `src/agent.ts`) | Scripted; in the live run, Workers AI through the `AI` binding by default |
| Pushing to the lane's fork | `controls.workspace` (`test/support.ts`): prepare a commit, then a compare-and-swap push to the fork, through the fake Artifacts | Simulated; the workspace token path is not exercised |

## Files

| File | What it does |
|---|---|
| `src/agent.ts` | `Agent` Durable Object: a pi-durable Harness, the `artroom` extension (five tools, two prompt sections, the `artroom.lane` document), the outbox of prepared acts, the crash points, and RPC for the tests |
| `src/do-sqlite.ts` | `DurableObjectSqlite`: pi-durable's SQLite facade over `ctx.storage` |
| `src/models.ts` | The model providers the Agent registers from its bindings: `workers-ai` (the `AI` binding), `cloudflare-workers-ai` (REST) and `openrouter` |
| `src/live.ts` | Which provider and model the live run uses (`SPIKE_LIVE`, `SPIKE_LIVE_MODEL`) |
| `src/scratch.ts` | An empty Durable Object for the SQLite probe and the conformance runs |
| `src/worker.ts` | The Worker: lane A's Room Worker, plus the two Durable Objects above |
| `test/do-sqlite.test.ts` | Durable Object SQLite transaction facts, then pi-durable's own storage conformance suite (23 cases) on the facade |
| `test/support.ts` | The room, the delegation, the fake fork, and the retry loop the tests share |
| `test/agent.test.ts` | The run, the run reset at twelve points, and three ablations |
| `test/review-f2212c63.test.ts` | Lost replies, a reset inside the push, and a fork that moved (checker review f2212c63) |
| `test/review-6d392973.test.ts` | The retry wait removes its abort listener (checker review 6d392973) |
| `test/models.test.ts` | The live selection, the providers the Agent registers, and the binding provider's request and response over a fake binding |
| `test/live.test.ts` | The same run with a real model; skipped unless `SPIKE_LIVE` is set |
| `test/check/` | Fixtures for `scripts/check-test.sh`, outside the type-checked project |
| `scripts/setup.sh` | Extracts the pinned lane sources into `vendor/` (ignored by git) |
| `scripts/check.sh` | Type check with the pinned compiler: the spike's own files, exactly the known vendor diagnostics, and no file read from the repository outside the spike |
| `scripts/vendor-diagnostics.txt` | The seven known vendor diagnostics that `check.sh` allows |
| `scripts/check-test.sh` | Tests that `check.sh` fails when it should |
| `results/` | The recorded results cited in the note |

## Run it

From this directory, inside a clone that has the commits `4a7c4af6` and
`cb1767dd` (branches `request/laneA-room` and `request/laneE-clients`):

```sh
npm ci                # includes the pinned compiler, typescript 7.0.2
sh scripts/setup.sh
npm test              # 68 tests; the live test is skipped
npm run check         # type check of src/ and test/
npm run check:test    # 8 cases: check.sh fails when it should
```

The spike has its own `package.json` and lockfile. It is outside the root
workspaces (`packages/*`), so the root `npm run typecheck` and `npm test`
do not include it, and it does not need them: `tsconfig.json` maps every
Artroom package and subpath to `vendor/`, as `vitest.config.ts` aliases them,
and `npm run check` fails if anything resolves to the root's packages. The
sequence above passes in a checkout with no root `node_modules`.

### Live run

The live test runs only when `SPIKE_LIVE` is set. Its value names the
provider (`src/live.ts`):

| `SPIKE_LIVE` | Provider | Default model | Needs |
|---|---|---|---|
| `1` or `workers-ai` (the default) | Workers AI through the Worker's `AI` binding | `@cf/zai-org/glm-4.7-flash` | wrangler's login; no model key |
| `cloudflare-workers-ai` | Workers AI over its REST API: pi-ai's provider, for a run outside a Worker | `@cf/zai-org/glm-4.7-flash` | `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` |
| `openrouter` | OpenRouter: pi-ai's provider | `openai/gpt-4.1-mini` | `OPENROUTER_API_KEY` |

`SPIKE_LIVE_MODEL` replaces the default model. A variable the provider needs
that is missing fails the run; it is not skipped. `vitest.config.ts` passes
to workerd only the selected provider's variables, and the agent gives keys
to pi-ai through an in-memory credential store. Nothing prints them.

```sh
# Workers AI through the AI binding (the default)
SPIKE_LIVE=1 env -u CLOUDFLARE_API_TOKEN \
  npx vitest run --config vitest.config.ts test/live.test.ts --disableConsoleIntercept

# Workers AI over REST, with an account API token that has Workers AI Read and Workers AI Edit
(set -a; . ~/.config/generalbusiness/cloudflare_ai.env; set +a
 SPIKE_LIVE=cloudflare-workers-ai \
  npx vitest run --config vitest.config.ts test/live.test.ts --disableConsoleIntercept)

# OpenRouter
SPIKE_LIVE=openrouter OPENROUTER_API_KEY="$(tr -d '[:space:]' < ~/.config/generalbusiness/openrouter.env)" \
  npx vitest run --config vitest.config.ts test/live.test.ts --disableConsoleIntercept
```

**The `AI` binding.** `wrangler.jsonc` declares `"ai": { "binding": "AI",
"remote": true }`. Workers AI has no local simulator, so in the local test
pool the binding is a remote binding: `vitest.config.ts` turns on
`remoteBindings` only when `SPIKE_LIVE` selects `workers-ai`, and wrangler
then connects it with its own login (`wrangler login`; the OAuth scope
`ai (write)`). `env -u CLOUDFLARE_API_TOKEN` keeps wrangler on that login
when the shell has a token for something else. Every other run, including
`npm test`, needs no Cloudflare account. No Worker is deployed for the live
run. A deployed Worker with the binding would also need no model key.

pi-ai 1.0.0 has no provider for the binding, so `src/models.ts` makes one:
pi-ai's Workers AI catalog and OpenAI chat-completions client, with a
`fetch` that hands each request body to `AI.run(model, body, {
returnRawResponse: true })` and returns the binding's stream as it is. This
works for models whose binding answer is in the OpenAI chat-completion shape;
some older catalog models answer in another shape (`response`, `tool_calls`)
and would need a converter.

**Why GLM-4.7-Flash.** From the Workers AI catalog (checked 2026-10-02) and
pi-ai 1.0.0's copy of it:

- tool calling: Cloudflare lists it with function calling and multi-turn
  tool calling, and its binding answer is in the OpenAI chat-completion
  shape, with tool calls in `choices[].message.tool_calls`;
- context: 131,072 tokens, enough for long lane conversations;
- cost: USD 0.0605 per million input tokens and USD 0.40 per million output
  tokens. An agent loop sends the transcript again on each turn, so input
  dominates; this is the lowest input price among the catalog's tool-calling
  models with a context of 131,072 or more and an OpenAI-shaped answer. Gemma
  4 26B (USD 0.10 and 0.30, 256,000 tokens) is the nearest alternative.
  Granite 4.0 Micro is cheaper but answers in the older shape; Qwen3 30B is
  cheaper for input but has a 32,768-token context; GLM-5.3-Flash needs the
  Workers Paid plan.

It is a reasoning model; its reasoning is in the output tokens.

**Results.** `results/live-runs-2026-10-02.txt` has one line per run;
`results/live-workers-ai-2026-10-02.json` is the full `SPIKE-LIVE {…}` line
of the last Workers AI run, with the acts, the sends, the transcript, the
landing's state when the model answered and after the room's alarm, and the
spend. On Workers AI through the binding, 19 of 20 runs passed, each for
USD 0.00024 to 0.00051 by pi-ai's price table (about USD 0.0073 for all 20).
In the failed run the model's turn after `propose` was empty, so it never
sent `land`. The REST path and OpenRouter passed once each (USD 0.00046 and
USD 0.0010). `results/live-2026-10-01.json` is the earlier OpenRouter run.
The model's answer is not evidence of landing; the room's operation is.

## Crash points

`controls.crashes` names where the agent's Durable Object calls
`ctx.abort()`, once. workerd then discards the instance and its unflushed
writes; the next call constructs a new one, which reopens the same SQLite.

| Point | Where |
|---|---|
| `<act>:before-send` | The prepared, signed envelope is in the outbox, flushed; nothing has been sent |
| `<act>:after-send` | The room has admitted the act and answered; the outcome is in the outbox; the receipt is not yet in the lane document |
| `<act>:after-receipt` | The receipt is in the lane document; the tool's result is not yet committed |
| `<act>:unresolved` | The reply was lost through all of the client's attempts; the tool is waiting to send the stored envelope again |
| `write:before-push` | The commit and the fork head it replaces are in the task's memo; nothing has been pushed |
| `write:after-push` | The fork has the commit; the lane document does not record it yet |
| `write:after-record` | The head is in the lane document; the tool's result is not yet committed |

`<act>` is `claim`, `propose` or `land`.

## Not done

These are the gaps between the spike and a product; each is to become a
request.

- No Cloudflare deployment. The Room's remotes in a deployment are lane B's
  container and Artifacts, which lane A has not deployed yet.
- The alarm loop. The agent is woken only by calls. A deployment would set
  an alarm while a run is unfinished, or an act's outcome is unknown, so the
  Durable Object resumes on its own. Today an act tool waiting on a lost
  reply waits inside the request. The scheduler that replaces that wait
  should also reconcile the outbox rows that aborted act tools leave.
- The attention bridge. The Room's attention reaches the conversation
  through the test, which submits the landing's outcome with a request ID.
  The bridge itself (subscribe, then submit) is designed in the note, not
  built.
- Lease renewal, release and abort: no lane task renews or releases the
  lease, and aborting a conversation does not release its lane. An aborted
  act tool leaves its outbox row unresolved, and nothing reconciles it.
- Room and client integration tests: the spike runs against pinned,
  vendored lane sources, over fake Artifacts, with the push simulated and
  the workspace token path not exercised.
- Cross-identity context handoff: a reviewer fork signing as its own
  `agent` identity.
- Viewer and steerer identity, and secret custody: who may watch or steer a
  conversation, and where the agent's key lives. On Workers AI through the
  binding there is no model key; on another provider there is.
- Adversarial authorization tests: a steer, a fork or a forged envelope
  from someone without the grant.
- The delegate key is kept in the agent's own SQLite for the spike. In a
  deployment it is a Worker secret (R-CRED-4).
