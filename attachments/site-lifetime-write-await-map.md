# Site lifetime preparation only

No test, native witness, discovery/import run, provider, gate or timeout change.
Scope test typecheck passed. The patch is awaiting root/planner review.

Every shared write is centralized in support/site-fixture-lifetime.ts:
- Constructor explicitly releases any previous Site helper, captures the same clock object/settings, installs unique hold/deaf function anchors and a unique session secret with the existing inspector/session settings.
- active checks released status, original clock identity, both function anchors and the session secret/settings. A foreign Graph hold/deaf reset or new demo secret invalidates the continuation.
- wait checks before invoking an action and after its resolved await. A rejection propagates and the witness finally performs only guarded release; it does not add a clock mutation. This introduces fixture lifetime checks, not native cancellation.
- setHold changes only this still-active owner's hold callback. wire changes only its still-active factories, keeps the original previous value on repeated wiring, and retires replaced Site factories.
- advance is the only clock write. It increments the same object's current reading by a nonnegative duration. The Site witness uses exactly advance(1800), preserving its original expiry step.
- release runs both onTestFinished and finally, once. It restores hold/deaf only by exact installed function identity; session fields only while the unique secret still matches and each value is still the installed value. It restores/deletes only the exact installed factory, never a known retired Site factory.
- Clock cleanup performs NO write/reset/replacement. A legitimate advance remains in place because retained native objects keep the original reference and can have future sealed time floors. This does not promise that unrelated tests cannot themselves rewind that clock.

The actual Site body has all 36 original await expressions guarded. Its CLI fetch callback is also guarded per routed request; scheduler effects/dispatches and all retained reads/alarms/Site calls pass through wait. wire validates before global factory installation. No actual native call or assertion is removed. The new closure wrappers require const R/G for type-safe captured scope references. The previous local wired Set is removed because the helper owns the exact factory map.

The deterministic proposed witness uses that same helper, an existing Gate, a released old continuation and a new real Graph offer. One legitimate one-second advance proves release does not roll back its own reading. After the new offer is frozen with its native 300-second lifetime, releasing the old gate must stop its +1800 advance; native admission must accept the exact offer. The proposed control removes the helper's active guard body, causing that old helper to advance and the exact new offer to expire. It is a lifecycle model, not a forced timeout or reconstruction of 676 ordering. Nothing has executed.

Remaining qualifications: already-started native operations and read-only RPCs are not cancelled by a JS fixture guard. Boolean sessions/constant inspector have no independent tokens; cleanup treats them as belonging to the unique still-owned session secret and preserves changed values. Foreign same-value writes without replacing that secret cannot be attributed by this helper; do not claim universal ownership. Previously installed foreign factory functions are opaque and restored only if still appropriate by current exact-map identity; their lifetime is outside this Site-only retired set. This patch does not solve the A4 cost or RefcountedCanceler cause and does not authorize a gate.
