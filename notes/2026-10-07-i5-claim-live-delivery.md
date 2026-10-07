# I5 claim with no session: delivery

Branch `claude/i5-claim-live-delivery-mvst61`. The brief named the local
branch `i5-claim-live`; this session may push only under the name above,
so the work is there. It starts at `origin/claude/i5-signed-read-n0jfnf`
with `origin/request/i5-client` merged in. The merge had no conflict.
Nothing is deployed.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** neither.

## 1. What is built

A key reads the summary and the genesis of a scope whose genesis's cause
chain leads to an entry that key signed, within the window measured at
that entry's time. The command line reads by signed reads whenever it
holds no session, and `claim` runs end to end with no session. [code, run]

Tests, by title:

| Test | File | What it shows |
|---|---|---|
| "the claim's key reads the summary and genesis of the directory the claim caused, and of membership, the rules scope and the destination that the directory caused, with no session; the install's key, which signed no claim, reads none of them" | `packages/scope/test/signed-reads.test.ts` | On real scopes of the namespace `PLATFORM`, with the real read sessions under a test secret and a STAND-IN Git host. For each of the four scopes, rita's key gets 200 for the summary, entry 0 and a history of `[0]`. Control: the same reads with no header, and by paul's key, which signed the install and no claim, are 403. Entry 1 of the directory and of membership, which rita did not sign, are 403. [run] |
| "the window of a read by the cause chain is measured at the root entry: the claim, not the genesis that the claim caused" | same | The directory and its children are made 600 seconds after the claim. At 840 seconds after the claim rita reads the directory and membership (200, 200); at 960 seconds, when the geneses are 360 seconds old, both are 403. [run] |
| "a cause chain is followed through at most four causes: a genesis four creations from the signed act has its root, one five creations away has none, an entry that cannot be read is unavailable, and a cause that names no source has no root" | same | `rootOf` over a chain of geneses made by hand, labelled so in the test. Controls in the same test: the five-step chain under a bound of five has its root; a genesis whose seed cause names no source has none. [run] |
| "install, claim by signed reads, seat and session, invite and join over the Worker's routes; acts lists what the role holds; one act takes effect and one is refused by name with nothing written; log, show and verify read the histories back" | `packages/cli/test/story.scope.test.ts` | Item C below. [run] |

The earlier tests of `signed-reads.test.ts` and the signed reads of
`founding-real.test.ts` pass unchanged. [run]

**The command line** (`packages/cli/src/commands.ts`) [code, run]:

- `handleOf` wraps the transport with `signedReads(..., secretSigner(...))`,
  so a read with no session is a signed read by the caller's key.
- `verify` passes `reader: reader ?? signedLogReader(...)` to `httpSource`.
- `run` returns `failed(error.message)` for a `SourceError`: it prints
  "... cannot be read: <reason>" and exits 1.
- `claim`: its read of the register's summary, its waits on the directory
  and its children, its reads of membership for `seat` and `first-key`,
  and its wait on the founder's inbox are signed reads by the founder key.
  Seat, first key and the session request follow as before.
- `join` no longer reads membership before the join (section 6).

