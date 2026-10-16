# D1 push-mint standing preparation

Source request `83bbbd40`, promise `04ce3234`, under NOW `e0292346`.
The accepted boundary is directory-partition design section 4.10 in
`notes/2026-10-15-directory-partitions.md`. This is a preparation checkpoint,
not implemented D1, a new cohort activation or a handoff claim.

At base main `5d32a7de`, the mint outcome rule records a token and moves a
reserved push to publishing (`packages/platform/src/destination.ts:1879`).
It makes no fresh publication-key standing observation. A late mint whose
target or served attempt is closed instead opens token revocation at line
1896. That cleanup must remain possible without a new key read.

The reservation judge names the merger and counted verdict/check keys in
its observation rows (lines 465 and 470; subjects at 1569). The reserved
publication holds `reservedAt`; the `abort-if-behind` rule already reads the
reservation's key observations and mutually excludes another abort with
`aborting` (line 1749). D1 should reuse that native record and gate only an
attempt that can still use the confirmed push mint. At most nine keys need
fresh observations in the proposed ten-second, once-only row. Missing or
unreadable standing must leave the outcome unwritten; inactive standing
must set aborting and reserve cleanup, with no token slot for a push.

Current `@4` publication holds include 10 mints, 10 revokes and three
reads (line 546, extending the base holder at 217). The mint's declared
outcome operations currently include only revoke (line 570); its rule's
maximum is eight effects, one request and one operation (line 2372).
D1 needs the declared deciding read and a two-operation maximum. Its full
budget witness must prove the mutually exclusive abort read/revoke fits
that holder or raise the new version's counts by one, as the design allows.
The existing scope-full refusal remains the ordinary capacity boundary;
a genuinely reserved settlement must still complete there.

Two version-specific details need the pending technical decision `9e191be2`.
First, `readFor()` at line 1234 handles an abort delivery or a write outcome;
a deciding read opened by a mint outcome currently has no target. D1 needs
the exact mint/served-write/holder route, preserving old versions. Second,
file publications set `reservedAt` in `fileJudge()` at line 2624, but their
reservation outcomes do not carry the regular review-backed publication's
merger/verdict/check key observations. Missing evidence is not vacuous
active standing. Advice must set the discriminator before dependent Source.
The correction to the initial slot diagnosis is recorded in `f13b073e`.

A new explicit destination version is proposed, leaving existing definition
bytes, default founding pins and histories unchanged. Current NEWEST remains
`platform:destination@3`; application publication uses its explicit `@4`
cohort. Nine helper compatibility checks list `@3`/`@4` explicitly; these
need deliberate new-version coverage, without changing old-version paths.
No partition activates and no provider credential, Git write, remote push
or deployment runs in this slice. No tests or gate are claimed yet.
