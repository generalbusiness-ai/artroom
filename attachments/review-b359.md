Preliminary checker review of MCP core runtime at `b359e2787da33937809bb52d3c65441eb8983e9b`, under original gitseq request `9ca1d290b7f01fe713b46668e2d4ab949d289787`, builder promise `bac4bb0e7dc0c788949e82ce18c1445cbadcd8b0`, and planner decision `3d8a74a92c46c4e4df752383be256523d6f2b77e`. This is bounded advice before formal submission or final composition. The intentionally older Stage 5/UI base is acknowledged in the producer report, not a new finding. No formal approval, gitseq write, canonical edit, provider call, or additional Jam gate was made.

One source defect is independently reproduced: the native `UpdateStream` branch of `watchAttention` does not release its reader before calling `stream.cancel`. The native stream rejects cancellation while locked, and the rejection is swallowed. All three tested completion paths return the right attention page while leaving the underlying native subscription uncancelled and locked; timeout also leaves a reader read pending. This finding is limited to native structural adapters. Actual RPC `decodeUpdates` controls pass at unchanged b359, and the HTTPS long-poll tests pass. It does not establish an RPC/HTTPS cleanup defect or an admission/credential defect.

The source and contract anchors are:

- `packages/contract/src/transports.ts:294–302`: the structural `UpdateStream` contract explicitly says a real stream satisfies it. DOM TypeScript overloads require an interface cast in this fixture, as the decoder's own native adaptation uses casts; the runtime object and its native locking/cancellation semantics remain intact.
- `packages/mcp/src/run.ts:94–111`: the stream branch takes `getReader`, races reads with its deadline, and closes using only `stream.cancel().catch(...)`.
- `packages/mcp/src/run.ts:212–226`: the watch opens before the first queue read and closes in `finally`, including when that first page already contains an item.
- `packages/client/src/room.ts:784–800,816–850`: actual RPC subscriptions wrap `decodeUpdates`. Its cancellation tracks the active reader, calls `reader.cancel`, then releases its lock. The independent controls import and exercise this actual export over a native byte source, while the attention page itself is a recording fixture.
- `docs/protocol.md:1894,1985,2013,2082` and section 34.2 at 4784 onward: the complete MCP tools, schemas, authority-derived presentation, and bounded waiting requirements. The original seven conditions and the planner's five resolutions remain applicable.

The final stream fixture has six paired cases, each checked only after the full root source/test compiler exited 0. The frozen fixture SHA-256 is `00fccd130859b4b1028ceb6393b13ce89b7713e18b7ddeb1eabfc80445960144`.

| Adapter | Completion | Unchanged b359 | Owned reader-release diagnostic |
|---|---|---|---|
| Native UpdateStream | Timeout | Named AssertionError: cancellation count 0 instead of 1; locked; 1 pending read | Pass; count 1; unlocked; read settled by rejection |
| Native UpdateStream | New attention item | Same named cancellation failure; locked; read resolved | Pass; count 1; unlocked |
| Native UpdateStream | Nonempty initial page | Same named cancellation failure; locked; no read issued | Pass; count 1; unlocked |
| Actual decodeUpdates | Timeout | Pass; count 1; read resolved done | Pass; count 1; read settled by rejection |
| Actual decodeUpdates | New attention item | Pass | Pass |
| Actual decodeUpdates | Nonempty initial page | Pass | Pass |

Every completion checks a normal result, caller page contents, expected queue read count, one upstream cancellation, and settlement of every issued reader read. Final baseline: 3 pass / 3 fail, all failures the exact cancellation AssertionError. The test's `finally` cleans each still-locked native reader after capturing its defective state, so tests leave no stream behind. The owned counterfactual changes only the unique `close` line to release the reader before native cancellation. Its own full root compiler exits 0 and all six cases pass. Timeout reads may reject under that ordering; they settle and their Promise.race handlers already observe them. The fixture records String(error), so the decoder rejection's exact error shape is source-derived rather than independently asserted. This counterfactual is diagnostic evidence, not a repository repair or production-mutant coverage.

Six further independent controls exercise a real Durable Object Room with SQLite, the production HTTP client and endpoint, the actual shared MCP server and real `StdioServerTransport` over PassThrough streams. Their full root source/test compiler exits 0; all six pass. The final fixture SHA-256 is `c4403585ddb3abe95de9626ad3d2b857e4c2830d070f26c3d7a3270d36c7ac8b`.

