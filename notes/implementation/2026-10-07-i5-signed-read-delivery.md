# I5 signed read: delivery

Branch `claude/i5-signed-read-n0jfnf`, based on
`origin/planner/demo-git-host-9c0f5890` (head `9c0f589`), whose history is
unchanged. The brief named the branch `request/i5-signed-read`; this
session's push is limited to `claude/i5-signed-read-n0jfnf`, so the work is
there. Nothing is deployed.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** neither.

## 1. What is built

A scope answers a signed read, with no session, beside a read session.
The check is `checkSignedRead` in `packages/scope/src/signed-reads.ts`, and
`Reads` in `packages/scope/src/reads.ts` uses it as the read routes' second
acceptance. Every scope object gets it, with its own clock and its
`intentLifetimeSeconds` (`packages/scope/src/object.ts`). [code]

- A reader whose `Authorization` value starts `Signed ` is judged by the
  signed read alone, never by the readers port. Any other reader goes to
  the readers port as before, so a session works as before. [code]
- A signed read may name `summary`, `history`, `entry` or `log`. The
  history and log pages hold only the genesis and the key's own entries;
  `entry` answers only those. Every other read is `forbidden`, and so is
  a stream. [code, run]

Tests, by title:

| Test | File | What it shows |
|---|---|---|
| "the install's key reads the register's summary, genesis and own entries with no session; a founder's claim key reads its own; every other read, another scope and a key that signed nothing are forbidden" | `packages/scope/test/signed-reads.test.ts` | On real registers, over the service's routes, under the real read sessions with a test secret. The control: the same reads with no header are 403. The install's key reads the summary, a history of `[0]` and entry 0, and gets 403 for entry 1 (the claim). The claim's key reads a history of `[0, 1]`. Reads of `items` and `outbox`, a signature for another read or argument, a signature for another register (also one that the same key installed), a key that signed nothing, and a request signed by another key than it names: each 403. Replay over the log with a signed reader reports `incomplete`, coverage entry 0 to 0. [run] |
| "a signed read is refused past its notAfter, with a notAfter further ahead than an intent may live, and once the key's last entry is older than the window" | same | `notAfter` 901 seconds ahead: 403; 900 seconds: 200. A read signed before, 600 seconds later: 403. 960 seconds after the install and 360 after the claim, the install's key is refused and the claim's key reads. [run] |
| "an install founds a register; a founder's claim opens the creation of a repository; ..." (extended) | `packages/scope/test/founding-real.test.ts` | Before any session, the claim's key reads the register's summary (200) and the directory's genesis (200, an entry of type `genesis`) and summary (200); the install's key reads the register (200) and not the directory (403); the directory with no header is 403. The membership reference read from the directory's `repository` item equals membership's, and the test's session request now names that learned reference. [run] |
| "a signed read is the scope, the read, its argument and a notAfter, signed by the key it names; ..." | `packages/client/test/signed-read.test.ts` | The client's header holds the canonical signed read, which the bytes package verifies; a changed `arg` or `read` does not verify; the lifetime bound is the intent's. [run] |
| "a transport with signed reads signs summary, history, entry and log with their arguments when no reader is presented, and sends a presented session unchanged" | same | Each read goes out with its own read name and argument; a `Session` reader goes out as it is; the replay reader signs `log` and sends no header for `retained`. [run] |
| "a history the service refuses to read is a read error that names the service's reason, and the command exits 2 with it; a reader function gives the header of each read" | `packages/replay/test/cli.test.ts` | Item C below. [run] |

Controls with `scripts/control.mjs`, each on the file named, each result
"distinguishes" with the assertion that states the invariant [run]:

| Change applied | Test that failed |
|---|---|
| Any key may read (signer check removed) | the install's key test (vic and paul at vic's register read), and the window test |
| No age limit on the key's entry | the window test |
| No upper bound on `notAfter` | the window test |
| No check that the reading is before `notAfter` | the window test |
| No check of `to` against the scope | the install's key test (paul's signature for R at P) |
| No check of the read and argument | the install's key test |
| No filter of entries to the key's own | the install's key test (history `[0, 1]` for paul) |
| No signature check | the install's key test (the forged request) |
| No signer from the entry a directory's genesis retains | the founding-real test (403 for the claim's key at the directory) |
| Replay's read error without the source's reason | the replay test |

