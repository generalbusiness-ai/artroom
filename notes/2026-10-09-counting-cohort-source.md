# Explicit bounded Counting cohort: source preparation

9 October 2026. Source under M1 request
`04f7e14e31da28f4a912fb2481b477d87264c106`, promise
`3181024a92cf8bf556f1e3b3b0ea100d2e4bed0e`, with source handoff
`84010d7eef7c55a9f24f1c4aa0f28dd9b2ce74cb`. The predecessor is the complete
F1/C0 integration `bb5bf627d6f3765623df45117299953c546a99ee`.
No validator, pin generation, compiler, test, native run or gate has run for
this source. Review, ordinary landing and actual product acceptance remain owed.

The proposed explicit cohort is register@6 → directory@6 → membership@5,
rules@3, destination@2 and inbox@1. Directory@6 keeps F1's generic recorded
application creation, bounded values, complete static declaration closure,
verified opener/membership and versioned native creation context. Membership@5
clones the existing declaration with member max 16 and key max 32. Its native
states and invitation, recovery, key and role rules are unchanged. Authority
and session issuance recognize exactly the new membership pin.

All old declaration data and existing explicit F1 pins remain. NEWEST still
selects register/directory/destination@3, membership/rules@2 and inbox@1.
The historical REGISTER constant stays @2. The new directory@6 and membership@5
canonical data digests are pending owner-released validation/generation;
the complete version-byte equality witness is retained and must be bound
before claiming it passes. Register@6 reuses the unchanged register data.

`--cohort counting-commitments` is a closed source-level option for install,
install --plan and install --planned. It selects the exact reserved cohort,
not a newest alias. Ordinary no-option installs keep their existing behavior.
Selected direct installs persist the existing complete plan, then its exact
attempt marker, and read both back before any POST. No new store, lock,
onboarding journal or cohort config field is introduced.

A retained Counting plan cannot change cohort, service, host or namespace.
Conflicting supplied values refuse before key reads, signing, saves or POST.
Omitted host/namespace reuse the original values. A matching --plan returns
the original plan; delivery restores the original signed request, pin and
seed. --planned uses saved service/host/namespace and optionally checks the
selected cohort. The existing definitely-unsent legacy replacement case remains.
Unknown attempts and accepted acknowledgements keep their existing recovery
and configured-service trust qualifications; they are not independent history
proof. Mutable config still has no multi-process compare-and-swap or lock.

Invited members count toward the 16 native live member rows, including the
founder. A member invitation does not reserve a future key slot. Join changes
that member but opens a key and can be refused at the 32-key limit. Pending
key invitations count toward that limit; enrol changes the reserved row.
Lapsed/removed members and lapsed/revoked keys release live slots, not history.
Member removal leaves active key rows counted until separately revoked.
Counting activity is distinct from native membership capacity.

The native taxonomy remains: invite-member/join records a person even when
the selected role is agent. A native agent-kind member uses add-member with
its controller, followed by invite-key/enrol. Agents keep independent keys.
Counting domain actions require separate authorized set-actions setup;
the factory and cohort option grant none implicitly. Existing 300-second
observation and 600-second session qualifications remain.

The authored CLI witnesses use a fake service and memory store. The platform
witness uses actual declarations/common admission with scripted counts.
They are unrun and supply no native concurrency, capacity, enrollment, session,
provider or deployment proof. Exact later native admission/provenance/replay,
C1 integration, shared invitations, independent browser/local/remote sound,
full storage bounds, the final gate and full Source acceptance remain open.
