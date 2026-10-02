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
| The model | pi-ai's faux provider with a response factory that reads the transcript (`scriptedTurn` in `src/agent.ts`) | Scripted; a real model in the live run |
| Pushing to the lane's fork | `controls.workspace` (`test/support.ts`): prepare a commit, then a compare-and-swap push to the fork, through the fake Artifacts | Simulated; the workspace token path is not exercised |

## Files

| File | What it does |
|---|---|
| `src/agent.ts` | `Agent` Durable Object: a pi-durable Harness, the `artroom` extension (five tools, two prompt sections, the `artroom.lane` document), the outbox of prepared acts, the crash points, and RPC for the tests |
| `src/do-sqlite.ts` | `DurableObjectSqlite`: pi-durable's SQLite facade over `ctx.storage` |
| `src/scratch.ts` | An empty Durable Object for the SQLite probe and the conformance runs |
| `src/worker.ts` | The Worker: lane A's Room Worker, plus the two Durable Objects above |
| `test/do-sqlite.test.ts` | Durable Object SQLite transaction facts, then pi-durable's own storage conformance suite (23 cases) on the facade |
| `test/support.ts` | The room, the delegation, the fake fork, and the retry loop the tests share |
| `test/agent.test.ts` | The run, the run reset at twelve points, and three ablations |
| `test/review-f2212c63.test.ts` | Lost replies, a reset inside the push, and a fork that moved (checker review f2212c63) |
| `test/review-6d392973.test.ts` | The retry wait removes its abort listener (checker review 6d392973) |
| `test/live.test.ts` | The same run with a real model on OpenRouter; skipped without a key |
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
npm test              # 53 tests; the live test is skipped
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

The live test runs only when `OPENROUTER_API_KEY` is set in the host
environment. `vitest.config.ts` passes it to workerd as a binding; the agent
gives it to pi-ai through an in-memory credential store. Nothing prints it.
`SPIKE_LIVE_MODEL` chooses the OpenRouter model (default
`openai/gpt-4.1-mini`).

```sh
OPENROUTER_API_KEY="$(tr -d '[:space:]' < ~/.config/generalbusiness/openrouter.env)" \
  npx vitest run --config vitest.config.ts test/live.test.ts --disableConsoleIntercept
```

It prints one line, `SPIKE-LIVE {…}`, with the acts, the sends, the
transcript, the landing's state when the model answered and after the
room's alarm, and the spend. `results/live-2026-10-01.json` is that line.
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
  conversation, and where the agent's key and model key live.
- Adversarial authorization tests: a steer, a fork or a forged envelope
  from someone without the grant.
- The delegate key is kept in the agent's own SQLite for the spike. In a
  deployment it is a Worker secret (R-CRED-4).
