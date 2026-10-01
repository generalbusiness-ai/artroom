# Does revoking or expiring an Artifacts token stop a push in flight?

2026-10-01. Lane B (request: the git package and the publisher container),
condition 7. Plan section 8, acceptance case "token revocation or expiry
during an in-flight push"; protocol rules R-PUB-2 and R-PUB-6.

## Summary

- **A push still sending its body was refused** when its token was revoked,
  or expired, before the body finished. This held even when the token was
  valid when the push request started (cases A, B and C).
- **A push whose body had already been sent was accepted**, although its
  token was revoked at that moment (case E, 5 of 5 runs). In 3 of those
  runs the revoke call had already returned before the push's answer
  arrived.
- So revocation narrows the window in which an old push can land, but does
  not close it. **Revocation and expiry are not terminal evidence** that a
  push did not and cannot land. The rule stands: nothing is released on
  elapsed time or token state; only reading main back decides (R-PUB-2,
  R-PUB-5, R-PUB-6).

## How we measured

Script: [packages/git/measure/token-inflight.mjs](../packages/git/measure/token-inflight.mjs).
Raw results, with tokens redacted:
[token-inflight-2026-10-01T17-50-26-760Z.json](../packages/git/measure/results/token-inflight-2026-10-01T17-50-26-760Z.json)
(cases A0 to D) and
[token-inflight-2026-10-01T17-57-54-534Z.json](../packages/git/measure/results/token-inflight-2026-10-01T17-57-54-534Z.json)
(case E, five runs).

- **Where:** a laptop in the New York area, git 2.54.0, against a new repo in
  the `gitseq-spike` Artifacts namespace. Each run made its own repo and
  deleted it afterwards.
- **The push:** `git push --porcelain` of a new branch whose commit adds a
  2 MiB random file. git sends this as three requests: discovery
  (`GET info/refs`), a 4-byte authentication probe (`POST`), and the push
  body (`POST git-receive-pack`).
- **The proxy:** git pushed through a proxy on the laptop. The proxy added
  the token, so git never held it. It could hold the push-body request
  before forwarding it, and throttle the body's upload. That is how a push
  was made to start with a valid token and finish later.
- **Tokens:** each case minted a write token through the REST API, with a
  lifetime of 60 s or 600 s. Revocation used `DELETE /tokens/{id}`.
- **The result:** after each push, a fresh read token listed the repo's refs.
  "Accepted" means the new branch existed at the pushed commit.
- **Body sizes:** cases A0 to D ran in one repo, one after another. A push
  that was refused left its objects unsent, so each later case also sent the
  earlier cases' files: the bodies were 2.1, 4.2, 6.3, 8.4 and 10.5 MB.

## Results

Times are seconds after the token was minted.

| Case | What happened to the token | Push body sent (start → end) | Answer | Ref accepted |
|---|---|---|---|---|
| A0 | Revoked at 8.5, while the push body was held before sending | 11.2 → 11.6 | 403 at 11.8 | No |
| A | Revoked at 10.4, while the body was uploading (600 s token) | 0.3 → 105.3 | 403 at 106.0 | No |
| B | Expired at 60, while the body was uploading | 0.3 → 252.4 | 403 at 252.8 | No |
| C | Expired at 60; the body started at 55, 5 s before expiry | 55.0 → 175.4 | 403 at 175.7 | No |
| D (control) | Valid throughout (600 s token), same throttle | 0.6 → 151.4 | 200 at 153.3 | Yes |
| E (5 runs) | Revoked at the moment the last body byte was sent; the revoke call returned 0.3 to 0.7 s later | about 0.3 → 5.8 | 200, 0.4 to 0.6 s after the body | Yes, 5 of 5 |

In case E, the revoke call returned before the push's answer in 3 runs
(revoke returned at 6.2, 6.2 and 6.1; answers at 6.4, 6.4 and 6.2), at the
same tenth of a second in 1 run, and after it in 1 run.

In every refused case:
- the probe request had already succeeded with the same token;
- Artifacts answered 403 only after the whole body had arrived;
- git exited with `error: RPC failed; HTTP 403 … send-pack: unexpected
  disconnect … the remote end hung up unexpectedly`. The landing engine's
  push classifier reads this as `unknown`, not as a refusal, because git
  reports it after sending.

## What this means for Artroom

1. **No terminal evidence from tokens.** We found no point after which a
   revoked or expired token guarantees that an earlier push cannot land.
   Case E shows a push accepted after its token's revocation had been
   confirmed to the caller. So the publication slot is still released only
   by `landed` (main read back equals the integration) or `aborted`, and
   `aborted` needs every push attempt to have ended with an outcome that
   shows it was not applied (R-PUB-6, R-REV-5).
2. **The abort attempt still helps.** Revoking the publication token after
   a `compromised` revocation (R-REV-5) stops a push that is still uploading.
   That is the slow case, which is the one most likely to be in flight.
3. **Short tokens limit upload time, not just exposure.** A push whose body
   takes longer than the token's remaining life is refused (cases B and C).
   The publication push carries almost nothing, because the integration
   commit is already stored in the canonical repo during preparation, so
   60 s is ample. Pinning copies a lane's objects and can be large, so the
   package gives pinning tokens a longer lifetime (10 minutes). The gateway
   still allows a pinning token only to create its own refs.
4. **A 403 after sending looked like a clean refusal every time** (4 of 4
   refused cases left the ref unchanged). We still do not treat it as
   proof, because we cannot see inside the receiver. The engine reads main
   back.

## Limits of this measurement

- One client location, one git version, one repo size range (2 to 10 MB),
  and a throttle we imposed on the client side. We did not throttle or pause
  the receiver itself.
- We cannot observe when Artifacts checks the token relative to applying
  the ref update. The results fit "checked after the body is received", but
  other designs fit them too.
- Case E ran 5 times. A race at that boundary can come out differently on
  another day; the design does not depend on which way it goes.
- Artifacts documents revocation, but not what it does to operations in
  progress. A documented guarantee would supersede this note.
