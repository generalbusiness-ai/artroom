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
| A document is bounded at exactly 1,048,576 canonical bytes, and a key named `constructor` or `prototype` hides nothing. | R-DECL-26 | `declared-acts.test.ts`: "names and sizes the evaluator's value profile limits" |
| The binding changes exactly when the meaning changes. | R-DECL-15 | `declared-acts.test.ts`: "the binding identity" |
| The legacy vocabulary and the code-review declarations are the frozen data the protocol states. | R-DECL-1, section 33.7 | `declared-acts.test.ts`: "built-in data"; `vocabulary.test.ts`: "the code-review declarations are the note's section 6" |
| A document decides its kinds, steps, signers and grants by own properties only. | R-DECL-1, 4, 11, 17, 21 | `vocabulary.test.ts` |
| The evaluator conforms to the profile, the engine is the pinned one, and budgets refuse the same way in both runtimes. | R-EVAL-1, 2, 4, 5, 7, 9 | `profile-corpus.test.ts`; `integrity.test.ts`; `budgets.test.ts` |
| Each rule kind gives a recorded outcome, and a decision replays from its digested, frozen context. | R-POL-2 to 7, R-EVAL-3 to 6 | `rules.test.ts` |
| A land prepared for reservation is compared by bytes, and a stage-specific rule cannot be bypassed. | R-POL-6, R-LAND-4, R-LAND-7 | `rules.test.ts`: "land (R-POL-6, R-POL-7)" |
| An engine fault or host limit records nothing and is retryable. | R-EVAL-5, R-ADM-9 | `faults.test.ts` |
| Evidence carries only under the platform's conditions, and policy can only narrow them. | R-CARRY-1 to 12, R-REV-2 | `carry.test.ts` |
| The admin boundary, sole-admin bootstrap, recovery lanes and policy activation hold. | R-ADMIN-1 to 9, R-REV-1 to 3, R-POL-9 | `admin.test.ts` |
| The default pack does what docs/policy-pack.md says, and every path has an owner who can meet `owner-review`. | R-OBL-2, review 4df45987 | `pack.test.ts` |
| The authoring helpers compile to a valid document, and globs match and overlap conservatively. | R-POL-1, R-PATH-1 to 3 | `helpers.test.ts` |

### Removed or replaced

355 tests became 209 in Node; in workerd, 355 became 48.

- The workerd run of every file but three: the same suite in a second runtime, with nothing that differs. The Node run stays.
- 82 validator tests, one per guard case, and a test that read the source for guard markers. Now one table of 64 rows and one wrong-type test of 16 places.
- `declared-guards-e.test.ts` (27) and `vocabulary.test.ts` (10) became 12: two files asserted the same functions. The legacy vocabulary's digest pins the lists.
- 14 forbidden-program tests became one table.
- `review-09c01bf9` and `review-dd2a995b` merged into `rules.test.ts`; `review-4df45987` into `pack.test.ts`.
- 8 pack tests that asserted platform behaviour again with the demo policy. `carry.test.ts`, `rules.test.ts` and `admin.test.ts` hold it.

## Client

Files are in `packages/client/test/`.

| Invariant | Rule | Witness |
|---|---|---|
| Canonical bytes and signatures are fixed vectors, and a declared envelope carries its binding inside the signed bytes. | R-SIG-1 to 3, R-ID-4, R-DECL-16 | `signing.test.ts`; `workerd/signing.test.ts` |
| A prepared act is the handle's own frozen copy: nothing the caller does later changes what is sent. | R-IDEM-2, review 43e8fe3b | `prepared.test.ts`: "a prepared act is the handle's own copy" |
| A retry sends what was first built, also after the vocabulary changed; changed intent under a used key is a new act. | R-IDEM-1, R-IDEM-2, R-DECL-16 | `prepared.test.ts`: "a retry sends what was first built" |
| A lost or cut-off answer is retried with the same bytes, a bounded number of times, with backoff. | R-IDEM-1 to 3, R-IDEM-6 | `room.test.ts`: "idempotent retries" |
| Refusals are values and failures are `ArtroomError`s; nothing is sent to a name or over plain http. | R-API-1, R-ID-3 | `room.test.ts`: "refusals are values; failures are exceptions" |
| A watch resumes from its cursor, stops once when its credential is refused, and never reconnects after it is closed. | R-API-6 to 8, R-CRED-7 | `room.test.ts`: "resumable cursors" |
| No credential appears in anything the client returns or logs. | R-WS-4 | `room.test.ts`: "no credential in any output" |
| `acts()` is always read, and what `actsAt()` kept never takes a reader back behind an activation the handle has seen. | R-DECL-23 | `catalogue.test.ts` |
| The generic act signs exactly the binding the caller read, the named methods sign the built-for binding, and grants are expanded before signing. | R-DECL-16, R-DECL-17, R-CRED-10 | `declared.test.ts` |
| A record and a thread are named under the declaration in force at their own seq. | R-DECL-23, section 33.10 | `titles.test.ts` |
| A lost join is recovered with the same bytes and the caller's clock; a lost room-custody redemption is never retried. | R-CRED-1 to 5, R-CRED-9 | `redeem.test.ts` |
| The RPC update decoder owns its source, and its cancel and failures behave. | R-API-8, review 17013617 | `updates.test.ts` |
| The generated AGENTS.md block teaches the loop. | R-API-9 | `agents-md.test.ts` |

### Removed or replaced

144 tests became 99.

- Six seconds of real waiting in retries and reconnects. The tests now pass a `backoff` option, and `room.test.ts`: "the wait before each retry doubles from 200 ms" records the waits without waiting.
- 13 tests of the fake room's behaviour (custody, key in use, fencing, idempotency after revocation). The Room holds those rules: `packages/room/test/workerd/roster.cases.ts`: "R-ADM-12 and R-CRED-9", and `packages/room/test/workerd/acts.test.ts`.
- `declared-a5d64b35.test.ts` (33), split by invariant into `prepared`, `catalogue`, `declared`, `titles` and `signing`.
- `review-43e8fe3b.test.ts` variants that reached the same code, and `review-f47a509c.test.ts` (8), merged into `room.test.ts` and `prepared.test.ts`.
- `thread-names-c37653e1.test.ts` (9) and two title tests became 8 in `titles.test.ts`.
- `contract.test.ts`, which asserted types at run time. `contract.types.ts` under the typecheck replaces it.

## Log

Files are in `packages/log/test/`. Only `golden.test.ts` also runs in workerd.

