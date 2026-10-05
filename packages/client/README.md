# @generalbusiness/artroom-client

A client for an Artroom scope service: build and sign an intent, and hold a
typed handle on one scope. It runs under Node, Workers and browsers.

It depends on the contract's types and on the bytes package, and on nothing
else. It derives no judgment. What a caller may do in a scope it learns by
reading the scope's summary and its published definition.

The scope and replay contract is the authority, in its sections 2.1, 4.2,
9.1 and 11.5. Where the contract was silent,
`notes/2026-10-04-i1-contract-deltas.md` records what was implemented, in
its section "Client".

## What it exports

| Module | Holds |
|---|---|
| `intent` | `signedIntent(signer, asked, signing?)`: an intent with a fresh idempotency key and a `notAfter` within the lifetime bound, signed. `Signer`; `secretSigner(secret)`; `webCryptoSigner()`, over a key that cannot be read; `newIdempotencyKey()`. |
| `handle` | `ScopeHandle`: `submit`, `settle`, the reads `summary`, `items`, `history`, `entry` and `outbox`, `definition`, `followReceipt` and `followDuty`. `found(transport, founding, definition, definitions?)`. `Transport`, `TransportError`. |
| `http` | `httpTransport(service, options?)`: the transport over the service's HTTP routes. |
| `binding` | `bindingTransport(service)`: the transport over a service binding to the Worker's entrypoint. |

`Transport` is the contract's `ScopeApi`. The scope Worker's service
entrypoint implements the same interface, and a typechecked file in the
scope package, `test/conformance.types.ts`, stops compiling if either side
drifts from it.

## Retrying

`submit` returns the scope's answer: accepted with a receipt, refused,
unavailable, or mismatch.

- When no answer could be read, `submit` rejects with `TransportError`.
  The act may or may not have been recorded.
- After that, and after an `unavailable` answer, submit the **same signed
  intent** again. Do not sign a new one. If the first was accepted, the
  retry returns the same receipt.
- `settle(signed)` returns the receipt of an accepted act at any later
  time, for the exact signed intent.
- After the intent's `notAfter`, an intent that was not accepted can no
  longer be. Sign a new one.

`submit` does not retry by itself.

## Following

- `followReceipt(receipt)` reads the entry the receipt names and computes
  the entry's hash here. If it is not the hash in the receipt's fact, the
  answer is `hash-mismatch`: the receipt is not of this history.
- `followDuty(duty)` reads the outbox status of one send, by a duty ID
  from a receipt's `sends`: whether it is held, its attempts, its
  acknowledgment, and for a request its result or diagnosis.

## Signers

A `Signer` gives out a key ID and signatures, never a private key.
`webCryptoSigner()` makes a key that WebCrypto keeps and will not export;
it lasts as long as the value is held. `secretSigner(secret)` signs with a
32-byte secret the caller already holds. Both produce signatures that the
bytes package verifies, which is the one check a scope makes.

## What was reviewed from the earlier client

| Earlier module | Outcome |
|---|---|
| `keys.ts` | Its base64url, key IDs and signing bytes are the bytes package's now, and are not kept here. Its check of a signature with WebCrypto is dropped: a signature is judged by one implementation, in the bytes package. Kept in a new form: a signer over a WebCrypto key that cannot be exported, and the fresh idempotency key. Key files (a stored JWK) are left to the command-line client. |
| `canonical.ts` | Not kept. Canonical bytes are the bytes package's. |
| `errors.ts` | Not kept. Its error codes and its redactor belonged to the earlier protocol. The contract's answers are values, and the one error here is `TransportError`. |

## How to test

```
npm test --workspace @generalbusiness/artroom-client
npm run typecheck --workspace @generalbusiness/artroom-client
```

`test/intent.test.ts` shows that an intent signed by the WebCrypto signer
verifies in the bytes package. The handle is tested against the real
Worker, over both transports, in `packages/scope/test/client.test.ts`.
