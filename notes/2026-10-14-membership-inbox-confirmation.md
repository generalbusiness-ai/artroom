# Confirm the membership fixture's inboxes

The original Start gate (session 36494, Source `282bb48`) failed the first
membership authority case: Una's inbox was provisional where the fixture
promised an active, confirmed inbox. The remaining 1,171 tests passed and three
were skipped. The isolated diagnostic run (session 9216, Source `27573780`)
passed both Scope compilers and that one original body, with no failure
checkpoint. It did not reproduce or explain the original failure, and it does
not discharge the failed gate.

This change belongs to request `2585c63d1637f5482e19212cbc72c694d3f471c1`
and promise `306009d767ce5b6a116de531d33dbd1cbca088b9`. It strengthens the
repository test fixture's completion boundary. Generic settlement still stops
when no dispatch is due. The repository fixture additionally checks its actual
inbox creation results and sealed confirmations. When a matching retained
creation duty awaits a retry, it follows that duty's recorded next time only
when the native stored alarm agrees, within four rounds and eight logical
seconds. The stored alarm is a cross-check; the fixture then uses normal
dispatch, rather than invoking the alarm callback. It changes no production
data, authority, history or delivery rule.

One new native case withholds the original confirmation once through the test
transport. Before completion it requires a provisional inbox, an unanswered
original attempt and its recorded backoff, bound to Una's actual full inbox
reference and genesis. After completion it requires the
same genesis and full reference, one sealed confirmation and the acknowledged
original duty. Its control omits only the fixture completion call and must fail
the original active/owner assertion. The original authority body retains its
activation, revocation, freshness, owner and forged-grant checks.

Both Scope compiler configurations and the two selected native bodies passed
in original run `44804` at `f482e391`. Three other collected bodies were
unselected and skipped; this is no whole-file pass claim. The controlled
Native case recorded Una's inbox as provisional, with the exact retained
control unanswered and its next time equal to the stored alarm. Completion
advanced the scripted clock exactly one second to that recorded time. The
inbox then became active with the same genesis and one sealed confirmation.

The omission control in original run `82315` changed only the compiled fixture
completion call. Its selected body failed by the original active/owner
assertion at `membership.test.ts:246`; four other bodies were unselected and
skipped. The original pending-protocol assertions passed first. Physical
Source and dependencies were unchanged before and after the control.

The ordinary review gate runs once at the final composed, committed Source.
Its actual terminal and evidence are supplied separately with the review
request. This note does not predict a gate pass. The deterministic fault
proves a legitimate pending confirmation state; the original gate's cause
remains unknown. No production alarm callback or provider was exercised.