| Invariant | Rule | Witness |
|---|---|---|
| A log is sealed in the contract's order, publications chain by parent, and every decision replays. | R-LOG-2, R-LOG-8 to 11 | `golden.test.ts`: "protocol section 20" |
| Published history is never rewritten: retries complete forward with the same commit, and an unexpected writer stops the publisher. | R-LOG-8, R-LOG-11 | `golden.test.ts`: "publication" |
| The same log gives the same commit IDs in Node and in workerd. | R-ID-6 | `golden.test.ts`: "the same log gives the same commits in every runtime" |
| A publication owns its cohort before any await, and later publications keep earlier retained evidence. | review ea4a9bd0 | `review-ea4a9bd0.test.ts`: "finding 1"; "finding 4" |
| The streaming publisher makes the commits the earlier publisher made, and `commitFor` gives the commit `publish` writes. | R-LOG-9 | `bounded.test.ts`: "the same commits as 417a1618"; `review-a454cbaf.test.ts`: "commitFor" |
| Reads are bounded: only the open segment is read, in batches, and a full parent segment is not read again. | request 5a7290b9 | `bounded.test.ts`: "bounded reads"; "opening from the ref"; "would-rewrite: when the parent's last segment is full" |
| A source that changes while it is read is `invalid-input`, and a changed published entry is `would-rewrite`. | R-LOG-2 | `bounded.test.ts`: "guards" |
| A push sends only what its lease does not hold, and a publication over one transfer is staged in parts and recovers from a lost answer or a restart. | reviews f7d273e1, b618eca1 | `transfer.test.ts` |
| Git accepts what the publisher writes, and the ref moves only under its lease. | R-LOG-8 | `gitcli.node.test.ts` |
| The layout rules are the contract's reference functions; a segment closes at its entry or byte limit and never changes afterwards. | R-LOG-16 to 19 | `amendment-4.test.ts`: "the shared rules agree"; "acceptance cases (30.7): segments"; "the layout follows the parent" |
| An object over B is never written: a longer line or file is chunked and sent in parts, and a directory lists at most its limit. | R-LOG-18 to 20 | `amendment-4.test.ts`: "publication outcomes (R-LOG-20)"; "entries and files over B"; "lengths past 32 bits" |
| Verify names each layout failure. | section 30.6 | `amendment-4.test.ts`: "verify's layout checks" |
| The default limits fit together at real size. | R-LOG-18, R-LOG-19 | `amendment-4.test.ts`: "at the contract's own limits" |
| Each kind of tampering has a named reason, and the verified prefix ends before it. | R-LOG-10 | `tamper.test.ts` |
| Malformed content is a named failure, never a throw. | review ea4a9bd0 | `review-ea4a9bd0.test.ts`: "finding 3" |
| R-ADM-5 is judged when a delegation is granted and when it is used. | R-ADM-5 | `review-ea4a9bd0.test.ts`: "finding 2"; `amendment-2.test.ts`: "edit 3" |
| Recomputed, land and `notified` decisions replay under the policy pinned with their act. | R-LOG-13, section 27 | `amendment-2.test.ts`; `review-ea4a9bd0.test.ts`: "finding 5" |
| `check-carried` events replay under the version they name and agree with their decisions. | R-CARRY-13 | `amendment-3.test.ts` |
| A time that bounds authority is a valid RFC 3339 UTC time, and retained evidence is checked and decoded per contract and digest. | reviews 07d3150e, a454cbaf | `review-07d3150e.test.ts`; `review-a454cbaf.test.ts`: "retained decoding" |
| `artroom verify` exits 0, 1 or 2, and fetches the room's pinned heads. | R-LOG-10 | `cli.node.test.ts` |
| A declared log is decoded by grammar, and an entry outside it is `malformed` at its seq. | R-SIG-4, R-DECL-2 | `declared-stage3.test.ts`: "condition 1: decoding by grammar (R-SIG-4" |
| Kind, binding, body and target are judged under the document in force at the entry's seq, and a `v1` log verifies as it did. | R-DECL-1, 4, 5, 12, 16, 21 | `declared-stage3.test.ts`: "kind-undeclared:"; "binding-stale:"; "the legacy rule:"; "body and target under the declaration in force" |
| A grant carries the bindings its grantor signed and is judged at each act; `who.delegable` and `who.roles` bound who may act. | R-DECL-10, 11, 17 | `declared-stage3.test.ts`: "grants carry the bindings their grantor signed"; "who.roles:" |
| A steps version or profile the verifier lacks stops verification as a limit, not as a failure. | R-DECL-14, R-DECL-22 | `declared-stage3.test.ts`: "condition 1: the steps version and profile" |
| The calls admission had to make are derived, and a missing call, an extra call, a differing context and a differing outcome are each named. | R-DECL-25, R-ADM-1 | `declared-stage3.test.ts`: "condition 2: required evaluation calls" |
| A version's changed paths are checked against Git objects, and are `git-unwitnessed` without them. | | `declared-stage3.test.ts`: "without the Git objects" |
| A check binds the integration a prepared event names; a scope fixed by a template is not carried by the act. | R-DECL-7, R-DECL-20 | `declared-stage3.test.ts`: "the prepared event, where present"; "a thread whose scope is fixed by a template" |
| Each obligation, review, reviewer and carry rule gives what the Room's rules give. | R-OBL-1 to 7, R-CARRY-1 to 15 | `declared-obligations.test.ts`: "honest logs verify" |
| A forged context is `context-mismatch`, a carry call left out or added is named, and a `check-carried` judgement is accepted only when owed. | R-CARRY-1 to 14 | `declared-obligations.test.ts`: "a recorded context that differs"; "carry calls are derived"; "check-carried events are judged" |

The honest logs witness the obligation rules because a simulator with its own port of the Room's rules (`test/support/room-obligations.ts`) writes the fixtures, and verify compares every context it rebuilds with the recorded one.

### Removed or replaced

731 test runs (369 in Node, 362 in workerd) became 279.

- The workerd run of every file but `golden.test.ts` (351 tests): the same assertions in a second runtime.
- `amendment-4-large.test.ts` (14 tests at 8 to 40 MiB) and the 64 MiB staging case. The rules are the same at any limit, so the cases run at small limits in `amendment-4.test.ts`: "entries and files over B" and `transfer.test.ts`: "a segment blob larger than one transfer".
- Git subprocess tests: 5 became 2, and `declared-stage3.node.test.ts` (2) went. `cli.node.test.ts` shows exits 0, 1 and 2.
- `declared-obligations.test.ts`: 40 forged-context tests, one per rule, became 4, and 12 mirrors and duplicates went. The honest fixtures fail on the same breakage.
- `declared-stage3.test.ts`: 53 tests, one verify per decoder rule, body rule or table row, became 12. `declared-stage3.test.ts`: "the decoder refuses each of these, by name" and "each rule of the body check" hold the rows.

### Known gaps

- A review count compared as `> 0`, not as the required count, changes nothing in the fixtures, whose counts are all 1.
- Section 30.7 gives its acceptance cases sizes. Only the entry of 8 MiB + 1 and the directory limit of 4,096 are tested at real size.

## Git

Files are in `packages/git/test/`, run by Node's test runner in one process.

