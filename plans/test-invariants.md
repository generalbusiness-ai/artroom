# Test invariants and their witnesses

This file lists the invariants that Artroom's tests protect and, for each one, the test that is its witness. It is by group, not by case: a row names a `describe` block or one test, and stands for every case inside it. When you add an invariant, add a row. When you remove a witness, remove its row or name the witness that replaces it. [docs/testing.md](../docs/testing.md) says what makes a test useful and where a test belongs. Timings are in [plans/README.md](README.md).

How to read a row. "Rule" is a rule of [docs/protocol.md](../docs/protocol.md), or the request, review or plan that set the invariant. "Witness" is a test file and, in quotes, the start or a distinctive part of a `describe` or test title in it. A file with no title means the whole file. "Removed or replaced" says what request `ecbc722a` took out, why, and what still protects the invariant.

## Contract and policy

`packages/contract` has types only and no tests. Its witness is `packages/client/test/contract.types.ts`, which `npm run typecheck` compiles.

Policy files are in `packages/policy/test/`. `profile-corpus`, `integrity` and `budgets` also run in workerd, because their result depends on the runtime.

| Invariant | Rule | Witness |
|---|---|---|
| An invalid `v2` document never activates, and each refusal names the place. | R-DECL-24, R-DECL-26, R-POL-1 | `declared-acts.test.ts`: "refused documents" |
| A value of the wrong type anywhere in a document is refused, never thrown on. | R-DECL-24 | `declared-acts.test.ts`: "a value of the wrong type anywhere" |
| A document is bounded at exactly 1,048,576 canonical bytes, and a key named `constructor` or `prototype` hides nothing. | R-DECL-26 | `declared-acts.test.ts`: "names and sizes" |
| The binding changes exactly when the meaning changes. | R-DECL-15 | `declared-acts.test.ts`: "the binding identity" |
| The legacy vocabulary and the code-review declarations are frozen as the protocol states them. | R-DECL-1, section 33.7 | `declared-acts.test.ts`: "built-in data" |
| A document decides its kinds, steps, signers and grants by own properties only. | R-DECL-1, 4, 11, 17, 21; R-GEN-5; R-ADM-5 | `vocabulary.test.ts` |
| The evaluator conforms to the profile, the engine is the pinned one, and budgets refuse the same way in both runtimes. | R-EVAL-1, 2, 4, 5, 7, 9; R-CARRY-9 | `profile-corpus.test.ts`; `integrity.test.ts`; `budgets.test.ts` |
| Each rule kind gives a recorded outcome, and a decision replays from its digested, frozen context. | R-POL-2 to 7, R-OBL-5, R-EVAL-3 to 6 | `rules.test.ts` |
| A land prepared for reservation is compared by bytes, and a stage-specific rule cannot be bypassed. | R-POL-6, R-LAND-4, R-LAND-7 | `rules.test.ts`: "land (R-POL-6, R-POL-7)" |
| An engine fault or host limit records nothing and is retryable. | R-EVAL-5, R-ADM-9 | `faults.test.ts` |
| Evidence carries only under the platform's conditions, and policy can only narrow them. | R-CARRY-1 to 12, R-REV-2 | `carry.test.ts` |
| The admin boundary, sole-admin bootstrap, recovery lanes and policy activation hold. | R-ADMIN-1 to 9, R-REV-1 to 3, R-POL-9 | `admin.test.ts` |
| The default pack does what docs/policy-pack.md says, and every path has an owner who can meet `owner-review`. | R-OBL-2, review 4df45987 | `pack.test.ts` |
| The authoring helpers compile to a valid document, and globs overlap conservatively. | R-POL-1, R-POL-7, R-PATH-1 to 3 | `helpers.test.ts` |

### Removed or replaced

355 tests became 209 in Node. In workerd, 355 became 48.

- The workerd run of every file but three: the same suite in a second runtime, with nothing that differs.
- 82 validator tests, one per guard case, and a test that read the source for guard markers. Now one table of 64 rows and one wrong-type test of 16 places.
- `declared-guards-e.test.ts` (27) and `vocabulary.test.ts` (10) became 12: two files asserted the same functions.
- 14 forbidden-program tests became one table.
- 8 pack tests that asserted platform behaviour again with the demo policy. `carry.test.ts`, `rules.test.ts` and `admin.test.ts` hold it.

## Client

Files are in `packages/client/test/`.

| Invariant | Rule | Witness |
|---|---|---|
| Canonical bytes and signatures are fixed vectors, and a declared envelope's binding is inside the signed bytes. | R-SIG-1 to 3, R-ID-4, R-ID-10, R-DECL-16 | `signing.test.ts`; `workerd/signing.test.ts` |
| A prepared act is the handle's own frozen copy. | R-IDEM-2, review 43e8fe3b | `prepared.test.ts`: "a prepared act is the handle's own copy" |
| A target or body that is not plain data is `bad-request` before anything is signed or sent; a getter is refused and not called. | R-SIG-6, reviews 61b68774, b2043423 | `prepared.test.ts`: "a target or body that is not plain data" |
| A retry sends what was first built, also after the vocabulary changed. A handle drops no unanswered act: at 64, counting acts under way, it refuses a new one; a different act under a held key does not replace the one kept; a key carries one intent at a time. | R-IDEM-1, R-IDEM-2, R-DECL-16, reviews 6bf8d38a, 0b33e8cc, 2ee996f4, 17ce6443, 26231a05 | `prepared.test.ts`: "a retry sends what was first built" |
| A lost or cut-off answer is retried with the same bytes, a bounded number of times, with backoff. | R-IDEM-1 to 3, R-IDEM-6 | `room.test.ts`: "idempotent retries" |
| Refusals are values and failures are `ArtroomError`s. | R-API-1, R-ID-3 | `room.test.ts`: "refusals are values" |
| A watch resumes from its cursor, stops once when its credential is refused, and never reconnects after it is closed. | R-API-6 to 8, R-CRED-7 | `room.test.ts`: "resumable cursors" |
| No credential appears in anything the client returns or logs. | R-WS-4 | `room.test.ts`: "no credential in any output" |
| What `actsAt()` kept never takes a reader back behind an activation the handle has seen. | R-DECL-23 | `catalogue.test.ts` |
| The generic act signs exactly the binding the caller read, and grants are expanded before signing. | R-DECL-16, R-DECL-17, R-API-9, R-CRED-10 | `declared.test.ts` |
| A record and a thread are named under the declaration in force at their own seq. | R-DECL-23, section 33.10 | `titles.test.ts` |
| A lost join is recovered with the same bytes and the caller's clock; a lost room-custody redemption is never retried. | R-CRED-1 to 5, R-CRED-9, R-IDEM-2 | `redeem.test.ts` |
| The RPC update decoder owns its source, and its cancel and failures behave. | R-API-8, review 17013617 | `updates.test.ts` |
| The generated AGENTS.md block teaches the loop. | R-API-9 | `agents-md.test.ts` |

### Removed or replaced

144 tests became 99.

- Real waiting in retries and reconnects. The tests pass a `backoff` option, and `room.test.ts`: "the wait before each retry doubles" records the waits without waiting.
- 13 tests of the fake room's own behaviour. The Room holds those rules: `packages/room/test/workerd/roster.cases.ts`: "R-ADM-12 and R-CRED-9".
- `declared-a5d64b35.test.ts` (33), split by invariant into `prepared`, `catalogue`, `declared`, `titles` and `signing`.
- Variants in two review files that reached the same code.
- `contract.test.ts`, which asserted types at run time. `contract.types.ts` replaces it.

## Log

Files are in `packages/log/test/`. Only `golden.test.ts` also runs in workerd.

