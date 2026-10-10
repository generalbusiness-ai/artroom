# Counting commitments: deployed stage and device setup

This stage targets C1 `counting-commitments`, pin
`sha256:b55824346382d9b158be4cadd9d098008f8129147fba772537778e2f738d5271`,
and the explicit M1 cohort register@6, directory@6, membership@5, rules@3,
destination@2 and inbox@1. The old C0 declaration and pin remain shipped;
this stage does not migrate old applications or private history.

The production Worker serves `/counting/`, `/counting/counting.js` and
`/counting/counting.css` on the same origin as its native scope API. Build
its three public assets before compiling or deploying the Worker:

```sh
node examples/counting/scripts/assets.mjs
```

The builder writes `examples/counting/browser-build/` and the committed
`packages/scope/src/counting-assets.ts`. The asset witness compares a fresh
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
its native enrolment; a person with a role named agent is not equivalent.
The application controller initializes the paused board. Participation is
initially inactive; a device chooses a usable voice and activates. Start
opens claims without selecting a speaker. Eligible active devices may commit
the next number; native fairness and the complete ordered active basis
choose which single pledge is admitted, not a browser round robin.

Connect requires a verified public device-binding JSON and that device's
own local enrolled key file. The key loader accepts the existing owner-only
base64url seed or exactly 32 raw bytes. It reads the key into this device's
memory, verifies its public ID and clears the loader copy. No private key or
session token belongs in a URL, log, screenshot, IndexedDB or shared Page
Settings. The public binding has origin, deployment, full lane scope,
application definition, full membership, complete MemberRef, publicKey and
cohort `{directory:"platform:directory@6",membership:"platform:membership@5",
rules:"platform:rules@3",destination:"platform:destination@2"}`. Use actual
native output, never symbolic identifiers. Production Connect requires the
current origin. An authenticated read is not an act grant.

## Pledge, audio and fulfillment are different events

Arm is explicit per device and usable voice. An armed active runner may
propose a commitment; an unknown commit stays silent. Only a fresh complete
authorized view of that device's current admitted pledge starts local speech.
The UI distinguishes the promised number from the last fulfilled number.
The native 30-second deadline belongs to the accepted pledge. Its board timer
expires before the promise timer; both must settle before another commitment.
Reset requires paused or finished without a live pledge. It preserves roster
and native history and does not resolve private unknown requests.

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
explicit Check action; a new explicit Arm is then required. This is origin-
private application custody, not encrypted OS storage. Deploy trusted code under
the route's self-only CSP.

## Evidence still required

Source and fake DOM/speech/transport witnesses are not deployment evidence.
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
