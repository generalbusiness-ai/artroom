# @generalbusiness/artroom-bytes

The one implementation of bytes for every Artroom package: canonical JSON,
SHA-256, text encodings, Ed25519, and the six byte domains of the scope
contract (section 2.1). Everything is synchronous and pure, so a scope can
seal an entry inside one storage transaction.

## What it exports

| Module | Holds |
|---|---|
| `canonical` | `canonicalize`, `canonicalBytes`, `parseStrict`, `parseStrictBytes`, `CanonicalError`. |
| `encode` | `hex`; `b64url` and `unb64url` (unpadded base64url); `base32` and `unbase32` (lowercase, unpadded). |
| `hash` | `sha256`, `digestBytes`, `digestOfHash`, `isDigest`. |
| `sign` | `keyIdOf`, `keyIdOfSecret`, `publicKeyOf`, `sign`, `verify`. |
| `domains` | `domainBytes`; `intentDigest`, `signIntent`, `verifySignedIntent`; `seedDigest`, `scopeIdOf`, `newIncarnation`; `entryHash`, `factRefOf`; `messageDigest`, `deliveryCauseDigest`, `definitionDigest`; `isScopeId`, `isIncarnation`. |
| `ids` | The guard of each other identifier the contract names: `isKeyId`, `isMemberId`, `isOperationId`, `isDutyId`, `isPlatformDefinition`, `isScopeKind` with `SCOPE_KINDS`; and `positionOf`, the one reader of a position's decimal text. No other package tests these forms with a pattern of its own. |

The entry `@generalbusiness/artroom-bytes/web` is the declarations of the
Web text coders these sources compile against. A package that needs no
wider library names it in its `tsconfig`.

Every digest and signature is over a domain tag, one newline byte, and the
canonical JSON of one value. No value contains its own digest. An entry's hash
is computed last, and a reference to the entry is built beside it.

## The canonical profile

The output is RFC 8785 canonical JSON. The accepted input is narrower than
RFC 8785, so that one value has exactly one byte form in any language:

- A number must be a safe integer. Negative zero is refused.
- A string must have no lone surrogate.
- Only plain objects and arrays. No `undefined`, and no array hole.
- At most 64 levels deep.

`parseStrict` accepts the same profile and also refuses duplicate keys,
trailing characters and a byte order mark.

## What was reviewed

This package replaces three earlier copies of the canonical code and three of
the signing code. Each was read against RFC 8785, RFC 8032 and the others. One
of each is kept, with the changes below.

Canonical JSON:

| Point | What was found | What this package does |
|---|---|---|
| Number formatting | All three accepted safe integers only and wrote them with `String`. For a safe integer that is the form RFC 8785 requires. | Kept. |
| Key ordering | All three used the default `sort`, which orders by UTF-16 code units, as RFC 8785 requires. | Kept. A test pins the RFC's own example. |
| Lone surrogates | All three refused them, in values and in keys. One used a regular expression and two a loop. | The loop is kept. |
| Duplicate keys | Two copies had a parser, and both refused duplicates after decoding escapes. | Kept. |
| Depth limits | One parser stopped at 64 levels. The other had no limit and overflowed the stack on deep input. No writer had a limit, so a cyclic value overflowed the stack. | Both the parser and the writer stop at 64 levels with `CanonicalError`. |
| `-0` | All three refused it, in the writer and in the parser. | Kept. |
| Non-finite numbers | All three refused them, as not safe integers. | Kept. |
| `undefined` | Two copies refused an `undefined` field. One dropped it without a word. | Refused. An absent field is omitted by the caller. |
| Array holes | All three wrote a hole as nothing, which gave text such as `[1,,2]`. That is not JSON. | Refused. |
| Errors | One parser passed string bodies to `JSON.parse` and could throw `SyntaxError`. | Only `CanonicalError` is thrown. |
| Bytes | No copy parsed bytes. | `parseStrictBytes` refuses malformed UTF-8 and a byte order mark. |

Signing:

| Point | What was found | What this package does |
|---|---|---|
| Key IDs | All three used `key_` and the 43 base64url characters of the 32-byte public key. | Kept. |
| Signing bytes | All three signed the tag, a newline and the canonical bytes. The earlier entry domain signed a hash string instead. | Every domain is over canonical JSON. A scope holds no signing key. |
| Verification | One copy checked with `@noble/curves` and strict RFC 8032 decoding. One used WebCrypto only. One used WebCrypto where the host had it and `@noble/curves` otherwise. Two libraries can disagree on edge cases. | One synchronous check on `@noble/curves` with strict decoding. |
| Malformed input | One copy threw on a malformed key ID and relied on a `catch` further out. | `verify` returns false for a malformed key or signature and never throws. |
| Base64url | Two decoders refused set trailing bits. One, built on `atob`, accepted them, so one signature had several text forms. | Text the encoder would not write is refused. Base32 follows the same rule. |

## How to test

```
npm test --workspace @generalbusiness/artroom-bytes
npm run typecheck --workspace @generalbusiness/artroom-bytes
```