## 2. The request's exact form

[code: `packages/contract/src/session.ts`, `packages/bytes/src/session.ts`,
`packages/scope/src/signed-reads.ts`]

- Header: `Authorization: Signed <value>`. The value is the unpadded
  base64url of the canonical JSON of `{ request, sig }`, at most 2048
  characters. Nothing is in the URL.
- `request`: exactly `{ v: 1, to, actor, read, arg, notAfter }`.
  - `to`: the scope ID read.
  - `actor`: the signing key's ID.
  - `read`: `summary`, `history`, `entry` or `log`.
  - `arg`: `"summary"` for the summary; for `history` and `log` the cursor,
    `"0"` when there is none; for `entry` the position in decimal. At most
    64 characters.
  - `notAfter`: a timestamp.
- The signed bytes: the tag `artroom-read-1`, one newline byte, then the
  canonical JSON of `request`. The signature is Ed25519 by `actor`, the
  same primitive as an intent's (`sign` in `packages/bytes/src/sign.ts`).
  The tag is in `SESSION_DOMAINS.read`, so a signed read is never the
  bytes of an intent or of a session request.
- The window: the scope's `intentLifetimeSeconds` (900 under the proposed
  bounds), on the scope's own clock. The reading must be before
  `notAfter`, and `notAfter` at most 900 seconds after the reading. The
  key must have signed an entry of the scope whose `time` is no earlier
  than the reading less 900 seconds.
- Who signed an entry: the actor of an `act` or `preparation`; for a
  genesis that took effect, the actor of `founding` (a register's
  `install`), or, for a child, the actor of the act, in an entry that the
  genesis retains, whose intent digest is the seed's cause (a directory's
  genesis retains the claim's entry).
- Refusals: `forbidden` (403) for everything, but a clock that reads
  earlier than the previous entry's time, which is `clock-behind` (503).
  A refusal writes nothing.

Client side [code: `packages/client/src/signed-read.ts`]: `signedRead`,
`signedReader` (the header value), `readArgument`, `signedReads` (a
transport that signs the four reads when the reader is not a text) and
`signedLogReader` (the replay source's reader). Default lifetime 60
seconds.

Replay [code: `packages/replay/src/source.ts`]: `httpSource`'s `reader`
may now be a function of the scope, the read (`log` or `retained`) and its
argument, which gives the header of each read.

## 3. What each client changes

Neither package is on this branch; these are the changes to make there.
[inferred: not built or run here]

- **Command line** (`packages/cli/src/commands.ts` on
  `origin/request/i5-client`), in `handleOf`: wrap the transport,
  `new ScopeHandle(signedReads(transportOf(ctx, config.service), secretSigner(await signerOf(ctx, config))), scope, ...)`.
  A null reader is then signed, and a session is sent as before. For
  `verify`: pass `reader: reader ?? signedLogReader(secretSigner(await signerOf(ctx, config)))`
  to `httpSource`, and add to `run` the line
  `if (error instanceof SourceError) return failed(error.message);`, which
  prints "... cannot be read: <reason>" and exits non-zero (see item C in
  section 5).
- **Page** (`packages/page/src/data.ts` on `origin/request/i5-page`, line
  106): read the directory with
  `new ScopeHandle(signedReads(httpTransport(session.service, ...), secretSigner(session.secret)), directory, null)`.

## 4. Gate

One run, `npm run gate`, at head `50073bcddc9a393bb395e4a86101d4930937ea63`,
tree `f587f929a02c4e2ea9ed063fe27a5ce0a222b07e`. [run]

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | 0 | 4.3 s | 5.7 s |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 9.5 s | 29.8 s |
| test | 1 | 59.3 s | 101.0 s |

Vitest: 97 files, 1 failed and 96 passed; 752 tests, 1 failed and 751
passed. The failure is T36 of `packages/checkers/test/runner.test.ts`
(`reason: "checkout-failed"`), untouched here, the known failure of this
container's git version. The gate stops after the test step, so I ran
`node --test scripts/active-source.test.mjs` on its own: 6 passed. [run]

The test log also holds an uncaught runtime error, "Cannot perform I/O on
behalf of a different ...", that failed no test. A run of
`signed-reads` and `founding-real` alone printed none [run]; where it
comes from I did not find [inferred: not from this change].

This note is the only commit after the gate run, and changes documents
only (it also removes `notes/.keep-i5-signed-read`). Source and tests are
unchanged from tree `f587f929`.

## 5. What is owed

1. **`claim` still reads the register before it has signed there.** The
   command line computes the `found` act's `expected` from the register's
   summary before it signs (`expectedOf(shape.acts["found"]!, (await
   summaryOf(R)).items, null, fields)`, `commands.ts` on
   `origin/request/i5-client`). The decision answers "the key that signed
   a claim's `found`", so before the `found` the founder's key reads
   nothing. [code] Gap, not built: how a founder learns the register's
   revision before the claim.
2. **The founder cannot read membership before its seat.** `claim` reads
   membership's summary for the `seat` act's `expected`, and the
   directory's children's summaries to wait for them (`active`). The
   founder's key signed no entry of membership, the rules scope or the
   destination: their geneses come from the directory's `create`, whose
   seed cause is no intent of the founder's [inferred from
   `packages/platform/src/directory.ts`]. A session needs an active key of
   an active member (`issueSession`, `sessions.ts`), which the founder is
   only after `seat` and `first-key`. [code] So the decision's "takes a
   session there as today" is reached only once the seat is taken. Gap,
   not built.