| Invariant | Rule | Witness |
|---|---|---|
| A landing goes accepted, preparing, ready, publishing, landed, with one receipt. | R-LAND-1, R-LANE-10 | `landing.test.ts`: "a landing goes accepted"; "R-LAND-1/R-LANE-10" |
| After a crash at any of six points the restarted room completes forward and lands exactly once. | R-PUB-5, 7, 8 | `landing.test.ts`: "crash at"; "crash before push, with a ready operation behind it" |
| A release, a new generation, a policy activation or a main move invalidates preparation, and reservation checks authority, evidence and the land input again in one transaction. | R-LAND-3 to 9, R-POL-9, R-ADMIN-8 | `landing.test.ts`: "during preparation invalidates the operation"; "R-LAND-7:"; "R-LAND-4, R-LAND-7:"; "readiness:" |
| One publication runs at a time: a failed push holds the slot and is retried forward, and a delayed push gives no second receipt. | R-PUB-1, 2, 4 to 6 | `landing.test.ts`: "a lease race on publication"; "a delayed, already-authenticated push"; "another writer moves main" |
| An abort attempt revokes the tokens and never guesses the outcome. | R-REV-5, R-REV-6 | `landing.test.ts`: "the push is paused"; "core: no push starts after an abort attempt" |
| Every publication token is revoked, and a failed revocation is a durable debt with capped backoff, off the publication queue. | R-PUB-3, R-WS-4 | `landing.test.ts`: "R-PUB-3:"; "review 14739925:"; "review f060871b:" |
| The publication token is the mint ledger's until `pushToken` claims it, and the engine never retries a lost create. | R-MINT-2 to 7 | `landing.test.ts`: "mint lane B"; "review d4a4c681:" |
| The canonical mint ledger keeps a durable record and a stored wake-up before each create, keeps unknown outcomes, and owes revocations by ID in bounded passes. | section 32, R-MINT-1 to 7 | `mints.test.ts` |
| The lane forks' read-token ledger keeps the same rules for each fork. | R-MINT-2 to 7, R-WS-3 | `fork-tokens.test.ts` |
| A workspace is a fork with one write token inside its lease, no live token is ever left unowned, and a repository that is not this room's fork is never touched. | R-WS-1 to 4, R-LANE-8, R-GEN-12; plans 001, 002, 004 | `workspaces.test.ts` |
| A snapshot repository holds one fixed commit, gives each job a read token that ends by the job's deadline, and is retired with every token. | R-CARRY-15, R-CARRY-16 | `snapshots.test.ts` |
| Stored or shown error fields hold safe metadata only, and older rows are scrubbed once. | request d29c09fa, R-MINT-5 | `safe-errors.test.ts`; `workspaces.test.ts`: "d29c09fa"; `mints.test.ts`: "(checker 2)" |
| The memory repository the engine's tests use answers as the git publisher does over real git. | R-LAND-4, R-PUB-4, R-EXEC-2 | `git-publisher.test.ts`: "the memory repository answers the engine as the git publisher does" |
| A landing over real git lands the commit the preview showed, with the lane's commit unchanged in main's history. | R-LAND-4, R-PROP-7 | `git-publisher.test.ts`: "landing over real git" |
| Of two concurrent pushes on one main exactly one lands, and no hook runs. | R-PUB-4, R-EXEC-2, R-EXEC-6 | `gitops.test.ts`: "lease race:" |
| Pinning never moves a pinned ref, a preview gives the conflicts or the integration, and a filtered snapshot is the commit anyone can compute. | R-PROP-1, 2, 7, R-CARRY-15, 16 | `gitops.test.ts`: "pinning:"; "preview:"; "filtered snapshot:" |
| `pushLog` moves the log ref only under the lease and only to the next commit; `stageLog` stores an object only with its exact ID, type and size, and is safe to repeat. | R-LOG-8, R-LOG-20, review de5289a5 | `gitops.test.ts`: "pushLog"; "stageLog:"; "de5289a5:" |
| A push is never called refused when the ref may have moved. | R-PUB-5, R-LOG-20 | `push-outcome.test.ts` |
| The gateway lets through only the ref updates the operation was granted. | R-EXEC-1, R-EXEC-2 | `ref-fence.test.ts` |
| The first commit on a new repository is the commit git itself makes, and never moves an existing main. | R-GEN-12 | `first-commit.test.ts` |
| Path diffs match git, use every merge base, and are refused the same way every time when over a bound. | R-PROP-3, R-PROP-6 | `treediff.test.ts` |

### Removed or replaced

340 gate tests became 308. Outside the gate, 23 became none.

- `test-workers/`: nine landing tests in a stand-in Room written before the Room existed, and two gateway tests. `landing.test.ts` runs the scenarios on real SQLite, the Room runs them in workerd (`packages/room/test/workerd/log-tokens.test.ts`: "mint lane B"), and `ref-fence.test.ts` has the gateway.
- `test-log/` (12, never in the gate). Each package tests its side of the remote contract: `gitops.test.ts`: "stageLog:" compares each answer with the log package's model.
- Four jj tests. Two tested what jj writes; two merged into `gitops.test.ts`: "pinning:" and `git-publisher.test.ts`: "landing over real git".
- 13 `gitops.test.ts` tests merged into `git-publisher.test.ts` and "lease race:"; ten staging tests became six.
- One cost measurement, one test of constants against themselves, one duplicate, and 11 push samples made one table.

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
| One repository founds one room; an import needs an operator's grant; a genesis edited after its draft is refused before anything is bound. | R-GEN-10 to 13, R-API-11, R-PUB-10 | `worker.test.ts`: "R-GEN-10, R-GEN-12: founding" |
| A new public room has one empty first commit, pushed with the create's own token, which is revoked before the genesis is sealed. | request b6b51de7 | `worker.test.ts`: "request b6b51de7: a newly founded public room" |
| One deployment founds public rooms and imports, each in its namespace, and a missing binding is never replaced by another. | R-GEN-12, review a35b4b61 | `worker.test.ts`: "one deployment founds public rooms and imports"; `config.cases.ts` |
| A delete reaches only an abandoned incarnation, and an alarm is stored before the first create is sent. | review 3eb7bc44, plan 004 | `worker.test.ts`: "review 3eb7bc44"; "plan 004" |
| An import grant's deadline is judged by the registry's clock, in the step of the first binding. | R-GEN-12, R-GEN-13 | `review-1249097f.cases.ts`: "2. an import grant's deadline" |
| `PUBLIC_URL` is required and `https://`, and the deployable config binds what the source reads. | request 55be0661, assert 66a41558 | `hygiene-55be0661.cases.ts`; `deploy.cases.ts` |
| The measurement scripts fail closed: missing data is never reported as clean or as zero. | reviews 1b868265, 66fec276, caefe17d | `spike-smoke.cases.ts`; `mcp-stage0.cases.ts`; `rows.cases.ts`; `checks.cases.ts` |

### Admission and idempotency

| Invariant | Rule | Witness |
|---|---|---|
| The room ID is the genesis digest's prefix, and entry, lane and operation IDs have fixed forms. | R-ID-1 to 3, R-ID-8, R-GEN-1, R-LOG-12 | `acts.test.ts`: "identifiers and the sealed log"; `ids.cases.ts` |
| An act with a bad signature or outside the profile is not recorded, and authority is judged before the body and the secret scan. | R-SIG-1, 3 to 6, R-ADM-1, R-ADM-8 | `acts.test.ts`: "R-SIG and R-ADM-1 steps 1, 2 and 5" |
| The same bytes return the original record once; the same key with other bytes is refused; a recorded refusal replays. | R-IDEM-1 to 4 | `acts.test.ts`: "R-IDEM idempotency" |
| A secret in a body is refused, unrecorded and not repeated back. | R-SEC-1 to 4 | `acts.test.ts`: "R-SEC secret scanning before recording"; `secrets.cases.ts` |
| A runtime failure before admission records nothing, and the same bytes are admitted afterwards. | R-ADM-9, R-PROP-1 | `acts.test.ts`: "R-ADM-9: a runtime failure records nothing" |
| Acts sent at once get gapless sequence numbers in one signed hash chain, and an admission that waited on policy decides again before it commits. | R-LOG-1, 2, 4, R-ADM-6 | `acts.test.ts`: "concurrent admission" |
| A delegation, invitation or lease that runs out while policy is evaluated is judged again before the act commits. | R-ADM-4, R-ADM-6 | `review-aabda1ed.cases.ts`: "P1.3" |
| Canonical bytes, strict parsing, key IDs, digests, signatures, closed shapes and globs are exact. | R-SIG-1 to 4, R-SIG-6, R-ID-4, R-ID-7, R-PATH-1 to 3 | `canonical.cases.ts`; `crypto.cases.ts`; `schema.cases.ts`; `glob.cases.ts` |

### Lanes, proposals and workspaces

