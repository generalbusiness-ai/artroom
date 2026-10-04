# @generalbusiness/artroom-client

The typed client for an Artroom. It gives you the contract's `RoomApi`
over HTTPS (`HttpRoom`) and over a Workers service binding (`Room`). The
same code works on both.

It uses only Web APIs (`fetch`, WebCrypto, `WebSocket`), so it runs in
Workers, Node 22 or later, and current browsers.

## Install

The package is released as a tarball of built JavaScript and declarations.
Install it in one command with the two Artroom packages it depends on:

```sh
npm install --save-exact ./generalbusiness-artroom-contract-<version>.tgz \
  ./generalbusiness-artroom-policy-<version>.tgz ./generalbusiness-artroom-client-<version>.tgz
```

It is not in a registry. [docs/release.md](../../docs/release.md) says how a release is made and checked.
A TypeScript project without Node's types needs `"ESNext.Disposable"` in
`lib`.

## Connect and act

```ts
import { connect, generateSigner, isRefusal, join } from "@generalbusiness/artroom-client";

// Once: make a key and redeem a client-custody invitation with it.
const { signer } = await generateSigner(); // non-extractable in a browser
const joined = await join({ url }, roomId, { invitation, secret, signer });
if (isRefusal(joined)) throw new Error(`${joined.rule}: ${joined.reason}`);

// Then: connect and work.
using room = await connect({ url }, roomId, { kind: "key", signer });
const claim = await room.claim({ goal: "Rate-limit /api/login", scope: ["src/api/**"] });
if (isRefusal(claim)) console.log(claim.rule, claim.reason, claim.fix);
```

## What it does for you

- **Signs every act.** Envelopes are signed with Ed25519 over the RFC 8785
  canonical bytes, with the domain tag of R-SIG-1. Requests (workspace,
  token, read session) are signed with a fresh nonce (R-CRED-6).
- **Retries safely.** After a timeout or a lost response it sends the same
  signed bytes again, with the same idempotency key, so an act happens at
  most once (R-IDEM). If it gives up, the error says `maybeRecorded` and
  names the key to retry with.
- **Keeps refusals and failures apart.** A refusal is a returned value:
  test it with `isRefusal()`. A failure is a thrown `ArtroomError`: test it
  with `isArtroomError()`, never `instanceof` (R-API-1).
- **Handles read sessions.** It starts a session when it first reads, and
  starts a new one if the room ends it.
- **Resumes.** Every page has a cursor. `subscribe(cursor)` long-polls;
  `watch(cursor, onUpdate, onError?)` opens a WebSocket and reconnects
  from the last cursor it saw, so no update is lost or repeated. The token
  travels as the subprotocol `artroom.token.<token>`, never in a URL
  (R-API-12). Over a service binding, `subscribe` decodes the room's
  newline-delimited bytes into updates (R-API-8).
- **Keeps tokens out of output.** Session, bearer and workspace tokens are
  removed from any error or refusal text, and the `log` option prints only
  method, route, status and time.

## Invitations

| Custody | Function | Result | If the response is lost |
|---|---|---|---|
| `client` (people, the CLI) | `join()` | `Joined`, with a read session | The client repeats the same signed `join`, and the room returns the original result. |
| `room` (MCP agents) | `redeem()` | `Redeemed`, with the bearer token shown once | The client does not retry. It throws an error with `maybeRecorded: true` that says: ask an admin for a new invitation, and to revoke the unused delegation (protocol section 22, point 29). |

Each function refuses the other custody with `custody-mismatch` (R-ADM-12).

## Bearer tokens

`connect({ url }, roomNameOrId, { kind: "bearer", token })` gives the same
handle for an MCP agent's token. Reads use the token. Acts go through the
room's MCP endpoint, because over HTTPS that is the only route where the
room signs for a bearer (R-CRED-10). The handle refuses `check` and
`roster` with `forbidden` before it sends anything.