| Invariant | Rule | Witness |
|---|---|---|
| A log is sealed in the contract's order, publications chain by parent, and every decision replays. | R-LOG-2, R-LOG-8 to 11 | `golden.test.ts`: "protocol section 20" |
| Published history is never rewritten, and an unexpected writer stops the publisher. | R-LOG-8, R-LOG-11 | `golden.test.ts`: "publication" |
| The same log gives the same commit IDs in Node and in workerd. | R-ID-6 | `golden.test.ts`: "the same log gives the same commits" |
| A publication owns its cohort before any await, and later publications keep earlier retained evidence. | review ea4a9bd0 | `review-ea4a9bd0.test.ts`: "finding 1"; "finding 4" |
| The streaming publisher makes the commits the earlier publisher made, and `commitFor` gives the commit `publish` writes. | R-LOG-9, request 5a7290b9 | `bounded.test.ts`: "the same commits"; `review-a454cbaf.test.ts`: "commitFor" |
| Reads are bounded: only the open segment is read, in batches. | request 5a7290b9 | `bounded.test.ts`: "bounded reads" |
| A source that changes while it is read is `invalid-input`; a changed published entry is `would-rewrite`. | R-LOG-2 | `bounded.test.ts`: "guards" |
| A publication over one transfer is staged in parts, and recovers from a lost answer or a restart. | reviews f7d273e1, b618eca1 | `transfer.test.ts` |
| Git accepts what the publisher writes, and the ref moves only under its lease. | R-LOG-8 | `gitcli.node.test.ts` |
| The layout rules are the contract's reference functions, a closed segment never changes, and the layout follows the parent. | R-LOG-16 to 19 | `amendment-4.test.ts`: "the shared rules agree"; "acceptance cases (30.7): segments"; "the layout follows the parent" |
| An object over B is never written: a longer line or file is chunked and sent in parts. | R-LOG-18 to 20 | `amendment-4.test.ts`: "publication outcomes (R-LOG-20)"; "entries and files over B" |
| Verify names each layout failure. | section 30.6 | `amendment-4.test.ts`: "verify's layout checks" |
| The default limits fit together at real size. | R-LOG-18, R-LOG-19 | `amendment-4.test.ts`: "at the contract's own limits" |
| Each kind of tampering has a named reason, and the verified prefix ends before it. | R-LOG-10 | `tamper.test.ts` |
| Malformed content is a named failure, never a throw. | review ea4a9bd0 | `review-ea4a9bd0.test.ts`: "finding 3" |
| R-ADM-5 is judged when a delegation is granted and when it is used. | R-ADM-5 | `review-ea4a9bd0.test.ts`: "finding 2"; `amendment-2.test.ts`: "edit 3" |
| Recomputed, land and `notified` decisions replay under the policy pinned with their act. | R-LOG-13, section 27 | `amendment-2.test.ts`; `review-ea4a9bd0.test.ts`: "finding 5" |
| `check-carried` events replay under the version they name. | R-CARRY-13, section 29.8 | `amendment-3.test.ts` |
| A time that bounds authority is a valid RFC 3339 UTC time, and retained evidence is decoded per contract and digest. | reviews 07d3150e, a454cbaf | `review-07d3150e.test.ts`; `review-a454cbaf.test.ts` |
| `artroom verify` exits 0, 1 or 2, fetches the room's pinned heads, and says to a program and to a person what the run checked and that carry judgments are accounted for in part; with replay off it claims none of the checks it skipped. | R-LOG-10, R-DECL-25, request 42342e35 | `cli.node.test.ts`; `declared-obligations.test.ts`: "with replay off the report says so" |
| A retained context whose parts that verify reads by shape are wrong is `malformed`, in a report and never a throw, with replay on or off. | R-LOG-9, request 42342e35 | `declared-obligations.test.ts`: "a retained context that verify reads by shape is malformed ...", six cases, including a carry context's `evidence` |
| A signed check whose body lacks what verify reads later is `malformed` at its entry, never a throw. | R-OBL-3, review 63af1ce0 | `amendment-3.test.ts`: "a signed check with no input, or no integration" |
| A declared log is decoded by grammar, and an entry outside it is `malformed` at its seq. | R-SIG-4, R-DECL-2, R-DECL-16 | `declared-stage3.test.ts`: "condition 1: decoding by grammar (R-SIG-4" |
| Kind, binding, body, target and grants are judged under the document in force at the entry's seq. | R-DECL-1, 4, 5, 10 to 12, 16, 17, 21; R-ADM-5 | `declared-stage3.test.ts`: "condition 1: decoding by grammar, and kind" |
| A `v1` log verifies as it did, and a verifier that judged its `v1`-era entries by the `v2` declarations would fail it. | R-DECL-1, R-DECL-21, R-DECL-25 | `declared-stage3.test.ts`: "the legacy rule:"; "condition 3:"; `declared-legacy-negative.test.ts` (the whole log, under a verifier with that one fault) |
| A steps version or profile the verifier lacks stops verification as a limit, not as a failure. | R-DECL-14, R-DECL-22 | `declared-stage3.test.ts`: "condition 1: the steps version" |
| The calls admission had to make are derived, and a missing, extra or differing one is named. | R-DECL-20, R-DECL-25, R-ADM-1 | `declared-stage3.test.ts`: "condition 2:" |
| A `recover` op is judged by the role table of the legacy act it stands for, and is accepted only from an admin's own key. | R-DECL-21, R-GEN-5, R-ADMIN-5 | `declared-stage3.test.ts`: "a recover op is judged by the role table" |
| A `check-carried` event names an earlier act that ran the check step, whatever the kind is called. | R-DECL-18, R-CARRY-13 | `declared-stage3.test.ts`: "a check-carried event names an earlier act" |
| A reservation rests only on what the log shows: no blocking obligation is open at `land-evaluated`, and no newer check was skipped on the way to a carry. | R-LAND-4, R-CARRY-13, notes/2026-10-03-carry-accounting.md | `declared-obligations.test.ts`: "a reservation rests only on what the log shows" |
| A scope fixed by a template is not carried by the act, and a declared field is present only as the body's own field. | R-DECL-7, R-DECL-12 | `declared-stage3.test.ts`: "a thread whose scope is fixed"; "a declared field is present only" |
| Each obligation, review, reviewer and carry rule gives what the Room's rules give. | R-OBL-1 to 7, R-POL-5 to 7, R-CARRY-1 to 15 | `declared-obligations.test.ts`: "honest logs verify" |
| A forged context and a carry call left out or added are each named, and a `check-carried` judgement is accepted only when owed. | R-CARRY-1 to 14 | `declared-obligations.test.ts`: "a recorded context that differs"; "carry calls are derived"; "check-carried events are judged" |

### Removed or replaced

731 test runs (369 in Node, 362 in workerd) became 279.

- The workerd run of every file but `golden.test.ts` (351 tests): the same assertions in a second runtime.
- `amendment-4-large.test.ts` (14 tests at 8 to 40 MiB) and the 64 MiB staging case. The rules are the same at any limit.
- Git subprocess tests: 7 became 2.
- `declared-obligations.test.ts`: 40 forged-context tests, one per rule, became 4. The honest fixtures fail on the same breakage: a simulator with its own port of the Room's rules writes them.
- `declared-stage3.test.ts`: 53 tests, one verify per decoder rule, body rule or table row, became 12.

### Known gaps

- Verify cannot yet show that a carry judgment which did not carry is missing when nothing later carried. That needs the Room to record each carry pass: [notes/2026-10-03-carry-accounting.md](../notes/2026-10-03-carry-accounting.md). It stays owed under stage 3's condition 2.
- The log's test simulator now waits like the Room: it seals `land-evaluated` only when no blocking obligation is open. Six facts that the fixture used to show in honest reservation inputs are now shown by a forged `land-evaluated` event that verify refuses. One is not recovered: a land input that lists an objection as `basis: "here"` after it replaced a carried approval.
- A review count compared as `> 0`, not as the required count, changes nothing in the fixtures, whose counts are all 1.
- Section 30.7 gives its acceptance cases sizes. Only the entry of 8 MiB + 1 and the directory limit of 4,096 are tested at real size.

