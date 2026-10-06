# I3: the review of the earlier mint ledger, host adapter and diagnoses

Written 2026-10-05, with steps 19 and 20 of the I3 plan
(`notes/2026-10-05-i3-implementation-plan.md`, section 8.3). A parked file
moves only after a written review of it. This note is that review for the
earlier mint ledger, the earlier host adapter and the earlier diagnoses,
in the pattern of `notes/2026-10-05-i3-git-review.md`.

"The authority note" is revision 21 at `f9ec25e4`, adopted. "The proof
plan" is revision 9 at `85be9f0b`, adopted. "The deltas" is
`notes/2026-10-05-i3-contract-deltas.md`. Parked paths are under `parked/`,
as they were at `4f771d901`. "Rule n" is a ledger rule of the authority
note's section 5.4.

No file moved as it was. Three parked files are removed: `git/src/mints.ts`,
`room/src/artifacts.ts` and `room/src/diag.ts`. Their successors are
`packages/git/src/host.ts` and `packages/scope/src/diag.ts`, with the
ledger of outside effects that step 4 built
(`packages/derive/src/ledger.ts`, `packages/scope/src/operations.ts`).

## 1. What was read

| Parked file | Lines | Read |
|---|---|---|
| `git/src/mints.ts` | 951 | In full, at the lines. Removed. |
| `room/src/artifacts.ts` | 259 | In full, at the lines. Removed. |
| `room/src/diag.ts` | 114 | In full, at the lines. Removed. It was also run: section 4.1 says on what. |
| `git/src/artifacts.ts` | 141 | In full. It holds the host's interface that the two files above use. Not removed: no step of mine replaces its reads. |
| `room/src/secrets.ts` | 108 | In full. The earlier diagnoses took three names from it. Not removed: its scan of an act's body has no successor here. |
| `room/test/node/diag.cases.ts` | 174 | In full, for the cases that the redactor must keep. Not removed. |
| `git/test/mints.test.ts` | 1445 | The 48 test names only, not the bodies. Section 5 maps each group to where its rule stands now. Not removed. |
| `room/src/memory/artifacts.ts` | 859 | The first 40 lines only. It is a fake of the earlier host for the earlier Room. The plan gives it to steps 19 and 31, and my task names only the two files above, so it stays. Nothing was taken from it. |
| `room/test/node/mint-sites-scan.cases.ts` | 296 | Not read. |

The parked tests stay where they are, unrun, as the record of the earlier
cases. They import files that are now removed, as other parked files
already import removed files. Step 31 reconciles the directory.

## 2. The mint ledger: `git/src/mints.ts`

### 2.1 What was found