**Item C, the story.** On real scopes over the Worker's routes, with the
production authority and the real read sessions and signed reads, in this
order: `verify register` before the claim (consistent, by signed reads of
the log); a read with no header (403); `install`; `claim` (the directory,
membership, rules scope and destination created and confirmed, and read
by signed reads); seat, first key and inbox; `invite` (with rita's
session); `join` (una's new key); `acts`; one act that takes effect
(`add-member`); one refused by name (`guard-failed (not-activated)`, head
unchanged); `log`, `show` and `verify membership` (missing dependency:
the register is not covered by the session); `log` of the register
(forbidden); `verify` of the register by una ("cannot be read:
forbidden", exit 1). [run]

The stand-ins that remain, as the file names them [code]:

- The Git host: `OutsideDouble`, the register's outside port.
- The scheduler: `pause` runs the register's operations driver and the
  dispatchers, as a deployment's alarms would.
- The clock: the namespaces' scripted clock.
- The session secret: one the test generates, in place of the
  deployment's.
- The test's own reads: by `platformNet.inspector`, a reader the command
  never presents, which the test worker lets past the read sessions
  (`packages/scope/test/worker.ts`).
- After the story, and labelled as outside it: the six `verify` runs that
  report consistent use the test readers, which let every reader read.

Controls [run]. On `signed-reads.test.ts` with `scripts/control.mjs`, each
"distinguishes":

| Change applied | Tests that failed by an assertion |
|---|---|
| No acceptance by the chain's root | the claim's key test, the window test |
| A root by any key | the install's key test, the claim's key test |
| The window measured at the genesis, not the root | the window test, the bound test |
| No bound on the chain | the bound test |
| No check that a genesis source is the cause | the bound test |

On the story, by hand (change the line, `npx vitest run --project scope
story`, restore), as `docs/testing.md` says for a root project:

| Change applied | What failed |
|---|---|
| `handleOf` without `signedReads` | `claim`: "Cannot read <register>: forbidden." (assertion) |
| `verify` without the signed log reader | `verify register` before the claim: "cannot be read: forbidden" (assertion) |
| `run` without the `SourceError` line | the `SourceError` was thrown out of the command (a thrown error, not an assertion) |
| No acceptance by the chain's root | `claim`: "Gave up waiting for the directory after 120 reads." (assertion) |

## 2. The cause-chain rule as implemented

[code: `packages/scope/src/signed-reads.ts`, `rootOf` and
`checkSignedRead`; `packages/scope/src/object.ts`, `#rooted`]

- **What is read.** From the genesis of the scope that is read: the
  genesis's `source`, which the genesis records among its `uses`. Then:
  - a source of type `genesis` whose seed digest is this genesis's seed
    cause: the chain goes on from that genesis;
  - otherwise, an `act` among this genesis's `uses` whose intent digest is
    the seed cause (the source itself, or the act that opened the source
    outcome's operation, as the claim for a directory). That act is the
    root: its actor and its `time`;
  - a genesis with a founding intent is a root, with that intent's actor;
  - any other cause, such as a delivery's, has no root.
- **Where each entry comes from.** The scope's own retained entries by the
  use's content digest; otherwise its own scope through the resolver port,
  within `fetchSeconds`. Either way, it must be the entry that the fact
  names, by `isEntryOf` (its position, scope and hash).
- **The bound.** `CHAIN_STEPS = 4` causes. A directory's chain is one
  cause (to the claim); membership's, the rules scope's and the
  destination's are two (to the directory's genesis, then the claim). A
  chain that needs a fifth has no root.
- **The window.** The intent's, `intentLifetimeSeconds` (900 under the
  proposed bounds), on the scope's clock: the root's `time` must be no
  earlier than the reading less 900 seconds. The other checks of a signed
  read (form, signature, scope, read and argument, `notAfter`) come first,
  as before.
- **What it gives.** The same reads as a key that signed an entry: the
  summary, the genesis, and history and log pages that hold the genesis
  and the key's own entries.
- **When it is found.** Once per object, before the first signed read of
  `summary`, `history`, `entry` or `log`, and kept in memory: the history
  fixes it. A chain that cannot be read now is looked for again at the
  next signed read. Those four reads of the scope object are now
  asynchronous. A refusal writes nothing.
- **A child genesis is no signed entry any more.** The previous branch
  counted a directory's genesis as signed by the claim's actor, in the
  window at the genesis's time. That is replaced by the chain, in the
  window at the claim's time.

## 3. What remains for the page

The page reads the directory with a read session, or with a signed read
only within 900 seconds of the reader's claim, so a member other than the
founder needs a session before the page can read anything. [inferred]

## 4. Gate

One run, `npm run gate`, at head `fb4f3bfc9e650ae20f4c33cba13daf307c41201b`,
tree `6c8d255a60df9b99df2cdd1449849caf59765238`. [run]

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | 0 | 4.4 s | 5.6 s |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 11.6 s | 36.2 s |
| test | 1 | 61.7 s | 104.2 s |

Vitest: 99 files, 1 failed and 98 passed; 757 tests, 1 failed and 756
passed. The failure is T36 of `packages/checkers/test/runner.test.ts`,
untouched here: the known failure of this container's git. The gate stops
after the test step, so I ran `node --test scripts/active-source.test.mjs`
alone: 6 passed. [run]

The test log again holds the uncaught runtime error "Cannot perform I/O
on behalf of a different ...", which failed no test. It also
appeared in one `npm run test:changed` run, which then exited 1 with
every test passed. A run of the whole `scope` project (38 files, 116
tests) printed none and exited 0. [run] Its source is not found
[inferred: the previous branch's note saw it before this change].

This note is the only commit after the gate run, and changes documents
only. Source and tests are unchanged from tree `6c8d255a`.

## 5. What is owed

1. **The founder must reach its seat within 900 seconds of the claim.**
   Membership's summary is read for `seat` by the chain, in the window at
   the claim's time. If the Git host's creation, with its retries, takes
   longer, the founder's key reads no child, takes no seat, and so gets
   no session: `claim` ends "Gave up waiting ...", and nothing lets it go
   on. [code; inferred for a real host] Gap, not built.
2. **`join` reads nothing before it joins.** Una's new key has signed
   nothing in membership, and membership's genesis was not caused by her,
   so the old read of membership's summary is forbidden. The command now
   takes `join`'s shape from the platform's `platform:membership@1` and
   reads no revision (section 6). If a later membership version gives
   `join` a key in `expected`, the scope refuses the intent. [code, run]
3. **No test reads a chain entry from another scope by the resolver.**
   The object reads an entry from its retained entries first; whether the
   story's chains reach the resolver step I did not observe, and no test
   gives a resolver an entry that fails `isEntryOf`. [inferred]
4. **A delivery's cause is not followed.** A scope created by a handler
   of a delivery has no root, so its creator's signer does not read it by
   this rule. The decision names the claim's chain only. [code]
5. **The root is kept in memory, per object.** After a restart the first
   signed read reads the chain again: at most four causes, each one local
   or one resolver read. [code]
6. **Replay over signed reads stays partial**, as the previous note says:
   `retained` is not a signed read. The register's genesis retains
   nothing, so `verify register` before the claim is consistent [run]; a
   directory's genesis, which retains entries, is not replayable this way
   [code].
7. **The uncaught runtime error** of section 4. [run]

## 6. Decisions followed

- 70a0680e, extending 61cc5e50 and c6499e91: the chain rule, as section 2
  states it, with the bound of four and the window at the root. Everything
  else stays `forbidden`. [code, run]
- The install's operator key is the founder key: `claim` reads the
  register's summary by the existing rule, through the signed transport.
  [code, run]
- My reading: a "step" is one cause followed, so the claim's directory is
  one step and its children two. [inferred reading]
- My choice, for item 2 of section 5: `join` signs with no read before it,
  since the reading key cannot read and `join` names its member by a
  mark. No route was added. [code]
- My choice for the story: the test's own reads go past the read sessions
  by one named reader, so that every read the command makes is judged by
  the real sessions and signed reads. [code]