## Git

Files are in `packages/git/test/`, run by Node's test runner in one process.

| Invariant | Rule | Witness |
|---|---|---|
| A landing goes accepted, preparing, ready, publishing, landed, with one receipt. | R-LAND-1, R-LANE-10 | `landing.test.ts`: "a landing goes accepted" |
| After a crash at any of six points the restarted room completes forward and lands exactly once. | R-PUB-5, 7, 8 | `landing.test.ts`: "crash at" |
| A release, a new generation, a policy activation or a main move invalidates preparation. | R-LAND-3 to 9, R-POL-9 | `landing.test.ts`: "during preparation invalidates"; "readiness:" |
| Reservation checks authority, evidence and the land input again in one transaction. | R-LAND-4, R-LAND-7, R-ADMIN-8 | `landing.test.ts`: "R-LAND-7:" |
| One publication runs at a time: a failed push holds the slot, and a delayed push gives no second receipt. | R-PUB-1, 2, 4 to 6 | `landing.test.ts`: "a lease race on publication"; "a delayed" |
| An abort attempt revokes the tokens and never guesses the outcome. | R-REV-5, R-REV-6 | `landing.test.ts`: "the push is paused" |
| Every publication token is revoked, and a failed revocation is a durable debt with capped backoff. | R-PUB-3, R-WS-4 | `landing.test.ts`: "R-PUB-3:"; "review 14739925:" |
| The publication token is the mint ledger's until `pushToken` claims it, and the engine never retries a lost create. | R-MINT-2 to 7 | `landing.test.ts`: "mint lane B" |
| The mint ledger stores a record and a wake-up before each create, keeps unknown outcomes, and owes revocations by ID in bounded passes. | section 32, R-MINT-1 to 7 | `mints.test.ts` |
| The lane forks' read-token ledger keeps the same rules for each fork. | R-MINT-2 to 7, R-WS-3, R-PROP-1 | `fork-tokens.test.ts` |
| A workspace is a fork with one write token inside its lease, and no live token is ever left unowned. | R-WS-1 to 4, R-LANE-8, R-GEN-12; plans 001, 002, 004 | `workspaces.test.ts` |
| A snapshot repository holds one fixed commit, and is retired with every token. | R-CARRY-15, R-CARRY-16, plan 001 | `snapshots.test.ts` |
| Stored or shown error fields hold safe metadata only. | request d29c09fa, R-MINT-5 | `safe-errors.test.ts` |
| The memory repository the engine's tests use answers as the git publisher does over real git. | R-LAND-4, R-PUB-4, R-EXEC-2 | `git-publisher.test.ts`: "the memory repository answers" |
| A landing over real git lands the commit the preview showed, with the lane's commit unchanged. | R-LAND-4, R-PROP-7 | `git-publisher.test.ts`: "landing over real git" |
| Of two concurrent pushes on one main exactly one lands, and no hook runs. | R-PUB-4, R-EXEC-2, R-EXEC-6 | `gitops.test.ts`: "lease race:" |
| Pinning never moves a pinned ref, and a filtered snapshot is the commit anyone can compute. | R-PROP-1, 2, 7; R-CARRY-15, 16 | `gitops.test.ts`: "pinning:"; "filtered snapshot:" |
| `pushLog` moves the log ref only under the lease, and `stageLog` is safe to repeat. | R-LOG-8, R-LOG-20; reviews b618eca1, de5289a5 | `gitops.test.ts`: "pushLog"; "stageLog:"; "de5289a5:" |
| A push is never called refused when the ref may have moved. | R-PUB-5, R-LOG-20 | `push-outcome.test.ts` |
| The gateway lets through only the ref updates the operation was granted. | R-EXEC-1, R-EXEC-2 | `ref-fence.test.ts` |
| The first commit on a new repository is the commit git itself makes, and never moves an existing main. | R-GEN-12 | `first-commit.test.ts` |
| Path diffs match git, use every merge base, and are refused the same way every time when over a bound. | R-PROP-3, R-PROP-6 | `treediff.test.ts` |

### Removed or replaced

340 gate tests became 308. Outside the gate, 23 became none.

- `test-workers/`: nine landing tests in a stand-in Room written before the Room existed, and two gateway tests. `landing.test.ts` and the Room's workerd tests run the scenarios, and `ref-fence.test.ts` has the gateway.
- `test-log/` (12, never in the gate). `gitops.test.ts`: "stageLog:" compares each answer with the log package's model.
- Four jj tests. Two tested what jj writes; two merged into `gitops.test.ts`: "pinning:".
- 13 `gitops.test.ts` tests merged into `git-publisher.test.ts` and the lease race; ten staging tests became six.
- 11 push samples became one table.

### Known gaps

- Nested `transactionSync` rollback in real Durable Object storage has no direct test.
- The lease race still passes when the push uses `--force`. The lease is witnessed by `gitops.test.ts`: "a lease refusal at the push itself".
- Removing the `attr.tree` setting is not detected on git 2.54.
- Removing the limiter in `treediff.ts` alone is not detected: the read-ahead window bounds reads at the same number.

## Room

Workerd files are in `packages/room/test/workerd/` and Node files in `packages/room/test/node/`. A case file (`*.cases.ts`) holds tests and is loaded by one test file:

| Test file | Case files |
|---|---|
| `obligations-and-carry.test.ts` | obligations, review-a711f7b6, review-95323c2b |
| `roster-and-redemption.test.ts` | roster, request-c657d4ba, review-aabda1ed |
| `publication-and-workspaces.test.ts` | phase2b, review-8faa2ef9, review-1249097f |
| `jobs-and-snapshots.test.ts` | review-0f9739dc, review-271dbd53, review-786e9606, review-90f30a3b, snapshot-repos |
| `alarms-and-diagnoses.test.ts` | pin-delay, review-f060871b, request-d268d249, safe-errors-d29c09fa |
| `node/pure-parts.test.ts` | canonical, crypto, ids, glob, schema, secrets, diag, logremote, config |
| `node/deploy-and-source-rules.test.ts` | deploy, hygiene-55be0661, mint-sites-scan |
| `node/measure-scripts.test.ts` | checks, rows, spike-smoke, mcp-stage0 |

The workerd files share isolates (`vitest.workers.config.ts`), so a test must not rely on fresh module state. `declared-run.test.ts` is the exception: it has its own run (`vitest.declared.config.ts`), because the vocabulary switch is module state.

### Founding and deployment

| Invariant | Rule | Witness |
|---|---|---|
| One repository founds one room, an import needs an operator's grant, and a genesis edited after its draft is refused. | R-GEN-10 to 13, R-API-11, R-PUB-10 | `worker.test.ts`: "R-GEN-10, R-GEN-12: founding" |
| A new public room has one empty first commit, pushed with a token that is revoked before the genesis is sealed. | request b6b51de7 | `worker.test.ts`: "a newly founded public room" |
| One deployment founds public rooms and imports, each in its own namespace. | R-GEN-12, review a35b4b61 | `worker.test.ts`: "one deployment founds" |
| A delete reaches only an abandoned incarnation, and an alarm is stored before the first create is sent. | review 3eb7bc44, plan 004 | `worker.test.ts`: "review 3eb7bc44"; "plan 004" |
| An import grant's deadline is judged by the registry's clock, in the step of the first binding. | R-GEN-12, R-GEN-13 | `review-1249097f.cases.ts`: "2. an import grant's deadline" |
| `PUBLIC_URL` is required, the deployable config binds what the source reads, and the measurement scripts fail closed. | request 55be0661, assert 66a41558 | `node/deploy-and-source-rules.test.ts`; `node/measure-scripts.test.ts` |

