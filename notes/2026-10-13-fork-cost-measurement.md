# Fork cost measurement, 13 October 2026

Request `d055b98f`, promise `063fb9f5`, [plan 029, item 0](../plans/029-2026-10-11-artifacts-forks.md#0-the-cost-measurement-first).

Cloudflare Artifacts created one scratch repository and one fork in
`artroom-demo`. The fork accepted one further commit. All three write
tokens were revoked, and both repositories were deleted and confirmed
absent. The demo host's own repositories were not changed.

The provider metrics part remains incomplete. The before-fork GraphQL
request returned HTTP 401. The after-fork metrics read was unrun. The
documented dataset exposes no stored-byte field, so storage before and
after is unavailable. This run establishes no storage charging fraction
or monetary cost and does not close the full parent request.

## Repository and measurement boundaries

The exact owned names were `fork-cost-d055-20261013-source` and
`fork-cost-d055-20261013-fork`. The fork call used
`defaultBranchOnly: true` and `readOnly: false`.

The seed reconstructed 12 commits using the rehearsal's actual public
README, guide pages, AGENTS text, and two-file manifest texts. It added
no padding. The history and commit identities were reconstructed, not
copied from the live rehearsal repository. The texts came from
`scripts/demo/rehearse.ts` at SHA-256
`f1cd2c9822d898eaf43ef2df1b239b979a90b49c6d86bc7c360799a75f3e2f90`
and the retained rehearsal file
`/Users/hughpyle/play/artroom-diagnostics/freeze-rehearsal-recipe/run-two/work/site/README.md`
at SHA-256
`18f9f989591ab3c5340fe8b07f88dfbf54a59efc634197517e9f8ffbff80e005`.

These are sums of locally constructed objects, not provider storage
metrics:

| History | Distinct objects | Raw object bytes | Packed bytes |
| --- | ---: | ---: | ---: |
| Seed, 12 commits | 31 | 4,639 | 3,685 |
| Further fork commit | 1 | 252 | 197 |

The seed tree contained `README.md`, `AGENTS.md`, `guide/start.md`,
`guide/concurrent.md`, `guide/branch-one.md`, `guide/branch-two.md`, and
`guide/controlled.md`. The last commit reused already present file and
tree objects. It added only its commit object.

The seed commit was `f137c9e04f2a88108760fc92c30c8d253144ab37`.
The fork's further commit was `e2c53206123e8e6cfaf8ff6eed721979413799be`,
with tree `3ef1585d0894783b670efb0eded8bbfbf44c90ad` and the seed as its
sole parent. Binding `log` returned 13 commits. Its head and the exact
`readCommit` answer matched that hash, tree, and parent.

## Fork availability and binding attempts

The fork call began at `2026-10-13T05:54:48.315Z`. It returned in
2,069 ms. The first `get` ended at `05:54:50.855Z`, and its `info` ended
at `05:54:50.943Z`.

| Availability observation | Upper bound from fork call | Basis |
| --- | ---: | --- |
| First successful `get` | 2.540 s | Sum of consecutive observed fork and get wall times |
| First successful `info` | 2.628 s | Sum of consecutive observed fork, get, and info wall times |

These are observed availability upper bounds, not an exact readiness
transition or server-only latency. The [binding documentation](https://developers.cloudflare.com/artifacts/api/workers-binding/)
says `get` throws while a repository is not ready. It documents status
on `list` summaries. The actual `info` answer had no status field.

Exactly three binding attempts occurred in that original fork window:
one `fork`, one `get`, and one `info`. This is a sum of recorded calls,
not a provider metrics count. The failed helper's `forkWindow: 0`
summary had no completed readiness bound; the three operation rows
provide the count here. Across the four retained original,
inspection, completion, and cleanup results, 33 binding attempts were
recorded. That larger sum includes preflight and recovery reads; it is
not the fork's billable operation count. Git HTTP pushes are separate
from those binding attempts.

## Remaining operations on the same fork

Every time below is an observed caller wall time. The push time includes
HTTP discovery and the one receive-pack POST. It is not a binding call.

| Operation | Wall time, ms | Actual answer shape or confirmation |
| --- | ---: | --- |
| Mint fork write token, requested TTL 900 s | 301 | `id`, `plaintext`, `scope`, `expiresAt`; scope `write` |
| Push one further commit | 479 | HTTP 200, unpack `ok`, exact ref accepted; 197-byte pack |
| `log` | 58 | Array of 13 commit metadata objects |
| `readCommit` | 61 | `hash`, `treeHash`, `parents`, `message`, author and committer objects, authored and committed timestamps |
| Revoke newly minted fork token by ID | 367 | Boolean `true` |
| Revoke initial fork token by ID | 110 | Boolean `true` |
| Revoke initial source token by ID | 99 | Boolean `true` |
| Delete fork by exact name | 2,247 | Boolean `true` |
| Confirm fork absent with complete namespace list | 729 | No matching name, no remaining cursor |
| Delete source by exact name | 2,153 | Boolean `true` |
| Confirm source absent with complete namespace list | 572 | No matching name, no remaining cursor |

Inspection found exactly one initial write token in each owned
repository. Their reported creation times fell within the original
create and fork call windows. The initial tokens were revoked by their
metadata IDs, as `revokeToken(tokenOrId)` permits. No plaintext was
exported. All three revocations returned `true` before either delete.

The original Worker's private token custody stayed alive through the
separate completion and cleanup. Builder stopped its exact process tree
only after reading the successful revocations and both absence proofs.
The original process then ended with code 143. That controlled stop is
not a passed original measurement or a provider cleanup receipt.

## Preserved failures and separate completion

- Startup session `82860` ended with code 1 before measurement dispatch.
  The requested compatibility date, 2026-10-13, exceeded the pinned
  server binary's 2026-10-08 maximum. No repository mutation ran.
- Session `60060` reached only the namespace-list preflight, which
  failed with an unclassified error in 3 ms. No repository or token was
  created. Its separately released cleanup confirmed an empty set of
  duties. The pinned Wrangler Source shows that the supplied `--local`
  disabled the required remote binding. That is Source-derived cause
  evidence; the original exception message was not retained.
- Session `74502` used ordinary `wrangler dev` with the remote binding.
  It created the source, confirmed its seed push, and forked once.
  Successful get and info were followed by the harness's invalid demand
  for an info status field. Its original result remains failed.
- A separate Worker on port 8798 inspected and completed those same
  repositories. It made no further create or fork call. Inspection,
  completion, and cleanup results are distinct from the original result.

The original before-fork GraphQL request's HTTP 401 remains recorded.
No after-fork metrics call, new credential, authentication fallback,
new fork, or repeated measurement was used to replace that failure.

## Recorded commands and evidence

Wrangler 4.147.0 and Node 26.11.1 came from existing pinned caches. The
wrappers ran with working directory `/private/tmp`. They installed no
package in a checkout. The actual Wrangler command for the original
measurement was:

```text
node <pinned-wrangler>/bin/wrangler.js dev --config <startup-three>/wrangler.json --ip 127.0.0.1 --port 8797 --log-level error
```

The completion Worker used the same command with its own config and
port 8798. Neither command added `--local` or `--remote`. The Worker ran
locally; `remote: true` on the Artifacts binding supplied its proxy.

The recorded wrapper invocations were:

```text
node <startup-three>/run.mjs ORIGINAL_RUNNER ORIGINAL_PLAN ORIGINAL_RELEASE
node <same-fork>/run.mjs INSPECT_RUNNER INSPECT_PLAN INSPECT_RELEASE
node <same-fork>/action.mjs complete ACTION INSPECT_PLAN COMPLETE_RELEASE INSPECTION
node <same-fork>/action.mjs cleanup ACTION INSPECT_PLAN CLEANUP_RELEASE INSPECTION
```

`<startup-three>` is
`/Users/hughpyle/play/artroom-diagnostics/fork-cost-d055-startup-three`.
`<same-fork>` is
`/Users/hughpyle/play/artroom-diagnostics/fork-cost-d055-same-fork-completion`.
The executable was `/opt/homebrew/Cellar/node/26.11.1/bin/node`.
`<pinned-wrangler>` is
`/Users/hughpyle/.npm/_npx/d77349f55c2be1c0/node_modules/wrangler`.
These commands describe the completed run; they do not authorize a rerun.

| Digest argument | SHA-256 |
| --- | --- |
| `ORIGINAL_RUNNER` | `b666c59969b0bae8e1750974948d314f7ab9a78c121e7e22098cd4f12afd26d8` |
| `ORIGINAL_PLAN` | `4928542c1d8cd9a18ce3f9ecbe9d2958924a295a68bfb8189648032261f14b63` |
| `ORIGINAL_RELEASE` | `105524e2169716ca4a65517afa37ff966b362d4903830d348ba45f1cf9d29a93` |
| `INSPECT_RUNNER` | `9276019465f9dad8efb8dd9f96561282c07d93bedf9de57ba81165e9557ec137` |
| `INSPECT_PLAN` | `b7caa7a868a940980ec9eb2e9f16f1e124640c7700e6ba9bba5e52dc04dba85c` |
| `INSPECT_RELEASE` | `caf12f6c9b70cab6236f0fd1200e29bd96aa81befffe3332a08c104113c8aae5` |
| `ACTION` | `7a743258c7a3c2f5afd9443a5bcea33803f3b1be9c00b04d29528f4cd8ccdc60` |
| `COMPLETE_RELEASE` | `4346e41efb237101677fee73a1ce9e5949fdddef192499c391e6373108e19d92` |
| `CLEANUP_RELEASE` | `ae76c956144b976a3f682f9e7df98c9b553efe61bcd2c755209eaba2202c68d5` |
| `INSPECTION` | `46edfadbd1b2bf792312096449d6fbbb6b500071f7b6ad26e8ed6196b10e39fa` |

The following single-file public results retain the operation rows.
Their parent directories also contain private material; these references
do not grant permission to traverse those directories.

| Result, relative to the diagnostic directory above | SHA-256 |
| --- | --- |
| `<startup-three>/run-one/public-result.json` | `83e187cd3de23258d626a8e3753bbd19433dc0c3ef6883f0e4833c72b1453443` |
| `<same-fork>/inspect-one/public-result.json` | `46edfadbd1b2bf792312096449d6fbbb6b500071f7b6ad26e8ed6196b10e39fa` |
| `<same-fork>/complete-one/public-result.json` | `c7c2a5ffcbc6bdf859db5ac2f59c5261f664074ba906fe2b87f8478b1016a6d2` |
| `<same-fork>/cleanup-one/public-result.json` | `d9ceb80286cd01f0db9c65db027624c8fa2c1035697e5d58ee777e0d5138e742` |

## Limits still unknown

The [documented metrics](https://developers.cloudflare.com/artifacts/observability/metrics/)
provide adaptive event counts and durations. Those counts are distinct
from locally counted binding calls. Provider event counts before and
after this fork remain unavailable because the metrics read failed.

This run does not establish namespace storage before or after, whether
fork storage is charged in full, partly, or not at all, or its monthly charge. It
also leaves unknown whether a fork can fail after a successful call,
how that failure is reported, whether forks of forks are allowed, fork
ceilings, and concurrent verification's token and request cost.

This note changes no product code, dependency, package metadata, or
lockfile. No new measurement, metric query, test run, or gate accompanied
the note. Full metrics acceptance remains owed under the parent request.