`connect(service, roomNameOrId, { kind: "bearer", token })`, over a
service binding, is the adapter the MCP endpoint's Worker needs: acts go
to `RoomWire.bearerAct`, workspace requests to `bearerRequest`, and reads
use the token. It is not in the contract's declaration of `connect`.

A retried bearer act gets its original result while the token is valid.
After the token is revoked or expires, the room refuses it with
`unauthenticated`: there is no signed envelope to send again.

## Acts a room declares

A room may declare its own acts in its policy document (docs/protocol.md
section 33). Read them, then act with the binding you read:

```ts
const catalogue = await room.acts();            // the active declarations
if (catalogue.vocabulary === "declared") {
  const { declaration, binding } = catalogue.acts["take-part"];
  const out = await room.act("take-part", null, { part: "bass" }, { binding });
}
```

- `acts()` always reads the room. A room whose active document is `v1`
  answers `{ vocabulary: "artroom-legacy-v1" }`: it declares nothing, and
  the named methods are the way to act.
- `act()` needs the binding. It names the meaning you read. The handle
  signs exactly what you give it in envelope `v: 2`. It never reads the
  catalogue, replaces the binding or signs again on its own.
- If the room answers `binding-stale`, the kind's meaning changed. The
  refusal's `current` has the active binding and policy version. Read
  `acts()` again, look at the declaration, and call `act()` with the new
  binding only if that meaning is still what you intend.
- `fieldsOf(declaration, shape)` lists the body fields an act takes on a
  target, with their types. `targetsOf(declaration)` lists the targets.
- A prepared act keeps its binding, so `replay()` sends the same bytes.

The named methods (`claim`, `propose`, `note`, `review`, `check`, `land`,
`release`) keep working. In a `v2` room each signs `v: 2` with the binding
of the code-review declaration it was built for, under the room's steps
version and `lanes`. A room whose declaration of that kind differs refuses
it `binding-stale`. The handle reads the catalogue once for this, and reads
it again after such a refusal. `renew` and `roster` are platform kinds and
stay `v: 1`.

To show an old record, use the declarations of its own seq, not the active
ones: `meaningOf(await room.actsAt({ seq: entry.seq }), kind)` gives the
label, and `retired` when a later policy version dropped the kind. The
handle keeps ended versions, so entries of one version cost one read. The
`explain` read already carries `meaning`.

An ended version's declarations never change, but its `retired` marks can:
a later activation may drop one of its kinds. The handle drops the versions
it kept when it sees a later activation, in `acts()`, another `actsAt()`
answer, a `log()` page, an update, or a refusal that names the active
policy version. An answer that arrives after the handle learnt of a later
activation from another answer is returned to its caller but not kept: it
may have been read before that activation. A handle that has seen nothing
since may answer the marks it read. `actsAt(at, { fresh: true })` always
reads the room.

`envelopeOf(entry)` gives a log entry's envelope in either version, with a
declared act's `binding`, or null for a system entry.

A `Lane` has `kind`: the kind of the act that opened the thread. The acts
that may act on it are those whose declaration's `threads` names that kind.
A thread opened by an application's own act may have no goal.
`threadTitle(lane, { meaning, body })` gives the name every reader uses:
the goal, or else the opening act's label and its first text field by name
(`titleOf`). "Text" is the type the act's own declaration gave the field
when the thread opened, so pass the `meaning` of the opening act's own seq.
With no text field present, or with only a label at hand, it is the first
field by name. The opening act's ID is the lane's ID, so one
`explain(lane.lane)` gives both the `meaning` and, through `envelopeOf`,
the body.

To grant in a `v2` room, build the op with `delegateOp(room, role, { to,
kinds, lanes, expiresAt })` or the session with `invitationSession(room,
role, { kinds, ttlSeconds })`. `*` or a list of kinds becomes platform
kinds and a signed map from each declared kind to its active binding. A
kind the role may not grant is an error, not a smaller grant. A kind added
later is not covered.