### Admission and idempotency

| Invariant | Rule | Witness |
|---|---|---|
| Identifiers, canonical bytes, digests, signatures, closed shapes and globs have their exact forms. | R-ID-1 to 4, 7, 8; R-SIG-1 to 4, 6; R-PATH-1 to 3; R-GEN-1; R-LOG-12 | `acts.test.ts`: "identifiers and the sealed log"; `node/pure-parts.test.ts` |
| An act with a bad signature or outside the profile is not recorded, and authority is judged before the body. | R-SIG-1, 3 to 6; R-ADM-1, 8 | `acts.test.ts`: "R-SIG and R-ADM-1" |
| The same bytes return the original record once, and the same key with other bytes is refused. | R-IDEM-1 to 4 | `acts.test.ts`: "R-IDEM idempotency" |
| A secret in a body is refused, unrecorded and not repeated back. | R-SEC-1 to 4 | `acts.test.ts`: "R-SEC secret scanning" |
| A runtime failure before admission records nothing, and the same bytes are admitted afterwards. | R-ADM-9, R-PROP-1 | `acts.test.ts`: "R-ADM-9:" |
| Acts sent at once get gapless sequence numbers in one signed hash chain. | R-LOG-1, 2, 4; R-ADM-6 | `acts.test.ts`: "concurrent admission" |
| Authority that runs out while policy is evaluated is judged again before the act commits. | R-ADM-4, R-ADM-6 | `review-aabda1ed.cases.ts`: "P1.3" |

### Lanes, proposals and workspaces

| Invariant | Rule | Witness |
|---|---|---|
| A lane is opened, rescoped, fenced by lease generation, taken over and expired by the object's alarm. | R-LANE-1 to 8, R-ADM-11, R-PATH-3 | `acts.test.ts`: "R-LANE lanes and leases" |
| A proposal pins its head as the next generation, within the fork, the claim and the diff bound. | R-PROP-1 to 6, R-LANE-4, R-POL-1, R-ADMIN-1 | `acts.test.ts`: "R-PROP proposals" |
| A landing lands exactly the previewed commit. | R-PROP-7 | `phase2b.cases.ts`: "previews from lane B's planner" |
| A workspace token is the holder's alone, for the current lease, and appears in no output. | R-WS-1 to 4 | `acts.test.ts`: "R-WS workspace credentials" |
| A workspace token never outlives its lease or the lease's deadline, and a pending workspace is durable alarm work. | R-WS-2, R-CRED-8, R-LANE-8 | `phase2b.cases.ts`: "workspace lease races"; `review-8faa2ef9.cases.ts`: "2. a workspace is fenced"; `review-aabda1ed.cases.ts`: "P2.6" |
| The production adapters refuse what they cannot prove. | R-GEN-12, R-PROP-1, R-LOG-8 | `phase2b.cases.ts`: "the adapters' boundaries" |

### Reviews, checks, obligations and carrying

| Invariant | Rule | Witness |
|---|---|---|
| Obligations come from the require rules on the paths changed, and a review counts only from a qualified member other than the author. | R-OBL-1, 2, 4 to 6; R-LAND-1 | `obligations.cases.ts`: "R-OBL review obligations" |
| A compromised reviewer's approval stops counting. | R-REV-1 to 3 | `obligations.cases.ts`: "R-REV revocation and evidence" |
| A verdict carries to the next generation until a dependency changes. | R-CARRY-1, 2, 5, 11 | `obligations.cases.ts`: "Carrying through the policy port" |
| A check binds the preview's integration, the active configuration and the tree, and only the named checker may sign it. | R-OBL-3, R-LAND-1 | `obligations.cases.ts`: "R-OBL-3 checks" |
| A `land-evaluated` or `check-carried` event is sealed only if the facts it was judged on still hold at the seal; otherwise it is judged again. | R-LAND-4, R-CARRY-13, notes/2026-10-03-carry-accounting.md | `acts.test.ts`: "a land evaluation is sealed only for the state"; "a carry judgment is sealed only on the facts" |
| A kept land evaluation is used only under the policy version that made it. | R-LAND-4, R-LAND-5, review 7dabf862 | `acts.test.ts`: "a kept land evaluation is used only under the policy version" (also under `v2`) |
| A carry pass ends once another policy version is active or its obligation is no longer the version's; nothing more is sealed. | R-CARRY-13, R-LAND-5, review 29551590 | `acts.test.ts`: "a carry pass ends when its obligation is gone" (also under `v2`); "an activation that overtakes a carry pass" |
| Every check carry judgement is a sealed event, counts only under the policy version that judged it, and needs a pinned runner. | R-CARRY-13, R-CARRY-14, R-LAND-7, R-EXEC-10 | `acts.test.ts`: "R-CARRY-13"; `review-a711f7b6.cases.ts`: "1. a stored check carry"; "4. check carry needs" |
| A scoped check binds the snapshot commit recorded for its own integration, and carries only when main moved outside its inputs. | R-OBL-3, R-CARRY-6 to 10 | `review-a711f7b6.cases.ts`: "4d."; `review-95323c2b.cases.ts`; `phase2b.cases.ts`: "policy activation and recompute" |
| An advisory obligation never blocks a landing. | R-OBL-7, R-REV-3 | `acts.test.ts`: "R-OBL-7" |
| Sealed obligation effects come from the same calculator as the projection, and evidence stored without admission facts never adds eligibility. | R-LOG-10 | `review-aabda1ed.cases.ts`: "P2.7"; `review-8faa2ef9.cases.ts`: "4. checks use"; "5. evidence stored" |
| A job goes over the checker's service binding with a read token that is revoked after the answer. | R-EXEC-8 to 10 | `acts.test.ts`: "R-EXEC-8 to R-EXEC-10" |
| An unanswered attempt ends at its deadline, two jobs steps at once send one attempt, and work that is no longer current is not sent. | R-EXEC-8 to 10, R-OBL-7 | `review-0f9739dc.cases.ts`; `review-786e9606.cases.ts` |
| A filtered job reads a repository made for its snapshot commit only. | R-CARRY-15, R-CARRY-16, R-GEN-12 | `snapshot-repos.cases.ts` |

### Landing, reservation and policy activation

| Invariant | Rule | Witness |
|---|---|---|
| A release, a new generation, a new objection or a lost role before reservation ends the operation as retryable. | R-LAND-6, 7, 9 | `acts.test.ts`: "R-LAND-6, R-LAND-7 and R-LAND-9"; `phase2b.cases.ts`: "reservation-time re-validation" |
| A policy activation during preparation fences the operation, and obligations are judged again under the new requirement. | R-POL-9, R-LAND-5, R-PUB-9, R-REV-1 | `acts.test.ts`: "R-POL-9, R-LAND-5"; `review-aabda1ed.cases.ts`: "P1.4" |
| Acts admitted while a reservation is held carry `after`, and an abort attempt's outcome is what happened to the push. | R-LAND-8, R-REV-5 to 7 | `acts.test.ts`: "R-LAND-8 and R-REV-7"; `phase2b.cases.ts`: "abort attempts" |
| An open objection refuses the land act, a land rule sees its stage, and unchanged state builds the same input bytes at reservation. | R-POL-6, R-POL-7, R-LAND-4 | `acts.test.ts`: "R-POL-7:"; "R-POL-6, R-LAND-4" |
| A recovery lane is judged by no policy rule and needs an admin's own key. | R-ADMIN-2, 5 to 9 | `acts.test.ts`: "R-ADMIN configuration recovery" |
| A push with an unknown outcome is settled by reading main back. | R-PUB-3, 5, 7 | `phase2b.cases.ts`: "unknown-outcome publication recovery" |
| A room founded before the canonical remote was stored resolves it before landing work. | R-GEN-13 | `review-a711f7b6.cases.ts`: "3. a room founded" |