The earlier ledger was careful about the one thing that matters most: an
unknown create stays unknown, whatever time, a lifetime, an inventory or
the end of its owner says (its R-MINT-5). That rule is kept, as rule 2 and
rule 3. The faults below are measured against the adopted model, in which
a duty is an entry and a token is a record.

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| M1 | **A second ledger.** The mint ledger kept its own tables, its own four states and its own summary row, outside any history. The adopted model has one ledger of outside effects, written by entries. A second store beside it would be a second active model. | 275-286, 322-330 | No table. A token is a `token` record of `hold@1`, and a mint and a revocation are operations of the scope's ledger. `host.ts` keeps no durable state at all. |
| M2 | **A record was deleted when it ended.** Nothing durable said that a token had existed, so no verifier could derive its life again. | 16, 328-330, 569, 623 | A record is never deleted. `ended` is a state, and each change is an effect of a sealed entry. |
| M3 | **A token was settled by its end time on the Room's clock, with no margin.** `expiresAt <= now` dropped the record. The end time is the host's and the reading is the Room's. The file's own constant `MINT_CLOCK_ALLOWANCE_MS` records that the two clocks differed by 67 ms on the spike. Rule 4 asks for a margin and for a clock that is not behind, and the contract has no basis for an outcome by an end time (the note's point O12). | 730-740, 781-784, 800 | Nothing is settled by time. `tokenPast` of `ledger.ts` is the judgment alone (deltas, entry EB4). The driver reads no clock. |
| M4 | **A mint that may have applied was minted again.** `mint` tried a transient error up to five times, each as a new record. `retriable` took `INTERNAL_ERROR`, which the file `artifacts.ts` says "has been seen after a fork was created". So one request for a token could leave two live tokens, one of them unknown. The note's section 5.7 says: "Unknown. Nothing is minted again for that operation." | 395-402, 513-515 | A mint is an operation with one attempt. The driver makes one request for an attempt and never repeats one. A further token is a new step, with its own operation. |
| M5 | **The plaintext went to whoever called.** `mint` returned `LedgerToken.plaintext`, and `withToken` gave it to any function, for as long as that function ran. The record was `held` in the ledger's own table, which is no entry. Section 5.7 gives the plaintext to a gateway, and only after the outcome entry is sealed and only when that entry made the token `live`. | 58-69, 406-413, 501-507, 651-663 | `TokenDriver` gives no answer that holds a plaintext. It keeps it in one private map until the scope says that the outcome entry is sealed, then hands it to `Custody` or drops it. Section 3 has the whole path. |
| M6 | **A revocation was sent with no duty written before it.** When storage refused the write of a token's ID, `handoffFailed` revoked at once: "only the revocation at once remains". Rule 1 puts the duty before the request. | 608-633 | A revocation is an operation that an entry opens. An answer that cannot be written yet stays in the scope driver's hand and is offered again (deltas, entries EK2 and EN1). Nothing is sent meanwhile. |
| M7 | **A revocation's own late answer was dropped, and the attempts had no number.** A revocation that timed out counted as failed, was tried again with a backoff "never a deadline", and its late answer was discarded. Rule 2 says that request's own answer settles it. Rule 7 and gap G3 give each cleanup operation a stated number of attempts. | 619, 671, 791, 798-801 | A revocation has at most 3 attempts (`HOLD_ATTEMPTS.revoke`). Its late answer is one more outcome of its own attempt (`TokenDriver.answered`). |
| M8 | **Any resolved answer to a revocation counted as revoked.** `revokeToken(id).then(() => true)` threw away the host's boolean, which said whether a token was revoked or none was there. | 619, 671, 791 | `RevokeReply` keeps the two answers apart. Revoked is `confirmed`. "No such token is live" is `refused`, by the host's own answer, as section 5.7's table of evidence has it. |
| M9 | **A host's raw error was thrown to the caller.** `once` returned `first.e`, and `mint` threw it. The caller then logged it through a pattern redactor. | 399, 512-515 | The driver never passes on what a host threw. A failed call is no answer, and the driver's log holds fixed words. |
| M10 | **Waits were on the wall clock, and two clocks were mixed.** `within` used `setTimeout`. `observe` took its deadline from `Date.now()` and its times from the Room's clock. | 237-246, 841-849 | The driver has no timer and reads no clock. The scope's driver bounds the wait for an answer (`dispatchSeconds`), on the scope's clock. |
| M11 | **The checks on an answer were the earlier host's.** `classify` asked for the scope that was asked, an expiry within the lifetime asked plus an allowance, and an expiry before `notAfter`. A token that failed one was owed a revocation at once. The stored codes of `SAFE_CODES` were that host's too. | 142-150, 519-540 | Not carried, and not replaced by a guess. No adopted text states the request's lifetime, access or repository as a form, or what an end time past a bound is (deltas, entry ET6). The driver reads an ID and an end time, as section 5.7 states the evidence of a mint. |

What the earlier ledger did well, and where it stands now:

| Kept as a rule | Where |
|---|---|
| The duty is durable before the request leaves. | Rule 1. `operations.ts`: the row is written with the opening entry, and the mark before the send. |
| An unknown create is settled only by its own answer. | Rule 2. `ledger.ts`, `outcomeOf`; witness T19, and T19 through the port. |
| An inventory settles nothing, and only tokens that the ledger can match by ID are revoked. | Rules 3 and 5. `host.ts` has no listing call, and a revocation names the ID of its own sealed record. |
| An error field keeps a fixed phrase and a name from a fixed list, never a message (`errorNote`, `SAFE_NAMES`). | `scope/src/diag.ts`, `diagnosis`. |
| A late completion changes its own record and no other. | `ledger.ts`, `attemptedBy`. |

### 2.2 What was dropped, and why

| Parked | Why it did not move |
|---|---|
| The tables, `summary`, `count`, `move`, `drop`, `duties` | M1 and M2. The reads `operations` and `operation` of the scope show every duty. |
| `takeOver`, `adopt`, the takeover time | A new host start made every `held` token owed at once. In the adopted model a restart settles nothing, and a `live` token's plaintext is at a gateway, not in the scope. An attempt that was marked as perhaps sent is recorded `unknown` by the scope's driver. |
| `observe`, `OBSERVE_WAIT`, `MINT_LISTING_MAX`, `completeInventory` | The listing of the earlier host. It settled nothing there either. Finding a token that is in no ledger is the operator's incident work (section 5.5). |
| `startPass`, `revoke`, `nextDue`, the backoff | The scope's driver and `Wakes` do this for every operation. |
| `mint`, `withToken`, `release`, `claim`, `LedgerToken` | M4 and M5. |
| `classify`, `MINT_CLOCK_ALLOWANCE_MS`, `SAFE_CODES`, `ERROR_STAGES` | M11. The stages named the earlier landing, workspaces and snapshots. |
| `within` | M10. |

## 3. The host adapter: `room/src/artifacts.ts`

It was the earlier Room's port over one host's binding: reads of the main
branch, of a policy file and of trees; a lookup of a lane's fork; pinning;
diffs; a merge preview; and a snapshot. It minted nothing itself. It passed
the two ledgers' `withToken` to the pinning code.

### 3.1 What was found

| # | Fault in the parked code | Lines | What follows |
|---|---|---|---|
| A1 | It adapts a deleted runtime. It imports `./ports.ts`, which I1 deleted, the earlier policy package, and sixteen names of the earlier Git package, which is parked and in part removed. It does not compile. | 14-34 | Nothing moves. The plan's row says "Rewrite". |
| A2 | The branch was a fixed name, tried twice: `main`, then `refs/heads/main`. A destination's branch is a value of its scope (section 12.1.5). | 126-133 | A read of a branch is `Git.readRef` of `packages/git`, by a checked ref name. |
| A3 | **A missing tree was read as an empty one.** `readConfig` and `snapshot` took `(await repo.readTree(...)) ?? []`. A repository whose root tree could not be read was read as one with no policy and no checkers. A snapshot over a tree with a missing subtree got a digest as if that directory were empty. This is the fault R10 of the Git review, in another place. | 145, 148, 153, 246 | `Reader.closure` of `packages/git` ends at the first object that is absent. The snapshot is step 24's to write again. |
| A4 | A fork was found by a name made from the lane's ID. The plan removes lane keys from fork names (its section 6.1, the last row). | 166-179 | Step 18 names a fork from its hold. The check that a fork's source is exactly this repository (rule 5) is right, and stays a rule: no code of this step touches a fork. |
| A5 | The policy and the checkers' configurations were read from files of the repository. | 141-158 | The rules scope holds them (section 12.1.4). No successor. |
| A6 | The plaintext of a canonical token reached the pinning code through `mints.withToken`. | 67-70, 114-124 | M5. |
| A7 | `locate` and `canonicalRemote` fixed the earlier host's naming: a namespace and a name, and a remote from the binding. | 53-60, 103-112 | No successor until the installation design names the host (plan question Q6). `MintAsk` names a token by what the sealed record holds, and names no repository (deltas, entry ET6). |

### 3.2 What the successor is, and what it is not

`packages/git/src/host.ts` is the token half of a host port, and no more:
`GitHost`, with one call that mints and one that revokes, and `TokenDriver`,
which gives the scope's ledger its answers. It reads no branch, no tree and
no fork, and it creates and deletes no repository. Those have other homes:
the reader and the commands of steps 17 and 21, the fork of step 18, the
snapshot of step 24, the destination's reads of step 26. No adapter for a
real host exists. The production ports of a scope still send nothing
outside the service.

**Custody of a plaintext in the successor.**

| Where | From | Until |
|---|---|---|
| The host's reply, in this process's memory | The mint's answer | `TokenDriver` has read it |
| One private map of `TokenDriver`, by the attempt that minted it | Then | The scope's driver calls `judged` for that attempt, or the process ends |
| `Custody`, the gateway's side | `judged`, with a sealed outcome entry that made that token `live` with that ID | The gateway's own rules (`gateway.ts`) |
| Nowhere | `judged`, in every other case: the entry made the token `revoking`; the answer wrote no entry; the entry is not that attempt's `confirmed` outcome; the entry names another ID | Not applicable |

It is in no answer that the driver gives the scope, so in no entry, no row
of the driver and no read. It is in no log line and no thrown error.

**What an outcome that is not known owes.** A mint: the record stays
`minting`, nothing is minted again for that operation, and only that
request's own answer may follow. A revocation: the record stays
`revoking`, the operation is not settled, and the duty stays. A further
attempt is a new request, and its answer settles nothing about the earlier
one.

## 4. The diagnoses: `room/src/diag.ts`

### 4.1 What was found

The parked redactor was run, once, on twelve probes made for this review,
from a scratch directory outside the worktree, with Node's own TypeScript
loader. Faults D1, D2, D4, D5 and D6 were observed in that run. D3 follows
from D2 and from the proof plan's text.

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| D1 | A password that holds an `@` left its tail in the text. `https://user:p@ss-w0rd@host` became `https://<credentials>@ss-w0rd@host`. The rule stopped at the first `@`. | 87 | `USERINFO` takes everything from the scheme to the last `@` before the path. |
| D2 | A pair was redacted only when its name ended with the word. `token2=…`, `api_key_1: …` and `X-Hub-Signature-256: …` passed whole. A token in prose, and a token of under 32 characters with no prefix that a rule knows, passed too: `the token tk-91aa-77bc-z was rejected`. The last two are not faults of a rule. No pattern can know every credential. | 56, 95 | `PAIR` lets the word stand anywhere in the name. The second part is D3. |
| D3 | **A diagnosis kept the provider's message**, cleaned by those patterns. The proof plan's key O3 asks for "no credential and no provider text" in a diagnosis. The earlier mint ledger had already come to the same rule for its own error fields: "no token format in the contract lets a pattern find every credential". | 100-105 | A diagnosis has no message. It holds an event and a step, which are fixed words of the source, and a name. |
| D4 | The error's name was kept as the thrower wrote it, cleaned by the patterns alone. A name of `HostError tk-91aa-77bc-z` was published. | 102 | A name is kept only when `SAFE_NAMES` has it. Any other error is `Error`. |
| D5 | The cut at 300 could split a surrogate pair, and left half of one. | 96 | `bounded` steps back one code unit. The unit is stated: UTF-16 code units. |
| D6 | A thrown value whose `message` or `name` getter throws made `diagnosis` throw. `report` caught it, so the failure had no diagnosis at all. | 101-104 | Only the name of an `Error` is read, inside a `try`. A value that cannot be read is named by its type. |
| D7 | The first rule knew the earlier host's token format, `art_v<n>_…`. The list of public identifiers held the earlier model's `room_…` and `act_…`. | 86; `secrets.ts:45` | The host's format is not known here (plan question Q6), and no rule names one. The public identifiers are this model's: a key ID, a scope ID, an incarnation, an object ID and a digest's hex. |

### 4.2 The review table

| Kept as | From | What it does | What it never does |
|---|---|---|---|
| `redact` | `redact`, `diag.ts:83` | Replaces URL userinfo and queries, Authorization and Cookie headers, authentication schemes, pairs whose name says it is a credential, six formats known by a prefix or a delimiter, and long runs that look random. Cuts to 300 code units. | It is not complete, and its head says so. No caller gives it a provider's text and publishes the result. |
| `diagnosis` | `diagnosis`, `diag.ts:100` | Builds the three texts. The event and the step pass through `redact` and are cut to 100 code units, as a second guard. | It reads no message, no stack, no cause and no text of a thrown value. |
| `report`, `toConsole`, `DiagnosisSink` | The same names | One JSON line for a failure, to the sink. A sink that fails changes nothing. | It never throws. |
| `looksRandom`, `RUN`, `PUBLIC_ID` | `highEntropy`, `TOKEN`, `PUBLIC_ID` of `secrets.ts:42-64` | The fallback for a long random run. Its thresholds are the earlier scan's, and are no proof. | Nothing depends on it alone. |

### 4.3 What was dropped, and why

| Parked | Why it did not move |
|---|---|
| The member `message` of a diagnosis | D3. |
| The Artifacts token rule | D7. |
| `DETECTORS` of `secrets.ts`, as a fallback | Each of its eleven formats is met by a rule that needs no length: eight by `PREFIXED`, and the three that are assignments by `PAIR`. |
| `MAX_MESSAGE` | It is `MAX_TEXT`, with its unit stated. |

### 4.4 Where a diagnosis is written

One place so far: the operations driver, when its port for outside effects
throws (`operations.ts`, `#send`), and when the port fails as it is told of
a judged answer. The sink is the port `diagnoses`, whose production default
is the runtime's log. Other places that discard a failure are as they were
(deltas, entry ET10).

## 5. The earlier mint tests, by group

`git/test/mints.test.ts` has 48 tests in 14 groups. Only their names were
read. This table says where each group's rule stands in the adopted model.
It is a map, and no claim that each earlier case has a test now.

| Group | The earlier rule | Now |
|---|---|---|
| (1), 5 tests | The record and the wake-up are stored before the send. | Rule 1. T19, in `scope/test/operations.test.ts`. |
| (2), 1 | Applied and then an error: unknown, through lifetimes, inventories and a takeover. Nothing outside the ledger's records is revoked. | T19 through the port, `scope/test/tokens.test.ts`. The retry as a new record has no successor (M4). |
| (3), 2 | A refusal that changed nothing ends the record. A transport failure is unknown and is not retried. | `git/test/host.test.ts`, the second test. The token's `ended` state: `derive/test/forms-records.test.ts`. |
| (4), 6 | An answer that cannot be used is owed a revocation. No ID is unknown. An owed record is settled when its expiry passes. | An ID with an end time is `confirmed`, also with no plaintext: `host.test.ts`. No ID, or no end time, is no answer (deltas, entry ET5). The checks on scope and lifetime are not carried (M11). Nothing is settled by time (M3). |
| (5), 3 | A late answer settles its own record, and no caller gets the text. | `host.test.ts` and `tokens.test.ts`. A late mint whose use has not ended is `live`, and its plaintext goes to the gateway's side. One whose use has ended is `revoking`, and its plaintext is dropped. |
| (6), 5 | A failed handoff, storage that refuses, two mints in flight, a stale caller, `claim`. | M6. The scope driver's answers in hand: `operations.test.ts`, two tests. An outcome changes its own attempt only: `derive/test/forms-ledger.test.ts`. |
| (7) and (8), 3 | The takeover and its time. | A restart settles nothing: T19, and T19 through the port. |
| (9), 6 | A failed revocation stays owed, with backoff. | Three attempts, and its own late answer: `tokens.test.ts`. |
| (10), 3 | Scale, the listing, the schedule of observations. | No listing. A bounded pass: `operations.test.ts`, "after a restart the driver walks". |
| (checker 1), 6 | A repository lookup that never answers. | The driver looks nothing up. The scope's driver bounds one wait. |
| (checker 2), 3 | An error sink stores safe metadata only. | `host.test.ts`, the second test, and T14, `scope/test/redaction.test.ts`. |
| (checker 3) and (checker 4), 5 | Expiry during a pass. One deadline for a lookup and a listing. | No successor: M3 and the dropped listing. |

## 6. Witnesses

| Invariant | Test | Command |
|---|---|---|
| A token's plaintext is in no answer. It is handed to the gateway's side only after the sealed outcome entry made that token `live` with the reply's ID. Every other case drops it. | `packages/git/test/host.test.ts`, first test | `npx vitest run --project git host` |
| A request names only what the sealed entry records. A host's failure is no answer. Nothing that a host threw is in an answer or a log line. | The same file, second test | The same |
| T19 through the port. A mint whose reply is lost stays `unknown` and `minting` through a restart, a day and a listing. Its own late answer makes it `live`, and only then is its plaintext handed over and the staging sent. A revocation whose reply is lost stays a duty through two further attempts, until its own answer. | `packages/scope/test/tokens.test.ts` | `npx vitest run --project scope tokens` |
| The redactor, as a table, with its length and unit. A diagnosis reads nothing of a thrown value but a name of the fixed list. | `packages/scope/test/redaction.test.ts`, first test | `npx vitest run --project scope redaction` |
| T14. A provider's error that holds a token, a URL query, userinfo and a bearer value is thrown at two outside calls. No entry, read, answer, diagnosis or log line holds a credential or the provider's text. The gateway's side still holds the tokens. | The same file, second test | The same |

**What is a stand-in.** In `host.test.ts`: the host (`TokenHost`), the
gateway's side (`Vault`) and the sealed entries, which are made by hand. In
the two scope tests: `TokenHost`, `Vault`, and `Stager`, which answers the
one request of an attempt of a staging as the test wrote it. The scope, its
storage, its commit protocol, its alarm, the code of `hold@1`, the
operations driver and `TokenDriver` are real. No test here shows anything
about a real host, a real gateway, a fork or a push.

**What these tests do not show.** A token of a hold, with the purpose
`workspace`: the step `token` needs a fork that is `selected`, and a
fork's creation has no rules until step 18. The tokens here are the two of
a staging's attempt. A mint that is answered after its use has ended is
shown at the driver with an entry made by hand, and as a rule in
`derive/test/forms-records.test.ts`. It is not shown at a real scope: the
use of an attempt's token ends with its attempt's outcome, and the attempt
is not sent before its tokens are `live`.

Failure controls, each run once with `scripts/control.mjs`. Each
"distinguishes", by an assertion.

| Guard | Change | The assertion that failed |
|---|---|---|
| The entry made the token `live` | `judged` does not read the record's state. | `host.test.ts`: `expected [ 2, +0 ] to deeply equal [ 1, +0 ]`, the count of what the gateway's side holds |
| The entry names the reply's ID | `judged` does not compare the ID. | The same assertion |
| The entry is the `confirmed` outcome | `judged` does not read the result. | The same assertion |
| An ID is never its plaintext | `#minting` takes an ID that holds the plaintext. | `host.test.ts`: the answer of the sixth mint, and the driver's count of plaintexts in hand |
| A revocation names a `revoking` record | `send` does not read the record's state. | `host.test.ts`: a `live` record is sent, where "not sent" is expected |
| A record names its operation | `tokenOf` takes a record of another operation. | `host.test.ts`: the same list |
| Only a token operation of `hold@1` | `accepts` does not read the owner. | `host.test.ts`: `accepts("platform:destination@1", "mint")` |
| The port is told of the sealed entry | The scope's driver tells `judged` null in place of the entry. | `tokens.test.ts`: the gateway's side holds nothing |
| A staging waits for its tokens | `stage` has no `ready` rule. | `tokens.test.ts`: the first list. The staging was sent with one token `minting`, so two more tokens exist |
| A waiting attempt is looked at again | An outcome entry does not start the walk again. | `tokens.test.ts`: `expected [] to deeply equal [ '5:0#1' ]`, the stagings sent |
| A name of the fixed list only | `diagnosis` keeps the thrower's name. | `redaction.test.ts`, both tests: the diagnosis of a `HostError`, and the leaked text in what was written |
| A step is fixed words | The driver's diagnosis takes the error's text as its step. | `redaction.test.ts`, T14: the leaked text in what was written |
| Userinfo to the last `@` | The earlier pattern. | `redaction.test.ts`: the row "userinfo whose password holds an @" |
| A name that goes on after the word | The earlier pattern. | `redaction.test.ts`: the row `token2=` |
| No half of a surrogate pair | `bounded` does not step back. | `redaction.test.ts`: `expected [ 300, 300, 'short', 300, false ]` |

The tenth control was first inconclusive: the test read an entry that was
not there and threw. The test now asserts which stagings were sent before
it reads that entry, and the control was run again.

No control was written for the `catch` around a host's call in
`TokenDriver.send`. Without it the call rejects into the scope's driver,
which catches it too and diagnoses it by its name. T14 shows that path
with the sender of a staging.

## 7. Checked against the retained paths

The plan's section 6.2 lists the paths that no step deletes, moves or
reads the body of: the two spike configurations, `room/scripts/`,
`room/src/mcp.ts`, every `measure/` directory, and
`.github/workflows/row-writes.yml`. None of the three removed files is on
it, and none of the files read for this review is. Parked files that
import a removed file still name it, and are not edited: eleven name
`mints.ts`, three name `diag.ts`, and two name the Room's `artifacts.ts`.
They were found by a search for the import. One of them is
`room/src/mcp.ts`, which is on the list: the search matched its import
line, and its body was not read.