With a bearer token, `act()` goes to the MCP tool `act` over HTTPS, and to
`bearerAct` over a service binding, with your binding unchanged. The fixed
`check` and `roster` methods are still refused over HTTPS.

## Finishing an act after a restart

Act methods also take `onPrepared`, which receives the act once it is
resolved and, for a key, signed. Save it. The prepared act holds the
handle's own frozen copy of the target and body, taken before signing: you
may change or reuse the objects you passed in, and the saved act stays the
bytes that were signed. A target or body that is not plain data is
`bad-request`. Later, `resubmit({ url }, roomId,
signed)` sends the signed envelope straight back to the room, unchanged.
It needs no handle, read session or new signature, so it works even after
the key is retired or revoked, and the room returns the original result
(R-IDEM-2). It refuses an envelope signed for another room. An unsigned
bearer act is sent again with a connected handle's `replay(act)`, which
needs a valid token (R-CRED-10). The CLI uses both for its journal.

A handle also keeps each named act that got no answer, and sends the same
bytes when you repeat the call with the same idempotency key, even if the
room's vocabulary changed in between. It keeps at most 64 and drops none:
with 64 unanswered or under way, a new named act is refused `rate-limited`
before it is signed or sent. Acts started together are counted before
either waits, so they cannot both take the last place. A key carries one
intent at a time: a second call with the same key and the same kind,
target and body, made while the first is under way, gets the first call's
outcome; one with another intent is refused `bad-request` and nothing is
sent. This holds from the moment the first call starts, so an `onPrepared`
hook that makes the same call again gets the first call's promise. The hook
must not await it: it settles only after the hook has returned. Repeat one of the unanswered acts, so that it is answered,
and then make the new one.

## Choices this package makes

- **Room IDs.** With a key, you connect by room ID, because envelopes are
  signed with it. The client reads the room's genesis entry and checks that
  its digest is that ID (R-ID-3).
- **Plain HTTP** is refused, except for `localhost` and `127.0.0.1`.
- **Redirects** are not followed, so a credential cannot be sent elsewhere.

The WebSocket subprotocols (R-API-12), the RPC byte stream (R-API-8) and
the invitation link (R-CRED-11) were choices of this package; contract
amendment 2 adopted them.

## Review f47a509c

The checker's review asked for six changes. Each is answered here, and
`test/review-f47a509c.test.ts` in each package names the case.