### Roster, delegation, redemption and sessions

| Invariant | Rule | Witness |
|---|---|---|
| Only an admin invites, an invitation is used once, and the last admin cannot be removed. | R-GEN-4 to 8, R-ID-5 | `roster.cases.ts`: "R-GEN roster" |
| A member's key, a delegated key and the recovery key each act only within their own authority. | R-ADM-3 to 5, R-IDEM-2, R-GEN-3 | `roster.cases.ts`: "R-ADM-3 authority cases" |
| Custody is fixed by the admission path, and a bearer is shown once and never logged. | R-ADM-12; R-CRED-3, 6, 7, 9; R-SEC-5 | `roster.cases.ts`: "R-ADM-12 and R-CRED-9" |
| A redemption gives a session only for a join it admitted, a refused join is never recorded, and join attempts are limited. | R-CRED-9, R-GEN-6, R-ADM-8 | `request-c657d4ba.cases.ts` |
| A join whose reply was lost is recovered with the same bytes. | R-IDEM-2, R-CRED-5, R-CRED-9 | `worker.test.ts`: "a join whose reply was lost" |
| A room-custody redemption is all or nothing, and a revoked key never becomes the recovery key. | R-CRED-3, R-CRED-9, R-ADM-3, R-ADM-12 | `review-aabda1ed.cases.ts`: "P1.1"; "P1.2" |
| A `*` delegation is fixed at the grant. | R-ADM-5, R-LOG-10 | `review-8faa2ef9.cases.ts`: "'*' is fixed at the grant" |

### Declared acts

| Invariant | Rule | Witness |
|---|---|---|
| Vocabulary: a room has one, its active document's, and becomes `v2` only by landing a `v2` document. | R-DECL-1, R-DECL-15, R-ADM-1 | `declared-fd6f00b6.test.ts`: "one vocabulary per document" |
| `who.roles` decides who may sign a declared kind, and `recover` is for an active admin's own key only. | R-DECL-11, R-DECL-21, R-ADMIN-5 | `declared-fd6f00b6.test.ts`: "who may sign"; "recover, the platform kind" |
| Step 4a: an undeclared kind and a wrong binding are refused unrecorded, and an exact retry gets its receipt across any change. A change of an act's targets, scope source or lease length makes an earlier signature stale, and no landing starts. | R-DECL-16, R-IDEM-2, R-SIG-4 | `declared-fd6f00b6.test.ts`: "step 4a" |
| A take-over may bring a new scope: the scope and the lease generation move, and an overlap with an exclusive held thread is refused. | R-DECL-7, R-DECL-9 | `declared-fd6f00b6.test.ts`: "take-over with a new scope" |
| A grant is a signed map from kind to binding, and never gains a kind across a change of vocabulary. | R-DECL-17, R-ADM-5 | `declared-fd6f00b6.test.ts`: "grants carry the bindings" |
| A room-custody session is judged when its invitation is admitted and again when it is redeemed. | R-DECL-17, R-CRED-3, R-CRED-10, R-IDEM-2 | `declared-fd6f00b6.test.ts`: "room-custody sessions" |
| Threads: an act acts only on thread kinds its declaration names, by the step it names, and a thread keeps the lease it recorded. | R-DECL-5, 6, 8, 9, 21, 23; R-EVAL-3 | `declared-fd6f00b6.test.ts`: "threads have kinds"; "what policy sees"; "the lease rule" |
| A declared field is the application's and never selects recovery. | R-DECL-12, R-DECL-21 | `declared-fd6f00b6.test.ts`: "a declared act's body" |
| Wording: a refusal's words come from the declaration, filled only with the room's own facts. | R-DECL-13, R-ADM-6 | `declared-fd6f00b6.test.ts`: "refusal wording" |
| A landing at reservation, and a workspace request, are judged as a new admission would be. | R-LAND-7, R-DECL-17, R-ADMIN-8, R-CRED-5 | `declared-fd6f00b6.test.ts`: "a landing in flight"; "a workspace request" |
| Records: an old record is read under the declarations of its own seq, and a thread is named by its opening act. | R-DECL-23, R-API-3 | `declared-stage5-a5d64b35.test.ts`: "old records are read"; "a thread's kind" |
| Check jobs: a job names the kind and binding to sign, as in force when it is sent. | R-DECL-18, R-EXEC-8, R-OBL-3 | `declared-fd6f00b6.test.ts`: "check jobs in a v2 room"; `declared-stage5-a5d64b35.test.ts`: "a declared check step" |
| A document the room cannot run or store never activates, and the active document is parsed once per version. | R-DECL-24, R-DECL-26 | `declared-fd6f00b6.test.ts`: "a document the room cannot store or run"; "the active document" |
| Migration 4 adds its six columns once, from each stored version, and the declared path writes no more rows per act than the legacy path. | R-DECL-6, R-LOG-10, request fd6f00b6 | `declared-fd6f00b6.test.ts`: "migration 4"; "the same session" |
| The code-review declarations judge envelopes, targets, bodies, roles and grants as the legacy vocabulary does, message for message. | R-DECL-4, 5, 11, 12, 17 | `node/declared-equivalence.test.ts`; `node/declared-steps-a5d64b35.test.ts` |
| The real Worker and the client agree on the declarations read, bindings, named methods, grants and the MCP `act` tool. | R-DECL-16, R-DECL-17, R-API-9, R-CRED-10 | `declared-stage5-a5d64b35.test.ts` |

### The declared witness set

`declared-run.test.ts` gives every room a `v2` document, applies the four fixture conversions of `vocabulary.ts`, and loads three files a second time. A pattern picks the tests of each file that run; the others are skipped there and run as written in their own file. Its last group, `declared-run.test.ts`: "the declared run itself", fails if a file ran no test or a conversion was never applied.

| What still works through the declarations | Conversion | Tests that run under `v2` |
|---|---|---|
| Lanes, leases and a version with its pin; review, land, reservation, an activation during preparation, and recovery through `recover`. | bindings, recover | `acts.test.ts`: names with "R-LANE", "R-PROP-1, R-PROP-2", "R-ADMIN", "R-LAND-7: reservation", "policy activation during preparation" or "builds the same bytes at reservation" |
| Review and check obligations and revoked evidence, with a `v2` checker configuration. | checker-v2 | `obligations.cases.ts`: "R-OBL-3", "R-OBL-5", "R-LAND-1", "R-REV-3" |
| The roster op table, and delegations and a room-custody session as signed maps. | grant-maps | `roster.cases.ts`: "R-GEN-4", "R-ADM-3b", "R-ADM-4", "R-ADM-5", "MCP redemption" |

No other test runs a second time under `v2`: not founding, secret scanning, log construction and publication, mint and token work, snapshots, the HTTP, WebSocket and MCP routes, concurrency, carrying, aborts, workspace credentials, or any case file of a review or request. This is accepted because the Room dispatches by step and both vocabularies run the same handlers. What differs under `v2` is tested directly in `declared-fd6f00b6.test.ts`.

### Publication, log and tokens

