# @generalbusiness/artroom-client

The typed client for an Artroom. It gives you the contract's `RoomApi`
over HTTPS (`HttpRoom`) and over a Workers service binding (`Room`). The
same code works on both.

It uses only Web APIs (`fetch`, WebCrypto, `WebSocket`), so it runs in
Workers, Node 22 or later, and current browsers.

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

## Finishing an act after a restart

Act methods also take `onPrepared`, which receives the act once it is
resolved and, for a key, signed. Save it. Later, `resubmit({ url }, roomId,
signed)` sends the signed envelope straight back to the room, unchanged.
It needs no handle, read session or new signature, so it works even after
the key is retired or revoked, and the room returns the original result
(R-IDEM-2). It refuses an envelope signed for another room. An unsigned
bearer act is sent again with a connected handle's `replay(act)`, which
needs a valid token (R-CRED-10). The CLI uses both for its journal.

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
