# Aged accepted claim recovery preparation

Existing request `484` / producer `3501`, checker finding `03f3e245`.
Prepared separately from combined candidate
`2b6a5529298713a11f5495e07198a558b54f4ee4` on
`request/i5-clone-claim-repair`.

The claim command required the register's summary before settling any saved
accepted claim. After the operator's recorded register signatures pass the
signed-read window, that summary is forbidden. A membership session does
not authorize register summary either. This stopped an already enrolled
claim before it could use its recoverable accepted receipts.

A saved accepted found now selects the supported register pin through its
checked settlement receipt. Before that call, the saved envelope's
signature, signing key, kind, full register reference, intent digest,
founder handle and accepted fact form/reference are checked. The read-only
settlement must return that exact full fact and intent; its definition must
be an exact supported register name with supported directory/sibling
mappings. The receipt is reused for the existing accepted-step check, not
settled twice. A mismatching fact, unavailable settlement or unknown pin
remains a refusal with the original pending data preserved.

This uses the existing settlement boundary: the service checks the exact
signed envelope, scope/incarnation and recorded actor/idempotency/intent,
then answers the accepted receipt without judging a new time or grant or
starting a mutation turn. It does not trust a cached definition, fall back
to NEWEST, widen summary/session permissions, re-sign a request or refresh
its deadline. New, uncertain and digest-only discovery keeps its existing
read path; this repair does not invent aged authorization for a legacy
record missing its original envelope and accepted evidence. Historical
bundle/admission correspondence remains a separate evidence obligation.

The existing loss/restart claim scenario is strengthened. Its actual
accepted found/seat/first-key receipts produce a complete pending snapshot;
restoring that snapshot scripts a local interruption before final config
publication. The scripted clock advances beyond the 900-second register
signature window and the real register/membership objects restart. Fresh
signed register summary and membership-session register summary both remain
forbidden. Recovery succeeds with the original envelopes, no extra
found/seat/first-key POST, two previously requested founds and one admitted
seat/key. The same scenario rejects a matching receipt whose pin is changed
to unsupported `platform:register@99`. Earlier mismatching accepted-fact,
unavailable-settlement and room-splice witnesses remain in this scenario.

The scopes, settlement receipts, sessions and guarded enrollment are real
in the PLATFORM test namespace. MemoryStore/local interruption, HTTP reply
loss, the Git host, scheduler and clock are labelled stand-ins. No live Git
provider, credential file or fresh-person workflow is proved.

Focused retained checks:

- `npm run typecheck --workspace @generalbusiness/artroom-cli`:
  `/tmp/artroom-clone-claim-typecheck.log`; all three CLI TypeScript
  configurations passed.
- `npx --no-install vitest run --project scope cli/test/claim`:
  `/tmp/artroom-clone-claim-focused.log`; one file, one scenario passed,
  duration 1.36 seconds.
- One manual control adds `await summaryOf(R)` unconditionally before saved
  claim selection, then runs that same focused scenario. It fails the aged
  recovery exit-code assertion, expected 0 and received 1. Output:
  `/tmp/artroom-clone-claim-control.log`; raw Vitest JSON:
  `/tmp/artroom-clone-claim-control-result.json`. Source was restored.
- Ordinary locked product dependencies were installed by `npm ci`, with
  output `/tmp/artroom-clone-claim-install.log`. No tool probe or package
  manifest/lock change was made.

Initial typecheck failures during rearrangement were nullable closure
captures and a test's optional clock argument; both were corrected before
the final successful checks. No repository gate, provider call or deployment
was run. Root review and the selected integrated candidate's gate remain
pending; this preparation is not source approval or a landing receipt.
