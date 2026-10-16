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

## Adopted correction and first Source checkpoint

Technical decision `ba12604d` is adopted. D1 covers only a regular
review-backed publication's undecided push attempt. File publications keep
their separate automatic authority journey and are explicitly outside this
guarantee. Closed targets and already decided attempts keep existing late
mint revocation without D1 key reads. The new deciding-read route must bind
the exact @5 mint, served push, holder and abort effect.

The initial reservation alone is insufficient on the reservation-tree
journey: it removes checks from its first policy decision at destination.ts
1500. Later `check-judge` accepts actual result signers at 2455–2472, but the
old passes rows retain only name/job/passed. D1 therefore needs current
accepted checker provenance, replacing it when a job generation is fenced.
It must keep the complete distinct key set, or remain unavailable above
nine; it cannot refresh only the original merger/verdict observations.

The regular publication already uses all 12 native value slots. The plan
uses a versioned record inside @5's existing passes slot: reservation/base
key provenance plus at most 32 current check rows, with actual key, result
fact and accepted own-decision reference. Old versions keep their arrays.
No global value bound rises. Native transitions will capture the metadata;
a request-supplied key list is insufficient.

The first Source helper exposes standing provenance from the actual pure
reservation computation. It uses the same independent-approval and touched
extent counted-member decisions and required check list; the existing
judge keeps its exact result shape. A detailed success without a deciding
fact reports incomplete metadata rather than inventing a proof.

A second helper reads closed current-generation metadata through exact own
references. It binds the reservation, accepted operation/attempt, holder,
full scope/incarnation, membership frame, own hash and passes effect. Each
later check also binds the checked delivery's job/result and exact opening.
It reads at most one reservation, 32 accepted decisions and 32 opening
entries per invocation (65 distinct records), with no history range. It
returns the full set through nine distinct keys; ten refuses without a
partial set. It is not yet called by a mint or a configured @5 cohort.

Twenty-two unchanged reservation/destination cases pass. A new actual pure
reservation case covers independent approvals, required versus optional
checks, missing deciding provenance and touched extents, while preserving
the old result. Three provenance-reader cases pass with explicitly
synthetic native-shaped records and operation metadata. They cover current
versus replaced generations; exact 9/10 keys; missing/ambiguous metadata;
and wrong frame/holder/attempt/accepted effect. They are not native @5
admission or fresh-standing witnesses. The checker-omission control fails
by assertions when the accepted checker's key is removed and restores the
helper. No full gate or Source review is claimed at this checkpoint.

## Versioned admission checkpoint

The implementation now registers explicit `platform:destination@5`. Its
default and application pins remain unchanged. The regular mint row names
the complete set through nine distinct keys and uses a ten-second, once-only
read. Missing, unknown, stale, reused, wrong-incarnation or contradictory
standing writes no mint outcome. Inactive standing sets aborting, opens this
mint's revocation and one deciding read, and installs no credential.

The existing passes slot now contains a closed record. The merger and up
to 64 counted approving facts are separate from at most 32 current check
rows, so no list bound rises. Stored references use closed record shapes,
validated by the provenance reader as full fact references. They are not
foreign fact fields: rewriting those fields would demand all earlier check
bodies again when another generation changes. The native admission step
captures each actual signer/result, and mint checks the exact accepted own
decision, operation, attempt and effect. No new request field supplies keys.

The new holder has four reads rather than three: the three inherited push
reads and the mutually exclusive abort read. It keeps ten revokes. The
mint declares revoke/read and a two-operation maximum. Its read route
checks the confirmed mint's own scope, hash, exact read opening and attempt,
served push and common holder. It returns the target to the inherited
publication decision; an already effective integration can still publish.

Thirteen selected tests pass: eight D1 admission cases, three bounded
provenance cases and two inherited file-publication bounds cases. These
use actual validators, in-memory judges and folding, with scripted creator,
lane, membership/rules and host answers. The actual reservation-tree case
admits staging, check fence, checked delivery and check-judge, captures the
post-reservation checker and aborts when that checker is retired while the
merger remains active. A replacement-generation case drops the previous
signer. Other cases cover active/compromised/unavailable standing, late
settled-attempt and receipt exemptions, the separate automatic file path,
and exact-target mint-abort read discovery of an effective integration.
The initial fixture and metadata-type failures remain failed diagnostics;
the corrected selected run is `/tmp/artroom-d1-current-generation-focus.log`.

Native SQLite/runtime, restart, driver, full-root relay-delay, full holder
capacity, remaining exemption/order controls and the frozen gate are still
owed. This checkpoint is not a Source review, activation or provider proof.