| Invariant | Rule | Witness |
|---|---|---|
| A lane is opened, rescoped, fenced by lease generation, taken over and expired by the object's alarm, by its holder only. | R-LANE-1 to 8, R-ADM-11, R-PATH-3 | `acts.test.ts`: "R-LANE lanes and leases" |
| A proposal pins its head as the next generation, and a head outside the fork, a path outside the claim or a diff over the bound is a recorded refusal. | R-PROP-1 to 6, R-LANE-4, R-POL-1, R-ADMIN-1 | `acts.test.ts`: "R-PROP proposals" |
| A preview is the head, the merge commit or the conflicting paths, and the landing lands exactly the previewed commit. | R-PROP-7 | `phase2b.cases.ts`: "previews from lane B's planner" |
| A workspace token is the holder's alone, for the current lease and a live key, and appears in no output. | R-WS-1 to 4 | `acts.test.ts`: "R-WS workspace credentials" |
| A workspace token never outlives its lease or its lease's deadline, and a revocation that cannot be answered stays owed. | R-WS-2, R-CRED-8, R-LANE-8 | `phase2b.cases.ts`: "workspace lease races and delayed cleanup"; `review-8faa2ef9.cases.ts`: "2. a workspace is fenced" |
| A pending workspace is durable alarm work, fenced by a take-over or an ended lease. | R-WS, R-LANE-8 | `review-aabda1ed.cases.ts`: "P2.6" |
| The production adapters refuse what they cannot prove. | R-GEN-12, R-PROP-1, R-LOG-8 | `phase2b.cases.ts`: "the adapters' boundaries" |

### Reviews, checks, obligations and carrying

| Invariant | Rule | Witness |
|---|---|---|
| Obligations come from the require rules on the paths actually changed, and a review counts only for the generation's head, from a qualified member other than the author. | R-OBL-1, 2, 4 to 6, R-LAND-1 | `obligations.cases.ts`: "R-OBL review obligations" |
| A compromised reviewer's approval stops counting; a retired one's still counts unless the policy says otherwise. | R-REV-1 to 3 | `obligations.cases.ts`: "R-REV revocation and evidence" |
| A verdict carries to the next generation until a dependency changes. | R-CARRY-1, 2, 5, 11 | `obligations.cases.ts`: "Carrying through the policy port" |
| A check binds the preview's integration, the active configuration and the tree, and only the named checker may sign it. | R-OBL-3, R-LAND-1 | `obligations.cases.ts`: "R-OBL-3 checks" |
| Every check carry judgement is a sealed event, and a stored carry counts only under the policy version that judged it. | R-CARRY-13, R-LAND-7 | `acts.test.ts`: "R-CARRY-13"; `review-a711f7b6.cases.ts`: "1. a stored check carry" |
| A check carries only when the configuration pins the runner, and its `volatile` flag is the configuration's. | R-CARRY-14, R-EXEC-10 | `review-a711f7b6.cases.ts`: "4. check carry needs a pinned runner"; `acts.test.ts`: "R-CARRY-14, R-CARRY-15" |
| A scoped check binds the snapshot commit recorded for its own integration, and never counts for another. | R-OBL-3, R-CARRY-9 | `review-a711f7b6.cases.ts`: "4d."; `review-95323c2b.cases.ts` |
| A scoped check carries when main moved outside its inputs, and not otherwise. | R-CARRY-6 to 10 | `phase2b.cases.ts`: "policy activation and recompute, scoped check carry" |
| An advisory obligation never blocks a landing, and a landing never relies on advisory evidence. | R-OBL-7, R-REV-3 | `acts.test.ts`: "R-OBL-7" |
| Sealed obligation effects come from the same calculator as the projection. | R-LOG-10 | `review-aabda1ed.cases.ts`: "P2.7"; `review-8faa2ef9.cases.ts`: "4. checks use the same effect calculator" |
| Evidence stored without admission facts is judged as an author's, which never adds eligibility. | | `review-8faa2ef9.cases.ts`: "5. evidence stored without admission facts" |
| A job goes over the checker's service binding with a read token that is revoked after the answer, and is not issued once it is not needed. | R-EXEC-8 to 10 | `acts.test.ts`: "R-EXEC-8 to R-EXEC-10" |
| An unanswered attempt ends at its deadline and a new one is issued; a preview's integration gets its own job. | R-EXEC-8 to 10, R-OBL-7 | `review-0f9739dc.cases.ts` |
| Two jobs steps at once send one attempt per job, and work that changed while its credentials were prepared is not sent. | R-EXEC-8, R-EXEC-9 | `review-786e9606.cases.ts` |
| A filtered job reads a repository made for its snapshot commit only, in the room's own namespace. | R-CARRY-15, R-CARRY-16, R-GEN-12 | `snapshot-repos.cases.ts` |

### Landing, reservation and policy activation

| Invariant | Rule | Witness |
|---|---|---|
| A release, a new generation, a new objection or a lost role before reservation ends the operation as retryable, with its reason. | R-LAND-6, 7, 9 | `acts.test.ts`: "R-LAND-6, R-LAND-7 and R-LAND-9"; `phase2b.cases.ts`: "reservation-time re-validation" |
| Under the default land rule an open objection refuses the land act. | R-POL-7 | `acts.test.ts`: "R-POL-7: the default land rule" |
| A policy activation during preparation fences the operation, which is prepared again; obligations are judged again under the new requirement. | R-POL-9, R-LAND-5, R-PUB-9, R-REV-1 | `acts.test.ts`: "R-POL-9, R-LAND-5"; `review-aabda1ed.cases.ts`: "P1.4" |
| Acts admitted while a reservation is held carry `after`, and a compromised key's revocation records an abort attempt whose outcome is what happened to the push. | R-LAND-8, R-REV-5 to 7 | `acts.test.ts`: "R-LAND-8 and R-REV-7"; `phase2b.cases.ts`: "abort attempts" |
| A land rule sees its stage, each evaluation is sealed, and unchanged state builds the same input bytes at reservation. | R-POL-6, R-LAND-4 | `acts.test.ts`: "R-POL-6, R-LAND-4" |
| A recovery lane is judged by no policy rule and needs an admin's own key; a sole admin's self-approval counts only while the admin is alone. | R-ADMIN-2, R-ADMIN-5 to 9 | `acts.test.ts`: "R-ADMIN configuration recovery and sole-admin approval" |
| A push with an unknown outcome is settled by reading main back, and every publication token is revoked. | R-PUB-3, 5, 7 | `phase2b.cases.ts`: "unknown-outcome publication recovery" |
| A room founded before the canonical remote was stored resolves it before landing work. | R-GEN-13 | `review-a711f7b6.cases.ts`: "3. a room founded before the canonical remote" |

### Roster, delegation, redemption and sessions

| Invariant | Rule | Witness |
|---|---|---|
| Only an admin invites, an invitation is used once, and the last admin cannot be removed. | R-GEN-4 to 8, R-ID-5 | `roster.cases.ts`: "R-GEN roster" |
| A member's key, a delegated key and the recovery key each act only within their own authority, and a replay after revocation returns the original record. | R-ADM-3 to 5, R-IDEM-2 | `roster.cases.ts`: "R-ADM-3 authority cases" |
| Custody is fixed by the admission path, a bearer is shown once and never logged, and a session ends when its key is revoked. | R-ADM-12, R-CRED-3, 6, 7, 9 | `roster.cases.ts`: "R-ADM-12 and R-CRED-9" |
| A redemption gives a session only for a join it admitted, and a refused join is never recorded. | R-CRED-9, R-GEN-6, R-ADM-8 | `request-c657d4ba.cases.ts`: "(1) a redemption"; "(2) a refused join" |
| Join attempts are limited per invitation across every path, and per client address. | R-CRED-9 | `request-c657d4ba.cases.ts`: "(3) the redemption rate limit" |
| A join whose reply was lost is recovered with the same bytes, on the caller's clock. | R-IDEM-2, R-CRED-5, R-CRED-9 | `worker.test.ts`: "a join whose reply was lost"; `request-c657d4ba.cases.ts`: "the client's join() recovery" |
| A room-custody redemption is all or nothing. | R-CRED-9, R-CRED-3, R-ADM-12 | `review-aabda1ed.cases.ts`: "P1.1" |
| A revoked key never becomes, or acts as, the recovery key. | R-ADM-3 | `review-aabda1ed.cases.ts`: "P1.2" |
| A `*` delegation is fixed at the grant: a later promotion does not widen it. | R-ADM-5, R-LOG-10 | `review-8faa2ef9.cases.ts`: "'*' is fixed at the grant" |

