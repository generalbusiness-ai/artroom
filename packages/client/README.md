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
| `intent` | `signedIntent(signer, asked, signing?)`: an intent with a fresh idempotency key and a `notAfter` within the lifetime bound, signed. The intent is a detached copy of what was asked, taken before the signer is awaited, so the value returned is the value signed. `Signer`; `secretSigner(secret)`; `webCryptoSigner()`, over a key that cannot be read; `newIdempotencyKey()`. |
| `handle` | `ScopeHandle`: `submit`, `settle`, the reads `summary`, `items`, `history`, `entry` and `outbox`, `definition`, `followReceipt` and `followDuty`. `found(transport, founding, definition, definitions?)`. `Transport`, `TransportError`. |
| `http` | `httpTransport(service, options?)`: the transport over the service's HTTP routes. `options`: `fetch`, `bytes` and `seconds`. `REPLY_BYTES`, `REPLY_SECONDS`. |
| `binding` | `bindingTransport(service)`: the transport over a service binding to the Worker's entrypoint. |
| `answers` | Not exported. For each operation, whether a reply is one of its answers, and which refusals that operation has. Both transports use it. The guards of the records inside a reply are the bytes package's `records`. |

`Transport` is the contract's `ScopeApi`. The scope Worker's service
entrypoint implements the same interface, and a typechecked file in the
scope package, `test/conformance.types.ts`, stops compiling if either side
drifts from it.

## What a transport returns

A reply from a service is untrusted. A transport returns it only when it is
an answer of its operation. Any other reply is a `TransportError`. So
`{ answer: null }`, an `accepted` with no receipt, or an entry whose effect
has no item is never an outcome.

What is checked:

- `answer` or `ok` is a value the contract names for that operation, and
  the reply has that answer's members and no other.
- A reason is one that operation can give. An act is never refused
  `source-unverified` or `unsupported-definition`; a founding may be.
- Every fixed record the contract defines is one of its variants, with
  each member that variant requires, of its kind, and no other member: a
  receipt, an entry, its input of each type, a signed intent, a grant, a
  message of each class, a send, an effect of each name, a use, a prepared
  result, an attempt, an item with its slots and attribution, a summary, a
  duty, a log page, a retained input, and each reference, seed, digest,
  identifier and timestamp inside them.

What is not read, because the contract leaves it to another owner or to
the application:

- the body of a request or an advisory, and the evidence of an outcome;
- a grant's `within` and `fresh`;
- the value of each field of an intent and of an `index` effect;
- whether a slot's value is a value of the type its definition declares.
  It is checked to be one of the forms a field value can have;
- the text of a stored entry in a log page, and of a retained input. A
  reader hashes and parses those itself.

The check is of shape. It does not verify a signature, and it does not
show that a receipt is of this history: `followReceipt` does that.

## What the HTTP transport takes in, and how long it waits

| Limit | Value | When it is reached |
|---|---|---|
| Raw bytes of one reply | 4 MiB (`REPLY_BYTES`), or `options.bytes` | The body is cancelled at the chunk that passes the limit. Nothing of it is joined, decoded or parsed. |
| One request with its whole reply | 30 seconds (`REPLY_SECONDS`), or `options.seconds` | The request is aborted. |

Both values are temporary. Each case is a `TransportError`. For `found` and
`submit` its message ends: "The outcome of the submitted intent is unknown:
it may have been recorded. The same signed intent may be sent again." For a
read it says that nothing was read. The reader is the bytes package's
`takeBytes` and `within`, which the replay package's source uses too.

The transport over a service binding has no such limit and no deadline: a
call there is a call of the runtime, and its bounds are not set here.

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

Keep the value `signedIntent` returned, and retry with it. It is a copy:
later changes to the object that was passed in, such as a form's fields, do
not reach it, and it is the value the signature covers.

## Following

- `followReceipt(receipt)` reads the entry the receipt names and checks it
  against the whole fact: scope, incarnation, kind, position and hash. The
  hash is computed here. The identity is checked whether or not the hash
  matches. Another incarnation is `wrong-incarnation`; another scope, kind
  or position is `reference-mismatch`; another hash is `hash-mismatch`. In
  each case the receipt is not of this history.
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