| Finding | Change | Tests |
|---|---|---|
| P1 Register a held bearer before the first read | `connect` adds the bearer to the redactor before any request. The CLI also scrubs every printed line of the credentials it has seen, including those a room echoes in an ordinary answer | client: "a 401 on connect's first read that echoes the bearer reaches the caller redacted", "a later failure that echoes the bearer is redacted too"; cli: "a bearer echoed in an error, at connection or later, is redacted", "a room that echoes the bearer inside an ordinary answer is scrubbed by the CLI itself" |
| P2 Refresh ended sessions when a watch reconnects | A socket that cannot open makes the watch check its credential over HTTPS first. An ended session is replaced, and the watch resumes from its cursor. A credential the room refuses ends the watch with `error` and one `onError`. `close()` cancels a pending reconnect | client: "after the room ends the session and drops the socket…", "when the room closes the socket with 1008…", "a revoked bearer stops the watch with an error, once…", "closing during a reconnect backoff…" |
| P3 Finish login and redeem before forgetting them | The CLI journal keeps the login (key, join key, then the join's result) and the redemption (then its result and token, in one 0600 write) until the config is written. The same command finishes them. A redemption that may have reached the room is never sent again | cli: "a failure after the join keeps the journal…", "login interrupted after %s…", "redeem interrupted after %s…", "a redemption that may have reached the room is never sent again…" |
| P4 Preserve the resolved act across CLI retries | The CLI journals each prepared act before it is sent. The same `--idempotency-key` replays it unchanged, with no preflight reads | cli: "a lost success response, then a separate run after HEAD, the lane and the lease changed…"; client: "persisted before it was sent, replayed…" |
| P5 Make the landing follow-up wait on the started operation | `land` records its operation, and `artroom wait [OP]` follows it. Only a finished, unsuccessful landing suggests a new `land` | cli: "land without --wait starts once…", "a wait that runs out names the same operation…", "a %s landing ends the wait with exit 1…" |
| P2 (security) Own-property checks in MCP | Only the ten tools' own names are tools. The validator reads only own keys, and the runner gets a JSON copy of its input. Everything stays inside the boundary that never throws | mcp: "%s is not a tool…", "an input key %s is not allowed…", "values smuggled in through __proto__ are never used…" |

The cli package's `exports` now names its real entry point, `src/main.ts`.
(Review 17013617 later removed it: the package is a command only.)

## Review 17013617

The checker's second review confirmed the six findings above and the
amendment 2 edits, and asked for three more changes. `test/review-17013617.test.ts`
in the client and cli packages names each case.

| Finding | Change | Tests |
|---|---|---|
| P2 A retained signed act must not need a new read session | The CLI sends a journaled signed act with `resubmit`, before and without connecting: no session, genesis read, new signature or lane read. New work still connects with the full checks. An unsigned bearer act still has its token judged first | cli: "after the key is %s and sessions end, the same command returns the original claim", "a failing session request and a failing genesis read do not block the receipt", "a recorded refusal whose answer was lost is returned again…", "an envelope signed for another room is refused before anything is sent" |
| P2 Keep an act's journal until its local steps are durable | An act's entry moves from `prepared` to `answered`, which keeps the room's answer. It is removed only after the local steps (config, landing, workspace credential) are done. The same command finishes them from the kept answer, with no preflight and no second act | cli: "land interrupted after %s…", "a failed config write after the land was admitted…", "a claim interrupted after the answer…", "release interrupted after %s…", "release whose credential removal fails…", "a bearer act whose answer was kept finishes from it…" |
| P2 RPC update decoder lifecycle | `decodeUpdates` pipes the bytes through a `TextDecoderStream` and a line-splitting `TransformStream`. The pipe owns the source; `cancel()` works with or without a reader, ends a pending read, and reaches the source. Bad bytes, bad lines and a failing source all reject with an `ArtroomError` | client: "before any read…", "during a pending read…", "after the caller released its reader…", "invalid UTF-8 rejects with an ArtroomError…", "a failing source rejects…", "lines split across chunks…" |

Also: the cli package has no library export, and an obsolete snapshot is
removed.

## Tests

`npm test` runs the Node tests against a fake room (in `test/support`)
that implements the HTTPS routes and `RoomWire`, and the signing vectors
inside workerd. Tests name the rules they check.

The fake room is a stand-in. The tests show what the client signs, sends,
retries, keeps and returns; the Room's own rules are tested in
`packages/room`. The test files, by what they protect:

| File | What it protects |
|---|---|
| `test/signing.test.ts` | Canonical bytes, the signing vectors, and the declared envelope's bytes |
| `test/room.test.ts` | Refusals as values, retries with the same bytes, waits, sessions, cursors, the watch's reconnect and stop, RPC, and no credential in any output. It holds the client cases of review f47a509c, P1 and P2 |
| `test/prepared.test.ts` | A prepared act is the handle's own copy, and a retry sends what was first built. It holds review 43e8fe3b's first finding and review f47a509c, P4 |
| `test/catalogue.test.ts` | `acts()` and `actsAt()`: what the handle keeps never takes a reader back behind an activation it has seen. It holds review 43e8fe3b's second finding |
| `test/declared.test.ts` | The generic act, the named methods' built-for binding, bearer sessions and grants |
| `test/titles.test.ts` | What readers call a record and a thread (decision c37653e1) |
| `test/redeem.test.ts` | Redemption in both custodies, with lost and refused responses |
| `test/updates.test.ts` | The RPC update decoder's stream lifecycle (review 17013617) |
| `test/agents-md.test.ts` | The generated AGENTS.md block |
| `test/contract.types.ts` | No test to run: `npm run typecheck` checks that the client has the contract's declared types |

The tests pass `backoff: () => 1` in `ClientOptions`, so a retry or a
reconnect waits 1 ms. One test in `test/room.test.ts` checks the waits the
client chooses without that option.

The sections above and below record earlier reviews as they were answered.
Where they name `test/review-*.test.ts` files or test titles of this
package, the cases are now in the files of this table.

## Review f7c79158

The checker's third review confirmed the earlier fixes and asked for one
more change, in the CLI. `packages/cli/test/review-f7c79158.test.ts`
names each case.

| Finding | Change | Tests |
|---|---|---|
| P2 Fence recovered local steps against newer work | Before it is sent, each act records the local change it owns, and the state it expects, with its journal entry (`LocalIntent`). One function, `applyLocal`, makes that change for a fresh answer and a recovered one alike. A claim selects its lane, and a land is followed, only if the selection is still the one expected; otherwise the newer one is kept and the output says so. A release removes only the credential `artroom workspace` wrote for that lane, at the path it recorded. Each credential file names its lane on its first line, so a credential that a newer workspace replaced is kept, wherever the command runs. The room's receipt is still recovered without new authority | cli: "repro 1: an older release, recovered after a newer lane's workspace replaced its credential…", "recovery from another directory removes the released lane's own credential, and only that", "repro 2: an older claim, recovered after a newer claim finished…", "an older landing, recovered after a newer one is followed…"; the crash cases in review-17013617 still pass |

## Review 80d3710c

The checker's fourth review confirmed the earlier cases and found the same
ownership problem in two more forms: a newer lease of the same lane, and a
selection that returned to the value an older act expected.
`packages/cli/test/review-80d3710c.test.ts` names each case.

| Finding | Change | Tests |
|---|---|---|
| P2 Fence local recovery by revision and lease, not by lane ID or value | The selected lane and the followed landing each carry a revision that every local change bumps, even back to an earlier value. They also record the act that made the change. A prepared act records the revisions it expects; recovery applies a change only if they are unchanged, and never twice. `artroom workspace` gives each credential an installation ID, written in the file's first line and in the config with its lease. A release records the lease it releases and that lease's installation, and removes only that installation. A newer lease's credential for the same lane, and its mapping, are kept. The output says what was kept. Receipts are still recovered without new authority, and the remote act is never sent again to find out | cli: "repro 1: an older release of lane X, recovered after X was reclaimed with a new lease and workspace, keeps both" (also with the recovery interrupted after `credential-removed` or `config-written`), "the released lease's own credential is still removed when nothing newer replaced it", "repro 2: X, then an interrupted claim of Y, then Z, then X again: recovering Y keeps X", "a recovery interrupted after its own config write does not treat its own change as newer work", "a wait that finishes the followed landing is a local change too…"; the review f7c79158 cases still pass |

## Review f30be7f6

The checker's fifth review confirmed the review 80d3710c fixes and asked
for two more changes in the CLI. `packages/cli/test/review-f30be7f6.test.ts`
names each case.

| Finding | Change | Tests |
|---|---|---|
| E5.1 Fence workspace installation against an older response still in flight | `artroom workspace` reserves its installation (it bumps the room's workspace revision, and names its installation ID) before it asks the room for anything. It installs only if no later local workspace action or release has bumped the revision since, and only for the lease it asked for. A superseded workspace keeps the newer remote, credential, mapping and selection, says so, and exits 1. A release bumps the revision too, so a revoked token is never installed | "same lane: a lease-1 response that arrives after release, reclaim and a lease-2 workspace installs nothing", "different lanes…", "two overlapping workspaces: the one started last owns the installation…", "a release while the workspace is being prepared…", "a failed installation leaves nothing a later workspace or release mistakes for its own" |
| E5.2 Version the config and journal schema | The config and journal are now schema 2. Schema 1 files are decoded explicitly. A schema-1 act's value-based intent cannot prove what it owns, so recovery returns the kept receipt, changes nothing local, and prints "Manual local step" lines. Path-only workspace mappings and old credential markers match no release, and the release says what to remove by hand. A schema-1 config becomes schema 2 at its first atomic write. A newer schema is refused, and nothing is sent | "the exact revision-4 answered release-lane entry returns its kept receipt…", "a revision-2 prepared claim…" and "a revision-4 prepared claim…", "a schema-1 config with a path-only mapping and an old marker…", "an interruption after %s while migrating a schema-1 config…", "a config or journal entry from a newer schema is refused…" |

## Review 744a018a

The checker's sixth review confirmed the schema migration and the
token-response fence, and asked for one installation owner, kept at the
destination itself and established when the command starts.
`packages/cli/test/review-744a018a.test.ts` names each case.

| Finding | Change | Tests |
|---|---|---|
| Reserve before the earlier awaits | `artroom workspace` fixes its Room, lane and repository, and reserves the destination, before its first await. It installs only if it still owns the destination at the end. A delay at the read session, the held-lane read or the token response cannot let an older command overwrite a newer one | "an older workspace delayed at %s does not overwrite a newer workspace for another lane" (the read session, the held-lane read, the token response), "workspaces in unrelated repositories do not supersede each other" |
| Fence the shared credential destination across Rooms | Ownership lives at the destination: `.git/artroom/owner.json` holds a revision, the installation ID, its Room, lane and lease. It is updated under a lock file, by an atomic write. Workspace setup and release both compare that owner before changing any remote, credential file or mapping, so every Room that writes the repository sees the same owner. The config is now schema 3. Schema 2 workspace evidence was per Room, so a schema-2 release is decoded as a manual step | "a workspace for Room A delayed at %s does not overwrite Room B's newer installation in the same repository", "a release in Room A leaves Room B's newer installation in the same repository alone"; the same-Room cases in reviews 80d3710c, f7c79158 and f30be7f6 still pass |

Also: CLI-generated idempotency keys never start with "-", which the option
parser would have read as an option.

## Review 4758945b

The checker's seventh review asked for three changes in the CLI.
`packages/cli/test/review-4758945b.test.ts` names each case, and the
checker's diagnostic, which asserted the defects, now fails on each of
them.

| Finding | Change | Tests |
|---|---|---|
| P2 Keep the installed credential's owner separate from reservations | The owner record (`.git/artroom/owner.json`; version 2 then, version 3 now) has three separate parts: `installed` (the installation whose credential is in the file), `pending` (in the current version 3 record, a list of installations recorded before they replace the file, so a crash leaves evidence; version 2 had a single `installing` party, which review 7040317d made plural), and `reservation` (the latest workspace command; only it may install). Reserving never touches `installed`. A release records, before it is sent, the installations of its lane that the Room knows of (its mapping and the owner records) and the reservations to cancel. It removes exactly a credential whose file names one of those installations. It cancels only those reservations, never a newer one, and leaves any Room's newer credential alone | "failed before the token…", "failed install…", "delayed retry…", "a recovered release does not cancel a newer reservation for the same lane" |
| P2 Upgrade schema-2 installed workspaces with their evidence | Schema 2 and 3 configs keep their installed mappings. A release removes a mapped credential only when the file's installation mark names that installation: the installation ID is random and written by that installation, so a path alone proves nothing. Otherwise it prints the manual step and keeps the mapping as the unresolved duty. If another installation has replaced the file, the duty is done and the newer file is left. Schema-3 release journals decode to manual steps. Schema 4 | "a fresh release after the upgrade removes the mapped credential, proved by its installation mark…", "a schema-2 mapping whose file has no installation mark…", "a schema-2 mapping whose file another Room has since replaced…", "an older journal's release, recovered after another Room replaced the credential…" |
| P2 Lock age is not evidence that its holder stopped | See below | "an old lock held by a live command is never taken…", "a holder that crashed is recovered…", "a live holder in another process is waited for, and named, never removed", "a holder that lost its lock writes nothing, and never removes the lock that replaced it", "a lock from another host, or a recovery left by a crashed recoverer, is named for the user, not removed" |

**The destination lock.** `owner.lock` is created exclusively (`O_EXCL`)
and holds its holder's process ID, host name and a random token. Age is
never evidence:
- A command waits for a live holder, however old its lock, and after ten
  seconds says which process holds it.
- A lock is recovered only when its holder is provably gone: it is on this
  host, and no process has its ID (`kill(pid, 0)` fails with `ESRCH`).
  Recoverers are serialised by a second exclusive file,
  `owner.lock.break`. While holding it, a recoverer re-reads the lock, and
  removes it only if it still holds the dead holder's token. Nobody else
  can change the lock in that window: a successor can create it only
  after it is gone.
- A lock is removed only by the holder whose token it holds, never a
  successor's. The holder checks it still holds the lock before each owner
  write, and writes nothing if it does not.
- A lock from another host, or a recovery file left by a recoverer that
  itself crashed, is not removed automatically. The error names the file
  for the user to remove.

Node has no portable OS file lock (`flock`), so this protocol is the
simplest sound choice: it never relies on elapsed time.

## Review 7040317d

The checker's eighth review confirmed the review 4758945b fixes, and asked
for two recovery gaps to be closed. `packages/cli/test/review-7040317d.test.ts`
names each case. The checker's diagnostic now fails on each of its four
defect assertions.

| Finding | Change | Tests |
|---|---|---|
| P2 Keep every unsettled installation's evidence | The owner record (version 3) keeps a list, `pending`, of installations that recorded themselves before replacing the file and have not been settled. A later installer adds itself and never drops an earlier entry. Only a completed replacement of the file settles them all: their credentials, if ever written, are then provably gone. A release settles only its own lane's entries. A version-2 record's single `installing` party is read as pending | "lanes: Y writes but is never mapped, then Z stops before writing; releasing Y removes Y's credential", "Rooms: …Room A's release removes Y", "a completed later installation settles the earlier ones; the successor's file is then left by Y's release", "an owner record written with the single installing slot of version 2 keeps that party as pending" |
| P2 Bound waiting for an occupied recovery lock | Every unsuccessful attempt to take or recover the lock now waits briefly and counts against one deadline (ten seconds). At the deadline the error names what is in the way: a live holder, another host's lock, an empty lock, a live recoverer, another host's or an empty recovery file, or one left by a crashed recoverer. Neither age nor an unreadable record removes a file. The tests run the lock in a child process that is killed after five seconds, so a regression that spins fails instead of hanging | "a recovery file held by a live recoverer is waited on, then named…", "a recovery file from another host is named for manual action…", "an empty recovery file (a crash between creating and writing it) is named…", "an empty lock file is waited on, then named…", "a recoverer that completes while this command waits lets it acquire the lock" |

## Review c033fb54

The checker's ninth review confirmed the review 7040317d fixes and asked
for one more change. `packages/cli/test/review-c033fb54.test.ts` names
each case, and the checker's diagnostic now fails on its defect assertion.

| Finding | Change | Tests |
|---|---|---|
| P2 Keep the cleanup duty when a credential file's mark is unreadable | One evidence rule now decides when a release may forget an owned installation, whether it is in the owner record's `installed` or `pending`, or in the Room's mapping. The installation is settled only if its credential was removed now, the file is gone, or the file provably names another installation. An unreadable mark proves none of these. In that case the release prints the manual step and keeps the evidence, which is the persistent duty. Its reservation is cancelled independently. The duty is settled later when the user removes the file and the same command finishes, or when another installation completes and replaces the file | "unmapped pending: the release names the manual step and keeps the pending entry…", "installed and mapped: the release keeps both the installed record and the mapping", "interrupted and retried: the duty is kept until the user removes the file, and then settled", "the reservation is cancelled independently, and a successor's completed installation settles the kept duty" |