### Declared acts

Workerd witnesses are in `declared-fd6f00b6.test.ts` and `declared-stage5-a5d64b35.test.ts`. Node witnesses are in `node/declared-equivalence.test.ts`.

| Invariant | Rule | Witness |
|---|---|---|
| A room has one vocabulary, its active document's, and becomes `v2` only by landing a `v2` document. | R-DECL-1, R-DECL-15, R-ADM-1 | `declared-fd6f00b6.test.ts`: "one vocabulary per document" |
| `who.roles` decides who may sign a declared kind, with admin implicit, and never the legacy table. | R-DECL-11 | `declared-fd6f00b6.test.ts`: "who may sign"; `node/declared-equivalence.test.ts`: "let each role sign, and grant" |
| Step 4a: an undeclared kind and a wrong binding are refused after authority, before the body check, unrecorded; an exact retry gets its receipt across any change. | R-DECL-16, R-IDEM-2, R-SIG-4 | `declared-fd6f00b6.test.ts`: "step 4a" |
| A grant is a signed map from kind to binding, judged when admitted and at every use, and never gains a kind across a change of vocabulary. | R-DECL-17, R-ADM-5 | `declared-fd6f00b6.test.ts`: "grants carry the bindings their grantor signed" |
| A room-custody session is judged when its invitation is admitted and again when it is redeemed, and its retry is built as its first attempt was. | R-DECL-17, R-CRED-3, R-CRED-10, R-IDEM-2 | `declared-fd6f00b6.test.ts`: "room-custody sessions across a change of vocabulary" |
| A step is reached by the step a declaration names, whatever the kind is called, and an act acts only on thread kinds its declaration names. | R-DECL-5, 6, 8, 21, 23 | `declared-fd6f00b6.test.ts`: "threads have kinds" |
| A thread records its kind, binding, lease length and conflict mode when it opens, and keeps that lease across a restart and a return to `v1`. | R-DECL-6, R-DECL-9, R-LOG-6 | `declared-fd6f00b6.test.ts`: "the lease rule" |
| Policy input carries the thread's kind under `v2`. | R-EVAL-3 | `declared-fd6f00b6.test.ts`: "what policy sees of a thread" |
| A declared field is the application's: it never selects recovery, and is present only as the body's own property. | R-DECL-12, R-DECL-21 | `declared-fd6f00b6.test.ts`: "a declared act's body is the application's own" |
| Refusal wording comes from the declaration, filled only with the room's own facts and cut to 8,192 bytes. | R-DECL-13, R-ADM-6 | `declared-fd6f00b6.test.ts`: "refusal wording from the declaration"; `node/declared-equivalence.test.ts`: "refusal wording is filled" |
| `recover` runs the legacy recovery steps by op, for an active admin's own key only. | R-DECL-21, R-ADMIN-5 | `declared-fd6f00b6.test.ts`: "recover, the platform kind" |
| At reservation a landing is judged as a new admission would be. | R-LAND-7, R-DECL-17, R-ADMIN-8 | `declared-fd6f00b6.test.ts`: "a landing in flight is judged again at reservation" |
| A workspace request is judged as the act with step `version` on the thread. | R-CRED-5, R-WS-2 | `declared-fd6f00b6.test.ts`: "a workspace request is judged as the act with step version" |
| An old record is read under the declarations of its own seq, and a thread is named by its opening act. | R-DECL-23, R-API-3 | `declared-stage5-a5d64b35.test.ts`: "the declarations read"; "old records are read under the declarations of their own seq"; "a thread's kind and what readers call it" |
| A check job names the kind and binding to sign, as in force when it is sent; a check step under another name meets the obligation. | R-DECL-18, R-EXEC-8, R-OBL-3 | `declared-fd6f00b6.test.ts`: "check jobs in a v2 room"; `declared-stage5-a5d64b35.test.ts`: "a declared check step under another name" |
| A document the room cannot run or store never activates, and the active document is parsed once per version. | R-DECL-24, R-DECL-26 | `declared-fd6f00b6.test.ts`: "a document the room cannot store or run"; "the active document as the room keeps it" |
| The declared path writes no more rows per act than the legacy path, and a whole `v2` session's log verifies. | request fd6f00b6, R-LOG-10 | `declared-fd6f00b6.test.ts`: "the same session under the legacy vocabulary" |
| Migration 4 adds its six columns once and gives a kind only to a thread that has none. | R-DECL-6 | `declared-fd6f00b6.test.ts`: "migration 4" |
| The code-review declarations judge envelopes, targets, bodies, roles and grants as the legacy vocabulary does, message for message. | R-DECL-4, 5, 11, 12, 17 | `node/declared-equivalence.test.ts`; `node/declared-steps-a5d64b35.test.ts` |
| The real Worker and the client agree: the client signs the binding the caller read, and a bearer performs a declared kind through the MCP `act` tool. | R-DECL-16, R-DECL-17, R-CRED-10 | `declared-stage5-a5d64b35.test.ts`: "a declared act the client has no method for"; "the named methods"; "the generic act over the MCP endpoint" |

### The declared witness set

`declared-run.test.ts` gives every room a `v2` document, applies the four fixture conversions of `vocabulary.ts`, and loads three files a second time. A pattern picks the tests of each file that run; the others are skipped there and run as written in their own file. Its last test, "the declared run itself", fails if a file ran no test or a conversion was never applied.

| What still works through the declarations | Conversion | Tests that run under `v2` |
|---|---|---|
| Open, take, release, renewal, expiry and a version with its pin; review, land, reservation, an activation during preparation, and recovery through `recover`. | bindings, recover | `acts.test.ts`: tests whose name has "R-LANE", "R-PROP-1, R-PROP-2", "R-ADMIN", "R-LAND-7: reservation", "policy activation during preparation" or "builds the same bytes at reservation" |
| Review and check obligations and revoked evidence, with a `v2` checker configuration. | checker-v2 | `obligations.cases.ts`: "R-OBL-3", "R-OBL-5", "R-LAND-1", "R-REV-3" |
| The roster op table, and delegations and a room-custody session as signed maps. | grant-maps | `roster.cases.ts`: "R-GEN-4", "R-ADM-3b", "R-ADM-4", "R-ADM-5", "MCP redemption" |

What no longer runs under `v2`: everything else. That is founding and imports, admission's step order and secret scanning, log construction and bounded publication, mint and token work, snapshots, the HTTP, WebSocket and MCP routes, concurrency, carrying, paused pushes and aborts, workspace credentials, and every case file of a review or request. This is accepted because the Room dispatches by step and both vocabularies run the same handlers. What differs under `v2` is tested directly in `declared-fd6f00b6.test.ts`, whose vocabulary of other names also shows that a handler reads the step and not the name.

### Publication, log and tokens