| Invariant | Rule | Witness |
|---|---|---|
| The log is built and published as in the protocol's worked example, and a notify failure never changes the claim. | R-LOG-2, 7, 8, 10, 12, 13 | `log-tokens.test.ts`: "section 23, Log construction" |
| Publication reads the Room's SQLite in bounded batches, and stages a publication larger than one transfer in parts. | request 5a7290b9 | `log-tokens.test.ts`: "publication reads and sends" |
| A pending publication completes forward, accepts only the confirmed parent or the exact pending commit, and never forces the ref. | R-LOG-8 | `review-aabda1ed.cases.ts`: "P1.5"; `review-8faa2ef9.cases.ts`: "1. recovery accepts only"; `review-1249097f.cases.ts`: "1. a pending cohort" |
| The log a real session produces verifies offline, with every decision replayed. | R-LOG-10 | `phase2b.cases.ts`: "offline replay" |
| Every canonical token is minted under a ledger record of its site, and no production source reaches `createToken` outside the ledgers. | R-MINT-1, R-MINT-3 | `log-tokens.test.ts`: "R-MINT-1:"; `mint-sites-scan.cases.ts` |
| A ledger's wake-up is a stored alarm in place before the create, and a fresh object takes an unanswered mint over as unknown. | R-MINT-2, R-MINT-5 | `log-tokens.test.ts`: "mint lane B"; "mint lane F" |
| A job token ends before the job's deadline, and nothing is sent on a mint whose outcome is unknown. | R-EXEC-9, R-EXEC-10, R-MINT-2, R-MINT-4 | `log-tokens.test.ts`: "a check job's deadline"; "a whole-tree job's token mint"; `review-90f30a3b.cases.ts`; `review-271dbd53.cases.ts` |
| An ended job token's revocation is bounded and retried, and ended tokens and due jobs are taken 20 at a time. | R-MINT-7 | `log-tokens.test.ts`: "an ended job token's row"; "R-MINT-7:" |
| A room stored before the due indexes and the error scrub gets them at its next start. | reviews 993dce7a, 31ad41d5 | `log-tokens.test.ts`: "the due indexes reach" |

### MCP and HTTP

| Invariant | Rule | Witness |
|---|---|---|
| The HTTPS routes answer with the record, a refusal or an `ArtroomError`, never cacheable, and read at most 1 MiB of a body. | R-API-1, 3, 8 | `worker.test.ts`: "HTTPS routes and the RPC entrypoint"; "request 55be0661 (SEC-11)" |
| Pages resume after the last item, and cursors never skip an item. | R-API-5 to 9 | `worker.test.ts`: "R-API reads, cursors and waits"; `review-aabda1ed.cases.ts`: "P2.8"; `review-8faa2ef9.cases.ts`: "3. attention made later" |
| A WebSocket's token is judged before the upgrade, and the socket is closed when its key is revoked. | R-API-8, R-API-12, R-LOG-11 | `worker.test.ts`: "R-API-8, R-API-12: live updates" |
| A bearer's acts are the room's, signed under its delegation, and listing a tool is not permission. | R-CRED-3, R-CRED-10, R-API-9, R-API-13 to 15 | `worker.test.ts`: "bearer acts and the MCP route" |
| The Room gives its MCP endpoint the caller's role now and the grant as signed. | R-API-14 | `worker.test.ts`: "the Room gives its MCP endpoint" |
| A bearer session ends with its grantor: a revoked grantor key or a member who is not active ends acts, requests and exact retries as it ends reads, while a kept signed envelope still gets its record. | R-CRED-10, R-IDEM-2, request 5d41ea36 | `worker.test.ts`: "a bearer session ends with its grantor" |

### Alarms, idle cost and diagnoses

| Invariant | Rule | Witness |
|---|---|---|
| An idle room writes nothing, failing work backs off to a cap, and a room whose repository is gone stops and keeps what it owes. | request 3da1d82b | `log-tokens.test.ts`: "request 3da1d82b:" |
| The next alarm is the earliest of the room's six due times, and scheduling reads a bounded number of rows. | R-LANE-8, R-MINT-7, request 8bd623cc | `pin-delay.cases.ts`: "six due times"; "bounded reads" |
| A cleanup pass that waits on Artifacts gives the room a bounded future wake, never an immediate one. | R-PUB-3 | `review-f060871b.cases.ts` |
| A fresh object schedules the debt it finds. | R-MINT-2, follow-up c9cd4cd8 | `log-tokens.test.ts`: "follow-up c9cd4cd8 (2)"; `snapshot-repos.cases.ts`: "follow-up c9cd4cd8 (2)" |
| A failure before admission or a catch-all 5xx is logged once, redacted and bounded. | R-PROP-1, R-SEC-5, request d268d249 | `request-d268d249.cases.ts`; `diag.cases.ts` |
| Stored error fields hold safe metadata only, and older rows are rewritten in bounded batches. | request d29c09fa | `safe-errors-d29c09fa.cases.ts`; `worker.test.ts`: "request d29c09fa" |

### Removed or replaced

- The declared run of the whole workerd suite: 540 test runs became 32 tests and one test of the run itself. Two more were added with the repairs of reviews `7dabf862` and `29551590`.
- 115 per-condition guard tests and 51 audit tests, merged with the 53 of `declared-fd6f00b6.test.ts` into 38, one witness per invariant. Dropped with no replacement: states that acts cannot reach, and the policy cache's size of four.
- 133 Node tests, one per field of each step and recover op, became one loop of 116 cases in `node/declared-equivalence.test.ts`.
- `declared-stage5-a5d64b35.test.ts`: 38 became 9. The rest repeated what `packages/client` and `packages/mcp` test against their doubles.
- 24 core files (277 tests) became `acts.test.ts`, `worker.test.ts` and `log-tokens.test.ts` (135), with helpers in `core-support.ts`.
- Counts the property does not depend on: 60 parallel acts became 24, and 150,000 pending pins became 1,000.
- Mint and token tests that repeated the ledger's own rules: 16 tests at eight mint sites became one walk, `job-token-mint` 13 became 4, `fork-token-02836f9a` 8 became 1. The rules are in `packages/git/test/mints.test.ts` and `packages/git/test/fork-tokens.test.ts`.
- MCP tests with nothing the Room adds (`mcp` 10 became 4, `mcp-core-9ca1d290` 21 became 4). `packages/mcp` shows them over a fake room.
- 19 further workerd files (284 tests) became case files (228). Gone: 22 diagnosis tests per credential syntax and call site, whose table is in `diag.cases.ts`, and carry cases that `packages/policy/test/carry.test.ts` holds.
- 17 Node files (237 tests) became 3 (140): 82 one-per-row tests became one test per table.

### Known gaps

- Request `ecbc722a` first removed or weakened the witnesses of some acceptance cases of the protocol. An audit of every acceptance table (sections 23, 29.6, 30.7 and 33.5) against the test code found them after the reduction was approved, and each is restored:
  - section 33.5, stage 2, in `declared-fd6f00b6.test.ts`: the same-shape change; the hold change by scope source; a real grant signed before its kind changed; the `v1`-era grant limited to `review` and `check`; the take-over with a new scope, both parts; migration 4 from stored versions 1 and 2;
  - section 33.5, stage 1, in `packages/policy/test/declared-acts.test.ts`: "a third step", and the refusal half of the historical opening kind;
  - section 33.5, stage 5, in `declared-stage5-a5d64b35.test.ts`: a generic check under a binding its grant does not name;
  - section 30.7, in `packages/log/test/amendment-4.test.ts`: the large notification, and the recomputed obligations of the large activation;
  - section 29.6, in `packages/checkers/test`: concurrent jobs in both directions, and the earlier job's token after a configuration change;
  - section 23, in `packages/client/test/room.test.ts`: the `Room` handle yields the same updates.
