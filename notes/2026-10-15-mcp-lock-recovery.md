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
and documentation; no test is added to mirror those words. Its gate head,
tree and terminal outcome will accompany the final review artifact.
No GitHub push or Cloudflare deployment runs here.