| Invariant | Rule | Witness |
|---|---|---|
| The log is built and published as in the protocol's worked example, and a notify failure never changes the claim. | R-LOG-2, 7, 8, 10, 12, 13 | `log-tokens.test.ts`: "section 23, Log construction" |
| Publication reads the Room's SQLite in bounded batches and stages a publication larger than one transfer in parts. | request 5a7290b9 | `log-tokens.test.ts`: "publication reads and sends the log in bounded parts"; `logremote.cases.ts` |
| A pending publication completes forward after a lost reply or a restart, accepts only the confirmed parent or the exact pending commit, and never forces the ref. | R-LOG-8 | `review-aabda1ed.cases.ts`: "P1.5"; `review-8faa2ef9.cases.ts`: "1. recovery accepts only"; `review-1249097f.cases.ts`: "1. a pending cohort" |
| The log a real session produces verifies offline, with every decision replayed. | R-LOG-10 | `phase2b.cases.ts`: "offline replay of the produced log" |
| Every canonical token is minted under a ledger record of its site, and no production source reaches `createToken` outside the ledgers. | R-MINT-1, R-MINT-3 | `log-tokens.test.ts`: "R-MINT-1: every canonical token"; `mint-sites-scan.cases.ts` |
| The ledger's wake-up is a stored alarm in place before the create, and a fresh object takes an unanswered mint over as unknown. | R-MINT-2, R-MINT-5 | `log-tokens.test.ts`: "mint lane B" |
| The fork's read token goes through the fork's own ledger. | request 02836f9a | `log-tokens.test.ts`: "mint lane F" |
| A job token ends before the job's deadline, and no job is sent at or after the deadline. | R-EXEC-9, R-EXEC-10, R-MINT-4 | `log-tokens.test.ts`: "a check job's deadline"; `review-90f30a3b.cases.ts` |
| Nothing is sent on a mint whose outcome is unknown, and a token whose ID is known always has a durable owner. | R-MINT-2, R-MINT-4, review 013dad0c | `log-tokens.test.ts`: "a whole-tree job's token mint whose outcome is unknown"; `review-271dbd53.cases.ts` |
| An ended job token's revocation is bounded and retried, and ended tokens and due jobs are taken 20 at a time. | R-MINT-7 | `log-tokens.test.ts`: "an ended job token's row"; "ended job tokens and due jobs are taken in bounded batches" |
| A room stored before the due indexes and the error scrub gets them at its next start and keeps every row. | reviews 993dce7a, 31ad41d5 | `log-tokens.test.ts`: "the due indexes reach a room stored before them" |

### MCP and HTTP

| Invariant | Rule | Witness |
|---|---|---|
| The HTTPS routes answer with the record, a refusal or an `ArtroomError`, never cacheable, and reads need a token. | R-API-1, R-API-3, R-API-8 | `worker.test.ts`: "HTTPS routes and the RPC entrypoint" |
| A body is read up to 1 MiB and no further. | request 55be0661 | `worker.test.ts`: "request 55be0661 (SEC-11)" |
| Pages ascend and resume after the last item, cursors never skip an item, and a wait ends with `timeout` or at once. | R-API-5 to 9 | `worker.test.ts`: "R-API reads, cursors and waits"; `review-aabda1ed.cases.ts`: "P2.8"; `review-8faa2ef9.cases.ts`: "3. attention made later" |
| A long poll wakes on a new entry, and a WebSocket's token is judged before the upgrade and closed when its key is revoked. | R-API-8, R-API-12, R-LOG-11 | `worker.test.ts`: "R-API-8, R-API-12: live updates" |
| A bearer's acts are the room's, signed under its delegation; through the MCP tools a retry gives one effect, and listing is not permission. | R-CRED-3, R-CRED-10, R-API-9, R-API-13 to 15 | `worker.test.ts`: "bearer acts and the MCP route" |
| The Room gives its MCP endpoint the caller's role now and the grant as signed, and the list follows the document in force. | R-API-14 | `worker.test.ts`: "the Room gives its MCP endpoint the caller's authorization" |

### Alarms, idle cost and diagnoses

| Invariant | Rule | Witness |
|---|---|---|
| An idle room writes nothing and asks for no alarm. | request 3da1d82b | `log-tokens.test.ts`: "an idle room writes nothing" |
| Failing work backs off to a cap, and each kind of work keeps its own backoff when another alarm fires first. | request 3da1d82b | `log-tokens.test.ts`: "failing work backs off" |
| A room whose repository is gone stops, keeps what it owes, raises one admin item, and resumes when the repository returns. | request 3da1d82b | `log-tokens.test.ts`: "a room whose canonical repository is gone" |
| The room's next alarm is the earliest of its six due times, and scheduling reads a bounded number of rows. | R-LANE-8, R-MINT-7, request 8bd623cc | `pin-delay.cases.ts`: "the room's next alarm is the earliest of six due times"; "bounded reads for a pending backlog" |
| A cleanup pass that waits on Artifacts gives the room a bounded future wake, never an immediate one. | R-PUB-3 | `review-f060871b.cases.ts` |
| A fresh object schedules the debt it finds. | R-MINT-2, follow-up c9cd4cd8 | `log-tokens.test.ts`: "follow-up c9cd4cd8 (2)"; `snapshot-repos.cases.ts`: "follow-up c9cd4cd8 (2)" |
| A failure before admission or a catch-all 5xx is logged once, redacted and bounded, and tells the caller nothing more. | R-PROP-1, R-SEC-5, request d268d249 | `request-d268d249.cases.ts`; `diag.cases.ts` |
| Stored error fields hold safe metadata only, and rows stored before the rule are rewritten in bounded batches, also in an unfounded room. | request d29c09fa | `safe-errors-d29c09fa.cases.ts`; `worker.test.ts`: "request d29c09fa" |

### Removed or replaced

- The declared run of the whole workerd suite: 540 test runs became 32 tests and one test of the run itself. Both vocabularies run the same step handlers.
- 115 per-condition guard tests (`declared-guards-c/d/e/f-fd6f00b6`) and 51 audit tests, merged with the old `declared-fd6f00b6.test.ts` (53) into 38, one witness per invariant. Dropped with no replacement: states that acts cannot reach, the policy cache's size of four.
- 133 Node tests, one per field of each step and recover op (`declared-guards-a`, `-b`, `-e`), became one loop of 116 cases in `node/declared-equivalence.test.ts`.
- `declared-stage5-a5d64b35.test.ts`: 38 became 9. The other 29 repeated what `packages/client` and `packages/mcp` test against their doubles.
- 24 core files (277 tests) became `acts.test.ts`, `worker.test.ts` and `log-tokens.test.ts` (135), with helpers in `core-support.ts`. One room per test bought nothing where each test needs only its own lane, and variants of one refusal became rows of one test.
- Counts that the property does not depend on: 60 parallel acts became 24, 20 identical submissions 8, 1,010 notes 10, 150,000 pending pins 1,000.
- Mint and token tests that repeated the ledger's own rules: 16 lost-answer and failed-revocation tests at eight sites became one walk, `job-token-mint` 13 became 4, `fork-token-02836f9a` 8 became 1. The rules are in `packages/git/test/mints.test.ts` and `packages/git/test/fork-tokens.test.ts`.
- MCP tests that `packages/mcp/test/mcp-core-9ca1d290.test.ts` shows over a fake room with nothing the Room adds: 31 became 8.
- 19 further workerd files (284 tests) became case files (228): 22 per-syntax and per-call-site diagnosis tests whose table is in `diag.cases.ts`, grids where one function judges every cell, and carry cases that `packages/policy/test/carry.test.ts` holds.
- 17 Node files (237 tests) became 3 (140): 82 one-per-row tests became one test per table; 16 compared config files with each other or tested constants and seams.

### Known gaps

- Only one `v2` session's log is published and verified in the Room. Verification of `v2` logs with checks, revocations and carried verdicts rests on `packages/log`.
- Section 33.6 of the protocol states the stage 2 criterion as the room's whole suite under the `v2` declarations. The gate runs the witness set above.
- No test fixes what a bearer act answers after its grantor's room-held key is revoked as `retired`: reads and the MCP route answer `unauthenticated`, while `RoomWire.bearerAct` still returns the original record for an exact retry.

## Checkers

Files are in `packages/checkers/test/`. Only `git.test.ts` and `sandbox.test.ts` start real processes; `git.test.ts` builds one fixture repository and only reads it.