3. **The page's directory read is limited to recent signers.** A member who
   opens the page has, in most cases, signed no directory entry within the
   last 900 seconds, and is refused. [inferred] Gap: how a member who is
   not the founder learns membership's reference, unless from the
   invitation link.
4. **Item C as worded.** The brief asks that `artroom verify` print
   "cannot be read: <reason>" and never throw, "in packages/replay's
   httpSource error path so every caller gets it". `httpSource` already
   returns every failure as a value and does not throw [code]. The throw is
   `verify`'s: a target whose first page cannot be read has no report,
   because a report states a target fact (`target: FactRef`, scope, incarnation and hash, in
   `packages/contract/src/report.ts`) that nothing was read to give. So I
   kept the `SourceError` and made its message end `cannot be read:
   <reason>`, with the reason in `error.reason` [run]. The replay command
   prints it and exits 2 [run]. The command line's `run` rethrows any error
   it does not know, so it needs the one line in section 3. Making
   `verify` itself never throw needs a decision on a report with no
   target.
5. **Replay through a signed read is partial by design.** A signed read
   gives the genesis and the key's own entries, so a replay over it covers
   up to the first entry another key signed and reports `incomplete`
   [run]. A page with a gap in it is not the entries in order, and is
   reported "cannot be read" [code]. `retained` is not a signed read, so a
   genesis that retains an entry cannot be replayed this way [code].
6. **The cost of the check.** Each signed read walks back from the head
   over the entries of the last 900 seconds, and for a child's genesis
   reads the entries it retains. No bound beyond the window is set. [code]
7. **A signed read is replayable.** Whoever captures one may make that one
   read, with that argument, until its `notAfter`: at most 900 seconds.
   [code]

## 6. Decisions followed

- 61cc5e50 and c6499e91, as the brief states them: a signed read with no
  session; the summary, the genesis and the caller's own entries; the
  same signing primitive as an intent; the window of an intent; a key
  that signed nothing, or a signature outside the window, `forbidden`; a
  session as before. [code, run]
- Reading of the decision's "signed an entry of that scope within the
  current authority window": I took it as the entry's `time`, on the
  scope's clock, no earlier than the reading less the intent lifetime. The
  operator's key therefore reads the register only within 900 seconds of
  its last entry there. [inferred reading; code, run]
- `log` is answered like `history`, filtered, because replay reads `log`,
  which item A allows. [code]
- No route was added. A refusal writes nothing. [code]
