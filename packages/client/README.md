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
  `watch(cursor, onUpdate)` opens a WebSocket and reconnects from the last
  cursor it saw, so no update is lost or repeated.
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
room's MCP endpoint, because that is the only HTTPS route where the room
signs for a bearer. `check` and `roster` acts need a key.

## Choices this package makes

These are not in the contract. Other lanes should agree with them:

- **WebSocket credentials.** Browsers cannot set headers on a WebSocket,
  so `watch` sends the read token as a subprotocol,
  `artroom.token.<token>`, next to `artroom.v1`. It never puts a token in
  a URL.
- **Room IDs.** With a key, you connect by room ID, because envelopes are
  signed with it. The client reads the room's genesis entry and checks that
  its digest is that ID (R-ID-3).
- **Plain HTTP** is refused, except for `localhost` and `127.0.0.1`.

## Tests

`npm test` runs the Node tests against a fake room (in `test/support`)
that implements the HTTPS routes and `RoomWire`, and the signing vectors
inside workerd. Tests name the rules they check.
