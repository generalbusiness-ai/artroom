# MCP lock recovery

Request `e4917b42` adds operator guidance beside `blockedBy` and in the
MCP custody documentation. It changes no locking behavior.

`alive` treats `process.kill(pid, 0)` returning `EPERM` as a live process.
A PID reused by another user's process can therefore leave an old lock
unreclaimed. `blockedBy` names a reclaim file only if its recorded process
is known to be gone; a null result does not prove that no stale file is
blocking recovery. `takeLock` still refuses an uncertain owner, reclaims
only under an exclusive reclaim lock, rereads the holding and compares
its token. `releaseLock` still removes only its own token's holding.

Recovery guidance requires all processes using the selected config
directory to stop, the original holder to be verified gone, and the exact
unchanged stale file to be identified. An administrator must help if
permissions prevent checking ownership. Only that verified lock or
reclaim file may be removed. All retained custody and archive data stay
in place; uncertainty leaves the lock in place. Restart and check the
original request instead of treating expiry as an outcome.

The source evidence is `packages/mcp/src/node.ts`: `alive`, `readHolding`,
`releaseLock`, `blockedBy` and `takeLock`. The change is one source comment
and documentation; no test is added to mirror those words. Replacing only
the new comment with its predecessor reproduces the complete original
source file byte for byte, confirming executable source is unchanged.

The gate passes at `d00cbc30edd760f273d0c9a0bd97c8edfff54e61`, tree
`35acdcd6a644eacaeccd7f33028dd6a0aa4c7a36`, with no changed files.
Whitespace exits 0 in 0.1 seconds, typecheck exits 0 in 7.6 seconds, and
tests exit 0 in 212.4 seconds. Vitest passes 1,344 tests with 3 skipped;
the Node and Counter browser checks pass 16 and 55 respectively.
This final reporting successor changes only this note; source, tests,
assets, manifests and lock remain equal to the passing gate head, so
the gate is not repeated. No GitHub push or Cloudflare deployment runs here.