| Invariant | Rule | Witness |
|---|---|---|
| A job binds only if it is well formed, for this room and checker, unexpired, and reads one repository in an accepted namespace. | R-OBL-3, R-EXEC-3 | `job.test.ts`: "a well-formed job binds"; "every malformed or misdirected job is refused" |
| A `v2` room's job names a kind and a binding, both or neither, and the check is signed as its job says. | R-DECL-18 | `job.test.ts`: "every malformed or misdirected job is refused"; `handle.test.ts`: "the check is signed as its job says" |
| An envelope is signed over its canonical bytes, and a model's answer is data. | R-SIG-1, R-SIG-5 | `job.test.ts`: "a check envelope is signed over the canonical bytes"; "LLM answers are data" |
| A job arrives only over the service binding, and the shipped configurations are valid. | R-EXEC-8, R-EXEC-10, R-OBL-7 | `worker.test.ts` |
| The check is machine-labelled, binds its job, states `volatile` as the job does, and shows the measured runner digest. | R-OBL-3, R-EXEC-5, 10, 11 | `handle.test.ts`: "the check is machine-labelled" |
| The read token goes to the job's gateway and never into the sandbox. | R-EXEC-3 | `handle.test.ts`: "the read token goes to the job's gateway" |
| A checker passes only if every step exits 0, and a checkout the runner cannot confirm fails the check with nothing run. | R-EXEC-4, R-CARRY-9 | `handle.test.ts`: "the tests and types checkers pass only if every step exits 0"; "a checkout the runner cannot confirm" |
| A job that contradicts the checker's volatility or the measured runner digest is refused, and nothing runs or is signed. | R-EXEC-10, R-EXEC-11 | `handle.test.ts`: "R-EXEC-10:"; "R-EXEC-11:" |
| Each job's check goes to the job's own room, and a room's refusal is the answer. | R-EXEC-8 | `handle.test.ts`: "one service serves many rooms"; "a room's refusal is the answer" |
| No container runs two jobs, each runner has one owner, and a runner failure is `unavailable`, never a failed check. | R-EXEC-1, R-EXEC-3, review c46a4491 | `handle.test.ts`: "G1:"; "G2:"; `sandbox.test.ts` |
| The service reads only its own copy of the job, and the reviewer's check is advisory and never signs a review. | R-OBL-2, R-OBL-7 | `handle.test.ts`: "G3:" |
| Git output is read whole, and output over the limit is `payload-too-large`, never a failed check. | R-EXEC-5 | `handle.test.ts`: "G4:" |
| The checkout is the exact integration with no history, and a scoped job reads only its own snapshot, by any route. | R-EXEC-4, 6, 7, R-CARRY-9, 16 | `git.test.ts`: "checkout fetches the exact integration"; "a scoped job reads only its own snapshot" |
| The snapshot commit ID the Room derives is the commit the publisher writes. | R-CARRY-15 | `git.test.ts`: "the Room's snapshot commit ID equals" |
| The real tools run the project's tests in the checkout, and the reviewer reads the change against the job's base. | R-EXEC-10 | `git.test.ts`: "tests checker: real"; "LLM reviewer:" |

### Removed or replaced

48 tests became 35.

- `declared-guards-f.test.ts` (3 tests, 11 cases), written so each type guard had a red test. Two rows of the `job.test.ts` table hold the rule.
- Real npm for the fail and replay cases, real git for the checkout comparisons, and the isolation tests G1 to G4 on real processes. These are decisions over the runner and container interfaces, now tested on an in-memory container. One real `npm ci` and `npm test`, and the real container cases in `sandbox.test.ts`, stay.
- `carry.test.ts` (10), each of which built a git fixture to get a job; three merged into the check's body test.
- Three tests of `test/ledger.ts`, which is test code.
- Three `snapshot-isolation.test.ts` tests of the snapshot repositories. `packages/git/test/snapshots.test.ts` and `packages/git/test/gitops.test.ts`: "filtered snapshot:" hold them.

### Known gaps

- Two hand edits to npm's environment (`HOME`, `npm_config_cache`) turned no test red: the fixture project has no dependencies.

## MCP

Files are in `packages/mcp/test/`. The package has no workerd run. The handler inside workerd, with the real Room behind it, is witnessed by `packages/room/test/workerd/worker.test.ts`: "bearer acts and the MCP route" and "the Room gives its MCP endpoint the caller's authorization"; one of them must stay.

| Invariant | Rule | Witness |
|---|---|---|
| The tools are exactly the contract's, and validation accepts the demo loop and names each problem. | R-API-9 | `schema.test.ts` |
| Sixteen descriptors in a fixed order have titles, annotations and output schemas that every success and refusal fits. | R-API-13 | `mcp-core-9ca1d290.test.ts`: "descriptors: sixteen tools"; `stage0.test.ts` |
| Both wire formats serve the official client, which validates every result against the advertised schema. | MCP plan stage 0 | `stage0.test.ts`: "the official MCP client" |
| The endpoint needs a bearer, a refusal is a value, a failure is a tool error, and acts are signed by the room under the bearer's delegation. | R-API-1, R-CRED-3, R-CRED-10 | `server.test.ts`; `amendment-2.test.ts` |
| Every act tool requires `idempotencyKey`, and the same call again gives one act. | R-API-9, R-IDEM-6 | `mcp-core-9ca1d290.test.ts`: "every act tool requires idempotencyKey" |
| `waitMs` is a whole number from 0 to 45,000, and a wait is a read that holds nothing and ends with the current state. | R-API-15 | `mcp-core-9ca1d290.test.ts`: "waitMs is a whole number"; "attention with waitMs"; "an attention wait ends the subscription it opened" |
| `tools/list` follows the caller's authority, read afresh, and listing is not permission. | R-API-14 | `mcp-core-9ca1d290.test.ts`: "toolsets:"; "listing is not permission" |
| `acts` and `act` pass the caller's kind, target, body, binding and key unchanged. | R-DECL-16, R-DECL-23 | `declared-a5d64b35.test.ts` |
| A tool name or input key is an own property only. | review f47a509c | `review-f47a509c.test.ts` |
| The route reads at most 1 MiB of a body, and none of it for an unknown bearer. | request 55be0661 | `body-cap.test.ts` |
| The stdio server speaks newline-delimited JSON-RPC for a member's own key. | R-CRED-2 | `stdio.test.ts` |

### Removed or replaced

154 tests became 103.

- The workerd run. The Room's workerd tests hold the handler inside workerd; `body-cap.test.ts` moved to the Node run unchanged.
- 45 tests that were one per row of a table (act tools without a key, waiting tools, inherited names, demo-loop inputs, bad inputs). Now one test per table.
- Five tests whose list or limits another test asserts.

## CLI

Files are in `packages/cli/test/`.