- The lesson is in [docs/testing.md](../docs/testing.md): an acceptance case is an invariant, and its witness is removed only with its replacement named.
- Some acceptance cases are still witnessed, but at a lower level than before the reduction. They are kept that way, and named here so that a reader can judge:
  - three carry-plan cases of section 23 (the room default `src/lib/**`, `package-lock.json`, `.artroom/policy.json`) are shown by the evaluator in `packages/policy/test/carry.test.ts`, no longer also through a Room;
  - four stage 5 cases are shown against the client's and the MCP server's stand-in room, no longer also against a real Room: named methods where `claim` differs, a grantor's role that lost the kind over MCP, every kind refused on the generic MCP path in a `v1` room, and the MCP `act` tool naming the thread;
  - the retained-file placement of section 30.7 is asserted by literal paths for seven files, no longer by the reference layout for every file;
  - a bearer workspace called directly on `RoomWire`, the sequential canonical-name alias, and the client-side bearer receipt after revocation have one witness each where they had two.
- Only one `v2` session's log is published and verified in the Room. `v2` logs with checks, revocations and carried verdicts are verified only in `packages/log`.
- The room's whole suite no longer runs under the `v2` declarations. That demand is superseded, not owed: section 33.6 of the protocol now states the witness set above as the criterion. The gap that remains is a fault that shows only when some other legacy test runs under `v2`.

## Checkers

Files are in `packages/checkers/test/`. Only `git.test.ts` and `sandbox.test.ts` start real processes.

| Invariant | Rule | Witness |
|---|---|---|
| A job binds only if it is well formed, for this room and checker, unexpired, and reads one repository in an accepted namespace. | R-OBL-3, R-EXEC-3 | `job.test.ts` |
| A job arrives only over the service binding, and the shipped configurations are valid. | R-EXEC-8, R-EXEC-10, R-OBL-7 | `worker.test.ts` |
| The check binds its job, states `volatile` as the job does, shows the measured runner digest, and is signed as its job says. | R-OBL-3; R-EXEC-5, 10, 11; R-DECL-18 | `handle.test.ts`: "the check is machine-labelled"; "the check is signed as its job says" |
| The read token goes to the job's gateway and never into the sandbox. | R-EXEC-3 | `handle.test.ts`: "the read token goes" |
| A checker passes only if every step exits 0, and a checkout the runner cannot confirm fails the check. | R-EXEC-4, R-CARRY-9 | `handle.test.ts`: "pass only if every step exits 0"; "a checkout the runner cannot confirm" |
| A job that contradicts the checker's volatility or the measured runner digest is refused. | R-EXEC-10, R-EXEC-11 | `handle.test.ts`: "R-EXEC-10:"; "R-EXEC-11:" |
| Each job's check goes to the job's own room, and a room's refusal is the answer. | R-EXEC-8 | `handle.test.ts`: "one service serves many rooms"; "a room's refusal" |
| No container runs two jobs, each runner has one owner, and a runner failure is `unavailable`, never a failed check. | R-EXEC-1, R-EXEC-3, review c46a4491 | `handle.test.ts`: "G1:"; "G2:"; `sandbox.test.ts` |
| The service reads only its own copy of the job, the reviewer's check is advisory, and output over the limit is `payload-too-large`. | R-OBL-2, R-OBL-7, R-EXEC-5 | `handle.test.ts`: "G3:"; "G4:" |
| The checkout is the exact integration with no history, and a scoped job reads only its own snapshot, by any route. | R-EXEC-4, 6, 7; R-CARRY-9, 16 | `git.test.ts`: "checkout fetches"; "a scoped job reads only"; "concurrent jobs, different snapshots" |
| The snapshot commit ID the Room derives is the commit the publisher writes. | R-CARRY-15 | `git.test.ts`: "the Room's snapshot commit ID" |
| The real tools run the project's tests in the checkout, and the reviewer reads the change against the job's base. | R-EXEC-10 | `git.test.ts`: "tests checker:"; "LLM reviewer:" |

### Removed or replaced

48 tests became 36.

- `declared-guards-f.test.ts` (3 tests, 11 cases), written so each type guard had a red test. Two rows of the `job.test.ts` table hold the rule.
- Real npm, real git and real processes for what are decisions over the runner and container interfaces. Those run on an in-memory container. One real `npm ci` and `npm test` stay.
- `carry.test.ts` (10), each of which built a git fixture to get a job.
- Three tests of `test/ledger.ts`, which is test code.
- Three tests of the snapshot repositories, which `packages/git/test/snapshots.test.ts` holds.

### Known gaps

- Two hand edits to npm's environment (`HOME`, `npm_config_cache`) turned no test red: the fixture project has no dependencies.

## MCP

Files are in `packages/mcp/test/`. The package has no workerd run. The handler inside workerd, with the real Room behind it, is witnessed by `packages/room/test/workerd/worker.test.ts`: "bearer acts and the MCP route", which must stay.

| Invariant | Rule | Witness |
|---|---|---|
| The tools are exactly the contract's, and validation names each problem. | R-API-9 | `schema.test.ts` |
| Sixteen descriptors have titles, annotations and output schemas that every success and refusal fits, in both wire formats. | R-API-13 | `mcp-core-9ca1d290.test.ts`: "descriptors:"; `stage0.test.ts` |
| The endpoint needs a bearer, a refusal is a value, and acts are signed by the room under the bearer's delegation. | R-API-1, R-CRED-3, R-CRED-10, R-WS-5 | `server.test.ts`; `amendment-2.test.ts` |
| Every act tool requires `idempotencyKey`, and the same call again gives one act. | R-API-9 | `mcp-core-9ca1d290.test.ts`: "every act tool requires idempotencyKey" |
| A wait is a bounded read that holds nothing and ends with the current state. | R-API-15 | `mcp-core-9ca1d290.test.ts`: "waitMs is a whole number"; "an attention wait ends" |
| `tools/list` follows the caller's authority, read afresh, and listing is not permission. | R-API-14 | `mcp-core-9ca1d290.test.ts`: "toolsets:"; "listing is not permission" |
| `acts` and `act` pass the caller's kind, target, body, binding and key unchanged. | R-DECL-16, R-DECL-23 | `declared-a5d64b35.test.ts` |
| A tool name or input key is an own property only, and the route reads at most 1 MiB of a body. | review f47a509c, request 55be0661 | `review-f47a509c.test.ts`; `body-cap.test.ts` |
| The stdio server speaks newline-delimited JSON-RPC for a member's own key. | R-CRED-2 | `stdio.test.ts` |

### Removed or replaced

154 tests became 103.

- The workerd run. `body-cap.test.ts` moved to the Node run unchanged.
- 45 tests, one per row of a table, became one test per table.
- Five tests whose list or limits another test asserts.

## CLI

Files are in `packages/cli/test/`.

