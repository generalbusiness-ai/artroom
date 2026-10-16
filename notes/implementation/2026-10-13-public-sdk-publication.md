# Public SDK publication outcome

Request `866747797f59321f0a45990322ece90613426370`, promise
`7f4ed533c059495c7075890a59875ebe2c673019`.

All six actual publish commands completed with exit 0. A separate anonymous
readback then verified all six public versions and tarballs against the
original staged artifacts. The coordinated `0.1.0-dev.2` package set is
publicly available. The earlier HTTP 404 and both pre-dispatch stops remain
recorded below. Source review and landing of this delivery record are still
owed before the publication request can close.

## Source and package set

The producer, checker, capture, dry runs, and publishes use the landed main
commit `b5d153498879a8e3efc13c87404b9778654e235b`, tree
`b082cbf59f0d305fa82ab84fb2357caa26d0e1eb`. The lock SHA-256 is
`deaccb9f2453981e692f05dd983b86b2dcd7fbadfb59757ef0a6544d95f11266`.

The selected version is `0.1.0-dev.2`, with public access and the `dev` tag.
The ordered package set is:

1. `@generalbusiness/dap-contract`
2. `@generalbusiness/dap-bytes`
3. `@generalbusiness/dap-client`
4. `@generalbusiness/dap-derive`
5. `@generalbusiness/dap-platform`
6. `@generalbusiness/dap-replay`

Derive includes `.`, `./rule`, and `./testing`. Bytes includes its opt-in,
types-only `./web` declaration. Platform publishes its production root.
Replay publishes its portable library, without a command-line executable.
The [public SDK guide](../../docs/public-sdk-release.md) describes these boundaries.

## Native capture and staged validation

The existing native creation case ran once with recording enabled. Its
original child `native-pid:88290` completed with exit 0. Source and dependency
guards passed before and after the command. Extraction then produced a
96,949-byte capture, SHA-256
`7f2e7fdfebf41aa4911c13e335f5a9cb68d76d952aa1c737380998e9896ee66a`.
The capture contains five complete scope histories, 18 entries, 12 retained
inputs, and 11 verified foreign facts. Native replay is `consistent`, with
zero anchors and zero missing dependencies.

This is local native fixture evidence before scripted lane facts. Recorded
clock, delivery, observation, outside-answer, bounds, and platform-code
trusts remain. The capture does not establish hosted authority or a public
consumer. Only the named public command result and extraction proof were
read for this note. Private capture bytes and log references were not followed.

The first publication run completed eight phases with exit 0: one fresh
six-package producer, one complete staged checker, and six anonymous dry
runs. Before and after guards passed for every phase. The producer manifest
SHA-256 is `8e4c34c2541181359a7b6a5d3b8d801e69cbd67bdadf39e5cd8266a80ef2bcec`.
The checker result SHA-256 is
`b212a77adc7a9abef7a5c51811261f42c50a67f6ade883e516a53e5cfd1945fd`.
These identities come from closed public results. Their nested private paths
were not followed for this note.

## Separate stopped runs and actual publishes

The first run stopped with `private-ownership` before a publish child was
dispatched. Its eight successful phases remain recorded separately.
A routine file-permission correction preceded the continuation, handle
70618. That continuation stopped with `token-schema`, also before any publish
child was dispatched. The credential held a literal token rather than the
assignment syntax that the runner expected.

The corrected literal-token continuation, handle 72565, reused the verified
staged tarballs. It repeated no producer, checker, or dry run. Each of its
six actual publish children completed with exit 0, in the order above.
Every publish passed its before and after guards, without signal, overflow,
or spawn failure. The six publications are separate, non-atomic effects.

The first anonymous read targeted the contract version's registry metadata
and returned HTTP 404. The runner stopped with `registry-status`. In that
original run, the other five metadata reads and all six tarball reads were
unrun. No cache,
propagation, access, or registry cause is inferred from that response.
No publish retry, unpublish, alternate package name, or authenticated probe
was run as part of this continuation.

## Anonymous readback completion

The separate bounded read-only completion, handle 55847, completed with exit
0. It ran the one failed metadata read and the eleven previously unrun reads.
All twelve requests returned HTTP 200 with complete bodies. Before and after
guards passed for every request. No producer, checker, dry run, or actual
publish was repeated. The original 404 result remains unchanged, with no
cause inferred from the later success.

Each public metadata response named the exact package and version. Each
public tarball matched the original stage's byte length, SHA-256, and SHA-512
integrity. These are the verified public artifacts:

| Package | Version | Tarball bytes | SHA-256 | SHA-512 integrity |
|---|---|---:|---|---|
| `@generalbusiness/dap-contract` | `0.1.0-dev.2` | 33,290 | `83e6bc3bfb810752d02dde73b799b4a16fd497795916858fb9a06ee65e8290da` | `sha512-WUAyD0PwcInZf23BaMfqg4NgwjQl2Jvwz4lNUNNXWo7hxG6lyVAO6uonc1uhfHc6jWM2PBXwqpBD3WdnJYbVng==` |
| `@generalbusiness/dap-bytes` | `0.1.0-dev.2` | 31,461 | `06fa11c6ee798bafd0ded47ffaf697096be495571e77dd9a743b055193223906` | `sha512-4tCNPgqwL4Iw1FxL7AtB1WDA+W/HWnucDTltCgZlnpnILH44Fss6Q3qNynhIwv7FSePwYHSAG+B190MWM5ej+g==` |
| `@generalbusiness/dap-client` | `0.1.0-dev.2` | 36,720 | `8fb08a7e27b57be7a14e1214f5f773ed7f751ed5ad27b118e0862aadf8965b9c` | `sha512-KhUT1gDHLPlzT2zP3Q0PVQbsOWDPeV7RgCrhHIbXGXNdaLfhnZ56OZnzdm+oH8fh88PlMYEeQAYiA0xXWtUdGg==` |
| `@generalbusiness/dap-derive` | `0.1.0-dev.2` | 346,737 | `d34018d85cb82c4aa84465199f9024bdded57580fddbf1a129d7d58481961cc7` | `sha512-wZKtEUYnDv+ucSkgTgMgKuIpkj2N5YSEWRuZk0Wilyh967K72dvbvuk0sAm0jqwPXtKul9uA1rxiKc/1Gm/qeg==` |
| `@generalbusiness/dap-platform` | `0.1.0-dev.2` | 143,772 | `0df00b0af9f5a979b389b79c6ad647febb5877e3b885582d5e821983063b1247` | `sha512-LS67I3p7E+P2KxwEcoI0W4aKyKGp3N2LNjnMz6SS9kktiNvmgXCtuiJck5UJNXlIDl2SYEIzkWmQG63Ri/TTMA==` |
| `@generalbusiness/dap-replay` | `0.1.0-dev.2` | 47,263 | `62cdf9a5734ffb0befc29b4bdfaae40518a6b2a3df51ae260ee19ad3caf84f5d` | `sha512-TixCIpSRWxgzexusvvC+21BWsO8xVfgq+KUMthP+Mqn/v3sQjGIZ6Abr9kL5BIMd851qHpn4H3IykDi5pdtL1Q==` |

The readback establishes anonymous availability and exact tarball equality.
A cold registry install, public consumer execution, actual browser execution,
the Counter tutorial, deployed authority, and Jam acceptance remain separate
unproved duties. Jam work remains deferred under planner steering.

## Closed public evidence

Paths below are relative to
`/Users/hughpyle/play/artroom-diagnostics`. Each is an explicitly named public
result. Nested private references remain opaque.

| Result | Path | SHA-256 |
|---|---|---|
| Native command | `sdk-native-bound-b5d153-preparation/native-capture-one/command.public-result.json` | `ecb95533378184f1763404662c7bde78c87c6b1adabc40be9bb65bbf0b842e19` |
| Native extraction | `sdk-native-bound-b5d153-preparation/native-capture-one/native-capture.public-proof.json` | `19b5fc90c3f93de5d8bb9c6da15d3d81ccd2c6f4e8012e20b7797c59b7946f49` |
| Producer, checker, dry runs, first stop | `sdk-publication-bound-b5d153-preparation/publication-one/publication.public-result.json` | `7d83bf71091762e89bbb6047741a8a00b81a9e26e2f5269b0365c46566923446` |
| Token-schema stop | `sdk-publication-missing-phases-preparation/missing-phases-one/publication.public-result.json` | `9b0ab84952e0bd34c5986dc4f296defa58168613ff0845bd70ea64e6ba52afbd` |
| Six publishes and registry stop | `sdk-publication-literal-token-preparation/literal-token-one/publication.public-result.json` | `d700db8899d55a7f2d603e33b20784d6609924d9d9712e3840027cced7ea12ad` |
| Anonymous readback completion | `sdk-publication-readback-preparation/anonymous-readback-one/publication.public-result.json` | `be22938cb3bba5fae8d0d187d734ec22938defd8601abc69bfcab3f22fccb031` |

This Source changes only this note. Executable source, tests, settings,
lockfile, and assets remain identical to the source tree above. No test,
gate, build, producer, registry request, credential read, or publication was
run to prepare the note. The note's commit tree is recorded in its delivery
metadata, separately from the measured source tree.