| Invariant | Rule | Witness |
|---|---|---|
| The loop a person types works end to end against real git, with exit codes 0 to 3, and key, config and token files at mode 0600. | R-WS-4, R-API-1 | `cli.test.ts`: "the loop, as a person types it"; "usage and agents" |
| A refused login leaves no key, a lost login answer is finished by the same command, and a lost redemption saves no token. | R-IDEM-2, R-CRED-9, R-CRED-11 | `cli.test.ts`: "joining" |
| No credential reaches the output, from the client or from a room that echoes one. | R-WS-4 | `cli.test.ts`: "credentials never reach the output" |
| `artroom mcp` shows a caller the tools its own authorization allows. | R-API-14 | `cli.test.ts`: "artroom mcp:" |
| Login and redeem keep their journal entry until every local step is done, and a redemption is never sent twice. | R-IDEM-2, R-CRED-9 | `journal.test.ts`: "login and redeem finish locally" |
| A retried act is the act first sent, also after HEAD, the lane and the lease changed, and needs no new authority to get its receipt. | R-IDEM-2, R-IDEM-6 | `journal.test.ts`: "a retried act is the act first sent"; "a journaled signed act needs no new authority" |
| The act journal outlives the local steps after the answer, and an interruption at any step is finished by the same command with one act. | R-IDEM-2, R-CRED-10 | `journal.test.ts`: "the act journal outlives the local steps" |
| `artroom wait` follows the landing already started, and a recovered claim or landing changes the selection only if its revision is unchanged. | R-API-5, review 80d3710c | `journal.test.ts`: "the landing follow-up"; "a recovered claim or landing" |
| Older config and journal files are decoded conservatively, and newer ones are refused. | review f30be7f6 | `journal.test.ts`: "older config and journal files" |
| A workspace reserves its destination before its first await and installs only if it still owns it at the end, for its own lease. | reviews 744a018a, f30be7f6 | `workspace.test.ts`: "the reservation is made before the first await"; "a workspace installs only while its reservation still owns the destination" |
| The installed record, the pending installations and the reservation are separate evidence, and a failed reservation erases none of it. | reviews 4758945b, 7040317d, c033fb54 | `workspace.test.ts`: "the installed credential's record is separate"; "unsettled installations stay plural"; "an unreadable mark keeps the cleanup duty" |
| A release removes exactly the credential of the lease it released. | reviews 80d3710c, f7c79158 | `workspace.test.ts`: "a release is bound to the lease it released" |
| The destination lock names its holder, age is never evidence, and whatever is in the way is named and never removed. | reviews 4758945b, 7040317d | `lock.test.ts` |
| `artroom act` signs under the binding the user gave, and a changed meaning is shown and never adopted. | R-DECL-16 | `declared.test.ts`: "artroom act: any declared act"; "a changed meaning is shown" |
| A receipt is in the words of the declarations at the act's own seq, and a saved act finished under another kind's name is the saved act. | R-DECL-23, R-IDEM-2 | `declared.test.ts`: "the receipt of artroom act"; "a saved act finished under another kind's name" |
| Nothing the room sends can add a git setting or a shell word. | request 55be0661 | `hygiene.test.ts` |

### Removed or replaced

201 tests became 132.

- 43 hygiene tests, one per table row, became four table tests.
- 10 tests, one per interruption point, became tests that stop the same command at each step in turn: `journal.test.ts`: "interrupted after each local step in turn".
- Lock tests in eight processes with real waits became one other process that plays every case.
- 11 cases that a stricter or wider kept case decides, and seven of eight runs of the real bin. One real run stays in `cli.test.ts`: "the real bin serves a member's key".

### Known gaps

- A recoverer that removes the lock without checking the stopped holder's token is not caught. It needs two recoverers racing.
- `artroom wait OP` clearing a followed landing that is not `OP` is not caught.

## UI

Files are in `packages/ui/test/`. The browser suite `packages/ui/e2e` is not in the gate.

| Invariant | Rule | Witness |
|---|---|---|
| A stale meaning is never sent without the person confirming, and the form says what changed. | R-DECL-16 | `acts-screen.test.tsx`: "a meaning that changed behind the form" |
| A lost answer is shown as unresolved, never as not taken, and asking again sends the same act with the same key. | R-IDEM-2, review fb27de86 | `acts-screen.test.tsx`: "an answer that was lost is not a rejection" |
| A form is built from the declaration, and the declared limits are checked before anything is sent. | R-DECL-12 | `acts-screen.test.tsx`: "the form is built from the declaration"; `acts-fields.test.ts` |
| The page's catalogue never goes back behind an activation it confirmed, whatever the order of answers. | R-DECL-23 | `live-catalogue.test.ts` |
| Every record is shown under the declarations of its own seq, and a thread is named by its opening act's declaration. | R-DECL-23, section 33.10 | `declared-rendering.test.tsx` |
| The five screens show what the README says they show. | | `screens.test.tsx` |
| The live adapter never asks for a workspace token, and shows a partial read as partial. | R-WS-4, review 82f2743b | `live-room.test.tsx` |
| The page says of a publication only the recorded read-back and abort facts. | section 14 | `publication.test.tsx` |
| An advisory check is never shown as blocking, and a carried check's reason comes only from the event for its own destination and policy. | R-OBL-7, R-CARRY-13 | `checks.test.tsx` |
| The per-change history and its interdiff compare metadata, place and bounded work, and say when they cannot tell. | request d0cbb26d | `change-history.test.tsx` |
| A draft rule's preview agrees with the policy runtime, and the whole compiled policy is validated first. | R-POL-1 | `dry-run.test.ts` |

### Removed or replaced

249 tests became 177.

- 24 tests of the stand-in room's own scenario, data and rules (`src/room/mock`). They show nothing about the product; the Room's rules are tested in `packages/room`.
- Four rounds of review findings on the catalogue invariant (27 tests) became `live-catalogue.test.ts` (18): each review's defect cases and one control each.
- `review-125ee638` (15) and `review-f3fff92c` (8) merged into `change-history.test.tsx`.
- Review and amendment files regrouped by what they protect; tables of 14, 5 and 4 cases became one test each.

## The 36 repaired defects of declared acts stage 2

One witness for each defect that review found in stage 2 (request `fd6f00b6`). Numbers are those of the stage 2 review's defect list. Every witness is a `describe`, or a `describe` and a test, of `packages/room/test/workerd/declared-fd6f00b6.test.ts`, unless another file is named.

| Defect | Witness |
|---|---|
| 1: lane kind in policy input | "what policy sees of a thread" |
| 2, 8, 11: retry before shape; closed outer shape; target after step 4a | "step 4a", "across a change of shape" |
| 3, 7, 25: `purpose`; inherited names; empty `goal` and `text` | "a declared act's body is the application's own" |
| 4: `who.delegable` at each use | "grants carry the bindings", "a grant covers a declared kind only by its map" |
| 5, 28: a session with a map after a return to `v1`; decided in the queue | "room-custody sessions", "a redemption is granted under the document in force" |
| 6, 15: an invitation never gains; a session of no kind | "room-custody sessions", "an invitation never gains a kind" |
| 9, 27: bearer retry; a used key with another act | "room-custody sessions", "a bearer session's retry" |
| 10: a kind retired before redemption | "room-custody sessions", "a session's map is judged" |
| 12, 20: a retired kind and a stale binding at reservation | "a landing in flight", "a landing under a delegation" |
| 21: a recovery landing in flight | "a landing in flight", "a recovery landing is judged by the recovery rule alone" |
| 13: reads follow the step | "threads have kinds", "every step is reached through a declared kind of another name" |
| 14, 26, 36: recover role table; `recover` field; op as text | "recover, the platform kind"; `node/declared-equivalence.test.ts`: "each recover op takes the body" |
| 16, 17: conflict mode; `opened` effect | "one vocabulary per document"; "the lease rule" |
| 18: platform kinds bound by role | "grants carry the bindings", "a grant is judged when it is admitted" |
| 19, 31, 32: check job kind and binding | "check jobs in a v2 room" |
| 22, 30: document bound | "a document the room cannot store or run"; `packages/policy/test/declared-acts.test.ts`: "a document of exactly 1,048,576 canonical bytes" |
| 23, 33, 34: wording facts, bound, final boundary | "refusal wording from the declaration"; `node/declared-equivalence.test.ts`: "refusal wording is filled" |
| 24: parsed once | "the active document as the room keeps it" |
| 29: `constructor` and `prototype` names | `packages/policy/test/declared-acts.test.ts`: "a kind or a body field named constructor or prototype is refused"; the Room's half is `declared-fd6f00b6.test.ts`: "a name every object inherits is undeclared too" |
| 35: segment backslash | `node/declared-equivalence.test.ts`: "the declared field types" |
