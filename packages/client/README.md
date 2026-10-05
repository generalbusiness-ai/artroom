# @generalbusiness/artroom-client

A client for an Artroom scope service: build and sign an intent, hold a
typed handle on one scope, and hold a handle whose act kinds and fields are
typed from a declared definition. It runs under Node, Workers and browsers.

It depends on the contract's types and on the bytes package, and on nothing
else. It derives no judgment. What a caller may do in a scope it learns by
reading the scope's summary and its published definition.

The scope and replay contract is the authority, in its sections 2.1, 4.2,
9.1 and 11.5. Where the contract was silent,
`notes/2026-10-04-i1-contract-deltas.md` records what was implemented, in
its section "Client", and `notes/2026-10-05-i2-contract-deltas.md` in its
entries DJ1, DJ7 and DJ23 to DJ25.

## What it exports

| Module | Holds |
|---|---|
| `intent` | `signedIntent(signer, asked, signing?)`: an intent with a fresh idempotency key and a `notAfter` within the lifetime bound, signed. The intent is a detached copy of what was asked, taken before the signer is awaited, so the value returned is the value signed. `Signer`; `secretSigner(secret)`; `webCryptoSigner()`, over a key that cannot be read; `newIdempotencyKey()`. |
| `handle` | `ScopeHandle`: `submit(signed, grants?, beside?)`, `settle`, the reads `summary`, `items`, `history`, `entry` and `outbox`, `definition`, `text(digest)`, `followReceipt` and `followDuty`. `found(transport, founding, definition, definitions?, reader?, beside?)`. `Transport`, `TransportError`. |
| `declared` | `declaredHandle(scope, definition)`: a `DeclaredHandle` typed from the definition's own data, or a refusal when the scope publishes another definition. `DeclaredHandle`: `intent(signer, kind, asked, signing?)` and `submit(signed, grants?, beside?)`. `ShapeError`. The types `Kind`, `AskedOf`, `ValueOf`, `Members`, `Signed` and `Declared`. The section "A handle from a declared definition" below says what it checks. |
| `http` | `httpTransport(service, options?)`: the transport over the service's HTTP routes. `options`: `fetch`, `bytes` and `seconds`. `REPLY_BYTES`, `REPLY_SECONDS`. |
| `binding` | `bindingTransport(service)`: the transport over a service binding to the Worker's entrypoint. |
| `answers` | Not exported. For each operation, whether a reply is one of its answers, and which refusals that operation has. Both transports use it. The guards of the records inside a reply are the bytes package's `records`. |

`Transport` is the contract's `ScopeApi`. The scope Worker's service
entrypoint implements the same interface, and a typechecked file in the
scope package, `test/conformance.types.ts`, stops compiling if either side
drifts from it.

## What travels beside an intent

Two things travel beside a signed intent and are not signed. `submit` and
`found` take them as the contract's `Beside`, and both transports carry
them: over HTTP in the same body, over a service binding as one more
argument.

- `texts`: each detached text that a field of the intent names. A field
  whose type says `detached: true` holds the digest of its text, in the
  byte domain `artroom-text-1`, and the scope receives the text beside the
  intent. The scope computes each digest itself, so a text needs no name.
  A text that is not the one a field names is refused `bad-field`.
- `presented`: the facts that the act declares in `presents`, by name.

A retry sends the same signed intent with the same `beside`.
`ScopeHandle.text(digest)` reads a detached text back, and checks it
against the digest. After a redaction the scope holds no bytes under that
digest, and the read is `not-found`.

## A handle from a declared definition

`declaredHandle(scope, definition)` takes a `ScopeHandle` and a definition
value, such as one of the two lane definitions of the lanes package. It
names no lane: any declared definition works, and a value written
`as const` gives the narrowest types.

| Step | What happens |
|---|---|
| `declaredHandle` | It reads the scope's summary, which names the definition the scope pins. It answers `{ ok: true, handle }` only when that name is the digest of the value given. Otherwise it answers `definition-mismatch` with what the scope publishes, or the reason of the read that failed. |
| `handle.intent(signer, kind, asked)` | `kind` is an act kind of the definition, but not its genesis act. `asked` has the act's `fields`, `on` for an act on an existing item, `expected`, and `presented`. The compiler checks all of them against the definition's data. Then, before the signer is asked, each field is checked against its declared type: a text's `max`, an integer's range, an enum's values, a reference's form, a list's `max`, a record's members, no undeclared field and every required one. A value that fails throws `ShapeError`, with the path of the value, and nothing is signed. A detached text is given as the text: the intent holds its digest. It returns `{ signed, beside }`. |
| `handle.submit(signed, grants, beside)` | It submits the three through the `ScopeHandle`. |

The handle checks no guard, no grant and no state, and derives no
judgment. A shape that passes may still be refused: the scope checks every
field again, with its own bounds on a member's handle and on a list, and
then judges the act. In this delivery no production scope runs a
definition that uses a capability record, which both lane definitions do:
a founding under one is answered `unsupported-definition`.

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
| One request with its whole reply | 30 seconds (`REPLY_SECONDS`), or `options.seconds` | The request is aborted. The reader starts no read and keeps no chunk after that, and nothing is decoded or parsed. |

Both values are temporary. Each case is a `TransportError`. For `found` and
`submit` its message ends: "The outcome of the submitted intent is unknown:
it may have been recorded. The same signed intent may be sent again." For a
read it says that nothing was read. The reader is the bytes package's
`takeBytes` and `within`, which the replay package's source uses too. A
`fetch` given in `options` that ignores the abort signal may keep its own
buffers and its connection; the transport cannot stop it.

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
