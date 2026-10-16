# Counting commitments: deployed stage and device setup

This stage targets C1 `counting-commitments`, pin
`sha256:b55824346382d9b158be4cadd9d098008f8129147fba772537778e2f738d5271`,
and the explicit M1 cohort register@6, directory@6, membership@5, rules@3,
destination@2 and inbox@1. The old C0 declaration and pin remain shipped;
this stage does not migrate old applications or private scope journals.

The production Worker serves `/counting/`, `/counting/counting.js` and
`/counting/counting.css` on the same origin as its native scope API. Build
its three public assets before compiling or deploying the Worker:

```sh
node apps/counter/scripts/assets.mjs
```

The builder writes `apps/counter/browser-build/` and the committed
`apps/counter/src/counting-assets.ts`. The asset witness compares a fresh
write-free build with the committed module. The deployment includes no fake
preview, keys, sessions or recorded fixture data. `preview.html` remains an
explicit local fake transport/session/scope/speech/clock QA surface. It is
not served by the production route and proves no native or audible outcome.

## Establish and enroll before connecting

The operator uses the explicit Counting cohort for install planning, then
pins the actual register in the configured Git host, installs the retained
plan and establishes the actual C1 application through the native factory.
The activated declaration, complete closure, native creator's opener,
membership and application full references must be verified. The factory
supplies no counting domain grant by implication. Configure the fourteen
C1 acts under the actual membership policy, with controller and agent grants
separate. Preserve ordinary pending install/enrollment envelopes.

Each runner uses its own independently enrolled member/device key. An agent
member is added as kind `agent`, then receives an agent-key invitation and
its native enrollment; a person with a role named agent is not equivalent.
The application controller initializes the paused board. Participation is
initially inactive; a device chooses a usable voice and activates. Start
opens claims without selecting a speaker. Eligible active devices may commit
the next number; native fairness and the complete ordered active basis
choose which single pledge is admitted, not a browser round robin.

Hugh authorized remembered demo signing keys on 11 October 2026 at 21:15
Eastern. Import one JSON file with `v: 1` and an `identities` list containing
Ada, Beau and Cleo. Each entry has `name`, `binding` and a base64url `seed`.
The seed-containing file is private. Existing separate public-binding and
32-byte or base64url key files remain accepted through Setup help.

Import verifies each public key, imports its seed immediately as a
non-extractable WebCrypto Ed25519 signing key, and clears mutable input and
key buffers. Origin-private IndexedDB keeps only CryptoKey objects and
closed public bindings, in a separate devices store. Remember my choice
keeps the chosen identity and voice. Returning reconnects that identity
without arming sound or joining automatically. API nonextractability
prevents key export; it does not guarantee encrypted or hardware storage
or prevent malicious same-origin code from using the key. Immutable JSON
strings cannot be securely erased. No seed or session token belongs in a
URL, log, screenshot, IndexedDB or shared Page Settings.

Forget this device disconnects and clears remembered credentials and
choice, including notification to other mounted Counter tabs. It leaves
pending commands, audio starts and original reports intact. Exact reimport
can recover those records; Forget never makes their outcomes known.
The public binding has origin, deployment, full lane scope,
application definition, full membership, complete MemberRef, publicKey and
cohort `{directory:"platform:directory@6",membership:"platform:membership@5",
rules:"platform:rules@3",destination:"platform:destination@2"}`. Use actual
native output, never symbolic identifiers. Production Connect requires the
current origin. An authenticated read is not an act grant.

## Pledge, audio and fulfillment are different events

Join is an explicit gesture after choosing an available English (US)
voice. It connects, participates if needed, activates the own participant
and arms that voice under existing guards. Partial completion is shown
plainly. Leave disarms locally before guarded deactivation; a live pledge
or unknown request can prevent native deactivation and remains recoverable.
Voice availability is checked again before playback; no fallback voice
is substituted. A joined active runner may
propose a commitment; an unknown commit stays silent. Only a fresh complete
authorized view of that device's current admitted pledge starts local speech.
The UI distinguishes the promised number from the last fulfilled number.
The native 30-second deadline belongs to the accepted pledge. Its board timer
expires before the promise timer; both must settle before another commitment.
Reset requires paused or finished without a live pledge. It preserves roster
and the native journal and does not resolve private unknown requests.

Before any sound, one random audio ID and the full identity/turn/voice/start
time are committed and read back in the existing private voice slot under its
Web Lock. Missing locking, storage or exact readback blocks audio. Interrupted
starts remain uncertain and never replay automatically. After actual completion,
the marker stays with the exact signed Fulfill report. The native scope alone
advances lastNumber. Error/cancel/context changes fence callbacks before
cancellation; resolve a failed or uncertain pledge without reporting completion.

Before a report or control POST, the exact whole envelope is privately saved,
then marked inflight and read back before dispatch. Unknown commit, fulfillment
or control outcomes retain that original request, block fresh signatures and
never trigger another sound. Check is read-only and follows the exact original
native receipt and signed entry. Explicit Resume is only a definitely-unsent
first dispatch under a current captured context. A returned phase or a newer
head is not settlement. Known-refused correction preserves the completed audio,
all previous refused envelopes and judgments; it never speaks again. Malformed,
legacy, inflight and unknown histories remain blocked and intact.

Private custody keeps at most eight attempts per completion, 64 KiB per record
and 32 total active/archive slots. Original C0 slots still count; no silent
eviction occurs. A current confirmed native outcome can archive resolved history
atomically. An interrupted audio-only marker can be archived intact only after
a fresh authorized native view proves its pledge is no longer live, using the
explicit Check action; a new explicit Join is then required. This is origin-
private application custody, not encrypted OS storage. Deploy trusted code under
the route's self-only CSP.

## Evidence still required

Tests of the code, with stand-in DOM, speech and transport, are not
evidence of a deployment.
The native C1/M1 witness uses actual factory creation, agent enrollment, grants,
HTTP sessions, contention, all acts, ordered expiry, restart and proven replay;
its Git host answers and clock are labeled stand-ins. Actual deployment must
bind a landed main head, asset hashes, Worker deployment ID and URL. Demonstrate
three independently enrolled actors with distinguishable usable voices, automatic
peer updates, actual local sound, unknown-reply/restart recovery and the final
natural recording. Local browser speech is not audible exactly-once across
crashes/devices or permission to replay an uncertain attempt.

This source is being composed under request `c612acc60c1b02577c7814b8026ad6d398f54023`,
promise `96ce76dbe95b0247193bf7ac5d4df47937915350`, within convergence `e60a3ca5`.
Current build/check/native/browser/deployment outcomes are recorded separately;
this text claims none before they run.