- Admin own key under v1 and v2: identical HTTPS/stdio descriptors, with 15 and 16 tools respectively; generic act absent only under v1.
- Direct checker own key: notes and renamed generic checks are shown, claim/review are absent; changing the current role to member refreshes both transports.
- Client-held delegated checker: actual session under an exact `verify` grant; changing current `who.delegable` to false preserves the binding but removes generic check discovery; the grantor's undelegation makes both transports refuse subsequent discovery.
- Room-custody bearer: actual CLI-shaped `{key,session:true}` callback; mixed and all-stale maps refresh without rebinding; explicit builder selection retains its core reads despite the default observer override. Signed delegation map stays unchanged.
- Own-key stdio: an observer-unlisted claim is accepted by actual Room admission; after key revocation discovery is unauthenticated, while the original saved signed exact retry still returns the identical receipt and changes no sequence.

Stdio here uses the real transport and factory in-process, not a spawned CLI binary. The supplied three CLI tests separately exercise the actual binary against their fake Room harness and pass. The supplied 52 MCP Node tests pass, including descriptor/schema metadata, mandatory keys, lost-result retry controls, and recording waits; all 16 supplied real Room runtime tests pass, including bearer custody/current roles/maps, missing keys/no effect, accepted retries after activation, bearer revocation refusal, core reads, structured unknown IDs, and wait/no lease or log changes. These 71 supplied tests and twelve new independent baseline controls are the actual bounded coverage; none is a claim to all seven acceptance conditions or complete preserved Stage 5 coverage. Actual source `callerOf` authenticates the exact token then reads its stored delegation and current grantor role (`requests.ts:214–226`); HTTPS refreshes that private authenticated callback; the CLI callback uses a fresh authenticated `members` read (`main.ts:1194–1206`). The helper's explicit `{key,delegation}` association/expiry gaps alone do not demonstrate a flaw in invoked CLI paths. No such authority finding is claimed.

Evidence lives under this directory:

- `final-stream-controls/`: final fixture, runner, full typecheck/runtime logs, full Vitest JSON, exits/hash.
- `reader-release-diagnostic/`: matching fixture, runner, baseline and diagnostic source bytes, exact unique replacement, full typecheck/runtime logs, JSON, exits, restored source hash, and `diagnostic.diff`.
- `final-credential-controls/`: final real Room fixture, runner, full typecheck/runtime logs and complete 22-green JSON (six independent plus sixteen supplied).
- `initial-credential-controls-invalid-expectations/`: the valid, unchanged 52 MCP and 3 CLI baseline logs/JSON and their full compiler. Two private test failures in that first attempt had invalid expectations (a direct checker may note; only the grantor may undelegate). They are explicitly excluded as defect evidence and corrected in the final compiled fixture.
- `excluded-stream-attempt-compiler-invalid/`: excluded initial DOM overload compiler error; no runtime was run.
- `excluded-release-diagnostic-fixture-cleanup/`: excluded initial diagnostic fixture's cleanup TypeErrors and successful-only read counting, not green pairing or defect evidence. `initial-stream-controls-valid/` retains the earlier valid baseline; the final matching six-case pair is the only pairing used here.
- `source-baseline/`, `source-hashes.json`, `mcp-runtime-full.diff`, `mcp-runtime-relevant.diff`, `independent-test.diff`, `final-outcomes.json`, `restored-final.json`, and `evidence-manifest.json` preserve source, tests, actual assertions and restoration proof.

The producer report at `plans/README.md:2244–2450` is provisional and separately owes final reviewed-head composition, main/planner artifact reconciliation and gate reruns. Its 61 mutants over 48 marked guards remain unverified producer disclosures: no frozen runner/inventory/per-mutant compiler evidence was available here, and none was credited or rerun. No whole-root runtime suite was run in this bounded preflight. No known older client/UI issue was reclassified against this older base.

Every source edit was in this private clone and restored byte-for-byte. All private fixtures were removed after verifying they match frozen snapshots. Final HEAD is b359, tree `e62230977df83a44839e9d5925a8e51dda7befa0`, tracked diff and status both empty. Restored `run.ts` SHA-256 is `6ecffca9d1edd951c6d311cbcc32a5a997048a70557ec0883982cfcf9c2d222a`. The source snapshots are each verified against immutable HEAD. Final reports make no approval claim.