| Invariant | Rule | Witness |
|---|---|---|
| The loop a person types works end to end against real git, with exit codes 0 to 3. | R-WS-4, R-API-1 | `cli.test.ts`: "the loop, as a person types it" |
| A refused login leaves no key, and a lost login answer is finished by the same command. | R-IDEM-2, R-CRED-9, R-CRED-11 | `cli.test.ts`: "joining" |
| No credential reaches the output, from the client or from a room that echoes one. | R-WS-4 | `cli.test.ts`: "credentials never reach the output" |
| `artroom mcp` shows a caller the tools its own authorization allows. | R-API-14 | `cli.test.ts`: "artroom mcp:" |
| Login and redeem keep their journal entry until every local step is done. | R-IDEM-2, R-CRED-9 | `journal.test.ts`: "login and redeem finish locally" |
| A retried act is the act first sent, and needs no new authority to get its receipt. | R-IDEM-2, R-IDEM-6 | `journal.test.ts`: "a retried act is the act first sent"; "a journaled signed act" |
| An interruption at any local step is finished by the same command with one act, and `artroom wait` follows the landing already started. | R-IDEM-2, R-CRED-10, R-API-5 | `journal.test.ts`: "the act journal outlives"; "the landing follow-up" |
| A recovered claim or landing changes the selection only if its revision is unchanged, and newer config files are refused. | reviews 80d3710c, f30be7f6 | `journal.test.ts`: "a recovered claim or landing"; "older config and journal files" |
| A workspace reserves its destination before its first await, and installs only if it still owns it at the end. | reviews 744a018a, f30be7f6 | `workspace.test.ts`: "the reservation is made" |
| The installed record, the pending installations and the reservation are separate evidence. | reviews 4758945b, 7040317d, c033fb54 | `workspace.test.ts`: "the installed credential's record" |
| A release removes exactly the credential of the lease it released. | reviews 80d3710c, f7c79158, 17013617 | `workspace.test.ts`: "a release is bound" |
| The destination lock names its holder, and whatever is in the way is named and never removed. | reviews 4758945b, 7040317d | `lock.test.ts` |
| `artroom act` signs under the binding the user gave, and a receipt is in the words of the act's own seq. | R-DECL-16, R-DECL-23, R-IDEM-2 | `declared.test.ts` |
| A run that finishes a saved act says what it did: sent it again, or found its answer already kept and sent nothing. | R-IDEM-2, review 4872a4a1 | `declared.test.ts`: "a saved act whose answer the journal already holds" |
| Nothing the room sends can add a git setting or a shell word. | request 55be0661 | `hygiene.test.ts` |

### Removed or replaced

201 tests became 132.

- 43 hygiene tests, one per table row, became four table tests.
- 10 tests, one per interruption point, became tests that stop the same command at each step in turn.
- Lock tests in eight processes became one other process that plays every case.
- Seven of eight runs of the real bin. `cli.test.ts`: "the real bin serves" stays.

### Known gaps

- A recoverer that removes the lock without checking the stopped holder's token is not caught. It needs two recoverers racing.
- `artroom wait OP` clearing a followed landing that is not `OP` is not caught.

## UI

Files are in `packages/ui/test/`. The browser suite `packages/ui/e2e` is not in the gate.

| Invariant | Rule | Witness |
|---|---|---|
| A stale meaning is never sent without the person confirming. | R-DECL-16 | `acts-screen.test.tsx`: "a meaning that changed behind the form" |
| An act whose outcome is unknown outlasts a failed read of the room's acts: no new act is sent, by the form or by confirming a new meaning, and asking again settles the same act once. | R-IDEM-2, reviews 0b33e8cc, 12b1e0a9 | `acts-screen.test.tsx`: "an unresolved act outlasts a failed read"; "confirming the new meaning sends nothing while" |
| A lost answer is shown as unresolved, and asking again sends the same act with the same key. | R-IDEM-2, review fb27de86 | `acts-screen.test.tsx`: "an answer that was lost" |
| A form is built from the declaration, and the declared limits are checked before anything is sent. | R-DECL-12 | `acts-screen.test.tsx`: "the form is built"; `acts-fields.test.ts` |
| The page's catalogue never goes back behind an activation it confirmed. | R-DECL-23 | `live-catalogue.test.ts` |
| Every record is shown under the declarations of its own seq. | R-DECL-23, section 33.10 | `declared-rendering.test.tsx` |
| The five screens show what the README says they show. | README | `screens.test.tsx` |
| The live adapter never asks for a workspace token, and shows a partial read as partial. | R-WS-4, review 82f2743b | `live-room.test.tsx` |
| The page says of a publication only the recorded read-back and abort facts. | section 14 | `publication.test.tsx` |
| An advisory check is never shown as blocking, and a carried check's reason comes from its own event. | R-OBL-7, R-CARRY-13 | `checks.test.tsx` |
| The per-change history and its interdiff bound their work, and say when they cannot tell. | request d0cbb26d | `change-history.test.tsx` |
| A draft rule's preview agrees with the policy runtime. | R-POL-1 | `dry-run.test.ts` |

### Removed or replaced

249 tests became 177.

- 24 tests of the stand-in room's own scenario, data and rules. They show nothing about the product.
- Four rounds of review findings on the catalogue invariant (27 tests) became `live-catalogue.test.ts` (18).
- Tables of 14, 5 and 4 cases became one test each.

## Release

The scripts are in `scripts/`. The consumer fixture is `release/consumer/`.

| Invariant | Rule | Witness |
|---|---|---|
| The six released packages can be built and packed as their manifests claim: one nonzero version, exact dependencies between them, a command with no runtime dependency, and every export and bin naming a source file the build covers. | request 7e82100b | `scripts/release-manifest.test.mjs` (in the gate) |
| The packed tarballs install outside the repository, every claimed Node subpath loads, a consumer typechecks under NodeNext and bundler resolution, both commands run, the command installs alone, and every export, type and bin in a tarball is a file in it. | request 7e82100b | `scripts/check-release.mjs` (`npm run release:check`; outside the gate, because it installs from the network) |
| The command's tarball carries the complete licence text of every third-party package whose code its bundle contains, bundled directly or embedded in a bundled package's own build. The recorded texts have their recorded hashes, and a directly bundled package's installed licence file is the recorded one. | request 7e82100b, review 59605d51 | `scripts/release-manifest.test.mjs`: "the recorded third-party licence texts are intact ..."; "a bundle is compared with the record by what it contains ..." (in the gate). The real bundle is compared in `scripts/pack-release.mjs` and `scripts/check-release.mjs` |

## The 36 repaired defects of declared acts stage 2

One witness for each defect that review found in stage 2 (request `fd6f00b6`), by the number review gave it. A witness is a title in `packages/room/test/workerd/declared-fd6f00b6.test.ts`, unless another file is named.

| Defect | Witness |
|---|---|
| 1: lane kind in policy input | "what policy sees of a thread" |
| 2, 8, 11: retry before shape; closed outer shape; target after step 4a | "across a change of shape" |
| 3, 7, 25: `purpose`; inherited names; empty `goal` and `text` | "a declared act's body is the application's own" |
| 4: `who.delegable` at each use | "a grant covers a declared kind only by its map" |
| 5, 28: a session with a map after a return to `v1`; decided in the queue | "a redemption is granted under the document in force" |
| 6, 15: an invitation never gains; a session of no kind | "an invitation never gains a kind" |
| 9, 27: bearer retry; a used key with another act | "a bearer session's retry" |
| 10: a kind retired before redemption | "a session's map is judged" |
| 12, 20: a retired kind and a stale binding at reservation | "a landing under a delegation" |
| 21: a recovery landing in flight | "a recovery landing is judged by the recovery rule alone" |
| 13: reads follow the step | "every step is reached through a declared kind of another name" |
| 14, 26, 36: recover role table; `recover` field; op as text | "recover, the platform kind"; `node/declared-equivalence.test.ts`: "each recover op" |
| 16, 17: conflict mode; `opened` effect | "one vocabulary per document"; "the lease rule" |
| 18: platform kinds bound by role | "a grant is judged when it is admitted" |
| 19, 31, 32: check job kind and binding | "check jobs in a v2 room" |
| 22, 30: document bound | "a document the room cannot store or run"; `packages/policy/test/declared-acts.test.ts`: "a document of exactly 1,048,576 canonical bytes" |
| 23, 33, 34: wording facts, bound, final boundary | "refusal wording from the declaration"; `node/declared-equivalence.test.ts`: "refusal wording is filled" |
| 24: parsed once | "the active document as the room keeps it" |
| 29: `constructor` and `prototype` names | "a name every object inherits is undeclared too"; `packages/policy/test/declared-acts.test.ts`: "named constructor or prototype is refused" |
| 35: segment backslash | `node/declared-equivalence.test.ts`: "the declared field types" |
